/* Copyright 2012 Mozilla Foundation
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

import { FontType, info } from "../shared/util.js";
import { getEncoding, StandardEncoding } from "./encodings.js";
import { getGlyphsUnicode } from "./glyphlist.js";
import { getUnicodeForGlyph } from "./unicode.js";

// Accented characters have issues on Windows and Linux. When this flag is
// enabled glyphs that use seac and seac style endchar operators are truncated
// and we instead just store the glyph id's of the base glyph and its accent to
// be drawn individually.
// Linux (freetype) requires that when a seac style endchar is used
// that the charset must be a predefined one, however we build a
// custom one. Windows just refuses to draw glyphs with seac operators.
const SEAC_ANALYSIS_ENABLED = true;

const FontFlags = {
  FixedPitch: 1,
  Serif: 2,
  Symbolic: 4,
  Script: 8,
  Nonsymbolic: 32,
  Italic: 64,
  AllCap: 65536,
  SmallCap: 131072,
  ForceBold: 262144,
};

// prettier-ignore
const MacStandardGlyphOrdering = [
  ".notdef", ".null", "nonmarkingreturn", "space", "exclam", "quotedbl",
  "numbersign", "dollar", "percent", "ampersand", "quotesingle", "parenleft",
  "parenright", "asterisk", "plus", "comma", "hyphen", "period", "slash",
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "colon", "semicolon", "less", "equal", "greater", "question", "at",
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O",
  "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "bracketleft",
  "backslash", "bracketright", "asciicircum", "underscore", "grave", "a", "b",
  "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q",
  "r", "s", "t", "u", "v", "w", "x", "y", "z", "braceleft", "bar", "braceright",
  "asciitilde", "Adieresis", "Aring", "Ccedilla", "Eacute", "Ntilde",
  "Odieresis", "Udieresis", "aacute", "agrave", "acircumflex", "adieresis",
  "atilde", "aring", "ccedilla", "eacute", "egrave", "ecircumflex", "edieresis",
  "iacute", "igrave", "icircumflex", "idieresis", "ntilde", "oacute", "ograve",
  "ocircumflex", "odieresis", "otilde", "uacute", "ugrave", "ucircumflex",
  "udieresis", "dagger", "degree", "cent", "sterling", "section", "bullet",
  "paragraph", "germandbls", "registered", "copyright", "trademark", "acute",
  "dieresis", "notequal", "AE", "Oslash", "infinity", "plusminus", "lessequal",
  "greaterequal", "yen", "mu", "partialdiff", "summation", "product", "pi",
  "integral", "ordfeminine", "ordmasculine", "Omega", "ae", "oslash",
  "questiondown", "exclamdown", "logicalnot", "radical", "florin",
  "approxequal", "Delta", "guillemotleft", "guillemotright", "ellipsis",
  "nonbreakingspace", "Agrave", "Atilde", "Otilde", "OE", "oe", "endash",
  "emdash", "quotedblleft", "quotedblright", "quoteleft", "quoteright",
  "divide", "lozenge", "ydieresis", "Ydieresis", "fraction", "currency",
  "guilsinglleft", "guilsinglright", "fi", "fl", "daggerdbl", "periodcentered",
  "quotesinglbase", "quotedblbase", "perthousand", "Acircumflex",
  "Ecircumflex", "Aacute", "Edieresis", "Egrave", "Iacute", "Icircumflex",
  "Idieresis", "Igrave", "Oacute", "Ocircumflex", "apple", "Ograve", "Uacute",
  "Ucircumflex", "Ugrave", "dotlessi", "circumflex", "tilde", "macron",
  "breve", "dotaccent", "ring", "cedilla", "hungarumlaut", "ogonek", "caron",
  "Lslash", "lslash", "Scaron", "scaron", "Zcaron", "zcaron", "brokenbar",
  "Eth", "eth", "Yacute", "yacute", "Thorn", "thorn", "minus", "multiply",
  "onesuperior", "twosuperior", "threesuperior", "onehalf", "onequarter",
  "threequarters", "franc", "Gbreve", "gbreve", "Idotaccent", "Scedilla",
  "scedilla", "Cacute", "cacute", "Ccaron", "ccaron", "dcroat"];

function getFontType(type, subtype, isStandardFont = false) {
  switch (type) {
    case "Type1":
      if (isStandardFont) {
        return FontType.TYPE1STANDARD;
      }
      return subtype === "Type1C" ? FontType.TYPE1C : FontType.TYPE1;
    case "CIDFontType0":
      return subtype === "CIDFontType0C"
        ? FontType.CIDFONTTYPE0C
        : FontType.CIDFONTTYPE0;
    case "OpenType":
      return FontType.OPENTYPE;
    case "TrueType":
      return FontType.TRUETYPE;
    case "CIDFontType2":
      return FontType.CIDFONTTYPE2;
    case "MMType1":
      return FontType.MMTYPE1;
    case "Type0":
      return FontType.TYPE0;
    default:
      return FontType.UNKNOWN;
  }
}

// Some bad PDF generators, e.g. Scribus PDF, include glyph names
// in a 'uniXXXX' format -- attempting to recover proper ones.
function recoverGlyphName(name, glyphsUnicodeMap) {
  if (glyphsUnicodeMap[name] !== undefined) {
    return name;
  }
  // The glyph name is non-standard, trying to recover.
  const unicode = getUnicodeForGlyph(name, glyphsUnicodeMap);
  if (unicode !== -1) {
    for (const key in glyphsUnicodeMap) {
      if (glyphsUnicodeMap[key] === unicode) {
        return key;
      }
    }
  }
  info("Unable to recover a standard glyph name for: " + name);
  return name;
}

/**
 * Shared logic for building a char code to glyph id mapping for Type1 and
 * simple CFF fonts. See section 9.6.6.2 of the spec.
 * @param {Object} properties Font properties object.
 * @param {Object} builtInEncoding The encoding contained within the actual font
 *   data.
 * @param {Array} glyphNames Array of glyph names where the index is the
 *   glyph ID.
 * @returns {Object} A char code to glyph ID map.
 */
function type1FontGlyphMapping(properties, builtInEncoding, glyphNames) {
  const charCodeToGlyphId = Object.create(null);
  let glyphId, charCode, baseEncoding;
  const isSymbolicFont = !!(properties.flags & FontFlags.Symbolic);

  if (properties.isInternalFont) {
    baseEncoding = builtInEncoding;
    for (charCode = 0; charCode < baseEncoding.length; charCode++) {
      glyphId = glyphNames.indexOf(baseEncoding[charCode]);
      if (glyphId >= 0) {
        charCodeToGlyphId[charCode] = glyphId;
      } else {
        charCodeToGlyphId[charCode] = 0; // notdef
      }
    }
  } else if (properties.baseEncodingName) {
    // If a valid base encoding name was used, the mapping is initialized with
    // that.
    baseEncoding = getEncoding(properties.baseEncodingName);
    for (charCode = 0; charCode < baseEncoding.length; charCode++) {
      glyphId = glyphNames.indexOf(baseEncoding[charCode]);
      if (glyphId >= 0) {
        charCodeToGlyphId[charCode] = glyphId;
      } else {
        charCodeToGlyphId[charCode] = 0; // notdef
      }
    }
  } else if (isSymbolicFont) {
    // For a symbolic font the encoding should be the fonts built-in encoding.
    for (charCode in builtInEncoding) {
      charCodeToGlyphId[charCode] = builtInEncoding[charCode];
    }
  } else {
    // For non-symbolic fonts that don't have a base encoding the standard
    // encoding should be used.
    baseEncoding = StandardEncoding;
    for (charCode = 0; charCode < baseEncoding.length; charCode++) {
      glyphId = glyphNames.indexOf(baseEncoding[charCode]);
      if (glyphId >= 0) {
        charCodeToGlyphId[charCode] = glyphId;
      } else {
        charCodeToGlyphId[charCode] = 0; // notdef
      }
    }
  }

  // Lastly, merge in the differences.
  const differences = properties.differences;
  let glyphsUnicodeMap;
  if (differences) {
    for (charCode in differences) {
      const glyphName = differences[charCode];
      glyphId = glyphNames.indexOf(glyphName);

      if (glyphId === -1) {
        if (!glyphsUnicodeMap) {
          glyphsUnicodeMap = getGlyphsUnicode();
        }
        const standardGlyphName = recoverGlyphName(glyphName, glyphsUnicodeMap);
        if (standardGlyphName !== glyphName) {
          glyphId = glyphNames.indexOf(standardGlyphName);
        }
      }
      if (glyphId >= 0) {
        charCodeToGlyphId[charCode] = glyphId;
      } else {
        charCodeToGlyphId[charCode] = 0; // notdef
      }
    }
  }
  return charCodeToGlyphId;
}

function normalizeFontName(name) {
  return name.replace(/[,_]/g, "-").replace(/\s/g, "");
}

export {
  FontFlags,
  getFontType,
  MacStandardGlyphOrdering,
  normalizeFontName,
  recoverGlyphName,
  SEAC_ANALYSIS_ENABLED,
  type1FontGlyphMapping,
};
