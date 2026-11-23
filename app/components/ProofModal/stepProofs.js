import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import Submittable from "../Submittable";
import WizardHeader from "../WizardHeader";
import {I18nContext} from "../../utils/i18n";

@connect()
export default class StepProofs extends Component {
  static propTypes = {
    currentStep: PropTypes.number.isRequired,
    totalSteps: PropTypes.number.isRequired,
    onBack: PropTypes.func.isRequired,
    onNext: PropTypes.func.isRequired,
    claims: PropTypes.object.isRequired,
    isUploading: PropTypes.bool.isRequired,
  };

  static contextType = I18nContext;

  constructor(props) {
    super(props);
    this.state = {};
  }

  onSubmit = () => {
    this.props.onNext();
  };

  render() {
    const { currentStep, totalSteps, onBack } = this.props;
    const {t} = this.context;

    return (
      <div className="proof-modal">
        <WizardHeader
          currentStep={currentStep}
          totalSteps={totalSteps}
          onBack={onBack}
        />
        <div className="proof-modal__content">
          <Submittable onSubmit={this.onSubmit}>
            <div className="proof-modal__header_text">{t('proofBroadcastTitle')}</div>
            <div className="proof-modal__body-text">
              {t('proofBroadcastBody')}
            </div>

            {/* Proofs */}
            {this.props.claims.airdropProofs.map((proof, idx) => (
              <div className="step_proofs__proof" key={idx}>
                {proof.b64encoded}
              </div>
            ))}
          </Submittable>
        </div>
        <div className="proof-modal__footer proof-modal__footer--single">
          <button
            className="extension_cta_button create_cta"
            onClick={this.onSubmit}
            disabled={this.props.isUploading}
          >
            {this.props.isUploading ? t('proofUploading') : t('proofBroadcastCta')}
          </button>
        </div>
      </div>
    );
  }
}
