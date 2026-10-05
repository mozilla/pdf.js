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

import { createImage } from "../../src/core/editor/pdf_images.js";
import { Dict } from "../../src/core/primitives.js";
import { FlateStream } from "../../src/core/flate_stream.js";
import { isNodeJS } from "../../src/shared/util.js";
import { PredictorStream } from "../../src/core/predictor_stream.js";
import { Stream } from "../../src/core/stream.js";

describe("stream", function () {
  describe("FlateStream", function () {
    it("should preserve decoded bytes in a truncated dynamic Huffman block", function () {
      const input = new Uint8Array([
        120, 156, 237, 202, 177, 9, 128, 48, 16, 134, 209, 222, 41, 254, 82, 43,
        19, 80, 180, 14, 92, 176, 136, 68, 142, 27, 65, 44, 220, 127, 0, 231,
        16, 190, 87, 191, 18, 154, 107, 86, 222, 21, 143, 214, 164, 109, 73,
        138, 91, 227, 97, 173, 117, 85, 239, 167, 220, 46, 239, 147, 226, 149,
        197, 80, 248, 124, 62, 159, 207, 231, 243, 249,
      ]);
      const flate = new FlateStream(new Stream(input));
      const expected =
        "BT /F1 18 Tf 50 740 Td (HELLO FROM REPRO) Tj ET\n".repeat(49) +
        "BT /F1 18 Tf 50 740";

      expect(flate.getString()).toEqual(expected);
      expect(flate.bufferLength).toEqual(expected.length);
      expect(flate.eof).toBeTrue();
      expect(flate.getByte()).toEqual(-1);
      flate.reset();
      expect(flate.getString()).toEqual(expected);
    });

    it("should preserve decoded bytes in truncated fixed Huffman blocks", function () {
      const input = new Uint8Array([
        120, 1, 75, 76, 74, 78, 73, 77, 75, 207, 200, 204, 202, 206, 201, 205,
        203, 47, 40, 44, 42, 46, 41, 45, 43, 175, 168, 172, 74, 28, 149, 25,
        149, 25, 149, 25, 149, 25, 149, 25, 149, 25, 149, 25, 149, 25, 149, 25,
        193, 50, 0, 180, 12, 88, 89,
      ]);
      const expected = "abcdefghijklmnopqrstuvwxyz".repeat(100);
      for (const [length, decodedLength] of [
        [5, 2],
        [10, 7],
        [15, 12],
        [49, 2349],
        [55, 2600],
      ]) {
        const flate = new FlateStream(new Stream(input.subarray(0, length)));
        expect(flate.getString()).toEqual(expected.substring(0, decodedLength));
        expect(flate.eof).toBeTrue();
        expect(flate.getByte()).toEqual(-1);
      }
    });

    it("should propagate unexpected decoding errors", function () {
      const flate = new FlateStream(new Stream(new Uint8Array([120, 1, 3])));
      const error = new Error("Unexpected decoding failure");
      spyOn(flate, "getCode").and.throwError(error);

      expect(() => flate.getBytes()).toThrow(error);
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

      expect(result).toEqual(new Uint8Array([100, 3, 101, 2, 102, 1]));
    });

    it("should decode the FlateDecode stream produced by createImage", async function () {
      if (isNodeJS) {
        pending("OffscreenCanvas is not supported in Node.js.");
      }
      const width = 2;
      const height = 2;
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      const source = new Uint8ClampedArray([
        255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
      ]);
      ctx.putImageData(new ImageData(source, width, height), 0, 0);
      const bitmap = canvas.transferToImageBitmap();
      const { imageStream } = await createImage(bitmap, /* xref = */ null, {
        closeBitmap: true,
      });

      expect(imageStream.dict.get("Filter").name).toEqual("FlateDecode");
      const flate = new FlateStream(imageStream, imageStream.length);
      const predictor = new PredictorStream(
        flate,
        imageStream.length,
        imageStream.dict.get("DecodeParms")
      );
      const decoded = predictor.getBytes(width * height * 3);
      const expected = new Uint8Array(width * height * 3);
      for (let i = 0, j = 0; i < source.length; i += 4, j += 3) {
        expected[j] = source[i];
        expected[j + 1] = source[i + 1];
        expected[j + 2] = source[i + 2];
      }
      expect(decoded).toEqual(expected);
    });
  });
});
