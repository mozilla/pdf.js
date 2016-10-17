/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* jshint node:true */
/* globals cat, cd, cp, echo, env, exec, exit, find, ls, mkdir, mv, process, rm,
           sed, target, test */

'use strict';

try {
  require('shelljs/make');
} catch (e) {
  console.log('ShellJS is not installed. Run "npm install" to install ' +
              'all dependencies.');
  return;
}

var builder = require('./external/builder/builder.js');
var fs = require('fs');

var CONFIG_FILE = 'pdfjs.config';
var config = JSON.parse(fs.readFileSync(CONFIG_FILE));

var ROOT_DIR = __dirname + '/', // absolute path to project's root
    BUILD_DIR = 'build/',
    SRC_DIR = 'src/',
    BUILD_TARGET = BUILD_DIR + 'pdf.js',
    BUILD_WORKER_TARGET = BUILD_DIR + 'pdf.worker.js',
    BUILD_TARGETS = [BUILD_TARGET, BUILD_WORKER_TARGET],
    FIREFOX_BUILD_DIR = BUILD_DIR + '/firefox/',
    CHROME_BUILD_DIR = BUILD_DIR + '/chromium/',
    JSDOC_DIR = BUILD_DIR + 'jsdoc',
    EXTENSION_SRC_DIR = 'extensions/',
    FIREFOX_CONTENT_DIR = EXTENSION_SRC_DIR + '/firefox/content/',
    LOCALE_SRC_DIR = 'l10n/',
    GH_PAGES_DIR = BUILD_DIR + 'gh-pages/',
    GENERIC_DIR = BUILD_DIR + 'generic/',
    MINIFIED_DIR = BUILD_DIR + 'minified/',
    SINGLE_FILE_DIR = BUILD_DIR + 'singlefile/',
    COMPONENTS_DIR = BUILD_DIR + 'components/',
    REPO = 'git@github.com:mozilla/pdf.js.git',
    MOZCENTRAL_PREF_PREFIX = 'pdfjs',
    FIREFOX_PREF_PREFIX = 'extensions.uriloader@pdf.js',
    MOZCENTRAL_STREAM_CONVERTER_ID = 'd0c5195d-e798-49d4-b1d3-9324328b2291',
    FIREFOX_STREAM_CONVERTER_ID = '6457a96b-2d68-439a-bcfa-44465fbcdbb1',
    MOZCENTRAL_STREAM_CONVERTER2_ID = 'd0c5195d-e798-49d4-b1d3-9324328b2292',
    FIREFOX_STREAM_CONVERTER2_ID = '6457a96b-2d68-439a-bcfa-44465fbcdbb2';

var DEFINES = {
  PRODUCTION: true,
  // The main build targets:
  GENERIC: false,
  FIREFOX: false,
  MOZCENTRAL: false,
  CHROME: false,
  MINIFIED: false,
  SINGLE_FILE: false,
  COMPONENTS: false
};

function getCurrentVersion() {
  // The 'build/version.json' file is created by 'buildnumber' task.
  return JSON.parse(fs.readFileSync(ROOT_DIR + 'build/version.json').toString())
    .version;
}

function execGulp(cmd) {
  var result = exec('gulp ' + cmd);
  if (result.code) {
    echo('ERROR: gulp exited with ' + result.code);
    exit(result.code);
  }
}

//
// make all
//
target.all = function() {
  execGulp('default');
};


////////////////////////////////////////////////////////////////////////////////
//
// Production stuff
//

// Files that need to be included in every build.
var COMMON_WEB_FILES =
      ['web/images',
       'web/debugger.js'],
    COMMON_WEB_FILES_PREPROCESS =
      ['web/viewer.html'],
    COMMON_FIREFOX_FILES_PREPROCESS =
      [FIREFOX_CONTENT_DIR + 'PdfStreamConverter.jsm',
       FIREFOX_CONTENT_DIR + 'PdfJsNetwork.jsm',
       FIREFOX_CONTENT_DIR + 'PdfjsContentUtils.jsm',
       FIREFOX_CONTENT_DIR + 'PdfjsChromeUtils.jsm'];
//
// make generic
// Builds the generic production viewer that should be compatible with most
// modern HTML5 browsers.
//
target.generic = function() {
  execGulp('bundle-generic');

  target.locale();

  cd(ROOT_DIR);
  echo();
  echo('### Creating generic viewer');

  rm('-rf', GENERIC_DIR);
  mkdir('-p', GENERIC_DIR);
  mkdir('-p', GENERIC_DIR + BUILD_DIR);
  mkdir('-p', GENERIC_DIR + '/web');
  mkdir('-p', GENERIC_DIR + '/web/cmaps');

  var defines = builder.merge(DEFINES, {GENERIC: true});

  var setup = {
    defines: defines,
    copy: [
      [BUILD_TARGETS, GENERIC_DIR + BUILD_DIR],
      [BUILD_DIR + 'viewer.js', GENERIC_DIR + '/web'],
      [COMMON_WEB_FILES, GENERIC_DIR + '/web'],
      ['LICENSE', GENERIC_DIR],
      ['external/webL10n/l10n.js', GENERIC_DIR + '/web'],
      ['web/compatibility.js', GENERIC_DIR + '/web'],
      ['web/compressed.tracemonkey-pldi-09.pdf', GENERIC_DIR + '/web'],
      ['external/bcmaps/*', GENERIC_DIR + '/web/cmaps/'],
      ['web/locale', GENERIC_DIR + '/web']
    ],
    preprocess: [
      [COMMON_WEB_FILES_PREPROCESS, GENERIC_DIR + '/web']
    ],
    preprocessCSS: [
      ['generic', 'web/viewer.css',
       GENERIC_DIR + '/web/viewer.css']
    ]
  };
  builder.build(setup);

  cleanupJSSource(GENERIC_DIR + '/build/pdf.js');
  cleanupJSSource(GENERIC_DIR + '/web/viewer.js');
  cleanupCSSSource(GENERIC_DIR + '/web/viewer.css');
};

target.components = function() {
  execGulp('bundle-components');

  cd(ROOT_DIR);
  echo();
  echo('### Creating generic components');

  rm('-rf', COMPONENTS_DIR);
  mkdir('-p', COMPONENTS_DIR);
  mkdir('-p', COMPONENTS_DIR + 'images');

  var defines = builder.merge(DEFINES, {COMPONENTS: true, GENERIC: true});

  var COMPONENTS_IMAGES = [
    'web/images/annotation-*.svg',
    'web/images/loading-icon.gif',
    'web/images/shadow.png',
    'web/images/texture.png',
  ];

  var setup = {
    defines: defines,
    copy: [
      [BUILD_DIR + 'pdf_viewer.js', COMPONENTS_DIR],
      [COMPONENTS_IMAGES, COMPONENTS_DIR + 'images'],
      ['web/compatibility.js', COMPONENTS_DIR],
    ],
    preprocess: [],
    preprocessCSS: [
      ['components', 'web/pdf_viewer.css', COMPONENTS_DIR + 'pdf_viewer.css'],
    ]
  };
  builder.build(setup);

  cleanupJSSource(COMPONENTS_DIR + 'pdf_viewer.js');
  cleanupCSSSource(COMPONENTS_DIR + 'pdf_viewer.css');
};

target.jsdoc = function() {
  execGulp('jsdoc');
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
  target.jsdoc();

  cd(ROOT_DIR);
  echo();
  echo('### Creating web site');

  if (test('-d', GH_PAGES_DIR)) {
    rm('-rf', GH_PAGES_DIR);
  }

  mkdir('-p', GH_PAGES_DIR + '/web');
  mkdir('-p', GH_PAGES_DIR + '/web/images');
  mkdir('-p', GH_PAGES_DIR + BUILD_DIR);
  mkdir('-p', GH_PAGES_DIR + EXTENSION_SRC_DIR + '/firefox');
  mkdir('-p', GH_PAGES_DIR + EXTENSION_SRC_DIR + '/chromium');
  mkdir('-p', GH_PAGES_DIR + '/api/draft/');
  mkdir('-p', GH_PAGES_DIR + '/examples/');

  cp('-R', GENERIC_DIR + '/*', GH_PAGES_DIR);
  cp(FIREFOX_BUILD_DIR + '/*.xpi', FIREFOX_BUILD_DIR + '/*.rdf',
     GH_PAGES_DIR + EXTENSION_SRC_DIR + 'firefox/');
  cp(CHROME_BUILD_DIR + '/*.crx', FIREFOX_BUILD_DIR + '/*.rdf',
     GH_PAGES_DIR + EXTENSION_SRC_DIR + 'chromium/');
  cp('-R', 'test/features', GH_PAGES_DIR);
  cp('-R', 'examples/learning', GH_PAGES_DIR + '/examples/');
  cp('-R', JSDOC_DIR + '/*', GH_PAGES_DIR + '/api/draft/');

  var wintersmith = require('wintersmith');
  var env = wintersmith('docs/config.json');
  env.build(GH_PAGES_DIR, function (error) {
    if (error) {
      throw error;
    }
    sed('-i', /STABLE_VERSION/g, config.stableVersion,
        GH_PAGES_DIR + '/getting_started/index.html');
    sed('-i', /BETA_VERSION/g, config.betaVersion,
        GH_PAGES_DIR + '/getting_started/index.html');
    echo('Done building with wintersmith.');

    var VERSION = getCurrentVersion();
    var reason = process.env['PDFJS_UPDATE_REASON'];
    cd(GH_PAGES_DIR);
    exec('git init');
    exec('git remote add origin ' + REPO);
    exec('git add -A');
    exec('git commit -am "gh-pages site created via make.js script" -m ' +
         '"PDF.js version ' + VERSION + (reason ? ' - ' + reason : '') + '"');
    exec('git branch -m gh-pages');

    echo();
    echo('Website built in ' + GH_PAGES_DIR);
  });
};

target.dist = function() {
  target.generic();
  target.singlefile();
  target.components();

  var DIST_DIR = BUILD_DIR + 'dist/';
  var DIST_REPO_URL = 'https://github.com/mozilla/pdfjs-dist';
  var VERSION = getCurrentVersion();

  cd(ROOT_DIR);

  echo();
  echo('### Cloning baseline distribution');

  rm('-rf', DIST_DIR);
  mkdir('-p', DIST_DIR);
  exec('git clone --depth 1 ' + DIST_REPO_URL + ' ' + DIST_DIR);

  echo();
  echo('### Overwriting all files');
  rm('-rf', DIST_DIR + '*');

  cp('-R', ROOT_DIR + 'external/dist/*', DIST_DIR);
  cp('-R', GENERIC_DIR + 'LICENSE', DIST_DIR);
  cp('-R', GENERIC_DIR + 'web/cmaps', DIST_DIR);
  mkdir('-p', DIST_DIR + 'build/');
  cp('-R', [
    GENERIC_DIR + 'build/pdf.js',
    GENERIC_DIR + 'build/pdf.worker.js',
    SINGLE_FILE_DIR + 'build/pdf.combined.js',
    SRC_DIR + 'pdf.worker.entry.js',
  ], DIST_DIR + 'build/');

  mkdir('-p', DIST_DIR + 'web/');
  cp('-R', [
    COMPONENTS_DIR + '*',
  ], DIST_DIR + 'web/');

  echo();
  echo('### Rebuilding manifests');

  var DIST_NAME = 'pdfjs-dist';
  var DIST_DESCRIPTION = 'Generic build of Mozilla\'s PDF.js library.';
  var DIST_KEYWORDS = ['Mozilla', 'pdf', 'pdf.js'];
  var DIST_HOMEPAGE = 'http://mozilla.github.io/pdf.js/';
  var DIST_BUGS_URL = 'https://github.com/mozilla/pdf.js/issues';
  var DIST_LICENSE = 'Apache-2.0';
  var npmManifest = {
    name: DIST_NAME,
    version: VERSION,
    main: 'build/pdf.js',
    description: DIST_DESCRIPTION,
    keywords: DIST_KEYWORDS,
    homepage: DIST_HOMEPAGE,
    bugs: DIST_BUGS_URL,
    license: DIST_LICENSE,
    dependencies: {
      'node-ensure': '^0.0.0' // shim for node for require.ensure
    },
    browser: {
      'node-ensure': false
    },
    format: 'amd', // to not allow system.js to choose 'cjs'
    repository: {
      type: 'git',
      url: DIST_REPO_URL
    },
  };
  fs.writeFileSync(DIST_DIR + 'package.json',
                   JSON.stringify(npmManifest, null, 2));
  var bowerManifest = {
    name: DIST_NAME,
    version: VERSION,
    main: [
      'build/pdf.js',
      'build/pdf.worker.js',
    ],
    ignore: [],
    keywords: DIST_KEYWORDS,
  };
  fs.writeFileSync(DIST_DIR + 'bower.json',
                   JSON.stringify(bowerManifest, null, 2));

  echo();
  echo('### Committing changes');

  cd(DIST_DIR);
  var reason = process.env['PDFJS_UPDATE_REASON'];
  var message = 'PDF.js version ' + VERSION + (reason ? ' - ' + reason : '');
  exec('git add *');
  exec('git commit -am \"' + message + '\"');
  exec('git tag -a v' + VERSION + ' -m \"' + message + '\"');

  cd(ROOT_DIR);

  echo();
  echo('Done. Push with');
  echo('  cd ' + DIST_DIR + '; git push --tags ' + DIST_REPO_URL + ' master');
  echo();
};

target.publish = function() {
  execGulp('publish');
};

//
// make locale
// Creates localized resources for the viewer and extension.
//
target.locale = function() {
  var METADATA_OUTPUT = 'extensions/firefox/metadata.inc';
  var CHROME_MANIFEST_OUTPUT = 'extensions/firefox/chrome.manifest.inc';
  var EXTENSION_LOCALE_OUTPUT = 'extensions/firefox/locale';
  var VIEWER_LOCALE_OUTPUT = 'web/locale/';

  cd(ROOT_DIR);
  echo();
  echo('### Building localization files');

  rm('-rf', EXTENSION_LOCALE_OUTPUT);
  mkdir('-p', EXTENSION_LOCALE_OUTPUT);
  rm('-rf', VIEWER_LOCALE_OUTPUT);
  mkdir('-p', VIEWER_LOCALE_OUTPUT);

  var subfolders = ls(LOCALE_SRC_DIR);
  subfolders.sort();
  var metadataContent = '';
  var chromeManifestContent = '';
  var viewerOutput = '';
  for (var i = 0; i < subfolders.length; i++) {
    var locale = subfolders[i];
    var path = LOCALE_SRC_DIR + locale;
    if (!test('-d', path)) {
      continue;
    }
    if (!/^[a-z][a-z]([a-z])?(-[A-Z][A-Z])?$/.test(locale)) {
      echo('Skipping invalid locale: ' + locale);
      continue;
    }

    mkdir('-p', EXTENSION_LOCALE_OUTPUT + '/' + locale);
    mkdir('-p', VIEWER_LOCALE_OUTPUT + '/' + locale);
    chromeManifestContent += 'locale  pdf.js  ' + locale + '  locale/' +
                             locale + '/\n';

    if (test('-f', path + '/viewer.properties')) {
      viewerOutput += '[' + locale + ']\n' +
                      '@import url(' + locale + '/viewer.properties)\n\n';
      cp(path + '/viewer.properties', EXTENSION_LOCALE_OUTPUT + '/' + locale);
      cp(path + '/viewer.properties', VIEWER_LOCALE_OUTPUT + '/' + locale);
    }

    if (test('-f', path + '/chrome.properties')) {
      cp(path + '/chrome.properties', EXTENSION_LOCALE_OUTPUT + '/' + locale);
    }

    if (test('-f', path + '/metadata.inc')) {
      var metadata = cat(path + '/metadata.inc');
      metadataContent += metadata;
    }
  }
  viewerOutput.to(VIEWER_LOCALE_OUTPUT + 'locale.properties');
  metadataContent.to(METADATA_OUTPUT);
  chromeManifestContent.to(CHROME_MANIFEST_OUTPUT);
};

//
// make cmaps
// Compresses cmap files. Ensure that Adobe cmap download and uncompressed at
// ./external/cmaps location.
//
target.cmaps = function () {
  var CMAP_INPUT = 'external/cmaps';
  var VIEWER_CMAP_OUTPUT = 'external/bcmaps';

  cd(ROOT_DIR);
  echo();
  echo('### Building cmaps');

  // testing a file that usually present
  if (!test('-f', CMAP_INPUT + '/UniJIS-UCS2-H')) {
    echo('./external/cmaps has no cmap files, please download them from:');
    echo('  https://github.com/adobe-type-tools/cmap-resources');
    exit(1);
  }

  rm(VIEWER_CMAP_OUTPUT + '*.bcmap');

  var compressCmaps =
    require('./external/cmapscompress/compress.js').compressCmaps;
  compressCmaps(CMAP_INPUT, VIEWER_CMAP_OUTPUT, true);
};

//
// make bundle
// Bundles all source files into one wrapper 'pdf.js' file, in the given order.
//
target.bundle = function(args) {
  execGulp('bundle');
};

//
// make singlefile
// Concatenates pdf.js and pdf.worker.js into one big pdf.combined.js, and
// flags the script loader to not attempt to load the separate worker JS file.
//
target.singlefile = function() {
  cd(ROOT_DIR);
  echo();
  echo('### Creating singlefile build');

  var SINGLE_FILE_BUILD_DIR = SINGLE_FILE_DIR + 'build/';

  execGulp('bundle-singlefile');

  cd(ROOT_DIR);

  rm('-rf', SINGLE_FILE_DIR);
  mkdir('-p', SINGLE_FILE_DIR);
  mkdir('-p', SINGLE_FILE_BUILD_DIR);

  cp(BUILD_DIR + 'pdf.combined.js', SINGLE_FILE_BUILD_DIR);
};

function stripCommentHeaders(content) {
  var notEndOfComment = '(?:[^*]|\\*(?!/))+';
  var reg = new RegExp(
    '\n/\\* Copyright' + notEndOfComment + '\\*/\\s*' +
    '(?:/\\*' + notEndOfComment + '\\*/\\s*|//(?!#).*\n\\s*)*' +
    '\\s*\'use strict\';', 'g');
  content = content.replace(reg, '');
  return content;
}

function cleanupJSSource(file) {
  var content = cat(file);

  content = stripCommentHeaders(content);

  content.to(file);
}

function cleanupCSSSource(file) {
  var content = cat(file);

  // Strip out all license headers in the middle.
  var reg = /\n\/\* Copyright(.|\n)*?Mozilla Foundation(.|\n)*?\*\//g;
  content = content.replace(reg, '');

  content.to(file);
}

//
// make minified
// Builds the minified production viewer that should be compatible with most
// modern HTML5 browsers.
//
target.minified = function() {
  execGulp('bundle-minified');
  target.locale();

  cd(ROOT_DIR);
  echo();
  echo('### Creating minified viewer');

  rm('-rf', MINIFIED_DIR);
  mkdir('-p', MINIFIED_DIR);
  mkdir('-p', MINIFIED_DIR + BUILD_DIR);
  mkdir('-p', MINIFIED_DIR + '/web');
  mkdir('-p', MINIFIED_DIR + '/web/cmaps');

  var defines = builder.merge(DEFINES, {GENERIC: true, MINIFIED: true});

  var setup = {
    defines: defines,
    copy: [
      [BUILD_TARGETS, MINIFIED_DIR + BUILD_DIR],
      [BUILD_DIR + 'viewer.js', MINIFIED_DIR + '/web'],
      [COMMON_WEB_FILES, MINIFIED_DIR + '/web'],
      ['web/compressed.tracemonkey-pldi-09.pdf', MINIFIED_DIR + '/web'],
      ['external/bcmaps/*', MINIFIED_DIR + '/web/cmaps'],
      ['web/locale', MINIFIED_DIR + '/web']
    ],
    preprocess: [
      [COMMON_WEB_FILES_PREPROCESS, MINIFIED_DIR + '/web']
    ],
    preprocessCSS: [
      ['minified', 'web/viewer.css',
       MINIFIED_DIR + '/web/viewer.css']
    ]
  };
  builder.build(setup);

  cleanupCSSSource(MINIFIED_DIR + '/web/viewer.css');

  var viewerFiles = [
    'web/compatibility.js',
    'external/webL10n/l10n.js',
    MINIFIED_DIR + BUILD_DIR + 'pdf.js',
    MINIFIED_DIR + '/web/viewer.js'
  ];

  echo();
  echo('### Minifying js files');

  var UglifyJS = require('uglify-js');
  // V8 chokes on very long sequences. Works around that.
  var optsForHugeFile = {compress: {sequences: false}};

  UglifyJS.minify(viewerFiles).code
    .to(MINIFIED_DIR + '/web/pdf.viewer.js');
  UglifyJS.minify(MINIFIED_DIR + '/build/pdf.js').code
    .to(MINIFIED_DIR + '/build/pdf.min.js');
  UglifyJS.minify(MINIFIED_DIR + '/build/pdf.worker.js', optsForHugeFile).code
    .to(MINIFIED_DIR + '/build/pdf.worker.min.js');

  echo();
  echo('### Cleaning js files');

  rm(MINIFIED_DIR + '/web/viewer.js');
  rm(MINIFIED_DIR + '/web/debugger.js');
  rm(MINIFIED_DIR + '/build/pdf.js');
  rm(MINIFIED_DIR + '/build/pdf.worker.js');
  mv(MINIFIED_DIR + '/build/pdf.min.js',
     MINIFIED_DIR + '/build/pdf.js');
  mv(MINIFIED_DIR + '/build/pdf.worker.min.js',
     MINIFIED_DIR + '/build/pdf.worker.js');
};

////////////////////////////////////////////////////////////////////////////////
//
// Extension stuff
//

//
// make extension
//
target.extension = function() {
  execGulp('extension');
};

target.buildnumber = function() {
  execGulp('buildnumber');
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
      FIREFOX_EXTENSION_FILES_TO_COPY =
        ['*.js',
         '*.rdf',
         '*.svg',
         '*.png',
         '*.manifest',
         'locale',
         'chrome',
         '../../LICENSE'],
      FIREFOX_EXTENSION_FILES =
        ['bootstrap.js',
         'install.rdf',
         'chrome.manifest',
         'icon.png',
         'icon64.png',
         'content',
         'chrome',
         'locale',
         'LICENSE'],
      FIREFOX_EXTENSION_NAME = 'pdf.js.xpi';

  target.locale();
  execGulp('bundle-firefox');
  cd(ROOT_DIR);

  // Clear out everything in the firefox extension build directory
  rm('-rf', FIREFOX_BUILD_DIR);
  mkdir('-p', FIREFOX_BUILD_CONTENT_DIR);
  mkdir('-p', FIREFOX_BUILD_CONTENT_DIR + BUILD_DIR);
  mkdir('-p', FIREFOX_BUILD_CONTENT_DIR + '/web');
  mkdir('-p', FIREFOX_BUILD_CONTENT_DIR + '/web/cmaps');

  cp(FIREFOX_CONTENT_DIR + 'PdfJs-stub.jsm',
     FIREFOX_BUILD_CONTENT_DIR + 'PdfJs.jsm');

  cp(FIREFOX_CONTENT_DIR + 'PdfJsTelemetry-addon.jsm',
     FIREFOX_BUILD_CONTENT_DIR + 'PdfJsTelemetry.jsm');

  // Copy extension files
  cd(FIREFOX_EXTENSION_DIR);
  cp('-R', FIREFOX_EXTENSION_FILES_TO_COPY, ROOT_DIR + FIREFOX_BUILD_DIR);
  cd(ROOT_DIR);

  var setup = {
    defines: defines,
    copy: [
      [BUILD_TARGETS, FIREFOX_BUILD_CONTENT_DIR + BUILD_DIR],
      [BUILD_DIR + 'viewer.js', FIREFOX_BUILD_CONTENT_DIR + '/web'],
      [COMMON_WEB_FILES, FIREFOX_BUILD_CONTENT_DIR + '/web'],
      ['external/bcmaps/*', FIREFOX_BUILD_CONTENT_DIR + '/web/cmaps'],
      [FIREFOX_EXTENSION_DIR + 'tools/l10n.js',
       FIREFOX_BUILD_CONTENT_DIR + '/web']
    ],
    preprocess: [
      [COMMON_WEB_FILES_PREPROCESS, FIREFOX_BUILD_CONTENT_DIR + '/web'],
      [COMMON_FIREFOX_FILES_PREPROCESS, FIREFOX_BUILD_CONTENT_DIR],
      [SRC_DIR + 'core/network.js', FIREFOX_BUILD_CONTENT_DIR],
      [FIREFOX_EXTENSION_DIR + 'bootstrap.js', FIREFOX_BUILD_DIR]
    ],
    preprocessCSS: [
      ['firefox', 'web/viewer.css',
       FIREFOX_BUILD_CONTENT_DIR + '/web/viewer.css']
    ]
  };
  builder.build(setup);

  cleanupJSSource(FIREFOX_BUILD_CONTENT_DIR + '/web/viewer.js');
  cleanupJSSource(FIREFOX_BUILD_DIR + 'bootstrap.js');
  cleanupJSSource(FIREFOX_BUILD_CONTENT_DIR + 'PdfjsChromeUtils.jsm');
  cleanupCSSSource(FIREFOX_BUILD_CONTENT_DIR + '/web/viewer.css');

  // Remove '.DS_Store' and other hidden files
  find(FIREFOX_BUILD_DIR).forEach(function(file) {
    if (file.match(/^\./)) {
      rm('-f', file);
    }
  });

  // Update the build version number
  var VERSION = getCurrentVersion();
  sed('-i', /PDFJSSCRIPT_VERSION/, VERSION,
      FIREFOX_BUILD_DIR + '/install.rdf');
  sed('-i', /PDFJSSCRIPT_VERSION/, VERSION,
      FIREFOX_BUILD_DIR + '/update.rdf');

  sed('-i', /PDFJSSCRIPT_STREAM_CONVERTER_ID/, FIREFOX_STREAM_CONVERTER_ID,
      FIREFOX_BUILD_CONTENT_DIR + 'PdfStreamConverter.jsm');
  sed('-i', /PDFJSSCRIPT_STREAM_CONVERTER2_ID/, FIREFOX_STREAM_CONVERTER2_ID,
      FIREFOX_BUILD_CONTENT_DIR + 'PdfStreamConverter.jsm');
  sed('-i', /PDFJSSCRIPT_PREF_PREFIX/, FIREFOX_PREF_PREFIX,
      FIREFOX_BUILD_CONTENT_DIR + 'PdfStreamConverter.jsm');
  sed('-i', /PDFJSSCRIPT_MOZ_CENTRAL/, 'false',
      FIREFOX_BUILD_CONTENT_DIR + 'PdfStreamConverter.jsm');
  sed('-i', /PDFJSSCRIPT_PREF_PREFIX/, FIREFOX_PREF_PREFIX,
      FIREFOX_BUILD_CONTENT_DIR + 'PdfjsChromeUtils.jsm');

  // Update localized metadata
  var localizedMetadata = cat(EXTENSION_SRC_DIR + '/firefox/metadata.inc');
  sed('-i', /.*PDFJS_LOCALIZED_METADATA.*\n/, localizedMetadata,
      FIREFOX_BUILD_DIR + '/install.rdf');
  var chromeManifest = cat(EXTENSION_SRC_DIR + '/firefox/chrome.manifest.inc');
  sed('-i', /.*PDFJS_SUPPORTED_LOCALES.*\n/, chromeManifest,
      FIREFOX_BUILD_DIR + '/chrome.manifest');

  // Set timezone to UTC before calling zip to get reproducible results.
  process.env.TZ = 'UTC';

  // Create the xpi
  cd(FIREFOX_BUILD_DIR);
  exec('zip -r ' + FIREFOX_EXTENSION_NAME + ' ' +
       FIREFOX_EXTENSION_FILES.join(' '));
  echo('extension created: ' + FIREFOX_EXTENSION_NAME);
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
      FIREFOX_CONTENT_DIR = EXTENSION_SRC_DIR + '/firefox/content/',
      FIREFOX_EXTENSION_FILES_TO_COPY =
        ['*.svg',
         '*.png',
         '*.manifest',
         'README.mozilla',
         '../../LICENSE'],
      DEFAULT_LOCALE_FILES =
        [LOCALE_SRC_DIR + 'en-US/viewer.properties',
         LOCALE_SRC_DIR + 'en-US/chrome.properties'],
      FIREFOX_MC_EXCLUDED_FILES =
        ['icon.png',
         'icon64.png'];

  execGulp('bundle-mozcentral');
  cd(ROOT_DIR);

  // Clear out everything in the firefox extension build directory
  rm('-rf', MOZCENTRAL_DIR);
  mkdir('-p', MOZCENTRAL_CONTENT_DIR);
  mkdir('-p', MOZCENTRAL_L10N_DIR);
  mkdir('-p', MOZCENTRAL_CONTENT_DIR + BUILD_DIR);
  mkdir('-p', MOZCENTRAL_CONTENT_DIR + '/web');
  mkdir('-p', MOZCENTRAL_CONTENT_DIR + '/web/cmaps');

  cp(FIREFOX_CONTENT_DIR + 'PdfJsTelemetry.jsm', MOZCENTRAL_CONTENT_DIR);

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
      [BUILD_TARGETS, MOZCENTRAL_CONTENT_DIR + BUILD_DIR],
      [BUILD_DIR + 'viewer.js', MOZCENTRAL_CONTENT_DIR + '/web'],
      [COMMON_WEB_FILES, MOZCENTRAL_CONTENT_DIR + '/web'],
      ['external/bcmaps/*', MOZCENTRAL_CONTENT_DIR + '/web/cmaps'],
      ['extensions/firefox/tools/l10n.js', MOZCENTRAL_CONTENT_DIR + '/web']
    ],
    preprocess: [
      [COMMON_WEB_FILES_PREPROCESS, MOZCENTRAL_CONTENT_DIR + '/web'],
      [FIREFOX_CONTENT_DIR + 'pdfjschildbootstrap.js', MOZCENTRAL_CONTENT_DIR],
      [SRC_DIR + 'core/network.js', MOZCENTRAL_CONTENT_DIR],
      [COMMON_FIREFOX_FILES_PREPROCESS, MOZCENTRAL_CONTENT_DIR],
      [FIREFOX_CONTENT_DIR + 'PdfJs.jsm', MOZCENTRAL_CONTENT_DIR]
    ],
    preprocessCSS: [
      ['mozcentral',
       'web/viewer.css',
       MOZCENTRAL_CONTENT_DIR + '/web/viewer.css']
    ]
  };
  builder.build(setup);

  cleanupJSSource(MOZCENTRAL_CONTENT_DIR + '/web/viewer.js');
  cleanupJSSource(MOZCENTRAL_CONTENT_DIR + '/PdfJs.jsm');
  cleanupJSSource(MOZCENTRAL_CONTENT_DIR + '/PdfjsChromeUtils.jsm');
  cleanupCSSSource(MOZCENTRAL_CONTENT_DIR + '/web/viewer.css');

  // Remove '.DS_Store' and other hidden files
  find(MOZCENTRAL_DIR).forEach(function(file) {
    if (file.match(/^\./)) {
      rm('-f', file);
    }
  });

  // Remove excluded files
  cd(MOZCENTRAL_EXTENSION_DIR);
  FIREFOX_MC_EXCLUDED_FILES.forEach(function(file) {
    if (test('-f', file)) {
      rm('-r', file);
    }
  });
  cd(ROOT_DIR);

  // Copy default localization files
  cp(DEFAULT_LOCALE_FILES, MOZCENTRAL_L10N_DIR);

  // Update the build version number
  var VERSION = getCurrentVersion();
  sed('-i', /PDFJSSCRIPT_VERSION/, VERSION,
      MOZCENTRAL_EXTENSION_DIR + 'README.mozilla');

  sed('-i', /PDFJSSCRIPT_STREAM_CONVERTER_ID/, MOZCENTRAL_STREAM_CONVERTER_ID,
      MOZCENTRAL_CONTENT_DIR + 'PdfStreamConverter.jsm');
  sed('-i', /PDFJSSCRIPT_STREAM_CONVERTER2_ID/, MOZCENTRAL_STREAM_CONVERTER2_ID,
      MOZCENTRAL_CONTENT_DIR + 'PdfStreamConverter.jsm');
  sed('-i', /PDFJSSCRIPT_PREF_PREFIX/, MOZCENTRAL_PREF_PREFIX,
      MOZCENTRAL_CONTENT_DIR + 'PdfStreamConverter.jsm');
  sed('-i', /PDFJSSCRIPT_MOZ_CENTRAL/, 'true',
      MOZCENTRAL_CONTENT_DIR + 'PdfStreamConverter.jsm');
  sed('-i', /PDFJSSCRIPT_PREF_PREFIX/, MOZCENTRAL_PREF_PREFIX,
      MOZCENTRAL_CONTENT_DIR + 'PdfjsChromeUtils.jsm');
};

//
// make chrome
//
target.chromium = function() {
  target.locale();

  cd(ROOT_DIR);
  echo();
  echo('### Building Chromium extension');
  var defines = builder.merge(DEFINES, {CHROME: true});

  var CHROME_BUILD_DIR = BUILD_DIR + '/chromium/',
      CHROME_BUILD_CONTENT_DIR = CHROME_BUILD_DIR + '/content/';

  execGulp('bundle-chromium');
  cd(ROOT_DIR);

  // Clear out everything in the chrome extension build directory
  rm('-Rf', CHROME_BUILD_DIR);
  mkdir('-p', CHROME_BUILD_CONTENT_DIR);
  mkdir('-p', CHROME_BUILD_CONTENT_DIR + BUILD_DIR);
  mkdir('-p', CHROME_BUILD_CONTENT_DIR + '/web');

  var setup = {
    defines: defines,
    copy: [
      [BUILD_TARGETS, CHROME_BUILD_CONTENT_DIR + BUILD_DIR],
      [BUILD_DIR + 'viewer.js', CHROME_BUILD_CONTENT_DIR + '/web'],
      [COMMON_WEB_FILES, CHROME_BUILD_CONTENT_DIR + '/web'],
      [['extensions/chromium/*.json',
        'extensions/chromium/*.html',
        'extensions/chromium/*.js',
        'extensions/chromium/*.css',
        'extensions/chromium/icon*.png',],
       CHROME_BUILD_DIR],
      ['extensions/chromium/pageAction/*.*', CHROME_BUILD_DIR + '/pageAction'],
      ['extensions/chromium/options/*.*', CHROME_BUILD_DIR + '/options'],
      ['external/webL10n/l10n.js', CHROME_BUILD_CONTENT_DIR + '/web'],
      ['external/bcmaps/*', CHROME_BUILD_CONTENT_DIR + '/web/cmaps'],
      ['web/locale', CHROME_BUILD_CONTENT_DIR + '/web']
    ],
    preprocess: [
      [COMMON_WEB_FILES_PREPROCESS, CHROME_BUILD_CONTENT_DIR + '/web']
    ],
    preprocessCSS: [
      ['chrome', 'web/viewer.css',
       CHROME_BUILD_CONTENT_DIR + '/web/viewer.css']
    ]
  };
  builder.build(setup);

  cleanupJSSource(CHROME_BUILD_CONTENT_DIR + '/web/viewer.js');
  cleanupCSSSource(CHROME_BUILD_CONTENT_DIR + '/web/viewer.css');

  // Update the build version number
  var VERSION = getCurrentVersion();
  sed('-i', /PDFJSSCRIPT_VERSION/, VERSION,
      CHROME_BUILD_DIR + '/manifest.json');

  // Allow PDF.js resources to be loaded by adding the files to
  // the "web_accessible_resources" section.
  var file_list = ls('-RA', CHROME_BUILD_CONTENT_DIR);
  var public_chrome_files = file_list.reduce(function(war, file) {
    // Exclude directories (naive: Exclude paths without dot)
    if (file.indexOf('.') !== -1) {
      // Only add a comma after the first file
      if (war) {
        war += ',\n';
      }
      war += JSON.stringify('content/' + file);
    }
    return war;
  }, '');
  sed('-i', /"content\/\*"/, public_chrome_files,
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
    echo('Copy and adjust the example in test/resources/browser_manifests.');
    exit(1);
  }

  var manifest;
  try {
    manifest = JSON.parse(cat(browserManifest));
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


////////////////////////////////////////////////////////////////////////////////
//
// Test stuff
//

//
// make test
//
target.test = function() {
  execGulp('test');
};

//
// make bottest
// (Special tests for the Github bot)
//
target.bottest = function() {
  execGulp('bottest');
};

//
// make browsertest
//
target.browsertest = function(options) {
  if (options && options.noreftest) {
    execGulp('browsertest-noreftest');
  } else {
    execGulp('browsertest');
  }
};

//
// make unittest
//
target.unittest = function(options, callback) {
  execGulp('unittest');
};

//
// make fonttest
//
target.fonttest = function(options, callback) {
  execGulp('fonttest');
};

//
// make botmakeref
//
target.botmakeref = function() {
  execGulp('botmakeref');
};

////////////////////////////////////////////////////////////////////////////////
//
// Baseline operation
//
target.baseline = function() {
  cd(ROOT_DIR);

  echo();
  echo('### Creating baseline environment');

  var baselineCommit = env['BASELINE'];
  if (!baselineCommit) {
    echo('Baseline commit is not provided. Please specify BASELINE variable');
    exit(1);
  }

  if (!test('-d', BUILD_DIR)) {
    mkdir(BUILD_DIR);
  }

  var BASELINE_DIR = BUILD_DIR + 'baseline';
  if (test('-d', BASELINE_DIR)) {
    cd(BASELINE_DIR);
    exec('git fetch origin');
  } else {
    cd(BUILD_DIR);
    exec('git clone .. baseline');
    cd(ROOT_DIR + BASELINE_DIR);
  }
  exec('git checkout ' + baselineCommit);
};

target.mozcentralbaseline = function() {
  target.baseline();

  cd(ROOT_DIR);

  echo();
  echo('### Creating mozcentral baseline environment');

  var BASELINE_DIR = BUILD_DIR + 'baseline';
  var MOZCENTRAL_BASELINE_DIR = BUILD_DIR + 'mozcentral.baseline';
  if (test('-d', MOZCENTRAL_BASELINE_DIR)) {
    rm('-rf', MOZCENTRAL_BASELINE_DIR);
  }

  cd(BASELINE_DIR);
  if (test('-d', 'build')) {
    rm('-rf', 'build');
  }
  exec('node make mozcentral');

  cd(ROOT_DIR);
  mkdir(MOZCENTRAL_BASELINE_DIR);
  cp('-Rf', BASELINE_DIR + '/build/mozcentral/*', MOZCENTRAL_BASELINE_DIR);
  // fixing baseline
  if (test('-f', MOZCENTRAL_BASELINE_DIR +
                 '/browser/extensions/pdfjs/PdfStreamConverter.js')) {
    rm(MOZCENTRAL_BASELINE_DIR +
       '/browser/extensions/pdfjs/PdfStreamConverter.js');
  }

  cd(MOZCENTRAL_BASELINE_DIR);
  exec('git init');
  exec('git add .');
  exec('git commit -m "mozcentral baseline"');
};

target.mozcentraldiff = function() {
  target.mozcentral();

  cd(ROOT_DIR);

  echo();
  echo('### Creating mozcentral diff');

  var MOZCENTRAL_DIFF = BUILD_DIR + 'mozcentral.diff';
  if (test('-f', MOZCENTRAL_DIFF)) {
    rm(MOZCENTRAL_DIFF);
  }

  var MOZCENTRAL_BASELINE_DIR = BUILD_DIR + 'mozcentral.baseline';
  if (!test('-d', MOZCENTRAL_BASELINE_DIR)) {
    echo('mozcentral baseline was not found');
    echo('Please build one using "gulp mozcentralbaseline"');
    exit(1);
  }
  cd(MOZCENTRAL_BASELINE_DIR);
  exec('git reset --hard');
  cd(ROOT_DIR); rm('-rf', MOZCENTRAL_BASELINE_DIR + '/*'); // trying to be safe
  cd(MOZCENTRAL_BASELINE_DIR);
  cp('-Rf', '../mozcentral/*', '.');
  exec('git add -A');
  exec('git diff --binary --cached --unified=8', {silent: true}).output.
    to('../mozcentral.diff');

  echo('Result diff can be found at ' + MOZCENTRAL_DIFF);
};

target.mozcentralcheck = function() {
  cd(ROOT_DIR);

  echo();
  echo('### Checking mozcentral changes');

  var mcPath = env['MC_PATH'];
  if (!mcPath) {
    echo('mozilla-central path is not provided.');
    echo('Please specify MC_PATH variable');
    exit(1);
  }
  if ((mcPath[0] !== '/' && mcPath[0] !== '~' && mcPath[1] !== ':') ||
      !test('-d', mcPath)) {
    echo('mozilla-central path is not in absolute form or does not exist.');
    exit(1);
  }

  var MOZCENTRAL_DIFF = BUILD_DIR + 'mozcentral_changes.diff';
  if (test('-f', MOZCENTRAL_DIFF)) {
    rm(MOZCENTRAL_DIFF);
  }

  var MOZCENTRAL_BASELINE_DIR = BUILD_DIR + 'mozcentral.baseline';
  if (!test('-d', MOZCENTRAL_BASELINE_DIR)) {
    echo('mozcentral baseline was not found');
    echo('Please build one using "gulp mozcentralbaseline"');
    exit(1);
  }
  cd(MOZCENTRAL_BASELINE_DIR);
  exec('git reset --hard');
  cd(ROOT_DIR); rm('-rf', MOZCENTRAL_BASELINE_DIR + '/*'); // trying to be safe
  cd(MOZCENTRAL_BASELINE_DIR);
  mkdir('browser');
  cd('browser');
  mkdir('-p', 'extensions/pdfjs');
  cp('-Rf', mcPath + '/browser/extensions/pdfjs/*', 'extensions/pdfjs');
  mkdir('-p', 'locales/en-US/pdfviewer');
  cp('-Rf', mcPath + '/browser/locales/en-US/pdfviewer/*',
     'locales/en-US/pdfviewer');
  // Remove '.DS_Store' and other hidden files
  find('.').forEach(function(file) {
    if (file.match(/^\.\w|~$/)) {
      rm('-f', file);
    }
  });

  cd('..');
  exec('git add -A');
  var diff = exec('git diff --binary --cached --unified=8',
                  {silent: true}).output;

  if (diff) {
    echo('There were changes found at mozilla-central.');
    diff.to('../mozcentral_changes.diff');
    echo('Result diff can be found at ' + MOZCENTRAL_DIFF);
    exit(1);
  }

  echo('Success: there are no changes at mozilla-central');
};


////////////////////////////////////////////////////////////////////////////////
//
// Other
//

//
// make server
//
target.server = function () {
  execGulp('server');
};

//
// make lint
//
target.lint = function() {
  execGulp('lint');
};

//
// make clean
//
target.clean = function() {
  execGulp('clean');
};

//
// make makefile
//
target.makefile = function () {
  execGulp('makefile');
};

//
//make importl10n
//
target.importl10n = function() {
  execGulp('importl10n');
};

exports.stripCommentHeaders = stripCommentHeaders;
exports.builder = builder;
