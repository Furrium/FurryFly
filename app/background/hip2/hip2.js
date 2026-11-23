// Based on:
// - https://github.com/Falci/well-known-wallets-hns/blob/master/lib.js
// - https://github.com/lukeburns/hip2-dane/blob/main/index.js

import isValidAddress from '../../utils/verifyAddress';
import {
  aliasError,
  normalizeHostname,
  parseHNSAddressTXT,
  selectAliasError,
  shouldFallbackToTXT,
} from './alias';
import {collectSecureRecords} from './secure-dns';

const hdns = require('hdns');
const https = require('https');
const bnsTLSA = require('bns/lib/tlsa');
const {codes, types} = require('bns/lib/wire');
const {translateLocale} = require('../../utils/i18n');

// Aliases resolve without React context, but their error messages reach the address
// field, so the codes are translated where they are produced.
const tr = (key, ...values) => translateLocale(null, null, key, ...values);

const MAX_LENGTH = 90;
const HIP2_TIMEOUT_MS = 10000;

const verifyTLSA = async (cert, host) => {
  try {
    const records = await hdns.resolveTLSA(host, 'tcp', 443);
    return hdns.verifyTLSA(records[0], cert.raw);
  } catch (e) {
    if (e.code === 'ENODATA' || e.code === 'ENOTFOUND') {
      throw aliasError(tr('hip2ErrTLSANotFound'), 'ETLSANOTFOUND');
    }

    if (e.code === 'EINSECURE') {
      const name = bnsTLSA.encodeName(host, 'tcp', 443);
      const response = await hdns.resolveRaw(name, types.TLSA);
      const records = await collectSecureRecords(
        response,
        name,
        types.TLSA,
        hdns.resolveRaw,
      );

      if (!records) throw e;
      if (records.length === 0) {
        throw aliasError(tr('hip2ErrTLSANotFound'), 'ETLSANOTFOUND');
      }

      return records.some(record => bnsTLSA.verify(record, cert.raw));
    }

    console.error(e);
    throw e;
  }
};

async function getHIP2Address(host, network) {
  let certificate = undefined;

  return new Promise(async (resolve, reject) => {
    let settled = false;
    let timeout;
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      handler(value);
    };
    const succeed = value => finish(resolve, value);
    const fail = error => finish(reject, error);

    const options = {
      rejectUnauthorized: false,
      lookup: hdns.legacy,
    };

    const req = https.get(`https://${host}/.well-known/wallets/HNS`, options, res => {
      res.setEncoding('utf8');

      let data = '';

      res.on('data', chunk => {
        // undefined = not yet stored
        // null = socket destroyed
        // object = may contain certificate
        if (certificate === undefined) {
          certificate = res.socket.getPeerCertificate(false);
        }

        const newLine = chunk.indexOf('\n');
        if (newLine >= 0) {
          req.destroy();
          chunk = chunk.slice(0, newLine);
        }

        if (data.length + chunk.length > MAX_LENGTH) {
          if (!req.destroyed) {
            req.destroy();
          }
          const error = new Error(tr('hip2ErrResponseTooLarge'));
          error.code = 'ELARGE';
          return fail(error);
        }

        data += chunk;
      })

      res.on('end', async () => {
        try {
          const dane = await verifyTLSA(certificate, host);
          if (!dane) {
            const error = new Error(tr('hip2ErrInvalidDANE'));
            error.code = 'ETLSAMISMATCH';
            return fail(error);
          }

          if (res.statusCode >= 400) {
            const error = new Error(res.statusMessage);
            error.code = res.statusCode;
            return fail(error);
          }

          const addr = data.trim();

          if (!isValidAddress(addr, network)) {
            const error = new Error(tr('hip2ErrInvalidAddress'));
            error.code = 'EINVALID';
            return fail(error);
          }

          return succeed(addr);
        } catch (error) {
          return fail(error);
        }
      });
    });

    timeout = setTimeout(() => {
      const error = new Error(tr('hip2ErrRequestTimeout'));
      error.code = 'ETIMEDOUT';
      req.destroy();
      fail(error);
    }, HIP2_TIMEOUT_MS);

    req.on('error', fail);
    req.end();
  });
}

export async function getTXTAddress(host, network) {
  const response = await hdns.resolveRaw(host, 'TXT');

  if (response.code === codes.NXDOMAIN) {
    throw aliasError(tr('hip2ErrTXTNotFound'), 'ETXTNOTFOUND');
  }

  if (response.code !== codes.NOERROR) {
    throw aliasError(tr('hip2ErrTXTLookupFailed'), 'EDNS');
  }

  const records = await collectSecureRecords(
    response,
    host,
    types.TXT,
    hdns.resolveRaw,
  );

  if (!records) {
    throw aliasError(tr('hip2ErrTXTInsecure'), 'ETXTINSECURE');
  }

  const values = records.map((record) => {
    // bns decodes TXT character-strings as JavaScript strings. Joining the
    // chunks preserves multi-string records without assuming Buffer values.
    return record.data.txt.join('');
  });

  return parseHNSAddressTXT(values, network);
}

export async function getAddress(input, network) {
  const host = normalizeHostname(input);

  try {
    return await getHIP2Address(host, network);
  } catch (error) {
    if (!shouldFallbackToTXT(error)) {
      throw error;
    }

    try {
      return await getTXTAddress(host, network);
    } catch (txtError) {
      throw selectAliasError(error, txtError);
    }
  }
}

export const { setServers } = hdns;
