/* Copyright 2022 Mozilla Foundation
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

const {
  closePages,
  getEditorDimensions,
  loadAndWait,
  serializeBitmapDimensions,
} = require("./test_utils.js");
const path = require("path");

describe("Stamp Editor", () => {
  describe("Basic operations", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must load a PNG which is bigger than a page", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          if (browserName === "firefox") {
            pending(
              "Disabled in Firefox, because of https://bugzilla.mozilla.org/1553847."
            );
          }

          await page.click("#editorStamp");

          const rect = await page.$eval(".annotationEditorLayer", el => {
            // With Chrome something is wrong when serializing a DomRect,
            // hence we extract the values and just return them.
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          await page.mouse.click(rect.x + 100, rect.y + 100);
          const input = await page.$("#stampEditorFileInput");
          await input.uploadFile(
            `${path.join(__dirname, "../images/firefox_logo.png")}`
          );

          await page.waitForTimeout(300);

          const { width, height } = await getEditorDimensions(page, 0);

          // The image is bigger than the page, so it has been scaled down to
          // 75% of the page width.
          expect(width).toEqual("75%");
          expect(height).toEqual("auto");

          const [bitmap] = await serializeBitmapDimensions(page);
          expect(bitmap.width).toEqual(512);
          expect(bitmap.height).toEqual(543);

          await page.keyboard.down("Control");
          await page.keyboard.press("a");
          await page.keyboard.up("Control");
          await page.waitForTimeout(10);

          await page.keyboard.press("Backspace");
        })
      );
    });

    it("must load a SVG", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          if (browserName === "firefox") {
            pending(
              "Disabled in Firefox, because of https://bugzilla.mozilla.org/1553847."
            );
          }

          const rect = await page.$eval(".annotationEditorLayer", el => {
            // With Chrome something is wrong when serializing a DomRect,
            // hence we extract the values and just return them.
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          await page.mouse.click(rect.x + 100, rect.y + 100);
          const input = await page.$("#stampEditorFileInput");
          await input.uploadFile(
            `${path.join(__dirname, "../images/firefox_logo.svg")}`
          );

          await page.waitForTimeout(300);

          const { width, height } = await getEditorDimensions(page, 1);

          expect(Math.round(parseFloat(width))).toEqual(40);
          expect(height).toEqual("auto");

          const [bitmap] = await serializeBitmapDimensions(page);
          // The original size is 80x242 but to increase the resolution when it
          // is rasterized we scale it up by 96 / 72
          const ratio = await page.evaluate(
            () => window.pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS
          );
          expect(bitmap.width).toEqual(Math.round(242 * ratio));
          expect(bitmap.height).toEqual(Math.round(80 * ratio));

          await page.keyboard.down("Control");
          await page.keyboard.press("a");
          await page.keyboard.up("Control");
          await page.waitForTimeout(10);

          await page.keyboard.press("Backspace");
        })
      );
    });
  });

  describe("Page overflow", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer", 50);
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that an added image stay within the page", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          if (browserName === "firefox") {
            pending(
              "Disabled in Firefox, because of https://bugzilla.mozilla.org/1553847."
            );
          }

          await page.click("#editorStamp");

          const rect = await page.$eval(".annotationEditorLayer", el => {
            // With Chrome something is wrong when serializing a DomRect,
            // hence we extract the values and just return them.
            const { right, bottom } = el.getBoundingClientRect();
            return { x: right, y: bottom };
          });

          await page.mouse.click(rect.x - 10, rect.y - 10);
          const input = await page.$("#stampEditorFileInput");
          await input.uploadFile(
            `${path.join(__dirname, "../images/firefox_logo.png")}`
          );

          await page.waitForTimeout(300);

          const { left } = await getEditorDimensions(page, 0);

          // The image is bigger than the page, so it has been scaled down to
          // 75% of the page width.
          expect(left).toEqual("25%");
        })
      );
    });
  });
});
