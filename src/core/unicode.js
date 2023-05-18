/* Copyright 2016 Mozilla Foundation
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

import { getLookupTableFactory } from "./core_utils.js";

// Some characters, e.g. copyrightserif, are mapped to the private use area
// and might not be displayed using standard fonts. Mapping/hacking well-known
// chars to the similar equivalents in the normal characters range.
const getSpecialPUASymbols = getLookupTableFactory(function (t) {
  t[63721] = 0x00a9; // copyrightsans (0xF8E9) => copyright
  t[63193] = 0x00a9; // copyrightserif (0xF6D9) => copyright
  t[63720] = 0x00ae; // registersans (0xF8E8) => registered
  t[63194] = 0x00ae; // registerserif (0xF6DA) => registered
  t[63722] = 0x2122; // trademarksans (0xF8EA) => trademark
  t[63195] = 0x2122; // trademarkserif (0xF6DB) => trademark
  t[63729] = 0x23a7; // bracelefttp (0xF8F1)
  t[63730] = 0x23a8; // braceleftmid (0xF8F2)
  t[63731] = 0x23a9; // braceleftbt (0xF8F3)
  t[63740] = 0x23ab; // bracerighttp (0xF8FC)
  t[63741] = 0x23ac; // bracerightmid (0xF8FD)
  t[63742] = 0x23ad; // bracerightbt (0xF8FE)
  t[63726] = 0x23a1; // bracketlefttp (0xF8EE)
  t[63727] = 0x23a2; // bracketleftex (0xF8EF)
  t[63728] = 0x23a3; // bracketleftbt (0xF8F0)
  t[63737] = 0x23a4; // bracketrighttp (0xF8F9)
  t[63738] = 0x23a5; // bracketrightex (0xF8FA)
  t[63739] = 0x23a6; // bracketrightbt (0xF8FB)
  t[63723] = 0x239b; // parenlefttp (0xF8EB)
  t[63724] = 0x239c; // parenleftex (0xF8EC)
  t[63725] = 0x239d; // parenleftbt (0xF8ED)
  t[63734] = 0x239e; // parenrighttp (0xF8F6)
  t[63735] = 0x239f; // parenrightex (0xF8F7)
  t[63736] = 0x23a0; // parenrightbt (0xF8F8)
});

function mapSpecialUnicodeValues(code) {
  if (code >= 0xfff0 && code <= 0xffff) {
    // Specials unicode block.
    return 0;
  } else if (code >= 0xf600 && code <= 0xf8ff) {
    return getSpecialPUASymbols()[code] || code;
  } else if (code === /* softhyphen = */ 0x00ad) {
    return 0x002d; // hyphen
  }
  return code;
}

function getUnicodeForGlyph(name, glyphsUnicodeMap) {
  let unicode = glyphsUnicodeMap[name];
  if (unicode !== undefined) {
    return unicode;
  }
  if (!name) {
    return -1;
  }
  // Try to recover valid Unicode values from 'uniXXXX'/'uXXXX{XX}' glyphs.
  if (name[0] === "u") {
    const nameLen = name.length;
    let hexStr;

    if (nameLen === 7 && name[1] === "n" && name[2] === "i") {
      // 'uniXXXX'
      hexStr = name.substring(3);
    } else if (nameLen >= 5 && nameLen <= 7) {
      // 'uXXXX{XX}'
      hexStr = name.substring(1);
    } else {
      return -1;
    }
    // Check for upper-case hexadecimal characters, to avoid false positives.
    if (hexStr === hexStr.toUpperCase()) {
      unicode = parseInt(hexStr, 16);
      if (unicode >= 0) {
        return unicode;
      }
    }
  }
  return -1;
}

// See https://learn.microsoft.com/en-us/typography/opentype/spec/os2#ulunicoderange1-bits-031ulunicoderange2-bits-3263ulunicoderange3-bits-6495ulunicoderange4-bits-96127
const UnicodeRanges = [
  [0x0000, 0x007f], // 0 - Basic Latin
  [0x0080, 0x00ff], // 1 - Latin-1 Supplement
  [0x0100, 0x017f], // 2 - Latin Extended-A
  [0x0180, 0x024f], // 3 - Latin Extended-B
  [0x0250, 0x02af, 0x1d00, 0x1d7f, 0x1d80, 0x1dbf], // 4 - IPA Extensions - Phonetic Extensions - Phonetic Extensions Supplement
  [0x02b0, 0x02ff, 0xa700, 0xa71f], // 5 - Spacing Modifier Letters - Modifier Tone Letters
  [0x0300, 0x036f, 0x1dc0, 0x1dff], // 6 - Combining Diacritical Marks - Combining Diacritical Marks Supplement
  [0x0370, 0x03ff], // 7 - Greek and Coptic
  [0x2c80, 0x2cff], // 8 - Coptic
  [0x0400, 0x04ff, 0x0500, 0x052f, 0x2de0, 0x2dff, 0xa640, 0xa69f], // 9 - Cyrillic - Cyrillic Supplement - Cyrillic Extended-A - Cyrillic Extended-B
  [0x0530, 0x058f], // 10 - Armenian
  [0x0590, 0x05ff], // 11 - Hebrew
  [0xa500, 0xa63f], // 12 - Vai
  [0x0600, 0x06ff, 0x0750, 0x077f], // 13 - Arabic - Arabic Supplement
  [0x07c0, 0x07ff], // 14 - NKo
  [0x0900, 0x097f], // 15 - Devanagari
  [0x0980, 0x09ff], // 16 - Bengali
  [0x0a00, 0x0a7f], // 17 - Gurmukhi
  [0x0a80, 0x0aff], // 18 - Gujarati
  [0x0b00, 0x0b7f], // 19 - Oriya
  [0x0b80, 0x0bff], // 20 - Tamil
  [0x0c00, 0x0c7f], // 21 - Telugu
  [0x0c80, 0x0cff], // 22 - Kannada
  [0x0d00, 0x0d7f], // 23 - Malayalam
  [0x0e00, 0x0e7f], // 24 - Thai
  [0x0e80, 0x0eff], // 25 - Lao
  [0x10a0, 0x10ff, 0x2d00, 0x2d2f], // 26 - Georgian - Georgian Supplement
  [0x1b00, 0x1b7f], // 27 - Balinese
  [0x1100, 0x11ff], // 28 - Hangul Jamo
  [0x1e00, 0x1eff, 0x2c60, 0x2c7f, 0xa720, 0xa7ff], // 29 - Latin Extended Additional - Latin Extended-C - Latin Extended-D
  [0x1f00, 0x1fff], // 30 - Greek Extended
  [0x2000, 0x206f, 0x2e00, 0x2e7f], // 31 - General Punctuation - Supplemental Punctuation
  [0x2070, 0x209f], // 32 - Superscripts And Subscripts
  [0x20a0, 0x20cf], // 33 - Currency Symbol
  [0x20d0, 0x20ff], // 34 - Combining Diacritical Marks
  [0x2100, 0x214f], // 35 - Letterlike Symbols
  [0x2150, 0x218f], // 36 - Number Forms
  [0x2190, 0x21ff, 0x27f0, 0x27ff, 0x2900, 0x297f, 0x2b00, 0x2bff], // 37 - Arrows - Supplemental Arrows-A - Supplemental Arrows-B - Miscellaneous Symbols and Arrows
  [0x2200, 0x22ff, 0x2a00, 0x2aff, 0x27c0, 0x27ef, 0x2980, 0x29ff], // 38 - Mathematical Operators - Supplemental Mathematical Operators - Miscellaneous Mathematical Symbols-A - Miscellaneous Mathematical Symbols-B
  [0x2300, 0x23ff], // 39 - Miscellaneous Technical
  [0x2400, 0x243f], // 40 - Control Pictures
  [0x2440, 0x245f], // 41 - Optical Character Recognition
  [0x2460, 0x24ff], // 42 - Enclosed Alphanumerics
  [0x2500, 0x257f], // 43 - Box Drawing
  [0x2580, 0x259f], // 44 - Block Elements
  [0x25a0, 0x25ff], // 45 - Geometric Shapes
  [0x2600, 0x26ff], // 46 - Miscellaneous Symbols
  [0x2700, 0x27bf], // 47 - Dingbats
  [0x3000, 0x303f], // 48 - CJK Symbols And Punctuation
  [0x3040, 0x309f], // 49 - Hiragana
  [0x30a0, 0x30ff, 0x31f0, 0x31ff], // 50 - Katakana - Katakana Phonetic Extensions
  [0x3100, 0x312f, 0x31a0, 0x31bf], // 51 - Bopomofo - Bopomofo Extended
  [0x3130, 0x318f], // 52 - Hangul Compatibility Jamo
  [0xa840, 0xa87f], // 53 - Phags-pa
  [0x3200, 0x32ff], // 54 - Enclosed CJK Letters And Months
  [0x3300, 0x33ff], // 55 - CJK Compatibility
  [0xac00, 0xd7af], // 56 - Hangul Syllables
  [0xd800, 0xdfff], // 57 - Non-Plane 0 *
  [0x10900, 0x1091f], // 58 - Phoenicia
  [
    0x4e00, 0x9fff, 0x2e80, 0x2eff, 0x2f00, 0x2fdf, 0x2ff0, 0x2fff, 0x3400,
    0x4dbf, 0x20000, 0x2a6df, 0x3190, 0x319f,
  ], // 59 - CJK Unified Ideographs - CJK Radicals Supplement - Kangxi Radicals - Ideographic Description Characters - CJK Unified Ideographs Extension A - CJK Unified Ideographs Extension B - Kanbun
  [0xe000, 0xf8ff], // 60 - Private Use Area (plane 0)
  [0x31c0, 0x31ef, 0xf900, 0xfaff, 0x2f800, 0x2fa1f], // 61 - CJK Strokes - CJK Compatibility Ideographs - CJK Compatibility Ideographs Supplement
  [0xfb00, 0xfb4f], // 62 - Alphabetic Presentation Forms
  [0xfb50, 0xfdff], // 63 - Arabic Presentation Forms-A
  [0xfe20, 0xfe2f], // 64 - Combining Half Marks
  [0xfe10, 0xfe1f], // 65 - Vertical Forms
  [0xfe50, 0xfe6f], // 66 - Small Form Variants
  [0xfe70, 0xfeff], // 67 - Arabic Presentation Forms-B
  [0xff00, 0xffef], // 68 - Halfwidth And Fullwidth Forms
  [0xfff0, 0xffff], // 69 - Specials
  [0x0f00, 0x0fff], // 70 - Tibetan
  [0x0700, 0x074f], // 71 - Syriac
  [0x0780, 0x07bf], // 72 - Thaana
  [0x0d80, 0x0dff], // 73 - Sinhala
  [0x1000, 0x109f], // 74 - Myanmar
  [0x1200, 0x137f, 0x1380, 0x139f, 0x2d80, 0x2ddf], // 75 - Ethiopic - Ethiopic Supplement - Ethiopic Extended
  [0x13a0, 0x13ff], // 76 - Cherokee
  [0x1400, 0x167f], // 77 - Unified Canadian Aboriginal Syllabics
  [0x1680, 0x169f], // 78 - Ogham
  [0x16a0, 0x16ff], // 79 - Runic
  [0x1780, 0x17ff], // 80 - Khmer
  [0x1800, 0x18af], // 81 - Mongolian
  [0x2800, 0x28ff], // 82 - Braille Patterns
  [0xa000, 0xa48f], // 83 - Yi Syllables
  [0x1700, 0x171f, 0x1720, 0x173f, 0x1740, 0x175f, 0x1760, 0x177f], // 84 - Tagalog - Hanunoo - Buhid - Tagbanwa
  [0x10300, 0x1032f], // 85 - Old Italic
  [0x10330, 0x1034f], // 86 - Gothic
  [0x10400, 0x1044f], // 87 - Deseret
  [0x1d000, 0x1d0ff, 0x1d100, 0x1d1ff, 0x1d200, 0x1d24f], // 88 - Byzantine Musical Symbols - Musical Symbols - Ancient Greek Musical Notation
  [0x1d400, 0x1d7ff], // 89 - Mathematical Alphanumeric Symbols
  [0xff000, 0xffffd], // 90 - Private Use (plane 15)
  [0xfe00, 0xfe0f, 0xe0100, 0xe01ef], // 91 - Variation Selectors - Variation Selectors Supplement
  [0xe0000, 0xe007f], // 92 - Tags
  [0x1900, 0x194f], // 93 - Limbu
  [0x1950, 0x197f], // 94 - Tai Le
  [0x1980, 0x19df], // 95 - New Tai Lue
  [0x1a00, 0x1a1f], // 96 - Buginese
  [0x2c00, 0x2c5f], // 97 - Glagolitic
  [0x2d30, 0x2d7f], // 98 - Tifinagh
  [0x4dc0, 0x4dff], // 99 - Yijing Hexagram Symbols
  [0xa800, 0xa82f], // 100 - Syloti Nagri
  [0x10000, 0x1007f, 0x10080, 0x100ff, 0x10100, 0x1013f], // 101 - Linear B Syllabary - Linear B Ideograms - Aegean Numbers
  [0x10140, 0x1018f], // 102 - Ancient Greek Numbers
  [0x10380, 0x1039f], // 103 - Ugaritic
  [0x103a0, 0x103df], // 104 - Old Persian
  [0x10450, 0x1047f], // 105 - Shavian
  [0x10480, 0x104af], // 106 - Osmanya
  [0x10800, 0x1083f], // 107 - Cypriot Syllabary
  [0x10a00, 0x10a5f], // 108 - Kharoshthi
  [0x1d300, 0x1d35f], // 109 - Tai Xuan Jing Symbols
  [0x12000, 0x123ff, 0x12400, 0x1247f], // 110 - Cuneiform - Cuneiform Numbers and Punctuation
  [0x1d360, 0x1d37f], // 111 - Counting Rod Numerals
  [0x1b80, 0x1bbf], // 112 - Sundanese
  [0x1c00, 0x1c4f], // 113 - Lepcha
  [0x1c50, 0x1c7f], // 114 - Ol Chiki
  [0xa880, 0xa8df], // 115 - Saurashtra
  [0xa900, 0xa92f], // 116 - Kayah Li
  [0xa930, 0xa95f], // 117 - Rejang
  [0xaa00, 0xaa5f], // 118 - Cham
  [0x10190, 0x101cf], // 119 - Ancient Symbols
  [0x101d0, 0x101ff], // 120 - Phaistos Disc
  [0x102a0, 0x102df, 0x10280, 0x1029f, 0x10920, 0x1093f], // 121 - Carian - Lycian - Lydian
  [0x1f030, 0x1f09f, 0x1f000, 0x1f02f], // 122 - Domino Tiles - Mahjong Tiles
];

function getUnicodeRangeFor(value, lastPosition = -1) {
  // TODO: create a map range => position, sort the ranges and cache it.
  // Then we can make a binary search for finding a range for a given unicode.
  if (lastPosition !== -1) {
    const range = UnicodeRanges[lastPosition];
    for (let i = 0, ii = range.length; i < ii; i += 2) {
      if (value >= range[i] && value <= range[i + 1]) {
        return lastPosition;
      }
    }
  }
  for (let i = 0, ii = UnicodeRanges.length; i < ii; i++) {
    const range = UnicodeRanges[i];
    for (let j = 0, jj = range.length; j < jj; j += 2) {
      if (value >= range[j] && value <= range[j + 1]) {
        return i;
      }
    }
  }
  return -1;
}

const SpecialCharRegExp = new RegExp("^(\\s)|(\\p{Mn})|(\\p{Cf})$", "u");
const CategoryCache = new Map();

function getCharUnicodeCategory(char) {
  const cachedCategory = CategoryCache.get(char);
  if (cachedCategory) {
    return cachedCategory;
  }
  const groups = char.match(SpecialCharRegExp);
  const category = {
    isWhitespace: !!groups?.[1],
    isZeroWidthDiacritic: !!groups?.[2],
    isInvisibleFormatMark: !!groups?.[3],
  };
  CategoryCache.set(char, category);
  return category;
}

function clearUnicodeCaches() {
  CategoryCache.clear();
}

export {
  clearUnicodeCaches,
  getCharUnicodeCategory,
  getUnicodeForGlyph,
  getUnicodeRangeFor,
  mapSpecialUnicodeValues,
};
