/* Copyright 2017 Mozilla Foundation
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
  getCharUnicodeCategory,
  getUnicodeForGlyph,
  getUnicodeRangeFor,
  mapSpecialUnicodeValues,
} from "../../src/core/unicode.js";
import {
  getDingbatsGlyphsUnicode,
  getGlyphsUnicode,
} from "../../src/core/glyphlist.js";

describe("unicode", function () {
  describe("mapSpecialUnicodeValues", function () {
    it("should not re-map normal Unicode values", function () {
      // A
      expect(mapSpecialUnicodeValues(0x0041)).toEqual(0x0041);
      // fi
      expect(mapSpecialUnicodeValues(0xfb01)).toEqual(0xfb01);
    });

    it("should re-map special Unicode values", function () {
      // copyrightsans => copyright
      expect(mapSpecialUnicodeValues(0xf8e9)).toEqual(0x00a9);
      // Private Use Area characters
      expect(mapSpecialUnicodeValues(0xffff)).toEqual(0);
    });
  });

  describe("getCharUnicodeCategory", function () {
    it("should correctly determine the character category", function () {
      const tests = {
        // Whitespace
        " ": {
          isZeroWidthDiacritic: false,
          isInvisibleFormatMark: false,
          isWhitespace: true,
        },
        "\t": {
          isZeroWidthDiacritic: false,
          isInvisibleFormatMark: false,
          isWhitespace: true,
        },
        "\u2001": {
          isZeroWidthDiacritic: false,
          isInvisibleFormatMark: false,
          isWhitespace: true,
        },
        "\uFEFF": {
          isZeroWidthDiacritic: false,
          isInvisibleFormatMark: false,
          isWhitespace: true,
        },

        // Diacritic
        "\u0302": {
          isZeroWidthDiacritic: true,
          isInvisibleFormatMark: false,
          isWhitespace: false,
        },
        "\u0344": {
          isZeroWidthDiacritic: true,
          isInvisibleFormatMark: false,
          isWhitespace: false,
        },
        "\u0361": {
          isZeroWidthDiacritic: true,
          isInvisibleFormatMark: false,
          isWhitespace: false,
        },

        // Invisible format mark
        "\u200B": {
          isZeroWidthDiacritic: false,
          isInvisibleFormatMark: true,
          isWhitespace: false,
        },
        "\u200D": {
          isZeroWidthDiacritic: false,
          isInvisibleFormatMark: true,
          isWhitespace: false,
        },

        // No whitespace or diacritic or invisible format mark
        a: {
          isZeroWidthDiacritic: false,
          isInvisibleFormatMark: false,
          isWhitespace: false,
        },
        1: {
          isZeroWidthDiacritic: false,
          isInvisibleFormatMark: false,
          isWhitespace: false,
        },
      };
      for (const [character, expectation] of Object.entries(tests)) {
        expect(getCharUnicodeCategory(character)).toEqual(expectation);
      }
    });
  });

  describe("getUnicodeForGlyph", function () {
    let standardMap, dingbatsMap;

    beforeAll(function () {
      standardMap = getGlyphsUnicode();
      dingbatsMap = getDingbatsGlyphsUnicode();
    });

    afterAll(function () {
      standardMap = dingbatsMap = null;
    });

    it("should get Unicode values for valid glyph names", function () {
      expect(getUnicodeForGlyph("A", standardMap)).toEqual(0x0041);
      expect(getUnicodeForGlyph("a1", dingbatsMap)).toEqual(0x2701);
    });

    it("should recover Unicode values from uniXXXX/uXXXX{XX} glyph names", function () {
      expect(getUnicodeForGlyph("uni0041", standardMap)).toEqual(0x0041);
      expect(getUnicodeForGlyph("u0041", standardMap)).toEqual(0x0041);

      expect(getUnicodeForGlyph("uni2701", dingbatsMap)).toEqual(0x2701);
      expect(getUnicodeForGlyph("u2701", dingbatsMap)).toEqual(0x2701);
    });

    it("should not get Unicode values for invalid glyph names", function () {
      expect(getUnicodeForGlyph("Qwerty", standardMap)).toEqual(-1);
      expect(getUnicodeForGlyph("Qwerty", dingbatsMap)).toEqual(-1);
    });
  });

  describe("getUnicodeRangeFor", function () {
    it("should get correct Unicode range", function () {
      // A (Basic Latin)
      expect(getUnicodeRangeFor(0x0041)).toEqual(0);
      // fi (Alphabetic Presentation Forms)
      expect(getUnicodeRangeFor(0xfb01)).toEqual(62);
      // Combining diacritic (Cyrillic Extended-A)
      expect(getUnicodeRangeFor(0x2dff)).toEqual(9);
    });

    it("should not get a Unicode range", function () {
      expect(getUnicodeRangeFor(0xaa60)).toEqual(-1);
    });
  });
});
