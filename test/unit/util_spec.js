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
  ReadableStream, removeNullCharacters, stringToPDFString
} from '../../src/shared/util';

describe('util', function() {
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
