import React, { Component } from 'react';
import MiniModal from '../../components/Modal/MiniModal';
import './account-index-modal.scss';
import {I18nContext} from "../../utils/i18n";

export default class AccountIndexModal extends Component {
  static contextType = I18nContext;

  render() {
    const {t} = this.context;
    return (
      <MiniModal title={t('accountIndexTitle')} closeRoute="/settings" centered>
        <div className="account-index-modal__instructions">
          {t('accountIndexInstructions')}
        </div>
        <div className="account-index-modal__path">
          m / 44' / 5353' /{' '}
          <input
            type="text"
            placeholder="0"
            className="account-index-modal__path-entry"
            autoFocus
          />
        </div>
        <button className="account-index-modal__submit">{t('accountIndexChange')}</button>
      </MiniModal>
    );
  }
}
