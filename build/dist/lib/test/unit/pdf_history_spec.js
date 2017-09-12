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

var _pdf_history = require('../../web/pdf_history');

describe('pdf_history', function () {
  describe('isDestsEqual', function () {
    var firstDest = [{
      num: 1,
      gen: 0
    }, { name: 'XYZ' }, 0, 375, null];
    var secondDest = [{
      num: 5,
      gen: 0
    }, { name: 'XYZ' }, 0, 375, null];
    var thirdDest = [{
      num: 1,
      gen: 0
    }, { name: 'XYZ' }, 750, 0, null];
    var fourthDest = [{
      num: 1,
      gen: 0
    }, { name: 'XYZ' }, 0, 375, 1.0];
    var fifthDest = [{
      gen: 0,
      num: 1
    }, { name: 'XYZ' }, 0, 375, null];
    it('should reject non-equal destination arrays', function () {
      expect((0, _pdf_history.isDestsEqual)(firstDest, undefined)).toEqual(false);
      expect((0, _pdf_history.isDestsEqual)(firstDest, [1, 2, 3, 4, 5])).toEqual(false);
      expect((0, _pdf_history.isDestsEqual)(firstDest, secondDest)).toEqual(false);
      expect((0, _pdf_history.isDestsEqual)(firstDest, thirdDest)).toEqual(false);
      expect((0, _pdf_history.isDestsEqual)(firstDest, fourthDest)).toEqual(false);
    });
    it('should accept equal destination arrays', function () {
      expect((0, _pdf_history.isDestsEqual)(firstDest, firstDest)).toEqual(true);
      expect((0, _pdf_history.isDestsEqual)(firstDest, fifthDest)).toEqual(true);
      var firstDestCopy = firstDest.slice();
      expect(firstDest).not.toBe(firstDestCopy);
      expect((0, _pdf_history.isDestsEqual)(firstDest, firstDestCopy)).toEqual(true);
    });
  });
});