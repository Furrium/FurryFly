import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { withRouter } from 'react-router-dom';
import CreatePassword from '../CreatePassword/index';
import BackUpSeedWarning from '../BackUpSeedWarning/index';
import CopySeed from '../../CopySeed/index';
import ConfirmSeed from '../ConfirmSeed/index';
import SetName from '../SetName/index';
import SelectNodeMode from '../SelectNodeMode';
import * as walletActions from '../../../ducks/walletActions';
import '../ImportSeedEnterMnemonic/importenter.scss';
import '../ImportSeedWarning/importwarning.scss';
import walletClient from '../../../utils/walletClient';
import OptInAnalytics from '../OptInAnalytics';
import { clientStub as aClientStub } from '../../../background/analytics/client';
import { clientStub as nClientStub } from '../../../background/node/client';
import {I18nContext} from "../../../utils/i18n";

const analytics = aClientStub(() => require('electron').ipcRenderer);
const nodeClient = nClientStub(() => require('electron').ipcRenderer);

// Step numbers are contiguous from zero: the wizard opens straight on the name
// screen, so there is no terms step to skip.
const SET_NAME = 0;
const CREATE_PASSWORD = 2;
const OPT_IN_ANALYTICS = 3;
const BACK_UP_SEED_WARNING = 4;
const COPY_SEEDPHRASE = 5;
const CONFIRM_SEEDPHRASE = 6;
const SELECT_NODE_MODE = 7;

class CreateNewAccount extends Component {
  static propTypes = {
    completeInitialization: PropTypes.func.isRequired,
    network: PropTypes.string.isRequired,
    loc: PropTypes.string,
    walletsDetails: PropTypes.object.isRequired,
  };

  static contextType = I18nContext;

  state = {
    currentStep: SET_NAME,
    name: '',
    m: null,
    n: null,
    seedphrase: '',
    passphrase: '',
    isLoading: false,
  };

  goTo(currentStep) {
    this.setState({
      currentStep,
    });
  }

  render() {
    const {currentStep} = this.state;

    const totalSteps = 6;

    switch (currentStep) {

      case SET_NAME:
        return (
          <SetName
            currentStep={currentStep}
            totalSteps={totalSteps}
            onBack={() => this.props.history.push('/funding-options')}
            onNext={(name) => {
              // The wallet-type step only ever existed to choose a multisig threshold.
              // With multisig gone it has nothing to ask, so the flow reports a plain
              // single-signature wallet and moves straight on to the password.
              this.setState({
                currentStep: CREATE_PASSWORD,
                name,
                m: 1,
                n: 1,
              });
            }}
            onCancel={() => this.props.history.push('/funding-options')}
          />
        );
      case CREATE_PASSWORD:
        return (
          <CreatePassword
            currentStep={currentStep}
            totalSteps={totalSteps}
            onBack={() => this.goTo(SET_NAME)}
            onNext={async (passphrase) => {
              const optInState = await analytics.getOptIn();
              this.setState({
                currentStep:
                  optInState === 'NOT_CHOSEN' ? OPT_IN_ANALYTICS : BACK_UP_SEED_WARNING,
                passphrase,
              });
            }}
            onCancel={() => this.props.history.push('/funding-options')}
          />
        );
      case OPT_IN_ANALYTICS:
        return (
          <OptInAnalytics
            currentStep={currentStep}
            totalSteps={totalSteps}
            onBack={() => this.goTo(CREATE_PASSWORD)}
            onNext={async (optInState) => {
              await analytics.setOptIn(optInState);
              this.goTo(BACK_UP_SEED_WARNING);
            }}
            onCancel={() => this.props.history.push('/funding-options')}
          />
        );
      case BACK_UP_SEED_WARNING:
        return (
          <BackUpSeedWarning
            currentStep={currentStep}
            totalSteps={totalSteps}
            onBack={() => this.goTo(CREATE_PASSWORD)}
            onNext={async () => {
              this.setState({ isLoading: true });
              const existingWallet = this.props.walletsDetails[this.state.name];
              if (existingWallet) {
                // Encrypt existing wallet
                await walletClient.encryptWallet(this.state.name, this.state.passphrase);
              } else {
                // Create new wallet
                await walletClient.createNewWallet(
                  this.state.name,
                  this.state.passphrase,
                  false, // isLedger
                  null,  // xpub (Ledger only)
                  this.state.m,
                  this.state.n,
                );
              }
              const {phrase} = await walletClient.revealSeed(this.state.passphrase);

              this.setState({
                currentStep: COPY_SEEDPHRASE,
                seedphrase: phrase,
                isLoading: false,
              });
            }}
            onCancel={() => this.props.history.push('/funding-options')}
            isLoading={this.state.isLoading}
          />
        );
      case COPY_SEEDPHRASE:
        return (
          <CopySeed
            currentStep={currentStep}
            totalSteps={totalSteps}
            seedphrase={this.state.seedphrase}
            onBack={() => this.goTo(BACK_UP_SEED_WARNING)}
            onNext={() => this.goTo(CONFIRM_SEEDPHRASE)}
            onCancel={() => this.props.history.push('/funding-options')}
          />
        );
      case CONFIRM_SEEDPHRASE:
        return (
          <ConfirmSeed
            currentStep={currentStep}
            totalSteps={totalSteps}
            seedphrase={this.state.seedphrase}
            onBack={() => this.goTo(COPY_SEEDPHRASE)}
            onNext={() => this.goTo(SELECT_NODE_MODE)}
            onCancel={() => this.props.history.push('/funding-options')}
          />
        );
      case SELECT_NODE_MODE:
        return (
          <SelectNodeMode
            currentStep={currentStep}
            totalSteps={totalSteps}
            onBack={() => this.goTo(CONFIRM_SEEDPHRASE)}
            onNext={async (spv) => {
              this.setState({isLoading: true});
              try {
                await this.applyNodeMode(spv);
                await this.props.completeInitialization(
                  this.state.name,
                  this.state.passphrase
                );
                this.props.history.push('/overview');
              } catch (e) {
                console.error(e);
                this.setState({isLoading: false});
              }
            }}
            onCancel={() => this.props.history.push('/funding-options')}
            isLoading={this.state.isLoading}
          />
        );
      default:
        return <noscript />;
    }
  }

  applyNodeMode = async (spv) => {
    const currentSpv = await nodeClient.getSpvMode();
    await nodeClient.setSpvMode(spv);

    if (currentSpv !== spv) {
      await nodeClient.reset();
    }
  };
}

export default withRouter(
  connect(
    (state) => ({
      network: state.wallet.network,
      walletsDetails: state.wallet.walletsDetails,
    }),
    (dispatch) => ({
      completeInitialization: (name, passphrase) =>
        dispatch(walletActions.completeInitialization(name, passphrase)),
    })
  )(CreateNewAccount)
);
