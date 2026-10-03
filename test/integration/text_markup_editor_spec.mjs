/* Copyright 2026 Mozilla Foundation
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
  getEditorSelector,
  getFirstSerialized,
  getSerialized,
  getSpanRectFromText,
  highlightSpan,
  kbUndo,
  loadAndWait,
  switchToEditor,
  waitForSerialized,
  waitForStorageEntries,
  waitForTextToBe,
} from "./test_utils.mjs";

// The annotation editor types (see `AnnotationEditorType`).
const EDITORS = [
  { name: "Underline", annotationType: 10, alert: "Underline added" },
  { name: "Squiggly", annotationType: 11, alert: "Squiggly underline added" },
  { name: "StrikeOut", annotationType: 12, alert: "Strikethrough added" },
];

describe("Text markup Editors", () => {
  for (const { name, annotationType, alert } of EDITORS) {
    describe(`${name} Editor`, () => {
      let pages;

      beforeEach(async () => {
        pages = await loadAndWait(
          "tracemonkey.pdf",
          ".annotationEditorLayer",
          null,
          null,
          { enableTextMarkupEditors: true }
        );
      });

      afterEach(async () => {
        await closePages(pages);
      });

      it("must create an annotation from the selected text", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            await switchToEditor(name, page);

            await highlightSpan(page, 1, "Abstract");
            await waitForTextToBe(page, "#viewer-alert", alert);
            await page.waitForSelector(
              `.page[data-page-number = "1"] svg.textMarkup`,
              { visible: true }
            );

            await waitForSerialized(page, 1);
            const serialized = await getFirstSerialized(page);
            expect(serialized.annotationType)
              .withContext(`In ${browserName}`)
              .toEqual(annotationType);
            expect(serialized.quadPoints.length)
              .withContext(`In ${browserName}`)
              .toEqual(8);
            expect(serialized.color)
              .withContext(`In ${browserName}`)
              .toEqual([0, 0, 0]);
          })
        );
      });

      it("must create an annotation from the floating button", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            const rect = await getSpanRectFromText(page, 1, "Abstract");
            await page.mouse.click(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2,
              { count: 2, delay: 100 }
            );

            const buttonSelector = `.textLayer .${name.toLowerCase()}Button`;
            await page.waitForSelector(buttonSelector);
            await page.click(buttonSelector);

            await page.waitForSelector(getEditorSelector(0));
            await page.waitForSelector(
              `#editor${name}Button[aria-expanded="true"]`
            );

            await waitForSerialized(page, 1);
            const serialized = await getFirstSerialized(page);
            expect(serialized.annotationType)
              .withContext(`In ${browserName}`)
              .toEqual(annotationType);
          })
        );
      });

      it("must use the color set in the toolbar", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            await switchToEditor(name, page);

            await page.$eval(`#editor${name}Color`, input => {
              input.value = "#ff0000";
              input.dispatchEvent(new Event("input"));
            });
            await highlightSpan(page, 1, "Abstract");
            await page.waitForSelector(
              `.page[data-page-number = "1"] svg.textMarkup[fill="#ff0000"]`
            );

            await waitForSerialized(page, 1);
            const serialized = await getSerialized(page, x => x.color);
            expect(serialized)
              .withContext(`In ${browserName}`)
              .toEqual([[255, 0, 0]]);
          })
        );
      });

      it("must create the same annotation on a rotated page", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            await switchToEditor(name, page);

            await highlightSpan(page, 1, "Abstract");
            await waitForSerialized(page, 1);
            const { quadPoints } = await getFirstSerialized(page);
            await kbUndo(page);
            await waitForStorageEntries(page, 0);
            // On a rotated page, the text can be under the editor parameters
            // toolbar, hence the annotation is created from the floating
            // button, outside of the editing mode.
            await switchToEditor(name, page, /* disable = */ true);

            await page.evaluate(() => {
              window.PDFViewerApplication.rotatePages(90);
            });
            await page.waitForSelector(
              ".annotationEditorLayer[data-main-rotation='90']"
            );
            // Wait for the text layer to be laid out with the new rotation.
            await page.waitForFunction(() => {
              for (const el of document.querySelectorAll(
                `.page[data-page-number="1"] > .textLayer span:not(:has(> span))`
              )) {
                if (el.textContent === "Abstract") {
                  const { width, height } = el.getBoundingClientRect();
                  return height > width && width > 0;
                }
              }
              return false;
            });

            const rect = await getSpanRectFromText(page, 1, "Abstract");
            await page.mouse.click(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2,
              { count: 2, delay: 100 }
            );
            const buttonSelector = `.textLayer .${name.toLowerCase()}Button`;
            await page.waitForSelector(buttonSelector);
            await page.click(buttonSelector);
            await page.waitForSelector(
              `.page[data-page-number = "1"] svg.textMarkup[data-main-rotation="90"]`,
              { visible: true }
            );
            await waitForSerialized(page, 1);

            // The quadPoints are in the page coordinate system, hence they
            // mustn't depend on the rotation.
            const { quadPoints: rotatedQuadPoints } =
              await getFirstSerialized(page);
            expect(rotatedQuadPoints.length)
              .withContext(`In ${browserName}`)
              .toEqual(quadPoints.length);
            expect(
              rotatedQuadPoints.every((v, i) => Math.abs(v - quadPoints[i]) < 1)
            )
              .withContext(`In ${browserName}: ${rotatedQuadPoints}`)
              .toBeTrue();

            // The markup must be drawn on the text.
            const spanRect = await getSpanRectFromText(page, 1, "Abstract");
            const svgRect = await page.$eval(
              `.page[data-page-number = "1"] svg.textMarkup`,
              el => {
                const { x, y, width, height } = el.getBoundingClientRect();
                return { x, y, width, height };
              }
            );
            expect(
              svgRect.x < spanRect.x + spanRect.width &&
                spanRect.x < svgRect.x + svgRect.width &&
                svgRect.y < spanRect.y + spanRect.height &&
                spanRect.y < svgRect.y + svgRect.height
            )
              .withContext(`In ${browserName}`)
              .toBeTrue();
          })
        );
      });

      it("must remove the annotation on undo", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            await switchToEditor(name, page);

            await highlightSpan(page, 1, "Abstract");
            await waitForSerialized(page, 1);

            await kbUndo(page);
            await waitForStorageEntries(page, 0);
            await page.waitForSelector(
              `.page[data-page-number = "1"] svg.textMarkup`,
              { hidden: true }
            );
          })
        );
      });
    });
  }
});
