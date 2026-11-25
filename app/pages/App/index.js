import React, { Component } from 'react';
import { Link, Redirect, Route, Switch, withRouter } from 'react-router-dom';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import c from 'classnames';
import Sidebar from '../../components/Sidebar';
import Topbar from '../../components/Topbar';
import SendModal from '../../components/SendModal';
import ReceiveModal from '../../components/ReceiveModal';
import FundAccessOptions from '../Onboarding/FundAccessOptions';
import CreateNewAccount from '../Onboarding/CreateNewAccount';
import ExistingAccountOptions from '../Onboarding/ExistingAccountOptions';
import ImportSeedFlow from '../Onboarding/ImportSeedFlow';
import Account from '../Account';
import Overview from '../Overview';
import GetCoins from '../GetCoins';
import Settings from '../Settings';
import Auction from '../Auction';
import DomainManager from '../DomainManager';
import MyDomain from '../MyDomain';
import YourBids from '../YourBids';
import Watching from '../Watching';
import Expiring from '../Expiring';
import AuctionBasket from '../AuctionBasket';
import OpenBasket from '../OpenBasket';
import SearchTLD from '../SearchTLD';
import * as nodeActions from "../../ducks/node";
import * as walletActions from '../../ducks/walletActions';
import './app.scss';
import AccountLogin from '../AcountLogin';
import PassphraseModal from '../AcountLogin/PassphraseModal';
import * as node from '../../ducks/node';
import SplashScreen from "../../components/SplashScreen";
import IdleModal from '../../components/IdleModal';
import {LedgerModal} from "../../components/LedgerModal";
import {MultisigModal} from "../../components/MultisigModal";
import Notification from "../../components/Notification";
import {clientStub as cClientStub} from "../../background/connections/client";
import {clientStub as sClientStub} from "../../background/setting/client";
import {ConnectionTypes} from "../../background/connections/types";
import AppHeader from "../AppHeader";
import Exchange from '../Exchange';
import SignMessage from "../SignMessage";
import VerifyMessage from "../VerifyMessage";
import Addons from '../Addons';
import ShakeX from '../../addons/shakex';
import Messages from '../Messages';
import {fetchLocale, fetchTheme, fetchShowUsdValue, initHip2, checkForUpdates} from "../../ducks/app";
import Multisig from "../Multisig";
import {I18nContext} from "../../utils/i18n";
import {EXPLORERS} from "../../constants/explorers";
import StorageErrorBanner from '../../components/StorageErrorBanner';
import InteractiveFixture from '../../background/packagedAcceptance/InteractiveFixture';
// Stable identity prevents locale/context updates from remounting the login form.
const LoginScreen = () => <AccountLogin className="app__login" />;

const connClient = cClientStub(() => require('electron').ipcRenderer);
const settingClient = sClientStub(() => require('electron').ipcRenderer);

@connect(
  (state) => ({
    walletInitialized: state.wallet.initialized,
    wallets: state.wallet.wallets,
  }),
  (dispatch) => ({
    initHip2: () => dispatch(initHip2()),
    setExplorer: (explorer) => dispatch(nodeActions.setExplorer(explorer)),
    checkForUpdates: () => dispatch(checkForUpdates()),
    fetchLocale: () => dispatch(fetchLocale()),
    fetchTheme: () => dispatch(fetchTheme()),
    fetchShowUsdValue: () => dispatch(fetchShowUsdValue()),
  }),
)
class App extends Component {
  static propTypes = {
    walletInitialized: PropTypes.bool.isRequired,
    wallets: PropTypes.array.isRequired,
    error: PropTypes.string.isRequired,
    isLocked: PropTypes.bool.isRequired,
    startNode: PropTypes.func.isRequired,
    watchActivity: PropTypes.func.isRequired,
    initHip2: PropTypes.func.isRequired,
    setExplorer: PropTypes.func.isRequired,
    fetchLocale: PropTypes.func.isRequired,
    fetchTheme: PropTypes.func.isRequired,
    fetchShowUsdValue: PropTypes.func.isRequired,
    isChangingNetworks: PropTypes.bool.isRequired,
  };

  static contextType = I18nContext;

  state = {
    isLoading: true,
    isListingWallets: true,
    custtomRPCNetworkType: '',
  };

  async componentDidMount() {
    this.setState({isLoading: true});
    this.props.fetchLocale();
    this.props.fetchTheme();
    this.props.fetchShowUsdValue();
    if (require('electron').app?.isAcceptance === true) {
      await this.props.startNode();
      this.props.watchActivity();
      this.setState({isLoading: false});
      return;
    }
    this.props.checkForUpdates();
    await this.props.startNode();
    await this.props.initHip2();
    this.props.watchActivity();

    const {type} = await connClient.getConnection();

    if (type === ConnectionTypes.Custom) {
      await this.fetchCustomRPC();
    } else {
      this.setState({ customRPCNetworkType: '' })
    }

    this.fetchExplorer().then(explorer => {
      this.props.setExplorer(explorer)
    });

    setTimeout(() => this.setState({isLoading: false}), 1000);
  }

  async fetchCustomRPC() {
    const conn = await connClient.getCustomRPC();
    this.setState({
      customRPCNetworkType: conn.networkType || 'main',
    });
  }

  async fetchExplorer() {
    const explorer = await settingClient.getExplorer();
    if (!explorer)
      return EXPLORERS[0];

    return EXPLORERS.find((item) => (
      item.label === explorer.label || item.tx === explorer.tx
    )) || EXPLORERS[0];
  }

  render() {
    const {t} = this.context;
    if (this.props.error) {
      return <SplashScreen error={this.props.error} />;
    }

    if (this.state.isLoading || this.props.isChangingNetworks) {
      return <SplashScreen />;
    }

    return (
      <div className={c('app', {'app--acceptance': require('electron').app?.isAcceptance === true})}>
        {/*<WalletSync />*/}
        <IdleModal />
        <PassphraseModal />
        <StorageErrorBanner />
        {require('electron').app?.isAcceptance === true && <nav className="app__acceptance-nav" aria-label={t('acceptanceNavLabel')}>
          <Link to="/acceptance-fixtures">{t('acceptanceNavFixtures')}</Link>{' | '}
          <Link to="/login">{t('acceptanceNavLogin')}</Link>{' | '}
          <Link to="/settings">{t('headingSettings')}</Link>{' | '}
          <Link to="/account">{t('acceptanceNavHistory')}</Link>{' | '}
          <Link to="/addons">{t('acceptanceNavAddons')}</Link>
        </nav>}
        {this.renderContent()}
      </div>
    );
  }

  renderContent() {
    const {t} = this.context;
    const {isLocked, wallets, walletInitialized} = this.props;

    return (
      <>
        <LedgerModal />
        <MultisigModal />
        <Notification />
        <Switch>
          {require('electron').app?.isAcceptance === true && <Route
            path="/acceptance-fixtures" component={InteractiveFixture}
          />}
          <Route
            path="/login"
            // full: the unlock screen is a two-column page now, not the 400px dialog
            // the onboarding wrapper falls back to.
            render={this.uninitializedWrapper(LoginScreen, true, true, false, true)}
          />
          <Route
            path="/funding-options"
            render={this.uninitializedWrapper(FundAccessOptions, true, false, false, true)}
          />
          <Route
            path="/existing-options"
            render={this.uninitializedWrapper(ExistingAccountOptions, false, false, false, true)}
          />
          <Route
            path="/new-wallet/:loc"
            render={this.uninitializedWrapper(
              CreateNewAccount,
              false,
              false,
              false,
              true,
            )}
          />
          <Route
            path="/import-seed/:type"
            render={this.uninitializedWrapper(
              ImportSeedFlow,
              false,
              false,
              false,
              true,
            )}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/overview"
            render={this.routeRenderer(t('headingOverview'), Overview)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/account"
            render={this.routeRenderer(t('headingPortfolio'), Account, true, false)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/send"
            render={this.routeRenderer(t('headingSend'), SendModal)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/receive/addresses"
            render={this.routeRenderer(t('headingAddresses'), ReceiveModal)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/receive"
            // The address, the copy button and the QR now live on the Overview balance
            // card, so this page had become a second place to do the same thing. The
            // route stays as a redirect because old links and bookmarks point at it;
            // what remains worth visiting is the address list beside it.
            render={() => <Redirect to="/receive/addresses" />}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/sign_message"
            render={this.routeRenderer(t('headingSignMessage'), SignMessage)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/verify_message"
            render={this.routeRenderer(t('headingVerifyMessage'), VerifyMessage)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/messages"
            render={this.routeRenderer(t('headingMessages'), Messages)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/get_coins"
            render={this.routeRenderer(t('headingClaimAirdropName'), GetCoins)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/settings"
            render={this.routeRenderer('', Settings, false, false, '/overview')}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/bids/:filterType?"
            render={this.routeRenderer(t('headingYourBids'), YourBids)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/auction-basket"
            render={this.routeRenderer(t('headingAuctionBasket'), AuctionBasket)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/open-basket"
            render={this.routeRenderer(t('headingOpenBasket'), OpenBasket)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/domains"
            render={this.routeRenderer('', SearchTLD, false)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/watching"
            render={this.routeRenderer(t('headingWatching'), Watching)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/expiring"
            render={this.routeRenderer(t('headingExpiring'), Expiring)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/domain_manager/:name"
            render={this.routeRenderer(t('headingDomainManager'), MyDomain)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/domain_manager"
            render={this.routeRenderer(t('headingDomainManager'), DomainManager)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/domain/:name?"
            render={this.routeRenderer('', Auction, false)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/exchange"
            render={this.routeRenderer(t('headingExchange'), Exchange, true)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/addons/shakex"
            render={this.routeRenderer('ShakeX', ShakeX)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/addons"
            render={this.routeRenderer(t('headingMoreAddons'), Addons)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/liquidity-swap"
            render={this.routeRenderer(t('headingLiquiditySwap'), Addons)}
          />
          <ProtectedRoute
            isLocked={isLocked}
            wallets={wallets}
            path="/multisig"
            render={this.routeRenderer(
              t(walletInitialized ? 'headingMultisig' : 'headingMultisigSetup'),
              Multisig, true
            )}
          />
          <Redirect to="/login" />
        </Switch>
      </>
    );
  }

  uninitializedWrapper(Component, isMainMenu = false, autoHeight = false, autoWidth = false, full = false) {
    const {history, isRunning} = this.props;
    return () => (
      <div className={c('app__uninitialized-wrapper', {'app__uninitialized-wrapper--full': full})}>
        <AppHeader isMainMenu={isMainMenu} />
        <div className={c('app__uninitialized', {
          'app__uninitialized--auto-height': autoHeight,
          'app__uninitialized--auto-width': autoWidth,
          'app__uninitialized--full': full,
        })}>
          <Component />
        </div>
      </div>
    );
  }

  routeRenderer(title, Component, showSidebar = true, padded = true, backTo = null) {
    return () => (
      <React.Fragment>
        {showSidebar && (
          <div className={'app__sidebar-wrapper'}>
            <Sidebar />
          </div>
        )}
        <div className="app__main-wrapper">
          <Topbar title={title} showBack={!showSidebar} backTo={backTo} />
          {
            padded
              ? (
                // Keyed on the route so a navigation remounts the container and the
                // entry animation replays; without the key React reuses the node and
                // the page swap is instantaneous.
                <div className="app__content fns-animate-enter" key={title}>
                  <Component />
                </div>
              )
              : <Component />
          }

        </div>
      </React.Fragment>
    );
  }
}

// Settings panes that only touch app-level preferences, and therefore have to
// work before any wallet exists. The login screen's settings icon depends on
// this to let a user repair connectivity first; the routes are matched on the
// exact pathname, so every sub-route that should stay reachable is listed.
const OPEN_ROUTES = [
  '/settings',
  '/settings/general',
  '/settings/general/max-idle',
  '/settings/connection',
  '/settings/connection/configure',
  '/settings/connection/changeDirectory',
]

const ProtectedRoute = (props) => {
  if (OPEN_ROUTES.includes(props.location.pathname)) {
    return <Route {...props} />;
  }

  if (!props.wallets.length) {
    return <Redirect to="/funding-options" />;
  }

  if (props.isLocked) {
    return <Redirect to="/login" />;
  }

  return <Route {...props} />;
};

export default withRouter(
  connect(
    state => ({
      error: state.node.error,
      isLocked: state.wallet.isLocked,
      isChangingNetworks: state.node.isChangingNetworks,
      isRunning: state.node.isRunning,
    }),
    dispatch => ({
      watchActivity: () => dispatch(walletActions.watchActivity()),
      startNode: () => dispatch(node.startApp()),
    })
  )(App),
);
