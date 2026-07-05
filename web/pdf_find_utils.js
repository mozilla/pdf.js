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

import { FeatureTest } from "pdfjs-lib";

let wordSegmenter = null;
let graphemeSegmenter = null;

function isWordBreakAt(content, pos) {
  // `pos` must be a grapheme boundary (so a combining mark stays attached to
  // its base, and a surrogate pair isn't split) as well as a word boundary,
  // the latter tested on the two adjacent grapheme clusters in isolation like
  // Firefox's find (see `nsFind::BreakInBetween`).
  graphemeSegmenter ||= new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  });

  const graphemes = graphemeSegmenter.segment(content);
  const after = graphemes.containing(pos);
  if (after.index !== pos) {
    return false;
  }

  wordSegmenter ||= new Intl.Segmenter(undefined, { granularity: "word" });
  const before = graphemes.containing(pos - 1).segment;
  return (
    wordSegmenter.segment(before + after.segment).containing(before.length)
      .index === before.length
  );
}

/**
 * Determine if the match spanning `[startIdx, startIdx + length)` in `content`
 * is a whole word, i.e. there's a word break on each side of it. Each boundary
 * is tested on its two adjacent characters in isolation rather than on the
 * whole string, so a contraction such as "can't" doesn't prevent "can" from
 * being an entire word, matching Firefox's find:
 * https://searchfox.org/firefox-main/source/toolkit/components/find/nsFind.cpp
 */
function isEntireWord(content, startIdx, length) {
  const endIdx = startIdx + length;
  return (
    (startIdx === 0 || isWordBreakAt(content, startIdx)) &&
    (endIdx === content.length || isWordBreakAt(content, endIdx))
  );
}

let NormalizeWithNFKC;
function getNormalizeWithNFKC() {
  if (
    (typeof PDFJSDev === "undefined" && FeatureTest.platform.isFirefox) ||
    (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL"))
  ) {
    // The `NormalizeWithNFKC` string is generated with the for loop below.
    // Because of a small difference between Chrome and Firefox, the string is
    // only hardcoded for Firefox, and Chrome (or others) will generate it at
    // runtime.
    // In order to detect if the string is up to date, a check is performed in
    // the loop below, and if a difference is detected, an error is thrown.
    /* eslint-disable no-irregular-whitespace */
    NormalizeWithNFKC ||= `\xA0¨ª¯²-µ¸-º¼-¾Ĳ-ĳĿ-ŀŉſǄ-ǌǱ-ǳʰ-ʸ˘-˝ˠ-ˤʹͺ;΄-΅·ϐ-ϖϰ-ϲϴ-ϵϹևٵ-ٸक़-य़ড়-ঢ়য়ਲ਼ਸ਼ਖ਼-ਜ਼ਫ਼ଡ଼-ଢ଼ำຳໜ-ໝ༌གྷཌྷདྷབྷཛྷཀྵჼᴬ-ᴮᴰ-ᴺᴼ-ᵍᵏ-ᵪᵸᶛ-ᶿẚ-ẛάέήίόύώΆ᾽-῁ΈΉ῍-῏ΐΊ῝-῟ΰΎ῭-`ΌΏ´-῾ - ‑‗․-… ″-‴‶-‷‼‾⁇-⁉⁗ ⁰-ⁱ⁴-₎ₐ-ₜ₨℀-℃℅-ℇ℉-ℓℕ-№ℙ-ℝ℠-™ℤΩℨK-ℭℯ-ℱℳ-ℹ℻-⅀ⅅ-ⅉ⅐-ⅿ↉∬-∭∯-∰〈-〉①-⓪⨌⩴-⩶⫝̸ⱼ-ⱽⵯ⺟⻳⼀-⿕　〶〸-〺゛-゜ゟヿㄱ-ㆎ㆒-㆟㈀-㈞㈠-㉇㉐-㉾㊀-㏿ꚜ-ꚝꝰ꟱-ꟴꟸ-ꟹꭜ-ꭟꭩ豈-嗀塚晴凞-羽蘒諸逸-都飯-舘並-龎ﬀ-ﬆﬓ-ﬗיִײַ-זּטּ-לּמּנּ-סּףּ-פּצּ-ﮱﯓ-ﴽﵐ-ﶏﶒ-ﷇﷰ-﷼︐-︙︰-﹄﹇-﹒﹔-﹦﹨-﹫ﹰ-ﹲﹴﹶ-ﻼ！-ﾾￂ-ￇￊ-ￏￒ-ￗￚ-ￜ￠-￦`;
  }

  if (
    typeof PDFJSDev === "undefined" ||
    PDFJSDev.test("TESTING") ||
    (!PDFJSDev.test("MOZCENTRAL") && !NormalizeWithNFKC)
  ) {
    const ranges = [];
    const range = [];
    const diacriticsRegex = /^\p{M}$/u;
    // Some chars must be replaced by their NFKC counterpart during a search.
    for (let i = 0; i < 65536; i++) {
      if (i >= 0xd800 && i <= 0xdfff) {
        continue; // Skip surrogates since they're not valid Unicode scalar values.
      }
      const c = String.fromCharCode(i);
      if (c.normalize("NFKC") !== c && !diacriticsRegex.test(c)) {
        if (range.length !== 2) {
          range[0] = range[1] = i;
          continue;
        }
        if (range[1] + 1 !== i) {
          if (range[0] === range[1]) {
            ranges.push(String.fromCharCode(range[0]));
          } else {
            ranges.push(
              `${String.fromCharCode(range[0])}-${String.fromCharCode(
                range[1]
              )}`
            );
          }
          range[0] = range[1] = i;
        } else {
          range[1] = i;
        }
      }
    }

    const rangesStr = ranges.join("");
    if (!NormalizeWithNFKC) {
      NormalizeWithNFKC = rangesStr;
    } else if (rangesStr !== NormalizeWithNFKC) {
      for (let i = 1; i < rangesStr.length; i++) {
        if (rangesStr[i] !== NormalizeWithNFKC[i]) {
          console.log(
            `Difference at index ${i}: ` +
              `U+${rangesStr.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0")}` +
              `!== U+${NormalizeWithNFKC.charCodeAt(i)
                .toString(16)
                .toUpperCase()
                .padStart(4, "0")}`
          );
          break;
        }
      }
      throw new Error(
        "getNormalizeWithNFKC - update the `NormalizeWithNFKC` string."
      );
    }
  }
  return NormalizeWithNFKC;
}

export { getNormalizeWithNFKC, isEntireWord };
