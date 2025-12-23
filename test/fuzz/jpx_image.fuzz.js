// Copyright 2024 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Fuzzer for JPEG2000 (JPX) image decoding.
 */

const MAX_INPUT_SIZE = 256 * 1024; // 256KB limit

let JpxImage = null;

async function init() {
  if (JpxImage) return;
  await import("../../build/lib-legacy/pdf.image_decoders.js");
  JpxImage = globalThis.pdfjsImageDecoders.JpxImage;
}

/**
 * @param { Buffer } data
 */
module.exports.fuzz = async function (data) {
  await init();

  if (data.length === 0 || data.length > MAX_INPUT_SIZE) {
    return;
  }

  try {
    const jpxImage = new JpxImage();
    jpxImage.parse(new Uint8Array(data));

    // Try to get tiles if parsing succeeded
    if (jpxImage.width > 0 && jpxImage.height > 0) {
      for (let i = 0; i < Math.min(jpxImage.tiles?.length || 0, 4); i++) {
        try {
          const tile = jpxImage.tiles[i];
        } catch (e) {
          // Tile access errors expected
        }
      }
    }
  } catch (e) {
    // Expected exceptions for malformed JPX input
    if (e.message && (
      e.message.includes("out of memory") ||
      e.message.includes("Maximum call stack") ||
      e.message.includes("allocation failed")
    )) {
      throw e;
    }
  }
};
