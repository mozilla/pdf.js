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
 * Fuzzer for Type1 font parsing.
 * Type1 fonts use PostScript-like charstring encoding.
 */

const MAX_INPUT_SIZE = 256 * 1024; // 256KB limit

let Type1Parser = null;
let Stream = null;

async function init() {
  if (Type1Parser) return;
  const type1Module = await import("../../build/lib-legacy/core/type1_parser.js");
  const streamModule = await import("../../build/lib-legacy/core/stream.js");
  Type1Parser = type1Module.Type1Parser;
  Stream = streamModule.Stream;
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
    const stream = new Stream(new Uint8Array(data));
    const parser = new Type1Parser(stream, false, true);
    const result = parser.extractFontProgram({});
  } catch (e) {
    // Expected exceptions for malformed Type1 data
    if (e.message && (
      e.message.includes("out of memory") ||
      e.message.includes("Maximum call stack") ||
      e.message.includes("allocation failed")
    )) {
      throw e;
    }
  }
};
