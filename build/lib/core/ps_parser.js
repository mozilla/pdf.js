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
exports.PostScriptParser = exports.PostScriptLexer = undefined;

var _util = require('../shared/util');

var _primitives = require('./primitives');

var PostScriptParser = function PostScriptParserClosure() {
  function PostScriptParser(lexer) {
    this.lexer = lexer;
    this.operators = [];
    this.token = null;
    this.prev = null;
  }
  PostScriptParser.prototype = {
    nextToken: function PostScriptParser_nextToken() {
      this.prev = this.token;
      this.token = this.lexer.getToken();
    },
    accept: function PostScriptParser_accept(type) {
      if (this.token.type === type) {
        this.nextToken();
        return true;
      }
      return false;
    },
    expect: function PostScriptParser_expect(type) {
      if (this.accept(type)) {
        return true;
      }
      throw new _util.FormatError('Unexpected symbol: found ' + this.token.type + ' expected ' + type + '.');
    },
    parse: function PostScriptParser_parse() {
      this.nextToken();
      this.expect(PostScriptTokenTypes.LBRACE);
      this.parseBlock();
      this.expect(PostScriptTokenTypes.RBRACE);
      return this.operators;
    },
    parseBlock: function PostScriptParser_parseBlock() {
      while (true) {
        if (this.accept(PostScriptTokenTypes.NUMBER)) {
          this.operators.push(this.prev.value);
        } else if (this.accept(PostScriptTokenTypes.OPERATOR)) {
          this.operators.push(this.prev.value);
        } else if (this.accept(PostScriptTokenTypes.LBRACE)) {
          this.parseCondition();
        } else {
          return;
        }
      }
    },
    parseCondition: function PostScriptParser_parseCondition() {
      var conditionLocation = this.operators.length;
      this.operators.push(null, null);
      this.parseBlock();
      this.expect(PostScriptTokenTypes.RBRACE);
      if (this.accept(PostScriptTokenTypes.IF)) {
        this.operators[conditionLocation] = this.operators.length;
        this.operators[conditionLocation + 1] = 'jz';
      } else if (this.accept(PostScriptTokenTypes.LBRACE)) {
        var jumpLocation = this.operators.length;
        this.operators.push(null, null);
        var endOfTrue = this.operators.length;
        this.parseBlock();
        this.expect(PostScriptTokenTypes.RBRACE);
        this.expect(PostScriptTokenTypes.IFELSE);
        this.operators[jumpLocation] = this.operators.length;
        this.operators[jumpLocation + 1] = 'j';
        this.operators[conditionLocation] = endOfTrue;
        this.operators[conditionLocation + 1] = 'jz';
      } else {
        throw new _util.FormatError('PS Function: error parsing conditional.');
      }
    }
  };
  return PostScriptParser;
}();
var PostScriptTokenTypes = {
  LBRACE: 0,
  RBRACE: 1,
  NUMBER: 2,
  OPERATOR: 3,
  IF: 4,
  IFELSE: 5
};
var PostScriptToken = function PostScriptTokenClosure() {
  function PostScriptToken(type, value) {
    this.type = type;
    this.value = value;
  }
  var opCache = Object.create(null);
  PostScriptToken.getOperator = function PostScriptToken_getOperator(op) {
    var opValue = opCache[op];
    if (opValue) {
      return opValue;
    }
    return opCache[op] = new PostScriptToken(PostScriptTokenTypes.OPERATOR, op);
  };
  PostScriptToken.LBRACE = new PostScriptToken(PostScriptTokenTypes.LBRACE, '{');
  PostScriptToken.RBRACE = new PostScriptToken(PostScriptTokenTypes.RBRACE, '}');
  PostScriptToken.IF = new PostScriptToken(PostScriptTokenTypes.IF, 'IF');
  PostScriptToken.IFELSE = new PostScriptToken(PostScriptTokenTypes.IFELSE, 'IFELSE');
  return PostScriptToken;
}();
var PostScriptLexer = function PostScriptLexerClosure() {
  function PostScriptLexer(stream) {
    this.stream = stream;
    this.nextChar();
    this.strBuf = [];
  }
  PostScriptLexer.prototype = {
    nextChar: function PostScriptLexer_nextChar() {
      return this.currentChar = this.stream.getByte();
    },
    getToken: function PostScriptLexer_getToken() {
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
        } else if (!(0, _util.isSpace)(ch)) {
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
          return new PostScriptToken(PostScriptTokenTypes.NUMBER, this.getNumber());
        case 0x7B:
          this.nextChar();
          return PostScriptToken.LBRACE;
        case 0x7D:
          this.nextChar();
          return PostScriptToken.RBRACE;
      }
      var strBuf = this.strBuf;
      strBuf.length = 0;
      strBuf[0] = String.fromCharCode(ch);
      while ((ch = this.nextChar()) >= 0 && (ch >= 0x41 && ch <= 0x5A || ch >= 0x61 && ch <= 0x7A)) {
        strBuf.push(String.fromCharCode(ch));
      }
      var str = strBuf.join('');
      switch (str.toLowerCase()) {
        case 'if':
          return PostScriptToken.IF;
        case 'ifelse':
          return PostScriptToken.IFELSE;
        default:
          return PostScriptToken.getOperator(str);
      }
    },
    getNumber: function PostScriptLexer_getNumber() {
      var ch = this.currentChar;
      var strBuf = this.strBuf;
      strBuf.length = 0;
      strBuf[0] = String.fromCharCode(ch);
      while ((ch = this.nextChar()) >= 0) {
        if (ch >= 0x30 && ch <= 0x39 || ch === 0x2D || ch === 0x2E) {
          strBuf.push(String.fromCharCode(ch));
        } else {
          break;
        }
      }
      var value = parseFloat(strBuf.join(''));
      if (isNaN(value)) {
        throw new _util.FormatError('Invalid floating point number: ' + value);
      }
      return value;
    }
  };
  return PostScriptLexer;
}();
exports.PostScriptLexer = PostScriptLexer;
exports.PostScriptParser = PostScriptParser;