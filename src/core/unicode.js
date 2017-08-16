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
/* no-babel-preset */

var getLookupTableFactory = require('../shared/util').getLookupTableFactory;

// Some characters, e.g. copyrightserif, are mapped to the private use area
// and might not be displayed using standard fonts. Mapping/hacking well-known
// chars to the similar equivalents in the normal characters range.
var getSpecialPUASymbols = getLookupTableFactory(function (t) {
  t[63721] = 0x00A9; // copyrightsans (0xF8E9) => copyright
  t[63193] = 0x00A9; // copyrightserif (0xF6D9) => copyright
  t[63720] = 0x00AE; // registersans (0xF8E8) => registered
  t[63194] = 0x00AE; // registerserif (0xF6DA) => registered
  t[63722] = 0x2122; // trademarksans (0xF8EA) => trademark
  t[63195] = 0x2122; // trademarkserif (0xF6DB) => trademark
  t[63729] = 0x23A7; // bracelefttp (0xF8F1)
  t[63730] = 0x23A8; // braceleftmid (0xF8F2)
  t[63731] = 0x23A9; // braceleftbt (0xF8F3)
  t[63740] = 0x23AB; // bracerighttp (0xF8FC)
  t[63741] = 0x23AC; // bracerightmid (0xF8FD)
  t[63742] = 0x23AD; // bracerightbt (0xF8FE)
  t[63726] = 0x23A1; // bracketlefttp (0xF8EE)
  t[63727] = 0x23A2; // bracketleftex (0xF8EF)
  t[63728] = 0x23A3; // bracketleftbt (0xF8F0)
  t[63737] = 0x23A4; // bracketrighttp (0xF8F9)
  t[63738] = 0x23A5; // bracketrightex (0xF8FA)
  t[63739] = 0x23A6; // bracketrightbt (0xF8FB)
  t[63723] = 0x239B; // parenlefttp (0xF8EB)
  t[63724] = 0x239C; // parenleftex (0xF8EC)
  t[63725] = 0x239D; // parenleftbt (0xF8ED)
  t[63734] = 0x239E; // parenrighttp (0xF8F6)
  t[63735] = 0x239F; // parenrightex (0xF8F7)
  t[63736] = 0x23A0; // parenrightbt (0xF8F8)
});

function mapSpecialUnicodeValues(code) {
  if (code >= 0xFFF0 && code <= 0xFFFF) { // Specials unicode block.
    return 0;
  } else if (code >= 0xF600 && code <= 0xF8FF) {
    return (getSpecialPUASymbols()[code] || code);
  }
  return code;
}

function getUnicodeForGlyph(name, glyphsUnicodeMap) {
  var unicode = glyphsUnicodeMap[name];
  if (unicode !== undefined) {
    return unicode;
  }
  if (!name) {
    return -1;
  }
  // Try to recover valid Unicode values from 'uniXXXX'/'uXXXX{XX}' glyphs.
  if (name[0] === 'u') {
    var nameLen = name.length, hexStr;

    if (nameLen === 7 && name[1] === 'n' && name[2] === 'i') { // 'uniXXXX'
      hexStr = name.substr(3);
    } else if (nameLen >= 5 && nameLen <= 7) { // 'uXXXX{XX}'
      hexStr = name.substr(1);
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

var UnicodeRanges = [
  { 'begin': 0x0000, 'end': 0x007F, }, // Basic Latin
  { 'begin': 0x0080, 'end': 0x00FF, }, // Latin-1 Supplement
  { 'begin': 0x0100, 'end': 0x017F, }, // Latin Extended-A
  { 'begin': 0x0180, 'end': 0x024F, }, // Latin Extended-B
  { 'begin': 0x0250, 'end': 0x02AF, }, // IPA Extensions
  { 'begin': 0x02B0, 'end': 0x02FF, }, // Spacing Modifier Letters
  { 'begin': 0x0300, 'end': 0x036F, }, // Combining Diacritical Marks
  { 'begin': 0x0370, 'end': 0x03FF, }, // Greek and Coptic
  { 'begin': 0x2C80, 'end': 0x2CFF, }, // Coptic
  { 'begin': 0x0400, 'end': 0x04FF, }, // Cyrillic
  { 'begin': 0x0530, 'end': 0x058F, }, // Armenian
  { 'begin': 0x0590, 'end': 0x05FF, }, // Hebrew
  { 'begin': 0xA500, 'end': 0xA63F, }, // Vai
  { 'begin': 0x0600, 'end': 0x06FF, }, // Arabic
  { 'begin': 0x07C0, 'end': 0x07FF, }, // NKo
  { 'begin': 0x0900, 'end': 0x097F, }, // Devanagari
  { 'begin': 0x0980, 'end': 0x09FF, }, // Bengali
  { 'begin': 0x0A00, 'end': 0x0A7F, }, // Gurmukhi
  { 'begin': 0x0A80, 'end': 0x0AFF, }, // Gujarati
  { 'begin': 0x0B00, 'end': 0x0B7F, }, // Oriya
  { 'begin': 0x0B80, 'end': 0x0BFF, }, // Tamil
  { 'begin': 0x0C00, 'end': 0x0C7F, }, // Telugu
  { 'begin': 0x0C80, 'end': 0x0CFF, }, // Kannada
  { 'begin': 0x0D00, 'end': 0x0D7F, }, // Malayalam
  { 'begin': 0x0E00, 'end': 0x0E7F, }, // Thai
  { 'begin': 0x0E80, 'end': 0x0EFF, }, // Lao
  { 'begin': 0x10A0, 'end': 0x10FF, }, // Georgian
  { 'begin': 0x1B00, 'end': 0x1B7F, }, // Balinese
  { 'begin': 0x1100, 'end': 0x11FF, }, // Hangul Jamo
  { 'begin': 0x1E00, 'end': 0x1EFF, }, // Latin Extended Additional
  { 'begin': 0x1F00, 'end': 0x1FFF, }, // Greek Extended
  { 'begin': 0x2000, 'end': 0x206F, }, // General Punctuation
  { 'begin': 0x2070, 'end': 0x209F, }, // Superscripts And Subscripts
  { 'begin': 0x20A0, 'end': 0x20CF, }, // Currency Symbol
  { 'begin': 0x20D0, 'end': 0x20FF, }, // Combining Diacritical Marks
  { 'begin': 0x2100, 'end': 0x214F, }, // Letterlike Symbols
  { 'begin': 0x2150, 'end': 0x218F, }, // Number Forms
  { 'begin': 0x2190, 'end': 0x21FF, }, // Arrows
  { 'begin': 0x2200, 'end': 0x22FF, }, // Mathematical Operators
  { 'begin': 0x2300, 'end': 0x23FF, }, // Miscellaneous Technical
  { 'begin': 0x2400, 'end': 0x243F, }, // Control Pictures
  { 'begin': 0x2440, 'end': 0x245F, }, // Optical Character Recognition
  { 'begin': 0x2460, 'end': 0x24FF, }, // Enclosed Alphanumerics
  { 'begin': 0x2500, 'end': 0x257F, }, // Box Drawing
  { 'begin': 0x2580, 'end': 0x259F, }, // Block Elements
  { 'begin': 0x25A0, 'end': 0x25FF, }, // Geometric Shapes
  { 'begin': 0x2600, 'end': 0x26FF, }, // Miscellaneous Symbols
  { 'begin': 0x2700, 'end': 0x27BF, }, // Dingbats
  { 'begin': 0x3000, 'end': 0x303F, }, // CJK Symbols And Punctuation
  { 'begin': 0x3040, 'end': 0x309F, }, // Hiragana
  { 'begin': 0x30A0, 'end': 0x30FF, }, // Katakana
  { 'begin': 0x3100, 'end': 0x312F, }, // Bopomofo
  { 'begin': 0x3130, 'end': 0x318F, }, // Hangul Compatibility Jamo
  { 'begin': 0xA840, 'end': 0xA87F, }, // Phags-pa
  { 'begin': 0x3200, 'end': 0x32FF, }, // Enclosed CJK Letters And Months
  { 'begin': 0x3300, 'end': 0x33FF, }, // CJK Compatibility
  { 'begin': 0xAC00, 'end': 0xD7AF, }, // Hangul Syllables
  { 'begin': 0xD800, 'end': 0xDFFF, }, // Non-Plane 0 *
  { 'begin': 0x10900, 'end': 0x1091F, }, // Phoenicia
  { 'begin': 0x4E00, 'end': 0x9FFF, }, // CJK Unified Ideographs
  { 'begin': 0xE000, 'end': 0xF8FF, }, // Private Use Area (plane 0)
  { 'begin': 0x31C0, 'end': 0x31EF, }, // CJK Strokes
  { 'begin': 0xFB00, 'end': 0xFB4F, }, // Alphabetic Presentation Forms
  { 'begin': 0xFB50, 'end': 0xFDFF, }, // Arabic Presentation Forms-A
  { 'begin': 0xFE20, 'end': 0xFE2F, }, // Combining Half Marks
  { 'begin': 0xFE10, 'end': 0xFE1F, }, // Vertical Forms
  { 'begin': 0xFE50, 'end': 0xFE6F, }, // Small Form Variants
  { 'begin': 0xFE70, 'end': 0xFEFF, }, // Arabic Presentation Forms-B
  { 'begin': 0xFF00, 'end': 0xFFEF, }, // Halfwidth And Fullwidth Forms
  { 'begin': 0xFFF0, 'end': 0xFFFF, }, // Specials
  { 'begin': 0x0F00, 'end': 0x0FFF, }, // Tibetan
  { 'begin': 0x0700, 'end': 0x074F, }, // Syriac
  { 'begin': 0x0780, 'end': 0x07BF, }, // Thaana
  { 'begin': 0x0D80, 'end': 0x0DFF, }, // Sinhala
  { 'begin': 0x1000, 'end': 0x109F, }, // Myanmar
  { 'begin': 0x1200, 'end': 0x137F, }, // Ethiopic
  { 'begin': 0x13A0, 'end': 0x13FF, }, // Cherokee
  { 'begin': 0x1400, 'end': 0x167F, }, // Unified Canadian Aboriginal Syllabics
  { 'begin': 0x1680, 'end': 0x169F, }, // Ogham
  { 'begin': 0x16A0, 'end': 0x16FF, }, // Runic
  { 'begin': 0x1780, 'end': 0x17FF, }, // Khmer
  { 'begin': 0x1800, 'end': 0x18AF, }, // Mongolian
  { 'begin': 0x2800, 'end': 0x28FF, }, // Braille Patterns
  { 'begin': 0xA000, 'end': 0xA48F, }, // Yi Syllables
  { 'begin': 0x1700, 'end': 0x171F, }, // Tagalog
  { 'begin': 0x10300, 'end': 0x1032F, }, // Old Italic
  { 'begin': 0x10330, 'end': 0x1034F, }, // Gothic
  { 'begin': 0x10400, 'end': 0x1044F, }, // Deseret
  { 'begin': 0x1D000, 'end': 0x1D0FF, }, // Byzantine Musical Symbols
  { 'begin': 0x1D400, 'end': 0x1D7FF, }, // Mathematical Alphanumeric Symbols
  { 'begin': 0xFF000, 'end': 0xFFFFD, }, // Private Use (plane 15)
  { 'begin': 0xFE00, 'end': 0xFE0F, }, // Variation Selectors
  { 'begin': 0xE0000, 'end': 0xE007F, }, // Tags
  { 'begin': 0x1900, 'end': 0x194F, }, // Limbu
  { 'begin': 0x1950, 'end': 0x197F, }, // Tai Le
  { 'begin': 0x1980, 'end': 0x19DF, }, // New Tai Lue
  { 'begin': 0x1A00, 'end': 0x1A1F, }, // Buginese
  { 'begin': 0x2C00, 'end': 0x2C5F, }, // Glagolitic
  { 'begin': 0x2D30, 'end': 0x2D7F, }, // Tifinagh
  { 'begin': 0x4DC0, 'end': 0x4DFF, }, // Yijing Hexagram Symbols
  { 'begin': 0xA800, 'end': 0xA82F, }, // Syloti Nagri
  { 'begin': 0x10000, 'end': 0x1007F, }, // Linear B Syllabary
  { 'begin': 0x10140, 'end': 0x1018F, }, // Ancient Greek Numbers
  { 'begin': 0x10380, 'end': 0x1039F, }, // Ugaritic
  { 'begin': 0x103A0, 'end': 0x103DF, }, // Old Persian
  { 'begin': 0x10450, 'end': 0x1047F, }, // Shavian
  { 'begin': 0x10480, 'end': 0x104AF, }, // Osmanya
  { 'begin': 0x10800, 'end': 0x1083F, }, // Cypriot Syllabary
  { 'begin': 0x10A00, 'end': 0x10A5F, }, // Kharoshthi
  { 'begin': 0x1D300, 'end': 0x1D35F, }, // Tai Xuan Jing Symbols
  { 'begin': 0x12000, 'end': 0x123FF, }, // Cuneiform
  { 'begin': 0x1D360, 'end': 0x1D37F, }, // Counting Rod Numerals
  { 'begin': 0x1B80, 'end': 0x1BBF, }, // Sundanese
  { 'begin': 0x1C00, 'end': 0x1C4F, }, // Lepcha
  { 'begin': 0x1C50, 'end': 0x1C7F, }, // Ol Chiki
  { 'begin': 0xA880, 'end': 0xA8DF, }, // Saurashtra
  { 'begin': 0xA900, 'end': 0xA92F, }, // Kayah Li
  { 'begin': 0xA930, 'end': 0xA95F, }, // Rejang
  { 'begin': 0xAA00, 'end': 0xAA5F, }, // Cham
  { 'begin': 0x10190, 'end': 0x101CF, }, // Ancient Symbols
  { 'begin': 0x101D0, 'end': 0x101FF, }, // Phaistos Disc
  { 'begin': 0x102A0, 'end': 0x102DF, }, // Carian
  { 'begin': 0x1F030, 'end': 0x1F09F, }  // Domino Tiles
];

function getUnicodeRangeFor(value) {
  for (var i = 0, ii = UnicodeRanges.length; i < ii; i++) {
    var range = UnicodeRanges[i];
    if (value >= range.begin && value < range.end) {
      return i;
    }
  }
  return -1;
}

function isRTLRangeFor(value) {
  var range = UnicodeRanges[13];
  if (value >= range.begin && value < range.end) {
    return true;
  }
  range = UnicodeRanges[11];
  if (value >= range.begin && value < range.end) {
    return true;
  }
  return false;
}

// The normalization table is obtained by filtering the Unicode characters
// database with <compat> entries.
var getNormalizedUnicodes = getLookupTableFactory(function (t) {
  t['\u00A8'] = '\u0020\u0308';
  t['\u00AF'] = '\u0020\u0304';
  t['\u00B4'] = '\u0020\u0301';
  t['\u00B5'] = '\u03BC';
  t['\u00B8'] = '\u0020\u0327';
  t['\u0132'] = '\u0049\u004A';
  t['\u0133'] = '\u0069\u006A';
  t['\u013F'] = '\u004C\u00B7';
  t['\u0140'] = '\u006C\u00B7';
  t['\u0149'] = '\u02BC\u006E';
  t['\u017F'] = '\u0073';
  t['\u01C4'] = '\u0044\u017D';
  t['\u01C5'] = '\u0044\u017E';
  t['\u01C6'] = '\u0064\u017E';
  t['\u01C7'] = '\u004C\u004A';
  t['\u01C8'] = '\u004C\u006A';
  t['\u01C9'] = '\u006C\u006A';
  t['\u01CA'] = '\u004E\u004A';
  t['\u01CB'] = '\u004E\u006A';
  t['\u01CC'] = '\u006E\u006A';
  t['\u01F1'] = '\u0044\u005A';
  t['\u01F2'] = '\u0044\u007A';
  t['\u01F3'] = '\u0064\u007A';
  t['\u02D8'] = '\u0020\u0306';
  t['\u02D9'] = '\u0020\u0307';
  t['\u02DA'] = '\u0020\u030A';
  t['\u02DB'] = '\u0020\u0328';
  t['\u02DC'] = '\u0020\u0303';
  t['\u02DD'] = '\u0020\u030B';
  t['\u037A'] = '\u0020\u0345';
  t['\u0384'] = '\u0020\u0301';
  t['\u03D0'] = '\u03B2';
  t['\u03D1'] = '\u03B8';
  t['\u03D2'] = '\u03A5';
  t['\u03D5'] = '\u03C6';
  t['\u03D6'] = '\u03C0';
  t['\u03F0'] = '\u03BA';
  t['\u03F1'] = '\u03C1';
  t['\u03F2'] = '\u03C2';
  t['\u03F4'] = '\u0398';
  t['\u03F5'] = '\u03B5';
  t['\u03F9'] = '\u03A3';
  t['\u0587'] = '\u0565\u0582';
  t['\u0675'] = '\u0627\u0674';
  t['\u0676'] = '\u0648\u0674';
  t['\u0677'] = '\u06C7\u0674';
  t['\u0678'] = '\u064A\u0674';
  t['\u0E33'] = '\u0E4D\u0E32';
  t['\u0EB3'] = '\u0ECD\u0EB2';
  t['\u0EDC'] = '\u0EAB\u0E99';
  t['\u0EDD'] = '\u0EAB\u0EA1';
  t['\u0F77'] = '\u0FB2\u0F81';
  t['\u0F79'] = '\u0FB3\u0F81';
  t['\u1E9A'] = '\u0061\u02BE';
  t['\u1FBD'] = '\u0020\u0313';
  t['\u1FBF'] = '\u0020\u0313';
  t['\u1FC0'] = '\u0020\u0342';
  t['\u1FFE'] = '\u0020\u0314';
  t['\u2002'] = '\u0020';
  t['\u2003'] = '\u0020';
  t['\u2004'] = '\u0020';
  t['\u2005'] = '\u0020';
  t['\u2006'] = '\u0020';
  t['\u2008'] = '\u0020';
  t['\u2009'] = '\u0020';
  t['\u200A'] = '\u0020';
  t['\u2017'] = '\u0020\u0333';
  t['\u2024'] = '\u002E';
  t['\u2025'] = '\u002E\u002E';
  t['\u2026'] = '\u002E\u002E\u002E';
  t['\u2033'] = '\u2032\u2032';
  t['\u2034'] = '\u2032\u2032\u2032';
  t['\u2036'] = '\u2035\u2035';
  t['\u2037'] = '\u2035\u2035\u2035';
  t['\u203C'] = '\u0021\u0021';
  t['\u203E'] = '\u0020\u0305';
  t['\u2047'] = '\u003F\u003F';
  t['\u2048'] = '\u003F\u0021';
  t['\u2049'] = '\u0021\u003F';
  t['\u2057'] = '\u2032\u2032\u2032\u2032';
  t['\u205F'] = '\u0020';
  t['\u20A8'] = '\u0052\u0073';
  t['\u2100'] = '\u0061\u002F\u0063';
  t['\u2101'] = '\u0061\u002F\u0073';
  t['\u2103'] = '\u00B0\u0043';
  t['\u2105'] = '\u0063\u002F\u006F';
  t['\u2106'] = '\u0063\u002F\u0075';
  t['\u2107'] = '\u0190';
  t['\u2109'] = '\u00B0\u0046';
  t['\u2116'] = '\u004E\u006F';
  t['\u2121'] = '\u0054\u0045\u004C';
  t['\u2135'] = '\u05D0';
  t['\u2136'] = '\u05D1';
  t['\u2137'] = '\u05D2';
  t['\u2138'] = '\u05D3';
  t['\u213B'] = '\u0046\u0041\u0058';
  t['\u2160'] = '\u0049';
  t['\u2161'] = '\u0049\u0049';
  t['\u2162'] = '\u0049\u0049\u0049';
  t['\u2163'] = '\u0049\u0056';
  t['\u2164'] = '\u0056';
  t['\u2165'] = '\u0056\u0049';
  t['\u2166'] = '\u0056\u0049\u0049';
  t['\u2167'] = '\u0056\u0049\u0049\u0049';
  t['\u2168'] = '\u0049\u0058';
  t['\u2169'] = '\u0058';
  t['\u216A'] = '\u0058\u0049';
  t['\u216B'] = '\u0058\u0049\u0049';
  t['\u216C'] = '\u004C';
  t['\u216D'] = '\u0043';
  t['\u216E'] = '\u0044';
  t['\u216F'] = '\u004D';
  t['\u2170'] = '\u0069';
  t['\u2171'] = '\u0069\u0069';
  t['\u2172'] = '\u0069\u0069\u0069';
  t['\u2173'] = '\u0069\u0076';
  t['\u2174'] = '\u0076';
  t['\u2175'] = '\u0076\u0069';
  t['\u2176'] = '\u0076\u0069\u0069';
  t['\u2177'] = '\u0076\u0069\u0069\u0069';
  t['\u2178'] = '\u0069\u0078';
  t['\u2179'] = '\u0078';
  t['\u217A'] = '\u0078\u0069';
  t['\u217B'] = '\u0078\u0069\u0069';
  t['\u217C'] = '\u006C';
  t['\u217D'] = '\u0063';
  t['\u217E'] = '\u0064';
  t['\u217F'] = '\u006D';
  t['\u222C'] = '\u222B\u222B';
  t['\u222D'] = '\u222B\u222B\u222B';
  t['\u222F'] = '\u222E\u222E';
  t['\u2230'] = '\u222E\u222E\u222E';
  t['\u2474'] = '\u0028\u0031\u0029';
  t['\u2475'] = '\u0028\u0032\u0029';
  t['\u2476'] = '\u0028\u0033\u0029';
  t['\u2477'] = '\u0028\u0034\u0029';
  t['\u2478'] = '\u0028\u0035\u0029';
  t['\u2479'] = '\u0028\u0036\u0029';
  t['\u247A'] = '\u0028\u0037\u0029';
  t['\u247B'] = '\u0028\u0038\u0029';
  t['\u247C'] = '\u0028\u0039\u0029';
  t['\u247D'] = '\u0028\u0031\u0030\u0029';
  t['\u247E'] = '\u0028\u0031\u0031\u0029';
  t['\u247F'] = '\u0028\u0031\u0032\u0029';
  t['\u2480'] = '\u0028\u0031\u0033\u0029';
  t['\u2481'] = '\u0028\u0031\u0034\u0029';
  t['\u2482'] = '\u0028\u0031\u0035\u0029';
  t['\u2483'] = '\u0028\u0031\u0036\u0029';
  t['\u2484'] = '\u0028\u0031\u0037\u0029';
  t['\u2485'] = '\u0028\u0031\u0038\u0029';
  t['\u2486'] = '\u0028\u0031\u0039\u0029';
  t['\u2487'] = '\u0028\u0032\u0030\u0029';
  t['\u2488'] = '\u0031\u002E';
  t['\u2489'] = '\u0032\u002E';
  t['\u248A'] = '\u0033\u002E';
  t['\u248B'] = '\u0034\u002E';
  t['\u248C'] = '\u0035\u002E';
  t['\u248D'] = '\u0036\u002E';
  t['\u248E'] = '\u0037\u002E';
  t['\u248F'] = '\u0038\u002E';
  t['\u2490'] = '\u0039\u002E';
  t['\u2491'] = '\u0031\u0030\u002E';
  t['\u2492'] = '\u0031\u0031\u002E';
  t['\u2493'] = '\u0031\u0032\u002E';
  t['\u2494'] = '\u0031\u0033\u002E';
  t['\u2495'] = '\u0031\u0034\u002E';
  t['\u2496'] = '\u0031\u0035\u002E';
  t['\u2497'] = '\u0031\u0036\u002E';
  t['\u2498'] = '\u0031\u0037\u002E';
  t['\u2499'] = '\u0031\u0038\u002E';
  t['\u249A'] = '\u0031\u0039\u002E';
  t['\u249B'] = '\u0032\u0030\u002E';
  t['\u249C'] = '\u0028\u0061\u0029';
  t['\u249D'] = '\u0028\u0062\u0029';
  t['\u249E'] = '\u0028\u0063\u0029';
  t['\u249F'] = '\u0028\u0064\u0029';
  t['\u24A0'] = '\u0028\u0065\u0029';
  t['\u24A1'] = '\u0028\u0066\u0029';
  t['\u24A2'] = '\u0028\u0067\u0029';
  t['\u24A3'] = '\u0028\u0068\u0029';
  t['\u24A4'] = '\u0028\u0069\u0029';
  t['\u24A5'] = '\u0028\u006A\u0029';
  t['\u24A6'] = '\u0028\u006B\u0029';
  t['\u24A7'] = '\u0028\u006C\u0029';
  t['\u24A8'] = '\u0028\u006D\u0029';
  t['\u24A9'] = '\u0028\u006E\u0029';
  t['\u24AA'] = '\u0028\u006F\u0029';
  t['\u24AB'] = '\u0028\u0070\u0029';
  t['\u24AC'] = '\u0028\u0071\u0029';
  t['\u24AD'] = '\u0028\u0072\u0029';
  t['\u24AE'] = '\u0028\u0073\u0029';
  t['\u24AF'] = '\u0028\u0074\u0029';
  t['\u24B0'] = '\u0028\u0075\u0029';
  t['\u24B1'] = '\u0028\u0076\u0029';
  t['\u24B2'] = '\u0028\u0077\u0029';
  t['\u24B3'] = '\u0028\u0078\u0029';
  t['\u24B4'] = '\u0028\u0079\u0029';
  t['\u24B5'] = '\u0028\u007A\u0029';
  t['\u2A0C'] = '\u222B\u222B\u222B\u222B';
  t['\u2A74'] = '\u003A\u003A\u003D';
  t['\u2A75'] = '\u003D\u003D';
  t['\u2A76'] = '\u003D\u003D\u003D';
  t['\u2E9F'] = '\u6BCD';
  t['\u2EF3'] = '\u9F9F';
  t['\u2F00'] = '\u4E00';
  t['\u2F01'] = '\u4E28';
  t['\u2F02'] = '\u4E36';
  t['\u2F03'] = '\u4E3F';
  t['\u2F04'] = '\u4E59';
  t['\u2F05'] = '\u4E85';
  t['\u2F06'] = '\u4E8C';
  t['\u2F07'] = '\u4EA0';
  t['\u2F08'] = '\u4EBA';
  t['\u2F09'] = '\u513F';
  t['\u2F0A'] = '\u5165';
  t['\u2F0B'] = '\u516B';
  t['\u2F0C'] = '\u5182';
  t['\u2F0D'] = '\u5196';
  t['\u2F0E'] = '\u51AB';
  t['\u2F0F'] = '\u51E0';
  t['\u2F10'] = '\u51F5';
  t['\u2F11'] = '\u5200';
  t['\u2F12'] = '\u529B';
  t['\u2F13'] = '\u52F9';
  t['\u2F14'] = '\u5315';
  t['\u2F15'] = '\u531A';
  t['\u2F16'] = '\u5338';
  t['\u2F17'] = '\u5341';
  t['\u2F18'] = '\u535C';
  t['\u2F19'] = '\u5369';
  t['\u2F1A'] = '\u5382';
  t['\u2F1B'] = '\u53B6';
  t['\u2F1C'] = '\u53C8';
  t['\u2F1D'] = '\u53E3';
  t['\u2F1E'] = '\u56D7';
  t['\u2F1F'] = '\u571F';
  t['\u2F20'] = '\u58EB';
  t['\u2F21'] = '\u5902';
  t['\u2F22'] = '\u590A';
  t['\u2F23'] = '\u5915';
  t['\u2F24'] = '\u5927';
  t['\u2F25'] = '\u5973';
  t['\u2F26'] = '\u5B50';
  t['\u2F27'] = '\u5B80';
  t['\u2F28'] = '\u5BF8';
  t['\u2F29'] = '\u5C0F';
  t['\u2F2A'] = '\u5C22';
  t['\u2F2B'] = '\u5C38';
  t['\u2F2C'] = '\u5C6E';
  t['\u2F2D'] = '\u5C71';
  t['\u2F2E'] = '\u5DDB';
  t['\u2F2F'] = '\u5DE5';
  t['\u2F30'] = '\u5DF1';
  t['\u2F31'] = '\u5DFE';
  t['\u2F32'] = '\u5E72';
  t['\u2F33'] = '\u5E7A';
  t['\u2F34'] = '\u5E7F';
  t['\u2F35'] = '\u5EF4';
  t['\u2F36'] = '\u5EFE';
  t['\u2F37'] = '\u5F0B';
  t['\u2F38'] = '\u5F13';
  t['\u2F39'] = '\u5F50';
  t['\u2F3A'] = '\u5F61';
  t['\u2F3B'] = '\u5F73';
  t['\u2F3C'] = '\u5FC3';
  t['\u2F3D'] = '\u6208';
  t['\u2F3E'] = '\u6236';
  t['\u2F3F'] = '\u624B';
  t['\u2F40'] = '\u652F';
  t['\u2F41'] = '\u6534';
  t['\u2F42'] = '\u6587';
  t['\u2F43'] = '\u6597';
  t['\u2F44'] = '\u65A4';
  t['\u2F45'] = '\u65B9';
  t['\u2F46'] = '\u65E0';
  t['\u2F47'] = '\u65E5';
  t['\u2F48'] = '\u66F0';
  t['\u2F49'] = '\u6708';
  t['\u2F4A'] = '\u6728';
  t['\u2F4B'] = '\u6B20';
  t['\u2F4C'] = '\u6B62';
  t['\u2F4D'] = '\u6B79';
  t['\u2F4E'] = '\u6BB3';
  t['\u2F4F'] = '\u6BCB';
  t['\u2F50'] = '\u6BD4';
  t['\u2F51'] = '\u6BDB';
  t['\u2F52'] = '\u6C0F';
  t['\u2F53'] = '\u6C14';
  t['\u2F54'] = '\u6C34';
  t['\u2F55'] = '\u706B';
  t['\u2F56'] = '\u722A';
  t['\u2F57'] = '\u7236';
  t['\u2F58'] = '\u723B';
  t['\u2F59'] = '\u723F';
  t['\u2F5A'] = '\u7247';
  t['\u2F5B'] = '\u7259';
  t['\u2F5C'] = '\u725B';
  t['\u2F5D'] = '\u72AC';
  t['\u2F5E'] = '\u7384';
  t['\u2F5F'] = '\u7389';
  t['\u2F60'] = '\u74DC';
  t['\u2F61'] = '\u74E6';
  t['\u2F62'] = '\u7518';
  t['\u2F63'] = '\u751F';
  t['\u2F64'] = '\u7528';
  t['\u2F65'] = '\u7530';
  t['\u2F66'] = '\u758B';
  t['\u2F67'] = '\u7592';
  t['\u2F68'] = '\u7676';
  t['\u2F69'] = '\u767D';
  t['\u2F6A'] = '\u76AE';
  t['\u2F6B'] = '\u76BF';
  t['\u2F6C'] = '\u76EE';
  t['\u2F6D'] = '\u77DB';
  t['\u2F6E'] = '\u77E2';
  t['\u2F6F'] = '\u77F3';
  t['\u2F70'] = '\u793A';
  t['\u2F71'] = '\u79B8';
  t['\u2F72'] = '\u79BE';
  t['\u2F73'] = '\u7A74';
  t['\u2F74'] = '\u7ACB';
  t['\u2F75'] = '\u7AF9';
  t['\u2F76'] = '\u7C73';
  t['\u2F77'] = '\u7CF8';
  t['\u2F78'] = '\u7F36';
  t['\u2F79'] = '\u7F51';
  t['\u2F7A'] = '\u7F8A';
  t['\u2F7B'] = '\u7FBD';
  t['\u2F7C'] = '\u8001';
  t['\u2F7D'] = '\u800C';
  t['\u2F7E'] = '\u8012';
  t['\u2F7F'] = '\u8033';
  t['\u2F80'] = '\u807F';
  t['\u2F81'] = '\u8089';
  t['\u2F82'] = '\u81E3';
  t['\u2F83'] = '\u81EA';
  t['\u2F84'] = '\u81F3';
  t['\u2F85'] = '\u81FC';
  t['\u2F86'] = '\u820C';
  t['\u2F87'] = '\u821B';
  t['\u2F88'] = '\u821F';
  t['\u2F89'] = '\u826E';
  t['\u2F8A'] = '\u8272';
  t['\u2F8B'] = '\u8278';
  t['\u2F8C'] = '\u864D';
  t['\u2F8D'] = '\u866B';
  t['\u2F8E'] = '\u8840';
  t['\u2F8F'] = '\u884C';
  t['\u2F90'] = '\u8863';
  t['\u2F91'] = '\u897E';
  t['\u2F92'] = '\u898B';
  t['\u2F93'] = '\u89D2';
  t['\u2F94'] = '\u8A00';
  t['\u2F95'] = '\u8C37';
  t['\u2F96'] = '\u8C46';
  t['\u2F97'] = '\u8C55';
  t['\u2F98'] = '\u8C78';
  t['\u2F99'] = '\u8C9D';
  t['\u2F9A'] = '\u8D64';
  t['\u2F9B'] = '\u8D70';
  t['\u2F9C'] = '\u8DB3';
  t['\u2F9D'] = '\u8EAB';
  t['\u2F9E'] = '\u8ECA';
  t['\u2F9F'] = '\u8F9B';
  t['\u2FA0'] = '\u8FB0';
  t['\u2FA1'] = '\u8FB5';
  t['\u2FA2'] = '\u9091';
  t['\u2FA3'] = '\u9149';
  t['\u2FA4'] = '\u91C6';
  t['\u2FA5'] = '\u91CC';
  t['\u2FA6'] = '\u91D1';
  t['\u2FA7'] = '\u9577';
  t['\u2FA8'] = '\u9580';
  t['\u2FA9'] = '\u961C';
  t['\u2FAA'] = '\u96B6';
  t['\u2FAB'] = '\u96B9';
  t['\u2FAC'] = '\u96E8';
  t['\u2FAD'] = '\u9751';
  t['\u2FAE'] = '\u975E';
  t['\u2FAF'] = '\u9762';
  t['\u2FB0'] = '\u9769';
  t['\u2FB1'] = '\u97CB';
  t['\u2FB2'] = '\u97ED';
  t['\u2FB3'] = '\u97F3';
  t['\u2FB4'] = '\u9801';
  t['\u2FB5'] = '\u98A8';
  t['\u2FB6'] = '\u98DB';
  t['\u2FB7'] = '\u98DF';
  t['\u2FB8'] = '\u9996';
  t['\u2FB9'] = '\u9999';
  t['\u2FBA'] = '\u99AC';
  t['\u2FBB'] = '\u9AA8';
  t['\u2FBC'] = '\u9AD8';
  t['\u2FBD'] = '\u9ADF';
  t['\u2FBE'] = '\u9B25';
  t['\u2FBF'] = '\u9B2F';
  t['\u2FC0'] = '\u9B32';
  t['\u2FC1'] = '\u9B3C';
  t['\u2FC2'] = '\u9B5A';
  t['\u2FC3'] = '\u9CE5';
  t['\u2FC4'] = '\u9E75';
  t['\u2FC5'] = '\u9E7F';
  t['\u2FC6'] = '\u9EA5';
  t['\u2FC7'] = '\u9EBB';
  t['\u2FC8'] = '\u9EC3';
  t['\u2FC9'] = '\u9ECD';
  t['\u2FCA'] = '\u9ED1';
  t['\u2FCB'] = '\u9EF9';
  t['\u2FCC'] = '\u9EFD';
  t['\u2FCD'] = '\u9F0E';
  t['\u2FCE'] = '\u9F13';
  t['\u2FCF'] = '\u9F20';
  t['\u2FD0'] = '\u9F3B';
  t['\u2FD1'] = '\u9F4A';
  t['\u2FD2'] = '\u9F52';
  t['\u2FD3'] = '\u9F8D';
  t['\u2FD4'] = '\u9F9C';
  t['\u2FD5'] = '\u9FA0';
  t['\u3036'] = '\u3012';
  t['\u3038'] = '\u5341';
  t['\u3039'] = '\u5344';
  t['\u303A'] = '\u5345';
  t['\u309B'] = '\u0020\u3099';
  t['\u309C'] = '\u0020\u309A';
  t['\u3131'] = '\u1100';
  t['\u3132'] = '\u1101';
  t['\u3133'] = '\u11AA';
  t['\u3134'] = '\u1102';
  t['\u3135'] = '\u11AC';
  t['\u3136'] = '\u11AD';
  t['\u3137'] = '\u1103';
  t['\u3138'] = '\u1104';
  t['\u3139'] = '\u1105';
  t['\u313A'] = '\u11B0';
  t['\u313B'] = '\u11B1';
  t['\u313C'] = '\u11B2';
  t['\u313D'] = '\u11B3';
  t['\u313E'] = '\u11B4';
  t['\u313F'] = '\u11B5';
  t['\u3140'] = '\u111A';
  t['\u3141'] = '\u1106';
  t['\u3142'] = '\u1107';
  t['\u3143'] = '\u1108';
  t['\u3144'] = '\u1121';
  t['\u3145'] = '\u1109';
  t['\u3146'] = '\u110A';
  t['\u3147'] = '\u110B';
  t['\u3148'] = '\u110C';
  t['\u3149'] = '\u110D';
  t['\u314A'] = '\u110E';
  t['\u314B'] = '\u110F';
  t['\u314C'] = '\u1110';
  t['\u314D'] = '\u1111';
  t['\u314E'] = '\u1112';
  t['\u314F'] = '\u1161';
  t['\u3150'] = '\u1162';
  t['\u3151'] = '\u1163';
  t['\u3152'] = '\u1164';
  t['\u3153'] = '\u1165';
  t['\u3154'] = '\u1166';
  t['\u3155'] = '\u1167';
  t['\u3156'] = '\u1168';
  t['\u3157'] = '\u1169';
  t['\u3158'] = '\u116A';
  t['\u3159'] = '\u116B';
  t['\u315A'] = '\u116C';
  t['\u315B'] = '\u116D';
  t['\u315C'] = '\u116E';
  t['\u315D'] = '\u116F';
  t['\u315E'] = '\u1170';
  t['\u315F'] = '\u1171';
  t['\u3160'] = '\u1172';
  t['\u3161'] = '\u1173';
  t['\u3162'] = '\u1174';
  t['\u3163'] = '\u1175';
  t['\u3164'] = '\u1160';
  t['\u3165'] = '\u1114';
  t['\u3166'] = '\u1115';
  t['\u3167'] = '\u11C7';
  t['\u3168'] = '\u11C8';
  t['\u3169'] = '\u11CC';
  t['\u316A'] = '\u11CE';
  t['\u316B'] = '\u11D3';
  t['\u316C'] = '\u11D7';
  t['\u316D'] = '\u11D9';
  t['\u316E'] = '\u111C';
  t['\u316F'] = '\u11DD';
  t['\u3170'] = '\u11DF';
  t['\u3171'] = '\u111D';
  t['\u3172'] = '\u111E';
  t['\u3173'] = '\u1120';
  t['\u3174'] = '\u1122';
  t['\u3175'] = '\u1123';
  t['\u3176'] = '\u1127';
  t['\u3177'] = '\u1129';
  t['\u3178'] = '\u112B';
  t['\u3179'] = '\u112C';
  t['\u317A'] = '\u112D';
  t['\u317B'] = '\u112E';
  t['\u317C'] = '\u112F';
  t['\u317D'] = '\u1132';
  t['\u317E'] = '\u1136';
  t['\u317F'] = '\u1140';
  t['\u3180'] = '\u1147';
  t['\u3181'] = '\u114C';
  t['\u3182'] = '\u11F1';
  t['\u3183'] = '\u11F2';
  t['\u3184'] = '\u1157';
  t['\u3185'] = '\u1158';
  t['\u3186'] = '\u1159';
  t['\u3187'] = '\u1184';
  t['\u3188'] = '\u1185';
  t['\u3189'] = '\u1188';
  t['\u318A'] = '\u1191';
  t['\u318B'] = '\u1192';
  t['\u318C'] = '\u1194';
  t['\u318D'] = '\u119E';
  t['\u318E'] = '\u11A1';
  t['\u3200'] = '\u0028\u1100\u0029';
  t['\u3201'] = '\u0028\u1102\u0029';
  t['\u3202'] = '\u0028\u1103\u0029';
  t['\u3203'] = '\u0028\u1105\u0029';
  t['\u3204'] = '\u0028\u1106\u0029';
  t['\u3205'] = '\u0028\u1107\u0029';
  t['\u3206'] = '\u0028\u1109\u0029';
  t['\u3207'] = '\u0028\u110B\u0029';
  t['\u3208'] = '\u0028\u110C\u0029';
  t['\u3209'] = '\u0028\u110E\u0029';
  t['\u320A'] = '\u0028\u110F\u0029';
  t['\u320B'] = '\u0028\u1110\u0029';
  t['\u320C'] = '\u0028\u1111\u0029';
  t['\u320D'] = '\u0028\u1112\u0029';
  t['\u320E'] = '\u0028\u1100\u1161\u0029';
  t['\u320F'] = '\u0028\u1102\u1161\u0029';
  t['\u3210'] = '\u0028\u1103\u1161\u0029';
  t['\u3211'] = '\u0028\u1105\u1161\u0029';
  t['\u3212'] = '\u0028\u1106\u1161\u0029';
  t['\u3213'] = '\u0028\u1107\u1161\u0029';
  t['\u3214'] = '\u0028\u1109\u1161\u0029';
  t['\u3215'] = '\u0028\u110B\u1161\u0029';
  t['\u3216'] = '\u0028\u110C\u1161\u0029';
  t['\u3217'] = '\u0028\u110E\u1161\u0029';
  t['\u3218'] = '\u0028\u110F\u1161\u0029';
  t['\u3219'] = '\u0028\u1110\u1161\u0029';
  t['\u321A'] = '\u0028\u1111\u1161\u0029';
  t['\u321B'] = '\u0028\u1112\u1161\u0029';
  t['\u321C'] = '\u0028\u110C\u116E\u0029';
  t['\u321D'] = '\u0028\u110B\u1169\u110C\u1165\u11AB\u0029';
  t['\u321E'] = '\u0028\u110B\u1169\u1112\u116E\u0029';
  t['\u3220'] = '\u0028\u4E00\u0029';
  t['\u3221'] = '\u0028\u4E8C\u0029';
  t['\u3222'] = '\u0028\u4E09\u0029';
  t['\u3223'] = '\u0028\u56DB\u0029';
  t['\u3224'] = '\u0028\u4E94\u0029';
  t['\u3225'] = '\u0028\u516D\u0029';
  t['\u3226'] = '\u0028\u4E03\u0029';
  t['\u3227'] = '\u0028\u516B\u0029';
  t['\u3228'] = '\u0028\u4E5D\u0029';
  t['\u3229'] = '\u0028\u5341\u0029';
  t['\u322A'] = '\u0028\u6708\u0029';
  t['\u322B'] = '\u0028\u706B\u0029';
  t['\u322C'] = '\u0028\u6C34\u0029';
  t['\u322D'] = '\u0028\u6728\u0029';
  t['\u322E'] = '\u0028\u91D1\u0029';
  t['\u322F'] = '\u0028\u571F\u0029';
  t['\u3230'] = '\u0028\u65E5\u0029';
  t['\u3231'] = '\u0028\u682A\u0029';
  t['\u3232'] = '\u0028\u6709\u0029';
  t['\u3233'] = '\u0028\u793E\u0029';
  t['\u3234'] = '\u0028\u540D\u0029';
  t['\u3235'] = '\u0028\u7279\u0029';
  t['\u3236'] = '\u0028\u8CA1\u0029';
  t['\u3237'] = '\u0028\u795D\u0029';
  t['\u3238'] = '\u0028\u52B4\u0029';
  t['\u3239'] = '\u0028\u4EE3\u0029';
  t['\u323A'] = '\u0028\u547C\u0029';
  t['\u323B'] = '\u0028\u5B66\u0029';
  t['\u323C'] = '\u0028\u76E3\u0029';
  t['\u323D'] = '\u0028\u4F01\u0029';
  t['\u323E'] = '\u0028\u8CC7\u0029';
  t['\u323F'] = '\u0028\u5354\u0029';
  t['\u3240'] = '\u0028\u796D\u0029';
  t['\u3241'] = '\u0028\u4F11\u0029';
  t['\u3242'] = '\u0028\u81EA\u0029';
  t['\u3243'] = '\u0028\u81F3\u0029';
  t['\u32C0'] = '\u0031\u6708';
  t['\u32C1'] = '\u0032\u6708';
  t['\u32C2'] = '\u0033\u6708';
  t['\u32C3'] = '\u0034\u6708';
  t['\u32C4'] = '\u0035\u6708';
  t['\u32C5'] = '\u0036\u6708';
  t['\u32C6'] = '\u0037\u6708';
  t['\u32C7'] = '\u0038\u6708';
  t['\u32C8'] = '\u0039\u6708';
  t['\u32C9'] = '\u0031\u0030\u6708';
  t['\u32CA'] = '\u0031\u0031\u6708';
  t['\u32CB'] = '\u0031\u0032\u6708';
  t['\u3358'] = '\u0030\u70B9';
  t['\u3359'] = '\u0031\u70B9';
  t['\u335A'] = '\u0032\u70B9';
  t['\u335B'] = '\u0033\u70B9';
  t['\u335C'] = '\u0034\u70B9';
  t['\u335D'] = '\u0035\u70B9';
  t['\u335E'] = '\u0036\u70B9';
  t['\u335F'] = '\u0037\u70B9';
  t['\u3360'] = '\u0038\u70B9';
  t['\u3361'] = '\u0039\u70B9';
  t['\u3362'] = '\u0031\u0030\u70B9';
  t['\u3363'] = '\u0031\u0031\u70B9';
  t['\u3364'] = '\u0031\u0032\u70B9';
  t['\u3365'] = '\u0031\u0033\u70B9';
  t['\u3366'] = '\u0031\u0034\u70B9';
  t['\u3367'] = '\u0031\u0035\u70B9';
  t['\u3368'] = '\u0031\u0036\u70B9';
  t['\u3369'] = '\u0031\u0037\u70B9';
  t['\u336A'] = '\u0031\u0038\u70B9';
  t['\u336B'] = '\u0031\u0039\u70B9';
  t['\u336C'] = '\u0032\u0030\u70B9';
  t['\u336D'] = '\u0032\u0031\u70B9';
  t['\u336E'] = '\u0032\u0032\u70B9';
  t['\u336F'] = '\u0032\u0033\u70B9';
  t['\u3370'] = '\u0032\u0034\u70B9';
  t['\u33E0'] = '\u0031\u65E5';
  t['\u33E1'] = '\u0032\u65E5';
  t['\u33E2'] = '\u0033\u65E5';
  t['\u33E3'] = '\u0034\u65E5';
  t['\u33E4'] = '\u0035\u65E5';
  t['\u33E5'] = '\u0036\u65E5';
  t['\u33E6'] = '\u0037\u65E5';
  t['\u33E7'] = '\u0038\u65E5';
  t['\u33E8'] = '\u0039\u65E5';
  t['\u33E9'] = '\u0031\u0030\u65E5';
  t['\u33EA'] = '\u0031\u0031\u65E5';
  t['\u33EB'] = '\u0031\u0032\u65E5';
  t['\u33EC'] = '\u0031\u0033\u65E5';
  t['\u33ED'] = '\u0031\u0034\u65E5';
  t['\u33EE'] = '\u0031\u0035\u65E5';
  t['\u33EF'] = '\u0031\u0036\u65E5';
  t['\u33F0'] = '\u0031\u0037\u65E5';
  t['\u33F1'] = '\u0031\u0038\u65E5';
  t['\u33F2'] = '\u0031\u0039\u65E5';
  t['\u33F3'] = '\u0032\u0030\u65E5';
  t['\u33F4'] = '\u0032\u0031\u65E5';
  t['\u33F5'] = '\u0032\u0032\u65E5';
  t['\u33F6'] = '\u0032\u0033\u65E5';
  t['\u33F7'] = '\u0032\u0034\u65E5';
  t['\u33F8'] = '\u0032\u0035\u65E5';
  t['\u33F9'] = '\u0032\u0036\u65E5';
  t['\u33FA'] = '\u0032\u0037\u65E5';
  t['\u33FB'] = '\u0032\u0038\u65E5';
  t['\u33FC'] = '\u0032\u0039\u65E5';
  t['\u33FD'] = '\u0033\u0030\u65E5';
  t['\u33FE'] = '\u0033\u0031\u65E5';
  t['\uFB00'] = '\u0066\u0066';
  t['\uFB01'] = '\u0066\u0069';
  t['\uFB02'] = '\u0066\u006C';
  t['\uFB03'] = '\u0066\u0066\u0069';
  t['\uFB04'] = '\u0066\u0066\u006C';
  t['\uFB05'] = '\u017F\u0074';
  t['\uFB06'] = '\u0073\u0074';
  t['\uFB13'] = '\u0574\u0576';
  t['\uFB14'] = '\u0574\u0565';
  t['\uFB15'] = '\u0574\u056B';
  t['\uFB16'] = '\u057E\u0576';
  t['\uFB17'] = '\u0574\u056D';
  t['\uFB4F'] = '\u05D0\u05DC';
  t['\uFB50'] = '\u0671';
  t['\uFB51'] = '\u0671';
  t['\uFB52'] = '\u067B';
  t['\uFB53'] = '\u067B';
  t['\uFB54'] = '\u067B';
  t['\uFB55'] = '\u067B';
  t['\uFB56'] = '\u067E';
  t['\uFB57'] = '\u067E';
  t['\uFB58'] = '\u067E';
  t['\uFB59'] = '\u067E';
  t['\uFB5A'] = '\u0680';
  t['\uFB5B'] = '\u0680';
  t['\uFB5C'] = '\u0680';
  t['\uFB5D'] = '\u0680';
  t['\uFB5E'] = '\u067A';
  t['\uFB5F'] = '\u067A';
  t['\uFB60'] = '\u067A';
  t['\uFB61'] = '\u067A';
  t['\uFB62'] = '\u067F';
  t['\uFB63'] = '\u067F';
  t['\uFB64'] = '\u067F';
  t['\uFB65'] = '\u067F';
  t['\uFB66'] = '\u0679';
  t['\uFB67'] = '\u0679';
  t['\uFB68'] = '\u0679';
  t['\uFB69'] = '\u0679';
  t['\uFB6A'] = '\u06A4';
  t['\uFB6B'] = '\u06A4';
  t['\uFB6C'] = '\u06A4';
  t['\uFB6D'] = '\u06A4';
  t['\uFB6E'] = '\u06A6';
  t['\uFB6F'] = '\u06A6';
  t['\uFB70'] = '\u06A6';
  t['\uFB71'] = '\u06A6';
  t['\uFB72'] = '\u0684';
  t['\uFB73'] = '\u0684';
  t['\uFB74'] = '\u0684';
  t['\uFB75'] = '\u0684';
  t['\uFB76'] = '\u0683';
  t['\uFB77'] = '\u0683';
  t['\uFB78'] = '\u0683';
  t['\uFB79'] = '\u0683';
  t['\uFB7A'] = '\u0686';
  t['\uFB7B'] = '\u0686';
  t['\uFB7C'] = '\u0686';
  t['\uFB7D'] = '\u0686';
  t['\uFB7E'] = '\u0687';
  t['\uFB7F'] = '\u0687';
  t['\uFB80'] = '\u0687';
  t['\uFB81'] = '\u0687';
  t['\uFB82'] = '\u068D';
  t['\uFB83'] = '\u068D';
  t['\uFB84'] = '\u068C';
  t['\uFB85'] = '\u068C';
  t['\uFB86'] = '\u068E';
  t['\uFB87'] = '\u068E';
  t['\uFB88'] = '\u0688';
  t['\uFB89'] = '\u0688';
  t['\uFB8A'] = '\u0698';
  t['\uFB8B'] = '\u0698';
  t['\uFB8C'] = '\u0691';
  t['\uFB8D'] = '\u0691';
  t['\uFB8E'] = '\u06A9';
  t['\uFB8F'] = '\u06A9';
  t['\uFB90'] = '\u06A9';
  t['\uFB91'] = '\u06A9';
  t['\uFB92'] = '\u06AF';
  t['\uFB93'] = '\u06AF';
  t['\uFB94'] = '\u06AF';
  t['\uFB95'] = '\u06AF';
  t['\uFB96'] = '\u06B3';
  t['\uFB97'] = '\u06B3';
  t['\uFB98'] = '\u06B3';
  t['\uFB99'] = '\u06B3';
  t['\uFB9A'] = '\u06B1';
  t['\uFB9B'] = '\u06B1';
  t['\uFB9C'] = '\u06B1';
  t['\uFB9D'] = '\u06B1';
  t['\uFB9E'] = '\u06BA';
  t['\uFB9F'] = '\u06BA';
  t['\uFBA0'] = '\u06BB';
  t['\uFBA1'] = '\u06BB';
  t['\uFBA2'] = '\u06BB';
  t['\uFBA3'] = '\u06BB';
  t['\uFBA4'] = '\u06C0';
  t['\uFBA5'] = '\u06C0';
  t['\uFBA6'] = '\u06C1';
  t['\uFBA7'] = '\u06C1';
  t['\uFBA8'] = '\u06C1';
  t['\uFBA9'] = '\u06C1';
  t['\uFBAA'] = '\u06BE';
  t['\uFBAB'] = '\u06BE';
  t['\uFBAC'] = '\u06BE';
  t['\uFBAD'] = '\u06BE';
  t['\uFBAE'] = '\u06D2';
  t['\uFBAF'] = '\u06D2';
  t['\uFBB0'] = '\u06D3';
  t['\uFBB1'] = '\u06D3';
  t['\uFBD3'] = '\u06AD';
  t['\uFBD4'] = '\u06AD';
  t['\uFBD5'] = '\u06AD';
  t['\uFBD6'] = '\u06AD';
  t['\uFBD7'] = '\u06C7';
  t['\uFBD8'] = '\u06C7';
  t['\uFBD9'] = '\u06C6';
  t['\uFBDA'] = '\u06C6';
  t['\uFBDB'] = '\u06C8';
  t['\uFBDC'] = '\u06C8';
  t['\uFBDD'] = '\u0677';
  t['\uFBDE'] = '\u06CB';
  t['\uFBDF'] = '\u06CB';
  t['\uFBE0'] = '\u06C5';
  t['\uFBE1'] = '\u06C5';
  t['\uFBE2'] = '\u06C9';
  t['\uFBE3'] = '\u06C9';
  t['\uFBE4'] = '\u06D0';
  t['\uFBE5'] = '\u06D0';
  t['\uFBE6'] = '\u06D0';
  t['\uFBE7'] = '\u06D0';
  t['\uFBE8'] = '\u0649';
  t['\uFBE9'] = '\u0649';
  t['\uFBEA'] = '\u0626\u0627';
  t['\uFBEB'] = '\u0626\u0627';
  t['\uFBEC'] = '\u0626\u06D5';
  t['\uFBED'] = '\u0626\u06D5';
  t['\uFBEE'] = '\u0626\u0648';
  t['\uFBEF'] = '\u0626\u0648';
  t['\uFBF0'] = '\u0626\u06C7';
  t['\uFBF1'] = '\u0626\u06C7';
  t['\uFBF2'] = '\u0626\u06C6';
  t['\uFBF3'] = '\u0626\u06C6';
  t['\uFBF4'] = '\u0626\u06C8';
  t['\uFBF5'] = '\u0626\u06C8';
  t['\uFBF6'] = '\u0626\u06D0';
  t['\uFBF7'] = '\u0626\u06D0';
  t['\uFBF8'] = '\u0626\u06D0';
  t['\uFBF9'] = '\u0626\u0649';
  t['\uFBFA'] = '\u0626\u0649';
  t['\uFBFB'] = '\u0626\u0649';
  t['\uFBFC'] = '\u06CC';
  t['\uFBFD'] = '\u06CC';
  t['\uFBFE'] = '\u06CC';
  t['\uFBFF'] = '\u06CC';
  t['\uFC00'] = '\u0626\u062C';
  t['\uFC01'] = '\u0626\u062D';
  t['\uFC02'] = '\u0626\u0645';
  t['\uFC03'] = '\u0626\u0649';
  t['\uFC04'] = '\u0626\u064A';
  t['\uFC05'] = '\u0628\u062C';
  t['\uFC06'] = '\u0628\u062D';
  t['\uFC07'] = '\u0628\u062E';
  t['\uFC08'] = '\u0628\u0645';
  t['\uFC09'] = '\u0628\u0649';
  t['\uFC0A'] = '\u0628\u064A';
  t['\uFC0B'] = '\u062A\u062C';
  t['\uFC0C'] = '\u062A\u062D';
  t['\uFC0D'] = '\u062A\u062E';
  t['\uFC0E'] = '\u062A\u0645';
  t['\uFC0F'] = '\u062A\u0649';
  t['\uFC10'] = '\u062A\u064A';
  t['\uFC11'] = '\u062B\u062C';
  t['\uFC12'] = '\u062B\u0645';
  t['\uFC13'] = '\u062B\u0649';
  t['\uFC14'] = '\u062B\u064A';
  t['\uFC15'] = '\u062C\u062D';
  t['\uFC16'] = '\u062C\u0645';
  t['\uFC17'] = '\u062D\u062C';
  t['\uFC18'] = '\u062D\u0645';
  t['\uFC19'] = '\u062E\u062C';
  t['\uFC1A'] = '\u062E\u062D';
  t['\uFC1B'] = '\u062E\u0645';
  t['\uFC1C'] = '\u0633\u062C';
  t['\uFC1D'] = '\u0633\u062D';
  t['\uFC1E'] = '\u0633\u062E';
  t['\uFC1F'] = '\u0633\u0645';
  t['\uFC20'] = '\u0635\u062D';
  t['\uFC21'] = '\u0635\u0645';
  t['\uFC22'] = '\u0636\u062C';
  t['\uFC23'] = '\u0636\u062D';
  t['\uFC24'] = '\u0636\u062E';
  t['\uFC25'] = '\u0636\u0645';
  t['\uFC26'] = '\u0637\u062D';
  t['\uFC27'] = '\u0637\u0645';
  t['\uFC28'] = '\u0638\u0645';
  t['\uFC29'] = '\u0639\u062C';
  t['\uFC2A'] = '\u0639\u0645';
  t['\uFC2B'] = '\u063A\u062C';
  t['\uFC2C'] = '\u063A\u0645';
  t['\uFC2D'] = '\u0641\u062C';
  t['\uFC2E'] = '\u0641\u062D';
  t['\uFC2F'] = '\u0641\u062E';
  t['\uFC30'] = '\u0641\u0645';
  t['\uFC31'] = '\u0641\u0649';
  t['\uFC32'] = '\u0641\u064A';
  t['\uFC33'] = '\u0642\u062D';
  t['\uFC34'] = '\u0642\u0645';
  t['\uFC35'] = '\u0642\u0649';
  t['\uFC36'] = '\u0642\u064A';
  t['\uFC37'] = '\u0643\u0627';
  t['\uFC38'] = '\u0643\u062C';
  t['\uFC39'] = '\u0643\u062D';
  t['\uFC3A'] = '\u0643\u062E';
  t['\uFC3B'] = '\u0643\u0644';
  t['\uFC3C'] = '\u0643\u0645';
  t['\uFC3D'] = '\u0643\u0649';
  t['\uFC3E'] = '\u0643\u064A';
  t['\uFC3F'] = '\u0644\u062C';
  t['\uFC40'] = '\u0644\u062D';
  t['\uFC41'] = '\u0644\u062E';
  t['\uFC42'] = '\u0644\u0645';
  t['\uFC43'] = '\u0644\u0649';
  t['\uFC44'] = '\u0644\u064A';
  t['\uFC45'] = '\u0645\u062C';
  t['\uFC46'] = '\u0645\u062D';
  t['\uFC47'] = '\u0645\u062E';
  t['\uFC48'] = '\u0645\u0645';
  t['\uFC49'] = '\u0645\u0649';
  t['\uFC4A'] = '\u0645\u064A';
  t['\uFC4B'] = '\u0646\u062C';
  t['\uFC4C'] = '\u0646\u062D';
  t['\uFC4D'] = '\u0646\u062E';
  t['\uFC4E'] = '\u0646\u0645';
  t['\uFC4F'] = '\u0646\u0649';
  t['\uFC50'] = '\u0646\u064A';
  t['\uFC51'] = '\u0647\u062C';
  t['\uFC52'] = '\u0647\u0645';
  t['\uFC53'] = '\u0647\u0649';
  t['\uFC54'] = '\u0647\u064A';
  t['\uFC55'] = '\u064A\u062C';
  t['\uFC56'] = '\u064A\u062D';
  t['\uFC57'] = '\u064A\u062E';
  t['\uFC58'] = '\u064A\u0645';
  t['\uFC59'] = '\u064A\u0649';
  t['\uFC5A'] = '\u064A\u064A';
  t['\uFC5B'] = '\u0630\u0670';
  t['\uFC5C'] = '\u0631\u0670';
  t['\uFC5D'] = '\u0649\u0670';
  t['\uFC5E'] = '\u0020\u064C\u0651';
  t['\uFC5F'] = '\u0020\u064D\u0651';
  t['\uFC60'] = '\u0020\u064E\u0651';
  t['\uFC61'] = '\u0020\u064F\u0651';
  t['\uFC62'] = '\u0020\u0650\u0651';
  t['\uFC63'] = '\u0020\u0651\u0670';
  t['\uFC64'] = '\u0626\u0631';
  t['\uFC65'] = '\u0626\u0632';
  t['\uFC66'] = '\u0626\u0645';
  t['\uFC67'] = '\u0626\u0646';
  t['\uFC68'] = '\u0626\u0649';
  t['\uFC69'] = '\u0626\u064A';
  t['\uFC6A'] = '\u0628\u0631';
  t['\uFC6B'] = '\u0628\u0632';
  t['\uFC6C'] = '\u0628\u0645';
  t['\uFC6D'] = '\u0628\u0646';
  t['\uFC6E'] = '\u0628\u0649';
  t['\uFC6F'] = '\u0628\u064A';
  t['\uFC70'] = '\u062A\u0631';
  t['\uFC71'] = '\u062A\u0632';
  t['\uFC72'] = '\u062A\u0645';
  t['\uFC73'] = '\u062A\u0646';
  t['\uFC74'] = '\u062A\u0649';
  t['\uFC75'] = '\u062A\u064A';
  t['\uFC76'] = '\u062B\u0631';
  t['\uFC77'] = '\u062B\u0632';
  t['\uFC78'] = '\u062B\u0645';
  t['\uFC79'] = '\u062B\u0646';
  t['\uFC7A'] = '\u062B\u0649';
  t['\uFC7B'] = '\u062B\u064A';
  t['\uFC7C'] = '\u0641\u0649';
  t['\uFC7D'] = '\u0641\u064A';
  t['\uFC7E'] = '\u0642\u0649';
  t['\uFC7F'] = '\u0642\u064A';
  t['\uFC80'] = '\u0643\u0627';
  t['\uFC81'] = '\u0643\u0644';
  t['\uFC82'] = '\u0643\u0645';
  t['\uFC83'] = '\u0643\u0649';
  t['\uFC84'] = '\u0643\u064A';
  t['\uFC85'] = '\u0644\u0645';
  t['\uFC86'] = '\u0644\u0649';
  t['\uFC87'] = '\u0644\u064A';
  t['\uFC88'] = '\u0645\u0627';
  t['\uFC89'] = '\u0645\u0645';
  t['\uFC8A'] = '\u0646\u0631';
  t['\uFC8B'] = '\u0646\u0632';
  t['\uFC8C'] = '\u0646\u0645';
  t['\uFC8D'] = '\u0646\u0646';
  t['\uFC8E'] = '\u0646\u0649';
  t['\uFC8F'] = '\u0646\u064A';
  t['\uFC90'] = '\u0649\u0670';
  t['\uFC91'] = '\u064A\u0631';
  t['\uFC92'] = '\u064A\u0632';
  t['\uFC93'] = '\u064A\u0645';
  t['\uFC94'] = '\u064A\u0646';
  t['\uFC95'] = '\u064A\u0649';
  t['\uFC96'] = '\u064A\u064A';
  t['\uFC97'] = '\u0626\u062C';
  t['\uFC98'] = '\u0626\u062D';
  t['\uFC99'] = '\u0626\u062E';
  t['\uFC9A'] = '\u0626\u0645';
  t['\uFC9B'] = '\u0626\u0647';
  t['\uFC9C'] = '\u0628\u062C';
  t['\uFC9D'] = '\u0628\u062D';
  t['\uFC9E'] = '\u0628\u062E';
  t['\uFC9F'] = '\u0628\u0645';
  t['\uFCA0'] = '\u0628\u0647';
  t['\uFCA1'] = '\u062A\u062C';
  t['\uFCA2'] = '\u062A\u062D';
  t['\uFCA3'] = '\u062A\u062E';
  t['\uFCA4'] = '\u062A\u0645';
  t['\uFCA5'] = '\u062A\u0647';
  t['\uFCA6'] = '\u062B\u0645';
  t['\uFCA7'] = '\u062C\u062D';
  t['\uFCA8'] = '\u062C\u0645';
  t['\uFCA9'] = '\u062D\u062C';
  t['\uFCAA'] = '\u062D\u0645';
  t['\uFCAB'] = '\u062E\u062C';
  t['\uFCAC'] = '\u062E\u0645';
  t['\uFCAD'] = '\u0633\u062C';
  t['\uFCAE'] = '\u0633\u062D';
  t['\uFCAF'] = '\u0633\u062E';
  t['\uFCB0'] = '\u0633\u0645';
  t['\uFCB1'] = '\u0635\u062D';
  t['\uFCB2'] = '\u0635\u062E';
  t['\uFCB3'] = '\u0635\u0645';
  t['\uFCB4'] = '\u0636\u062C';
  t['\uFCB5'] = '\u0636\u062D';
  t['\uFCB6'] = '\u0636\u062E';
  t['\uFCB7'] = '\u0636\u0645';
  t['\uFCB8'] = '\u0637\u062D';
  t['\uFCB9'] = '\u0638\u0645';
  t['\uFCBA'] = '\u0639\u062C';
  t['\uFCBB'] = '\u0639\u0645';
  t['\uFCBC'] = '\u063A\u062C';
  t['\uFCBD'] = '\u063A\u0645';
  t['\uFCBE'] = '\u0641\u062C';
  t['\uFCBF'] = '\u0641\u062D';
  t['\uFCC0'] = '\u0641\u062E';
  t['\uFCC1'] = '\u0641\u0645';
  t['\uFCC2'] = '\u0642\u062D';
  t['\uFCC3'] = '\u0642\u0645';
  t['\uFCC4'] = '\u0643\u062C';
  t['\uFCC5'] = '\u0643\u062D';
  t['\uFCC6'] = '\u0643\u062E';
  t['\uFCC7'] = '\u0643\u0644';
  t['\uFCC8'] = '\u0643\u0645';
  t['\uFCC9'] = '\u0644\u062C';
  t['\uFCCA'] = '\u0644\u062D';
  t['\uFCCB'] = '\u0644\u062E';
  t['\uFCCC'] = '\u0644\u0645';
  t['\uFCCD'] = '\u0644\u0647';
  t['\uFCCE'] = '\u0645\u062C';
  t['\uFCCF'] = '\u0645\u062D';
  t['\uFCD0'] = '\u0645\u062E';
  t['\uFCD1'] = '\u0645\u0645';
  t['\uFCD2'] = '\u0646\u062C';
  t['\uFCD3'] = '\u0646\u062D';
  t['\uFCD4'] = '\u0646\u062E';
  t['\uFCD5'] = '\u0646\u0645';
  t['\uFCD6'] = '\u0646\u0647';
  t['\uFCD7'] = '\u0647\u062C';
  t['\uFCD8'] = '\u0647\u0645';
  t['\uFCD9'] = '\u0647\u0670';
  t['\uFCDA'] = '\u064A\u062C';
  t['\uFCDB'] = '\u064A\u062D';
  t['\uFCDC'] = '\u064A\u062E';
  t['\uFCDD'] = '\u064A\u0645';
  t['\uFCDE'] = '\u064A\u0647';
  t['\uFCDF'] = '\u0626\u0645';
  t['\uFCE0'] = '\u0626\u0647';
  t['\uFCE1'] = '\u0628\u0645';
  t['\uFCE2'] = '\u0628\u0647';
  t['\uFCE3'] = '\u062A\u0645';
  t['\uFCE4'] = '\u062A\u0647';
  t['\uFCE5'] = '\u062B\u0645';
  t['\uFCE6'] = '\u062B\u0647';
  t['\uFCE7'] = '\u0633\u0645';
  t['\uFCE8'] = '\u0633\u0647';
  t['\uFCE9'] = '\u0634\u0645';
  t['\uFCEA'] = '\u0634\u0647';
  t['\uFCEB'] = '\u0643\u0644';
  t['\uFCEC'] = '\u0643\u0645';
  t['\uFCED'] = '\u0644\u0645';
  t['\uFCEE'] = '\u0646\u0645';
  t['\uFCEF'] = '\u0646\u0647';
  t['\uFCF0'] = '\u064A\u0645';
  t['\uFCF1'] = '\u064A\u0647';
  t['\uFCF2'] = '\u0640\u064E\u0651';
  t['\uFCF3'] = '\u0640\u064F\u0651';
  t['\uFCF4'] = '\u0640\u0650\u0651';
  t['\uFCF5'] = '\u0637\u0649';
  t['\uFCF6'] = '\u0637\u064A';
  t['\uFCF7'] = '\u0639\u0649';
  t['\uFCF8'] = '\u0639\u064A';
  t['\uFCF9'] = '\u063A\u0649';
  t['\uFCFA'] = '\u063A\u064A';
  t['\uFCFB'] = '\u0633\u0649';
  t['\uFCFC'] = '\u0633\u064A';
  t['\uFCFD'] = '\u0634\u0649';
  t['\uFCFE'] = '\u0634\u064A';
  t['\uFCFF'] = '\u062D\u0649';
  t['\uFD00'] = '\u062D\u064A';
  t['\uFD01'] = '\u062C\u0649';
  t['\uFD02'] = '\u062C\u064A';
  t['\uFD03'] = '\u062E\u0649';
  t['\uFD04'] = '\u062E\u064A';
  t['\uFD05'] = '\u0635\u0649';
  t['\uFD06'] = '\u0635\u064A';
  t['\uFD07'] = '\u0636\u0649';
  t['\uFD08'] = '\u0636\u064A';
  t['\uFD09'] = '\u0634\u062C';
  t['\uFD0A'] = '\u0634\u062D';
  t['\uFD0B'] = '\u0634\u062E';
  t['\uFD0C'] = '\u0634\u0645';
  t['\uFD0D'] = '\u0634\u0631';
  t['\uFD0E'] = '\u0633\u0631';
  t['\uFD0F'] = '\u0635\u0631';
  t['\uFD10'] = '\u0636\u0631';
  t['\uFD11'] = '\u0637\u0649';
  t['\uFD12'] = '\u0637\u064A';
  t['\uFD13'] = '\u0639\u0649';
  t['\uFD14'] = '\u0639\u064A';
  t['\uFD15'] = '\u063A\u0649';
  t['\uFD16'] = '\u063A\u064A';
  t['\uFD17'] = '\u0633\u0649';
  t['\uFD18'] = '\u0633\u064A';
  t['\uFD19'] = '\u0634\u0649';
  t['\uFD1A'] = '\u0634\u064A';
  t['\uFD1B'] = '\u062D\u0649';
  t['\uFD1C'] = '\u062D\u064A';
  t['\uFD1D'] = '\u062C\u0649';
  t['\uFD1E'] = '\u062C\u064A';
  t['\uFD1F'] = '\u062E\u0649';
  t['\uFD20'] = '\u062E\u064A';
  t['\uFD21'] = '\u0635\u0649';
  t['\uFD22'] = '\u0635\u064A';
  t['\uFD23'] = '\u0636\u0649';
  t['\uFD24'] = '\u0636\u064A';
  t['\uFD25'] = '\u0634\u062C';
  t['\uFD26'] = '\u0634\u062D';
  t['\uFD27'] = '\u0634\u062E';
  t['\uFD28'] = '\u0634\u0645';
  t['\uFD29'] = '\u0634\u0631';
  t['\uFD2A'] = '\u0633\u0631';
  t['\uFD2B'] = '\u0635\u0631';
  t['\uFD2C'] = '\u0636\u0631';
  t['\uFD2D'] = '\u0634\u062C';
  t['\uFD2E'] = '\u0634\u062D';
  t['\uFD2F'] = '\u0634\u062E';
  t['\uFD30'] = '\u0634\u0645';
  t['\uFD31'] = '\u0633\u0647';
  t['\uFD32'] = '\u0634\u0647';
  t['\uFD33'] = '\u0637\u0645';
  t['\uFD34'] = '\u0633\u062C';
  t['\uFD35'] = '\u0633\u062D';
  t['\uFD36'] = '\u0633\u062E';
  t['\uFD37'] = '\u0634\u062C';
  t['\uFD38'] = '\u0634\u062D';
  t['\uFD39'] = '\u0634\u062E';
  t['\uFD3A'] = '\u0637\u0645';
  t['\uFD3B'] = '\u0638\u0645';
  t['\uFD3C'] = '\u0627\u064B';
  t['\uFD3D'] = '\u0627\u064B';
  t['\uFD50'] = '\u062A\u062C\u0645';
  t['\uFD51'] = '\u062A\u062D\u062C';
  t['\uFD52'] = '\u062A\u062D\u062C';
  t['\uFD53'] = '\u062A\u062D\u0645';
  t['\uFD54'] = '\u062A\u062E\u0645';
  t['\uFD55'] = '\u062A\u0645\u062C';
  t['\uFD56'] = '\u062A\u0645\u062D';
  t['\uFD57'] = '\u062A\u0645\u062E';
  t['\uFD58'] = '\u062C\u0645\u062D';
  t['\uFD59'] = '\u062C\u0645\u062D';
  t['\uFD5A'] = '\u062D\u0645\u064A';
  t['\uFD5B'] = '\u062D\u0645\u0649';
  t['\uFD5C'] = '\u0633\u062D\u062C';
  t['\uFD5D'] = '\u0633\u062C\u062D';
  t['\uFD5E'] = '\u0633\u062C\u0649';
  t['\uFD5F'] = '\u0633\u0645\u062D';
  t['\uFD60'] = '\u0633\u0645\u062D';
  t['\uFD61'] = '\u0633\u0645\u062C';
  t['\uFD62'] = '\u0633\u0645\u0645';
  t['\uFD63'] = '\u0633\u0645\u0645';
  t['\uFD64'] = '\u0635\u062D\u062D';
  t['\uFD65'] = '\u0635\u062D\u062D';
  t['\uFD66'] = '\u0635\u0645\u0645';
  t['\uFD67'] = '\u0634\u062D\u0645';
  t['\uFD68'] = '\u0634\u062D\u0645';
  t['\uFD69'] = '\u0634\u062C\u064A';
  t['\uFD6A'] = '\u0634\u0645\u062E';
  t['\uFD6B'] = '\u0634\u0645\u062E';
  t['\uFD6C'] = '\u0634\u0645\u0645';
  t['\uFD6D'] = '\u0634\u0645\u0645';
  t['\uFD6E'] = '\u0636\u062D\u0649';
  t['\uFD6F'] = '\u0636\u062E\u0645';
  t['\uFD70'] = '\u0636\u062E\u0645';
  t['\uFD71'] = '\u0637\u0645\u062D';
  t['\uFD72'] = '\u0637\u0645\u062D';
  t['\uFD73'] = '\u0637\u0645\u0645';
  t['\uFD74'] = '\u0637\u0645\u064A';
  t['\uFD75'] = '\u0639\u062C\u0645';
  t['\uFD76'] = '\u0639\u0645\u0645';
  t['\uFD77'] = '\u0639\u0645\u0645';
  t['\uFD78'] = '\u0639\u0645\u0649';
  t['\uFD79'] = '\u063A\u0645\u0645';
  t['\uFD7A'] = '\u063A\u0645\u064A';
  t['\uFD7B'] = '\u063A\u0645\u0649';
  t['\uFD7C'] = '\u0641\u062E\u0645';
  t['\uFD7D'] = '\u0641\u062E\u0645';
  t['\uFD7E'] = '\u0642\u0645\u062D';
  t['\uFD7F'] = '\u0642\u0645\u0645';
  t['\uFD80'] = '\u0644\u062D\u0645';
  t['\uFD81'] = '\u0644\u062D\u064A';
  t['\uFD82'] = '\u0644\u062D\u0649';
  t['\uFD83'] = '\u0644\u062C\u062C';
  t['\uFD84'] = '\u0644\u062C\u062C';
  t['\uFD85'] = '\u0644\u062E\u0645';
  t['\uFD86'] = '\u0644\u062E\u0645';
  t['\uFD87'] = '\u0644\u0645\u062D';
  t['\uFD88'] = '\u0644\u0645\u062D';
  t['\uFD89'] = '\u0645\u062D\u062C';
  t['\uFD8A'] = '\u0645\u062D\u0645';
  t['\uFD8B'] = '\u0645\u062D\u064A';
  t['\uFD8C'] = '\u0645\u062C\u062D';
  t['\uFD8D'] = '\u0645\u062C\u0645';
  t['\uFD8E'] = '\u0645\u062E\u062C';
  t['\uFD8F'] = '\u0645\u062E\u0645';
  t['\uFD92'] = '\u0645\u062C\u062E';
  t['\uFD93'] = '\u0647\u0645\u062C';
  t['\uFD94'] = '\u0647\u0645\u0645';
  t['\uFD95'] = '\u0646\u062D\u0645';
  t['\uFD96'] = '\u0646\u062D\u0649';
  t['\uFD97'] = '\u0646\u062C\u0645';
  t['\uFD98'] = '\u0646\u062C\u0645';
  t['\uFD99'] = '\u0646\u062C\u0649';
  t['\uFD9A'] = '\u0646\u0645\u064A';
  t['\uFD9B'] = '\u0646\u0645\u0649';
  t['\uFD9C'] = '\u064A\u0645\u0645';
  t['\uFD9D'] = '\u064A\u0645\u0645';
  t['\uFD9E'] = '\u0628\u062E\u064A';
  t['\uFD9F'] = '\u062A\u062C\u064A';
  t['\uFDA0'] = '\u062A\u062C\u0649';
  t['\uFDA1'] = '\u062A\u062E\u064A';
  t['\uFDA2'] = '\u062A\u062E\u0649';
  t['\uFDA3'] = '\u062A\u0645\u064A';
  t['\uFDA4'] = '\u062A\u0645\u0649';
  t['\uFDA5'] = '\u062C\u0645\u064A';
  t['\uFDA6'] = '\u062C\u062D\u0649';
  t['\uFDA7'] = '\u062C\u0645\u0649';
  t['\uFDA8'] = '\u0633\u062E\u0649';
  t['\uFDA9'] = '\u0635\u062D\u064A';
  t['\uFDAA'] = '\u0634\u062D\u064A';
  t['\uFDAB'] = '\u0636\u062D\u064A';
  t['\uFDAC'] = '\u0644\u062C\u064A';
  t['\uFDAD'] = '\u0644\u0645\u064A';
  t['\uFDAE'] = '\u064A\u062D\u064A';
  t['\uFDAF'] = '\u064A\u062C\u064A';
  t['\uFDB0'] = '\u064A\u0645\u064A';
  t['\uFDB1'] = '\u0645\u0645\u064A';
  t['\uFDB2'] = '\u0642\u0645\u064A';
  t['\uFDB3'] = '\u0646\u062D\u064A';
  t['\uFDB4'] = '\u0642\u0645\u062D';
  t['\uFDB5'] = '\u0644\u062D\u0645';
  t['\uFDB6'] = '\u0639\u0645\u064A';
  t['\uFDB7'] = '\u0643\u0645\u064A';
  t['\uFDB8'] = '\u0646\u062C\u062D';
  t['\uFDB9'] = '\u0645\u062E\u064A';
  t['\uFDBA'] = '\u0644\u062C\u0645';
  t['\uFDBB'] = '\u0643\u0645\u0645';
  t['\uFDBC'] = '\u0644\u062C\u0645';
  t['\uFDBD'] = '\u0646\u062C\u062D';
  t['\uFDBE'] = '\u062C\u062D\u064A';
  t['\uFDBF'] = '\u062D\u062C\u064A';
  t['\uFDC0'] = '\u0645\u062C\u064A';
  t['\uFDC1'] = '\u0641\u0645\u064A';
  t['\uFDC2'] = '\u0628\u062D\u064A';
  t['\uFDC3'] = '\u0643\u0645\u0645';
  t['\uFDC4'] = '\u0639\u062C\u0645';
  t['\uFDC5'] = '\u0635\u0645\u0645';
  t['\uFDC6'] = '\u0633\u062E\u064A';
  t['\uFDC7'] = '\u0646\u062C\u064A';
  t['\uFE49'] = '\u203E';
  t['\uFE4A'] = '\u203E';
  t['\uFE4B'] = '\u203E';
  t['\uFE4C'] = '\u203E';
  t['\uFE4D'] = '\u005F';
  t['\uFE4E'] = '\u005F';
  t['\uFE4F'] = '\u005F';
  t['\uFE80'] = '\u0621';
  t['\uFE81'] = '\u0622';
  t['\uFE82'] = '\u0622';
  t['\uFE83'] = '\u0623';
  t['\uFE84'] = '\u0623';
  t['\uFE85'] = '\u0624';
  t['\uFE86'] = '\u0624';
  t['\uFE87'] = '\u0625';
  t['\uFE88'] = '\u0625';
  t['\uFE89'] = '\u0626';
  t['\uFE8A'] = '\u0626';
  t['\uFE8B'] = '\u0626';
  t['\uFE8C'] = '\u0626';
  t['\uFE8D'] = '\u0627';
  t['\uFE8E'] = '\u0627';
  t['\uFE8F'] = '\u0628';
  t['\uFE90'] = '\u0628';
  t['\uFE91'] = '\u0628';
  t['\uFE92'] = '\u0628';
  t['\uFE93'] = '\u0629';
  t['\uFE94'] = '\u0629';
  t['\uFE95'] = '\u062A';
  t['\uFE96'] = '\u062A';
  t['\uFE97'] = '\u062A';
  t['\uFE98'] = '\u062A';
  t['\uFE99'] = '\u062B';
  t['\uFE9A'] = '\u062B';
  t['\uFE9B'] = '\u062B';
  t['\uFE9C'] = '\u062B';
  t['\uFE9D'] = '\u062C';
  t['\uFE9E'] = '\u062C';
  t['\uFE9F'] = '\u062C';
  t['\uFEA0'] = '\u062C';
  t['\uFEA1'] = '\u062D';
  t['\uFEA2'] = '\u062D';
  t['\uFEA3'] = '\u062D';
  t['\uFEA4'] = '\u062D';
  t['\uFEA5'] = '\u062E';
  t['\uFEA6'] = '\u062E';
  t['\uFEA7'] = '\u062E';
  t['\uFEA8'] = '\u062E';
  t['\uFEA9'] = '\u062F';
  t['\uFEAA'] = '\u062F';
  t['\uFEAB'] = '\u0630';
  t['\uFEAC'] = '\u0630';
  t['\uFEAD'] = '\u0631';
  t['\uFEAE'] = '\u0631';
  t['\uFEAF'] = '\u0632';
  t['\uFEB0'] = '\u0632';
  t['\uFEB1'] = '\u0633';
  t['\uFEB2'] = '\u0633';
  t['\uFEB3'] = '\u0633';
  t['\uFEB4'] = '\u0633';
  t['\uFEB5'] = '\u0634';
  t['\uFEB6'] = '\u0634';
  t['\uFEB7'] = '\u0634';
  t['\uFEB8'] = '\u0634';
  t['\uFEB9'] = '\u0635';
  t['\uFEBA'] = '\u0635';
  t['\uFEBB'] = '\u0635';
  t['\uFEBC'] = '\u0635';
  t['\uFEBD'] = '\u0636';
  t['\uFEBE'] = '\u0636';
  t['\uFEBF'] = '\u0636';
  t['\uFEC0'] = '\u0636';
  t['\uFEC1'] = '\u0637';
  t['\uFEC2'] = '\u0637';
  t['\uFEC3'] = '\u0637';
  t['\uFEC4'] = '\u0637';
  t['\uFEC5'] = '\u0638';
  t['\uFEC6'] = '\u0638';
  t['\uFEC7'] = '\u0638';
  t['\uFEC8'] = '\u0638';
  t['\uFEC9'] = '\u0639';
  t['\uFECA'] = '\u0639';
  t['\uFECB'] = '\u0639';
  t['\uFECC'] = '\u0639';
  t['\uFECD'] = '\u063A';
  t['\uFECE'] = '\u063A';
  t['\uFECF'] = '\u063A';
  t['\uFED0'] = '\u063A';
  t['\uFED1'] = '\u0641';
  t['\uFED2'] = '\u0641';
  t['\uFED3'] = '\u0641';
  t['\uFED4'] = '\u0641';
  t['\uFED5'] = '\u0642';
  t['\uFED6'] = '\u0642';
  t['\uFED7'] = '\u0642';
  t['\uFED8'] = '\u0642';
  t['\uFED9'] = '\u0643';
  t['\uFEDA'] = '\u0643';
  t['\uFEDB'] = '\u0643';
  t['\uFEDC'] = '\u0643';
  t['\uFEDD'] = '\u0644';
  t['\uFEDE'] = '\u0644';
  t['\uFEDF'] = '\u0644';
  t['\uFEE0'] = '\u0644';
  t['\uFEE1'] = '\u0645';
  t['\uFEE2'] = '\u0645';
  t['\uFEE3'] = '\u0645';
  t['\uFEE4'] = '\u0645';
  t['\uFEE5'] = '\u0646';
  t['\uFEE6'] = '\u0646';
  t['\uFEE7'] = '\u0646';
  t['\uFEE8'] = '\u0646';
  t['\uFEE9'] = '\u0647';
  t['\uFEEA'] = '\u0647';
  t['\uFEEB'] = '\u0647';
  t['\uFEEC'] = '\u0647';
  t['\uFEED'] = '\u0648';
  t['\uFEEE'] = '\u0648';
  t['\uFEEF'] = '\u0649';
  t['\uFEF0'] = '\u0649';
  t['\uFEF1'] = '\u064A';
  t['\uFEF2'] = '\u064A';
  t['\uFEF3'] = '\u064A';
  t['\uFEF4'] = '\u064A';
  t['\uFEF5'] = '\u0644\u0622';
  t['\uFEF6'] = '\u0644\u0622';
  t['\uFEF7'] = '\u0644\u0623';
  t['\uFEF8'] = '\u0644\u0623';
  t['\uFEF9'] = '\u0644\u0625';
  t['\uFEFA'] = '\u0644\u0625';
  t['\uFEFB'] = '\u0644\u0627';
  t['\uFEFC'] = '\u0644\u0627';
});

function reverseIfRtl(chars) {
  var charsLength = chars.length;
  // Reverse an arabic ligature.
  if (charsLength <= 1 || !isRTLRangeFor(chars.charCodeAt(0))) {
    return chars;
  }
  var s = '';
  for (var ii = charsLength - 1; ii >= 0; ii--) {
    s += chars[ii];
  }
  return s;
}

exports.mapSpecialUnicodeValues = mapSpecialUnicodeValues;
exports.reverseIfRtl = reverseIfRtl;
exports.getUnicodeRangeFor = getUnicodeRangeFor;
exports.getNormalizedUnicodes = getNormalizedUnicodes;
exports.getUnicodeForGlyph = getUnicodeForGlyph;
