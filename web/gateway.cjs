'use strict';

const http = require('node:http');
const path = require('node:path');
const {constants, promises: fs} = require('node:fs');

// hsd's JS backends need no native addons, even in a scripts-disabled install.
process.env.NODE_BACKEND = 'js';
const Address = require('hsd/lib/primitives/address');
const TX = require('hsd/lib/primitives/tx');

const NETWORK = 'regtest';
const HOST = '127.0.0.1';
const DEFAULT_PORT = 8080;
const DIST = path.join(__dirname, 'dist');
const MAX_TX_BYTES = 32 * 1024;
const MAX_BODY_BYTES = 2 * MAX_TX_BYTES + 1024;
const MAX_TX_ITEMS = 128;
const MAX_TARGET_LENGTH = 1024;

const STATIC = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/wallet.js', ['wallet.js', 'text/javascript; charset=utf-8']],
  ['/wallet.css', ['wallet.css', 'text/css; charset=utf-8']],
  ['/signer.js', ['signer.js', 'text/javascript; charset=utf-8']]
]);

const API = new Map([
  ['/api/status', 'GET'],
  ['/api/coins', 'GET'],
  ['/api/transactions', 'POST']
]);

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function securityHeaders(res, worker = false) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    worker ? "connect-src 'none'" : "connect-src 'self'",
    worker ? "worker-src 'none'" : "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
}

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function plainAddress(address) {
  return address.isPubkeyhash() || address.isScripthash();
}

function parseAddress(text) {
  try {
    if (typeof text !== 'string' || text.length > 90)
      throw new Error();
    const address = Address.fromString(text, NETWORK);
    if (!plainAddress(address) || text.toLowerCase() !== address.toString(NETWORK))
      throw new Error();
    return address;
  } catch {
    throw new RequestError(400, 'Expected a valid regtest payment address.');
  }
}

function plainOutput(output) {
  return output.covenant.isNone() && output.covenant.items.length === 0
    && plainAddress(output.address);
}

async function readJSON(req) {
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i
    .test(req.headers['content-type'] || '')) {
    throw new RequestError(415, 'Expected application/json.');
  }
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')
    throw new RequestError(415, 'Encoded request bodies are not supported.');
  if (Number(req.headers['content-length']) > MAX_BODY_BYTES)
    throw new RequestError(413, 'Request body is too large.');

  const chunks = [];
  let length = 0;
  // Keep the socket alive long enough to deliver 413 if a streamed body exceeds the limit.
  for await (const chunk of req.iterator({destroyOnReturn: false})) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES)
      throw new RequestError(413, 'Request body is too large.');
    chunks.push(chunk);
  }

  try {
    return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(Buffer.concat(chunks)));
  } catch {
    throw new RequestError(400, 'Invalid JSON request.');
  }
}

function decodeTransaction(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).length !== 1 || typeof body.hex !== 'string') {
    throw new RequestError(400, 'Expected only a hex transaction.');
  }

  const {hex} = body;
  if (hex.length > 2 * MAX_TX_BYTES)
    throw new RequestError(413, 'Transaction is too large.');
  if (!hex.length || hex.length % 2 || /[^0-9a-f]/i.test(hex))
    throw new RequestError(400, 'Invalid transaction hex.');

  let tx;
  try {
    const raw = Buffer.from(hex, 'hex');
    tx = TX.decode(raw);
    // hsd/bufio decoders accept a valid prefix; do not allow trailing bytes.
    if (tx.getSize() !== raw.length)
      throw new Error();
  } catch {
    throw new RequestError(400, 'Invalid serialized transaction.');
  }

  if (tx.inputs.length > MAX_TX_ITEMS || tx.outputs.length > MAX_TX_ITEMS)
    throw new RequestError(413, 'Too many transaction inputs or outputs.');
  if (tx.isCoinbase() || !tx.isSane() || !tx.outputs.every(plainOutput))
    throw new RequestError(422, 'Only ordinary NONE payment transactions are supported.');
  return tx;
}

async function submitTransaction(node, req) {
  const tx = decodeTransaction(await readJSON(req));
  for (const {prevout} of tx.inputs) {
    const coin = await node.getCoin(prevout.hash, prevout.index);
    if (!coin || !plainOutput(coin))
      throw new RequestError(422, 'Transaction input is missing, spent, or not a plain payment.');
  }
  try {
    // FullNode.sendTX intentionally swallows some verification errors (relay policy).
    // Mempool.addTX enforces consensus and policy and reports missing inputs explicitly.
    const missing = await node.mempool.addTX(tx);
    if (missing !== null)
      throw new RequestError(422, 'Transaction inputs are missing.');
  } catch (err) {
    if (err.type === 'VerifyError')
      throw new RequestError(422, 'Transaction rejected by the regtest node.');
    throw err;
  }
  return {txid: tx.txid()};
}

async function getCoins(node, query) {
  const params = [...new URLSearchParams(query)];
  if (params.length !== 1 || params[0][0] !== 'address')
    throw new RequestError(400, 'Expected exactly one address parameter.');
  const address = parseAddress(params[0][1]);
  // The shared hsd chain/mempool lock gives us a consistent block height and UTXO view.
  const unlock = await node.chain.locker.lock();
  try {
    const coins = (await node.getCoinsByAddress(address))
      .filter(coin => plainOutput(coin) && coin.address.equals(address))
      .map(coin => ({
        hash: coin.hash.toString('hex'),
        index: coin.index,
        height: coin.height,
        value: coin.value,
        coinbase: coin.coinbase,
        address: coin.address.toString(NETWORK)
      }));
    return {network: NETWORK, height: node.chain.height, coins};
  } finally {
    unlock();
  }
}

async function readAsset(distDir, filename) {
  try {
    const dir = await fs.lstat(distDir);
    if (!dir.isDirectory())
      throw new RequestError(404, 'Not found.');
    const file = await fs.open(path.join(distDir, filename), constants.O_RDONLY
      | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
    try {
      if (!(await file.stat()).isFile())
        throw new RequestError(404, 'Not found.');
      return await file.readFile();
    } finally {
      await file.close();
    }
  } catch (err) {
    if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes(err.code))
      throw new RequestError(404, 'Not found.');
    throw err;
  }
}

async function handle(req, res, {node, distDir, authority}) {
  securityHeaders(res);
  const origin = `http://${authority}`;
  let hostCount = 0;
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (req.rawHeaders[i].toLowerCase() === 'host')
      hostCount++;
  }
  if (hostCount !== 1 || req.headers.host !== authority)
    throw new RequestError(403, 'Unexpected Host.');
  if (req.headers.origin !== undefined && req.headers.origin !== origin)
    throw new RequestError(403, 'Cross-origin requests are not allowed.');
  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite !== undefined && fetchSite !== 'same-origin' && fetchSite !== 'none')
    throw new RequestError(403, 'Cross-origin requests are not allowed.');

  const target = req.url;
  if (target.length > MAX_TARGET_LENGTH)
    throw new RequestError(414, 'Request target is too long.');
  const split = target.indexOf('?');
  const pathname = split === -1 ? target : target.slice(0, split);
  const query = split === -1 ? null : target.slice(split + 1);
  const asset = STATIC.get(pathname);
  const method = API.get(pathname) || (asset ? 'GET' : undefined);
  if (!method)
    throw new RequestError(404, 'Not found.');
  if (req.method !== method && !(asset && req.method === 'HEAD')) {
    res.setHeader('Allow', asset ? 'GET, HEAD' : method);
    throw new RequestError(405, 'Method not allowed.');
  }
  if (method !== 'POST' && (req.headers['transfer-encoding']
      || Number(req.headers['content-length']) > 0)) {
    throw new RequestError(400, 'A request body is not allowed here.');
  }
  if (pathname !== '/api/coins' && query !== null)
    throw new RequestError(400, 'Query parameters are not allowed here.');

  if (asset) {
    const [filename, contentType] = asset;
    const body = await readAsset(distDir, filename);
    if (filename === 'signer.js')
      securityHeaders(res, true);
    res.writeHead(200, {'Content-Type': contentType, 'Content-Length': body.length});
    res.end(req.method === 'HEAD' ? undefined : body);
    return;
  }
  if (pathname === '/api/status') {
    sendJSON(res, 200, {network: NETWORK, height: node.chain.height});
    return;
  }
  if (pathname === '/api/coins') {
    sendJSON(res, 200, await getCoins(node, query || ''));
    return;
  }
  sendJSON(res, 200, await submitTransaction(node, req));
}

async function startGateway({node, port = DEFAULT_PORT, distDir = DIST, onError = console.error}) {
  if (!node || !node.opened || node.network.type !== NETWORK)
    throw new Error('An open regtest node is required.');
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('Web port must be an integer from 0 to 65535.');

  let authority;
  const active = new Set();
  const server = http.createServer({
    maxHeaderSize: 8192,
    headersTimeout: 5000,
    requestTimeout: 10000,
    connectionsCheckingInterval: 1000
  }, (req, res) => {
    const task = handle(req, res, {node, distDir, authority}).catch(err => {
      if (!(err instanceof RequestError) && !req.aborted)
        onError(err);
      if (res.destroyed)
        return;
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (!req.complete)
        res.setHeader('Connection', 'close');
      if (err instanceof RequestError)
        sendJSON(res, err.status, {error: err.message});
      else
        sendJSON(res, 500, {error: 'Internal regtest gateway error.'});
    });
    active.add(task);
    void task.finally(() => active.delete(task));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => {
      authority = `${HOST}:${server.address().port}`;
      server.off('error', reject);
      server.on('error', onError);
      resolve();
    });
  });

  let closing;
  function close() {
    if (!closing) {
      closing = new Promise((resolve, reject) => {
        server.close(err => err ? reject(err) : resolve());
        server.closeIdleConnections();
      }).then(() => Promise.allSettled(active)).then(() => undefined);
    }
    return closing;
  }
  return {origin: `http://${authority}`, close};
}

module.exports = {DEFAULT_PORT, NETWORK, parseAddress, startGateway};
