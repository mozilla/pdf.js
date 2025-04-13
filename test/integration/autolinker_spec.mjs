/* Copyright 2025 Mozilla Foundation
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
  createPromise,
  loadAndWait,
} from "./test_utils.mjs";

function waitForLinkAnnotations(page, pageNumber) {
  return page.evaluateHandle(
    number => [
      new Promise(resolve => {
        const { eventBus } = window.PDFViewerApplication;
        eventBus.on("linkannotationsadded", function listener(e) {
          if (number === undefined || e.pageNumber === number) {
            resolve();
            eventBus.off("linkannotationsadded", listener);
          }
        });
      }),
    ],
    pageNumber
  );
}

function recordInitialLinkAnnotationsEvent(eventBus) {
  globalThis.initialLinkAnnotationsEventFired = false;
  eventBus.on(
    "linkannotationsadded",
    () => {
      globalThis.initialLinkAnnotationsEventFired = true;
    },
    { once: true }
  );
}
function waitForInitialLinkAnnotations(page) {
  return createPromise(page, resolve => {
    if (globalThis.initialLinkAnnotationsEventFired) {
      resolve();
      return;
    }
    window.PDFViewerApplication.eventBus.on("linkannotationsadded", resolve, {
      once: true,
    });
  });
}

describe("autolinker", function () {
  describe("bug1019475_2.pdf", function () {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "bug1019475_2.pdf",
        ".annotationLayer",
        null,
        null,
        {
          enableAutoLinking: true,
        }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must appropriately add link annotations when relevant", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForLinkAnnotations(page);
          const url = await page.$$eval(
            ".annotationLayer > .linkAnnotation > a",
            annotations => annotations.map(a => a.href)
          );
          expect(url.length).withContext(`In ${browserName}`).toEqual(1);
          expect(url[0])
            .withContext(`In ${browserName}`)
            .toEqual("http://www.mozilla.org/");
        })
      );
    });
  });

  describe("bug1019475_1.pdf", function () {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "bug1019475_1.pdf",
        ".annotationLayer",
        null,
        null,
        {
          enableAutoLinking: true,
        }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must not add links when unnecessary", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForLinkAnnotations(page);
          const linkIds = await page.$$eval(
            ".annotationLayer > .linkAnnotation > a",
            annotations =>
              annotations.map(a => a.getAttribute("data-element-id"))
          );
          expect(linkIds.length).withContext(`In ${browserName}`).toEqual(3);
          linkIds.forEach(id =>
            expect(id)
              .withContext(`In ${browserName}`)
              .not.toContain("inferred_link_")
          );
        })
      );
    });
  });

  describe("pr19449.pdf", function () {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("pr19449.pdf", ".annotationLayer", null, null, {
        docBaseUrl: "http://example.com",
        enableAutoLinking: true,
      });
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must not add links that overlap even if the URLs are different", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForLinkAnnotations(page);
          const linkIds = await page.$$eval(
            ".annotationLayer > .linkAnnotation > a",
            annotations =>
              annotations.map(a => a.getAttribute("data-element-id"))
          );
          expect(linkIds.length).withContext(`In ${browserName}`).toEqual(1);
          linkIds.forEach(id =>
            expect(id)
              .withContext(`In ${browserName}`)
              .not.toContain("inferred_link_")
          );
        })
      );
    });
  });

  describe("PR 19470", function () {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "bug1019475_2.pdf",
        ".annotationLayer",
        null,
        null,
        {
          enableAutoLinking: true,
        }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must not repeatedly add link annotations redundantly", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForLinkAnnotations(page);
          let url = await page.$$eval(
            ".annotationLayer > .linkAnnotation > a",
            annotations => annotations.map(a => a.href)
          );
          expect(url.length).withContext(`In ${browserName}`).toEqual(1);

          await page.evaluate(() =>
            window.PDFViewerApplication.pdfViewer.updateScale({
              drawingDelay: -1,
              scaleFactor: 2,
            })
          );
          await waitForLinkAnnotations(page);
          url = await page.$$eval(
            ".annotationLayer > .linkAnnotation > a",
            annotations => annotations.map(a => a.href)
          );
          expect(url.length).withContext(`In ${browserName}`).toEqual(1);
        })
      );
    });
  });

  describe("when highlighting search results", function () {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "issue3115r.pdf",
        ".annotationLayer",
        null,
        { eventBusSetup: recordInitialLinkAnnotationsEvent },
        { enableAutoLinking: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must find links that overlap with search results", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await awaitPromise(await waitForInitialLinkAnnotations(page));

          const linkAnnotationsPromise = await waitForLinkAnnotations(page, 36);

          // Search for "rich.edu"
          await page.click("#viewFindButton");
          await page.waitForSelector("#viewFindButton", { hidden: false });
          await page.type("#findInput", "rich.edu");
          await page.waitForSelector(".textLayer .highlight");

          await awaitPromise(linkAnnotationsPromise);

          const urls = await page.$$eval(
            ".page[data-page-number='36'] > .annotationLayer > .linkAnnotation > a",
            annotations => annotations.map(a => a.href)
          );

          expect(urls)
            .withContext(`In ${browserName}`)
            .toContain(jasmine.stringContaining("rich.edu"));
        })
      );
    });
  });
});
