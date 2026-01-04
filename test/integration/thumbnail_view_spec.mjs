import {
  closePages,
  kbFocusNext,
  loadAndWait,
  scrollIntoView,
  waitForPageRendered,
} from "./test_utils.mjs";

function waitForThumbnailVisible(page, pageNum, current = false) {
  let selector = `.thumbnailImage[data-l10n-args='{"page":${pageNum}}']`;
  if (current) {
    selector += '[aria-current="page"]';
  }
  return page.waitForSelector(selector, { visible: true });
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
          await page.click("#viewsManagerToggleButton");

          const thumbSelector = "#thumbnailsView .thumbnailImage";
          await page.waitForSelector(thumbSelector, { visible: true });

          await waitForThumbnailVisible(page, 1, /* current = */ true);

          const src = await page.$eval(thumbSelector, el => el.src);
          expect(src)
            .withContext(`In ${browserName}`)
            .toMatch(/^blob:http:/);
        })
      );
    });
  });

  describe("The view is scrolled correctly", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        `.page[data-page-number = "1"] .endOfContent`
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should scroll the view", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#viewsManagerToggleButton");

          await waitForThumbnailVisible(page, 1, /* current = */ true);

          for (const pageNum of [14, 1, 13, 2]) {
            const pageSelector = `.page[data-page-number = "${pageNum}"]`;
            await page.waitForSelector(pageSelector);
            await scrollIntoView(page, pageSelector);
            await waitForPageRendered(page, pageNum);

            await waitForThumbnailVisible(page, pageNum, /* current = */ true);

            const thumbSelector = `.thumbnailImage[data-l10n-args='{"page":${pageNum}}']`;
            const src = await page.$eval(thumbSelector, el => el.src);
            expect(src)
              .withContext(`In ${browserName}`)
              .toMatch(/^blob:http:/);
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

    async function isElementFocused(page, selector) {
      await page.waitForSelector(selector, { visible: true });

      return page.$eval(selector, el => el === document.activeElement);
    }

    it("should navigate with the keyboard", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#viewsManagerToggleButton");

          await waitForThumbnailVisible(page, 1, /* current = */ true);
          await waitForThumbnailVisible(page, 2);
          await waitForThumbnailVisible(page, 3);

          await kbFocusNext(page);
          expect(await isElementFocused(page, "#viewsManagerSelectorButton"))
            .withContext(`In ${browserName}`)
            .toBe(true);

          await kbFocusNext(page);
          expect(
            await isElementFocused(page, "#viewsManagerStatusActionButton")
          )
            .withContext(`In ${browserName}`)
            .toBe(true);

          await kbFocusNext(page);
          expect(
            await isElementFocused(
              page,
              `#thumbnailsView .thumbnailImage[data-l10n-args='{"page":1}']`
            )
          )
            .withContext(`In ${browserName}`)
            .toBe(true);

          await page.keyboard.press("ArrowDown");
          expect(
            await isElementFocused(
              page,
              `#thumbnailsView .thumbnailImage[data-l10n-args='{"page":2}']`
            )
          )
            .withContext(`In ${browserName}`)
            .toBe(true);

          await page.keyboard.press("ArrowUp");
          expect(
            await isElementFocused(
              page,
              `#thumbnailsView .thumbnailImage[data-l10n-args='{"page":1}']`
            )
          )
            .withContext(`In ${browserName}`)
            .toBe(true);

          await page.keyboard.press("ArrowDown");
          await page.keyboard.press("ArrowDown");
          expect(
            await isElementFocused(
              page,
              `#thumbnailsView .thumbnailImage[data-l10n-args='{"page":3}']`
            )
          )
            .withContext(`In ${browserName}`)
            .toBe(true);
          await page.keyboard.press("Enter");
          const currentPage = await page.$eval(
            "#pageNumber",
            el => el.valueAsNumber
          );
          expect(currentPage).withContext(`In ${browserName}`).toBe(3);

          await page.keyboard.press("End");
          expect(
            await isElementFocused(
              page,
              `#thumbnailsView .thumbnailImage[data-l10n-args='{"page":14}']`
            )
          )
            .withContext(`In ${browserName}`)
            .toBe(true);

          await page.keyboard.press("Home");
          expect(
            await isElementFocused(
              page,
              `#thumbnailsView .thumbnailImage[data-l10n-args='{"page":1}']`
            )
          )
            .withContext(`In ${browserName}`)
            .toBe(true);
        })
      );
    });
  });
});
