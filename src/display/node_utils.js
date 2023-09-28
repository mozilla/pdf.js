/* Copyright 2020 Mozilla Foundation
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
/* globals __non_webpack_import__, __non_webpack_require__ */

import {
  BaseCanvasFactory,
  BaseCMapReaderFactory,
  BaseFilterFactory,
  BaseStandardFontDataFactory,
} from "./base_factory.js";
import { isNodeJS, warn } from "../shared/util.js";

if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
  throw new Error(
    'Module "./node_utils.js" shall not be used with MOZCENTRAL builds.'
  );
}

if (isNodeJS && !globalThis.__pdfjsPackages__) {
  let fs, http, https, url, canvas, path2d_polyfill;

  if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("LIB")) {
    // Native packages.
    fs = __non_webpack_require__("fs");
    http = __non_webpack_require__("http");
    https = __non_webpack_require__("https");
    url = __non_webpack_require__("url");
    // Optional, third-party, packages.
    try {
      canvas = __non_webpack_require__("canvas");
    } catch {}
    try {
      path2d_polyfill = __non_webpack_require__("path2d-polyfill");
    } catch {}
  } else {
    // Native packages.
    fs = await __non_webpack_import__("fs");
    http = await __non_webpack_import__("http");
    https = await __non_webpack_import__("https");
    url = await __non_webpack_import__("url");
    // Optional, third-party, packages.
    try {
      canvas = await __non_webpack_import__("canvas");
    } catch {}
    try {
      path2d_polyfill = await __non_webpack_import__("path2d-polyfill");
    } catch {}
  }
  globalThis.__pdfjsPackages__ = {
    CanvasRenderingContext2D: canvas?.CanvasRenderingContext2D,
    createCanvas: canvas?.createCanvas,
    DOMMatrix: canvas?.DOMMatrix,
    fs,
    http,
    https,
    polyfillPath2D: path2d_polyfill?.polyfillPath2D,
    url,
  };
}

if (typeof PDFJSDev !== "undefined" && !PDFJSDev.test("SKIP_BABEL")) {
  (function checkDOMMatrix() {
    if (globalThis.DOMMatrix || !isNodeJS) {
      return;
    }
    const { DOMMatrix } = globalThis.__pdfjsPackages__;

    if (DOMMatrix) {
      globalThis.DOMMatrix = DOMMatrix;
    } else {
      warn("Cannot polyfill `DOMMatrix`, rendering may be broken.");
    }
  })();

  (function checkPath2D() {
    if (globalThis.Path2D || !isNodeJS) {
      return;
    }
    const { CanvasRenderingContext2D, polyfillPath2D } =
      globalThis.__pdfjsPackages__;

    if (CanvasRenderingContext2D && polyfillPath2D) {
      globalThis.CanvasRenderingContext2D = CanvasRenderingContext2D;
      polyfillPath2D(globalThis);
    } else {
      warn("Cannot polyfill `Path2D`, rendering may be broken.");
    }
  })();
}

const fetchData = function (url) {
  return new Promise((resolve, reject) => {
    const { fs } = globalThis.__pdfjsPackages__;
    fs.readFile(url, (error, data) => {
      if (error || !data) {
        reject(new Error(error));
        return;
      }
      resolve(new Uint8Array(data));
    });
  });
};

class NodeFilterFactory extends BaseFilterFactory {}

class NodeCanvasFactory extends BaseCanvasFactory {
  /**
   * @ignore
   */
  _createCanvas(width, height) {
    const { createCanvas } = globalThis.__pdfjsPackages__;
    return createCanvas(width, height);
  }
}

class NodeCMapReaderFactory extends BaseCMapReaderFactory {
  /**
   * @ignore
   */
  _fetchData(url, compressionType) {
    return fetchData(url).then(data => {
      return { cMapData: data, compressionType };
    });
  }
}

class NodeStandardFontDataFactory extends BaseStandardFontDataFactory {
  /**
   * @ignore
   */
  _fetchData(url) {
    return fetchData(url);
  }
}

export {
  NodeCanvasFactory,
  NodeCMapReaderFactory,
  NodeFilterFactory,
  NodeStandardFontDataFactory,
};
