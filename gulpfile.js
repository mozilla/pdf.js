/* Copyright 2016 Mozilla Foundation
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
/* eslint-env node */
/* globals target */

'use strict';

var fs = require('fs');
var gulp = require('gulp');
var gutil = require('gulp-util');
var mkdirp = require('mkdirp');
var rimraf = require('rimraf');
var runSequence = require('run-sequence');
var stream = require('stream');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var streamqueue = require('streamqueue');
var zip = require('gulp-zip');

var BUILD_DIR = 'build/';
var JSDOC_DIR = 'jsdoc/';
var L10N_DIR = 'l10n/';
var TEST_DIR = 'test/';

var makeFile = require('./make.js');
var stripCommentHeaders = makeFile.stripCommentHeaders;
var builder = makeFile.builder;

var CONFIG_FILE = 'pdfjs.config';
var config = JSON.parse(fs.readFileSync(CONFIG_FILE).toString());

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

function createStringSource(filename, content) {
  var source = stream.Readable({ objectMode: true });
  source._read = function () {
    this.push(new gutil.File({
      cwd: '',
      base: '',
      path: filename,
      contents: new Buffer(content)
    }));
    this.push(null);
  };
  return source;
}

function stripUMDHeaders(content) {
  var reg = new RegExp(
    'if \\(typeof define === \'function\' && define.amd\\) \\{[^}]*' +
    '\\} else if \\(typeof exports !== \'undefined\'\\) \\{[^}]*' +
    '\\} else ', 'g');
  return content.replace(reg, '');
}

function checkChromePreferencesFile(chromePrefsPath, webPrefsPath) {
  var chromePrefs = JSON.parse(fs.readFileSync(chromePrefsPath).toString());
  var chromePrefsKeys = Object.keys(chromePrefs.properties);
  chromePrefsKeys.sort();
  var webPrefs = JSON.parse(fs.readFileSync(webPrefsPath).toString());
  var webPrefsKeys = Object.keys(webPrefs);
  webPrefsKeys.sort();
  var telemetryIndex = chromePrefsKeys.indexOf('disableTelemetry');
  if (telemetryIndex >= 0) {
    chromePrefsKeys.splice(telemetryIndex, 1);
  } else {
    console.log('Warning: disableTelemetry key not found in chrome prefs!');
    return false;
  }
  if (webPrefsKeys.length !== chromePrefsKeys.length) {
    return false;
  }
  return webPrefsKeys.every(function (value, index) {
    return chromePrefsKeys[index] === value &&
           chromePrefs.properties[value].default === webPrefs[value];
  });
}

function bundle(filename, outfilename, pathPrefix, initFiles, amdName, defines,
                isMainFile, versionInfo) {
  // Reading UMD headers and building loading orders of modules. The
  // readDependencies returns AMD module names: removing 'pdfjs' prefix and
  // adding '.js' extensions to the name.
  var umd = require('./external/umdutils/verifier.js');
  initFiles = initFiles.map(function (p) { return pathPrefix + p; });
  var files = umd.readDependencies(initFiles).loadOrder.map(function (name) {
    return pathPrefix + name.replace(/^[\w\-]+\//, '') + '.js';
  });

  var crlfchecker = require('./external/crlfchecker/crlfchecker.js');
  crlfchecker.checkIfCrlfIsPresent(files);

  var bundleContent = files.map(function (file) {
    var content = fs.readFileSync(file);

    // Prepend a newline because stripCommentHeaders only strips comments that
    // follow a line feed. The file where bundleContent is inserted already
    // contains a license header, so the header of bundleContent can be removed.
    content = stripCommentHeaders('\n' + content);

    // Removes AMD and CommonJS branches from UMD headers.
    content = stripUMDHeaders(content);

    return content;
  }).join('');

  var jsName = amdName.replace(/[\-_\.\/]\w/g, function (all) {
    return all[1].toUpperCase();
  });

  var p2 = require('./external/builder/preprocessor2.js');
  var ctx = {
    rootPath: __dirname,
    saveComments: 'copyright',
    defines: builder.merge(defines, {
      BUNDLE_VERSION: versionInfo.version,
      BUNDLE_BUILD: versionInfo.commit,
      BUNDLE_AMD_NAME: amdName,
      BUNDLE_JS_NAME: jsName,
      MAIN_FILE: isMainFile
    })
  };

  var templateContent = fs.readFileSync(filename).toString();
  templateContent = templateContent.replace(
    /\/\/#expand\s+__BUNDLE__\s*\n/, function (all) { return bundleContent; });
  bundleContent = null;

  templateContent = p2.preprocessPDFJSCode(ctx, templateContent);
  fs.writeFileSync(outfilename, templateContent);
  templateContent = null;
}

function createBundle(defines) {
  var versionJSON = JSON.parse(
    fs.readFileSync(BUILD_DIR + 'version.json').toString());

  console.log();
  console.log('### Bundling files into pdf.js');

  var mainFiles = [
    'display/global.js'
  ];

  var workerFiles = [
    'core/worker.js'
  ];

  var mainAMDName = 'pdfjs-dist/build/pdf';
  var workerAMDName = 'pdfjs-dist/build/pdf.worker';
  var mainOutputName = 'pdf.js';
  var workerOutputName = 'pdf.worker.js';

  // Extension does not need network.js file.
  if (!defines.FIREFOX && !defines.MOZCENTRAL) {
    workerFiles.push('core/network.js');
  }

  if (defines.SINGLE_FILE) {
    // In singlefile mode, all of the src files will be bundled into
    // the main pdf.js output.
    mainFiles = mainFiles.concat(workerFiles);
    workerFiles = null; // no need for worker file
    mainAMDName = 'pdfjs-dist/build/pdf.combined';
    workerAMDName = null;
    mainOutputName = 'pdf.combined.js';
    workerOutputName = null;
  }

  var state = 'mainfile';
  var source = stream.Readable({ objectMode: true });
  source._read = function () {
    var tmpFile;
    switch (state) {
      case 'mainfile':
        // 'buildnumber' shall create BUILD_DIR for us
        tmpFile = BUILD_DIR + '~' + mainOutputName + '.tmp';
        bundle('src/pdf.js', tmpFile, 'src/', mainFiles, mainAMDName,
          defines, true, versionJSON);
        this.push(new gutil.File({
          cwd: '',
          base: '',
          path: mainOutputName,
          contents: fs.readFileSync(tmpFile)
        }));
        fs.unlinkSync(tmpFile);
        state = workerFiles ? 'workerfile' : 'stop';
        break;
      case 'workerfile':
        // 'buildnumber' shall create BUILD_DIR for us
        tmpFile = BUILD_DIR + '~' + workerOutputName + '.tmp';
        bundle('src/pdf.js', tmpFile, 'src/', workerFiles, workerAMDName,
          defines, false, versionJSON);
        this.push(new gutil.File({
          cwd: '',
          base: '',
          path: workerOutputName,
          contents: fs.readFileSync(tmpFile)
        }));
        fs.unlinkSync(tmpFile);
        state = 'stop';
        break;
      case 'stop':
        this.push(null);
        break;
    }
  };
  return source;
}

function createWebBundle(defines) {
  var versionJSON = JSON.parse(
    fs.readFileSync(BUILD_DIR + 'version.json').toString());

  var template, files, outputName, amdName;
  if (defines.COMPONENTS) {
    amdName = 'pdfjs-dist/web/pdf_viewer';
    template = 'web/pdf_viewer.component.js';
    files = [
      'pdf_viewer.js',
      'pdf_history.js',
      'pdf_find_controller.js',
      'download_manager.js'
    ];
    outputName = 'pdf_viewer.js';
  } else {
    amdName = 'pdfjs-dist/web/viewer';
    outputName = 'viewer.js';
    template = 'web/viewer.js';
    files = ['app.js'];
    if (defines.FIREFOX || defines.MOZCENTRAL) {
      files.push('firefoxcom.js', 'firefox_print_service.js');
    } else if (defines.CHROME) {
      files.push('chromecom.js', 'pdf_print_service.js');
    } else if (defines.GENERIC) {
      files.push('pdf_print_service.js');
    }
  }

  var source = stream.Readable({ objectMode: true });
  source._read = function () {
    // 'buildnumber' shall create BUILD_DIR for us
    var tmpFile = BUILD_DIR + '~' + outputName + '.tmp';
    bundle(template, tmpFile, 'web/', files, amdName, defines, false,
      versionJSON);
    this.push(new gutil.File({
      cwd: '',
      base: '',
      path: outputName,
      contents: fs.readFileSync(tmpFile)
    }));
    fs.unlinkSync(tmpFile);
    this.push(null);
  };
  return source;
}

function checkFile(path) {
  try {
    var stat = fs.lstatSync(path);
    return stat.isFile();
  } catch (e) {
    return false;
  }
}

function createTestSource(testsName) {
  var source = stream.Readable({ objectMode: true });
  source._read = function () {
    console.log();
    console.log('### Running ' + testsName + ' tests');

    var PDF_TEST = process.env['PDF_TEST'] || 'test_manifest.json';
    var PDF_BROWSERS = process.env['PDF_BROWSERS'] ||
      'resources/browser_manifests/browser_manifest.json';

    if (!checkFile('test/' + PDF_BROWSERS)) {
      console.log('Browser manifest file test/' + PDF_BROWSERS +
                  ' does not exist.');
      console.log('Copy and adjust the example in ' +
                  'test/resources/browser_manifests.');
      this.emit('error', new Error('Missing manifest file'));
      return null;
    }

    var args = ['test.js'];
    switch (testsName) {
      case 'browser':
        args.push('--reftest', '--manifestFile=' + PDF_TEST);
        break;
      case 'browser (no reftest)':
        args.push('--manifestFile=' + PDF_TEST);
        break;
      case 'unit':
        args.push('--unitTest');
        break;
      case 'font':
        args.push('--fontTest');
        break;
      default:
        this.emit('error', new Error('Unknown name: ' + testsName));
        return null;
    }
    args.push('--browserManifestFile=' + PDF_BROWSERS);

    var testProcess = spawn('node', args, {cwd: TEST_DIR, stdio: 'inherit'});
    testProcess.on('close', function (code) {
      source.push(null);
    });
  };
  return source;
}

gulp.task('default', function() {
  console.log('Available tasks:');
  var tasks = Object.keys(gulp.tasks);
  tasks.sort();
  tasks.forEach(function (taskName) {
    console.log('  ' + taskName);
  });
});

gulp.task('extension', function (done) {
  console.log();
  console.log('### Building extensions');

  runSequence('locale', 'firefox', 'chromium', done);
});

gulp.task('buildnumber', function (done) {
  console.log();
  console.log('### Getting extension build number');

  exec('git log --format=oneline ' + config.baseVersion + '..',
      function (err, stdout, stderr) {
    var buildNumber = 0;
    if (!err) {
      // Build number is the number of commits since base version
      buildNumber = stdout ? stdout.match(/\n/g).length : 0;
    }

    console.log('Extension build number: ' + buildNumber);

    var version = config.versionPrefix + buildNumber;

    exec('git log --format="%h" -n 1', function (err, stdout, stderr) {
      var buildCommit = '';
      if (!err) {
        buildCommit = stdout.replace('\n', '');
      }

      createStringSource('version.json', JSON.stringify({
        version: version,
        build: buildNumber,
        commit: buildCommit
      }, null, 2))
        .pipe(gulp.dest(BUILD_DIR))
        .on('end', done);
    });
  });
});

gulp.task('bundle-firefox', ['buildnumber'], function () {
  var defines = builder.merge(DEFINES, {FIREFOX: true});
  return streamqueue({ objectMode: true },
    createBundle(defines), createWebBundle(defines))
    .pipe(gulp.dest(BUILD_DIR));
});

gulp.task('bundle-mozcentral', ['buildnumber'], function () {
  var defines = builder.merge(DEFINES, {MOZCENTRAL: true});
  return streamqueue({ objectMode: true },
    createBundle(defines), createWebBundle(defines))
    .pipe(gulp.dest(BUILD_DIR));
});

gulp.task('bundle-chromium', ['buildnumber'], function () {
  var defines = builder.merge(DEFINES, {CHROME: true});
  return streamqueue({ objectMode: true },
    createBundle(defines), createWebBundle(defines))
    .pipe(gulp.dest(BUILD_DIR));
});

gulp.task('bundle-singlefile', ['buildnumber'], function () {
  var defines = builder.merge(DEFINES, {SINGLE_FILE: true});
  return createBundle(defines).pipe(gulp.dest(BUILD_DIR));
});

gulp.task('bundle-generic', ['buildnumber'], function () {
  var defines = builder.merge(DEFINES, {GENERIC: true});
  return streamqueue({ objectMode: true },
    createBundle(defines), createWebBundle(defines))
    .pipe(gulp.dest(BUILD_DIR));
});

gulp.task('bundle-minified', ['buildnumber'], function () {
  var defines = builder.merge(DEFINES, {MINIFIED: true, GENERIC: true});
  return streamqueue({ objectMode: true },
    createBundle(defines), createWebBundle(defines))
    .pipe(gulp.dest(BUILD_DIR));
});

gulp.task('bundle-components', ['buildnumber'], function () {
  var defines = builder.merge(DEFINES, {COMPONENTS: true, GENERIC: true});
  return createWebBundle(defines).pipe(gulp.dest(BUILD_DIR));
});

gulp.task('bundle', ['buildnumber'], function () {
  return createBundle(DEFINES).pipe(gulp.dest(BUILD_DIR));
});

gulp.task('jsdoc', function (done) {
  console.log();
  console.log('### Generating documentation (JSDoc)');

  var JSDOC_FILES = [
    'src/doc_helper.js',
    'src/display/api.js',
    'src/display/global.js',
    'src/shared/util.js',
    'src/core/annotation.js'
  ];

  var directory = BUILD_DIR + JSDOC_DIR;
  rimraf(directory, function () {
    mkdirp(directory, function () {
      var command = '"node_modules/.bin/jsdoc" -d ' + directory + ' ' +
                    JSDOC_FILES.join(' ');
      exec(command, done);
    });
  });
});

gulp.task('publish', ['generic'], function (done) {
  var version = JSON.parse(
    fs.readFileSync(BUILD_DIR + 'version.json').toString()).version;

  config.stableVersion = config.betaVersion;
  config.betaVersion = version;

  createStringSource(CONFIG_FILE, JSON.stringify(config, null, 2))
    .pipe(gulp.dest('.'))
    .on('end', function () {
      var targetName = 'pdfjs-' + version + '-dist.zip';
      gulp.src(BUILD_DIR + 'generic/**')
        .pipe(zip(targetName))
        .pipe(gulp.dest(BUILD_DIR))
        .on('end', function () {
          console.log('Built distribution file: ' + targetName);
          done();
        });
    });
});

gulp.task('test', function () {
  return streamqueue({ objectMode: true },
    createTestSource('unit'), createTestSource('browser'));
});

gulp.task('bottest', function () {
  return streamqueue({ objectMode: true },
    createTestSource('unit'), createTestSource('font'),
    createTestSource('browser (no reftest)'));
});

gulp.task('browsertest', function () {
  return createTestSource('browser');
});

gulp.task('browsertest-noreftest', function () {
  return createTestSource('browser (no reftest)');
});

gulp.task('unittest', function () {
  return createTestSource('unit');
});

gulp.task('fonttest', function () {
  return createTestSource('font');
});

gulp.task('botmakeref', function (done) {
  console.log();
  console.log('### Creating reference images');

  var PDF_BROWSERS = process.env['PDF_BROWSERS'] ||
    'resources/browser_manifests/browser_manifest.json';

  if (!checkFile('test/' + PDF_BROWSERS)) {
    console.log('Browser manifest file test/' + PDF_BROWSERS +
      ' does not exist.');
    console.log('Copy and adjust the example in ' +
      'test/resources/browser_manifests.');
    done(new Error('Missing manifest file'));
    return;
  }

  var args = ['test.js', '--masterMode', '--noPrompts',
              '--browserManifestFile=' + PDF_BROWSERS];
  var testProcess = spawn('node', args, {cwd: TEST_DIR, stdio: 'inherit'});
  testProcess.on('close', function (code) {
    done();
  });
});

gulp.task('lint', function (done) {
  console.log();
  console.log('### Linting JS files');

  // Ensure that we lint the Firefox specific *.jsm files too.
  var options = ['node_modules/eslint/bin/eslint', '--ext', '.js,.jsm', '.'];
  var esLintProcess = spawn('node', options, {stdio: 'inherit'});
  esLintProcess.on('close', function (code) {
    if (code !== 0) {
      done(new Error('ESLint failed.'));
      return;
    }

    console.log();
    console.log('### Checking UMD dependencies');
    var umd = require('./external/umdutils/verifier.js');
    var paths = {
      'pdfjs': './src',
      'pdfjs-web': './web',
      'pdfjs-test': './test'
    };
    if (!umd.validateFiles(paths)) {
      done(new Error('UMD check failed.'));
      return;
    }

    console.log();
    console.log('### Checking supplemental files');

    if (!checkChromePreferencesFile(
          'extensions/chromium/preferences_schema.json',
          'web/default_preferences.json')) {
      done(new Error('chromium/preferences_schema is not in sync.'));
      return;
    }

    console.log('files checked, no errors found');
    done();
  });
});

gulp.task('server', function (done) {
  console.log();
  console.log('### Starting local server');

  var WebServer = require('./test/webserver.js').WebServer;
  var server = new WebServer();
  server.port = 8888;
  server.start();
});

gulp.task('clean', function(callback) {
  console.log();
  console.log('### Cleaning up project builds');

  rimraf(BUILD_DIR, callback);
});

gulp.task('makefile', function () {
  var makefileContent = 'help:\n\tgulp\n\n';
  var targetsNames = [];
  for (var i in target) {
    makefileContent += i + ':\n\tgulp ' + i + '\n\n';
    targetsNames.push(i);
  }
  makefileContent += '.PHONY: ' + targetsNames.join(' ') + '\n';
  return createStringSource('Makefile', makefileContent)
    .pipe(gulp.dest('.'));
});

gulp.task('importl10n', function(done) {
  var locales = require('./external/importL10n/locales.js');

  console.log();
  console.log('### Importing translations from mozilla-aurora');

  if (!fs.existsSync(L10N_DIR)) {
    fs.mkdirSync(L10N_DIR);
  }
  locales.downloadL10n(L10N_DIR, done);
});

// Getting all shelljs registered tasks and register them with gulp
var gulpContext = false;
for (var taskName in global.target) {
  if (taskName in gulp.tasks) {
    continue;
  }

  var task = (function (shellJsTask) {
    return function () {
      gulpContext = true;
      try {
        shellJsTask.call(global.target);
      } finally {
        gulpContext = false;
      }
    };
  })(global.target[taskName]);
  gulp.task(taskName, task);
}

Object.keys(gulp.tasks).forEach(function (taskName) {
  var oldTask = global.target[taskName] || function () {
    gulp.run(taskName);
  };

  global.target[taskName] = function (args) {
    // The require('shelljs/make') import in make.js will try to execute tasks
    // listed in arguments, guarding with gulpContext
    if (gulpContext) {
      oldTask.call(global.target, args);
    }
  };
});
