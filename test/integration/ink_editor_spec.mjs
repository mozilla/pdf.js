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
  clearEditors,
  closePages,
  dragAndDrop,
  getAnnotationSelector,
  getEditors,
  getEditorSelector,
  getRect,
  getSerialized,
  isCanvasWhite,
  kbRedo,
  kbUndo,
  loadAndWait,
  moveEditor,
  scrollIntoView,
  selectEditor,
  selectEditors,
  switchToEditor,
  waitForAnnotationModeChanged,
  waitForNoElement,
  waitForPointerUp,
  waitForSelectedEditor,
  waitForSerialized,
  waitForStorageEntries,
  waitForTimeout,
} from "./test_utils.mjs";

const selectAll = selectEditors.bind(null, "ink");

const clearAll = clearEditors.bind(null, "ink");

const commit = async page => {
  await page.keyboard.press("Escape");
  await page.waitForSelector(".inkEditor.selectedEditor.draggable.disabled");
};

const switchToInk = switchToEditor.bind(null, "Ink");

describe("Ink Editor", () => {
  describe("Basic operations", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("aboutstacks.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must draw, undo a deletion and check that the editors are not selected", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToInk(page);

          const rect = await getRect(page, ".annotationEditorLayer");

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

          expect(await getEditors(page, "selected"))
            .withContext(`In ${browserName}`)
            .toEqual([]);
        })
      );
    });

    it("must draw, undo/redo and check that the editor don't move", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToInk(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const xStart = rect.x + 300;
          const yStart = rect.y + 300;
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(xStart, yStart);
          await page.mouse.down();
          await page.mouse.move(xStart + 50, yStart + 50);
          await page.mouse.up();
          await awaitPromise(clickHandle);

          await commit(page);

          const rectBefore = await getRect(page, ".canvasWrapper .draw");

          for (let i = 0; i < 30; i++) {
            await kbUndo(page);
            await waitForStorageEntries(page, 0);
            await kbRedo(page);
            await waitForStorageEntries(page, 1);
          }

          const rectAfter = await getRect(page, ".canvasWrapper .draw");

          expect(Math.round(rectBefore.x))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(rectAfter.x));

          expect(Math.round(rectBefore.y))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(rectAfter.y));
        })
      );
    });

    it("must draw and move with the keyboard", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToInk(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const x = rect.x + 100;
          const y = rect.y + 100;
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + 50, y + 50);
          await page.mouse.up();
          await awaitPromise(clickHandle);

          await commit(page);

          const editorSelector = getEditorSelector(0);
          await page.waitForSelector(editorSelector);
          const rectBefore = (await getSerialized(page, s => s.rect))[0];

          const N = 20;
          await moveEditor(page, editorSelector, N, () =>
            page.keyboard.press("ArrowDown")
          );
          const rectAfter = (await getSerialized(page, s => s.rect))[0];

          expect(Math.abs(rectBefore[0] - rectAfter[0]))
            .withContext(`In ${browserName}`)
            .toBeLessThan(1e-2);
          expect(Math.abs(rectBefore[1] - N - rectAfter[1]))
            .withContext(`In ${browserName}`)
            .toBeLessThan(1e-2);
          expect(Math.abs(rectBefore[2] - rectAfter[2]))
            .withContext(`In ${browserName}`)
            .toBeLessThan(1e-2);
          expect(Math.abs(rectBefore[3] - N - rectAfter[3]))
            .withContext(`In ${browserName}`)
            .toBeLessThan(1e-2);
        })
      );
    });
  });

  describe("with a rotated pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue16278.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must draw something", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToInk(page);

          const rect = await getRect(page, ".annotationEditorLayer");

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

          expect(await getEditors(page, "selected"))
            .withContext(`In ${browserName}`)
            .toEqual([0]);
        })
      );
    });
  });

  describe("Invisible layers must be disabled", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the editor layer is disabled", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToInk(page);

          const rect = await getRect(page, ".annotationEditorLayer");

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

          await switchToInk(page, /* disable */ true);

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

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the ink editor is committed", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToInk(page);

          const rect = await getRect(page, ".annotationEditorLayer");

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

  describe("Undo a draw", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that a draw can be undone", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToInk(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const xStart = rect.x + 300;
          const yStart = rect.y + 300;
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(xStart, yStart);
          await page.mouse.down();
          await page.mouse.move(xStart + 50, yStart + 50);
          await page.mouse.up();
          await awaitPromise(clickHandle);
          await commit(page);

          const editorSelector = getEditorSelector(0);
          await page.waitForSelector(editorSelector);
          await waitForSerialized(page, 1);

          await page.waitForSelector(`${editorSelector} button.delete`);
          await page.click(`${editorSelector} button.delete`);
          await waitForSerialized(page, 0);

          await kbUndo(page);
          await waitForSerialized(page, 1);
          await page.waitForSelector(editorSelector);
        })
      );
    });
  });

  describe("Delete a draw and undo it on another page", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that a draw can be undone", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToInk(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const xStart = rect.x + 300;
          const yStart = rect.y + 300;
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(xStart, yStart);
          await page.mouse.down();
          await page.mouse.move(xStart + 50, yStart + 50);
          await page.mouse.up();
          await awaitPromise(clickHandle);
          await commit(page);

          const editorSelector = getEditorSelector(0);
          await page.waitForSelector(editorSelector);
          await waitForSerialized(page, 1);

          await page.waitForSelector(`${editorSelector} button.delete`);
          await page.click(`${editorSelector} button.delete`);
          await waitForSerialized(page, 0);

          const twoToFourteen = Array.from(new Array(13).keys(), n => n + 2);
          for (const pageNumber of twoToFourteen) {
            const pageSelector = `.page[data-page-number = "${pageNumber}"]`;
            await scrollIntoView(page, pageSelector);
          }

          await kbUndo(page);
          await waitForSerialized(page, 1);

          const thirteenToOne = Array.from(new Array(13).keys(), n => 13 - n);
          for (const pageNumber of thirteenToOne) {
            const pageSelector = `.page[data-page-number = "${pageNumber}"]`;
            await scrollIntoView(page, pageSelector);
          }

          await page.waitForSelector(editorSelector);
        })
      );
    });
  });

  describe("Delete a draw, scroll and undo it", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that a draw can be undone", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToInk(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const xStart = rect.x + 300;
          const yStart = rect.y + 300;
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(xStart, yStart);
          await page.mouse.down();
          await page.mouse.move(xStart + 50, yStart + 50);
          await page.mouse.up();
          await awaitPromise(clickHandle);
          await commit(page);

          const editorSelector = getEditorSelector(0);
          await page.waitForSelector(editorSelector);
          await waitForSerialized(page, 1);

          await page.waitForSelector(`${editorSelector} button.delete`);
          await page.click(`${editorSelector} button.delete`);
          await waitForSerialized(page, 0);

          const twoToOne = Array.from(new Array(13).keys(), n => n + 2).concat(
            Array.from(new Array(13).keys(), n => 13 - n)
          );
          for (const pageNumber of twoToOne) {
            const pageSelector = `.page[data-page-number = "${pageNumber}"]`;
            await scrollIntoView(page, pageSelector);
          }

          await kbUndo(page);
          await waitForSerialized(page, 1);
          await page.waitForSelector(editorSelector);
        })
      );
    });
  });

  describe("Draw several times in the same editor", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that we can draw several times on the same canvas", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToInk(page);
          const rect = await getRect(page, ".annotationEditorLayer");

          let xStart = rect.x + 10;
          const yStart = rect.y + 10;
          for (let i = 0; i < 5; i++) {
            const clickHandle = await waitForPointerUp(page);
            await page.mouse.move(xStart, yStart);
            await page.mouse.down();
            await page.mouse.move(xStart + 50, yStart + 50);
            await page.mouse.up();
            await awaitPromise(clickHandle);
            xStart += 70;
          }
          await commit(page);

          await page.waitForSelector(getEditorSelector(0));
        })
      );
    });
  });

  describe("Drawing must unselect all", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that when we start to draw then the editors are unselected", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToInk(page);
          const rect = await getRect(page, ".annotationEditorLayer");

          let xStart = rect.x + 10;
          const yStart = rect.y + 10;
          for (let i = 0; i < 2; i++) {
            const clickHandle = await waitForPointerUp(page);
            await page.mouse.move(xStart, yStart);
            await page.mouse.down();
            if (i === 1) {
              expect(await getEditors(page, "selected"))
                .withContext(`In ${browserName}`)
                .toEqual([]);
            }
            await page.mouse.move(xStart + 50, yStart + 50);
            await page.mouse.up();
            await awaitPromise(clickHandle);
            await commit(page);
            xStart += 70;
          }
        })
      );
    });
  });

  describe("Selected editor must be updated even if the page has been destroyed", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the color has been changed", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToInk(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const x = rect.x + 20;
          const y = rect.y + 20;
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + 50, y + 50);
          await page.mouse.up();
          await awaitPromise(clickHandle);

          await commit(page);

          const drawSelector = `.page[data-page-number = "1"] .canvasWrapper .draw`;
          await page.waitForSelector(drawSelector, { visible: true });
          let color = await page.evaluate(sel => {
            const el = document.querySelector(sel);
            return el.getAttribute("stroke");
          }, drawSelector);
          expect(color).toEqual("#000000");

          const oneToFourteen = Array.from(new Array(13).keys(), n => n + 2);
          for (const pageNumber of oneToFourteen) {
            await scrollIntoView(
              page,
              `.page[data-page-number = "${pageNumber}"]`
            );
          }

          const red = "#ff0000";
          page.evaluate(value => {
            window.PDFViewerApplication.eventBus.dispatch(
              "switchannotationeditorparams",
              {
                source: null,
                type: window.pdfjsLib.AnnotationEditorParamsType.INK_COLOR,
                value,
              }
            );
          }, red);

          const fourteenToOne = Array.from(new Array(13).keys(), n => 13 - n);
          for (const pageNumber of fourteenToOne) {
            await scrollIntoView(
              page,
              `.page[data-page-number = "${pageNumber}"]`
            );
          }
          await page.waitForSelector(drawSelector, { visible: true });
          color = await page.evaluate(sel => {
            const el = document.querySelector(sel);
            return el.getAttribute("stroke");
          }, drawSelector);
          expect(color).toEqual(red);
        })
      );
    });
  });

  describe("Can delete the drawing in progress and undo the deletion", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the deletion has been undid", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToInk(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const x = rect.x + 20;
          const y = rect.y + 20;
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + 50, y + 50);
          await page.mouse.up();
          await awaitPromise(clickHandle);

          const drawSelector = `.canvasWrapper svg.draw path[d]:not([d=""])`;
          await page.waitForSelector(drawSelector);

          await page.keyboard.press("Backspace");

          const editorSelector = getEditorSelector(0);
          await waitForNoElement(page, drawSelector);
          await waitForNoElement(page, editorSelector);

          await kbUndo(page);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.waitForSelector(drawSelector);
        })
      );
    });
  });

  describe("Annotation mustn't take focus if it isn't visible", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the focus isn't taken", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToInk(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const x = rect.x + 20;
          const y = rect.y + 20;
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + 50, y + 50);
          await page.mouse.up();
          await awaitPromise(clickHandle);

          await page.evaluate(() => {
            window.focusedIds = [];
            window.focusCallback = e => {
              window.focusedIds.push(e.target.id);
            };
            window.addEventListener("focusin", window.focusCallback);
          });

          const oneToFourteen = Array.from(new Array(13).keys(), n => n + 2);
          for (const pageNumber of oneToFourteen) {
            await scrollIntoView(
              page,
              `.page[data-page-number = "${pageNumber}"]`
            );
          }

          const ids = await page.evaluate(() => {
            const { focusedIds, focusCallback } = window;
            window.removeEventListener("focusin", focusCallback);
            delete window.focusCallback;
            delete window.focusedIds;
            return focusedIds;
          });

          expect(ids).withContext(`In ${browserName}`).toEqual([]);
        })
      );
    });
  });

  describe("Ink (update existing)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("inks.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must update an existing annotation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const annotationsRect = await page.evaluate(() => {
            let xm = Infinity,
              xM = -Infinity,
              ym = Infinity,
              yM = -Infinity;
            for (const el of document.querySelectorAll(
              "section.inkAnnotation"
            )) {
              const { x, y, width, height } = el.getBoundingClientRect();
              xm = Math.min(xm, x);
              xM = Math.max(xM, x + width);
              ym = Math.min(ym, y);
              yM = Math.max(yM, y + height);
            }
            return { x: xm, y: ym, width: xM - xm, height: yM - ym };
          });

          await switchToInk(page);

          // The page has been re-rendered but with no ink annotations.
          let isWhite = await isCanvasWhite(page, 1, annotationsRect);
          expect(isWhite).withContext(`In ${browserName}`).toBeTrue();

          let editorIds = await getEditors(page, "ink");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(15);

          const pdfjsA = getEditorSelector(0);
          const editorRect = await getRect(page, pdfjsA);
          await selectEditor(page, pdfjsA);

          const red = "#ff0000";
          page.evaluate(value => {
            window.PDFViewerApplication.eventBus.dispatch(
              "switchannotationeditorparams",
              {
                source: null,
                type: window.pdfjsLib.AnnotationEditorParamsType.INK_COLOR,
                value,
              }
            );
          }, red);

          const serialized = await getSerialized(page);
          expect(serialized.length).withContext(`In ${browserName}`).toEqual(1);
          expect(serialized[0].color).toEqual([255, 0, 0]);

          // Disable editing mode.
          await switchToInk(page, /* disable = */ true);

          // We want to check that the editor is displayed but not the original
          // canvas.
          editorIds = await getEditors(page, "ink");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(1);

          isWhite = await isCanvasWhite(page, 1, editorRect);
          expect(isWhite).withContext(`In ${browserName}`).toBeTrue();

          // Check we've now a svg with a red stroke.
          await page.waitForSelector("svg[stroke = '#ff0000']", {
            visible: true,
          });

          // Re-enable editing mode.
          await switchToInk(page);
          await page.focus(".annotationEditorLayer");

          await kbUndo(page);
          await waitForSerialized(page, 0);

          editorIds = await getEditors(page, "ink");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(15);

          // Undo again.
          await kbUndo(page);
          // Nothing should happen, it's why we can't wait for something
          // specific!
          // eslint-disable-next-line no-restricted-syntax
          await waitForTimeout(200);

          // We check that the editor hasn't been removed.
          editorIds = await getEditors(page, "ink");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(15);
        })
      );
    });
  });

  describe("Ink (move existing)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("inks.pdf", getAnnotationSelector("277R"));
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must move an annotation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const modeChangedHandle = await waitForAnnotationModeChanged(page);
          const inkRect = await getRect(page, getAnnotationSelector("277R"));
          await page.mouse.click(
            inkRect.x + inkRect.width / 2,
            inkRect.y + inkRect.height / 2,
            { count: 2 }
          );
          await awaitPromise(modeChangedHandle);
          const edgeB = getEditorSelector(10);
          await waitForSelectedEditor(page, edgeB);

          const editorIds = await getEditors(page, "ink");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(15);

          // All the current annotations should be serialized as null objects
          // because they haven't been edited yet.
          const serialized = await getSerialized(page);
          expect(serialized).withContext(`In ${browserName}`).toEqual([]);

          // Select the annotation we want to move.
          await selectEditor(page, edgeB);

          await dragAndDrop(page, edgeB, [[100, 100]]);
          await waitForSerialized(page, 1);
        })
      );
    });
  });

  describe("Undo deletion popup has the expected behaviour", () => {
    let pages;
    const editorSelector = getEditorSelector(0);

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that deleting a drawing can be undone using the undo button", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToInk(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const xStart = rect.x + 300;
          const yStart = rect.y + 300;
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(xStart, yStart);
          await page.mouse.down();
          await page.mouse.move(xStart + 50, yStart + 50);
          await page.mouse.up();
          await awaitPromise(clickHandle);
          await commit(page);

          await page.waitForSelector(editorSelector);
          await waitForSerialized(page, 1);

          await page.waitForSelector(`${editorSelector} button.delete`);
          await page.click(`${editorSelector} button.delete`);
          await waitForSerialized(page, 0);

          await page.waitForSelector("#editorUndoBar:not([hidden])");
          await page.click("#editorUndoBarUndoButton");
          await waitForSerialized(page, 1);
          await page.waitForSelector(editorSelector);
        })
      );
    });

    it("must check that the undo deletion popup displays the correct message", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToInk(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const xStart = rect.x + 300;
          const yStart = rect.y + 300;
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(xStart, yStart);
          await page.mouse.down();
          await page.mouse.move(xStart + 50, yStart + 50);
          await page.mouse.up();
          await awaitPromise(clickHandle);
          await commit(page);

          await page.waitForSelector(editorSelector);
          await waitForSerialized(page, 1);

          await page.waitForSelector(`${editorSelector} button.delete`);
          await page.click(`${editorSelector} button.delete`);
          await waitForSerialized(page, 0);

          await page.waitForFunction(() => {
            const messageElement = document.querySelector(
              "#editorUndoBarMessage"
            );
            return messageElement && messageElement.textContent.trim() !== "";
          });
          const message = await page.waitForSelector("#editorUndoBarMessage");
          const messageText = await page.evaluate(
            el => el.textContent,
            message
          );
          expect(messageText).toContain("Drawing removed");
        })
      );
    });

    it("must check that the popup disappears when a new drawing is created", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToInk(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const xStart = rect.x + 300;
          const yStart = rect.y + 300;
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(xStart, yStart);
          await page.mouse.down();
          await page.mouse.move(xStart + 50, yStart + 50);
          await page.mouse.up();
          await awaitPromise(clickHandle);
          await commit(page);

          await page.waitForSelector(editorSelector);
          await waitForSerialized(page, 1);

          await page.waitForSelector(`${editorSelector} button.delete`);
          await page.click(`${editorSelector} button.delete`);
          await waitForSerialized(page, 0);
          await page.waitForSelector("#editorUndoBar:not([hidden])");

          const newRect = await getRect(page, ".annotationEditorLayer");
          const newXStart = newRect.x + 300;
          const newYStart = newRect.y + 300;
          const newClickHandle = await waitForPointerUp(page);
          await page.mouse.move(newXStart, newYStart);
          await page.mouse.down();
          await page.mouse.move(newXStart + 50, newYStart + 50);
          await page.mouse.up();
          await awaitPromise(newClickHandle);
          await commit(page);

          await page.waitForSelector(getEditorSelector(1));
          await waitForSerialized(page, 1);
          await page.waitForSelector("#editorUndoBar", { hidden: true });
        })
      );
    });
  });

  describe("Ink must update its stroke width when not the current active layer", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the stroke width has been updated after zooming", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToInk(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const x = rect.x + 20;
          const y = rect.y + 20;
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + 50, y + 50);
          await page.mouse.up();
          await awaitPromise(clickHandle);

          const svgSelector = ".canvasWrapper svg.draw";
          const strokeWidth = await page.$eval(svgSelector, el =>
            parseFloat(el.getAttribute("stroke-width"))
          );

          await scrollIntoView(page, `.page[data-page-number = "2"]`);

          const rectPageTwo = await getRect(
            page,
            `.page[data-page-number = "2"] .annotationEditorLayer`
          );
          const originX = rectPageTwo.x + rectPageTwo.width / 2;
          const originY = rectPageTwo.y + rectPageTwo.height / 2;
          await page.evaluate(
            origin => {
              window.PDFViewerApplication.pdfViewer.increaseScale({
                scaleFactor: 1.5,
                origin,
              });
            },
            [originX, originY]
          );

          const newStrokeWidth = await page.$eval(svgSelector, el =>
            parseFloat(el.getAttribute("stroke-width"))
          );

          expect(newStrokeWidth)
            .withContext(`In ${browserName}`)
            .not.toEqual(strokeWidth);
        })
      );
    });
  });

  describe("Draw annotations on several page, move one of them and delete it", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        10
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the first annotation is correctly associated with its SVG", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToInk(page);

          for (let i = 0; i < 2; i++) {
            const pageSelector = `.page[data-page-number = "${i + 1}"]`;
            const rect = await getRect(
              page,
              `${pageSelector} .annotationEditorLayer`
            );
            const xStart = rect.x + 10;
            const yStart = rect.y + 10;
            const clickHandle = await waitForPointerUp(page);
            await page.mouse.move(xStart, yStart);
            await page.mouse.down();
            await page.mouse.move(xStart + 10, yStart + 10);
            await page.mouse.up();
            await awaitPromise(clickHandle);
            await commit(page);
          }

          const pageOneSelector = `.page[data-page-number = "1"]`;
          const initialRect = await getRect(page, `${pageOneSelector} svg`);

          let editorSelector = getEditorSelector(1);
          await waitForSelectedEditor(page, editorSelector);
          await dragAndDrop(page, editorSelector, [[0, -30]], /* steps = */ 10);
          await waitForSerialized(page, 2);
          await page.waitForSelector(`${editorSelector} button.delete`);
          await page.click(`${editorSelector} button.delete`);
          await waitForSerialized(page, 1);
          await page.click("#editorUndoBarUndoButton");
          await page.waitForSelector("#editorUndoBar", { hidden: true });

          editorSelector = getEditorSelector(0);
          await selectEditor(page, editorSelector);

          await dragAndDrop(page, editorSelector, [[30, 30]], /* steps = */ 10);
          const finalRect = await getRect(page, `${pageOneSelector} svg`);

          expect(initialRect)
            .withContext(`In ${browserName}`)
            .not.toEqual(finalRect);
        })
      );
    });
  });

  describe("Page position should remain unchanged after drawing", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the page position remains the same after drawing", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const pageInitialPosition = await getRect(
            page,
            ".page[data-page-number='1']"
          );

          await switchToInk(page);

          const editorLayerRect = await getRect(page, ".annotationEditorLayer");
          const drawStartX = editorLayerRect.x + 100;
          const drawStartY = editorLayerRect.y + 100;

          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(drawStartX, drawStartY);
          await page.mouse.down();
          await page.mouse.move(drawStartX + 50, drawStartY + 50);
          await page.mouse.up();
          await awaitPromise(clickHandle);
          await commit(page);

          const pageFinalPosition = await getRect(
            page,
            ".page[data-page-number='1']"
          );

          expect(pageInitialPosition.x)
            .withContext(`In ${browserName}`)
            .toEqual(pageFinalPosition.x);

          expect(pageInitialPosition.y)
            .withContext(`In ${browserName}`)
            .toEqual(pageFinalPosition.y);
        })
      );
    });
  });
});

describe("The pen-drawn shape must maintain correct curvature regardless of the page it is drawn on or whether the curve's endpoint lies within or beyond the page boundaries", () => {
  let pages;

  beforeEach(async () => {
    pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
  });

  afterEach(async () => {
    await closePages(pages);
  });

  const getCurveOnPage = async ({ pageNumber = 1, page }) => {
    const clickHandle = await waitForPointerUp(page);
    const pageSelector = `.page[data-page-number = "${pageNumber}"]`;
    await scrollIntoView(page, pageSelector);
    await page.waitForSelector(pageSelector);
    const rect = await getRect(page, `${pageSelector} .annotationEditorLayer`);
    const x = rect.x + 100;
    const y = rect.y + 200;
    await page.mouse.move(x, y);
    await page.mouse.down();
    // Create a reference curve on first page.
    await page.mouse.move(x - 100, y);
    if (page !== 1) {
      // Add a move to create a curve that extends beyond the page boundary.
      await page.mouse.move(x - 200, y);
    }
    await page.mouse.up();
    await awaitPromise(clickHandle);
    const d = await page.$eval(
      `${pageSelector} .canvasWrapper svg.draw path[d]:not([d=""])`,
      el => el.getAttribute("d")
    );
    return d;
  };

  it("must retain correct curvature regardless of the page or the curve's endpoint location", async () => {
    await Promise.all(
      pages.map(async ([browserName, page]) => {
        await switchToInk(page);

        // Creating a reference curve on the first page with end
        // within the page boundaries.
        const d1 = await getCurveOnPage({ pageNumber: 1, page });

        // Creating a curve on the second page with end
        // beyond the page boundaries.
        const d2 = await getCurveOnPage({ pageNumber: 2, page });

        // Expect that the endpoint beyond the boundaries is ignored,
        // ensuring both curves have the same shape on both pages.
        expect(d1).withContext(`In ${browserName}`).toEqual(d2);
      })
    );
  });
});
