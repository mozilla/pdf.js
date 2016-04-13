var webpack = require('webpack');
var path = require('path');

module.exports = {
  context: __dirname,
  entry: {
    'main': './main.js',
    'pdf.worker': 'pdfjs-dist/build/pdf.worker.entry'
  },
  output: {
    path: path.join(__dirname, '../../build/webpack'),
    publicPath: '../../build/webpack/',
    filename: '[name].bundle.js'
  },
  plugins: [
    new webpack.optimize.UglifyJsPlugin({
      compressor: {
        screw_ie8: true,
        warnings: false
      }
    })
  ]
};
