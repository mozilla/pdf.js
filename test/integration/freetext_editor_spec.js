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

    it("must check that aria-owns is correct", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const [adobeComRect, oldAriaOwns] = await page.$eval(
            ".textLayer",
            el => {
              for (const span of el.querySelectorAll(
                `span[role="presentation"]`
              )) {
                if (span.innerText.includes("adobe.com")) {
                  span.setAttribute("pdfjs", true);
                  const { x, y, width, height } = span.getBoundingClientRect();
                  return [
                    { x, y, width, height },
                    span.getAttribute("aria-owns"),
                  ];
                }
              }
              return null;
            }
          );

          expect(oldAriaOwns).withContext(`In ${browserName}`).toEqual(null);

          const data = "Hello PDF.js World !!";
          await page.mouse.click(
            adobeComRect.x + adobeComRect.width + 10,
            adobeComRect.y + adobeComRect.height / 2
          );
          await page.type(`${editorPrefix}5 .internal`, data);

          const editorRect = await page.$eval(`${editorPrefix}5`, el => {
            const { x, y, width, height } = el.getBoundingClientRect();
            return { x, y, width, height };
          });

          // Commit.
          await page.mouse.click(
            editorRect.x,
            editorRect.y + 2 * editorRect.height
          );

          const ariaOwns = await page.$eval(".textLayer", el => {
            const span = el.querySelector(`span[pdfjs="true"]`);
            return span?.getAttribute("aria-owns") || null;
          });

          expect(ariaOwns)
            .withContext(`In ${browserName}`)
            .toEqual(`${editorPrefix}5-editor`.slice(1));
        })
      );
    });
  });

  describe("FreeText (multiselection)", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".annotationEditorLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    function getSelected(page) {
      return page.evaluate(prefix => {
        const elements = document.querySelectorAll(".selectedEditor");
        const results = [];
        for (const element of elements) {
          results.push(parseInt(element.id.slice(prefix.length)));
        }
        results.sort();
        return results;
      }, editorPrefix.slice(1));
    }

    it("must select/unselect several editors and check copy, paste and delete operations", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#editorFreeText");

          const rect = await page.$eval(".annotationEditorLayer", el => {
            // With Chrome something is wrong when serializing a DomRect,
            // hence we extract the values and just return them.
            const { x, y } = el.getBoundingClientRect();
            return { x, y };
          });

          const editorCenters = [];
          for (let i = 0; i < 4; i++) {
            const data = `FreeText ${i}`;
            await page.mouse.click(
              rect.x + (i + 1) * 100,
              rect.y + (i + 1) * 100
            );
            await page.type(`${editorPrefix}${i} .internal`, data);

            const editorRect = await page.$eval(`${editorPrefix}${i}`, el => {
              const { x, y, width, height } = el.getBoundingClientRect();
              return {
                x,
                y,
                width,
                height,
              };
            });
            editorCenters.push({
              x: editorRect.x + editorRect.width / 2,
              y: editorRect.y + editorRect.height / 2,
            });

            // Commit.
            await page.mouse.click(
              editorRect.x,
              editorRect.y + 2 * editorRect.height
            );
          }

          await page.keyboard.down("Control");
          await page.keyboard.press("a");
          await page.keyboard.up("Control");

          expect(await getSelected(page))
            .withContext(`In ${browserName}`)
            .toEqual([0, 1, 2, 3]);

          await page.keyboard.down("Control");
          await page.mouse.click(editorCenters[1].x, editorCenters[1].y);

          expect(await getSelected(page))
            .withContext(`In ${browserName}`)
            .toEqual([0, 2, 3]);

          await page.mouse.click(editorCenters[2].x, editorCenters[2].y);

          expect(await getSelected(page))
            .withContext(`In ${browserName}`)
            .toEqual([0, 3]);

          await page.mouse.click(editorCenters[1].x, editorCenters[1].y);
          await page.keyboard.up("Control");

          expect(await getSelected(page))
            .withContext(`In ${browserName}`)
            .toEqual([0, 1, 3]);

          await page.keyboard.down("Control");
          await page.keyboard.press("c");
          await page.keyboard.up("Control");

          await page.keyboard.down("Control");
          await page.keyboard.press("v");
          await page.keyboard.up("Control");

          // 0,1,3 are unselected and new pasted editors are selected.
          expect(await getSelected(page))
            .withContext(`In ${browserName}`)
            .toEqual([4, 5, 6]);

          // No ctrl here, hence all are unselected and 2 is selected.
          await page.mouse.click(editorCenters[2].x, editorCenters[2].y);
          expect(await getSelected(page))
            .withContext(`In ${browserName}`)
            .toEqual([2]);

          await page.mouse.click(editorCenters[1].x, editorCenters[1].y);
          expect(await getSelected(page))
            .withContext(`In ${browserName}`)
            .toEqual([1]);

          await page.keyboard.down("Control");

          await page.mouse.click(editorCenters[3].x, editorCenters[3].y);
          expect(await getSelected(page))
            .withContext(`In ${browserName}`)
            .toEqual([1, 3]);

          await page.keyboard.up("Control");

          // Delete 1 and 3.
          await page.keyboard.press("Backspace");

          await page.keyboard.down("Control");
          await page.keyboard.press("a");
          await page.keyboard.up("Control");

          expect(await getSelected(page))
            .withContext(`In ${browserName}`)
            .toEqual([0, 2, 4, 5, 6]);

          // Create an empty editor.
          await page.mouse.click(rect.x + 700, rect.y + 100);
          expect(await getSelected(page))
            .withContext(`In ${browserName}`)
            .toEqual([7]);

          // Set the focus to 2 and check that only 2 is selected.
          await page.mouse.click(editorCenters[2].x, editorCenters[2].y);
          expect(await getSelected(page))
            .withContext(`In ${browserName}`)
            .toEqual([2]);

          // Create an empty editor.
          await page.mouse.click(rect.x + 700, rect.y + 100);
          expect(await getSelected(page))
            .withContext(`In ${browserName}`)
            .toEqual([8]);
          // Dismiss it.
          await page.keyboard.press("Escape");

          // Select all.
          await page.keyboard.down("Control");
          await page.keyboard.press("a");
          await page.keyboard.up("Control");

          // Check that all the editors are correctly selected (and the focus
          // didn't move to the body when the empty editor was removed).
          expect(await getSelected(page))
            .withContext(`In ${browserName}`)
            .toEqual([0, 2, 4, 5, 6]);
        })
      );
    });
  });
});
