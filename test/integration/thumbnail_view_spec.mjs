import { awaitPromise, closePages, loadAndWait } from "./test_utils.mjs";

describe("PDF Thumbnail View", () => {
  describe("Works without errors", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("tracemonkey.pdf", "#sidebarToggleButton");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("should render thumbnails without errors", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.click("#sidebarToggleButton");

          const thumbSelector = "#thumbnailView .thumbnailImage";
          await page.waitForSelector(thumbSelector, { visible: true });

          await page.waitForSelector(
            "#thumbnailView .thumbnail:not(.missingThumbnailImage)"
          );

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
      pages = await loadAndWait("tracemonkey.pdf", "#sidebarToggleButton");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    async function goToPage(page, number) {
      const handle = await page.evaluateHandle(
        num => [
          new Promise(resolve => {
            const container = document.getElementById("thumbnailView");
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
          await page.click("#sidebarToggleButton");

          for (const pageNum of [14, 1, 13, 2]) {
            await goToPage(page, pageNum);
            const thumbSelector = `.thumbnailImage[data-l10n-args='{"page":${pageNum}}']`;
            await page.waitForSelector(
              `.thumbnail:has(${thumbSelector}).selected`,
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
});
