/* Copyright 2017 Mozilla Foundation
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
  backtrackBeforeAllVisibleElements,
  binarySearchFirstItem,
  calcRound,
  getPageSizeInches,
  getVisibleElements,
  isPortraitOrientation,
  isValidRotation,
  parseQueryString,
  removeNullCharacters,
} from "../../web/ui_utils.js";

describe("ui_utils", function () {
  describe("binary search", function () {
    function isTrue(boolean) {
      return boolean;
    }
    function isGreater3(number) {
      return number > 3;
    }

    it("empty array", function () {
      expect(binarySearchFirstItem([], isTrue)).toEqual(0);
    });
    it("single boolean entry", function () {
      expect(binarySearchFirstItem([false], isTrue)).toEqual(1);
      expect(binarySearchFirstItem([true], isTrue)).toEqual(0);
    });
    it("three boolean entries", function () {
      expect(binarySearchFirstItem([true, true, true], isTrue)).toEqual(0);
      expect(binarySearchFirstItem([false, true, true], isTrue)).toEqual(1);
      expect(binarySearchFirstItem([false, false, true], isTrue)).toEqual(2);
      expect(binarySearchFirstItem([false, false, false], isTrue)).toEqual(3);
    });
    it("three numeric entries", function () {
      expect(binarySearchFirstItem([0, 1, 2], isGreater3)).toEqual(3);
      expect(binarySearchFirstItem([2, 3, 4], isGreater3)).toEqual(2);
      expect(binarySearchFirstItem([4, 5, 6], isGreater3)).toEqual(0);
    });
    it("three numeric entries and a start index", function () {
      expect(binarySearchFirstItem([0, 1, 2, 3, 4], isGreater3, 2)).toEqual(4);
      expect(binarySearchFirstItem([2, 3, 4], isGreater3, 2)).toEqual(2);
      expect(binarySearchFirstItem([4, 5, 6], isGreater3, 1)).toEqual(1);
    });
  });

  describe("isValidRotation", function () {
    it("should reject non-integer angles", function () {
      expect(isValidRotation()).toEqual(false);
      expect(isValidRotation(null)).toEqual(false);
      expect(isValidRotation(NaN)).toEqual(false);
      expect(isValidRotation([90])).toEqual(false);
      expect(isValidRotation("90")).toEqual(false);
      expect(isValidRotation(90.5)).toEqual(false);
    });

    it("should reject non-multiple of 90 degree angles", function () {
      expect(isValidRotation(45)).toEqual(false);
      expect(isValidRotation(-123)).toEqual(false);
    });

    it("should accept valid angles", function () {
      expect(isValidRotation(0)).toEqual(true);
      expect(isValidRotation(90)).toEqual(true);
      expect(isValidRotation(-270)).toEqual(true);
      expect(isValidRotation(540)).toEqual(true);
    });
  });

  describe("isPortraitOrientation", function () {
    it("should be portrait orientation", function () {
      expect(
        isPortraitOrientation({
          width: 200,
          height: 400,
        })
      ).toEqual(true);

      expect(
        isPortraitOrientation({
          width: 500,
          height: 500,
        })
      ).toEqual(true);
    });

    it("should be landscape orientation", function () {
      expect(
        isPortraitOrientation({
          width: 600,
          height: 300,
        })
      ).toEqual(false);
    });
  });

  describe("parseQueryString", function () {
    it("should parse one key/value pair", function () {
      const parameters = parseQueryString("key1=value1");
      expect(parameters.size).toEqual(1);
      expect(parameters.get("key1")).toEqual("value1");
    });

    it("should parse multiple key/value pairs", function () {
      const parameters = parseQueryString(
        "key1=value1&key2=value2&key3=value3"
      );
      expect(parameters.size).toEqual(3);
      expect(parameters.get("key1")).toEqual("value1");
      expect(parameters.get("key2")).toEqual("value2");
      expect(parameters.get("key3")).toEqual("value3");
    });

    it("should parse keys without values", function () {
      const parameters = parseQueryString("key1");
      expect(parameters.size).toEqual(1);
      expect(parameters.get("key1")).toEqual("");
    });

    it("should decode encoded key/value pairs", function () {
      const parameters = parseQueryString("k%C3%ABy1=valu%C3%AB1");
      expect(parameters.size).toEqual(1);
      expect(parameters.get("këy1")).toEqual("valuë1");
    });

    it("should convert keys to lowercase", function () {
      const parameters = parseQueryString("Key1=Value1&KEY2=Value2");
      expect(parameters.size).toEqual(2);
      expect(parameters.get("key1")).toEqual("Value1");
      expect(parameters.get("key2")).toEqual("Value2");
    });
  });

  describe("removeNullCharacters", function () {
    it("should not modify string without null characters", function () {
      const str = "string without null chars";
      expect(removeNullCharacters(str)).toEqual("string without null chars");
    });

    it("should modify string with null characters", function () {
      const str = "string\x00With\x00Null\x00Chars";
      expect(removeNullCharacters(str)).toEqual("stringWithNullChars");
    });

    it("should modify string with non-displayable characters", function () {
      const str = Array.from(
        Array(32).keys(),
        x => String.fromCharCode(x) + "a"
      ).join("");
      // \x00 is replaced by an empty string.
      const expected =
        "a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a";
      expect(removeNullCharacters(str, /* replaceInvisible */ true)).toEqual(
        expected
      );
    });
  });

  describe("getPageSizeInches", function () {
    it("gets page size (in inches)", function () {
      const page = {
        view: [0, 0, 595.28, 841.89],
        userUnit: 1.0,
        rotate: 0,
      };
      const { width, height } = getPageSizeInches(page);

      expect(+width.toPrecision(3)).toEqual(8.27);
      expect(+height.toPrecision(4)).toEqual(11.69);
    });

    it("gets page size (in inches), for non-default /Rotate entry", function () {
      const pdfPage1 = { view: [0, 0, 612, 792], userUnit: 1, rotate: 0 };
      const { width: width1, height: height1 } = getPageSizeInches(pdfPage1);

      expect(width1).toEqual(8.5);
      expect(height1).toEqual(11);

      const pdfPage2 = { view: [0, 0, 612, 792], userUnit: 1, rotate: 90 };
      const { width: width2, height: height2 } = getPageSizeInches(pdfPage2);

      expect(width2).toEqual(11);
      expect(height2).toEqual(8.5);
    });
  });

  describe("getVisibleElements", function () {
    // These values are based on margin/border values in the CSS, but there
    // isn't any real need for them to be; they just need to take *some* value.
    const BORDER_WIDTH = 9;
    const SPACING = 2 * BORDER_WIDTH - 7;

    // This is a helper function for assembling an array of view stubs from an
    // array of arrays of [width, height] pairs, which represents wrapped lines
    // of pages. It uses the above constants to add realistic spacing between
    // the pages and the lines.
    //
    // If you're reading a test that calls makePages, you should think of the
    // inputs to makePages as boxes with no borders, being laid out in a
    // container that has no margins, so that the top of the tallest page in
    // the first row will be at y = 0, and the left of the first page in
    // the first row will be at x = 0. The spacing between pages in a row, and
    // the spacing between rows, is SPACING. If you wanted to construct an
    // actual HTML document with the same layout, you should give each page
    // element a margin-right and margin-bottom of SPACING, and add no other
    // margins, borders, or padding.
    //
    // If you're reading makePages itself, you'll see a somewhat more
    // complicated picture because this suite of tests is exercising
    // getVisibleElements' ability to account for the borders that real page
    // elements have. makePages tests this by subtracting a BORDER_WIDTH from
    // offsetLeft/Top and adding it to clientLeft/Top. So the element stubs that
    // getVisibleElements sees may, for example, actually have an offsetTop of
    // -9. If everything is working correctly, this detail won't leak out into
    // the tests themselves, and so the tests shouldn't use the value of
    // BORDER_WIDTH at all.
    function makePages(lines) {
      const result = [];
      let lineTop = 0,
        id = 0;
      for (const line of lines) {
        const lineHeight = line.reduce(function (maxHeight, pair) {
          return Math.max(maxHeight, pair[1]);
        }, 0);
        let offsetLeft = -BORDER_WIDTH;
        for (const [clientWidth, clientHeight] of line) {
          const offsetTop =
            lineTop + (lineHeight - clientHeight) / 2 - BORDER_WIDTH;
          const div = {
            offsetLeft,
            offsetTop,
            clientWidth,
            clientHeight,
            clientLeft: BORDER_WIDTH,
            clientTop: BORDER_WIDTH,
          };
          result.push({ id, div });
          ++id;
          offsetLeft += clientWidth + SPACING;
        }
        lineTop += lineHeight + SPACING;
      }
      return result;
    }

    // This is a reimplementation of getVisibleElements without the
    // optimizations.
    function slowGetVisibleElements(scroll, pages) {
      const views = [],
        ids = new Set();
      const { scrollLeft, scrollTop } = scroll;
      const scrollRight = scrollLeft + scroll.clientWidth;
      const scrollBottom = scrollTop + scroll.clientHeight;
      for (const view of pages) {
        const { div } = view;
        const viewLeft = div.offsetLeft + div.clientLeft;
        const viewRight = viewLeft + div.clientWidth;
        const viewTop = div.offsetTop + div.clientTop;
        const viewBottom = viewTop + div.clientHeight;

        if (
          viewLeft < scrollRight &&
          viewRight > scrollLeft &&
          viewTop < scrollBottom &&
          viewBottom > scrollTop
        ) {
          const minY = Math.max(0, scrollTop - viewTop);
          const minX = Math.max(0, scrollLeft - viewLeft);

          const hiddenHeight = minY + Math.max(0, viewBottom - scrollBottom);
          const hiddenWidth = minX + Math.max(0, viewRight - scrollRight);

          const fractionHeight =
            (div.clientHeight - hiddenHeight) / div.clientHeight;
          const fractionWidth =
            (div.clientWidth - hiddenWidth) / div.clientWidth;
          const percent = (fractionHeight * fractionWidth * 100) | 0;

          let visibleArea = null;
          if (percent < 100) {
            visibleArea = {
              minX,
              minY,
              maxX: Math.min(viewRight, scrollRight) - viewLeft,
              maxY: Math.min(viewBottom, scrollBottom) - viewTop,
            };
          }

          views.push({
            id: view.id,
            x: viewLeft,
            y: viewTop,
            view,
            percent,
            visibleArea,
            widthPercent: (fractionWidth * 100) | 0,
          });
          ids.add(view.id);
        }
      }
      return { first: views[0], last: views.at(-1), views, ids };
    }

    // This function takes a fixed layout of pages and compares the system under
    // test to the slower implementation above, for a range of scroll viewport
    // sizes and positions.
    function scrollOverDocument(pages, horizontal = false, rtl = false) {
      const size = pages.reduce(function (max, { div }) {
        return Math.max(
          max,
          horizontal
            ? Math.abs(div.offsetLeft + div.clientLeft + div.clientWidth)
            : div.offsetTop + div.clientTop + div.clientHeight
        );
      }, 0);
      // The numbers (7 and 5) are mostly arbitrary, not magic: increase them to
      // make scrollOverDocument tests faster, decrease them to make the tests
      // more scrupulous, and keep them coprime to reduce the chance of missing
      // weird edge case bugs.
      for (let i = -size; i < size; i += 7) {
        // The screen height (or width) here (j - i) doubles on each inner loop
        // iteration; again, this is just to test an interesting range of cases
        // without slowing the tests down to check every possible case.
        for (let j = i + 5; j < size; j += j - i) {
          const scrollEl = horizontal
            ? {
                scrollTop: 0,
                scrollLeft: i,
                clientHeight: 10000,
                clientWidth: j - i,
              }
            : {
                scrollTop: i,
                scrollLeft: 0,
                clientHeight: j - i,
                clientWidth: 10000,
              };
          expect(
            getVisibleElements({
              scrollEl,
              views: pages,
              sortByVisibility: false,
              horizontal,
              rtl,
            })
          ).toEqual(slowGetVisibleElements(scrollEl, pages));
        }
      }
    }

    it("with pages of varying height", function () {
      const pages = makePages([
        [
          [50, 20],
          [20, 50],
        ],
        [
          [30, 12],
          [12, 30],
        ],
        [
          [20, 50],
          [50, 20],
        ],
        [
          [50, 20],
          [20, 50],
        ],
      ]);
      scrollOverDocument(pages);
    });

    it("widescreen challenge", function () {
      const pages = makePages([
        [
          [10, 50],
          [10, 60],
          [10, 70],
          [10, 80],
          [10, 90],
        ],
        [
          [10, 90],
          [10, 80],
          [10, 70],
          [10, 60],
          [10, 50],
        ],
        [
          [10, 50],
          [10, 60],
          [10, 70],
          [10, 80],
          [10, 90],
        ],
      ]);
      scrollOverDocument(pages);
    });

    it("works with horizontal scrolling", function () {
      const pages = makePages([
        [
          [10, 50],
          [20, 20],
          [30, 10],
        ],
      ]);
      scrollOverDocument(pages, /* horizontal = */ true);
    });

    it("works with horizontal scrolling with RTL-documents", function () {
      const pages = makePages([
        [
          [-10, 50],
          [-20, 20],
          [-30, 10],
        ],
      ]);
      scrollOverDocument(pages, /* horizontal = */ true, /* rtl = */ true);
    });

    it("handles `sortByVisibility` correctly", function () {
      const scrollEl = {
        scrollTop: 75,
        scrollLeft: 0,
        clientHeight: 750,
        clientWidth: 1500,
      };
      const views = makePages([[[100, 150]], [[100, 150]], [[100, 150]]]);

      const visible = getVisibleElements({ scrollEl, views });
      const visibleSorted = getVisibleElements({
        scrollEl,
        views,
        sortByVisibility: true,
      });

      const viewsOrder = [],
        viewsSortedOrder = [];
      for (const view of visible.views) {
        viewsOrder.push(view.id);
      }
      for (const view of visibleSorted.views) {
        viewsSortedOrder.push(view.id);
      }
      expect(viewsOrder).toEqual([0, 1, 2]);
      expect(viewsSortedOrder).toEqual([1, 2, 0]);
    });

    it("handles views being empty", function () {
      const scrollEl = {
        scrollTop: 10,
        scrollLeft: 0,
        clientHeight: 750,
        clientWidth: 1500,
      };
      const views = [];

      expect(getVisibleElements({ scrollEl, views })).toEqual({
        first: undefined,
        last: undefined,
        views: [],
        ids: new Set(),
      });
    });

    it("handles all views being hidden (without errors)", function () {
      const scrollEl = {
        scrollTop: 100000,
        scrollLeft: 0,
        clientHeight: 750,
        clientWidth: 1500,
      };
      const views = makePages([[[100, 150]], [[100, 150]], [[100, 150]]]);

      expect(getVisibleElements({ scrollEl, views })).toEqual({
        first: undefined,
        last: undefined,
        views: [],
        ids: new Set(),
      });
    });

    // This sub-suite is for a notionally internal helper function for
    // getVisibleElements.
    describe("backtrackBeforeAllVisibleElements", function () {
      // Layout elements common to all tests
      const tallPage = [10, 50];
      const shortPage = [10, 10];

      // A scroll position that ensures that only the tall pages in the second
      // row are visible
      const top1 =
        20 +
        SPACING + // height of the first row
        40; // a value between 30 (so the short pages on the second row are
      // hidden) and 50 (so the tall pages are visible)

      // A scroll position that ensures that all of the pages in the second row
      // are visible, but the tall ones are a tiny bit cut off
      const top2 =
        20 +
        SPACING + // height of the first row
        10; // a value greater than 0 but less than 30

      // These tests refer to cases enumerated in the comments of
      // backtrackBeforeAllVisibleElements.
      it("handles case 1", function () {
        const pages = makePages([
          [
            [10, 20],
            [10, 20],
            [10, 20],
            [10, 20],
          ],
          [tallPage, shortPage, tallPage, shortPage],
          [
            [10, 50],
            [10, 50],
            [10, 50],
            [10, 50],
          ],
          [
            [10, 20],
            [10, 20],
            [10, 20],
            [10, 20],
          ],
          [[10, 20]],
        ]);
        // binary search would land on the second row, first page
        const bsResult = 4;
        expect(
          backtrackBeforeAllVisibleElements(bsResult, pages, top1)
        ).toEqual(4);
      });

      it("handles case 2", function () {
        const pages = makePages([
          [
            [10, 20],
            [10, 20],
            [10, 20],
            [10, 20],
          ],
          [tallPage, shortPage, tallPage, tallPage],
          [
            [10, 50],
            [10, 50],
            [10, 50],
            [10, 50],
          ],
          [
            [10, 20],
            [10, 20],
            [10, 20],
            [10, 20],
          ],
        ]);
        // binary search would land on the second row, third page
        const bsResult = 6;
        expect(
          backtrackBeforeAllVisibleElements(bsResult, pages, top1)
        ).toEqual(4);
      });

      it("handles case 3", function () {
        const pages = makePages([
          [
            [10, 20],
            [10, 20],
            [10, 20],
            [10, 20],
          ],
          [tallPage, shortPage, tallPage, shortPage],
          [
            [10, 50],
            [10, 50],
            [10, 50],
            [10, 50],
          ],
          [
            [10, 20],
            [10, 20],
            [10, 20],
            [10, 20],
          ],
        ]);
        // binary search would land on the third row, first page
        const bsResult = 8;
        expect(
          backtrackBeforeAllVisibleElements(bsResult, pages, top1)
        ).toEqual(4);
      });

      it("handles case 4", function () {
        const pages = makePages([
          [
            [10, 20],
            [10, 20],
            [10, 20],
            [10, 20],
          ],
          [tallPage, shortPage, tallPage, shortPage],
          [
            [10, 50],
            [10, 50],
            [10, 50],
            [10, 50],
          ],
          [
            [10, 20],
            [10, 20],
            [10, 20],
            [10, 20],
          ],
        ]);
        // binary search would land on the second row, first page
        const bsResult = 4;
        expect(
          backtrackBeforeAllVisibleElements(bsResult, pages, top2)
        ).toEqual(4);
      });
    });
  });

  describe("calcRound", function () {
    it("should handle different browsers/environments correctly", function () {
      if (
        typeof window !== "undefined" &&
        window.navigator?.userAgent?.includes("Firefox")
      ) {
        expect(calcRound(1.6)).not.toEqual(1.6);
      } else {
        expect(calcRound(1.6)).toEqual(1.6);
      }
    });
  });
});
