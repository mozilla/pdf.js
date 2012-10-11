/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

require('./external/shelljs/make');
var builder = require('./external/builder/builder.js');
var crlfchecker = require('./external/crlfchecker/crlfchecker.js');

var ROOT_DIR = __dirname + '/', // absolute path to project's root
    BUILD_DIR = 'build/',
    BUILD_TARGET = BUILD_DIR + 'pdf.js',
    FIREFOX_BUILD_DIR = BUILD_DIR + '/firefox/',
    CHROME_BUILD_DIR = BUILD_DIR + '/chrome/',
    EXTENSION_SRC_DIR = 'extensions/',
    LOCALE_SRC_DIR = 'l10n/',
    GH_PAGES_DIR = BUILD_DIR + 'gh-pages/',
    GENERIC_DIR = BUILD_DIR + 'generic/',
    REPO = 'git@github.com:mozilla/pdf.js.git',
    PYTHON_BIN = 'python2.7',
    MOZCENTRAL_PREF_PREFIX = 'pdfjs',
    FIREFOX_PREF_PREFIX = 'extensions.uriloader@pdf.js',
    MOZCENTRAL_STREAM_CONVERTER_ID = 'd0c5195d-e798-49d4-b1d3-9324328b2291',
    FIREFOX_STREAM_CONVERTER_ID = '6457a96b-2d68-439a-bcfa-44465fbcdbb1';

var DEFINES = {
  PRODUCTION: true,
  // The main build targets:
  GENERIC: false,
  FIREFOX: false,
  MOZCENTRAL: false,
  B2G: false,
  CHROME: false
};

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

// Files that need to be included in every build.
var COMMON_WEB_FILES =
      ['web/viewer.css',
       'web/images',
       'web/debugger.js'],
    COMMON_WEB_FILES_PREPROCESS =
      ['web/viewer.js',
       'web/viewer.html'];

//
// make generic
// Builds the generic production viewer that should be compatible with most
// modern HTML5 browsers.
//
target.generic = function() {
  target.bundle();
  target.locale();

  cd(ROOT_DIR);
  echo();
  echo('### Creating generic viewer');

  rm('-rf', GENERIC_DIR);
  mkdir('-p', GENERIC_DIR);
  mkdir('-p', GENERIC_DIR + BUILD_DIR);
  mkdir('-p', GENERIC_DIR + '/web');

  var defines = builder.merge(DEFINES, {GENERIC: true});

  var setup = {
    defines: defines,
    copy: [
      [COMMON_WEB_FILES, GENERIC_DIR + '/web'],
      ['external/webL10n/l10n.js', GENERIC_DIR + '/web'],
      ['web/compatibility.js', GENERIC_DIR + '/web'],
      ['web/compressed.tracemonkey-pldi-09.pdf', GENERIC_DIR + '/web'],
      ['web/locale.properties', GENERIC_DIR + '/web']
    ],
    preprocess: [
      [BUILD_TARGET, GENERIC_DIR + BUILD_TARGET],
      [COMMON_WEB_FILES_PREPROCESS, GENERIC_DIR + '/web']
    ]
  };
  builder.build(setup);
};

//
// make web
// Generates the website for the project, by checking out the gh-pages branch
// underneath the build directory, and then moving the various viewer files
// into place.
//
target.web = function() {
  target.generic();
  target.extension();

  echo();
  echo('### Creating web site');

  if (test('-d', GH_PAGES_DIR))
    rm('-rf', GH_PAGES_DIR);

  mkdir('-p', GH_PAGES_DIR + '/web');
  mkdir('-p', GH_PAGES_DIR + '/web/images');
  mkdir('-p', GH_PAGES_DIR + BUILD_DIR);
  mkdir('-p', GH_PAGES_DIR + EXTENSION_SRC_DIR + '/firefox');
  mkdir('-p', GH_PAGES_DIR + EXTENSION_SRC_DIR + '/chrome');

  cp('-R', GENERIC_DIR + '/*', GH_PAGES_DIR);
  cp(FIREFOX_BUILD_DIR + '/*.xpi', FIREFOX_BUILD_DIR + '/*.rdf',
     GH_PAGES_DIR + EXTENSION_SRC_DIR + 'firefox/');
  cp(CHROME_BUILD_DIR + '/*.crx', FIREFOX_BUILD_DIR + '/*.rdf',
     GH_PAGES_DIR + EXTENSION_SRC_DIR + 'chrome/');
  cp('web/index.html.template', GH_PAGES_DIR + '/index.html');

  cd(GH_PAGES_DIR);
  exec('git init');
  exec('git remote add origin ' + REPO);
  exec('git add -A');
  exec('git commit -am "gh-pages site created via make.js script"');
  exec('git branch -m gh-pages');

  echo();
  echo('Website built in ' + GH_PAGES_DIR);
};

//
// make locale
// Creates localized resources for the viewer and extension.
//
target.locale = function() {
  var METADATA_OUTPUT = 'extensions/firefox/metadata.inc';
  var CHROME_MANIFEST_OUTPUT = 'extensions/firefox/chrome.manifest.inc';
  var EXTENSION_LOCALE_OUTPUT = 'extensions/firefox/locale';
  var VIEWER_OUTPUT = 'web/locale.properties';

  cd(ROOT_DIR);
  echo();
  echo('### Building localization files');

  rm('-rf', EXTENSION_LOCALE_OUTPUT);
  mkdir('-p', EXTENSION_LOCALE_OUTPUT);

  var subfolders = ls(LOCALE_SRC_DIR);
  subfolders.sort();
  var metadataContent = '';
  var chromeManifestContent = '';
  var viewerOutput = '';
  for (var i = 0; i < subfolders.length; i++) {
    var locale = subfolders[i];
    var path = LOCALE_SRC_DIR + locale;
    if (!test('-d', path))
      continue;

    if (!/^[a-z][a-z](-[A-Z][A-Z])?$/.test(locale)) {
      echo('Skipping invalid locale: ' + locale);
      continue;
    }

    mkdir('-p', EXTENSION_LOCALE_OUTPUT + '/' + locale);
    chromeManifestContent += 'locale  pdf.js  ' + locale + '  locale/' +
                             locale + '/\n';

    if (test('-f', path + '/viewer.properties')) {
      var properties = cat(path + '/viewer.properties');
      viewerOutput += '[' + locale + ']\n' + properties + '\n';
      cp(path + '/viewer.properties', EXTENSION_LOCALE_OUTPUT + '/' + locale);
    }

    if (test('-f', path + '/chrome.properties')) {
      cp(path + '/chrome.properties', EXTENSION_LOCALE_OUTPUT + '/' + locale);
    }

    if (test('-f', path + '/metadata.inc')) {
      var metadata = cat(path + '/metadata.inc');
      metadataContent += metadata;
    }
  }
  viewerOutput.to(VIEWER_OUTPUT);
  metadataContent.to(METADATA_OUTPUT);
  chromeManifestContent.to(CHROME_MANIFEST_OUTPUT);
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
        'jpx.js',
        'jbig2.js',
        'bidi.js',
        'metadata.js'];

  var EXT_SRC_FILES = [
        '../external/jpgjs/jpg.js'];

  if (!test('-d', BUILD_DIR))
    mkdir(BUILD_DIR);

  cd('src');
  var bundle = cat(SRC_FILES),
      bundleVersion = exec('git log --format="%h" -n 1',
        {silent: true}).output.replace('\n', '');

  crlfchecker.checkIfCrlfIsPresent(SRC_FILES);

  // Strip out all the vim/license headers.
  var reg = /\n\/\* -\*- Mode(.|\n)*?Mozilla Foundation(.|\n)*?'use strict';/g;
  bundle = bundle.replace(reg, '');

  // Append external files last since we don't want to modify them.
  bundle += cat(EXT_SRC_FILES);

  // This just preprocesses the empty pdf.js file, we don't actually want to
  // preprocess everything yet since other build targets use this file.
  builder.preprocess('pdf.js', ROOT_DIR + BUILD_TARGET,
                         {BUNDLE: bundle, BUNDLE_VERSION: bundleVersion});
};



///////////////////////////////////////////////////////////////////////////////////////////
//
// Extension stuff
//

var EXTENSION_BASE_VERSION = '15f0e58b4f01f77dec2afc7b1d15fcda8a5d1d38',
    EXTENSION_VERSION_PREFIX = '0.6.',
    EXTENSION_BUILD_NUMBER,
    EXTENSION_VERSION;

//
// make extension
//
target.extension = function() {
  cd(ROOT_DIR);
  echo();
  echo('### Building extensions');

  target.locale();
  target.firefox();
  target.chrome();
};

target.buildnumber = function() {
  cd(ROOT_DIR);
  echo();
  echo('### Getting extension build number');

  var lines = exec('git log --format=oneline ' +
                   EXTENSION_BASE_VERSION + '..', {silent: true}).output;
  // Build number is the number of commits since base version
  EXTENSION_BUILD_NUMBER = lines ? lines.match(/\n/g).length : 0;

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
  var defines = builder.merge(DEFINES, {FIREFOX: true});

  var FIREFOX_BUILD_CONTENT_DIR = FIREFOX_BUILD_DIR + '/content/',
      FIREFOX_EXTENSION_DIR = 'extensions/firefox/',
      FIREFOX_CONTENT_DIR = EXTENSION_SRC_DIR + '/firefox/content/',
      FIREFOX_EXTENSION_FILES_TO_COPY =
        ['*.js',
         '*.rdf',
         '*.svg',
         '*.png',
         '*.manifest',
         'components',
         'locale',
         '../../LICENSE'],
      FIREFOX_EXTENSION_FILES =
        ['bootstrap.js',
         'install.rdf',
         'chrome.manifest',
         'icon.png',
         'icon64.png',
         'components',
         'content',
         'locale',
         'LICENSE'],
      FIREFOX_EXTENSION_NAME = 'pdf.js.xpi',
      FIREFOX_AMO_EXTENSION_NAME = 'pdf.js.amo.xpi';

  target.locale();
  target.bundle();
  target.buildnumber();
  cd(ROOT_DIR);

  // Clear out everything in the firefox extension build directory
  rm('-rf', FIREFOX_BUILD_DIR);
  mkdir('-p', FIREFOX_BUILD_CONTENT_DIR);
  mkdir('-p', FIREFOX_BUILD_CONTENT_DIR + BUILD_DIR);
  mkdir('-p', FIREFOX_BUILD_CONTENT_DIR + '/web');

  cp(FIREFOX_CONTENT_DIR + 'PdfJs-stub.jsm',
     FIREFOX_BUILD_CONTENT_DIR + 'PdfJs.jsm');

  // Copy extension files
  cd(FIREFOX_EXTENSION_DIR);
  cp('-R', FIREFOX_EXTENSION_FILES_TO_COPY, ROOT_DIR + FIREFOX_BUILD_DIR);
  cd(ROOT_DIR);

  var setup = {
    defines: defines,
    copy: [
      [COMMON_WEB_FILES, FIREFOX_BUILD_CONTENT_DIR + '/web'],
      [FIREFOX_EXTENSION_DIR + 'tools/l10n.js',
       FIREFOX_BUILD_CONTENT_DIR + '/web']
    ],
    preprocess: [
      [COMMON_WEB_FILES_PREPROCESS, FIREFOX_BUILD_CONTENT_DIR + '/web']
    ]
  };
  builder.build(setup);

  // Remove '.DS_Store' and other hidden files
  find(FIREFOX_BUILD_DIR).forEach(function(file) {
    if (file.match(/^\./))
      rm('-f', file);
  });

  // Update the build version number
  sed('-i', /PDFJSSCRIPT_VERSION/, EXTENSION_VERSION,
      FIREFOX_BUILD_DIR + '/install.rdf');
  sed('-i', /PDFJSSCRIPT_VERSION/, EXTENSION_VERSION,
      FIREFOX_BUILD_DIR + '/update.rdf');

  sed('-i', /PDFJSSCRIPT_STREAM_CONVERTER_ID/, FIREFOX_STREAM_CONVERTER_ID,
      FIREFOX_BUILD_DIR + 'components/PdfStreamConverter.js');
  sed('-i', /PDFJSSCRIPT_PREF_PREFIX/, FIREFOX_PREF_PREFIX,
      FIREFOX_BUILD_DIR + 'components/PdfStreamConverter.js');
  sed('-i', /PDFJSSCRIPT_MOZ_CENTRAL/, 'false',
      FIREFOX_BUILD_DIR + 'components/PdfStreamConverter.js');

  // Update localized metadata
  var localizedMetadata = cat(EXTENSION_SRC_DIR + '/firefox/metadata.inc');
  sed('-i', /.*PDFJS_LOCALIZED_METADATA.*\n/, localizedMetadata,
      FIREFOX_BUILD_DIR + '/install.rdf');
  var chromeManifest = cat(EXTENSION_SRC_DIR + '/firefox/chrome.manifest.inc');
  sed('-i', /.*PDFJS_SUPPORTED_LOCALES.*\n/, chromeManifest,
      FIREFOX_BUILD_DIR + '/chrome.manifest');

  // Create the xpi
  cd(FIREFOX_BUILD_DIR);
  exec('zip -r ' + FIREFOX_EXTENSION_NAME + ' ' +
       FIREFOX_EXTENSION_FILES.join(' '));
  echo('extension created: ' + FIREFOX_EXTENSION_NAME);
  cd(ROOT_DIR);

  // Build the amo extension too (remove the updateUrl)
  cd(FIREFOX_BUILD_DIR);
  sed('-i', /.*updateURL.*\n/, '', 'install.rdf');
  exec('zip -r ' + FIREFOX_AMO_EXTENSION_NAME + ' ' +
       FIREFOX_EXTENSION_FILES.join(' '));
  echo('AMO extension created: ' + FIREFOX_AMO_EXTENSION_NAME);
  cd(ROOT_DIR);
};

//
// make mozcentral
//
target.mozcentral = function() {
  cd(ROOT_DIR);
  echo();
  echo('### Building mozilla-central extension');
  var defines = builder.merge(DEFINES, {MOZCENTRAL: true});

  var MOZCENTRAL_DIR = BUILD_DIR + 'mozcentral/',
      MOZCENTRAL_EXTENSION_DIR = MOZCENTRAL_DIR + 'browser/extensions/pdfjs/',
      MOZCENTRAL_CONTENT_DIR = MOZCENTRAL_EXTENSION_DIR + 'content/',
      MOZCENTRAL_L10N_DIR = MOZCENTRAL_DIR + 'browser/locales/en-US/pdfviewer/',
      MOZCENTRAL_TEST_DIR = MOZCENTRAL_EXTENSION_DIR + 'test/',
      FIREFOX_CONTENT_DIR = EXTENSION_SRC_DIR + '/firefox/content/',
      FIREFOX_EXTENSION_FILES_TO_COPY =
        ['components/*.js',
         '*.svg',
         '*.png',
         '*.manifest',
         'README.mozilla',
         'components',
         '../../LICENSE'],
      DEFAULT_LOCALE_FILES =
        [LOCALE_SRC_DIR + 'en-US/viewer.properties',
         LOCALE_SRC_DIR + 'en-US/chrome.properties'],
      FIREFOX_MC_EXTENSION_FILES =
        ['chrome.manifest',
         'components',
         'content',
         'LICENSE'];

  target.bundle();
  target.buildnumber();
  cd(ROOT_DIR);

  // Clear out everything in the firefox extension build directory
  rm('-rf', MOZCENTRAL_DIR);
  mkdir('-p', MOZCENTRAL_CONTENT_DIR);
  mkdir('-p', MOZCENTRAL_L10N_DIR);
  mkdir('-p', MOZCENTRAL_CONTENT_DIR + BUILD_DIR);
  mkdir('-p', MOZCENTRAL_CONTENT_DIR + '/web');

  cp(FIREFOX_CONTENT_DIR + 'PdfJs.jsm', MOZCENTRAL_CONTENT_DIR);

  // Copy extension files
  cd('extensions/firefox');
  cp('-R', FIREFOX_EXTENSION_FILES_TO_COPY,
     ROOT_DIR + MOZCENTRAL_EXTENSION_DIR);
  mv('-f', ROOT_DIR + MOZCENTRAL_EXTENSION_DIR + '/chrome-mozcentral.manifest',
           ROOT_DIR + MOZCENTRAL_EXTENSION_DIR + '/chrome.manifest');
  cd(ROOT_DIR);

  var setup = {
    defines: defines,
    copy: [
      [COMMON_WEB_FILES, MOZCENTRAL_CONTENT_DIR + '/web'],
      ['extensions/firefox/tools/l10n.js', MOZCENTRAL_CONTENT_DIR + '/web']
    ],
    preprocess: [
      [COMMON_WEB_FILES_PREPROCESS, MOZCENTRAL_CONTENT_DIR + '/web']
    ]
  };
  builder.build(setup);

  // Remove '.DS_Store' and other hidden files
  find(MOZCENTRAL_DIR).forEach(function(file) {
    if (file.match(/^\./))
      rm('-f', file);
  });

  // Copy default localization files
  cp(DEFAULT_LOCALE_FILES, MOZCENTRAL_L10N_DIR);

  // Update the build version number
  sed('-i', /PDFJSSCRIPT_VERSION/, EXTENSION_VERSION,
      MOZCENTRAL_EXTENSION_DIR + 'README.mozilla');

  sed('-i', /PDFJSSCRIPT_STREAM_CONVERTER_ID/, MOZCENTRAL_STREAM_CONVERTER_ID,
      MOZCENTRAL_EXTENSION_DIR + 'components/PdfStreamConverter.js');
  sed('-i', /PDFJSSCRIPT_PREF_PREFIX/, MOZCENTRAL_PREF_PREFIX,
      MOZCENTRAL_EXTENSION_DIR + 'components/PdfStreamConverter.js');
  sed('-i', /PDFJSSCRIPT_MOZ_CENTRAL/, 'true',
      MOZCENTRAL_EXTENSION_DIR + 'components/PdfStreamConverter.js');

  // List all files for mozilla-central
  cd(MOZCENTRAL_EXTENSION_DIR);
  var extensionFiles = '';
  find(FIREFOX_MC_EXTENSION_FILES).forEach(function(file) {
    if (test('-f', file))
      extensionFiles += file + '\n';
  });
  extensionFiles.to('extension-files');
  cd(ROOT_DIR);

  // Copy test files
  mkdir('-p', MOZCENTRAL_TEST_DIR);
  cp('-Rf', 'test/mozcentral/*', MOZCENTRAL_TEST_DIR);
};

target.b2g = function() {
  echo();
  echo('### Building B2G (Firefox OS App)');
  var B2G_BUILD_DIR = BUILD_DIR + '/b2g/',
      B2G_BUILD_CONTENT_DIR = B2G_BUILD_DIR + '/content/';
  var defines = builder.merge(DEFINES, { B2G: true });
  target.bundle();

  // Clear out everything in the b2g build directory
  cd(ROOT_DIR);
  rm('-Rf', B2G_BUILD_DIR);
  mkdir('-p', B2G_BUILD_CONTENT_DIR);
  mkdir('-p', B2G_BUILD_CONTENT_DIR + BUILD_DIR);
  mkdir('-p', B2G_BUILD_CONTENT_DIR + '/web');

  var setup = {
    defines: defines,
    copy: [
      [COMMON_WEB_FILES, B2G_BUILD_CONTENT_DIR + '/web'],
      ['web/locale.properties', B2G_BUILD_CONTENT_DIR + '/web'],
      ['external/webL10n/l10n.js', B2G_BUILD_CONTENT_DIR + '/web']
    ],
    preprocess: [
      [COMMON_WEB_FILES_PREPROCESS, B2G_BUILD_CONTENT_DIR + '/web'],
      [BUILD_TARGET, B2G_BUILD_CONTENT_DIR + BUILD_TARGET]
    ]
  };
  builder.build(setup);
};

//
// make chrome
//
target.chrome = function() {
  cd(ROOT_DIR);
  echo();
  echo('### Building Chrome extension');
  var defines = builder.merge(DEFINES, {CHROME: true});

  var CHROME_BUILD_DIR = BUILD_DIR + '/chrome/',
      CHROME_BUILD_CONTENT_DIR = CHROME_BUILD_DIR + '/content/';

  target.bundle();
  target.buildnumber();
  cd(ROOT_DIR);

  // Clear out everything in the chrome extension build directory
  rm('-Rf', CHROME_BUILD_DIR);
  mkdir('-p', CHROME_BUILD_CONTENT_DIR);
  mkdir('-p', CHROME_BUILD_CONTENT_DIR + BUILD_DIR);
  mkdir('-p', CHROME_BUILD_CONTENT_DIR + '/web');

  var setup = {
    defines: defines,
    copy: [
      [COMMON_WEB_FILES, CHROME_BUILD_CONTENT_DIR + '/web'],
      [['extensions/chrome/*.json',
        'extensions/chrome/*.html',
        'extensions/chrome/*.js'],
       CHROME_BUILD_DIR],
      [BUILD_TARGET, CHROME_BUILD_CONTENT_DIR + BUILD_TARGET],
      ['external/webL10n/l10n.js', CHROME_BUILD_CONTENT_DIR + '/web']
    ],
    preprocess: [
      [COMMON_WEB_FILES_PREPROCESS, CHROME_BUILD_CONTENT_DIR + '/web'],
      ['web/locale.properties', CHROME_BUILD_CONTENT_DIR + '/web']
    ]
  };
  builder.build(setup);

  // Update the build version number
  sed('-i', /PDFJSSCRIPT_VERSION/, EXTENSION_VERSION,
      CHROME_BUILD_DIR + '/manifest.json');

  // Bundle the files to a Chrome extension file .crx if path to key is set
  var pem = env['PDFJS_CHROME_KEY'];
  if (!pem) {
    return;
  }

  echo();
  echo('### Bundling .crx extension into ' + CHROME_BUILD_DIR);

  if (!test('-f', pem)) {
    echo('Incorrect PDFJS_CHROME_KEY path');
    exit(1);
  }

  var browserManifest = env['PDF_BROWSERS'] ||
      'test/resources/browser_manifests/browser_manifest.json';

  if (!test('-f', browserManifest)) {
    echo('Browser manifest file ' + browserManifest + ' does not exist.');
    echo('Try copying one of the examples in test/resources/browser_manifests');
    exit(1);
  }

  try {
    var manifest = JSON.parse(cat(browserManifest));
  } catch (e) {
    echo('Malformed browser manifest file');
    echo(e.message);
    exit(1);
  }

  var executable;
  manifest.forEach(function(browser) {
    if (browser.name === 'chrome') {
      executable = browser.path;
    }
  });

  // If there was no chrome entry in the browser manifest, exit
  if (!executable) {
    echo('There was no \'chrome\' entry in the browser manifest');
    exit(1);
  }

  // If we're on a Darwin (Mac) OS, then let's check for an .app path
  if (process.platform === 'darwin' && executable.indexOf('.app') !== -1) {
    executable = executable + '/Contents/MacOS/Google Chrome';
  }

  // If the chrome executable doesn't exist
  if (!test('-f', executable)) {
    echo('Incorrect executable path to chrome');
    exit(1);
  }

  // Let chrome pack the extension for us
  exec('"' + executable + '"' +
    ' --no-message-box' +
    ' "--pack-extension=' + ROOT_DIR + CHROME_BUILD_DIR + '"' +
    ' "--pack-extension-key=' + pem + '"');

  // Rename to pdf.js.crx
  mv(BUILD_DIR + 'chrome.crx', CHROME_BUILD_DIR + 'pdf.js.crx');
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
      PDF_BROWSERS = env['PDF_BROWSERS'] ||
                     'resources/browser_manifests/browser_manifest.json';

  if (!test('-f', 'test/' + PDF_BROWSERS)) {
    echo('Browser manifest file test/' + PDF_BROWSERS + ' does not exist.');
    echo('Copy one of the examples in test/resources/browser_manifests/');
    exit(1);
  }

  var reftest = (options && options.noreftest) ? '' : '--reftest';

  cd('test');
  exec(PYTHON_BIN + ' -u test.py ' + reftest + ' --browserManifestFile=' +
       PDF_BROWSERS + ' --manifestFile=' + PDF_TEST, {async: true});
};

//
// make unittest
//
target.unittest = function(options, callback) {
  cd(ROOT_DIR);
  echo();
  echo('### Running unit tests');

  var PDF_BROWSERS = env['PDF_BROWSERS'] ||
                     'resources/browser_manifests/browser_manifest.json';

  if (!test('-f', 'test/' + PDF_BROWSERS)) {
    echo('Browser manifest file test/' + PDF_BROWSERS + ' does not exist.');
    echo('Copy one of the examples in test/resources/browser_manifests/');
    exit(1);
  }
  callback = callback || function() {};
  cd('test');
  exec(PYTHON_BIN + ' -u test.py --unitTest --browserManifestFile=' +
       PDF_BROWSERS, {async: true}, callback);
};

//
// make botmakeref
//
target.botmakeref = function() {
  cd(ROOT_DIR);
  echo();
  echo('### Creating reference images');

  var PDF_TEST = env['PDF_TEST'] || 'test_manifest.json',
      PDF_BROWSERS = env['PDF_BROWSERS'] ||
                     'resources/browser_manifests/browser_manifest.json';

  if (!test('-f', 'test/' + PDF_BROWSERS)) {
    echo('Browser manifest file test/' + PDF_BROWSERS + ' does not exist.');
    echo('Copy one of the examples in test/resources/browser_manifests/');
    exit(1);
  }

  cd('test');
  exec(PYTHON_BIN + ' -u test.py --masterMode --noPrompts ' +
       '--browserManifestFile=' + PDF_BROWSERS, {async: true});
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

  var LINT_FILES = ['make.js',
                    'external/builder/*.js',
                    'external/crlfchecker/*.js',
                    'src/*.js',
                    'web/*.js',
                    'test/*.js',
                    'test/unit/*.js',
                    'extensions/firefox/*.js',
                    'extensions/firefox/components/*.js',
                    'extensions/chrome/*.js'];

  exec('gjslint --nojsdoc ' + LINT_FILES.join(' '));

  crlfchecker.checkIfCrlfIsPresent(LINT_FILES);
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

//
// make makefile
//
target.makefile = function() {
  var makefileContent = 'help:\n\tnode make\n\n';
  var targetsNames = [];
  for (var i in target) {
    makefileContent += i + ':\n\tnode make ' + i + '\n\n';
    targetsNames.push(i);
  }
  makefileContent += '.PHONY: ' + targetsNames.join(' ') + '\n';
  makefileContent.to('Makefile');
};
