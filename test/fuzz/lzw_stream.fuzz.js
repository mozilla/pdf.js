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
 * Fuzzer for LZW stream decoding.
 */

const MAX_INPUT_SIZE = 128 * 1024; // 128KB limit
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024; // 10MB output limit

let LZWStream = null;
let Stream = null;

async function init() {
  if (LZWStream) return;
  const lzwModule = await import("../../build/lib-legacy/core/lzw_stream.js");
  const streamModule = await import("../../build/lib-legacy/core/stream.js");
  LZWStream = lzwModule.LZWStream;
  Stream = streamModule.Stream;
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
    const stream = new Stream(new Uint8Array(data));
    // Try with earlyChange = true and false
    const earlyChange = data.length > 0 ? data[0] & 1 : 0;
    const lzwStream = new LZWStream(stream, MAX_OUTPUT_SIZE, earlyChange);

    // Try to read decompressed data
    let bytesRead = 0;
    let chunk;
    while ((chunk = lzwStream.getBytes(4096)) && chunk.length > 0) {
      bytesRead += chunk.length;
      if (bytesRead > MAX_OUTPUT_SIZE) {
        break;
      }
    }
  } catch (e) {
    // Expected exceptions for malformed LZW data
    if (e.message && (
      e.message.includes("out of memory") ||
      e.message.includes("Maximum call stack") ||
      e.message.includes("allocation failed")
    )) {
      throw e;
    }
  }
};
