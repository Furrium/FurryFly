const assert = require('node:assert/strict');
const {test} = require('node:test');
process.env.NODE_BACKEND = 'js';
const KeyRing = require('hsd/lib/primitives/keyring');
const TX = require('hsd/lib/primitives/tx');
const {parseAmount, formatAmount} = require('../src/units.cjs');
const {newPhrase, openWallet, prepareTransfer} = require('../src/wallet.cjs');
const {encryptMnemonic, decryptMnemonic} = require('../src/vault.cjs');

// Public BIP39 test vector; never use this phrase to hold funds.
const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

test('HNS amounts are converted exactly without floating-point decimal parsing', () => {
  for (const amount of ['0.000001', '2000', '1.23', '2040000000']) {
    assert.equal(formatAmount(parseAmount(amount)), amount);
  }
  for (const invalid of ['0', '0.0000001', '-1', '+1', '1e3', '1,5', '2040000000.000001']) {
    assert.throws(() => parseAmount(invalid));
  }
});

test('the local vault encrypts with unique salt/IV and rejects tampering', async () => {
  const password = 'example password 2026';
  const first = await encryptMnemonic(phrase, password);
  const second = await encryptMnemonic(phrase, password);
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.encrypted, second.encrypted);
  assert.equal(JSON.stringify(first).includes(phrase), false);
  assert.equal(await decryptMnemonic(first, password), phrase);
  await assert.rejects(decryptMnemonic(first, 'incorrect password'), /Could not unlock/);
  const byte = first.encrypted.endsWith('00') ? '01' : '00';
  await assert.rejects(decryptMnemonic({...first, encrypted: first.encrypted.slice(0, -2) + byte}, password), /Could not unlock/);
  await assert.rejects(decryptMnemonic({...first, network: 'main'}, password), /unsupported/);
});

test('BIP39 checksums and regtest receive/change derivation are enforced', () => {
  const generated = newPhrase();
  assert.equal(generated.split(' ').length, 12);
  assert.equal(openWallet(generated).phrase, generated);
  assert.throws(() => openWallet('abandon '.repeat(12)), /checksum/);
  const {addresses, receiveAddresses, changeRing} = openWallet(phrase);
  assert.equal(receiveAddresses.length, 5);
  assert.equal(new Set(addresses).size, 6);
  assert.deepEqual(addresses, [...receiveAddresses, changeRing.getAddress().toString('regtest')]);
  assert.deepEqual(openWallet(phrase.toUpperCase()).addresses, addresses);
  assert.ok(addresses.every(address => /^rs1/.test(address)));
});

test('mainnet derivation, recipient validation and vaults stay separate from regtest', async () => {
  const {addresses, receiveAddresses, maturity} = openWallet(phrase, 'main');
  assert.ok(addresses.every(address => /^hs1/.test(address)));
  assert.notDeepEqual(addresses, openWallet(phrase, 'regtest').addresses);
  assert.equal(maturity, 100);
  const recipient = KeyRing.generate().getAddress().toString('main');
  const coin = {hash: '02'.repeat(32), index: 0, height: 100, value: 3_000_000,
    coinbase: true, address: receiveAddresses[0]};
  const prepared = await prepareTransfer({wallet: openWallet(phrase, 'main'), recipient,
    amount: '1', height: 200, coins: [coin]});
  assert.match(prepared.review.recipient, /^hs1/);
  const vault = await encryptMnemonic(phrase, 'mainnet password 2026', 'main');
  assert.equal(vault.network, 'main');
  assert.equal(await decryptMnemonic(vault, 'mainnet password 2026', 'main'), phrase);
  await assert.rejects(decryptMnemonic(vault, 'mainnet password 2026', 'regtest'), /unsupported/);
});

test('transaction review applies network, ownership, maturity, dust and fee constraints', async () => {
  const wallet = openWallet(phrase);
  const ring = KeyRing.generate();
  const recipient = ring.getAddress().toString('regtest');
  const coin = {hash: '01'.repeat(32), index: 0, height: 8, value: 3_000_000,
    coinbase: true, address: wallet.receiveAddresses[4]};
  const draft = {wallet, recipient, amount: '1.25', height: 9, coins: [coin]};
  await assert.rejects(prepareTransfer({...draft, height: 8}), /No confirmed, mature funds/);
  await assert.rejects(prepareTransfer({...draft, coins: [coin, coin]}), /duplicate/);
  await assert.rejects(prepareTransfer({...draft, coins: [{...coin, address: recipient}]}), /does not match/);
  await assert.rejects(prepareTransfer({...draft, recipient: ring.getAddress().toString('main')}), /regtest address/);
  await assert.rejects(prepareTransfer({...draft, amount: '0.000001'}), /too small/);
  await assert.rejects(prepareTransfer({...draft, amount: '4'}), /Not enough/);
  const prepared = await prepareTransfer(draft);
  assert.equal(prepared.review.value, 1_250_000);
  assert.ok(prepared.review.fee > 0 && prepared.review.fee <= 10_000);
  assert.equal(prepared.review.hex, undefined);
  const {txid, hex} = prepared.finalize();
  const tx = TX.decode(Buffer.from(hex, 'hex'));
  assert.equal(tx.txid(), txid);
  assert.deepEqual(tx.outputs.map(output => output.address.toString('regtest')), [recipient, wallet.changeRing.getAddress().toString('regtest')]);
  assert.deepEqual(tx.outputs.map(output => output.value), [1_250_000, 1_750_000 - prepared.review.fee]);
});
