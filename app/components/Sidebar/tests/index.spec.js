import test from 'tape';
import React from 'react';
import {mount} from 'enzyme';
import {act} from 'react-dom/test-utils';
import {createMemoryHistory} from 'history';
import {Provider} from 'react-redux';
import {Router} from 'react-router-dom';
import {createStore} from 'redux';

import Sidebar from '../index';
import {I18nContext, translateLocale} from '../../../utils/i18n';

function setup(pathname) {
  const history = createMemoryHistory({initialEntries: [pathname]});
  const store = createStore(() => ({
    wallet: {
      network: 'main', wid: 'primary', walletsDetails: {primary: {displayName: 'Test Wallet'}},
      initialized: true, type: 'default', watchOnly: false, walletSync: false, walletHeight: 0,
    },
    node: {chain: {height: 1, tip: ''}, newBlockStatus: '', spv: true},
    app: {},
  }));
  const wrapper = mount(
    <Provider store={store}>
      <Router history={history}>
        <I18nContext.Provider value={{t: key => translateLocale('en-US', null, key)}}>
          <Sidebar />
        </I18nContext.Provider>
      </Router>
    </Provider>,
  );
  return {wrapper, history, element: wrapper.getDOMNode()};
}

test('desktop wallet navigation exposes controls and makes collapsed groups inert', t => {
  const {wrapper, element} = setup('/overview');
  try {
    const nav = element.querySelector('nav');
    const title = nav.querySelector(`#${nav.getAttribute('aria-labelledby')}`);
    t.equal(title.textContent, 'Wallet: Test Wallet', 'landmark uses the visible localized wallet title');
    t.equal(nav.querySelector('.sidebar__footer'), null, 'node status is not part of navigation');

    const groups = Array.from(nav.querySelectorAll('button[aria-controls]'));
    t.equal(groups.length, 3);
    for (const toggle of groups) {
      const links = nav.querySelector(`#${toggle.getAttribute('aria-controls')}`);
      t.equal(toggle.getAttribute('aria-expanded'), 'false');
      t.ok(links.hasAttribute('inert'), 'collapsed panel removes its links from browser focus and accessibility');
      act(() => toggle.click());
      t.equal(toggle.getAttribute('aria-expanded'), 'true');
      t.notOk(links.hasAttribute('inert'), 'expanded panel restores links');
      act(() => toggle.click());
      t.equal(toggle.getAttribute('aria-expanded'), 'false');
      t.ok(links.hasAttribute('inert'), 'reclosing disables links immediately');
    }
  } finally {
    wrapper.unmount();
    t.end();
  }
});

test('desktop sidebar NavLink matches the current page without changing destinations', t => {
  const {wrapper, element, history} = setup('/send');
  try {
    const currentLinks = () => Array.from(element.querySelectorAll('nav a[aria-current="page"]'), a => a.getAttribute('href'));
    const visit = pathname => act(() => history.push(pathname));

    t.deepEqual(currentLinks(), ['/send'], 'directly opening Send marks only Send current');
    t.equal(element.querySelector('button[aria-controls="sidebar-group-hns"]').getAttribute('aria-expanded'), 'true');
    visit('/send?asset=sample');
    t.deepEqual(currentLinks(), [], 'an asset send does not mark the HNS Send link current');
    visit('/send?recipient=test');
    t.deepEqual(currentLinks(), ['/send'], 'non-asset query parameters retain the current page');
    visit('/auctions/bids/BIDDING');
    t.deepEqual(currentLinks(), ['/auctions'], 'an auction tab still belongs to the Auctions page');
    t.equal(element.querySelector('button[aria-controls="sidebar-group-domains"]').getAttribute('aria-expanded'), 'true', 'navigation still opens a newly entered group');
    visit('/domain_manager/example');
    t.deepEqual(currentLinks(), ['/domain_manager'], 'a managed name still belongs to Domain Manager');
    visit('/overview');
    t.deepEqual(currentLinks(), ['/overview'], 'only Overview is current after navigating away');
  } finally {
    wrapper.unmount();
    t.end();
  }
});
