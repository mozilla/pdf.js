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
  createPromiseWithArgs,
  dragAndDrop,
  FSI,
  getAnnotationSelector,
  getRect,
  getThumbnailSelector,
  kbCopy,
  kbCut,
  kbDelete,
  loadAndWait,
  PDI,
  scrollIntoView,
  showViewsManager,
  waitAndClick,
  waitForBrowserTrip,
  waitForDOMMutation,
  waitForTextToBe,
  waitForTooltipToBe,
} from "./test_utils.mjs";

async function waitForThumbnailVisible(page, pageNums) {
  await showViewsManager(page);

  const thumbSelector = "#thumbnailsView .thumbnailImageContainer > img";
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

function waitForPagesEdited(page, type) {
  return createPromiseWithArgs(
    page,
    resolve => {
      const listener = ({ pagesMapper, type: ty }) => {
        // eslint-disable-next-line no-undef
        if (args[0] && args[0] !== ty) {
          return;
        }
        window.PDFViewerApplication.eventBus.off("pagesedited", listener);
        resolve(Array.from(pagesMapper.getMapping() || []));
      };
      window.PDFViewerApplication.eventBus.on("pagesedited", listener);
    },
    [type]
  );
}

async function waitForHavingContents(page, expected) {
  await page.evaluate(() => {
    // Make sure all the pages will be visible.
    window.PDFViewerApplication.pdfViewer.scrollMode = 2 /* = ScrollMode.WRAPPED = */;
    window.PDFViewerApplication.pdfViewer.updateScale({
      drawingDelay: 0,
      scaleFactor: 0.01,
    });
  });
  return page.waitForFunction(
    ex => {
      const buffer = [];
      for (const textLayer of document.querySelectorAll(".textLayer")) {
        buffer.push(parseInt(textLayer.textContent.trim(), 10));
      }
      return ex.length === buffer.length && ex.every((v, i) => v === buffer[i]);
    },
    {},
    expected
  );
}

function getSearchResults(page) {
  return page.evaluate(() => {
    const pages = document.querySelectorAll(".page");
    const results = [];
    for (let i = 0; i < pages.length; i++) {
      const domPage = pages[i];
      const highlights = domPage.querySelectorAll("span.highlight");
      if (highlights.length === 0) {
        continue;
      }
      results.push([
        i + 1,
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
      const pagesMapper = viewer.pdfDocument.pagesMapper;
      const pagesToMove = Array.from(selected).sort((a, b) => a - b);
      pagesMapper.pagesNumber = document.querySelectorAll(".page").length;
      pagesMapper.movePages(new Set(pagesToMove), pagesToMove, index);
      window.PDFViewerApplication.eventBus.dispatch("pagesedited", {
        pagesMapper,
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
                  if (node.classList?.contains("dragMarker")) {
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
                  if (node.classList?.contains("dragMarker")) {
                    return true;
                  }
                }
              }
              return false;
            }
          );
          await dragAndDrop(
            page,
            getThumbnailSelector(1),
            [[0, rect2.y - rect1.y + rect2.height / 2]],
            10
          );
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
          const expected = [
            2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pagesMapping)
            .withContext(`In ${browserName}`)
            .toEqual(expected);
          await waitForHavingContents(page, expected);
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
          const expected = [
            2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pagesMapping)
            .withContext(`In ${browserName}`)
            .toEqual(expected);
          await waitForHavingContents(page, expected);
        })
      );
    });

    it("should reorder thumbnails after dropping two adjacent pages", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          const rect2 = await getRect(page, getThumbnailSelector(2));
          const rect4 = await getRect(page, getThumbnailSelector(4));
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );

          const handlePagesEdited = await waitForPagesEdited(page);
          await dragAndDrop(
            page,
            getThumbnailSelector(2),
            [[0, rect4.y - rect2.y]],
            10
          );
          const pagesMapping = await awaitPromise(handlePagesEdited);
          const expected = [
            3, 4, 1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pagesMapping)
            .withContext(`In ${browserName}`)
            .toEqual(expected);
          await waitForHavingContents(page, expected);
        })
      );
    });

    it("should reorder thumbnails after dropping two non-adjacent pages", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          const rect1 = await getRect(page, getThumbnailSelector(1));
          const rect2 = await getRect(page, getThumbnailSelector(2));
          await (await page.$(".thumbnail[page-number='14'")).scrollIntoView();

          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(14)}) input`
          );
          await (await page.$(".thumbnail[page-number='1'")).scrollIntoView();
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
          const expected = [
            2, 1, 14, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17,
          ];
          expect(pagesMapping)
            .withContext(`In ${browserName}`)
            .toEqual(expected);
          await waitForHavingContents(page, expected);
        })
      );
    });

    it("should select the dropped page (bug 2010820)", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          const rect1 = await getRect(page, getThumbnailSelector(1));
          const rect2 = await getRect(page, getThumbnailSelector(2));

          await waitAndClick(page, getThumbnailSelector(2));
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
            `${getThumbnailSelector(2)}[aria-current="page"]`
          );
          await page.waitForSelector(
            `${getThumbnailSelector(1)}[aria-current="false"]`
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
          await waitAndClick(page, "#viewFindButton");
          await waitAndClick(page, ":has(> #findHighlightAll)");

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
              // Page number, [matches]
              [1, ["1"]],
              [10, ["1"]],
              [11, ["1", "1"]],
              [12, ["1"]],
              [13, ["1"]],
              [14, ["1"]],
              [15, ["1"]],
              [16, ["1"]],
              [17, ["1"]],
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
              // Page number, [matches]
              [1, ["1"]],
              [4, ["1", "1"]],
              [11, ["1"]],
              [12, ["1"]],
              [13, ["1"]],
              [14, ["1"]],
              [15, ["1"]],
              [16, ["1"]],
              [17, ["1"]],
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
              // Page number, [matches]
              [1, ["1"]],
              [2, ["1"]],
              [5, ["1", "1"]],
              [12, ["1"]],
              [13, ["1"]],
              [14, ["1"]],
              [15, ["1"]],
              [16, ["1"]],
              [17, ["1"]],
            ]);
        })
      );
    });
  });

  describe("Links and outlines", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "page_with_number_and_link.pdf",
        "#viewsManagerToggleButton",
        "page-fit",
        null,
        { enableSplitMerge: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should check that link is updated after moving pages", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await movePages(page, [2], 10);
          await scrollIntoView(page, getAnnotationSelector("107R"));
          await waitAndClick(page, getAnnotationSelector("107R"));
          const currentPage = await page.$eval(
            "#pageNumber",
            el => el.valueAsNumber
          );
          expect(currentPage).withContext(`In ${browserName}`).toBe(10);
        })
      );
    });

    it("should check that outlines are updated after moving pages", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await movePages(page, [2, 4], 10);

          await waitAndClick(page, "#viewsManagerSelectorButton");
          await waitAndClick(page, "#outlinesViewMenu");
          await page.waitForSelector("#outlinesView", { visible: true });

          await waitAndClick(page, "#outlinesView .treeItem:nth-child(2)");

          const currentPage = await page.$eval(
            "#pageNumber",
            el => el.valueAsNumber
          );
          // 9 because 2 and 4 were moved after page 10.
          expect(currentPage).withContext(`In ${browserName}`).toBe(9);
        })
      );
    });
  });

  describe("Drag marker must have the right non-zero dimensions", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "page_with_number_and_link.pdf",
        "#viewsManagerToggleButton",
        "1",
        null,
        {
          enableSplitMerge: true,
          sidebarViewOnLoad: 2 /* = SidebarView.OUTLINES */,
        }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should check if the drag marker width is non-zero", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.waitForSelector("#outlinesView", { visible: true });
          await waitAndClick(page, "#viewsManagerSelectorButton");
          await waitAndClick(page, "#thumbnailsViewMenu");

          const thumbSelector =
            "#thumbnailsView .thumbnailImageContainer > img";
          await page.waitForSelector(thumbSelector, { visible: true });
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
                  if (node.classList?.contains("dragMarker")) {
                    const rect = node.getBoundingClientRect();
                    return rect.width !== 0;
                  }
                }
              }
              return false;
            }
          );

          await dragAndDrop(
            page,
            getThumbnailSelector(1),
            [[0, rect2.y - rect1.y + rect2.height / 2]],
            10
          );

          await awaitPromise(handleAddedMarker);
        })
      );
    });
  });

  describe("Save a pdf", () => {
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

    it("should check that a save is triggered", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });
          const rect1 = await getRect(page, getThumbnailSelector(1));
          const rect2 = await getRect(page, getThumbnailSelector(2));

          await dragAndDrop(
            page,
            getThumbnailSelector(1),
            [[0, rect2.y - rect1.y + rect2.height / 2]],
            10
          );

          const handleSave = await createPromise(page, resolve => {
            window.PDFViewerApplication.onSavePages = async ({ data }) => {
              resolve(Array.from(data[0].pageIndices));
            };
          });

          await waitAndClick(page, "#downloadButton");
          const pageIndices = await awaitPromise(handleSave);
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual([
              1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
            ]);
        })
      );
    });
  });

  describe("Delete some pages", () => {
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

    it("should check that the pages are deleted", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(3)}) input`
          );

          const handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionDelete");

          const pageIndices = await awaitPromise(handlePagesEdited);
          const expected = [
            2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);
          await waitForHavingContents(page, expected);
        })
      );
    });

    it("should update the page count in the toolbar after deletion (bug 2018125)", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });

          const initialCount = await page.$eval("#pageNumber", el => el.max);
          expect(parseInt(initialCount, 10))
            .withContext(`In ${browserName}`)
            .toBe(17);

          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(3)}) input`
          );

          const handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionDelete");
          await awaitPromise(handlePagesEdited);

          await page.waitForFunction(
            () => document.querySelector("#pageNumber").max === "15"
          );
        })
      );
    });
  });

  describe("Cut and paste some pages", () => {
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

    it("should check that the pages has been cut and pasted correctly", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(3)}) input`
          );

          let handlePagesEdited = await waitForPagesEdited(page, "cut");
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCut");

          let pageIndices = await awaitPromise(handlePagesEdited);
          let expected = [2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);
          await waitForHavingContents(page, expected);

          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, `${getThumbnailSelector(1)}+button`);
          pageIndices = await awaitPromise(handlePagesEdited);
          expected = [
            2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);
          await waitForHavingContents(page, expected);
        })
      );
    });
  });

  describe("Copy and paste some pages", () => {
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

    it("should check that the paste button spans have the right l10n id depending on their position", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );

          const handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCopy");
          await awaitPromise(handlePagesEdited);

          await waitForTextToBe(
            page,
            `button.thumbnailPasteButton:has(+ ${getThumbnailSelector(1)}) > span`,
            "Paste"
          );
          await waitForTooltipToBe(
            page,
            `button.thumbnailPasteButton:has(+ ${getThumbnailSelector(1)})`,
            "Paste before the first page"
          );

          await waitForTextToBe(
            page,
            `${getThumbnailSelector(1)} + button.thumbnailPasteButton > span`,
            "Paste"
          );
          await waitForTooltipToBe(
            page,
            `${getThumbnailSelector(1)} + button.thumbnailPasteButton`,
            `Paste after page ${FSI}1${PDI}`
          );
        })
      );
    });

    it("should check that a page can be copied and pasted before the first thumbnail", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(2)}) input`
          );

          let handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCopy");

          let pageIndices = await awaitPromise(handlePagesEdited);
          let expected = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);
          await waitForHavingContents(page, expected);

          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(
            page,
            `button.thumbnailPasteButton:has(+ ${getThumbnailSelector(1)})`
          );
          pageIndices = await awaitPromise(handlePagesEdited);
          expected = [
            2, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);
          await waitForHavingContents(page, expected);
        })
      );
    });

    it("should check that the pages has been copied and pasted correctly", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(3)}) input`
          );

          let handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCopy");

          let pageIndices = await awaitPromise(handlePagesEdited);
          let expected = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);
          await waitForHavingContents(page, expected);

          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, `${getThumbnailSelector(2)}+button`);
          pageIndices = await awaitPromise(handlePagesEdited);
          expected = [
            1, 2, 1, 3, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);
          await waitForHavingContents(page, expected);
        })
      );
    });

    it("should have only one paste button next to the second thumbnail after cut, paste, and copy", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });

          // Select page 1 and cut it.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          let handlePagesEdited = await waitForPagesEdited(page, "cut");
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCut");
          await awaitPromise(handlePagesEdited);

          // Paste after the new first thumbnail (originally page 2).
          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, `${getThumbnailSelector(1)}+button`);
          await awaitPromise(handlePagesEdited);

          // Select the new first thumbnail and copy it.
          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCopy");
          await awaitPromise(handlePagesEdited);

          // The second thumbnail should have only one paste button after it.
          await page.waitForSelector(
            `${getThumbnailSelector(2)} + button.thumbnailPasteButton`,
            { visible: true }
          );
          const pasteButtons = await page.$$(
            `${getThumbnailSelector(2)} + button.thumbnailPasteButton`
          );
          expect(pasteButtons.length).withContext(`In ${browserName}`).toBe(1);
        })
      );
    });

    it("should disable delete and cut entries when all pages are selected", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);

          // Select all pages.
          const totalPages = await page.evaluate(
            () =>
              document.querySelectorAll("#thumbnailsView .thumbnail input")
                .length
          );
          for (let i = 1; i <= totalPages; i++) {
            await waitAndClick(
              page,
              `.thumbnail:has(${getThumbnailSelector(i)}) input`
            );
          }

          await waitAndClick(page, "#viewsManagerStatusActionButton");

          await page.waitForSelector(
            "#viewsManagerStatusActionDelete:disabled"
          );
          await page.waitForSelector("#viewsManagerStatusActionCut:disabled");
          await page.waitForSelector(
            "#viewsManagerStatusActionCopy:not(:disabled)"
          );
          await page.waitForSelector(
            "#viewsManagerStatusActionExport:not(:disabled)"
          );

          await page.keyboard.press("Escape");
        })
      );
    });
  });

  describe("Keyboard shortcuts for cut and copy (bug 2018139)", () => {
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

    it("should cut pages with Ctrl+X and paste them", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(3)}) input`
          );

          let handlePagesEdited = await waitForPagesEdited(page, "cut");
          await kbCut(page);

          let pageIndices = await awaitPromise(handlePagesEdited);
          let expected = [2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);
          await waitForHavingContents(page, expected);

          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, `${getThumbnailSelector(1)}+button`);
          pageIndices = await awaitPromise(handlePagesEdited);
          expected = [
            2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);
          await waitForHavingContents(page, expected);
        })
      );
    });

    it("should copy pages with Ctrl+C and paste them", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(3)}) input`
          );

          let handlePagesEdited = await waitForPagesEdited(page, "copy");
          await kbCopy(page);

          let pageIndices = await awaitPromise(handlePagesEdited);
          let expected = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);
          await waitForHavingContents(page, expected);

          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, `${getThumbnailSelector(2)}+button`);
          pageIndices = await awaitPromise(handlePagesEdited);
          expected = [
            1, 2, 1, 3, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);
          await waitForHavingContents(page, expected);
        })
      );
    });
  });

  describe("Keyboard shortcuts for delete (bug 2010831)", () => {
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

    it("should delete pages with the Delete key", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(3)}) input`
          );

          const handlePagesEdited = await waitForPagesEdited(page);
          await kbDelete(page);

          const pageIndices = await awaitPromise(handlePagesEdited);
          const expected = [
            2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);
          await waitForHavingContents(page, expected);
        })
      );
    });
  });

  describe("Thumbnails are not blank after cut/paste (bug 2018162)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "two_pages.pdf",
        "#viewsManagerToggleButton",
        "page-fit",
        null,
        { enableSplitMerge: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should check that the thumbnail has a blob src after cut and paste", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );

          for (let i = 1; i <= 2; i++) {
            await page.waitForSelector(
              `${getThumbnailSelector(i)} > img[src^="blob:http:"]`,
              { visible: true }
            );
          }

          let handlePagesEdited = await waitForPagesEdited(page, "cut");
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCut");
          await awaitPromise(handlePagesEdited);

          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, `${getThumbnailSelector(1)}+button`);
          await awaitPromise(handlePagesEdited);

          for (let i = 1; i <= 2; i++) {
            await page.waitForSelector(
              `${getThumbnailSelector(i)} > img[src^="blob:http:"]`,
              { visible: true }
            );
          }
        })
      );
    });
  });

  describe("Focus stays in sidebar after page operations (bug 2020731)", () => {
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

    it("should keep focus on a thumbnail after deleting pages", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );

          const handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionDelete");
          await awaitPromise(handlePagesEdited);

          await page.waitForSelector(
            "#thumbnailsView .thumbnailImageContainer:focus",
            {
              visible: true,
            }
          );
        })
      );
    });

    it("should keep focus on a thumbnail after pasting pages", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );

          let handlePagesEdited = await waitForPagesEdited(page, "cut");
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCut");
          await awaitPromise(handlePagesEdited);

          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, `${getThumbnailSelector(1)}+button`);
          await awaitPromise(handlePagesEdited);

          await page.waitForSelector(
            "#thumbnailsView .thumbnailImageContainer:focus",
            {
              visible: true,
            }
          );
        })
      );
    });
  });

  describe("Status label reflects number of checked thumbnails (bug 2010832)", () => {
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

    it("should update the status label when thumbnails are checked or unchecked", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });

          const labelSelector = "#viewsManagerStatusActionLabel";

          // Initially no pages are selected.
          await waitForTextToBe(page, labelSelector, "Select pages");

          // Check thumbnail 1: label should read "1 selected".
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          await waitForTextToBe(page, labelSelector, `${FSI}1${PDI} selected`);

          // Check thumbnail 2: label should read "2 selected".
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(2)}) input`
          );
          await waitForTextToBe(page, labelSelector, `${FSI}2${PDI} selected`);

          // Uncheck thumbnail 1: label should read "1 selected".
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          await waitForTextToBe(page, labelSelector, `${FSI}1${PDI} selected`);

          // Uncheck thumbnail 2: label should revert to "Select pages".
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(2)}) input`
          );
          await waitForTextToBe(page, labelSelector, "Select pages");
        })
      );
    });

    it("should deselect all thumbnails when the deselect button is clicked", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });

          const labelSelector = "#viewsManagerStatusActionLabel";
          const deselectButtonSelector =
            "#viewsManagerStatusActionDeselectButton";

          // Check thumbnails 1 and 2.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(2)}) input`
          );
          await waitForTextToBe(page, labelSelector, `${FSI}2${PDI} selected`);

          // Click the deselect button: all thumbnails should be unchecked.
          await waitAndClick(page, deselectButtonSelector);

          // Label should revert to "Select pages".
          await waitForTextToBe(page, labelSelector, "Select pages");

          // The deselect button should be hidden again.
          await page.waitForSelector(deselectButtonSelector, { hidden: true });

          // All checkboxes should be unchecked.
          await page.waitForSelector(
            "#thumbnailsView:not(:has(input:checked))",
            {
              visible: true,
            }
          );
        })
      );
    });
  });

  describe("Undo label reflects number of cut/deleted pages (bug 2010832)", () => {
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

    it("should show the correct undo label after cutting one or two pages", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });

          const undoLabelSelector = "#viewsManagerStatusUndoLabel";

          // Cut 1 page and check the undo label.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          let handlePagesEdited = await waitForPagesEdited(page, "cut");
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCut");
          await awaitPromise(handlePagesEdited);

          await page.waitForSelector("#viewsManagerStatusUndo", {
            visible: true,
          });
          await waitForTextToBe(page, undoLabelSelector, "1 page cut");

          // Undo the cut to restore the original state.
          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, "#viewsManagerStatusUndoButton");
          await awaitPromise(handlePagesEdited);

          // Cut 2 pages and check the undo label.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(3)}) input`
          );
          handlePagesEdited = await waitForPagesEdited(page, "cut");
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCut");
          await awaitPromise(handlePagesEdited);

          await page.waitForSelector("#viewsManagerStatusUndo", {
            visible: true,
          });
          await waitForTextToBe(
            page,
            undoLabelSelector,
            `${FSI}2${PDI} pages cut`
          );
        })
      );
    });

    it("should show the correct undo label after deleting one or two pages", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });

          const undoLabelSelector = "#viewsManagerStatusUndoLabel";

          // Delete 1 page and check the undo label.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          let handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionDelete");
          await awaitPromise(handlePagesEdited);

          await page.waitForSelector("#viewsManagerStatusUndo", {
            visible: true,
          });
          await waitForTextToBe(page, undoLabelSelector, "1 page deleted");

          // Undo the deletion to restore the original state.
          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, "#viewsManagerStatusUndoButton");
          await awaitPromise(handlePagesEdited);

          // Delete 2 pages and check the undo label.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(3)}) input`
          );
          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionDelete");
          await awaitPromise(handlePagesEdited);

          await page.waitForSelector("#viewsManagerStatusUndo", {
            visible: true,
          });
          await waitForTextToBe(
            page,
            undoLabelSelector,
            `${FSI}2${PDI} pages deleted`
          );
        })
      );
    });
  });

  describe("Closing the undo bar after a cut is equivalent to a delete (bug 2010832)", () => {
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

    it("should permanently remove the cut page when the undo bar is closed", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });

          // Cut page 1.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          let handlePagesEdited = await waitForPagesEdited(page, "cut");
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCut");
          await awaitPromise(handlePagesEdited);

          await page.waitForSelector("#viewsManagerStatusUndo", {
            visible: true,
          });

          // Close the undo bar instead of undoing.
          handlePagesEdited = await waitForPagesEdited(page, "cleanSavedData");
          await waitAndClick(page, "#viewsManagerStatusUndoCloseButton");
          const pageIndices = await awaitPromise(handlePagesEdited);

          // The result must equal a plain deletion of page 1.
          const expected = [
            2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);

          await page.waitForSelector("#viewsManagerStatusUndo", {
            hidden: true,
          });

          await waitForHavingContents(page, expected);
        })
      );
    });
  });

  describe("Closing the undo bar after a delete effectively deletes the page (bug 2010832)", () => {
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

    it("should permanently remove the deleted page when the undo bar is closed", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });

          // Delete page 1.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          let handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionDelete");
          await awaitPromise(handlePagesEdited);

          await page.waitForSelector("#viewsManagerStatusUndo", {
            visible: true,
          });

          // Close the undo bar instead of undoing.
          handlePagesEdited = await waitForPagesEdited(page, "cleanSavedData");
          await waitAndClick(page, "#viewsManagerStatusUndoCloseButton");
          const pageIndices = await awaitPromise(handlePagesEdited);

          // The page must be effectively deleted.
          const expected = [
            2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);

          await page.waitForSelector("#viewsManagerStatusUndo", {
            hidden: true,
          });

          await waitForHavingContents(page, expected);
        })
      );
    });
  });

  describe("Clicking Done after copying removes paste buttons (bug 2010832)", () => {
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

    it("should show a Done button after copy and remove paste buttons when clicked", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });

          // Copy page 1.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          const handlePagesEdited = await waitForPagesEdited(page, "copy");
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCopy");
          await awaitPromise(handlePagesEdited);

          // The undo bar must appear with a "Done" label (not "Undo").
          await page.waitForSelector("#viewsManagerStatusUndo", {
            visible: true,
          });
          await waitForTextToBe(
            page,
            "#viewsManagerStatusUndoLabel",
            "1 page copied"
          );
          await waitForTextToBe(
            page,
            "#viewsManagerStatusUndoButton span[data-l10n-id]",
            "Done"
          );

          // The close button must be hidden for copy.
          const closeHidden = await page.$eval(
            "#viewsManagerStatusUndoCloseButton",
            el => el.classList.contains("hidden")
          );
          expect(closeHidden).withContext(`In ${browserName}`).toBeTrue();

          // Paste buttons must be present.
          await page.waitForSelector("button.thumbnailPasteButton");

          // Click Done and wait for the cancelCopy pagesedited event.
          const handleCancelCopy = await waitForPagesEdited(page, "cancelCopy");
          await waitAndClick(page, "#viewsManagerStatusUndoButton");
          await awaitPromise(handleCancelCopy);

          // Undo bar must be hidden and paste buttons must be gone.
          await page.waitForSelector("#viewsManagerStatusUndo", {
            hidden: true,
          });
          await page.waitForSelector("button.thumbnailPasteButton", {
            hidden: true,
          });
          await page.waitForFunction(
            () => !document.querySelector("button.thumbnailPasteButton")
          );
        })
      );
    });
  });

  describe("Extract some pages from a pdf", () => {
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

    it("should check that the pages are correctly extracted", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(3)}) input`
          );

          const handleExport = await createPromise(page, resolve => {
            window.PDFViewerApplication.eventBus.on(
              "saveextractedpages",
              ({ data }) => {
                resolve(data);
              },
              {
                once: true,
              }
            );
          });

          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionExport");
          const pagesData = await awaitPromise(handleExport);
          expect(pagesData)
            .withContext(`In ${browserName}`)
            .toEqual([
              { document: null, pageIndices: [0, 1], includePages: [0, 2] },
            ]);
        })
      );
    });
  });

  describe("Dragging mustn't be possible when pasting (bug 2021934)", () => {
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

    it("should check that dragging is disabled when pasting", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);

          await Promise.all([
            page.waitForSelector(`#thumbnailsView.isDragging`, {
              visible: true,
            }),
            dragAndDrop(page, getThumbnailSelector(1), [[0, 10]], 10),
          ]);

          await page.waitForSelector(`#thumbnailsView.isDragging`, {
            hidden: true,
          });
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCopy");

          // If dragging isn't disabled, the promise will resolve with the
          // selector. Otherwise, it will resolve with undefined (dragAndDrop
          // has no return), which is the expected behavior.
          const abortController = new AbortController();
          const first = await Promise.race([
            page.waitForSelector(`#thumbnailsView.isDragging`, {
              visible: true,
              signal: abortController.signal,
            }),
            dragAndDrop(page, getThumbnailSelector(1), [[0, 10]], 10),
          ]);
          abortController.abort();

          expect(first)
            .withContext(
              `In ${browserName}, dragging should be disabled when pasting`
            )
            .toBeUndefined();

          // Wait a tick to ensure that the controller.abort() has taken effect
          // before leaving.
          await waitForBrowserTrip(page);
        })
      );
    });
  });

  describe("Copy, paste and delete pages with keyboard shortcuts", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "page_with_number.pdf",
        "#viewsManagerToggleButton",
        "page-width",
        null,
        { enableSplitMerge: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should copy, paste and delete pages correctly", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);

          // Check thumbnail 1 and copy it with Ctrl+C.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          let handlePagesEdited = await waitForPagesEdited(page, "copy");
          await kbCopy(page);
          let pageIndices = await awaitPromise(handlePagesEdited);
          let expected = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);

          // Paste after page 3.
          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, `${getThumbnailSelector(3)}+button`);
          pageIndices = await awaitPromise(handlePagesEdited);
          expected = [
            1, 2, 3, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);

          // Check thumbnail 1 and delete it.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          handlePagesEdited = await waitForPagesEdited(page);
          await kbDelete(page);

          pageIndices = await awaitPromise(handlePagesEdited);
          expected = [
            2, 3, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);

          // Check thumbnail 4 and copy it with Ctrl+C.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(3)}) input`
          );
          handlePagesEdited = await waitForPagesEdited(page, "copy");
          await kbCopy(page);
          pageIndices = await awaitPromise(handlePagesEdited);
          expected = [
            2, 3, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);

          // Paste before page 1.
          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(
            page,
            `button.thumbnailPasteButton:has(+ ${getThumbnailSelector(1)})`
          );
          pageIndices = await awaitPromise(handlePagesEdited);
          expected = [
            1, 2, 3, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);

          // Check thumbnail 5 and delete it.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(4)}) input`
          );
          handlePagesEdited = await waitForPagesEdited(page);
          await kbDelete(page);
          pageIndices = await awaitPromise(handlePagesEdited);
          expected = [
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);
        })
      );
    });
  });

  describe("Context menu triggers editingstateschanged event (bug 2021828)", () => {
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

    function getContextMenuPromise(page) {
      return createPromise(page, resolve => {
        window.addEventListener(
          "contextmenu",
          e => {
            e.preventDefault();
            resolve();
          },
          { once: true }
        );
      });
    }

    it("should dispatch editingstateschanged with correct payload on right-click with no selection", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);

          const handleEditingStatesChanged = await createPromise(
            page,
            resolve => {
              window.PDFViewerApplication.eventBus.on(
                "editingstateschanged",
                ({ details }) => resolve(details),
                { once: true }
              );
            }
          );

          const contextMenuPromise = await getContextMenuPromise(page);
          await page.click(getThumbnailSelector(1), { button: "right" });
          await awaitPromise(contextMenuPromise);

          const details = await awaitPromise(handleEditingStatesChanged);
          expect(details.thumbnailId).withContext(`In ${browserName}`).toBe(1);
          expect(details.hasSelectedPages)
            .withContext(`In ${browserName}`)
            .toBeFalse();
          expect(details.canDeletePages)
            .withContext(`In ${browserName}`)
            .toBeFalse();
        })
      );
    });

    it("should dispatch editingstateschanged with correct payload on right-click with some pages selected", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );

          const handleEditingStatesChanged = await createPromise(
            page,
            resolve => {
              window.PDFViewerApplication.eventBus.on(
                "editingstateschanged",
                ({ details }) => resolve(details),
                { once: true }
              );
            }
          );

          const contextMenuPromise = await getContextMenuPromise(page);
          await page.click(getThumbnailSelector(1), { button: "right" });
          await awaitPromise(contextMenuPromise);

          const details = await awaitPromise(handleEditingStatesChanged);
          expect(details.thumbnailId).withContext(`In ${browserName}`).toBe(1);
          expect(details.hasSelectedPages)
            .withContext(`In ${browserName}`)
            .toBeTrue();
          expect(details.canDeletePages)
            .withContext(`In ${browserName}`)
            .toBeTrue();
        })
      );
    });

    it("should dispatch editingstateschanged with canDeletePages false when all pages are selected", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);

          // Select all 17 pages.
          const totalPages = await page.evaluate(
            () =>
              document.querySelectorAll("#thumbnailsView .thumbnail input")
                .length
          );
          for (let i = 1; i <= totalPages; i++) {
            await waitAndClick(
              page,
              `.thumbnail:has(${getThumbnailSelector(i)}) input`
            );
          }

          const handleEditingStatesChanged = await createPromise(
            page,
            resolve => {
              window.PDFViewerApplication.eventBus.on(
                "editingstateschanged",
                ({ details }) => resolve(details),
                { once: true }
              );
            }
          );

          const contextMenuPromise = await getContextMenuPromise(page);
          await page.click(getThumbnailSelector(1), { button: "right" });
          await awaitPromise(contextMenuPromise);

          const details = await awaitPromise(handleEditingStatesChanged);
          expect(details.thumbnailId).withContext(`In ${browserName}`).toBe(1);
          expect(details.hasSelectedPages)
            .withContext(`In ${browserName}`)
            .toBeTrue();
          expect(details.canDeletePages)
            .withContext(`In ${browserName}`)
            .toBeFalse();
        })
      );
    });
  });

  describe("Dismissing undo after copy, paste and delete doesn't destroy the visible thumbnail", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "two_pages.pdf",
        "#viewsManagerToggleButton",
        "page-fit",
        null,
        { enableSplitMerge: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should keep the pasted thumbnail visible after dismissing the undo bar", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });

          // Wait for both thumbnails to be fully rendered.
          for (let i = 1; i <= 2; i++) {
            await page.waitForSelector(
              `${getThumbnailSelector(i)} > img[src^="blob:http:"]`,
              { visible: true }
            );
          }

          // Copy page 1.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          let handlePagesEdited = await waitForPagesEdited(page, "copy");
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCopy");
          await awaitPromise(handlePagesEdited);

          // Paste after page 1 (the pasted copy lands at position 2).
          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, `${getThumbnailSelector(1)}+button`);
          await awaitPromise(handlePagesEdited);

          // Select the original page 1 (still at position 1) and delete it.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionDelete");
          await awaitPromise(handlePagesEdited);

          await page.waitForSelector("#viewsManagerStatusUndo", {
            visible: true,
          });

          // Dismiss the undo bar. Without the fix, this would destroy the
          // thumbnail at position 1 (the pasted copy) because both the saved
          // state and the current _thumbnails array pointed to the same object.
          handlePagesEdited = await waitForPagesEdited(page, "cleanSavedData");
          await waitAndClick(page, "#viewsManagerStatusUndoCloseButton");
          await awaitPromise(handlePagesEdited);

          // The thumbnail at position 1 (the pasted copy) must still be
          // rendered and visible with a valid image source.
          await page.waitForSelector(
            `${getThumbnailSelector(1)} > img[src^="blob:http:"]`,
            { visible: true }
          );
        })
      );
    });
  });

  describe("Undo after drag-and-drop move followed by delete restores correct page mapping", () => {
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

    it("should restore the post-move mapping when undoing a delete", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          const rect1 = await getRect(page, getThumbnailSelector(1));
          const rect2 = await getRect(page, getThumbnailSelector(2));

          // Move page 1 after page 2: mapping becomes [2, 1, 3, …, 17].
          let handlePagesEdited = await waitForPagesEdited(page);
          await dragAndDrop(
            page,
            getThumbnailSelector(1),
            [[0, rect2.y - rect1.y + rect2.height / 2]],
            10
          );
          let pageIndices = await awaitPromise(handlePagesEdited);
          let expected = [
            2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);

          // Select the new first thumbnail (originally page 2) and delete it.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionDelete");
          pageIndices = await awaitPromise(handlePagesEdited);
          expected = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);

          await page.waitForSelector("#viewsManagerStatusUndo", {
            visible: true,
          });

          // Undo the delete. Without the fix, cancelDelete() would call the
          // pagesNumber setter which triggers #reset(), wiping out the
          // just-restored pageNumberToId and idToPageNumber mappings, leaving
          // the mapper in identity state despite the prior move.
          handlePagesEdited = await waitForPagesEdited(page, "cancelDelete");
          await waitAndClick(page, "#viewsManagerStatusUndoButton");
          pageIndices = await awaitPromise(handlePagesEdited);
          expected = [
            2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
          ];
          expect(pageIndices)
            .withContext(`In ${browserName}`)
            .toEqual(expected);

          await waitForHavingContents(page, expected);
        })
      );
    });
  });

  describe("Keyboard Delete is ignored while in paste mode", () => {
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

    it("should not delete pages when pressing Delete while in paste mode", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });

          // Copy page 1 to enter paste mode.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          const handlePagesEdited = await waitForPagesEdited(page, "copy");
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCopy");
          await awaitPromise(handlePagesEdited);

          // Paste mode must be active (paste buttons visible).
          await page.waitForSelector("button.thumbnailPasteButton", {
            visible: true,
          });

          // Focus an element inside the thumbnail container so that the
          // keydown handler can fire. Checkboxes are hidden in paste mode
          // (CSS: pasteMode > .thumbnail > input { display: none }), so we
          // click the imageContainer itself instead.
          await waitAndClick(page, getThumbnailSelector(1));

          // Press Delete: must be a no-op while in paste mode.
          await kbDelete(page);
          await waitForBrowserTrip(page);

          // The page count must remain at 17.
          const pageCount = await page.$eval("#pageNumber", el => el.max);
          expect(parseInt(pageCount, 10))
            .withContext(`In ${browserName}`)
            .toBe(17);

          // Paste buttons must still be present (paste mode not disrupted).
          const pasteButtons = await page.$$("button.thumbnailPasteButton");
          expect(pasteButtons.length)
            .withContext(`In ${browserName}`)
            .toBeGreaterThan(0);
        })
      );
    });
  });

  describe("Clicking Done after two copy+paste rounds must not remove the pasted pages (bug 2023934)", () => {
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

    it("should keep all pasted pages after clicking Done without pasting", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });

          // Helper: copy page 1, click a paste button, await the paste event.
          async function copyAndPaste() {
            await waitAndClick(
              page,
              `.thumbnail:has(${getThumbnailSelector(1)}) input`
            );
            let handlePagesEdited = await waitForPagesEdited(page, "copy");
            await waitAndClick(page, "#viewsManagerStatusActionButton");
            await waitAndClick(page, "#viewsManagerStatusActionCopy");
            await awaitPromise(handlePagesEdited);

            handlePagesEdited = await waitForPagesEdited(page);
            // Click the paste button that appears after thumbnail 1.
            await waitAndClick(page, `${getThumbnailSelector(1)}+button`);
            await awaitPromise(handlePagesEdited);
          }

          // Round 1: copy page 1 and paste → 18 pages.
          await copyAndPaste();
          let pageCount = await page.$eval("#pageNumber", el => el.max);
          expect(parseInt(pageCount, 10))
            .withContext(`In ${browserName} after 1st paste`)
            .toBe(18);

          // Round 2: copy page 1 and paste → 19 pages.
          await copyAndPaste();
          pageCount = await page.$eval("#pageNumber", el => el.max);
          expect(parseInt(pageCount, 10))
            .withContext(`In ${browserName} after 2nd paste`)
            .toBe(19);

          // STR step 4: select page 1, copy (enter paste mode), then click
          // "Done" without pasting.  Without the fix, clicking Done also
          // triggers a restore of the saved pre-paste thumbnails, which removes
          // one of the pasted pages and corrupts the state.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          const handlePagesEdited = await waitForPagesEdited(page, "copy");
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCopy");
          await awaitPromise(handlePagesEdited);

          const handleCancelCopy = await waitForPagesEdited(page, "cancelCopy");
          await waitAndClick(page, "#viewsManagerStatusUndoButton");
          await awaitPromise(handleCancelCopy);

          // Page count must still be 19 – Done should not have removed a page.
          pageCount = await page.$eval("#pageNumber", el => el.max);
          expect(parseInt(pageCount, 10))
            .withContext(`In ${browserName} after Done`)
            .toBe(19);

          // STR step 5: copy page 1 and paste → must reach 20 without crash.
          await copyAndPaste();
          pageCount = await page.$eval("#pageNumber", el => el.max);
          expect(parseInt(pageCount, 10))
            .withContext(`In ${browserName} after 3rd paste`)
            .toBe(20);

          // Sidebar must still show all 20 thumbnails.
          const thumbnails = await page.$$(
            ".thumbnail .thumbnailImageContainer"
          );
          expect(thumbnails.length)
            .withContext(`In ${browserName} thumbnail count`)
            .toBe(20);
        })
      );
    });
  });

  describe("Selection counter must be cleared after drag-and-drop (bug 2022884)", () => {
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

    it("should hide the selection counter after dropping selected pages", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);

          // Select page 1 via its checkbox.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );

          // The deselect button must now be visible ("1 page selected").
          await page.waitForSelector(
            "#viewsManagerStatusActionDeselectButton:not(.hidden)",
            { visible: true }
          );

          // Capture rects after the status-bar layout has settled so the
          // drag displacement accounts for the correct positions.
          const rect1 = await getRect(page, getThumbnailSelector(1));
          const rect2 = await getRect(page, getThumbnailSelector(2));

          // Drag page 1 to after page 2 (short displacement, stays in
          // viewport).
          const handlePagesEdited = await waitForPagesEdited(page);
          await dragAndDrop(
            page,
            getThumbnailSelector(1),
            [[0, rect2.y - rect1.y + rect2.height / 2]],
            10
          );
          await awaitPromise(handlePagesEdited);

          // After the drop the selection must be cleared: the deselect button
          // must be hidden and the label must show the "no selection" state.
          // Without the fix, the "2 selected" counter persists.
          const deselectHidden = await page.$eval(
            "#viewsManagerStatusActionDeselectButton",
            el => el.classList.contains("hidden")
          );
          expect(deselectHidden)
            .withContext(`In ${browserName}: deselect button hidden`)
            .toBeTrue();

          const labelId = await page.$eval(
            "#viewsManagerStatusActionLabel",
            el => el.getAttribute("data-l10n-id")
          );
          expect(labelId)
            .withContext(`In ${browserName}: label l10n-id`)
            .toBe("pdfjs-views-manager-pages-status-none-action-label");
        })
      );
    });
  });

  describe("Undo bar must disappear and UI must recover after delete+undo (bug 2022824)", () => {
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

    it("should hide the undo bar and restore the action bar after undoing a delete", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });

          // Select page 1 and delete it.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          let handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionDelete");
          await awaitPromise(handlePagesEdited);

          // Undo bar must be visible with the "Undo" button.
          await page.waitForSelector("#viewsManagerStatusUndo", {
            visible: true,
          });

          // Click Undo.
          handlePagesEdited = await waitForPagesEdited(page, "cancelDelete");
          await waitAndClick(page, "#viewsManagerStatusUndoButton");
          await awaitPromise(handlePagesEdited);

          // Without the fix, the undo bar stays visible and buttons are
          // unclickable.  With the fix, the undo bar must be gone and the
          // normal action bar must be back.
          await page.waitForSelector("#viewsManagerStatusUndo", {
            hidden: true,
          });
          await page.waitForSelector("#viewsManagerStatusAction", {
            visible: true,
          });

          // The page count must be back to 17.
          const pageCount = await page.$eval("#pageNumber", el => el.max);
          expect(parseInt(pageCount, 10))
            .withContext(`In ${browserName}`)
            .toBe(17);

          // The action button must be interactable: select a page and delete
          // it again to confirm the full state is restored.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionDelete");
          await awaitPromise(handlePagesEdited);

          const pageCountAfterSecondDelete = await page.$eval(
            "#pageNumber",
            el => el.max
          );
          expect(parseInt(pageCountAfterSecondDelete, 10))
            .withContext(`In ${browserName} after second delete`)
            .toBe(16);
        })
      );
    });
  });
});
