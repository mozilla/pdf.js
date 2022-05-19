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
/* globals __non_webpack_require__ */

import {
  BaseCanvasFactory,
  BaseCMapReaderFactory,
  BaseStandardFontDataFactory,
} from "./base_factory.js";

if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
  throw new Error(
    'Module "./node_utils.js" shall not be used with MOZCENTRAL builds.'
  );
}

const fetchData = function (url) {
  return new Promise((resolve, reject) => {
    const fs = __non_webpack_require__("fs");
    fs.readFile(url, (error, data) => {
      if (error || !data) {
        reject(new Error(error));
        return;
      }
      resolve(new Uint8Array(data));
    });
  });
};

class NodeCanvasFactory extends BaseCanvasFactory {
  /**
   * @ignore
   */
  _createCanvas(width, height) {
    const Canvas = __non_webpack_require__("canvas");
    return Canvas.createCanvas(width, height);
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
  NodeStandardFontDataFactory,
};
