'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const {createInterface} = require('node:readline');
const {test} = require('node:test');
const {startRegtest} = require('../regtest.cjs');
const Address = require('hsd/lib/primitives/address');
const Coin = require('hsd/lib/primitives/coin');
const KeyRing = require('hsd/lib/primitives/keyring');
const MTX = require('hsd/lib/primitives/mtx');
const {types} = require('hsd/lib/covenants/rules');

const NETWORK = 'regtest';

function request(origin, target, {method = 'GET', headers, chunks = []} = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(origin, {path: target, method, headers}, res => {
      const body = [];
      res.on('data', chunk => body.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(body).toString('utf8')
      }));
    });
    req.on('error', reject);
    for (const chunk of chunks)
      req.write(chunk);
    req.end();
  });
}

function getCoins(origin, addr) {
  return request(origin, `/api/coins?address=${encodeURIComponent(addr)}`);
}

function post(origin, data) {
  return request(origin, '/api/transactions', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Origin: origin},
    chunks: [JSON.stringify(data)]
  });
}

async function staticFixture(t) {
  const distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'transfur-web-gateway-'));
  t.after(() => fs.rm(distDir, {recursive: true, force: true}));
  await Promise.all([
    fs.writeFile(path.join(distDir, 'index.html'), '<title>Wallet test</title>'),
    fs.writeFile(path.join(distDir, 'wallet.js'), 'void 0;'),
    fs.writeFile(path.join(distDir, 'signer.js'), 'void 1;'),
    fs.writeFile(path.join(distDir, 'wallet.css'), 'body {}'),
    fs.writeFile(path.join(distDir, 'not-servable.txt'), 'excluded')
  ]);
  return distDir;
}

async function open(t, distDir) {
  const service = await startRegtest({port: 0, distDir});
  t.after(() => service.close());
  return service;
}

test('loopback navigation allows only exact bundled assets and same-origin requests', {timeout: 10000}, async t => {
  const {origin} = await open(t, await staticFixture(t));
  const authority = new URL(origin).host;
  assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);

  const index = await request(origin, '/');
  assert.equal(index.status, 200);
  assert.equal(index.body, '<title>Wallet test</title>');
  assert.equal((await request(origin, '/index.html')).body, index.body);
  assert.equal((await request(origin, '/wallet.js')).body, 'void 0;');
  assert.equal((await request(origin, '/wallet.css')).body, 'body {}');
  assert.equal(index.headers['x-content-type-options'], 'nosniff');
  assert.equal(index.headers['cross-origin-resource-policy'], 'same-origin');
  assert.match(index.headers['content-security-policy'], /script-src 'self'/);
  assert.match(index.headers['content-security-policy'], /style-src 'self'/);
  assert.match(index.headers['content-security-policy'], /worker-src 'self'/);
  assert.doesNotMatch(index.headers['content-security-policy'], /unsafe-inline|unsafe-eval|https?:/);
  const signer = await request(origin, '/signer.js');
  assert.equal(signer.status, 200);
  assert.match(signer.headers['content-security-policy'], /connect-src 'none'/);

  for (const target of ['/not-servable.txt', '/api/rpc', '/api/fund', '/dist/wallet.js',
    '/../wallet.js', '/%2e%2e/wallet.js', 'http://' + authority + '/wallet.js']) {
    assert.equal((await request(origin, target)).status, 404, target);
  }

  assert.equal((await request(origin, '/', {headers: {Host: 'local.example'}})).status, 403);
  assert.equal((await request(origin, '/', {headers: ['Host', authority, 'Host', 'local.example']})).status, 403);
  assert.equal((await request(origin, '/api/status', {headers: {Origin: 'http://127.0.0.1:8'}})).status, 403);
  assert.equal((await request(origin, '/', {headers: {'Sec-Fetch-Site': 'cross-site'}})).status, 403);
  const options = await request(origin, '/api/transactions', {method: 'OPTIONS'});
  assert.equal(options.status, 405);
  assert.equal(options.headers.allow, 'POST');
  assert.equal(options.headers['access-control-allow-origin'], undefined);
});

test('disposable regtest funds a mature coin and validates full signed NONE payments', {timeout: 10000}, async t => {
  const service = await open(t);
  const {origin} = service;
  const fundingKey = KeyRing.generate();
  const funding = fundingKey.getAddress().toString(NETWORK);
  const recipient = KeyRing.generate().getAddress();
  const destination = recipient.toString(NETWORK);

  assert.deepEqual(JSON.parse((await request(origin, '/api/status')).body), {network: NETWORK, height: 0});
  assert.deepEqual(JSON.parse((await getCoins(origin, funding)).body), {network: NETWORK, height: 0, coins: []});
  assert.equal((await getCoins(origin, fundingKey.getAddress().toString('main'))).status, 400);
  assert.equal((await request(origin, `/api/coins?address=${funding}&address=${funding}`)).status, 400);
  assert.equal((await request(origin, `/api/coins?address=${funding}&x=ignored`)).status, 400);
  assert.equal((await getCoins(origin, 'a'.repeat(1100))).status, 414);

  assert.deepEqual(await service.fund(funding), {funded: funding, height: 2});
  const funded = JSON.parse((await getCoins(origin, funding.toUpperCase())).body);
  assert.equal(funded.height, 2);
  assert.equal(funded.coins.length, 1);
  const [coin] = funded.coins;
  assert.deepEqual(coin, {hash: coin.hash, index: 0, height: 1, value: 2000000000,
    coinbase: true, address: funding});
  assert.match(coin.hash, /^[a-f0-9]{64}$/);

  function payment(change = () => {}, inputHash = coin.hash) {
    const mtx = new MTX();
    mtx.addCoin(Coin.fromJSON({version: 0, ...coin, hash: inputHash}, NETWORK));
    mtx.addOutput(recipient, 1000000);
    mtx.addOutput(fundingKey.getAddress(), coin.value - 1000000 - 10000);
    assert.equal(mtx.sign(fundingKey), 1);
    change(mtx);
    return mtx.toTX();
  }

  const transaction = payment();
  const hex = transaction.encode().toString('hex');
  assert.equal((await post(origin, {hex, privateKey: 'never sent by clients'})).status, 400);
  assert.equal((await post(origin, {hex: hex + '00'})).status, 400);
  assert.equal((await post(origin, {hex: hex + '1\n'})).status, 400);
  assert.equal((await post(origin, {hex: payment(mtx => {
    mtx.outputs[0].covenant.type = types.OPEN;
  }).encode().toString('hex')})).status, 422);
  assert.equal((await post(origin, {hex: payment(mtx => {
    mtx.outputs[0].covenant.push(Buffer.from([1]));
  }).encode().toString('hex')})).status, 422);
  assert.equal((await post(origin, {hex: payment(mtx => {
    mtx.inputs[0].witness.items[0][0] ^= 1;
  }).encode().toString('hex')})).status, 422);
  assert.equal((await post(origin, {hex: payment(undefined, 'ab'.repeat(32)).encode().toString('hex')})).status, 422);
  assert.deepEqual(JSON.parse((await getCoins(origin, destination)).body).coins, []);

  const sent = await post(origin, {hex});
  assert.equal(sent.status, 200, sent.body);
  assert.deepEqual(JSON.parse(sent.body), {txid: transaction.txid()});
  assert.equal((await post(origin, {hex})).status, 422);

  const pending = JSON.parse((await getCoins(origin, destination)).body);
  assert.deepEqual(pending.coins, [{hash: transaction.txid(), index: 0, height: -1,
    value: 1000000, coinbase: false, address: destination}]);
  assert.equal(JSON.parse((await getCoins(origin, funding)).body).coins.some(c => c.hash === coin.hash), false);
  assert.deepEqual(await service.mine(), {height: 3});
  assert.deepEqual(JSON.parse((await getCoins(origin, destination)).body).coins,
    [{...pending.coins[0], height: 3}]);
});

test('HTTP transaction body and hex limits apply before hsd submission', {timeout: 10000}, async t => {
  const {origin} = await open(t);
  assert.equal((await request(origin, '/api/transactions', {
    method: 'POST', headers: {'Content-Type': 'text/plain'}, chunks: ['a']
  })).status, 415);
  assert.equal((await request(origin, '/api/transactions', {
    method: 'POST', headers: {'Content-Type': 'application/json', 'Content-Encoding': 'gzip'},
    chunks: ['{}']
  })).status, 415);
  assert.equal((await request(origin, '/api/transactions', {
    method: 'POST', headers: {'Content-Type': 'application/json', 'Content-Length': 100000000},
    chunks: ['{}']
  })).status, 413);
  assert.equal((await request(origin, '/api/transactions', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, chunks: [
      '{"hex":"', '00'.repeat(20000), '00'.repeat(20000), '"}'
    ]
  })).status, 413);
  assert.equal((await post(origin, {hex: 'ab'.repeat(32769)})).status, 413);
});

test('CLI stdin drives the same ephemeral process and SIGTERM shuts it down', {timeout: 10000}, async t => {
  const child = spawn(process.execPath, [require.resolve('../regtest.cjs'), 'serve'], {
    env: {...process.env, TRANSFUR_WEB_PORT: '0'}, stdio: ['pipe', 'pipe', 'pipe']
  });
  const exit = once(child, 'exit');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGTERM');
    await exit;
  });
  let stderr = '';
  child.stderr.on('data', data => { stderr += data.toString(); });
  const output = createInterface({input: child.stdout})[Symbol.asyncIterator]();
  const ready = JSON.parse((await output.next()).value);
  assert.equal(ready.network, NETWORK);
  const address = Address.fromHash(Buffer.alloc(20, 2), 0).toString(NETWORK);
  child.stdin.write(`fund ${address}\n`);
  assert.deepEqual(JSON.parse((await output.next()).value), {funded: address, height: 2});
  assert.equal(JSON.parse((await getCoins(ready.origin, address)).body).coins.length, 1);
  child.stdin.write('mine\n');
  assert.deepEqual(JSON.parse((await output.next()).value), {height: 3});
  child.kill('SIGTERM');
  assert.deepEqual(await exit, [0, null], stderr);
  await assert.rejects(request(ready.origin, '/api/status'), {code: 'ECONNREFUSED'});
});
