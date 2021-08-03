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
  getDingbatsGlyphsUnicode,
  getGlyphsUnicode,
} from "../../src/core/glyphlist.js";
import {
  getNormalizedUnicodes,
  getUnicodeForGlyph,
  getUnicodeRangeFor,
  mapSpecialUnicodeValues,
  reverseIfRtl,
} from "../../src/core/unicode.js";

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
    });

    it("should not get a Unicode range", function () {
      expect(getUnicodeRangeFor(0x05ff)).toEqual(-1);
    });
  });

  describe("getNormalizedUnicodes", function () {
    let NormalizedUnicodes;

    beforeAll(function () {
      NormalizedUnicodes = getNormalizedUnicodes();
    });

    afterAll(function () {
      NormalizedUnicodes = null;
    });

    it("should get normalized Unicode values for ligatures", function () {
      // fi => f + i
      expect(NormalizedUnicodes["\uFB01"]).toEqual("fi");
      // Arabic
      expect(NormalizedUnicodes["\u0675"]).toEqual("\u0627\u0674");
    });

    it("should not normalize standard characters", function () {
      expect(NormalizedUnicodes.A).toEqual(undefined);
    });
  });

  describe("reverseIfRtl", function () {
    let NormalizedUnicodes;

    function getGlyphUnicode(char) {
      if (NormalizedUnicodes[char] !== undefined) {
        return NormalizedUnicodes[char];
      }
      return char;
    }

    beforeAll(function () {
      NormalizedUnicodes = getNormalizedUnicodes();
    });

    afterAll(function () {
      NormalizedUnicodes = null;
    });

    it("should not reverse LTR characters", function () {
      const A = getGlyphUnicode("A");
      expect(reverseIfRtl(A)).toEqual("A");

      const fi = getGlyphUnicode("\uFB01");
      expect(reverseIfRtl(fi)).toEqual("fi");
    });

    it("should reverse RTL characters", function () {
      // Hebrew (no-op, since it's not a combined character)
      const heAlef = getGlyphUnicode("\u05D0");
      expect(reverseIfRtl(heAlef)).toEqual("\u05D0");
      // Arabic
      const arAlef = getGlyphUnicode("\u0675");
      expect(reverseIfRtl(arAlef)).toEqual("\u0674\u0627");
    });
  });
});
