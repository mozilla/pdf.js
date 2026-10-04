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

import { Dict, Name } from "../../src/core/primitives.js";
import {
  GlobalColorSpaceCache,
  LocalColorSpaceCache,
} from "../../src/core/image_utils.js";
import { PDFFunctionFactory } from "../../src/core/function.js";
import { PDFImage } from "../../src/core/image.js";
import { Stream } from "../../src/core/stream.js";
import { XRefMock } from "./test_utils.js";

describe("image", function () {
  describe("PDFImage._fillDownscaledRgba", function () {
    function createStream(data, entries) {
      const dict = new Dict();
      for (const [key, value] of Object.entries(entries)) {
        dict.set(key, value);
      }
      return new Stream(data, 0, data.length, dict);
    }

    function createImage({
      width,
      height,
      data,
      colorSpace = Name.get("DeviceRGB"),
      bpc = 8,
      decode = null,
      smask = null,
      mask = null,
    }) {
      const entries = {
        Width: width,
        Height: height,
        BitsPerComponent: bpc,
        ColorSpace: colorSpace,
      };
      if (decode) {
        entries.Decode = decode;
      }
      const xref = new XRefMock();
      return new PDFImage({
        xref,
        res: new Dict(),
        image: createStream(data, entries),
        smask,
        mask,
        pdfFunctionFactory: new PDFFunctionFactory({ xref }),
        globalColorSpaceCache: new GlobalColorSpaceCache(),
        localColorSpaceCache: new LocalColorSpaceCache(),
      });
    }

    function createSMask({ width, height, bpc = 8, data, matte = null }) {
      const entries = {
        Width: width,
        Height: height,
        BitsPerComponent: bpc,
        ColorSpace: Name.get("DeviceGray"),
      };
      if (matte) {
        entries.Matte = matte;
      }
      return createStream(data, entries);
    }

    it("should ignore the colors of the transparent pixels", async function () {
      // Transparent red (or matte white) alternates with opaque blue.
      for (const [transparent, matte] of [
        [[255, 0, 0], null],
        [
          [255, 255, 255],
          [1, 1, 1],
        ],
      ]) {
        // prettier-ignore
        const data = new Uint8Array([
          ...transparent, 0, 0, 255,
          ...transparent, 0, 0, 255,
        ]);
        const image = createImage({
          width: 4,
          height: 1,
          data,
          smask: createSMask({
            width: 4,
            height: 1,
            data: new Uint8Array([0, 255, 0, 255]),
            matte,
          }),
        });
        const dest = new Uint8ClampedArray(2 * 4);
        await image._fillDownscaledRgba(dest, 2, 1);

        expect(dest)
          .withContext(`Matte: ${matte}`)
          .toEqual(new Uint8ClampedArray([0, 0, 255, 128, 0, 0, 255, 128]));
      }
    });

    it("should undo the /Matte pre-blending of partially transparent pixels", async function () {
      // Blue (alpha 51) and green (alpha 204), preblended with magenta.
      // prettier-ignore
      const data = new Uint8Array([
        204, 0, 255,
        51, 204, 51,
      ]);
      const image = createImage({
        width: 2,
        height: 1,
        data,
        smask: createSMask({
          width: 2,
          height: 1,
          data: new Uint8Array([51, 204]),
          matte: [1, 0, 1],
        }),
      });
      const dest = new Uint8ClampedArray(4);
      await image._fillDownscaledRgba(dest, 1, 1);

      // Weighted RGB: (0, 255 * 204, 255 * 51) / (51 + 204).
      expect(dest).toEqual(new Uint8ClampedArray([0, 204, 51, 128]));
    });

    it("should average a 1 bpc /SMask larger than the image", async function () {
      // Mask rows 1100 and 1000: the left 2x2 block is 3/4 opaque, the right 0.
      const image = createImage({
        width: 1,
        height: 1,
        data: new Uint8Array([0, 255, 0]),
        smask: createSMask({
          width: 4,
          height: 2,
          bpc: 1,
          data: new Uint8Array([0xc0, 0x80]),
        }),
      });
      const dest = new Uint8ClampedArray(2 * 4);
      await image._fillDownscaledRgba(dest, 2, 1);

      expect(dest).toEqual(new Uint8ClampedArray([0, 255, 0, 191, 0, 0, 0, 0]));
    });

    it("should use the inverted /Mask samples as opacity", async function () {
      // With the default /Decode, a /Mask sample of 1 is transparent.
      const image = createImage({
        width: 1,
        height: 1,
        data: new Uint8Array([255, 0, 0]),
        mask: createStream(new Uint8Array([0x40]), {
          Width: 2,
          Height: 1,
          ImageMask: true,
        }),
      });
      const dest = new Uint8ClampedArray(4);
      await image._fillDownscaledRgba(dest, 1, 1);

      expect(dest).toEqual(new Uint8ClampedArray([255, 0, 0, 128]));
    });

    it("should average the pixels of an opaque image", async function () {
      // prettier-ignore
      const data = new Uint8Array([
        0, 0, 0, 100, 50, 30, 200, 100, 60,
        0, 0, 0, 100, 50, 30, 200, 100, 60,
      ]);
      const image = createImage({ width: 3, height: 2, data });
      const dest = new Uint8ClampedArray(2 * 4);
      await image._fillDownscaledRgba(dest, 2, 1);

      // Rounded-down block boundaries group columns as [0] and [1, 2].
      expect(dest).toEqual(
        new Uint8ClampedArray([0, 0, 0, 255, 150, 75, 45, 255])
      );
    });

    it("should average palette colors with non-integer scaling ratios", async function () {
      const image = createImage({
        width: 5,
        height: 3,
        // prettier-ignore
        data: new Uint8Array([
          0, 1, 2, 0, 1,
          2, 2, 0, 1, 2,
          1, 0, 2, 2, 1,
        ]),
        colorSpace: [
          Name.get("Indexed"),
          Name.get("DeviceRGB"),
          2,
          new Stream(new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255])),
        ],
      });
      const dest = new Uint8ClampedArray(2 * 2 * 4);
      await image._fillDownscaledRgba(dest, 2, 2);

      // Average RGB colors over blocks of sizes 2x1, 3x1, 2x2 and 3x2.
      // prettier-ignore
      expect(dest).toEqual(new Uint8ClampedArray([
        128, 128, 0, 255, 85, 85, 85, 255,
        64, 64, 128, 255, 42, 85, 128, 255,
      ]));
    });

    it("should decode packed grayscale samples before averaging", async function () {
      const image = createImage({
        width: 4,
        height: 2,
        data: new Uint8Array([0xc0, 0x80]),
        colorSpace: Name.get("DeviceGray"),
        bpc: 1,
        decode: [1, 0],
      });
      const dest = new Uint8ClampedArray(2 * 4);
      await image._fillDownscaledRgba(dest, 2, 1);

      // The decoded rows are 0011 and 0111.
      expect(dest).toEqual(
        new Uint8ClampedArray([64, 64, 64, 255, 255, 255, 255, 255])
      );
    });
  });
});
