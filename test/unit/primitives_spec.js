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

import {
  Cmd,
  Dict,
  isCmd,
  isDict,
  isName,
  isRefsEqual,
  Name,
  Ref,
  RefSet,
  RefSetCache,
} from "../../src/core/primitives.js";
import { StringStream } from "../../src/core/stream.js";
import { XRefMock } from "./test_utils.js";

describe("primitives", function () {
  describe("Name", function () {
    it("should retain the given name", function () {
      const givenName = "Font";
      const name = Name.get(givenName);
      expect(name.name).toEqual(givenName);
    });

    it("should create only one object for a name and cache it", function () {
      const firstFont = Name.get("Font");
      const secondFont = Name.get("Font");
      const firstSubtype = Name.get("Subtype");
      const secondSubtype = Name.get("Subtype");

      expect(firstFont).toBe(secondFont);
      expect(firstSubtype).toBe(secondSubtype);
      expect(firstFont).not.toBe(firstSubtype);
    });

    it("should create only one object for *empty* names and cache it", function () {
      const firstEmpty = Name.get("");
      const secondEmpty = Name.get("");
      const normalName = Name.get("string");

      expect(firstEmpty).toBe(secondEmpty);
      expect(firstEmpty).not.toBe(normalName);
    });

    it("should not accept to create a non-string name", function () {
      expect(function () {
        Name.get(123);
      }).toThrow(new Error('Name: The "name" must be a string.'));
    });
  });

  describe("Cmd", function () {
    it("should retain the given cmd name", function () {
      const givenCmd = "BT";
      const cmd = Cmd.get(givenCmd);
      expect(cmd.cmd).toEqual(givenCmd);
    });

    it("should create only one object for a command and cache it", function () {
      const firstBT = Cmd.get("BT");
      const secondBT = Cmd.get("BT");
      const firstET = Cmd.get("ET");
      const secondET = Cmd.get("ET");

      expect(firstBT).toBe(secondBT);
      expect(firstET).toBe(secondET);
      expect(firstBT).not.toBe(firstET);
    });

    it("should not accept to create a non-string cmd", function () {
      expect(function () {
        Cmd.get(123);
      }).toThrow(new Error('Cmd: The "cmd" must be a string.'));
    });
  });

  describe("Dict", function () {
    const checkInvalidHasValues = function (dict) {
      expect(dict.has()).toBeFalsy();
      expect(dict.has("Prev")).toBeFalsy();
    };

    const checkInvalidKeyValues = function (dict) {
      expect(dict.get()).toBeUndefined();
      expect(dict.get("Prev")).toBeUndefined();
      expect(dict.get("D", "Decode")).toBeUndefined();
      expect(dict.get("FontFile", "FontFile2", "FontFile3")).toBeUndefined();
    };

    let emptyDict, dictWithSizeKey, dictWithManyKeys;
    const storedSize = 42;
    const testFontFile = "file1";
    const testFontFile2 = "file2";
    const testFontFile3 = "file3";

    beforeAll(function () {
      emptyDict = new Dict();

      dictWithSizeKey = new Dict();
      dictWithSizeKey.set("Size", storedSize);

      dictWithManyKeys = new Dict();
      dictWithManyKeys.set("FontFile", testFontFile);
      dictWithManyKeys.set("FontFile2", testFontFile2);
      dictWithManyKeys.set("FontFile3", testFontFile3);
    });

    afterAll(function () {
      emptyDict = dictWithSizeKey = dictWithManyKeys = null;
    });

    it("should allow assigning an XRef table after creation", function () {
      const dict = new Dict(null);
      expect(dict.xref).toEqual(null);

      const xref = new XRefMock([]);
      dict.assignXref(xref);
      expect(dict.xref).toEqual(xref);
    });

    it("should return correct size", function () {
      const dict = new Dict(null);
      expect(dict.size).toEqual(0);

      dict.set("Type", Name.get("Page"));
      expect(dict.size).toEqual(1);

      dict.set("Contents", Ref.get(10, 0));
      expect(dict.size).toEqual(2);
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

    it("should not accept to set a non-string key", function () {
      const dict = new Dict();
      expect(function () {
        dict.set(123, "val");
      }).toThrow(new Error('Dict.set: The "key" must be a string.'));

      expect(dict.has(123)).toBeFalsy();

      checkInvalidKeyValues(dict);
    });

    it("should not accept to set a key with an undefined value", function () {
      const dict = new Dict();
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
      expect(dictWithManyKeys.get("FontFile2", "FontFile3")).toEqual(
        testFontFile2
      );
      expect(
        dictWithManyKeys.get("FontFile", "FontFile2", "FontFile3")
      ).toEqual(testFontFile);
    });

    it("should asynchronously fetch unknown keys", async function () {
      const keyPromises = [
        dictWithManyKeys.getAsync("Size"),
        dictWithSizeKey.getAsync("FontFile", "FontFile2", "FontFile3"),
      ];

      const values = await Promise.all(keyPromises);
      expect(values[0]).toBeUndefined();
      expect(values[1]).toBeUndefined();
    });

    it("should asynchronously fetch correct values for multiple stored keys", async function () {
      const keyPromises = [
        dictWithManyKeys.getAsync("FontFile3"),
        dictWithManyKeys.getAsync("FontFile2", "FontFile3"),
        dictWithManyKeys.getAsync("FontFile", "FontFile2", "FontFile3"),
      ];

      const values = await Promise.all(keyPromises);
      expect(values[0]).toEqual(testFontFile3);
      expect(values[1]).toEqual(testFontFile2);
      expect(values[2]).toEqual(testFontFile);
    });

    it("should iterate through each stored key", function () {
      expect([...dictWithManyKeys]).toEqual([
        ["FontFile", testFontFile],
        ["FontFile2", testFontFile2],
        ["FontFile3", testFontFile3],
      ]);
    });

    it("should handle keys pointing to indirect objects, both sync and async", async function () {
      const fontRef = Ref.get(1, 0);
      const xref = new XRefMock([{ ref: fontRef, data: testFontFile }]);
      const fontDict = new Dict(xref);
      fontDict.set("FontFile", fontRef);

      expect(fontDict.getRaw("FontFile")).toEqual(fontRef);
      expect(fontDict.get("FontFile", "FontFile2", "FontFile3")).toEqual(
        testFontFile
      );

      const value = await fontDict.getAsync(
        "FontFile",
        "FontFile2",
        "FontFile3"
      );
      expect(value).toEqual(testFontFile);
    });

    it("should handle arrays containing indirect objects", function () {
      const minCoordRef = Ref.get(1, 0);
      const maxCoordRef = Ref.get(2, 0);
      const minCoord = 0;
      const maxCoord = 1;
      const xref = new XRefMock([
        { ref: minCoordRef, data: minCoord },
        { ref: maxCoordRef, data: maxCoord },
      ]);
      const xObjectDict = new Dict(xref);
      xObjectDict.set("BBox", [minCoord, maxCoord, minCoordRef, maxCoordRef]);

      expect(xObjectDict.get("BBox")).toEqual([
        minCoord,
        maxCoord,
        minCoordRef,
        maxCoordRef,
      ]);
      expect(xObjectDict.getArray("BBox")).toEqual([
        minCoord,
        maxCoord,
        minCoord,
        maxCoord,
      ]);
    });

    it("should get all key names", function () {
      const expectedKeys = ["FontFile", "FontFile2", "FontFile3"];
      const keys = dictWithManyKeys.getKeys();

      expect(keys.sort()).toEqual(expectedKeys);
    });

    it("should get all raw values", function () {
      // Test direct objects:
      const expectedRawValues1 = [testFontFile, testFontFile2, testFontFile3];
      const rawValues1 = dictWithManyKeys.getRawValues();

      expect(rawValues1.sort()).toEqual(expectedRawValues1);

      // Test indirect objects:
      const typeName = Name.get("Page");
      const resources = new Dict(null),
        resourcesRef = Ref.get(5, 0);
      const contents = new StringStream("data"),
        contentsRef = Ref.get(10, 0);
      const xref = new XRefMock([
        { ref: resourcesRef, data: resources },
        { ref: contentsRef, data: contents },
      ]);

      const dict = new Dict(xref);
      dict.set("Type", typeName);
      dict.set("Resources", resourcesRef);
      dict.set("Contents", contentsRef);

      const expectedRawValues2 = [contentsRef, resourcesRef, typeName];
      const rawValues2 = dict.getRawValues();

      expect(rawValues2.sort()).toEqual(expectedRawValues2);
    });

    it("should create only one object for Dict.empty", function () {
      const firstDictEmpty = Dict.empty;
      const secondDictEmpty = Dict.empty;

      expect(firstDictEmpty).toBe(secondDictEmpty);
      expect(firstDictEmpty).not.toBe(emptyDict);
    });

    it("should correctly merge dictionaries", function () {
      const expectedKeys = ["FontFile", "FontFile2", "FontFile3", "Size"];

      const fontFileDict = new Dict();
      fontFileDict.set("FontFile", "Type1 font file");
      const mergedDict = Dict.merge({
        xref: null,
        dictArray: [dictWithManyKeys, dictWithSizeKey, fontFileDict],
      });
      const mergedKeys = mergedDict.getKeys();

      expect(mergedKeys.sort()).toEqual(expectedKeys);
      expect(mergedDict.get("FontFile")).toEqual(testFontFile);
    });

    it("should correctly merge sub-dictionaries", function () {
      const localFontDict = new Dict();
      localFontDict.set("F1", "Local font one");

      const globalFontDict = new Dict();
      globalFontDict.set("F1", "Global font one");
      globalFontDict.set("F2", "Global font two");
      globalFontDict.set("F3", "Global font three");

      const localDict = new Dict();
      localDict.set("Font", localFontDict);

      const globalDict = new Dict();
      globalDict.set("Font", globalFontDict);

      const mergedDict = Dict.merge({
        xref: null,
        dictArray: [localDict, globalDict],
      });
      const mergedSubDict = Dict.merge({
        xref: null,
        dictArray: [localDict, globalDict],
        mergeSubDicts: true,
      });

      const mergedFontDict = mergedDict.get("Font");
      const mergedSubFontDict = mergedSubDict.get("Font");

      expect(mergedFontDict instanceof Dict).toEqual(true);
      expect(mergedSubFontDict instanceof Dict).toEqual(true);

      const mergedFontDictKeys = mergedFontDict.getKeys();
      const mergedSubFontDictKeys = mergedSubFontDict.getKeys();

      expect(mergedFontDictKeys).toEqual(["F1"]);
      expect(mergedSubFontDictKeys).toEqual(["F1", "F2", "F3"]);

      const mergedFontDictValues = mergedFontDict.getRawValues();
      const mergedSubFontDictValues = mergedSubFontDict.getRawValues();

      expect(mergedFontDictValues).toEqual(["Local font one"]);
      expect(mergedSubFontDictValues).toEqual([
        "Local font one",
        "Global font two",
        "Global font three",
      ]);
    });
  });

  describe("Ref", function () {
    it("should get a string representation", function () {
      const nonZeroRef = Ref.get(4, 2);
      expect(nonZeroRef.toString()).toEqual("4R2");

      // If the generation number is 0, a shorter representation is used.
      const zeroRef = Ref.get(4, 0);
      expect(zeroRef.toString()).toEqual("4R");
    });

    it("should retain the stored values", function () {
      const storedNum = 4;
      const storedGen = 2;
      const ref = Ref.get(storedNum, storedGen);
      expect(ref.num).toEqual(storedNum);
      expect(ref.gen).toEqual(storedGen);
    });

    it("should create only one object for a reference and cache it", function () {
      const firstRef = Ref.get(4, 2);
      const secondRef = Ref.get(4, 2);
      const firstOtherRef = Ref.get(5, 2);
      const secondOtherRef = Ref.get(5, 2);

      expect(firstRef).toBe(secondRef);
      expect(firstOtherRef).toBe(secondOtherRef);
      expect(firstRef).not.toBe(firstOtherRef);
    });
  });

  describe("RefSet", function () {
    const ref1 = Ref.get(4, 2),
      ref2 = Ref.get(5, 2);
    let refSet;

    beforeEach(function () {
      refSet = new RefSet();
    });

    afterEach(function () {
      refSet = null;
    });

    it("should have a stored value", function () {
      refSet.put(ref1);
      expect(refSet.has(ref1)).toBeTruthy();
    });

    it("should not have an unknown value", function () {
      expect(refSet.has(ref1)).toBeFalsy();
      refSet.put(ref1);
      expect(refSet.has(ref2)).toBeFalsy();
    });

    it("should support iteration", function () {
      refSet.put(ref1);
      refSet.put(ref2);
      expect([...refSet]).toEqual([ref1.toString(), ref2.toString()]);
    });
  });

  describe("RefSetCache", function () {
    const ref1 = Ref.get(4, 2),
      ref2 = Ref.get(5, 2),
      obj1 = Name.get("foo"),
      obj2 = Name.get("bar");
    let cache;

    beforeEach(function () {
      cache = new RefSetCache();
    });

    afterEach(function () {
      cache = null;
    });

    it("should put, have and get a value", function () {
      cache.put(ref1, obj1);
      expect(cache.has(ref1)).toBeTruthy();
      expect(cache.has(ref2)).toBeFalsy();
      expect(cache.get(ref1)).toBe(obj1);
    });

    it("should put, have and get a value by alias", function () {
      cache.put(ref1, obj1);
      cache.putAlias(ref2, ref1);
      expect(cache.has(ref1)).toBeTruthy();
      expect(cache.has(ref2)).toBeTruthy();
      expect(cache.get(ref1)).toBe(obj1);
      expect(cache.get(ref2)).toBe(obj1);
    });

    it("should report the size of the cache", function () {
      cache.put(ref1, obj1);
      expect(cache.size).toEqual(1);
      cache.put(ref2, obj2);
      expect(cache.size).toEqual(2);
    });

    it("should clear the cache", function () {
      cache.put(ref1, obj1);
      expect(cache.size).toEqual(1);
      cache.clear();
      expect(cache.size).toEqual(0);
    });

    it("should support iteration", function () {
      cache.put(ref1, obj1);
      cache.put(ref2, obj2);
      expect([...cache]).toEqual([obj1, obj2]);
    });

    it("should support iteration over key-value pairs", function () {
      cache.put(ref1, obj1);
      cache.put(ref2, obj2);
      expect([...cache.items()]).toEqual([
        [ref1, obj1],
        [ref2, obj2],
      ]);
    });
  });

  describe("isName", function () {
    /* eslint-disable no-restricted-syntax */

    it("handles non-names", function () {
      const nonName = {};
      expect(isName(nonName)).toEqual(false);
    });

    it("handles names", function () {
      const name = Name.get("Font");
      expect(isName(name)).toEqual(true);
    });

    it("handles names with name check", function () {
      const name = Name.get("Font");
      expect(isName(name, "Font")).toEqual(true);
      expect(isName(name, "Subtype")).toEqual(false);
    });

    it("handles *empty* names, with name check", function () {
      const emptyName = Name.get("");

      expect(isName(emptyName)).toEqual(true);
      expect(isName(emptyName, "")).toEqual(true);
      expect(isName(emptyName, "string")).toEqual(false);
    });

    /* eslint-enable no-restricted-syntax */
  });

  describe("isCmd", function () {
    /* eslint-disable no-restricted-syntax */

    it("handles non-commands", function () {
      const nonCmd = {};
      expect(isCmd(nonCmd)).toEqual(false);
    });

    it("handles commands", function () {
      const cmd = Cmd.get("BT");
      expect(isCmd(cmd)).toEqual(true);
    });

    it("handles commands with cmd check", function () {
      const cmd = Cmd.get("BT");
      expect(isCmd(cmd, "BT")).toEqual(true);
      expect(isCmd(cmd, "ET")).toEqual(false);
    });

    /* eslint-enable no-restricted-syntax */
  });

  describe("isDict", function () {
    /* eslint-disable no-restricted-syntax */

    it("handles non-dictionaries", function () {
      const nonDict = {};
      expect(isDict(nonDict)).toEqual(false);
    });

    it("handles empty dictionaries with type check", function () {
      const dict = Dict.empty;
      expect(isDict(dict)).toEqual(true);
      expect(isDict(dict, "Page")).toEqual(false);
    });

    it("handles dictionaries with type check", function () {
      const dict = new Dict();
      dict.set("Type", Name.get("Page"));
      expect(isDict(dict, "Page")).toEqual(true);
      expect(isDict(dict, "Contents")).toEqual(false);
    });

    /* eslint-enable no-restricted-syntax */
  });

  describe("isRefsEqual", function () {
    it("should handle Refs pointing to the same object", function () {
      const ref1 = Ref.get(1, 0);
      const ref2 = Ref.get(1, 0);
      expect(isRefsEqual(ref1, ref2)).toEqual(true);
    });

    it("should handle Refs pointing to different objects", function () {
      const ref1 = Ref.get(1, 0);
      const ref2 = Ref.get(2, 0);
      expect(isRefsEqual(ref1, ref2)).toEqual(false);
    });
  });
});
