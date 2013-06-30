/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* globals expect, it, describe, StringStream, Lexer */

'use strict';

describe('parser', function() {
  describe('Lexer', function() {
    it('should stop parsing numbers at the end of stream', function() {
      var input = new StringStream('11.234');
      var lexer = new Lexer(input);
      var result = lexer.getNumber();

      expect(result).toEqual(11.234);
    });

    it('should stop parsing strings at the end of stream', function() {
      var input = new StringStream('(1$4)');
      input.getByte = function(super_getByte) {
        // simulating end of file using null (see issue 2766)
        var ch = super_getByte.call(input);
        return ch === 0x24 /* '$' */ ? -1 : ch;
      }.bind(input, input.getByte);
      var lexer = new Lexer(input);
      var result = lexer.getString();

      expect(result).toEqual('1');
    });

    it('should not throw exception on bad input', function() {
      // '8 0 2 15 5 2 2 2 4 3 2 4'
      // should be parsed as
      // '80 21 55 22 24 32'
      var input = new StringStream('<7 0 2 15 5 2 2 2 4 3 2 4>');
      var lexer = new Lexer(input);
      var result = lexer.getHexString();

      expect(result).toEqual('p!U"$2');
    });
  });
});

