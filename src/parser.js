/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var EOF = {};

function isEOF(v) {
  return v == EOF;
}

var Parser = (function parserParser() {
  function constructor(lexer, allowStreams, xref) {
    this.lexer = lexer;
    this.allowStreams = allowStreams;
    this.xref = xref;
    this.inlineImg = 0;
    this.refill();
  }

  constructor.prototype = {
    refill: function parserRefill() {
      this.buf1 = this.lexer.getObj();
      this.buf2 = this.lexer.getObj();
    },
    shift: function parserShift() {
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
    getObj: function parserGetObj(cipherTransform) {
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
        var dict = new Dict();
        while (!isCmd(this.buf1, '>>') && !isEOF(this.buf1)) {
          if (!isName(this.buf1)) {
            error('Dictionary key must be a name object');
          } else {
            var key = this.buf1.name;
            this.shift();
            if (isEOF(this.buf1))
              break;
            dict.set(key, this.getObj(cipherTransform));
          }
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
    makeInlineImage: function parserMakeInlineImage(cipherTransform) {
      var lexer = this.lexer;
      var stream = lexer.stream;

      // parse dictionary
      var dict = new Dict();
      while (!isCmd(this.buf1, 'ID') && !isEOF(this.buf1)) {
        if (!isName(this.buf1)) {
          error('Dictionary key must be a name object');
        } else {
          var key = this.buf1.name;
          this.shift();
          if (isEOF(this.buf1))
            break;
          dict.set(key, this.getObj(cipherTransform));
        }
      }

      // parse image stream
      var startPos = stream.pos;

      // searching for the /\sEI\s/
      var state = 0, ch;
      while (state != 4 && (ch = stream.getByte()) != null) {
        switch (ch) {
          case 0x20:
          case 0x0D:
          case 0x0A:
            state = state === 3 ? 4 : 1;
            break;
          case 0x45:
            state = state === 1 ? 2 : 0;
            break;
          case 0x49:
            state = state === 2 ? 3 : 0;
            break;
          default:
            state = 0;
            break;
        }
      }

      // TODO improve the small images performance to remove the limit
      var inlineImgLimit = 500;
      if (++this.inlineImg >= inlineImgLimit) {
        if (this.inlineImg === inlineImgLimit)
          warn('Too many inline images');
        this.shift();
        return null;
      }

      var length = (stream.pos - 4) - startPos;
      var imageStream = stream.makeSubStream(startPos, length, dict);
      if (cipherTransform)
        imageStream = cipherTransform.createStream(imageStream);
      imageStream = this.filter(imageStream, dict, length);
      imageStream.parameters = dict;

      this.buf2 = new Cmd('EI');
      this.shift();

      return imageStream;
    },
    makeStream: function parserMakeStream(dict, cipherTransform) {
      var lexer = this.lexer;
      var stream = lexer.stream;

      // get stream start position
      lexer.skipToNextLine();
      var pos = stream.pos;

      // get length
      var length = dict.get('Length');
      var xref = this.xref;
      if (xref)
        length = xref.fetchIfRef(length);
      if (!isInt(length)) {
        error('Bad ' + length + ' attribute in stream');
        length = 0;
      }

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
    filter: function parserFilter(stream, dict, length) {
      var filter = dict.get('Filter', 'F');
      var params = dict.get('DecodeParms', 'DP');
      if (isName(filter))
        return this.makeFilter(stream, filter.name, length, params);
      if (isArray(filter)) {
        var filterArray = filter;
        var paramsArray = params;
        for (var i = 0, ii = filterArray.length; i < ii; ++i) {
          filter = filterArray[i];
          if (!isName(filter))
            error('Bad filter name: ' + filter);
          else {
            params = null;
            if (isArray(paramsArray) && (i in paramsArray))
              params = paramsArray[i];
            stream = this.makeFilter(stream, filter.name, length, params);
            // after the first stream the length variable is invalid
            length = null;
          }
        }
      }
      return stream;
    },
    makeFilter: function parserMakeFilter(stream, name, length, params) {
      if (name == 'FlateDecode' || name == 'Fl') {
        if (params) {
          return new PredictorStream(new FlateStream(stream), params);
        }
        return new FlateStream(stream);
      } else if (name == 'LZWDecode' || name == 'LZW') {
        var earlyChange = 1;
        if (params) {
          if (params.has('EarlyChange'))
            earlyChange = params.get('EarlyChange');
          return new PredictorStream(
            new LZWStream(stream, earlyChange), params);
        }
        return new LZWStream(stream, earlyChange);
      } else if (name == 'DCTDecode' || name == 'DCT') {
        var bytes = stream.getBytes(length);
        return new JpegStream(bytes, stream.dict, this.xref);
      } else if (name == 'ASCII85Decode' || name == 'A85') {
        return new Ascii85Stream(stream);
      } else if (name == 'ASCIIHexDecode' || name == 'AHx') {
        return new AsciiHexStream(stream);
      } else if (name == 'CCITTFaxDecode' || name == 'CCF') {
        return new CCITTFaxStream(stream, params);
      } else {
        TODO('filter "' + name + '" not supported yet');
      }
      return stream;
    }
  };

  return constructor;
})();

var Lexer = (function lexer() {
  function constructor(stream) {
    this.stream = stream;
  }

  constructor.isSpace = function lexerIsSpace(ch) {
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

  constructor.prototype = {
    getNumber: function lexerGetNumber(ch) {
      var floating = false;
      var str = ch;
      var stream = this.stream;
      for (;;) {
        ch = stream.lookChar();
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
    getString: function lexerGetString() {
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
    getName: function lexerGetName(ch) {
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
    getHexString: function lexerGetHexString(ch) {
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
    getObj: function lexerGetObj() {
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
          return new Cmd(ch);
        // hex string or dict punctuation
        case '<':
          ch = stream.lookChar();
          if (ch == '<') {
            // dict punctuation
            stream.skip();
            return new Cmd('<<');
          }
          return this.getHexString(ch);
        // dict punctuation
        case '>':
          ch = stream.lookChar();
          if (ch == '>') {
            stream.skip();
            return new Cmd('>>');
          }
        case '{':
        case '}':
          return new Cmd(ch);
        // fall through
        case ')':
          error('Illegal character: ' + ch);
          return Error;
      }

      // command
      var str = ch;
      while (!!(ch = stream.lookChar()) && !specialChars[ch.charCodeAt(0)]) {
        stream.skip();
        if (str.length == 128) {
          error('Command token too long: ' + str.length);
          break;
        }
        str += ch;
      }
      if (str == 'true')
        return true;
      if (str == 'false')
        return false;
      if (str == 'null')
        return null;
      return new Cmd(str);
    },
    skipToNextLine: function lexerSkipToNextLine() {
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
    skip: function lexerSkip() {
      this.stream.skip();
    }
  };

  return constructor;
})();

var Linearization = (function linearizationLinearization() {
  function constructor(stream) {
    this.parser = new Parser(new Lexer(stream), false);
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

  constructor.prototype = {
    getInt: function linearizationGetInt(name) {
      var linDict = this.linDict;
      var obj;
      if (isDict(linDict) &&
          isInt(obj = linDict.get(name)) &&
          obj > 0) {
        return obj;
      }
      error('"' + name + '" field in linearization table is invalid');
      return 0;
    },
    getHint: function linearizationGetHint(index) {
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
      return 0;
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

  return constructor;
})();

