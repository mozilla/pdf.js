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

import {
  closePages,
  getRect,
  loadAndWait,
  waitForSelectionChange,
} from "./test_utils.mjs";

async function enableSelectTool(page) {
  await page.click("#secondaryToolbarToggleButton");
  await page.waitForSelector("#secondaryToolbar", { hidden: false });

  await page.click("#cursorSelectTool");
  await page.waitForFunction(
    "window.PDFViewerApplication.pdfCursorTools.activeTool === 0"
  );
}

async function enableHandTool(page) {
  await page.click("#secondaryToolbarToggleButton");
  await page.waitForSelector("#secondaryToolbar", { hidden: false });

  await page.click("#cursorHandTool");
  await page.waitForFunction(
    "window.PDFViewerApplication.pdfCursorTools.activeTool === 1"
  );
}

describe("Cursor tools", () => {
  describe("Text selection", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".textLayer .endOfContent",
        100
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("check that text selection works", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await enableSelectTool(page);

          const spanRect = await getRect(
            page,
            `.page[data-page-number="1"] > .textLayer > span`
          );
          const x = spanRect.x + 1,
            y = spanRect.y + spanRect.height / 2;

          await page.mouse.click(x, y, { count: 3 });
          await waitForSelectionChange(
            page,
            "Trace-based Just-in-Time Type Specialization for Dynamic"
          );

          // Remove the selection.
          await page.mouse.click(x, y);
          await waitForSelectionChange(page, "");
        })
      );
    });
  });

  describe("Hand tool", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".textLayer .endOfContent",
        100
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("check that hand tool scrolling works", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await enableHandTool(page);

          const pageHeight = await page.evaluate(
            () =>
              document.querySelector(`.page[data-page-number="1"]`).offsetHeight
          );
          const steps = 10,
            delta = Math.floor(pageHeight / steps);

          const spanRect = await getRect(
            page,
            `.page[data-page-number="1"] > .textLayer > span`
          );
          const x = spanRect.x + 1,
            y = spanRect.y + spanRect.height / 2;

          for (let i = 0; i < steps; i++) {
            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.mouse.move(x, y - delta);
            await page.mouse.up();
          }
          // Ensure that the second page is visible.
          await page.waitForFunction("window.PDFViewerApplication.page === 2");

          // Finally, disable the hand tool.
          await enableSelectTool(page);
        })
      );
    });
  });
});
