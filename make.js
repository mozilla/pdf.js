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
/* eslint-env node, shelljs */

'use strict';

try {
  require('shelljs/make');
} catch (e) {
  console.log('ShellJS is not installed. Run "npm install" to install ' +
              'all dependencies.');
  return;
}

var fs = require('fs');

var CONFIG_FILE = 'pdfjs.config';
var config = JSON.parse(fs.readFileSync(CONFIG_FILE));

var ROOT_DIR = __dirname + '/', // absolute path to project's root
    BUILD_DIR = 'build/',
    SRC_DIR = 'src/',
    FIREFOX_BUILD_DIR = BUILD_DIR + '/firefox/',
    CHROME_BUILD_DIR = BUILD_DIR + '/chromium/',
    JSDOC_DIR = BUILD_DIR + 'jsdoc',
    EXTENSION_SRC_DIR = 'extensions/',
    GH_PAGES_DIR = BUILD_DIR + 'gh-pages/',
    GENERIC_DIR = BUILD_DIR + 'generic/',
    MINIFIED_DIR = BUILD_DIR + 'minified/',
    DIST_DIR = BUILD_DIR + 'dist/',
    SINGLE_FILE_DIR = BUILD_DIR + 'singlefile/',
    COMPONENTS_DIR = BUILD_DIR + 'components/',
    LIB_DIR = BUILD_DIR + 'lib/',
    REPO = 'git@github.com:mozilla/pdf.js.git';

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

//
// make generic
// Builds the generic production viewer that should be compatible with most
// modern HTML5 browsers.
//
target.generic = function() {
  execGulp('generic');
};

target.components = function() {
  execGulp('components');
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
  execGulp('web-pre');

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
  execGulp('dist-pre');

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
  cp(MINIFIED_DIR + 'build/pdf.js', DIST_DIR + 'build/pdf.min.js');
  cp(MINIFIED_DIR + 'build/pdf.worker.js',
     DIST_DIR + 'build/pdf.worker.min.js');

  mkdir('-p', DIST_DIR + 'web/');
  cp('-R', [
    COMPONENTS_DIR + '*',
  ], DIST_DIR + 'web/');

  cp('-R', LIB_DIR, DIST_DIR + 'lib/');

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
      'node-ensure': '^0.0.0', // shim for node for require.ensure
      'worker-loader': '^0.7.1', // used in external/dist/webpack.json
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
  execGulp('locale');
};

//
// make cmaps
// Compresses cmap files. Ensure that Adobe cmap download and uncompressed at
// ./external/cmaps location.
//
target.cmaps = function () {
  execGulp('cmaps');
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
  execGulp('singlefile');
};

//
// make minified
// Builds the minified production viewer that should be compatible with most
// modern HTML5 browsers.
//
target.minified = function() {
  execGulp('minified');
};

target.minifiedpost = function () {
  var viewerFiles = [
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
  execGulp('firefox');
};

//
// make mozcentral
//
target.mozcentral = function() {
  execGulp('mozcentral');
};

//
// make chrome
//
target.chromium = function() {
  execGulp('chromium');
};

target.signchromium = function () {
  cd(ROOT_DIR);

  var CHROME_BUILD_DIR = BUILD_DIR + '/chromium/';

  // Bundle the files to a Chrome extension file .crx if path to key is set
  var pem = env['PDFJS_CHROME_KEY'];
  if (!pem) {
    echo('The PDFJS_CHROME_KEY must be specified.');
    exit(1);
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
  execGulp('baseline');
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
// make importl10n
//
target.importl10n = function() {
  execGulp('importl10n');
};
