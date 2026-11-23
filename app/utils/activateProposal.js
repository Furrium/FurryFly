import {IP} from 'binet';
import {Resource} from 'hsd/lib/dns/resource';
import {reviewText} from './reviewText';

const schema = require('../schemas/activate-proposal-v1.schema.json');
const jsonSchemaValidate = require('jsonschema').validate;

export const MAX_ACTIVATE_PROPOSAL_BYTES = 64 * 1024;
export const MAX_RESOURCE_BYTES = 512;

function fail(message) {
  throw new Error(reviewText(null, 'proposalRejected', message));
}

function decodeCanonicalResource(rawHex) {
  const value = String(rawHex || '').toLowerCase();
  if (!/^(?:[0-9a-f]{2})+$/.test(value) || value.length > MAX_RESOURCE_BYTES * 2) {
    fail(reviewText(null, 'proposalInvalidResourceErr'));
  }

  try {
    const resource = Resource.decode(Buffer.from(value, 'hex'));
    if (resource.encode().toString('hex') !== value) {
      fail(reviewText(null, 'proposalUnsupportedWireErr'));
    }
    return {value, json: resource.toJSON()};
  } catch (error) {
    if (/^LearnHNS proposal rejected:/.test(error.message)) throw error;
    fail(reviewText(null, 'proposalDecodeErr', error.message));
  }
}

function assertTarget(proposal, expectedName, expectedNetwork) {
  const target = proposal.target;
  if (target.name !== expectedName) fail(reviewText(null, 'proposalTargetNameErr', target.name, expectedName));
  if (target.network !== expectedNetwork) fail(reviewText(null, 'proposalTargetNetworkErr', target.network, expectedNetwork));
  if (target.publishingLayer !== 'handshake-onchain') {
    fail(reviewText(null, 'proposalOnchainOnlyErr'));
  }
  if (target.name.includes('.')) fail(reviewText(null, 'proposalSingleLabelErr'));
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(target.name)) fail(reviewText(null, 'proposalNotCanonicalNameErr'));
}

function validateOperation(operation, seen) {
  if (operation.op === 'set-address') {
    if (!['SYNTH4', 'SYNTH6'].includes(operation.recordType)) {
      fail(reviewText(null, 'proposalRecordTypeErr', operation.recordType));
    }
    const valid = operation.recordType === 'SYNTH4'
      ? IP.isIPv4String(operation.value)
      : IP.isIPv6String(operation.value);
    if (!valid) fail(reviewText(null, 'proposalInvalidIpErr', operation.recordType));
    const identity = `address:${operation.recordType}`;
    if (seen.has(identity)) fail(reviewText(null, 'proposalDuplicateRecordErr', operation.recordType));
    seen.add(identity);
    return;
  }

  if (operation.op === 'upsert-hnsbio-txt') {
    const identity = `hnsbio:${operation.key}`;
    if (seen.has(identity)) fail(reviewText(null, 'proposalDuplicateTxtErr', operation.key));
    seen.add(identity);
    if (/[\u0000-\u001f\u007f]/.test(operation.value)) fail(reviewText(null, 'proposalControlCharsErr', operation.key));
    if (Buffer.byteLength(`${operation.key}:${operation.value}`, 'utf8') > 255) {
      fail(reviewText(null, 'proposalTxtTooLongErr', operation.key));
    }
    return;
  }

  fail(reviewText(null, 'proposalUnsupportedOpErr', operation.op));
}

function applyOperations(beforeResource, operations) {
  let records = JSON.parse(JSON.stringify(beforeResource.records || []));
  const changes = [];

  for (const operation of operations) {
    if (operation.op === 'set-address') {
      const removed = records.filter((record) => record.type === operation.recordType);
      records = records.filter((record) => record.type !== operation.recordType);
      const added = {type: operation.recordType, address: IP.normalize(operation.value)};
      records.push(added);
      changes.push({operation, before: removed, after: [added]});
      continue;
    }

    const matcher = new RegExp(`^${operation.key}\\s*[:=]`, 'i');
    const removed = records.filter((record) => record.type === 'TXT' && matcher.test((record.txt || []).join('')));
    records = records.filter((record) => record.type !== 'TXT' || !matcher.test((record.txt || []).join('')));
    const added = {type: 'TXT', txt: [`${operation.key}:${operation.value}`]};
    records.push(added);
    changes.push({operation, before: removed, after: [added]});
  }

  return {records, changes};
}

export function parseActivateProposal(input, {
  expectedName,
  expectedNetwork,
  currentResourceHex,
}) {
  const text = Buffer.isBuffer(input) ? input.toString('utf8') : String(input || '');
  if (!text || Buffer.byteLength(text, 'utf8') > MAX_ACTIVATE_PROPOSAL_BYTES) {
    fail(reviewText(null, 'proposalFileSizeErr', String(MAX_ACTIVATE_PROPOSAL_BYTES)));
  }

  let proposal;
  try {
    proposal = JSON.parse(text);
  } catch {
    fail(reviewText(null, 'proposalInvalidJsonErr'));
  }

  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) fail(reviewText(null, 'proposalNotObjectErr'));
  if (proposal.kind !== 'activate-proposal') fail(reviewText(null, 'proposalNotActivateErr'));
  if (proposal.version !== 1) fail(reviewText(null, 'proposalVersionErr', String(proposal.version)));

  const validation = jsonSchemaValidate(proposal, schema);
  if (validation.errors.length) {
    fail(reviewText(null, 'proposalSchemaErr', validation.errors[0].stack));
  }

  assertTarget(proposal, expectedName, expectedNetwork);
  const canonical = decodeCanonicalResource(currentResourceHex);
  if (proposal.canonicalResource.value !== canonical.value) {
    fail(reviewText(null, 'proposalStaleExportErr'));
  }

  const seen = new Set();
  proposal.operations.forEach((operation) => validateOperation(operation, seen));
  const {records, changes} = applyOperations(canonical.json, proposal.operations);

  let finalResource;
  let encoded;
  try {
    finalResource = Resource.fromJSON({records});
    const size = finalResource.getSize(new Map());
    if (size > MAX_RESOURCE_BYTES) {
      fail(reviewText(null, 'proposalResourceTooLargeErr', String(size), String(MAX_RESOURCE_BYTES)));
    }
    encoded = finalResource.encode();
  } catch (error) {
    if (/^LearnHNS proposal rejected:/.test(error.message)) throw error;
    fail(reviewText(null, 'proposalResultInvalidErr', error.message));
  }
  if (encoded.length > MAX_RESOURCE_BYTES) {
    fail(reviewText(null, 'proposalResourceTooLargeErr', String(encoded.length), String(MAX_RESOURCE_BYTES)));
  }

  return {
    proposal,
    canonicalResourceHex: canonical.value,
    resultingResourceHex: encoded.toString('hex'),
    beforeResource: canonical.json,
    afterResource: finalResource.toJSON(),
    changes,
  };
}

export function assertCanonicalStillCurrent(importReview, currentResourceHex) {
  const current = decodeCanonicalResource(currentResourceHex);
  if (!importReview || current.value !== importReview.canonicalResourceHex) {
    fail(reviewText(null, 'proposalStaleImportErr'));
  }
  return true;
}
