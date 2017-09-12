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

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _util = require('../../shared/util');

describe('util', function () {
  describe('stringToPDFString', function () {
    it('handles ISO Latin 1 strings', function () {
      var str = '\x8Dstring\x8E';
      expect((0, _util.stringToPDFString)(str)).toEqual('\u201Cstring\u201D');
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
      expect(typeof readable === 'undefined' ? 'undefined' : _typeof(readable)).toEqual('object');
    });
    it('should have property getReader', function () {
      var readable = new _util.ReadableStream();
      expect(_typeof(readable.getReader)).toEqual('function');
    });
  });
});