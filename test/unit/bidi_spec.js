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

import { bidi } from "../../src/core/bidi.js";
import { fetchData } from "../../src/display/dom_utils.js";
import { isNodeJS } from "../../src/shared/util.js";

const BIDI_TEST_DATA_PATH = isNodeJS ? "./test/bidi/" : "../bidi/";

async function readTestFile(filename) {
  const path = BIDI_TEST_DATA_PATH + filename;
  if (isNodeJS) {
    const fs = process.getBuiltinModule("fs/promises");
    return fs.readFile(path, "utf8");
  }
  return fetchData(new URL(path, window.location), /* type = */ "text");
}

// Unicode Bidirectional Algorithm tests.
// Specification: https://www.unicode.org/reports/tr9/tr9-48.html
// Test data:     https://www.unicode.org/Public/UCD/latest/ucd/BidiTest.txt
//                https://www.unicode.org/Public/UCD/latest/ucd/BidiCharacterTest.txt

// Embedding/isolate code points not handled by bidi.js (X1-X10 rules skipped).
const EMBEDDING_CODEPOINTS = new Set([
  0x202a, // LRE
  0x202b, // RLE
  0x202c, // PDF
  0x202d, // LRO
  0x202e, // RLO
  0x2066, // LRI
  0x2067, // RLI
  0x2068, // FSI
  0x2069, // PDI
]);

// Bidi paired bracket code points that require the N0 rule (not implemented).
const BRACKET_CODEPOINTS = new Set([
  0x0028,
  0x0029, // ( )
  0x005b,
  0x005d, // [ ]
  0x007b,
  0x007d, // { }
  0x2329,
  0x232a, // 〈 〉
  0x3008,
  0x3009, // ⟨ ⟩
]);

// Bidi classes not handled by bidi.js:
//   - Embeddings/isolates: X1-X10 rules are skipped.
//   - BN: boundary neutrals, treated as invisible by X9 (skipped).
//   - S/B: segment/paragraph separators, level reset by L1 (skipped).
const UNSUPPORTED_BIDI_CLASSES = new Set([
  "LRE",
  "RLE",
  "LRO",
  "RLO",
  "PDF",
  "LRI",
  "RLI",
  "FSI",
  "PDI",
  "BN",
  "S",
  "B",
]);

describe("bidi", function () {
  it(
    "should mark text as LTR if there's only LTR-characters, " +
      "when the string is very short",
    function () {
      const str = "foo";
      const bidiText = bidi(str, -1, false);

      expect(bidiText.str).toEqual("foo");
      expect(bidiText.dir).toEqual("ltr");
    }
  );

  it("should mark text as LTR if there's only LTR-characters", function () {
    const str = "Lorem ipsum dolor sit amet, consectetur adipisicing elit.";
    const bidiText = bidi(str, -1, false);

    expect(bidiText.str).toEqual(
      "Lorem ipsum dolor sit amet, consectetur adipisicing elit."
    );
    expect(bidiText.dir).toEqual("ltr");
  });

  it("should mark text as RTL if more than 30% of text is RTL", function () {
    // 33% of test text are RTL characters
    const test = "\u0645\u0635\u0631 Egypt";
    const result = "Egypt \u0631\u0635\u0645";
    const bidiText = bidi(test, -1, false);

    expect(bidiText.str).toEqual(result);
    expect(bidiText.dir).toEqual("rtl");
  });

  it("should mark text as LTR if less than 30% of text is RTL", function () {
    const test = "Egypt is known as \u0645\u0635\u0631 in Arabic.";
    const result = "Egypt is known as \u0631\u0635\u0645 in Arabic.";
    const bidiText = bidi(test, -1, false);

    expect(bidiText.str).toEqual(result);
    expect(bidiText.dir).toEqual("ltr");
  });

  it(
    "should mark text as RTL if less than 30% of text is RTL, " +
      "when the string is very short (issue 11656)",
    function () {
      const str = "()\u05d1("; // 25% of the string is RTL characters.
      const bidiText = bidi(str, -1, false);

      expect(bidiText.str).toEqual(")\u05d1()");
      expect(bidiText.dir).toEqual("rtl");
    }
  );

  it("should reorder glyphs using their resolved levels (issue 16880)", function () {
    for (const [glyphs, expected] of [
      [["م", "لا", "س"], "سلام"],
      [["١٢", "م"], "م١٢"],
      [["fi", "م", "س"], "سمfi"],
      [["<>", "م"], "م<>"],
      // A glyph with mixed levels is reordered char by char.
      [["لa", "م"], "مaل"],
    ]) {
      expect(bidi(glyphs).str)
        .withContext(JSON.stringify(glyphs))
        .toEqual(expected);
    }
  });

  it("should preserve a combining mark within a single glyph", function () {
    for (const previous of ["a", "1", "١", " "]) {
      expect(bidi([previous, "لَ"]).str)
        .withContext(previous)
        .toEqual(`لَ${previous}`);
    }
  });

  it("should handle the non-spacing marks outside of the Arabic block (issue 22433)", function () {
    // Meem, fatha, combining grapheme joiner, reh, sukun.
    const logical = "مَ\u034fرْ";
    const visual = [...logical].reverse().join("");
    expect(bidi(visual).str).toEqual(logical);
  });

  it("should handle the Hebrew presentation forms", function () {
    // Shin with shin dot, vav with dagesh, alef with patah.
    const logical = "שׁוּאַ";
    const visual = [...logical].reverse().join("");
    expect(bidi(visual)).toEqual({ str: logical, dir: "rtl" });
    // The varika is a mark and the alternative plus sign a separator.
    expect(bidi("aﬞ", 1).str).toEqual("aﬞ");
    expect(bidi("1﬩2", 1).str).toEqual("1﬩2");
  });

  it("should keep currency and per mille signs with their number", function () {
    expect(bidi("דבלב ₪ 100 ריחמה").str).toEqual("המחיר 100 ₪ בלבד");
    expect(bidi("€ 50 ريعس").str).toEqual("سعير 50 €");
    expect(bidi("5‰ לש רועיש").str).toEqual("שיעור של 5‰");
  });

  it("should not count a zero width no-break space as RTL", function () {
    expect(bidi("\ufeffab")).toEqual({ str: "\ufeffab", dir: "ltr" });
  });

  it("should handle the Arabic Extended-A letters", function () {
    expect(bidi("abc \u0628\u08b6", 0).str).toEqual("abc \u08b6\u0628");
  });

  it("should use Unicode bidi class defaults for unassigned code points", function () {
    expect(bidi("\u0590 xy")).toEqual({ str: "xy \u0590", dir: "rtl" });
  });

  it("should keep the surrogate pairs together", function () {
    // Adlam is RTL and outside of the BMP.
    expect(bidi("\u{1e901}\u{1e900}").str).toEqual("\u{1e900}\u{1e901}");
    expect(bidi("😀 םולש").str).toEqual("שלום 😀");
  });

  it("should count code points when determining the text direction", function () {
    expect(bidi("xy \u{1e901}\u{1e900}")).toEqual({
      str: "\u{1e900}\u{1e901} xy",
      dir: "rtl",
    });
    expect(bidi("😀 א!")).toEqual({ str: "!א 😀", dir: "rtl" });
  });

  it("should mirror the RTL characters", function () {
    expect(bidi('(ר"מב)').str).toEqual('(במ"ר)');
    expect(bidi("b > a םולש").str).toEqual("שלום b > a");
    expect(bidi("1 < 2 םולש").str).toEqual("שלום 2 > 1");
    // LTR text isn't mirrored.
    expect(bidi("ab (cd) םולש", 0).str).toEqual("ab (cd) שלום");
  });

  it("should only mirror the glyphs drawn with the shape of their character", function () {
    // The ToUnicode map of a glyph can already give the logical character.
    expect(bidi([")", "ב", "("]).str).toEqual("(ב)");
    const glyphs = ["(", "ב", { unicode: "(", isUnicodeVisual: true }];
    const mirrored = [];
    const onMirror = (glyph, unicode) => mirrored.push([glyph, unicode]);
    expect(bidi(glyphs, -1, false, onMirror).str).toEqual(")ב(");
    expect(mirrored).toEqual([[glyphs[2], ")"]]);
  });

  it("should reorder characters correctly per BidiCharacterTest.txt", async function () {
    const content = await readTestFile("BidiCharacterTest.txt");

    const failingLines = [];
    let total = 0;

    for (const [lineIndex, line] of content.split("\n").entries()) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const fields = trimmed.split(";");
      if (fields.length < 5) {
        continue;
      }

      // Field 1: paragraph direction.
      // 0 = LTR, 1 = RTL, 2 = auto-LTR (P2/P3).
      // Skip auto-LTR: bidi.js uses a 30%-threshold instead of P2/P3.
      const paragraphDir = parseInt(fields[1].trim(), 10);
      if (paragraphDir === 2) {
        continue;
      }

      // Field 3: resolved levels; "x" marks characters removed by rule X9.
      // Skip those cases since bidi.js does not implement X9.
      if (fields[3].trim().split(/\s+/).includes("x")) {
        continue;
      }

      const codePoints = fields[0]
        .trim()
        .split(/\s+/)
        .map(cp => parseInt(cp, 16));

      // Skip cases with embedding/isolate code points (X1-X10 not implemented).
      if (codePoints.some(cp => EMBEDDING_CODEPOINTS.has(cp))) {
        continue;
      }

      // Skip cases containing bidi paired brackets (N0 rule not implemented).
      if (codePoints.some(cp => BRACKET_CODEPOINTS.has(cp))) {
        continue;
      }

      const str = String.fromCodePoint(...codePoints);
      // Use spread to safely iterate by code point (handles surrogates).
      const chars = [...str];

      // Field 4: visual ordering indices (left to right).
      const orderStr = fields[4].trim();
      const order = orderStr ? orderStr.split(/\s+/).map(Number) : [];
      const expectedStr = order.map(i => chars[i]).join("");

      // paragraphDir 0 → startLevel 0 (LTR), 1 → startLevel 1 (RTL).
      const result = bidi(str, paragraphDir, false);

      total++;
      if (result.str !== expectedStr) {
        failingLines.push(lineIndex + 1);
      }
    }

    expect(total).toBeGreaterThan(0);
    expect(failingLines).toEqual([]);
  });

  it("should reorder characters correctly per BidiTest.txt", async function () {
    const content = await readTestFile("BidiTest.txt");

    // Map each bidi class to a representative character recognized by bidi.js.
    const BIDI_CLASS_TO_CHAR = {
      L: "a", // U+0061
      R: "\u05D0", // Hebrew Alef
      AL: "\u0627", // Arabic Alef
      AN: "\u0660", // Arabic-Indic Digit Zero
      EN: "1", // U+0031
      ES: "+", // U+002B
      ET: "#", // U+0023
      CS: ",", // U+002C
      NSM: "\u0610", // Arabic combining mark
      B: "\n", // U+000A paragraph separator
      S: "\t", // U+0009 segment separator
      WS: " ", // U+0020
      ON: "!", // U+0021
    };

    let currentLevels = null;
    let currentReorder = null;
    const failingLines = [];
    let total = 0;

    for (const [lineIndex, line] of content.split("\n").entries()) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      if (trimmed.startsWith("@Levels:")) {
        currentLevels = trimmed.slice("@Levels:".length).trim().split(/\s+/);
        continue;
      }

      if (trimmed.startsWith("@Reorder:")) {
        const reorderStr = trimmed.slice("@Reorder:".length).trim();
        currentReorder = reorderStr ? reorderStr.split(/\s+/).map(Number) : [];
        continue;
      }

      // Ignore other @ directives (forward compatibility).
      if (trimmed.startsWith("@")) {
        continue;
      }

      if (!currentLevels || !currentReorder) {
        continue;
      }

      // Skip cases where rule X9 removes characters (bidi.js omits X9).
      if (currentLevels.includes("x")) {
        continue;
      }

      const semicolonIdx = trimmed.indexOf(";");
      if (semicolonIdx === -1) {
        continue;
      }

      const classes = trimmed.slice(0, semicolonIdx).trim().split(/\s+/);
      const bitset = parseInt(trimmed.slice(semicolonIdx + 1).trim(), 10);

      // Skip cases that involve unsupported bidi classes.
      if (classes.some(c => UNSUPPORTED_BIDI_CLASSES.has(c))) {
        continue;
      }

      // Skip cases with no RTL character: bidi.js returns the input unchanged
      // when no R/AL/AN is present, regardless of paragraph direction.
      if (!classes.some(c => c === "R" || c === "AL" || c === "AN")) {
        continue;
      }

      const chars = classes.map(c => BIDI_CLASS_TO_CHAR[c]);
      if (chars.includes(undefined)) {
        continue; // Unknown class, skip.
      }
      const str = chars.join("");
      const expectedStr = currentReorder.map(i => chars[i]).join("");

      // Test explicit LTR (bit 1) and RTL (bit 2) paragraph directions.
      // Skip auto-LTR (bit 0): bidi.js uses a threshold instead of P2/P3.
      if (bitset & 2) {
        total++;
        if (bidi(str, 0, false).str !== expectedStr) {
          failingLines.push(lineIndex + 1);
        }
      }
      if (bitset & 4) {
        total++;
        if (bidi(str, 1, false).str !== expectedStr) {
          failingLines.push(lineIndex + 1);
        }
      }
    }

    expect(total).toBeGreaterThan(0);
    expect(failingLines).toEqual([]);
  });
});
