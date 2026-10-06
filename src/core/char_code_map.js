/* Copyright 2026 Mozilla Foundation
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

// Build the reverse Map once linear searches have visited this many times the
// number of entries; building it costs about 20-100 visits per entry.
const REVERSE_MAP_FACTOR = 32;

/**
 * Storage for CMap, ToUnicode and CIDToGIDMap entries.
 *
 * Integer codes in [0, 0xFFFF] index an Array; other codes use a Map.
 * A separate key list preserves insertion order and skips array holes.
 *
 * Values must not be `undefined`.
 */
class CharCodeMap {
  #codes = [];

  #dense = [];

  #reverse = null;

  #sparse = null;

  #visited = 0;

  get size() {
    return this.#codes.length;
  }

  get(code) {
    return (code & 0xffff) === code
      ? this.#dense[code]
      : this.#sparse?.get(code);
  }

  has(code) {
    return this.get(code) !== undefined;
  }

  set(code, value) {
    this.#reverse = null;

    if ((code & 0xffff) === code) {
      if (this.#dense[code] === undefined) {
        this.#codes.push(code);
      }
      this.#dense[code] = value;
      return;
    }
    this.#sparse ??= new Map();
    if (!this.#sparse.has(code)) {
      this.#codes.push(code);
    }
    this.#sparse.set(code, value);
  }

  /**
   * Iterates the entries in insertion order.
   * @param {Function} callback - Called with `(code, value)` for every entry.
   */
  forEach(callback) {
    const codes = this.#codes,
      dense = this.#dense,
      sparse = this.#sparse;
    for (let i = 0, ii = codes.length; i < ii; i++) {
      const code = codes[i];
      callback(code, (code & 0xffff) === code ? dense[code] : sparse.get(code));
    }
  }

  /**
   * @returns {number} First inserted code mapping to `value`, or -1 if absent.
   */
  charCodeOf(value) {
    if (!this.#reverse && this.#visited > REVERSE_MAP_FACTOR * this.size) {
      const reverse = (this.#reverse = new Map());
      this.forEach((code, entry) => {
        if (!reverse.has(entry)) {
          reverse.set(entry, code);
        }
      });
    }
    if (this.#reverse) {
      return this.#reverse.get(value) ?? -1;
    }
    const codes = this.#codes;
    for (let i = 0, ii = codes.length; i < ii; i++) {
      if (this.get(codes[i]) === value) {
        this.#visited += i + 1;
        return codes[i];
      }
    }
    this.#visited += codes.length;
    return -1;
  }

  clone() {
    const map = new CharCodeMap();
    map.#codes = this.#codes.slice();
    map.#dense = this.#dense.slice();
    map.#sparse = this.#sparse && new Map(this.#sparse);
    return map;
  }
}

export { CharCodeMap };
