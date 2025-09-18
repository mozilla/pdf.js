/* Copyright 2025 Mozilla Foundation
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
  getEditorSelector,
  getRect,
  getSpanRectFromText,
  loadAndWait,
  scrollIntoView,
  switchToEditor,
  waitAndClick,
} from "./test_utils.mjs";

const switchToHighlight = switchToEditor.bind(null, "Highlight");

describe("Comment", () => {
  describe("Comment edit dialog must be visible in ltr", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "bug1989304.pdf",
        ".annotationEditorLayer",
        "page-width",
        null,
        { enableComment: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must set the comment dialog in the viewport (LTR)", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          await scrollIntoView(page, ".textLayer span:last-of-type");
          const rect = await getSpanRectFromText(page, 1, "...");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          // Here and elsewhere, we add a small delay between press and release
          // to make sure that a pointerup event is triggered after
          // selectionchange.
          // It works with a value of 1ms, but we use 100ms to be sure.
          await page.mouse.click(x, y, { count: 2, delay: 100 });
          await page.waitForSelector(getEditorSelector(0));

          const commentButtonSelector = `${getEditorSelector(0)} button.comment`;
          await waitAndClick(page, commentButtonSelector);

          await page.waitForSelector("#commentManagerDialog", {
            visible: true,
          });
          const dialogRect = await getRect(page, "#commentManagerDialog");
          const viewport = await page.evaluate(() => ({
            width: document.documentElement.clientWidth,
            height: document.documentElement.clientHeight,
          }));
          expect(dialogRect.x + dialogRect.width)
            .withContext(`In ${browserName}`)
            .toBeLessThanOrEqual(viewport.width);
          expect(dialogRect.y + dialogRect.height)
            .withContext(`In ${browserName}`)
            .toBeLessThanOrEqual(viewport.height);
        })
      );
    });
  });

  describe("Comment edit dialog must be visible in rtl", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "bug1989304.pdf",
        ".annotationEditorLayer",
        "page-width",
        null,
        { enableComment: true, localeProperties: "ar" }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must set the comment dialog in the viewport (RTL)", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          await scrollIntoView(page, ".textLayer span:nth-of-type(4)");
          const rect = await getSpanRectFromText(page, 1, "World");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });
          await page.waitForSelector(getEditorSelector(0));

          const commentButtonSelector = `${getEditorSelector(0)} button.comment`;
          await waitAndClick(page, commentButtonSelector);

          await page.waitForSelector("#commentManagerDialog", {
            visible: true,
          });
          const dialogRect = await getRect(page, "#commentManagerDialog");
          const viewport = await page.evaluate(() => ({
            height: document.documentElement.clientHeight,
          }));
          expect(dialogRect.x + dialogRect.width)
            .withContext(`In ${browserName}`)
            .toBeGreaterThanOrEqual(0);
          expect(dialogRect.y + dialogRect.height)
            .withContext(`In ${browserName}`)
            .toBeLessThanOrEqual(viewport.height);
        })
      );
    });
  });
});
