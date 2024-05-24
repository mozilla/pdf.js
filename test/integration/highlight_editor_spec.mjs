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
  getFirstSerialized,
  getRect,
  getSerialized,
  getSpanRectFromText,
  kbBigMoveLeft,
  kbBigMoveUp,
  kbFocusNext,
  kbFocusPrevious,
  kbSelectAll,
  kbUndo,
  loadAndWait,
  scrollIntoView,
  switchToEditor,
  waitForSerialized,
} from "./test_utils.mjs";

const selectAll = async page => {
  await kbSelectAll(page);
  await page.waitForFunction(
    () => !document.querySelector(".highlightEditor:not(.selectedEditor)")
  );
};

const waitForPointerUp = page =>
  createPromise(page, resolve => {
    window.addEventListener("pointerup", resolve, { once: true });
  });

const switchToHighlight = switchToEditor.bind(null, "Highlight");

const getXY = async (page, selector) => {
  const rect = await getRect(page, selector);
  return `${rect.x}::${rect.y}`;
};

describe("Highlight Editor", () => {
  describe("Editor must be removed without exception", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must scroll and check that the draw layer is there", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          // Here and elsewhere, we add a small delay between press and release
          // to make sure that a pointerup event is triggered after
          // selectionchange.
          // It works with a value of 1ms, but we use 100ms to be sure.
          await page.mouse.click(x, y, { count: 2, delay: 100 });

          await page.waitForSelector(`${getEditorSelector(0)}`);

          const oneToOne = Array.from(new Array(13).keys(), n => n + 2).concat(
            Array.from(new Array(13).keys(), n => 13 - n)
          );
          for (const pageNumber of oneToOne) {
            await scrollIntoView(
              page,
              `.page[data-page-number = "${pageNumber}"]`
            );
          }

          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlight`,
            {
              visible: true,
            }
          );
        })
      );
    });
  });

  describe("Editor must keep selected", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must scroll and check that the highlight is selected", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });

          await page.waitForSelector(`${getEditorSelector(0)}`);
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlightOutline.selected`
          );

          const oneToOne = Array.from(new Array(13).keys(), n => n + 2).concat(
            Array.from(new Array(13).keys(), n => 13 - n)
          );
          for (const pageNumber of oneToOne) {
            await scrollIntoView(
              page,
              `.page[data-page-number = "${pageNumber}"]`
            );
          }

          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlightOutline.selected`
          );
        })
      );
    });
  });

  describe("The default color must have the correct value", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        null,
        null,
        { highlightEditorColors: "red=#AB0000" }
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must highlight with red color", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });

          await page.waitForSelector(`${getEditorSelector(0)}`);
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlightOutline.selected`
          );

          const usedColor = await page.evaluate(() => {
            const highlight = document.querySelector(
              `.page[data-page-number = "1"] .canvasWrapper > svg.highlight`
            );
            return highlight.getAttribute("fill");
          });

          expect(usedColor).withContext(`In ${browserName}`).toEqual("#AB0000");
        })
      );
    });
  });

  describe("Invisible editor must change its color", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        null,
        null,
        { highlightEditorColors: "yellow=#FFFF98,green=#53FFBC" }
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must scroll and change the color without exceptions", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          let rect = await getSpanRectFromText(page, 1, "Abstract");
          let x = rect.x + rect.width / 2;
          let y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });

          await page.waitForSelector(`${getEditorSelector(0)}`);
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlightOutline.selected`
          );

          for (const pageNumber of Array.from(
            new Array(13).keys(),
            n => n + 2
          )) {
            await scrollIntoView(
              page,
              `.page[data-page-number = "${pageNumber}"]`
            );
          }
          await page.waitForSelector(
            `.page[data-page-number = "14"] .textLayer .endOfContent`
          );

          rect = await getSpanRectFromText(page, 14, "References");
          x = rect.x + rect.width / 2;
          y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });
          await page.waitForSelector(`${getEditorSelector(1)}`);
          await page.waitForSelector(
            `.page[data-page-number = "14"] svg.highlightOutline.selected`
          );
          await selectAll(page);
          await page.waitForSelector(
            `${getEditorSelector(1)} .editToolbar button.colorPicker`
          );
          await page.click(
            `${getEditorSelector(1)} .editToolbar button.colorPicker`
          );
          await page.waitForSelector(
            `${getEditorSelector(1)} .editToolbar button[title = "Green"]`
          );
          await page.click(
            `${getEditorSelector(1)} .editToolbar button[title = "Green"]`
          );
          await page.waitForSelector(
            `.page[data-page-number = "14"] svg.highlight[fill = "#53FFBC"]`
          );

          for (const pageNumber of Array.from(
            new Array(13).keys(),
            n => 13 - n
          )) {
            await scrollIntoView(
              page,
              `.page[data-page-number = "${pageNumber}"]`
            );
          }

          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlight[fill = "#53FFBC"]`
          );
        })
      );
    });
  });

  describe("Highlight data serialization", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        null,
        null,
        { highlightEditorColors: "red=#AB0000" }
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must be correctly serialized", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });

          await page.waitForSelector(`${getEditorSelector(0)}`);
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlightOutline.selected`
          );

          await waitForSerialized(page, 1);
          const serialized = (await getSerialized(page))[0];
          expect(serialized.annotationType)
            .withContext(`In ${browserName}`)
            .toEqual(9);
          expect(serialized.color)
            .withContext(`In ${browserName}`)
            .toEqual([0xab, 0, 0]);

          // We don't check the quadPoints and outlines values because they're
          // dependent on the font used in the text layer.
          expect(serialized.quadPoints.length)
            .withContext(`In ${browserName}`)
            .toEqual(8);
          expect(serialized.outlines.length)
            .withContext(`In ${browserName}`)
            .toEqual(1);
          expect(serialized.outlines[0].length)
            .withContext(`In ${browserName}`)
            .toEqual(8);
        })
      );
    });
  });

  describe("Color picker and keyboard", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        null,
        null,
        {
          highlightEditorColors:
            "yellow=#FFFF00,green=#00FF00,blue=#0000FF,pink=#FF00FF,red=#FF0000",
        }
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that we can use the keyboard to select a color", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);
          const sel = getEditorSelector(0);

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });

          await page.waitForSelector(sel);
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlightOutline.selected`
          );

          await page.waitForSelector(`${sel} .editToolbar button.colorPicker`);
          await page.click(`${sel} .editToolbar button.colorPicker`);
          await page.waitForSelector(
            `${sel} .editToolbar button[title = "Red"]`
          );
          await page.click(`${sel} .editToolbar button[title = "Red"]`);
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlight[fill = "#FF0000"]`
          );

          await page.keyboard.press("ArrowUp");
          await page.waitForSelector(
            `${sel} .editToolbar button[title = "Pink"]:focus`
          );
          await page.keyboard.press("Enter");
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlight[fill = "#FF00FF"]`
          );

          await page.keyboard.press("ArrowUp");
          await page.waitForSelector(
            `${sel} .editToolbar button[title = "Blue"]:focus`
          );
          await page.keyboard.press(" ");
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlight[fill = "#0000FF"]`
          );

          await page.keyboard.press("ArrowLeft");
          await page.waitForSelector(
            `${sel} .editToolbar button[title = "Green"]:focus`
          );
          await page.keyboard.press("Enter");
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlight[fill = "#00FF00"]`
          );

          await page.keyboard.press("ArrowRight");
          await page.waitForSelector(
            `${sel} .editToolbar button[title = "Blue"]:focus`
          );
          await page.keyboard.press("Enter");
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlight[fill = "#0000FF"]`
          );

          await page.keyboard.press("ArrowDown");
          await page.waitForSelector(
            `${sel} .editToolbar button[title = "Pink"]:focus`
          );
          await page.keyboard.press(" ");
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlight[fill = "#FF00FF"]`
          );

          for (let i = 0; i < 4; i++) {
            await page.keyboard.press("ArrowUp");
          }
          await page.waitForSelector(
            `${sel} .editToolbar button.colorPicker .dropdown.hidden`
          );
          await page.keyboard.press("ArrowDown");
          await page.waitForSelector(
            `${sel} .editToolbar button.colorPicker .dropdown:not(.hidden)`
          );
          await page.keyboard.press("ArrowUp");
          await page.waitForSelector(
            `${sel} .editToolbar button.colorPicker .dropdown.hidden`
          );
          await page.keyboard.press(" ");
          await page.waitForSelector(
            `${sel} .editToolbar button.colorPicker .dropdown:not(.hidden)`
          );
        })
      );
    });
  });

  describe("Text highlights aren't draggable", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        null,
        null,
        { highlightEditorColors: "red=#AB0000" }
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a text highlight don't move when arrows are pressed", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });

          await page.waitForSelector(`${getEditorSelector(0)}`);
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlightOutline.selected`
          );
          await page.focus(getEditorSelector(0));

          const xy = await getXY(page, getEditorSelector(0));
          for (let i = 0; i < 5; i++) {
            await kbBigMoveLeft(page);
          }
          expect(await getXY(page, getEditorSelector(0)))
            .withContext(`In ${browserName}`)
            .toEqual(xy);

          for (let i = 0; i < 5; i++) {
            await kbBigMoveUp(page);
          }
          expect(await getXY(page, getEditorSelector(0)))
            .withContext(`In ${browserName}`)
            .toEqual(xy);
        })
      );
    });
  });

  describe("Color picker and click outside", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the dropdown is hidden", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);
          const sel = getEditorSelector(0);

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });

          await page.waitForSelector(sel);
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlightOutline.selected`
          );

          await page.waitForSelector(`${sel} .editToolbar button.colorPicker`);
          await page.click(`${sel} .editToolbar button.colorPicker`);
          await page.waitForSelector(
            `${sel} .editToolbar button[title = "Red"]`
          );
          await page.mouse.click(x, y - rect.height);
          await page.waitForSelector(
            `${sel} .editToolbar button.colorPicker .dropdown.hidden`
          );
        })
      );
    });
  });

  describe("Color picker can annoy the user when selecting some text", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that editor is unselected when the mouse is down on the text layer", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);
          const sel = getEditorSelector(0);

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });

          await page.waitForSelector(sel);
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlightOutline.selected`
          );

          await page.waitForSelector(`${sel} .editToolbar button.colorPicker`);
          await page.mouse.click(x, y - rect.height);
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlightOutline:not(.selected)`
          );
        })
      );
    });
  });

  describe("Free highlight thickness can be changed", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "empty.pdf",
        ".annotationEditorLayer",
        null,
        null,
        { highlightEditorColors: "yellow=#000000" }
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the thickness is correctly updated", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          for (let i = 0; i < 3; i++) {
            const x = rect.x + 120 + i * 120;
            const y = rect.y + 120 + i * 120;
            const clickHandle = await waitForPointerUp(page);
            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.mouse.move(x + 100, y + 100);
            await page.mouse.up();
            await awaitPromise(clickHandle);

            await page.waitForSelector(getEditorSelector(i));
          }

          let value = 12;
          await waitForSerialized(page, 3);
          let serialized = await getSerialized(page);
          expect(serialized.map(x => x.thickness))
            .withContext(`In ${browserName}`)
            .toEqual([value, value, value]);

          await selectAll(page);

          const { width: prevWidth } = await getRect(
            page,
            getEditorSelector(0)
          );

          value = 24;
          page.evaluate(val => {
            window.PDFViewerApplication.eventBus.dispatch(
              "switchannotationeditorparams",
              {
                source: null,
                type: window.pdfjsLib.AnnotationEditorParamsType
                  .HIGHLIGHT_THICKNESS,
                value: val,
              }
            );
          }, value);

          await page.waitForFunction(
            (w, sel) =>
              document.querySelector(sel).getBoundingClientRect().width !== w,
            {},
            prevWidth,
            getEditorSelector(0)
          );

          await waitForSerialized(page, 3);
          serialized = await getSerialized(page);
          expect(serialized.map(x => x.thickness))
            .withContext(`In ${browserName}`)
            .toEqual([value, value, value]);
        })
      );
    });
  });

  describe("Highlight with the keyboard", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that some text has been highlighted", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);
          const sel = getEditorSelector(0);

          const spanRect = await getRect(
            page,
            `.page[data-page-number="1"] > .textLayer > span`
          );
          await page.keyboard.down("Shift");
          await page.mouse.click(
            spanRect.x + 1,
            spanRect.y + spanRect.height / 2,
            { count: 2 }
          );
          for (let i = 0; i < 6; i++) {
            await page.keyboard.press("ArrowRight");
          }
          await page.keyboard.press("ArrowDown");
          await page.keyboard.press("ArrowDown");
          await page.keyboard.up("Shift");

          const [w, h] = await page.evaluate(s => {
            const {
              style: { width, height },
            } = document.querySelector(s);
            return [parseFloat(width), parseFloat(height)];
          }, sel);

          // w & h are the width and height of the highlight in percent.
          // We expect the highlight to be around 73% wide and 9% high.
          // We allow a 2% margin of error because of the font used in the text
          // layer we can't be sure of the dimensions.
          expect(Math.abs(w - 73) <= 2)
            .withContext(`In ${browserName}`)
            .toBe(true);
          expect(Math.abs(h - 9) <= 2)
            .withContext(`In ${browserName}`)
            .toBe(true);
        })
      );
    });
  });

  describe("Free highlight is drawn at the right place after having been rotated (bug 1879108)", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "empty.pdf",
        ".annotationEditorLayer",
        null,
        null,
        { highlightEditorColors: "yellow=#000000" }
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that highlight is at the correct position", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(rect.x + 120, rect.y + 120);
          await page.mouse.down();
          await page.mouse.move(rect.x + 220, rect.y + 220);
          await page.mouse.up();
          await awaitPromise(clickHandle);

          await page.waitForSelector(getEditorSelector(0));

          await page.evaluate(() => {
            window.PDFViewerApplication.rotatePages(90);
          });
          await page.waitForSelector(
            ".annotationEditorLayer[data-main-rotation='90']"
          );
          await selectAll(page);

          const { width: prevWidth } = await getRect(
            page,
            getEditorSelector(0)
          );

          page.evaluate(val => {
            window.PDFViewerApplication.eventBus.dispatch(
              "switchannotationeditorparams",
              {
                source: null,
                type: window.pdfjsLib.AnnotationEditorParamsType
                  .HIGHLIGHT_THICKNESS,
                value: val,
              }
            );
          }, 24);

          await page.waitForFunction(
            (w, sel) =>
              document.querySelector(sel).getBoundingClientRect().width !== w,
            {},
            prevWidth,
            getEditorSelector(0)
          );

          const rectDiv = await getRect(page, getEditorSelector(0));
          const rectSVG = await getRect(page, "svg.highlight.free");

          expect(Math.abs(rectDiv.x - rectSVG.x) <= 2)
            .withContext(`In ${browserName}`)
            .toBe(true);
          expect(Math.abs(rectDiv.y - rectSVG.y) <= 2)
            .withContext(`In ${browserName}`)
            .toBe(true);
          expect(Math.abs(rectDiv.height - rectSVG.height) <= 2)
            .withContext(`In ${browserName}`)
            .toBe(true);
          expect(Math.abs(rectDiv.width - rectSVG.width) <= 2)
            .withContext(`In ${browserName}`)
            .toBe(true);
        })
      );
    });
  });

  describe("Highlight links", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "bug1868759.pdf",
        ".annotationEditorLayer",
        null,
        null,
        { highlightEditorColors: "red=#AB0000" }
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that it's possible to highlight a part of a link", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          const rect = await getSpanRectFromText(
            page,
            1,
            "Questions courantes"
          );
          const x = rect.x + 0.75 * rect.width;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });

          await page.waitForSelector(`${getEditorSelector(0)}`);
          const usedColor = await page.evaluate(() => {
            const highlight = document.querySelector(
              `.page[data-page-number = "1"] .canvasWrapper > svg.highlight`
            );
            return highlight.getAttribute("fill");
          });

          expect(usedColor).withContext(`In ${browserName}`).toEqual("#AB0000");
        })
      );
    });
  });

  describe("Highlight forms", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "issue12233.pdf",
        ".annotationEditorLayer",
        null,
        null,
        { highlightEditorColors: "red=#AB0000" }
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that it's possible to highlight a part of a form", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          const rect1 = await getRect(page, "#pdfjs_internal_id_5R");
          const rect2 = await getRect(page, "#pdfjs_internal_id_16R");

          const x1 = rect1.x + rect1.width / 2;
          const y1 = rect1.y + rect1.height / 2;
          const x2 = rect2.x + rect2.width / 2;
          const y2 = rect2.y + rect2.height / 2;
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(x1, y1);
          await page.mouse.down();
          await page.mouse.move(x2, y2);
          await page.mouse.up();
          await awaitPromise(clickHandle);

          await page.waitForSelector(getEditorSelector(0));
          const usedColor = await page.evaluate(() => {
            const highlight = document.querySelector(
              `.page[data-page-number = "1"] .canvasWrapper > svg.highlight`
            );
            return highlight.getAttribute("fill");
          });

          expect(usedColor).withContext(`In ${browserName}`).toEqual("#AB0000");
        })
      );
    });
  });

  describe("Send a message when some text is selected", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        `.page[data-page-number = "1"] .endOfContent`,
        null,
        async page => {
          await page.waitForFunction(async () => {
            await window.PDFViewerApplication.initializedPromise;
            return true;
          });
          await page.evaluate(() => {
            window.editingEvents = [];
            window.PDFViewerApplication.eventBus.on(
              "annotationeditorstateschanged",
              ({ details }) => {
                window.editingEvents.push(details);
              }
            );
          });
        },
        { highlightEditorColors: "red=#AB0000" }
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a message is sent on selection", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });
          await page.waitForFunction(() => window.editingEvents.length > 0);

          let editingEvent = await page.evaluate(() => {
            const e = window.editingEvents[0];
            window.editingEvents.length = 0;
            return e;
          });
          expect(editingEvent.isEditing)
            .withContext(`In ${browserName}`)
            .toBe(false);
          expect(editingEvent.hasSelectedText)
            .withContext(`In ${browserName}`)
            .toBe(true);

          // Click somewhere to unselect the current selection.
          await page.mouse.click(rect.x + rect.width + 10, y, { count: 1 });
          await page.waitForFunction(() => window.editingEvents.length > 0);
          editingEvent = await page.evaluate(() => {
            const e = window.editingEvents[0];
            window.editingEvents.length = 0;
            return e;
          });
          expect(editingEvent.hasSelectedText)
            .withContext(`In ${browserName}`)
            .toBe(false);

          await page.mouse.click(x, y, { count: 2, delay: 100 });
          await page.waitForFunction(() => window.editingEvents.length > 0);

          await page.evaluate(() => {
            window.PDFViewerApplication.eventBus.dispatch("editingaction", {
              name: "highlightSelection",
            });
          });

          await page.waitForSelector(getEditorSelector(0));
          const usedColor = await page.evaluate(() => {
            const highlight = document.querySelector(
              `.page[data-page-number = "1"] .canvasWrapper > svg.highlight`
            );
            return highlight.getAttribute("fill");
          });

          expect(usedColor).withContext(`In ${browserName}`).toEqual("#AB0000");
        })
      );
    });
  });

  describe("Highlight and caret browsing", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        null,
        async page => {
          await page.evaluate(async () => {
            await window.PDFViewerApplication.initializedPromise;
            window.PDFViewerApplication.eventBus.on(
              "annotationeditoruimanager",
              ({ uiManager }) => {
                window.uiManager = uiManager;
              }
            );
          });
        },
        {
          highlightEditorColors: "red=#AB0000",
          supportsCaretBrowsingMode: true,
        }
      );
    });

    afterEach(async () => {
      for (const [, page] of pages) {
        await page.evaluate(() => {
          window.uiManager.reset();
        });
        // Disable editing mode.
        await switchToHighlight(page, /* disable */ true);
      }
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the caret can move a highlighted text", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });
          await page.waitForSelector(`${getEditorSelector(0)}`);
          await page.keyboard.press("Escape");
          await page.waitForSelector(
            `${getEditorSelector(0)}:not(.selectedEditor)`
          );

          await page.evaluate(() => {
            const text =
              "Dynamic languages such as JavaScript are more difﬁcult to com-";
            for (const el of document.querySelectorAll(
              `.page[data-page-number="${1}"] > .textLayer > span`
            )) {
              if (el.textContent === text) {
                window.getSelection().setPosition(el.firstChild, 1);
                break;
              }
            }
          });

          await page.keyboard.press("ArrowUp");
          const [text, offset] = await page.evaluate(() => {
            const selection = window.getSelection();
            return [selection.anchorNode.textContent, selection.anchorOffset];
          });

          expect(text).withContext(`In ${browserName}`).toEqual("Abstract");
          expect(offset).withContext(`In ${browserName}`).toEqual(1);
        })
      );
    });

    it("must check that selection is correctly highlighted on arrow down key pressed", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          await page.evaluate(() => {
            const text =
              "Dynamic languages such as JavaScript are more difﬁcult to com-";
            for (const el of document.querySelectorAll(
              `.page[data-page-number="${1}"] > .textLayer > span`
            )) {
              if (el.textContent === text) {
                window.getSelection().setPosition(el.firstChild, 15);
                break;
              }
            }
          });

          await page.keyboard.down("Shift");
          await page.keyboard.press("ArrowDown");
          await page.keyboard.up("Shift");

          await page.waitForSelector(getEditorSelector(0));
          const usedColor = await page.evaluate(() => {
            const highlight = document.querySelector(
              `.page[data-page-number = "1"] .canvasWrapper > svg.highlight`
            );
            return highlight.getAttribute("fill");
          });

          expect(usedColor).withContext(`In ${browserName}`).toEqual("#AB0000");
        })
      );
    });

    it("must check that an highlight can be left with the keyboard", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          if (browserName === "chrome") {
            // Unfortunately, we can't test this on Chrome because we can't set
            // the caret browsing mode to true.
            return;
          }

          let rect = await getSpanRectFromText(
            page,
            1,
            "Dynamic languages such as JavaScript are more difﬁcult to com-"
          );
          await page.mouse.click(rect.x + 5, rect.y + rect.height / 2);
          await page.keyboard.down("Shift");
          for (let i = 0; i < 10; i++) {
            await page.keyboard.press("ArrowRight");
          }
          const focusOffset = await page.evaluate(
            () => window.getSelection().focusOffset
          );
          await page.keyboard.up("Shift");

          await page.waitForSelector(getEditorSelector(0));

          for (let i = 0; i < 5; i++) {
            await page.keyboard.press("ArrowRight");
          }

          let offset = await page.evaluate(
            () => window.getSelection().anchorOffset
          );

          expect(offset)
            .withContext(`In ${browserName}`)
            .toEqual(focusOffset + 4);

          rect = await getSpanRectFromText(
            page,
            1,
            "experience and enable a new generation of applications, virtual ma-"
          );
          await page.mouse.click(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2
          );
          await page.keyboard.down("Shift");
          for (let i = 0; i < 10; i++) {
            await page.keyboard.press("ArrowRight");
          }
          const anchorOffset = await page.evaluate(
            () => window.getSelection().anchorOffset
          );
          await page.keyboard.up("Shift");

          await page.waitForSelector(getEditorSelector(1));

          for (let i = 0; i < 5; i++) {
            await page.keyboard.press("ArrowLeft");
          }

          offset = await page.evaluate(
            () => window.getSelection().anchorOffset
          );

          expect(offset)
            .withContext(`In ${browserName}`)
            .toEqual(anchorOffset - 4);
        })
      );
    });
  });

  describe("Editor must be removed in using the space key on the delete button", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the highlight has been deleted", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });

          await page.waitForSelector(getEditorSelector(0));
          await waitForSerialized(page, 1);
          await page.waitForSelector(`${getEditorSelector(0)} button.delete`);

          await page.focus(`${getEditorSelector(0)} button.delete`);
          await page.keyboard.press(" ");

          await waitForSerialized(page, 0);
        })
      );
    });
  });

  describe("Thickness must be enabled when there's no selected highlights", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check the thickness input state", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          let rect = await getSpanRectFromText(page, 1, "Abstract");
          await page.mouse.click(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
            { count: 2, delay: 100 }
          );

          await page.waitForSelector(getEditorSelector(0));

          rect = await getRect(page, ".annotationEditorLayer");

          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(rect.x + 5, rect.y + 5);
          await page.mouse.down();
          await page.mouse.move(rect.x + 100, rect.y + 100);
          await page.mouse.up();
          await awaitPromise(clickHandle);

          await page.waitForSelector(getEditorSelector(1));
          await page.waitForSelector(
            "#editorFreeHighlightThickness:not([disabled])"
          );

          await page.click(getEditorSelector(0));
          await page.waitForSelector(getEditorSelector(0));
          await page.waitForSelector("#editorFreeHighlightThickness[disabled]");

          await switchToHighlight(page, /* disable */ true);
          await switchToHighlight(page);

          await page.waitForSelector(
            "#editorFreeHighlightThickness:not([disabled])"
          );
        })
      );
    });
  });

  describe("Quadpoints must be correct", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the quadpoints for an highlight are almost correct", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          const rect = await getSpanRectFromText(page, 1, "Languages");
          await page.mouse.click(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
            { count: 2, delay: 100 }
          );

          await page.waitForSelector(getEditorSelector(0));
          await waitForSerialized(page, 1);
          const quadPoints = await getFirstSerialized(page, e => e.quadPoints);
          const expected = [263, 674, 346, 674, 263, 696, 346, 696];
          expect(quadPoints.every((x, i) => Math.abs(x - expected[i]) <= 5))
            .withContext(`In ${browserName}`)
            .toBeTrue();
        })
      );
    });
  });

  describe("Editor must be unselected when the color picker is Escaped", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the highlight editor is unselected", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });

          await page.waitForSelector(getEditorSelector(0));
          await page.focus(`${getEditorSelector(0)} button.colorPicker`);

          await page.keyboard.press("Escape");
          await page.focus(`${getEditorSelector(0)}:not(selectedEditor)`);
        })
      );
    });
  });

  describe("Highlight editor mustn't be moved when close to the page limits", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check the editor coordinates", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          const rect = await getRect(page, ".annotationEditorLayer");

          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(rect.x + 1, rect.y + 50);
          await page.mouse.down();
          await page.mouse.move(rect.x + 1, rect.y + 100);
          await page.mouse.up();
          await awaitPromise(clickHandle);

          await page.waitForSelector(getEditorSelector(0));

          const { x: editorX } = await getRect(page, getEditorSelector(0));

          expect(editorX < rect.x)
            .withContext(`In ${browserName}`)
            .toBeTrue();
        })
      );
    });
  });

  describe("Show/hide all the highlights", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the highlights are correctly hidden/shown", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          let rect = await getRect(page, ".annotationEditorLayer");
          const clickHandle = await waitForPointerUp(page);
          await page.mouse.move(rect.x + 20, rect.y + 20);
          await page.mouse.down();
          await page.mouse.move(rect.x + 20, rect.y + 120);
          await page.mouse.up();
          await awaitPromise(clickHandle);
          await page.waitForSelector(getEditorSelector(0));

          rect = await getSpanRectFromText(page, 1, "Languages");
          await page.mouse.click(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
            { count: 2, delay: 100 }
          );
          await page.waitForSelector(getEditorSelector(1));

          await page.click("#editorHighlightShowAll");
          await page.waitForSelector(`${getEditorSelector(0)}.hidden`);
          await page.waitForSelector(`${getEditorSelector(1)}.hidden`);

          await page.click("#editorHighlightShowAll");
          await page.waitForSelector(`${getEditorSelector(0)}:not(.hidden)`);
          await page.waitForSelector(`${getEditorSelector(1)}:not(.hidden)`);

          await page.click("#editorHighlightShowAll");
          await page.waitForSelector(`${getEditorSelector(0)}.hidden`);
          await page.waitForSelector(`${getEditorSelector(1)}.hidden`);

          const oneToOne = Array.from(new Array(13).keys(), n => n + 2).concat(
            Array.from(new Array(13).keys(), n => 13 - n)
          );
          for (const pageNumber of oneToOne) {
            await scrollIntoView(
              page,
              `.page[data-page-number = "${pageNumber}"]`
            );
            if (pageNumber === 14) {
              await page.click("#editorHighlightShowAll");
            }
          }

          await page.waitForSelector(`${getEditorSelector(0)}:not(.hidden)`);
          await page.waitForSelector(`${getEditorSelector(1)}:not(.hidden)`);
        })
      );
    });
  });

  describe("Highlight from floating highlight button", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        null,
        null,
        { highlightEditorColors: "red=#AB0000" }
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that clicking on the highlight floating button triggers an highlight", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });

          await page.waitForSelector(".textLayer .highlightButton");
          await page.click(".textLayer .highlightButton");

          await page.waitForSelector(getEditorSelector(0));
          const usedColor = await page.evaluate(() => {
            const highlight = document.querySelector(
              `.page[data-page-number = "1"] .canvasWrapper > svg.highlight`
            );
            return highlight.getAttribute("fill");
          });

          expect(usedColor).withContext(`In ${browserName}`).toEqual("#AB0000");
        })
      );
    });
  });

  describe("Text layer must have the focus before highlights", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check the focus order", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          let rect = await getSpanRectFromText(page, 1, "Abstract");
          let x = rect.x + rect.width / 2;
          let y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });
          await page.waitForSelector(getEditorSelector(0));

          rect = await getSpanRectFromText(page, 1, "Languages");
          x = rect.x + rect.width / 2;
          y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });
          await page.waitForSelector(getEditorSelector(1));
          await page.focus(getEditorSelector(1));

          await kbFocusPrevious(page);
          await page.waitForSelector(
            `.page[data-page-number="1"] > .textLayer:focus`
          );

          await kbFocusNext(page);
          await page.waitForSelector(`${getEditorSelector(1)}:focus`);
        })
      );
    });
  });

  describe("Undo a highlight", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a highlight can be undone", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });
          await page.waitForSelector(getEditorSelector(0));
          await waitForSerialized(page, 1);

          await page.waitForSelector(`${getEditorSelector(0)} button.delete`);
          await page.click(`${getEditorSelector(0)} button.delete`);
          await waitForSerialized(page, 0);

          await kbUndo(page);
          await waitForSerialized(page, 1);
          await page.waitForSelector(getEditorSelector(0));
        })
      );
    });
  });

  describe("Delete a highlight and undo it an other page", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        null,
        null,
        {
          highlightEditorColors:
            "yellow=#FFFF00,green=#00FF00,blue=#0000FF,pink=#FF00FF,red=#FF0000",
        }
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a highlight can be undone", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });
          await page.waitForSelector(getEditorSelector(0));
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
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlight[fill = "#FFFF00"]`
          );
        })
      );
    });
  });

  describe("Delete a highlight, scroll and undo it", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".annotationEditorLayer",
        null,
        null,
        {
          highlightEditorColors:
            "yellow=#FFFF00,green=#00FF00,blue=#0000FF,pink=#FF00FF,red=#FF0000",
        }
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that a highlight can be undone", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToHighlight(page);

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2, delay: 100 });
          await page.waitForSelector(getEditorSelector(0));
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
          await page.waitForSelector(
            `.page[data-page-number = "1"] svg.highlight[fill = "#FFFF00"]`
          );
        })
      );
    });
  });
});
