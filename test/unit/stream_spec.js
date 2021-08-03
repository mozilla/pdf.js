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

import { Dict } from "../../src/core/primitives.js";
import { PredictorStream } from "../../src/core/predictor_stream.js";
import { Stream } from "../../src/core/stream.js";

describe("stream", function () {
  beforeEach(function () {
    jasmine.addMatchers({
      toMatchTypedArray(util, customEqualityTesters) {
        return {
          compare(actual, expected) {
            const result = {};
            if (actual.length !== expected.length) {
              result.pass = false;
              result.message =
                "Array length: " +
                actual.length +
                ", expected: " +
                expected.length;
              return result;
            }
            result.pass = true;
            for (let i = 0, ii = expected.length; i < ii; i++) {
              const a = actual[i],
                b = expected[i];
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
  describe("PredictorStream", function () {
    it("should decode simple predictor data", function () {
      const dict = new Dict();
      dict.set("Predictor", 12);
      dict.set("Colors", 1);
      dict.set("BitsPerComponent", 8);
      dict.set("Columns", 2);

      const input = new Stream(
        new Uint8Array([2, 100, 3, 2, 1, 255, 2, 1, 255]),
        0,
        9,
        dict
      );
      const predictor = new PredictorStream(input, /* length = */ 9, dict);
      const result = predictor.getBytes(6);

      expect(result).toMatchTypedArray(
        new Uint8Array([100, 3, 101, 2, 102, 1])
      );

      predictor.reset();
      const clampedResult = predictor.getBytes(6, /* forceClamped = */ true);
      expect(clampedResult).toEqual(
        new Uint8ClampedArray([100, 3, 101, 2, 102, 1])
      );
    });
  });
});
