import { MTX } from 'hsd/lib/primitives';
import { Amount } from 'hsd/lib/ui';
import {translateLocale} from './i18n';

// Validation messages are rendered verbatim by the Send Name and claim screens, and
// this module has no React context, so they are translated locally.
const tr = (key, ...values) => translateLocale(null, null, key, ...values);

export const PAID_NAME_TRANSFER_TYPE = 'bob-paid-name-transfer';
export const PAID_NAME_TRANSFER_VERSION = 1;
const COVENANT_TYPES = {
  NONE: 0,
  FINALIZE: 10,
};

export function parsePaidNameTransferInput(value) {
  const text = `${value || ''}`.trim();
  if (!text) {
    throw new Error(tr('paidTransferPayloadRequiredErr'));
  }

  try {
    const json = JSON.parse(text);
    const txHex = json.tx || json.txHex;
    if (!txHex || typeof txHex !== 'string') {
      throw new Error(tr('paidTransferNoTransactionErr'));
    }

    return {
      txHex,
      payload: json,
      isEnvelope: json.type === PAID_NAME_TRANSFER_TYPE,
    };
  } catch (e) {
    if (!/^[0-9a-fA-F]+$/.test(text)) {
      throw e;
    }

    return {
      txHex: text,
      payload: null,
      isEnvelope: false,
    };
  }
}

export function inspectPaidNameTransfer(txHex, network) {
  const mtx = MTX.decode(Buffer.from(txHex, 'hex'));
  const errors = [];
  const warnings = [];
  const firstOutput = mtx.outputs[0];
  const paymentOutput = mtx.outputs[1];
  const firstInput = mtx.inputs[0];

  if (!firstInput) {
    errors.push(tr('paidTransferMissingInputErr'));
  }

  if (!firstOutput) {
    errors.push(tr('paidTransferMissingFinalizeErr'));
  } else if (firstOutput.covenant.type !== COVENANT_TYPES.FINALIZE) {
    errors.push(tr('paidTransferNotFinalizeErr'));
  }

  if (!paymentOutput) {
    errors.push(tr('paidTransferMissingPaymentErr'));
  } else if (paymentOutput.covenant.type !== COVENANT_TYPES.NONE) {
    errors.push(tr('paidTransferPaymentNotPlainErr'));
  }

  let name = '';
  let nameReceiveAddr = '';
  let fundingAddr = '';
  let price = 0;

  try {
    name = firstOutput.covenant.items[2].toString('ascii');
  } catch (e) {
    errors.push(tr('paidTransferNameReadErr'));
  }

  try {
    nameReceiveAddr = firstOutput.address.toString(network);
  } catch (e) {
    errors.push(tr('paidTransferReceiveAddrReadErr'));
  }

  try {
    fundingAddr = paymentOutput.address.toString(network);
    price = paymentOutput.value;
  } catch (e) {
    errors.push(tr('paidTransferPaymentReadErr'));
  }

  const sellerSignature = firstInput && firstInput.witness && firstInput.witness.items && firstInput.witness.items[0];
  if (sellerSignature && sellerSignature.length) {
    const sighashType = sellerSignature[sellerSignature.length - 1];
    if (sighashType !== 0x84) {
      errors.push(tr('paidTransferSighashErr'));
    }
  } else {
    warnings.push(tr('paidTransferSignatureWarn'));
  }

  return {
    mtx,
    errors,
    warnings,
    name,
    nameReceiveAddr,
    fundingAddr,
    price,
    priceHNS: Amount.fromValue(price).toCoins(),
  };
}

export function buildPaidNameTransferPayload({
  txHex,
  network,
  name,
  buyerAddress,
  sellerPaymentAddress,
  price,
  transferTxHash,
  note,
}) {
  const payload = {
    version: PAID_NAME_TRANSFER_VERSION,
    type: PAID_NAME_TRANSFER_TYPE,
    network,
    name,
    buyerAddress,
    sellerPaymentAddress,
    price,
    priceHNS: Amount.fromValue(price || 0).toCoins(),
    transferTxHash,
    createdAt: new Date().toISOString(),
    tx: txHex,
  };

  if (note) {
    payload.note = note;
  }

  return payload;
}

export function stringifyPaidNameTransferPayload(payload) {
  return JSON.stringify(payload, null, 2);
}
