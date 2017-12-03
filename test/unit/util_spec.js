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
  bytesToString, ReadableStream, removeNullCharacters, stringToBytes,
  stringToPDFString
} from '../../src/shared/util';

describe('util', function() {
  describe('bytesToString', function() {
    it('handles non-array arguments', function() {
      expect(function() {
        bytesToString(null);
      }).toThrow(new Error('Invalid argument for bytesToString'));
    });

    it('handles array arguments with a length not exceeding the maximum',
        function() {
      expect(bytesToString(new Uint8Array([]))).toEqual('');
      expect(bytesToString(new Uint8Array([102, 111, 111]))).toEqual('foo');
    });

    it('handles array arguments with a length exceeding the maximum',
        function() {
      const length = 10000; // Larger than MAX_ARGUMENT_COUNT = 8192.

      // Create an array with `length` 'a' character codes.
      let bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        bytes[i] = 'a'.charCodeAt(0);
      }

      // Create a string with `length` 'a' characters. We need an array of size
      // `length + 1` since `join` puts the argument between the array elements.
      let string = Array(length + 1).join('a');

      expect(bytesToString(bytes)).toEqual(string);
    });
  });

  describe('stringToBytes', function() {
    it('handles non-string arguments', function() {
      expect(function() {
        stringToBytes(null);
      }).toThrow(new Error('Invalid argument for stringToBytes'));
    });

    it('handles string arguments', function() {
      expect(stringToBytes('')).toEqual(new Uint8Array([]));
      expect(stringToBytes('foo')).toEqual(new Uint8Array([102, 111, 111]));
    });
  });

  describe('stringToPDFString', function() {
    it('handles ISO Latin 1 strings', function() {
      let str = '\x8Dstring\x8E';
      expect(stringToPDFString(str)).toEqual('\u201Cstring\u201D');
    });

    it('handles UTF-16BE strings', function() {
      let str = '\xFE\xFF\x00\x73\x00\x74\x00\x72\x00\x69\x00\x6E\x00\x67';
      expect(stringToPDFString(str)).toEqual('string');
    });

    it('handles empty strings', function() {
      // ISO Latin 1
      let str1 = '';
      expect(stringToPDFString(str1)).toEqual('');

      // UTF-16BE
      let str2 = '\xFE\xFF';
      expect(stringToPDFString(str2)).toEqual('');
    });
  });

  describe('removeNullCharacters', function() {
    it('should not modify string without null characters', function() {
      let str = 'string without null chars';
      expect(removeNullCharacters(str)).toEqual('string without null chars');
    });

    it('should modify string with null characters', function() {
      let str = 'string\x00With\x00Null\x00Chars';
      expect(removeNullCharacters(str)).toEqual('stringWithNullChars');
    });
  });

  describe('ReadableStream', function() {
    it('should return an Object', function () {
      let readable = new ReadableStream();
      expect(typeof readable).toEqual('object');
    });

    it('should have property getReader', function () {
      let readable = new ReadableStream();
      expect(typeof readable.getReader).toEqual('function');
    });
  });
});
