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
 * Fuzzer for XML parsing (used for metadata and XMP).
 */

const MAX_INPUT_SIZE = 128 * 1024; // 128KB limit

let SimpleXMLParser = null;

async function init() {
  if (SimpleXMLParser) return;
  const xmlModule = await import("../../build/lib-legacy/core/xml_parser.js");
  SimpleXMLParser = xmlModule.SimpleXMLParser;
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

    const parser = new SimpleXMLParser({ hasAttributes: true });
    const result = parser.parseFromString(xmlString);
  } catch (e) {
    // Expected exceptions for malformed XML data
    if (e.message && (
      e.message.includes("out of memory") ||
      e.message.includes("Maximum call stack") ||
      e.message.includes("allocation failed")
    )) {
      throw e;
    }
  }
};
