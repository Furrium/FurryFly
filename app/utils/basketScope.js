import {reviewText} from './reviewText';
import {verifyName} from 'hsd/lib/covenants/rules';

export function basketScopeError(message) {
  const error = new Error(reviewText(null, 'basketScopeNoTxSent', message));
  error.code = 'BASKET_SCOPE_CHANGED';
  return error;
}

// The same error with its reason expressed as a locale key.
//
// Every scope failure reads "<reason> No transaction was sent...", so the wrapper is the
// message and the reason travels beside it as `reasonKey`. The renderer resolves the
// reason first and passes it in, which keeps the sentence in one language; a single flat
// key could not, because reviewText composes the two halves.
export function basketScopeKeyedError(reasonKey, ...reasonArgs) {
  const error = basketScopeError(reviewText(null, reasonKey, ...reasonArgs));
  error.messageKey = 'basketScopeNoTxSent';
  error.reasonKey = reasonKey;
  error.reasonArgs = reasonArgs;
  return error;
}

/**
 * Renders a scope error in the selected language.
 *
 * Shared so the renderer and each background localizer agree: a keyed error reads
 * "<reason> No transaction was sent...", and the wrapped reason has to be resolved
 * first - passing the wrapper key alone leaves the %s unfilled and drops the reason.
 * Returns null when the error carries no key, so callers can fall back to error.message.
 */
export function basketScopeErrorText(error, t) {
  if (!error || typeof error.messageKey !== 'string') return null;
  if (typeof error.reasonKey === 'string') {
    const reasonArgs = (error.reasonArgs || []).map(value => `${value ?? ''}`);
    return t(error.messageKey, t(error.reasonKey, ...reasonArgs));
  }
  return t(error.messageKey, ...(error.messageArgs || []));
}

// Base units only. Never compare formatted/rounded HNS amounts at this boundary.
export function basketScope(entries, fee = null) {
  if (!Array.isArray(entries) || !entries.length || entries.length > 20) {
    throw basketScopeKeyedError('basketScopeCountErr');
  }
  const seen = new Set();
  const rows = entries.map(entry => {
    const {name} = entry;
    const bid = Number(entry.bid);
    const lockup = Number(entry.lockup);
    if (!verifyName(name) || seen.has(name)
        || !Number.isSafeInteger(bid) || bid < 0
        || !Number.isSafeInteger(lockup) || lockup <= 0 || lockup < bid) {
      throw basketScopeKeyedError('basketScopeNameAmountErr');
    }
    seen.add(name);
    return {name, bid, blind: lockup - bid, lockup};
  });
  if (fee !== null && (!Number.isSafeInteger(fee) || fee < 0)) {
    throw basketScopeKeyedError('basketScopeFeeUnavailableErr');
  }
  const totalBid = rows.reduce((sum, row) => sum + row.bid, 0);
  const totalLockup = rows.reduce((sum, row) => sum + row.lockup, 0);
  if (!Number.isSafeInteger(totalLockup + (fee || 0))) {
    throw basketScopeKeyedError('basketScopeTotalErr');
  }
  return {rows, totalBid, totalBlind: totalLockup - totalBid, totalLockup, fee, transactionCount: 1};
}

export function assertBasketScope(actual, expected) {
  if (!actual || !expected || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw basketScopeKeyedError('basketScopeChangedErr');
  }
}

export function assertBasketEligibility(name, result) {
  if (result?.info?.state !== 'BIDDING') {
    throw basketScopeKeyedError(
      'basketScopeBiddingOnlyErr',
      `${name}/`,
      result?.info?.state || reviewText(null, 'exchangeUnavailable'),
    );
  }
  if (result.info.stats?.blocksUntilReveal <= 1) {
    throw basketScopeKeyedError('basketScopeRevealTooSoonErr', `${name}/`);
  }
}
