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
  waitForDOMMutation,
  waitForTextToBe,
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
          await page.click(`.thumbnail:has(${getThumbnailSelector(1)}) input`);

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
          await page.waitForSelector(getThumbnailSelector(14), {
            visible: true,
          });
          await page.click(`.thumbnail:has(${getThumbnailSelector(14)}) input`);
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
          await page.click(getAnnotationSelector("107R"));
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

          await page.click("#viewsManagerSelectorButton");
          await page.click("#outlinesViewMenu");
          await page.waitForSelector("#outlinesView", { visible: true });

          await page.click("#outlinesView .treeItem:nth-child(2)");

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
          await page.waitForSelector("#viewsManagerSelectorButton", {
            visible: true,
          });
          await page.click("#viewsManagerSelectorButton");
          await page.waitForSelector("#thumbnailsViewMenu", { visible: true });
          await page.click("#thumbnailsViewMenu");

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

          const prevSpanText = await page.$eval(
            `button.thumbnailPasteButton:has(+ ${getThumbnailSelector(1)}) > span`,
            el => el.textContent.trim()
          );
          expect(prevSpanText)
            .withContext(`In ${browserName}`)
            .toBe("Paste before the first page");

          const afterSpanText = await page.$eval(
            `${getThumbnailSelector(1)} + button.thumbnailPasteButton > span`,
            el => el.textContent.trim()
          );
          expect(afterSpanText)
            .withContext(`In ${browserName}`)
            .toBe(`Paste after page ${FSI}1${PDI}`);
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
          const pasteButtons = await page.$$("button.thumbnailPasteButton");
          expect(pasteButtons.length).withContext(`In ${browserName}`).toBe(0);
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

          const handleSaveAs = await createPromise(page, resolve => {
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

          await page.click("#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionSaveAs");
          const pagesData = await awaitPromise(handleSaveAs);
          expect(pagesData)
            .withContext(`In ${browserName}`)
            .toEqual([
              { document: null, pageIndices: [0, 1], includePages: [0, 2] },
            ]);
        })
      );
    });
  });
});
