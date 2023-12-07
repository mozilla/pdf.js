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
  awaitPromise,
  closePages,
  createPromise,
  getEditorSelector,
  getSelectedEditors,
  kbRedo,
  kbSelectAll,
  kbUndo,
  loadAndWait,
  scrollIntoView,
  waitForStorageEntries,
} from "./test_utils.mjs";

const waitForPointerUp = page =>
  createPromise(page, resolve => {
    window.addEventListener("pointerup", resolve, { once: true });
  });

const selectAll = async page => {
  await kbSelectAll(page);
  await page.waitForFunction(
    () => !document.querySelector(".inkEditor.disabled:not(.selectedEditor)")
  );
};

const clearAll = async page => {
  await selectAll(page);
  await page.keyboard.press("Backspace");
  await waitForStorageEntries(page, 0);
};

const commit = async page => {
  await page.keyboard.press("Escape");
  await page.waitForSelector(".inkEditor.selectedEditor.draggable.disabled");
};

describe("Ink Editor", () => {
  describe("Basic operations", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("aboutstacks.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must draw, undo a deletion and check that the editors are not selected", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#editorInk");

          const rect = await page.$eval(".annotationEditorLayer", el => {
            // With Chrome something is wrong when serializing a DomRect,
            // hence we extract the values and just return them.
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          for (let i = 0; i < 3; i++) {
            const x = rect.x + 100 + i * 100;
            const y = rect.y + 100 + i * 100;
            const clickHandle = await waitForPointerUp(page);
            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.mouse.move(x + 50, y + 50);
            await page.mouse.up();
            await awaitPromise(clickHandle);

            await commit(page);
          }

          await clearAll(page);

          await kbUndo(page);
          await waitForStorageEntries(page, 3);

          expect(await getSelectedEditors(page))
            .withContext(`In ${browserName}`)
            .toEqual([]);
        })
      );
    });

    it("must draw, undo/redo and check that the editor don't move", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await clearAll(page);

          const rect = await page.$eval(".annotationEditorLayer", el => {
            // With Chrome something is wrong when serializing a DomRect,
            // hence we extract the values and just return them.
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          const xStart = rect.x + 300;
          const yStart = rect.y + 300;
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(xStart, yStart);
          await page.mouse.down();
          await page.mouse.move(xStart + 50, yStart + 50);
          await page.mouse.up();
          await awaitPromise(clickHandle);

          await commit(page);

          const rectBefore = await page.$eval(".inkEditor canvas", el => {
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          for (let i = 0; i < 30; i++) {
            await kbUndo(page);
            await waitForStorageEntries(page, 0);
            await kbRedo(page);
            await waitForStorageEntries(page, 1);
          }

          const rectAfter = await page.$eval(".inkEditor canvas", el => {
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          expect(Math.round(rectBefore.x))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(rectAfter.x));

          expect(Math.round(rectBefore.y))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(rectAfter.y));
        })
      );
    });
  });

  describe("with a rotated pdf", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("issue16278.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must draw something", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#editorInk");

          const rect = await page.$eval(".annotationEditorLayer", el => {
            // With Chrome something is wrong when serializing a DomRect,
            // hence we extract the values and just return them.
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          const x = rect.x + 20;
          const y = rect.y + 20;
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + 50, y + 50);
          await page.mouse.up();
          await awaitPromise(clickHandle);

          await commit(page);

          await selectAll(page);

          expect(await getSelectedEditors(page))
            .withContext(`In ${browserName}`)
            .toEqual([0]);
        })
      );
    });
  });

  describe("Invisible layers must be disabled", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the editor layer is disabled", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#editorInk");
          await page.waitForSelector(".annotationEditorLayer.inkEditing");

          const rect = await page.$eval(".annotationEditorLayer", el => {
            // With Chrome something is wrong when serializing a DomRect,
            // hence we extract the values and just return them.
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          const x = rect.x + 20;
          const y = rect.y + 20;
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + 50, y + 50);
          await page.mouse.up();
          await awaitPromise(clickHandle);

          await commit(page);

          const oneToFourteen = Array.from(new Array(13).keys(), n => n + 2);
          for (const pageNumber of oneToFourteen) {
            await scrollIntoView(
              page,
              `.page[data-page-number = "${pageNumber}"]`
            );
          }

          await page.click("#editorInk");
          await page.waitForSelector(".annotationEditorLayer:not(.inkEditing)");

          const fourteenToOne = Array.from(new Array(13).keys(), n => 13 - n);
          for (const pageNumber of fourteenToOne) {
            await scrollIntoView(
              page,
              `.page[data-page-number = "${pageNumber}"]`
            );
          }

          await page.waitForSelector(
            `.page[data-page-number = "1"] .annotationEditorLayer.disabled:not(.inkEditing)`
          );
        })
      );
    });
  });

  describe("Ink editor must be committed when blurred", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the ink editor is committed", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#editorInk");
          await page.waitForSelector(".annotationEditorLayer.inkEditing");

          const rect = await page.$eval(".annotationEditorLayer", el => {
            // With Chrome something is wrong when serializing a DomRect,
            // hence we extract the values and just return them.
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          const x = rect.x + 20;
          const y = rect.y + 20;
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + 50, y + 50);
          await page.mouse.up();
          await awaitPromise(clickHandle);

          page.mouse.click(rect.x - 10, rect.y + 10);
          await page.waitForSelector(`${getEditorSelector(0)}.disabled`);
        })
      );
    });
  });
});
