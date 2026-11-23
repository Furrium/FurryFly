import React, {Component} from 'react';
import SignMessage from '../SignMessage';
import VerifyMessage from '../VerifyMessage';
import DocsHelp from '../../components/DocsHelp';
import {I18nContext} from '../../utils/i18n';
import './messages.scss';
const BRAND = require('../../constants/branding');

class Messages extends Component {
  static contextType = I18nContext;

  state = {
    mode: 'sign',
  };

  render() {
    const {t} = this.context;
    const {mode} = this.state;

    return (
      <div className="messages-page">
        <DocsHelp
          title={t('headingMessages')}
          href={`${BRAND.siteUrl}/docs/messages`}
        >
          {t('messagesPageHelp')}
        </DocsHelp>
        <div className="messages-page__help">
          <div>
            <div className="messages-page__help-title">{t('messagesSafeExamplesTitle')}</div>
            <p>{t('messagesSafeExampleOwnership')}</p>
            <p>{t('messagesSafeExampleSupport')}</p>
          </div>
          <div>
            <div className="messages-page__help-title">{t('messagesBeforeSigningTitle')}</div>
            <p>{t('messagesBeforeSigningHelp')}</p>
          </div>
        </div>
        <div className="messages-page__tabs">
          <button
            className={mode === 'sign' ? 'messages-page__tab messages-page__tab--active' : 'messages-page__tab'}
            onClick={() => this.setState({mode: 'sign'})}
          >
            {t('headingSignMessage')}
          </button>
          <button
            className={mode === 'verify' ? 'messages-page__tab messages-page__tab--active' : 'messages-page__tab'}
            onClick={() => this.setState({mode: 'verify'})}
          >
            {t('headingVerifyMessage')}
          </button>
        </div>
        <div className="messages-page__content">
          {mode === 'sign' ? <SignMessage /> : <VerifyMessage />}
        </div>
      </div>
    );
  }
}

export default Messages;
