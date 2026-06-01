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
  awaitPromise,
  closePages,
  createPromise,
  loadAndWait,
  waitForTimeout,
} from "./test_utils.mjs";

async function enterPresentationMode(page) {
  await page.click("#secondaryToolbarToggleButton");
  await page.waitForSelector("#secondaryToolbar", { hidden: false });

  const handlePresentationModeChanged = await createPromise(page, resolve => {
    window.PDFViewerApplication.eventBus.on(
      "presentationmodechanged",
      resolve,
      { once: true }
    );
  });
  await page.click("#presentationMode");
  await awaitPromise(handlePresentationModeChanged);

  // Check that presentation mode is active and that the toolbar is
  // invisible; the latter differentiates between proper presentation
  // mode and pressing F11 to only hide the browser's UI elements.
  await page.waitForFunction(`document.fullscreenElement !== null`);
  await page.waitForSelector("#viewerContainer.pdfPresentationMode", {
    visible: true,
  });
  await page.waitForSelector("#toolbarContainer", { visible: false });
  await page.waitForFunction(
    `window.PDFViewerApplication.pdfViewer.currentPageNumber === 1`
  );
  await page.waitForFunction(
    `window.PDFViewerApplication.pdfViewer.currentScaleValue === "page-fit"`
  );
}

async function exitPresentationMode(page, browserName) {
  // Note that in Chrome pressing Escape does not work to exit full screen mode
  // in the Puppeteer scope, so there we exit full screen mode programmatically
  // instead, which is equivalent to what happens if Escape is pressed.
  const handlePresentationModeChanged = await createPromise(page, resolve => {
    window.PDFViewerApplication.eventBus.on(
      "presentationmodechanged",
      resolve,
      { once: true }
    );
  });
  await (browserName === "chrome"
    ? page.evaluate(() => document.exitFullscreen())
    : page.keyboard.press("Escape"));
  await awaitPromise(handlePresentationModeChanged);

  // Check that presentation mode is not active anymore and the toolbar
  // is visible again.
  await page.waitForFunction(`document.fullscreenElement === null`);
  await page.waitForSelector("#viewerContainer:not(.pdfPresentationMode)", {
    visible: true,
  });
  await page.waitForSelector("#toolbarContainer", { visible: true });
  await page.waitForFunction(
    `window.PDFViewerApplication.pdfViewer.currentPageNumber === 1`
  );
  await page.waitForFunction(
    `window.PDFViewerApplication.pdfViewer.currentScaleValue !== "page-fit"`
  );
}

describe("PDFPresentationMode", () => {
  describe("Changing pages", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "basicapi.pdf",
        ".textLayer .endOfContent",
        100
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that changing pages using arrow keys works in presentation mode", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await enterPresentationMode(page);

          // Go to the next page.
          await page.keyboard.press("ArrowDown");
          await page.waitForFunction(
            `window.PDFViewerApplication.pdfViewer.currentPageNumber === 2`
          );

          // Go to the previous page.
          await page.keyboard.press("ArrowUp");
          await page.waitForFunction(
            `window.PDFViewerApplication.pdfViewer.currentPageNumber === 1`
          );

          await exitPresentationMode(page, browserName);
        })
      );
    });

    it("must check that changing pages using mouse wheel works in presentation mode", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await enterPresentationMode(page);

          // Go to the next page.
          await page.mouse.wheel({ deltaY: 100 });
          await page.waitForFunction(
            `window.PDFViewerApplication.pdfViewer.currentPageNumber === 2`
          );

          // Wait until the viewer accepts a new mouse scroll event; see
          // `MOUSE_SCROLL_COOLDOWN_TIME` in `web/pdf_presentation_mode.js`.
          // eslint-disable-next-line no-restricted-syntax
          await waitForTimeout(50);

          // Go to the previous page.
          await page.mouse.wheel({ deltaY: -100 });
          await page.waitForFunction(
            `window.PDFViewerApplication.pdfViewer.currentPageNumber === 1`
          );

          await exitPresentationMode(page, browserName);
        })
      );
    });

    it("must check that changing pages using mouse click works in presentation mode", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await enterPresentationMode(page);

          // Go to the next page.
          await page.click(".page[data-page-number='1']");
          await page.waitForFunction(
            `window.PDFViewerApplication.pdfViewer.currentPageNumber === 2`
          );

          // Go to the previous page.
          await page.keyboard.down("Shift");
          await page.click(".page[data-page-number='2']");
          await page.keyboard.up("Shift");
          await page.waitForFunction(
            `window.PDFViewerApplication.pdfViewer.currentPageNumber === 1`
          );

          await exitPresentationMode(page, browserName);
        })
      );
    });

    it("check that clicking on internal links work in presentation mode", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await enterPresentationMode(page);

          // Go to the last page.
          await page.click("#pdfjs_internal_id_12R");
          await page.waitForFunction(
            `window.PDFViewerApplication.pdfViewer.currentPageNumber === 3`
          );

          // Go to the first page.
          await page.keyboard.press("Home");
          await page.waitForFunction(
            `window.PDFViewerApplication.pdfViewer.currentPageNumber === 1`
          );

          await exitPresentationMode(page, browserName);
        })
      );
    });
  });
});
