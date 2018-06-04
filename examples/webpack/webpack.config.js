var webpack = require('webpack');
var path = require('path');

module.exports = {
  context: __dirname,
  entry: {
    'main': './main.js',
    'pdf.worker': 'pdfjs-dist/build/pdf.worker.entry'
  },
  mode: 'none',
  output: {
    path: path.join(__dirname, '../../build/webpack'),
    publicPath: '../../build/webpack/',
    filename: '[name].bundle.js'
  }
};
