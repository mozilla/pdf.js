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

import { Dict } from "../../src/core/primitives.js";
import { ImageResizer } from "../../src/core/image_resizer.js";
import { JpegImage } from "../../src/core/jpg.js";
import { JpegStream } from "../../src/core/jpeg_stream.js";
import { Stream } from "../../src/core/stream.js";

// Only a JPEG header is needed: `canUseImageDecoder` stops at the SOF marker.
function createJpeg({
  width = 1,
  height = 1,
  numComponents = 3,
  sofMarker = /* SOF0 (Start of Frame, Baseline DCT) = */ 0xffc0,
  appData = null,
} = {}) {
  const bytes = [0xff, 0xd8]; // SOI
  if (appData) {
    const length = appData.length + 2;
    bytes.push(0xff, 0xe1, length >> 8, length & 0xff, ...appData); // APP1
  }
  const sofLength = 8 + 3 * numComponents;
  bytes.push(
    sofMarker >> 8,
    sofMarker & 0xff,
    sofLength >> 8,
    sofLength & 0xff,
    8, // sample precision
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    numComponents
  );
  for (let i = 0; i < numComponents; i++) {
    bytes.push(i + 1, 0x11, 0); // component id, H=1 V=1, quantization table 0
  }
  bytes.push(0xff, 0xd9); // EOI
  return new Uint8Array(bytes);
}

describe("jpeg_stream", function () {
  describe("JpegImage.canUseImageDecoder", function () {
    it("should report the frame dimensions", function () {
      expect(
        JpegImage.canUseImageDecoder(createJpeg({ width: 40000, height: 4000 }))
      ).toEqual({ width: 40000, height: 4000 });

      expect(
        JpegImage.canUseImageDecoder(
          createJpeg({ width: 123, height: 45, numComponents: 1 })
        )
      ).toEqual({ width: 123, height: 45 });
    });

    it("should report dimensions for each supported SOF marker", function () {
      for (const sofMarker of [
        0xffc0, // Baseline DCT.
        0xffc1, // Extended sequential DCT.
        0xffc2, // Progressive DCT.
      ]) {
        expect(
          JpegImage.canUseImageDecoder(
            createJpeg({ width: 40000, height: 4000, sofMarker })
          )
        )
          .withContext(sofMarker.toString(16))
          .toEqual({ width: 40000, height: 4000 });
      }
    });

    it("should report a zero SOF height", function () {
      expect(
        JpegImage.canUseImageDecoder(createJpeg({ width: 40000, height: 0 }))
      ).toEqual({ width: 40000, height: 0 });
    });

    it("should report the frame dimensions together with the EXIF-offsets", function () {
      const payload = [1, 2, 3, 4];
      const appData = [...new TextEncoder().encode("Exif\x00\x00"), ...payload];

      // SOI (2) + APP1-marker (2) + length (2) + "Exif\x00\x00" (6) = 12.
      expect(
        JpegImage.canUseImageDecoder(
          createJpeg({ width: 40000, height: 4000, appData })
        )
      ).toEqual({
        width: 40000,
        height: 4000,
        exifStart: 12,
        exifEnd: 12 + payload.length,
      });
    });

    it("should reject images that cannot be handled", function () {
      // Four-component JPEGs.
      expect(
        JpegImage.canUseImageDecoder(createJpeg({ numComponents: 4 }))
      ).toBeNull();
      // Three components with ColorTransform = 0.
      expect(
        JpegImage.canUseImageDecoder(createJpeg({ numComponents: 3 }), 0)
      ).toBeNull();
      expect(
        JpegImage.canUseImageDecoder(createJpeg({ numComponents: 3 }), 1)
      ).not.toBeNull();
    });
  });

  describe("getTransferableImage", function () {
    let decoderInits, savedDescriptor, hadImageDecoder, savedImageDecoder;

    beforeEach(function () {
      decoderInits = [];
      hadImageDecoder = "ImageDecoder" in globalThis;
      savedImageDecoder = globalThis.ImageDecoder;
      globalThis.ImageDecoder = class {
        constructor(init) {
          decoderInits.push(init);
        }

        decode() {
          // Simulate a decoder that honours the requested dimensions.
          const { desiredWidth, desiredHeight } = decoderInits.at(-1);
          return Promise.resolve({
            image: { displayWidth: desiredWidth, displayHeight: desiredHeight },
          });
        }

        close() {}
      };
      // Override cached feature detection and restore it after each test.
      savedDescriptor = Object.getOwnPropertyDescriptor(
        JpegStream,
        "canUseImageDecoder"
      );
      Object.defineProperty(JpegStream, "canUseImageDecoder", {
        value: Promise.resolve(true),
        enumerable: true,
        configurable: true,
        writable: false,
      });
    });

    afterEach(function () {
      Object.defineProperty(JpegStream, "canUseImageDecoder", savedDescriptor);
      if (hadImageDecoder) {
        globalThis.ImageDecoder = savedImageDecoder;
      } else {
        delete globalThis.ImageDecoder;
      }
    });

    function createStream(data) {
      return new JpegStream(
        new Stream(data, 0, data.length, Dict.empty),
        data.length,
        null
      );
    }

    it("should not pass any hint for an image that fits", async function () {
      const data = createJpeg({ width: 1024, height: 1024 });
      const image = await createStream(data).getTransferableImage(1024, 1024);

      expect(decoderInits.length).toEqual(1);
      expect(decoderInits[0].desiredWidth).toBeUndefined();
      expect(decoderInits[0].desiredHeight).toBeUndefined();
      expect(image).not.toBeNull();
    });

    it("should request a smaller frame for an oversized image", async function () {
      const width = 40000,
        height = 4000;
      const factor = 2 ** ImageResizer.getReducePower(width, height);
      expect(factor).toBeGreaterThan(1);

      const data = createJpeg({ width, height });
      const image = await createStream(data).getTransferableImage(
        width,
        height
      );

      expect(decoderInits.length).toEqual(1);
      expect(decoderInits[0].desiredWidth).toEqual(Math.ceil(width / factor));
      expect(decoderInits[0].desiredHeight).toEqual(Math.ceil(height / factor));
      expect(image.displayWidth).toEqual(decoderInits[0].desiredWidth);
      expect(image.displayHeight).toEqual(decoderInits[0].desiredHeight);
      expect(
        ImageResizer.needsToBeResized(image.displayWidth, image.displayHeight)
      ).toEqual(false);
    });

    it("should not use `ImageDecoder` when the SOF dimensions disagree with the image dictionary", async function () {
      // A zero SOF height means that a later DNL marker defines it.
      const dnl = createJpeg({ width: 40000, height: 0 });
      expect(
        await createStream(dnl).getTransferableImage(40000, 4000)
      ).toBeNull();

      // The scan may also simply end before the SOF height (issue15492.pdf).
      const truncated = createJpeg({ width: 10800, height: 65000 });
      expect(
        await createStream(truncated).getTransferableImage(10800, 10320)
      ).toBeNull();

      expect(decoderInits.length).toEqual(0);
    });

    it("should not use `ImageDecoder` for images it cannot handle", async function () {
      const data = createJpeg({ width: 40000, height: 4000, numComponents: 4 });

      expect(
        await createStream(data).getTransferableImage(40000, 4000)
      ).toBeNull();
      expect(decoderInits.length).toEqual(0);
    });
  });
});
