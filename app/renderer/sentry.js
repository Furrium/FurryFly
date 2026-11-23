const Sentry = require('@sentry/electron/renderer');
const {app} = require('./electron');
const BRAND = require('../constants/branding');
const pkg = require('../../package.json');

if (app.isPackaged && BRAND.sentryDsn) {
  Sentry.init({
    dsn: BRAND.sentryDsn,
    release: `${BRAND.packageName}@${pkg.version}`,
  });
}
