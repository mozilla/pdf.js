/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

describe('parser', function() {
  describe('Lexer', function() {
    it('should stop parsing numbers at the end of stream', function() {
      var input = new StringStream('1.234');
      var lexer = new Lexer(input);
      var result = lexer.getNumber('1');

      expect(result).toEqual(11.234);
    });
  });
});

