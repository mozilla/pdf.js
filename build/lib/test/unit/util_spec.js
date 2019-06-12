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

var _util = require("../../shared/util");

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

describe('util', function () {
  describe('bytesToString', function () {
    it('handles non-array arguments', function () {
      expect(function () {
        (0, _util.bytesToString)(null);
      }).toThrow(new Error('Invalid argument for bytesToString'));
    });
    it('handles array arguments with a length not exceeding the maximum', function () {
      expect((0, _util.bytesToString)(new Uint8Array([]))).toEqual('');
      expect((0, _util.bytesToString)(new Uint8Array([102, 111, 111]))).toEqual('foo');
    });
    it('handles array arguments with a length exceeding the maximum', function () {
      var length = 10000;
      var bytes = new Uint8Array(length);

      for (var i = 0; i < length; i++) {
        bytes[i] = 'a'.charCodeAt(0);
      }

      var string = Array(length + 1).join('a');
      expect((0, _util.bytesToString)(bytes)).toEqual(string);
    });
  });
  describe('isArrayBuffer', function () {
    it('handles array buffer values', function () {
      expect((0, _util.isArrayBuffer)(new ArrayBuffer(0))).toEqual(true);
      expect((0, _util.isArrayBuffer)(new Uint8Array(0))).toEqual(true);
    });
    it('handles non-array buffer values', function () {
      expect((0, _util.isArrayBuffer)('true')).toEqual(false);
      expect((0, _util.isArrayBuffer)(1)).toEqual(false);
      expect((0, _util.isArrayBuffer)(null)).toEqual(false);
      expect((0, _util.isArrayBuffer)(undefined)).toEqual(false);
    });
  });
  describe('isBool', function () {
    it('handles boolean values', function () {
      expect((0, _util.isBool)(true)).toEqual(true);
      expect((0, _util.isBool)(false)).toEqual(true);
    });
    it('handles non-boolean values', function () {
      expect((0, _util.isBool)('true')).toEqual(false);
      expect((0, _util.isBool)('false')).toEqual(false);
      expect((0, _util.isBool)(1)).toEqual(false);
      expect((0, _util.isBool)(0)).toEqual(false);
      expect((0, _util.isBool)(null)).toEqual(false);
      expect((0, _util.isBool)(undefined)).toEqual(false);
    });
  });
  describe('isEmptyObj', function () {
    it('handles empty objects', function () {
      expect((0, _util.isEmptyObj)({})).toEqual(true);
    });
    it('handles non-empty objects', function () {
      expect((0, _util.isEmptyObj)({
        foo: 'bar'
      })).toEqual(false);
    });
  });
  describe('isNum', function () {
    it('handles numeric values', function () {
      expect((0, _util.isNum)(1)).toEqual(true);
      expect((0, _util.isNum)(0)).toEqual(true);
      expect((0, _util.isNum)(-1)).toEqual(true);
      expect((0, _util.isNum)(1000000000000000000)).toEqual(true);
      expect((0, _util.isNum)(12.34)).toEqual(true);
    });
    it('handles non-numeric values', function () {
      expect((0, _util.isNum)('true')).toEqual(false);
      expect((0, _util.isNum)(true)).toEqual(false);
      expect((0, _util.isNum)(null)).toEqual(false);
      expect((0, _util.isNum)(undefined)).toEqual(false);
    });
  });
  describe('isSpace', function () {
    it('handles space characters', function () {
      expect((0, _util.isSpace)(0x20)).toEqual(true);
      expect((0, _util.isSpace)(0x09)).toEqual(true);
      expect((0, _util.isSpace)(0x0D)).toEqual(true);
      expect((0, _util.isSpace)(0x0A)).toEqual(true);
    });
    it('handles non-space characters', function () {
      expect((0, _util.isSpace)(0x0B)).toEqual(false);
      expect((0, _util.isSpace)(null)).toEqual(false);
      expect((0, _util.isSpace)(undefined)).toEqual(false);
    });
  });
  describe('isString', function () {
    it('handles string values', function () {
      expect((0, _util.isString)('foo')).toEqual(true);
      expect((0, _util.isString)('')).toEqual(true);
    });
    it('handles non-string values', function () {
      expect((0, _util.isString)(true)).toEqual(false);
      expect((0, _util.isString)(1)).toEqual(false);
      expect((0, _util.isString)(null)).toEqual(false);
      expect((0, _util.isString)(undefined)).toEqual(false);
    });
  });
  describe('log2', function () {
    it('handles values smaller than/equal to zero', function () {
      expect((0, _util.log2)(0)).toEqual(0);
      expect((0, _util.log2)(-1)).toEqual(0);
    });
    it('handles values larger than zero', function () {
      expect((0, _util.log2)(1)).toEqual(0);
      expect((0, _util.log2)(2)).toEqual(1);
      expect((0, _util.log2)(3)).toEqual(2);
      expect((0, _util.log2)(3.14)).toEqual(2);
    });
  });
  describe('string32', function () {
    it('converts unsigned 32-bit integers to strings', function () {
      expect((0, _util.string32)(0x74727565)).toEqual('true');
      expect((0, _util.string32)(0x74797031)).toEqual('typ1');
      expect((0, _util.string32)(0x4F54544F)).toEqual('OTTO');
    });
  });
  describe('stringToBytes', function () {
    it('handles non-string arguments', function () {
      expect(function () {
        (0, _util.stringToBytes)(null);
      }).toThrow(new Error('Invalid argument for stringToBytes'));
    });
    it('handles string arguments', function () {
      expect((0, _util.stringToBytes)('')).toEqual(new Uint8Array([]));
      expect((0, _util.stringToBytes)('foo')).toEqual(new Uint8Array([102, 111, 111]));
    });
  });
  describe('stringToPDFString', function () {
    it('handles ISO Latin 1 strings', function () {
      var str = '\x8Dstring\x8E';
      expect((0, _util.stringToPDFString)(str)).toEqual("\u201Cstring\u201D");
    });
    it('handles UTF-16BE strings', function () {
      var str = '\xFE\xFF\x00\x73\x00\x74\x00\x72\x00\x69\x00\x6E\x00\x67';
      expect((0, _util.stringToPDFString)(str)).toEqual('string');
    });
    it('handles empty strings', function () {
      var str1 = '';
      expect((0, _util.stringToPDFString)(str1)).toEqual('');
      var str2 = '\xFE\xFF';
      expect((0, _util.stringToPDFString)(str2)).toEqual('');
    });
  });
  describe('removeNullCharacters', function () {
    it('should not modify string without null characters', function () {
      var str = 'string without null chars';
      expect((0, _util.removeNullCharacters)(str)).toEqual('string without null chars');
    });
    it('should modify string with null characters', function () {
      var str = 'string\x00With\x00Null\x00Chars';
      expect((0, _util.removeNullCharacters)(str)).toEqual('stringWithNullChars');
    });
  });
  describe('ReadableStream', function () {
    it('should return an Object', function () {
      var readable = new _util.ReadableStream();
      expect(_typeof(readable)).toEqual('object');
    });
    it('should have property getReader', function () {
      var readable = new _util.ReadableStream();
      expect(_typeof(readable.getReader)).toEqual('function');
    });
  });
  describe('URL', function () {
    it('should return an Object', function () {
      var url = new _util.URL('https://example.com');
      expect(_typeof(url)).toEqual('object');
    });
    it('should have property `href`', function () {
      var url = new _util.URL('https://example.com');
      expect(_typeof(url.href)).toEqual('string');
    });
  });
  describe('isSameOrigin', function () {
    it('handles invalid base URLs', function () {
      expect((0, _util.isSameOrigin)('/foo', '/bar')).toEqual(false);
      expect((0, _util.isSameOrigin)('blob:foo', '/bar')).toEqual(false);
    });
    it('correctly checks if the origin of both URLs matches', function () {
      expect((0, _util.isSameOrigin)('https://www.mozilla.org/foo', 'https://www.mozilla.org/bar')).toEqual(true);
      expect((0, _util.isSameOrigin)('https://www.mozilla.org/foo', 'https://www.example.com/bar')).toEqual(false);
    });
  });
  describe('createValidAbsoluteUrl', function () {
    it('handles invalid URLs', function () {
      expect((0, _util.createValidAbsoluteUrl)(undefined, undefined)).toEqual(null);
      expect((0, _util.createValidAbsoluteUrl)(null, null)).toEqual(null);
      expect((0, _util.createValidAbsoluteUrl)('/foo', '/bar')).toEqual(null);
    });
    it('handles URLs that do not use a whitelisted protocol', function () {
      expect((0, _util.createValidAbsoluteUrl)('magnet:?foo', null)).toEqual(null);
    });
    it('correctly creates a valid URL for whitelisted protocols', function () {
      expect((0, _util.createValidAbsoluteUrl)('http://www.mozilla.org/foo', null)).toEqual(new _util.URL('http://www.mozilla.org/foo'));
      expect((0, _util.createValidAbsoluteUrl)('/foo', 'http://www.mozilla.org')).toEqual(new _util.URL('http://www.mozilla.org/foo'));
      expect((0, _util.createValidAbsoluteUrl)('https://www.mozilla.org/foo', null)).toEqual(new _util.URL('https://www.mozilla.org/foo'));
      expect((0, _util.createValidAbsoluteUrl)('/foo', 'https://www.mozilla.org')).toEqual(new _util.URL('https://www.mozilla.org/foo'));
      expect((0, _util.createValidAbsoluteUrl)('ftp://www.mozilla.org/foo', null)).toEqual(new _util.URL('ftp://www.mozilla.org/foo'));
      expect((0, _util.createValidAbsoluteUrl)('/foo', 'ftp://www.mozilla.org')).toEqual(new _util.URL('ftp://www.mozilla.org/foo'));
      expect((0, _util.createValidAbsoluteUrl)('mailto:foo@bar.baz', null)).toEqual(new _util.URL('mailto:foo@bar.baz'));
      expect((0, _util.createValidAbsoluteUrl)('/foo', 'mailto:foo@bar.baz')).toEqual(null);
      expect((0, _util.createValidAbsoluteUrl)('tel:+0123456789', null)).toEqual(new _util.URL('tel:+0123456789'));
      expect((0, _util.createValidAbsoluteUrl)('/foo', 'tel:0123456789')).toEqual(null);
    });
  });
  describe('createPromiseCapability', function () {
    it('should resolve with correct data', function (done) {
      var promiseCapability = (0, _util.createPromiseCapability)();
      expect(promiseCapability.settled).toEqual(false);
      promiseCapability.resolve({
        test: 'abc'
      });
      promiseCapability.promise.then(function (data) {
        expect(promiseCapability.settled).toEqual(true);
        expect(data).toEqual({
          test: 'abc'
        });
        done();
      }, done.fail);
    });
    it('should reject with correct reason', function (done) {
      var promiseCapability = (0, _util.createPromiseCapability)();
      expect(promiseCapability.settled).toEqual(false);
      promiseCapability.reject(new Error('reason'));
      promiseCapability.promise.then(done.fail, function (reason) {
        expect(promiseCapability.settled).toEqual(true);
        expect(reason instanceof Error).toEqual(true);
        expect(reason.message).toEqual('reason');
        done();
      });
    });
  });
});