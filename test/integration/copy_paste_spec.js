/* Copyright 2023 Mozilla Foundation
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

const { closePages, loadAndWait, mockClipboard } = require("./test_utils.js");

describe("Copy and paste", () => {
  describe("all text", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".textLayer");
      await mockClipboard(pages);
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that we've all the contents on copy/paste", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.keyboard.down("Control");
          await page.keyboard.press("a");
          await page.keyboard.up("Control");

          await page.waitForTimeout(500);

          await page.keyboard.down("Control");
          await page.keyboard.press("c");
          await page.keyboard.up("Control");

          await page.waitForTimeout(500);

          await page.waitForFunction(
            `document.querySelector('#viewerContainer').style.cursor !== "wait"`
          );

          const text = await page.evaluate(() =>
            navigator.clipboard.readText()
          );

          expect(!!text).withContext(`In ${browserName}`).toEqual(true);
          expect(text.includes("Dynamic languages such as JavaScript"))
            .withContext(`In ${browserName}`)
            .toEqual(true);
          expect(
            text.includes("This section provides an overview of our system")
          )
            .withContext(`In ${browserName}`)
            .toEqual(true);
          expect(
            text.includes(
              "are represented by function calls. This makes the LIR used by"
            )
          )
            .withContext(`In ${browserName}`)
            .toEqual(true);
          expect(
            text.includes("When compiling loops, we consult the oracle before")
          )
            .withContext(`In ${browserName}`)
            .toEqual(true);
          expect(text.includes("Nested Trace Tree Formation"))
            .withContext(`In ${browserName}`)
            .toEqual(true);
          expect(
            text.includes(
              "An important detail is that the call to the inner trace"
            )
          )
            .withContext(`In ${browserName}`)
            .toEqual(true);
          expect(text.includes("When trace recording is completed, nanojit"))
            .withContext(`In ${browserName}`)
            .toEqual(true);
          expect(
            text.includes(
              "SpiderMonkey, like many VMs, needs to preempt the user program"
            )
          )
            .withContext(`In ${browserName}`)
            .toEqual(true);
          expect(
            text.includes(
              "Using similar computations, we find that trace recording takes"
            )
          )
            .withContext(`In ${browserName}`)
            .toEqual(true);
          expect(
            text.includes(
              "specialization algorithm. We also described our trace compiler"
            )
          )
            .withContext(`In ${browserName}`)
            .toEqual(true);
          expect(
            text.includes(
              "dynamic optimization system. In Proceedings of the ACM SIGPLAN"
            )
          )
            .withContext(`In ${browserName}`)
            .toEqual(true);
        })
      );
    });
  });
  describe("all text", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("copy_paste_ligatures.pdf", ".textLayer");
      await mockClipboard(pages);
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that we've all the contents on copy/paste", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.keyboard.down("Control");
          await page.keyboard.press("a");
          await page.keyboard.up("Control");

          await page.waitForTimeout(100);

          await page.keyboard.down("Control");
          await page.keyboard.press("c");
          await page.keyboard.up("Control");

          await page.waitForTimeout(100);

          await page.waitForFunction(
            `document.querySelector('#viewerContainer').style.cursor !== "wait"`
          );

          const text = await page.evaluate(() =>
            navigator.clipboard.readText()
          );

          expect(!!text).withContext(`In ${browserName}`).toEqual(true);
          expect(text)
            .withContext(`In ${browserName}`)
            .toEqual("abcdeffffiflffifflſtstghijklmno");
        })
      );
    });
  });
});
