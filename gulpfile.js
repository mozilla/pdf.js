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
/* eslint-disable object-shorthand */
/* globals target */

'use strict';

var autoprefixer = require('autoprefixer');
var fancylog = require('fancy-log');
var fs = require('fs');
var gulp = require('gulp');
var postcss = require('gulp-postcss');
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
var Vinyl = require('vinyl');
var vfs = require('vinyl-fs');

var BUILD_DIR = 'build/';
var L10N_DIR = 'l10n/';
var TEST_DIR = 'test/';
var EXTENSION_SRC_DIR = 'extensions/';

var BASELINE_DIR = BUILD_DIR + 'baseline/';
var MOZCENTRAL_BASELINE_DIR = BUILD_DIR + 'mozcentral.baseline/';
var GENERIC_DIR = BUILD_DIR + 'generic/';
var COMPONENTS_DIR = BUILD_DIR + 'components/';
var IMAGE_DECODERS_DIR = BUILD_DIR + 'image_decoders';
var DEFAULT_PREFERENCES_DIR = BUILD_DIR + 'default_preferences/';
var MINIFIED_DIR = BUILD_DIR + 'minified/';
var JSDOC_BUILD_DIR = BUILD_DIR + 'jsdoc/';
var GH_PAGES_DIR = BUILD_DIR + 'gh-pages/';
var SRC_DIR = 'src/';
var LIB_DIR = BUILD_DIR + 'lib/';
var DIST_DIR = BUILD_DIR + 'dist/';
var COMMON_WEB_FILES = [
  'web/images/*.{png,svg,gif,cur}',
  'web/debugger.js'
];
var MOZCENTRAL_DIFF_FILE = 'mozcentral.diff';

var REPO = 'git@github.com:mozilla/pdf.js.git';
var DIST_REPO_URL = 'https://github.com/mozilla/pdfjs-dist';

var builder = require('./external/builder/builder.js');

var CONFIG_FILE = 'pdfjs.config';
var config = JSON.parse(fs.readFileSync(CONFIG_FILE).toString());

// Default Autoprefixer config used for generic, components, minified-pre
var AUTOPREFIXER_CONFIG = {
  browsers: [
    'last 2 versions',
    'Chrome >= 49', // Last supported on Windows XP
    'Firefox >= 52', // Last supported on Windows XP
    'Firefox ESR',
    'IE >= 11',
    'Safari >= 9',
    '> 0.5%',
    'not dead',
  ],
};

var DEFINES = {
  PRODUCTION: true,
  TESTING: false,
  // The main build targets:
  GENERIC: false,
  FIREFOX: false,
  MOZCENTRAL: false,
  CHROME: false,
  MINIFIED: false,
  COMPONENTS: false,
  LIB: false,
  SKIP_BABEL: false,
  IMAGE_DECODERS: false,
};

function safeSpawnSync(command, parameters, options) {
  // Execute all commands in a shell.
  options = options || {};
  options.shell = true;
  // `options.shell = true` requires parameters to be quoted.
  parameters = parameters.map((param) => {
    if (!/[\s`~!#$*(){\[|\\;'"<>?]/.test(param)) {
      return param;
    }
    return '\"' + param.replace(/([$\\"`])/g, '\\$1') + '\"';
  });

  var result = spawnSync(command, parameters, options);
  if (result.status !== 0) {
    console.log('Error: command "' + command + '" with parameters "' +
                parameters + '" exited with code ' + result.status);
    process.exit(result.status);
  }
  return result;
}

function startNode(args, options) {
  // Node.js decreased the maximum header size from 80 KB to 8 KB in newer
  // releases, which is not sufficient for some of our reference test files
  // (such as `issue6360.pdf`), so we need to restore this value. Note that
  // this argument needs to be before all other arguments as it needs to be
  // passed to the Node.js process itself and not to the script that it runs.
  args.unshift('--max-http-header-size=80000');
  return spawn('node', args, options);
}

function createStringSource(filename, content) {
  var source = stream.Readable({ objectMode: true, });
  source._read = function () {
    this.push(new Vinyl({
      path: filename,
      contents: Buffer.from(content),
    }));
    this.push(null);
  };
  return source;
}

function createWebpackConfig(defines, output) {
  var path = require('path');

  var versionInfo = getVersionJSON();
  var bundleDefines = builder.merge(defines, {
    BUNDLE_VERSION: versionInfo.version,
    BUNDLE_BUILD: versionInfo.commit,
    TESTING: (defines.TESTING || process.env['TESTING'] === 'true'),
  });
  var licenseHeaderLibre =
    fs.readFileSync('./src/license_header_libre.js').toString();
  var enableSourceMaps = !bundleDefines.FIREFOX && !bundleDefines.MOZCENTRAL &&
                         !bundleDefines.CHROME && !bundleDefines.TESTING;
  var skipBabel = bundleDefines.SKIP_BABEL ||
                  process.env['SKIP_BABEL'] === 'true';

  // Required to expose e.g., the `window` object.
  output.globalObject = 'this';

  return {
    mode: 'none',
    output: output,
    performance: {
      hints: false, // Disable messages about larger file sizes.
    },
    plugins: [
      new webpack2.BannerPlugin({ banner: licenseHeaderLibre, raw: true, }),
    ],
    resolve: {
      alias: {
        'pdfjs': path.join(__dirname, 'src'),
        'pdfjs-web': path.join(__dirname, 'web'),
        'pdfjs-lib': path.join(__dirname, 'web/pdfjs'),
      },
    },
    devtool: enableSourceMaps ? 'source-map' : undefined,
    module: {
      rules: [
        {
          loader: 'babel-loader',
          // babel is too slow
          exclude: /src[\\\/]core[\\\/](glyphlist|unicode)/,
          options: {
            presets: skipBabel ? undefined : ['@babel/preset-env'],
            plugins: [
              '@babel/plugin-transform-modules-commonjs',
              ['@babel/plugin-transform-runtime', {
                'helpers': false,
                'regenerator': true,
              }],
            ],
          },
        },
        {
          loader: path.join(__dirname, 'external/webpack/pdfjsdev-loader.js'),
          options: {
            rootPath: __dirname,
            saveComments: false,
            defines: bundleDefines,
          },
        },
      ],
    },
    // Avoid shadowing actual Node.js variables with polyfills, by disabling
    // polyfills/mocks - https://webpack.js.org/configuration/node/
    node: false,
  };
}

function webpack2Stream(config) {
  // Replacing webpack1 to webpack2 in the webpack-stream.
  return webpackStream(config, webpack2);
}

function getVersionJSON() {
  return JSON.parse(fs.readFileSync(BUILD_DIR + 'version.json').toString());
}

function checkChromePreferencesFile(chromePrefsPath, webPrefsPath) {
  var chromePrefs = JSON.parse(fs.readFileSync(chromePrefsPath).toString());
  var chromePrefsKeys = Object.keys(chromePrefs.properties);
  chromePrefsKeys = chromePrefsKeys.filter(function (key) {
    var description = chromePrefs.properties[key].description;
    // Deprecated keys are allowed in the managed preferences file.
    // The code maintained is responsible for adding migration logic to
    // extensions/chromium/options/migration.js and web/chromecom.js .
    return !description || !description.startsWith('DEPRECATED.');
  });
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

function replaceJSRootName(amdName, jsName) {
  // Saving old-style JS module name.
  return replace('root["' + amdName + '"] = factory()',
                 'root["' + amdName + '"] = root.' + jsName + ' = factory()');
}

function createBundle(defines) {
  console.log();
  console.log('### Bundling files into pdf.js');

  var mainAMDName = 'pdfjs-dist/build/pdf';
  var mainOutputName = 'pdf.js';

  var mainFileConfig = createWebpackConfig(defines, {
    filename: mainOutputName,
    library: mainAMDName,
    libraryTarget: 'umd',
    umdNamedDefine: true,
  });
  var mainOutput = gulp.src('./src/pdf.js')
    .pipe(webpack2Stream(mainFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceJSRootName(mainAMDName, 'pdfjsLib'));

  var workerAMDName = 'pdfjs-dist/build/pdf.worker';
  var workerOutputName = 'pdf.worker.js';

  var workerFileConfig = createWebpackConfig(defines, {
    filename: workerOutputName,
    library: workerAMDName,
    libraryTarget: 'umd',
    umdNamedDefine: true,
  });

  var workerOutput = gulp.src('./src/pdf.worker.js')
    .pipe(webpack2Stream(workerFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceJSRootName(workerAMDName, 'pdfjsWorker'));
  return merge([mainOutput, workerOutput]);
}

function createWebBundle(defines) {
  var viewerOutputName = 'viewer.js';

  var viewerFileConfig = createWebpackConfig(defines, {
    filename: viewerOutputName,
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
    umdNamedDefine: true,
  });
  return gulp.src('./web/pdf_viewer.component.js')
    .pipe(webpack2Stream(componentsFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceJSRootName(componentsAMDName, 'pdfjsViewer'));
}

function createImageDecodersBundle(defines) {
  var imageDecodersAMDName = 'pdfjs-dist/image_decoders/pdf.image_decoders';
  var imageDecodersOutputName = 'pdf.image_decoders.js';

  var componentsFileConfig = createWebpackConfig(defines, {
    filename: imageDecodersOutputName,
    library: imageDecodersAMDName,
    libraryTarget: 'umd',
    umdNamedDefine: true,
  });
  return gulp.src('./src/pdf.image_decoders.js')
    .pipe(webpack2Stream(componentsFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceJSRootName(imageDecodersAMDName, 'pdfjsImageDecoders'));
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

function createTestSource(testsName, bot) {
  var source = stream.Readable({ objectMode: true, });
  source._read = function() {
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
    if (bot) {
      args.push('--strictVerify');
    }

    var testProcess = startNode(args, { cwd: TEST_DIR, stdio: 'inherit', });
    testProcess.on('close', function (code) {
      source.push(null);
    });
    return undefined;
  };
  return source;
}

function makeRef(done, bot) {
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
  if (bot) {
    args.push('--noPrompts', '--strictVerify');
  }
  args.push('--browserManifestFile=' + PDF_BROWSERS);
  var testProcess = startNode(args, { cwd: TEST_DIR, stdio: 'inherit', });
  testProcess.on('close', function (code) {
    done();
  });
}

gulp.task('default', function(done) {
  console.log('Available tasks:');
  var tasks = Object.keys(gulp.registry().tasks());
  tasks.sort();
  tasks.forEach(function (taskName) {
    console.log('  ' + taskName);
  });
  done();
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
    } else {
      console.log('This is not a Git repository; using default build number.');
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
        commit: buildCommit,
      }, null, 2))
        .pipe(gulp.dest(BUILD_DIR))
        .on('end', done);
    });
  });
});

gulp.task('default_preferences-pre', function() {
  console.log();
  console.log('### Building `default_preferences.json`');

  // Refer to the comment in the 'lib' task below.
  function babelPluginReplaceNonWebPackRequire(babel) {
    return {
      visitor: {
        Identifier(path, state) {
          if (path.node.name === '__non_webpack_require__') {
            path.replaceWith(babel.types.identifier('require'));
          }
        },
      },
    };
  }
  function preprocess(content) {
    content = preprocessor2.preprocessPDFJSCode(ctx, content);
    return babel.transform(content, {
      sourceType: 'module',
      presets: undefined, // SKIP_BABEL
      plugins: [
        '@babel/plugin-transform-modules-commonjs',
        babelPluginReplaceNonWebPackRequire,
      ],
    }).code;
  }
  var babel = require('@babel/core');
  var ctx = {
    rootPath: __dirname,
    saveComments: false,
    defines: builder.merge(DEFINES, {
      GENERIC: true,
      LIB: true,
      BUNDLE_VERSION: 0, // Dummy version
      BUNDLE_BUILD: 0, // Dummy build
    }),
    map: {
      'pdfjs-lib': '../pdf',
    },
  };
  var preprocessor2 = require('./external/builder/preprocessor2.js');
  var buildLib = merge([
    gulp.src([
      'src/{display,shared}/*.js',
      '!src/shared/{cffStandardStrings,fonts_utils}.js',
      'src/pdf.js',
    ], { base: 'src/', }),
    gulp.src([
      'web/*.js',
      '!web/{app,pdfjs,preferences,viewer}.js',
    ], { base: '.', }),
  ]).pipe(transform('utf8', preprocess))
    .pipe(gulp.dest(DEFAULT_PREFERENCES_DIR + 'lib/'));
  return merge([
    buildLib,
    gulp.src('external/{streams,url}/*.js', { base: '.', })
      .pipe(gulp.dest(DEFAULT_PREFERENCES_DIR)),
  ]);
});

gulp.task('default_preferences', gulp.series('default_preferences-pre',
    function(done) {
  var AppOptionsLib =
    require('./' + DEFAULT_PREFERENCES_DIR + 'lib/web/app_options.js');
  var AppOptions = AppOptionsLib.AppOptions;
  var OptionKind = AppOptionsLib.OptionKind;

  createStringSource('default_preferences.json', JSON.stringify(
      AppOptions.getAll(OptionKind.PREFERENCE), null, 2))
    .pipe(gulp.dest(BUILD_DIR))
    .on('end', done);
}));

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
             '/{viewer,chrome}.properties', { base: L10N_DIR, })
      .pipe(gulp.dest(EXTENSION_LOCALE_OUTPUT)),

    createStringSource('locale.properties', viewerOutput)
      .pipe(gulp.dest(VIEWER_LOCALE_OUTPUT)),
    gulp.src(L10N_DIR + '/{' + locales.join(',') + '}' +
             '/viewer.properties', { base: L10N_DIR, })
      .pipe(gulp.dest(VIEWER_LOCALE_OUTPUT))
  ]);
});

gulp.task('cmaps', function (done) {
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
  done();
});

gulp.task('bundle', gulp.series('buildnumber', function () {
  return createBundle(DEFINES).pipe(gulp.dest(BUILD_DIR));
}));

function preprocessCSS(source, mode, defines, cleanup) {
  var outName = getTempFile('~preprocess', '.css');
  builder.preprocessCSS(mode, source, outName);
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
  builder.preprocess(source, outName, defines);
  var out = fs.readFileSync(outName).toString();
  fs.unlinkSync(outName);

  var i = source.lastIndexOf('/');
  return createStringSource(source.substr(i + 1), out);
}

// Builds the generic production viewer that should be compatible with most
// modern HTML5 browsers.
gulp.task('generic', gulp.series('buildnumber', 'default_preferences', 'locale',
                                 function() {
  console.log();
  console.log('### Creating generic viewer');
  var defines = builder.merge(DEFINES, { GENERIC: true, });

  rimraf.sync(GENERIC_DIR);

  return merge([
    createBundle(defines).pipe(gulp.dest(GENERIC_DIR + 'build')),
    createWebBundle(defines).pipe(gulp.dest(GENERIC_DIR + 'web')),
    gulp.src(COMMON_WEB_FILES, { base: 'web/', })
        .pipe(gulp.dest(GENERIC_DIR + 'web')),
    gulp.src('LICENSE').pipe(gulp.dest(GENERIC_DIR)),
    gulp.src([
      'web/locale/*/viewer.properties',
      'web/locale/locale.properties'
    ], { base: 'web/', }).pipe(gulp.dest(GENERIC_DIR + 'web')),
    gulp.src(['external/bcmaps/*.bcmap', 'external/bcmaps/LICENSE'],
             { base: 'external/bcmaps', })
        .pipe(gulp.dest(GENERIC_DIR + 'web/cmaps')),
    preprocessHTML('web/viewer.html', defines)
        .pipe(gulp.dest(GENERIC_DIR + 'web')),
    preprocessCSS('web/viewer.css', 'generic', defines, true)
        .pipe(postcss([autoprefixer(AUTOPREFIXER_CONFIG)]))
        .pipe(gulp.dest(GENERIC_DIR + 'web')),

    gulp.src('web/compressed.tracemonkey-pldi-09.pdf')
        .pipe(gulp.dest(GENERIC_DIR + 'web')),
  ]);
}));

gulp.task('components', gulp.series('buildnumber', function () {
  console.log();
  console.log('### Creating generic components');
  var defines = builder.merge(DEFINES, { COMPONENTS: true, GENERIC: true, });

  rimraf.sync(COMPONENTS_DIR);

  var COMPONENTS_IMAGES = [
    'web/images/annotation-*.svg',
    'web/images/loading-icon.gif',
    'web/images/shadow.png',
    'web/images/texture.png',
  ];

  return merge([
    createComponentsBundle(defines).pipe(gulp.dest(COMPONENTS_DIR)),
    gulp.src(COMPONENTS_IMAGES).pipe(gulp.dest(COMPONENTS_DIR + 'images')),
    preprocessCSS('web/pdf_viewer.css', 'components', defines, true)
        .pipe(postcss([autoprefixer(AUTOPREFIXER_CONFIG)]))
        .pipe(gulp.dest(COMPONENTS_DIR)),
  ]);
}));

gulp.task('image_decoders', gulp.series('buildnumber', function() {
  console.log();
  console.log('### Creating image decoders');
  var defines = builder.merge(DEFINES, { GENERIC: true,
                                         IMAGE_DECODERS: true, });

  return createImageDecodersBundle(defines).pipe(gulp.dest(IMAGE_DECODERS_DIR));
}));

gulp.task('minified-pre', gulp.series('buildnumber', 'default_preferences',
                                      'locale', function() {
  console.log();
  console.log('### Creating minified viewer');
  var defines = builder.merge(DEFINES, { MINIFIED: true, GENERIC: true, });

  rimraf.sync(MINIFIED_DIR);

  return merge([
    createBundle(defines).pipe(gulp.dest(MINIFIED_DIR + 'build')),
    createWebBundle(defines).pipe(gulp.dest(MINIFIED_DIR + 'web')),
    createImageDecodersBundle(builder.merge(defines, { IMAGE_DECODERS: true, }))
        .pipe(gulp.dest(MINIFIED_DIR + 'image_decoders')),
    gulp.src(COMMON_WEB_FILES, { base: 'web/', })
        .pipe(gulp.dest(MINIFIED_DIR + 'web')),
    gulp.src([
      'web/locale/*/viewer.properties',
      'web/locale/locale.properties'
    ], { base: 'web/', }).pipe(gulp.dest(MINIFIED_DIR + 'web')),
    gulp.src(['external/bcmaps/*.bcmap', 'external/bcmaps/LICENSE'],
             { base: 'external/bcmaps', })
        .pipe(gulp.dest(MINIFIED_DIR + 'web/cmaps')),

    preprocessHTML('web/viewer.html', defines)
        .pipe(gulp.dest(MINIFIED_DIR + 'web')),
    preprocessCSS('web/viewer.css', 'minified', defines, true)
        .pipe(postcss([autoprefixer(AUTOPREFIXER_CONFIG)]))
        .pipe(gulp.dest(MINIFIED_DIR + 'web')),

    gulp.src('web/compressed.tracemonkey-pldi-09.pdf')
        .pipe(gulp.dest(MINIFIED_DIR + 'web')),
  ]);
}));

gulp.task('minified-post', gulp.series('minified-pre', function (done) {
  var pdfFile = fs.readFileSync(MINIFIED_DIR + '/build/pdf.js').toString();
  var pdfWorkerFile =
    fs.readFileSync(MINIFIED_DIR + '/build/pdf.worker.js').toString();
  var pdfImageDecodersFile = fs.readFileSync(MINIFIED_DIR +
    '/image_decoders/pdf.image_decoders.js').toString();
  var viewerFiles = {
    'pdf.js': pdfFile,
    'viewer.js': fs.readFileSync(MINIFIED_DIR + '/web/viewer.js').toString(),
  };

  console.log();
  console.log('### Minifying js files');

  var Terser = require('terser');
  // V8 chokes on very long sequences. Works around that.
  var optsForHugeFile = { compress: { sequences: false, }, };

  fs.writeFileSync(MINIFIED_DIR + '/web/pdf.viewer.js',
                   Terser.minify(viewerFiles).code);
  fs.writeFileSync(MINIFIED_DIR + '/build/pdf.min.js',
                   Terser.minify(pdfFile).code);
  fs.writeFileSync(MINIFIED_DIR + '/build/pdf.worker.min.js',
                   Terser.minify(pdfWorkerFile, optsForHugeFile).code);
  fs.writeFileSync(MINIFIED_DIR + 'image_decoders/pdf.image_decoders.min.js',
                   Terser.minify(pdfImageDecodersFile).code);

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
  fs.renameSync(MINIFIED_DIR + '/image_decoders/pdf.image_decoders.min.js',
                MINIFIED_DIR + '/image_decoders/pdf.image_decoders.js');
  done();
}));

gulp.task('minified', gulp.series('minified-post'));

function preprocessDefaultPreferences(content) {
  var preprocessor2 = require('./external/builder/preprocessor2.js');
  var licenseHeader = fs.readFileSync('./src/license_header.js').toString();

  var GLOBALS = '/* eslint-disable */\n';
  var MODIFICATION_WARNING =
    '//\n// THIS FILE IS GENERATED AUTOMATICALLY, DO NOT EDIT MANUALLY!\n//\n';

  content = preprocessor2.preprocessPDFJSCode({
    rootPath: __dirname,
    defines: DEFINES,
  }, content);

  return (licenseHeader + '\n' + GLOBALS + '\n' + MODIFICATION_WARNING + '\n' +
          content + '\n');
}

gulp.task('mozcentral-pre', gulp.series('buildnumber', 'default_preferences',
                                        'locale', function() {
  console.log();
  console.log('### Building mozilla-central extension');
  var defines = builder.merge(DEFINES, { MOZCENTRAL: true, SKIP_BABEL: true, });

  var MOZCENTRAL_DIR = BUILD_DIR + 'mozcentral/',
      MOZCENTRAL_EXTENSION_DIR = MOZCENTRAL_DIR + 'browser/extensions/pdfjs/',
      MOZCENTRAL_CONTENT_DIR = MOZCENTRAL_EXTENSION_DIR + 'content/',
      FIREFOX_EXTENSION_DIR = 'extensions/firefox/',
      MOZCENTRAL_L10N_DIR = MOZCENTRAL_DIR + 'browser/locales/en-US/pdfviewer/',
      FIREFOX_CONTENT_DIR = EXTENSION_SRC_DIR + '/firefox/content/';

  // Clear out everything in the firefox extension build directory
  rimraf.sync(MOZCENTRAL_DIR);

  var versionJSON = getVersionJSON();
  var version = versionJSON.version, commit = versionJSON.commit;

  return merge([
    createBundle(defines).pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + 'build')),
    createWebBundle(defines).pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + 'web')),
    gulp.src(COMMON_WEB_FILES, { base: 'web/', })
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + 'web')),
    gulp.src(['external/bcmaps/*.bcmap', 'external/bcmaps/LICENSE'],
             { base: 'external/bcmaps', })
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + 'web/cmaps')),

    preprocessHTML('web/viewer.html', defines)
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + 'web')),
    preprocessCSS('web/viewer.css', 'mozcentral', defines, true)
        .pipe(postcss([
            autoprefixer({ browsers: ['last 1 firefox versions'], })
        ]))
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + 'web')),

    gulp.src(FIREFOX_EXTENSION_DIR + 'locale/en-US/*.properties')
        .pipe(gulp.dest(MOZCENTRAL_L10N_DIR)),
    gulp.src(FIREFOX_EXTENSION_DIR + 'README.mozilla')
        .pipe(replace(/\bPDFJSSCRIPT_VERSION\b/g, version))
        .pipe(replace(/\bPDFJSSCRIPT_COMMIT\b/g, commit))
        .pipe(gulp.dest(MOZCENTRAL_EXTENSION_DIR)),
    gulp.src('LICENSE').pipe(gulp.dest(MOZCENTRAL_EXTENSION_DIR)),
    gulp.src(FIREFOX_CONTENT_DIR + 'PdfJsDefaultPreferences.jsm')
        .pipe(transform('utf8', preprocessDefaultPreferences))
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR)),
  ]);
}));

gulp.task('mozcentral', gulp.series('mozcentral-pre'));

gulp.task('chromium-pre', gulp.series('buildnumber', 'default_preferences',
                                      'locale', function() {
  console.log();
  console.log('### Building Chromium extension');
  var defines = builder.merge(DEFINES, { CHROME: true, });

  var CHROME_BUILD_DIR = BUILD_DIR + '/chromium/',
      CHROME_BUILD_CONTENT_DIR = CHROME_BUILD_DIR + '/content/';

  // Clear out everything in the chrome extension build directory
  rimraf.sync(CHROME_BUILD_DIR);

  var version = getVersionJSON().version;

  return merge([
    createBundle(defines).pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + 'build')),
    createWebBundle(defines).pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + 'web')),
    gulp.src(COMMON_WEB_FILES, { base: 'web/', })
        .pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + 'web')),

    gulp.src([
      'web/locale/*/viewer.properties',
      'web/locale/locale.properties'
    ], { base: 'web/', }).pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + 'web')),
    gulp.src(['external/bcmaps/*.bcmap', 'external/bcmaps/LICENSE'],
             { base: 'external/bcmaps', })
        .pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + 'web/cmaps')),

    preprocessHTML('web/viewer.html', defines)
        .pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + 'web')),
    preprocessCSS('web/viewer.css', 'chrome', defines, true)
        .pipe(postcss([autoprefixer({ browsers: ['chrome >= 49'], })]))
        .pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + 'web')),

    gulp.src('LICENSE').pipe(gulp.dest(CHROME_BUILD_DIR)),
    gulp.src('extensions/chromium/manifest.json')
        .pipe(replace(/\bPDFJSSCRIPT_VERSION\b/g, version))
        .pipe(gulp.dest(CHROME_BUILD_DIR)),
    gulp.src([
      'extensions/chromium/**/*.{html,js,css,png}',
      'extensions/chromium/preferences_schema.json'
    ], { base: 'extensions/chromium/', })
        .pipe(gulp.dest(CHROME_BUILD_DIR)),
  ]);
}));

gulp.task('chromium', gulp.series('chromium-pre'));

gulp.task('jsdoc', function (done) {
  console.log();
  console.log('### Generating documentation (JSDoc)');

  var JSDOC_FILES = [
    'src/doc_helper.js',
    'src/display/api.js',
    'src/shared/util.js',
  ];

  rimraf(JSDOC_BUILD_DIR, function () {
    mkdirp(JSDOC_BUILD_DIR, function () {
      var command = '"node_modules/.bin/jsdoc" -d ' + JSDOC_BUILD_DIR + ' ' +
                    JSDOC_FILES.join(' ');
      exec(command, done);
    });
  });
});

gulp.task('lib', gulp.series('buildnumber', 'default_preferences', function() {
  // When we create a bundle, webpack is run on the source and it will replace
  // require with __webpack_require__. When we want to use the real require,
  // __non_webpack_require__ has to be used.
  // In this target, we don't create a bundle, so we have to replace the
  // occurences of __non_webpack_require__ ourselves.
  function babelPluginReplaceNonWebPackRequire(babel) {
    return {
      visitor: {
        Identifier(path, state) {
          if (path.node.name === '__non_webpack_require__') {
            path.replaceWith(babel.types.identifier('require'));
          }
        },
      },
    };
  }
  function preprocess(content) {
    var skipBabel = process.env['SKIP_BABEL'] === 'true' ||
                    /\/\*\s*no-babel-preset\s*\*\//.test(content);
    content = preprocessor2.preprocessPDFJSCode(ctx, content);
    content = babel.transform(content, {
      sourceType: 'module',
      presets: skipBabel ? undefined : ['@babel/preset-env'],
      plugins: [
        '@babel/plugin-transform-modules-commonjs',
        ['@babel/plugin-transform-runtime', {
          'helpers': false,
          'regenerator': true,
        }],
        babelPluginReplaceNonWebPackRequire,
      ],
    }).code;
    // eslint-disable-next-line max-len
    var removeCjsSrc = /^(var\s+\w+\s*=\s*(_interopRequireDefault\()?require\(".*?)(?:\/src)(\/[^"]*"\)\)?;)$/gm;
    content = content.replace(removeCjsSrc, (all, prefix, interop, suffix) => {
      return prefix + suffix;
    });
    return licenseHeaderLibre + content;
  }
  var babel = require('@babel/core');
  var versionInfo = getVersionJSON();
  var ctx = {
    rootPath: __dirname,
    saveComments: false,
    defines: builder.merge(DEFINES, {
      GENERIC: true,
      LIB: true,
      BUNDLE_VERSION: versionInfo.version,
      BUNDLE_BUILD: versionInfo.commit,
      TESTING: process.env['TESTING'] === 'true',
    }),
    map: {
      'pdfjs-lib': '../pdf',
    },
  };
  var licenseHeaderLibre =
    fs.readFileSync('./src/license_header_libre.js').toString();
  var preprocessor2 = require('./external/builder/preprocessor2.js');
  var buildLib = merge([
    gulp.src([
      'src/{core,display,shared}/*.js',
      '!src/shared/{cffStandardStrings,fonts_utils}.js',
      'src/{pdf,pdf.worker}.js',
    ], { base: 'src/', }),
    gulp.src([
      'examples/node/domstubs.js',
      'web/*.js',
      '!web/{pdfjs,viewer}.js',
    ], { base: '.', }),
    gulp.src('test/unit/*.js', { base: '.', }),
  ]).pipe(transform('utf8', preprocess))
    .pipe(gulp.dest('build/lib/'));
  return merge([
    buildLib,
    gulp.src('external/streams/streams-lib.js', { base: '.', })
      .pipe(gulp.dest('build/')),
    gulp.src('external/url/url-lib.js', { base: '.', })
      .pipe(gulp.dest('build/')),
  ]);
}));

gulp.task('publish', gulp.series('generic', function (done) {
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
}));

gulp.task('testing-pre', function(done) {
  process.env['TESTING'] = 'true';
  done();
});

gulp.task('test', gulp.series('testing-pre', 'generic', 'components',
    function() {
  return streamqueue({ objectMode: true, },
    createTestSource('unit'), createTestSource('browser'));
}));

gulp.task('bottest', gulp.series('testing-pre', 'generic', 'components',
    function() {
  return streamqueue({ objectMode: true, },
    createTestSource('unit', true), createTestSource('font', true),
    createTestSource('browser (no reftest)', true));
}));

gulp.task('browsertest', gulp.series('testing-pre', 'generic', 'components',
    function() {
  return createTestSource('browser');
}));

gulp.task('unittest', gulp.series('testing-pre', 'generic', 'components',
    function() {
  return createTestSource('unit');
}));

gulp.task('fonttest', gulp.series('testing-pre', function() {
  return createTestSource('font');
}));

gulp.task('makeref', gulp.series('testing-pre', 'generic', 'components',
    function(done) {
  makeRef(done);
}));

gulp.task('botmakeref', gulp.series('testing-pre', 'generic', 'components',
    function(done) {
  makeRef(done, true);
}));

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
  exec(initializeCommand, { cwd: workingDirectory, }, function (error) {
    if (error) {
      done(new Error('Baseline clone/fetch failed.'));
      return;
    }

    exec('git checkout ' + baselineCommit, { cwd: workingDirectory, },
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

gulp.task('unittestcli', gulp.series('testing-pre', 'lib', function(done) {
  var options = ['node_modules/jasmine/bin/jasmine',
                 'JASMINE_CONFIG_PATH=test/unit/clitests.json'];
  var jasmineProcess = startNode(options, { stdio: 'inherit', });
  jasmineProcess.on('close', function(code) {
    if (code !== 0) {
      done(new Error('Unit tests failed.'));
      return;
    }
    done();
  });
}));

gulp.task('lint', gulp.series('default_preferences', function(done) {
  console.log();
  console.log('### Linting JS files');

  // Ensure that we lint the Firefox specific *.jsm files too.
  var options = ['node_modules/eslint/bin/eslint', '--ext', '.js,.jsm', '.',
                 '--report-unused-disable-directives'];
  var esLintProcess = startNode(options, { stdio: 'inherit', });
  esLintProcess.on('close', function (code) {
    if (code !== 0) {
      done(new Error('ESLint failed.'));
      return;
    }

    console.log();
    console.log('### Checking supplemental files');

    if (!checkChromePreferencesFile(
          'extensions/chromium/preferences_schema.json',
          'build/default_preferences.json')) {
      done(new Error('chromium/preferences_schema is not in sync.'));
      return;
    }

    console.log('files checked, no errors found');
    done();
  });
}));

gulp.task('server', function () {
  console.log();
  console.log('### Starting local server');

  var WebServer = require('./test/webserver.js').WebServer;
  var server = new WebServer();
  server.port = 8888;
  server.start();
});

gulp.task('clean', function(done) {
  console.log();
  console.log('### Cleaning up project builds');

  rimraf(BUILD_DIR, done);
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
  console.log('### Importing translations from mozilla-central');

  if (!fs.existsSync(L10N_DIR)) {
    fs.mkdirSync(L10N_DIR);
  }
  locales.downloadL10n(L10N_DIR, done);
});

gulp.task('gh-pages-prepare', function () {
  console.log();
  console.log('### Creating web site');

  rimraf.sync(GH_PAGES_DIR);

  // 'vfs' because web/viewer.html needs its BOM.
  return merge([
    vfs.src(GENERIC_DIR + '**/*', { base: GENERIC_DIR, stripBOM: false, })
       .pipe(gulp.dest(GH_PAGES_DIR)),
    gulp.src('test/features/**/*', { base: 'test/', })
        .pipe(gulp.dest(GH_PAGES_DIR)),
    gulp.src(JSDOC_BUILD_DIR + '**/*', { base: JSDOC_BUILD_DIR, })
        .pipe(gulp.dest(GH_PAGES_DIR + 'api/draft/')),
  ]);
});

gulp.task('wintersmith', function (done) {
  var wintersmith = require('wintersmith');
  var env = wintersmith('docs/config.json');
  env.build(GH_PAGES_DIR, function(error) {
    if (error) {
      done(error);
      return;
    }
    replaceInFile(GH_PAGES_DIR + '/getting_started/index.html',
                  /STABLE_VERSION/g, config.stableVersion);
    replaceInFile(GH_PAGES_DIR + '/getting_started/index.html',
                  /BETA_VERSION/g, config.betaVersion);

    // Hide the beta version button if there is only a stable version.
    const groupClass = config.betaVersion ? 'btn-group-vertical centered' : '';
    const hiddenClass = config.betaVersion ? '' : 'hidden';
    replaceInFile(GH_PAGES_DIR + '/getting_started/index.html',
                  /GROUP_CLASS/g, groupClass);
    replaceInFile(GH_PAGES_DIR + '/getting_started/index.html',
                  /HIDDEN_CLASS/g, hiddenClass);

    console.log('Done building with wintersmith.');
    done();
  });
});

gulp.task('gh-pages-git', function (done) {
  var VERSION = getVersionJSON().version;
  var reason = process.env['PDFJS_UPDATE_REASON'];

  safeSpawnSync('git', ['init'], { cwd: GH_PAGES_DIR, });
  safeSpawnSync('git', ['remote', 'add', 'origin', REPO],
                { cwd: GH_PAGES_DIR, });
  safeSpawnSync('git', ['add', '-A'], { cwd: GH_PAGES_DIR, });
  safeSpawnSync('git', [
    'commit', '-am', 'gh-pages site created via gulpfile.js script',
    '-m', 'PDF.js version ' + VERSION + (reason ? ' - ' + reason : '')
  ], { cwd: GH_PAGES_DIR, });
  safeSpawnSync('git', ['branch', '-m', 'gh-pages'], { cwd: GH_PAGES_DIR, });

  console.log();
  console.log('Website built in ' + GH_PAGES_DIR);
  done();
});

gulp.task('web', gulp.series('generic', 'jsdoc', 'gh-pages-prepare',
                             'wintersmith', 'gh-pages-git'));

gulp.task('dist-pre', gulp.series('generic', 'components', 'image_decoders',
                                  'lib', 'minified', function() {
  var VERSION = getVersionJSON().version;

  console.log();
  console.log('### Cloning baseline distribution');

  rimraf.sync(DIST_DIR);
  mkdirp.sync(DIST_DIR);
  safeSpawnSync('git', ['clone', '--depth', '1', DIST_REPO_URL, DIST_DIR]);

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
      'worker-loader': '^2.0.0', // used in external/dist/webpack.json
    },
    peerDependencies: {
      'webpack': '^3.0.0 || ^4.0.0-alpha.0 || ^4.0.0', // from 'worker-loader'
    },
    browser: {
      'fs': false,
      'http': false,
      'https': false,
      'node-ensure': false,
      'zlib': false,
    },
    format: 'amd', // to not allow system.js to choose 'cjs'
    repository: {
      type: 'git',
      url: DIST_REPO_URL,
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
    gulp.src('external/streams/streams-lib.js', { base: '.', })
      .pipe(gulp.dest('build/dist/')),
    gulp.src('external/url/url-lib.js', { base: '.', })
      .pipe(gulp.dest('build/dist/')),
    packageJsonSrc.pipe(gulp.dest(DIST_DIR)),
    bowerJsonSrc.pipe(gulp.dest(DIST_DIR)),
    vfs.src('external/dist/**/*',
            { base: 'external/dist', stripBOM: false, })
       .pipe(gulp.dest(DIST_DIR)),
    gulp.src(GENERIC_DIR + 'LICENSE')
        .pipe(gulp.dest(DIST_DIR)),
    gulp.src(GENERIC_DIR + 'web/cmaps/**/*',
             { base: GENERIC_DIR + 'web', })
        .pipe(gulp.dest(DIST_DIR)),
    gulp.src([
      GENERIC_DIR + 'build/pdf.js',
      GENERIC_DIR + 'build/pdf.js.map',
      GENERIC_DIR + 'build/pdf.worker.js',
      GENERIC_DIR + 'build/pdf.worker.js.map',
      SRC_DIR + 'pdf.worker.entry.js',
    ]).pipe(gulp.dest(DIST_DIR + 'build/')),
    gulp.src(MINIFIED_DIR + 'build/pdf.js')
        .pipe(rename('pdf.min.js'))
        .pipe(gulp.dest(DIST_DIR + 'build/')),
    gulp.src(MINIFIED_DIR + 'build/pdf.worker.js')
        .pipe(rename('pdf.worker.min.js'))
        .pipe(gulp.dest(DIST_DIR + 'build/')),
    gulp.src(MINIFIED_DIR + 'image_decoders/pdf.image_decoders.js')
        .pipe(rename('pdf.image_decoders.min.js'))
        .pipe(gulp.dest(DIST_DIR + 'image_decoders/')),
    gulp.src(COMPONENTS_DIR + '**/*', { base: COMPONENTS_DIR, })
        .pipe(gulp.dest(DIST_DIR + 'web/')),
    gulp.src(IMAGE_DECODERS_DIR + '**/*', { base: IMAGE_DECODERS_DIR, })
        .pipe(gulp.dest(DIST_DIR + 'image_decoders')),
    gulp.src(LIB_DIR + '**/*', { base: LIB_DIR, })
        .pipe(gulp.dest(DIST_DIR + 'lib/')),
  ]);
}));

gulp.task('dist-install', gulp.series('dist-pre', function (done) {
  var distPath = DIST_DIR;
  var opts = {};
  var installPath = process.env['PDFJS_INSTALL_PATH'];
  if (installPath) {
    opts.cwd = installPath;
    distPath = path.relative(installPath, distPath);
  }
  safeSpawnSync('npm', ['install', distPath], opts);
  done();
}));

gulp.task('dist-repo-git', gulp.series('dist-pre', function (done) {
  var VERSION = getVersionJSON().version;

  console.log();
  console.log('### Committing changes');

  var reason = process.env['PDFJS_UPDATE_REASON'];
  // Attempt to work-around the broken link, see https://github.com/mozilla/pdf.js/issues/10391
  if (typeof reason === 'string') {
    var reasonParts =
      /^(See )(mozilla\/pdf\.js)@tags\/(v\d+\.\d+\.\d+)\s*$/.exec(reason);

    if (reasonParts) {
      reason = reasonParts[1] + 'https://github.com/' + reasonParts[2] +
               '/releases/tag/' + reasonParts[3];
    }
  }
  var message = 'PDF.js version ' + VERSION + (reason ? ' - ' + reason : '');
  safeSpawnSync('git', ['add', '*'], { cwd: DIST_DIR, });
  safeSpawnSync('git', ['commit', '-am', message], { cwd: DIST_DIR, });
  safeSpawnSync('git', ['tag', '-a', 'v' + VERSION, '-m', message],
                { cwd: DIST_DIR, });

  console.log();
  console.log('Done. Push with');
  console.log('  cd ' + DIST_DIR + '; ' +
              'git push --tags ' + DIST_REPO_URL + ' master');
  console.log();
  done();
}));

gulp.task('dist', gulp.series('dist-repo-git'));

gulp.task('mozcentralbaseline', gulp.series('baseline', function (done) {
  console.log();
  console.log('### Creating mozcentral baseline environment');

  // Create a mozcentral build.
  rimraf.sync(BASELINE_DIR + BUILD_DIR);

  var workingDirectory = path.resolve(process.cwd(), BASELINE_DIR);
  safeSpawnSync('gulp', ['mozcentral'],
                { env: process.env, cwd: workingDirectory, stdio: 'inherit', });

  // Copy the mozcentral build to the mozcentral baseline directory.
  rimraf.sync(MOZCENTRAL_BASELINE_DIR);
  mkdirp.sync(MOZCENTRAL_BASELINE_DIR);

  gulp.src([BASELINE_DIR + BUILD_DIR + 'mozcentral/**/*'])
      .pipe(gulp.dest(MOZCENTRAL_BASELINE_DIR))
      .on('end', function () {
        // Commit the mozcentral baseline.
        safeSpawnSync('git', ['init'], { cwd: MOZCENTRAL_BASELINE_DIR, });
        safeSpawnSync('git', ['add', '.'], { cwd: MOZCENTRAL_BASELINE_DIR, });
        safeSpawnSync('git', ['commit', '-m', '"mozcentral baseline"'],
                      { cwd: MOZCENTRAL_BASELINE_DIR, });
        done();
      });
}));

gulp.task('mozcentraldiff', gulp.series('mozcentral', 'mozcentralbaseline',
    function (done) {
  console.log();
  console.log('### Creating mozcentral diff');

  // Create the diff between the current mozcentral build and the
  // baseline mozcentral build, which both exist at this point.
  // The mozcentral baseline directory is a Git repository, so we
  // remove all files and copy the current mozcentral build files
  // into it to create the diff.
  rimraf.sync(MOZCENTRAL_BASELINE_DIR + '*');

  gulp.src([BUILD_DIR + 'mozcentral/**/*'])
      .pipe(gulp.dest(MOZCENTRAL_BASELINE_DIR))
      .on('end', function () {
        safeSpawnSync('git', ['add', '-A'], { cwd: MOZCENTRAL_BASELINE_DIR, });
        var diff = safeSpawnSync('git',
          ['diff', '--binary', '--cached', '--unified=8'],
          { cwd: MOZCENTRAL_BASELINE_DIR, }).stdout;

        createStringSource(MOZCENTRAL_DIFF_FILE, diff)
          .pipe(gulp.dest(BUILD_DIR))
          .on('end', function () {
            console.log('Result diff can be found at ' + BUILD_DIR +
                        MOZCENTRAL_DIFF_FILE);
            done();
          });
      });
}));

gulp.task('externaltest', function (done) {
  fancylog('Running test-fixtures.js');
  safeSpawnSync('node', ['external/builder/test-fixtures.js'],
                { stdio: 'inherit', });
  fancylog('Running test-fixtures_esprima.js');
  safeSpawnSync('node', ['external/builder/test-fixtures_esprima.js'],
                { stdio: 'inherit', });
  done();
});
