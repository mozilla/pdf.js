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

import { closePages, getRect, loadAndWait } from "./test_utils.mjs";

const waitForSelectionChange = (page, selection) =>
  page.waitForFunction(
    // We need to replace EOL on Windows to make the test pass.
    sel => document.getSelection().toString().replaceAll("\r\n", "\n") === sel,
    {},
    selection
  );

describe("Caret browsing", () => {
  describe("Selection", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".textLayer .endOfContent");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must move the caret down and check the selection", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const spanRect = await getRect(
            page,
            `.page[data-page-number="1"] > .textLayer > span`
          );
          await page.mouse.click(
            spanRect.x + 1,
            spanRect.y + spanRect.height / 2,
            { count: 2 }
          );
          await page.keyboard.down("Shift");
          for (let i = 0; i < 6; i++) {
            await page.keyboard.press("ArrowRight");
          }
          await page.keyboard.up("Shift");
          await waitForSelectionChange(page, "Trace-based");

          await page.keyboard.down("Shift");
          await page.keyboard.press("ArrowDown");
          await page.keyboard.up("Shift");

          // The caret is just before Languages.
          await waitForSelectionChange(
            page,
            "Trace-based Just-in-Time Type Specialization for Dynamic\n"
          );

          await page.keyboard.down("Shift");
          await page.keyboard.press("ArrowDown");
          await page.keyboard.up("Shift");

          // The caret is just before Mike Shaver.
          await waitForSelectionChange(
            page,
            "Trace-based Just-in-Time Type Specialization for Dynamic\nLanguages\nAndreas Gal∗+, Brendan Eich∗, "
          );

          await page.keyboard.down("Shift");
          await page.keyboard.press("ArrowUp");
          await page.keyboard.up("Shift");

          // The caret is just before Languages.
          await waitForSelectionChange(
            page,
            "Trace-based Just-in-Time Type Specialization for Dynamic\n"
          );

          await page.keyboard.down("Shift");
          await page.keyboard.press("ArrowUp");
          await page.keyboard.up("Shift");

          // The caret is in the middle of Time.
          await waitForSelectionChange(page, "Trace-based Just-in-Tim");
        })
      );
    });
  });
});
