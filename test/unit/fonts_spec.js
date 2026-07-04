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

import { Font } from "../../src/core/fonts.js";
import { IdentityToUnicodeMap } from "../../src/core/to_unicode_map.js";

describe("Font", () => {
  describe("encodeString", () => {
    // `encodeString` only reads `this.toUnicode` and `this.cMap`, so a
    // full `Font` (which needs a complete properties/font-file setup) isn't
    // necessary to exercise it in isolation.
    function encodeString(str, { cMap = null } = {}) {
      const fakeFont = {
        toUnicode: new IdentityToUnicodeMap(0, 0x10ffff),
        cMap,
      };
      return Font.prototype.encodeString.call(fakeFont, str);
    }

    it("should keep the character after U+FFFE or U+FFFF", () => {
      expect(encodeString("￿A")).toEqual(["\xffA"]);
      expect(encodeString("￾B")).toEqual(["\xfeB"]);
    });

    it("should still treat a real surrogate pair as one code point", () => {
      // U+1F602 ("😂") is genuinely represented by a surrogate pair; the
      // character after it must still be kept, and the pair itself must
      // not be split into its two unpaired halves.
      expect(encodeString("😂C")).toEqual(["\x02C"]);
    });
  });
});
