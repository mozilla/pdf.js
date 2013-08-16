/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
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
/* globals Ascii85Stream, AsciiHexStream, CCITTFaxStream, Cmd, Dict, error,
           FlateStream, isArray, isCmd, isDict, isInt, isName, isNum, isRef,
           isString, Jbig2Stream, JpegStream, JpxStream, LZWStream, Name,
           NullStream, PredictorStream, Ref, RunLengthStream, warn, info */

'use strict';

var EOF = {};

function isEOF(v) {
  return v == EOF;
}

var Parser = (function ParserClosure() {
  function Parser(lexer, allowStreams, xref) {
    this.lexer = lexer;
    this.allowStreams = allowStreams;
    this.xref = xref;
    this.refill();
  }

  Parser.prototype = {
    saveState: function Parser_saveState() {
      this.state = {
        buf1: this.buf1,
        buf2: this.buf2,
        streamPos: this.lexer.stream.pos
      };
    },

    restoreState: function Parser_restoreState() {
      var state = this.state;
      this.buf1 = state.buf1;
      this.buf2 = state.buf2;
      this.lexer.stream.pos = state.streamPos;
    },

    refill: function Parser_refill() {
      this.buf1 = this.lexer.getObj();
      this.buf2 = this.lexer.getObj();
    },
    shift: function Parser_shift() {
      if (isCmd(this.buf2, 'ID')) {
        this.buf1 = this.buf2;
        this.buf2 = null;
      } else {
        this.buf1 = this.buf2;
        this.buf2 = this.lexer.getObj();
      }
    },
    getObj: function Parser_getObj(cipherTransform) {
      if (isCmd(this.buf1, 'BI')) { // inline image
        this.shift();
        return this.makeInlineImage(cipherTransform);
      }
      if (isCmd(this.buf1, '[')) { // array
        this.shift();
        var array = [];
        while (!isCmd(this.buf1, ']') && !isEOF(this.buf1))
          array.push(this.getObj(cipherTransform));
        if (isEOF(this.buf1))
          error('End of file inside array');
        this.shift();
        return array;
      }
      if (isCmd(this.buf1, '<<')) { // dictionary or stream
        this.shift();
        var dict = new Dict(this.xref);
        while (!isCmd(this.buf1, '>>') && !isEOF(this.buf1)) {
          if (!isName(this.buf1)) {
            info('Malformed dictionary, key must be a name object');
            this.shift();
            continue;
          }

          var key = this.buf1.name;
          this.shift();
          if (isEOF(this.buf1))
            break;
          dict.set(key, this.getObj(cipherTransform));
        }
        if (isEOF(this.buf1))
          error('End of file inside dictionary');

        // stream objects are not allowed inside content streams or
        // object streams
        if (isCmd(this.buf2, 'stream')) {
          return this.allowStreams ?
            this.makeStream(dict, cipherTransform) : dict;
        }
        this.shift();
        return dict;
      }
      if (isInt(this.buf1)) { // indirect reference or integer
        var num = this.buf1;
        this.shift();
        if (isInt(this.buf1) && isCmd(this.buf2, 'R')) {
          var ref = new Ref(num, this.buf1);
          this.shift();
          this.shift();
          return ref;
        }
        return num;
      }
      if (isString(this.buf1)) { // string
        var str = this.buf1;
        this.shift();
        if (cipherTransform)
          str = cipherTransform.decryptString(str);
        return str;
      }

      // simple object
      var obj = this.buf1;
      this.shift();
      return obj;
    },
    makeInlineImage: function Parser_makeInlineImage(cipherTransform) {
      var lexer = this.lexer;
      var stream = lexer.stream;

      // parse dictionary
      var dict = new Dict();
      while (!isCmd(this.buf1, 'ID') && !isEOF(this.buf1)) {
        if (!isName(this.buf1))
          error('Dictionary key must be a name object');

        var key = this.buf1.name;
        this.shift();
        if (isEOF(this.buf1))
          break;
        dict.set(key, this.getObj(cipherTransform));
      }

      // parse image stream
      var startPos = stream.pos;

      // searching for the /EI\s/
      var state = 0, ch, i, ii;
      while (state != 4 && (ch = stream.getByte()) !== -1) {
        switch (ch | 0) {
          case 0x20:
          case 0x0D:
          case 0x0A:
            // let's check next five bytes to be ASCII... just be sure
            var followingBytes = stream.peekBytes(5);
            for (i = 0, ii = followingBytes.length; i < ii; i++) {
              ch = followingBytes[i];
              if (ch !== 0x0A && ch !== 0x0D && (ch < 0x20 || ch > 0x7F)) {
                // not a LF, CR, SPACE or any visible ASCII character
                state = 0;
                break; // some binary stuff found, resetting the state
              }
            }
            state = state === 3 ? 4 : 0;
            break;
          case 0x45:
            state = 2;
            break;
          case 0x49:
            state = state === 2 ? 3 : 0;
            break;
          default:
            state = 0;
            break;
        }
      }

      var length = (stream.pos - 4) - startPos;
      var imageStream = stream.makeSubStream(startPos, length, dict);
      if (cipherTransform)
        imageStream = cipherTransform.createStream(imageStream);
      imageStream = this.filter(imageStream, dict, length);
      imageStream.dict = dict;

      this.buf2 = Cmd.get('EI');
      this.shift();

      return imageStream;
    },
    fetchIfRef: function Parser_fetchIfRef(obj) {
      // not relying on the xref.fetchIfRef -- xref might not be set
      return isRef(obj) ? this.xref.fetch(obj) : obj;
    },
    makeStream: function Parser_makeStream(dict, cipherTransform) {
      var lexer = this.lexer;
      var stream = lexer.stream;

      // get stream start position
      lexer.skipToNextLine();
      var pos = stream.pos - 1;

      // get length
      var length = this.fetchIfRef(dict.get('Length'));
      if (!isInt(length)) {
        info('Bad ' + length + ' attribute in stream');
        length = 0;
      }

      // skip over the stream data
      stream.pos = pos + length;
      lexer.nextChar();

      this.shift(); // '>>'
      this.shift(); // 'stream'
      if (!isCmd(this.buf1, 'endstream')) {
        // bad stream length, scanning for endstream
        stream.pos = pos;
        var SCAN_BLOCK_SIZE = 2048;
        var ENDSTREAM_SIGNATURE_LENGTH = 9;
        var ENDSTREAM_SIGNATURE = [0x65, 0x6E, 0x64, 0x73, 0x74, 0x72, 0x65,
                                   0x61, 0x6D];
        var skipped = 0, found = false;
        while (stream.pos < stream.end) {
          var scanBytes = stream.peekBytes(SCAN_BLOCK_SIZE);
          var scanLength = scanBytes.length - ENDSTREAM_SIGNATURE_LENGTH;
          var found = false, i, ii, j;
          for (i = 0, j = 0; i < scanLength; i++) {
            var b = scanBytes[i];
            if (b !== ENDSTREAM_SIGNATURE[j]) {
              i -= j;
              j = 0;
            } else {
              j++;
              if (j >= ENDSTREAM_SIGNATURE_LENGTH) {
                found = true;
                break;
              }
            }
          }
          if (found) {
            skipped += i - ENDSTREAM_SIGNATURE_LENGTH;
            stream.pos += i - ENDSTREAM_SIGNATURE_LENGTH;
            break;
          }
          skipped += scanLength;
          stream.pos += scanLength;
        }
        if (!found) {
          error('Missing endstream');
        }
        length = skipped;

        lexer.nextChar();
        this.shift();
        this.shift();
      }
      this.shift(); // 'endstream'

      stream = stream.makeSubStream(pos, length, dict);
      if (cipherTransform)
        stream = cipherTransform.createStream(stream);
      stream = this.filter(stream, dict, length);
      stream.dict = dict;
      return stream;
    },
    filter: function Parser_filter(stream, dict, length) {
      var filter = this.fetchIfRef(dict.get('Filter', 'F'));
      var params = this.fetchIfRef(dict.get('DecodeParms', 'DP'));
      if (isName(filter))
        return this.makeFilter(stream, filter.name, length, params);
      if (isArray(filter)) {
        var filterArray = filter;
        var paramsArray = params;
        for (var i = 0, ii = filterArray.length; i < ii; ++i) {
          filter = filterArray[i];
          if (!isName(filter))
            error('Bad filter name: ' + filter);

          params = null;
          if (isArray(paramsArray) && (i in paramsArray))
            params = paramsArray[i];
          stream = this.makeFilter(stream, filter.name, length, params);
          // after the first stream the length variable is invalid
          length = null;
        }
      }
      return stream;
    },
    makeFilter: function Parser_makeFilter(stream, name, length, params) {
      if (stream.dict.get('Length') === 0) {
        return new NullStream(stream);
      }
      if (name == 'FlateDecode' || name == 'Fl') {
        if (params) {
          return new PredictorStream(new FlateStream(stream), params);
        }
        return new FlateStream(stream);
      }
      if (name == 'LZWDecode' || name == 'LZW') {
        var earlyChange = 1;
        if (params) {
          if (params.has('EarlyChange'))
            earlyChange = params.get('EarlyChange');
          return new PredictorStream(
            new LZWStream(stream, earlyChange), params);
        }
        return new LZWStream(stream, earlyChange);
      }
      if (name == 'DCTDecode' || name == 'DCT') {
        var bytes = stream.getBytes(length);
        return new JpegStream(bytes, stream.dict, this.xref);
      }
      if (name == 'JPXDecode' || name == 'JPX') {
        var bytes = stream.getBytes(length);
        return new JpxStream(bytes, stream.dict);
      }
      if (name == 'ASCII85Decode' || name == 'A85') {
        return new Ascii85Stream(stream);
      }
      if (name == 'ASCIIHexDecode' || name == 'AHx') {
        return new AsciiHexStream(stream);
      }
      if (name == 'CCITTFaxDecode' || name == 'CCF') {
        return new CCITTFaxStream(stream, params);
      }
      if (name == 'RunLengthDecode' || name == 'RL') {
        return new RunLengthStream(stream);
      }
      if (name == 'JBIG2Decode') {
        var bytes = stream.getBytes(length);
        return new Jbig2Stream(bytes, stream.dict);
      }
      warn('filter "' + name + '" not supported yet');
      return stream;
    }
  };

  return Parser;
})();

var Lexer = (function LexerClosure() {
  function Lexer(stream, knownCommands) {
    this.stream = stream;
    this.nextChar();

    // The PDFs might have "glued" commands with other commands, operands or
    // literals, e.g. "q1". The knownCommands is a dictionary of the valid
    // commands and their prefixes. The prefixes are built the following way:
    // if there a command that is a prefix of the other valid command or
    // literal (e.g. 'f' and 'false') the following prefixes must be included,
    // 'fa', 'fal', 'fals'. The prefixes are not needed, if the command has no
    // other commands or literals as a prefix. The knowCommands is optional.
    this.knownCommands = knownCommands;
  }

  Lexer.isSpace = function Lexer_isSpace(ch) {
    // space is one of the following characters: SPACE, TAB, CR, or LF
    return ch === 0x20 || ch === 0x09 || ch === 0x0D || ch === 0x0A;
  };

  // A '1' in this array means the character is white space.  A '1' or
  // '2' means the character ends a name or command.
  var specialChars = [
    1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0,   // 0x
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // 1x
    1, 0, 0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 0, 0, 0, 2,   // 2x
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0,   // 3x
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // 4x
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0,   // 5x
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // 6x
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0,   // 7x
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // 8x
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // 9x
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // ax
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // bx
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // cx
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // dx
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,   // ex
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0    // fx
  ];

  function toHexDigit(ch) {
    if (ch >= 0x30 && ch <= 0x39) { // '0'-'9'
      return ch & 0x0F;
    }
    if ((ch >= 0x41 && ch <= 0x46) || (ch >= 0x61 && ch <= 0x66)) {
      // 'A'-'F', 'a'-'f'
      return (ch & 0x0F) + 9;
    }
    return -1;
  }

  Lexer.prototype = {
    nextChar: function Lexer_nextChar() {
      return (this.currentChar = this.stream.getByte());
    },
    getNumber: function Lexer_getNumber() {
      var floating = false;
      var ch = this.currentChar;
      var str = String.fromCharCode(ch);
      while ((ch = this.nextChar()) >= 0) {
        if (ch === 0x2E && !floating) { // '.'
          str += '.';
          floating = true;
        } else if (ch === 0x2D) { // '-'
          // ignore minus signs in the middle of numbers to match
          // Adobe's behavior
          warn('Badly formated number');
        } else if (ch >= 0x30 && ch <= 0x39) { // '0'-'9'
          str += String.fromCharCode(ch);
        } else if (ch === 0x45 || ch === 0x65) { // 'E', 'e'
          floating = true;
        } else {
          // the last character doesn't belong to us
          break;
        }
      }
      var value = parseFloat(str);
      if (isNaN(value))
        error('Invalid floating point number: ' + value);
      return value;
    },
    getString: function Lexer_getString() {
      var numParen = 1;
      var done = false;
      var str = '';

      var ch = this.nextChar();
      while (true) {
        var charBuffered = false;
        switch (ch | 0) {
          case -1:
            warn('Unterminated string');
            done = true;
            break;
          case 0x28: // '('
            ++numParen;
            str += '(';
            break;
          case 0x29: // ')'
            if (--numParen === 0) {
              this.nextChar(); // consume strings ')'
              done = true;
            } else {
              str += ')';
            }
            break;
          case 0x5C: // '\\'
            ch = this.nextChar();
            switch (ch) {
              case -1:
                warn('Unterminated string');
                done = true;
                break;
              case 0x6E: // 'n'
                str += '\n';
                break;
              case 0x72: // 'r'
                str += '\r';
                break;
              case 0x74: // 't'
                str += '\t';
                break;
              case 0x62: // 'b'
                str += '\b';
                break;
              case 0x66: // 'f'
                str += '\f';
                break;
              case 0x5C: // '\'
              case 0x28: // '('
              case 0x29: // ')'
                str += String.fromCharCode(ch);
                break;
              case 0x30: case 0x31: case 0x32: case 0x33: // '0'-'3'
              case 0x34: case 0x35: case 0x36: case 0x37: // '4'-'7'
                var x = ch & 0x0F;
                ch = this.nextChar();
                charBuffered = true;
                if (ch >= 0x30 && ch <= 0x37) { // '0'-'7'
                  x = (x << 3) + (ch & 0x0F);
                  ch = this.nextChar();
                  if (ch >= 0x30 && ch <= 0x37) {  // '0'-'7'
                    charBuffered = false;
                    x = (x << 3) + (ch & 0x0F);
                  }
                }

                str += String.fromCharCode(x);
                break;
              case 0x0A: case 0x0D: // LF, CR
                break;
              default:
                str += String.fromCharCode(ch);
                break;
            }
            break;
          default:
            str += String.fromCharCode(ch);
            break;
        }
        if (done) {
          break;
        }
        if (!charBuffered) {
          ch = this.nextChar();
        }
      }
      return str;
    },
    getName: function Lexer_getName() {
      var str = '', ch;
      while ((ch = this.nextChar()) >= 0 && !specialChars[ch]) {
        if (ch === 0x23) { // '#'
          ch = this.nextChar();
          var x = toHexDigit(ch);
          if (x != -1) {
            var x2 = toHexDigit(this.nextChar());
            if (x2 == -1)
              error('Illegal digit in hex char in name: ' + x2);
            str += String.fromCharCode((x << 4) | x2);
          } else {
            str += '#';
            str += String.fromCharCode(ch);
          }
        } else {
          str += String.fromCharCode(ch);
        }
      }
      if (str.length > 128) {
        error('Warning: name token is longer than allowed by the spec: ' +
              str.length);
      }
      return new Name(str);
    },
    getHexString: function Lexer_getHexString() {
      var str = '';
      var ch = this.currentChar;
      var isFirstHex = true;
      var firstDigit;
      var secondDigit;
      while (true) {
        if (ch < 0) {
          warn('Unterminated hex string');
          break;
        } else if (ch === 0x3E) { // '>'
          this.nextChar();
          break;
        } else if (specialChars[ch] === 1) {
          ch = this.nextChar();
          continue;
        } else {
          if (isFirstHex) {
            firstDigit = toHexDigit(ch);
            if (firstDigit === -1) {
              warn('Ignoring invalid character "' + ch + '" in hex string');
              ch = this.nextChar();
              continue;
            }
          } else {
            secondDigit = toHexDigit(ch);
            if (secondDigit === -1) {
              warn('Ignoring invalid character "' + ch + '" in hex string');
              ch = this.nextChar();
              continue;
            }
            str += String.fromCharCode((firstDigit << 4) | secondDigit);
          }
          isFirstHex = !isFirstHex;
          ch = this.nextChar();
        }
      }
      return str;
    },
    getObj: function Lexer_getObj() {
      // skip whitespace and comments
      var comment = false;
      var ch = this.currentChar;
      while (true) {
        if (ch < 0) {
          return EOF;
        }
        if (comment) {
          if (ch === 0x0A || ch == 0x0D) // LF, CR
            comment = false;
        } else if (ch === 0x25) { // '%'
          comment = true;
        } else if (specialChars[ch] !== 1) {
          break;
        }
        ch = this.nextChar();
      }

      // start reading token
      switch (ch | 0) {
        case 0x30: case 0x31: case 0x32: case 0x33: case 0x34: // '0'-'4'
        case 0x35: case 0x36: case 0x37: case 0x38: case 0x39: // '5'-'9'
        case 0x2B: case 0x2D: case 0x2E: // '+', '-', '.'
          return this.getNumber();
        case 0x28: // '('
          return this.getString();
        case 0x2F: // '/'
          return this.getName();
        // array punctuation
        case 0x5B: // '['
          this.nextChar();
          return Cmd.get('[');
        case 0x5D: // ']'
          this.nextChar();
          return Cmd.get(']');
        // hex string or dict punctuation
        case 0x3C: // '<'
          ch = this.nextChar();
          if (ch === 0x3C) {
            // dict punctuation
            this.nextChar();
            return Cmd.get('<<');
          }
          return this.getHexString();
        // dict punctuation
        case 0x3E: // '>'
          ch = this.nextChar();
          if (ch === 0x3E) {
            this.nextChar();
            return Cmd.get('>>');
          }
          return Cmd.get('>');
        case 0x7B: // '{'
          this.nextChar();
          return Cmd.get('{');
        case 0x7D: // '}'
          this.nextChar();
          return Cmd.get('}');
        case 0x29: // ')'
          error('Illegal character: ' + ch);
          break;
      }

      // command
      var str = String.fromCharCode(ch);
      var knownCommands = this.knownCommands;
      var knownCommandFound = knownCommands && (str in knownCommands);
      while ((ch = this.nextChar()) >= 0 && !specialChars[ch]) {
        // stop if known command is found and next character does not make
        // the str a command
        var possibleCommand = str + String.fromCharCode(ch);
        if (knownCommandFound && !(possibleCommand in knownCommands)) {
          break;
        }
        if (str.length == 128)
          error('Command token too long: ' + str.length);
        str = possibleCommand;
        knownCommandFound = knownCommands && (str in knownCommands);
      }
      if (str == 'true')
        return true;
      if (str == 'false')
        return false;
      if (str == 'null')
        return null;
      return Cmd.get(str);
    },
    skipToNextLine: function Lexer_skipToNextLine() {
      var stream = this.stream;
      var ch = this.currentChar;
      while (ch >= 0) {
        if (ch === 0x0D) { // CR
          ch = this.nextChar();
          if (ch === 0x0A) { // LF
            this.nextChar();
          }
          break;
        } else if (ch === 0x0A) { // LF
          this.nextChar();
          break;
        }
        ch = this.nextChar();
      }
    }
  };

  return Lexer;
})();

var Linearization = (function LinearizationClosure() {
  function Linearization(stream) {
    this.parser = new Parser(new Lexer(stream), false, null);
    var obj1 = this.parser.getObj();
    var obj2 = this.parser.getObj();
    var obj3 = this.parser.getObj();
    this.linDict = this.parser.getObj();
    if (isInt(obj1) && isInt(obj2) && isCmd(obj3, 'obj') &&
        isDict(this.linDict)) {
      var obj = this.linDict.get('Linearized');
      if (!(isNum(obj) && obj > 0))
        this.linDict = null;
    }
  }

  Linearization.prototype = {
    getInt: function Linearization_getInt(name) {
      var linDict = this.linDict;
      var obj;
      if (isDict(linDict) &&
          isInt(obj = linDict.get(name)) &&
          obj > 0) {
        return obj;
      }
      error('"' + name + '" field in linearization table is invalid');
    },
    getHint: function Linearization_getHint(index) {
      var linDict = this.linDict;
      var obj1, obj2;
      if (isDict(linDict) &&
          isArray(obj1 = linDict.get('H')) &&
          obj1.length >= 2 &&
          isInt(obj2 = obj1[index]) &&
          obj2 > 0) {
        return obj2;
      }
      error('Hints table in linearization table is invalid: ' + index);
    },
    get length() {
      if (!isDict(this.linDict))
        return 0;
      return this.getInt('L');
    },
    get hintsOffset() {
      return this.getHint(0);
    },
    get hintsLength() {
      return this.getHint(1);
    },
    get hintsOffset2() {
      return this.getHint(2);
    },
    get hintsLenth2() {
      return this.getHint(3);
    },
    get objectNumberFirst() {
      return this.getInt('O');
    },
    get endFirst() {
      return this.getInt('E');
    },
    get numPages() {
      return this.getInt('N');
    },
    get mainXRefEntriesOffset() {
      return this.getInt('T');
    },
    get pageFirst() {
      return this.getInt('P');
    }
  };

  return Linearization;
})();

