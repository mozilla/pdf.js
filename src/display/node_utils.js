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

let fs, canvas, path2d;
if (isNodeJS) {
  // Native packages.
  fs = await __non_webpack_import__("fs");
  // Optional, third-party, packages.
  try {
    canvas = await __non_webpack_import__("canvas");
  } catch {}
  try {
    path2d = await __non_webpack_import__("path2d");
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
    const applyPath2DToCanvasRenderingContext =
      path2d?.applyPath2DToCanvasRenderingContext;
    const Path2D = path2d?.Path2D;

    if (
      CanvasRenderingContext2D &&
      applyPath2DToCanvasRenderingContext &&
      Path2D
    ) {
      applyPath2DToCanvasRenderingContext(CanvasRenderingContext2D);
      globalThis.Path2D = Path2D;
    } else {
      warn("Cannot polyfill `Path2D`, rendering may be broken.");
    }
  })();
}

const fetchData = function (url) {
  return fs.promises.readFile(url).then(data => new Uint8Array(data));
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
    return fetchData(url).then(data => ({ cMapData: data, compressionType }));
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
