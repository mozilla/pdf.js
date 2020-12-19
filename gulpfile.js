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

"use strict";

var autoprefixer = require("autoprefixer");
var calc = require("postcss-calc");
var cssvariables = require("postcss-css-variables");
var fs = require("fs");
var gulp = require("gulp");
var postcss = require("gulp-postcss");
var rename = require("gulp-rename");
var replace = require("gulp-replace");
var mkdirp = require("mkdirp");
var path = require("path");
var rimraf = require("rimraf");
var stream = require("stream");
var exec = require("child_process").exec;
var spawn = require("child_process").spawn;
var spawnSync = require("child_process").spawnSync;
var streamqueue = require("streamqueue");
var merge = require("merge-stream");
var zip = require("gulp-zip");
var webpack2 = require("webpack");
var webpackStream = require("webpack-stream");
var Vinyl = require("vinyl");
var vfs = require("vinyl-fs");
var through = require("through2");

var BUILD_DIR = "build/";
var L10N_DIR = "l10n/";
var TEST_DIR = "test/";
var EXTENSION_SRC_DIR = "extensions/";

var BASELINE_DIR = BUILD_DIR + "baseline/";
var MOZCENTRAL_BASELINE_DIR = BUILD_DIR + "mozcentral.baseline/";
var GENERIC_DIR = BUILD_DIR + "generic/";
var GENERIC_ES5_DIR = BUILD_DIR + "generic-es5/";
var COMPONENTS_DIR = BUILD_DIR + "components/";
var COMPONENTS_ES5_DIR = BUILD_DIR + "components-es5/";
var IMAGE_DECODERS_DIR = BUILD_DIR + "image_decoders/";
var IMAGE_DECODERS_ES5_DIR = BUILD_DIR + "image_decoders-es5/";
var DEFAULT_PREFERENCES_DIR = BUILD_DIR + "default_preferences/";
var MINIFIED_DIR = BUILD_DIR + "minified/";
var MINIFIED_ES5_DIR = BUILD_DIR + "minified-es5/";
var JSDOC_BUILD_DIR = BUILD_DIR + "jsdoc/";
var GH_PAGES_DIR = BUILD_DIR + "gh-pages/";
var SRC_DIR = "src/";
var LIB_DIR = BUILD_DIR + "lib/";
var DIST_DIR = BUILD_DIR + "dist/";
var TYPES_DIR = BUILD_DIR + "types/";
const TMP_DIR = BUILD_DIR + "tmp/";
var TYPESTEST_DIR = BUILD_DIR + "typestest/";
var COMMON_WEB_FILES = ["web/images/*.{png,svg,gif,cur}", "web/debugger.js"];
var MOZCENTRAL_DIFF_FILE = "mozcentral.diff";

var REPO = "git@github.com:mozilla/pdf.js.git";
var DIST_REPO_URL = "https://github.com/mozilla/pdfjs-dist";

var builder = require("./external/builder/builder.js");

var CONFIG_FILE = "pdfjs.config";
var config = JSON.parse(fs.readFileSync(CONFIG_FILE).toString());

// Default Autoprefixer config used for generic, components, minified-pre
var AUTOPREFIXER_CONFIG = {
  overrideBrowserslist: [
    "last 2 versions",
    "Chrome >= 49", // Last supported on Windows XP
    "Firefox >= 52", // Last supported on Windows XP
    "Firefox ESR",
    "Safari >= 10",
    "> 0.5%",
    "not dead",
  ],
};
var CSS_VARIABLES_CONFIG = {
  preserve: true,
};

const DEFINES = Object.freeze({
  PRODUCTION: true,
  SKIP_BABEL: true,
  TESTING: false,
  // The main build targets:
  GENERIC: false,
  MOZCENTRAL: false,
  CHROME: false,
  MINIFIED: false,
  COMPONENTS: false,
  LIB: false,
  IMAGE_DECODERS: false,
});

function transform(charEncoding, transformFunction) {
  return through.obj(function (vinylFile, enc, done) {
    var transformedFile = vinylFile.clone();
    transformedFile.contents = Buffer.from(
      transformFunction(transformedFile.contents),
      charEncoding
    );
    done(null, transformedFile);
  });
}

function safeSpawnSync(command, parameters, options) {
  // Execute all commands in a shell.
  options = options || {};
  options.shell = true;
  // `options.shell = true` requires parameters to be quoted.
  parameters = parameters.map(param => {
    if (!/[\s`~!#$*(){[|\\;'"<>?]/.test(param)) {
      return param;
    }
    return '"' + param.replace(/([$\\"`])/g, "\\$1") + '"';
  });

  var result = spawnSync(command, parameters, options);
  if (result.status !== 0) {
    console.log(
      'Error: command "' +
        command +
        '" with parameters "' +
        parameters +
        '" exited with code ' +
        result.status
    );
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
  args.unshift("--max-http-header-size=80000");
  return spawn("node", args, options);
}

function createStringSource(filename, content) {
  var source = stream.Readable({ objectMode: true });
  source._read = function () {
    this.push(
      new Vinyl({
        path: filename,
        contents: Buffer.from(content),
      })
    );
    this.push(null);
  };
  return source;
}

function createWebpackConfig(
  defines,
  output,
  {
    disableVersionInfo = false,
    disableSourceMaps = false,
    disableLicenseHeader = false,
  } = {}
) {
  const versionInfo = !disableVersionInfo
    ? getVersionJSON()
    : { version: 0, commit: 0 };
  var bundleDefines = builder.merge(defines, {
    BUNDLE_VERSION: versionInfo.version,
    BUNDLE_BUILD: versionInfo.commit,
    TESTING: defines.TESTING || process.env.TESTING === "true",
  });
  var licenseHeaderLibre = fs
    .readFileSync("./src/license_header_libre.js")
    .toString();
  var enableSourceMaps =
    !bundleDefines.MOZCENTRAL &&
    !bundleDefines.CHROME &&
    !bundleDefines.LIB &&
    !bundleDefines.TESTING &&
    !disableSourceMaps;
  var skipBabel = bundleDefines.SKIP_BABEL;

  // `core-js` (see https://github.com/zloirock/core-js/issues/514),
  // `web-streams-polyfill` (already using a transpiled file), and
  // `src/core/{glyphlist,unicode}.js` (Babel is too slow for those when
  // source-maps are enabled) should be excluded from processing.
  const babelExcludes = [
    "node_modules[\\\\\\/]core-js",
    "node_modules[\\\\\\/]web-streams-polyfill",
  ];
  if (enableSourceMaps) {
    babelExcludes.push("src[\\\\\\/]core[\\\\\\/](glyphlist|unicode)");
  }
  const babelExcludeRegExp = new RegExp(`(${babelExcludes.join("|")})`);

  const plugins = [];
  if (!disableLicenseHeader) {
    plugins.push(
      new webpack2.BannerPlugin({ banner: licenseHeaderLibre, raw: true })
    );
  }

  // Required to expose e.g., the `window` object.
  output.globalObject = "this";

  return {
    mode: "none",
    output: output,
    performance: {
      hints: false, // Disable messages about larger file sizes.
    },
    plugins,
    resolve: {
      alias: {
        pdfjs: path.join(__dirname, "src"),
        "pdfjs-web": path.join(__dirname, "web"),
        "pdfjs-lib": path.join(__dirname, "web/pdfjs"),
      },
    },
    devtool: enableSourceMaps ? "source-map" : undefined,
    module: {
      rules: [
        {
          loader: "babel-loader",
          exclude: babelExcludeRegExp,
          options: {
            presets: skipBabel ? undefined : ["@babel/preset-env"],
            plugins: [
              "@babel/plugin-proposal-logical-assignment-operators",
              "@babel/plugin-transform-modules-commonjs",
              [
                "@babel/plugin-transform-runtime",
                {
                  helpers: false,
                  regenerator: true,
                },
              ],
            ],
          },
        },
        {
          loader: path.join(__dirname, "external/webpack/pdfjsdev-loader.js"),
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

function webpack2Stream(webpackConfig) {
  // Replacing webpack1 to webpack2 in the webpack-stream.
  return webpackStream(webpackConfig, webpack2);
}

function getVersionJSON() {
  return JSON.parse(fs.readFileSync(BUILD_DIR + "version.json").toString());
}

function checkChromePreferencesFile(chromePrefsPath, webPrefsPath) {
  var chromePrefs = JSON.parse(fs.readFileSync(chromePrefsPath).toString());
  var chromePrefsKeys = Object.keys(chromePrefs.properties);
  chromePrefsKeys = chromePrefsKeys.filter(function (key) {
    var description = chromePrefs.properties[key].description;
    // Deprecated keys are allowed in the managed preferences file.
    // The code maintained is responsible for adding migration logic to
    // extensions/chromium/options/migration.js and web/chromecom.js .
    return !description || !description.startsWith("DEPRECATED.");
  });
  chromePrefsKeys.sort();
  var webPrefs = JSON.parse(fs.readFileSync(webPrefsPath).toString());
  var webPrefsKeys = Object.keys(webPrefs);
  webPrefsKeys.sort();
  var telemetryIndex = chromePrefsKeys.indexOf("disableTelemetry");
  if (telemetryIndex >= 0) {
    chromePrefsKeys.splice(telemetryIndex, 1);
  } else {
    console.log("Warning: disableTelemetry key not found in chrome prefs!");
    return false;
  }
  if (webPrefsKeys.length !== chromePrefsKeys.length) {
    console.log("Warning: Prefs objects haven't the same length");
    return false;
  }

  let ret = true;
  for (let i = 0, ii = webPrefsKeys.length; i < ii; i++) {
    const value = webPrefsKeys[i];
    if (chromePrefsKeys[i] !== value) {
      ret = false;
      console.log(
        `Warning: not the same keys: ${chromePrefsKeys[i]} !== ${value}`
      );
    } else if (chromePrefs.properties[value].default !== webPrefs[value]) {
      ret = false;
      console.log(
        `Warning: not the same values: ${chromePrefs.properties[value].default} !== ${webPrefs[value]}`
      );
    }
  }
  return ret;
}

function replaceWebpackRequire() {
  // Produced bundles can be rebundled again, avoid collisions (e.g. in api.js)
  // by renaming  __webpack_require__ to something else.
  return replace("__webpack_require__", "__w_pdfjs_require__");
}

function replaceJSRootName(amdName, jsName) {
  // Saving old-style JS module name.
  return replace(
    'root["' + amdName + '"] = factory()',
    'root["' + amdName + '"] = root.' + jsName + " = factory()"
  );
}

function createMainBundle(defines) {
  var mainAMDName = "pdfjs-dist/build/pdf";
  var mainOutputName = "pdf.js";

  var mainFileConfig = createWebpackConfig(defines, {
    filename: mainOutputName,
    library: mainAMDName,
    libraryTarget: "umd",
    umdNamedDefine: true,
  });
  return gulp
    .src("./src/pdf.js")
    .pipe(webpack2Stream(mainFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceJSRootName(mainAMDName, "pdfjsLib"));
}

function createScriptingBundle(defines, extraOptions = undefined) {
  var scriptingAMDName = "pdfjs-dist/build/pdf.scripting";
  var scriptingOutputName = "pdf.scripting.js";

  var scriptingFileConfig = createWebpackConfig(
    defines,
    {
      filename: scriptingOutputName,
      library: scriptingAMDName,
      libraryTarget: "umd",
      umdNamedDefine: true,
    },
    extraOptions
  );
  return gulp
    .src("./src/pdf.scripting.js")
    .pipe(webpack2Stream(scriptingFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(
      replace(
        'root["' + scriptingAMDName + '"] = factory()',
        "root.pdfjsScripting = factory()"
      )
    );
}

function createSandboxExternal(defines) {
  const preprocessor2 = require("./external/builder/preprocessor2.js");
  const licenseHeader = fs.readFileSync("./src/license_header.js").toString();

  const ctx = {
    saveComments: false,
    defines,
  };
  return gulp.src("./src/pdf.sandbox.external.js").pipe(
    transform("utf8", content => {
      content = preprocessor2.preprocessPDFJSCode(ctx, content);
      return `${licenseHeader}\n${content}`;
    })
  );
}

function createTemporaryScriptingBundle(defines, extraOptions = undefined) {
  return createScriptingBundle(defines, {
    disableVersionInfo: !!(extraOptions && extraOptions.disableVersionInfo),
    disableSourceMaps: true,
    disableLicenseHeader: true,
  }).pipe(gulp.dest(TMP_DIR));
}

function createSandboxBundle(defines, extraOptions = undefined) {
  var sandboxAMDName = "pdfjs-dist/build/pdf.sandbox";
  var sandboxOutputName = "pdf.sandbox.js";

  const scriptingPath = TMP_DIR + "pdf.scripting.js";
  // Insert the source as a string to be `eval`-ed in the sandbox.
  const sandboxDefines = builder.merge(defines, {
    PDF_SCRIPTING_JS_SOURCE: fs.readFileSync(scriptingPath).toString(),
  });
  fs.unlinkSync(scriptingPath);

  var sandboxFileConfig = createWebpackConfig(
    sandboxDefines,
    {
      filename: sandboxOutputName,
      library: sandboxAMDName,
      libraryTarget: "umd",
      umdNamedDefine: true,
    },
    extraOptions
  );

  return gulp
    .src("./src/pdf.sandbox.js")
    .pipe(webpack2Stream(sandboxFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceJSRootName(sandboxAMDName, "pdfjsSandbox"));
}

function createWorkerBundle(defines) {
  var workerAMDName = "pdfjs-dist/build/pdf.worker";
  var workerOutputName = "pdf.worker.js";

  var workerFileConfig = createWebpackConfig(defines, {
    filename: workerOutputName,
    library: workerAMDName,
    libraryTarget: "umd",
    umdNamedDefine: true,
  });
  return gulp
    .src("./src/pdf.worker.js")
    .pipe(webpack2Stream(workerFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceJSRootName(workerAMDName, "pdfjsWorker"));
}

function createWebBundle(defines) {
  var viewerOutputName = "viewer.js";

  var viewerFileConfig = createWebpackConfig(defines, {
    filename: viewerOutputName,
  });
  return gulp.src("./web/viewer.js").pipe(webpack2Stream(viewerFileConfig));
}

function createComponentsBundle(defines) {
  var componentsAMDName = "pdfjs-dist/web/pdf_viewer";
  var componentsOutputName = "pdf_viewer.js";

  var componentsFileConfig = createWebpackConfig(defines, {
    filename: componentsOutputName,
    library: componentsAMDName,
    libraryTarget: "umd",
    umdNamedDefine: true,
  });
  return gulp
    .src("./web/pdf_viewer.component.js")
    .pipe(webpack2Stream(componentsFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceJSRootName(componentsAMDName, "pdfjsViewer"));
}

function createImageDecodersBundle(defines) {
  var imageDecodersAMDName = "pdfjs-dist/image_decoders/pdf.image_decoders";
  var imageDecodersOutputName = "pdf.image_decoders.js";

  var componentsFileConfig = createWebpackConfig(defines, {
    filename: imageDecodersOutputName,
    library: imageDecodersAMDName,
    libraryTarget: "umd",
    umdNamedDefine: true,
  });
  return gulp
    .src("./src/pdf.image_decoders.js")
    .pipe(webpack2Stream(componentsFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceJSRootName(imageDecodersAMDName, "pdfjsImageDecoders"));
}

function checkFile(filePath) {
  try {
    var stat = fs.lstatSync(filePath);
    return stat.isFile();
  } catch (e) {
    return false;
  }
}

function checkDir(dirPath) {
  try {
    var stat = fs.lstatSync(dirPath);
    return stat.isDirectory();
  } catch (e) {
    return false;
  }
}

function replaceInFile(filePath, find, replacement) {
  var content = fs.readFileSync(filePath).toString();
  content = content.replace(find, replacement);
  fs.writeFileSync(filePath, content);
}

function getTempFile(prefix, suffix) {
  mkdirp.sync(BUILD_DIR + "tmp/");
  var bytes = require("crypto").randomBytes(6).toString("hex");
  var filePath = BUILD_DIR + "tmp/" + prefix + bytes + suffix;
  fs.writeFileSync(filePath, "");
  return filePath;
}

function createTestSource(testsName, bot) {
  var source = stream.Readable({ objectMode: true });
  source._read = function () {
    console.log();
    console.log("### Running " + testsName + " tests");

    var PDF_TEST = process.env.PDF_TEST || "test_manifest.json";
    var args = ["test.js"];
    switch (testsName) {
      case "browser":
        args.push("--reftest", "--manifestFile=" + PDF_TEST);
        break;
      case "browser (no reftest)":
        args.push("--manifestFile=" + PDF_TEST);
        break;
      case "unit":
        args.push("--unitTest");
        break;
      case "font":
        args.push("--fontTest");
        break;
      case "integration":
        args.push("--integration");
        break;
      default:
        this.emit("error", new Error("Unknown name: " + testsName));
        return null;
    }
    if (bot) {
      args.push("--strictVerify");
    }
    if (process.argv.includes("--noChrome")) {
      args.push("--noChrome");
    }

    var testProcess = startNode(args, { cwd: TEST_DIR, stdio: "inherit" });
    testProcess.on("close", function (code) {
      source.push(null);
    });
    return undefined;
  };
  return source;
}

function makeRef(done, bot) {
  console.log();
  console.log("### Creating reference images");

  var args = ["test.js", "--masterMode"];
  if (bot) {
    args.push("--noPrompts", "--strictVerify");
  }
  if (process.argv.includes("--noChrome")) {
    args.push("--noChrome");
  }

  var testProcess = startNode(args, { cwd: TEST_DIR, stdio: "inherit" });
  testProcess.on("close", function (code) {
    done();
  });
}

gulp.task("default", function (done) {
  console.log("Available tasks:");
  var tasks = Object.keys(gulp.registry().tasks());
  tasks.sort();
  tasks.forEach(function (taskName) {
    console.log("  " + taskName);
  });
  done();
});

gulp.task("buildnumber", function (done) {
  console.log();
  console.log("### Getting extension build number");

  exec(
    "git log --format=oneline " + config.baseVersion + "..",
    function (err, stdout, stderr) {
      var buildNumber = 0;
      if (!err) {
        // Build number is the number of commits since base version
        buildNumber = stdout ? stdout.match(/\n/g).length : 0;
      } else {
        console.log(
          "This is not a Git repository; using default build number."
        );
      }

      console.log("Extension build number: " + buildNumber);

      var version = config.versionPrefix + buildNumber;

      exec('git log --format="%h" -n 1', function (err2, stdout2, stderr2) {
        var buildCommit = "";
        if (!err2) {
          buildCommit = stdout2.replace("\n", "");
        }

        createStringSource(
          "version.json",
          JSON.stringify(
            {
              version: version,
              build: buildNumber,
              commit: buildCommit,
            },
            null,
            2
          )
        )
          .pipe(gulp.dest(BUILD_DIR))
          .on("end", done);
      });
    }
  );
});

gulp.task("default_preferences-pre", function () {
  console.log();
  console.log("### Building `default_preferences.json`");

  // Refer to the comment in the 'lib' task below.
  function babelPluginReplaceNonWebPackRequire(babel) {
    return {
      visitor: {
        Identifier(curPath, state) {
          if (curPath.node.name === "__non_webpack_require__") {
            curPath.replaceWith(babel.types.identifier("require"));
          }
        },
      },
    };
  }
  function preprocess(content) {
    content = preprocessor2.preprocessPDFJSCode(ctx, content);
    return babel.transform(content, {
      sourceType: "module",
      presets: undefined, // SKIP_BABEL
      plugins: [
        "@babel/plugin-proposal-logical-assignment-operators",
        "@babel/plugin-transform-modules-commonjs",
        babelPluginReplaceNonWebPackRequire,
      ],
    }).code;
  }
  var babel = require("@babel/core");
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
      "pdfjs-lib": "../pdf",
    },
  };
  var preprocessor2 = require("./external/builder/preprocessor2.js");
  return merge([
    gulp.src(["web/{app_options,viewer_compatibility}.js"], {
      base: ".",
    }),
  ])
    .pipe(transform("utf8", preprocess))
    .pipe(gulp.dest(DEFAULT_PREFERENCES_DIR + "lib/"));
});

gulp.task(
  "default_preferences",
  gulp.series("default_preferences-pre", function (done) {
    var AppOptionsLib = require("./" +
      DEFAULT_PREFERENCES_DIR +
      "lib/web/app_options.js");
    var AppOptions = AppOptionsLib.AppOptions;
    var OptionKind = AppOptionsLib.OptionKind;

    createStringSource(
      "default_preferences.json",
      JSON.stringify(AppOptions.getAll(OptionKind.PREFERENCE), null, 2)
    )
      .pipe(gulp.dest(BUILD_DIR))
      .on("end", done);
  })
);

gulp.task("locale", function () {
  var VIEWER_LOCALE_OUTPUT = "web/locale/";

  console.log();
  console.log("### Building localization files");

  rimraf.sync(VIEWER_LOCALE_OUTPUT);
  mkdirp.sync(VIEWER_LOCALE_OUTPUT);

  var subfolders = fs.readdirSync(L10N_DIR);
  subfolders.sort();
  var viewerOutput = "";
  var locales = [];
  for (var i = 0; i < subfolders.length; i++) {
    var locale = subfolders[i];
    var dirPath = L10N_DIR + locale;
    if (!checkDir(dirPath)) {
      continue;
    }
    if (!/^[a-z][a-z]([a-z])?(-[A-Z][A-Z])?$/.test(locale)) {
      console.log("Skipping invalid locale: " + locale);
      continue;
    }

    mkdirp.sync(VIEWER_LOCALE_OUTPUT + "/" + locale);

    locales.push(locale);

    if (checkFile(dirPath + "/viewer.properties")) {
      viewerOutput +=
        "[" +
        locale +
        "]\n" +
        "@import url(" +
        locale +
        "/viewer.properties)\n\n";
    }
  }

  return merge([
    createStringSource("locale.properties", viewerOutput).pipe(
      gulp.dest(VIEWER_LOCALE_OUTPUT)
    ),
    gulp
      .src(L10N_DIR + "/{" + locales.join(",") + "}/viewer.properties", {
        base: L10N_DIR,
      })
      .pipe(gulp.dest(VIEWER_LOCALE_OUTPUT)),
  ]);
});

gulp.task("cmaps", function (done) {
  var CMAP_INPUT = "external/cmaps";
  var VIEWER_CMAP_OUTPUT = "external/bcmaps";

  console.log();
  console.log("### Building cmaps");

  // Testing a file that usually present.
  if (!checkFile(CMAP_INPUT + "/UniJIS-UCS2-H")) {
    console.log("./external/cmaps has no cmap files, download them from:");
    console.log("  https://github.com/adobe-type-tools/cmap-resources");
    throw new Error("cmap files were not found");
  }

  // Remove old bcmap files.
  fs.readdirSync(VIEWER_CMAP_OUTPUT).forEach(function (file) {
    if (/\.bcmap$/i.test(file)) {
      fs.unlinkSync(VIEWER_CMAP_OUTPUT + "/" + file);
    }
  });

  var compressCmaps = require("./external/cmapscompress/compress.js")
    .compressCmaps;
  compressCmaps(CMAP_INPUT, VIEWER_CMAP_OUTPUT, true);
  done();
});

function preprocessCSS(source, mode, defines, cleanup) {
  var outName = getTempFile("~preprocess", ".css");
  builder.preprocessCSS(mode, source, outName);
  var out = fs.readFileSync(outName).toString();
  fs.unlinkSync(outName);
  if (cleanup) {
    // Strip out all license headers in the middle.
    var reg = /\n\/\* Copyright(.|\n)*?Mozilla Foundation(.|\n)*?\*\//g;
    out = out.replace(reg, "");
  }

  var i = source.lastIndexOf("/");
  return createStringSource(source.substr(i + 1), out);
}

function preprocessHTML(source, defines) {
  var outName = getTempFile("~preprocess", ".html");
  builder.preprocess(source, outName, defines);
  var out = fs.readFileSync(outName).toString();
  fs.unlinkSync(outName);

  var i = source.lastIndexOf("/");
  return createStringSource(source.substr(i + 1), out);
}

function buildGeneric(defines, dir) {
  rimraf.sync(dir);

  return merge([
    createMainBundle(defines).pipe(gulp.dest(dir + "build")),
    createWorkerBundle(defines).pipe(gulp.dest(dir + "build")),
    createSandboxBundle(defines).pipe(gulp.dest(dir + "build")),
    createWebBundle(defines).pipe(gulp.dest(dir + "web")),
    gulp.src(COMMON_WEB_FILES, { base: "web/" }).pipe(gulp.dest(dir + "web")),
    gulp.src("LICENSE").pipe(gulp.dest(dir)),
    gulp
      .src(["web/locale/*/viewer.properties", "web/locale/locale.properties"], {
        base: "web/",
      })
      .pipe(gulp.dest(dir + "web")),
    gulp
      .src(["external/bcmaps/*.bcmap", "external/bcmaps/LICENSE"], {
        base: "external/bcmaps",
      })
      .pipe(gulp.dest(dir + "web/cmaps")),
    preprocessHTML("web/viewer.html", defines).pipe(gulp.dest(dir + "web")),
    preprocessCSS("web/viewer.css", "generic", defines, true)
      .pipe(
        postcss([
          cssvariables(CSS_VARIABLES_CONFIG),
          calc(),
          autoprefixer(AUTOPREFIXER_CONFIG),
        ])
      )
      .pipe(gulp.dest(dir + "web")),

    gulp
      .src("web/compressed.tracemonkey-pldi-09.pdf")
      .pipe(gulp.dest(dir + "web")),
  ]);
}

// Builds the generic production viewer that is only compatible with up-to-date
// HTML5 browsers, which implement modern ECMAScript features.
gulp.task(
  "generic",
  gulp.series(
    "buildnumber",
    "default_preferences",
    "locale",
    function scripting() {
      var defines = builder.merge(DEFINES, { GENERIC: true });
      return createTemporaryScriptingBundle(defines);
    },
    function () {
      console.log();
      console.log("### Creating generic viewer");
      var defines = builder.merge(DEFINES, { GENERIC: true });

      return buildGeneric(defines, GENERIC_DIR);
    }
  )
);

// Builds the generic production viewer that should be compatible with most
// older HTML5 browsers.
gulp.task(
  "generic-es5",
  gulp.series(
    "buildnumber",
    "default_preferences",
    "locale",
    function scripting() {
      var defines = builder.merge(DEFINES, {
        GENERIC: true,
        SKIP_BABEL: false,
      });
      return createTemporaryScriptingBundle(defines);
    },
    function () {
      console.log();
      console.log("### Creating generic (ES5) viewer");
      var defines = builder.merge(DEFINES, {
        GENERIC: true,
        SKIP_BABEL: false,
      });

      return buildGeneric(defines, GENERIC_ES5_DIR);
    }
  )
);

function buildComponents(defines, dir) {
  rimraf.sync(dir);

  var COMPONENTS_IMAGES = [
    "web/images/annotation-*.svg",
    "web/images/loading-icon.gif",
    "web/images/shadow.png",
  ];

  return merge([
    createComponentsBundle(defines).pipe(gulp.dest(dir)),
    gulp.src(COMPONENTS_IMAGES).pipe(gulp.dest(dir + "images")),
    preprocessCSS("web/pdf_viewer.css", "components", defines, true)
      .pipe(
        postcss([
          cssvariables(CSS_VARIABLES_CONFIG),
          calc(),
          autoprefixer(AUTOPREFIXER_CONFIG),
        ])
      )
      .pipe(gulp.dest(dir)),
  ]);
}

gulp.task(
  "components",
  gulp.series("buildnumber", function () {
    console.log();
    console.log("### Creating generic components");
    var defines = builder.merge(DEFINES, { COMPONENTS: true, GENERIC: true });

    return buildComponents(defines, COMPONENTS_DIR);
  })
);

gulp.task(
  "components-es5",
  gulp.series("buildnumber", function () {
    console.log();
    console.log("### Creating generic (ES5) components");
    var defines = builder.merge(DEFINES, {
      COMPONENTS: true,
      GENERIC: true,
      SKIP_BABEL: false,
    });

    return buildComponents(defines, COMPONENTS_ES5_DIR);
  })
);

gulp.task(
  "image_decoders",
  gulp.series("buildnumber", function () {
    console.log();
    console.log("### Creating image decoders");
    var defines = builder.merge(DEFINES, {
      GENERIC: true,
      IMAGE_DECODERS: true,
    });

    return createImageDecodersBundle(defines).pipe(
      gulp.dest(IMAGE_DECODERS_DIR)
    );
  })
);

gulp.task(
  "image_decoders-es5",
  gulp.series("buildnumber", function () {
    console.log();
    console.log("### Creating (ES5) image decoders");
    var defines = builder.merge(DEFINES, {
      GENERIC: true,
      IMAGE_DECODERS: true,
      SKIP_BABEL: false,
    });

    return createImageDecodersBundle(defines).pipe(
      gulp.dest(IMAGE_DECODERS_ES5_DIR)
    );
  })
);

function buildMinified(defines, dir) {
  rimraf.sync(dir);

  return merge([
    createMainBundle(defines).pipe(gulp.dest(dir + "build")),
    createWorkerBundle(defines).pipe(gulp.dest(dir + "build")),
    createSandboxBundle(defines).pipe(gulp.dest(dir + "build")),
    createWebBundle(defines).pipe(gulp.dest(dir + "web")),
    createImageDecodersBundle(
      builder.merge(defines, { IMAGE_DECODERS: true })
    ).pipe(gulp.dest(dir + "image_decoders")),
    gulp.src(COMMON_WEB_FILES, { base: "web/" }).pipe(gulp.dest(dir + "web")),
    gulp
      .src(["web/locale/*/viewer.properties", "web/locale/locale.properties"], {
        base: "web/",
      })
      .pipe(gulp.dest(dir + "web")),
    gulp
      .src(["external/bcmaps/*.bcmap", "external/bcmaps/LICENSE"], {
        base: "external/bcmaps",
      })
      .pipe(gulp.dest(dir + "web/cmaps")),

    preprocessHTML("web/viewer.html", defines).pipe(gulp.dest(dir + "web")),
    preprocessCSS("web/viewer.css", "minified", defines, true)
      .pipe(
        postcss([
          cssvariables(CSS_VARIABLES_CONFIG),
          calc(),
          autoprefixer(AUTOPREFIXER_CONFIG),
        ])
      )
      .pipe(gulp.dest(dir + "web")),

    gulp
      .src("web/compressed.tracemonkey-pldi-09.pdf")
      .pipe(gulp.dest(dir + "web")),
  ]);
}

gulp.task(
  "minified-pre",
  gulp.series(
    "buildnumber",
    "default_preferences",
    "locale",
    function scripting() {
      var defines = builder.merge(DEFINES, { MINIFIED: true, GENERIC: true });
      return createTemporaryScriptingBundle(defines);
    },
    function () {
      console.log();
      console.log("### Creating minified viewer");
      var defines = builder.merge(DEFINES, { MINIFIED: true, GENERIC: true });

      return buildMinified(defines, MINIFIED_DIR);
    }
  )
);

gulp.task(
  "minified-es5-pre",
  gulp.series(
    "buildnumber",
    "default_preferences",
    "locale",
    function scripting() {
      var defines = builder.merge(DEFINES, {
        MINIFIED: true,
        GENERIC: true,
        SKIP_BABEL: false,
      });
      return createTemporaryScriptingBundle(defines);
    },
    function () {
      console.log();
      console.log("### Creating minified (ES5) viewer");
      var defines = builder.merge(DEFINES, {
        MINIFIED: true,
        GENERIC: true,
        SKIP_BABEL: false,
      });

      return buildMinified(defines, MINIFIED_ES5_DIR);
    }
  )
);

async function parseMinified(dir) {
  var pdfFile = fs.readFileSync(dir + "/build/pdf.js").toString();
  var pdfWorkerFile = fs.readFileSync(dir + "/build/pdf.worker.js").toString();
  var pdfSandboxFile = fs
    .readFileSync(dir + "/build/pdf.sandbox.js")
    .toString();
  var pdfImageDecodersFile = fs
    .readFileSync(dir + "/image_decoders/pdf.image_decoders.js")
    .toString();
  var viewerFiles = {
    "pdf.js": pdfFile,
    "viewer.js": fs.readFileSync(dir + "/web/viewer.js").toString(),
  };

  console.log();
  console.log("### Minifying js files");

  var Terser = require("terser");
  var options = {
    compress: {
      // V8 chokes on very long sequences, work around that.
      sequences: false,
    },
    keep_classnames: true,
    keep_fnames: true,
  };

  fs.writeFileSync(
    dir + "/web/pdf.viewer.js",
    (await Terser.minify(viewerFiles, options)).code
  );
  fs.writeFileSync(
    dir + "/build/pdf.min.js",
    (await Terser.minify(pdfFile, options)).code
  );
  fs.writeFileSync(
    dir + "/build/pdf.worker.min.js",
    (await Terser.minify(pdfWorkerFile, options)).code
  );
  fs.writeFileSync(
    dir + "/build/pdf.sandbox.min.js",
    (await Terser.minify(pdfSandboxFile, options)).code
  );
  fs.writeFileSync(
    dir + "image_decoders/pdf.image_decoders.min.js",
    (await Terser.minify(pdfImageDecodersFile, options)).code
  );

  console.log();
  console.log("### Cleaning js files");

  fs.unlinkSync(dir + "/web/viewer.js");
  fs.unlinkSync(dir + "/web/debugger.js");
  fs.unlinkSync(dir + "/build/pdf.js");
  fs.unlinkSync(dir + "/build/pdf.worker.js");
  fs.unlinkSync(dir + "/build/pdf.sandbox.js");

  fs.renameSync(dir + "/build/pdf.min.js", dir + "/build/pdf.js");
  fs.renameSync(dir + "/build/pdf.worker.min.js", dir + "/build/pdf.worker.js");
  fs.renameSync(
    dir + "/build/pdf.sandbox.min.js",
    dir + "/build/pdf.sandbox.js"
  );
  fs.renameSync(
    dir + "/image_decoders/pdf.image_decoders.min.js",
    dir + "/image_decoders/pdf.image_decoders.js"
  );
}

gulp.task(
  "minified",
  gulp.series("minified-pre", async function (done) {
    await parseMinified(MINIFIED_DIR);
    done();
  })
);

gulp.task(
  "minified-es5",
  gulp.series("minified-es5-pre", async function (done) {
    await parseMinified(MINIFIED_ES5_DIR);
    done();
  })
);

function preprocessDefaultPreferences(content) {
  var preprocessor2 = require("./external/builder/preprocessor2.js");
  var licenseHeader = fs.readFileSync("./src/license_header.js").toString();

  var GLOBALS = "/* eslint-disable */\n";
  var MODIFICATION_WARNING =
    "//\n// THIS FILE IS GENERATED AUTOMATICALLY, DO NOT EDIT MANUALLY!\n//\n";

  content = preprocessor2.preprocessPDFJSCode(
    {
      rootPath: __dirname,
      defines: DEFINES,
    },
    content
  );

  return (
    licenseHeader +
    "\n" +
    GLOBALS +
    "\n" +
    MODIFICATION_WARNING +
    "\n" +
    content +
    "\n"
  );
}

gulp.task(
  "mozcentral-pre",
  gulp.series("buildnumber", "default_preferences", function () {
    console.log();
    console.log("### Building mozilla-central extension");
    var defines = builder.merge(DEFINES, { MOZCENTRAL: true });

    var MOZCENTRAL_DIR = BUILD_DIR + "mozcentral/",
      MOZCENTRAL_EXTENSION_DIR = MOZCENTRAL_DIR + "browser/extensions/pdfjs/",
      MOZCENTRAL_CONTENT_DIR = MOZCENTRAL_EXTENSION_DIR + "content/",
      FIREFOX_EXTENSION_DIR = "extensions/firefox/",
      MOZCENTRAL_L10N_DIR = MOZCENTRAL_DIR + "browser/locales/en-US/pdfviewer/",
      FIREFOX_CONTENT_DIR = EXTENSION_SRC_DIR + "/firefox/content/";

    // Clear out everything in the firefox extension build directory
    rimraf.sync(MOZCENTRAL_DIR);

    var versionJSON = getVersionJSON();
    var version = versionJSON.version,
      commit = versionJSON.commit;

    // Ignore the fallback cursor images, since they're unnecessary in Firefox.
    const MOZCENTRAL_COMMON_WEB_FILES = [
      ...COMMON_WEB_FILES,
      "!web/images/*.cur",
    ];

    return merge([
      createMainBundle(defines).pipe(
        gulp.dest(MOZCENTRAL_CONTENT_DIR + "build")
      ),
      createScriptingBundle(defines).pipe(
        gulp.dest(MOZCENTRAL_CONTENT_DIR + "build")
      ),
      createSandboxExternal(defines).pipe(
        gulp.dest(MOZCENTRAL_CONTENT_DIR + "build")
      ),
      createWorkerBundle(defines).pipe(
        gulp.dest(MOZCENTRAL_CONTENT_DIR + "build")
      ),
      createWebBundle(defines).pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + "web")),
      gulp
        .src(MOZCENTRAL_COMMON_WEB_FILES, { base: "web/" })
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + "web")),
      gulp
        .src(["external/bcmaps/*.bcmap", "external/bcmaps/LICENSE"], {
          base: "external/bcmaps",
        })
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + "web/cmaps")),

      preprocessHTML("web/viewer.html", defines).pipe(
        gulp.dest(MOZCENTRAL_CONTENT_DIR + "web")
      ),
      preprocessCSS("web/viewer.css", "mozcentral", defines, true)
        .pipe(
          postcss([
            autoprefixer({ overrideBrowserslist: ["last 1 firefox versions"] }),
          ])
        )
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + "web")),

      gulp.src("l10n/en-US/*.properties").pipe(gulp.dest(MOZCENTRAL_L10N_DIR)),
      gulp
        .src(FIREFOX_EXTENSION_DIR + "README.mozilla")
        .pipe(replace(/\bPDFJSSCRIPT_VERSION\b/g, version))
        .pipe(replace(/\bPDFJSSCRIPT_COMMIT\b/g, commit))
        .pipe(gulp.dest(MOZCENTRAL_EXTENSION_DIR)),
      gulp.src("LICENSE").pipe(gulp.dest(MOZCENTRAL_EXTENSION_DIR)),
      gulp
        .src(FIREFOX_CONTENT_DIR + "PdfJsDefaultPreferences.jsm")
        .pipe(transform("utf8", preprocessDefaultPreferences))
        .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR)),
    ]);
  })
);

gulp.task("mozcentral", gulp.series("mozcentral-pre"));

gulp.task(
  "chromium-pre",
  gulp.series(
    "buildnumber",
    "default_preferences",
    "locale",
    function scripting() {
      var defines = builder.merge(DEFINES, { CHROME: true, SKIP_BABEL: false });
      return createTemporaryScriptingBundle(defines);
    },
    function () {
      console.log();
      console.log("### Building Chromium extension");
      var defines = builder.merge(DEFINES, { CHROME: true, SKIP_BABEL: false });

      var CHROME_BUILD_DIR = BUILD_DIR + "/chromium/",
        CHROME_BUILD_CONTENT_DIR = CHROME_BUILD_DIR + "/content/";

      // Clear out everything in the chrome extension build directory
      rimraf.sync(CHROME_BUILD_DIR);

      var version = getVersionJSON().version;

      return merge([
        createMainBundle(defines).pipe(
          gulp.dest(CHROME_BUILD_CONTENT_DIR + "build")
        ),
        createWorkerBundle(defines).pipe(
          gulp.dest(CHROME_BUILD_CONTENT_DIR + "build")
        ),
        createSandboxBundle(defines).pipe(
          gulp.dest(CHROME_BUILD_CONTENT_DIR + "build")
        ),
        createWebBundle(defines).pipe(
          gulp.dest(CHROME_BUILD_CONTENT_DIR + "web")
        ),
        gulp
          .src(COMMON_WEB_FILES, { base: "web/" })
          .pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + "web")),

        gulp
          .src(
            ["web/locale/*/viewer.properties", "web/locale/locale.properties"],
            { base: "web/" }
          )
          .pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + "web")),
        gulp
          .src(["external/bcmaps/*.bcmap", "external/bcmaps/LICENSE"], {
            base: "external/bcmaps",
          })
          .pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + "web/cmaps")),

        preprocessHTML("web/viewer.html", defines).pipe(
          gulp.dest(CHROME_BUILD_CONTENT_DIR + "web")
        ),
        preprocessCSS("web/viewer.css", "chrome", defines, true)
          .pipe(
            postcss([autoprefixer({ overrideBrowserslist: ["chrome >= 49"] })])
          )
          .pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + "web")),

        gulp.src("LICENSE").pipe(gulp.dest(CHROME_BUILD_DIR)),
        gulp
          .src("extensions/chromium/manifest.json")
          .pipe(replace(/\bPDFJSSCRIPT_VERSION\b/g, version))
          .pipe(gulp.dest(CHROME_BUILD_DIR)),
        gulp
          .src(
            [
              "extensions/chromium/**/*.{html,js,css,png}",
              "extensions/chromium/preferences_schema.json",
            ],
            { base: "extensions/chromium/" }
          )
          .pipe(gulp.dest(CHROME_BUILD_DIR)),
      ]);
    }
  )
);

gulp.task("chromium", gulp.series("chromium-pre"));

gulp.task("jsdoc", function (done) {
  console.log();
  console.log("### Generating documentation (JSDoc)");

  var JSDOC_FILES = ["src/doc_helper.js", "src/display/api.js"];

  rimraf(JSDOC_BUILD_DIR, function () {
    mkdirp(JSDOC_BUILD_DIR).then(function () {
      var command =
        '"node_modules/.bin/jsdoc" -d ' +
        JSDOC_BUILD_DIR +
        " " +
        JSDOC_FILES.join(" ");
      exec(command, done);
    });
  });
});

gulp.task("types", function (done) {
  console.log("### Generating TypeScript definitions using `tsc`");
  const args = [
    "target ES2020",
    "allowJS",
    "declaration",
    `outDir ${TYPES_DIR}`,
    "strict",
    "esModuleInterop",
    "forceConsistentCasingInFileNames",
    "emitDeclarationOnly",
  ].join(" --");
  exec(`"node_modules/.bin/tsc" --${args} src/pdf.js`, done);
});

function buildLib(defines, dir) {
  // When we create a bundle, webpack is run on the source and it will replace
  // require with __webpack_require__. When we want to use the real require,
  // __non_webpack_require__ has to be used.
  // In this target, we don't create a bundle, so we have to replace the
  // occurrences of __non_webpack_require__ ourselves.
  function babelPluginReplaceNonWebPackRequire(babel) {
    return {
      visitor: {
        Identifier(curPath, state) {
          if (curPath.node.name === "__non_webpack_require__") {
            curPath.replaceWith(babel.types.identifier("require"));
          }
        },
      },
    };
  }
  function preprocess(content) {
    var skipBabel =
      bundleDefines.SKIP_BABEL || /\/\*\s*no-babel-preset\s*\*\//.test(content);
    content = preprocessor2.preprocessPDFJSCode(ctx, content);
    content = babel.transform(content, {
      sourceType: "module",
      presets: skipBabel ? undefined : ["@babel/preset-env"],
      plugins: [
        "@babel/plugin-proposal-logical-assignment-operators",
        "@babel/plugin-transform-modules-commonjs",
        [
          "@babel/plugin-transform-runtime",
          {
            helpers: false,
            regenerator: true,
          },
        ],
        babelPluginReplaceNonWebPackRequire,
      ],
    }).code;
    var removeCjsSrc = /^(var\s+\w+\s*=\s*(_interopRequireDefault\()?require\(".*?)(?:\/src)(\/[^"]*"\)\)?;)$/gm;
    content = content.replace(removeCjsSrc, (all, prefix, interop, suffix) => {
      return prefix + suffix;
    });
    return licenseHeaderLibre + content;
  }
  var babel = require("@babel/core");
  var versionInfo = getVersionJSON();
  var bundleDefines = builder.merge(defines, {
    BUNDLE_VERSION: versionInfo.version,
    BUNDLE_BUILD: versionInfo.commit,
    TESTING: process.env.TESTING === "true",
  });
  var ctx = {
    rootPath: __dirname,
    saveComments: false,
    defines: bundleDefines,
    map: {
      "pdfjs-lib": "../pdf",
    },
  };
  var licenseHeaderLibre = fs
    .readFileSync("./src/license_header_libre.js")
    .toString();
  var preprocessor2 = require("./external/builder/preprocessor2.js");
  return merge([
    gulp.src(
      [
        "src/{core,display,shared}/*.js",
        "!src/shared/{cffStandardStrings,fonts_utils}.js",
        "src/{pdf,pdf.worker}.js",
      ],
      { base: "src/" }
    ),
    gulp.src(
      ["examples/node/domstubs.js", "web/*.js", "!web/{pdfjs,viewer}.js"],
      { base: "." }
    ),
    gulp.src("test/unit/*.js", { base: "." }),
  ])
    .pipe(transform("utf8", preprocess))
    .pipe(gulp.dest(dir));
}

gulp.task(
  "lib",
  gulp.series(
    "buildnumber",
    "default_preferences",
    function scripting() {
      var defines = builder.merge(DEFINES, { GENERIC: true, LIB: true });
      return createTemporaryScriptingBundle(defines);
    },
    function () {
      var defines = builder.merge(DEFINES, { GENERIC: true, LIB: true });

      return merge([
        buildLib(defines, "build/lib/"),
        createSandboxBundle(defines).pipe(gulp.dest("build/lib/")),
      ]);
    }
  )
);

gulp.task(
  "lib-es5",
  gulp.series(
    "buildnumber",
    "default_preferences",
    function scripting() {
      var defines = builder.merge(DEFINES, {
        GENERIC: true,
        LIB: true,
        SKIP_BABEL: false,
      });
      return createTemporaryScriptingBundle(defines);
    },
    function () {
      var defines = builder.merge(DEFINES, {
        GENERIC: true,
        LIB: true,
        SKIP_BABEL: false,
      });

      return merge([
        buildLib(defines, "build/lib-es5/"),
        createSandboxBundle(defines).pipe(gulp.dest("build/lib-es5/")),
      ]);
    }
  )
);

function compressPublish(targetName, dir) {
  return gulp
    .src(dir + "**")
    .pipe(zip(targetName))
    .pipe(gulp.dest(BUILD_DIR))
    .on("end", function () {
      console.log("Built distribution file: " + targetName);
    });
}

gulp.task(
  "publish",
  gulp.series("generic", "generic-es5", function (done) {
    var version = JSON.parse(
      fs.readFileSync(BUILD_DIR + "version.json").toString()
    ).version;

    config.stableVersion = config.betaVersion;
    config.betaVersion = version;

    return merge([
      createStringSource(CONFIG_FILE, JSON.stringify(config, null, 2)).pipe(
        gulp.dest(".")
      ),
      compressPublish("pdfjs-" + version + "-dist.zip", GENERIC_DIR),
      compressPublish("pdfjs-" + version + "-es5-dist.zip", GENERIC_ES5_DIR),
    ]);
  })
);

gulp.task("testing-pre", function (done) {
  process.env.TESTING = "true";
  // TODO: Re-write the relevant unit-tests, which are using `new Date(...)`,
  //       to not required the following time-zone hack since it doesn't work
  //       when the unit-tests are run directly in the browser.
  process.env.TZ = "UTC";
  done();
});

gulp.task(
  "test",
  gulp.series("testing-pre", "generic", "components", function () {
    return streamqueue(
      { objectMode: true },
      createTestSource("unit"),
      createTestSource("browser"),
      createTestSource("integration")
    );
  })
);

gulp.task(
  "bottest",
  gulp.series("testing-pre", "generic", "components", function () {
    return streamqueue(
      { objectMode: true },
      createTestSource("unit", true),
      createTestSource("font", true),
      createTestSource("browser (no reftest)", true),
      createTestSource("integration")
    );
  })
);

gulp.task(
  "browsertest",
  gulp.series("testing-pre", "generic", "components", function () {
    return createTestSource("browser");
  })
);

gulp.task(
  "unittest",
  gulp.series("testing-pre", "generic", function () {
    return createTestSource("unit");
  })
);

gulp.task(
  "integrationtest",
  gulp.series("testing-pre", "generic", function () {
    return createTestSource("integration");
  })
);

gulp.task(
  "fonttest",
  gulp.series("testing-pre", function () {
    return createTestSource("font");
  })
);

gulp.task(
  "makeref",
  gulp.series("testing-pre", "generic", "components", function (done) {
    makeRef(done);
  })
);

gulp.task(
  "botmakeref",
  gulp.series("testing-pre", "generic", "components", function (done) {
    makeRef(done, true);
  })
);

gulp.task(
  "typestest-pre",
  gulp.series("testing-pre", "generic", "types", function () {
    const [packageJsonSrc] = packageBowerJson();
    return merge([
      packageJsonSrc.pipe(gulp.dest(TYPESTEST_DIR)),
      gulp
        .src([
          GENERIC_DIR + "build/pdf.js",
          GENERIC_DIR + "build/pdf.worker.js",
          SRC_DIR + "pdf.worker.entry.js",
        ])
        .pipe(gulp.dest(TYPESTEST_DIR + "build/")),
      gulp
        .src(TYPES_DIR + "**/*", { base: TYPES_DIR })
        .pipe(gulp.dest(TYPESTEST_DIR + "types/")),
    ]);
  })
);

gulp.task(
  "typestest",
  gulp.series("typestest-pre", function (done) {
    exec('"node_modules/.bin/tsc" -p test/types', function (err, stdout) {
      if (err) {
        console.log(`Couldn't compile TypeScript test: ${stdout}`);
      }
      done(err);
    });
  })
);

gulp.task("baseline", function (done) {
  console.log();
  console.log("### Creating baseline environment");

  var baselineCommit = process.env.BASELINE;
  if (!baselineCommit) {
    done(new Error("Missing baseline commit. Specify the BASELINE variable."));
    return;
  }

  var initializeCommand = "git fetch origin";
  if (!checkDir(BASELINE_DIR)) {
    mkdirp.sync(BASELINE_DIR);
    initializeCommand = "git clone ../../ .";
  }

  var workingDirectory = path.resolve(process.cwd(), BASELINE_DIR);
  exec(initializeCommand, { cwd: workingDirectory }, function (error) {
    if (error) {
      done(new Error("Baseline clone/fetch failed."));
      return;
    }

    exec(
      "git checkout " + baselineCommit,
      { cwd: workingDirectory },
      function (error2) {
        if (error2) {
          done(new Error("Baseline commit checkout failed."));
          return;
        }

        console.log('Baseline commit "' + baselineCommit + '" checked out.');
        done();
      }
    );
  });
});

gulp.task(
  "unittestcli",
  gulp.series("testing-pre", "lib-es5", function (done) {
    var options = [
      "node_modules/jasmine/bin/jasmine",
      "JASMINE_CONFIG_PATH=test/unit/clitests.json",
    ];
    var jasmineProcess = startNode(options, { stdio: "inherit" });
    jasmineProcess.on("close", function (code) {
      if (code !== 0) {
        done(new Error("Unit tests failed."));
        return;
      }
      done();
    });
  })
);

gulp.task("lint", function (done) {
  console.log();
  console.log("### Linting JS/CSS files");

  // Ensure that we lint the Firefox specific *.jsm files too.
  const esLintOptions = [
    "node_modules/eslint/bin/eslint",
    "--ext",
    ".js,.jsm",
    ".",
    "--report-unused-disable-directives",
  ];
  if (process.argv.includes("--fix")) {
    esLintOptions.push("--fix");
  }

  const styleLintOptions = [
    "node_modules/stylelint/bin/stylelint",
    "**/*.css",
    "--report-needless-disables",
  ];
  if (process.argv.includes("--fix")) {
    styleLintOptions.push("--fix");
  }

  const esLintProcess = startNode(esLintOptions, { stdio: "inherit" });
  esLintProcess.on("close", function (esLintCode) {
    if (esLintCode !== 0) {
      done(new Error("ESLint failed."));
      return;
    }

    const styleLintProcess = startNode(styleLintOptions, { stdio: "inherit" });
    styleLintProcess.on("close", function (styleLintCode) {
      if (styleLintCode !== 0) {
        done(new Error("Stylelint failed."));
        return;
      }
      console.log("files checked, no errors found");
      done();
    });
  });
});

gulp.task(
  "lint-chromium",
  gulp.series("default_preferences", function (done) {
    console.log();
    console.log("### Checking supplemental Chromium files");

    if (
      !checkChromePreferencesFile(
        "extensions/chromium/preferences_schema.json",
        "build/default_preferences.json"
      )
    ) {
      done(new Error("chromium/preferences_schema is not in sync."));
      return;
    }
    done();
  })
);

gulp.task(
  "dev-sandbox",
  gulp.series(
    function scripting() {
      const defines = builder.merge(DEFINES, { GENERIC: true, TESTING: true });
      return createTemporaryScriptingBundle(defines, {
        disableVersionInfo: true,
      });
    },
    function () {
      console.log();
      console.log("### Building development sandbox");

      const defines = builder.merge(DEFINES, { GENERIC: true, TESTING: true });
      const sandboxDir = BUILD_DIR + "dev-sandbox/";

      rimraf.sync(sandboxDir);

      return createSandboxBundle(defines, {
        disableVersionInfo: true,
      }).pipe(gulp.dest(sandboxDir));
    }
  )
);

gulp.task("watch-dev-sandbox", function () {
  gulp.watch(
    [
      "src/pdf.{sandbox,sandbox.external,scripting}.js",
      "src/scripting_api/*.js",
      "src/shared/scripting_utils.js",
      "external/quickjs/*.js",
    ],
    { ignoreInitial: false },
    gulp.series("dev-sandbox")
  );
});

gulp.task(
  "server",
  gulp.parallel("watch-dev-sandbox", function () {
    console.log();
    console.log("### Starting local server");

    var WebServer = require("./test/webserver.js").WebServer;
    var server = new WebServer();
    server.port = 8888;
    server.start();
  })
);

gulp.task("clean", function (done) {
  console.log();
  console.log("### Cleaning up project builds");

  rimraf(BUILD_DIR, done);
});

gulp.task("makefile", function () {
  var makefileContent = "help:\n\tgulp\n\n";
  var targetsNames = [];
  for (var i in target) {
    makefileContent += i + ":\n\tgulp " + i + "\n\n";
    targetsNames.push(i);
  }
  makefileContent += ".PHONY: " + targetsNames.join(" ") + "\n";
  return createStringSource("Makefile", makefileContent).pipe(gulp.dest("."));
});

gulp.task("importl10n", function (done) {
  var locales = require("./external/importL10n/locales.js");

  console.log();
  console.log("### Importing translations from mozilla-central");

  if (!fs.existsSync(L10N_DIR)) {
    fs.mkdirSync(L10N_DIR);
  }
  locales.downloadL10n(L10N_DIR, done);
});

gulp.task("gh-pages-prepare", function () {
  console.log();
  console.log("### Creating web site");

  rimraf.sync(GH_PAGES_DIR);

  // 'vfs' because web/viewer.html needs its BOM.
  return merge([
    vfs
      .src(GENERIC_DIR + "**/*", { base: GENERIC_DIR, stripBOM: false })
      .pipe(gulp.dest(GH_PAGES_DIR)),
    vfs
      .src(GENERIC_ES5_DIR + "**/*", { base: GENERIC_ES5_DIR, stripBOM: false })
      .pipe(gulp.dest(GH_PAGES_DIR + "es5/")),
    gulp
      .src("test/features/**/*", { base: "test/" })
      .pipe(gulp.dest(GH_PAGES_DIR)),
    gulp
      .src(JSDOC_BUILD_DIR + "**/*", { base: JSDOC_BUILD_DIR })
      .pipe(gulp.dest(GH_PAGES_DIR + "api/draft/")),
  ]);
});

gulp.task("wintersmith", function (done) {
  var wintersmith = require("wintersmith");
  var env = wintersmith("docs/config.json");
  env.build(GH_PAGES_DIR, function (error) {
    if (error) {
      done(error);
      return;
    }
    replaceInFile(
      GH_PAGES_DIR + "/getting_started/index.html",
      /STABLE_VERSION/g,
      config.stableVersion
    );
    replaceInFile(
      GH_PAGES_DIR + "/getting_started/index.html",
      /BETA_VERSION/g,
      config.betaVersion
    );

    // Hide the beta version button if there is only a stable version.
    const groupClass = config.betaVersion ? "btn-group-vertical centered" : "";
    const hiddenClass = config.betaVersion ? "" : "hidden";
    replaceInFile(
      GH_PAGES_DIR + "/getting_started/index.html",
      /GROUP_CLASS/g,
      groupClass
    );
    replaceInFile(
      GH_PAGES_DIR + "/getting_started/index.html",
      /HIDDEN_CLASS/g,
      hiddenClass
    );

    console.log("Done building with wintersmith.");
    done();
  });
});

gulp.task("gh-pages-git", function (done) {
  var VERSION = getVersionJSON().version;
  var reason = process.env.PDFJS_UPDATE_REASON;

  safeSpawnSync("git", ["init"], { cwd: GH_PAGES_DIR });
  safeSpawnSync("git", ["remote", "add", "origin", REPO], {
    cwd: GH_PAGES_DIR,
  });
  safeSpawnSync("git", ["add", "-A"], { cwd: GH_PAGES_DIR });
  safeSpawnSync(
    "git",
    [
      "commit",
      "-am",
      "gh-pages site created via gulpfile.js script",
      "-m",
      "PDF.js version " + VERSION + (reason ? " - " + reason : ""),
    ],
    { cwd: GH_PAGES_DIR }
  );
  safeSpawnSync("git", ["branch", "-m", "gh-pages"], { cwd: GH_PAGES_DIR });

  console.log();
  console.log("Website built in " + GH_PAGES_DIR);
  done();
});

gulp.task(
  "web",
  gulp.series(
    "generic",
    "generic-es5",
    "jsdoc",
    "gh-pages-prepare",
    "wintersmith",
    "gh-pages-git"
  )
);

function packageBowerJson() {
  var VERSION = getVersionJSON().version;

  var DIST_NAME = "pdfjs-dist";
  var DIST_DESCRIPTION = "Generic build of Mozilla's PDF.js library.";
  var DIST_KEYWORDS = ["Mozilla", "pdf", "pdf.js"];
  var DIST_HOMEPAGE = "http://mozilla.github.io/pdf.js/";
  var DIST_BUGS_URL = "https://github.com/mozilla/pdf.js/issues";
  var DIST_LICENSE = "Apache-2.0";

  var npmManifest = {
    name: DIST_NAME,
    version: VERSION,
    main: "build/pdf.js",
    types: "types/pdf.d.ts",
    description: DIST_DESCRIPTION,
    keywords: DIST_KEYWORDS,
    homepage: DIST_HOMEPAGE,
    bugs: DIST_BUGS_URL,
    license: DIST_LICENSE,
    browser: {
      canvas: false,
      fs: false,
      http: false,
      https: false,
      url: false,
      zlib: false,
    },
    format: "amd", // to not allow system.js to choose 'cjs'
    repository: {
      type: "git",
      url: DIST_REPO_URL,
    },
  };

  var bowerManifest = {
    name: DIST_NAME,
    version: VERSION,
    main: ["build/pdf.js", "build/pdf.worker.js"],
    ignore: [],
    keywords: DIST_KEYWORDS,
  };

  return [
    createStringSource("package.json", JSON.stringify(npmManifest, null, 2)),
    createStringSource("bower.json", JSON.stringify(bowerManifest, null, 2)),
  ];
}

gulp.task(
  "dist-pre",
  gulp.series(
    "generic",
    "generic-es5",
    "components",
    "components-es5",
    "image_decoders",
    "image_decoders-es5",
    "lib",
    "minified",
    "minified-es5",
    "types",
    function () {
      console.log();
      console.log("### Cloning baseline distribution");

      rimraf.sync(DIST_DIR);
      mkdirp.sync(DIST_DIR);
      safeSpawnSync("git", ["clone", "--depth", "1", DIST_REPO_URL, DIST_DIR]);

      console.log();
      console.log("### Overwriting all files");
      rimraf.sync(path.join(DIST_DIR, "*"));

      // Rebuilding manifests
      var [packageJsonSrc, bowerJsonSrc] = packageBowerJson();

      return merge([
        packageJsonSrc.pipe(gulp.dest(DIST_DIR)),
        bowerJsonSrc.pipe(gulp.dest(DIST_DIR)),
        vfs
          .src("external/dist/**/*", { base: "external/dist", stripBOM: false })
          .pipe(gulp.dest(DIST_DIR)),
        gulp.src(GENERIC_DIR + "LICENSE").pipe(gulp.dest(DIST_DIR)),
        gulp
          .src(GENERIC_DIR + "web/cmaps/**/*", { base: GENERIC_DIR + "web" })
          .pipe(gulp.dest(DIST_DIR)),
        gulp
          .src([
            GENERIC_DIR + "build/pdf.js",
            GENERIC_DIR + "build/pdf.js.map",
            GENERIC_DIR + "build/pdf.worker.js",
            GENERIC_DIR + "build/pdf.worker.js.map",
            SRC_DIR + "pdf.worker.entry.js",
          ])
          .pipe(gulp.dest(DIST_DIR + "build/")),
        gulp
          .src([
            GENERIC_ES5_DIR + "build/pdf.js",
            GENERIC_ES5_DIR + "build/pdf.js.map",
            GENERIC_ES5_DIR + "build/pdf.worker.js",
            GENERIC_ES5_DIR + "build/pdf.worker.js.map",
            SRC_DIR + "pdf.worker.entry.js",
          ])
          .pipe(gulp.dest(DIST_DIR + "es5/build/")),
        gulp
          .src(MINIFIED_DIR + "build/pdf.js")
          .pipe(rename("pdf.min.js"))
          .pipe(gulp.dest(DIST_DIR + "build/")),
        gulp
          .src(MINIFIED_DIR + "build/pdf.worker.js")
          .pipe(rename("pdf.worker.min.js"))
          .pipe(gulp.dest(DIST_DIR + "build/")),
        gulp
          .src(MINIFIED_DIR + "image_decoders/pdf.image_decoders.js")
          .pipe(rename("pdf.image_decoders.min.js"))
          .pipe(gulp.dest(DIST_DIR + "image_decoders/")),
        gulp
          .src(MINIFIED_ES5_DIR + "build/pdf.js")
          .pipe(rename("pdf.min.js"))
          .pipe(gulp.dest(DIST_DIR + "es5/build/")),
        gulp
          .src(MINIFIED_ES5_DIR + "build/pdf.worker.js")
          .pipe(rename("pdf.worker.min.js"))
          .pipe(gulp.dest(DIST_DIR + "es5/build/")),
        gulp
          .src(MINIFIED_ES5_DIR + "image_decoders/pdf.image_decoders.js")
          .pipe(rename("pdf.image_decoders.min.js"))
          .pipe(gulp.dest(DIST_DIR + "es5/image_decoders/")),
        gulp
          .src(COMPONENTS_DIR + "**/*", { base: COMPONENTS_DIR })
          .pipe(gulp.dest(DIST_DIR + "web/")),
        gulp
          .src(COMPONENTS_ES5_DIR + "**/*", { base: COMPONENTS_ES5_DIR })
          .pipe(gulp.dest(DIST_DIR + "es5/web/")),
        gulp
          .src(IMAGE_DECODERS_DIR + "**/*", { base: IMAGE_DECODERS_DIR })
          .pipe(gulp.dest(DIST_DIR + "image_decoders/")),
        gulp
          .src(IMAGE_DECODERS_ES5_DIR + "**/*", {
            base: IMAGE_DECODERS_ES5_DIR,
          })
          .pipe(gulp.dest(DIST_DIR + "es5/image_decoders/")),
        gulp
          .src(LIB_DIR + "**/*", { base: LIB_DIR })
          .pipe(gulp.dest(DIST_DIR + "lib/")),
        gulp
          .src(TYPES_DIR + "**/*", { base: TYPES_DIR })
          .pipe(gulp.dest(DIST_DIR + "types/")),
      ]);
    }
  )
);

gulp.task(
  "dist-install",
  gulp.series("dist-pre", function (done) {
    var distPath = DIST_DIR;
    var opts = {};
    var installPath = process.env.PDFJS_INSTALL_PATH;
    if (installPath) {
      opts.cwd = installPath;
      distPath = path.relative(installPath, distPath);
    }
    safeSpawnSync("npm", ["install", distPath], opts);
    done();
  })
);

gulp.task(
  "dist-repo-git",
  gulp.series("dist-pre", function (done) {
    var VERSION = getVersionJSON().version;

    console.log();
    console.log("### Committing changes");

    var reason = process.env.PDFJS_UPDATE_REASON;
    // Attempt to work-around the broken link, see https://github.com/mozilla/pdf.js/issues/10391
    if (typeof reason === "string") {
      var reasonParts = /^(See )(mozilla\/pdf\.js)@tags\/(v\d+\.\d+\.\d+)\s*$/.exec(
        reason
      );

      if (reasonParts) {
        reason =
          reasonParts[1] +
          "https://github.com/" +
          reasonParts[2] +
          "/releases/tag/" +
          reasonParts[3];
      }
    }
    var message = "PDF.js version " + VERSION + (reason ? " - " + reason : "");
    safeSpawnSync("git", ["add", "*"], { cwd: DIST_DIR });
    safeSpawnSync("git", ["commit", "-am", message], { cwd: DIST_DIR });
    safeSpawnSync("git", ["tag", "-a", "v" + VERSION, "-m", message], {
      cwd: DIST_DIR,
    });

    console.log();
    console.log("Done. Push with");
    console.log(
      "  cd " + DIST_DIR + "; git push --tags " + DIST_REPO_URL + " master"
    );
    console.log();
    done();
  })
);

gulp.task("dist", gulp.series("dist-repo-git"));

gulp.task(
  "mozcentralbaseline",
  gulp.series("baseline", function (done) {
    console.log();
    console.log("### Creating mozcentral baseline environment");

    // Create a mozcentral build.
    rimraf.sync(BASELINE_DIR + BUILD_DIR);

    var workingDirectory = path.resolve(process.cwd(), BASELINE_DIR);
    safeSpawnSync("gulp", ["mozcentral"], {
      env: process.env,
      cwd: workingDirectory,
      stdio: "inherit",
    });

    // Copy the mozcentral build to the mozcentral baseline directory.
    rimraf.sync(MOZCENTRAL_BASELINE_DIR);
    mkdirp.sync(MOZCENTRAL_BASELINE_DIR);

    gulp
      .src([BASELINE_DIR + BUILD_DIR + "mozcentral/**/*"])
      .pipe(gulp.dest(MOZCENTRAL_BASELINE_DIR))
      .on("end", function () {
        // Commit the mozcentral baseline.
        safeSpawnSync("git", ["init"], { cwd: MOZCENTRAL_BASELINE_DIR });
        safeSpawnSync("git", ["add", "."], { cwd: MOZCENTRAL_BASELINE_DIR });
        safeSpawnSync("git", ["commit", "-m", '"mozcentral baseline"'], {
          cwd: MOZCENTRAL_BASELINE_DIR,
        });
        done();
      });
  })
);

gulp.task(
  "mozcentraldiff",
  gulp.series("mozcentral", "mozcentralbaseline", function (done) {
    console.log();
    console.log("### Creating mozcentral diff");

    // Create the diff between the current mozcentral build and the
    // baseline mozcentral build, which both exist at this point.
    // The mozcentral baseline directory is a Git repository, so we
    // remove all files and copy the current mozcentral build files
    // into it to create the diff.
    rimraf.sync(MOZCENTRAL_BASELINE_DIR + "*");

    gulp
      .src([BUILD_DIR + "mozcentral/**/*"])
      .pipe(gulp.dest(MOZCENTRAL_BASELINE_DIR))
      .on("end", function () {
        safeSpawnSync("git", ["add", "-A"], { cwd: MOZCENTRAL_BASELINE_DIR });
        var diff = safeSpawnSync(
          "git",
          ["diff", "--binary", "--cached", "--unified=8"],
          { cwd: MOZCENTRAL_BASELINE_DIR }
        ).stdout;

        createStringSource(MOZCENTRAL_DIFF_FILE, diff)
          .pipe(gulp.dest(BUILD_DIR))
          .on("end", function () {
            console.log(
              "Result diff can be found at " + BUILD_DIR + MOZCENTRAL_DIFF_FILE
            );
            done();
          });
      });
  })
);

gulp.task("externaltest", function (done) {
  console.log();
  console.log("### Running test-fixtures.js");
  safeSpawnSync("node", ["external/builder/test-fixtures.js"], {
    stdio: "inherit",
  });

  console.log();
  console.log("### Running test-fixtures_esprima.js");
  safeSpawnSync("node", ["external/builder/test-fixtures_esprima.js"], {
    stdio: "inherit",
  });
  done();
});

gulp.task(
  "npm-test",
  gulp.series(
    gulp.parallel("lint", "externaltest", "unittestcli", "typestest"),
    "lint-chromium"
  )
);
