/* Copyright 2020 Mozilla Foundation
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
  CLICK_DELAY,
  closePages,
  getQuerySelector,
  getRect,
  getSelector,
  loadAndWait,
} from "./test_utils.mjs";

describe("Annotation highlight", () => {
  describe("annotation-highlight.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "annotation-highlight.pdf",
        "[data-annotation-id='19R']"
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check the popup position in the DOM", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const areSiblings = await page.evaluate(() => {
            const highlight = document.querySelector(
              "[data-annotation-id='19R']"
            );
            const popup = document.querySelector("[data-annotation-id='21R']");
            return highlight.nextElementSibling === popup;
          });
          expect(areSiblings).withContext(`In ${browserName}`).toEqual(true);
        })
      );
    });

    it("must show a popup on mouseover", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          let hidden = await page.$eval(
            "[data-annotation-id='21R']",
            el => el.hidden
          );
          expect(hidden).withContext(`In ${browserName}`).toEqual(true);
          await page.hover("[data-annotation-id='19R']");
          await page.waitForSelector("[data-annotation-id='21R']", {
            visible: true,
            timeout: 0,
          });
          hidden = await page.$eval(
            "[data-annotation-id='21R']",
            el => el.hidden
          );
          expect(hidden).withContext(`In ${browserName}`).toEqual(false);
        })
      );
    });
  });

  describe("Check that widget annotations are in front of highlight ones", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1883609.pdf", "[data-annotation-id='23R']");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must click on widget annotations", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          for (const i of [23, 22, 14]) {
            await page.click(`[data-annotation-id='${i}R']`, {
              delay: CLICK_DELAY,
            });
            await page.waitForSelector(`#pdfjs_internal_id_${i}R:focus`);
          }
        })
      );
    });
  });
});

describe("Checkbox annotation", () => {
  describe("issue12706.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue12706.pdf", "[data-annotation-id='63R']");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must let checkboxes with the same name behave like radio buttons", async () => {
      const selectors = [63, 70, 79].map(n => `[data-annotation-id='${n}R']`);
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          for (const selector of selectors) {
            await page.click(selector, { delay: CLICK_DELAY });
            await page.waitForFunction(
              `document.querySelector("${selector} > :first-child").checked`
            );

            for (const otherSelector of selectors) {
              const checked = await page.$eval(
                `${otherSelector} > :first-child`,
                el => el.checked
              );
              expect(checked)
                .withContext(`In ${browserName}`)
                .toBe(selector === otherSelector);
            }
          }
        })
      );
    });
  });

  describe("issue15597.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue15597.pdf", "[data-annotation-id='7R']");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check the checkbox", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const selector = "[data-annotation-id='7R']";
          await page.click(selector, { delay: CLICK_DELAY });
          await page.waitForFunction(
            `document.querySelector("${selector} > :first-child").checked`
          );
          expect(true).withContext(`In ${browserName}`).toEqual(true);
        })
      );
    });
  });

  describe("bug1847733.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1847733.pdf", "[data-annotation-id='18R']");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check the checkbox", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const selectors = [18, 30, 42, 54].map(
            id => `[data-annotation-id='${id}R']`
          );
          for (const selector of selectors) {
            await page.click(selector, { delay: CLICK_DELAY });
            await page.waitForFunction(
              `document.querySelector("${selector} > :first-child").checked`
            );
          }
        })
      );
    });
  });
});

describe("Text widget", () => {
  describe("issue13271.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue13271.pdf", "[data-annotation-id='24R']");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must update all the fields with the same value", async () => {
      const base = "hello world";
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.type(getSelector("25R"), base);
          await page.waitForFunction(`${getQuerySelector("24R")}.value !== ""`);
          await page.waitForFunction(`${getQuerySelector("26R")}.value !== ""`);

          let text = await page.$eval(getSelector("24R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual(base);

          text = await page.$eval(getSelector("26R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual(base);
        })
      );
    });
  });

  describe("issue16473.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue16473.pdf", "[data-annotation-id='22R']");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must reset a formatted value after a change", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.type(getSelector("22R"), "a");
          await page.keyboard.press("Tab");
          await page.waitForFunction(
            `${getQuerySelector("22R")}.value !== "Hello world"`
          );

          const text = await page.$eval(getSelector("22R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("aHello World");
        })
      );
    });
  });
});

describe("Link annotations with internal destinations", () => {
  describe("bug1708041.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "bug1708041.pdf",
        ".page[data-page-number='1'] .annotationLayer"
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must click on a link and check if it navigates to the correct page", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const pageOneSelector = ".page[data-page-number='1']";
          const linkSelector = `${pageOneSelector} #pdfjs_internal_id_42R`;
          await page.waitForSelector(linkSelector);
          const linkTitle = await page.$eval(linkSelector, el => el.title);
          expect(linkTitle)
            .withContext(`In ${browserName}`)
            .toEqual("Go to the last page");
          await page.click(linkSelector, { delay: CLICK_DELAY });
          const pageSixTextLayerSelector =
            ".page[data-page-number='6'] .textLayer";
          await page.waitForSelector(pageSixTextLayerSelector, {
            visible: true,
          });
          await page.waitForFunction(
            sel => {
              const textLayer = document.querySelector(sel);
              return document.activeElement === textLayer;
            },
            {},
            pageSixTextLayerSelector
          );
        })
      );
    });
  });
});

describe("Annotation and storage", () => {
  describe("issue14023.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue14023.pdf", "[data-annotation-id='64R']");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must let checkboxes with the same name behave like radio buttons", async () => {
      const text1 = "hello world!";
      const text2 = "!dlrow olleh";
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // Text field.
          await page.type(getSelector("64R"), text1);
          // Checkbox.
          await page.click("[data-annotation-id='65R']", {
            delay: CLICK_DELAY,
          });
          // Radio.
          await page.click("[data-annotation-id='67R']", {
            delay: CLICK_DELAY,
          });

          for (const [pageNumber, textId, checkId, radio1Id, radio2Id] of [
            [2, "18R", "19R", "21R", "20R"],
            [5, "23R", "24R", "22R", "25R"],
          ]) {
            await page.evaluate(n => {
              window.document
                .querySelectorAll(`[data-page-number="${n}"][class="page"]`)[0]
                .scrollIntoView();
            }, pageNumber);

            // Need to wait to have a displayed text input.
            await page.waitForSelector(getSelector(textId), {
              timeout: 0,
            });

            const text = await page.$eval(getSelector(textId), el => el.value);
            expect(text).withContext(`In ${browserName}`).toEqual(text1);

            let checked = await page.$eval(
              getSelector(checkId),
              el => el.checked
            );
            expect(checked).toEqual(true);

            checked = await page.$eval(getSelector(radio1Id), el => el.checked);
            expect(checked).toEqual(false);

            checked = await page.$eval(getSelector(radio2Id), el => el.checked);
            expect(checked).toEqual(false);
          }

          // Change data on page 5 and check that other pages changed.
          // Text field.
          await page.type(getSelector("23R"), text2);
          // Checkbox.
          await page.click("[data-annotation-id='24R']", {
            delay: CLICK_DELAY,
          });
          // Radio.
          await page.click("[data-annotation-id='25R']", {
            delay: CLICK_DELAY,
          });

          for (const [pageNumber, textId, checkId, radio1Id, radio2Id] of [
            [1, "64R", "65R", "67R", "68R"],
            [2, "18R", "19R", "21R", "20R"],
          ]) {
            await page.evaluate(n => {
              window.document
                .querySelectorAll(`[data-page-number="${n}"][class="page"]`)[0]
                .scrollIntoView();
            }, pageNumber);

            // Need to wait to have a displayed text input.
            await page.waitForSelector(getSelector(textId), {
              timeout: 0,
            });

            const text = await page.$eval(getSelector(textId), el => el.value);
            expect(text)
              .withContext(`In ${browserName}`)
              .toEqual(text2 + text1);

            let checked = await page.$eval(
              getSelector(checkId),
              el => el.checked
            );
            expect(checked).toEqual(false);

            checked = await page.$eval(getSelector(radio1Id), el => el.checked);
            expect(checked).toEqual(false);

            checked = await page.$eval(getSelector(radio2Id), el => el.checked);
            expect(checked).toEqual(false);
          }
        })
      );
    });
  });
});

describe("ResetForm action", () => {
  describe("resetform.pdf", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("resetform.pdf", "[data-annotation-id='63R']");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must reset all fields", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const base = "hello world";
          for (let i = 63; i <= 67; i++) {
            await page.type(getSelector(`${i}R`), base);
          }

          const selectors = [69, 71, 75].map(
            n => `[data-annotation-id='${n}R']`
          );
          for (const selector of selectors) {
            await page.click(selector, { delay: CLICK_DELAY });
          }

          await page.select(getSelector("78R"), "b");
          await page.select(getSelector("81R"), "f");

          await page.click("[data-annotation-id='82R']", {
            delay: CLICK_DELAY,
          });
          await page.waitForFunction(`${getQuerySelector("63R")}.value === ""`);

          for (let i = 63; i <= 68; i++) {
            const text = await page.$eval(getSelector(`${i}R`), el => el.value);
            expect(text).withContext(`In ${browserName}`).toEqual("");
          }

          const ids = [69, 71, 72, 73, 74, 75, 76, 77];
          for (const id of ids) {
            const checked = await page.$eval(
              getSelector(`${id}R`),
              el => el.checked
            );
            expect(checked).withContext(`In ${browserName}`).toEqual(false);
          }

          let selected = await page.$eval(
            `${getSelector("78R")} [value="a"]`,
            el => el.selected
          );
          expect(selected).withContext(`In ${browserName}`).toEqual(true);

          selected = await page.$eval(
            `${getSelector("81R")} [value="d"]`,
            el => el.selected
          );
          expect(selected).withContext(`In ${browserName}`).toEqual(true);
        })
      );
    });

    it("must reset some fields", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const base = "hello world";
          for (let i = 63; i <= 68; i++) {
            await page.type(getSelector(`${i}R`), base);
          }

          const selectors = [69, 71, 72, 73, 75].map(
            n => `[data-annotation-id='${n}R']`
          );
          for (const selector of selectors) {
            await page.click(selector, { delay: CLICK_DELAY });
          }

          await page.select(getSelector("78R"), "b");
          await page.select(getSelector("81R"), "f");

          await page.click("[data-annotation-id='84R']", {
            delay: CLICK_DELAY,
          });
          await page.waitForFunction(`${getQuerySelector("63R")}.value === ""`);

          for (let i = 63; i <= 68; i++) {
            const expected = (i - 3) % 2 === 0 ? "" : base;
            const text = await page.$eval(getSelector(`${i}R`), el => el.value);
            expect(text).withContext(`In ${browserName}`).toEqual(expected);
          }

          let ids = [69, 72, 73, 74, 76, 77];
          for (const id of ids) {
            const checked = await page.$eval(
              getSelector(`${id}R`),
              el => el.checked
            );
            expect(checked)
              .withContext(`In ${browserName + id}`)
              .toEqual(false);
          }

          ids = [71, 75];
          for (const id of ids) {
            const checked = await page.$eval(
              getSelector(`${id}R`),
              el => el.checked
            );
            expect(checked).withContext(`In ${browserName}`).toEqual(true);
          }

          let selected = await page.$eval(
            `${getSelector("78R")} [value="a"]`,
            el => el.selected
          );
          expect(selected).withContext(`In ${browserName}`).toEqual(true);

          selected = await page.$eval(
            `${getSelector("81R")} [value="f"]`,
            el => el.selected
          );
          expect(selected).withContext(`In ${browserName}`).toEqual(true);
        })
      );
    });
  });

  describe("FreeText widget", () => {
    describe("issue14438.pdf", () => {
      let pages;

      beforeEach(async () => {
        pages = await loadAndWait(
          "issue14438.pdf",
          "[data-annotation-id='10R']"
        );
      });

      afterEach(async () => {
        await closePages(pages);
      });

      it("must check that the FreeText annotation has a popup", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            await page.click("[data-annotation-id='10R']", {
              delay: CLICK_DELAY,
            });
            await page.waitForFunction(
              `document.querySelector("[data-annotation-id='10R']").hidden === false`
            );
          })
        );
      });
    });
  });

  describe("Ink widget and its popup after editing", () => {
    describe("annotation-caret-ink.pdf", () => {
      let pages;

      beforeEach(async () => {
        pages = await loadAndWait(
          "annotation-caret-ink.pdf",
          "[data-annotation-id='25R']"
        );
      });

      afterEach(async () => {
        await closePages(pages);
      });

      it("must check that the Ink annotation has a popup", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            await page.waitForFunction(
              `document.querySelector("[data-annotation-id='25R']").hidden === false`
            );
            await page.click("#editorFreeText", { delay: CLICK_DELAY });
            await page.waitForFunction(
              `document.querySelector("[data-annotation-id='25R']").hidden === true`
            );
            await page.click("#editorFreeText", { delay: CLICK_DELAY });
            await page.waitForFunction(
              `document.querySelector("[data-annotation-id='25R']").hidden === false`
            );
          })
        );
      });
    });
  });

  describe("Don't use AP when /NeedAppearances is true", () => {
    describe("bug1844583.pdf", () => {
      let pages;

      beforeEach(async () => {
        pages = await loadAndWait(
          "bug1844583.pdf",
          "[data-annotation-id='8R']"
        );
      });

      afterEach(async () => {
        await closePages(pages);
      });

      it("must check the content of the text field", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            const text = await page.$eval(getSelector("8R"), el => el.value);
            expect(text)
              .withContext(`In ${browserName}`)
              .toEqual("Hello World");
          })
        );
      });
    });
  });

  describe("Toggle popup with keyboard", () => {
    describe("tagged_stamp.pdf", () => {
      let pages;

      beforeEach(async () => {
        pages = await loadAndWait(
          "tagged_stamp.pdf",
          "[data-annotation-id='20R']"
        );
      });

      afterEach(async () => {
        await closePages(pages);
      });

      it("must check that the popup has the correct visibility", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            let hidden = await page.$eval(
              "[data-annotation-id='21R']",
              el => el.hidden
            );
            expect(hidden).withContext(`In ${browserName}`).toEqual(true);
            await page.focus("[data-annotation-id='20R']");
            await page.keyboard.press("Enter");
            await page.waitForFunction(
              `document.querySelector("[data-annotation-id='21R']").hidden !== true`
            );
            hidden = await page.$eval(
              "[data-annotation-id='21R']",
              el => el.hidden
            );
            expect(hidden).withContext(`In ${browserName}`).toEqual(false);

            await page.keyboard.press("Enter");
            await page.waitForFunction(
              `document.querySelector("[data-annotation-id='21R']").hidden !== false`
            );
            hidden = await page.$eval(
              "[data-annotation-id='21R']",
              el => el.hidden
            );
            expect(hidden).withContext(`In ${browserName}`).toEqual(true);

            await page.keyboard.press("Enter");
            await page.waitForFunction(
              `document.querySelector("[data-annotation-id='21R']").hidden !== true`
            );
            hidden = await page.$eval(
              "[data-annotation-id='21R']",
              el => el.hidden
            );
            expect(hidden).withContext(`In ${browserName}`).toEqual(false);

            await page.keyboard.press("Escape");
            await page.waitForFunction(
              `document.querySelector("[data-annotation-id='21R']").hidden !== false`
            );
            hidden = await page.$eval(
              "[data-annotation-id='21R']",
              el => el.hidden
            );
            expect(hidden).withContext(`In ${browserName}`).toEqual(true);
          })
        );
      });
    });
  });

  describe("Annotation with empty popup and aria", () => {
    describe("issue14438.pdf", () => {
      let pages;

      beforeEach(async () => {
        pages = await loadAndWait(
          "highlights.pdf",
          "[data-annotation-id='693R']"
        );
      });

      afterEach(async () => {
        await closePages(pages);
      });

      it("must check that the highlight annotation has no popup and no aria-haspopup attribute", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            await page.waitForFunction(
              // No aria-haspopup attribute,
              `document.querySelector("[data-annotation-id='693R']").ariaHasPopup === null` +
                // and no popup.
                `&& document.querySelector("[data-annotation-id='694R']") === null`
            );
          })
        );
      });
    });
  });

  describe("Rotated annotation and its clickable area", () => {
    describe("rotated_ink.pdf", () => {
      let pages;

      beforeEach(async () => {
        pages = await loadAndWait(
          "rotated_ink.pdf",
          "[data-annotation-id='18R']"
        );
      });

      afterEach(async () => {
        await closePages(pages);
      });

      it("must check that the clickable area has been rotated", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            const rect = await getRect(page, "[data-annotation-id='18R']");
            const promisePopup = page.waitForSelector(
              "[data-annotation-id='19R']",
              { visible: true }
            );
            await page.mouse.move(
              rect.x + rect.width * 0.1,
              rect.y + rect.height * 0.9
            );
            await promisePopup;
          })
        );
      });
    });
  });

  describe("Text under some annotations", () => {
    describe("bug1885505.pdf", () => {
      let pages;

      beforeEach(async () => {
        pages = await loadAndWait(
          "bug1885505.pdf",
          ":is(" +
            [56, 58, 60, 65]
              .map(id => `[data-annotation-id='${id}R']`)
              .join(", ") +
            ")"
        );
      });

      afterEach(async () => {
        await closePages(pages);
      });

      it("must check that the text under a highlight annotation exist in the DOM", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            const text = await page.$eval(
              "[data-annotation-id='56R'] mark",
              el => el.textContent
            );
            expect(text).withContext(`In ${browserName}`).toEqual("Languages");
          })
        );
      });

      it("must check that the text under an underline annotation exist in the DOM", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            const text = await page.$eval(
              "[data-annotation-id='58R'] u",
              el => el.textContent
            );
            expect(text).withContext(`In ${browserName}`).toEqual("machine");
          })
        );
      });

      it("must check that the text under a squiggly annotation exist in the DOM", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            const text = await page.$eval(
              "[data-annotation-id='60R'] u",
              el => el.textContent
            );
            expect(text).withContext(`In ${browserName}`)
              .toEqual(`paths through nested loops. We have implemented
a dynamic compiler for JavaScript based on our`);
          })
        );
      });

      it("must check that the text under a strikeout annotation exist in the DOM", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            const text = await page.$eval(
              "[data-annotation-id='65R'] s",
              el => el.textContent
            );
            expect(text)
              .withContext(`In ${browserName}`)
              .toEqual("Experimentation,");
          })
        );
      });
    });
  });
});
