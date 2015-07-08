/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2015 Mozilla Foundation
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
/* globals assert, error, Dict, Name, isArray, isArrayBuffer, isBool, isDict,
           isInt, isName, isNum, isString, isRef, Ref, stringToBytes */

'use strict';

/**
 * The PDFDataWriter enables one to serialize PDF.js objects to raw PDF data.
 *
 * See the inline comments and unit tests to learn how to use this class.
 *
 * PDF32000 is mentioned several times in the inline documentation in this file.
 * This refers to the PDF 1.7 specification, which can be downloaded from
 * https://adobe.com/content/dam/Adobe/en/devnet/acrobat/pdfs/PDF32000_2008.pdf
 */
var PDFDataWriter = (function PDFDataWriterClosure() {
  // Char codes for 0...9A...F
  var NUM_TO_HEX_ORD = new Uint8Array([48, 49, 50, 51, 52, 53, 54, 55, 56, 57,
      65, 66, 67, 68, 69, 70]);
  var PDF_FALSE = new Uint8Array([102, 97, 108, 115, 101]);
  var PDF_TRUE = new Uint8Array([116, 114, 117, 101]);
  var PDF_NULL = new Uint8Array([110, 117, 108, 108]);
  var PDF_ARRAY_START = new Uint8Array([91]);
  var PDF_ARRAY_SEPARATOR = new Uint8Array([32]);
  var PDF_ARRAY_END = new Uint8Array([93]);
  var PDF_DICT_START = new Uint8Array([60, 60]);
  var PDF_DICT_SEPARATOR = new Uint8Array([32]);
  var PDF_DICT_END = new Uint8Array([62, 62]);
  var PDF_REF_SEPARATOR = new Uint8Array([32]);
  var PDF_REF_END = new Uint8Array([32, 82]);

  var PDF_STREAM_HEAD = new Uint8Array([10, 115, 116, 114, 101, 97, 109,
      10]);
  var PDF_STREAM_TAIL = new Uint8Array([10, 101, 110, 100, 115, 116, 114, 101,
      97, 109, 10]);

  var PDF_OBJ_HEAD_START = new Uint8Array([10]);
  var PDF_OBJ_HEAD_SEPARATOR = new Uint8Array([32]);
  var PDF_OBJ_HEAD_END = new Uint8Array([32, 111, 98, 106, 10]);
  var PDF_OBJ_TAIL = new Uint8Array([10, 101, 110, 100, 111, 98, 106, 10]);

  var PDF_TRAILER_START = new Uint8Array([10, 116, 114, 97, 105, 108, 101, 114,
      10]);
  var PDF_TRAILER_STARTXREF = new Uint8Array([10, 115, 116, 97, 114, 116, 120,
      114, 101, 102, 10]);
  var PDF_TRAILER_EOF = new Uint8Array([10, 37, 37, 69, 79, 70, 10]);

  var PDF_XREF_START = new Uint8Array([10, 120, 114, 101, 102, 10]);
  var PDF_XREF_SUBSECTION_SEPARATOR = new Uint8Array([32]);
  var PDF_XREF_SUBSECTION_END = new Uint8Array([10]);
  var PDF_XREF_ENTRY = new Uint8Array([48, 48, 48, 48, 48, 48, 48, 48, 48, 48,
      32, 48, 48, 48, 48, 48, 32, 102, 32, 10]);

  /**
   * Insert the decimal representation of an integer in the typed array
   * (aligned at the end of the array).
   *
   * @param {Uint8Array} array - The destination array.
   * @param {integer} n - A signed 32-bit integer to be inserted in the array.
   */
  function insertIntAsDigitsAtEnd(array, n) {
    var isNegative = n < 0;
    if (isNegative) {
      n = -n;
    }
    var i = array.length;
    do {
      array[--i] = (n % 10) + 48 | 0;
    } while ((n = n / 10 | 0) > 0);

    if (isNegative) {
      array[i - 1] = 45; // '-'
    }
  }

  /**
   * Inserts the hexadecimal representation of an integer in the typed array
   * (aligned at the end of the array).
   *
   * @param {Uint8Array} array - The destination array.
   * @param {integer} n - A signed 32-bit integer to be inserted in the array.
   */
  function insertIntAsHexAtEnd(array, n) {
    var i = array.length;
    while (n > 0 && i >= 0) {
      array[--i] = NUM_TO_HEX_ORD[n & 0xF];
      n >>= 4;
    }
    while (--i >= 0) {
      array[i] = NUM_TO_HEX_ORD[0];
    }
  }

  /**
   * @param {integer} n - A positive 32-bit integer.
   *
   * @returns number of bytes needed to fit the integer in hexadecimal form.
   */
  function getHexByteWidth(n) {
    return n < 0x100 ? 2 : n < 0x10000 ? 4 : n < 0x1000000 ? 6 : 8;
  }

  /**
   * Construct a new PDFDataWriter instance. This can be used to append data to
   * an existing PDF file, or to create a partial PDF file.
   *
   * To extend an existing PDF file for which all data is known, use:
   *
   *     new PDFDataWriter(new Uint8Array([ ... PDF data ... ]));
   *
   * To create an incremental update for a PDF file whose content is known, but
   * its byte size is not. For example, if the PDF file has a size of 123 bytes:
   *
   *     new PDFDataWriter(null, 123);
   *
   * @param {Uint8Array=} pdfData - Raw data of a valid PDF file.
   * @param {integer=} byteLengthBeforeData - Number of bytes before the data.
   */
  function PDFDataWriter(pdfData, byteLengthBeforeData) {
    assert(!pdfData || pdfData instanceof Uint8Array,
        'pdfData must be a Uint8Array if set');

    // List of Uint8Array objects. The content of each Uint8Array will not be
    // modified by this PDFDataWriter instance.
    this.data = pdfData ? [pdfData] : [];

    // The byte size of the data held by this writer.
    this.dataByteLength = pdfData ? pdfData.byteLength : 0;

    // Whether the writer has started an indirect object.
    this.inObject = false;

    // Whether the writer has started a stream object.
    this.inStream = false;

    // Map of xref object number to generation number and offset.
    this.newXRefInfo = {
      // The first entry in the XRef table, per PDF32000, 7.5.4.
      0: {
        offset: 0,
        gen: 65535,
        free: true,
      }
    };

    // Byte offset of start of last XRef table/stream in the PDF data.
    this.startXRef = 0;

    this.trailerDict = null;

    // Whether the PDF ends with a cross-reference stream. When such PDF data is
    // extended, we also have to write a stream. Otherwise (if the PDF uses a
    // plain XRef table, or a hybrid cross-reference stream) a normal XRef table
    // should be written.
    this.shouldWriteXRefStream = false;

    this.byteLengthBeforeData = byteLengthBeforeData || 0;
  }

  PDFDataWriter.prototype = {
    /**
     * The byte size of the PDF file represented by this PDFDataWriter instance.
     */
    get length() {
      return this.byteLengthBeforeData + this.dataByteLength;
    },

    /**
     * Set the byte offset of the last XRef table. This results in the Prev key
     * being written to the trailer. If not set, the Prev key is not written and
     * PDF readers will only find items that are defined by this class.
     */
    setStartXRef: function PDFDataWriter_setStartXRef(startXRef) {
      assert(isInt(startXRef), 'startXRef must be an integer');
      this.startXRef = startXRef;
      return this;
    },

    /**
     * Set the current trailer dictionary (PDF32000, 7.5.5). The keys and values
     * are shallowly copied to an internal dictionary that will be inserted when
     * the trailer is appended. This method must be called before the trailer
     *
     * @param {Dict} trailerDict
     */
    setTrailer: function PDFDataWriter_setTrailer(trailer) {
      assert(isDict(trailer) && trailer.has('Size') && trailer.has('Root'),
          'trailer must be a dict containing Size and Root');

      var keys = ['Size', 'Root', 'Encrypt', 'Info', 'ID'];
      this.shouldWriteXRefStream = isDict(trailer, 'XRef');
      if (!this.shouldWriteXRefStream) {
        keys.push('XRefStm');
      }
      this.trailerDict = new Dict();
      for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];
        if (trailer.has(key)) {
          this.trailerDict.set(key, trailer.getRaw(key));
        }
      }
      return this;
    },

    /**
     * Append a value to the PDFDataWriter. This method supports all datatypes
     * from the PDF 1.7 specification (PDF32000, 7.3). Typed arrays are appended
     * as-is, which can be used to store streams (PDF32000, 7.3.8).
     *
     * This method accepts all JavaScript primitive values (boolean, number,
     * string, null), Name, Ref, Dict, ArrayBuffer, Uint8Array and
     * arrays/objects consisting of these types. Typed arrays are stored by
     * reference in an internal buffer, other types are copied by value.
     * Do not modify the value of a typed array after passing it to append!
     */
    append: function PDFDataWriter_append(v) {
      if (isBool(v)) {
        this.appendBool(v);
      } else if (isNum(v)) {
        this.appendNum(v);
      } else if (isString(v)) {
        this.appendString(v);
      } else if (isName(v)) {
        this.appendName(v);
      } else if (isArray(v)) {
        this.appendArray(v);
      } else if (isRef(v)) {
        this.appendRef(v);
      } else if (isDict(v)) {
        this.appendDict(v);
      } else if (isArrayBuffer(v)) {
        this.appendUint8Array(v.buffer ? v : new Uint8Array(v));
      } else if (v) {
        error('Cannot append object of unknown type: ' + v);
      } else {
        this.appendNull();
      }
      return this;
    },

    /**
     * Append as a boolean object (PDF32000, 7.3.2).
     *
     * @param {boolean} v
     */
    appendBool: function PDFDataWriter_appendBool(v) {
      if (v) {
        this.appendUint8Array(PDF_TRUE);
      } else {
        this.appendUint8Array(PDF_FALSE);
      }
      return this;
    },

    /**
     * Append as a numeric object (PDF32000, 7.3.3).
     *
     * @param {number} v
     */
    appendNum: function PDFDataWriter_appendNum(v) {
      if (isInt(v)) {
        var length;
        if (v) {
          length = (v < 0 ? 1 : 0) +
            Math.ceil(Math.log(Math.abs(v) + 1) / Math.LN10);
        } else {
          length = 1;
        }
        var buf = new Uint8Array(length);
        insertIntAsDigitsAtEnd(buf, v);
        this.appendUint8Array(buf);
      } else {
        this.appendUint8Array(stringToBytes(v.toString()));
      }
      return this;
    },

    /**
     * Append as a hex-encoded string (PDF32000, 7.3.4.3).
     *
     * @param {string} v - A string of 8-bit characters (UTF8 is not supported).
     */
    appendString: function PDFDataWriter_appendString(v) {
      var buf = new Uint8Array(v.length * 2 + 2);
      buf[0] = 60; // '<'

      var offset = 0;
      for (var i = 0, ii = v.length; i < ii; ++i) {
        var c = v.charCodeAt(i);
        buf[++offset] = NUM_TO_HEX_ORD[(c >> 4) & 15];
        buf[++offset] = NUM_TO_HEX_ORD[c & 15];
      }

      buf[++offset] = 62; // '>'
      this.appendUint8Array(buf);
      return this;
    },

    /**
     * Append as a Name object (PDF32000, 7.3.5).
     *
     * @param {Name|string} v
     */
    appendName: function PDFDataWriter_appendName(v) {
      // This method accepts a string to avoid the need for the conversion of a
      // string to a Name in appendDict.
      if (typeof v !== 'string') {
        v = v.name;
      }

      // In the worst case, all characters in the name needs to be escaped.
      var buf = new Uint8Array(v.length * 3 + 1);

      buf[0] = 47; // '/'

      var offset = 0;
      for (var i = 0, ii = v.length; i < ii; ++i) {
        var c = v.charCodeAt(i) & 0xFF;
        // Regular characters are all characters except for whitespace and
        // delimiters (7.2.2). These must be escaped with a #. It is recommended
        // to escape characters outside the [33, 126] range (PDF32000, 7.3.5).
        if (c >= 33 && c <= 126 && c !== 35 && c !== 40 && c !== 41 &&
            c !== 60 && c !== 62 && c !== 91 && c !== 93 && c !== 123 &&
            c !== 125 && c !== 47 && c !== 37) {
          buf[++offset] = c;
        } else {
          // Escape character, '#xx'
          buf[++offset] = 35; // '#'
          buf[++offset] = NUM_TO_HEX_ORD[(c >> 4) & 15];
          buf[++offset] = NUM_TO_HEX_ORD[c & 15];
        }
      }
      this.appendUint8Array(buf.subarray(0, offset + 1));
      return this;
    },

    /**
     * Append as an Array object (PDF32000, 7.3.6).
     *
     * @param {Array} v - a list of objects consisting of objects that is
     *   accepted by the {@code append} method.
     */
    appendArray: function PDFDataWriter_appendArray(v) {
      this.appendUint8Array(PDF_ARRAY_START);
      if (v.length) {
        this.append(v[0]);
      }
      for (var i = 1, ii = v.length; i < ii; ++i) {
        this.appendUint8Array(PDF_ARRAY_SEPARATOR);
        this.append(v[i]);
      }
      this.appendUint8Array(PDF_ARRAY_END);
      return this;
    },

    /**
     * Append as a Dictionary object (PDF32000, 7.3.7).
     *
     * @param {Dict} v - a dictionary consisting of objects that is accepted by
     *   the {@code append} method.
     */
    appendDict: function PDFDataWriter_appendDict(v) {
      this.appendUint8Array(PDF_DICT_START);
      var map = v.map;
      for (var k in map) {
        this.appendName(k);
        this.appendUint8Array(PDF_DICT_SEPARATOR);
        this.append(map[k]);
      }
      this.appendUint8Array(PDF_DICT_END);
      return this;
    },

    /**
     * Append a null value (PDF32000, 7.3.9)
     */
    appendNull: function PDFDataWriter_appendNull() {
      this.appendUint8Array(PDF_NULL);
      return this;
    },

    /**
     * Append as an indirect reference (PDF32000, 7.3.10)
     *
     * @param {Ref} v
     */
    appendRef: function PDFDataWriter_appendRef(v) {
      this.appendNum(v.num);
      this.appendUint8Array(PDF_REF_SEPARATOR);
      this.appendNum(v.gen);
      this.appendUint8Array(PDF_REF_END);
      return this;
    },

    /**
     * Append an Uint8Array. Note that the data is saved by reference. If the
     * underlying buffer is modified, the changes will also be reflected in the
     * output of this PDFDataWriter instance.
     *
     * @param {Uint8Array} v
     */
    appendUint8Array: function PDFDataWriter_appendUint8Array(v) {
      if (v.byteLength) {
        this.data.push(v);
        this.dataByteLength += v.byteLength;
      }
      return this;
    },

    /**
     * Start a new Stream (PDF32000, 7.3.8) by appending "[dict]\nstream\n".
     * This dictionary must contain a Length key that states the size of the
     * stream, including the last line feed appended by this dict.
     *
     * Example:
     *
     *     var data = new Uint8Array([32, 32]); // some data, e.g. "  ".
     *     var streamDict = new Dict();
     *     // + 1 because of the extra newline added by startStream.
     *     streamDict.set('Length', data.byteLength + 1);
     *     new PDFDataWriter()
     *       .startStream(streamDict)
     *       .append(data)
     *       .endStream()
     *       .toUint8Array(); // --> "<</Length 3>>\nstream\n  \nendstream\n"
     *
     * @param {Dict} streamDict - Stream dictionary, containing at least Length.
     */
    startStream: function PDFDataWriter_startStream(streamDict) {
      assert(isDict(streamDict) && streamDict.has('Length'),
          'dict with a Length key is required');
      assert(!this.inStream,
          'Cannot start a new stream while the previous one is open');
      this.inStream = true;
      this.appendDict(streamDict);
      this.appendUint8Array(PDF_STREAM_HEAD);
      return this;
    },

    /**
     * End a stream started by {@code startStream}.
     */
    endStream: function PDFDataWriter_endStream() {
      assert(this.inStream, 'Cannot close a stream without opening one');
      this.inStream = false;
      this.appendUint8Array(new Uint8Array(PDF_STREAM_TAIL));
      return this;
    },

    /**
     * Start an indirect object (PDF32000, 7.3.10).
     *
     * @param {Ref} ref - The reference (object number and generation) to label
     *   the object with.
     */
    startObj: function PDFDataWriter_startObj(ref) {
      assert(isRef(ref));
      assert(!this.inObject,
          'Cannot start a new indirect object while the previous one is open');
      this.inObject = true;
      this.newXRefInfo[ref.num] = {
        // +1 because of the line feed at the start of PDF_OBJ_HEAD_START
        offset: this.length + 1,
        gen: ref.gen,
        free: false,
      };

      this.appendUint8Array(PDF_OBJ_HEAD_START);
      this.appendNum(ref.num);
      this.appendUint8Array(PDF_OBJ_HEAD_SEPARATOR);
      this.appendNum(ref.gen);
      this.appendUint8Array(PDF_OBJ_HEAD_END);
      return this;
    },

    /**
     * End the indirect object started by {@code startObj}.
     */
    endObj: function PDFDataWriter_endObj() {
      assert(this.inObject, 'Cannot close a non-existing indirect object');
      this.inObject = false;

      this.appendUint8Array(PDF_OBJ_TAIL);
      return this;
    },

    /**
     * Append the XRef table of all new indirect objects since the construction
     * of this PDFDataWriter (PDF32000, 7.5.5)
     * Append the XRef table and trailer.
     */
    appendTrailer: function PDFDataWriter_appendTrailer() {
      assert(this.trailerDict, 'setTrailer must be called first');

      if (this.shouldWriteXRefStream) {
        this._appendXRefStream();
      } else {
        this._appendXRefTable();
        this.appendUint8Array(PDF_TRAILER_START);
        this.appendDict(this.trailerDict);
      }

      this.appendUint8Array(PDF_TRAILER_STARTXREF);
      this.appendNum(this.startXRef);
      this.appendUint8Array(PDF_TRAILER_EOF);

      for (var num in this.newXRefInfo) {
        if (num !== '0') {
          delete this.newXRefInfo[num];
        }
      }

      return this;
    },

    /**
     * Append the XRef table (PDF32000, 7.5.4).
     * @private
     * @see {appendTrailer}
     */
    _appendXRefTable: function PDFDataWriter_appendXRefTable() {
      if (this.startXRef) {
        this.trailerDict.set('Prev', this.startXRef);
      }
      // +1 because PDF_XREF_START starts with a '\n'
      this.startXRef = this.length + 1;
      this.appendUint8Array(PDF_XREF_START);

      var xrefSections = this._getXRefInOrder();
      for (var i = 0, ii = xrefSections.length; i < ii; ++i) {
        var xrefSection = xrefSections[i];
        this.appendNum(xrefSection.start);
        this.appendUint8Array(PDF_XREF_SUBSECTION_SEPARATOR);
        this.appendNum(xrefSection.entries.length);
        this.appendUint8Array(PDF_XREF_SUBSECTION_END);

        for (var j = 0, jj = xrefSection.entries.length; j < jj; ++j) {
          var info = xrefSection.entries[j];

          // Use the copy constructor because the value will be modified.
          // PDF_XREF_ENTRY is '0000000000 00000 f \n'.
          var entry = new Uint8Array(PDF_XREF_ENTRY);
          insertIntAsDigitsAtEnd(entry.subarray(0, 10), info.offset);
          insertIntAsDigitsAtEnd(entry.subarray(11, 16), info.gen);
          if (!info.free) {
            entry[17] = 110; // 'n'
          }
          this.appendUint8Array(entry);
        }
      }
      return this;
    },

    /**
     * Append the XRef stream (PDF32000, 7.5.8)
     * @private
     * @see {appendTrailer}
     */
    _appendXRefStream: function PDFDataWriter_appendXRefStream() {
      if (this.startXRef) {
        this.trailerDict.set('Prev', this.startXRef);
      }
      var stmRefNum = this.trailerDict.get('Size');
      assert(isInt(stmRefNum), 'trailerDict.Size must be an integer');
      this.trailerDict.set('Size', stmRefNum + 1);

      // +1 because startObj prepends a '\n'.
      this.startXRef = this.length + 1;
      this.startObj(new Ref(stmRefNum, 0));

      var xrefSections = this._getXRefInOrder();
      var maxgen = 0;
      var maxoffset = 0;
      var xrefStreamIndex = [];
      var totalEntryCount = 0;
      var isAllUsedAndUncompressed = true;
      for (var i = 0, ii = xrefSections.length; i < ii; ++i) {
        var xrefSection = xrefSections[i];
        xrefStreamIndex.push(xrefSection.start);
        xrefStreamIndex.push(xrefSection.entries.length);
        totalEntryCount += xrefSection.entries.length;
        for (var j = 0, jj = xrefSection.entries.length; j < jj; ++j) {
          var info = xrefSection.entries[j];
          maxoffset = Math.max(maxoffset, info.offset);
          maxgen = Math.max(maxgen, info.gen);
          isAllUsedAndUncompressed = isAllUsedAndUncompressed && !info.free;
        }
      }
      // Widths are multiplied by 2 because the bytes stored using the
      // ASCIIHexDecode filter.
      var typWidth = isAllUsedAndUncompressed ? 0 : 2;
      var offWidth = getHexByteWidth(maxoffset);
      var genWidth = getHexByteWidth(maxgen);
      var fieldWidth = (typWidth + offWidth + genWidth);

      var streamData = new Uint8Array(totalEntryCount * fieldWidth + 1);
      streamData[streamData.length - 1] = 0x3E; // '>', EOD (PDF32000, 7.4.2).

      var byteOffset = 0;
      for (i = 0, ii = xrefSections.length; i < ii; ++i) {
        var xrefEntries = xrefSections[i].entries;
        for (j = 0, jj = xrefEntries.length; j < jj; ++j) {
          info = xrefEntries[j];
          var entry = streamData.subarray(byteOffset, byteOffset + fieldWidth);
          byteOffset += fieldWidth;
          if (typWidth) {
            entry[0] = NUM_TO_HEX_ORD[0];
            entry[1] = info.free ? NUM_TO_HEX_ORD[0] : NUM_TO_HEX_ORD[1];
          }
          insertIntAsHexAtEnd(entry.subarray(typWidth, typWidth + offWidth),
              info.offset);
          insertIntAsHexAtEnd(entry.subarray(typWidth + offWidth, fieldWidth),
              info.gen);
        }
      }

      var xrefDict = Dict.merge(null, [this.trailerDict]);
      xrefDict.set('Filter', new Name('ASCIIHexDecode'));
      // + 1 because of the extra newline added by startStream.
      xrefDict.set('Length', streamData.byteLength + 1);
      xrefDict.set('Type', new Name('XRef'));
      xrefDict.set('Index', xrefStreamIndex);
      xrefDict.set('W', [typWidth / 2, offWidth / 2, genWidth / 2]);

      this.startStream(xrefDict);
      this.appendUint8Array(streamData);
      this.endStream();
      this.endObj();
      return this;
    },

    /**
     * @private
     * @return {Object[]} List of {num:number,entries:Object[]} objects. Each
     *   object specifies a continuous sequence of xref entries, starting at the
     *   object number given by the "num" key.
     */
    _getXRefInOrder: function PDFDataWriter_getXRefInOrder() {
      var xrefEntries = [];

      var lastSection;
      // The XRef table must be sorted by object number, in ascending order.
      var nums = Object.keys(this.newXRefInfo).map(function(num) {
        return parseInt(num, 10);
      }).sort(function(a, b) {
        return a - b;
      });

      for (var i = 0, ii = nums.length; i < ii; ++i) {
        var num = nums[i];
        if (nums[i - 1] !== num - 1) {
          // Start a new subsection if the entry's object number is different
          // from the previous object number.
          lastSection = [];
          xrefEntries.push({start: num, entries: lastSection});
        }

        lastSection.push(this.newXRefInfo[num]);
      }

      return xrefEntries;
    },

    /**
     * Get the data of this builder as a Uint8Array. Note that the return value
     * is a direct reference to the underlying storage, so do not modify the
     * return value if you want to re-use the builder!
     *
     * @returns {Uint8Array}
     */
    toUint8Array: function PDFDataWriter_toUint8Array() {
      if (this.data.length > 1) {
        var newData = new Uint8Array(this.dataByteLength);
        var offset = 0;
        this.data.forEach(function(chunk) {
          newData.set(chunk, offset);
          offset += chunk.byteLength;
        });
        this.data.length = 1;
        this.data[0] = newData;
      }
      return this.data[0] || new Uint8Array(0);
    },
  };
  return PDFDataWriter;
})();
