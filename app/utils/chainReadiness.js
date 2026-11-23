// Whether chain data is caught up enough for the screens that need it.
//
// The marketplace and auction screens read services backed by the local node. While the
// chain is still catching up those requests die with a transport error, and the raw
// "Failed to fetch" gives the user nothing to act on.
//
// The threshold matches isSyncComplete() in components/SyncStatus. It deliberately does
// NOT match balanceReadiness(): that one requires an exact `progress === 1` or an
// authoritative `synced` flag before it will disclose a balance, because a rounded
// progress figure must never be shown as a settled amount. This gate is the opposite
// trade-off - it only needs to be right about when to explain a failure.
export const SYNC_COMPLETE_THRESHOLD = 0.99995;

export function isChainReady(chain = {}) {
  const {progress, height, bestPeerHeight, synced} = chain || {};

  // Only report "not ready" on positive evidence. An unknown sync state must not be
  // blamed for a failure it may have nothing to do with - that would turn every real
  // marketplace error into a misleading "wait for sync".
  if (Number.isFinite(height) && Number.isFinite(bestPeerHeight) && height < bestPeerHeight) {
    return false;
  }
  if (synced === false) {
    return false;
  }
  if (Number.isFinite(progress) && progress < SYNC_COMPLETE_THRESHOLD) {
    return false;
  }
  if (Number.isFinite(height) && height <= 0) {
    return false;
  }
  return true;
}

// A failure that never reached the service: no answer, so nothing about the request itself.
export function looksLikeTransportError(error) {
  const message = `${(error && error.message) || error || ''}`;
  return /failed to fetch|fetch failed|network ?error|load failed|econnrefused|econnreset|enotfound|eai_again|etimedout|socket hang up/i
    .test(message);
}

// The text to show for a failed request: the sync explanation when an unsynchronised chain
// is the reason, otherwise the original message so real errors are never masked.
export function describeChainGatedError(error, chain, t) {
  if (!isChainReady(chain) && looksLikeTransportError(error)) {
    return t('featureNeedsChainSync');
  }
  return `${(error && error.message) || ''}`.trim();
}
