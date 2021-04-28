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

const { closePages, loadAndWait } = require("./test_utils.js");

function fuzzyMatch(a, b, browserName, pixelFuzz = 3) {
  expect(a)
    .withContext(`In ${browserName}`)
    .toBeLessThan(b + pixelFuzz);
  expect(a)
    .withContext(`In ${browserName}`)
    .toBeGreaterThan(b - pixelFuzz);
}

describe("find bar", () => {
  describe("highlight all", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("find_all.pdf#zoom=100", ".textLayer");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must highlight text in the right position", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#viewFind");
          await page.waitForSelector("#viewFind", { hidden: false });
          await page.type("#findInput", "a");
          await page.click("#findHighlightAll");
          await page.waitForSelector(".textLayer .highlight");
          // The PDF has the text "AB BA" in a monospace font.
          // Make sure we have the right number of highlighted divs.
          const highlights = await page.$$(".textLayer .highlight");
          expect(highlights.length).withContext(`In ${browserName}`).toEqual(2);
          const glyphWidth = 15.98; // From the PDF.
          const pageDiv = await page.$(".page canvas");
          const pageBox = await pageDiv.boundingBox();
          const firstA = await highlights[0].boundingBox();
          const secondA = await highlights[1].boundingBox();
          // Subtract the page offset from the text bounding boxes;
          firstA.x = firstA.x - pageBox.x;
          firstA.y = firstA.y - pageBox.y;
          secondA.x = secondA.x - pageBox.x;
          secondA.y = secondA.y - pageBox.y;
          // They should be on the same line.
          expect(firstA.y).withContext(`In ${browserName}`).toEqual(secondA.y);
          const fontSize = 26.66; // From the PDF.
          // The highlighted text has more padding.
          fuzzyMatch(firstA.height, fontSize + 5, browserName);
          fuzzyMatch(secondA.height, fontSize + 5, browserName);
          const expectedFirstAX = 28;
          fuzzyMatch(firstA.x, expectedFirstAX, browserName);
          // The second 'A' should be 4 glyphs widths from the first.
          fuzzyMatch(secondA.x, expectedFirstAX + glyphWidth * 4, browserName);
        })
      );
    });
  });
});
