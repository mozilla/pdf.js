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

import { Name } from "./primitives.js";
import { stringToBytes } from "../shared/util.js";

// Size, in bytes, of the canonical 44-byte WAV header (RIFF + fmt + data
// chunk headers) that precedes the sample data.
const WAV_HEADER_SIZE = 44;

/**
 * Helpers for PDF sound objects (ISO 32000-1, 12.5.6.16).
 *
 * Sound streams contain samples described by /R, /C, /B, /E, and optional /CO.
 * We wrap supported uncompressed PCM (Raw/Signed, 8/16-bit, mono/stereo) in WAV
 * for playback.
 *
 * @import { BaseStream } from "./base_stream.js";
 * @import { Dict } from "./primitives.js";
 */

/**
 * Return a supported uncompressed sample format.
 *
 * @param {Dict} [dict] The sound object's stream dictionary.
 * @returns {{
 *   channels: number,
 *   sampleRate: number,
 *   bitsPerSample: number,
 *   encoding: string,
 * } | null}
 */
function getSoundFormat(dict) {
  // `/CO` compression is beyond PDF stream filters and isn't decoded here.
  if (!dict || dict.has("CO")) {
    return null;
  }
  const sampleRate = dict.get("R");
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    return null;
  }
  const channels = dict.get("C") ?? 1;
  if (!Number.isInteger(channels) || channels < 1 || channels > 2) {
    return null;
  }
  const bitsPerSample = dict.get("B") ?? 8;
  if (bitsPerSample !== 8 && bitsPerSample !== 16) {
    return null;
  }
  // `/E` is optional and defaults to Raw; a present-but-malformed value (one
  // that isn't a name) is rejected rather than silently treated as Raw.
  const e = dict.get("E");
  let encoding = "Raw";
  if (e !== undefined) {
    encoding = e instanceof Name ? e.name : null;
  }
  if (encoding !== "Raw" && encoding !== "Signed") {
    return null;
  }
  return { channels, sampleRate, bitsPerSample, encoding };
}

/**
 * Build a WAV file from supported PDF sound samples.
 *
 * PDF 16-bit samples are big-endian; WAV uses little-endian, unsigned 8-bit
 * samples, and signed 16-bit samples. The data chunk is trimmed to a whole
 * number of frames (a multiple of the block alignment); a stream with no
 * complete frame produces no WAV.
 *
 * @param {BaseStream} stream The sound object stream.
 * @param {Uint8Array} samples Raw sample bytes from the stream.
 * @returns {Uint8Array | null}
 */
function soundStreamToWav(stream, samples) {
  const format = getSoundFormat(stream.dict);
  if (!format) {
    return null;
  }
  const { channels, sampleRate, bitsPerSample, encoding } = format;
  const blockAlign = channels * (bitsPerSample >> 3);
  // Keep only whole frames, dropping a trailing partial frame; bail out when
  // there isn't a single complete frame to play.
  const dataLength = samples.length - (samples.length % blockAlign);
  if (dataLength === 0) {
    return null;
  }

  const wav = new Uint8Array(WAV_HEADER_SIZE + dataLength);
  const view = new DataView(wav.buffer);
  wav.set(stringToBytes("RIFF"), 0);
  // File size minus the first 8 bytes (the "RIFF" tag and this field).
  view.setUint32(4, WAV_HEADER_SIZE - 8 + dataLength, true);
  wav.set(stringToBytes("WAVE"), 8);
  wav.set(stringToBytes("fmt "), 12);
  view.setUint32(16, 16, true); // PCM fmt-chunk size.
  view.setUint16(20, 1 /* = WAVE_FORMAT_PCM */, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // Byte rate.
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  wav.set(stringToBytes("data"), 36);
  view.setUint32(40, dataLength, true);

  // Transcode the samples straight into the WAV data region (right after the
  // header) so we never allocate or copy a separate sample buffer.
  if (bitsPerSample === 16) {
    const signed = encoding === "Signed";
    for (let i = 0; i < dataLength; i += 2) {
      let value = (samples[i] << 8) | samples[i + 1];
      if (signed) {
        if (value >= 0x8000) {
          value -= 0x10000;
        }
      } else {
        value -= 0x8000;
      }
      view.setInt16(WAV_HEADER_SIZE + i, value, /* littleEndian = */ true);
    }
  } else if (encoding === "Signed") {
    for (let i = 0; i < dataLength; i++) {
      wav[WAV_HEADER_SIZE + i] = (samples[i] + 128) & 0xff;
    }
  } else {
    wav.set(samples.subarray(0, dataLength), WAV_HEADER_SIZE);
  }

  return wav;
}

export { getSoundFormat, soundStreamToWav };
