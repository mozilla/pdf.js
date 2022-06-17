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

const {
  closePages,
  getSelector,
  getQuerySelector,
  loadAndWait,
} = require("./test_utils.js");

describe("Annotation highlight", () => {
  describe("annotation-highlight.pdf", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "annotation-highlight.pdf",
        "[data-annotation-id='19R']"
      );
    });

    afterAll(async () => {
      await closePages(pages);
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
});

describe("Checkbox annotation", () => {
  describe("issue12706.pdf", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("issue12706.pdf", "[data-annotation-id='63R']");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must let checkboxes with the same name behave like radio buttons", async () => {
      const selectors = [63, 70, 79].map(n => `[data-annotation-id='${n}R']`);
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          for (const selector of selectors) {
            await page.click(selector);
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
});

describe("Text widget", () => {
  describe("issue13271.pdf", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("issue13271.pdf", "[data-annotation-id='24R']");
    });

    afterAll(async () => {
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
});

describe("Annotation and storage", () => {
  describe("issue14023.pdf", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("issue14023.pdf", "[data-annotation-id='64R']");
    });

    afterAll(async () => {
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
          await page.click("[data-annotation-id='65R']");
          // Radio.
          await page.click("[data-annotation-id='67R']");

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
          await page.click("[data-annotation-id='24R']");
          // Radio.
          await page.click("[data-annotation-id='25R']");

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

    beforeAll(async () => {
      pages = await loadAndWait("resetform.pdf", "[data-annotation-id='63R']");
    });

    afterAll(async () => {
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
            await page.click(selector);
          }

          await page.select(getSelector("78R"), "b");
          await page.select(getSelector("81R"), "f");

          await page.click("[data-annotation-id='82R']");
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
            await page.click(selector);
          }

          await page.select(getSelector("78R"), "b");
          await page.select(getSelector("81R"), "f");

          await page.click("[data-annotation-id='84R']");
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
});
