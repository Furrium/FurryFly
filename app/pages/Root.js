import React, { Component } from 'react';
import {connect, Provider} from 'react-redux';
import { ConnectedRouter } from '@rithvikvibhu/connected-react-router';
import App from './App';
import {I18nContext, translateLocale, normalizeLocale} from "../utils/i18n";

export default class Root extends Component {

  render() {
    // eslint-disable-next-line react/prop-types
    const { store, history } = this.props;

    return (
      <Provider store={store}>
        <Content history={history} />
      </Provider>
    );
  }
}

@connect(
  (state) => ({
    locale: state.app.locale,
    customLocale: state.app.customLocale,
    theme: state.app.theme,
  }),
)
class Content extends Component {
  componentDidMount() {
    this.applyThemeClass();
    this.applyLocale();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.locale !== this.props.locale) this.applyLocale();
    if (prevProps.theme !== this.props.theme) {
      this.applyThemeClass();
    }
  }

  applyLocale() {
    document.documentElement.lang = normalizeLocale(this.props.locale);
  }

  applyThemeClass() {
    const theme = this.props.theme || 'dark';
    // `data-theme` drives the design tokens in tokens.scss. The legacy
    // `bob-theme-dark` class stays while components still key off it: neon is a
    // dark-family variant, so it has to activate those dark rules too, otherwise
    // the UI would show light surfaces underneath neon accents.
    document.body.dataset.theme = theme;
    document.body.classList.add('bob-theme-dark');
  }

  translate = (key, ...values) => translateLocale(
    this.props.locale, this.props.customLocale, key, ...values,
  );

  render() {
    return (
      <I18nContext.Provider
        value={{
          t: this.translate,
          locale: this.props.locale,
        }}
      >
        <ConnectedRouter history={this.props.history}>
          <App />
        </ConnectedRouter>
      </I18nContext.Provider>
    );
  }
}
