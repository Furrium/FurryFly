import webpack from "webpack";

const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");

const path = require('path');

const port = process.env.PORT || 1212;
const publicPath = `http://localhost:${port}/dist`;

module.exports = {
  devtool: 'inline-source-map',

  mode: 'development',
  target: 'electron-renderer',
  entry: [
    './unit.js',
  ],
  output: {
    publicPath: publicPath,
    path: path.resolve(__dirname, '../test-dist'),
    filename: 'test.js'
  },
  resolve: {
    alias: {
      electron$: path.join(__dirname, '..', 'app', 'renderer', 'electron.js'),
      [path.join(__dirname, '..', 'app', 'utils', 'deeplinkTrace.js')]:
        path.join(__dirname, '..', 'app', 'renderer', 'deeplinkTrace.js'),
    },
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            cacheDirectory: true
          }
        }
      },
      {
        test: /\.global\.css$/,
        use: [
          {
            loader: 'style-loader'
          },
          {
            loader: 'css-loader',
            options: {
              sourceMap: true,
              modules: false,
            }
          }
        ]
      },
      {
        test: /^((?!\.global).)*\.css$/,
        use: [
          {
            loader: 'style-loader'
          },
          {
            loader: 'css-loader',
            options: {
              modules: false,
              sourceMap: true,
              importLoaders: 1,
              localIdentName: '[name]__[local]__[hash:base64:5]'
            }
          }
        ]
      },
      // SASS support - compile all .global.scss files and pipe it to style.css
      {
        test: /\.scss$/,
        use: [
          {
            loader: 'style-loader'
          },
          {
            loader: 'css-loader',
            options: {
              sourceMap: true
            }
          },
          {
            loader: 'sass-loader'
          }
        ]
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif|ico|webp)$/i,
        type: 'asset/resource',
      },
      {
        // Inlined rather than emitted beside the bundle. The renderer runs from file://,
        // where @font-face is fetched in CORS mode with a null origin and a sibling file
        // has no Access-Control-Allow-Origin to satisfy it - the faces failed to load
        // while images from the same directory were fine. A data: URL has no origin to
        // check. The only fonts here are two five-kilobyte display faces.
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/inline',
      },
    ]
  },

  plugins: [
    /**
     * Create global constants which can be configured at compile time.
     *
     * Useful for allowing different behaviour between development builds and
     * release builds
     *
     * NODE_ENV should be production so that modules do not perform certain
     * development checks
     *
     * By default, use 'development' as NODE_ENV. This can be overriden with
     * 'staging', for example, by changing the ENV variables in the npm scripts
     */
    new webpack.EnvironmentPlugin({
      NODE_ENV: 'development',
      ELECTRON_OVERRIDE_DIST_PATH:
        path.join(__dirname, '..', '..', 'node_modules', 'electron', 'path.txt')
    }),
    new webpack.LoaderOptionsPlugin({
      debug: true
    }),
    new NodePolyfillPlugin({excludeAliases: ['process']})
  ],

  node: {
    __dirname: false,
    __filename: false
  },
};
