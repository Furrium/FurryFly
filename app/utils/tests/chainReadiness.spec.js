import test from 'tape';
import {
  isChainReady,
  looksLikeTransportError,
  describeChainGatedError,
} from '../chainReadiness';

// The gate only decides when to explain a failure, so the cases that matter are the ones
// where a wrong answer either hides a real error or blames the chain for one.
test('chain readiness needs positive evidence of being behind', t => {
  // The default matters: with nothing known the gate must not claim the chain is behind,
  // or every genuine marketplace error would be reported as "wait for sync".
  t.ok(isChainReady({}), 'a chain with nothing known is not blamed');
  t.notOk(isChainReady({height: 0, tip: ''}), 'a chain with no blocks has not started');

  t.notOk(isChainReady({height: 19, bestPeerHeight: 20, synced: true}),
    'lagging a known peer height wins over a synced flag');
  t.notOk(isChainReady({synced: false}), 'an explicit unsynced flag is behind');
  t.notOk(isChainReady({progress: 0.5}), 'a partial progress figure is behind');
  t.notOk(isChainReady({height: 0, progress: 0}), 'the starting block is behind');

  t.ok(isChainReady({synced: true}), 'an authoritative synced flag is ready');
  t.ok(isChainReady({progress: 1}), 'complete progress is ready');
  t.ok(isChainReady({progress: 0.99996}), 'the completion threshold matches isSyncComplete');
  t.ok(isChainReady({height: 20, bestPeerHeight: 20}), 'caught up to the best peer is ready');

  t.end();
});

test('transport failures are recognised and named in the selected language', t => {
  t.ok(looksLikeTransportError(new Error('Failed to fetch')), 'renderer fetch wording');
  t.ok(looksLikeTransportError(new Error('fetch failed')), 'node fetch wording');
  t.ok(looksLikeTransportError(new Error('connect ECONNREFUSED 127.0.0.1:1212')), 'refused connection');
  t.ok(looksLikeTransportError(new Error('socket hang up')), 'dropped socket');
  t.notOk(looksLikeTransportError(new Error('ShakeX is rate limiting requests.')), 'a server answer is not a transport failure');
  t.notOk(looksLikeTransportError(new Error('Marketplace request failed.')), 'a marketplace message is not a transport failure');

  const translate = key => `[${key}]`;
  t.equal(describeChainGatedError(new Error('Failed to fetch'), {progress: 0.2}, translate),
    '[featureNeedsChainSync]', 'an unsynchronised chain explains the failure');

  // The important negative: a real error on a synced chain must survive untouched.
  t.equal(describeChainGatedError(new Error('ShakeX is unavailable.'), {synced: true}, translate),
    'ShakeX is unavailable.', 'a real message is not replaced once the chain is ready');
  t.equal(describeChainGatedError(new Error('Failed to fetch'), {synced: true}, translate),
    'Failed to fetch', 'a transport error on a ready chain keeps its own text');

  t.end();
});
