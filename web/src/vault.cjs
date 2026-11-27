const version = 1;
const iterations = 600_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: true});
const aad = encoder.encode('TRANSFUR-web-regtest-vault-v1');
const toHex = bytes => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
const fromHex = hex => Uint8Array.from(hex.match(/../g), byte => parseInt(byte, 16));

async function keyFor(password, salt) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('Use a password between 12 and 128 characters.');
  }
  const bytes = encoder.encode(password);
  try {
    const source = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey']);
    return await crypto.subtle.deriveKey({name: 'PBKDF2', hash: 'SHA-256', salt, iterations},
      source, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
  } finally {
    bytes.fill(0);
  }
}

async function encryptMnemonic(mnemonic, password, network = 'regtest') {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = encoder.encode(mnemonic);
  try {
    const key = await keyFor(password, salt);
    const encrypted = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad}, key, bytes);
    return {version, network, salt: toHex(salt), iv: toHex(iv), encrypted: toHex(new Uint8Array(encrypted))};
  } finally {
    bytes.fill(0);
  }
}

async function decryptMnemonic(vault, password, network = 'regtest') {
  if (vault?.version !== version || vault.network !== network
      || typeof vault.salt !== 'string' || !/^[0-9a-f]{32}$/.test(vault.salt)
      || typeof vault.iv !== 'string' || !/^[0-9a-f]{24}$/.test(vault.iv)
      || typeof vault.encrypted !== 'string' || !/^(?:[0-9a-f]{2}){32,256}$/.test(vault.encrypted)) {
    throw new Error('This browser wallet backup is invalid or unsupported.');
  }
  let bytes;
  try {
    const key = await keyFor(password, fromHex(vault.salt));
    bytes = new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv: fromHex(vault.iv), additionalData: aad},
      key, fromHex(vault.encrypted)));
    return decoder.decode(bytes);
  } catch {
    throw new Error('Could not unlock. Check your password.');
  } finally {
    bytes?.fill(0);
  }
}

module.exports = {encryptMnemonic, decryptMnemonic};
