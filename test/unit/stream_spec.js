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

import { isNodeJS, stringToBytes } from "../../src/shared/util.js";
import { Stream, StringStream } from "../../src/core/stream.js";
import { createImage } from "../../src/core/editor/pdf_images.js";
import { Dict } from "../../src/core/primitives.js";
import { FlateStream } from "../../src/core/flate_stream.js";
import { PredictorStream } from "../../src/core/predictor_stream.js";
import { StreamsSequenceStream } from "../../src/core/decode_stream.js";

describe("stream", function () {
  describe("FlateStream", function () {
    // Stored, fixed Huffman, and dynamic Huffman blocks.
    const input = new Uint8Array([
      120, 156, 0, 17, 0, 238, 255, 113, 32, 49, 32, 48, 32, 48, 32, 49, 32, 48,
      32, 48, 32, 99, 109, 10, 114, 10, 81, 208, 119, 51, 84, 48, 52, 82, 8, 73,
      83, 48, 52, 0, 161, 144, 20, 5, 141, 180, 204, 138, 212, 20, 77, 133, 144,
      44, 5, 215, 16, 46, 39, 34, 212, 0, 0, 0, 0, 255, 255, 93, 204, 49, 10,
      128, 48, 12, 5, 208, 221, 83, 252, 81, 39, 147, 182, 36, 117, 45, 232, 46,
      228, 8, 42, 40, 226, 253, 71, 171, 34, 133, 238, 143, 151, 12, 253, 196,
      136, 176, 13, 76, 80, 34, 216, 130, 246, 220, 175, 21, 212, 193, 14, 140,
      214, 164, 15, 13, 47, 82, 72, 212, 130, 184, 66, 57, 201, 202, 5, 136,
      134, 162, 92, 173, 248, 81, 158, 33, 194, 69, 249, 95, 205, 205, 13, 90,
      211, 56, 58,
    ]);
    const expected =
      "q 1 0 0 1 0 0 cm\n" +
      "BT /F1 12 Tf 10 10 Td (fixed) Tj ET\n".repeat(2) +
      "BT /F1 8 Tf 10 700 Td (line 0) Tj ET\n" +
      "BT /F1 9 Tf 17 687 Td (line 1) Tj ET\n" +
      "BT /F1 10 Tf 24 674 Td (line 2) Tj ET\n" +
      "BT /F1 11 Tf 31 661 Td (line 3) Tj ET\n" +
      "Q\n";

    it("should decode a truncated stream up to the cut", function () {
      for (const [length, decodedLength] of [
        [13, 6],
        [45, 40],
        [80, 89],
        [140, 193],
        [input.length, expected.length],
      ]) {
        const flate = new FlateStream(new Stream(input.subarray(0, length)));
        expect(flate.getString()).toEqual(expected.substring(0, decodedLength));
      }
    });

    it("should decode a truncated stream after native decompression fails", async function () {
      const flate = new FlateStream(new Stream(input.subarray(0, 110)));
      const decoded = stringToBytes(expected.substring(0, 107));
      expect(await flate.getImageData(1000)).toEqual(decoded);
      flate.reset();
      expect(await flate.getImageData(1000)).toEqual(decoded);
    });

    it("should decode a truncated stream in a filter chain", async function () {
      // Two stored blocks, no Adler-32 checksum.
      const block = (data, final) => [
        final ? 1 : 0,
        data.length,
        0,
        ~data.length & 0xff,
        0xff,
        ...data,
      ];
      const stored = new Uint8Array([
        120,
        1,
        ...block(input.subarray(0, 55), false),
        ...block(input.subarray(55, 110), true),
      ]);
      const flate = new FlateStream(new FlateStream(new Stream(stored)));
      expect(await flate.asyncGetBytes()).toBeNull();
      expect(flate.getString()).toEqual(expected.substring(0, 107));
    });

    describe("with DecompressionStream", function () {
      async function deflate(data) {
        const { readable, writable } = new CompressionStream("deflate");
        const writer = writable.getWriter();
        writer.write(data);
        writer.close();
        return new Response(readable).bytes();
      }

      const data = new Uint8Array(100000);
      for (let i = 0; i < data.length; i++) {
        data[i] = (i * 7) ^ (i >> 9);
      }
      let compressed;

      beforeAll(async function () {
        compressed = await deflate(data);
      });

      it("should decode a large stream", async function () {
        const flate = new FlateStream(new Stream(compressed));
        expect(await flate.asyncGetBytes()).toEqual(data);
      });

      it("should decode an image stream, whatever its expected length", async function () {
        for (const length of [data.length, 1000, 2 * data.length]) {
          const flate = new FlateStream(new Stream(compressed));
          expect(await flate.getImageData(length)).toEqual(
            data.subarray(0, length)
          );
        }
      });

      it("should decode an empty stream", async function () {
        // Empty stored blocks, to get above the async length threshold.
        const emptyBlock = final => [final ? 1 : 0, 0, 0, 0xff, 0xff];
        const adler32 = [0, 0, 0, 1];
        const empty = new Uint8Array([
          120,
          1,
          ...Array(256).fill(emptyBlock(false)).flat(),
          ...emptyBlock(true),
          ...adler32,
        ]);
        const flate = new FlateStream(new Stream(empty));
        expect(await flate.asyncGetBytes()).toEqual(new Uint8Array(0));
        expect(flate.isAsync).toEqual(true);
      });

      it("should decode a small stream in JS and return its bytes", async function () {
        const small = data.subarray(0, 300);
        const flate = new FlateStream(new Stream(await deflate(small)));
        const spy = spyOn(
          flate,
          "asyncGetBytesFromDecompressionStream"
        ).and.callThrough();

        expect(flate.isAsync).toEqual(true);
        expect(await flate.asyncGetBytes()).toEqual(small);
        expect(await flate.asyncGetBytes()).toEqual(small);
        expect(spy).not.toHaveBeenCalled();
      });

      it("should choose a decoder for a small image stream and reuse it", async function () {
        const zeros = new Uint8Array(100000);
        const compressedZeros = await deflate(zeros);
        expect(compressedZeros.length).toBeLessThan(1024);

        for (const lengths of [
          [zeros.length, 1000],
          [1000, zeros.length],
        ]) {
          const flate = new FlateStream(new Stream(compressedZeros));
          const spy = spyOn(
            flate,
            "asyncGetBytesFromDecompressionStream"
          ).and.callThrough();
          for (const length of lengths) {
            flate.reset();
            expect(await flate.getImageData(length)).toEqual(
              zeros.subarray(0, length)
            );
          }
          expect(spy).toHaveBeenCalledTimes(
            lengths[0] === zeros.length ? lengths.length : 0
          );
        }
      });
    });
  });

  describe("StreamsSequenceStream", function () {
    it("should separate the streams with a new line", function () {
      const stream = new StreamsSequenceStream(
        ["(Hello) T", "BT % comment", "ET"].map(s => new StringStream(s))
      );
      expect(stream.getString()).toEqual("(Hello) T\nBT % comment\nET\n");
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
