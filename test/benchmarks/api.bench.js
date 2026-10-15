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

import { bench, describe } from "vitest";
import { buildGetDocumentParams, readTestPdf } from "./bench_utils.js";
import { getDocument } from "../../src/display/api.js";

const PDFS = {
  "alphatrans.pdf": readTestPdf("alphatrans.pdf"),
  "issue6387.pdf": readTestPdf("issue6387.pdf"),
  "issue14497.pdf": readTestPdf("issue14497.pdf"),
  "issue16500.pdf": readTestPdf("issue16500.pdf"),
  "tracemonkey.pdf": readTestPdf("tracemonkey.pdf"),
};

async function withDocument(filename, callback) {
  const loadingTask = getDocument(buildGetDocumentParams(PDFS[filename]));
  try {
    const pdfDocument = await loadingTask.promise;
    return await callback(pdfDocument);
  } finally {
    await loadingTask.destroy();
  }
}

// Note: every iteration loads a new document, since the worker-thread caches
// e.g. parsed fonts and images for the lifetime of the document.
describe("api", () => {
  bench("load document (tracemonkey.pdf)", async () => {
    await withDocument("tracemonkey.pdf", pdfDocument => pdfDocument.numPages);
  });

  for (const filename of ["alphatrans.pdf", "issue14497.pdf"]) {
    bench(`getOperatorList page 1 (${filename})`, async () => {
      await withDocument(filename, async pdfDocument => {
        const page = await pdfDocument.getPage(1);
        return page.getOperatorList();
      });
    });
  }

  for (const filename of ["issue6387.pdf", "issue16500.pdf"]) {
    bench(`getTextContent page 1 (${filename})`, async () => {
      await withDocument(filename, async pdfDocument => {
        const page = await pdfDocument.getPage(1);
        return page.getTextContent();
      });
    });
  }
});
