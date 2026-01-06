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
            [[0, rect2.y - rect1.y]],
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
            [[0, rect2.y - rect1.y]],
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
            [[0, rect2.y - rect1.y]],
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
  });
});
