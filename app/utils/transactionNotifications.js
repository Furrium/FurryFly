import {translateLocale} from './i18n';

// Callers render these messages directly, so the translator is injected. Without one
// the English source text is returned, which keeps non-UI callers and tests unchanged.
const defaultTranslate = (key, ...values) => translateLocale('en-US', null, key, ...values);

export function formatRegisterSuccess(result = {}, {t = defaultTranslate} = {}) {
  const names = Array.isArray(result.names) ? result.names.filter(Boolean) : [];
  const txids = Array.isArray(result.txids) ? result.txids.filter(Boolean) : [];
  const fallbackTxid = typeof result.txid === 'string' ? result.txid.trim() : '';
  const transactionCount = txids.length || (fallbackTxid ? 1 : 0);

  if (transactionCount > 1 || names.length > 1) {
    return names.length
      ? t('txNotifyRegisterManyWithNames', String(transactionCount), String(names.length))
      : t('txNotifyRegisterMany', String(transactionCount));
  }

  const txid = txids[0] || fallbackTxid;
  // Keep the transaction ID optional in code so nothing renders as null/undefined.
  if (txid && names.length) return t('txNotifyRegisterOneNamedWithTx', names[0], txid);
  if (txid) return t('txNotifyRegisterOneWithTx', txid);
  if (names.length) return t('txNotifyRegisterOneNamed', names[0]);
  return t('txNotifyRegisterOne');
}

export function formatAtomicBatchFailure(error, names = [], action = 'process', {t = defaultTranslate} = {}) {
  const message = error && error.message ? error.message : t('txNotifyFailed');
  const isRejected = /transaction\s+[0-9a-z]+.*(?:rejected|not accepted)/i.test(message);

  if (!isRejected) {
    return message;
  }

  const count = names.filter(Boolean).length;
  // Grammatical English label ("1 name" / "2 names"); Chinese interpolates the bare count.
  return t('txNotifyAtomicBatchFailed', message, String(count), action);
}
