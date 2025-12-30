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
 * Fuzzer for PostScript calculator function parsing.
 * Used for Type 4 PDF functions.
 */

const MAX_INPUT_SIZE = 32 * 1024; // 32KB limit

let PostScriptParser = null;
let PostScriptLexer = null;
let Stream = null;

async function init() {
  if (PostScriptParser) return;
  const psModule = await import("../../build/lib-legacy/core/ps_parser.js");
  const streamModule = await import("../../build/lib-legacy/core/stream.js");
  PostScriptParser = psModule.PostScriptParser;
  PostScriptLexer = psModule.PostScriptLexer;
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
    const lexer = new PostScriptLexer(stream);
    const parser = new PostScriptParser(lexer);
    const code = parser.parse();
  } catch (e) {
    // Expected exceptions for malformed PostScript
    if (e.message && (
      e.message.includes("out of memory") ||
      e.message.includes("Maximum call stack") ||
      e.message.includes("allocation failed")
    )) {
      throw e;
    }
  }
};
