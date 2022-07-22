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

const {
  closePages,
  getSelectedEditors,
  loadAndWait,
} = require("./test_utils.js");

describe("Editor", () => {
  describe("Ink", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must draw, undo a deletion and check that the editors are not selected", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#editorInk");

          const rect = await page.$eval(".annotationEditorLayer", el => {
            // With Chrome something is wrong when serializing a DomRect,
            // hence we extract the values and just return them.
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          for (let i = 0; i < 3; i++) {
            const x = rect.x + 100 + i * 100;
            const y = rect.y + 100 + i * 100;
            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.mouse.move(x + 50, y + 50);
            await page.mouse.up();

            await page.keyboard.press("Escape");
          }

          await page.keyboard.down("Control");
          await page.keyboard.press("a");
          await page.keyboard.up("Control");

          expect(await getSelectedEditors(page))
            .withContext(`In ${browserName}`)
            .toEqual([0, 2, 3]);

          await page.keyboard.press("Backspace");

          await page.keyboard.down("Control");
          await page.keyboard.press("z");
          await page.keyboard.up("Control");

          expect(await getSelectedEditors(page))
            .withContext(`In ${browserName}`)
            .toEqual([]);
        })
      );
    });
  });
});
