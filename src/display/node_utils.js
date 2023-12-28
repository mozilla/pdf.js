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

let fs, canvas, path2d_polyfill;
if (isNodeJS) {
  // Native packages.
  fs = await __non_webpack_import__("fs");
  // Optional, third-party, packages.
  try {
    canvas = await __non_webpack_import__("canvas");
  } catch {}
  try {
    path2d_polyfill = await __non_webpack_import__("path2d-polyfill");
  } catch {}
}

if (typeof PDFJSDev !== "undefined" && !PDFJSDev.test("SKIP_BABEL")) {
  (function checkDOMMatrix() {
    if (globalThis.DOMMatrix || !isNodeJS) {
      return;
    }
    const DOMMatrix = canvas?.DOMMatrix;

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
    const CanvasRenderingContext2D = canvas?.CanvasRenderingContext2D;
    const polyfillPath2D = path2d_polyfill?.polyfillPath2D;

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
    return canvas.createCanvas(width, height);
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
