const {Lock} = require('bmutex');
const {reviewText} = require('../../utils/reviewText');

export class WalletMutationCoordinator {
  constructor() {
    this.lock = new Lock();
  }

  async run(task) {
    const unlock = await this.lock.lock();
    try {
      return await task();
    } finally {
      unlock();
    }
  }
}

export function createBroadcastError(error, txid) {
  const reason = error && error.message ? error.message : 'txBroadcastReasonUnknown';
  const isConflict = error?.code === 'ETXREJECTED'
    || /bad-txns-inputs-spent|inputs?[- ]spent|conflict|duplicate/i.test(reason);

  if (isConflict) {
    const conflict = new Error(reviewText(null, 'txBroadcastConflictErr', txid));
    conflict.code = 'ETXREJECTED';
    conflict.txid = txid;
    conflict.broadcastAttempted = true;
    return conflict;
  }

  const uncertain = new Error(reviewText(null, 'txBroadcastUncertainErr', txid, reviewText(null, reason)));
  uncertain.code = 'ETXBROADCASTUNCERTAIN';
  uncertain.txid = txid;
  uncertain.broadcastAttempted = true;
  return uncertain;
}

export function reserveTransactionInputs(wallet, mtx) {
  const prevouts = mtx.inputs.map(input => input.prevout);

  for (const prevout of prevouts) {
    wallet.lockCoin(prevout);
  }

  return () => {
    for (const prevout of prevouts) {
      wallet.unlockCoin(prevout);
    }
  };
}

export async function broadcastAndRecord({mtx, walletDB, broadcast}) {
  const tx = mtx.toTX();
  const txid = tx.txid();

  try {
    await broadcast(tx);
  } catch (error) {
    throw createBroadcastError(error, txid);
  }

  try {
    await walletDB.addTX(tx);
  } catch (error) {
    const reason = error?.message || 'txRecordFailedReason';
    const recordError = new Error(reviewText(null, 'txRecordFailedErr', txid, reviewText(null, reason)));
    recordError.code = 'ETXRECORD';
    recordError.txid = txid;
    throw recordError;
  }
  return mtx;
}
