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
  kbSelectAll,
  loadAndWait,
  scrollIntoView,
} from "./test_utils.mjs";

const selectAll = async page => {
  await kbSelectAll(page);
  await page.waitForFunction(
    () => !document.querySelector(".highlightEditor:not(.selectedEditor)")
  );
};

const getSpanRectFromText = (page, pageNumber, text) => {
  return page.evaluate(
    (number, content) => {
      for (const el of document.querySelectorAll(
        `.page[data-page-number="${number}"] > .textLayer > span`
      )) {
        if (el.textContent === content) {
          const { x, y, width, height } = el.getBoundingClientRect();
          return { x, y, width, height };
        }
      }
      return null;
    },
    pageNumber,
    text
  );
};

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

          const rect = await getSpanRectFromText(page, 1, "Abstract");
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

          const rect = await getSpanRectFromText(page, 1, "Abstract");
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

  describe("The default color must have the correct value", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        null,
        null,
        { highlightEditorColors: "red=#AB0000" }
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must highlight with red color", async () => {
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

          const usedColor = await page.evaluate(() => {
            const highlight = document.querySelector(
              `.page[data-page-number = "1"] .canvasWrapper > svg.highlight`
            );
            return highlight.getAttribute("fill");
          });

          expect(usedColor).withContext(`In ${browserName}`).toEqual("#AB0000");
        })
      );
    });
  });

  describe("Invisible editor must change its color", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        null,
        null,
        { highlightEditorColors: "yellow=#FFFF98,green=#53FFBC" }
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must scroll and change the color without exceptions", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#editorHighlight");
          await page.waitForSelector(".annotationEditorLayer.highlightEditing");

          let rect = await getSpanRectFromText(page, 1, "Abstract");
          let x = rect.x + rect.width / 2;
          let y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2 });

          await page.waitForSelector(`${getEditorSelector(0)}`);
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlightOutline.selected`
          );

          for (const pageNumber of Array.from(
            new Array(13).keys(),
            n => n + 2
          )) {
            await scrollIntoView(
              page,
              `.page[data-page-number = "${pageNumber}"]`
            );
          }
          await page.waitForSelector(
            `.page[data-page-number = "14"] .textLayer .endOfContent`
          );

          rect = await getSpanRectFromText(page, 14, "References");
          x = rect.x + rect.width / 2;
          y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2 });
          await page.waitForSelector(`${getEditorSelector(1)}`);
          await page.waitForSelector(
            `.page[data-page-number = "14"] svg.highlightOutline.selected`
          );
          await selectAll(page);
          await page.waitForSelector(
            `${getEditorSelector(1)} .editToolbar button.colorPicker`
          );
          await page.click(
            `${getEditorSelector(1)} .editToolbar button.colorPicker`
          );
          await page.waitForSelector(
            `${getEditorSelector(1)} .editToolbar button[title = "Green"]`
          );
          await page.click(
            `${getEditorSelector(1)} .editToolbar button[title = "Green"]`
          );
          await page.waitForSelector(
            `.page[data-page-number = "14"] svg.highlight[fill = "#53FFBC"]`
          );

          for (const pageNumber of Array.from(
            new Array(13).keys(),
            n => 13 - n
          )) {
            await scrollIntoView(
              page,
              `.page[data-page-number = "${pageNumber}"]`
            );
          }

          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlight[fill = "#53FFBC"]`
          );
        })
      );
    });
  });
});
