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
  awaitPromise,
  closePages,
  dragAndDrop,
  getAnnotationSelector,
  getEditors,
  getEditorSelector,
  getRect,
  getSerialized,
  isCanvasMonochrome,
  waitForAnnotationEditorLayer,
  waitForNoElement,
  waitForPageRendered,
  waitForSelectedEditor,
} from "./test_utils.mjs";
import { AnnotationEditorType } from "../../src/shared/util.js";

function loadAndWait(filename, selector) {
  return Promise.all(
    global.integrationSessions.map(async session => {
      const page = await session.browser.newPage();

      // Keep locale-dependent checks deterministic.
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "language", {
          get: () => "en-US",
        });
        Object.defineProperty(navigator, "languages", {
          get: () => ["en-US", "en"],
        });
      });

      const { origin } = new URL(global.integrationBaseUrl);
      await page.goto(
        `${origin}/web/viewer-geckoview.html` +
          `?file=/test/pdfs/${filename}#zoom=page-fit`
      );
      await page.bringToFront();
      await page.waitForSelector(selector, { timeout: 0 });

      // Match the GeckoView build, which excludes desktop editor styles.
      await page.evaluate(() => {
        const removeImport = sheet => {
          const { cssRules } = sheet;
          for (let i = cssRules.length - 1; i >= 0; i--) {
            const rule = cssRules[i];
            if (!(rule instanceof CSSImportRule)) {
              continue;
            }
            const { pathname } = new URL(rule.href, sheet.href);
            if (pathname.endsWith("/annotation_editor_layer_builder.css")) {
              sheet.deleteRule(i);
            } else if (rule.styleSheet) {
              removeImport(rule.styleSheet);
            }
          }
        };
        for (const sheet of document.styleSheets) {
          removeImport(sheet);
        }
      });

      return [session.name, page];
    })
  );
}

// Dispatch the viewer event derived from GeckoView's "addsignature" DOM event.
function addSignature(page, text) {
  return page.evaluate(txt => {
    window.PDFViewerApplication.eventBus.dispatch("addsignature", {
      source: window,
      text: txt,
    });
  }, text);
}

// Check all four corners at each tested rotation and scale without resizing.
async function checkToolbarInPage(browserName, page, direction) {
  await page.evaluate(dir => {
    document.documentElement.dir = dir;
    document.querySelector(".annotationEditorLayer").dir = dir;
  }, direction);
  for (const rotation of [0, 90, 180, 270]) {
    if (rotation) {
      const rendered = await waitForAnnotationEditorLayer(page);
      await page.evaluate(angle => {
        window.PDFViewerApplication.pdfViewer.pagesRotation = angle;
      }, rotation);
      await awaitPromise(rendered);
    }
    await addSignature(page, "Hello");
    const editorSelector = getEditorSelector(rotation / 90);
    await waitForSelectedEditor(page, editorSelector);
    await page.waitForSelector(`${editorSelector} .editToolbar`, {
      visible: true,
    });

    for (const scale of [0.75, 1.5]) {
      const rendered = await waitForAnnotationEditorLayer(page);
      await page.evaluate(value => {
        window.PDFViewerApplication.pdfViewer.currentScale = value;
      }, scale);
      await awaitPromise(rendered);
      await page.waitForSelector(".annotationEditorLayer:not([hidden])");
      const results = await page.evaluate(sel => {
        const app = window.PDFViewerApplication;
        const div = document.querySelector(sel);
        const editor =
          app.pdfViewer._layerProperties.annotationEditorUIManager.getEditor(
            div.id
          );
        const toolbar = div.querySelector(".editToolbar");
        const pageRect = div.parentElement.getBoundingClientRect();
        const dimensions = [editor.width, editor.height];
        const overflows = [];
        for (const [x, y] of [
          [-1, -1],
          [-1, 2],
          [2, -1],
          [2, 2],
        ]) {
          editor.x = x;
          editor.y = y;
          editor.fixAndSetPosition();
          editor.translationDone();
          for (const element of [div, toolbar]) {
            const rect = element.getBoundingClientRect();
            overflows.push(
              Math.max(
                pageRect.left - rect.left,
                rect.right - pageRect.right,
                pageRect.top - rect.top,
                rect.bottom - pageRect.bottom
              )
            );
          }
        }
        return {
          overflows,
          dimensions,
          finalDimensions: [editor.width, editor.height],
        };
      }, editorSelector);
      const context = `${browserName}, ${direction}, rotation ${rotation}, scale ${scale}`;
      expect(Math.max(...results.overflows))
        .withContext(context)
        .toBeLessThan(1);
      expect(results.finalDimensions)
        .withContext(context)
        .toEqual(results.dimensions);
    }
  }
}

describe("GeckoView viewer", () => {
  describe("Typed signature", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must add a signature in the middle of the page and let the user remove it", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await addSignature(page, "Hello");

          const editorSelector = getEditorSelector(0);
          await page.waitForSelector(editorSelector, { visible: true });
          await waitForSelectedEditor(page, editorSelector);
          await page.waitForSelector(
            `.canvasWrapper > svg use[href="#path_0"]`
          );

          await page.waitForSelector(`${editorSelector} .resizer`);
          await page.waitForSelector(
            `${editorSelector} .editToolbar .deleteButton`
          );

          const editorRect = await getRect(page, editorSelector);
          const layerRect = await getRect(
            page,
            ".page[data-page-number='1'] .annotationEditorLayer"
          );
          const editorCenter = [
            editorRect.x + editorRect.width / 2,
            editorRect.y + editorRect.height / 2,
          ];
          const layerCenter = [
            layerRect.x + layerRect.width / 2,
            layerRect.y + layerRect.height / 2,
          ];
          expect(Math.abs(editorCenter[0] - layerCenter[0]))
            .withContext(`In ${browserName}`)
            .toBeLessThan(2);
          expect(Math.abs(editorCenter[1] - layerCenter[1]))
            .withContext(`In ${browserName}`)
            .toBeLessThan(2);

          let serialized = await getSerialized(page);
          expect(serialized.length).withContext(`In ${browserName}`).toEqual(1);
          const { isSignature, areContours, accessibilityData, pageIndex } =
            serialized[0];
          expect(isSignature).withContext(`In ${browserName}`).toBeTrue();
          expect(areContours).withContext(`In ${browserName}`).toBeTrue();
          expect(pageIndex).withContext(`In ${browserName}`).toEqual(0);
          expect(accessibilityData?.alt)
            .withContext(`In ${browserName}`)
            .toEqual("Hello");

          // Exercise the already-active mode.
          await addSignature(page, "World");

          const secondEditorSelector = getEditorSelector(1);
          await page.waitForSelector(secondEditorSelector, { visible: true });
          await waitForSelectedEditor(page, secondEditorSelector);
          expect(await getEditors(page, "signature"))
            .withContext(`In ${browserName}`)
            .toEqual([0, 1]);

          await page.click(
            `${secondEditorSelector} .editToolbar .deleteButton`
          );
          await waitForNoElement(page, secondEditorSelector);

          serialized = await getSerialized(page);
          expect(serialized.length).withContext(`In ${browserName}`).toEqual(1);
          expect(serialized[0].accessibilityData?.alt)
            .withContext(`In ${browserName}`)
            .toEqual("Hello");
        })
      );
    });

    it("must ignore a signature without any text", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await addSignature(page, "   ");
          await addSignature(page, "PDF.js");

          // Whitespace must not consume an editor id.
          const editorSelector = getEditorSelector(0);
          await page.waitForSelector(editorSelector, { visible: true });
          expect(await getEditors(page, "signature"))
            .withContext(`In ${browserName}`)
            .toEqual([0]);

          const serialized = await getSerialized(page);
          expect(serialized.length).withContext(`In ${browserName}`).toEqual(1);
          expect(serialized[0].accessibilityData?.alt)
            .withContext(`In ${browserName}`)
            .toEqual("PDF.js");
        })
      );
    });

    it("must keep the signature and its close button in the page", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await addSignature(page, "Hello");

          const editorSelector = getEditorSelector(0);
          const buttonSelector = `${editorSelector} .editToolbar .deleteButton`;
          await page.waitForSelector(editorSelector, { visible: true });
          await waitForSelectedEditor(page, editorSelector);
          await page.waitForSelector(buttonSelector, { visible: true });

          const getButtonOffset = async () => {
            const editorRect = await getRect(page, editorSelector);
            const buttonRect = await getRect(page, buttonSelector);
            return [
              Math.round(buttonRect.x - editorRect.x),
              Math.round(buttonRect.y - editorRect.y),
            ];
          };
          const buttonOffset = await getButtonOffset();

          // Drag the signature into the top-right corner of the page.
          const editorRect = await getRect(page, editorSelector);
          const layerRect = await getRect(
            page,
            ".page[data-page-number='1'] .annotationEditorLayer"
          );
          await dragAndDrop(
            page,
            editorSelector,
            [
              [
                layerRect.x + layerRect.width - editorRect.x - editorRect.width,
                layerRect.y - editorRect.y,
              ],
            ],
            10
          );

          // The button should touch the page's top and right edges.
          const buttonRect = await getRect(page, buttonSelector);
          expect(Math.abs(buttonRect.y - layerRect.y))
            .withContext(`In ${browserName}`)
            .toBeLessThan(1);
          expect(
            Math.abs(
              buttonRect.x + buttonRect.width - layerRect.x - layerRect.width
            )
          )
            .withContext(`In ${browserName}`)
            .toBeLessThan(1);
          expect(await getButtonOffset())
            .withContext(`In ${browserName}`)
            .toEqual(buttonOffset);

          const isButtonHit = await page.evaluate(sel => {
            const button = document.querySelector(sel);
            const { x, y, width, height } = button.getBoundingClientRect();
            return (
              document.elementFromPoint(x + width / 2, y + height / 2) ===
              button
            );
          }, buttonSelector);
          expect(isButtonHit).withContext(`In ${browserName}`).toBeTrue();

          await page.click(buttonSelector);
          await waitForNoElement(page, editorSelector);
        })
      );
    });

    it("must keep the close button of a new wide signature in the page", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // Make the toolbar overflow a centered wide signature's side margin.
          const rendered = await waitForAnnotationEditorLayer(page);
          await page.evaluate(() => {
            window.PDFViewerApplication.pdfViewer.currentScale = 0.5;
          });
          await awaitPromise(rendered);

          await addSignature(
            page,
            "A very long signature which is wider than the page"
          );

          const editorSelector = getEditorSelector(0);
          const buttonSelector = `${editorSelector} .editToolbar .deleteButton`;
          await waitForSelectedEditor(page, editorSelector);
          await page.waitForSelector(buttonSelector, { visible: true });

          const layerRect = await getRect(
            page,
            ".page[data-page-number='1'] .annotationEditorLayer"
          );
          const buttonRect = await getRect(page, buttonSelector);
          expect(
            buttonRect.x + buttonRect.width - layerRect.x - layerRect.width
          )
            .withContext(`In ${browserName}`)
            .toBeLessThan(1);

          // The drawing must follow the editor.
          const editorRect = await getRect(page, editorSelector);
          const drawingRect = await getRect(page, ".canvasWrapper svg.draw");
          expect(Math.abs(drawingRect.x - editorRect.x))
            .withContext(`In ${browserName}`)
            .toBeLessThan(1);
          expect(Math.abs(drawingRect.y - editorRect.y))
            .withContext(`In ${browserName}`)
            .toBeLessThan(1);
        })
      );
    });

    it("must keep the toolbar in the page after rotation and zoom in ltr", async () => {
      await Promise.all(
        pages.map(([browserName, page]) =>
          checkToolbarInPage(browserName, page, "ltr")
        )
      );
    });

    it("must keep the toolbar in the page after rotation and zoom in rtl", async () => {
      await Promise.all(
        pages.map(([browserName, page]) =>
          checkToolbarInPage(browserName, page, "rtl")
        )
      );
    });
  });

  describe("Existing annotations", () => {
    const annotationSelector = `.annotationLayer ${getAnnotationSelector("26R")}`;
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("freetexts.pdf", annotationSelector);
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must not make them editable", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const checkNotEditable = async () => {
            expect(await getEditors(page, "freeText"))
              .withContext(`In ${browserName}`)
              .toEqual([]);
            const hiddenAnnotations = await page.$$eval(
              ".annotationLayer .freeTextAnnotation",
              els => els.filter(el => el.hidden).length
            );
            expect(hiddenAnnotations)
              .withContext(`In ${browserName}`)
              .toEqual(0);
            // Free-text annotations must stay painted in signature mode.
            const rect = await getRect(page, annotationSelector);
            expect(await isCanvasMonochrome(page, 1, rect, 0xffffffff))
              .withContext(`In ${browserName}`)
              .toBeFalse();
          };

          await checkNotEditable();

          // Double-clicking must not switch to the free text editor.
          await page.click(annotationSelector, { count: 2 });
          // Editing an existing annotation only starts after a redraw.
          let handle = await waitForPageRendered(page, 1);
          await page.evaluate(() => {
            window.PDFViewerApplication.pdfViewer.increaseScale({
              scaleFactor: 2,
            });
          });
          await awaitPromise(handle);
          const mode = await page.evaluate(
            () => window.PDFViewerApplication.pdfViewer.annotationEditorMode
          );
          expect(mode)
            .withContext(`In ${browserName}`)
            .toEqual(AnnotationEditorType.NONE);
          await checkNotEditable();

          await addSignature(page, "Hello");
          await page.waitForSelector(getEditorSelector(0), { visible: true });

          // Check visibility after a redraw.
          handle = await waitForPageRendered(page, 1);
          await page.evaluate(() => {
            window.PDFViewerApplication.pdfViewer.decreaseScale({
              scaleFactor: 2,
            });
          });
          await awaitPromise(handle);
          await checkNotEditable();

          await addSignature(page, "World");
          await page.waitForSelector(getEditorSelector(1), { visible: true });
          await checkNotEditable();
        })
      );
    });
  });
});
