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

const { closePages, loadAndWait } = require("./test_utils.js");

const editorPrefix = "#pdfjs_internal_editor_";

describe("Editor", () => {
  describe("FreeText", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must write a string in a FreeText editor", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#editorFreeText");

          const rect = await page.$eval(".annotationEditorLayer", el => {
            // With Chrome something is wrong when serializing a DomRect,
            // hence we extract the values and just return them.
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.type(`${editorPrefix}0 .internal`, data);

          const editorRect = await page.$eval(`${editorPrefix}0`, el => {
            const { x, y, width, height } = el.getBoundingClientRect();
            return {
              x,
              y,
              width,
              height,
            };
          });

          // Commit.
          await page.mouse.click(
            editorRect.x,
            editorRect.y + 2 * editorRect.height
          );

          const content = await page.$eval(`${editorPrefix}0`, el =>
            el.innerText.trimEnd()
          );
          expect(content).withContext(`In ${browserName}`).toEqual(data);
        })
      );
    });

    it("must copy/paste", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const editorRect = await page.$eval(`${editorPrefix}0`, el => {
            const { x, y, width, height } = el.getBoundingClientRect();
            return { x, y, width, height };
          });

          // Select the editor created previously.
          await page.mouse.click(
            editorRect.x + editorRect.width / 2,
            editorRect.y + editorRect.height / 2
          );

          await page.keyboard.down("Control");
          await page.keyboard.press("c");
          await page.keyboard.up("Control");

          await page.keyboard.down("Control");
          await page.keyboard.press("v");
          await page.keyboard.up("Control");

          const content = await page.$eval(`${editorPrefix}0`, el =>
            el.innerText.trimEnd()
          );

          let pastedContent = await page.$eval(`${editorPrefix}1`, el =>
            el.innerText.trimEnd()
          );

          expect(pastedContent)
            .withContext(`In ${browserName}`)
            .toEqual(content);

          await page.keyboard.down("Control");
          await page.keyboard.press("c");
          await page.keyboard.up("Control");

          await page.keyboard.down("Control");
          await page.keyboard.press("v");
          await page.keyboard.up("Control");

          pastedContent = await page.$eval(`${editorPrefix}2`, el =>
            el.innerText.trimEnd()
          );
          expect(pastedContent)
            .withContext(`In ${browserName}`)
            .toEqual(content);
        })
      );
    });

    it("must clear all", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.keyboard.down("Control");
          await page.keyboard.press("a");
          await page.keyboard.up("Control");

          await page.keyboard.down("Control");
          await page.keyboard.press("Backspace");
          await page.keyboard.up("Control");

          for (const n of [0, 1, 2]) {
            const hasEditor = await page.evaluate(sel => {
              return !!document.querySelector(sel);
            }, `${editorPrefix}${n}`);

            expect(hasEditor).withContext(`In ${browserName}`).toEqual(false);
          }
        })
      );
    });

    it("must check that a paste has been undone", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const rect = await page.$eval(".annotationEditorLayer", el => {
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          const data = "Hello PDF.js World !!";
          await page.mouse.click(rect.x + 100, rect.y + 100);
          await page.type(`${editorPrefix}3 .internal`, data);

          const editorRect = await page.$eval(`${editorPrefix}3`, el => {
            const { x, y, width, height } = el.getBoundingClientRect();
            return { x, y, width, height };
          });

          // Commit.
          await page.mouse.click(
            editorRect.x,
            editorRect.y + 2 * editorRect.height
          );
          // And select it again.
          await page.mouse.click(
            editorRect.x + editorRect.width / 2,
            editorRect.y + editorRect.height / 2
          );

          await page.keyboard.down("Control");
          await page.keyboard.press("c");
          await page.keyboard.up("Control");

          await page.keyboard.down("Control");
          await page.keyboard.press("v");
          await page.keyboard.up("Control");

          let hasEditor = await page.evaluate(sel => {
            return !!document.querySelector(sel);
          }, `${editorPrefix}4`);

          expect(hasEditor).withContext(`In ${browserName}`).toEqual(true);

          await page.keyboard.down("Control");
          await page.keyboard.press("z");
          await page.keyboard.up("Control");

          hasEditor = await page.evaluate(sel => {
            return !!document.querySelector(sel);
          }, `${editorPrefix}4`);

          expect(hasEditor).withContext(`In ${browserName}`).toEqual(false);
        })
      );
    });
  });
});
