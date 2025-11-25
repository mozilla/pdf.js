import { closePages, loadAndWait } from "./test_utils.mjs";

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
});
