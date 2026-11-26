const {newPhrase, openWallet, prepareTransfer} = require('./wallet.cjs');
const {encryptMnemonic, decryptMnemonic} = require('./vault.cjs');

let wallet;
let prepared;
let busy = false;
self.addEventListener('message', async ({data: {id, type, payload}}) => {
  const respond = (value, error) => self.postMessage({id, value, error});
  if (busy) return respond(null, 'The signer is busy.');
  busy = true;
  try {
    if (type === 'prepare') {
      if (!wallet) throw new Error('Unlock the wallet before preparing a transfer.');
      prepared = null;
      const draft = await prepareTransfer({...payload, wallet});
      prepared = {draft, id: crypto.randomUUID(), expires: Date.now() + 90_000};
      respond({...draft.review, id: prepared.id});
      return;
    }
    if (type === 'discard') {
      prepared = null;
      respond({});
      return;
    }
    if (type === 'approve') {
      const pending = prepared;
      prepared = null;
      if (!pending || pending.id !== payload.id || Date.now() >= pending.expires) {
        throw new Error('The transfer review expired; prepare it again.');
      }
      respond(pending.draft.finalize());
      return;
    }
    if (!['create', 'restore', 'unlock'].includes(type) || wallet) throw new Error('Invalid wallet operation.');
    const source = type === 'create' ? newPhrase() : type === 'restore' ? payload.phrase
      : await decryptMnemonic(payload.vault, payload.password);
    const {rings, addresses, phrase} = openWallet(source);
    const vault = type === 'unlock' ? undefined : await encryptMnemonic(phrase, payload.password);
    wallet = {rings, addresses};
    respond({addresses, vault, backup: type === 'create' ? phrase : undefined});
  } catch (error) {
    respond(null, error instanceof Error ? error.message : 'The local signer could not complete this operation.');
  } finally {
    busy = false;
  }
});
