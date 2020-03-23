/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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

var _stream = require("./stream.js");

var _util = require("../shared/util.js");

var _primitives = require("./primitives.js");

var _core_utils = require("./core_utils.js");

var _ccitt_stream = require("./ccitt_stream.js");

var _jbig2_stream = require("./jbig2_stream.js");

var _jpeg_stream = require("./jpeg_stream.js");

var _jpx_stream = require("./jpx_stream.js");

const MAX_LENGTH_TO_CACHE = 1000;
const MAX_ADLER32_LENGTH = 5552;

function computeAdler32(bytes) {
  const bytesLength = bytes.length;
  let a = 1,
      b = 0;

  for (let i = 0; i < bytesLength; ++i) {
    a += bytes[i] & 0xff;
    b += a;
  }

  return b % 65521 << 16 | a % 65521;
}

class Parser {
  constructor({
    lexer,
    xref,
    allowStreams = false,
    recoveryMode = false
  }) {
    this.lexer = lexer;
    this.xref = xref;
    this.allowStreams = allowStreams;
    this.recoveryMode = recoveryMode;
    this.imageCache = Object.create(null);
    this.refill();
  }

  refill() {
    this.buf1 = this.lexer.getObj();
    this.buf2 = this.lexer.getObj();
  }

  shift() {
    if (this.buf2 instanceof _primitives.Cmd && this.buf2.cmd === "ID") {
      this.buf1 = this.buf2;
      this.buf2 = null;
    } else {
      this.buf1 = this.buf2;
      this.buf2 = this.lexer.getObj();
    }
  }

  tryShift() {
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

  getObj(cipherTransform = null) {
    const buf1 = this.buf1;
    this.shift();

    if (buf1 instanceof _primitives.Cmd) {
      switch (buf1.cmd) {
        case "BI":
          return this.makeInlineImage(cipherTransform);

        case "[":
          const array = [];

          while (!(0, _primitives.isCmd)(this.buf1, "]") && !(0, _primitives.isEOF)(this.buf1)) {
            array.push(this.getObj(cipherTransform));
          }

          if ((0, _primitives.isEOF)(this.buf1)) {
            if (!this.recoveryMode) {
              throw new _util.FormatError("End of file inside array");
            }

            return array;
          }

          this.shift();
          return array;

        case "<<":
          const dict = new _primitives.Dict(this.xref);

          while (!(0, _primitives.isCmd)(this.buf1, ">>") && !(0, _primitives.isEOF)(this.buf1)) {
            if (!(0, _primitives.isName)(this.buf1)) {
              (0, _util.info)("Malformed dictionary: key must be a name object");
              this.shift();
              continue;
            }

            const key = this.buf1.name;
            this.shift();

            if ((0, _primitives.isEOF)(this.buf1)) {
              break;
            }

            dict.set(key, this.getObj(cipherTransform));
          }

          if ((0, _primitives.isEOF)(this.buf1)) {
            if (!this.recoveryMode) {
              throw new _util.FormatError("End of file inside dictionary");
            }

            return dict;
          }

          if ((0, _primitives.isCmd)(this.buf2, "stream")) {
            return this.allowStreams ? this.makeStream(dict, cipherTransform) : dict;
          }

          this.shift();
          return dict;

        default:
          return buf1;
      }
    }

    if (Number.isInteger(buf1)) {
      if (Number.isInteger(this.buf1) && (0, _primitives.isCmd)(this.buf2, "R")) {
        const ref = _primitives.Ref.get(buf1, this.buf1);

        this.shift();
        this.shift();
        return ref;
      }

      return buf1;
    }

    if (typeof buf1 === "string") {
      if (cipherTransform) {
        return cipherTransform.decryptString(buf1);
      }

      return buf1;
    }

    return buf1;
  }

  findDefaultInlineStreamEnd(stream) {
    const E = 0x45,
          I = 0x49,
          SPACE = 0x20,
          LF = 0xa,
          CR = 0xd;
    const n = 10,
          NUL = 0x0;
    const startPos = stream.pos;
    let state = 0,
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
          const followingBytes = stream.peekBytes(n);

          for (let i = 0, ii = followingBytes.length; i < ii; i++) {
            ch = followingBytes[i];

            if (ch === NUL && followingBytes[i + 1] !== NUL) {
              continue;
            }

            if (ch !== LF && ch !== CR && (ch < SPACE || ch > 0x7f)) {
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
      (0, _util.warn)("findDefaultInlineStreamEnd: " + "Reached the end of the stream without finding a valid EI marker");

      if (maybeEIPos) {
        (0, _util.warn)('... trying to recover by using the last "EI" occurrence.');
        stream.skip(-(stream.pos - maybeEIPos));
      }
    }

    let endOffset = 4;
    stream.skip(-endOffset);
    ch = stream.peekByte();
    stream.skip(endOffset);

    if (!(0, _core_utils.isWhiteSpace)(ch)) {
      endOffset--;
    }

    return stream.pos - endOffset - startPos;
  }

  findDCTDecodeInlineStreamEnd(stream) {
    const startPos = stream.pos;
    let foundEOI = false,
        b,
        markerLength;

    while ((b = stream.getByte()) !== -1) {
      if (b !== 0xff) {
        continue;
      }

      switch (stream.getByte()) {
        case 0x00:
          break;

        case 0xff:
          stream.skip(-1);
          break;

        case 0xd9:
          foundEOI = true;
          break;

        case 0xc0:
        case 0xc1:
        case 0xc2:
        case 0xc3:
        case 0xc5:
        case 0xc6:
        case 0xc7:
        case 0xc9:
        case 0xca:
        case 0xcb:
        case 0xcd:
        case 0xce:
        case 0xcf:
        case 0xc4:
        case 0xcc:
        case 0xda:
        case 0xdb:
        case 0xdc:
        case 0xdd:
        case 0xde:
        case 0xdf:
        case 0xe0:
        case 0xe1:
        case 0xe2:
        case 0xe3:
        case 0xe4:
        case 0xe5:
        case 0xe6:
        case 0xe7:
        case 0xe8:
        case 0xe9:
        case 0xea:
        case 0xeb:
        case 0xec:
        case 0xed:
        case 0xee:
        case 0xef:
        case 0xfe:
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

    const length = stream.pos - startPos;

    if (b === -1) {
      (0, _util.warn)("Inline DCTDecode image stream: " + "EOI marker not found, searching for /EI/ instead.");
      stream.skip(-length);
      return this.findDefaultInlineStreamEnd(stream);
    }

    this.inlineStreamSkipEI(stream);
    return length;
  }

  findASCII85DecodeInlineStreamEnd(stream) {
    const TILDE = 0x7e,
          GT = 0x3e;
    const startPos = stream.pos;
    let ch;

    while ((ch = stream.getByte()) !== -1) {
      if (ch === TILDE) {
        const tildePos = stream.pos;
        ch = stream.peekByte();

        while ((0, _core_utils.isWhiteSpace)(ch)) {
          stream.skip();
          ch = stream.peekByte();
        }

        if (ch === GT) {
          stream.skip();
          break;
        }

        if (stream.pos > tildePos) {
          const maybeEI = stream.peekBytes(2);

          if (maybeEI[0] === 0x45 && maybeEI[1] === 0x49) {
            break;
          }
        }
      }
    }

    const length = stream.pos - startPos;

    if (ch === -1) {
      (0, _util.warn)("Inline ASCII85Decode image stream: " + "EOD marker not found, searching for /EI/ instead.");
      stream.skip(-length);
      return this.findDefaultInlineStreamEnd(stream);
    }

    this.inlineStreamSkipEI(stream);
    return length;
  }

  findASCIIHexDecodeInlineStreamEnd(stream) {
    const GT = 0x3e;
    const startPos = stream.pos;
    let ch;

    while ((ch = stream.getByte()) !== -1) {
      if (ch === GT) {
        break;
      }
    }

    const length = stream.pos - startPos;

    if (ch === -1) {
      (0, _util.warn)("Inline ASCIIHexDecode image stream: " + "EOD marker not found, searching for /EI/ instead.");
      stream.skip(-length);
      return this.findDefaultInlineStreamEnd(stream);
    }

    this.inlineStreamSkipEI(stream);
    return length;
  }

  inlineStreamSkipEI(stream) {
    const E = 0x45,
          I = 0x49;
    let state = 0,
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

  makeInlineImage(cipherTransform) {
    const lexer = this.lexer;
    const stream = lexer.stream;
    const dict = new _primitives.Dict(this.xref);
    let dictLength;

    while (!(0, _primitives.isCmd)(this.buf1, "ID") && !(0, _primitives.isEOF)(this.buf1)) {
      if (!(0, _primitives.isName)(this.buf1)) {
        throw new _util.FormatError("Dictionary key must be a name object");
      }

      const key = this.buf1.name;
      this.shift();

      if ((0, _primitives.isEOF)(this.buf1)) {
        break;
      }

      dict.set(key, this.getObj(cipherTransform));
    }

    if (lexer.beginInlineImagePos !== -1) {
      dictLength = stream.pos - lexer.beginInlineImagePos;
    }

    const filter = dict.get("Filter", "F");
    let filterName;

    if ((0, _primitives.isName)(filter)) {
      filterName = filter.name;
    } else if (Array.isArray(filter)) {
      const filterZero = this.xref.fetchIfRef(filter[0]);

      if ((0, _primitives.isName)(filterZero)) {
        filterName = filterZero.name;
      }
    }

    const startPos = stream.pos;
    let length;

    if (filterName === "DCTDecode" || filterName === "DCT") {
      length = this.findDCTDecodeInlineStreamEnd(stream);
    } else if (filterName === "ASCII85Decode" || filterName === "A85") {
      length = this.findASCII85DecodeInlineStreamEnd(stream);
    } else if (filterName === "ASCIIHexDecode" || filterName === "AHx") {
      length = this.findASCIIHexDecodeInlineStreamEnd(stream);
    } else {
      length = this.findDefaultInlineStreamEnd(stream);
    }

    let imageStream = stream.makeSubStream(startPos, length, dict);
    let cacheKey;

    if (length < MAX_LENGTH_TO_CACHE && dictLength < MAX_ADLER32_LENGTH) {
      const imageBytes = imageStream.getBytes();
      imageStream.reset();
      const initialStreamPos = stream.pos;
      stream.pos = lexer.beginInlineImagePos;
      const dictBytes = stream.getBytes(dictLength);
      stream.pos = initialStreamPos;
      cacheKey = computeAdler32(imageBytes) + "_" + computeAdler32(dictBytes);
      const cacheEntry = this.imageCache[cacheKey];

      if (cacheEntry !== undefined) {
        this.buf2 = _primitives.Cmd.get("EI");
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
      imageStream.cacheKey = `inline_${length}_${cacheKey}`;
      this.imageCache[cacheKey] = imageStream;
    }

    this.buf2 = _primitives.Cmd.get("EI");
    this.shift();
    return imageStream;
  }

  _findStreamLength(startPos, signature) {
    const {
      stream
    } = this.lexer;
    stream.pos = startPos;
    const SCAN_BLOCK_LENGTH = 2048;
    const signatureLength = signature.length;

    while (stream.pos < stream.end) {
      const scanBytes = stream.peekBytes(SCAN_BLOCK_LENGTH);
      const scanLength = scanBytes.length - signatureLength;

      if (scanLength <= 0) {
        break;
      }

      let pos = 0;

      while (pos < scanLength) {
        let j = 0;

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

  makeStream(dict, cipherTransform) {
    const lexer = this.lexer;
    let stream = lexer.stream;
    lexer.skipToNextLine();
    const startPos = stream.pos - 1;
    let length = dict.get("Length");

    if (!Number.isInteger(length)) {
      (0, _util.info)(`Bad length "${length}" in stream`);
      length = 0;
    }

    stream.pos = startPos + length;
    lexer.nextChar();

    if (this.tryShift() && (0, _primitives.isCmd)(this.buf2, "endstream")) {
      this.shift();
    } else {
      const ENDSTREAM_SIGNATURE = new Uint8Array([0x65, 0x6E, 0x64, 0x73, 0x74, 0x72, 0x65, 0x61, 0x6D]);

      let actualLength = this._findStreamLength(startPos, ENDSTREAM_SIGNATURE);

      if (actualLength < 0) {
        const MAX_TRUNCATION = 1;

        for (let i = 1; i <= MAX_TRUNCATION; i++) {
          const end = ENDSTREAM_SIGNATURE.length - i;
          const TRUNCATED_SIGNATURE = ENDSTREAM_SIGNATURE.slice(0, end);

          const maybeLength = this._findStreamLength(startPos, TRUNCATED_SIGNATURE);

          if (maybeLength >= 0) {
            const lastByte = stream.peekBytes(end + 1)[end];

            if (!(0, _core_utils.isWhiteSpace)(lastByte)) {
              break;
            }

            (0, _util.info)(`Found "${(0, _util.bytesToString)(TRUNCATED_SIGNATURE)}" when ` + "searching for endstream command.");
            actualLength = maybeLength;
            break;
          }
        }

        if (actualLength < 0) {
          throw new _util.FormatError("Missing endstream command.");
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

  filter(stream, dict, length) {
    let filter = dict.get("Filter", "F");
    let params = dict.get("DecodeParms", "DP");

    if ((0, _primitives.isName)(filter)) {
      if (Array.isArray(params)) {
        (0, _util.warn)("/DecodeParms should not contain an Array, " + "when /Filter contains a Name.");
      }

      return this.makeFilter(stream, filter.name, length, params);
    }

    let maybeLength = length;

    if (Array.isArray(filter)) {
      const filterArray = filter;
      const paramsArray = params;

      for (let i = 0, ii = filterArray.length; i < ii; ++i) {
        filter = this.xref.fetchIfRef(filterArray[i]);

        if (!(0, _primitives.isName)(filter)) {
          throw new _util.FormatError(`Bad filter name "${filter}"`);
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

  makeFilter(stream, name, maybeLength, params) {
    if (maybeLength === 0) {
      (0, _util.warn)(`Empty "${name}" stream.`);
      return new _stream.NullStream();
    }

    try {
      const xrefStreamStats = this.xref.stats.streamTypes;

      if (name === "FlateDecode" || name === "Fl") {
        xrefStreamStats[_util.StreamType.FLATE] = true;

        if (params) {
          return new _stream.PredictorStream(new _stream.FlateStream(stream, maybeLength), maybeLength, params);
        }

        return new _stream.FlateStream(stream, maybeLength);
      }

      if (name === "LZWDecode" || name === "LZW") {
        xrefStreamStats[_util.StreamType.LZW] = true;
        let earlyChange = 1;

        if (params) {
          if (params.has("EarlyChange")) {
            earlyChange = params.get("EarlyChange");
          }

          return new _stream.PredictorStream(new _stream.LZWStream(stream, maybeLength, earlyChange), maybeLength, params);
        }

        return new _stream.LZWStream(stream, maybeLength, earlyChange);
      }

      if (name === "DCTDecode" || name === "DCT") {
        xrefStreamStats[_util.StreamType.DCT] = true;
        return new _jpeg_stream.JpegStream(stream, maybeLength, stream.dict, params);
      }

      if (name === "JPXDecode" || name === "JPX") {
        xrefStreamStats[_util.StreamType.JPX] = true;
        return new _jpx_stream.JpxStream(stream, maybeLength, stream.dict, params);
      }

      if (name === "ASCII85Decode" || name === "A85") {
        xrefStreamStats[_util.StreamType.A85] = true;
        return new _stream.Ascii85Stream(stream, maybeLength);
      }

      if (name === "ASCIIHexDecode" || name === "AHx") {
        xrefStreamStats[_util.StreamType.AHX] = true;
        return new _stream.AsciiHexStream(stream, maybeLength);
      }

      if (name === "CCITTFaxDecode" || name === "CCF") {
        xrefStreamStats[_util.StreamType.CCF] = true;
        return new _ccitt_stream.CCITTFaxStream(stream, maybeLength, params);
      }

      if (name === "RunLengthDecode" || name === "RL") {
        xrefStreamStats[_util.StreamType.RLX] = true;
        return new _stream.RunLengthStream(stream, maybeLength);
      }

      if (name === "JBIG2Decode") {
        xrefStreamStats[_util.StreamType.JBIG] = true;
        return new _jbig2_stream.Jbig2Stream(stream, maybeLength, stream.dict, params);
      }

      (0, _util.warn)(`Filter "${name}" is not supported.`);
      return stream;
    } catch (ex) {
      if (ex instanceof _core_utils.MissingDataException) {
        throw ex;
      }

      (0, _util.warn)(`Invalid stream: "${ex}"`);
      return new _stream.NullStream();
    }
  }

}

exports.Parser = Parser;
const specialChars = [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

function toHexDigit(ch) {
  if (ch >= 0x30 && ch <= 0x39) {
    return ch & 0x0f;
  }

  if (ch >= 0x41 && ch <= 0x46 || ch >= 0x61 && ch <= 0x66) {
    return (ch & 0x0f) + 9;
  }

  return -1;
}

class Lexer {
  constructor(stream, knownCommands = null) {
    this.stream = stream;
    this.nextChar();
    this.strBuf = [];
    this.knownCommands = knownCommands;
    this._hexStringNumWarn = 0;
    this.beginInlineImagePos = -1;
  }

  nextChar() {
    return this.currentChar = this.stream.getByte();
  }

  peekChar() {
    return this.stream.peekByte();
  }

  getNumber() {
    let ch = this.currentChar;
    let eNotation = false;
    let divideBy = 0;
    let sign = 0;

    if (ch === 0x2d) {
      sign = -1;
      ch = this.nextChar();

      if (ch === 0x2d) {
        ch = this.nextChar();
      }
    } else if (ch === 0x2b) {
      sign = 1;
      ch = this.nextChar();
    }

    if (ch === 0x0a || ch === 0x0d) {
      do {
        ch = this.nextChar();
      } while (ch === 0x0a || ch === 0x0d);
    }

    if (ch === 0x2e) {
      divideBy = 10;
      ch = this.nextChar();
    }

    if (ch < 0x30 || ch > 0x39) {
      if (divideBy === 10 && sign === 0 && ((0, _core_utils.isWhiteSpace)(ch) || ch === -1)) {
        (0, _util.warn)("Lexer.getNumber - treating a single decimal point as zero.");
        return 0;
      }

      throw new _util.FormatError(`Invalid number: ${String.fromCharCode(ch)} (charCode ${ch})`);
    }

    sign = sign || 1;
    let baseValue = ch - 0x30;
    let powerValue = 0;
    let powerValueSign = 1;

    while ((ch = this.nextChar()) >= 0) {
      if (ch >= 0x30 && ch <= 0x39) {
        const currentDigit = ch - 0x30;

        if (eNotation) {
          powerValue = powerValue * 10 + currentDigit;
        } else {
          if (divideBy !== 0) {
            divideBy *= 10;
          }

          baseValue = baseValue * 10 + currentDigit;
        }
      } else if (ch === 0x2e) {
        if (divideBy === 0) {
          divideBy = 1;
        } else {
          break;
        }
      } else if (ch === 0x2d) {
        (0, _util.warn)("Badly formatted number: minus sign in the middle");
      } else if (ch === 0x45 || ch === 0x65) {
        ch = this.peekChar();

        if (ch === 0x2b || ch === 0x2d) {
          powerValueSign = ch === 0x2d ? -1 : 1;
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
      baseValue *= 10 ** (powerValueSign * powerValue);
    }

    return sign * baseValue;
  }

  getString() {
    let numParen = 1;
    let done = false;
    const strBuf = this.strBuf;
    strBuf.length = 0;
    let ch = this.nextChar();

    while (true) {
      let charBuffered = false;

      switch (ch | 0) {
        case -1:
          (0, _util.warn)("Unterminated string");
          done = true;
          break;

        case 0x28:
          ++numParen;
          strBuf.push("(");
          break;

        case 0x29:
          if (--numParen === 0) {
            this.nextChar();
            done = true;
          } else {
            strBuf.push(")");
          }

          break;

        case 0x5c:
          ch = this.nextChar();

          switch (ch) {
            case -1:
              (0, _util.warn)("Unterminated string");
              done = true;
              break;

            case 0x6e:
              strBuf.push("\n");
              break;

            case 0x72:
              strBuf.push("\r");
              break;

            case 0x74:
              strBuf.push("\t");
              break;

            case 0x62:
              strBuf.push("\b");
              break;

            case 0x66:
              strBuf.push("\f");
              break;

            case 0x5c:
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
              let x = ch & 0x0f;
              ch = this.nextChar();
              charBuffered = true;

              if (ch >= 0x30 && ch <= 0x37) {
                x = (x << 3) + (ch & 0x0f);
                ch = this.nextChar();

                if (ch >= 0x30 && ch <= 0x37) {
                  charBuffered = false;
                  x = (x << 3) + (ch & 0x0f);
                }
              }

              strBuf.push(String.fromCharCode(x));
              break;

            case 0x0d:
              if (this.peekChar() === 0x0a) {
                this.nextChar();
              }

              break;

            case 0x0a:
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

    return strBuf.join("");
  }

  getName() {
    let ch, previousCh;
    const strBuf = this.strBuf;
    strBuf.length = 0;

    while ((ch = this.nextChar()) >= 0 && !specialChars[ch]) {
      if (ch === 0x23) {
        ch = this.nextChar();

        if (specialChars[ch]) {
          (0, _util.warn)("Lexer_getName: " + "NUMBER SIGN (#) should be followed by a hexadecimal number.");
          strBuf.push("#");
          break;
        }

        const x = toHexDigit(ch);

        if (x !== -1) {
          previousCh = ch;
          ch = this.nextChar();
          const x2 = toHexDigit(ch);

          if (x2 === -1) {
            (0, _util.warn)(`Lexer_getName: Illegal digit (${String.fromCharCode(ch)}) ` + "in hexadecimal number.");
            strBuf.push("#", String.fromCharCode(previousCh));

            if (specialChars[ch]) {
              break;
            }

            strBuf.push(String.fromCharCode(ch));
            continue;
          }

          strBuf.push(String.fromCharCode(x << 4 | x2));
        } else {
          strBuf.push("#", String.fromCharCode(ch));
        }
      } else {
        strBuf.push(String.fromCharCode(ch));
      }
    }

    if (strBuf.length > 127) {
      (0, _util.warn)(`Name token is longer than allowed by the spec: ${strBuf.length}`);
    }

    return _primitives.Name.get(strBuf.join(""));
  }

  _hexStringWarn(ch) {
    const MAX_HEX_STRING_NUM_WARN = 5;

    if (this._hexStringNumWarn++ === MAX_HEX_STRING_NUM_WARN) {
      (0, _util.warn)("getHexString - ignoring additional invalid characters.");
      return;
    }

    if (this._hexStringNumWarn > MAX_HEX_STRING_NUM_WARN) {
      return;
    }

    (0, _util.warn)(`getHexString - ignoring invalid character: ${ch}`);
  }

  getHexString() {
    const strBuf = this.strBuf;
    strBuf.length = 0;
    let ch = this.currentChar;
    let isFirstHex = true;
    let firstDigit, secondDigit;
    this._hexStringNumWarn = 0;

    while (true) {
      if (ch < 0) {
        (0, _util.warn)("Unterminated hex string");
        break;
      } else if (ch === 0x3e) {
        this.nextChar();
        break;
      } else if (specialChars[ch] === 1) {
        ch = this.nextChar();
        continue;
      } else {
        if (isFirstHex) {
          firstDigit = toHexDigit(ch);

          if (firstDigit === -1) {
            this._hexStringWarn(ch);

            ch = this.nextChar();
            continue;
          }
        } else {
          secondDigit = toHexDigit(ch);

          if (secondDigit === -1) {
            this._hexStringWarn(ch);

            ch = this.nextChar();
            continue;
          }

          strBuf.push(String.fromCharCode(firstDigit << 4 | secondDigit));
        }

        isFirstHex = !isFirstHex;
        ch = this.nextChar();
      }
    }

    return strBuf.join("");
  }

  getObj() {
    let comment = false;
    let ch = this.currentChar;

    while (true) {
      if (ch < 0) {
        return _primitives.EOF;
      }

      if (comment) {
        if (ch === 0x0a || ch === 0x0d) {
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
      case 0x2b:
      case 0x2d:
      case 0x2e:
        return this.getNumber();

      case 0x28:
        return this.getString();

      case 0x2f:
        return this.getName();

      case 0x5b:
        this.nextChar();
        return _primitives.Cmd.get("[");

      case 0x5d:
        this.nextChar();
        return _primitives.Cmd.get("]");

      case 0x3c:
        ch = this.nextChar();

        if (ch === 0x3c) {
          this.nextChar();
          return _primitives.Cmd.get("<<");
        }

        return this.getHexString();

      case 0x3e:
        ch = this.nextChar();

        if (ch === 0x3e) {
          this.nextChar();
          return _primitives.Cmd.get(">>");
        }

        return _primitives.Cmd.get(">");

      case 0x7b:
        this.nextChar();
        return _primitives.Cmd.get("{");

      case 0x7d:
        this.nextChar();
        return _primitives.Cmd.get("}");

      case 0x29:
        this.nextChar();
        throw new _util.FormatError(`Illegal character: ${ch}`);
    }

    let str = String.fromCharCode(ch);
    const knownCommands = this.knownCommands;
    let knownCommandFound = knownCommands && knownCommands[str] !== undefined;

    while ((ch = this.nextChar()) >= 0 && !specialChars[ch]) {
      const possibleCommand = str + String.fromCharCode(ch);

      if (knownCommandFound && knownCommands[possibleCommand] === undefined) {
        break;
      }

      if (str.length === 128) {
        throw new _util.FormatError(`Command token too long: ${str.length}`);
      }

      str = possibleCommand;
      knownCommandFound = knownCommands && knownCommands[str] !== undefined;
    }

    if (str === "true") {
      return true;
    }

    if (str === "false") {
      return false;
    }

    if (str === "null") {
      return null;
    }

    if (str === "BI") {
      this.beginInlineImagePos = this.stream.pos;
    }

    return _primitives.Cmd.get(str);
  }

  skipToNextLine() {
    let ch = this.currentChar;

    while (ch >= 0) {
      if (ch === 0x0d) {
        ch = this.nextChar();

        if (ch === 0x0a) {
          this.nextChar();
        }

        break;
      } else if (ch === 0x0a) {
        this.nextChar();
        break;
      }

      ch = this.nextChar();
    }
  }

}

exports.Lexer = Lexer;

class Linearization {
  static create(stream) {
    function getInt(linDict, name, allowZeroValue = false) {
      const obj = linDict.get(name);

      if (Number.isInteger(obj) && (allowZeroValue ? obj >= 0 : obj > 0)) {
        return obj;
      }

      throw new Error(`The "${name}" parameter in the linearization ` + "dictionary is invalid.");
    }

    function getHints(linDict) {
      const hints = linDict.get("H");
      let hintsLength;

      if (Array.isArray(hints) && ((hintsLength = hints.length) === 2 || hintsLength === 4)) {
        for (let index = 0; index < hintsLength; index++) {
          const hint = hints[index];

          if (!(Number.isInteger(hint) && hint > 0)) {
            throw new Error(`Hint (${index}) in the linearization dictionary is invalid.`);
          }
        }

        return hints;
      }

      throw new Error("Hint array in the linearization dictionary is invalid.");
    }

    const parser = new Parser({
      lexer: new Lexer(stream),
      xref: null
    });
    const obj1 = parser.getObj();
    const obj2 = parser.getObj();
    const obj3 = parser.getObj();
    const linDict = parser.getObj();
    let obj, length;

    if (!(Number.isInteger(obj1) && Number.isInteger(obj2) && (0, _primitives.isCmd)(obj3, "obj") && (0, _primitives.isDict)(linDict) && (0, _util.isNum)(obj = linDict.get("Linearized")) && obj > 0)) {
      return null;
    } else if ((length = getInt(linDict, "L")) !== stream.length) {
      throw new Error('The "L" parameter in the linearization dictionary ' + "does not equal the stream length.");
    }

    return {
      length,
      hints: getHints(linDict),
      objectNumberFirst: getInt(linDict, "O"),
      endFirst: getInt(linDict, "E"),
      numPages: getInt(linDict, "N"),
      mainXRefEntriesOffset: getInt(linDict, "T"),
      pageFirst: linDict.has("P") ? getInt(linDict, "P", true) : 0
    };
  }

}

exports.Linearization = Linearization;