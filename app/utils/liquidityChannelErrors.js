// Maps an error raised for a user-entered Liquidity channel host to a translated
// sentence. The background process reports a stable code; older or unexpected
// failures fall back to the generic message rather than to an English sentence.
const LIQUIDITY_CHANNEL_ERROR_KEYS = {
  LIQUIDITY_CHANNEL_INVALID_HOST: 'settingsLiquidityHostInvalid',
  LIQUIDITY_CHANNEL_PRIVATE_HOST: 'settingsLiquidityErrPrivateHost',
  LIQUIDITY_CHANNEL_INSECURE_URL: 'settingsLiquidityErrInsecureUrl',
  LIQUIDITY_CHANNEL_TOO_LARGE: 'settingsLiquidityErrTooLarge',
  LIQUIDITY_CHANNEL_INVALID_DOCUMENT: 'settingsLiquidityErrInvalidDocument',
  LIQUIDITY_CHANNEL_TOO_MANY_REDIRECTS: 'settingsLiquidityErrTooManyRedirects',
  LIQUIDITY_CHANNEL_HTTP_STATUS: 'settingsLiquidityErrHttpStatus',
  LIQUIDITY_CHANNEL_INVALID_JSON: 'settingsLiquidityErrInvalidJson',
  LIQUIDITY_CHANNEL_TIMEOUT: 'settingsLiquidityErrTimeout',
};

export function liquidityChannelErrorText(t, code, status) {
  const key = LIQUIDITY_CHANNEL_ERROR_KEYS[code];
  if (!key) return t('settingsLiquidityErrGeneric');
  if (code === 'LIQUIDITY_CHANNEL_HTTP_STATUS') {
    return t(key, String(status == null ? '' : status));
  }
  return t(key);
}
