import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { I18nContext } from '../../utils/i18n';
import './header.scss';

export default class Header extends Component {
  static contextType = I18nContext;

  static propTypes = {
    blockHeight: PropTypes.number.isRequired,
    status: PropTypes.string.isRequired,
  };

  static defaultProps = {
    blockHeight: 1234,
  };

  render() {
    const { blockHeight } = this.props;

    return (
      <div className="header">
        <div className="header__content">
          <div className="header__title">
            {this.context.t('headerHandshakeWallet')}
          </div>
          <div className="header__block-height">
            <div className="header__block-height-label">
              {this.context.t('headerCurrentHeight')}:
            </div>
            <div className="header__block-height-text">
              {blockHeight}
            </div>
          </div>
          <div className="header__status">
            {this.context.t('synced')}
          </div>
        </div>
      </div>
    );
  }
}
