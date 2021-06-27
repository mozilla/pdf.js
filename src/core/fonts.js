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
  warn,
} from "../shared/util.js";
import { CFFCompiler, CFFParser } from "./cff_parser.js";
import {
  FontFlags,
  getFontType,
  MacStandardGlyphOrdering,
  normalizeFontName,
  recoverGlyphName,
  SEAC_ANALYSIS_ENABLED,
} from "./fonts_utils.js";
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
import { IdentityToUnicodeMap, ToUnicodeMap } from "./to_unicode_map.js";
import { CFFFont } from "./cff_font.js";
import { FontRendererFactory } from "./font_renderer.js";
import { GlyfTable } from "./glyf.js";
import { IdentityCMap } from "./cmap.js";
import { OpenTypeFileBuilder } from "./opentype_file_builder.js";
import { readUint32 } from "./core_utils.js";
import { Stream } from "./stream.js";
import { Type1Font } from "./type1_font.js";

// Unicode Private Use Areas:
const PRIVATE_USE_AREAS = [
  [0xe000, 0xf8ff], // BMP (0)
  [0x100000, 0x10fffd], // PUP (16)
];

// PDF Glyph Space Units are one Thousandth of a TextSpace Unit
// except for Type 3 fonts
const PDF_GLYPH_SPACE_UNITS = 1000;

const EXPORT_DATA_PROPERTIES = [
  "ascent",
  "bbox",
  "black",
  "bold",
  "charProcOperatorList",
  "composite",
  "cssFontInfo",
  "data",
  "defaultVMetrics",
  "defaultWidth",
  "descent",
  "fallbackName",
  "fontMatrix",
  "fontType",
  "isMonospace",
  "isSerifFont",
  "isType3Font",
  "italic",
  "loadedName",
  "mimetype",
  "missingFile",
  "name",
  "remeasure",
  "subtype",
  "type",
  "vertical",
];

const EXPORT_DATA_EXTRA_PROPERTIES = [
  "cMap",
  "defaultEncoding",
  "differences",
  "isSymbolicFont",
  "seacMap",
  "toFontChar",
  "toUnicode",
  "vmetrics",
  "widths",
];

function adjustWidths(properties) {
  if (!properties.fontMatrix) {
    return;
  }
  if (properties.fontMatrix[0] === FONT_IDENTITY_MATRIX[0]) {
    return;
  }
  // adjusting width to fontMatrix scale
  const scale = 0.001 / properties.fontMatrix[0];
  const glyphsWidths = properties.widths;
  for (const glyph in glyphsWidths) {
    glyphsWidths[glyph] *= scale;
  }
  properties.defaultWidth *= scale;
}

function adjustToUnicode(properties, builtInEncoding) {
  if (properties.isInternalFont) {
    return;
  }
  if (builtInEncoding === properties.defaultEncoding) {
    return; // No point in trying to adjust `toUnicode` if the encodings match.
  }
  if (properties.toUnicode instanceof IdentityToUnicodeMap) {
    return;
  }
  const toUnicode = [],
    glyphsUnicodeMap = getGlyphsUnicode();
  for (const charCode in builtInEncoding) {
    if (properties.hasIncludedToUnicodeMap) {
      if (properties.toUnicode.has(charCode)) {
        continue; // The font dictionary has a `ToUnicode` entry.
      }
    } else {
      if (
        properties.hasEncoding &&
        properties.differences[charCode] !== undefined
      ) {
        continue; // The font dictionary has an `Encoding`/`Differences` entry.
      }
    }
    const glyphName = builtInEncoding[charCode];
    const unicode = getUnicodeForGlyph(glyphName, glyphsUnicodeMap);
    if (unicode !== -1) {
      toUnicode[charCode] = String.fromCharCode(unicode);
    }
  }
  if (toUnicode.length > 0) {
    properties.toUnicode.amend(toUnicode);
  }
}

/**
 * NOTE: This function should only be called at the *end* of font-parsing,
 *       after e.g. `adjustToUnicode` has run, to prevent any issues.
 */
function amendFallbackToUnicode(properties) {
  if (!properties.fallbackToUnicode) {
    return;
  }
  if (properties.toUnicode instanceof IdentityToUnicodeMap) {
    return;
  }
  const toUnicode = [];
  for (const charCode in properties.fallbackToUnicode) {
    if (properties.toUnicode.has(charCode)) {
      continue; // The font dictionary has a `ToUnicode` entry.
    }
    toUnicode[charCode] = properties.fallbackToUnicode[charCode];
  }
  if (toUnicode.length > 0) {
    properties.toUnicode.amend(toUnicode);
  }
}

class Glyph {
  constructor(
    originalCharCode,
    fontChar,
    unicode,
    accent,
    width,
    vmetric,
    operatorListId,
    isSpace,
    isInFont
  ) {
    this.originalCharCode = originalCharCode;
    this.fontChar = fontChar;
    this.unicode = unicode;
    this.accent = accent;
    this.width = width;
    this.vmetric = vmetric;
    this.operatorListId = operatorListId;
    this.isSpace = isSpace;
    this.isInFont = isInFont;
  }

  matchesForCache(
    originalCharCode,
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
      this.originalCharCode === originalCharCode &&
      this.fontChar === fontChar &&
      this.unicode === unicode &&
      this.accent === accent &&
      this.width === width &&
      this.vmetric === vmetric &&
      this.operatorListId === operatorListId &&
      this.isSpace === isSpace &&
      this.isInFont === isInFont
    );
  }
}

function int16(b0, b1) {
  return (b0 << 8) + b1;
}

function writeSignedInt16(bytes, index, value) {
  bytes[index + 1] = value;
  bytes[index] = value >>> 8;
}

function signedInt16(b0, b1) {
  const value = (b0 << 8) + b1;
  return value & (1 << 15) ? value - 0x10000 : value;
}

function int32(b0, b1, b2, b3) {
  return (b0 << 24) + (b1 << 16) + (b2 << 8) + b3;
}

function string16(value) {
  if (
    typeof PDFJSDev === "undefined" ||
    PDFJSDev.test("!PRODUCTION || TESTING")
  ) {
    assert(
      typeof value === "number" && Math.abs(value) < 2 ** 16,
      `string16: Unexpected input "${value}".`
    );
  }
  return String.fromCharCode((value >> 8) & 0xff, value & 0xff);
}

function safeString16(value) {
  if (
    typeof PDFJSDev === "undefined" ||
    PDFJSDev.test("!PRODUCTION || TESTING")
  ) {
    assert(
      typeof value === "number" && !Number.isNaN(value),
      `safeString16: Unexpected input "${value}".`
    );
  }
  // clamp value to the 16-bit int range
  if (value > 0x7fff) {
    value = 0x7fff;
  } else if (value < -0x8000) {
    value = -0x8000;
  }
  return String.fromCharCode((value >> 8) & 0xff, value & 0xff);
}

function isTrueTypeFile(file) {
  const header = file.peekBytes(4);
  return (
    readUint32(header, 0) === 0x00010000 || bytesToString(header) === "true"
  );
}

function isTrueTypeCollectionFile(file) {
  const header = file.peekBytes(4);
  return bytesToString(header) === "ttcf";
}

function isOpenTypeFile(file) {
  const header = file.peekBytes(4);
  return bytesToString(header) === "OTTO";
}

function isType1File(file) {
  const header = file.peekBytes(2);
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
  const toFontChar = [];
  let unicode;
  for (let i = 0, ii = encoding.length; i < ii; i++) {
    unicode = getUnicodeForGlyph(encoding[i], glyphsUnicodeMap);
    if (unicode !== -1) {
      toFontChar[i] = unicode;
    }
  }
  for (const charCode in differences) {
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
  const newMap = Object.create(null);
  const toFontChar = [];
  let privateUseAreaIndex = 0;
  let nextAvailableFontCharCode = PRIVATE_USE_AREAS[privateUseAreaIndex][0];
  let privateUseOffetEnd = PRIVATE_USE_AREAS[privateUseAreaIndex][1];
  for (let originalCharCode in charCodeToGlyphId) {
    originalCharCode |= 0;
    let glyphId = charCodeToGlyphId[originalCharCode];
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
    const fontCharCode = nextAvailableFontCharCode++;
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
  const codes = [];
  for (const charCode in glyphs) {
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
  const ranges = [];
  const length = codes.length;
  for (let n = 0; n < length; ) {
    const start = codes[n].fontCharCode;
    const codeIndices = [codes[n].glyphId];
    ++n;
    let end = start;
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
  const ranges = getRanges(glyphs, numGlyphs);
  const numTables = ranges[ranges.length - 1][1] > 0xffff ? 2 : 1;
  let cmap =
    "\x00\x00" + // version
    string16(numTables) + // numTables
    "\x00\x03" + // platformID
    "\x00\x01" + // encodingID
    string32(4 + numTables * 8); // start of the table record

  let i, ii, j, jj;
  for (i = ranges.length - 1; i >= 0; --i) {
    if (ranges[i][0] <= 0xffff) {
      break;
    }
  }
  const bmpLength = i + 1;

  if (ranges[i][0] < 0xffff && ranges[i][1] === 0xffff) {
    ranges[i][1] = 0xfffe;
  }
  const trailingRangesCount = ranges[i][1] < 0xffff ? 1 : 0;
  const segCount = bmpLength + trailingRangesCount;
  const searchParams = OpenTypeFileBuilder.getSearchParams(segCount, 2);

  // Fill up the 4 parallel arrays describing the segments.
  let startCount = "";
  let endCount = "";
  let idDeltas = "";
  let idRangeOffsets = "";
  let glyphsIds = "";
  let bias = 0;

  let range, start, end, codes;
  for (i = 0, ii = bmpLength; i < ii; i++) {
    range = ranges[i];
    start = range[0];
    end = range[1];
    startCount += string16(start);
    endCount += string16(end);
    codes = range[2];
    let contiguous = true;
    for (j = 1, jj = codes.length; j < jj; ++j) {
      if (codes[j] !== codes[j - 1] + 1) {
        contiguous = false;
        break;
      }
    }
    if (!contiguous) {
      const offset = (segCount - i) * 2 + bias * 2;
      bias += end - start + 1;

      idDeltas += string16(0);
      idRangeOffsets += string16(offset);

      for (j = 0, jj = codes.length; j < jj; ++j) {
        glyphsIds += string16(codes[j]);
      }
    } else {
      const startCode = codes[0];

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

  const format314 =
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

  let format31012 = "";
  let header31012 = "";
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
      let code = codes[0];
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

function validateOS2Table(os2, file) {
  file.pos = (file.start || 0) + os2.offset;
  const version = file.getUint16();
  // TODO verify all OS/2 tables fields, but currently we validate only those
  // that give us issues
  file.skip(60); // skipping type, misc sizes, panose, unicode ranges
  const selection = file.getUint16();
  if (version < 4 && selection & 0x0300) {
    return false;
  }
  const firstChar = file.getUint16();
  const lastChar = file.getUint16();
  if (firstChar > lastChar) {
    return false;
  }
  file.skip(6); // skipping sTypoAscender/Descender/LineGap
  const usWinAscent = file.getUint16();
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

  let ulUnicodeRange1 = 0;
  let ulUnicodeRange2 = 0;
  let ulUnicodeRange3 = 0;
  let ulUnicodeRange4 = 0;

  let firstCharIndex = null;
  let lastCharIndex = 0;

  if (charstrings) {
    for (let code in charstrings) {
      code |= 0;
      if (firstCharIndex > code || !firstCharIndex) {
        firstCharIndex = code;
      }
      if (lastCharIndex < code) {
        lastCharIndex = code;
      }

      const position = getUnicodeRangeFor(code);
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

  const bbox = properties.bbox || [0, 0, 0, 0];
  const unitsPerEm =
    override.unitsPerEm ||
    1 / (properties.fontMatrix || FONT_IDENTITY_MATRIX)[0];

  // if the font units differ to the PDF glyph space units
  // then scale up the values
  const scale = properties.ascentScaled
    ? 1.0
    : unitsPerEm / PDF_GLYPH_SPACE_UNITS;

  const typoAscent =
    override.ascent || Math.round(scale * (properties.ascent || bbox[3]));
  let typoDescent =
    override.descent || Math.round(scale * (properties.descent || bbox[1]));
  if (typoDescent > 0 && properties.descent > 0 && bbox[1] < 0) {
    typoDescent = -typoDescent; // fixing incorrect descent
  }
  const winAscent = override.yMax || typoAscent;
  const winDescent = -override.yMin || -typoDescent;

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
  const angle = Math.floor(properties.italicAngle * 2 ** 16);
  return (
    "\x00\x03\x00\x00" + // Version number
    string32(angle) + // italicAngle
    "\x00\x00" + // underlinePosition
    "\x00\x00" + // underlineThickness
    string32(properties.fixedPitch ? 1 : 0) + // isFixedPitch
    "\x00\x00\x00\x00" + // minMemType42
    "\x00\x00\x00\x00" + // maxMemType42
    "\x00\x00\x00\x00" + // minMemType1
    "\x00\x00\x00\x00"
  ); // maxMemType1
}

function createPostscriptName(name) {
  // See https://docs.microsoft.com/en-us/typography/opentype/spec/recom#name.
  return name.replace(/[^\x21-\x7E]|[[\](){}<>/%]/g, "").slice(0, 63);
}

function createNameTable(name, proto) {
  if (!proto) {
    proto = [[], []]; // no strings and unicode strings
  }

  const strings = [
    proto[0][0] || "Original licence", // 0.Copyright
    proto[0][1] || name, // 1.Font family
    proto[0][2] || "Unknown", // 2.Font subfamily (font weight)
    proto[0][3] || "uniqueID", // 3.Unique ID
    proto[0][4] || name, // 4.Full font name
    proto[0][5] || "Version 0.11", // 5.Version
    proto[0][6] || createPostscriptName(name), // 6.Postscript name
    proto[0][7] || "Unknown", // 7.Trademark
    proto[0][8] || "Unknown", // 8.Manufacturer
    proto[0][9] || "Unknown", // 9.Designer
  ];

  // Mac want 1-byte per character strings while Windows want
  // 2-bytes per character, so duplicate the names table
  const stringsUnicode = [];
  let i, ii, j, jj, str;
  for (i = 0, ii = strings.length; i < ii; i++) {
    str = proto[1][i] || strings[i];

    const strBufUnicode = [];
    for (j = 0, jj = str.length; j < jj; j++) {
      strBufUnicode.push(string16(str.charCodeAt(j)));
    }
    stringsUnicode.push(strBufUnicode.join(""));
  }

  const names = [strings, stringsUnicode];
  const platforms = ["\x00\x01", "\x00\x03"];
  const encodings = ["\x00\x00", "\x00\x01"];
  const languages = ["\x00\x00", "\x04\x09"];

  const namesRecordCount = strings.length * platforms.length;
  let nameTable =
    "\x00\x00" + // format
    string16(namesRecordCount) + // Number of names Record
    string16(namesRecordCount * 12 + 6); // Storage

  // Build the name records field
  let strOffset = 0;
  for (i = 0, ii = platforms.length; i < ii; i++) {
    const strs = names[i];
    for (j = 0, jj = strs.length; j < jj; j++) {
      str = strs[j];
      const nameRecord =
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

/**
 * 'Font' is the class the outside world should use, it encapsulate all the font
 * decoding logics whatever type it is (assuming the font type is supported).
 */
class Font {
  constructor(name, file, properties) {
    this.name = name;
    this.psName = null;
    this.mimetype = null;
    this.disableFontFace = false;

    this.loadedName = properties.loadedName;
    this.isType3Font = properties.isType3Font;
    this.missingFile = false;
    this.cssFontInfo = properties.cssFontInfo;

    this._charsCache = Object.create(null);
    this._glyphCache = Object.create(null);

    this.isSerifFont = !!(properties.flags & FontFlags.Serif);
    this.isSymbolicFont = !!(properties.flags & FontFlags.Symbolic);
    this.isMonospace = !!(properties.flags & FontFlags.FixedPitch);

    let type = properties.type;
    let subtype = properties.subtype;
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
    this.cMap = properties.cMap;
    this.capHeight = properties.capHeight / PDF_GLYPH_SPACE_UNITS;
    this.ascent = properties.ascent / PDF_GLYPH_SPACE_UNITS;
    this.descent = properties.descent / PDF_GLYPH_SPACE_UNITS;
    this.lineHeight = this.ascent - this.descent;
    this.fontMatrix = properties.fontMatrix;
    this.bbox = properties.bbox;
    this.defaultEncoding = properties.defaultEncoding;

    this.toUnicode = properties.toUnicode;
    this.toFontChar = [];

    if (properties.type === "Type3") {
      for (let charCode = 0; charCode < 256; charCode++) {
        this.toFontChar[charCode] =
          this.differences[charCode] || properties.defaultEncoding[charCode];
      }
      this.fontType = FontType.TYPE3;
      return;
    }

    this.cidEncoding = properties.cidEncoding;
    this.vertical = !!properties.vertical;
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
      this.fallbackToSystemFont(properties);
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

    let data;
    try {
      switch (type) {
        case "MMType1":
          info("MMType1 font (" + name + "), falling back to Type1.");
        /* falls through */
        case "Type1":
        case "CIDFontType0":
          this.mimetype = "font/opentype";

          const cff =
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
      this.fallbackToSystemFont(properties);
      return;
    }

    amendFallbackToUnicode(properties);
    this.data = data;
    this.fontType = getFontType(type, subtype, properties.isStandardFont);

    // Transfer some properties again that could change during font conversion
    this.fontMatrix = properties.fontMatrix;
    this.widths = properties.widths;
    this.defaultWidth = properties.defaultWidth;
    this.toUnicode = properties.toUnicode;
    this.seacMap = properties.seacMap;
  }

  get renderer() {
    const renderer = FontRendererFactory.create(this, SEAC_ANALYSIS_ENABLED);
    return shadow(this, "renderer", renderer);
  }

  exportData(extraProperties = false) {
    const exportDataProperties = extraProperties
      ? [...EXPORT_DATA_PROPERTIES, ...EXPORT_DATA_EXTRA_PROPERTIES]
      : EXPORT_DATA_PROPERTIES;

    const data = Object.create(null);
    let property, value;
    for (property of exportDataProperties) {
      value = this[property];
      // Ignore properties that haven't been explicitly set.
      if (value !== undefined) {
        data[property] = value;
      }
    }
    return data;
  }

  fallbackToSystemFont(properties) {
    this.missingFile = true;
    // The file data is not specified. Trying to fix the font name
    // to be used with the canvas.font.
    const name = this.name;
    const type = this.type;
    const subtype = this.subtype;
    let fontName = normalizeFontName(name);
    const stdFontMap = getStdFontMap(),
      nonStdFontMap = getNonStdFontMap();
    const isStandardFont = !!stdFontMap[fontName];
    const isMappedToStandardFont = !!(
      nonStdFontMap[fontName] && stdFontMap[nonStdFontMap[fontName]]
    );

    fontName = stdFontMap[fontName] || nonStdFontMap[fontName] || fontName;
    this.bold = fontName.search(/bold/gi) !== -1;
    this.italic =
      fontName.search(/oblique/gi) !== -1 || fontName.search(/italic/gi) !== -1;

    // Use 'name' instead of 'fontName' here because the original
    // name ArialBlack for example will be replaced by Helvetica.
    this.black = name.search(/Black/g) !== -1;

    // Use 'name' instead of 'fontName' here because the original
    // name ArialNarrow for example will be replaced by Helvetica.
    const isNarrow = name.search(/Narrow/g) !== -1;

    // if at least one width is present, remeasure all chars when exists
    this.remeasure =
      (!isStandardFont || isNarrow) && Object.keys(this.widths).length > 0;
    if (
      (isStandardFont || isMappedToStandardFont) &&
      type === "CIDFontType2" &&
      this.cidEncoding.startsWith("Identity-")
    ) {
      const GlyphMapForStandardFonts = getGlyphMapForStandardFonts(),
        cidToGidMap = properties.cidToGidMap;
      // Standard fonts might be embedded as CID font without glyph mapping.
      // Building one based on GlyphMapForStandardFonts.
      const map = [];
      for (const charCode in GlyphMapForStandardFonts) {
        map[+charCode] = GlyphMapForStandardFonts[charCode];
      }
      if (/Arial-?Black/i.test(name)) {
        const SupplementalGlyphMapForArialBlack =
          getSupplementalGlyphMapForArialBlack();
        for (const charCode in SupplementalGlyphMapForArialBlack) {
          map[+charCode] = SupplementalGlyphMapForArialBlack[charCode];
        }
      } else if (/Calibri/i.test(name)) {
        const SupplementalGlyphMapForCalibri =
          getSupplementalGlyphMapForCalibri();
        for (const charCode in SupplementalGlyphMapForCalibri) {
          map[+charCode] = SupplementalGlyphMapForCalibri[charCode];
        }
      }
      // Always update the glyph mapping with the `cidToGidMap` when it exists
      // (fixes issue12418_reduced.pdf).
      if (cidToGidMap) {
        for (const charCode in map) {
          const cid = map[charCode];
          if (cidToGidMap[cid] !== undefined) {
            map[+charCode] = cidToGidMap[cid];
          }
        }
      }

      const isIdentityUnicode = this.toUnicode instanceof IdentityToUnicodeMap;
      if (!isIdentityUnicode) {
        this.toUnicode.forEach(function (charCode, unicodeCharCode) {
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
          const glyphName =
            this.differences[charCode] || this.defaultEncoding[charCode];
          const unicode = getUnicodeForGlyph(glyphName, glyphsUnicodeMap);
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
          for (const charCode in GlyphMapForStandardFonts) {
            map[+charCode] = GlyphMapForStandardFonts[charCode];
          }
        }
      }
      this.toFontChar = map;
    }

    amendFallbackToUnicode(properties);
    this.loadedName = fontName.split("-")[0];
    this.fontType = getFontType(type, subtype, properties.isStandardFont);
  }

  checkAndRepair(name, font, properties) {
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
      tables.cmap = null;
      tables.head = null;
      tables.hhea = null;
      tables.hmtx = null;
      tables.maxp = null;
      tables.name = null;
      tables.post = null;

      for (let i = 0; i < numTables; i++) {
        const table = readTableEntry(file);
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
      const tag = file.getString(4);

      const checksum = file.getInt32() >>> 0;
      const offset = file.getInt32() >>> 0;
      const length = file.getInt32() >>> 0;

      // Read the table associated data
      const previousPosition = file.pos;
      file.pos = file.start ? file.start : 0;
      file.skip(offset);
      const data = file.getBytes(length);
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
        version: ttf.getString(4),
        numTables: ttf.getUint16(),
        searchRange: ttf.getUint16(),
        entrySelector: ttf.getUint16(),
        rangeShift: ttf.getUint16(),
      };
    }

    function readTrueTypeCollectionHeader(ttc) {
      const ttcTag = ttc.getString(4);
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
      const fontNameParts = fontName.split("+");
      let fallbackData;

      for (let i = 0; i < numFonts; i++) {
        ttc.pos = (ttc.start || 0) + offsetTable[i];
        const potentialHeader = readOpenTypeHeader(ttc);
        const potentialTables = readTables(ttc, potentialHeader.numTables);

        if (!potentialTables.name) {
          throw new FormatError(
            'TrueType Collection font must contain a "name" table.'
          );
        }
        const nameTable = readNameTable(potentialTables.name);

        for (let j = 0, jj = nameTable.length; j < jj; j++) {
          for (let k = 0, kk = nameTable[j].length; k < kk; k++) {
            const nameEntry =
              nameTable[j][k] && nameTable[j][k].replace(/\s/g, "");
            if (!nameEntry) {
              continue;
            }
            if (nameEntry === fontName) {
              return {
                header: potentialHeader,
                tables: potentialTables,
              };
            }
            if (fontNameParts.length < 2) {
              continue;
            }
            for (const part of fontNameParts) {
              if (nameEntry === part) {
                fallbackData = {
                  name: part,
                  header: potentialHeader,
                  tables: potentialTables,
                };
              }
            }
          }
        }
      }
      if (fallbackData) {
        warn(
          `TrueType Collection does not contain "${fontName}" font, ` +
            `falling back to "${fallbackData.name}" font instead.`
        );
        return {
          header: fallbackData.header,
          tables: fallbackData.tables,
        };
      }
      throw new FormatError(
        `TrueType Collection does not contain "${fontName}" font.`
      );
    }

    /**
     * Read the appropriate subtable from the cmap according to 9.6.6.4 from
     * PDF spec
     */
    function readCmapTable(cmap, file, isSymbolicFont, hasEncoding) {
      if (!cmap) {
        warn("No cmap table available.");
        return {
          platformId: -1,
          encodingId: -1,
          mappings: [],
          hasShortCmap: false,
        };
      }
      let segment;
      let start = (file.start ? file.start : 0) + cmap.offset;
      file.pos = start;

      file.skip(2); // version
      const numTables = file.getUint16();

      let potentialTable;
      let canBreak = false;
      // There's an order of preference in terms of which cmap subtable to
      // use:
      // - non-symbolic fonts the preference is a 3,1 table then a 1,0 table
      // - symbolic fonts the preference is a 3,0 table then a 1,0 table
      // The following takes advantage of the fact that the tables are sorted
      // to work.
      for (let i = 0; i < numTables; i++) {
        const platformId = file.getUint16();
        const encodingId = file.getUint16();
        const offset = file.getInt32() >>> 0;
        let useTable = false;

        // Sometimes there are multiple of the same type of table. Default
        // to choosing the first table and skip the rest.
        if (
          potentialTable &&
          potentialTable.platformId === platformId &&
          potentialTable.encodingId === encodingId
        ) {
          continue;
        }

        if (
          platformId === 0 &&
          (encodingId === /* Unicode Default */ 0 ||
            encodingId === /* Unicode 1.1 */ 1 ||
            encodingId === /* Unicode BMP */ 3)
        ) {
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

          let correctlySorted = true;
          if (i < numTables - 1) {
            const nextBytes = file.peekBytes(2),
              nextPlatformId = int16(nextBytes[0], nextBytes[1]);
            if (nextPlatformId < platformId) {
              correctlySorted = false;
            }
          }
          if (correctlySorted) {
            canBreak = true;
          }
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
        file.pos = start + potentialTable.offset;
      }
      if (!potentialTable || file.peekByte() === -1) {
        warn("Could not find a preferred cmap table.");
        return {
          platformId: -1,
          encodingId: -1,
          mappings: [],
          hasShortCmap: false,
        };
      }

      const format = file.getUint16();
      file.skip(2 + 2); // length + language

      let hasShortCmap = false;
      const mappings = [];
      let j, glyphId;

      // TODO(mack): refactor this cmap subtable reading logic out
      if (format === 0) {
        for (j = 0; j < 256; j++) {
          const index = file.getByte();
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
        const segCount = file.getUint16() >> 1;
        file.skip(6); // skipping range fields
        const segments = [];
        let segIndex;
        for (segIndex = 0; segIndex < segCount; segIndex++) {
          segments.push({ end: file.getUint16() });
        }
        file.skip(2);
        for (segIndex = 0; segIndex < segCount; segIndex++) {
          segments[segIndex].start = file.getUint16();
        }

        for (segIndex = 0; segIndex < segCount; segIndex++) {
          segments[segIndex].delta = file.getUint16();
        }

        let offsetsCount = 0,
          offsetIndex;
        for (segIndex = 0; segIndex < segCount; segIndex++) {
          segment = segments[segIndex];
          const rangeOffset = file.getUint16();
          if (!rangeOffset) {
            segment.offsetIndex = -1;
            continue;
          }

          offsetIndex = (rangeOffset >> 1) - (segCount - segIndex);
          segment.offsetIndex = offsetIndex;
          offsetsCount = Math.max(
            offsetsCount,
            offsetIndex + segment.end - segment.start + 1
          );
        }

        const offsets = [];
        for (j = 0; j < offsetsCount; j++) {
          offsets.push(file.getUint16());
        }

        for (segIndex = 0; segIndex < segCount; segIndex++) {
          segment = segments[segIndex];
          start = segment.start;
          const end = segment.end;
          const delta = segment.delta;
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
        const firstCode = file.getUint16();
        const entryCount = file.getUint16();

        for (j = 0; j < entryCount; j++) {
          glyphId = file.getUint16();
          const charCode = firstCode + j;

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
      mappings.sort(function (a, b) {
        return a.charCode - b.charCode;
      });
      for (let i = 1; i < mappings.length; i++) {
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
      file,
      header,
      metrics,
      headTable,
      numGlyphs,
      dupFirstEntry
    ) {
      if (!header) {
        if (metrics) {
          metrics.data = null;
        }
        return;
      }

      file.pos = (file.start ? file.start : 0) + header.offset;
      file.pos += 4; // version
      file.pos += 2; // ascent
      file.pos += 2; // descent
      file.pos += 2; // linegap
      file.pos += 2; // adv_width_max
      file.pos += 2; // min_sb1
      file.pos += 2; // min_sb2
      file.pos += 2; // max_extent
      file.pos += 2; // caret_slope_rise
      file.pos += 2; // caret_slope_run
      const caretOffset = file.getUint16();
      file.pos += 8; // reserved
      file.pos += 2; // format
      let numOfMetrics = file.getUint16();

      if (caretOffset !== 0) {
        const macStyle = int16(headTable.data[44], headTable.data[45]);
        if (!(macStyle & 2)) {
          // Suppress OTS warnings about the `caretOffset` in the hhea-table.
          header.data[22] = 0;
          header.data[23] = 0;
        }
      }

      if (numOfMetrics > numGlyphs) {
        info(
          `The numOfMetrics (${numOfMetrics}) should not be ` +
            `greater than the numGlyphs (${numGlyphs}).`
        );
        // Reduce numOfMetrics if it is greater than numGlyphs
        numOfMetrics = numGlyphs;
        header.data[34] = (numOfMetrics & 0xff00) >> 8;
        header.data[35] = numOfMetrics & 0x00ff;
      }

      const numOfSidebearings = numGlyphs - numOfMetrics;
      const numMissing =
        numOfSidebearings - ((metrics.length - numOfMetrics * 4) >> 1);

      if (numMissing > 0) {
        // For each missing glyph, we set both the width and lsb to 0 (zero).
        // Since we need to add two properties for each glyph, this explains
        // the use of |numMissing * 2| when initializing the typed array.
        const entries = new Uint8Array(metrics.length + numMissing * 2);
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
      const glyphProfile = {
        length: 0,
        sizeOfInstructions: 0,
      };
      if (sourceEnd - sourceStart <= 12) {
        // glyph with data less than 12 is invalid one
        return glyphProfile;
      }
      const glyf = source.subarray(sourceStart, sourceEnd);
      let contoursCount = signedInt16(glyf[0], glyf[1]);
      if (contoursCount < 0) {
        // OTS doesn't like contour count to be less than -1.
        contoursCount = -1;
        writeSignedInt16(glyf, 0, contoursCount);
        // complex glyph, writing as is
        dest.set(glyf, destStart);
        glyphProfile.length = glyf.length;
        return glyphProfile;
      }

      let i,
        j = 10,
        flagsCount = 0;
      for (i = 0; i < contoursCount; i++) {
        const endPoint = (glyf[j] << 8) | glyf[j + 1];
        flagsCount = endPoint + 1;
        j += 2;
      }
      // skipping instructions
      const instructionsStart = j;
      const instructionsLength = (glyf[j] << 8) | glyf[j + 1];
      glyphProfile.sizeOfInstructions = instructionsLength;
      j += 2 + instructionsLength;
      const instructionsEnd = j;
      // validating flags
      let coordinatesLength = 0;
      for (i = 0; i < flagsCount; i++) {
        const flag = glyf[j++];
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
          const repeat = glyf[j++];
          i += repeat;
          coordinatesLength += repeat * xyLength;
        }
      }
      // glyph without coordinates will be rejected
      if (coordinatesLength === 0) {
        return glyphProfile;
      }
      let glyphDataLength = j + coordinatesLength;
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
      const data = head.data;

      // Validate version:
      // Should always be 0x00010000
      const version = int32(data[0], data[1], data[2], data[3]);
      if (version >> 16 !== 1) {
        info("Attempting to fix invalid version in head table: " + version);
        data[0] = 0;
        data[1] = 1;
        data[2] = 0;
        data[3] = 0;
      }

      const indexToLocFormat = int16(data[50], data[51]);
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

        const numGlyphsPlusOne = numGlyphs + 1;
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
      let itemSize, itemDecode, itemEncode;
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
      const numGlyphsOut = dupFirstEntry ? numGlyphs + 1 : numGlyphs;
      const locaDataSize = itemSize * (1 + numGlyphsOut);
      // Resize loca table to account for duplicated glyph.
      const locaData = new Uint8Array(locaDataSize);
      locaData.set(loca.data.subarray(0, locaDataSize));
      loca.data = locaData;
      // removing the invalid glyphs
      const oldGlyfData = glyf.data;
      const oldGlyfDataLength = oldGlyfData.length;
      const newGlyfData = new Uint8Array(oldGlyfDataLength);

      // The spec says the offsets should be in ascending order, however
      // this is not true for some fonts or they use the offset of 0 to mark a
      // glyph as missing. OTS requires the offsets to be in order and not to
      // be zero, so we must sort and rebuild the loca table and potentially
      // re-arrange the glyf data.
      let i, j;
      const locaEntries = [];
      // There are numGlyphs + 1 loca table entries.
      for (i = 0, j = 0; i < numGlyphs + 1; i++, j += itemSize) {
        let offset = itemDecode(locaData, j);
        if (offset > oldGlyfDataLength) {
          offset = oldGlyfDataLength;
        }
        locaEntries.push({
          index: i,
          offset,
          endOffset: 0,
        });
      }
      locaEntries.sort((a, b) => {
        return a.offset - b.offset;
      });
      // Now the offsets are sorted, calculate the end offset of each glyph.
      // The last loca entry's endOffset is not calculated since it's the end
      // of the data and will be stored on the previous entry's endOffset.
      for (i = 0; i < numGlyphs; i++) {
        locaEntries[i].endOffset = locaEntries[i + 1].offset;
      }
      // Re-sort so glyphs aren't out of order.
      locaEntries.sort((a, b) => {
        return a.index - b.index;
      });

      const missingGlyphs = Object.create(null);
      let writeOffset = 0;
      itemEncode(locaData, 0, writeOffset);
      for (i = 0, j = itemSize; i < numGlyphs; i++, j += itemSize) {
        const glyphProfile = sanitizeGlyph(
          oldGlyfData,
          locaEntries[i].offset,
          locaEntries[i].endOffset,
          newGlyfData,
          writeOffset,
          hintsValid
        );
        const newLength = glyphProfile.length;
        if (newLength === 0) {
          missingGlyphs[i] = true;
        }
        if (glyphProfile.sizeOfInstructions > maxSizeOfInstructions) {
          maxSizeOfInstructions = glyphProfile.sizeOfInstructions;
        }
        writeOffset += newLength;
        itemEncode(locaData, j, writeOffset);
      }

      if (writeOffset === 0) {
        // glyf table cannot be empty -- redoing the glyf and loca tables
        // to have single glyph with one point
        const simpleGlyph = new Uint8Array([
          0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 49, 0,
        ]);
        for (i = 0, j = itemSize; i < numGlyphsOut; i++, j += itemSize) {
          itemEncode(locaData, j, simpleGlyph.length);
        }
        glyf.data = simpleGlyph;
      } else if (dupFirstEntry) {
        // Browsers will not display a glyph at position 0. Typically glyph 0
        // is notdef, but a number of fonts put a valid glyph there so it must
        // be duplicated and appended.
        const firstEntryLength = itemDecode(locaData, itemSize);
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

    function readPostScriptTable(post, propertiesObj, maxpNumGlyphs) {
      const start = (font.start ? font.start : 0) + post.offset;
      font.pos = start;

      const length = post.length,
        end = start + length;
      const version = font.getInt32();
      // skip rest to the tables
      font.skip(28);

      let glyphNames;
      let valid = true;
      let i;

      switch (version) {
        case 0x00010000:
          glyphNames = MacStandardGlyphOrdering;
          break;
        case 0x00020000:
          const numGlyphs = font.getUint16();
          if (numGlyphs !== maxpNumGlyphs) {
            valid = false;
            break;
          }
          const glyphNameIndexes = [];
          for (i = 0; i < numGlyphs; ++i) {
            const index = font.getUint16();
            if (index >= 32768) {
              valid = false;
              break;
            }
            glyphNameIndexes.push(index);
          }
          if (!valid) {
            break;
          }
          const customNames = [],
            strBuf = [];
          while (font.pos < end) {
            const stringLength = font.getByte();
            strBuf.length = stringLength;
            for (i = 0; i < stringLength; ++i) {
              strBuf[i] = String.fromCharCode(font.getByte());
            }
            customNames.push(strBuf.join(""));
          }
          glyphNames = [];
          for (i = 0; i < numGlyphs; ++i) {
            const j = glyphNameIndexes[i];
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
          if (propertiesObj.defaultEncoding) {
            glyphNames = propertiesObj.defaultEncoding;
          }
          break;
      }
      propertiesObj.glyphNames = glyphNames;
      return valid;
    }

    function readNameTable(nameTable) {
      const start = (font.start ? font.start : 0) + nameTable.offset;
      font.pos = start;

      const names = [[], []];
      const length = nameTable.length,
        end = start + length;
      const format = font.getUint16();
      const FORMAT_0_HEADER_LENGTH = 6;
      if (format !== 0 || length < FORMAT_0_HEADER_LENGTH) {
        // unsupported name table format or table "too" small
        return names;
      }
      const numRecords = font.getUint16();
      const stringsStart = font.getUint16();
      const records = [];
      const NAME_RECORD_LENGTH = 12;
      let i, ii;

      for (i = 0; i < numRecords && font.pos + NAME_RECORD_LENGTH <= end; i++) {
        const r = {
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
        const record = records[i];
        if (record.length <= 0) {
          continue; // Nothing to process, ignoring.
        }
        const pos = start + stringsStart + record.offset;
        if (pos + record.length > end) {
          continue; // outside of name table, ignoring
        }
        font.pos = pos;
        const nameIndex = record.name;
        if (record.encoding) {
          // unicode
          let str = "";
          for (let j = 0, jj = record.length; j < jj; j += 2) {
            str += String.fromCharCode(font.getUint16());
          }
          names[1][nameIndex] = str;
        } else {
          names[0][nameIndex] = font.getString(record.length);
        }
      }
      return names;
    }

    // prettier-ignore
    const TTOpsStackDeltas = [
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
      let data = table.data;
      let i = 0,
        j,
        n,
        b,
        funcId,
        pc,
        lastEndf = 0,
        lastDeff = 0;
      const stack = [];
      const callstack = [];
      const functionsCalled = [];
      let tooComplexToFollowFunctions = ttContext.tooComplexToFollowFunctions;
      let inFDEF = false,
        ifLevel = 0,
        inELSE = 0;
      for (let ii = data.length; i < ii; ) {
        const op = data[i++];
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
            ttContext.functionsStackDeltas[funcId] = stack.length - pc.stackTop;
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
            const offset = stack[stack.length - 1];
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
      const content = [data];
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
      for (let j = 0, jj = ttContext.functionsUsed.length; j < jj; j++) {
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
        let newLength = 0;
        let j, jj;
        for (j = 0, jj = content.length; j < jj; j++) {
          newLength += content[j].length;
        }
        newLength = (newLength + 3) & ~3;
        const result = new Uint8Array(newLength);
        let pos = 0;
        for (j = 0, jj = content.length; j < jj; j++) {
          result.set(content[j], pos);
          pos += content[j].length;
        }
        table.data = result;
        table.length = newLength;
      }
    }

    function sanitizeTTPrograms(fpgm, prep, cvt, maxFunctionDefs) {
      const ttContext = {
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
        const cvtData = new Uint8Array(cvt.length + 1);
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

    const isTrueType = !tables["CFF "];
    if (!isTrueType) {
      const isComposite =
        properties.composite &&
        ((properties.cidToGidMap || []).length > 0 ||
          !(properties.cMap instanceof IdentityCMap));
      // OpenType font (skip composite fonts with non-default glyph mapping).
      if (
        (header.version === "OTTO" && !isComposite) ||
        !tables.head ||
        !tables.hhea ||
        !tables.maxp ||
        !tables.post
      ) {
        // No major tables: throwing everything at `CFFFont`.
        cffFile = new Stream(tables["CFF "].data);
        cff = new CFFFont(cffFile, properties);

        adjustWidths(properties);

        return this.convert(name, cff, properties);
      }

      delete tables.glyf;
      delete tables.loca;
      delete tables.fpgm;
      delete tables.prep;
      delete tables["cvt "];
      this.isOpenType = true;
    } else {
      if (!tables.loca) {
        throw new FormatError('Required "loca" table is not found');
      }
      if (!tables.glyf) {
        warn('Required "glyf" table is not found -- trying to recover.');
        // Note: We use `sanitizeGlyphLocations` to add dummy glyf data below.
        tables.glyf = {
          tag: "glyf",
          data: new Uint8Array(0),
        };
      }
      this.isOpenType = false;
    }

    if (!tables.maxp) {
      throw new FormatError('Required "maxp" table is not found');
    }

    font.pos = (font.start || 0) + tables.maxp.offset;
    const version = font.getInt32();
    const numGlyphs = font.getUint16();

    if (
      properties.scaleFactors &&
      properties.scaleFactors.length === numGlyphs &&
      isTrueType
    ) {
      const { scaleFactors } = properties;
      const isGlyphLocationsLong = int16(
        tables.head.data[50],
        tables.head.data[51]
      );

      const glyphs = new GlyfTable({
        glyfTable: tables.glyf.data,
        isGlyphLocationsLong,
        locaTable: tables.loca.data,
        numGlyphs,
      });
      glyphs.scale(scaleFactors);

      const { glyf, loca, isLocationLong } = glyphs.write();
      tables.glyf.data = glyf;
      tables.loca.data = loca;

      if (isLocationLong !== !!isGlyphLocationsLong) {
        tables.head.data[50] = 0;
        tables.head.data[51] = isLocationLong ? 1 : 0;
      }

      const metrics = tables.hmtx.data;

      for (let i = 0; i < numGlyphs; i++) {
        const j = 4 * i;
        const advanceWidth = Math.round(
          scaleFactors[i] * int16(metrics[j], metrics[j + 1])
        );
        metrics[j] = (advanceWidth >> 8) & 0xff;
        metrics[j + 1] = advanceWidth & 0xff;
        const lsb = Math.round(
          scaleFactors[i] * signedInt16(metrics[j + 2], metrics[j + 3])
        );
        writeSignedInt16(metrics, j + 2, lsb);
      }
    }

    // Glyph 0 is duplicated and appended.
    let numGlyphsOut = numGlyphs + 1;
    let dupFirstEntry = true;
    if (numGlyphsOut > 0xffff) {
      dupFirstEntry = false;
      numGlyphsOut = numGlyphs;
      warn("Not enough space in glyfs to duplicate first glyph.");
    }
    let maxFunctionDefs = 0;
    let maxSizeOfInstructions = 0;
    if (version >= 0x00010000 && tables.maxp.length >= 22) {
      // maxZones can be invalid
      font.pos += 8;
      const maxZones = font.getUint16();
      if (maxZones > 2) {
        // reset to 2 if font has invalid maxZones
        tables.maxp.data[14] = 0;
        tables.maxp.data[15] = 2;
      }
      font.pos += 4;
      maxFunctionDefs = font.getUint16();
      font.pos += 4;
      maxSizeOfInstructions = font.getUint16();
    }

    tables.maxp.data[4] = numGlyphsOut >> 8;
    tables.maxp.data[5] = numGlyphsOut & 255;

    const hintsValid = sanitizeTTPrograms(
      tables.fpgm,
      tables.prep,
      tables["cvt "],
      maxFunctionDefs
    );
    if (!hintsValid) {
      delete tables.fpgm;
      delete tables.prep;
      delete tables["cvt "];
    }

    // Ensure the hmtx table contains the advance width and
    // sidebearings information for numGlyphs in the maxp table
    sanitizeMetrics(
      font,
      tables.hhea,
      tables.hmtx,
      tables.head,
      numGlyphsOut,
      dupFirstEntry
    );

    if (!tables.head) {
      throw new FormatError('Required "head" table is not found');
    }

    sanitizeHead(tables.head, numGlyphs, isTrueType ? tables.loca.length : 0);

    let missingGlyphs = Object.create(null);
    if (isTrueType) {
      const isGlyphLocationsLong = int16(
        tables.head.data[50],
        tables.head.data[51]
      );
      const glyphsInfo = sanitizeGlyphLocations(
        tables.loca,
        tables.glyf,
        numGlyphs,
        isGlyphLocationsLong,
        hintsValid,
        dupFirstEntry,
        maxSizeOfInstructions
      );
      missingGlyphs = glyphsInfo.missingGlyphs;

      // Some fonts have incorrect maxSizeOfInstructions values, so we use
      // the computed value instead.
      if (version >= 0x00010000 && tables.maxp.length >= 22) {
        tables.maxp.data[26] = glyphsInfo.maxSizeOfInstructions >> 8;
        tables.maxp.data[27] = glyphsInfo.maxSizeOfInstructions & 255;
      }
    }
    if (!tables.hhea) {
      throw new FormatError('Required "hhea" table is not found');
    }

    // Sanitizer reduces the glyph advanceWidth to the maxAdvanceWidth
    // Sometimes it's 0. That needs to be fixed
    if (tables.hhea.data[10] === 0 && tables.hhea.data[11] === 0) {
      tables.hhea.data[10] = 0xff;
      tables.hhea.data[11] = 0xff;
    }

    // Extract some more font properties from the OpenType head and
    // hhea tables; yMin and descent value are always negative.
    const metricsOverride = {
      unitsPerEm: int16(tables.head.data[18], tables.head.data[19]),
      yMax: int16(tables.head.data[42], tables.head.data[43]),
      yMin: signedInt16(tables.head.data[38], tables.head.data[39]),
      ascent: signedInt16(tables.hhea.data[4], tables.hhea.data[5]),
      descent: signedInt16(tables.hhea.data[6], tables.hhea.data[7]),
      lineGap: signedInt16(tables.hhea.data[8], tables.hhea.data[9]),
    };

    // PDF FontDescriptor metrics lie -- using data from actual font.
    this.ascent = metricsOverride.ascent / metricsOverride.unitsPerEm;
    this.descent = metricsOverride.descent / metricsOverride.unitsPerEm;
    this.lineGap = metricsOverride.lineGap / metricsOverride.unitsPerEm;
    this.lineHeight = this.ascent - this.descent + this.lineGap;

    // The 'post' table has glyphs names.
    if (tables.post) {
      readPostScriptTable(tables.post, properties, numGlyphs);
    }

    // The original 'post' table is not needed, replace it.
    tables.post = {
      tag: "post",
      data: createPostTable(properties),
    };

    const charCodeToGlyphId = [];

    // Helper function to try to skip mapping of empty glyphs.
    function hasGlyph(glyphId) {
      return !missingGlyphs[glyphId];
    }

    if (properties.composite) {
      const cidToGidMap = properties.cidToGidMap || [];
      const isCidToGidMapEmpty = cidToGidMap.length === 0;

      properties.cMap.forEach(function (charCode, cid) {
        if (cid > 0xffff) {
          throw new FormatError("Max size of CID is 65,535");
        }
        let glyphId = -1;
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
      const cmapTable = readCmapTable(
        tables.cmap,
        font,
        this.isSymbolicFont,
        properties.hasEncoding
      );
      const cmapPlatformId = cmapTable.platformId;
      const cmapEncodingId = cmapTable.encodingId;
      const cmapMappings = cmapTable.mappings;
      const cmapMappingsLength = cmapMappings.length;
      let baseEncoding = [];
      if (
        properties.hasEncoding &&
        (properties.baseEncodingName === "MacRomanEncoding" ||
          properties.baseEncodingName === "WinAnsiEncoding")
      ) {
        baseEncoding = getEncoding(properties.baseEncodingName);
      }

      // If the font has an encoding and is not symbolic then follow the
      // rules in section 9.6.6.4 of the spec on how to map 3,1 and 1,0
      // cmaps.
      if (
        properties.hasEncoding &&
        !this.isSymbolicFont &&
        ((cmapPlatformId === 3 && cmapEncodingId === 1) ||
          (cmapPlatformId === 1 && cmapEncodingId === 0))
      ) {
        const glyphsUnicodeMap = getGlyphsUnicode();
        for (let charCode = 0; charCode < 256; charCode++) {
          let glyphName;
          if (this.differences[charCode] !== undefined) {
            glyphName = this.differences[charCode];
          } else if (baseEncoding[charCode] !== "") {
            glyphName = baseEncoding[charCode];
          } else {
            glyphName = StandardEncoding[charCode];
          }
          if (!glyphName) {
            continue;
          }
          // Ensure that non-standard glyph names are resolved to valid ones.
          const standardGlyphName = recoverGlyphName(
            glyphName,
            glyphsUnicodeMap
          );

          let unicodeOrCharCode;
          if (cmapPlatformId === 3 && cmapEncodingId === 1) {
            unicodeOrCharCode = glyphsUnicodeMap[standardGlyphName];
          } else if (cmapPlatformId === 1 && cmapEncodingId === 0) {
            // TODO: the encoding needs to be updated with mac os table.
            unicodeOrCharCode = MacRomanEncoding.indexOf(standardGlyphName);
          }

          for (let i = 0; i < cmapMappingsLength; ++i) {
            if (cmapMappings[i].charCode !== unicodeOrCharCode) {
              continue;
            }
            charCodeToGlyphId[charCode] = cmapMappings[i].glyphId;
            break;
          }
        }
      } else if (cmapPlatformId === 0) {
        // Default Unicode semantics, use the charcodes as is.
        for (let i = 0; i < cmapMappingsLength; ++i) {
          charCodeToGlyphId[cmapMappings[i].charCode] = cmapMappings[i].glyphId;
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
          let charCode = cmapMappings[i].charCode;
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

      // Last, try to map any missing charcodes using the post table.
      if (
        properties.glyphNames &&
        (baseEncoding.length || this.differences.length)
      ) {
        for (let i = 0; i < 256; ++i) {
          if (charCodeToGlyphId[i] !== undefined) {
            continue;
          }
          const glyphName = this.differences[i] || baseEncoding[i];
          if (!glyphName) {
            continue;
          }
          const glyphId = properties.glyphNames.indexOf(glyphName);
          if (glyphId > 0 && hasGlyph(glyphId)) {
            charCodeToGlyphId[i] = glyphId;
          }
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

    // When `cssFontInfo` is set, the font is used to render text in the HTML
    // view (e.g. with Xfa) so nothing must be moved in the private use area.
    if (!properties.cssFontInfo) {
      // Converting glyphs and ids into font's cmap table
      const newMapping = adjustMapping(
        charCodeToGlyphId,
        hasGlyph,
        glyphZeroId
      );
      this.toFontChar = newMapping.toFontChar;
      tables.cmap = {
        tag: "cmap",
        data: createCmapTable(newMapping.charCodeToGlyphId, numGlyphsOut),
      };

      if (!tables["OS/2"] || !validateOS2Table(tables["OS/2"], font)) {
        tables["OS/2"] = {
          tag: "OS/2",
          data: createOS2Table(
            properties,
            newMapping.charCodeToGlyphId,
            metricsOverride
          ),
        };
      }
    }

    if (!isTrueType) {
      try {
        // Trying to repair CFF file
        cffFile = new Stream(tables["CFF "].data);
        const parser = new CFFParser(
          cffFile,
          properties,
          SEAC_ANALYSIS_ENABLED
        );
        cff = parser.parse();
        cff.duplicateFirstGlyph();
        const compiler = new CFFCompiler(cff);
        tables["CFF "].data = compiler.compile();
      } catch (e) {
        warn("Failed to compile font " + properties.loadedName);
      }
    }

    // Re-creating 'name' table
    if (!tables.name) {
      tables.name = {
        tag: "name",
        data: createNameTable(this.name),
      };
    } else {
      // ... using existing 'name' table as prototype
      const namePrototype = readNameTable(tables.name);
      tables.name.data = createNameTable(name, namePrototype);
      this.psName = namePrototype[0][6] || null;
    }

    const builder = new OpenTypeFileBuilder(header.version);
    for (const tableTag in tables) {
      builder.addTable(tableTag, tables[tableTag].data);
    }
    return builder.toArray();
  }

  convert(fontName, font, properties) {
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
    const mapping = font.getGlyphMapping(properties);
    let newMapping = null;
    let newCharCodeToGlyphId = mapping;

    // When `cssFontInfo` is set, the font is used to render text in the HTML
    // view (e.g. with Xfa) so nothing must be moved in the private use area.
    if (!properties.cssFontInfo) {
      newMapping = adjustMapping(
        mapping,
        font.hasGlyphId.bind(font),
        glyphZeroId
      );
      this.toFontChar = newMapping.toFontChar;
      newCharCodeToGlyphId = newMapping.charCodeToGlyphId;
    }
    const numGlyphs = font.numGlyphs;

    function getCharCodes(charCodeToGlyphId, glyphId) {
      let charCodes = null;
      for (const charCode in charCodeToGlyphId) {
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
      for (const charCode in charCodeToGlyphId) {
        if (glyphId === charCodeToGlyphId[charCode]) {
          return charCode | 0;
        }
      }
      newMapping.charCodeToGlyphId[newMapping.nextAvailableFontCharCode] =
        glyphId;
      return newMapping.nextAvailableFontCharCode++;
    }

    const seacs = font.seacs;
    if (newMapping && SEAC_ANALYSIS_ENABLED && seacs && seacs.length) {
      const matrix = properties.fontMatrix || FONT_IDENTITY_MATRIX;
      const charset = font.getCharset();
      const seacMap = Object.create(null);
      for (let glyphId in seacs) {
        glyphId |= 0;
        const seac = seacs[glyphId];
        const baseGlyphName = StandardEncoding[seac[2]];
        const accentGlyphName = StandardEncoding[seac[3]];
        const baseGlyphId = charset.indexOf(baseGlyphName);
        const accentGlyphId = charset.indexOf(accentGlyphName);
        if (baseGlyphId < 0 || accentGlyphId < 0) {
          continue;
        }
        const accentOffset = {
          x: seac[0] * matrix[0] + seac[1] * matrix[2] + matrix[4],
          y: seac[0] * matrix[1] + seac[1] * matrix[3] + matrix[5],
        };

        const charCodes = getCharCodes(mapping, glyphId);
        if (!charCodes) {
          // There's no point in mapping it if the char code was never mapped
          // to begin with.
          continue;
        }
        for (let i = 0, ii = charCodes.length; i < ii; i++) {
          const charCode = charCodes[i];
          // Find a fontCharCode that maps to the base and accent glyphs.
          // If one doesn't exists, create it.
          const charCodeToGlyphId = newMapping.charCodeToGlyphId;
          const baseFontCharCode = createCharCode(
            charCodeToGlyphId,
            baseGlyphId
          );
          const accentFontCharCode = createCharCode(
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

    const unitsPerEm = 1 / (properties.fontMatrix || FONT_IDENTITY_MATRIX)[0];

    const builder = new OpenTypeFileBuilder("\x4F\x54\x54\x4F");
    // PostScript Font Program
    builder.addTable("CFF ", font.data);
    // OS/2 and Windows Specific metrics
    builder.addTable("OS/2", createOS2Table(properties, newCharCodeToGlyphId));
    // Character to glyphs mapping
    builder.addTable("cmap", createCmapTable(newCharCodeToGlyphId, numGlyphs));
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
        const charstrings = font.charstrings;
        const cffWidths = font.cff ? font.cff.widths : null;
        let hmtx = "\x00\x00\x00\x00"; // Fake .notdef
        for (let i = 1, ii = numGlyphs; i < ii; i++) {
          let width = 0;
          if (charstrings) {
            const charstring = charstrings[i - 1];
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
  }

  get spaceWidth() {
    // trying to estimate space character width
    const possibleSpaceReplacements = ["space", "minus", "one", "i", "I"];
    let width;
    for (let i = 0, ii = possibleSpaceReplacements.length; i < ii; i++) {
      const glyphName = possibleSpaceReplacements[i];
      // if possible, getting width by glyph name
      if (glyphName in this.widths) {
        width = this.widths[glyphName];
        break;
      }
      const glyphsUnicodeMap = getGlyphsUnicode();
      const glyphUnicode = glyphsUnicodeMap[glyphName];
      // finding the charcode via unicodeToCID map
      let charcode = 0;
      if (this.composite && this.cMap.contains(glyphUnicode)) {
        charcode = this.cMap.lookup(glyphUnicode);
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
    return shadow(this, "spaceWidth", width);
  }

  /**
   * @private
   */
  _charToGlyph(charcode, isSpace = false) {
    let fontCharCode, width, operatorListId;

    let widthCode = charcode;
    if (this.cMap && this.cMap.contains(charcode)) {
      widthCode = this.cMap.lookup(charcode);
    }
    width = this.widths[widthCode];
    width = isNum(width) ? width : this.defaultWidth;
    const vmetric = this.vmetrics && this.vmetrics[widthCode];

    let unicode = this.toUnicode.get(charcode) || charcode;
    if (typeof unicode === "number") {
      unicode = String.fromCharCode(unicode);
    }

    let isInFont = this.toFontChar[charcode] !== undefined;
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

    let accent = null;
    if (this.seacMap && this.seacMap[charcode]) {
      isInFont = true;
      const seac = this.seacMap[charcode];
      fontCharCode = seac.baseFontCharCode;
      accent = {
        fontChar: String.fromCodePoint(seac.accentFontCharCode),
        offset: seac.accentOffset,
      };
    }

    let fontChar = "";
    if (typeof fontCharCode === "number") {
      if (fontCharCode <= 0x10ffff) {
        fontChar = String.fromCodePoint(fontCharCode);
      } else {
        warn(`charToGlyph - invalid fontCharCode: ${fontCharCode}`);
      }
    }

    let glyph = this._glyphCache[charcode];
    if (
      !glyph ||
      !glyph.matchesForCache(
        charcode,
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
        charcode,
        fontChar,
        unicode,
        accent,
        width,
        vmetric,
        operatorListId,
        isSpace,
        isInFont
      );
      this._glyphCache[charcode] = glyph;
    }
    return glyph;
  }

  charsToGlyphs(chars) {
    // If we translated this string before, just grab it from the cache.
    let glyphs = this._charsCache[chars];
    if (glyphs) {
      return glyphs;
    }
    glyphs = [];

    if (this.cMap) {
      // Composite fonts have multi-byte strings, convert the string from
      // single-byte to multi-byte.
      const c = Object.create(null),
        ii = chars.length;
      let i = 0;
      while (i < ii) {
        this.cMap.readCharCode(chars, i, c);
        const { charcode, length } = c;
        i += length;
        // Space is char with code 0x20 and length 1 in multiple-byte codes.
        const glyph = this._charToGlyph(
          charcode,
          length === 1 && chars.charCodeAt(i - 1) === 0x20
        );
        glyphs.push(glyph);
      }
    } else {
      for (let i = 0, ii = chars.length; i < ii; ++i) {
        const charcode = chars.charCodeAt(i);
        const glyph = this._charToGlyph(charcode, charcode === 0x20);
        glyphs.push(glyph);
      }
    }

    // Enter the translated string into the cache.
    return (this._charsCache[chars] = glyphs);
  }

  /**
   * Chars can have different sizes (depends on the encoding).
   * @param {String} a string encoded with font encoding.
   * @returns {Array<Array<number>>} the positions of each char in the string.
   */
  getCharPositions(chars) {
    // This function doesn't use a cache because
    // it's called only when saving or printing.
    const positions = [];

    if (this.cMap) {
      const c = Object.create(null);
      let i = 0;
      while (i < chars.length) {
        this.cMap.readCharCode(chars, i, c);
        const length = c.length;
        positions.push([i, i + length]);
        i += length;
      }
    } else {
      for (let i = 0, ii = chars.length; i < ii; ++i) {
        positions.push([i, i + 1]);
      }
    }

    return positions;
  }

  get glyphCacheValues() {
    return Object.values(this._glyphCache);
  }

  /**
   * Encode a js string using font encoding.
   * The resulting array contains an encoded string at even positions
   * (can be empty) and a non-encoded one at odd positions.
   * @param {String} a js string.
   * @returns {Array<String>} an array of encoded strings or non-encoded ones.
   */
  encodeString(str) {
    const buffers = [];
    const currentBuf = [];

    // buffers will contain: encoded, non-encoded, encoded, ...
    // currentBuf is pushed in buffers each time there is a change.
    // So when buffers.length is odd then the last string is an encoded one
    // and currentBuf contains non-encoded chars.
    const hasCurrentBufErrors = () => buffers.length % 2 === 1;

    for (let i = 0, ii = str.length; i < ii; i++) {
      const unicode = str.codePointAt(i);
      if (unicode > 0xd7ff && (unicode < 0xe000 || unicode > 0xfffd)) {
        // unicode is represented by two uint16
        i++;
      }
      if (this.toUnicode) {
        const char = String.fromCodePoint(unicode);
        const charCode = this.toUnicode.charCodeOf(char);
        if (charCode !== -1) {
          if (hasCurrentBufErrors()) {
            buffers.push(currentBuf.join(""));
            currentBuf.length = 0;
          }
          const charCodeLength = this.cMap
            ? this.cMap.getCharCodeLength(charCode)
            : 1;
          for (let j = charCodeLength - 1; j >= 0; j--) {
            currentBuf.push(String.fromCharCode((charCode >> (8 * j)) & 0xff));
          }
          continue;
        }
      }

      // unicode can't be encoded
      if (!hasCurrentBufErrors()) {
        buffers.push(currentBuf.join(""));
        currentBuf.length = 0;
      }
      currentBuf.push(String.fromCodePoint(unicode));
    }

    buffers.push(currentBuf.join(""));

    return buffers;
  }
}

class ErrorFont {
  constructor(error) {
    this.error = error;
    this.loadedName = "g_font_error";
    this.missingFile = true;
  }

  charsToGlyphs() {
    return [];
  }

  encodeString(chars) {
    return [chars];
  }

  exportData(extraProperties = false) {
    return { error: this.error };
  }
}

export { ErrorFont, Font };
