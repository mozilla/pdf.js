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
    refill: function Parser_refill() {
      this.buf1 = this.lexer.getObj();
      this.buf2 = this.lexer.getObj();
    },
    shift: function Parser_shift() {
      if (isCmd(this.buf2, 'ID')) {
        this.buf1 = this.buf2;
        this.buf2 = null;
        // skip byte after ID
        this.lexer.skip();
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
          array.push(this.getObj());
        if (isEOF(this.buf1))
          error('End of file inside array');
        this.shift();
        return array;
      }
      if (isCmd(this.buf1, '<<')) { // dictionary or stream
        this.shift();
        var dict = new Dict(this.xref);
        while (!isCmd(this.buf1, '>>') && !isEOF(this.buf1)) {
          if (!isName(this.buf1))
            error('Dictionary key must be a name object');

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
      var state = 0, ch;
      while (state != 4 && (ch = stream.getByte()) != null) {
        switch (ch) {
          case 0x20:
          case 0x0D:
          case 0x0A:
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
      imageStream.parameters = dict;

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
      var pos = stream.pos;

      // get length
      var length = this.fetchIfRef(dict.get('Length'));
      if (!isInt(length))
        error('Bad ' + length + ' attribute in stream');

      // skip over the stream data
      stream.pos = pos + length;
      this.shift(); // '>>'
      this.shift(); // 'stream'
      if (!isCmd(this.buf1, 'endstream'))
        error('Missing endstream');
      this.shift();

      stream = stream.makeSubStream(pos, length, dict);
      if (cipherTransform)
        stream = cipherTransform.createStream(stream);
      stream = this.filter(stream, dict, length);
      stream.parameters = dict;
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
    return ch == ' ' || ch == '\t' || ch == '\x0d' || ch == '\x0a';
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
    if (ch >= '0' && ch <= '9')
      return ch.charCodeAt(0) - 48;
    ch = ch.toUpperCase();
    if (ch >= 'A' && ch <= 'F')
      return ch.charCodeAt(0) - 55;
    return -1;
  }

  Lexer.prototype = {
    getNumber: function Lexer_getNumber(ch) {
      var floating = false;
      var str = ch;
      var stream = this.stream;
      while ((ch = stream.lookChar())) {
        if (ch == '.' && !floating) {
          str += ch;
          floating = true;
        } else if (ch == '-') {
          // ignore minus signs in the middle of numbers to match
          // Adobe's behavior
          warn('Badly formated number');
        } else if (ch >= '0' && ch <= '9') {
          str += ch;
        } else if (ch == 'e' || ch == 'E') {
          floating = true;
        } else {
          // the last character doesn't belong to us
          break;
        }
        stream.skip();
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
      var stream = this.stream;
      var ch;
      do {
        ch = stream.getChar();
        switch (ch) {
          case undefined:
            warn('Unterminated string');
            done = true;
            break;
          case '(':
            ++numParen;
            str += ch;
            break;
          case ')':
            if (--numParen == 0) {
              done = true;
            } else {
              str += ch;
            }
            break;
          case '\\':
            ch = stream.getChar();
            switch (ch) {
              case undefined:
                warn('Unterminated string');
                done = true;
                break;
              case 'n':
                str += '\n';
                break;
              case 'r':
                str += '\r';
                break;
              case 't':
                str += '\t';
                break;
              case 'b':
                str += '\b';
                break;
              case 'f':
                str += '\f';
                break;
              case '\\':
              case '(':
              case ')':
                str += ch;
                break;
              case '0': case '1': case '2': case '3':
              case '4': case '5': case '6': case '7':
                var x = ch - '0';
                ch = stream.lookChar();
                if (ch >= '0' && ch <= '7') {
                  stream.skip();
                  x = (x << 3) + (ch - '0');
                  ch = stream.lookChar();
                  if (ch >= '0' && ch <= '7') {
                    stream.skip();
                    x = (x << 3) + (ch - '0');
                  }
                }

                str += String.fromCharCode(x);
                break;
              case '\r':
                ch = stream.lookChar();
                if (ch == '\n')
                  stream.skip();
                break;
              case '\n':
                break;
              default:
                str += ch;
            }
            break;
          default:
            str += ch;
        }
      } while (!done);
      return str;
    },
    getName: function Lexer_getName(ch) {
      var str = '';
      var stream = this.stream;
      while (!!(ch = stream.lookChar()) && !specialChars[ch.charCodeAt(0)]) {
        stream.skip();
        if (ch == '#') {
          ch = stream.lookChar();
          var x = toHexDigit(ch);
          if (x != -1) {
            stream.skip();
            var x2 = toHexDigit(stream.getChar());
            if (x2 == -1)
              error('Illegal digit in hex char in name: ' + x2);
            str += String.fromCharCode((x << 4) | x2);
          } else {
            str += '#';
            str += ch;
          }
        } else {
          str += ch;
        }
      }
      if (str.length > 128)
        error('Warning: name token is longer than allowed by the spec: ' +
              str.length);
      return new Name(str);
    },
    getHexString: function Lexer_getHexString(ch) {
      var str = '';
      var stream = this.stream;
      for (;;) {
        ch = stream.getChar();
        if (ch == '>') {
          break;
        }
        if (!ch) {
          warn('Unterminated hex string');
          break;
        }
        if (specialChars[ch.charCodeAt(0)] != 1) {
          var x, x2;
          if ((x = toHexDigit(ch)) == -1)
            error('Illegal character in hex string: ' + ch);

          ch = stream.getChar();
          while (specialChars[ch.charCodeAt(0)] == 1)
            ch = stream.getChar();

          if ((x2 = toHexDigit(ch)) == -1)
            error('Illegal character in hex string: ' + ch);

          str += String.fromCharCode((x << 4) | x2);
        }
      }
      return str;
    },
    getObj: function Lexer_getObj() {
      // skip whitespace and comments
      var comment = false;
      var stream = this.stream;
      var ch;
      while (true) {
        if (!(ch = stream.getChar()))
          return EOF;
        if (comment) {
          if (ch == '\r' || ch == '\n')
            comment = false;
        } else if (ch == '%') {
          comment = true;
        } else if (specialChars[ch.charCodeAt(0)] != 1) {
          break;
        }
      }

      // start reading token
      switch (ch) {
        case '0': case '1': case '2': case '3': case '4':
        case '5': case '6': case '7': case '8': case '9':
        case '+': case '-': case '.':
          return this.getNumber(ch);
        case '(':
          return this.getString();
        case '/':
          return this.getName(ch);
        // array punctuation
        case '[':
        case ']':
          return Cmd.get(ch);
        // hex string or dict punctuation
        case '<':
          ch = stream.lookChar();
          if (ch == '<') {
            // dict punctuation
            stream.skip();
            return Cmd.get('<<');
          }
          return this.getHexString(ch);
        // dict punctuation
        case '>':
          ch = stream.lookChar();
          if (ch == '>') {
            stream.skip();
            return Cmd.get('>>');
          }
        case '{':
        case '}':
          return Cmd.get(ch);
        // fall through
        case ')':
          error('Illegal character: ' + ch);
      }

      // command
      var str = ch;
      var knownCommands = this.knownCommands;
      var knownCommandFound = knownCommands && (str in knownCommands);
      while (!!(ch = stream.lookChar()) && !specialChars[ch.charCodeAt(0)]) {
        // stop if known command is found and next character does not make
        // the str a command
        if (knownCommandFound && !((str + ch) in knownCommands))
          break;
        stream.skip();
        if (str.length == 128)
          error('Command token too long: ' + str.length);
        str += ch;
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
      while (true) {
        var ch = stream.getChar();
        if (!ch || ch == '\n')
          return;
        if (ch == '\r') {
          if ((ch = stream.lookChar()) == '\n')
            stream.skip();
          return;
        }
      }
    },
    skip: function Lexer_skip() {
      this.stream.skip();
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

