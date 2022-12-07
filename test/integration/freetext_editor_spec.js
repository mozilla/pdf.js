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

const {
  closePages,
  getEditorSelector,
  getSelectedEditors,
  loadAndWait,
  waitForEvent,
  waitForSelectedEditor,
  waitForStorageEntries,
} = require("./test_utils.js");

const copyPaste = async page => {
  let promise = waitForEvent(page, "copy");
  await page.keyboard.down("Control");
  await page.keyboard.press("c");
  await page.keyboard.up("Control");
  await promise;

  await page.waitForTimeout(10);

  promise = waitForEvent(page, "paste");
  await page.keyboard.down("Control");
  await page.keyboard.press("v");
  await page.keyboard.up("Control");
  await promise;
};

describe("Editor", () => {
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
          await page.click("#editorFreeText");

          const rect = await page.$eval(".annotationEditorLayer", el => {
            // With Chrome something is wrong when serializing a DomRect,
            // hence we extract the values and just return them.
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.type(`${getEditorSelector(0)} .internal`, data);

          const editorRect = await page.$eval(getEditorSelector(0), el => {
            const { x, y, width, height } = el.getBoundingClientRect();
            return {
              x,
              y,
              width,
              height,
            };
          });

          // Commit.
          await page.mouse.click(
            editorRect.x,
            editorRect.y + 2 * editorRect.height
          );

          await waitForSelectedEditor(page, getEditorSelector(0));
          await waitForStorageEntries(page, 1);

          const content = await page.$eval(getEditorSelector(0), el =>
            el.innerText.trimEnd()
          );
          expect(content).withContext(`In ${browserName}`).toEqual(data);
        })
      );
    });

    it("must copy/paste", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [browserName, page] of pages) {
        const editorRect = await page.$eval(getEditorSelector(0), el => {
          const { x, y, width, height } = el.getBoundingClientRect();
          return { x, y, width, height };
        });

        // Select the editor created previously.
        await page.mouse.click(
          editorRect.x + editorRect.width / 2,
          editorRect.y + editorRect.height / 2
        );

        await waitForSelectedEditor(page, getEditorSelector(0));
        await copyPaste(page);
        await waitForStorageEntries(page, 2);

        const content = await page.$eval(getEditorSelector(0), el =>
          el.innerText.trimEnd()
        );

        let pastedContent = await page.$eval(getEditorSelector(1), el =>
          el.innerText.trimEnd()
        );

        expect(pastedContent).withContext(`In ${browserName}`).toEqual(content);

        await copyPaste(page);
        await waitForStorageEntries(page, 3);

        pastedContent = await page.$eval(getEditorSelector(2), el =>
          el.innerText.trimEnd()
        );
        expect(pastedContent).withContext(`In ${browserName}`).toEqual(content);
      }
    });

    it("must clear all", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.keyboard.down("Control");
          await page.keyboard.press("a");
          await page.keyboard.up("Control");

          await page.keyboard.down("Control");
          await page.keyboard.press("Backspace");
          await page.keyboard.up("Control");

          for (const n of [0, 1, 2]) {
            const hasEditor = await page.evaluate(sel => {
              return !!document.querySelector(sel);
            }, getEditorSelector(n));

            expect(hasEditor).withContext(`In ${browserName}`).toEqual(false);
          }

          await waitForStorageEntries(page, 0);
        })
      );
    });

    it("must check that a paste has been undone", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [browserName, page] of pages) {
        const rect = await page.$eval(".annotationEditorLayer", el => {
          const { x, y } = el.getBoundingClientRect();
          return { x, y };
        });

        const data = "Hello PDF.js World !!";
        await page.mouse.click(rect.x + 100, rect.y + 100);
        await page.type(`${getEditorSelector(3)} .internal`, data);

        const editorRect = await page.$eval(getEditorSelector(3), el => {
          const { x, y, width, height } = el.getBoundingClientRect();
          return { x, y, width, height };
        });

        // Commit.
        await page.mouse.click(
          editorRect.x,
          editorRect.y + 2 * editorRect.height
        );
        // And select it again.
        await page.mouse.click(
          editorRect.x + editorRect.width / 2,
          editorRect.y + editorRect.height / 2
        );

        await waitForSelectedEditor(page, getEditorSelector(3));
        await copyPaste(page);

        let hasEditor = await page.evaluate(sel => {
          return !!document.querySelector(sel);
        }, getEditorSelector(4));

        expect(hasEditor).withContext(`In ${browserName}`).toEqual(true);

        await page.keyboard.down("Control");
        await page.keyboard.press("z");
        await page.keyboard.up("Control");
        await page.waitForTimeout(10);

        hasEditor = await page.evaluate(sel => {
          return !!document.querySelector(sel);
        }, getEditorSelector(4));

        expect(hasEditor).withContext(`In ${browserName}`).toEqual(false);

        for (let i = 0; i < 2; i++) {
          const promise = waitForEvent(page, "paste");
          await page.keyboard.down("Control");
          await page.keyboard.press("v");
          await page.keyboard.up("Control");
          await promise;
          await page.waitForTimeout(10);
        }

        let length = await page.evaluate(sel => {
          return document.querySelectorAll(sel).length;
        }, `${getEditorSelector(5)}, ${getEditorSelector(6)}`);
        expect(length).withContext(`In ${browserName}`).toEqual(2);

        for (let i = 0; i < 2; i++) {
          await page.keyboard.down("Control");
          await page.keyboard.press("z");
          await page.keyboard.up("Control");
          await page.waitForTimeout(10);
        }

        length = await page.evaluate(sel => {
          return document.querySelectorAll(sel).length;
        }, `${getEditorSelector(5)}, ${getEditorSelector(6)}`);
        expect(length).withContext(`In ${browserName}`).toEqual(0);
      }
    });

    it("must check that aria-owns is correct", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const [stacksRect, oldAriaOwns] = await page.$eval(
            ".textLayer",
            el => {
              for (const span of el.querySelectorAll(
                `span[role="presentation"]`
              )) {
                if (span.innerText.includes("Stacks are simple to create")) {
                  span.setAttribute("pdfjs", true);
                  const { x, y, width, height } = span.getBoundingClientRect();
                  return [
                    { x, y, width, height },
                    span.getAttribute("aria-owns"),
                  ];
                }
              }
              return null;
            }
          );

          expect(oldAriaOwns).withContext(`In ${browserName}`).toEqual(null);

          const data = "Hello PDF.js World !!";
          await page.mouse.click(
            stacksRect.x + stacksRect.width + 1,
            stacksRect.y + stacksRect.height / 2
          );
          await page.type(`${getEditorSelector(7)} .internal`, data);

          // Commit.
          await page.keyboard.press("Escape");

          const ariaOwns = await page.$eval(".textLayer", el => {
            const span = el.querySelector(`span[pdfjs="true"]`);
            return span?.getAttribute("aria-owns") || null;
          });

          expect(ariaOwns.endsWith("_7-editor"))
            .withContext(`In ${browserName}`)
            .toEqual(true);
        })
      );
    });

    it("must check that right click doesn't select", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const rect = await page.$eval(".annotationEditorLayer", el => {
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          await page.keyboard.down("Control");
          await page.keyboard.press("a");
          await page.keyboard.up("Control");

          await page.keyboard.down("Control");
          await page.keyboard.press("Backspace");
          await page.keyboard.up("Control");

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.type(`${getEditorSelector(8)} .internal`, data);

          const editorRect = await page.$eval(getEditorSelector(8), el => {
            const { x, y, width, height } = el.getBoundingClientRect();
            return { x, y, width, height };
          });

          // Commit.
          await page.keyboard.press("Escape");

          expect(await getSelectedEditors(page))
            .withContext(`In ${browserName}`)
            .toEqual([8]);

          await page.keyboard.press("Escape");
          expect(await getSelectedEditors(page))
            .withContext(`In ${browserName}`)
            .toEqual([]);

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

          expect(await getSelectedEditors(page))
            .withContext(`In ${browserName}`)
            .toEqual([]);

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
        await page.click("#editorFreeText");

        const rect = await page.$eval(".annotationEditorLayer", el => {
          // With Chrome something is wrong when serializing a DomRect,
          // hence we extract the values and just return them.
          const { x, y } = el.getBoundingClientRect();
          return { x, y };
        });

        const editorCenters = [];
        for (let i = 0; i < 4; i++) {
          const data = `FreeText ${i}`;
          await page.mouse.click(
            rect.x + (i + 1) * 100,
            rect.y + (i + 1) * 100
          );
          await page.type(`${getEditorSelector(i)} .internal`, data);

          const editorRect = await page.$eval(getEditorSelector(i), el => {
            const { x, y, width, height } = el.getBoundingClientRect();
            return {
              x,
              y,
              width,
              height,
            };
          });
          editorCenters.push({
            x: editorRect.x + editorRect.width / 2,
            y: editorRect.y + editorRect.height / 2,
          });

          // Commit.
          await page.mouse.click(
            editorRect.x,
            editorRect.y + 2 * editorRect.height
          );
        }

        await page.keyboard.down("Control");
        await page.keyboard.press("a");
        await page.keyboard.up("Control");

        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([0, 1, 2, 3]);

        await page.keyboard.down("Control");
        await page.mouse.click(editorCenters[1].x, editorCenters[1].y);

        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([0, 2, 3]);

        await page.mouse.click(editorCenters[2].x, editorCenters[2].y);

        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([0, 3]);

        await page.mouse.click(editorCenters[1].x, editorCenters[1].y);
        await page.keyboard.up("Control");

        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([0, 1, 3]);

        await copyPaste(page);

        // 0,1,3 are unselected and new pasted editors are selected.
        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([4, 5, 6]);

        // No ctrl here, hence all are unselected and 2 is selected.
        await page.mouse.click(editorCenters[2].x, editorCenters[2].y);
        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([2]);

        await page.mouse.click(editorCenters[1].x, editorCenters[1].y);
        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([1]);

        await page.keyboard.down("Control");

        await page.mouse.click(editorCenters[3].x, editorCenters[3].y);
        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([1, 3]);

        await page.keyboard.up("Control");

        // Delete 1 and 3.
        await page.keyboard.press("Backspace");

        await page.keyboard.down("Control");
        await page.keyboard.press("a");
        await page.keyboard.up("Control");

        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([0, 2, 4, 5, 6]);

        // Create an empty editor.
        await page.mouse.click(rect.x + 700, rect.y + 100);
        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([7]);

        // Set the focus to 2 and check that only 2 is selected.
        await page.mouse.click(editorCenters[2].x, editorCenters[2].y);
        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([2]);

        // Create an empty editor.
        await page.mouse.click(rect.x + 700, rect.y + 100);
        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([8]);
        // Dismiss it.
        await page.keyboard.press("Escape");

        // Select all.
        await page.keyboard.down("Control");
        await page.keyboard.press("a");
        await page.keyboard.up("Control");

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
          await page.click("#editorFreeText");
          let currentId = 0;
          const expected = [];
          const oneToFourteen = [...new Array(14).keys()].map(x => x + 1);

          for (const pageNumber of oneToFourteen) {
            const pageSelector = `.page[data-page-number = "${pageNumber}"]`;

            await page.evaluate(selector => {
              const element = window.document.querySelector(selector);
              element.scrollIntoView();
            }, pageSelector);

            const annotationLayerSelector = `${pageSelector} > .annotationEditorLayer`;
            await page.waitForSelector(annotationLayerSelector, {
              visible: true,
              timeout: 0,
            });
            await page.waitForTimeout(50);
            if (![1, 14].includes(pageNumber)) {
              continue;
            }

            const rect = await page.$eval(annotationLayerSelector, el => {
              // With Chrome something is wrong when serializing a DomRect,
              // hence we extract the values and just return them.
              const { x, y } = el.getBoundingClientRect();
              return { x, y };
            });

            const data = `Hello PDF.js World !! on page ${pageNumber}`;
            expected.push(data);
            await page.mouse.click(rect.x + 100, rect.y + 100);
            await page.type(`${getEditorSelector(currentId)} .internal`, data);

            // Commit.
            await page.keyboard.press("Escape");
            await page.waitForTimeout(10);

            await waitForSelectedEditor(page, getEditorSelector(currentId));
            await waitForStorageEntries(page, currentId + 1);

            const content = await page.$eval(getEditorSelector(currentId), el =>
              el.innerText.trimEnd()
            );
            expect(content).withContext(`In ${browserName}`).toEqual(data);

            currentId += 1;
            await page.waitForTimeout(10);
          }

          const serialize = proprName =>
            page.evaluate(
              name =>
                [
                  ...window.PDFViewerApplication.pdfDocument.annotationStorage.serializable.values(),
                ].map(x => x[name]),
              proprName
            );

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
          // Select all.
          await page.keyboard.down("Control");
          await page.keyboard.press("a");
          await page.keyboard.up("Control");
          await page.waitForTimeout(10);

          page.evaluate(() => {
            window.PDFViewerApplication.eventBus.dispatch(
              "switchannotationeditorparams",
              {
                source: null,
                type: /* AnnotationEditorParamsType.FREETEXT_SIZE */ 1,
                value: 13,
              }
            );
          });

          await page.waitForTimeout(10);
          expect(await serialize("fontSize"))
            .withContext(`In ${browserName}`)
            .toEqual([13, 13]);

          // Change the colors for all the annotations.
          page.evaluate(() => {
            window.PDFViewerApplication.eventBus.dispatch(
              "switchannotationeditorparams",
              {
                source: null,
                type: /* AnnotationEditorParamsType.FREETEXT_COLOR */ 2,
                value: "#FF0000",
              }
            );
          });

          await page.waitForTimeout(10);
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
          await page.click("#editorFreeText");
          let currentId = 0;

          for (let step = 0; step < 3; step++) {
            const rect = await page.$eval(".annotationEditorLayer", el => {
              // With Chrome something is wrong when serializing a DomRect,
              // hence we extract the values and just return them.
              const { x, y, width, height } = el.getBoundingClientRect();
              return { x, y, width, height };
            });

            const data = `Hello ${step}`;
            const x = rect.x + 0.1 * rect.width;
            const y = rect.y + 0.1 * rect.height;
            await page.mouse.click(x, y);
            await page.type(`${getEditorSelector(currentId)} .internal`, data);

            // Commit.
            await page.keyboard.press("Escape");
            await page.waitForTimeout(10);

            await page.evaluate(() => {
              document.getElementById("pageRotateCw").click();
            });
            currentId += 1;
            await page.waitForTimeout(10);
          }

          const serialize = proprName =>
            page.evaluate(
              name =>
                [
                  ...window.PDFViewerApplication.pdfDocument.annotationStorage.serializable.values(),
                ].map(x => x[name]),
              proprName
            );

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
});
