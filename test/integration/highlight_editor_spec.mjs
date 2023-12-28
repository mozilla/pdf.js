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

import {
  closePages,
  getEditorSelector,
  loadAndWait,
  scrollIntoView,
} from "./test_utils.mjs";

describe("Highlight Editor", () => {
  describe("Editor must be removed without exception", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must scroll and check that the draw layer is there", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#editorHighlight");
          await page.waitForSelector(".annotationEditorLayer.highlightEditing");

          const rect = await page.evaluate(() => {
            for (const el of document.querySelectorAll(
              `.page[data-page-number="1"] > .textLayer > span`
            )) {
              if (el.textContent === "Abstract") {
                const { x, y, width, height } = el.getBoundingClientRect();
                return { x, y, width, height };
              }
            }
            return null;
          });

          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2 });

          await page.waitForSelector(`${getEditorSelector(0)}`);

          const oneToOne = Array.from(new Array(13).keys(), n => n + 2).concat(
            Array.from(new Array(13).keys(), n => 13 - n)
          );
          for (const pageNumber of oneToOne) {
            await scrollIntoView(
              page,
              `.page[data-page-number = "${pageNumber}"]`
            );
          }

          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlight`,
            {
              visible: true,
            }
          );
        })
      );
    });
  });

  describe("Editor must keep selected", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must scroll and check that the highlight is selected", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#editorHighlight");
          await page.waitForSelector(".annotationEditorLayer.highlightEditing");

          const rect = await page.evaluate(() => {
            for (const el of document.querySelectorAll(
              `.page[data-page-number="1"] > .textLayer > span`
            )) {
              if (el.textContent === "Abstract") {
                const { x, y, width, height } = el.getBoundingClientRect();
                return { x, y, width, height };
              }
            }
            return null;
          });

          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2 });

          await page.waitForSelector(`${getEditorSelector(0)}`);
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlightOutline.selected`
          );

          const oneToOne = Array.from(new Array(13).keys(), n => n + 2).concat(
            Array.from(new Array(13).keys(), n => 13 - n)
          );
          for (const pageNumber of oneToOne) {
            await scrollIntoView(
              page,
              `.page[data-page-number = "${pageNumber}"]`
            );
          }

          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlightOutline.selected`
          );
        })
      );
    });
  });
});
