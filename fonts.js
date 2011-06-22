/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

"use strict";

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
var Fonts = {
  _active: null,

  get active() {
    return this._active;
  },

  set active(name) {
    this._active = this[name];
  },

  charsToUnicode: function fonts_chars2Unicode(chars) {
    var active = this._active;
    if (!active)
      return chars;

    // if we translated this string before, just grab it from the cache
    var str = active.cache[chars];
    if (str)
      return str;

    // translate the string using the font's encoding
    var encoding = active.properties.encoding;
    if (!encoding)
      return chars;

    str = "";
    for (var i = 0; i < chars.length; ++i) {
      var charcode = chars.charCodeAt(i);
      var unicode = encoding[charcode];

      // Check if the glyph has already been converted
      if (unicode instanceof Name)
        unicode = encoding[unicode] = GlyphsUnicode[unicode.name];

      // Handle surrogate pairs
      if (unicode > 0xFFFF) {
        str += String.fromCharCode(unicode & 0xFFFF);
        unicode >>= 16;
      }
      str += String.fromCharCode(unicode);
    }

    // Enter the translated string into the cache
    return active.cache[chars] = str;
  }
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
    if (Fonts[name]) {
      this.font = Fonts[name].data;
      return;
    }
    fontCount++;
    fontName = name;

    // If the font is to be ignored, register it like an already loaded font
    // to avoid the cost of waiting for it be be loaded by the platform.
    if (properties.ignore || kDisableFonts) {
      Fonts[name] = {
        data: file,
        loading: false,
        properties: {},
        cache: Object.create(null)
      }
      return;
    }

    switch (properties.type) {
      case "Type1":
        var cff = new CFF(name, file, properties);
        this.mimetype = "font/opentype";

        // Wrap the CFF data inside an OTF font file
        this.font = this.convert(name, cff, properties);
        break;

      case "TrueType":
        this.mimetype = "font/opentype";

        // Repair the TrueType file if it is can be damaged in the point of
        // view of the sanitizer
        this.font = this.checkAndRepair(name, file, properties);
        break;

      default:
        warn("Font " + properties.type + " is not supported");
        break;
    }

    Fonts[name] = {
      data: this.font,
      properties: properties,
      loading: true,
      cache: Object.create(null)
    }

    // Attach the font to the document
    this.bind();
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

    // Per spec tables must be 4-bytes align so add padding as needed
    while (data.length & 3)
      data.push(0x00);

    while (offsets.virtualOffset & 3)
      offsets.virtualOffset++;

    // length
    var length = data.length;

    // checksum
    var checksum = tag.charCodeAt(0) +
                   tag.charCodeAt(1) +
                   tag.charCodeAt(2) +
                   tag.charCodeAt(3) +
                   offset +
                   length;

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
      var delta = (((start - 1) - bias) ^ 0xffff) + 1;
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

  function createOS2Table() {
    var OS2 = stringToArray(
        "\x00\x03" + // version
        "\x02\x24" + // xAvgCharWidth
        "\x01\xF4" + // usWeightClass
        "\x00\x05" + // usWidthClass
        "\x00\x00" + // fstype
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
        "\x02\x00\x06\x03\x00\x00\x00\x00\x00\x00" + // Panose
        "\xFF\xFF\xFF\xFF" + // ulUnicodeRange1 (Bits 0-31)
        "\xFF\xFF\xFF\xFF" + // ulUnicodeRange1 (Bits 32-63)
        "\xFF\xFF\xFF\xFF" + // ulUnicodeRange1 (Bits 64-95)
        "\xFF\xFF\xFF\xFF" + // ulUnicodeRange1 (Bits 96-127)
        "\x2A\x32\x31\x2A" + // achVendID
        "\x00\x20" + // fsSelection
        "\x00\x2D" + // usFirstCharIndex
        "\x00\x7A" + // usLastCharIndex
        "\x00\x03" + // sTypoAscender
        "\x00\x20" + // sTypeDescender
        "\x00\x38" + // sTypoLineGap
        "\x00\x5A" + // usWinAscent
        "\x02\xB4" + // usWinDescent
        "\x00\xCE\x00\x00" + // ulCodePageRange1 (Bits 0-31)
        "\x00\x01\x00\x00" + // ulCodePageRange2 (Bits 32-63)
        "\x00\x00" + // sxHeight
        "\x00\x00" + // sCapHeight
        "\x00\x01" + // usDefaultChar
        "\x00\xCD" + // usBreakChar
        "\x00\x02"   // usMaxContext
      );
    return OS2;
  };

  /**
   * A bunch of the OpenType code is duplicate between this class and the
   * TrueType code, this is intentional and will merge in a future version
   * where all the code relative to OpenType will probably have its own
   * class and will take decision without the Fonts consent.
   * But at the moment it allows to develop around the TrueType rewriting
   * on the fly without messing up with the 'regular' Type1 to OTF conversion.
   */
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
        var ttf = Uint8Array(kMaxFontFileSize);

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
        var OS2 = createOS2Table();
        tables.push({
          tag: "OS/2",
          data: OS2
        });

        // Replace the old CMAP table with a shiny new one
        replaceCMapTable(cmap, font, properties);

        // Rewrite the 'post' table if needed
        if (!post) {
          post =
            "\x00\x03\x00\x00" + // Version number
            "\x00\x00\x01\x00" + // italicAngle
            "\x00\x00" +         // underlinePosition
            "\x00\x00" +         // underlineThickness
            "\x00\x00\x00\x00" + // isFixedPitch
            "\x00\x00\x00\x00" + // minMemType42
            "\x00\x00\x00\x00" + // maxMemType42
            "\x00\x00\x00\x00" + // minMemType1
            "\x00\x00\x00\x00";  // maxMemType1

          tables.unshift({
            tag: "post",
            data: stringToArray(post)
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

    convert: function font_convert(name, font, properties) {
      var otf = Uint8Array(kMaxFontFileSize);

      function createNameTable(name) {
        var names = [
          "See original licence",  // Copyright
          name,                   // Font family
          "undefined",             // Font subfamily (font weight)
          "uniqueID",              // Unique ID
          name,                   // Full font name
          "0.1",                   // Version
          "undefined",             // Postscript name
          "undefined",             // Trademark
          "undefined",             // Manufacturer
          "undefined"              // Designer
        ];

        var name =
          "\x00\x00" + // format
          "\x00\x0A" + // Number of names Record
          "\x00\x7E";  // Storage

        // Build the name records field
        var strOffset = 0;
        for (var i = 0; i < names.length; i++) {
          var str = names[i];

          var nameRecord =
            "\x00\x01" + // platform ID
            "\x00\x00" + // encoding ID
            "\x00\x00" + // language ID
            "\x00\x00" + // name ID
            string16(str.length) +
            string16(strOffset);
          name += nameRecord;

          strOffset += str.length;
        }

        name += names.join("");
        return name;
      }

      // Required Tables
      var CFF =
        font.data,  // PostScript Font Program
        OS2,         // OS/2 and Windows Specific metrics
        cmap,        // Character to glyphs mapping
        head,        // Font eader
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
      OS2 = createOS2Table();
      createTableEntry(otf, offsets, "OS/2", OS2);

      //XXX Getting charstrings here seems wrong since this is another CFF glue
      var charstrings = font.getOrderedCharStrings(properties.glyphs);

      /** CMAP */
      cmap = createCMapTable(charstrings);
      createTableEntry(otf, offsets, "cmap", cmap);

      /** HEAD */
      head = stringToArray(
              "\x00\x01\x00\x00" + // Version number
              "\x00\x00\x50\x00" + // fontRevision
              "\x00\x00\x00\x00" + // checksumAdjustement
              "\x5F\x0F\x3C\xF5" + // magicNumber
              "\x00\x00" + // Flags
              "\x03\xE8" + // unitsPerEM (defaulting to 1000)
              "\x00\x00\x00\x00\x00\x00\x00\x00" + // creation date
              "\x00\x00\x00\x00\x00\x00\x00\x00" + // modifification date
              "\x00\x00" + // xMin
              "\x00\x00" + // yMin
              "\x00\x00" + // xMax
              "\x00\x00" + // yMax
              "\x00\x00" + // macStyle
              "\x00\x00" + // lowestRecPPEM
              "\x00\x00" + // fontDirectionHint
              "\x00\x00" + // indexToLocFormat
              "\x00\x00"   // glyphDataFormat
      );
      createTableEntry(otf, offsets, "head", head);

      /** HHEA */
      hhea = stringToArray(
                 "\x00\x01\x00\x00" + // Version number
                 "\x00\x00" + // Typographic Ascent
                 "\x00\x00" + // Typographic Descent
                 "\x00\x00" + // Line Gap
                 "\xFF\xFF" + // advanceWidthMax
                 "\x00\x00" + // minLeftSidebearing
                 "\x00\x00" + // minRightSidebearing
                 "\x00\x00" + // xMaxExtent
                 "\x00\x00" + // caretSlopeRise
                 "\x00\x00" + // caretSlopeRun
                 "\x00\x00" + // caretOffset
                 "\x00\x00" + // -reserved-
                 "\x00\x00" + // -reserved-
                 "\x00\x00" + // -reserved-
                 "\x00\x00" + // -reserved-
                 "\x00\x00" + // metricDataFormat
                 string16(charstrings.length)
      );
      createTableEntry(otf, offsets, "hhea", hhea);

      /** HMTX */
      hmtx = "\x01\xF4\x00\x00";
      for (var i = 0; i < charstrings.length; i++) {
        var charstring = charstrings[i].charstring;
        var width = charstring[1];
        var lsb = charstring[0];
        hmtx += string16(width) + string16(lsb);
      }
      hmtx = stringToArray(hmtx);
      createTableEntry(otf, offsets, "hmtx", hmtx);

      /** MAXP */
      maxp = "\x00\x00\x50\x00" + // Version number
             string16(charstrings.length + 1); // Num of glyphs (+1 to pass the sanitizer...)
      maxp = stringToArray(maxp);
      createTableEntry(otf, offsets, "maxp", maxp);

      /** NAME */
      name = stringToArray(createNameTable(name));
      createTableEntry(otf, offsets, "name", name);

      /** POST */
      // TODO: get those informations from the FontInfo structure
      post = "\x00\x03\x00\x00" + // Version number
             "\x00\x00\x01\x00" + // italicAngle
             "\x00\x00" + // underlinePosition
             "\x00\x00" + // underlineThickness
             "\x00\x00\x00\x00" + // isFixedPitch
             "\x00\x00\x00\x00" + // minMemType42
             "\x00\x00\x00\x00" + // maxMemType42
             "\x00\x00\x00\x00" + // minMemType1
             "\x00\x00\x00\x00";  // maxMemType1
      post = stringToArray(post);
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

    bind: function font_bind() {
      var data = this.font;
      var fontName = this.name;

      /** Hack begin */

      // Actually there is not event when a font has finished downloading so
      // the following code are a dirty hack to 'guess' when a font is ready
      var canvas = document.createElement("canvas");
      var style = "border: 1px solid black; position:absolute; top: " +
                   (debug ? (100 * fontCount) : "-200") + "px; left: 2px; width: 340px; height: 100px";
      canvas.setAttribute("style", style);
      canvas.setAttribute("width", 340);
      canvas.setAttribute("heigth", 100);
      document.body.appendChild(canvas);

      // Get the font size canvas think it will be for 'spaces'
      var ctx = canvas.getContext("2d");
      ctx.font = "bold italic 20px " + fontName + ", Symbol, Arial";
      var testString = "   ";

      // When debugging use the characters provided by the charsets to visually
      // see what's happening instead of 'spaces'
      var debug = false;
      if (debug) {
        var name = document.createElement("font");
        name.setAttribute("style", "position: absolute; left: 20px; top: " +
                          (100 * fontCount + 60) + "px");
        name.innerHTML = fontName;
        document.body.appendChild(name);

        // Retrieve font charset
        var charset = Fonts[fontName].properties.charset || [];

        // if the charset is too small make it repeat a few times
        var count = 30;
        while (count-- && charset.length <= 30)
          charset = charset.concat(charset.slice());

        for (var i = 0; i < charset.length; i++) {
          var unicode = GlyphsUnicode[charset[i]];
          if (!unicode)
            continue;
          testString += String.fromCharCode(unicode);
        }

        ctx.fillText(testString, 20, 20);
      }

      // Periodicaly check for the width of the testString, it will be
      // different once the real font has loaded
      var textWidth = ctx.measureText(testString).width;

      var interval = window.setInterval(function canvasInterval(self) {
        this.start = this.start || Date.now();
        ctx.font = "bold italic 20px " + fontName + ", Symbol, Arial";

        // For some reasons the font has not loaded, so mark it loaded for the
        // page to proceed but cry
        if ((Date.now() - this.start) >= kMaxWaitForFontFace) {
          window.clearInterval(interval);
          Fonts[fontName].loading = false;
          warn("Is " + fontName + " for charset: " + charset + " loaded?");
          this.start = 0;
        } else if (textWidth != ctx.measureText(testString).width) {
          window.clearInterval(interval);
          Fonts[fontName].loading = false;
          this.start = 0;
        }

        if (debug)
          ctx.fillText(testString, 20, 50);
      }, 30, this);

      /** Hack end */

      // Get the base64 encoding of the binary font data
      var str = "";
      var length = data.length;
      for (var i = 0; i < length; ++i)
        str += String.fromCharCode(data[i]);

      var base64 = window.btoa(str);

      // Add the @font-face rule to the document
      var url = "url(data:" + this.mimetype + ";base64," + base64 + ");";
      var rule = "@font-face { font-family:'" + fontName + "';src:" + url + "}";
      var styleSheet = document.styleSheets[0];
      styleSheet.insertRule(rule, styleSheet.length);
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
      bytes.set([value >> 8, value]);
      return [bytes[0], bytes[1]];
    } else if (bytesCount == 4) {
      bytes.set([value >> 24, value >> 16, value >> 8, value]);
      return [bytes[0], bytes[1], bytes[2], bytes[3]];
    }
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

      "12": "div",

      // callothersubr is a mechanism to make calls on the postscript
      // interpreter.
      // TODO When decodeCharstring encounter such a command it should
      //      directly do:
      //        - pop the previous charstring[] command into 'index'
      //        - pop the previous charstring[] command and ignore it, it is
      //          normally the number of element to push on the stack before
      //          the command but since everything will be pushed on the stack
      //          by the PS interpreter when it will read them that is safe to
      //          ignore this command
      //        - push the content of the OtherSubrs[index] inside charstring[]
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

  function decodeCharString(array) {
    var charString = [];

    var value = "";
    var count = array.length;
    for (var i = 0; i < count; i++) {
      value = parseInt(array[i]);

      if (value < 32) {
        var command = null;
        if (value == 12) {
          var escape = array[++i];
          command = charStringDictionary["12"][escape];
        } else {
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
        var byte = array[++i];
        var high = (byte >> 1);
        value = (byte - high) << 24 | array[++i] << 16 |
                array[++i] << 8 | array[++i];
      }

      charString.push(value);
    }

    return charString;
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
        var subr = decodeCharString(encodedSubr);

        subrs.push(subr);
        i += 3 + length;
      } else if (inGlyphs && c == 0x52) {
        length = parseInt(length);
        var data = eexecString.slice(i + 3, i + 3 + length);
        var encodedCharstring = decrypt(data, kCharStringsEncryptionKey, 4);
        var subr = decodeCharString(encodedCharstring);

        glyphs.push({
            glyph: glyph,
            data: subr
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
const CFFStrings = [
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

var CFF = function(name, file, properties) {
  // Get the data block containing glyphs and subrs informations
  var length1 = file.dict.get("Length1");
  var length2 = file.dict.get("Length2");
  file.skip(length1);
  var eexecBlock = file.getBytes(length2);

  // Decrypt the data blocks and retrieve the informations from it
  var parser = new Type1Parser();
  var fontInfo = parser.extractFontProgram(eexecBlock);

  properties.subrs = fontInfo.subrs;
  properties.glyphs = fontInfo.charstrings;
  this.data = this.wrap(name, properties);
};

CFF.prototype = {
  createCFFIndexHeader: function(objects, isByte) {
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

  encodeNumber: function(value) {
    var x = 0;
    if (value >= -32768 && value <= 32767) {
      return [ 28, value >> 8, value & 0xFF ];
    } else if (value >= (-2147483647-1) && value <= 2147483647) {
      return [ 0xFF, value >> 24, Value >> 16, value >> 8, value & 0xFF ];
    } else {
      error("Value: " + value + " is not allowed");
    }
  },

  getOrderedCharStrings: function(glyphs) {
    var charstrings = [];

    for (var i = 0; i < glyphs.length; i++) {
      var glyph = glyphs[i].glyph;
      var unicode = GlyphsUnicode[glyph];
      if (!unicode) {
        if (glyph != ".notdef")
          warn(glyph + " does not have an entry in the glyphs unicode dictionary");
      } else {
        charstrings.push({
          glyph: glyph,
          unicode: unicode,
          charstring: glyphs[i].data.slice()
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
    "endchar": 14,
    "rmoveto": 21,
    "hmoveto": 22,
    "vhcurveto": 30,
    "hvcurveto": 31,
  },

  flattenCharstring: function flattenCharstring(glyph, charstring, subrs) {
    var i = 0;
    while (true) {
      var obj = charstring[i];
      if (obj == null)
        return [];

      if (obj.charAt) {
        switch (obj) {
          case "callsubr":
            var subr = subrs[charstring[i - 1]].slice();
            if (subr.length > 1) {
              subr = this.flattenCharstring(glyph, subr, subrs);
              subr.pop();
              charstring.splice(i - 1, 2, subr);
            } else {
              charstring.splice(i - 1, 2);
            }
            i -= 1;
            break;

          case "callothersubr":
            var index = charstring[i - 1];
            var count = charstring[i - 2];
            var data = charstring[i - 3];

            // XXX The callothersubr needs to support at least the 3 defaults
            // otherSubrs of the spec
            if (index != 3)
              error("callothersubr for index: " + index + " (" + charstring + ")");

            if (!data) {
              charstring.splice(i - 2, 4, "pop", 3);
              i -= 3;
            } else {
              // 5 to remove the arguments, the callothersubr call and the pop command
              charstring.splice(i - 3, 5, 3);
              i -= 3;
            }
            break;

          case "div":
            var num2 = charstring[i - 1];
            var num1 = charstring[i - 2];
            charstring.splice(i - 2, 3, num1 / num2);
            i -= 2;
            break;

          case "pop":
            if (i)
              charstring.splice(i - 2, 2);
            else
              charstring.splice(i - 1, 1);
            i -= 1;
            break;


          case "hsbw":
            var charWidthVector = charstring[i - 1];
            var leftSidebearing = charstring[i - 2];

            if (leftSidebearing)
              charstring.splice(i - 2, 3, charWidthVector, leftSidebearing, "hmoveto");
            else
              charstring.splice(i - 2, 3, charWidthVector);
            break;

          case "endchar":
          case "return":
            // CharString is ready to be re-encode to commands number at this point
            for (var j = 0; j < charstring.length; j++) {
              var command = charstring[j];
              if (parseFloat(command) == command) {
                charstring.splice(j, 1, 28, command >> 8, command);
                j+= 2;
              } else if (command.charAt) {
                var command = this.commandsMap[command];
                if (IsArray(command)) {
                  charstring.splice(j - 1, 1, command[0], command[1]);
                  j += 1;
                } else {
                  charstring[j] = command;
                }
              } else {
                charstring.splice(j, 1);

                // command has already been translated, just add them to the
                // charstring directly
                for (var k = 0; k < command.length; k++)
                  charstring.splice(j + k, 0, command[k]);
                j+= command.length - 1;
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
  },

  wrap: function wrap(name, properties) {
    var charstrings = this.getOrderedCharStrings(properties.glyphs);

    // Starts the conversion of the Type1 charstrings to Type2
    var charstringsCount = 0;
    var charstringsDataLength = 0;
    var glyphs = [];
    for (var i = 0; i < charstrings.length; i++) {
      var charstring = charstrings[i].charstring.slice();
      var glyph = charstrings[i].glyph;

      var flattened = this.flattenCharstring(glyph, charstring, properties.subrs);
      glyphs.push(flattened);
      charstringsCount++;
      charstringsDataLength += flattened.length;
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
    for (var i = 0; i < glyphs.length; i++) {
      var index = CFFStrings.indexOf(charstrings[i].glyph);
      if (index == -1)
        index = CFFStrings.length + strings.indexOf(glyph);
      var bytes = FontsUtils.integerToBytes(index, 2);
      charset.push(bytes[0]);
      charset.push(bytes[1]);
    }

    var charstringsIndex = this.createCFFIndexHeader([[0x40, 0x0E]].concat(glyphs), true);
    charstringsIndex = charstringsIndex.join(" ").split(" "); // XXX why?

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

    var charstringsOffset = charsetOffset + (charstringsCount * 2) + 1;
    topDictIndex = topDictIndex.concat(this.encodeNumber(charstringsOffset));
    topDictIndex.push(17); // charstrings

    topDictIndex = topDictIndex.concat([28, 0, 55])
    var privateOffset = charstringsOffset + charstringsIndex.length;
    topDictIndex = topDictIndex.concat(this.encodeNumber(privateOffset));
    topDictIndex.push(18); // Private
    topDictIndex = topDictIndex.join(" ").split(" ");

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
      28, 0, 55, 19
    ]);
    privateData = privateData.join(" ").split(" ");
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

    var fontData = [];
    for (var i = 0; i < currentOffset; i++)
      fontData.push(cff[i]);

    return fontData;
  }
};

