#!/usr/bin/env node
require('./maker');

var ROOT_DIR = pwd(); // current absolute path

//
// make all
//
target.all = function() {
  echo('Please specify a target. Available targets:');
  for (t in target)
    if (t !== 'all') echo('  ' + t);
}



///////////////////////////////////////////////////////////////////////////////////////////
//
// Production stuff
//

var BUILD_DIR = ROOT_DIR + '/build',
    BUILD_TARGET = BUILD_DIR + '/pdf.js';

//
// make web
// Generates the website for the project, by checking out the gh-pages branch underneath 
// the build directory, and then moving the various viewer files into place.
//
target.web = function() {
  target.production();
  target.extension();
  target.pagesrepo();
}

//
// make production
// Creates production output (pdf.js, and corresponding changes to web files)
//
target.production = function() {
  target.bundle();
  target.viewer();
}

//
// make bundle
// Bundles all source files into one wrapper 'pdf.js' file, in the given order.
//

target.bundle = function() {
  // File order matters
  var SRC_FILES = 
        'core.js \
         util.js \
         canvas.js \
         obj.js \
         function.js \
         charsets.js \
         cidmaps.js \
         colorspace.js \
         crypto.js \
         evaluator.js \
         fonts.js \
         glyphlist.js \
         image.js \
         metrics.js \
         parser.js \
         pattern.js \
         stream.js \
         worker.js \
         ../external/jpgjs/jpg.js \
         jpx.js \
         bidi.js';

  cd(ROOT_DIR);
  echo();
  echo('###');
  echo('### Bundling files into pdf.js');
  echo('###');

  if (!exists('build'))
    mkdir('build');

  cd('src');
  var bundle = cat(SRC_FILES),
      git = external('git', {required:true}),
      bundleVersion = git('log --format="%h" -n 1', {silent:true}).output.replace('\n', '');

  sed(/.*PDFJSSCRIPT_INCLUDE_ALL.*\n/, bundle, 'pdf.js').to(BUILD_TARGET);
  sed('PDFJSSCRIPT_BUNDLE_VER', bundleVersion, BUILD_TARGET, {inplace:true});
}

//
// make viewer
// Changes development <script> tags in our web viewer to use only 'pdf.js'.
// Produces 'viewer-production.html'
//
target.viewer = function() {
  cd(ROOT_DIR);
  echo();
  echo('###');
  echo('### Generating production viewer');
  echo('###');

  cd('web');
  // Remove development lines
  sed(/.*PDFJSSCRIPT_REMOVE_CORE.*\n/g, '', 'viewer.html').to('viewer-production.html');
  // Introduce snippet
  sed(/.*PDFJSSCRIPT_INCLUDE_BUILD.*\n/g, cat('viewer-snippet.html'), 'viewer-production.html', {inplace:true});
}



///////////////////////////////////////////////////////////////////////////////////////////
//
// Extension stuff
//

var EXTENSION_WEB_FILES =
      'web/images \
       web/viewer.css \
       web/viewer.js \
       web/viewer.html \
       web/viewer-production.html',
    EXTENSION_SRC = ROOT_DIR+'/extensions',
    EXTENSION_BASE_VERSION = '4bb289ec499013de66eb421737a4dbb4a9273eda',
    EXTENSION_BUILD_NUMBER = '';

//
// make extension
//
target.extension = function() {
  var git = external('git', {required:true, silent:true});

  // Build number is the number of commits since base version
  EXTENSION_BUILD_NUMBER = git('log --format=oneline '+EXTENSION_BASE_VERSION+'..')
    .output.match(/\n/g).length; // get # of lines in git output

  target.production();
  target.firefox();
  target.chrome();
}

//
// make firefox
//
target.firefox = function() {
  var FIREFOX_BUILD_DIR = BUILD_DIR+'/firefox',
      FIREFOX_BUILD_CONTENT = FIREFOX_BUILD_DIR+'/content',
      FIREFOX_CONTENT_DIR = EXTENSION_SRC+'/firefox/content',
      FIREFOX_EXTENSION_FILES_TO_COPY =
        '*.js \
        *.rdf \
        components',
      FIREFOX_EXTENSION_FILES =
        'content \
        *.js \
        install.rdf \
        components \
        content',
      FIREFOX_EXTENSION_NAME = 'pdf.js.xpi',
      FIREFOX_AMO_EXTENSION_NAME = 'pdf.js.amo.xpi',
      zip = external('zip', {required:true});

  target.production();

  cd(ROOT_DIR);
  echo();
  echo('###');
  echo('### Building Firefox extension');
  echo('###');

  // Clear out everything in the firefox extension build directory
  rm('-rf '+FIREFOX_BUILD_DIR);
  mkdir('-p '+FIREFOX_BUILD_CONTENT);
  mkdir('-p '+FIREFOX_BUILD_CONTENT+'/build');
  mkdir('-p '+FIREFOX_BUILD_CONTENT+'/web');
  
  // Copy extension files  
  cd('extensions/firefox');
  cp('-R '+FIREFOX_EXTENSION_FILES_TO_COPY+' '+FIREFOX_BUILD_DIR);
  cd('../..');

  // Copy a standalone version of pdf.js inside the content directory
  cp(BUILD_TARGET+' '+FIREFOX_BUILD_CONTENT+'/build');
  cp('-R '+EXTENSION_WEB_FILES+' '+FIREFOX_BUILD_CONTENT+'/web');
  rm(FIREFOX_BUILD_CONTENT+'/web/viewer-production.html');

  // Copy over the firefox extension snippet so we can inline pdf.js in it
  cp('web/viewer-snippet-firefox-extension.html '+FIREFOX_BUILD_CONTENT+'/web');

  // Modify the viewer so it does all the extension only stuff.
  cd(FIREFOX_BUILD_CONTENT+'/web');
  sed(/.*PDFJSSCRIPT_INCLUDE_BUNDLE.*\n/, cat('../build/pdf.js'), 'viewer-snippet-firefox-extension.html', {inplace:true});
  sed(/.*PDFJSSCRIPT_REMOVE_CORE.*\n/g, '', 'viewer.html', {inplace:true});
  sed(/.*PDFJSSCRIPT_REMOVE_FIREFOX_EXTENSION.*\n/g, '', 'viewer.html', {inplace:true});
  sed(/.*PDFJSSCRIPT_INCLUDE_FIREFOX_EXTENSION.*\n/, cat('viewer-snippet-firefox-extension.html'), 'viewer.html', {inplace:true});

  // We don't need pdf.js anymore since its inlined
  rm('-Rf '+FIREFOX_BUILD_CONTENT+'/build');

  // Update the build version number
  sed(/PDFJSSCRIPT_BUILD/, EXTENSION_BUILD_NUMBER, FIREFOX_BUILD_DIR+'/install.rdf');
  sed(/PDFJSSCRIPT_BUILD/, EXTENSION_BUILD_NUMBER, FIREFOX_BUILD_DIR+'/update.rdf');

  // Create the xpi
  cd(FIREFOX_BUILD_DIR);
  zip('-r '+FIREFOX_EXTENSION_NAME+' '+FIREFOX_EXTENSION_FILES);
  cd(ROOT_DIR);
  echo('extension created: ' + FIREFOX_EXTENSION_NAME);

  // Build the amo extension too (remove the updateUrl)
  sed(/.*updateURL.*\n/, '', FIREFOX_BUILD_DIR+'/install.rdf', {inplace:true});
  cd(FIREFOX_BUILD_DIR);
  zip('-r '+FIREFOX_AMO_EXTENSION_NAME+' '+FIREFOX_EXTENSION_FILES);
  cd(ROOT_DIR);
  echo('AMO extension created: ' + FIREFOX_AMO_EXTENSION_NAME);
}

//
// make chrome
//
target.chrome = function() {
  target.production();

  cd(ROOT_DIR);
  echo();
  echo('###');
  echo('### Building Chrome extension');
  echo('###');
}


///////////////////////////////////////////////////////////////////////////////////////////
//
// Test stuff
//

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
  echo();
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
  cd(ROOT_DIR);
  echo();
  echo('###');
  echo('### Running unit tests');
  echo('###');

  var make = external('make', {required:true});
  cd('test/unit');
  make({async:true});
}




///////////////////////////////////////////////////////////////////////////////////////////
//
// Other
//

//
// make server
//
target.server = function() {
  cd(ROOT_DIR);
  echo();
  echo('###');
  echo('### Starting local server');
  echo('###');

  var python = external('python2.7', {required:true});
  cd('test');
  python('-u test.py --port=8888', {async:true});
}

//
// make lint
//
target.lint = function() {
  cd(ROOT_DIR);
  echo();
  echo('###');
  echo('### Linting JS files');
  echo('###');

  var LINT_FILES = 'src/*.js web/*.js test/*.js test/unit/*.js extensions/firefox/*.js extensions/firefox/components/*.js extensions/chrome/*.js',
      gjslint = external('gjslint', {required:true});

  // Lint all files in parallel (speedup factor = #CPUs)
  for (file in ls(LINT_FILES)) {
    gjslint('--nojsdoc '+file, {async:true, silent:true}, function(output, code) {
      if (code !== 0)
        echo(output);
    });
  }
}
