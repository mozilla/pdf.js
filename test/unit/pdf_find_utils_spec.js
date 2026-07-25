/* Copyright 2018 Mozilla Foundation
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

import { isEntireWord } from "../../web/pdf_find_utils.js";

describe("pdf_find_utils", function () {
  describe("isEntireWord", function () {
    it("matches whole words and rejects sub-words", function () {
      const content = "the quick brown fox";
      // [startIdx, length, expected]
      const cases = [
        [0, 3, true], // "the" (start of the content)
        [4, 5, true], // "quick"
        [10, 5, true], // "brown"
        [16, 3, true], // "fox" (end of the content)
        [1, 2, false], // "he" inside "the"
        [5, 3, false], // "uic" inside "quick"
        [10, 4, false], // "brow" inside "brown"
      ];
      for (const [startIdx, length, expected] of cases) {
        expect(isEntireWord(content, startIdx, length)).toEqual(expected);
      }
    });

    it("treats ASCII punctuation as a word boundary", function () {
      const content = "foo-bar (baz)";
      expect(isEntireWord(content, 0, 3)).toBeTrue(); // "foo" before "-"
      expect(isEntireWord(content, 4, 3)).toBeTrue(); // "bar" before " "
      expect(isEntireWord(content, 9, 3)).toBeTrue(); // "baz" inside "()"
      expect(isEntireWord(content, 0, 7)).toBeTrue(); // "foo-bar"
    });

    it("treats non-ASCII punctuation as a word boundary", function () {
      // These were previously misclassified as letters, so a word wrapped in
      // them wasn't recognized as an entire word.
      for (const [open, close] of [
        ["«", "»"], // « »
        ["“", "”"], // “ ”
        ["—", "—"], // em dashes
      ]) {
        const content = `${open}word${close}`;
        expect(isEntireWord(content, 1, 4)).toBeTrue(); // "word"
        expect(isEntireWord(content, 1, 3)).toBeFalse(); // "wor"
      }
    });

    it("treats a trailing superscript as a word boundary", function () {
      // A footnote/reference marker or an exponent must not prevent the
      // preceding word from matching as an entire word.
      for (const superscript of ["¹", "²", "³", "⁴"]) {
        const content = `word${superscript}`;
        expect(isEntireWord(content, 0, 4)).toBeTrue(); // "word"
      }
    });

    it("matches a word next to a contraction apostrophe", function () {
      // The apostrophe is a word break in isolation (as in Firefox's find), so
      // the leading part of a contraction is still an entire word.
      expect(isEntireWord("I can't do that", 2, 3)).toBeTrue(); // "can"
      expect(isEntireWord("don't", 0, 3)).toBeTrue(); // "don"
      expect(isEntireWord("it's", 0, 2)).toBeTrue(); // "it"
    });

    it("keeps a word joined by a connecting character", function () {
      expect(isEntireWord("foo_bar", 0, 3)).toBeFalse(); // "foo" in "foo_bar"
      expect(isEntireWord("foo_bar", 4, 3)).toBeFalse(); // "bar" in "foo_bar"
    });

    it("handles combining marks (NFD) within a word", function () {
      // "café" in the normalized page content is NFD: "cafe" followed by
      // U+0301 COMBINING ACUTE ACCENT.
      const content = "café".normalize("NFD");
      expect(isEntireWord(content, 0, content.length)).toBeTrue(); // whole
      expect(isEntireWord(content, 0, 3)).toBeFalse(); // "caf"
      expect(isEntireWord(content, 0, 4)).toBeFalse(); // "cafe", before U+0301
    });

    it("keeps a base character and its combining mark together", function () {
      // "áb" in NFD is "a" + U+0301 + "b"; it's a single word.
      const ab = "áb".normalize("NFD");
      expect(isEntireWord(ab, 2, 1)).toBeFalse(); // "b" inside "áb"
      expect(isEntireWord(ab, 0, 2)).toBeFalse(); // "á" inside "áb"
      // "café" is a whole word before a space, but not inside "caféteria".
      expect(isEntireWord("café bar".normalize("NFD"), 0, 5)).toBeTrue();
      expect(isEntireWord("caféteria".normalize("NFD"), 0, 5)).toBeFalse();
    });

    it("keeps non-BMP characters intact", function () {
      // "a𝐀b" is a single word (𝐀 = U+1D400, a surrogate pair).
      const withBoldA = "a\u{1D400}b";
      expect(isEntireWord(withBoldA, 0, 1)).toBeFalse(); // "a"
      expect(isEntireWord(withBoldA, 3, 1)).toBeFalse(); // "b"
      // Each CJK ideograph is its own word (𠀀 = U+20000, a surrogate pair).
      expect(isEntireWord("中\u{20000}国", 0, 1)).toBeTrue(); // "中"
    });
  });
});
