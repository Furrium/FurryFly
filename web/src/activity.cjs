const {isMoney} = require('./units.cjs');
const {COINBASE_MATURITY} = require('./coins.cjs');
const HEX_ID = /^[a-f0-9]{64}$/;
const PAY_ADDR = /^rs1[023456789acdefghjklmnpqrstuvwxyz]{39,59}$/;
const MAX_ROWS = 50;

function invalid() {
  return Object.assign(new Error('Invalid wallet activity response.'), {code: 'error.activityInvalid'});
}

function payment(item) {
  if (!item || typeof item.address !== 'string' || !PAY_ADDR.test(item.address) || !isMoney(item.value)) throw invalid();
  return {address: item.address, value: item.value};
}

function validateRow(row, address, tip) {
  if (!row || typeof row.txid !== 'string' || !HEX_ID.test(row.txid)
      || !Number.isSafeInteger(row.height) || row.height < -1 || row.height > tip
      || !Number.isSafeInteger(row.time) || row.time < 0 || row.time > 8_640_000_000_000
      || typeof row.coinbase !== 'boolean' || (row.inputsComplete !== undefined && row.inputsComplete !== false)
      || !Array.isArray(row.inputs) || row.inputs.length > 128
      || !Array.isArray(row.outputs) || row.outputs.length === 0 || row.outputs.length > 128) throw invalid();
  const inputs = row.inputs.map(payment);
  const outputs = row.outputs.map(payment);
  if ((row.coinbase && (inputs.length || row.height < 0 || row.inputsComplete === false))
      || ![...inputs, ...outputs].some(item => item.address === address)) throw invalid();
  return {txid: row.txid, height: row.height, time: row.time, coinbase: row.coinbase,
    inputsComplete: row.inputsComplete !== false, inputs, outputs};
}

function summarize(row, own, tip) {
  let received = 0;
  let spent = 0;
  for (const output of row.outputs) if (own.has(output.address)) received += output.value;
  for (const input of row.inputs) if (own.has(input.address)) spent += input.value;
  if (!isMoney(received) || !isMoney(spent)) throw invalid();
  const confirmations = row.height < 0 ? 0 : tip - row.height + 1;
  let kind = 'unknown';
  let value = null;
  if (row.inputsComplete) {
    value = received - spent;
    if (row.coinbase) kind = 'reward';
    else if (spent > 0 && row.outputs.every(output => own.has(output.address))
        && row.inputs.every(input => own.has(input.address))) kind = 'self';
    else if (value > 0) kind = 'received';
    else if (value < 0) kind = 'sent';
  }
  const state = confirmations === 0 ? 'pending'
    : row.coinbase && tip + 1 - row.height < COINBASE_MATURITY ? 'immature' : 'confirmed';
  return {txid: row.txid, height: row.height, time: row.time, kind, value, state, confirmations};
}

function mergeActivity(pages, addresses, tip) {
  if (!Array.isArray(addresses) || !Array.isArray(pages) || pages.length !== addresses.length
      || !Number.isSafeInteger(tip) || tip < 0 || tip > 0x7ffffffe) throw invalid();
  const byID = new Map();
  let truncated = false;
  pages.forEach((page, i) => {
    if (!page || page.network !== 'regtest' || page.height !== tip || !Array.isArray(page.transactions)
        || page.transactions.length > MAX_ROWS || (page.truncated !== undefined && page.truncated !== true)) throw invalid();
    const seen = new Set();
    truncated ||= page.truncated === true;
    for (const item of page.transactions) {
      const row = validateRow(item, addresses[i], tip);
      if (seen.has(row.txid)) throw invalid();
      seen.add(row.txid);
      const previous = byID.get(row.txid);
      if (previous) {
        if (row.height !== previous.height || row.time !== previous.time || row.coinbase !== previous.coinbase
            || JSON.stringify(row.outputs) !== JSON.stringify(previous.outputs)
            || (row.inputsComplete && previous.inputsComplete && JSON.stringify(row.inputs) !== JSON.stringify(previous.inputs))) {
          throw invalid();
        }
        if (previous.inputsComplete || !row.inputsComplete) continue;
      }
      byID.set(row.txid, row);
    }
  });
  const own = new Set(addresses);
  const rows = [...byID.values()].sort((a, b) => (a.height < 0 ? 0 : 1) - (b.height < 0 ? 0 : 1)
    || b.height - a.height || b.time - a.time || a.txid.localeCompare(b.txid));
  return {truncated: truncated || rows.length > MAX_ROWS, rows: rows.slice(0, MAX_ROWS).map(row => summarize(row, own, tip))};
}

module.exports = {mergeActivity};
