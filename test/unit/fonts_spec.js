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
import { IdentityCMap } from "../../src/core/cmap.js";
import { IdentityToUnicodeMap } from "../../src/core/to_unicode_map.js";

describe("Font", () => {
  describe("charsToGlyphs", () => {
    // Match the sparse metric arrays from PartialEvaluator.extractWidths.
    function createFont(vertical) {
      return new Font(
        "TestFont",
        null,
        {
          type: "CIDFontType2",
          composite: true,
          vertical,
          cMap: new IdentityCMap(vertical, 2),
          cidEncoding: vertical ? "Identity-V" : "Identity-H",
          toUnicode: new IdentityToUnicodeMap(65, 68),
          differences: new Map(),
          defaultEncoding: [],
          widths: Object.assign([], { 65: 600, 66: 0, 68: 800 }),
          defaultWidth: 1000,
          vmetrics: vertical ? Object.assign([], { 68: [-800, 175, 700] }) : [],
          defaultVMetrics: vertical ? [-1200, 500, 900] : undefined,
        },
        {}
      );
    }

    it("should use half the glyph width for the default vertical origin", () => {
      const font = createFont(/* vertical = */ true);
      const glyphs = font.charsToGlyphs("\x00A\x00B\x00C\x00D");

      // Cover per-glyph widths, zero width, DW fallback, and explicit W2.
      expect(glyphs.map(glyph => glyph.vmetric)).toEqual([
        [-1200, 300, 900],
        [-1200, 0, 900],
        [-1200, 500, 900],
        [-800, 175, 700],
      ]);
      expect(font.defaultVMetrics).toEqual([-1200, 500, 900]);
    });

    it("should not set a vertical metric for horizontal fonts", () => {
      const font = createFont(/* vertical = */ false);
      const glyphs = font.charsToGlyphs("\x00A\x00B\x00C\x00D");

      for (const glyph of glyphs) {
        expect(glyph.vmetric).toBeUndefined();
      }
    });
  });

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
