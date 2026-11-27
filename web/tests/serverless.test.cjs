'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {test} = require('node:test');

process.env.NODE_BACKEND = 'js';
const {createHandler} = require('../serverless/handler.cjs');
const FullNode = require('hsd/lib/node/fullnode');
const Address = require('hsd/lib/primitives/address');
const Block = require('hsd/lib/primitives/block');
const Coin = require('hsd/lib/primitives/coin');
const Network = require('hsd/lib/protocol/network');
const KeyRing = require('hsd/lib/primitives/keyring');
const MTX = require('hsd/lib/primitives/mtx');
const {types} = require('hsd/lib/covenants/rules');

const NETWORK = 'regtest';
const env = Object.freeze({
  TRANSFUR_WEB_ORIGIN: 'https://wallet.example',
  TRANSFUR_HSD_URL: 'https://hsd.internal.example:8443',
  TRANSFUR_HSD_API_KEY: 'unit-test:key'
});
const web = env.TRANSFUR_WEB_ORIGIN;
const nodeOrigin = env.TRANSFUR_HSD_URL;
const AUTH = `Basic ${Buffer.from(`x:${env.TRANSFUR_HSD_API_KEY}`).toString('base64')}`;
const address = Address.fromHash(Buffer.alloc(20, 1), 0).toString(NETWORK);
const altAddress = Address.fromHash(Buffer.alloc(20, 2), 0).toString(NETWORK);
const coinPath = addr => `/api/coins?address=${encodeURIComponent(addr)}`;
const historyPath = addr => `/api/history?address=${encodeURIComponent(addr)}`;
const regtest = Network.get(NETWORK);
const [genesisTX] = Block.decode(regtest.genesisBlock).txs;
const genesisIndexPath = `/tx/address/${genesisTX.outputs[0].address.toString(NETWORK)}`;
const status = (network = NETWORK, height = 2) => Response.json({network, chain: {height}, secret: 'not public'});
const MAX_BODY = 2 * 32768 + 1024;

function request(target, init) {
  return new Request(`${web}${target}`, init);
}

function post(body, headers, extra) {
  return request('/api/transactions', {
    method: 'POST',
    body: typeof body === 'string' || body instanceof ReadableStream || body instanceof Uint8Array
      ? body : JSON.stringify(body),
    headers: {Origin: web, 'Content-Type': 'application/json', ...headers},
    ...extra
  });
}

function mock(t, upstream, options = {}) {
  const calls = [];
  const fetch = t.mock.fn(async (target, init) => {
    const url = new URL(target);
    calls.push([init.method, url.pathname, init.body]);
    assert.equal(url.origin, nodeOrigin);
    assert.equal(url.search, '');
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.cache, 'no-store');
    const headers = new Headers(init.headers);
    assert.equal(headers.get('authorization'), AUTH);
    assert.deepEqual([...headers.keys()], init.method === 'GET'
      ? ['accept', 'authorization'] : ['accept', 'authorization', 'content-type']);
    return upstream(url.pathname, init);
  });
  return {handle: createHandler({env, fetch, ...options}), calls};
}

function assertPrivate(response) {
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(response.headers.get('www-authenticate'), null);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('location'), null);
}

function row(override = {}) {
  return {
    version: 0, hash: 'ab'.repeat(32), index: 0, height: 1, value: 2000000000, coinbase: true, address,
    covenant: {type: types.NONE, action: 'NONE', items: []}, ...override
  };
}

function historyMeta(tx, height = -1, time = 1700000000) {
  return {...tx.getJSON(NETWORK), height, mtime: time, time: height === -1 ? 0 : time,
    block: height === -1 ? null : '12'.repeat(32)};
}

function genesisIndex() {
  return Response.json([{...historyMeta(genesisTX, 0, regtest.genesis.time),
    block: regtest.genesis.hash.toString('hex')}]);
}

function submission(coin = row(), fee = 10000, alter = () => {}) {
  const key = KeyRing.generate();
  const destination = KeyRing.generate().getAddress();
  const mtx = new MTX();
  mtx.addCoin(Coin.fromJSON({...coin, address: key.getAddress().toString(NETWORK)}, NETWORK));
  mtx.addOutput(destination, 1000000);
  mtx.addOutput(key.getAddress(), coin.value - 1000000 - fee);
  assert.equal(mtx.sign(key), 1);
  alter(mtx);
  return mtx.toTX();
}

test('fails closed on missing or insecure trusted configuration', () => {
  for (const [name, value] of [
    ['TRANSFUR_WEB_ORIGIN', undefined], ['TRANSFUR_WEB_ORIGIN', 'http://wallet.example'],
    ['TRANSFUR_WEB_ORIGIN', 'https://wallet.example/?'], ['TRANSFUR_WEB_ORIGIN', 'https://wallet.example/#'],
    ['TRANSFUR_HSD_URL', 'http://hsd.internal.example'], ['TRANSFUR_HSD_URL', 'https://hsd.internal.example/path'],
    ['TRANSFUR_HSD_URL', 'https://wallet.example/'], ['TRANSFUR_HSD_URL', 'https://secret@hsd.internal.example'],
    ['TRANSFUR_HSD_URL', 'https://hsd.internal.example\\escape'],
    ['TRANSFUR_HSD_API_KEY', ''], ['TRANSFUR_HSD_API_KEY', '秘密'], ['TRANSFUR_HSD_API_KEY', 'x\n'],
    ['TRANSFUR_HSD_API_KEY', 'x'.repeat(256)]
  ]) {
    assert.throws(() => createHandler({env: {...env, [name]: value}}), err =>
      err instanceof TypeError && !err.message.includes('secret@'));
  }
});

test('exposes only the allowed same-origin API routes and never forwards browser headers', async t => {
  const {handle, calls} = mock(t, () => status());
  const valid = await handle(request('/api/status', {headers: {
    Authorization: 'untrusted', Cookie: 'untrusted', 'X-Forwarded-Host': 'untrusted.example', Host: 'anything'
  }}));
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), {network: NETWORK, height: 2});
  assertPrivate(valid);

  for (const [expected, req] of [
    [404, request('/api/rpc')], [404, request('/api/transactions/')], [404, request('/api/%73tatus')],
    [405, request('/api/transactions', {method: 'OPTIONS'})], [405, request('/api/status', {method: 'HEAD'})],
    [403, request('/api/status', {headers: {Origin: 'https://evil.example'}})],
    [403, request('/api/status', {headers: {'Sec-Fetch-Site': 'same-site'}})],
    [403, new Request('https://evil.example/api/status', {headers: {Origin: web}})],
    [403, request('/api/transactions', {method: 'POST', headers: {'Content-Type': 'application/json'}})],
    [403, post({hex: '00'}, {Origin: 'null'})], [403, post({hex: '00'}, {Origin: `${web}, ${web}`})],
    [403, post({hex: '00'}, {'Sec-Fetch-Site': 'cross-site'})], [400, request('/api/status?')],
    [400, request('/api/status#')], [400, request('/api/status', {headers: {'Content-Length': '1'}})],
    [414, request(coinPath('a'.repeat(1100)))], [400, request(coinPath('https://evil.example'))],
    [400, request(`/api/coins?address=${address}&another=${address}`)],
    [400, request(`/api/coins?address=${address}&address=${address}`)], [400, request('/api/coins')],
    [400, request(coinPath(Address.fromHash(Buffer.alloc(20, 1), 0).toString('main')))],
    [403, request(historyPath(address), {headers: {
      'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document'
    }})],
    [405, request(historyPath(address), {method: 'HEAD'})], [400, request('/api/history')],
    [400, request(`${historyPath(address)}&address=${altAddress}`)], [400, request(`${historyPath(address)}&limit=1`)],
    [400, request(historyPath(Address.fromHash(Buffer.alloc(20, 1), 0).toString('main')))],
    [414, request(historyPath('x'.repeat(1100)))]
  ]) {
    const result = await handle(req);
    assert.equal(result.status, expected, `${req.method} ${req.url}: ${await result.text()}`);
    assertPrivate(result);
    if (expected === 405)
      assert.equal(result.headers.get('allow'), req.method === 'OPTIONS' ? 'POST' : 'GET');
  }
  assert.deepEqual(calls, [['GET', '/', undefined]]);
});

test('verifies network for every operation and sanitizes node failures', async t => {
  const tx = submission();
  for (const reply of [
    () => status('main'), () => status(NETWORK, -1), () => status(NETWORK, 0x7fffffff),
    () => new Response('private auth error', {status: 401, headers: {
      'WWW-Authenticate': 'Basic realm="private"', 'Set-Cookie': 'secret=1'
    }}),
    () => new Response(null, {status: 307, headers: {Location: 'https://evil.example/collect'}}),
    () => new Response('<h1>private</h1>', {headers: {'Content-Type': 'text/html'}}),
    () => new Response('{bad json', {headers: {'Content-Type': 'application/json'}}),
    () => { throw new Error('private upstream authorization ' + AUTH); }
  ]) {
    const {handle, calls} = mock(t, reply);
    for (const req of [request('/api/status'), request(coinPath(address)), post({hex: tx.toHex()})]) {
      const result = await handle(req);
      assert.equal(result.status, 502);
      assertPrivate(result);
      assert.deepEqual(await result.json(), {error: 'Invalid or unavailable regtest upstream.'});
    }
    assert.deepEqual(calls.map(call => call[1]), ['/', '/', '/']);
  }
});

test('validates and caps node coin data and returns only matching NONE payments', async t => {
  const valid = row();
  const pending = row({hash: 'cd'.repeat(32), height: -1, coinbase: false});
  const covenant = row({covenant: {type: types.OPEN, action: 'OPEN', items: []}});
  const invalidNone = row({covenant: {type: types.NONE, action: 'NONE', items: ['00']}});
  const wrongAction = row({covenant: {type: types.NONE, action: 'OPEN', items: []}});
  const {handle, calls} = mock(t, part => part === '/' ? status()
    : Response.json([valid, pending, covenant, invalidNone, wrongAction, row({address: altAddress})]));
  const result = await handle(request(coinPath(address.toUpperCase())));
  assert.equal(result.status, 200);
  const publicCoin = ({version, covenant, ...coin}) => coin;
  assert.deepEqual(await result.json(), {network: NETWORK, height: 2, coins: [valid, pending].map(publicCoin)});
  assert.deepEqual(calls.map(call => call[1]), ['/', `/coin/address/${address}`]);

  let height = 1;
  const advancing = mock(t, part => part === '/' ? status(NETWORK, height++) : Response.json([row({height: 2})]));
  assert.equal((await (await advancing.handle(request(coinPath(address)))).json()).height, 2);
  assert.deepEqual(advancing.calls.map(call => call[1]), ['/', `/coin/address/${address}`, '/']);

  for (const data of [
    {}, [row({covenant: undefined})], [row({value: 2040000000000001})], [row({hash: 'ab'.repeat(32) + '\n'})],
    [row({index: 0x100000000})], [row({height: 3})], [row({coinbase: 1})], [row({address: 'wrong'})],
    [valid, valid], Array.from({length: 513}, (_, index) => row({index})), Array(1025).fill(covenant)
  ]) {
    const invalid = mock(t, part => part === '/' ? status() : Response.json(data));
    assert.equal((await invalid.handle(request(coinPath(address)))).status, 502);
  }
});

test('rejects invalid, oversized and non-payment transaction requests before node access', async t => {
  const tx = submission();
  const hex = tx.toHex();
  const {handle, calls} = mock(t, () => status());
  for (const [expected, req] of [
    [415, post('{}', {'Content-Type': 'text/plain'})], [415, post('{}', {'Content-Encoding': 'gzip'})],
    [413, post('{}', {'Content-Length': String(MAX_BODY + 1)})], [413, post({hex: '01'.repeat(32769)})],
    [400, post('{not json}')], [400, post(new Uint8Array([0x80]))], [400, post({hex, key: 'no'})],
    [400, post({hex: `${hex}00`})], [400, post({hex: `${hex}\n`})], [400, post({hex: '00'})], [400, post([hex])],
    [422, post({hex: submission(undefined, undefined, mtx => {
      mtx.outputs[0].covenant.type = types.OPEN;
    }).toHex()})],
    [422, post({hex: submission(undefined, undefined, mtx => {
      mtx.outputs[0].covenant.push(Buffer.from([1]));
    }).toHex()})],
    [413, post({hex: submission(undefined, undefined, mtx => {
      for (let i = 0; i < 127; i++)
        mtx.addOutput(mtx.outputs[0].address, 1000);
    }).toHex()})]
  ]) {
    const response = await handle(req);
    assert.equal(response.status, expected, await response.text());
  }

  const oversized = new ReadableStream({start(controller) {
    controller.enqueue(new Uint8Array(40000));
    controller.enqueue(new Uint8Array(40000));
    controller.close();
  }});
  assert.equal((await handle(post(oversized, {}, {duplex: 'half'}))).status, 413);
  assert.deepEqual(calls, []);
});

test('bounds upstream responses and times out stalled headers and response bodies', {timeout: 5000}, async t => {
  const binary = Uint8Array.from([0xff]);
  const headers = {'Content-Type': 'application/json'};
  for (const reply of [
    () => new Response(binary, {headers}),
    () => new Response(binary, {headers: {...headers, 'Content-Length': '32769'}}),
    () => new Response(new ReadableStream({start(controller) {
      controller.enqueue(new Uint8Array(20000));
      controller.enqueue(new Uint8Array(20000));
      controller.close();
    }}), {headers})
  ]) {
    const {handle} = mock(t, reply);
    assert.equal((await handle(request('/api/status'))).status, 502);
  }

  let signal;
  let streamCancelled = false;
  const delayed = mock(t, (part, init) => {
    signal = init.signal;
    return new Promise(() => {});
  }, {timeoutMs: 30});
  assert.equal((await delayed.handle(request('/api/status'))).status, 504);
  assert.equal(signal.aborted, true);

  const stalled = mock(t, () => new Response(new ReadableStream({
    cancel() { streamCancelled = true; }
  }), {headers}), {timeoutMs: 30});
  assert.equal((await stalled.handle(request('/api/status'))).status, 504);
  assert.equal(streamCancelled, true);

  const body = new ReadableStream({cancel() { streamCancelled = true; }});
  streamCancelled = false;
  assert.equal((await stalled.handle(post(body, {}, {duplex: 'half'}))).status, 408);
  assert.equal(streamCancelled, true);
});

test('preflights exact NONE inputs and requires the submitted witness in a pending receipt', async t => {
  const coin = row();
  const tx = submission(coin);
  const hex = tx.toHex();
  const receipt = {hash: tx.txid(), witnessHash: tx.wtxid(), hex, height: -1, block: null};
  const getInput = `/coin/${coin.hash}/${coin.index}`;
  const getTx = `/tx/${tx.txid()}`;

  for (const [reply, expected] of [
    [() => new Response(null, {status: 404}), 422],
    [() => Response.json(row({index: 1})), 502],
    [() => Response.json(row({covenant: {type: types.OPEN, action: 'OPEN', items: []}})), 422]
  ]) {
    const {handle, calls} = mock(t, part => part === '/' ? status() : reply());
    assert.equal((await handle(post({hex}))).status, expected);
    assert.deepEqual(calls.map(call => call[1]), ['/', getInput]);
  }

  for (const [reply, expected] of [
    [() => new Response(null, {status: 404}), 422], [() => Response.json({}), 502],
    [() => Response.json({...receipt, witnessHash: '11'.repeat(32)}), 422],
    [() => Response.json({...receipt, hex: hex + '00'}), 422],
    [() => Response.json({...receipt, height: 3, block: '11'.repeat(32)}), 422],
    [() => Response.json(receipt), 200]
  ]) {
    const {handle, calls} = mock(t, part => {
      if (part === '/') return status();
      if (part === getInput) return Response.json(coin);
      if (part === '/broadcast') return Response.json({success: true});
      if (part === getTx) return reply();
      assert.fail(`Unexpected upstream endpoint ${part}`);
    });
    const response = await handle(post({hex: hex.toUpperCase()}));
    assert.equal(response.status, expected);
    assert.deepEqual(calls, [
      ['GET', '/', undefined], ['GET', getInput, undefined],
      ['POST', '/broadcast', JSON.stringify({tx: hex})], ['GET', getTx, undefined]
    ]);
    if (expected === 200)
      assert.deepEqual(await response.json(), {txid: tx.txid()});
  }
});

test('real authenticated hsd REST distinguishes broadcast acknowledgement from mempool admission',
  {timeout: 15000}, async t => {
    const prefix = await fs.mkdtemp(path.join(os.tmpdir(), 'transfur-web-serverless-test-'));
    const node = new FullNode({
      network: NETWORK, memory: true, prefix, listen: false, noDNS: true, workers: false,
      indexAddress: true, indexTX: false, requireStandard: true, rejectAbsurdFees: true,
      httpHost: '127.0.0.1', httpPort: 0, apiKey: env.TRANSFUR_HSD_API_KEY
    });
    const nodeErrors = [];
    node.on('error', err => nodeErrors.push(err));
    t.after(async () => {
      try {
        if (node.opened)
          await node.close();
      } finally {
        await fs.rm(prefix, {recursive: true, force: true});
      }
    });
    await node.open();
    const local = `http://127.0.0.1:${node.http.address().port}`;
    assert.equal((await fetch(local)).status, 401);
    const upstreamCalls = [];
    // Only the test transport rewrites the fixed HTTPS origin to hsd's real loopback HTTP socket.
    const {handle} = mock(t, async (part, init) => {
      const result = await fetch(local + part, init);
      upstreamCalls.push([part, result.status]);
      return result;
    });

    async function mine(recipient) {
      const block = await node.miner.mineBlock(null, recipient);
      assert.ok(await node.chain.add(block));
    }

    const key = KeyRing.generate();
    const from = key.getAddress().toString(NETWORK);
    const to = KeyRing.generate().getAddress();
    const destination = to.toString(NETWORK);
    assert.deepEqual(await (await handle(request('/api/status'))).json(), {network: NETWORK, height: 0});
    await mine(key.getAddress());
    await mine(KeyRing.generate().getAddress());
    const funded = await (await handle(request(coinPath(from)))).json();
    assert.equal(funded.height, 2);
    assert.equal(funded.coins.length, 1);
    const [coin] = funded.coins;
    assert.equal(coin.height, 1);
    assert.equal(coin.coinbase, true);

    function payment(fee, change = () => {}) {
      const mtx = new MTX();
      mtx.addCoin(Coin.fromJSON({...coin, version: 0}, NETWORK));
      mtx.addOutput(to, 1000000);
      mtx.addOutput(key.getAddress(), coin.value - 1000000 - fee);
      assert.equal(mtx.sign(key), 1);
      change(mtx);
      return mtx.toTX();
    }

    const invalidWitness = payment(10000, mtx => { mtx.inputs[0].witness.items[0][0] ^= 1; });
    assert.equal((await handle(post({hex: invalidWitness.toHex()}))).status, 422);
    assert.deepEqual(upstreamCalls.at(-1), ['/broadcast', 500]);
    const absurdFee = payment(coin.value - 2000000);
    const rejected = await handle(post({hex: absurdFee.toHex()}));
    assert.equal(rejected.status, 422);
    assert.match((await rejected.json()).error, /could not verify/i);
    assert.deepEqual(upstreamCalls.slice(-2), [['/broadcast', 200], [`/tx/${absurdFee.txid()}`, 404]]);
    assert.equal(node.mempool.hasEntry(absurdFee.hash()), false);
    assert.ok(nodeErrors.some(err => err.reason === 'absurdly-high-fee'));

    const transaction = payment(10000);
    const hex = transaction.toHex();
    const sent = await handle(post({hex}));
    assert.equal(sent.status, 200);
    assert.deepEqual(await sent.json(), {txid: transaction.txid()});
    assert.equal(node.mempool.hasEntry(transaction.hash()), true);
    assert.deepEqual(upstreamCalls.slice(-2), [['/broadcast', 200], [`/tx/${transaction.txid()}`, 200]]);
    assert.equal((await handle(post({hex}))).status, 422);
    assert.deepEqual(upstreamCalls.at(-1), [`/coin/${coin.hash}/${coin.index}`, 404]);

    const pending = await (await handle(request(coinPath(destination)))).json();
    const received = {hash: transaction.txid(), index: 0, height: -1, value: 1000000,
      coinbase: false, address: destination};
    assert.deepEqual(pending.coins, [received]);
    const fromCoins = await (await handle(request(coinPath(from)))).json();
    assert.equal(fromCoins.coins.some(out => out.hash === coin.hash), false);
    await mine(KeyRing.generate().getAddress());
    const confirmed = await (await handle(request(coinPath(destination)))).json();
    assert.deepEqual(confirmed, {network: NETWORK, height: 3, coins: [{...received, height: 3}]});
  });
