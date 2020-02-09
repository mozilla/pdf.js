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

import {
  assert,
  bytesToString,
  FONT_IDENTITY_MATRIX,
  FontType,
  FormatError,
  info,
  isNum,
  shadow,
  string32,
  unreachable,
  warn,
} from "../shared/util.js";
import {
  CFF,
  CFFCharset,
  CFFCompiler,
  CFFHeader,
  CFFIndex,
  CFFParser,
  CFFPrivateDict,
  CFFStandardStrings,
  CFFStrings,
  CFFTopDict,
} from "./cff_parser.js";
import { getDingbatsGlyphsUnicode, getGlyphsUnicode } from "./glyphlist.js";
import {
  getEncoding,
  MacRomanEncoding,
  StandardEncoding,
  SymbolSetEncoding,
  ZapfDingbatsEncoding,
} from "./encodings.js";
import {
  getGlyphMapForStandardFonts,
  getNonStdFontMap,
  getStdFontMap,
  getSupplementalGlyphMapForArialBlack,
  getSupplementalGlyphMapForCalibri,
} from "./standard_fonts.js";
import {
  getUnicodeForGlyph,
  getUnicodeRangeFor,
  mapSpecialUnicodeValues,
} from "./unicode.js";
import { isSpace, MissingDataException, readUint32 } from "./core_utils.js";
import { FontRendererFactory } from "./font_renderer.js";
import { IdentityCMap } from "./cmap.js";
import { Stream } from "./stream.js";
import { Type1Parser } from "./type1_parser.js";

// Unicode Private Use Areas:
const PRIVATE_USE_AREAS = [
  [0xe000, 0xf8ff], // BMP (0)
  [0x100000, 0x10fffd], // PUP (16)
];

// PDF Glyph Space Units are one Thousandth of a TextSpace Unit
// except for Type 3 fonts
var PDF_GLYPH_SPACE_UNITS = 1000;

// Accented characters have issues on Windows and Linux. When this flag is
// enabled glyphs that use seac and seac style endchar operators are truncated
// and we instead just store the glyph id's of the base glyph and its accent to
// be drawn individually.
// Linux (freetype) requires that when a seac style endchar is used
// that the charset must be a predefined one, however we build a
// custom one. Windows just refuses to draw glyphs with seac operators.
var SEAC_ANALYSIS_ENABLED = true;

var FontFlags = {
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
var MacStandardGlyphOrdering = [
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

function adjustWidths(properties) {
  if (!properties.fontMatrix) {
    return;
  }
  if (properties.fontMatrix[0] === FONT_IDENTITY_MATRIX[0]) {
    return;
  }
  // adjusting width to fontMatrix scale
  var scale = 0.001 / properties.fontMatrix[0];
  var glyphsWidths = properties.widths;
  for (var glyph in glyphsWidths) {
    glyphsWidths[glyph] *= scale;
  }
  properties.defaultWidth *= scale;
}

function adjustToUnicode(properties, builtInEncoding) {
  if (properties.hasIncludedToUnicodeMap) {
    return; // The font dictionary has a `ToUnicode` entry.
  }
  if (properties.hasEncoding) {
    return; // The font dictionary has an `Encoding` entry.
  }
  if (builtInEncoding === properties.defaultEncoding) {
    return; // No point in trying to adjust `toUnicode` if the encodings match.
  }
  if (properties.toUnicode instanceof IdentityToUnicodeMap) {
    return;
  }
  var toUnicode = [],
    glyphsUnicodeMap = getGlyphsUnicode();
  for (var charCode in builtInEncoding) {
    var glyphName = builtInEncoding[charCode];
    var unicode = getUnicodeForGlyph(glyphName, glyphsUnicodeMap);
    if (unicode !== -1) {
      toUnicode[charCode] = String.fromCharCode(unicode);
    }
  }
  properties.toUnicode.amend(toUnicode);
}

function getFontType(type, subtype) {
  switch (type) {
    case "Type1":
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
  var unicode = getUnicodeForGlyph(name, glyphsUnicodeMap);
  if (unicode !== -1) {
    for (var key in glyphsUnicodeMap) {
      if (glyphsUnicodeMap[key] === unicode) {
        return key;
      }
    }
  }
  info("Unable to recover a standard glyph name for: " + name);
  return name;
}

var Glyph = (function GlyphClosure() {
  function Glyph(
    fontChar,
    unicode,
    accent,
    width,
    vmetric,
    operatorListId,
    isSpace,
    isInFont
  ) {
    this.fontChar = fontChar;
    this.unicode = unicode;
    this.accent = accent;
    this.width = width;
    this.vmetric = vmetric;
    this.operatorListId = operatorListId;
    this.isSpace = isSpace;
    this.isInFont = isInFont;
  }

  Glyph.prototype.matchesForCache = function(
    fontChar,
    unicode,
    accent,
    width,
    vmetric,
    operatorListId,
    isSpace,
    isInFont
  ) {
    return (
      this.fontChar === fontChar &&
      this.unicode === unicode &&
      this.accent === accent &&
      this.width === width &&
      this.vmetric === vmetric &&
      this.operatorListId === operatorListId &&
      this.isSpace === isSpace &&
      this.isInFont === isInFont
    );
  };

  return Glyph;
})();

var ToUnicodeMap = (function ToUnicodeMapClosure() {
  function ToUnicodeMap(cmap = []) {
    // The elements of this._map can be integers or strings, depending on how
    // `cmap` was created.
    this._map = cmap;
  }

  ToUnicodeMap.prototype = {
    get length() {
      return this._map.length;
    },

    forEach(callback) {
      for (var charCode in this._map) {
        callback(charCode, this._map[charCode].charCodeAt(0));
      }
    },

    has(i) {
      return this._map[i] !== undefined;
    },

    get(i) {
      return this._map[i];
    },

    charCodeOf(value) {
      // `Array.prototype.indexOf` is *extremely* inefficient for arrays which
      // are both very sparse and very large (see issue8372.pdf).
      const map = this._map;
      if (map.length <= 0x10000) {
        return map.indexOf(value);
      }
      for (const charCode in map) {
        if (map[charCode] === value) {
          return charCode | 0;
        }
      }
      return -1;
    },

    amend(map) {
      for (var charCode in map) {
        this._map[charCode] = map[charCode];
      }
    },
  };

  return ToUnicodeMap;
})();

var IdentityToUnicodeMap = (function IdentityToUnicodeMapClosure() {
  function IdentityToUnicodeMap(firstChar, lastChar) {
    this.firstChar = firstChar;
    this.lastChar = lastChar;
  }

  IdentityToUnicodeMap.prototype = {
    get length() {
      return this.lastChar + 1 - this.firstChar;
    },

    forEach(callback) {
      for (var i = this.firstChar, ii = this.lastChar; i <= ii; i++) {
        callback(i, i);
      }
    },

    has(i) {
      return this.firstChar <= i && i <= this.lastChar;
    },

    get(i) {
      if (this.firstChar <= i && i <= this.lastChar) {
        return String.fromCharCode(i);
      }
      return undefined;
    },

    charCodeOf(v) {
      return Number.isInteger(v) && v >= this.firstChar && v <= this.lastChar
        ? v
        : -1;
    },

    amend(map) {
      unreachable("Should not call amend()");
    },
  };

  return IdentityToUnicodeMap;
})();

var OpenTypeFileBuilder = (function OpenTypeFileBuilderClosure() {
  function writeInt16(dest, offset, num) {
    dest[offset] = (num >> 8) & 0xff;
    dest[offset + 1] = num & 0xff;
  }

  function writeInt32(dest, offset, num) {
    dest[offset] = (num >> 24) & 0xff;
    dest[offset + 1] = (num >> 16) & 0xff;
    dest[offset + 2] = (num >> 8) & 0xff;
    dest[offset + 3] = num & 0xff;
  }

  function writeData(dest, offset, data) {
    var i, ii;
    if (data instanceof Uint8Array) {
      dest.set(data, offset);
    } else if (typeof data === "string") {
      for (i = 0, ii = data.length; i < ii; i++) {
        dest[offset++] = data.charCodeAt(i) & 0xff;
      }
    } else {
      // treating everything else as array
      for (i = 0, ii = data.length; i < ii; i++) {
        dest[offset++] = data[i] & 0xff;
      }
    }
  }

  function OpenTypeFileBuilder(sfnt) {
    this.sfnt = sfnt;
    this.tables = Object.create(null);
  }

  OpenTypeFileBuilder.getSearchParams = function OpenTypeFileBuilder_getSearchParams(
    entriesCount,
    entrySize
  ) {
    var maxPower2 = 1,
      log2 = 0;
    while ((maxPower2 ^ entriesCount) > maxPower2) {
      maxPower2 <<= 1;
      log2++;
    }
    var searchRange = maxPower2 * entrySize;
    return {
      range: searchRange,
      entry: log2,
      rangeShift: entrySize * entriesCount - searchRange,
    };
  };

  var OTF_HEADER_SIZE = 12;
  var OTF_TABLE_ENTRY_SIZE = 16;

  OpenTypeFileBuilder.prototype = {
    toArray: function OpenTypeFileBuilder_toArray() {
      var sfnt = this.sfnt;

      // Tables needs to be written by ascendant alphabetic order
      var tables = this.tables;
      var tablesNames = Object.keys(tables);
      tablesNames.sort();
      var numTables = tablesNames.length;

      var i, j, jj, table, tableName;
      // layout the tables data
      var offset = OTF_HEADER_SIZE + numTables * OTF_TABLE_ENTRY_SIZE;
      var tableOffsets = [offset];
      for (i = 0; i < numTables; i++) {
        table = tables[tablesNames[i]];
        var paddedLength = ((table.length + 3) & ~3) >>> 0;
        offset += paddedLength;
        tableOffsets.push(offset);
      }

      var file = new Uint8Array(offset);
      // write the table data first (mostly for checksum)
      for (i = 0; i < numTables; i++) {
        table = tables[tablesNames[i]];
        writeData(file, tableOffsets[i], table);
      }

      // sfnt version (4 bytes)
      if (sfnt === "true") {
        // Windows hates the Mac TrueType sfnt version number
        sfnt = string32(0x00010000);
      }
      file[0] = sfnt.charCodeAt(0) & 0xff;
      file[1] = sfnt.charCodeAt(1) & 0xff;
      file[2] = sfnt.charCodeAt(2) & 0xff;
      file[3] = sfnt.charCodeAt(3) & 0xff;

      // numTables (2 bytes)
      writeInt16(file, 4, numTables);

      var searchParams = OpenTypeFileBuilder.getSearchParams(numTables, 16);

      // searchRange (2 bytes)
      writeInt16(file, 6, searchParams.range);
      // entrySelector (2 bytes)
      writeInt16(file, 8, searchParams.entry);
      // rangeShift (2 bytes)
      writeInt16(file, 10, searchParams.rangeShift);

      offset = OTF_HEADER_SIZE;
      // writing table entries
      for (i = 0; i < numTables; i++) {
        tableName = tablesNames[i];
        file[offset] = tableName.charCodeAt(0) & 0xff;
        file[offset + 1] = tableName.charCodeAt(1) & 0xff;
        file[offset + 2] = tableName.charCodeAt(2) & 0xff;
        file[offset + 3] = tableName.charCodeAt(3) & 0xff;

        // checksum
        var checksum = 0;
        for (j = tableOffsets[i], jj = tableOffsets[i + 1]; j < jj; j += 4) {
          var quad = readUint32(file, j);
          checksum = (checksum + quad) >>> 0;
        }
        writeInt32(file, offset + 4, checksum);

        // offset
        writeInt32(file, offset + 8, tableOffsets[i]);
        // length
        writeInt32(file, offset + 12, tables[tableName].length);

        offset += OTF_TABLE_ENTRY_SIZE;
      }
      return file;
    },

    addTable: function OpenTypeFileBuilder_addTable(tag, data) {
      if (tag in this.tables) {
        throw new Error("Table " + tag + " already exists");
      }
      this.tables[tag] = data;
    },
  };

  return OpenTypeFileBuilder;
})();

/**
 * 'Font' is the class the outside world should use, it encapsulate all the font
 * decoding logics whatever type it is (assuming the font type is supported).
 *
 * For example to read a Type1 font and to attach it to the document:
 *   var type1Font = new Font("MyFontName", binaryFile, propertiesObject);
 *   type1Font.bind();
 */
var Font = (function FontClosure() {
  function Font(name, file, properties) {
    var charCode;

    this.name = name;
    this.loadedName = properties.loadedName;
    this.isType3Font = properties.isType3Font;
    this.sizes = [];
    this.missingFile = false;

    this.glyphCache = Object.create(null);

    this.isSerifFont = !!(properties.flags & FontFlags.Serif);
    this.isSymbolicFont = !!(properties.flags & FontFlags.Symbolic);
    this.isMonospace = !!(properties.flags & FontFlags.FixedPitch);

    var type = properties.type;
    var subtype = properties.subtype;
    this.type = type;
    this.subtype = subtype;

    let fallbackName = "sans-serif";
    if (this.isMonospace) {
      fallbackName = "monospace";
    } else if (this.isSerifFont) {
      fallbackName = "serif";
    }
    this.fallbackName = fallbackName;

    this.differences = properties.differences;
    this.widths = properties.widths;
    this.defaultWidth = properties.defaultWidth;
    this.composite = properties.composite;
    this.wideChars = properties.wideChars;
    this.cMap = properties.cMap;
    this.ascent = properties.ascent / PDF_GLYPH_SPACE_UNITS;
    this.descent = properties.descent / PDF_GLYPH_SPACE_UNITS;
    this.fontMatrix = properties.fontMatrix;
    this.bbox = properties.bbox;
    this.defaultEncoding = properties.defaultEncoding;

    this.toUnicode = properties.toUnicode;
    this.fallbackToUnicode = properties.fallbackToUnicode || new ToUnicodeMap();

    this.toFontChar = [];

    if (properties.type === "Type3") {
      for (charCode = 0; charCode < 256; charCode++) {
        this.toFontChar[charCode] =
          this.differences[charCode] || properties.defaultEncoding[charCode];
      }
      this.fontType = FontType.TYPE3;
      return;
    }

    this.cidEncoding = properties.cidEncoding;
    this.vertical = properties.vertical;
    if (this.vertical) {
      this.vmetrics = properties.vmetrics;
      this.defaultVMetrics = properties.defaultVMetrics;
    }

    if (!file || file.isEmpty) {
      if (file) {
        // Some bad PDF generators will include empty font files,
        // attempting to recover by assuming that no file exists.
        warn('Font file is empty in "' + name + '" (' + this.loadedName + ")");
      }
      this.fallbackToSystemFont();
      return;
    }

    // Parse the font file to determine the correct type/subtype, rather than
    // relying on the (often incorrect) data in the font dictionary; (see e.g.
    //  issue6782.pdf, issue7598.pdf, and issue9949.pdf).
    [type, subtype] = getFontFileType(file, properties);

    if (type !== this.type || subtype !== this.subtype) {
      info(
        "Inconsistent font file Type/SubType, expected: " +
          `${this.type}/${this.subtype} but found: ${type}/${subtype}.`
      );
    }

    try {
      var data;
      switch (type) {
        case "MMType1":
          info("MMType1 font (" + name + "), falling back to Type1.");
        /* falls through */
        case "Type1":
        case "CIDFontType0":
          this.mimetype = "font/opentype";

          var cff =
            subtype === "Type1C" || subtype === "CIDFontType0C"
              ? new CFFFont(file, properties)
              : new Type1Font(name, file, properties);

          adjustWidths(properties);

          // Wrap the CFF data inside an OTF font file
          data = this.convert(name, cff, properties);
          break;

        case "OpenType":
        case "TrueType":
        case "CIDFontType2":
          this.mimetype = "font/opentype";

          // Repair the TrueType file. It is can be damaged in the point of
          // view of the sanitizer
          data = this.checkAndRepair(name, file, properties);
          if (this.isOpenType) {
            adjustWidths(properties);

            type = "OpenType";
          }
          break;

        default:
          throw new FormatError(`Font ${type} is not supported`);
      }
    } catch (e) {
      warn(e);
      this.fallbackToSystemFont();
      return;
    }

    this.data = data;
    this.fontType = getFontType(type, subtype);

    // Transfer some properties again that could change during font conversion
    this.fontMatrix = properties.fontMatrix;
    this.widths = properties.widths;
    this.defaultWidth = properties.defaultWidth;
    this.toUnicode = properties.toUnicode;
    this.encoding = properties.baseEncoding;
    this.seacMap = properties.seacMap;
  }

  Font.getFontID = (function() {
    var ID = 1;
    return function Font_getFontID() {
      return String(ID++);
    };
  })();

  function int16(b0, b1) {
    return (b0 << 8) + b1;
  }

  function writeSignedInt16(bytes, index, value) {
    bytes[index + 1] = value;
    bytes[index] = value >>> 8;
  }

  function signedInt16(b0, b1) {
    var value = (b0 << 8) + b1;
    return value & (1 << 15) ? value - 0x10000 : value;
  }

  function int32(b0, b1, b2, b3) {
    return (b0 << 24) + (b1 << 16) + (b2 << 8) + b3;
  }

  function string16(value) {
    return String.fromCharCode((value >> 8) & 0xff, value & 0xff);
  }

  function safeString16(value) {
    // clamp value to the 16-bit int range
    if (value > 0x7fff) {
      value = 0x7fff;
    } else if (value < -0x8000) {
      value = -0x8000;
    }
    return String.fromCharCode((value >> 8) & 0xff, value & 0xff);
  }

  function isTrueTypeFile(file) {
    var header = file.peekBytes(4);
    return (
      readUint32(header, 0) === 0x00010000 || bytesToString(header) === "true"
    );
  }

  function isTrueTypeCollectionFile(file) {
    const header = file.peekBytes(4);
    return bytesToString(header) === "ttcf";
  }

  function isOpenTypeFile(file) {
    var header = file.peekBytes(4);
    return bytesToString(header) === "OTTO";
  }

  function isType1File(file) {
    var header = file.peekBytes(2);
    // All Type1 font programs must begin with the comment '%!' (0x25 + 0x21).
    if (header[0] === 0x25 && header[1] === 0x21) {
      return true;
    }
    // ... obviously some fonts violate that part of the specification,
    // please refer to the comment in |Type1Font| below (pfb file header).
    if (header[0] === 0x80 && header[1] === 0x01) {
      return true;
    }
    return false;
  }

  /**
   * Compared to other font formats, the header in CFF files is not constant
   * but contains version numbers. To reduce the possibility of misclassifying
   * font files as CFF, it's recommended to check for other font formats first.
   */
  function isCFFFile(file) {
    const header = file.peekBytes(4);
    if (
      /* major version, [1, 255] */ header[0] >= 1 &&
      /* minor version, [0, 255]; header[1] */
      /* header size, [0, 255]; header[2] */
      /* offset(0) size, [1, 4] */ header[3] >= 1 &&
      header[3] <= 4
    ) {
      return true;
    }
    return false;
  }

  function getFontFileType(file, { type, subtype, composite }) {
    let fileType, fileSubtype;

    if (isTrueTypeFile(file) || isTrueTypeCollectionFile(file)) {
      if (composite) {
        fileType = "CIDFontType2";
      } else {
        fileType = "TrueType";
      }
    } else if (isOpenTypeFile(file)) {
      if (composite) {
        fileType = "CIDFontType2";
      } else {
        fileType = "OpenType";
      }
    } else if (isType1File(file)) {
      if (composite) {
        fileType = "CIDFontType0";
      } else {
        fileType = type === "MMType1" ? "MMType1" : "Type1";
      }
    } else if (isCFFFile(file)) {
      if (composite) {
        fileType = "CIDFontType0";
        fileSubtype = "CIDFontType0C";
      } else {
        fileType = type === "MMType1" ? "MMType1" : "Type1";
        fileSubtype = "Type1C";
      }
    } else {
      warn("getFontFileType: Unable to detect correct font file Type/Subtype.");
      fileType = type;
      fileSubtype = subtype;
    }

    return [fileType, fileSubtype];
  }

  function buildToFontChar(encoding, glyphsUnicodeMap, differences) {
    var toFontChar = [],
      unicode;
    for (var i = 0, ii = encoding.length; i < ii; i++) {
      unicode = getUnicodeForGlyph(encoding[i], glyphsUnicodeMap);
      if (unicode !== -1) {
        toFontChar[i] = unicode;
      }
    }
    for (var charCode in differences) {
      unicode = getUnicodeForGlyph(differences[charCode], glyphsUnicodeMap);
      if (unicode !== -1) {
        toFontChar[+charCode] = unicode;
      }
    }
    return toFontChar;
  }

  /**
   * Rebuilds the char code to glyph ID map by moving all char codes to the
   * private use area. This is done to avoid issues with various problematic
   * unicode areas where either a glyph won't be drawn or is deformed by a
   * shaper.
   * @returns {Object} Two properties:
   * 'toFontChar' - maps original char codes(the value that will be read
   * from commands such as show text) to the char codes that will be used in the
   * font that we build
   * 'charCodeToGlyphId' - maps the new font char codes to glyph ids
   */
  function adjustMapping(charCodeToGlyphId, hasGlyph, newGlyphZeroId) {
    var newMap = Object.create(null);
    var toFontChar = [];
    var privateUseAreaIndex = 0;
    var nextAvailableFontCharCode = PRIVATE_USE_AREAS[privateUseAreaIndex][0];
    var privateUseOffetEnd = PRIVATE_USE_AREAS[privateUseAreaIndex][1];
    for (var originalCharCode in charCodeToGlyphId) {
      originalCharCode |= 0;
      var glyphId = charCodeToGlyphId[originalCharCode];
      // For missing glyphs don't create the mappings so the glyph isn't
      // drawn.
      if (!hasGlyph(glyphId)) {
        continue;
      }
      if (nextAvailableFontCharCode > privateUseOffetEnd) {
        privateUseAreaIndex++;
        if (privateUseAreaIndex >= PRIVATE_USE_AREAS.length) {
          warn("Ran out of space in font private use area.");
          break;
        }
        nextAvailableFontCharCode = PRIVATE_USE_AREAS[privateUseAreaIndex][0];
        privateUseOffetEnd = PRIVATE_USE_AREAS[privateUseAreaIndex][1];
      }
      var fontCharCode = nextAvailableFontCharCode++;
      if (glyphId === 0) {
        glyphId = newGlyphZeroId;
      }

      newMap[fontCharCode] = glyphId;
      toFontChar[originalCharCode] = fontCharCode;
    }
    return {
      toFontChar,
      charCodeToGlyphId: newMap,
      nextAvailableFontCharCode,
    };
  }

  function getRanges(glyphs, numGlyphs) {
    // Array.sort() sorts by characters, not numerically, so convert to an
    // array of characters.
    var codes = [];
    for (var charCode in glyphs) {
      // Remove an invalid glyph ID mappings to make OTS happy.
      if (glyphs[charCode] >= numGlyphs) {
        continue;
      }
      codes.push({ fontCharCode: charCode | 0, glyphId: glyphs[charCode] });
    }
    // Some fonts have zero glyphs and are used only for text selection, but
    // there needs to be at least one to build a valid cmap table.
    if (codes.length === 0) {
      codes.push({ fontCharCode: 0, glyphId: 0 });
    }
    codes.sort(function fontGetRangesSort(a, b) {
      return a.fontCharCode - b.fontCharCode;
    });

    // Split the sorted codes into ranges.
    var ranges = [];
    var length = codes.length;
    for (var n = 0; n < length; ) {
      var start = codes[n].fontCharCode;
      var codeIndices = [codes[n].glyphId];
      ++n;
      var end = start;
      while (n < length && end + 1 === codes[n].fontCharCode) {
        codeIndices.push(codes[n].glyphId);
        ++end;
        ++n;
        if (end === 0xffff) {
          break;
        }
      }
      ranges.push([start, end, codeIndices]);
    }

    return ranges;
  }

  function createCmapTable(glyphs, numGlyphs) {
    var ranges = getRanges(glyphs, numGlyphs);
    var numTables = ranges[ranges.length - 1][1] > 0xffff ? 2 : 1;
    var cmap =
      "\x00\x00" + // version
      string16(numTables) + // numTables
      "\x00\x03" + // platformID
      "\x00\x01" + // encodingID
      string32(4 + numTables * 8); // start of the table record

    var i, ii, j, jj;
    for (i = ranges.length - 1; i >= 0; --i) {
      if (ranges[i][0] <= 0xffff) {
        break;
      }
    }
    var bmpLength = i + 1;

    if (ranges[i][0] < 0xffff && ranges[i][1] === 0xffff) {
      ranges[i][1] = 0xfffe;
    }
    var trailingRangesCount = ranges[i][1] < 0xffff ? 1 : 0;
    var segCount = bmpLength + trailingRangesCount;
    var searchParams = OpenTypeFileBuilder.getSearchParams(segCount, 2);

    // Fill up the 4 parallel arrays describing the segments.
    var startCount = "";
    var endCount = "";
    var idDeltas = "";
    var idRangeOffsets = "";
    var glyphsIds = "";
    var bias = 0;

    var range, start, end, codes;
    for (i = 0, ii = bmpLength; i < ii; i++) {
      range = ranges[i];
      start = range[0];
      end = range[1];
      startCount += string16(start);
      endCount += string16(end);
      codes = range[2];
      var contiguous = true;
      for (j = 1, jj = codes.length; j < jj; ++j) {
        if (codes[j] !== codes[j - 1] + 1) {
          contiguous = false;
          break;
        }
      }
      if (!contiguous) {
        var offset = (segCount - i) * 2 + bias * 2;
        bias += end - start + 1;

        idDeltas += string16(0);
        idRangeOffsets += string16(offset);

        for (j = 0, jj = codes.length; j < jj; ++j) {
          glyphsIds += string16(codes[j]);
        }
      } else {
        var startCode = codes[0];

        idDeltas += string16((startCode - start) & 0xffff);
        idRangeOffsets += string16(0);
      }
    }

    if (trailingRangesCount > 0) {
      endCount += "\xFF\xFF";
      startCount += "\xFF\xFF";
      idDeltas += "\x00\x01";
      idRangeOffsets += "\x00\x00";
    }

    var format314 =
      "\x00\x00" + // language
      string16(2 * segCount) +
      string16(searchParams.range) +
      string16(searchParams.entry) +
      string16(searchParams.rangeShift) +
      endCount +
      "\x00\x00" +
      startCount +
      idDeltas +
      idRangeOffsets +
      glyphsIds;

    var format31012 = "";
    var header31012 = "";
    if (numTables > 1) {
      cmap +=
        "\x00\x03" + // platformID
        "\x00\x0A" + // encodingID
        string32(4 + numTables * 8 + 4 + format314.length); // start of the table record
      format31012 = "";
      for (i = 0, ii = ranges.length; i < ii; i++) {
        range = ranges[i];
        start = range[0];
        codes = range[2];
        var code = codes[0];
        for (j = 1, jj = codes.length; j < jj; ++j) {
          if (codes[j] !== codes[j - 1] + 1) {
            end = range[0] + j - 1;
            format31012 +=
              string32(start) + // startCharCode
              string32(end) + // endCharCode
              string32(code); // startGlyphID
            start = end + 1;
            code = codes[j];
          }
        }
        format31012 +=
          string32(start) + // startCharCode
          string32(range[1]) + // endCharCode
          string32(code); // startGlyphID
      }
      header31012 =
        "\x00\x0C" + // format
        "\x00\x00" + // reserved
        string32(format31012.length + 16) + // length
        "\x00\x00\x00\x00" + // language
        string32(format31012.length / 12); // nGroups
    }

    return (
      cmap +
      "\x00\x04" + // format
      string16(format314.length + 4) + // length
      format314 +
      header31012 +
      format31012
    );
  }

  function validateOS2Table(os2) {
    var stream = new Stream(os2.data);
    var version = stream.getUint16();
    // TODO verify all OS/2 tables fields, but currently we validate only those
    // that give us issues
    stream.getBytes(60); // skipping type, misc sizes, panose, unicode ranges
    var selection = stream.getUint16();
    if (version < 4 && selection & 0x0300) {
      return false;
    }
    var firstChar = stream.getUint16();
    var lastChar = stream.getUint16();
    if (firstChar > lastChar) {
      return false;
    }
    stream.getBytes(6); // skipping sTypoAscender/Descender/LineGap
    var usWinAscent = stream.getUint16();
    if (usWinAscent === 0) {
      // makes font unreadable by windows
      return false;
    }

    // OS/2 appears to be valid, resetting some fields
    os2.data[8] = os2.data[9] = 0; // IE rejects fonts if fsType != 0
    return true;
  }

  function createOS2Table(properties, charstrings, override) {
    override = override || {
      unitsPerEm: 0,
      yMax: 0,
      yMin: 0,
      ascent: 0,
      descent: 0,
    };

    var ulUnicodeRange1 = 0;
    var ulUnicodeRange2 = 0;
    var ulUnicodeRange3 = 0;
    var ulUnicodeRange4 = 0;

    var firstCharIndex = null;
    var lastCharIndex = 0;

    if (charstrings) {
      for (var code in charstrings) {
        code |= 0;
        if (firstCharIndex > code || !firstCharIndex) {
          firstCharIndex = code;
        }
        if (lastCharIndex < code) {
          lastCharIndex = code;
        }

        var position = getUnicodeRangeFor(code);
        if (position < 32) {
          ulUnicodeRange1 |= 1 << position;
        } else if (position < 64) {
          ulUnicodeRange2 |= 1 << (position - 32);
        } else if (position < 96) {
          ulUnicodeRange3 |= 1 << (position - 64);
        } else if (position < 123) {
          ulUnicodeRange4 |= 1 << (position - 96);
        } else {
          throw new FormatError(
            "Unicode ranges Bits > 123 are reserved for internal usage"
          );
        }
      }
      if (lastCharIndex > 0xffff) {
        // OS2 only supports a 16 bit int. The spec says if supplementary
        // characters are used the field should just be set to 0xFFFF.
        lastCharIndex = 0xffff;
      }
    } else {
      // TODO
      firstCharIndex = 0;
      lastCharIndex = 255;
    }

    var bbox = properties.bbox || [0, 0, 0, 0];
    var unitsPerEm =
      override.unitsPerEm ||
      1 / (properties.fontMatrix || FONT_IDENTITY_MATRIX)[0];

    // if the font units differ to the PDF glyph space units
    // then scale up the values
    var scale = properties.ascentScaled
      ? 1.0
      : unitsPerEm / PDF_GLYPH_SPACE_UNITS;

    var typoAscent =
      override.ascent || Math.round(scale * (properties.ascent || bbox[3]));
    var typoDescent =
      override.descent || Math.round(scale * (properties.descent || bbox[1]));
    if (typoDescent > 0 && properties.descent > 0 && bbox[1] < 0) {
      typoDescent = -typoDescent; // fixing incorrect descent
    }
    var winAscent = override.yMax || typoAscent;
    var winDescent = -override.yMin || -typoDescent;

    return (
      "\x00\x03" + // version
      "\x02\x24" + // xAvgCharWidth
      "\x01\xF4" + // usWeightClass
      "\x00\x05" + // usWidthClass
      "\x00\x00" + // fstype (0 to let the font loads via font-face on IE)
      "\x02\x8A" + // ySubscriptXSize
      "\x02\xBB" + // ySubscriptYSize
      "\x00\x00" + // ySubscriptXOffset
      "\x00\x8C" + // ySubscriptYOffset
      "\x02\x8A" + // ySuperScriptXSize
      "\x02\xBB" + // ySuperScriptYSize
      "\x00\x00" + // ySuperScriptXOffset
      "\x01\xDF" + // ySuperScriptYOffset
      "\x00\x31" + // yStrikeOutSize
      "\x01\x02" + // yStrikeOutPosition
      "\x00\x00" + // sFamilyClass
      "\x00\x00\x06" +
      String.fromCharCode(properties.fixedPitch ? 0x09 : 0x00) +
      "\x00\x00\x00\x00\x00\x00" + // Panose
      string32(ulUnicodeRange1) + // ulUnicodeRange1 (Bits 0-31)
      string32(ulUnicodeRange2) + // ulUnicodeRange2 (Bits 32-63)
      string32(ulUnicodeRange3) + // ulUnicodeRange3 (Bits 64-95)
      string32(ulUnicodeRange4) + // ulUnicodeRange4 (Bits 96-127)
      "\x2A\x32\x31\x2A" + // achVendID
      string16(properties.italicAngle ? 1 : 0) + // fsSelection
      string16(firstCharIndex || properties.firstChar) + // usFirstCharIndex
      string16(lastCharIndex || properties.lastChar) + // usLastCharIndex
      string16(typoAscent) + // sTypoAscender
      string16(typoDescent) + // sTypoDescender
      "\x00\x64" + // sTypoLineGap (7%-10% of the unitsPerEM value)
      string16(winAscent) + // usWinAscent
      string16(winDescent) + // usWinDescent
      "\x00\x00\x00\x00" + // ulCodePageRange1 (Bits 0-31)
      "\x00\x00\x00\x00" + // ulCodePageRange2 (Bits 32-63)
      string16(properties.xHeight) + // sxHeight
      string16(properties.capHeight) + // sCapHeight
      string16(0) + // usDefaultChar
      string16(firstCharIndex || properties.firstChar) + // usBreakChar
      "\x00\x03"
    ); // usMaxContext
  }

  function createPostTable(properties) {
    var angle = Math.floor(properties.italicAngle * Math.pow(2, 16));
    return (
      "\x00\x03\x00\x00" + // Version number
      string32(angle) + // italicAngle
      "\x00\x00" + // underlinePosition
      "\x00\x00" + // underlineThickness
      string32(properties.fixedPitch) + // isFixedPitch
      "\x00\x00\x00\x00" + // minMemType42
      "\x00\x00\x00\x00" + // maxMemType42
      "\x00\x00\x00\x00" + // minMemType1
      "\x00\x00\x00\x00"
    ); // maxMemType1
  }

  function createNameTable(name, proto) {
    if (!proto) {
      proto = [[], []]; // no strings and unicode strings
    }

    var strings = [
      proto[0][0] || "Original licence", // 0.Copyright
      proto[0][1] || name, // 1.Font family
      proto[0][2] || "Unknown", // 2.Font subfamily (font weight)
      proto[0][3] || "uniqueID", // 3.Unique ID
      proto[0][4] || name, // 4.Full font name
      proto[0][5] || "Version 0.11", // 5.Version
      proto[0][6] || "", // 6.Postscript name
      proto[0][7] || "Unknown", // 7.Trademark
      proto[0][8] || "Unknown", // 8.Manufacturer
      proto[0][9] || "Unknown", // 9.Designer
    ];

    // Mac want 1-byte per character strings while Windows want
    // 2-bytes per character, so duplicate the names table
    var stringsUnicode = [];
    var i, ii, j, jj, str;
    for (i = 0, ii = strings.length; i < ii; i++) {
      str = proto[1][i] || strings[i];

      var strBufUnicode = [];
      for (j = 0, jj = str.length; j < jj; j++) {
        strBufUnicode.push(string16(str.charCodeAt(j)));
      }
      stringsUnicode.push(strBufUnicode.join(""));
    }

    var names = [strings, stringsUnicode];
    var platforms = ["\x00\x01", "\x00\x03"];
    var encodings = ["\x00\x00", "\x00\x01"];
    var languages = ["\x00\x00", "\x04\x09"];

    var namesRecordCount = strings.length * platforms.length;
    var nameTable =
      "\x00\x00" + // format
      string16(namesRecordCount) + // Number of names Record
      string16(namesRecordCount * 12 + 6); // Storage

    // Build the name records field
    var strOffset = 0;
    for (i = 0, ii = platforms.length; i < ii; i++) {
      var strs = names[i];
      for (j = 0, jj = strs.length; j < jj; j++) {
        str = strs[j];
        var nameRecord =
          platforms[i] + // platform ID
          encodings[i] + // encoding ID
          languages[i] + // language ID
          string16(j) + // name ID
          string16(str.length) +
          string16(strOffset);
        nameTable += nameRecord;
        strOffset += str.length;
      }
    }

    nameTable += strings.join("") + stringsUnicode.join("");
    return nameTable;
  }

  Font.prototype = {
    name: null,
    font: null,
    mimetype: null,
    encoding: null,
    disableFontFace: false,

    get renderer() {
      var renderer = FontRendererFactory.create(this, SEAC_ANALYSIS_ENABLED);
      return shadow(this, "renderer", renderer);
    },

    exportData: function Font_exportData() {
      // TODO remove enumerating of the properties, e.g. hardcode exact names.
      var data = {};
      for (var i in this) {
        if (this.hasOwnProperty(i)) {
          data[i] = this[i];
        }
      }
      return data;
    },

    fallbackToSystemFont: function Font_fallbackToSystemFont() {
      this.missingFile = true;
      var charCode, unicode;
      // The file data is not specified. Trying to fix the font name
      // to be used with the canvas.font.
      var name = this.name;
      var type = this.type;
      var subtype = this.subtype;
      let fontName = name.replace(/[,_]/g, "-").replace(/\s/g, "");
      var stdFontMap = getStdFontMap(),
        nonStdFontMap = getNonStdFontMap();
      var isStandardFont =
        !!stdFontMap[fontName] ||
        !!(nonStdFontMap[fontName] && stdFontMap[nonStdFontMap[fontName]]);
      fontName = stdFontMap[fontName] || nonStdFontMap[fontName] || fontName;

      this.bold = fontName.search(/bold/gi) !== -1;
      this.italic =
        fontName.search(/oblique/gi) !== -1 ||
        fontName.search(/italic/gi) !== -1;

      // Use 'name' instead of 'fontName' here because the original
      // name ArialBlack for example will be replaced by Helvetica.
      this.black = name.search(/Black/g) !== -1;

      // if at least one width is present, remeasure all chars when exists
      this.remeasure = Object.keys(this.widths).length > 0;
      if (
        isStandardFont &&
        type === "CIDFontType2" &&
        this.cidEncoding.startsWith("Identity-")
      ) {
        const GlyphMapForStandardFonts = getGlyphMapForStandardFonts();
        // Standard fonts might be embedded as CID font without glyph mapping.
        // Building one based on GlyphMapForStandardFonts.
        const map = [];
        for (charCode in GlyphMapForStandardFonts) {
          map[+charCode] = GlyphMapForStandardFonts[charCode];
        }
        if (/Arial-?Black/i.test(name)) {
          var SupplementalGlyphMapForArialBlack = getSupplementalGlyphMapForArialBlack();
          for (charCode in SupplementalGlyphMapForArialBlack) {
            map[+charCode] = SupplementalGlyphMapForArialBlack[charCode];
          }
        } else if (/Calibri/i.test(name)) {
          const SupplementalGlyphMapForCalibri = getSupplementalGlyphMapForCalibri();
          for (charCode in SupplementalGlyphMapForCalibri) {
            map[+charCode] = SupplementalGlyphMapForCalibri[charCode];
          }
        }

        var isIdentityUnicode = this.toUnicode instanceof IdentityToUnicodeMap;
        if (!isIdentityUnicode) {
          this.toUnicode.forEach(function(charCode, unicodeCharCode) {
            map[+charCode] = unicodeCharCode;
          });
        }
        this.toFontChar = map;
        this.toUnicode = new ToUnicodeMap(map);
      } else if (/Symbol/i.test(fontName)) {
        this.toFontChar = buildToFontChar(
          SymbolSetEncoding,
          getGlyphsUnicode(),
          this.differences
        );
      } else if (/Dingbats/i.test(fontName)) {
        if (/Wingdings/i.test(name)) {
          warn("Non-embedded Wingdings font, falling back to ZapfDingbats.");
        }
        this.toFontChar = buildToFontChar(
          ZapfDingbatsEncoding,
          getDingbatsGlyphsUnicode(),
          this.differences
        );
      } else if (isStandardFont) {
        this.toFontChar = buildToFontChar(
          this.defaultEncoding,
          getGlyphsUnicode(),
          this.differences
        );
      } else {
        const glyphsUnicodeMap = getGlyphsUnicode();
        const map = [];
        this.toUnicode.forEach((charCode, unicodeCharCode) => {
          if (!this.composite) {
            var glyphName =
              this.differences[charCode] || this.defaultEncoding[charCode];
            unicode = getUnicodeForGlyph(glyphName, glyphsUnicodeMap);
            if (unicode !== -1) {
              unicodeCharCode = unicode;
            }
          }
          map[+charCode] = unicodeCharCode;
        });

        // Attempt to improve the glyph mapping for (some) composite fonts that
        // appear to lack meaningful ToUnicode data.
        if (this.composite && this.toUnicode instanceof IdentityToUnicodeMap) {
          if (/Verdana/i.test(name)) {
            // Fixes issue11242_reduced.pdf
            const GlyphMapForStandardFonts = getGlyphMapForStandardFonts();
            for (charCode in GlyphMapForStandardFonts) {
              map[+charCode] = GlyphMapForStandardFonts[charCode];
            }
          }
        }
        this.toFontChar = map;
      }
      this.loadedName = fontName.split("-")[0];
      this.fontType = getFontType(type, subtype);
    },

    checkAndRepair: function Font_checkAndRepair(name, font, properties) {
      const VALID_TABLES = [
        "OS/2",
        "cmap",
        "head",
        "hhea",
        "hmtx",
        "maxp",
        "name",
        "post",
        "loca",
        "glyf",
        "fpgm",
        "prep",
        "cvt ",
        "CFF ",
      ];

      function readTables(file, numTables) {
        const tables = Object.create(null);
        tables["OS/2"] = null;
        tables["cmap"] = null;
        tables["head"] = null;
        tables["hhea"] = null;
        tables["hmtx"] = null;
        tables["maxp"] = null;
        tables["name"] = null;
        tables["post"] = null;

        for (let i = 0; i < numTables; i++) {
          const table = readTableEntry(font);
          if (!VALID_TABLES.includes(table.tag)) {
            continue; // skipping table if it's not a required or optional table
          }
          if (table.length === 0) {
            continue; // skipping empty tables
          }
          tables[table.tag] = table;
        }
        return tables;
      }

      function readTableEntry(file) {
        var tag = bytesToString(file.getBytes(4));

        var checksum = file.getInt32() >>> 0;
        var offset = file.getInt32() >>> 0;
        var length = file.getInt32() >>> 0;

        // Read the table associated data
        var previousPosition = file.pos;
        file.pos = file.start ? file.start : 0;
        file.skip(offset);
        var data = file.getBytes(length);
        file.pos = previousPosition;

        if (tag === "head") {
          // clearing checksum adjustment
          data[8] = data[9] = data[10] = data[11] = 0;
          data[17] |= 0x20; // Set font optimized for cleartype flag.
        }

        return {
          tag,
          checksum,
          length,
          offset,
          data,
        };
      }

      function readOpenTypeHeader(ttf) {
        return {
          version: bytesToString(ttf.getBytes(4)),
          numTables: ttf.getUint16(),
          searchRange: ttf.getUint16(),
          entrySelector: ttf.getUint16(),
          rangeShift: ttf.getUint16(),
        };
      }

      function readTrueTypeCollectionHeader(ttc) {
        const ttcTag = bytesToString(ttc.getBytes(4));
        assert(ttcTag === "ttcf", "Must be a TrueType Collection font.");

        const majorVersion = ttc.getUint16();
        const minorVersion = ttc.getUint16();
        const numFonts = ttc.getInt32() >>> 0;
        const offsetTable = [];
        for (let i = 0; i < numFonts; i++) {
          offsetTable.push(ttc.getInt32() >>> 0);
        }

        const header = {
          ttcTag,
          majorVersion,
          minorVersion,
          numFonts,
          offsetTable,
        };
        switch (majorVersion) {
          case 1:
            return header;
          case 2:
            header.dsigTag = ttc.getInt32() >>> 0;
            header.dsigLength = ttc.getInt32() >>> 0;
            header.dsigOffset = ttc.getInt32() >>> 0;
            return header;
        }
        throw new FormatError(
          `Invalid TrueType Collection majorVersion: ${majorVersion}.`
        );
      }

      function readTrueTypeCollectionData(ttc, fontName) {
        const { numFonts, offsetTable } = readTrueTypeCollectionHeader(ttc);

        for (let i = 0; i < numFonts; i++) {
          ttc.pos = (ttc.start || 0) + offsetTable[i];
          const potentialHeader = readOpenTypeHeader(ttc);
          const potentialTables = readTables(ttc, potentialHeader.numTables);

          if (!potentialTables["name"]) {
            throw new FormatError(
              'TrueType Collection font must contain a "name" table.'
            );
          }
          const nameTable = readNameTable(potentialTables["name"]);

          for (let j = 0, jj = nameTable.length; j < jj; j++) {
            for (let k = 0, kk = nameTable[j].length; k < kk; k++) {
              const nameEntry = nameTable[j][k];
              if (nameEntry && nameEntry.replace(/\s/g, "") === fontName) {
                return {
                  header: potentialHeader,
                  tables: potentialTables,
                };
              }
            }
          }
        }
        throw new FormatError(
          `TrueType Collection does not contain "${fontName}" font.`
        );
      }

      /**
       * Read the appropriate subtable from the cmap according to 9.6.6.4 from
       * PDF spec
       */
      function readCmapTable(cmap, font, isSymbolicFont, hasEncoding) {
        if (!cmap) {
          warn("No cmap table available.");
          return {
            platformId: -1,
            encodingId: -1,
            mappings: [],
            hasShortCmap: false,
          };
        }
        var segment;
        var start = (font.start ? font.start : 0) + cmap.offset;
        font.pos = start;

        font.getUint16(); // version
        var numTables = font.getUint16();

        var potentialTable;
        var canBreak = false;
        // There's an order of preference in terms of which cmap subtable to
        // use:
        // - non-symbolic fonts the preference is a 3,1 table then a 1,0 table
        // - symbolic fonts the preference is a 3,0 table then a 1,0 table
        // The following takes advantage of the fact that the tables are sorted
        // to work.
        for (var i = 0; i < numTables; i++) {
          var platformId = font.getUint16();
          var encodingId = font.getUint16();
          var offset = font.getInt32() >>> 0;
          var useTable = false;

          // Sometimes there are multiple of the same type of table. Default
          // to choosing the first table and skip the rest.
          if (
            potentialTable &&
            potentialTable.platformId === platformId &&
            potentialTable.encodingId === encodingId
          ) {
            continue;
          }

          if (platformId === 0 && encodingId === 0) {
            useTable = true;
            // Continue the loop since there still may be a higher priority
            // table.
          } else if (platformId === 1 && encodingId === 0) {
            useTable = true;
            // Continue the loop since there still may be a higher priority
            // table.
          } else if (
            platformId === 3 &&
            encodingId === 1 &&
            (hasEncoding || !potentialTable)
          ) {
            useTable = true;
            if (!isSymbolicFont) {
              canBreak = true;
            }
          } else if (isSymbolicFont && platformId === 3 && encodingId === 0) {
            useTable = true;
            canBreak = true;
          }

          if (useTable) {
            potentialTable = {
              platformId,
              encodingId,
              offset,
            };
          }
          if (canBreak) {
            break;
          }
        }

        if (potentialTable) {
          font.pos = start + potentialTable.offset;
        }
        if (!potentialTable || font.peekByte() === -1) {
          warn("Could not find a preferred cmap table.");
          return {
            platformId: -1,
            encodingId: -1,
            mappings: [],
            hasShortCmap: false,
          };
        }

        var format = font.getUint16();
        font.getUint16(); // length
        font.getUint16(); // language

        var hasShortCmap = false;
        var mappings = [];
        var j, glyphId;

        // TODO(mack): refactor this cmap subtable reading logic out
        if (format === 0) {
          for (j = 0; j < 256; j++) {
            var index = font.getByte();
            if (!index) {
              continue;
            }
            mappings.push({
              charCode: j,
              glyphId: index,
            });
          }
          hasShortCmap = true;
        } else if (format === 4) {
          // re-creating the table in format 4 since the encoding
          // might be changed
          var segCount = font.getUint16() >> 1;
          font.getBytes(6); // skipping range fields
          var segIndex,
            segments = [];
          for (segIndex = 0; segIndex < segCount; segIndex++) {
            segments.push({ end: font.getUint16() });
          }
          font.getUint16();
          for (segIndex = 0; segIndex < segCount; segIndex++) {
            segments[segIndex].start = font.getUint16();
          }

          for (segIndex = 0; segIndex < segCount; segIndex++) {
            segments[segIndex].delta = font.getUint16();
          }

          var offsetsCount = 0;
          for (segIndex = 0; segIndex < segCount; segIndex++) {
            segment = segments[segIndex];
            var rangeOffset = font.getUint16();
            if (!rangeOffset) {
              segment.offsetIndex = -1;
              continue;
            }

            var offsetIndex = (rangeOffset >> 1) - (segCount - segIndex);
            segment.offsetIndex = offsetIndex;
            offsetsCount = Math.max(
              offsetsCount,
              offsetIndex + segment.end - segment.start + 1
            );
          }

          var offsets = [];
          for (j = 0; j < offsetsCount; j++) {
            offsets.push(font.getUint16());
          }

          for (segIndex = 0; segIndex < segCount; segIndex++) {
            segment = segments[segIndex];
            start = segment.start;
            var end = segment.end;
            var delta = segment.delta;
            offsetIndex = segment.offsetIndex;

            for (j = start; j <= end; j++) {
              if (j === 0xffff) {
                continue;
              }

              glyphId = offsetIndex < 0 ? j : offsets[offsetIndex + j - start];
              glyphId = (glyphId + delta) & 0xffff;
              mappings.push({
                charCode: j,
                glyphId,
              });
            }
          }
        } else if (format === 6) {
          // Format 6 is a 2-bytes dense mapping, which means the font data
          // lives glue together even if they are pretty far in the unicode
          // table. (This looks weird, so I can have missed something), this
          // works on Linux but seems to fails on Mac so let's rewrite the
          // cmap table to a 3-1-4 style
          var firstCode = font.getUint16();
          var entryCount = font.getUint16();

          for (j = 0; j < entryCount; j++) {
            glyphId = font.getUint16();
            var charCode = firstCode + j;

            mappings.push({
              charCode,
              glyphId,
            });
          }
        } else {
          warn("cmap table has unsupported format: " + format);
          return {
            platformId: -1,
            encodingId: -1,
            mappings: [],
            hasShortCmap: false,
          };
        }

        // removing duplicate entries
        mappings.sort(function(a, b) {
          return a.charCode - b.charCode;
        });
        for (i = 1; i < mappings.length; i++) {
          if (mappings[i - 1].charCode === mappings[i].charCode) {
            mappings.splice(i, 1);
            i--;
          }
        }

        return {
          platformId: potentialTable.platformId,
          encodingId: potentialTable.encodingId,
          mappings,
          hasShortCmap,
        };
      }

      function sanitizeMetrics(
        font,
        header,
        metrics,
        numGlyphs,
        dupFirstEntry
      ) {
        if (!header) {
          if (metrics) {
            metrics.data = null;
          }
          return;
        }

        font.pos = (font.start ? font.start : 0) + header.offset;
        font.pos += 4; // version
        font.pos += 2; // ascent
        font.pos += 2; // descent
        font.pos += 2; // linegap
        font.pos += 2; // adv_width_max
        font.pos += 2; // min_sb1
        font.pos += 2; // min_sb2
        font.pos += 2; // max_extent
        font.pos += 2; // caret_slope_rise
        font.pos += 2; // caret_slope_run
        font.pos += 2; // caret_offset
        font.pos += 8; // reserved
        font.pos += 2; // format
        var numOfMetrics = font.getUint16();

        if (numOfMetrics > numGlyphs) {
          info(
            "The numOfMetrics (" +
              numOfMetrics +
              ") should not be " +
              "greater than the numGlyphs (" +
              numGlyphs +
              ")"
          );
          // Reduce numOfMetrics if it is greater than numGlyphs
          numOfMetrics = numGlyphs;
          header.data[34] = (numOfMetrics & 0xff00) >> 8;
          header.data[35] = numOfMetrics & 0x00ff;
        }

        var numOfSidebearings = numGlyphs - numOfMetrics;
        var numMissing =
          numOfSidebearings - ((metrics.length - numOfMetrics * 4) >> 1);

        if (numMissing > 0) {
          // For each missing glyph, we set both the width and lsb to 0 (zero).
          // Since we need to add two properties for each glyph, this explains
          // the use of |numMissing * 2| when initializing the typed array.
          var entries = new Uint8Array(metrics.length + numMissing * 2);
          entries.set(metrics.data);
          if (dupFirstEntry) {
            // Set the sidebearing value of the duplicated glyph.
            entries[metrics.length] = metrics.data[2];
            entries[metrics.length + 1] = metrics.data[3];
          }
          metrics.data = entries;
        }
      }

      function sanitizeGlyph(
        source,
        sourceStart,
        sourceEnd,
        dest,
        destStart,
        hintsValid
      ) {
        var glyphProfile = {
          length: 0,
          sizeOfInstructions: 0,
        };
        if (sourceEnd - sourceStart <= 12) {
          // glyph with data less than 12 is invalid one
          return glyphProfile;
        }
        var glyf = source.subarray(sourceStart, sourceEnd);
        var contoursCount = signedInt16(glyf[0], glyf[1]);
        if (contoursCount < 0) {
          // OTS doesn't like contour count to be less than -1.
          contoursCount = -1;
          writeSignedInt16(glyf, 0, contoursCount);
          // complex glyph, writing as is
          dest.set(glyf, destStart);
          glyphProfile.length = glyf.length;
          return glyphProfile;
        }

        var i,
          j = 10,
          flagsCount = 0;
        for (i = 0; i < contoursCount; i++) {
          var endPoint = (glyf[j] << 8) | glyf[j + 1];
          flagsCount = endPoint + 1;
          j += 2;
        }
        // skipping instructions
        var instructionsStart = j;
        var instructionsLength = (glyf[j] << 8) | glyf[j + 1];
        glyphProfile.sizeOfInstructions = instructionsLength;
        j += 2 + instructionsLength;
        var instructionsEnd = j;
        // validating flags
        var coordinatesLength = 0;
        for (i = 0; i < flagsCount; i++) {
          var flag = glyf[j++];
          if (flag & 0xc0) {
            // reserved flags must be zero, cleaning up
            glyf[j - 1] = flag & 0x3f;
          }
          let xLength = 2;
          if (flag & 2) {
            xLength = 1;
          } else if (flag & 16) {
            xLength = 0;
          }
          let yLength = 2;
          if (flag & 4) {
            yLength = 1;
          } else if (flag & 32) {
            yLength = 0;
          }
          const xyLength = xLength + yLength;
          coordinatesLength += xyLength;
          if (flag & 8) {
            var repeat = glyf[j++];
            i += repeat;
            coordinatesLength += repeat * xyLength;
          }
        }
        // glyph without coordinates will be rejected
        if (coordinatesLength === 0) {
          return glyphProfile;
        }
        var glyphDataLength = j + coordinatesLength;
        if (glyphDataLength > glyf.length) {
          // not enough data for coordinates
          return glyphProfile;
        }
        if (!hintsValid && instructionsLength > 0) {
          dest.set(glyf.subarray(0, instructionsStart), destStart);
          dest.set([0, 0], destStart + instructionsStart);
          dest.set(
            glyf.subarray(instructionsEnd, glyphDataLength),
            destStart + instructionsStart + 2
          );
          glyphDataLength -= instructionsLength;
          if (glyf.length - glyphDataLength > 3) {
            glyphDataLength = (glyphDataLength + 3) & ~3;
          }
          glyphProfile.length = glyphDataLength;
          return glyphProfile;
        }
        if (glyf.length - glyphDataLength > 3) {
          // truncating and aligning to 4 bytes the long glyph data
          glyphDataLength = (glyphDataLength + 3) & ~3;
          dest.set(glyf.subarray(0, glyphDataLength), destStart);
          glyphProfile.length = glyphDataLength;
          return glyphProfile;
        }
        // glyph data is fine
        dest.set(glyf, destStart);
        glyphProfile.length = glyf.length;
        return glyphProfile;
      }

      function sanitizeHead(head, numGlyphs, locaLength) {
        var data = head.data;

        // Validate version:
        // Should always be 0x00010000
        var version = int32(data[0], data[1], data[2], data[3]);
        if (version >> 16 !== 1) {
          info("Attempting to fix invalid version in head table: " + version);
          data[0] = 0;
          data[1] = 1;
          data[2] = 0;
          data[3] = 0;
        }

        var indexToLocFormat = int16(data[50], data[51]);
        if (indexToLocFormat < 0 || indexToLocFormat > 1) {
          info(
            "Attempting to fix invalid indexToLocFormat in head table: " +
              indexToLocFormat
          );

          // The value of indexToLocFormat should be 0 if the loca table
          // consists of short offsets, and should be 1 if the loca table
          // consists of long offsets.
          //
          // The number of entries in the loca table should be numGlyphs + 1.
          //
          // Using this information, we can work backwards to deduce if the
          // size of each offset in the loca table, and thus figure out the
          // appropriate value for indexToLocFormat.

          var numGlyphsPlusOne = numGlyphs + 1;
          if (locaLength === numGlyphsPlusOne << 1) {
            // 0x0000 indicates the loca table consists of short offsets
            data[50] = 0;
            data[51] = 0;
          } else if (locaLength === numGlyphsPlusOne << 2) {
            // 0x0001 indicates the loca table consists of long offsets
            data[50] = 0;
            data[51] = 1;
          } else {
            throw new FormatError(
              "Could not fix indexToLocFormat: " + indexToLocFormat
            );
          }
        }
      }

      function sanitizeGlyphLocations(
        loca,
        glyf,
        numGlyphs,
        isGlyphLocationsLong,
        hintsValid,
        dupFirstEntry,
        maxSizeOfInstructions
      ) {
        var itemSize, itemDecode, itemEncode;
        if (isGlyphLocationsLong) {
          itemSize = 4;
          itemDecode = function fontItemDecodeLong(data, offset) {
            return (
              (data[offset] << 24) |
              (data[offset + 1] << 16) |
              (data[offset + 2] << 8) |
              data[offset + 3]
            );
          };
          itemEncode = function fontItemEncodeLong(data, offset, value) {
            data[offset] = (value >>> 24) & 0xff;
            data[offset + 1] = (value >> 16) & 0xff;
            data[offset + 2] = (value >> 8) & 0xff;
            data[offset + 3] = value & 0xff;
          };
        } else {
          itemSize = 2;
          itemDecode = function fontItemDecode(data, offset) {
            return (data[offset] << 9) | (data[offset + 1] << 1);
          };
          itemEncode = function fontItemEncode(data, offset, value) {
            data[offset] = (value >> 9) & 0xff;
            data[offset + 1] = (value >> 1) & 0xff;
          };
        }
        // The first glyph is duplicated.
        var numGlyphsOut = dupFirstEntry ? numGlyphs + 1 : numGlyphs;
        var locaDataSize = itemSize * (1 + numGlyphsOut);
        // Resize loca table to account for duplicated glyph.
        var locaData = new Uint8Array(locaDataSize);
        locaData.set(loca.data.subarray(0, locaDataSize));
        loca.data = locaData;
        // removing the invalid glyphs
        var oldGlyfData = glyf.data;
        var oldGlyfDataLength = oldGlyfData.length;
        var newGlyfData = new Uint8Array(oldGlyfDataLength);
        var startOffset = itemDecode(locaData, 0);
        var writeOffset = 0;
        var missingGlyphs = Object.create(null);
        itemEncode(locaData, 0, writeOffset);
        var i, j;
        for (i = 0, j = itemSize; i < numGlyphs; i++, j += itemSize) {
          var endOffset = itemDecode(locaData, j);
          // The spec says the offsets should be in ascending order, however
          // some fonts use the offset of 0 to mark a glyph as missing.
          if (endOffset === 0) {
            endOffset = startOffset;
          }
          if (
            endOffset > oldGlyfDataLength &&
            ((oldGlyfDataLength + 3) & ~3) === endOffset
          ) {
            // Aspose breaks fonts by aligning the glyphs to the qword, but not
            // the glyf table size, which makes last glyph out of range.
            endOffset = oldGlyfDataLength;
          }
          if (endOffset > oldGlyfDataLength) {
            // glyph end offset points outside glyf data, rejecting the glyph
            startOffset = endOffset;
          }

          var glyphProfile = sanitizeGlyph(
            oldGlyfData,
            startOffset,
            endOffset,
            newGlyfData,
            writeOffset,
            hintsValid
          );
          var newLength = glyphProfile.length;
          if (newLength === 0) {
            missingGlyphs[i] = true;
          }
          if (glyphProfile.sizeOfInstructions > maxSizeOfInstructions) {
            maxSizeOfInstructions = glyphProfile.sizeOfInstructions;
          }
          writeOffset += newLength;
          itemEncode(locaData, j, writeOffset);
          startOffset = endOffset;
        }

        if (writeOffset === 0) {
          // glyf table cannot be empty -- redoing the glyf and loca tables
          // to have single glyph with one point
          var simpleGlyph = new Uint8Array([
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            49,
            0,
          ]);
          for (i = 0, j = itemSize; i < numGlyphsOut; i++, j += itemSize) {
            itemEncode(locaData, j, simpleGlyph.length);
          }
          glyf.data = simpleGlyph;
        } else if (dupFirstEntry) {
          // Browsers will not display a glyph at position 0. Typically glyph 0
          // is notdef, but a number of fonts put a valid glyph there so it must
          // be duplicated and appended.
          var firstEntryLength = itemDecode(locaData, itemSize);
          if (newGlyfData.length > firstEntryLength + writeOffset) {
            glyf.data = newGlyfData.subarray(0, firstEntryLength + writeOffset);
          } else {
            glyf.data = new Uint8Array(firstEntryLength + writeOffset);
            glyf.data.set(newGlyfData.subarray(0, writeOffset));
          }
          glyf.data.set(newGlyfData.subarray(0, firstEntryLength), writeOffset);
          itemEncode(
            loca.data,
            locaData.length - itemSize,
            writeOffset + firstEntryLength
          );
        } else {
          glyf.data = newGlyfData.subarray(0, writeOffset);
        }
        return {
          missingGlyphs,
          maxSizeOfInstructions,
        };
      }

      function readPostScriptTable(post, properties, maxpNumGlyphs) {
        var start = (font.start ? font.start : 0) + post.offset;
        font.pos = start;

        var length = post.length,
          end = start + length;
        var version = font.getInt32();
        // skip rest to the tables
        font.getBytes(28);

        var glyphNames;
        var valid = true;
        var i;

        switch (version) {
          case 0x00010000:
            glyphNames = MacStandardGlyphOrdering;
            break;
          case 0x00020000:
            var numGlyphs = font.getUint16();
            if (numGlyphs !== maxpNumGlyphs) {
              valid = false;
              break;
            }
            var glyphNameIndexes = [];
            for (i = 0; i < numGlyphs; ++i) {
              var index = font.getUint16();
              if (index >= 32768) {
                valid = false;
                break;
              }
              glyphNameIndexes.push(index);
            }
            if (!valid) {
              break;
            }
            var customNames = [];
            var strBuf = [];
            while (font.pos < end) {
              var stringLength = font.getByte();
              strBuf.length = stringLength;
              for (i = 0; i < stringLength; ++i) {
                strBuf[i] = String.fromCharCode(font.getByte());
              }
              customNames.push(strBuf.join(""));
            }
            glyphNames = [];
            for (i = 0; i < numGlyphs; ++i) {
              var j = glyphNameIndexes[i];
              if (j < 258) {
                glyphNames.push(MacStandardGlyphOrdering[j]);
                continue;
              }
              glyphNames.push(customNames[j - 258]);
            }
            break;
          case 0x00030000:
            break;
          default:
            warn("Unknown/unsupported post table version " + version);
            valid = false;
            if (properties.defaultEncoding) {
              glyphNames = properties.defaultEncoding;
            }
            break;
        }
        properties.glyphNames = glyphNames;
        return valid;
      }

      function readNameTable(nameTable) {
        var start = (font.start ? font.start : 0) + nameTable.offset;
        font.pos = start;

        var names = [[], []];
        var length = nameTable.length,
          end = start + length;
        var format = font.getUint16();
        var FORMAT_0_HEADER_LENGTH = 6;
        if (format !== 0 || length < FORMAT_0_HEADER_LENGTH) {
          // unsupported name table format or table "too" small
          return names;
        }
        var numRecords = font.getUint16();
        var stringsStart = font.getUint16();
        var records = [];
        var NAME_RECORD_LENGTH = 12;
        var i, ii;

        for (
          i = 0;
          i < numRecords && font.pos + NAME_RECORD_LENGTH <= end;
          i++
        ) {
          var r = {
            platform: font.getUint16(),
            encoding: font.getUint16(),
            language: font.getUint16(),
            name: font.getUint16(),
            length: font.getUint16(),
            offset: font.getUint16(),
          };
          // using only Macintosh and Windows platform/encoding names
          if (
            (r.platform === 1 && r.encoding === 0 && r.language === 0) ||
            (r.platform === 3 && r.encoding === 1 && r.language === 0x409)
          ) {
            records.push(r);
          }
        }
        for (i = 0, ii = records.length; i < ii; i++) {
          var record = records[i];
          if (record.length <= 0) {
            continue; // Nothing to process, ignoring.
          }
          var pos = start + stringsStart + record.offset;
          if (pos + record.length > end) {
            continue; // outside of name table, ignoring
          }
          font.pos = pos;
          var nameIndex = record.name;
          if (record.encoding) {
            // unicode
            var str = "";
            for (var j = 0, jj = record.length; j < jj; j += 2) {
              str += String.fromCharCode(font.getUint16());
            }
            names[1][nameIndex] = str;
          } else {
            names[0][nameIndex] = bytesToString(font.getBytes(record.length));
          }
        }
        return names;
      }

      // prettier-ignore
      var TTOpsStackDeltas = [
        0, 0, 0, 0, 0, 0, 0, 0, -2, -2, -2, -2, 0, 0, -2, -5,
        -1, -1, -1, -1, -1, -1, -1, -1, 0, 0, -1, 0, -1, -1, -1, -1,
        1, -1, -999, 0, 1, 0, -1, -2, 0, -1, -2, -1, -1, 0, -1, -1,
        0, 0, -999, -999, -1, -1, -1, -1, -2, -999, -2, -2, -999, 0, -2, -2,
        0, 0, -2, 0, -2, 0, 0, 0, -2, -1, -1, 1, 1, 0, 0, -1,
        -1, -1, -1, -1, -1, -1, 0, 0, -1, 0, -1, -1, 0, -999, -1, -1,
        -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        -2, -999, -999, -999, -999, -999, -1, -1, -2, -2, 0, 0, 0, 0, -1, -1,
        -999, -2, -2, 0, 0, -1, -2, -2, 0, 0, 0, -1, -1, -1, -2];
      // 0xC0-DF == -1 and 0xE0-FF == -2

      function sanitizeTTProgram(table, ttContext) {
        var data = table.data;
        var i = 0,
          j,
          n,
          b,
          funcId,
          pc,
          lastEndf = 0,
          lastDeff = 0;
        var stack = [];
        var callstack = [];
        var functionsCalled = [];
        var tooComplexToFollowFunctions = ttContext.tooComplexToFollowFunctions;
        var inFDEF = false,
          ifLevel = 0,
          inELSE = 0;
        for (var ii = data.length; i < ii; ) {
          var op = data[i++];
          // The TrueType instruction set docs can be found at
          // https://developer.apple.com/fonts/TTRefMan/RM05/Chap5.html
          if (op === 0x40) {
            // NPUSHB - pushes n bytes
            n = data[i++];
            if (inFDEF || inELSE) {
              i += n;
            } else {
              for (j = 0; j < n; j++) {
                stack.push(data[i++]);
              }
            }
          } else if (op === 0x41) {
            // NPUSHW - pushes n words
            n = data[i++];
            if (inFDEF || inELSE) {
              i += n * 2;
            } else {
              for (j = 0; j < n; j++) {
                b = data[i++];
                stack.push((b << 8) | data[i++]);
              }
            }
          } else if ((op & 0xf8) === 0xb0) {
            // PUSHB - pushes bytes
            n = op - 0xb0 + 1;
            if (inFDEF || inELSE) {
              i += n;
            } else {
              for (j = 0; j < n; j++) {
                stack.push(data[i++]);
              }
            }
          } else if ((op & 0xf8) === 0xb8) {
            // PUSHW - pushes words
            n = op - 0xb8 + 1;
            if (inFDEF || inELSE) {
              i += n * 2;
            } else {
              for (j = 0; j < n; j++) {
                b = data[i++];
                stack.push((b << 8) | data[i++]);
              }
            }
          } else if (op === 0x2b && !tooComplexToFollowFunctions) {
            // CALL
            if (!inFDEF && !inELSE) {
              // collecting information about which functions are used
              funcId = stack[stack.length - 1];
              if (isNaN(funcId)) {
                info("TT: CALL empty stack (or invalid entry).");
              } else {
                ttContext.functionsUsed[funcId] = true;
                if (funcId in ttContext.functionsStackDeltas) {
                  const newStackLength =
                    stack.length + ttContext.functionsStackDeltas[funcId];
                  if (newStackLength < 0) {
                    warn("TT: CALL invalid functions stack delta.");
                    ttContext.hintsValid = false;
                    return;
                  }
                  stack.length = newStackLength;
                } else if (
                  funcId in ttContext.functionsDefined &&
                  !functionsCalled.includes(funcId)
                ) {
                  callstack.push({ data, i, stackTop: stack.length - 1 });
                  functionsCalled.push(funcId);
                  pc = ttContext.functionsDefined[funcId];
                  if (!pc) {
                    warn("TT: CALL non-existent function");
                    ttContext.hintsValid = false;
                    return;
                  }
                  data = pc.data;
                  i = pc.i;
                }
              }
            }
          } else if (op === 0x2c && !tooComplexToFollowFunctions) {
            // FDEF
            if (inFDEF || inELSE) {
              warn("TT: nested FDEFs not allowed");
              tooComplexToFollowFunctions = true;
            }
            inFDEF = true;
            // collecting information about which functions are defined
            lastDeff = i;
            funcId = stack.pop();
            ttContext.functionsDefined[funcId] = { data, i };
          } else if (op === 0x2d) {
            // ENDF - end of function
            if (inFDEF) {
              inFDEF = false;
              lastEndf = i;
            } else {
              pc = callstack.pop();
              if (!pc) {
                warn("TT: ENDF bad stack");
                ttContext.hintsValid = false;
                return;
              }
              funcId = functionsCalled.pop();
              data = pc.data;
              i = pc.i;
              ttContext.functionsStackDeltas[funcId] =
                stack.length - pc.stackTop;
            }
          } else if (op === 0x89) {
            // IDEF - instruction definition
            if (inFDEF || inELSE) {
              warn("TT: nested IDEFs not allowed");
              tooComplexToFollowFunctions = true;
            }
            inFDEF = true;
            // recording it as a function to track ENDF
            lastDeff = i;
          } else if (op === 0x58) {
            // IF
            ++ifLevel;
          } else if (op === 0x1b) {
            // ELSE
            inELSE = ifLevel;
          } else if (op === 0x59) {
            // EIF
            if (inELSE === ifLevel) {
              inELSE = 0;
            }
            --ifLevel;
          } else if (op === 0x1c) {
            // JMPR
            if (!inFDEF && !inELSE) {
              var offset = stack[stack.length - 1];
              // only jumping forward to prevent infinite loop
              if (offset > 0) {
                i += offset - 1;
              }
            }
          }
          // Adjusting stack not extactly, but just enough to get function id
          if (!inFDEF && !inELSE) {
            let stackDelta = 0;
            if (op <= 0x8e) {
              stackDelta = TTOpsStackDeltas[op];
            } else if (op >= 0xc0 && op <= 0xdf) {
              stackDelta = -1;
            } else if (op >= 0xe0) {
              stackDelta = -2;
            }
            if (op >= 0x71 && op <= 0x75) {
              n = stack.pop();
              if (!isNaN(n)) {
                stackDelta = -n * 2;
              }
            }
            while (stackDelta < 0 && stack.length > 0) {
              stack.pop();
              stackDelta++;
            }
            while (stackDelta > 0) {
              stack.push(NaN); // pushing any number into stack
              stackDelta--;
            }
          }
        }
        ttContext.tooComplexToFollowFunctions = tooComplexToFollowFunctions;
        var content = [data];
        if (i > data.length) {
          content.push(new Uint8Array(i - data.length));
        }
        if (lastDeff > lastEndf) {
          warn("TT: complementing a missing function tail");
          // new function definition started, but not finished
          // complete function by [CLEAR, ENDF]
          content.push(new Uint8Array([0x22, 0x2d]));
        }
        foldTTTable(table, content);
      }

      function checkInvalidFunctions(ttContext, maxFunctionDefs) {
        if (ttContext.tooComplexToFollowFunctions) {
          return;
        }
        if (ttContext.functionsDefined.length > maxFunctionDefs) {
          warn("TT: more functions defined than expected");
          ttContext.hintsValid = false;
          return;
        }
        for (var j = 0, jj = ttContext.functionsUsed.length; j < jj; j++) {
          if (j > maxFunctionDefs) {
            warn("TT: invalid function id: " + j);
            ttContext.hintsValid = false;
            return;
          }
          if (ttContext.functionsUsed[j] && !ttContext.functionsDefined[j]) {
            warn("TT: undefined function: " + j);
            ttContext.hintsValid = false;
            return;
          }
        }
      }

      function foldTTTable(table, content) {
        if (content.length > 1) {
          // concatenating the content items
          var newLength = 0;
          var j, jj;
          for (j = 0, jj = content.length; j < jj; j++) {
            newLength += content[j].length;
          }
          newLength = (newLength + 3) & ~3;
          var result = new Uint8Array(newLength);
          var pos = 0;
          for (j = 0, jj = content.length; j < jj; j++) {
            result.set(content[j], pos);
            pos += content[j].length;
          }
          table.data = result;
          table.length = newLength;
        }
      }

      function sanitizeTTPrograms(fpgm, prep, cvt, maxFunctionDefs) {
        var ttContext = {
          functionsDefined: [],
          functionsUsed: [],
          functionsStackDeltas: [],
          tooComplexToFollowFunctions: false,
          hintsValid: true,
        };
        if (fpgm) {
          sanitizeTTProgram(fpgm, ttContext);
        }
        if (prep) {
          sanitizeTTProgram(prep, ttContext);
        }
        if (fpgm) {
          checkInvalidFunctions(ttContext, maxFunctionDefs);
        }
        if (cvt && cvt.length & 1) {
          var cvtData = new Uint8Array(cvt.length + 1);
          cvtData.set(cvt.data);
          cvt.data = cvtData;
        }
        return ttContext.hintsValid;
      }

      // The following steps modify the original font data, making copy
      font = new Stream(new Uint8Array(font.getBytes()));

      let header, tables;
      if (isTrueTypeCollectionFile(font)) {
        const ttcData = readTrueTypeCollectionData(font, this.name);
        header = ttcData.header;
        tables = ttcData.tables;
      } else {
        header = readOpenTypeHeader(font);
        tables = readTables(font, header.numTables);
      }
      let cff, cffFile;

      var isTrueType = !tables["CFF "];
      if (!isTrueType) {
        const isComposite =
          properties.composite &&
          ((properties.cidToGidMap || []).length > 0 ||
            !(properties.cMap instanceof IdentityCMap));
        // OpenType font (skip composite fonts with non-default glyph mapping).
        if (
          (header.version === "OTTO" && !isComposite) ||
          !tables["head"] ||
          !tables["hhea"] ||
          !tables["maxp"] ||
          !tables["post"]
        ) {
          // No major tables: throwing everything at `CFFFont`.
          cffFile = new Stream(tables["CFF "].data);
          cff = new CFFFont(cffFile, properties);

          adjustWidths(properties);

          return this.convert(name, cff, properties);
        }

        delete tables["glyf"];
        delete tables["loca"];
        delete tables["fpgm"];
        delete tables["prep"];
        delete tables["cvt "];
        this.isOpenType = true;
      } else {
        if (!tables["loca"]) {
          throw new FormatError('Required "loca" table is not found');
        }
        if (!tables["glyf"]) {
          warn('Required "glyf" table is not found -- trying to recover.');
          // Note: We use `sanitizeGlyphLocations` to add dummy glyf data below.
          tables["glyf"] = {
            tag: "glyf",
            data: new Uint8Array(0),
          };
        }
        this.isOpenType = false;
      }

      if (!tables["maxp"]) {
        throw new FormatError('Required "maxp" table is not found');
      }

      font.pos = (font.start || 0) + tables["maxp"].offset;
      var version = font.getInt32();
      const numGlyphs = font.getUint16();
      // Glyph 0 is duplicated and appended.
      let numGlyphsOut = numGlyphs + 1;
      let dupFirstEntry = true;
      if (numGlyphsOut > 0xffff) {
        dupFirstEntry = false;
        numGlyphsOut = numGlyphs;
        warn("Not enough space in glyfs to duplicate first glyph.");
      }
      var maxFunctionDefs = 0;
      var maxSizeOfInstructions = 0;
      if (version >= 0x00010000 && tables["maxp"].length >= 22) {
        // maxZones can be invalid
        font.pos += 8;
        var maxZones = font.getUint16();
        if (maxZones > 2) {
          // reset to 2 if font has invalid maxZones
          tables["maxp"].data[14] = 0;
          tables["maxp"].data[15] = 2;
        }
        font.pos += 4;
        maxFunctionDefs = font.getUint16();
        font.pos += 4;
        maxSizeOfInstructions = font.getUint16();
      }

      tables["maxp"].data[4] = numGlyphsOut >> 8;
      tables["maxp"].data[5] = numGlyphsOut & 255;

      var hintsValid = sanitizeTTPrograms(
        tables["fpgm"],
        tables["prep"],
        tables["cvt "],
        maxFunctionDefs
      );
      if (!hintsValid) {
        delete tables["fpgm"];
        delete tables["prep"];
        delete tables["cvt "];
      }

      // Ensure the hmtx table contains the advance width and
      // sidebearings information for numGlyphs in the maxp table
      sanitizeMetrics(
        font,
        tables["hhea"],
        tables["hmtx"],
        numGlyphsOut,
        dupFirstEntry
      );

      if (!tables["head"]) {
        throw new FormatError('Required "head" table is not found');
      }

      sanitizeHead(
        tables["head"],
        numGlyphs,
        isTrueType ? tables["loca"].length : 0
      );

      var missingGlyphs = Object.create(null);
      if (isTrueType) {
        var isGlyphLocationsLong = int16(
          tables["head"].data[50],
          tables["head"].data[51]
        );
        var glyphsInfo = sanitizeGlyphLocations(
          tables["loca"],
          tables["glyf"],
          numGlyphs,
          isGlyphLocationsLong,
          hintsValid,
          dupFirstEntry,
          maxSizeOfInstructions
        );
        missingGlyphs = glyphsInfo.missingGlyphs;

        // Some fonts have incorrect maxSizeOfInstructions values, so we use
        // the computed value instead.
        if (version >= 0x00010000 && tables["maxp"].length >= 22) {
          tables["maxp"].data[26] = glyphsInfo.maxSizeOfInstructions >> 8;
          tables["maxp"].data[27] = glyphsInfo.maxSizeOfInstructions & 255;
        }
      }
      if (!tables["hhea"]) {
        throw new FormatError('Required "hhea" table is not found');
      }

      // Sanitizer reduces the glyph advanceWidth to the maxAdvanceWidth
      // Sometimes it's 0. That needs to be fixed
      if (tables["hhea"].data[10] === 0 && tables["hhea"].data[11] === 0) {
        tables["hhea"].data[10] = 0xff;
        tables["hhea"].data[11] = 0xff;
      }

      // Extract some more font properties from the OpenType head and
      // hhea tables; yMin and descent value are always negative.
      var metricsOverride = {
        unitsPerEm: int16(tables["head"].data[18], tables["head"].data[19]),
        yMax: int16(tables["head"].data[42], tables["head"].data[43]),
        yMin: signedInt16(tables["head"].data[38], tables["head"].data[39]),
        ascent: int16(tables["hhea"].data[4], tables["hhea"].data[5]),
        descent: signedInt16(tables["hhea"].data[6], tables["hhea"].data[7]),
      };

      // PDF FontDescriptor metrics lie -- using data from actual font.
      this.ascent = metricsOverride.ascent / metricsOverride.unitsPerEm;
      this.descent = metricsOverride.descent / metricsOverride.unitsPerEm;

      // The 'post' table has glyphs names.
      if (tables["post"]) {
        readPostScriptTable(tables["post"], properties, numGlyphs);
      }

      // The original 'post' table is not needed, replace it.
      tables["post"] = {
        tag: "post",
        data: createPostTable(properties),
      };

      var charCodeToGlyphId = [],
        charCode;

      // Helper function to try to skip mapping of empty glyphs.
      function hasGlyph(glyphId) {
        return !missingGlyphs[glyphId];
      }

      if (properties.composite) {
        var cidToGidMap = properties.cidToGidMap || [];
        var isCidToGidMapEmpty = cidToGidMap.length === 0;

        properties.cMap.forEach(function(charCode, cid) {
          if (cid > 0xffff) {
            throw new FormatError("Max size of CID is 65,535");
          }
          var glyphId = -1;
          if (isCidToGidMapEmpty) {
            glyphId = cid;
          } else if (cidToGidMap[cid] !== undefined) {
            glyphId = cidToGidMap[cid];
          }

          if (glyphId >= 0 && glyphId < numGlyphs && hasGlyph(glyphId)) {
            charCodeToGlyphId[charCode] = glyphId;
          }
        });
      } else {
        // Most of the following logic in this code branch is based on the
        // 9.6.6.4 of the PDF spec.
        var cmapTable = readCmapTable(
          tables["cmap"],
          font,
          this.isSymbolicFont,
          properties.hasEncoding
        );
        var cmapPlatformId = cmapTable.platformId;
        var cmapEncodingId = cmapTable.encodingId;
        var cmapMappings = cmapTable.mappings;
        var cmapMappingsLength = cmapMappings.length;

        // The spec seems to imply that if the font is symbolic the encoding
        // should be ignored, this doesn't appear to work for 'preistabelle.pdf'
        // where the the font is symbolic and it has an encoding.
        if (
          (properties.hasEncoding &&
            ((cmapPlatformId === 3 && cmapEncodingId === 1) ||
              (cmapPlatformId === 1 && cmapEncodingId === 0))) ||
          (cmapPlatformId === -1 &&
          cmapEncodingId === -1 && // Temporary hack
            !!getEncoding(properties.baseEncodingName))
        ) {
          // Temporary hack
          // When no preferred cmap table was found and |baseEncodingName| is
          // one of the predefined encodings, we seem to obtain a better
          // |charCodeToGlyphId| map from the code below (fixes bug 1057544).
          // TODO: Note that this is a hack which should be removed as soon as
          //       we have proper support for more exotic cmap tables.

          var baseEncoding = [];
          if (
            properties.baseEncodingName === "MacRomanEncoding" ||
            properties.baseEncodingName === "WinAnsiEncoding"
          ) {
            baseEncoding = getEncoding(properties.baseEncodingName);
          }
          var glyphsUnicodeMap = getGlyphsUnicode();
          for (charCode = 0; charCode < 256; charCode++) {
            var glyphName, standardGlyphName;
            if (this.differences && charCode in this.differences) {
              glyphName = this.differences[charCode];
            } else if (
              charCode in baseEncoding &&
              baseEncoding[charCode] !== ""
            ) {
              glyphName = baseEncoding[charCode];
            } else {
              glyphName = StandardEncoding[charCode];
            }
            if (!glyphName) {
              continue;
            }
            // Ensure that non-standard glyph names are resolved to valid ones.
            standardGlyphName = recoverGlyphName(glyphName, glyphsUnicodeMap);

            var unicodeOrCharCode;
            if (cmapPlatformId === 3 && cmapEncodingId === 1) {
              unicodeOrCharCode = glyphsUnicodeMap[standardGlyphName];
            } else if (cmapPlatformId === 1 && cmapEncodingId === 0) {
              // TODO: the encoding needs to be updated with mac os table.
              unicodeOrCharCode = MacRomanEncoding.indexOf(standardGlyphName);
            }

            var found = false;
            for (let i = 0; i < cmapMappingsLength; ++i) {
              if (cmapMappings[i].charCode !== unicodeOrCharCode) {
                continue;
              }
              charCodeToGlyphId[charCode] = cmapMappings[i].glyphId;
              found = true;
              break;
            }
            if (!found && properties.glyphNames) {
              // Try to map using the post table.
              var glyphId = properties.glyphNames.indexOf(glyphName);
              // The post table ought to use the same kind of glyph names as the
              // `differences` array, but check the standard ones as a fallback.
              if (glyphId === -1 && standardGlyphName !== glyphName) {
                glyphId = properties.glyphNames.indexOf(standardGlyphName);
              }
              if (glyphId > 0 && hasGlyph(glyphId)) {
                charCodeToGlyphId[charCode] = glyphId;
              }
            }
          }
        } else if (cmapPlatformId === 0 && cmapEncodingId === 0) {
          // Default Unicode semantics, use the charcodes as is.
          for (let i = 0; i < cmapMappingsLength; ++i) {
            charCodeToGlyphId[cmapMappings[i].charCode] =
              cmapMappings[i].glyphId;
          }
        } else {
          // When there is only a (1, 0) cmap table, the char code is a single
          // byte and it is used directly as the char code.

          // When a (3, 0) cmap table is present, it is used instead but the
          // spec has special rules for char codes in the range of 0xF000 to
          // 0xF0FF and it says the (3, 0) table should map the values from
          // the (1, 0) table by prepending 0xF0 to the char codes. To reverse
          // this, the upper bits of the char code are cleared, but only for the
          // special range since some PDFs have char codes outside of this range
          // (e.g. 0x2013) which when masked would overwrite other values in the
          // cmap.
          for (let i = 0; i < cmapMappingsLength; ++i) {
            charCode = cmapMappings[i].charCode;
            if (
              cmapPlatformId === 3 &&
              charCode >= 0xf000 &&
              charCode <= 0xf0ff
            ) {
              charCode &= 0xff;
            }
            charCodeToGlyphId[charCode] = cmapMappings[i].glyphId;
          }
        }
      }

      if (charCodeToGlyphId.length === 0) {
        // defines at least one glyph
        charCodeToGlyphId[0] = 0;
      }

      // Typically glyph 0 is duplicated and the mapping must be updated, but if
      // there isn't enough room to duplicate, the glyph id is left the same. In
      // this case, glyph 0 may not work correctly, but that is better than
      // having the whole font fail.
      let glyphZeroId = numGlyphsOut - 1;
      if (!dupFirstEntry) {
        glyphZeroId = 0;
      }

      // Converting glyphs and ids into font's cmap table
      var newMapping = adjustMapping(charCodeToGlyphId, hasGlyph, glyphZeroId);
      this.toFontChar = newMapping.toFontChar;
      tables["cmap"] = {
        tag: "cmap",
        data: createCmapTable(newMapping.charCodeToGlyphId, numGlyphsOut),
      };

      if (!tables["OS/2"] || !validateOS2Table(tables["OS/2"])) {
        tables["OS/2"] = {
          tag: "OS/2",
          data: createOS2Table(
            properties,
            newMapping.charCodeToGlyphId,
            metricsOverride
          ),
        };
      }

      if (!isTrueType) {
        try {
          // Trying to repair CFF file
          cffFile = new Stream(tables["CFF "].data);
          var parser = new CFFParser(
            cffFile,
            properties,
            SEAC_ANALYSIS_ENABLED
          );
          cff = parser.parse();
          cff.duplicateFirstGlyph();
          var compiler = new CFFCompiler(cff);
          tables["CFF "].data = compiler.compile();
        } catch (e) {
          warn("Failed to compile font " + properties.loadedName);
        }
      }

      // Re-creating 'name' table
      if (!tables["name"]) {
        tables["name"] = {
          tag: "name",
          data: createNameTable(this.name),
        };
      } else {
        // ... using existing 'name' table as prototype
        var namePrototype = readNameTable(tables["name"]);
        tables["name"].data = createNameTable(name, namePrototype);
      }

      var builder = new OpenTypeFileBuilder(header.version);
      for (var tableTag in tables) {
        builder.addTable(tableTag, tables[tableTag].data);
      }
      return builder.toArray();
    },

    convert: function Font_convert(fontName, font, properties) {
      // TODO: Check the charstring widths to determine this.
      properties.fixedPitch = false;

      if (properties.builtInEncoding) {
        // For Type1 fonts that do not include either `ToUnicode` or `Encoding`
        // data, attempt to use the `builtInEncoding` to improve text selection.
        adjustToUnicode(properties, properties.builtInEncoding);
      }

      // Type 1 fonts have a notdef inserted at the beginning, so glyph 0
      // becomes glyph 1. In a CFF font glyph 0 is appended to the end of the
      // char strings.
      let glyphZeroId = 1;
      if (font instanceof CFFFont) {
        glyphZeroId = font.numGlyphs - 1;
      }
      var mapping = font.getGlyphMapping(properties);
      var newMapping = adjustMapping(
        mapping,
        font.hasGlyphId.bind(font),
        glyphZeroId
      );
      this.toFontChar = newMapping.toFontChar;
      var numGlyphs = font.numGlyphs;

      function getCharCodes(charCodeToGlyphId, glyphId) {
        var charCodes = null;
        for (var charCode in charCodeToGlyphId) {
          if (glyphId === charCodeToGlyphId[charCode]) {
            if (!charCodes) {
              charCodes = [];
            }
            charCodes.push(charCode | 0);
          }
        }
        return charCodes;
      }

      function createCharCode(charCodeToGlyphId, glyphId) {
        for (var charCode in charCodeToGlyphId) {
          if (glyphId === charCodeToGlyphId[charCode]) {
            return charCode | 0;
          }
        }
        newMapping.charCodeToGlyphId[
          newMapping.nextAvailableFontCharCode
        ] = glyphId;
        return newMapping.nextAvailableFontCharCode++;
      }

      var seacs = font.seacs;
      if (SEAC_ANALYSIS_ENABLED && seacs && seacs.length) {
        var matrix = properties.fontMatrix || FONT_IDENTITY_MATRIX;
        var charset = font.getCharset();
        var seacMap = Object.create(null);
        for (var glyphId in seacs) {
          glyphId |= 0;
          var seac = seacs[glyphId];
          var baseGlyphName = StandardEncoding[seac[2]];
          var accentGlyphName = StandardEncoding[seac[3]];
          var baseGlyphId = charset.indexOf(baseGlyphName);
          var accentGlyphId = charset.indexOf(accentGlyphName);
          if (baseGlyphId < 0 || accentGlyphId < 0) {
            continue;
          }
          var accentOffset = {
            x: seac[0] * matrix[0] + seac[1] * matrix[2] + matrix[4],
            y: seac[0] * matrix[1] + seac[1] * matrix[3] + matrix[5],
          };

          var charCodes = getCharCodes(mapping, glyphId);
          if (!charCodes) {
            // There's no point in mapping it if the char code was never mapped
            // to begin with.
            continue;
          }
          for (var i = 0, ii = charCodes.length; i < ii; i++) {
            var charCode = charCodes[i];
            // Find a fontCharCode that maps to the base and accent glyphs.
            // If one doesn't exists, create it.
            var charCodeToGlyphId = newMapping.charCodeToGlyphId;
            var baseFontCharCode = createCharCode(
              charCodeToGlyphId,
              baseGlyphId
            );
            var accentFontCharCode = createCharCode(
              charCodeToGlyphId,
              accentGlyphId
            );
            seacMap[charCode] = {
              baseFontCharCode,
              accentFontCharCode,
              accentOffset,
            };
          }
        }
        properties.seacMap = seacMap;
      }

      var unitsPerEm = 1 / (properties.fontMatrix || FONT_IDENTITY_MATRIX)[0];

      var builder = new OpenTypeFileBuilder("\x4F\x54\x54\x4F");
      // PostScript Font Program
      builder.addTable("CFF ", font.data);
      // OS/2 and Windows Specific metrics
      builder.addTable(
        "OS/2",
        createOS2Table(properties, newMapping.charCodeToGlyphId)
      );
      // Character to glyphs mapping
      builder.addTable(
        "cmap",
        createCmapTable(newMapping.charCodeToGlyphId, numGlyphs)
      );
      // Font header
      builder.addTable(
        "head",
        "\x00\x01\x00\x00" + // Version number
        "\x00\x00\x10\x00" + // fontRevision
        "\x00\x00\x00\x00" + // checksumAdjustement
        "\x5F\x0F\x3C\xF5" + // magicNumber
        "\x00\x00" + // Flags
        safeString16(unitsPerEm) + // unitsPerEM
        "\x00\x00\x00\x00\x9e\x0b\x7e\x27" + // creation date
        "\x00\x00\x00\x00\x9e\x0b\x7e\x27" + // modifification date
        "\x00\x00" + // xMin
        safeString16(properties.descent) + // yMin
        "\x0F\xFF" + // xMax
        safeString16(properties.ascent) + // yMax
        string16(properties.italicAngle ? 2 : 0) + // macStyle
        "\x00\x11" + // lowestRecPPEM
        "\x00\x00" + // fontDirectionHint
        "\x00\x00" + // indexToLocFormat
          "\x00\x00"
      ); // glyphDataFormat

      // Horizontal header
      builder.addTable(
        "hhea",
        "\x00\x01\x00\x00" + // Version number
        safeString16(properties.ascent) + // Typographic Ascent
        safeString16(properties.descent) + // Typographic Descent
        "\x00\x00" + // Line Gap
        "\xFF\xFF" + // advanceWidthMax
        "\x00\x00" + // minLeftSidebearing
        "\x00\x00" + // minRightSidebearing
        "\x00\x00" + // xMaxExtent
        safeString16(properties.capHeight) + // caretSlopeRise
        safeString16(Math.tan(properties.italicAngle) * properties.xHeight) + // caretSlopeRun
        "\x00\x00" + // caretOffset
        "\x00\x00" + // -reserved-
        "\x00\x00" + // -reserved-
        "\x00\x00" + // -reserved-
        "\x00\x00" + // -reserved-
        "\x00\x00" + // metricDataFormat
          string16(numGlyphs)
      ); // Number of HMetrics

      // Horizontal metrics
      builder.addTable(
        "hmtx",
        (function fontFieldsHmtx() {
          var charstrings = font.charstrings;
          var cffWidths = font.cff ? font.cff.widths : null;
          var hmtx = "\x00\x00\x00\x00"; // Fake .notdef
          for (var i = 1, ii = numGlyphs; i < ii; i++) {
            var width = 0;
            if (charstrings) {
              var charstring = charstrings[i - 1];
              width = "width" in charstring ? charstring.width : 0;
            } else if (cffWidths) {
              width = Math.ceil(cffWidths[i] || 0);
            }
            hmtx += string16(width) + string16(0);
          }
          return hmtx;
        })()
      );

      // Maximum profile
      builder.addTable(
        "maxp",
        "\x00\x00\x50\x00" + string16(numGlyphs) // Version number
      ); // Num of glyphs

      // Naming tables
      builder.addTable("name", createNameTable(fontName));

      // PostScript information
      builder.addTable("post", createPostTable(properties));

      return builder.toArray();
    },

    get spaceWidth() {
      if ("_shadowWidth" in this) {
        return this._shadowWidth;
      }

      // trying to estimate space character width
      var possibleSpaceReplacements = ["space", "minus", "one", "i", "I"];
      var width;
      for (var i = 0, ii = possibleSpaceReplacements.length; i < ii; i++) {
        var glyphName = possibleSpaceReplacements[i];
        // if possible, getting width by glyph name
        if (glyphName in this.widths) {
          width = this.widths[glyphName];
          break;
        }
        var glyphsUnicodeMap = getGlyphsUnicode();
        var glyphUnicode = glyphsUnicodeMap[glyphName];
        // finding the charcode via unicodeToCID map
        var charcode = 0;
        if (this.composite) {
          if (this.cMap.contains(glyphUnicode)) {
            charcode = this.cMap.lookup(glyphUnicode);
          }
        }
        // ... via toUnicode map
        if (!charcode && this.toUnicode) {
          charcode = this.toUnicode.charCodeOf(glyphUnicode);
        }
        // setting it to unicode if negative or undefined
        if (charcode <= 0) {
          charcode = glyphUnicode;
        }
        // trying to get width via charcode
        width = this.widths[charcode];
        if (width) {
          break; // the non-zero width found
        }
      }
      width = width || this.defaultWidth;
      // Do not shadow the property here. See discussion:
      // https://github.com/mozilla/pdf.js/pull/2127#discussion_r1662280
      this._shadowWidth = width;
      return width;
    },

    charToGlyph: function Font_charToGlyph(charcode, isSpace) {
      var fontCharCode, width, operatorListId;

      var widthCode = charcode;
      if (this.cMap && this.cMap.contains(charcode)) {
        widthCode = this.cMap.lookup(charcode);
      }
      width = this.widths[widthCode];
      width = isNum(width) ? width : this.defaultWidth;
      var vmetric = this.vmetrics && this.vmetrics[widthCode];

      let unicode =
        this.toUnicode.get(charcode) ||
        this.fallbackToUnicode.get(charcode) ||
        charcode;
      if (typeof unicode === "number") {
        unicode = String.fromCharCode(unicode);
      }

      var isInFont = charcode in this.toFontChar;
      // First try the toFontChar map, if it's not there then try falling
      // back to the char code.
      fontCharCode = this.toFontChar[charcode] || charcode;
      if (this.missingFile) {
        const glyphName =
          this.differences[charcode] || this.defaultEncoding[charcode];
        if (
          (glyphName === ".notdef" || glyphName === "") &&
          this.type === "Type1"
        ) {
          // .notdef glyphs should be invisible in non-embedded Type1 fonts, so
          // replace them with spaces.
          fontCharCode = 0x20;
        }
        fontCharCode = mapSpecialUnicodeValues(fontCharCode);
      }

      if (this.isType3Font) {
        // Font char code in this case is actually a glyph name.
        operatorListId = fontCharCode;
      }

      var accent = null;
      if (this.seacMap && this.seacMap[charcode]) {
        isInFont = true;
        var seac = this.seacMap[charcode];
        fontCharCode = seac.baseFontCharCode;
        accent = {
          fontChar: String.fromCodePoint(seac.accentFontCharCode),
          offset: seac.accentOffset,
        };
      }

      var fontChar =
        typeof fontCharCode === "number"
          ? String.fromCodePoint(fontCharCode)
          : "";

      var glyph = this.glyphCache[charcode];
      if (
        !glyph ||
        !glyph.matchesForCache(
          fontChar,
          unicode,
          accent,
          width,
          vmetric,
          operatorListId,
          isSpace,
          isInFont
        )
      ) {
        glyph = new Glyph(
          fontChar,
          unicode,
          accent,
          width,
          vmetric,
          operatorListId,
          isSpace,
          isInFont
        );
        this.glyphCache[charcode] = glyph;
      }
      return glyph;
    },

    charsToGlyphs: function Font_charsToGlyphs(chars) {
      var charsCache = this.charsCache;
      var glyphs, glyph, charcode;

      // if we translated this string before, just grab it from the cache
      if (charsCache) {
        glyphs = charsCache[chars];
        if (glyphs) {
          return glyphs;
        }
      }

      // lazily create the translation cache
      if (!charsCache) {
        charsCache = this.charsCache = Object.create(null);
      }

      glyphs = [];
      var charsCacheKey = chars;
      var i = 0,
        ii;

      if (this.cMap) {
        // composite fonts have multi-byte strings convert the string from
        // single-byte to multi-byte
        var c = Object.create(null);
        while (i < chars.length) {
          this.cMap.readCharCode(chars, i, c);
          charcode = c.charcode;
          var length = c.length;
          i += length;
          // Space is char with code 0x20 and length 1 in multiple-byte codes.
          var isSpace = length === 1 && chars.charCodeAt(i - 1) === 0x20;
          glyph = this.charToGlyph(charcode, isSpace);
          glyphs.push(glyph);
        }
      } else {
        for (i = 0, ii = chars.length; i < ii; ++i) {
          charcode = chars.charCodeAt(i);
          glyph = this.charToGlyph(charcode, charcode === 0x20);
          glyphs.push(glyph);
        }
      }

      // Enter the translated string into the cache
      return (charsCache[charsCacheKey] = glyphs);
    },

    get glyphCacheValues() {
      return Object.values(this.glyphCache);
    },
  };

  return Font;
})();

var ErrorFont = (function ErrorFontClosure() {
  function ErrorFont(error) {
    this.error = error;
    this.loadedName = "g_font_error";
    this.missingFile = true;
  }

  ErrorFont.prototype = {
    charsToGlyphs: function ErrorFont_charsToGlyphs() {
      return [];
    },
    exportData: function ErrorFont_exportData() {
      return { error: this.error };
    },
  };

  return ErrorFont;
})();

/**
 * Shared logic for building a char code to glyph id mapping for Type1 and
 * simple CFF fonts. See section 9.6.6.2 of the spec.
 * @param {Object} properties Font properties object.
 * @param {Object} builtInEncoding The encoding contained within the actual font
 * data.
 * @param {Array} glyphNames Array of glyph names where the index is the
 * glyph ID.
 * @returns {Object} A char code to glyph ID map.
 */
function type1FontGlyphMapping(properties, builtInEncoding, glyphNames) {
  var charCodeToGlyphId = Object.create(null);
  var glyphId, charCode, baseEncoding;
  var isSymbolicFont = !!(properties.flags & FontFlags.Symbolic);

  if (properties.baseEncodingName) {
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
  var differences = properties.differences,
    glyphsUnicodeMap;
  if (differences) {
    for (charCode in differences) {
      var glyphName = differences[charCode];
      glyphId = glyphNames.indexOf(glyphName);

      if (glyphId === -1) {
        if (!glyphsUnicodeMap) {
          glyphsUnicodeMap = getGlyphsUnicode();
        }
        var standardGlyphName = recoverGlyphName(glyphName, glyphsUnicodeMap);
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

// Type1Font is also a CIDFontType0.
var Type1Font = (function Type1FontClosure() {
  function findBlock(streamBytes, signature, startIndex) {
    var streamBytesLength = streamBytes.length;
    var signatureLength = signature.length;
    var scanLength = streamBytesLength - signatureLength;

    var i = startIndex,
      j,
      found = false;
    while (i < scanLength) {
      j = 0;
      while (j < signatureLength && streamBytes[i + j] === signature[j]) {
        j++;
      }
      if (j >= signatureLength) {
        // `signature` found, skip over whitespace.
        i += j;
        while (i < streamBytesLength && isSpace(streamBytes[i])) {
          i++;
        }
        found = true;
        break;
      }
      i++;
    }
    return {
      found,
      length: i,
    };
  }

  function getHeaderBlock(stream, suggestedLength) {
    var EEXEC_SIGNATURE = [0x65, 0x65, 0x78, 0x65, 0x63];

    var streamStartPos = stream.pos; // Save the initial stream position.
    var headerBytes, headerBytesLength, block;
    try {
      headerBytes = stream.getBytes(suggestedLength);
      headerBytesLength = headerBytes.length;
    } catch (ex) {
      if (ex instanceof MissingDataException) {
        throw ex;
      }
      // Ignore errors if the `suggestedLength` is huge enough that a Uint8Array
      // cannot hold the result of `getBytes`, and fallback to simply checking
      // the entire stream (fixes issue3928.pdf).
    }

    if (headerBytesLength === suggestedLength) {
      // Most of the time `suggestedLength` is correct, so to speed things up we
      // initially only check the last few bytes to see if the header was found.
      // Otherwise we (potentially) check the entire stream to prevent errors in
      // `Type1Parser` (fixes issue5686.pdf).
      block = findBlock(
        headerBytes,
        EEXEC_SIGNATURE,
        suggestedLength - 2 * EEXEC_SIGNATURE.length
      );

      if (block.found && block.length === suggestedLength) {
        return {
          stream: new Stream(headerBytes),
          length: suggestedLength,
        };
      }
    }
    warn('Invalid "Length1" property in Type1 font -- trying to recover.');
    stream.pos = streamStartPos; // Reset the stream position.

    var SCAN_BLOCK_LENGTH = 2048;
    var actualLength;
    while (true) {
      var scanBytes = stream.peekBytes(SCAN_BLOCK_LENGTH);
      block = findBlock(scanBytes, EEXEC_SIGNATURE, 0);

      if (block.length === 0) {
        break;
      }
      stream.pos += block.length; // Update the stream position.

      if (block.found) {
        actualLength = stream.pos - streamStartPos;
        break;
      }
    }
    stream.pos = streamStartPos; // Reset the stream position.

    if (actualLength) {
      return {
        stream: new Stream(stream.getBytes(actualLength)),
        length: actualLength,
      };
    }
    warn('Unable to recover "Length1" property in Type1 font -- using as is.');
    return {
      stream: new Stream(stream.getBytes(suggestedLength)),
      length: suggestedLength,
    };
  }

  function getEexecBlock(stream, suggestedLength) {
    // We should ideally parse the eexec block to ensure that `suggestedLength`
    // is correct, so we don't truncate the block data if it's too small.
    // However, this would also require checking if the fixed-content portion
    // exists (using the 'Length3' property), and ensuring that it's valid.
    //
    // Given that `suggestedLength` almost always is correct, all the validation
    // would require a great deal of unnecessary parsing for most fonts.
    // To save time, we always fetch the entire stream instead, which also avoid
    // issues if `suggestedLength` is huge (see comment in `getHeaderBlock`).
    //
    // NOTE: This means that the function can include the fixed-content portion
    // in the returned eexec block. In practice this does *not* seem to matter,
    // since `Type1Parser_extractFontProgram` will skip over any non-commands.
    var eexecBytes = stream.getBytes();
    return {
      stream: new Stream(eexecBytes),
      length: eexecBytes.length,
    };
  }

  function Type1Font(name, file, properties) {
    // Some bad generators embed pfb file as is, we have to strip 6-byte header.
    // Also, length1 and length2 might be off by 6 bytes as well.
    // http://www.math.ubc.ca/~cass/piscript/type1.pdf
    var PFB_HEADER_SIZE = 6;
    var headerBlockLength = properties.length1;
    var eexecBlockLength = properties.length2;
    var pfbHeader = file.peekBytes(PFB_HEADER_SIZE);
    var pfbHeaderPresent = pfbHeader[0] === 0x80 && pfbHeader[1] === 0x01;
    if (pfbHeaderPresent) {
      file.skip(PFB_HEADER_SIZE);
      headerBlockLength =
        (pfbHeader[5] << 24) |
        (pfbHeader[4] << 16) |
        (pfbHeader[3] << 8) |
        pfbHeader[2];
    }

    // Get the data block containing glyphs and subrs information
    var headerBlock = getHeaderBlock(file, headerBlockLength);
    var headerBlockParser = new Type1Parser(
      headerBlock.stream,
      false,
      SEAC_ANALYSIS_ENABLED
    );
    headerBlockParser.extractFontHeader(properties);

    if (pfbHeaderPresent) {
      pfbHeader = file.getBytes(PFB_HEADER_SIZE);
      eexecBlockLength =
        (pfbHeader[5] << 24) |
        (pfbHeader[4] << 16) |
        (pfbHeader[3] << 8) |
        pfbHeader[2];
    }

    // Decrypt the data blocks and retrieve it's content
    var eexecBlock = getEexecBlock(file, eexecBlockLength);
    var eexecBlockParser = new Type1Parser(
      eexecBlock.stream,
      true,
      SEAC_ANALYSIS_ENABLED
    );
    var data = eexecBlockParser.extractFontProgram(properties);
    for (var info in data.properties) {
      properties[info] = data.properties[info];
    }

    var charstrings = data.charstrings;
    var type2Charstrings = this.getType2Charstrings(charstrings);
    var subrs = this.getType2Subrs(data.subrs);

    this.charstrings = charstrings;
    this.data = this.wrap(
      name,
      type2Charstrings,
      this.charstrings,
      subrs,
      properties
    );
    this.seacs = this.getSeacs(data.charstrings);
  }

  Type1Font.prototype = {
    get numGlyphs() {
      return this.charstrings.length + 1;
    },

    getCharset: function Type1Font_getCharset() {
      var charset = [".notdef"];
      var charstrings = this.charstrings;
      for (var glyphId = 0; glyphId < charstrings.length; glyphId++) {
        charset.push(charstrings[glyphId].glyphName);
      }
      return charset;
    },

    getGlyphMapping: function Type1Font_getGlyphMapping(properties) {
      var charstrings = this.charstrings;
      var glyphNames = [".notdef"],
        glyphId;
      for (glyphId = 0; glyphId < charstrings.length; glyphId++) {
        glyphNames.push(charstrings[glyphId].glyphName);
      }
      var encoding = properties.builtInEncoding;
      if (encoding) {
        var builtInEncoding = Object.create(null);
        for (var charCode in encoding) {
          glyphId = glyphNames.indexOf(encoding[charCode]);
          if (glyphId >= 0) {
            builtInEncoding[charCode] = glyphId;
          }
        }
      }

      return type1FontGlyphMapping(properties, builtInEncoding, glyphNames);
    },

    hasGlyphId: function Type1Font_hasGlyphID(id) {
      if (id < 0 || id >= this.numGlyphs) {
        return false;
      }
      if (id === 0) {
        // notdef is always defined.
        return true;
      }
      var glyph = this.charstrings[id - 1];
      return glyph.charstring.length > 0;
    },

    getSeacs: function Type1Font_getSeacs(charstrings) {
      var i, ii;
      var seacMap = [];
      for (i = 0, ii = charstrings.length; i < ii; i++) {
        var charstring = charstrings[i];
        if (charstring.seac) {
          // Offset by 1 for .notdef
          seacMap[i + 1] = charstring.seac;
        }
      }
      return seacMap;
    },

    getType2Charstrings: function Type1Font_getType2Charstrings(
      type1Charstrings
    ) {
      var type2Charstrings = [];
      for (var i = 0, ii = type1Charstrings.length; i < ii; i++) {
        type2Charstrings.push(type1Charstrings[i].charstring);
      }
      return type2Charstrings;
    },

    getType2Subrs: function Type1Font_getType2Subrs(type1Subrs) {
      var bias = 0;
      var count = type1Subrs.length;
      if (count < 1133) {
        bias = 107;
      } else if (count < 33769) {
        bias = 1131;
      } else {
        bias = 32768;
      }

      // Add a bunch of empty subrs to deal with the Type2 bias
      var type2Subrs = [];
      var i;
      for (i = 0; i < bias; i++) {
        type2Subrs.push([0x0b]);
      }

      for (i = 0; i < count; i++) {
        type2Subrs.push(type1Subrs[i]);
      }

      return type2Subrs;
    },

    wrap: function Type1Font_wrap(
      name,
      glyphs,
      charstrings,
      subrs,
      properties
    ) {
      var cff = new CFF();
      cff.header = new CFFHeader(1, 0, 4, 4);

      cff.names = [name];

      var topDict = new CFFTopDict();
      // CFF strings IDs 0...390 are predefined names, so refering
      // to entries in our own String INDEX starts at SID 391.
      topDict.setByName("version", 391);
      topDict.setByName("Notice", 392);
      topDict.setByName("FullName", 393);
      topDict.setByName("FamilyName", 394);
      topDict.setByName("Weight", 395);
      topDict.setByName("Encoding", null); // placeholder
      topDict.setByName("FontMatrix", properties.fontMatrix);
      topDict.setByName("FontBBox", properties.bbox);
      topDict.setByName("charset", null); // placeholder
      topDict.setByName("CharStrings", null); // placeholder
      topDict.setByName("Private", null); // placeholder
      cff.topDict = topDict;

      var strings = new CFFStrings();
      strings.add("Version 0.11"); // Version
      strings.add("See original notice"); // Notice
      strings.add(name); // FullName
      strings.add(name); // FamilyName
      strings.add("Medium"); // Weight
      cff.strings = strings;

      cff.globalSubrIndex = new CFFIndex();

      var count = glyphs.length;
      var charsetArray = [".notdef"];
      var i, ii;
      for (i = 0; i < count; i++) {
        const glyphName = charstrings[i].glyphName;
        const index = CFFStandardStrings.indexOf(glyphName);
        if (index === -1) {
          strings.add(glyphName);
        }
        charsetArray.push(glyphName);
      }
      cff.charset = new CFFCharset(false, 0, charsetArray);

      var charStringsIndex = new CFFIndex();
      charStringsIndex.add([0x8b, 0x0e]); // .notdef
      for (i = 0; i < count; i++) {
        charStringsIndex.add(glyphs[i]);
      }
      cff.charStrings = charStringsIndex;

      var privateDict = new CFFPrivateDict();
      privateDict.setByName("Subrs", null); // placeholder
      var fields = [
        "BlueValues",
        "OtherBlues",
        "FamilyBlues",
        "FamilyOtherBlues",
        "StemSnapH",
        "StemSnapV",
        "BlueShift",
        "BlueFuzz",
        "BlueScale",
        "LanguageGroup",
        "ExpansionFactor",
        "ForceBold",
        "StdHW",
        "StdVW",
      ];
      for (i = 0, ii = fields.length; i < ii; i++) {
        var field = fields[i];
        if (!(field in properties.privateData)) {
          continue;
        }
        var value = properties.privateData[field];
        if (Array.isArray(value)) {
          // All of the private dictionary array data in CFF must be stored as
          // "delta-encoded" numbers.
          for (var j = value.length - 1; j > 0; j--) {
            value[j] -= value[j - 1]; // ... difference from previous value
          }
        }
        privateDict.setByName(field, value);
      }
      cff.topDict.privateDict = privateDict;

      var subrIndex = new CFFIndex();
      for (i = 0, ii = subrs.length; i < ii; i++) {
        subrIndex.add(subrs[i]);
      }
      privateDict.subrsIndex = subrIndex;

      var compiler = new CFFCompiler(cff);
      return compiler.compile();
    },
  };

  return Type1Font;
})();

var CFFFont = (function CFFFontClosure() {
  function CFFFont(file, properties) {
    this.properties = properties;

    var parser = new CFFParser(file, properties, SEAC_ANALYSIS_ENABLED);
    this.cff = parser.parse();
    this.cff.duplicateFirstGlyph();
    var compiler = new CFFCompiler(this.cff);
    this.seacs = this.cff.seacs;
    try {
      this.data = compiler.compile();
    } catch (e) {
      warn("Failed to compile font " + properties.loadedName);
      // There may have just been an issue with the compiler, set the data
      // anyway and hope the font loaded.
      this.data = file;
    }
  }

  CFFFont.prototype = {
    get numGlyphs() {
      return this.cff.charStrings.count;
    },
    getCharset: function CFFFont_getCharset() {
      return this.cff.charset.charset;
    },
    getGlyphMapping: function CFFFont_getGlyphMapping() {
      var cff = this.cff;
      var properties = this.properties;
      var charsets = cff.charset.charset;
      var charCodeToGlyphId;
      var glyphId;

      if (properties.composite) {
        charCodeToGlyphId = Object.create(null);
        let charCode;
        if (cff.isCIDFont) {
          // If the font is actually a CID font then we should use the charset
          // to map CIDs to GIDs.
          for (glyphId = 0; glyphId < charsets.length; glyphId++) {
            var cid = charsets[glyphId];
            charCode = properties.cMap.charCodeOf(cid);
            charCodeToGlyphId[charCode] = glyphId;
          }
        } else {
          // If it is NOT actually a CID font then CIDs should be mapped
          // directly to GIDs.
          for (glyphId = 0; glyphId < cff.charStrings.count; glyphId++) {
            charCode = properties.cMap.charCodeOf(glyphId);
            charCodeToGlyphId[charCode] = glyphId;
          }
        }
        return charCodeToGlyphId;
      }

      var encoding = cff.encoding ? cff.encoding.encoding : null;
      charCodeToGlyphId = type1FontGlyphMapping(properties, encoding, charsets);
      return charCodeToGlyphId;
    },
    hasGlyphId: function CFFFont_hasGlyphID(id) {
      return this.cff.hasGlyphId(id);
    },
  };

  return CFFFont;
})();

export {
  SEAC_ANALYSIS_ENABLED,
  ErrorFont,
  Font,
  FontFlags,
  ToUnicodeMap,
  IdentityToUnicodeMap,
  getFontType,
};
