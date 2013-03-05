/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* globals expect, it, describe, beforeEach, isArray, StringStream,
           PostScriptParser, PostScriptLexer, PostScriptEvaluator */

'use strict';

describe('function', function() {
  beforeEach(function() {
    this.addMatchers({
      toMatchArray: function(expected) {
        var actual = this.actual;
        if (actual.length != expected.length)
          return false;
        for (var i = 0; i < expected.length; i++) {
          var a = actual[i], b = expected[i];
          if (isArray(b)) {
            if (a.length != b.length)
              return false;
            for (var j = 0; j < a.length; j++) {
              var suba = a[j], subb = b[j];
              if (suba !== subb)
                return false;
            }
          } else {
            if (a !== b)
              return false;
          }
        }
        return true;
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
    it('boolean ands', function() {
      var stack = evaluate('{ true false and }');
      var expectedStack = [false];
      expect(stack).toMatchArray(expectedStack);
    });
    it('bitwise ands', function() {
      var stack = evaluate('{ 254 1 and }');
      var expectedStack = [254 & 1];
      expect(stack).toMatchArray(expectedStack);
    });
    // TODO atan
    // TODO bitshift
    // TODO ceiling
    // TODO copy
    // TODO cos
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
    // TODO cvr
    // TODO div
    it('duplicates', function() {
      var stack = evaluate('{ 99 dup }');
      var expectedStack = [99, 99];
      expect(stack).toMatchArray(expectedStack);
    });
    // TODO eq
    it('exchanges', function() {
      var stack = evaluate('{ 44 99 exch }');
      var expectedStack = [99, 44];
      expect(stack).toMatchArray(expectedStack);
    });
    // TODO exp
    // TODO false
    // TODO floor
    // TODO ge
    // TODO gt
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
    // TODO le
    // TODO ln
    // TODO log
    // TODO lt
    // TODO mod
    // TODO mul
    // TODO ne
    // TODO neg
    // TODO not
    // TODO or
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
    // TODO round
    // TODO sin
    // TODO sqrt
    // TODO sub
    // TODO true
    // TODO truncate
    // TODO xor
  });
});

