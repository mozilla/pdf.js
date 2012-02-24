#!/usr/bin/env node
require('./maker');

var ROOT_DIR = pwd(),
    BUILD_DIR = ROOT_DIR + '/build',
    BUILD_TARGET = BUILD_DIR + '/pdf.js';

//
// make all
//
target.all = function() {
  echo('Available make targets:');
  for (t in target)
    if (t !== 'all') echo('  ' + t);
}

//
// make bundle
// Bundles all source files into one wrapper 'pdf.js' file, in the given order.
//
target.bundle = function() {
  cd(ROOT_DIR);
  echo('###');
  echo('### Bundling files into pdf.js...');
  echo('###');

  cd('src');
  if (!exists('build'))
    mkdir('build');

  // File order matters, so we list them manually
  var files = 'core.js util.js canvas.js obj.js function.js charsets.js cidmaps.js \
               colorspace.js crypto.js evaluator.js fonts.js glyphlist.js image.js metrics.js \
               parser.js pattern.js stream.js worker.js ../external/jpgjs/jpg.js jpx.js bidi.js',
      bundle = cat(files),
      git = external('git', {required:true}),
      bundleVersion = git('log --format="%h" -n 1', {silent:true}).output.replace('\n', '');

  sed('PDFJSSCRIPT_INCLUDE_ALL', bundle, 'pdf.js').to(BUILD_TARGET);
  sed('PDFJSSCRIPT_BUNDLE_VER', bundleVersion, BUILD_TARGET).to(BUILD_TARGET);
}

//
// make server
//
target.server = function() {
  cd(ROOT_DIR);
  echo('###');
  echo('### Starting local server');
  echo('###');

  var python = external('python2.7', {required:true});
  cd('test');
  python('-u test.py --port=8888', {async:true});
}

//
// make test
//
target.test = function() {
  target.browsertest();
  target.unittest();
}

//
// make browsertest
//
target.browsertest = function() {
  cd(ROOT_DIR);
  echo('###');
  echo('### Running browser tests');
  echo('###');

  var PDF_TEST = env['PDF_TEST'] || 'test_manifest.json',
      PDF_BROWSERS = env['PDF_BROWSERS'] || 'resources/browser_manifests/browser_manifest.json',
      python = external('python2.7', {required:true});

  if (!exists('test/'+PDF_BROWSERS)) {
    echo('Browser manifest file test/'+PDF_BROWSERS+' does not exist.');
    echo('Try copying one of the examples in test/resources/browser_manifests/');
    exit(1);
  }

  cd('test');
  python('test.py --reftest --browserManifestFile='+PDF_BROWSERS+' --manifestFile='+PDF_TEST, {async:true});
}

//
// make unittest
//
target.unittest = function() {
}
