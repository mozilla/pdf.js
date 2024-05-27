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
  dragAndDropAnnotation,
  firstPageOnTop,
  getEditors,
  getEditorSelector,
  getFirstSerialized,
  getRect,
  getSelectedEditors,
  getSerialized,
  hover,
  kbBigMoveDown,
  kbBigMoveLeft,
  kbBigMoveRight,
  kbBigMoveUp,
  kbCopy,
  kbGoToBegin,
  kbGoToEnd,
  kbModifierDown,
  kbModifierUp,
  kbPaste,
  kbRedo,
  kbSelectAll,
  kbUndo,
  loadAndWait,
  pasteFromClipboard,
  scrollIntoView,
  switchToEditor,
  waitForAnnotationEditorLayer,
  waitForEvent,
  waitForSelectedEditor,
  waitForSerialized,
  waitForStorageEntries,
  waitForTimeout,
  waitForUnselectedEditor,
} from "./test_utils.mjs";
import { PNG } from "pngjs";

const copyPaste = async page => {
  let promise = waitForEvent(page, "copy");
  await kbCopy(page);
  await promise;

  promise = waitForEvent(page, "paste");
  await kbPaste(page);
  await promise;
};

const selectAll = async page => {
  await kbSelectAll(page);
  await page.waitForFunction(
    () => !document.querySelector(".freeTextEditor:not(.selectedEditor)")
  );
};

const clearAll = async page => {
  await selectAll(page);
  await page.keyboard.down("Control");
  await page.keyboard.press("Backspace");
  await page.keyboard.up("Control");
  await waitForStorageEntries(page, 0);
};

const switchToFreeText = switchToEditor.bind(null, "FreeText");

const getXY = async (page, selector) => {
  const rect = await getRect(page, selector);
  return `${rect.x}::${rect.y}`;
};

const waitForPositionChange = (page, selector, xy) =>
  page.waitForFunction(
    (sel, currentXY) => {
      const bbox = document.querySelector(sel).getBoundingClientRect();
      return `${bbox.x}::${bbox.y}` !== currentXY;
    },
    {},
    selector,
    xy
  );

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

    beforeAll(async () => {
      pages = await loadAndWait("aboutstacks.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must write a string in a FreeText editor", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(getEditorSelector(0), {
            visible: true,
          });
          await page.type(`${getEditorSelector(0)} .internal`, data);

          const editorRect = await getRect(page, getEditorSelector(0));

          // Commit.
          await page.mouse.click(
            editorRect.x,
            editorRect.y + 2 * editorRect.height
          );
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay.enabled`
          );

          await waitForSelectedEditor(page, getEditorSelector(0));
          await waitForStorageEntries(page, 1);

          let content = await page.$eval(getEditorSelector(0), el =>
            el.innerText.trimEnd()
          );
          expect(content).withContext(`In ${browserName}`).toEqual(data);

          // Edit again.
          await page.keyboard.press("Enter");
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay:not(.enabled)`
          );

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay.enabled`
          );

          content = await page.$eval(getEditorSelector(0), el =>
            el.innerText.trimEnd()
          );
          expect(content).withContext(`In ${browserName}`).toEqual(data);
        })
      );
    });

    it("must copy/paste", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [browserName, page] of pages) {
        const editorRect = await getRect(page, getEditorSelector(0));

        // Select the editor created previously.
        await page.mouse.click(
          editorRect.x + editorRect.width / 2,
          editorRect.y + editorRect.height / 2
        );

        await waitForSelectedEditor(page, getEditorSelector(0));
        await copyPaste(page);
        await page.waitForSelector(getEditorSelector(1), {
          visible: true,
        });
        await waitForStorageEntries(page, 2);

        const content = await page.$eval(getEditorSelector(0), el =>
          el.innerText.trimEnd().replaceAll("\xa0", " ")
        );

        let pastedContent = await page.$eval(getEditorSelector(1), el =>
          el.innerText.trimEnd().replaceAll("\xa0", " ")
        );

        expect(pastedContent).withContext(`In ${browserName}`).toEqual(content);

        await copyPaste(page);
        await page.waitForSelector(getEditorSelector(2), {
          visible: true,
        });
        await waitForStorageEntries(page, 3);

        pastedContent = await page.$eval(getEditorSelector(2), el =>
          el.innerText.trimEnd().replaceAll("\xa0", " ")
        );
        expect(pastedContent).withContext(`In ${browserName}`).toEqual(content);
      }
    });

    it("must clear all", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await clearAll(page);

          for (const n of [0, 1, 2]) {
            const hasEditor = await page.evaluate(
              sel => !!document.querySelector(sel),
              getEditorSelector(n)
            );

            expect(hasEditor).withContext(`In ${browserName}`).toEqual(false);
          }

          await waitForStorageEntries(page, 0);
        })
      );
    });

    it("must check that a paste has been undone", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [, page] of pages) {
        const rect = await getRect(page, ".annotationEditorLayer");

        const data = "Hello PDF.js World !!";
        await page.mouse.click(rect.x + 100, rect.y + 100);
        await page.waitForSelector(getEditorSelector(3), {
          visible: true,
        });
        await page.type(`${getEditorSelector(3)} .internal`, data);

        const editorRect = await getRect(page, getEditorSelector(3));

        // Commit.
        await page.mouse.click(
          editorRect.x,
          editorRect.y + 2 * editorRect.height
        );
        await page.waitForSelector(`${getEditorSelector(3)} .overlay.enabled`);

        // And select it again.
        await page.mouse.click(
          editorRect.x + editorRect.width / 2,
          editorRect.y + editorRect.height / 2
        );

        await waitForSelectedEditor(page, getEditorSelector(3));
        await copyPaste(page);
        await page.waitForSelector(getEditorSelector(4), {
          visible: true,
        });

        await kbUndo(page);
        await page.waitForFunction(
          sel => !document.querySelector(sel),
          {},
          getEditorSelector(4)
        );

        for (let i = 0; i < 2; i++) {
          const promise = waitForEvent(page, "paste");
          await kbPaste(page);
          await promise;
          await page.waitForSelector(getEditorSelector(5 + i));
        }

        for (let i = 0; i < 2; i++) {
          await kbUndo(page);
          await page.waitForFunction(
            sel => !document.querySelector(sel),
            {},
            getEditorSelector(6 - i)
          );
        }
      }
    });

    it("must check that aria-owns is correct", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
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

          const data = "Hello PDF.js World !!";
          await page.mouse.click(
            stacksRect.x + stacksRect.width + 1,
            stacksRect.y + stacksRect.height / 2
          );
          await page.waitForSelector(getEditorSelector(7), {
            visible: true,
          });
          await page.type(`${getEditorSelector(7)} .internal`, data);

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForSelector(
            `${getEditorSelector(7)} .overlay.enabled`
          );

          const ariaOwns = await page.$eval(".textLayer", el => {
            const span = el.querySelector(`span[pdfjs="true"]`);
            return span?.getAttribute("aria-owns") || null;
          });

          expect(ariaOwns.endsWith("_7-editor"))
            .withContext(`In ${browserName}`)
            .toEqual(true);
          await scrollIntoView(page, ".annotationEditorLayer");
        })
      );
    });

    it("must check that right click doesn't select", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const rect = await getRect(page, ".annotationEditorLayer");

          await clearAll(page);

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(getEditorSelector(8), {
            visible: true,
          });
          await page.type(`${getEditorSelector(8)} .internal`, data);

          const editorRect = await getRect(page, getEditorSelector(8));

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForSelector(
            `${getEditorSelector(8)} .overlay.enabled`
          );

          expect(await getSelectedEditors(page))
            .withContext(`In ${browserName}`)
            .toEqual([8]);

          await page.keyboard.press("Escape");
          await page.waitForFunction(
            () => !document.querySelector(".selectedEditor")
          );

          await page.mouse.click(
            editorRect.x + editorRect.width / 2,
            editorRect.y + editorRect.height / 2
          );

          await waitForSelectedEditor(page, getEditorSelector(8));

          expect(await getSelectedEditors(page))
            .withContext(`In ${browserName}`)
            .toEqual([8]);

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
        const rect = await getRect(page, ".annotationEditorLayer");

        await clearAll(page);

        const editorSelector = getEditorSelector(9);
        await page.mouse.click(rect.x + 200, rect.y + 100);
        await page.waitForSelector(editorSelector, {
          visible: true,
        });

        for (let i = 0; i < 5; i++) {
          await page.type(`${editorSelector} .internal`, "A");

          const editorRect = await getRect(page, editorSelector);

          // Commit.
          await page.mouse.click(
            editorRect.x + 1.5 * editorRect.width,
            editorRect.y
          );
          await page.waitForSelector(`${editorSelector} .overlay.enabled`);

          if (i < 4) {
            // And select it again.
            await page.mouse.click(
              editorRect.x + editorRect.width / 2,
              editorRect.y + editorRect.height / 2,
              { count: 2 }
            );
            await page.waitForSelector(
              `${editorSelector} .overlay:not(.enabled)`
            );
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
        await page.waitForSelector(editorSelector, {
          visible: true,
        });

        text = await getText();
        expect(text).withContext(`In ${browserName}`).toEqual("A");

        // Add a new A.
        let editorRect = await getRect(page, editorSelector);
        await page.mouse.click(
          editorRect.x + editorRect.width / 2,
          editorRect.y + editorRect.height / 2,
          { count: 2 }
        );
        await page.waitForSelector(`${editorSelector} .overlay:not(.enabled)`);
        await page.type(`${editorSelector} .internal`, "A");

        editorRect = await getRect(page, editorSelector);

        // Commit.
        await page.mouse.click(
          editorRect.x + 1.5 * editorRect.width,
          editorRect.y
        );
        await page.waitForSelector(`${editorSelector} .overlay.enabled`);

        text = await getText();
        expect(text).withContext(`In ${browserName}`).toEqual("AA");
      }
    });
  });

  describe("FreeText (multiselection)", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("aboutstacks.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
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
          const data = `FreeText ${i}`;
          await page.mouse.click(lastX, rect.y + rect.height / 10);
          await page.waitForSelector(getEditorSelector(i), {
            visible: true,
          });
          await page.type(`${getEditorSelector(i)} .internal`, data);

          const editorRect = await getRect(page, getEditorSelector(i));
          lastX = editorRect.x + editorRect.width + 10;
          editorCenters.push({
            x: editorRect.x + editorRect.width / 2,
            y: editorRect.y + editorRect.height / 2,
          });

          // Commit.
          await page.mouse.click(
            editorRect.x + 1.5 * editorRect.width,
            editorRect.y
          );
          await page.waitForSelector(
            `${getEditorSelector(i)} .overlay.enabled`
          );
        }

        await selectAll(page);

        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([0, 1, 2, 3]);

        // Unselect the editor.
        await kbModifierDown(page);
        await page.mouse.click(editorCenters[1].x, editorCenters[1].y);
        await waitForUnselectedEditor(page, getEditorSelector(1));

        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([0, 2, 3]);

        await page.mouse.click(editorCenters[2].x, editorCenters[2].y);
        await waitForUnselectedEditor(page, getEditorSelector(2));

        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([0, 3]);

        await page.mouse.click(editorCenters[1].x, editorCenters[1].y);
        await kbModifierUp(page);
        await waitForSelectedEditor(page, getEditorSelector(1));

        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([0, 1, 3]);

        await copyPaste(page);
        await page.waitForSelector(getEditorSelector(6), {
          visible: true,
        });

        // 0,1,3 are unselected and new pasted editors are selected.
        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([4, 5, 6]);

        // No ctrl here, hence all are unselected and 2 is selected.
        await page.mouse.click(editorCenters[2].x, editorCenters[2].y);
        await waitForSelectedEditor(page, getEditorSelector(2));
        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([2]);

        await page.mouse.click(editorCenters[1].x, editorCenters[1].y);
        await waitForSelectedEditor(page, getEditorSelector(1));
        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([1]);

        await kbModifierDown(page);

        await page.mouse.click(editorCenters[3].x, editorCenters[3].y);
        await waitForSelectedEditor(page, getEditorSelector(3));
        expect(await getSelectedEditors(page))
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

        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([0, 2, 4, 5, 6]);

        // Create an empty editor.
        await page.mouse.click(
          rect.x + (rect.width / 10) * 7,
          rect.y + rect.height / 10
        );
        await page.waitForSelector(getEditorSelector(7), {
          visible: true,
        });
        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([7]);

        // Set the focus to 2 and check that only 2 is selected.
        await page.mouse.click(editorCenters[2].x, editorCenters[2].y);
        await waitForSelectedEditor(page, getEditorSelector(2));
        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([2]);

        // Create an empty editor.
        await page.mouse.click(
          rect.x + (rect.width / 10) * 8,
          rect.y + rect.height / 10
        );
        await page.waitForSelector(getEditorSelector(8), {
          visible: true,
        });
        expect(await getSelectedEditors(page))
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
        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([0, 2, 4, 5, 6]);
      }
    });
  });

  describe("FreeText (bugs)", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
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

            const data = `Hello PDF.js World !! on page ${pageNumber}`;
            expected.push(data);
            await page.mouse.click(rect.x + 100, rect.y + 100);
            await page.waitForSelector(getEditorSelector(currentId), {
              visible: true,
            });
            await page.type(`${getEditorSelector(currentId)} .internal`, data);

            // Commit.
            await page.keyboard.press("Escape");
            await page.waitForSelector(
              `${getEditorSelector(currentId)} .overlay.enabled`
            );

            await waitForSelectedEditor(page, getEditorSelector(currentId));
            await waitForStorageEntries(page, currentId + 1);

            const content = await page.$eval(getEditorSelector(currentId), el =>
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

          page.evaluate(() => {
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

    beforeAll(async () => {
      pages = await loadAndWait("issue15789.pdf", ".annotationEditorLayer");
      pages = await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.select("#scaleSelect", "1");
          return [browserName, page];
        })
      );
    });

    afterAll(async () => {
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

            const data = `Hello ${step}`;
            const x = Math.max(rect.x + 0.1 * rect.width, 10);
            const y = Math.max(rect.y + 0.1 * rect.height, 10);
            await page.mouse.click(x, y);
            await page.waitForSelector(getEditorSelector(currentId), {
              visible: true,
            });
            await page.type(`${getEditorSelector(currentId)} .internal`, data);

            // Commit.
            await page.keyboard.press("Escape");
            await page.waitForSelector(
              `${getEditorSelector(currentId)} .overlay.enabled`
            );

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

    beforeAll(async () => {
      pages = await loadAndWait("freetexts.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
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

          const editorRect = await getRect(page, getEditorSelector(0));

          // Select the annotation we want to move.
          await page.mouse.click(editorRect.x + 2, editorRect.y + 2);
          await waitForSelectedEditor(page, getEditorSelector(0));

          await dragAndDropAnnotation(
            page,
            editorRect.x + editorRect.width / 2,
            editorRect.y + editorRect.height / 2,
            100,
            100
          );
          await waitForSerialized(page, 1);
        })
      );
    });
  });

  describe("FreeText (update existing)", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("freetexts.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must update an existing annotation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          let editorIds = await getEditors(page, "freeText");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(6);

          const editorRect = await getRect(page, getEditorSelector(0));
          await page.mouse.click(
            editorRect.x + editorRect.width / 2,
            editorRect.y + editorRect.height / 2,
            { count: 2 }
          );
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay:not(.enabled)`
          );

          await kbGoToEnd(page);
          await page.waitForFunction(
            sel =>
              document.getSelection().anchorOffset ===
              document.querySelector(sel).innerText.length,
            {},
            `${getEditorSelector(0)} .internal`
          );

          await page.type(
            `${getEditorSelector(0)} .internal`,
            " and edited in Firefox"
          );

          // Commit.
          await page.mouse.click(
            editorRect.x,
            editorRect.y + 2 * editorRect.height
          );
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay.enabled`
          );

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
          const hidden = await page.$eval(
            "[data-annotation-id='26R'] canvas",
            el => getComputedStyle(el).display === "none"
          );
          expect(hidden).withContext(`In ${browserName}`).toBeTrue();

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

    beforeAll(async () => {
      pages = await loadAndWait("freetexts.pdf", "[data-annotation-id='32R']");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must update an existing annotation and show the right popup", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // Show the popup on "Hello World from Firefox"
          await page.click(`[data-annotation-id='32R']`);
          await page.waitForSelector(`[data-annotation-id='popup_32R']`, {
            visible: true,
          });

          await switchToFreeText(page);
          await page.waitForSelector(`[data-annotation-id='popup_32R']`, {
            visible: false,
          });

          const editorSelector = getEditorSelector(1);
          const editorRect = await getRect(page, editorSelector);
          await page.mouse.click(
            editorRect.x + editorRect.width / 2,
            editorRect.y + editorRect.height / 2,
            { count: 2 }
          );
          await page.waitForSelector(
            `${editorSelector} .overlay:not(.enabled)`
          );

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

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForSelector(`${editorSelector} .overlay.enabled`);

          // Disable editing mode.
          await switchToFreeText(page, /* disable = */ true);

          await page.waitForSelector(`[data-annotation-id='popup_32R']`, {
            visible: true,
          });

          const newPopupText = await page.$eval(
            "[data-annotation-id='popup_32R'] .popupContent",
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

    beforeAll(async () => {
      pages = await loadAndWait("issue14438.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
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

    beforeAll(async () => {
      pages = await loadAndWait("freetexts.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must delete an existing annotation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          let editorIds = await getEditors(page, "freeText");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(6);

          const editorRect = await getRect(page, getEditorSelector(3));
          await page.mouse.click(
            editorRect.x + editorRect.width / 2,
            editorRect.y + editorRect.height / 2
          );
          await waitForSelectedEditor(page, getEditorSelector(3));
          await page.keyboard.press("Backspace");
          await page.waitForFunction(
            sel => !document.querySelector(sel),
            {},
            getEditorSelector(3)
          );

          const serialized = await getSerialized(page);
          expect(serialized).toEqual([
            {
              pageIndex: 0,
              id: "51R",
              deleted: true,
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
  });

  describe("FreeText (copy/paste existing)", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("freetexts.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must copy and paste an existing annotation", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [browserName, page] of pages) {
        await switchToFreeText(page);

        const editorIds = await getEditors(page, "freeText");
        expect(editorIds.length).withContext(`In ${browserName}`).toEqual(6);

        const editorRect = await getRect(page, getEditorSelector(1));
        await page.mouse.click(
          editorRect.x + editorRect.width / 2,
          editorRect.y + editorRect.height / 2
        );
        await waitForSelectedEditor(page, getEditorSelector(1));

        await copyPaste(page);
        await page.waitForSelector(getEditorSelector(6), {
          visible: true,
        });
        await waitForStorageEntries(page, 7);
      }
    });
  });

  describe("FreeText (edit existing in double clicking on it)", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("freetexts.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must move an annotation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("[data-annotation-id='26R']", { count: 2 });
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

    beforeAll(async () => {
      pages = await loadAndWait(
        "annotation-freetext.pdf",
        ".annotationEditorLayer"
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must not remove an empty annotation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.waitForSelector("[data-annotation-id='23R']");
          // Cannot use page.hover with Firefox on Mac because of a bug.
          // TODO: remove this when we switch to BiDi.
          await hover(page, "[data-annotation-id='23R']");

          // Wait for the popup to be displayed.
          await page.waitForFunction(
            () =>
              document.querySelector("[data-annotation-id='popup_23R']")
                .hidden === false
          );

          // Enter in editing mode.
          await switchToFreeText(page);

          // Disable editing mode.
          await switchToFreeText(page, /* disable = */ true);

          // TODO: remove this when we switch to BiDi.
          await hover(page, "[data-annotation-id='23R']");
          // Wait for the popup to be displayed.
          await page.waitForFunction(
            () =>
              document.querySelector("[data-annotation-id='popup_23R']")
                .hidden === false
          );
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

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
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

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(getEditorSelector(0), {
            visible: true,
          });
          await page.type(`${getEditorSelector(0)} .internal`, data);

          const editorRect = await getRect(page, getEditorSelector(0));

          // Commit.
          await page.mouse.click(
            editorRect.x,
            editorRect.y + 2 * editorRect.height
          );
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay.enabled`
          );

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

          page.evaluate(() => {
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

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
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

            const data = `Hello PDF.js World !! on page ${pageNumber}`;
            await page.mouse.click(rect.x + 100, rect.y + 100);
            await page.waitForSelector(getEditorSelector(currentId), {
              visible: true,
            });
            await page.type(`${getEditorSelector(currentId)} .internal`, data);

            // Commit.
            await page.keyboard.press("Escape");
            await page.waitForSelector(
              `${getEditorSelector(currentId)} .overlay.enabled`
            );

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

    beforeAll(async () => {
      pages = await loadAndWait("issue16633.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must open an existing annotation and check that the position are good", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          await page.evaluate(() => {
            document.getElementById("editorFreeTextParamsToolbar").remove();
          });

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

          for (const n of [0, 1, 2, 3, 4]) {
            const rect = await getRect(page, getEditorSelector(n));
            const editorPng = await page.screenshot({
              clip: rect,
              type: "png",
            });
            const editorImage = PNG.sync.read(editorPng);
            const editorFirstPix = getFirstPixel(
              editorImage.data,
              editorImage.width,
              editorImage.height
            );

            const annotationId = await page.evaluate(N => {
              const editor = document.getElementById(
                `pdfjs_internal_editor_${N}`
              );
              const annId = editor.getAttribute("annotation-id");
              const annotation = document.querySelector(
                `[data-annotation-id="${annId}"]`
              );
              editor.hidden = true;
              annotation.hidden = false;
              return annId;
            }, n);
            await page.waitForSelector(`${getEditorSelector(n)}[hidden]`);
            await page.waitForSelector(
              `[data-annotation-id="${annotationId}"]:not([hidden])`
            );

            const annotationPng = await page.screenshot({
              clip: rect,
              type: "png",
            });
            const annotationImage = PNG.sync.read(annotationPng);
            const annotationFirstPix = getFirstPixel(
              annotationImage.data,
              annotationImage.width,
              annotationImage.height
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

    beforeAll(async () => {
      pages = await loadAndWait(
        "rotated_freetexts.pdf",
        ".annotationEditorLayer",
        100
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must open an existing rotated annotation and check that the position are good", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          await page.evaluate(() => {
            document.getElementById("editorFreeTextParamsToolbar").remove();
          });

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

          for (const [n, start] of [
            [0, "BL"],
            [1, "BR"],
            [2, "TR"],
            [3, "TL"],
          ]) {
            const rect = await getRect(page, getEditorSelector(n));
            const editorPng = await page.screenshot({
              clip: rect,
              type: "png",
            });
            const editorImage = PNG.sync.read(editorPng);
            const editorFirstPix = getFirstPixel(
              editorImage.data,
              editorImage.width,
              editorImage.height,
              start
            );

            const annotationId = await page.evaluate(N => {
              const editor = document.getElementById(
                `pdfjs_internal_editor_${N}`
              );
              const annId = editor.getAttribute("annotation-id");
              const annotation = document.querySelector(
                `[data-annotation-id="${annId}"]`
              );
              editor.hidden = true;
              annotation.hidden = false;
              return annId;
            }, n);
            await page.waitForSelector(`${getEditorSelector(n)}[hidden]`);
            await page.waitForSelector(
              `[data-annotation-id="${annotationId}"]:not([hidden])`
            );

            const annotationPng = await page.screenshot({
              clip: rect,
              type: "png",
            });
            const annotationImage = PNG.sync.read(annotationPng);
            const annotationFirstPix = getFirstPixel(
              annotationImage.data,
              annotationImage.width,
              annotationImage.height,
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

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the shortcuts are working correctly", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(getEditorSelector(0), {
            visible: true,
          });
          await page.type(`${getEditorSelector(0)} .internal`, data);

          const editorRect = await getRect(page, getEditorSelector(0));

          // Commit.
          await page.mouse.click(
            editorRect.x,
            editorRect.y + 2 * editorRect.height
          );
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay.enabled`
          );

          await page.focus("#editorFreeTextColor");
          await kbUndo(page);

          await page.waitForFunction(
            sel => !document.querySelector(sel),
            {},
            getEditorSelector(0)
          );

          await kbRedo(page);
          await page.waitForFunction(
            sel => !!document.querySelector(sel),
            {},
            getEditorSelector(0)
          );
        })
      );
    });
  });

  describe("Move editor with arrows", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check the position of moved editor", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const data = "Hello PDF.js World !!";
          const selectorEditor = getEditorSelector(0);
          await page.mouse.click(rect.x + 200, rect.y + 200);
          await page.waitForSelector(selectorEditor, {
            visible: true,
          });
          await page.type(`${selectorEditor} .internal`, data);

          const editorRect = await getRect(page, selectorEditor);

          // Commit.
          await page.mouse.click(
            editorRect.x,
            editorRect.y + 2 * editorRect.height
          );
          await page.waitForSelector(`${selectorEditor} .overlay.enabled`);

          const [pageX, pageY] = await getFirstSerialized(page, x => x.rect);

          let xy = await getXY(page, selectorEditor);
          for (let i = 0; i < 20; i++) {
            await page.keyboard.press("ArrowRight");
            await waitForPositionChange(page, selectorEditor, xy);
            xy = await getXY(page, selectorEditor);
          }

          let [newX, newY] = await getFirstSerialized(page, x => x.rect);
          expect(Math.round(newX))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageX + 20));
          expect(Math.round(newY))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageY));

          for (let i = 0; i < 20; i++) {
            await page.keyboard.press("ArrowDown");
            await waitForPositionChange(page, selectorEditor, xy);
            xy = await getXY(page, selectorEditor);
          }

          [newX, newY] = await getFirstSerialized(page, x => x.rect);
          expect(Math.round(newX))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageX + 20));
          expect(Math.round(newY))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageY - 20));

          for (let i = 0; i < 2; i++) {
            await kbBigMoveLeft(page);
            await waitForPositionChange(page, selectorEditor, xy);
            xy = await getXY(page, selectorEditor);
          }

          [newX, newY] = await getFirstSerialized(page, x => x.rect);
          expect(Math.round(newX))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageX));
          expect(Math.round(newY))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageY - 20));

          for (let i = 0; i < 2; i++) {
            await kbBigMoveUp(page);
            await waitForPositionChange(page, selectorEditor, xy);
            xy = await getXY(page, selectorEditor);
          }

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
          await selectAll(page);
          await page.focus("#editorFreeTextFontSize");

          const [page1X, , page2X] = await getFirstSerialized(
            page,
            x => x.rect
          );
          const pageWidth = page2X - page1X;

          const selectorEditor = getEditorSelector(0);
          let xy = await getXY(page, selectorEditor);
          for (let i = 0; i < 5; i++) {
            await page.keyboard.press("ArrowRight");
            await waitForPositionChange(page, selectorEditor, xy);
            xy = await getXY(page, selectorEditor);
          }

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
          await clearAll(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const data = "Hello PDF.js World !!";
          let selectorEditor = getEditorSelector(1);
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(selectorEditor, {
            visible: true,
          });
          await page.type(`${selectorEditor} .internal`, data);

          const editorRect = await getRect(page, selectorEditor);

          // Commit.
          await page.mouse.click(
            editorRect.x,
            editorRect.y + 2 * editorRect.height
          );
          await page.waitForSelector(`${selectorEditor} .overlay.enabled`);

          const [pageX, pageY] = await getFirstSerialized(page, x => x.rect);

          await clearAll(page);
          selectorEditor = getEditorSelector(2);
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(selectorEditor, {
            visible: true,
          });

          let xy = await getXY(page, selectorEditor);
          for (let i = 0; i < 20; i++) {
            await page.keyboard.press("ArrowRight");
            await waitForPositionChange(page, selectorEditor, xy);
            xy = await getXY(page, selectorEditor);
          }

          for (let i = 0; i < 2; i++) {
            await kbBigMoveDown(page);
            await waitForPositionChange(page, selectorEditor, xy);
            xy = await getXY(page, selectorEditor);
          }

          for (let i = 0; i < 20; i++) {
            await page.keyboard.press("ArrowLeft");
            await waitForPositionChange(page, selectorEditor, xy);
            xy = await getXY(page, selectorEditor);
          }

          for (let i = 0; i < 2; i++) {
            await kbBigMoveUp(page);
            await waitForPositionChange(page, selectorEditor, xy);
            xy = await getXY(page, selectorEditor);
          }

          for (let i = 0; i < 2; i++) {
            await kbBigMoveRight(page);
            await waitForPositionChange(page, selectorEditor, xy);
            xy = await getXY(page, selectorEditor);
          }

          for (let i = 0; i < 2; i++) {
            await kbBigMoveLeft(page);
            await waitForPositionChange(page, selectorEditor, xy);
            xy = await getXY(page, selectorEditor);
          }

          await page.type(`${selectorEditor} .internal`, data);
          await page.keyboard.press("Escape");
          await page.waitForSelector(`${selectorEditor} .overlay.enabled`);

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

    beforeAll(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        100,
        async page => {
          await page.waitForFunction(async () => {
            await window.PDFViewerApplication.initializedPromise;
            return true;
          });
          await page.evaluate(() => {
            window.visitedPages = [];
            window.PDFViewerApplication.eventBus.on(
              "pagechanging",
              ({ pageNumber }) => {
                window.visitedPages.push(pageNumber);
              }
            );
          });
        }
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the focus is on the right page", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(getEditorSelector(0), {
            visible: true,
          });
          await page.type(`${getEditorSelector(0)} .internal`, data);
          // Commit.
          await cancelFocusIn(page, getEditorSelector(0));
          await page.keyboard.press("Escape");
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay.enabled`
          );

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

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must keep the focus", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          let rect = await getRect(page, ".annotationEditorLayer");

          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(getEditorSelector(0), {
            visible: true,
          });
          await page.type(`${getEditorSelector(0)} .internal`, "A");

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay.enabled`
          );

          rect = await getRect(page, getEditorSelector(0));

          await page.mouse.click(
            rect.x + 5 * rect.width,
            rect.y + 5 * rect.height
          );
          await page.waitForSelector(getEditorSelector(1), {
            visible: true,
          });
          await page.type(`${getEditorSelector(1)} .internal`, "B");

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForSelector(
            `${getEditorSelector(1)} .overlay.enabled`
          );

          rect = await getRect(page, getEditorSelector(0));

          await page.mouse.click(
            rect.x + 5 * rect.width,
            rect.y + 5 * rect.height
          );
          await waitForSelectedEditor(page, getEditorSelector(1));

          const pos = n =>
            page.evaluate(sel => {
              const editor = document.querySelector(sel);
              return Array.prototype.indexOf.call(
                editor.parentNode.childNodes,
                editor
              );
            }, getEditorSelector(n));

          expect(await pos(0))
            .withContext(`In ${browserName}`)
            .toEqual(0);
          expect(await pos(1))
            .withContext(`In ${browserName}`)
            .toEqual(1);

          const { y: y0, height } = await getRect(page, getEditorSelector(0));
          const selectorEditor = getEditorSelector(1);
          let xy = await getXY(page, selectorEditor);
          while ((await getRect(page, selectorEditor)).y > y0 - height) {
            await kbBigMoveUp(page);
            await waitForPositionChange(page, selectorEditor, xy);
            xy = await getXY(page, selectorEditor);
          }

          // The editor must be moved in the DOM and potentially the focus
          // will be lost, hence there's a callback will get back the focus.
          await page.waitForSelector(`${getEditorSelector(1)}:focus`);

          expect(await pos(0))
            .withContext(`In ${browserName}`)
            .toEqual(1);
          expect(await pos(1))
            .withContext(`In ${browserName}`)
            .toEqual(0);
        })
      );
    });
  });

  describe("Move several FreeTexts", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must move several annotations", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const allPositions = [];

          for (let i = 0; i < 10; i++) {
            await page.mouse.click(rect.x + 10 + 30 * i, rect.y + 100 + 5 * i);
            await page.waitForSelector(getEditorSelector(i), {
              visible: true,
            });
            await page.type(
              `${getEditorSelector(i)} .internal`,
              String.fromCharCode(65 + i)
            );

            // Commit.
            await page.keyboard.press("Escape");
            await page.waitForSelector(
              `${getEditorSelector(i)} .overlay.enabled`
            );

            allPositions.push(await getRect(page, getEditorSelector(i)));
          }

          await selectAll(page);
          await dragAndDropAnnotation(page, rect.x + 161, rect.y + 126, 39, 74);

          for (let i = 0; i < 10; i++) {
            const pos = await getRect(page, getEditorSelector(i));
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

    beforeAll(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        100,
        async page => {
          await page.waitForFunction(async () => {
            await window.PDFViewerApplication.initializedPromise;
            return true;
          });
          await page.evaluate(() => {
            window.PDFViewerApplication.eventBus.on(
              "annotationeditorstateschanged",
              ({ details }) => {
                window.editingEvents?.push(details);
              }
            );
          });
        }
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that selected editor stay selected", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(getEditorSelector(0), {
            visible: true,
          });
          await page.type(`${getEditorSelector(0)} .internal`, data);

          // Commit.
          await cancelFocusIn(page, getEditorSelector(0));
          await page.keyboard.press("Escape");
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay.enabled`
          );

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

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that first annotation is selected without errors", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const page1Selector = `.page[data-page-number = "1"] > .annotationEditorLayer.freetextEditing`;
          let rect = await getRect(page, page1Selector);
          const selectorEditor = getEditorSelector(0);
          await page.mouse.click(rect.x + 10, rect.y + 10);
          await page.waitForSelector(selectorEditor, {
            visible: true,
          });
          await page.type(`${selectorEditor} .internal`, "Hello");

          // Commit.
          await cancelFocusIn(page, selectorEditor);
          await page.keyboard.press("Escape");
          await page.waitForSelector(`${selectorEditor} .overlay.enabled`);

          // Unselect.
          await page.keyboard.press("Escape");
          await waitForUnselectedEditor(page, selectorEditor);

          const editorRect = await getRect(page, selectorEditor);

          // Select the editor created previously.
          await page.mouse.click(
            editorRect.x + editorRect.width / 2,
            editorRect.y + editorRect.height / 2
          );

          // Go to the last page.
          await scrollIntoView(page, `.page[data-page-number = "14"]`);

          const page14Selector = `.page[data-page-number = "14"] > .annotationEditorLayer.freetextEditing`;
          await page.waitForSelector(page14Selector, {
            visible: true,
            timeout: 0,
          });

          rect = await getRect(page, page14Selector);
          await page.mouse.click(rect.x + 10, rect.y + 10);
          await page.waitForSelector(getEditorSelector(1), {
            visible: true,
          });
          await page.type(`${getEditorSelector(1)} .internal`, "World");

          await page.keyboard.press("Escape");
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay.enabled`
          );

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

          await page.waitForSelector(getEditorSelector(0), {
            visible: true,
          });

          rect = await getRect(page, getEditorSelector(0));
          await page.mouse.click(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2
          );

          await waitForSelectedEditor(page, getEditorSelector(0));

          const content = await page.$eval(getEditorSelector(0), el =>
            el.innerText.trimEnd()
          );
          expect(content).withContext(`In ${browserName}`).toEqual("Hello");
        })
      );
    });
  });

  describe("Deleted FreeText", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a deleted freetext can be restored", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const page1Selector = `.page[data-page-number = "1"] > .annotationEditorLayer.freetextEditing`;
          const rect = await getRect(page, page1Selector);
          const selectorEditor = getEditorSelector(0);
          await page.mouse.click(rect.x + 10, rect.y + 10);
          await page.waitForSelector(selectorEditor, {
            visible: true,
          });
          await page.type(`${selectorEditor} .internal`, "Hello");

          // Commit.
          await cancelFocusIn(page, selectorEditor);
          await page.keyboard.press("Escape");
          await page.waitForSelector(`${selectorEditor} .overlay.enabled`);

          // Unselect.
          await page.keyboard.press("Escape");
          await waitForUnselectedEditor(page, selectorEditor);

          const editorRect = await getRect(page, selectorEditor);

          // Select the editor created previously.
          await page.mouse.click(
            editorRect.x + editorRect.width / 2,
            editorRect.y + editorRect.height / 2
          );

          // Go to the last page.
          await scrollIntoView(page, `.page[data-page-number = "14"]`);
          await page.waitForSelector(
            `.page[data-page-number = "14"] > .annotationEditorLayer.freetextEditing`,
            {
              visible: true,
              timeout: 0,
            }
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

          await page.waitForSelector(getEditorSelector(0), {
            visible: true,
          });
        })
      );
    });
  });

  describe("FreeText accessibility", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("bug1823296.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the parent structTree id is correct", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const parentId = "p3R_mc8";
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
          await page.waitForSelector(getEditorSelector(0), {
            visible: true,
          });
          await page.type(`${getEditorSelector(0)} .internal`, "Hello Wolrd");

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay.enabled`
          );

          await waitForStorageEntries(page, 1);

          const id = await getFirstSerialized(page, x => x.structTreeParentId);
          expect(id).withContext(`In ${browserName}`).toEqual(parentId);
        })
      );
    });
  });

  describe("Bug 1854818: mouse events in a selected FreeText editor", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check the text can be selected with the mouse", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(getEditorSelector(0), {
            visible: true,
          });
          const internalEditorSelector = `${getEditorSelector(0)} .internal`;
          await page.type(internalEditorSelector, data);
          await page.keyboard.press("Escape");
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay.enabled`
          );
          await page.click(getEditorSelector(0), { count: 2 });
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay:not(.enabled)`
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

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must create an editor from the toolbar", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.focus("#editorFreeText");
          await page.keyboard.press("Enter");

          let selectorEditor = getEditorSelector(0);
          await page.waitForSelector(selectorEditor, {
            visible: true,
          });

          let xy = await getXY(page, selectorEditor);
          for (let i = 0; i < 5; i++) {
            await kbBigMoveUp(page);
            await waitForPositionChange(page, selectorEditor, xy);
            xy = await getXY(page, selectorEditor);
          }

          const data = "Hello PDF.js World !!";
          await page.type(`${selectorEditor} .internal`, data);

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForSelector(`${selectorEditor} .overlay.enabled`);

          let content = await page.$eval(selectorEditor, el =>
            el.innerText.trimEnd()
          );

          expect(content).withContext(`In ${browserName}`).toEqual(data);

          // Disable editing mode.
          await switchToFreeText(page, /* disable = */ true);

          await page.focus("#editorFreeText");
          await page.keyboard.press(" ");
          selectorEditor = getEditorSelector(1);
          await page.waitForSelector(selectorEditor, {
            visible: true,
          });

          xy = await getXY(page, selectorEditor);
          for (let i = 0; i < 5; i++) {
            await kbBigMoveDown(page);
            await waitForPositionChange(page, selectorEditor, xy);
            xy = await getXY(page, selectorEditor);
          }

          await page.type(`${selectorEditor} .internal`, data);

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForSelector(`${selectorEditor} .overlay.enabled`);

          // Unselect.
          await page.keyboard.press("Escape");
          await waitForUnselectedEditor(page, selectorEditor);

          content = await page.$eval(getEditorSelector(1), el =>
            el.innerText.trimEnd()
          );

          expect(content).withContext(`In ${browserName}`).toEqual(data);
        })
      );
    });

    it("must create an editor with keyboard", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.keyboard.press("Enter");
          let selectorEditor = getEditorSelector(2);
          await page.waitForSelector(selectorEditor, {
            visible: true,
          });

          let xy = await getXY(page, selectorEditor);
          for (let i = 0; i < 10; i++) {
            await kbBigMoveLeft(page);
            await waitForPositionChange(page, selectorEditor, xy);
            xy = await getXY(page, selectorEditor);
          }

          const data = "Hello PDF.js World !!";
          await page.type(`${selectorEditor} .internal`, data);

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForSelector(`${selectorEditor} .overlay.enabled`);

          // Unselect.
          await page.keyboard.press("Escape");
          await waitForUnselectedEditor(page, selectorEditor);

          let content = await page.$eval(getEditorSelector(2), el =>
            el.innerText.trimEnd()
          );

          expect(content).withContext(`In ${browserName}`).toEqual(data);

          await page.keyboard.press(" ");
          selectorEditor = getEditorSelector(3);
          await page.waitForSelector(selectorEditor, {
            visible: true,
          });

          xy = await getXY(page, selectorEditor);
          for (let i = 0; i < 10; i++) {
            await kbBigMoveRight(page);
            await waitForPositionChange(page, selectorEditor, xy);
            xy = await getXY(page, selectorEditor);
          }

          await page.type(`${selectorEditor} .internal`, data);

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForSelector(`${selectorEditor} .overlay.enabled`);

          // Unselect.
          await page.keyboard.press("Escape");
          await waitForUnselectedEditor(page, selectorEditor);

          content = await page.$eval(selectorEditor, el =>
            el.innerText.trimEnd()
          );

          expect(content).withContext(`In ${browserName}`).toEqual(data);
        })
      );
    });
  });

  describe("Avoid to steal keyboard events", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check the keyboard event is limited to the input", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(getEditorSelector(0), {
            visible: true,
          });
          await page.type(`${getEditorSelector(0)} .internal`, data);

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay.enabled`
          );

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

          content = await page.$eval(getEditorSelector(0), el =>
            el.innerText.trimEnd()
          );
          expect(content).withContext(`In ${browserName}`).toEqual(data);
        })
      );
    });
  });

  describe("Delete a freetext in using the delete button", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a freetext is deleted", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(getEditorSelector(0), {
            visible: true,
          });
          await page.type(`${getEditorSelector(0)} .internal`, data);

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay.enabled`
          );

          // Delete it in using the button.
          await page.click(`${getEditorSelector(0)} button.delete`);
          await page.waitForFunction(
            sel => !document.querySelector(sel),
            {},
            getEditorSelector(0)
          );
          await waitForStorageEntries(page, 0);

          // Undo.
          await kbUndo(page);
          await waitForSerialized(page, 1);

          await page.waitForSelector(getEditorSelector(0), {
            visible: true,
          });
        })
      );
    });
  });

  describe("Delete two freetexts in using the delete button and the keyboard", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
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
            await page.waitForSelector(editorSelector, {
              visible: true,
            });
            await page.type(`${editorSelector} .internal`, data);

            // Commit.
            await page.keyboard.press("Escape");
            await page.waitForSelector(`${editorSelector} .overlay.enabled`);
          }

          // Select the editor created previously.
          const editorRect = await getRect(page, getEditorSelector(0));
          await page.mouse.click(
            editorRect.x + editorRect.width / 2,
            editorRect.y + editorRect.height / 2
          );
          await waitForSelectedEditor(page, getEditorSelector(0));

          await selectAll(page);

          // Delete it in using the button.
          await page.focus(`${getEditorSelector(0)} button.delete`);
          await page.keyboard.press("Enter");
          await page.waitForFunction(
            sel => !document.querySelector(sel),
            {},
            getEditorSelector(0)
          );
          await waitForStorageEntries(page, 0);

          // Undo.
          await kbUndo(page);
          await waitForSerialized(page, 2);

          await page.waitForSelector(getEditorSelector(0), {
            visible: true,
          });

          await page.waitForSelector(getEditorSelector(1), {
            visible: true,
          });
        })
      );
    });
  });

  describe("Consecutive white spaces in Freetext without appearance", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("bug1871353.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that consecutive white spaces are preserved when a freetext is edited", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);
          await page.click(getEditorSelector(0), { count: 2 });
          await page.type(`${getEditorSelector(0)} .internal`, "C");

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

    beforeAll(async () => {
      pages = await loadAndWait("bug1871353.1.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that consecutive white spaces are preserved when a freetext is edited", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);
          await page.click(getEditorSelector(0), { count: 2 });
          await page.type(`${getEditorSelector(0)} .internal`, "Z");

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

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that all lines are correctly exported", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const data = "Hello\nPDF.js\nWorld\n!!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(getEditorSelector(0), {
            visible: true,
          });
          await page.type(`${getEditorSelector(0)} .internal`, data);

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay.enabled`
          );

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

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the parameters are updated when undoing/redoing", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(getEditorSelector(0), {
            visible: true,
          });
          await page.type(`${getEditorSelector(0)} .internal`, data);

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay.enabled`
          );

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

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
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

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a freetext can be undone", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(getEditorSelector(0), {
            visible: true,
          });
          await page.type(`${getEditorSelector(0)} .internal`, data);

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay.enabled`
          );
          await waitForSerialized(page, 1);

          await page.waitForSelector(`${getEditorSelector(0)} button.delete`);
          await page.click(`${getEditorSelector(0)} button.delete`);
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

          await page.waitForSelector(getEditorSelector(0));
        })
      );
    });
  });

  describe("Delete a freetext, scroll and undo it", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a freetext can be undone", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(getEditorSelector(0), {
            visible: true,
          });
          await page.type(`${getEditorSelector(0)} .internal`, data);

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForSelector(
            `${getEditorSelector(0)} .overlay.enabled`
          );
          await waitForSerialized(page, 1);

          await page.waitForSelector(`${getEditorSelector(0)} button.delete`);
          await page.click(`${getEditorSelector(0)} button.delete`);
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
          await page.waitForSelector(getEditorSelector(0));
        })
      );
    });
  });

  describe("Paste some html", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that pasting html just keep the text", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          let editorSelector = getEditorSelector(0);
          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForSelector(editorSelector, {
            visible: true,
          });
          await page.type(`${editorSelector} .internal`, data);
          const editorRect = await getRect(page, editorSelector);

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForSelector(`${editorSelector} .overlay.enabled`);

          const waitForTextChange = (previous, edSelector) =>
            page.waitForFunction(
              (prev, sel) => document.querySelector(sel).innerText !== prev,
              {},
              previous,
              `${edSelector} .internal`
            );
          const getText = edSelector =>
            page.$eval(`${edSelector} .internal`, el => el.innerText.trimEnd());

          await page.mouse.click(
            editorRect.x + editorRect.width / 2,
            editorRect.y + editorRect.height / 2,
            { count: 2 }
          );
          await page.waitForSelector(
            `${editorSelector} .overlay:not(.enabled)`
          );

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
          await pasteFromClipboard(
            page,
            {
              "text/html": "<b>Bold Foo</b>",
              "text/plain": "Foo",
            },
            `${editorSelector} .internal`
          );

          let lastText = data;

          await waitForTextChange(lastText, editorSelector);
          let text = await getText(editorSelector);
          lastText = `Foo${data}`;
          expect(text).withContext(`In ${browserName}`).toEqual(lastText);

          await select(3);
          await pasteFromClipboard(
            page,
            {
              "text/html": "<b>Bold Bar</b><br><b>Oof</b>",
              "text/plain": "Bar\nOof",
            },
            `${editorSelector} .internal`
          );

          await waitForTextChange(lastText, editorSelector);
          text = await getText(editorSelector);
          lastText = `FooBar\nOof${data}`;
          expect(text).withContext(`In ${browserName}`).toEqual(lastText);

          await select(0);
          await pasteFromClipboard(
            page,
            {
              "text/html": "<b>basic html</b>",
            },
            `${editorSelector} .internal`
          );

          // Nothing should change, so it's hard to wait on something.
          // eslint-disable-next-line no-restricted-syntax
          await waitForTimeout(100);

          text = await getText(editorSelector);
          expect(text).withContext(`In ${browserName}`).toEqual(lastText);

          const getHTML = () =>
            page.$eval(`${editorSelector} .internal`, el => el.innerHTML);
          const prevHTML = await getHTML();

          // Try to paste an image.
          await pasteFromClipboard(
            page,
            {
              "image/png":
                // 1x1 transparent png.
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
            },
            `${editorSelector} .internal`
          );

          // Nothing should change, so it's hard to wait on something.
          // eslint-disable-next-line no-restricted-syntax
          await waitForTimeout(100);

          const html = await getHTML();
          expect(html).withContext(`In ${browserName}`).toEqual(prevHTML);

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForSelector(`${editorSelector} .overlay.enabled`);

          editorSelector = getEditorSelector(1);
          await page.mouse.click(rect.x + 200, rect.y + 200);
          await page.waitForSelector(editorSelector, {
            visible: true,
          });

          const fooBar = "Foo\nBar\nOof";
          await pasteFromClipboard(
            page,
            {
              "text/html": "<b>html</b>",
              "text/plain": fooBar,
            },
            `${editorSelector} .internal`
          );

          await waitForTextChange("", editorSelector);
          text = await getText(editorSelector);
          expect(text).withContext(`In ${browserName}`).toEqual(fooBar);
        })
      );
    });
  });

  describe("Update a freetext and scroll", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "tracemonkey_freetext.pdf",
        ".annotationEditorLayer"
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a freetext is still there after having updated it and scroll the doc", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToFreeText(page);

          const editorSelector = getEditorSelector(0);
          const editorRect = await getRect(page, editorSelector);
          await page.mouse.click(
            editorRect.x + editorRect.width / 2,
            editorRect.y + editorRect.height / 2,
            { count: 2 }
          );
          await page.waitForSelector(
            `${editorSelector} .overlay:not(.enabled)`
          );

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

          await page.waitForSelector("[data-annotation-id='998R'] canvas");
          let hidden = await page.$eval(
            "[data-annotation-id='998R'] canvas",
            el => getComputedStyle(el).display === "none"
          );
          expect(hidden).withContext(`In ${browserName}`).toBeTrue();

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
          for (const pageNumber of thirteenToOne) {
            await scrollIntoView(
              page,
              `.page[data-page-number = "${pageNumber}"]`
            );
          }

          await page.waitForSelector("[data-annotation-id='998R'] canvas");
          hidden = await page.$eval(
            "[data-annotation-id='998R'] canvas",
            el => getComputedStyle(el).display === "none"
          );
          expect(hidden).withContext(`In ${browserName}`).toBeFalse();
        })
      );
    });
  });
});
