/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

/**
 * Maximum file size of the font.
 */
var kMaxFontFileSize = 40000;

/**
 * Maximum number of glyphs per font.
*/
var kMaxGlyphsCount = 1024;


/**
 * Hold a map of decoded fonts and of the standard fourteen Type1 fonts and
 * their acronyms.
 * TODO Add the standard fourteen Type1 fonts list by default
 *      http://cgit.freedesktop.org/poppler/poppler/tree/poppler/GfxFont.cc#n65
 */
var Fonts = {};


/**
 * 'Font' is the class the outside world should use, it encapsulate all the font
 * decoding logics whatever type it is (assuming the font type is supported).
 *
 * For example to read a Type1 font and to attach it to the document:
 *   var type1Font = new Font("MyFontName", binaryData, "Type1");
 *   type1Font.bind();
 *
 * As an improvment the last parameter can be replaced by an automatic guess
 * of the font type based on the first byte of the file.
 */
var Font = function(aFontName, aFontFile, aFontType) {
  this.name = aFontName;

  // If the font has already been decoded simply return
  if (Fonts[aFontName]) {
    this.font = Fonts[aFontName];
    return;
  }

  var start = Date.now();
  switch (aFontType) {
    case "Type1":
      // All Type1 font program should begin with the comment %!
      if (aFontFile.getByte() != 0x25 || aFontFile.getByte() != 0x21)
        error("Invalid file header");

      var cff = new CFF(aFontName, aFontFile);
      this.mimetype = "font/otf";

      // Wrap the CFF data inside an OTF font file
      this.font = this.cover(cff);
      break;

    case "TrueType":
      this.mimetype = "font/ttf";
      var ttf = new TrueType(aFontName, aFontFile);
      this.font = ttf.data;
      break;

    default:
      warn("Font " + aFontType + " is not supported");
      break;
  }
  var end = Date.now();

  // Attach the font to the document
  this.bind();

  Fonts[aFontName] = this.font;
};

Font.prototype = {
  name: null,
  font: null,
  mimetype: null,

  bind: function font_bind() {
    var data = this.font;

    // Compute the binary data to base 64
    var str = [];
    var count = data.length;
    for (var i = 0; i < count; i++)
      str.push(data.getChar ? data.getChar()
                            : String.fromCharCode(data[i]));

    var dataBase64 = window.btoa(str.join(""));

    // Add the @font-face rule to the document
    var url = "url(data:" + this.mimetype + ";base64," + dataBase64 + ");";
    var rule = "@font-face { font-family:'" + this.name + "';src:" + url + "}";
    var styleSheet = document.styleSheets[0];
    styleSheet.insertRule(rule, styleSheet.length);
  },

  _createOpenTypeHeader: function font_createOpenTypeHeader(aFile, aOffsets, aNumTables) {
    // sfnt version (4 bytes)
    var version = [0x4F, 0x54, 0x54, 0X4F];

    // numTables (2 bytes)
    var numTables = aNumTables;

    // searchRange (2 bytes)
    var tablesMaxPower2 = FontsUtils.getMaxPower2(numTables);
    var searchRange = tablesMaxPower2 * 16;

    // entrySelector (2 bytes)
    var entrySelector = Math.log(tablesMaxPower2) / Math.log(2);

    // rangeShift (2 bytes)
    var rangeShift = numTables * 16 - searchRange;

    var header = [].concat(version,
                           FontsUtils.integerToBytes(numTables, 2),
                           FontsUtils.integerToBytes(searchRange, 2),
                           FontsUtils.integerToBytes(entrySelector, 2),
                           FontsUtils.integerToBytes(rangeShift, 2));
    aFile.set(header, aOffsets.currentOffset);
    aOffsets.currentOffset += header.length;
    aOffsets.virtualOffset += header.length;
  },

  _createTableEntry: function font_createTableEntry(aFile, aOffsets, aTag, aData) {
    // tag
    var tag = [
      aTag.charCodeAt(0),
      aTag.charCodeAt(1),
      aTag.charCodeAt(2),
      aTag.charCodeAt(3)
    ];

    // offset
    var offset = aOffsets.virtualOffset;

    // Per spec tables must be 4-bytes align so add some 0x00 if needed
    while (aData.length & 3)
      aData.push(0x00);

    // length
    var length = aData.length;

    // checksum
    var checksum = FontsUtils.bytesToInteger(tag) + offset + length;

    var tableEntry = [].concat(tag,
                               FontsUtils.integerToBytes(checksum, 4),
                               FontsUtils.integerToBytes(offset, 4),
                               FontsUtils.integerToBytes(length, 4));
    aFile.set(tableEntry, aOffsets.currentOffset);
    aOffsets.currentOffset += tableEntry.length;
    aOffsets.virtualOffset += aData.length;
  },

  _createCMAPTable: function font_createCMAPTable(aGlyphs) {
    var characters = new Array(kMaxGlyphsCount);
    for (var i = 0; i < aGlyphs.length; i++)
      characters[aGlyphs[i].unicode] = i + 1;

    // Separate the glyphs into continuous range of codes, aka segment.
    var ranges = [];
    var range = [];
    for (var i = 0; i < characters.length; i++) {
      if (characters[i]) {
        range.push(i);
      } else if (range.length) {
        ranges.push(range.slice());
        range = [];
      }
    }

    // The size in bytes of the header is equal to the size of the
    // different fields * length of a short + (size of the 4 parallels arrays
    // describing segments * length of a short).
    var headerSize = (12 * 2 + (ranges.length * 4 * 2));

    var segCount = ranges.length + 1;
    var segCount2 = segCount * 2;
    var searchRange = FontsUtils.getMaxPower2(segCount) * 2;
    var searchEntry = Math.log(segCount) / Math.log(2);
    var rangeShift = 2 * segCount - searchRange;
    var cmap = [].concat(
      [
        0x00, 0x00, // version
        0x00, 0x01, // numTables
        0x00, 0x03, // platformID
        0x00, 0x01, // encodingID
        0x00, 0x00, 0x00, 0x0C, // start of the table record
        0x00, 0x04  // format
      ],
      FontsUtils.integerToBytes(headerSize, 2), // length
      [0x00, 0x00], // language
      FontsUtils.integerToBytes(segCount2, 2),
      FontsUtils.integerToBytes(searchRange, 2),
      FontsUtils.integerToBytes(searchEntry, 2),
      FontsUtils.integerToBytes(rangeShift, 2)
    );

    // Fill up the 4 parallel arrays describing the segments.
    var startCount = [];
    var endCount = [];
    var idDeltas = [];
    var idRangeOffsets = [];
    var glyphsIdsArray = [];
    var bias = 0;
    for (var i = 0; i < segCount - 1; i++) {
      var range = ranges[i];
      var start = FontsUtils.integerToBytes(range[0], 2);
      var end = FontsUtils.integerToBytes(range[range.length - 1], 2);

      var delta = FontsUtils.integerToBytes(((range[0] - 1) - bias) % 65536, 2);
      bias += range.length;

      // deltas are signed shorts
      delta[0] ^= 0xFF;
      delta[1] ^= 0xFF;
      delta[1] += 1;

      startCount.push(start[0], start[1]);
      endCount.push(end[0], end[1]);
      idDeltas.push(delta[0], delta[1]);
      idRangeOffsets.push(0x00, 0x00);

      for (var j = 0; j < range.length; j++)
        glyphsIdsArray.push(range[j]);
    }
    startCount.push(0xFF, 0xFF);
    endCount.push(0xFF, 0xFF);
    idDeltas.push(0x00, 0x01);
    idRangeOffsets.push(0x00, 0x00);

    return cmap.concat(endCount, [0x00, 0x00], startCount,
                       idDeltas, idRangeOffsets, glyphsIdsArray);
  },

  cover: function font_cover(aFont) {
    var otf = new Uint8Array(kMaxFontFileSize);

    // Required Tables
    var CFF = aFont.data, // PostScript Font Program
        OS2 = [],         // OS/2 and Windows Specific metrics
        cmap = [],        // Character to glyphs mapping
        head = [],        // Font eader
        hhea = [],        // Horizontal header
        hmtx = [],        // Horizontal metrics
        maxp = [],        // Maximum profile
        name = [],        // Naming tables
        post = [];        // PostScript informations
    var tables = [CFF, OS2, cmap, head, hhea, hmtx, maxp, name, post];

    // The offsets object holds at the same time a representation of where
    // to write the table entry information about a table and another offset
    // representing the offset where to draw the actual data of a particular
    // table
    var offsets = {
      currentOffset: 0,
      virtualOffset: tables.length * (4 * 4)
    };

    // For files with only one font the offset table is the first thing of the
    // file
    this._createOpenTypeHeader(otf, offsets, tables.length);

    // XXX It is probable that in a future we want to get rid of this glue
    // between the CFF and the OTF format in order to be able to embed TrueType
    // data.
    this._createTableEntry(otf, offsets, "CFF ", CFF);

    /** OS/2 */
    OS2 = [
      0x00, 0x03, // version
      0x02, 0x24, // xAvgCharWidth
      0x01, 0xF4, // usWeightClass
      0x00, 0x05, // usWidthClass
      0x00, 0x00, // fstype
      0x02, 0x8A, // ySubscriptXSize
      0x02, 0xBB, // ySubscriptYSize
      0x00, 0x00, // ySubscriptXOffset
      0x00, 0x8C, // ySubscriptYOffset
      0x02, 0x8A, // ySuperScriptXSize
      0x02, 0xBB, // ySuperScriptYSize
      0x00, 0x00, // ySuperScriptXOffset
      0x01, 0xDF, // ySuperScriptYOffset
      0x00, 0x31, // yStrikeOutSize
      0x01, 0x02, // yStrikeOutPosition
      0x00, 0x00, // sFamilyClass
      0x02, 0x00, 0x06, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Panose
      0x00, 0x00, 0x00, 0x01, // ulUnicodeRange1 (Bits 0-31)
      0x00, 0x00, 0x00, 0x00, // ulUnicodeRange2 (Bits 32-63)
      0x00, 0x00, 0x00, 0x00, // ulUnicodeRange3 (Bits 64-95)
      0x00, 0x00, 0x00, 0x00, // ulUnicodeRange4 (Bits 96-127)
      0x2A, 0x32, 0x31, 0x2A, // achVendID
      0x00, 0x20, // fsSelection
      0x00, 0x2D, // usFirstCharIndex
      0x00, 0x7A, // usLastCharIndex
      0x00, 0x03, // sTypoAscender
      0x00, 0x20, // sTypeDescender
      0x00, 0x38, // sTypoLineGap
      0x00, 0x5A, // usWinAscent
      0x02, 0xB4, // usWinDescent
      0x00, 0xCE, 0x00, 0x00, // ulCodePageRange1 (Bits 0-31)
      0x00, 0x01, 0x00, 0x00, // ulCodePageRange2 (Bits 32-63)
      0x00, 0x00, // sxHeight
      0x00, 0x00, // sCapHeight
      0x00, 0x01, // usDefaultChar
      0x00, 0xCD, // usBreakChar
      0x00, 0x02  // usMaxContext
    ];
    this._createTableEntry(otf, offsets, "OS/2", OS2);

    //XXX Getting charstrings here seems wrong since this is another CFF glue
    var charstrings = aFont.getOrderedCharStrings(aFont.font);

    /** CMAP */
    cmap = this._createCMAPTable(charstrings);
    this._createTableEntry(otf, offsets, "cmap", cmap);

    /** HEAD */
    head = [
      0x00, 0x01, 0x00, 0x00, // Version number
      0x00, 0x00, 0x50, 0x00, // fontRevision
      0x00, 0x00, 0x00, 0x00, // checksumAdjustement
      0x5F, 0x0F, 0x3C, 0xF5, // magicNumber
      0x00, 0x00, // Flags
      0x03, 0xE8, // unitsPerEM (defaulting to 1000)
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // creation date
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // modifification date
      0x00, 0x00, // xMin
      0x00, 0x00, // yMin
      0x00, 0x00, // xMax
      0x00, 0x00, // yMax
      0x00, 0x00, // macStyle
      0x00, 0x00, // lowestRecPPEM
      0x00, 0x00, // fontDirectionHint
      0x00, 0x00, // indexToLocFormat
      0x00, 0x00  // glyphDataFormat
    ];
    this._createTableEntry(otf, offsets, "head", head);

    /** HHEA */
    hhea = [].concat(
      [
        0x00, 0x01, 0x00, 0x00, // Version number
        0x00, 0x00, // Typographic Ascent
        0x00, 0x00, // Typographic Descent
        0x00, 0x00, // Line Gap
        0xFF, 0xFF, // advanceWidthMax
        0x00, 0x00, // minLeftSidebearing
        0x00, 0x00, // minRightSidebearing
        0x00, 0x00, // xMaxExtent
        0x00, 0x00, // caretSlopeRise
        0x00, 0x00, // caretSlopeRun
        0x00, 0x00, // caretOffset
        0x00, 0x00, // -reserved-
        0x00, 0x00, // -reserved-
        0x00, 0x00, // -reserved-
        0x00, 0x00, // -reserved-
        0x00, 0x00 // metricDataFormat
      ],
      FontsUtils.integerToBytes(charstrings.length, 2) // numberOfHMetrics
    );
    this._createTableEntry(otf, offsets, "hhea", hhea);

    /** HMTX */
    hmtx = [0x01, 0xF4, 0x00, 0x00];
    for (var i = 0; i < charstrings.length; i++) {
      // XXX this can easily broke
      var charstring = charstrings[i].charstring;
      var width = FontsUtils.integerToBytes(charstring[1], 2);
      var lsb = FontsUtils.integerToBytes(charstring[0], 2);
      hmtx = hmtx.concat(width, lsb);
    }
    this._createTableEntry(otf, offsets, "hmtx", hmtx);

    /** MAXP */
    maxp = [].concat(
      [
        0x00, 0x00, 0x50, 0x00, // Version number
      ],
      FontsUtils.integerToBytes(charstrings.length + 1, 2) // Num of glyphs (+1 to pass the sanitizer...)
    );
    this._createTableEntry(otf, offsets, "maxp", maxp);

    /** NAME */
    name = [
      0x00, 0x00, // format
      0x00, 0x00, // Number of names Record
      0x00, 0x00  // Storage
    ];
    this._createTableEntry(otf, offsets, "name", name);

    /** POST */
    // XXX get those info from the Font dict!
    post = [
      0x00, 0x03, 0x00, 0x00, // Version number
      0x00, 0x00, 0x01, 0x00, // italicAngle
      0x00, 0x00, // underlinePosition
      0x00, 0x00, // underlineThickness
      0x00, 0x00, 0x00, 0x00, // isFixedPitch
      0x00, 0x00, 0x00, 0x00, // minMemType42
      0x00, 0x00, 0x00, 0x00, // maxMemType42
      0x00, 0x00, 0x00, 0x00, // minMemType1
      0x00, 0x00, 0x00, 0x00  // maxMemType1
    ];
    this._createTableEntry(otf, offsets, "post", post);

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

    //writeToFile(fontData, "/tmp/pdf.js." + fontCount + ".otf");
    return fontData;
  }
};


var FontsUtils = {
  integerToBytes: function fu_integerToBytes(aValue, aBytesCount) {
    var bytes = [];
    for (var i = 0; i < aBytesCount; i++)
      bytes[i] = 0x00;

    do {
      bytes[--aBytesCount] = (aValue & 0xFF);
      aValue = aValue >> 8;
    } while (aBytesCount && aValue > 0);

    return bytes;
  },

  bytesToInteger: function(aBytesArray) {
    var value = 0;
    for (var i = 0; i < aBytesArray.length; i++)
      value = (value << 8) + aBytesArray[i];
    return value;
  },

  getMaxPower2: function fu_getMaxPower2(aNumber) {
    var maxPower = 0;
    var value = aNumber;
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


/** Implementation dirty logic starts here */

/**
 * At the moment TrueType is just a stub that does mostly nothing but in a
 * (near?) future this class will rewrite the font to ensure it is well formed
 * and valid in the point of view of the sanitizer.
 */
var TrueType = function(aFontName, aFontFile) {
  this.data = aFontFile;
};

/**
 * This dictionary holds decoded fonts data.
 */
var PSFonts = new Dict();


var Stack = function(aStackSize) {
  var innerStack = new Array(aStackSize || 0);

  this.push = function(aOperand) {
    innerStack.push(aOperand);
  };

  this.pop = function() {
    if (!this.count())
      throw new Error("stackunderflow");
    return innerStack.pop();
  };

  this.peek = function() {
    if (!this.count())
      return null;
    return innerStack[innerStack.length - 1];
  };

  this.get = function(aIndex) {
    return innerStack[aIndex];
  };

  this.clear = function() {
    innerStack = [];
  };

  this.count = function() {
    return innerStack.length;
  };

  this.dump = function() {
    for (var i = 0; i < this.length; i++)
      log(innerStack[i]);
  };

  this.clone = function() {
    return innerStack.slice();
  };
};

var Type1Parser = function(aAsciiStream, aBinaryStream) {
  var lexer = aAsciiStream ? new Lexer(aAsciiStream) : null;

  // Turn on this flag for additional debugging logs
  var debug = false;

  var dump = function(aData) {
    if (debug)
      log(aData);
  };

  // Hold the fontName as declared inside the /FontName postscript directive
  // XXX This is a hack but at the moment I need it to map the name declared
  // in the PDF and the name in the PS code.
  var fontName = "";

  /*
   * Parse a whole Type1 font stream (from the first segment to the last)
   * assuming the 'eexec' block is binary data and fill up the 'Fonts'
   * dictionary with the font informations.
   */
  var self = this;
  this.parse = function() {
    if (!debug) {
      while (!processNextToken()) {};
      return fontName;
    } else {
      // debug mode is used to debug postcript processing
      setTimeout(function() {
        if (!processNextToken())
          self.parse();
      }, 0);
    }
  };

  /*
   * Decrypt a Sequence of Ciphertext Bytes to Produce the Original Sequence
   * of Plaintext Bytes. The function took a key as a parameter which can be
   * for decrypting the eexec block of for decoding charStrings.
   */
  var kEexecEncryptionKey = 55665;
  var kCharStringsEncryptionKey = 4330;

  function decrypt(aStream, aKey, aDiscardNumber) {
    var start = Date.now();
    var r = aKey, c1 = 52845, c2 = 22719;
    var decryptedString = [];

    var value = "";
    var count = aStream.length;
    for (var i = 0; i < count; i++) {
      value = aStream.getByte();
      decryptedString[i] = String.fromCharCode(value ^ (r >> 8));
      r = ((value + r) * c1 + c2) & ((1 << 16) - 1);
    }
    var end = Date.now();
    dump("Time to decrypt string of length " + count + " is " + (end - start));
    return decryptedString.slice(aDiscardNumber);
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
    "9": "closepath",
    "10": "callsubr",
    "11": "return",
    "12": {
      "0": "dotsection",
      "1": "vstem3",
      "3": "hstem3",
      "6": "seac",
      "7": "sbw",
      "12": "div",
      "16": "callothersubr",
      "17": "pop",
      "33": "setcurrentpoint"
    },
    "13": "hsbw",
    "14": "endchar",
    "21": "rmoveto",
    "22": "hmoveto",
    "30": "vhcurveto",
    "31": "hvcurveto"
  };

  function decodeCharString(aStream) {
    var start = Date.now();
    var charString = [];

    var value = "";
    var count = aStream.length;
    for (var i = 0; i < count; i++) {
      value = aStream.getByte();

      if (value < 32) {
        if (value == 12) {
          value = charStringDictionary["12"][aStream.getByte()];
          i++;
        } else {
          value = charStringDictionary[value];
        }
      } else if (value <= 246) {
        value = parseInt(value) - 139;
      } else if (value <= 250) {
        value = ((value - 247) * 256) + parseInt(aStream.getByte()) + 108;
        i++;
      } else if (value <= 254) {
        value = -((value - 251) * 256) - parseInt(aStream.getByte()) - 108;
        i++;
      } else {
        var byte = aStream.getByte();
        var high = (byte >> 1);
        value = (byte - high) << 24 | aStream.getByte() << 16 |
                aStream.getByte() << 8 | aStream.getByte();
        i += 4;
      }

      charString.push(value);
    }

    var end = Date.now();
    dump("Time to decode charString of length " + count + " is " + (end - start));
    return charString;
  }

  /*
   * The operand stack holds arbitrary PostScript objects that are the operands
   * and results of PostScript operators being executed. The interpreter pushes
   * objects on the operand stack when it encounters them as literal data in a
   * program being executed. When an operator requires one or more operands, it
   * obtains them by popping them off the top of the operand stack. When an
   * operator returns one or more results, it does so by pushing them on the
   * operand stack.
   */
   var operandStack = new Stack(40);

   // Flag indicating if the topmost operand of the operandStack is an array
   var operandIsArray = 0;

  /*
   * The dictionary stack holds only dictionary objects. The current set of
   * dictionaries on the dictionary stack defines the environment for all
   * implicit name searches, such as those that occur when the interpreter
   * encounters an executable name. The role of the dictionary stack is
   * introduced in Section 3.3, “Data Types and Objects,” and is further
   * explained in Section 3.5, “Execution.” of the PostScript Language
   * Reference.
   */
  var systemDict = new Dict(),
      globalDict = new Dict(),
      userDict   = new Dict();

  var dictionaryStack = new Stack();
  dictionaryStack.push(systemDict);
  dictionaryStack.push(globalDict);
  dictionaryStack.push(userDict);

  /*
   * The execution stack holds executable objects (mainly procedures and files)
   * that are in intermediate stages of execution. At any point in the
   * execution of a PostScript program, this stack represents the program’s
   * call stack. Whenever the interpreter suspends execution of an object to
   * execute some other object, it pushes the new object on the execution
   * stack. When the interpreter finishes executing an object, it pops that
   * object off the execution stack and resumes executing the suspended object
   * beneath it.
   */
  var executionStack = new Stack();

  /*
   * Return the next token in the execution stack
   */
  function nextInStack() {
    var currentProcedure = executionStack.peek();
    if (currentProcedure) {
      var command = currentProcedure.shift();
      if (!currentProcedure.length)
        executionStack.pop();
      return command;
    }

    return lexer.getObj();
  };

  /*
   * Get the next token from the executionStack and process it.
   * Actually the function does not process the third segment of a Type1 font
   * and end on 'closefile'.
   *
   * The method thrown an error if it encounters an unknown token.
   */
  function processNextToken() {
    var obj = nextInStack();
    if (operandIsArray && !IsCmd(obj, "{") && !IsCmd(obj, "[") &&
                          !IsCmd(obj, "]") && !IsCmd(obj, "}")) {
      dump("Adding an object: " + obj +" to array " + operandIsArray);
      var currentArray = operandStack.peek();
      for (var i = 1; i < operandIsArray; i++)
        currentArray = currentArray[currentArray.length - 1];

      currentArray.push(obj);
    } else if (IsBool(obj) || IsInt(obj) || IsNum(obj) || IsString(obj)) {
      dump("Value: " + obj);
      operandStack.push(obj);
    } else if (IsName(obj)) {
      dump("Name: " + obj.name);
      operandStack.push(obj.name);
    } else if (IsCmd(obj)) {
      var command = obj.cmd;
      dump(command);

      switch (command) {
        case "[":
        case "{":
          dump("Start" + (command == "{" ? " Executable " : " ") + "Array");
          operandIsArray++;
          var currentArray = operandStack;
          for (var i = 1; i < operandIsArray; i++)
            if (currentArray.peek)
              currentArray = currentArray.peek();
            else
              currentArray = currentArray[currentArray.length - 1];
          currentArray.push([]);
          break;

        case "]":
        case "}":
          var currentArray = operandStack.peek();
          for (var i = 1; i < operandIsArray; i++)
            currentArray = currentArray[currentArray.length - 1];
          dump("End" + (command == "}" ? " Executable " : " ") + "Array: " + currentArray.join(" "));
          operandIsArray--;
          break;

        case "if":
          var procedure = operandStack.pop();
          var bool = operandStack.pop();
          if (!IsBool(bool)) {
            dump("if: " + bool);
            // we need to execute things, let be dirty
            executionStack.push(bool);
          } else {
            dump("if ( " + bool + " ) { " + procedure + " }");
            if (bool)
              executionStack.push(procedure);
          }
          break;

        case "ifelse":
          var procedure1 = operandStack.pop();
          var procedure2 = operandStack.pop();
          var bool = !!operandStack.pop();
          dump("if ( " + bool + " ) { " + procedure2 + " } else { " + procedure1 + " }");
          executionStack.push(bool ? procedure2 : procedure1);
          break;

        case "for":
          var procedure = operandStack.pop();
          var limit = operandStack.pop();
          var increment = operandStack.pop();
          var initial = operandStack.pop();
          for (var i = 0; i < limit; i += increment) {
            operandStack.push(i);
            executionStack.push(procedure.slice());
          }
          break;

        case "dup":
          dump("duplicate: " + operandStack.peek());
          operandStack.push(operandStack.peek());
          break;

        case "mark":
          operandStack.push("mark");
          break;

        case "cleartomark":
          var command = "";
          do {
            command = operandStack.pop();
          } while (command != "mark");
          break;

        case "put":
          var data = operandStack.pop();
          var indexOrKey = operandStack.pop();
          var object = operandStack.pop();
          dump("put " + data + " in " + object + "[" + indexOrKey + "]");
          object.set ? object.set(indexOrKey, data)
                     : object[indexOrKey] = data;
          break;

        case "pop":
          operandStack.pop();
          break;

        case "exch":
          var operand1 = operandStack.pop();
          var operand2 = operandStack.pop();
          operandStack.push(operand1);
          operandStack.push(operand2);
          break;

        case "get":
          var indexOrKey = operandStack.pop();
          var object = operandStack.pop();
          var data = object.get ? object.get(indexOrKey) : object[indexOrKey];
          dump("get " + object + "[" + indexOrKey + "]: " + data);
          operandStack.push(data);
          break;

        case "currentdict":
          var dict = dictionaryStack.peek();
          operandStack.push(dict);
          break;

        case "systemdict":
          operandStack.push(systemDict);
          break;

        case "readonly":
        case "executeonly":
        case "noaccess":
          // Do nothing for the moment
          break;

        case "currentfile":
          operandStack.push("currentfile");
          break;

        case "array":
          var size = operandStack.pop();
          var array = new Array(size);
          operandStack.push(array);
          break;

        case "dict":
          var size = operandStack.pop();
          var dict = new Dict(size);
          operandStack.push(dict);
          break;

        case "begin":
          dictionaryStack.push(operandStack.pop());
          break;

        case "end":
          dictionaryStack.pop();
          break;

        case "def":
          var value = operandStack.pop();
          var key = operandStack.pop();
          dump("def: " + key + " = " + value);
          dictionaryStack.peek().set(key, value);
          break;

        case "definefont":
          var font = operandStack.pop();
          var key = operandStack.pop();
          dump("definefont " + font + " with key: " + key);

          // The key will be the identifier to recognize this font
          fontName = key;
          PSFonts.set(key, font);

          operandStack.push(font);
          break;

        case "known":
          var name = operandStack.pop();
          var dict = operandStack.pop();
          var data = !!dict.get(name);
          dump("known: " + data + " :: " + name + " in dict: " + dict);
          operandStack.push(data);
          break;

        case "exec":
          executionStack.push(operandStack.pop());
          break;

        case "eexec":
          // All the first segment data has been read, decrypt the second segment
          // and start interpreting it in order to decode it
          var file = operandStack.pop();
          var eexecString = decrypt(aBinaryStream, kEexecEncryptionKey, 4).join("");
          dump(eexecString);
          lexer = new Lexer(new StringStream(eexecString));
          break;

        case "LenIV":
          error("LenIV: argh! we need to modify the length of discard characters for charStrings");
          break;

        case "closefile":
          var file = operandStack.pop();
          return true;
          break;

        case "index":
          var operands = [];
          var size = operandStack.pop();
          for (var i = 0; i < size; i++)
            operands.push(operandStack.pop());

          var newOperand = operandStack.peek();

          while (operands.length)
            operandStack.push(operands.pop());

          operandStack.push(newOperand);
          break;

        case "string":
          var size = operandStack.pop();
          var str = (new Array(size + 1)).join(" ");
          operandStack.push(str);
          break;

        case "readstring":
          var str = operandStack.pop();
          var size = str.length;

          var file = operandStack.pop();

          // Add '1' because of the space separator, this is dirty
          var stream = lexer.stream.makeSubStream(lexer.stream.pos + 1, size);
          lexer.stream.skip(size + 1);

          var charString = decrypt(stream, kCharStringsEncryptionKey, 4).join("");
          var charStream = new StringStream(charString);
          var decodedCharString = decodeCharString(charStream);
          dump("decodedCharString: " + decodedCharString);
          operandStack.push(decodedCharString);

          // boolean indicating if the operation is a success or not
          operandStack.push(true);
          break;

        case "StandardEncoding":
          // For some reason the value is considered as a command, maybe it is
          // because of the uppercase 'S'
          operandStack.push(obj.cmd);
          break;

        default:
          var command = null;
          if (IsCmd(obj)) {
            for (var i = 0; i < dictionaryStack.count(); i++) {
              if (command = dictionaryStack.get(i).get(obj.cmd)) {
                dump("found in dictionnary for " + obj.cmd + " command: " + command);
                executionStack.push(command.slice());
                break;
              }
            }
          }

          if (!command) {
            log("operandStack: " + operandStack);
            log("dictionaryStack: " + dictionaryStack);
            log(obj);
            error("Unknow command while parsing font");
          }
          break;
      }
    } else if (obj) {
      dump("unknow: " + obj);
      operandStack.push(obj);
    } else { // The End!
      operandStack.dump();
      return true;
    }

    return false;
  }

  /*
   * Flatten the commands by interpreting the postscript code and replacing
   * every 'callsubr', 'callothersubr' by the real commands.
   * At the moment OtherSubrs are not fully supported and only otherSubrs 0-4
   * as descrived in 'Using Subroutines' of 'Adobe Type 1 Font Format',
   * chapter 8.
   */
  this.flattenCharstring = function(aCharstring, aDefaultWidth, aSubrs) {
    operandStack.clear();
    executionStack.clear();
    executionStack.push(aCharstring);

    var leftSidebearing = 0;
    var lastPoint = 0;
    while (true) {
      var obj = nextInStack();
      if (IsBool(obj) || IsInt(obj) || IsNum(obj)) {
        dump("Value: " + obj);
        operandStack.push(obj);
      } else if (IsString(obj)) {
        dump("String: " + obj);
        switch (obj) {
          case "hsbw":
            var charWidthVector = operandStack.pop();
            leftSidebearing = operandStack.pop();

            if (charWidthVector != aDefaultWidth)
              operandStack.push(charWidthVector - aDefaultWidth);
            break;

          case "rmoveto":
            var dy = operandStack.pop();
            var dx = operandStack.pop();

            if (leftSidebearing) {
              dx += leftSidebearing;
              leftSidebearing = 0;
            }

            operandStack.push(dx);
            operandStack.push(dy);
            operandStack.push("rmoveto");
            break;

          case "div":
            var num2 = operandStack.pop();
            var num1 = operandStack.pop();
            operandStack.push(num2 / num1);
            break;

          case "setcurrentpoint":
          case "dotsection":
          case "seac":
          case "sbw":
            error(obj + " parsing is not implemented (yet)");
            break;

          case "closepath":
          case "return":
            break;

          case "vstem3":
          case "vstem":
            operandStack.push("vstem");
            break;

          case "hstem":
          case "hstem3":
            operandStack.push("hstem");
            break;

          case "callsubr":
            var index = operandStack.pop();
            executionStack.push(aSubrs[index].slice());
            break;

          case "callothersubr":
            // XXX need to be improved
            var index = operandStack.pop();
            var count = operandStack.pop();
            var data = operandStack.pop();
            if (index != 3)
              dump("callothersubr for index: " + index);
            operandStack.push(3);
            operandStack.push("callothersubr");
            break;

          case "endchar":
            operandStack.push("endchar");
            return operandStack.clone();

          case "pop":
            operandStack.pop();
            break;

          default:
            operandStack.push(obj);
            break;
        }
      }
    }
  }
};


var fontCount = 0;
var CFF = function(aFontName, aFontFile) {
  if (!fontCount || true) {
    fontCount++;
    var start = Date.now();

    var ASCIIStream = aFontFile.makeSubStream(0, aFontFile.dict.get("Length1"), aFontFile.dict);
    var binaryStream = aFontFile.makeSubStream(aFontFile.dict.get("Length1"), aFontFile.dict.get("Length2"), aFontFile.dict);

    this.parser = new Type1Parser(ASCIIStream, binaryStream);
    var fontName = this.parser.parse();
    this.font = PSFonts.get(fontName);
    this.data = this.convertToCFF(this.font);
    var end = Date.now();
    //log("Time to parse font is:" + (end - start));
  }
};

CFF.prototype = {
  getDefaultWidth: function(aCharstrings) {
    var defaultWidth = 0;
    var defaultUsedCount = 0;

    var widths = {};
    for (var i = 0; i < aCharstrings.length; i++) {
      var width = aCharstrings[i].charstring[1];
      var usedCount = (widths[width] || 0) + 1;

      if (usedCount > defaultUsedCount) {
        defaultUsedCount = usedCount;
        defaultWidth = width;
      }

      widths[width] = usedCount;
    }
    return parseInt(defaultWidth);
  },

  createCFFIndexHeader: function(aObjects, aIsByte) {
    var data = [];

    // First 2 bytes contains the number of objects contained into this index
    var count = aObjects.length;
    if (count ==0)
      return [0x00, 0x00, 0x00];

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

      if (aObjects[i])
        relativeOffset += aObjects[i].length;
    }

    for (var i =0; i < count; i++) {
      for (var j = 0; j < aObjects[i].length; j++)
        data.push(aIsByte ? aObjects[i][j] : aObjects[i].charCodeAt(j));
    }
    return data;
  },

  encodeNumber: function(aValue) {
    var x = 0;
    // XXX we don't really care about Type2 optimization here...
    if (aValue >= -32768 && aValue <= 32767) {
      return [
        28,
        FontsUtils.integerToBytes(aValue >> 8, 1),
        FontsUtils.integerToBytes(aValue, 1)
      ];
    } else if (aValue >= (-2147483647-1) && aValue <= 2147483647) {
      return [
        0xFF,
        FontsUtils.integerToBytes(aValue >> 24, 1),
        FontsUtils.integerToBytes(aValue >> 16, 1),
        FontsUtils.integerToBytes(aValue >> 8, 1),
        FontsUtils.integerToBytes(aValue, 1)
      ];
    } else {
      error("Value: " + aValue + " is not allowed");
    }
  },

  getOrderedCharStrings: function(aFont) {
    var dict = aFont.get("CharStrings")
    var charstrings = [];
    for (var glyph in dict.map) {
      var unicode = GlyphsUnicode[glyph];
      if (!unicode) {
        if (glyph != ".notdef")
          warn(glyph + " does not have an entry in the glyphs unicode dictionary");
        continue;
      }

      var b1 = parseInt("0x" + unicode[0] + unicode[1]);
      var b2 = parseInt("0x" + unicode[2] + unicode[3]);
      unicode = FontsUtils.bytesToInteger([b1, b2]);

      charstrings.push({
        glyph: glyph,
        unicode: unicode,
        charstring: dict.map[glyph].slice()
      });
    }

    charstrings.sort(function(a, b) {
      return a.unicode > b.unicode;
    });
    return charstrings;
  },

  convertToCFF: function(aFont) {
    var debug = false;
    function dump(aMsg) {
      if (debug)
        log(aMsg);
    };

    var charstrings = this.getOrderedCharStrings(aFont);
    var defaultWidth = this.getDefaultWidth(charstrings);

    var charstringsCount = 0;
    var charstringsDataLength = 0;
    var glyphs = [];
    var glyphsChecker = {};
    var subrs = aFont.get("Private").get("Subrs");
    var parser = new Type1Parser();
    for (var i = 0; i < charstrings.length; i++) {
      var charstring = charstrings[i].charstring.slice();
      var glyph = charstrings[i].glyph;
      if (glyphsChecker[glyph])
        error("glyphs already exists!");
      glyphsChecker[glyph] = true;

      var flattened = parser.flattenCharstring(charstring, defaultWidth, subrs);
      glyphs.push(flattened);
      charstringsCount++;
      charstringsDataLength += flattened.length;
    }
    dump("There is " + charstringsCount + " glyphs (size: " + charstringsDataLength + ")");

    // Create a CFF font data
    var cff = new Uint8Array(kMaxFontFileSize);
    var currentOffset = 0;

    // Font header (major version, minor version, header size, offset size)
    var header = [0x01, 0x00, 0x04, 0x04];
    currentOffset += header.length;
    cff.set(header);

    // Names Index
    var nameIndex = this.createCFFIndexHeader([aFont.get("FontName")]);
    cff.set(nameIndex, currentOffset);
    currentOffset += nameIndex.length;

    // Calculate strings before writing the TopDICT index in order
    // to calculate correct relative offsets for storing 'charset'
    // and 'charstrings' data
    var fontInfo = aFont.get("FontInfo");
    var version = fontInfo.get("version");
    var notice = fontInfo.get("Notice");
    var fullName = fontInfo.get("FullName");
    var familyName = fontInfo.get("FamilyName");
    var weight = fontInfo.get("Weight");
    var strings = [version, notice, fullName,
                   familyName, weight, "asteriskmath"];
    var stringsIndex = this.createCFFIndexHeader(strings);
    var stringsDataLength = stringsIndex.length;

    // Create the global subroutines index
    var globalSubrsIndex = this.createCFFIndexHeader([]);

    // Fill the charset header (first byte is the encoding)
    var charset = [0x00];
    for (var i = 0; i < glyphs.length; i++) {
      var index = CFFStrings.indexOf(charstrings[i].glyph);
      if (index == -1)
        index = CFFStrings.length + strings.indexOf(glyph);
      var bytes = FontsUtils.integerToBytes(index, 2);
      charset.push(bytes[0]);
      charset.push(bytes[1]);
    }

    // Convert charstrings
    var getNumFor = {
      "hstem": 1,
      "vstem": 3,
      "vmoveto": 4,
      "rlineto": 5,
      "hlineto": 6,
      "vlineto": 7,
      "rrcurveto": 8,
      "endchar": 14,
      "rmoveto": 21,
      "hmoveto": 22,
      "vhcurveto": 30,
      "hvcurveto": 31,
    };

    // Encode the glyph and add it to the FUX
    var r = [[0x40, 0x0E]];
    for (var i = 0; i < glyphs.length; i++) {
      var data = glyphs[i].slice();
      var charstring = [];
      for (var j = 0; j < data.length; j++) {
        var c = data[j];
        if (!IsNum(c)) {
          var token = getNumFor[c];
          if (!token)
            error(c);
          charstring.push(token);
        } else {
          try {
            var bytes = this.encodeNumber(c);
          } catch(e) {
            log("Glyph " + i + " has a wrong value: " + c + " in charstring: " + data);
            log("the default value is glyph " + charstrings[i].glyph + " and is supposed to be: " + charstrings[i].charstring);
          }
          for (var k = 0; k < bytes.length; k++)
            charstring.push(bytes[k]);
        }
      }
      r.push(charstring);
    }

    var charstringsIndex = this.createCFFIndexHeader(r, true);
    charstringsIndex = charstringsIndex.join(" ").split(" "); // XXX why?


    var fontBBox = aFont.get("FontBBox");

    //Top Dict Index
    var topDictIndex = [
      0x00, 0x01, 0x01, 0x01, 0x30,
      248, 27, 0, // version
      248, 28, 1, // Notice
      248, 29, 2, // FullName
      248, 30, 3, // FamilyName
      248, 31, 4  // Weight
    ];

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

    var charstringsOffset = charsetOffset + (charstringsCount * 2) + 1;
    topDictIndex = topDictIndex.concat(this.encodeNumber(charstringsOffset));
    topDictIndex.push(17); // charstrings

    topDictIndex = topDictIndex.concat([28, 0, 55])
    var privateOffset = charstringsOffset + charstringsIndex.length;
    topDictIndex = topDictIndex.concat(this.encodeNumber(privateOffset));
    topDictIndex.push(18); // Private
    topDictIndex = topDictIndex.join(" ").split(" ");

    // Top Dict Index
    cff.set(topDictIndex, currentOffset);
    currentOffset += topDictIndex.length;

    // Strings Index
    cff.set(stringsIndex, currentOffset);
    currentOffset += stringsIndex.length;

    // Global Subrs Index
    cff.set(globalSubrsIndex, currentOffset);
    currentOffset += globalSubrsIndex.length;

    // Charset Index
    cff.set(charset, currentOffset);
    currentOffset += charset.length;

    // Fill charstrings data
    cff.set(charstringsIndex, currentOffset);
    currentOffset += charstringsIndex.length;

    // Private Data
    var privateData = [
      248, 136, 20,
      248, 136, 21,
      119, 159, 248, 97, 159, 247, 87, 159, 6,
      30, 10, 3, 150, 37, 255, 12, 9,
      139, 12, 10,
      172, 10,
      172, 150, 143, 146, 150, 146, 12, 12,
      247, 32, 11,
      247, 10, 161, 147, 154, 150, 143, 12, 13,
      139, 12, 14,
      28, 0, 55, 19
    ];
    cff.set(privateData, currentOffset);
    currentOffset += privateData.length;

    // Dump shit at the end of the file
    var shit = [
      0x00, 0x01, 0x01, 0x01,
      0x13, 0x5D, 0x65, 0x64,
      0x5E, 0x5B, 0xAF, 0x66,
      0xBA, 0xBB, 0xB1, 0xB0,
      0xB9, 0xBA, 0x65, 0xB2,
      0x5C, 0x1F, 0x0B
    ];
    cff.set(shit, currentOffset);
    currentOffset += shit.length;


    dump("==================== debug ====================");
    //var file = new Uint8Array(cff, 0, currentOffset);
    //var parser = new Type2Parser();
    //parser.parse(new Stream(file));

    var fontData = [];
    for (var i = 0; i < currentOffset; i++)
      fontData.push(cff[i]);

    //log("== write to file");
    //writeToFile(fontData, "/tmp/pdf.js." + fontCount + ".cff");

    return fontData;
  }
};

