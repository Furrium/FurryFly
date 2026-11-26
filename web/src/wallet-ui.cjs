const {formatAmount} = require('./units.cjs');
const {isSpendable, validateCoins} = require('./coins.cjs');

const $ = id => document.getElementById(id);
const dbName = 'transfur-regtest-wallet';
const unlockMs = 5 * 60 * 1000;
let db;
let vault;
let pendingVault;
let addresses;
let worker;
let generation = 0;
let seq = 0;
let busy = false;
let mode = 'create';
let plan;
let lockTimer;
let lockAt;
const requests = new Map();

function message(text = '', error = false) {
  $('message').textContent = text;
  $('message').hidden = !text;
  $('message').classList.toggle('error', error);
}

function screen(name) {
  for (const id of ['setup', 'backup', 'unlock', 'wallet']) $(id).hidden = id !== name;
  $('lock').hidden = name !== 'wallet' && name !== 'backup';
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('vault');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Could not open browser wallet storage.'));
  });
}

function storage(record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('vault', record ? 'readwrite' : 'readonly');
    const store = tx.objectStore('vault');
    const request = record ? store.add(record, 'default') : store.get('default');
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(new Error('Wallet storage is unavailable or another wallet already exists.'));
  });
}

function stopSigner() {
  worker?.terminate();
  worker = null;
  for (const request of requests.values()) request.reject(new Error('The wallet was locked.'));
  requests.clear();
}

function signer(type, payload = {}) {
  if (!worker) {
    worker = new Worker('/signer.js', {name: 'transfur-local-signer'});
    worker.onmessage = ({data}) => {
      const request = requests.get(data.id);
      if (!request) return;
      requests.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data.value);
    };
    worker.onerror = () => {
      for (const request of requests.values()) request.reject(new Error('The local signer failed to start.'));
      stopSigner();
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++seq;
    requests.set(id, {resolve, reject});
    worker.postMessage({id, type, payload});
  });
}

function workState(value) {
  busy = value;
  for (const id of ['setup-submit', 'unlock-submit', 'refresh', 'prepare', 'broadcast', 'cancel', 'choose-create', 'choose-restore']) $(id).disabled = busy;
  $('backup-done').disabled = busy || !$('backup-saved').checked;
}

function operate(callback) {
  return async event => {
    event?.preventDefault();
    if (busy) return;
    if (addresses && lockAt && Date.now() >= lockAt) { lock(); return; }
    const active = generation;
    const current = () => active === generation;
    workState(true);
    message();
    try { await callback(current); }
    catch (error) { if (current()) message(error.message || 'The operation failed.', true); }
    finally { if (current()) workState(false); }
  };
}

function clearReview() {
  plan = null;
  if ($('review').open) $('review').close();
}

function lock(notice = 'Wallet locked.') {
  generation++;
  stopSigner();
  clearTimeout(lockTimer);
  lockAt = null;
  pendingVault = null;
  addresses = null;
  clearReview();
  $('receipt').hidden = true;
  $('txid').textContent = '';
  $('receive-address').textContent = '';
  $('backup-words').replaceChildren();
  $('backup-saved').checked = false;
  $('setup-form').reset();
  $('unlock-form').reset();
  $('send-form').reset();
  workState(false);
  screen(vault ? 'unlock' : 'setup');
  message(notice);
}

function resetLockTimer() {
  if (!addresses || ($('wallet').hidden && $('backup').hidden)) return;
  if (lockAt && Date.now() >= lockAt) { lock('Wallet locked after inactivity.'); return; }
  clearTimeout(lockTimer);
  lockAt = Date.now() + unlockMs;
  lockTimer = setTimeout(() => lock('Wallet locked after inactivity.'), unlockMs);
}

async function api(path, payload) {
  let response;
  try {
    response = await fetch(path, {cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(12_000),
      ...(payload ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)} : {})});
  } catch { throw new Error('The regtest service is unreachable.'); }
  if (!response.ok) throw new Error(payload ? 'The node did not accept the submission. Refresh before retrying.' : 'Could not read the regtest node.');
  return response.json();
}

async function readFunds(current) {
  const owned = addresses;
  const pages = await Promise.all(owned.map(address => api(`/api/coins?address=${encodeURIComponent(address)}`)));
  if (!current()) return null;
  const height = pages[0].height;
  if (pages.some(page => page.network !== 'regtest' || page.height !== height || !Array.isArray(page.coins))) {
    throw new Error('The node is on the wrong network or its tip changed. Refresh and try again.');
  }
  const coins = pages.flatMap((page, i) => validateCoins(page.coins, [owned[i]], height));
  return {height, coins: validateCoins(coins, owned, height)};
}

async function refresh(current) {
  try {
    const snapshot = await readFunds(current);
    if (!snapshot) return null;
    let available = 0, pending = 0, immature = 0;
    for (const coin of snapshot.coins) {
      if (coin.height < 0) pending += coin.value;
      else if (isSpendable(coin, snapshot.height)) available += coin.value;
      else immature += coin.value;
    }
    $('available').textContent = formatAmount(available);
    $('pending').textContent = formatAmount(pending);
    $('immature').textContent = formatAmount(immature);
    $('chain-state').textContent = `Regtest · block ${snapshot.height}`;
    return snapshot;
  } catch (error) {
    if (current()) {
      for (const id of ['available', 'pending', 'immature']) $(id).textContent = '—';
      $('chain-state').textContent = 'Node not available';
    }
    throw error;
  }
}

async function enterWallet(current) {
  $('receive-address').textContent = addresses[0];
  screen('wallet');
  resetLockTimer();
  await refresh(current);
}

function setMode(value) {
  mode = value;
  const restore = mode === 'restore';
  $('choose-create').setAttribute('aria-pressed', String(!restore));
  $('choose-restore').setAttribute('aria-pressed', String(restore));
  $('restore-field').hidden = !restore;
  $('restore-phrase').required = restore;
  if (!restore) $('restore-phrase').value = '';
  $('setup-submit').textContent = restore ? 'Restore encrypted wallet' : 'Create encrypted wallet';
}

function attach() {
  $('choose-create').onclick = () => setMode('create');
  $('choose-restore').onclick = () => setMode('restore');
  $('setup-form').onsubmit = operate(async current => {
    const password = $('new-password').value;
    if (password !== $('repeat-password').value) throw new Error('The passwords do not match.');
    const phrase = $('restore-phrase').value;
    $('setup-form').reset();
    try {
      const created = await signer(mode, {password, phrase});
      if (!current()) return;
      addresses = created.addresses;
      if (created.backup) {
        pendingVault = created.vault;
        $('backup-words').replaceChildren(...created.backup.split(' ').map(word => {
          const li = document.createElement('li'); li.textContent = word; return li;
        }));
        screen('backup');
        resetLockTimer();
      } else {
        await storage(created.vault);
        vault = created.vault;
        if (!current()) { screen('unlock'); return; }
        await enterWallet(current);
      }
    } catch (error) {
      if (current() && !vault) { stopSigner(); addresses = null; }
      throw error;
    }
  });
  $('backup-saved').onchange = () => { $('backup-done').disabled = busy || !$('backup-saved').checked; };
  $('backup-done').onclick = operate(async current => {
    if (!pendingVault || !$('backup-saved').checked) return;
    const record = pendingVault;
    await storage(record);
    vault = record;
    if (!current()) { screen('unlock'); return; }
    pendingVault = null;
    $('backup-words').replaceChildren();
    $('backup-saved').checked = false;
    await enterWallet(current);
  });
  $('unlock-form').onsubmit = operate(async current => {
    const password = $('password').value;
    $('unlock-form').reset();
    const opened = await signer('unlock', {vault, password});
    if (!current()) return;
    addresses = opened.addresses;
    await enterWallet(current);
  });
  $('lock').onclick = () => lock();
  $('refresh').onclick = operate(refresh);
  $('copy').onclick = async () => {
    try { await navigator.clipboard.writeText(addresses[0]); message('Receive address copied.'); }
    catch { message('Copy is unavailable. You can select the address above.', true); }
  };
  $('send-form').onsubmit = operate(async current => {
    const recipient = $('recipient').value;
    const amount = $('amount').value.trim();
    const snapshot = await refresh(current);
    if (!snapshot || !current()) return;
    const review = await signer('prepare', {...snapshot, recipient, amount});
    if (!current()) return;
    plan = review;
    $('review-address').textContent = review.recipient;
    $('review-amount').textContent = `${formatAmount(review.value)} HNS`;
    $('review-fee').textContent = `${formatAmount(review.fee)} HNS`;
    $('review-total').textContent = `${formatAmount(review.value + review.fee)} HNS`;
    $('receipt').hidden = true;
    // The native dialog makes the background inert and gives Cancel initial focus.
    workState(false);
    $('review').showModal();
  });
  $('cancel').onclick = () => $('review').close();
  $('review').addEventListener('close', () => {
    if (!$('review').open && plan) {
      plan = null;
      void signer('discard').catch(() => {});
    }
  });
  $('broadcast').onclick = operate(async current => {
    if (!plan) return;
    const id = plan.id;
    clearReview();
    const signed = await signer('approve', {id});
    if (!current()) return;
    $('txid').textContent = signed.txid;
    $('receipt-title').textContent = 'Sending to the node…';
    $('receipt-detail').textContent = 'Keep this transaction ID until the node responds.';
    $('receipt').hidden = false;
    try {
      const receipt = await api('/api/transactions', {hex: signed.hex});
      if (!current()) return;
      if (receipt.txid !== signed.txid) throw new Error('Unexpected transaction ID.');
    } catch {
      if (!current()) return;
      $('receipt-title').textContent = 'Submission not verified';
      $('receipt-detail').textContent = 'Check this transaction ID with the node operator before making another payment.';
      throw new Error('No confirmation from the node. Do not retry blindly.');
    }
    $('receipt-title').textContent = 'Submitted to the node';
    $('receipt-detail').textContent = 'Confirmations are not guaranteed until mined.';
    $('send-form').reset();
    await refresh(current);
  });
  document.addEventListener('pointerdown', resetLockTimer, {passive: true});
  document.addEventListener('keydown', resetLockTimer);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && lockAt && Date.now() >= lockAt) lock('Wallet locked after inactivity.');
  });
  // Also drop secrets if the page enters the browser back/forward cache.
  window.addEventListener('pagehide', () => lock('Wallet locked.'));
}

async function main() {
  if (!isSecureContext || !crypto.subtle || !globalThis.indexedDB || !globalThis.Worker
      || typeof $('review').showModal !== 'function' || typeof AbortSignal.timeout !== 'function') {
    throw new Error('Use a modern browser on HTTPS or localhost.');
  }
  db = await openDb();
  vault = await storage();
  attach();
  screen(vault ? 'unlock' : 'setup');
}

main().catch(error => message(error.message, true));
