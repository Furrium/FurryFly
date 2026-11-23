import {hashName, types, blind} from 'hsd/lib/covenants/rules';
import {basketScope, basketScopeError, basketScopeKeyedError} from '../../utils/basketScope';
import {reviewText} from '../../utils/reviewText';

export async function reconcileBasketOutputs(mtx, wallet, entries) {
  const expected = basketScope(entries);
  const byName = new Map(expected.rows.map(row => [row.name, row]));
  const found = new Set();
  for (const output of mtx.outputs) {
    const covenant = output.covenant;
    if (covenant.type === types.NONE) {
      if (!await wallet.getPath(output.address.hash)) {
        throw basketScopeError('basketValidationChangeOutputErr');
      }
      continue;
    }
    if (covenant.type !== types.BID || covenant.items.length !== 4) {
      throw basketScopeError('basketValidationCovenantErr');
    }
    const name = covenant.get(2).toString('ascii');
    const row = byName.get(name);
    if (!row || found.has(name) || !covenant.get(2).equals(Buffer.from(name, 'ascii'))
        || !covenant.get(0).equals(hashName(Buffer.from(name, 'ascii')))
        || output.value !== row.lockup) {
      throw basketScopeKeyedError('basketValidationBidMismatchErr', `${name}/`);
    }
    if (!await wallet.getPath(output.address.hash)) {
      throw basketScopeKeyedError('basketValidationBidDestinationErr', `${name}/`);
    }
    const nameState = await wallet.getNameState(covenant.get(0));
    if (!nameState || covenant.get(1).length !== 4 || covenant.getU32(1) !== nameState.height) {
      throw basketScopeKeyedError('basketValidationAuctionStartErr', `${name}/`);
    }
    const value = await wallet.getBlind(covenant.get(3));
    if (!value || value.value !== row.bid || !blind(value.value, value.nonce).equals(covenant.get(3))) {
      throw basketScopeKeyedError('basketValidationTrueBidErr', `${name}/`);
    }
    found.add(name);
  }
  if (found.size !== byName.size) {
    const missing = [...byName.keys()].filter(name => !found.has(name));
    throw basketScopeKeyedError('basketValidationOmittedErr', missing.map(name => `${name}/`).join(', '));
  }
  if (!mtx.hasCoins()) throw basketScopeError('basketValidationInputsErr');
  return basketScope(entries, mtx.getFee());
}
