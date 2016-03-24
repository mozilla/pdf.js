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
/* globals PDFJS */

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs/core/fonts', ['exports', 'pdfjs/shared/util',
      'pdfjs/core/primitives', 'pdfjs/core/stream', 'pdfjs/core/parser',
      'pdfjs/core/cmap', 'pdfjs/core/glyphlist', 'pdfjs/core/charsets',
      'pdfjs/core/font_renderer', 'pdfjs/core/encodings',
      'pdfjs/core/standard_fonts', 'pdfjs/core/unicode'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('../shared/util.js'), require('./primitives.js'),
      require('./stream.js'), require('./parser.js'), require('./cmap.js'),
      require('./glyphlist.js'), require('./charsets.js'),
      require('./font_renderer.js'), require('./encodings.js'),
      require('./standard_fonts'), require('./unicode.js'));
  } else {
    factory((root.pdfjsCoreFonts = {}), root.pdfjsSharedUtil,
      root.pdfjsCorePrimitives, root.pdfjsCoreStream, root.pdfjsCoreParser,
      root.pdfjsCoreCMap, root.pdfjsCoreGlyphList, root.pdfjsCoreCharsets,
      root.pdfjsCoreFontRenderer, root.pdfjsCoreEncodings,
      root.pdfjsCoreStandardFonts, root.pdfjsCoreUnicode);
  }
}(this, function (exports, sharedUtil, corePrimitives, coreStream, coreParser,
                  coreCMap, coreGlyphList, coreCharsets, coreFontRenderer,
                  coreEncodings, coreStandardFonts, coreUnicode) {

var FONT_IDENTITY_MATRIX = sharedUtil.FONT_IDENTITY_MATRIX;
var FontType = sharedUtil.FontType;
var Util = sharedUtil.Util;
var assert = sharedUtil.assert;
var bytesToString = sharedUtil.bytesToString;
var error = sharedUtil.error;
var info = sharedUtil.info;
var isArray = sharedUtil.isArray;
var isInt = sharedUtil.isInt;
var isNum = sharedUtil.isNum;
var readUint32 = sharedUtil.readUint32;
var shadow = sharedUtil.shadow;
var stringToBytes = sharedUtil.stringToBytes;
var string32 = sharedUtil.string32;
var warn = sharedUtil.warn;
var Name = corePrimitives.Name;
var Stream = coreStream.Stream;
var Lexer = coreParser.Lexer;
var CMapFactory = coreCMap.CMapFactory;
var IdentityCMap = coreCMap.IdentityCMap;
var getGlyphsUnicode = coreGlyphList.getGlyphsUnicode;
var getDingbatsGlyphsUnicode = coreGlyphList.getDingbatsGlyphsUnicode;
var ISOAdobeCharset = coreCharsets.ISOAdobeCharset;
var ExpertCharset = coreCharsets.ExpertCharset;
var ExpertSubsetCharset = coreCharsets.ExpertSubsetCharset;
var FontRendererFactory = coreFontRenderer.FontRendererFactory;
var WinAnsiEncoding = coreEncodings.WinAnsiEncoding;
var StandardEncoding = coreEncodings.StandardEncoding;
var MacRomanEncoding = coreEncodings.MacRomanEncoding;
var SymbolSetEncoding = coreEncodings.SymbolSetEncoding;
var ZapfDingbatsEncoding = coreEncodings.ZapfDingbatsEncoding;
var ExpertEncoding = coreEncodings.ExpertEncoding;
var getEncoding = coreEncodings.getEncoding;
var getStdFontMap = coreStandardFonts.getStdFontMap;
var getNonStdFontMap = coreStandardFonts.getNonStdFontMap;
var getGlyphMapForStandardFonts = coreStandardFonts.getGlyphMapForStandardFonts;
var getSupplementalGlyphMapForArialBlack =
  coreStandardFonts.getSupplementalGlyphMapForArialBlack;
var getUnicodeRangeFor = coreUnicode.getUnicodeRangeFor;
var mapSpecialUnicodeValues = coreUnicode.mapSpecialUnicodeValues;
var getUnicodeForGlyph = coreUnicode.getUnicodeForGlyph;

// Unicode Private Use Area
var PRIVATE_USE_OFFSET_START = 0xE000;
var PRIVATE_USE_OFFSET_END = 0xF8FF;
var SKIP_PRIVATE_USE_RANGE_F000_TO_F01F = false;

// PDF Glyph Space Units are one Thousandth of a TextSpace Unit
// except for Type 3 fonts
var PDF_GLYPH_SPACE_UNITS = 1000;

// Hinting is currently disabled due to unknown problems on windows
// in tracemonkey and various other pdfs with type1 fonts.
var HINTING_ENABLED = false;

// Accented charactars are not displayed properly on windows, using this flag
// to control analysis of seac charstrings.
var SEAC_ANALYSIS_ENABLED = false;

// Maximum subroutine call depth of type 2 chartrings. Matches OTS.
var MAX_SUBR_NESTING = 10;

var FontFlags = {
  FixedPitch: 1,
  Serif: 2,
  Symbolic: 4,
  Script: 8,
  Nonsymbolic: 32,
  Italic: 64,
  AllCap: 65536,
  SmallCap: 131072,
  ForceBold: 262144
};

var MacStandardGlyphOrdering = [
  '.notdef', '.null', 'nonmarkingreturn', 'space', 'exclam', 'quotedbl',
  'numbersign', 'dollar', 'percent', 'ampersand', 'quotesingle', 'parenleft',
  'parenright', 'asterisk', 'plus', 'comma', 'hyphen', 'period', 'slash',
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'colon', 'semicolon', 'less', 'equal', 'greater', 'question', 'at',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
  'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'bracketleft',
  'backslash', 'bracketright', 'asciicircum', 'underscore', 'grave', 'a', 'b',
  'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q',
  'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'braceleft', 'bar', 'braceright',
  'asciitilde', 'Adieresis', 'Aring', 'Ccedilla', 'Eacute', 'Ntilde',
  'Odieresis', 'Udieresis', 'aacute', 'agrave', 'acircumflex', 'adieresis',
  'atilde', 'aring', 'ccedilla', 'eacute', 'egrave', 'ecircumflex', 'edieresis',
  'iacute', 'igrave', 'icircumflex', 'idieresis', 'ntilde', 'oacute', 'ograve',
  'ocircumflex', 'odieresis', 'otilde', 'uacute', 'ugrave', 'ucircumflex',
  'udieresis', 'dagger', 'degree', 'cent', 'sterling', 'section', 'bullet',
  'paragraph', 'germandbls', 'registered', 'copyright', 'trademark', 'acute',
  'dieresis', 'notequal', 'AE', 'Oslash', 'infinity', 'plusminus', 'lessequal',
  'greaterequal', 'yen', 'mu', 'partialdiff', 'summation', 'product', 'pi',
  'integral', 'ordfeminine', 'ordmasculine', 'Omega', 'ae', 'oslash',
  'questiondown', 'exclamdown', 'logicalnot', 'radical', 'florin',
  'approxequal', 'Delta', 'guillemotleft', 'guillemotright', 'ellipsis',
  'nonbreakingspace', 'Agrave', 'Atilde', 'Otilde', 'OE', 'oe', 'endash',
  'emdash', 'quotedblleft', 'quotedblright', 'quoteleft', 'quoteright',
  'divide', 'lozenge', 'ydieresis', 'Ydieresis', 'fraction', 'currency',
  'guilsinglleft', 'guilsinglright', 'fi', 'fl', 'daggerdbl', 'periodcentered',
  'quotesinglbase', 'quotedblbase', 'perthousand', 'Acircumflex',
  'Ecircumflex', 'Aacute', 'Edieresis', 'Egrave', 'Iacute', 'Icircumflex',
  'Idieresis', 'Igrave', 'Oacute', 'Ocircumflex', 'apple', 'Ograve', 'Uacute',
  'Ucircumflex', 'Ugrave', 'dotlessi', 'circumflex', 'tilde', 'macron',
  'breve', 'dotaccent', 'ring', 'cedilla', 'hungarumlaut', 'ogonek', 'caron',
  'Lslash', 'lslash', 'Scaron', 'scaron', 'Zcaron', 'zcaron', 'brokenbar',
  'Eth', 'eth', 'Yacute', 'yacute', 'Thorn', 'thorn', 'minus', 'multiply',
  'onesuperior', 'twosuperior', 'threesuperior', 'onehalf', 'onequarter',
  'threequarters', 'franc', 'Gbreve', 'gbreve', 'Idotaccent', 'Scedilla',
  'scedilla', 'Cacute', 'cacute', 'Ccaron', 'ccaron', 'dcroat'];

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

function getFontType(type, subtype) {
  switch (type) {
    case 'Type1':
      return subtype === 'Type1C' ? FontType.TYPE1C : FontType.TYPE1;
    case 'CIDFontType0':
      return subtype === 'CIDFontType0C' ? FontType.CIDFONTTYPE0C :
        FontType.CIDFONTTYPE0;
    case 'OpenType':
      return FontType.OPENTYPE;
    case 'TrueType':
      return FontType.TRUETYPE;
    case 'CIDFontType2':
      return FontType.CIDFONTTYPE2;
    case 'MMType1':
      return FontType.MMTYPE1;
    case 'Type0':
      return FontType.TYPE0;
    default:
      return FontType.UNKNOWN;
  }
}

var Glyph = (function GlyphClosure() {
  function Glyph(fontChar, unicode, accent, width, vmetric, operatorListId,
                 isSpace, isInFont) {
    this.fontChar = fontChar;
    this.unicode = unicode;
    this.accent = accent;
    this.width = width;
    this.vmetric = vmetric;
    this.operatorListId = operatorListId;
    this.isSpace = isSpace;
    this.isInFont = isInFont;
  }

  Glyph.prototype.matchesForCache = function(fontChar, unicode, accent, width,
                                             vmetric, operatorListId, isSpace,
                                             isInFont) {
    return this.fontChar === fontChar &&
           this.unicode === unicode &&
           this.accent === accent &&
           this.width === width &&
           this.vmetric === vmetric &&
           this.operatorListId === operatorListId &&
           this.isSpace === isSpace &&
           this.isInFont === isInFont;
  };

  return Glyph;
})();

var ToUnicodeMap = (function ToUnicodeMapClosure() {
  function ToUnicodeMap(cmap) {
    // The elements of this._map can be integers or strings, depending on how
    // |cmap| was created.
    this._map = cmap;
  }

  ToUnicodeMap.prototype = {
    get length() {
      return this._map.length;
    },

    forEach: function(callback) {
      for (var charCode in this._map) {
        callback(charCode, this._map[charCode].charCodeAt(0));
      }
    },

    has: function(i) {
      return this._map[i] !== undefined;
    },

    get: function(i) {
      return this._map[i];
    },

    charCodeOf: function(v) {
      return this._map.indexOf(v);
    }
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
      return (this.lastChar + 1) - this.firstChar;
    },

    forEach: function (callback) {
      for (var i = this.firstChar, ii = this.lastChar; i <= ii; i++) {
        callback(i, i);
      }
    },

    has: function (i) {
      return this.firstChar <= i && i <= this.lastChar;
    },

    get: function (i) {
      if (this.firstChar <= i && i <= this.lastChar) {
        return String.fromCharCode(i);
      }
      return undefined;
    },

    charCodeOf: function (v) {
      return (isInt(v) && v >= this.firstChar && v <= this.lastChar) ? v : -1;
    }
  };

  return IdentityToUnicodeMap;
})();

var OpenTypeFileBuilder = (function OpenTypeFileBuilderClosure() {
  function writeInt16(dest, offset, num) {
    dest[offset] = (num >> 8) & 0xFF;
    dest[offset + 1] = num & 0xFF;
  }

  function writeInt32(dest, offset, num) {
    dest[offset] = (num >> 24) & 0xFF;
    dest[offset + 1] = (num >> 16) & 0xFF;
    dest[offset + 2] = (num >> 8) & 0xFF;
    dest[offset + 3] = num & 0xFF;
  }

  function writeData(dest, offset, data) {
    var i, ii;
    if (data instanceof Uint8Array) {
      dest.set(data, offset);
    } else if (typeof data === 'string') {
      for (i = 0, ii = data.length; i < ii; i++) {
        dest[offset++] = data.charCodeAt(i) & 0xFF;
      }
    } else {
      // treating everything else as array
      for (i = 0, ii = data.length; i < ii; i++) {
        dest[offset++] = data[i] & 0xFF;
      }
    }
  }

  function OpenTypeFileBuilder(sfnt) {
    this.sfnt = sfnt;
    this.tables = Object.create(null);
  }

  OpenTypeFileBuilder.getSearchParams =
      function OpenTypeFileBuilder_getSearchParams(entriesCount, entrySize) {
    var maxPower2 = 1, log2 = 0;
    while ((maxPower2 ^ entriesCount) > maxPower2) {
      maxPower2 <<= 1;
      log2++;
    }
    var searchRange = maxPower2 * entrySize;
    return {
      range: searchRange,
      entry: log2,
      rangeShift: entrySize * entriesCount - searchRange
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
      if (sfnt === 'true') {
        // Windows hates the Mac TrueType sfnt version number
        sfnt = string32(0x00010000);
      }
      file[0] = sfnt.charCodeAt(0) & 0xFF;
      file[1] = sfnt.charCodeAt(1) & 0xFF;
      file[2] = sfnt.charCodeAt(2) & 0xFF;
      file[3] = sfnt.charCodeAt(3) & 0xFF;

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
        file[offset] = tableName.charCodeAt(0) & 0xFF;
        file[offset + 1] = tableName.charCodeAt(1) & 0xFF;
        file[offset + 2] = tableName.charCodeAt(2) & 0xFF;
        file[offset + 3] = tableName.charCodeAt(3) & 0xFF;

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
        throw new Error('Table ' + tag + ' already exists');
      }
      this.tables[tag] = data;
    }
  };

  return OpenTypeFileBuilder;
})();

// Problematic Unicode characters in the fonts that needs to be moved to avoid
// issues when they are painted on the canvas, e.g. complex-script shaping or
// control/whitespace characters. The ranges are listed in pairs: the first item
// is a code of the first problematic code, the second one is the next
// non-problematic code. The ranges must be in sorted order.
var ProblematicCharRanges = new Int32Array([
  // Control characters.
  0x0000, 0x0020,
  0x007F, 0x00A1,
  0x00AD, 0x00AE,
  // Chars that is used in complex-script shaping.
  0x0600, 0x0780,
  0x08A0, 0x10A0,
  0x1780, 0x1800,
  // General punctuation chars.
  0x2000, 0x2010,
  0x2011, 0x2012,
  0x2028, 0x2030,
  0x205F, 0x2070,
  0x25CC, 0x25CD,
  // Chars that is used in complex-script shaping.
  0xAA60, 0xAA80,
  // Specials Unicode block.
  0xFFF0, 0x10000
]);

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
    var charCode, glyphName, unicode, fontChar;

    this.name = name;
    this.loadedName = properties.loadedName;
    this.isType3Font = properties.isType3Font;
    this.sizes = [];
    this.missingFile = false;

    this.glyphCache = Object.create(null);

    var names = name.split('+');
    names = names.length > 1 ? names[1] : names[0];
    names = names.split(/[-,_]/g)[0];
    this.isSerifFont = !!(properties.flags & FontFlags.Serif);
    this.isSymbolicFont = !!(properties.flags & FontFlags.Symbolic);
    this.isMonospace = !!(properties.flags & FontFlags.FixedPitch);

    var type = properties.type;
    var subtype = properties.subtype;
    this.type = type;

    this.fallbackName = (this.isMonospace ? 'monospace' :
                         (this.isSerifFont ? 'serif' : 'sans-serif'));

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

    this.toUnicode = properties.toUnicode;

    this.toFontChar = [];

    if (properties.type === 'Type3') {
      for (charCode = 0; charCode < 256; charCode++) {
        this.toFontChar[charCode] = (this.differences[charCode] ||
                                     properties.defaultEncoding[charCode]);
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
    var glyphsUnicodeMap;
    if (!file || file.isEmpty) {
      if (file) {
        // Some bad PDF generators will include empty font files,
        // attempting to recover by assuming that no file exists.
        warn('Font file is empty in "' + name + '" (' + this.loadedName + ')');
      }

      this.missingFile = true;
      // The file data is not specified. Trying to fix the font name
      // to be used with the canvas.font.
      var fontName = name.replace(/[,_]/g, '-');
      var stdFontMap = getStdFontMap(), nonStdFontMap = getNonStdFontMap();
      var isStandardFont = !!stdFontMap[fontName] ||
        !!(nonStdFontMap[fontName] && stdFontMap[nonStdFontMap[fontName]]);
      fontName = stdFontMap[fontName] || nonStdFontMap[fontName] || fontName;

      this.bold = (fontName.search(/bold/gi) !== -1);
      this.italic = ((fontName.search(/oblique/gi) !== -1) ||
                     (fontName.search(/italic/gi) !== -1));

      // Use 'name' instead of 'fontName' here because the original
      // name ArialBlack for example will be replaced by Helvetica.
      this.black = (name.search(/Black/g) !== -1);

      // if at least one width is present, remeasure all chars when exists
      this.remeasure = Object.keys(this.widths).length > 0;
      if (isStandardFont && type === 'CIDFontType2' &&
          properties.cidEncoding.indexOf('Identity-') === 0) {
        var GlyphMapForStandardFonts = getGlyphMapForStandardFonts();
        // Standard fonts might be embedded as CID font without glyph mapping.
        // Building one based on GlyphMapForStandardFonts.
        var map = [];
        for (charCode in GlyphMapForStandardFonts) {
          map[+charCode] = GlyphMapForStandardFonts[charCode];
        }
        if (/ArialBlack/i.test(name)) {
          var SupplementalGlyphMapForArialBlack =
            getSupplementalGlyphMapForArialBlack();
          for (charCode in SupplementalGlyphMapForArialBlack) {
            map[+charCode] = SupplementalGlyphMapForArialBlack[charCode];
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
        var symbols = SymbolSetEncoding;
        glyphsUnicodeMap = getGlyphsUnicode();
        for (charCode in symbols) {
          fontChar = glyphsUnicodeMap[symbols[charCode]];
          if (!fontChar) {
            continue;
          }
          this.toFontChar[charCode] = fontChar;
        }
        for (charCode in properties.differences) {
          fontChar = glyphsUnicodeMap[properties.differences[charCode]];
          if (!fontChar) {
            continue;
          }
          this.toFontChar[charCode] = fontChar;
        }
      } else if (/Dingbats/i.test(fontName)) {
        glyphsUnicodeMap = getDingbatsGlyphsUnicode();
        if (/Wingdings/i.test(name)) {
          warn('Wingdings font without embedded font file, ' +
               'falling back to the ZapfDingbats encoding.');
        }
        var dingbats = ZapfDingbatsEncoding;
        for (charCode in dingbats) {
          fontChar = glyphsUnicodeMap[dingbats[charCode]];
          if (!fontChar) {
            continue;
          }
          this.toFontChar[charCode] = fontChar;
        }
        for (charCode in properties.differences) {
          fontChar = glyphsUnicodeMap[properties.differences[charCode]];
          if (!fontChar) {
            continue;
          }
          this.toFontChar[charCode] = fontChar;
        }
      } else if (isStandardFont) {
        glyphsUnicodeMap = getGlyphsUnicode();
        for (charCode in properties.defaultEncoding) {
          glyphName = (properties.differences[charCode] ||
                       properties.defaultEncoding[charCode]);
          unicode = getUnicodeForGlyph(glyphName, glyphsUnicodeMap);
          if (unicode !== -1) {
            this.toFontChar[charCode] = unicode;
          }
        }
      } else {
        glyphsUnicodeMap = getGlyphsUnicode();
        this.toUnicode.forEach(function(charCode, unicodeCharCode) {
          if (!this.composite) {
            glyphName = (properties.differences[charCode] ||
                         properties.defaultEncoding[charCode]);
            unicode = getUnicodeForGlyph(glyphName, glyphsUnicodeMap);
            if (unicode !== -1) {
              unicodeCharCode = unicode;
            }
          }
          this.toFontChar[charCode] = unicodeCharCode;
        }.bind(this));
      }
      this.loadedName = fontName.split('-')[0];
      this.loading = false;
      this.fontType = getFontType(type, subtype);
      return;
    }

    // Some fonts might use wrong font types for Type1C or CIDFontType0C
    if (subtype === 'Type1C' && (type !== 'Type1' && type !== 'MMType1')) {
      // Some TrueType fonts by mistake claim Type1C
      if (isTrueTypeFile(file)) {
        subtype = 'TrueType';
      } else {
        type = 'Type1';
      }
    }
    if (subtype === 'CIDFontType0C' && type !== 'CIDFontType0') {
      type = 'CIDFontType0';
    }
    if (subtype === 'OpenType') {
      type = 'OpenType';
    }
    // Some CIDFontType0C fonts by mistake claim CIDFontType0.
    if (type === 'CIDFontType0') {
      if (isType1File(file)) {
        subtype = 'CIDFontType0';
      } else if (isOpenTypeFile(file)) {
        // Sometimes the type/subtype can be a complete lie (see issue6782.pdf).
        type = subtype = 'OpenType';
      } else {
        subtype = 'CIDFontType0C';
      }
    }

    var data;
    switch (type) {
      case 'MMType1':
        info('MMType1 font (' + name + '), falling back to Type1.');
        /* falls through */
      case 'Type1':
      case 'CIDFontType0':
        this.mimetype = 'font/opentype';

        var cff = (subtype === 'Type1C' || subtype === 'CIDFontType0C') ?
          new CFFFont(file, properties) : new Type1Font(name, file, properties);

        adjustWidths(properties);

        // Wrap the CFF data inside an OTF font file
        data = this.convert(name, cff, properties);
        break;

      case 'OpenType':
      case 'TrueType':
      case 'CIDFontType2':
        this.mimetype = 'font/opentype';

        // Repair the TrueType file. It is can be damaged in the point of
        // view of the sanitizer
        data = this.checkAndRepair(name, file, properties);
        if (this.isOpenType) {
          adjustWidths(properties);

          type = 'OpenType';
        }
        break;

      default:
        error('Font ' + type + ' is not supported');
        break;
    }

    this.data = data;
    this.fontType = getFontType(type, subtype);

    // Transfer some properties again that could change during font conversion
    this.fontMatrix = properties.fontMatrix;
    this.widths = properties.widths;
    this.defaultWidth = properties.defaultWidth;
    this.encoding = properties.baseEncoding;
    this.seacMap = properties.seacMap;

    this.loading = true;
  }

  Font.getFontID = (function () {
    var ID = 1;
    return function Font_getFontID() {
      return String(ID++);
    };
  })();

  function int16(b0, b1) {
    return (b0 << 8) + b1;
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
    value = (value > 0x7FFF ? 0x7FFF : (value < -0x8000 ? -0x8000 : value));
    return String.fromCharCode((value >> 8) & 0xff, value & 0xff);
  }

  function isTrueTypeFile(file) {
    var header = file.peekBytes(4);
    return readUint32(header, 0) === 0x00010000;
  }

  function isOpenTypeFile(file) {
    var header = file.peekBytes(4);
    return bytesToString(header) === 'OTTO';
  }

  function isType1File(file) {
    var header = file.peekBytes(2);
    // All Type1 font programs must begin with the comment '%!' (0x25 + 0x21).
    if (header[0] === 0x25 && header[1] === 0x21) {
      return true;
    }
    // ... obviously some fonts violate that part of the specification,
    // please refer to the comment in |Type1Font| below.
    if (header[0] === 0x80 && header[1] === 0x01) { // pfb file header.
      return true;
    }
    return false;
  }

  /**
   * Helper function for |adjustMapping|.
   * @return {boolean}
   */
  function isProblematicUnicodeLocation(code) {
    // Using binary search to find a range start.
    var i = 0, j = ProblematicCharRanges.length - 1;
    while (i < j) {
      var c = (i + j + 1) >> 1;
      if (code < ProblematicCharRanges[c]) {
        j = c - 1;
      } else {
        i = c;
      }
    }
    // Even index means code in problematic range.
    return !(i & 1);
  }

  /**
   * Rebuilds the char code to glyph ID map by trying to replace the char codes
   * with their unicode value. It also moves char codes that are in known
   * problematic locations.
   * @return {Object} Two properties:
   * 'toFontChar' - maps original char codes(the value that will be read
   * from commands such as show text) to the char codes that will be used in the
   * font that we build
   * 'charCodeToGlyphId' - maps the new font char codes to glyph ids
   */
  function adjustMapping(charCodeToGlyphId, properties) {
    var toUnicode = properties.toUnicode;
    var isSymbolic = !!(properties.flags & FontFlags.Symbolic);
    var isIdentityUnicode =
      properties.toUnicode instanceof IdentityToUnicodeMap;
    var newMap = Object.create(null);
    var toFontChar = [];
    var usedFontCharCodes = [];
    var nextAvailableFontCharCode = PRIVATE_USE_OFFSET_START;
    for (var originalCharCode in charCodeToGlyphId) {
      originalCharCode |= 0;
      var glyphId = charCodeToGlyphId[originalCharCode];
      var fontCharCode = originalCharCode;
      // First try to map the value to a unicode position if a non identity map
      // was created.
      if (!isIdentityUnicode && toUnicode.has(originalCharCode)) {
        var unicode = toUnicode.get(fontCharCode);
        // TODO: Try to map ligatures to the correct spot.
        if (unicode.length === 1) {
          fontCharCode = unicode.charCodeAt(0);
        }
      }
      // Try to move control characters, special characters and already mapped
      // characters to the private use area since they will not be drawn by
      // canvas if left in their current position. Also, move characters if the
      // font was symbolic and there is only an identity unicode map since the
      // characters probably aren't in the correct position (fixes an issue
      // with firefox and thuluthfont).
      if ((usedFontCharCodes[fontCharCode] !== undefined ||
           isProblematicUnicodeLocation(fontCharCode) ||
           (isSymbolic && isIdentityUnicode)) &&
          nextAvailableFontCharCode <= PRIVATE_USE_OFFSET_END) { // Room left.
        // Loop to try and find a free spot in the private use area.
        do {
          fontCharCode = nextAvailableFontCharCode++;

          if (SKIP_PRIVATE_USE_RANGE_F000_TO_F01F && fontCharCode === 0xF000) {
            fontCharCode = 0xF020;
            nextAvailableFontCharCode = fontCharCode + 1;
          }

        } while (usedFontCharCodes[fontCharCode] !== undefined &&
                 nextAvailableFontCharCode <= PRIVATE_USE_OFFSET_END);
      }

      newMap[fontCharCode] = glyphId;
      toFontChar[originalCharCode] = fontCharCode;
      usedFontCharCodes[fontCharCode] = true;
    }
    return {
      toFontChar: toFontChar,
      charCodeToGlyphId: newMap,
      nextAvailableFontCharCode: nextAvailableFontCharCode
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
        if (end === 0xFFFF) {
          break;
        }
      }
      ranges.push([start, end, codeIndices]);
    }

    return ranges;
  }

  function createCmapTable(glyphs, numGlyphs) {
    var ranges = getRanges(glyphs, numGlyphs);
    var numTables = ranges[ranges.length - 1][1] > 0xFFFF ? 2 : 1;
    var cmap = '\x00\x00' + // version
               string16(numTables) +  // numTables
               '\x00\x03' + // platformID
               '\x00\x01' + // encodingID
               string32(4 + numTables * 8); // start of the table record

    var i, ii, j, jj;
    for (i = ranges.length - 1; i >= 0; --i) {
      if (ranges[i][0] <= 0xFFFF) { break; }
    }
    var bmpLength = i + 1;

    if (ranges[i][0] < 0xFFFF && ranges[i][1] === 0xFFFF) {
      ranges[i][1] = 0xFFFE;
    }
    var trailingRangesCount = ranges[i][1] < 0xFFFF ? 1 : 0;
    var segCount = bmpLength + trailingRangesCount;
    var searchParams = OpenTypeFileBuilder.getSearchParams(segCount, 2);

    // Fill up the 4 parallel arrays describing the segments.
    var startCount = '';
    var endCount = '';
    var idDeltas = '';
    var idRangeOffsets = '';
    var glyphsIds = '';
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
        bias += (end - start + 1);

        idDeltas += string16(0);
        idRangeOffsets += string16(offset);

        for (j = 0, jj = codes.length; j < jj; ++j) {
          glyphsIds += string16(codes[j]);
        }
      } else {
        var startCode = codes[0];

        idDeltas += string16((startCode - start) & 0xFFFF);
        idRangeOffsets += string16(0);
      }
    }

    if (trailingRangesCount > 0) {
      endCount += '\xFF\xFF';
      startCount += '\xFF\xFF';
      idDeltas += '\x00\x01';
      idRangeOffsets += '\x00\x00';
    }

    var format314 = '\x00\x00' + // language
                    string16(2 * segCount) +
                    string16(searchParams.range) +
                    string16(searchParams.entry) +
                    string16(searchParams.rangeShift) +
                    endCount + '\x00\x00' + startCount +
                    idDeltas + idRangeOffsets + glyphsIds;

    var format31012 = '';
    var header31012 = '';
    if (numTables > 1) {
      cmap += '\x00\x03' + // platformID
              '\x00\x0A' + // encodingID
              string32(4 + numTables * 8 +
                       4 + format314.length); // start of the table record
      format31012 = '';
      for (i = 0, ii = ranges.length; i < ii; i++) {
        range = ranges[i];
        start = range[0];
        codes = range[2];
        var code = codes[0];
        for (j = 1, jj = codes.length; j < jj; ++j) {
          if (codes[j] !== codes[j - 1] + 1) {
            end = range[0] + j - 1;
            format31012 += string32(start) + // startCharCode
                           string32(end) + // endCharCode
                           string32(code); // startGlyphID
            start = end + 1;
            code = codes[j];
          }
        }
        format31012 += string32(start) + // startCharCode
                       string32(range[1]) + // endCharCode
                       string32(code); // startGlyphID
      }
      header31012 = '\x00\x0C' + // format
                    '\x00\x00' + // reserved
                    string32(format31012.length + 16) + // length
                    '\x00\x00\x00\x00' + // language
                    string32(format31012.length / 12); // nGroups
    }

    return cmap + '\x00\x04' + // format
                  string16(format314.length + 4) + // length
                  format314 + header31012 + format31012;
  }

  function validateOS2Table(os2) {
    var stream = new Stream(os2.data);
    var version = stream.getUint16();
    // TODO verify all OS/2 tables fields, but currently we validate only those
    // that give us issues
    stream.getBytes(60); // skipping type, misc sizes, panose, unicode ranges
    var selection = stream.getUint16();
    if (version < 4 && (selection & 0x0300)) {
      return false;
    }
    var firstChar = stream.getUint16();
    var lastChar = stream.getUint16();
    if (firstChar > lastChar) {
      return false;
    }
    stream.getBytes(6); // skipping sTypoAscender/Descender/LineGap
    var usWinAscent = stream.getUint16();
    if (usWinAscent === 0) { // makes font unreadable by windows
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
      descent: 0
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
          ulUnicodeRange2 |= 1 << position - 32;
        } else if (position < 96) {
          ulUnicodeRange3 |= 1 << position - 64;
        } else if (position < 123) {
          ulUnicodeRange4 |= 1 << position - 96;
        } else {
          error('Unicode ranges Bits > 123 are reserved for internal usage');
        }
      }
    } else {
      // TODO
      firstCharIndex = 0;
      lastCharIndex = 255;
    }

    var bbox = properties.bbox || [0, 0, 0, 0];
    var unitsPerEm = (override.unitsPerEm ||
                      1 / (properties.fontMatrix || FONT_IDENTITY_MATRIX)[0]);

    // if the font units differ to the PDF glyph space units
    // then scale up the values
    var scale = (properties.ascentScaled ? 1.0 :
                 unitsPerEm / PDF_GLYPH_SPACE_UNITS);

    var typoAscent = (override.ascent ||
                      Math.round(scale * (properties.ascent || bbox[3])));
    var typoDescent = (override.descent ||
                       Math.round(scale * (properties.descent || bbox[1])));
    if (typoDescent > 0 && properties.descent > 0 && bbox[1] < 0) {
      typoDescent = -typoDescent; // fixing incorrect descent
    }
    var winAscent = override.yMax || typoAscent;
    var winDescent = -override.yMin || -typoDescent;

    return '\x00\x03' + // version
           '\x02\x24' + // xAvgCharWidth
           '\x01\xF4' + // usWeightClass
           '\x00\x05' + // usWidthClass
           '\x00\x00' + // fstype (0 to let the font loads via font-face on IE)
           '\x02\x8A' + // ySubscriptXSize
           '\x02\xBB' + // ySubscriptYSize
           '\x00\x00' + // ySubscriptXOffset
           '\x00\x8C' + // ySubscriptYOffset
           '\x02\x8A' + // ySuperScriptXSize
           '\x02\xBB' + // ySuperScriptYSize
           '\x00\x00' + // ySuperScriptXOffset
           '\x01\xDF' + // ySuperScriptYOffset
           '\x00\x31' + // yStrikeOutSize
           '\x01\x02' + // yStrikeOutPosition
           '\x00\x00' + // sFamilyClass
           '\x00\x00\x06' +
           String.fromCharCode(properties.fixedPitch ? 0x09 : 0x00) +
           '\x00\x00\x00\x00\x00\x00' + // Panose
           string32(ulUnicodeRange1) + // ulUnicodeRange1 (Bits 0-31)
           string32(ulUnicodeRange2) + // ulUnicodeRange2 (Bits 32-63)
           string32(ulUnicodeRange3) + // ulUnicodeRange3 (Bits 64-95)
           string32(ulUnicodeRange4) + // ulUnicodeRange4 (Bits 96-127)
           '\x2A\x32\x31\x2A' + // achVendID
           string16(properties.italicAngle ? 1 : 0) + // fsSelection
           string16(firstCharIndex ||
                    properties.firstChar) + // usFirstCharIndex
           string16(lastCharIndex || properties.lastChar) +  // usLastCharIndex
           string16(typoAscent) + // sTypoAscender
           string16(typoDescent) + // sTypoDescender
           '\x00\x64' + // sTypoLineGap (7%-10% of the unitsPerEM value)
           string16(winAscent) + // usWinAscent
           string16(winDescent) + // usWinDescent
           '\x00\x00\x00\x00' + // ulCodePageRange1 (Bits 0-31)
           '\x00\x00\x00\x00' + // ulCodePageRange2 (Bits 32-63)
           string16(properties.xHeight) + // sxHeight
           string16(properties.capHeight) + // sCapHeight
           string16(0) + // usDefaultChar
           string16(firstCharIndex || properties.firstChar) + // usBreakChar
           '\x00\x03';  // usMaxContext
  }

  function createPostTable(properties) {
    var angle = Math.floor(properties.italicAngle * (Math.pow(2, 16)));
    return ('\x00\x03\x00\x00' + // Version number
            string32(angle) + // italicAngle
            '\x00\x00' + // underlinePosition
            '\x00\x00' + // underlineThickness
            string32(properties.fixedPitch) + // isFixedPitch
            '\x00\x00\x00\x00' + // minMemType42
            '\x00\x00\x00\x00' + // maxMemType42
            '\x00\x00\x00\x00' + // minMemType1
            '\x00\x00\x00\x00');  // maxMemType1
  }

  function createNameTable(name, proto) {
    if (!proto) {
      proto = [[], []]; // no strings and unicode strings
    }

    var strings = [
      proto[0][0] || 'Original licence',  // 0.Copyright
      proto[0][1] || name,                // 1.Font family
      proto[0][2] || 'Unknown',           // 2.Font subfamily (font weight)
      proto[0][3] || 'uniqueID',          // 3.Unique ID
      proto[0][4] || name,                // 4.Full font name
      proto[0][5] || 'Version 0.11',      // 5.Version
      proto[0][6] || '',                  // 6.Postscript name
      proto[0][7] || 'Unknown',           // 7.Trademark
      proto[0][8] || 'Unknown',           // 8.Manufacturer
      proto[0][9] || 'Unknown'            // 9.Designer
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
      stringsUnicode.push(strBufUnicode.join(''));
    }

    var names = [strings, stringsUnicode];
    var platforms = ['\x00\x01', '\x00\x03'];
    var encodings = ['\x00\x00', '\x00\x01'];
    var languages = ['\x00\x00', '\x04\x09'];

    var namesRecordCount = strings.length * platforms.length;
    var nameTable =
      '\x00\x00' +                           // format
      string16(namesRecordCount) +           // Number of names Record
      string16(namesRecordCount * 12 + 6);   // Storage

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

    nameTable += strings.join('') + stringsUnicode.join('');
    return nameTable;
  }

  Font.prototype = {
    name: null,
    font: null,
    mimetype: null,
    encoding: null,
    get renderer() {
      var renderer = FontRendererFactory.create(this);
      return shadow(this, 'renderer', renderer);
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

    checkAndRepair: function Font_checkAndRepair(name, font, properties) {
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

        if (tag === 'head') {
          // clearing checksum adjustment
          data[8] = data[9] = data[10] = data[11] = 0;
          data[17] |= 0x20; //Set font optimized for cleartype flag
        }

        return {
          tag: tag,
          checksum: checksum,
          length: length,
          offset: offset,
          data: data
        };
      }

      function readOpenTypeHeader(ttf) {
        return {
          version: bytesToString(ttf.getBytes(4)),
          numTables: ttf.getUint16(),
          searchRange: ttf.getUint16(),
          entrySelector: ttf.getUint16(),
          rangeShift: ttf.getUint16()
        };
      }

      /**
       * Read the appropriate subtable from the cmap according to 9.6.6.4 from
       * PDF spec
       */
      function readCmapTable(cmap, font, isSymbolicFont, hasEncoding) {
        if (!cmap) {
          warn('No cmap table available.');
          return {
            platformId: -1,
            encodingId: -1,
            mappings: [],
            hasShortCmap: false
          };
        }
        var segment;
        var start = (font.start ? font.start : 0) + cmap.offset;
        font.pos = start;

        var version = font.getUint16();
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

          if (platformId === 0 && encodingId === 0) {
            useTable = true;
            // Continue the loop since there still may be a higher priority
            // table.
          } else if (platformId === 1 && encodingId === 0) {
            useTable = true;
            // Continue the loop since there still may be a higher priority
            // table.
          } else if (platformId === 3 && encodingId === 1 &&
                     ((!isSymbolicFont && hasEncoding) || !potentialTable)) {
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
              platformId: platformId,
              encodingId: encodingId,
              offset: offset
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
          warn('Could not find a preferred cmap table.');
          return {
            platformId: -1,
            encodingId: -1,
            mappings: [],
            hasShortCmap: false
          };
        }

        var format = font.getUint16();
        var length = font.getUint16();
        var language = font.getUint16();

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
              glyphId: index
            });
          }
          hasShortCmap = true;
        } else if (format === 4) {
          // re-creating the table in format 4 since the encoding
          // might be changed
          var segCount = (font.getUint16() >> 1);
          font.getBytes(6); // skipping range fields
          var segIndex, segments = [];
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
            offsetsCount = Math.max(offsetsCount, offsetIndex +
                                    segment.end - segment.start + 1);
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
              if (j === 0xFFFF) {
                continue;
              }

              glyphId = (offsetIndex < 0 ?
                         j : offsets[offsetIndex + j - start]);
              glyphId = (glyphId + delta) & 0xFFFF;
              if (glyphId === 0) {
                continue;
              }
              mappings.push({
                charCode: j,
                glyphId: glyphId
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
              charCode: charCode,
              glyphId: glyphId
            });
          }
        } else {
          warn('cmap table has unsupported format: ' + format);
          return {
            platformId: -1,
            encodingId: -1,
            mappings: [],
            hasShortCmap: false
          };
        }

        // removing duplicate entries
        mappings.sort(function (a, b) {
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
          mappings: mappings,
          hasShortCmap: hasShortCmap
        };
      }

      function sanitizeMetrics(font, header, metrics, numGlyphs) {
        if (!header) {
          if (metrics) {
            metrics.data = null;
          }
          return;
        }

        font.pos = (font.start ? font.start : 0) + header.offset;
        font.pos += header.length - 2;
        var numOfMetrics = font.getUint16();

        if (numOfMetrics > numGlyphs) {
          info('The numOfMetrics (' + numOfMetrics + ') should not be ' +
               'greater than the numGlyphs (' + numGlyphs + ')');
          // Reduce numOfMetrics if it is greater than numGlyphs
          numOfMetrics = numGlyphs;
          header.data[34] = (numOfMetrics & 0xff00) >> 8;
          header.data[35] = numOfMetrics & 0x00ff;
        }

        var numOfSidebearings = numGlyphs - numOfMetrics;
        var numMissing = numOfSidebearings -
          ((metrics.length - numOfMetrics * 4) >> 1);

        if (numMissing > 0) {
          // For each missing glyph, we set both the width and lsb to 0 (zero).
          // Since we need to add two properties for each glyph, this explains
          // the use of |numMissing * 2| when initializing the typed array.
          var entries = new Uint8Array(metrics.length + numMissing * 2);
          entries.set(metrics.data);
          metrics.data = entries;
        }
      }

      function sanitizeGlyph(source, sourceStart, sourceEnd, dest, destStart,
                             hintsValid) {
        if (sourceEnd - sourceStart <= 12) {
          // glyph with data less than 12 is invalid one
          return 0;
        }
        var glyf = source.subarray(sourceStart, sourceEnd);
        var contoursCount = (glyf[0] << 8) | glyf[1];
        if (contoursCount & 0x8000) {
          // complex glyph, writing as is
          dest.set(glyf, destStart);
          return glyf.length;
        }

        var i, j = 10, flagsCount = 0;
        for (i = 0; i < contoursCount; i++) {
          var endPoint = (glyf[j] << 8) | glyf[j + 1];
          flagsCount = endPoint + 1;
          j += 2;
        }
        // skipping instructions
        var instructionsStart = j;
        var instructionsLength = (glyf[j] << 8) | glyf[j + 1];
        j += 2 + instructionsLength;
        var instructionsEnd = j;
        // validating flags
        var coordinatesLength = 0;
        for (i = 0; i < flagsCount; i++) {
          var flag = glyf[j++];
          if (flag & 0xC0) {
            // reserved flags must be zero, cleaning up
            glyf[j - 1] = flag & 0x3F;
          }
          var xyLength = ((flag & 2) ? 1 : (flag & 16) ? 0 : 2) +
                         ((flag & 4) ? 1 : (flag & 32) ? 0 : 2);
          coordinatesLength += xyLength;
          if (flag & 8) {
            var repeat = glyf[j++];
            i += repeat;
            coordinatesLength += repeat * xyLength;
          }
        }
        // glyph without coordinates will be rejected
        if (coordinatesLength === 0) {
          return 0;
        }
        var glyphDataLength = j + coordinatesLength;
        if (glyphDataLength > glyf.length) {
          // not enough data for coordinates
          return 0;
        }
        if (!hintsValid && instructionsLength > 0) {
          dest.set(glyf.subarray(0, instructionsStart), destStart);
          dest.set([0, 0], destStart + instructionsStart);
          dest.set(glyf.subarray(instructionsEnd, glyphDataLength),
                   destStart + instructionsStart + 2);
          glyphDataLength -= instructionsLength;
          if (glyf.length - glyphDataLength > 3) {
            glyphDataLength = (glyphDataLength + 3) & ~3;
          }
          return glyphDataLength;
        }
        if (glyf.length - glyphDataLength > 3) {
          // truncating and aligning to 4 bytes the long glyph data
          glyphDataLength = (glyphDataLength + 3) & ~3;
          dest.set(glyf.subarray(0, glyphDataLength), destStart);
          return glyphDataLength;
        }
        // glyph data is fine
        dest.set(glyf, destStart);
        return glyf.length;
      }

      function sanitizeHead(head, numGlyphs, locaLength) {
        var data = head.data;

        // Validate version:
        // Should always be 0x00010000
        var version = int32(data[0], data[1], data[2], data[3]);
        if (version >> 16 !== 1) {
          info('Attempting to fix invalid version in head table: ' + version);
          data[0] = 0;
          data[1] = 1;
          data[2] = 0;
          data[3] = 0;
        }

        var indexToLocFormat = int16(data[50], data[51]);
        if (indexToLocFormat < 0 || indexToLocFormat > 1) {
          info('Attempting to fix invalid indexToLocFormat in head table: ' +
               indexToLocFormat);

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
            warn('Could not fix indexToLocFormat: ' + indexToLocFormat);
          }
        }
      }

      function sanitizeGlyphLocations(loca, glyf, numGlyphs,
                                      isGlyphLocationsLong, hintsValid,
                                      dupFirstEntry) {
        var itemSize, itemDecode, itemEncode;
        if (isGlyphLocationsLong) {
          itemSize = 4;
          itemDecode = function fontItemDecodeLong(data, offset) {
            return (data[offset] << 24) | (data[offset + 1] << 16) |
                   (data[offset + 2] << 8) | data[offset + 3];
          };
          itemEncode = function fontItemEncodeLong(data, offset, value) {
            data[offset] = (value >>> 24) & 0xFF;
            data[offset + 1] = (value >> 16) & 0xFF;
            data[offset + 2] = (value >> 8) & 0xFF;
            data[offset + 3] = value & 0xFF;
          };
        } else {
          itemSize = 2;
          itemDecode = function fontItemDecode(data, offset) {
            return (data[offset] << 9) | (data[offset + 1] << 1);
          };
          itemEncode = function fontItemEncode(data, offset, value) {
            data[offset] = (value >> 9) & 0xFF;
            data[offset + 1] = (value >> 1) & 0xFF;
          };
        }
        var locaData = loca.data;
        var locaDataSize = itemSize * (1 + numGlyphs);
        // is loca.data too short or long?
        if (locaData.length !== locaDataSize) {
          locaData = new Uint8Array(locaDataSize);
          locaData.set(loca.data.subarray(0, locaDataSize));
          loca.data = locaData;
        }
        // removing the invalid glyphs
        var oldGlyfData = glyf.data;
        var oldGlyfDataLength = oldGlyfData.length;
        var newGlyfData = new Uint8Array(oldGlyfDataLength);
        var startOffset = itemDecode(locaData, 0);
        var writeOffset = 0;
        var missingGlyphData = Object.create(null);
        itemEncode(locaData, 0, writeOffset);
        var i, j;
        for (i = 0, j = itemSize; i < numGlyphs; i++, j += itemSize) {
          var endOffset = itemDecode(locaData, j);
          if (endOffset > oldGlyfDataLength &&
              ((oldGlyfDataLength + 3) & ~3) === endOffset) {
            // Aspose breaks fonts by aligning the glyphs to the qword, but not
            // the glyf table size, which makes last glyph out of range.
            endOffset = oldGlyfDataLength;
          }
          if (endOffset > oldGlyfDataLength) {
            // glyph end offset points outside glyf data, rejecting the glyph
            itemEncode(locaData, j, writeOffset);
            startOffset = endOffset;
            continue;
          }

          if (startOffset === endOffset) {
            missingGlyphData[i] = true;
          }

          var newLength = sanitizeGlyph(oldGlyfData, startOffset, endOffset,
                                        newGlyfData, writeOffset, hintsValid);
          writeOffset += newLength;
          itemEncode(locaData, j, writeOffset);
          startOffset = endOffset;
        }

        if (writeOffset === 0) {
          // glyf table cannot be empty -- redoing the glyf and loca tables
          // to have single glyph with one point
          var simpleGlyph = new Uint8Array(
            [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 49, 0]);
          for (i = 0, j = itemSize; i < numGlyphs; i++, j += itemSize) {
            itemEncode(locaData, j, simpleGlyph.length);
          }
          glyf.data = simpleGlyph;
          return missingGlyphData;
        }

        if (dupFirstEntry) {
          var firstEntryLength = itemDecode(locaData, itemSize);
          if (newGlyfData.length > firstEntryLength + writeOffset) {
            glyf.data = newGlyfData.subarray(0, firstEntryLength + writeOffset);
          } else {
            glyf.data = new Uint8Array(firstEntryLength + writeOffset);
            glyf.data.set(newGlyfData.subarray(0, writeOffset));
          }
          glyf.data.set(newGlyfData.subarray(0, firstEntryLength), writeOffset);
          itemEncode(loca.data, locaData.length - itemSize,
                     writeOffset + firstEntryLength);
        } else {
          glyf.data = newGlyfData.subarray(0, writeOffset);
        }
        return missingGlyphData;
      }

      function readPostScriptTable(post, properties, maxpNumGlyphs) {
        var start = (font.start ? font.start : 0) + post.offset;
        font.pos = start;

        var length = post.length, end = start + length;
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
              customNames.push(strBuf.join(''));
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
            warn('Unknown/unsupported post table version ' + version);
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
        var length = nameTable.length, end = start + length;
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

        for (i = 0; i < numRecords &&
                        font.pos + NAME_RECORD_LENGTH <= end; i++) {
          var r = {
            platform: font.getUint16(),
            encoding: font.getUint16(),
            language: font.getUint16(),
            name: font.getUint16(),
            length: font.getUint16(),
            offset: font.getUint16()
          };
          // using only Macintosh and Windows platform/encoding names
          if ((r.platform === 1 && r.encoding === 0 && r.language === 0) ||
              (r.platform === 3 && r.encoding === 1 && r.language === 0x409)) {
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
            var str = '';
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
        var i = 0, j, n, b, funcId, pc, lastEndf = 0, lastDeff = 0;
        var stack = [];
        var callstack = [];
        var functionsCalled = [];
        var tooComplexToFollowFunctions =
          ttContext.tooComplexToFollowFunctions;
        var inFDEF = false, ifLevel = 0, inELSE = 0;
        for (var ii = data.length; i < ii;) {
          var op = data[i++];
          // The TrueType instruction set docs can be found at
          // https://developer.apple.com/fonts/TTRefMan/RM05/Chap5.html
          if (op === 0x40) { // NPUSHB - pushes n bytes
            n = data[i++];
            if (inFDEF || inELSE) {
              i += n;
            } else {
              for (j = 0; j < n; j++) {
                stack.push(data[i++]);
              }
            }
          } else if (op === 0x41) { // NPUSHW - pushes n words
            n = data[i++];
            if (inFDEF || inELSE) {
              i += n * 2;
            } else {
              for (j = 0; j < n; j++) {
                b = data[i++];
                stack.push((b << 8) | data[i++]);
              }
            }
          } else if ((op & 0xF8) === 0xB0) { // PUSHB - pushes bytes
            n = op - 0xB0 + 1;
            if (inFDEF || inELSE) {
              i += n;
            } else {
              for (j = 0; j < n; j++) {
                stack.push(data[i++]);
              }
            }
          } else if ((op & 0xF8) === 0xB8) { // PUSHW - pushes words
            n = op - 0xB8 + 1;
            if (inFDEF || inELSE) {
              i += n * 2;
            } else {
              for (j = 0; j < n; j++) {
                b = data[i++];
                stack.push((b << 8) | data[i++]);
              }
            }
          } else if (op === 0x2B && !tooComplexToFollowFunctions) { // CALL
            if (!inFDEF && !inELSE) {
              // collecting inforamtion about which functions are used
              funcId = stack[stack.length - 1];
              ttContext.functionsUsed[funcId] = true;
              if (funcId in ttContext.functionsStackDeltas) {
                stack.length += ttContext.functionsStackDeltas[funcId];
              } else if (funcId in ttContext.functionsDefined &&
                         functionsCalled.indexOf(funcId) < 0) {
                callstack.push({data: data, i: i, stackTop: stack.length - 1});
                functionsCalled.push(funcId);
                pc = ttContext.functionsDefined[funcId];
                if (!pc) {
                  warn('TT: CALL non-existent function');
                  ttContext.hintsValid = false;
                  return;
                }
                data = pc.data;
                i = pc.i;
              }
            }
          } else if (op === 0x2C && !tooComplexToFollowFunctions) { // FDEF
            if (inFDEF || inELSE) {
              warn('TT: nested FDEFs not allowed');
              tooComplexToFollowFunctions = true;
            }
            inFDEF = true;
            // collecting inforamtion about which functions are defined
            lastDeff = i;
            funcId = stack.pop();
            ttContext.functionsDefined[funcId] = {data: data, i: i};
          } else if (op === 0x2D) { // ENDF - end of function
            if (inFDEF) {
              inFDEF = false;
              lastEndf = i;
            } else {
              pc = callstack.pop();
              if (!pc) {
                warn('TT: ENDF bad stack');
                ttContext.hintsValid = false;
                return;
              }
              funcId = functionsCalled.pop();
              data = pc.data;
              i = pc.i;
              ttContext.functionsStackDeltas[funcId] =
                stack.length - pc.stackTop;
            }
          } else if (op === 0x89) { // IDEF - instruction definition
            if (inFDEF || inELSE) {
              warn('TT: nested IDEFs not allowed');
              tooComplexToFollowFunctions = true;
            }
            inFDEF = true;
            // recording it as a function to track ENDF
            lastDeff = i;
          } else if (op === 0x58) { // IF
            ++ifLevel;
          } else if (op === 0x1B) { // ELSE
            inELSE = ifLevel;
          } else if (op === 0x59) { // EIF
            if (inELSE === ifLevel) {
              inELSE = 0;
            }
            --ifLevel;
          } else if (op === 0x1C) { // JMPR
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
            var stackDelta = op <= 0x8E ? TTOpsStackDeltas[op] :
              op >= 0xC0 && op <= 0xDF ? -1 : op >= 0xE0 ? -2 : 0;
            if (op >= 0x71 && op <= 0x75) {
              n = stack.pop();
              if (n === n) {
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
          warn('TT: complementing a missing function tail');
          // new function definition started, but not finished
          // complete function by [CLEAR, ENDF]
          content.push(new Uint8Array([0x22, 0x2D]));
        }
        foldTTTable(table, content);
      }

      function checkInvalidFunctions(ttContext, maxFunctionDefs) {
        if (ttContext.tooComplexToFollowFunctions) {
          return;
        }
        if (ttContext.functionsDefined.length > maxFunctionDefs) {
          warn('TT: more functions defined than expected');
          ttContext.hintsValid = false;
          return;
        }
        for (var j = 0, jj = ttContext.functionsUsed.length; j < jj; j++) {
          if (j > maxFunctionDefs) {
            warn('TT: invalid function id: ' + j);
            ttContext.hintsValid = false;
            return;
          }
          if (ttContext.functionsUsed[j] && !ttContext.functionsDefined[j]) {
            warn('TT: undefined function: ' + j);
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

      function sanitizeTTPrograms(fpgm, prep, cvt) {
        var ttContext = {
          functionsDefined: [],
          functionsUsed: [],
          functionsStackDeltas: [],
          tooComplexToFollowFunctions: false,
          hintsValid: true
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
        if (cvt && (cvt.length & 1)) {
          var cvtData = new Uint8Array(cvt.length + 1);
          cvtData.set(cvt.data);
          cvt.data = cvtData;
        }
        return ttContext.hintsValid;
      }

      // The following steps modify the original font data, making copy
      font = new Stream(new Uint8Array(font.getBytes()));

      var VALID_TABLES = ['OS/2', 'cmap', 'head', 'hhea', 'hmtx', 'maxp',
        'name', 'post', 'loca', 'glyf', 'fpgm', 'prep', 'cvt ', 'CFF '];

      var header = readOpenTypeHeader(font);
      var numTables = header.numTables;
      var cff, cffFile;

      var tables = Object.create(null);
      tables['OS/2'] = null;
      tables['cmap'] = null;
      tables['head'] = null;
      tables['hhea'] = null;
      tables['hmtx'] = null;
      tables['maxp'] = null;
      tables['name'] = null;
      tables['post'] = null;

      var table;
      for (var i = 0; i < numTables; i++) {
        table = readTableEntry(font);
        if (VALID_TABLES.indexOf(table.tag) < 0) {
          continue; // skipping table if it's not a required or optional table
        }
        if (table.length === 0) {
          continue; // skipping empty tables
        }
        tables[table.tag] = table;
      }

      var isTrueType = !tables['CFF '];
      if (!isTrueType) {
        // OpenType font
        if ((header.version === 'OTTO' && properties.type !== 'CIDFontType2') ||
            !tables['head'] || !tables['hhea'] || !tables['maxp'] ||
            !tables['post']) {
          // no major tables: throwing everything at CFFFont
          cffFile = new Stream(tables['CFF '].data);
          cff = new CFFFont(cffFile, properties);

          adjustWidths(properties);

          return this.convert(name, cff, properties);
        }

        delete tables['glyf'];
        delete tables['loca'];
        delete tables['fpgm'];
        delete tables['prep'];
        delete tables['cvt '];
        this.isOpenType = true;
      } else {
        if (!tables['loca']) {
          error('Required "loca" table is not found');
        }
        if (!tables['glyf']) {
          warn('Required "glyf" table is not found -- trying to recover.');
          // Note: We use `sanitizeGlyphLocations` to add dummy glyf data below.
          tables['glyf'] = {
            tag: 'glyf',
            data: new Uint8Array(0),
          };
        }
        this.isOpenType = false;
      }

      if (!tables['maxp']) {
        error('Required "maxp" table is not found');
      }

      font.pos = (font.start || 0) + tables['maxp'].offset;
      var version = font.getInt32();
      var numGlyphs = font.getUint16();
      var maxFunctionDefs = 0;
      if (version >= 0x00010000 && tables['maxp'].length >= 22) {
        // maxZones can be invalid
        font.pos += 8;
        var maxZones = font.getUint16();
        if (maxZones > 2) { // reset to 2 if font has invalid maxZones
          tables['maxp'].data[14] = 0;
          tables['maxp'].data[15] = 2;
        }
        font.pos += 4;
        maxFunctionDefs = font.getUint16();
      }

      var dupFirstEntry = false;
      if (properties.type === 'CIDFontType2' && properties.toUnicode &&
          properties.toUnicode.get(0) > '\u0000') {
        // oracle's defect (see 3427), duplicating first entry
        dupFirstEntry = true;
        numGlyphs++;
        tables['maxp'].data[4] = numGlyphs >> 8;
        tables['maxp'].data[5] = numGlyphs & 255;
      }

      var hintsValid = sanitizeTTPrograms(tables['fpgm'], tables['prep'],
                                          tables['cvt '], maxFunctionDefs);
      if (!hintsValid) {
        delete tables['fpgm'];
        delete tables['prep'];
        delete tables['cvt '];
      }

      // Ensure the hmtx table contains the advance width and
      // sidebearings information for numGlyphs in the maxp table
      sanitizeMetrics(font, tables['hhea'], tables['hmtx'], numGlyphs);

      if (!tables['head']) {
        error('Required "head" table is not found');
      }

      sanitizeHead(tables['head'], numGlyphs,
                   isTrueType ? tables['loca'].length : 0);

      var missingGlyphs = Object.create(null);
      if (isTrueType) {
        var isGlyphLocationsLong = int16(tables['head'].data[50],
                                         tables['head'].data[51]);
        missingGlyphs = sanitizeGlyphLocations(tables['loca'], tables['glyf'],
                                               numGlyphs, isGlyphLocationsLong,
                                               hintsValid, dupFirstEntry);
      }

      if (!tables['hhea']) {
        error('Required "hhea" table is not found');
      }

      // Sanitizer reduces the glyph advanceWidth to the maxAdvanceWidth
      // Sometimes it's 0. That needs to be fixed
      if (tables['hhea'].data[10] === 0 && tables['hhea'].data[11] === 0) {
        tables['hhea'].data[10] = 0xFF;
        tables['hhea'].data[11] = 0xFF;
      }

      // Extract some more font properties from the OpenType head and
      // hhea tables; yMin and descent value are always negative.
      var metricsOverride = {
        unitsPerEm: int16(tables['head'].data[18], tables['head'].data[19]),
        yMax: int16(tables['head'].data[42], tables['head'].data[43]),
        yMin: signedInt16(tables['head'].data[38], tables['head'].data[39]),
        ascent: int16(tables['hhea'].data[4], tables['hhea'].data[5]),
        descent: signedInt16(tables['hhea'].data[6], tables['hhea'].data[7])
      };

      // PDF FontDescriptor metrics lie -- using data from actual font.
      this.ascent = metricsOverride.ascent / metricsOverride.unitsPerEm;
      this.descent = metricsOverride.descent / metricsOverride.unitsPerEm;

      // The 'post' table has glyphs names.
      if (tables['post']) {
        var valid = readPostScriptTable(tables['post'], properties, numGlyphs);
        if (!valid) {
          tables['post'] = null;
        }
      }

      var charCodeToGlyphId = [], charCode;
      var toUnicode = properties.toUnicode, widths = properties.widths;
      var skipToUnicode = (toUnicode instanceof IdentityToUnicodeMap ||
                           toUnicode.length === 0x10000);

      // Helper function to try to skip mapping of empty glyphs.
      // Note: In some cases, just relying on the glyph data doesn't work,
      //       hence we also use a few heuristics to fix various PDF files.
      function hasGlyph(glyphId, charCode, widthCode) {
        if (!missingGlyphs[glyphId]) {
          return true;
        }
        if (!skipToUnicode && charCode >= 0 && toUnicode.has(charCode)) {
          return true;
        }
        if (widths && widthCode >= 0 && isNum(widths[widthCode])) {
          return true;
        }
        return false;
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
        warn('Unable to recover a standard glyph name for: ' + name);
        return name;
      }


      if (properties.type === 'CIDFontType2') {
        var cidToGidMap = properties.cidToGidMap || [];
        var isCidToGidMapEmpty = cidToGidMap.length === 0;

        properties.cMap.forEach(function(charCode, cid) {
          assert(cid <= 0xffff, 'Max size of CID is 65,535');
          var glyphId = -1;
          if (isCidToGidMapEmpty) {
            glyphId = cid;
          } else if (cidToGidMap[cid] !== undefined) {
            glyphId = cidToGidMap[cid];
          }

          if (glyphId >= 0 && glyphId < numGlyphs &&
              hasGlyph(glyphId, charCode, cid)) {
            charCodeToGlyphId[charCode] = glyphId;
          }
        });
        if (dupFirstEntry) {
          charCodeToGlyphId[0] = numGlyphs - 1;
        }
      } else {
        // Most of the following logic in this code branch is based on the
        // 9.6.6.4 of the PDF spec.
        var hasEncoding =
          properties.differences.length > 0 || !!properties.baseEncodingName;
        var cmapTable =
          readCmapTable(tables['cmap'], font, this.isSymbolicFont, hasEncoding);
        var cmapPlatformId = cmapTable.platformId;
        var cmapEncodingId = cmapTable.encodingId;
        var cmapMappings = cmapTable.mappings;
        var cmapMappingsLength = cmapMappings.length;

        // The spec seems to imply that if the font is symbolic the encoding
        // should be ignored, this doesn't appear to work for 'preistabelle.pdf'
        // where the the font is symbolic and it has an encoding.
        if (hasEncoding &&
            (cmapPlatformId === 3 && cmapEncodingId === 1 ||
             cmapPlatformId === 1 && cmapEncodingId === 0) ||
            (cmapPlatformId === -1 && cmapEncodingId === -1 && // Temporary hack
             !!getEncoding(properties.baseEncodingName))) {    // Temporary hack
          // When no preferred cmap table was found and |baseEncodingName| is
          // one of the predefined encodings, we seem to obtain a better
          // |charCodeToGlyphId| map from the code below (fixes bug 1057544).
          // TODO: Note that this is a hack which should be removed as soon as
          //       we have proper support for more exotic cmap tables.

          var baseEncoding = [];
          if (properties.baseEncodingName === 'MacRomanEncoding' ||
              properties.baseEncodingName === 'WinAnsiEncoding') {
            baseEncoding = getEncoding(properties.baseEncodingName);
          }
          var glyphsUnicodeMap = getGlyphsUnicode();
          for (charCode = 0; charCode < 256; charCode++) {
            var glyphName, standardGlyphName;
            if (this.differences && charCode in this.differences) {
              glyphName = this.differences[charCode];
            } else if (charCode in baseEncoding &&
                       baseEncoding[charCode] !== '') {
              glyphName = baseEncoding[charCode];
            } else {
              glyphName = StandardEncoding[charCode];
            }
            if (!glyphName) {
              continue;
            }
            // Ensure that non-standard glyph names are resolved to valid ones.
            standardGlyphName = recoverGlyphName(glyphName, glyphsUnicodeMap);

            var unicodeOrCharCode, isUnicode = false;
            if (cmapPlatformId === 3 && cmapEncodingId === 1) {
              unicodeOrCharCode = glyphsUnicodeMap[standardGlyphName];
              isUnicode = true;
            } else if (cmapPlatformId === 1 && cmapEncodingId === 0) {
              // TODO: the encoding needs to be updated with mac os table.
              unicodeOrCharCode = MacRomanEncoding.indexOf(standardGlyphName);
            }

            var found = false;
            for (i = 0; i < cmapMappingsLength; ++i) {
              if (cmapMappings[i].charCode !== unicodeOrCharCode) {
                continue;
              }
              var code = isUnicode ? charCode : unicodeOrCharCode;
              if (hasGlyph(cmapMappings[i].glyphId, code, -1)) {
                charCodeToGlyphId[charCode] = cmapMappings[i].glyphId;
                found = true;
                break;
              }
            }
            if (!found && properties.glyphNames) {
              // Try to map using the post table.
              var glyphId = properties.glyphNames.indexOf(glyphName);
              // The post table ought to use the same kind of glyph names as the
              // `differences` array, but check the standard ones as a fallback.
              if (glyphId === -1 && standardGlyphName !== glyphName) {
                glyphId = properties.glyphNames.indexOf(standardGlyphName);
              }
              if (glyphId > 0 && hasGlyph(glyphId, -1, -1)) {
                charCodeToGlyphId[charCode] = glyphId;
                found = true;
              }
            }
            if (!found) {
              charCodeToGlyphId[charCode] = 0; // notdef
            }
          }
        } else if (cmapPlatformId === 0 && cmapEncodingId === 0) {
          // Default Unicode semantics, use the charcodes as is.
          for (i = 0; i < cmapMappingsLength; ++i) {
            charCodeToGlyphId[cmapMappings[i].charCode] =
              cmapMappings[i].glyphId;
          }
        } else {
          // For (3, 0) cmap tables:
          // The charcode key being stored in charCodeToGlyphId is the lower
          // byte of the two-byte charcodes of the cmap table since according to
          // the spec: 'each byte from the string shall be prepended with the
          // high byte of the range [of charcodes in the cmap table], to form
          // a two-byte character, which shall be used to select the
          // associated glyph description from the subtable'.
          //
          // For (1, 0) cmap tables:
          // 'single bytes from the string shall be used to look up the
          // associated glyph descriptions from the subtable'. This means
          // charcodes in the cmap will be single bytes, so no-op since
          // glyph.charCode & 0xFF === glyph.charCode
          for (i = 0; i < cmapMappingsLength; ++i) {
            charCode = cmapMappings[i].charCode & 0xFF;
            charCodeToGlyphId[charCode] = cmapMappings[i].glyphId;
          }
        }
      }

      if (charCodeToGlyphId.length === 0) {
        // defines at least one glyph
        charCodeToGlyphId[0] = 0;
      }

      // Converting glyphs and ids into font's cmap table
      var newMapping = adjustMapping(charCodeToGlyphId, properties);
      this.toFontChar = newMapping.toFontChar;
      tables['cmap'] = {
        tag: 'cmap',
        data: createCmapTable(newMapping.charCodeToGlyphId, numGlyphs)
      };

      if (!tables['OS/2'] || !validateOS2Table(tables['OS/2'])) {
        tables['OS/2'] = {
          tag: 'OS/2',
          data: createOS2Table(properties, newMapping.charCodeToGlyphId,
                               metricsOverride)
        };
      }

      // Rewrite the 'post' table if needed
      if (!tables['post']) {
        tables['post'] = {
          tag: 'post',
          data: createPostTable(properties)
        };
      }

      if (!isTrueType) {
        try {
          // Trying to repair CFF file
          cffFile = new Stream(tables['CFF '].data);
          var parser = new CFFParser(cffFile, properties);
          cff = parser.parse();
          var compiler = new CFFCompiler(cff);
          tables['CFF '].data = compiler.compile();
        } catch (e) {
          warn('Failed to compile font ' + properties.loadedName);
        }
      }

      // Re-creating 'name' table
      if (!tables['name']) {
        tables['name'] = {
          tag: 'name',
          data: createNameTable(this.name)
        };
      } else {
        // ... using existing 'name' table as prototype
        var namePrototype = readNameTable(tables['name']);
        tables['name'].data = createNameTable(name, namePrototype);
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

      var mapping = font.getGlyphMapping(properties);
      var newMapping = adjustMapping(mapping, properties);
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
        newMapping.charCodeToGlyphId[newMapping.nextAvailableFontCharCode] =
            glyphId;
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
            y: seac[0] * matrix[1] + seac[1] * matrix[3] + matrix[5]
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
            var baseFontCharCode = createCharCode(charCodeToGlyphId,
                                                  baseGlyphId);
            var accentFontCharCode = createCharCode(charCodeToGlyphId,
                                                    accentGlyphId);
            seacMap[charCode] = {
              baseFontCharCode: baseFontCharCode,
              accentFontCharCode: accentFontCharCode,
              accentOffset: accentOffset
            };
          }
        }
        properties.seacMap = seacMap;
      }

      var unitsPerEm = 1 / (properties.fontMatrix || FONT_IDENTITY_MATRIX)[0];

      var builder = new OpenTypeFileBuilder('\x4F\x54\x54\x4F');
      // PostScript Font Program
      builder.addTable('CFF ', font.data);
      // OS/2 and Windows Specific metrics
      builder.addTable('OS/2', createOS2Table(properties,
                                              newMapping.charCodeToGlyphId));
      // Character to glyphs mapping
      builder.addTable('cmap', createCmapTable(newMapping.charCodeToGlyphId,
                       numGlyphs));
      // Font header
      builder.addTable('head',
            '\x00\x01\x00\x00' + // Version number
            '\x00\x00\x10\x00' + // fontRevision
            '\x00\x00\x00\x00' + // checksumAdjustement
            '\x5F\x0F\x3C\xF5' + // magicNumber
            '\x00\x00' + // Flags
            safeString16(unitsPerEm) + // unitsPerEM
            '\x00\x00\x00\x00\x9e\x0b\x7e\x27' + // creation date
            '\x00\x00\x00\x00\x9e\x0b\x7e\x27' + // modifification date
            '\x00\x00' + // xMin
            safeString16(properties.descent) + // yMin
            '\x0F\xFF' + // xMax
            safeString16(properties.ascent) + // yMax
            string16(properties.italicAngle ? 2 : 0) + // macStyle
            '\x00\x11' + // lowestRecPPEM
            '\x00\x00' + // fontDirectionHint
            '\x00\x00' + // indexToLocFormat
            '\x00\x00');  // glyphDataFormat

      // Horizontal header
      builder.addTable('hhea',
            '\x00\x01\x00\x00' + // Version number
            safeString16(properties.ascent) + // Typographic Ascent
            safeString16(properties.descent) + // Typographic Descent
            '\x00\x00' + // Line Gap
            '\xFF\xFF' + // advanceWidthMax
            '\x00\x00' + // minLeftSidebearing
            '\x00\x00' + // minRightSidebearing
            '\x00\x00' + // xMaxExtent
            safeString16(properties.capHeight) + // caretSlopeRise
            safeString16(Math.tan(properties.italicAngle) *
                         properties.xHeight) + // caretSlopeRun
            '\x00\x00' + // caretOffset
            '\x00\x00' + // -reserved-
            '\x00\x00' + // -reserved-
            '\x00\x00' + // -reserved-
            '\x00\x00' + // -reserved-
            '\x00\x00' + // metricDataFormat
            string16(numGlyphs)); // Number of HMetrics

      // Horizontal metrics
      builder.addTable('hmtx', (function fontFieldsHmtx() {
          var charstrings = font.charstrings;
          var cffWidths = font.cff ? font.cff.widths : null;
          var hmtx = '\x00\x00\x00\x00'; // Fake .notdef
          for (var i = 1, ii = numGlyphs; i < ii; i++) {
            var width = 0;
            if (charstrings) {
              var charstring = charstrings[i - 1];
              width = 'width' in charstring ? charstring.width : 0;
            } else if (cffWidths) {
              width = Math.ceil(cffWidths[i] || 0);
            }
            hmtx += string16(width) + string16(0);
          }
          return hmtx;
        })());

      // Maximum profile
      builder.addTable('maxp',
            '\x00\x00\x50\x00' + // Version number
            string16(numGlyphs)); // Num of glyphs

      // Naming tables
      builder.addTable('name', createNameTable(fontName));

      // PostScript informations
      builder.addTable('post', createPostTable(properties));

      return builder.toArray();
    },

    get spaceWidth() {
      if ('_shadowWidth' in this) {
        return this._shadowWidth;
      }

      // trying to estimate space character width
      var possibleSpaceReplacements = ['space', 'minus', 'one', 'i'];
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

      var unicode = this.toUnicode.get(charcode) || charcode;
      if (typeof unicode === 'number') {
        unicode = String.fromCharCode(unicode);
      }

      var isInFont = charcode in this.toFontChar;
      // First try the toFontChar map, if it's not there then try falling
      // back to the char code.
      fontCharCode = this.toFontChar[charcode] || charcode;
      if (this.missingFile) {
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
          fontChar: String.fromCharCode(seac.accentFontCharCode),
          offset: seac.accentOffset
        };
      }

      var fontChar = String.fromCharCode(fontCharCode);

      var glyph = this.glyphCache[charcode];
      if (!glyph ||
          !glyph.matchesForCache(fontChar, unicode, accent, width, vmetric,
                                 operatorListId, isSpace, isInFont)) {
        glyph = new Glyph(fontChar, unicode, accent, width, vmetric,
                          operatorListId, isSpace, isInFont);
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
      var i = 0, ii;

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
    }
  };

  return Font;
})();

var ErrorFont = (function ErrorFontClosure() {
  function ErrorFont(error) {
    this.error = error;
    this.loadedName = 'g_font_error';
    this.loading = false;
  }

  ErrorFont.prototype = {
    charsToGlyphs: function ErrorFont_charsToGlyphs() {
      return [];
    },
    exportData: function ErrorFont_exportData() {
      return {error: this.error};
    }
  };

  return ErrorFont;
})();

/**
 * Shared logic for building a char code to glyph id mapping for Type1 and
 * simple CFF fonts. See section 9.6.6.2 of the spec.
 * @param {Object} properties Font properties object.
 * @param {Object} builtInEncoding The encoding contained within the actual font
 * data.
 * @param {Array} Array of glyph names where the index is the glyph ID.
 * @returns {Object} A char code to glyph ID map.
 */
function type1FontGlyphMapping(properties, builtInEncoding, glyphNames) {
  var charCodeToGlyphId = Object.create(null);
  var glyphId, charCode, baseEncoding;

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
  } else if (!!(properties.flags & FontFlags.Symbolic)) {
    // For a symbolic font the encoding should be the fonts built-in
    // encoding.
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
  var differences = properties.differences;
  if (differences) {
    for (charCode in differences) {
      var glyphName = differences[charCode];
      glyphId = glyphNames.indexOf(glyphName);
      if (glyphId >= 0) {
        charCodeToGlyphId[charCode] = glyphId;
      } else {
        charCodeToGlyphId[charCode] = 0; // notdef
      }
    }
  }
  return charCodeToGlyphId;
}

/*
 * CharStrings are encoded following the the CharString Encoding sequence
 * describe in Chapter 6 of the "Adobe Type1 Font Format" specification.
 * The value in a byte indicates a command, a number, or subsequent bytes
 * that are to be interpreted in a special way.
 *
 * CharString Number Encoding:
 *  A CharString byte containing the values from 32 through 255 inclusive
 *  indicate an integer. These values are decoded in four ranges.
 *
 * 1. A CharString byte containing a value, v, between 32 and 246 inclusive,
 * indicate the integer v - 139. Thus, the integer values from -107 through
 * 107 inclusive may be encoded in single byte.
 *
 * 2. A CharString byte containing a value, v, between 247 and 250 inclusive,
 * indicates an integer involving the next byte, w, according to the formula:
 * [(v - 247) x 256] + w + 108
 *
 * 3. A CharString byte containing a value, v, between 251 and 254 inclusive,
 * indicates an integer involving the next byte, w, according to the formula:
 * -[(v - 251) * 256] - w - 108
 *
 * 4. A CharString containing the value 255 indicates that the next 4 bytes
 * are a two complement signed integer. The first of these bytes contains the
 * highest order bits, the second byte contains the next higher order bits
 * and the fourth byte contain the lowest order bits.
 *
 *
 * CharString Command Encoding:
 *  CharStrings commands are encoded in 1 or 2 bytes.
 *
 *  Single byte commands are encoded in 1 byte that contains a value between
 *  0 and 31 inclusive.
 *  If a command byte contains the value 12, then the value in the next byte
 *  indicates a command. This "escape" mechanism allows many extra commands
 * to be encoded and this encoding technique helps to minimize the length of
 * the charStrings.
 */
var Type1CharString = (function Type1CharStringClosure() {
  var COMMAND_MAP = {
    'hstem': [1],
    'vstem': [3],
    'vmoveto': [4],
    'rlineto': [5],
    'hlineto': [6],
    'vlineto': [7],
    'rrcurveto': [8],
    'callsubr': [10],
    'flex': [12, 35],
    'drop' : [12, 18],
    'endchar': [14],
    'rmoveto': [21],
    'hmoveto': [22],
    'vhcurveto': [30],
    'hvcurveto': [31]
  };

  function Type1CharString() {
    this.width = 0;
    this.lsb = 0;
    this.flexing = false;
    this.output = [];
    this.stack = [];
  }

  Type1CharString.prototype = {
    convert: function Type1CharString_convert(encoded, subrs) {
      var count = encoded.length;
      var error = false;
      var wx, sbx, subrNumber;
      for (var i = 0; i < count; i++) {
        var value = encoded[i];
        if (value < 32) {
          if (value === 12) {
            value = (value << 8) + encoded[++i];
          }
          switch (value) {
            case 1: // hstem
              if (!HINTING_ENABLED) {
                this.stack = [];
                break;
              }
              error = this.executeCommand(2, COMMAND_MAP.hstem);
              break;
            case 3: // vstem
              if (!HINTING_ENABLED) {
                this.stack = [];
                break;
              }
              error = this.executeCommand(2, COMMAND_MAP.vstem);
              break;
            case 4: // vmoveto
              if (this.flexing) {
                if (this.stack.length < 1) {
                  error = true;
                  break;
                }
                // Add the dx for flex and but also swap the values so they are
                // the right order.
                var dy = this.stack.pop();
                this.stack.push(0, dy);
                break;
              }
              error = this.executeCommand(1, COMMAND_MAP.vmoveto);
              break;
            case 5: // rlineto
              error = this.executeCommand(2, COMMAND_MAP.rlineto);
              break;
            case 6: // hlineto
              error = this.executeCommand(1, COMMAND_MAP.hlineto);
              break;
            case 7: // vlineto
              error = this.executeCommand(1, COMMAND_MAP.vlineto);
              break;
            case 8: // rrcurveto
              error = this.executeCommand(6, COMMAND_MAP.rrcurveto);
              break;
            case 9: // closepath
              // closepath is a Type1 command that does not take argument and is
              // useless in Type2 and it can simply be ignored.
              this.stack = [];
              break;
            case 10: // callsubr
              if (this.stack.length < 1) {
                error = true;
                break;
              }
              subrNumber = this.stack.pop();
              error = this.convert(subrs[subrNumber], subrs);
              break;
            case 11: // return
              return error;
            case 13: // hsbw
              if (this.stack.length < 2) {
                error = true;
                break;
              }
              // To convert to type2 we have to move the width value to the
              // first part of the charstring and then use hmoveto with lsb.
              wx = this.stack.pop();
              sbx = this.stack.pop();
              this.lsb = sbx;
              this.width = wx;
              this.stack.push(wx, sbx);
              error = this.executeCommand(2, COMMAND_MAP.hmoveto);
              break;
            case 14: // endchar
              this.output.push(COMMAND_MAP.endchar[0]);
              break;
            case 21: // rmoveto
              if (this.flexing) {
                break;
              }
              error = this.executeCommand(2, COMMAND_MAP.rmoveto);
              break;
            case 22: // hmoveto
              if (this.flexing) {
                // Add the dy for flex.
                this.stack.push(0);
                break;
              }
              error = this.executeCommand(1, COMMAND_MAP.hmoveto);
              break;
            case 30: // vhcurveto
              error = this.executeCommand(4, COMMAND_MAP.vhcurveto);
              break;
            case 31: // hvcurveto
              error = this.executeCommand(4, COMMAND_MAP.hvcurveto);
              break;
            case (12 << 8) + 0: // dotsection
              // dotsection is a Type1 command to specify some hinting feature
              // for dots that do not take a parameter and it can safely be
              // ignored for Type2.
              this.stack = [];
              break;
            case (12 << 8) + 1: // vstem3
              if (!HINTING_ENABLED) {
                this.stack = [];
                break;
              }
              // [vh]stem3 are Type1 only and Type2 supports [vh]stem with
              // multiple parameters, so instead of returning [vh]stem3 take a
              // shortcut and return [vhstem] instead.
              error = this.executeCommand(2, COMMAND_MAP.vstem);
              break;
            case (12 << 8) + 2: // hstem3
              if (!HINTING_ENABLED) {
                 this.stack = [];
                break;
              }
              // See vstem3.
              error = this.executeCommand(2, COMMAND_MAP.hstem);
              break;
            case (12 << 8) + 6: // seac
              // seac is like type 2's special endchar but it doesn't use the
              // first argument asb, so remove it.
              if (SEAC_ANALYSIS_ENABLED) {
                this.seac = this.stack.splice(-4, 4);
                error = this.executeCommand(0, COMMAND_MAP.endchar);
              } else {
                error = this.executeCommand(4, COMMAND_MAP.endchar);
              }
              break;
            case (12 << 8) + 7: // sbw
              if (this.stack.length < 4) {
                error = true;
                break;
              }
              // To convert to type2 we have to move the width value to the
              // first part of the charstring and then use rmoveto with
              // (dx, dy). The height argument will not be used for vmtx and
              // vhea tables reconstruction -- ignoring it.
              var wy = this.stack.pop();
              wx = this.stack.pop();
              var sby = this.stack.pop();
              sbx = this.stack.pop();
              this.lsb = sbx;
              this.width = wx;
              this.stack.push(wx, sbx, sby);
              error = this.executeCommand(3, COMMAND_MAP.rmoveto);
              break;
            case (12 << 8) + 12: // div
              if (this.stack.length < 2) {
                error = true;
                break;
              }
              var num2 = this.stack.pop();
              var num1 = this.stack.pop();
              this.stack.push(num1 / num2);
              break;
            case (12 << 8) + 16: // callothersubr
              if (this.stack.length < 2) {
                error = true;
                break;
              }
              subrNumber = this.stack.pop();
              var numArgs = this.stack.pop();
              if (subrNumber === 0 && numArgs === 3) {
                var flexArgs = this.stack.splice(this.stack.length - 17, 17);
                this.stack.push(
                  flexArgs[2] + flexArgs[0], // bcp1x + rpx
                  flexArgs[3] + flexArgs[1], // bcp1y + rpy
                  flexArgs[4], // bcp2x
                  flexArgs[5], // bcp2y
                  flexArgs[6], // p2x
                  flexArgs[7], // p2y
                  flexArgs[8], // bcp3x
                  flexArgs[9], // bcp3y
                  flexArgs[10], // bcp4x
                  flexArgs[11], // bcp4y
                  flexArgs[12], // p3x
                  flexArgs[13], // p3y
                  flexArgs[14] // flexDepth
                  // 15 = finalx unused by flex
                  // 16 = finaly unused by flex
                );
                error = this.executeCommand(13, COMMAND_MAP.flex, true);
                this.flexing = false;
                this.stack.push(flexArgs[15], flexArgs[16]);
              } else if (subrNumber === 1 && numArgs === 0) {
                this.flexing = true;
              }
              break;
            case (12 << 8) + 17: // pop
              // Ignore this since it is only used with othersubr.
              break;
            case (12 << 8) + 33: // setcurrentpoint
              // Ignore for now.
              this.stack = [];
              break;
            default:
              warn('Unknown type 1 charstring command of "' + value + '"');
              break;
          }
          if (error) {
            break;
          }
          continue;
        } else if (value <= 246) {
          value = value - 139;
        } else if (value <= 250) {
          value = ((value - 247) * 256) + encoded[++i] + 108;
        } else if (value <= 254) {
          value = -((value - 251) * 256) - encoded[++i] - 108;
        } else {
          value = (encoded[++i] & 0xff) << 24 | (encoded[++i] & 0xff) << 16 |
                  (encoded[++i] & 0xff) << 8 | (encoded[++i] & 0xff) << 0;
        }
        this.stack.push(value);
      }
      return error;
    },

    executeCommand: function(howManyArgs, command, keepStack) {
      var stackLength = this.stack.length;
      if (howManyArgs > stackLength) {
        return true;
      }
      var start = stackLength - howManyArgs;
      for (var i = start; i < stackLength; i++) {
        var value = this.stack[i];
        if (value === (value | 0)) { // int
          this.output.push(28, (value >> 8) & 0xff, value & 0xff);
        } else { // fixed point
          value = (65536 * value) | 0;
          this.output.push(255,
                           (value >> 24) & 0xFF,
                           (value >> 16) & 0xFF,
                           (value >> 8) & 0xFF,
                           value & 0xFF);
        }
      }
      this.output.push.apply(this.output, command);
      if (keepStack) {
        this.stack.splice(start, howManyArgs);
      } else {
        this.stack.length = 0;
      }
      return false;
    }
  };

  return Type1CharString;
})();

/*
 * Type1Parser encapsulate the needed code for parsing a Type1 font
 * program. Some of its logic depends on the Type2 charstrings
 * structure.
 * Note: this doesn't really parse the font since that would require evaluation
 * of PostScript, but it is possible in most cases to extract what we need
 * without a full parse.
 */
var Type1Parser = (function Type1ParserClosure() {
  /*
   * Decrypt a Sequence of Ciphertext Bytes to Produce the Original Sequence
   * of Plaintext Bytes. The function took a key as a parameter which can be
   * for decrypting the eexec block of for decoding charStrings.
   */
  var EEXEC_ENCRYPT_KEY = 55665;
  var CHAR_STRS_ENCRYPT_KEY = 4330;

  function isHexDigit(code) {
    return code >= 48 && code <= 57 || // '0'-'9'
           code >= 65 && code <= 70 || // 'A'-'F'
           code >= 97 && code <= 102;  // 'a'-'f'
  }

  function decrypt(data, key, discardNumber) {
    if (discardNumber >= data.length) {
      return new Uint8Array(0);
    }
    var r = key | 0, c1 = 52845, c2 = 22719, i, j;
    for (i = 0; i < discardNumber; i++) {
      r = ((data[i] + r) * c1 + c2) & ((1 << 16) - 1);
    }
    var count = data.length - discardNumber;
    var decrypted = new Uint8Array(count);
    for (i = discardNumber, j = 0; j < count; i++, j++) {
      var value = data[i];
      decrypted[j] = value ^ (r >> 8);
      r = ((value + r) * c1 + c2) & ((1 << 16) - 1);
    }
    return decrypted;
  }

  function decryptAscii(data, key, discardNumber) {
    var r = key | 0, c1 = 52845, c2 = 22719;
    var count = data.length, maybeLength = count >>> 1;
    var decrypted = new Uint8Array(maybeLength);
    var i, j;
    for (i = 0, j = 0; i < count; i++) {
      var digit1 = data[i];
      if (!isHexDigit(digit1)) {
        continue;
      }
      i++;
      var digit2;
      while (i < count && !isHexDigit(digit2 = data[i])) {
        i++;
      }
      if (i < count) {
        var value = parseInt(String.fromCharCode(digit1, digit2), 16);
        decrypted[j++] = value ^ (r >> 8);
        r = ((value + r) * c1 + c2) & ((1 << 16) - 1);
      }
    }
    return Array.prototype.slice.call(decrypted, discardNumber, j);
  }

  function isSpecial(c) {
    return c === 0x2F || // '/'
           c === 0x5B || c === 0x5D || // '[', ']'
           c === 0x7B || c === 0x7D || // '{', '}'
           c === 0x28 || c === 0x29; // '(', ')'
  }

  function Type1Parser(stream, encrypted) {
    if (encrypted) {
      var data = stream.getBytes();
      var isBinary = !(isHexDigit(data[0]) && isHexDigit(data[1]) &&
                       isHexDigit(data[2]) && isHexDigit(data[3]));
      stream = new Stream(isBinary ? decrypt(data, EEXEC_ENCRYPT_KEY, 4) :
                          decryptAscii(data, EEXEC_ENCRYPT_KEY, 4));
    }
    this.stream = stream;
    this.nextChar();
  }

  Type1Parser.prototype = {
    readNumberArray: function Type1Parser_readNumberArray() {
      this.getToken(); // read '[' or '{' (arrays can start with either)
      var array = [];
      while (true) {
        var token = this.getToken();
        if (token === null || token === ']' || token === '}') {
          break;
        }
        array.push(parseFloat(token || 0));
      }
      return array;
    },

    readNumber: function Type1Parser_readNumber() {
      var token = this.getToken();
      return parseFloat(token || 0);
    },

    readInt: function Type1Parser_readInt() {
      // Use '| 0' to prevent setting a double into length such as the double
      // does not flow into the loop variable.
      var token = this.getToken();
      return parseInt(token || 0, 10) | 0;
    },

    readBoolean: function Type1Parser_readBoolean() {
      var token = this.getToken();

      // Use 1 and 0 since that's what type2 charstrings use.
      return token === 'true' ? 1 : 0;
    },

    nextChar : function Type1_nextChar() {
      return (this.currentChar = this.stream.getByte());
    },

    getToken: function Type1Parser_getToken() {
      // Eat whitespace and comments.
      var comment = false;
      var ch = this.currentChar;
      while (true) {
        if (ch === -1) {
          return null;
        }

        if (comment) {
          if (ch === 0x0A || ch === 0x0D) {
            comment = false;
          }
        } else if (ch === 0x25) { // '%'
          comment = true;
        } else if (!Lexer.isSpace(ch)) {
          break;
        }
        ch = this.nextChar();
      }
      if (isSpecial(ch)) {
        this.nextChar();
        return String.fromCharCode(ch);
      }
      var token = '';
      do {
        token += String.fromCharCode(ch);
        ch = this.nextChar();
      } while (ch >= 0 && !Lexer.isSpace(ch) && !isSpecial(ch));
      return token;
    },

    /*
     * Returns an object containing a Subrs array and a CharStrings
     * array extracted from and eexec encrypted block of data
     */
    extractFontProgram: function Type1Parser_extractFontProgram() {
      var stream = this.stream;

      var subrs = [], charstrings = [];
      var privateData = Object.create(null);
      privateData['lenIV'] = 4;
      var program = {
        subrs: [],
        charstrings: [],
        properties: {
          'privateData': privateData
        }
      };
      var token, length, data, lenIV, encoded;
      while ((token = this.getToken()) !== null) {
        if (token !== '/') {
          continue;
        }
        token = this.getToken();
        switch (token) {
          case 'CharStrings':
            // The number immediately following CharStrings must be greater or
            // equal to the number of CharStrings.
            this.getToken();
            this.getToken(); // read in 'dict'
            this.getToken(); // read in 'dup'
            this.getToken(); // read in 'begin'
            while(true) {
              token = this.getToken();
              if (token === null || token === 'end') {
                break;
              }

              if (token !== '/') {
                continue;
              }
              var glyph = this.getToken();
              length = this.readInt();
              this.getToken(); // read in 'RD' or '-|'
              data = stream.makeSubStream(stream.pos, length);
              lenIV = program.properties.privateData['lenIV'];
              encoded = decrypt(data.getBytes(), CHAR_STRS_ENCRYPT_KEY, lenIV);
              // Skip past the required space and binary data.
              stream.skip(length);
              this.nextChar();
              token = this.getToken(); // read in 'ND' or '|-'
              if (token === 'noaccess') {
                this.getToken(); // read in 'def'
              }
              charstrings.push({
                glyph: glyph,
                encoded: encoded
              });
            }
            break;
          case 'Subrs':
            var num = this.readInt();
            this.getToken(); // read in 'array'
            while ((token = this.getToken()) === 'dup') {
              var index = this.readInt();
              length = this.readInt();
              this.getToken(); // read in 'RD' or '-|'
              data = stream.makeSubStream(stream.pos, length);
              lenIV = program.properties.privateData['lenIV'];
              encoded = decrypt(data.getBytes(), CHAR_STRS_ENCRYPT_KEY, lenIV);
              // Skip past the required space and binary data.
              stream.skip(length);
              this.nextChar();
              token = this.getToken(); // read in 'NP' or '|'
              if (token === 'noaccess') {
                this.getToken(); // read in 'put'
              }
              subrs[index] = encoded;
            }
            break;
          case 'BlueValues':
          case 'OtherBlues':
          case 'FamilyBlues':
          case 'FamilyOtherBlues':
            var blueArray = this.readNumberArray();
            // *Blue* values may contain invalid data: disables reading of
            // those values when hinting is disabled.
            if (blueArray.length > 0 && (blueArray.length % 2) === 0 &&
                HINTING_ENABLED) {
              program.properties.privateData[token] = blueArray;
            }
            break;
          case 'StemSnapH':
          case 'StemSnapV':
            program.properties.privateData[token] = this.readNumberArray();
            break;
          case 'StdHW':
          case 'StdVW':
            program.properties.privateData[token] =
              this.readNumberArray()[0];
            break;
          case 'BlueShift':
          case 'lenIV':
          case 'BlueFuzz':
          case 'BlueScale':
          case 'LanguageGroup':
          case 'ExpansionFactor':
            program.properties.privateData[token] = this.readNumber();
            break;
          case 'ForceBold':
            program.properties.privateData[token] = this.readBoolean();
            break;
        }
      }

      for (var i = 0; i < charstrings.length; i++) {
        glyph = charstrings[i].glyph;
        encoded = charstrings[i].encoded;
        var charString = new Type1CharString();
        var error = charString.convert(encoded, subrs);
        var output = charString.output;
        if (error) {
          // It seems when FreeType encounters an error while evaluating a glyph
          // that it completely ignores the glyph so we'll mimic that behaviour
          // here and put an endchar to make the validator happy.
          output = [14];
        }
        program.charstrings.push({
          glyphName: glyph,
          charstring: output,
          width: charString.width,
          lsb: charString.lsb,
          seac: charString.seac
        });
      }

      return program;
    },

    extractFontHeader: function Type1Parser_extractFontHeader(properties) {
      var token;
      while ((token = this.getToken()) !== null) {
        if (token !== '/') {
          continue;
        }
        token = this.getToken();
        switch (token) {
          case 'FontMatrix':
            var matrix = this.readNumberArray();
            properties.fontMatrix = matrix;
            break;
          case 'Encoding':
            var encodingArg = this.getToken();
            var encoding;
            if (!/^\d+$/.test(encodingArg)) {
              // encoding name is specified
              encoding = getEncoding(encodingArg);
            } else {
              encoding = [];
              var size = parseInt(encodingArg, 10) | 0;
              this.getToken(); // read in 'array'

              for (var j = 0; j < size; j++) {
                token = this.getToken();
                // skipping till first dup or def (e.g. ignoring for statement)
                while (token !== 'dup' && token !== 'def') {
                  token = this.getToken();
                  if (token === null) {
                    return; // invalid header
                  }
                }
                if (token === 'def') {
                  break; // read all array data
                }
                var index = this.readInt();
                this.getToken(); // read in '/'
                var glyph = this.getToken();
                encoding[index] = glyph;
                this.getToken(); // read the in 'put'
              }
            }
            properties.builtInEncoding = encoding;
            break;
          case 'FontBBox':
            var fontBBox = this.readNumberArray();
            // adjusting ascent/descent
            properties.ascent = fontBBox[3];
            properties.descent = fontBBox[1];
            properties.ascentScaled = true;
            break;
        }
      }
    }
  };

  return Type1Parser;
})();

/**
 * The CFF class takes a Type1 file and wrap it into a
 * 'Compact Font Format' which itself embed Type2 charstrings.
 */
var CFFStandardStrings = [
  '.notdef', 'space', 'exclam', 'quotedbl', 'numbersign', 'dollar', 'percent',
  'ampersand', 'quoteright', 'parenleft', 'parenright', 'asterisk', 'plus',
  'comma', 'hyphen', 'period', 'slash', 'zero', 'one', 'two', 'three', 'four',
  'five', 'six', 'seven', 'eight', 'nine', 'colon', 'semicolon', 'less',
  'equal', 'greater', 'question', 'at', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
  'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W',
  'X', 'Y', 'Z', 'bracketleft', 'backslash', 'bracketright', 'asciicircum',
  'underscore', 'quoteleft', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j',
  'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y',
  'z', 'braceleft', 'bar', 'braceright', 'asciitilde', 'exclamdown', 'cent',
  'sterling', 'fraction', 'yen', 'florin', 'section', 'currency',
  'quotesingle', 'quotedblleft', 'guillemotleft', 'guilsinglleft',
  'guilsinglright', 'fi', 'fl', 'endash', 'dagger', 'daggerdbl',
  'periodcentered', 'paragraph', 'bullet', 'quotesinglbase', 'quotedblbase',
  'quotedblright', 'guillemotright', 'ellipsis', 'perthousand', 'questiondown',
  'grave', 'acute', 'circumflex', 'tilde', 'macron', 'breve', 'dotaccent',
  'dieresis', 'ring', 'cedilla', 'hungarumlaut', 'ogonek', 'caron', 'emdash',
  'AE', 'ordfeminine', 'Lslash', 'Oslash', 'OE', 'ordmasculine', 'ae',
  'dotlessi', 'lslash', 'oslash', 'oe', 'germandbls', 'onesuperior',
  'logicalnot', 'mu', 'trademark', 'Eth', 'onehalf', 'plusminus', 'Thorn',
  'onequarter', 'divide', 'brokenbar', 'degree', 'thorn', 'threequarters',
  'twosuperior', 'registered', 'minus', 'eth', 'multiply', 'threesuperior',
  'copyright', 'Aacute', 'Acircumflex', 'Adieresis', 'Agrave', 'Aring',
  'Atilde', 'Ccedilla', 'Eacute', 'Ecircumflex', 'Edieresis', 'Egrave',
  'Iacute', 'Icircumflex', 'Idieresis', 'Igrave', 'Ntilde', 'Oacute',
  'Ocircumflex', 'Odieresis', 'Ograve', 'Otilde', 'Scaron', 'Uacute',
  'Ucircumflex', 'Udieresis', 'Ugrave', 'Yacute', 'Ydieresis', 'Zcaron',
  'aacute', 'acircumflex', 'adieresis', 'agrave', 'aring', 'atilde',
  'ccedilla', 'eacute', 'ecircumflex', 'edieresis', 'egrave', 'iacute',
  'icircumflex', 'idieresis', 'igrave', 'ntilde', 'oacute', 'ocircumflex',
  'odieresis', 'ograve', 'otilde', 'scaron', 'uacute', 'ucircumflex',
  'udieresis', 'ugrave', 'yacute', 'ydieresis', 'zcaron', 'exclamsmall',
  'Hungarumlautsmall', 'dollaroldstyle', 'dollarsuperior', 'ampersandsmall',
  'Acutesmall', 'parenleftsuperior', 'parenrightsuperior', 'twodotenleader',
  'onedotenleader', 'zerooldstyle', 'oneoldstyle', 'twooldstyle',
  'threeoldstyle', 'fouroldstyle', 'fiveoldstyle', 'sixoldstyle',
  'sevenoldstyle', 'eightoldstyle', 'nineoldstyle', 'commasuperior',
  'threequartersemdash', 'periodsuperior', 'questionsmall', 'asuperior',
  'bsuperior', 'centsuperior', 'dsuperior', 'esuperior', 'isuperior',
  'lsuperior', 'msuperior', 'nsuperior', 'osuperior', 'rsuperior', 'ssuperior',
  'tsuperior', 'ff', 'ffi', 'ffl', 'parenleftinferior', 'parenrightinferior',
  'Circumflexsmall', 'hyphensuperior', 'Gravesmall', 'Asmall', 'Bsmall',
  'Csmall', 'Dsmall', 'Esmall', 'Fsmall', 'Gsmall', 'Hsmall', 'Ismall',
  'Jsmall', 'Ksmall', 'Lsmall', 'Msmall', 'Nsmall', 'Osmall', 'Psmall',
  'Qsmall', 'Rsmall', 'Ssmall', 'Tsmall', 'Usmall', 'Vsmall', 'Wsmall',
  'Xsmall', 'Ysmall', 'Zsmall', 'colonmonetary', 'onefitted', 'rupiah',
  'Tildesmall', 'exclamdownsmall', 'centoldstyle', 'Lslashsmall',
  'Scaronsmall', 'Zcaronsmall', 'Dieresissmall', 'Brevesmall', 'Caronsmall',
  'Dotaccentsmall', 'Macronsmall', 'figuredash', 'hypheninferior',
  'Ogoneksmall', 'Ringsmall', 'Cedillasmall', 'questiondownsmall', 'oneeighth',
  'threeeighths', 'fiveeighths', 'seveneighths', 'onethird', 'twothirds',
  'zerosuperior', 'foursuperior', 'fivesuperior', 'sixsuperior',
  'sevensuperior', 'eightsuperior', 'ninesuperior', 'zeroinferior',
  'oneinferior', 'twoinferior', 'threeinferior', 'fourinferior',
  'fiveinferior', 'sixinferior', 'seveninferior', 'eightinferior',
  'nineinferior', 'centinferior', 'dollarinferior', 'periodinferior',
  'commainferior', 'Agravesmall', 'Aacutesmall', 'Acircumflexsmall',
  'Atildesmall', 'Adieresissmall', 'Aringsmall', 'AEsmall', 'Ccedillasmall',
  'Egravesmall', 'Eacutesmall', 'Ecircumflexsmall', 'Edieresissmall',
  'Igravesmall', 'Iacutesmall', 'Icircumflexsmall', 'Idieresissmall',
  'Ethsmall', 'Ntildesmall', 'Ogravesmall', 'Oacutesmall', 'Ocircumflexsmall',
  'Otildesmall', 'Odieresissmall', 'OEsmall', 'Oslashsmall', 'Ugravesmall',
  'Uacutesmall', 'Ucircumflexsmall', 'Udieresissmall', 'Yacutesmall',
  'Thornsmall', 'Ydieresissmall', '001.000', '001.001', '001.002', '001.003',
  'Black', 'Bold', 'Book', 'Light', 'Medium', 'Regular', 'Roman', 'Semibold'
];

// Type1Font is also a CIDFontType0.
var Type1Font = function Type1Font(name, file, properties) {
  // Some bad generators embed pfb file as is, we have to strip 6-byte headers.
  // Also, length1 and length2 might be off by 6 bytes as well.
  // http://www.math.ubc.ca/~cass/piscript/type1.pdf
  var PFB_HEADER_SIZE = 6;
  var headerBlockLength = properties.length1;
  var eexecBlockLength = properties.length2;
  var pfbHeader = file.peekBytes(PFB_HEADER_SIZE);
  var pfbHeaderPresent = pfbHeader[0] === 0x80 && pfbHeader[1] === 0x01;
  if (pfbHeaderPresent) {
    file.skip(PFB_HEADER_SIZE);
    headerBlockLength = (pfbHeader[5] << 24) | (pfbHeader[4] << 16) |
                        (pfbHeader[3] << 8) | pfbHeader[2];
  }

  // Get the data block containing glyphs and subrs informations
  var headerBlock = new Stream(file.getBytes(headerBlockLength));
  var headerBlockParser = new Type1Parser(headerBlock);
  headerBlockParser.extractFontHeader(properties);

  if (pfbHeaderPresent) {
    pfbHeader = file.getBytes(PFB_HEADER_SIZE);
    eexecBlockLength = (pfbHeader[5] << 24) | (pfbHeader[4] << 16) |
                       (pfbHeader[3] << 8) | pfbHeader[2];
  }

  // Decrypt the data blocks and retrieve it's content
  var eexecBlock = new Stream(file.getBytes(eexecBlockLength));
  var eexecBlockParser = new Type1Parser(eexecBlock, true);
  var data = eexecBlockParser.extractFontProgram();
  for (var info in data.properties) {
    properties[info] = data.properties[info];
  }

  var charstrings = data.charstrings;
  var type2Charstrings = this.getType2Charstrings(charstrings);
  var subrs = this.getType2Subrs(data.subrs);

  this.charstrings = charstrings;
  this.data = this.wrap(name, type2Charstrings, this.charstrings,
                        subrs, properties);
  this.seacs = this.getSeacs(data.charstrings);
};

Type1Font.prototype = {
  get numGlyphs() {
    return this.charstrings.length + 1;
  },

  getCharset: function Type1Font_getCharset() {
    var charset = ['.notdef'];
    var charstrings = this.charstrings;
    for (var glyphId = 0; glyphId < charstrings.length; glyphId++) {
      charset.push(charstrings[glyphId].glyphName);
    }
    return charset;
  },

  getGlyphMapping: function Type1Font_getGlyphMapping(properties) {
    var charstrings = this.charstrings;
    var glyphNames = ['.notdef'], glyphId;
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
                                  type1Charstrings) {
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
      type2Subrs.push([0x0B]);
    }

    for (i = 0; i < count; i++) {
      type2Subrs.push(type1Subrs[i]);
    }

    return type2Subrs;
  },

  wrap: function Type1Font_wrap(name, glyphs, charstrings, subrs, properties) {
    var cff = new CFF();
    cff.header = new CFFHeader(1, 0, 4, 4);

    cff.names = [name];

    var topDict = new CFFTopDict();
    // CFF strings IDs 0...390 are predefined names, so refering
    // to entries in our own String INDEX starts at SID 391.
    topDict.setByName('version', 391);
    topDict.setByName('Notice', 392);
    topDict.setByName('FullName', 393);
    topDict.setByName('FamilyName', 394);
    topDict.setByName('Weight', 395);
    topDict.setByName('Encoding', null); // placeholder
    topDict.setByName('FontMatrix', properties.fontMatrix);
    topDict.setByName('FontBBox', properties.bbox);
    topDict.setByName('charset', null); // placeholder
    topDict.setByName('CharStrings', null); // placeholder
    topDict.setByName('Private', null); // placeholder
    cff.topDict = topDict;

    var strings = new CFFStrings();
    strings.add('Version 0.11'); // Version
    strings.add('See original notice'); // Notice
    strings.add(name); // FullName
    strings.add(name); // FamilyName
    strings.add('Medium'); // Weight
    cff.strings = strings;

    cff.globalSubrIndex = new CFFIndex();

    var count = glyphs.length;
    var charsetArray = [0];
    var i, ii;
    for (i = 0; i < count; i++) {
      var index = CFFStandardStrings.indexOf(charstrings[i].glyphName);
      // TODO: Insert the string and correctly map it.  Previously it was
      // thought mapping names that aren't in the standard strings to .notdef
      // was fine, however in issue818 when mapping them all to .notdef the
      // adieresis glyph no longer worked.
      if (index === -1) {
        index = 0;
      }
      charsetArray.push((index >> 8) & 0xff, index & 0xff);
    }
    cff.charset = new CFFCharset(false, 0, [], charsetArray);

    var charStringsIndex = new CFFIndex();
    charStringsIndex.add([0x8B, 0x0E]); // .notdef
    for (i = 0; i < count; i++) {
      charStringsIndex.add(glyphs[i]);
    }
    cff.charStrings = charStringsIndex;

    var privateDict = new CFFPrivateDict();
    privateDict.setByName('Subrs', null); // placeholder
    var fields = [
      'BlueValues',
      'OtherBlues',
      'FamilyBlues',
      'FamilyOtherBlues',
      'StemSnapH',
      'StemSnapV',
      'BlueShift',
      'BlueFuzz',
      'BlueScale',
      'LanguageGroup',
      'ExpansionFactor',
      'ForceBold',
      'StdHW',
      'StdVW'
    ];
    for (i = 0, ii = fields.length; i < ii; i++) {
      var field = fields[i];
      if (!(field in properties.privateData)) {
        continue;
      }
      var value = properties.privateData[field];
      if (isArray(value)) {
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
  }
};

var CFFFont = (function CFFFontClosure() {
  function CFFFont(file, properties) {
    this.properties = properties;

    var parser = new CFFParser(file, properties);
    this.cff = parser.parse();
    var compiler = new CFFCompiler(this.cff);
    this.seacs = this.cff.seacs;
    try {
      this.data = compiler.compile();
    } catch (e) {
      warn('Failed to compile font ' + properties.loadedName);
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
        if (cff.isCIDFont) {
          // If the font is actually a CID font then we should use the charset
          // to map CIDs to GIDs.
          for (glyphId = 0; glyphId < charsets.length; glyphId++) {
            var cid = charsets[glyphId];
            var charCode = properties.cMap.charCodeOf(cid);
            charCodeToGlyphId[charCode] = glyphId;
          }
        } else {
          // If it is NOT actually a CID font then CIDs should be mapped
          // directly to GIDs.
          for (glyphId = 0; glyphId < cff.charStrings.count; glyphId++) {
            charCodeToGlyphId[glyphId] = glyphId;
          }
        }
        return charCodeToGlyphId;
      }

      var encoding = cff.encoding ? cff.encoding.encoding : null;
      charCodeToGlyphId = type1FontGlyphMapping(properties, encoding, charsets);
      return charCodeToGlyphId;
    }
  };

  return CFFFont;
})();

var CFFParser = (function CFFParserClosure() {
  var CharstringValidationData = [
    null,
    { id: 'hstem', min: 2, stackClearing: true, stem: true },
    null,
    { id: 'vstem', min: 2, stackClearing: true, stem: true },
    { id: 'vmoveto', min: 1, stackClearing: true },
    { id: 'rlineto', min: 2, resetStack: true },
    { id: 'hlineto', min: 1, resetStack: true },
    { id: 'vlineto', min: 1, resetStack: true },
    { id: 'rrcurveto', min: 6, resetStack: true },
    null,
    { id: 'callsubr', min: 1, undefStack: true },
    { id: 'return', min: 0, undefStack: true },
    null, // 12
    null,
    { id: 'endchar', min: 0, stackClearing: true },
    null,
    null,
    null,
    { id: 'hstemhm', min: 2, stackClearing: true, stem: true },
    { id: 'hintmask', min: 0, stackClearing: true },
    { id: 'cntrmask', min: 0, stackClearing: true },
    { id: 'rmoveto', min: 2, stackClearing: true },
    { id: 'hmoveto', min: 1, stackClearing: true },
    { id: 'vstemhm', min: 2, stackClearing: true, stem: true },
    { id: 'rcurveline', min: 8, resetStack: true },
    { id: 'rlinecurve', min: 8, resetStack: true },
    { id: 'vvcurveto', min: 4, resetStack: true },
    { id: 'hhcurveto', min: 4, resetStack: true },
    null, // shortint
    { id: 'callgsubr', min: 1, undefStack: true },
    { id: 'vhcurveto', min: 4, resetStack: true },
    { id: 'hvcurveto', min: 4, resetStack: true }
  ];
  var CharstringValidationData12 = [
    null,
    null,
    null,
    { id: 'and', min: 2, stackDelta: -1 },
    { id: 'or', min: 2, stackDelta: -1 },
    { id: 'not', min: 1, stackDelta: 0 },
    null,
    null,
    null,
    { id: 'abs', min: 1, stackDelta: 0 },
    { id: 'add', min: 2, stackDelta: -1,
      stackFn: function stack_div(stack, index) {
        stack[index - 2] = stack[index - 2] + stack[index - 1];
      }
    },
    { id: 'sub', min: 2, stackDelta: -1,
      stackFn: function stack_div(stack, index) {
        stack[index - 2] = stack[index - 2] - stack[index - 1];
      }
    },
    { id: 'div', min: 2, stackDelta: -1,
      stackFn: function stack_div(stack, index) {
        stack[index - 2] = stack[index - 2] / stack[index - 1];
      }
    },
    null,
    { id: 'neg', min: 1, stackDelta: 0,
      stackFn: function stack_div(stack, index) {
        stack[index - 1] = -stack[index - 1];
      }
    },
    { id: 'eq', min: 2, stackDelta: -1 },
    null,
    null,
    { id: 'drop', min: 1, stackDelta: -1 },
    null,
    { id: 'put', min: 2, stackDelta: -2 },
    { id: 'get', min: 1, stackDelta: 0 },
    { id: 'ifelse', min: 4, stackDelta: -3 },
    { id: 'random', min: 0, stackDelta: 1 },
    { id: 'mul', min: 2, stackDelta: -1,
      stackFn: function stack_div(stack, index) {
        stack[index - 2] = stack[index - 2] * stack[index - 1];
      }
    },
    null,
    { id: 'sqrt', min: 1, stackDelta: 0 },
    { id: 'dup', min: 1, stackDelta: 1 },
    { id: 'exch', min: 2, stackDelta: 0 },
    { id: 'index', min: 2, stackDelta: 0 },
    { id: 'roll', min: 3, stackDelta: -2 },
    null,
    null,
    null,
    { id: 'hflex', min: 7, resetStack: true },
    { id: 'flex', min: 13, resetStack: true },
    { id: 'hflex1', min: 9, resetStack: true },
    { id: 'flex1', min: 11, resetStack: true }
  ];

  function CFFParser(file, properties) {
    this.bytes = file.getBytes();
    this.properties = properties;
  }
  CFFParser.prototype = {
    parse: function CFFParser_parse() {
      var properties = this.properties;
      var cff = new CFF();
      this.cff = cff;

      // The first five sections must be in order, all the others are reached
      // via offsets contained in one of the below.
      var header = this.parseHeader();
      var nameIndex = this.parseIndex(header.endPos);
      var topDictIndex = this.parseIndex(nameIndex.endPos);
      var stringIndex = this.parseIndex(topDictIndex.endPos);
      var globalSubrIndex = this.parseIndex(stringIndex.endPos);

      var topDictParsed = this.parseDict(topDictIndex.obj.get(0));
      var topDict = this.createDict(CFFTopDict, topDictParsed, cff.strings);

      cff.header = header.obj;
      cff.names = this.parseNameIndex(nameIndex.obj);
      cff.strings = this.parseStringIndex(stringIndex.obj);
      cff.topDict = topDict;
      cff.globalSubrIndex = globalSubrIndex.obj;

      this.parsePrivateDict(cff.topDict);

      cff.isCIDFont = topDict.hasName('ROS');

      var charStringOffset = topDict.getByName('CharStrings');
      var charStringIndex = this.parseIndex(charStringOffset).obj;

      var fontMatrix = topDict.getByName('FontMatrix');
      if (fontMatrix) {
        properties.fontMatrix = fontMatrix;
      }

      var fontBBox = topDict.getByName('FontBBox');
      if (fontBBox) {
        // adjusting ascent/descent
        properties.ascent = fontBBox[3];
        properties.descent = fontBBox[1];
        properties.ascentScaled = true;
      }

      var charset, encoding;
      if (cff.isCIDFont) {
        var fdArrayIndex = this.parseIndex(topDict.getByName('FDArray')).obj;
        for (var i = 0, ii = fdArrayIndex.count; i < ii; ++i) {
          var dictRaw = fdArrayIndex.get(i);
          var fontDict = this.createDict(CFFTopDict, this.parseDict(dictRaw),
                                         cff.strings);
          this.parsePrivateDict(fontDict);
          cff.fdArray.push(fontDict);
        }
        // cid fonts don't have an encoding
        encoding = null;
        charset = this.parseCharsets(topDict.getByName('charset'),
                                     charStringIndex.count, cff.strings, true);
        cff.fdSelect = this.parseFDSelect(topDict.getByName('FDSelect'),
                                          charStringIndex.count);
      } else {
        charset = this.parseCharsets(topDict.getByName('charset'),
                                     charStringIndex.count, cff.strings, false);
        encoding = this.parseEncoding(topDict.getByName('Encoding'),
                                      properties,
                                      cff.strings, charset.charset);
      }

      cff.charset = charset;
      cff.encoding = encoding;

      var charStringsAndSeacs = this.parseCharStrings(
                                  charStringIndex,
                                  topDict.privateDict.subrsIndex,
                                  globalSubrIndex.obj,
                                  cff.fdSelect,
                                  cff.fdArray);
      cff.charStrings = charStringsAndSeacs.charStrings;
      cff.seacs = charStringsAndSeacs.seacs;
      cff.widths = charStringsAndSeacs.widths;

      return cff;
    },
    parseHeader: function CFFParser_parseHeader() {
      var bytes = this.bytes;
      var bytesLength = bytes.length;
      var offset = 0;

      // Prevent an infinite loop, by checking that the offset is within the
      // bounds of the bytes array. Necessary in empty, or invalid, font files.
      while (offset < bytesLength && bytes[offset] !== 1) {
        ++offset;
      }
      if (offset >= bytesLength) {
        error('Invalid CFF header');
      } else if (offset !== 0) {
        info('cff data is shifted');
        bytes = bytes.subarray(offset);
        this.bytes = bytes;
      }
      var major = bytes[0];
      var minor = bytes[1];
      var hdrSize = bytes[2];
      var offSize = bytes[3];
      var header = new CFFHeader(major, minor, hdrSize, offSize);
      return { obj: header, endPos: hdrSize };
    },
    parseDict: function CFFParser_parseDict(dict) {
      var pos = 0;

      function parseOperand() {
        var value = dict[pos++];
        if (value === 30) {
          return parseFloatOperand(pos);
        } else if (value === 28) {
          value = dict[pos++];
          value = ((value << 24) | (dict[pos++] << 16)) >> 16;
          return value;
        } else if (value === 29) {
          value = dict[pos++];
          value = (value << 8) | dict[pos++];
          value = (value << 8) | dict[pos++];
          value = (value << 8) | dict[pos++];
          return value;
        } else if (value >= 32 && value <= 246) {
          return value - 139;
        } else if (value >= 247 && value <= 250) {
          return ((value - 247) * 256) + dict[pos++] + 108;
        } else if (value >= 251 && value <= 254) {
          return -((value - 251) * 256) - dict[pos++] - 108;
        } else {
          error('255 is not a valid DICT command');
        }
        return -1;
      }

      function parseFloatOperand() {
        var str = '';
        var eof = 15;
        var lookup = ['0', '1', '2', '3', '4', '5', '6', '7', '8',
            '9', '.', 'E', 'E-', null, '-'];
        var length = dict.length;
        while (pos < length) {
          var b = dict[pos++];
          var b1 = b >> 4;
          var b2 = b & 15;

          if (b1 === eof) {
            break;
          }
          str += lookup[b1];

          if (b2 === eof) {
            break;
          }
          str += lookup[b2];
        }
        return parseFloat(str);
      }

      var operands = [];
      var entries = [];

      pos = 0;
      var end = dict.length;
      while (pos < end) {
        var b = dict[pos];
        if (b <= 21) {
          if (b === 12) {
            b = (b << 8) | dict[++pos];
          }
          entries.push([b, operands]);
          operands = [];
          ++pos;
        } else {
          operands.push(parseOperand());
        }
      }
      return entries;
    },
    parseIndex: function CFFParser_parseIndex(pos) {
      var cffIndex = new CFFIndex();
      var bytes = this.bytes;
      var count = (bytes[pos++] << 8) | bytes[pos++];
      var offsets = [];
      var end = pos;
      var i, ii;

      if (count !== 0) {
        var offsetSize = bytes[pos++];
        // add 1 for offset to determine size of last object
        var startPos = pos + ((count + 1) * offsetSize) - 1;

        for (i = 0, ii = count + 1; i < ii; ++i) {
          var offset = 0;
          for (var j = 0; j < offsetSize; ++j) {
            offset <<= 8;
            offset += bytes[pos++];
          }
          offsets.push(startPos + offset);
        }
        end = offsets[count];
      }
      for (i = 0, ii = offsets.length - 1; i < ii; ++i) {
        var offsetStart = offsets[i];
        var offsetEnd = offsets[i + 1];
        cffIndex.add(bytes.subarray(offsetStart, offsetEnd));
      }
      return {obj: cffIndex, endPos: end};
    },
    parseNameIndex: function CFFParser_parseNameIndex(index) {
      var names = [];
      for (var i = 0, ii = index.count; i < ii; ++i) {
        var name = index.get(i);
        // OTS doesn't allow names to be over 127 characters.
        var length = Math.min(name.length, 127);
        var data = [];
        // OTS also only permits certain characters in the name.
        for (var j = 0; j < length; ++j) {
          var c = name[j];
          if (j === 0 && c === 0) {
            data[j] = c;
            continue;
          }
          if ((c < 33 || c > 126) || c === 91 /* [ */ || c === 93 /* ] */ ||
              c === 40 /* ( */ || c === 41 /* ) */ || c === 123 /* { */ ||
              c === 125 /* } */ || c === 60 /* < */ || c === 62 /* > */ ||
              c === 47 /* / */ || c === 37 /* % */ || c === 35 /* # */) {
            data[j] = 95;
            continue;
          }
          data[j] = c;
        }
        names.push(bytesToString(data));
      }
      return names;
    },
    parseStringIndex: function CFFParser_parseStringIndex(index) {
      var strings = new CFFStrings();
      for (var i = 0, ii = index.count; i < ii; ++i) {
        var data = index.get(i);
        strings.add(bytesToString(data));
      }
      return strings;
    },
    createDict: function CFFParser_createDict(Type, dict, strings) {
      var cffDict = new Type(strings);
      for (var i = 0, ii = dict.length; i < ii; ++i) {
        var pair = dict[i];
        var key = pair[0];
        var value = pair[1];
        cffDict.setByKey(key, value);
      }
      return cffDict;
    },
    parseCharString: function CFFParser_parseCharString(state, data,
                                                        localSubrIndex,
                                                        globalSubrIndex) {
      if (state.callDepth > MAX_SUBR_NESTING) {
        return false;
      }
      var stackSize = state.stackSize;
      var stack = state.stack;

      var length = data.length;

      for (var j = 0; j < length;) {
        var value = data[j++];
        var validationCommand = null;
        if (value === 12) {
          var q = data[j++];
          if (q === 0) {
            // The CFF specification state that the 'dotsection' command
            // (12, 0) is deprecated and treated as a no-op, but all Type2
            // charstrings processors should support them. Unfortunately
            // the font sanitizer don't. As a workaround the sequence (12, 0)
            // is replaced by a useless (0, hmoveto).
            data[j - 2] = 139;
            data[j - 1] = 22;
            stackSize = 0;
          } else {
            validationCommand = CharstringValidationData12[q];
          }
        } else if (value === 28) { // number (16 bit)
          stack[stackSize] = ((data[j] << 24) | (data[j + 1] << 16)) >> 16;
          j += 2;
          stackSize++;
        } else if (value === 14) {
          if (stackSize >= 4) {
            stackSize -= 4;
            if (SEAC_ANALYSIS_ENABLED) {
              state.seac = stack.slice(stackSize, stackSize + 4);
              return false;
            }
          }
          validationCommand = CharstringValidationData[value];
        } else if (value >= 32 && value <= 246) {  // number
          stack[stackSize] = value - 139;
          stackSize++;
        } else if (value >= 247 && value <= 254) {  // number (+1 bytes)
          stack[stackSize] = (value < 251 ?
                              ((value - 247) << 8) + data[j] + 108 :
                              -((value - 251) << 8) - data[j] - 108);
          j++;
          stackSize++;
        } else if (value === 255) {  // number (32 bit)
          stack[stackSize] = ((data[j] << 24) | (data[j + 1] << 16) |
                              (data[j + 2] << 8) | data[j + 3]) / 65536;
          j += 4;
          stackSize++;
        } else if (value === 19 || value === 20) {
          state.hints += stackSize >> 1;
          // skipping right amount of hints flag data
          j += (state.hints + 7) >> 3;
          stackSize %= 2;
          validationCommand = CharstringValidationData[value];
        } else if (value === 10 || value === 29) {
          var subrsIndex;
          if (value === 10) {
            subrsIndex = localSubrIndex;
          } else {
            subrsIndex = globalSubrIndex;
          }
          if (!subrsIndex) {
            validationCommand = CharstringValidationData[value];
            warn('Missing subrsIndex for ' + validationCommand.id);
            return false;
          }
          var bias = 32768;
          if (subrsIndex.count < 1240) {
            bias = 107;
          } else if (subrsIndex.count < 33900) {
            bias = 1131;
          }
          var subrNumber = stack[--stackSize] + bias;
          if (subrNumber < 0 || subrNumber >= subrsIndex.count) {
            validationCommand = CharstringValidationData[value];
            warn('Out of bounds subrIndex for ' + validationCommand.id);
            return false;
          }
          state.stackSize = stackSize;
          state.callDepth++;
          var valid = this.parseCharString(state, subrsIndex.get(subrNumber),
                                           localSubrIndex, globalSubrIndex);
          if (!valid) {
            return false;
          }
          state.callDepth--;
          stackSize = state.stackSize;
          continue;
        } else if (value === 11) {
          state.stackSize = stackSize;
          return true;
        } else {
          validationCommand = CharstringValidationData[value];
        }
        if (validationCommand) {
          if (validationCommand.stem) {
            state.hints += stackSize >> 1;
          }
          if ('min' in validationCommand) {
            if (!state.undefStack && stackSize < validationCommand.min) {
              warn('Not enough parameters for ' + validationCommand.id +
                   '; actual: ' + stackSize +
                   ', expected: ' + validationCommand.min);
              return false;
            }
          }
          if (state.firstStackClearing && validationCommand.stackClearing) {
            state.firstStackClearing = false;
            // the optional character width can be found before the first
            // stack-clearing command arguments
            stackSize -= validationCommand.min;
            if (stackSize >= 2 && validationCommand.stem) {
              // there are even amount of arguments for stem commands
              stackSize %= 2;
            } else if (stackSize > 1) {
              warn('Found too many parameters for stack-clearing command');
            }
            if (stackSize > 0 && stack[stackSize - 1] >= 0) {
              state.width = stack[stackSize - 1];
            }
          }
          if ('stackDelta' in validationCommand) {
            if ('stackFn' in validationCommand) {
              validationCommand.stackFn(stack, stackSize);
            }
            stackSize += validationCommand.stackDelta;
          } else if (validationCommand.stackClearing) {
            stackSize = 0;
          } else if (validationCommand.resetStack) {
            stackSize = 0;
            state.undefStack = false;
          } else if (validationCommand.undefStack) {
            stackSize = 0;
            state.undefStack = true;
            state.firstStackClearing = false;
          }
        }
      }
      state.stackSize = stackSize;
      return true;
    },
    parseCharStrings: function CFFParser_parseCharStrings(charStrings,
                                                          localSubrIndex,
                                                          globalSubrIndex,
                                                          fdSelect,
                                                          fdArray) {
      var seacs = [];
      var widths = [];
      var count = charStrings.count;
      for (var i = 0; i < count; i++) {
        var charstring = charStrings.get(i);
        var state = {
          callDepth: 0,
          stackSize: 0,
          stack: [],
          undefStack: true,
          hints: 0,
          firstStackClearing: true,
          seac: null,
          width: null
        };
        var valid = true;
        var localSubrToUse = null;
        if (fdSelect && fdArray.length) {
          var fdIndex = fdSelect.getFDIndex(i);
          if (fdIndex === -1) {
            warn('Glyph index is not in fd select.');
            valid = false;
          }
          if (fdIndex >= fdArray.length) {
            warn('Invalid fd index for glyph index.');
            valid = false;
          }
          if (valid) {
            localSubrToUse = fdArray[fdIndex].privateDict.subrsIndex;
          }
        } else if (localSubrIndex) {
          localSubrToUse = localSubrIndex;
        }
        if (valid) {
          valid = this.parseCharString(state, charstring, localSubrToUse,
                                       globalSubrIndex);
        }
        if (state.width !== null) {
          widths[i] = state.width;
        }
        if (state.seac !== null) {
          seacs[i] = state.seac;
        }
        if (!valid) {
          // resetting invalid charstring to single 'endchar'
          charStrings.set(i, new Uint8Array([14]));
        }
      }
      return { charStrings: charStrings, seacs: seacs, widths: widths };
    },
    emptyPrivateDictionary:
      function CFFParser_emptyPrivateDictionary(parentDict) {
      var privateDict = this.createDict(CFFPrivateDict, [],
                                        parentDict.strings);
      parentDict.setByKey(18, [0, 0]);
      parentDict.privateDict = privateDict;
    },
    parsePrivateDict: function CFFParser_parsePrivateDict(parentDict) {
      // no private dict, do nothing
      if (!parentDict.hasName('Private')) {
        this.emptyPrivateDictionary(parentDict);
        return;
      }
      var privateOffset = parentDict.getByName('Private');
      // make sure the params are formatted correctly
      if (!isArray(privateOffset) || privateOffset.length !== 2) {
        parentDict.removeByName('Private');
        return;
      }
      var size = privateOffset[0];
      var offset = privateOffset[1];
      // remove empty dicts or ones that refer to invalid location
      if (size === 0 || offset >= this.bytes.length) {
        this.emptyPrivateDictionary(parentDict);
        return;
      }

      var privateDictEnd = offset + size;
      var dictData = this.bytes.subarray(offset, privateDictEnd);
      var dict = this.parseDict(dictData);
      var privateDict = this.createDict(CFFPrivateDict, dict,
                                        parentDict.strings);
      parentDict.privateDict = privateDict;

      // Parse the Subrs index also since it's relative to the private dict.
      if (!privateDict.getByName('Subrs')) {
        return;
      }
      var subrsOffset = privateDict.getByName('Subrs');
      var relativeOffset = offset + subrsOffset;
      // Validate the offset.
      if (subrsOffset === 0 || relativeOffset >= this.bytes.length) {
        this.emptyPrivateDictionary(parentDict);
        return;
      }
      var subrsIndex = this.parseIndex(relativeOffset);
      privateDict.subrsIndex = subrsIndex.obj;
    },
    parseCharsets: function CFFParser_parseCharsets(pos, length, strings, cid) {
      if (pos === 0) {
        return new CFFCharset(true, CFFCharsetPredefinedTypes.ISO_ADOBE,
                              ISOAdobeCharset);
      } else if (pos === 1) {
        return new CFFCharset(true, CFFCharsetPredefinedTypes.EXPERT,
                              ExpertCharset);
      } else if (pos === 2) {
        return new CFFCharset(true, CFFCharsetPredefinedTypes.EXPERT_SUBSET,
                              ExpertSubsetCharset);
      }

      var bytes = this.bytes;
      var start = pos;
      var format = bytes[pos++];
      var charset = ['.notdef'];
      var id, count, i;

      // subtract 1 for the .notdef glyph
      length -= 1;

      switch (format) {
        case 0:
          for (i = 0; i < length; i++) {
            id = (bytes[pos++] << 8) | bytes[pos++];
            charset.push(cid ? id : strings.get(id));
          }
          break;
        case 1:
          while (charset.length <= length) {
            id = (bytes[pos++] << 8) | bytes[pos++];
            count = bytes[pos++];
            for (i = 0; i <= count; i++) {
              charset.push(cid ? id++ : strings.get(id++));
            }
          }
          break;
        case 2:
          while (charset.length <= length) {
            id = (bytes[pos++] << 8) | bytes[pos++];
            count = (bytes[pos++] << 8) | bytes[pos++];
            for (i = 0; i <= count; i++) {
              charset.push(cid ? id++ : strings.get(id++));
            }
          }
          break;
        default:
          error('Unknown charset format');
      }
      // Raw won't be needed if we actually compile the charset.
      var end = pos;
      var raw = bytes.subarray(start, end);

      return new CFFCharset(false, format, charset, raw);
    },
    parseEncoding: function CFFParser_parseEncoding(pos,
                                                    properties,
                                                    strings,
                                                    charset) {
      var encoding = Object.create(null);
      var bytes = this.bytes;
      var predefined = false;
      var hasSupplement = false;
      var format, i, ii;
      var raw = null;

      function readSupplement() {
        var supplementsCount = bytes[pos++];
        for (i = 0; i < supplementsCount; i++) {
          var code = bytes[pos++];
          var sid = (bytes[pos++] << 8) + (bytes[pos++] & 0xff);
          encoding[code] = charset.indexOf(strings.get(sid));
        }
      }

      if (pos === 0 || pos === 1) {
        predefined = true;
        format = pos;
        var baseEncoding = pos ? ExpertEncoding : StandardEncoding;
        for (i = 0, ii = charset.length; i < ii; i++) {
          var index = baseEncoding.indexOf(charset[i]);
          if (index !== -1) {
            encoding[index] = i;
          }
        }
      } else {
        var dataStart = pos;
        format = bytes[pos++];
        switch (format & 0x7f) {
          case 0:
            var glyphsCount = bytes[pos++];
            for (i = 1; i <= glyphsCount; i++) {
              encoding[bytes[pos++]] = i;
            }
            break;

          case 1:
            var rangesCount = bytes[pos++];
            var gid = 1;
            for (i = 0; i < rangesCount; i++) {
              var start = bytes[pos++];
              var left = bytes[pos++];
              for (var j = start; j <= start + left; j++) {
                encoding[j] = gid++;
              }
            }
            break;

          default:
            error('Unknow encoding format: ' + format + ' in CFF');
            break;
        }
        var dataEnd = pos;
        if (format & 0x80) {
          // The font sanitizer does not support CFF encoding with a
          // supplement, since the encoding is not really used to map
          // between gid to glyph, let's overwrite what is declared in
          // the top dictionary to let the sanitizer think the font use
          // StandardEncoding, that's a lie but that's ok.
          bytes[dataStart] &= 0x7f;
          readSupplement();
          hasSupplement = true;
        }
        raw = bytes.subarray(dataStart, dataEnd);
      }
      format = format & 0x7f;
      return new CFFEncoding(predefined, format, encoding, raw);
    },
    parseFDSelect: function CFFParser_parseFDSelect(pos, length) {
      var start = pos;
      var bytes = this.bytes;
      var format = bytes[pos++];
      var fdSelect = [];
      var i;

      switch (format) {
        case 0:
          for (i = 0; i < length; ++i) {
            var id = bytes[pos++];
            fdSelect.push(id);
          }
          break;
        case 3:
          var rangesCount = (bytes[pos++] << 8) | bytes[pos++];
          for (i = 0; i < rangesCount; ++i) {
            var first = (bytes[pos++] << 8) | bytes[pos++];
            var fdIndex = bytes[pos++];
            var next = (bytes[pos] << 8) | bytes[pos + 1];
            for (var j = first; j < next; ++j) {
              fdSelect.push(fdIndex);
            }
          }
          // Advance past the sentinel(next).
          pos += 2;
          break;
        default:
          error('Unknown fdselect format ' + format);
          break;
      }
      var end = pos;
      return new CFFFDSelect(fdSelect, bytes.subarray(start, end));
    }
  };
  return CFFParser;
})();

// Compact Font Format
var CFF = (function CFFClosure() {
  function CFF() {
    this.header = null;
    this.names = [];
    this.topDict = null;
    this.strings = new CFFStrings();
    this.globalSubrIndex = null;

    // The following could really be per font, but since we only have one font
    // store them here.
    this.encoding = null;
    this.charset = null;
    this.charStrings = null;
    this.fdArray = [];
    this.fdSelect = null;

    this.isCIDFont = false;
  }
  return CFF;
})();

var CFFHeader = (function CFFHeaderClosure() {
  function CFFHeader(major, minor, hdrSize, offSize) {
    this.major = major;
    this.minor = minor;
    this.hdrSize = hdrSize;
    this.offSize = offSize;
  }
  return CFFHeader;
})();

var CFFStrings = (function CFFStringsClosure() {
  function CFFStrings() {
    this.strings = [];
  }
  CFFStrings.prototype = {
    get: function CFFStrings_get(index) {
      if (index >= 0 && index <= 390) {
        return CFFStandardStrings[index];
      }
      if (index - 391 <= this.strings.length) {
        return this.strings[index - 391];
      }
      return CFFStandardStrings[0];
    },
    add: function CFFStrings_add(value) {
      this.strings.push(value);
    },
    get count() {
      return this.strings.length;
    }
  };
  return CFFStrings;
})();

var CFFIndex = (function CFFIndexClosure() {
  function CFFIndex() {
    this.objects = [];
    this.length = 0;
  }
  CFFIndex.prototype = {
    add: function CFFIndex_add(data) {
      this.length += data.length;
      this.objects.push(data);
    },
    set: function CFFIndex_set(index, data) {
      this.length += data.length - this.objects[index].length;
      this.objects[index] = data;
    },
    get: function CFFIndex_get(index) {
      return this.objects[index];
    },
    get count() {
      return this.objects.length;
    }
  };
  return CFFIndex;
})();

var CFFDict = (function CFFDictClosure() {
  function CFFDict(tables, strings) {
    this.keyToNameMap = tables.keyToNameMap;
    this.nameToKeyMap = tables.nameToKeyMap;
    this.defaults = tables.defaults;
    this.types = tables.types;
    this.opcodes = tables.opcodes;
    this.order = tables.order;
    this.strings = strings;
    this.values = Object.create(null);
  }
  CFFDict.prototype = {
    // value should always be an array
    setByKey: function CFFDict_setByKey(key, value) {
      if (!(key in this.keyToNameMap)) {
        return false;
      }
      // ignore empty values
      if (value.length === 0) {
        return true;
      }
      var type = this.types[key];
      // remove the array wrapping these types of values
      if (type === 'num' || type === 'sid' || type === 'offset') {
        value = value[0];
      }
      this.values[key] = value;
      return true;
    },
    setByName: function CFFDict_setByName(name, value) {
      if (!(name in this.nameToKeyMap)) {
        error('Invalid dictionary name "' + name + '"');
      }
      this.values[this.nameToKeyMap[name]] = value;
    },
    hasName: function CFFDict_hasName(name) {
      return this.nameToKeyMap[name] in this.values;
    },
    getByName: function CFFDict_getByName(name) {
      if (!(name in this.nameToKeyMap)) {
        error('Invalid dictionary name "' + name + '"');
      }
      var key = this.nameToKeyMap[name];
      if (!(key in this.values)) {
        return this.defaults[key];
      }
      return this.values[key];
    },
    removeByName: function CFFDict_removeByName(name) {
      delete this.values[this.nameToKeyMap[name]];
    }
  };
  CFFDict.createTables = function CFFDict_createTables(layout) {
    var tables = {
      keyToNameMap: {},
      nameToKeyMap: {},
      defaults: {},
      types: {},
      opcodes: {},
      order: []
    };
    for (var i = 0, ii = layout.length; i < ii; ++i) {
      var entry = layout[i];
      var key = isArray(entry[0]) ? (entry[0][0] << 8) + entry[0][1] : entry[0];
      tables.keyToNameMap[key] = entry[1];
      tables.nameToKeyMap[entry[1]] = key;
      tables.types[key] = entry[2];
      tables.defaults[key] = entry[3];
      tables.opcodes[key] = isArray(entry[0]) ? entry[0] : [entry[0]];
      tables.order.push(key);
    }
    return tables;
  };
  return CFFDict;
})();

var CFFTopDict = (function CFFTopDictClosure() {
  var layout = [
    [[12, 30], 'ROS', ['sid', 'sid', 'num'], null],
    [[12, 20], 'SyntheticBase', 'num', null],
    [0, 'version', 'sid', null],
    [1, 'Notice', 'sid', null],
    [[12, 0], 'Copyright', 'sid', null],
    [2, 'FullName', 'sid', null],
    [3, 'FamilyName', 'sid', null],
    [4, 'Weight', 'sid', null],
    [[12, 1], 'isFixedPitch', 'num', 0],
    [[12, 2], 'ItalicAngle', 'num', 0],
    [[12, 3], 'UnderlinePosition', 'num', -100],
    [[12, 4], 'UnderlineThickness', 'num', 50],
    [[12, 5], 'PaintType', 'num', 0],
    [[12, 6], 'CharstringType', 'num', 2],
    [[12, 7], 'FontMatrix', ['num', 'num', 'num', 'num', 'num', 'num'],
                            [0.001, 0, 0, 0.001, 0, 0]],
    [13, 'UniqueID', 'num', null],
    [5, 'FontBBox', ['num', 'num', 'num', 'num'], [0, 0, 0, 0]],
    [[12, 8], 'StrokeWidth', 'num', 0],
    [14, 'XUID', 'array', null],
    [15, 'charset', 'offset', 0],
    [16, 'Encoding', 'offset', 0],
    [17, 'CharStrings', 'offset', 0],
    [18, 'Private', ['offset', 'offset'], null],
    [[12, 21], 'PostScript', 'sid', null],
    [[12, 22], 'BaseFontName', 'sid', null],
    [[12, 23], 'BaseFontBlend', 'delta', null],
    [[12, 31], 'CIDFontVersion', 'num', 0],
    [[12, 32], 'CIDFontRevision', 'num', 0],
    [[12, 33], 'CIDFontType', 'num', 0],
    [[12, 34], 'CIDCount', 'num', 8720],
    [[12, 35], 'UIDBase', 'num', null],
    // XXX: CID Fonts on DirectWrite 6.1 only seem to work if FDSelect comes
    // before FDArray.
    [[12, 37], 'FDSelect', 'offset', null],
    [[12, 36], 'FDArray', 'offset', null],
    [[12, 38], 'FontName', 'sid', null]
  ];
  var tables = null;
  function CFFTopDict(strings) {
    if (tables === null) {
      tables = CFFDict.createTables(layout);
    }
    CFFDict.call(this, tables, strings);
    this.privateDict = null;
  }
  CFFTopDict.prototype = Object.create(CFFDict.prototype);
  return CFFTopDict;
})();

var CFFPrivateDict = (function CFFPrivateDictClosure() {
  var layout = [
    [6, 'BlueValues', 'delta', null],
    [7, 'OtherBlues', 'delta', null],
    [8, 'FamilyBlues', 'delta', null],
    [9, 'FamilyOtherBlues', 'delta', null],
    [[12, 9], 'BlueScale', 'num', 0.039625],
    [[12, 10], 'BlueShift', 'num', 7],
    [[12, 11], 'BlueFuzz', 'num', 1],
    [10, 'StdHW', 'num', null],
    [11, 'StdVW', 'num', null],
    [[12, 12], 'StemSnapH', 'delta', null],
    [[12, 13], 'StemSnapV', 'delta', null],
    [[12, 14], 'ForceBold', 'num', 0],
    [[12, 17], 'LanguageGroup', 'num', 0],
    [[12, 18], 'ExpansionFactor', 'num', 0.06],
    [[12, 19], 'initialRandomSeed', 'num', 0],
    [20, 'defaultWidthX', 'num', 0],
    [21, 'nominalWidthX', 'num', 0],
    [19, 'Subrs', 'offset', null]
  ];
  var tables = null;
  function CFFPrivateDict(strings) {
    if (tables === null) {
      tables = CFFDict.createTables(layout);
    }
    CFFDict.call(this, tables, strings);
    this.subrsIndex = null;
  }
  CFFPrivateDict.prototype = Object.create(CFFDict.prototype);
  return CFFPrivateDict;
})();

var CFFCharsetPredefinedTypes = {
  ISO_ADOBE: 0,
  EXPERT: 1,
  EXPERT_SUBSET: 2
};
var CFFCharset = (function CFFCharsetClosure() {
  function CFFCharset(predefined, format, charset, raw) {
    this.predefined = predefined;
    this.format = format;
    this.charset = charset;
    this.raw = raw;
  }
  return CFFCharset;
})();

var CFFEncoding = (function CFFEncodingClosure() {
  function CFFEncoding(predefined, format, encoding, raw) {
    this.predefined = predefined;
    this.format = format;
    this.encoding = encoding;
    this.raw = raw;
  }
  return CFFEncoding;
})();

var CFFFDSelect = (function CFFFDSelectClosure() {
  function CFFFDSelect(fdSelect, raw) {
    this.fdSelect = fdSelect;
    this.raw = raw;
  }
  CFFFDSelect.prototype = {
    getFDIndex: function CFFFDSelect_get(glyphIndex) {
      if (glyphIndex < 0 || glyphIndex >= this.fdSelect.length) {
        return -1;
      }
      return this.fdSelect[glyphIndex];
    }
  };
  return CFFFDSelect;
})();

// Helper class to keep track of where an offset is within the data and helps
// filling in that offset once it's known.
var CFFOffsetTracker = (function CFFOffsetTrackerClosure() {
  function CFFOffsetTracker() {
    this.offsets = Object.create(null);
  }
  CFFOffsetTracker.prototype = {
    isTracking: function CFFOffsetTracker_isTracking(key) {
      return key in this.offsets;
    },
    track: function CFFOffsetTracker_track(key, location) {
      if (key in this.offsets) {
        error('Already tracking location of ' + key);
      }
      this.offsets[key] = location;
    },
    offset: function CFFOffsetTracker_offset(value) {
      for (var key in this.offsets) {
        this.offsets[key] += value;
      }
    },
    setEntryLocation: function CFFOffsetTracker_setEntryLocation(key,
                                                                 values,
                                                                 output) {
      if (!(key in this.offsets)) {
        error('Not tracking location of ' + key);
      }
      var data = output.data;
      var dataOffset = this.offsets[key];
      var size = 5;
      for (var i = 0, ii = values.length; i < ii; ++i) {
        var offset0 = i * size + dataOffset;
        var offset1 = offset0 + 1;
        var offset2 = offset0 + 2;
        var offset3 = offset0 + 3;
        var offset4 = offset0 + 4;
        // It's easy to screw up offsets so perform this sanity check.
        if (data[offset0] !== 0x1d || data[offset1] !== 0 ||
            data[offset2] !== 0 || data[offset3] !== 0 || data[offset4] !== 0) {
          error('writing to an offset that is not empty');
        }
        var value = values[i];
        data[offset0] = 0x1d;
        data[offset1] = (value >> 24) & 0xFF;
        data[offset2] = (value >> 16) & 0xFF;
        data[offset3] = (value >> 8) & 0xFF;
        data[offset4] = value & 0xFF;
      }
    }
  };
  return CFFOffsetTracker;
})();

// Takes a CFF and converts it to the binary representation.
var CFFCompiler = (function CFFCompilerClosure() {
  function CFFCompiler(cff) {
    this.cff = cff;
  }
  CFFCompiler.prototype = {
    compile: function CFFCompiler_compile() {
      var cff = this.cff;
      var output = {
        data: [],
        length: 0,
        add: function CFFCompiler_add(data) {
          this.data = this.data.concat(data);
          this.length = this.data.length;
        }
      };

      // Compile the five entries that must be in order.
      var header = this.compileHeader(cff.header);
      output.add(header);

      var nameIndex = this.compileNameIndex(cff.names);
      output.add(nameIndex);

      if (cff.isCIDFont) {
        // The spec is unclear on how font matrices should relate to each other
        // when there is one in the main top dict and the sub top dicts.
        // Windows handles this differently than linux and osx so we have to
        // normalize to work on all.
        // Rules based off of some mailing list discussions:
        // - If main font has a matrix and subfont doesn't, use the main matrix.
        // - If no main font matrix and there is a subfont matrix, use the
        //   subfont matrix.
        // - If both have matrices, concat together.
        // - If neither have matrices, use default.
        // To make this work on all platforms we move the top matrix into each
        // sub top dict and concat if necessary.
        if (cff.topDict.hasName('FontMatrix')) {
          var base = cff.topDict.getByName('FontMatrix');
          cff.topDict.removeByName('FontMatrix');
          for (var i = 0, ii = cff.fdArray.length; i < ii; i++) {
            var subDict = cff.fdArray[i];
            var matrix = base.slice(0);
            if (subDict.hasName('FontMatrix')) {
              matrix = Util.transform(matrix, subDict.getByName('FontMatrix'));
            }
            subDict.setByName('FontMatrix', matrix);
          }
        }
      }

      var compiled = this.compileTopDicts([cff.topDict],
                                          output.length,
                                          cff.isCIDFont);
      output.add(compiled.output);
      var topDictTracker = compiled.trackers[0];

      var stringIndex = this.compileStringIndex(cff.strings.strings);
      output.add(stringIndex);

      var globalSubrIndex = this.compileIndex(cff.globalSubrIndex);
      output.add(globalSubrIndex);

      // Now start on the other entries that have no specfic order.
      if (cff.encoding && cff.topDict.hasName('Encoding')) {
        if (cff.encoding.predefined) {
          topDictTracker.setEntryLocation('Encoding', [cff.encoding.format],
                                          output);
        } else {
          var encoding = this.compileEncoding(cff.encoding);
          topDictTracker.setEntryLocation('Encoding', [output.length], output);
          output.add(encoding);
        }
      }

      if (cff.charset && cff.topDict.hasName('charset')) {
        if (cff.charset.predefined) {
          topDictTracker.setEntryLocation('charset', [cff.charset.format],
                                          output);
        } else {
          var charset = this.compileCharset(cff.charset);
          topDictTracker.setEntryLocation('charset', [output.length], output);
          output.add(charset);
        }
      }

      var charStrings = this.compileCharStrings(cff.charStrings);
      topDictTracker.setEntryLocation('CharStrings', [output.length], output);
      output.add(charStrings);

      if (cff.isCIDFont) {
        // For some reason FDSelect must be in front of FDArray on windows. OSX
        // and linux don't seem to care.
        topDictTracker.setEntryLocation('FDSelect', [output.length], output);
        var fdSelect = this.compileFDSelect(cff.fdSelect.raw);
        output.add(fdSelect);
        // It is unclear if the sub font dictionary can have CID related
        // dictionary keys, but the sanitizer doesn't like them so remove them.
        compiled = this.compileTopDicts(cff.fdArray, output.length, true);
        topDictTracker.setEntryLocation('FDArray', [output.length], output);
        output.add(compiled.output);
        var fontDictTrackers = compiled.trackers;

        this.compilePrivateDicts(cff.fdArray, fontDictTrackers, output);
      }

      this.compilePrivateDicts([cff.topDict], [topDictTracker], output);

      // If the font data ends with INDEX whose object data is zero-length,
      // the sanitizer will bail out. Add a dummy byte to avoid that.
      output.add([0]);

      return output.data;
    },
    encodeNumber: function CFFCompiler_encodeNumber(value) {
      if (parseFloat(value) === parseInt(value, 10) && !isNaN(value)) { // isInt
        return this.encodeInteger(value);
      } else {
        return this.encodeFloat(value);
      }
    },
    encodeFloat: function CFFCompiler_encodeFloat(num) {
      var value = num.toString();

      // rounding inaccurate doubles
      var m = /\.(\d*?)(?:9{5,20}|0{5,20})\d{0,2}(?:e(.+)|$)/.exec(value);
      if (m) {
        var epsilon = parseFloat('1e' + ((m[2] ? +m[2] : 0) + m[1].length));
        value = (Math.round(num * epsilon) / epsilon).toString();
      }

      var nibbles = '';
      var i, ii;
      for (i = 0, ii = value.length; i < ii; ++i) {
        var a = value[i];
        if (a === 'e') {
          nibbles += value[++i] === '-' ? 'c' : 'b';
        } else if (a === '.') {
          nibbles += 'a';
        } else if (a === '-') {
          nibbles += 'e';
        } else {
          nibbles += a;
        }
      }
      nibbles += (nibbles.length & 1) ? 'f' : 'ff';
      var out = [30];
      for (i = 0, ii = nibbles.length; i < ii; i += 2) {
        out.push(parseInt(nibbles.substr(i, 2), 16));
      }
      return out;
    },
    encodeInteger: function CFFCompiler_encodeInteger(value) {
      var code;
      if (value >= -107 && value <= 107) {
        code = [value + 139];
      } else if (value >= 108 && value <= 1131) {
        value = [value - 108];
        code = [(value >> 8) + 247, value & 0xFF];
      } else if (value >= -1131 && value <= -108) {
        value = -value - 108;
        code = [(value >> 8) + 251, value & 0xFF];
      } else if (value >= -32768 && value <= 32767) {
        code = [0x1c, (value >> 8) & 0xFF, value & 0xFF];
      } else {
        code = [0x1d,
                (value >> 24) & 0xFF,
                (value >> 16) & 0xFF,
                (value >> 8) & 0xFF,
                 value & 0xFF];
      }
      return code;
    },
    compileHeader: function CFFCompiler_compileHeader(header) {
      return [
        header.major,
        header.minor,
        header.hdrSize,
        header.offSize
      ];
    },
    compileNameIndex: function CFFCompiler_compileNameIndex(names) {
      var nameIndex = new CFFIndex();
      for (var i = 0, ii = names.length; i < ii; ++i) {
        nameIndex.add(stringToBytes(names[i]));
      }
      return this.compileIndex(nameIndex);
    },
    compileTopDicts: function CFFCompiler_compileTopDicts(dicts,
                                                          length,
                                                          removeCidKeys) {
      var fontDictTrackers = [];
      var fdArrayIndex = new CFFIndex();
      for (var i = 0, ii = dicts.length; i < ii; ++i) {
        var fontDict = dicts[i];
        if (removeCidKeys) {
          fontDict.removeByName('CIDFontVersion');
          fontDict.removeByName('CIDFontRevision');
          fontDict.removeByName('CIDFontType');
          fontDict.removeByName('CIDCount');
          fontDict.removeByName('UIDBase');
        }
        var fontDictTracker = new CFFOffsetTracker();
        var fontDictData = this.compileDict(fontDict, fontDictTracker);
        fontDictTrackers.push(fontDictTracker);
        fdArrayIndex.add(fontDictData);
        fontDictTracker.offset(length);
      }
      fdArrayIndex = this.compileIndex(fdArrayIndex, fontDictTrackers);
      return {
        trackers: fontDictTrackers,
        output: fdArrayIndex
      };
    },
    compilePrivateDicts: function CFFCompiler_compilePrivateDicts(dicts,
                                                                  trackers,
                                                                  output) {
      for (var i = 0, ii = dicts.length; i < ii; ++i) {
        var fontDict = dicts[i];
        assert(fontDict.privateDict && fontDict.hasName('Private'),
               'There must be an private dictionary.');
        var privateDict = fontDict.privateDict;
        var privateDictTracker = new CFFOffsetTracker();
        var privateDictData = this.compileDict(privateDict, privateDictTracker);

        var outputLength = output.length;
        privateDictTracker.offset(outputLength);
        if (!privateDictData.length) {
          // The private dictionary was empty, set the output length to zero to
          // ensure the offset length isn't out of bounds in the eyes of the
          // sanitizer.
          outputLength = 0;
        }

        trackers[i].setEntryLocation('Private',
                                     [privateDictData.length, outputLength],
                                     output);
        output.add(privateDictData);

        if (privateDict.subrsIndex && privateDict.hasName('Subrs')) {
          var subrs = this.compileIndex(privateDict.subrsIndex);
          privateDictTracker.setEntryLocation('Subrs', [privateDictData.length],
                                              output);
          output.add(subrs);
        }
      }
    },
    compileDict: function CFFCompiler_compileDict(dict, offsetTracker) {
      var out = [];
      // The dictionary keys must be in a certain order.
      var order = dict.order;
      for (var i = 0; i < order.length; ++i) {
        var key = order[i];
        if (!(key in dict.values)) {
          continue;
        }
        var values = dict.values[key];
        var types = dict.types[key];
        if (!isArray(types)) {
          types = [types];
        }
        if (!isArray(values)) {
          values = [values];
        }

        // Remove any empty dict values.
        if (values.length === 0) {
          continue;
        }

        for (var j = 0, jj = types.length; j < jj; ++j) {
          var type = types[j];
          var value = values[j];
          switch (type) {
            case 'num':
            case 'sid':
              out = out.concat(this.encodeNumber(value));
              break;
            case 'offset':
              // For offsets we just insert a 32bit integer so we don't have to
              // deal with figuring out the length of the offset when it gets
              // replaced later on by the compiler.
              var name = dict.keyToNameMap[key];
              // Some offsets have the offset and the length, so just record the
              // position of the first one.
              if (!offsetTracker.isTracking(name)) {
                offsetTracker.track(name, out.length);
              }
              out = out.concat([0x1d, 0, 0, 0, 0]);
              break;
            case 'array':
            case 'delta':
              out = out.concat(this.encodeNumber(value));
              for (var k = 1, kk = values.length; k < kk; ++k) {
                out = out.concat(this.encodeNumber(values[k]));
              }
              break;
            default:
              error('Unknown data type of ' + type);
              break;
          }
        }
        out = out.concat(dict.opcodes[key]);
      }
      return out;
    },
    compileStringIndex: function CFFCompiler_compileStringIndex(strings) {
      var stringIndex = new CFFIndex();
      for (var i = 0, ii = strings.length; i < ii; ++i) {
        stringIndex.add(stringToBytes(strings[i]));
      }
      return this.compileIndex(stringIndex);
    },
    compileGlobalSubrIndex: function CFFCompiler_compileGlobalSubrIndex() {
      var globalSubrIndex = this.cff.globalSubrIndex;
      this.out.writeByteArray(this.compileIndex(globalSubrIndex));
    },
    compileCharStrings: function CFFCompiler_compileCharStrings(charStrings) {
      return this.compileIndex(charStrings);
    },
    compileCharset: function CFFCompiler_compileCharset(charset) {
      return this.compileTypedArray(charset.raw);
    },
    compileEncoding: function CFFCompiler_compileEncoding(encoding) {
      return this.compileTypedArray(encoding.raw);
    },
    compileFDSelect: function CFFCompiler_compileFDSelect(fdSelect) {
      return this.compileTypedArray(fdSelect);
    },
    compileTypedArray: function CFFCompiler_compileTypedArray(data) {
      var out = [];
      for (var i = 0, ii = data.length; i < ii; ++i) {
        out[i] = data[i];
      }
      return out;
    },
    compileIndex: function CFFCompiler_compileIndex(index, trackers) {
      trackers = trackers || [];
      var objects = index.objects;
      // First 2 bytes contains the number of objects contained into this index
      var count = objects.length;

      // If there is no object, just create an index. This technically
      // should just be [0, 0] but OTS has an issue with that.
      if (count === 0) {
        return [0, 0, 0];
      }

      var data = [(count >> 8) & 0xFF, count & 0xff];

      var lastOffset = 1, i;
      for (i = 0; i < count; ++i) {
        lastOffset += objects[i].length;
      }

      var offsetSize;
      if (lastOffset < 0x100) {
        offsetSize = 1;
      } else if (lastOffset < 0x10000) {
        offsetSize = 2;
      } else if (lastOffset < 0x1000000) {
        offsetSize = 3;
      } else {
        offsetSize = 4;
      }

      // Next byte contains the offset size use to reference object in the file
      data.push(offsetSize);

      // Add another offset after this one because we need a new offset
      var relativeOffset = 1;
      for (i = 0; i < count + 1; i++) {
        if (offsetSize === 1) {
          data.push(relativeOffset & 0xFF);
        } else if (offsetSize === 2) {
          data.push((relativeOffset >> 8) & 0xFF,
                     relativeOffset & 0xFF);
        } else if (offsetSize === 3) {
          data.push((relativeOffset >> 16) & 0xFF,
                    (relativeOffset >> 8) & 0xFF,
                     relativeOffset & 0xFF);
        } else {
          data.push((relativeOffset >>> 24) & 0xFF,
                    (relativeOffset >> 16) & 0xFF,
                    (relativeOffset >> 8) & 0xFF,
                     relativeOffset & 0xFF);
        }

        if (objects[i]) {
          relativeOffset += objects[i].length;
        }
      }

      for (i = 0; i < count; i++) {
        // Notify the tracker where the object will be offset in the data.
        if (trackers[i]) {
          trackers[i].offset(data.length);
        }
        for (var j = 0, jj = objects[i].length; j < jj; j++) {
          data.push(objects[i][j]);
        }
      }
      return data;
    }
  };
  return CFFCompiler;
})();

function _enableSeacAnalysis(enabled) {
  exports.SEAC_ANALYSIS_ENABLED = SEAC_ANALYSIS_ENABLED = enabled;
}

// Workaround for seac on Windows.
(function checkSeacSupport() {
  if (typeof navigator !== 'undefined' && /Windows/.test(navigator.userAgent)) {
    SEAC_ANALYSIS_ENABLED = true;
  }
})();

// Workaround for Private Use Area characters in Chrome on Windows
// http://code.google.com/p/chromium/issues/detail?id=122465
// https://github.com/mozilla/pdf.js/issues/1689
(function checkChromeWindows() {
  if (typeof navigator !== 'undefined' &&
      /Windows.*Chrome/.test(navigator.userAgent)) {
    SKIP_PRIVATE_USE_RANGE_F000_TO_F01F = true;
  }
})();

exports.SEAC_ANALYSIS_ENABLED = SEAC_ANALYSIS_ENABLED;
exports.CFFCompiler = CFFCompiler;
exports.CFFIndex = CFFIndex;
exports.CFFParser = CFFParser;
exports.CFFStrings = CFFStrings;
exports.ErrorFont = ErrorFont;
exports.FontFlags = FontFlags;
exports.Font = Font;
exports.IdentityToUnicodeMap = IdentityToUnicodeMap;
exports.ToUnicodeMap = ToUnicodeMap;
exports.Type1Parser = Type1Parser;
exports.getFontType = getFontType;
exports._enableSeacAnalysis = _enableSeacAnalysis;

// TODO refactor to remove cyclic dependency on font_renderer.js
coreFontRenderer._setCoreFonts(exports);
}));
