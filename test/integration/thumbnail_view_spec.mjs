import {
  awaitPromise,
  closePages,
  kbFocusNext,
  loadAndWait,
} from "./test_utils.mjs";

function waitForThumbnailVisible(page, pageNum) {
  return page.waitForSelector(
    `.thumbnailImage[data-l10n-args='{"page":${pageNum}}']`,
    { visible: true }
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
          await page.click("#viewsManagerToggleButton");

          const thumbSelector = "#thumbnailsView .thumbnailImage";
          await page.waitForSelector(thumbSelector, { visible: true });

          await waitForThumbnailVisible(page, 1);

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
          await page.click("#viewsManagerToggleButton");

          await waitForThumbnailVisible(page, 1);

          for (const pageNum of [14, 1, 13, 2]) {
            await goToPage(page, pageNum);
            const thumbSelector = `.thumbnailImage[data-l10n-args='{"page":${pageNum}}']`;
            await page.waitForSelector(
              `.thumbnail ${thumbSelector}[aria-current="page"]`,
              { visible: true }
            );
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

          await waitForThumbnailVisible(page, 1);
          await waitForThumbnailVisible(page, 2);
          await waitForThumbnailVisible(page, 3);

          await kbFocusNext(page);
          expect(await isElementFocused(page, "#viewsManagerSelectorButton"))
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
