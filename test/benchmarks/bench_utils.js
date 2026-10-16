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
import fs from "fs";
import { WorkerMessageHandler } from "../../src/core/worker.js";

// Avoid flooding the benchmark output with `info`/`warn` messages.
setVerbosityLevel(VerbosityLevel.ERRORS);

// Run the worker code on the main thread (a "fake" worker), such that all of
// the parsing work is measured by the benchmark harness.
globalThis.pdfjsWorker = { WorkerMessageHandler };

// In Node.js, `DecompressionStream` is implemented natively and runs on the
// libuv thread-pool, which cannot be measured consistently by the benchmark
// harness. Remove it to always exercise the JavaScript stream decoders.
delete globalThis.DecompressionStream;

const ROOT_URL = new URL("../../", import.meta.url);

const CMAP_URL = new URL("external/bcmaps/", ROOT_URL).pathname;
const ICC_URL = new URL("external/iccs/", ROOT_URL).pathname;
const STANDARD_FONT_DATA_URL = new URL("external/standard_fonts/", ROOT_URL)
  .pathname;
const WASM_URL = new URL("wasm/", ROOT_URL).pathname;

const WASM_PATHS = new Map(
  ["jbig2/jbig2.wasm", "openjpeg/openjpeg.wasm", "qcms/qcms_bg.wasm"].map(
    path => [
      `${WASM_URL}${path.split("/")[1]}`,
      new URL(`external/${path}`, ROOT_URL).pathname,
    ]
  )
);

function readFile(relativePath) {
  return new Uint8Array(fs.readFileSync(new URL(relativePath, ROOT_URL)));
}

function readTestPdf(filename) {
  return readFile(`test/pdfs/${filename}`);
}

const fileCache = new Map();

/**
 * Cache file bytes across benchmark iterations.
 * @param {string} path
 * @returns {Uint8Array}
 */
function readCachedFile(path) {
  let data = fileCache.get(path);
  if (!data) {
    data = new Uint8Array(fs.readFileSync(WASM_PATHS.get(path) ?? path));
    fileCache.set(path, data);
  }
  return data;
}

const nodeFetch = globalThis.fetch;
globalThis.fetch = async (url, options) =>
  typeof url === "string" && url.startsWith("/")
    ? new Response(readCachedFile(url))
    : nodeFetch(url, options);

globalThis.XMLHttpRequest = class {
  open(method, url) {
    this.url = url;
  }

  send() {
    this.response = readCachedFile(this.url).slice().buffer;
  }
};

function buildGetDocumentParams(data) {
  return {
    // `getDocument` transfers the data to the worker, hence always pass a
    // copy so that the same input can be reused across iterations.
    data: data.slice(),
    cMapUrl: CMAP_URL,
    iccUrl: ICC_URL,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    wasmUrl: WASM_URL,
    useWorkerFetch: true,
    isEvalSupported: false,
    verbosity: VerbosityLevel.ERRORS,
  };
}

export { buildGetDocumentParams, readFile, readTestPdf };
