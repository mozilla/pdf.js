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
  getEditors,
  getEditorSelector,
  getRect,
  getSerialized,
  waitForNoElement,
  waitForSelectedEditor,
} from "./test_utils.mjs";

function loadAndWait(filename, selector) {
  return Promise.all(
    global.integrationSessions.map(async session => {
      const page = await session.browser.newPage();

      // Keep locale-dependent checks deterministic.
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "language", {
          get() {
            return "en-US";
          },
        });
        Object.defineProperty(navigator, "languages", {
          get() {
            return ["en-US", "en"];
          },
        });
      });

      const { origin } = new URL(global.integrationBaseUrl);
      await page.goto(
        `${origin}/web/viewer-geckoview.html` +
          `?file=/test/pdfs/${filename}#zoom=page-fit`
      );
      await page.bringToFront();
      await page.waitForSelector(selector, { timeout: 0 });

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
  });
});
