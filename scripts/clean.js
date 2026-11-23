// Cross-platform replacement for the former clean.sh (bash-only, so it could
// not run on Windows). Removes the build output directories.
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

for (const dir of ['dist', 'release']) {
  fs.rmSync(path.join(rootDir, dir), { recursive: true, force: true });
  console.log(`Removed ${dir}.`);
}
