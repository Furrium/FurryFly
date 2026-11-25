import { shell } from 'electron';
import React, { Component } from 'react';
import { withRouter, NavLink } from 'react-router-dom';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import './sidebar.scss';
import ellipsify from '../../utils/ellipsify';
import {I18nContext} from "../../utils/i18n";
import { Logo } from '../Logo';
import {clientStub} from "../../background/node/client";
import {NETWORKS} from "../../constants/networks";
const pkg = require('../../../package.json');
const BRAND = require('../../constants/branding');
const nodeClient = clientStub(() => require('electron').ipcRenderer);

@withRouter
@connect(
  state => ({
    network: state.wallet.network,
    chainHeight: state.node.chain.height,
    tip: state.node.chain.tip,
    newBlockStatus: state.node.newBlockStatus,
    spv: state.node.spv,
    walletId: state.wallet.wid,
    walletsDetails: state.wallet.walletsDetails,
    walletInitialized: state.wallet.initialized,
    walletType: state.wallet.type,
    walletWatchOnly: state.wallet.watchOnly,
    walletSync: state.wallet.walletSync,
    walletHeight: state.wallet.walletHeight,
    rescanHeight: state.wallet.rescanHeight,
    address: state.wallet.receiveAddress,
    updateAvailable: state.app.updateAvailable,
  }),
  dispatch => ({
  }),
)
class Sidebar extends Component {
  static propTypes = {
    history: PropTypes.shape({
      push: PropTypes.func.isRequired
    }).isRequired,
    location: PropTypes.shape({
      pathname: PropTypes.string.isRequired
    }).isRequired,
    chainHeight: PropTypes.number.isRequired,
    walletId: PropTypes.string.isRequired,
    walletsDetails: PropTypes.object.isRequired,
    walletInitialized: PropTypes.bool.isRequired,
    walletType: PropTypes.string.isRequired,
    tip: PropTypes.string.isRequired,
    newBlockStatus: PropTypes.string.isRequired,
    spv: PropTypes.bool.isRequired,
    walletWatchOnly: PropTypes.bool.isRequired,
    walletSync: PropTypes.bool.isRequired,
    walletHeight: PropTypes.number.isRequired,
    rescanHeight: PropTypes.number,
    network: PropTypes.string.isRequired,
    address: PropTypes.string,
    updateAvailable: PropTypes.object,
  };

  static contextType = I18nContext;

  render() {
    return (
      <div className="sidebar">
        <div className="sidebar__content">
          <div className="sidebar__logo-wrapper">
            <Logo />
          </div>
          {this.renderNav()}
        </div>
        {this.renderFooter()}
      </div>
    );
  }

  renderLink(to, label, {exactSend = false} = {}) {
    const {t} = this.context;

    return (
      <NavLink
        key={to}
        to={to}
        isActive={exactSend
          ? (match, location) => (
            location.pathname === '/send'
            && !new URLSearchParams(location.search || '').get('asset')
          )
          : undefined}
        className={isActive => `sidebar__action ${isActive ? "sidebar__action--selected" : ''}`}
      >
        {t(label)}
      </NavLink>
    );
  }

  renderGroup(id, label, items) {
    const {t} = this.context;
    const open = !!this.state.openGroups[id];

    return (
      <div className="sidebar__group" key={id}>
        <button
          type="button"
          className="sidebar__section sidebar__section--clickable sidebar__group-toggle"
          aria-expanded={open}
          onClick={() => this.toggleGroup(id)}
        >
          <span>{t(label)}</span>
          <span
            className={`sidebar__group-chevron${open ? ' sidebar__group-chevron--open' : ''}`}
            aria-hidden="true"
          />
        </button>
        <div className="sidebar__group-body" data-open={open ? 'true' : 'false'}>
          <div className="sidebar__actions">
            {items.map(item => this.renderLink(item.to, item.label, item))}
          </div>
        </div>
      </div>
    );
  }

  state = {
    // The group holding the current route starts open, so arriving from a link inside a
    // collapsed group does not hide the page you just navigated to.
    openGroups: this.groupsForPath(this.props.location.pathname),
  };

  groupsForPath(pathname) {
    const groups = {hns: false, domains: false, extensions: false};

    if (/^\/(account|send|receive)/.test(pathname)) groups.hns = true;
    // The market and the register page are domain work, so they open the same group.
    if (/^\/(domain_manager|domain|register|auctions|bids|watching|expiring|auction-basket|open-basket|exchange)/.test(pathname)) groups.domains = true;
    if (/^\/(liquidity-swap|messages|addons)/.test(pathname)) groups.extensions = true;

    return groups;
  }

  componentDidUpdate(prevProps) {
    const before = this.groupsForPath(prevProps.location.pathname);
    const now = this.groupsForPath(this.props.location.pathname);

    for (const id of Object.keys(now)) {
      if (now[id] && !before[id] && !this.state.openGroups[id]) {
        this.setState(prev => ({openGroups: {...prev.openGroups, [id]: true}}));
        return;
      }
    }
  }

  toggleGroup(id) {
    this.setState(prev => ({
      openGroups: {...prev.openGroups, [id]: !prev.openGroups[id]},
    }));
  }

  renderNav() {
    const {t} = this.context;
    const {walletId, walletInitialized, walletsDetails} = this.props;

    const name = walletsDetails[walletId]?.displayName || walletId;
    const title = `${t('settingWallet')}: ${name}`;

    if (!walletInitialized) {
      // Multisig setup used to be advertised here unconditionally, before any wallet
      // existed. Multisig is not part of this product, so the section title is all that
      // remains to be shown while the wallet is uninitialised.
      return <div className="sidebar__section">{title}</div>;
    }

    return (
      <React.Fragment>
        <div className="sidebar__section">{title}</div>
        <div className="sidebar__actions">
          {this.renderLink('/overview', 'headingOverview')}

          {this.renderGroup('hns', 'navGroupHns', [
            {to: '/account', label: 'headingPortfolio'},
            {to: '/send', label: 'headingSend', exactSend: true},
            {to: '/receive/addresses', label: 'headingAddresses'},
          ])}

          {this.renderGroup('domains', 'navGroupDomains', [
            {to: '/domain_manager', label: 'headingDomainManager'},
            {to: '/register', label: 'headingRegister'},
            {to: '/auctions', label: 'headingAuctions'},
            {to: '/exchange', label: 'headingExchange'},
          ])}

          {this.renderGroup('extensions', 'navGroupExtensions', [
            {to: '/liquidity-swap', label: 'headingLiquiditySwap'},
            {to: '/messages', label: 'headingMessages'},
          ])}
        </div>
      </React.Fragment>
    );
  }

  renderGenerateBlockButton(numblocks) {
    const { network, address, spv } = this.props;
    if (spv || !address) {
      return;
    }

    if ([NETWORKS.SIMNET, NETWORKS.REGTEST].includes(network)) {
      return (
        <button
          className="sidebar__generate-btn"
          onClick={() => nodeClient.generateToAddress(numblocks, address)}
        >
         {`+${numblocks}`}
        </button>
      )
    }
  }

  renderFooter() {
    const {t} = this.context;

    const {
      walletSync,
      walletHeight,
      rescanHeight,
      newBlockStatus,
      chainHeight,
      tip,
      updateAvailable,
    } = this.props;

    return (
      <div className="sidebar__footer">
        <div className="sidebar__footer__version" title={`${BRAND.displayName} ${pkg.version}`}>
          {BRAND.displayName} v{pkg.version}
        </div>
        {updateAvailable ? (
          <div className="sidebar__footer__row">
            <button
              className="sidebar__footer__update-notif"
              onClick={() => shell.openExternal(updateAvailable.url)}
            >
              {t('updateAvailable')} ({updateAvailable.version})
            </button>
          </div>
        ) : null}
        {newBlockStatus ? (
          <div className="sidebar__footer__row">
            <div className="sidebar__footer__title">{newBlockStatus}</div>
          </div>)
          : null
        }
        <div className="sidebar__footer__row">
          <div className="sidebar__footer__title">{t('currentHeight')}</div>
          <div className="sidebar__footer__text">
            {walletSync ? `${walletHeight}/${rescanHeight}` : `${chainHeight}` || '--'}
          </div>
          <div className="sidebar__footer__simnet-controls">
            {this.renderGenerateBlockButton(1)}
            {this.renderGenerateBlockButton(10)}
            {this.renderGenerateBlockButton(50)}
          </div>
        </div>
        <div className="sidebar__footer__row">
          <div className="sidebar__footer__title">{t('currentHash')}</div>
          <div className="sidebar__footer__text">
            {tip ? ellipsify(tip) : '--'}
          </div>
        </div>
      </div>
    );
  }
}

export default Sidebar;
