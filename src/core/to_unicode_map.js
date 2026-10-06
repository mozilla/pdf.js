/* Copyright 2012 Mozilla Foundation
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

import { assert, unreachable } from "../shared/util.js";
import { CharCodeMap } from "./char_code_map.js";

class ToUnicodeMap {
  #map;

  /**
   * @param {CharCodeMap} cmap
   */
  constructor(cmap) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(cmap instanceof CharCodeMap, "Must be a CharCodeMap.");
    }
    // The values of `this.#map` can be integers or strings, depending on how
    // `cmap` was created.
    this.#map = cmap;
  }

  get size() {
    return this.#map.size;
  }

  forEach(callback) {
    this.#map.forEach((charCode, entry) => {
      callback(charCode, entry.codePointAt(0));
    });
  }

  has(i) {
    return this.#map.has(i);
  }

  get(i) {
    return this.#map.get(i);
  }

  charCodeOf(value) {
    return this.#map.charCodeOf(value);
  }

  /**
   * @param {CharCodeMap} map
   */
  amend(map) {
    map.forEach((charCode, entry) => {
      this.#map.set(charCode, entry);
    });
  }
}

class IdentityToUnicodeMap {
  constructor(firstChar, lastChar) {
    this.firstChar = firstChar;
    this.lastChar = lastChar;
  }

  get size() {
    return this.lastChar + 1 - this.firstChar;
  }

  forEach(callback) {
    for (let i = this.firstChar, ii = this.lastChar; i <= ii; i++) {
      callback(i, i);
    }
  }

  has(i) {
    return this.firstChar <= i && i <= this.lastChar;
  }

  get(i) {
    return this.firstChar <= i && i <= this.lastChar
      ? String.fromCharCode(i)
      : undefined;
  }

  charCodeOf(v) {
    return Number.isInteger(v) && v >= this.firstChar && v <= this.lastChar
      ? v
      : -1;
  }

  amend(map) {
    unreachable("Should not call amend()");
  }
}

export { IdentityToUnicodeMap, ToUnicodeMap };
