import test from 'tape';
import {
  FULFILLMENT_STATUS,
  pendingFinalizeNames,
  withoutPendingFinalize,
} from '../exchange';

// A purchase on the marketplace is only half done when the fill confirms: the name has
// transferred, and the buyer still has to broadcast the finalize transaction that
// delivers it. Two states sit either side of that line and their names read the wrong way
// round, so the boundary is pinned here rather than re-derived at each call site.
const fill = (status, name) => ({fulfillment: {name}, status});

test('only CONFIRMED is offered for finalizing', t => {
  const statuses = [
    FULFILLMENT_STATUS.NOT_FOUND,
    FULFILLMENT_STATUS.CONFIRMING,
    FULFILLMENT_STATUS.CONFIRMED_LOCKUP,
    FULFILLMENT_STATUS.FINALIZING,
    FULFILLMENT_STATUS.FINALIZED,
  ];

  t.deepEqual(
    pendingFinalizeNames([fill(FULFILLMENT_STATUS.CONFIRMED, 'ready')]),
    ['ready'],
    'the lockup-elapsed state is the one that can be finalized',
  );

  for (const status of statuses) {
    t.deepEqual(
      pendingFinalizeNames([fill(status, 'nope')]),
      [],
      `${status} is not offered`,
    );
  }

  // The near miss, called out on its own: the name is transferring, and finalizing now
  // would be rejected even though the buyer has paid.
  t.deepEqual(
    pendingFinalizeNames([fill(FULFILLMENT_STATUS.CONFIRMED_LOCKUP, 'locked')]),
    [],
    'still being in transfer lockup is not the same as being ready',
  );
  t.end();
});

test('missing and malformed fills yield no names instead of throwing', t => {
  t.deepEqual(pendingFinalizeNames(), [], 'no argument');
  t.deepEqual(pendingFinalizeNames([]), [], 'empty list');
  t.deepEqual(pendingFinalizeNames(null), [], 'null');
  t.deepEqual(pendingFinalizeNames([null, undefined]), [], 'holes in the list');
  t.deepEqual(
    pendingFinalizeNames([{status: FULFILLMENT_STATUS.CONFIRMED}]),
    [],
    'a fill with no name is dropped rather than rendered blank',
  );
  t.deepEqual(
    pendingFinalizeNames([fill(FULFILLMENT_STATUS.CONFIRMED, 'a'), null, fill(FULFILLMENT_STATUS.CONFIRMED, 'b')]),
    ['a', 'b'],
    'the usable entries survive alongside a broken one',
  );
  t.end();
});

test('a marketplace name is withheld from the wallet-level list', t => {
  const fulfillments = [fill(FULFILLMENT_STATUS.CONFIRMED, 'bought')];
  const finalizable = ['bought', 'received-by-transfer', 'another'];

  t.deepEqual(
    withoutPendingFinalize(finalizable, fulfillments),
    ['received-by-transfer', 'another'],
    'the purchase is removed and the rest keep their order',
  );

  t.deepEqual(
    withoutPendingFinalize(finalizable, []),
    finalizable,
    'with nothing pending the list is untouched',
  );

  t.deepEqual(
    withoutPendingFinalize(undefined, fulfillments),
    [],
    'no names is an empty result, not a crash',
  );

  // Still in lockup, so the wallet-level path is not withholding anything on its behalf.
  t.deepEqual(
    withoutPendingFinalize(['locked'], [fill(FULFILLMENT_STATUS.CONFIRMED_LOCKUP, 'locked')]),
    ['locked'],
    'a fill that is not ready does not suppress the name',
  );

  const input = ['bought'];
  withoutPendingFinalize(input, fulfillments);
  t.deepEqual(input, ['bought'], 'the caller\'s array is not mutated');
  t.end();
});
