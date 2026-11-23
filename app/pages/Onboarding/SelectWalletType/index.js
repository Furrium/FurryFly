import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import './select-wallet-type.scss';
import Submittable from '../../../components/Submittable';
import WizardHeader from '../../../components/WizardHeader';
import {I18nContext} from '../../../utils/i18n';

@connect()
export default class SelectWalletType extends Component {
  static propTypes = {
    currentStep: PropTypes.number.isRequired,
    totalSteps: PropTypes.number.isRequired,
    onBack: PropTypes.func.isRequired,
    onNext: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
  };

  static contextType = I18nContext;

  // Multisig is not offered in this build. Only single-signature wallets are created,
  // which is why the step always reports 1-of-1 and no longer keeps validation state
  // for a threshold the UI cannot set.
  onSubmit = () => {
    this.props.onNext(1, 1);
  };

  isValid = () => true;

  render() {
    const {t} = this.context;
    const {currentStep, totalSteps, onBack, onCancel} = this.props;

    return (
      <div className="swt">
        <WizardHeader
          currentStep={currentStep}
          totalSteps={totalSteps}
          onBack={onBack}
          onCancel={onCancel}
        />
        <div className="swt__content">
          <Submittable onSubmit={this.onSubmit}>
            <div className="swt__header-text">
              {t('obSelectWalletTypeTitle')}
            </div>
            <div className="swt__body-text">
              {t('obSelectWalletTypeBody1')}<br />
              {t('obSelectWalletTypeBody2')}
            </div>
          </Submittable>
        </div>
        <div className="swt__footer">
          <button
            className="extension_cta_button create_cta"
            onClick={this.onSubmit}
            disabled={!this.isValid()}
          >
            {t('next')}
          </button>
        </div>
      </div>
    );
  }
}
