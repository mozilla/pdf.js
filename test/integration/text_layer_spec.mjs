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

/**
 * @import { Page } from "puppeteer"
 */

import {
  closePages,
  closeSinglePage,
  getSpanRectFromText,
  kbSelectAll,
  loadAndWait,
  waitForEvent,
} from "./test_utils.mjs";
import { MathClamp } from "../../src/shared/math_clamp.js";
import { startBrowser } from "../test.mjs";

/**
 * @typedef Point
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef Rect
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef SpanInfo
 * @property {Rect} rect
 * @property {string} text
 */

describe("Text layer", () => {
  describe("Text layout", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey.pdf",
        ".textLayer .endOfContent",
        100,
        {
          postPageSetup: async page => {
            await page.evaluate(() => {
              const style = document.createElement("style");
              style.textContent = `
                body,
                #mainContainer {
                  letter-spacing: 5px;
                  word-spacing: 5px;
                }
              `;
              document.documentElement.append(style);
            });
          },
        }
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must ignore inherited text spacing styles", async () => {
      await Promise.all(
        pages.map(async ([_, page]) => {
          const spacing = await page.evaluate(() => {
            const textLayer = document.querySelector(".textLayer");
            const span = textLayer.querySelector("span");
            const textLayerStyle = getComputedStyle(textLayer);
            const spanStyle = getComputedStyle(span);
            return {
              textLayerLetterSpacing: textLayerStyle.letterSpacing,
              textLayerWordSpacing: textLayerStyle.wordSpacing,
              spanLetterSpacing: spanStyle.letterSpacing,
              spanWordSpacing: spanStyle.wordSpacing,
            };
          });

          expect(spacing.textLayerLetterSpacing).toEqual("normal");
          expect(spacing.spanLetterSpacing).toEqual("normal");
          expect(["0px", "normal"]).toContain(spacing.textLayerWordSpacing);
          expect(["0px", "normal"]).toContain(spacing.spanWordSpacing);
        })
      );
    });
  });

  describe("Text selection", () => {
    // page.mouse.move(x, y, { steps: ... }) doesn't work in Firefox, because
    // puppeteer will send fractional intermediate positions and Firefox doesn't
    // support them. Use this function to round each intermediate position to an
    // integer.
    async function moveInSteps(page, from, to, steps) {
      const deltaX = to.x - from.x;
      const deltaY = to.y - from.y;
      for (let i = 0; i <= steps; i++) {
        const x = Math.round(from.x + (deltaX * i) / steps);
        const y = Math.round(from.y + (deltaY * i) / steps);
        await page.mouse.move(x, y);
      }
    }

    function middlePosition(rect) {
      return {
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
      };
    }

    function middleLeftPosition(rect) {
      return {
        x: Math.round(rect.x + 1),
        y: Math.round(rect.y + rect.height / 2),
      };
    }

    function belowEndPosition(rect) {
      return {
        x: Math.round(rect.x + rect.width),
        y: Math.round(rect.y + rect.height * 1.5),
      };
    }

    /**
     * Pick a point outside the page while remaining inside the viewer.
     *
     * @param {Rect} page
     *   Page rectangle.
     * @param {Rect} viewer
     *   Viewer rectangle.
     * @param {number} preferredY
     *   Preferred Y coordinate for the pointer target, to avoid unnecessarily
     *   moving the pointer too far.
     * @returns {Point}
     *   Point outside the page bounds but inside the viewer.
     */
    function getOutsidePagePosition(page, viewer, preferredY) {
      // The pointer target must remain inside the visible viewer area;
      // otherwise Firefox can fail with an out-of-bounds move.
      const minX = Math.ceil(viewer.x) + 5;
      const maxX = Math.floor(viewer.x + viewer.width) - 5;
      const minY = Math.ceil(viewer.y) + 5;
      const maxY = Math.floor(viewer.y + viewer.height) - 5;
      const y = MathClamp(minY, Math.round(preferredY), maxY);

      const candidates = [
        { x: Math.round(page.x + page.width + 20), y },
        // Prefer below over left: going left retraces through existing text
        // and shrinks the selection before exiting the page boundary.
        {
          x: Math.round(page.x + page.width / 2),
          y: Math.round(page.y + page.height + 20),
        },
        { x: Math.round(page.x - 20), y },
        {
          x: Math.round(page.x + page.width / 2),
          y: Math.round(page.y - 20),
        },
      ];

      for (const candidate of candidates) {
        if (
          candidate.x >= minX &&
          candidate.x <= maxX &&
          candidate.y >= minY &&
          candidate.y <= maxY
        ) {
          return candidate;
        }
      }

      // Fallback: still return a safe in-view point if preferred directions
      // are clipped by the viewport at this scroll position.
      return { x: maxX, y };
    }

    /**
     * Get current selection.
     *
     * @param {Page} page
     * @returns {Promise<string>}
     */
    async function getSelectionText(page) {
      return page.evaluate(
        () => window.getSelection()?.toString().replaceAll("\r\n", "\n") || ""
      );
    }

    /**
     * Check if the draw layer contains a non-empty selection.
     *
     * @param {Page} page
     * @returns {Promise<boolean>}
     */
    async function hasDrawnSelection(page) {
      return page.evaluate(() => {
        // If there is no selection, the `div.selection` is removed.
        for (const path of document.querySelectorAll(
          ".canvasWrapper .selection svg path"
        )) {
          if (path.getAttribute("d")?.trim()) {
            return true;
          }
        }
        return false;
      });
    }

    /**
     * Get the first non-empty text span on a page.
     *
     * @param {Page} page
     * @param {number} pageNumber
     * @returns {Promise<SpanInfo | null>}
     */
    async function getFirstSpanInfo(page, pageNumber) {
      await page.waitForSelector(
        `.page[data-page-number="${pageNumber}"] > .textLayer .endOfContent`
      );
      return page.evaluate(number => {
        for (const el of document.querySelectorAll(
          `.page[data-page-number="${number}"] > .textLayer span:not(:has(> span))`
        )) {
          const text = el.textContent?.trim();
          if (!text) {
            continue;
          }
          const { x, y, width, height } = el.getBoundingClientRect();
          return { rect: { x, y, width, height }, text };
        }
        return null;
      }, pageNumber);
    }

    /**
     * Get the last non-empty text span on a page.
     *
     * @param {Page} page
     * @param {number} pageNumber
     * @returns {Promise<SpanInfo | null>}
     */
    async function getLastSpanInfo(page, pageNumber) {
      await page.waitForSelector(
        `.page[data-page-number="${pageNumber}"] > .textLayer .endOfContent`
      );
      return page.evaluate(number => {
        let last = null;
        for (const el of document.querySelectorAll(
          `.page[data-page-number="${number}"] > .textLayer span:not(:has(> span))`
        )) {
          const text = el.textContent?.trim();
          if (!text) {
            continue;
          }
          const { x, y, width, height } = el.getBoundingClientRect();
          last = { rect: { x, y, width, height }, text };
        }
        return last;
      }, pageNumber);
    }

    beforeEach(() => {
      jasmine.addAsyncMatchers({
        // Check that a page has a selection containing the given text, with
        // some tolerance for extra characters before/after.
        toHaveRoughlySelected({ pp }) {
          return {
            async compare(page, expected) {
              const TOLERANCE = 10;
              const actual = await getSelectionText(page);

              let start, end;
              if (expected instanceof RegExp) {
                const match = expected.exec(actual);
                start = -1;
                if (match) {
                  start = match.index;
                  end = start + match[0].length;
                }
              } else {
                start = actual.indexOf(expected);
                if (start !== -1) {
                  end = start + expected.length;
                }
              }

              const pass =
                start !== -1 &&
                start < TOLERANCE &&
                end > actual.length - TOLERANCE;

              return {
                pass,
                message: `Expected ${pp(
                  actual.length > 200
                    ? actual.slice(0, 100) + "[...]" + actual.slice(-100)
                    : actual
                )} to ${pass ? "not " : ""}roughly match ${pp(expected)}.`,
              };
            },
          };
        },
      });
    });

    describe("using mouse", () => {
      describe("selection is preserved when dragging outside page bounds", () => {
        /** @type {Array<[string, Page]>} */
        let pages;

        beforeEach(async () => {
          pages = await loadAndWait(
            "tracemonkey.pdf",
            `.page[data-page-number = "1"] .endOfContent`,
            undefined,
            undefined,
            (_page, browserName) => ({
              imagesRightClickMinSize: browserName === "firefox" ? 16 : -1,
            })
          );
        });

        afterEach(async () => {
          await closePages(pages);
        });

        it("keeps selection when dragging to another page and then outside", async () => {
          await Promise.all(
            pages.map(async ([browserName, page]) => {
              const scrollTarget = await getSpanRectFromText(
                page,
                1,
                "Unlike method-based dynamic compilers, our dynamic com-"
              );
              await page.evaluate(top => {
                document.getElementById("viewerContainer").scrollTop = top;
              }, scrollTarget.y - 50);

              const [
                positionStartPage1,
                positionStartPage2,
                positionEndPage2,
                page2Rect,
                viewerRect,
              ] = await Promise.all([
                getSpanRectFromText(
                  page,
                  1,
                  "Each compiled trace covers one path through the program with"
                ).then(middlePosition),
                getSpanRectFromText(
                  page,
                  2,
                  "Hence, recording and compiling a trace"
                ).then(middlePosition),
                getSpanRectFromText(
                  page,
                  2,
                  "cache. Alternatively, the VM could simply stop tracing, and give up"
                ).then(belowEndPosition),
                page.$eval('.page[data-page-number="2"]', div => {
                  const { x, y, width, height } = div.getBoundingClientRect();
                  return { x, y, width, height };
                }),
                page.$eval("#viewerContainer", div => {
                  const { x, y, width, height } = div.getBoundingClientRect();
                  return { x, y, width, height };
                }),
              ]);

              const outsidePage2 = getOutsidePagePosition(
                page2Rect,
                viewerRect,
                positionEndPage2.y
              );

              await page.mouse.move(positionStartPage1.x, positionStartPage1.y);
              await page.mouse.down();
              // First cross into page 2 while still in-bounds so we can verify
              // the multi-page selection is established before exiting page 2.
              await moveInSteps(
                page,
                positionStartPage1,
                positionStartPage2,
                20
              );

              const selectionBeforeOutside = await getSelectionText(page);
              expect(selectionBeforeOutside)
                .withContext(`In ${browserName}, before leaving page 2`)
                .toMatch(/path through.*Hence, recording/s);

              await moveInSteps(page, positionStartPage2, positionEndPage2, 20);
              const selectionInsidePage2 = await getSelectionText(page);
              expect(selectionInsidePage2)
                .withContext(`In ${browserName}, while still on page 2`)
                .toMatch(/path through.*Hence, recording and .* tracing/s);

              await moveInSteps(page, positionEndPage2, outsidePage2, 20);

              await page.mouse.up();

              expect(await hasDrawnSelection(page))
                .withContext(
                  `In ${browserName}, selection drawn while outside page`
                )
                .toBeTrue();

              const selectedText = await getSelectionText(page);
              expect(selectedText.length)
                .withContext(
                  `In ${browserName}, selection not lost after mouseup`
                )
                .toBeGreaterThan(10);
            })
          );
        });

        it("keeps selection when dragging outside the current page", async () => {
          await Promise.all(
            pages.map(async ([browserName, page]) => {
              const [positionStart, page1Rect, viewerRect] = await Promise.all([
                getSpanRectFromText(
                  page,
                  1,
                  "(frequently executed) bytecode sequences, records"
                ).then(middlePosition),
                page.$eval('.page[data-page-number="1"]', div => {
                  const { x, y, width, height } = div.getBoundingClientRect();
                  return { x, y, width, height };
                }),
                page.$eval("#viewerContainer", div => {
                  const { x, y, width, height } = div.getBoundingClientRect();
                  return { x, y, width, height };
                }),
              ]);

              const outsidePage1 = getOutsidePagePosition(
                page1Rect,
                viewerRect,
                positionStart.y
              );

              await page.mouse.move(positionStart.x, positionStart.y);
              await page.mouse.down();
              await moveInSteps(page, positionStart, outsidePage1, 20);

              await page.mouse.up();

              expect(await hasDrawnSelection(page))
                .withContext(
                  `In ${browserName}, selection drawn while outside page`
                )
                .toBeTrue();

              const selectedText = await getSelectionText(page);
              expect(selectedText.length)
                .withContext(`In ${browserName}`)
                .toBeGreaterThan(5);
            })
          );
        });
      });

      describe("selection with tagged PDFs", () => {
        /** @type {Array<[string, Page]>} */
        let pages;

        beforeEach(async () => {
          pages = await loadAndWait(
            "structure_simple.pdf",
            `.page[data-page-number = "1"] .endOfContent`,
            undefined,
            undefined,
            (_page, browserName) => ({
              imagesRightClickMinSize: browserName === "firefox" ? 16 : -1,
            })
          );
        });

        afterEach(async () => {
          await closePages(pages);
        });

        it("keeps selection when dragging outside the page", async () => {
          await Promise.all(
            pages.map(async ([browserName, page]) => {
              const [firstSpanInfo, pageRect, viewerRect] = await Promise.all([
                getFirstSpanInfo(page, 1),
                page.$eval('.page[data-page-number="1"]', div => {
                  const { x, y, width, height } = div.getBoundingClientRect();
                  return { x, y, width, height };
                }),
                page.$eval("#viewerContainer", div => {
                  const { x, y, width, height } = div.getBoundingClientRect();
                  return { x, y, width, height };
                }),
              ]);

              expect(firstSpanInfo)
                .withContext(`In ${browserName}`)
                .not.toBeNull();

              const positionStart = middlePosition(firstSpanInfo.rect);
              const outsidePage = getOutsidePagePosition(
                pageRect,
                viewerRect,
                positionStart.y
              );

              await page.mouse.move(positionStart.x, positionStart.y);
              await page.mouse.down();
              await moveInSteps(page, positionStart, outsidePage, 20);

              await page.mouse.up();

              expect(await hasDrawnSelection(page))
                .withContext(
                  `In ${browserName}, selection drawn while outside page`
                )
                .toBeTrue();

              const selectedText = await getSelectionText(page);
              expect(selectedText.length)
                .withContext(`In ${browserName}`)
                .toBeGreaterThan(0);
              expect(selectedText)
                .withContext(`In ${browserName}`)
                .toContain(firstSpanInfo.text.slice(0, 1));
            })
          );
        });

        it("doesn't jump when hovering on an empty area", async () => {
          await Promise.all(
            pages.map(async ([browserName, page]) => {
              const [firstSpanInfo, lastSpanInfo] = await Promise.all([
                getFirstSpanInfo(page, 1),
                getLastSpanInfo(page, 1),
              ]);

              expect(firstSpanInfo)
                .withContext(`In ${browserName}, first span`)
                .not.toBeNull();
              expect(lastSpanInfo)
                .withContext(`In ${browserName}, last span`)
                .not.toBeNull();

              const positionStart = middlePosition(firstSpanInfo.rect);
              const positionEnd = belowEndPosition(lastSpanInfo.rect);

              await page.mouse.move(positionStart.x, positionStart.y);
              await page.mouse.down();
              // Drag from the first to the last text run to pass through the
              // tagged content and end in the empty area below the text.
              await moveInSteps(page, positionStart, positionEnd, 20);

              await page.mouse.up();

              expect(await hasDrawnSelection(page))
                .withContext(`In ${browserName}, selection drawn in tagged PDF`)
                .toBeTrue();

              await expectAsync(page)
                .withContext(`In ${browserName}`)
                // Selection starts mid-word in Heading 1, so assert the stable
                // trailing content rather than exact full-line boundaries.
                .toHaveRoughlySelected(
                  /ing 1\s+This paragraph 1\.\s+Heading 2\s+This paragraph 2/
                );
            })
          );
        });
      });

      describe("doesn't jump when hovering on an empty area", () => {
        let pages;

        beforeEach(async () => {
          pages = await loadAndWait(
            "tracemonkey.pdf",
            `.page[data-page-number = "1"] .endOfContent`,
            undefined,
            undefined,
            (_page, browserName) => ({
              // Enable images in Firefox, to ensure that they do not interfere
              // with text selection. We do not test it in Chrome because we
              // know that they do degrate the text selection experience there.
              imagesRightClickMinSize: browserName === "firefox" ? 16 : -1,
            })
          );
        });

        afterEach(async () => {
          await closePages(pages);
        });

        it("in a single page", async () => {
          await Promise.all(
            pages.map(async ([browserName, page]) => {
              const [positionStart, positionEnd] = await Promise.all([
                getSpanRectFromText(
                  page,
                  1,
                  "(frequently executed) bytecode sequences, records"
                ).then(middlePosition),
                getSpanRectFromText(
                  page,
                  1,
                  "them, and compiles them to fast native code. We call such a se-"
                ).then(belowEndPosition),
              ]);

              await page.mouse.move(positionStart.x, positionStart.y);
              await page.mouse.down();
              await moveInSteps(page, positionStart, positionEnd, 20);
              await page.mouse.up();

              await expectAsync(page)
                .withContext(`In ${browserName}`)
                .toHaveRoughlySelected(
                  "code sequences, records\n" +
                    "them, and compiles them to fast native code. We call suc"
                );
            })
          );
        });

        it("across multiple pages", async () => {
          await Promise.all(
            pages.map(async ([browserName, page]) => {
              const scrollTarget = await getSpanRectFromText(
                page,
                1,
                "Unlike method-based dynamic compilers, our dynamic com-"
              );
              await page.evaluate(top => {
                document.getElementById("viewerContainer").scrollTop = top;
              }, scrollTarget.y - 50);

              const [
                positionStartPage1,
                positionEndPage1,
                positionStartPage2,
                positionEndPage2,
              ] = await Promise.all([
                getSpanRectFromText(
                  page,
                  1,
                  "Each compiled trace covers one path through the program with"
                ).then(middlePosition),
                getSpanRectFromText(
                  page,
                  1,
                  "or that the same types will occur in subsequent loop iterations."
                ).then(middlePosition),
                getSpanRectFromText(
                  page,
                  2,
                  "Hence, recording and compiling a trace"
                ).then(middlePosition),
                getSpanRectFromText(
                  page,
                  2,
                  "cache. Alternatively, the VM could simply stop tracing, and give up"
                ).then(belowEndPosition),
              ]);

              await page.mouse.move(positionStartPage1.x, positionStartPage1.y);
              await page.mouse.down();

              await moveInSteps(page, positionStartPage1, positionEndPage1, 20);
              await moveInSteps(page, positionEndPage1, positionStartPage2, 20);

              await expectAsync(page)
                .withContext(`In ${browserName}, first selection`)
                .toHaveRoughlySelected(
                  /path through the program .*Hence, recording a/s
                );

              await moveInSteps(page, positionStartPage2, positionEndPage2, 20);
              await page.mouse.up();

              await expectAsync(page)
                .withContext(`In ${browserName}, second selection`)
                .toHaveRoughlySelected(
                  /path through.*Hence, recording and .* tracing, and give/s
                );
            })
          );
        });
      });

      describe("doesn't jump when hovering on an empty area, with .markedContent", () => {
        let pages;

        beforeEach(async () => {
          pages = await loadAndWait(
            "chrome-text-selection-markedContent.pdf",
            `.page[data-page-number = "1"] .endOfContent`,
            undefined,
            undefined,
            (_page, browserName) => ({
              // Enable images in Firefox, to ensure that they do not interfere
              // with text selection. We do not test it in Chrome because we
              // know that they do degrate the text selection experience there.
              imagesRightClickMinSize: browserName === "firefox" ? 16 : -1,
            })
          );
        });

        afterEach(async () => {
          await closePages(pages);
        });

        it("in per-character selection mode", async () => {
          await Promise.all(
            pages.map(async ([browserName, page]) => {
              const [positionStart, positionEnd] = await Promise.all([
                getSpanRectFromText(
                  page,
                  1,
                  "strengthen in the coming quarters as the railway projects under"
                ).then(middlePosition),
                getSpanRectFromText(
                  page,
                  1,
                  "development enter the construction phase (estimated at around"
                ).then(belowEndPosition),
              ]);

              await page.mouse.move(positionStart.x, positionStart.y);
              await page.mouse.down();
              await moveInSteps(page, positionStart, positionEnd, 20);
              await page.mouse.up();

              await expectAsync(page)
                .withContext(`In ${browserName}`)
                .toHaveRoughlySelected(
                  "rs as the railway projects under\n" +
                    "development enter the construction phase (estimated at"
                );
            })
          );
        });

        it("in per-word selection mode", async () => {
          await Promise.all(
            pages.map(async ([browserName, page]) => {
              const [positionStart, positionEnd] = await Promise.all([
                getSpanRectFromText(
                  page,
                  1,
                  "strengthen in the coming quarters as the railway projects under"
                ).then(middlePosition),
                getSpanRectFromText(
                  page,
                  1,
                  "development enter the construction phase (estimated at around"
                ).then(belowEndPosition),
              ]);

              // Puppeteer doesn't support emulating "double click and hold" for
              // WebDriver BiDi, so we must manually dispatch a protocol action
              // (see https://github.com/puppeteer/puppeteer/issues/13745).
              await page.mainFrame().browsingContext.performActions([
                {
                  type: "pointer",
                  id: "__puppeteer_mouse",
                  actions: [
                    { type: "pointerMove", ...positionStart },
                    { type: "pointerDown", button: 0 },
                    { type: "pointerUp", button: 0 },
                    { type: "pointerDown", button: 0 },
                  ],
                },
              ]);
              await moveInSteps(page, positionStart, positionEnd, 20);
              await page.mouse.up();

              await expectAsync(page)
                .withContext(`In ${browserName}`)
                .toHaveRoughlySelected(
                  "quarters as the railway projects under\n" +
                    "development enter the construction phase (estimated at around"
                );
            })
          );
        });
      });

      describe("when selecting over a link", () => {
        let pages;

        beforeEach(async () => {
          pages = await loadAndWait(
            "annotation-link-text-popup.pdf",
            `.page[data-page-number = "1"] .endOfContent`,
            undefined,
            undefined,
            (_page, browserName) => ({
              // Enable images in Firefox, to ensure that they do not interfere
              // with text selection. We do not test it in Chrome because we
              // know that they do degrate the text selection experience there.
              imagesRightClickMinSize: browserName === "firefox" ? 16 : -1,
            })
          );
        });

        afterEach(async () => {
          await closePages(pages);
        });

        it("allows selecting within the link", async () => {
          await Promise.all(
            pages.map(async ([browserName, page]) => {
              const [positionStart, positionEnd] = await Promise.all([
                getSpanRectFromText(page, 1, "Link").then(middleLeftPosition),
                getSpanRectFromText(page, 1, "mozilla.org").then(
                  middlePosition
                ),
              ]);

              await page.mouse.move(positionStart.x, positionStart.y);
              await page.mouse.down();
              await moveInSteps(page, positionStart, positionEnd, 20);
              await page.mouse.up();

              await expectAsync(page)
                .withContext(`In ${browserName}`)
                .toHaveRoughlySelected("Link\nmozil");
            })
          );
        });

        it("allows selecting within the link when going backwards", async () => {
          await Promise.all(
            pages.map(async ([browserName, page]) => {
              const [positionStart, positionEnd] = await Promise.all([
                getSpanRectFromText(page, 1, "Text").then(middlePosition),
                getSpanRectFromText(page, 1, "mozilla.org").then(
                  middlePosition
                ),
              ]);

              await page.mouse.move(positionStart.x, positionStart.y);
              await page.mouse.down();
              await moveInSteps(page, positionStart, positionEnd, 20);
              await page.mouse.up();

              await expectAsync(page)
                .withContext(`In ${browserName}`)
                .toHaveRoughlySelected("a.org\nTe");
            })
          );
        });

        it("allows clicking the link after selecting", async () => {
          await Promise.all(
            pages.map(async ([browserName, page]) => {
              const [positionStart, positionEnd] = await Promise.all([
                getSpanRectFromText(page, 1, "Link").then(middleLeftPosition),
                getSpanRectFromText(page, 1, "mozilla.org").then(
                  middlePosition
                ),
              ]);

              await page.mouse.move(positionStart.x, positionStart.y);
              await page.mouse.down();
              await moveInSteps(page, positionStart, positionEnd, 20);
              await page.mouse.up();

              await waitForEvent({
                page,
                eventName: "click",
                action: () => page.mouse.click(positionEnd.x, positionEnd.y),
                selector: "#pdfjs_internal_id_8R",
                validator: e => {
                  // Don't navigate to the link destination: the `click` event
                  // firing is enough validation that the link can be clicked.
                  e.preventDefault();
                  return true;
                },
              });
            })
          );
        });

        it("allows clicking the link after changing selection with the keyboard", async () => {
          await Promise.all(
            pages.map(async ([browserName, page]) => {
              const [positionStart, positionEnd] = await Promise.all([
                getSpanRectFromText(page, 1, "Link").then(middleLeftPosition),
                getSpanRectFromText(page, 1, "mozilla.org").then(
                  middlePosition
                ),
              ]);

              await page.mouse.move(positionStart.x, positionStart.y);
              await page.mouse.down();
              await moveInSteps(page, positionStart, positionEnd, 20);
              await page.mouse.up();

              await page.keyboard.down("Shift");
              await page.keyboard.press("ArrowRight");
              await page.keyboard.up("Shift");

              await waitForEvent({
                page,
                eventName: "click",
                action: () => page.mouse.click(positionEnd.x, positionEnd.y),
                selector: "#pdfjs_internal_id_8R",
                validator: e => {
                  // Don't navigate to the link destination: the `click` event
                  // firing is enough validation that the link can be clicked.
                  e.preventDefault();
                  return true;
                },
              });
            })
          );
        });
      });

      describe("when selecting text with find highlights active", () => {
        let pages;

        beforeEach(async () => {
          pages = await loadAndWait(
            "find_all.pdf",
            ".textLayer",
            100,
            undefined,
            (_page, browserName) => ({
              // Enable images in Firefox, to ensure that they do not interfere
              // with text selection. We do not test it in Chrome because we
              // know that they do degrate the text selection experience there.
              imagesRightClickMinSize: browserName === "firefox" ? 16 : -1,
            })
          );
        });

        afterEach(async () => {
          await closePages(pages);
        });

        it("doesn't jump when selection anchor is inside a highlight element", async () => {
          await Promise.all(
            pages.map(async ([browserName, page]) => {
              // Highlight all occurrences of the letter A (case insensitive).
              await page.click("#viewFindButton");
              await page.waitForSelector("#findInput", { visible: true });
              await page.type("#findInput", "a");
              await page.click("#findHighlightAll + label");
              await page.waitForSelector(".textLayer .highlight");

              // find_all.pdf contains 'AB BA' in a monospace font. These are
              // the glyph metrics at 100% zoom, extracted from the PDF.
              const glyphWidth = 15.98;
              const expectedFirstAX = 30;

              // Compute the drag coordinates to select exactly "AB". The
              // horizontal positions use the page origin and PDF glyph
              // metrics; the vertical center comes from the highlight.
              const pageDiv = await page.$(".page canvas");
              const pageBox = await pageDiv.boundingBox();
              const firstHighlight = await page.$(".textLayer .highlight");
              const highlightBox = await firstHighlight.boundingBox();

              // Drag from beginning of first 'A' to end of second 'B'
              const aStart = pageBox.x + expectedFirstAX;
              const startY = Math.round(
                highlightBox.y + highlightBox.height / 2
              );
              const bEnd = Math.round(aStart + glyphWidth * 2);

              await page.mouse.move(aStart, startY);
              await page.mouse.down();
              await moveInSteps(
                page,
                { x: aStart, y: startY },
                { x: bEnd, y: startY },
                20
              );
              await page.mouse.up();

              const selection = await getSelectionText(page);
              expect(selection).withContext(`In ${browserName}`).toEqual("AB");

              // The selectionchange handler in TextLayerBuilder walks up
              // from .highlight to its parent span before placing
              // endOfContent (see text_layer_builder.js). Without that
              // fix, endOfContent would be inserted inside the text span
              // (as a sibling of the .highlight) instead of as a direct
              // child of .textLayer. Verify the correct DOM structure.
              const endOfContentIsDirectChild = await page.evaluate(() => {
                const eoc = document.querySelector(".textLayer .endOfContent");
                return eoc?.parentElement?.classList.contains("textLayer");
              });
              expect(endOfContentIsDirectChild)
                .withContext(`In ${browserName}`)
                .toBeTrue();
            })
          );
        });
      });

      describe("with `enableSelectionRendering` disabled", () => {
        /** @type {Array<[string, Page]>} */
        let pages;

        beforeEach(async () => {
          pages = await loadAndWait(
            "tracemonkey.pdf",
            `.page[data-page-number = "1"] .endOfContent`,
            undefined,
            undefined,
            (_page, browserName) => ({
              enableSelectionRendering: false,
              imagesRightClickMinSize: browserName === "firefox" ? 16 : -1,
            })
          );
        });

        afterEach(async () => {
          await closePages(pages);
        });

        it("does not render a selection overlay in the draw layer", async () => {
          await Promise.all(
            pages.map(async ([browserName, page]) => {
              const [positionStart, positionEnd] = await Promise.all([
                getSpanRectFromText(
                  page,
                  1,
                  "(frequently executed) bytecode sequences, records"
                ).then(middlePosition),
                getSpanRectFromText(
                  page,
                  1,
                  "them, and compiles them to fast native code. We call such a se-"
                ).then(belowEndPosition),
              ]);

              await page.mouse.move(positionStart.x, positionStart.y);
              await page.mouse.down();
              await moveInSteps(page, positionStart, positionEnd, 20);
              await page.mouse.up();

              // Text should still be selectable.
              const selectedText = await getSelectionText(page);
              expect(selectedText.length)
                .withContext(`In ${browserName}, text is still selectable`)
                .toBeGreaterThan(0);

              // But no selection overlay should appear in the draw layer.
              expect(await hasDrawnSelection(page))
                .withContext(
                  `In ${browserName}, no selection drawn when disabled`
                )
                .toBeFalse();
            })
          );
        });
      });
    });

    describe("using selection carets", () => {
      let browser;
      let page;

      beforeEach(async () => {
        // Chrome does not support simulating caret-based selection, so this
        // test only runs in Firefox.
        browser = await startBrowser({
          browserName: "firefox",
          startUrl: "",
          extraPrefsFirefox: {
            "layout.accessiblecaret.enabled": true,
            "layout.accessiblecaret.hide_carets_for_mouse_input": false,
          },
        });
        page = await browser.newPage();
        await page.goto(
          `${global.integrationBaseUrl}?file=/test/pdfs/tracemonkey.pdf#zoom=page-fit`
        );
        await page.bringToFront();
        await page.waitForSelector(
          `.page[data-page-number = "1"] .endOfContent`,
          { timeout: 0 }
        );
      });

      afterEach(async () => {
        await closeSinglePage(page);
        await browser.close();
      });

      it("doesn't jump when moving selection", async () => {
        const [initialStart, initialEnd, finalEnd] = await Promise.all([
          getSpanRectFromText(
            page,
            1,
            "(frequently executed) bytecode sequences, records"
          ).then(middleLeftPosition),
          getSpanRectFromText(
            page,
            1,
            "(frequently executed) bytecode sequences, records"
          ).then(middlePosition),
          getSpanRectFromText(
            page,
            1,
            "them, and compiles them to fast native code. We call such a se-"
          ).then(belowEndPosition),
        ]);

        await page.mouse.move(initialStart.x, initialStart.y);
        await page.mouse.down();
        await moveInSteps(page, initialStart, initialEnd, 20);
        await page.mouse.up();

        await expectAsync(page)
          .withContext(`first selection`)
          .toHaveRoughlySelected("frequently executed) byt");

        const initialCaretPos = {
          x: initialEnd.x,
          y: initialEnd.y + 10,
        };
        const intermediateCaretPos = {
          x: finalEnd.x,
          y: finalEnd.y + 5,
        };
        const finalCaretPos = {
          x: finalEnd.x + 20,
          y: finalEnd.y + 5,
        };

        await page.mouse.move(initialCaretPos.x, initialCaretPos.y);
        await page.mouse.down();
        await moveInSteps(page, initialCaretPos, intermediateCaretPos, 20);
        await page.mouse.up();

        await expectAsync(page)
          .withContext(`second selection`)
          .toHaveRoughlySelected(/frequently .* We call such a s/s);

        await page.mouse.down();
        await moveInSteps(page, intermediateCaretPos, finalCaretPos, 20);
        await page.mouse.up();

        await expectAsync(page)
          .withContext(`third selection`)
          .toHaveRoughlySelected(/frequently .* We call such a s/s);
      });
    });

    describe("with select-all (Ctrl+A)", () => {
      /** @type {Array<[string, Page]>} */
      let pages;

      /**
       * Return the set of page numbers that have a non-empty selection
       * overlay path in their draw layer.
       *
       * @param {Page} page
       * @returns {Promise<Array<number>>}
       */
      async function pagesWithDrawnSelection(page) {
        return page.evaluate(() => {
          const numbers = new Set();
          for (const path of document.querySelectorAll(
            ".page .canvasWrapper .selection svg path"
          )) {
            if (path.getAttribute("d")?.trim()) {
              const n = path.closest(".page")?.dataset.pageNumber;
              if (n) {
                numbers.add(Number(n));
              }
            }
          }
          return [...numbers].sort((a, b) => a - b);
        });
      }

      beforeEach(async () => {
        pages = await loadAndWait(
          "tracemonkey.pdf",
          `.page[data-page-number = "1"] .endOfContent`
        );
      });

      afterEach(async () => {
        await closePages(pages);
      });

      it("draws a selection overlay on currently-rendered pages", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            // Wait for at least two text layers to be rendered so the
            // overlay can be expected on multiple pages. The number of
            // pages rendered up-front at the default zoom can vary
            // depending on the viewport size on CI.
            await page.waitForFunction(
              () =>
                document.querySelectorAll(".textLayer .endOfContent").length >=
                2
            );

            await waitForEvent({
              page,
              eventName: "selectionchange",
              action: () => kbSelectAll(page),
            });

            expect(await hasDrawnSelection(page))
              .withContext(`In ${browserName}`)
              .toBeTrue();

            // Several text layers are rendered at the default zoom and
            // each one should now carry a selection overlay.
            const drawn = await pagesWithDrawnSelection(page);
            expect(drawn.length)
              .withContext(
                `In ${browserName}, pages with selection overlay: ` +
                  `${drawn.join(",")}`
              )
              .toBeGreaterThan(1);
            expect(drawn[0])
              .withContext(`In ${browserName}, first selected page`)
              .toBe(1);
          })
        );
      });

      it("extends the overlay onto pages rendered after scroll", async () => {
        await Promise.all(
          pages.map(async ([browserName, page]) => {
            await waitForEvent({
              page,
              eventName: "selectionchange",
              action: () => kbSelectAll(page),
            });

            const initial = await pagesWithDrawnSelection(page);
            expect(initial.length)
              .withContext(`In ${browserName}, initial pages with overlay`)
              .toBeGreaterThan(0);

            // Pick the first page that hasn't been rendered with a
            // selection overlay yet, scroll to it, and verify the overlay
            // gets drawn on it once its draw layer is parented.
            const lastInitial = initial.at(-1);
            const targetPage = lastInitial + 1;

            await page.evaluate(n => {
              const pageDiv = document.querySelector(
                `.page[data-page-number="${n}"]`
              );
              pageDiv.scrollIntoView({ block: "center" });
            }, targetPage);

            await page.waitForSelector(
              `.page[data-page-number="${targetPage}"] .textLayer .endOfContent`,
              { timeout: 0 }
            );

            // After the new page is rendered, its draw layer becomes
            // "live" (`setParent` is called) and the selection overlay
            // must be extended onto it without requiring a new
            // `selectionchange` event.
            await page.waitForFunction(
              n => {
                const path = document.querySelector(
                  `.page[data-page-number="${n}"] .canvasWrapper .selection svg path`
                );
                return !!path?.getAttribute("d")?.trim();
              },
              { timeout: 0 },
              targetPage
            );

            const afterScroll = await pagesWithDrawnSelection(page);
            expect(afterScroll)
              .withContext(
                `In ${browserName}, target page ${targetPage} has overlay`
              )
              .toContain(targetPage);
          })
        );
      });
    });
  });

  describe("when the browser enforces a minimum font size", () => {
    let browser;
    let page;

    beforeEach(async () => {
      // Only testing in Firefox because, while Chrome has a setting similar to
      // font.minimum-size.x-western, it is not exposed through its API.
      browser = await startBrowser({
        browserName: "firefox",
        startUrl: "",
        extraPrefsFirefox: { "font.minimum-size.x-western": 40 },
      });
      page = await browser.newPage();
      await page.goto(
        `${global.integrationBaseUrl}?file=/test/pdfs/tracemonkey.pdf#zoom=100`
      );
      await page.bringToFront();
      await page.waitForSelector(
        `.page[data-page-number = "1"] .endOfContent`,
        { timeout: 0 }
      );
    });

    afterEach(async () => {
      await closeSinglePage(page);
      await browser.close();
    });

    it("renders spans with the right size", async () => {
      const rect = await getSpanRectFromText(
        page,
        1,
        "Dynamic languages such as JavaScript are more difﬁcult to com-"
      );

      // The difference between `a` and `b`, as a percentage of the lower one
      const getPercentDiff = (a, b) => Math.max(a, b) / Math.min(a, b) - 1;

      expect(getPercentDiff(rect.width, 315)).toBeLessThan(0.03);
      expect(getPercentDiff(rect.height, 12)).toBeLessThan(0.03);
    });
  });
});
