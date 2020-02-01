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

import { Dict, Name, Ref } from "../../src/core/primitives.js";
import { Stream, StringStream } from "../../src/core/stream.js";
import { ColorSpace } from "../../src/core/colorspace.js";
import { PDFFunctionFactory } from "../../src/core/function.js";
import { XRefMock } from "./test_utils.js";

describe("colorspace", function() {
  describe("ColorSpace", function() {
    it("should be true if decode is not an array", function() {
      expect(ColorSpace.isDefaultDecode("string", 0)).toBeTruthy();
    });
    it("should be true if length of decode array is not correct", function() {
      expect(ColorSpace.isDefaultDecode([0], 1)).toBeTruthy();
      expect(ColorSpace.isDefaultDecode([0, 1, 0], 1)).toBeTruthy();
    });
    it("should be true if decode map matches the default decode map", function() {
      expect(ColorSpace.isDefaultDecode([], 0)).toBeTruthy();

      expect(ColorSpace.isDefaultDecode([0, 0], 1)).toBeFalsy();
      expect(ColorSpace.isDefaultDecode([0, 1], 1)).toBeTruthy();

      expect(ColorSpace.isDefaultDecode([0, 1, 0, 1, 0, 1], 3)).toBeTruthy();
      expect(ColorSpace.isDefaultDecode([0, 1, 0, 1, 1, 1], 3)).toBeFalsy();

      expect(
        ColorSpace.isDefaultDecode([0, 1, 0, 1, 0, 1, 0, 1], 4)
      ).toBeTruthy();
      expect(
        ColorSpace.isDefaultDecode([1, 0, 0, 1, 0, 1, 0, 1], 4)
      ).toBeFalsy();
    });
  });

  describe("DeviceGrayCS", function() {
    it("should handle the case when cs is a Name object", function() {
      const cs = Name.get("DeviceGray");
      const xref = new XRefMock([
        {
          ref: Ref.get(10, 0),
          data: new Dict(),
        },
      ]);
      const res = new Dict();

      const pdfFunctionFactory = new PDFFunctionFactory({
        xref,
      });
      const colorSpace = ColorSpace.parse(cs, xref, res, pdfFunctionFactory);

      const testSrc = new Uint8Array([27, 125, 250, 131]);
      const testDest = new Uint8ClampedArray(4 * 4 * 3);
      // prettier-ignore
      const expectedDest = new Uint8ClampedArray([
        27, 27, 27,
        27, 27, 27,
        125, 125, 125,
        125, 125, 125,
        27, 27, 27,
        27, 27, 27,
        125, 125, 125,
        125, 125, 125,
        250, 250, 250,
        250, 250, 250,
        131, 131, 131,
        131, 131, 131,
        250, 250, 250,
        250, 250, 250,
        131, 131, 131,
        131, 131, 131
      ]);
      colorSpace.fillRgb(testDest, 2, 2, 4, 4, 4, 8, testSrc, 0);

      expect(colorSpace.getRgb(new Float32Array([0.1]), 0)).toEqual(
        new Uint8ClampedArray([26, 26, 26])
      );
      expect(colorSpace.getOutputLength(2, 0)).toEqual(6);
      expect(colorSpace.isPassthrough(8)).toBeFalsy();
      expect(testDest).toEqual(expectedDest);
    });
    it("should handle the case when cs is an indirect object", function() {
      const cs = Ref.get(10, 0);
      const xref = new XRefMock([
        {
          ref: cs,
          data: Name.get("DeviceGray"),
        },
      ]);
      const res = new Dict();

      const pdfFunctionFactory = new PDFFunctionFactory({
        xref,
      });
      const colorSpace = ColorSpace.parse(cs, xref, res, pdfFunctionFactory);

      const testSrc = new Uint8Array([27, 125, 250, 131]);
      const testDest = new Uint8ClampedArray(3 * 3 * 3);
      // prettier-ignore
      const expectedDest = new Uint8ClampedArray([
        27, 27, 27,
        27, 27, 27,
        125, 125, 125,
        27, 27, 27,
        27, 27, 27,
        125, 125, 125,
        250, 250, 250,
        250, 250, 250,
        131, 131, 131
      ]);
      colorSpace.fillRgb(testDest, 2, 2, 3, 3, 3, 8, testSrc, 0);

      expect(colorSpace.getRgb(new Float32Array([0.2]), 0)).toEqual(
        new Uint8ClampedArray([51, 51, 51])
      );
      expect(colorSpace.getOutputLength(3, 1)).toEqual(12);
      expect(colorSpace.isPassthrough(8)).toBeFalsy();
      expect(testDest).toEqual(expectedDest);
    });
  });

  describe("DeviceRgbCS", function() {
    it("should handle the case when cs is a Name object", function() {
      const cs = Name.get("DeviceRGB");
      const xref = new XRefMock([
        {
          ref: Ref.get(10, 0),
          data: new Dict(),
        },
      ]);
      const res = new Dict();

      const pdfFunctionFactory = new PDFFunctionFactory({
        xref,
      });
      const colorSpace = ColorSpace.parse(cs, xref, res, pdfFunctionFactory);

      // prettier-ignore
      const testSrc = new Uint8Array([
        27, 125, 250,
        131, 139, 140,
        111, 25, 198,
        21, 147, 255
      ]);
      const testDest = new Uint8ClampedArray(4 * 4 * 3);
      // prettier-ignore
      const expectedDest = new Uint8ClampedArray([
        27, 125, 250,
        27, 125, 250,
        131, 139, 140,
        131, 139, 140,
        27, 125, 250,
        27, 125, 250,
        131, 139, 140,
        131, 139, 140,
        111, 25, 198,
        111, 25, 198,
        21, 147, 255,
        21, 147, 255,
        111, 25, 198,
        111, 25, 198,
        21, 147, 255,
        21, 147, 255
      ]);
      colorSpace.fillRgb(testDest, 2, 2, 4, 4, 4, 8, testSrc, 0);

      expect(colorSpace.getRgb(new Float32Array([0.1, 0.2, 0.3]), 0)).toEqual(
        new Uint8ClampedArray([26, 51, 77])
      );
      expect(colorSpace.getOutputLength(4, 0)).toEqual(4);
      expect(colorSpace.isPassthrough(8)).toBeTruthy();
      expect(testDest).toEqual(expectedDest);
    });
    it("should handle the case when cs is an indirect object", function() {
      const cs = Ref.get(10, 0);
      const xref = new XRefMock([
        {
          ref: cs,
          data: Name.get("DeviceRGB"),
        },
      ]);
      const res = new Dict();

      const pdfFunctionFactory = new PDFFunctionFactory({
        xref,
      });
      const colorSpace = ColorSpace.parse(cs, xref, res, pdfFunctionFactory);

      // prettier-ignore
      const testSrc = new Uint8Array([
        27, 125, 250,
        131, 139, 140,
        111, 25, 198,
        21, 147, 255
      ]);
      const testDest = new Uint8ClampedArray(3 * 3 * 3);
      // prettier-ignore
      const expectedDest = new Uint8ClampedArray([
        27, 125, 250,
        27, 125, 250,
        131, 139, 140,
        27, 125, 250,
        27, 125, 250,
        131, 139, 140,
        111, 25, 198,
        111, 25, 198,
        21, 147, 255
      ]);
      colorSpace.fillRgb(testDest, 2, 2, 3, 3, 3, 8, testSrc, 0);

      expect(colorSpace.getRgb(new Float32Array([0.1, 0.2, 0.3]), 0)).toEqual(
        new Uint8ClampedArray([26, 51, 77])
      );
      expect(colorSpace.getOutputLength(4, 1)).toEqual(5);
      expect(colorSpace.isPassthrough(8)).toBeTruthy();
      expect(testDest).toEqual(expectedDest);
    });
  });

  describe("DeviceCmykCS", function() {
    it("should handle the case when cs is a Name object", function() {
      const cs = Name.get("DeviceCMYK");
      const xref = new XRefMock([
        {
          ref: Ref.get(10, 0),
          data: new Dict(),
        },
      ]);
      const res = new Dict();

      const pdfFunctionFactory = new PDFFunctionFactory({
        xref,
      });
      const colorSpace = ColorSpace.parse(cs, xref, res, pdfFunctionFactory);

      // prettier-ignore
      const testSrc = new Uint8Array([
        27, 125, 250, 128,
        131, 139, 140, 45,
        111, 25, 198, 78,
        21, 147, 255, 69
      ]);
      const testDest = new Uint8ClampedArray(4 * 4 * 3);
      // prettier-ignore
      const expectedDest = new Uint8ClampedArray([
        135, 81, 18,
        135, 81, 18,
        114, 102, 97,
        114, 102, 97,
        135, 81, 18,
        135, 81, 18,
        114, 102, 97,
        114, 102, 97,
        112, 144, 75,
        112, 144, 75,
        188, 98, 27,
        188, 98, 27,
        112, 144, 75,
        112, 144, 75,
        188, 98, 27,
        188, 98, 27
      ]);
      colorSpace.fillRgb(testDest, 2, 2, 4, 4, 4, 8, testSrc, 0);

      expect(
        colorSpace.getRgb(new Float32Array([0.1, 0.2, 0.3, 1]), 0)
      ).toEqual(new Uint8ClampedArray([32, 28, 21]));
      expect(colorSpace.getOutputLength(4, 0)).toEqual(3);
      expect(colorSpace.isPassthrough(8)).toBeFalsy();
      expect(testDest).toEqual(expectedDest);
    });
    it("should handle the case when cs is an indirect object", function() {
      const cs = Ref.get(10, 0);
      const xref = new XRefMock([
        {
          ref: cs,
          data: Name.get("DeviceCMYK"),
        },
      ]);
      const res = new Dict();

      const pdfFunctionFactory = new PDFFunctionFactory({
        xref,
      });
      const colorSpace = ColorSpace.parse(cs, xref, res, pdfFunctionFactory);

      // prettier-ignore
      const testSrc = new Uint8Array([
        27, 125, 250, 128,
        131, 139, 140, 45,
        111, 25, 198, 78,
        21, 147, 255, 69
      ]);
      const testDest = new Uint8ClampedArray(3 * 3 * 3);
      // prettier-ignore
      const expectedDest = new Uint8ClampedArray([
        135, 81, 18,
        135, 81, 18,
        114, 102, 97,
        135, 81, 18,
        135, 81, 18,
        114, 102, 97,
        112, 144, 75,
        112, 144, 75,
        188, 98, 27
      ]);
      colorSpace.fillRgb(testDest, 2, 2, 3, 3, 3, 8, testSrc, 0);

      expect(
        colorSpace.getRgb(new Float32Array([0.1, 0.2, 0.3, 1]), 0)
      ).toEqual(new Uint8ClampedArray([32, 28, 21]));
      expect(colorSpace.getOutputLength(4, 1)).toEqual(4);
      expect(colorSpace.isPassthrough(8)).toBeFalsy();
      expect(testDest).toEqual(expectedDest);
    });
  });

  describe("CalGrayCS", function() {
    it("should handle the case when cs is an array", function() {
      const params = new Dict();
      params.set("WhitePoint", [1, 1, 1]);
      params.set("BlackPoint", [0, 0, 0]);
      params.set("Gamma", 2.0);

      const cs = [Name.get("CalGray"), params];
      const xref = new XRefMock([
        {
          ref: Ref.get(10, 0),
          data: new Dict(),
        },
      ]);
      const res = new Dict();

      const pdfFunctionFactory = new PDFFunctionFactory({
        xref,
      });
      const colorSpace = ColorSpace.parse(cs, xref, res, pdfFunctionFactory);

      const testSrc = new Uint8Array([27, 125, 250, 131]);
      const testDest = new Uint8ClampedArray(4 * 4 * 3);
      // prettier-ignore
      const expectedDest = new Uint8ClampedArray([
        25, 25, 25,
        25, 25, 25,
        143, 143, 143,
        143, 143, 143,
        25, 25, 25,
        25, 25, 25,
        143, 143, 143,
        143, 143, 143,
        251, 251, 251,
        251, 251, 251,
        149, 149, 149,
        149, 149, 149,
        251, 251, 251,
        251, 251, 251,
        149, 149, 149,
        149, 149, 149
      ]);
      colorSpace.fillRgb(testDest, 2, 2, 4, 4, 4, 8, testSrc, 0);

      expect(colorSpace.getRgb(new Float32Array([1.0]), 0)).toEqual(
        new Uint8ClampedArray([255, 255, 255])
      );
      expect(colorSpace.getOutputLength(4, 0)).toEqual(12);
      expect(colorSpace.isPassthrough(8)).toBeFalsy();
      expect(testDest).toEqual(expectedDest);
    });
  });

  describe("CalRGBCS", function() {
    it("should handle the case when cs is an array", function() {
      const params = new Dict();
      params.set("WhitePoint", [1, 1, 1]);
      params.set("BlackPoint", [0, 0, 0]);
      params.set("Gamma", [1, 1, 1]);
      params.set("Matrix", [1, 0, 0, 0, 1, 0, 0, 0, 1]);

      const cs = [Name.get("CalRGB"), params];
      const xref = new XRefMock([
        {
          ref: Ref.get(10, 0),
          data: new Dict(),
        },
      ]);
      const res = new Dict();

      const pdfFunctionFactory = new PDFFunctionFactory({
        xref,
      });
      const colorSpace = ColorSpace.parse(cs, xref, res, pdfFunctionFactory);

      // prettier-ignore
      const testSrc = new Uint8Array([
        27, 125, 250,
        131, 139, 140,
        111, 25, 198,
        21, 147, 255
      ]);
      const testDest = new Uint8ClampedArray(3 * 3 * 3);
      // prettier-ignore
      const expectedDest = new Uint8ClampedArray([
        0, 238, 255,
        0, 238, 255,
        185, 196, 195,
        0, 238, 255,
        0, 238, 255,
        185, 196, 195,
        235, 0, 243,
        235, 0, 243,
        0, 255, 255
      ]);
      colorSpace.fillRgb(testDest, 2, 2, 3, 3, 3, 8, testSrc, 0);

      expect(colorSpace.getRgb(new Float32Array([0.1, 0.2, 0.3]), 0)).toEqual(
        new Uint8ClampedArray([0, 147, 151])
      );
      expect(colorSpace.getOutputLength(4, 0)).toEqual(4);
      expect(colorSpace.isPassthrough(8)).toBeFalsy();
      expect(testDest).toEqual(expectedDest);
    });
  });

  describe("LabCS", function() {
    it("should handle the case when cs is an array", function() {
      const params = new Dict();
      params.set("WhitePoint", [1, 1, 1]);
      params.set("BlackPoint", [0, 0, 0]);
      params.set("Range", [-100, 100, -100, 100]);

      const cs = [Name.get("Lab"), params];
      const xref = new XRefMock([
        {
          ref: Ref.get(10, 0),
          data: new Dict(),
        },
      ]);
      const res = new Dict();

      const pdfFunctionFactory = new PDFFunctionFactory({
        xref,
      });
      const colorSpace = ColorSpace.parse(cs, xref, res, pdfFunctionFactory);

      // prettier-ignore
      const testSrc = new Uint8Array([
        27, 25, 50,
        31, 19, 40,
        11, 25, 98,
        21, 47, 55
      ]);
      const testDest = new Uint8ClampedArray(3 * 3 * 3);
      // prettier-ignore
      const expectedDest = new Uint8ClampedArray([
        0, 49, 101,
        0, 49, 101,
        0, 53, 117,
        0, 49, 101,
        0, 49, 101,
        0, 53, 117,
        0, 41, 40,
        0, 41, 40,
        0, 43, 90
      ]);
      colorSpace.fillRgb(testDest, 2, 2, 3, 3, 3, 8, testSrc, 0);

      expect(colorSpace.getRgb([55, 25, 35], 0)).toEqual(
        new Uint8ClampedArray([188, 100, 61])
      );
      expect(colorSpace.getOutputLength(4, 0)).toEqual(4);
      expect(colorSpace.isPassthrough(8)).toBeFalsy();
      expect(colorSpace.isDefaultDecode([0, 1])).toBeTruthy();
      expect(testDest).toEqual(expectedDest);
    });
  });

  describe("IndexedCS", function() {
    it("should handle the case when cs is an array", function() {
      // prettier-ignore
      const lookup = new Uint8Array([
        23, 155, 35,
        147, 69, 93,
        255, 109, 70
      ]);
      const cs = [Name.get("Indexed"), Name.get("DeviceRGB"), 2, lookup];
      const xref = new XRefMock([
        {
          ref: Ref.get(10, 0),
          data: new Dict(),
        },
      ]);
      const res = new Dict();

      const pdfFunctionFactory = new PDFFunctionFactory({
        xref,
      });
      const colorSpace = ColorSpace.parse(cs, xref, res, pdfFunctionFactory);

      const testSrc = new Uint8Array([2, 2, 0, 1]);
      const testDest = new Uint8ClampedArray(3 * 3 * 3);
      // prettier-ignore
      const expectedDest = new Uint8ClampedArray([
        255, 109, 70,
        255, 109, 70,
        255, 109, 70,
        255, 109, 70,
        255, 109, 70,
        255, 109, 70,
        23, 155, 35,
        23, 155, 35,
        147, 69, 93,
      ]);
      colorSpace.fillRgb(testDest, 2, 2, 3, 3, 3, 8, testSrc, 0);

      expect(colorSpace.getRgb([2], 0)).toEqual(
        new Uint8ClampedArray([255, 109, 70])
      );
      expect(colorSpace.isPassthrough(8)).toBeFalsy();
      expect(colorSpace.isDefaultDecode([0, 1], 1)).toBeTruthy();
      expect(testDest).toEqual(expectedDest);
    });
  });

  describe("AlternateCS", function() {
    it("should handle the case when cs is an array", function() {
      const fnDict = new Dict();
      fnDict.set("FunctionType", 4);
      fnDict.set("Domain", [0.0, 1.0]);
      fnDict.set("Range", [0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0]);
      fnDict.set("Length", 58);

      let fn = new StringStream(
        "{ dup 0.84 mul " +
          "exch 0.00 exch " +
          "dup 0.44 mul " +
          "exch 0.21 mul }"
      );
      fn = new Stream(fn.bytes, 0, 58, fnDict);

      const fnRef = Ref.get(10, 0);

      const cs = [
        Name.get("Separation"),
        Name.get("LogoGreen"),
        Name.get("DeviceCMYK"),
        fnRef,
      ];
      const xref = new XRefMock([
        {
          ref: fnRef,
          data: fn,
        },
      ]);
      const res = new Dict();

      const pdfFunctionFactory = new PDFFunctionFactory({
        xref,
      });
      const colorSpace = ColorSpace.parse(cs, xref, res, pdfFunctionFactory);

      const testSrc = new Uint8Array([27, 25, 50, 31]);
      const testDest = new Uint8ClampedArray(3 * 3 * 3);
      // prettier-ignore
      const expectedDest = new Uint8ClampedArray([
        226, 242, 241,
        226, 242, 241,
        229, 244, 242,
        226, 242, 241,
        226, 242, 241,
        229, 244, 242,
        203, 232, 229,
        203, 232, 229,
        222, 241, 238
      ]);
      colorSpace.fillRgb(testDest, 2, 2, 3, 3, 3, 8, testSrc, 0);

      expect(colorSpace.getRgb([0.1], 0)).toEqual(
        new Uint8ClampedArray([228, 243, 242])
      );
      expect(colorSpace.isPassthrough(8)).toBeFalsy();
      expect(colorSpace.isDefaultDecode([0, 1])).toBeTruthy();
      expect(testDest).toEqual(expectedDest);
    });
  });
});
