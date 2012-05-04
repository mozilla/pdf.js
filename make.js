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
  target.locale();
  target.extension();
  target.pagesrepo();

  cd(ROOT_DIR);
  echo();
  echo('### Creating web site');

  var GH_PAGES_SRC_FILES = [
    'web/*',
    'external/webL10n/l10n.js'
  ];

  cp(BUILD_TARGET, GH_PAGES_DIR + BUILD_TARGET);
  cp('-R', GH_PAGES_SRC_FILES, GH_PAGES_DIR + '/web');
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
// make locale
// Creates localized resources for the viewer and extension.
//
target.locale = function() {
  var L10N_PATH = 'l10n';
  var METADATA_OUTPUT = 'extensions/firefox/metadata.inc';
  var VIEWER_OUTPUT = 'web/locale.properties';
  var DEFAULT_LOCALE = 'en-US';

  cd(ROOT_DIR);
  echo();
  echo('### Building localization files');

  var subfolders = ls(L10N_PATH);
  subfolders.sort();
  var metadataContent = '';
  var viewerOutput = '';
  for (var i = 0; i < subfolders.length; i++) {
    var locale = subfolders[i];
    var path = L10N_PATH + '/' + locale;
    if (!test('-d', path))
      continue;

    if (!/^[a-z][a-z](-[A-Z][A-Z])?$/.test(locale)) {
      echo('Skipping invalid locale: ' + locale);
      continue;
    }

    if (test('-f', path + '/viewer.properties')) {
      var properties = cat(path + '/viewer.properties');
      if (locale == DEFAULT_LOCALE)
        viewerOutput = '[*]\n' + properties + '\n' + viewerOutput;
      else
        viewerOutput = viewerOutput + '[' + locale + ']\n' + properties + '\n';
    }

    if (test('-f', path + '/metadata.inc')) {
      var metadata = cat(path + '/metadata.inc');
      metadataContent += metadata;
    }
  }
  viewerOutput.to(VIEWER_OUTPUT);
  metadataContent.to(METADATA_OUTPUT);
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
        'api.js',
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
        'bidi.js',
        'metadata.js'];

  if (!test('-d', BUILD_DIR))
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

  if (!test('-d', BUILD_DIR))
    mkdir(BUILD_DIR);

  if (!test('-d', GH_PAGES_DIR)) {
    echo();
    echo('Cloning project repo...');
    echo('(This operation can take a while, depending on network conditions)');
    exec('git clone -b gh-pages --depth=1 ' + REPO + ' ' + GH_PAGES_DIR,
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
      ['web/debugger.js',
       'web/images',
       'web/viewer.css',
       'web/viewer.js',
       'web/viewer.html',
       'external/webL10n/l10n.js',
       'web/locale.properties',
       'web/viewer-production.html'],
    EXTENSION_BASE_VERSION = 'f0f0418a9c6637981fe1182b9212c2d592774c7d',
    EXTENSION_VERSION_PREFIX = '0.3.',
    EXTENSION_BUILD_NUMBER,
    EXTENSION_VERSION;

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

  EXTENSION_VERSION = EXTENSION_VERSION_PREFIX + EXTENSION_BUILD_NUMBER;
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
         '*.png',
         'install.rdf.in',
         'README.mozilla',
         'components',
         '../../LICENSE'];
      FIREFOX_EXTENSION_FILES =
        ['bootstrap.js',
         'install.rdf',
         'icon.png',
         'icon64.png',
         'components',
         'content',
         'LICENSE'];
      FIREFOX_MC_EXTENSION_FILES =
        ['bootstrap.js',
         'icon.png',
         'icon64.png',
         'components',
         'content',
         'LICENSE'];
      FIREFOX_EXTENSION_NAME = 'pdf.js.xpi',
      FIREFOX_AMO_EXTENSION_NAME = 'pdf.js.amo.xpi';

  var LOCALE_CONTENT = cat('web/locale.properties');

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
  sed('-i', /.*PDFJSSCRIPT_LOCALE_DATA.*\n/, LOCALE_CONTENT, 'viewer-snippet-firefox-extension.html');
  sed('-i', /.*PDFJSSCRIPT_REMOVE_CORE.*\n/g, '', 'viewer.html');
  sed('-i', /.*PDFJSSCRIPT_REMOVE_FIREFOX_EXTENSION.*\n/g, '', 'viewer.html');
  sed('-i', /.*PDFJSSCRIPT_INCLUDE_FIREFOX_EXTENSION.*\n/, cat('viewer-snippet-firefox-extension.html'), 'viewer.html');
  cd(ROOT_DIR);

  // We don't need pdf.js anymore since its inlined
  rm('-Rf', FIREFOX_BUILD_CONTENT_DIR + BUILD_DIR);
  rm(FIREFOX_BUILD_CONTENT_DIR + '/web/viewer-snippet-firefox-extension.html');
  rm(FIREFOX_BUILD_CONTENT_DIR + '/web/locale.properties');
  // Remove '.DS_Store' and other hidden files
  find(FIREFOX_BUILD_DIR).forEach(function(file) {
    if (file.match(/^\./))
      rm('-f', file);
  });

  // Update the build version number
  sed('-i', /PDFJSSCRIPT_VERSION/, EXTENSION_VERSION, FIREFOX_BUILD_DIR + '/install.rdf');
  sed('-i', /PDFJSSCRIPT_VERSION/, EXTENSION_VERSION, FIREFOX_BUILD_DIR + '/update.rdf');
  sed('-i', /PDFJSSCRIPT_VERSION/, EXTENSION_VERSION, FIREFOX_BUILD_DIR + '/install.rdf.in');
  sed('-i', /PDFJSSCRIPT_VERSION/, EXTENSION_VERSION, FIREFOX_BUILD_DIR + '/README.mozilla');

  // Update localized metadata
  var localizedMetadata = cat(EXTENSION_SRC_DIR + '/firefox/metadata.inc');
  sed('-i', /.*PDFJS_LOCALIZED_METADATA.*\n/, localizedMetadata, FIREFOX_BUILD_DIR + '/install.rdf');
  sed('-i', /.*PDFJS_LOCALIZED_METADATA.*\n/, localizedMetadata, FIREFOX_BUILD_DIR + '/install.rdf.in');

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

  // List all files for mozilla-central
  cd(FIREFOX_BUILD_DIR);
  var extensionFiles = '';
  find(FIREFOX_MC_EXTENSION_FILES).forEach(function(file){
    if (test('-f', file))
      extensionFiles += file+'\n';
  });
  extensionFiles.to('extension-files');
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
  target.unittest({}, function() {
    target.browsertest();
  });
};

//
// make bottest
// (Special tests for the Github bot)
//
target.bottest = function() {
  target.unittest({}, function() {
    target.browsertest({noreftest: true});
  });
};

//
// make browsertest
//
target.browsertest = function(options) {
  cd(ROOT_DIR);
  echo();
  echo('### Running browser tests');

  var PDF_TEST = env['PDF_TEST'] || 'test_manifest.json',
      PDF_BROWSERS = env['PDF_BROWSERS'] || 'resources/browser_manifests/browser_manifest.json';

  if (!test('-f', 'test/' + PDF_BROWSERS)) {
    echo('Browser manifest file test/' + PDF_BROWSERS + ' does not exist.');
    echo('Try copying one of the examples in test/resources/browser_manifests/');
    exit(1);
  }

  var reftest = (options && options.noreftest) ? '' : '--reftest';

  cd('test');
  exec(PYTHON_BIN + ' -u test.py '+reftest+' --browserManifestFile=' + PDF_BROWSERS +
    ' --manifestFile=' + PDF_TEST, {async: true});
};

//
// make unittest
//
target.unittest = function(options, callback) {
  cd(ROOT_DIR);
  echo();
  echo('### Running unit tests');

  var PDF_BROWSERS = env['PDF_BROWSERS'] || 'resources/browser_manifests/browser_manifest.json';

  if (!test('-f', 'test/' + PDF_BROWSERS)) {
    echo('Browser manifest file test/' + PDF_BROWSERS + ' does not exist.');
    echo('Try copying one of the examples in test/resources/browser_manifests/');
    exit(1);
  }
  callback = callback || function() {};
  cd('test');
  exec(PYTHON_BIN + ' -u test.py --unitTest --browserManifestFile=' + PDF_BROWSERS,
    {async: true}, callback);
};

//
// make botmakeref
//
target.botmakeref = function() {
  cd(ROOT_DIR);
  echo();
  echo('### Creating reference images');

  var PDF_TEST = env['PDF_TEST'] || 'test_manifest.json',
      PDF_BROWSERS = env['PDF_BROWSERS'] || 'resources/browser_manifests/browser_manifest.json';

  if (!test('-f', 'test/' + PDF_BROWSERS)) {
    echo('Browser manifest file test/' + PDF_BROWSERS + ' does not exist.');
    echo('Try copying one of the examples in test/resources/browser_manifests/');
    exit(1);
  }

  cd('test');
  exec(PYTHON_BIN + ' -u test.py --masterMode --noPrompts --browserManifestFile=' + PDF_BROWSERS,
    {async: true});
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
