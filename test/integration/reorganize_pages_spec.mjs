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
  clearInput,
  closePages,
  createPromise,
  dragAndDrop,
  getRect,
  getThumbnailSelector,
  loadAndWait,
  waitForDOMMutation,
} from "./test_utils.mjs";

async function waitForThumbnailVisible(page, pageNums) {
  await page.click("#viewsManagerToggleButton");

  const thumbSelector = "#thumbnailsView .thumbnailImage";
  await page.waitForSelector(thumbSelector, { visible: true });
  if (!pageNums) {
    return null;
  }
  if (!Array.isArray(pageNums)) {
    pageNums = [pageNums];
  }
  return Promise.all(
    pageNums.map(pageNum =>
      page.waitForSelector(getThumbnailSelector(pageNum), { visible: true })
    )
  );
}

function waitForPagesEdited(page) {
  return createPromise(page, resolve => {
    window.PDFViewerApplication.eventBus.on(
      "pagesedited",
      ({ pagesMapper }) => {
        resolve(Array.from(pagesMapper.getMapping()));
      },
      {
        once: true,
      }
    );
  });
}

function getSearchResults(page) {
  return page.evaluate(() => {
    const pages = document.querySelectorAll(".page");
    const results = [];
    for (let i = 0; i < pages.length; i++) {
      const domPage = pages[i];
      const pageNumber = parseInt(domPage.getAttribute("data-page-number"), 10);
      const highlights = domPage.querySelectorAll("span.highlight");
      if (highlights.length === 0) {
        continue;
      }
      results.push([
        i + 1,
        pageNumber,
        Array.from(highlights).map(span => span.textContent),
      ]);
    }
    return results;
  });
}

function movePages(page, selectedPages, atIndex) {
  return page.evaluate(
    (selected, index) => {
      const viewer = window.PDFViewerApplication.pdfViewer;
      const pagesToMove = Array.from(selected).sort((a, b) => a - b);
      viewer.pagesMapper.pagesNumber =
        document.querySelectorAll(".page").length;
      viewer.pagesMapper.movePages(new Set(pagesToMove), pagesToMove, index);
      window.PDFViewerApplication.eventBus.dispatch("pagesedited", {
        pagesMapper: viewer.pagesMapper,
        index,
        pagesToMove,
      });
    },
    selectedPages,
    atIndex
  );
}

describe("Reorganize Pages View", () => {
  describe("Drag & Drop", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "page_with_number.pdf",
        "#viewsManagerToggleButton",
        "page-fit",
        null,
        { enableSplitMerge: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should show a drag marker when dragging a thumbnail", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          const rect1 = await getRect(page, getThumbnailSelector(1));
          const rect2 = await getRect(page, getThumbnailSelector(2));

          const handleAddedMarker = await waitForDOMMutation(
            page,
            mutationList => {
              for (const mutation of mutationList) {
                if (mutation.type !== "childList") {
                  continue;
                }
                for (const node of mutation.addedNodes) {
                  if (node.classList.contains("dragMarker")) {
                    return true;
                  }
                }
              }
              return false;
            }
          );
          const handleRemovedMarker = await waitForDOMMutation(
            page,
            mutationList => {
              for (const mutation of mutationList) {
                if (mutation.type !== "childList") {
                  continue;
                }
                for (const node of mutation.removedNodes) {
                  if (node.classList.contains("dragMarker")) {
                    return true;
                  }
                }
              }
              return false;
            }
          );
          const dndPromise = dragAndDrop(
            page,
            getThumbnailSelector(1),
            [[0, rect2.y - rect1.y + rect2.height / 2]],
            10
          );
          await dndPromise;
          await awaitPromise(handleAddedMarker);
          await awaitPromise(handleRemovedMarker);
        })
      );
    });

    it("should reorder thumbnails after dropping", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          const rect1 = await getRect(page, getThumbnailSelector(1));
          const rect2 = await getRect(page, getThumbnailSelector(2));

          const handlePagesEdited = await waitForPagesEdited(page);
          await dragAndDrop(
            page,
            getThumbnailSelector(1),
            [[0, rect2.y - rect1.y + rect2.height / 2]],
            10
          );
          const pagesMapping = await awaitPromise(handlePagesEdited);
          expect(pagesMapping)
            .withContext(`In ${browserName}`)
            .toEqual([
              2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
            ]);
        })
      );
    });

    it("should reorder thumbnails after dropping at position 0", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          const rect1 = await getRect(page, getThumbnailSelector(1));
          const rect2 = await getRect(page, getThumbnailSelector(2));

          const handlePagesEdited = await waitForPagesEdited(page);
          await dragAndDrop(
            page,
            getThumbnailSelector(2),
            [[0, rect1.y - rect2.y - rect1.height]],
            10
          );
          const pagesMapping = await awaitPromise(handlePagesEdited);
          expect(pagesMapping)
            .withContext(`In ${browserName}`)
            .toEqual([
              2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
            ]);
        })
      );
    });

    it("should reorder thumbnails after dropping two adjacent pages", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          const rect2 = await getRect(page, getThumbnailSelector(2));
          const rect4 = await getRect(page, getThumbnailSelector(4));
          await page.click(`.thumbnail:has(${getThumbnailSelector(1)}) input`);

          const handlePagesEdited = await waitForPagesEdited(page);
          await dragAndDrop(
            page,
            getThumbnailSelector(2),
            [[0, rect4.y - rect2.y]],
            10
          );
          const pagesMapping = await awaitPromise(handlePagesEdited);
          expect(pagesMapping)
            .withContext(`In ${browserName}`)
            .toEqual([
              3, 4, 1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
            ]);
        })
      );
    });

    it("should reorder thumbnails after dropping two non-adjacent pages", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          const rect1 = await getRect(page, getThumbnailSelector(1));
          const rect2 = await getRect(page, getThumbnailSelector(2));
          await (await page.$(".thumbnail[page-id='14'")).scrollIntoView();
          await page.waitForSelector(getThumbnailSelector(14), {
            visible: true,
          });
          await page.click(`.thumbnail:has(${getThumbnailSelector(14)}) input`);
          await (await page.$(".thumbnail[page-id='1'")).scrollIntoView();
          await page.waitForSelector(getThumbnailSelector(1), {
            visible: true,
          });

          const handlePagesEdited = await waitForPagesEdited(page);
          await dragAndDrop(
            page,
            getThumbnailSelector(1),
            [[0, rect2.y - rect1.y + rect2.height / 2]],
            10
          );
          const pagesMapping = await awaitPromise(handlePagesEdited);
          expect(pagesMapping)
            .withContext(`In ${browserName}`)
            .toEqual([
              2, 1, 14, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17,
            ]);
        })
      );
    });

    it("should select the dropped page (bug 2010820)", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          const rect1 = await getRect(page, getThumbnailSelector(1));
          const rect2 = await getRect(page, getThumbnailSelector(2));

          await page.click(getThumbnailSelector(2));
          await page.waitForSelector(
            `${getThumbnailSelector(2)}[aria-current="page"]`
          );

          const handlePagesEdited = await waitForPagesEdited(page);
          await dragAndDrop(
            page,
            getThumbnailSelector(1),
            [[0, rect2.y - rect1.y + rect2.height / 2]],
            10
          );
          await awaitPromise(handlePagesEdited);
          await page.waitForSelector(
            `${getThumbnailSelector(2)}[aria-current="false"]`
          );
          await page.waitForSelector(
            `${getThumbnailSelector(1)}[aria-current="page"]`
          );
        })
      );
    });
  });

  describe("Search in pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "page_with_number.pdf",
        "#viewsManagerToggleButton",
        "1",
        null,
        { enableSplitMerge: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should check if the search is working after moving pages", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#viewFindButton");
          await page.waitForSelector(":has(> #findHighlightAll)", {
            visible: true,
          });
          await page.click(":has(> #findHighlightAll)");

          await page.waitForSelector("#findInput", { visible: true });
          await page.type("#findInput", "1");
          await page.keyboard.press("Enter");

          await page.waitForFunction(
            () => document.querySelectorAll("span.highlight").length === 10
          );

          let results = await getSearchResults(page);
          expect(results)
            .withContext(`In ${browserName}`)
            .toEqual([
              // Page number, Id, [matches]
              [1, 1, ["1"]],
              [10, 10, ["1"]],
              [11, 11, ["1", "1"]],
              [12, 12, ["1"]],
              [13, 13, ["1"]],
              [14, 14, ["1"]],
              [15, 15, ["1"]],
              [16, 16, ["1"]],
              [17, 17, ["1"]],
            ]);

          await movePages(page, [11, 2], 3);
          await page.waitForFunction(
            () => document.querySelectorAll("span.highlight").length === 0
          );

          await clearInput(page, "#findInput", true);
          await page.type("#findInput", "1");
          await page.keyboard.press("Enter");

          await page.waitForFunction(
            () => document.querySelectorAll("span.highlight").length === 10
          );

          results = await getSearchResults(page);
          expect(results)
            .withContext(`In ${browserName}`)
            .toEqual([
              // Page number, Id, [matches]
              [1, 1, ["1"]],
              [4, 11, ["1", "1"]],
              [11, 10, ["1"]],
              [12, 12, ["1"]],
              [13, 13, ["1"]],
              [14, 14, ["1"]],
              [15, 15, ["1"]],
              [16, 16, ["1"]],
              [17, 17, ["1"]],
            ]);

          await movePages(page, [13], 0);
          await page.waitForFunction(
            () => document.querySelectorAll("span.highlight").length === 0
          );

          await clearInput(page, "#findInput", true);
          await page.type("#findInput", "1");
          await page.keyboard.press("Enter");

          await page.waitForFunction(
            () => document.querySelectorAll("span.highlight").length === 10
          );

          results = await getSearchResults(page);
          expect(results)
            .withContext(`In ${browserName}`)
            .toEqual([
              // Page number, Id, [matches]
              [1, 13, ["1"]],
              [2, 1, ["1"]],
              [5, 11, ["1", "1"]],
              [12, 10, ["1"]],
              [13, 12, ["1"]],
              [14, 14, ["1"]],
              [15, 15, ["1"]],
              [16, 16, ["1"]],
              [17, 17, ["1"]],
            ]);
        })
      );
    });
  });
});
