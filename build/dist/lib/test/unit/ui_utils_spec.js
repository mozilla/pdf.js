/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2019 Mozilla Foundation
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

var _ui_utils = require("../../web/ui_utils");

var _util = require("../../shared/util");

var _is_node = _interopRequireDefault(require("../../shared/is_node"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

describe('ui_utils', function () {
  describe('binary search', function () {
    function isTrue(_boolean) {
      return _boolean;
    }

    function isGreater3(number) {
      return number > 3;
    }

    it('empty array', function () {
      expect((0, _ui_utils.binarySearchFirstItem)([], isTrue)).toEqual(0);
    });
    it('single boolean entry', function () {
      expect((0, _ui_utils.binarySearchFirstItem)([false], isTrue)).toEqual(1);
      expect((0, _ui_utils.binarySearchFirstItem)([true], isTrue)).toEqual(0);
    });
    it('three boolean entries', function () {
      expect((0, _ui_utils.binarySearchFirstItem)([true, true, true], isTrue)).toEqual(0);
      expect((0, _ui_utils.binarySearchFirstItem)([false, true, true], isTrue)).toEqual(1);
      expect((0, _ui_utils.binarySearchFirstItem)([false, false, true], isTrue)).toEqual(2);
      expect((0, _ui_utils.binarySearchFirstItem)([false, false, false], isTrue)).toEqual(3);
    });
    it('three numeric entries', function () {
      expect((0, _ui_utils.binarySearchFirstItem)([0, 1, 2], isGreater3)).toEqual(3);
      expect((0, _ui_utils.binarySearchFirstItem)([2, 3, 4], isGreater3)).toEqual(2);
      expect((0, _ui_utils.binarySearchFirstItem)([4, 5, 6], isGreater3)).toEqual(0);
    });
  });
  describe('getPDFFileNameFromURL', function () {
    it('gets PDF filename', function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)('/pdfs/file1.pdf')).toEqual('file1.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('http://www.example.com/pdfs/file2.pdf')).toEqual('file2.pdf');
    });
    it('gets fallback filename', function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)('/pdfs/file1.txt')).toEqual('document.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('http://www.example.com/pdfs/file2.txt')).toEqual('document.pdf');
    });
    it('gets custom fallback filename', function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)('/pdfs/file1.txt', 'qwerty1.pdf')).toEqual('qwerty1.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('http://www.example.com/pdfs/file2.txt', 'qwerty2.pdf')).toEqual('qwerty2.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('/pdfs/file3.txt', '')).toEqual('');
    });
    it('gets fallback filename when url is not a string', function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)(null)).toEqual('document.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)(null, 'file.pdf')).toEqual('file.pdf');
    });
    it('gets PDF filename from URL containing leading/trailing whitespace', function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)('   /pdfs/file1.pdf   ')).toEqual('file1.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('   http://www.example.com/pdfs/file2.pdf   ')).toEqual('file2.pdf');
    });
    it('gets PDF filename from query string', function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)('/pdfs/pdfs.html?name=file1.pdf')).toEqual('file1.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('http://www.example.com/pdfs/pdf.html?file2.pdf')).toEqual('file2.pdf');
    });
    it('gets PDF filename from hash string', function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)('/pdfs/pdfs.html#name=file1.pdf')).toEqual('file1.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('http://www.example.com/pdfs/pdf.html#file2.pdf')).toEqual('file2.pdf');
    });
    it('gets correct PDF filename when multiple ones are present', function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)('/pdfs/file1.pdf?name=file.pdf')).toEqual('file1.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('http://www.example.com/pdfs/file2.pdf#file.pdf')).toEqual('file2.pdf');
    });
    it('gets PDF filename from URI-encoded data', function () {
      var encodedUrl = encodeURIComponent('http://www.example.com/pdfs/file1.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)(encodedUrl)).toEqual('file1.pdf');
      var encodedUrlWithQuery = encodeURIComponent('http://www.example.com/pdfs/file.txt?file2.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)(encodedUrlWithQuery)).toEqual('file2.pdf');
    });
    it('gets PDF filename from data mistaken for URI-encoded', function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)('/pdfs/%AA.pdf')).toEqual('%AA.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('/pdfs/%2F.pdf')).toEqual('%2F.pdf');
    });
    it('gets PDF filename from (some) standard protocols', function () {
      expect((0, _ui_utils.getPDFFileNameFromURL)('http://www.example.com/file1.pdf')).toEqual('file1.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('https://www.example.com/file2.pdf')).toEqual('file2.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('file:///path/to/files/file3.pdf')).toEqual('file3.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('ftp://www.example.com/file4.pdf')).toEqual('file4.pdf');
    });
    it('gets PDF filename from query string appended to "blob:" URL', function () {
      if ((0, _is_node["default"])()) {
        pending('Blob in not supported in Node.js.');
      }

      var typedArray = new Uint8Array([1, 2, 3, 4, 5]);
      var blobUrl = (0, _util.createObjectURL)(typedArray, 'application/pdf');
      expect(blobUrl.startsWith('blob:')).toEqual(true);
      expect((0, _ui_utils.getPDFFileNameFromURL)(blobUrl + '?file.pdf')).toEqual('file.pdf');
    });
    it('gets fallback filename from query string appended to "data:" URL', function () {
      var typedArray = new Uint8Array([1, 2, 3, 4, 5]);
      var dataUrl = (0, _util.createObjectURL)(typedArray, 'application/pdf', true);
      expect(dataUrl.startsWith('data:')).toEqual(true);
      expect((0, _ui_utils.getPDFFileNameFromURL)(dataUrl + '?file1.pdf')).toEqual('document.pdf');
      expect((0, _ui_utils.getPDFFileNameFromURL)('     ' + dataUrl + '?file2.pdf')).toEqual('document.pdf');
    });
  });
  describe('EventBus', function () {
    it('dispatch event', function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;
      eventBus.on('test', function (evt) {
        expect(evt).toEqual(undefined);
        count++;
      });
      eventBus.dispatch('test');
      expect(count).toEqual(1);
    });
    it('dispatch event with arguments', function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;
      eventBus.on('test', function (evt) {
        expect(evt).toEqual({
          abc: 123
        });
        count++;
      });
      eventBus.dispatch('test', {
        abc: 123
      });
      expect(count).toEqual(1);
    });
    it('dispatch different event', function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;
      eventBus.on('test', function () {
        count++;
      });
      eventBus.dispatch('nottest');
      expect(count).toEqual(0);
    });
    it('dispatch event multiple times', function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;
      eventBus.dispatch('test');
      eventBus.on('test', function () {
        count++;
      });
      eventBus.dispatch('test');
      eventBus.dispatch('test');
      expect(count).toEqual(2);
    });
    it('dispatch event to multiple handlers', function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;
      eventBus.on('test', function () {
        count++;
      });
      eventBus.on('test', function () {
        count++;
      });
      eventBus.dispatch('test');
      expect(count).toEqual(2);
    });
    it('dispatch to detached', function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;

      var listener = function listener() {
        count++;
      };

      eventBus.on('test', listener);
      eventBus.dispatch('test');
      eventBus.off('test', listener);
      eventBus.dispatch('test');
      expect(count).toEqual(1);
    });
    it('dispatch to wrong detached', function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;
      eventBus.on('test', function () {
        count++;
      });
      eventBus.dispatch('test');
      eventBus.off('test', function () {
        count++;
      });
      eventBus.dispatch('test');
      expect(count).toEqual(2);
    });
    it('dispatch to detached during handling', function () {
      var eventBus = new _ui_utils.EventBus();
      var count = 0;

      var listener1 = function listener1() {
        eventBus.off('test', listener2);
        count++;
      };

      var listener2 = function listener2() {
        eventBus.off('test', listener1);
        count++;
      };

      eventBus.on('test', listener1);
      eventBus.on('test', listener2);
      eventBus.dispatch('test');
      eventBus.dispatch('test');
      expect(count).toEqual(2);
    });
    it('should not, by default, re-dispatch to DOM', function (done) {
      if ((0, _is_node["default"])()) {
        pending('Document in not supported in Node.js.');
      }

      var eventBus = new _ui_utils.EventBus();
      var count = 0;
      eventBus.on('test', function (evt) {
        expect(evt).toEqual(undefined);
        count++;
      });

      function domEventListener() {
        done.fail('shall not dispatch DOM event.');
      }

      document.addEventListener('test', domEventListener);
      eventBus.dispatch('test');
      Promise.resolve().then(function () {
        expect(count).toEqual(1);
        document.removeEventListener('test', domEventListener);
        done();
      });
    });
    it('should re-dispatch to DOM', function (done) {
      if ((0, _is_node["default"])()) {
        pending('Document in not supported in Node.js.');
      }

      var eventBus = new _ui_utils.EventBus({
        dispatchToDOM: true
      });
      var count = 0;
      eventBus.on('test', function (evt) {
        expect(evt).toEqual(undefined);
        count++;
      });

      function domEventListener(evt) {
        expect(evt.detail).toEqual({});
        count++;
      }

      document.addEventListener('test', domEventListener);
      eventBus.dispatch('test');
      Promise.resolve().then(function () {
        expect(count).toEqual(2);
        document.removeEventListener('test', domEventListener);
        done();
      });
    });
    it('should re-dispatch to DOM, with arguments (without internal listeners)', function (done) {
      if ((0, _is_node["default"])()) {
        pending('Document in not supported in Node.js.');
      }

      var eventBus = new _ui_utils.EventBus({
        dispatchToDOM: true
      });
      var count = 0;

      function domEventListener(evt) {
        expect(evt.detail).toEqual({
          abc: 123
        });
        count++;
      }

      document.addEventListener('test', domEventListener);
      eventBus.dispatch('test', {
        abc: 123
      });
      Promise.resolve().then(function () {
        expect(count).toEqual(1);
        document.removeEventListener('test', domEventListener);
        done();
      });
    });
  });
  describe('isValidRotation', function () {
    it('should reject non-integer angles', function () {
      expect((0, _ui_utils.isValidRotation)()).toEqual(false);
      expect((0, _ui_utils.isValidRotation)(null)).toEqual(false);
      expect((0, _ui_utils.isValidRotation)(NaN)).toEqual(false);
      expect((0, _ui_utils.isValidRotation)([90])).toEqual(false);
      expect((0, _ui_utils.isValidRotation)('90')).toEqual(false);
      expect((0, _ui_utils.isValidRotation)(90.5)).toEqual(false);
    });
    it('should reject non-multiple of 90 degree angles', function () {
      expect((0, _ui_utils.isValidRotation)(45)).toEqual(false);
      expect((0, _ui_utils.isValidRotation)(-123)).toEqual(false);
    });
    it('should accept valid angles', function () {
      expect((0, _ui_utils.isValidRotation)(0)).toEqual(true);
      expect((0, _ui_utils.isValidRotation)(90)).toEqual(true);
      expect((0, _ui_utils.isValidRotation)(-270)).toEqual(true);
      expect((0, _ui_utils.isValidRotation)(540)).toEqual(true);
    });
  });
  describe('isPortraitOrientation', function () {
    it('should be portrait orientation', function () {
      expect((0, _ui_utils.isPortraitOrientation)({
        width: 200,
        height: 400
      })).toEqual(true);
      expect((0, _ui_utils.isPortraitOrientation)({
        width: 500,
        height: 500
      })).toEqual(true);
    });
    it('should be landscape orientation', function () {
      expect((0, _ui_utils.isPortraitOrientation)({
        width: 600,
        height: 300
      })).toEqual(false);
    });
  });
  describe('waitOnEventOrTimeout', function () {
    var eventBus;
    beforeAll(function (done) {
      eventBus = new _ui_utils.EventBus();
      done();
    });
    afterAll(function () {
      eventBus = null;
    });
    it('should reject invalid parameters', function (done) {
      var invalidTarget = (0, _ui_utils.waitOnEventOrTimeout)({
        target: 'window',
        name: 'DOMContentLoaded'
      }).then(function () {
        throw new Error('Should reject invalid parameters.');
      }, function (reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      var invalidName = (0, _ui_utils.waitOnEventOrTimeout)({
        target: eventBus,
        name: ''
      }).then(function () {
        throw new Error('Should reject invalid parameters.');
      }, function (reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      var invalidDelay = (0, _ui_utils.waitOnEventOrTimeout)({
        target: eventBus,
        name: 'pagerendered',
        delay: -1000
      }).then(function () {
        throw new Error('Should reject invalid parameters.');
      }, function (reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      Promise.all([invalidTarget, invalidName, invalidDelay]).then(done, done.fail);
    });
    it('should resolve on event, using the DOM', function (done) {
      if ((0, _is_node["default"])()) {
        pending('Document in not supported in Node.js.');
      }

      var button = document.createElement('button');
      var buttonClicked = (0, _ui_utils.waitOnEventOrTimeout)({
        target: button,
        name: 'click',
        delay: 10000
      });
      button.click();
      buttonClicked.then(function (type) {
        expect(type).toEqual(_ui_utils.WaitOnType.EVENT);
        done();
      }, done.fail);
    });
    it('should resolve on timeout, using the DOM', function (done) {
      if ((0, _is_node["default"])()) {
        pending('Document in not supported in Node.js.');
      }

      var button = document.createElement('button');
      var buttonClicked = (0, _ui_utils.waitOnEventOrTimeout)({
        target: button,
        name: 'click',
        delay: 10
      });
      buttonClicked.then(function (type) {
        expect(type).toEqual(_ui_utils.WaitOnType.TIMEOUT);
        done();
      }, done.fail);
    });
    it('should resolve on event, using the EventBus', function (done) {
      var pageRendered = (0, _ui_utils.waitOnEventOrTimeout)({
        target: eventBus,
        name: 'pagerendered',
        delay: 10000
      });
      eventBus.dispatch('pagerendered');
      pageRendered.then(function (type) {
        expect(type).toEqual(_ui_utils.WaitOnType.EVENT);
        done();
      }, done.fail);
    });
    it('should resolve on timeout, using the EventBus', function (done) {
      var pageRendered = (0, _ui_utils.waitOnEventOrTimeout)({
        target: eventBus,
        name: 'pagerendered',
        delay: 10
      });
      pageRendered.then(function (type) {
        expect(type).toEqual(_ui_utils.WaitOnType.TIMEOUT);
        done();
      }, done.fail);
    });
  });
  describe('getPageSizeInches', function () {
    it('gets page size (in inches)', function () {
      var page = {
        view: [0, 0, 595.28, 841.89],
        userUnit: 1.0,
        rotate: 0
      };

      var _getPageSizeInches = (0, _ui_utils.getPageSizeInches)(page),
          width = _getPageSizeInches.width,
          height = _getPageSizeInches.height;

      expect(+width.toPrecision(3)).toEqual(8.27);
      expect(+height.toPrecision(4)).toEqual(11.69);
    });
    it('gets page size (in inches), for non-default /Rotate entry', function () {
      var pdfPage1 = {
        view: [0, 0, 612, 792],
        userUnit: 1,
        rotate: 0
      };

      var _getPageSizeInches2 = (0, _ui_utils.getPageSizeInches)(pdfPage1),
          width1 = _getPageSizeInches2.width,
          height1 = _getPageSizeInches2.height;

      expect(width1).toEqual(8.5);
      expect(height1).toEqual(11);
      var pdfPage2 = {
        view: [0, 0, 612, 792],
        userUnit: 1,
        rotate: 90
      };

      var _getPageSizeInches3 = (0, _ui_utils.getPageSizeInches)(pdfPage2),
          width2 = _getPageSizeInches3.width,
          height2 = _getPageSizeInches3.height;

      expect(width2).toEqual(11);
      expect(height2).toEqual(8.5);
    });
  });
  describe('getVisibleElements', function () {
    var BORDER_WIDTH = 9;
    var SPACING = 2 * BORDER_WIDTH - 7;

    function makePages(lines) {
      var result = [];
      var lineTop = 0,
          id = 0;
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = lines[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var line = _step.value;
          var lineHeight = line.reduce(function (maxHeight, pair) {
            return Math.max(maxHeight, pair[1]);
          }, 0);
          var offsetLeft = -BORDER_WIDTH;
          var _iteratorNormalCompletion2 = true;
          var _didIteratorError2 = false;
          var _iteratorError2 = undefined;

          try {
            for (var _iterator2 = line[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
              var _step2$value = _slicedToArray(_step2.value, 2),
                  clientWidth = _step2$value[0],
                  clientHeight = _step2$value[1];

              var offsetTop = lineTop + (lineHeight - clientHeight) / 2 - BORDER_WIDTH;
              var div = {
                offsetLeft: offsetLeft,
                offsetTop: offsetTop,
                clientWidth: clientWidth,
                clientHeight: clientHeight,
                clientLeft: BORDER_WIDTH,
                clientTop: BORDER_WIDTH
              };
              result.push({
                id: id,
                div: div
              });
              ++id;
              offsetLeft += clientWidth + SPACING;
            }
          } catch (err) {
            _didIteratorError2 = true;
            _iteratorError2 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion2 && _iterator2["return"] != null) {
                _iterator2["return"]();
              }
            } finally {
              if (_didIteratorError2) {
                throw _iteratorError2;
              }
            }
          }

          lineTop += lineHeight + SPACING;
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator["return"] != null) {
            _iterator["return"]();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      return result;
    }

    function slowGetVisibleElements(scroll, pages) {
      var views = [];
      var scrollLeft = scroll.scrollLeft,
          scrollTop = scroll.scrollTop;
      var scrollRight = scrollLeft + scroll.clientWidth;
      var scrollBottom = scrollTop + scroll.clientHeight;
      var _iteratorNormalCompletion3 = true;
      var _didIteratorError3 = false;
      var _iteratorError3 = undefined;

      try {
        for (var _iterator3 = pages[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
          var view = _step3.value;
          var div = view.div;
          var viewLeft = div.offsetLeft + div.clientLeft;
          var viewRight = viewLeft + div.clientWidth;
          var viewTop = div.offsetTop + div.clientTop;
          var viewBottom = viewTop + div.clientHeight;

          if (viewLeft < scrollRight && viewRight > scrollLeft && viewTop < scrollBottom && viewBottom > scrollTop) {
            var hiddenHeight = Math.max(0, scrollTop - viewTop) + Math.max(0, viewBottom - scrollBottom);
            var hiddenWidth = Math.max(0, scrollLeft - viewLeft) + Math.max(0, viewRight - scrollRight);
            var visibleArea = (div.clientHeight - hiddenHeight) * (div.clientWidth - hiddenWidth);
            var percent = visibleArea * 100 / div.clientHeight / div.clientWidth | 0;
            views.push({
              id: view.id,
              x: viewLeft,
              y: viewTop,
              view: view,
              percent: percent
            });
          }
        }
      } catch (err) {
        _didIteratorError3 = true;
        _iteratorError3 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion3 && _iterator3["return"] != null) {
            _iterator3["return"]();
          }
        } finally {
          if (_didIteratorError3) {
            throw _iteratorError3;
          }
        }
      }

      return {
        first: views[0],
        last: views[views.length - 1],
        views: views
      };
    }

    function scrollOverDocument(pages) {
      var horizontally = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
      var size = pages.reduce(function (max, _ref) {
        var div = _ref.div;
        return Math.max(max, horizontally ? div.offsetLeft + div.clientLeft + div.clientWidth : div.offsetTop + div.clientTop + div.clientHeight);
      }, 0);

      for (var i = 0; i < size; i += 7) {
        for (var j = i + 5; j < size; j += j - i) {
          var scroll = horizontally ? {
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

    it('with pages of varying height', function () {
      var pages = makePages([[[50, 20], [20, 50]], [[30, 12], [12, 30]], [[20, 50], [50, 20]], [[50, 20], [20, 50]]]);
      scrollOverDocument(pages);
    });
    it('widescreen challenge', function () {
      var pages = makePages([[[10, 50], [10, 60], [10, 70], [10, 80], [10, 90]], [[10, 90], [10, 80], [10, 70], [10, 60], [10, 50]], [[10, 50], [10, 60], [10, 70], [10, 80], [10, 90]]]);
      scrollOverDocument(pages);
    });
    it('works with horizontal scrolling', function () {
      var pages = makePages([[[10, 50], [20, 20], [30, 10]]]);
      scrollOverDocument(pages, true);
    });
    it('handles `sortByVisibility` correctly', function () {
      var scrollEl = {
        scrollTop: 75,
        scrollLeft: 0,
        clientHeight: 750,
        clientWidth: 1500
      };
      var views = makePages([[[100, 150]], [[100, 150]], [[100, 150]]]);
      var visible = (0, _ui_utils.getVisibleElements)(scrollEl, views);
      var visibleSorted = (0, _ui_utils.getVisibleElements)(scrollEl, views, true);
      var viewsOrder = [],
          viewsSortedOrder = [];
      var _iteratorNormalCompletion4 = true;
      var _didIteratorError4 = false;
      var _iteratorError4 = undefined;

      try {
        for (var _iterator4 = visible.views[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
          var view = _step4.value;
          viewsOrder.push(view.id);
        }
      } catch (err) {
        _didIteratorError4 = true;
        _iteratorError4 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion4 && _iterator4["return"] != null) {
            _iterator4["return"]();
          }
        } finally {
          if (_didIteratorError4) {
            throw _iteratorError4;
          }
        }
      }

      var _iteratorNormalCompletion5 = true;
      var _didIteratorError5 = false;
      var _iteratorError5 = undefined;

      try {
        for (var _iterator5 = visibleSorted.views[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
          var _view = _step5.value;
          viewsSortedOrder.push(_view.id);
        }
      } catch (err) {
        _didIteratorError5 = true;
        _iteratorError5 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion5 && _iterator5["return"] != null) {
            _iterator5["return"]();
          }
        } finally {
          if (_didIteratorError5) {
            throw _iteratorError5;
          }
        }
      }

      expect(viewsOrder).toEqual([0, 1, 2]);
      expect(viewsSortedOrder).toEqual([1, 2, 0]);
    });
    it('handles views being empty', function () {
      var scrollEl = {
        scrollTop: 10,
        scrollLeft: 0,
        clientHeight: 750,
        clientWidth: 1500
      };
      var views = [];
      expect((0, _ui_utils.getVisibleElements)(scrollEl, views)).toEqual({
        first: undefined,
        last: undefined,
        views: []
      });
    });
    it('handles all views being hidden (without errors)', function () {
      var scrollEl = {
        scrollTop: 100000,
        scrollLeft: 0,
        clientHeight: 750,
        clientWidth: 1500
      };
      var views = makePages([[[100, 150]], [[100, 150]], [[100, 150]]]);
      expect((0, _ui_utils.getVisibleElements)(scrollEl, views)).toEqual({
        first: undefined,
        last: undefined,
        views: []
      });
    });
    describe('backtrackBeforeAllVisibleElements', function () {
      var tallPage = [10, 50];
      var shortPage = [10, 10];
      var top1 = 20 + SPACING + 40;
      var top2 = 20 + SPACING + 10;
      it('handles case 1', function () {
        var pages = makePages([[[10, 20], [10, 20], [10, 20], [10, 20]], [tallPage, shortPage, tallPage, shortPage], [[10, 50], [10, 50], [10, 50], [10, 50]], [[10, 20], [10, 20], [10, 20], [10, 20]], [[10, 20]]]);
        var bsResult = 4;
        expect((0, _ui_utils.backtrackBeforeAllVisibleElements)(bsResult, pages, top1)).toEqual(4);
      });
      it('handles case 2', function () {
        var pages = makePages([[[10, 20], [10, 20], [10, 20], [10, 20]], [tallPage, shortPage, tallPage, tallPage], [[10, 50], [10, 50], [10, 50], [10, 50]], [[10, 20], [10, 20], [10, 20], [10, 20]]]);
        var bsResult = 6;
        expect((0, _ui_utils.backtrackBeforeAllVisibleElements)(bsResult, pages, top1)).toEqual(4);
      });
      it('handles case 3', function () {
        var pages = makePages([[[10, 20], [10, 20], [10, 20], [10, 20]], [tallPage, shortPage, tallPage, shortPage], [[10, 50], [10, 50], [10, 50], [10, 50]], [[10, 20], [10, 20], [10, 20], [10, 20]]]);
        var bsResult = 8;
        expect((0, _ui_utils.backtrackBeforeAllVisibleElements)(bsResult, pages, top1)).toEqual(4);
      });
      it('handles case 4', function () {
        var pages = makePages([[[10, 20], [10, 20], [10, 20], [10, 20]], [tallPage, shortPage, tallPage, shortPage], [[10, 50], [10, 50], [10, 50], [10, 50]], [[10, 20], [10, 20], [10, 20], [10, 20]]]);
        var bsResult = 4;
        expect((0, _ui_utils.backtrackBeforeAllVisibleElements)(bsResult, pages, top2)).toEqual(4);
      });
    });
  });
  describe('moveToEndOfArray', function () {
    it('works on empty arrays', function () {
      var data = [];
      (0, _ui_utils.moveToEndOfArray)(data, function () {});
      expect(data).toEqual([]);
    });
    it('works when moving everything', function () {
      var data = [1, 2, 3, 4, 5];
      (0, _ui_utils.moveToEndOfArray)(data, function () {
        return true;
      });
      expect(data).toEqual([1, 2, 3, 4, 5]);
    });
    it('works when moving some things', function () {
      var data = [1, 2, 3, 4, 5];
      (0, _ui_utils.moveToEndOfArray)(data, function (x) {
        return x % 2 === 0;
      });
      expect(data).toEqual([1, 3, 5, 2, 4]);
    });
    it('works when moving one thing', function () {
      var data = [1, 2, 3, 4, 5];
      (0, _ui_utils.moveToEndOfArray)(data, function (x) {
        return x === 1;
      });
      expect(data).toEqual([2, 3, 4, 5, 1]);
    });
    it('works when moving nothing', function () {
      var data = [1, 2, 3, 4, 5];
      (0, _ui_utils.moveToEndOfArray)(data, function (x) {
        return x === 0;
      });
      expect(data).toEqual([1, 2, 3, 4, 5]);
    });
  });
});