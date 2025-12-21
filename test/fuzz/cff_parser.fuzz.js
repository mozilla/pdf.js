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
 * Fuzzer for CFF (Compact Font Format) parsing.
 * CFF fonts are complex with charstring bytecode interpretation.
 */

const MAX_INPUT_SIZE = 256 * 1024; // 256KB limit

let CFFParser = null;

async function init() {
  if (CFFParser) return;
  const cffModule = await import("../../build/lib-legacy/core/cff_parser.js");
  CFFParser = cffModule.CFFParser;
}

/**
 * @param { Buffer } data
 */
module.exports.fuzz = async function (data) {
  await init();

  if (data.length < 4 || data.length > MAX_INPUT_SIZE) {
    return;
  }

  try {
    const bytes = new Uint8Array(data);
    const parser = new CFFParser(
      {
        getBytes: () => bytes,
        pos: 0,
        length: bytes.length,
      },
      {}, // properties
      true // isCIDFont - try both modes
    );

    const cff = parser.parse();

    // Try to access font data
    if (cff) {
      // Access charstrings if available
      if (cff.charStrings) {
        const count = Math.min(cff.charStrings.count || 0, 10);
        for (let i = 0; i < count; i++) {
          try {
            cff.charStrings.get(i);
          } catch (e) {
            // Individual charstring errors expected
          }
        }
      }
    }
  } catch (e) {
    // Expected exceptions for malformed CFF data
    if (e.message && (
      e.message.includes("out of memory") ||
      e.message.includes("Maximum call stack") ||
      e.message.includes("allocation failed")
    )) {
      throw e;
    }
  }
};
