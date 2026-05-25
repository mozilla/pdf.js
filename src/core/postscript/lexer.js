/* Copyright 2026 Mozilla Foundation
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

const TOKEN = {
  // Structural tokens — not keyword operators
  number: 0,
  lbrace: 1,
  rbrace: 2,

  // Boolean literals
  true: 3,
  false: 4,

  // Arithmetic binary operators
  add: 5,
  sub: 6,
  mul: 7,
  div: 8,
  idiv: 9,
  mod: 10,
  exp: 11,

  // Comparison binary operators
  eq: 12,
  ne: 13,
  gt: 14,
  ge: 15,
  lt: 16,
  le: 17,

  // Bitwise / boolean binary operators
  and: 18,
  or: 19,
  xor: 20,
  bitshift: 21,

  // Unary arithmetic operators
  abs: 22,
  neg: 23,
  ceiling: 24,
  floor: 25,
  round: 26,
  truncate: 27,

  // Unary boolean / bitwise operator
  not: 28,

  // Mathematical functions — unary
  sqrt: 29,
  sin: 30,
  cos: 31,
  ln: 32,
  log: 33,

  // Mathematical function — binary
  atan: 34,

  // Type conversion operators
  cvi: 35,
  cvr: 36,

  // Stack operators
  dup: 37,
  exch: 38,
  pop: 39,
  copy: 40,
  index: 41,
  roll: 42,

  // Control flow
  if: 43,
  ifelse: 44,

  // End of input
  eof: 45,

  // Synthetic: produced by the optimizer, never emitted by the lexer.
  min: 46,
  max: 47,
};

class Token {
  constructor(id, value = null) {
    this.id = id;
    this.value = value;
  }
}

class Lexer {
  // Singletons for every non-number token, built lazily on first construction.
  // Keyword operator tokens carry their name as `value`; structural tokens
  // (lbrace, rbrace, eof) carry null.
  static #singletons = null;

  static #operatorSingletons = null;

  static #initSingletons() {
    const singletons = Object.create(null);
    const operatorSingletons = Object.create(null);
    for (const [name, id] of Object.entries(TOKEN)) {
      if (name === "number") {
        continue;
      }
      const isOperator = id >= TOKEN.true && id <= TOKEN.ifelse;
      const token = new Token(id, isOperator ? name : null);
      singletons[name] = token;
      if (isOperator) {
        operatorSingletons[name] = token;
      }
    }
    this.#singletons = singletons;
    this.#operatorSingletons = operatorSingletons;
  }

  constructor(data) {
    if (!Lexer.#singletons) {
      Lexer.#initSingletons();
    }
    this.data = data;
    this.pos = 0;
    this.len = data.length;
    // Sticky regexes: set lastIndex before exec() to match at an exact offset.
    this._numberPattern = /[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/iy;
    this._identifierPattern = /[a-z]+/y;
  }

  // Skip a % comment, advancing past the next \n or \r (or to EOF).
  _skipComment() {
    const lf = this.data.indexOf("\n", this.pos);
    const cr = this.data.indexOf("\r", this.pos);
    // Treat a missing EOL as this.len so Math.min picks the one that exists.
    const eol = Math.min(lf < 0 ? this.len : lf, cr < 0 ? this.len : cr);
    this.pos = Math.min(eol + 1, this.len);
  }

  _getNumber() {
    this._numberPattern.lastIndex = this.pos;
    const match = this._numberPattern.exec(this.data);
    if (!match) {
      return new Token(TOKEN.number, 0);
    }
    const number = parseFloat(match[0]);
    if (!Number.isFinite(number)) {
      return new Token(TOKEN.number, 0);
    }
    this.pos = this._numberPattern.lastIndex;
    return new Token(TOKEN.number, number);
  }

  _getOperator() {
    this._identifierPattern.lastIndex = this.pos;
    const match = this._identifierPattern.exec(this.data);
    if (!match) {
      return new Token(TOKEN.number, 0);
    }
    this.pos = this._identifierPattern.lastIndex;
    const op = match[0];
    const token = Lexer.#operatorSingletons[op];
    if (!token) {
      return new Token(TOKEN.number, 0);
    }
    return token;
  }

  // Return the next token, or Lexer.#singletons.eof at end of input.
  next() {
    while (this.pos < this.len) {
      const ch = this.data.charCodeAt(this.pos++);
      switch (ch) {
        // PostScript white-space characters (PDF32000 §7.2.2)
        case 0x00 /* NUL */:
        case 0x09 /* HT */:
        case 0x0a /* LF */:
        case 0x0c /* FF */:
        case 0x0d /* CR */:
        case 0x20 /* SP */:
          break;

        case 0x25 /* % — comment */:
          this._skipComment();
          break;

        case 0x7b /* { */:
          return Lexer.#singletons.lbrace;
        case 0x7d /* } */:
          return Lexer.#singletons.rbrace;

        case 0x2b /* + */:
        case 0x2d /* - */:
          this.pos--;
          return this._getNumber();

        case 0x2e /* . */:
          this.pos--;
          return this._getNumber();

        default:
          if (ch >= 0x30 /* 0 */ && ch <= 0x39 /* 9 */) {
            this.pos--;
            return this._getNumber();
          }
          if (ch >= 0x61 /* a */ && ch <= 0x7a /* z */) {
            this.pos--;
            return this._getOperator();
          }
          return new Token(TOKEN.number, 0);
      }
    }
    return Lexer.#singletons.eof;
  }
}

export { Lexer, Token, TOKEN };
