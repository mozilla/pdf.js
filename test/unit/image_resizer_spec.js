/* Copyright 2026 Mozilla Foundation
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

import { ImageResizer } from "../../src/core/image_resizer.js";

describe("image_resizer", function () {
  describe("getReducePower", function () {
    // Canvas limits depend on the runtime, so derive expectations from them.

    it("should not reduce images that fit within the limits", function () {
      const { MAX_DIM } = ImageResizer;

      expect(ImageResizer.getReducePower(1, 1)).toEqual(0);
      expect(ImageResizer.getReducePower(MAX_DIM, 1)).toEqual(0);
      expect(ImageResizer.getReducePower(1, MAX_DIM)).toEqual(0);
    });

    it("should ignore invalid dimensions", function () {
      // A JPEG SOF height can be zero until a later DNL marker defines it.
      expect(ImageResizer.getReducePower(40000, 0)).toEqual(0);
      expect(ImageResizer.getReducePower(0, 40000)).toEqual(0);
      expect(ImageResizer.getReducePower(-40000, 4000)).toEqual(0);
      expect(ImageResizer.getReducePower(40000.5, 4000)).toEqual(0);
      expect(ImageResizer.getReducePower(NaN, 4000)).toEqual(0);
    });

    it("should reduce images exceeding the maximum dimension", function () {
      const { MAX_DIM } = ImageResizer;

      expect(ImageResizer.getReducePower(MAX_DIM + 1, 1)).toEqual(1);
      expect(ImageResizer.getReducePower(2 * MAX_DIM, 1)).toEqual(1);
      expect(ImageResizer.getReducePower(2 * MAX_DIM + 1, 1)).toEqual(2);
      expect(ImageResizer.getReducePower(4 * MAX_DIM, 1)).toEqual(2);
      expect(ImageResizer.getReducePower(1, 4 * MAX_DIM)).toEqual(2);
    });

    it("should reduce images exceeding the maximum area", function () {
      const side = Math.floor(Math.sqrt(ImageResizer.MAX_AREA));

      expect(ImageResizer.getReducePower(side, side)).toEqual(0);
      expect(ImageResizer.getReducePower(2 * side, 2 * side)).toEqual(1);
      expect(ImageResizer.getReducePower(4 * side, 4 * side)).toEqual(2);
    });

    it("should honour the given maximum area", function () {
      // 1024² bypasses the runtime canvas limits, isolating `maxArea`.
      expect(ImageResizer.getReducePower(1024, 1024, 2 ** 20)).toEqual(0);
      expect(ImageResizer.getReducePower(1024, 1024, 2 ** 19)).toEqual(1);
      expect(ImageResizer.getReducePower(1024, 1024, 2 ** 18)).toEqual(2);
      expect(ImageResizer.getReducePower(1024, 1024, 2 ** 14)).toEqual(6);
    });

    it("should reduce representative dimensions to fit the limits", function () {
      const { MAX_DIM, MAX_AREA } = ImageResizer;

      for (const [width, height] of [
        [MAX_DIM + 1, 1],
        [3 * MAX_DIM, 7],
        [2 * MAX_DIM, 2 * MAX_DIM],
        [7 * MAX_DIM, 5 * MAX_DIM],
        [40000, 4000],
        [40000, 10000],
      ]) {
        const factor = 2 ** ImageResizer.getReducePower(width, height);
        // Match `JpegStream`'s rounding.
        const newWidth = Math.ceil(width / factor);
        const newHeight = Math.ceil(height / factor);
        const context = `${width}x${height} reduced to ${newWidth}x${newHeight}`;

        expect(newWidth).withContext(context).toBeLessThanOrEqual(MAX_DIM);
        expect(newHeight).withContext(context).toBeLessThanOrEqual(MAX_DIM);
        expect(newWidth * newHeight)
          .withContext(context)
          .toBeLessThanOrEqual(MAX_AREA);
        expect(ImageResizer.needsToBeResized(newWidth, newHeight))
          .withContext(context)
          .toEqual(false);
      }
    });
  });
});
