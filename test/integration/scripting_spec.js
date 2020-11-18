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

describe("Interaction", () => {
  describe("in 160F-2019.pdf", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("160F-2019.pdf", "#\\34 16R");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must show a text field and then make in invisible when content is removed", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          let visibility = await page.$eval(
            "#\\34 27R",
            el => getComputedStyle(el).visibility
          );
          expect(visibility).withContext(`In ${browserName}`).toEqual("hidden");

          await page.type("#\\34 16R", "3.14159", { delay: 200 });
          await page.click("#\\34 19R");

          visibility = await page.$eval(
            "#\\34 27R",
            el => getComputedStyle(el).visibility
          );
          expect(visibility)
            .withContext(`In ${browserName}`)
            .toEqual("visible");

          // Clear the textfield
          await page.click("#\\34 16R");
          await page.keyboard.down("Control");
          await page.keyboard.press("A");
          await page.keyboard.up("Control");
          await page.keyboard.press("Backspace");
          // and leave it
          await page.click("#\\34 19R");

          visibility = await page.$eval(
            "#\\34 27R",
            el => getComputedStyle(el).visibility
          );
          expect(visibility).withContext(`In ${browserName}`).toEqual("hidden");
        })
      );
    });

    it("must format the field with 2 digits and leave field with a click", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.type("#\\34 16R", "3.14159", { delay: 200 });
          await page.click("#\\34 19R");
          const text = await page.$eval("#\\34 16R", el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("3,14");

          const sum = await page.$eval("#\\34 27R", el => el.value);
          expect(sum).withContext(`In ${browserName}`).toEqual("3,14");
        })
      );
    });

    it("must format the field with 2 digits, leave field with a click and again", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.type("#\\34 48R", "61803", { delay: 200 });
          await page.click("#\\34 19R");
          let text = await page.$eval("#\\34 48R", el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("61.803,00");

          await page.click("#\\34 48R");
          text = await page.$eval("#\\34 48R", el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("61803");

          // Clear the textfield
          await page.keyboard.down("Control");
          await page.keyboard.press("A");
          await page.keyboard.up("Control");
          await page.keyboard.press("Backspace");

          await page.type("#\\34 48R", "1.61803", { delay: 200 });
          await page.click("#\\34 19R");
          text = await page.$eval("#\\34 48R", el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("1,62");
        })
      );
    });

    it("must format the field with 2 digits and leave field with a TAB", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.type("#\\34 22R", "2.7182818", { delay: 200 });
          await page.keyboard.press("Tab");
          const text = await page.$eval("#\\34 22R", el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("2,72");

          const sum = await page.$eval("#\\34 27R", el => el.value);
          expect(sum).withContext(`In ${browserName}`).toEqual("5,86");
        })
      );
    });

    it("must format the field with 2 digits and hit ESC", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          let sum = await page.$eval("#\\34 71R", el => el.value);
          expect(sum).withContext(`In ${browserName}`).toEqual("4,24");

          await page.type("#\\34 36R", "0.69314", { delay: 200 });
          await page.keyboard.press("Escape");
          const text = await page.$eval("#\\34 36R", el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("0.69314");

          sum = await page.$eval("#\\34 71R", el => el.value);
          expect(sum).withContext(`In ${browserName}`).toEqual("3,55");
        })
      );
    });

    it("must format the field with 2 digits on key ENTER", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.type("#\\34 19R", "0.577215", { delay: 200 });
          await page.keyboard.press("Enter");
          const text = await page.$eval("#\\34 19R", el => el.value);
          expect(text).toEqual("0.577215");

          const sum = await page.$eval("#\\34 27R", el => el.value);
          expect(sum).toEqual("6,44");
        })
      );
    });

    it("must reset all", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // this field has no actions but it must be cleared on reset
          await page.type("#\\34 05R", "employee", { delay: 200 });

          // click on reset button
          await page.click("[data-annotation-id='402R']");

          let text = await page.$eval("#\\34 16R", el => el.value);
          expect(text).toEqual("");

          text = await page.$eval("#\\34 22R", el => el.value);
          expect(text).toEqual("");

          text = await page.$eval("#\\34 19R", el => el.value);
          expect(text).toEqual("");

          text = await page.$eval("#\\34 05R", el => el.value);
          expect(text).toEqual("");

          const sum = await page.$eval("#\\34 27R", el => el.value);
          expect(sum).toEqual("");
        })
      );
    });
  });
});
