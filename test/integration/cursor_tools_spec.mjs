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
  closePages,
  getRect,
  loadAndWait,
  showViewsManager,
  waitForSelectionChange,
} from "./test_utils.mjs";

async function enableSelectTool(page) {
  await page.click("#secondaryToolbarToggleButton");
  await page.waitForSelector("#secondaryToolbar", { hidden: false });

  await page.click("#cursorSelectTool");
  await page.waitForFunction(
    "window.PDFViewerApplication.pdfCursorTools.activeTool === 0"
  );
}

async function enableHandTool(page) {
  await page.click("#secondaryToolbarToggleButton");
  await page.waitForSelector("#secondaryToolbar", { hidden: false });

  await page.click("#cursorHandTool");
  await page.waitForFunction(
    "window.PDFViewerApplication.pdfCursorTools.activeTool === 1"
  );
}

describe("Cursor tools", () => {
  describe("Text selection", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".textLayer .endOfContent",
        100
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("check that text selection works", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await enableSelectTool(page);

          const spanRect = await getRect(
            page,
            `.page[data-page-number="1"] > .textLayer > span`
          );
          const x = spanRect.x + 1,
            y = spanRect.y + spanRect.height / 2;

          await page.mouse.click(x, y, { count: 3 });
          await waitForSelectionChange(
            page,
            "Trace-based Just-in-Time Type Specialization for Dynamic"
          );

          // Remove the selection.
          await page.mouse.click(x, y);
          await waitForSelectionChange(page, "");
        })
      );
    });
  });

  describe("Hand tool", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".textLayer .endOfContent",
        100
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("check that hand tool scrolling works", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await enableHandTool(page);

          const viewerRect = await getRect(page, "#viewerContainer");
          const x = Math.floor(viewerRect.x + viewerRect.width / 2),
            startY = Math.floor(viewerRect.y + (3 * viewerRect.height) / 4),
            endY = Math.floor(viewerRect.y + viewerRect.height / 4),
            steps = 10;
          const initialScrollTop = await page.evaluate(
            () => document.getElementById("viewerContainer").scrollTop
          );

          await page.mouse.move(x, startY);
          await page.mouse.down();
          // Puppeteer's `steps` option generates fractional intermediate
          // positions, which Firefox doesn't support.
          for (let i = 1; i <= steps; i++) {
            await page.mouse.move(
              x,
              Math.round(startY + ((endY - startY) * i) / steps)
            );
          }
          await page.mouse.up();

          const scrollTop = await page.evaluate(
            () => document.getElementById("viewerContainer").scrollTop
          );
          const scrollDelta = scrollTop - initialScrollTop,
            expectedScrollDelta = startY - endY;
          expect(Math.abs(scrollDelta - expectedScrollDelta))
            .withContext(
              `Expected a scroll delta of ${expectedScrollDelta}, got ${scrollDelta}, in ${browserName}`
            )
            .toBeLessThan(1);

          // Finally, disable the hand tool.
          await enableSelectTool(page);
        })
      );
    });
  });
});

describe("Marquee zoom", () => {
  let pages;

  beforeEach(async () => {
    pages = await loadAndWait(
      "tracemonkey.pdf",
      ".textLayer .endOfContent",
      100
    );
  });

  afterEach(async () => {
    await closePages(pages);
  });

  it("returns to text selection on Escape before drawing", async () => {
    await Promise.all(
      pages.map(async ([browserName, page]) => {
        await page.click("#secondaryToolbarToggleButton");
        await page.click("#cursorZoomTool");
        const active = await page.evaluate(() => ({
          tool: window.PDFViewerApplication.pdfCursorTools.activeTool,
          focused:
            document.activeElement ===
            document.getElementById("viewerContainer"),
        }));
        expect(active.tool).withContext(browserName).toBe(2);
        expect(active.focused).withContext(browserName).toBeTrue();
        await page.keyboard.press("Escape");
        const result = await page.evaluate(() => ({
          tool: window.PDFViewerApplication.pdfCursorTools.activeTool,
          cursor: document
            .getElementById("viewerContainer")
            .classList.contains("zoomToRect"),
          checked: document
            .getElementById("cursorZoomTool")
            .getAttribute("aria-checked"),
        }));
        expect(result.tool).withContext(browserName).toBe(0);
        expect(result.cursor).toBeFalse();
        expect(result.checked).toBe("false");
      })
    );
  });

  async function startDrag(page, reverse = false) {
    await page.click("#secondaryToolbarToggleButton");
    await page.click("#cursorZoomTool");
    const selection = await page.evaluate(() => {
      const { pdfViewer } = window.PDFViewerApplication;
      const bounds = pdfViewer.container.getBoundingClientRect();
      const pageNumber = pdfViewer.currentPageNumber;
      const pageView = pdfViewer.getPageView(pageNumber - 1);
      const pageBounds = pageView.div.getBoundingClientRect();
      const x = Math.max(bounds.left, pageBounds.left) + 100;
      const y = Math.max(bounds.top, pageBounds.top) + 150;
      return {
        x,
        y,
        pageNumber,
        width: 120,
        height: 100,
        scale: pdfViewer.currentScale,
        point: pageView.viewport.convertToPdfPoint(
          x + 60 - pageBounds.left - pageView.div.clientLeft,
          y + 50 - pageBounds.top - pageView.div.clientTop
        ),
        factor: Math.min(
          pdfViewer.container.clientWidth / 120,
          pdfViewer.container.clientHeight / 100
        ),
      };
    });
    await page.mouse.move(
      selection.x + (reverse ? selection.width : 0),
      selection.y + (reverse ? selection.height : 0)
    );
    await page.mouse.down();
    await page.mouse.move(
      selection.x + (reverse ? 0 : selection.width),
      selection.y + (reverse ? 0 : selection.height),
      { steps: 5 }
    );
    return selection;
  }

  for (const [rotation, reverse] of [
    [0, false],
    [0, true],
    [90, false],
    [180, true],
    [270, false],
  ]) {
    it(`zooms and centers the selected document area (${rotation} degrees, ${reverse ? "reverse" : "forward"} drag)`, async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.evaluate(angle => {
            window.PDFViewerApplication.pdfViewer.pagesRotation = angle;
          }, rotation);
          const selection = await startDrag(page, reverse);
          await page.mouse.up();
          const result = await page.evaluate(point => {
            const { pdfViewer, pdfCursorTools } = window.PDFViewerApplication;
            const view = pdfViewer.getPageView(0);
            const bounds = view.div.getBoundingClientRect();
            const container = pdfViewer.container;
            const cb = container.getBoundingClientRect();
            const [x, y] = view.viewport.convertToViewportPoint(...point);
            return {
              scale: pdfViewer.currentScale,
              dx:
                bounds.left +
                view.div.clientLeft +
                x -
                (cb.left + container.clientLeft + container.clientWidth / 2),
              dy:
                bounds.top +
                view.div.clientTop +
                y -
                (cb.top + container.clientTop + container.clientHeight / 2),
              tool: pdfCursorTools.activeTool,
              overlay: !!document.querySelector(".zoomToRectSelection"),
            };
          }, selection.point);
          expect(result.scale)
            .withContext(browserName)
            .toBeCloseTo(
              Math.min(
                25,
                Math.round(selection.scale * selection.factor * 100) / 100
              ),
              2
            );
          expect(Math.abs(result.dx)).withContext(browserName).toBeLessThan(3);
          expect(Math.abs(result.dy)).withContext(browserName).toBeLessThan(3);
          expect(result.tool).toBe(0);
          expect(result.overlay).toBeFalse();
        })
      );
    });
  }

  for (const action of [
    "escape",
    "blur",
    "cancel",
    "scroll",
    "resize",
    "switch",
    "editor",
    "presentation",
  ]) {
    it(`cancels an unfinished selection on ${action}`, async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const selection = await startDrag(page);
          if (action === "escape") {
            await page.keyboard.press("Escape");
          } else {
            await page.evaluate(name => {
              const app = window.PDFViewerApplication;
              switch (name) {
                case "blur":
                  window.dispatchEvent(new Event("blur"));
                  break;
                case "cancel":
                  window.dispatchEvent(new PointerEvent("pointercancel"));
                  break;
                case "resize":
                  window.dispatchEvent(new Event("resize"));
                  break;
                case "editor":
                  app.eventBus.dispatch("annotationeditormodechanged", {
                    mode: 3,
                  });
                  break;
                case "presentation":
                  app.eventBus.dispatch("presentationmodechanged", {
                    state: 3,
                  });
                  break;
                case "scroll":
                  app.pdfViewer.container.dispatchEvent(new Event("scroll"));
                  break;
                case "switch":
                  app.pdfCursorTools.switchTool(1);
                  break;
              }
            }, action);
          }
          await page.mouse.up();
          const result = await page.evaluate(() => ({
            scale: window.PDFViewerApplication.pdfViewer.currentScale,
            overlay: !!document.querySelector(".zoomToRectSelection"),
          }));
          expect(result.scale).withContext(browserName).toBe(selection.scale);
          expect(result.overlay).toBeFalse();
          if (action === "escape") {
            const tool = await page.evaluate(
              () => window.PDFViewerApplication.pdfCursorTools.activeTool
            );
            expect(tool).withContext(browserName).toBe(0);
          }
        })
      );
    });
  }

  it("ignores clicks and small drags", async () => {
    await Promise.all(
      pages.map(async ([browserName, page]) => {
        const selection = await startDrag(page);
        await page.mouse.move(selection.x + 2, selection.y + 2);
        await page.mouse.up();
        const scale = await page.evaluate(
          () => window.PDFViewerApplication.pdfViewer.currentScale
        );
        expect(scale).withContext(browserName).toBe(selection.scale);
      })
    );
  });
  it("clamps small selections to the maximum zoom", async () => {
    await Promise.all(
      pages.map(async ([browserName, page]) => {
        const selection = await startDrag(page);
        await page.mouse.move(selection.x + 6, selection.y + 6);
        await page.mouse.up();
        const scale = await page.evaluate(
          () => window.PDFViewerApplication.pdfViewer.currentScale
        );
        expect(scale).withContext(browserName).toBe(25);
      })
    );
  });
  for (const preset of ["1", "1.5", "auto", "page-width"]) {
    it(`restores the original scale and position (${preset})`, async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const original = await page.evaluate(value => {
            const { pdfViewer } = window.PDFViewerApplication;
            pdfViewer.currentScaleValue = value;
            pdfViewer.container.scrollTop = 100;
            return {
              scale: pdfViewer.currentScale,
              value: pdfViewer.currentScaleValue,
              left: pdfViewer.container.scrollLeft,
              top: pdfViewer.container.scrollTop,
              hidden: document.getElementById("zoomRestoreButton").hidden,
            };
          }, preset);
          expect(original.hidden).toBeTrue();
          await startDrag(page);
          await page.mouse.up();
          await page.waitForSelector("#zoomRestoreButton", { visible: true });
          await page.click("#zoomRestoreButton");
          const restored = await page.evaluate(() => {
            const { pdfViewer } = window.PDFViewerApplication;
            return {
              scale: pdfViewer.currentScale,
              value: pdfViewer.currentScaleValue,
              left: pdfViewer.container.scrollLeft,
              top: pdfViewer.container.scrollTop,
              hidden: document.getElementById("zoomRestoreButton").hidden,
              focused: document.activeElement === pdfViewer.container,
            };
          });
          expect(restored.scale)
            .withContext(browserName)
            .toBeCloseTo(original.scale, 10);
          expect(Number(restored.value)).toBeCloseTo(original.scale, 10);
          expect(restored.left).toBeCloseTo(original.left, 0);
          expect(restored.top).toBeCloseTo(original.top, 0);
          expect(restored.hidden).toBeTrue();
          expect(restored.focused).toBeTrue();
        })
      );
    });
  }

  it("restores the preceding zoom after successive marquee selections", async () => {
    await Promise.all(
      pages.map(async ([browserName, page]) => {
        await startDrag(page);
        await page.mouse.up();
        const original = await page.evaluate(
          () => window.PDFViewerApplication.pdfViewer.currentScale
        );
        await startDrag(page);
        await page.mouse.up();
        await page.click("#zoomRestoreButton");
        const scale = await page.evaluate(
          () => window.PDFViewerApplication.pdfViewer.currentScale
        );
        expect(scale).withContext(browserName).toBe(original);
      })
    );
  });

  it("clears the restore button when the document is closed", async () => {
    await Promise.all(
      pages.map(async ([, page]) => {
        await startDrag(page);
        await page.mouse.up();
        await page.evaluate(() => window.PDFViewerApplication.close());
        const hidden = await page.evaluate(
          () => document.getElementById("zoomRestoreButton").hidden
        );
        expect(hidden).toBeTrue();
      })
    );
  });
  it("does not activate document links while the zoom tool is active", async () => {
    await Promise.all(
      pages.map(async ([browserName, page]) => {
        await page.click("#secondaryToolbarToggleButton");
        await page.click("#cursorZoomTool");
        const allowed = await page.evaluate(() => {
          const link = document.createElement("a");
          link.href = "#unexpected-navigation";
          document.querySelector(".page").append(link);
          const dispatched = link.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true })
          );
          link.remove();
          return dispatched;
        });
        expect(allowed).withContext(browserName).toBeFalse();
      })
    );
  });

  it("cancels an unfinished selection when the document is closed", async () => {
    await Promise.all(
      pages.map(async ([browserName, page]) => {
        await startDrag(page);
        await page.evaluate(() => window.PDFViewerApplication.close());
        const result = await page.evaluate(() => ({
          overlay: !!document.querySelector(".zoomToRectSelection"),
          tool: window.PDFViewerApplication.pdfCursorTools.activeTool,
        }));
        expect(result.overlay).withContext(browserName).toBeFalse();
        expect(result.tool).toBe(0);
        await page.mouse.up();
      })
    );
  });
  it("zooms the selected page after navigation with the sidebar open", async () => {
    await Promise.all(
      pages.map(async ([browserName, page]) => {
        await page.setViewport({ width: 1280, height: 800 });
        await showViewsManager(page);
        await page.evaluate(() => {
          window.PDFViewerApplication.pdfViewer.currentPageNumber = 2;
        });
        await page.waitForSelector(
          '.page[data-page-number="2"] .textLayer .endOfContent'
        );
        const selection = await startDrag(page);
        await page.mouse.up();
        const result = await page.evaluate(({ point, pageNumber }) => {
          const { pdfViewer } = window.PDFViewerApplication;
          const view = pdfViewer.getPageView(pageNumber - 1);
          const bounds = view.div.getBoundingClientRect();
          const container = pdfViewer.container;
          const cb = container.getBoundingClientRect();
          const [x, y] = view.viewport.convertToViewportPoint(...point);
          return {
            page: pdfViewer.currentPageNumber,
            dx:
              bounds.left +
              view.div.clientLeft +
              x -
              (cb.left + container.clientLeft + container.clientWidth / 2),
            dy:
              bounds.top +
              view.div.clientTop +
              y -
              (cb.top + container.clientTop + container.clientHeight / 2),
          };
        }, selection);
        expect(result.page).withContext(browserName).toBe(2);
        expect(Math.abs(result.dx)).withContext(browserName).toBeLessThan(3);
        expect(Math.abs(result.dy)).withContext(browserName).toBeLessThan(3);
      })
    );
  });
  it("suppresses the click following a completed zoom over a link", async () => {
    await Promise.all(
      pages.map(async ([browserName, page]) => {
        await page.click("#secondaryToolbarToggleButton");
        await page.click("#cursorZoomTool");
        await page.evaluate(() => {
          const link = document.createElement("a");
          link.id = "zoomTestLink";
          link.href = "#unexpected-navigation";
          Object.assign(link.style, {
            position: "fixed",
            left: "300px",
            top: "200px",
            width: "120px",
            height: "120px",
            zIndex: "10",
          });
          link.addEventListener("click", evt => {
            link.dataset.activated = "true";
            evt.preventDefault();
          });
          document.querySelector(".page").append(link);
        });
        await page.mouse.move(320, 220);
        await page.mouse.down();
        await page.mouse.move(370, 270, { steps: 5 });
        await page.mouse.up();
        const result = await page.evaluate(() => ({
          activated: document.getElementById("zoomTestLink").dataset.activated,
          scale: window.PDFViewerApplication.pdfViewer.currentScale,
        }));
        expect(result.scale).withContext(browserName).toBeGreaterThan(1);
        expect(result.activated).withContext(browserName).toBeUndefined();
        await page.click("#zoomRestoreButton");
        const scale = await page.evaluate(
          () => window.PDFViewerApplication.pdfViewer.currentScale
        );
        expect(scale).toBe(1);
      })
    );
  });
});
