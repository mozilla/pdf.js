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

      expect(bidiText.str).toEqual("(\u05d1)(");
      expect(bidiText.dir).toEqual("rtl");
    }
  );

  it("should consistently render Hebrew text regardless of context (issue 20336)", function () {
    // Hebrew phrase: "אישור אגודה לחתימת" (approval association signature)
    const hebrewPhrase = "\u05d0\u05d9\u05e9\u05d5\u05e8 \u05d0\u05d2\u05d5\u05d3\u05d4 \u05dc\u05d7\u05ea\u05d9\u05de\u05ea";
    
    // Test 1: Hebrew phrase in context with significant RTL content (>30%)
    const context1 = "Document " + hebrewPhrase + " file";
    const result1 = bidi(context1, -1, false);
    
    // Test 2: Same Hebrew phrase in context with low RTL content (<30%)
    const context2 = "This is a very long English document title containing " + hebrewPhrase + " which should render consistently";
    const result2 = bidi(context2, -1, false);
    
    // Context 1 should be RTL (>30% RTL), Context 2 should be LTR (<30% RTL)
    expect(result1.dir).toEqual("rtl");
    expect(result2.dir).toEqual("ltr");
    
    // However, the Hebrew portion should be processed correctly in both cases
    // The key improvement is that the algorithm now handles mixed content more consistently
    expect(result1.str).toContain(hebrewPhrase.split('').reverse().join('') || hebrewPhrase);
    expect(result2.str).toContain(hebrewPhrase.split('').reverse().join('') || hebrewPhrase);
  });

  it("should handle pure Hebrew text correctly", function () {
    // Pure Hebrew text should always be RTL
    const pureHebrew = "\u05d0\u05d9\u05e9\u05d5\u05e8 \u05d0\u05d2\u05d5\u05d3\u05d4 \u05dc\u05d7\u05ea\u05d9\u05de\u05ea";
    const result = bidi(pureHebrew, -1, false);
    
    expect(result.dir).toEqual("rtl");
    // Hebrew text should not be reversed when base direction is RTL
    expect(result.str).toEqual(pureHebrew);
  });
});
