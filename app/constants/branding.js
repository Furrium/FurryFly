// Single source of truth for the product identity.
//
// package.json carries the same values because electron-builder cannot import
// JavaScript; scripts/tests/branding.test.cjs asserts the two stay in sync.
//
// CommonJS on purpose: the main process, the babel-compiled bundle and the
// webpack renderer all consume it, and plain node --test files can require it
// without a transform.
module.exports = {
  displayName: 'FurryFly',
  packageName: 'furryfly-wallet',
  appId: 'com.furryfly.wallet',
  // The URL scheme this app registers and accepts.
  protocol: 'furryfly',

  // Extra schemes this build will handle when the OS delivers them. Deliberately
  // NOT listed in package.json: the installer would then claim them outright and
  // take them from an installed Bob LearnHNS. main.js adopts one at runtime only
  // when no other executable owns it.
  compatProtocols: ['bob-learnhns'],
  // Directory under appData() that holds wallet, chain and hsd data.
  userDataDirName: 'FurryFly',

  // Preferred home for the node prefix (chain, wallet db, indexes). The chain is
  // the only part of this app that grows without bound, so it is kept off the
  // system drive when this location is usable. Resolved on every start and never
  // persisted, so a machine without this drive falls back to appData. A path the
  // user picks in Settings > Connection always wins.
  chainDir: 'E:\\FurryFly\\hsd_data',

  // Offset added to hsd's base ports for the node, wallet, recursive resolver
  // and authoritative resolver. This app must not sit on the same ports as an
  // installed Bob LearnHNS, which occupies base+1000; upstream Bob uses base+0.
  // FurryFly therefore runs at base+3000.
  nodePortOffset: 3000,

  // Canonical site. Every documentation and help link in the app points here, so the
  // site has to serve the paths listed in README.md under "Site URLs" — that list is
  // the contract between this build and the website.
  siteUrl: 'https://furryfly.com',

  // GitHub "owner/name" whose releases this build may update itself from.
  // null disables the update check. Keep null unless the repository actually
  // publishes this product's own builds: the inherited feed pointed at a
  // different product, whose installer would replace this one.
  updateRepo: null,

  // Sentry DSN for crash reporting. null disables telemetry. Keep null unless
  // the project is your own: the inherited DSN sent this build's reports to a
  // third party.
  sentryDsn: null,
};
