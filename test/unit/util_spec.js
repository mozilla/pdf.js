/* globals describe, it, expect, stringToPDFString, removeNullCharacters */

'use strict';

describe('util', function() {
  describe('stringToPDFString', function() {
    it('handles ISO Latin 1 strings', function() {
      var str = '\x8Dstring\x8E';
      expect(stringToPDFString(str)).toEqual('\u201Cstring\u201D');
    });

    it('handles UTF-16BE strings', function() {
      var str = '\xFE\xFF\x00\x73\x00\x74\x00\x72\x00\x69\x00\x6E\x00\x67';
      expect(stringToPDFString(str)).toEqual('string');
    });

    it('handles empty strings', function() {
      // ISO Latin 1
      var str1 = '';
      expect(stringToPDFString(str1)).toEqual('');

      // UTF-16BE
      var str2 = '\xFE\xFF';
      expect(stringToPDFString(str2)).toEqual('');
    });
  });

  describe('removeNullCharacters', function() {
    it('should not modify string without null characters', function() {
      var str = 'string without null chars';
      expect(removeNullCharacters(str)).toEqual('string without null chars');
    });

    it('should modify string with null characters', function() {
      var str = 'string\x00With\x00Null\x00Chars';
      expect(removeNullCharacters(str)).toEqual('stringWithNullChars');
    });
  });
});
