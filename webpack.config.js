const path = require('path');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');

var bundleDefines = {
  PRODUCTION: true,
  // The main build targets:
  GENERIC: false,
  FIREFOX: false,
  MOZCENTRAL: false,
  CHROME: false,
  MINIFIED: false,
  SINGLE_FILE: false,
  COMPONENTS: false,
  LIB: false,
  PDFJS_NEXT: false,
};

module.exports = {
  entry: './web/pdf_page_view.component.js',
  output: {
    filename: 'test_page.bundle.js'
  },
  resolve: {
    alias: {
      'pdfjs': path.join(__dirname, 'src'),
      'pdfjs-web': path.join(__dirname, 'web'),
      'pdfjs-lib': path.join(__dirname, 'web/pdfjs'),
    },
  },
  devtool: 'source-map',
  module: {
    loaders: [
      {
        loader: 'babel-loader',
        exclude: /src\/core\/(glyphlist|unicode)/, // babel is too slow
        options: {
          presets: ['env'],
          plugins: ['transform-es2015-modules-commonjs'],
        },
      },
      {
        loader: path.join(__dirname, 'external/webpack/pdfjsdev-loader.js'),
        options: {
          rootPath: __dirname,
          saveComments: false,
          defines: bundleDefines,
        },
      },
    ],
  },
  plugins: [
    new UglifyJSPlugin({
      sourceMap: true,
      parallel: true,
      extractComments: true,
      uglifyOptions: {
        output: {
          comments: false,
          beautify: false,
        },
        // V8 chokes on very long sequences. Works around that.
        compress: {
          sequences: false
        }
      }
    }),
  ],
  // Avoid shadowing actual Node.js variables with polyfills, by disabling
  // polyfills/mocks - https://webpack.js.org/configuration/node/
  node: false,
};
