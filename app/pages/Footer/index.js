import React, { Component } from 'react';
import { connect } from 'react-redux';
import Hash from '../../components/Hash';
import './index.scss';
import Anchor from '../../components/Anchor';
import {I18nContext} from '../../utils/i18n';

// @connect(
//   state => ({
//     height: state.chain.height
//     currentHash: state.chain.currentHash
//   }),
//   null
// )
export default class Footer extends Component {
  static contextType = I18nContext;

  render() {
    const {t} = this.context;
    return (
      <div className="window-footer">
        <div className="window-footer__centerer">
          <div className="window-footer__40">
            <div className="window-footer__hashinfo">
              <p className="window-footer__explainer">
                {/* // Temp Fix until we have the blockchain connected */}
                {/* <strong>Current height:</strong> {this.props.height} */}
                <strong>{t('currentHeight')}:</strong> 0
              </p>
              <p className="window-footer__explainer">
                <strong>{t('currentHash')}:</strong>{' '}
                {/* // Temp Fix until we have the blockchain connected */}
                {/* <Hash value={this.props.currentHash} /> */}0
              </p>
            </div>

            <p className="window-footer__explainer">
              {t('footerExplainer')}
            </p>
          </div>
          <div className="window-footer__20">
            <div className="window-footer__nav-header">AAW</div>
            <ul className="window-footer__nav-links">
              <li>
                <Anchor href="https://handshake.org/faq">
                  FAQ
                </Anchor>
              </li>
              <li>
                <a>{t('footerTermsOfUse')}</a>
              </li>
            </ul>
          </div>
          <div className="window-footer__20">
            <div className="window-footer__nav-header">Handshake</div>
            <ul className="window-footer__nav-links">
              <li>
                <a>{t('footerRedeemCoins')}</a>
              </li>
              <li>
                <Anchor href="https://handshake.org/">
                  handshake.org
                </Anchor>
              </li>
            </ul>
          </div>
          <div className="window-footer__20">
            <div className="window-footer__nav-header">{t('footerCommunity')}</div>
            <ul className="window-footer__nav-links">
              <li>
                <Anchor href="https://github.com/handshake-org/">
                  GitHub
                </Anchor>
              </li>
              <li>
                <Anchor href="https://twitter.com/hns">
                  Twitter
                </Anchor>
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }
}
