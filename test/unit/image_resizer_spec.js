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

import { ImageKind } from "../../src/shared/util.js";
import { ImageResizer } from "../../src/core/image_resizer.js";

describe("image_resizer", function () {
  describe("rescaleImageData", function () {
    const Uint8ArrayConstructor = Uint8Array;

    function getLimitedUint8Array(maxSize) {
      return function (size) {
        if (size > maxSize) {
          throw new RangeError("Simulated allocation failure");
        }
        if (size === 0) {
          // Fail instead of hanging if a chunk height regresses to zero.
          throw new Error("Cannot allocate an empty chunk");
        }
        return new Uint8ArrayConstructor(size);
      };
    }

    beforeEach(function () {
      // Keep the rescaled pixels in imgData.data.
      spyOn(ImageResizer, "needsToBeResized").and.returnValue(true);
    });

    it("samples the rows on the image grid across chunks", function () {
      const allocSpy = spyOn(globalThis, "Uint8Array");

      for (const kindName of ["RGB_24BPP", "GRAYSCALE_1BPP"]) {
        const kind = ImageKind[kindName];
        const isRGB = kind === ImageKind.RGB_24BPP;

        for (const [width, height, maxAllocation, reducePower, chunkHeight] of [
          [9, 17, Infinity, 1, 17],
          [9, 17, 63, 1, 1],
          [13, 17, 127, 1, 2],
          [9, 18, 127, 1, 3],
          [9, 35, 511, 3, 12],
        ]) {
          const context = `${kindName} ${width}x${height} image, ${chunkHeight}-row chunks`;
          const rowSize = isRGB ? width * 3 : Math.ceil(width / 8);
          // `Uint8Array` is spied upon, hence use the original constructor.
          const data = Uint8ArrayConstructor.from(
            { length: rowSize * height },
            (_, i) => (73 * i + (i >> 3) + 19) & 255
          );
          const imgData = { data, width, height, kind };
          const factor = 2 ** reducePower;
          const newWidth = Math.floor(width / factor);
          const newHeight = Math.floor(height / factor);
          const expected = new Uint8ArrayConstructor(newWidth * newHeight * 4);
          for (let y = 0; y < newHeight; y++) {
            for (let x = 0; x < newWidth; x++) {
              const srcX = x * factor;
              const srcY = y * factor;
              const destPos = (y * newWidth + x) * 4;
              if (isRGB) {
                const srcPos = srcY * rowSize + srcX * 3;
                expected.set(data.subarray(srcPos, srcPos + 3), destPos);
              } else {
                const byte = data[srcY * rowSize + (srcX >> 3)];
                const value = ((byte >> (7 - (srcX & 7))) & 1) * 255;
                expected.fill(value, destPos, destPos + 3);
              }
              expected[destPos + 3] = 255;
            }
          }

          allocSpy.and.callFake(getLimitedUint8Array(maxAllocation));
          const resizer = new ImageResizer(imgData, false);
          expect(resizer._rescaleImageData((width * height * 4) / factor))
            .withContext(context)
            .toBeNull();
          expect(imgData.width).withContext(context).toEqual(newWidth);
          expect(imgData.height).withContext(context).toEqual(newHeight);
          expect(imgData.kind)
            .withContext(context)
            .toEqual(ImageKind.RGBA_32BPP);
          expect(imgData.data)
            .withContext(context)
            .toEqual(new Uint32Array(expected.buffer));
        }
      }
    });

    it("falls back without changing the image when no row fits", function () {
      const data = new Uint8Array(9 * 17 * 3);
      const imgData = {
        data,
        width: 9,
        height: 17,
        kind: ImageKind.RGB_24BPP,
      };
      const original = { ...imgData };
      // One RGBA row needs 36 bytes; allocation is limited to 31.
      spyOn(globalThis, "Uint8Array").and.callFake(getLimitedUint8Array(31));
      const resizer = new ImageResizer(imgData, false);
      expect(resizer._rescaleImageData((9 * 17 * 4) / 2)).toBeNull();
      expect(imgData).toEqual(original);
      expect(imgData.data).toBe(data);
      expect(ImageResizer.needsToBeResized).not.toHaveBeenCalled();
    });
  });

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
