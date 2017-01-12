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
    define('pdfjs-test/unit/primitives_spec', ['exports',
           'pdfjs/core/primitives'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('../../src/core/primitives.js'));
  } else {
    factory((root.pdfjsTestUnitPrimitivesSpec = {}), root.pdfjsCorePrimitives);
  }
}(this, function (exports, corePrimitives) {

var Name = corePrimitives.Name;
var Dict = corePrimitives.Dict;
var Ref = corePrimitives.Ref;
var RefSet = corePrimitives.RefSet;
var Cmd = corePrimitives.Cmd;
var isName = corePrimitives.isName;
var isCmd = corePrimitives.isCmd;
var isDict = corePrimitives.isDict;
var isRef = corePrimitives.isRef;
var isRefsEqual = corePrimitives.isRefsEqual;

describe('primitives', function() {
  function XRefMock(array) {
    this.map = Object.create(null);
    for (var elem in array) {
      var obj = array[elem];
      var ref = obj.ref, data = obj.data;
      this.map[ref.toString()] = data;
    }
  }
  XRefMock.prototype = {
    fetch: function (ref) {
      return this.map[ref.toString()];
    },
    fetchIfRef: function (obj) {
      if (!isRef(obj)) {
        return obj;
      }
      return this.fetch(obj);
    },
    fetchAsync: function (ref) {
      return Promise.resolve(this.fetch(ref));
    },
    fetchIfRefAsync: function (obj) {
      return Promise.resolve(this.fetchIfRef(obj));
    },
  };

  describe('Name', function() {
    it('should retain the given name', function() {
      var givenName = 'Font';
      var name = Name.get(givenName);
      expect(name.name).toEqual(givenName);
    });

    it('should create only one object for a name and cache it', function () {
      var firstFont = Name.get('Font');
      var secondFont = Name.get('Font');
      var firstSubtype = Name.get('Subtype');
      var secondSubtype = Name.get('Subtype');

      expect(firstFont).toBe(secondFont);
      expect(firstSubtype).toBe(secondSubtype);
      expect(firstFont).not.toBe(firstSubtype);
    });
  });

  describe('Cmd', function() {
    it('should retain the given cmd name', function() {
      var givenCmd = 'BT';
      var cmd = Cmd.get(givenCmd);
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

    beforeAll(function (done) {
      emptyDict = new Dict();

      dictWithSizeKey = new Dict();
      dictWithSizeKey.set('Size', storedSize);

      dictWithManyKeys = new Dict();
      dictWithManyKeys.set('FontFile', testFontFile);
      dictWithManyKeys.set('FontFile2', testFontFile2);
      dictWithManyKeys.set('FontFile3', testFontFile3);

      done();
    });

    afterAll(function () {
      emptyDict = dictWithSizeKey = dictWithManyKeys = null;
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

    it('should asynchronously fetch unknown keys', function (done) {
      var keyPromises = [
        dictWithManyKeys.getAsync('Size'),
        dictWithSizeKey.getAsync('FontFile', 'FontFile2', 'FontFile3')
      ];

      Promise.all(keyPromises).then(function (values) {
        expect(values[0]).toBeUndefined();
        expect(values[1]).toBeNull();
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
    });

    it('should asynchronously fetch correct values for multiple stored keys',
        function (done) {
      var keyPromises = [
        dictWithManyKeys.getAsync('FontFile3'),
        dictWithManyKeys.getAsync('FontFile2', 'FontFile3'),
        dictWithManyKeys.getAsync('FontFile', 'FontFile2', 'FontFile3')
      ];

      Promise.all(keyPromises).then(function (values) {
        expect(values[0]).toEqual(testFontFile3);
        expect(values[1]).toEqual(testFontFile2);
        expect(values[2]).toEqual(testFontFile);
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
    });

    it('should callback for each stored key', function() {
      var callbackSpy = jasmine.createSpy('spy on callback in dictionary');

      dictWithManyKeys.forEach(callbackSpy);

      expect(callbackSpy).toHaveBeenCalled();
      var callbackSpyCalls = callbackSpy.calls;
      expect(callbackSpyCalls.argsFor(0)).toEqual(['FontFile', testFontFile]);
      expect(callbackSpyCalls.argsFor(1)).toEqual(['FontFile2', testFontFile2]);
      expect(callbackSpyCalls.argsFor(2)).toEqual(['FontFile3', testFontFile3]);
      expect(callbackSpyCalls.count()).toEqual(3);
    });

    it('should handle keys pointing to indirect objects, both sync and async',
        function (done) {
      var fontRef = new Ref(1, 0);
      var xref = new XRefMock([
        { ref: fontRef, data: testFontFile, }
      ]);
      var fontDict = new Dict(xref);
      fontDict.set('FontFile', fontRef);

      expect(fontDict.getRaw('FontFile')).toEqual(fontRef);
      expect(fontDict.get('FontFile', 'FontFile2', 'FontFile3')).
        toEqual(testFontFile);

      fontDict.getAsync('FontFile', 'FontFile2', 'FontFile3').then(
          function (value) {
        expect(value).toEqual(testFontFile);
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
    });

    it('should handle arrays containing indirect objects', function () {
      var minCoordRef = new Ref(1, 0), maxCoordRef = new Ref(2, 0);
      var minCoord = 0, maxCoord = 1;
      var xref = new XRefMock([
        { ref: minCoordRef, data: minCoord, },
        { ref: maxCoordRef, data: maxCoord, }
      ]);
      var xObjectDict = new Dict(xref);
      xObjectDict.set('BBox', [minCoord, maxCoord, minCoordRef, maxCoordRef]);

      expect(xObjectDict.get('BBox')).toEqual(
        [minCoord, maxCoord, minCoordRef, maxCoordRef]);
      expect(xObjectDict.getArray('BBox')).toEqual(
        [minCoord, maxCoord, minCoord, maxCoord]);
    });

    it('should get all key names', function () {
      var expectedKeys = ['FontFile', 'FontFile2', 'FontFile3'];
      var keys = dictWithManyKeys.getKeys();

      expect(keys.sort()).toEqual(expectedKeys);
    });

    it('should create only one object for Dict.empty', function () {
      var firstDictEmpty = Dict.empty;
      var secondDictEmpty = Dict.empty;

      expect(firstDictEmpty).toBe(secondDictEmpty);
      expect(firstDictEmpty).not.toBe(emptyDict);
    });

    it('should correctly merge dictionaries', function () {
      var expectedKeys = ['FontFile', 'FontFile2', 'FontFile3', 'Size'];

      var fontFileDict = new Dict();
      fontFileDict.set('FontFile', 'Type1 font file');
      var mergedDict = Dict.merge(null,
        [dictWithManyKeys, dictWithSizeKey, fontFileDict]);
      var mergedKeys = mergedDict.getKeys();

      expect(mergedKeys.sort()).toEqual(expectedKeys);
      expect(mergedDict.get('FontFile')).toEqual(testFontFile);
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

  describe('isName', function () {
    it('handles non-names', function () {
      var nonName = {};
      expect(isName(nonName)).toEqual(false);
    });

    it('handles names', function () {
      var name = Name.get('Font');
      expect(isName(name)).toEqual(true);
    });

    it('handles names with name check', function () {
      var name = Name.get('Font');
      expect(isName(name, 'Font')).toEqual(true);
      expect(isName(name, 'Subtype')).toEqual(false);
    });
  });

  describe('isCmd', function () {
    it('handles non-commands', function () {
      var nonCmd = {};
      expect(isCmd(nonCmd)).toEqual(false);
    });

    it('handles commands', function () {
      var cmd = Cmd.get('BT');
      expect(isCmd(cmd)).toEqual(true);
    });

    it('handles commands with cmd check', function () {
      var cmd = Cmd.get('BT');
      expect(isCmd(cmd, 'BT')).toEqual(true);
      expect(isCmd(cmd, 'ET')).toEqual(false);
    });
  });

  describe('isDict', function() {
    it('handles non-dictionaries', function () {
      var nonDict = {};
      expect(isDict(nonDict)).toEqual(false);
    });

    it('handles empty dictionaries with type check', function() {
      var dict = Dict.empty;
      expect(isDict(dict)).toEqual(true);
      expect(isDict(dict, 'Page')).toEqual(false);
    });

    it('handles dictionaries with type check', function() {
      var dict = new Dict();
      dict.set('Type', Name.get('Page'));
      expect(isDict(dict, 'Page')).toEqual(true);
      expect(isDict(dict, 'Contents')).toEqual(false);
    });
  });

  describe('isRef', function () {
    it('handles non-refs', function () {
      var nonRef = {};
      expect(isRef(nonRef)).toEqual(false);
    });

    it('handles refs', function () {
      var ref = new Ref(1, 0);
      expect(isRef(ref)).toEqual(true);
    });
  });

  describe('isRefsEqual', function () {
    it('should handle different Refs pointing to the same object', function () {
      var ref1 = new Ref(1, 0);
      var ref2 = new Ref(1, 0);
      expect(isRefsEqual(ref1, ref2)).toEqual(true);
    });

    it('should handle Refs pointing to different objects', function () {
      var ref1 = new Ref(1, 0);
      var ref2 = new Ref(2, 0);
      expect(isRefsEqual(ref1, ref2)).toEqual(false);
    });
  });
});
}));
