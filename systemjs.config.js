/* Copyright 2017 Mozilla Foundation
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

"use strict";

(function () {
  var baseLocation;
  if (typeof document !== "undefined") {
    baseLocation = new URL("./", document.currentScript.src);
  } else if (typeof location !== "undefined") {
    // Probably worker -- walking subfolders until we will reach root.
    baseLocation = location;
    while (baseLocation.href.includes("/src/")) {
      baseLocation = new URL("..", baseLocation);
    }
  } else {
    throw new Error("Cannot configure SystemJS");
  }

  var PluginBabelPath = "node_modules/systemjs-plugin-babel/plugin-babel.js";
  var SystemJSPluginBabelPath =
    "node_modules/systemjs-plugin-babel/systemjs-babel-browser.js";
  var PluginBabelCachePath = "external/systemjs/plugin-babel-cached.js";

  var isCachingPossible =
    typeof indexedDB !== "undefined" &&
    typeof TextEncoder !== "undefined" &&
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined";

  // When we create a bundle, webpack is run on the source and it will replace
  // require with __webpack_require__. When we want to use the real require,
  // __non_webpack_require__ has to be used.
  // In this target, we don't create a bundle, so we have to replace the
  // occurrences of __non_webpack_require__ ourselves.
  function babelPluginReplaceNonWebPackRequire(babel) {
    return {
      visitor: {
        Identifier(path, state) {
          if (path.node.name === "__non_webpack_require__") {
            path.replaceWith(babel.types.identifier("require"));
          }
        },
      },
    };
  }

  SystemJS.config({
    packages: {
      "": {
        defaultExtension: "js",
      },
    },
    paths: {
      pdfjs: new URL("src", baseLocation).href,
      "pdfjs-web": new URL("web", baseLocation).href,
      "pdfjs-test": new URL("test", baseLocation).href,
      "pdfjs-lib": new URL("src/pdf", baseLocation).href,
      "core-js": new URL("node_modules/core-js", baseLocation).href,
      "web-streams-polyfill": new URL(
        "node_modules/web-streams-polyfill",
        baseLocation
      ).href,
    },
    meta: {
      "*": {
        scriptLoad: false,
        esModule: true,
        babelOptions: {
          env: false,
          plugins: [babelPluginReplaceNonWebPackRequire],
        },
      },
    },
    map: {
      "plugin-babel": new URL(PluginBabelPath, baseLocation).href,
      "systemjs-babel-build": new URL(SystemJSPluginBabelPath, baseLocation)
        .href,
      "plugin-babel-cached": new URL(PluginBabelCachePath, baseLocation).href,
    },
    transpiler: isCachingPossible ? "plugin-babel-cached" : "plugin-babel",
  });
})();
