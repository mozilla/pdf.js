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
exports.Type1Parser = undefined;

var _util = require('../shared/util');

var _encodings = require('./encodings');

var _stream = require('./stream');

var HINTING_ENABLED = false;
var Type1CharString = function Type1CharStringClosure() {
  var COMMAND_MAP = {
    'hstem': [1],
    'vstem': [3],
    'vmoveto': [4],
    'rlineto': [5],
    'hlineto': [6],
    'vlineto': [7],
    'rrcurveto': [8],
    'callsubr': [10],
    'flex': [12, 35],
    'drop': [12, 18],
    'endchar': [14],
    'rmoveto': [21],
    'hmoveto': [22],
    'vhcurveto': [30],
    'hvcurveto': [31]
  };
  function Type1CharString() {
    this.width = 0;
    this.lsb = 0;
    this.flexing = false;
    this.output = [];
    this.stack = [];
  }
  Type1CharString.prototype = {
    convert: function Type1CharString_convert(encoded, subrs, seacAnalysisEnabled) {
      var count = encoded.length;
      var error = false;
      var wx, sbx, subrNumber;
      for (var i = 0; i < count; i++) {
        var value = encoded[i];
        if (value < 32) {
          if (value === 12) {
            value = (value << 8) + encoded[++i];
          }
          switch (value) {
            case 1:
              if (!HINTING_ENABLED) {
                this.stack = [];
                break;
              }
              error = this.executeCommand(2, COMMAND_MAP.hstem);
              break;
            case 3:
              if (!HINTING_ENABLED) {
                this.stack = [];
                break;
              }
              error = this.executeCommand(2, COMMAND_MAP.vstem);
              break;
            case 4:
              if (this.flexing) {
                if (this.stack.length < 1) {
                  error = true;
                  break;
                }
                var dy = this.stack.pop();
                this.stack.push(0, dy);
                break;
              }
              error = this.executeCommand(1, COMMAND_MAP.vmoveto);
              break;
            case 5:
              error = this.executeCommand(2, COMMAND_MAP.rlineto);
              break;
            case 6:
              error = this.executeCommand(1, COMMAND_MAP.hlineto);
              break;
            case 7:
              error = this.executeCommand(1, COMMAND_MAP.vlineto);
              break;
            case 8:
              error = this.executeCommand(6, COMMAND_MAP.rrcurveto);
              break;
            case 9:
              this.stack = [];
              break;
            case 10:
              if (this.stack.length < 1) {
                error = true;
                break;
              }
              subrNumber = this.stack.pop();
              error = this.convert(subrs[subrNumber], subrs, seacAnalysisEnabled);
              break;
            case 11:
              return error;
            case 13:
              if (this.stack.length < 2) {
                error = true;
                break;
              }
              wx = this.stack.pop();
              sbx = this.stack.pop();
              this.lsb = sbx;
              this.width = wx;
              this.stack.push(wx, sbx);
              error = this.executeCommand(2, COMMAND_MAP.hmoveto);
              break;
            case 14:
              this.output.push(COMMAND_MAP.endchar[0]);
              break;
            case 21:
              if (this.flexing) {
                break;
              }
              error = this.executeCommand(2, COMMAND_MAP.rmoveto);
              break;
            case 22:
              if (this.flexing) {
                this.stack.push(0);
                break;
              }
              error = this.executeCommand(1, COMMAND_MAP.hmoveto);
              break;
            case 30:
              error = this.executeCommand(4, COMMAND_MAP.vhcurveto);
              break;
            case 31:
              error = this.executeCommand(4, COMMAND_MAP.hvcurveto);
              break;
            case (12 << 8) + 0:
              this.stack = [];
              break;
            case (12 << 8) + 1:
              if (!HINTING_ENABLED) {
                this.stack = [];
                break;
              }
              error = this.executeCommand(2, COMMAND_MAP.vstem);
              break;
            case (12 << 8) + 2:
              if (!HINTING_ENABLED) {
                this.stack = [];
                break;
              }
              error = this.executeCommand(2, COMMAND_MAP.hstem);
              break;
            case (12 << 8) + 6:
              if (seacAnalysisEnabled) {
                this.seac = this.stack.splice(-4, 4);
                error = this.executeCommand(0, COMMAND_MAP.endchar);
              } else {
                error = this.executeCommand(4, COMMAND_MAP.endchar);
              }
              break;
            case (12 << 8) + 7:
              if (this.stack.length < 4) {
                error = true;
                break;
              }
              this.stack.pop();
              wx = this.stack.pop();
              var sby = this.stack.pop();
              sbx = this.stack.pop();
              this.lsb = sbx;
              this.width = wx;
              this.stack.push(wx, sbx, sby);
              error = this.executeCommand(3, COMMAND_MAP.rmoveto);
              break;
            case (12 << 8) + 12:
              if (this.stack.length < 2) {
                error = true;
                break;
              }
              var num2 = this.stack.pop();
              var num1 = this.stack.pop();
              this.stack.push(num1 / num2);
              break;
            case (12 << 8) + 16:
              if (this.stack.length < 2) {
                error = true;
                break;
              }
              subrNumber = this.stack.pop();
              var numArgs = this.stack.pop();
              if (subrNumber === 0 && numArgs === 3) {
                var flexArgs = this.stack.splice(this.stack.length - 17, 17);
                this.stack.push(flexArgs[2] + flexArgs[0], flexArgs[3] + flexArgs[1], flexArgs[4], flexArgs[5], flexArgs[6], flexArgs[7], flexArgs[8], flexArgs[9], flexArgs[10], flexArgs[11], flexArgs[12], flexArgs[13], flexArgs[14]);
                error = this.executeCommand(13, COMMAND_MAP.flex, true);
                this.flexing = false;
                this.stack.push(flexArgs[15], flexArgs[16]);
              } else if (subrNumber === 1 && numArgs === 0) {
                this.flexing = true;
              }
              break;
            case (12 << 8) + 17:
              break;
            case (12 << 8) + 33:
              this.stack = [];
              break;
            default:
              (0, _util.warn)('Unknown type 1 charstring command of "' + value + '"');
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
          value = (encoded[++i] & 0xff) << 24 | (encoded[++i] & 0xff) << 16 | (encoded[++i] & 0xff) << 8 | (encoded[++i] & 0xff) << 0;
        }
        this.stack.push(value);
      }
      return error;
    },
    executeCommand: function executeCommand(howManyArgs, command, keepStack) {
      var stackLength = this.stack.length;
      if (howManyArgs > stackLength) {
        return true;
      }
      var start = stackLength - howManyArgs;
      for (var i = start; i < stackLength; i++) {
        var value = this.stack[i];
        if (Number.isInteger(value)) {
          this.output.push(28, value >> 8 & 0xff, value & 0xff);
        } else {
          value = 65536 * value | 0;
          this.output.push(255, value >> 24 & 0xFF, value >> 16 & 0xFF, value >> 8 & 0xFF, value & 0xFF);
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
  };
  return Type1CharString;
}();
var Type1Parser = function Type1ParserClosure() {
  var EEXEC_ENCRYPT_KEY = 55665;
  var CHAR_STRS_ENCRYPT_KEY = 4330;
  function isHexDigit(code) {
    return code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102;
  }
  function decrypt(data, key, discardNumber) {
    if (discardNumber >= data.length) {
      return new Uint8Array(0);
    }
    var r = key | 0,
        c1 = 52845,
        c2 = 22719,
        i,
        j;
    for (i = 0; i < discardNumber; i++) {
      r = (data[i] + r) * c1 + c2 & (1 << 16) - 1;
    }
    var count = data.length - discardNumber;
    var decrypted = new Uint8Array(count);
    for (i = discardNumber, j = 0; j < count; i++, j++) {
      var value = data[i];
      decrypted[j] = value ^ r >> 8;
      r = (value + r) * c1 + c2 & (1 << 16) - 1;
    }
    return decrypted;
  }
  function decryptAscii(data, key, discardNumber) {
    var r = key | 0,
        c1 = 52845,
        c2 = 22719;
    var count = data.length,
        maybeLength = count >>> 1;
    var decrypted = new Uint8Array(maybeLength);
    var i, j;
    for (i = 0, j = 0; i < count; i++) {
      var digit1 = data[i];
      if (!isHexDigit(digit1)) {
        continue;
      }
      i++;
      var digit2;
      while (i < count && !isHexDigit(digit2 = data[i])) {
        i++;
      }
      if (i < count) {
        var value = parseInt(String.fromCharCode(digit1, digit2), 16);
        decrypted[j++] = value ^ r >> 8;
        r = (value + r) * c1 + c2 & (1 << 16) - 1;
      }
    }
    return Array.prototype.slice.call(decrypted, discardNumber, j);
  }
  function isSpecial(c) {
    return c === 0x2F || c === 0x5B || c === 0x5D || c === 0x7B || c === 0x7D || c === 0x28 || c === 0x29;
  }
  function Type1Parser(stream, encrypted, seacAnalysisEnabled) {
    if (encrypted) {
      var data = stream.getBytes();
      var isBinary = !(isHexDigit(data[0]) && isHexDigit(data[1]) && isHexDigit(data[2]) && isHexDigit(data[3]));
      stream = new _stream.Stream(isBinary ? decrypt(data, EEXEC_ENCRYPT_KEY, 4) : decryptAscii(data, EEXEC_ENCRYPT_KEY, 4));
    }
    this.seacAnalysisEnabled = !!seacAnalysisEnabled;
    this.stream = stream;
    this.nextChar();
  }
  Type1Parser.prototype = {
    readNumberArray: function Type1Parser_readNumberArray() {
      this.getToken();
      var array = [];
      while (true) {
        var token = this.getToken();
        if (token === null || token === ']' || token === '}') {
          break;
        }
        array.push(parseFloat(token || 0));
      }
      return array;
    },
    readNumber: function Type1Parser_readNumber() {
      var token = this.getToken();
      return parseFloat(token || 0);
    },
    readInt: function Type1Parser_readInt() {
      var token = this.getToken();
      return parseInt(token || 0, 10) | 0;
    },
    readBoolean: function Type1Parser_readBoolean() {
      var token = this.getToken();
      return token === 'true' ? 1 : 0;
    },
    nextChar: function Type1_nextChar() {
      return this.currentChar = this.stream.getByte();
    },
    getToken: function Type1Parser_getToken() {
      var comment = false;
      var ch = this.currentChar;
      while (true) {
        if (ch === -1) {
          return null;
        }
        if (comment) {
          if (ch === 0x0A || ch === 0x0D) {
            comment = false;
          }
        } else if (ch === 0x25) {
          comment = true;
        } else if (!(0, _util.isSpace)(ch)) {
          break;
        }
        ch = this.nextChar();
      }
      if (isSpecial(ch)) {
        this.nextChar();
        return String.fromCharCode(ch);
      }
      var token = '';
      do {
        token += String.fromCharCode(ch);
        ch = this.nextChar();
      } while (ch >= 0 && !(0, _util.isSpace)(ch) && !isSpecial(ch));
      return token;
    },
    extractFontProgram: function Type1Parser_extractFontProgram() {
      var stream = this.stream;
      var subrs = [],
          charstrings = [];
      var privateData = Object.create(null);
      privateData['lenIV'] = 4;
      var program = {
        subrs: [],
        charstrings: [],
        properties: { 'privateData': privateData }
      };
      var token, length, data, lenIV, encoded;
      while ((token = this.getToken()) !== null) {
        if (token !== '/') {
          continue;
        }
        token = this.getToken();
        switch (token) {
          case 'CharStrings':
            this.getToken();
            this.getToken();
            this.getToken();
            this.getToken();
            while (true) {
              token = this.getToken();
              if (token === null || token === 'end') {
                break;
              }
              if (token !== '/') {
                continue;
              }
              var glyph = this.getToken();
              length = this.readInt();
              this.getToken();
              data = stream.makeSubStream(stream.pos, length);
              lenIV = program.properties.privateData['lenIV'];
              encoded = decrypt(data.getBytes(), CHAR_STRS_ENCRYPT_KEY, lenIV);
              stream.skip(length);
              this.nextChar();
              token = this.getToken();
              if (token === 'noaccess') {
                this.getToken();
              }
              charstrings.push({
                glyph: glyph,
                encoded: encoded
              });
            }
            break;
          case 'Subrs':
            this.readInt();
            this.getToken();
            while ((token = this.getToken()) === 'dup') {
              var index = this.readInt();
              length = this.readInt();
              this.getToken();
              data = stream.makeSubStream(stream.pos, length);
              lenIV = program.properties.privateData['lenIV'];
              encoded = decrypt(data.getBytes(), CHAR_STRS_ENCRYPT_KEY, lenIV);
              stream.skip(length);
              this.nextChar();
              token = this.getToken();
              if (token === 'noaccess') {
                this.getToken();
              }
              subrs[index] = encoded;
            }
            break;
          case 'BlueValues':
          case 'OtherBlues':
          case 'FamilyBlues':
          case 'FamilyOtherBlues':
            var blueArray = this.readNumberArray();
            if (blueArray.length > 0 && blueArray.length % 2 === 0 && HINTING_ENABLED) {
              program.properties.privateData[token] = blueArray;
            }
            break;
          case 'StemSnapH':
          case 'StemSnapV':
            program.properties.privateData[token] = this.readNumberArray();
            break;
          case 'StdHW':
          case 'StdVW':
            program.properties.privateData[token] = this.readNumberArray()[0];
            break;
          case 'BlueShift':
          case 'lenIV':
          case 'BlueFuzz':
          case 'BlueScale':
          case 'LanguageGroup':
          case 'ExpansionFactor':
            program.properties.privateData[token] = this.readNumber();
            break;
          case 'ForceBold':
            program.properties.privateData[token] = this.readBoolean();
            break;
        }
      }
      for (var i = 0; i < charstrings.length; i++) {
        glyph = charstrings[i].glyph;
        encoded = charstrings[i].encoded;
        var charString = new Type1CharString();
        var error = charString.convert(encoded, subrs, this.seacAnalysisEnabled);
        var output = charString.output;
        if (error) {
          output = [14];
        }
        program.charstrings.push({
          glyphName: glyph,
          charstring: output,
          width: charString.width,
          lsb: charString.lsb,
          seac: charString.seac
        });
      }
      return program;
    },
    extractFontHeader: function Type1Parser_extractFontHeader(properties) {
      var token;
      while ((token = this.getToken()) !== null) {
        if (token !== '/') {
          continue;
        }
        token = this.getToken();
        switch (token) {
          case 'FontMatrix':
            var matrix = this.readNumberArray();
            properties.fontMatrix = matrix;
            break;
          case 'Encoding':
            var encodingArg = this.getToken();
            var encoding;
            if (!/^\d+$/.test(encodingArg)) {
              encoding = (0, _encodings.getEncoding)(encodingArg);
            } else {
              encoding = [];
              var size = parseInt(encodingArg, 10) | 0;
              this.getToken();
              for (var j = 0; j < size; j++) {
                token = this.getToken();
                while (token !== 'dup' && token !== 'def') {
                  token = this.getToken();
                  if (token === null) {
                    return;
                  }
                }
                if (token === 'def') {
                  break;
                }
                var index = this.readInt();
                this.getToken();
                var glyph = this.getToken();
                encoding[index] = glyph;
                this.getToken();
              }
            }
            properties.builtInEncoding = encoding;
            break;
          case 'FontBBox':
            var fontBBox = this.readNumberArray();
            properties.ascent = Math.max(fontBBox[3], fontBBox[1]);
            properties.descent = Math.min(fontBBox[1], fontBBox[3]);
            properties.ascentScaled = true;
            break;
        }
      }
    }
  };
  return Type1Parser;
}();
exports.Type1Parser = Type1Parser;