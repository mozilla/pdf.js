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
 * Fuzzer for XFA (XML Forms Architecture) parsing.
 * XFA is a complex XML-based form specification used in PDFs.
 */

const MAX_INPUT_SIZE = 256 * 1024; // 256KB limit

let XFAParser = null;

async function init() {
  if (XFAParser) return;
  const xfaModule = await import("../../build/lib-legacy/core/xfa/parser.js");
  XFAParser = xfaModule.XFAParser;
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
    const xmlString = data.toString("utf-8");

    // Skip if not valid XML start
    if (!xmlString.trim().startsWith("<")) {
      return;
    }

    const parser = new XFAParser();
    const result = parser.parse(xmlString);
  } catch (e) {
    // Expected exceptions for malformed XFA data
    if (e.message && (
      e.message.includes("out of memory") ||
      e.message.includes("Maximum call stack") ||
      e.message.includes("allocation failed")
    )) {
      throw e;
    }
  }
};
