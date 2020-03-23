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
exports.PostScriptParser = exports.PostScriptLexer = void 0;

var _util = require("../shared/util.js");

var _primitives = require("./primitives.js");

var _core_utils = require("./core_utils.js");

class PostScriptParser {
  constructor(lexer) {
    this.lexer = lexer;
    this.operators = [];
    this.token = null;
    this.prev = null;
  }

  nextToken() {
    this.prev = this.token;
    this.token = this.lexer.getToken();
  }

  accept(type) {
    if (this.token.type === type) {
      this.nextToken();
      return true;
    }

    return false;
  }

  expect(type) {
    if (this.accept(type)) {
      return true;
    }

    throw new _util.FormatError(`Unexpected symbol: found ${this.token.type} expected ${type}.`);
  }

  parse() {
    this.nextToken();
    this.expect(PostScriptTokenTypes.LBRACE);
    this.parseBlock();
    this.expect(PostScriptTokenTypes.RBRACE);
    return this.operators;
  }

  parseBlock() {
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
  }

  parseCondition() {
    const conditionLocation = this.operators.length;
    this.operators.push(null, null);
    this.parseBlock();
    this.expect(PostScriptTokenTypes.RBRACE);

    if (this.accept(PostScriptTokenTypes.IF)) {
      this.operators[conditionLocation] = this.operators.length;
      this.operators[conditionLocation + 1] = "jz";
    } else if (this.accept(PostScriptTokenTypes.LBRACE)) {
      const jumpLocation = this.operators.length;
      this.operators.push(null, null);
      const endOfTrue = this.operators.length;
      this.parseBlock();
      this.expect(PostScriptTokenTypes.RBRACE);
      this.expect(PostScriptTokenTypes.IFELSE);
      this.operators[jumpLocation] = this.operators.length;
      this.operators[jumpLocation + 1] = "j";
      this.operators[conditionLocation] = endOfTrue;
      this.operators[conditionLocation + 1] = "jz";
    } else {
      throw new _util.FormatError("PS Function: error parsing conditional.");
    }
  }

}

exports.PostScriptParser = PostScriptParser;
const PostScriptTokenTypes = {
  LBRACE: 0,
  RBRACE: 1,
  NUMBER: 2,
  OPERATOR: 3,
  IF: 4,
  IFELSE: 5
};

const PostScriptToken = function PostScriptTokenClosure() {
  const opCache = Object.create(null);

  class PostScriptToken {
    constructor(type, value) {
      this.type = type;
      this.value = value;
    }

    static getOperator(op) {
      const opValue = opCache[op];

      if (opValue) {
        return opValue;
      }

      return opCache[op] = new PostScriptToken(PostScriptTokenTypes.OPERATOR, op);
    }

    static get LBRACE() {
      return (0, _util.shadow)(this, "LBRACE", new PostScriptToken(PostScriptTokenTypes.LBRACE, "{"));
    }

    static get RBRACE() {
      return (0, _util.shadow)(this, "RBRACE", new PostScriptToken(PostScriptTokenTypes.RBRACE, "}"));
    }

    static get IF() {
      return (0, _util.shadow)(this, "IF", new PostScriptToken(PostScriptTokenTypes.IF, "IF"));
    }

    static get IFELSE() {
      return (0, _util.shadow)(this, "IFELSE", new PostScriptToken(PostScriptTokenTypes.IFELSE, "IFELSE"));
    }

  }

  return PostScriptToken;
}();

class PostScriptLexer {
  constructor(stream) {
    this.stream = stream;
    this.nextChar();
    this.strBuf = [];
  }

  nextChar() {
    return this.currentChar = this.stream.getByte();
  }

  getToken() {
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
      } else if (!(0, _core_utils.isWhiteSpace)(ch)) {
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
        return new PostScriptToken(PostScriptTokenTypes.NUMBER, this.getNumber());

      case 0x7b:
        this.nextChar();
        return PostScriptToken.LBRACE;

      case 0x7d:
        this.nextChar();
        return PostScriptToken.RBRACE;
    }

    const strBuf = this.strBuf;
    strBuf.length = 0;
    strBuf[0] = String.fromCharCode(ch);

    while ((ch = this.nextChar()) >= 0 && (ch >= 0x41 && ch <= 0x5a || ch >= 0x61 && ch <= 0x7a)) {
      strBuf.push(String.fromCharCode(ch));
    }

    const str = strBuf.join("");

    switch (str.toLowerCase()) {
      case "if":
        return PostScriptToken.IF;

      case "ifelse":
        return PostScriptToken.IFELSE;

      default:
        return PostScriptToken.getOperator(str);
    }
  }

  getNumber() {
    let ch = this.currentChar;
    const strBuf = this.strBuf;
    strBuf.length = 0;
    strBuf[0] = String.fromCharCode(ch);

    while ((ch = this.nextChar()) >= 0) {
      if (ch >= 0x30 && ch <= 0x39 || ch === 0x2d || ch === 0x2e) {
        strBuf.push(String.fromCharCode(ch));
      } else {
        break;
      }
    }

    const value = parseFloat(strBuf.join(""));

    if (isNaN(value)) {
      throw new _util.FormatError(`Invalid floating point number: ${value}`);
    }

    return value;
  }

}

exports.PostScriptLexer = PostScriptLexer;