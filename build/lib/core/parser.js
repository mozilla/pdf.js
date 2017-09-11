/* Copyright 2017 Mozilla Foundation
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
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Parser = exports.Linearization = exports.Lexer = undefined;

var _stream = require('./stream');

var _util = require('../shared/util');

var _primitives = require('./primitives');

var MAX_LENGTH_TO_CACHE = 1000;
var Parser = function ParserClosure() {
  function Parser(lexer, allowStreams, xref, recoveryMode) {
    this.lexer = lexer;
    this.allowStreams = allowStreams;
    this.xref = xref;
    this.recoveryMode = recoveryMode || false;
    this.imageCache = Object.create(null);
    this.refill();
  }
  Parser.prototype = {
    refill: function Parser_refill() {
      this.buf1 = this.lexer.getObj();
      this.buf2 = this.lexer.getObj();
    },
    shift: function Parser_shift() {
      if ((0, _primitives.isCmd)(this.buf2, 'ID')) {
        this.buf1 = this.buf2;
        this.buf2 = null;
      } else {
        this.buf1 = this.buf2;
        this.buf2 = this.lexer.getObj();
      }
    },
    tryShift: function Parser_tryShift() {
      try {
        this.shift();
        return true;
      } catch (e) {
        if (e instanceof _util.MissingDataException) {
          throw e;
        }
        return false;
      }
    },
    getObj: function Parser_getObj(cipherTransform) {
      var buf1 = this.buf1;
      this.shift();
      if (buf1 instanceof _primitives.Cmd) {
        switch (buf1.cmd) {
          case 'BI':
            return this.makeInlineImage(cipherTransform);
          case '[':
            var array = [];
            while (!(0, _primitives.isCmd)(this.buf1, ']') && !(0, _primitives.isEOF)(this.buf1)) {
              array.push(this.getObj(cipherTransform));
            }
            if ((0, _primitives.isEOF)(this.buf1)) {
              if (!this.recoveryMode) {
                throw new _util.FormatError('End of file inside array');
              }
              return array;
            }
            this.shift();
            return array;
          case '<<':
            var dict = new _primitives.Dict(this.xref);
            while (!(0, _primitives.isCmd)(this.buf1, '>>') && !(0, _primitives.isEOF)(this.buf1)) {
              if (!(0, _primitives.isName)(this.buf1)) {
                (0, _util.info)('Malformed dictionary: key must be a name object');
                this.shift();
                continue;
              }
              var key = this.buf1.name;
              this.shift();
              if ((0, _primitives.isEOF)(this.buf1)) {
                break;
              }
              dict.set(key, this.getObj(cipherTransform));
            }
            if ((0, _primitives.isEOF)(this.buf1)) {
              if (!this.recoveryMode) {
                throw new _util.FormatError('End of file inside dictionary');
              }
              return dict;
            }
            if ((0, _primitives.isCmd)(this.buf2, 'stream')) {
              return this.allowStreams ? this.makeStream(dict, cipherTransform) : dict;
            }
            this.shift();
            return dict;
          default:
            return buf1;
        }
      }
      if (Number.isInteger(buf1)) {
        var num = buf1;
        if (Number.isInteger(this.buf1) && (0, _primitives.isCmd)(this.buf2, 'R')) {
          var ref = new _primitives.Ref(num, this.buf1);
          this.shift();
          this.shift();
          return ref;
        }
        return num;
      }
      if ((0, _util.isString)(buf1)) {
        var str = buf1;
        if (cipherTransform) {
          str = cipherTransform.decryptString(str);
        }
        return str;
      }
      return buf1;
    },
    findDefaultInlineStreamEnd: function findDefaultInlineStreamEnd(stream) {
      var E = 0x45,
          I = 0x49,
          SPACE = 0x20,
          LF = 0xA,
          CR = 0xD;
      var n = 10,
          NUL = 0x0;
      var startPos = stream.pos,
          state = 0,
          ch = void 0,
          maybeEIPos = void 0;
      while ((ch = stream.getByte()) !== -1) {
        if (state === 0) {
          state = ch === E ? 1 : 0;
        } else if (state === 1) {
          state = ch === I ? 2 : 0;
        } else {
          (0, _util.assert)(state === 2);
          if (ch === SPACE || ch === LF || ch === CR) {
            maybeEIPos = stream.pos;
            var followingBytes = stream.peekBytes(n);
            for (var i = 0, ii = followingBytes.length; i < ii; i++) {
              ch = followingBytes[i];
              if (ch === NUL && followingBytes[i + 1] !== NUL) {
                continue;
              }
              if (ch !== LF && ch !== CR && (ch < SPACE || ch > 0x7F)) {
                state = 0;
                break;
              }
            }
            if (state === 2) {
              break;
            }
          } else {
            state = 0;
          }
        }
      }
      if (ch === -1) {
        (0, _util.warn)('findDefaultInlineStreamEnd: ' + 'Reached the end of the stream without finding a valid EI marker');
        if (maybeEIPos) {
          (0, _util.warn)('... trying to recover by using the last "EI" occurrence.');
          stream.skip(-(stream.pos - maybeEIPos));
        }
      }
      return stream.pos - 4 - startPos;
    },

    findDCTDecodeInlineStreamEnd: function Parser_findDCTDecodeInlineStreamEnd(stream) {
      var startPos = stream.pos,
          foundEOI = false,
          b,
          markerLength,
          length;
      while ((b = stream.getByte()) !== -1) {
        if (b !== 0xFF) {
          continue;
        }
        switch (stream.getByte()) {
          case 0x00:
            break;
          case 0xFF:
            stream.skip(-1);
            break;
          case 0xD9:
            foundEOI = true;
            break;
          case 0xC0:
          case 0xC1:
          case 0xC2:
          case 0xC3:
          case 0xC5:
          case 0xC6:
          case 0xC7:
          case 0xC9:
          case 0xCA:
          case 0xCB:
          case 0xCD:
          case 0xCE:
          case 0xCF:
          case 0xC4:
          case 0xCC:
          case 0xDA:
          case 0xDB:
          case 0xDC:
          case 0xDD:
          case 0xDE:
          case 0xDF:
          case 0xE0:
          case 0xE1:
          case 0xE2:
          case 0xE3:
          case 0xE4:
          case 0xE5:
          case 0xE6:
          case 0xE7:
          case 0xE8:
          case 0xE9:
          case 0xEA:
          case 0xEB:
          case 0xEC:
          case 0xED:
          case 0xEE:
          case 0xEF:
          case 0xFE:
            markerLength = stream.getUint16();
            if (markerLength > 2) {
              stream.skip(markerLength - 2);
            } else {
              stream.skip(-2);
            }
            break;
        }
        if (foundEOI) {
          break;
        }
      }
      length = stream.pos - startPos;
      if (b === -1) {
        (0, _util.warn)('Inline DCTDecode image stream: ' + 'EOI marker not found, searching for /EI/ instead.');
        stream.skip(-length);
        return this.findDefaultInlineStreamEnd(stream);
      }
      this.inlineStreamSkipEI(stream);
      return length;
    },
    findASCII85DecodeInlineStreamEnd: function Parser_findASCII85DecodeInlineStreamEnd(stream) {
      var TILDE = 0x7E,
          GT = 0x3E;
      var startPos = stream.pos,
          ch,
          length;
      while ((ch = stream.getByte()) !== -1) {
        if (ch === TILDE && stream.peekByte() === GT) {
          stream.skip();
          break;
        }
      }
      length = stream.pos - startPos;
      if (ch === -1) {
        (0, _util.warn)('Inline ASCII85Decode image stream: ' + 'EOD marker not found, searching for /EI/ instead.');
        stream.skip(-length);
        return this.findDefaultInlineStreamEnd(stream);
      }
      this.inlineStreamSkipEI(stream);
      return length;
    },
    findASCIIHexDecodeInlineStreamEnd: function Parser_findASCIIHexDecodeInlineStreamEnd(stream) {
      var GT = 0x3E;
      var startPos = stream.pos,
          ch,
          length;
      while ((ch = stream.getByte()) !== -1) {
        if (ch === GT) {
          break;
        }
      }
      length = stream.pos - startPos;
      if (ch === -1) {
        (0, _util.warn)('Inline ASCIIHexDecode image stream: ' + 'EOD marker not found, searching for /EI/ instead.');
        stream.skip(-length);
        return this.findDefaultInlineStreamEnd(stream);
      }
      this.inlineStreamSkipEI(stream);
      return length;
    },
    inlineStreamSkipEI: function Parser_inlineStreamSkipEI(stream) {
      var E = 0x45,
          I = 0x49;
      var state = 0,
          ch;
      while ((ch = stream.getByte()) !== -1) {
        if (state === 0) {
          state = ch === E ? 1 : 0;
        } else if (state === 1) {
          state = ch === I ? 2 : 0;
        } else if (state === 2) {
          break;
        }
      }
    },
    makeInlineImage: function Parser_makeInlineImage(cipherTransform) {
      var lexer = this.lexer;
      var stream = lexer.stream;
      var dict = new _primitives.Dict(this.xref);
      while (!(0, _primitives.isCmd)(this.buf1, 'ID') && !(0, _primitives.isEOF)(this.buf1)) {
        if (!(0, _primitives.isName)(this.buf1)) {
          throw new _util.FormatError('Dictionary key must be a name object');
        }
        var key = this.buf1.name;
        this.shift();
        if ((0, _primitives.isEOF)(this.buf1)) {
          break;
        }
        dict.set(key, this.getObj(cipherTransform));
      }
      var filter = dict.get('Filter', 'F'),
          filterName;
      if ((0, _primitives.isName)(filter)) {
        filterName = filter.name;
      } else if (Array.isArray(filter)) {
        var filterZero = this.xref.fetchIfRef(filter[0]);
        if ((0, _primitives.isName)(filterZero)) {
          filterName = filterZero.name;
        }
      }
      var startPos = stream.pos,
          length,
          i,
          ii;
      if (filterName === 'DCTDecode' || filterName === 'DCT') {
        length = this.findDCTDecodeInlineStreamEnd(stream);
      } else if (filterName === 'ASCII85Decode' || filterName === 'A85') {
        length = this.findASCII85DecodeInlineStreamEnd(stream);
      } else if (filterName === 'ASCIIHexDecode' || filterName === 'AHx') {
        length = this.findASCIIHexDecodeInlineStreamEnd(stream);
      } else {
        length = this.findDefaultInlineStreamEnd(stream);
      }
      var imageStream = stream.makeSubStream(startPos, length, dict);
      var adler32;
      if (length < MAX_LENGTH_TO_CACHE) {
        var imageBytes = imageStream.getBytes();
        imageStream.reset();
        var a = 1;
        var b = 0;
        for (i = 0, ii = imageBytes.length; i < ii; ++i) {
          a += imageBytes[i] & 0xff;
          b += a;
        }
        adler32 = b % 65521 << 16 | a % 65521;
        var cacheEntry = this.imageCache[adler32];
        if (cacheEntry !== undefined) {
          this.buf2 = _primitives.Cmd.get('EI');
          this.shift();
          cacheEntry.reset();
          return cacheEntry;
        }
      }
      if (cipherTransform) {
        imageStream = cipherTransform.createStream(imageStream, length);
      }
      imageStream = this.filter(imageStream, dict, length);
      imageStream.dict = dict;
      if (adler32 !== undefined) {
        imageStream.cacheKey = 'inline_' + length + '_' + adler32;
        this.imageCache[adler32] = imageStream;
      }
      this.buf2 = _primitives.Cmd.get('EI');
      this.shift();
      return imageStream;
    },
    makeStream: function Parser_makeStream(dict, cipherTransform) {
      var lexer = this.lexer;
      var stream = lexer.stream;
      lexer.skipToNextLine();
      var pos = stream.pos - 1;
      var length = dict.get('Length');
      if (!Number.isInteger(length)) {
        (0, _util.info)('Bad ' + length + ' attribute in stream');
        length = 0;
      }
      stream.pos = pos + length;
      lexer.nextChar();
      if (this.tryShift() && (0, _primitives.isCmd)(this.buf2, 'endstream')) {
        this.shift();
      } else {
        stream.pos = pos;
        var SCAN_BLOCK_SIZE = 2048;
        var ENDSTREAM_SIGNATURE_LENGTH = 9;
        var ENDSTREAM_SIGNATURE = [0x65, 0x6E, 0x64, 0x73, 0x74, 0x72, 0x65, 0x61, 0x6D];
        var skipped = 0,
            found = false,
            i,
            j;
        while (stream.pos < stream.end) {
          var scanBytes = stream.peekBytes(SCAN_BLOCK_SIZE);
          var scanLength = scanBytes.length - ENDSTREAM_SIGNATURE_LENGTH;
          if (scanLength <= 0) {
            break;
          }
          found = false;
          i = 0;
          while (i < scanLength) {
            j = 0;
            while (j < ENDSTREAM_SIGNATURE_LENGTH && scanBytes[i + j] === ENDSTREAM_SIGNATURE[j]) {
              j++;
            }
            if (j >= ENDSTREAM_SIGNATURE_LENGTH) {
              found = true;
              break;
            }
            i++;
          }
          if (found) {
            skipped += i;
            stream.pos += i;
            break;
          }
          skipped += scanLength;
          stream.pos += scanLength;
        }
        if (!found) {
          throw new _util.FormatError('Missing endstream');
        }
        length = skipped;
        lexer.nextChar();
        this.shift();
        this.shift();
      }
      this.shift();
      stream = stream.makeSubStream(pos, length, dict);
      if (cipherTransform) {
        stream = cipherTransform.createStream(stream, length);
      }
      stream = this.filter(stream, dict, length);
      stream.dict = dict;
      return stream;
    },
    filter: function Parser_filter(stream, dict, length) {
      var filter = dict.get('Filter', 'F');
      var params = dict.get('DecodeParms', 'DP');
      if ((0, _primitives.isName)(filter)) {
        if (Array.isArray(params)) {
          params = this.xref.fetchIfRef(params[0]);
        }
        return this.makeFilter(stream, filter.name, length, params);
      }
      var maybeLength = length;
      if (Array.isArray(filter)) {
        var filterArray = filter;
        var paramsArray = params;
        for (var i = 0, ii = filterArray.length; i < ii; ++i) {
          filter = this.xref.fetchIfRef(filterArray[i]);
          if (!(0, _primitives.isName)(filter)) {
            throw new _util.FormatError('Bad filter name: ' + filter);
          }
          params = null;
          if (Array.isArray(paramsArray) && i in paramsArray) {
            params = this.xref.fetchIfRef(paramsArray[i]);
          }
          stream = this.makeFilter(stream, filter.name, maybeLength, params);
          maybeLength = null;
        }
      }
      return stream;
    },
    makeFilter: function Parser_makeFilter(stream, name, maybeLength, params) {
      if (maybeLength === 0) {
        (0, _util.warn)('Empty "' + name + '" stream.');
        return new _stream.NullStream(stream);
      }
      try {
        var xrefStreamStats = this.xref.stats.streamTypes;
        if (name === 'FlateDecode' || name === 'Fl') {
          xrefStreamStats[_util.StreamType.FLATE] = true;
          if (params) {
            return new _stream.PredictorStream(new _stream.FlateStream(stream, maybeLength), maybeLength, params);
          }
          return new _stream.FlateStream(stream, maybeLength);
        }
        if (name === 'LZWDecode' || name === 'LZW') {
          xrefStreamStats[_util.StreamType.LZW] = true;
          var earlyChange = 1;
          if (params) {
            if (params.has('EarlyChange')) {
              earlyChange = params.get('EarlyChange');
            }
            return new _stream.PredictorStream(new _stream.LZWStream(stream, maybeLength, earlyChange), maybeLength, params);
          }
          return new _stream.LZWStream(stream, maybeLength, earlyChange);
        }
        if (name === 'DCTDecode' || name === 'DCT') {
          xrefStreamStats[_util.StreamType.DCT] = true;
          return new _stream.JpegStream(stream, maybeLength, stream.dict, params);
        }
        if (name === 'JPXDecode' || name === 'JPX') {
          xrefStreamStats[_util.StreamType.JPX] = true;
          return new _stream.JpxStream(stream, maybeLength, stream.dict, params);
        }
        if (name === 'ASCII85Decode' || name === 'A85') {
          xrefStreamStats[_util.StreamType.A85] = true;
          return new _stream.Ascii85Stream(stream, maybeLength);
        }
        if (name === 'ASCIIHexDecode' || name === 'AHx') {
          xrefStreamStats[_util.StreamType.AHX] = true;
          return new _stream.AsciiHexStream(stream, maybeLength);
        }
        if (name === 'CCITTFaxDecode' || name === 'CCF') {
          xrefStreamStats[_util.StreamType.CCF] = true;
          return new _stream.CCITTFaxStream(stream, maybeLength, params);
        }
        if (name === 'RunLengthDecode' || name === 'RL') {
          xrefStreamStats[_util.StreamType.RL] = true;
          return new _stream.RunLengthStream(stream, maybeLength);
        }
        if (name === 'JBIG2Decode') {
          xrefStreamStats[_util.StreamType.JBIG] = true;
          return new _stream.Jbig2Stream(stream, maybeLength, stream.dict, params);
        }
        (0, _util.warn)('filter "' + name + '" not supported yet');
        return stream;
      } catch (ex) {
        if (ex instanceof _util.MissingDataException) {
          throw ex;
        }
        (0, _util.warn)('Invalid stream: \"' + ex + '\"');
        return new _stream.NullStream(stream);
      }
    }
  };
  return Parser;
}();
var Lexer = function LexerClosure() {
  function Lexer(stream, knownCommands) {
    this.stream = stream;
    this.nextChar();
    this.strBuf = [];
    this.knownCommands = knownCommands;
  }
  var specialChars = [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  function toHexDigit(ch) {
    if (ch >= 0x30 && ch <= 0x39) {
      return ch & 0x0F;
    }
    if (ch >= 0x41 && ch <= 0x46 || ch >= 0x61 && ch <= 0x66) {
      return (ch & 0x0F) + 9;
    }
    return -1;
  }
  Lexer.prototype = {
    nextChar: function Lexer_nextChar() {
      return this.currentChar = this.stream.getByte();
    },
    peekChar: function Lexer_peekChar() {
      return this.stream.peekByte();
    },
    getNumber: function Lexer_getNumber() {
      var ch = this.currentChar;
      var eNotation = false;
      var divideBy = 0;
      var sign = 1;
      if (ch === 0x2D) {
        sign = -1;
        ch = this.nextChar();
        if (ch === 0x2D) {
          ch = this.nextChar();
        }
      } else if (ch === 0x2B) {
        ch = this.nextChar();
      }
      if (ch === 0x2E) {
        divideBy = 10;
        ch = this.nextChar();
      }
      if (ch === 0x0A || ch === 0x0D) {
        do {
          ch = this.nextChar();
        } while (ch === 0x0A || ch === 0x0D);
      }
      if (ch < 0x30 || ch > 0x39) {
        throw new _util.FormatError('Invalid number: ' + String.fromCharCode(ch) + ' (charCode ' + ch + ')');
      }
      var baseValue = ch - 0x30;
      var powerValue = 0;
      var powerValueSign = 1;
      while ((ch = this.nextChar()) >= 0) {
        if (0x30 <= ch && ch <= 0x39) {
          var currentDigit = ch - 0x30;
          if (eNotation) {
            powerValue = powerValue * 10 + currentDigit;
          } else {
            if (divideBy !== 0) {
              divideBy *= 10;
            }
            baseValue = baseValue * 10 + currentDigit;
          }
        } else if (ch === 0x2E) {
          if (divideBy === 0) {
            divideBy = 1;
          } else {
            break;
          }
        } else if (ch === 0x2D) {
          (0, _util.warn)('Badly formatted number');
        } else if (ch === 0x45 || ch === 0x65) {
          ch = this.peekChar();
          if (ch === 0x2B || ch === 0x2D) {
            powerValueSign = ch === 0x2D ? -1 : 1;
            this.nextChar();
          } else if (ch < 0x30 || ch > 0x39) {
            break;
          }
          eNotation = true;
        } else {
          break;
        }
      }
      if (divideBy !== 0) {
        baseValue /= divideBy;
      }
      if (eNotation) {
        baseValue *= Math.pow(10, powerValueSign * powerValue);
      }
      return sign * baseValue;
    },
    getString: function Lexer_getString() {
      var numParen = 1;
      var done = false;
      var strBuf = this.strBuf;
      strBuf.length = 0;
      var ch = this.nextChar();
      while (true) {
        var charBuffered = false;
        switch (ch | 0) {
          case -1:
            (0, _util.warn)('Unterminated string');
            done = true;
            break;
          case 0x28:
            ++numParen;
            strBuf.push('(');
            break;
          case 0x29:
            if (--numParen === 0) {
              this.nextChar();
              done = true;
            } else {
              strBuf.push(')');
            }
            break;
          case 0x5C:
            ch = this.nextChar();
            switch (ch) {
              case -1:
                (0, _util.warn)('Unterminated string');
                done = true;
                break;
              case 0x6E:
                strBuf.push('\n');
                break;
              case 0x72:
                strBuf.push('\r');
                break;
              case 0x74:
                strBuf.push('\t');
                break;
              case 0x62:
                strBuf.push('\b');
                break;
              case 0x66:
                strBuf.push('\f');
                break;
              case 0x5C:
              case 0x28:
              case 0x29:
                strBuf.push(String.fromCharCode(ch));
                break;
              case 0x30:
              case 0x31:
              case 0x32:
              case 0x33:
              case 0x34:
              case 0x35:
              case 0x36:
              case 0x37:
                var x = ch & 0x0F;
                ch = this.nextChar();
                charBuffered = true;
                if (ch >= 0x30 && ch <= 0x37) {
                  x = (x << 3) + (ch & 0x0F);
                  ch = this.nextChar();
                  if (ch >= 0x30 && ch <= 0x37) {
                    charBuffered = false;
                    x = (x << 3) + (ch & 0x0F);
                  }
                }
                strBuf.push(String.fromCharCode(x));
                break;
              case 0x0D:
                if (this.peekChar() === 0x0A) {
                  this.nextChar();
                }
                break;
              case 0x0A:
                break;
              default:
                strBuf.push(String.fromCharCode(ch));
                break;
            }
            break;
          default:
            strBuf.push(String.fromCharCode(ch));
            break;
        }
        if (done) {
          break;
        }
        if (!charBuffered) {
          ch = this.nextChar();
        }
      }
      return strBuf.join('');
    },
    getName: function Lexer_getName() {
      var ch, previousCh;
      var strBuf = this.strBuf;
      strBuf.length = 0;
      while ((ch = this.nextChar()) >= 0 && !specialChars[ch]) {
        if (ch === 0x23) {
          ch = this.nextChar();
          if (specialChars[ch]) {
            (0, _util.warn)('Lexer_getName: ' + 'NUMBER SIGN (#) should be followed by a hexadecimal number.');
            strBuf.push('#');
            break;
          }
          var x = toHexDigit(ch);
          if (x !== -1) {
            previousCh = ch;
            ch = this.nextChar();
            var x2 = toHexDigit(ch);
            if (x2 === -1) {
              (0, _util.warn)('Lexer_getName: Illegal digit (' + String.fromCharCode(ch) + ') in hexadecimal number.');
              strBuf.push('#', String.fromCharCode(previousCh));
              if (specialChars[ch]) {
                break;
              }
              strBuf.push(String.fromCharCode(ch));
              continue;
            }
            strBuf.push(String.fromCharCode(x << 4 | x2));
          } else {
            strBuf.push('#', String.fromCharCode(ch));
          }
        } else {
          strBuf.push(String.fromCharCode(ch));
        }
      }
      if (strBuf.length > 127) {
        (0, _util.warn)('name token is longer than allowed by the spec: ' + strBuf.length);
      }
      return _primitives.Name.get(strBuf.join(''));
    },
    getHexString: function Lexer_getHexString() {
      var strBuf = this.strBuf;
      strBuf.length = 0;
      var ch = this.currentChar;
      var isFirstHex = true;
      var firstDigit;
      var secondDigit;
      while (true) {
        if (ch < 0) {
          (0, _util.warn)('Unterminated hex string');
          break;
        } else if (ch === 0x3E) {
          this.nextChar();
          break;
        } else if (specialChars[ch] === 1) {
          ch = this.nextChar();
          continue;
        } else {
          if (isFirstHex) {
            firstDigit = toHexDigit(ch);
            if (firstDigit === -1) {
              (0, _util.warn)('Ignoring invalid character "' + ch + '" in hex string');
              ch = this.nextChar();
              continue;
            }
          } else {
            secondDigit = toHexDigit(ch);
            if (secondDigit === -1) {
              (0, _util.warn)('Ignoring invalid character "' + ch + '" in hex string');
              ch = this.nextChar();
              continue;
            }
            strBuf.push(String.fromCharCode(firstDigit << 4 | secondDigit));
          }
          isFirstHex = !isFirstHex;
          ch = this.nextChar();
        }
      }
      return strBuf.join('');
    },
    getObj: function Lexer_getObj() {
      var comment = false;
      var ch = this.currentChar;
      while (true) {
        if (ch < 0) {
          return _primitives.EOF;
        }
        if (comment) {
          if (ch === 0x0A || ch === 0x0D) {
            comment = false;
          }
        } else if (ch === 0x25) {
          comment = true;
        } else if (specialChars[ch] !== 1) {
          break;
        }
        ch = this.nextChar();
      }
      switch (ch | 0) {
        case 0x30:
        case 0x31:
        case 0x32:
        case 0x33:
        case 0x34:
        case 0x35:
        case 0x36:
        case 0x37:
        case 0x38:
        case 0x39:
        case 0x2B:
        case 0x2D:
        case 0x2E:
          return this.getNumber();
        case 0x28:
          return this.getString();
        case 0x2F:
          return this.getName();
        case 0x5B:
          this.nextChar();
          return _primitives.Cmd.get('[');
        case 0x5D:
          this.nextChar();
          return _primitives.Cmd.get(']');
        case 0x3C:
          ch = this.nextChar();
          if (ch === 0x3C) {
            this.nextChar();
            return _primitives.Cmd.get('<<');
          }
          return this.getHexString();
        case 0x3E:
          ch = this.nextChar();
          if (ch === 0x3E) {
            this.nextChar();
            return _primitives.Cmd.get('>>');
          }
          return _primitives.Cmd.get('>');
        case 0x7B:
          this.nextChar();
          return _primitives.Cmd.get('{');
        case 0x7D:
          this.nextChar();
          return _primitives.Cmd.get('}');
        case 0x29:
          this.nextChar();
          throw new _util.FormatError('Illegal character: ' + ch);
      }
      var str = String.fromCharCode(ch);
      var knownCommands = this.knownCommands;
      var knownCommandFound = knownCommands && knownCommands[str] !== undefined;
      while ((ch = this.nextChar()) >= 0 && !specialChars[ch]) {
        var possibleCommand = str + String.fromCharCode(ch);
        if (knownCommandFound && knownCommands[possibleCommand] === undefined) {
          break;
        }
        if (str.length === 128) {
          throw new _util.FormatError('Command token too long: ' + str.length);
        }
        str = possibleCommand;
        knownCommandFound = knownCommands && knownCommands[str] !== undefined;
      }
      if (str === 'true') {
        return true;
      }
      if (str === 'false') {
        return false;
      }
      if (str === 'null') {
        return null;
      }
      return _primitives.Cmd.get(str);
    },
    skipToNextLine: function Lexer_skipToNextLine() {
      var ch = this.currentChar;
      while (ch >= 0) {
        if (ch === 0x0D) {
          ch = this.nextChar();
          if (ch === 0x0A) {
            this.nextChar();
          }
          break;
        } else if (ch === 0x0A) {
          this.nextChar();
          break;
        }
        ch = this.nextChar();
      }
    }
  };
  return Lexer;
}();
var Linearization = {
  create: function LinearizationCreate(stream) {
    function getInt(name, allowZeroValue) {
      var obj = linDict.get(name);
      if (Number.isInteger(obj) && (allowZeroValue ? obj >= 0 : obj > 0)) {
        return obj;
      }
      throw new Error('The "' + name + '" parameter in the linearization ' + 'dictionary is invalid.');
    }
    function getHints() {
      var hints = linDict.get('H'),
          hintsLength,
          item;
      if (Array.isArray(hints) && ((hintsLength = hints.length) === 2 || hintsLength === 4)) {
        for (var index = 0; index < hintsLength; index++) {
          if (!(Number.isInteger(item = hints[index]) && item > 0)) {
            throw new Error('Hint (' + index + ') in the linearization dictionary is invalid.');
          }
        }
        return hints;
      }
      throw new Error('Hint array in the linearization dictionary is invalid.');
    }
    var parser = new Parser(new Lexer(stream), false, null);
    var obj1 = parser.getObj();
    var obj2 = parser.getObj();
    var obj3 = parser.getObj();
    var linDict = parser.getObj();
    var obj, length;
    if (!(Number.isInteger(obj1) && Number.isInteger(obj2) && (0, _primitives.isCmd)(obj3, 'obj') && (0, _primitives.isDict)(linDict) && (0, _util.isNum)(obj = linDict.get('Linearized')) && obj > 0)) {
      return null;
    } else if ((length = getInt('L')) !== stream.length) {
      throw new Error('The "L" parameter in the linearization dictionary ' + 'does not equal the stream length.');
    }
    return {
      length: length,
      hints: getHints(),
      objectNumberFirst: getInt('O'),
      endFirst: getInt('E'),
      numPages: getInt('N'),
      mainXRefEntriesOffset: getInt('T'),
      pageFirst: linDict.has('P') ? getInt('P', true) : 0
    };
  }
};
exports.Lexer = Lexer;
exports.Linearization = Linearization;
exports.Parser = Parser;