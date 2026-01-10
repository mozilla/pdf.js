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
 * Fuzzer for PDF document parsing - the main attack surface.
 * Tests the complete PDF parsing pipeline including XRef, objects, and streams.
 */

const MAX_INPUT_SIZE = 512 * 1024; // 512KB limit

let getDocument = null;

async function init() {
  if (getDocument) return;
  await import("../../build/lib-legacy/pdf.js");
  getDocument = globalThis.pdfjsLib.getDocument;
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
    const loadingTask = getDocument({
      data: new Uint8Array(data),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: false,
      stopAtErrors: false,
      verbosity: 0,
    });

    const pdf = await loadingTask.promise;

    // Try to access document structure
    const numPages = pdf.numPages;

    // Parse first few pages if available
    const pagesToParse = Math.min(numPages, 3);
    for (let i = 1; i <= pagesToParse; i++) {
      try {
        const page = await pdf.getPage(i);
        // Get text content to exercise text extraction
        await page.getTextContent();
        // Get annotations to exercise annotation parsing
        await page.getAnnotations();
      } catch (e) {
        // Page-level errors are expected for malformed input
      }
    }

    // Try to get metadata
    try {
      await pdf.getMetadata();
    } catch (e) {
      // Expected for malformed PDFs
    }

    await loadingTask.destroy();
  } catch (e) {
    // Expected exceptions for malformed PDF input
    if (e.message && (
      e.message.includes("out of memory") ||
      e.message.includes("Maximum call stack") ||
      e.message.includes("allocation failed")
    )) {
      throw e; // Re-throw resource exhaustion errors
    }
  }
};
