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

import { getSoundFormat, soundStreamToWav } from "../../src/core/sound.js";
import { createSoundDict } from "./test_utils.js";
import { StringStream } from "../../src/core/stream.js";

describe("sound", function () {
  function createSoundStream(bytes, opts) {
    return new StringStream(
      String.fromCharCode(...bytes),
      createSoundDict(opts)
    );
  }

  function createWav(bytes, opts) {
    const stream = createSoundStream(bytes, opts);
    return soundStreamToWav(stream, stream.getBytes());
  }

  function parseWav(wav) {
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    const tag = offset =>
      String.fromCharCode(
        wav[offset],
        wav[offset + 1],
        wav[offset + 2],
        wav[offset + 3]
      );
    return {
      riff: tag(0),
      wave: tag(8),
      fmt: tag(12),
      dataTag: tag(36),
      fmtSize: view.getUint32(16, true),
      format: view.getUint16(20, true),
      channels: view.getUint16(22, true),
      sampleRate: view.getUint32(24, true),
      byteRate: view.getUint32(28, true),
      blockAlign: view.getUint16(32, true),
      bitsPerSample: view.getUint16(34, true),
      dataLength: view.getUint32(40, true),
      data: Array.from(wav.subarray(44)),
    };
  }

  describe("getSoundFormat", function () {
    it("should read an explicit format", function () {
      expect(getSoundFormat(createSoundDict())).toEqual({
        channels: 1,
        sampleRate: 22050,
        bitsPerSample: 16,
        encoding: "Signed",
      });
    });

    it("should apply the spec defaults", function () {
      // Only `/R` is required; `/C`, `/B` and `/E` default to 1, 8 and Raw.
      expect(
        getSoundFormat(createSoundDict({ C: null, B: null, E: null }))
      ).toEqual({
        channels: 1,
        sampleRate: 22050,
        bitsPerSample: 8,
        encoding: "Raw",
      });
    });

    it("should reject compressed sample data", function () {
      expect(getSoundFormat(createSoundDict({ CO: "ADPCM" }))).toBeNull();
    });

    it("should reject an unsupported bit depth", function () {
      expect(getSoundFormat(createSoundDict({ B: 24 }))).toBeNull();
    });

    it("should reject muLaw/ALaw encodings", function () {
      expect(getSoundFormat(createSoundDict({ B: 8, E: "muLaw" }))).toBeNull();
      expect(getSoundFormat(createSoundDict({ B: 8, E: "ALaw" }))).toBeNull();
    });

    it("should reject a present but non-name /E encoding", function () {
      const dict = createSoundDict({ E: null });
      dict.set("E", 0); // Not a name object (a malformed `/E`).
      expect(getSoundFormat(dict)).toBeNull();
    });

    it("should reject a missing or invalid sample rate", function () {
      expect(getSoundFormat(createSoundDict({ R: null }))).toBeNull();
      expect(getSoundFormat(createSoundDict({ R: 0 }))).toBeNull();
    });

    it("should reject a non-integer or non-finite sample rate", function () {
      expect(getSoundFormat(createSoundDict({ R: 22050.5 }))).toBeNull();
      expect(getSoundFormat(createSoundDict({ R: Infinity }))).toBeNull();
    });

    it("should reject an unsupported channel count", function () {
      expect(getSoundFormat(createSoundDict({ C: 3 }))).toBeNull();
    });
  });

  describe("soundStreamToWav", function () {
    it("should wrap 16-bit signed samples in a little-endian WAV", function () {
      // Big-endian source samples 0x1234 and 0xFFFE (-2).
      const wav = parseWav(createWav([0x12, 0x34, 0xff, 0xfe]));
      expect(wav.riff).toEqual("RIFF");
      expect(wav.wave).toEqual("WAVE");
      expect(wav.fmt).toEqual("fmt ");
      expect(wav.dataTag).toEqual("data");
      expect(wav.fmtSize).toEqual(16);
      expect(wav.format).toEqual(1); // PCM
      expect(wav.channels).toEqual(1);
      expect(wav.sampleRate).toEqual(22050);
      expect(wav.bitsPerSample).toEqual(16);
      expect(wav.blockAlign).toEqual(2);
      expect(wav.byteRate).toEqual(22050 * 2);
      expect(wav.dataLength).toEqual(4);
      // Bytes are swapped to little-endian, values unchanged.
      expect(wav.data).toEqual([0x34, 0x12, 0xfe, 0xff]);
    });

    it("should shift 16-bit raw (unsigned) samples into the signed range", function () {
      // Big-endian unsigned 0x8000 (mid) and 0x0000 (min).
      const wav = parseWav(createWav([0x80, 0x00, 0x00, 0x00], { E: "Raw" }));
      // 0x8000 - 0x8000 = 0; 0x0000 - 0x8000 = -32768 (0x8000 little-endian).
      expect(wav.data).toEqual([0x00, 0x00, 0x00, 0x80]);
    });

    it("should copy 8-bit raw (unsigned) samples unchanged", function () {
      const wav = parseWav(createWav([0x00, 0x7f, 0xff], { B: 8, E: "Raw" }));
      expect(wav.bitsPerSample).toEqual(8);
      expect(wav.blockAlign).toEqual(1);
      expect(wav.data).toEqual([0x00, 0x7f, 0xff]);
    });

    it("should convert 8-bit signed samples to unsigned", function () {
      // Signed bytes 0, 127, -128, -1 -> unsigned 128, 255, 0, 127.
      const wav = parseWav(
        createWav([0x00, 0x7f, 0x80, 0xff], { B: 8, E: "Signed" })
      );
      expect(wav.data).toEqual([0x80, 0xff, 0x00, 0x7f]);
    });

    it("should report stereo block alignment", function () {
      const wav = parseWav(createWav([0, 0, 0, 0], { C: 2 }));
      expect(wav.channels).toEqual(2);
      expect(wav.blockAlign).toEqual(4); // 2 channels * 16 bits.
      expect(wav.byteRate).toEqual(22050 * 4);
    });

    it("should trim a trailing partial frame (16-bit stereo)", function () {
      // blockAlign = 4; six bytes is one whole frame plus a partial one.
      const wav = parseWav(createWav([1, 2, 3, 4, 5, 6], { C: 2 }));
      expect(wav.blockAlign).toEqual(4);
      expect(wav.dataLength).toEqual(4);
      // Only the first frame, byte-swapped to little-endian.
      expect(wav.data).toEqual([2, 1, 4, 3]);
    });

    it("should trim a trailing partial frame (8-bit stereo)", function () {
      // blockAlign = 2; three bytes is one whole frame plus a partial one.
      const wav = parseWav(createWav([10, 20, 30], { C: 2, B: 8, E: "Raw" }));
      expect(wav.blockAlign).toEqual(2);
      expect(wav.dataLength).toEqual(2);
      expect(wav.data).toEqual([10, 20]);
    });

    it("should return null when there is no complete frame", function () {
      // An empty stream, and a stereo stream with only a partial frame.
      expect(createWav([], {})).toBeNull();
      expect(createWav([1, 2], { C: 2 })).toBeNull();
    });

    it("should return null for an unsupported format", function () {
      expect(
        soundStreamToWav(
          createSoundStream([0, 0], { CO: "ADPCM" }),
          new Uint8Array([0, 0])
        )
      ).toBeNull();
    });
  });
});
