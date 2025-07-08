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
  copy,
  copyToClipboard,
  createPromise,
  dragAndDrop,
  firstPageOnTop,
  getEditors,
  getEditorSelector,
  getFirstSerialized,
  getRect,
  getSerialized,
  isCanvasMonochrome,
  kbBigMoveDown,
  kbBigMoveLeft,
  kbBigMoveRight,
  kbBigMoveUp,
  kbGoToBegin,
  kbGoToEnd,
  kbModifierDown,
  kbModifierUp,
  kbRedo,
  kbUndo,
  loadAndWait,
  moveEditor,
  paste,
  pasteFromClipboard,
  scrollIntoView,
  selectEditor,
  selectEditors,
  switchToEditor,
  unselectEditor,
  waitForAnnotationEditorLayer,
  waitForAnnotationModeChanged,
  waitForPointerUp,
  waitForSelectedEditor,
  waitForSerialized,
  waitForStorageEntries,
  waitForTimeout,
  waitForUnselectedEditor,
} from "./test_utils.mjs";
import { PNG } from "pngjs";

const selectAll = selectEditors.bind(null, "freeText");

const clearAll = clearEditors.bind(null, "freeText");

const commit = async page => {
  await page.keyboard.press("Escape");
  await page.waitForSelector(".freeTextEditor.selectedEditor .overlay.enabled");
};

const switchToFreeText = switchToEditor.bind(null, "FreeText");

const cancelFocusIn = async (page, selector) => {
  page.evaluate(sel => {
    const el = document.querySelector(sel);
    el.addEventListener(
      "focusin",
      evt => {
        evt.preventDefault();
        evt.stopPropagation();
      },
      { capture: true, once: true }
    );
  }, selector);
};

describe("FreeText Editor", () => {
  describe("FreeText", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("aboutstacks.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must write a string in a FreeText editor", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const editorSelector = getEditorSelector(0);
          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);

          await waitForSelectedEditor(page, editorSelector);
          await waitForStorageEntries(page, 1);

          const alert = await page.$eval("#viewer-alert", el => el.textContent);
          expect(alert).toEqual("Text added");

          let content = await page.$eval(editorSelector, el =>
            el.innerText.trimEnd()
          );
          expect(content).withContext(`In ${browserName}`).toEqual(data);

          // Edit again.
          await page.keyboard.press("Enter");
          await page.waitForSelector(
            `${editorSelector} .overlay:not(.enabled)`
          );
          await commit(page);

          content = await page.$eval(editorSelector, el =>
            el.innerText.trimEnd()
          );
          expect(content).withContext(`In ${browserName}`).toEqual(data);
        })
      );
    });

    it("must copy/paste", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [browserName, page] of pages) {
        await switchToFreeText(page);

        const rect = await getRect(page, ".annotationEditorLayer");
        const firstEditorSelector = getEditorSelector(0);
        const data = "Hello PDF.js World !!";
        await page.mouse.click(rect.x + 100, rect.y + 100);
        await page.waitForSelector(firstEditorSelector, { visible: true });
        await page.type(`${firstEditorSelector} .internal`, data);
        await commit(page);
        await waitForStorageEntries(page, 1);

        await selectEditor(page, firstEditorSelector);
        await copy(page);
        await paste(page);
        const secondEditorSelector = getEditorSelector(1);
        await page.waitForSelector(secondEditorSelector, { visible: true });
        await waitForStorageEntries(page, 2);

        const content = await page.$eval(firstEditorSelector, el =>
          el.innerText.trimEnd().replaceAll("\xa0", " ")
        );

        let pastedContent = await page.$eval(secondEditorSelector, el =>
          el.innerText.trimEnd().replaceAll("\xa0", " ")
        );

        expect(pastedContent).withContext(`In ${browserName}`).toEqual(content);

        await copy(page);
        await paste(page);
        const thirdEditorSelector = getEditorSelector(2);
        await page.waitForSelector(thirdEditorSelector, { visible: true });
        await waitForStorageEntries(page, 3);

        pastedContent = await page.$eval(thirdEditorSelector, el =>
          el.innerText.trimEnd().replaceAll("\xa0", " ")
        );
        expect(pastedContent).withContext(`In ${browserName}`).toEqual(content);
      }
    });

    it("must clear all", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          for (const n of [0, 1, 2]) {
            const editorSelector = getEditorSelector(n);
            const data = "Hello PDF.js World !!";
            await page.mouse.click(rect.x + 100 * n, rect.y + 100 * n);
            await page.waitForSelector(editorSelector, { visible: true });
            await page.type(`${editorSelector} .internal`, data);
            await commit(page);

            const hasEditor = await page.evaluate(
              sel => !!document.querySelector(sel),
              editorSelector
            );
            expect(hasEditor).withContext(`In ${browserName}`).toEqual(true);
          }

          await waitForStorageEntries(page, 3);
          await clearAll(page);
          await waitForStorageEntries(page, 0);

          for (const n of [0, 1, 2]) {
            const hasEditor = await page.evaluate(
              sel => !!document.querySelector(sel),
              getEditorSelector(n)
            );
            expect(hasEditor).withContext(`In ${browserName}`).toEqual(false);
          }
        })
      );
    });

    it("must check that a paste has been undone", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [, page] of pages) {
        await switchToFreeText(page);

        const rect = await getRect(page, ".annotationEditorLayer");
        let editorSelector = getEditorSelector(0);
        const data = "Hello PDF.js World !!";
        await page.mouse.click(rect.x + 100, rect.y + 100);
        await page.waitForSelector(editorSelector, { visible: true });
        await page.type(`${editorSelector} .internal`, data);
        await commit(page);

        await selectEditor(page, editorSelector);
        await copy(page);
        await paste(page);
        editorSelector = getEditorSelector(1);
        await page.waitForSelector(editorSelector, { visible: true });

        await kbUndo(page);
        await page.waitForFunction(
          sel => !document.querySelector(sel),
          {},
          editorSelector
        );

        for (let i = 0; i < 2; i++) {
          await paste(page);
          await page.waitForSelector(getEditorSelector(2 + i));
        }

        for (let i = 0; i < 2; i++) {
          await kbUndo(page);
          await page.waitForFunction(
            sel => !document.querySelector(sel),
            {},
            getEditorSelector(3 - i)
          );
        }
      }
    });

    it("must check that aria-owns is correct", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          await page.$eval(".textLayer", el => {
            for (const span of el.querySelectorAll(
              `span[role="presentation"]`
            )) {
              if (span.innerText.includes("Stacks are simple to create")) {
                span.setAttribute("pdfjs", true);
              }
            }
          });

          await scrollIntoView(page, `span[pdfjs="true"]`);

          const stacksRect = await getRect(page, `span[pdfjs="true"]`);
          const oldAriaOwns = await page.$eval(`span[pdfjs="true"]`, el =>
            el.getAttribute("aria-owns")
          );

          expect(oldAriaOwns).withContext(`In ${browserName}`).toEqual(null);

          const editorSelector = getEditorSelector(0);
          const data = "Hello PDF.js World !!";
          await page.mouse.click(
            stacksRect.x + stacksRect.width + 1,
            stacksRect.y + stacksRect.height / 2
          );
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);

          const ariaOwns = await page.$eval(".textLayer", el => {
            const span = el.querySelector(`span[pdfjs="true"]`);
            return span?.getAttribute("aria-owns") || null;
          });

          expect(ariaOwns.endsWith("_0-editor"))
            .withContext(`In ${browserName}`)
            .toEqual(true);
          await scrollIntoView(page, ".annotationEditorLayer");
        })
      );
    });

    it("must check that right click doesn't select", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const editorSelector = getEditorSelector(0);
          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);

          expect(await getEditors(page, "selected"))
            .withContext(`In ${browserName}`)
            .toEqual([0]);

          await page.keyboard.press("Escape");
          await page.waitForFunction(
            () => !document.querySelector(".selectedEditor")
          );

          await selectEditor(page, editorSelector);
          expect(await getEditors(page, "selected"))
            .withContext(`In ${browserName}`)
            .toEqual([0]);

          // Escape.
          await page.keyboard.press("Escape");
          await page.waitForFunction(
            () => !document.querySelector(".selectedEditor")
          );

          // TODO: uncomment that stuff once we've a way to dismiss
          // the context menu.
          /* await page.mouse.click(
            editorRect.x + editorRect.width / 2,
            editorRect.y + editorRect.height / 2,
            { button: "right" }
          ); */
        })
      );
    });

    it("must check that text change can be undone/redone", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [browserName, page] of pages) {
        await switchToFreeText(page);

        const rect = await getRect(page, ".annotationEditorLayer");
        const editorSelector = getEditorSelector(0);
        await page.mouse.click(rect.x + 200, rect.y + 100);
        await page.waitForSelector(editorSelector, { visible: true });

        for (let i = 0; i < 5; i++) {
          await page.type(`${editorSelector} .internal`, "A");
          await commit(page);

          if (i < 4) {
            await selectEditor(page, editorSelector, /* count = */ 2);
          }
        }

        let prevText = await page.$eval(
          `${editorSelector} .internal`,
          el => el.innerText
        );

        const waitForTextChange = previous =>
          page.waitForFunction(
            (prev, sel) => document.querySelector(sel).innerText !== prev,
            {},
            previous,
            `${editorSelector} .internal`
          );
        const getText = () =>
          page.$eval(`${editorSelector} .internal`, el => el.innerText);

        // We're in the middle of the text.
        await kbUndo(page);
        await waitForTextChange(prevText);

        let text = (prevText = await getText());
        expect(text).withContext(`In ${browserName}`).toEqual("AAAA");

        await kbUndo(page);
        await waitForTextChange(prevText);

        text = prevText = await getText();

        expect(text).withContext(`In ${browserName}`).toEqual("AAA");

        await kbRedo(page);
        await waitForTextChange(prevText);

        text = prevText = await getText();

        expect(text).withContext(`In ${browserName}`).toEqual("AAAA");

        for (let i = 0; i < 4; i++) {
          await kbUndo(page);
          if (i < 3) {
            await waitForTextChange(prevText);
            prevText = await getText();
          }
        }

        await page.waitForFunction(
          () => !document.querySelector(".selectedEditor")
        );

        await kbRedo(page);
        await page.waitForSelector(editorSelector, { visible: true });

        text = await getText();
        expect(text).withContext(`In ${browserName}`).toEqual("A");

        // Add a new A.
        await selectEditor(page, editorSelector, /* count = */ 2);
        await page.type(`${editorSelector} .internal`, "A");
        await commit(page);

        text = await getText();
        expect(text).withContext(`In ${browserName}`).toEqual("AA");
      }
    });
  });

  describe("FreeText (multiselection)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("aboutstacks.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must select/unselect several editors and check copy, paste and delete operations", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [browserName, page] of pages) {
        await switchToFreeText(page);

        const rect = await getRect(page, ".annotationEditorLayer");

        const editorCenters = [];
        let lastX = rect.x + rect.width / 10;
        for (let i = 0; i < 4; i++) {
          const editorSelector = getEditorSelector(i);
          const data = `FreeText ${i}`;
          await page.mouse.click(lastX, rect.y + rect.height / 10);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);

          const editorRect = await getRect(page, editorSelector);
          lastX = editorRect.x + editorRect.width + 10;
          editorCenters.push({
            x: editorRect.x + editorRect.width / 2,
            y: editorRect.y + editorRect.height / 2,
          });
        }

        await selectAll(page);

        expect(await getEditors(page, "selected"))
          .withContext(`In ${browserName}`)
          .toEqual([0, 1, 2, 3]);

        // Unselect the editor.
        await kbModifierDown(page);
        await page.mouse.click(editorCenters[1].x, editorCenters[1].y);
        await waitForUnselectedEditor(page, getEditorSelector(1));

        expect(await getEditors(page, "selected"))
          .withContext(`In ${browserName}`)
          .toEqual([0, 2, 3]);

        await page.mouse.click(editorCenters[2].x, editorCenters[2].y);
        await waitForUnselectedEditor(page, getEditorSelector(2));

        expect(await getEditors(page, "selected"))
          .withContext(`In ${browserName}`)
          .toEqual([0, 3]);

        await page.mouse.click(editorCenters[1].x, editorCenters[1].y);
        await kbModifierUp(page);
        await waitForSelectedEditor(page, getEditorSelector(1));

        expect(await getEditors(page, "selected"))
          .withContext(`In ${browserName}`)
          .toEqual([0, 1, 3]);

        await copy(page);
        await paste(page);
        await page.waitForSelector(getEditorSelector(6), { visible: true });

        // 0,1,3 are unselected and new pasted editors are selected.
        expect(await getEditors(page, "selected"))
          .withContext(`In ${browserName}`)
          .toEqual([4, 5, 6]);

        // No ctrl here, hence all are unselected and 2 is selected.
        await page.mouse.click(editorCenters[2].x, editorCenters[2].y);
        await waitForSelectedEditor(page, getEditorSelector(2));
        expect(await getEditors(page, "selected"))
          .withContext(`In ${browserName}`)
          .toEqual([2]);

        await page.mouse.click(editorCenters[1].x, editorCenters[1].y);
        await waitForSelectedEditor(page, getEditorSelector(1));
        expect(await getEditors(page, "selected"))
          .withContext(`In ${browserName}`)
          .toEqual([1]);

        await kbModifierDown(page);

        await page.mouse.click(editorCenters[3].x, editorCenters[3].y);
        await waitForSelectedEditor(page, getEditorSelector(3));
        expect(await getEditors(page, "selected"))
          .withContext(`In ${browserName}`)
          .toEqual([1, 3]);

        await kbModifierUp(page);

        // Delete 1 and 3.
        await page.keyboard.press("Backspace");
        await page.waitForFunction(
          sels => sels.every(sel => !document.querySelector(sel)),
          {},
          [1, 3].map(getEditorSelector)
        );

        await selectAll(page);

        expect(await getEditors(page, "selected"))
          .withContext(`In ${browserName}`)
          .toEqual([0, 2, 4, 5, 6]);

        // Create an empty editor.
        await page.mouse.click(
          rect.x + (rect.width / 10) * 7,
          rect.y + rect.height / 10
        );
        await page.waitForSelector(getEditorSelector(7), { visible: true });
        expect(await getEditors(page, "selected"))
          .withContext(`In ${browserName}`)
          .toEqual([7]);

        // Set the focus to 2 and check that only 2 is selected.
        await page.mouse.click(editorCenters[2].x, editorCenters[2].y);
        await waitForSelectedEditor(page, getEditorSelector(2));
        expect(await getEditors(page, "selected"))
          .withContext(`In ${browserName}`)
          .toEqual([2]);

        // Create an empty editor.
        await page.mouse.click(
          rect.x + (rect.width / 10) * 8,
          rect.y + rect.height / 10
        );
        await page.waitForSelector(getEditorSelector(8), { visible: true });
        expect(await getEditors(page, "selected"))
          .withContext(`In ${browserName}`)
          .toEqual([8]);
        // Dismiss it.
        await page.keyboard.press("Escape");
        await page.waitForFunction(
          sel => !document.querySelector(sel),
          {},
          getEditorSelector(8)
        );

        await selectAll(page);

        // Check that all the editors are correctly selected (and the focus
        // didn't move to the body when the empty editor was removed).
        expect(await getEditors(page, "selected"))
          .withContext(`In ${browserName}`)
          .toEqual([0, 2, 4, 5, 6]);
      }
    });
  });

  describe("FreeText (bugs)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must serialize invisible annotations", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);
          let currentId = 0;
          const expected = [];
          const oneToFourteen = Array.from(new Array(14).keys(), x => x + 1);

          for (const pageNumber of oneToFourteen) {
            const pageSelector = `.page[data-page-number = "${pageNumber}"]`;

            await scrollIntoView(page, pageSelector);
            const annotationLayerSelector = `${pageSelector} > .annotationEditorLayer.freetextEditing`;
            await page.waitForSelector(annotationLayerSelector, {
              visible: true,
              timeout: 0,
            });
            if (![1, 14].includes(pageNumber)) {
              continue;
            }

            const rect = await getRect(page, annotationLayerSelector);
            const editorSelector = getEditorSelector(currentId);
            const data = `Hello PDF.js World !! on page ${pageNumber}`;
            expected.push(data);
            await page.mouse.click(rect.x + 100, rect.y + 100);
            await page.waitForSelector(editorSelector, { visible: true });
            await page.type(`${editorSelector} .internal`, data);
            await commit(page);

            await waitForSelectedEditor(page, editorSelector);
            await waitForStorageEntries(page, currentId + 1);

            const content = await page.$eval(editorSelector, el =>
              el.innerText.trimEnd()
            );
            expect(content).withContext(`In ${browserName}`).toEqual(data);

            currentId += 1;
          }

          const serialize = proprName =>
            page.evaluate(name => {
              const { map } =
                window.PDFViewerApplication.pdfDocument.annotationStorage
                  .serializable;
              return map ? Array.from(map.values(), x => x[name]) : [];
            }, proprName);

          expect(await serialize("value"))
            .withContext(`In ${browserName}`)
            .toEqual(expected);
          expect(await serialize("fontSize"))
            .withContext(`In ${browserName}`)
            .toEqual([10, 10]);
          expect(await serialize("color"))
            .withContext(`In ${browserName}`)
            .toEqual([
              [0, 0, 0],
              [0, 0, 0],
            ]);

          // Increase the font size for all the annotations.
          await selectAll(page);

          const [prevFontSize, prevColor] = await page.$eval(
            ".selectedEditor .internal",
            el => {
              const style = getComputedStyle(el);
              return [style.fontSize, style.color];
            }
          );

          await page.evaluate(() => {
            window.PDFViewerApplication.eventBus.dispatch(
              "switchannotationeditorparams",
              {
                source: null,
                type: window.pdfjsLib.AnnotationEditorParamsType.FREETEXT_SIZE,
                value: 13,
              }
            );
          });
          await page.waitForFunction(
            prev =>
              getComputedStyle(
                document.querySelector(".selectedEditor .internal")
              ).fontSize !== prev,
            {},
            prevFontSize
          );

          expect(await serialize("fontSize"))
            .withContext(`In ${browserName}`)
            .toEqual([13, 13]);

          // Change the colors for all the annotations.
          await page.evaluate(() => {
            window.PDFViewerApplication.eventBus.dispatch(
              "switchannotationeditorparams",
              {
                source: null,
                type: window.pdfjsLib.AnnotationEditorParamsType.FREETEXT_COLOR,
                value: "#FF0000",
              }
            );
          });
          await page.waitForFunction(
            prev =>
              getComputedStyle(
                document.querySelector(".selectedEditor .internal")
              ).color !== prev,
            {},
            prevColor
          );

          expect(await serialize("color"))
            .withContext(`In ${browserName}`)
            .toEqual([
              [255, 0, 0],
              [255, 0, 0],
            ]);
        })
      );
    });
  });

  describe("issue 15789", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue15789.pdf", ".annotationEditorLayer");
      pages = await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.select("#scaleSelect", "1");
          return [browserName, page];
        })
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must take the media box into account", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);
          let currentId = 0;

          for (let step = 0; step < 3; step++) {
            await firstPageOnTop(page);
            const rect = await getRect(page, ".annotationEditorLayer");
            const editorSelector = getEditorSelector(currentId);
            const data = `Hello ${step}`;
            const x = Math.max(rect.x + 0.1 * rect.width, 10);
            const y = Math.max(rect.y + 0.1 * rect.height, 10);
            await page.mouse.click(x, y);
            await page.waitForSelector(editorSelector, { visible: true });
            await page.type(`${editorSelector} .internal`, data);
            await commit(page);

            const promise = await waitForAnnotationEditorLayer(page);
            await page.evaluate(() => {
              document.getElementById("pageRotateCw").click();
            });
            await awaitPromise(promise);

            currentId += 1;
            await page.waitForSelector(
              ".page[data-page-number='1'] .canvasWrapper",
              {
                timeout: 0,
              }
            );
            await page.waitForSelector(
              ".page[data-page-number='1'] .annotationEditorLayer:not([hidden])",
              {
                timeout: 0,
              }
            );
          }

          const serialize = proprName =>
            page.evaluate(name => {
              const { map } =
                window.PDFViewerApplication.pdfDocument.annotationStorage
                  .serializable;
              return map ? Array.from(map.values(), x => x[name]) : [];
            }, proprName);

          const rects = (await serialize("rect")).map(rect =>
            rect.slice(0, 2).map(x => Math.floor(x))
          );
          const expected = [
            [-28, 695],
            [-38, -10],
            [501, -20],
          ];
          // Dimensions aren't exactly the same from a platform to an other
          // so we're a bit tolerant here with the numbers.
          // Anyway the goal is to check that the bottom left corner of the
          // media box is taken into account.
          // The pdf has a media box equals to [-99 -99 612.0 792.0].
          const diffs = rects.map(
            (rect, i) =>
              Math.abs(rect[0] - expected[i][0]) < 10 &&
              Math.abs(rect[1] - expected[i][1]) < 10
          );

          expect(diffs)
            .withContext(`In ${browserName}`)
            .toEqual([true, true, true]);
        })
      );
    });
  });

  describe("FreeText (move existing)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("freetexts.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must move an annotation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const editorIds = await getEditors(page, "freeText");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(6);

          // All the current annotations should be serialized as null objects
          // because they haven't been edited yet.
          const serialized = await getSerialized(page);
          expect(serialized).withContext(`In ${browserName}`).toEqual([]);

          // Select the annotation we want to move.
          const editorSelector = getEditorSelector(0);
          await selectEditor(page, editorSelector);

          await dragAndDrop(page, editorSelector, [[100, 100]]);
          await waitForSerialized(page, 1);
        })
      );
    });
  });

  describe("FreeText (update existing)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("freetexts.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must update an existing annotation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          // The page has been re-rendered but with no freetext annotations.
          let isWhite = await isCanvasMonochrome(page, 1, null, 0xffffffff);
          expect(isWhite).withContext(`In ${browserName}`).toBeTrue();

          let editorIds = await getEditors(page, "freeText");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(6);

          const editorSelector = getEditorSelector(0);
          const editorRect = await getRect(page, editorSelector);
          await selectEditor(page, editorSelector, /* count = */ 2);
          await kbGoToEnd(page);
          await page.waitForFunction(
            sel =>
              document.getSelection().anchorOffset ===
              document.querySelector(sel).innerText.length,
            {},
            `${editorSelector} .internal`
          );

          await page.type(
            `${editorSelector} .internal`,
            " and edited in Firefox"
          );
          await commit(page);

          const serialized = await getSerialized(page);
          expect(serialized.length).withContext(`In ${browserName}`).toEqual(1);
          expect(serialized[0]).toEqual(
            jasmine.objectContaining({
              color: [107, 217, 41],
              fontSize: 14,
              value: "Hello World from Acrobat and edited in Firefox",
              id: "26R",
            })
          );

          // Disable editing mode.
          await switchToFreeText(page, /* disable = */ true);

          // We want to check that the editor is displayed but not the original
          // canvas.
          editorIds = await getEditors(page, "freeText");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(1);

          isWhite = await isCanvasMonochrome(page, 1, editorRect, 0xffffffff);
          expect(isWhite).withContext(`In ${browserName}`).toBeTrue();

          // Check we've now a div containing the text.
          const newDivText = await page.$eval(
            "[data-annotation-id='26R'] div.annotationContent",
            el => el.innerText.replaceAll("\xa0", " ")
          );
          expect(newDivText)
            .withContext(`In ${browserName}`)
            .toEqual("Hello World from Acrobat and edited in Firefox");

          // Re-enable editing mode.
          await switchToFreeText(page);
          await page.focus(".annotationEditorLayer");

          await kbUndo(page);
          await waitForSerialized(page, 0);

          editorIds = await getEditors(page, "freeText");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(6);

          // Undo again.
          await kbUndo(page);
          // Nothing should happen, it's why we can't wait for something
          // specific!
          // eslint-disable-next-line no-restricted-syntax
          await waitForTimeout(200);

          // We check that the editor hasn't been removed.
          editorIds = await getEditors(page, "freeText");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(6);
        })
      );
    });
  });

  describe("FreeText (update existing and popups)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("freetexts.pdf", "[data-annotation-id='32R']");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must update an existing annotation and show the right popup", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // Show the popup on "Hello World from Firefox"
          await page.click("[data-annotation-id='32R']");
          const popupSelector = "[data-annotation-id='popup_32R']";
          await page.waitForSelector(popupSelector, { visible: true });

          await switchToFreeText(page);
          await page.waitForSelector(popupSelector, { visible: false });

          const editorSelector = getEditorSelector(1);
          await selectEditor(page, editorSelector, /* count = */ 2);
          await kbGoToEnd(page);
          await page.waitForFunction(
            sel =>
              document.getSelection().anchorOffset ===
              document.querySelector(sel).innerText.length,
            {},
            `${editorSelector} .internal`
          );

          await page.type(
            `${editorSelector} .internal`,
            " and edited in Firefox"
          );
          await commit(page);

          // Disable editing mode.
          await switchToFreeText(page, /* disable = */ true);
          await page.waitForSelector(popupSelector, { visible: true });

          const newPopupText = await page.$eval(
            `${popupSelector} .popupContent`,
            el => el.innerText.replaceAll("\xa0", " ")
          );
          expect(newPopupText)
            .withContext(`In ${browserName}`)
            .toEqual("Hello World From Firefox and edited in Firefox");
        })
      );
    });
  });

  describe("FreeText (update existing but not empty ones)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue14438.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must update an existing annotation but not an empty one", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const editorIds = await getEditors(page, "freeText");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(1);
        })
      );
    });
  });

  describe("FreeText (delete existing)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("freetexts.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must delete an existing annotation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          let editorIds = await getEditors(page, "freeText");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(6);

          const editorSelector = getEditorSelector(3);
          await selectEditor(page, editorSelector);
          await page.keyboard.press("Backspace");
          await page.waitForFunction(
            sel => !document.querySelector(sel),
            {},
            editorSelector
          );

          const serialized = await getSerialized(page);
          expect(serialized).toEqual([
            {
              pageIndex: 0,
              id: "51R",
              deleted: true,
              popupRef: "",
            },
          ]);

          // Disable editing mode.
          await switchToFreeText(page, /* disable = */ true);

          // We want to check that nothing is displayed.
          editorIds = await getEditors(page, "freeText");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(0);
          const hidden = await page.$eval(
            "[data-annotation-id='51R']",
            el => el.hidden
          );
          expect(hidden).withContext(`In ${browserName}`).toBeTrue();

          // Re-enable editing mode.
          await switchToFreeText(page);
          await page.focus(".annotationEditorLayer");

          await kbUndo(page);
          await waitForSerialized(page, 0);
        })
      );
    });

    it("must delete an existing annotation with a popup", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("[data-annotation-id='26R']");
          // Wait for the popup to be displayed.
          const popupSelector = "[data-annotation-id='popup_26R'] .popup";
          await page.waitForSelector(popupSelector, { visible: true });

          await switchToFreeText(page);

          const editorSelector = getEditorSelector(0);
          await selectEditor(page, editorSelector);
          await page.keyboard.press("Backspace");
          await page.waitForFunction(
            sel => !document.querySelector(sel),
            {},
            editorSelector
          );

          await waitForSerialized(page, 1);
          const serialized = await getSerialized(page);
          expect(serialized).toEqual([
            {
              pageIndex: 0,
              id: "26R",
              deleted: true,
              popupRef: "",
            },
          ]);

          // Disable editing mode.
          await switchToFreeText(page, /* disable = */ true);

          await page.waitForSelector(":not([data-annotation-id='26R'] .popup)");

          // Re-enable editing mode.
          await switchToFreeText(page);
          await page.focus(".annotationEditorLayer");

          await kbUndo(page);
          await waitForSerialized(page, 0);

          // Disable editing mode.
          await switchToFreeText(page, /* disable = */ true);

          const popupAreaSelector =
            "[data-annotation-id='26R'].popupTriggerArea";
          await page.waitForSelector(popupAreaSelector, { visible: true });
          await page.click("[data-annotation-id='26R']");
          // Wait for the popup to be displayed.
          await page.waitForSelector(popupSelector, { visible: true });
        })
      );
    });
  });

  describe("FreeText (copy/paste existing)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("freetexts.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must copy and paste an existing annotation", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [browserName, page] of pages) {
        await switchToFreeText(page);

        const editorIds = await getEditors(page, "freeText");
        expect(editorIds.length).withContext(`In ${browserName}`).toEqual(6);

        await selectEditor(page, getEditorSelector(1));
        await copy(page);
        await paste(page);
        await page.waitForSelector(getEditorSelector(6), { visible: true });
        await waitForStorageEntries(page, 7);
      }
    });
  });

  describe("FreeText (edit existing in double clicking on it)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("freetexts.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must edit an annotation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const modeChangedHandle = await waitForAnnotationModeChanged(page);
          await page.click("[data-annotation-id='26R']", { count: 2 });
          await awaitPromise(modeChangedHandle);
          await page.waitForSelector(`${getEditorSelector(0)}-editor`);

          const [focusedId, editable] = await page.evaluate(() => {
            const el = document.activeElement;
            return [el.id, el.contentEditable];
          });
          expect(focusedId)
            .withContext(`In ${browserName}`)
            .toEqual("pdfjs_internal_editor_0-editor");
          expect(editable).withContext(`In ${browserName}`).toEqual("true");

          const editorIds = await getEditors(page, "freeText");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(6);
        })
      );
    });
  });

  describe("FreeText with popup", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "annotation-freetext.pdf",
        ".annotationEditorLayer"
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must not remove an empty annotation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.waitForSelector("[data-annotation-id='23R']");

          // Enter in editing mode.
          await switchToFreeText(page);

          // Disable editing mode.
          await switchToFreeText(page, /* disable = */ true);

          await page.waitForSelector("[data-annotation-id='23R']");
        })
      );
    });

    it("must hide the popup when editing", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("[data-annotation-id='20R']");
          // Wait for the popup to be displayed.
          await page.waitForFunction(
            () =>
              document.querySelector("[data-annotation-id='popup_20R']")
                .hidden === false
          );

          // Enter in editing mode.
          await switchToFreeText(page);
          // Wait for the popup to be hidden.
          await page.waitForFunction(
            () =>
              document.querySelector("[data-annotation-id='popup_20R']")
                .hidden === true
          );

          // Exit editing mode.
          await switchToFreeText(page, /* disable = */ true);

          // Wait for the popup to be visible.
          await page.waitForFunction(
            () =>
              document.querySelector("[data-annotation-id='popup_20R']")
                .hidden === false
          );
        })
      );
    });
  });

  describe("FreeText rotation", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the dimensions of a rotated annotations are correct after a font size change", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.evaluate(() => {
            window.PDFViewerApplication.rotatePages(90);
          });
          await page.waitForSelector(
            ".annotationEditorLayer[data-main-rotation='90']"
          );
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const editorSelector = getEditorSelector(0);
          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);

          // Make Chrome happy.
          await page.waitForFunction(() => {
            const box = [
              ...window.PDFViewerApplication.pdfDocument.annotationStorage.serializable.map.values(),
            ][0].rect;
            return box[2] !== box[0];
          }, {});

          let serialized = await getSerialized(page);
          let bbox = serialized[0].rect;
          let width = bbox[2] - bbox[0];
          let height = bbox[3] - bbox[1];
          expect(width < height)
            .withContext(`In ${browserName}`)
            .toEqual(true);

          await page.evaluate(() => {
            window.PDFViewerApplication.rotatePages(270);
          });
          await page.waitForSelector(
            ".annotationEditorLayer[data-main-rotation='0']"
          );

          await selectAll(page);

          const { width: prevWidth } = await getRect(
            page,
            ".selectedEditor .internal"
          );

          await page.evaluate(() => {
            window.PDFViewerApplication.eventBus.dispatch(
              "switchannotationeditorparams",
              {
                source: null,
                type: window.pdfjsLib.AnnotationEditorParamsType.FREETEXT_SIZE,
                value: 50,
              }
            );
          });

          await page.waitForFunction(
            prev =>
              document
                .querySelector(".selectedEditor .internal")
                .getBoundingClientRect().width !== prev,
            {},
            prevWidth
          );

          // Make Chrome happy.
          await page.waitForFunction(() => {
            const box = [
              ...window.PDFViewerApplication.pdfDocument.annotationStorage.serializable.map.values(),
            ][0].rect;
            return box[2] !== box[0];
          }, {});

          serialized = await getSerialized(page);
          bbox = serialized[0].rect;
          width = bbox[2] - bbox[0];
          height = bbox[3] - bbox[1];
          expect(width < height)
            .withContext(`In ${browserName}`)
            .toEqual(true);
        })
      );
    });
  });

  describe("FreeText (remove)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must delete invisible annotations", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);
          let currentId = 0;
          const oneToFourteen = Array.from(new Array(14).keys(), x => x + 1);

          for (const pageNumber of oneToFourteen) {
            const pageSelector = `.page[data-page-number = "${pageNumber}"]`;

            await scrollIntoView(page, pageSelector);
            const annotationLayerSelector = `${pageSelector} > .annotationEditorLayer.freetextEditing`;
            await page.waitForSelector(annotationLayerSelector, {
              visible: true,
              timeout: 0,
            });
            if (![1, 14].includes(pageNumber)) {
              continue;
            }

            const rect = await getRect(page, annotationLayerSelector);
            const editorSelector = getEditorSelector(currentId);
            const data = `Hello PDF.js World !! on page ${pageNumber}`;
            await page.mouse.click(rect.x + 100, rect.y + 100);
            await page.waitForSelector(editorSelector, { visible: true });
            await page.type(`${editorSelector} .internal`, data);
            await commit(page);

            currentId += 1;
          }

          await selectAll(page);

          const serialize = () =>
            page.evaluate(() => {
              const { map } =
                window.PDFViewerApplication.pdfDocument.annotationStorage
                  .serializable;
              return map ? Array.from(map.values(), x => x.pageIndex) : [];
            });

          expect(await serialize())
            .withContext(`In ${browserName}`)
            .toEqual([0, 13]);

          // Delete
          await page.keyboard.press("Backspace");
          await waitForSerialized(page, 0);
        })
      );
    });
  });

  describe("FreeText (open existing)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue16633.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must open an existing annotation and check that the position are good", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const toBinary = buf => {
            for (let i = 0; i < buf.length; i += 4) {
              const gray =
                (0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]) /
                255;
              buf[i] = buf[i + 1] = buf[i + 2] = gray <= 0.5 ? 0 : 255;
            }
          };

          // We want to detect the first non-white pixel in the image.
          // But we can have some antialiasing...
          // The idea to just try to detect the beginning of the vertical bar
          // of the "H" letter.
          // Hence we just take the first non-white pixel in the image which is
          // the most repeated one.
          const getFirstPixel = (buf, width, height) => {
            toBinary(buf);
            const firsts = [];
            const stats = {};
            // Get the position of the first pixels.
            // The position of char depends on a lot of different parameters,
            // hence it's possible to not have a pixel where we expect to have
            // it. So we just collect the positions of the first black pixel and
            // take the first one where its abscissa is the most frequent.
            for (let i = height - 1; i >= 0; i--) {
              for (let j = 0; j < width; j++) {
                const idx = (width * i + j) << 2;
                if (buf[idx] === 0) {
                  firsts.push([j, i]);
                  stats[j] = (stats[j] || 0) + 1;
                  break;
                }
              }
            }

            let maxValue = -Infinity;
            let maxJ = 0;
            for (const [j, count] of Object.entries(stats)) {
              if (count > maxValue) {
                maxValue = count;
                maxJ = j;
              }
            }
            maxJ = parseInt(maxJ, 10);
            for (const [j, i] of firsts) {
              if (j === maxJ) {
                return [j, i];
              }
            }
            return null;
          };

          const firstPixelsAnnotations = new Map();

          // [26, 32, ...] are the annotation ids
          for (const n of [26, 32, 42, 57, 35, 1]) {
            const id = `${n}R`;
            const rect = await getRect(page, `[data-annotation-id="${id}"]`);
            const editorPng = await page.screenshot({
              clip: rect,
              type: "png",
            });
            const editorImage = PNG.sync.read(Buffer.from(editorPng));
            const editorFirstPix = getFirstPixel(
              editorImage.data,
              editorImage.width,
              editorImage.height
            );
            firstPixelsAnnotations.set(id, { editorFirstPix, rect });
          }

          await switchToFreeText(page);

          await page.evaluate(() => {
            document.getElementById("editorFreeTextParamsToolbar").remove();
          });

          for (const n of [0, 1, 2, 3, 4]) {
            const annotationId = await page.evaluate(N => {
              const editor = document.getElementById(
                `pdfjs_internal_editor_${N}`
              );
              return editor.getAttribute("annotation-id");
            }, n);
            const { editorFirstPix: annotationFirstPix, rect } =
              firstPixelsAnnotations.get(annotationId);
            const editorPng = await page.screenshot({
              clip: rect,
              type: "png",
            });
            const editorImage = PNG.sync.read(Buffer.from(editorPng));
            const editorFirstPix = getFirstPixel(
              editorImage.data,
              editorImage.width,
              editorImage.height
            );

            expect(
              Math.abs(editorFirstPix[0] - annotationFirstPix[0]) <= 3 &&
                Math.abs(editorFirstPix[1] - annotationFirstPix[1]) <= 3
            )
              .withContext(
                `In ${browserName}, first pix coords in editor: ${editorFirstPix} and in annotation: ${annotationFirstPix}`
              )
              .toEqual(true);
          }
        })
      );
    });
  });

  describe("FreeText (open existing and rotated)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "rotated_freetexts.pdf",
        ".annotationEditorLayer",
        100
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must open an existing rotated annotation and check that the position are good", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const toBinary = buf => {
            for (let i = 0; i < buf.length; i += 4) {
              const gray =
                (0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2]) /
                255;
              buf[i] = buf[i + 1] = buf[i + 2] = gray >= 0.5 ? 255 : 0;
            }
          };

          const getFirstPixel = (buf, width, height, start) => {
            toBinary(buf);
            const firsts = [];
            const stats = {};
            switch (start) {
              case "TL":
                for (let j = 0; j < width; j++) {
                  for (let i = 0; i < height; i++) {
                    const idx = (width * i + j) << 2;
                    if (buf[idx] === 0) {
                      firsts.push([j, i]);
                      stats[j] = (stats[j] || 0) + 1;
                      break;
                    }
                  }
                }
                break;
              case "TR":
                for (let i = 0; i < height; i++) {
                  for (let j = width - 1; j >= 0; j--) {
                    const idx = (width * i + j) << 2;
                    if (buf[idx] === 0) {
                      firsts.push([j, i]);
                      stats[j] = (stats[j] || 0) + 1;
                      break;
                    }
                  }
                }
                break;
              case "BR":
                for (let j = width - 1; j >= 0; j--) {
                  for (let i = height - 1; i >= 0; i--) {
                    const idx = (width * i + j) << 2;
                    if (buf[idx] === 0) {
                      firsts.push([j, i]);
                      stats[j] = (stats[j] || 0) + 1;
                      break;
                    }
                  }
                }
                break;
              case "BL":
                for (let i = height - 1; i >= 0; i--) {
                  for (let j = 0; j < width; j++) {
                    const idx = (width * i + j) << 2;
                    if (buf[idx] === 0) {
                      firsts.push([j, i]);
                      stats[j] = (stats[j] || 0) + 1;
                      break;
                    }
                  }
                }
                break;
            }

            let maxValue = -Infinity;
            let maxJ = 0;
            for (const [j, count] of Object.entries(stats)) {
              if (count > maxValue) {
                maxValue = count;
                maxJ = j;
              }
            }
            maxJ = parseInt(maxJ, 10);
            for (const [j, i] of firsts) {
              if (j === maxJ) {
                return [j, i];
              }
            }
            return null;
          };

          const firstPixelsAnnotations = new Map();
          for (const [n, start] of [
            [17, "BL"],
            [18, "BR"],
            [19, "TR"],
            [20, "TL"],
          ]) {
            const id = `${n}R`;
            const rect = await getRect(page, `[data-annotation-id="${id}"]`);
            const editorPng = await page.screenshot({
              clip: rect,
              type: "png",
            });
            const editorImage = PNG.sync.read(Buffer.from(editorPng));
            const editorFirstPix = getFirstPixel(
              editorImage.data,
              editorImage.width,
              editorImage.height,
              start
            );
            firstPixelsAnnotations.set(id, { editorFirstPix, rect });
          }

          await switchToFreeText(page);

          await page.evaluate(() => {
            document.getElementById("editorFreeTextParamsToolbar").remove();
          });

          for (const [n, start] of [
            [0, "BL"],
            [1, "BR"],
            [2, "TR"],
            [3, "TL"],
          ]) {
            const annotationId = await page.evaluate(N => {
              const editor = document.getElementById(
                `pdfjs_internal_editor_${N}`
              );
              return editor.getAttribute("annotation-id");
            }, n);
            const { editorFirstPix: annotationFirstPix, rect } =
              firstPixelsAnnotations.get(annotationId);
            const editorPng = await page.screenshot({
              clip: rect,
              type: "png",
            });
            const editorImage = PNG.sync.read(Buffer.from(editorPng));
            const editorFirstPix = getFirstPixel(
              editorImage.data,
              editorImage.width,
              editorImage.height,
              start
            );

            expect(
              Math.abs(editorFirstPix[0] - annotationFirstPix[0]) <= 3 &&
                Math.abs(editorFirstPix[1] - annotationFirstPix[1]) <= 3
            )
              .withContext(
                `In ${browserName}, first pix coords in editor: ${editorFirstPix} and in annotation: ${annotationFirstPix}`
              )
              .toEqual(true);
          }
        })
      );
    });
  });

  describe("Keyboard shortcuts when the editor layer isn't focused", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the shortcuts are working correctly", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const editorSelector = getEditorSelector(0);
          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);

          await page.focus("#editorFreeTextColor");
          await kbUndo(page);

          await page.waitForFunction(
            sel => !document.querySelector(sel),
            {},
            editorSelector
          );

          await kbRedo(page);
          await page.waitForFunction(
            sel => !!document.querySelector(sel),
            {},
            editorSelector
          );
        })
      );
    });
  });

  describe("Move editor with arrows", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check the position of moved editor", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const data = "Hello PDF.js World !!";
          const editorSelector = getEditorSelector(0);
          await page.mouse.click(rect.x + 200, rect.y + 200);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);

          const [pageX, pageY] = await getFirstSerialized(page, x => x.rect);

          await moveEditor(page, editorSelector, 20, () =>
            page.keyboard.press("ArrowRight")
          );

          let [newX, newY] = await getFirstSerialized(page, x => x.rect);
          expect(Math.round(newX))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageX + 20));
          expect(Math.round(newY))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageY));

          await moveEditor(page, editorSelector, 20, () =>
            page.keyboard.press("ArrowDown")
          );

          [newX, newY] = await getFirstSerialized(page, x => x.rect);
          expect(Math.round(newX))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageX + 20));
          expect(Math.round(newY))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageY - 20));

          await moveEditor(page, editorSelector, 2, () => kbBigMoveLeft(page));

          [newX, newY] = await getFirstSerialized(page, x => x.rect);
          expect(Math.round(newX))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageX));
          expect(Math.round(newY))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageY - 20));

          await moveEditor(page, editorSelector, 2, () => kbBigMoveUp(page));

          [newX, newY] = await getFirstSerialized(page, x => x.rect);
          expect(Math.round(newX))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageX));
          expect(Math.round(newY))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageY));
        })
      );
    });

    it("must check arrow doesn't move an editor when a slider is focused", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const data = "Hello PDF.js World !!";
          const editorSelector = getEditorSelector(0);
          await page.mouse.click(rect.x + 200, rect.y + 200);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);

          await selectAll(page);
          await page.focus("#editorFreeTextFontSize");

          const [page1X, , page2X] = await getFirstSerialized(
            page,
            x => x.rect
          );
          const pageWidth = page2X - page1X;

          await moveEditor(page, editorSelector, 5, () =>
            page.keyboard.press("ArrowRight")
          );

          const [new1X, , new2X] = await getFirstSerialized(page, x => x.rect);
          const newWidth = new2X - new1X;
          expect(Math.round(new1X))
            .withContext(`In ${browserName}`)
            .not.toEqual(Math.round(page1X + 5));
          expect(newWidth)
            .withContext(`In ${browserName}`)
            .not.toEqual(pageWidth);
        })
      );
    });

    it("must check the position of an empty freetext", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const data = "Hello PDF.js World !!";
          let editorSelector = getEditorSelector(0);
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);

          const [pageX, pageY] = await getFirstSerialized(page, x => x.rect);

          await clearAll(page);
          editorSelector = getEditorSelector(1);
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });

          await moveEditor(page, editorSelector, 20, () =>
            page.keyboard.press("ArrowRight")
          );

          await moveEditor(page, editorSelector, 2, () => kbBigMoveDown(page));

          await moveEditor(page, editorSelector, 20, () =>
            page.keyboard.press("ArrowLeft")
          );

          await moveEditor(page, editorSelector, 2, () => kbBigMoveUp(page));

          await moveEditor(page, editorSelector, 2, () => kbBigMoveRight(page));

          await moveEditor(page, editorSelector, 2, () => kbBigMoveLeft(page));

          await page.type(`${editorSelector} .internal`, data);
          await commit(page);

          const [newX, newY] = await getFirstSerialized(page, x => x.rect);
          expect(Math.round(newX))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageX));
          expect(Math.round(newY))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageY));
        })
      );
    });
  });

  describe("Focus must go on the current page", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        100,
        {
          eventBusSetup: eventBus => {
            window.visitedPages = [];
            eventBus.on("pagechanging", ({ pageNumber }) => {
              window.visitedPages.push(pageNumber);
            });
          },
        }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the focus is on the right page", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const editorSelector = getEditorSelector(0);
          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await cancelFocusIn(page, editorSelector);
          await commit(page);

          const oneToFourteen = Array.from(new Array(14).keys(), x => x + 1);

          for (const pageNumber of oneToFourteen) {
            const pageSelector = `.page[data-page-number = "${pageNumber}"]`;
            await scrollIntoView(page, pageSelector);
            const annotationLayerSelector = `${pageSelector} > .annotationEditorLayer:not([hidden]).freetextEditing`;
            await page.waitForSelector(annotationLayerSelector, {
              visible: true,
              timeout: 0,
            });
          }

          const visitedPages = await page.evaluate(() => {
            const p = window.visitedPages;
            delete window.visitedPages;
            return p;
          });
          const sorted = visitedPages.slice().sort((a, b) => a - b);

          expect(visitedPages.length)
            .withContext(`In ${browserName}`)
            .not.toEqual(0);
          expect(visitedPages).withContext(`In ${browserName}`).toEqual(sorted);
        })
      );
    });
  });

  describe("Freetext must stay focused after having been moved", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must keep the focus", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          let rect = await getRect(page, ".annotationEditorLayer");

          const firstEditorSelector = getEditorSelector(0);
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(firstEditorSelector, { visible: true });
          await page.type(`${firstEditorSelector} .internal`, "A");
          await commit(page);

          // Create a new editor.
          rect = await getRect(page, firstEditorSelector);
          const secondEditorSelector = getEditorSelector(1);
          await page.mouse.click(
            rect.x + 5 * rect.width,
            rect.y + 5 * rect.height
          );
          await page.waitForSelector(secondEditorSelector, { visible: true });
          await page.type(`${secondEditorSelector} .internal`, "B");
          await commit(page);

          // Select the second editor.
          await selectEditor(page, secondEditorSelector);

          const pos = selector =>
            page.evaluate(sel => {
              const editor = document.querySelector(sel);
              return Array.prototype.indexOf.call(
                editor.parentNode.childNodes,
                editor
              );
            }, selector);

          expect(await pos(firstEditorSelector))
            .withContext(`In ${browserName}`)
            .toEqual(0);
          expect(await pos(secondEditorSelector))
            .withContext(`In ${browserName}`)
            .toEqual(1);

          const { y: y0, height } = await getRect(page, firstEditorSelector);
          const editorSelector = secondEditorSelector;
          while ((await getRect(page, editorSelector)).y > y0 - height) {
            await moveEditor(page, editorSelector, 1, () => kbBigMoveUp(page));
          }

          // The editor must be moved in the DOM and potentially the focus
          // will be lost, hence there's a callback will get back the focus.
          await page.waitForSelector(`${secondEditorSelector}:focus`);

          expect(await pos(firstEditorSelector))
            .withContext(`In ${browserName}`)
            .toEqual(1);
          expect(await pos(secondEditorSelector))
            .withContext(`In ${browserName}`)
            .toEqual(0);
        })
      );
    });
  });

  describe("Move several FreeTexts", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must move several annotations", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const allPositions = [];

          for (let i = 0; i < 10; i++) {
            const editorSelector = getEditorSelector(i);
            await page.mouse.click(rect.x + 10 + 30 * i, rect.y + 100 + 5 * i);
            await page.waitForSelector(editorSelector, { visible: true });
            await page.type(
              `${editorSelector} .internal`,
              String.fromCharCode(65 + i)
            );
            await commit(page);

            allPositions.push(await getRect(page, editorSelector));
          }

          await selectAll(page);
          await dragAndDrop(page, getEditorSelector(4), [[39, 74]]);

          for (let i = 0; i < 10; i++) {
            const editorSelector = getEditorSelector(i);
            const pos = await getRect(page, editorSelector);
            const oldPos = allPositions[i];
            expect(Math.abs(Math.round(pos.x - oldPos.x) - 39))
              .withContext(`In ${browserName}`)
              .toBeLessThanOrEqual(1);
            expect(Math.abs(Math.round(pos.y - oldPos.y) - 74))
              .withContext(`In ${browserName}`)
              .toBeLessThanOrEqual(1);
          }
        })
      );
    });
  });

  describe("Don't unselect all when scrolling", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        100,
        {
          eventBusSetup: eventBus => {
            eventBus.on("annotationeditorstateschanged", ({ details }) => {
              window.editingEvents?.push(details);
            });
          },
        }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that selected editor stay selected", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const editorSelector = getEditorSelector(0);
          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await cancelFocusIn(page, editorSelector);
          await commit(page);

          await page.evaluate(() => {
            window.editingEvents = [];
          });

          for (let pageNumber = 1; pageNumber <= 4; pageNumber++) {
            const pageSelector = `.page[data-page-number = "${pageNumber}"]`;
            await scrollIntoView(page, pageSelector);
            const annotationLayerSelector = `${pageSelector} > .annotationEditorLayer.freetextEditing`;
            await page.waitForSelector(annotationLayerSelector, {
              visible: true,
              timeout: 0,
            });
          }

          const editingEvents = await page.evaluate(() => {
            const e = window.editingEvents;
            delete window.editingEvents;
            return e;
          });
          expect(editingEvents.length)
            .withContext(`In ${browserName}`)
            .toEqual(0);
        })
      );
    });
  });

  describe("FreeText on several pages", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that first annotation is selected without errors", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const page1Selector = `.page[data-page-number = "1"] > .annotationEditorLayer.freetextEditing`;
          let rect = await getRect(page, page1Selector);
          const firstEditorSelector = getEditorSelector(0);
          await page.mouse.click(rect.x + 10, rect.y + 10);
          await page.waitForSelector(firstEditorSelector, { visible: true });
          await page.type(`${firstEditorSelector} .internal`, "Hello");
          await cancelFocusIn(page, firstEditorSelector);
          await commit(page);

          // Unselect.
          await unselectEditor(page, firstEditorSelector);

          // Select the editor created previously.
          await selectEditor(page, firstEditorSelector);

          // Go to the last page.
          await scrollIntoView(page, `.page[data-page-number = "14"]`);

          const page14Selector = `.page[data-page-number = "14"] > .annotationEditorLayer.freetextEditing`;
          await page.waitForSelector(page14Selector, {
            visible: true,
            timeout: 0,
          });

          rect = await getRect(page, page14Selector);
          const secondEditorSelector = getEditorSelector(1);
          await page.mouse.click(rect.x + 10, rect.y + 10);
          await page.waitForSelector(secondEditorSelector, { visible: true });
          await page.type(`${secondEditorSelector} .internal`, "World");
          await commit(page);

          for (let i = 0; i < 13; i++) {
            await page.keyboard.press("P");
            const pageSelector = `.page[data-page-number = "${
              13 - i
            }"] > .annotationEditorLayer.freetextEditing`;
            await page.waitForSelector(pageSelector, {
              visible: true,
              timeout: 0,
            });
          }

          await page.waitForSelector(firstEditorSelector, { visible: true });
          await selectEditor(page, firstEditorSelector);
          const content = await page.$eval(firstEditorSelector, el =>
            el.innerText.trimEnd()
          );
          expect(content).withContext(`In ${browserName}`).toEqual("Hello");
        })
      );
    });
  });

  describe("Deleted FreeText", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that a deleted freetext can be restored", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const page1Selector = `.page[data-page-number = "1"] > .annotationEditorLayer.freetextEditing`;
          const rect = await getRect(page, page1Selector);
          const editorSelector = getEditorSelector(0);
          await page.mouse.click(rect.x + 10, rect.y + 10);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, "Hello");
          await cancelFocusIn(page, editorSelector);
          await commit(page);

          // Unselect.
          await unselectEditor(page, editorSelector);

          // Select the editor created previously.
          await selectEditor(page, editorSelector);

          // Go to the last page.
          await scrollIntoView(page, `.page[data-page-number = "14"]`);
          await page.waitForSelector(
            `.page[data-page-number = "14"] > .annotationEditorLayer.freetextEditing`,
            { visible: true, timeout: 0 }
          );

          await clearAll(page);

          // Go to the first page.
          await kbGoToBegin(page);
          await page.waitForSelector(page1Selector, {
            visible: true,
            timeout: 0,
          });

          // Make sure that nothing has be added.
          await waitForStorageEntries(page, 0);

          await kbUndo(page);
          await waitForSerialized(page, 1);

          await page.waitForSelector(editorSelector, { visible: true });
        })
      );
    });
  });

  describe("FreeText accessibility", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1823296.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the parent structTree id is correct", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const parentId = "p3R_mc8";
          const editorSelector = getEditorSelector(0);
          const rect = await page.evaluate(id => {
            const parent = document.getElementById(id);
            let span = null;
            for (const child of parent.childNodes) {
              if (child.innerText === "000.[5]") {
                span = child;
                break;
              }
            }
            const { x, y, width, height } = span.getBoundingClientRect();
            return { x, y, width, height };
          }, parentId);
          await page.mouse.click(
            rect.x + rect.width + 5,
            rect.y + rect.height / 2
          );
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, "Hello Wolrd");
          await commit(page);

          await waitForStorageEntries(page, 1);

          const id = await getFirstSerialized(page, x => x.structTreeParentId);
          expect(id).withContext(`In ${browserName}`).toEqual(parentId);
        })
      );
    });
  });

  describe("Bug 1854818: mouse events in a selected FreeText editor", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check the text can be selected with the mouse", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const editorSelector = getEditorSelector(0);
          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          const internalEditorSelector = `${editorSelector} .internal`;
          await page.type(internalEditorSelector, data);
          await commit(page);

          await page.click(editorSelector, { count: 2 });
          await page.waitForSelector(
            `${editorSelector} .overlay:not(.enabled)`
          );
          await page.click(internalEditorSelector, {
            count: 3,
          });
          const selection = await page.evaluate(() =>
            document.getSelection().toString()
          );

          expect(selection).withContext(`In ${browserName}`).toEqual(data);
        })
      );
    });
  });

  describe("Create editor with keyboard", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must create an editor, using Enter/Space keys, with focused toolbar button", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.focus("#editorFreeTextButton");
          await page.keyboard.press("Enter");
          let editorSelector = getEditorSelector(0);
          await page.waitForSelector(editorSelector, { visible: true });

          await moveEditor(page, editorSelector, 5, () => kbBigMoveUp(page));

          const data = "Hello PDF.js World !!";
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);

          let content = await page.$eval(editorSelector, el =>
            el.innerText.trimEnd()
          );

          expect(content).withContext(`In ${browserName}`).toEqual(data);

          // Disable editing mode.
          await switchToFreeText(page, /* disable = */ true);

          await page.focus("#editorFreeTextButton");
          await page.keyboard.press(" ");
          editorSelector = getEditorSelector(1);
          await page.waitForSelector(editorSelector, { visible: true });

          await moveEditor(page, editorSelector, 5, () => kbBigMoveDown(page));

          await page.type(`${editorSelector} .internal`, data);
          await commit(page);

          // Unselect.
          await unselectEditor(page, editorSelector);

          content = await page.$eval(editorSelector, el =>
            el.innerText.trimEnd()
          );

          expect(content).withContext(`In ${browserName}`).toEqual(data);
        })
      );
    });

    it("must create an editor, using Enter/Space keys, with focused page", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          await page.focus(".annotationEditorLayer");
          await page.keyboard.press("Enter");
          let editorSelector = getEditorSelector(0);
          await page.waitForSelector(editorSelector, { visible: true });

          await moveEditor(page, editorSelector, 10, () => kbBigMoveLeft(page));

          const data = "Hello PDF.js World !!";
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);

          // Unselect.
          await unselectEditor(page, editorSelector);

          let content = await page.$eval(editorSelector, el =>
            el.innerText.trimEnd()
          );

          expect(content).withContext(`In ${browserName}`).toEqual(data);

          await page.keyboard.press(" ");
          editorSelector = getEditorSelector(1);
          await page.waitForSelector(editorSelector, { visible: true });

          await moveEditor(page, editorSelector, 10, () =>
            kbBigMoveRight(page)
          );

          await page.type(`${editorSelector} .internal`, data);
          await commit(page);

          // Unselect.
          await unselectEditor(page, editorSelector);

          content = await page.$eval(editorSelector, el =>
            el.innerText.trimEnd()
          );

          expect(content).withContext(`In ${browserName}`).toEqual(data);
        })
      );
    });
  });

  describe("Avoid to steal keyboard events", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check the keyboard event is limited to the input", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const editorSelector = getEditorSelector(0);
          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);

          let handle = await createPromise(page, resolve => {
            document.addEventListener("selectionchange", resolve, {
              once: true,
            });
          });
          await page.click("#pageNumber");
          await awaitPromise(handle);

          handle = await createPromise(page, resolve => {
            document
              .getElementById("pageNumber")
              .addEventListener("keyup", resolve, { once: true });
          });
          await page.keyboard.press("Backspace");
          await awaitPromise(handle);

          let content = await page.$eval("#pageNumber", el =>
            el.innerText.trimEnd()
          );
          expect(content).withContext(`In ${browserName}`).toEqual("");

          content = await page.$eval(editorSelector, el =>
            el.innerText.trimEnd()
          );
          expect(content).withContext(`In ${browserName}`).toEqual(data);
        })
      );
    });
  });

  describe("Delete a freetext in using the delete button", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that a freetext is deleted", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const editorSelector = getEditorSelector(0);
          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);

          // Delete it in using the button.
          await page.click(`${editorSelector} button.delete`);
          await page.waitForFunction(
            sel => !document.querySelector(sel),
            {},
            editorSelector
          );
          await waitForStorageEntries(page, 0);

          // Undo.
          await kbUndo(page);
          await waitForSerialized(page, 1);

          await page.waitForSelector(editorSelector, { visible: true });
        })
      );
    });
  });

  describe("Delete two freetexts in using the delete button and the keyboard", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that freetexts are deleted", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const data = "Hello PDF.js World !!";

          for (let i = 1; i <= 2; i++) {
            const editorSelector = getEditorSelector(i - 1);
            await page.mouse.click(rect.x + i * 100, rect.y + i * 100);
            await page.waitForSelector(editorSelector, { visible: true });
            await page.type(`${editorSelector} .internal`, data);
            await commit(page);
          }

          // Select the editor created previously.
          const editorSelector = getEditorSelector(0);
          await selectEditor(page, editorSelector);

          await selectAll(page);

          // Delete it in using the button.
          await page.focus(`${editorSelector} button.delete`);
          await page.keyboard.press("Enter");
          await page.waitForFunction(
            sel => !document.querySelector(sel),
            {},
            editorSelector
          );
          await waitForStorageEntries(page, 0);

          // Undo.
          await kbUndo(page);
          await waitForSerialized(page, 2);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.waitForSelector(getEditorSelector(1), { visible: true });
        })
      );
    });
  });

  describe("Consecutive white spaces in Freetext without appearance", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1871353.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that consecutive white spaces are preserved when a freetext is edited", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const editorSelector = getEditorSelector(0);
          await page.click(editorSelector, { count: 2 });
          await page.type(`${editorSelector} .internal`, "C");

          await switchToFreeText(page, /* disable = */ true);

          const [value] = await getSerialized(page, x => x.value);
          expect(value)
            .withContext(`In ${browserName}`)
            .toEqual("CA          B");
        })
      );
    });
  });

  describe("Consecutive white spaces in Freetext with appearance", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1871353.1.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that consecutive white spaces are preserved when a freetext is edited", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const editorSelector = getEditorSelector(0);
          await page.click(editorSelector, { count: 2 });
          await page.type(`${editorSelector} .internal`, "Z");

          await switchToFreeText(page, /* disable = */ true);

          const [value] = await getSerialized(page, x => x.value);
          expect(value)
            .withContext(`In ${browserName}`)
            .toEqual("ZX          Y");
        })
      );
    });
  });

  describe("Freetext with several lines", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that all lines are correctly exported", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const editorSelector = getEditorSelector(0);
          const data = "Hello\nPDF.js\nWorld\n!!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);

          await waitForSerialized(page, 1);
          const serialized = (await getSerialized(page))[0];
          expect(serialized.value)
            .withContext(`In ${browserName}`)
            .toEqual(data);
        })
      );
    });
  });

  describe("Freetext UI when undoing/redoing", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the parameters are updated when undoing/redoing", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const editorSelector = getEditorSelector(0);
          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);

          await page.evaluate(() => {
            window.PDFViewerApplication.eventBus.dispatch(
              "switchannotationeditorparams",
              {
                source: null,
                type: window.pdfjsLib.AnnotationEditorParamsType.FREETEXT_COLOR,
                value: "#FF0000",
              }
            );
          });
          await page.waitForFunction(
            () =>
              getComputedStyle(
                document.querySelector(".selectedEditor .internal")
              ).color === "rgb(255, 0, 0)"
          );
          await kbUndo(page);
          await page.waitForFunction(
            () =>
              getComputedStyle(
                document.querySelector(".selectedEditor .internal")
              ).color === "rgb(0, 0, 0)"
          );
          await page.waitForFunction(
            () =>
              document.getElementById("editorFreeTextColor").value === "#000000"
          );
          await kbRedo(page);
          await page.waitForFunction(
            () =>
              getComputedStyle(
                document.querySelector(".selectedEditor .internal")
              ).color === "rgb(255, 0, 0)"
          );
          await page.waitForFunction(
            () =>
              document.getElementById("editorFreeTextColor").value === "#ff0000"
          );
        })
      );
    });
  });

  describe("Annotation editor layer visibility", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the annotation layer is visible after a rotation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          for (let i = 0; i < 4; i++) {
            await page.waitForSelector(
              ".page[data-page-number='1'] .annotationEditorLayer:not([hidden])",
              {
                timeout: 0,
              }
            );
            const promise = await waitForAnnotationEditorLayer(page);
            await page.evaluate(() => {
              document.getElementById("pageRotateCw").click();
            });
            await awaitPromise(promise);
          }
        })
      );
    });
  });

  describe("Delete a freetext and undo it on another page", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that a freetext can be undone", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const editorSelector = getEditorSelector(0);
          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);
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

  describe("Delete a freetext, scroll and undo it", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that a freetext can be undone", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const editorSelector = getEditorSelector(0);
          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);
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

  describe("Paste some html", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that pasting html just keep the text", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [browserName, page] of pages) {
        await switchToFreeText(page);

        const rect = await getRect(page, ".annotationEditorLayer");

        let editorSelector = getEditorSelector(0);
        const data = "Hello PDF.js World !!";
        await page.mouse.click(rect.x + 100, rect.y + 100);
        await page.waitForSelector(editorSelector, { visible: true });
        await page.type(`${editorSelector} .internal`, data);
        await commit(page);

        const waitForTextChange = (previous, edSelector) =>
          page.waitForFunction(
            (prev, sel) => document.querySelector(sel).innerText !== prev,
            {},
            previous,
            `${edSelector} .internal`
          );
        const getText = edSelector =>
          page.$eval(`${edSelector} .internal`, el => el.innerText.trimEnd());

        await selectEditor(page, editorSelector, /* count = */ 2);

        const select = position =>
          page.evaluate(
            (sel, pos) => {
              const el = document.querySelector(sel);
              document.getSelection().setPosition(el.firstChild, pos);
            },
            `${editorSelector} .internal`,
            position
          );

        await select(0);
        await copyToClipboard(page, {
          "text/html": "<b>Bold Foo</b>",
          "text/plain": "Foo",
        });
        await pasteFromClipboard(page, `${editorSelector} .internal`);

        let lastText = data;

        await waitForTextChange(lastText, editorSelector);
        let text = await getText(editorSelector);
        lastText = `Foo${data}`;
        expect(text).withContext(`In ${browserName}`).toEqual(lastText);

        await select(3);
        await copyToClipboard(page, {
          "text/html": "<b>Bold Bar</b><br><b>Oof</b>",
          "text/plain": "Bar\nOof",
        });
        await pasteFromClipboard(page, `${editorSelector} .internal`);

        await waitForTextChange(lastText, editorSelector);
        text = await getText(editorSelector);
        lastText = `FooBar\nOof${data}`;
        expect(text).withContext(`In ${browserName}`).toEqual(lastText);

        await select(0);
        await copyToClipboard(page, { "text/html": "<b>basic html</b>" });
        await pasteFromClipboard(page, `${editorSelector} .internal`);

        // Nothing should change, so it's hard to wait on something.
        // eslint-disable-next-line no-restricted-syntax
        await waitForTimeout(100);

        text = await getText(editorSelector);
        expect(text).withContext(`In ${browserName}`).toEqual(lastText);

        const getHTML = () =>
          page.$eval(`${editorSelector} .internal`, el => el.innerHTML);
        const prevHTML = await getHTML();

        // Try to paste an image.
        await copyToClipboard(page, {
          "image/png":
            // 1x1 transparent png.
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        });
        await pasteFromClipboard(page, `${editorSelector} .internal`);

        // Nothing should change, so it's hard to wait on something.
        // eslint-disable-next-line no-restricted-syntax
        await waitForTimeout(100);

        const html = await getHTML();
        expect(html).withContext(`In ${browserName}`).toEqual(prevHTML);

        await commit(page);

        editorSelector = getEditorSelector(1);
        await page.mouse.click(rect.x + 200, rect.y + 200);
        await page.waitForSelector(editorSelector, { visible: true });

        const fooBar = "Foo\nBar\nOof";
        await copyToClipboard(page, {
          "text/html": "<b>html</b>",
          "text/plain": fooBar,
        });
        await pasteFromClipboard(page, `${editorSelector} .internal`);

        await waitForTextChange("", editorSelector);
        text = await getText(editorSelector);
        expect(text).withContext(`In ${browserName}`).toEqual(fooBar);
      }
    });
  });

  describe("Update a freetext and scroll", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey_freetext.pdf",
        ".annotationEditorLayer"
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that a freetext is still there after having updated it and scroll the doc", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const editorSelector = getEditorSelector(0);
          const editorRect = await getRect(page, editorSelector);
          await selectEditor(page, editorSelector, /* count = */ 2);
          await kbGoToEnd(page);
          await page.waitForFunction(
            sel =>
              document.getSelection().anchorOffset ===
              document.querySelector(sel).innerText.length,
            {},
            `${editorSelector} .internal`
          );

          await page.type(
            `${editorSelector} .internal`,
            " and edited in Firefox"
          );

          // Disable editing mode.
          await switchToFreeText(page, /* disable = */ true);

          const oneToOne = Array.from(new Array(13).keys(), n => n + 2).concat(
            Array.from(new Array(13).keys(), n => 13 - n)
          );
          for (const pageNumber of oneToOne) {
            await scrollIntoView(
              page,
              `.page[data-page-number = "${pageNumber}"]`
            );
          }

          // Check we've now a div containing the text.
          await page.waitForSelector(
            "[data-annotation-id='998R'] div.annotationContent"
          );
          const newDivText = await page.$eval(
            "[data-annotation-id='998R'] div.annotationContent",
            el => el.innerText.replaceAll("\xa0", " ")
          );
          expect(newDivText)
            .withContext(`In ${browserName}`)
            .toEqual("Hello World and edited in Firefox");

          // Check that the canvas has nothing drawn at the annotation position.
          await page.$eval(
            "[data-annotation-id='998R']",
            el => (el.hidden = true)
          );
          let editorPng = await page.screenshot({
            clip: editorRect,
            type: "png",
          });
          await page.$eval(
            "[data-annotation-id='998R']",
            el => (el.hidden = false)
          );
          let editorImage = PNG.sync.read(Buffer.from(editorPng));
          expect(editorImage.data.every(x => x === 0xff))
            .withContext(`In ${browserName}`)
            .toBeTrue();

          const oneToThirteen = Array.from(new Array(13).keys(), n => n + 2);
          for (const pageNumber of oneToThirteen) {
            await scrollIntoView(
              page,
              `.page[data-page-number = "${pageNumber}"]`
            );
          }

          await switchToFreeText(page);
          await kbUndo(page);
          await waitForSerialized(page, 0);

          // Disable editing mode.
          await switchToFreeText(page, /* disable = */ true);

          const thirteenToOne = Array.from(new Array(13).keys(), n => 13 - n);
          const handlePromise = await createPromise(page, resolve => {
            const callback = e => {
              if (e.source.id === 1) {
                window.PDFViewerApplication.eventBus.off(
                  "pagerendered",
                  callback
                );
                resolve();
              }
            };
            window.PDFViewerApplication.eventBus.on("pagerendered", callback);
          });

          for (const pageNumber of thirteenToOne) {
            await scrollIntoView(
              page,
              `.page[data-page-number = "${pageNumber}"]`
            );
          }

          await awaitPromise(handlePromise);

          editorPng = await page.screenshot({
            clip: editorRect,
            type: "png",
          });
          editorImage = PNG.sync.read(Buffer.from(editorPng));
          expect(editorImage.data.every(x => x === 0xff))
            .withContext(`In ${browserName}`)
            .toBeFalse();
        })
      );
    });
  });

  describe("Freetext and shift+enter", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that a freetext has the correct data", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const editorSelector = getEditorSelector(0);

          const data = "Hello\nPDF.js\nWorld\n!!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          for (const line of data.split("\n")) {
            await page.type(`${editorSelector} .internal`, line);
            await page.keyboard.down("Shift");
            await page.keyboard.press("Enter");
            await page.keyboard.up("Shift");
          }
          await commit(page);
          await waitForSerialized(page, 1);

          const serialized = await getSerialized(page, x => x.value);
          expect(serialized[0]).withContext(`In ${browserName}`).toEqual(data);
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

    it("must check that deleting a FreeText editor can be undone using the undo button", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);
          await waitForSerialized(page, 1);

          await page.waitForSelector(`${editorSelector} button.delete`);
          await page.click(`${editorSelector} button.delete`);
          await waitForSerialized(page, 0);
          await page.waitForSelector("#editorUndoBar", { visible: true });

          await page.waitForSelector("#editorUndoBarUndoButton", {
            visible: true,
          });
          await page.click("#editorUndoBarUndoButton");
          await waitForSerialized(page, 1);
          await page.waitForSelector(editorSelector);
        })
      );
    });

    it("must check that the undo deletion popup displays the correct message", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);
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
          expect(messageText).toContain("Text removed");
        })
      );
    });

    it("must check that the popup disappears when a new textbox is created", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          let rect = await getRect(page, ".annotationEditorLayer");
          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);
          await waitForSerialized(page, 1);

          await page.waitForSelector(`${editorSelector} button.delete`);
          await page.click(`${editorSelector} button.delete`);
          await waitForSerialized(page, 0);

          await page.waitForSelector("#editorUndoBar", { visible: true });
          rect = await getRect(page, ".annotationEditorLayer");
          const secondEditorSelector = getEditorSelector(1);
          const newData = "This is a new text box!";
          await page.mouse.click(rect.x + 150, rect.y + 150);
          await page.waitForSelector(secondEditorSelector, { visible: true });
          await page.type(`${secondEditorSelector} .internal`, newData);
          await commit(page);
          await waitForSerialized(page, 1);
          await page.waitForSelector("#editorUndoBar", { hidden: true });
        })
      );
    });
  });

  describe("Freetext and text alignment", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the alignment is correct", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const editorSelector = getEditorSelector(0);

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);
          await waitForSerialized(page, 1);

          let alignment = await page.$eval(
            `${editorSelector} .internal`,
            el => getComputedStyle(el).textAlign
          );
          expect(alignment).withContext(`In ${browserName}`).toEqual("start");

          await page.click("#secondaryToolbarToggleButton");
          await page.waitForSelector("#secondaryToolbar", { visible: true });
          await page.click("#spreadOdd");
          await page.waitForSelector("#secondaryToolbar", { visible: false });
          await page.waitForSelector(".spread");

          alignment = await page.$eval(
            `${editorSelector} .internal`,
            el => getComputedStyle(el).textAlign
          );
          expect(alignment).withContext(`In ${browserName}`).toEqual("start");
        })
      );
    });
  });

  describe("Edit added Freetext annotation", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that an added Freetext can be edited in double clicking on it", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const editorSelector = getEditorSelector(0);

          const data = "Hello PDF.js World !!";
          await page.mouse.click(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2
          );
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);
          await waitForSerialized(page, 1);

          await switchToFreeText(page, /* disable */ true);

          const modeChangedHandle = await createPromise(page, resolve => {
            window.PDFViewerApplication.eventBus.on(
              "annotationeditormodechanged",
              resolve,
              { once: true }
            );
          });
          const editorRect = await getRect(page, editorSelector);
          await page.mouse.click(
            editorRect.x + editorRect.width / 2,
            editorRect.y + editorRect.height / 2,
            { count: 2 }
          );

          await page.waitForSelector(".annotationEditorLayer.freetextEditing");
          await awaitPromise(modeChangedHandle);
        })
      );
    });

    it("must check that we switch to FreeText in clicking on a FreeText annotation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const editorSelector = getEditorSelector(0);

          const data = "Hello PDF.js World !!";
          await page.mouse.click(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2
          );
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);
          await waitForSerialized(page, 1);

          await switchToFreeText(page, /* disable */ true);
          await switchToEditor("Ink", page);

          const x = rect.x + 100;
          const y = rect.y + 100;
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + 50, y + 50);
          await page.mouse.up();
          await awaitPromise(clickHandle);
          await page.keyboard.press("Escape");
          await page.waitForSelector(
            ".inkEditor.selectedEditor.draggable.disabled"
          );
          await waitForSerialized(page, 2);

          const modeChangedHandle = await createPromise(page, resolve => {
            window.PDFViewerApplication.eventBus.on(
              "annotationeditormodechanged",
              resolve,
              { once: true }
            );
          });
          const editorRect = await getRect(page, editorSelector);
          await page.mouse.click(
            editorRect.x + editorRect.width / 2,
            editorRect.y + editorRect.height / 2
          );
          await page.waitForSelector(".annotationEditorLayer.freetextEditing");
          await awaitPromise(modeChangedHandle);
        })
      );
    });
  });

  describe("FreeText must update its color", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the text color is the one chosen from the color picker", async () => {
      await Promise.all(
        pages.map(async ([_, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");
          const editorSelector = getEditorSelector(0);
          const data = "Hello PDF.js World !!";
          await page.mouse.click(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2
          );
          await page.waitForSelector(editorSelector, { visible: true });
          await page.type(`${editorSelector} .internal`, data);
          await commit(page);

          const colorPickerSelector = `${editorSelector} input.basicColorPicker`;
          await page.waitForSelector(colorPickerSelector, { visible: true });
          await page.locator(colorPickerSelector).fill("#ff0000");

          await page.waitForFunction(
            sel => {
              const el = document.querySelector(sel);
              return getComputedStyle(el).color === "rgb(255, 0, 0)";
            },
            {},
            `${editorSelector} .internal`
          );
        })
      );
    });
  });
});
