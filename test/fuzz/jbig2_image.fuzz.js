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
 * Fuzzer for JBIG2 image decoding.
 * JBIG2 is a complex binary image format with arithmetic coding.
 */

const MAX_INPUT_SIZE = 256 * 1024; // 256KB limit

let Jbig2Image = null;

async function init() {
  if (Jbig2Image) return;
  await import("../../build/lib-legacy/pdf.image_decoders.js");
  Jbig2Image = globalThis.pdfjsImageDecoders.Jbig2Image;
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
    const jbig2Image = new Jbig2Image();
    const imageData = jbig2Image.parse(new Uint8Array(data));
  } catch (e) {
    // Expected exceptions for malformed JBIG2 input
    if (e.message && (
      e.message.includes("out of memory") ||
      e.message.includes("Maximum call stack") ||
      e.message.includes("allocation failed")
    )) {
      throw e;
    }
  }
};
