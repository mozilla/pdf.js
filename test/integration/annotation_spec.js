/* Copyright 2020 Mozilla Foundation
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

describe("Annotation highlight", () => {
  describe("annotation-highlight.pdf", () => {
    let pages;

    beforeAll(async () => {
      pages = await Promise.all(
        global.integrationSessions.map(async session => {
          const page = await session.browser.newPage();
          await page.goto(
            `${global.integrationBaseUrl}?file=/test/pdfs/annotation-highlight.pdf`
          );
          await page.bringToFront();
          await page.waitForSelector("[data-annotation-id='19R']", {
            timeout: 0,
          });
          return page;
        })
      );
    });

    afterAll(async () => {
      await Promise.all(
        pages.map(async page => {
          await page.close();
        })
      );
    });

    it("must show a popup on mouseover", async () => {
      await Promise.all(
        pages.map(async page => {
          let hidden = await page.$eval(
            "[data-annotation-id='21R']",
            el => el.hidden
          );
          expect(hidden).toEqual(true);
          await page.hover("[data-annotation-id='19R']");
          await page.waitForTimeout(100);
          hidden = await page.$eval(
            "[data-annotation-id='21R']",
            el => el.hidden
          );
          expect(hidden).toEqual(false);
        })
      );
    });
  });
});
