/* Copyright 2025 Mozilla Foundation
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

import { ToUnicodeMap } from "../../src/core/to_unicode_map.js";

describe("ToUnicodeMap", () => {
  it("should correctly map Extension B characters using codePointAt", () => {
    const cmap = { 0x20: "\uD840\uDC00" }; // Example Extension B character
    const toUnicodeMap = new ToUnicodeMap(cmap);

    const expected = 0x20000; // Unicode code point for the character
    let actual;
    toUnicodeMap.forEach((charCode, unicode) => {
      if (charCode === (0x20).toString()) {
        actual = unicode;
      }
    });

    expect(actual).toBe(expected);
  });
});
