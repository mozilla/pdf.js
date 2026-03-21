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
});
