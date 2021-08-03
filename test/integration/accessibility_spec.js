/* Copyright 2021 Mozilla Foundation
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

describe("accessibility", () => {
  describe("structure tree", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("structure_simple.pdf", ".structTree");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must build structure that maps to text layer", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.waitForSelector(".structTree");

          // Check the headings match up.
          const head1 = await page.$eval(
            ".structTree [role='heading'][aria-level='1'] span",
            el =>
              document.getElementById(el.getAttribute("aria-owns")).textContent
          );
          expect(head1).withContext(`In ${browserName}`).toEqual("Heading 1");
          const head2 = await page.$eval(
            ".structTree [role='heading'][aria-level='2'] span",
            el =>
              document.getElementById(el.getAttribute("aria-owns")).textContent
          );
          expect(head2).withContext(`In ${browserName}`).toEqual("Heading 2");

          // Check the order of the content.
          const texts = await page.$$eval(".structTree [aria-owns]", nodes =>
            nodes.map(
              el =>
                document.getElementById(el.getAttribute("aria-owns"))
                  .textContent
            )
          );
          expect(texts)
            .withContext(`In ${browserName}`)
            .toEqual([
              "Heading 1",
              "This paragraph 1.",
              "Heading 2",
              "This paragraph 2.",
            ]);
        })
      );
    });
  });
});
