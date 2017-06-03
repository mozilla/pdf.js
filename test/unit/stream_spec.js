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

import { PredictorStream, Stream } from '../../src/core/stream';
import { Dict } from '../../src/core/primitives';

describe('stream', function() {
  beforeEach(function() {
    jasmine.addMatchers({
      toMatchTypedArray(util, customEqualityTesters) {
        return {
          compare(actual, expected) {
            var result = {};
            if (actual.length !== expected.length) {
              result.pass = false;
              result.message = 'Array length: ' + actual.length +
                ', expected: ' + expected.length;
              return result;
            }
            result.pass = true;
            for (var i = 0, ii = expected.length; i < ii; i++) {
              var a = actual[i], b = expected[i];
              if (a !== b) {
                result.pass = false;
                break;
              }
            }
            return result;
          },
        };
      },
    });
  });
  describe('PredictorStream', function() {
    it('should decode simple predictor data', function() {
      var dict = new Dict();
      dict.set('Predictor', 12);
      dict.set('Colors', 1);
      dict.set('BitsPerComponent', 8);
      dict.set('Columns', 2);

      var input = new Stream(new Uint8Array([2, 100, 3, 2, 1, 255, 2, 1, 255]),
                             0, 9, dict);
      var predictor = new PredictorStream(input, /* length = */ 9, dict);
      var result = predictor.getBytes(6);

      expect(result).toMatchTypedArray(
        new Uint8Array([100, 3, 101, 2, 102, 1])
      );
    });
  });
});
