// Guard against an i18n call with no binding in scope.
//
// Two earlier regex-based scans passed while app/pages/Settings/index.js still called a
// bare t() inside render(). That does not fail the build or any existing test - it throws
// "ReferenceError: t is not defined" when the page renders, and the page comes up blank.
// Only real scope analysis catches it, so that is what runs here.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const parser = require(path.join(ROOT, 'node_modules/@babel/parser'));
const traverseMod = require(path.join(ROOT, 'node_modules/@babel/traverse'));
const traverse = traverseMod.default || traverseMod;

// Names this project resolves through the i18n context or an injected translator.
const WATCHED = ['t', 'translate', 'tContext', 'translateLocale'];

const PLUGINS = [
  'jsx', 'classProperties', 'classPrivateProperties', 'classPrivateMethods',
  'decorators-legacy', 'objectRestSpread', 'optionalChaining', 'nullishCoalescingOperator',
  'dynamicImport', 'exportDefaultFrom', 'exportNamespaceFrom', 'topLevelAwait',
  'numericSeparator', 'logicalAssignment',
];

function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'tests', 'dist', 'release', 'test-dist'].includes(entry.name)) continue;
      sourceFiles(full, out);
    } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.spec.js')) {
      out.push(full);
    }
  }
  return out;
}

test('no i18n helper is called without a binding in scope', () => {
  const unresolved = [];

  for (const file of sourceFiles(path.join(ROOT, 'app'))) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const code = fs.readFileSync(file, 'utf8');

    let ast;
    try {
      ast = parser.parse(code, {sourceType: 'module', plugins: PLUGINS, errorRecovery: true});
    } catch (error) {
      assert.fail(`${rel} did not parse: ${error.message.split('\n')[0]}`);
    }

    // A module that imports one of these names binds it for the whole file.
    const moduleBound = new Set();
    traverse(ast, {
      ImportDeclaration(p) {
        for (const spec of p.node.specifiers) {
          if (spec.local) moduleBound.add(spec.local.name);
        }
      },
    });

    traverse(ast, {
      Identifier(p) {
        const name = p.node.name;
        if (!WATCHED.includes(name)) return;
        if (!p.isReferencedIdentifier()) return;
        if (moduleBound.has(name)) return;
        // getBinding is the correct test: hasGlobal() reports an unbound name as global.
        if (p.scope.getBinding(name)) return;

        const parent = p.parent;
        if (parent.type === 'MemberExpression' && parent.property === p.node && !parent.computed) return;
        if ((parent.type === 'ObjectProperty' || parent.type === 'ObjectMethod')
            && parent.key === p.node && !parent.computed) return;

        const line = p.node.loc ? p.node.loc.start.line : 0;
        unresolved.push(`${rel}:${line} calls ${name}() with no binding`);
      },
    });
  }

  assert.deepStrictEqual(unresolved, [],
    `These render-time ReferenceErrors blank the page:\n${unresolved.join('\n')}`);
});
