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

import { FormatError, info, unreachable, warn } from "../shared/util.js";
import { isDict, RefSet } from "./primitives.js";

/**
 * A NameTree/NumberTree is like a Dict but has some advantageous properties,
 * see the specification (7.9.6 and 7.9.7) for additional details.
 * TODO: implement all the Dict functions and make this more efficient.
 */
class NameOrNumberTree {
  constructor(root, xref, type) {
    if (this.constructor === NameOrNumberTree) {
      unreachable("Cannot initialize NameOrNumberTree.");
    }
    this.root = root;
    this.xref = xref;
    this._type = type;
  }

  getAll() {
    const map = new Map();
    if (!this.root) {
      return map;
    }
    const xref = this.xref;
    // Reading Name/Number tree.
    const processed = new RefSet();
    processed.put(this.root);
    const queue = [this.root];
    while (queue.length > 0) {
      const obj = xref.fetchIfRef(queue.shift());
      if (!isDict(obj)) {
        continue;
      }
      if (obj.has("Kids")) {
        const kids = obj.get("Kids");
        for (let i = 0, ii = kids.length; i < ii; i++) {
          const kid = kids[i];
          if (processed.has(kid)) {
            throw new FormatError(`Duplicate entry in "${this._type}" tree.`);
          }
          queue.push(kid);
          processed.put(kid);
        }
        continue;
      }
      const entries = obj.get(this._type);
      if (!Array.isArray(entries)) {
        continue;
      }
      for (let i = 0, ii = entries.length; i < ii; i += 2) {
        map.set(xref.fetchIfRef(entries[i]), xref.fetchIfRef(entries[i + 1]));
      }
    }
    return map;
  }

  get(key) {
    if (!this.root) {
      return null;
    }
    const xref = this.xref;
    let kidsOrEntries = xref.fetchIfRef(this.root);
    let loopCount = 0;
    const MAX_LEVELS = 10;

    // Perform a binary search to quickly find the entry that
    // contains the key we are looking for.
    while (kidsOrEntries.has("Kids")) {
      if (++loopCount > MAX_LEVELS) {
        warn(`Search depth limit reached for "${this._type}" tree.`);
        return null;
      }

      const kids = kidsOrEntries.get("Kids");
      if (!Array.isArray(kids)) {
        return null;
      }

      let l = 0,
        r = kids.length - 1;
      while (l <= r) {
        const m = (l + r) >> 1;
        const kid = xref.fetchIfRef(kids[m]);
        const limits = kid.get("Limits");

        if (key < xref.fetchIfRef(limits[0])) {
          r = m - 1;
        } else if (key > xref.fetchIfRef(limits[1])) {
          l = m + 1;
        } else {
          kidsOrEntries = xref.fetchIfRef(kids[m]);
          break;
        }
      }
      if (l > r) {
        return null;
      }
    }

    // If we get here, then we have found the right entry. Now go through the
    // entries in the dictionary until we find the key we're looking for.
    const entries = kidsOrEntries.get(this._type);
    if (Array.isArray(entries)) {
      // Perform a binary search to reduce the lookup time.
      let l = 0,
        r = entries.length - 2;
      while (l <= r) {
        // Check only even indices (0, 2, 4, ...) because the
        // odd indices contain the actual data.
        const tmp = (l + r) >> 1,
          m = tmp + (tmp & 1);
        const currentKey = xref.fetchIfRef(entries[m]);
        if (key < currentKey) {
          r = m - 2;
        } else if (key > currentKey) {
          l = m + 2;
        } else {
          return xref.fetchIfRef(entries[m + 1]);
        }
      }

      // Fallback to an exhaustive search, in an attempt to handle corrupt
      // PDF files where keys are not correctly ordered (fixes issue 10272).
      info(
        `Falling back to an exhaustive search, for key "${key}", ` +
          `in "${this._type}" tree.`
      );
      for (let m = 0, mm = entries.length; m < mm; m += 2) {
        const currentKey = xref.fetchIfRef(entries[m]);
        if (currentKey === key) {
          warn(
            `The "${key}" key was found at an incorrect, ` +
              `i.e. out-of-order, position in "${this._type}" tree.`
          );
          return xref.fetchIfRef(entries[m + 1]);
        }
      }
    }
    return null;
  }
}

class NameTree extends NameOrNumberTree {
  constructor(root, xref) {
    super(root, xref, "Names");
  }
}

class NumberTree extends NameOrNumberTree {
  constructor(root, xref) {
    super(root, xref, "Nums");
  }
}

export { NameTree, NumberTree };
