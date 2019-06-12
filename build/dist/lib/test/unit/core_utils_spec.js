/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2019 Mozilla Foundation
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

var _primitives = require("../../core/primitives");

var _core_utils = require("../../core/core_utils");

var _test_utils = require("./test_utils");

describe('core_utils', function () {
  describe('getInheritableProperty', function () {
    it('handles non-dictionary arguments', function () {
      expect((0, _core_utils.getInheritableProperty)({
        dict: null,
        key: 'foo'
      })).toEqual(undefined);
      expect((0, _core_utils.getInheritableProperty)({
        dict: undefined,
        key: 'foo'
      })).toEqual(undefined);
    });
    it('handles dictionaries that do not contain the property', function () {
      var emptyDict = new _primitives.Dict();
      expect((0, _core_utils.getInheritableProperty)({
        dict: emptyDict,
        key: 'foo'
      })).toEqual(undefined);
      var filledDict = new _primitives.Dict();
      filledDict.set('bar', 'baz');
      expect((0, _core_utils.getInheritableProperty)({
        dict: filledDict,
        key: 'foo'
      })).toEqual(undefined);
    });
    it('fetches the property if it is not inherited', function () {
      var ref = _primitives.Ref.get(10, 0);

      var xref = new _test_utils.XRefMock([{
        ref: ref,
        data: 'quux'
      }]);
      var dict = new _primitives.Dict(xref);
      dict.set('foo', 'bar');
      expect((0, _core_utils.getInheritableProperty)({
        dict: dict,
        key: 'foo'
      })).toEqual('bar');
      dict.set('baz', ['qux', ref]);
      expect((0, _core_utils.getInheritableProperty)({
        dict: dict,
        key: 'baz',
        getArray: true
      })).toEqual(['qux', 'quux']);
    });
    it('fetches the property if it is inherited and present on one level', function () {
      var ref = _primitives.Ref.get(10, 0);

      var xref = new _test_utils.XRefMock([{
        ref: ref,
        data: 'quux'
      }]);
      var firstDict = new _primitives.Dict(xref);
      var secondDict = new _primitives.Dict(xref);
      firstDict.set('Parent', secondDict);
      secondDict.set('foo', 'bar');
      expect((0, _core_utils.getInheritableProperty)({
        dict: firstDict,
        key: 'foo'
      })).toEqual('bar');
      secondDict.set('baz', ['qux', ref]);
      expect((0, _core_utils.getInheritableProperty)({
        dict: firstDict,
        key: 'baz',
        getArray: true
      })).toEqual(['qux', 'quux']);
    });
    it('fetches the property if it is inherited and present on multiple levels', function () {
      var ref = _primitives.Ref.get(10, 0);

      var xref = new _test_utils.XRefMock([{
        ref: ref,
        data: 'quux'
      }]);
      var firstDict = new _primitives.Dict(xref);
      var secondDict = new _primitives.Dict(xref);
      firstDict.set('Parent', secondDict);
      firstDict.set('foo', 'bar1');
      secondDict.set('foo', 'bar2');
      expect((0, _core_utils.getInheritableProperty)({
        dict: firstDict,
        key: 'foo'
      })).toEqual('bar1');
      expect((0, _core_utils.getInheritableProperty)({
        dict: firstDict,
        key: 'foo',
        getArray: false,
        stopWhenFound: false
      })).toEqual(['bar1', 'bar2']);
      firstDict.set('baz', ['qux1', ref]);
      secondDict.set('baz', ['qux2', ref]);
      expect((0, _core_utils.getInheritableProperty)({
        dict: firstDict,
        key: 'baz',
        getArray: true,
        stopWhenFound: false
      })).toEqual([['qux1', 'quux'], ['qux2', 'quux']]);
    });
    it('stops searching when the loop limit is reached', function () {
      var dict = new _primitives.Dict();
      var currentDict = dict;
      var parentDict = null;

      for (var i = 0; i < 150; i++) {
        parentDict = new _primitives.Dict();
        currentDict.set('Parent', parentDict);
        currentDict = parentDict;
      }

      parentDict.set('foo', 'bar');
      expect((0, _core_utils.getInheritableProperty)({
        dict: dict,
        key: 'foo'
      })).toEqual(undefined);
      dict.set('foo', 'baz');
      expect((0, _core_utils.getInheritableProperty)({
        dict: dict,
        key: 'foo',
        getArray: false,
        stopWhenFound: false
      })).toEqual(['baz']);
    });
  });
  describe('toRomanNumerals', function () {
    it('handles invalid arguments', function () {
      var _loop = function _loop() {
        var input = _arr[_i];
        expect(function () {
          (0, _core_utils.toRomanNumerals)(input);
        }).toThrow(new Error('The number should be a positive integer.'));
      };

      for (var _i = 0, _arr = ['foo', -1, 0]; _i < _arr.length; _i++) {
        _loop();
      }
    });
    it('converts numbers to uppercase Roman numerals', function () {
      expect((0, _core_utils.toRomanNumerals)(1)).toEqual('I');
      expect((0, _core_utils.toRomanNumerals)(6)).toEqual('VI');
      expect((0, _core_utils.toRomanNumerals)(7)).toEqual('VII');
      expect((0, _core_utils.toRomanNumerals)(8)).toEqual('VIII');
      expect((0, _core_utils.toRomanNumerals)(10)).toEqual('X');
      expect((0, _core_utils.toRomanNumerals)(40)).toEqual('XL');
      expect((0, _core_utils.toRomanNumerals)(100)).toEqual('C');
      expect((0, _core_utils.toRomanNumerals)(500)).toEqual('D');
      expect((0, _core_utils.toRomanNumerals)(1000)).toEqual('M');
      expect((0, _core_utils.toRomanNumerals)(2019)).toEqual('MMXIX');
    });
    it('converts numbers to lowercase Roman numerals', function () {
      expect((0, _core_utils.toRomanNumerals)(1, true)).toEqual('i');
      expect((0, _core_utils.toRomanNumerals)(6, true)).toEqual('vi');
      expect((0, _core_utils.toRomanNumerals)(7, true)).toEqual('vii');
      expect((0, _core_utils.toRomanNumerals)(8, true)).toEqual('viii');
      expect((0, _core_utils.toRomanNumerals)(10, true)).toEqual('x');
      expect((0, _core_utils.toRomanNumerals)(40, true)).toEqual('xl');
      expect((0, _core_utils.toRomanNumerals)(100, true)).toEqual('c');
      expect((0, _core_utils.toRomanNumerals)(500, true)).toEqual('d');
      expect((0, _core_utils.toRomanNumerals)(1000, true)).toEqual('m');
      expect((0, _core_utils.toRomanNumerals)(2019, true)).toEqual('mmxix');
    });
  });
});