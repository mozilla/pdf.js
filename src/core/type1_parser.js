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

import { getEncoding } from "./encodings.js";
import { isWhiteSpace } from "./core_utils.js";
import { Stream } from "./stream.js";
import { warn } from "../shared/util.js";

// Hinting is currently disabled due to unknown problems on windows
// in tracemonkey and various other pdfs with type1 fonts.
const HINTING_ENABLED = false;

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
const Type1CharString = (function Type1CharStringClosure() {
  const COMMAND_MAP = {
    hstem: [1],
    vstem: [3],
    vmoveto: [4],
    rlineto: [5],
    hlineto: [6],
    vlineto: [7],
    rrcurveto: [8],
    callsubr: [10],
    flex: [12, 35],
    drop: [12, 18],
    endchar: [14],
    rmoveto: [21],
    hmoveto: [22],
    vhcurveto: [30],
    hvcurveto: [31],
  };

  // eslint-disable-next-line no-shadow
  class Type1CharString {
    constructor() {
      this.width = 0;
      this.lsb = 0;
      this.flexing = false;
      this.output = [];
      this.stack = [];
    }

    convert(encoded, subrs, seacAnalysisEnabled) {
      const count = encoded.length;
      let error = false;
      let wx, sbx, subrNumber;
      for (let i = 0; i < count; i++) {
        let value = encoded[i];
        if (value < 32) {
          if (value === 12) {
            value = (value << 8) + encoded[++i];
          }
          switch (value) {
            case 1: // hstem
              if (!HINTING_ENABLED) {
                this.stack = [];
                break;
              }
              error = this.executeCommand(2, COMMAND_MAP.hstem);
              break;
            case 3: // vstem
              if (!HINTING_ENABLED) {
                this.stack = [];
                break;
              }
              error = this.executeCommand(2, COMMAND_MAP.vstem);
              break;
            case 4: // vmoveto
              if (this.flexing) {
                if (this.stack.length < 1) {
                  error = true;
                  break;
                }
                // Add the dx for flex and but also swap the values so they are
                // the right order.
                const dy = this.stack.pop();
                this.stack.push(0, dy);
                break;
              }
              error = this.executeCommand(1, COMMAND_MAP.vmoveto);
              break;
            case 5: // rlineto
              error = this.executeCommand(2, COMMAND_MAP.rlineto);
              break;
            case 6: // hlineto
              error = this.executeCommand(1, COMMAND_MAP.hlineto);
              break;
            case 7: // vlineto
              error = this.executeCommand(1, COMMAND_MAP.vlineto);
              break;
            case 8: // rrcurveto
              error = this.executeCommand(6, COMMAND_MAP.rrcurveto);
              break;
            case 9: // closepath
              // closepath is a Type1 command that does not take argument and is
              // useless in Type2 and it can simply be ignored.
              this.stack = [];
              break;
            case 10: // callsubr
              if (this.stack.length < 1) {
                error = true;
                break;
              }
              subrNumber = this.stack.pop();
              if (!subrs[subrNumber]) {
                error = true;
                break;
              }
              error = this.convert(
                subrs[subrNumber],
                subrs,
                seacAnalysisEnabled
              );
              break;
            case 11: // return
              return error;
            case 13: // hsbw
              if (this.stack.length < 2) {
                error = true;
                break;
              }
              // To convert to type2 we have to move the width value to the
              // first part of the charstring and then use hmoveto with lsb.
              wx = this.stack.pop();
              sbx = this.stack.pop();
              this.lsb = sbx;
              this.width = wx;
              this.stack.push(wx, sbx);
              error = this.executeCommand(2, COMMAND_MAP.hmoveto);
              break;
            case 14: // endchar
              this.output.push(COMMAND_MAP.endchar[0]);
              break;
            case 21: // rmoveto
              if (this.flexing) {
                break;
              }
              error = this.executeCommand(2, COMMAND_MAP.rmoveto);
              break;
            case 22: // hmoveto
              if (this.flexing) {
                // Add the dy for flex.
                this.stack.push(0);
                break;
              }
              error = this.executeCommand(1, COMMAND_MAP.hmoveto);
              break;
            case 30: // vhcurveto
              error = this.executeCommand(4, COMMAND_MAP.vhcurveto);
              break;
            case 31: // hvcurveto
              error = this.executeCommand(4, COMMAND_MAP.hvcurveto);
              break;
            case (12 << 8) + 0: // dotsection
              // dotsection is a Type1 command to specify some hinting feature
              // for dots that do not take a parameter and it can safely be
              // ignored for Type2.
              this.stack = [];
              break;
            case (12 << 8) + 1: // vstem3
              if (!HINTING_ENABLED) {
                this.stack = [];
                break;
              }
              // [vh]stem3 are Type1 only and Type2 supports [vh]stem with
              // multiple parameters, so instead of returning [vh]stem3 take a
              // shortcut and return [vhstem] instead.
              error = this.executeCommand(2, COMMAND_MAP.vstem);
              break;
            case (12 << 8) + 2: // hstem3
              if (!HINTING_ENABLED) {
                this.stack = [];
                break;
              }
              // See vstem3.
              error = this.executeCommand(2, COMMAND_MAP.hstem);
              break;
            case (12 << 8) + 6: // seac
              // seac is like type 2's special endchar but it doesn't use the
              // first argument asb, so remove it.
              if (seacAnalysisEnabled) {
                const asb = this.stack[this.stack.length - 5];
                this.seac = this.stack.splice(-4, 4);
                this.seac[0] += this.lsb - asb;
                error = this.executeCommand(0, COMMAND_MAP.endchar);
              } else {
                error = this.executeCommand(4, COMMAND_MAP.endchar);
              }
              break;
            case (12 << 8) + 7: // sbw
              if (this.stack.length < 4) {
                error = true;
                break;
              }
              // To convert to type2 we have to move the width value to the
              // first part of the charstring and then use rmoveto with
              // (dx, dy). The height argument will not be used for vmtx and
              // vhea tables reconstruction -- ignoring it.
              this.stack.pop(); // wy
              wx = this.stack.pop();
              const sby = this.stack.pop();
              sbx = this.stack.pop();
              this.lsb = sbx;
              this.width = wx;
              this.stack.push(wx, sbx, sby);
              error = this.executeCommand(3, COMMAND_MAP.rmoveto);
              break;
            case (12 << 8) + 12: // div
              if (this.stack.length < 2) {
                error = true;
                break;
              }
              const num2 = this.stack.pop();
              const num1 = this.stack.pop();
              this.stack.push(num1 / num2);
              break;
            case (12 << 8) + 16: // callothersubr
              if (this.stack.length < 2) {
                error = true;
                break;
              }
              subrNumber = this.stack.pop();
              const numArgs = this.stack.pop();
              if (subrNumber === 0 && numArgs === 3) {
                const flexArgs = this.stack.splice(this.stack.length - 17, 17);
                this.stack.push(
                  flexArgs[2] + flexArgs[0], // bcp1x + rpx
                  flexArgs[3] + flexArgs[1], // bcp1y + rpy
                  flexArgs[4], // bcp2x
                  flexArgs[5], // bcp2y
                  flexArgs[6], // p2x
                  flexArgs[7], // p2y
                  flexArgs[8], // bcp3x
                  flexArgs[9], // bcp3y
                  flexArgs[10], // bcp4x
                  flexArgs[11], // bcp4y
                  flexArgs[12], // p3x
                  flexArgs[13], // p3y
                  flexArgs[14] // flexDepth
                  // 15 = finalx unused by flex
                  // 16 = finaly unused by flex
                );
                error = this.executeCommand(13, COMMAND_MAP.flex, true);
                this.flexing = false;
                this.stack.push(flexArgs[15], flexArgs[16]);
              } else if (subrNumber === 1 && numArgs === 0) {
                this.flexing = true;
              }
              break;
            case (12 << 8) + 17: // pop
              // Ignore this since it is only used with othersubr.
              break;
            case (12 << 8) + 33: // setcurrentpoint
              // Ignore for now.
              this.stack = [];
              break;
            default:
              warn('Unknown type 1 charstring command of "' + value + '"');
              break;
          }
          if (error) {
            break;
          }
          continue;
        } else if (value <= 246) {
          value = value - 139;
        } else if (value <= 250) {
          value = (value - 247) * 256 + encoded[++i] + 108;
        } else if (value <= 254) {
          value = -((value - 251) * 256) - encoded[++i] - 108;
        } else {
          value =
            ((encoded[++i] & 0xff) << 24) |
            ((encoded[++i] & 0xff) << 16) |
            ((encoded[++i] & 0xff) << 8) |
            ((encoded[++i] & 0xff) << 0);
        }
        this.stack.push(value);
      }
      return error;
    }

    executeCommand(howManyArgs, command, keepStack) {
      const stackLength = this.stack.length;
      if (howManyArgs > stackLength) {
        return true;
      }
      const start = stackLength - howManyArgs;
      for (let i = start; i < stackLength; i++) {
        let value = this.stack[i];
        if (Number.isInteger(value)) {
          this.output.push(28, (value >> 8) & 0xff, value & 0xff);
        } else {
          // fixed point
          value = (65536 * value) | 0;
          this.output.push(
            255,
            (value >> 24) & 0xff,
            (value >> 16) & 0xff,
            (value >> 8) & 0xff,
            value & 0xff
          );
        }
      }
      this.output.push.apply(this.output, command);
      if (keepStack) {
        this.stack.splice(start, howManyArgs);
      } else {
        this.stack.length = 0;
      }
      return false;
    }
  }

  return Type1CharString;
})();

/*
 * Type1Parser encapsulate the needed code for parsing a Type1 font
 * program. Some of its logic depends on the Type2 charstrings
 * structure.
 * Note: this doesn't really parse the font since that would require evaluation
 * of PostScript, but it is possible in most cases to extract what we need
 * without a full parse.
 */
const Type1Parser = (function Type1ParserClosure() {
  /*
   * Decrypt a Sequence of Ciphertext Bytes to Produce the Original Sequence
   * of Plaintext Bytes. The function took a key as a parameter which can be
   * for decrypting the eexec block of for decoding charStrings.
   */
  const EEXEC_ENCRYPT_KEY = 55665;
  const CHAR_STRS_ENCRYPT_KEY = 4330;

  function isHexDigit(code) {
    return (
      (code >= 48 && code <= 57) || // '0'-'9'
      (code >= 65 && code <= 70) || // 'A'-'F'
      (code >= 97 && code <= 102) // 'a'-'f'
    );
  }

  function decrypt(data, key, discardNumber) {
    if (discardNumber >= data.length) {
      return new Uint8Array(0);
    }
    const c1 = 52845,
      c2 = 22719;
    let r = key | 0,
      i,
      j;
    for (i = 0; i < discardNumber; i++) {
      r = ((data[i] + r) * c1 + c2) & ((1 << 16) - 1);
    }
    const count = data.length - discardNumber;
    const decrypted = new Uint8Array(count);
    for (i = discardNumber, j = 0; j < count; i++, j++) {
      const value = data[i];
      decrypted[j] = value ^ (r >> 8);
      r = ((value + r) * c1 + c2) & ((1 << 16) - 1);
    }
    return decrypted;
  }

  function decryptAscii(data, key, discardNumber) {
    const c1 = 52845,
      c2 = 22719;
    let r = key | 0;
    const count = data.length,
      maybeLength = count >>> 1;
    const decrypted = new Uint8Array(maybeLength);
    let i, j;
    for (i = 0, j = 0; i < count; i++) {
      const digit1 = data[i];
      if (!isHexDigit(digit1)) {
        continue;
      }
      i++;
      let digit2;
      while (i < count && !isHexDigit((digit2 = data[i]))) {
        i++;
      }
      if (i < count) {
        const value = parseInt(String.fromCharCode(digit1, digit2), 16);
        decrypted[j++] = value ^ (r >> 8);
        r = ((value + r) * c1 + c2) & ((1 << 16) - 1);
      }
    }
    return decrypted.slice(discardNumber, j);
  }

  function isSpecial(c) {
    return (
      c === /* '/' = */ 0x2f ||
      c === /* '[' = */ 0x5b ||
      c === /* ']' = */ 0x5d ||
      c === /* '{' = */ 0x7b ||
      c === /* '}' = */ 0x7d ||
      c === /* '(' = */ 0x28 ||
      c === /* ')' = */ 0x29
    );
  }

  // eslint-disable-next-line no-shadow
  class Type1Parser {
    constructor(stream, encrypted, seacAnalysisEnabled) {
      if (encrypted) {
        const data = stream.getBytes();
        const isBinary = !(
          (isHexDigit(data[0]) || isWhiteSpace(data[0])) &&
          isHexDigit(data[1]) &&
          isHexDigit(data[2]) &&
          isHexDigit(data[3]) &&
          isHexDigit(data[4]) &&
          isHexDigit(data[5]) &&
          isHexDigit(data[6]) &&
          isHexDigit(data[7])
        );
        stream = new Stream(
          isBinary
            ? decrypt(data, EEXEC_ENCRYPT_KEY, 4)
            : decryptAscii(data, EEXEC_ENCRYPT_KEY, 4)
        );
      }
      this.seacAnalysisEnabled = !!seacAnalysisEnabled;

      this.stream = stream;
      this.nextChar();
    }

    readNumberArray() {
      this.getToken(); // read '[' or '{' (arrays can start with either)
      const array = [];
      while (true) {
        const token = this.getToken();
        if (token === null || token === "]" || token === "}") {
          break;
        }
        array.push(parseFloat(token || 0));
      }
      return array;
    }

    readNumber() {
      const token = this.getToken();
      return parseFloat(token || 0);
    }

    readInt() {
      // Use '| 0' to prevent setting a double into length such as the double
      // does not flow into the loop variable.
      const token = this.getToken();
      return parseInt(token || 0, 10) | 0;
    }

    readBoolean() {
      const token = this.getToken();
      // Use 1 and 0 since that's what type2 charstrings use.
      return token === "true" ? 1 : 0;
    }

    nextChar() {
      return (this.currentChar = this.stream.getByte());
    }

    getToken() {
      // Eat whitespace and comments.
      let comment = false;
      let ch = this.currentChar;
      while (true) {
        if (ch === -1) {
          return null;
        }

        if (comment) {
          if (ch === 0x0a || ch === 0x0d) {
            comment = false;
          }
        } else if (ch === /* '%' = */ 0x25) {
          comment = true;
        } else if (!isWhiteSpace(ch)) {
          break;
        }
        ch = this.nextChar();
      }
      if (isSpecial(ch)) {
        this.nextChar();
        return String.fromCharCode(ch);
      }
      let token = "";
      do {
        token += String.fromCharCode(ch);
        ch = this.nextChar();
      } while (ch >= 0 && !isWhiteSpace(ch) && !isSpecial(ch));
      return token;
    }

    readCharStrings(bytes, lenIV) {
      if (lenIV === -1) {
        // This isn't in the spec, but Adobe's tx program handles -1
        // as plain text.
        return bytes;
      }
      return decrypt(bytes, CHAR_STRS_ENCRYPT_KEY, lenIV);
    }

    /*
     * Returns an object containing a Subrs array and a CharStrings
     * array extracted from and eexec encrypted block of data
     */
    extractFontProgram(properties) {
      const stream = this.stream;

      const subrs = [],
        charstrings = [];
      const privateData = Object.create(null);
      privateData.lenIV = 4;
      const program = {
        subrs: [],
        charstrings: [],
        properties: {
          privateData,
        },
      };
      let token, length, data, lenIV, encoded;
      while ((token = this.getToken()) !== null) {
        if (token !== "/") {
          continue;
        }
        token = this.getToken();
        switch (token) {
          case "CharStrings":
            // The number immediately following CharStrings must be greater or
            // equal to the number of CharStrings.
            this.getToken();
            this.getToken(); // read in 'dict'
            this.getToken(); // read in 'dup'
            this.getToken(); // read in 'begin'
            while (true) {
              token = this.getToken();
              if (token === null || token === "end") {
                break;
              }

              if (token !== "/") {
                continue;
              }
              const glyph = this.getToken();
              length = this.readInt();
              this.getToken(); // read in 'RD' or '-|'
              data = length > 0 ? stream.getBytes(length) : new Uint8Array(0);
              lenIV = program.properties.privateData.lenIV;
              encoded = this.readCharStrings(data, lenIV);
              this.nextChar();
              token = this.getToken(); // read in 'ND' or '|-'
              if (token === "noaccess") {
                this.getToken(); // read in 'def'
              }
              charstrings.push({
                glyph,
                encoded,
              });
            }
            break;
          case "Subrs":
            this.readInt(); // num
            this.getToken(); // read in 'array'
            while (this.getToken() === "dup") {
              const index = this.readInt();
              length = this.readInt();
              this.getToken(); // read in 'RD' or '-|'
              data = length > 0 ? stream.getBytes(length) : new Uint8Array(0);
              lenIV = program.properties.privateData.lenIV;
              encoded = this.readCharStrings(data, lenIV);
              this.nextChar();
              token = this.getToken(); // read in 'NP' or '|'
              if (token === "noaccess") {
                this.getToken(); // read in 'put'
              }
              subrs[index] = encoded;
            }
            break;
          case "BlueValues":
          case "OtherBlues":
          case "FamilyBlues":
          case "FamilyOtherBlues":
            const blueArray = this.readNumberArray();
            // *Blue* values may contain invalid data: disables reading of
            // those values when hinting is disabled.
            if (
              blueArray.length > 0 &&
              blueArray.length % 2 === 0 &&
              HINTING_ENABLED
            ) {
              program.properties.privateData[token] = blueArray;
            }
            break;
          case "StemSnapH":
          case "StemSnapV":
            program.properties.privateData[token] = this.readNumberArray();
            break;
          case "StdHW":
          case "StdVW":
            program.properties.privateData[token] = this.readNumberArray()[0];
            break;
          case "BlueShift":
          case "lenIV":
          case "BlueFuzz":
          case "BlueScale":
          case "LanguageGroup":
          case "ExpansionFactor":
            program.properties.privateData[token] = this.readNumber();
            break;
          case "ForceBold":
            program.properties.privateData[token] = this.readBoolean();
            break;
        }
      }

      for (let i = 0; i < charstrings.length; i++) {
        const glyph = charstrings[i].glyph;
        encoded = charstrings[i].encoded;
        const charString = new Type1CharString();
        const error = charString.convert(
          encoded,
          subrs,
          this.seacAnalysisEnabled
        );
        let output = charString.output;
        if (error) {
          // It seems when FreeType encounters an error while evaluating a glyph
          // that it completely ignores the glyph so we'll mimic that behaviour
          // here and put an endchar to make the validator happy.
          output = [14];
        }
        const charStringObject = {
          glyphName: glyph,
          charstring: output,
          width: charString.width,
          lsb: charString.lsb,
          seac: charString.seac,
        };
        if (glyph === ".notdef") {
          // Make sure .notdef is at index zero (issue #11477).
          program.charstrings.unshift(charStringObject);
        } else {
          program.charstrings.push(charStringObject);
        }

        // Attempt to replace missing widths, from the font dictionary /Widths
        // entry, with ones from the font data (fixes issue11150_reduced.pdf).
        if (properties.builtInEncoding) {
          const index = properties.builtInEncoding.indexOf(glyph);
          if (
            index > -1 &&
            properties.widths[index] === undefined &&
            index >= properties.firstChar &&
            index <= properties.lastChar
          ) {
            properties.widths[index] = charString.width;
          }
        }
      }

      return program;
    }

    extractFontHeader(properties) {
      let token;
      while ((token = this.getToken()) !== null) {
        if (token !== "/") {
          continue;
        }
        token = this.getToken();
        switch (token) {
          case "FontMatrix":
            const matrix = this.readNumberArray();
            properties.fontMatrix = matrix;
            break;
          case "Encoding":
            const encodingArg = this.getToken();
            let encoding;
            if (!/^\d+$/.test(encodingArg)) {
              // encoding name is specified
              encoding = getEncoding(encodingArg);
            } else {
              encoding = [];
              const size = parseInt(encodingArg, 10) | 0;
              this.getToken(); // read in 'array'

              for (let j = 0; j < size; j++) {
                token = this.getToken();
                // skipping till first dup or def (e.g. ignoring for statement)
                while (token !== "dup" && token !== "def") {
                  token = this.getToken();
                  if (token === null) {
                    return; // invalid header
                  }
                }
                if (token === "def") {
                  break; // read all array data
                }
                const index = this.readInt();
                this.getToken(); // read in '/'
                const glyph = this.getToken();
                encoding[index] = glyph;
                this.getToken(); // read the in 'put'
              }
            }
            properties.builtInEncoding = encoding;
            break;
          case "FontBBox":
            const fontBBox = this.readNumberArray();
            // adjusting ascent/descent
            properties.ascent = Math.max(fontBBox[3], fontBBox[1]);
            properties.descent = Math.min(fontBBox[1], fontBBox[3]);
            properties.ascentScaled = true;
            break;
        }
      }
    }
  }

  return Type1Parser;
})();

export { Type1Parser };
