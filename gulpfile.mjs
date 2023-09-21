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

import * as builder from "./external/builder/builder.mjs";
import { exec, spawn, spawnSync } from "child_process";
import autoprefixer from "autoprefixer";
import babel from "@babel/core";
import crypto from "crypto";
import { fileURLToPath } from "url";
import fs from "fs";
import gulp from "gulp";
import merge from "merge-stream";
import { mkdirp } from "mkdirp";
import path from "path";
import postcss from "gulp-postcss";
import postcssDirPseudoClass from "postcss-dir-pseudo-class";
import postcssNesting from "postcss-nesting";
import { preprocessPDFJSCode } from "./external/builder/preprocessor2.mjs";
import rename from "gulp-rename";
import replace from "gulp-replace";
import rimraf from "rimraf";
import stream from "stream";
import streamqueue from "streamqueue";
import through from "through2";
import Vinyl from "vinyl";
import webpack2 from "webpack";
import webpackStream from "webpack-stream";
import zip from "gulp-zip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BUILD_DIR = "build/";
const L10N_DIR = "l10n/";
const TEST_DIR = "test/";
const EXTENSION_SRC_DIR = "extensions/";

const BASELINE_DIR = BUILD_DIR + "baseline/";
const MOZCENTRAL_BASELINE_DIR = BUILD_DIR + "mozcentral.baseline/";
const GENERIC_DIR = BUILD_DIR + "generic/";
const GENERIC_LEGACY_DIR = BUILD_DIR + "generic-legacy/";
const COMPONENTS_DIR = BUILD_DIR + "components/";
const COMPONENTS_LEGACY_DIR = BUILD_DIR + "components-legacy/";
const IMAGE_DECODERS_DIR = BUILD_DIR + "image_decoders/";
const IMAGE_DECODERS_LEGACY_DIR = BUILD_DIR + "image_decoders-legacy/";
const DEFAULT_PREFERENCES_DIR = BUILD_DIR + "default_preferences/";
const MINIFIED_DIR = BUILD_DIR + "minified/";
const MINIFIED_LEGACY_DIR = BUILD_DIR + "minified-legacy/";
const JSDOC_BUILD_DIR = BUILD_DIR + "jsdoc/";
const GH_PAGES_DIR = BUILD_DIR + "gh-pages/";
const SRC_DIR = "src/";
const DIST_DIR = BUILD_DIR + "dist/";
const TYPES_DIR = BUILD_DIR + "types/";
const TMP_DIR = BUILD_DIR + "tmp/";
const TYPESTEST_DIR = BUILD_DIR + "typestest/";
const COMMON_WEB_FILES = [
  "web/images/*.{png,svg,gif}",
  "web/debugger.{css,js}",
];
const MOZCENTRAL_DIFF_FILE = "mozcentral.diff";

const DIST_REPO_URL = "https://github.com/mozilla/pdfjs-dist";

const CONFIG_FILE = "pdfjs.config";
const config = JSON.parse(fs.readFileSync(CONFIG_FILE).toString());

const ENV_TARGETS = [
  "last 2 versions",
  "Chrome >= 92",
  "Firefox ESR",
  "Safari >= 15.4",
  "Node >= 18",
  "> 1%",
  "not IE > 0",
  "not dead",
];

// Default Autoprefixer config used for generic, components, minified-pre
const AUTOPREFIXER_CONFIG = {
  overrideBrowserslist: ENV_TARGETS,
};
// Default Babel targets used for generic, components, minified-pre
const BABEL_TARGETS = ENV_TARGETS.join(", ");

const DEFINES = Object.freeze({
  SKIP_BABEL: true,
  TESTING: undefined,
  // The main build targets:
  GENERIC: false,
  MOZCENTRAL: false,
  GECKOVIEW: false,
  CHROME: false,
  MINIFIED: false,
  COMPONENTS: false,
  LIB: false,
  IMAGE_DECODERS: false,
});

function transform(charEncoding, transformFunction) {
  return through.obj(function (vinylFile, enc, done) {
    const transformedFile = vinylFile.clone();
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
    return '"' + param.replaceAll(/([$\\"`])/g, "\\$1") + '"';
  });

  const result = spawnSync(command, parameters, options);
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
  const source = stream.Readable({ objectMode: true });
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
    defaultPreferencesDir = null,
  } = {}
) {
  const versionInfo = !disableVersionInfo
    ? getVersionJSON()
    : { version: 0, commit: 0 };
  const bundleDefines = builder.merge(defines, {
    BUNDLE_VERSION: versionInfo.version,
    BUNDLE_BUILD: versionInfo.commit,
    TESTING: defines.TESTING ?? process.env.TESTING === "true",
    DEFAULT_PREFERENCES: defaultPreferencesDir
      ? getDefaultPreferences(defaultPreferencesDir)
      : {},
  });
  const licenseHeaderLibre = fs
    .readFileSync("./src/license_header_libre.js")
    .toString();
  const enableSourceMaps =
    !bundleDefines.MOZCENTRAL &&
    !bundleDefines.CHROME &&
    !bundleDefines.LIB &&
    !bundleDefines.TESTING &&
    !disableSourceMaps;
  const skipBabel = bundleDefines.SKIP_BABEL;

  // `core-js`, see https://github.com/zloirock/core-js/issues/514,
  // should be excluded from processing.
  const babelExcludes = ["node_modules[\\\\\\/]core-js"];
  const babelExcludeRegExp = new RegExp(`(${babelExcludes.join("|")})`);

  const babelPresets = skipBabel
    ? undefined
    : [
        [
          "@babel/preset-env",
          { corejs: "3.32.2", shippedProposals: true, useBuiltIns: "usage" },
        ],
      ];
  const babelPlugins = ["@babel/plugin-transform-modules-commonjs"];

  const plugins = [];
  if (!disableLicenseHeader) {
    plugins.push(
      new webpack2.BannerPlugin({ banner: licenseHeaderLibre, raw: true })
    );
  }

  const experiments =
    output.library?.type === "module" ? { outputModule: true } : undefined;

  // Required to expose e.g., the `window` object.
  output.globalObject = "globalThis";

  const basicAlias = {
    pdfjs: "src",
    "pdfjs-web": "web",
    "pdfjs-lib": "web/pdfjs",
  };
  const libraryAlias = {
    "display-fetch_stream": "src/display/stubs.js",
    "display-l10n_utils": "src/display/stubs.js",
    "display-network": "src/display/stubs.js",
    "display-node_stream": "src/display/stubs.js",
    "display-node_utils": "src/display/stubs.js",
    "display-svg": "src/display/stubs.js",
  };
  const viewerAlias = {
    "web-alt_text_manager": "web/alt_text_manager.js",
    "web-annotation_editor_params": "web/annotation_editor_params.js",
    "web-com": "",
    "web-pdf_attachment_viewer": "web/pdf_attachment_viewer.js",
    "web-pdf_cursor_tools": "web/pdf_cursor_tools.js",
    "web-pdf_document_properties": "web/pdf_document_properties.js",
    "web-pdf_find_bar": "web/pdf_find_bar.js",
    "web-pdf_layer_viewer": "web/pdf_layer_viewer.js",
    "web-pdf_outline_viewer": "web/pdf_outline_viewer.js",
    "web-pdf_presentation_mode": "web/pdf_presentation_mode.js",
    "web-pdf_sidebar": "web/pdf_sidebar.js",
    "web-pdf_thumbnail_viewer": "web/pdf_thumbnail_viewer.js",
    "web-print_service": "",
    "web-secondary_toolbar": "web/secondary_toolbar.js",
    "web-toolbar": "web/toolbar.js",
  };
  if (bundleDefines.CHROME) {
    libraryAlias["display-fetch_stream"] = "src/display/fetch_stream.js";
    libraryAlias["display-network"] = "src/display/network.js";

    viewerAlias["web-com"] = "web/chromecom.js";
    viewerAlias["web-print_service"] = "web/pdf_print_service.js";
  } else if (bundleDefines.GENERIC) {
    // Aliases defined here must also be replicated in the paths section of
    // the tsconfig.json file for the type generation to work.
    // In the tsconfig.json files, the .js extension must be omitted.
    libraryAlias["display-fetch_stream"] = "src/display/fetch_stream.js";
    libraryAlias["display-l10n_utils"] = "web/l10n_utils.js";
    libraryAlias["display-network"] = "src/display/network.js";
    libraryAlias["display-node_stream"] = "src/display/node_stream.js";
    libraryAlias["display-node_utils"] = "src/display/node_utils.js";
    libraryAlias["display-svg"] = "src/display/svg.js";

    viewerAlias["web-com"] = "web/genericcom.js";
    viewerAlias["web-print_service"] = "web/pdf_print_service.js";
  } else if (bundleDefines.MOZCENTRAL) {
    if (bundleDefines.GECKOVIEW) {
      const gvAlias = {
        "web-toolbar": "web/toolbar-geckoview.js",
      };
      for (const key in viewerAlias) {
        viewerAlias[key] = gvAlias[key] || "web/stubs-geckoview.js";
      }
    }
    viewerAlias["web-com"] = "web/firefoxcom.js";
    viewerAlias["web-print_service"] = "web/firefox_print_service.js";
  }
  const alias = { ...basicAlias, ...libraryAlias, ...viewerAlias };
  for (const key in alias) {
    alias[key] = path.join(__dirname, alias[key]);
  }

  return {
    mode: "none",
    experiments,
    output,
    performance: {
      hints: false, // Disable messages about larger file sizes.
    },
    plugins,
    resolve: {
      alias,
    },
    devtool: enableSourceMaps ? "source-map" : undefined,
    module: {
      rules: [
        {
          loader: "babel-loader",
          exclude: babelExcludeRegExp,
          options: {
            presets: babelPresets,
            plugins: babelPlugins,
            targets: BABEL_TARGETS,
          },
        },
        {
          loader: path.join(__dirname, "external/webpack/pdfjsdev-loader.mjs"),
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

function checkChromePreferencesFile(chromePrefsPath, webPrefs) {
  const chromePrefs = JSON.parse(fs.readFileSync(chromePrefsPath).toString());
  const chromePrefsKeys = Object.keys(chromePrefs.properties).filter(key => {
    const description = chromePrefs.properties[key].description;
    // Deprecated keys are allowed in the managed preferences file.
    // The code maintainer is responsible for adding migration logic to
    // extensions/chromium/options/migration.js and web/chromecom.js .
    return !description || !description.startsWith("DEPRECATED.");
  });

  let ret = true;
  // Verify that every entry in webPrefs is also in preferences_schema.json.
  for (const [key, value] of Object.entries(webPrefs)) {
    if (!chromePrefsKeys.includes(key)) {
      // Note: this would also reject keys that are present but marked as
      // DEPRECATED. A key should not be marked as DEPRECATED if it is still
      // listed in webPrefs.
      ret = false;
      console.log(
        `Warning: ${chromePrefsPath} does not contain an entry for pref: ${key}`
      );
    } else if (chromePrefs.properties[key].default !== value) {
      ret = false;
      console.log(
        `Warning: not the same values (for "${key}"): ` +
          `${chromePrefs.properties[key].default} !== ${value}`
      );
    }
  }

  // Verify that preferences_schema.json does not contain entries that are not
  // in webPrefs (app_options.js).
  for (const key of chromePrefsKeys) {
    if (!(key in webPrefs)) {
      ret = false;
      console.log(
        `Warning: ${chromePrefsPath} contains an unrecognized pref: ${key}. ` +
          `Remove it, or prepend "DEPRECATED. " and add migration logic to ` +
          `extensions/chromium/options/migration.js and web/chromecom.js.`
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

function replaceNonWebpackImport() {
  return replace("__non_webpack_import__", "import");
}

function addGlobalExports(amdName, jsName) {
  const replacer = [
    `module\\.exports = factory\\(\\);`,
    `define\\("${amdName}", \\[\\], factory\\);`,
    `exports\\["${amdName}"\\] = factory\\(\\);`,
    `root\\["${amdName}"\\] = factory\\(\\);`,
  ];
  const regex = new RegExp(`(${replacer.join("|")})`, "gm");

  return replace(regex, match => {
    switch (match) {
      case `module.exports = factory();`:
        return `module.exports = root.${jsName} = factory();`;
      case `define("${amdName}", [], factory);`:
        return `define("${amdName}", [], () => { return (root.${jsName} = factory()); });`;
      case `exports["${amdName}"] = factory();`:
        return `exports["${amdName}"] = root.${jsName} = factory();`;
      case `root["${amdName}"] = factory();`:
        return `root["${amdName}"] = root.${jsName} = factory();`;
    }
    return match;
  });
}

function createMainBundle(defines) {
  const mainAMDName = "pdfjs-dist/build/pdf";
  const mainOutputName = "pdf.js";

  const mainFileConfig = createWebpackConfig(defines, {
    filename: mainOutputName,
    library: mainAMDName,
    libraryTarget: "umd",
    umdNamedDefine: true,
  });
  return gulp
    .src("./src/pdf.js")
    .pipe(webpack2Stream(mainFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceNonWebpackImport())
    .pipe(addGlobalExports(mainAMDName, "pdfjsLib"));
}

function createScriptingBundle(defines, extraOptions = undefined) {
  const scriptingAMDName = "pdfjs-dist/build/pdf.scripting";
  const scriptingOutputName = "pdf.scripting.js";

  const scriptingFileConfig = createWebpackConfig(
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
    .pipe(replaceNonWebpackImport())
    .pipe(addGlobalExports(scriptingAMDName, "pdfjsScripting"));
}

function createSandboxExternal(defines) {
  const licenseHeader = fs.readFileSync("./src/license_header.js").toString();

  const ctx = {
    saveComments: false,
    defines,
  };
  return gulp
    .src("./src/pdf.sandbox.external.js")
    .pipe(rename("pdf.sandbox.external.sys.mjs"))
    .pipe(
      transform("utf8", content => {
        content = preprocessPDFJSCode(ctx, content);
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
  const sandboxAMDName = "pdfjs-dist/build/pdf.sandbox";
  const sandboxOutputName = "pdf.sandbox.js";

  const scriptingPath = TMP_DIR + "pdf.scripting.js";
  // Insert the source as a string to be `eval`-ed in the sandbox.
  const sandboxDefines = builder.merge(defines, {
    PDF_SCRIPTING_JS_SOURCE: fs.readFileSync(scriptingPath).toString(),
  });
  fs.unlinkSync(scriptingPath);

  const sandboxFileConfig = createWebpackConfig(
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
    .pipe(replaceNonWebpackImport())
    .pipe(addGlobalExports(sandboxAMDName, "pdfjsSandbox"));
}

function createWorkerBundle(defines) {
  const workerAMDName = "pdfjs-dist/build/pdf.worker";
  const workerOutputName = "pdf.worker.js";

  const workerFileConfig = createWebpackConfig(defines, {
    filename: workerOutputName,
    library: workerAMDName,
    libraryTarget: "umd",
    umdNamedDefine: true,
  });
  return gulp
    .src("./src/pdf.worker.js")
    .pipe(webpack2Stream(workerFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceNonWebpackImport())
    .pipe(addGlobalExports(workerAMDName, "pdfjsWorker"));
}

function createWebBundle(defines, options) {
  const viewerOutputName = "viewer.js";

  const viewerFileConfig = createWebpackConfig(
    defines,
    {
      filename: viewerOutputName,
    },
    {
      defaultPreferencesDir: options.defaultPreferencesDir,
    }
  );
  return gulp
    .src("./web/viewer.js")
    .pipe(webpack2Stream(viewerFileConfig))
    .pipe(replaceNonWebpackImport());
}

function createGVWebBundle(defines, options) {
  const viewerOutputName = "viewer-geckoview.js";
  defines = builder.merge(defines, { GECKOVIEW: true });

  const viewerFileConfig = createWebpackConfig(
    defines,
    {
      filename: viewerOutputName,
    },
    {
      defaultPreferencesDir: options.defaultPreferencesDir,
    }
  );
  return gulp
    .src("./web/viewer-geckoview.js")
    .pipe(webpack2Stream(viewerFileConfig))
    .pipe(replaceNonWebpackImport());
}

function createComponentsBundle(defines) {
  const componentsAMDName = "pdfjs-dist/web/pdf_viewer";
  const componentsOutputName = "pdf_viewer.js";

  const componentsFileConfig = createWebpackConfig(defines, {
    filename: componentsOutputName,
    library: componentsAMDName,
    libraryTarget: "umd",
    umdNamedDefine: true,
  });
  return gulp
    .src("./web/pdf_viewer.component.js")
    .pipe(webpack2Stream(componentsFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceNonWebpackImport())
    .pipe(addGlobalExports(componentsAMDName, "pdfjsViewer"));
}

function createImageDecodersBundle(defines) {
  const imageDecodersAMDName = "pdfjs-dist/image_decoders/pdf.image_decoders";
  const imageDecodersOutputName = "pdf.image_decoders.js";

  const componentsFileConfig = createWebpackConfig(defines, {
    filename: imageDecodersOutputName,
    library: imageDecodersAMDName,
    libraryTarget: "umd",
    umdNamedDefine: true,
  });
  return gulp
    .src("./src/pdf.image_decoders.js")
    .pipe(webpack2Stream(componentsFileConfig))
    .pipe(replaceWebpackRequire())
    .pipe(replaceNonWebpackImport())
    .pipe(addGlobalExports(imageDecodersAMDName, "pdfjsImageDecoders"));
}

function createCMapBundle() {
  return gulp.src(["external/bcmaps/*.bcmap", "external/bcmaps/LICENSE"], {
    base: "external/bcmaps",
  });
}

function createStandardFontBundle() {
  return gulp.src(
    [
      "external/standard_fonts/*.pfb",
      "external/standard_fonts/*.ttf",
      "external/standard_fonts/LICENSE_FOXIT",
      "external/standard_fonts/LICENSE_LIBERATION",
    ],
    {
      base: "external/standard_fonts",
    }
  );
}

function checkFile(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function checkDir(dirPath) {
  try {
    const stat = fs.lstatSync(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function replaceInFile(filePath, find, replacement) {
  let content = fs.readFileSync(filePath).toString();
  content = content.replace(find, replacement);
  fs.writeFileSync(filePath, content);
}

function getTempFile(prefix, suffix) {
  mkdirp.sync(BUILD_DIR + "tmp/");
  const bytes = crypto.randomBytes(6).toString("hex");
  const filePath = BUILD_DIR + "tmp/" + prefix + bytes + suffix;
  fs.writeFileSync(filePath, "");
  return filePath;
}

function createTestSource(testsName, { bot = false, xfaOnly = false } = {}) {
  const source = stream.Readable({ objectMode: true });
  source._read = function () {
    console.log();
    console.log("### Running " + testsName + " tests");

    const PDF_TEST = process.env.PDF_TEST || "test_manifest.json";
    let forceNoChrome = false;
    const args = ["test.mjs"];
    switch (testsName) {
      case "browser":
        if (!bot) {
          args.push("--reftest");
        } else {
          const os = process.env.OS;
          if (/windows/i.test(os)) {
            // The browser-tests are too slow in Google Chrome on the Windows
            // bot, causing a timeout, hence disabling them for now.
            forceNoChrome = true;
          }
        }
        if (xfaOnly) {
          args.push("--xfaOnly");
        }
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
    if (process.argv.includes("--noChrome") || forceNoChrome) {
      args.push("--noChrome");
    }

    const testProcess = startNode(args, { cwd: TEST_DIR, stdio: "inherit" });
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

  let forceNoChrome = false;
  const args = ["test.mjs", "--masterMode"];
  if (bot) {
    const os = process.env.OS;
    if (/windows/i.test(os)) {
      // The browser-tests are too slow in Google Chrome on the Windows
      // bot, causing a timeout, hence disabling them for now.
      forceNoChrome = true;
    }
    args.push("--noPrompts", "--strictVerify");
  }
  if (process.argv.includes("--noChrome") || forceNoChrome) {
    args.push("--noChrome");
  }

  const testProcess = startNode(args, { cwd: TEST_DIR, stdio: "inherit" });
  testProcess.on("close", function (code) {
    done();
  });
}

gulp.task("default", function (done) {
  console.log("Available tasks:");
  const tasks = Object.keys(gulp.registry().tasks());
  for (const taskName of tasks.sort()) {
    if (taskName.endsWith("-pre")) {
      continue;
    }
    console.log("  " + taskName);
  }
  done();
});

function createBuildNumber(done) {
  console.log();
  console.log("### Getting extension build number");

  exec(
    "git log --format=oneline " + config.baseVersion + "..",
    function (err, stdout, stderr) {
      let buildNumber = 0;
      if (!err) {
        // Build number is the number of commits since base version
        buildNumber = stdout ? stdout.match(/\n/g).length : 0;
      } else {
        console.log(
          "This is not a Git repository; using default build number."
        );
      }

      console.log("Extension build number: " + buildNumber);

      const version = config.versionPrefix + buildNumber;

      exec('git log --format="%h" -n 1', function (err2, stdout2, stderr2) {
        let buildCommit = "";
        if (!err2) {
          buildCommit = stdout2.replace("\n", "");
        }

        createStringSource(
          "version.json",
          JSON.stringify(
            {
              version,
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
}

function buildDefaultPreferences(defines, dir) {
  console.log();
  console.log("### Building default preferences");

  const bundleDefines = builder.merge(defines, {
    LIB: true,
    TESTING: defines.TESTING ?? process.env.TESTING === "true",
  });

  const defaultPreferencesConfig = createWebpackConfig(
    bundleDefines,
    {
      filename: "app_options.mjs",
      library: {
        type: "module",
      },
    },
    {
      disableVersionInfo: true,
    }
  );
  return gulp
    .src("web/app_options.js")
    .pipe(webpack2Stream(defaultPreferencesConfig))
    .pipe(gulp.dest(DEFAULT_PREFERENCES_DIR + dir));
}

async function parseDefaultPreferences(dir) {
  console.log();
  console.log("### Parsing default preferences");

  // eslint-disable-next-line no-unsanitized/method
  const { AppOptions, OptionKind } = await import(
    "./" + DEFAULT_PREFERENCES_DIR + dir + "app_options.mjs"
  );

  const prefs = AppOptions.getAll(OptionKind.PREFERENCE);
  if (Object.keys(prefs).length === 0) {
    throw new Error("No default preferences found.");
  }

  fs.writeFileSync(
    DEFAULT_PREFERENCES_DIR + dir + "default_preferences.json",
    JSON.stringify(prefs)
  );
}

function getDefaultPreferences(dir) {
  const str = fs
    .readFileSync(DEFAULT_PREFERENCES_DIR + dir + "default_preferences.json")
    .toString();
  return JSON.parse(str);
}

gulp.task("locale", function () {
  const VIEWER_LOCALE_OUTPUT = "web/locale/";

  console.log();
  console.log("### Building localization files");

  rimraf.sync(VIEWER_LOCALE_OUTPUT);
  mkdirp.sync(VIEWER_LOCALE_OUTPUT);

  const subfolders = fs.readdirSync(L10N_DIR);
  subfolders.sort();
  let viewerOutput = "";
  const locales = [];
  for (const locale of subfolders) {
    const dirPath = L10N_DIR + locale;
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

gulp.task("cmaps", async function () {
  const CMAP_INPUT = "external/cmaps";
  const VIEWER_CMAP_OUTPUT = "external/bcmaps";

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

  const { compressCmaps } = await import(
    "./external/cmapscompress/compress.mjs"
  );
  compressCmaps(CMAP_INPUT, VIEWER_CMAP_OUTPUT, true);
});

function preprocessCSS(source, defines) {
  const outName = getTempFile("~preprocess", ".css");
  builder.preprocess(source, outName, defines);
  let out = fs.readFileSync(outName).toString();
  fs.unlinkSync(outName);

  // Strip out all license headers in the middle.
  const reg = /\n\/\* Copyright(.|\n)*?Mozilla Foundation(.|\n)*?\*\//g;
  out = out.replaceAll(reg, "");

  const i = source.lastIndexOf("/");
  return createStringSource(source.substr(i + 1), out);
}

function preprocessHTML(source, defines) {
  const outName = getTempFile("~preprocess", ".html");
  builder.preprocess(source, outName, defines);
  const out = fs.readFileSync(outName).toString();
  fs.unlinkSync(outName);

  const i = source.lastIndexOf("/");
  return createStringSource(source.substr(i + 1), `${out.trimEnd()}\n`);
}

function buildGeneric(defines, dir) {
  rimraf.sync(dir);

  return merge([
    createMainBundle(defines).pipe(gulp.dest(dir + "build")),
    createWorkerBundle(defines).pipe(gulp.dest(dir + "build")),
    createSandboxBundle(defines).pipe(gulp.dest(dir + "build")),
    createWebBundle(defines, {
      defaultPreferencesDir: defines.SKIP_BABEL
        ? "generic/"
        : "generic-legacy/",
    }).pipe(gulp.dest(dir + "web")),
    gulp.src(COMMON_WEB_FILES, { base: "web/" }).pipe(gulp.dest(dir + "web")),
    gulp.src("LICENSE").pipe(gulp.dest(dir)),
    gulp
      .src(["web/locale/*/viewer.properties", "web/locale/locale.properties"], {
        base: "web/",
      })
      .pipe(gulp.dest(dir + "web")),
    createCMapBundle().pipe(gulp.dest(dir + "web/cmaps")),
    createStandardFontBundle().pipe(gulp.dest(dir + "web/standard_fonts")),

    preprocessHTML("web/viewer.html", defines).pipe(gulp.dest(dir + "web")),
    preprocessCSS("web/viewer.css", defines)
      .pipe(
        postcss([
          postcssDirPseudoClass(),
          postcssNesting(),
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
    createBuildNumber,
    "locale",
    function scriptingGeneric() {
      const defines = builder.merge(DEFINES, { GENERIC: true });
      return merge([
        buildDefaultPreferences(defines, "generic/"),
        createTemporaryScriptingBundle(defines),
      ]);
    },
    async function prefsGeneric() {
      await parseDefaultPreferences("generic/");
    },
    function createGeneric() {
      console.log();
      console.log("### Creating generic viewer");
      const defines = builder.merge(DEFINES, { GENERIC: true });

      return buildGeneric(defines, GENERIC_DIR);
    }
  )
);

// Builds the generic production viewer that should be compatible with most
// older HTML5 browsers.
gulp.task(
  "generic-legacy",
  gulp.series(
    createBuildNumber,
    "locale",
    function scriptingGenericLegacy() {
      const defines = builder.merge(DEFINES, {
        GENERIC: true,
        SKIP_BABEL: false,
      });
      return merge([
        buildDefaultPreferences(defines, "generic-legacy/"),
        createTemporaryScriptingBundle(defines),
      ]);
    },
    async function prefsGenericLegacy() {
      await parseDefaultPreferences("generic-legacy/");
    },
    function createGenericLegacy() {
      console.log();
      console.log("### Creating generic (legacy) viewer");
      const defines = builder.merge(DEFINES, {
        GENERIC: true,
        SKIP_BABEL: false,
      });

      return buildGeneric(defines, GENERIC_LEGACY_DIR);
    }
  )
);

function buildComponents(defines, dir) {
  rimraf.sync(dir);

  const COMPONENTS_IMAGES = [
    "web/images/annotation-*.svg",
    "web/images/loading-icon.gif",
  ];

  return merge([
    createComponentsBundle(defines).pipe(gulp.dest(dir)),
    gulp.src(COMPONENTS_IMAGES).pipe(gulp.dest(dir + "images")),
    preprocessCSS("web/pdf_viewer.css", defines)
      .pipe(
        postcss([
          postcssDirPseudoClass(),
          postcssNesting(),
          autoprefixer(AUTOPREFIXER_CONFIG),
        ])
      )
      .pipe(gulp.dest(dir)),
  ]);
}

gulp.task(
  "components",
  gulp.series(createBuildNumber, function createComponents() {
    console.log();
    console.log("### Creating generic components");
    const defines = builder.merge(DEFINES, { COMPONENTS: true, GENERIC: true });

    return buildComponents(defines, COMPONENTS_DIR);
  })
);

gulp.task(
  "components-legacy",
  gulp.series(createBuildNumber, function createComponentsLegacy() {
    console.log();
    console.log("### Creating generic (legacy) components");
    const defines = builder.merge(DEFINES, {
      COMPONENTS: true,
      GENERIC: true,
      SKIP_BABEL: false,
    });

    return buildComponents(defines, COMPONENTS_LEGACY_DIR);
  })
);

gulp.task(
  "image_decoders",
  gulp.series(createBuildNumber, function createImageDecoders() {
    console.log();
    console.log("### Creating image decoders");
    const defines = builder.merge(DEFINES, {
      GENERIC: true,
      IMAGE_DECODERS: true,
    });

    return createImageDecodersBundle(defines).pipe(
      gulp.dest(IMAGE_DECODERS_DIR)
    );
  })
);

gulp.task(
  "image_decoders-legacy",
  gulp.series(createBuildNumber, function createImageDecodersLegacy() {
    console.log();
    console.log("### Creating (legacy) image decoders");
    const defines = builder.merge(DEFINES, {
      GENERIC: true,
      IMAGE_DECODERS: true,
      SKIP_BABEL: false,
    });

    return createImageDecodersBundle(defines).pipe(
      gulp.dest(IMAGE_DECODERS_LEGACY_DIR)
    );
  })
);

function buildMinified(defines, dir) {
  rimraf.sync(dir);

  return merge([
    createMainBundle(defines).pipe(gulp.dest(dir + "build")),
    createWorkerBundle(defines).pipe(gulp.dest(dir + "build")),
    createSandboxBundle(defines).pipe(gulp.dest(dir + "build")),
    createWebBundle(defines, {
      defaultPreferencesDir: defines.SKIP_BABEL
        ? "minified/"
        : "minified-legacy/",
    }).pipe(gulp.dest(dir + "web")),
    createImageDecodersBundle(
      builder.merge(defines, { IMAGE_DECODERS: true })
    ).pipe(gulp.dest(dir + "image_decoders")),
    gulp.src(COMMON_WEB_FILES, { base: "web/" }).pipe(gulp.dest(dir + "web")),
    gulp
      .src(["web/locale/*/viewer.properties", "web/locale/locale.properties"], {
        base: "web/",
      })
      .pipe(gulp.dest(dir + "web")),
    createCMapBundle().pipe(gulp.dest(dir + "web/cmaps")),
    createStandardFontBundle().pipe(gulp.dest(dir + "web/standard_fonts")),

    preprocessHTML("web/viewer.html", defines).pipe(gulp.dest(dir + "web")),
    preprocessCSS("web/viewer.css", defines)
      .pipe(
        postcss([
          postcssDirPseudoClass(),
          postcssNesting(),
          autoprefixer(AUTOPREFIXER_CONFIG),
        ])
      )
      .pipe(gulp.dest(dir + "web")),

    gulp
      .src("web/compressed.tracemonkey-pldi-09.pdf")
      .pipe(gulp.dest(dir + "web")),
  ]);
}

async function parseMinified(dir) {
  const pdfFile = fs.readFileSync(dir + "/build/pdf.js").toString();
  const pdfWorkerFile = fs
    .readFileSync(dir + "/build/pdf.worker.js")
    .toString();
  const pdfSandboxFile = fs
    .readFileSync(dir + "/build/pdf.sandbox.js")
    .toString();
  const pdfImageDecodersFile = fs
    .readFileSync(dir + "/image_decoders/pdf.image_decoders.js")
    .toString();
  const viewerFiles = {
    "pdf.js": pdfFile,
    "viewer.js": fs.readFileSync(dir + "/web/viewer.js").toString(),
  };

  console.log();
  console.log("### Minifying js files");

  const { minify } = await import("terser");
  const options = {
    compress: {
      // V8 chokes on very long sequences, work around that.
      sequences: false,
    },
    keep_classnames: true,
    keep_fnames: true,
  };

  fs.writeFileSync(
    dir + "/web/pdf.viewer.js",
    (await minify(viewerFiles, options)).code
  );
  fs.writeFileSync(
    dir + "/build/pdf.min.js",
    (await minify(pdfFile, options)).code
  );
  fs.writeFileSync(
    dir + "/build/pdf.worker.min.js",
    (await minify(pdfWorkerFile, options)).code
  );
  fs.writeFileSync(
    dir + "/build/pdf.sandbox.min.js",
    (await minify(pdfSandboxFile, options)).code
  );
  fs.writeFileSync(
    dir + "image_decoders/pdf.image_decoders.min.js",
    (await minify(pdfImageDecodersFile, options)).code
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
  gulp.series(
    createBuildNumber,
    "locale",
    function scriptingMinified() {
      const defines = builder.merge(DEFINES, { MINIFIED: true, GENERIC: true });
      return merge([
        buildDefaultPreferences(defines, "minified/"),
        createTemporaryScriptingBundle(defines),
      ]);
    },
    async function prefsMinified() {
      await parseDefaultPreferences("minified/");
    },
    function createMinified() {
      console.log();
      console.log("### Creating minified viewer");
      const defines = builder.merge(DEFINES, { MINIFIED: true, GENERIC: true });

      return buildMinified(defines, MINIFIED_DIR);
    },
    async function compressMinified(done) {
      await parseMinified(MINIFIED_DIR);
      done();
    }
  )
);

gulp.task(
  "minified-legacy",
  gulp.series(
    createBuildNumber,
    "locale",
    function scriptingMinifiedLegacy() {
      const defines = builder.merge(DEFINES, {
        MINIFIED: true,
        GENERIC: true,
        SKIP_BABEL: false,
      });
      return merge([
        buildDefaultPreferences(defines, "minified-legacy/"),
        createTemporaryScriptingBundle(defines),
      ]);
    },
    async function prefsMinifiedLegacy() {
      await parseDefaultPreferences("minified-legacy/");
    },
    function createMinifiedLegacy() {
      console.log();
      console.log("### Creating minified (legacy) viewer");
      const defines = builder.merge(DEFINES, {
        MINIFIED: true,
        GENERIC: true,
        SKIP_BABEL: false,
      });

      return buildMinified(defines, MINIFIED_LEGACY_DIR);
    },
    async function compressMinifiedLegacy(done) {
      await parseMinified(MINIFIED_LEGACY_DIR);
      done();
    }
  )
);

function preprocessDefaultPreferences(content) {
  const licenseHeader = fs.readFileSync("./src/license_header.js").toString();

  const MODIFICATION_WARNING =
    "//\n// THIS FILE IS GENERATED AUTOMATICALLY, DO NOT EDIT MANUALLY!\n//\n";

  const bundleDefines = builder.merge(DEFINES, {
    DEFAULT_PREFERENCES: getDefaultPreferences("mozcentral/"),
  });

  content = preprocessPDFJSCode(
    {
      rootPath: __dirname,
      defines: bundleDefines,
    },
    content
  );

  return licenseHeader + "\n" + MODIFICATION_WARNING + "\n" + content + "\n";
}

function replaceMozcentralCSS() {
  return replace(/var\(--(inline-(?:start|end))\)/g, "$1");
}

gulp.task(
  "mozcentral",
  gulp.series(
    createBuildNumber,
    function scriptingMozcentral() {
      const defines = builder.merge(DEFINES, { MOZCENTRAL: true });
      return buildDefaultPreferences(defines, "mozcentral/");
    },
    async function prefsMozcentral() {
      await parseDefaultPreferences("mozcentral/");
    },
    function createMozcentral() {
      console.log();
      console.log("### Building mozilla-central extension");
      const defines = builder.merge(DEFINES, { MOZCENTRAL: true });
      const gvDefines = builder.merge(defines, { GECKOVIEW: true });

      const MOZCENTRAL_DIR = BUILD_DIR + "mozcentral/",
        MOZCENTRAL_EXTENSION_DIR = MOZCENTRAL_DIR + "browser/extensions/pdfjs/",
        MOZCENTRAL_CONTENT_DIR = MOZCENTRAL_EXTENSION_DIR + "content/",
        MOZCENTRAL_L10N_DIR =
          MOZCENTRAL_DIR + "browser/locales/en-US/pdfviewer/",
        FIREFOX_CONTENT_DIR = EXTENSION_SRC_DIR + "/firefox/content/";

      const MOZCENTRAL_WEB_FILES = [
        ...COMMON_WEB_FILES,
        "!web/images/toolbarButton-openFile.svg",
      ];
      const MOZCENTRAL_AUTOPREFIXER_CONFIG = {
        overrideBrowserslist: ["last 1 firefox versions"],
      };

      // Clear out everything in the firefox extension build directory
      rimraf.sync(MOZCENTRAL_DIR);

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
        createWebBundle(defines, { defaultPreferencesDir: "mozcentral/" }).pipe(
          gulp.dest(MOZCENTRAL_CONTENT_DIR + "web")
        ),
        createGVWebBundle(defines, {
          defaultPreferencesDir: "mozcentral/",
        }).pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + "web")),
        gulp
          .src(MOZCENTRAL_WEB_FILES, { base: "web/" })
          .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + "web")),
        createCMapBundle().pipe(
          gulp.dest(MOZCENTRAL_CONTENT_DIR + "web/cmaps")
        ),
        createStandardFontBundle().pipe(
          gulp.dest(MOZCENTRAL_CONTENT_DIR + "web/standard_fonts")
        ),

        preprocessHTML("web/viewer.html", defines).pipe(
          gulp.dest(MOZCENTRAL_CONTENT_DIR + "web")
        ),
        preprocessHTML("web/viewer-geckoview.html", gvDefines).pipe(
          gulp.dest(MOZCENTRAL_CONTENT_DIR + "web")
        ),

        preprocessCSS("web/viewer.css", defines)
          .pipe(postcss([autoprefixer(MOZCENTRAL_AUTOPREFIXER_CONFIG)]))
          .pipe(replaceMozcentralCSS())
          .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + "web")),

        preprocessCSS("web/viewer-geckoview.css", gvDefines)
          .pipe(postcss([autoprefixer(MOZCENTRAL_AUTOPREFIXER_CONFIG)]))
          .pipe(replaceMozcentralCSS())
          .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + "web")),

        gulp
          .src("l10n/en-US/*.properties")
          .pipe(gulp.dest(MOZCENTRAL_L10N_DIR)),
        gulp.src("LICENSE").pipe(gulp.dest(MOZCENTRAL_EXTENSION_DIR)),
        gulp
          .src(FIREFOX_CONTENT_DIR + "PdfJsDefaultPreferences.sys.mjs")
          .pipe(transform("utf8", preprocessDefaultPreferences))
          .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR)),
      ]);
    }
  )
);

gulp.task(
  "chromium",
  gulp.series(
    createBuildNumber,
    "locale",
    function scriptingChromium() {
      const defines = builder.merge(DEFINES, {
        CHROME: true,
        SKIP_BABEL: false,
      });
      return merge([
        buildDefaultPreferences(defines, "chromium/"),
        createTemporaryScriptingBundle(defines),
      ]);
    },
    async function prefsChromium() {
      await parseDefaultPreferences("chromium/");
    },
    function createChromium() {
      console.log();
      console.log("### Building Chromium extension");
      const defines = builder.merge(DEFINES, {
        CHROME: true,
        SKIP_BABEL: false,
      });

      const CHROME_BUILD_DIR = BUILD_DIR + "/chromium/",
        CHROME_BUILD_CONTENT_DIR = CHROME_BUILD_DIR + "/content/";

      const CHROME_WEB_FILES = [
        ...COMMON_WEB_FILES,
        "!web/images/toolbarButton-openFile.svg",
      ];

      // Clear out everything in the chrome extension build directory
      rimraf.sync(CHROME_BUILD_DIR);

      const version = getVersionJSON().version;

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
        createWebBundle(defines, { defaultPreferencesDir: "chromium/" }).pipe(
          gulp.dest(CHROME_BUILD_CONTENT_DIR + "web")
        ),
        gulp
          .src(CHROME_WEB_FILES, { base: "web/" })
          .pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + "web")),

        gulp
          .src(
            ["web/locale/*/viewer.properties", "web/locale/locale.properties"],
            { base: "web/" }
          )
          .pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + "web")),
        createCMapBundle().pipe(
          gulp.dest(CHROME_BUILD_CONTENT_DIR + "web/cmaps")
        ),
        createStandardFontBundle().pipe(
          gulp.dest(CHROME_BUILD_CONTENT_DIR + "web/standard_fonts")
        ),

        preprocessHTML("web/viewer.html", defines).pipe(
          gulp.dest(CHROME_BUILD_CONTENT_DIR + "web")
        ),
        preprocessCSS("web/viewer.css", defines)
          .pipe(
            postcss([
              postcssDirPseudoClass(),
              postcssNesting(),
              autoprefixer(AUTOPREFIXER_CONFIG),
            ])
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

gulp.task("jsdoc", function (done) {
  console.log();
  console.log("### Generating documentation (JSDoc)");

  const JSDOC_FILES = ["src/display/api.js"];

  rimraf(JSDOC_BUILD_DIR, function () {
    mkdirp(JSDOC_BUILD_DIR).then(function () {
      const command =
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
  exec(
    `"node_modules/.bin/tsc" --outDir ${TYPES_DIR} --project .`,
    function () {
      exec(`"node_modules/.bin/tsc-alias" --outDir ${TYPES_DIR}`, done);
    }
  );
});

function buildLibHelper(bundleDefines, inputStream, outputDir) {
  // When we create a bundle, webpack is run on the source and it will replace
  // require with __webpack_require__. When we want to use the real require,
  // __non_webpack_require__ has to be used.
  // In this target, we don't create a bundle, so we have to replace the
  // occurrences of __non_webpack_require__ ourselves.
  function babelPluginReplaceNonWebpackImports(b) {
    return {
      visitor: {
        Identifier(curPath, state) {
          if (curPath.node.name === "__non_webpack_require__") {
            curPath.replaceWith(b.types.identifier("require"));
          } else if (curPath.node.name === "__non_webpack_import__") {
            curPath.replaceWith(b.types.identifier("import"));
          }
        },
      },
    };
  }
  function preprocess(content) {
    const skipBabel = bundleDefines.SKIP_BABEL;
    content = preprocessPDFJSCode(ctx, content);
    content = babel.transform(content, {
      sourceType: "module",
      presets: skipBabel ? undefined : ["@babel/preset-env"],
      plugins: [
        "@babel/plugin-transform-modules-commonjs",
        babelPluginReplaceNonWebpackImports,
      ],
      targets: BABEL_TARGETS,
    }).code;
    const removeCjsSrc =
      /^(var\s+\w+\s*=\s*(_interopRequireDefault\()?require\(".*?)(?:\/src)(\/[^"]*"\)\)?;)$/gm;
    content = content.replaceAll(
      removeCjsSrc,
      (all, prefix, interop, suffix) => prefix + suffix
    );
    return licenseHeaderLibre + content;
  }
  const ctx = {
    rootPath: __dirname,
    saveComments: false,
    defines: bundleDefines,
    map: {
      "pdfjs-lib": "../pdf",
      "display-fetch_stream": "./fetch_stream",
      "display-l10n_utils": "../web/l10n_utils",
      "display-network": "./network",
      "display-node_stream": "./node_stream",
      "display-node_utils": "./node_utils",
      "display-svg": "./svg",
    },
  };
  const licenseHeaderLibre = fs
    .readFileSync("./src/license_header_libre.js")
    .toString();
  return inputStream
    .pipe(transform("utf8", preprocess))
    .pipe(gulp.dest(outputDir));
}

function buildLib(defines, dir) {
  const versionInfo = getVersionJSON();

  const bundleDefines = builder.merge(defines, {
    BUNDLE_VERSION: versionInfo.version,
    BUNDLE_BUILD: versionInfo.commit,
    TESTING: defines.TESTING ?? process.env.TESTING === "true",
    DEFAULT_PREFERENCES: getDefaultPreferences(
      defines.SKIP_BABEL ? "lib/" : "lib-legacy/"
    ),
  });

  const inputStream = merge([
    gulp.src(
      [
        "src/{core,display,shared}/**/*.js",
        "!src/shared/{cffStandardStrings,fonts_utils}.js",
        "src/{pdf,pdf.image_decoders,pdf.worker}.js",
      ],
      { base: "src/" }
    ),
    gulp.src(
      [
        "examples/node/domstubs.js",
        "external/webL10n/l10n.js",
        "web/*.js",
        "!web/{pdfjs,viewer}.js",
      ],
      { base: "." }
    ),
    gulp.src("test/unit/*.js", { base: "." }),
  ]);

  return buildLibHelper(bundleDefines, inputStream, dir);
}

gulp.task(
  "lib",
  gulp.series(
    createBuildNumber,
    function scriptingLib() {
      const defines = builder.merge(DEFINES, { GENERIC: true, LIB: true });
      return merge([
        buildDefaultPreferences(defines, "lib/"),
        createTemporaryScriptingBundle(defines),
      ]);
    },
    async function prefsLib() {
      await parseDefaultPreferences("lib/");
    },
    function createLib() {
      const defines = builder.merge(DEFINES, { GENERIC: true, LIB: true });

      return merge([
        buildLib(defines, "build/lib/"),
        createSandboxBundle(defines).pipe(gulp.dest("build/lib/")),
      ]);
    }
  )
);

gulp.task(
  "lib-legacy",
  gulp.series(
    createBuildNumber,
    function scriptingLibLegacy() {
      const defines = builder.merge(DEFINES, {
        GENERIC: true,
        LIB: true,
        SKIP_BABEL: false,
      });
      return merge([
        buildDefaultPreferences(defines, "lib-legacy/"),
        createTemporaryScriptingBundle(defines),
      ]);
    },
    async function prefsLibLegacy() {
      await parseDefaultPreferences("lib-legacy/");
    },
    function createLibLegacy() {
      const defines = builder.merge(DEFINES, {
        GENERIC: true,
        LIB: true,
        SKIP_BABEL: false,
      });

      return merge([
        buildLib(defines, "build/lib-legacy/"),
        createSandboxBundle(defines).pipe(gulp.dest("build/lib-legacy/")),
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
  gulp.series("generic", "generic-legacy", function createPublish(done) {
    const version = JSON.parse(
      fs.readFileSync(BUILD_DIR + "version.json").toString()
    ).version;

    config.stableVersion = version;

    return merge([
      createStringSource(CONFIG_FILE, JSON.stringify(config, null, 2)).pipe(
        gulp.dest(".")
      ),
      compressPublish("pdfjs-" + version + "-dist.zip", GENERIC_DIR),
      compressPublish(
        "pdfjs-" + version + "-legacy-dist.zip",
        GENERIC_LEGACY_DIR
      ),
    ]);
  })
);

function setTestEnv(done) {
  process.env.TESTING = "true";
  // TODO: Re-write the relevant unit-tests, which are using `new Date(...)`,
  //       to not required the following time-zone hack since it doesn't work
  //       when the unit-tests are run directly in the browser.
  process.env.TZ = "UTC";
  done();
}

gulp.task(
  "test",
  gulp.series(setTestEnv, "generic", "components", function runTest() {
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
  gulp.series(setTestEnv, "generic", "components", function runBotTest() {
    return streamqueue(
      { objectMode: true },
      createTestSource("unit", { bot: true }),
      createTestSource("font", { bot: true }),
      createTestSource("browser", { bot: true }),
      createTestSource("integration")
    );
  })
);

gulp.task(
  "xfatest",
  gulp.series(setTestEnv, "generic", "components", function runXfaTest() {
    return streamqueue(
      { objectMode: true },
      createTestSource("unit"),
      createTestSource("browser", { xfaOnly: true }),
      createTestSource("integration")
    );
  })
);

gulp.task(
  "botxfatest",
  gulp.series(setTestEnv, "generic", "components", function runBotXfaTest() {
    return streamqueue(
      { objectMode: true },
      createTestSource("unit", { bot: true }),
      createTestSource("font", { bot: true }),
      createTestSource("browser", { bot: true, xfaOnly: true }),
      createTestSource("integration")
    );
  })
);

gulp.task(
  "browsertest",
  gulp.series(setTestEnv, "generic", "components", function runBrowserTest() {
    return createTestSource("browser");
  })
);

gulp.task(
  "botbrowsertest",
  gulp.series(
    setTestEnv,
    "generic",
    "components",
    function runBotBrowserTest() {
      return streamqueue(
        { objectMode: true },
        createTestSource("browser", { bot: true })
      );
    }
  )
);

gulp.task(
  "unittest",
  gulp.series(setTestEnv, "generic", function runUnitTest() {
    return createTestSource("unit");
  })
);

gulp.task(
  "integrationtest",
  gulp.series(setTestEnv, "generic", function runIntegrationTest() {
    return createTestSource("integration");
  })
);

gulp.task(
  "fonttest",
  gulp.series(setTestEnv, function runFontTest() {
    return createTestSource("font");
  })
);

gulp.task(
  "makeref",
  gulp.series(setTestEnv, "generic", "components", function runMakeref(done) {
    makeRef(done);
  })
);

gulp.task(
  "botmakeref",
  gulp.series(
    setTestEnv,
    "generic",
    "components",
    function runBotMakeref(done) {
      makeRef(done, true);
    }
  )
);

gulp.task(
  "typestest",
  gulp.series(
    setTestEnv,
    "generic",
    "types",
    function createTypesTest() {
      return merge([
        packageJson().pipe(gulp.dest(TYPESTEST_DIR)),
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
    },
    function runTypesTest(done) {
      exec('"node_modules/.bin/tsc" -p test/types', function (err, stdout) {
        if (err) {
          console.log(`Couldn't compile TypeScript test: ${stdout}`);
        }
        done(err);
      });
    }
  )
);

function createBaseline(done) {
  console.log();
  console.log("### Creating baseline environment");

  const baselineCommit = process.env.BASELINE;
  if (!baselineCommit) {
    done(new Error("Missing baseline commit. Specify the BASELINE variable."));
    return;
  }

  let initializeCommand = "git fetch origin";
  if (!checkDir(BASELINE_DIR)) {
    mkdirp.sync(BASELINE_DIR);
    initializeCommand = "git clone ../../ .";
  }

  const workingDirectory = path.resolve(process.cwd(), BASELINE_DIR);
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
}

gulp.task(
  "unittestcli",
  gulp.series(setTestEnv, "lib-legacy", function runUnitTestCli(done) {
    const options = [
      "node_modules/jasmine/bin/jasmine",
      "JASMINE_CONFIG_PATH=test/unit/clitests.json",
    ];
    const jasmineProcess = startNode(options, { stdio: "inherit" });
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
    ".js,.jsm,.mjs,.json",
    ".",
    "--report-unused-disable-directives",
  ];
  if (process.argv.includes("--fix")) {
    esLintOptions.push("--fix");
  }

  const styleLintOptions = [
    "node_modules/stylelint/bin/stylelint.mjs",
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
  gulp.series(
    function scriptingLintChromium() {
      const defines = builder.merge(DEFINES, {
        CHROME: true,
        SKIP_BABEL: false,
        TESTING: false,
      });
      return buildDefaultPreferences(defines, "lint-chromium/");
    },
    async function prefsLintChromium() {
      await parseDefaultPreferences("lint-chromium/");
    },
    function runLintChromium(done) {
      console.log();
      console.log("### Checking supplemental Chromium files");

      if (
        !checkChromePreferencesFile(
          "extensions/chromium/preferences_schema.json",
          getDefaultPreferences("lint-chromium/")
        )
      ) {
        done(new Error("chromium/preferences_schema is not in sync."));
        return;
      }
      done();
    }
  )
);

gulp.task(
  "dev-sandbox",
  gulp.series(
    function scriptingDevSandbox() {
      const defines = builder.merge(DEFINES, { GENERIC: true, TESTING: true });
      return createTemporaryScriptingBundle(defines, {
        disableVersionInfo: true,
      });
    },
    function createDevSandbox() {
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

gulp.task(
  "server",
  gulp.parallel(
    function watchDevSandbox() {
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
    },
    async function createServer() {
      console.log();
      console.log("### Starting local server");

      const { WebServer } = await import("./test/webserver.mjs");
      const server = new WebServer();
      server.port = 8888;
      server.start();
    }
  )
);

gulp.task("clean", function (done) {
  console.log();
  console.log("### Cleaning up project builds");

  rimraf(BUILD_DIR, done);
});

gulp.task("importl10n", async function () {
  const { downloadL10n } = await import("./external/importL10n/locales.mjs");

  console.log();
  console.log("### Importing translations from mozilla-central");

  if (!fs.existsSync(L10N_DIR)) {
    fs.mkdirSync(L10N_DIR);
  }
  await downloadL10n(L10N_DIR);
});

function ghPagesPrepare() {
  console.log();
  console.log("### Creating web site");

  rimraf.sync(GH_PAGES_DIR);

  return merge([
    gulp
      .src(GENERIC_DIR + "**/*", { base: GENERIC_DIR, removeBOM: false })
      .pipe(gulp.dest(GH_PAGES_DIR)),
    gulp
      .src(GENERIC_LEGACY_DIR + "**/*", {
        base: GENERIC_LEGACY_DIR,
        removeBOM: false,
      })
      .pipe(gulp.dest(GH_PAGES_DIR + "legacy/")),
    gulp
      .src(JSDOC_BUILD_DIR + "**/*", { base: JSDOC_BUILD_DIR })
      .pipe(gulp.dest(GH_PAGES_DIR + "api/draft/")),
  ]);
}

gulp.task("wintersmith", async function () {
  const { default: wintersmith } = await import("wintersmith");
  const env = wintersmith("docs/config.json");

  return new Promise((resolve, reject) => {
    env.build(GH_PAGES_DIR, function (error) {
      if (error) {
        reject(error);
        return;
      }

      replaceInFile(
        GH_PAGES_DIR + "/getting_started/index.html",
        /STABLE_VERSION/g,
        config.stableVersion
      );

      console.log("Done building with wintersmith.");
      resolve();
    });
  });
});

gulp.task(
  "web",
  gulp.series(
    "generic",
    "generic-legacy",
    "jsdoc",
    ghPagesPrepare,
    "wintersmith"
  )
);

function packageJson() {
  const VERSION = getVersionJSON().version;

  const DIST_NAME = "pdfjs-dist";
  const DIST_DESCRIPTION = "Generic build of Mozilla's PDF.js library.";
  const DIST_KEYWORDS = ["Mozilla", "pdf", "pdf.js"];
  const DIST_HOMEPAGE = "http://mozilla.github.io/pdf.js/";
  const DIST_BUGS_URL = "https://github.com/mozilla/pdf.js/issues";
  const DIST_LICENSE = "Apache-2.0";

  const npmManifest = {
    name: DIST_NAME,
    version: VERSION,
    main: "build/pdf.js",
    types: "types/src/pdf.d.ts",
    description: DIST_DESCRIPTION,
    keywords: DIST_KEYWORDS,
    homepage: DIST_HOMEPAGE,
    bugs: DIST_BUGS_URL,
    license: DIST_LICENSE,
    optionalDependencies: {
      canvas: "^2.11.2",
      "path2d-polyfill": "^2.0.1",
    },
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
    engines: {
      node: ">=18",
    },
  };

  return createStringSource(
    "package.json",
    JSON.stringify(npmManifest, null, 2)
  );
}

gulp.task(
  "dist-pre",
  gulp.series(
    "generic",
    "generic-legacy",
    "components",
    "components-legacy",
    "image_decoders",
    "image_decoders-legacy",
    "minified",
    "minified-legacy",
    "types",
    function createDist() {
      console.log();
      console.log("### Cloning baseline distribution");

      rimraf.sync(DIST_DIR);
      mkdirp.sync(DIST_DIR);
      safeSpawnSync("git", ["clone", "--depth", "1", DIST_REPO_URL, DIST_DIR]);

      console.log();
      console.log("### Overwriting all files");
      rimraf.sync(path.join(DIST_DIR, "*"));

      return merge([
        packageJson().pipe(gulp.dest(DIST_DIR)),
        gulp
          .src("external/dist/**/*", {
            base: "external/dist",
            removeBOM: false,
          })
          .pipe(gulp.dest(DIST_DIR)),
        gulp.src(GENERIC_DIR + "LICENSE").pipe(gulp.dest(DIST_DIR)),
        gulp
          .src(GENERIC_DIR + "web/cmaps/**/*", { base: GENERIC_DIR + "web" })
          .pipe(gulp.dest(DIST_DIR)),
        gulp
          .src(GENERIC_DIR + "web/standard_fonts/**/*", {
            base: GENERIC_DIR + "web",
          })
          .pipe(gulp.dest(DIST_DIR)),
        gulp
          .src([
            GENERIC_DIR + "build/{pdf,pdf.worker,pdf.sandbox}.js",
            GENERIC_DIR + "build/{pdf,pdf.worker,pdf.sandbox}.js.map",
            SRC_DIR + "pdf.worker.entry.js",
          ])
          .pipe(gulp.dest(DIST_DIR + "build/")),
        gulp
          .src([
            GENERIC_LEGACY_DIR + "build/{pdf,pdf.worker,pdf.sandbox}.js",
            GENERIC_LEGACY_DIR + "build/{pdf,pdf.worker,pdf.sandbox}.js.map",
            SRC_DIR + "pdf.worker.entry.js",
          ])
          .pipe(gulp.dest(DIST_DIR + "legacy/build/")),
        gulp
          .src(MINIFIED_DIR + "build/pdf.js")
          .pipe(rename("pdf.min.js"))
          .pipe(gulp.dest(DIST_DIR + "build/")),
        gulp
          .src(MINIFIED_DIR + "build/pdf.worker.js")
          .pipe(rename("pdf.worker.min.js"))
          .pipe(gulp.dest(DIST_DIR + "build/")),
        gulp
          .src(MINIFIED_DIR + "build/pdf.sandbox.js")
          .pipe(rename("pdf.sandbox.min.js"))
          .pipe(gulp.dest(DIST_DIR + "build/")),
        gulp
          .src(MINIFIED_DIR + "image_decoders/pdf.image_decoders.js")
          .pipe(rename("pdf.image_decoders.min.js"))
          .pipe(gulp.dest(DIST_DIR + "image_decoders/")),
        gulp
          .src(MINIFIED_LEGACY_DIR + "build/pdf.js")
          .pipe(rename("pdf.min.js"))
          .pipe(gulp.dest(DIST_DIR + "legacy/build/")),
        gulp
          .src(MINIFIED_LEGACY_DIR + "build/pdf.worker.js")
          .pipe(rename("pdf.worker.min.js"))
          .pipe(gulp.dest(DIST_DIR + "legacy/build/")),
        gulp
          .src(MINIFIED_LEGACY_DIR + "build/pdf.sandbox.js")
          .pipe(rename("pdf.sandbox.min.js"))
          .pipe(gulp.dest(DIST_DIR + "legacy/build/")),
        gulp
          .src(MINIFIED_LEGACY_DIR + "image_decoders/pdf.image_decoders.js")
          .pipe(rename("pdf.image_decoders.min.js"))
          .pipe(gulp.dest(DIST_DIR + "legacy/image_decoders/")),
        gulp
          .src(COMPONENTS_DIR + "**/*", { base: COMPONENTS_DIR })
          .pipe(gulp.dest(DIST_DIR + "web/")),
        gulp
          .src(COMPONENTS_LEGACY_DIR + "**/*", { base: COMPONENTS_LEGACY_DIR })
          .pipe(gulp.dest(DIST_DIR + "legacy/web/")),
        gulp
          .src(IMAGE_DECODERS_DIR + "**/*", { base: IMAGE_DECODERS_DIR })
          .pipe(gulp.dest(DIST_DIR + "image_decoders/")),
        gulp
          .src(IMAGE_DECODERS_LEGACY_DIR + "**/*", {
            base: IMAGE_DECODERS_LEGACY_DIR,
          })
          .pipe(gulp.dest(DIST_DIR + "legacy/image_decoders/")),
        gulp
          .src(TYPES_DIR + "**/*", { base: TYPES_DIR })
          .pipe(gulp.dest(DIST_DIR + "types/")),
      ]);
    }
  )
);

gulp.task(
  "dist-install",
  gulp.series("dist-pre", function createDistInstall(done) {
    let distPath = DIST_DIR;
    const opts = {};
    const installPath = process.env.PDFJS_INSTALL_PATH;
    if (installPath) {
      opts.cwd = installPath;
      distPath = path.relative(installPath, distPath);
    }
    safeSpawnSync("npm", ["install", distPath], opts);
    done();
  })
);

gulp.task(
  "dist",
  gulp.series("dist-pre", function createDist(done) {
    const VERSION = getVersionJSON().version;

    console.log();
    console.log("### Committing changes");

    let reason = process.env.PDFJS_UPDATE_REASON;
    // Attempt to work-around the broken link, see https://github.com/mozilla/pdf.js/issues/10391
    if (typeof reason === "string") {
      const reasonParts =
        /^(See )(mozilla\/pdf\.js)@tags\/(v\d+\.\d+\.\d+)\s*$/.exec(reason);

      if (reasonParts) {
        reason =
          reasonParts[1] +
          "https://github.com/" +
          reasonParts[2] +
          "/releases/tag/" +
          reasonParts[3];
      }
    }
    const message =
      "PDF.js version " + VERSION + (reason ? " - " + reason : "");
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

gulp.task(
  "mozcentralbaseline",
  gulp.series(createBaseline, function createMozcentralBaseline(done) {
    console.log();
    console.log("### Creating mozcentral baseline environment");

    // Create a mozcentral build.
    rimraf.sync(BASELINE_DIR + BUILD_DIR);

    const workingDirectory = path.resolve(process.cwd(), BASELINE_DIR);
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
  gulp.series(
    "mozcentral",
    "mozcentralbaseline",
    function createMozcentralDiff(done) {
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
          const diff = safeSpawnSync(
            "git",
            ["diff", "--binary", "--cached", "--unified=8"],
            { cwd: MOZCENTRAL_BASELINE_DIR }
          ).stdout;

          createStringSource(MOZCENTRAL_DIFF_FILE, diff)
            .pipe(gulp.dest(BUILD_DIR))
            .on("end", function () {
              console.log(
                "Result diff can be found at " +
                  BUILD_DIR +
                  MOZCENTRAL_DIFF_FILE
              );
              done();
            });
        });
    }
  )
);

gulp.task("externaltest", function (done) {
  console.log();
  console.log("### Running test-fixtures.js");
  safeSpawnSync("node", ["external/builder/test-fixtures.mjs"], {
    stdio: "inherit",
  });

  console.log();
  console.log("### Running test-fixtures_esprima.js");
  safeSpawnSync("node", ["external/builder/test-fixtures_esprima.mjs"], {
    stdio: "inherit",
  });
  done();
});

gulp.task(
  "ci-test",
  gulp.series(
    gulp.parallel("lint", "externaltest", "unittestcli"),
    "lint-chromium",
    "typestest"
  )
);
