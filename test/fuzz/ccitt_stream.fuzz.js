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
 * Fuzzer for CCITT fax stream decoding (Group 3 and Group 4).
 * Used for fax-encoded images in PDFs.
 */

const MAX_INPUT_SIZE = 128 * 1024; // 128KB limit

let CCITTFaxDecoder = null;

async function init() {
  if (CCITTFaxDecoder) return;
  const ccittModule = await import("../../build/lib-legacy/core/ccitt.js");
  CCITTFaxDecoder = ccittModule.CCITTFaxDecoder;
}

/**
 * @param { Buffer } data
 */
module.exports.fuzz = async function (data) {
  await init();

  if (data.length < 4 || data.length > MAX_INPUT_SIZE) {
    return;
  }

  // Use first 4 bytes to derive decoder parameters
  const params = {
    K: (data[0] % 3) - 1, // -1, 0, or 1
    EndOfLine: !!(data[1] & 0x01),
    EncodedByteAlign: !!(data[1] & 0x02),
    Columns: ((data[2] << 8) | data[3]) % 4096 + 1,
    Rows: 0,
    EndOfBlock: !!(data[1] & 0x04),
    BlackIs1: !!(data[1] & 0x08),
  };

  try {
    const source = {
      next: (function() {
        let pos = 4;
        return function() {
          if (pos >= data.length) {
            return -1;
          }
          return data[pos++];
        };
      })()
    };

    const decoder = new CCITTFaxDecoder(source, params);

    // Try to decode some data
    let bytesRead = 0;
    const maxBytes = 1024 * 1024; // 1MB output limit
    let byte;
    while ((byte = decoder.readNextChar()) !== -1 && bytesRead < maxBytes) {
      bytesRead++;
    }
  } catch (e) {
    // Expected exceptions for malformed CCITT data
    if (e.message && (
      e.message.includes("out of memory") ||
      e.message.includes("Maximum call stack") ||
      e.message.includes("allocation failed")
    )) {
      throw e;
    }
  }
};
