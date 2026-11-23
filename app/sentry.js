const Sentry = require('@sentry/electron/main');
const {app} = require('electron');
const BRAND = require('./constants/branding');

const pkg = require('../package.json');

(function () {
  if (!app.isPackaged || !BRAND.sentryDsn) {
    return;
  }

  Sentry.init({
    dsn: BRAND.sentryDsn,
    release: `${BRAND.packageName}@${pkg.version}`,
  });
})();
