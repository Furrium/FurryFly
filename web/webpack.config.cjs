const fs = require('node:fs');
const path = require('node:path');
const webpack = require('webpack');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const output = process.env.TRANSFUR_WEB_DIST
  ? path.resolve(process.env.TRANSFUR_WEB_DIST) : path.join(__dirname, 'dist');

class StaticFiles {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('WebWalletStaticFiles', compilation => {
      compilation.hooks.processAssets.tap({name: 'WebWalletStaticFiles',
        stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL}, () => {
        for (const name of ['index.html', 'wallet.css', '_headers']) {
          const file = path.join(__dirname, 'public', name);
          compilation.fileDependencies.add(file);
          const source = fs.readFileSync(file, 'utf8');
          if (name === 'wallet.css') {
            const tokens = path.join(__dirname, '..', 'app', 'tokens.scss');
            compilation.fileDependencies.add(tokens);
            const {css} = require('sass').compile(tokens, {style: 'compressed'});
            compilation.emitAsset(name, new webpack.sources.RawSource(`${css}\n${source}`));
          } else {
            compilation.emitAsset(name, new webpack.sources.RawSource(source));
          }
        }
      });
    });
  }
}

module.exports = [
  {name: 'web-wallet', mode: 'production', target: 'web', devtool: false,
    entry: path.join(__dirname, 'src/wallet-ui.cjs'), output: {path: output, filename: 'wallet.js'},
    plugins: [new StaticFiles()]},
  {name: 'web-wallet-signer', mode: 'production', target: 'webworker', devtool: false,
    entry: path.join(__dirname, 'src/signer.worker.cjs'), output: {path: output, filename: 'signer.js'},
    resolve: {fallback: {child_process: false, dns: false, fs: false, module: false, readline: false, net: false, tls: false}},
    plugins: [
      new NodePolyfillPlugin({excludeAliases: ['crypto']}),
      // Prevent 8.5 MiB of name indexes from entering the payments-only signer.
      // Local/serverless full nodes still use the unmodified hsd database.
      new webpack.NormalModuleReplacementPlugin(/^\.\/(?:reserved|locked)$/, resource => {
        if (resource.context.endsWith(path.join('hsd', 'lib', 'covenants'))) {
          resource.request = path.join(__dirname, 'src', 'no-name-database.cjs');
        }
      }),
    ],
    performance: {hints: false}},
];
