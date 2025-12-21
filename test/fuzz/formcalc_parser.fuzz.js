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
 * Fuzzer for FormCalc expression parsing (used in XFA forms).
 * FormCalc is a calculation script language similar to spreadsheet formulas.
 */

const MAX_INPUT_SIZE = 64 * 1024; // 64KB limit

let Lexer = null;
let Parser = null;

async function init() {
  if (Lexer) return;
  const formcalcModule = await import("../../build/lib-legacy/core/xfa/formcalc_parser.js");
  Lexer = formcalcModule.Lexer;
  Parser = formcalcModule.Parser;
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
    const script = data.toString("utf-8");
    const lexer = new Lexer(script);
    const parser = new Parser(lexer);
    const ast = parser.parse();
  } catch (e) {
    // Expected exceptions for malformed FormCalc
    if (e.message && (
      e.message.includes("out of memory") ||
      e.message.includes("Maximum call stack") ||
      e.message.includes("allocation failed")
    )) {
      throw e;
    }
  }
};
