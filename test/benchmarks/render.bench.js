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
import { openPage } from "./render_utils.js";

const TEXT_PAGE = { kind: "text", filename: "tracemonkey.pdf" };
const PAGES = [
  TEXT_PAGE,
  { kind: "paths", filename: "bug1743245.pdf" },
  { kind: "luminosity soft mask", filename: "issue18956.pdf" },
  { kind: "tensor-product patch meshes", filename: "personwithdog.pdf" },
];
for (const entry of PAGES) {
  Object.assign(entry, await openPage(entry.filename));
}

describe("render", () => {
  for (const { kind, filename, page, viewport, canvasFactory } of PAGES) {
    bench(`PDFPageProxy.render: ${kind} (${filename})`, async () => {
      const canvasAndContext = canvasFactory.create(
        viewport.width,
        viewport.height
      );
      await page.render({ canvas: canvasAndContext.canvas, viewport }).promise;
      canvasFactory.destroy(canvasAndContext);
    });
  }

  bench(
    "PDFPageProxy.render: text, recording the operations (tracemonkey.pdf)",
    async () => {
      const { page, viewport, canvasFactory } = TEXT_PAGE;
      const canvasAndContext = canvasFactory.create(
        viewport.width,
        viewport.height
      );
      page.recordedBBoxes = null;
      await page.render({
        canvas: canvasAndContext.canvas,
        viewport,
        recordOperations: true,
      }).promise;
      canvasFactory.destroy(canvasAndContext);
    }
  );
});
