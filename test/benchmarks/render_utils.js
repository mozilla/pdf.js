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

import { buildGetDocumentParams, readTestPdf } from "./bench_utils.js";
import { getDocument } from "../../src/display/api.js";

/**
 * @param {string} filename
 * @param {object} [options]
 * @param {number} [options.pageNumber]
 * @param {number} [options.scale]
 * @returns {Promise<object>} Page, viewport and canvas factory after an initial
 *   render.
 */
async function openPage(filename, { pageNumber = 1, scale = 1 } = {}) {
  const pdfDocument = await getDocument(
    buildGetDocumentParams(readTestPdf(filename))
  ).promise;
  const page = await pdfDocument.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const { canvasFactory } = pdfDocument;

  // Render once, such that the operator list, fonts and images are fetched
  // from the worker and cached: the benchmarks then only measure the canvas
  // rendering.
  const canvasAndContext = canvasFactory.create(
    viewport.width,
    viewport.height
  );
  await page.render({ canvas: canvasAndContext.canvas, viewport }).promise;
  canvasFactory.destroy(canvasAndContext);

  return { page, viewport, canvasFactory };
}

export { openPage };
