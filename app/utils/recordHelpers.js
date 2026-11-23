import { RECORD_TYPE } from '../ducks/names';
import { translateLocale } from './i18n';

// Record validation runs outside React, so the translator is injected. The default keeps
// non-UI callers (tests, scripts) working and renders English rather than a raw key.
const defaultTranslate = (key, ...values) => translateLocale(null, null, key, ...values);

const ipv4Regex = /^(\d{1,3}\.){3,3}\d{1,3}$/;
const ipv6Regex = /^(::)?(((\d{1,3}\.){3}(\d{1,3}){1})?([0-9a-f]){0,4}:{0,2}){1,8}(::)?$/i;

export const isV4Format = ip => ipv4Regex.test(ip);
export const isV6Format = ip => ipv6Regex.test(ip) && !ipv4Regex.test(ip);
export const isHex = str => {
  if (typeof str !== 'string') {
    return false;
  }

  if (str.length & 1)
    return false;

  return /^[A-Fa-f0-9]+$/.test(str);
};

export const validate = (record, t = defaultTranslate) => {
  let errorMessage = '';

  switch (record.type) {
    case RECORD_TYPE.NS:
      if (!record.ns) {
        errorMessage = t('recordErrNsEmpty');
      }
      break;
    case RECORD_TYPE.TXT:
      if (!record.txt[0]) {
        errorMessage = t('recordErrTxtEmpty');
      }
      break;
    case RECORD_TYPE.DS:
      if ((record.keyTag & 0xffff) !== record.keyTag) {
        errorMessage = t('recordErrKeyTagRange');
        break;
      }

      if ((record.algorithm & 0xff) !== record.algorithm) {
        errorMessage = t('recordErrAlgorithmRange');
        break;
      }

      if ((record.digestType & 0xff) !== record.digestType) {
        errorMessage = t('recordErrDigestTypeRange');
        break;
      }

      if (record.digest.length >>> 1 > 255) {
        errorMessage = t('recordErrDigestTooLong');
        break;
      }

      if (!isHex(record.digest)) {
        errorMessage = t('recordErrDigestNotHex');
      }
      break;
    case RECORD_TYPE.GLUE4:
      if (typeof record.ns !== 'string') {
        errorMessage = t('recordErrNsNotString');
        break;
      }

      if (record.ns === '') {
        errorMessage = t('recordErrNsRequired');
        break;
      }

      if (!isV4Format(record.address)) {
        errorMessage = t('recordErrAddressNotV4');
      }
      break;
    case RECORD_TYPE.GLUE6:
      if (typeof record.ns !== 'string') {
        errorMessage = t('recordErrNsNotString');
        break;
      }

      if (!record.ns) {
        errorMessage = t('recordErrNsRequired');
        break;
      }

      if (!isV6Format(record.address)) {
        errorMessage = t('recordErrAddressNotV6');
      }
      break;
    case RECORD_TYPE.SYNTH4:
      if (!isV4Format(record.address)) {
        errorMessage = t('recordErrAddressNotV4Lower');
      }
      break;
    case RECORD_TYPE.SYNTH6:
      if (!isV6Format(record.address)) {
        errorMessage = t('recordErrAddressNotV6');
      }
      break;
    default:
      break;
  }

  return errorMessage;
};

const serializers = {
  [RECORD_TYPE.TXT]: record => record.txt[0],
  [RECORD_TYPE.NS]: record => record.ns,
  [RECORD_TYPE.DS]: record => `${record.keyTag} ${record.algorithm} ${record.digestType} ${record.digest}`,
  [RECORD_TYPE.GLUE4]: record => `${record.ns} ${record.address}`,
  [RECORD_TYPE.GLUE6]: record => `${record.ns} ${record.address}`,
  [RECORD_TYPE.SYNTH4]: record => record.address,
  [RECORD_TYPE.SYNTH6]: record => record.address,
};

const deserializers = {
  [RECORD_TYPE.TXT]: (value) => ({
    type: RECORD_TYPE.TXT,
    txt: [value],
  }),
  [RECORD_TYPE.NS]: (value) => ({
    type: RECORD_TYPE.NS,
    ns: value,
  }),
  [RECORD_TYPE.DS]: (value, t) => {
    const parts = value.trim().split(' ');
    if (parts.length !== 4) {
      throw new Error(t('recordErrDsFormat'));
    }

    return {
      type: RECORD_TYPE.DS,
      keyTag: Number(parts[0]),
      algorithm: Number(parts[1]),
      digestType: Number(parts[2]),
      digest: parts[3],
    };
  },
  [RECORD_TYPE.GLUE4]: (value, t) => {
    const parts = value.trim().split(' ');
    if (parts.length !== 2) {
      throw new Error(t('recordErrGlue4Format'));
    }

    return {
      type: RECORD_TYPE.GLUE4,
      ns: parts[0],
      address: parts[1],
    };
  },
  [RECORD_TYPE.GLUE6]: (value, t) => {
    const parts = value.trim().split(' ');
    if (parts.length !== 2) {
      throw new Error(t('recordErrGlue6Format'));
    }

    return {
      type: RECORD_TYPE.GLUE6,
      ns: parts[0],
      address: parts[1],
    };
  },
  [RECORD_TYPE.SYNTH4]: (value) => ({
    type: RECORD_TYPE.SYNTH4,
    address: value,
  }),
  [RECORD_TYPE.SYNTH6]: (value) => ({
    type: RECORD_TYPE.SYNTH6,
    address: value,
  }),
};

export function deserializeRecord({type, value}, t = defaultTranslate) {
  const deserializer = deserializers[type];
  if (!deserializer) {
    throw new Error(t('recordErrInvalidType'));
  }

  return deserializer(value, t);
}

export function serializeRecord(record, t = defaultTranslate) {
  const serializer = serializers[record.type];
  if (!serializer) {
    throw new Error(t('recordErrInvalidType'));
  }

  return serializer(record);
}
