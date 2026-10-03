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

import {
  convertBlackAndWhiteToRGBA,
  convertToRGBA,
  grayToRGBA,
} from "../../src/shared/image_utils.js";
import { FeatureTest, ImageKind } from "../../src/shared/util.js";

describe("image_utils", function () {
  // Precompute endian-dependent constants once for all tests.
  const isLE = FeatureTest.isLittleEndian;
  const BLACK = isLE ? 0xff000000 : 0x000000ff;
  const WHITE = 0xffffffff;
  const RED = 0xff0000ff;

  describe("convertBlackAndWhiteToRGBA", function () {
    it("converts a single byte (width=8) with alternating bits", function () {
      // 0b10101010: bits 7..0 = 1,0,1,0,1,0,1,0 → W,B,W,B,W,B,W,B
      const src = new Uint8Array([0b10101010]);
      const dest = new Uint8ClampedArray(8 * 4);
      const { srcPos, destPos } = convertBlackAndWhiteToRGBA({
        src,
        dest,
        width: 8,
        height: 1,
      });
      expect(srcPos).toEqual(1);
      expect(destPos).toEqual(8);

      const dest32 = new Uint32Array(dest.buffer);
      expect(dest32[0]).toEqual(WHITE);
      expect(dest32[1]).toEqual(BLACK);
      expect(dest32[2]).toEqual(WHITE);
      expect(dest32[3]).toEqual(BLACK);
      expect(dest32[4]).toEqual(WHITE);
      expect(dest32[5]).toEqual(BLACK);
      expect(dest32[6]).toEqual(WHITE);
      expect(dest32[7]).toEqual(BLACK);
    });

    it("converts two rows (width=8, height=2)", function () {
      // Row 0: 0b10101010 → W,B,W,B,W,B,W,B
      // Row 1: 0b01010101 → B,W,B,W,B,W,B,W
      const src = new Uint8Array([0b10101010, 0b01010101]);
      const dest = new Uint8ClampedArray(16 * 4);
      const { srcPos, destPos } = convertBlackAndWhiteToRGBA({
        src,
        dest,
        width: 8,
        height: 2,
      });
      expect(srcPos).toEqual(2);
      expect(destPos).toEqual(16);

      const dest32 = new Uint32Array(dest.buffer);
      // Row 0
      expect(dest32[0]).toEqual(WHITE);
      expect(dest32[1]).toEqual(BLACK);
      // Row 1
      expect(dest32[8]).toEqual(BLACK);
      expect(dest32[9]).toEqual(WHITE);
    });

    it("handles width not divisible by 8 (width=5)", function () {
      // 0b11100000: bits 7..3 = 1,1,1,0,0 → W,W,W,B,B (only 5 pixels)
      const src = new Uint8Array([0b11100000]);
      const dest = new Uint8ClampedArray(5 * 4);
      const { srcPos, destPos } = convertBlackAndWhiteToRGBA({
        src,
        dest,
        width: 5,
        height: 1,
      });
      expect(srcPos).toEqual(1);
      expect(destPos).toEqual(5);

      const dest32 = new Uint32Array(dest.buffer);
      expect(dest32[0]).toEqual(WHITE);
      expect(dest32[1]).toEqual(WHITE);
      expect(dest32[2]).toEqual(WHITE);
      expect(dest32[3]).toEqual(BLACK);
      expect(dest32[4]).toEqual(BLACK);
    });

    it("handles width=10 spanning two bytes", function () {
      // widthInSource = 1, widthRemainder = 2
      // Byte 0: 0b11111111 → 8 white pixels
      // Byte 1: 0b11000000 → bits 7,6 = 1,1 → W,W (only 2 pixels consumed)
      const src = new Uint8Array([0b11111111, 0b11000000]);
      const dest = new Uint8ClampedArray(10 * 4);
      const { srcPos, destPos } = convertBlackAndWhiteToRGBA({
        src,
        dest,
        width: 10,
        height: 1,
      });
      expect(srcPos).toEqual(2);
      expect(destPos).toEqual(10);

      const dest32 = new Uint32Array(dest.buffer);
      for (let i = 0; i < 10; i++) {
        expect(dest32[i]).withContext(`pixel ${i}`).toEqual(WHITE);
      }
    });

    it("handles srcPos offset", function () {
      // Skip the first 2 bytes; read from byte 2 = 0b10000000 → W,B,B,B,B,B,B,B
      const src = new Uint8Array([0x00, 0x00, 0b10000000]);
      const dest = new Uint8ClampedArray(8 * 4);
      const { srcPos, destPos } = convertBlackAndWhiteToRGBA({
        src,
        srcPos: 2,
        dest,
        width: 8,
        height: 1,
      });
      expect(srcPos).toEqual(3);
      expect(destPos).toEqual(8);

      const dest32 = new Uint32Array(dest.buffer);
      expect(dest32[0]).toEqual(WHITE);
      for (let i = 1; i < 8; i++) {
        expect(dest32[i]).withContext(`pixel ${i}`).toEqual(BLACK);
      }
    });

    it("applies inverseDecode correctly", function () {
      // 0b10101010 normally → W,B,W,B,...
      // With inverseDecode: 1→black, 0→white, so → B,W,B,W,...
      const src = new Uint8Array([0b10101010]);
      const dest = new Uint8ClampedArray(8 * 4);
      convertBlackAndWhiteToRGBA({
        src,
        dest,
        width: 8,
        height: 1,
        inverseDecode: true,
      });

      const dest32 = new Uint32Array(dest.buffer);
      expect(dest32[0]).toEqual(BLACK);
      expect(dest32[1]).toEqual(WHITE);
      expect(dest32[2]).toEqual(BLACK);
      expect(dest32[3]).toEqual(WHITE);
    });

    it("uses nonBlackColor for the one-bits", function () {
      // Custom color for non-black pixels.
      const CUSTOM = isLE ? 0xff0000ff : 0xff0000ff; // red (LE) / different (BE)
      // 0b11110000 → 1,1,1,1,0,0,0,0
      //            → CUSTOM,CUSTOM,CUSTOM,CUSTOM,BLACK,BLACK,BLACK,BLACK
      const src = new Uint8Array([0b11110000]);
      const dest = new Uint8ClampedArray(8 * 4);
      convertBlackAndWhiteToRGBA({
        src,
        dest,
        width: 8,
        height: 1,
        nonBlackColor: CUSTOM,
      });

      const dest32 = new Uint32Array(dest.buffer);
      expect(dest32[0]).toEqual(CUSTOM);
      expect(dest32[1]).toEqual(CUSTOM);
      expect(dest32[2]).toEqual(CUSTOM);
      expect(dest32[3]).toEqual(CUSTOM);
      expect(dest32[4]).toEqual(BLACK);
      expect(dest32[5]).toEqual(BLACK);
      expect(dest32[6]).toEqual(BLACK);
      expect(dest32[7]).toEqual(BLACK);
    });

    it("uses 0xff (all-white byte) when src is shorter than expected", function () {
      // width=10 needs 2 bytes but only 1 provided.
      // widthInSource=1: byte 0 = 0b11110000 → W,W,W,W,B,B,B,B
      // widthRemainder=2: missing byte treated as 0xff → bits 7,6 = 1,1 → W,W
      const src = new Uint8Array([0b11110000]);
      const dest = new Uint8ClampedArray(10 * 4);
      convertBlackAndWhiteToRGBA({ src, dest, width: 10, height: 1 });

      const dest32 = new Uint32Array(dest.buffer);
      expect(dest32[0]).toEqual(WHITE);
      expect(dest32[1]).toEqual(WHITE);
      expect(dest32[2]).toEqual(WHITE);
      expect(dest32[3]).toEqual(WHITE);
      expect(dest32[4]).toEqual(BLACK);
      expect(dest32[5]).toEqual(BLACK);
      expect(dest32[6]).toEqual(BLACK);
      expect(dest32[7]).toEqual(BLACK);
      // Missing second byte → treated as 0xff, so bits 7,6 → W,W
      expect(dest32[8]).toEqual(WHITE);
      expect(dest32[9]).toEqual(WHITE);
    });
  });

  describe("grayToRGBA", function () {
    it("converts black (0), mid-gray (128), and white (255)", function () {
      const src = new Uint8Array([0, 128, 255]);
      const dest = new Uint32Array(3);
      grayToRGBA(src, dest);

      expect(dest[0]).toEqual(BLACK);
      expect(dest[1]).toEqual(isLE ? 0xff808080 : 0x808080ff);
      expect(dest[2]).toEqual(WHITE);
    });

    it("handles an empty input array", function () {
      grayToRGBA(new Uint8Array(0), new Uint32Array(0));
      // No crash, nothing to check beyond reaching here.
    });

    it("alpha channel is always 0xff for every pixel", function () {
      const N = 256;
      const src = new Uint8Array(N);
      const dest = new Uint32Array(N);
      for (let i = 0; i < N; i++) {
        src[i] = i;
      }
      grayToRGBA(src, dest);

      // Extract the alpha byte: high byte in LE, low byte in BE.
      const alphaShift = isLE ? 24 : 0;
      for (let i = 0; i < N; i++) {
        expect((dest[i] >>> alphaShift) & 0xff)
          .withContext(`alpha for value ${i}`)
          .toEqual(0xff);
      }
    });

    it("RGB channels are equal for each gray level", function () {
      const src = new Uint8Array([51, 102, 204]);
      const dest = new Uint32Array(3);
      grayToRGBA(src, dest);

      // In LE: 0xffRRGGBB where RR=GG=BB=value
      // In BE: 0xRRGGBBff where RR=GG=BB=value
      for (let i = 0; i < src.length; i++) {
        const v = src[i];
        const expected = isLE
          ? 0xff000000 | (v << 16) | (v << 8) | v
          : (v << 24) | (v << 16) | (v << 8) | 0xff;
        expect(dest[i])
          .withContext(`gray value ${v}`)
          .toEqual(expected >>> 0);
      }
    });
  });

  describe("convertToRGBA", function () {
    it("dispatches to convertBlackAndWhiteToRGBA for GRAYSCALE_1BPP", function () {
      const src = new Uint8Array([0b11110000]);
      const dest = new Uint8ClampedArray(8 * 4);
      const result = convertToRGBA({
        src,
        dest,
        width: 8,
        height: 1,
        kind: ImageKind.GRAYSCALE_1BPP,
      });
      expect(result).not.toBeNull();
      expect(result.destPos).toEqual(8);

      const dest32 = new Uint32Array(dest.buffer);
      expect(dest32[0]).toEqual(WHITE);
      expect(dest32[4]).toEqual(BLACK);
    });

    it("dispatches to convertRGBToRGBA for RGB_24BPP", function () {
      // Three pixels: white, black, red.
      const src = new Uint8Array([255, 255, 255, 0, 0, 0, 255, 0, 0]);
      const dest = new Uint32Array(3);
      const result = convertToRGBA({
        src,
        dest,
        width: 3,
        height: 1,
        kind: ImageKind.RGB_24BPP,
      });
      expect(result).not.toBeNull();
      expect(result.srcPos).toEqual(9);
      expect(result.destPos).toEqual(3);

      expect(dest[0]).toEqual(WHITE);
      expect(dest[1]).toEqual(BLACK);
      expect(dest[2]).toEqual(RED);
    });

    it("returns null for an unknown kind", function () {
      const result = convertToRGBA({
        src: new Uint8Array(4),
        dest: new Uint32Array(1),
        width: 1,
        height: 1,
        kind: 999,
      });
      expect(result).toBeNull();
    });

    it("handles destPos offset for RGB_24BPP", function () {
      // One red pixel written at destPos=2 in a 4-pixel buffer.
      const src = new Uint8Array([255, 0, 0]);
      const dest = new Uint32Array(4);
      const result = convertToRGBA({
        src,
        dest,
        destPos: 2,
        width: 1,
        height: 1,
        kind: ImageKind.RGB_24BPP,
      });
      expect(result.destPos).toEqual(3);
      expect(dest[0]).toEqual(0); // untouched
      expect(dest[1]).toEqual(0); // untouched
      expect(dest[2]).toEqual(RED); // red
      expect(dest[3]).toEqual(0); // untouched
    });

    it("handles srcPos offset for RGB_24BPP", function () {
      // Four black pixels to skip, then one red pixel read from srcPos=12.
      const src = new Uint8Array([
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0,
      ]);
      const dest = new Uint32Array(1);
      const result = convertToRGBA({
        src,
        dest,
        srcPos: 12,
        width: 1,
        height: 1,
        kind: ImageKind.RGB_24BPP,
      });
      expect(result.srcPos).toEqual(15);
      expect(dest[0]).toEqual(RED);
    });

    it("handles a source with a byteOffset for RGB_24BPP", function () {
      // Skip four bytes outside the source view.
      const buffer = new Uint8Array([
        1, 2, 3, 4, 255, 255, 255, 0, 0, 0, 255, 255, 255, 0, 0, 0, 255, 0, 0,
      ]).buffer;
      const src = new Uint8Array(buffer, 4);
      const dest = new Uint32Array(5);
      const result = convertToRGBA({
        src,
        dest,
        width: 5,
        height: 1,
        kind: ImageKind.RGB_24BPP,
      });
      expect(result.srcPos).toEqual(15);
      expect(result.destPos).toEqual(5);
      expect(dest).toEqual(new Uint32Array([WHITE, BLACK, WHITE, BLACK, RED]));
    });

    it("handles a source which isn't 4-byte aligned for RGB_24BPP", function () {
      // byteOffset + srcPos = 1 + 2 = 3 is not 4-byte aligned.
      const buffer = new Uint8Array([
        1, 2, 3, 255, 255, 255, 0, 0, 0, 255, 255, 255, 0, 0, 0, 255, 0, 0,
      ]).buffer;
      const src = new Uint8Array(buffer, 1);
      const dest = new Uint32Array(5);
      const result = convertToRGBA({
        src,
        dest,
        srcPos: 2,
        width: 5,
        height: 1,
        kind: ImageKind.RGB_24BPP,
      });
      expect(result.srcPos).toEqual(17);
      expect(result.destPos).toEqual(5);
      expect(dest).toEqual(new Uint32Array([WHITE, BLACK, WHITE, BLACK, RED]));
    });
  });
});
