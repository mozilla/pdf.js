/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

var _primitives = require("../../core/primitives.js");

var _test_utils = require("./test_utils.js");

describe("primitives", function () {
  describe("Name", function () {
    it("should retain the given name", function () {
      var givenName = "Font";

      var name = _primitives.Name.get(givenName);

      expect(name.name).toEqual(givenName);
    });
    it("should create only one object for a name and cache it", function () {
      var firstFont = _primitives.Name.get("Font");

      var secondFont = _primitives.Name.get("Font");

      var firstSubtype = _primitives.Name.get("Subtype");

      var secondSubtype = _primitives.Name.get("Subtype");

      expect(firstFont).toBe(secondFont);
      expect(firstSubtype).toBe(secondSubtype);
      expect(firstFont).not.toBe(firstSubtype);
    });
  });
  describe("Cmd", function () {
    it("should retain the given cmd name", function () {
      var givenCmd = "BT";

      var cmd = _primitives.Cmd.get(givenCmd);

      expect(cmd.cmd).toEqual(givenCmd);
    });
    it("should create only one object for a command and cache it", function () {
      var firstBT = _primitives.Cmd.get("BT");

      var secondBT = _primitives.Cmd.get("BT");

      var firstET = _primitives.Cmd.get("ET");

      var secondET = _primitives.Cmd.get("ET");

      expect(firstBT).toBe(secondBT);
      expect(firstET).toBe(secondET);
      expect(firstBT).not.toBe(firstET);
    });
  });
  describe("Dict", function () {
    var checkInvalidHasValues = function (dict) {
      expect(dict.has()).toBeFalsy();
      expect(dict.has("Prev")).toBeFalsy();
    };

    var checkInvalidKeyValues = function (dict) {
      expect(dict.get()).toBeUndefined();
      expect(dict.get("Prev")).toBeUndefined();
      expect(dict.get("Decode", "D")).toBeUndefined();
      expect(dict.get("FontFile", "FontFile2", "FontFile3")).toBeUndefined();
    };

    var emptyDict, dictWithSizeKey, dictWithManyKeys;
    var storedSize = 42;
    var testFontFile = "file1";
    var testFontFile2 = "file2";
    var testFontFile3 = "file3";
    beforeAll(function (done) {
      emptyDict = new _primitives.Dict();
      dictWithSizeKey = new _primitives.Dict();
      dictWithSizeKey.set("Size", storedSize);
      dictWithManyKeys = new _primitives.Dict();
      dictWithManyKeys.set("FontFile", testFontFile);
      dictWithManyKeys.set("FontFile2", testFontFile2);
      dictWithManyKeys.set("FontFile3", testFontFile3);
      done();
    });
    afterAll(function () {
      emptyDict = dictWithSizeKey = dictWithManyKeys = null;
    });
    it("should return invalid values for unknown keys", function () {
      checkInvalidHasValues(emptyDict);
      checkInvalidKeyValues(emptyDict);
    });
    it("should return correct value for stored Size key", function () {
      expect(dictWithSizeKey.has("Size")).toBeTruthy();
      expect(dictWithSizeKey.get("Size")).toEqual(storedSize);
      expect(dictWithSizeKey.get("Prev", "Size")).toEqual(storedSize);
      expect(dictWithSizeKey.get("Prev", "Root", "Size")).toEqual(storedSize);
    });
    it("should return invalid values for unknown keys when Size key is stored", function () {
      checkInvalidHasValues(dictWithSizeKey);
      checkInvalidKeyValues(dictWithSizeKey);
    });
    it("should not accept to set a key with an undefined value", function () {
      const dict = new _primitives.Dict();
      expect(function () {
        dict.set("Size");
      }).toThrow(new Error('Dict.set: The "value" cannot be undefined.'));
      expect(dict.has("Size")).toBeFalsy();
      checkInvalidKeyValues(dict);
    });
    it("should return correct values for multiple stored keys", function () {
      expect(dictWithManyKeys.has("FontFile")).toBeTruthy();
      expect(dictWithManyKeys.has("FontFile2")).toBeTruthy();
      expect(dictWithManyKeys.has("FontFile3")).toBeTruthy();
      expect(dictWithManyKeys.get("FontFile3")).toEqual(testFontFile3);
      expect(dictWithManyKeys.get("FontFile2", "FontFile3")).toEqual(testFontFile2);
      expect(dictWithManyKeys.get("FontFile", "FontFile2", "FontFile3")).toEqual(testFontFile);
    });
    it("should asynchronously fetch unknown keys", function (done) {
      var keyPromises = [dictWithManyKeys.getAsync("Size"), dictWithSizeKey.getAsync("FontFile", "FontFile2", "FontFile3")];
      Promise.all(keyPromises).then(function (values) {
        expect(values[0]).toBeUndefined();
        expect(values[1]).toBeUndefined();
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it("should asynchronously fetch correct values for multiple stored keys", function (done) {
      var keyPromises = [dictWithManyKeys.getAsync("FontFile3"), dictWithManyKeys.getAsync("FontFile2", "FontFile3"), dictWithManyKeys.getAsync("FontFile", "FontFile2", "FontFile3")];
      Promise.all(keyPromises).then(function (values) {
        expect(values[0]).toEqual(testFontFile3);
        expect(values[1]).toEqual(testFontFile2);
        expect(values[2]).toEqual(testFontFile);
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it("should callback for each stored key", function () {
      var callbackSpy = jasmine.createSpy("spy on callback in dictionary");
      dictWithManyKeys.forEach(callbackSpy);
      expect(callbackSpy).toHaveBeenCalled();
      var callbackSpyCalls = callbackSpy.calls;
      expect(callbackSpyCalls.argsFor(0)).toEqual(["FontFile", testFontFile]);
      expect(callbackSpyCalls.argsFor(1)).toEqual(["FontFile2", testFontFile2]);
      expect(callbackSpyCalls.argsFor(2)).toEqual(["FontFile3", testFontFile3]);
      expect(callbackSpyCalls.count()).toEqual(3);
    });
    it("should handle keys pointing to indirect objects, both sync and async", function (done) {
      var fontRef = _primitives.Ref.get(1, 0);

      var xref = new _test_utils.XRefMock([{
        ref: fontRef,
        data: testFontFile
      }]);
      var fontDict = new _primitives.Dict(xref);
      fontDict.set("FontFile", fontRef);
      expect(fontDict.getRaw("FontFile")).toEqual(fontRef);
      expect(fontDict.get("FontFile", "FontFile2", "FontFile3")).toEqual(testFontFile);
      fontDict.getAsync("FontFile", "FontFile2", "FontFile3").then(function (value) {
        expect(value).toEqual(testFontFile);
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it("should handle arrays containing indirect objects", function () {
      var minCoordRef = _primitives.Ref.get(1, 0),
          maxCoordRef = _primitives.Ref.get(2, 0);

      var minCoord = 0,
          maxCoord = 1;
      var xref = new _test_utils.XRefMock([{
        ref: minCoordRef,
        data: minCoord
      }, {
        ref: maxCoordRef,
        data: maxCoord
      }]);
      var xObjectDict = new _primitives.Dict(xref);
      xObjectDict.set("BBox", [minCoord, maxCoord, minCoordRef, maxCoordRef]);
      expect(xObjectDict.get("BBox")).toEqual([minCoord, maxCoord, minCoordRef, maxCoordRef]);
      expect(xObjectDict.getArray("BBox")).toEqual([minCoord, maxCoord, minCoord, maxCoord]);
    });
    it("should get all key names", function () {
      var expectedKeys = ["FontFile", "FontFile2", "FontFile3"];
      var keys = dictWithManyKeys.getKeys();
      expect(keys.sort()).toEqual(expectedKeys);
    });
    it("should create only one object for Dict.empty", function () {
      var firstDictEmpty = _primitives.Dict.empty;
      var secondDictEmpty = _primitives.Dict.empty;
      expect(firstDictEmpty).toBe(secondDictEmpty);
      expect(firstDictEmpty).not.toBe(emptyDict);
    });
    it("should correctly merge dictionaries", function () {
      var expectedKeys = ["FontFile", "FontFile2", "FontFile3", "Size"];
      var fontFileDict = new _primitives.Dict();
      fontFileDict.set("FontFile", "Type1 font file");

      var mergedDict = _primitives.Dict.merge(null, [dictWithManyKeys, dictWithSizeKey, fontFileDict]);

      var mergedKeys = mergedDict.getKeys();
      expect(mergedKeys.sort()).toEqual(expectedKeys);
      expect(mergedDict.get("FontFile")).toEqual(testFontFile);
    });
  });
  describe("Ref", function () {
    it("should retain the stored values", function () {
      var storedNum = 4;
      var storedGen = 2;

      var ref = _primitives.Ref.get(storedNum, storedGen);

      expect(ref.num).toEqual(storedNum);
      expect(ref.gen).toEqual(storedGen);
    });
  });
  describe("RefSet", function () {
    it("should have a stored value", function () {
      var ref = _primitives.Ref.get(4, 2);

      var refset = new _primitives.RefSet();
      refset.put(ref);
      expect(refset.has(ref)).toBeTruthy();
    });
    it("should not have an unknown value", function () {
      var ref = _primitives.Ref.get(4, 2);

      var refset = new _primitives.RefSet();
      expect(refset.has(ref)).toBeFalsy();
      refset.put(ref);

      var anotherRef = _primitives.Ref.get(2, 4);

      expect(refset.has(anotherRef)).toBeFalsy();
    });
  });
  describe("isName", function () {
    it("handles non-names", function () {
      var nonName = {};
      expect((0, _primitives.isName)(nonName)).toEqual(false);
    });
    it("handles names", function () {
      var name = _primitives.Name.get("Font");

      expect((0, _primitives.isName)(name)).toEqual(true);
    });
    it("handles names with name check", function () {
      var name = _primitives.Name.get("Font");

      expect((0, _primitives.isName)(name, "Font")).toEqual(true);
      expect((0, _primitives.isName)(name, "Subtype")).toEqual(false);
    });
  });
  describe("isCmd", function () {
    it("handles non-commands", function () {
      var nonCmd = {};
      expect((0, _primitives.isCmd)(nonCmd)).toEqual(false);
    });
    it("handles commands", function () {
      var cmd = _primitives.Cmd.get("BT");

      expect((0, _primitives.isCmd)(cmd)).toEqual(true);
    });
    it("handles commands with cmd check", function () {
      var cmd = _primitives.Cmd.get("BT");

      expect((0, _primitives.isCmd)(cmd, "BT")).toEqual(true);
      expect((0, _primitives.isCmd)(cmd, "ET")).toEqual(false);
    });
  });
  describe("isDict", function () {
    it("handles non-dictionaries", function () {
      var nonDict = {};
      expect((0, _primitives.isDict)(nonDict)).toEqual(false);
    });
    it("handles empty dictionaries with type check", function () {
      var dict = _primitives.Dict.empty;
      expect((0, _primitives.isDict)(dict)).toEqual(true);
      expect((0, _primitives.isDict)(dict, "Page")).toEqual(false);
    });
    it("handles dictionaries with type check", function () {
      var dict = new _primitives.Dict();
      dict.set("Type", _primitives.Name.get("Page"));
      expect((0, _primitives.isDict)(dict, "Page")).toEqual(true);
      expect((0, _primitives.isDict)(dict, "Contents")).toEqual(false);
    });
  });
  describe("isRef", function () {
    it("handles non-refs", function () {
      var nonRef = {};
      expect((0, _primitives.isRef)(nonRef)).toEqual(false);
    });
    it("handles refs", function () {
      var ref = _primitives.Ref.get(1, 0);

      expect((0, _primitives.isRef)(ref)).toEqual(true);
    });
  });
  describe("isRefsEqual", function () {
    it("should handle Refs pointing to the same object", function () {
      var ref1 = _primitives.Ref.get(1, 0);

      var ref2 = _primitives.Ref.get(1, 0);

      expect((0, _primitives.isRefsEqual)(ref1, ref2)).toEqual(true);
    });
    it("should handle Refs pointing to different objects", function () {
      var ref1 = _primitives.Ref.get(1, 0);

      var ref2 = _primitives.Ref.get(2, 0);

      expect((0, _primitives.isRefsEqual)(ref1, ref2)).toEqual(false);
    });
  });
});