/* Copyright 2026 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { setVerbosityLevel, VerbosityLevel } from "../../src/shared/util.js";
import { BaseBinaryDataFactory } from "../../src/display/binary_data_factory.js";
import fs from "fs";

// Avoid flooding the benchmark output with `info`/`warn` messages.
setVerbosityLevel(VerbosityLevel.ERRORS);

// In Node.js, `DecompressionStream` is implemented natively and runs on the
// libuv thread-pool, which cannot be measured consistently by the benchmark
// harness. Remove it to always exercise the JavaScript stream decoders.
delete globalThis.DecompressionStream;

const ROOT_URL = new URL("../../", import.meta.url);

function readFile(relativePath) {
  return new Uint8Array(fs.readFileSync(new URL(relativePath, ROOT_URL)));
}

function readTestPdf(filename) {
  return readFile(`test/pdfs/${filename}`);
}

const binaryDataCache = new Map();

/**
 * Keeps the CMap and standard font data in memory, to avoid (non-measurable)
 * file system accesses in the benchmarked code.
 */
class CachedBinaryDataFactory extends BaseBinaryDataFactory {
  async _fetch(url, kind) {
    let data = binaryDataCache.get(url);
    if (!data) {
      data = new Uint8Array(fs.readFileSync(url));
      binaryDataCache.set(url, data);
    }
    return data.slice();
  }
}

function buildGetDocumentParams(data) {
  return {
    // `getDocument` transfers the data to the worker, hence always pass a
    // copy so that the same input can be reused across iterations.
    data: data.slice(),
    BinaryDataFactory: CachedBinaryDataFactory,
    cMapUrl: new URL("external/bcmaps/", ROOT_URL).pathname,
    standardFontDataUrl: new URL("external/standard_fonts/", ROOT_URL).pathname,
    isEvalSupported: false,
    verbosity: VerbosityLevel.ERRORS,
  };
}

export { buildGetDocumentParams, readFile, readTestPdf };
