/* globals expect, it, describe, beforeEach, Name, Dict, Ref, RefSet, Cmd,
           jasmine */

'use strict';

describe('primitives', function() {

  describe('Name', function() {
    it('should retain the given name', function() {
      var givenName = 'Font';
      var name = Name.get(givenName);
      expect(name.name).toEqual(givenName);
    });
  });

  describe('Cmd', function() {
    it('should retain the given cmd name', function() {
      var givenCmd = 'BT';
      var cmd = new Cmd(givenCmd);
      expect(cmd.cmd).toEqual(givenCmd);
    });

    it('should create only one object for a command and cache it', function() {
      var firstBT = Cmd.get('BT');
      var secondBT = Cmd.get('BT');
      var firstET = Cmd.get('ET');
      var secondET = Cmd.get('ET');
      expect(firstBT).toBe(secondBT);
      expect(firstET).toBe(secondET);
      expect(firstBT).not.toBe(firstET);
    });
  });

  describe('Dict', function() {
    var checkInvalidHasValues = function(dict) {
      expect(dict.has()).toBeFalsy();
      expect(dict.has('Prev')).toBeFalsy();
    };

    var checkInvalidKeyValues = function(dict) {
      expect(dict.get()).toBeUndefined();
      expect(dict.get('Prev')).toBeUndefined();
      expect(dict.get('Decode', 'D')).toBeUndefined();

      // Note that the getter with three arguments breaks the pattern here.
      expect(dict.get('FontFile', 'FontFile2', 'FontFile3')).toBeNull();
    };

    var emptyDict, dictWithSizeKey, dictWithManyKeys;
    var storedSize = 42;
    var testFontFile = 'file1';
    var testFontFile2 = 'file2';
    var testFontFile3 = 'file3';

    beforeEach(function() {
      emptyDict = new Dict();

      dictWithSizeKey = new Dict();
      dictWithSizeKey.set('Size', storedSize);

      dictWithManyKeys = new Dict();
      dictWithManyKeys.set('FontFile', testFontFile);
      dictWithManyKeys.set('FontFile2', testFontFile2);
      dictWithManyKeys.set('FontFile3', testFontFile3);
    });

    it('should return invalid values for unknown keys', function() {
      checkInvalidHasValues(emptyDict);
      checkInvalidKeyValues(emptyDict);
    });

    it('should return correct value for stored Size key', function() {
      expect(dictWithSizeKey.has('Size')).toBeTruthy();

      expect(dictWithSizeKey.get('Size')).toEqual(storedSize);
      expect(dictWithSizeKey.get('Prev', 'Size')).toEqual(storedSize);
      expect(dictWithSizeKey.get('Prev', 'Root', 'Size')).toEqual(storedSize);
    });

    it('should return invalid values for unknown keys when Size key is stored',
       function() {
      checkInvalidHasValues(dictWithSizeKey);
      checkInvalidKeyValues(dictWithSizeKey);
    });

    it('should return correct value for stored Size key with undefined value',
       function() {
      var dict = new Dict();
      dict.set('Size');

      expect(dict.has('Size')).toBeTruthy();

      checkInvalidKeyValues(dict);
    });

    it('should return correct values for multiple stored keys', function() {
      expect(dictWithManyKeys.has('FontFile')).toBeTruthy();
      expect(dictWithManyKeys.has('FontFile2')).toBeTruthy();
      expect(dictWithManyKeys.has('FontFile3')).toBeTruthy();

      expect(dictWithManyKeys.get('FontFile3')).toEqual(testFontFile3);
      expect(dictWithManyKeys.get('FontFile2', 'FontFile3'))
                             .toEqual(testFontFile2);
      expect(dictWithManyKeys.get('FontFile', 'FontFile2', 'FontFile3'))
                             .toEqual(testFontFile);
    });

    it('should callback for each stored key', function() {
      var callbackSpy = jasmine.createSpy('spy on callback in dictionary');

      dictWithManyKeys.forEach(callbackSpy);

      expect(callbackSpy).wasCalled();
      expect(callbackSpy.argsForCall[0]).toEqual(['FontFile', testFontFile]);
      expect(callbackSpy.argsForCall[1]).toEqual(['FontFile2', testFontFile2]);
      expect(callbackSpy.argsForCall[2]).toEqual(['FontFile3', testFontFile3]);
      expect(callbackSpy.callCount).toEqual(3);
    });
  });

  describe('Ref', function() {
    it('should retain the stored values', function() {
      var storedNum = 4;
      var storedGen = 2;
      var ref = new Ref(storedNum, storedGen);
      expect(ref.num).toEqual(storedNum);
      expect(ref.gen).toEqual(storedGen);
    });
  });

  describe('RefSet', function() {
    it('should have a stored value', function() {
      var ref = new Ref(4, 2);
      var refset = new RefSet();
      refset.put(ref);
      expect(refset.has(ref)).toBeTruthy();
    });
    it('should not have an unknown value', function() {
      var ref = new Ref(4, 2);
      var refset = new RefSet();
      expect(refset.has(ref)).toBeFalsy();

      refset.put(ref);
      var anotherRef = new Ref(2, 4);
      expect(refset.has(anotherRef)).toBeFalsy();
    });
  });
});
