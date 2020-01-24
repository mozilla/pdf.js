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
  EventBus,
  getPageSizeInches,
  getPDFFileNameFromURL,
  getVisibleElements,
  isPortraitOrientation,
  isValidRotation,
  moveToEndOfArray,
  waitOnEventOrTimeout,
  WaitOnType,
} from "../../web/ui_utils.js";
import { createObjectURL } from "../../src/shared/util.js";
import { isNodeJS } from "../../src/shared/is_node.js";

describe("ui_utils", function() {
  describe("binary search", function() {
    function isTrue(boolean) {
      return boolean;
    }
    function isGreater3(number) {
      return number > 3;
    }

    it("empty array", function() {
      expect(binarySearchFirstItem([], isTrue)).toEqual(0);
    });
    it("single boolean entry", function() {
      expect(binarySearchFirstItem([false], isTrue)).toEqual(1);
      expect(binarySearchFirstItem([true], isTrue)).toEqual(0);
    });
    it("three boolean entries", function() {
      expect(binarySearchFirstItem([true, true, true], isTrue)).toEqual(0);
      expect(binarySearchFirstItem([false, true, true], isTrue)).toEqual(1);
      expect(binarySearchFirstItem([false, false, true], isTrue)).toEqual(2);
      expect(binarySearchFirstItem([false, false, false], isTrue)).toEqual(3);
    });
    it("three numeric entries", function() {
      expect(binarySearchFirstItem([0, 1, 2], isGreater3)).toEqual(3);
      expect(binarySearchFirstItem([2, 3, 4], isGreater3)).toEqual(2);
      expect(binarySearchFirstItem([4, 5, 6], isGreater3)).toEqual(0);
    });
  });

  describe("getPDFFileNameFromURL", function() {
    it("gets PDF filename", function() {
      // Relative URL
      expect(getPDFFileNameFromURL("/pdfs/file1.pdf")).toEqual("file1.pdf");
      // Absolute URL
      expect(
        getPDFFileNameFromURL("http://www.example.com/pdfs/file2.pdf")
      ).toEqual("file2.pdf");
    });

    it("gets fallback filename", function() {
      // Relative URL
      expect(getPDFFileNameFromURL("/pdfs/file1.txt")).toEqual("document.pdf");
      // Absolute URL
      expect(
        getPDFFileNameFromURL("http://www.example.com/pdfs/file2.txt")
      ).toEqual("document.pdf");
    });

    it("gets custom fallback filename", function() {
      // Relative URL
      expect(getPDFFileNameFromURL("/pdfs/file1.txt", "qwerty1.pdf")).toEqual(
        "qwerty1.pdf"
      );
      // Absolute URL
      expect(
        getPDFFileNameFromURL(
          "http://www.example.com/pdfs/file2.txt",
          "qwerty2.pdf"
        )
      ).toEqual("qwerty2.pdf");

      // An empty string should be a valid custom fallback filename.
      expect(getPDFFileNameFromURL("/pdfs/file3.txt", "")).toEqual("");
    });

    it("gets fallback filename when url is not a string", function() {
      expect(getPDFFileNameFromURL(null)).toEqual("document.pdf");

      expect(getPDFFileNameFromURL(null, "file.pdf")).toEqual("file.pdf");
    });

    it("gets PDF filename from URL containing leading/trailing whitespace", function() {
      // Relative URL
      expect(getPDFFileNameFromURL("   /pdfs/file1.pdf   ")).toEqual(
        "file1.pdf"
      );
      // Absolute URL
      expect(
        getPDFFileNameFromURL("   http://www.example.com/pdfs/file2.pdf   ")
      ).toEqual("file2.pdf");
    });

    it("gets PDF filename from query string", function() {
      // Relative URL
      expect(getPDFFileNameFromURL("/pdfs/pdfs.html?name=file1.pdf")).toEqual(
        "file1.pdf"
      );
      // Absolute URL
      expect(
        getPDFFileNameFromURL("http://www.example.com/pdfs/pdf.html?file2.pdf")
      ).toEqual("file2.pdf");
    });

    it("gets PDF filename from hash string", function() {
      // Relative URL
      expect(getPDFFileNameFromURL("/pdfs/pdfs.html#name=file1.pdf")).toEqual(
        "file1.pdf"
      );
      // Absolute URL
      expect(
        getPDFFileNameFromURL("http://www.example.com/pdfs/pdf.html#file2.pdf")
      ).toEqual("file2.pdf");
    });

    it("gets correct PDF filename when multiple ones are present", function() {
      // Relative URL
      expect(getPDFFileNameFromURL("/pdfs/file1.pdf?name=file.pdf")).toEqual(
        "file1.pdf"
      );
      // Absolute URL
      expect(
        getPDFFileNameFromURL("http://www.example.com/pdfs/file2.pdf#file.pdf")
      ).toEqual("file2.pdf");
    });

    it("gets PDF filename from URI-encoded data", function() {
      var encodedUrl = encodeURIComponent(
        "http://www.example.com/pdfs/file1.pdf"
      );
      expect(getPDFFileNameFromURL(encodedUrl)).toEqual("file1.pdf");

      var encodedUrlWithQuery = encodeURIComponent(
        "http://www.example.com/pdfs/file.txt?file2.pdf"
      );
      expect(getPDFFileNameFromURL(encodedUrlWithQuery)).toEqual("file2.pdf");
    });

    it("gets PDF filename from data mistaken for URI-encoded", function() {
      expect(getPDFFileNameFromURL("/pdfs/%AA.pdf")).toEqual("%AA.pdf");

      expect(getPDFFileNameFromURL("/pdfs/%2F.pdf")).toEqual("%2F.pdf");
    });

    it("gets PDF filename from (some) standard protocols", function() {
      // HTTP
      expect(getPDFFileNameFromURL("http://www.example.com/file1.pdf")).toEqual(
        "file1.pdf"
      );
      // HTTPS
      expect(
        getPDFFileNameFromURL("https://www.example.com/file2.pdf")
      ).toEqual("file2.pdf");
      // File
      expect(getPDFFileNameFromURL("file:///path/to/files/file3.pdf")).toEqual(
        "file3.pdf"
      );
      // FTP
      expect(getPDFFileNameFromURL("ftp://www.example.com/file4.pdf")).toEqual(
        "file4.pdf"
      );
    });

    it('gets PDF filename from query string appended to "blob:" URL', function() {
      if (isNodeJS) {
        pending("Blob in not supported in Node.js.");
      }
      var typedArray = new Uint8Array([1, 2, 3, 4, 5]);
      var blobUrl = createObjectURL(typedArray, "application/pdf");
      // Sanity check to ensure that a "blob:" URL was returned.
      expect(blobUrl.startsWith("blob:")).toEqual(true);

      expect(getPDFFileNameFromURL(blobUrl + "?file.pdf")).toEqual("file.pdf");
    });

    it('gets fallback filename from query string appended to "data:" URL', function() {
      var typedArray = new Uint8Array([1, 2, 3, 4, 5]);
      var dataUrl = createObjectURL(
        typedArray,
        "application/pdf",
        /* forceDataSchema = */ true
      );
      // Sanity check to ensure that a "data:" URL was returned.
      expect(dataUrl.startsWith("data:")).toEqual(true);

      expect(getPDFFileNameFromURL(dataUrl + "?file1.pdf")).toEqual(
        "document.pdf"
      );

      // Should correctly detect a "data:" URL with leading whitespace.
      expect(getPDFFileNameFromURL("     " + dataUrl + "?file2.pdf")).toEqual(
        "document.pdf"
      );
    });
  });

  describe("EventBus", function() {
    it("dispatch event", function() {
      var eventBus = new EventBus();
      var count = 0;
      eventBus.on("test", function(evt) {
        expect(evt).toEqual(undefined);
        count++;
      });
      eventBus.dispatch("test");
      expect(count).toEqual(1);
    });
    it("dispatch event with arguments", function() {
      const eventBus = new EventBus();
      let count = 0;
      eventBus.on("test", function(evt) {
        expect(evt).toEqual({ abc: 123 });
        count++;
      });
      eventBus.dispatch("test", {
        abc: 123,
      });
      expect(count).toEqual(1);
    });
    it("dispatch different event", function() {
      var eventBus = new EventBus();
      var count = 0;
      eventBus.on("test", function() {
        count++;
      });
      eventBus.dispatch("nottest");
      expect(count).toEqual(0);
    });
    it("dispatch event multiple times", function() {
      var eventBus = new EventBus();
      var count = 0;
      eventBus.dispatch("test");
      eventBus.on("test", function() {
        count++;
      });
      eventBus.dispatch("test");
      eventBus.dispatch("test");
      expect(count).toEqual(2);
    });
    it("dispatch event to multiple handlers", function() {
      var eventBus = new EventBus();
      var count = 0;
      eventBus.on("test", function() {
        count++;
      });
      eventBus.on("test", function() {
        count++;
      });
      eventBus.dispatch("test");
      expect(count).toEqual(2);
    });
    it("dispatch to detached", function() {
      var eventBus = new EventBus();
      var count = 0;
      var listener = function() {
        count++;
      };
      eventBus.on("test", listener);
      eventBus.dispatch("test");
      eventBus.off("test", listener);
      eventBus.dispatch("test");
      expect(count).toEqual(1);
    });
    it("dispatch to wrong detached", function() {
      var eventBus = new EventBus();
      var count = 0;
      eventBus.on("test", function() {
        count++;
      });
      eventBus.dispatch("test");
      eventBus.off("test", function() {
        count++;
      });
      eventBus.dispatch("test");
      expect(count).toEqual(2);
    });
    it("dispatch to detached during handling", function() {
      var eventBus = new EventBus();
      var count = 0;
      var listener1 = function() {
        eventBus.off("test", listener2);
        count++;
      };
      var listener2 = function() {
        eventBus.off("test", listener1);
        count++;
      };
      eventBus.on("test", listener1);
      eventBus.on("test", listener2);
      eventBus.dispatch("test");
      eventBus.dispatch("test");
      expect(count).toEqual(2);
    });

    it("should not, by default, re-dispatch to DOM", function(done) {
      if (isNodeJS) {
        pending("Document in not supported in Node.js.");
      }
      const eventBus = new EventBus();
      let count = 0;
      eventBus.on("test", function(evt) {
        expect(evt).toEqual(undefined);
        count++;
      });
      function domEventListener() {
        done.fail("shall not dispatch DOM event.");
      }
      document.addEventListener("test", domEventListener);

      eventBus.dispatch("test");

      Promise.resolve().then(() => {
        expect(count).toEqual(1);

        document.removeEventListener("test", domEventListener);
        done();
      });
    });
    it("should re-dispatch to DOM", function(done) {
      if (isNodeJS) {
        pending("Document in not supported in Node.js.");
      }
      const eventBus = new EventBus({ dispatchToDOM: true });
      let count = 0;
      eventBus.on("test", function(evt) {
        expect(evt).toEqual(undefined);
        count++;
      });
      function domEventListener(evt) {
        expect(evt.detail).toEqual({});
        count++;
      }
      document.addEventListener("test", domEventListener);

      eventBus.dispatch("test");

      Promise.resolve().then(() => {
        expect(count).toEqual(2);

        document.removeEventListener("test", domEventListener);
        done();
      });
    });
    it("should re-dispatch to DOM, with arguments (without internal listeners)", function(done) {
      if (isNodeJS) {
        pending("Document in not supported in Node.js.");
      }
      const eventBus = new EventBus({ dispatchToDOM: true });
      let count = 0;
      function domEventListener(evt) {
        expect(evt.detail).toEqual({ abc: 123 });
        count++;
      }
      document.addEventListener("test", domEventListener);

      eventBus.dispatch("test", {
        abc: 123,
      });

      Promise.resolve().then(() => {
        expect(count).toEqual(1);

        document.removeEventListener("test", domEventListener);
        done();
      });
    });
  });

  describe("isValidRotation", function() {
    it("should reject non-integer angles", function() {
      expect(isValidRotation()).toEqual(false);
      expect(isValidRotation(null)).toEqual(false);
      expect(isValidRotation(NaN)).toEqual(false);
      expect(isValidRotation([90])).toEqual(false);
      expect(isValidRotation("90")).toEqual(false);
      expect(isValidRotation(90.5)).toEqual(false);
    });

    it("should reject non-multiple of 90 degree angles", function() {
      expect(isValidRotation(45)).toEqual(false);
      expect(isValidRotation(-123)).toEqual(false);
    });

    it("should accept valid angles", function() {
      expect(isValidRotation(0)).toEqual(true);
      expect(isValidRotation(90)).toEqual(true);
      expect(isValidRotation(-270)).toEqual(true);
      expect(isValidRotation(540)).toEqual(true);
    });
  });

  describe("isPortraitOrientation", function() {
    it("should be portrait orientation", function() {
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

    it("should be landscape orientation", function() {
      expect(
        isPortraitOrientation({
          width: 600,
          height: 300,
        })
      ).toEqual(false);
    });
  });

  describe("waitOnEventOrTimeout", function() {
    let eventBus;

    beforeAll(function(done) {
      eventBus = new EventBus();
      done();
    });

    afterAll(function() {
      eventBus = null;
    });

    it("should reject invalid parameters", function(done) {
      const invalidTarget = waitOnEventOrTimeout({
        target: "window",
        name: "DOMContentLoaded",
      }).then(
        function() {
          throw new Error("Should reject invalid parameters.");
        },
        function(reason) {
          expect(reason instanceof Error).toEqual(true);
        }
      );

      const invalidName = waitOnEventOrTimeout({
        target: eventBus,
        name: "",
      }).then(
        function() {
          throw new Error("Should reject invalid parameters.");
        },
        function(reason) {
          expect(reason instanceof Error).toEqual(true);
        }
      );

      const invalidDelay = waitOnEventOrTimeout({
        target: eventBus,
        name: "pagerendered",
        delay: -1000,
      }).then(
        function() {
          throw new Error("Should reject invalid parameters.");
        },
        function(reason) {
          expect(reason instanceof Error).toEqual(true);
        }
      );

      Promise.all([invalidTarget, invalidName, invalidDelay]).then(
        done,
        done.fail
      );
    });

    it("should resolve on event, using the DOM", function(done) {
      if (isNodeJS) {
        pending("Document in not supported in Node.js.");
      }
      const button = document.createElement("button");

      const buttonClicked = waitOnEventOrTimeout({
        target: button,
        name: "click",
        delay: 10000,
      });
      // Immediately dispatch the expected event.
      button.click();

      buttonClicked.then(function(type) {
        expect(type).toEqual(WaitOnType.EVENT);
        done();
      }, done.fail);
    });

    it("should resolve on timeout, using the DOM", function(done) {
      if (isNodeJS) {
        pending("Document in not supported in Node.js.");
      }
      const button = document.createElement("button");

      const buttonClicked = waitOnEventOrTimeout({
        target: button,
        name: "click",
        delay: 10,
      });
      // Do *not* dispatch the event, and wait for the timeout.

      buttonClicked.then(function(type) {
        expect(type).toEqual(WaitOnType.TIMEOUT);
        done();
      }, done.fail);
    });

    it("should resolve on event, using the EventBus", function(done) {
      const pageRendered = waitOnEventOrTimeout({
        target: eventBus,
        name: "pagerendered",
        delay: 10000,
      });
      // Immediately dispatch the expected event.
      eventBus.dispatch("pagerendered");

      pageRendered.then(function(type) {
        expect(type).toEqual(WaitOnType.EVENT);
        done();
      }, done.fail);
    });

    it("should resolve on timeout, using the EventBus", function(done) {
      const pageRendered = waitOnEventOrTimeout({
        target: eventBus,
        name: "pagerendered",
        delay: 10,
      });
      // Do *not* dispatch the event, and wait for the timeout.

      pageRendered.then(function(type) {
        expect(type).toEqual(WaitOnType.TIMEOUT);
        done();
      }, done.fail);
    });
  });

  describe("getPageSizeInches", function() {
    it("gets page size (in inches)", function() {
      const page = {
        view: [0, 0, 595.28, 841.89],
        userUnit: 1.0,
        rotate: 0,
      };
      const { width, height } = getPageSizeInches(page);

      expect(+width.toPrecision(3)).toEqual(8.27);
      expect(+height.toPrecision(4)).toEqual(11.69);
    });

    it("gets page size (in inches), for non-default /Rotate entry", function() {
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

  describe("getVisibleElements", function() {
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
        const lineHeight = line.reduce(function(maxHeight, pair) {
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
      const views = [];
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
          const hiddenHeight =
            Math.max(0, scrollTop - viewTop) +
            Math.max(0, viewBottom - scrollBottom);
          const hiddenWidth =
            Math.max(0, scrollLeft - viewLeft) +
            Math.max(0, viewRight - scrollRight);
          const visibleArea =
            (div.clientHeight - hiddenHeight) * (div.clientWidth - hiddenWidth);
          const percent =
            ((visibleArea * 100) / div.clientHeight / div.clientWidth) | 0;
          views.push({ id: view.id, x: viewLeft, y: viewTop, view, percent });
        }
      }
      return { first: views[0], last: views[views.length - 1], views };
    }

    // This function takes a fixed layout of pages and compares the system under
    // test to the slower implementation above, for a range of scroll viewport
    // sizes and positions.
    function scrollOverDocument(pages, horizontally = false) {
      const size = pages.reduce(function(max, { div }) {
        return Math.max(
          max,
          horizontally
            ? div.offsetLeft + div.clientLeft + div.clientWidth
            : div.offsetTop + div.clientTop + div.clientHeight
        );
      }, 0);
      // The numbers (7 and 5) are mostly arbitrary, not magic: increase them to
      // make scrollOverDocument tests faster, decrease them to make the tests
      // more scrupulous, and keep them coprime to reduce the chance of missing
      // weird edge case bugs.
      for (let i = 0; i < size; i += 7) {
        // The screen height (or width) here (j - i) doubles on each inner loop
        // iteration; again, this is just to test an interesting range of cases
        // without slowing the tests down to check every possible case.
        for (let j = i + 5; j < size; j += j - i) {
          const scroll = horizontally
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
            getVisibleElements(scroll, pages, false, horizontally)
          ).toEqual(slowGetVisibleElements(scroll, pages));
        }
      }
    }

    it("with pages of varying height", function() {
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

    it("widescreen challenge", function() {
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

    it("works with horizontal scrolling", function() {
      const pages = makePages([
        [
          [10, 50],
          [20, 20],
          [30, 10],
        ],
      ]);
      scrollOverDocument(pages, true);
    });

    it("handles `sortByVisibility` correctly", function() {
      const scrollEl = {
        scrollTop: 75,
        scrollLeft: 0,
        clientHeight: 750,
        clientWidth: 1500,
      };
      const views = makePages([[[100, 150]], [[100, 150]], [[100, 150]]]);

      const visible = getVisibleElements(scrollEl, views);
      const visibleSorted = getVisibleElements(
        scrollEl,
        views,
        /* sortByVisibility = */ true
      );

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

    it("handles views being empty", function() {
      const scrollEl = {
        scrollTop: 10,
        scrollLeft: 0,
        clientHeight: 750,
        clientWidth: 1500,
      };
      const views = [];

      expect(getVisibleElements(scrollEl, views)).toEqual({
        first: undefined,
        last: undefined,
        views: [],
      });
    });

    it("handles all views being hidden (without errors)", function() {
      const scrollEl = {
        scrollTop: 100000,
        scrollLeft: 0,
        clientHeight: 750,
        clientWidth: 1500,
      };
      const views = makePages([[[100, 150]], [[100, 150]], [[100, 150]]]);

      expect(getVisibleElements(scrollEl, views)).toEqual({
        first: undefined,
        last: undefined,
        views: [],
      });
    });

    // This sub-suite is for a notionally internal helper function for
    // getVisibleElements.
    describe("backtrackBeforeAllVisibleElements", function() {
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
      it("handles case 1", function() {
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

      it("handles case 2", function() {
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

      it("handles case 3", function() {
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

      it("handles case 4", function() {
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

  describe("moveToEndOfArray", function() {
    it("works on empty arrays", function() {
      const data = [];
      moveToEndOfArray(data, function() {});
      expect(data).toEqual([]);
    });

    it("works when moving everything", function() {
      const data = [1, 2, 3, 4, 5];
      moveToEndOfArray(data, function() {
        return true;
      });
      expect(data).toEqual([1, 2, 3, 4, 5]);
    });

    it("works when moving some things", function() {
      const data = [1, 2, 3, 4, 5];
      moveToEndOfArray(data, function(x) {
        return x % 2 === 0;
      });
      expect(data).toEqual([1, 3, 5, 2, 4]);
    });

    it("works when moving one thing", function() {
      const data = [1, 2, 3, 4, 5];
      moveToEndOfArray(data, function(x) {
        return x === 1;
      });
      expect(data).toEqual([2, 3, 4, 5, 1]);
    });

    it("works when moving nothing", function() {
      const data = [1, 2, 3, 4, 5];
      moveToEndOfArray(data, function(x) {
        return x === 0;
      });
      expect(data).toEqual([1, 2, 3, 4, 5]);
    });
  });
});
