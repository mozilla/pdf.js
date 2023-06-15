/* Copyright 2022 Mozilla Foundation
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

import { stringToUTF8String, warn } from "../shared/util.js";
import { parseXFAPath } from "./core_utils.js";
import { SimpleXMLParser } from "./xml_parser.js";

function decodeString(str) {
  try {
    return stringToUTF8String(str);
  } catch (ex) {
    warn(`UTF-8 decoding failed: "${ex}".`);
    return str;
  }
}

class DatasetXMLParser extends SimpleXMLParser {
  constructor(options) {
    super(options);
    this.node = null;
  }

  onEndElement(name) {
    const node = super.onEndElement(name);
    if (node && name === "xfa:datasets") {
      this.node = node;

      // We don't need anything else, so just kill the parser.
      throw new Error("Aborting DatasetXMLParser.");
    }
  }
}

class DatasetReader {
  constructor(data) {
    if (data.datasets) {
      this.node = new SimpleXMLParser({ hasAttributes: true }).parseFromString(
        data.datasets
      ).documentElement;
    } else {
      const parser = new DatasetXMLParser({ hasAttributes: true });
      try {
        parser.parseFromString(data["xdp:xdp"]);
      } catch {}
      this.node = parser.node;
    }
  }

  getValue(path) {
    if (!this.node || !path) {
      return "";
    }
    const node = this.node.searchNode(parseXFAPath(path), 0);

    if (!node) {
      return "";
    }

    const first = node.firstChild;
    if (first?.nodeName === "value") {
      return node.children.map(child => decodeString(child.textContent));
    }

    return decodeString(node.textContent);
  }
}

export { DatasetReader };
