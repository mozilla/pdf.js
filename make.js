#!/usr/bin/env node
require('./maker');

var node = external('node', {required:true});
var ROOT = pwd();

//
// 'all'
// Default is to bundle code into 'pdf.js'
//
target.all = function() {
  target.bundle();
}

//
// 'bundle'
// Bundles all source files into one 'pdf.js' file
//
target.bundle = function() {
  echo('>>> Bundling files into pdf.js...');
  cd(ROOT + '/src');

  // File order matters, so we list them manually
  var files = 'core.js util.js canvas.js obj.js function.js charsets.js cidmaps.js \
               colorspace.js crypto.js evaluator.js fonts.js glyphlist.js image.js metrics.js \
               parser.js pattern.js stream.js worker.js ../external/jpgjs/jpg.js jpx.js';

  var bundle = cat(files);

  console.log(bundle);
}
