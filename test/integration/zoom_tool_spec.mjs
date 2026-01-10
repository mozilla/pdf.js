/* Copyright 2026 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
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
  loadAndWait,
  waitForPageRendered,
} from "./test_utils.mjs";

describe("Zoom Tool", () => {
  describe("Zoom to rectangle", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".textLayer .endOfContent",
        "page-fit"
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must activate and deactivate the zoom tool via button click", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // Open secondary toolbar
          await page.click("#secondaryToolbarToggleButton");
          await page.waitForSelector("#secondaryToolbar:not(.hidden)");

          // Click on the zoom tool button
          await page.click("#cursorZoomTool");

          // Verify the tool is active by checking the toggled class
          const isToggled = await page.evaluate(() =>
            document
              .getElementById("cursorZoomTool")
              .classList.contains("toggled")
          );
          expect(isToggled).withContext(`In ${browserName}`).toBe(true);

          // Verify the viewer container has the zoom-to-rect-grab cursor class
          const hasGrabClass = await page.evaluate(() =>
            document
              .getElementById("viewerContainer")
              .classList.contains("zoom-to-rect-grab")
          );
          expect(hasGrabClass).withContext(`In ${browserName}`).toBe(true);

          // Click on select tool to deactivate zoom tool
          await page.click("#cursorSelectTool");

          // Verify the zoom tool is no longer toggled
          const isStillToggled = await page.evaluate(() =>
            document
              .getElementById("cursorZoomTool")
              .classList.contains("toggled")
          );
          expect(isStillToggled).withContext(`In ${browserName}`).toBe(false);

          // Verify the viewer container no longer has the cursor class
          const stillHasGrabClass = await page.evaluate(() =>
            document
              .getElementById("viewerContainer")
              .classList.contains("zoom-to-rect-grab")
          );
          expect(stillHasGrabClass)
            .withContext(`In ${browserName}`)
            .toBe(false);
        })
      );
    });

    it("must zoom to a drawn rectangle", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // Get initial scale
          const initialScale = await page.evaluate(
            () => window.PDFViewerApplication.pdfViewer.currentScale
          );

          // Open secondary toolbar and activate zoom tool
          await page.click("#secondaryToolbarToggleButton");
          await page.waitForSelector("#secondaryToolbar:not(.hidden)");
          await page.click("#cursorZoomTool");

          // Wait for the toolbar to close
          await page.waitForSelector("#secondaryToolbar.hidden");

          // Get the viewer container rect
          const containerRect = await page.evaluate(() => {
            const container = document.getElementById("viewerContainer");
            const rect = container.getBoundingClientRect();
            return {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            };
          });

          // Draw a rectangle on the viewer (drag from one point to another)
          const startX = containerRect.x + 100;
          const startY = containerRect.y + 100;
          const endX = startX + 200;
          const endY = startY + 200;

          // Wait for render and perform drag
          const handle = await waitForPageRendered(page);

          await page.mouse.move(startX, startY);
          await page.mouse.down();
          await page.mouse.move(endX, endY, { steps: 5 });
          await page.mouse.up();

          await awaitPromise(handle);

          // Get the new scale after zooming
          const newScale = await page.evaluate(
            () => window.PDFViewerApplication.pdfViewer.currentScale
          );

          // The scale should have increased
          expect(newScale)
            .withContext(`In ${browserName}`)
            .toBeGreaterThan(initialScale);
        })
      );
    });

    it("must ignore small drags (clicks)", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // Get initial scale
          const initialScale = await page.evaluate(
            () => window.PDFViewerApplication.pdfViewer.currentScale
          );

          // Open secondary toolbar and activate zoom tool
          await page.click("#secondaryToolbarToggleButton");
          await page.waitForSelector("#secondaryToolbar:not(.hidden)");
          await page.click("#cursorZoomTool");

          // Wait for the toolbar to close
          await page.waitForSelector("#secondaryToolbar.hidden");

          // Get the viewer container rect
          const containerRect = await page.evaluate(() => {
            const container = document.getElementById("viewerContainer");
            const rect = container.getBoundingClientRect();
            return { x: rect.x, y: rect.y };
          });

          // Perform a very small drag (less than MIN_DRAG_SIZE = 5 pixels)
          const startX = containerRect.x + 100;
          const startY = containerRect.y + 100;
          const endX = startX + 3; // Only 3 pixels
          const endY = startY + 3;

          await page.mouse.move(startX, startY);
          await page.mouse.down();
          await page.mouse.move(endX, endY, { steps: 2 });
          await page.mouse.up();

          // Wait a bit for any potential zoom to occur
          await new Promise(resolve => {
            setTimeout(resolve, 200);
          });

          // Get the scale after the small drag
          const newScale = await page.evaluate(
            () => window.PDFViewerApplication.pdfViewer.currentScale
          );

          // The scale should remain the same since the drag was too small
          expect(newScale).withContext(`In ${browserName}`).toBe(initialScale);
        })
      );
    });

    it("must cancel zoom on Escape key", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // Get initial scale
          const initialScale = await page.evaluate(
            () => window.PDFViewerApplication.pdfViewer.currentScale
          );

          // Open secondary toolbar and activate zoom tool
          await page.click("#secondaryToolbarToggleButton");
          await page.waitForSelector("#secondaryToolbar:not(.hidden)");
          await page.click("#cursorZoomTool");

          // Wait for the toolbar to close
          await page.waitForSelector("#secondaryToolbar.hidden");

          // Get the viewer container rect
          const containerRect = await page.evaluate(() => {
            const container = document.getElementById("viewerContainer");
            const rect = container.getBoundingClientRect();
            return { x: rect.x, y: rect.y };
          });

          // Start a drag but press Escape before releasing
          const startX = containerRect.x + 100;
          const startY = containerRect.y + 100;
          const endX = startX + 200;
          const endY = startY + 200;

          await page.mouse.move(startX, startY);
          await page.mouse.down();
          await page.mouse.move(endX, endY, { steps: 5 });

          // Press Escape to cancel
          await page.keyboard.press("Escape");

          await page.mouse.up();

          // Wait a bit for any potential zoom to occur
          await new Promise(resolve => {
            setTimeout(resolve, 200);
          });

          // Get the scale after cancellation
          const newScale = await page.evaluate(
            () => window.PDFViewerApplication.pdfViewer.currentScale
          );

          // The scale should remain the same since the zoom was cancelled
          expect(newScale).withContext(`In ${browserName}`).toBe(initialScale);
        })
      );
    });
  });
});
