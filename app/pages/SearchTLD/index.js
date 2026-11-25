import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import TLDInput from '../../components/TLDInput';
import './searchTLD.scss';
import { I18nContext } from "../../utils/i18n";
import { clientStub as aClientStub } from '../../background/analytics/client';

const analytics = aClientStub(() => require('electron').ipcRenderer);

// Entering a name is the only way into the auction and registration flow, and until now
// the only control for it was a small field in the top bar. That made the first step of
// acquiring a name the least visible thing in the interface.
//
// The field itself is the same component the top bar uses, so the behaviour is identical
// by construction - it dispatches the lookup and pushes /domain/<name> on Enter or on the
// magnifier. Only the surrounding surface is new.
@withRouter
class SearchTLD extends Component {
  static contextType = I18nContext;

  componentDidMount() {
    analytics.screenView('Register Name');
  }

  render() {
    const {t} = this.context;

    return (
      <div className="search_tld">
        <div className="search_tld__panel">
          <span className="search_tld__kicker">{t('headingRegister')}</span>
          <h1 className="search_tld__headline">{t('registerHeadline')}</h1>
          <p className="search_tld__hint">{t('registerHint')}</p>
          <div className="search_tld__field">
            <TLDInput greyTheme />
          </div>
        </div>
      </div>
    );
  }
}

export default SearchTLD;
