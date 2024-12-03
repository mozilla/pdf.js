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
  closePages,
  closeSinglePage,
  getSpanRectFromText,
  loadAndWait,
  waitForEvent,
} from "./test_utils.mjs";
import { startBrowser } from "../test.mjs";

describe("Text layer", () => {
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

    beforeAll(() => {
      jasmine.addAsyncMatchers({
        // Check that a page has a selection containing the given text, with
        // some tolerance for extra characters before/after.
        toHaveRoughlySelected({ pp }) {
          return {
            async compare(page, expected) {
              const TOLERANCE = 10;

              const actual = await page.evaluate(() =>
                // We need to normalize EOL for Windows
                window.getSelection().toString().replaceAll("\r\n", "\n")
              );

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
      describe("doesn't jump when hovering on an empty area", () => {
        let pages;

        beforeAll(async () => {
          pages = await loadAndWait(
            "tracemonkey.pdf",
            `.page[data-page-number = "1"] .endOfContent`
          );
        });
        afterAll(async () => {
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

      describe("when selecting over a link", () => {
        let pages;

        beforeAll(async () => {
          pages = await loadAndWait(
            "annotation-link-text-popup.pdf",
            `.page[data-page-number = "1"] .endOfContent`
          );
        });
        afterAll(async () => {
          await closePages(pages);
        });
        afterEach(() =>
          Promise.all(
            pages.map(([_, page]) =>
              page.evaluate(() => window.getSelection().removeAllRanges())
            )
          )
        );

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
    });

    describe("using selection carets", () => {
      let browser;
      let page;

      beforeAll(async () => {
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
      afterAll(async () => {
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
          .toHaveRoughlySelected(/frequently .* We call such a se/s);

        await page.mouse.down();
        await moveInSteps(page, intermediateCaretPos, finalCaretPos, 20);
        await page.mouse.up();

        await expectAsync(page)
          .withContext(`third selection`)
          .toHaveRoughlySelected(/frequently .* We call such a se/s);
      });
    });
  });

  describe("when the browser enforces a minimum font size", () => {
    let browser;
    let page;

    beforeAll(async () => {
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

    afterAll(async () => {
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
