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

import {
  closePages,
  copy,
  kbSelectAll,
  loadAndWait,
  mockClipboard,
  waitForEvent,
} from "./test_utils.mjs";

const selectAll = async page => {
  await waitForEvent({
    page,
    eventName: "selectionchange",
    action: () => kbSelectAll(page),
  });

  await page.waitForFunction(() => {
    const selection = document.getSelection();
    const hiddenCopyElement = document.getElementById("hiddenCopyElement");
    return selection.containsNode(hiddenCopyElement);
  });
};

describe("Copy and paste", () => {
  describe("all text", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", "#hiddenCopyElement", 100);
      await mockClipboard(pages);
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that we've all the contents on copy/paste", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.waitForSelector(
            ".page[data-page-number='1'] .textLayer .endOfContent"
          );
          await selectAll(page);

          await copy(page);
          await page.waitForFunction(
            `document.querySelector('#viewerContainer').style.cursor !== "wait"`
          );

          await page.waitForFunction(
            async () =>
              !!(await navigator.clipboard.readText())?.includes(
                "Dynamic languages such as JavaScript"
              )
          );
          const text = await page.evaluate(() =>
            navigator.clipboard.readText()
          );

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
  describe("Copy/paste and ligatures", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "copy_paste_ligatures.pdf",
        "#hiddenCopyElement",
        100
      );
      await mockClipboard(pages);
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that the ligatures have been removed when the text has been copied", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.waitForSelector(
            ".page[data-page-number='1'] .textLayer .endOfContent"
          );
          await selectAll(page);

          await copy(page);
          await page.waitForFunction(
            `document.querySelector('#viewerContainer').style.cursor !== "wait"`
          );

          await page.waitForFunction(
            async () => !!(await navigator.clipboard.readText())
          );

          const text = await page.evaluate(() =>
            navigator.clipboard.readText()
          );

          expect(text)
            .withContext(`In ${browserName}`)
            .toEqual("abcdeffffiflffifflſtstghijklmno");
        })
      );
    });
  });
});
