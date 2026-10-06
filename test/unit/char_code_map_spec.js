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

import { CharCodeMap } from "../../src/core/char_code_map.js";

describe("CharCodeMap", function () {
  function getEntries(map) {
    const entries = [];
    map.forEach((code, value) => {
      entries.push([code, value]);
    });
    return entries;
  }

  it("stores both dense and sparse codes", function () {
    const map = new CharCodeMap();
    map.set(0x20, "a");
    map.set(0xffff, "b");
    map.set(0x10000, "c");
    map.set(0xffffffff, "d");
    map.set(0x20, "e"); // Overwrite.

    expect(map.size).toEqual(4);
    expect(map.get(0x20)).toEqual("e");
    expect(map.get(0xffff)).toEqual("b");
    expect(map.get(0x10000)).toEqual("c");
    expect(map.get(0xffffffff)).toEqual("d");
    expect(map.has(0x21)).toEqual(false);
    expect(map.has(0x10001)).toEqual(false);
    expect(map.get(-1)).toBeUndefined();
    expect(map.get(0.5)).toBeUndefined();
  });

  it("iterates in insertion order", function () {
    const map = new CharCodeMap();
    map.set(0x20000, "a");
    map.set(0x41, "b");
    map.set(0x10000, "c");
    map.set(0x20, "d");
    map.set(0x41, "e"); // Keep the original position.

    expect(getEntries(map)).toEqual([
      [0x20000, "a"],
      [0x41, "e"],
      [0x10000, "c"],
      [0x20, "d"],
    ]);
  });

  it("finds the first code mapping to a value", function () {
    const map = new CharCodeMap();
    map.set(0x42, "a");
    map.set(0x30000, "b");
    map.set(0x41, "a");
    map.set(0x20000, "b");

    expect(map.charCodeOf("a")).toEqual(0x42);
    expect(map.charCodeOf("b")).toEqual(0x30000);
    expect(map.charCodeOf("c")).toEqual(-1);
  });

  it("finds the first code mapping to a value, after many lookups", function () {
    const map = new CharCodeMap();
    map.set(0x42, "a");
    map.set(0x30000, "b");
    map.set(0x41, "a");

    // Build the reverse lookup cache.
    for (let i = 0; i < 200; i++) {
      expect(map.charCodeOf("a")).withContext(`lookup ${i}`).toEqual(0x42);
    }
    expect(map.charCodeOf("b")).toEqual(0x30000);
    expect(map.charCodeOf("c")).toEqual(-1);

    map.set(0x20, "a");
    map.set(0x50, "c");
    expect(map.charCodeOf("a")).toEqual(0x42);
    expect(map.charCodeOf("c")).toEqual(0x50);
  });

  it("creates an independent copy", function () {
    const map = new CharCodeMap();
    map.set(0x41, "a");
    map.set(0x10000, "b");

    const copy = map.clone();
    copy.set(0x42, "c");
    copy.set(0x10001, "d");

    expect(map.size).toEqual(2);
    expect(copy.size).toEqual(4);
    expect(getEntries(map)).toEqual([
      [0x41, "a"],
      [0x10000, "b"],
    ]);
    expect(getEntries(copy)).toEqual([
      [0x41, "a"],
      [0x10000, "b"],
      [0x42, "c"],
      [0x10001, "d"],
    ]);
  });
});
