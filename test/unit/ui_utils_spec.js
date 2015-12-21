/* globals expect, it, describe, binarySearchFirstItem, removeNullCharacters */

'use strict';

describe('ui_utils', function() {
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

  describe('binary search', function() {
    function isTrue(boolean) {
      return boolean;
    }
    function isGreater3(number) {
      return number > 3;
    }

    it('empty array', function() {
      expect(binarySearchFirstItem([], isTrue)).toEqual(0);
    });
    it('single boolean entry', function() {
      expect(binarySearchFirstItem([false], isTrue)).toEqual(1);
      expect(binarySearchFirstItem([true], isTrue)).toEqual(0);
    });
    it('three boolean entries', function() {
      expect(binarySearchFirstItem([true, true, true], isTrue)).toEqual(0);
      expect(binarySearchFirstItem([false, true, true], isTrue)).toEqual(1);
      expect(binarySearchFirstItem([false, false, true], isTrue)).toEqual(2);
      expect(binarySearchFirstItem([false, false, false], isTrue)).toEqual(3);
    });
    it('three numeric entries', function() {
      expect(binarySearchFirstItem([0, 1, 2], isGreater3)).toEqual(3);
      expect(binarySearchFirstItem([2, 3, 4], isGreater3)).toEqual(2);
      expect(binarySearchFirstItem([4, 5, 6], isGreater3)).toEqual(0);
    });
  });
});

