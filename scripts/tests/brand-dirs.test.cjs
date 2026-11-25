// Covers the directory move that carries an existing install across the product rename.
//
// The behaviour worth pinning is not that a move happens - it is the two ways this must
// refuse to act: never onto an existing directory, and never by throwing when the move
// fails, because either would turn a rename into data loss or a startup crash.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {migrateDirectory, resolveUserDataDir, resolveChainDir} = require('../../app/background/storage/brandDirs.js');

const silent = () => {};

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-dirs-'));
  return {
    root,
    at: (...parts) => path.join(root, ...parts),
    cleanup: () => fs.rmSync(root, {recursive: true, force: true}),
  };
}

test('a vacant target takes the legacy directory with it', () => {
  const f = fixture();
  try {
    fs.mkdirSync(f.at('Old'));
    fs.writeFileSync(f.at('Old', 'wallet.dat'), 'keys');

    const used = migrateDirectory({target: f.at('New'), legacy: f.at('Old'), log: silent});

    assert.equal(used, path.resolve(f.at('New')), 'reports the new directory');
    assert.equal(fs.existsSync(f.at('Old')), false, 'the old directory is gone');
    assert.equal(fs.readFileSync(f.at('New', 'wallet.dat'), 'utf8'), 'keys', 'contents survive');
  } finally {
    f.cleanup();
  }
});

test('an existing target is never written over', () => {
  const f = fixture();
  try {
    fs.mkdirSync(f.at('Old'));
    fs.writeFileSync(f.at('Old', 'wallet.dat'), 'old keys');
    fs.mkdirSync(f.at('New'));
    fs.writeFileSync(f.at('New', 'wallet.dat'), 'current keys');

    const used = migrateDirectory({target: f.at('New'), legacy: f.at('Old'), log: silent});

    assert.equal(used, path.resolve(f.at('New')));
    assert.equal(fs.readFileSync(f.at('New', 'wallet.dat'), 'utf8'), 'current keys');
    assert.equal(fs.readFileSync(f.at('Old', 'wallet.dat'), 'utf8'), 'old keys', 'the source is left alone');
  } finally {
    f.cleanup();
  }
});

test('a move that cannot be made keeps the caller on the existing directory', () => {
  const f = fixture();
  try {
    fs.mkdirSync(f.at('Old'));
    fs.writeFileSync(f.at('Old', 'wallet.dat'), 'keys');

    // The destination's parent is a file, so the move cannot be performed.
    fs.writeFileSync(f.at('blocked'), 'not a directory');
    const used = migrateDirectory({
      target: f.at('blocked', 'New'),
      legacy: f.at('Old'),
      log: silent,
    });

    assert.equal(used, path.resolve(f.at('Old')), 'falls back to the reachable directory');
    assert.equal(fs.readFileSync(f.at('Old', 'wallet.dat'), 'utf8'), 'keys', 'data is still there');
  } finally {
    f.cleanup();
  }
});

test('a missing legacy directory simply yields the target', () => {
  const f = fixture();
  try {
    const used = migrateDirectory({target: f.at('New'), legacy: f.at('Absent'), log: silent});
    assert.equal(used, path.resolve(f.at('New')));
    assert.equal(fs.existsSync(f.at('New')), false, 'and nothing is created');
  } finally {
    f.cleanup();
  }
});

test('the oldest legacy name present is the one moved', () => {
  const f = fixture();
  try {
    fs.mkdirSync(f.at('FurryFly'));
    fs.writeFileSync(f.at('FurryFly', 'marker'), 'first');

    const used = resolveUserDataDir({
      appDataPath: f.root,
      targetName: 'Transfur',
      legacyNames: ['FurryFly', 'SomethingOlder'],
      log: silent,
    });

    assert.equal(used, path.resolve(f.at('Transfur')));
    assert.equal(fs.readFileSync(f.at('Transfur', 'marker'), 'utf8'), 'first');
  } finally {
    f.cleanup();
  }
});

test('an install already on the current name is left untouched', () => {
  const f = fixture();
  try {
    fs.mkdirSync(f.at('FurryFly'));
    fs.mkdirSync(f.at('Transfur'));

    const used = resolveUserDataDir({
      appDataPath: f.root,
      targetName: 'Transfur',
      legacyNames: ['FurryFly'],
      log: silent,
    });

    assert.equal(used, path.resolve(f.at('Transfur')));
    assert.equal(fs.existsSync(f.at('FurryFly')), true, 'the older directory is not consumed');
  } finally {
    f.cleanup();
  }
});

test('the chain directory falls back to its target when no legacy path exists', () => {
  const f = fixture();
  try {
    const used = resolveChainDir({
      target: f.at('E', 'Transfur', 'hsd_data'),
      legacyDirs: [f.at('E', 'FurryFly', 'hsd_data')],
      log: silent,
    });

    assert.equal(used, path.resolve(f.at('E', 'Transfur', 'hsd_data')));
  } finally {
    f.cleanup();
  }
});

test('a null chain directory stays null rather than inventing a path', () => {
  assert.equal(resolveChainDir({target: null, legacyDirs: ['ignored'], log: silent}), null);
});

test('moving the chain directory clears the emptied outer directory', () => {
  const f = fixture();
  try {
    fs.mkdirSync(f.at('E', 'FurryFly', 'hsd_data'), {recursive: true});
    fs.writeFileSync(f.at('E', 'FurryFly', 'hsd_data', 'chain.dat'), 'blocks');

    const used = resolveChainDir({
      target: f.at('E', 'Transfur', 'hsd_data'),
      legacyDirs: [f.at('E', 'FurryFly', 'hsd_data')],
      log: silent,
    });

    assert.equal(used, path.resolve(f.at('E', 'Transfur', 'hsd_data')));
    assert.equal(fs.readFileSync(f.at('E', 'Transfur', 'hsd_data', 'chain.dat'), 'utf8'), 'blocks');
    assert.equal(fs.existsSync(f.at('E', 'FurryFly')), false, 'the empty outer directory is gone');
  } finally {
    f.cleanup();
  }
});

test('an outer directory that still holds something is kept', () => {
  const f = fixture();
  try {
    fs.mkdirSync(f.at('E', 'FurryFly', 'hsd_data'), {recursive: true});
    fs.writeFileSync(f.at('E', 'FurryFly', 'notes.txt'), 'mine');

    resolveChainDir({
      target: f.at('E', 'Transfur', 'hsd_data'),
      legacyDirs: [f.at('E', 'FurryFly', 'hsd_data')],
      log: silent,
    });

    assert.equal(fs.existsSync(f.at('E', 'FurryFly')), true, 'a non-empty directory is left alone');
    assert.equal(fs.readFileSync(f.at('E', 'FurryFly', 'notes.txt'), 'utf8'), 'mine');
  } finally {
    f.cleanup();
  }
});
