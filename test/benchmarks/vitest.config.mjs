/* Copyright 2026 Mozilla Foundation
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

import { babelPluginPDFJSPreprocessor } from "../../external/builder/babel-plugin-pdfjs-preprocessor.mjs";
import codspeedPlugin from "@codspeed/vitest-plugin";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { transformSync } from "@babel/core";

const rootDir = fileURLToPath(new URL("../../", import.meta.url));
const srcDir = `${rootDir}src/`;

// Use the same defines as the `gulp lib-legacy` target, such that the
// benchmarked code paths match the ones of the library build in Node.js.
const PREPROCESSOR_CTX = {
  rootPath: rootDir,
  defines: {
    SKIP_BABEL: false,
    WORKER_THREAD: false,
    TESTING: false,
    COVERAGE: false,
    INTERNAL_EVT: "pdfjs-benchmark",
    GENERIC: true,
    MOZCENTRAL: false,
    GECKOVIEW: false,
    CHROME: false,
    MINIFIED: false,
    COMPONENTS: false,
    LIB: true,
    IMAGE_DECODERS: false,
    INTERNAL_VIEWER: false,
    BUNDLE_VERSION: "0.0.0-benchmark",
    BUNDLE_BUILD: "benchmark",
    DEFAULT_FTL: "",
  },
};

function pdfjsPreprocessorPlugin() {
  return {
    name: "pdfjs-preprocessor",
    enforce: "pre",
    transform(code, id) {
      if (!id.startsWith(srcDir) || !id.endsWith(".js")) {
        return null;
      }
      const result = transformSync(code, {
        configFile: false,
        babelrc: false,
        filename: id,
        sourceType: "module",
        // Similar to the `gulp lib-legacy` target, polyfill the (recent)
        // features which aren't natively supported by the Node.js version
        // used to run the benchmarks.
        targets: { node: "current" },
        plugins: [
          [babelPluginPDFJSPreprocessor, PREPROCESSOR_CTX],
          [
            "babel-plugin-polyfill-corejs3",
            {
              method: "usage-global",
              version: "3.50.0",
              exclude: ["web.structured-clone"],
              shippedProposals: true,
            },
          ],
        ],
        sourceMaps: true,
      });
      return { code: result.code, map: result.map };
    },
  };
}

export default defineConfig({
  root: rootDir,
  plugins: [pdfjsPreprocessorPlugin(), codspeedPlugin()],
  resolve: {
    // Mirror the library aliases used by the GENERIC build (see the
    // `createWebpackAlias` function in `gulpfile.mjs`), such that the
    // benchmarks can run directly against the `src/` files.
    alias: {
      "display-binary_data_factory": `${rootDir}src/display/binary_data_factory.js`,
      "display-network_stream": `${rootDir}src/display/network_stream.js`,
      "display-node_utils": `${rootDir}src/display/node_utils.js`,
    },
  },
  test: {
    include: [],
    benchmark: {
      include: ["test/benchmarks/**/*.bench.js"],
    },
  },
});
