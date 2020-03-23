/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

var _ui_utils = require("../../web/ui_utils.js");

var _util = require("../../shared/util.js");

var _is_node = require("../../shared/is_node.js");

describe("ui_utils", function () {
  describe("binary search", function () {
    function isTrue(boolean) {
      return boolean;
    }

    function isGreater3(number) {
      return number > 3;
    }

    it("empty array", function () {
      expect((0, _ui_utils.binarySearchFirstItem)([], isTrue)).toEqual(0);
    });
    it("single boolean entry", function () {
      expect((0, _ui_utils.binarySearchFirstItem)([false], isTrue)).toEqual(1);
      expect((0, _ui_utils.binarySearchFirstItem)([true], isTrue)).toEqual(0);
    });
    it("three boolean entries", function () {
      expect((0, _ui_utils.binarySearchFirstItem)([true, true, true], isTrue)).toEqual(0);
      expect((0, _ui_utils.binarySearchFirstItem)([false, true, true], isTrue)).toEqual(1);
      expect((0, _ui_utils.binarySearchFirstItem)([false, false, true], isTrue)).toEqual(2);
      expect((0, _ui_utils.binarySearchFirstItem)([false, false, false], isTrue)).toEqual(3);
    });
    it("three numeric entries", function () {
      expect((0, _ui_utils.binarySearchFirstItem)([0, 1, 2], isGreater3)).toEqual(3);
      expect((0, _ui_utils.binarySearchFirstItem)([2, 3, 4], isGreater3)).toEqual(2);
      expect((0, _ui_utils.binarySearchFirstItem)([4, 5, 6], isGreater3)).toEqual(0);
    });
  });
  describe("getPDFFileNameFromURL", function () {
    it("gets PDF filename", function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)("/pdfs/file1.pdf")).toEqual("file1.pdf");
      expect((0, _ui_utils.getPDFFileNameFromURL)("http://www.example.com/pdfs/file2.pdf")).toEqual("file2.pdf");
    });
    it("gets fallback filename", function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)("/pdfs/file1.txt")).toEqual("document.pdf");
      expect((0, _ui_utils.getPDFFileNameFromURL)("http://www.example.com/pdfs/file2.txt")).toEqual("document.pdf");
    });
    it("gets custom fallback filename", function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)("/pdfs/file1.txt", "qwerty1.pdf")).toEqual("qwerty1.pdf");
      expect((0, _ui_utils.getPDFFileNameFromURL)("http://www.example.com/pdfs/file2.txt", "qwerty2.pdf")).toEqual("qwerty2.pdf");
      expect((0, _ui_utils.getPDFFileNameFromURL)("/pdfs/file3.txt", "")).toEqual("");
    });
    it("gets fallback filename when url is not a string", function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)(null)).toEqual("document.pdf");
      expect((0, _ui_utils.getPDFFileNameFromURL)(null, "file.pdf")).toEqual("file.pdf");
    });
    it("gets PDF filename from URL containing leading/trailing whitespace", function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)("   /pdfs/file1.pdf   ")).toEqual("file1.pdf");
      expect((0, _ui_utils.getPDFFileNameFromURL)("   http://www.example.com/pdfs/file2.pdf   ")).toEqual("file2.pdf");
    });
    it("gets PDF filename from query string", function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)("/pdfs/pdfs.html?name=file1.pdf")).toEqual("file1.pdf");
      expect((0, _ui_utils.getPDFFileNameFromURL)("http://www.example.com/pdfs/pdf.html?file2.pdf")).toEqual("file2.pdf");
    });
    it("gets PDF filename from hash string", function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)("/pdfs/pdfs.html#name=file1.pdf")).toEqual("file1.pdf");
      expect((0, _ui_utils.getPDFFileNameFromURL)("http://www.example.com/pdfs/pdf.html#file2.pdf")).toEqual("file2.pdf");
    });
    it("gets correct PDF filename when multiple ones are present", function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)("/pdfs/file1.pdf?name=file.pdf")).toEqual("file1.pdf");
      expect((0, _ui_utils.getPDFFileNameFromURL)("http://www.example.com/pdfs/file2.pdf#file.pdf")).toEqual("file2.pdf");
    });
    it("gets PDF filename from URI-encoded data", function () {
      var encodedUrl = encodeURIComponent("http://www.example.com/pdfs/file1.pdf");
      expect((0, _ui_utils.getPDFFileNameFromURL)(encodedUrl)).toEqual("file1.pdf");
      var encodedUrlWithQuery = encodeURIComponent("http://www.example.com/pdfs/file.txt?file2.pdf");
      expect((0, _ui_utils.getPDFFileNameFromURL)(encodedUrlWithQuery)).toEqual("file2.pdf");
    });
    it("gets PDF filename from data mistaken for URI-encoded", function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)("/pdfs/%AA.pdf")).toEqual("%AA.pdf");
      expect((0, _ui_utils.getPDFFileNameFromURL)("/pdfs/%2F.pdf")).toEqual("%2F.pdf");
    });
    it("gets PDF filename from (some) standard protocols", function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)("http://www.example.com/file1.pdf")).toEqual("file1.pdf");
      expect((0, _ui_utils.getPDFFileNameFromURL)("https://www.example.com/file2.pdf")).toEqual("file2.pdf");
      expect((0, _ui_utils.getPDFFileNameFromURL)("file:///path/to/files/file3.pdf")).toEqual("file3.pdf");
      expect((0, _ui_utils.getPDFFileNameFromURL)("ftp://www.example.com/file4.pdf")).toEqual("file4.pdf");
    });
    it('gets PDF filename from query string appended to "blob:" URL', function () {
      if (_is_node.isNodeJS) {
        pending("Blob in not supported in Node.js.");
      }

      var typedArray = new Uint8Array([1, 2, 3, 4, 5]);
      var blobUrl = (0, _util.createObjectURL)(typedArray, "application/pdf");
      expect(blobUrl.startsWith("blob:")).toEqual(true);
      expect((0, _ui_utils.getPDFFileNameFromURL)(blobUrl + "?file.pdf")).toEqual("file.pdf");
    });
    it('gets fallback filename from query string appended to "data:" URL', function () {
      var typedArray = new Uint8Array([1, 2, 3, 4, 5]);
      var dataUrl = (0, _util.createObjectURL)(typedArray, "application/pdf", true);
      expect(dataUrl.startsWith("data:")).toEqual(true);
      expect((0, _ui_utils.getPDFFileNameFromURL)(dataUrl + "?file1.pdf")).toEqual("document.pdf");
      expect((0, _ui_utils.getPDFFileNameFromURL)("     " + dataUrl + "?file2.pdf")).toEqual("document.pdf");
    });
  });
  describe("EventBus", function () {
    it("dispatch event", function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;
      eventBus.on("test", function (evt) {
        expect(evt).toEqual(undefined);
        count++;
      });
      eventBus.dispatch("test");
      expect(count).toEqual(1);
    });
    it("dispatch event with arguments", function () {
      const eventBus = new _ui_utils.EventBus();
      let count = 0;
      eventBus.on("test", function (evt) {
        expect(evt).toEqual({
          abc: 123
        });
        count++;
      });
      eventBus.dispatch("test", {
        abc: 123
      });
      expect(count).toEqual(1);
    });
    it("dispatch different event", function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;
      eventBus.on("test", function () {
        count++;
      });
      eventBus.dispatch("nottest");
      expect(count).toEqual(0);
    });
    it("dispatch event multiple times", function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;
      eventBus.dispatch("test");
      eventBus.on("test", function () {
        count++;
      });
      eventBus.dispatch("test");
      eventBus.dispatch("test");
      expect(count).toEqual(2);
    });
    it("dispatch event to multiple handlers", function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;
      eventBus.on("test", function () {
        count++;
      });
      eventBus.on("test", function () {
        count++;
      });
      eventBus.dispatch("test");
      expect(count).toEqual(2);
    });
    it("dispatch to detached", function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;

      var listener = function () {
        count++;
      };

      eventBus.on("test", listener);
      eventBus.dispatch("test");
      eventBus.off("test", listener);
      eventBus.dispatch("test");
      expect(count).toEqual(1);
    });
    it("dispatch to wrong detached", function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;
      eventBus.on("test", function () {
        count++;
      });
      eventBus.dispatch("test");
      eventBus.off("test", function () {
        count++;
      });
      eventBus.dispatch("test");
      expect(count).toEqual(2);
    });
    it("dispatch to detached during handling", function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;

      var listener1 = function () {
        eventBus.off("test", listener2);
        count++;
      };

      var listener2 = function () {
        eventBus.off("test", listener1);
        count++;
      };

      eventBus.on("test", listener1);
      eventBus.on("test", listener2);
      eventBus.dispatch("test");
      eventBus.dispatch("test");
      expect(count).toEqual(2);
    });
    it("should not, by default, re-dispatch to DOM", function (done) {
      if (_is_node.isNodeJS) {
        pending("Document in not supported in Node.js.");
      }

      const eventBus = new _ui_utils.EventBus();
      let count = 0;
      eventBus.on("test", function (evt) {
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
    it("should re-dispatch to DOM", function (done) {
      if (_is_node.isNodeJS) {
        pending("Document in not supported in Node.js.");
      }

      const eventBus = new _ui_utils.EventBus({
        dispatchToDOM: true
      });
      let count = 0;
      eventBus.on("test", function (evt) {
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
    it("should re-dispatch to DOM, with arguments (without internal listeners)", function (done) {
      if (_is_node.isNodeJS) {
        pending("Document in not supported in Node.js.");
      }

      const eventBus = new _ui_utils.EventBus({
        dispatchToDOM: true
      });
      let count = 0;

      function domEventListener(evt) {
        expect(evt.detail).toEqual({
          abc: 123
        });
        count++;
      }

      document.addEventListener("test", domEventListener);
      eventBus.dispatch("test", {
        abc: 123
      });
      Promise.resolve().then(() => {
        expect(count).toEqual(1);
        document.removeEventListener("test", domEventListener);
        done();
      });
    });
  });
  describe("isValidRotation", function () {
    it("should reject non-integer angles", function () {
      expect((0, _ui_utils.isValidRotation)()).toEqual(false);
      expect((0, _ui_utils.isValidRotation)(null)).toEqual(false);
      expect((0, _ui_utils.isValidRotation)(NaN)).toEqual(false);
      expect((0, _ui_utils.isValidRotation)([90])).toEqual(false);
      expect((0, _ui_utils.isValidRotation)("90")).toEqual(false);
      expect((0, _ui_utils.isValidRotation)(90.5)).toEqual(false);
    });
    it("should reject non-multiple of 90 degree angles", function () {
      expect((0, _ui_utils.isValidRotation)(45)).toEqual(false);
      expect((0, _ui_utils.isValidRotation)(-123)).toEqual(false);
    });
    it("should accept valid angles", function () {
      expect((0, _ui_utils.isValidRotation)(0)).toEqual(true);
      expect((0, _ui_utils.isValidRotation)(90)).toEqual(true);
      expect((0, _ui_utils.isValidRotation)(-270)).toEqual(true);
      expect((0, _ui_utils.isValidRotation)(540)).toEqual(true);
    });
  });
  describe("isPortraitOrientation", function () {
    it("should be portrait orientation", function () {
      expect((0, _ui_utils.isPortraitOrientation)({
        width: 200,
        height: 400
      })).toEqual(true);
      expect((0, _ui_utils.isPortraitOrientation)({
        width: 500,
        height: 500
      })).toEqual(true);
    });
    it("should be landscape orientation", function () {
      expect((0, _ui_utils.isPortraitOrientation)({
        width: 600,
        height: 300
      })).toEqual(false);
    });
  });
  describe("waitOnEventOrTimeout", function () {
    let eventBus;
    beforeAll(function (done) {
      eventBus = new _ui_utils.EventBus();
      done();
    });
    afterAll(function () {
      eventBus = null;
    });
    it("should reject invalid parameters", function (done) {
      const invalidTarget = (0, _ui_utils.waitOnEventOrTimeout)({
        target: "window",
        name: "DOMContentLoaded"
      }).then(function () {
        throw new Error("Should reject invalid parameters.");
      }, function (reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      const invalidName = (0, _ui_utils.waitOnEventOrTimeout)({
        target: eventBus,
        name: ""
      }).then(function () {
        throw new Error("Should reject invalid parameters.");
      }, function (reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      const invalidDelay = (0, _ui_utils.waitOnEventOrTimeout)({
        target: eventBus,
        name: "pagerendered",
        delay: -1000
      }).then(function () {
        throw new Error("Should reject invalid parameters.");
      }, function (reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      Promise.all([invalidTarget, invalidName, invalidDelay]).then(done, done.fail);
    });
    it("should resolve on event, using the DOM", function (done) {
      if (_is_node.isNodeJS) {
        pending("Document in not supported in Node.js.");
      }

      const button = document.createElement("button");
      const buttonClicked = (0, _ui_utils.waitOnEventOrTimeout)({
        target: button,
        name: "click",
        delay: 10000
      });
      button.click();
      buttonClicked.then(function (type) {
        expect(type).toEqual(_ui_utils.WaitOnType.EVENT);
        done();
      }, done.fail);
    });
    it("should resolve on timeout, using the DOM", function (done) {
      if (_is_node.isNodeJS) {
        pending("Document in not supported in Node.js.");
      }

      const button = document.createElement("button");
      const buttonClicked = (0, _ui_utils.waitOnEventOrTimeout)({
        target: button,
        name: "click",
        delay: 10
      });
      buttonClicked.then(function (type) {
        expect(type).toEqual(_ui_utils.WaitOnType.TIMEOUT);
        done();
      }, done.fail);
    });
    it("should resolve on event, using the EventBus", function (done) {
      const pageRendered = (0, _ui_utils.waitOnEventOrTimeout)({
        target: eventBus,
        name: "pagerendered",
        delay: 10000
      });
      eventBus.dispatch("pagerendered");
      pageRendered.then(function (type) {
        expect(type).toEqual(_ui_utils.WaitOnType.EVENT);
        done();
      }, done.fail);
    });
    it("should resolve on timeout, using the EventBus", function (done) {
      const pageRendered = (0, _ui_utils.waitOnEventOrTimeout)({
        target: eventBus,
        name: "pagerendered",
        delay: 10
      });
      pageRendered.then(function (type) {
        expect(type).toEqual(_ui_utils.WaitOnType.TIMEOUT);
        done();
      }, done.fail);
    });
  });
  describe("getPageSizeInches", function () {
    it("gets page size (in inches)", function () {
      const page = {
        view: [0, 0, 595.28, 841.89],
        userUnit: 1.0,
        rotate: 0
      };
      const {
        width,
        height
      } = (0, _ui_utils.getPageSizeInches)(page);
      expect(+width.toPrecision(3)).toEqual(8.27);
      expect(+height.toPrecision(4)).toEqual(11.69);
    });
    it("gets page size (in inches), for non-default /Rotate entry", function () {
      const pdfPage1 = {
        view: [0, 0, 612, 792],
        userUnit: 1,
        rotate: 0
      };
      const {
        width: width1,
        height: height1
      } = (0, _ui_utils.getPageSizeInches)(pdfPage1);
      expect(width1).toEqual(8.5);
      expect(height1).toEqual(11);
      const pdfPage2 = {
        view: [0, 0, 612, 792],
        userUnit: 1,
        rotate: 90
      };
      const {
        width: width2,
        height: height2
      } = (0, _ui_utils.getPageSizeInches)(pdfPage2);
      expect(width2).toEqual(11);
      expect(height2).toEqual(8.5);
    });
  });
  describe("getVisibleElements", function () {
    const BORDER_WIDTH = 9;
    const SPACING = 2 * BORDER_WIDTH - 7;

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
          const offsetTop = lineTop + (lineHeight - clientHeight) / 2 - BORDER_WIDTH;
          const div = {
            offsetLeft,
            offsetTop,
            clientWidth,
            clientHeight,
            clientLeft: BORDER_WIDTH,
            clientTop: BORDER_WIDTH
          };
          result.push({
            id,
            div
          });
          ++id;
          offsetLeft += clientWidth + SPACING;
        }

        lineTop += lineHeight + SPACING;
      }

      return result;
    }

    function slowGetVisibleElements(scroll, pages) {
      const views = [];
      const {
        scrollLeft,
        scrollTop
      } = scroll;
      const scrollRight = scrollLeft + scroll.clientWidth;
      const scrollBottom = scrollTop + scroll.clientHeight;

      for (const view of pages) {
        const {
          div
        } = view;
        const viewLeft = div.offsetLeft + div.clientLeft;
        const viewRight = viewLeft + div.clientWidth;
        const viewTop = div.offsetTop + div.clientTop;
        const viewBottom = viewTop + div.clientHeight;

        if (viewLeft < scrollRight && viewRight > scrollLeft && viewTop < scrollBottom && viewBottom > scrollTop) {
          const hiddenHeight = Math.max(0, scrollTop - viewTop) + Math.max(0, viewBottom - scrollBottom);
          const hiddenWidth = Math.max(0, scrollLeft - viewLeft) + Math.max(0, viewRight - scrollRight);
          const visibleArea = (div.clientHeight - hiddenHeight) * (div.clientWidth - hiddenWidth);
          const percent = visibleArea * 100 / div.clientHeight / div.clientWidth | 0;
          views.push({
            id: view.id,
            x: viewLeft,
            y: viewTop,
            view,
            percent
          });
        }
      }

      return {
        first: views[0],
        last: views[views.length - 1],
        views
      };
    }

    function scrollOverDocument(pages, horizontally = false) {
      const size = pages.reduce(function (max, {
        div
      }) {
        return Math.max(max, horizontally ? div.offsetLeft + div.clientLeft + div.clientWidth : div.offsetTop + div.clientTop + div.clientHeight);
      }, 0);

      for (let i = 0; i < size; i += 7) {
        for (let j = i + 5; j < size; j += j - i) {
          const scroll = horizontally ? {
            scrollTop: 0,
            scrollLeft: i,
            clientHeight: 10000,
            clientWidth: j - i
          } : {
            scrollTop: i,
            scrollLeft: 0,
            clientHeight: j - i,
            clientWidth: 10000
          };
          expect((0, _ui_utils.getVisibleElements)(scroll, pages, false, horizontally)).toEqual(slowGetVisibleElements(scroll, pages));
        }
      }
    }

    it("with pages of varying height", function () {
      const pages = makePages([[[50, 20], [20, 50]], [[30, 12], [12, 30]], [[20, 50], [50, 20]], [[50, 20], [20, 50]]]);
      scrollOverDocument(pages);
    });
    it("widescreen challenge", function () {
      const pages = makePages([[[10, 50], [10, 60], [10, 70], [10, 80], [10, 90]], [[10, 90], [10, 80], [10, 70], [10, 60], [10, 50]], [[10, 50], [10, 60], [10, 70], [10, 80], [10, 90]]]);
      scrollOverDocument(pages);
    });
    it("works with horizontal scrolling", function () {
      const pages = makePages([[[10, 50], [20, 20], [30, 10]]]);
      scrollOverDocument(pages, true);
    });
    it("handles `sortByVisibility` correctly", function () {
      const scrollEl = {
        scrollTop: 75,
        scrollLeft: 0,
        clientHeight: 750,
        clientWidth: 1500
      };
      const views = makePages([[[100, 150]], [[100, 150]], [[100, 150]]]);
      const visible = (0, _ui_utils.getVisibleElements)(scrollEl, views);
      const visibleSorted = (0, _ui_utils.getVisibleElements)(scrollEl, views, true);
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
        clientWidth: 1500
      };
      const views = [];
      expect((0, _ui_utils.getVisibleElements)(scrollEl, views)).toEqual({
        first: undefined,
        last: undefined,
        views: []
      });
    });
    it("handles all views being hidden (without errors)", function () {
      const scrollEl = {
        scrollTop: 100000,
        scrollLeft: 0,
        clientHeight: 750,
        clientWidth: 1500
      };
      const views = makePages([[[100, 150]], [[100, 150]], [[100, 150]]]);
      expect((0, _ui_utils.getVisibleElements)(scrollEl, views)).toEqual({
        first: undefined,
        last: undefined,
        views: []
      });
    });
    describe("backtrackBeforeAllVisibleElements", function () {
      const tallPage = [10, 50];
      const shortPage = [10, 10];
      const top1 = 20 + SPACING + 40;
      const top2 = 20 + SPACING + 10;
      it("handles case 1", function () {
        const pages = makePages([[[10, 20], [10, 20], [10, 20], [10, 20]], [tallPage, shortPage, tallPage, shortPage], [[10, 50], [10, 50], [10, 50], [10, 50]], [[10, 20], [10, 20], [10, 20], [10, 20]], [[10, 20]]]);
        const bsResult = 4;
        expect((0, _ui_utils.backtrackBeforeAllVisibleElements)(bsResult, pages, top1)).toEqual(4);
      });
      it("handles case 2", function () {
        const pages = makePages([[[10, 20], [10, 20], [10, 20], [10, 20]], [tallPage, shortPage, tallPage, tallPage], [[10, 50], [10, 50], [10, 50], [10, 50]], [[10, 20], [10, 20], [10, 20], [10, 20]]]);
        const bsResult = 6;
        expect((0, _ui_utils.backtrackBeforeAllVisibleElements)(bsResult, pages, top1)).toEqual(4);
      });
      it("handles case 3", function () {
        const pages = makePages([[[10, 20], [10, 20], [10, 20], [10, 20]], [tallPage, shortPage, tallPage, shortPage], [[10, 50], [10, 50], [10, 50], [10, 50]], [[10, 20], [10, 20], [10, 20], [10, 20]]]);
        const bsResult = 8;
        expect((0, _ui_utils.backtrackBeforeAllVisibleElements)(bsResult, pages, top1)).toEqual(4);
      });
      it("handles case 4", function () {
        const pages = makePages([[[10, 20], [10, 20], [10, 20], [10, 20]], [tallPage, shortPage, tallPage, shortPage], [[10, 50], [10, 50], [10, 50], [10, 50]], [[10, 20], [10, 20], [10, 20], [10, 20]]]);
        const bsResult = 4;
        expect((0, _ui_utils.backtrackBeforeAllVisibleElements)(bsResult, pages, top2)).toEqual(4);
      });
    });
  });
  describe("moveToEndOfArray", function () {
    it("works on empty arrays", function () {
      const data = [];
      (0, _ui_utils.moveToEndOfArray)(data, function () {});
      expect(data).toEqual([]);
    });
    it("works when moving everything", function () {
      const data = [1, 2, 3, 4, 5];
      (0, _ui_utils.moveToEndOfArray)(data, function () {
        return true;
      });
      expect(data).toEqual([1, 2, 3, 4, 5]);
    });
    it("works when moving some things", function () {
      const data = [1, 2, 3, 4, 5];
      (0, _ui_utils.moveToEndOfArray)(data, function (x) {
        return x % 2 === 0;
      });
      expect(data).toEqual([1, 3, 5, 2, 4]);
    });
    it("works when moving one thing", function () {
      const data = [1, 2, 3, 4, 5];
      (0, _ui_utils.moveToEndOfArray)(data, function (x) {
        return x === 1;
      });
      expect(data).toEqual([2, 3, 4, 5, 1]);
    });
    it("works when moving nothing", function () {
      const data = [1, 2, 3, 4, 5];
      (0, _ui_utils.moveToEndOfArray)(data, function (x) {
        return x === 0;
      });
      expect(data).toEqual([1, 2, 3, 4, 5]);
    });
  });
});