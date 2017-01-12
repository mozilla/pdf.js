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

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-test/unit/function_spec', ['exports',
           'pdfjs/core/function', 'pdfjs/core/ps_parser',
           'pdfjs/core/stream', 'pdfjs/shared/util'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('../../src/core/function.js'),
            require('../../src/core/ps_parser.js'),
            require('../../src/core/stream.js'),
            require('../../src/shared/util.js'));
  } else {
    factory((root.pdfjsTestUnitFunctionSpec = {}),
             root.pdfjsCoreFunction, root.pdfjsCorePsParser,
             root.pdfjsCoreStream, root.pdfjsSharedUtil);
  }
}(this, function (exports, coreFunction, corePsParser, coreStream, sharedUtil) {

var PostScriptEvaluator = coreFunction.PostScriptEvaluator;
var PostScriptCompiler = coreFunction.PostScriptCompiler;
var PostScriptParser = corePsParser.PostScriptParser;
var PostScriptLexer = corePsParser.PostScriptLexer;
var StringStream = coreStream.StringStream;
var isArray = sharedUtil.isArray;

describe('function', function() {
  beforeEach(function() {
    jasmine.addMatchers({
      toMatchArray: function(util, customEqualityTesters) {
        return {
          compare: function (actual, expected) {
            var result = {};
            if (actual.length !== expected.length) {
              result.pass = false;
              result.message = 'Array length: ' + actual.length +
                               ', expected: ' + expected.length;
              return result;
            }
            result.pass = true;
            for (var i = 0; i < expected.length; i++) {
              var a = actual[i], b = expected[i];
              if (isArray(b)) {
                if (a.length !== b.length) {
                  result.pass = false;
                  break;
                }
                for (var j = 0; j < a.length; j++) {
                  var suba = a[j], subb = b[j];
                  if (suba !== subb) {
                    result.pass = false;
                    break;
                  }
                }
              } else {
                if (a !== b) {
                  result.pass = false;
                  break;
                }
              }
            }
            return result;
          }
        };
      }
    });
  });

  describe('PostScriptParser', function() {
    function parse(program) {
      var stream = new StringStream(program);
      var parser = new PostScriptParser(new PostScriptLexer(stream));
      return parser.parse();
    }
    it('parses empty programs', function() {
      var output = parse('{}');
      expect(output.length).toEqual(0);
    });
    it('parses positive numbers', function() {
      var number = 999;
      var program = parse('{ ' + number + ' }');
      var expectedProgram = [number];
      expect(program).toMatchArray(expectedProgram);
    });
    it('parses negative numbers', function() {
      var number = -999;
      var program = parse('{ ' + number + ' }');
      var expectedProgram = [number];
      expect(program).toMatchArray(expectedProgram);
    });
    it('parses negative floats', function() {
      var number = 3.3;
      var program = parse('{ ' + number + ' }');
      var expectedProgram = [number];
      expect(program).toMatchArray(expectedProgram);
    });
    it('parses operators', function() {
      var program = parse('{ sub }');
      var expectedProgram = ['sub'];
      expect(program).toMatchArray(expectedProgram);
    });
    it('parses if statements', function() {
      var program = parse('{ { 99 } if }');
      var expectedProgram = [3, 'jz', 99];
      expect(program).toMatchArray(expectedProgram);
    });
    it('parses ifelse statements', function() {
      var program = parse('{ { 99 } { 44 } ifelse }');
      var expectedProgram = [5, 'jz', 99, 6, 'j', 44];
      expect(program).toMatchArray(expectedProgram);
    });
    it('handles missing brackets', function() {
      expect(function() { parse('{'); }).toThrow(
        new Error('Unexpected symbol: found undefined expected 1.'));
    });
    it('handles junk after the end', function() {
      var number = 3.3;
      var program = parse('{ ' + number + ' }#');
      var expectedProgram = [number];
      expect(program).toMatchArray(expectedProgram);
    });
  });

  describe('PostScriptEvaluator', function() {
    function evaluate(program) {
      var stream = new StringStream(program);
      var parser = new PostScriptParser(new PostScriptLexer(stream));
      var code = parser.parse();
      var evaluator = new PostScriptEvaluator(code);
      var output = evaluator.execute();
      return output;
    }

    it('pushes stack', function() {
      var stack = evaluate('{ 99 }');
      var expectedStack = [99];
      expect(stack).toMatchArray(expectedStack);
    });
    it('handles if with true', function() {
      var stack = evaluate('{ 1 {99} if }');
      var expectedStack = [99];
      expect(stack).toMatchArray(expectedStack);
    });
    it('handles if with false', function() {
      var stack = evaluate('{ 0 {99} if }');
      var expectedStack = [];
      expect(stack).toMatchArray(expectedStack);
    });
    it('handles ifelse with true', function() {
      var stack = evaluate('{ 1 {99} {77} ifelse }');
      var expectedStack = [99];
      expect(stack).toMatchArray(expectedStack);
    });
    it('handles ifelse with false', function() {
      var stack = evaluate('{ 0 {99} {77} ifelse }');
      var expectedStack = [77];
      expect(stack).toMatchArray(expectedStack);
    });
    it('handles nested if', function() {
      var stack = evaluate('{ 1 {1 {77} if} if }');
      var expectedStack = [77];
      expect(stack).toMatchArray(expectedStack);
    });

    it('abs', function() {
      var stack = evaluate('{ -2 abs }');
      var expectedStack = [2];
      expect(stack).toMatchArray(expectedStack);
    });
    it('adds', function() {
      var stack = evaluate('{ 1 2 add }');
      var expectedStack = [3];
      expect(stack).toMatchArray(expectedStack);
    });
    it('boolean and', function() {
      var stack = evaluate('{ true false and }');
      var expectedStack = [false];
      expect(stack).toMatchArray(expectedStack);
    });
    it('bitwise and', function() {
      var stack = evaluate('{ 254 1 and }');
      var expectedStack = [254 & 1];
      expect(stack).toMatchArray(expectedStack);
    });
    it('calculates the inverse tangent of a number', function() {
      var stack = evaluate('{ 90 atan }');
      var expectedStack = [Math.atan(90)];
      expect(stack).toMatchArray(expectedStack);
    });
    it('handles bitshifting ', function() {
      var stack = evaluate('{ 50 2 bitshift }');
      var expectedStack = [200];
      expect(stack).toMatchArray(expectedStack);
    });
    it('calculates the ceiling value', function() {
      var stack = evaluate('{ 9.9 ceiling }');
      var expectedStack = [10];
      expect(stack).toMatchArray(expectedStack);
    });
    it('copies', function() {
      var stack = evaluate('{ 99 98 2 copy }');
      var expectedStack = [99, 98, 99, 98];
      expect(stack).toMatchArray(expectedStack);
    });
    it('calculates the cosine of a number', function() {
      var stack = evaluate('{ 90 cos }');
      var expectedStack = [Math.cos(90)];
      expect(stack).toMatchArray(expectedStack);
    });
    it('converts to int', function() {
      var stack = evaluate('{ 9.9 cvi }');
      var expectedStack = [9];
      expect(stack).toMatchArray(expectedStack);
    });
    it('converts negatives to int', function() {
      var stack = evaluate('{ -9.9 cvi }');
      var expectedStack = [-9];
      expect(stack).toMatchArray(expectedStack);
    });
    it('converts to real', function() {
      var stack = evaluate('{ 55.34 cvr }');
      var expectedStack = [55.34];
      expect(stack).toMatchArray(expectedStack);
    });
    it('divides', function() {
      var stack = evaluate('{ 6 5 div }');
      var expectedStack = [1.2];
      expect(stack).toMatchArray(expectedStack);
    });
    it('maps division by zero to infinity', function() {
      var stack = evaluate('{ 6 0 div }');
      var expectedStack = [Infinity];
      expect(stack).toMatchArray(expectedStack);
    });
    it('duplicates', function() {
      var stack = evaluate('{ 99 dup }');
      var expectedStack = [99, 99];
      expect(stack).toMatchArray(expectedStack);
    });
    it('accepts an equality', function() {
      var stack = evaluate('{ 9 9 eq }');
      var expectedStack = [true];
      expect(stack).toMatchArray(expectedStack);
    });
    it('rejects an inequality', function() {
      var stack = evaluate('{ 9 8 eq }');
      var expectedStack = [false];
      expect(stack).toMatchArray(expectedStack);
    });
    it('exchanges', function() {
      var stack = evaluate('{ 44 99 exch }');
      var expectedStack = [99, 44];
      expect(stack).toMatchArray(expectedStack);
    });
    it('handles exponentiation', function() {
      var stack = evaluate('{ 10 2 exp }');
      var expectedStack = [100];
      expect(stack).toMatchArray(expectedStack);
    });
    it('pushes false onto the stack', function() {
      var stack = evaluate('{ false }');
      var expectedStack = [false];
      expect(stack).toMatchArray(expectedStack);
    });
    it('calculates the floor value', function() {
      var stack = evaluate('{ 9.9 floor }');
      var expectedStack = [9];
      expect(stack).toMatchArray(expectedStack);
    });
    it('handles greater than or equal to', function() {
      var stack = evaluate('{ 10 9 ge }');
      var expectedStack = [true];
      expect(stack).toMatchArray(expectedStack);
    });
    it('rejects less than for greater than or equal to', function() {
      var stack = evaluate('{ 8 9 ge }');
      var expectedStack = [false];
      expect(stack).toMatchArray(expectedStack);
    });
    it('handles greater than', function() {
      var stack = evaluate('{ 10 9 gt }');
      var expectedStack = [true];
      expect(stack).toMatchArray(expectedStack);
    });
    it('rejects less than or equal for greater than', function() {
      var stack = evaluate('{ 9 9 gt }');
      var expectedStack = [false];
      expect(stack).toMatchArray(expectedStack);
    });
    it('divides to integer', function() {
      var stack = evaluate('{ 2 3 idiv }');
      var expectedStack = [0];
      expect(stack).toMatchArray(expectedStack);
    });
    it('divides to negative integer', function() {
      var stack = evaluate('{ -2 3 idiv }');
      var expectedStack = [0];
      expect(stack).toMatchArray(expectedStack);
    });
    it('duplicates index', function() {
      var stack = evaluate('{ 4 3 2 1 2 index }');
      var expectedStack = [4, 3, 2, 1, 3];
      expect(stack).toMatchArray(expectedStack);
    });
    it('handles less than or equal to', function() {
      var stack = evaluate('{ 9 10 le }');
      var expectedStack = [true];
      expect(stack).toMatchArray(expectedStack);
    });
    it('rejects greater than for less than or equal to', function() {
      var stack = evaluate('{ 10 9 le }');
      var expectedStack = [false];
      expect(stack).toMatchArray(expectedStack);
    });
    it('calculates the natural logarithm', function() {
      var stack = evaluate('{ 10 ln }');
      var expectedStack = [Math.log(10)];
      expect(stack).toMatchArray(expectedStack);
    });
    it('calculates the base 10 logarithm', function() {
      var stack = evaluate('{ 100 log }');
      var expectedStack = [2];
      expect(stack).toMatchArray(expectedStack);
    });
    it('handles less than', function() {
      var stack = evaluate('{ 9 10 lt }');
      var expectedStack = [true];
      expect(stack).toMatchArray(expectedStack);
    });
    it('rejects greater than or equal to for less than', function() {
      var stack = evaluate('{ 10 9 lt }');
      var expectedStack = [false];
      expect(stack).toMatchArray(expectedStack);
    });
    it('performs the modulo operation', function() {
      var stack = evaluate('{ 4 3 mod }');
      var expectedStack = [1];
      expect(stack).toMatchArray(expectedStack);
    });
    it('multiplies two numbers (positive result)', function() {
      var stack = evaluate('{ 9 8 mul }');
      var expectedStack = [72];
      expect(stack).toMatchArray(expectedStack);
    });
    it('multiplies two numbers (negative result)', function() {
      var stack = evaluate('{ 9 -8 mul }');
      var expectedStack = [-72];
      expect(stack).toMatchArray(expectedStack);
    });
    it('accepts an inequality', function() {
      var stack = evaluate('{ 9 8 ne }');
      var expectedStack = [true];
      expect(stack).toMatchArray(expectedStack);
    });
    it('rejects an equality', function() {
      var stack = evaluate('{ 9 9 ne }');
      var expectedStack = [false];
      expect(stack).toMatchArray(expectedStack);
    });
    it('negates', function() {
      var stack = evaluate('{ 4.5 neg }');
      var expectedStack = [-4.5];
      expect(stack).toMatchArray(expectedStack);
    });
    it('boolean not', function() {
      var stack = evaluate('{ true not }');
      var expectedStack = [false];
      expect(stack).toMatchArray(expectedStack);
    });
    it('bitwise not', function() {
      var stack = evaluate('{ 12 not }');
      var expectedStack = [-13];
      expect(stack).toMatchArray(expectedStack);
    });
    it('boolean or', function() {
      var stack = evaluate('{ true false or }');
      var expectedStack = [true];
      expect(stack).toMatchArray(expectedStack);
    });
    it('bitwise or', function() {
      var stack = evaluate('{ 254 1 or }');
      var expectedStack = [254 | 1];
      expect(stack).toMatchArray(expectedStack);
    });
    it('pops stack', function() {
      var stack = evaluate('{ 1 2 pop }');
      var expectedStack = [1];
      expect(stack).toMatchArray(expectedStack);
    });
    it('rolls stack right', function() {
      var stack = evaluate('{ 1 3 2 2 4 1 roll }');
      var expectedStack = [2, 1, 3, 2];
      expect(stack).toMatchArray(expectedStack);
    });
    it('rolls stack left', function() {
      var stack = evaluate('{ 1 3 2 2 4 -1 roll }');
      var expectedStack = [3, 2, 2, 1];
      expect(stack).toMatchArray(expectedStack);
    });
    it('rounds a number', function() {
      var stack = evaluate('{ 9.52 round }');
      var expectedStack = [10];
      expect(stack).toMatchArray(expectedStack);
    });
    it('calculates the sine of a number', function() {
      var stack = evaluate('{ 90 sin }');
      var expectedStack = [Math.sin(90)];
      expect(stack).toMatchArray(expectedStack);
    });
    it('calculates a square root (integer)', function() {
      var stack = evaluate('{ 100 sqrt }');
      var expectedStack = [10];
      expect(stack).toMatchArray(expectedStack);
    });
    it('calculates a square root (float)', function() {
      var stack = evaluate('{ 99 sqrt }');
      var expectedStack = [Math.sqrt(99)];
      expect(stack).toMatchArray(expectedStack);
    });
    it('subtracts (positive result)', function() {
      var stack = evaluate('{ 6 4 sub }');
      var expectedStack = [2];
      expect(stack).toMatchArray(expectedStack);
    });
    it('subtracts (negative result)', function() {
      var stack = evaluate('{ 4 6 sub }');
      var expectedStack = [-2];
      expect(stack).toMatchArray(expectedStack);
    });
    it('pushes true onto the stack', function() {
      var stack = evaluate('{ true }');
      var expectedStack = [true];
      expect(stack).toMatchArray(expectedStack);
    });
    it('truncates a number', function() {
      var stack = evaluate('{ 35.004 truncate }');
      var expectedStack = [35];
      expect(stack).toMatchArray(expectedStack);
    });
    it('calculates an exclusive or value', function() {
      var stack = evaluate('{ 3 9 xor }');
      var expectedStack = [10];
      expect(stack).toMatchArray(expectedStack);
    });
  });


  describe('PostScriptCompiler', function() {
    function check(code, domain, range, samples) {
      var compiler = new PostScriptCompiler();
      var compiledCode = compiler.compile(code, domain, range);
      if (samples === null) {
        expect(compiledCode).toBeNull();
      } else {
        expect(compiledCode).not.toBeNull();
        // eslint-disable-next-line no-new-func
        var fn = new Function('src', 'srcOffset', 'dest', 'destOffset',
                              compiledCode);
        for (var i = 0; i < samples.length; i++) {
          var out = new Float32Array(samples[i].output.length);
          fn(samples[i].input, 0, out, 0);
          expect(Array.prototype.slice.call(out, 0)).
            toMatchArray(samples[i].output);
        }
      }
    }

    it('check compiled add', function() {
      check([0.25, 0.5, 'add'], [], [0, 1], [{input: [], output: [0.75]}]);
      check([0, 'add'], [0, 1], [0, 1], [{input: [0.25], output: [0.25]}]);
      check([0.5, 'add'], [0, 1], [0, 1], [{input: [0.25], output: [0.75]}]);
      check([0, 'exch', 'add'], [0, 1], [0, 1],
            [{input: [0.25], output: [0.25]}]);
      check([0.5, 'exch', 'add'], [0, 1], [0, 1],
            [{input: [0.25], output: [0.75]}]);
      check(['add'], [0, 1, 0, 1], [0, 1],
            [{input: [0.25, 0.5], output: [0.75]}]);
      check(['add'], [0, 1], [0, 1], null);
    });
    it('check compiled sub', function() {
      check([0.5, 0.25, 'sub'], [], [0, 1], [{input: [], output: [0.25]}]);
      check([0, 'sub'], [0, 1], [0, 1], [{input: [0.25], output: [0.25]}]);
      check([0.5, 'sub'], [0, 1], [0, 1], [{input: [0.75], output: [0.25]}]);
      check([0, 'exch', 'sub'], [0, 1], [-1, 1],
            [{input: [0.25], output: [-0.25]}]);
      check([0.75, 'exch', 'sub'], [0, 1], [-1, 1],
            [{input: [0.25], output: [0.5]}]);
      check(['sub'], [0, 1, 0, 1], [-1, 1],
            [{input: [0.25, 0.5], output: [-0.25]}]);
      check(['sub'], [0, 1], [0, 1], null);

      check([1, 'dup', 3, 2, 'roll', 'sub', 'sub'], [0, 1], [0, 1],
            [{input: [0.75], output: [0.75]}]);
    });
    it('check compiled mul', function() {
      check([0.25, 0.5, 'mul'], [], [0, 1], [{input: [], output: [0.125]}]);
      check([0, 'mul'], [0, 1], [0, 1], [{input: [0.25], output: [0]}]);
      check([0.5, 'mul'], [0, 1], [0, 1], [{input: [0.25], output: [0.125]}]);
      check([1, 'mul'], [0, 1], [0, 1], [{input: [0.25], output: [0.25]}]);
      check([0, 'exch', 'mul'], [0, 1], [0, 1], [{input: [0.25], output: [0]}]);
      check([0.5, 'exch', 'mul'], [0, 1], [0, 1],
            [{input: [0.25], output: [0.125]}]);
      check([1, 'exch', 'mul'], [0, 1], [0, 1],
            [{input: [0.25], output: [0.25]}]);
      check(['mul'], [0, 1, 0, 1], [0, 1],
            [{input: [0.25, 0.5], output: [0.125]}]);
      check(['mul'], [0, 1], [0, 1], null);
    });
    it('check compiled max', function() {
      check(['dup', 0.75, 'gt', 7, 'jz', 'pop', 0.75], [0, 1], [0, 1],
            [{input: [0.5], output: [0.5]}]);
      check(['dup', 0.75, 'gt', 7, 'jz', 'pop', 0.75], [0, 1], [0, 1],
            [{input: [1], output: [0.75]}]);
      check(['dup', 0.75, 'gt', 5, 'jz', 'pop', 0.75], [0, 1], [0, 1], null);
    });
    it('check pop/roll/index', function() {
      check([1, 'pop'], [0, 1], [0, 1], [{input: [0.5], output: [0.5]}]);
      check([1, 3, -1, 'roll'], [0, 1, 0, 1], [0, 1, 0, 1, 0, 1],
            [{input: [0.25, 0.5], output: [0.5, 1, 0.25]}]);
      check([1, 3, 1, 'roll'], [0, 1, 0, 1], [0, 1, 0, 1, 0, 1],
            [{input: [0.25, 0.5], output: [1, 0.25, 0.5]}]);
      check([1, 3, 1.5, 'roll'], [0, 1, 0, 1], [0, 1, 0, 1, 0, 1], null);
      check([1, 1, 'index'], [0, 1], [0, 1, 0, 1, 0, 1],
            [{input: [0.5], output: [0.5, 1, 0.5]}]);
      check([1, 3, 'index', 'pop'], [0, 1], [0, 1], null);
      check([1, 0.5, 'index', 'pop'], [0, 1], [0, 1], null);
    });
    it('check input boundaries', function () {
      check([], [0, 0.5], [0, 1], [{input: [1], output: [0.5]}]);
      check([], [0.5, 1], [0, 1], [{input: [0], output: [0.5]}]);
      check(['dup'], [0.5, 0.75], [0, 1, 0, 1],
            [{input: [0], output: [0.5, 0.5]}]);
      check([], [100, 1001], [0, 10000], [{input: [1000], output: [1000]}]);
    });
    it('check output boundaries', function () {
      check([], [0, 1], [0, 0.5], [{input: [1], output: [0.5]}]);
      check([], [0, 1], [0.5, 1], [{input: [0], output: [0.5]}]);
      check(['dup'], [0, 1], [0.5, 1, 0.75, 1],
            [{input: [0], output: [0.5, 0.75]}]);
      check([], [0, 10000], [100, 1001], [{input: [1000], output: [1000]}]);
    });
    it('compile optimized', function () {
      var compiler = new PostScriptCompiler();
      var code = [0, 'add', 1, 1, 3, -1, 'roll', 'sub', 'sub', 1, 'mul'];
      var compiledCode = compiler.compile(code, [0, 1], [0, 1]);
      expect(compiledCode).toEqual(
        'dest[destOffset + 0] = Math.max(0, Math.min(1, src[srcOffset + 0]));');

    });
  });
});
}));
