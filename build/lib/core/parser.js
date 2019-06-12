/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2019 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Parser = exports.Linearization = exports.Lexer = void 0;

var _stream = require("./stream");

var _util = require("../shared/util");

var _primitives = require("./primitives");

var _ccitt_stream = require("./ccitt_stream");

var _jbig2_stream = require("./jbig2_stream");

var _jpeg_stream = require("./jpeg_stream");

var _jpx_stream = require("./jpx_stream");

var _core_utils = require("./core_utils");

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var MAX_LENGTH_TO_CACHE = 1000;
var MAX_ADLER32_LENGTH = 5552;

function computeAdler32(bytes) {
  var bytesLength = bytes.length;
  var a = 1,
      b = 0;

  for (var i = 0; i < bytesLength; ++i) {
    a += bytes[i] & 0xFF;
    b += a;
  }

  return b % 65521 << 16 | a % 65521;
}

var Parser =
/*#__PURE__*/
function () {
  function Parser(lexer, allowStreams, xref) {
    var recoveryMode = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

    _classCallCheck(this, Parser);

    this.lexer = lexer;
    this.allowStreams = allowStreams;
    this.xref = xref;
    this.recoveryMode = recoveryMode;
    this.imageCache = Object.create(null);
    this.refill();
  }

  _createClass(Parser, [{
    key: "refill",
    value: function refill() {
      this.buf1 = this.lexer.getObj();
      this.buf2 = this.lexer.getObj();
    }
  }, {
    key: "shift",
    value: function shift() {
      if ((0, _primitives.isCmd)(this.buf2, 'ID')) {
        this.buf1 = this.buf2;
        this.buf2 = null;
      } else {
        this.buf1 = this.buf2;
        this.buf2 = this.lexer.getObj();
      }
    }
  }, {
    key: "tryShift",
    value: function tryShift() {
      try {
        this.shift();
        return true;
      } catch (e) {
        if (e instanceof _core_utils.MissingDataException) {
          throw e;
        }

        return false;
      }
    }
  }, {
    key: "getObj",
    value: function getObj(cipherTransform) {
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
          var ref = _primitives.Ref.get(num, this.buf1);

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
    }
  }, {
    key: "findDefaultInlineStreamEnd",
    value: function findDefaultInlineStreamEnd(stream) {
      var E = 0x45,
          I = 0x49,
          SPACE = 0x20,
          LF = 0xA,
          CR = 0xD;
      var n = 10,
          NUL = 0x0;
      var startPos = stream.pos,
          state = 0,
          ch,
          maybeEIPos;

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

      var endOffset = 4;
      stream.skip(-endOffset);
      ch = stream.peekByte();
      stream.skip(endOffset);

      if (!(0, _util.isSpace)(ch)) {
        endOffset--;
      }

      return stream.pos - endOffset - startPos;
    }
  }, {
    key: "findDCTDecodeInlineStreamEnd",
    value: function findDCTDecodeInlineStreamEnd(stream) {
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
    }
  }, {
    key: "findASCII85DecodeInlineStreamEnd",
    value: function findASCII85DecodeInlineStreamEnd(stream) {
      var TILDE = 0x7E,
          GT = 0x3E;
      var startPos = stream.pos,
          ch,
          length;

      while ((ch = stream.getByte()) !== -1) {
        if (ch === TILDE) {
          ch = stream.peekByte();

          while ((0, _util.isSpace)(ch)) {
            stream.skip();
            ch = stream.peekByte();
          }

          if (ch === GT) {
            stream.skip();
            break;
          }
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
    }
  }, {
    key: "findASCIIHexDecodeInlineStreamEnd",
    value: function findASCIIHexDecodeInlineStreamEnd(stream) {
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
    }
  }, {
    key: "inlineStreamSkipEI",
    value: function inlineStreamSkipEI(stream) {
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
    }
  }, {
    key: "makeInlineImage",
    value: function makeInlineImage(cipherTransform) {
      var lexer = this.lexer;
      var stream = lexer.stream;
      var dict = new _primitives.Dict(this.xref);
      var dictLength;

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

      if (lexer.beginInlineImagePos !== -1) {
        dictLength = stream.pos - lexer.beginInlineImagePos;
      }

      var filter = dict.get('Filter', 'F');
      var filterName;

      if ((0, _primitives.isName)(filter)) {
        filterName = filter.name;
      } else if (Array.isArray(filter)) {
        var filterZero = this.xref.fetchIfRef(filter[0]);

        if ((0, _primitives.isName)(filterZero)) {
          filterName = filterZero.name;
        }
      }

      var startPos = stream.pos;
      var length;

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
      var cacheKey;

      if (length < MAX_LENGTH_TO_CACHE && dictLength < MAX_ADLER32_LENGTH) {
        var imageBytes = imageStream.getBytes();
        imageStream.reset();
        var initialStreamPos = stream.pos;
        stream.pos = lexer.beginInlineImagePos;
        var dictBytes = stream.getBytes(dictLength);
        stream.pos = initialStreamPos;
        cacheKey = computeAdler32(imageBytes) + '_' + computeAdler32(dictBytes);
        var cacheEntry = this.imageCache[cacheKey];

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

      if (cacheKey !== undefined) {
        imageStream.cacheKey = "inline_".concat(length, "_").concat(cacheKey);
        this.imageCache[cacheKey] = imageStream;
      }

      this.buf2 = _primitives.Cmd.get('EI');
      this.shift();
      return imageStream;
    }
  }, {
    key: "_findStreamLength",
    value: function _findStreamLength(startPos, signature) {
      var stream = this.lexer.stream;
      stream.pos = startPos;
      var SCAN_BLOCK_LENGTH = 2048;
      var signatureLength = signature.length;

      while (stream.pos < stream.end) {
        var scanBytes = stream.peekBytes(SCAN_BLOCK_LENGTH);
        var scanLength = scanBytes.length - signatureLength;

        if (scanLength <= 0) {
          break;
        }

        var pos = 0;

        while (pos < scanLength) {
          var j = 0;

          while (j < signatureLength && scanBytes[pos + j] === signature[j]) {
            j++;
          }

          if (j >= signatureLength) {
            stream.pos += pos;
            return stream.pos - startPos;
          }

          pos++;
        }

        stream.pos += scanLength;
      }

      return -1;
    }
  }, {
    key: "makeStream",
    value: function makeStream(dict, cipherTransform) {
      var lexer = this.lexer;
      var stream = lexer.stream;
      lexer.skipToNextLine();
      var startPos = stream.pos - 1;
      var length = dict.get('Length');

      if (!Number.isInteger(length)) {
        (0, _util.info)("Bad length \"".concat(length, "\" in stream"));
        length = 0;
      }

      stream.pos = startPos + length;
      lexer.nextChar();

      if (this.tryShift() && (0, _primitives.isCmd)(this.buf2, 'endstream')) {
        this.shift();
      } else {
        var ENDSTREAM_SIGNATURE = new Uint8Array([0x65, 0x6E, 0x64, 0x73, 0x74, 0x72, 0x65, 0x61, 0x6D]);

        var actualLength = this._findStreamLength(startPos, ENDSTREAM_SIGNATURE);

        if (actualLength < 0) {
          var MAX_TRUNCATION = 1;

          for (var i = 1; i <= MAX_TRUNCATION; i++) {
            var end = ENDSTREAM_SIGNATURE.length - i;
            var TRUNCATED_SIGNATURE = ENDSTREAM_SIGNATURE.slice(0, end);

            var maybeLength = this._findStreamLength(startPos, TRUNCATED_SIGNATURE);

            if (maybeLength >= 0) {
              var lastByte = stream.peekBytes(end + 1)[end];

              if (!(0, _util.isSpace)(lastByte)) {
                break;
              }

              (0, _util.info)("Found \"".concat((0, _util.bytesToString)(TRUNCATED_SIGNATURE), "\" when ") + 'searching for endstream command.');
              actualLength = maybeLength;
              break;
            }
          }

          if (actualLength < 0) {
            throw new _util.FormatError('Missing endstream command.');
          }
        }

        length = actualLength;
        lexer.nextChar();
        this.shift();
        this.shift();
      }

      this.shift();
      stream = stream.makeSubStream(startPos, length, dict);

      if (cipherTransform) {
        stream = cipherTransform.createStream(stream, length);
      }

      stream = this.filter(stream, dict, length);
      stream.dict = dict;
      return stream;
    }
  }, {
    key: "filter",
    value: function filter(stream, dict, length) {
      var filter = dict.get('Filter', 'F');
      var params = dict.get('DecodeParms', 'DP');

      if ((0, _primitives.isName)(filter)) {
        if (Array.isArray(params)) {
          (0, _util.warn)('/DecodeParms should not contain an Array, ' + 'when /Filter contains a Name.');
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
            throw new _util.FormatError("Bad filter name \"".concat(filter, "\""));
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
    }
  }, {
    key: "makeFilter",
    value: function makeFilter(stream, name, maybeLength, params) {
      if (maybeLength === 0) {
        (0, _util.warn)("Empty \"".concat(name, "\" stream."));
        return new _stream.NullStream();
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
          return new _jpeg_stream.JpegStream(stream, maybeLength, stream.dict, params);
        }

        if (name === 'JPXDecode' || name === 'JPX') {
          xrefStreamStats[_util.StreamType.JPX] = true;
          return new _jpx_stream.JpxStream(stream, maybeLength, stream.dict, params);
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
          return new _ccitt_stream.CCITTFaxStream(stream, maybeLength, params);
        }

        if (name === 'RunLengthDecode' || name === 'RL') {
          xrefStreamStats[_util.StreamType.RL] = true;
          return new _stream.RunLengthStream(stream, maybeLength);
        }

        if (name === 'JBIG2Decode') {
          xrefStreamStats[_util.StreamType.JBIG] = true;
          return new _jbig2_stream.Jbig2Stream(stream, maybeLength, stream.dict, params);
        }

        (0, _util.warn)("Filter \"".concat(name, "\" is not supported."));
        return stream;
      } catch (ex) {
        if (ex instanceof _core_utils.MissingDataException) {
          throw ex;
        }

        (0, _util.warn)("Invalid stream: \"".concat(ex, "\""));
        return new _stream.NullStream();
      }
    }
  }]);

  return Parser;
}();

exports.Parser = Parser;
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

var Lexer =
/*#__PURE__*/
function () {
  function Lexer(stream, knownCommands) {
    _classCallCheck(this, Lexer);

    this.stream = stream;
    this.nextChar();
    this.strBuf = [];
    this.knownCommands = knownCommands;
    this.beginInlineImagePos = -1;
  }

  _createClass(Lexer, [{
    key: "nextChar",
    value: function nextChar() {
      return this.currentChar = this.stream.getByte();
    }
  }, {
    key: "peekChar",
    value: function peekChar() {
      return this.stream.peekByte();
    }
  }, {
    key: "getNumber",
    value: function getNumber() {
      var ch = this.currentChar;
      var eNotation = false;
      var divideBy = 0;
      var sign = 0;

      if (ch === 0x2D) {
        sign = -1;
        ch = this.nextChar();

        if (ch === 0x2D) {
          ch = this.nextChar();
        }
      } else if (ch === 0x2B) {
        sign = 1;
        ch = this.nextChar();
      }

      if (ch === 0x0A || ch === 0x0D) {
        do {
          ch = this.nextChar();
        } while (ch === 0x0A || ch === 0x0D);
      }

      if (ch === 0x2E) {
        divideBy = 10;
        ch = this.nextChar();
      }

      if (ch < 0x30 || ch > 0x39) {
        if (divideBy === 10 && sign === 0 && ((0, _util.isSpace)(ch) || ch === -1)) {
          (0, _util.warn)('Lexer.getNumber - treating a single decimal point as zero.');
          return 0;
        }

        throw new _util.FormatError("Invalid number: ".concat(String.fromCharCode(ch), " (charCode ").concat(ch, ")"));
      }

      sign = sign || 1;
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
          (0, _util.warn)('Badly formatted number: minus sign in the middle');
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
    }
  }, {
    key: "getString",
    value: function getString() {
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
    }
  }, {
    key: "getName",
    value: function getName() {
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
              (0, _util.warn)("Lexer_getName: Illegal digit (".concat(String.fromCharCode(ch), ") ") + 'in hexadecimal number.');
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
        (0, _util.warn)("Name token is longer than allowed by the spec: ".concat(strBuf.length));
      }

      return _primitives.Name.get(strBuf.join(''));
    }
  }, {
    key: "getHexString",
    value: function getHexString() {
      var strBuf = this.strBuf;
      strBuf.length = 0;
      var ch = this.currentChar;
      var isFirstHex = true;
      var firstDigit, secondDigit;

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
              (0, _util.warn)("Ignoring invalid character \"".concat(ch, "\" in hex string"));
              ch = this.nextChar();
              continue;
            }
          } else {
            secondDigit = toHexDigit(ch);

            if (secondDigit === -1) {
              (0, _util.warn)("Ignoring invalid character \"".concat(ch, "\" in hex string"));
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
    }
  }, {
    key: "getObj",
    value: function getObj() {
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
          throw new _util.FormatError("Illegal character: ".concat(ch));
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
          throw new _util.FormatError("Command token too long: ".concat(str.length));
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

      if (str === 'BI') {
        this.beginInlineImagePos = this.stream.pos;
      }

      return _primitives.Cmd.get(str);
    }
  }, {
    key: "skipToNextLine",
    value: function skipToNextLine() {
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
  }]);

  return Lexer;
}();

exports.Lexer = Lexer;

var Linearization =
/*#__PURE__*/
function () {
  function Linearization() {
    _classCallCheck(this, Linearization);
  }

  _createClass(Linearization, null, [{
    key: "create",
    value: function create(stream) {
      function getInt(linDict, name) {
        var allowZeroValue = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
        var obj = linDict.get(name);

        if (Number.isInteger(obj) && (allowZeroValue ? obj >= 0 : obj > 0)) {
          return obj;
        }

        throw new Error("The \"".concat(name, "\" parameter in the linearization ") + 'dictionary is invalid.');
      }

      function getHints(linDict) {
        var hints = linDict.get('H');
        var hintsLength;

        if (Array.isArray(hints) && ((hintsLength = hints.length) === 2 || hintsLength === 4)) {
          for (var index = 0; index < hintsLength; index++) {
            var hint = hints[index];

            if (!(Number.isInteger(hint) && hint > 0)) {
              throw new Error("Hint (".concat(index, ") in the linearization dictionary ") + 'is invalid.');
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
      } else if ((length = getInt(linDict, 'L')) !== stream.length) {
        throw new Error('The "L" parameter in the linearization dictionary ' + 'does not equal the stream length.');
      }

      return {
        length: length,
        hints: getHints(linDict),
        objectNumberFirst: getInt(linDict, 'O'),
        endFirst: getInt(linDict, 'E'),
        numPages: getInt(linDict, 'N'),
        mainXRefEntriesOffset: getInt(linDict, 'T'),
        pageFirst: linDict.has('P') ? getInt(linDict, 'P', true) : 0
      };
    }
  }]);

  return Linearization;
}();

exports.Linearization = Linearization;