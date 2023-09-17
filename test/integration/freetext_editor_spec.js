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
  dragAndDropAnnotation,
  getEditors,
  getEditorSelector,
  getSelectedEditors,
  getFirstSerialized,
  getSerialized,
  loadAndWait,
  waitForEvent,
  waitForSelectedEditor,
  waitForStorageEntries,
} = require("./test_utils.js");

const PNG = require("pngjs").PNG;

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

const clearAll = async page => {
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.waitForTimeout(10);
  await page.keyboard.down("Control");
  await page.keyboard.press("Backspace");
  await page.keyboard.up("Control");
  await page.waitForTimeout(10);
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
          await page.click("#editorFreeText");

          const rect = await page.$eval(".annotationEditorLayer", el => {
            // With Chrome something is wrong when serializing a DomRect,
            // hence we extract the values and just return them.
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForTimeout(10);
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

          let content = await page.$eval(getEditorSelector(0), el =>
            el.innerText.trimEnd()
          );
          expect(content).withContext(`In ${browserName}`).toEqual(data);

          // Edit again.
          await page.keyboard.press("Enter");
          await page.waitForTimeout(10);

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForTimeout(10);

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
          await clearAll(page);

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
        await page.waitForTimeout(10);
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

        await page.waitForTimeout(10);

        // And select it again.
        await page.mouse.click(
          editorRect.x + editorRect.width / 2,
          editorRect.y + editorRect.height / 2
        );

        await page.waitForTimeout(10);

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

        let length = await page.evaluate(
          sel => {
            return document.querySelectorAll(sel).length;
          },
          `${getEditorSelector(5)}, ${getEditorSelector(6)}`
        );
        expect(length).withContext(`In ${browserName}`).toEqual(2);

        for (let i = 0; i < 2; i++) {
          await page.keyboard.down("Control");
          await page.keyboard.press("z");
          await page.keyboard.up("Control");
          await page.waitForTimeout(10);
        }

        length = await page.evaluate(
          sel => {
            return document.querySelectorAll(sel).length;
          },
          `${getEditorSelector(5)}, ${getEditorSelector(6)}`
        );
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
          await page.waitForTimeout(10);
          await page.type(`${getEditorSelector(7)} .internal`, data);

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForTimeout(10);

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

          await clearAll(page);

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForTimeout(10);
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
          await page.waitForTimeout(10);

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

    it("must check that text change can be undone/redone", async () => {
      // Run sequentially to avoid clipboard issues.
      for (const [browserName, page] of pages) {
        const rect = await page.$eval(".annotationEditorLayer", el => {
          const { x, y } = el.getBoundingClientRect();
          return { x, y };
        });

        await clearAll(page);

        await page.mouse.click(rect.x + 200, rect.y + 100);
        await page.waitForTimeout(10);

        for (let i = 0; i < 5; i++) {
          await page.type(`${getEditorSelector(9)} .internal`, "A");

          const editorRect = await page.$eval(getEditorSelector(9), el => {
            const { x, y, width, height } = el.getBoundingClientRect();
            return { x, y, width, height };
          });

          // Commit.
          await page.mouse.click(
            editorRect.x,
            editorRect.y + 2 * editorRect.height
          );
          await page.waitForTimeout(10);

          if (i < 4) {
            // And select it again.
            await page.mouse.click(
              editorRect.x + editorRect.width / 2,
              editorRect.y + editorRect.height / 2,
              { clickCount: 2 }
            );
            await page.waitForTimeout(10);
          }
        }

        await page.keyboard.down("Control");
        await page.keyboard.press("z");
        await page.keyboard.up("Control");
        await page.waitForTimeout(10);

        let text = await page.$eval(`${getEditorSelector(9)} .internal`, el => {
          return el.innerText;
        });

        expect(text).withContext(`In ${browserName}`).toEqual("AAAA");

        await page.keyboard.down("Control");
        await page.keyboard.press("z");
        await page.keyboard.up("Control");
        await page.waitForTimeout(10);

        text = await page.$eval(`${getEditorSelector(9)} .internal`, el => {
          return el.innerText;
        });

        expect(text).withContext(`In ${browserName}`).toEqual("AAA");

        await page.keyboard.down("Control");
        await page.keyboard.press("y");
        await page.keyboard.up("Control");
        await page.waitForTimeout(10);

        text = await page.$eval(`${getEditorSelector(9)} .internal`, el => {
          return el.innerText;
        });

        expect(text).withContext(`In ${browserName}`).toEqual("AAAA");

        for (let i = 0; i < 4; i++) {
          await page.keyboard.down("Control");
          await page.keyboard.press("z");
          await page.keyboard.up("Control");
          await page.waitForTimeout(10);
        }

        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([]);

        await page.keyboard.down("Control");
        await page.keyboard.press("y");
        await page.keyboard.up("Control");
        await page.waitForTimeout(10);

        text = await page.$eval(`${getEditorSelector(9)} .internal`, el => {
          return el.innerText;
        });

        expect(text).withContext(`In ${browserName}`).toEqual("A");

        // Add a new A.
        const editorRect = await page.$eval(getEditorSelector(9), el => {
          const { x, y, width, height } = el.getBoundingClientRect();
          return { x, y, width, height };
        });
        await page.mouse.click(
          editorRect.x + editorRect.width / 2,
          editorRect.y + editorRect.height / 2,
          { clickCount: 2 }
        );
        await page.waitForTimeout(10);
        await page.type(`${getEditorSelector(9)} .internal`, "A");

        // Commit.
        await page.mouse.click(
          editorRect.x,
          editorRect.y + 2 * editorRect.height
        );
        await page.waitForTimeout(10);

        text = await page.$eval(`${getEditorSelector(9)} .internal`, el => {
          return el.innerText;
        });
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
          await page.waitForTimeout(10);
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
        await page.waitForTimeout(10);

        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([0, 1, 2, 3]);

        await page.keyboard.down("Control");
        await page.mouse.click(editorCenters[1].x, editorCenters[1].y);
        await page.waitForTimeout(10);

        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([0, 2, 3]);

        await page.mouse.click(editorCenters[2].x, editorCenters[2].y);

        expect(await getSelectedEditors(page))
          .withContext(`In ${browserName}`)
          .toEqual([0, 3]);

        await page.mouse.click(editorCenters[1].x, editorCenters[1].y);
        await page.keyboard.up("Control");
        await page.waitForTimeout(10);

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
        await page.waitForTimeout(10);

        await page.keyboard.down("Control");
        await page.keyboard.press("a");
        await page.keyboard.up("Control");
        await page.waitForTimeout(10);

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
        await page.waitForTimeout(10);

        // Select all.
        await page.keyboard.down("Control");
        await page.keyboard.press("a");
        await page.keyboard.up("Control");
        await page.waitForTimeout(10);

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
          const oneToFourteen = Array.from(new Array(14).keys(), x => x + 1);

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
            await page.waitForTimeout(10);
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
                type: window.pdfjsLib.AnnotationEditorParamsType.FREETEXT_SIZE,
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
                type: window.pdfjsLib.AnnotationEditorParamsType.FREETEXT_COLOR,
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
            await page.waitForTimeout(10);
            await page.type(`${getEditorSelector(currentId)} .internal`, data);

            // Commit.
            await page.keyboard.press("Escape");
            await page.waitForTimeout(10);

            await page.evaluate(() => {
              document.getElementById("pageRotateCw").click();
            });
            currentId += 1;
            await page.waitForTimeout(10);
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
          await page.click("#editorFreeText");

          const editorIds = await getEditors(page, "freeText");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(6);

          // All the current annotations should be serialized as null objects
          // because they haven't been edited yet.
          let serialized = await getSerialized(page);
          expect(serialized).withContext(`In ${browserName}`).toEqual([]);

          const editorRect = await page.$eval(getEditorSelector(0), el => {
            const { x, y, width, height } = el.getBoundingClientRect();
            return { x, y, width, height };
          });

          // Select the annotation we want to move.
          await page.mouse.click(editorRect.x + 2, editorRect.y + 2);

          await dragAndDropAnnotation(
            page,
            editorRect.x + editorRect.width / 2,
            editorRect.y + editorRect.height / 2,
            100,
            100
          );

          serialized = await getSerialized(page);
          expect(serialized.length).withContext(`In ${browserName}`).toEqual(1);
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
          await page.click("#editorFreeText");

          let editorIds = await getEditors(page, "freeText");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(6);

          const editorRect = await page.$eval(getEditorSelector(0), el => {
            const { x, y, width, height } = el.getBoundingClientRect();
            return { x, y, width, height };
          });
          await page.mouse.click(
            editorRect.x + editorRect.width / 2,
            editorRect.y + editorRect.height / 2,
            { clickCount: 2 }
          );

          await page.keyboard.down("Control");
          await page.keyboard.press("End");
          await page.keyboard.up("Control");
          await page.waitForTimeout(10);

          await page.type(
            `${getEditorSelector(0)} .internal`,
            " and edited in Firefox"
          );

          // Commit.
          await page.mouse.click(
            editorRect.x,
            editorRect.y + 2 * editorRect.height
          );

          let serialized = await getSerialized(page);
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
          await page.click("#editorFreeText");
          // We want to check that the editor is displayed but not the original
          // annotation.
          editorIds = await getEditors(page, "freeText");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(1);
          const hidden = await page.$eval(
            "[data-annotation-id='26R']",
            el => el.hidden
          );
          expect(hidden).withContext(`In ${browserName}`).toBeTrue();

          // Re-enable editing mode.
          await page.click("#editorFreeText");
          await page.focus(".annotationEditorLayer");

          // Undo.
          await page.keyboard.down("Control");
          await page.keyboard.press("z");
          await page.keyboard.up("Control");
          await page.waitForTimeout(10);

          serialized = await getSerialized(page);
          expect(serialized).withContext(`In ${browserName}`).toEqual([]);

          editorIds = await getEditors(page, "freeText");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(6);

          // Undo again.
          await page.keyboard.down("Control");
          await page.keyboard.press("z");
          await page.keyboard.up("Control");
          await page.waitForTimeout(10);

          // We check that the editor hasn't been removed.
          editorIds = await getEditors(page, "freeText");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(6);
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
          await page.click("#editorFreeText");

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
          await page.click("#editorFreeText");

          let editorIds = await getEditors(page, "freeText");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(6);

          const editorRect = await page.$eval(getEditorSelector(3), el => {
            const { x, y, width, height } = el.getBoundingClientRect();
            return { x, y, width, height };
          });
          await page.mouse.click(
            editorRect.x + editorRect.width / 2,
            editorRect.y + editorRect.height / 2
          );
          await page.waitForTimeout(10);
          await page.keyboard.press("Backspace");
          await page.waitForTimeout(10);

          let serialized = await getSerialized(page);
          expect(serialized).toEqual([
            {
              pageIndex: 0,
              id: "51R",
              deleted: true,
            },
          ]);

          await page.click("#editorFreeText");
          // We want to check that nothing is displayed.
          editorIds = await getEditors(page, "freeText");
          expect(editorIds.length).withContext(`In ${browserName}`).toEqual(0);
          const hidden = await page.$eval(
            "[data-annotation-id='51R']",
            el => el.hidden
          );
          expect(hidden).withContext(`In ${browserName}`).toBeTrue();

          // Re-enable editing mode.
          await page.click("#editorFreeText");
          await page.focus(".annotationEditorLayer");

          // Undo.
          await page.keyboard.down("Control");
          await page.keyboard.press("z");
          await page.keyboard.up("Control");
          await page.waitForTimeout(10);

          serialized = await getSerialized(page);
          expect(serialized).withContext(`In ${browserName}`).toEqual([]);
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
        await page.click("#editorFreeText");

        const editorIds = await getEditors(page, "freeText");
        expect(editorIds.length).withContext(`In ${browserName}`).toEqual(6);

        const editorRect = await page.$eval(getEditorSelector(1), el => {
          const { x, y, width, height } = el.getBoundingClientRect();
          return { x, y, width, height };
        });
        await page.mouse.click(
          editorRect.x + editorRect.width / 2,
          editorRect.y + editorRect.height / 2
        );

        await copyPaste(page);
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
          await page.click("[data-annotation-id='26R']", { clickCount: 2 });
          await page.waitForTimeout(10);

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
          await page.hover("[data-annotation-id='23R']");
          // Wait for the popup to be displayed.
          await page.waitForFunction(
            `document.querySelector("[data-annotation-id='popup_23R']").hidden === false`
          );

          // Enter in editing mode.
          await page.click("#editorFreeText");
          await page.waitForTimeout(10);
          await page.click("#editorFreeText");

          await page.hover("[data-annotation-id='23R']");
          // Wait for the popup to be displayed.
          await page.waitForFunction(
            `document.querySelector("[data-annotation-id='popup_23R']").hidden === false`
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
            `document.querySelector("[data-annotation-id='popup_20R']").hidden === false`
          );

          // Enter in editing mode.
          await page.click("#editorFreeText");
          // Wait for the popup to be hidden.
          await page.waitForFunction(
            `document.querySelector("[data-annotation-id='popup_20R']").hidden === true`
          );

          // Exit editing mode.
          await page.click("#editorFreeText");
          // Wait for the popup to be visible.
          await page.waitForFunction(
            `document.querySelector("[data-annotation-id='popup_20R']").hidden === false`
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
          await page.keyboard.press("r");
          await page.waitForTimeout(10);
          await page.click("#editorFreeText");

          const rect = await page.$eval(".annotationEditorLayer", el => {
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForTimeout(10);
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

          let serialized = await getSerialized(page);
          let bbox = serialized[0].rect;
          let width = bbox[2] - bbox[0];
          let height = bbox[3] - bbox[1];
          expect(width < height)
            .withContext(`In ${browserName}`)
            .toEqual(true);

          for (let i = 0; i < 3; i++) {
            await page.keyboard.press("r");
            await page.waitForTimeout(10);
          }

          await page.keyboard.down("Control");
          await page.keyboard.press("a");
          await page.keyboard.up("Control");
          await page.waitForTimeout(10);

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
          await page.waitForTimeout(10);

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
          await page.click("#editorFreeText");
          let currentId = 0;
          const oneToFourteen = Array.from(new Array(14).keys(), x => x + 1);

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
            await page.mouse.click(rect.x + 100, rect.y + 100);
            await page.waitForTimeout(10);
            await page.type(`${getEditorSelector(currentId)} .internal`, data);

            // Commit.
            await page.keyboard.press("Escape");
            await page.waitForTimeout(10);

            currentId += 1;
          }

          // Select all.
          await page.keyboard.down("Control");
          await page.keyboard.press("a");
          await page.keyboard.up("Control");
          await page.waitForTimeout(10);

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
          await page.waitForTimeout(10);

          expect(await serialize())
            .withContext(`In ${browserName}`)
            .toEqual([]);
        })
      );
    });
  });

  describe("FreeText (open existing)", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "issue16633.pdf",
        ".annotationEditorLayer",
        100
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must open an existing annotation and check that the position are good", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#editorFreeText");

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
            const rect = await page.$eval(getEditorSelector(n), el => {
              // With Chrome something is wrong when serializing a DomRect,
              // hence we extract the values and just return them.
              const { x, y, width, height } = el.getBoundingClientRect();
              return { x, y, width, height };
            });
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

            await page.evaluate(N => {
              const editor = document.getElementById(
                `pdfjs_internal_editor_${N}`
              );
              const annotationId = editor.getAttribute("annotation-id");
              const annotation = document.querySelector(
                `[data-annotation-id="${annotationId}"]`
              );
              editor.hidden = true;
              annotation.hidden = false;
            }, n);
            await page.waitForTimeout(10);
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
          await page.click("#editorFreeText");

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
            const rect = await page.$eval(getEditorSelector(n), el => {
              // With Chrome something is wrong when serializing a DomRect,
              // hence we extract the values and just return them.
              const { x, y, width, height } = el.getBoundingClientRect();
              return { x, y, width, height };
            });
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

            await page.evaluate(N => {
              const editor = document.getElementById(
                `pdfjs_internal_editor_${N}`
              );
              const annotationId = editor.getAttribute("annotation-id");
              const annotation = document.querySelector(
                `[data-annotation-id="${annotationId}"]`
              );
              editor.hidden = true;
              annotation.hidden = false;
            }, n);
            await page.waitForTimeout(10);
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
          await page.click("#editorFreeText");

          const rect = await page.$eval(".annotationEditorLayer", el => {
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForTimeout(10);
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
          await page.waitForTimeout(10);

          await page.focus("#editorFreeTextColor");

          await page.keyboard.down("Control");
          await page.keyboard.press("z");
          await page.keyboard.up("Control");
          await page.waitForTimeout(10);

          let hasEditor = await page.evaluate(sel => {
            return !!document.querySelector(sel);
          }, getEditorSelector(0));

          expect(hasEditor).withContext(`In ${browserName}`).toEqual(false);

          await page.keyboard.down("Control");
          await page.keyboard.press("y");
          await page.keyboard.up("Control");
          await page.waitForTimeout(10);

          hasEditor = await page.evaluate(sel => {
            return !!document.querySelector(sel);
          }, getEditorSelector(0));

          expect(hasEditor).withContext(`In ${browserName}`).toEqual(true);
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
          await page.click("#editorFreeText");

          const rect = await page.$eval(".annotationEditorLayer", el => {
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 200, rect.y + 200);
          await page.waitForTimeout(10);
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
          await page.waitForTimeout(10);

          const [pageX, pageY] = await getFirstSerialized(page, x => x.rect);

          for (let i = 0; i < 20; i++) {
            await page.keyboard.press("ArrowRight");
            await page.waitForTimeout(1);
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
            await page.waitForTimeout(1);
          }

          [newX, newY] = await getFirstSerialized(page, x => x.rect);
          expect(Math.round(newX))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageX + 20));
          expect(Math.round(newY))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageY - 20));

          for (let i = 0; i < 2; i++) {
            await page.keyboard.down("Control");
            await page.keyboard.press("ArrowLeft");
            await page.keyboard.up("Control");
            await page.waitForTimeout(1);
          }

          [newX, newY] = await getFirstSerialized(page, x => x.rect);
          expect(Math.round(newX))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageX));
          expect(Math.round(newY))
            .withContext(`In ${browserName}`)
            .toEqual(Math.round(pageY - 20));

          for (let i = 0; i < 2; i++) {
            await page.keyboard.down("Control");
            await page.keyboard.press("ArrowUp");
            await page.keyboard.up("Control");
            await page.waitForTimeout(1);
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
          await page.keyboard.down("Control");
          await page.keyboard.press("a");
          await page.keyboard.up("Control");
          await page.waitForTimeout(10);

          await page.focus("#editorFreeTextFontSize");

          const [page1X, , page2X] = await getFirstSerialized(
            page,
            x => x.rect
          );
          const pageWidth = page2X - page1X;

          for (let i = 0; i < 5; i++) {
            await page.keyboard.press("ArrowRight");
            await page.waitForTimeout(1);
          }
          await page.waitForTimeout(10);

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

          const rect = await page.$eval(".annotationEditorLayer", el => {
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForTimeout(10);
          await page.type(`${getEditorSelector(1)} .internal`, data);

          const editorRect = await page.$eval(getEditorSelector(1), el => {
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
          await page.waitForTimeout(10);

          const [pageX, pageY] = await getFirstSerialized(page, x => x.rect);

          await clearAll(page);
          await page.mouse.click(rect.x + 100, rect.y + 100);

          for (let i = 0; i < 20; i++) {
            await page.keyboard.press("ArrowRight");
            await page.waitForTimeout(1);
          }
          await page.waitForTimeout(10);

          for (let i = 0; i < 2; i++) {
            await page.keyboard.down("Control");
            await page.keyboard.press("ArrowDown");
            await page.keyboard.up("Control");
            await page.waitForTimeout(1);
          }
          await page.waitForTimeout(10);

          for (let i = 0; i < 20; i++) {
            await page.keyboard.press("ArrowLeft");
            await page.waitForTimeout(1);
          }
          await page.waitForTimeout(10);

          for (let i = 0; i < 2; i++) {
            await page.keyboard.down("Control");
            await page.keyboard.press("ArrowUp");
            await page.keyboard.up("Control");
            await page.waitForTimeout(1);
          }
          await page.waitForTimeout(10);

          for (let i = 0; i < 2; i++) {
            await page.keyboard.down("Control");
            await page.keyboard.press("ArrowRight");
            await page.keyboard.up("Control");
            await page.waitForTimeout(1);
          }
          await page.waitForTimeout(10);

          for (let i = 0; i < 2; i++) {
            await page.keyboard.down("Control");
            await page.keyboard.press("ArrowLeft");
            await page.keyboard.up("Control");
            await page.waitForTimeout(1);
          }
          await page.waitForTimeout(10);

          await page.type(`${getEditorSelector(2)} .internal`, data);
          await page.keyboard.press("Escape");
          await page.waitForTimeout(10);

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
          await page.click("#editorFreeText");
          await page.waitForTimeout(10);

          const rect = await page.$eval(".annotationEditorLayer", el => {
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForTimeout(10);
          await page.type(`${getEditorSelector(0)} .internal`, data);
          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForTimeout(10);

          const oneToFourteen = Array.from(new Array(14).keys(), x => x + 1);

          for (const pageNumber of oneToFourteen) {
            const pageSelector = `.page[data-page-number = "${pageNumber}"]`;

            await page.evaluate(selector => {
              const element = window.document.querySelector(selector);
              element.scrollIntoView();
            }, pageSelector);

            const annotationLayerSelector = `${pageSelector} > .annotationEditorLayer:not([hidden])`;
            await page.waitForSelector(annotationLayerSelector, {
              visible: true,
              timeout: 0,
            });
            await page.waitForTimeout(10);
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
          await page.click("#editorFreeText");

          const rect = await page.$eval(".annotationEditorLayer", el => {
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForTimeout(10);
          await page.type(`${getEditorSelector(0)} .internal`, "A");

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForTimeout(10);

          await page.mouse.click(rect.x + 110, rect.y + 150);
          await page.waitForTimeout(10);
          await page.type(`${getEditorSelector(0)} .internal`, "B");

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForTimeout(10);

          await page.mouse.click(rect.x + 115, rect.y + 155);
          await page.waitForTimeout(10);

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

          for (let i = 0; i < 6; i++) {
            await page.keyboard.down("Control");
            await page.keyboard.press("ArrowUp");
            await page.keyboard.up("Control");
            await page.waitForTimeout(1);
          }

          await page.waitForTimeout(100);
          const focused = await page.evaluate(sel => {
            const editor = document.querySelector(sel);
            return editor === document.activeElement;
          }, getEditorSelector(1));
          expect(focused).withContext(`In ${browserName}`).toEqual(true);

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
          await page.click("#editorFreeText");

          const rect = await page.$eval(".annotationEditorLayer", el => {
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          const allPositions = [];

          for (let i = 0; i < 10; i++) {
            await page.mouse.click(rect.x + 10 + 30 * i, rect.y + 100 + 5 * i);
            await page.waitForTimeout(10);
            await page.type(
              `${getEditorSelector(i)} .internal`,
              String.fromCharCode(65 + i)
            );

            // Commit.
            await page.keyboard.press("Escape");
            await page.waitForTimeout(10);

            allPositions.push(
              await page.$eval(getEditorSelector(i), el => {
                const { x, y } = el.getBoundingClientRect();
                return { x, y };
              })
            );
          }

          await page.keyboard.down("Control");
          await page.keyboard.press("a");
          await page.keyboard.up("Control");

          await page.waitForTimeout(10);
          await dragAndDropAnnotation(page, rect.x + 161, rect.y + 126, 39, 74);
          await page.waitForTimeout(10);

          for (let i = 0; i < 10; i++) {
            const pos = await page.$eval(getEditorSelector(i), el => {
              const { x, y } = el.getBoundingClientRect();
              return { x, y };
            });
            const oldPos = allPositions[i];
            expect(Math.round(pos.x - oldPos.x))
              .withContext(`In ${browserName}`)
              .toEqual(39);
            expect(Math.round(pos.y - oldPos.y))
              .withContext(`In ${browserName}`)
              .toEqual(74);
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
          await page.click("#editorFreeText");

          const rect = await page.$eval(".annotationEditorLayer", el => {
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.waitForTimeout(10);
          await page.type(`${getEditorSelector(0)} .internal`, data);
          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForTimeout(10);

          await page.evaluate(() => {
            window.editingEvents = [];
          });
          await page.waitForTimeout(10);

          for (let pageNumber = 1; pageNumber <= 4; pageNumber++) {
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
          await page.click("#editorFreeText");

          const page1Selector = `.page[data-page-number = "1"] > .annotationEditorLayer`;
          let rect = await page.$eval(page1Selector, el => {
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });
          await page.mouse.click(rect.x + 10, rect.y + 10);
          await page.waitForTimeout(10);
          await page.type(`${getEditorSelector(0)} .internal`, "Hello");

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForTimeout(10);

          // Go to the last page.
          await page.keyboard.press("End");
          await page.waitForTimeout(10);

          const page14Selector = `.page[data-page-number = "14"] > .annotationEditorLayer`;
          await page.waitForSelector(page14Selector, {
            visible: true,
            timeout: 0,
          });
          await page.waitForTimeout(10);

          rect = await page.$eval(page14Selector, el => {
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });
          await page.mouse.click(rect.x + 10, rect.y + 10);
          await page.waitForTimeout(10);
          await page.type(`${getEditorSelector(0)} .internal`, "World");

          await page.keyboard.press("Escape");
          await page.waitForTimeout(10);

          for (let i = 0; i <= 13; i++) {
            await page.keyboard.press("P");
            await page.waitForTimeout(10);
          }

          await page.waitForSelector(getEditorSelector(0), {
            visible: true,
            timeout: 0,
          });
          await page.waitForTimeout(10);

          rect = await page.$eval(getEditorSelector(0), el => {
            const { x, y, width, height } = el.getBoundingClientRect();
            return {
              x,
              y,
              width,
              height,
            };
          });
          await page.mouse.click(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2
          );

          const content = await page.$eval(getEditorSelector(0), el =>
            el.innerText.trimEnd()
          );
          expect(content).withContext(`In ${browserName}`).toEqual("Hello");
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
          await page.click("#editorFreeText");

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
          await page.waitForTimeout(10);
          await page.type(`${getEditorSelector(0)} .internal`, "Hello Wolrd");

          // Commit.
          await page.keyboard.press("Escape");
          await page.waitForTimeout(10);

          await waitForStorageEntries(page, 1);

          const id = await getFirstSerialized(page, x => x.structTreeParentId);
          expect(id).withContext(`In ${browserName}`).toEqual(parentId);
        })
      );
    });
  });
});
