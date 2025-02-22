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

import {
  babelPluginPDFJSPreprocessor,
  preprocessPDFJSCode,
} from "./external/builder/babel-plugin-pdfjs-preprocessor.mjs";
import { exec, execSync, spawn, spawnSync } from "child_process";
import autoprefixer from "autoprefixer";
import babel from "@babel/core";
import crypto from "crypto";
import { fileURLToPath } from "url";
import fs from "fs";
import gulp from "gulp";
import hljs from "highlight.js";
import layouts from "@metalsmith/layouts";
import markdown from "@metalsmith/markdown";
import Metalsmith from "metalsmith";
import ordered from "ordered-read-streams";
import path from "path";
import postcss from "gulp-postcss";
import postcssDarkThemeClass from "postcss-dark-theme-class";
import postcssDirPseudoClass from "postcss-dir-pseudo-class";
import postcssDiscardComments from "postcss-discard-comments";
import postcssNesting from "postcss-nesting";
import { preprocess } from "./external/builder/builder.mjs";
import relative from "metalsmith-html-relative";
import rename from "gulp-rename";
import replace from "gulp-replace";
import stream from "stream";
import TerserPlugin from "terser-webpack-plugin";
import Vinyl from "vinyl";
import webpack2 from "webpack";
import webpackStream from "webpack-stream";
import zip from "gulp-zip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BUILD_DIR = "build/";
const L10N_DIR = "l10n/";
const TEST_DIR = "test/";

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
const DIST_DIR = BUILD_DIR + "dist/";
const TYPES_DIR = BUILD_DIR + "types/";
const TMP_DIR = BUILD_DIR + "tmp/";
const TYPESTEST_DIR = BUILD_DIR + "typestest/";
const COMMON_WEB_FILES = [
  "web/images/*.{png,svg,gif}",
  "web/debugger.{css,mjs}",
];
const MOZCENTRAL_DIFF_FILE = "mozcentral.diff";

const CONFIG_FILE = "pdfjs.config";
const config = JSON.parse(fs.readFileSync(CONFIG_FILE).toString());

const ENV_TARGETS = [
  "last 2 versions",
  "Chrome >= 110",
  "Firefox ESR",
  "Safari >= 16.4",
  "Node >= 20",
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

const BABEL_PRESET_ENV_OPTS = Object.freeze({
  corejs: "3.40.0",
  exclude: ["web.structured-clone"],
  shippedProposals: true,
  useBuiltIns: "usage",
});

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
  return new stream.Transform({
    objectMode: true,
    transform(vinylFile, enc, done) {
      const transformedFile = vinylFile.clone();
      transformedFile.contents = Buffer.from(
        transformFunction(transformedFile.contents),
        charEncoding
      );
      done(null, transformedFile);
    },
  });
}

function safeSpawnSync(command, parameters, options = {}) {
  // Execute all commands in a shell.
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

function createWebpackAlias(defines) {
  const basicAlias = {
    pdfjs: "src",
    "pdfjs-web": "web",
    "pdfjs-lib": "web/pdfjs",
    "fluent-bundle": "node_modules/@fluent/bundle/esm/index.js",
    "fluent-dom": "node_modules/@fluent/dom/esm/index.js",
  };
  const libraryAlias = {
    "display-cmap_reader_factory": "src/display/stubs.js",
    "display-standard_fontdata_factory": "src/display/stubs.js",
    "display-wasm_factory": "src/display/stubs.js",
    "display-fetch_stream": "src/display/stubs.js",
    "display-network": "src/display/stubs.js",
    "display-node_stream": "src/display/stubs.js",
    "display-node_utils": "src/display/stubs.js",
  };
  const viewerAlias = {
    "web-alt_text_manager": "web/alt_text_manager.js",
    "web-annotation_editor_params": "web/annotation_editor_params.js",
    "web-download_manager": "",
    "web-external_services": "",
    "web-new_alt_text_manager": "web/new_alt_text_manager.js",
    "web-null_l10n": "",
    "web-pdf_attachment_viewer": "web/pdf_attachment_viewer.js",
    "web-pdf_cursor_tools": "web/pdf_cursor_tools.js",
    "web-pdf_document_properties": "web/pdf_document_properties.js",
    "web-pdf_find_bar": "web/pdf_find_bar.js",
    "web-pdf_layer_viewer": "web/pdf_layer_viewer.js",
    "web-pdf_outline_viewer": "web/pdf_outline_viewer.js",
    "web-pdf_presentation_mode": "web/pdf_presentation_mode.js",
    "web-pdf_sidebar": "web/pdf_sidebar.js",
    "web-pdf_thumbnail_viewer": "web/pdf_thumbnail_viewer.js",
    "web-preferences": "",
    "web-print_service": "",
    "web-secondary_toolbar": "web/secondary_toolbar.js",
    "web-signature_manager": "web/signature_manager.js",
    "web-toolbar": "web/toolbar.js",
  };

  if (defines.CHROME) {
    libraryAlias["display-cmap_reader_factory"] =
      "src/display/cmap_reader_factory.js";
    libraryAlias["display-standard_fontdata_factory"] =
      "src/display/standard_fontdata_factory.js";
    libraryAlias["display-wasm_factory"] = "src/display/wasm_factory.js";
    libraryAlias["display-fetch_stream"] = "src/display/fetch_stream.js";
    libraryAlias["display-network"] = "src/display/network.js";

    viewerAlias["web-download_manager"] = "web/download_manager.js";
    viewerAlias["web-external_services"] = "web/chromecom.js";
    viewerAlias["web-null_l10n"] = "web/l10n.js";
    viewerAlias["web-preferences"] = "web/chromecom.js";
    viewerAlias["web-print_service"] = "web/pdf_print_service.js";
  } else if (defines.GENERIC) {
    // Aliases defined here must also be replicated in the paths section of
    // the tsconfig.json file for the type generation to work.
    // In the tsconfig.json files, the .js extension must be omitted.
    libraryAlias["display-cmap_reader_factory"] =
      "src/display/cmap_reader_factory.js";
    libraryAlias["display-standard_fontdata_factory"] =
      "src/display/standard_fontdata_factory.js";
    libraryAlias["display-wasm_factory"] = "src/display/wasm_factory.js";
    libraryAlias["display-fetch_stream"] = "src/display/fetch_stream.js";
    libraryAlias["display-network"] = "src/display/network.js";
    libraryAlias["display-node_stream"] = "src/display/node_stream.js";
    libraryAlias["display-node_utils"] = "src/display/node_utils.js";

    viewerAlias["web-download_manager"] = "web/download_manager.js";
    viewerAlias["web-external_services"] = "web/genericcom.js";
    viewerAlias["web-null_l10n"] = "web/genericl10n.js";
    viewerAlias["web-preferences"] = "web/genericcom.js";
    viewerAlias["web-print_service"] = "web/pdf_print_service.js";
  } else if (defines.MOZCENTRAL) {
    if (defines.GECKOVIEW) {
      const gvAlias = {
        "web-toolbar": "web/toolbar-geckoview.js",
      };
      for (const key in viewerAlias) {
        viewerAlias[key] = gvAlias[key] || "web/stubs-geckoview.js";
      }
    }
    viewerAlias["web-download_manager"] = "web/firefoxcom.js";
    viewerAlias["web-external_services"] = "web/firefoxcom.js";
    viewerAlias["web-null_l10n"] = "web/l10n.js";
    viewerAlias["web-preferences"] = "web/firefoxcom.js";
    viewerAlias["web-print_service"] = "web/firefox_print_service.js";
  }

  const alias = { ...basicAlias, ...libraryAlias, ...viewerAlias };
  for (const key in alias) {
    alias[key] = path.join(__dirname, alias[key]);
  }
  return alias;
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
  const bundleDefines = {
    ...defines,
    BUNDLE_VERSION: versionInfo.version,
    BUNDLE_BUILD: versionInfo.commit,
    TESTING: defines.TESTING ?? process.env.TESTING === "true",
    DEFAULT_PREFERENCES: defaultPreferencesDir
      ? getDefaultPreferences(defaultPreferencesDir)
      : {},
    DEFAULT_FTL: defines.GENERIC ? getDefaultFtl() : "",
  };
  const licenseHeaderLibre = fs
    .readFileSync("./src/license_header_libre.js")
    .toString();
  const enableSourceMaps =
    !bundleDefines.MOZCENTRAL &&
    !bundleDefines.CHROME &&
    !bundleDefines.LIB &&
    !bundleDefines.MINIFIED &&
    !bundleDefines.TESTING &&
    !disableSourceMaps;
  const isModule = output.library?.type === "module";
  const isMinified = bundleDefines.MINIFIED;
  const skipBabel = bundleDefines.SKIP_BABEL;

  const babelExcludeRegExp = [
    // `core-js`, see https://github.com/zloirock/core-js/issues/514,
    // should be excluded from processing.
    /node_modules[\\/]core-js/,
  ];

  const babelPresets = skipBabel
    ? undefined
    : [["@babel/preset-env", BABEL_PRESET_ENV_OPTS]];
  const babelPlugins = [
    [
      babelPluginPDFJSPreprocessor,
      {
        rootPath: __dirname,
        defines: bundleDefines,
      },
    ],
  ];

  const plugins = [];
  if (!disableLicenseHeader) {
    plugins.push(
      new webpack2.BannerPlugin({ banner: licenseHeaderLibre, raw: true })
    );
  }

  const alias = createWebpackAlias(bundleDefines);
  const experiments = isModule ? { outputModule: true } : undefined;

  // Required to expose e.g., the `window` object.
  output.globalObject = "globalThis";

  return {
    mode: "production",
    optimization: {
      mangleExports: false,
      minimize: isMinified,
      minimizer: !isMinified
        ? undefined
        : [
            new TerserPlugin({
              extractComments: false,
              parallel: false,
              terserOptions: {
                compress: {
                  // V8 chokes on very long sequences, work around that.
                  sequences: false,
                },
                mangle: {
                  // Ensure that the `tweakWebpackOutput` function works.
                  reserved: ["__webpack_exports__"],
                },
                keep_classnames: true,
                keep_fnames: true,
                module: isModule,
              },
            }),
          ],
    },
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
      parser: {
        javascript: {
          importMeta: false,
        },
      },
      rules: [
        {
          test: /\.[mc]?js$/,
          loader: "babel-loader",
          exclude: babelExcludeRegExp,
          options: {
            presets: babelPresets,
            plugins: babelPlugins,
            targets: BABEL_TARGETS,
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
    return !description?.startsWith("DEPRECATED.");
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

function tweakWebpackOutput(jsName) {
  return replace(
    /((?:\s|,)__webpack_exports__)(?:\s?)=(?:\s?)({};)/gm,
    (match, p1, p2) => `${p1} = globalThis.${jsName} = ${p2}`
  );
}

function createMainBundle(defines) {
  const mainFileConfig = createWebpackConfig(defines, {
    filename: defines.MINIFIED ? "pdf.min.mjs" : "pdf.mjs",
    library: {
      type: "module",
    },
  });
  return gulp
    .src("./src/pdf.js", { encoding: false })
    .pipe(webpack2Stream(mainFileConfig))
    .pipe(tweakWebpackOutput("pdfjsLib"));
}

function createScriptingBundle(defines, extraOptions = undefined) {
  const scriptingFileConfig = createWebpackConfig(
    defines,
    {
      filename: "pdf.scripting.mjs",
      library: {
        type: "module",
      },
    },
    extraOptions
  );
  return gulp
    .src("./src/pdf.scripting.js", { encoding: false })
    .pipe(webpack2Stream(scriptingFileConfig));
}

function createSandboxExternal(defines) {
  const licenseHeader = fs.readFileSync("./src/license_header.js").toString();

  const ctx = {
    defines,
  };
  return gulp
    .src("./src/pdf.sandbox.external.js", { encoding: false })
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
    disableVersionInfo: !!extraOptions?.disableVersionInfo,
    disableSourceMaps: true,
    disableLicenseHeader: true,
  }).pipe(gulp.dest(TMP_DIR));
}

function createSandboxBundle(defines, extraOptions = undefined) {
  const scriptingPath = TMP_DIR + "pdf.scripting.mjs";
  // Insert the source as a string to be `eval`-ed in the sandbox.
  const sandboxDefines = {
    ...defines,
    PDF_SCRIPTING_JS_SOURCE: fs.readFileSync(scriptingPath).toString(),
  };
  fs.unlinkSync(scriptingPath);

  const sandboxFileConfig = createWebpackConfig(
    sandboxDefines,
    {
      filename: sandboxDefines.MINIFIED
        ? "pdf.sandbox.min.mjs"
        : "pdf.sandbox.mjs",
      library: {
        type: "module",
      },
    },
    extraOptions
  );

  return gulp
    .src("./src/pdf.sandbox.js", { encoding: false })
    .pipe(webpack2Stream(sandboxFileConfig))
    .pipe(tweakWebpackOutput("pdfjsSandbox"));
}

function createWorkerBundle(defines) {
  const workerFileConfig = createWebpackConfig(defines, {
    filename: defines.MINIFIED ? "pdf.worker.min.mjs" : "pdf.worker.mjs",
    library: {
      type: "module",
    },
  });
  return gulp
    .src("./src/pdf.worker.js", { encoding: false })
    .pipe(webpack2Stream(workerFileConfig))
    .pipe(tweakWebpackOutput("pdfjsWorker"));
}

function createWebBundle(defines, options) {
  const viewerFileConfig = createWebpackConfig(
    defines,
    {
      filename: "viewer.mjs",
      library: {
        type: "module",
      },
    },
    {
      defaultPreferencesDir: options.defaultPreferencesDir,
    }
  );
  return gulp
    .src("./web/viewer.js", { encoding: false })
    .pipe(webpack2Stream(viewerFileConfig));
}

function createGVWebBundle(defines, options) {
  const viewerFileConfig = createWebpackConfig(
    defines,
    {
      filename: "viewer-geckoview.mjs",
      library: {
        type: "module",
      },
    },
    {
      defaultPreferencesDir: options.defaultPreferencesDir,
    }
  );
  return gulp
    .src("./web/viewer-geckoview.js", { encoding: false })
    .pipe(webpack2Stream(viewerFileConfig));
}

function createComponentsBundle(defines) {
  const componentsFileConfig = createWebpackConfig(defines, {
    filename: "pdf_viewer.mjs",
    library: {
      type: "module",
    },
  });
  return gulp
    .src("./web/pdf_viewer.component.js", { encoding: false })
    .pipe(webpack2Stream(componentsFileConfig))
    .pipe(tweakWebpackOutput("pdfjsViewer"));
}

function createImageDecodersBundle(defines) {
  const componentsFileConfig = createWebpackConfig(defines, {
    filename: defines.MINIFIED
      ? "pdf.image_decoders.min.mjs"
      : "pdf.image_decoders.mjs",
    library: {
      type: "module",
    },
  });
  return gulp
    .src("./src/pdf.image_decoders.js", { encoding: false })
    .pipe(webpack2Stream(componentsFileConfig))
    .pipe(tweakWebpackOutput("pdfjsImageDecoders"));
}

function createCMapBundle() {
  return gulp.src(["external/bcmaps/*.bcmap", "external/bcmaps/LICENSE"], {
    base: "external/bcmaps",
    encoding: false,
  });
}

function createStandardFontBundle() {
  return gulp.src(
    [
      "external/standard_fonts/*.pfb",
      "external/standard_fonts/*.ttf",
      "external/standard_fonts/LICENSE_*",
    ],
    {
      base: "external/standard_fonts",
      encoding: false,
    }
  );
}

function createWasmBundle() {
  return ordered([
    gulp.src(
      [
        "external/openjpeg/*.wasm",
        "external/openjpeg/openjpeg_nowasm_fallback.js",
        "external/openjpeg/LICENSE_*",
      ],
      {
        base: "external/openjpeg",
        encoding: false,
      }
    ),
  ]);
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
  fs.mkdirSync(BUILD_DIR + "tmp/", { recursive: true });
  const bytes = crypto.randomBytes(6).toString("hex");
  const filePath = BUILD_DIR + "tmp/" + prefix + bytes + suffix;
  fs.writeFileSync(filePath, "");
  return filePath;
}

function runTests(testsName, { bot = false, xfaOnly = false } = {}) {
  return new Promise((resolve, reject) => {
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
          // The browser-tests are too slow in Google Chrome on the bots,
          // causing a timeout, hence disabling them for now.
          forceNoChrome = true;
        }
        if (xfaOnly) {
          args.push("--xfaOnly");
        }
        args.push("--manifestFile=" + PDF_TEST);
        collectArgs(
          {
            names: ["-t", "--testfilter"],
            hasValue: true,
          },
          args
        );
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
        reject(new Error(`Unknown tests name '${testsName}'`));
        return;
    }
    if (bot) {
      args.push("--strictVerify");
    }
    if (process.argv.includes("--noChrome") || forceNoChrome) {
      args.push("--noChrome");
    }
    if (process.argv.includes("--noFirefox")) {
      args.push("--noFirefox");
    }
    if (process.argv.includes("--headless")) {
      args.push("--headless");
    }

    const testProcess = startNode(args, { cwd: TEST_DIR, stdio: "inherit" });
    testProcess.on("close", function (code) {
      if (code !== 0) {
        reject(new Error(`Running ${testsName} tests failed.`));
      }
      resolve();
    });
  });
}

function collectArgs(options, args) {
  if (!Array.isArray(options)) {
    options = [options];
  }
  for (let i = 0, ii = process.argv.length; i < ii; i++) {
    const arg = process.argv[i];
    const option = options.find(opt => opt.names.includes(arg));
    if (!option) {
      continue;
    }
    if (!option.hasValue) {
      args.push(arg);
      continue;
    }
    const next = process.argv[i + 1];
    if (next && !next.startsWith("-")) {
      args.push(arg, next);
      i += 1;
    }
  }
}

function makeRef(done, bot) {
  console.log();
  console.log("### Creating reference images");

  let forceNoChrome = false;
  const args = ["test.mjs", "--masterMode"];
  if (bot) {
    // The browser-tests are too slow in Google Chrome on the bots,
    // causing a timeout, hence disabling them for now.
    forceNoChrome = true;

    args.push("--noPrompts", "--strictVerify");
  }
  if (process.argv.includes("--noChrome") || forceNoChrome) {
    args.push("--noChrome");
  }
  if (process.argv.includes("--noFirefox")) {
    args.push("--noFirefox");
  }
  if (process.argv.includes("--headless")) {
    args.push("--headless");
  }
  collectArgs(
    {
      names: ["-t", "--testfilter"],
      hasValue: true,
    },
    args
  );

  const testProcess = startNode(args, { cwd: TEST_DIR, stdio: "inherit" });
  testProcess.on("close", function (code) {
    if (code !== 0) {
      done(new Error("Creating reference images failed."));
      return;
    }
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

  const bundleDefines = {
    ...defines,
    LIB: true,
    TESTING: defines.TESTING ?? process.env.TESTING === "true",
  };

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
    .src("web/app_options.js", { encoding: false })
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

  const prefs = AppOptions.getAll(
    OptionKind.PREFERENCE,
    /* defaultOnly = */ true
  );
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

function getDefaultFtl() {
  const content = fs.readFileSync("l10n/en-US/viewer.ftl").toString(),
    stringBuf = [];

  // Strip out comments and line-breaks.
  const regExp = /^\s*#/;
  for (const line of content.split("\n")) {
    if (!line || regExp.test(line)) {
      continue;
    }
    stringBuf.push(line);
  }
  return stringBuf.join("\n");
}

gulp.task("locale", function () {
  const VIEWER_LOCALE_OUTPUT = "web/locale/";

  console.log();
  console.log("### Building localization files");

  fs.rmSync(VIEWER_LOCALE_OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(VIEWER_LOCALE_OUTPUT, { recursive: true });

  const subfolders = fs.readdirSync(L10N_DIR);
  subfolders.sort();
  const viewerOutput = Object.create(null);
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

    fs.mkdirSync(VIEWER_LOCALE_OUTPUT + "/" + locale, { recursive: true });

    locales.push(locale);

    if (checkFile(dirPath + "/viewer.ftl")) {
      // The L10n-implementations, in the viewer, use lowercase language-codes
      // internally.
      viewerOutput[locale.toLowerCase()] = `${locale}/viewer.ftl`;
    }
  }
  const glob = locales.length === 1 ? locales[0] : `{${locales.join(",")}}`;

  return ordered([
    createStringSource("locale.json", JSON.stringify(viewerOutput)).pipe(
      gulp.dest(VIEWER_LOCALE_OUTPUT)
    ),
    gulp
      .src(`${L10N_DIR}/${glob}/viewer.ftl`, {
        base: L10N_DIR,
        encoding: false,
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
  preprocess(source, outName, defines);
  const out = fs.readFileSync(outName).toString();
  fs.unlinkSync(outName);

  const i = source.lastIndexOf("/");
  return createStringSource(source.substr(i + 1), out);
}

function discardCommentsCSS() {
  let copyrightNum = 0;

  function remove(comment) {
    // Remove all comments, except the *first* license header.
    if (comment.startsWith("Copyright") && copyrightNum++ === 0) {
      return false;
    }
    return true;
  }
  return postcssDiscardComments({ remove });
}

function preprocessHTML(source, defines) {
  const outName = getTempFile("~preprocess", ".html");
  preprocess(source, outName, defines);
  const out = fs.readFileSync(outName).toString();
  fs.unlinkSync(outName);

  const i = source.lastIndexOf("/");
  return createStringSource(source.substr(i + 1), `${out.trimEnd()}\n`);
}

function buildGeneric(defines, dir) {
  fs.rmSync(dir, { recursive: true, force: true });

  return ordered([
    createMainBundle(defines).pipe(gulp.dest(dir + "build")),
    createWorkerBundle(defines).pipe(gulp.dest(dir + "build")),
    createSandboxBundle(defines).pipe(gulp.dest(dir + "build")),
    createWebBundle(defines, {
      defaultPreferencesDir: defines.SKIP_BABEL
        ? "generic/"
        : "generic-legacy/",
    }).pipe(gulp.dest(dir + "web")),
    gulp
      .src(COMMON_WEB_FILES, { base: "web/", encoding: false })
      .pipe(gulp.dest(dir + "web")),
    gulp.src("LICENSE", { encoding: false }).pipe(gulp.dest(dir)),
    gulp
      .src(["web/locale/*/viewer.ftl", "web/locale/locale.json"], {
        base: "web/",
        encoding: false,
      })
      .pipe(gulp.dest(dir + "web")),
    createCMapBundle().pipe(gulp.dest(dir + "web/cmaps")),
    createStandardFontBundle().pipe(gulp.dest(dir + "web/standard_fonts")),
    createWasmBundle().pipe(gulp.dest(dir + "web/wasm")),

    preprocessHTML("web/viewer.html", defines).pipe(gulp.dest(dir + "web")),
    preprocessCSS("web/viewer.css", defines)
      .pipe(
        postcss([
          postcssDirPseudoClass(),
          discardCommentsCSS(),
          postcssNesting(),
          postcssDarkThemeClass(),
          autoprefixer(AUTOPREFIXER_CONFIG),
        ])
      )
      .pipe(gulp.dest(dir + "web")),

    gulp
      .src("web/compressed.tracemonkey-pldi-09.pdf", { encoding: false })
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
      const defines = { ...DEFINES, GENERIC: true };
      return ordered([
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
      const defines = { ...DEFINES, GENERIC: true };

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
      const defines = { ...DEFINES, GENERIC: true, SKIP_BABEL: false };
      return ordered([
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
      const defines = { ...DEFINES, GENERIC: true, SKIP_BABEL: false };

      return buildGeneric(defines, GENERIC_LEGACY_DIR);
    }
  )
);

function buildComponents(defines, dir) {
  fs.rmSync(dir, { recursive: true, force: true });

  const COMPONENTS_IMAGES = [
    "web/images/annotation-*.svg",
    "web/images/loading-icon.gif",
    "web/images/altText_*.svg",
    "web/images/editor-toolbar-*.svg",
    "web/images/messageBar_*.svg",
    "web/images/toolbarButton-{editorHighlight,menuArrow}.svg",
    "web/images/cursor-*.svg",
    "web/images/secondaryToolbarButton-documentProperties.svg",
  ];

  return ordered([
    createComponentsBundle(defines).pipe(gulp.dest(dir)),
    gulp
      .src(COMPONENTS_IMAGES, { encoding: false })
      .pipe(gulp.dest(dir + "images")),
    preprocessCSS("web/pdf_viewer.css", defines)
      .pipe(
        postcss([
          postcssDirPseudoClass(),
          discardCommentsCSS(),
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
    const defines = { ...DEFINES, COMPONENTS: true, GENERIC: true };

    return buildComponents(defines, COMPONENTS_DIR);
  })
);

gulp.task(
  "components-legacy",
  gulp.series(createBuildNumber, function createComponentsLegacy() {
    console.log();
    console.log("### Creating generic (legacy) components");
    const defines = {
      ...DEFINES,
      COMPONENTS: true,
      GENERIC: true,
      SKIP_BABEL: false,
    };

    return buildComponents(defines, COMPONENTS_LEGACY_DIR);
  })
);

gulp.task(
  "image_decoders",
  gulp.series(createBuildNumber, function createImageDecoders() {
    console.log();
    console.log("### Creating image decoders");
    const defines = { ...DEFINES, GENERIC: true, IMAGE_DECODERS: true };

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
    const defines = {
      ...DEFINES,
      GENERIC: true,
      IMAGE_DECODERS: true,
      SKIP_BABEL: false,
    };

    return createImageDecodersBundle(defines).pipe(
      gulp.dest(IMAGE_DECODERS_LEGACY_DIR)
    );
  })
);

function buildMinified(defines, dir) {
  fs.rmSync(dir, { recursive: true, force: true });

  return ordered([
    createMainBundle(defines).pipe(gulp.dest(dir + "build")),
    createWorkerBundle(defines).pipe(gulp.dest(dir + "build")),
    createSandboxBundle(defines).pipe(gulp.dest(dir + "build")),
    createImageDecodersBundle({ ...defines, IMAGE_DECODERS: true }).pipe(
      gulp.dest(dir + "image_decoders")
    ),
  ]);
}

gulp.task(
  "minified",
  gulp.series(
    createBuildNumber,
    "locale",
    function scriptingMinified() {
      const defines = { ...DEFINES, MINIFIED: true, GENERIC: true };
      return ordered([
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
      const defines = { ...DEFINES, MINIFIED: true, GENERIC: true };

      return buildMinified(defines, MINIFIED_DIR);
    }
  )
);

gulp.task(
  "minified-legacy",
  gulp.series(
    createBuildNumber,
    "locale",
    function scriptingMinifiedLegacy() {
      const defines = {
        ...DEFINES,
        MINIFIED: true,
        GENERIC: true,
        SKIP_BABEL: false,
      };
      return ordered([
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
      const defines = {
        ...DEFINES,
        MINIFIED: true,
        GENERIC: true,
        SKIP_BABEL: false,
      };

      return buildMinified(defines, MINIFIED_LEGACY_DIR);
    }
  )
);

function createDefaultPrefsFile() {
  const defaultFileName = "PdfJsDefaultPrefs.js",
    overrideFileName = "PdfJsOverridePrefs.js";
  const licenseHeader = fs.readFileSync("./src/license_header.js").toString();

  const MODIFICATION_WARNING =
    "// THIS FILE IS GENERATED AUTOMATICALLY, DO NOT EDIT MANUALLY!\n//\n" +
    `// Any overrides should be placed in \`${overrideFileName}\`.\n`;

  const prefs = getDefaultPreferences("mozcentral/");
  const buf = [];

  for (const name in prefs) {
    let value = prefs[name];

    if (typeof value === "string") {
      value = `"${value}"`;
    }
    buf.push(`pref("pdfjs.${name}", ${value});`);
  }
  buf.sort();
  buf.unshift(licenseHeader, MODIFICATION_WARNING);
  buf.push(`\n#include ${overrideFileName}\n`);

  return createStringSource(defaultFileName, buf.join("\n"));
}

function replaceMozcentralCSS() {
  return replace(/var\(--(inline-(?:start|end))\)/g, "$1");
}

gulp.task(
  "mozcentral",
  gulp.series(
    createBuildNumber,
    function scriptingMozcentral() {
      const defines = { ...DEFINES, MOZCENTRAL: true };
      return buildDefaultPreferences(defines, "mozcentral/");
    },
    async function prefsMozcentral() {
      await parseDefaultPreferences("mozcentral/");
    },
    function createMozcentral() {
      console.log();
      console.log("### Building mozilla-central extension");
      const defines = { ...DEFINES, MOZCENTRAL: true };
      const gvDefines = { ...defines, GECKOVIEW: true };

      const MOZCENTRAL_DIR = BUILD_DIR + "mozcentral/",
        MOZCENTRAL_EXTENSION_DIR = MOZCENTRAL_DIR + "browser/extensions/pdfjs/",
        MOZCENTRAL_CONTENT_DIR = MOZCENTRAL_EXTENSION_DIR + "content/",
        MOZCENTRAL_L10N_DIR =
          MOZCENTRAL_DIR + "browser/locales/en-US/pdfviewer/";

      const MOZCENTRAL_WEB_FILES = [
        ...COMMON_WEB_FILES,
        "!web/images/toolbarButton-openFile.svg",
      ];
      const MOZCENTRAL_AUTOPREFIXER_CONFIG = {
        overrideBrowserslist: ["last 1 firefox versions"],
      };

      // Clear out everything in the firefox extension build directory
      fs.rmSync(MOZCENTRAL_DIR, { recursive: true, force: true });

      return ordered([
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
        createGVWebBundle(gvDefines, {
          defaultPreferencesDir: "mozcentral/",
        }).pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + "web")),
        gulp
          .src(MOZCENTRAL_WEB_FILES, { base: "web/", encoding: false })
          .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + "web")),
        createCMapBundle().pipe(
          gulp.dest(MOZCENTRAL_CONTENT_DIR + "web/cmaps")
        ),
        createStandardFontBundle().pipe(
          gulp.dest(MOZCENTRAL_CONTENT_DIR + "web/standard_fonts")
        ),
        createWasmBundle().pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + "web/wasm")),

        preprocessHTML("web/viewer.html", defines).pipe(
          gulp.dest(MOZCENTRAL_CONTENT_DIR + "web")
        ),
        preprocessHTML("web/viewer-geckoview.html", gvDefines).pipe(
          gulp.dest(MOZCENTRAL_CONTENT_DIR + "web")
        ),

        preprocessCSS("web/viewer.css", defines)
          .pipe(
            postcss([
              discardCommentsCSS(),
              autoprefixer(MOZCENTRAL_AUTOPREFIXER_CONFIG),
            ])
          )
          .pipe(replaceMozcentralCSS())
          .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + "web")),

        preprocessCSS("web/viewer-geckoview.css", gvDefines)
          .pipe(
            postcss([
              discardCommentsCSS(),
              autoprefixer(MOZCENTRAL_AUTOPREFIXER_CONFIG),
            ])
          )
          .pipe(replaceMozcentralCSS())
          .pipe(gulp.dest(MOZCENTRAL_CONTENT_DIR + "web")),

        gulp
          .src("l10n/en-US/*.ftl", { encoding: false })
          .pipe(gulp.dest(MOZCENTRAL_L10N_DIR)),
        gulp
          .src("LICENSE", { encoding: false })
          .pipe(gulp.dest(MOZCENTRAL_EXTENSION_DIR)),
        createDefaultPrefsFile().pipe(gulp.dest(MOZCENTRAL_EXTENSION_DIR)),
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
      const defines = { ...DEFINES, CHROME: true, SKIP_BABEL: false };
      return ordered([
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
      const defines = { ...DEFINES, CHROME: true, SKIP_BABEL: false };

      const CHROME_BUILD_DIR = BUILD_DIR + "/chromium/",
        CHROME_BUILD_CONTENT_DIR = CHROME_BUILD_DIR + "/content/";

      const CHROME_WEB_FILES = [
        ...COMMON_WEB_FILES,
        "!web/images/toolbarButton-openFile.svg",
      ];

      // Clear out everything in the chrome extension build directory
      fs.rmSync(CHROME_BUILD_DIR, { recursive: true, force: true });

      const version = getVersionJSON().version;

      return ordered([
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
          .src(CHROME_WEB_FILES, { base: "web/", encoding: false })
          .pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + "web")),

        gulp
          .src(["web/locale/*/viewer.ftl", "web/locale/locale.json"], {
            base: "web/",
            encoding: false,
          })
          .pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + "web")),
        createCMapBundle().pipe(
          gulp.dest(CHROME_BUILD_CONTENT_DIR + "web/cmaps")
        ),
        createStandardFontBundle().pipe(
          gulp.dest(CHROME_BUILD_CONTENT_DIR + "web/standard_fonts")
        ),
        createWasmBundle().pipe(
          gulp.dest(CHROME_BUILD_CONTENT_DIR + "web/wasm")
        ),

        preprocessHTML("web/viewer.html", defines).pipe(
          gulp.dest(CHROME_BUILD_CONTENT_DIR + "web")
        ),
        preprocessCSS("web/viewer.css", defines)
          .pipe(
            postcss([
              postcssDirPseudoClass(),
              discardCommentsCSS(),
              postcssNesting(),
              postcssDarkThemeClass(),
              autoprefixer(AUTOPREFIXER_CONFIG),
            ])
          )
          .pipe(gulp.dest(CHROME_BUILD_CONTENT_DIR + "web")),

        gulp
          .src("LICENSE", { encoding: false })
          .pipe(gulp.dest(CHROME_BUILD_DIR)),
        gulp
          .src("extensions/chromium/manifest.json", { encoding: false })
          .pipe(replace(/\bPDFJSSCRIPT_VERSION\b/g, version))
          .pipe(gulp.dest(CHROME_BUILD_DIR)),
        gulp
          .src(
            [
              "extensions/chromium/**/*.{html,js,css,png}",
              "extensions/chromium/preferences_schema.json",
            ],
            { base: "extensions/chromium/", encoding: false }
          )
          .pipe(gulp.dest(CHROME_BUILD_DIR)),
      ]);
    }
  )
);

gulp.task("jsdoc", function (done) {
  console.log();
  console.log("### Generating documentation (JSDoc)");

  fs.rmSync(JSDOC_BUILD_DIR, { recursive: true, force: true });
  fs.mkdirSync(JSDOC_BUILD_DIR, { recursive: true });

  exec('"node_modules/.bin/jsdoc" -c jsdoc.json', done);
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
  function preprocessLib(content) {
    const skipBabel = bundleDefines.SKIP_BABEL;
    content = babel.transform(content, {
      sourceType: "module",
      presets: skipBabel
        ? undefined
        : [
            [
              "@babel/preset-env",
              { ...BABEL_PRESET_ENV_OPTS, loose: false, modules: false },
            ],
          ],
      plugins: [[babelPluginPDFJSPreprocessor, ctx]],
      targets: BABEL_TARGETS,
    }).code;
    content = content.replaceAll(
      /(\sfrom\s".*?)(?:\/src)(\/[^"]*"?;)$/gm,
      (all, prefix, suffix) => prefix + suffix
    );
    return licenseHeaderLibre + content;
  }
  const ctx = {
    rootPath: __dirname,
    defines: bundleDefines,
    map: {
      "pdfjs-lib": "../pdf.js",
      "display-cmap_reader_factory": "./cmap_reader_factory.js",
      "display-standard_fontdata_factory": "./standard_fontdata_factory.js",
      "display-wasm_factory": "./wasm_factory.js",
      "display-fetch_stream": "./fetch_stream.js",
      "display-network": "./network.js",
      "display-node_stream": "./node_stream.js",
      "display-node_utils": "./node_utils.js",
      "fluent-bundle": "../../../node_modules/@fluent/bundle/esm/index.js",
      "fluent-dom": "../../../node_modules/@fluent/dom/esm/index.js",
      "web-null_l10n": "../web/genericl10n.js",
    },
  };
  const licenseHeaderLibre = fs
    .readFileSync("./src/license_header_libre.js")
    .toString();
  return inputStream
    .pipe(transform("utf8", preprocessLib))
    .pipe(gulp.dest(outputDir));
}

function buildLib(defines, dir) {
  const versionInfo = getVersionJSON();

  const bundleDefines = {
    ...defines,
    BUNDLE_VERSION: versionInfo.version,
    BUNDLE_BUILD: versionInfo.commit,
    TESTING: defines.TESTING ?? process.env.TESTING === "true",
    DEFAULT_PREFERENCES: getDefaultPreferences(
      defines.SKIP_BABEL ? "lib/" : "lib-legacy/"
    ),
    DEFAULT_FTL: getDefaultFtl(),
  };

  const inputStream = ordered([
    gulp.src(
      [
        "src/{core,display,shared}/**/*.js",
        "src/{pdf,pdf.image_decoders,pdf.worker}.js",
      ],
      { base: "src/", encoding: false }
    ),
    gulp.src(["web/*.js", "!web/{pdfjs,viewer}.js"], {
      base: ".",
      encoding: false,
    }),
    gulp.src("test/unit/*.js", { base: ".", encoding: false }),
    gulp.src("external/openjpeg/*.js", { base: "openjpeg/", encoding: false }),
  ]);

  return buildLibHelper(bundleDefines, inputStream, dir);
}

gulp.task(
  "lib",
  gulp.series(
    createBuildNumber,
    function scriptingLib() {
      const defines = { ...DEFINES, GENERIC: true, LIB: true };
      return ordered([
        buildDefaultPreferences(defines, "lib/"),
        createTemporaryScriptingBundle(defines),
      ]);
    },
    async function prefsLib() {
      await parseDefaultPreferences("lib/");
    },
    function createLib() {
      const defines = { ...DEFINES, GENERIC: true, LIB: true };

      return ordered([
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
      const defines = {
        ...DEFINES,
        GENERIC: true,
        LIB: true,
        SKIP_BABEL: false,
      };
      return ordered([
        buildDefaultPreferences(defines, "lib-legacy/"),
        createTemporaryScriptingBundle(defines),
      ]);
    },
    async function prefsLibLegacy() {
      await parseDefaultPreferences("lib-legacy/");
    },
    function createLibLegacy() {
      const defines = {
        ...DEFINES,
        GENERIC: true,
        LIB: true,
        SKIP_BABEL: false,
      };

      return ordered([
        buildLib(defines, "build/lib-legacy/"),
        createSandboxBundle(defines).pipe(gulp.dest("build/lib-legacy/")),
      ]);
    }
  )
);

function compressPublish({ sourceDirectory, targetFile, modifiedTime }) {
  return gulp
    .src(`${sourceDirectory}**`, { encoding: false })
    .pipe(zip(targetFile, { modifiedTime }))
    .pipe(gulp.dest(BUILD_DIR))
    .on("end", function () {
      console.log(`Built distribution file: ${targetFile}`);
    });
}

gulp.task(
  "publish",
  gulp.series("generic", "generic-legacy", function createPublish(done) {
    const version = JSON.parse(
      fs.readFileSync(BUILD_DIR + "version.json").toString()
    ).version;

    config.stableVersion = version;

    // ZIP files record the modification date of the source files, so if files
    // are generated during the build process the output is not reproducible.
    // To avoid this, the modification dates should be replaced with a fixed
    // date, in our case the last Git commit date, so that builds from identical
    // source code result in bit-by-bit identical output. The `gulp-zip` library
    // supports providing a different modification date to enable reproducible
    // builds. Note that the Git command below outputs the last Git commit date
    // as a Unix timestamp (in seconds since epoch), but the `Date` constructor
    // in JavaScript requires millisecond input, so we have to multiply by 1000.
    const lastCommitTimestamp = execSync('git log --format="%at" -n 1')
      .toString()
      .replace("\n", "");
    const lastCommitDate = new Date(parseInt(lastCommitTimestamp, 10) * 1000);

    return ordered([
      createStringSource(CONFIG_FILE, JSON.stringify(config, null, 2)).pipe(
        gulp.dest(".")
      ),
      compressPublish({
        sourceDirectory: GENERIC_DIR,
        targetFile: `pdfjs-${version}-dist.zip`,
        modifiedTime: lastCommitDate,
      }),
      compressPublish({
        sourceDirectory: GENERIC_LEGACY_DIR,
        targetFile: `pdfjs-${version}-legacy-dist.zip`,
        modifiedTime: lastCommitDate,
      }),
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
  gulp.series(setTestEnv, "generic", "components", async function runTest() {
    await runTests("unit");
    await runTests("browser");
    await runTests("integration");
  })
);

gulp.task(
  "bottest",
  gulp.series(setTestEnv, "generic", "components", async function runBotTest() {
    await runTests("unit", { bot: true });
    await runTests("browser", { bot: true });
    await runTests("integration");
  })
);

gulp.task(
  "xfatest",
  gulp.series(setTestEnv, "generic", "components", async function runXfaTest() {
    await runTests("unit");
    await runTests("browser", { xfaOnly: true });
    await runTests("integration");
  })
);

gulp.task(
  "botxfatest",
  gulp.series(
    setTestEnv,
    "generic",
    "components",
    async function runBotXfaTest() {
      await runTests("unit", { bot: true });
      await runTests("browser", { bot: true, xfaOnly: true });
      await runTests("integration");
    }
  )
);

gulp.task(
  "browsertest",
  gulp.series(
    setTestEnv,
    "generic",
    "components",
    async function runBrowserTest() {
      await runTests("browser");
    }
  )
);

gulp.task(
  "botbrowsertest",
  gulp.series(
    setTestEnv,
    "generic",
    "components",
    async function runBotBrowserTest() {
      await runTests("browser", { bot: true });
    }
  )
);

gulp.task(
  "unittest",
  gulp.series(setTestEnv, "generic", async function runUnitTest() {
    await runTests("unit");
  })
);

gulp.task(
  "integrationtest",
  gulp.series(setTestEnv, "generic", async function runIntegrationTest() {
    await runTests("integration");
  })
);

gulp.task(
  "fonttest",
  gulp.series(setTestEnv, async function runFontTest() {
    await runTests("font");
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
      return ordered([
        packageJson().pipe(gulp.dest(TYPESTEST_DIR)),
        gulp
          .src("external/dist/**/*", {
            base: "external/dist",
            encoding: false,
            removeBOM: false,
          })
          .pipe(gulp.dest(TYPESTEST_DIR)),
        gulp
          .src(TYPES_DIR + "**/*", { base: TYPES_DIR, encoding: false })
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
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
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
  gulp.series(
    setTestEnv,
    "generic-legacy",
    "lib-legacy",
    function runUnitTestCli(done) {
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
    }
  )
);

gulp.task("lint", function (done) {
  console.log();
  console.log("### Linting JS/CSS/JSON/SVG files");

  // Ensure that we lint the Firefox specific *.jsm files too.
  const esLintOptions = [
    "node_modules/eslint/bin/eslint",
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

  const prettierOptions = [
    "node_modules/prettier/bin/prettier.cjs",
    "**/*.json",
  ];
  if (process.argv.includes("--fix")) {
    prettierOptions.push("--log-level", "silent", "--write");
  } else {
    prettierOptions.push("--log-level", "warn", "--check");
  }

  const svgLintOptions = [
    "node_modules/svglint/bin/cli.js",
    "**/*.svg",
    "--ci",
    "--no-summary",
  ];

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

      const prettierProcess = startNode(prettierOptions, { stdio: "inherit" });
      prettierProcess.on("close", function (prettierCode) {
        if (prettierCode !== 0) {
          done(new Error("Prettier failed."));
          return;
        }

        const svgLintProcess = startNode(svgLintOptions, {
          stdio: "inherit",
        });
        svgLintProcess.on("close", function (svgLintCode) {
          if (svgLintCode !== 0) {
            done(new Error("svglint failed."));
            return;
          }

          console.log("files checked, no errors found");
          done();
        });
      });
    });
  });
});

gulp.task(
  "lint-chromium",
  gulp.series(
    function scriptingLintChromium() {
      const defines = {
        ...DEFINES,
        CHROME: true,
        SKIP_BABEL: false,
        TESTING: false,
      };
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

gulp.task("dev-wasm", function () {
  const VIEWER_WASM_OUTPUT = "web/wasm/";

  fs.rmSync(VIEWER_WASM_OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(VIEWER_WASM_OUTPUT, { recursive: true });

  return createWasmBundle().pipe(gulp.dest(VIEWER_WASM_OUTPUT));
});

gulp.task(
  "dev-sandbox",
  gulp.series(
    function scriptingDevSandbox() {
      const defines = { ...DEFINES, GENERIC: true, TESTING: true };
      return createTemporaryScriptingBundle(defines, {
        disableVersionInfo: true,
      });
    },
    function createDevSandbox() {
      console.log();
      console.log("### Building development sandbox");

      const defines = { ...DEFINES, GENERIC: true, TESTING: true };
      const sandboxDir = BUILD_DIR + "dev-sandbox/";

      fs.rmSync(sandboxDir, { recursive: true, force: true });

      return createSandboxBundle(defines, {
        disableVersionInfo: true,
      }).pipe(gulp.dest(sandboxDir));
    }
  )
);

gulp.task(
  "server",
  gulp.parallel(
    function watchLocale() {
      gulp.watch(
        "l10n/**/*.ftl",
        { ignoreInitial: false },
        gulp.series("locale")
      );
    },
    function watchWasm() {
      gulp.watch(
        "external/openjpeg/*",
        { ignoreInitial: false },
        gulp.series("dev-wasm")
      );
    },
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

      let port = 8888;
      const i = process.argv.indexOf("--port");
      if (i >= 0 && i + 1 < process.argv.length) {
        const p = parseInt(process.argv[i + 1], 10);
        if (!isNaN(p)) {
          port = p;
        } else {
          console.error("Invalid port number: using default (8888)");
        }
      }

      const { WebServer } = await import("./test/webserver.mjs");
      const server = new WebServer({ port });
      server.start();
    }
  )
);

gulp.task("clean", function (done) {
  console.log();
  console.log("### Cleaning up project builds");

  fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  done();
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

  fs.rmSync(GH_PAGES_DIR, { recursive: true, force: true });

  return ordered([
    gulp
      .src(GENERIC_DIR + "**/*", {
        base: GENERIC_DIR,
        encoding: false,
        removeBOM: false,
      })
      .pipe(gulp.dest(GH_PAGES_DIR)),
    gulp
      .src(GENERIC_LEGACY_DIR + "**/*", {
        base: GENERIC_LEGACY_DIR,
        encoding: false,
        removeBOM: false,
      })
      .pipe(gulp.dest(GH_PAGES_DIR + "legacy/")),
    gulp
      .src(JSDOC_BUILD_DIR + "**/*", { base: JSDOC_BUILD_DIR, encoding: false })
      .pipe(gulp.dest(GH_PAGES_DIR + "api/draft/")),
  ]);
}

gulp.task("metalsmith", async function () {
  return new Promise((resolve, reject) => {
    Metalsmith(__dirname)
      .source("docs/contents")
      .destination(GH_PAGES_DIR)
      .clean(false)
      .metadata({
        sitename: "PDF.js",
        siteurl: "https://mozilla.github.io/pdf.js",
        description:
          "A general-purpose, web standards-based platform for parsing and rendering PDFs.",
      })
      .use(
        markdown({
          engineOptions: {
            highlight: (code, language) =>
              hljs.highlight(code, { language }).value,
          },
        })
      )
      .use(
        layouts({
          directory: "docs/templates",
        })
      )
      .use(relative())
      .build(error => {
        if (error) {
          reject(error);
          return;
        }
        replaceInFile(
          `${GH_PAGES_DIR}/getting_started/index.html`,
          /STABLE_VERSION/g,
          config.stableVersion
        );
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
    "metalsmith"
  )
);

function packageJson() {
  const VERSION = getVersionJSON().version;

  const DIST_NAME = "pdfjs-dist";
  const DIST_DESCRIPTION = "Generic build of Mozilla's PDF.js library.";
  const DIST_KEYWORDS = ["Mozilla", "pdf", "pdf.js"];
  const DIST_HOMEPAGE = "https://mozilla.github.io/pdf.js/";
  const DIST_BUGS_URL = "https://github.com/mozilla/pdf.js/issues";
  const DIST_GIT_URL = "https://github.com/mozilla/pdf.js.git";
  const DIST_LICENSE = "Apache-2.0";

  const npmManifest = {
    name: DIST_NAME,
    version: VERSION,
    main: "build/pdf.mjs",
    types: "types/src/pdf.d.ts",
    description: DIST_DESCRIPTION,
    keywords: DIST_KEYWORDS,
    homepage: DIST_HOMEPAGE,
    bugs: DIST_BUGS_URL,
    license: DIST_LICENSE,
    optionalDependencies: {
      "@napi-rs/canvas": "^0.1.67",
    },
    browser: {
      canvas: false,
      fs: false,
      http: false,
      https: false,
      url: false,
    },
    repository: {
      type: "git",
      url: `git+${DIST_GIT_URL}`,
    },
    engines: {
      node: ">=20",
    },
    scripts: {},
  };

  return createStringSource(
    "package.json",
    JSON.stringify(npmManifest, null, 2)
  );
}

gulp.task(
  "dist",
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
      fs.rmSync(DIST_DIR, { recursive: true, force: true });
      fs.mkdirSync(DIST_DIR, { recursive: true });

      return ordered([
        packageJson().pipe(gulp.dest(DIST_DIR)),
        gulp
          .src("external/dist/**/*", {
            base: "external/dist",
            encoding: false,
            removeBOM: false,
          })
          .pipe(gulp.dest(DIST_DIR)),
        gulp
          .src(GENERIC_DIR + "LICENSE", { encoding: false })
          .pipe(gulp.dest(DIST_DIR)),
        gulp
          .src(GENERIC_DIR + "web/cmaps/**/*", {
            base: GENERIC_DIR + "web",
            encoding: false,
          })
          .pipe(gulp.dest(DIST_DIR)),
        gulp
          .src(GENERIC_DIR + "web/standard_fonts/**/*", {
            base: GENERIC_DIR + "web",
            encoding: false,
          })
          .pipe(gulp.dest(DIST_DIR)),
        gulp
          .src(GENERIC_DIR + "web/wasm/**/*", {
            base: GENERIC_DIR + "web",
            encoding: false,
          })
          .pipe(gulp.dest(DIST_DIR)),
        gulp
          .src(
            [
              GENERIC_DIR + "build/{pdf,pdf.worker,pdf.sandbox}.mjs",
              GENERIC_DIR + "build/{pdf,pdf.worker,pdf.sandbox}.mjs.map",
            ],
            { encoding: false }
          )
          .pipe(gulp.dest(DIST_DIR + "build/")),
        gulp
          .src(
            [
              GENERIC_LEGACY_DIR + "build/{pdf,pdf.worker,pdf.sandbox}.mjs",
              GENERIC_LEGACY_DIR + "build/{pdf,pdf.worker,pdf.sandbox}.mjs.map",
            ],
            { encoding: false }
          )
          .pipe(gulp.dest(DIST_DIR + "legacy/build/")),
        gulp
          .src(MINIFIED_DIR + "build/{pdf,pdf.worker,pdf.sandbox}.min.mjs", {
            encoding: false,
          })
          .pipe(gulp.dest(DIST_DIR + "build/")),
        gulp
          .src(MINIFIED_DIR + "image_decoders/pdf.image_decoders.min.mjs", {
            encoding: false,
          })
          .pipe(gulp.dest(DIST_DIR + "image_decoders/")),
        gulp
          .src(
            MINIFIED_LEGACY_DIR + "build/{pdf,pdf.worker,pdf.sandbox}.min.mjs",
            { encoding: false }
          )
          .pipe(gulp.dest(DIST_DIR + "legacy/build/")),
        gulp
          .src(
            MINIFIED_LEGACY_DIR + "image_decoders/pdf.image_decoders.min.mjs",
            { encoding: false }
          )
          .pipe(gulp.dest(DIST_DIR + "legacy/image_decoders/")),
        gulp
          .src(COMPONENTS_DIR + "**/*", {
            base: COMPONENTS_DIR,
            encoding: false,
          })
          .pipe(gulp.dest(DIST_DIR + "web/")),
        gulp
          .src(COMPONENTS_LEGACY_DIR + "**/*", {
            base: COMPONENTS_LEGACY_DIR,
            encoding: false,
          })
          .pipe(gulp.dest(DIST_DIR + "legacy/web/")),
        gulp
          .src(IMAGE_DECODERS_DIR + "**/*", {
            base: IMAGE_DECODERS_DIR,
            encoding: false,
          })
          .pipe(gulp.dest(DIST_DIR + "image_decoders/")),
        gulp
          .src(IMAGE_DECODERS_LEGACY_DIR + "**/*", {
            base: IMAGE_DECODERS_LEGACY_DIR,
            encoding: false,
          })
          .pipe(gulp.dest(DIST_DIR + "legacy/image_decoders/")),
        gulp
          .src(TYPES_DIR + "**/*", { base: TYPES_DIR, encoding: false })
          .pipe(gulp.dest(DIST_DIR + "types/")),
      ]);
    }
  )
);

gulp.task(
  "dist-install",
  gulp.series("dist", function createDistInstall(done) {
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
  "mozcentralbaseline",
  gulp.series(createBaseline, function createMozcentralBaseline(done) {
    console.log();
    console.log("### Creating mozcentral baseline environment");

    // Create a mozcentral build.
    fs.rmSync(BASELINE_DIR + BUILD_DIR, { recursive: true, force: true });

    const workingDirectory = path.resolve(process.cwd(), BASELINE_DIR);
    safeSpawnSync("gulp", ["mozcentral"], {
      env: process.env,
      cwd: workingDirectory,
      stdio: "inherit",
    });

    // Copy the mozcentral build to the mozcentral baseline directory.
    fs.rmSync(MOZCENTRAL_BASELINE_DIR, { recursive: true, force: true });
    fs.mkdirSync(MOZCENTRAL_BASELINE_DIR, { recursive: true });

    gulp
      .src([BASELINE_DIR + BUILD_DIR + "mozcentral/**/*"], { encoding: false })
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
      // Remove all files/folders, except for `.git` because it needs to be a
      // valid Git repository for the Git commands below to work.
      for (const entry of fs.readdirSync(MOZCENTRAL_BASELINE_DIR)) {
        if (entry !== ".git") {
          fs.rmSync(MOZCENTRAL_BASELINE_DIR + entry, {
            recursive: true,
            force: true,
          });
        }
      }

      gulp
        .src([BUILD_DIR + "mozcentral/**/*"], { encoding: false })
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
  console.log("### Running test-fixtures_babel.js");
  safeSpawnSync("node", ["external/builder/test-fixtures_babel.mjs"], {
    stdio: "inherit",
  });
  done();
});
