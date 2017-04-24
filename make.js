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
  throw new Error('ShellJS is not installed. Run "npm install" to install ' +
                  'all dependencies.');
}

var ROOT_DIR = __dirname + '/', // absolute path to project's root
    BUILD_DIR = 'build/';

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
  execGulp('web');
};

target.dist = function() {
  execGulp('dist');
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
