/* Copyright 2024 Mozilla Foundation
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
  getSpanRectFromText,
  loadAndWait,
  scrollIntoView,
  waitForPageRendered,
} from "./test_utils.mjs";
import { PNG } from "pngjs";

describe("PDF viewer", () => {
  describe("Zoom origin", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".textLayer .endOfContent",
        "page-width",
        null,
        { page: 2 }
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    async function getTextAt(page, pageNumber, coordX, coordY) {
      await page.waitForFunction(
        pageNum =>
          !document.querySelector(
            `.page[data-page-number="${pageNum}"] > .textLayer`
          ).hidden,
        {},
        pageNumber
      );
      return page.evaluate(
        (x, y) => document.elementFromPoint(x, y)?.textContent,
        coordX,
        coordY
      );
    }

    it("supports specifiying a custom origin", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // We use this text span of page 2 because:
          // - it's in the visible area even when zooming at page-width
          // - it's small, so it easily catches if the page moves too much
          // - it's in a "random" position: not near the center of the
          //   viewport, and not near the borders
          const text = "guards";

          const rect = await getSpanRectFromText(page, 2, text);
          const originX = rect.x + rect.width / 2;
          const originY = rect.y + rect.height / 2;

          await page.evaluate(
            origin => {
              window.PDFViewerApplication.pdfViewer.increaseScale({
                scaleFactor: 2,
                origin,
              });
            },
            [originX, originY]
          );
          const textAfterZoomIn = await getTextAt(page, 2, originX, originY);
          expect(textAfterZoomIn)
            .withContext(`In ${browserName}, zoom in`)
            .toBe(text);

          await page.evaluate(
            origin => {
              window.PDFViewerApplication.pdfViewer.decreaseScale({
                scaleFactor: 0.8,
                origin,
              });
            },
            [originX, originY]
          );
          const textAfterZoomOut = await getTextAt(page, 2, originX, originY);
          expect(textAfterZoomOut)
            .withContext(`In ${browserName}, zoom out`)
            .toBe(text);
        })
      );
    });
  });

  describe("Zoom with the mouse wheel", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("empty.pdf", ".textLayer .endOfContent", 1000);
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that we can zoom with the mouse wheel and pressed control key", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.keyboard.down("Control");
          let zoom = 10;
          const zoomGetter = () =>
            page.evaluate(
              () => window.PDFViewerApplication.pdfViewer.currentScale
            );
          while (zoom > 0.1) {
            await page.mouse.wheel({ deltaY: 100 });
            zoom = await zoomGetter();
          }
          while (zoom < 10) {
            await page.mouse.wheel({ deltaY: -100 });
            zoom = await zoomGetter();
          }
          await page.keyboard.up("Control");
        })
      );
    });
  });

  describe("Zoom commands", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait("tracemonkey.pdf", ".textLayer .endOfContent");
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that zoom commands don't scroll the document", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          for (let i = 0; i < 10; i++) {
            await page.evaluate(() => window.PDFViewerApplication.zoomIn());
            await page.evaluate(() => window.PDFViewerApplication.zoomReset());
            await page.waitForSelector(
              `.page[data-page-number="1"] .textLayer .endOfContent`
            );
            const scrollTop = await page.evaluate(
              () => document.getElementById("viewerContainer").scrollTop
            );
            expect(scrollTop < 100)
              .withContext(`In ${browserName}`)
              .toBe(true);
          }
        })
      );
    });
  });

  describe("CSS-only zoom", () => {
    function createPromiseForFirstPageRendered(page) {
      return createPromise(page, (resolve, reject) => {
        const controller = new AbortController();
        window.PDFViewerApplication.eventBus.on(
          "pagerendered",
          ({ pageNumber, timestamp }) => {
            if (pageNumber === 1) {
              resolve(timestamp);
              controller.abort();
            }
          },
          { signal: controller.signal }
        );
        setTimeout(reject, 1000, new Error("Timeout"));
      });
    }

    describe("forced (maxCanvasPixels: 0)", () => {
      let pages;

      beforeAll(async () => {
        pages = await loadAndWait(
          "tracemonkey.pdf",
          ".textLayer .endOfContent",
          null,
          null,
          { maxCanvasPixels: 0 }
        );
      });

      afterAll(async () => {
        await closePages(pages);
      });

      it("respects drawing delay when zooming out", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            const promise = await createPromiseForFirstPageRendered(page);

            const start = await page.evaluate(() => {
              const startTime = performance.now();
              window.PDFViewerApplication.pdfViewer.decreaseScale({
                drawingDelay: 100,
                scaleFactor: 0.9,
              });
              return startTime;
            });

            const end = await awaitPromise(promise);

            expect(end - start)
              .withContext(`In ${browserName}`)
              .toBeGreaterThanOrEqual(100);
          })
        );
      });

      it("respects drawing delay when zooming in", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            const promise = await createPromiseForFirstPageRendered(page);

            const start = await page.evaluate(() => {
              const startTime = performance.now();
              window.PDFViewerApplication.pdfViewer.increaseScale({
                drawingDelay: 100,
                scaleFactor: 1.1,
              });
              return startTime;
            });

            const end = await awaitPromise(promise);

            expect(end - start)
              .withContext(`In ${browserName}`)
              .toBeGreaterThanOrEqual(100);
          })
        );
      });
    });

    describe("triggers when going bigger than maxCanvasPixels", () => {
      let pages;

      const MAX_CANVAS_PIXELS = new Map();

      beforeAll(async () => {
        pages = await loadAndWait(
          "tracemonkey.pdf",
          ".textLayer .endOfContent",
          null,
          null,
          async (page, browserName) => {
            const ratio = await page.evaluate(() => window.devicePixelRatio);
            const maxCanvasPixels = 1_000_000 * ratio ** 2;
            MAX_CANVAS_PIXELS.set(browserName, maxCanvasPixels);

            return { maxCanvasPixels };
          }
        );
      });

      beforeEach(async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            const handle = await waitForPageRendered(page);
            if (
              await page.evaluate(() => {
                if (
                  window.PDFViewerApplication.pdfViewer.currentScale !== 0.5
                ) {
                  window.PDFViewerApplication.pdfViewer.currentScale = 0.5;
                  return true;
                }
                return false;
              })
            ) {
              await awaitPromise(handle);
            }
          })
        );
      });

      afterAll(async () => {
        await closePages(pages);
      });

      function getCanvasSize(page) {
        return page.evaluate(() => {
          const canvas = window.document.querySelector(".canvasWrapper canvas");
          return canvas.width * canvas.height;
        });
      }

      // MAX_CANVAS_PIXELS must be big enough that the originally rendered
      // canvas still has enough space to grow before triggering CSS-only zoom
      it("test correctly configured", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            const canvasSize = await getCanvasSize(page);

            expect(canvasSize)
              .withContext(`In ${browserName}`)
              .toBeLessThan(MAX_CANVAS_PIXELS.get(browserName) / 4);
            expect(canvasSize)
              .withContext(`In ${browserName}`)
              .toBeGreaterThan(MAX_CANVAS_PIXELS.get(browserName) / 16);
          })
        );
      });

      it("does not trigger CSS-only zoom below maxCanvasPixels", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            const originalCanvasSize = await getCanvasSize(page);
            const factor = 2;

            const handle = await waitForPageRendered(page);
            await page.evaluate(scaleFactor => {
              window.PDFViewerApplication.pdfViewer.increaseScale({
                drawingDelay: 0,
                scaleFactor,
              });
            }, factor);
            await awaitPromise(handle);

            const canvasSize = await getCanvasSize(page);

            expect(canvasSize)
              .withContext(`In ${browserName}`)
              .toBe(originalCanvasSize * factor ** 2);

            expect(canvasSize)
              .withContext(`In ${browserName}, MAX_CANVAS_PIXELS`)
              .toBeLessThan(MAX_CANVAS_PIXELS.get(browserName));
          })
        );
      });

      it("triggers CSS-only zoom above maxCanvasPixels", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            const originalCanvasSize = await getCanvasSize(page);
            const factor = 4;

            const handle = await waitForPageRendered(page);
            await page.evaluate(scaleFactor => {
              window.PDFViewerApplication.pdfViewer.increaseScale({
                drawingDelay: 0,
                scaleFactor,
              });
            }, factor);
            await awaitPromise(handle);

            const canvasSize = await getCanvasSize(page);

            expect(canvasSize)
              .withContext(`In ${browserName}`)
              .toBeLessThan(originalCanvasSize * factor ** 2);

            expect(canvasSize)
              .withContext(`In ${browserName}, <= MAX_CANVAS_PIXELS`)
              .toBeLessThanOrEqual(MAX_CANVAS_PIXELS.get(browserName));

            expect(canvasSize)
              .withContext(`In ${browserName}, > MAX_CANVAS_PIXELS * 0.99`)
              .toBeGreaterThan(MAX_CANVAS_PIXELS.get(browserName) * 0.99);
          })
        );
      });
    });
  });

  describe("Canvas fits the page", () => {
    let pages;

    beforeAll(async () => {
      pages = await loadAndWait(
        "issue18694.pdf",
        ".textLayer .endOfContent",
        "page-width"
      );
    });

    afterAll(async () => {
      await closePages(pages);
    });

    it("must check that canvas perfectly fits the page whatever the zoom level is", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const debug = false;

          // The pdf has a single page with a red background.
          // We set the viewer background to red, because when screenshoting
          // some part of the viewer background can be visible.
          // But here we don't care about the viewer background: we only
          // care about the page background and the canvas default color.

          await page.evaluate(() => {
            document.body.style.background = "#ff0000";
            const toolbar = document.querySelector(".toolbar");
            toolbar.style.display = "none";
          });
          await page.waitForSelector(".toolbar", { visible: false });
          await page.evaluate(() => {
            const p = document.querySelector(`.page[data-page-number="1"]`);
            p.style.border = "none";
          });

          for (let i = 0; ; i++) {
            const handle = await waitForPageRendered(page);
            await page.evaluate(() => window.PDFViewerApplication.zoomOut());
            await awaitPromise(handle);
            await scrollIntoView(page, `.page[data-page-number="1"]`);

            const element = await page.$(`.page[data-page-number="1"]`);
            const png = await element.screenshot({
              type: "png",
              path: debug ? `foo${i}.png` : "",
            });
            const pageImage = PNG.sync.read(Buffer.from(png));
            let buffer = new Uint32Array(pageImage.data.buffer);

            // Search for the first red pixel.
            const j = buffer.indexOf(0xff0000ff);
            buffer = buffer.slice(j);

            expect(buffer.every(x => x === 0xff0000ff))
              .withContext(`In ${browserName}, in the ${i}th zoom in`)
              .toBe(true);

            const currentScale = await page.evaluate(
              () => window.PDFViewerApplication.pdfViewer.currentScale
            );
            if (currentScale <= 0.1) {
              break;
            }
          }
        })
      );
    });
  });
});
