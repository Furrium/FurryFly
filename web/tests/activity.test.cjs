const assert = require('node:assert/strict');
const {test} = require('node:test');
const {mergeActivity} = require('../src/activity.cjs');
const {makeReceiveQR} = require('../src/receive-qr.cjs');
const i18n = require('../src/i18n.cjs');

const address = 'rs1qqlm0lvnf3dnydwx97pgk9yr7cqgyjhejju0t9m';
const other = 'rs1qvk6r03l7ql09e89lhp9ncdsrwz77een0wv8k0e';
const txid = h => h.repeat(64).slice(0, 64);

function page(height, transactions = [], truncated) {
  return {network: 'regtest', height, ...(truncated ? {truncated: true} : {}), transactions};
}

test('activity merges the same transaction seen by receive and change addresses', () => {
  const shared = {txid: txid('a'), height: 8, time: 1_700_000_000, coinbase: false,
    inputs: [{address, value: 2_000_000}],
    outputs: [{address: other, value: 2_000_000}]};
  const reward = {txid: txid('b'), height: 1, time: 1_699_000_000, coinbase: true,
    inputs: [], outputs: [{address: other, value: 2_000_000}]};
  const result = mergeActivity([page(9, [shared]), page(9, [shared, reward])], [address, other], 9);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.rows.map(row => [row.txid, row.kind, row.value, row.state, row.confirmations]), [
    [txid('a'), 'self', 0, 'confirmed', 2],
    [txid('b'), 'reward', 2_000_000, 'confirmed', 9],
  ]);
});

test('activity refuses inconsistent, foreign, or malformed rows', () => {
  const valid = {txid: txid('c'), height: 2, time: 1_700_000_000, coinbase: false,
    inputs: [{address, value: 1}], outputs: [{address, value: 1}]};
  assert.throws(() => mergeActivity([page(2, [valid])], [other], 2), /activity/i);
  assert.throws(() => mergeActivity([page(3, [valid])], [address], 2), /activity/i);
  assert.throws(() => mergeActivity([page(2, [valid]), page(2, [{...valid, outputs: []}])], [address, address], 2), /activity/i);
  assert.throws(() => mergeActivity([page(2, [valid, valid])], [address], 2), /activity/i);
  assert.throws(() => mergeActivity([page(2, [{...valid, outputs: [{address, value: 1.5}]}])], [address], 2), /activity/i);
});

test('activity marks pending and immature rewards without inventing a direction', () => {
  const pending = {txid: txid('d'), height: -1, time: 1_700_000_100, coinbase: false,
    inputsComplete: false, inputs: [], outputs: [{address, value: 10}]};
  const immature = {txid: txid('e'), height: 5, time: 1_700_000_000, coinbase: true,
    inputs: [], outputs: [{address, value: 10}]};
  const result = mergeActivity([page(5, [pending, immature])], [address], 5);
  assert.equal(result.rows[0].state, 'pending');
  assert.equal(result.rows[0].kind, 'unknown');
  assert.equal(result.rows[0].value, null);
  assert.equal(result.rows[1].state, 'immature');
  assert.equal(result.rows[1].kind, 'reward');
});

test('the wallet translates status and error copy in English and Chinese', () => {
  for (const language of ['en', 'zh-CN']) {
    assert.equal(i18n.setLanguage(language), true);
    assert.ok(i18n.t('activity.received').length > 0);
    assert.ok(i18n.t('activity.confirmedOne', {count: 1}).length > 0);
    assert.match(i18n.translateError({code: 'error.unlockFailed'}), /./);
    assert.match(i18n.translateError('Could not unlock. Check your password.'), /./);
  }
  assert.equal(i18n.setLanguage('fr'), false);
  assert.equal(i18n.resolveLanguage(['zh-Hans-CN']), 'zh-CN');
  assert.equal(i18n.resolveLanguage(['en-GB']), 'en');
});

test('the receive QR and history accept mainnet addresses too', () => {
  const hs = 'hs1qz3fnjn70fs7rdxt57fhrl4yzsqngg55sqyz83a';
  assert.ok(makeReceiveQR(hs).size > 0);
  const row = {txid: txid('f'), height: 1, time: 1_700_000_000, coinbase: false,
    inputs: [], outputs: [{address: hs, value: 1}]};
  assert.equal(mergeActivity([page(1, [row])], [hs], 1).rows[0].kind, 'received');
});

test('the receive QR contains the address as a bounded SVG matrix', () => {
  const qr = makeReceiveQR(address);
  assert.ok(qr.size >= 21 && qr.size <= 200);
  assert.match(qr.path, /^M\d+ \d+h1v1h-1z/);
  assert.throws(() => makeReceiveQR('not-an-address'));
});
