const {isMoney} = require('./units.cjs');
const COINBASE_MATURITY = 2;
const MAX_WALLET_COINS = 512;

function validateCoins(coins, addresses, height) {
  if (!Array.isArray(coins) || coins.length > MAX_WALLET_COINS
      || !Number.isInteger(height) || height < 0 || height > 0x7ffffffe) {
    throw new Error('The node returned invalid or too many wallet outputs.');
  }
  const unique = new Set();
  return coins.map(coin => {
    if (!coin || typeof coin.hash !== 'string' || !/^[0-9a-f]{64}$/.test(coin.hash)
        || !Number.isInteger(coin.index) || coin.index < 0 || coin.index > 0xffffffff
        || !Number.isInteger(coin.height) || coin.height < -1 || coin.height > height
        || !isMoney(coin.value) || typeof coin.coinbase !== 'boolean' || !addresses.includes(coin.address)) {
      throw new Error('The node returned an output that does not match this wallet.');
    }
    const outpoint = `${coin.hash}:${coin.index}`;
    if (unique.has(outpoint)) throw new Error('The node returned a duplicate output.');
    unique.add(outpoint);
    const {hash, index, height: coinHeight, value, coinbase, address} = coin;
    return {hash, index, height: coinHeight, value, coinbase, address};
  });
}

function isSpendable(coin, height) {
  return coin.value > 0 && coin.height >= 0 && (!coin.coinbase || height + 1 - coin.height >= COINBASE_MATURITY);
}

module.exports = {COINBASE_MATURITY, isSpendable, validateCoins};
