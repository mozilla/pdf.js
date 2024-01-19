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
  closePages,
  getEditorSelector,
  getSerialized,
  kbBigMoveLeft,
  kbBigMoveUp,
  kbSelectAll,
  loadAndWait,
  scrollIntoView,
  waitForSerialized,
} from "./test_utils.mjs";

const selectAll = async page => {
  await kbSelectAll(page);
  await page.waitForFunction(
    () => !document.querySelector(".highlightEditor:not(.selectedEditor)")
  );
};

const getXY = (page, selector) =>
  page.evaluate(sel => {
    const bbox = document.querySelector(sel).getBoundingClientRect();
    return `${bbox.x}::${bbox.y}`;
  }, selector);

const getSpanRectFromText = (page, pageNumber, text) => {
  return page.evaluate(
    (number, content) => {
      for (const el of document.querySelectorAll(
        `.page[data-page-number="${number}"] > .textLayer > span`
      )) {
        if (el.textContent === content) {
          const { x, y, width, height } = el.getBoundingClientRect();
          return { x, y, width, height };
        }
      }
      return null;
    },
    pageNumber,
    text
  );
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
          await page.click("#editorHighlight");
          await page.waitForSelector(".annotationEditorLayer.highlightEditing");

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2 });

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
          await page.click("#editorHighlight");
          await page.waitForSelector(".annotationEditorLayer.highlightEditing");

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2 });

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
          await page.click("#editorHighlight");
          await page.waitForSelector(".annotationEditorLayer.highlightEditing");

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2 });

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
          await page.click("#editorHighlight");
          await page.waitForSelector(".annotationEditorLayer.highlightEditing");

          let rect = await getSpanRectFromText(page, 1, "Abstract");
          let x = rect.x + rect.width / 2;
          let y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2 });

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
          await page.mouse.click(x, y, { count: 2 });
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
          await page.click("#editorHighlight");
          await page.waitForSelector(".annotationEditorLayer.highlightEditing");

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2 });

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
          await page.click("#editorHighlight");
          await page.waitForSelector(".annotationEditorLayer.highlightEditing");
          const sel = getEditorSelector(0);

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2 });

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
          await page.click("#editorHighlight");
          await page.waitForSelector(".annotationEditorLayer.highlightEditing");

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2 });

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
          await page.click("#editorHighlight");
          await page.waitForSelector(".annotationEditorLayer.highlightEditing");
          const sel = getEditorSelector(0);

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2 });

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
          await page.click("#editorHighlight");
          await page.waitForSelector(".annotationEditorLayer.highlightEditing");
          const sel = getEditorSelector(0);

          const rect = await getSpanRectFromText(page, 1, "Abstract");
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          await page.mouse.click(x, y, { count: 2 });

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
});
