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
var rename = require('gulp-rename');
var replace = require('gulp-replace');
var transform = require('gulp-transform');
var mkdirp = require('mkdirp');
var path = require('path');
var rimraf = require('rimraf');
var stream = require('stream');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var spawnSync = require('child_process').spawnSync;
var streamqueue = require('streamqueue');
var merge = require('merge-stream');
var zip = require('gulp-zip');
var webpack2 = require('webpack');
var webpackStream = require('webpack-stream');
var vinyl = require('vinyl-fs');

var BUILD_DIR = 'build/';
var L10N_DIR = 'l10n/';
var TEST_DIR = 'test/';
var EXTENSION_SRC_DIR = 'extensions/';

var BASELINE_DIR = BUILD_DIR + 'baseline/';
var GENERIC_DIR = BUILD_DIR + 'generic/';
var COMPONENTS_DIR = BUILD_DIR + 'components/';
var SINGLE_FILE_DIR = BUILD_DIR + 'singlefile/';
var MINIFIED_DIR = BUILD_DIR + 'minified/';
var FIREFOX_BUILD_DIR = BUILD_DIR + 'firefox/';
var CHROME_BUILD_DIR = BUILD_DIR + 'chromium/';
var JSDOC_BUILD_DIR = BUILD_DIR + 'jsdoc/';
var GH_PAGES_DIR = BUILD_DIR + 'gh-pages/';
var SRC_DIR = 'src/';
var LIB_DIR = BUILD_DIR + 'lib/';
var DIST_DIR = BUILD_DIR + 'dist/';
var COMMON_WEB_FILES = [
  'web/images/*.{png,svg,gif,cur}',
  'web/debugger.js'
];

var REPO = 'git@github.com:mozilla/pdf.js.git';
var DIST_REPO_URL = 'https://github.com/mozilla/pdfjs-dist';

var builder = require('./external/builder/builder.js');

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
  COMPONENTS: false,
  LIB: false,
  PDFJS_NEXT: false,
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

function createWebpackConfig(defines, output) {
  var path = require('path');
  var BlockRequirePlugin = require('./external/webpack/block-require.js');

  var versionInfo = getVersionJSON();
  var bundleDefines = builder.merge(defines, {
    BUNDLE_VERSION: versionInfo.version,
    BUNDLE_BUILD: versionInfo.commit
  });
  var licenseHeader = fs.readFileSync('./src/license_header.js').toString();

  return {
    output: output,
    plugins: [
      new webpack2.BannerPlugin({banner: licenseHeader, raw: true}),
      new BlockRequirePlugin()
    ],
    resolve: {
      alias: {
        'pdfjs': path.join(__dirname, 'src'),
        'pdfjs-web': path.join(__dirname, 'web'),
      }
    },
    module: {
      loaders: [
        {
          loader: 'babel-loader',
          exclude: /src\/core\/(glyphlist|unicode)/, // babel is too slow
          options: {
            presets: bundleDefines.PDFJS_NEXT ? undefined : ['es2015'],
            plugins: ['transform-es2015-modules-commonjs']
          }
        },
        {
          loader: path.join(__dirname, 'external/webpack/pdfjsdev-loader.js'),
          options: {
            rootPath: __dirname,
            saveComments: false,
            defines: bundleDefines
          }
        },
      ]
    }
  };
}

function webpack2Stream(config) {
  // Replacing webpack1 to webpack2 in the webpack-stream.
  return webpackStream(config, webpack2);
}

function stripCommentHeaders(content) {
  var notEndOfComment = '(?:[^*]|\\*(?!/))+';
  var reg = new RegExp(
    '\n/\\* Copyright' + notEndOfComment + '\\*/\\s*' +
    '(?:/\\*' + notEndOfComment + '\\*/\\s*|//(?!#).*\n\\s*)*' +
    '\\s*\'use strict\';', 'g');
  content = content.replace(reg, '');
  return content;
}

function getVersionJSON() {
  return JSON.parse(fs.readFileSync(BUILD_DIR + 'version.json').toString());
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

function replaceWebpackRequire() {
  // Produced bundles can be rebundled again, avoid collisions (e.g. in api.js)
  // by renaming  __webpack_require__ to something else.
  return replace('__webpack_require__', '__w_pdfjs_require__');
}

function replaceJSRootName(amdName) {
  // Saving old-style JS module name.
  var jsName = amdName.replace(/[\-_\.\/]\w/g, function (all) {
    return all[1].toUpperCase();
  });
  return replace('root["' + amdName + '"] = factory()',
                 'root["' + amdName + '"] = root.' + jsName + ' = factory()');
}

function createBundle(defines) {
  console.log();
  console.log('### Bundling files into pdf.js');

  var mainAMDName = 'pdfjs-dist/build/pdf';
  var mainOutputName = 'pdf.js';
  if (defines.SINGLE_FILE) {
    mainAMDName = 'pdfjs-dist/build/pdf.combined';
    mainOutputName = 'pdf.combined.js';
  }

  var mainFileConfig = createWebpackConfig(defines, {
    filename: mainOutputName,
    library: mainAMDName,
    libraryTarget: 'umd',
    umdNamedDefine: true
  });
  var mainOutput = gulp.src('./src/pdf.js')
    .pipe(webpack2Stream(mainFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceJSRootName(mainAMDName));
  if (defines.SINGLE_FILE) {
    return mainOutput; // don't need a worker file.
  }

  var workerAMDName = 'pdfjs-dist/build/pdf.worker';
  var workerOutputName = 'pdf.worker.js';

  var workerFileConfig = createWebpackConfig(defines, {
    filename: workerOutputName,
    library: workerAMDName,
    libraryTarget: 'umd',
    umdNamedDefine: true
  });
  var workerOutput = gulp.src('./src/pdf.worker.js')
    .pipe(webpack2Stream(workerFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceJSRootName(workerAMDName));
  return merge([mainOutput, workerOutput]);
}

function createWebBundle(defines) {
  var viewerOutputName = 'viewer.js';

  var viewerFileConfig = createWebpackConfig(defines, {
    filename: viewerOutputName
  });
  return gulp.src('./web/viewer.js')
             .pipe(webpack2Stream(viewerFileConfig));
}

function createComponentsBundle(defines) {
  var componentsAMDName = 'pdfjs-dist/web/pdf_viewer';
  var componentsOutputName = 'pdf_viewer.js';

  var componentsFileConfig = createWebpackConfig(defines, {
    filename: componentsOutputName,
    library: componentsAMDName,
    libraryTarget: 'umd',
    umdNamedDefine: true
  });
  return gulp.src('./web/pdf_viewer.component.js')
    .pipe(webpack2Stream(componentsFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceJSRootName(componentsAMDName));
}

function createCompatibilityBundle(defines) {
  var compatibilityAMDName = 'pdfjs-dist/web/compatibility';
  var compatibilityOutputName = 'compatibility.js';

  var compatibilityFileConfig = createWebpackConfig(defines, {
    filename: compatibilityOutputName,
    library: compatibilityAMDName,
    libraryTarget: 'umd',
    umdNamedDefine: true
  });
  return gulp.src('./web/compatibility.js')
    .pipe(webpack2Stream(compatibilityFileConfig));
}

function checkFile(path) {
  try {
    var stat = fs.lstatSync(path);
    return stat.isFile();
  } catch (e) {
    return false;
  }
}

function checkDir(path) {
  try {
    var stat = fs.lstatSync(path);
    return stat.isDirectory();
  } catch (e) {
    return false;
  }
}

function replaceInFile(path, find, replacement) {
  var content = fs.readFileSync(path).toString();
  content = content.replace(find, replacement);
  fs.writeFileSync(path, content);
}

function getTempFile(prefix, suffix) {
  mkdirp.sync(BUILD_DIR + 'tmp/');
  var bytes = require('crypto').randomBytes(6).toString('hex');
  var path = BUILD_DIR + 'tmp/' + prefix + bytes + suffix;
  fs.writeFileSync(path, '');
  return path;
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

function makeRef(done, noPrompts) {
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

  var args = ['test.js', '--masterMode'];
  if (noPrompts) {
    args.push('--noPrompts');
  }
  args.push('--browserManifestFile=' + PDF_BROWSERS);
  var testProcess = spawn('node', args, {cwd: TEST_DIR, stdio: 'inherit'});
  testProcess.on('close', function (code) {
    done();
  });
}

gulp.task('default', function() {
  console.log('Available tasks:');
  var tasks = Object.keys(gulp.tasks);
  tasks.sort();
  tasks.forEach(function (taskName) {
    console.log('  ' + taskName);
  });
});

gulp.task('extension', ['firefox', 'chromium']);

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

gulp.task('locale', function () {
  var VIEWER_LOCALE_OUTPUT = 'web/locale/';
  var METADATA_OUTPUT = 'extensions/firefox/';
  var EXTENSION_LOCALE_OUTPUT = 'extensions/firefox/locale/';

  console.log();
  console.log('### Building localization files');

  rimraf.sync(EXTENSION_LOCALE_OUTPUT);
  mkdirp.sync(EXTENSION_LOCALE_OUTPUT);
  rimraf.sync(VIEWER_LOCALE_OUTPUT);
  mkdirp.sync(VIEWER_LOCALE_OUTPUT);

  var subfolders = fs.readdirSync(L10N_DIR);
  subfolders.sort();
  var metadataContent = '';
  var chromeManifestContent = '';
  var viewerOutput = '';
  var locales = [];
  for (var i = 0; i < subfolders.length; i++) {
    var locale = subfolders[i];
    var path = L10N_DIR + locale;
    if (!checkDir(path)) {
      continue;
    }
    if (!/^[a-z][a-z]([a-z])?(-[A-Z][A-Z])?$/.test(locale)) {
      console.log('Skipping invalid locale: ' + locale);
      continue;
    }

    mkdirp.sync(EXTENSION_LOCALE_OUTPUT + '/' + locale);
    mkdirp.sync(VIEWER_LOCALE_OUTPUT + '/' + locale);

    locales.push(locale);

    chromeManifestContent += 'locale  pdf.js  ' + locale + '  locale/' +
                             locale + '/\n';

    if (checkFile(path + '/viewer.properties')) {
      viewerOutput += '[' + locale + ']\n' +
                      '@import url(' + locale + '/viewer.properties)\n\n';
    }

    if (checkFile(path + '/metadata.inc')) {
      var metadata = fs.readFileSync(path + '/metadata.inc').toString();
      metadataContent += metadata;
    }
  }

  return merge([
    createStringSource('metadata.inc', metadataContent)
      .pipe(gulp.dest(METADATA_OUTPUT)),
    createStringSource('chrome.manifest.inc', chromeManifestContent)
      .pipe(gulp.dest(METADATA_OUTPUT)),
    gulp.src(L10N_DIR + '/{' + locales.join(',') + '}' +
             '/{viewer,chrome}.properties', {base: L10N_DIR})
      .pipe(gulp.dest(EXTENSION_LOCALE_OUTPUT)),

    createStringSource('locale.properties', viewerOutput)
      .pipe(gulp.dest(VIEWER_LOCALE_OUTPUT)),
    gulp.src(L10N_DIR + '/{' + locales.join(',') + '}' +
             '/viewer.properties', {base: L10N_DIR})
      .pipe(gulp.dest(VIEWER_LOCALE_OUTPUT))
  ]);
});

gulp.task('cmaps', function () {
  var CMAP_INPUT = 'external/cmaps';
  var VIEWER_CMAP_OUTPUT = 'external/bcmaps';

  console.log();
  console.log('### Building cmaps');

  // Testing a file that usually present.
  if (!checkFile(CMAP_INPUT + '/UniJIS-UCS2-H')) {
    console.log('./external/cmaps has no cmap files, download them from:');
    console.log('  https://github.com/adobe-type-tools/cmap-resources');
    throw new Error('cmap files were not found');
  }

  // Remove old bcmap files.
  fs.readdirSync(VIEWER_CMAP_OUTPUT).forEach(function (file) {
    if (/\.bcmap$/i.test(file)) {
      fs.unlinkSync(VIEWER_CMAP_OUTPUT + '/' + file);
    }
  });

  var compressCmaps =
    require('./external/cmapscompress/compress.js').compressCmaps;
  compressCmaps(CMAP_INPUT, VIEWER_CMAP_OUTPUT, true);
});

gulp.task('bundle', ['buildnumber'], function () {
  return createBundle(DEFINES).pipe(gulp.dest(BUILD_DIR));
});

function preprocessCSS(source, mode, defines, cleanup) {
  var outName = getTempFile('~preprocess', '.css');
  var setup = {
    defines: defines,
    copy: [],
    preprocess: [],
    preprocessCSS: [
      [mode, source, outName]
    ]
  };
  builder.build(setup);
  var out = fs.readFileSync(outName).toString();
  fs.unlinkSync(outName);
  if (cleanup) {
    // Strip out all license headers in the middle.
    var reg = /\n\/\* Copyright(.|\n)*?Mozilla Foundation(.|\n)*?\*\//g;
    out = out.replace(reg, '');
  }

  var i = source.lastIndexOf('/');
  return createStringSource(source.substr(i + 1), out);
}

function preprocessHTML(source, defines) {
  var outName = getTempFile('~preprocess', '.html');
  var setup = {
    defines: defines,
    copy: [],
    preprocess: [
      [source, outName]
    ],
    preprocessCSS: []
  };
  builder.build(setup);
  var out = fs.readFileSync(outName).toString();
  fs.unlinkSync(outName);

  var i = source.lastIndexOf('/');
  return createStringSource(source.substr(i + 1), out);
}

function preprocessJS(source, defines, cleanup) {
  var outName = getTempFile('~preprocess', '.js');
  var setup = {
    defines: defines,
    copy: [],
    preprocess: [
      [source, outName]
    ],
    preprocessCSS: []
  };
  builder.build(setup);
  var out = fs.readFileSync(outName).toString();
  fs.unlinkSync(outName);
  if (cleanup) {
    out = stripCommentHeaders(out);
  }

  var i = source.lastIndexOf('/');
  return createStringSource(source.substr(i + 1), out);
}

// Builds the generic production viewer that should be compatible with most
// modern HTML5 browsers.
gulp.task('generic', ['buildnumber', 'locale'], function () {
  console.log();
  console.log('### Creating generic viewer');
  var defines = builder.merge(DEFINES, {GENERIC: true});

  rimraf.sync(GENERIC_DIR);

  return merge([
    createBundle(defines).pipe(gulp.dest(GENERIC_DIR + 'build')),
    createWebBundle(defines).pipe(gulp.dest(GENERIC_DIR + 'web')),
    gulp.src(COMMON_WEB_FILES, {base: 'web/'})
        .pipe(gulp.dest(GENERIC_DIR + 'web')),
    gulp.src('LICENSE').pipe(gulp.dest(GENERIC_DIR)),
    gulp.src([
      'external/webL10n/l10n.js'
    ]).pipe(gulp.dest(GENERIC_DIR + 'web')),
    gulp.src([
      'web/locale/*/viewer.properties',
      'web/locale/locale.properties'
    ], {base: 'web/'}).pipe(gulp.dest(GENERIC_DIR + 'web')),
    gulp.src(['external/bcmaps/*.bcmap', 'external/bcmaps/LICENSE'],
             {base: 'external/bcmaps'})
        .pipe(gulp.dest(GENERIC_DIR + 'web/cmaps')),
    preprocessHTML('web/viewer.html', defines)
        .pipe(gulp.dest(GENERIC_DIR + 'web')),
    preprocessCSS('web/viewer.css', 'generic', defines, true)
        .pipe(gulp.dest(GENERIC_DIR + 'web')),

    gulp.src('web/compressed.tracemonkey-pldi-09.pdf')
        .pipe(gulp.dest(GENERIC_DIR + 'web')),
  ]);
});

gulp.task('components', ['buildnumber'], function () {
  console.log();
  console.log('### Creating generic components');
  var defines = builder.merge(DEFINES, {COMPONENTS: true, GENERIC: true});

  rimraf.sync(COMPONENTS_DIR);

  var COMPONENTS_IMAGES = [
    'web/images/annotation-*.svg',
    'web/images/loading-icon.gif',
    'web/images/shadow.png',
    'web/images/texture.png',
  ];

  return merge([
    createComponentsBundle(defines).pipe(gulp.dest(COMPONENTS_DIR)),
    createCompatibilityBundle(defines).pipe(gulp.dest(COMPONENTS_DIR)),
    gulp.src(COMPONENTS_IMAGES).pipe(gulp.dest(COMPONENTS_DIR + 'images')),
    preprocessCSS('web/pdf_viewer.css', 'components', defines, true)
        .pipe(gulp.dest(COMPONENTS_DIR)),
  ]);
});

gulp.task('singlefile', ['buildnumber'], function () {
  console.log();
  console.log('### Creating singlefile build');
  var defines = builder.merge(DEFINES, {SINGLE_FILE: true});

  var SINGLE_FILE_BUILD_DIR = SINGLE_FILE_DIR + 'build/';

  rimraf.sync(SINGLE_FILE_DIR);

  return createBundle(defines).pipe(gulp.dest(SINGLE_FILE_BUILD_DIR));
});

gulp.task('minified-pre', ['buildnumber', 'locale'], function () {
  console.log();
  console.log('### Creating minified viewer');
  var defines = builder.merge(DEFINES, {MINIFIED: true, GENERIC: true});

  rimraf.sync(MINIFIED_DIR);

  return merge([
    createBundle(defines).pipe(gulp.dest(MINIFIED_DIR + 'build')),
    createWebBundle(defines).pipe(gulp.dest(MINIFIED_DIR + 'web')),
    gulp.src(COMMON_WEB_FILES, {base: 'web/'})
        .pipe(gulp.dest(MINIFIED_DIR + 'web')),
    gulp.src([
      'web/locale/*/viewer.properties',
      'web/locale/locale.properties'
    ], {base: 'web/'}).pipe(gulp.dest(MINIFIED_DIR + 'web')),
    gulp.src(['external/bcmaps/*.bcmap', 'external/bcmaps/LICENSE'],
             {base: 'external/bcmaps'})
        .pipe(gulp.dest(MINIFIED_DIR + 'web/cmaps')),

    preprocessHTML('web/viewer.html', defines)
        .pipe(gulp.dest(MINIFIED_DIR + 'web')),
    preprocessCSS('web/viewer.css', 'minified', defines, true)
        .pipe(gulp.dest(MINIFIED_DIR + 'web')),

    gulp.src('web/compressed.tracemonkey-pldi-09.pdf')
        .pipe(gulp.dest(MINIFIED_DIR + 'web')),
  ]);
});

gulp.task('minified-post', ['minified-pre'], function () {
  var viewerFiles = [
    'external/webL10n/l10n.js',
    MINIFIED_DIR + BUILD_DIR + 'pdf.js',
    MINIFIED_DIR + '/web/viewer.js'
  ];

  console.log();
  console.log('### Minifying js files');

  var UglifyJS = require('uglify-js');
  // V8 chokes on very long sequences. Works around that.
  var optsForHugeFile = {compress: {sequences: false}};

  UglifyJS.minify(viewerFiles).code
    .to(MINIFIED_DIR + '/web/pdf.viewer.js');
  UglifyJS.minify(MINIFIED_DIR + '/build/pdf.js').code
    .to(MINIFIED_DIR + '/build/pdf.min.js');
  UglifyJS.minify(MINIFIED_DIR + '/build/pdf.worker.js', optsForHugeFile).code
    .to(MINIFIED_DIR + '/build/pdf.worker.min.js');

  console.log();
  console.log('### Cleaning js files');

  fs.unlinkSync(MINIFIED_DIR + '/web/viewer.js');
  fs.unlinkSync(MINIFIED_DIR + '/web/debugger.js');
  fs.unlinkSync(MINIFIED_DIR + '/build/pdf.js');
  fs.unlinkSync(MINIFIED_DIR + '/build/pdf.worker.js');
  fs.renameSync(MINIFIED_DIR + '/build/pdf.min.js',
                MINIFIED_DIR + '/build/pdf.js');
  fs.renameSync(MINIFIED_DIR + '/build/pdf.worker.min.js',
                MINIFIED_DIR + '/build/pdf.worker.js');
});

gulp.task('minified', ['minified-post']);

gulp.task('firefox-pre', ['buildnumber', 'locale'], function () {
  console.log();
  console.log('### Building Firefox extension');
  var defines = builder.merge(DEFINES, { FIREFOX: true, PDFJS_NEXT: true, });

  var FIREFOX_BUILD_CONTENT_DIR = FIREFOX_BUILD_DIR + '/content/',
      FIREFOX_EXTENSION_DIR = 'extensions/firefox/',
      FIREFOX_CONTENT_DIR = EXTENSION_SRC_DIR + '/firefox/content/',
      FIREFOX_PREF_PREFIX = 'extensions.uriloader@pdf.js',
      FIREFOX_STREAM_CONVERTER_ID = '6457a96b-2d68-439a-bcfa-44465fbcdbb1',
      FIREFOX_STREAM_CONVERTER2_ID = '6457a96b-2d68-439a-bcfa-44465fbcdbb2';

  // Clear out everything in the firefox extension build directory
  rimraf.sync(FIREFOX_BUILD_DIR);

  var localizedMetadata =
    fs.readFileSync(FIREFOX_EXTENSION_DIR + 'metadata.inc').toString();
  var chromeManifestLocales =
    fs.readFileSync(FIREFOX_EXTENSION_DIR + 'chrome.manifest.inc').toString();
  var version = getVersionJSON().version;

  return merge([
    createBundle(defines).pipe(gulp.dest(FIREFOX_BUILD_CONTENT_DIR + 'build')),
    createWebBundle(defines).pipe(gulp.dest(FIREFOX_BUILD_CONTENT_DIR + 'web')),
    gulp.src(COMMON_WEB_FILES, {base: 'web/'})
        .pipe(gulp.dest(FIREFOX_BUILD_CONTENT_DIR + 'web')),
    gulp.src(FIREFOX_EXTENSION_DIR + 'locale/**/*.properties',
             {base: FIREFOX_EXTENSION_DIR})
        .pipe(gulp.dest(FIREFOX_BUILD_DIR)),
    gulp.src(['external/bcmaps/*.bcmap', 'external/bcmaps/LICENSE'],
             {base: 'external/bcmaps'})
        .pipe(gulp.dest(FIREFOX_BUILD_CONTENT_DIR + 'web/cmaps')),

    preprocessHTML('web/viewer.html', defines)
        .pipe(gulp.dest(FIREFOX_BUILD_CONTENT_DIR + 'web')),
    preprocessCSS('web/viewer.css', 'firefox', defines, true)
        .pipe(gulp.dest(FIREFOX_BUILD_CONTENT_DIR + 'web')),

    gulp.src(FIREFOX_CONTENT_DIR + 'PdfJs-stub.jsm')
        .pipe(rename('PdfJs.jsm'))
        .pipe(gulp.dest(FIREFOX_BUILD_CONTENT_DIR)),
    gulp.src(FIREFOX_CONTENT_DIR + 'PdfJsTelemetry-stub.jsm')
        .pipe(rename('PdfJsTelemetry.jsm'))
        .pipe(gulp.dest(FIREFOX_BUILD_CONTENT_DIR)),
    gulp.src(FIREFOX_EXTENSION_DIR + '*.png')
        .pipe(gulp.dest(FIREFOX_BUILD_DIR)),
    gulp.src(FIREFOX_EXTENSION_DIR + 'chrome.manifest')
        .pipe(replace(/#.*PDFJS_SUPPORTED_LOCALES.*\n/, chromeManifestLocales))
        .pipe(gulp.dest(FIREFOX_BUILD_DIR)),
    gulp.src(FIREFOX_EXTENSION_DIR + '*.rdf')
        .pipe(replace(/\bPDFJSSCRIPT_VERSION\b/g, version))
        .pipe(replace(/.*<!--\s*PDFJS_LOCALIZED_METADATA\s*-->.*\n/,
                      localizedMetadata))
        .pipe(gulp.dest(FIREFOX_BUILD_DIR)),
    gulp.src(FIREFOX_EXTENSION_DIR + 'chrome/content.js',
             {base: FIREFOX_EXTENSION_DIR})
        .pipe(gulp.dest(FIREFOX_BUILD_DIR)),
    gulp.src('LICENSE').pipe(gulp.dest(FIREFOX_BUILD_DIR)),

    gulp.src(FIREFOX_EXTENSION_DIR + 'tools/l10n.js')
        .pipe(gulp.dest(FIREFOX_BUILD_CONTENT_DIR + '/web')),

    preprocessJS(FIREFOX_CONTENT_DIR + 'PdfStreamConverter.jsm', defines, true)
        .pipe(replace(/\bPDFJSSCRIPT_STREAM_CONVERTER_ID\b/g,
                      FIREFOX_STREAM_CONVERTER_ID))
        .pipe(replace(/\bPDFJSSCRIPT_STREAM_CONVERTER2_ID\b/g,
                      FIREFOX_STREAM_CONVERTER2_ID))
        .pipe(replace(/\bPDFJSSCRIPT_PREF_PREFIX\b/g, FIREFOX_PREF_PREFIX))
        .pipe(gulp.dest(FIREFOX_BUILD_CONTENT_DIR)),
    preprocessJS(FIREFOX_CONTENT_DIR + 'PdfJsNetwork.jsm', defines, true)
        .pipe(gulp.dest(FIREFOX_BUILD_CONTENT_DIR)),
    preprocessJS(FIREFOX_CONTENT_DIR + 'PdfjsContentUtils.jsm', defines, true)
        .pipe(gulp.dest(FIREFOX_BUILD_CONTENT_DIR)),
    preprocessJS(FIREFOX_CONTENT_DIR + 'PdfjsChromeUtils.jsm', defines, true)
        .pipe(replace(/\bPDFJSSCRIPT_PREF_PREFIX\b/g, FIREFOX_PREF_PREFIX))
        .pipe(gulp.dest(FIREFOX_BUILD_CONTENT_DIR)),
    preprocessJS(FIREFOX_EXTENSION_DIR + 'bootstrap.js', defines, true)
        .pipe(gulp.dest(FIREFOX_BUILD_DIR)),
  ]);
});

gulp.task('firefox', ['firefox-pre'], function (done) {
  var FIREFOX_EXTENSION_FILES =
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

  var zipExecOptions = {
    cwd: FIREFOX_BUILD_DIR,
    // Set timezone to UTC before calling zip to get reproducible results.
    env: {'TZ': 'UTC'},
  };

  exec('zip -r ' + FIREFOX_EXTENSION_NAME + ' ' +
       FIREFOX_EXTENSION_FILES.join(' '), zipExecOptions, function (err) {
    if (err) {
      done(new Error('Cannot exec zip: ' + err));
      return;
    }
    console.log('extension created: ' + FIREFOX_EXTENSION_NAME);
    done();
  });
});

gulp.task('mozcentral-pre', ['buildnumber', 'locale'], function () {
  console.log();
  console.log('### Building mozilla-central extension');
  var defines = builder.merge(DEFINES, { MOZCENTRAL: true, PDFJS_NEXT: true, });

  var MOZCENTRAL_DIR = BUILD_DIR + 'mozcentral/',
      MOZCENTRAL_EXTENSION_DIR = MOZCENTRAL_DIR + 'browser/extensions/pdfjs/',
      MOZCENTRAL_CONTENT_DIR = MOZCENTRAL_EXTENSION_DIR + 'content/',
      FIREFOX_EXTENSION_DIR = 'extensions/firefox/',
      MOZCENTRAL_L10N_DIR = MOZCENTRAL_DIR + 'browser/locales/en-US/pdfviewer/',
      FIREFOX_CONTENT_DIR = EXTENSION_SRC_DIR + '/firefox/content/',
      MOZCENTRAL_PREF_PREFIX = 'pdfjs',
      MOZCENTRAL_STREAM_CONVERTER_ID = 'd0c5195d-e798-49d4-b1d3-9324328b2291',
      MOZCENTRAL_STREAM_CONVERTER2_ID = 'd0c5195d-e798-49d4-b1d3-9324328b2292';

  // Clear out everything in the firefox extension build directory
  rimraf.sync(MOZCENTRAL_DIR);

  var version = getVersionJSON().version;

  return merge([
    createBundle(defines).pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + 'build')),
    createWebBundle(defines).pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + 'web')),
    gulp.src(COMMON_WEB_FILES, {base: 'web/'})
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + 'web')),
    gulp.src(['external/bcmaps/*.bcmap', 'external/bcmaps/LICENSE'],
             {base: 'external/bcmaps'})
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + 'web/cmaps')),

    preprocessHTML('web/viewer.html', defines)
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + 'web')),
    preprocessCSS('web/viewer.css', 'mozcentral', defines, true)
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + 'web')),

    gulp.src(FIREFOX_CONTENT_DIR + 'PdfJsTelemetry.jsm')
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR)),
    gulp.src(FIREFOX_CONTENT_DIR + 'pdfjschildbootstrap.js')
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR)),
    gulp.src(FIREFOX_CONTENT_DIR + 'pdfjschildbootstrap-enabled.js')
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR)),
    gulp.src(FIREFOX_EXTENSION_DIR + 'chrome-mozcentral.manifest')
        .pipe(rename('chrome.manifest'))
        .pipe(gulp.dest(MOZCENTRAL_EXTENSION_DIR)),
    gulp.src(FIREFOX_EXTENSION_DIR + 'locale/en-US/*.properties')
        .pipe(gulp.dest(MOZCENTRAL_L10N_DIR)),
    gulp.src(FIREFOX_EXTENSION_DIR + 'README.mozilla')
        .pipe(replace(/\bPDFJSSCRIPT_VERSION\b/g, version))
        .pipe(gulp.dest(MOZCENTRAL_EXTENSION_DIR)),
    gulp.src('LICENSE').pipe(gulp.dest(MOZCENTRAL_EXTENSION_DIR)),
    gulp.src(FIREFOX_EXTENSION_DIR + 'tools/l10n.js')
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + '/web')),

    preprocessJS(FIREFOX_CONTENT_DIR + 'PdfJs.jsm', defines, true)
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR)),
    preprocessJS(FIREFOX_CONTENT_DIR + 'PdfStreamConverter.jsm', defines, true)
        .pipe(replace(/\bPDFJSSCRIPT_STREAM_CONVERTER_ID\b/g,
                      MOZCENTRAL_STREAM_CONVERTER_ID))
        .pipe(replace(/\bPDFJSSCRIPT_STREAM_CONVERTER2_ID\b/g,
                      MOZCENTRAL_STREAM_CONVERTER2_ID))
        .pipe(replace(/\bPDFJSSCRIPT_PREF_PREFIX\b/g, MOZCENTRAL_PREF_PREFIX))
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR)),
    preprocessJS(FIREFOX_CONTENT_DIR + 'PdfJsNetwork.jsm', defines, true)
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR)),
    preprocessJS(FIREFOX_CONTENT_DIR + 'PdfjsContentUtils.jsm', defines, true)
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR)),
    preprocessJS(FIREFOX_CONTENT_DIR + 'PdfjsChromeUtils.jsm', defines, true)
        .pipe(replace(/\bPDFJSSCRIPT_PREF_PREFIX\b/g, MOZCENTRAL_PREF_PREFIX))
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR)),
  ]);
});

gulp.task('mozcentral', ['mozcentral-pre']);

gulp.task('chromium-pre', ['buildnumber', 'locale'], function () {
  console.log();
  console.log('### Building Chromium extension');
  var defines = builder.merge(DEFINES, { CHROME: true, PDFJS_NEXT: true, });

  var CHROME_BUILD_DIR = BUILD_DIR + '/chromium/',
      CHROME_BUILD_CONTENT_DIR = CHROME_BUILD_DIR + '/content/';

  // Clear out everything in the chrome extension build directory
  rimraf.sync(CHROME_BUILD_DIR);

  var version = getVersionJSON().version;

  return merge([
    createBundle(defines).pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + 'build')),
    createWebBundle(defines).pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + 'web')),
    gulp.src(COMMON_WEB_FILES, {base: 'web/'})
        .pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + 'web')),

    gulp.src('external/webL10n/l10n.js')
        .pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + 'web')),
    gulp.src([
      'web/locale/*/viewer.properties',
      'web/locale/locale.properties'
    ], {base: 'web/'}).pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + 'web')),
    gulp.src(['external/bcmaps/*.bcmap', 'external/bcmaps/LICENSE'],
             {base: 'external/bcmaps'})
        .pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + 'web/cmaps')),

    preprocessHTML('web/viewer.html', defines)
        .pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + 'web')),
    preprocessCSS('web/viewer.css', 'chrome', defines, true)
        .pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + 'web')),

    gulp.src('LICENSE').pipe(gulp.dest(CHROME_BUILD_DIR)),
    gulp.src('extensions/chromium/manifest.json')
        .pipe(replace(/\bPDFJSSCRIPT_VERSION\b/g, version))
        .pipe(gulp.dest(CHROME_BUILD_DIR)),
    gulp.src([
      'extensions/chromium/**/*.{html,js,css,png}',
      'extensions/chromium/preferences_schema.json'
    ], {base: 'extensions/chromium/'})
        .pipe(gulp.dest(CHROME_BUILD_DIR)),
  ]);
});

gulp.task('chromium', ['chromium-pre']);

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

  rimraf(JSDOC_BUILD_DIR, function () {
    mkdirp(JSDOC_BUILD_DIR, function () {
      var command = '"node_modules/.bin/jsdoc" -d ' + JSDOC_BUILD_DIR + ' ' +
                    JSDOC_FILES.join(' ');
      exec(command, done);
    });
  });
});

gulp.task('lib', ['buildnumber'], function () {
  function preprocess(content) {
    var noPreset = /\/\*\s*no-babel-preset\s*\*\//.test(content);
    content = preprocessor2.preprocessPDFJSCode(ctx, content);
    content = babel.transform(content, {
      sourceType: 'module',
      presets: noPreset ? undefined : ['es2015'],
      plugins: ['transform-es2015-modules-commonjs'],
    }).code;
    var removeCjsSrc =
      /^(var\s+\w+\s*=\s*require\('.*?)(?:\/src)(\/[^']*'\);)$/gm;
    content = content.replace(removeCjsSrc, function (all, prefix, suffix) {
      return prefix + suffix;
    });
    return licenseHeader + content;
  }
  var babel = require('babel-core');
  var versionInfo = getVersionJSON();
  var ctx = {
    rootPath: __dirname,
    saveComments: false,
    defines: builder.merge(DEFINES, {
      GENERIC: true,
      LIB: true,
      BUNDLE_VERSION: versionInfo.version,
      BUNDLE_BUILD: versionInfo.commit
    })
  };
  var licenseHeader = fs.readFileSync('./src/license_header.js').toString();
  var preprocessor2 = require('./external/builder/preprocessor2.js');

  return merge([
    gulp.src([
      'src/{core,display}/*.js',
      'src/shared/{compatibility,util}.js',
      'src/{pdf,pdf.worker}.js',
    ], {base: 'src/'}),
    gulp.src([
      'web/*.js',
      '!web/viewer.js',
      '!web/compatibility.js',
    ], {base: '.'}),
    gulp.src('test/unit/*.js', {base: '.'}),
  ]).pipe(transform(preprocess))
    .pipe(gulp.dest('build/lib/'));
});

gulp.task('web-pre', ['generic', 'extension', 'jsdoc']);

gulp.task('dist-pre',
  ['generic', 'singlefile', 'components', 'lib', 'minified']);

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

gulp.task('makeref', function (done) {
  makeRef(done);
});

gulp.task('botmakeref', function (done) {
  makeRef(done, true);
});

gulp.task('baseline', function (done) {
  console.log();
  console.log('### Creating baseline environment');

  var baselineCommit = process.env['BASELINE'];
  if (!baselineCommit) {
    done(new Error('Missing baseline commit. Specify the BASELINE variable.'));
    return;
  }

  var initializeCommand = 'git fetch origin';
  if (!checkDir(BASELINE_DIR)) {
    mkdirp.sync(BASELINE_DIR);
    initializeCommand = 'git clone ../../ .';
  }

  var workingDirectory = path.resolve(process.cwd(), BASELINE_DIR);
  exec(initializeCommand, { cwd: workingDirectory }, function (error) {
    if (error) {
      done(new Error('Baseline clone/fetch failed.'));
      return;
    }

    exec('git checkout ' + baselineCommit, { cwd: workingDirectory },
        function (error) {
      if (error) {
        done(new Error('Baseline commit checkout failed.'));
        return;
      }

      console.log('Baseline commit "' + baselineCommit + '" checked out.');
      done();
    });
  });
});

gulp.task('unittestcli', ['lib'], function (done) {
  var args = ['JASMINE_CONFIG_PATH=test/unit/clitests.json'];
  var testProcess = spawn('node_modules/.bin/jasmine', args,
                          {stdio: 'inherit'});
  testProcess.on('close', function (code) {
    if (code !== 0) {
      done(new Error('Unit tests failed.'));
      return;
    }
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

gulp.task('gh-pages-prepare', ['web-pre'], function () {
  console.log();
  console.log('### Creating web site');

  rimraf.sync(GH_PAGES_DIR);

  // 'vinyl' because web/viewer.html needs its BOM.
  return merge([
    vinyl.src(GENERIC_DIR + '**/*', {base: GENERIC_DIR, stripBOM: false})
         .pipe(gulp.dest(GH_PAGES_DIR)),
    gulp.src([FIREFOX_BUILD_DIR + '*.xpi',
              FIREFOX_BUILD_DIR + '*.rdf'])
        .pipe(gulp.dest(GH_PAGES_DIR + EXTENSION_SRC_DIR + 'firefox/')),
    gulp.src(CHROME_BUILD_DIR + '*.crx')
        .pipe(gulp.dest(GH_PAGES_DIR + EXTENSION_SRC_DIR + 'chromium/')),
    gulp.src('test/features/**/*', {base: 'test/'})
        .pipe(gulp.dest(GH_PAGES_DIR)),
    gulp.src(JSDOC_BUILD_DIR + '**/*', {base: JSDOC_BUILD_DIR})
        .pipe(gulp.dest(GH_PAGES_DIR + 'api/draft/')),
  ]);
});

gulp.task('wintersmith', ['gh-pages-prepare'], function (done) {
  var wintersmith = require('wintersmith');
  var env = wintersmith('docs/config.json');
  env.build(GH_PAGES_DIR, function (error) {
    if (error) {
      return done(error);
    }
    replaceInFile(GH_PAGES_DIR + '/getting_started/index.html',
                  /STABLE_VERSION/g, config.stableVersion);
    replaceInFile(GH_PAGES_DIR + '/getting_started/index.html',
                  /BETA_VERSION/g, config.betaVersion);
    console.log('Done building with wintersmith.');
    done();
  });
});

gulp.task('gh-pages-git', ['gh-pages-prepare', 'wintersmith'], function () {
  var VERSION = getVersionJSON().version;
  var reason = process.env['PDFJS_UPDATE_REASON'];

  spawnSync('git', ['init'], {cwd: GH_PAGES_DIR});
  spawnSync('git', ['remote', 'add', 'origin', REPO], {cwd: GH_PAGES_DIR});
  spawnSync('git', ['add', '-A'], {cwd: GH_PAGES_DIR});
  spawnSync('git', [
    'commit', '-am', 'gh-pages site created via gulpfile.js script',
    '-m', 'PDF.js version ' + VERSION + (reason ? ' - ' + reason : '')
  ], {cwd: GH_PAGES_DIR});
  spawnSync('git', ['branch', '-m', 'gh-pages'], {cwd: GH_PAGES_DIR});

  console.log();
  console.log('Website built in ' + GH_PAGES_DIR);
});

gulp.task('web', ['gh-pages-prepare', 'wintersmith', 'gh-pages-git']);

gulp.task('dist-repo-prepare', ['dist-pre'], function () {
  var VERSION = getVersionJSON().version;

  console.log();
  console.log('### Cloning baseline distribution');

  rimraf.sync(DIST_DIR);
  mkdirp.sync(DIST_DIR);
  spawnSync('git', ['clone', '--depth', '1', DIST_REPO_URL, DIST_DIR]);

  console.log();
  console.log('### Overwriting all files');
  rimraf.sync(path.join(DIST_DIR, '*'));

  // Rebuilding manifests
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
      'worker-loader': '^0.8.0', // used in external/dist/webpack.json
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
  var packageJsonSrc =
    createStringSource('package.json', JSON.stringify(npmManifest, null, 2));
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
  var bowerJsonSrc =
    createStringSource('bower.json', JSON.stringify(bowerManifest, null, 2));

  return merge([
    packageJsonSrc.pipe(gulp.dest(DIST_DIR)),
    bowerJsonSrc.pipe(gulp.dest(DIST_DIR)),
    vinyl.src('external/dist/**/*',
              {base: 'external/dist', stripBOM: false})
         .pipe(gulp.dest(DIST_DIR)),
    gulp.src(GENERIC_DIR + 'LICENSE')
        .pipe(gulp.dest(DIST_DIR)),
    gulp.src(GENERIC_DIR + 'web/cmaps/**/*',
             {base: GENERIC_DIR + 'web'})
        .pipe(gulp.dest(DIST_DIR)),
    gulp.src([
      GENERIC_DIR + 'build/pdf.js',
      GENERIC_DIR + 'build/pdf.worker.js',
      SINGLE_FILE_DIR + 'build/pdf.combined.js',
      SRC_DIR + 'pdf.worker.entry.js',
    ]).pipe(gulp.dest(DIST_DIR + 'build/')),
    gulp.src(MINIFIED_DIR + 'build/pdf.js')
        .pipe(rename('pdf.min.js'))
        .pipe(gulp.dest(DIST_DIR + 'build/')),
    gulp.src(MINIFIED_DIR + 'build/pdf.worker.js')
        .pipe(rename('pdf.worker.min.js'))
        .pipe(gulp.dest(DIST_DIR + 'build/')),
    gulp.src(COMPONENTS_DIR + '**/*', {base: COMPONENTS_DIR})
        .pipe(gulp.dest(DIST_DIR + 'web/')),
    gulp.src(LIB_DIR + '**/*', {base: LIB_DIR})
        .pipe(gulp.dest(DIST_DIR + 'lib/')),
  ]);
});

gulp.task('dist-repo-git', ['dist-repo-prepare'], function () {
  var VERSION = getVersionJSON().version;

  console.log();
  console.log('### Committing changes');

  var reason = process.env['PDFJS_UPDATE_REASON'];
  var message = 'PDF.js version ' + VERSION + (reason ? ' - ' + reason : '');
  spawnSync('git', ['add', '*'], {cwd: DIST_DIR});
  spawnSync('git', ['commit', '-am', message], {cwd: DIST_DIR});
  spawnSync('git', ['tag', '-a', 'v' + VERSION, '-m', message],
            {cwd: DIST_DIR});

  console.log();
  console.log('Done. Push with');
  console.log('  cd ' + DIST_DIR + '; ' +
              'git push --tags ' + DIST_REPO_URL + ' master');
  console.log();
});

gulp.task('dist', ['dist-repo-git']);

// Getting all shelljs registered tasks and register them with gulp
require('./make.js');

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
