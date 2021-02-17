/* Copyright 2020 Mozilla Foundation
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

import { Errors, Parser } from "../../src/core/xfa/formcalc_parser.js";
import { Lexer, Token, TOKEN } from "../../src/core/xfa/formcalc_lexer.js";

describe("FormCalc expression parser", function () {
  const EOF = new Token(TOKEN.eof);

  describe("FormCalc lexer", function () {
    it("should lex numbers", function () {
      const lexer = new Lexer(
        "12 1.2345 .7 .12345 1e-2 1.2E+3 1e2 1.2E3 nan 12. 2.e3 infinity 99999999999999999 123456789.012345678 9e99999"
      );
      expect(lexer.next()).toEqual(new Token(TOKEN.number, 12));
      expect(lexer.next()).toEqual(new Token(TOKEN.number, 1.2345));
      expect(lexer.next()).toEqual(new Token(TOKEN.number, 0.7));
      expect(lexer.next()).toEqual(new Token(TOKEN.number, 0.12345));
      expect(lexer.next()).toEqual(new Token(TOKEN.number, 1e-2));
      expect(lexer.next()).toEqual(new Token(TOKEN.number, 1.2e3));
      expect(lexer.next()).toEqual(new Token(TOKEN.number, 1e2));
      expect(lexer.next()).toEqual(new Token(TOKEN.number, 1.2e3));
      expect(lexer.next()).toEqual(new Token(TOKEN.number, NaN));
      expect(lexer.next()).toEqual(new Token(TOKEN.number, 12));
      expect(lexer.next()).toEqual(new Token(TOKEN.number, 2e3));
      expect(lexer.next()).toEqual(new Token(TOKEN.number, Infinity));
      expect(lexer.next()).toEqual(new Token(TOKEN.number, 100000000000000000));
      expect(lexer.next()).toEqual(new Token(TOKEN.number, 123456789.01234567));
      expect(lexer.next()).toEqual(new Token(TOKEN.number, Infinity));
      expect(lexer.next()).toEqual(EOF);
    });

    it("should lex strings", function () {
      const lexer = new Lexer(
        `"hello world" "hello ""world" "hello ""world"" ""world""""hello""" "hello \\uabcdeh \\Uabcd \\u00000123abc" "a \\a \\ub \\Uc \\b"`
      );
      expect(lexer.next()).toEqual(new Token(TOKEN.string, `hello world`));
      expect(lexer.next()).toEqual(new Token(TOKEN.string, `hello "world`));
      expect(lexer.next()).toEqual(
        new Token(TOKEN.string, `hello "world" "world""hello"`)
      );
      expect(lexer.next()).toEqual(
        new Token(TOKEN.string, `hello \uabcdeh \uabcd \u0123abc`)
      );
      expect(lexer.next()).toEqual(
        new Token(TOKEN.string, `a \\a \\ub \\Uc \\b`)
      );
      expect(lexer.next()).toEqual(EOF);
    });

    it("should lex operators", function () {
      const lexer = new Lexer("( , ) <= <> = == >= < > / * . .* .# [ ] & |");
      expect(lexer.next()).toEqual(new Token(TOKEN.leftParen));
      expect(lexer.next()).toEqual(new Token(TOKEN.comma));
      expect(lexer.next()).toEqual(new Token(TOKEN.rightParen));
      expect(lexer.next()).toEqual(new Token(TOKEN.le));
      expect(lexer.next()).toEqual(new Token(TOKEN.ne));
      expect(lexer.next()).toEqual(new Token(TOKEN.assign));
      expect(lexer.next()).toEqual(new Token(TOKEN.eq));
      expect(lexer.next()).toEqual(new Token(TOKEN.ge));
      expect(lexer.next()).toEqual(new Token(TOKEN.lt));
      expect(lexer.next()).toEqual(new Token(TOKEN.gt));
      expect(lexer.next()).toEqual(new Token(TOKEN.divide));
      expect(lexer.next()).toEqual(new Token(TOKEN.times));
      expect(lexer.next()).toEqual(new Token(TOKEN.dot));
      expect(lexer.next()).toEqual(new Token(TOKEN.dotStar));
      expect(lexer.next()).toEqual(new Token(TOKEN.dotHash));
      expect(lexer.next()).toEqual(new Token(TOKEN.leftBracket));
      expect(lexer.next()).toEqual(new Token(TOKEN.rightBracket));
      expect(lexer.next()).toEqual(new Token(TOKEN.and));
      expect(lexer.next()).toEqual(new Token(TOKEN.or));
      expect(lexer.next()).toEqual(EOF);
    });

    it("should skip comments", function () {
      const lexer = new Lexer(`

  \t\t  1 \r\n\r\n

  ;  blah blah blah

  2

  // blah blah blah blah blah


  3
      `);
      expect(lexer.next()).toEqual(new Token(TOKEN.number, 1));
      expect(lexer.next()).toEqual(new Token(TOKEN.number, 2));
      expect(lexer.next()).toEqual(new Token(TOKEN.number, 3));
      expect(lexer.next()).toEqual(EOF);
    });

    it("should lex identifiers", function () {
      const lexer = new Lexer(
        "eq for fore while continue hello こんにちは世界 $!hello今日は12今日は"
      );
      expect(lexer.next()).toEqual(new Token(TOKEN.eq));
      expect(lexer.next()).toEqual(new Token(TOKEN.for));
      expect(lexer.next()).toEqual(new Token(TOKEN.identifier, "fore"));
      expect(lexer.next()).toEqual(new Token(TOKEN.while));
      expect(lexer.next()).toEqual(new Token(TOKEN.continue));
      expect(lexer.next()).toEqual(new Token(TOKEN.identifier, "hello"));
      expect(lexer.next()).toEqual(
        new Token(TOKEN.identifier, "こんにちは世界")
      );
      expect(lexer.next()).toEqual(new Token(TOKEN.identifier, "$"));
      expect(lexer.next()).toEqual(
        new Token(TOKEN.identifier, "!hello今日は12今日は")
      );
      expect(lexer.next()).toEqual(EOF);
    });
  });

  describe("FormCalc parser", function () {
    it("should parse basic arithmetic expression", function () {
      const parser = new Parser("1 + 2 * 3");
      expect(parser.parse().dump()[0]).toEqual(7);
    });

    it("should parse basic arithmetic expression with the same operator", function () {
      const parser = new Parser("1 + a + 3");
      expect(parser.parse().dump()[0]).toEqual({
        operator: "+",
        left: {
          operator: "+",
          left: 1,
          right: { id: "a" },
        },
        right: 3,
      });
    });

    it("should parse expressions with unary operators", function () {
      const parser = new Parser(`
  s = +x + 1
  t = -+u * 2
  t = +-u * 2
  u = -foo()
      `);
      expect(parser.parse().dump()).toEqual([
        {
          assignment: "s",
          expr: {
            operator: "+",
            left: { operator: "+", arg: { id: "x" } },
            right: 1,
          },
        },
        {
          assignment: "t",
          expr: {
            operator: "*",
            left: {
              operator: "-",
              arg: {
                operator: "+",
                arg: { id: "u" },
              },
            },
            right: 2,
          },
        },
        {
          assignment: "t",
          expr: {
            operator: "*",
            left: {
              operator: "+",
              arg: {
                operator: "-",
                arg: { id: "u" },
              },
            },
            right: 2,
          },
        },
        {
          assignment: "u",
          expr: {
            operator: "-",
            arg: {
              callee: { id: "foo" },
              params: [],
            },
          },
        },
      ]);
    });

    it("should parse basic expression with a string", function () {
      const parser = new Parser(`(5 - "abc") * 3`);
      expect(parser.parse().dump()[0]).toEqual(15);
    });

    it("should parse basic expression with a calls", function () {
      const parser = new Parser(`foo(2, 3, a & b) or c * d + 1.234 / e`);
      expect(parser.parse().dump()[0]).toEqual({
        operator: "||",
        left: {
          callee: { id: "foo" },
          params: [
            2,
            3,
            {
              operator: "&&",
              left: { id: "a" },
              right: { id: "b" },
            },
          ],
        },
        right: {
          operator: "+",
          left: {
            operator: "*",
            left: { id: "c" },
            right: { id: "d" },
          },
          right: {
            operator: "/",
            left: 1.234,
            right: { id: "e" },
          },
        },
      });
    });

    it("should parse basic expression with a subscript", function () {
      let parser = new Parser(`こんにちは世界[-0]`);
      let dump = parser.parse().dump()[0];
      expect(dump).toEqual({
        operand: { id: "こんにちは世界" },
        index: -0,
      });
      expect(Object.is(-0, dump.index)).toBe(true);

      parser = new Parser(`こんにちは世界[+0]`);
      dump = parser.parse().dump()[0];
      expect(dump).toEqual({
        operand: { id: "こんにちは世界" },
        index: +0,
      });
      expect(Object.is(+0, dump.index)).toBe(true);

      parser = new Parser(`こんにちは世界[*]`);
      expect(parser.parse().dump()[0]).toEqual({
        operand: { id: "こんにちは世界" },
        index: { special: "*" },
      });
    });

    it("should parse basic expression with dots", function () {
      const parser = new Parser("a.b.c.#d..e.f..g.*");
      expect(parser.parse().dump()[0]).toEqual({
        operator: ".",
        left: { id: "a" },
        right: {
          operator: ".",
          left: { id: "b" },
          right: {
            operator: ".#",
            left: { id: "c" },
            right: {
              operator: "..",
              left: { id: "d" },
              right: {
                operator: ".",
                left: { id: "e" },
                right: {
                  operator: "..",
                  left: { id: "f" },
                  right: {
                    operator: ".",
                    left: { id: "g" },
                    right: { special: "*" },
                  },
                },
              },
            },
          },
        },
      });
    });

    it("should parse var declaration with error", function () {
      let parser = new Parser("var 123 = a");
      expect(() => parser.parse()).toThrow(new Error(Errors.var));

      parser = new Parser(`var "123" = a`);
      expect(() => parser.parse()).toThrow(new Error(Errors.var));

      parser = new Parser(`var for var a`);
      expect(() => parser.parse()).toThrow(new Error(Errors.var));
    });

    it("should parse for declaration with a step", function () {
      const parser = new Parser(`
var s = 0
for var i = 1 upto 10 + x step 1 do
  s = s + i * 2
endfor`);
      expect(parser.parse().dump()).toEqual([
        {
          var: "s",
          expr: 0,
        },
        {
          decl: "for",
          assignment: {
            var: "i",
            expr: 1,
          },
          type: "upto",
          end: {
            operator: "+",
            left: 10,
            right: { id: "x" },
          },
          step: 1,
          body: [
            {
              assignment: "s",
              expr: {
                operator: "+",
                left: { id: "s" },
                right: {
                  operator: "*",
                  left: { id: "i" },
                  right: 2,
                },
              },
            },
          ],
        },
      ]);
    });

    it("should parse for declaration without a step", function () {
      const parser = new Parser(`
for i = 1 + 2 downto 10 do
  s = foo()
endfor`);
      expect(parser.parse().dump()).toEqual([
        {
          decl: "for",
          assignment: {
            assignment: "i",
            expr: 3,
          },
          type: "downto",
          end: 10,
          step: null,
          body: [
            {
              assignment: "s",
              expr: {
                callee: { id: "foo" },
                params: [],
              },
            },
          ],
        },
      ]);
    });

    it("should parse for declaration with error", function () {
      let parser = new Parser("for 123 = i upto 1 do a = 1 endfor");
      expect(() => parser.parse()).toThrow(new Error(Errors.assignment));

      parser = new Parser("for var 123 = i upto 1 do a = 1 endfor");
      expect(() => parser.parse()).toThrow(new Error(Errors.assignment));

      parser = new Parser("for var i = 123 upt 1 do a = 1 endfor");
      expect(() => parser.parse()).toThrow(new Error(Errors.for));

      parser = new Parser("for var i = 123 var 1 do a = 1 endfor");
      expect(() => parser.parse()).toThrow(new Error(Errors.for));

      parser = new Parser(
        "for var i = 123 upto 1 step for var j = 1 do endfor do a = 1 endfor"
      );
      expect(() => parser.parse()).toThrow(new Error(Errors.for));

      parser = new Parser("for var i = 123 downto 1 do a = 1 endfunc");
      expect(() => parser.parse()).toThrow(new Error(Errors.for));

      parser = new Parser("for var i = 123 downto 1 do a = 1");
      expect(() => parser.parse()).toThrow(new Error(Errors.for));
    });

    it("should parse foreach declaration", function () {
      const parser = new Parser(`
foreach i in (a, b, c, d) do
  s = foo()[i]
endfor`);
      expect(parser.parse().dump()).toEqual([
        {
          decl: "foreach",
          id: "i",
          params: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
          body: [
            {
              assignment: "s",
              expr: {
                operand: {
                  callee: { id: "foo" },
                  params: [],
                },
                index: { id: "i" },
              },
            },
          ],
        },
      ]);
    });

    it("should parse foreach declaration with error", function () {
      let parser = new Parser("foreach 123 in (1, 2, 3) do a = 1 endfor");
      expect(() => parser.parse()).toThrow(new Error(Errors.foreach));

      parser = new Parser("foreach foo in 1, 2, 3) do a = 1 endfor");
      expect(() => parser.parse()).toThrow(new Error(Errors.foreach));

      parser = new Parser("foreach foo in (1, 2, 3 do a = 1 endfor");
      expect(() => parser.parse()).toThrow(new Error(Errors.params));

      parser = new Parser("foreach foo in (1, 2 3) do a = 1 endfor");
      expect(() => parser.parse()).toThrow(new Error(Errors.params));

      parser = new Parser("foreach foo in (1, 2, 3) od a = 1 endfor");
      expect(() => parser.parse()).toThrow(new Error(Errors.foreach));

      parser = new Parser("foreach foo in (1, 2, 3) do a = 1 endforeach");
      expect(() => parser.parse()).toThrow(new Error(Errors.foreach));

      parser = new Parser("foreach foo in (1, 2, 3) do a = 1  123");
      expect(() => parser.parse()).toThrow(new Error(Errors.foreach));
    });

    it("should parse while declaration", function () {
      const parser = new Parser(`
while (1) do
  if (0) then
    break
  else
    continue
  endif
endwhile
      `);
      expect(parser.parse().dump()).toEqual([
        {
          decl: "while",
          condition: 1,
          body: [
            {
              decl: "if",
              condition: 0,
              then: [{ special: "break" }],
              elseif: null,
              else: [{ special: "continue" }],
            },
          ],
        },
      ]);
    });

    it("should parse while declaration with error", function () {
      let parser = new Parser("while a == 1 do a = 2 endwhile");
      expect(() => parser.parse()).toThrow(new Error(Errors.while));

      parser = new Parser("while (a == 1 do a = 2 endwhile");
      expect(() => parser.parse()).toThrow(new Error(Errors.while));

      parser = new Parser("while (a == 1) var a = 2 endwhile");
      expect(() => parser.parse()).toThrow(new Error(Errors.while));

      parser = new Parser("while (a == 1) do var a = 2 end");
      expect(() => parser.parse()).toThrow(new Error(Errors.while));
    });

    it("should parse do declaration", function () {
      const parser = new Parser(`
do
  x = 1
; a comment in the middle of the block
  y = 2
end
    `);
      expect(parser.parse().dump()).toEqual([
        {
          decl: "block",
          body: [
            {
              assignment: "x",
              expr: 1,
            },
            {
              assignment: "y",
              expr: 2,
            },
          ],
        },
      ]);
    });

    it("should parse do declaration with error", function () {
      const parser = new Parser(`
do
  x = 1
  y = 2
endfunc
      `);
      expect(() => parser.parse()).toThrow(new Error(Errors.block));
    });

    it("should parse func declaration", function () {
      const parser = new Parser(`
func こんにちは世界123(a, b) do
  a + b
endfunc
      `);
      expect(parser.parse().dump()).toEqual([
        {
          func: "こんにちは世界123",
          params: ["a", "b"],
          body: [
            {
              operator: "+",
              left: { id: "a" },
              right: { id: "b" },
            },
          ],
        },
      ]);
    });

    it("should parse func declaration with error", function () {
      let parser = new Parser("func 123(a, b) do a = 1 endfunc");
      expect(() => parser.parse()).toThrow(new Error(Errors.func));

      parser = new Parser("func foo(a, b) for a = 1 endfunc");
      expect(() => parser.parse()).toThrow(new Error(Errors.func));

      parser = new Parser("func foo(a, b) do a = 1 endfun");
      expect(() => parser.parse()).toThrow(new Error(Errors.func));

      parser = new Parser("func foo(a, b, c do a = 1 endfunc");
      expect(() => parser.parse()).toThrow(new Error(Errors.func));

      parser = new Parser("func foo(a, b, 123) do a = 1 endfunc");
      expect(() => parser.parse()).toThrow(new Error(Errors.func));
    });

    it("should parse if declaration", function () {
      const parser = new Parser(`
  if (a & b) then
    var s = 1
  endif

  if (a or b) then
    var s = 1
  else
    var x = 2
  endif

  if (0) then
    s = 1
  elseif (1) then
    s = 2
  elseif (2) then
    s = 3
  elseif (3) then
    s = 4
  else
    s = 5
  endif

// a comment

  if (0) then
    s = 1
  elseif (1) then
    s = 2
  endif
      `);
      expect(parser.parse().dump()).toEqual([
        {
          decl: "if",
          condition: {
            operator: "&&",
            left: { id: "a" },
            right: { id: "b" },
          },
          then: [
            {
              var: "s",
              expr: 1,
            },
          ],
          elseif: null,
          else: null,
        },
        {
          decl: "if",
          condition: {
            operator: "||",
            left: { id: "a" },
            right: { id: "b" },
          },
          then: [
            {
              var: "s",
              expr: 1,
            },
          ],
          elseif: null,
          else: [
            {
              var: "x",
              expr: 2,
            },
          ],
        },
        {
          decl: "if",
          condition: 0,
          then: [
            {
              assignment: "s",
              expr: 1,
            },
          ],
          elseif: [
            {
              decl: "elseif",
              condition: 1,
              then: [
                {
                  assignment: "s",
                  expr: 2,
                },
              ],
            },
            {
              decl: "elseif",
              condition: 2,
              then: [
                {
                  assignment: "s",
                  expr: 3,
                },
              ],
            },
            {
              decl: "elseif",
              condition: 3,
              then: [
                {
                  assignment: "s",
                  expr: 4,
                },
              ],
            },
          ],
          else: [
            {
              assignment: "s",
              expr: 5,
            },
          ],
        },
        {
          decl: "if",
          condition: 0,
          then: [
            {
              assignment: "s",
              expr: 1,
            },
          ],
          elseif: [
            {
              decl: "elseif",
              condition: 1,
              then: [
                {
                  assignment: "s",
                  expr: 2,
                },
              ],
            },
          ],
          else: null,
        },
      ]);
    });

    it("should parse if declaration with error", function () {
      let parser = new Parser("if foo == 1 then a = 1 endif");
      expect(() => parser.parse()).toThrow(new Error(Errors.if));

      parser = new Parser("if (foo == 1 then a = 1 endif");
      expect(() => parser.parse()).toThrow(new Error(Errors.if));

      parser = new Parser(
        "if (foo == 1) then a = 1 elseiff (foo == 2) then a = 2 endif"
      );
      expect(() => parser.parse()).toThrow(new Error(Errors.if));

      parser = new Parser(
        "if (foo == 1) then a = 1 elseif (foo == 2) then a = 2 end"
      );
      expect(() => parser.parse()).toThrow(new Error(Errors.if));
    });
  });
});
