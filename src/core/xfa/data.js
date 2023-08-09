/* Copyright 2021 Mozilla Foundation
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
  $getAttributes,
  $getChildren,
  $nodeName,
  $setValue,
  $toString,
  $uid,
} from "./symbol_utils.js";

class DataHandler {
  constructor(root, data) {
    this.data = data;
    this.dataset = root.datasets || null;
  }

  serialize(storage) {
    const stack = [[-1, this.data[$getChildren]()]];

    while (stack.length > 0) {
      const last = stack.at(-1);
      const [i, children] = last;
      if (i + 1 === children.length) {
        stack.pop();
        continue;
      }

      const child = children[++last[0]];
      const storageEntry = storage.get(child[$uid]);
      if (storageEntry) {
        child[$setValue](storageEntry);
      } else {
        const attributes = child[$getAttributes]();
        for (const value of attributes.values()) {
          const entry = storage.get(value[$uid]);
          if (entry) {
            value[$setValue](entry);
            break;
          }
        }
      }

      const nodes = child[$getChildren]();
      if (nodes.length > 0) {
        stack.push([-1, nodes]);
      }
    }

    const buf = [
      `<xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">`,
    ];
    if (this.dataset) {
      // Dump nodes other than data: they can contains for example
      // some data for choice lists.
      for (const child of this.dataset[$getChildren]()) {
        if (child[$nodeName] !== "data") {
          child[$toString](buf);
        }
      }
    }
    this.data[$toString](buf);
    buf.push("</xfa:datasets>");

    return buf.join("");
  }
}

export { DataHandler };
