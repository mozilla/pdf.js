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

const { closePages, loadAndWait } = require("./test_utils.js");

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
          await page.type("#\\32 5R", base);
          await page.waitForFunction(
            `document.querySelector("#\\\\32 4R").value !== ""`
          );
          await page.waitForFunction(
            `document.querySelector("#\\\\32 6R").value !== ""`
          );

          let text = await page.$eval("#\\32 4R", el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual(base);

          text = await page.$eval("#\\32 6R", el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual(base);
        })
      );
    });
  });
});
