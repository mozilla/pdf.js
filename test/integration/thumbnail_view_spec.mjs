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
  FSI,
  getThumbnailSelector,
  kbFocusNext,
  loadAndWait,
  PDI,
  showViewsManager,
} from "./test_utils.mjs";

function waitForThumbnailVisible(page, pageNum) {
  return page.waitForSelector(getThumbnailSelector(pageNum), { visible: true });
}

async function waitForMenu(page, buttonSelector, visible = true) {
  return page.waitForFunction(
    (selector, vis) => {
      const button = document.querySelector(selector);
      if (!button) {
        return false;
      }
      return button.getAttribute("aria-expanded") === (vis ? "true" : "false");
    },
    {},
    buttonSelector,
    visible
  );
}

describe("PDF Thumbnail View", () => {
  describe("Works without errors", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", "#viewsManagerToggleButton");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should render thumbnails without errors", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await showViewsManager(page);

          const thumbSelector =
            "#thumbnailsView .thumbnailImageContainer > img";
          await page.waitForSelector(thumbSelector, { visible: true });

          await waitForThumbnailVisible(page, 1);

          await page.waitForSelector(`${thumbSelector}[src^="blob:http:"]`, {
            visible: true,
          });

          const title = await page.$eval(
            getThumbnailSelector(1),
            el => el.title
          );
          expect(title)
            .withContext(`In ${browserName}`)
            .toBe(`Page ${FSI}1${PDI} of ${FSI}14${PDI}`);
        })
      );
    });

    it("should have accessible label on resizer", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await showViewsManager(page);

          const ariaLabel = await page.$eval("#viewsManagerResizer", el =>
            el.getAttribute("aria-label")
          );
          expect(ariaLabel)
            .withContext(`In ${browserName}`)
            .toBe("Sidebar resizer");
        })
      );
    });
  });

  describe("The view is scrolled correctly", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", "#viewsManagerToggleButton");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    async function goToPage(page, number) {
      const handle = await page.evaluateHandle(
        num => [
          new Promise(resolve => {
            const container = document.getElementById("viewsManagerContent");
            container.addEventListener("scrollend", resolve, { once: true });
            // eslint-disable-next-line no-undef
            PDFViewerApplication.pdfLinkService.goToPage(num);
          }),
        ],
        number
      );
      return awaitPromise(handle);
    }

    it("should scroll the view", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await showViewsManager(page);
          await waitForThumbnailVisible(page, 1);

          for (const pageNum of [14, 1, 13, 2]) {
            await goToPage(page, pageNum);
            const thumbSelector = getThumbnailSelector(pageNum);
            await page.waitForSelector(
              `.thumbnail ${thumbSelector}[aria-current="page"]`,
              { visible: true }
            );
            await page.waitForSelector(
              `${thumbSelector} > img[src^="blob:http:"]`,
              {
                visible: true,
              }
            );
          }
        })
      );
    });
  });

  describe("The view is accessible with the keyboard", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", "#viewsManagerToggleButton");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should navigate with the keyboard", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await showViewsManager(page);
          await waitForThumbnailVisible(page, 1);
          await waitForThumbnailVisible(page, 2);
          await waitForThumbnailVisible(page, 3);

          await kbFocusNext(page);
          await page.waitForSelector("#viewsManagerSelectorButton:focus", {
            visible: true,
          });

          await kbFocusNext(page);
          await page.waitForSelector("#viewsManagerStatusActionButton:focus", {
            visible: true,
          });

          await kbFocusNext(page);
          await page.waitForSelector(
            `#thumbnailsView ${getThumbnailSelector(1)}:focus`,
            { visible: true }
          );

          await page.keyboard.press("ArrowDown");
          await page.waitForSelector(
            `#thumbnailsView ${getThumbnailSelector(2)}:focus`,
            { visible: true }
          );

          await page.keyboard.press("ArrowUp");
          await page.waitForSelector(`${getThumbnailSelector(1)}:focus`, {
            visible: true,
          });

          await page.keyboard.press("ArrowDown");
          await page.keyboard.press("ArrowDown");
          await page.waitForSelector(
            `#thumbnailsView ${getThumbnailSelector(3)}:focus`,
            { visible: true }
          );

          await page.keyboard.press("Enter");
          const currentPage = await page.$eval(
            "#pageNumber",
            el => el.valueAsNumber
          );
          expect(currentPage).withContext(`In ${browserName}`).toBe(3);

          await page.keyboard.press("End");
          await page.waitForSelector(
            `#thumbnailsView ${getThumbnailSelector(14)}:focus`,
            { visible: true }
          );

          await page.keyboard.press("Home");
          await page.waitForSelector(
            `#thumbnailsView ${getThumbnailSelector(1)}:focus`,
            { visible: true }
          );
        })
      );
    });
  });

  describe("The manage dropdown menu", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        "#viewsManagerToggleButton",
        null,
        null,
        { enableSplitMerge: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    async function enableMenuItems(page) {
      await page.evaluate(() => {
        document
          .querySelectorAll("#viewsManagerStatusActionOptions button")
          .forEach(button => {
            button.disabled = false;
          });
      });
    }

    it("should open with Enter key and remain open", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await showViewsManager(page);
          await waitForThumbnailVisible(page, 1);

          await enableMenuItems(page);

          // Focus the manage button
          await kbFocusNext(page);
          await kbFocusNext(page);
          await page.waitForSelector("#viewsManagerStatusActionButton:focus", {
            visible: true,
          });

          // Press Enter to open the menu
          await page.keyboard.press("Enter");

          await waitForMenu(page, "#viewsManagerStatusActionButton");

          // Verify first menu item can be focused
          await page.waitForSelector("#viewsManagerStatusActionCopy:focus", {
            visible: true,
          });

          // Close menu with Escape
          await page.keyboard.press("Escape");
          await waitForMenu(page, "#viewsManagerStatusActionButton", false);
        })
      );
    });

    it("should open with Space key and remain open", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await showViewsManager(page);
          await waitForThumbnailVisible(page, 1);

          await enableMenuItems(page);

          // Focus the manage button
          await kbFocusNext(page);
          await kbFocusNext(page);
          await page.waitForSelector("#viewsManagerStatusActionButton:focus", {
            visible: true,
          });

          // Press Space to open the menu
          await page.keyboard.press(" ");

          await waitForMenu(page, "#viewsManagerStatusActionButton");

          // Verify first menu item can be focused
          await page.waitForSelector("#viewsManagerStatusActionCopy:focus", {
            visible: true,
          });

          // Navigate menu items with arrow keys
          await page.keyboard.press("ArrowDown");
          await page.waitForSelector("#viewsManagerStatusActionCut:focus", {
            visible: true,
          });

          // Menu should still be open
          await waitForMenu(page, "#viewsManagerStatusActionButton");

          // Close menu with Escape
          await page.keyboard.press("Escape");
          await waitForMenu(page, "#viewsManagerStatusActionButton", false);
        })
      );
    });
  });

  describe("Checkbox accessibility", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        "#viewsManagerToggleButton",
        null,
        null,
        { enableSplitMerge: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should have a title on the checkbox", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await showViewsManager(page);
          await waitForThumbnailVisible(page, 1);

          const title = await page.$eval(
            `.thumbnail[page-number="1"] input[type="checkbox"]`,
            el => el.title
          );
          expect(title)
            .withContext(`In ${browserName}`)
            .toBe(`Select page ${FSI}1${PDI}`);
        })
      );
    });
  });

  describe("Menu keyboard navigation with multi-character keys (bug 2016212)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "page_with_number_and_link.pdf",
        "#viewsManagerSelectorButton",
        null,
        null,
        { enableSplitMerge: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must navigate menus with ArrowDown and Tab keys", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await showViewsManager(page);
          await waitForThumbnailVisible(page, 1);

          // Focus the views manager selector button
          await page.waitForSelector("#viewsManagerSelectorButton", {
            visible: true,
          });
          await page.focus("#viewsManagerSelectorButton");

          // Open menu with Enter key
          await page.keyboard.press("Enter");

          // Wait for menu to be expanded
          await waitForMenu(page, "#viewsManagerSelectorButton");

          // Check that focus moved to the first menu button (pages)
          await page.waitForSelector("#thumbnailsViewMenu:focus", {
            visible: true,
          });

          // Press ArrowDown to navigate to second item
          await page.keyboard.press("ArrowDown");

          // Should now be on outlines button
          await page.waitForSelector("#outlinesViewMenu:focus", {
            visible: true,
          });

          // Press Tab to move to the manage button (should close views menu)
          await page.keyboard.press("Tab");

          // Wait for views manager menu to be collapsed
          await waitForMenu(page, "#viewsManagerSelectorButton", false);

          // Focus should be on manage button
          await page.waitForSelector("#viewsManagerStatusActionButton:focus", {
            visible: true,
          });

          // Open manage menu with Space key
          await page.keyboard.press(" ");

          // Wait for manage menu to be expanded
          await waitForMenu(page, "#viewsManagerStatusActionButton");
        })
      );
    });
  });

  describe("Views manager status visibility (bug 2016656)", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "page_with_number_and_link.pdf",
        "#viewsManagerToggleButton",
        null,
        null,
        { enableSplitMerge: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should show the manage button in thumbnail view and hide it in outline view", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await showViewsManager(page);
          await waitForThumbnailVisible(page, 1);

          // The status bar (Select pages + Manage button) must be visible in
          // thumbnail view.
          await page.waitForSelector("#viewsManagerStatus", { visible: true });

          // Switch to outline view.
          await page.click("#viewsManagerSelectorButton");
          await page.waitForSelector("#outlinesViewMenu", { visible: true });
          await page.click("#outlinesViewMenu");
          await page.waitForSelector("#outlinesView", { visible: true });

          // The status bar must no longer be visible in outline view.
          await page.waitForSelector("#viewsManagerStatus", { hidden: true });
        })
      );
    });
  });

  describe("Checkbox keyboard navigation", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        "#viewsManagerToggleButton",
        null,
        null,
        { enableSplitMerge: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should focus checkboxes with Tab key", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await showViewsManager(page);
          await waitForThumbnailVisible(page, 1);

          // Focus the first thumbnail button
          await kbFocusNext(page);
          await kbFocusNext(page);
          await kbFocusNext(page);

          // Verify we're on the first thumbnail
          await page.waitForSelector(`${getThumbnailSelector(1)}:focus`, {
            visible: true,
          });

          // Tab to checkbox
          await kbFocusNext(page);
          await page.waitForSelector(
            `.thumbnail[page-number="1"] input[type="checkbox"]:focus`,
            { visible: true }
          );
        })
      );
    });

    it("should navigate checkboxes with arrow keys", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await showViewsManager(page);
          await waitForThumbnailVisible(page, 1);
          await waitForThumbnailVisible(page, 2);

          // Navigate to first checkbox
          await kbFocusNext(page);
          await kbFocusNext(page);
          await kbFocusNext(page);
          await kbFocusNext(page);

          // Verify first checkbox is focused
          await page.waitForSelector(
            `.thumbnail[page-number="1"] input[type="checkbox"]:focus`,
            { visible: true }
          );

          // Navigate to next checkbox with ArrowDown
          await page.keyboard.press("ArrowDown");
          await page.waitForSelector(
            `.thumbnail[page-number="2"] input[type="checkbox"]:focus`,
            { visible: true }
          );

          // Navigate back with ArrowUp
          await page.keyboard.press("ArrowUp");
          await page.waitForSelector(
            `.thumbnail[page-number="1"] input[type="checkbox"]:focus`,
            { visible: true }
          );
        })
      );
    });
  });
});
