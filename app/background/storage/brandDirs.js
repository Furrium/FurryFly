// Carries this app's data across a product rename.
//
// The wallet database, the chain and the node prefix live in directories named after the
// product, so renaming the product moves their path. Without this, an existing install
// would come up with an empty wallet and an unsynced chain, and the old data would sit on
// disk where nothing looks for it any more.
//
// Two rules keep this safe:
//
//   1. The destination wins. A directory that already exists is never touched, because it
//      is either the current install's or a previous migration's, and a rename onto it
//      would either fail or merge two histories.
//   2. A failure is survivable and never silent. When the move cannot be made - a locked
//      file, a volume without rename permission, a destination that appears mid-flight -
//      the caller keeps using the source directory so the data stays reachable, and the
//      reason is logged once.
//
// CommonJS and dependency-free, so the main process can require it before Electron is
// configured and plain node --test files can require it without a transform.
const fs = require('fs');
const path = require('path');

function noop() {}

// Moves one directory aside, if and only if that is unambiguous and possible.
//
// Returns the directory the caller should use: the destination on success or when there
// was nothing to move, and the source when the move failed.
function migrateDirectory({target, legacy, log = noop}) {
  if (!target || !legacy) {
    return target || legacy;
  }

  const from = path.resolve(legacy);
  const to = path.resolve(target);

  if (from === to) {
    return to;
  }

  // Nothing to carry across, or somewhere to carry it to already.
  if (!fs.existsSync(from) || fs.existsSync(to)) {
    return to;
  }

  try {
    fs.mkdirSync(path.dirname(to), {recursive: true});
    fs.renameSync(from, to);
    log(`[branding] Moved ${from} to ${to}.`);
    return to;
  } catch (error) {
    log(`[branding] Could not move ${from} to ${to}: ${error.message}. Continuing to use the existing directory.`);
    return from;
  }
}

// Walks the legacy names oldest-first and stops at the first one that exists. Returns the
// directory the app should use as its userData path.
function resolveUserDataDir({appDataPath, targetName, legacyNames = [], log = noop}) {
  const target = path.join(appDataPath, targetName);

  if (fs.existsSync(target)) {
    return target;
  }

  for (const legacyName of legacyNames) {
    const legacy = path.join(appDataPath, legacyName);

    if (!fs.existsSync(legacy)) {
      continue;
    }

    return migrateDirectory({target, legacy, log});
  }

  return target;
}

// Same walk for the node prefix, which lives wherever chainDir points rather than under
// appData. The paths are absolute, so the move is a same-volume rename whenever the
// preferred drive is present, and a no-op when it is not.
function resolveChainDir({target, legacyDirs = [], log = noop}) {
  if (!target) {
    return target;
  }

  if (fs.existsSync(target)) {
    return target;
  }

  for (const legacy of legacyDirs) {
    if (!legacy || !fs.existsSync(legacy)) {
      continue;
    }

    return migrateDirectory({target, legacy, log});
  }

  return target;
}

module.exports = {migrateDirectory, resolveUserDataDir, resolveChainDir};
