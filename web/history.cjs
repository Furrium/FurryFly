'use strict';

const {MAX_MONEY} = require('hsd/lib/protocol/consensus');

const HISTORY_ROWS = 50;
const HISTORY_CANDIDATES = 128;
const HISTORY_TX_BYTES = 32 * 1024;
const HISTORY_TX_ITEMS = 128;
const MAX_HISTORY_TIME = 0xffffffff;

function paymentOutput(output) {
  return (output.address.isPubkeyhash() || output.address.isScripthash())
    && output.covenant.isNone() && output.covenant.items.length === 0;
}

function compareHistory(a, b) {
  // Pending first, then newest block height, then time. Txid makes ties stable.
  return (b.height === -1) - (a.height === -1) || b.height - a.height
    || b.time - a.time || (a.txid < b.txid ? -1 : a.txid > b.txid ? 1 : 0);
}

function summarize(output, network) {
  return {address: output.address.toString(network), value: output.value};
}

async function collectHistory(height, address, candidates, truncated, readInputs, network) {
  const transactions = [];
  for (const candidate of candidates) {
    const {tx} = candidate;
    if (!tx || tx.inputs.length > HISTORY_TX_ITEMS || tx.outputs.length > HISTORY_TX_ITEMS
        || tx.getSize() > HISTORY_TX_BYTES) {
      truncated = true;
      continue;
    }
    if (!tx.isSane() || !tx.outputs.every(paymentOutput))
      continue;
    const coinbase = tx.isCoinbase();
    if (coinbase && candidate.height === -1)
      continue;
    const prevouts = coinbase ? [] : await readInputs(candidate);
    const known = prevouts.filter(output => output !== null);
    if (!known.every(paymentOutput))
      continue;
    let total = 0;
    for (const output of known) {
      total += output.value;
      if (!Number.isSafeInteger(output.value) || output.value < 0 || total > MAX_MONEY)
        throw new Error('Invalid payment input value.');
    }
    const incomplete = known.length !== prevouts.length;
    if (!tx.outputs.some(output => output.address.equals(address))
        && !known.some(output => output.address.equals(address))) {
      // An index match is not itself proof of ownership (the index keys by hash).
      if (incomplete)
        truncated = true;
      continue;
    }
    const txid = tx.txid();
    const {height, time} = candidate;
    const row = {txid, height, time, coinbase, inputs: known.map(output => summarize(output, network)), outputs: tx.outputs.map(output => summarize(output, network))};
    if (incomplete)
      row.inputsComplete = false;
    transactions.push(row);
  }
  transactions.sort(compareHistory);
  if (transactions.length > HISTORY_ROWS) {
    truncated = true;
    transactions.length = HISTORY_ROWS;
  }
  return {network, height, transactions, ...(truncated ? {truncated: true} : {})};
}

module.exports = {
  HISTORY_CANDIDATES, HISTORY_TX_BYTES, HISTORY_TX_ITEMS, MAX_HISTORY_TIME, collectHistory
};
