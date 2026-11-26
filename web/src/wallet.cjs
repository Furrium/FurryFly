const Mnemonic = require('hsd/lib/hd/mnemonic');
const HDPrivateKey = require('hsd/lib/hd/private');
const Address = require('hsd/lib/primitives/address');
const Coin = require('hsd/lib/primitives/coin');
const KeyRing = require('hsd/lib/primitives/keyring');
const MTX = require('hsd/lib/primitives/mtx');
const Output = require('hsd/lib/primitives/output');
const TX = require('hsd/lib/primitives/tx');
const Network = require('hsd/lib/protocol/network');
const policy = require('hsd/lib/protocol/policy');
const {parseAmount} = require('./units.cjs');
const {COINBASE_MATURITY, isSpendable, validateCoins} = require('./coins.cjs');

const network = Network.get('regtest');
if (network.coinbaseMaturity !== COINBASE_MATURITY) throw new Error('Unexpected regtest coinbase maturity.');
const feeRate = 2_000;
const maxFee = 10_000;

function newPhrase() {
  return new Mnemonic({bits: 128, language: 'english'}).getPhrase();
}

function parsePhrase(phrase) {
  if (typeof phrase !== 'string' || phrase.length > 240) throw new Error('Enter a 12-word English recovery phrase.');
  const clean = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!/^[a-z]+(?: [a-z]+){11}$/.test(clean)) throw new Error('Enter a 12-word English recovery phrase.');
  let mnemonic;
  try { mnemonic = Mnemonic.fromPhrase(clean); } catch {
    throw new Error('Invalid recovery phrase or checksum.');
  }
  if (mnemonic.language !== 'english' || mnemonic.bits !== 128) {
    throw new Error('This wallet supports 12-word English recovery phrases only.');
  }
  return mnemonic;
}

function openWallet(phrase) {
  const mnemonic = parsePhrase(phrase);
  const seed = mnemonic.toSeed();
  let root;
  try { root = HDPrivateKey.fromSeed(seed); } finally { seed.fill(0); }
  const account = root.deriveAccount(44, network.keyPrefix.coinType, 0);
  const rings = [0, 1].map(branch => KeyRing.fromPrivate(account.derive(branch).derive(0).privateKey));
  const addresses = rings.map(ring => ring.getAddress().toString(network));
  return {rings, addresses, phrase: mnemonic.getPhrase()};
}

function recipientAddress(recipient) {
  if (typeof recipient !== 'string' || recipient.length > 120) throw new Error('Enter a valid regtest address.');
  let address;
  try { address = Address.fromString(recipient.trim(), network); } catch {
    throw new Error('Enter a valid regtest address (rs1…).');
  }
  if (address.isNull() || !(address.isPubkeyhash() || address.isScripthash())) {
    throw new Error('Unsupported recipient address.');
  }
  return address;
}

async function prepareTransfer({wallet, recipient, amount, height, coins}) {
  const destination = recipientAddress(recipient);
  const value = parseAmount(amount);
  const payment = new Output({address: destination, value});
  if (payment.isDust(policy.MIN_RELAY)) throw new Error('This amount is too small for a standard transaction.');
  const changeAddress = wallet.rings[1].getAddress();
  const available = validateCoins(coins, wallet.addresses, height).filter(coin => isSpendable(coin, height));
  if (available.length === 0) throw new Error('No confirmed, mature funds to spend.');
  const inputs = available.map(coin => new Coin({...coin, hash: Buffer.from(coin.hash, 'hex'),
    address: recipientAddress(coin.address)}));
  const mtx = new MTX();
  mtx.addOutput(payment);
  try {
    await mtx.fund(inputs, {changeAddress, rate: feeRate, maxFee, height, confirmations: 1,
      coinbaseMaturity: network.coinbaseMaturity});
  } catch {
    throw new Error('Not enough confirmed, mature HNS for the amount and fee.');
  }
  const fee = mtx.getFee();
  if (!Number.isSafeInteger(fee) || fee <= 0 || fee > maxFee) throw new Error('The fee exceeds the local limit.');
  const review = {recipient: destination.toString(network), value, fee, inputs: mtx.inputs.length};
  return {review, finalize() {
    mtx.sign(wallet.rings);
    const [tx, view] = mtx.commit();
    const minFee = policy.getMinFee(tx.getSigopsSize(tx.getSigops(view)), feeRate);
    const [checkedFee] = tx.checkInputs(view, height + 1, network);
    if (!mtx.isSigned() || !tx.isSane() || !tx.isStandard() || checkedFee !== fee || fee < minFee) {
      throw new Error('Could not sign a standard transaction with the reviewed fee.');
    }
    const raw = tx.encode();
    const decoded = TX.decode(raw);
    if (!decoded.encode().equals(raw) || !decoded.verify(view)) throw new Error('Local signature verification failed.');
    return {hex: raw.toString('hex'), txid: decoded.txid()};
  }};
}

module.exports = {newPhrase, openWallet, prepareTransfer};
