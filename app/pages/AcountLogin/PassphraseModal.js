import React, { Component } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import c from 'classnames';
import * as walletActions from '../../ducks/walletActions';
import './login.scss';
import Submittable from '../../components/Submittable';
import MiniModal from '../../components/Modal/MiniModal';
import {I18nContext} from '../../utils/i18n';

@connect(
  (state) => ({
    getPassphrase: state.wallet.getPassphrase,
    wid: state.wallet.wid,
  }),
  dispatch => ({
    unlockWallet: (name, passphrase) => dispatch(walletActions.unlockWallet(name, passphrase)),
    closeGetPassphrase: () => dispatch(walletActions.closeGetPassphrase()),
  })
)
export default class PassphraseModal extends Component {
  static propTypes = {
    wid: PropTypes.string.isRequired,
    unlockWallet: PropTypes.func.isRequired,
    closeGetPassphrase: PropTypes.func.isRequired,
    getPassphrase: PropTypes.object.isRequired,
  };

  static defaultProps = {
    className: ''
  };

  static contextType = I18nContext;

  state = {
    passphrase: '',
    showError: false
  };

  async handleLogin(passphrase) {
    try {
      const {wid, unlockWallet, getPassphrase, closeGetPassphrase} = this.props;
      await unlockWallet(wid, passphrase);
      this.setState({passphrase: ''});
      getPassphrase.resolve(passphrase);
      closeGetPassphrase();
    } catch (error) {
      return this.setState({ showError: true });
    }
  }

  onClose = () => {
    this.setState({passphrase:'', showError: false});
    this.props.getPassphrase.reject({message: 'No Password'});
    this.props.closeGetPassphrase();
  };

  render() {
    const { passphrase, showError } = this.state;
    const {t} = this.context;

    if (!this.props.getPassphrase.get)
      return null;

    return (
      <MiniModal
        onClose={this.onClose}
        title={t('enterPassword')}
        centered
      >
        <Submittable onSubmit={() => this.handleLogin(passphrase)}>
          <div>
            <input
              className={c('login_password_input', {
                'login_password_input--error': showError
              })}
              type="password"
              placeholder={t('passwordInputPlaceholder')}
              onChange={e =>
                this.setState({ passphrase: e.target.value, showError: false })
              }
              value={passphrase}
              autoFocus
            />
          </div>
          <div className="login_password_error">
            {showError && t('loginError')}
          </div>
        </Submittable>
        <button
          className="extension_cta_button login_cta"
          onClick={() => this.handleLogin(passphrase)}
        >
          {t('submit')}
        </button>
      </MiniModal>
    );
  }
}
