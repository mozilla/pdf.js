/* Copyright 2021 Mozilla Foundation
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
/* eslint-disable no-var */

import {
  assert,
  bytesToString,
  FormatError,
  info,
  InvalidPDFException,
  warn,
} from "../shared/util.js";
import {
  Cmd,
  Dict,
  isCmd,
  isDict,
  isRef,
  isStream,
  Ref,
} from "./primitives.js";
import { Lexer, Parser } from "./parser.js";
import {
  MissingDataException,
  XRefEntryException,
  XRefParseException,
} from "./core_utils.js";
import { CipherTransformFactory } from "./crypto.js";

var XRef = (function XRefClosure() {
  // eslint-disable-next-line no-shadow
  function XRef(stream, pdfManager) {
    this.stream = stream;
    this.pdfManager = pdfManager;
    this.entries = [];
    this.xrefstms = Object.create(null);
    this._cacheMap = new Map(); // Prepare the XRef cache.
    this.stats = {
      streamTypes: Object.create(null),
      fontTypes: Object.create(null),
    };
    this._newRefNum = null;
  }

  XRef.prototype = {
    getNewRef: function XRef_getNewRef() {
      if (this._newRefNum === null) {
        this._newRefNum = this.entries.length;
      }
      return Ref.get(this._newRefNum++, 0);
    },

    resetNewRef: function XRef_resetNewRef() {
      this._newRefNum = null;
    },

    setStartXRef: function XRef_setStartXRef(startXRef) {
      // Store the starting positions of xref tables as we process them
      // so we can recover from missing data errors
      this.startXRefQueue = [startXRef];
    },

    parse: function XRef_parse(recoveryMode) {
      var trailerDict;
      if (!recoveryMode) {
        trailerDict = this.readXRef();
      } else {
        warn("Indexing all PDF objects");
        trailerDict = this.indexObjects();
      }
      trailerDict.assignXref(this);
      this.trailer = trailerDict;

      let encrypt;
      try {
        encrypt = trailerDict.get("Encrypt");
      } catch (ex) {
        if (ex instanceof MissingDataException) {
          throw ex;
        }
        warn(`XRef.parse - Invalid "Encrypt" reference: "${ex}".`);
      }
      if (isDict(encrypt)) {
        var ids = trailerDict.get("ID");
        var fileId = ids && ids.length ? ids[0] : "";
        // The 'Encrypt' dictionary itself should not be encrypted, and by
        // setting `suppressEncryption` we can prevent an infinite loop inside
        // of `XRef_fetchUncompressed` if the dictionary contains indirect
        // objects (fixes issue7665.pdf).
        encrypt.suppressEncryption = true;
        this.encrypt = new CipherTransformFactory(
          encrypt,
          fileId,
          this.pdfManager.password
        );
      }

      // Get the root dictionary (catalog) object, and do some basic validation.
      let root;
      try {
        root = trailerDict.get("Root");
      } catch (ex) {
        if (ex instanceof MissingDataException) {
          throw ex;
        }
        warn(`XRef.parse - Invalid "Root" reference: "${ex}".`);
      }
      if (isDict(root) && root.has("Pages")) {
        this.root = root;
      } else {
        if (!recoveryMode) {
          throw new XRefParseException();
        }
        throw new FormatError("Invalid root reference");
      }
    },

    processXRefTable: function XRef_processXRefTable(parser) {
      if (!("tableState" in this)) {
        // Stores state of the table as we process it so we can resume
        // from middle of table in case of missing data error
        this.tableState = {
          entryNum: 0,
          streamPos: parser.lexer.stream.pos,
          parserBuf1: parser.buf1,
          parserBuf2: parser.buf2,
        };
      }

      var obj = this.readXRefTable(parser);

      // Sanity check
      if (!isCmd(obj, "trailer")) {
        throw new FormatError(
          "Invalid XRef table: could not find trailer dictionary"
        );
      }
      // Read trailer dictionary, e.g.
      // trailer
      //    << /Size 22
      //      /Root 20R
      //      /Info 10R
      //      /ID [ <81b14aafa313db63dbd6f981e49f94f4> ]
      //    >>
      // The parser goes through the entire stream << ... >> and provides
      // a getter interface for the key-value table
      var dict = parser.getObj();

      // The pdflib PDF generator can generate a nested trailer dictionary
      if (!isDict(dict) && dict.dict) {
        dict = dict.dict;
      }
      if (!isDict(dict)) {
        throw new FormatError(
          "Invalid XRef table: could not parse trailer dictionary"
        );
      }
      delete this.tableState;

      return dict;
    },

    readXRefTable: function XRef_readXRefTable(parser) {
      // Example of cross-reference table:
      // xref
      // 0 1                    <-- subsection header (first obj #, obj count)
      // 0000000000 65535 f     <-- actual object (offset, generation #, f/n)
      // 23 2                   <-- subsection header ... and so on ...
      // 0000025518 00002 n
      // 0000025635 00000 n
      // trailer
      // ...

      var stream = parser.lexer.stream;
      var tableState = this.tableState;
      stream.pos = tableState.streamPos;
      parser.buf1 = tableState.parserBuf1;
      parser.buf2 = tableState.parserBuf2;

      // Outer loop is over subsection headers
      var obj;

      while (true) {
        if (!("firstEntryNum" in tableState) || !("entryCount" in tableState)) {
          if (isCmd((obj = parser.getObj()), "trailer")) {
            break;
          }
          tableState.firstEntryNum = obj;
          tableState.entryCount = parser.getObj();
        }

        var first = tableState.firstEntryNum;
        var count = tableState.entryCount;
        if (!Number.isInteger(first) || !Number.isInteger(count)) {
          throw new FormatError(
            "Invalid XRef table: wrong types in subsection header"
          );
        }
        // Inner loop is over objects themselves
        for (var i = tableState.entryNum; i < count; i++) {
          tableState.streamPos = stream.pos;
          tableState.entryNum = i;
          tableState.parserBuf1 = parser.buf1;
          tableState.parserBuf2 = parser.buf2;

          var entry = {};
          entry.offset = parser.getObj();
          entry.gen = parser.getObj();
          var type = parser.getObj();

          if (type instanceof Cmd) {
            switch (type.cmd) {
              case "f":
                entry.free = true;
                break;
              case "n":
                entry.uncompressed = true;
                break;
            }
          }

          // Validate entry obj
          if (
            !Number.isInteger(entry.offset) ||
            !Number.isInteger(entry.gen) ||
            !(entry.free || entry.uncompressed)
          ) {
            throw new FormatError(
              `Invalid entry in XRef subsection: ${first}, ${count}`
            );
          }

          // The first xref table entry, i.e. obj 0, should be free. Attempting
          // to adjust an incorrect first obj # (fixes issue 3248 and 7229).
          if (i === 0 && entry.free && first === 1) {
            first = 0;
          }

          if (!this.entries[i + first]) {
            this.entries[i + first] = entry;
          }
        }

        tableState.entryNum = 0;
        tableState.streamPos = stream.pos;
        tableState.parserBuf1 = parser.buf1;
        tableState.parserBuf2 = parser.buf2;
        delete tableState.firstEntryNum;
        delete tableState.entryCount;
      }

      // Sanity check: as per spec, first object must be free
      if (this.entries[0] && !this.entries[0].free) {
        throw new FormatError("Invalid XRef table: unexpected first object");
      }
      return obj;
    },

    processXRefStream: function XRef_processXRefStream(stream) {
      if (!("streamState" in this)) {
        // Stores state of the stream as we process it so we can resume
        // from middle of stream in case of missing data error
        var streamParameters = stream.dict;
        var byteWidths = streamParameters.get("W");
        var range = streamParameters.get("Index");
        if (!range) {
          range = [0, streamParameters.get("Size")];
        }

        this.streamState = {
          entryRanges: range,
          byteWidths,
          entryNum: 0,
          streamPos: stream.pos,
        };
      }
      this.readXRefStream(stream);
      delete this.streamState;

      return stream.dict;
    },

    readXRefStream: function XRef_readXRefStream(stream) {
      var i, j;
      var streamState = this.streamState;
      stream.pos = streamState.streamPos;

      var byteWidths = streamState.byteWidths;
      var typeFieldWidth = byteWidths[0];
      var offsetFieldWidth = byteWidths[1];
      var generationFieldWidth = byteWidths[2];

      var entryRanges = streamState.entryRanges;
      while (entryRanges.length > 0) {
        var first = entryRanges[0];
        var n = entryRanges[1];

        if (!Number.isInteger(first) || !Number.isInteger(n)) {
          throw new FormatError(`Invalid XRef range fields: ${first}, ${n}`);
        }
        if (
          !Number.isInteger(typeFieldWidth) ||
          !Number.isInteger(offsetFieldWidth) ||
          !Number.isInteger(generationFieldWidth)
        ) {
          throw new FormatError(
            `Invalid XRef entry fields length: ${first}, ${n}`
          );
        }
        for (i = streamState.entryNum; i < n; ++i) {
          streamState.entryNum = i;
          streamState.streamPos = stream.pos;

          var type = 0,
            offset = 0,
            generation = 0;
          for (j = 0; j < typeFieldWidth; ++j) {
            type = (type << 8) | stream.getByte();
          }
          // if type field is absent, its default value is 1
          if (typeFieldWidth === 0) {
            type = 1;
          }
          for (j = 0; j < offsetFieldWidth; ++j) {
            offset = (offset << 8) | stream.getByte();
          }
          for (j = 0; j < generationFieldWidth; ++j) {
            generation = (generation << 8) | stream.getByte();
          }
          var entry = {};
          entry.offset = offset;
          entry.gen = generation;
          switch (type) {
            case 0:
              entry.free = true;
              break;
            case 1:
              entry.uncompressed = true;
              break;
            case 2:
              break;
            default:
              throw new FormatError(`Invalid XRef entry type: ${type}`);
          }
          if (!this.entries[first + i]) {
            this.entries[first + i] = entry;
          }
        }

        streamState.entryNum = 0;
        streamState.streamPos = stream.pos;
        entryRanges.splice(0, 2);
      }
    },

    indexObjects: function XRef_indexObjects() {
      // Simple scan through the PDF content to find objects,
      // trailers and XRef streams.
      var TAB = 0x9,
        LF = 0xa,
        CR = 0xd,
        SPACE = 0x20;
      var PERCENT = 0x25,
        LT = 0x3c;

      function readToken(data, offset) {
        var token = "",
          ch = data[offset];
        while (ch !== LF && ch !== CR && ch !== LT) {
          if (++offset >= data.length) {
            break;
          }
          token += String.fromCharCode(ch);
          ch = data[offset];
        }
        return token;
      }
      function skipUntil(data, offset, what) {
        var length = what.length,
          dataLength = data.length;
        var skipped = 0;
        // finding byte sequence
        while (offset < dataLength) {
          var i = 0;
          while (i < length && data[offset + i] === what[i]) {
            ++i;
          }
          if (i >= length) {
            break; // sequence found
          }
          offset++;
          skipped++;
        }
        return skipped;
      }
      var objRegExp = /^(\d+)\s+(\d+)\s+obj\b/;
      const endobjRegExp = /\bendobj[\b\s]$/;
      const nestedObjRegExp = /\s+(\d+\s+\d+\s+obj[\b\s<])$/;
      const CHECK_CONTENT_LENGTH = 25;

      var trailerBytes = new Uint8Array([116, 114, 97, 105, 108, 101, 114]);
      // prettier-ignore
      var startxrefBytes = new Uint8Array([115, 116, 97, 114, 116, 120, 114,
                                           101, 102]);
      const objBytes = new Uint8Array([111, 98, 106]);
      var xrefBytes = new Uint8Array([47, 88, 82, 101, 102]);

      // Clear out any existing entries, since they may be bogus.
      this.entries.length = 0;

      var stream = this.stream;
      stream.pos = 0;
      var buffer = stream.getBytes();
      var position = stream.start,
        length = buffer.length;
      var trailers = [],
        xrefStms = [];
      while (position < length) {
        var ch = buffer[position];
        if (ch === TAB || ch === LF || ch === CR || ch === SPACE) {
          ++position;
          continue;
        }
        if (ch === PERCENT) {
          // %-comment
          do {
            ++position;
            if (position >= length) {
              break;
            }
            ch = buffer[position];
          } while (ch !== LF && ch !== CR);
          continue;
        }
        var token = readToken(buffer, position);
        var m;
        if (
          token.startsWith("xref") &&
          (token.length === 4 || /\s/.test(token[4]))
        ) {
          position += skipUntil(buffer, position, trailerBytes);
          trailers.push(position);
          position += skipUntil(buffer, position, startxrefBytes);
        } else if ((m = objRegExp.exec(token))) {
          const num = m[1] | 0,
            gen = m[2] | 0;
          if (!this.entries[num] || this.entries[num].gen === gen) {
            this.entries[num] = {
              offset: position - stream.start,
              gen,
              uncompressed: true,
            };
          }
          let contentLength,
            startPos = position + token.length;

          // Find the next "obj" string, rather than "endobj", to ensure that
          // we won't skip over a new 'obj' operator in corrupt files where
          // 'endobj' operators are missing (fixes issue9105_reduced.pdf).
          while (startPos < buffer.length) {
            const endPos = startPos + skipUntil(buffer, startPos, objBytes) + 4;
            contentLength = endPos - position;

            const checkPos = Math.max(endPos - CHECK_CONTENT_LENGTH, startPos);
            const tokenStr = bytesToString(buffer.subarray(checkPos, endPos));

            // Check if the current object ends with an 'endobj' operator.
            if (endobjRegExp.test(tokenStr)) {
              break;
            } else {
              // Check if an "obj" occurrence is actually a new object,
              // i.e. the current object is missing the 'endobj' operator.
              const objToken = nestedObjRegExp.exec(tokenStr);

              if (objToken && objToken[1]) {
                warn(
                  'indexObjects: Found new "obj" inside of another "obj", ' +
                    'caused by missing "endobj" -- trying to recover.'
                );
                contentLength -= objToken[1].length;
                break;
              }
            }
            startPos = endPos;
          }
          const content = buffer.subarray(position, position + contentLength);

          // checking XRef stream suspect
          // (it shall have '/XRef' and next char is not a letter)
          var xrefTagOffset = skipUntil(content, 0, xrefBytes);
          if (
            xrefTagOffset < contentLength &&
            content[xrefTagOffset + 5] < 64
          ) {
            xrefStms.push(position - stream.start);
            this.xrefstms[position - stream.start] = 1; // Avoid recursion
          }

          position += contentLength;
        } else if (
          token.startsWith("trailer") &&
          (token.length === 7 || /\s/.test(token[7]))
        ) {
          trailers.push(position);
          position += skipUntil(buffer, position, startxrefBytes);
        } else {
          position += token.length + 1;
        }
      }
      // reading XRef streams
      for (let i = 0, ii = xrefStms.length; i < ii; ++i) {
        this.startXRefQueue.push(xrefStms[i]);
        this.readXRef(/* recoveryMode */ true);
      }
      // finding main trailer
      let trailerDict;
      for (let i = 0, ii = trailers.length; i < ii; ++i) {
        stream.pos = trailers[i];
        const parser = new Parser({
          lexer: new Lexer(stream),
          xref: this,
          allowStreams: true,
          recoveryMode: true,
        });
        var obj = parser.getObj();
        if (!isCmd(obj, "trailer")) {
          continue;
        }
        // read the trailer dictionary
        const dict = parser.getObj();
        if (!isDict(dict)) {
          continue;
        }
        // Do some basic validation of the trailer/root dictionary candidate.
        try {
          const rootDict = dict.get("Root");
          if (!(rootDict instanceof Dict)) {
            continue;
          }
          const pagesDict = rootDict.get("Pages");
          if (!(pagesDict instanceof Dict)) {
            continue;
          }
          const pagesCount = pagesDict.get("Count");
          if (!Number.isInteger(pagesCount)) {
            continue;
          }
          // The top-level /Pages dictionary isn't obviously corrupt.
        } catch (ex) {
          continue;
        }
        // taking the first one with 'ID'
        if (dict.has("ID")) {
          return dict;
        }
        // The current dictionary is a candidate, but continue searching.
        trailerDict = dict;
      }
      // No trailer with 'ID', taking last one (if exists).
      if (trailerDict) {
        return trailerDict;
      }
      // nothing helps
      throw new InvalidPDFException("Invalid PDF structure.");
    },

    readXRef: function XRef_readXRef(recoveryMode) {
      var stream = this.stream;
      // Keep track of already parsed XRef tables, to prevent an infinite loop
      // when parsing corrupt PDF files where e.g. the /Prev entries create a
      // circular dependency between tables (fixes bug1393476.pdf).
      const startXRefParsedCache = new Set();

      try {
        while (this.startXRefQueue.length) {
          var startXRef = this.startXRefQueue[0];

          if (startXRefParsedCache.has(startXRef)) {
            warn("readXRef - skipping XRef table since it was already parsed.");
            this.startXRefQueue.shift();
            continue;
          }
          startXRefParsedCache.add(startXRef);

          stream.pos = startXRef + stream.start;

          const parser = new Parser({
            lexer: new Lexer(stream),
            xref: this,
            allowStreams: true,
          });
          var obj = parser.getObj();
          var dict;

          // Get dictionary
          if (isCmd(obj, "xref")) {
            // Parse end-of-file XRef
            dict = this.processXRefTable(parser);
            if (!this.topDict) {
              this.topDict = dict;
            }

            // Recursively get other XRefs 'XRefStm', if any
            obj = dict.get("XRefStm");
            if (Number.isInteger(obj)) {
              var pos = obj;
              // ignore previously loaded xref streams
              // (possible infinite recursion)
              if (!(pos in this.xrefstms)) {
                this.xrefstms[pos] = 1;
                this.startXRefQueue.push(pos);
              }
            }
          } else if (Number.isInteger(obj)) {
            // Parse in-stream XRef
            if (
              !Number.isInteger(parser.getObj()) ||
              !isCmd(parser.getObj(), "obj") ||
              !isStream((obj = parser.getObj()))
            ) {
              throw new FormatError("Invalid XRef stream");
            }
            dict = this.processXRefStream(obj);
            if (!this.topDict) {
              this.topDict = dict;
            }
            if (!dict) {
              throw new FormatError("Failed to read XRef stream");
            }
          } else {
            throw new FormatError("Invalid XRef stream header");
          }

          // Recursively get previous dictionary, if any
          obj = dict.get("Prev");
          if (Number.isInteger(obj)) {
            this.startXRefQueue.push(obj);
          } else if (isRef(obj)) {
            // The spec says Prev must not be a reference, i.e. "/Prev NNN"
            // This is a fallback for non-compliant PDFs, i.e. "/Prev NNN 0 R"
            this.startXRefQueue.push(obj.num);
          }

          this.startXRefQueue.shift();
        }

        return this.topDict;
      } catch (e) {
        if (e instanceof MissingDataException) {
          throw e;
        }
        info("(while reading XRef): " + e);
      }

      if (recoveryMode) {
        return undefined;
      }
      throw new XRefParseException();
    },

    getEntry: function XRef_getEntry(i) {
      var xrefEntry = this.entries[i];
      if (xrefEntry && !xrefEntry.free && xrefEntry.offset) {
        return xrefEntry;
      }
      return null;
    },

    fetchIfRef: function XRef_fetchIfRef(obj, suppressEncryption) {
      if (obj instanceof Ref) {
        return this.fetch(obj, suppressEncryption);
      }
      return obj;
    },

    fetch: function XRef_fetch(ref, suppressEncryption) {
      if (!(ref instanceof Ref)) {
        throw new Error("ref object is not a reference");
      }
      const num = ref.num;

      // The XRef cache is populated with objects which are obtained through
      // `Parser.getObj`, and indirectly via `Lexer.getObj`. Neither of these
      // methods should ever return `undefined` (note the `assert` calls below).
      const cacheEntry = this._cacheMap.get(num);
      if (cacheEntry !== undefined) {
        // In documents with Object Streams, it's possible that cached `Dict`s
        // have not been assigned an `objId` yet (see e.g. issue3115r.pdf).
        if (cacheEntry instanceof Dict && !cacheEntry.objId) {
          cacheEntry.objId = ref.toString();
        }
        return cacheEntry;
      }
      let xrefEntry = this.getEntry(num);

      if (xrefEntry === null) {
        // The referenced entry can be free.
        this._cacheMap.set(num, xrefEntry);
        return xrefEntry;
      }

      if (xrefEntry.uncompressed) {
        xrefEntry = this.fetchUncompressed(ref, xrefEntry, suppressEncryption);
      } else {
        xrefEntry = this.fetchCompressed(ref, xrefEntry, suppressEncryption);
      }
      if (isDict(xrefEntry)) {
        xrefEntry.objId = ref.toString();
      } else if (isStream(xrefEntry)) {
        xrefEntry.dict.objId = ref.toString();
      }
      return xrefEntry;
    },

    fetchUncompressed(ref, xrefEntry, suppressEncryption = false) {
      var gen = ref.gen;
      var num = ref.num;
      if (xrefEntry.gen !== gen) {
        throw new XRefEntryException(`Inconsistent generation in XRef: ${ref}`);
      }
      var stream = this.stream.makeSubStream(
        xrefEntry.offset + this.stream.start
      );
      const parser = new Parser({
        lexer: new Lexer(stream),
        xref: this,
        allowStreams: true,
      });
      var obj1 = parser.getObj();
      var obj2 = parser.getObj();
      var obj3 = parser.getObj();

      if (obj1 !== num || obj2 !== gen || !(obj3 instanceof Cmd)) {
        throw new XRefEntryException(`Bad (uncompressed) XRef entry: ${ref}`);
      }
      if (obj3.cmd !== "obj") {
        // some bad PDFs use "obj1234" and really mean 1234
        if (obj3.cmd.startsWith("obj")) {
          num = parseInt(obj3.cmd.substring(3), 10);
          if (!Number.isNaN(num)) {
            return num;
          }
        }
        throw new XRefEntryException(`Bad (uncompressed) XRef entry: ${ref}`);
      }
      if (this.encrypt && !suppressEncryption) {
        xrefEntry = parser.getObj(this.encrypt.createCipherTransform(num, gen));
      } else {
        xrefEntry = parser.getObj();
      }
      if (!isStream(xrefEntry)) {
        if (
          typeof PDFJSDev === "undefined" ||
          PDFJSDev.test("!PRODUCTION || TESTING")
        ) {
          assert(
            xrefEntry !== undefined,
            'fetchUncompressed: The "xrefEntry" cannot be undefined.'
          );
        }
        this._cacheMap.set(num, xrefEntry);
      }
      return xrefEntry;
    },

    fetchCompressed(ref, xrefEntry, suppressEncryption = false) {
      const tableOffset = xrefEntry.offset;
      const stream = this.fetch(Ref.get(tableOffset, 0));
      if (!isStream(stream)) {
        throw new FormatError("bad ObjStm stream");
      }
      const first = stream.dict.get("First");
      const n = stream.dict.get("N");
      if (!Number.isInteger(first) || !Number.isInteger(n)) {
        throw new FormatError(
          "invalid first and n parameters for ObjStm stream"
        );
      }
      let parser = new Parser({
        lexer: new Lexer(stream),
        xref: this,
        allowStreams: true,
      });
      const nums = new Array(n);
      const offsets = new Array(n);
      // read the object numbers to populate cache
      for (let i = 0; i < n; ++i) {
        const num = parser.getObj();
        if (!Number.isInteger(num)) {
          throw new FormatError(
            `invalid object number in the ObjStm stream: ${num}`
          );
        }
        const offset = parser.getObj();
        if (!Number.isInteger(offset)) {
          throw new FormatError(
            `invalid object offset in the ObjStm stream: ${offset}`
          );
        }
        nums[i] = num;
        offsets[i] = offset;
      }

      const start = (stream.start || 0) + first;
      const entries = new Array(n);
      // read stream objects for cache
      for (let i = 0; i < n; ++i) {
        const length = i < n - 1 ? offsets[i + 1] - offsets[i] : undefined;
        if (length < 0) {
          throw new FormatError("Invalid offset in the ObjStm stream.");
        }
        parser = new Parser({
          lexer: new Lexer(
            stream.makeSubStream(start + offsets[i], length, stream.dict)
          ),
          xref: this,
          allowStreams: true,
        });

        const obj = parser.getObj();
        entries[i] = obj;
        if (isStream(obj)) {
          continue;
        }
        const num = nums[i],
          entry = this.entries[num];
        if (entry && entry.offset === tableOffset && entry.gen === i) {
          if (
            typeof PDFJSDev === "undefined" ||
            PDFJSDev.test("!PRODUCTION || TESTING")
          ) {
            assert(
              obj !== undefined,
              'fetchCompressed: The "obj" cannot be undefined.'
            );
          }
          this._cacheMap.set(num, obj);
        }
      }
      xrefEntry = entries[xrefEntry.gen];
      if (xrefEntry === undefined) {
        throw new XRefEntryException(`Bad (compressed) XRef entry: ${ref}`);
      }
      return xrefEntry;
    },

    async fetchIfRefAsync(obj, suppressEncryption) {
      if (obj instanceof Ref) {
        return this.fetchAsync(obj, suppressEncryption);
      }
      return obj;
    },

    async fetchAsync(ref, suppressEncryption) {
      try {
        return this.fetch(ref, suppressEncryption);
      } catch (ex) {
        if (!(ex instanceof MissingDataException)) {
          throw ex;
        }
        await this.pdfManager.requestRange(ex.begin, ex.end);
        return this.fetchAsync(ref, suppressEncryption);
      }
    },

    getCatalogObj: function XRef_getCatalogObj() {
      return this.root;
    },
  };

  return XRef;
})();

export { XRef };
