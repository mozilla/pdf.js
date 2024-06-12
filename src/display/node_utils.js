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
/* globals process */

import { isNodeJS, warn } from "../shared/util.js";
import { BaseCanvasFactory } from "./canvas_factory.js";
import { BaseCMapReaderFactory } from "./cmap_reader_factory.js";
import { BaseFilterFactory } from "./filter_factory.js";
import { BaseStandardFontDataFactory } from "./standard_fontdata_factory.js";

if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
  throw new Error(
    'Module "./node_utils.js" shall not be used with MOZCENTRAL builds.'
  );
}

if (
  typeof PDFJSDev !== "undefined" &&
  !PDFJSDev.test("SKIP_BABEL") &&
  isNodeJS
) {
  let canvas, path2d;
  try {
    const require = process
      .getBuiltinModule("module")
      .createRequire(import.meta.url);

    try {
      canvas = require("canvas");
    } catch (ex) {
      warn(`Cannot load "canvas" package: "${ex}".`);
    }
    try {
      path2d = require("path2d");
    } catch (ex) {
      warn(`Cannot load "path2d" package: "${ex}".`);
    }
  } catch {}

  if (!globalThis.DOMMatrix) {
    const DOMMatrix = canvas?.DOMMatrix;

    if (DOMMatrix) {
      globalThis.DOMMatrix = DOMMatrix;
    } else {
      warn("Cannot polyfill `DOMMatrix`, rendering may be broken.");
    }
  }
  if (!globalThis.Path2D) {
    const CanvasRenderingContext2D = canvas?.CanvasRenderingContext2D;
    const applyPath2DToCanvasRenderingContext =
      path2d?.applyPath2DToCanvasRenderingContext;
    const Path2D = path2d?.Path2D;

    if (
      CanvasRenderingContext2D &&
      applyPath2DToCanvasRenderingContext &&
      Path2D
    ) {
      try {
        applyPath2DToCanvasRenderingContext(CanvasRenderingContext2D);
      } catch (ex) {
        warn(`applyPath2DToCanvasRenderingContext: "${ex}".`);
      }
      globalThis.Path2D = Path2D;
    } else {
      warn("Cannot polyfill `Path2D`, rendering may be broken.");
    }
  }
}

async function fetchData(url) {
  const fs = process.getBuiltinModule("fs");
  const data = await fs.promises.readFile(url);
  return new Uint8Array(data);
}

class NodeFilterFactory extends BaseFilterFactory {}

class NodeCanvasFactory extends BaseCanvasFactory {
  /**
   * @ignore
   */
  _createCanvas(width, height) {
    const require = process
      .getBuiltinModule("module")
      .createRequire(import.meta.url);
    const canvas = require("canvas");
    return canvas.createCanvas(width, height);
  }
}

class NodeCMapReaderFactory extends BaseCMapReaderFactory {
  /**
   * @ignore
   */
  async _fetch(url) {
    return fetchData(url);
  }
}

class NodeStandardFontDataFactory extends BaseStandardFontDataFactory {
  /**
   * @ignore
   */
  async _fetch(url) {
    return fetchData(url);
  }
}

export {
  fetchData,
  NodeCanvasFactory,
  NodeCMapReaderFactory,
  NodeFilterFactory,
  NodeStandardFontDataFactory,
};
