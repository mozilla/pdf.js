#!/usr/bin/env node
require('./external/shelljs/make');

var ROOT_DIR = __dirname + '/', // absolute path to project's root
    BUILD_DIR = 'build/',
    BUILD_TARGET = BUILD_DIR + 'pdf.js',
    FIREFOX_BUILD_DIR = BUILD_DIR + '/firefox/',
    EXTENSION_SRC_DIR = 'extensions/',
    GH_PAGES_DIR = BUILD_DIR + 'gh-pages/',
    REPO = 'git@github.com:mozilla/pdf.js.git',
    PYTHON_BIN = 'python2.7';

//
// make all
//
target.all = function() {
  // Don't do anything by default
  echo('Please specify a target. Available targets:');
  for (t in target)
    if (t !== 'all') echo('  ' + t);
};


///////////////////////////////////////////////////////////////////////////////////////////
//
// Production stuff
//

//
// make web
// Generates the website for the project, by checking out the gh-pages branch underneath
// the build directory, and then moving the various viewer files into place.
//
target.web = function() {
  target.production();
  target.extension();
  target.pagesrepo();

  cd(ROOT_DIR);
  echo();
  echo('### Creating web site');

  cp(BUILD_TARGET, GH_PAGES_DIR + BUILD_TARGET);
  cp('-R', 'web/*', GH_PAGES_DIR + '/web');
  cp(FIREFOX_BUILD_DIR + '/*.xpi', FIREFOX_BUILD_DIR + '/*.rdf',
    GH_PAGES_DIR + EXTENSION_SRC_DIR + 'firefox/');
  cp(GH_PAGES_DIR + '/web/index.html.template', GH_PAGES_DIR + '/index.html');
  mv('-f', GH_PAGES_DIR + '/web/viewer-production.html',
    GH_PAGES_DIR + '/web/viewer.html');
  cd(GH_PAGES_DIR);
  exec('git add -A');

  echo();
  echo("Website built in " + GH_PAGES_DIR);
  echo("Don't forget to cd into " + GH_PAGES_DIR +
    " and issue 'git commit' to push changes.");
};

//
// make production
// Creates production output (pdf.js, and corresponding changes to web/ files)
//
target.production = function() {
  target.bundle();
  target.viewer();
};

//
// make bundle
// Bundles all source files into one wrapper 'pdf.js' file, in the given order.
//

target.bundle = function() {
  cd(ROOT_DIR);
  echo();
  echo('### Bundling files into ' + BUILD_TARGET);

  // File order matters
  var SRC_FILES =
       ['core.js',
        'util.js',
        'canvas.js',
        'obj.js',
        'function.js',
        'charsets.js',
        'cidmaps.js',
        'colorspace.js',
        'crypto.js',
        'evaluator.js',
        'fonts.js',
        'glyphlist.js',
        'image.js',
        'metrics.js',
        'parser.js',
        'pattern.js',
        'stream.js',
        'worker.js',
        '../external/jpgjs/jpg.js',
        'jpx.js',
        'bidi.js'];

  if (!exists(BUILD_DIR))
    mkdir(BUILD_DIR);

  cd('src');
  var bundle = cat(SRC_FILES),
      bundleVersion = exec('git log --format="%h" -n 1',
        {silent: true}).output.replace('\n', '');

  sed(/.*PDFJSSCRIPT_INCLUDE_ALL.*\n/, bundle, 'pdf.js')
    .to(ROOT_DIR + BUILD_TARGET);
  sed('-i', 'PDFJSSCRIPT_BUNDLE_VER', bundleVersion, ROOT_DIR + BUILD_TARGET);
};

//
// make viewer
// Changes development <script> tags in our web viewer to use only 'pdf.js'.
// Produces 'viewer-production.html'
//
target.viewer = function() {
  cd(ROOT_DIR);
  echo();
  echo('### Generating production-level viewer');

  cd('web');
  // Remove development lines
  sed(/.*PDFJSSCRIPT_REMOVE_CORE.*\n/g, '', 'viewer.html')
    .to('viewer-production.html');
  // Introduce snippet
  sed('-i', /.*PDFJSSCRIPT_INCLUDE_BUILD.*\n/g, cat('viewer-snippet.html'),
    'viewer-production.html');
};

//
// make pagesrepo
//
// This target clones the gh-pages repo into the build directory. It deletes the current contents
// of the repo, since we overwrite everything with data from the master repo. The 'make web' target
// then uses 'git add -A' to track additions, modifications, moves, and deletions.
target.pagesrepo = function() {
  cd(ROOT_DIR);
  echo();
  echo('### Creating fresh clone of gh-pages');

  if (!exists(BUILD_DIR))
    mkdir(BUILD_DIR);

  if (!exists(GH_PAGES_DIR)) {
    echo();
    echo('Cloning project repo...');
    echo('(This operation can take a while, depending on network conditions)');
    exec('git clone -b gh-pages --depth=1 ' + REPO + ' ' + ßGH_PAGES_DIR,
      {silent: true});
    echo('Done.');
  }

  rm('-rf', GH_PAGES_DIR + '/*');
  mkdir('-p', GH_PAGES_DIR + '/web');
  mkdir('-p', GH_PAGES_DIR + '/web/images');
  mkdir('-p', GH_PAGES_DIR + BUILD_DIR);
  mkdir('-p', GH_PAGES_DIR + EXTENSION_SRC_DIR + '/firefox');
};


///////////////////////////////////////////////////////////////////////////////////////////
//
// Extension stuff
//

var EXTENSION_WEB_FILES =
      ['web/images',
       'web/viewer.css',
       'web/viewer.js',
       'web/viewer.html',
       'web/viewer-production.html'],
    EXTENSION_BASE_VERSION = '4bb289ec499013de66eb421737a4dbb4a9273eda',
    EXTENSION_BUILD_NUMBER;

//
// make extension
//
target.extension = function() {
  cd(ROOT_DIR);
  echo();
  echo('### Building extensions');

  target.production();
  target.firefox();
  target.chrome();
};

target.buildnumber = function() {
  cd(ROOT_DIR);
  echo();
  echo('### Getting extension build number');

  // Build number is the number of commits since base version
  EXTENSION_BUILD_NUMBER = exec('git log --format=oneline ' +
    EXTENSION_BASE_VERSION + '..', {silent: true})
    .output.match(/\n/g).length; // get # of lines in git output

  echo('Extension build number: ' + EXTENSION_BUILD_NUMBER);
};

//
// make firefox
//
target.firefox = function() {
  cd(ROOT_DIR);
  echo();
  echo('### Building Firefox extension');

  var FIREFOX_BUILD_CONTENT_DIR = FIREFOX_BUILD_DIR + '/content/',
      FIREFOX_CONTENT_DIR = EXTENSION_SRC_DIR + '/firefox/content/',
      FIREFOX_EXTENSION_FILES_TO_COPY =
        ['*.js',
         '*.rdf',
         'components'];
      FIREFOX_EXTENSION_FILES =
        ['content',
         '*.js',
         'install.rdf',
         'components',
         'content'];
      FIREFOX_EXTENSION_NAME = 'pdf.js.xpi',
      FIREFOX_AMO_EXTENSION_NAME = 'pdf.js.amo.xpi';

  target.production();
  target.buildnumber();
  cd(ROOT_DIR);

  // Clear out everything in the firefox extension build directory
  rm('-rf', FIREFOX_BUILD_DIR);
  mkdir('-p', FIREFOX_BUILD_CONTENT_DIR);
  mkdir('-p', FIREFOX_BUILD_CONTENT_DIR + BUILD_DIR);
  mkdir('-p', FIREFOX_BUILD_CONTENT_DIR + '/web');

  // Copy extension files
  cd('extensions/firefox');
  cp('-R', FIREFOX_EXTENSION_FILES_TO_COPY, ROOT_DIR + FIREFOX_BUILD_DIR);
  cd(ROOT_DIR);

  // Copy a standalone version of pdf.js inside the content directory
  cp(BUILD_TARGET, FIREFOX_BUILD_CONTENT_DIR + BUILD_DIR);
  cp('-R', EXTENSION_WEB_FILES, FIREFOX_BUILD_CONTENT_DIR + '/web');
  rm(FIREFOX_BUILD_CONTENT_DIR + '/web/viewer-production.html');

  // Copy over the firefox extension snippet so we can inline pdf.js in it
  cp('web/viewer-snippet-firefox-extension.html', FIREFOX_BUILD_CONTENT_DIR + '/web');

  // Modify the viewer so it does all the extension-only stuff.
  cd(FIREFOX_BUILD_CONTENT_DIR + '/web');
  sed('-i', /.*PDFJSSCRIPT_INCLUDE_BUNDLE.*\n/, cat(ROOT_DIR + BUILD_TARGET), 'viewer-snippet-firefox-extension.html');
  sed('-i', /.*PDFJSSCRIPT_REMOVE_CORE.*\n/g, '', 'viewer.html');
  sed('-i', /.*PDFJSSCRIPT_REMOVE_FIREFOX_EXTENSION.*\n/g, '', 'viewer.html');
  sed('-i', /.*PDFJSSCRIPT_INCLUDE_FIREFOX_EXTENSION.*\n/, cat('viewer-snippet-firefox-extension.html'), 'viewer.html');
  cd(ROOT_DIR);

  // We don't need pdf.js anymore since its inlined
  rm('-Rf', FIREFOX_BUILD_CONTENT_DIR + BUILD_DIR);

  // Update the build version number
  sed('-i', /PDFJSSCRIPT_BUILD/, EXTENSION_BUILD_NUMBER, FIREFOX_BUILD_DIR + '/install.rdf');
  sed('-i', /PDFJSSCRIPT_BUILD/, EXTENSION_BUILD_NUMBER, FIREFOX_BUILD_DIR + '/update.rdf');

  // Create the xpi
  cd(FIREFOX_BUILD_DIR);
  exec('zip -r ' + FIREFOX_EXTENSION_NAME + ' ' + FIREFOX_EXTENSION_FILES.join(' '));
  echo('extension created: ' + FIREFOX_EXTENSION_NAME);
  cd(ROOT_DIR);

  // Build the amo extension too (remove the updateUrl)
  cd(FIREFOX_BUILD_DIR);
  sed('-i', /.*updateURL.*\n/, '', 'install.rdf');
  exec('zip -r ' + FIREFOX_AMO_EXTENSION_NAME + ' ' + FIREFOX_EXTENSION_FILES.join(' '));
  echo('AMO extension created: ' + FIREFOX_AMO_EXTENSION_NAME);
  cd(ROOT_DIR);
};

//
// make chrome
//
target.chrome = function() {
  cd(ROOT_DIR);
  echo();
  echo('### Building Chrome extension');

  var CHROME_BUILD_DIR = BUILD_DIR + '/chrome/',
      CHROME_CONTENT_DIR = EXTENSION_SRC_DIR + '/chrome/content/',
      CHROME_BUILD_CONTENT_DIR = CHROME_BUILD_DIR + '/content/',
      CHROME_EXTENSION_FILES =
        ['extensions/chrome/*.json',
         'extensions/chrome/*.html'];

  target.production();
  target.buildnumber();
  cd(ROOT_DIR);

  // Clear out everything in the chrome extension build directory
  rm('-Rf', CHROME_BUILD_DIR);
  mkdir('-p', CHROME_BUILD_CONTENT_DIR);
  mkdir('-p', CHROME_BUILD_CONTENT_DIR + BUILD_DIR);
  mkdir('-p', CHROME_BUILD_CONTENT_DIR + '/web');

  // Copy extension files
  cp('-R', CHROME_EXTENSION_FILES, CHROME_BUILD_DIR);

  // Copy a standalone version of pdf.js inside the content directory
  cp(BUILD_TARGET, CHROME_BUILD_CONTENT_DIR + BUILD_DIR);
  cp('-R', EXTENSION_WEB_FILES, CHROME_BUILD_CONTENT_DIR + '/web');
  mv('-f', CHROME_BUILD_CONTENT_DIR + '/web/viewer-production.html',
    CHROME_BUILD_CONTENT_DIR + '/web/viewer.html');
};


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
};

//
// make browsertest
//
target.browsertest = function() {
  cd(ROOT_DIR);
  echo();
  echo('### Running browser tests');

  var PDF_TEST = env['PDF_TEST'] || 'test_manifest.json',
      PDF_BROWSERS = env['PDF_BROWSERS'] || 'resources/browser_manifests/browser_manifest.json';

  if (!exists('test/' + PDF_BROWSERS)) {
    echo('Browser manifest file test/' + PDF_BROWSERS + ' does not exist.');
    echo('Try copying one of the examples in test/resources/browser_manifests/');
    exit(1);
  }

  cd('test');
  exec(PYTHON_BIN + ' test.py --reftest --browserManifestFile=' + PDF_BROWSERS +
    ' --manifestFile=' + PDF_TEST, {async: true});
};

//
// make unittest
//
target.unittest = function() {
  cd(ROOT_DIR);
  echo();
  echo('### Running unit tests');

  cd('test/unit');
  exec('make', {async: true});
};


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
  echo('### Starting local server');

  cd('test');
  exec(PYTHON_BIN + ' -u test.py --port=8888', {async: true});
};

//
// make lint
//
target.lint = function() {
  cd(ROOT_DIR);
  echo();
  echo('### Linting JS files (this can take a while!)');

  var LINT_FILES = 'src/*.js \
                    web/*.js \
                    test/*.js \
                    test/unit/*.js \
                    extensions/firefox/*.js \
                    extensions/firefox/components/*.js \
                    extensions/chrome/*.js';

  exec('gjslint --nojsdoc ' + LINT_FILES);
};

//
// make clean
//
target.clean = function() {
  cd(ROOT_DIR);
  echo();
  echo('### Cleaning up project builds');

  rm('-rf', BUILD_DIR);
};
