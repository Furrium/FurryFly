import React from 'react';
import test from 'tape';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { Exchange } from '../index';
import { I18nContext } from '../../../utils/i18n';
import { MARKETPLACE_STATUS } from '../../../utils/marketplaceRequest';
import { FULFILLMENT_STATUS } from '../../../ducks/exchange.js';

const noop = () => {};

function getProps(overrides = {}) {
  return {
    spv: true,
    nodeProgress: 1,
    walletSync: false,
    walletHeight: 337994,
    rescanHeight: 0,
    isCustomRPCConnected: false,
    deeplinkParams: {},
    clearDeeplinkParams: noop,
    network: 'main',
    height: 337994,
    walletType: 'software',
    walletWatchOnly: false,
    walletId: 'spv-smoke',
    walletsDetails: {},
    auctions: [],
    total: 0,
    currentPage: 1,
    marketplaceStatus: MARKETPLACE_STATUS.LOADED,
    marketplaceError: '',
    listings: [],
    fulfillments: [],
    finalizingName: null,
    location: {pathname: '/exchange'},
    setAuctionPage: noop,
    getExchangeAuctions: () => Promise.resolve(),
    getExchangeFullfillments: () => Promise.resolve([]),
    getExchangeListings: () => Promise.resolve([]),
    finalizeExchangeBid: noop,
    finalizeExchangeLock: noop,
    cancelExchangeLock: noop,
    finalizeCancelExchangeLock: noop,
    launchExchangeAuction: noop,
    launchExchangeAuctionsBulk: noop,
    createPrivateSaleProof: noop,
    submitToShakedex: noop,
    showError: noop,
    showSuccess: noop,
    ...overrides,
  };
}

function renderExchange(props) {
  const store = createStore(() => ({exchange: {listings: []}}));
  return renderToStaticMarkup(
    <Provider store={store}>
      <I18nContext.Provider value={{t: key => key}}>
        <MemoryRouter>
          <Exchange {...props} />
        </MemoryRouter>
      </I18nContext.Provider>
    </Provider>,
  );
}

test('SPV mode renders successfully loaded public marketplace rows', (t) => {
  const html = renderExchange(getProps({
    auctions: [{
      id: 'active-spv-listing',
      name: 'visible-in-spv',
      pending: false,
      buyable: true,
      bids: [{price: 1000000, lockTime: 2000000000}],
    }],
    total: 298,
  }));

  t.equal(html.includes('exchange__auction-listing__row'), true);
  t.equal(html.includes('visible-in-spv'), true);
  t.equal(html.includes('marketplaceLoadedEmpty'), false);
  t.end();
});

test('SPV mode renders timeout details and a visible Retry action', (t) => {
  const html = renderExchange(getProps({
    marketplaceStatus: MARKETPLACE_STATUS.TIMEOUT,
    marketplaceError: 'Request timed out.',
  }));

  t.equal(html.includes('marketplaceRequestTimedOut'), true);
  t.equal(html.includes('Request timed out.'), true);
  t.equal(html.includes('retry'), true);
  t.equal(html.includes('marketplaceLoadedEmpty'), false);
  t.end();
});

test('buyer filter changes reset page and send the complete query to the channel', async t => {
  const requests = [];
  const pages = [];
  const instance = new Exchange(getProps({
    currentPage: 4,
    auctions: [{id: 2, name: 'z-first'}, {id: 1, name: 'a-second'}],
    setAuctionPage: page => pages.push(page),
    getExchangeAuctions: (availability, filters) => {requests.push({availability, filters}); return Promise.resolve();},
  }));
  instance.setState = (change, callback) => {instance.state = {...instance.state, ...change}; if (callback) callback();};
  instance.updateMarketplaceFilters({marketplaceMinLength: '3', marketplaceNumbers: 'only', marketplaceSort: 'price-desc'});
  t.deepEqual(pages, [1]);
  t.equal(requests[0].filters.min_length, '3');
  t.equal(requests[0].filters.numbers, 'only');
  t.equal(requests[0].filters.sort, 'price-desc');
  t.deepEqual(instance.getVisibleMarketplaceAuctions().map(row => row.name), ['z-first', 'a-second'], 'component preserves global server order');
  instance.clearMarketplaceFilters();
  t.equal(requests[1].filters.min_length, '');
  t.equal(requests[1].filters.numbers, 'any');
  t.equal(requests[1].filters.hyphens, 'any');
  t.equal(requests[1].filters.sort, 'name');
  instance.updateMarketplaceFilters({marketplaceQuery: 'old'}, true);
  instance.updateMarketplaceFilters({marketplaceQuery: 'new'}, true);
  await new Promise(resolve => setTimeout(resolve, 350));
  t.equal(requests.length, 3, 'text input is debounced');
  t.equal(requests[2].filters.q, 'new');
  instance.componentWillUnmount();
  t.end();
});

function fill(status, name = 'bought-name') {
  return {
    fulfillment: {name, price: 1000000, broadcastAt: 1700000000000},
    status,
  };
}

// A purchase is not finished when the fill confirms: the buyer still has to broadcast the
// finalize transaction. The action used to exist only as a link in the last column of the
// fills table, so the notice is asserted to render above everything else on the page.
test('a confirmed fill surfaces the finalize action above the marketplace tables', (t) => {
  const html = renderExchange(getProps({fulfillments: [fill(FULFILLMENT_STATUS.CONFIRMED)]}));

  t.equal(html.includes('pending-finalize'), true, 'the notice renders');
  t.equal(html.includes('bought-name'), true, 'and names the domain');
  t.equal(html.includes('exchangeFinalizeAction'), true, 'with the finalize action');

  // Above the tables, not merely present: the complaint being fixed is placement.
  const noticeAt = html.indexOf('pending-finalize');
  const tableAt = html.indexOf('exchange-table');
  t.equal(tableAt === -1 || noticeAt < tableAt, true, 'the notice precedes the tables');
  t.end();
});

test('finalize is offered only for the state that can actually be finalized', (t) => {
  const waiting = [
    FULFILLMENT_STATUS.NOT_FOUND,
    FULFILLMENT_STATUS.CONFIRMING,
    FULFILLMENT_STATUS.CONFIRMED_LOCKUP,
    FULFILLMENT_STATUS.FINALIZING,
    FULFILLMENT_STATUS.FINALIZED,
  ];

  for (const status of waiting) {
    const html = renderExchange(getProps({fulfillments: [fill(status)]}));
    t.equal(html.includes('pending-finalize'), false, `${status} does not offer finalize`);
  }

  // Still in transfer lockup is the near miss: the fill is confirmed but finalizing now
  // would be rejected, so it must not be advertised either.
  const lockup = renderExchange(getProps({
    fulfillments: [fill(FULFILLMENT_STATUS.CONFIRMED), fill(FULFILLMENT_STATUS.CONFIRMED_LOCKUP, 'still-locked')],
  }));
  // Bounded to the notice: the fills table below lists every fill whatever its state, so
  // searching the whole page would find the locked name for the wrong reason.
  const noticeStart = lockup.indexOf('pending-finalize');
  const notice = lockup.slice(noticeStart, lockup.indexOf('</section>', noticeStart));
  t.equal(notice.includes('bought-name'), true, 'the ready one is offered');
  t.equal(notice.includes('still-locked'), false, 'the locked one is not');
  t.equal(notice.split('pending-finalize__item').length - 1, 1, 'one row per finalizable fill');
  t.end();
});

test('the notice finalizes the fill record the name belongs to', (t) => {
  const finalized = [];
  const target = fill(FULFILLMENT_STATUS.CONFIRMED, 'target-name');
  const instance = new Exchange(getProps({
    fulfillments: [fill(FULFILLMENT_STATUS.CONFIRMED, 'other-name'), target],
    finalizeExchangeBid: fulfillment => finalized.push(fulfillment),
  }));

  instance.onFinalizePurchase('target-name');
  t.deepEqual(finalized, [target.fulfillment], 'the matching fill is the one passed on');

  instance.onFinalizePurchase('not-a-fill');
  t.deepEqual(finalized, [target.fulfillment], 'an unknown name is ignored rather than guessed at');
  t.end();
});
