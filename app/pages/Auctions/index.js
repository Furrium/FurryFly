import React, { Component } from 'react';
import { withRouter } from 'react-router';
import c from 'classnames';
import { I18nContext } from '../../utils/i18n';
import YourBids from '../YourBids';
import AuctionBasket from '../AuctionBasket';
import OpenBasket from '../OpenBasket';
import Watching from '../Watching';
import Expiring from '../Expiring';
import './auctions.scss';

// These five surfaces used to be five sidebar entries competing for the same attention,
// which is how the auction side of the app ended up with more navigation than the wallet
// side. They are tabs of one page now.
//
// The active tab is the URL rather than component state, for three reasons: a tab stays
// linkable, it survives a reload, and the deep links the older routes handed out keep
// working. YourBids still pushes /bids/BIDDING and Watching still pushes /auction-basket;
// both are redirected into the tab below, which is also why the routes are registered as
// real paths instead of a query parameter.
//
// That last point is load-bearing. YourBids is wrapped in withRouter, so it reads
// match.params.filterType from the router context and ignores any match prop it is handed.
// Registering /auctions/bids/:filterType? means the context match carries the filter, so
// the component works inside the tab without being modified.
const TABS = [
  {id: 'bids', path: '/auctions/bids', label: 'headingYourBids', Component: YourBids},
  {id: 'basket', path: '/auctions/basket', label: 'headingAuctionBasket', Component: AuctionBasket},
  {id: 'open-basket', path: '/auctions/open-basket', label: 'headingOpenBasket', Component: OpenBasket},
  {id: 'watching', path: '/auctions/watching', label: 'headingWatching', Component: Watching},
  {id: 'expiring', path: '/auctions/expiring', label: 'headingExpiring', Component: Expiring},
];

@withRouter
class Auctions extends Component {
  static contextType = I18nContext;

  activeTab() {
    const {pathname} = this.props.location;

    // Tested before 'basket', which this path also contains.
    if (pathname.startsWith('/auctions/open-basket')) {
      return 'open-basket';
    }

    for (const tab of TABS) {
      if (pathname.startsWith(tab.path)) {
        return tab.id;
      }
    }

    return 'bids';
  }

  render() {
    const {t} = this.context;
    const active = this.activeTab();
    const current = TABS.find(tab => tab.id === active) || TABS[0];
    const {Component} = current;

    return (
      <div className="auctions">
        <nav className="auctions__tabs" role="tablist">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === active}
              className={c('auctions__tab', {'auctions__tab--active': tab.id === active})}
              onClick={() => {
                if (tab.id === active) {
                  return;
                }
                this.props.history.push(tab.path);
              }}
            >
              {t(tab.label)}
            </button>
          ))}
        </nav>
        <div className="auctions__panel">
          <Component />
        </div>
      </div>
    );
  }
}

export default Auctions;
