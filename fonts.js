/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

"use strict";

var isWorker = (typeof window == "undefined");

/**
 * Maximum file size of the font.
 */
var kMaxFontFileSize = 40000;

/**
 * Maximum time to wait for a font to be loaded by @font-face
 */
var kMaxWaitForFontFace = 1000;

/**
 * Useful for debugging when you want to certains operations depending on how
 * many fonts are loaded.
 */
var fontCount = 0;
var fontName  = "";

/**
 * If for some reason one want to debug without fonts activated, it just need
 * to turn this pref to true/false.
 */
var kDisableFonts = false;


/**
 * Hold a map of decoded fonts and of the standard fourteen Type1 fonts and
 * their acronyms.
 * TODO Add the standard fourteen Type1 fonts list by default
 *      http://cgit.freedesktop.org/poppler/poppler/tree/poppler/GfxFont.cc#n65
 */

var Fonts = (function () {
  var kScalePrecision = 40;
  var fonts = Object.create(null);  

  if (!isWorker) {
    var ctx = document.createElement("canvas").getContext("2d");
    ctx.scale(1 / kScalePrecision, 1);    
  }

  function Font(name, data, properties) {
    this.name = name;
    this.data = data;
    this.properties = properties;
    this.loading = true;
    this.charsCache = Object.create(null);
    this.sizes = [];
  }

  var current;
  var charsCache;
  var measureCache;

  return {
    registerFont: function fonts_registerFont(fontName, data, properties) {
      fonts[fontName] = new Font(fontName, data, properties);
    },
    blacklistFont: function fonts_blacklistFont(fontName) {
      registerFont(fontName, null, {});
      markLoaded(fontName);
    },
    lookup: function fonts_lookup(fontName) {
      return fonts[fontName];
    },
    setActive: function fonts_setActive(fontName, size) {
      current = fonts[fontName];
      charsCache = current.charsCache;
      var sizes = current.sizes;
      if (!(measureCache = sizes[size]))
        measureCache = sizes[size] = Object.create(null);
      ctx.font = (size * kScalePrecision) + 'px "' + fontName + '"';
    },
    charsToUnicode: function fonts_chars2Unicode(chars) {
      if (!charsCache)
        return chars;

      // if we translated this string before, just grab it from the cache
      var str = charsCache[chars];
      if (str)
        return str;

      // translate the string using the font's encoding
      var encoding = current.properties.encoding;
      if (!encoding)
        return chars;

      str = "";
      for (var i = 0; i < chars.length; ++i) {
        var charcode = chars.charCodeAt(i);
        var unicode = encoding[charcode];

        // Check if the glyph has already been converted
        if (!IsNum(unicode))
          unicode = encoding[unicode] = GlyphsUnicode[unicode.name];

        // Handle surrogate pairs
        if (unicode > 0xFFFF) {
          str += String.fromCharCode(unicode & 0xFFFF);
          unicode >>= 16;
        }
        str += String.fromCharCode(unicode);
      }

      // Enter the translated string into the cache
      return charsCache[chars] = str;
    },
    measureText: function fonts_measureText(text) {
      var width;
      if (measureCache && (width = measureCache[text]))
        return width;
      width = ctx.measureText(text).width / kScalePrecision;
      if (measureCache)
        measureCache[text] = width;
      return width;
    }
  }
})();

var FontLoader = {
  bind: function(fonts) {
    var ready = true;

    for (var i = 0; i < fonts.length; i++) {
      var font = fonts[i];
      if (Fonts.lookup(font.name)) {
        ready = ready && !Fonts.lookup(font.name).loading;
        continue;
      }

      ready = false;

      var obj = new Font(font.name, font.file, font.properties);

      var str = "";
      var data = Fonts.lookup(font.name).data;
      var length = data.length;
      for (var j = 0; j < length; j++)
        str += String.fromCharCode(data[j]);

      isWorker ? obj.bindWorker(str) : obj.bindDOM(str);
    }

    return ready;
  }
};

var UnicodeRanges = [
  { "begin": 0x0000, "end": 0x007F }, // Basic Latin
  { "begin": 0x0080, "end": 0x00FF }, // Latin-1 Supplement
  { "begin": 0x0100, "end": 0x017F }, // Latin Extended-A
  { "begin": 0x0180, "end": 0x024F }, // Latin Extended-B
  { "begin": 0x0250, "end": 0x02AF }, // IPA Extensions
  { "begin": 0x02B0, "end": 0x02FF }, // Spacing Modifier Letters
  { "begin": 0x0300, "end": 0x036F }, // Combining Diacritical Marks
  { "begin": 0x0370, "end": 0x03FF }, // Greek and Coptic
  { "begin": 0x2C80, "end": 0x2CFF }, // Coptic
  { "begin": 0x0400, "end": 0x04FF }, // Cyrillic
  { "begin": 0x0530, "end": 0x058F }, // Armenian
  { "begin": 0x0590, "end": 0x05FF }, // Hebrew
  { "begin": 0xA500, "end": 0xA63F }, // Vai
  { "begin": 0x0600, "end": 0x06FF }, // Arabic
  { "begin": 0x07C0, "end": 0x07FF }, // NKo
  { "begin": 0x0900, "end": 0x097F }, // Devanagari
  { "begin": 0x0980, "end": 0x09FF }, // Bengali
  { "begin": 0x0A00, "end": 0x0A7F }, // Gurmukhi
  { "begin": 0x0A80, "end": 0x0AFF }, // Gujarati
  { "begin": 0x0B00, "end": 0x0B7F }, // Oriya
  { "begin": 0x0B80, "end": 0x0BFF }, // Tamil
  { "begin": 0x0C00, "end": 0x0C7F }, // Telugu
  { "begin": 0x0C80, "end": 0x0CFF }, // Kannada
  { "begin": 0x0D00, "end": 0x0D7F }, // Malayalam
  { "begin": 0x0E00, "end": 0x0E7F }, // Thai
  { "begin": 0x0E80, "end": 0x0EFF }, // Lao
  { "begin": 0x10A0, "end": 0x10FF }, // Georgian
  { "begin": 0x1B00, "end": 0x1B7F }, // Balinese
  { "begin": 0x1100, "end": 0x11FF }, // Hangul Jamo
  { "begin": 0x1E00, "end": 0x1EFF }, // Latin Extended Additional
  { "begin": 0x1F00, "end": 0x1FFF }, // Greek Extended
  { "begin": 0x2000, "end": 0x206F }, // General Punctuation
  { "begin": 0x2070, "end": 0x209F }, // Superscripts And Subscripts
  { "begin": 0x20A0, "end": 0x20CF }, // Currency Symbol
  { "begin": 0x20D0, "end": 0x20FF }, // Combining Diacritical Marks For Symbols
  { "begin": 0x2100, "end": 0x214F }, // Letterlike Symbols
  { "begin": 0x2150, "end": 0x218F }, // Number Forms
  { "begin": 0x2190, "end": 0x21FF }, // Arrows
  { "begin": 0x2200, "end": 0x22FF }, // Mathematical Operators
  { "begin": 0x2300, "end": 0x23FF }, // Miscellaneous Technical
  { "begin": 0x2400, "end": 0x243F }, // Control Pictures
  { "begin": 0x2440, "end": 0x245F }, // Optical Character Recognition
  { "begin": 0x2460, "end": 0x24FF }, // Enclosed Alphanumerics
  { "begin": 0x2500, "end": 0x257F }, // Box Drawing
  { "begin": 0x2580, "end": 0x259F }, // Block Elements
  { "begin": 0x25A0, "end": 0x25FF }, // Geometric Shapes
  { "begin": 0x2600, "end": 0x26FF }, // Miscellaneous Symbols
  { "begin": 0x2700, "end": 0x27BF }, // Dingbats
  { "begin": 0x3000, "end": 0x303F }, // CJK Symbols And Punctuation
  { "begin": 0x3040, "end": 0x309F }, // Hiragana
  { "begin": 0x30A0, "end": 0x30FF }, // Katakana
  { "begin": 0x3100, "end": 0x312F }, // Bopomofo
  { "begin": 0x3130, "end": 0x318F }, // Hangul Compatibility Jamo
  { "begin": 0xA840, "end": 0xA87F }, // Phags-pa
  { "begin": 0x3200, "end": 0x32FF }, // Enclosed CJK Letters And Months
  { "begin": 0x3300, "end": 0x33FF }, // CJK Compatibility
  { "begin": 0xAC00, "end": 0xD7AF }, // Hangul Syllables
  { "begin": 0xD800, "end": 0xDFFF }, // Non-Plane 0 *
  { "begin": 0x10900, "end": 0x1091F }, // Phoenicia
  { "begin": 0x4E00, "end": 0x9FFF }, // CJK Unified Ideographs
  { "begin": 0xE000, "end": 0xF8FF }, // Private Use Area (plane 0)
  { "begin": 0x31C0, "end": 0x31EF }, // CJK Strokes
  { "begin": 0xFB00, "end": 0xFB4F }, // Alphabetic Presentation Forms
  { "begin": 0xFB50, "end": 0xFDFF }, // Arabic Presentation Forms-A
  { "begin": 0xFE20, "end": 0xFE2F }, // Combining Half Marks
  { "begin": 0xFE10, "end": 0xFE1F }, // Vertical Forms
  { "begin": 0xFE50, "end": 0xFE6F }, // Small Form Variants
  { "begin": 0xFE70, "end": 0xFEFF }, // Arabic Presentation Forms-B
  { "begin": 0xFF00, "end": 0xFFEF }, // Halfwidth And Fullwidth Forms
  { "begin": 0xFFF0, "end": 0xFFFF }, // Specials
  { "begin": 0x0F00, "end": 0x0FFF }, // Tibetan
  { "begin": 0x0700, "end": 0x074F }, // Syriac
  { "begin": 0x0780, "end": 0x07BF }, // Thaana
  { "begin": 0x0D80, "end": 0x0DFF }, // Sinhala
  { "begin": 0x1000, "end": 0x109F }, // Myanmar
  { "begin": 0x1200, "end": 0x137F }, // Ethiopic
  { "begin": 0x13A0, "end": 0x13FF }, // Cherokee
  { "begin": 0x1400, "end": 0x167F }, // Unified Canadian Aboriginal Syllabics
  { "begin": 0x1680, "end": 0x169F }, // Ogham
  { "begin": 0x16A0, "end": 0x16FF }, // Runic
  { "begin": 0x1780, "end": 0x17FF }, // Khmer
  { "begin": 0x1800, "end": 0x18AF }, // Mongolian
  { "begin": 0x2800, "end": 0x28FF }, // Braille Patterns
  { "begin": 0xA000, "end": 0xA48F }, // Yi Syllables
  { "begin": 0x1700, "end": 0x171F }, // Tagalog
  { "begin": 0x10300, "end": 0x1032F }, // Old Italic
  { "begin": 0x10330, "end": 0x1034F }, // Gothic
  { "begin": 0x10400, "end": 0x1044F }, // Deseret
  { "begin": 0x1D000, "end": 0x1D0FF }, // Byzantine Musical Symbols
  { "begin": 0x1D400, "end": 0x1D7FF }, // Mathematical Alphanumeric Symbols
  { "begin": 0xFF000, "end": 0xFFFFD }, // Private Use (plane 15)
  { "begin": 0xFE00, "end": 0xFE0F }, // Variation Selectors
  { "begin": 0xE0000, "end": 0xE007F }, // Tags
  { "begin": 0x1900, "end": 0x194F }, // Limbu
  { "begin": 0x1950, "end": 0x197F }, // Tai Le
  { "begin": 0x1980, "end": 0x19DF }, // New Tai Lue
  { "begin": 0x1A00, "end": 0x1A1F }, // Buginese
  { "begin": 0x2C00, "end": 0x2C5F }, // Glagolitic
  { "begin": 0x2D30, "end": 0x2D7F }, // Tifinagh
  { "begin": 0x4DC0, "end": 0x4DFF }, // Yijing Hexagram Symbols
  { "begin": 0xA800, "end": 0xA82F }, // Syloti Nagri
  { "begin": 0x10000, "end": 0x1007F }, // Linear B Syllabary
  { "begin": 0x10140, "end": 0x1018F }, // Ancient Greek Numbers
  { "begin": 0x10380, "end": 0x1039F }, // Ugaritic
  { "begin": 0x103A0, "end": 0x103DF }, // Old Persian
  { "begin": 0x10450, "end": 0x1047F }, // Shavian
  { "begin": 0x10480, "end": 0x104AF }, // Osmanya
  { "begin": 0x10800, "end": 0x1083F }, // Cypriot Syllabary
  { "begin": 0x10A00, "end": 0x10A5F }, // Kharoshthi
  { "begin": 0x1D300, "end": 0x1D35F }, // Tai Xuan Jing Symbols
  { "begin": 0x12000, "end": 0x123FF }, // Cuneiform
  { "begin": 0x1D360, "end": 0x1D37F }, // Counting Rod Numerals
  { "begin": 0x1B80, "end": 0x1BBF }, // Sundanese
  { "begin": 0x1C00, "end": 0x1C4F }, // Lepcha
  { "begin": 0x1C50, "end": 0x1C7F }, // Ol Chiki
  { "begin": 0xA880, "end": 0xA8DF }, // Saurashtra
  { "begin": 0xA900, "end": 0xA92F }, // Kayah Li
  { "begin": 0xA930, "end": 0xA95F }, // Rejang
  { "begin": 0xAA00, "end": 0xAA5F }, // Cham
  { "begin": 0x10190, "end": 0x101CF }, // Ancient Symbols
  { "begin": 0x101D0, "end": 0x101FF }, // Phaistos Disc
  { "begin": 0x102A0, "end": 0x102DF }, // Carian
  { "begin": 0x1F030, "end": 0x1F09F }  // Domino Tiles
];

function getUnicodeRangeFor(value) {
  for (var i = 0; i < UnicodeRanges.length; i++) {
    var range = UnicodeRanges[i];
    if (value >= range.begin && value < range.end)
      return i;
  }
  return -1;
};

/**
 * 'Font' is the class the outside world should use, it encapsulate all the font
 * decoding logics whatever type it is (assuming the font type is supported).
 *
 * For example to read a Type1 font and to attach it to the document:
 *   var type1Font = new Font("MyFontName", binaryFile, propertiesObject);
 *   type1Font.bind();
 */
var Font = (function () {
  var constructor = function font_constructor(name, file, properties) {
    this.name = name;
    this.encoding = properties.encoding;

    // If the font has already been decoded simply return it
    if (Fonts.lookup(name)) {
      this.font = Fonts.lookup(name).data;
      return;
    }
    fontCount++;
    fontName = name;

    // If the font is to be ignored, register it like an already loaded font
    // to avoid the cost of waiting for it be be loaded by the platform.
    if (properties.ignore || kDisableFonts) {
      Fonts.blacklistFont(name);
      return;
    }

    var data;
    switch (properties.type) {
      case "Type1":
        var cff = new CFF(name, file, properties);
        this.mimetype = "font/opentype";

        // Wrap the CFF data inside an OTF font file
        data = this.convert(name, cff, properties);
        break;

      case "TrueType":
        this.mimetype = "font/opentype";

        // Repair the TrueType file if it is can be damaged in the point of
        // view of the sanitizer
        data = this.checkAndRepair(name, file, properties);
        break;

      default:
        warn("Font " + properties.type + " is not supported");
        break;
    }
    this.data = data;
    Fonts.registerFont(name, data, properties);
  };

  function stringToArray(str) {
    var array = [];
    for (var i = 0; i < str.length; ++i)
      array[i] = str.charCodeAt(i);

    return array;
  };

  function string16(value) {
    return String.fromCharCode((value >> 8) & 0xff) +
           String.fromCharCode(value & 0xff);
  };

  function string32(value) {
    return String.fromCharCode((value >> 24) & 0xff) +
           String.fromCharCode((value >> 16) & 0xff) +
           String.fromCharCode((value >> 8) & 0xff) +
           String.fromCharCode(value & 0xff);
  };

  function createOpenTypeHeader(sfnt, file, offsets, numTables) {
    // sfnt version (4 bytes)
    var header = sfnt;

    // numTables (2 bytes)
    header += string16(numTables);

    // searchRange (2 bytes)
    var tablesMaxPower2 = FontsUtils.getMaxPower2(numTables);
    var searchRange = tablesMaxPower2 * 16;
    header += string16(searchRange);

    // entrySelector (2 bytes)
    header += string16(Math.log(tablesMaxPower2) / Math.log(2));

    // rangeShift (2 bytes)
    header += string16(numTables * 16 - searchRange);

    file.set(stringToArray(header), offsets.currentOffset);
    offsets.currentOffset += header.length;
    offsets.virtualOffset += header.length;
  };

  function createTableEntry(file, offsets, tag, data) {
    // offset
    var offset = offsets.virtualOffset;

    // length
    var length = data.length;
	
    // Per spec tables must be 4-bytes align so add padding as needed
    while (data.length & 3)
      data.push(0x00);

    while (offsets.virtualOffset & 3)
      offsets.virtualOffset++;

    // checksum
    var checksum = 0;
    for (var i = 0; i < length; i+=4)
      checksum += FontsUtils.bytesToInteger([data[i], data[i+1], data[i+2], data[i+3]]);

    var tableEntry = tag + string32(checksum) + string32(offset) + string32(length);
    tableEntry = stringToArray(tableEntry);
    file.set(tableEntry, offsets.currentOffset);

    offsets.currentOffset += tableEntry.length;
    offsets.virtualOffset += data.length;
  };

  function getRanges(glyphs) {
    // Array.sort() sorts by characters, not numerically, so convert to an
    // array of characters.
    var codes = [];
    var length = glyphs.length;
    for (var n = 0; n < length; ++n)
      codes.push(String.fromCharCode(glyphs[n].unicode))
    codes.sort();

    // Split the sorted codes into ranges.
    var ranges = [];
    for (var n = 0; n < length; ) {
      var start = codes[n++].charCodeAt(0);
      var end = start;
      while (n < length && end + 1 == codes[n].charCodeAt(0)) {
        ++end;
        ++n;
      }
      ranges.push([start, end]);
    }
    return ranges;
  };

  function createCMapTable(glyphs) {
    glyphs.push({ unicode: 0x0000 });
    var ranges = getRanges(glyphs);

    var headerSize = (12 * 2 + (ranges.length * 4 * 2));
    var segCount = ranges.length + 1;
    var segCount2 = segCount * 2;
    var searchRange = FontsUtils.getMaxPower2(segCount) * 2;
    var searchEntry = Math.log(segCount) / Math.log(2);
    var rangeShift = 2 * segCount - searchRange;

    var cmap = "\x00\x00" + // version
               "\x00\x01" + // numTables
               "\x00\x03" + // platformID
               "\x00\x01" + // encodingID
               "\x00\x00\x00\x0C" + // start of the table record
               "\x00\x04" + // format
               string16(headerSize) + // length
               "\x00\x00" + // languages
               string16(segCount2) +
               string16(searchRange) +
               string16(searchEntry) +
               string16(rangeShift);

    // Fill up the 4 parallel arrays describing the segments.
    var startCount = "";
    var endCount = "";
    var idDeltas = "";
    var idRangeOffsets = "";
    var glyphsIds = "";
    var bias = 0;
    for (var i = 0; i < segCount - 1; i++) {
      var range = ranges[i];
      var start = range[0];
      var end = range[1];
      var delta = (((start - 1) - bias) ^ 0xffff);
      bias += (end - start + 1);

      startCount += string16(start);
      endCount += string16(end);
      idDeltas += string16(delta);
	  idRangeOffsets += string16(0);

      for (var j = 0; j < range.length; j++)
        glyphsIds += String.fromCharCode(range[j]);
    }

    startCount += "\xFF\xFF";
    endCount += "\xFF\xFF";
    idDeltas += "\x00\x01";
    idRangeOffsets += "\x00\x00";

    return stringToArray(cmap + endCount + "\x00\x00" + startCount +
                         idDeltas + idRangeOffsets + glyphsIds);
  };

  function createOS2Table(properties) {
    var ulUnicodeRange1 = 0;
    var ulUnicodeRange2 = 0;
    var ulUnicodeRange3 = 0;
    var ulUnicodeRange4 = 0;

	var charset = properties.charset;
    if (charset && charset.length) {
	    var firstCharIndex = null;
	    var lastCharIndex = 0;

      for (var i = 1; i < charset.length; i++) {
	      var code = GlyphsUnicode[charset[i]];
		    if (firstCharIndex > code || !firstCharIndex)
		      firstCharIndex = code;
		    if (lastCharIndex < code)
		      lastCharIndex = code;

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
          error("Unicode ranges Bits > 123 are reserved for internal usage");
        }
      }
    }

    return "\x00\x03" + // version
           "\x02\x24" + // xAvgCharWidth
           "\x01\xF4" + // usWeightClass
           "\x00\x05" + // usWidthClass
           "\x00\x02" + // fstype
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
           "\x00\x00\x06" + String.fromCharCode(properties.fixedPitch ? 0x09 : 0x00) +
           "\x00\x00\x00\x00\x00\x00" + // Panose
           string32(ulUnicodeRange1) + // ulUnicodeRange1 (Bits 0-31)
           string32(ulUnicodeRange2) + // ulUnicodeRange2 (Bits 32-63)
           string32(ulUnicodeRange3) + // ulUnicodeRange3 (Bits 64-95)
           string32(ulUnicodeRange4) + // ulUnicodeRange4 (Bits 96-127)
           "\x2A\x32\x31\x2A" + // achVendID
           string16(properties.italicAngle ? 1 : 0) + // fsSelection
           string16(firstCharIndex || properties.firstChar) + // usFirstCharIndex
           string16(lastCharIndex || properties.lastChar) +  // usLastCharIndex
           string16(properties.ascent) + // sTypoAscender
           string16(properties.descent) + // sTypoDescender
           "\x00\x64" + // sTypoLineGap (7%-10% of the unitsPerEM value)
           string16(properties.ascent)  + // usWinAscent
           string16(-properties.descent) + // usWinDescent
           "\x00\x00\x00\x00" + // ulCodePageRange1 (Bits 0-31)
           "\x00\x00\x00\x00" + // ulCodePageRange2 (Bits 32-63)
           string16(properties.xHeight)   + // sxHeight
           string16(properties.capHeight) + // sCapHeight
           string16(0) + // usDefaultChar
           string16(firstCharIndex || properties.firstChar) + // usBreakChar
           "\x00\x03";  // usMaxContext
  };

  function createPostTable(properties) {
    var angle = Math.floor(properties.italicAngle * (Math.pow(2, 16)));
    return "\x00\x03\x00\x00" + // Version number
           string32(angle)    + // italicAngle
           "\x00\x00"         + // underlinePosition
           "\x00\x00"         + // underlineThickness
           string32(properties.fixedPitch) + // isFixedPitch
           "\x00\x00\x00\x00" + // minMemType42
           "\x00\x00\x00\x00" + // maxMemType42
           "\x00\x00\x00\x00" + // minMemType1
           "\x00\x00\x00\x00";  // maxMemType1
  };

  constructor.prototype = {
    name: null,
    font: null,
    mimetype: null,
    encoding: null,

    checkAndRepair: function font_checkAndRepair(name, font, properties) {
      function readTableEntry(file) {
        // tag
        var tag = file.getBytes(4);
        tag = String.fromCharCode(tag[0]) +
              String.fromCharCode(tag[1]) +
              String.fromCharCode(tag[2]) +
              String.fromCharCode(tag[3]);

        var checksum = FontsUtils.bytesToInteger(file.getBytes(4));
        var offset = FontsUtils.bytesToInteger(file.getBytes(4));
        var length = FontsUtils.bytesToInteger(file.getBytes(4));

        // Read the table associated data
        var previousPosition = file.pos;
        file.pos = file.start ? file.start : 0;
        file.skip(offset);
        var data = file.getBytes(length);
        file.pos = previousPosition;

        return {
          tag: tag,
          checksum: checksum,
          length: offset,
          offset: length,
          data: data
        }
      };

      function readOpenTypeHeader(ttf) {
        return {
          version: ttf.getBytes(4),
          numTables: FontsUtils.bytesToInteger(ttf.getBytes(2)),
          searchRange: FontsUtils.bytesToInteger(ttf.getBytes(2)),
          entrySelector: FontsUtils.bytesToInteger(ttf.getBytes(2)),
          rangeShift: FontsUtils.bytesToInteger(ttf.getBytes(2))
        }
      };

      function replaceCMapTable(cmap, font, properties) {
        var version = FontsUtils.bytesToInteger(font.getBytes(2));
        var numTables = FontsUtils.bytesToInteger(font.getBytes(2));

        for (var i = 0; i < numTables; i++) {
          var platformID = FontsUtils.bytesToInteger(font.getBytes(2));
          var encodingID = FontsUtils.bytesToInteger(font.getBytes(2));
          var offset = FontsUtils.bytesToInteger(font.getBytes(4));
          var format = FontsUtils.bytesToInteger(font.getBytes(2));
          var length = FontsUtils.bytesToInteger(font.getBytes(2));
          var language = FontsUtils.bytesToInteger(font.getBytes(2));

          if ((format == 0 && numTables == 1) ||
              (format == 6 && numTables == 1 && !properties.encoding.empty)) {
            // Format 0 alone is not allowed by the sanitizer so let's rewrite
            // that to a 3-1-4 Unicode BMP table
            TODO("Use an other source of informations than charset here, it is not reliable");
            var charset = properties.charset;
            var glyphs = [];
            for (var j = 0; j < charset.length; j++) {
              glyphs.push({
                unicode: GlyphsUnicode[charset[j]] || 0
              });
            }

            cmap.data = createCMapTable(glyphs);
          } else if (format == 6 && numTables == 1) {
            // Format 6 is a 2-bytes dense mapping, which means the font data
            // lives glue together even if they are pretty far in the unicode
            // table. (This looks weird, so I can have missed something), this
            // works on Linux but seems to fails on Mac so let's rewrite the
            // cmap table to a 3-1-4 style
            var firstCode = FontsUtils.bytesToInteger(font.getBytes(2));
            var entryCount = FontsUtils.bytesToInteger(font.getBytes(2));

            var glyphs = [];
            var min = 0xffff, max = 0;
            for (var j = 0; j < entryCount; j++) {
              var charcode = FontsUtils.bytesToInteger(font.getBytes(2));
              glyphs.push(charcode);

              if (charcode < min)
                min = charcode;
              if (charcode > max)
                max = charcode;
            }

            // Since Format 6 is a dense array, check for gaps
            for (var j = min; j < max; j++) {
              if (glyphs.indexOf(j) == -1)
                glyphs.push(j);
            }

            for (var j = 0; j < glyphs.length; j++)
              glyphs[j] = { unicode: glyphs[j] + firstCode };

            var ranges= getRanges(glyphs);
            assert(ranges.length == 1, "Got " + ranges.length + " ranges in a dense array");

            var encoding = properties.encoding;
            var denseRange = ranges[0];
            var start = denseRange[0];
            var end = denseRange[1];
            var index = firstCode;
            for (var j = start; j <= end; j++)
              encoding[index++] = glyphs[j - firstCode - 1].unicode;
            cmap.data = createCMapTable(glyphs);
          }
        }
      };

      // Check that required tables are present
      var requiredTables = [ "OS/2", "cmap", "head", "hhea",
                             "hmtx", "maxp", "name", "post" ];

      var header = readOpenTypeHeader(font);
      var numTables = header.numTables;

      // This keep a reference to the CMap and the post tables since they can
      // be rewritted
      var cmap, post;

      var tables = [];
      for (var i = 0; i < numTables; i++) {
        var table = readTableEntry(font);
        var index = requiredTables.indexOf(table.tag);
        if (index != -1) {
          if (table.tag == "cmap")
            cmap = table;
          else if (table.tag == "post")
            post = table;

          requiredTables.splice(index, 1);
        }
        tables.push(table);
      }

      // If any tables are still in the array this means some required tables are
      // missing, which means that we need to rebuild the font in order to pass
      // the sanitizer.
      if (requiredTables.length && requiredTables[0] == "OS/2") {
        // Create a new file to hold the new version of our truetype with a new
        // header and new offsets
        var ttf = new Uint8Array(kMaxFontFileSize);

        // The offsets object holds at the same time a representation of where
        // to write the table entry information about a table and another offset
        // representing the offset where to put the actual data of a particular
        // table
        var numTables = header.numTables + requiredTables.length;
        var offsets = {
          currentOffset: 0,
          virtualOffset: numTables * (4 * 4)
        };

        // The new numbers of tables will be the last one plus the num of missing
        // tables
        createOpenTypeHeader("\x00\x01\x00\x00", ttf, offsets, numTables);

        // Insert the missing table
        tables.push({
          tag: "OS/2",
          data: stringToArray(createOS2Table(properties))
        });

        // Replace the old CMAP table with a shiny new one
        replaceCMapTable(cmap, font, properties);

        // Rewrite the 'post' table if needed
        if (!post) {
          tables.push({
            tag: "post",
            data: stringToArray(createPostTable(properties))
          });
        }

        // Tables needs to be written by ascendant alphabetic order
        tables.sort(function tables_sort(a, b) {
          return a.tag > b.tag;
        });

        // rewrite the tables but tweak offsets
        for (var i = 0; i < tables.length; i++) {
          var table = tables[i];
          var data = [];

          var tableData = table.data;
          for (var j = 0; j < tableData.length; j++)
            data.push(tableData[j]);
          createTableEntry(ttf, offsets, table.tag, data);
        }

        // Add the table datas
        for (var i = 0; i < tables.length; i++) {
          var table = tables[i];
          var tableData = table.data;
          ttf.set(tableData, offsets.currentOffset);
          offsets.currentOffset += tableData.length;

          // 4-byte aligned data
          while (offsets.currentOffset & 3)
            offsets.currentOffset++;
        }

        var fontData = [];
        for (var i = 0; i < offsets.currentOffset; i++)
          fontData.push(ttf[i]);

        return fontData;
      } else if (requiredTables.length) {
        error("Table " + requiredTables[0] + " is missing from the TrueType font");
      }

      return font.getBytes();
    },

    convert: function font_convert(fontName, font, properties) {
      var otf = new Uint8Array(kMaxFontFileSize);

      function createNameTable(name) {
  	    // All the strings of the name table should be an odd number of bytes
        if (name.length % 2)
          name = name.slice(0, name.length - 1);

        var strings = [
          "Original licence",  // 0.Copyright
          name,                // 1.Font family
          "Unknown",           // 2.Font subfamily (font weight)
          "uniqueID",          // 3.Unique ID
          name,                // 4.Full font name
          "Version 0.11",      // 5.Version
          "Unknown",           // 6.Postscript name
          "Unknown",           // 7.Trademark
          "Unknown",           // 8.Manufacturer
          "Unknown"            // 9.Designer
        ];

        // Mac want 1-byte per character strings while Windows want
        // 2-bytes per character, so duplicate the names table
        var stringsUnicode = [];
        for (var i = 0; i < strings.length; i++) {
          var str = strings[i];

          var strUnicode = "";
          for (var j = 0; j < str.length; j++)
            strUnicode += string16(str.charCodeAt(j));
          stringsUnicode.push(strUnicode);
        }

        var names = [strings, stringsUnicode];
        var platforms = ["\x00\x01", "\x00\x03"];
        var encodings = ["\x00\x00", "\x00\x01"];
        var languages = ["\x00\x00", "\x04\x09"];

        var namesRecordCount = strings.length * platforms.length;
        var nameTable =
          "\x00\x00" +                           // format
          string16(namesRecordCount) +           // Number of names Record
          string16(namesRecordCount * 12 + 6);   // Storage

        // Build the name records field
        var strOffset = 0;
        for (var i = 0; i < platforms.length; i++) {
          var strs = names[i];
          for (var j = 0; j < strs.length; j++) {
            var str = strs[j];
            var nameRecord =
              platforms[i] + // platform ID
              encodings[i] + // encoding ID
              languages[i] + // language ID
              string16(i) + // name ID
              string16(str.length) +
              string16(strOffset);
            nameTable += nameRecord;
            strOffset += str.length;
          }
        }

		    nameTable += strings.join("") + stringsUnicode.join("");
        return nameTable;
      }
	  
	    function isFixedPitch(glyphs) {
	      for (var i = 0; i < glyphs.length - 1; i++) {
		    if (glyphs[i] != glyphs[i+1])
		      return false;
		    }
		    return true;
      };

      // Required Tables
      var CFF =
        font.data,   // PostScript Font Program
        OS2,         // OS/2 and Windows Specific metrics
        cmap,        // Character to glyphs mapping
        head,        // Font header
        hhea,        // Horizontal header
        hmtx,        // Horizontal metrics
        maxp,        // Maximum profile
        name,        // Naming tables
        post;        // PostScript informations
      var tables = [CFF, OS2, cmap, head, hhea, hmtx, maxp, name, post];

      // The offsets object holds at the same time a representation of where
      // to write the table entry information about a table and another offset
      // representing the offset where to draw the actual data of a particular
      // table
      var offsets = {
        currentOffset: 0,
        virtualOffset: tables.length * (4 * 4)
      };

      // It there is only one font, offset table is the first bytes of the file
      createOpenTypeHeader("\x4F\x54\x54\x4F", otf, offsets, tables.length);

      /** CFF */
      createTableEntry(otf, offsets, "CFF ", CFF);

      /** OS/2 */
	    var charstrings = font.charstrings;
	    properties.fixedPitch = isFixedPitch(charstrings);
      OS2 = stringToArray(createOS2Table(properties));
      createTableEntry(otf, offsets, "OS/2", OS2);

      /** CMAP */
      cmap = createCMapTable(charstrings.slice());
      createTableEntry(otf, offsets, "cmap", cmap);

      /** HEAD */
      head = stringToArray(
              "\x00\x01\x00\x00" + // Version number
              "\x00\x00\x10\x00" + // fontRevision
              "\x00\x00\x00\x00" + // checksumAdjustement
              "\x5F\x0F\x3C\xF5" + // magicNumber
              "\x00\x00" + // Flags
              "\x03\xE8" + // unitsPerEM (defaulting to 1000)
              "\x00\x00\x00\x00\x9e\x0b\x7e\x27" + // creation date
              "\x00\x00\x00\x00\x9e\x0b\x7e\x27" + // modifification date
              "\x00\x00" + // xMin
              string16(properties.descent) + // yMin
              "\x0F\xFF" + // xMax
              string16(properties.ascent) + // yMax
              string16(properties.italicAngle ? 2 : 0) + // macStyle
              "\x00\x11" + // lowestRecPPEM
              "\x00\x00" + // fontDirectionHint
              "\x00\x00" + // indexToLocFormat
              "\x00\x00"   // glyphDataFormat
      );
      createTableEntry(otf, offsets, "head", head);

      /** HHEA */
      hhea = stringToArray(
                 "\x00\x01\x00\x00" + // Version number
                 string16(properties.ascent) + // Typographic Ascent
                 string16(properties.descent) + // Typographic Descent
                 "\x00\x00" + // Line Gap
                 "\xFF\xFF" + // advanceWidthMax
                 "\x00\x00" + // minLeftSidebearing
                 "\x00\x00" + // minRightSidebearing
                 "\x00\x00" + // xMaxExtent
                 string16(properties.capHeight) + // caretSlopeRise
                 string16(Math.tan(properties.italicAngle) * properties.xHeight) + // caretSlopeRun
                 "\x00\x00" + // caretOffset
                 "\x00\x00" + // -reserved-
                 "\x00\x00" + // -reserved-
                 "\x00\x00" + // -reserved-
                 "\x00\x00" + // -reserved-
                 "\x00\x00" + // metricDataFormat
                 string16(charstrings.length + 1) // Number of HMetrics
      );
      createTableEntry(otf, offsets, "hhea", hhea);

      /** HMTX */
      /* For some reasons, probably related to how the backend handle fonts,
      * Linux seems to ignore this file and prefer the data from the CFF itself
      * while Windows use this data. So be careful if you hack on Linux and
      * have to touch the 'hmtx' table
      */
      hmtx = "\x00\x00\x00\x00"; // Fake .notdef
      for (var i = 0; i < charstrings.length; i++) {
        hmtx += string16(charstrings[i].width) + string16(0);
      }
      hmtx = stringToArray(hmtx);
      createTableEntry(otf, offsets, "hmtx", hmtx);

      /** MAXP */
      maxp = "\x00\x00\x50\x00" + // Version number
             string16(charstrings.length + 1); // Num of glyphs
      maxp = stringToArray(maxp);
      createTableEntry(otf, offsets, "maxp", maxp);

      /** NAME */
      name = stringToArray(createNameTable(fontName));
      createTableEntry(otf, offsets, "name", name);

      /** POST */
      post = stringToArray(createPostTable(properties));
      createTableEntry(otf, offsets, "post", post);

      // Once all the table entries header are written, dump the data!
      var tables = [CFF, OS2, cmap, head, hhea, hmtx, maxp, name, post];
      for (var i = 0; i < tables.length; i++) {
        var table = tables[i];
        otf.set(table, offsets.currentOffset);
        offsets.currentOffset += table.length;
      }

      var fontData = [];
      for (var i = 0; i < offsets.currentOffset; i++)
        fontData.push(otf[i]);
      return fontData;
    },

    bindWorker: function font_bindWorker(data) {
      postMessage({
        action: "font",
        data: {
          raw:      data,
          fontName: this.name,
          mimetype: this.mimetype
        }
      });
    },

    bindDOM: function font_bindDom(data, callback) {
      var fontName = this.name;

      // Just adding the font-face to the DOM doesn't make it load. It
      // seems it's loaded once Gecko notices it's used. Therefore,
      // add a div on the page using the loaded font.
      var div = document.createElement("div");
      var style = 'font-family:"' + name +
        '";position: absolute;top:-99999;left:-99999;z-index:-99999';
      div.setAttribute("style", style);
      document.body.appendChild(div);

      /** Hack begin */
      // Actually there is not event when a font has finished downloading so
      // the following code are a dirty hack to 'guess' when a font is ready
      // This code could go away when bug 471915 has landed
      var canvas = document.createElement("canvas");
      var ctx = canvas.getContext("2d");
      ctx.font = "bold italic 20px " + fontName + ", Symbol, Arial";
      var testString = "    ";

      // Periodicaly check for the width of the testString, it will be
      // different once the real font has loaded
      var textWidth = ctx.measureText(testString).width;

      var interval = window.setInterval(function canvasInterval(self) {
        this.start = this.start || Date.now();
        ctx.font = "bold italic 20px " + fontName + ", Symbol, Arial";

        // For some reasons the font has not loaded, so mark it loaded for the
        // page to proceed but cry
        if (textWidth == ctx.measureText(testString).width) {
          if ((Date.now() - this.start) < kMaxWaitForFontFace) {
            return;
          } else {
            warn("Is " + fontName + " loaded?");
          }
        }

        window.clearInterval(interval);
        Fonts.lookup(fontName).loading = false;
        this.start = 0;
        if (callback) {
          callback();
        }
      }, 30, this);

      /** Hack end */

      // Add the @font-face rule to the document
      var url = "url(data:" + this.mimetype + ";base64," + window.btoa(data) + ");";
      var rule = "@font-face { font-family:'" + fontName + "';src:" + url + "}";
      var styleSheet = document.styleSheets[0];
      styleSheet.insertRule(rule, styleSheet.cssRules.length);
    }
  };

  return constructor;
})();


/**
 * FontsUtils is a static class dedicated to hold codes that are not related
 * to fonts in particular and needs to be share between them.
 */
var FontsUtils = {
  _bytesArray: new Uint8Array(4),
  integerToBytes: function fu_integerToBytes(value, bytesCount) {
    var bytes = this._bytesArray;

    if (bytesCount == 1) {
      bytes.set([value]);
      return bytes[0];
    } else if (bytesCount == 2) {
      bytes.set([value >> 8, value & 0xff]);
      return [bytes[0], bytes[1]];
    } else if (bytesCount == 4) {
      bytes.set([value >> 24, value >> 16, value >> 8, value]);
      return [bytes[0], bytes[1], bytes[2], bytes[3]];
    }

    error("This number of bytes " + bytesCount + " is not supported");
    return null;
  },

  bytesToInteger: function fu_bytesToInteger(bytesArray) {
    var value = 0;
    for (var i = 0; i < bytesArray.length; i++)
      value = (value << 8) + bytesArray[i];
    return value;
  },

  getMaxPower2: function fu_getMaxPower2(number) {
    var maxPower = 0;
    var value = number;
    while (value >= 2) {
      value /= 2;
      maxPower++;
    }

    value = 2;
    for (var i = 1; i < maxPower; i++)
      value *= 2;
    return value;
  }
};


/**
 * Type1Parser encapsulate the needed code for parsing a Type1 font
 * program.
 * Some of its logic depends on the Type2 charstrings structure.
 */
var Type1Parser = function() {
  /*
   * Decrypt a Sequence of Ciphertext Bytes to Produce the Original Sequence
   * of Plaintext Bytes. The function took a key as a parameter which can be
   * for decrypting the eexec block of for decoding charStrings.
   */
  var kEexecEncryptionKey = 55665;
  var kCharStringsEncryptionKey = 4330;

  function decrypt(stream, key, discardNumber) {
    var r = key, c1 = 52845, c2 = 22719;
    var decryptedString = [];

    var value = "";
    var count = stream.length;
    for (var i = 0; i < count; i++) {
      value = stream[i];
      decryptedString[i] = value ^ (r >> 8);
      r = ((value + r) * c1 + c2) & ((1 << 16) - 1);
    }
    return decryptedString.slice(discardNumber);
  };

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
  var charStringDictionary = {
    "1": "hstem",
    "3": "vstem",
    "4": "vmoveto",
    "5": "rlineto",
    "6": "hlineto",
    "7": "vlineto",
    "8": "rrcurveto",

    // closepath is a Type1 command that do not take argument and is useless
    // in Type2 and it can simply be ignored.
    "9": null, // closepath

    "10": "callsubr",

    // return is normally used inside sub-routines to tells to the execution
    // flow that it can be back to normal.
    // During the translation process Type1 charstrings will be flattened and
    // sub-routines will be embedded directly into the charstring directly, so
    // this can be ignored safely.
    "11": "return",

    "12": {
      // dotsection is a Type1 command to specify some hinting feature for dots
      // that do not take a parameter and it can safely be ignored for Type2.
      "0": null, // dotsection

      // [vh]stem3 are Type1 only and Type2 supports [vh]stem with multiple
      // parameters, so instead of returning [vh]stem3 take a shortcut and
      // return [vhstem] instead.
      "1": "vstem",
      "2": "hstem",

      // Type1 only command with command not (yet) built-in ,throw an error
      "6": -1, // seac
      "7": -1, //sbw

      "11": "sub",
      "12": "div",

      // callothersubr is a mechanism to make calls on the postscript
      // interpreter, this is not supported by Type2 charstring but hopefully
      // most of the default commands can be ignored safely.
      "16": "callothersubr",

      "17": "pop",

      // setcurrentpoint sets the current point to x, y without performing a
      // moveto (this is a one shot positionning command). This is used only
      // with the return of an OtherSubrs call.
      // TODO Implement the OtherSubrs charstring embedding and replace this
      //      call by a no-op, like 2 'pop' commands for example.
      "33": null, //setcurrentpoint
    },
    "13": "hsbw",
    "14": "endchar",
    "21": "rmoveto",
    "22": "hmoveto",
    "30": "vhcurveto",
    "31": "hvcurveto"
  };

  var kEscapeCommand = 12;

  function decodeCharString(array) {
    var charstring = [];
    var lsb = 0;
    var width = 0;
    var used = false;

    var value = "";
    var count = array.length;
    for (var i = 0; i < count; i++) {
      value = parseInt(array[i]);

      if (value < 32) {
        var command = null;
        if (value == kEscapeCommand) {
          var escape = array[++i];

          // TODO Clean this code
          if (escape == 16) {
            var index = charstring.pop();
            var argc = charstring.pop();
            var data = charstring.pop();

            // If the flex mechanishm is not used in a font program, Adobe
            // state that that entries 0, 1 and 2 can simply be replace by
            // {}, which means that we can simply ignore them.
            if (index < 3) {
              continue;
            }

            // This is the same things about hint replacement, if it is not used
            // entry 3 can be replaced by {3}
            if (index == 3) {
              charstring.push(3);
              i++;
              continue;
            }
          }

          command = charStringDictionary["12"][escape];
        } else {
          // TODO Clean this code
          if (value == 13) {
            if (charstring.length == 2) {
              width = charstring[1];
            } else if (charstring.length == 4 && charstring[3] == "div") {
              width = charstring[1] / charstring[2];
            } else {
              error("Unsupported hsbw format: " + charstring);
            }

            lsb = charstring[0];
            charstring.push(lsb, "hmoveto");
            charstring.splice(0, 1);
            continue;
          }
          command = charStringDictionary[value];
        }

        // Some charstring commands are meaningless in Type2 and will return
        // a null, let's just ignored them
        if (!command && i < count) {
          continue;
        } else if (!command) {
          break;
        } else if (command == -1) {
          error("Support for Type1 command " + value + " (" + escape + ") is not implemented in charstring: " + charString);
        }

        value = command;
      } else if (value <= 246) {
        value = parseInt(value) - 139;
      } else if (value <= 250) {
        value = ((value - 247) * 256) + parseInt(array[++i]) + 108;
      } else if (value <= 254) {
        value = -((value - 251) * 256) - parseInt(array[++i]) - 108;
      } else {
        value = (array[++i] & 0xff) << 24 | (array[++i] & 0xff) << 16 |
                (array[++i] & 0xff) << 8 | (array[++i] & 0xff) << 0;
      }

      charstring.push(value);
    }

    return { charstring: charstring, width: width, lsb: lsb };
  };

  /**
   * Returns an object containing a Subrs array and a CharStrings array
   * extracted from and eexec encrypted block of data
   */
  this.extractFontProgram = function t1_extractFontProgram(stream) {
    var eexecString = decrypt(stream, kEexecEncryptionKey, 4);
    var subrs = [],  glyphs = [];
    var inGlyphs = false;
    var inSubrs = false;
    var glyph = "";

    var token = "";
    var index = 0;
    var length = 0;

    var c = "";
    var count = eexecString.length;
    for (var i = 0; i < count; i++) {
      var c = eexecString[i];

      if (inSubrs && c == 0x52) {
        length = parseInt(length);
        var data = eexecString.slice(i + 3, i + 3 + length);
        var encodedSubr = decrypt(data, kCharStringsEncryptionKey, 4);
        var str = decodeCharString(encodedSubr);

        subrs.push(str.charstring);
        i += 3 + length;
      } else if (inGlyphs && c == 0x52) {
        length = parseInt(length);
        var data = eexecString.slice(i + 3, i + 3 + length);
        var encodedCharstring = decrypt(data, kCharStringsEncryptionKey, 4);
        var str = decodeCharString(encodedCharstring);

        glyphs.push({
            glyph: glyph,
            data: str.charstring,
            lsb: str.lsb,
            width: str.width
        });
        i += 3 + length;
      } else if (inGlyphs && c == 0x2F) {
        token = "";
        glyph = "";

        while ((c = eexecString[++i]) != 0x20)
          glyph += String.fromCharCode(c);
      } else if (!inSubrs && !inGlyphs && c == 0x2F && eexecString[i+1] == 0x53) {
        while ((c = eexecString[++i]) != 0x20) {};
        inSubrs = true;
      } else if (c == 0x20) {
        index = length;
        length = token;
        token = "";
      } else if (c == 0x2F && eexecString[i+1] == 0x43 && eexecString[i+2] == 0x68) {
        while ((c = eexecString[++i]) != 0x20) {};
        inSubrs = false;
        inGlyphs = true;
      } else {
        token += String.fromCharCode(c);
      }
    }
    return {
      subrs: subrs,
      charstrings: glyphs
    }
  }
};

/**
 * The CFF class takes a Type1 file and wrap it into a 'Compact Font Format',
 * which itself embed Type2 charstrings.
 */
var CFFStrings = [
  ".notdef","space","exclam","quotedbl","numbersign","dollar","percent","ampersand",
  "quoteright","parenleft","parenright","asterisk","plus","comma","hyphen","period",
  "slash","zero","one","two","three","four","five","six","seven","eight","nine",
  "colon","semicolon","less","equal","greater","question","at","A","B","C","D","E",
  "F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y",
  "Z","bracketleft","backslash","bracketright","asciicircum","underscore",
  "quoteleft","a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q",
  "r","s","t","u","v","w","x","y","z","braceleft","bar","braceright","asciitilde",
  "exclamdown","cent","sterling","fraction","yen","florin","section","currency",
  "quotesingle","quotedblleft","guillemotleft","guilsinglleft","guilsinglright",
  "fi","fl","endash","dagger","daggerdbl","periodcentered","paragraph","bullet",
  "quotesinglbase","quotedblbase","quotedblright","guillemotright","ellipsis",
  "perthousand","questiondown","grave","acute","circumflex","tilde","macron",
  "breve","dotaccent","dieresis","ring","cedilla","hungarumlaut","ogonek","caron",
  "emdash","AE","ordfeminine","Lslash","Oslash","OE","ordmasculine","ae","dotlessi",
  "lslash","oslash","oe","germandbls","onesuperior","logicalnot","mu","trademark",
  "Eth","onehalf","plusminus","Thorn","onequarter","divide","brokenbar","degree",
  "thorn","threequarters","twosuperior","registered","minus","eth","multiply",
  "threesuperior","copyright","Aacute","Acircumflex","Adieresis","Agrave","Aring",
  "Atilde","Ccedilla","Eacute","Ecircumflex","Edieresis","Egrave","Iacute",
  "Icircumflex","Idieresis","Igrave","Ntilde","Oacute","Ocircumflex","Odieresis",
  "Ograve","Otilde","Scaron","Uacute","Ucircumflex","Udieresis","Ugrave","Yacute",
  "Ydieresis","Zcaron","aacute","acircumflex","adieresis","agrave","aring","atilde",
  "ccedilla","eacute","ecircumflex","edieresis","egrave","iacute","icircumflex",
  "idieresis","igrave","ntilde","oacute","ocircumflex","odieresis","ograve",
  "otilde","scaron","uacute","ucircumflex","udieresis","ugrave","yacute",
  "ydieresis","zcaron","exclamsmall","Hungarumlautsmall","dollaroldstyle",
  "dollarsuperior","ampersandsmall","Acutesmall","parenleftsuperior",
  "parenrightsuperior","266 ff","onedotenleader","zerooldstyle","oneoldstyle",
  "twooldstyle","threeoldstyle","fouroldstyle","fiveoldstyle","sixoldstyle",
  "sevenoldstyle","eightoldstyle","nineoldstyle","commasuperior",
  "threequartersemdash","periodsuperior","questionsmall","asuperior","bsuperior",
  "centsuperior","dsuperior","esuperior","isuperior","lsuperior","msuperior",
  "nsuperior","osuperior","rsuperior","ssuperior","tsuperior","ff","ffi","ffl",
  "parenleftinferior","parenrightinferior","Circumflexsmall","hyphensuperior",
  "Gravesmall","Asmall","Bsmall","Csmall","Dsmall","Esmall","Fsmall","Gsmall",
  "Hsmall","Ismall","Jsmall","Ksmall","Lsmall","Msmall","Nsmall","Osmall","Psmall",
  "Qsmall","Rsmall","Ssmall","Tsmall","Usmall","Vsmall","Wsmall","Xsmall","Ysmall",
  "Zsmall","colonmonetary","onefitted","rupiah","Tildesmall","exclamdownsmall",
  "centoldstyle","Lslashsmall","Scaronsmall","Zcaronsmall","Dieresissmall",
  "Brevesmall","Caronsmall","Dotaccentsmall","Macronsmall","figuredash",
  "hypheninferior","Ogoneksmall","Ringsmall","Cedillasmall","questiondownsmall",
  "oneeighth","threeeighths","fiveeighths","seveneighths","onethird","twothirds",
  "zerosuperior","foursuperior","fivesuperior","sixsuperior","sevensuperior",
  "eightsuperior","ninesuperior","zeroinferior","oneinferior","twoinferior",
  "threeinferior","fourinferior","fiveinferior","sixinferior","seveninferior",
  "eightinferior","nineinferior","centinferior","dollarinferior","periodinferior",
  "commainferior","Agravesmall","Aacutesmall","Acircumflexsmall","Atildesmall",
  "Adieresissmall","Aringsmall","AEsmall","Ccedillasmall","Egravesmall",
  "Eacutesmall","Ecircumflexsmall","Edieresissmall","Igravesmall","Iacutesmall",
  "Icircumflexsmall","Idieresissmall","Ethsmall","Ntildesmall","Ogravesmall",
  "Oacutesmall","Ocircumflexsmall","Otildesmall","Odieresissmall","OEsmall",
  "Oslashsmall","Ugravesmall","Uacutesmall","Ucircumflexsmall","Udieresissmall",
  "Yacutesmall","Thornsmall","Ydieresissmall","001.000","001.001","001.002",
  "001.003","Black","Bold","Book","Light","Medium","Regular","Roman","Semibold"
];

var type1Parser = new Type1Parser();

var CFF = function(name, file, properties) {
  // Get the data block containing glyphs and subrs informations
  var length1 = file.dict.get("Length1");
  var length2 = file.dict.get("Length2");
  file.skip(length1);
  var eexecBlock = file.getBytes(length2);

  // Decrypt the data blocks and retrieve it's content
  var data = type1Parser.extractFontProgram(eexecBlock);

  this.charstrings = this.getOrderedCharStrings(data.charstrings);
  this.data = this.wrap(name, this.charstrings, data.subrs, properties);
};

CFF.prototype = {
  createCFFIndexHeader: function cff_createCFFIndexHeader(objects, isByte) {
    // First 2 bytes contains the number of objects contained into this index
    var count = objects.length;

    // If there is no object, just create an array saying that with another
    // offset byte.
    if (count == 0)
      return [0x00, 0x00, 0x00];

    var data = [];
    var bytes = FontsUtils.integerToBytes(count, 2);
    for (var i = 0; i < bytes.length; i++)
      data.push(bytes[i]);

    // Next byte contains the offset size use to reference object in the file
    // Actually we're using 0x04 to be sure to be able to store everything
    // without thinking of it while coding.
    data.push(0x04);

    // Add another offset after this one because we need a new offset
    var relativeOffset = 1;
    for (var i = 0; i < count + 1; i++) {
      var bytes = FontsUtils.integerToBytes(relativeOffset, 4);
      for (var j = 0; j < bytes.length; j++)
        data.push(bytes[j]);

      if (objects[i])
        relativeOffset += objects[i].length;
    }

    for (var i =0; i < count; i++) {
      for (var j = 0; j < objects[i].length; j++)
        data.push(isByte ? objects[i][j] : objects[i].charCodeAt(j));
    }
    return data;
  },

  encodeNumber: function cff_encodeNumber(value) {
    var x = 0;
    if (value >= -32768 && value <= 32767) {
      return [ 28, value >> 8, value & 0xFF ];
    } else if (value >= (-2147483647-1) && value <= 2147483647) {
      return [ 0xFF, value >> 24, Value >> 16, value >> 8, value & 0xFF ];
    }
    error("Value: " + value + " is not allowed");
    return null;
  },

  getOrderedCharStrings: function cff_getOrderedCharStrings(glyphs) {
    var charstrings = [];

    for (var i = 0; i < glyphs.length; i++) {
      var glyph = glyphs[i];
      var unicode = GlyphsUnicode[glyph.glyph];
      if (!unicode) {
        if (glyph.glyph != ".notdef")
          warn(glyph + " does not have an entry in the glyphs unicode dictionary");
      } else {
        charstrings.push({
          glyph: glyph,
          unicode: unicode,
          charstring: glyph.data,
          width: glyph.width,
          lsb: glyph.lsb
        });
      }
    };

    charstrings.sort(function charstrings_sort(a, b) {
      return a.unicode > b.unicode;
    });
    return charstrings;
  },

  /*
   * Flatten the commands by interpreting the postscript code and replacing
   * every 'callsubr', 'callothersubr' by the real commands.
   *
   * TODO This function also do a string to command number transformation
   * that can probably be avoided if the Type1 decodeCharstring code is smarter
   */
  commandsMap: {
    "hstem": 1,
    "vstem": 3,
    "vmoveto": 4,
    "rlineto": 5,
    "hlineto": 6,
    "vlineto": 7,
    "rrcurveto": 8,
    "callsubr": 10,
    "return": 11,
    "sub": [12, 11],
    "div": [12, 12],
    "pop": [1, 12, 18],
    "endchar": 14,
    "rmoveto": 21,
    "hmoveto": 22,
    "vhcurveto": 30,
    "hvcurveto": 31,
  },

  flattenCharstring: function flattenCharstring(charstring) {
    var i = 0;
    while (true) {
      var obj = charstring[i];
      if (obj == undefined) {
        error("unknow charstring command for " + i + " in " + charstring);
      }
      if (obj.charAt) {
        switch (obj) {
          case "endchar":
          case "return":
            // CharString is ready to be re-encode to commands number at this point
            for (var j = 0; j < charstring.length; j++) {
              var command = charstring[j];
              if (parseFloat(command) == command) {
                charstring.splice(j, 1, 28, command >> 8, command);
                j+= 2;
              } else if (command.charAt) {
                var cmd = this.commandsMap[command];
                if (!cmd)
                  error("Unknow command: " + command);

                if (IsArray(cmd)) {
                  charstring.splice(j, 1, cmd[0], cmd[1]);
                  j += 1;
                } else {
                  charstring[j] = cmd;
                }
              }
            }
            return charstring;

          default:
            break;
        }
      }
      i++;
    }
    error("failing with i = " + i + " in charstring:" + charstring + "(" + charstring.length + ")");
    return [];
  },

  wrap: function wrap(name, charstrings, subrs, properties) {
    // Starts the conversion of the Type1 charstrings to Type2
    var glyphs = [];
	  var glyphsCount = charstrings.length;
    for (var i = 0; i < glyphsCount; i++) {
      var charstring = charstrings[i].charstring;
      glyphs.push(this.flattenCharstring(charstring.slice()));
    }

    // Create a CFF font data
    var cff = new Uint8Array(kMaxFontFileSize);
    var currentOffset = 0;

    // Font header (major version, minor version, header size, offset size)
    var header = [0x01, 0x00, 0x04, 0x04];
    currentOffset += header.length;
    cff.set(header);

    // Names Index
    var nameIndex = this.createCFFIndexHeader([name]);
    cff.set(nameIndex, currentOffset);
    currentOffset += nameIndex.length;

    // Calculate strings before writing the TopDICT index in order
    // to calculate correct relative offsets for storing 'charset'
    // and 'charstrings' data
    var version = "";
    var notice = "";
    var fullName = "";
    var familyName = "";
    var weight = "";
    var strings = [version, notice, fullName,
                   familyName, weight];
    var stringsIndex = this.createCFFIndexHeader(strings);
    var stringsDataLength = stringsIndex.length;

    // Create the global subroutines index
    var globalSubrsIndex = this.createCFFIndexHeader([]);

    // Fill the charset header (first byte is the encoding)
    var charset = [0x00];
    for (var i = 0; i < glyphsCount; i++) {
      var index = CFFStrings.indexOf(charstrings[i].glyph);
      if (index == -1)
        index = CFFStrings.length + strings.indexOf(charstrings[i].glyph);
      var bytes = FontsUtils.integerToBytes(index, 2);
      charset.push(bytes[0]);
      charset.push(bytes[1]);
    }

    var charstringsIndex = this.createCFFIndexHeader([[0x8B, 0x0E]].concat(glyphs), true);

    //Top Dict Index
    var topDictIndex = [
      0x00, 0x01, 0x01, 0x01, 0x30,
      248, 27, 0, // version
      248, 28, 1, // Notice
      248, 29, 2, // FullName
      248, 30, 3, // FamilyName
      248, 31, 4  // Weight
    ];

    var fontBBox = properties.bbox;
    for (var i = 0; i < fontBBox.length; i++)
      topDictIndex = topDictIndex.concat(this.encodeNumber(fontBBox[i]));
    topDictIndex.push(5) // FontBBox;

    var charsetOffset = currentOffset +
                        (topDictIndex.length + (4 + 4 + 4 + 7)) +
                        stringsIndex.length +
                        globalSubrsIndex.length;
    topDictIndex = topDictIndex.concat(this.encodeNumber(charsetOffset));
    topDictIndex.push(15); // charset

    topDictIndex = topDictIndex.concat([28, 0, 0, 16]) // Encoding

    var charstringsOffset = charsetOffset + (glyphsCount * 2) + 1;
    topDictIndex = topDictIndex.concat(this.encodeNumber(charstringsOffset));
    topDictIndex.push(17); // charstrings

    topDictIndex = topDictIndex.concat([28, 0, 55])
    var privateOffset = charstringsOffset + charstringsIndex.length;
    topDictIndex = topDictIndex.concat(this.encodeNumber(privateOffset));
    topDictIndex.push(18); // Private

    var indexes = [
      topDictIndex, stringsIndex,
      globalSubrsIndex, charset,
      charstringsIndex
    ];

    for (var i = 0; i < indexes.length; i++) {
      var index = indexes[i];
      cff.set(index, currentOffset);
      currentOffset += index.length;
    }

    // Private Data
    var defaultWidth = this.encodeNumber(0);
    var privateData = [].concat(
      defaultWidth, [20],
      [139, 21], // nominalWidth
      [
      119, 159, 248, 97, 159, 247, 87, 159, 6,
      30, 10, 3, 150, 37, 255, 12, 9,
      139, 12,
      10, 172, 10,
      172, 150, 143, 146, 150, 146, 12, 12,
      247, 32, 11,
      247, 10, 161, 147, 154, 150, 143, 12, 13,
      139, 12, 14,
      28, 0, 55, 19 // Subrs offset
    ]);
    cff.set(privateData, currentOffset);
    currentOffset += privateData.length;

    // Local Subrs
    var flattenedSubrs = [];

    var bias = 0;
    var subrsCount = subrs.length;
    if (subrsCount < 1240)
      bias = 107;
    else if (subrsCount < 33900)
      bias = 1131;
    else
      bias = 32768;

    // Add a bunch of empty subrs to deal with the Type2 bias
    for (var i = 0; i < bias; i++)
      flattenedSubrs.push([0x0B]);

    for (var i = 0; i < subrsCount; i++) {
      var subr = subrs[i];
      flattenedSubrs.push(this.flattenCharstring(subr));
    }

    var subrsData = this.createCFFIndexHeader(flattenedSubrs, true);
    cff.set(subrsData, currentOffset);
    currentOffset += subrsData.length;

    var fontData = [];
    for (var i = 0; i < currentOffset; i++)
      fontData.push(cff[i]);

    return fontData;
  }
};

