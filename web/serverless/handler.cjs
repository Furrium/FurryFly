'use strict';

const Address = require('hsd/lib/primitives/address');
const Block = require('hsd/lib/primitives/block');
const Network = require('hsd/lib/protocol/network');
const TX = require('hsd/lib/primitives/tx');
const {types} = require('hsd/lib/covenants/rules');
const {MAX_MONEY} = require('hsd/lib/protocol/consensus');
const {HISTORY_CANDIDATES, HISTORY_TX_BYTES, MAX_HISTORY_TIME, collectHistory} = require('../history.cjs');

const NETWORK = 'regtest';
const DEFAULT_TIMEOUT = 5000;
const MAX_TARGET = 1024;
const MAX_TX_BYTES = 32 * 1024;
const MAX_REQUEST_BODY = 2 * MAX_TX_BYTES + 1024;
const MAX_TX_ITEMS = 128;
const MAX_COINS = 512;
const MAX_COIN_ROWS = 1024;
const MAX_COINS_RESPONSE = 512 * 1024;
const MAX_TX_RESPONSE = 512 * 1024;
const MAX_NODE_RESPONSE = 32 * 1024;
const MAX_HISTORY_RESPONSE = 4 * 1024 * 1024;
const MAX_HISTORY_WIRE_ROWS = 1024;
const HISTORY_PARENT_LOOKUPS = 128;
const MAX_HEIGHT = 0x7ffffffe;
const INPUT_BATCH_SIZE = 8;
const ROUTES = new Map([
  ['/api/status', 'GET'],
  ['/api/coins', 'GET'],
  ['/api/history', 'GET'],
  ['/api/transactions', 'POST']
]);

const regtest = Network.get(NETWORK);
const [genesisTX] = Block.decode(regtest.genesisBlock).txs;
const genesisTXID = genesisTX.txid();
const genesisAddress = genesisTX.outputs[0].address.toString(NETWORK);

class HTTPError extends Error {
  constructor(status, message, headers) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

function badUpstream() {
  return new HTTPError(502, 'Invalid or unavailable regtest upstream.');
}

function json(status, data, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function httpsOrigin(value, name) {
  try {
    if (typeof value === 'string' && /^https:\/\/[^/?#\s\\]+\/?$/i.test(value)) {
      const url = new URL(value);
      if (url.protocol === 'https:' && !url.username && !url.password && !value.includes('@'))
        return url.origin;
    }
  } catch {
    // Never include configured URLs or credentials in an error.
  }
  throw new TypeError(`${name} must be an HTTPS origin, without credentials or a path.`);
}

function isJSON(headers) {
  return /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i
    .test(headers.get('content-type') || '');
}

function discard(body) {
  if (body)
    void body.cancel().catch(() => {});
}

async function readJSON(message, limit, signal, tooLarge, invalid) {
  const declared = message.headers.get('content-length');
  if (declared !== null && !/^[0-9]+$/.test(declared)) {
    discard(message.body);
    throw invalid;
  }
  if (Number(declared) > limit) {
    discard(message.body);
    throw tooLarge;
  }
  if (!message.body)
    throw invalid;

  const reader = message.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  let buffer = Buffer.allocUnsafe(Math.min(limit, 4096));
  let bytes = 0;
  let empty = 0;
  let done = false;
  signal.addEventListener('abort', cancel, {once: true});
  try {
    while (!done) {
      signal.throwIfAborted();
      const item = await reader.read();
      signal.throwIfAborted();
      done = item.done;
      if (done)
        break;
      if (!(item.value instanceof Uint8Array))
        throw invalid;
      if (item.value.byteLength === 0 && ++empty > 32)
        throw invalid;
      const end = bytes + item.value.byteLength;
      if (end > limit)
        throw tooLarge;
      if (end > buffer.length) {
        const expanded = Buffer.allocUnsafe(Math.min(limit, Math.max(end, 2 * buffer.length)));
        expanded.set(buffer.subarray(0, bytes));
        buffer = expanded;
      }
      buffer.set(item.value, bytes);
      bytes = end;
    }
    return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(buffer.subarray(0, bytes)));
  } catch (err) {
    throw err === tooLarge ? tooLarge : invalid;
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!done)
      cancel();
    reader.releaseLock();
  }
}

async function withDeadline(timeout, timeoutError, parent, task) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  const timer = setTimeout(() => controller.abort(timeoutError), timeout);
  parent.addEventListener('abort', stop, {once: true});
  if (parent.aborted)
    stop();

  let abort;
  try {
    const aborted = new Promise((resolve, reject) => {
      abort = () => reject(controller.signal.reason);
      if (controller.signal.aborted)
        abort();
      else
        controller.signal.addEventListener('abort', abort, {once: true});
    });
    return await Promise.race([aborted, Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return task(controller.signal);
    })]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', abort);
    parent.removeEventListener('abort', stop);
    stop();
  }
}

function object(data) {
  return data !== null && typeof data === 'object' && !Array.isArray(data);
}

function integer(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function hashString(value) {
  return typeof value === 'string' && value.length === 64 && !/[^0-9a-f]/.test(value);
}

function paymentAddress(address) {
  return address.isPubkeyhash() || address.isScripthash();
}

function decodeAddress(text) {
  if (typeof text !== 'string' || text.length > 90)
    throw new Error('Invalid address.');
  const address = Address.fromString(text, NETWORK);
  if (text.toLowerCase() !== address.toString(NETWORK))
    throw new Error('Invalid address.');
  return address;
}

function queryAddress(url) {
  const params = [...url.searchParams];
  if (params.length !== 1 || params[0][0] !== 'address')
    throw new HTTPError(400, 'Expected exactly one address parameter.');
  try {
    const address = decodeAddress(params[0][1]);
    if (paymentAddress(address))
      return address.toString(NETWORK);
  } catch {
    // Invalid addresses and addresses on other networks get the same error.
  }
  throw new HTTPError(400, 'Expected a valid regtest payment address.');
}

function decodeCoin(data) {
  if (!object(data) || !hashString(data.hash) || !integer(data.index, 0, 0xffffffff)
      || !integer(data.height, -1, MAX_HEIGHT) || !integer(data.value, 0, MAX_MONEY)
      || typeof data.coinbase !== 'boolean' || (data.coinbase && data.height === -1)
      || !object(data.covenant) || !integer(data.covenant.type, 0, 255)
      || !Array.isArray(data.covenant.items)) {
    throw badUpstream();
  }

  let address;
  try {
    address = decodeAddress(data.address);
  } catch {
    throw badUpstream();
  }

  const plain = paymentAddress(address) && data.covenant.type === types.NONE
    && data.covenant.action === 'NONE' && data.covenant.items.length === 0;
  const {hash, index, height, value, coinbase} = data;
  return {plain, coin: {hash, index, height, value, coinbase, address: address.toString(NETWORK)}};
}

function decodeHistoryMeta(data, txid) {
  if (!object(data) || !hashString(data.hash) || (txid !== undefined && data.hash !== txid)
      || !hashString(data.witnessHash) || !integer(data.height, -1, MAX_HEIGHT)
      || !integer(data.mtime, 0, MAX_HISTORY_TIME) || !integer(data.time, 0, MAX_HISTORY_TIME)
      || (data.height === -1 ? data.block !== null || data.time !== 0
        : !hashString(data.block) || data.time === 0)
      || typeof data.hex !== 'string' || !data.hex.length || data.hex.length % 2) {
    throw badUpstream();
  }

  const {height, block} = data;
  const time = height === -1 ? data.mtime : data.time;
  if (data.hex.length > 2 * HISTORY_TX_BYTES)
    return {tx: null, height, time, block};
  if (/[^0-9a-f]/.test(data.hex))
    throw badUpstream();
  try {
    const raw = Buffer.from(data.hex, 'hex');
    const tx = TX.decode(raw);
    if (tx.getSize() !== raw.length || tx.txid() !== data.hash || tx.wtxid() !== data.witnessHash)
      throw badUpstream();
    return {tx, height, time, block};
  } catch {
    throw badUpstream();
  }
}

function decodeTransaction(data) {
  if (!object(data) || Object.keys(data).length !== 1 || typeof data.hex !== 'string')
    throw new HTTPError(400, 'Expected only a hex transaction.');
  if (data.hex.length > 2 * MAX_TX_BYTES)
    throw new HTTPError(413, 'Transaction is too large.');
  if (!data.hex.length || data.hex.length % 2 || /[^0-9a-f]/i.test(data.hex))
    throw new HTTPError(400, 'Invalid transaction hex.');

  let tx;
  try {
    const raw = Buffer.from(data.hex, 'hex');
    tx = TX.decode(raw);
    // hsd may decode a valid prefix and leave trailing bytes unread.
    if (tx.getSize() !== raw.length)
      throw new Error();
  } catch {
    throw new HTTPError(400, 'Invalid serialized transaction.');
  }
  if (tx.inputs.length > MAX_TX_ITEMS || tx.outputs.length > MAX_TX_ITEMS)
    throw new HTTPError(413, 'Too many transaction inputs or outputs.');
  if (tx.isCoinbase() || !tx.isSane() || tx.outputs.some(output =>
    !paymentAddress(output.address) || !output.covenant.isNone() || output.covenant.items.length !== 0)) {
    throw new HTTPError(422, 'Only ordinary NONE payment transactions are supported.');
  }
  return tx;
}

/** Create a Fetch API handler for a Node serverless runtime. Configuration is trusted. */
function createHandler({env = process.env, fetch: fetchUpstream = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT} = {}) {
  const webOrigin = httpsOrigin(env.TRANSFUR_WEB_ORIGIN, 'TRANSFUR_WEB_ORIGIN');
  const nodeOrigin = httpsOrigin(env.TRANSFUR_HSD_URL, 'TRANSFUR_HSD_URL');
  if (webOrigin === nodeOrigin)
    throw new TypeError('The wallet and hsd must have distinct origins.');
  const key = env.TRANSFUR_HSD_API_KEY;
  // hsd uses HTTP Basic with an ASCII password of at most 255 bytes.
  if (typeof key !== 'string' || !key.length || key.length > 255 || /[^\x21-\x7e]/.test(key))
    throw new TypeError('TRANSFUR_HSD_API_KEY must be a nonempty printable ASCII hsd API key.');
  if (typeof fetchUpstream !== 'function' || !integer(timeoutMs, 1, 30000))
    throw new TypeError('A Fetch implementation and a valid timeout are required.');
  const authorization = `Basic ${Buffer.from(`x:${key}`, 'ascii').toString('base64')}`;

  async function upstream(path, signal, {body, limit = MAX_NODE_RESPONSE, missing = false, broadcast = false} = {}) {
    // All paths are fixed literals or built from validated addresses/outpoints/txids.
    const headers = {Accept: 'application/json', Authorization: authorization};
    if (body !== undefined)
      headers['Content-Type'] = 'application/json';
    try {
      const result = await fetchUpstream(`${nodeOrigin}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error'
      });
      if (result.redirected || (result.status !== 200 && !(broadcast && result.status === 500))) {
        discard(result.body);
        if (!result.redirected && missing && result.status === 404)
          return null;
        throw badUpstream();
      }
      if (!isJSON(result.headers)) {
        discard(result.body);
        throw badUpstream();
      }
      const invalid = badUpstream();
      const data = await readJSON(result, limit, signal, invalid, invalid);
      if (result.status === 500) {
        if (data?.error?.type === 'VerifyError')
          throw new HTTPError(422, 'Transaction rejected by the regtest upstream.');
        throw invalid;
      }
      // null represents a REST 404 only, not a successful JSON response.
      if (data === null)
        throw invalid;
      return data;
    } catch (err) {
      if (err instanceof HTTPError)
        throw err;
      throw badUpstream();
    }
  }

  async function getHeight(signal) {
    const status = await upstream('/', signal);
    if (status.network !== NETWORK || !integer(status.chain?.height, 0, MAX_HEIGHT))
      throw badUpstream();
    return status.chain.height;
  }

  async function getCoins(address, height, signal) {
    // hsd's address index already excludes chain outputs spent in its mempool.
    const rows = await upstream(`/coin/address/${address}`, signal, {limit: MAX_COINS_RESPONSE});
    if (!Array.isArray(rows) || rows.length > MAX_COIN_ROWS)
      throw badUpstream();
    const coins = [];
    const seen = new Set();
    let maxCoinHeight = -1;
    for (const row of rows) {
      const {coin, plain} = decodeCoin(row);
      if (!plain || coin.address !== address)
        continue;
      const outpoint = `${coin.hash}:${coin.index}`;
      if (seen.has(outpoint) || coins.length >= MAX_COINS)
        throw badUpstream();
      seen.add(outpoint);
      coins.push(coin);
      maxCoinHeight = Math.max(maxCoinHeight, coin.height);
    }
    // REST queries are not atomic: a block may have arrived after the status read.
    if (maxCoinHeight > height) {
      height = await getHeight(signal);
      if (maxCoinHeight > height)
        throw badUpstream();
    }
    return {network: NETWORK, height, coins};
  }

  async function getHistory(address, height, signal) {
    async function indexedRows(text) {
      // Stock hsd 6.1.1 has no address-history paging/limit parameter. Bound our
      // transfer, deadline and validation; never forward client-selected options.
      const rows = await upstream(`/tx/address/${text}`, signal, {limit: MAX_HISTORY_RESPONSE});
      if (!Array.isArray(rows) || rows.length > MAX_HISTORY_WIRE_ROWS)
        throw badUpstream();
      return rows;
    }

    // hsd status does not expose these flags, and the address endpoint silently
    // returns no confirmed history unless BOTH indexes are enabled. Its known
    // genesis row gives positive index verification even for an unused address.
    const probe = await indexedRows(genesisAddress);
    const anchored = decodeHistoryMeta(probe.find(row => row?.hash === genesisTXID), genesisTXID);
    if (!anchored.tx || anchored.height !== 0 || anchored.time !== regtest.genesis.time
        || anchored.block !== regtest.genesis.hash.toString('hex') || anchored.tx.wtxid() !== genesisTX.wtxid()) {
      throw badUpstream();
    }

    const rows = address === genesisAddress ? probe : await indexedRows(address);
    const pending = [];
    const confirmed = [];
    for (const row of rows) {
      if (!object(row) || !integer(row.height, -1, MAX_HEIGHT))
        throw badUpstream();
      (row.height === -1 ? pending : confirmed).push(row);
    }
    const selected = pending.concat(confirmed).slice(0, HISTORY_CANDIDATES);
    const parents = new Map([[genesisTXID, anchored]]);
    const seen = new Set();
    let maxHeight = -1;
    const candidates = selected.map(row => {
      const meta = decodeHistoryMeta(row);
      if (seen.has(row.hash))
        throw badUpstream();
      seen.add(row.hash);
      maxHeight = Math.max(maxHeight, meta.height);
      parents.set(row.hash, meta);
      return meta;
    });
    if (maxHeight > height) {
      height = await getHeight(signal);
      if (maxHeight > height)
        throw badUpstream();
    }

    // Use exact previous-output bytes, not an input's advertised address/coin.
    // Each tx hash is fetched at most once per request, with its own response cap.
    let lookups = 0;
    async function previousOutput({hash, index}, child) {
      const txid = hash.toString('hex');
      if (!parents.has(txid)) {
        if (lookups >= HISTORY_PARENT_LOOKUPS)
          return null;
        lookups++;
        parents.set(txid, upstream(`/tx/${txid}`, signal, {limit: MAX_TX_RESPONSE, missing: true})
          .then(row => row === null ? null : decodeHistoryMeta(row, txid)));
      }
      const parent = await parents.get(txid);
      if (!parent?.tx)
        return null;
      if (index >= parent.tx.outputs.length
          || (child.height !== -1 && (parent.height === -1 || parent.height > child.height))) {
        throw badUpstream();
      }
      return parent.tx.outputs[index];
    }

    try {
      return await collectHistory(height, decodeAddress(address), candidates, rows.length > selected.length,
        async child => {
          const outputs = [];
          for (let i = 0; i < child.tx.inputs.length; i += INPUT_BATCH_SIZE) {
            signal.throwIfAborted();
            const batch = await Promise.all(child.tx.inputs.slice(i, i + INPUT_BATCH_SIZE)
              .map(({prevout}) => previousOutput(prevout, child)));
            outputs.push(...batch);
          }
          return outputs;
        });
    } catch (err) {
      if (err instanceof HTTPError)
        throw err;
      throw badUpstream();
    }
  }

  async function submit(tx, signal) {
    // Validate the exact unspent inputs (not gettxout, which may miss mempool spends).
    for (let start = 0; start < tx.inputs.length; start += INPUT_BATCH_SIZE) {
      await Promise.all(tx.inputs.slice(start, start + INPUT_BATCH_SIZE).map(async ({prevout}) => {
        const hash = prevout.hash.toString('hex');
        const {index} = prevout;
        const row = await upstream(`/coin/${hash}/${index}`, signal, {missing: true});
        if (row !== null) {
          const decoded = decodeCoin(row);
          if (decoded.coin.hash !== hash || decoded.coin.index !== index)
            throw badUpstream();
          if (decoded.plain)
            return;
        }
        throw new HTTPError(422, 'Transaction input is missing, spent, or not a plain payment.');
      }));
    }

    const txid = tx.txid();
    const hex = tx.toHex();
    const sent = await upstream('/broadcast', signal, {body: {tx: hex}, broadcast: true});
    if (sent.success !== true)
      throw badUpstream();

    // hsd's sendTX can return normally for orphans and some verification failures.
    // Require independent observation of the *exact* witness-bearing tx in the mempool.
    const observed = await upstream(`/tx/${txid}`, signal, {limit: MAX_TX_RESPONSE, missing: true});
    if (observed !== null && (!object(observed) || observed.hash !== txid
        || !hashString(observed.witnessHash) || !integer(observed.height, -1, MAX_HEIGHT))) {
      throw badUpstream();
    }
    if (observed === null || observed.height !== -1 || observed.block !== null
        || observed.witnessHash !== tx.wtxid() || observed.hex !== hex) {
      throw new HTTPError(422, 'Could not verify this transaction in the regtest mempool.');
    }
    return {txid};
  }

  return async function handle(request) {
    try {
      const url = new URL(request.url);
      const expected = ROUTES.get(url.pathname);
      if (url.pathname.length + url.search.length > MAX_TARGET)
        throw new HTTPError(414, 'Request target is too long.');
      if (!expected)
        throw new HTTPError(404, 'Not found.');

      const origin = request.headers.get('origin');
      const site = request.headers.get('sec-fetch-site');
      if (url.origin !== webOrigin || (origin !== null && origin !== webOrigin)
          || (request.method === 'POST' && origin !== webOrigin)
          || (site !== null && site !== 'same-origin' && site !== 'none')) {
        throw new HTTPError(403, 'Cross-origin requests are not allowed.');
      }
      if (request.method !== expected)
        throw new HTTPError(405, 'Method not allowed.', {Allow: expected});
      const hasAddress = url.pathname === '/api/coins' || url.pathname === '/api/history';
      if (url.href.includes('#') || (!hasAddress && url.href.includes('?')))
        throw new HTTPError(400, 'Unexpected query or fragment.');
      if (expected !== 'POST' && (request.body || request.headers.has('transfer-encoding')
          || (request.headers.has('content-length') && request.headers.get('content-length') !== '0'))) {
        throw new HTTPError(400, 'A request body is not allowed here.');
      }

      const address = hasAddress ? queryAddress(url) : null;
      let tx;
      if (expected === 'POST') {
        const encoding = request.headers.get('content-encoding');
        if (!isJSON(request.headers) || (encoding !== null && encoding.toLowerCase() !== 'identity'))
          throw new HTTPError(415, 'Expected unencoded application/json.');
        const data = await withDeadline(timeoutMs, new HTTPError(408, 'Request body timed out.'), request.signal,
          signal => readJSON(request, MAX_REQUEST_BODY, signal, new HTTPError(413, 'Request body is too large.'),
            new HTTPError(400, 'Invalid JSON request.')));
        tx = decodeTransaction(data);
      }

      const data = await withDeadline(timeoutMs, new HTTPError(504, 'Regtest upstream timed out.'), request.signal,
        async signal => {
          const height = await getHeight(signal);
          if (address !== null)
            return url.pathname === '/api/history' ? getHistory(address, height, signal) : getCoins(address, height, signal);
          if (tx)
            return submit(tx, signal);
          return {network: NETWORK, height};
        });
      return json(200, data);
    } catch (err) {
      if (err instanceof HTTPError)
        return json(err.status, {error: err.message}, err.headers);
      return json(500, {error: 'Internal regtest adapter error.'});
    }
  };
}

module.exports = {createHandler};
