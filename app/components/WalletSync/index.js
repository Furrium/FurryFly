import React, { Component } from 'react';
import Modal from '../Modal';
import './walletsync.scss';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import * as walletActions from '../../ducks/walletActions';
import { I18nContext } from '../../utils/i18n';

@connect(
  (state) => ({
    walletSync: state.wallet.walletSync,
    walletSyncProgress: state.wallet.walletSyncProgress,
  })
)
export default class WalletSync extends Component {
  static contextType = I18nContext;

  static propTypes = {
    walletSync: PropTypes.bool.isRequired,
    walletSyncProgress: PropTypes.number.isRequired,
  };

  render() {
    if (!this.props.walletSync) {
      return null;
    }

    return (
      <Modal className="wallet-sync__wrapper" onClose={() => ({})}>
        <div className="wallet-sync__progress">
          {this.context.t('walletSyncingProgress', this.props.walletSyncProgress)}
        </div>
      </Modal>
    );
  }
}
