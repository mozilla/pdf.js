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
  FormatError,
  info,
  warn,
} from "../shared/util.js";
import { Cmd, Dict, EOF, isCmd, Name, Ref } from "./primitives.js";
import {
  isWhiteSpace,
  MissingDataException,
  ParserEOFException,
} from "./core_utils.js";
import { NullStream, Stream } from "./stream.js";
import { Ascii85Stream } from "./ascii_85_stream.js";
import { AsciiHexStream } from "./ascii_hex_stream.js";
import { CCITTFaxStream } from "./ccitt_stream.js";
import { FlateStream } from "./flate_stream.js";
import { Jbig2Stream } from "./jbig2_stream.js";
import { JpegStream } from "./jpeg_stream.js";
import { JpxStream } from "./jpx_stream.js";
import { LZWStream } from "./lzw_stream.js";
import { PredictorStream } from "./predictor_stream.js";
import { RunLengthStream } from "./run_length_stream.js";

const MAX_LENGTH_TO_CACHE = 1000;

function getInlineImageCacheKey(bytes) {
  const strBuf = [],
    ii = bytes.length;
  let i = 0;
  while (i < ii - 1) {
    strBuf.push((bytes[i++] << 8) | bytes[i++]);
  }
  // Handle an odd number of elements.
  if (i < ii) {
    strBuf.push(bytes[i]);
  }
  // We purposely include the "raw" length in the cacheKey, to prevent any
  // possible issues with hash collisions in the inline image cache.
  // Here we also assume that `strBuf` is never larger than 8192 elements,
  // please refer to the `bytesToString` implementation.
  return ii + "_" + String.fromCharCode.apply(null, strBuf);
}

class Parser {
  constructor({ lexer, xref, allowStreams = false, recoveryMode = false }) {
    this.lexer = lexer;
    this.xref = xref;
    this.allowStreams = allowStreams;
    this.recoveryMode = recoveryMode;

    this.imageCache = Object.create(null);
    this._imageId = 0;
    this.refill();
  }

  refill() {
    this.buf1 = this.lexer.getObj();
    this.buf2 = this.lexer.getObj();
  }

  shift() {
    if (this.buf2 instanceof Cmd && this.buf2.cmd === "ID") {
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
      if (e instanceof MissingDataException) {
        throw e;
      }
      // Upon failure, the caller should reset this.lexer.pos to a known good
      // state and call this.shift() twice to reset the buffers.
      return false;
    }
  }

  getObj(cipherTransform = null) {
    const buf1 = this.buf1;
    this.shift();

    if (buf1 instanceof Cmd) {
      switch (buf1.cmd) {
        case "BI": // inline image
          return this.makeInlineImage(cipherTransform);
        case "[": // array
          const array = [];
          while (!isCmd(this.buf1, "]") && this.buf1 !== EOF) {
            array.push(this.getObj(cipherTransform));
          }
          if (this.buf1 === EOF) {
            if (this.recoveryMode) {
              return array;
            }
            throw new ParserEOFException("End of file inside array.");
          }
          this.shift();
          return array;
        case "<<": // dictionary or stream
          const dict = new Dict(this.xref);
          while (!isCmd(this.buf1, ">>") && this.buf1 !== EOF) {
            if (!(this.buf1 instanceof Name)) {
              info("Malformed dictionary: key must be a name object");
              this.shift();
              continue;
            }

            const key = this.buf1.name;
            this.shift();
            if (this.buf1 === EOF) {
              break;
            }
            dict.set(key, this.getObj(cipherTransform));
          }
          if (this.buf1 === EOF) {
            if (this.recoveryMode) {
              return dict;
            }
            throw new ParserEOFException("End of file inside dictionary.");
          }

          // Stream objects are not allowed inside content streams or
          // object streams.
          if (isCmd(this.buf2, "stream")) {
            return this.allowStreams
              ? this.makeStream(dict, cipherTransform)
              : dict;
          }
          this.shift();
          return dict;
        default: // simple object
          return buf1;
      }
    }

    if (Number.isInteger(buf1)) {
      // indirect reference or integer
      if (Number.isInteger(this.buf1) && isCmd(this.buf2, "R")) {
        const ref = Ref.get(buf1, this.buf1);
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

    // simple object
    return buf1;
  }

  /**
   * Find the end of the stream by searching for the /EI\s/.
   * @returns {number} The inline stream length.
   */
  findDefaultInlineStreamEnd(stream) {
    const E = 0x45,
      I = 0x49,
      SPACE = 0x20,
      LF = 0xa,
      CR = 0xd,
      NUL = 0x0;
    const { knownCommands } = this.lexer,
      startPos = stream.pos,
      n = 15;
    let state = 0,
      ch,
      maybeEIPos;
    while ((ch = stream.getByte()) !== -1) {
      if (state === 0) {
        state = ch === E ? 1 : 0;
      } else if (state === 1) {
        state = ch === I ? 2 : 0;
      } else {
        if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
          assert(state === 2, "findDefaultInlineStreamEnd - invalid state.");
        }
        if (ch === SPACE || ch === LF || ch === CR) {
          maybeEIPos = stream.pos;
          // Let's check that the next `n` bytes are ASCII... just to be sure.
          const followingBytes = stream.peekBytes(n);

          const ii = followingBytes.length;
          if (ii === 0) {
            break; // The end of the stream was reached, nothing to check.
          }
          for (let i = 0; i < ii; i++) {
            ch = followingBytes[i];
            if (ch === NUL && followingBytes[i + 1] !== NUL) {
              // NUL bytes are not supposed to occur *outside* of inline
              // images, but some PDF generators violate that assumption,
              // thus breaking the EI detection heuristics used below.
              //
              // However, we can't unconditionally treat NUL bytes as "ASCII",
              // since that *could* result in inline images being truncated.
              //
              // To attempt to address this, we'll still treat any *sequence*
              // of NUL bytes as non-ASCII, but for a *single* NUL byte we'll
              // continue checking the `followingBytes` (fixes issue8823.pdf).
              continue;
            }
            if (ch !== LF && ch !== CR && (ch < SPACE || ch > 0x7f)) {
              // Not a LF, CR, SPACE or any visible ASCII character, i.e.
              // it's binary stuff. Resetting the state.
              state = 0;
              break;
            }
          }

          if (state !== 2) {
            continue;
          }
          if (!knownCommands) {
            warn(
              "findDefaultInlineStreamEnd - `lexer.knownCommands` is undefined."
            );
            continue;
          }
          // Check that the "EI" sequence isn't part of the image data, since
          // that would cause the image to be truncated (fixes issue11124.pdf).
          //
          // Check more than the `followingBytes` to be able to find operators
          // with multiple arguments, e.g. transform (cm) with decimal arguments
          // (fixes issue19494.pdf).
          const tmpLexer = new Lexer(
            new Stream(stream.peekBytes(5 * n)),
            knownCommands
          );
          // Reduce the number of (potential) warning messages.
          tmpLexer._hexStringWarn = () => {};
          let numArgs = 0;

          while (true) {
            const nextObj = tmpLexer.getObj();

            if (nextObj === EOF) {
              state = 0; // No valid command found, resetting the state.
              break;
            }
            if (nextObj instanceof Cmd) {
              const knownCommand = knownCommands[nextObj.cmd];
              if (!knownCommand) {
                // Not a valid command, i.e. the inline image data *itself*
                // contains an "EI" sequence. Resetting the state.
                state = 0;
                break;
              } else if (
                knownCommand.variableArgs
                  ? numArgs <= knownCommand.numArgs
                  : numArgs === knownCommand.numArgs
              ) {
                break; // Valid command found.
              }
              numArgs = 0;
              continue;
            }
            numArgs++;
          }

          if (state === 2) {
            break; // Finished!
          }
        } else {
          state = 0;
        }
      }
    }

    if (ch === -1) {
      warn(
        "findDefaultInlineStreamEnd: " +
          "Reached the end of the stream without finding a valid EI marker"
      );
      if (maybeEIPos) {
        warn('... trying to recover by using the last "EI" occurrence.');
        stream.skip(-(stream.pos - maybeEIPos)); // Reset the stream position.
      }
    }

    let endOffset = 4;
    stream.skip(-endOffset); // Set the stream position to just before "EI".
    ch = stream.peekByte();
    stream.skip(endOffset); // ... and remember to reset the stream position.

    // Ensure that we don't accidentally truncate the inline image, when the
    // data is immediately followed by the "EI" marker (fixes issue10388.pdf).
    if (!isWhiteSpace(ch)) {
      endOffset--;
    }
    return stream.pos - endOffset - startPos;
  }

  /**
   * Find the EOI (end-of-image) marker 0xFFD9 of the stream.
   * @returns {number} The inline stream length.
   */
  findDCTDecodeInlineStreamEnd(stream) {
    const startPos = stream.pos;
    let foundEOI = false,
      b,
      markerLength;
    while ((b = stream.getByte()) !== -1) {
      if (b !== 0xff) {
        // Not a valid marker.
        continue;
      }
      switch (stream.getByte()) {
        case 0x00: // Byte stuffing.
          // 0xFF00 appears to be a very common byte sequence in JPEG images.
          break;

        case 0xff: // Fill byte.
          // Avoid skipping a valid marker, resetting the stream position.
          stream.skip(-1);
          break;

        case 0xd9: // EOI
          foundEOI = true;
          break;

        case 0xc0: // SOF0
        case 0xc1: // SOF1
        case 0xc2: // SOF2
        case 0xc3: // SOF3
        /* falls through */
        case 0xc5: // SOF5
        case 0xc6: // SOF6
        case 0xc7: // SOF7
        /* falls through */
        case 0xc9: // SOF9
        case 0xca: // SOF10
        case 0xcb: // SOF11
        /* falls through */
        case 0xcd: // SOF13
        case 0xce: // SOF14
        case 0xcf: // SOF15
        /* falls through */
        case 0xc4: // DHT
        case 0xcc: // DAC
        /* falls through */
        case 0xda: // SOS
        case 0xdb: // DQT
        case 0xdc: // DNL
        case 0xdd: // DRI
        case 0xde: // DHP
        case 0xdf: // EXP
        /* falls through */
        case 0xe0: // APP0
        case 0xe1: // APP1
        case 0xe2: // APP2
        case 0xe3: // APP3
        case 0xe4: // APP4
        case 0xe5: // APP5
        case 0xe6: // APP6
        case 0xe7: // APP7
        case 0xe8: // APP8
        case 0xe9: // APP9
        case 0xea: // APP10
        case 0xeb: // APP11
        case 0xec: // APP12
        case 0xed: // APP13
        case 0xee: // APP14
        case 0xef: // APP15
        /* falls through */
        case 0xfe: // COM
          // The marker should be followed by the length of the segment.
          markerLength = stream.getUint16();
          if (markerLength > 2) {
            // |markerLength| contains the byte length of the marker segment,
            // including its own length (2 bytes) and excluding the marker.
            stream.skip(markerLength - 2); // Jump to the next marker.
          } else {
            // The marker length is invalid, resetting the stream position.
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
      warn(
        "Inline DCTDecode image stream: " +
          "EOI marker not found, searching for /EI/ instead."
      );
      stream.skip(-length); // Reset the stream position.
      return this.findDefaultInlineStreamEnd(stream);
    }
    this.inlineStreamSkipEI(stream);
    return length;
  }

  /**
   * Find the EOD (end-of-data) marker '~>' (i.e. TILDE + GT) of the stream.
   * @returns {number} The inline stream length.
   */
  findASCII85DecodeInlineStreamEnd(stream) {
    const TILDE = 0x7e,
      GT = 0x3e;
    const startPos = stream.pos;
    let ch;
    while ((ch = stream.getByte()) !== -1) {
      if (ch === TILDE) {
        const tildePos = stream.pos;

        ch = stream.peekByte();
        // Handle corrupt PDF documents which contains whitespace "inside" of
        // the EOD marker (fixes issue10614.pdf).
        while (isWhiteSpace(ch)) {
          stream.skip();
          ch = stream.peekByte();
        }
        if (ch === GT) {
          stream.skip();
          break;
        }
        // Handle corrupt PDF documents which contains truncated EOD markers,
        // where the '>' character is missing (fixes issue11385.pdf).
        if (stream.pos > tildePos) {
          const maybeEI = stream.peekBytes(2);
          if (maybeEI[0] === /* E = */ 0x45 && maybeEI[1] === /* I = */ 0x49) {
            break;
          }
        }
      }
    }
    const length = stream.pos - startPos;
    if (ch === -1) {
      warn(
        "Inline ASCII85Decode image stream: " +
          "EOD marker not found, searching for /EI/ instead."
      );
      stream.skip(-length); // Reset the stream position.
      return this.findDefaultInlineStreamEnd(stream);
    }
    this.inlineStreamSkipEI(stream);
    return length;
  }

  /**
   * Find the EOD (end-of-data) marker '>' (i.e. GT) of the stream.
   * @returns {number} The inline stream length.
   */
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
      warn(
        "Inline ASCIIHexDecode image stream: " +
          "EOD marker not found, searching for /EI/ instead."
      );
      stream.skip(-length); // Reset the stream position.
      return this.findDefaultInlineStreamEnd(stream);
    }
    this.inlineStreamSkipEI(stream);
    return length;
  }

  /**
   * Skip over the /EI/ for streams where we search for an EOD marker.
   */
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

    // Parse dictionary, but initialize it lazily to improve performance with
    // cached inline images (see issue 2618).
    const dictMap = Object.create(null);
    let dictLength;
    while (!isCmd(this.buf1, "ID") && this.buf1 !== EOF) {
      if (!(this.buf1 instanceof Name)) {
        throw new FormatError("Dictionary key must be a name object");
      }
      const key = this.buf1.name;
      this.shift();
      if (this.buf1 === EOF) {
        break;
      }
      dictMap[key] = this.getObj(cipherTransform);
    }
    if (lexer.beginInlineImagePos !== -1) {
      dictLength = stream.pos - lexer.beginInlineImagePos;
    }

    // Extract the name of the first (i.e. the current) image filter.
    const filter = this.xref.fetchIfRef(dictMap.F || dictMap.Filter);
    let filterName;
    if (filter instanceof Name) {
      filterName = filter.name;
    } else if (Array.isArray(filter)) {
      const filterZero = this.xref.fetchIfRef(filter[0]);
      if (filterZero instanceof Name) {
        filterName = filterZero.name;
      }
    }

    // Parse image stream.
    const startPos = stream.pos;
    let length;
    switch (filterName) {
      case "DCT":
      case "DCTDecode":
        length = this.findDCTDecodeInlineStreamEnd(stream);
        break;
      case "A85":
      case "ASCII85Decode":
        length = this.findASCII85DecodeInlineStreamEnd(stream);
        break;
      case "AHx":
      case "ASCIIHexDecode":
        length = this.findASCIIHexDecodeInlineStreamEnd(stream);
        break;
      default:
        length = this.findDefaultInlineStreamEnd(stream);
    }

    // Cache all images below the MAX_LENGTH_TO_CACHE threshold by their
    // stringified content, to prevent possible hash collisions.
    let cacheKey;
    if (length < MAX_LENGTH_TO_CACHE && dictLength > 0) {
      const initialStreamPos = stream.pos;
      // Set the stream position to the beginning of the dictionary data...
      stream.pos = lexer.beginInlineImagePos;
      // ... and fetch the bytes of the dictionary *and* the inline image.
      cacheKey = getInlineImageCacheKey(stream.getBytes(dictLength + length));
      // Finally, don't forget to reset the stream position.
      stream.pos = initialStreamPos;

      const cacheEntry = this.imageCache[cacheKey];
      if (cacheEntry !== undefined) {
        this.buf2 = Cmd.get("EI");
        this.shift();

        cacheEntry.reset();
        return cacheEntry;
      }
    }

    const dict = new Dict(this.xref);
    for (const key in dictMap) {
      dict.set(key, dictMap[key]);
    }
    let imageStream = stream.makeSubStream(startPos, length, dict);
    if (cipherTransform) {
      imageStream = cipherTransform.createStream(imageStream, length);
    }

    imageStream = this.filter(imageStream, dict, length);
    imageStream.dict = dict;
    if (cacheKey !== undefined) {
      imageStream.cacheKey = `inline_img_${++this._imageId}`;
      this.imageCache[cacheKey] = imageStream;
    }

    this.buf2 = Cmd.get("EI");
    this.shift();

    return imageStream;
  }

  #findStreamLength(startPos) {
    const { stream } = this.lexer;
    stream.pos = startPos;

    const SCAN_BLOCK_LENGTH = 2048;
    const signatureLength = "endstream".length;

    const END_SIGNATURE = new Uint8Array([0x65, 0x6e, 0x64]);
    const endLength = END_SIGNATURE.length;

    // Ideally we'd directly search for "endstream", however there are corrupt
    // PDF documents where the command is incomplete; hence we search for:
    //  1. The normal case.
    //  2. The misspelled case (fixes issue18122.pdf).
    //  3. The truncated case (fixes issue10004.pdf).
    const PARTIAL_SIGNATURE = [
      new Uint8Array([0x73, 0x74, 0x72, 0x65, 0x61, 0x6d]), // "stream"
      new Uint8Array([0x73, 0x74, 0x65, 0x61, 0x6d]), // "steam",
      new Uint8Array([0x73, 0x74, 0x72, 0x65, 0x61]), // "strea"
    ];
    const normalLength = signatureLength - endLength;

    while (stream.pos < stream.end) {
      const scanBytes = stream.peekBytes(SCAN_BLOCK_LENGTH);
      const scanLength = scanBytes.length - signatureLength;

      if (scanLength <= 0) {
        break;
      }
      let pos = 0;
      while (pos < scanLength) {
        let j = 0;
        while (j < endLength && scanBytes[pos + j] === END_SIGNATURE[j]) {
          j++;
        }
        if (j >= endLength) {
          // "end" found, find the complete command.
          let found = false;
          for (const part of PARTIAL_SIGNATURE) {
            const partLen = part.length;
            let k = 0;
            while (k < partLen && scanBytes[pos + j + k] === part[k]) {
              k++;
            }
            if (k >= normalLength) {
              // Found "endstream" command.
              found = true;
              break;
            }
            if (k >= partLen) {
              // Found "endsteam" or "endstea" command.
              // Ensure that the byte immediately following the corrupt
              // endstream command is a space, to prevent false positives.
              const lastByte = scanBytes[pos + j + k];
              if (isWhiteSpace(lastByte)) {
                info(
                  `Found "${bytesToString([...END_SIGNATURE, ...part])}" when ` +
                    "searching for endstream command."
                );
                found = true;
              }
              break;
            }
          }

          if (found) {
            stream.pos += pos;
            return stream.pos - startPos;
          }
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

    // Get the stream's start position.
    lexer.skipToNextLine();
    const startPos = stream.pos - 1;

    // Get the length.
    let length = dict.get("Length");
    if (!Number.isInteger(length)) {
      info(`Bad length "${length && length.toString()}" in stream.`);
      length = 0;
    }

    // Skip over the stream data.
    stream.pos = startPos + length;
    lexer.nextChar();

    // Shift '>>' and check whether the new object marks the end of the stream.
    if (this.tryShift() && isCmd(this.buf2, "endstream")) {
      this.shift(); // 'stream'
    } else {
      // Bad stream length, scanning for endstream command.
      length = this.#findStreamLength(startPos);
      if (length < 0) {
        throw new FormatError("Missing endstream command.");
      }

      lexer.nextChar();
      this.shift();
      this.shift();
    }
    this.shift(); // 'endstream'

    stream = stream.makeSubStream(startPos, length, dict);
    if (cipherTransform) {
      stream = cipherTransform.createStream(stream, length);
    }
    stream = this.filter(stream, dict, length);
    stream.dict = dict;
    return stream;
  }

  filter(stream, dict, length) {
    let filter = dict.get("F", "Filter");
    let params = dict.get("DP", "DecodeParms");

    if (filter instanceof Name) {
      if (Array.isArray(params)) {
        warn("/DecodeParms should not be an Array, when /Filter is a Name.");
      }
      return this.makeFilter(stream, filter.name, length, params);
    }

    let maybeLength = length;
    if (Array.isArray(filter)) {
      const filterArray = filter;
      const paramsArray = params;
      for (let i = 0, ii = filterArray.length; i < ii; ++i) {
        filter = this.xref.fetchIfRef(filterArray[i]);
        if (!(filter instanceof Name)) {
          throw new FormatError(`Bad filter name "${filter}"`);
        }

        params = null;
        if (Array.isArray(paramsArray) && i in paramsArray) {
          params = this.xref.fetchIfRef(paramsArray[i]);
        }
        stream = this.makeFilter(stream, filter.name, maybeLength, params);
        // After the first stream the `length` variable is invalid.
        maybeLength = null;
      }
    }
    return stream;
  }

  makeFilter(stream, name, maybeLength, params) {
    // Since the 'Length' entry in the stream dictionary can be completely
    // wrong, e.g. zero for non-empty streams, only skip parsing the stream
    // when we can be absolutely certain that it actually is empty.
    if (maybeLength === 0) {
      warn(`Empty "${name}" stream.`);
      return new NullStream();
    }

    try {
      switch (name) {
        case "Fl":
        case "FlateDecode":
          if (params) {
            return new PredictorStream(
              new FlateStream(stream, maybeLength),
              maybeLength,
              params
            );
          }
          return new FlateStream(stream, maybeLength);
        case "LZW":
        case "LZWDecode":
          let earlyChange = 1;
          if (params) {
            if (params.has("EarlyChange")) {
              earlyChange = params.get("EarlyChange");
            }
            return new PredictorStream(
              new LZWStream(stream, maybeLength, earlyChange),
              maybeLength,
              params
            );
          }
          return new LZWStream(stream, maybeLength, earlyChange);
        case "DCT":
        case "DCTDecode":
          return new JpegStream(stream, maybeLength, params);
        case "JPX":
        case "JPXDecode":
          return new JpxStream(stream, maybeLength, params);
        case "A85":
        case "ASCII85Decode":
          return new Ascii85Stream(stream, maybeLength);
        case "AHx":
        case "ASCIIHexDecode":
          return new AsciiHexStream(stream, maybeLength);
        case "CCF":
        case "CCITTFaxDecode":
          return new CCITTFaxStream(stream, maybeLength, params);
        case "RL":
        case "RunLengthDecode":
          return new RunLengthStream(stream, maybeLength);
        case "JBIG2Decode":
          return new Jbig2Stream(stream, maybeLength, params);
      }
      warn(`Filter "${name}" is not supported.`);
      return stream;
    } catch (ex) {
      if (ex instanceof MissingDataException) {
        throw ex;
      }
      warn(`Invalid stream: "${ex}"`);
      return new NullStream();
    }
  }
}

// A '1' in this array means the character is white space. A '1' or
// '2' means the character ends a name or command.
// prettier-ignore
const specialChars = [
  1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, // 0x
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 1x
  1, 0, 0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 0, 0, 0, 2, // 2x
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, // 3x
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 4x
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, // 5x
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 6x
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, // 7x
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 8x
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 9x
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // ax
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // bx
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // cx
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // dx
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // ex
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0  // fx
];

function toHexDigit(ch) {
  if (ch >= /* '0' = */ 0x30 && ch /* '9' = */ <= 0x39) {
    return ch & 0x0f;
  }
  if (
    (ch >= /* 'A' = */ 0x41 && ch <= /* 'F' = */ 0x46) ||
    (ch >= /* 'a' = */ 0x61 && ch <= /* 'f' = */ 0x66)
  ) {
    return (ch & 0x0f) + 9;
  }
  return -1;
}

class Lexer {
  constructor(stream, knownCommands = null) {
    this.stream = stream;
    this.nextChar();

    // While lexing, we build up many strings one char at a time. Using += for
    // this can result in lots of garbage strings. It's better to build an
    // array of single-char strings and then join() them together at the end.
    // And reusing a single array (i.e. |this.strBuf|) over and over for this
    // purpose uses less memory than using a new array for each string.
    this.strBuf = [];

    // The PDFs might have "glued" commands with other commands, operands or
    // literals, e.g. "q1". The knownCommands is a dictionary of the valid
    // commands and their prefixes. The prefixes are built the following way:
    // if there a command that is a prefix of the other valid command or
    // literal (e.g. 'f' and 'false') the following prefixes must be included,
    // 'fa', 'fal', 'fals'. The prefixes are not needed, if the command has no
    // other commands or literals as a prefix. The knowCommands is optional.
    this.knownCommands = knownCommands;

    this._hexStringNumWarn = 0;
    this.beginInlineImagePos = -1;
  }

  nextChar() {
    return (this.currentChar = this.stream.getByte());
  }

  peekChar() {
    return this.stream.peekByte();
  }

  getNumber() {
    let ch = this.currentChar;
    let eNotation = false;
    let divideBy = 0; // Different from 0 if it's a floating point value.
    let sign = 1;

    if (ch === /* '-' = */ 0x2d) {
      sign = -1;
      ch = this.nextChar();

      if (ch === /* '-' = */ 0x2d) {
        // Ignore double negative (this is consistent with Adobe Reader).
        ch = this.nextChar();
      }
    } else if (ch === /* '+' = */ 0x2b) {
      ch = this.nextChar();
    }
    if (ch === /* LF = */ 0x0a || ch === /* CR = */ 0x0d) {
      // Ignore line-breaks (this is consistent with Adobe Reader).
      do {
        ch = this.nextChar();
      } while (ch === 0x0a || ch === 0x0d);
    }
    if (ch === /* '.' = */ 0x2e) {
      divideBy = 10;
      ch = this.nextChar();
    }
    if (ch < /* '0' = */ 0x30 || ch > /* '9' = */ 0x39) {
      const msg = `Invalid number: ${String.fromCharCode(ch)} (charCode ${ch})`;

      if (isWhiteSpace(ch) || ch === /* EOF = */ -1) {
        // This is consistent with Adobe Reader (fixes issue9252.pdf,
        // issue15604.pdf, bug1753983.pdf).
        info(`Lexer.getNumber - "${msg}".`);
        return 0;
      }
      throw new FormatError(msg);
    }

    let baseValue = ch - 0x30; // '0'
    let powerValue = 0;
    let powerValueSign = 1;

    while ((ch = this.nextChar()) >= 0) {
      if (ch >= /* '0' = */ 0x30 && ch <= /* '9' = */ 0x39) {
        const currentDigit = ch - 0x30; // '0'
        if (eNotation) {
          // We are after an 'e' or 'E'.
          powerValue = powerValue * 10 + currentDigit;
        } else {
          if (divideBy !== 0) {
            // We are after a point.
            divideBy *= 10;
          }
          baseValue = baseValue * 10 + currentDigit;
        }
      } else if (ch === /* '.' = */ 0x2e) {
        if (divideBy === 0) {
          divideBy = 1;
        } else {
          // A number can have only one dot.
          break;
        }
      } else if (ch === /* '-' = */ 0x2d) {
        // Ignore minus signs in the middle of numbers to match
        // Adobe's behavior.
        warn("Badly formatted number: minus sign in the middle");
      } else if (ch === /* 'E' = */ 0x45 || ch === /* 'e' = */ 0x65) {
        // 'E' can be either a scientific notation or the beginning of a new
        // operator.
        ch = this.peekChar();
        if (ch === /* '+' = */ 0x2b || ch === /* '-' = */ 0x2d) {
          powerValueSign = ch === 0x2d ? -1 : 1;
          this.nextChar(); // Consume the sign character.
        } else if (ch < /* '0' = */ 0x30 || ch > /* '9' = */ 0x39) {
          // The 'E' must be the beginning of a new operator.
          break;
        }
        eNotation = true;
      } else {
        // The last character doesn't belong to us.
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
          warn("Unterminated string");
          done = true;
          break;
        case 0x28: // '('
          ++numParen;
          strBuf.push("(");
          break;
        case 0x29: // ')'
          if (--numParen === 0) {
            this.nextChar(); // consume strings ')'
            done = true;
          } else {
            strBuf.push(")");
          }
          break;
        case 0x5c: // '\\'
          ch = this.nextChar();
          switch (ch) {
            case -1:
              warn("Unterminated string");
              done = true;
              break;
            case 0x6e: // 'n'
              strBuf.push("\n");
              break;
            case 0x72: // 'r'
              strBuf.push("\r");
              break;
            case 0x74: // 't'
              strBuf.push("\t");
              break;
            case 0x62: // 'b'
              strBuf.push("\b");
              break;
            case 0x66: // 'f'
              strBuf.push("\f");
              break;
            case 0x5c: // '\'
            case 0x28: // '('
            case 0x29: // ')'
              strBuf.push(String.fromCharCode(ch));
              break;
            case 0x30: // '0'
            case 0x31: // '1'
            case 0x32: // '2'
            case 0x33: // '3'
            case 0x34: // '4'
            case 0x35: // '5'
            case 0x36: // '6'
            case 0x37: // '7'
              let x = ch & 0x0f;
              ch = this.nextChar();
              charBuffered = true;
              if (ch >= /* '0' = */ 0x30 && ch <= /* '7' = */ 0x37) {
                x = (x << 3) + (ch & 0x0f);
                ch = this.nextChar();
                if (ch >= /* '0' = */ 0x30 && ch /* '7' = */ <= 0x37) {
                  charBuffered = false;
                  x = (x << 3) + (ch & 0x0f);
                }
              }
              strBuf.push(String.fromCharCode(x));
              break;
            case 0x0d: // CR
              if (this.peekChar() === /* LF = */ 0x0a) {
                this.nextChar();
              }
              break;
            case 0x0a: // LF
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
      if (ch === /* '#' = */ 0x23) {
        ch = this.nextChar();
        if (specialChars[ch]) {
          warn(
            "Lexer_getName: " +
              "NUMBER SIGN (#) should be followed by a hexadecimal number."
          );
          strBuf.push("#");
          break;
        }
        const x = toHexDigit(ch);
        if (x !== -1) {
          previousCh = ch;
          ch = this.nextChar();
          const x2 = toHexDigit(ch);
          if (x2 === -1) {
            warn(
              `Lexer_getName: Illegal digit (${String.fromCharCode(ch)}) ` +
                "in hexadecimal number."
            );
            strBuf.push("#", String.fromCharCode(previousCh));
            if (specialChars[ch]) {
              break;
            }
            strBuf.push(String.fromCharCode(ch));
            continue;
          }
          strBuf.push(String.fromCharCode((x << 4) | x2));
        } else {
          strBuf.push("#", String.fromCharCode(ch));
        }
      } else {
        strBuf.push(String.fromCharCode(ch));
      }
    }
    if (strBuf.length > 127) {
      warn(`Name token is longer than allowed by the spec: ${strBuf.length}`);
    }
    return Name.get(strBuf.join(""));
  }

  /**
   * @private
   */
  _hexStringWarn(ch) {
    const MAX_HEX_STRING_NUM_WARN = 5;

    if (this._hexStringNumWarn++ === MAX_HEX_STRING_NUM_WARN) {
      warn("getHexString - ignoring additional invalid characters.");
      return;
    }
    if (this._hexStringNumWarn > MAX_HEX_STRING_NUM_WARN) {
      // Limit the number of warning messages printed for a `this.getHexString`
      // invocation, since corrupt PDF documents may otherwise spam the console
      // enough to affect general performance negatively.
      return;
    }
    warn(`getHexString - ignoring invalid character: ${ch}`);
  }

  getHexString() {
    const strBuf = this.strBuf;
    strBuf.length = 0;
    let ch = this.currentChar;
    let firstDigit = -1,
      digit = -1;
    this._hexStringNumWarn = 0;

    while (true) {
      if (ch < 0) {
        warn("Unterminated hex string");
        break;
      } else if (ch === /* '>' = */ 0x3e) {
        this.nextChar();
        break;
      } else if (specialChars[ch] === 1) {
        ch = this.nextChar();
        continue;
      } else {
        digit = toHexDigit(ch);
        if (digit === -1) {
          this._hexStringWarn(ch);
        } else if (firstDigit === -1) {
          firstDigit = digit;
        } else {
          strBuf.push(String.fromCharCode((firstDigit << 4) | digit));
          firstDigit = -1;
        }
        ch = this.nextChar();
      }
    }

    // According to the PDF spec, section "7.3.4.3 Hexadecimal Strings":
    //  "If the final digit of a hexadecimal string is missing—that is, if there
    //   is an odd number of digits—the final digit shall be assumed to be 0."
    if (firstDigit !== -1) {
      strBuf.push(String.fromCharCode(firstDigit << 4));
    }
    return strBuf.join("");
  }

  getObj() {
    // Skip whitespace and comments.
    let comment = false;
    let ch = this.currentChar;
    while (true) {
      if (ch < 0) {
        return EOF;
      }
      if (comment) {
        if (ch === /* LF = */ 0x0a || ch === /* CR = */ 0x0d) {
          comment = false;
        }
      } else if (ch === /* '%' = */ 0x25) {
        comment = true;
      } else if (specialChars[ch] !== 1) {
        break;
      }
      ch = this.nextChar();
    }

    // Start reading a token.
    switch (ch | 0) {
      case 0x30: // '0'
      case 0x31: // '1'
      case 0x32: // '2'
      case 0x33: // '3'
      case 0x34: // '4'
      case 0x35: // '5'
      case 0x36: // '6'
      case 0x37: // '7'
      case 0x38: // '8'
      case 0x39: // '9'
      case 0x2b: // '+'
      case 0x2d: // '-'
      case 0x2e: // '.'
        return this.getNumber();
      case 0x28: // '('
        return this.getString();
      case 0x2f: // '/'
        return this.getName();
      // array punctuation
      case 0x5b: // '['
        this.nextChar();
        return Cmd.get("[");
      case 0x5d: // ']'
        this.nextChar();
        return Cmd.get("]");
      // hex string or dict punctuation
      case 0x3c: // '<'
        ch = this.nextChar();
        if (ch === 0x3c) {
          // dict punctuation
          this.nextChar();
          return Cmd.get("<<");
        }
        return this.getHexString();
      // dict punctuation
      case 0x3e: // '>'
        ch = this.nextChar();
        if (ch === 0x3e) {
          this.nextChar();
          return Cmd.get(">>");
        }
        return Cmd.get(">");
      case 0x7b: // '{'
        this.nextChar();
        return Cmd.get("{");
      case 0x7d: // '}'
        this.nextChar();
        return Cmd.get("}");
      case 0x29: // ')'
        // Consume the current character in order to avoid permanently hanging
        // the worker thread if `Lexer.getObj` is called from within a loop
        // containing try-catch statements, since we would otherwise attempt
        // to parse the *same* character over and over (fixes issue8061.pdf).
        this.nextChar();
        throw new FormatError(`Illegal character: ${ch}`);
    }

    // Start reading a command.
    let str = String.fromCharCode(ch);
    // A valid command cannot start with a non-visible ASCII character,
    // and the next character may be (the start of) a valid command.
    if (ch < 0x20 || ch > 0x7f) {
      const nextCh = this.peekChar();
      if (nextCh >= 0x20 && nextCh <= 0x7f) {
        this.nextChar();
        return Cmd.get(str);
      }
    }
    const knownCommands = this.knownCommands;
    let knownCommandFound = knownCommands?.[str] !== undefined;
    while ((ch = this.nextChar()) >= 0 && !specialChars[ch]) {
      // Stop if a known command is found and next character does not make
      // the string a command.
      const possibleCommand = str + String.fromCharCode(ch);
      if (knownCommandFound && knownCommands[possibleCommand] === undefined) {
        break;
      }
      if (str.length === 128) {
        throw new FormatError(`Command token too long: ${str.length}`);
      }
      str = possibleCommand;
      knownCommandFound = knownCommands?.[str] !== undefined;
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
      // Keep track of the current stream position, since it's needed in order
      // to correctly cache inline images; see `Parser.makeInlineImage`.
      this.beginInlineImagePos = this.stream.pos;
    }

    return Cmd.get(str);
  }

  skipToNextLine() {
    let ch = this.currentChar;
    while (ch >= 0) {
      if (ch === /* CR = */ 0x0d) {
        ch = this.nextChar();
        if (ch === /* LF = */ 0x0a) {
          this.nextChar();
        }
        break;
      } else if (ch === /* LF = */ 0x0a) {
        this.nextChar();
        break;
      }
      ch = this.nextChar();
    }
  }
}

class Linearization {
  static create(stream) {
    function getInt(linDict, name, allowZeroValue = false) {
      const obj = linDict.get(name);
      if (Number.isInteger(obj) && (allowZeroValue ? obj >= 0 : obj > 0)) {
        return obj;
      }
      throw new Error(
        `The "${name}" parameter in the linearization ` +
          "dictionary is invalid."
      );
    }

    function getHints(linDict) {
      const hints = linDict.get("H");
      let hintsLength;

      if (
        Array.isArray(hints) &&
        ((hintsLength = hints.length) === 2 || hintsLength === 4)
      ) {
        for (let index = 0; index < hintsLength; index++) {
          const hint = hints[index];
          if (!(Number.isInteger(hint) && hint > 0)) {
            throw new Error(
              `Hint (${index}) in the linearization dictionary is invalid.`
            );
          }
        }
        return hints;
      }
      throw new Error("Hint array in the linearization dictionary is invalid.");
    }

    const parser = new Parser({
      lexer: new Lexer(stream),
      xref: null,
    });
    const obj1 = parser.getObj();
    const obj2 = parser.getObj();
    const obj3 = parser.getObj();
    const linDict = parser.getObj();
    let obj, length;
    if (
      !(
        Number.isInteger(obj1) &&
        Number.isInteger(obj2) &&
        isCmd(obj3, "obj") &&
        linDict instanceof Dict &&
        typeof (obj = linDict.get("Linearized")) === "number" &&
        obj > 0
      )
    ) {
      return null; // No valid linearization dictionary found.
    } else if ((length = getInt(linDict, "L")) !== stream.length) {
      throw new Error(
        'The "L" parameter in the linearization dictionary ' +
          "does not equal the stream length."
      );
    }
    return {
      length,
      hints: getHints(linDict),
      objectNumberFirst: getInt(linDict, "O"),
      endFirst: getInt(linDict, "E"),
      numPages: getInt(linDict, "N"),
      mainXRefEntriesOffset: getInt(linDict, "T"),
      pageFirst: linDict.has("P")
        ? getInt(linDict, "P", /* allowZeroValue = */ true)
        : 0,
    };
  }
}

export { Lexer, Linearization, Parser };
