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

var _primitives = require('../../core/primitives');

var _stream = require('../../core/stream');

var _colorspace = require('../../core/colorspace');

var _test_utils = require('./test_utils');

describe('colorspace', function () {
  describe('ColorSpace', function () {
    it('should be true if decode is not an array', function () {
      expect(_colorspace.ColorSpace.isDefaultDecode('string', 0)).toBeTruthy();
    });
    it('should be true if length of decode array is not correct', function () {
      expect(_colorspace.ColorSpace.isDefaultDecode([0], 1)).toBeTruthy();
      expect(_colorspace.ColorSpace.isDefaultDecode([0, 1, 0], 1)).toBeTruthy();
    });
    it('should be true if decode map matches the default decode map', function () {
      expect(_colorspace.ColorSpace.isDefaultDecode([], 0)).toBeTruthy();
      expect(_colorspace.ColorSpace.isDefaultDecode([0, 0], 1)).toBeFalsy();
      expect(_colorspace.ColorSpace.isDefaultDecode([0, 1], 1)).toBeTruthy();
      expect(_colorspace.ColorSpace.isDefaultDecode([0, 1, 0, 1, 0, 1], 3)).toBeTruthy();
      expect(_colorspace.ColorSpace.isDefaultDecode([0, 1, 0, 1, 1, 1], 3)).toBeFalsy();
      expect(_colorspace.ColorSpace.isDefaultDecode([0, 1, 0, 1, 0, 1, 0, 1], 4)).toBeTruthy();
      expect(_colorspace.ColorSpace.isDefaultDecode([1, 0, 0, 1, 0, 1, 0, 1], 4)).toBeFalsy();
    });
  });
  describe('DeviceGrayCS', function () {
    it('should handle the case when cs is a Name object', function () {
      var cs = _primitives.Name.get('DeviceGray');
      var xref = new _test_utils.XRefMock([{
        ref: new _primitives.Ref(10, 0),
        data: new _primitives.Dict()
      }]);
      var res = new _primitives.Dict();
      var colorSpace = _colorspace.ColorSpace.parse(cs, xref, res);
      var testSrc = new Uint8Array([27, 125, 250, 131]);
      var testDest = new Uint8Array(4 * 4 * 3);
      var expectedDest = new Uint8Array([27, 27, 27, 27, 27, 27, 125, 125, 125, 125, 125, 125, 27, 27, 27, 27, 27, 27, 125, 125, 125, 125, 125, 125, 250, 250, 250, 250, 250, 250, 131, 131, 131, 131, 131, 131, 250, 250, 250, 250, 250, 250, 131, 131, 131, 131, 131, 131]);
      colorSpace.fillRgb(testDest, 2, 2, 4, 4, 4, 8, testSrc, 0);
      expect(colorSpace.getRgb(new Float32Array([0.1]), 0)).toEqual(new Uint8Array([25, 25, 25]));
      expect(colorSpace.getOutputLength(2, 0)).toEqual(6);
      expect(colorSpace.isPassthrough(8)).toBeFalsy();
      expect(testDest).toEqual(expectedDest);
    });
    it('should handle the case when cs is an indirect object', function () {
      var cs = new _primitives.Ref(10, 0);
      var xref = new _test_utils.XRefMock([{
        ref: cs,
        data: _primitives.Name.get('DeviceGray')
      }]);
      var res = new _primitives.Dict();
      var colorSpace = _colorspace.ColorSpace.parse(cs, xref, res);
      var testSrc = new Uint8Array([27, 125, 250, 131]);
      var testDest = new Uint8Array(3 * 3 * 3);
      var expectedDest = new Uint8Array([27, 27, 27, 27, 27, 27, 125, 125, 125, 27, 27, 27, 27, 27, 27, 125, 125, 125, 250, 250, 250, 250, 250, 250, 131, 131, 131]);
      colorSpace.fillRgb(testDest, 2, 2, 3, 3, 3, 8, testSrc, 0);
      expect(colorSpace.getRgb(new Float32Array([0.2]), 0)).toEqual(new Uint8Array([51, 51, 51]));
      expect(colorSpace.getOutputLength(3, 1)).toEqual(12);
      expect(colorSpace.isPassthrough(8)).toBeFalsy();
      expect(testDest).toEqual(expectedDest);
    });
  });
  describe('DeviceRgbCS', function () {
    it('should handle the case when cs is a Name object', function () {
      var cs = _primitives.Name.get('DeviceRGB');
      var xref = new _test_utils.XRefMock([{
        ref: new _primitives.Ref(10, 0),
        data: new _primitives.Dict()
      }]);
      var res = new _primitives.Dict();
      var colorSpace = _colorspace.ColorSpace.parse(cs, xref, res);
      var testSrc = new Uint8Array([27, 125, 250, 131, 139, 140, 111, 25, 198, 21, 147, 255]);
      var testDest = new Uint8Array(4 * 4 * 3);
      var expectedDest = new Uint8Array([27, 125, 250, 27, 125, 250, 131, 139, 140, 131, 139, 140, 27, 125, 250, 27, 125, 250, 131, 139, 140, 131, 139, 140, 111, 25, 198, 111, 25, 198, 21, 147, 255, 21, 147, 255, 111, 25, 198, 111, 25, 198, 21, 147, 255, 21, 147, 255]);
      colorSpace.fillRgb(testDest, 2, 2, 4, 4, 4, 8, testSrc, 0);
      expect(colorSpace.getRgb(new Float32Array([0.1, 0.2, 0.3]), 0)).toEqual(new Uint8Array([25, 51, 76]));
      expect(colorSpace.getOutputLength(4, 0)).toEqual(4);
      expect(colorSpace.isPassthrough(8)).toBeTruthy();
      expect(testDest).toEqual(expectedDest);
    });
    it('should handle the case when cs is an indirect object', function () {
      var cs = new _primitives.Ref(10, 0);
      var xref = new _test_utils.XRefMock([{
        ref: cs,
        data: _primitives.Name.get('DeviceRGB')
      }]);
      var res = new _primitives.Dict();
      var colorSpace = _colorspace.ColorSpace.parse(cs, xref, res);
      var testSrc = new Uint8Array([27, 125, 250, 131, 139, 140, 111, 25, 198, 21, 147, 255]);
      var testDest = new Uint8Array(3 * 3 * 3);
      var expectedDest = new Uint8Array([27, 125, 250, 27, 125, 250, 131, 139, 140, 27, 125, 250, 27, 125, 250, 131, 139, 140, 111, 25, 198, 111, 25, 198, 21, 147, 255]);
      colorSpace.fillRgb(testDest, 2, 2, 3, 3, 3, 8, testSrc, 0);
      expect(colorSpace.getRgb(new Float32Array([0.1, 0.2, 0.3]), 0)).toEqual(new Uint8Array([25, 51, 76]));
      expect(colorSpace.getOutputLength(4, 1)).toEqual(5);
      expect(colorSpace.isPassthrough(8)).toBeTruthy();
      expect(testDest).toEqual(expectedDest);
    });
  });
  describe('DeviceCmykCS', function () {
    it('should handle the case when cs is a Name object', function () {
      var cs = _primitives.Name.get('DeviceCMYK');
      var xref = new _test_utils.XRefMock([{
        ref: new _primitives.Ref(10, 0),
        data: new _primitives.Dict()
      }]);
      var res = new _primitives.Dict();
      var colorSpace = _colorspace.ColorSpace.parse(cs, xref, res);
      var testSrc = new Uint8Array([27, 125, 250, 128, 131, 139, 140, 45, 111, 25, 198, 78, 21, 147, 255, 69]);
      var testDest = new Uint8Array(4 * 4 * 3);
      var expectedDest = new Uint8Array([135, 80, 18, 135, 80, 18, 113, 102, 97, 113, 102, 97, 135, 80, 18, 135, 80, 18, 113, 102, 97, 113, 102, 97, 112, 143, 75, 112, 143, 75, 188, 98, 27, 188, 98, 27, 112, 143, 75, 112, 143, 75, 188, 98, 27, 188, 98, 27]);
      colorSpace.fillRgb(testDest, 2, 2, 4, 4, 4, 8, testSrc, 0);
      expect(colorSpace.getRgb(new Float32Array([0.1, 0.2, 0.3, 1]), 0)).toEqual(new Uint8Array([31, 27, 20]));
      expect(colorSpace.getOutputLength(4, 0)).toEqual(3);
      expect(colorSpace.isPassthrough(8)).toBeFalsy();
      expect(testDest).toEqual(expectedDest);
    });
    it('should handle the case when cs is an indirect object', function () {
      var cs = new _primitives.Ref(10, 0);
      var xref = new _test_utils.XRefMock([{
        ref: cs,
        data: _primitives.Name.get('DeviceCMYK')
      }]);
      var res = new _primitives.Dict();
      var colorSpace = _colorspace.ColorSpace.parse(cs, xref, res);
      var testSrc = new Uint8Array([27, 125, 250, 128, 131, 139, 140, 45, 111, 25, 198, 78, 21, 147, 255, 69]);
      var testDest = new Uint8Array(3 * 3 * 3);
      var expectedDest = new Uint8Array([135, 80, 18, 135, 80, 18, 113, 102, 97, 135, 80, 18, 135, 80, 18, 113, 102, 97, 112, 143, 75, 112, 143, 75, 188, 98, 27]);
      colorSpace.fillRgb(testDest, 2, 2, 3, 3, 3, 8, testSrc, 0);
      expect(colorSpace.getRgb(new Float32Array([0.1, 0.2, 0.3, 1]), 0)).toEqual(new Uint8Array([31, 27, 20]));
      expect(colorSpace.getOutputLength(4, 1)).toEqual(4);
      expect(colorSpace.isPassthrough(8)).toBeFalsy();
      expect(testDest).toEqual(expectedDest);
    });
  });
  describe('CalGrayCS', function () {
    it('should handle the case when cs is an array', function () {
      var params = new _primitives.Dict();
      params.set('WhitePoint', [1, 1, 1]);
      params.set('BlackPoint', [0, 0, 0]);
      params.set('Gamma', 2.0);
      var cs = [_primitives.Name.get('CalGray'), params];
      var xref = new _test_utils.XRefMock([{
        ref: new _primitives.Ref(10, 0),
        data: new _primitives.Dict()
      }]);
      var res = new _primitives.Dict();
      var colorSpace = _colorspace.ColorSpace.parse(cs, xref, res);
      var testSrc = new Uint8Array([27, 125, 250, 131]);
      var testDest = new Uint8Array(4 * 4 * 3);
      var expectedDest = new Uint8Array([25, 25, 25, 25, 25, 25, 143, 143, 143, 143, 143, 143, 25, 25, 25, 25, 25, 25, 143, 143, 143, 143, 143, 143, 251, 251, 251, 251, 251, 251, 148, 148, 148, 148, 148, 148, 251, 251, 251, 251, 251, 251, 148, 148, 148, 148, 148, 148]);
      colorSpace.fillRgb(testDest, 2, 2, 4, 4, 4, 8, testSrc, 0);
      expect(colorSpace.getRgb(new Float32Array([1.0]), 0)).toEqual(new Uint8Array([255, 255, 255]));
      expect(colorSpace.getOutputLength(4, 0)).toEqual(12);
      expect(colorSpace.isPassthrough(8)).toBeFalsy();
      expect(testDest).toEqual(expectedDest);
    });
  });
  describe('CalRGBCS', function () {
    it('should handle the case when cs is an array', function () {
      var params = new _primitives.Dict();
      params.set('WhitePoint', [1, 1, 1]);
      params.set('BlackPoint', [0, 0, 0]);
      params.set('Gamma', [1, 1, 1]);
      params.set('Matrix', [1, 0, 0, 0, 1, 0, 0, 0, 1]);
      var cs = [_primitives.Name.get('CalRGB'), params];
      var xref = new _test_utils.XRefMock([{
        ref: new _primitives.Ref(10, 0),
        data: new _primitives.Dict()
      }]);
      var res = new _primitives.Dict();
      var colorSpace = _colorspace.ColorSpace.parse(cs, xref, res);
      var testSrc = new Uint8Array([27, 125, 250, 131, 139, 140, 111, 25, 198, 21, 147, 255]);
      var testDest = new Uint8Array(3 * 3 * 3);
      var expectedDest = new Uint8Array([0, 238, 255, 0, 238, 255, 185, 196, 195, 0, 238, 255, 0, 238, 255, 185, 196, 195, 235, 0, 243, 235, 0, 243, 0, 255, 255]);
      colorSpace.fillRgb(testDest, 2, 2, 3, 3, 3, 8, testSrc, 0);
      expect(colorSpace.getRgb(new Float32Array([0.1, 0.2, 0.3]), 0)).toEqual(new Uint8Array([0, 147, 151]));
      expect(colorSpace.getOutputLength(4, 0)).toEqual(4);
      expect(colorSpace.isPassthrough(8)).toBeFalsy();
      expect(testDest).toEqual(expectedDest);
    });
  });
  describe('LabCS', function () {
    it('should handle the case when cs is an array', function () {
      var params = new _primitives.Dict();
      params.set('WhitePoint', [1, 1, 1]);
      params.set('BlackPoint', [0, 0, 0]);
      params.set('Range', [-100, 100, -100, 100]);
      var cs = [_primitives.Name.get('Lab'), params];
      var xref = new _test_utils.XRefMock([{
        ref: new _primitives.Ref(10, 0),
        data: new _primitives.Dict()
      }]);
      var res = new _primitives.Dict();
      var colorSpace = _colorspace.ColorSpace.parse(cs, xref, res);
      var testSrc = new Uint8Array([27, 25, 50, 31, 19, 40, 11, 25, 98, 21, 47, 55]);
      var testDest = new Uint8Array(3 * 3 * 3);
      var expectedDest = new Uint8Array([0, 49, 101, 0, 49, 101, 0, 53, 116, 0, 49, 101, 0, 49, 101, 0, 53, 116, 0, 40, 39, 0, 40, 39, 0, 43, 90]);
      colorSpace.fillRgb(testDest, 2, 2, 3, 3, 3, 8, testSrc, 0);
      expect(colorSpace.getRgb([55, 25, 35], 0)).toEqual(new Uint8Array([188, 99, 61]));
      expect(colorSpace.getOutputLength(4, 0)).toEqual(4);
      expect(colorSpace.isPassthrough(8)).toBeFalsy();
      expect(colorSpace.isDefaultDecode([0, 1])).toBeTruthy();
      expect(testDest).toEqual(expectedDest);
    });
  });
  describe('IndexedCS', function () {
    it('should handle the case when cs is an array', function () {
      var lookup = new Uint8Array([23, 155, 35, 147, 69, 93, 255, 109, 70]);
      var cs = [_primitives.Name.get('Indexed'), _primitives.Name.get('DeviceRGB'), 2, lookup];
      var xref = new _test_utils.XRefMock([{
        ref: new _primitives.Ref(10, 0),
        data: new _primitives.Dict()
      }]);
      var res = new _primitives.Dict();
      var colorSpace = _colorspace.ColorSpace.parse(cs, xref, res);
      var testSrc = new Uint8Array([2, 2, 0, 1]);
      var testDest = new Uint8Array(3 * 3 * 3);
      var expectedDest = new Uint8Array([255, 109, 70, 255, 109, 70, 255, 109, 70, 255, 109, 70, 255, 109, 70, 255, 109, 70, 23, 155, 35, 23, 155, 35, 147, 69, 93]);
      colorSpace.fillRgb(testDest, 2, 2, 3, 3, 3, 8, testSrc, 0);
      expect(colorSpace.getRgb([2], 0)).toEqual(new Uint8Array([255, 109, 70]));
      expect(colorSpace.isPassthrough(8)).toBeFalsy();
      expect(colorSpace.isDefaultDecode([0, 1])).toBeTruthy();
      expect(testDest).toEqual(expectedDest);
    });
  });
  describe('AlternateCS', function () {
    it('should handle the case when cs is an array', function () {
      var fnDict = new _primitives.Dict();
      fnDict.set('FunctionType', 4);
      fnDict.set('Domain', [0.0, 1.0]);
      fnDict.set('Range', [0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0]);
      fnDict.set('Length', 58);
      var fn = new _stream.StringStream('{ dup 0.84 mul ' + 'exch 0.00 exch ' + 'dup 0.44 mul ' + 'exch 0.21 mul }');
      fn = new _stream.Stream(fn.bytes, 0, 58, fnDict);
      var fnRef = new _primitives.Ref(10, 0);
      var cs = [_primitives.Name.get('Separation'), _primitives.Name.get('LogoGreen'), _primitives.Name.get('DeviceCMYK'), fnRef];
      var xref = new _test_utils.XRefMock([{
        ref: fnRef,
        data: fn
      }]);
      var res = new _primitives.Dict();
      var colorSpace = _colorspace.ColorSpace.parse(cs, xref, res);
      var testSrc = new Uint8Array([27, 25, 50, 31]);
      var testDest = new Uint8Array(3 * 3 * 3);
      var expectedDest = new Uint8Array([227, 243, 242, 227, 243, 242, 228, 243, 242, 227, 243, 242, 227, 243, 242, 228, 243, 242, 203, 233, 229, 203, 233, 229, 222, 241, 239]);
      colorSpace.fillRgb(testDest, 2, 2, 3, 3, 3, 8, testSrc, 0);
      expect(colorSpace.getRgb([0.1], 0)).toEqual(new Uint8Array([228, 243, 241]));
      expect(colorSpace.isPassthrough(8)).toBeFalsy();
      expect(colorSpace.isDefaultDecode([0, 1])).toBeTruthy();
      expect(testDest).toEqual(expectedDest);
    });
  });
});