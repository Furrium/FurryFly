import React, { Component } from 'react';
import PropTypes from 'prop-types';
import Modal from '../Modal';
import './proof-modal.scss';
import { shell } from 'electron';
import { connect } from 'react-redux';
import { showSuccess } from '../../ducks/notifications';
import { airdropClaim } from '../../ducks/claims';
import walletClient from '../../utils/walletClient';
import Alert from '../Alert';
import { clientStub as aClientStub } from '../../background/analytics/client';
import { NETWORKS } from "../../constants/networks";
import StepPrivateKey from './stepPrivateKey';
import StepHnsAddress from './stepHnsAddress';
import StepGenerating from './stepGenerating';
import StepProofs from './stepProofs';
import Anchor from "../Anchor";
import {I18nContext} from "../../utils/i18n";

const analytics = aClientStub(() => require('electron').ipcRenderer);

const STEP_PRIVATE_KEY = 0
const STEP_HNS_ADDRESS = 1
const STEP_GENERATING = 2
const STEP_PROOFS = 3
const TOTAL_STEPS = 3

@connect(
  (state) => ({
    address: state.wallet.receiveAddress,
    network: state.wallet.network,
    chainHeight: state.node.chain ? state.node.chain.height : -1,
    claims: state.claims,
  }),
  (dispatch) => ({
    showSuccess: (message) => dispatch(showSuccess(message)),
    airdropClaim: (options) => dispatch(airdropClaim(options)),
  }),
)
export default class ProofModal extends Component {
  static contextType = I18nContext;

  static propTypes = {
    type: PropTypes.string.isRequired,
    address: PropTypes.string.isRequired,
    network: PropTypes.string.isRequired,
    chainHeight: PropTypes.number.isRequired,
    claims: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired,
    showSuccess: PropTypes.func.isRequired,
    airdropClaim: PropTypes.func.isRequired,
  };

  state = {
    generateProofInBob: true,
    currentStep: STEP_PRIVATE_KEY,
    privKey: '',
    isFile: '',
    passphrase: '',
    pgpKeyId: '',
    hnsAddr: '',
    proofs: null,
    errorMessage: '',
    isUploading: false,
  };

  componentDidMount() {
    analytics.screenView('Proof Modal', {
      type: this.props.type,
    });
  }

  setProof = (e) => this.setState({
    proof: e.target.value,
  });

  searchForAirdropProofs() {
    this.props.airdropClaim({
      keyType: this.props.type.toLowerCase(),
      privKey: this.state.privKey.trim().replace(/^\s+/gm, ''),
      isFile: this.state.isFile,
      keyId: this.state.pgpKeyId,
      hnsAddr: this.state.hnsAddr,
      passphrase: this.state.passphrase,
    })
  }

  onSubmit = async () => {
    this.setState({isUploading: true});

    let proof;
    if (this.state.generateProofInBob)
      proof = this.props.claims.airdropProofs[0].b64encoded;
    else
      proof = this.state.proof;

    try {
      await walletClient.sendRawAirdrop(proof);
      analytics.track('airdrop claimed', {
        type: this.props.type,
      });
    } catch (e) {
      console.error(e);
      if (e.message === 'Currently disabled.') {
        this.setState({
          errorMessage: this.context.t('proofAirdropMainnetOnly'),
        });
      } else {
        this.setState({
          errorMessage: this.context.t('proofInvalid'),
        });
      }
      return;
    } finally {
      this.setState({isUploading: false});
    }

    this.props.onClose();
    this.props.showSuccess(this.context.t('proofAirdropConfirmed'));
  };

  isDisabled() {
    const { network, chainHeight } = this.props;

    if (network === NETWORKS.MAINNET && chainHeight < 2016) {
      return true;
    }

    return !this.state.proof;
  }

  render() {
    const {
      onClose,
      type,
    } = this.props;
    const {t} = this.context;

    const title = {
      'PGP': t('proofTitlePgp'),
      'SSH': t('proofTitleSsh'),
      'Faucet': t('proofTitleFaucet'),
    }[type]

    return (
      <Modal className="proof" onClose={onClose}>
        <div className="proof__container">
          <div className="proof__header">
            <div
              className="proof__title">{title}</div>
            <div className="proof__close-btn" onClick={onClose}>
              ✕
            </div>
          </div>
          {this.renderInfoBox()}
          <div className="proof__content">
            <Alert type="error" message={this.state.errorMessage} />
            {
              this.state.generateProofInBob
                ? this.renderWizard()
                : this.renderManual(type)
            }
          </div>
        </div>
      </Modal>
    );
  }

  renderWizard() {
    const { type, claims } = this.props

    if (type === 'Faucet') {
      return (
        <React.Fragment>
          <div>
            {this.context.t('proofFaucetWaiting')}
          </div>
        </React.Fragment>
      )
    }

    switch (this.state.currentStep) {
      case STEP_PRIVATE_KEY:
        return (
          <StepPrivateKey
            currentStep={STEP_PRIVATE_KEY}
            totalSteps={TOTAL_STEPS}
            keyType={type}
            onNext={(privKey, isFile, passphrase, pgpKeyId) => this.setState({ currentStep: STEP_HNS_ADDRESS, privKey, isFile, passphrase, pgpKeyId })}
            skipProofGeneration={() => this.setState({ generateProofInBob: false })}
          />
        )
      case STEP_HNS_ADDRESS:
        return (
          <StepHnsAddress
            currentStep={STEP_HNS_ADDRESS}
            totalSteps={TOTAL_STEPS}
            onBack={() => this.setState({ currentStep: STEP_PRIVATE_KEY })}
            onNext={(hnsAddr) => {
              this.setState({ currentStep: STEP_GENERATING, hnsAddr }, this.searchForAirdropProofs)
            }}
          />
        )
      case STEP_GENERATING:
        return (
          <StepGenerating
            currentStep={STEP_GENERATING}
            totalSteps={TOTAL_STEPS}
            onBack={() => this.setState({ currentStep: STEP_PRIVATE_KEY })}
            onNext={() => this.setState({ currentStep: STEP_PROOFS })}
            claims={claims}
          />
        )
      case STEP_PROOFS:
        return (
          <StepProofs
            currentStep={STEP_PROOFS}
            totalSteps={TOTAL_STEPS}
            onBack={() => this.setState({ currentStep: STEP_GENERATING }, this.searchForAirdropProofs)}
            onNext={this.onSubmit}
            claims={claims}
            isUploading={this.state.isUploading}
          />
        )
    }
  }

  renderManual(type) {
    const {t} = this.context;
    let command = '';

    if (type === 'PGP') {
      command = 'hs-airdrop [key-path] [key-id] [addr] -f 0.5';
    } else if (type === 'SSH') {
      command = 'hs-airdrop [key-path] [addr] -f 0.5';
    } else if (type === 'Faucet') {
      command = 'hs-airdrop [addr] -f 0.5'
    }

    return (
      <React.Fragment>
        <div className="proof__step">
          <div className="proof__step-title">
            <span className="proof__step-title--bolded">{t('proofStep1')}</span>
            <span>{t('proofStep1InstallPrefix')} <Anchor href='https://github.com/handshake-org/hs-airdrop' target="_blank">hs-airdrop</Anchor>.</span>
          </div>
          <div className="proof__step-description">
            {t('proofStep1BodyPrefix')} <a onClick={() => shell.openExternal('https://github.com/handshake-org/hs-airdrop')}>{t('proofStep1Link')}</a>{t('proofStep1BodySuffix')}
          </div>
        </div>
        <div className="proof__step">
          <div className="proof__step-title">
            <span className="proof__step-title--bolded">{t('proofStep2')}</span>
            <span>{t('proofStep2Title')}</span>
          </div>
          <div className="proof__step-description">
            {t('proofStep2Body')}

            <pre className="proof__cli-step">
              <code>
                {command}
              </code>
            </pre>

            {t('proofStep2Result')}
          </div>
        </div>
        <div className="proof__step">
          <div className="proof__step-title">
            <span className="proof__step-title--bolded">{t('proofStep3')}</span>
            <span>{t('proofStep3Title')}</span>
          </div>
          <div className="proof__step-description">
            {t('proofStep3Body')}
          </div>
          <div className="proof__text-input">
            <textarea
              value={this.state.proof}
              onChange={this.setProof}
            />
          </div>
        </div>
        <div className="proof-modal__footer">
          <button
            className="proof-modal__footer__secondary-cta"
            onClick={() => this.setState({ generateProofInBob: true })}
          >
            {t('proofUseWizard')}
          </button>
          <button
            className="extension_cta_button create_cta"
            onClick={this.onSubmit}
            disabled={this.isDisabled() || this.state.isUploading}
          >
            {this.state.isUploading ? t('proofUploading') : t('proofClaim')}
          </button>
        </div>
      </React.Fragment>
    );
  }

  renderInfoBox() {
    const { network, chainHeight } = this.props;
    if (network === NETWORKS.MAINNET && chainHeight < 2016) {
      return (
        <div className="proof__alert">
          <strong>{this.context.t('proofInfoImportant')}</strong> {this.context.t('proofInfoBody')}
        </div>
      );
    }

    return null;
  }
}
