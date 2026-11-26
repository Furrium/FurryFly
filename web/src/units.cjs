const COIN = 1_000_000;
const MAX_MONEY = 2_040_000_000 * COIN;

function parseAmount(text) {
  if (typeof text !== 'string' || !/^(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,6})?$/.test(text)) {
    throw new Error('Enter an amount with up to six decimal places.');
  }
  const [whole, fraction = ''] = text.split('.');
  const value = Number(whole) * COIN + Number(fraction.padEnd(6, '0'));
  if (!isMoney(value) || value === 0) throw new Error('Enter a positive HNS amount.');
  return value;
}

function isMoney(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_MONEY;
}

function formatAmount(value) {
  if (!isMoney(value)) throw new Error('Invalid HNS amount.');
  const whole = Math.floor(value / COIN);
  const fraction = String(value % COIN).padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

module.exports = {COIN, isMoney, parseAmount, formatAmount};
