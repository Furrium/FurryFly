// Rebuild the native modules this app actually uses against Electron's ABI.
//
// Why this exists instead of `electron-builder install-app-deps`:
//
// `bns` declares `unbound` as an *optional* dependency, and
// bns/lib/resolver/unbound.js loads it inside a try/catch, falling back to its
// own pure-JS recursive resolver:
//
//     try { module.exports = require('./ub'); }
//     catch (e) { module.exports = require('./recursive'); }
//
// `unbound` is a binding for the external libunbound C library (its binding.gyp
// links `-lunbound.lib` and includes <unbound.h>). libunbound is not part of the
// Windows SDK, so it cannot be built here. npm itself tolerates that because the
// dependency is optional, but `electron-builder install-app-deps` auto-collects
// every native package in the dependency tree and fails hard on it, which aborted
// the entire postinstall.
//
// So: rebuild an explicit list, and leave `unbound` unbuilt so bns uses its
// designed JS fallback. If you later provide libunbound for Windows x64, run
// `node scripts/rebuild-native.js --include-unbound` to build it too.
//
// The environment variables below mirror app-builder-lib/out/util/yarn.js
// getGypEnv(), which is exactly what electron-builder would have set.

const {spawnSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const pkg = require(path.join(rootDir, 'package.json'));

// Packages whose compiled binary must match Electron's ABI.
const NATIVE_MODULES = [
  'bcrypto',
  'bdb',
  'goosig',
  'leveldown',
  'mrmr',
  'node-hid',
];

// Deliberately excluded; see the header comment.
const EXCLUDED = {
  unbound: 'needs external libunbound; bns/ unbound.js falls back to ./recursive',
};

const electronVersion =
  (pkg.devDependencies && pkg.devDependencies.electron) || '';
if (!electronVersion) {
  console.error('Cannot determine the Electron version from devDependencies.');
  process.exit(1);
}

const includeUnbound = process.argv.includes('--include-unbound');
const packages = includeUnbound
  ? [...NATIVE_MODULES, 'unbound']
  : NATIVE_MODULES;

const targetArch = process.arch;
const targetPlatform = process.platform;

const env = {
  ...process.env,
  npm_config_arch: targetArch,
  npm_config_target_arch: targetArch,
  npm_config_platform: targetPlatform,
  npm_config_target_platform: targetPlatform,
  npm_config_target_libc: 'unknown',
  npm_config_update_binary: 'true',
  npm_config_fallback_to_build: 'true',
  npm_config_disturl: 'https://electronjs.org/headers',
  npm_config_target: electronVersion,
  npm_config_runtime: 'electron',
  npm_config_devdir: path.join(os.homedir(), '.electron-gyp'),
};

console.log(
  `Rebuilding for Electron ${electronVersion} (${targetPlatform}-${targetArch}):`,
);
console.log(`  ${packages.join(', ')}`);
for (const [name, reason] of Object.entries(EXCLUDED)) {
  if (!includeUnbound) console.log(`  skipped: ${name} (${reason})`);
}
console.log('');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCmd, ['rebuild', ...packages], {
  cwd: rootDir,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status !== 0) {
  console.error(`\nnpm rebuild failed with status ${result.status}.`);
  process.exit(result.status === null ? 1 : result.status);
}

// Verify a built binary actually exists rather than trusting the exit code;
// npm rebuild reports success when a package has nothing to do.
function builtBinary(moduleName) {
  const dir = path.join(rootDir, 'node_modules', moduleName);
  if (!fs.existsSync(dir)) return null;
  const found = [];
  const walk = (current) => {
    let entries;
    try {
      entries = fs.readdirSync(current, {withFileTypes: true});
    } catch (e) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.node')) found.push(path.relative(dir, full));
    }
  };
  walk(dir);
  return found.length ? found : null;
}

console.log('\nBuilt binaries:');
let missing = 0;
for (const name of packages) {
  const found = builtBinary(name);
  if (found) {
    console.log(`  OK      ${name.padEnd(12)} ${found.join(', ')}`);
  } else {
    console.log(`  MISSING ${name.padEnd(12)} no .node binary produced`);
    missing += 1;
  }
}

if (missing > 0) {
  console.error(`\n${missing} native module(s) did not produce a binary.`);
  process.exit(1);
}
console.log('\nAll required native modules are built for Electron.');
