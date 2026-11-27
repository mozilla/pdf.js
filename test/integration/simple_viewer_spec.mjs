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

// Integration tests for the simple viewer (test/components/).

function getSelector(id) {
  return `[data-element-id="${id}"]`;
}

function getAnnotationSelector(id) {
  return `[data-annotation-id="${id}"]`;
}

describe("Simple viewer", () => {
  describe("TextLayerBuilder without abortSignal", () => {
    let pages;

    beforeEach(async () => {
      const origin = new URL(global.integrationBaseUrl).origin;
      pages = await Promise.all(
        global.integrationSessions.map(async session => {
          const page = await session.browser.newPage();
          await page.goto(
            `${origin}/test/components/simple-viewer.html` +
              `?file=/test/pdfs/tracemonkey.pdf`
          );
          await page.bringToFront();
          await page.waitForSelector(
            "[data-page-number='1'] .textLayer .endOfContent"
          );
          await page.waitForSelector(
            "[data-page-number='2'] .textLayer .endOfContent"
          );
          return [session.name, page];
        })
      );
    });

    afterEach(async () => {
      await Promise.all(pages.map(([, page]) => page.close()));
    });

    it("must produce text spans in the text layer", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const count = await page.evaluate(
            () => document.querySelectorAll(".textLayer span").length
          );
          expect(count).withContext(`In ${browserName}`).toBeGreaterThan(0);
        })
      );
    });
  });

  describe("Two viewers with separate abortSignals", () => {
    let pages;

    beforeEach(async () => {
      const origin = new URL(global.integrationBaseUrl).origin;
      pages = await Promise.all(
        global.integrationSessions.map(async session => {
          const page = await session.browser.newPage();
          await page.goto(`${origin}/test/components/two-viewers.html`);
          await page.bringToFront();
          return [session.name, page];
        })
      );
    });

    afterEach(async () => {
      await Promise.all(pages.map(([, page]) => page.close()));
    });

    // Returns a handle to the function that destroys the viewer.
    function initializeViewer(page, index) {
      return page.evaluateHandle(i => window.initializeViewer(i), index);
    }

    async function checkSelection(browserName, page, index) {
      const textLayerSelector = `#viewerContainer${index} [data-page-number='1'] .textLayer`;
      await page.click(`${textLayerSelector} span`);

      // The .selecting class is removed on pointerup by the global listener
      const count = await page.evaluate(
        () => document.querySelectorAll(".textLayer.selecting").length
      );
      expect(count).withContext(`In ${browserName}`).toEqual(0);
    }

    it("must keep handling text selection in the second viewer after the first one is destroyed", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const destroyHandle = await initializeViewer(page, 0);
          await initializeViewer(page, 1);
          await destroyHandle.evaluate(destroy => destroy());
          await checkSelection(browserName, page, 1);
        })
      );
    });

    it("must keep handling text selection in the first viewer after the second one is destroyed", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await initializeViewer(page, 0);
          const destroyHandle = await initializeViewer(page, 1);
          await destroyHandle.evaluate(destroy => destroy());
          await checkSelection(browserName, page, 0);
        })
      );
    });

    it("must handle text selection in a viewer created after another one was destroyed", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const destroyHandle = await initializeViewer(page, 0);
          await destroyHandle.evaluate(destroy => destroy());
          await initializeViewer(page, 1);
          await checkSelection(browserName, page, 1);
        })
      );
    });
  });

  describe("Scripting support with evaljs.pdf", () => {
    let pages;

    beforeEach(async () => {
      const origin = new URL(global.integrationBaseUrl).origin;
      pages = await Promise.all(
        global.integrationSessions.map(async session => {
          const page = await session.browser.newPage();
          await page.goto(
            `${origin}/test/components/simple-viewer.html` +
              `?file=/test/pdfs/evaljs.pdf`
          );
          await page.bringToFront();
          await page.waitForSelector(getSelector("55R"));
          await page.waitForFunction(
            "window.pdfScriptingManager?.ready === true"
          );
          return [session.name, page];
        })
      );
    });

    afterEach(async () => {
      await Promise.all(pages.map(([, page]) => page.close()));
    });

    it("must evaluate JavaScript entered in the input field", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.type(getSelector("55R"), "1 + 1");
          await page.click(getAnnotationSelector("57R"));
          await page.waitForFunction(
            `document.querySelector('${getSelector("56R")}').value !== ""`
          );
          const text = await page.$eval(getSelector("56R"), el => el.value);
          expect(text).withContext(`In ${browserName}`).toEqual("2");
        })
      );
    });
  });
});
