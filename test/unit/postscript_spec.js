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

import {
  buildExponentialWgslShader,
  buildFunctionBasedWgslShader,
  buildPostScriptWgslShader,
  buildSampledWgslShader,
} from "../../src/core/postscript/wgsl_compiler.js";
import {
  buildPostScriptWasmFunction,
  compilePostScriptToWasm,
} from "../../src/core/postscript/wasm_compiler.js";
import { Lexer, TOKEN } from "../../src/core/postscript/lexer.js";
import {
  parsePostScriptFunction,
  Parser,
  PS_VALUE_TYPE,
  PsArgNode,
  PsBinaryNode,
  PsBlock,
  PsConstNode,
  PsIf,
  PsIfElse,
  PsNumber,
  PsOperator,
  PsProgram,
  PSStackToTree,
  PsTernaryNode,
  PsUnaryNode,
} from "../../src/core/postscript/ast.js";
import { Stream, StringStream } from "../../src/core/stream.js";
import { buildPostScriptJsFunction } from "../../src/core/postscript/js_evaluator.js";
import { Dict } from "../../src/core/primitives.js";
import { XRefMock } from "./test_utils.js";

// Precision argument for toBeCloseTo() in trigonometric tests.
const TRIGONOMETRY_EPS = 1e-10;

describe("PostScript Type 4 lexer, parser, and Wasm compiler", function () {
  describe("PostScript Type 4 lexer", function () {
    /** Tokenize a string and return the sequence of token ids. */
    function tokenIds(src) {
      const lexer = new Lexer(src);
      const ids = [];
      let tok;
      while ((tok = lexer.next()).id !== TOKEN.eof) {
        ids.push(tok.id);
      }
      return ids;
    }

    it("tokenizes numbers", function () {
      const lexer = new Lexer("3 -1.5 +0.5 .25 1.5e3");
      const values = [];
      let tok;
      while ((tok = lexer.next()).id !== TOKEN.eof) {
        values.push(tok.value);
      }
      expect(values).toEqual([3, -1.5, 0.5, 0.25, 1500]);
    });

    it("tokenizes braces", function () {
      expect(tokenIds("{ }")).toEqual([TOKEN.lbrace, TOKEN.rbrace]);
    });

    it("tokenizes all operator keywords", function () {
      const ops = [
        "abs add and atan bitshift ceiling copy cos cvi cvr div dup eq exch",
        "exp false floor ge gt idiv if ifelse index le ln log lt mod mul ne",
        "neg not or pop roll round sin sqrt sub true truncate xor",
      ].join(" ");
      const ids = tokenIds(ops);
      // Every id should be a valid non-structural, non-number token.
      for (const id of ids) {
        expect(id).toBeGreaterThan(TOKEN.rbrace);
        expect(id).toBeLessThan(TOKEN.eof);
      }
    });

    it("skips % comments", function () {
      expect(tokenIds("{ % comment\nadd }")).toEqual([
        TOKEN.lbrace,
        TOKEN.add,
        TOKEN.rbrace,
      ]);
    });

    it("skips whitespace", function () {
      expect(tokenIds("  \t\n\r\fadd")).toEqual([TOKEN.add]);
    });

    it("operator tokens carry their name as value", function () {
      const lexer = new Lexer("mul");
      const tok = lexer.next();
      expect(tok.id).toBe(TOKEN.mul);
      expect(tok.value).toBe("mul");
    });

    it("reuses singleton operator tokens", function () {
      const lexer1 = new Lexer("add");
      const lexer2 = new Lexer("add");
      expect(lexer1.next()).toBe(lexer2.next());
    });

    it("returns number(0) for unknown operator", function () {
      const tok = new Lexer("foo").next();
      expect(tok.id).toBe(TOKEN.number);
      expect(tok.value).toBe(0);
    });

    it("returns number(0) for non-finite number (e.g. 1e999 → Infinity)", function () {
      const tok = new Lexer("1e999").next();
      expect(tok.id).toBe(TOKEN.number);
      expect(tok.value).toBe(0);
    });

    it("returns number(0) for unexpected character", function () {
      const tok = new Lexer("@").next();
      expect(tok.id).toBe(TOKEN.number);
      expect(tok.value).toBe(0);
    });
  });

  describe("PostScript Type 4 parser", function () {
    it("parses an empty program", function () {
      const prog = parsePostScriptFunction("{ }");
      expect(prog).toBeInstanceOf(PsProgram);
      expect(prog.body).toBeInstanceOf(PsBlock);
      expect(prog.body.instructions.length).toBe(0);
    });

    it("parses number literals", function () {
      const prog = parsePostScriptFunction("{ 1 2.5 -3 }");
      const instrs = prog.body.instructions;
      expect(instrs.length).toBe(3);
      expect(instrs[0]).toBeInstanceOf(PsNumber);
      expect(instrs[0].value).toBe(1);
      expect(instrs[1].value).toBeCloseTo(2.5);
      expect(instrs[2].value).toBe(-3);
    });

    it("parses operators", function () {
      const prog = parsePostScriptFunction("{ add mul sub }");
      const instrs = prog.body.instructions;
      expect(instrs.every(n => n instanceof PsOperator)).toBeTrue();
      expect(instrs.map(n => n.op)).toEqual([TOKEN.add, TOKEN.mul, TOKEN.sub]);
    });

    it("parses { } if", function () {
      const prog = parsePostScriptFunction("{ 0.5 gt { pop 1 } if }");
      const ifNode = prog.body.instructions.at(-1);
      expect(ifNode).toBeInstanceOf(PsIf);
      expect(ifNode.then).toBeInstanceOf(PsBlock);
    });

    it("parses { } { } ifelse", function () {
      const prog = parsePostScriptFunction(
        "{ 0.5 gt { 2 mul } { 0.5 mul } ifelse }"
      );
      const ifelse = prog.body.instructions.at(-1);
      expect(ifelse).toBeInstanceOf(PsIfElse);
      expect(ifelse.then.instructions[0].value).toBeCloseTo(2);
      expect(ifelse.otherwise.instructions[0].value).toBeCloseTo(0.5);
    });

    it("throws on standalone if without preceding block", function () {
      const parser = new Parser(new Lexer("{ 1 if }"));
      expect(() => parser.parse()).toThrow();
    });

    it("ignores content after closing brace (warns, does not throw)", function () {
      const parser = new Parser(new Lexer("{ add } add"));
      expect(() => parser.parse()).not.toThrow();
    });

    it("throws when first token is not a left brace", function () {
      expect(() => parsePostScriptFunction("add }")).toThrow();
    });

    it("throws when a procedure block is not followed by if or ifelse", function () {
      expect(() => parsePostScriptFunction("{ { 1 } add }")).toThrow();
    });
  });

  describe("PostScript Type 4 Wasm compiler", function () {
    /**
     * Compile and instantiate a PostScript Type 4 function, then call it.
     * Returns null if Wasm compilation returns null (unsupported program).
     * For single-output functions returns a scalar; for multi-output an Array.
     *
     * Validates three implementations against each other:
     *   - Wasm compiler (PSStackToTree → Wasm binary)
     *   - JS IR compiler (PSStackToTree → flat IR interpreted in JS)
     *   - Direct program interpreter (raw PsProgram stack-machine interpreter)
     */
    function compileAndRun(src, domain, range, args) {
      const wasmFn = buildPostScriptWasmFunction(src, domain, range);
      // jsFn now always returns a function: PSStackToTree IR when possible,
      // direct program interpreter otherwise.
      const jsFn = buildPostScriptJsFunction(src, domain, range);
      // Direct interpreter: always available, never uses PSStackToTree.
      const interpFn = buildPostScriptJsFunction(
        src,
        domain,
        range,
        /* forceInterpreter = */ true
      );

      if (!wasmFn) {
        return null;
      }

      const nOut = range.length >> 1;
      const srcBuf = new Float64Array(args);
      const wasmDest = new Float64Array(nOut);
      const jsDest = new Float64Array(nOut);
      const interpDest = new Float64Array(nOut);
      wasmFn(srcBuf, 0, wasmDest, 0);
      jsFn(srcBuf, 0, jsDest, 0);
      interpFn(srcBuf, 0, interpDest, 0);
      for (let i = 0; i < nOut; i++) {
        expect(jsDest[i]).toBeCloseTo(wasmDest[i], 10);
        expect(interpDest[i]).toBeCloseTo(wasmDest[i], 10);
      }
      return nOut === 1 ? wasmDest[0] : Array.from(wasmDest);
    }

    function readULEB128(bytes, offset) {
      let value = 0;
      let shift = 0;
      let pos = offset;
      while (true) {
        const byte = bytes[pos++];
        value |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) {
          return { value, offset: pos };
        }
        shift += 7;
      }
    }

    function getWasmLocalCount(bytes) {
      let offset = 8; // magic + version
      while (offset < bytes.length) {
        const sectionId = bytes[offset++];
        const size = readULEB128(bytes, offset);
        offset = size.offset;
        const sectionStart = offset;
        const sectionEnd = sectionStart + size.value;

        if (sectionId === 0x0a) {
          const fnCount = readULEB128(bytes, offset);
          expect(fnCount.value).toBe(1);
          offset = fnCount.offset;

          const bodySize = readULEB128(bytes, offset);
          offset = bodySize.offset;

          const localDeclCount = readULEB128(bytes, offset);
          offset = localDeclCount.offset;

          let totalLocals = 0;
          for (let i = 0; i < localDeclCount.value; i++) {
            const count = readULEB128(bytes, offset);
            offset = count.offset + 1; // skip value type
            totalLocals += count.value;
          }
          return totalLocals;
        }

        offset = sectionEnd;
      }
      throw new Error("Wasm code section not found.");
    }

    it("compiles add", async function () {
      const r = compileAndRun("{ add }", [0, 1, 0, 1], [0, 2], [0.3, 0.7]);
      expect(r).toBeCloseTo(1.0, 9);
    });

    it("compiles sub", async function () {
      const r = compileAndRun("{ sub }", [0, 1, 0, 1], [0, 1], [0.8, 0.3]);
      expect(r).toBeCloseTo(0.5, 9);
    });

    it("compiles mul", async function () {
      const r = compileAndRun("{ 0.5 mul }", [0, 1], [0, 1], [0.4]);
      expect(r).toBeCloseTo(0.2, 9);
    });

    it("compiles div", async function () {
      const r = compileAndRun("{ div }", [0, 10, 0, 10], [0, 10], [6, 3]);
      expect(r).toBeCloseTo(2, 9);
    });

    it("div by zero returns 0", async function () {
      const r = compileAndRun("{ div }", [0, 10, 0, 10], [0, 10], [5, 0]);
      expect(r).toBe(0);
    });

    it("compiles idiv", async function () {
      const r = compileAndRun("{ idiv }", [0, 10, 1, 10], [0, 10], [7, 2]);
      expect(r).toBeCloseTo(3, 9);
    });

    it("idiv by zero returns 0", async function () {
      const r = compileAndRun("{ idiv }", [0, 10, 0, 10], [0, 10], [5, 0]);
      expect(r).toBe(0);
    });

    it("compiles mod", async function () {
      const r = compileAndRun("{ mod }", [0, 10, 1, 10], [0, 10], [7, 3]);
      expect(r).toBeCloseTo(1, 9);
    });

    it("mod by zero returns 0", async function () {
      const r = compileAndRun("{ mod }", [0, 10, 0, 10], [0, 10], [5, 0]);
      expect(r).toBe(0);
    });

    it("compiles mod with constant divisor", async function () {
      // { 3 mod } — divisor is a compile-time constant, exercises the
      // constant-divisor branch in _compileModNode.
      const r = compileAndRun("{ 3 mod }", [0, 10], [0, 3], [7]);
      expect(r).toBeCloseTo(1, 9); // 7 mod 3 = 1
    });

    it("compiles integer xor (bitwise)", async function () {
      // { 5 xor } with an integer-typed arg — exercises the non-boolean path in
      // _compileBitwiseOperandI32 and the xor case in _compileBitwiseNode.
      const r = compileAndRun("{ 5 xor }", [-128, 127], [-128, 127], [3]);
      expect(r).toBeCloseTo(6, 9); // 3 XOR 5 = 6
    });

    it("compiles neg", async function () {
      // neg applied to a variable — the optimizer cannot fold this.
      // abs(neg(x)) is optimized to abs(x), so test neg alone.
      const r = compileAndRun("{ neg }", [-1, 1], [-1, 1], [-0.5]);
      expect(r).toBeCloseTo(0.5, 9);
    });

    it("compiles neg and abs", async function () {
      const r = compileAndRun("{ neg abs }", [-1, 1], [0, 1], [-0.8]);
      expect(r).toBeCloseTo(0.8, 9);
    });

    it("compiles cvi (truncate to integer)", async function () {
      const r = compileAndRun("{ 1.7 add cvi }", [0, 2], [0, 4], [0.5]);
      expect(r).toBeCloseTo(2, 9); // trunc(0.5 + 1.7) = trunc(2.2) = 2
    });

    it("compiles cvr (identity on reals)", async function () {
      const r = compileAndRun("{ cvr }", [0, 1], [0, 1], [0.7]);
      expect(r).toBeCloseTo(0.7, 9);
    });

    it("compiles sqrt", async function () {
      const r = compileAndRun("{ sqrt }", [0, 100], [0, 10], [9]);
      expect(r).toBeCloseTo(3, 9);
    });

    it("compiles floor", async function () {
      const r = compileAndRun("{ floor }", [-2, 2], [-2, 2], [1.7]);
      expect(r).toBeCloseTo(1, 9);
    });

    it("compiles ceiling", async function () {
      const r = compileAndRun("{ ceiling }", [-2, 2], [-2, 2], [1.2]);
      expect(r).toBeCloseTo(2, 9);
    });

    it("compiles round", async function () {
      const r = compileAndRun("{ round }", [-2, 2], [-2, 2], [1.5]);
      expect(r).toBeCloseTo(2, 9);
    });

    it("round uses round-half-up (0.5 rounds to 1, -0.5 rounds to 0)", async function () {
      const r1 = compileAndRun("{ round }", [-2, 2], [-2, 2], [0.5]);
      expect(r1).toBe(1);
      const r2 = compileAndRun("{ round }", [-2, 2], [-2, 2], [-0.5]);
      expect(r2).toBe(0);
    });

    it("compiles truncate", async function () {
      const r = compileAndRun("{ truncate }", [-2, 2], [-2, 2], [-1.9]);
      expect(r).toBeCloseTo(-1, 9);
    });

    it("compiles ln", async function () {
      const r = compileAndRun("{ ln }", [0.001, 10], [-10, 10], [Math.E]);
      expect(r).toBeCloseTo(1, 9);
    });

    it("compiles log (base 10)", async function () {
      const r = compileAndRun("{ log }", [0.001, 1000], [-3, 3], [100]);
      expect(r).toBeCloseTo(2, 9);
    });

    it("compiles exp (base ^ exponent)", async function () {
      const r = compileAndRun("{ exp }", [0, 10, 0, 10], [0, 2000], [2, 10]);
      expect(r).toBeCloseTo(1024, 6);
    });

    it("compiles x ^ -1 → 1/x (strength reduction)", async function () {
      const r = compileAndRun("{ -1 exp }", [0.1, 10], [0.1, 10], [2]);
      expect(r).toBeCloseTo(0.5, 9); // 1/2 = 0.5
    });

    it("compiles x ^ 3 → (x*x)*x (strength reduction)", async function () {
      const r = compileAndRun("{ 3 exp }", [0, 10], [0, 1000], [2]);
      expect(r).toBeCloseTo(8, 9); // 2^3 = 8
    });

    it("compiles x ^ 4 → (x*x)*(x*x) (strength reduction)", async function () {
      // x^4 uses CSE: x*x is computed once and squared — exercises the
      // local_tee/local_get path in _compileStandardBinaryNode.
      const r = compileAndRun("{ 4 exp }", [0, 10], [0, 10000], [2]);
      expect(r).toBeCloseTo(16, 9); // 2^4 = 16
    });

    it("compiles sin (degrees)", async function () {
      const r = compileAndRun("{ sin }", [-360, 360], [-1, 1], [90]);
      expect(r).toBeCloseTo(1, TRIGONOMETRY_EPS);
    });

    it("compiles cos (degrees)", async function () {
      const r = compileAndRun("{ cos }", [-360, 360], [-1, 1], [0]);
      expect(r).toBeCloseTo(1, TRIGONOMETRY_EPS);
    });

    it("sin(360) = 0 — boundary normalizes mod 360", function () {
      const r = compileAndRun("{ sin }", [0, 360], [-1, 1], [360]);
      expect(r).toBe(0);
    });

    it("cos(360) = 1 — boundary normalizes mod 360", function () {
      const r = compileAndRun("{ cos }", [0, 360], [-1, 1], [360]);
      expect(r).toBe(1);
    });

    it("compiles atan (degrees, result in [0,360))", async function () {
      // atan(1, 1) = 45°
      const r = compileAndRun("{ atan }", [-10, 10, -10, 10], [0, 360], [1, 1]);
      expect(r).toBeCloseTo(45, 6);
    });

    it("atan normalizes negative angles to [0,360)", async function () {
      // atan(-1, 1) would be -45°, should become 315°
      const r = compileAndRun(
        "{ atan }",
        [-10, 10, -10, 10],
        [0, 360],
        [-1, 1]
      );
      expect(r).toBeCloseTo(315, 6);
    });

    it("compiles dup", async function () {
      const r = compileAndRun("{ dup mul }", [0, 1], [0, 1], [0.5]);
      expect(r).toBeCloseTo(0.25, 9);
    });

    it("compiles exch", async function () {
      const r = compileAndRun("{ exch div }", [0, 10, 0, 10], [0, 10], [1, 2]);
      expect(r).toBeCloseTo(2, 9); // 2 / 1
    });

    it("compiles pop", async function () {
      const r = compileAndRun("{ pop }", [0, 1, 0, 1], [0, 1], [0.3, 0.7]);
      expect(r).toBeCloseTo(0.3, 9); // 0.7 popped, 0.3 remains
    });

    it("compiles copy", async function () {
      // { 1 copy add }: one input a → stack [a, a] → add → [2a]
      const r = compileAndRun("{ 1 copy add }", [0, 1], [0, 2], [0.4]);
      expect(r).toBeCloseTo(0.8, 9);
    });

    it("compiles index", function () {
      // { 1 index add }: inputs (a, b) → [a, b, a] → add → [a, a+b]
      const fn = buildPostScriptWasmFunction(
        "{ 1 index add }",
        [0, 1, 0, 1],
        [0, 1, 0, 2]
      );
      const src = new Float64Array([0.3, 0.7]);
      const dest = new Float64Array(2);
      fn(src, 0, dest, 0);
      expect(dest[0]).toBeCloseTo(0.3, 9); // a unchanged
      expect(dest[1]).toBeCloseTo(1.0, 9); // a + b
    });

    it("compiles roll", function () {
      // { 2 1 roll }: inputs (a, b) → positive j moves bottom to top → (b, a)
      const fn = buildPostScriptWasmFunction(
        "{ 2 1 roll }",
        [0, 1, 0, 1],
        [0, 1, 0, 1]
      );
      const src = new Float64Array([0.3, 0.7]);
      const dest = new Float64Array(2);
      fn(src, 0, dest, 0);
      expect(dest[0]).toBeCloseTo(0.7, 9); // b is now at bottom
      expect(dest[1]).toBeCloseTo(0.3, 9); // a is now on top
    });

    it("compiles roll with more than two values", function () {
      const fn = buildPostScriptWasmFunction(
        "{ 3 1 roll }",
        [0, 1, 0, 1, 0, 1],
        [0, 1, 0, 1, 0, 1]
      );
      const src = new Float64Array([0.1, 0.2, 0.3]);
      const dest = new Float64Array(3);
      fn(src, 0, dest, 0);
      expect(dest[0]).toBeCloseTo(0.3, 9);
      expect(dest[1]).toBeCloseTo(0.1, 9);
      expect(dest[2]).toBeCloseTo(0.2, 9);
    });

    it("compiles 3-output function", function () {
      const fn = buildPostScriptWasmFunction(
        "{ dup dup }",
        [0, 1],
        [0, 1, 0, 1, 0, 1]
      );
      const src = new Float64Array([0.5]);
      const dest = new Float64Array(3);
      fn(src, 0, dest, 0);
      expect(dest[0]).toBeCloseTo(0.5, 9);
      expect(dest[1]).toBeCloseTo(0.5, 9);
      expect(dest[2]).toBeCloseTo(0.5, 9);
    });

    it("compiles 4-output function", function () {
      const fn = buildPostScriptWasmFunction(
        "{ dup dup dup }",
        [0, 1],
        [0, 1, 0, 1, 0, 1, 0, 1]
      );
      const src = new Float64Array([0.5]);
      const dest = new Float64Array(4);
      fn(src, 0, dest, 0);
      for (let i = 0; i < 4; i++) {
        expect(dest[i]).toBeCloseTo(0.5, 9);
      }
    });

    it("compiles 5-output function (default writer path)", function () {
      const fn = buildPostScriptWasmFunction(
        "{ dup dup dup dup }",
        [0, 1],
        [0, 1, 0, 1, 0, 1, 0, 1, 0, 1]
      );
      const src = new Float64Array([0.5]);
      const dest = new Float64Array(5);
      fn(src, 0, dest, 0);
      for (let i = 0; i < 5; i++) {
        expect(dest[i]).toBeCloseTo(0.5, 9);
      }
    });

    it("compiles 3-input function", async function () {
      const r = compileAndRun(
        "{ add add }",
        [0, 1, 0, 1, 0, 1],
        [0, 3],
        [0.3, 0.3, 0.4]
      );
      expect(r).toBeCloseTo(1.0, 9);
    });

    it("compiles 4-input function", async function () {
      const r = compileAndRun(
        "{ add add add }",
        [0, 1, 0, 1, 0, 1, 0, 1],
        [0, 4],
        [0.25, 0.25, 0.25, 0.25]
      );
      expect(r).toBeCloseTo(1.0, 9);
    });

    it("compiles 5-input function (default caller path)", async function () {
      const r = compileAndRun(
        "{ add add add add }",
        [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
        [0, 5],
        [0.2, 0.2, 0.2, 0.2, 0.2]
      );
      expect(r).toBeCloseTo(1.0, 9);
    });

    it("compiles eq", async function () {
      const r = compileAndRun("{ eq }", [0, 1, 0, 1], [0, 1], [0.5, 0.5]);
      expect(r).toBeCloseTo(1, 9);
    });

    it("compiles ne (not-equal)", async function () {
      const r = compileAndRun("{ 0.5 ne }", [0, 1], [0, 1], [0.3]);
      expect(r).toBeCloseTo(1, 9); // 0.3 ≠ 0.5 → true → 1
    });

    it("compiles lt (less-than)", async function () {
      const r = compileAndRun("{ 0.5 lt }", [0, 1], [0, 1], [0.3]);
      expect(r).toBeCloseTo(1, 9); // 0.3 < 0.5 → true → 1
    });

    it("compiles ge (greater-or-equal)", async function () {
      const r = compileAndRun("{ 0.5 ge }", [0, 1], [0, 1], [0.7]);
      expect(r).toBeCloseTo(1, 9); // 0.7 ≥ 0.5 → true → 1
    });

    it("compiles gt", async function () {
      const r = compileAndRun("{ gt }", [0, 1, 0, 1], [0, 1], [0.8, 0.3]);
      expect(r).toBeCloseTo(1, 9);
    });

    it("compiles le", async function () {
      const r = compileAndRun("{ le }", [0, 1, 0, 1], [0, 1], [0.3, 0.8]);
      expect(r).toBeCloseTo(1, 9);
    });

    it("compiles true and false literals", async function () {
      const t = compileAndRun("{ true }", [], [0, 1], []);
      const f = compileAndRun("{ false }", [], [0, 1], []);
      expect(t).toBeCloseTo(1, 9);
      expect(f).toBeCloseTo(0, 9);
    });

    it("compiles ifelse — true branch taken", async function () {
      const r = compileAndRun(
        "{ dup 0.5 gt { 2 mul } { 0.5 mul } ifelse }",
        [0, 1],
        [0, 2],
        [0.8]
      );
      expect(r).toBeCloseTo(1.6, 9);
    });

    it("compiles ifelse — false branch taken", async function () {
      const r = compileAndRun(
        "{ dup 0.5 gt { 2 mul } { 0.5 mul } ifelse }",
        [0, 1],
        [0, 2],
        [0.2]
      );
      expect(r).toBeCloseTo(0.1, 9);
    });

    it("compiles if — condition true", async function () {
      // { dup 1 gt { pop 1 } if } — clamp x to 1 from above
      const r = compileAndRun(
        "{ dup 1 gt { pop 1 } if }",
        [0, 2],
        [0, 2],
        [1.5]
      );
      expect(r).toBeCloseTo(1, 9);
    });

    it("compiles if — condition false", async function () {
      const r = compileAndRun(
        "{ dup 1 gt { pop 1 } if }",
        [0, 2],
        [0, 2],
        [0.5]
      );
      expect(r).toBeCloseTo(0.5, 9);
    });

    it("compiles stack-growing if — early-exit guard, guard fires", function () {
      // { dup 0 le { pop 0.2 0.8 0 } if  0 gt { 0.3 0.7 } if }
      // in0 = -0.5 (≤ 0): early-exit guard fires → outputs (0.2, 0.8)
      const r = compileAndRun(
        "{ dup 0 le { pop 0.2 0.8 0 } if  0 gt { 0.3 0.7 } if }",
        [-1, 1],
        [0, 1, 0, 1],
        [-0.5]
      );
      expect(r[0]).toBeCloseTo(0.2, 9);
      expect(r[1]).toBeCloseTo(0.8, 9);
    });

    it("compiles stack-growing if — early-exit guard, guard does not fire", function () {
      // { dup 0 le { pop 0.2 0.8 0 } if  0 gt { 0.3 0.7 } if }
      // in0 = 0.5 (> 0): guard doesn't fire; final default fires → (0.3, 0.7)
      const r = compileAndRun(
        "{ dup 0 le { pop 0.2 0.8 0 } if  0 gt { 0.3 0.7 } if }",
        [-1, 1],
        [0, 1, 0, 1],
        [0.5]
      );
      expect(r[0]).toBeCloseTo(0.3, 9);
      expect(r[1]).toBeCloseTo(0.7, 9);
    });

    it("clamps output to declared range", async function () {
      // mul exceeds range [0, 0.5] → result clamped
      const r = compileAndRun("{ add }", [0, 1, 0, 1], [0, 0.5], [0.4, 0.4]);
      expect(r).toBeCloseTo(0.5, 9);
    });

    it("compiles bitshift left (literal shift)", async function () {
      const r = compileAndRun("{ 3 bitshift }", [0, 256], [0, 256], [1]);
      expect(r).toBeCloseTo(8, 9); // 1 << 3
    });

    it("compiles bitshift right (negative literal shift)", async function () {
      const r = compileAndRun("{ -2 bitshift }", [-256, 256], [-256, 256], [8]);
      expect(r).toBeCloseTo(2, 9); // 8 >> 2
    });

    it("compiles large shift amount (exercises multi-byte LEB128 in _emitULEB128)", async function () {
      // Shift amount 128 encodes as two LEB128 bytes — exercises the
      // b |= 0x80 branch in _emitULEB128.
      // Wasm i32.shl uses shift % 32, so 128 % 32 = 0 →
      // left-shift by 0 = identity.
      const r = compileAndRun(
        "{ 128 bitshift }",
        [-1000, 1000],
        [-1000, 1000],
        [1]
      );
      expect(r).toBeCloseTo(1, 9);
    });

    it("compiles long function body (exercises multi-byte LEB128 in unsignedLEB128)", async function () {
      // 13 repeated { 1 add } iterations produce a code body > 127 bytes,
      // causing funcBodyLen to require a two-byte LEB128 encoding and
      // exercising the byte |= 0x80 branch in unsignedLEB128.
      const src =
        "{ 1 add 1 add 1 add 1 add 1 add 1 add 1 add 1 add 1 add 1 add 1 add 1 add 1 add }";
      const r = compileAndRun(src, [0, 1], [0, 14], [0]);
      expect(r).toBeCloseTo(13, 9);
    });

    it("returns null for programs with roll (non-literal args)", function () {
      const fn = buildPostScriptWasmFunction(
        "{ roll }",
        [0, 1, 0, 1],
        [0, 1, 0, 1]
      );
      expect(fn).toBeNull();
    });

    it("returns null from the sync builder when compilation fails", function () {
      const fn = buildPostScriptWasmFunction(
        "{ roll }",
        [0, 1, 0, 1],
        [0, 1, 0, 1]
      );
      expect(fn).toBeNull();
    });

    it("compiles boolean not (logical NOT)", async function () {
      // 0.5 0.5 eq → true (1.0); not → false (0.0)
      const r = compileAndRun("{ dup eq not }", [0, 1], [0, 1], [0.5]);
      expect(r).toBeCloseTo(0, 9);
    });

    it("compiles integer not (bitwise NOT)", async function () {
      // ~5 = -6
      const r = compileAndRun("{ not }", [-256, 256], [-256, 256], [5]);
      expect(r).toBeCloseTo(-6, 9);
    });

    // _compileNodeAsBoolI32 — ternary condition optimizations.

    it("ifelse with comparison condition (true branch)", async function () {
      // x > 0.5: comparison emitted directly as i32, no f64 round-trip.
      const r = compileAndRun(
        "{ 0.5 gt { 1 } { 0 } ifelse }",
        [0, 1],
        [0, 1],
        [0.7]
      );
      expect(r).toBeCloseTo(1, 9);
    });

    it("ifelse with comparison condition (false branch)", async function () {
      const r = compileAndRun(
        "{ 0.5 gt { 1 } { 0 } ifelse }",
        [0, 1],
        [0, 1],
        [0.3]
      );
      expect(r).toBeCloseTo(0, 9);
    });

    it("ifelse with boolean-and condition", async function () {
      // not(comparison) → negated comparison is already handled by the
      // optimizer; this test uses an and of two comparisons so the condition
      // node is a PsBinaryNode(and) — exercises the i32_trunc_f64_s fallback
      // in _compileNodeAsBoolI32.
      const src = "{ dup 0.3 gt exch 0.7 lt and { 1 } { 0 } ifelse }";
      const r0 = compileAndRun(src, [0, 1], [0, 1], [0.5]);
      expect(r0).toBeCloseTo(1, 9); // 0.5 in (0.3, 0.7)
      const r1 = compileAndRun(src, [0, 1], [0, 1], [0.2]);
      expect(r1).toBeCloseTo(0, 9); // 0.2 outside range
    });

    it("ifelse with not(boolean-and) condition", async function () {
      // not(and(two comparisons)) — exercises the boolean `not` path in
      // _compileNodeAsBoolI32 (recursive call + i32.eqz).
      const src = "{ dup 0.3 gt exch 0.7 lt and not { 1 } { 0 } ifelse }";
      const r0 = compileAndRun(src, [0, 1], [0, 1], [0.5]);
      expect(r0).toBeCloseTo(0, 9); // 0.5 in (0.3, 0.7) → not → false
      const r1 = compileAndRun(src, [0, 1], [0, 1], [0.2]);
      expect(r1).toBeCloseTo(1, 9); // 0.2 outside range → not → true
    });

    // _compileBitwiseNode boolean-operand optimizations.

    it("boolean-and of two comparisons as standalone output", async function () {
      // and(x>0.3, x<0.7) used as the direct output (not as ternary condition)
      // — exercises _compileBitwiseOperandI32 with boolean operands.
      const src = "{ dup 0.3 gt exch 0.7 lt and }";
      const r0 = compileAndRun(src, [0, 1], [0, 1], [0.5]);
      expect(r0).toBeCloseTo(1, 9);
      const r1 = compileAndRun(src, [0, 1], [0, 1], [0.2]);
      expect(r1).toBeCloseTo(0, 9);
    });

    it("boolean-or of two comparisons as standalone output", async function () {
      // or(x<0.3, x>0.7): true when x is outside [0.3, 0.7].
      const src = "{ dup 0.3 lt exch 0.7 gt or }";
      const r0 = compileAndRun(src, [0, 1], [0, 1], [0.2]);
      expect(r0).toBeCloseTo(1, 9);
      const r1 = compileAndRun(src, [0, 1], [0, 1], [0.5]);
      expect(r1).toBeCloseTo(0, 9);
    });

    it("not(boolean-and) as standalone output", async function () {
      // not(and(cmp1, cmp2)): exercises _compileUnaryNode(not, boolean) using
      // _compileNodeAsBoolI32 for the operand, eliminating all f64/i32
      // round-trips.
      const src = "{ dup 0.3 gt exch 0.7 lt and not }";
      const r0 = compileAndRun(src, [0, 1], [0, 1], [0.5]);
      expect(r0).toBeCloseTo(0, 9); // inside → and=true → not=false
      const r1 = compileAndRun(src, [0, 1], [0, 1], [0.2]);
      expect(r1).toBeCloseTo(1, 9); // outside → and=false → not=true
    });

    it("nested ifelse with comparison conditions", async function () {
      // Three-way branch: x < 0.3 → 0, x > 0.7 → 1, else 0.5.
      // Each ternary condition goes through _compileNodeAsBoolI32.
      const src =
        "{ dup 0.3 lt { pop 0 } { dup 0.7 gt { pop 1 } { pop 0.5 } ifelse } ifelse }";
      const r0 = compileAndRun(src, [0, 1], [0, 1], [0.1]);
      expect(r0).toBeCloseTo(0, 9);
      const r1 = compileAndRun(src, [0, 1], [0, 1], [0.9]);
      expect(r1).toBeCloseTo(1, 9);
      const r2 = compileAndRun(src, [0, 1], [0, 1], [0.5]);
      expect(r2).toBeCloseTo(0.5, 9);
    });

    it("ifelse with boolean-or condition", async function () {
      // or(x<0.3, x>0.7) as ternary condition — exercises the TOKEN.or case
      // in the boolean and/or/xor branch of _compileNodeAsBoolI32.
      const src = "{ dup 0.3 lt exch 0.7 gt or { 1 } { 0 } ifelse }";
      const r0 = compileAndRun(src, [0, 1], [0, 1], [0.2]);
      expect(r0).toBeCloseTo(1, 9); // 0.2 < 0.3 → true
      const r1 = compileAndRun(src, [0, 1], [0, 1], [0.5]);
      expect(r1).toBeCloseTo(0, 9); // 0.5 inside → false
    });

    it("ifelse with boolean-xor condition", async function () {
      // xor(x<0.5, x>0.3) as ternary condition — exercises TOKEN.xor in
      // _compileNodeAsBoolI32; true when exactly one condition holds.
      const src = "{ dup 0.5 lt exch 0.3 gt xor { 1 } { 0 } ifelse }";
      // x=0.4: 0.4<0.5=true, 0.4>0.3=true → xor=false → 0
      const r0 = compileAndRun(src, [0, 1], [0, 1], [0.4]);
      expect(r0).toBeCloseTo(0, 9);
      // x=0.2: 0.2<0.5=true, 0.2>0.3=false → xor=true → 1
      const r1 = compileAndRun(src, [0, 1], [0, 1], [0.2]);
      expect(r1).toBeCloseTo(1, 9);
    });

    it("ifelse with numeric condition (fallback _compileNodeAsBoolI32 path)", async function () {
      // The condition is the raw input arg (numeric, not boolean), so
      // _compileNodeAsBoolI32 falls through to the general path and emits
      // f64.const 0 / f64.ne to convert to i32.
      const r0 = compileAndRun("{ { 1 } { 0 } ifelse }", [0, 1], [0, 1], [0.7]);
      expect(r0).toBeCloseTo(1, 9); // 0.7 ≠ 0 → truthy → 1
      const r1 = compileAndRun("{ { 1 } { 0 } ifelse }", [0, 1], [0, 1], [0]);
      expect(r1).toBeCloseTo(0, 9); // 0 → falsy → 0
    });

    // _compileStandardBinaryNode shared-operand CSE.

    it("shared non-trivial operand uses local_tee (x+1)^2", async function () {
      // (x+1)^2: the x^2→x*x strength reduction creates PsBinaryNode(mul,
      // add_node, add_node) where add_node is non-trivial — exercises the
      // local_tee/local_get path in _compileStandardBinaryNode.
      const r = compileAndRun("{ 1 add 2 exp }", [0, 10], [0, 100], [3]);
      expect(r).toBeCloseTo(16, 9); // (3+1)^2 = 16
    });

    it("shared non-trivial operand uses local_tee (x+2)^2 via dup", async function () {
      // `2 add dup mul`: dup of the add node gives PsBinaryNode(mul, add, add)
      // with the same reference twice — exercises the local_tee/local_get path.
      const r = compileAndRun("{ 2 add dup mul }", [0, 10], [0, 100], [3]);
      expect(r).toBeCloseTo(25, 9); // (3+2)^2 = 25
    });

    it("compiles x^3 without changing behavior", async function () {
      const r = compileAndRun("{ 3 exp }", [0, 10], [0, 1000], [2]);
      expect(r).toBeCloseTo(8, 9);
    });

    it("compiles x^4 without changing behavior", async function () {
      const r = compileAndRun("{ 4 exp }", [0, 10], [0, 10000], [2]);
      expect(r).toBeCloseTo(16, 9);
    });

    it("compiles x^-1 without changing behavior", async function () {
      const r = compileAndRun("{ -1 exp }", [1, 10], [0, 1], [4]);
      expect(r).toBeCloseTo(0.25, 9);
    });

    it("CSE: shared subexpression compiled once, correct result, one local", async function () {
      // { 3 add dup mul } → (x+3)^2.  The "x+3" node is shared (dup), so CSE
      // caches it in one local that is released and reused for later operands.
      const source = "{ 3 add dup mul }";
      const bytes = compilePostScriptToWasm(source, [0, 10], [0, 169]);
      expect(bytes).not.toBeNull();
      expect(getWasmLocalCount(bytes)).toBe(1);
      // x=2 → (2+3)^2 = 25
      const r = await compileAndRun(source, [0, 10], [0, 169], [2]);
      expect(r).toBeCloseTo(25, 9);
    });

    it("reuses temporary locals across sequential shared-subexpression codegen", function () {
      const bytes = compilePostScriptToWasm(
        "{ dup 1 add dup mul exch 2 add dup mul add }",
        [0, 10],
        [0, 1000]
      );
      expect(bytes).not.toBeNull();
      expect(getWasmLocalCount(bytes)).toBe(1);
    });

    it("reuses temporary locals across sequential mod codegen", function () {
      const bytes = compilePostScriptToWasm(
        "{ 3 mod exch 5 mod add }",
        [0, 10, 0, 10],
        [0, 100]
      );
      expect(bytes).not.toBeNull();
      expect(getWasmLocalCount(bytes)).toBe(1);
    });

    it("reuses temporary locals across sequential atan codegen", function () {
      const bytes = compilePostScriptToWasm(
        "{ atan 3 1 roll atan }",
        [0, 10, 0, 10, 0, 10, 0, 10],
        [0, 360, 0, 360]
      );
      expect(bytes).not.toBeNull();
      expect(getWasmLocalCount(bytes)).toBe(1);
    });

    it("compiles x^0.25 → sqrt(sqrt(x))", async function () {
      const r = compileAndRun("{ 0.25 exp }", [0, 16], [0, 2], [16]);
      expect(r).toBeCloseTo(2, 9); // 16^0.25 = 2
    });

    it("compiles neg(a − b) → b − a", async function () {
      // neg(x - 3) = 3 - x; at x=1 → 2
      const r = compileAndRun("{ 3 sub neg }", [0, 10], [0, 10], [1]);
      expect(r).toBeCloseTo(2, 9);
    });

    it("compiles min(max(x, 0.8), 0.5) → constant 0.5", async function () {
      // Absorption: max result always >= 0.8 > 0.5, so min is always 0.5.
      const r = compileAndRun(
        "{ dup 0.8 lt { pop 0.8 } { } ifelse " +
          "dup 0.5 gt { pop 0.5 } { } ifelse }",
        [0, 1],
        [0, 1],
        [0.3]
      );
      expect(r).toBeCloseTo(0.5, 9);
    });

    it("min/max fold: upper clamp emits f64.min", async function () {
      // x > 1 → clamp to 1; x ≤ 1 → pass through.
      const r1 = compileAndRun(
        "{ dup 1 gt { pop 1 } { } ifelse }",
        [0, 2],
        [0, 2],
        [2]
      );
      expect(r1).toBeCloseTo(1, 9);
      const r2 = compileAndRun(
        "{ dup 1 gt { pop 1 } { } ifelse }",
        [0, 2],
        [0, 2],
        [0.5]
      );
      expect(r2).toBeCloseTo(0.5, 9);
    });

    it("min/max fold: lower clamp emits f64.max", async function () {
      // x < 0 → clamp to 0; x ≥ 0 → pass through.
      const r1 = compileAndRun(
        "{ dup 0 lt { pop 0 } { } ifelse }",
        [-1, 1],
        [0, 1],
        [-0.5]
      );
      expect(r1).toBeCloseTo(0, 9);
      const r2 = compileAndRun(
        "{ dup 0 lt { pop 0 } { } ifelse }",
        [-1, 1],
        [0, 1],
        [0.5]
      );
      expect(r2).toBeCloseTo(0.5, 9);
    });
  });

  describe("PSStackToTree", function () {
    /** Parse and convert to tree, returning the output node array. */
    function toTree(src, numInputs) {
      const prog = parsePostScriptFunction(src);
      return new PSStackToTree().evaluate(prog, numInputs);
    }

    it("wraps inputs in PsArgNodes", function () {
      // { } with 2 inputs — outputs are the two unmodified args
      const out = toTree("{ }", 2);
      expect(out.length).toBe(2);
      expect(out[0]).toBeInstanceOf(PsArgNode);
      expect(out[0].index).toBe(0);
      expect(out[1]).toBeInstanceOf(PsArgNode);
      expect(out[1].index).toBe(1);
    });

    it("wraps number literals in PsConstNode", function () {
      const out = toTree("{ 42 }", 0);
      expect(out.length).toBe(1);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBe(42);
    });

    it("produces a binary node for add", function () {
      // { add } with 2 inputs → PsBinaryNode(add, in1, in0)
      //   first (top)    = in1 (index 1)
      //   second (below) = in0 (index 0)
      const out = toTree("{ add }", 2);
      expect(out.length).toBe(1);
      const node = out[0];
      expect(node).toBeInstanceOf(PsBinaryNode);
      expect(node.op).toBe(TOKEN.add);
      expect(node.first).toBeInstanceOf(PsArgNode);
      expect(node.first.index).toBe(1);
      expect(node.second).toBeInstanceOf(PsArgNode);
      expect(node.second.index).toBe(0);
    });

    it("respects operand order for non-commutative sub", function () {
      // { sub } with inputs in0 in1 → second=in0, first=in1 → result in0−in1
      const out = toTree("{ sub }", 2);
      const node = out[0];
      expect(node).toBeInstanceOf(PsBinaryNode);
      expect(node.op).toBe(TOKEN.sub);
      expect(node.second.index).toBe(0); // minuend
      expect(node.first.index).toBe(1); // subtrahend
    });

    it("produces a unary node for neg", function () {
      const out = toTree("{ neg }", 1);
      expect(out.length).toBe(1);
      const node = out[0];
      expect(node).toBeInstanceOf(PsUnaryNode);
      expect(node.op).toBe(TOKEN.neg);
      expect(node.operand).toBeInstanceOf(PsArgNode);
      expect(node.operand.index).toBe(0);
    });

    it("chains operations — example from spec: in1 in2 dup add mul", function () {
      // Inputs: in0, in1 on stack.
      // { dup add mul }:
      //   dup → [in0, in1, in1]
      //   add → first=in1, second=in1  → addNode
      //   mul → first=addNode, second=in0 → mulNode
      const out = toTree("{ dup add mul }", 2);
      expect(out.length).toBe(1);
      const mul = out[0];
      expect(mul).toBeInstanceOf(PsBinaryNode);
      expect(mul.op).toBe(TOKEN.mul);
      // first (top at mul time) = result of add
      expect(mul.first).toBeInstanceOf(PsBinaryNode);
      expect(mul.first.op).toBe(TOKEN.add);
      expect(mul.first.first).toBeInstanceOf(PsArgNode);
      expect(mul.first.first.index).toBe(1);
      expect(mul.first.second).toBeInstanceOf(PsArgNode);
      expect(mul.first.second.index).toBe(1);
      // second (below at mul time) = in0
      expect(mul.second).toBeInstanceOf(PsArgNode);
      expect(mul.second.index).toBe(0);
    });

    it("dup shares the same node reference", function () {
      // { dup } with 1 input → two references to the same PsArgNode
      const out = toTree("{ dup }", 1);
      expect(out.length).toBe(2);
      expect(out[0]).toBe(out[1]);
    });

    it("exch swaps the top two nodes", function () {
      const out = toTree("{ exch }", 2);
      expect(out[0]).toBeInstanceOf(PsArgNode);
      expect(out[0].index).toBe(1); // former top is now at position 0
      expect(out[1]).toBeInstanceOf(PsArgNode);
      expect(out[1].index).toBe(0);
    });

    it("pop discards the top node", function () {
      const out = toTree("{ pop }", 2);
      expect(out.length).toBe(1);
      expect(out[0]).toBeInstanceOf(PsArgNode);
      expect(out[0].index).toBe(0);
    });

    it("true and false become PsConstNode", function () {
      const out = toTree("{ true false }", 0);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBe(true);
      expect(out[1]).toBeInstanceOf(PsConstNode);
      expect(out[1].value).toBe(false);
    });

    it("copy duplicates the top n nodes", function () {
      // { 2 copy } with 2 inputs → [in0, in1, in0, in1]
      const out = toTree("{ 2 copy }", 2);
      expect(out.length).toBe(4);
      expect(out[0]).toBe(out[2]);
      expect(out[1]).toBe(out[3]);
    });

    it("index copies the nth-from-top node", function () {
      // { 1 index } with 2 inputs → [in0, in1, in0]  (1 index = copy of in0)
      const out = toTree("{ 1 index }", 2);
      expect(out.length).toBe(3);
      expect(out[2]).toBe(out[0]);
    });

    it("roll rotates the window correctly (n=2, j=1)", function () {
      // { 2 1 roll } with 2 inputs → [in1, in0]  (top goes to bottom)
      const out = toTree("{ 2 1 roll }", 2);
      expect(out.length).toBe(2);
      expect(out[0].index).toBe(1); // former top
      expect(out[1].index).toBe(0); // former bottom
    });

    it("ifelse produces PsTernaryNode", function () {
      // { dup 0.5 gt { 2 mul } { 0.5 mul } ifelse } with 1 input
      const out = toTree("{ dup 0.5 gt { 2 mul } { 0.5 mul } ifelse }", 1);
      expect(out.length).toBe(1);
      const tern = out[0];
      expect(tern).toBeInstanceOf(PsTernaryNode);
      expect(tern.cond).toBeInstanceOf(PsBinaryNode);
      expect(tern.cond.op).toBe(TOKEN.gt);
      expect(tern.then).toBeInstanceOf(PsBinaryNode);
      expect(tern.then.op).toBe(TOKEN.mul);
      expect(tern.otherwise).toBeInstanceOf(PsBinaryNode);
      expect(tern.otherwise.op).toBe(TOKEN.mul);
    });

    it("if with clamp pattern folds to max (min/max optimization)", function () {
      // { dup 0 lt { pop 0 } if } with 1 input
      // cond = in0 < 0; then = 0; otherwise = in0
      // → _makeTernary folds to max(in0, 0) via ternary→min/max rule.
      const out = toTree("{ dup 0 lt { pop 0 } if }", 1);
      expect(out.length).toBe(1);
      const node = out[0];
      expect(node).toBeInstanceOf(PsBinaryNode);
      expect(node.op).toBe(TOKEN.max);
    });

    it("handles stack-growing if (guard / early-exit pattern)", function () {
      // { dup 0 le { pop 10 20 0 } if  0 gt { 30 40 } if }
      //
      // The guard `{ pop 10 20 0 }` fires when in0 ≤ 0 and replaces the
      // scalar input with three values (two color values + sentinel 0).
      // The sentinel ensures both paths converge to depth 2:
      //   in0 ≤ 0: [10, 20, 0] → `0 gt` = false → {30 40} skipped → [10, 20]
      //   in0 > 0: [in0] → `0 gt` always true → {30 40} fires → [30, 40]
      const out = toTree(
        "{ dup 0 le { pop 10 20 0 } if  0 gt { 30 40 } if }",
        1
      );
      expect(out).not.toBeNull();
      expect(out.length).toBe(2);
      // The first output's top-level node selects between the early-exit value
      // (10, when in0 ≤ 0) and the default path.
      expect(out[0]).toBeInstanceOf(PsTernaryNode);
      expect(out[0].then).toBeInstanceOf(PsConstNode);
      expect(out[0].then.value).toBe(10);
      expect(out[1]).toBeInstanceOf(PsTernaryNode);
      expect(out[1].then).toBeInstanceOf(PsConstNode);
      expect(out[1].then.value).toBe(20);
    });

    it("handles two chained stack-growing ifs (nested guard pattern)", function () {
      // Two guards + final default — the sentinel mechanism ensures all three
      // paths converge to depth 2:
      //   in0 ≤ 0:          first guard fires  → (10, 20)
      //   0 < in0 ≤ 1:     neither fires      → default (50, 60)
      //   in0 > 1:          second guard fires → (30, 40)
      const out = toTree(
        "{ dup 0 le { pop 10 20 0 } if" +
          "  dup 1 gt { pop 30 40 0 } if" +
          "  0 gt { 50 60 } if }",
        1
      );
      expect(out).not.toBeNull();
      expect(out.length).toBe(2);
    });

    it("fails cleanly on if without a condition value", function () {
      const out = toTree("{ { 1 } if }", 0);
      expect(out).toBeNull();
    });

    it("fails cleanly on ifelse without a condition value", function () {
      const out = toTree("{ { 1 } { 2 } ifelse }", 0);
      expect(out).toBeNull();
    });

    it("constant-folds a binary op when both operands are literals", function () {
      const out = toTree("{ 3 4 add }", 0);
      expect(out.length).toBe(1);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBeCloseTo(7);
    });

    it("constant-folds a unary op", function () {
      const out = toTree("{ 9 sqrt }", 0);
      expect(out.length).toBe(1);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBeCloseTo(3);
    });

    it("constant-folds a chain of ops", function () {
      // 1 2 add → 3, then 3 4 mul → 12
      const out = toTree("{ 1 2 add 4 mul }", 0);
      expect(out.length).toBe(1);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBeCloseTo(12);
    });

    it("x + 0 → x", function () {
      const out = toTree("{ 0 add }", 1);
      expect(out[0]).toBeInstanceOf(PsArgNode);
      expect(out[0].index).toBe(0);
    });

    it("0 + x → x", function () {
      // Push 0, then add: stack is [in0, 0], add → first=0, second=in0
      const out = toTree("{ 0 add }", 1);
      expect(out[0]).toBeInstanceOf(PsArgNode);
    });

    it("x - 0 → x", function () {
      const out = toTree("{ 0 sub }", 1);
      expect(out[0]).toBeInstanceOf(PsArgNode);
      expect(out[0].index).toBe(0);
    });

    it("x * 1 → x", function () {
      const out = toTree("{ 1 mul }", 1);
      expect(out[0]).toBeInstanceOf(PsArgNode);
      expect(out[0].index).toBe(0);
    });

    it("1 * x → x", function () {
      // Push 1 onto stack before the arg, then mul
      const out = toTree("{ 1 exch mul }", 1);
      expect(out[0]).toBeInstanceOf(PsArgNode);
      expect(out[0].index).toBe(0);
    });

    it("x / 1 → x", function () {
      const out = toTree("{ 1 div }", 1);
      expect(out[0]).toBeInstanceOf(PsArgNode);
      expect(out[0].index).toBe(0);
    });

    it("x * 0 → 0", function () {
      const out = toTree("{ 0 mul }", 1);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBe(0);
    });

    it("0 * x → 0", function () {
      const out = toTree("{ 0 exch mul }", 1);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBe(0);
    });

    it("x ^ 1 → x", function () {
      const out = toTree("{ 1 exp }", 1);
      expect(out[0]).toBeInstanceOf(PsArgNode);
      expect(out[0].index).toBe(0);
    });

    it("x ^ 0 → 1", function () {
      const out = toTree("{ 0 exp }", 1);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBe(1);
    });

    it("neg(neg(x)) → x", function () {
      const out = toTree("{ neg neg }", 1);
      expect(out[0]).toBeInstanceOf(PsArgNode);
      expect(out[0].index).toBe(0);
    });

    it("not(not(x)) → x", function () {
      const out = toTree("{ not not }", 1);
      expect(out[0]).toBeInstanceOf(PsArgNode);
      expect(out[0].index).toBe(0);
    });

    it("abs(neg(x)) → abs(x)", function () {
      const out = toTree("{ neg abs }", 1);
      expect(out[0]).toBeInstanceOf(PsUnaryNode);
      expect(out[0].op).toBe(TOKEN.abs);
      expect(out[0].operand).toBeInstanceOf(PsArgNode);
    });

    it("abs(abs(x)) → abs(x)", function () {
      const out = toTree("{ abs abs }", 1);
      expect(out[0]).toBeInstanceOf(PsUnaryNode);
      expect(out[0].op).toBe(TOKEN.abs);
      expect(out[0].operand).toBeInstanceOf(PsArgNode);
    });

    it("x and true → x", function () {
      const out = toTree("{ true and }", 1);
      expect(out[0]).toBeInstanceOf(PsArgNode);
    });

    it("x and false → false", function () {
      const out = toTree("{ false and }", 1);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBe(false);
    });

    it("x or false → x", function () {
      const out = toTree("{ false or }", 1);
      expect(out[0]).toBeInstanceOf(PsArgNode);
    });

    it("x or true → true", function () {
      const out = toTree("{ true or }", 1);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBe(true);
    });

    it("not(a eq b) → a ne b", function () {
      const out = toTree("{ eq not }", 2);
      expect(out[0]).toBeInstanceOf(PsBinaryNode);
      expect(out[0].op).toBe(TOKEN.ne);
      expect(out[0].valueType).toBe(PS_VALUE_TYPE.boolean);
    });

    it("not(a lt b) → a ge b", function () {
      const out = toTree("{ lt not }", 2);
      expect(out[0]).toBeInstanceOf(PsBinaryNode);
      expect(out[0].op).toBe(TOKEN.ge);
    });

    it("not(a ge b) → a lt b", function () {
      const out = toTree("{ ge not }", 2);
      expect(out[0]).toBeInstanceOf(PsBinaryNode);
      expect(out[0].op).toBe(TOKEN.lt);
    });

    it("PsArgNode has numeric valueType", function () {
      const out = toTree("{ }", 1);
      expect(out[0].valueType).toBe(PS_VALUE_TYPE.numeric);
    });

    it("PsConstNode(number) has numeric valueType", function () {
      const out = toTree("{ pop 1 }", 1);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].valueType).toBe(PS_VALUE_TYPE.numeric);
    });

    it("PsConstNode(boolean) has boolean valueType", function () {
      const out = toTree("{ pop true }", 1);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].valueType).toBe(PS_VALUE_TYPE.boolean);
    });

    it("comparison result has boolean valueType", function () {
      const out = toTree("{ 0.5 gt }", 1);
      expect(out[0].valueType).toBe(PS_VALUE_TYPE.boolean);
    });

    it("arithmetic result has numeric valueType", function () {
      const out = toTree("{ 2 add }", 1);
      expect(out[0].valueType).toBe(PS_VALUE_TYPE.numeric);
    });

    it("not of boolean has boolean valueType", function () {
      const out = toTree("{ 0.5 gt not }", 1);
      expect(out[0].valueType).toBe(PS_VALUE_TYPE.boolean);
    });

    it("not of numeric has numeric valueType", function () {
      const out = toTree("{ not }", 1);
      expect(out[0].valueType).toBe(PS_VALUE_TYPE.numeric);
    });

    it("x - x → 0 (reflexive sub)", function () {
      const out = toTree("{ dup sub }", 1);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBe(0);
    });

    it("x xor x → 0 (reflexive xor, integer)", function () {
      // arg0 has numeric valueType, so the result is integer 0 (not boolean
      // false).
      const out = toTree("{ dup xor }", 1);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBe(0);
    });

    it("x eq x → true (reflexive eq)", function () {
      const out = toTree("{ dup eq }", 1);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBe(true);
    });

    it("x and x → x (reflexive and)", function () {
      const out = toTree("{ dup and }", 1);
      expect(out[0]).toBeInstanceOf(PsArgNode);
      expect(out[0].index).toBe(0);
    });

    it("x ne x → false (reflexive ne)", function () {
      const out = toTree("{ dup ne }", 1);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBe(false);
    });

    it("_nodesEqual handles structurally-equal unary nodes", function () {
      // dup sqrt exch sqrt sub: two independent sqrt(arg0) nodes are
      // structurally equal → reflexive sub → 0.
      const out = toTree("{ dup sqrt exch sqrt sub }", 1);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBe(0);
    });

    it("_nodesEqual handles structurally-equal binary nodes", function () {
      // dup 2 mul exch 2 mul sub: two independent mul(2, arg0) nodes are
      // structurally equal → reflexive sub → 0; exercises the binary branch
      // of _nodesEqual (checking both first and second sub-operands).
      const out = toTree("{ dup 2 mul exch 2 mul sub }", 1);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBe(0);
    });

    // Algebraic simplifications — first is a known constant

    it("x * -1 → neg(x)", function () {
      const out = toTree("{ -1 mul }", 1);
      expect(out[0]).toBeInstanceOf(PsUnaryNode);
      expect(out[0].op).toBe(TOKEN.neg);
      expect(out[0].operand).toBeInstanceOf(PsArgNode);
    });

    it("x idiv 1 → x", function () {
      const out = toTree("{ 1 idiv }", 1);
      expect(out[0]).toBeInstanceOf(PsArgNode);
      expect(out[0].index).toBe(0);
    });

    it("x ^ 0.5 → sqrt(x)", function () {
      const out = toTree("{ 0.5 exp }", 1);
      expect(out[0]).toBeInstanceOf(PsUnaryNode);
      expect(out[0].op).toBe(TOKEN.sqrt);
    });

    it("x ^ -1 → 1 / x", function () {
      const out = toTree("{ -1 exp }", 1);
      expect(out[0]).toBeInstanceOf(PsBinaryNode);
      expect(out[0].op).toBe(TOKEN.div);
      expect(out[0].second).toBeInstanceOf(PsConstNode);
      expect(out[0].second.value).toBe(1);
    });

    it("x ^ 3 → (x * x) * x", function () {
      const out = toTree("{ 3 exp }", 1);
      expect(out[0]).toBeInstanceOf(PsBinaryNode);
      expect(out[0].op).toBe(TOKEN.mul);
      expect(out[0].first).toBeInstanceOf(PsBinaryNode);
      expect(out[0].first.op).toBe(TOKEN.mul);
      expect(out[0].second).toBeInstanceOf(PsArgNode);
    });

    it("x ^ 4 → (x * x) * (x * x)", function () {
      const out = toTree("{ 4 exp }", 1);
      expect(out[0]).toBeInstanceOf(PsBinaryNode);
      expect(out[0].op).toBe(TOKEN.mul);
      expect(out[0].first).toBe(out[0].second);
      expect(out[0].first).toBeInstanceOf(PsBinaryNode);
      expect(out[0].first.op).toBe(TOKEN.mul);
    });

    // Algebraic simplifications — second (left operand) is a known constant

    it("0 + x → x (second=0 add)", function () {
      // Push 0 first (below), then arg0 on top; add has second=PsConstNode(0).
      const out = toTree("{ 0 exch add }", 1);
      expect(out[0]).toBeInstanceOf(PsArgNode);
    });

    it("0 - x → neg(x) (second=0 sub)", function () {
      const out = toTree("{ 0 exch sub }", 1);
      expect(out[0]).toBeInstanceOf(PsUnaryNode);
      expect(out[0].op).toBe(TOKEN.neg);
    });

    it("-1 * x → neg(x) (second=-1 mul)", function () {
      const out = toTree("{ -1 exch mul }", 1);
      expect(out[0]).toBeInstanceOf(PsUnaryNode);
      expect(out[0].op).toBe(TOKEN.neg);
    });

    it("true and x → x (second=true and)", function () {
      const out = toTree("{ true exch and }", 1);
      expect(out[0]).toBeInstanceOf(PsArgNode);
    });

    it("false and x → false (second=false and)", function () {
      const out = toTree("{ false exch and }", 1);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBe(false);
    });

    it("false or x → x (second=false or)", function () {
      const out = toTree("{ false exch or }", 1);
      expect(out[0]).toBeInstanceOf(PsArgNode);
    });

    it("true or x → true (second=true or)", function () {
      const out = toTree("{ true exch or }", 1);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBe(true);
    });

    it("no simplification when second operand is a non-special constant", function () {
      // Exercises the break paths in the second.type===const algebraic section
      // when none of the special-case thresholds (0, 1, -1, true, false) match.
      expect(toTree("{ 0.5 exch add }", 1)[0]).toBeInstanceOf(PsBinaryNode); // a≠0
      expect(toTree("{ 0.5 exch sub }", 1)[0]).toBeInstanceOf(PsBinaryNode); // a≠0
      expect(toTree("{ 0.5 exch mul }", 1)[0]).toBeInstanceOf(PsBinaryNode); // a≠±1,0
      expect(toTree("{ 0.5 exch and }", 1)[0]).toBeInstanceOf(PsBinaryNode); // a≠boolean
      expect(toTree("{ 0.5 exch or }", 1)[0]).toBeInstanceOf(PsBinaryNode); // a≠boolean
    });

    it("no simplification when first operand is a non-special constant", function () {
      // Exercises the break paths in the first.type===const algebraic section.
      // In PostScript `x c op`, first=PsConstNode(c), second=PsArgNode.
      // sub: b=2≠0 → break (line 915)
      expect(toTree("{ 2 sub }", 1)[0]).toBeInstanceOf(PsBinaryNode);
      // div: b=0 → the "if (b !== 0)" is false → break (line 933)
      expect(toTree("{ 0 div }", 1)[0]).toBeInstanceOf(PsBinaryNode);
      // idiv: b=2≠1 → break (line 938)
      expect(toTree("{ 2 idiv }", 1)[0]).toBeInstanceOf(PsBinaryNode);
      // exp: b=5 (not 0, 0.5, 0.25, -1, 1, 2, 3, or 4) → break
      expect(toTree("{ 5 exp }", 1)[0]).toBeInstanceOf(PsBinaryNode);
      // and: b=2 (not boolean) → break (line 961)
      expect(toTree("{ 2 and }", 1)[0]).toBeInstanceOf(PsBinaryNode);
      // or: b=2 (not boolean) → break (line 969)
      expect(toTree("{ 2 or }", 1)[0]).toBeInstanceOf(PsBinaryNode);
    });

    // _makeTernary optimizations

    it("_makeTernary folds constant-true condition to then-branch", function () {
      const out = toTree("{ true { 2 } { 3 } ifelse }", 0);
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBeCloseTo(2);
    });

    it("_makeTernary returns shared branch when then and otherwise are identical", function () {
      // Both branches are empty, so thenStack = elseStack = [arg0].
      // _makeTernary(cond, arg0, arg0) → _nodesEqual → returns arg0.
      const out = toTree("{ dup 0.5 gt { } { } ifelse }", 1);
      expect(out[0]).toBeInstanceOf(PsArgNode);
      expect(out[0].index).toBe(0);
    });

    it("_makeTernary simplifies cond ? true : false → cond", function () {
      // The ternary with boolean branches is simplified to just the condition.
      const out = toTree("{ 0.5 gt { true } { false } ifelse }", 1);
      // Result should be the comparison node itself (not a ternary).
      expect(out[0]).toBeInstanceOf(PsBinaryNode);
      expect(out[0].op).toBe(TOKEN.gt);
    });

    it("_makeTernary simplifies cond ? false : true → not(cond)", function () {
      // not(gt) is further simplified to le by the not(comparison) rule.
      const out = toTree("{ 0.5 gt { false } { true } ifelse }", 1);
      expect(out[0]).toBeInstanceOf(PsBinaryNode);
      expect(out[0].op).toBe(TOKEN.le);
      expect(out[0].valueType).toBe(PS_VALUE_TYPE.boolean);
    });

    it("_makeTernary assigns PS_VALUE_TYPE.unknown when branches have different types", function () {
      // Then = boolean (comparison), otherwise = numeric (mul) → unknown.
      const out = toTree("{ dup 0.5 gt { 0.5 gt } { 2 mul } ifelse }", 1);
      expect(out[0]).toBeInstanceOf(PsTernaryNode);
      expect(out[0].valueType).toBe(PS_VALUE_TYPE.unknown);
    });

    // _makeTernary → min/max folding

    it("_makeTernary folds (x gt c) ? c : x → min(x, c)", function () {
      // { dup 1 gt { pop 1 } { } ifelse } with 1 input:
      // thenStack=[1], elseStack=[x]; cond=gt(first=1, second=x)
      // → _makeTernary(gt(1,x), 1, x) → min(x, 1)
      const out = toTree("{ dup 1 gt { pop 1 } { } ifelse }", 1);
      expect(out[0]).toBeInstanceOf(PsBinaryNode);
      expect(out[0].op).toBe(TOKEN.min);
    });

    it("_makeTernary folds (x lt c) ? c : x → max(x, c)", function () {
      // { dup 0 lt { pop 0 } { } ifelse } → max(x, 0)
      const out = toTree("{ dup 0 lt { pop 0 } { } ifelse }", 1);
      expect(out[0]).toBeInstanceOf(PsBinaryNode);
      expect(out[0].op).toBe(TOKEN.max);
    });

    it("_makeTernary folds (x lt c) ? x : c → min(x, c)", function () {
      // { dup 0 lt { } { pop 0 } ifelse } → min(x, 0):
      // cond=lt(cf=0, cs=x); then=x=cs, otherwise=0=cf → min(cf, cs)
      const out = toTree("{ dup 0 lt { } { pop 0 } ifelse }", 1);
      expect(out[0]).toBeInstanceOf(PsBinaryNode);
      expect(out[0].op).toBe(TOKEN.min);
    });

    it("_makeTernary folds (x ge c) ? c : x → min(x, c)", function () {
      // { dup 0.5 ge { pop 0.5 } { } ifelse } → min(x, 0.5)
      const out = toTree("{ dup 0.5 ge { pop 0.5 } { } ifelse }", 1);
      expect(out[0]).toBeInstanceOf(PsBinaryNode);
      expect(out[0].op).toBe(TOKEN.min);
    });

    it("_makeTernary folds (x le c) ? c : x → max(x, c)", function () {
      // { dup 0.5 le { pop 0.5 } { } ifelse } → max(x, 0.5)
      const out = toTree("{ dup 0.5 le { pop 0.5 } { } ifelse }", 1);
      expect(out[0]).toBeInstanceOf(PsBinaryNode);
      expect(out[0].op).toBe(TOKEN.max);
    });

    it("_makeTernary folds (x gt c) ? x : c → max(x, c)", function () {
      // { dup 0.5 gt { } { pop 0.5 } ifelse } → max(x, 0.5)
      const out = toTree("{ dup 0.5 gt { } { pop 0.5 } ifelse }", 1);
      expect(out[0]).toBeInstanceOf(PsBinaryNode);
      expect(out[0].op).toBe(TOKEN.max);
    });

    it("neg(a − b) → b − a (sub operand swap)", function () {
      // neg(x - 1) should become (1 - x), i.e. PsBinaryNode(sub)
      // with the operands swapped — no PsUnaryNode(neg) in the tree.
      const out = toTree("{ 1 sub neg }", 1);
      expect(out[0]).toBeInstanceOf(PsBinaryNode);
      expect(out[0].op).toBe(TOKEN.sub);
      // first=arg (original second of the inner sub), second=PsConstNode(1)
      expect(out[0].second).toBeInstanceOf(PsConstNode);
      expect(out[0].second.value).toBe(1);
      expect(out[0].first).toBeInstanceOf(PsArgNode);
    });

    it("neg(0 − x) → x (neg(−x) double elimination)", function () {
      // 0 − x → neg(x) via the second=0 rule, then neg(neg(x)) → x.
      const out = toTree("{ 0 exch sub neg }", 1);
      expect(out[0]).toBeInstanceOf(PsArgNode);
    });

    it("min(max(x, c2), c1) where c2 >= c1 → c1 (absorption)", function () {
      // max(x, 0.8) always >= 0.8 > 0.5, so min(..., 0.5) = 0.5.
      // { dup 0.8 lt { pop 0.8 } { } ifelse   ← max(x, 0.8)
      //   dup 0.5 gt { pop 0.5 } { } ifelse } ← min(..., 0.5)
      const out = toTree(
        "{ dup 0.8 lt { pop 0.8 } { } ifelse " +
          "dup 0.5 gt { pop 0.5 } { } ifelse }",
        1
      );
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBeCloseTo(0.5, 9);
    });

    it("max(min(x, c1), c2) where c2 >= c1 → c2 (absorption)", function () {
      // min(x, 0.2) always <= 0.2 < 0.5, so max(..., 0.5) = 0.5.
      const out = toTree(
        "{ dup 0.2 gt { pop 0.2 } { } ifelse " +
          "dup 0.5 lt { pop 0.5 } { } ifelse }",
        1
      );
      expect(out[0]).toBeInstanceOf(PsConstNode);
      expect(out[0].value).toBeCloseTo(0.5, 9);
    });

    it("x ^ 0.25 folds to sqrt(sqrt(x)) — no PsTernaryNode", function () {
      // Should produce PsUnaryNode(sqrt, PsUnaryNode(sqrt, arg))
      const out = toTree("{ 0.25 exp }", 1);
      expect(out[0]).toBeInstanceOf(PsUnaryNode);
      expect(out[0].op).toBe(TOKEN.sqrt);
      expect(out[0].operand).toBeInstanceOf(PsUnaryNode);
      expect(out[0].operand.op).toBe(TOKEN.sqrt);
    });

    it("constant-folds sub, div, idiv, mod", function () {
      expect(toTree("{ 5 3 sub }", 0)[0].value).toBeCloseTo(2); // sub const fold
      expect(toTree("{ 6 3 div }", 0)[0].value).toBeCloseTo(2);
      expect(toTree("{ 7 3 idiv }", 0)[0].value).toBeCloseTo(2); // trunc(7/3)=2
      expect(toTree("{ 7 3 mod }", 0)[0].value).toBeCloseTo(1); // 7 - 2*3 = 1
    });

    it("constant-folds exp and atan (including negative angle)", function () {
      expect(toTree("{ 3 3 exp }", 0)[0].value).toBeCloseTo(27);
      expect(toTree("{ 1 1 atan }", 0)[0].value).toBeCloseTo(45); // atan(1,1)=45°
      // Negative atan result gets normalised: atan(-1,1)=-45° → +360 → 315°
      expect(toTree("{ -1 1 atan }", 0)[0].value).toBeCloseTo(315);
    });

    it("constant-folds comparison operators", function () {
      expect(toTree("{ 1 1 eq }", 0)[0].value).toBe(true);
      expect(toTree("{ 1 2 ne }", 0)[0].value).toBe(true);
      expect(toTree("{ 2 1 gt }", 0)[0].value).toBe(true); // a=2 > b=1
      expect(toTree("{ 1 1 ge }", 0)[0].value).toBe(true);
      expect(toTree("{ 1 2 lt }", 0)[0].value).toBe(true); // a=1 < b=2
      expect(toTree("{ 1 2 le }", 0)[0].value).toBe(true);
    });

    it("constant-folds boolean and, or, xor and bitshift", function () {
      expect(toTree("{ true false and }", 0)[0].value).toBe(false);
      expect(toTree("{ false true or }", 0)[0].value).toBe(true);
      expect(toTree("{ true false xor }", 0)[0].value).toBe(true);
      expect(toTree("{ 4 2 bitshift }", 0)[0].value).toBe(16); // 4 << 2
    });

    it("constant-folds abs, neg, ceiling, floor, round, truncate", function () {
      expect(toTree("{ 2.5 abs }", 0)[0].value).toBeCloseTo(2.5);
      expect(toTree("{ 2.5 neg }", 0)[0].value).toBeCloseTo(-2.5);
      expect(toTree("{ 2.5 ceiling }", 0)[0].value).toBeCloseTo(3);
      expect(toTree("{ 2.5 floor }", 0)[0].value).toBeCloseTo(2);
      expect(toTree("{ 2.5 round }", 0)[0].value).toBeCloseTo(3);
      expect(toTree("{ 2.5 truncate }", 0)[0].value).toBeCloseTo(2);
    });

    it("constant-folds sin, cos, ln, log, cvi, cvr", function () {
      expect(toTree("{ 30 sin }", 0)[0].value).toBeCloseTo(0.5, 9);
      expect(toTree("{ 0 cos }", 0)[0].value).toBeCloseTo(1, 9);
      expect(toTree("{ 1 ln }", 0)[0].value).toBeCloseTo(0, 9);
      expect(toTree("{ 100 log }", 0)[0].value).toBeCloseTo(2, 9);
      expect(toTree("{ 2.7 cvi }", 0)[0].value).toBe(2); // Math.trunc(2.7)
      expect(toTree("{ 2.7 cvr }", 0)[0].value).toBeCloseTo(2.7, 9);
    });
  });

  describe("PostScript Type 4 WGSL shader compiler", function () {
    const DOMAIN2 = [0, 1, 0, 1];
    const RANGE_GRAY = [0, 1];
    const RANGE_RGB = [0, 1, 0, 1, 0, 1];
    // Mirror the compiler's _RAD_TO_DEG constant so the test stays in sync.
    const _RAD_TO_DEG_STR = (180 / Math.PI).toPrecision(17);

    // Compile src and assert non-null; returns the full shader string.
    function compileWgsl(src, range = RANGE_GRAY) {
      const program = parsePostScriptFunction(src);
      const shader = buildPostScriptWgslShader(program, DOMAIN2, range);
      expect(shader).not.toBeNull();
      return shader;
    }

    // Extract the body of fn fs_main (everything between its outermost braces).
    // The generated fs_main never contains nested braces (select() is used
    // instead of if/else), so the first { after "fn fs_main" pairs with the
    // very last } in the shader.
    function getFsBody(shader) {
      const start = shader.indexOf("fn fs_main");
      const open = shader.indexOf("{", start);
      return shader.slice(open + 1, shader.lastIndexOf("}"));
    }

    it("returns null for nIn ≠ 2", function () {
      // domain with nIn = 1
      const program = parsePostScriptFunction("{ 1 add }");
      expect(buildPostScriptWgslShader(program, [0, 1], [0, 1])).toBeNull();
    });

    it("returns null when a range value is non-finite", function () {
      const program = parsePostScriptFunction("{ add }");
      expect(
        buildPostScriptWgslShader(program, DOMAIN2, [0, Infinity])
      ).toBeNull();
    });

    it("returns null for unsupported nOut (e.g. 2)", function () {
      const program = parsePostScriptFunction("{ dup }");
      expect(
        buildPostScriptWgslShader(program, DOMAIN2, [0, 1, 0, 1])
      ).toBeNull();
    });

    it("returns null when PSStackToTree cannot compile the program", function () {
      // `if` without `else` produces variable stack depth — PSStackToTree fails
      const program = parsePostScriptFunction("{ dup 0 gt { pop } if }");
      expect(
        buildPostScriptWgslShader(program, DOMAIN2, RANGE_GRAY)
      ).toBeNull();
    });

    it("emits the correct WGSL frame (structs and vertex shader)", function () {
      const shader = compileWgsl("{ add }");

      expect(shader).toContain(
        [
          "struct VertexInput {",
          "  @location(0) pos:   vec2f,",
          "  @location(1) coord: vec2f,",
          "};",
        ].join("\n")
      );
      expect(shader).toContain(
        [
          "struct VertexOutput {",
          "  @builtin(position) pos:   vec4f,",
          "  @location(0)       coord: vec2f,",
          "};",
        ].join("\n")
      );
      expect(shader).toContain(
        [
          "@vertex",
          "fn vs_main(in: VertexInput) -> VertexOutput {",
          "  var out: VertexOutput;",
          "  out.pos   = vec4f(in.pos, 0.0, 1.0);",
          "  out.coord = in.coord;",
          "  return out;",
          "}",
        ].join("\n")
      );
      expect(shader).toContain(
        [
          "@fragment",
          "fn fs_main(in: VertexOutput) -> @location(0) vec4f {",
        ].join("\n")
      );
    });

    it("compiles a constant grey shader", function () {
      const body = getFsBody(compileWgsl("{ pop pop 0.5 }"));
      expect(body).toContain("let _o0 = clamp(0.5, 0.0, 1.0);");
      expect(body).toContain("return vec4f(_o0, _o0, _o0, 1.0);");
    });

    it("compiles an identity (pass-through i) grey shader", function () {
      // { pop } — discards j, outputs i as grey
      const body = getFsBody(compileWgsl("{ pop }"));
      expect(body).toContain("let _o0 = clamp(in.coord.x, 0.0, 1.0);");
      expect(body).toContain("return vec4f(_o0, _o0, _o0, 1.0);");
    });

    it("compiles a radial gradient: sqrt(i²+j²)", function () {
      // Stack trace: [i,j] → dup → [i,j,j] → mul → [i,j*j] → exch →
      //   [j*j,i] → dup → [j*j,i,i] → mul → [j*j,i*i] → add → sqrt
      // arg nodes are trivially inlined, so no CSE let-bindings are emitted.
      const body = getFsBody(compileWgsl("{ dup mul exch dup mul add sqrt }"));
      expect(body).toContain(
        "sqrt(((in.coord.y * in.coord.y) + (in.coord.x * in.coord.x)))"
      );
    });

    it("compiles an RGB shader", function () {
      // output (i, j, i*j)
      const body = getFsBody(
        compileWgsl("{ 2 copy mul 3 1 roll exch }", RANGE_RGB)
      );
      expect(body).toContain("return vec4f(_o0, _o1, _o2, 1.0);");
    });

    it("compiles arithmetic operators correctly", function () {
      expect(getFsBody(compileWgsl("{ add }"))).toContain(
        "in.coord.x + in.coord.y"
      );
      expect(getFsBody(compileWgsl("{ sub }"))).toContain(
        "in.coord.x - in.coord.y"
      );
      expect(getFsBody(compileWgsl("{ mul }"))).toContain(
        "in.coord.x * in.coord.y"
      );
      // div: safe division — returns 0 when divisor is 0
      const divBody = getFsBody(compileWgsl("{ div }"));
      expect(divBody).toContain("select(0.0,");
      expect(divBody).toContain("!= 0.0");
    });

    it("compiles unary operators correctly", function () {
      expect(getFsBody(compileWgsl("{ pop abs }"))).toContain("abs(");
      expect(getFsBody(compileWgsl("{ pop neg }"))).toContain("-(");
      expect(getFsBody(compileWgsl("{ pop ceiling }"))).toContain("ceil(");
      expect(getFsBody(compileWgsl("{ pop floor }"))).toContain("floor(");
      expect(getFsBody(compileWgsl("{ pop round }"))).toContain("floor(");
      expect(getFsBody(compileWgsl("{ pop truncate }"))).toContain("trunc(");
      expect(getFsBody(compileWgsl("{ pop sqrt }"))).toContain("sqrt(");
    });

    it("compiles sin and cos with mod-360 and degree-to-radian conversion", function () {
      const sinBody = getFsBody(compileWgsl("{ pop sin }"));
      expect(sinBody).toContain(
        "sin((in.coord.x % 360.0) * 0.017453292519943295)"
      );

      const cosBody = getFsBody(compileWgsl("{ pop cos }"));
      expect(cosBody).toContain(
        "cos((in.coord.x % 360.0) * 0.017453292519943295)"
      );
    });

    it("inlines atan as atan2 + degree wrap in the fs_main body", function () {
      const body = getFsBody(compileWgsl("{ atan }"));
      // atan2 call with the degree-to-radian constant
      expect(body).toContain("atan2(");
      expect(body).toContain(_RAD_TO_DEG_STR);
      // degree wrap: select(deg + 360.0, deg, deg >= 0.0)
      expect(body).toContain("+ 360.0");
      expect(body).toContain(">= 0.0");
    });

    it("inlines bitshift as i32 casts and select in the fs_main body", function () {
      const body = getFsBody(compileWgsl("{ pop 2 bitshift }"));
      // i32 casts for value and shift amount
      expect(body).toContain("i32(");
      // left-shift and right-shift operators
      expect(body).toContain("<<");
      expect(body).toContain(">>");
      // select picks left vs right shift based on sign of the amount
      expect(body).toContain("select(");
      expect(body).toContain(">= 0");
    });

    it("compiles ternary (ifelse) with WGSL select", function () {
      // add i+j, compare to 1.0 → single value on stack → ternary is the output
      // The comparison is emitted as a native WGSL bool (no f32 round-trip).
      const body = getFsBody(
        compileWgsl("{ add 1.0 gt { 1.0 } { 0.0 } ifelse }")
      );
      expect(body).toContain(
        "select(0.0, 1.0, ((in.coord.x + in.coord.y) > 1.0))"
      );
    });

    it("compiles range clamping into the shader", function () {
      const body = getFsBody(compileWgsl("{ add }", [0.2, 0.8]));
      expect(body).toContain("clamp(");
      expect(body).toContain("0.2");
      expect(body).toContain("0.8");
    });

    it("CSE: a shared non-trivial sub-expression emits a let-binding", function () {
      // { pop dup mul dup add }: pop j, square i (dup+mul), then dup the
      // result → the mul node is referenced twice → CSE emits `let _t0`.
      // Both uses of i² in the add must reference _t0, not re-compute it.
      const body = getFsBody(compileWgsl("{ pop dup mul dup add }"));
      expect(body).toContain("let _t0 = (in.coord.x * in.coord.x);");
      expect(body).toContain("(_t0 + _t0)");
    });
  });

  describe("buildExponentialWgslShader", function () {
    it("compiles a grayscale (nOut=1) exponential function", function () {
      const shader = buildExponentialWgslShader([0], [1], 1, [0, 1], null);
      expect(shader).not.toBeNull();
      expect(shader).toContain("let x = clamp(in.coord.x, 0.0, 1.0);");
      expect(shader).toContain("let _o0 = clamp(0.0 + x * 1.0, 0.0, 1.0);");
      expect(shader).toContain("vec4f(_o0, _o0, _o0, 1.0)");
    });

    it("compiles an RGB (nOut=3) exponential function with range", function () {
      const shader = buildExponentialWgslShader(
        [0, 0, 0],
        [1, 1, 1],
        1,
        [0, 1],
        [0, 1, 0, 1, 0, 1]
      );
      expect(shader).not.toBeNull();
      expect(shader).toContain("vec4f(_o0, _o1, _o2, 1.0)");
    });

    it("returns null for unsupported nOut (e.g. 2)", function () {
      expect(
        buildExponentialWgslShader([0, 0], [1, 1], 1, [0, 1], null)
      ).toBeNull();
    });

    it("returns null when n is non-finite", function () {
      expect(
        buildExponentialWgslShader([0], [1], Infinity, [0, 1], null)
      ).toBeNull();
    });

    it("returns null when a C0/C1 value is non-finite", function () {
      expect(
        buildExponentialWgslShader([Infinity], [1], 1, [0, 1], null)
      ).toBeNull();
    });

    it("returns null when a range value is non-finite", function () {
      expect(
        buildExponentialWgslShader([0], [1], 1, [0, 1], [0, Infinity])
      ).toBeNull();
    });

    it("returns null when a domain value is non-finite", function () {
      expect(
        buildExponentialWgslShader([0], [1], 1, [0, Infinity], null)
      ).toBeNull();
    });

    it("compiles n=0 (constant function) using '1.0' instead of pow(x, 0)", function () {
      // x^0 = 1; pow(x, 0.0) is NaN in WGSL, so n=0 is special-cased.
      const shader = buildExponentialWgslShader([0.2], [0.8], 0, [0, 1], null);
      expect(shader).not.toBeNull();
      expect(shader).toContain("1.0");
      expect(shader).not.toContain("pow(");
    });
  });

  describe("buildSampledWgslShader", function () {
    // Minimal 2×2 grayscale sample grid: 4 normalized values in [0, 1].
    const SAMPLES_GRAY = [0, 0.5, 0.5, 1.0];
    const SIZE_2x2 = [2, 2];
    const ENCODE_2x2 = [0, 1, 0, 1];
    const DECODE_GRAY = [0, 1];
    const DOMAIN_2D = [0, 1, 0, 1];
    const RANGE_GRAY = [0, 1];

    it("compiles a grayscale 2-in 1-out sampled shader", function () {
      const shader = buildSampledWgslShader(
        SAMPLES_GRAY,
        SIZE_2x2,
        ENCODE_2x2,
        DECODE_GRAY,
        DOMAIN_2D,
        RANGE_GRAY
      );
      expect(shader).not.toBeNull();
      expect(shader).toContain("_samples_0");
      expect(shader).toContain("vec4f(_o0, _o0, _o0, 1.0)");
    });

    it("compiles an RGB 2-in 3-out sampled shader", function () {
      // Interleaved RGB: [r0,g0,b0, r1,g1,b1, r2,g2,b2, r3,g3,b3]
      const samplesRgb = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0];
      const shader = buildSampledWgslShader(
        samplesRgb,
        SIZE_2x2,
        ENCODE_2x2,
        [0, 1, 0, 1, 0, 1],
        DOMAIN_2D,
        [0, 1, 0, 1, 0, 1]
      );
      expect(shader).not.toBeNull();
      expect(shader).toContain("_samples_0");
      expect(shader).toContain("_samples_1");
      expect(shader).toContain("_samples_2");
      expect(shader).toContain("vec4f(_o0, _o1, _o2, 1.0)");
    });

    it("returns null when domain is not 2-input (length ≠ 4)", function () {
      expect(
        buildSampledWgslShader(
          SAMPLES_GRAY,
          SIZE_2x2,
          ENCODE_2x2,
          DECODE_GRAY,
          [0, 1],
          RANGE_GRAY
        )
      ).toBeNull();
    });

    it("returns null for unsupported nOut (e.g. 2)", function () {
      expect(
        buildSampledWgslShader(
          SAMPLES_GRAY,
          SIZE_2x2,
          ENCODE_2x2,
          [0, 1, 0, 1],
          DOMAIN_2D,
          [0, 1, 0, 1]
        )
      ).toBeNull();
    });

    it("returns null when encode contains a non-finite value", function () {
      expect(
        buildSampledWgslShader(
          SAMPLES_GRAY,
          SIZE_2x2,
          [Infinity, 1, 0, 1],
          DECODE_GRAY,
          DOMAIN_2D,
          RANGE_GRAY
        )
      ).toBeNull();
    });

    it("returns null when decode contains a non-finite value", function () {
      expect(
        buildSampledWgslShader(
          SAMPLES_GRAY,
          SIZE_2x2,
          ENCODE_2x2,
          [Infinity, 1],
          DOMAIN_2D,
          RANGE_GRAY
        )
      ).toBeNull();
    });

    it("returns null when domain contains a non-finite value", function () {
      expect(
        buildSampledWgslShader(
          SAMPLES_GRAY,
          SIZE_2x2,
          ENCODE_2x2,
          DECODE_GRAY,
          [0, Infinity, 0, 1],
          RANGE_GRAY
        )
      ).toBeNull();
    });

    it("returns null when domain is degenerate (xMin === xMax)", function () {
      // domain[0] === domain[1] → division by zero → early null.
      expect(
        buildSampledWgslShader(
          SAMPLES_GRAY,
          SIZE_2x2,
          ENCODE_2x2,
          DECODE_GRAY,
          [0.5, 0.5, 0, 1],
          RANGE_GRAY
        )
      ).toBeNull();
    });

    it("returns null when the sample grid exceeds 65536 entries", function () {
      // 257×257 = 66049 > 65536 → null before any literal generation.
      const bigSize = [257, 257];
      const bigSamples = new Array(257 * 257).fill(0.5);
      const bigEncode = [0, 256, 0, 256];
      expect(
        buildSampledWgslShader(
          bigSamples,
          bigSize,
          bigEncode,
          DECODE_GRAY,
          DOMAIN_2D,
          RANGE_GRAY
        )
      ).toBeNull();
    });

    it("returns null when a sample value is non-finite", function () {
      // A NaN sample triggers null inside the literal-generation loop.
      const samples = [0, NaN, 0.5, 1];
      expect(
        buildSampledWgslShader(
          samples,
          SIZE_2x2,
          ENCODE_2x2,
          DECODE_GRAY,
          DOMAIN_2D,
          RANGE_GRAY
        )
      ).toBeNull();
    });

    it("returns null when a grid dimension is less than 2", function () {
      // sx=1 → bilinear interpolation requires at least 2×2 samples.
      expect(
        buildSampledWgslShader(
          [0, 1],
          [1, 2],
          [0, 0, 0, 1],
          DECODE_GRAY,
          DOMAIN_2D,
          RANGE_GRAY
        )
      ).toBeNull();
    });
  });

  describe("buildFunctionBasedWgslShader", function () {
    /** Build an XRefMock whose fetchIfRef passes non-Refs through unchanged. */
    function xref() {
      return new XRefMock([]);
    }

    /** Make a Dict with FunctionType, Domain, and Range set. */
    function makeDict(type, domain, range, extra = {}) {
      const d = new Dict();
      d.set("FunctionType", type);
      d.set("Domain", domain);
      d.set("Range", range);
      for (const [k, v] of Object.entries(extra)) {
        d.set(k, v);
      }
      return d;
    }

    /** Make a StringStream with a given dict attached. */
    function makeStream(str, dict) {
      const s = new StringStream(str);
      s.dict = dict;
      return s;
    }

    it("compiles a Type-4 (PostScript) BaseStream function", function () {
      const dict = makeDict(4, [0, 1, 0, 1], [0, 1]);
      const stream = makeStream("{ add }", dict);
      const shader = buildFunctionBasedWgslShader(xref(), stream);
      expect(shader).not.toBeNull();
      expect(shader).toContain("vec4f(_o0, _o0, _o0, 1.0)");
    });

    it("compiles a Type-2 (Exponential) BaseStream function", function () {
      const dict = makeDict(2, [0, 1], [0, 1], { C0: [0], C1: [1], N: 1 });
      const stream = makeStream("", dict);
      const shader = buildFunctionBasedWgslShader(xref(), stream);
      expect(shader).not.toBeNull();
      expect(shader).toContain("vec4f(_o0, _o0, _o0, 1.0)");
    });

    it("compiles a Type-2 (Exponential) inline Dict function", function () {
      const dict = makeDict(2, [0, 1], [0, 1], { C0: [0], C1: [1], N: 1 });
      const shader = buildFunctionBasedWgslShader(xref(), dict);
      expect(shader).not.toBeNull();
      expect(shader).toContain("vec4f(_o0, _o0, _o0, 1.0)");
    });

    it("compiles an array of one Type-2 component", function () {
      const dict = makeDict(2, [0, 1], null, { C0: [0], C1: [1], N: 1 });
      const shader = buildFunctionBasedWgslShader(xref(), [dict]);
      expect(shader).not.toBeNull();
      expect(shader).toContain("vec4f(_o0, _o0, _o0, 1.0)");
    });

    it("compiles an array of three Type-2 components (RGB)", function () {
      const d = () => makeDict(2, [0, 1], null, { C0: [0], C1: [1], N: 1 });
      const shader = buildFunctionBasedWgslShader(xref(), [d(), d(), d()]);
      expect(shader).not.toBeNull();
      expect(shader).toContain("vec4f(_o0, _o1, _o2, 1.0)");
    });

    it("compiles an array of one Type-4 component", function () {
      const dict = makeDict(4, [0, 1, 0, 1], [0, 1]);
      const stream = makeStream("{ add }", dict);
      const shader = buildFunctionBasedWgslShader(xref(), [stream]);
      expect(shader).not.toBeNull();
    });

    it("compiles an array of one Type-0 sampled component", function () {
      // 2×2 grid, 8 BitsPerSample, 4 samples = 4 bytes [0, 128, 64, 255]
      const bytes = new Uint8Array([0, 128, 64, 255]);
      const dict = makeDict(0, [0, 1, 0, 1], [0, 1], {
        Size: [2, 2],
        BitsPerSample: 8,
      });
      const stream = new Stream(bytes.buffer, 0, 4, dict);
      const shader = buildFunctionBasedWgslShader(xref(), [stream]);
      expect(shader).not.toBeNull();
      expect(shader).toContain("_samples_0");
    });

    it("returns null for an unsupported function object", function () {
      expect(buildFunctionBasedWgslShader(xref(), "not-a-fn")).toBeNull();
    });

    it("returns null for an array with unsupported nOut (e.g. 2)", function () {
      const d = () => makeDict(2, [0, 1], null, { C0: [0], C1: [1], N: 1 });
      expect(buildFunctionBasedWgslShader(xref(), [d(), d()])).toBeNull();
    });

    it("returns null for Type-4 with missing Range", function () {
      const dict = makeDict(4, [0, 1, 0, 1], null);
      const stream = makeStream("{ add }", dict);
      expect(buildFunctionBasedWgslShader(xref(), stream)).toBeNull();
    });

    it("returns null for an inline Dict with non-Type-2 FunctionType", function () {
      // Only Type-2 is valid as a non-stream Dict; Type-4 requires a stream.
      const dict = makeDict(4, [0, 1, 0, 1], [0, 1]);
      expect(buildFunctionBasedWgslShader(xref(), dict)).toBeNull();
    });

    it("returns null when an array element is neither BaseStream nor Dict", function () {
      // A plain number in the array can't provide a dict → early null.
      expect(buildFunctionBasedWgslShader(xref(), [42])).toBeNull();
    });

    it("returns null when an array component compilation fails", function () {
      // Type-4 component with missing Domain → _componentBodyPS returns null.
      const dict = new Dict();
      dict.set("FunctionType", 4);
      dict.set("Range", [0, 1]);
      // No Domain — _componentBodyPS checks for it.
      const stream = makeStream("{ add }", dict);
      expect(buildFunctionBasedWgslShader(xref(), [stream])).toBeNull();
    });

    it("compiles a Type-0 (Sampled) BaseStream as a single function", function () {
      // 2×2 grid, 8 BitsPerSample, 1 output channel → 4 bytes
      const bytes = new Uint8Array([0, 128, 64, 255]);
      const dict = makeDict(0, [0, 1, 0, 1], [0, 1], {
        Size: [2, 2],
        BitsPerSample: 8,
      });
      const stream = new Stream(bytes.buffer, 0, 4, dict);
      const shader = buildFunctionBasedWgslShader(xref(), stream);
      expect(shader).not.toBeNull();
      expect(shader).toContain("_samples_0");
    });

    it("returns null for a BaseStream with an unsupported FunctionType", function () {
      // FunctionType 3 (Stitching) is not handled as a single BaseStream.
      const dict = makeDict(3, [0, 1, 0, 1], [0, 1]);
      const stream = makeStream("", dict);
      expect(buildFunctionBasedWgslShader(xref(), stream)).toBeNull();
    });

    it("returns null for Type-2 BaseStream with missing N", function () {
      // _buildExponentialFromDict requires N to be a number.
      const dict = makeDict(2, [0, 1], [0, 1], { C0: [0], C1: [1] });
      // N deliberately omitted → typeof n !== "number" → null
      const stream = makeStream("", dict);
      expect(buildFunctionBasedWgslShader(xref(), stream)).toBeNull();
    });

    it("returns null for Type-0 BaseStream with missing Size", function () {
      // Validation in the SAMPLED branch requires Size and BitsPerSample.
      const dict = makeDict(0, [0, 1, 0, 1], [0, 1]);
      // Size and BitsPerSample omitted → validation fails → null
      const stream = makeStream("", dict);
      expect(buildFunctionBasedWgslShader(xref(), stream)).toBeNull();
    });

    it("returns null for array Type-2 component with missing N", function () {
      // _componentBodyExponential returns null when Domain or N is absent.
      const dict = makeDict(2, [0, 1], null, { C0: [0], C1: [1] });
      // N omitted → null path in _componentBodyExponential
      expect(buildFunctionBasedWgslShader(xref(), [dict])).toBeNull();
    });

    it("returns null for array Type-2 component with non-finite domain", function () {
      // f32Lit returns null for Infinity, triggering the second null branch.
      const dict = makeDict(2, [0, Infinity], null, {
        C0: [0],
        C1: [1],
        N: 1,
      });
      expect(buildFunctionBasedWgslShader(xref(), [dict])).toBeNull();
    });

    it("returns null for array Type-0 component that is a Dict (not a stream)", function () {
      // _componentBodySampled requires f instanceof BaseStream.
      const dict = makeDict(0, [0, 1, 0, 1], [0, 1], {
        Size: [2, 2],
        BitsPerSample: 8,
      });
      // Dict, not a stream → first guard in _componentBodySampled fails.
      expect(buildFunctionBasedWgslShader(xref(), [dict])).toBeNull();
    });

    it("returns null for array Type-0 component with bad Domain length", function () {
      // Domain must be length 4 (2-in function).
      const bytes = new Uint8Array([0, 128, 64, 255]);
      const dict = makeDict(0, [0, 1], [0, 1], {
        Size: [2, 2],
        BitsPerSample: 8,
      });
      const stream = new Stream(bytes.buffer, 0, 4, dict);
      expect(buildFunctionBasedWgslShader(xref(), [stream])).toBeNull();
    });

    it("returns null for array Type-0 component with missing Size", function () {
      const bytes = new Uint8Array([0, 128, 64, 255]);
      const dict = makeDict(0, [0, 1, 0, 1], [0, 1], { BitsPerSample: 8 });
      // Size omitted → validation fails.
      const stream = new Stream(bytes.buffer, 0, 4, dict);
      expect(buildFunctionBasedWgslShader(xref(), [stream])).toBeNull();
    });

    it("returns null for array Type-4 component that is a Dict (not a stream)", function () {
      // _componentBodyPS requires BaseStream; a Dict triggers null.
      const dict = makeDict(4, [0, 1, 0, 1], [0, 1]);
      expect(buildFunctionBasedWgslShader(xref(), [dict])).toBeNull();
    });
  });
});
