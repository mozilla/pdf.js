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

  describe("issue21458.pdf", function () {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "issue21458.pdf",
        ".page[data-page-number='1'] .annotationLayer",
        null,
        null,
        { enableAutoLinking: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must not add links that overlap internal destinations", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await waitForLinkAnnotations(page);
          const linkIds = await page.$$eval(
            ".page[data-page-number='1'] .annotationLayer > .linkAnnotation > a",
            annotations =>
              annotations.map(a => a.getAttribute("data-element-id"))
          );
          expect(linkIds.length).withContext(`In ${browserName}`).toEqual(42);
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

  describe("many_inferred_links.pdf", function () {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "many_inferred_links.pdf",
        ".annotationLayer",
        null,
        {
          earlySetup: () => {
            window.rangeCount = 0;
            const NativeRange = window.Range;
            window.Range = class extends NativeRange {
              constructor() {
                super();
                window.rangeCount++;
              }
            };
            const { createRange } = Document.prototype;
            Document.prototype.createRange = function () {
              window.rangeCount++;
              return createRange.call(this);
            };
          },
          eventBusSetup: recordInitialLinkAnnotationsEvent,
        },
        { enableAutoLinking: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must use a single Range for all the links of a page", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await awaitPromise(await waitForInitialLinkAnnotations(page));

          const linksCount = await page.$$eval(
            ".annotationLayer > .linkAnnotation > a",
            annotations => annotations.length
          );
          expect(linksCount).withContext(`In ${browserName}`).toEqual(100);

          const rangeCount = await page.evaluate(() => window.rangeCount);
          expect(rangeCount).withContext(`In ${browserName}`).toEqual(1);
        })
      );
    });

    it("must put every link on its text", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await awaitPromise(await waitForInitialLinkAnnotations(page));

          const misplacedLinks = await page.evaluate(() => {
            const spans = [...document.querySelectorAll(".textLayer span")];
            const range = document.createRange();
            return [
              ...document.querySelectorAll(
                ".annotationLayer > .linkAnnotation"
              ),
            ].flatMap(link => {
              const text = link.querySelector("a").href.replace(/^mailto:/, "");
              const { firstChild } = spans.find(span =>
                span.textContent.includes(text)
              );
              const index = firstChild.textContent.indexOf(text);
              range.setStart(firstChild, index);
              range.setEnd(firstChild, index + text.length);
              const expected = range.getBoundingClientRect();
              const actual = link.getBoundingClientRect();
              return ["left", "top", "right", "bottom"].some(
                side => Math.abs(expected[side] - actual[side]) > 1
              )
                ? [text]
                : [];
            });
          });
          expect(misplacedLinks).withContext(`In ${browserName}`).toEqual([]);
        })
      );
    });
  });

  describe("multiline_inferred_links.pdf", function () {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "multiline_inferred_links.pdf",
        ".annotationLayer",
        null,
        { eventBusSetup: recordInitialLinkAnnotationsEvent },
        { enableAutoLinking: true }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must put a link spanning multiple text items on both lines", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await awaitPromise(await waitForInitialLinkAnnotations(page));

          const urls = await page.$$eval(
            ".annotationLayer > .linkAnnotation > a",
            anchors => anchors.map(anchor => anchor.href).sort()
          );
          expect(urls)
            .withContext(`In ${browserName}`)
            .toEqual([
              "https://example.com/long-path",
              "https://example.org/after",
              "https://example.org/before",
            ]);

          const urlsAtText = await page.evaluate(() => {
            const spans = [...document.querySelectorAll(".textLayer span")];
            const range = document.createRange();
            return ["https://example.com/long-", "path"].map(text => {
              const { firstChild } = spans.find(span =>
                span.textContent.startsWith(text)
              );
              range.setStart(firstChild, 0);
              range.setEnd(firstChild, text.length);
              const { left, top, width, height } =
                range.getBoundingClientRect();
              return document
                .elementFromPoint(left + width / 2, top + height / 2)
                ?.closest("a")?.href;
            });
          });
          expect(urlsAtText)
            .withContext(`In ${browserName}`)
            .toEqual([
              "https://example.com/long-path",
              "https://example.com/long-path",
            ]);
        })
      );
    });
  });
});
