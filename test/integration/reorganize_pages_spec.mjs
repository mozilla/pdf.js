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
  switchToEditor,
  waitAndClick,
  waitForBrowserTrip,
  waitForDOMMutation,
  waitForPointerUp,
  waitForSerialized,
  waitForStorageEntries,
  waitForTextToBe,
  waitForTooltipToBe,
} from "./test_utils.mjs";
import fs from "fs";
import path from "path";

const __dirname = import.meta.dirname;

async function createPDFDataTransfer(page, ...filenames) {
  const pdfData = filenames.map(filename => {
    const pdfPath = path.join(__dirname, "../pdfs", filename);
    return {
      data: fs.readFileSync(pdfPath).toString("base64"),
      filename,
    };
  });
  return page.evaluateHandle(data => {
    const transfer = new DataTransfer();
    for (const { data: base64, filename } of data) {
      const view = Uint8Array.fromBase64(base64);
      transfer.items.add(
        new File([view], filename, { type: "application/pdf" })
      );
    }
    return transfer;
  }, pdfData);
}

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

async function drawInkLine(page, pageNumber) {
  const rect = await getRect(
    page,
    `.page[data-page-number="${pageNumber}"] .annotationEditorLayer`
  );
  const x = rect.x + rect.width * 0.3;
  const y = rect.y + rect.height * 0.3;
  const clickHandle = await waitForPointerUp(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y + 50);
  await page.mouse.up();
  await awaitPromise(clickHandle);
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
      const textLayers = document.querySelectorAll(".textLayer");
      const buffer = [];
      for (const [i, textLayer] of textLayers.entries()) {
        const text = textLayer.textContent.trim();
        buffer.push(typeof ex[i] === "string" ? text : parseInt(text, 10));
      }
      return ex.length === buffer.length && ex.every((v, i) => v === buffer[i]);
    },
    {},
    expected
  );
}

async function waitForPageCanvasToHaveImage(page, pageNumber) {
  const selector = `.page[data-page-number = "${pageNumber}"] .canvasWrapper canvas`;
  await page.waitForSelector(selector, { visible: true });
  await page.waitForFunction(
    sel => {
      const canvas = document.querySelector(sel);
      if (!canvas?.width || !canvas.height) {
        return false;
      }
      const { data } = canvas
        .getContext("2d", { willReadFrequently: true })
        .getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0, ii = data.length; i < ii; i += 4) {
        if (
          data[i + 3] !== 0 &&
          (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255)
        ) {
          return true;
        }
      }
      return false;
    },
    {},
    selector
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
        `.page[data-page-number = "1"] .endOfContent`,
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
          pending("Fails consistently (issue #20814).");

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
        `.page[data-page-number = "1"] .endOfContent`,
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

    it("should check that find navigation is not blocked after moving pages (bug 2023150)", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitAndClick(page, "#viewFindButton");
          await page.waitForSelector("#findInput", { visible: true });
          await page.type("#findInput", "1");
          await page.keyboard.press("Enter");

          // Wait for the first result to be selected and the search to settle.
          await page.waitForSelector("#findInput[data-status='']");
          await waitForTextToBe(
            page,
            "#findResultsCount",
            `${FSI}1${PDI} of ${FSI}10${PDI} matches`
          );

          // Navigate to the next match.
          await page.keyboard.press("Enter");
          await page.waitForSelector("#findInput[data-status='']");
          await waitForTextToBe(
            page,
            "#findResultsCount",
            `${FSI}2${PDI} of ${FSI}10${PDI} matches`
          );

          // Move a page: this previously blocked subsequent find navigation.
          await movePages(page, [3], 0);

          // Wait for the search to re-run after the page move.
          await page.waitForSelector("#findInput[data-status='']");

          // Navigate to the next match — must not be blocked.
          await page.keyboard.press("Enter");
          await page.waitForSelector("#findInput[data-status='']");
          await waitForTextToBe(
            page,
            "#findResultsCount",
            `${FSI}3${PDI} of ${FSI}10${PDI} matches`
          );
        })
      );
    });

    it("should check if the search is working after copy and paste (bug 2023150)", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });

          await waitAndClick(page, "#viewFindButton");
          await waitAndClick(page, ":has(> #findHighlightAll)");

          await page.waitForSelector("#findInput", { visible: true });
          await page.type("#findInput", "1");
          await page.keyboard.press("Enter");

          await page.waitForFunction(
            () => document.querySelectorAll("span.highlight").length === 10
          );

          // Select page 1 and copy it.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          let handlePagesEdited = await waitForPagesEdited(page, "copy");
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCopy");
          await awaitPromise(handlePagesEdited);

          // Paste after page 3.
          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, `${getThumbnailSelector(3)}+button`);
          await awaitPromise(handlePagesEdited);

          await page.waitForFunction(
            () => document.querySelectorAll("span.highlight").length === 11
          );

          const results = await getSearchResults(page);
          expect(results)
            .withContext(`In ${browserName}`)
            .toEqual([
              // Page number, [matches]; copy of page 1 inserted at position 4
              [1, ["1"]],
              [4, ["1"]],
              [11, ["1"]],
              [12, ["1", "1"]],
              [13, ["1"]],
              [14, ["1"]],
              [15, ["1"]],
              [16, ["1"]],
              [17, ["1"]],
              [18, ["1"]],
            ]);
        })
      );
    });

    it("should check if the search is working after deleting pages (bug 2023150)", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });

          await waitAndClick(page, "#viewFindButton");
          await waitAndClick(page, ":has(> #findHighlightAll)");

          await page.waitForSelector("#findInput", { visible: true });
          await page.type("#findInput", "1");
          await page.keyboard.press("Enter");

          await page.waitForFunction(
            () => document.querySelectorAll("span.highlight").length === 10
          );

          // Select page 1 and delete it.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          const handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionDelete");
          await awaitPromise(handlePagesEdited);

          await page.waitForFunction(
            () => document.querySelectorAll("span.highlight").length === 9
          );

          const results = await getSearchResults(page);
          expect(results)
            .withContext(`In ${browserName}`)
            .toEqual([
              // Page number, [matches]; page 1 removed, all positions shifted
              [9, ["1"]],
              [10, ["1", "1"]],
              [11, ["1"]],
              [12, ["1"]],
              [13, ["1"]],
              [14, ["1"]],
              [15, ["1"]],
              [16, ["1"]],
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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

    it("should focus the newly pasted page after copy and paste (bug 2022516)", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });

          // Select page 1 and copy it.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          let handlePagesEdited = await waitForPagesEdited(page, "copy");
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCopy");
          await awaitPromise(handlePagesEdited);

          // Paste after page 3: the pasted page lands at position 4.
          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, `${getThumbnailSelector(3)}+button`);
          await awaitPromise(handlePagesEdited);

          // Focus must be on the newly pasted page (position 4), not page 1.
          await page.waitForSelector(`${getThumbnailSelector(4)}:focus`, {
            visible: true,
          });
        })
      );
    });

    it("should focus the newly pasted page after cut and paste (bug 2022516)", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });

          // Select page 3 and cut it.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(3)}) input`
          );
          let handlePagesEdited = await waitForPagesEdited(page, "cut");
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCut");
          await awaitPromise(handlePagesEdited);

          // Paste after page 1: the pasted page lands at position 2.
          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, `${getThumbnailSelector(1)}+button`);
          await awaitPromise(handlePagesEdited);

          // Focus must be on the newly pasted page (position 2), not page 1.
          await page.waitForSelector(`${getThumbnailSelector(2)}:focus`, {
            visible: true,
          });
        })
      );
    });
  });

  describe("Status label reflects number of checked thumbnails (bug 2010832)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "page_with_number.pdf",
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
          const labelSelector = "#viewsManagerStatusActionLabel";
          await waitForTextToBe(page, labelSelector, "Select pages");

          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(3)}) input`
          );

          await waitForTextToBe(page, labelSelector, `${FSI}2${PDI} selected`);

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

          await waitForTextToBe(page, labelSelector, "Select pages");
          // All checkboxes should be unchecked.
          await page.waitForSelector(
            "#thumbnailsView:not(:has(input:checked))",
            { visible: true }
          );
        })
      );
    });
  });

  describe("Dragging mustn't be possible when pasting (bug 2021934)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "page_with_number.pdf",
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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
        `.page[data-page-number = "1"] .endOfContent`,
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

  describe("Copy page with an ink annotation and paste it", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "page_with_number.pdf",
        ".annotationEditorLayer",
        "50",
        null,
        { enableSplitMerge: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should check that the pasted page has an ink annotation in the DOM", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // Enable ink editor mode and draw a line on page 1.
          await switchToEditor("Ink", page);
          await drawInkLine(page, 1);

          // Commit the drawing and wait for it to be serialized.
          await page.keyboard.press("Escape");
          await waitForSerialized(page, 1);

          await waitForThumbnailVisible(page, 1);

          // Select page 1 and copy it.
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          let handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCopy");
          await awaitPromise(handlePagesEdited);

          // Paste after page 2 so the copy lands at position 3.
          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, `${getThumbnailSelector(2)}+button`);
          await awaitPromise(handlePagesEdited);

          // Both the original and the cloned annotation must now be in storage.
          await waitForStorageEntries(page, 2);

          // Close the reorganize view and navigate to page 3 (the pasted copy)
          // to trigger rendering of its annotation editor layer.
          await page.click("#viewsManagerToggleButton");
          await page.waitForSelector("#viewsManager", { hidden: true });
          await page.evaluate(() => {
            window.PDFViewerApplication.pdfViewer.currentPageNumber = 3;
          });

          // The cloned ink annotation must appear in the DOM of page 3.
          await page.waitForSelector(`.page[data-page-number="3"] .inkEditor`, {
            visible: true,
          });
          const inkEditors = await page.$$(
            `.page[data-page-number="3"] .inkEditor`
          );
          expect(inkEditors.length).withContext(`In ${browserName}`).toBe(1);
        })
      );
    });
  });

  describe("Delete last page while editing", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "page_with_number.pdf",
        ".annotationEditorLayer",
        "50",
        null,
        { enableSplitMerge: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should keep editor layers active on unchanged pages", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await (await page.$(".thumbnail[page-number='17']")).scrollIntoView();
          await page.waitForSelector(getThumbnailSelector(17), {
            visible: true,
          });
          await waitAndClick(page, getThumbnailSelector(17));
          await page.waitForSelector(
            `${getThumbnailSelector(17)}[aria-current="page"]`
          );

          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(17)}) input`
          );
          const handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionDelete");
          await awaitPromise(handlePagesEdited);

          await page.click("#viewsManagerToggleButton");
          await page.waitForSelector("#viewsManager", { hidden: true });
          await page.evaluate(() => {
            window.PDFViewerApplication.pdfViewer.currentPageNumber = 1;
          });

          await switchToEditor("Ink", page);
          await page.waitForSelector(
            `.page[data-page-number="1"] .annotationEditorLayer.inkEditing`
          );
          await drawInkLine(page, 1);

          await page.keyboard.press("Escape");
          await waitForSerialized(page, 1);
          const inkEditors = await page.$$(
            `.page[data-page-number="1"] .inkEditor`
          );
          expect(inkEditors.length).withContext(`In ${browserName}`).toBe(1);
        })
      );
    });
  });

  describe("New badge (bug 2026564)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "page_with_number.pdf",
        `.page[data-page-number = "1"] .endOfContent`,
        "page-fit",
        null,
        { enableSplitMerge: true, enableNewBadge: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should hide the new badge when a page is selected and show it again when deselected", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);

          // The badge must be visible initially.
          await page.waitForSelector(".newBadge", { visible: true });

          // Select page 1 via its checkbox.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );

          // The badge must be hidden after selection.
          await page.waitForSelector(".newBadge", { hidden: true });

          // Deselect page 1.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );

          // The badge must be visible again after deselection.
          await page.waitForSelector(".newBadge", { visible: true });
        })
      );
    });

    it("should hide the new badge when dragging an unselected page and restore it after", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);

          // The badge must be visible initially.
          await page.waitForSelector(".newBadge", { visible: true });

          // Watch for the badge being hidden during the drag.
          const handleBadgeHidden = await createPromise(page, resolve => {
            const observer = new MutationObserver(() => {
              const badge = document.querySelector(".newBadge");
              if (badge?.classList.contains("hidden")) {
                observer.disconnect();
                resolve();
              }
            });
            observer.observe(document.querySelector(".newBadge"), {
              attributes: true,
              attributeFilter: ["class"],
            });
          });

          const rect1 = await getRect(page, getThumbnailSelector(1));
          const rect2 = await getRect(page, getThumbnailSelector(2));

          await dragAndDrop(
            page,
            getThumbnailSelector(1),
            [[0, rect2.y - rect1.y + rect2.height / 2]],
            10
          );

          // The badge must have been hidden at some point during the drag.
          await awaitPromise(handleBadgeHidden);

          // The badge must be visible again after the drag ends.
          await page.waitForSelector(".newBadge", { visible: true });
        })
      );
    });
  });

  describe("Current page indicator (bug 2026639)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "page_with_number.pdf",
        `.page[data-page-number = "1"] .endOfContent`,
        "page-fit",
        null,
        { enableSplitMerge: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should have only one current page after repeated cut/undo operations", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);
          await page.waitForSelector("#viewsManagerStatusActionButton", {
            visible: true,
          });

          const countCurrentThumbnails = () =>
            page.evaluate(
              () =>
                document.querySelectorAll(
                  '.thumbnailImageContainer[aria-current="page"]'
                ).length
            );

          // Copy page 1 and paste it after page 3.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          let handlePagesEdited = await waitForPagesEdited(page, "copy");
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionCopy");
          await awaitPromise(handlePagesEdited);

          handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, `${getThumbnailSelector(3)}+button`);
          await awaitPromise(handlePagesEdited);

          // Repeat cut/undo three times and check the current indicator each
          // time.
          for (let i = 0; i < 3; i++) {
            await waitAndClick(
              page,
              `.thumbnail:has(${getThumbnailSelector(1)}) input`
            );
            handlePagesEdited = await waitForPagesEdited(page, "cut");
            await waitAndClick(page, "#viewsManagerStatusActionButton");
            await waitAndClick(page, "#viewsManagerStatusActionCut");
            await awaitPromise(handlePagesEdited);

            expect(await countCurrentThumbnails())
              .withContext(`In ${browserName}, after cut #${i + 1}`)
              .toBe(1);

            await page.waitForSelector("#viewsManagerStatusUndo", {
              visible: true,
            });
            handlePagesEdited = await waitForPagesEdited(page, "cancelDelete");
            await waitAndClick(page, "#viewsManagerStatusUndoButton");
            await awaitPromise(handlePagesEdited);

            expect(await countCurrentThumbnails())
              .withContext(`In ${browserName}, after undo #${i + 1}`)
              .toBe(1);
          }
        })
      );
    });
  });

  describe("Merge PDF", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "three_pages_with_number.pdf",
        `.page[data-page-number = "1"] .endOfContent`,
        "1",
        null,
        { enableSplitMerge: true, enableMerge: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should merge a PDF after the current page", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);

          // Navigate to page 2 so the merged PDF is inserted after it.
          await page.evaluate(() => {
            window.PDFViewerApplication.page = 2;
          });
          await page.waitForFunction(
            () => window.PDFViewerApplication.page === 2
          );
          await waitAndClick(page, getThumbnailSelector(2));

          const handleMerged = await createPromise(page, resolve => {
            window.PDFViewerApplication.eventBus.on(
              "thumbnailsloaded",
              resolve,
              { once: true }
            );
          });

          const picker = await page.$("#viewsManagerAddFilePicker");
          await picker.uploadFile(
            path.join(__dirname, "../pdfs/three_pages_with_number.pdf")
          );
          await awaitPromise(handleMerged);

          // Original 3 pages + 3 merged pages = 6 pages total.
          await page.waitForFunction(
            () => parseInt(document.getElementById("pageNumber").max, 10) === 6
          );

          // Focus must move to the first newly inserted page (page 3, since
          // we merged after page 2).
          await page.waitForFunction(
            () => window.PDFViewerApplication.page === 3
          );

          // Pages 1–2 come from the original document, then all 3 pages of
          // the merged PDF, then pages 4–6 of the original shifted to the end.
          await waitForHavingContents(page, [1, 2, 1, 2, 3, 3]);

          await waitForTextToBe(
            page,
            "#viewsManagerStatusActionLabel",
            `${FSI}3${PDI} selected`
          );
        })
      );
    });

    it("should merge a PDF after the current page when first page was deleted (bug 2034804)", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);

          // Select page 1 and delete it.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          const handlePagesEdited = await waitForPagesEdited(page);
          await waitAndClick(page, "#viewsManagerStatusActionButton");
          await waitAndClick(page, "#viewsManagerStatusActionDelete");
          await awaitPromise(handlePagesEdited);

          // After deletion page 1 is the former page 2; navigate to it.
          await page.waitForFunction(
            () => window.PDFViewerApplication.page === 1
          );
          await waitAndClick(page, getThumbnailSelector(1));

          const handleMerged = await createPromise(page, resolve => {
            window.PDFViewerApplication.eventBus.on(
              "thumbnailsloaded",
              resolve,
              { once: true }
            );
          });

          const picker = await page.$("#viewsManagerAddFilePicker");
          await picker.uploadFile(
            path.join(__dirname, "../pdfs/three_pages_with_number.pdf")
          );
          await awaitPromise(handleMerged);

          // 2 remaining original + 3 merged = 5 pages.
          await page.waitForFunction(
            () => parseInt(document.getElementById("pageNumber").max, 10) === 5
          );

          // Former page 2, the 3 merged pages, then former page 3.
          await waitForHavingContents(page, [2, 1, 2, 3, 3]);

          await waitForTextToBe(
            page,
            "#viewsManagerStatusActionLabel",
            `${FSI}3${PDI} selected`
          );
        })
      );
    });

    it("must mark document as needing save after merge (bug 2034461)", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);

          const handleMerged = await createPromise(page, resolve => {
            window.PDFViewerApplication.eventBus.on(
              "thumbnailsloaded",
              resolve,
              { once: true }
            );
          });

          const picker = await page.$("#viewsManagerAddFilePicker");
          await picker.uploadFile(
            path.join(__dirname, "../pdfs/three_pages_with_number.pdf")
          );
          await awaitPromise(handleMerged);

          const hasChanges = await page.evaluate(() =>
            window.PDFViewerApplication._hasChanges()
          );
          expect(hasChanges).withContext(`In ${browserName}`).toBeTrue();
        })
      );
    });

    it("should show only merged pages as selected when a page was pre-selected (bug 2034111)", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);

          const labelSelector = "#viewsManagerStatusActionLabel";

          // Select page 1 before merging.
          await waitAndClick(
            page,
            `.thumbnail:has(${getThumbnailSelector(1)}) input`
          );
          await waitForTextToBe(page, labelSelector, `${FSI}1${PDI} selected`);

          const handleMerged = await createPromise(page, resolve => {
            window.PDFViewerApplication.eventBus.on(
              "thumbnailsloaded",
              resolve,
              { once: true }
            );
          });

          const picker = await page.$("#viewsManagerAddFilePicker");
          await picker.uploadFile(
            path.join(__dirname, "../pdfs/three_pages_with_number.pdf")
          );
          await awaitPromise(handleMerged);

          // Original 3 pages + 3 merged pages = 6 pages total.
          await page.waitForFunction(
            () => parseInt(document.getElementById("pageNumber").max, 10) === 6
          );

          // Label must show exactly the 3 newly inserted pages — the
          // pre-merge selection of page 1 must have been cleared.
          await waitForTextToBe(page, labelSelector, `${FSI}3${PDI} selected`);

          // Focus must move to the first newly inserted page (page 2).
          await page.waitForFunction(
            () => window.PDFViewerApplication.page === 2
          );
        })
      );
    });

    it("should merge several PDFs selected at once", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);

          // Navigate to page 2 so the merged PDFs are inserted after it.
          await page.evaluate(() => {
            window.PDFViewerApplication.page = 2;
          });
          await page.waitForFunction(
            () => window.PDFViewerApplication.page === 2
          );
          await waitAndClick(page, getThumbnailSelector(2));

          const handleMerged = await createPromise(page, resolve => {
            window.PDFViewerApplication.eventBus.on(
              "thumbnailsloaded",
              resolve,
              { once: true }
            );
          });

          const picker = await page.$("#viewsManagerAddFilePicker");
          const pdfPath = path.join(
            __dirname,
            "../pdfs/three_pages_with_number.pdf"
          );
          // Upload two PDFs in a single picker selection.
          await picker.uploadFile(pdfPath, pdfPath);
          await awaitPromise(handleMerged);

          // Original 3 pages + 2 * 3 merged pages = 9 pages total.
          await page.waitForFunction(
            () => parseInt(document.getElementById("pageNumber").max, 10) === 9
          );

          // Focus must move to the first newly inserted page (page 3, since
          // we merged after page 2).
          await page.waitForFunction(
            () => window.PDFViewerApplication.page === 3
          );

          // Pages 1–2 of the original, then both merged copies (in selection
          // order), then page 3 of the original shifted to the end.
          await waitForHavingContents(page, [1, 2, 1, 2, 3, 1, 2, 3, 3]);

          // All 6 newly inserted pages must be selected.
          await waitForTextToBe(
            page,
            "#viewsManagerStatusActionLabel",
            `${FSI}6${PDI} selected`
          );
        })
      );
    });

    it("should merge a corrupt PDF (with invalid pages /Count) after the current page", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);

          // Navigate to page 2 so the merged PDF is inserted after it.
          await page.evaluate(() => {
            window.PDFViewerApplication.page = 2;
          });
          await page.waitForFunction(
            () => window.PDFViewerApplication.page === 2
          );
          await waitAndClick(page, getThumbnailSelector(2));

          const handleMerged = await createPromise(page, resolve => {
            window.PDFViewerApplication.eventBus.on(
              "thumbnailsloaded",
              resolve,
              { once: true }
            );
          });

          const picker = await page.$("#viewsManagerAddFilePicker");
          await picker.uploadFile(
            path.join(__dirname, "../pdfs/poppler-91414-0-53.pdf")
          );
          await awaitPromise(handleMerged);

          // Original 3 pages + 1 merged page = 4 pages total.
          await page.waitForFunction(
            () => parseInt(document.getElementById("pageNumber").max, 10) === 4
          );

          // Focus must move to the first newly inserted page (page 3, since
          // we merged after page 2).
          await page.waitForFunction(
            () => window.PDFViewerApplication.page === 3
          );

          // Pages 1–2 come from the original document, then the page of
          // the merged PDF, then page 3 of the original shifted to the end.
          await waitForHavingContents(page, [1, 2, "foobar", 3]);

          await waitForTextToBe(
            page,
            "#viewsManagerStatusActionLabel",
            `${FSI}1${PDI} selected`
          );
        })
      );
    });
  });

  describe("Drag-and-drop PDF merge", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "three_pages_with_number.pdf",
        '.page[data-page-number = "1"] .endOfContent',
        "1",
        null,
        { enableSplitMerge: true, enableMerge: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should show the marker and merge before the first thumbnail", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, [1, 2, 3]);

          const dataTransfer = await createPDFDataTransfer(
            page,
            "three_pages_with_number.pdf"
          );
          const markerInfo = await page.evaluate(
            (transfer, selector) => {
              const container = document.getElementById("thumbnailsView");
              const target = document.querySelector(selector);
              const { left, top, width, height } =
                target.getBoundingClientRect();
              const clientX = left + width / 4;
              const clientY = top + height / 4;
              const dispatchDragEvent = type => {
                target.dispatchEvent(
                  new DragEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    clientX,
                    clientY,
                    dataTransfer: transfer,
                  })
                );
              };

              dispatchDragEvent("dragenter");
              dispatchDragEvent("dragover");

              const marker = container.querySelector(":scope > .dragMarker");
              const { width: markerWidth = 0, height: markerHeight = 0 } =
                marker?.getBoundingClientRect() ?? {};
              const translate = marker?.style.translate ?? "";
              const filesLength = transfer.files.length;

              dispatchDragEvent("dragleave");
              const survivedDragLeave = !!container.querySelector(
                ":scope > .dragMarker"
              );

              return {
                markerHeight,
                markerWidth,
                filesLength,
                survivedDragLeave,
                translate,
              };
            },
            dataTransfer,
            getThumbnailSelector(1)
          );

          expect(markerInfo.markerWidth + markerInfo.markerHeight)
            .withContext(`In ${browserName}, marker dimensions`)
            .toBeGreaterThan(0);
          expect(markerInfo.filesLength)
            .withContext(`In ${browserName}, dropped files`)
            .toBe(1);
          expect(markerInfo.translate.includes("NaN"))
            .withContext(`In ${browserName}, marker position`)
            .toBeFalse();
          expect(markerInfo.survivedDragLeave)
            .withContext(`In ${browserName}, marker after child dragleave`)
            .toBeTrue();

          const handleMerged = await createPromise(page, resolve => {
            const listener = ({ pagesCount }) => {
              if (pagesCount !== 6) {
                return;
              }
              window.PDFViewerApplication.eventBus.off("pagesloaded", listener);
              resolve();
            };
            window.PDFViewerApplication.eventBus.on("pagesloaded", listener);
          });
          await page.evaluate(
            (transfer, selector) => {
              const target = document.querySelector(selector);
              const { left, top, width, height } =
                target.getBoundingClientRect();
              target.dispatchEvent(
                new DragEvent("drop", {
                  bubbles: true,
                  cancelable: true,
                  clientX: left + width / 4,
                  clientY: top + height / 4,
                  dataTransfer: transfer,
                })
              );
            },
            dataTransfer,
            getThumbnailSelector(1)
          );
          await awaitPromise(handleMerged);

          await page.waitForFunction(
            () => parseInt(document.getElementById("pageNumber").max, 10) === 6
          );
          await page.waitForFunction(
            () => window.PDFViewerApplication.page === 1
          );
          await waitForHavingContents(page, [1, 2, 3, 1, 2, 3]);
          await waitForTextToBe(
            page,
            "#viewsManagerStatusActionLabel",
            `${FSI}3${PDI} selected`
          );
        })
      );
    });

    it("should merge several dropped PDFs at once", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, [1, 2, 3]);

          const dataTransfer = await createPDFDataTransfer(
            page,
            "three_pages_with_number.pdf",
            "three_pages_with_number.pdf"
          );

          const handleMerged = await createPromise(page, resolve => {
            window.PDFViewerApplication.eventBus.on(
              "thumbnailsloaded",
              resolve,
              { once: true }
            );
          });
          const filesLength = await page.evaluate(
            (transfer, selector) => {
              const target = document.querySelector(selector);
              const { left, top, width, height } =
                target.getBoundingClientRect();
              const clientX = left + width / 4;
              const clientY = top + (3 * height) / 4;
              for (const type of ["dragenter", "dragover", "drop"]) {
                target.dispatchEvent(
                  new DragEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    clientX,
                    clientY,
                    dataTransfer: transfer,
                  })
                );
              }
              return transfer.files.length;
            },
            dataTransfer,
            getThumbnailSelector(2)
          );
          expect(filesLength).withContext(`In ${browserName}`).toBe(2);
          await awaitPromise(handleMerged);

          await page.waitForFunction(
            () => parseInt(document.getElementById("pageNumber").max, 10) === 9
          );
          await page.waitForFunction(
            () => window.PDFViewerApplication.page === 3
          );
          await waitForHavingContents(page, [1, 2, 1, 2, 3, 1, 2, 3, 3]);
          await waitForTextToBe(
            page,
            "#viewsManagerStatusActionLabel",
            `${FSI}6${PDI} selected`
          );
        })
      );
    });
  });

  describe("Add image as page", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "three_pages_with_number.pdf",
        '.page[data-page-number = "1"] .endOfContent',
        "1",
        null,
        { enableSplitMerge: true, enableMerge: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should insert an image as a new page after the current page", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);

          // Navigate to page 2 so the image is inserted after it.
          await page.evaluate(() => {
            window.PDFViewerApplication.page = 2;
          });
          await page.waitForFunction(
            () => window.PDFViewerApplication.page === 2
          );
          await waitAndClick(page, getThumbnailSelector(2));

          const handleMerged = await createPromise(page, resolve => {
            window.PDFViewerApplication.eventBus.on(
              "thumbnailsloaded",
              resolve,
              { once: true }
            );
          });

          const picker = await page.$("#viewsManagerAddFilePicker");
          await picker.uploadFile(
            path.join(__dirname, "../images/firefox_logo.png")
          );
          await awaitPromise(handleMerged);

          // 3 original pages + 1 inserted image page = 4 pages total.
          await page.waitForFunction(
            () => parseInt(document.getElementById("pageNumber").max, 10) === 4
          );

          // Focus must move to the newly inserted page (page 3, since the
          // image was inserted after page 2).
          await page.waitForFunction(
            () => window.PDFViewerApplication.page === 3
          );
          await waitForPageCanvasToHaveImage(page, 3);

          // The original text pages must keep their content: pages 1–2 from
          // the original, then the image page (no text), then page 3 of the
          // original shifted to position 4. The viewer only renders pages that
          // are visible, so force all pages into the viewport (WRAPPED scroll
          // mode + minimum scale) to ensure their text layers render before we
          // inspect them; otherwise a page outside the viewport (e.g. page 2
          // when the current page is 3) may not have rendered yet.
          const expectedTexts = ["1", "2", "", "3"];
          await page.evaluate(() => {
            window.PDFViewerApplication.pdfViewer.scrollMode = 2; /* = ScrollMode.WRAPPED = */
            window.PDFViewerApplication.pdfViewer.updateScale({
              drawingDelay: 0,
              scaleFactor: 0.01,
            });
          });
          await page.waitForFunction(
            expected => {
              const layers = document.querySelectorAll(".page .textLayer");
              if (layers.length !== expected.length) {
                return false;
              }
              return Array.from(layers).every((tl, i) => {
                const _page = tl.closest(".page");
                return (
                  _page?.getAttribute("data-page-number") === String(i + 1) &&
                  tl.textContent.trim() === expected[i]
                );
              });
            },
            {},
            expectedTexts
          );

          const hasChanges = await page.evaluate(() =>
            window.PDFViewerApplication._hasChanges()
          );
          expect(hasChanges).withContext(`In ${browserName}`).toBeTrue();
        })
      );
    });

    it("should insert an SVG image as a new page", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForThumbnailVisible(page, 1);

          const handleMerged = await createPromise(page, resolve => {
            window.PDFViewerApplication.eventBus.on(
              "thumbnailsloaded",
              resolve,
              { once: true }
            );
          });

          const picker = await page.$("#viewsManagerAddFilePicker");
          await picker.uploadFile(
            path.join(__dirname, "../images/firefox_logo.svg")
          );
          await awaitPromise(handleMerged);

          // The SVG must be rasterized and inserted as a new page, bringing
          // the document to 4 pages.
          await page.waitForFunction(
            () => parseInt(document.getElementById("pageNumber").max, 10) === 4
          );
          await waitForPageCanvasToHaveImage(page, 2);

          const hasChanges = await page.evaluate(() =>
            window.PDFViewerApplication._hasChanges()
          );
          expect(hasChanges).withContext(`In ${browserName}`).toBeTrue();
        })
      );
    });
  });
});
