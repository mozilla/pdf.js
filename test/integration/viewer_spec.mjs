/* Copyright 2024 Mozilla Foundation
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

import { closePages, loadAndWait } from "./test_utils.mjs";

describe("PDF viewer", () => {
  describe("Zoom with the mouse wheel", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".textLayer .endOfContent", 1000);
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that we can zoom with the mouse wheel and pressed control key", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          if (browserName === "firefox") {
            // Skip this test for Firefox, as it's not working correctly.
            // See https://github.com/puppeteer/puppeteer/issues/12093.
            // TODO: Remove this check once the issue is resolved.
            return;
          }
          await page.keyboard.down("Control");
          let zoom = 10;
          const zoomGetter = () =>
            page.evaluate(
              () => window.PDFViewerApplication.pdfViewer.currentScale
            );
          while (zoom > 0.1) {
            await page.mouse.wheel({ deltaY: 100 });
            zoom = await zoomGetter();
          }
          while (zoom < 10) {
            await page.mouse.wheel({ deltaY: -100 });
            zoom = await zoomGetter();
          }
          await page.keyboard.up("Control");
        })
      );
    });
  });

  describe("Zoom commands", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".textLayer .endOfContent");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that zoom commands don't scroll the document", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          for (let i = 0; i < 10; i++) {
            await page.evaluate(() => window.PDFViewerApplication.zoomIn());
            await page.evaluate(() => window.PDFViewerApplication.zoomReset());
            await page.waitForSelector(
              `.page[data-page-number="1"] .textLayer .endOfContent`
            );
            const scrollTop = await page.evaluate(
              () => document.getElementById("viewerContainer").scrollTop
            );
            expect(scrollTop < 100)
              .withContext(`In ${browserName}`)
              .toBe(true);
          }
        })
      );
    });
  });
});
