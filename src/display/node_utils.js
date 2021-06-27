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
import { isNodeJS } from "../shared/is_node.js";
import { unreachable } from "../shared/util.js";

let NodeCanvasFactory = class {
  constructor() {
    unreachable("Not implemented: NodeCanvasFactory");
  }
};

let NodeCMapReaderFactory = class {
  constructor() {
    unreachable("Not implemented: NodeCMapReaderFactory");
  }
};

let NodeStandardFontDataFactory = class {
  constructor() {
    unreachable("Not implemented: NodeStandardFontDataFactory");
  }
};

if ((typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) && isNodeJS) {
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

  NodeCanvasFactory = class extends BaseCanvasFactory {
    _createCanvas(width, height) {
      const Canvas = __non_webpack_require__("canvas");
      return Canvas.createCanvas(width, height);
    }
  };

  NodeCMapReaderFactory = class extends BaseCMapReaderFactory {
    _fetchData(url, compressionType) {
      return fetchData(url).then(data => {
        return { cMapData: data, compressionType };
      });
    }
  };

  NodeStandardFontDataFactory = class extends BaseStandardFontDataFactory {
    _fetchData(url) {
      return fetchData(url);
    }
  };
}

export {
  NodeCanvasFactory,
  NodeCMapReaderFactory,
  NodeStandardFontDataFactory,
};
