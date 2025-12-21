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
 * Fuzzer for JPEG image decoding.
 * Tests the jpg.js decoder with malformed JPEG data.
 */

const MAX_INPUT_SIZE = 256 * 1024; // 256KB limit

let JpegImage = null;

// Initialize by loading the image decoders module
async function init() {
  if (JpegImage) return;
  await import("../../build/lib-legacy/pdf.image_decoders.js");
  JpegImage = globalThis.pdfjsImageDecoders.JpegImage;
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
    const jpegImage = new JpegImage();
    jpegImage.parse(new Uint8Array(data));

    // Try to get decoded data
    if (jpegImage.width > 0 && jpegImage.height > 0) {
      const imageData = jpegImage.getData({
        width: Math.min(jpegImage.width, 1024),
        height: Math.min(jpegImage.height, 1024),
        forceRGB: true,
      });
    }
  } catch (e) {
    // Expected exceptions for malformed JPEG input
    if (e.message && (
      e.message.includes("out of memory") ||
      e.message.includes("Maximum call stack") ||
      e.message.includes("allocation failed")
    )) {
      throw e;
    }
  }
};
