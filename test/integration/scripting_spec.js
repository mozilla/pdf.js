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

    it("must format the field with 2 digits and leave field with a click", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.type("#\\34 16R", "3.14159", { delay: 200 });
          await page.click("#\\34 19R");
          const text = await page.$eval("#\\34 16R", el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("3,14");
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
        })
      );
    });
  });
});
