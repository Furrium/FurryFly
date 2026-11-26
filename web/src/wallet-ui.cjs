const {formatAmount} = require('./units.cjs');
const {isSpendable, validateCoins} = require('./coins.cjs');
const {mergeActivity} = require('./activity.cjs');
const {drawReceiveQR} = require('./receive-qr.cjs');
const {t, i18nError, translateError, getLanguage, setLanguage, applyTranslations} = require('./i18n.cjs');

const $ = id => document.getElementById(id);
const dbName = 'transfur-regtest-wallet';
const unlockMs = 5 * 60 * 1000;
let db;
let vault;
let pendingVault;
let addresses;
let receiveAddresses = [];
let selectedReceive = 0;
let activity = null;
let worker;
let generation = 0;
let seq = 0;
let busy = false;
let mode = 'create';
let plan;
let lockTimer;
let lockAt;
const requests = new Map();
const localizedNodes = new Map([
  ['setup-submit', {key: 'setup.createSubmit'}],
  ['chain-state', {key: 'balance.unchecked'}],
  ['receipt-title', {key: 'receipt.submitted'}],
  ['receipt-detail', {key: 'receipt.submittedHint'}],
]);
let notice;
let validationTarget;

function renderMessage() {
  const text = notice ? (notice.error ? translateError(notice.error) : t(notice.key, notice.params)) : '';
  const node = $('message');
  node.textContent = text;
  node.hidden = !text;
  node.classList.toggle('error', Boolean(notice?.error || validationTarget));
}

function message(key, params) {
  validationTarget = null;
  notice = key ? {key, params} : null;
  renderMessage();
}

function showError(error) {
  validationTarget = null;
  notice = {error: error || i18nError('error.operationFailed')};
  renderMessage();
}

function setCopy(id, key, params) {
  if (key) localizedNodes.set(id, {key, params});
  else localizedNodes.delete(id);
  $(id).textContent = key ? t(key, params) : '';
}

function renderLanguage() {
  applyTranslations();
  for (const button of $('language-picker').querySelectorAll('[data-language]')) {
    button.setAttribute('aria-pressed', String(button.dataset.language === getLanguage()));
  }
  for (const [id, {key, params}] of localizedNodes) $(id).textContent = t(key, params);
  renderMessage();
  if (addresses?.length) {
    renderReceive();
    renderActivity();
  }
}

function attachLanguagePicker() {
  const picker = $('language-picker');
  for (const button of picker.querySelectorAll('[data-language]')) {
    button.addEventListener('click', () => {
      if (setLanguage(button.dataset.language)) renderLanguage();
    });
  }
  renderLanguage();
  picker.hidden = false;
}

function showValidation(event) {
  const input = event.target;
  if (!input.form || !input.validity) return;
  // Native bubbles use the browser's locale, not necessarily the wallet's selected language.
  event.preventDefault();
  const first = Array.from(input.form.elements).find(control => control.willValidate && !control.validity.valid);
  if (first !== input) return;
  const validity = input.validity;
  notice = validity.valueMissing ? {key: 'validation.required'}
    : validity.tooShort ? {key: 'validation.tooShort', params: {min: input.minLength}}
    : validity.tooLong ? {key: 'validation.tooLong', params: {max: input.maxLength}}
    : {key: 'validation.invalid'};
  validationTarget = input;
  renderMessage();
  input.focus();
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
    request.onerror = () => reject(i18nError('error.openStorage'));
  });
}

function storage(record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('vault', record ? 'readwrite' : 'readonly');
    const store = tx.objectStore('vault');
    const request = record ? store.add(record, 'default') : store.get('default');
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(i18nError('error.storageUnavailable'));
  });
}

function stopSigner() {
  worker?.terminate();
  worker = null;
  for (const request of requests.values()) request.reject(i18nError('error.walletLocked'));
  requests.clear();
}

function signer(type, payload = {}) {
  if (!worker) {
    worker = new Worker('/signer.js', {name: 'transfur-local-signer'});
    worker.onmessage = ({data}) => {
      const request = requests.get(data.id);
      if (!request) return;
      requests.delete(data.id);
      if (data.error) request.reject(data.error);
      else request.resolve(data.value);
    };
    worker.onerror = () => {
      for (const request of requests.values()) request.reject(i18nError('error.signerStart'));
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
  for (const id of ['setup-submit', 'unlock-submit', 'refresh', 'prepare', 'broadcast', 'cancel', 'choose-create', 'choose-restore', 'receive-select']) $(id).disabled = busy;
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
    catch (error) { if (current()) showError(error); }
    finally { if (current()) workState(false); }
  };
}

function clearReview() {
  plan = null;
  if ($('review').open) $('review').close();
}

function lock(noticeKey = 'vault.locked') {
  generation++;
  stopSigner();
  clearTimeout(lockTimer);
  lockAt = null;
  pendingVault = null;
  addresses = null;
  receiveAddresses = [];
  selectedReceive = 0;
  activity = null;
  clearReview();
  $('receipt').hidden = true;
  $('txid').textContent = '';
  $('receive-address').textContent = '';
  $('receive-select').replaceChildren();
  $('receive-qr').replaceChildren();
  $('activity-list').replaceChildren();
  $('activity-empty').hidden = true;
  $('activity-note').hidden = true;
  $('backup-words').replaceChildren();
  $('backup-saved').checked = false;
  $('setup-form').reset();
  $('unlock-form').reset();
  $('send-form').reset();
  workState(false);
  screen(vault ? 'unlock' : 'setup');
  message(noticeKey);
}

function resetLockTimer() {
  if (!addresses || ($('wallet').hidden && $('backup').hidden)) return;
  if (lockAt && Date.now() >= lockAt) { lock('vault.inactive'); return; }
  clearTimeout(lockTimer);
  lockAt = Date.now() + unlockMs;
  lockTimer = setTimeout(() => lock('vault.inactive'), unlockMs);
}

async function api(path, payload) {
  let response;
  try {
    response = await fetch(path, {cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(12_000),
      ...(payload ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)} : {})});
  } catch { throw i18nError('error.serviceUnreachable'); }
  if (!response.ok) throw i18nError(payload ? 'error.nodeRejected' : 'error.nodeRead');
  return response.json();
}

async function readFunds(current) {
  const owned = addresses;
  const pages = await Promise.all(owned.map(address => api(`/api/coins?address=${encodeURIComponent(address)}`)));
  if (!current()) return null;
  const height = pages[0].height;
  if (pages.some(page => page.network !== 'regtest' || page.height !== height || !Array.isArray(page.coins))) {
    throw i18nError('error.nodeNetwork');
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
    setCopy('chain-state', 'balance.block', {height: snapshot.height});
    return snapshot;
  } catch (error) {
    if (current()) {
      for (const id of ['available', 'pending', 'immature']) $(id).textContent = '—';
      setCopy('chain-state', 'balance.unavailable');
    }
    throw error;
  }
}

function receiveAddress() {
  return receiveAddresses[selectedReceive] || '';
}

function renderReceive() {
  if (!addresses.length) return;
  const address = receiveAddress();
  $('receive-address').textContent = address;
  const select = $('receive-select');
  if (select.options.length !== receiveAddresses.length) {
    select.replaceChildren(...receiveAddresses.map((_, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = t('receive.addressOption', {index: index + 1, total: receiveAddresses.length});
      return option;
    }));
  } else {
    for (const option of select.options) {
      option.textContent = t('receive.addressOption', {index: Number(option.value) + 1, total: receiveAddresses.length});
    }
  }
  select.value = String(selectedReceive);
  drawReceiveQR($('receive-qr'), address);
}

function activityKind(row) {
  if (row.kind === 'reward' || row.kind === 'received' || row.kind === 'sent'
      || row.kind === 'self' || row.kind === 'unknown') return `activity.${row.kind}`;
  return 'activity.unknown';
}

function renderActivity() {
  const list = $('activity-list');
  const empty = $('activity-empty');
  const note = $('activity-note');
  list.replaceChildren();
  if (!activity) {
    empty.hidden = true;
    note.hidden = true;
    return;
  }
  empty.hidden = activity.rows.length !== 0;
  note.hidden = !activity.truncated;
  if (activity.truncated) setCopy('activity-note', 'activity.truncated');
  const formatter = new Intl.DateTimeFormat(getLanguage(), {dateStyle: 'medium'});
  for (const row of activity.rows) {
    const item = document.createElement('li');
    item.className = 'activity-row';
    const kind = document.createElement('span');
    kind.className = 'activity-kind';
    kind.textContent = t(activityKind(row));
    const amount = document.createElement('span');
    amount.className = 'activity-amount';
    if (row.value === null) {
      amount.textContent = '—';
    } else {
      const magnitude = formatAmount(Math.abs(row.value));
      amount.classList.add(row.value >= 0 ? 'positive' : 'negative');
      amount.textContent = `${row.value > 0 ? '+' : row.value < 0 ? '−' : ''}${magnitude} ${t('units.hns')}`;
    }
    const state = document.createElement('span');
    state.className = `activity-state ${row.state}`;
    state.textContent = row.state === 'pending' ? t('activity.pending')
      : row.state === 'immature' ? t('activity.immature')
      : t(row.confirmations === 1 ? 'activity.confirmedOne' : 'activity.confirmed', {count: row.confirmations});
    const meta = document.createElement('span');
    meta.className = 'activity-meta';
    const when = row.time ? formatter.format(new Date(row.time * 1000)) : '';
    meta.textContent = [when, row.height < 0 ? t('activity.pendingBlock') : t('activity.block', {height: row.height})]
      .filter(Boolean).join(' · ');
    const txid = document.createElement('code');
    txid.className = 'activity-txid';
    txid.textContent = row.txid;
    txid.title = t('activity.txid');
    item.append(kind, state, amount, meta, txid);
    list.append(item);
  }
}

async function loadActivity(current) {
  const owned = addresses;
  const pages = await Promise.all(owned.map(address => api(`/api/history?address=${encodeURIComponent(address)}`)));
  if (!current()) return null;
  const height = pages[0]?.height;
  if (!Number.isSafeInteger(height) || pages.some(page => page.network !== 'regtest' || page.height !== height
      || !Array.isArray(page.transactions))) {
    throw i18nError('error.nodeNetwork');
  }
  activity = mergeActivity(pages, owned, height);
  renderActivity();
  return activity;
}

async function refreshActivity(current) {
  try {
    await loadActivity(current);
  } catch (error) {
    if (current()) showError(error);
  }
}

async function enterWallet(current) {
  screen('wallet');
  renderReceive();
  resetLockTimer();
  await refresh(current);
  await refreshActivity(current);
}

function setMode(value) {
  mode = value;
  const restore = mode === 'restore';
  $('choose-create').setAttribute('aria-pressed', String(!restore));
  $('choose-restore').setAttribute('aria-pressed', String(restore));
  $('restore-field').hidden = !restore;
  $('restore-phrase').required = restore;
  if (!restore) {
    if (validationTarget === $('restore-phrase')) message();
    $('restore-phrase').value = '';
  }
  setCopy('setup-submit', restore ? 'setup.restoreSubmit' : 'setup.createSubmit');
}

function attach() {
  document.addEventListener('invalid', showValidation, true);
  document.addEventListener('input', event => {
    if (event.target === validationTarget) message();
  });
  $('choose-create').onclick = () => setMode('create');
  $('choose-restore').onclick = () => setMode('restore');
  $('setup-form').onsubmit = operate(async current => {
    const password = $('new-password').value;
    if (password !== $('repeat-password').value) throw i18nError('error.passwordMismatch');
    const phrase = $('restore-phrase').value;
    $('setup-form').reset();
    try {
      const created = await signer(mode, {password, phrase});
      if (!current()) return;
      addresses = created.addresses;
      receiveAddresses = created.receiveAddresses;
      selectedReceive = 0;
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
    receiveAddresses = opened.receiveAddresses;
    selectedReceive = 0;
    await enterWallet(current);
  });
  $('lock').onclick = () => lock();
  $('receive-select').onchange = event => {
    const index = Number(event.target.value);
    if (Number.isInteger(index) && index >= 0 && index < receiveAddresses.length) {
      selectedReceive = index;
      renderReceive();
    }
  };
  $('refresh').onclick = operate(async current => {
    await refresh(current);
    await refreshActivity(current);
  });
  $('copy').onclick = async () => {
    try { await navigator.clipboard.writeText(receiveAddress()); message('receive.copied'); }
    catch { showError(i18nError('error.copyUnavailable')); }
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
    setCopy('review-amount', 'units.hnsAmount', {amount: formatAmount(review.value)});
    setCopy('review-fee', 'units.hnsAmount', {amount: formatAmount(review.fee)});
    setCopy('review-total', 'units.hnsAmount', {amount: formatAmount(review.value + review.fee)});
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
    setCopy('receipt-title', 'receipt.sending');
    setCopy('receipt-detail', 'receipt.sendingHint');
    $('receipt').hidden = false;
    try {
      const receipt = await api('/api/transactions', {hex: signed.hex});
      if (!current()) return;
      if (receipt.txid !== signed.txid) throw i18nError('error.txidMismatch');
    } catch {
      if (!current()) return;
      setCopy('receipt-title', 'receipt.unverified');
      setCopy('receipt-detail', 'receipt.unverifiedHint');
      throw i18nError('error.broadcastUnverified');
    }
    setCopy('receipt-title', 'receipt.submitted');
    setCopy('receipt-detail', 'receipt.submittedHint');
    $('send-form').reset();
    await refresh(current);
    await refreshActivity(current);
  });
  document.addEventListener('pointerdown', resetLockTimer, {passive: true});
  document.addEventListener('keydown', resetLockTimer);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && lockAt && Date.now() >= lockAt) lock('vault.inactive');
  });
  // Also drop secrets if the page enters the browser back/forward cache.
  window.addEventListener('pagehide', () => lock());
}

async function main() {
  attachLanguagePicker();
  if (!globalThis.isSecureContext || !globalThis.crypto?.subtle || !globalThis.indexedDB || !globalThis.Worker
      || typeof $('review').showModal !== 'function' || typeof globalThis.AbortSignal?.timeout !== 'function') {
    throw i18nError('error.unsupportedBrowser');
  }
  db = await openDb();
  vault = await storage();
  attach();
  screen(vault ? 'unlock' : 'setup');
}

main().catch(showError);
