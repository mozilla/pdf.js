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

import {
  closePages,
  FSI,
  kbFocusNext,
  loadAndWait,
  PDI,
  waitForTextToBe,
} from "./test_utils.mjs";

function fuzzyMatch(a, b, browserName, pixelFuzz = 3) {
  expect(a)
    .withContext(`In ${browserName}`)
    .toBeLessThan(b + pixelFuzz);
  expect(a)
    .withContext(`In ${browserName}`)
    .toBeGreaterThan(b - pixelFuzz);
}

async function search(page, query, notFound = false) {
  await page.click("#viewFindButton");
  await page.waitForSelector("#findInput", { visible: true });
  await page.type("#findInput", query);
  await page.waitForSelector("#findInput:not([data-status='pending'])");
  if (!notFound) {
    await page.waitForSelector(".highlight");
  }
}

describe("find bar", () => {
  describe("highlight all", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("find_all.pdf", ".textLayer", 100);
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must highlight search results in the right positions", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await search(page, "a");

          // Highlight all occurrences of the letter A (case insensitive).
          await page.click("#findHighlightAll + label");

          // The PDF file contains the text 'AB BA' in a monospace font on a
          // single line. Check if the two occurrences of A are highlighted.
          const highlights = await page.$$(".textLayer .highlight");
          expect(highlights.length).withContext(`In ${browserName}`).toEqual(2);

          // Normalize the highlight's height. The font data in the PDF sets the
          // size of the glyphs (and therefore the size of the highlights), but
          // the viewer applies extra padding to them. For the comparison we
          // therefore use the unpadded, glyph-sized parent element's height.
          const parentSpan = (await highlights[0].$$("xpath/.."))[0];
          const parentBox = await parentSpan.boundingBox();
          const firstA = await highlights[0].boundingBox();
          const secondA = await highlights[1].boundingBox();
          firstA.height = parentBox.height;
          secondA.height = parentBox.height;

          // Check if the vertical position of the highlights is correct. Both
          // should be on a single line.
          expect(firstA.y).withContext(`In ${browserName}`).toEqual(secondA.y);

          // Check if the height of the two highlights is correct. Both should
          // match the font size.
          const fontSize = 26.66; // From the PDF.
          fuzzyMatch(firstA.height, fontSize, browserName);
          fuzzyMatch(secondA.height, fontSize, browserName);

          // Check if the horizontal position of the highlights is correct. The
          // second occurrence should be four glyph widths (three letters and
          // one space) away from the first occurrence.
          const pageDiv = await page.$(".page canvas");
          const pageBox = await pageDiv.boundingBox();
          const expectedFirstAX = 30; // From the PDF.
          const glyphWidth = 15.98; // From the PDF.
          fuzzyMatch(firstA.x, pageBox.x + expectedFirstAX, browserName);
          fuzzyMatch(secondA.x, firstA.x + glyphWidth * 4, browserName);
        })
      );
    });

    it("must highlight search results using keyboard navigation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await search(page, "a");

          await kbFocusNext(page, ".toggleButton:has(#findHighlightAll)");
          await page.keyboard.press("Enter");

          const highlights = await page.$$(".textLayer .highlight");
          expect(highlights.length).withContext(`In ${browserName}`).toEqual(2);
        })
      );
    });
  });

  describe("search with no search results", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("find_all.pdf", ".textLayer", 100);
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must handle no search results being found", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await search(page, "nonexistent", /* notFound = */ true);

          await waitForTextToBe(page, "#findMsg", "Phrase not found");
        })
      );
    });
  });

  describe("search with multiple search results", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("find_all.pdf", ".textLayer", 100);
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must handle multiple search results being found", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await search(page, "a");

          // Moving forward should update the find count, and message if
          // wrapping occurs, correctly.
          for (let i = 0; i < 3; i++) {
            if (i > 0) {
              await page.click("#findNextButton");
              await page.waitForSelector("#findInput[data-status='']");
            }

            await waitForTextToBe(
              page,
              "#findResultsCount",
              `${FSI}${(i % 2) + 1}${PDI} of ${FSI}2${PDI} matches`
            );
          }

          await waitForTextToBe(
            page,
            "#findMsg",
            "Reached end of document, continued from top"
          );

          // Moving backwards should also update the find count and message.
          await page.click("#findPreviousButton");
          await page.waitForSelector("#findInput[data-status='']");

          await waitForTextToBe(
            page,
            "#findResultsCount",
            `${FSI}2${PDI} of ${FSI}2${PDI} matches`
          );

          await waitForTextToBe(
            page,
            "#findMsg",
            "Reached top of document, continued from bottom"
          );
        })
      );
    });
  });

  describe("search in the XFA layer", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("xfa_imm5257e.pdf", ".xfaLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must find search results in the XFA layer", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await search(page, "preferences");

          await waitForTextToBe(
            page,
            "#findResultsCount",
            `${FSI}1${PDI} of ${FSI}1${PDI} match`
          );
          await waitForTextToBe(page, ".highlight.selected", "Preferences");
        })
      );
    });
  });

  describe("scroll search results into view (CSS scaling)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue19207.pdf", ".textLayer", 200);
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must scroll search results into view if CSS scaling is applied", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await search(page, "40");

          const highlight = await page.$(".textLayer .highlight");
          expect(await highlight.isIntersectingViewport()).toBeTrue();
        })
      );
    });
  });

  describe("scroll search results into view (small viewport)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".textLayer", 100);
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must scroll search results into view if the viewport is small", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // Set a smaller viewport to simulate a mobile device
          await page.setViewport({ width: 350, height: 600 });

          await search(page, "productivity");

          const highlight = await page.$(".textLayer .highlight");
          expect(await highlight.isIntersectingViewport()).toBeTrue();
        })
      );
    });
  });

  describe("scroll search results into view (rotated pages, bug 2021392)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "hello_world_rotated.pdf",
        ".textLayer",
        "page-fit"
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must scroll search results into view if the pages are rotated", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await search(page, "hello");

          for (let i = 0; i < 5; i++) {
            if (i > 0) {
              await page.click("#findNextButton");
              await page.waitForSelector("#findInput[data-status='']");
            }

            // Verify we are on the expected match number.
            await waitForTextToBe(
              page,
              "#findResultsCount",
              `${FSI}${i + 1}${PDI} of ${FSI}5${PDI} matches`
            );

            // The selected highlight must be visible in the viewport.
            const selected = await page.$(".textLayer .highlight.selected");
            expect(await selected.isIntersectingViewport())
              .withContext(`In ${browserName}, match ${i + 1}`)
              .toBeTrue();
          }
        })
      );
    });
  });

  describe("close the find bar", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("find_all.pdf", ".textLayer", 100);
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must close the find bar using the toolbar button", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await search(page, "a");

          let highlights = await page.$$(".textLayer .highlight");
          expect(highlights.length).withContext(`In ${browserName}`).toEqual(1);

          await page.click("#viewFindButton");
          await page.waitForSelector("#findInput", { hidden: true });

          // Closing the find bar should remove any highlights.
          highlights = await page.$$(".textLayer .highlight");
          expect(highlights.length).withContext(`In ${browserName}`).toEqual(0);
        })
      );
    });

    it("must close the find bar using the Escape key", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await search(page, "a");

          let highlights = await page.$$(".textLayer .highlight");
          expect(highlights.length).withContext(`In ${browserName}`).toEqual(1);

          await page.keyboard.press("Escape");
          await page.waitForSelector("#findInput", { hidden: true });

          // Closing the find bar should remove any highlights.
          highlights = await page.$$(".textLayer .highlight");
          expect(highlights.length).withContext(`In ${browserName}`).toEqual(0);
        })
      );
    });
  });
});
