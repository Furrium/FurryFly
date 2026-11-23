import React, { Component } from 'react';
import { withRouter, Link } from 'react-router-dom';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import BRAND from '../../../constants/branding';
import './access.scss';
import {I18nContext} from "../../../utils/i18n";

// First screen of the app: a wide two-column landing rather than a tall centred
// stack. The pitch sits on the left, the three ways in sit on the right, so the
// window's width is used instead of leaving two thirds of it empty.
class FundAccessOptions extends Component {
  static propTypes = {
    history: PropTypes.shape({
      push: PropTypes.func
    }).isRequired
  };

  static contextType = I18nContext;

  render() {
    const {t} = this.context;

    return (
      <div className="landing">
        <section className="landing__pitch">
          <div className="landing__brand">
            <span className="landing__mark" aria-hidden="true" />
            <span className="landing__wordmark">{BRAND.displayName}</span>
          </div>
          <h1 className="landing__title">{t('obMainTitle')}</h1>
          <p className="landing__body">{t('obMainBody')}</p>
          <span className="landing__rule" aria-hidden="true" />
        </section>

        <section className="landing__actions">
          <button
            type="button"
            className="landing__btn landing__btn--primary"
            onClick={() => this.props.history.push('/new-wallet/local')}
          >
            {t('obMainCreateText')}
          </button>
          <button
            type="button"
            className="landing__btn"
            onClick={() => this.props.history.push('/existing-options')}
          >
            {t('obMainImportText')}
          </button>

          {!!this.props.wallets.length && (
            <Link to="/" className="landing__return">
              {t('obMainReturnToLogin')}
            </Link>
          )}
        </section>
      </div>
    );
  }
}

export default withRouter(
  connect(
    state => ({
      wallets: state.wallet.wallets
    }),
    dispatch => ({})
  )(FundAccessOptions)
);
