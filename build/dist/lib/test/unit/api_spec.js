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

var _regenerator = _interopRequireDefault(require("@babel/runtime/regenerator"));

var _test_utils = require("./test_utils");

var _util = require("../../shared/util");

var _display_utils = require("../../display/display_utils");

var _api = require("../../display/api");

var _worker_options = require("../../display/worker_options");

var _is_node = _interopRequireDefault(require("../../shared/is_node"));

var _metadata = require("../../display/metadata");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

describe('api', function () {
  var basicApiFileName = 'basicapi.pdf';
  var basicApiFileLength = 105779;
  var basicApiGetDocumentParams = (0, _test_utils.buildGetDocumentParams)(basicApiFileName);
  var CanvasFactory;
  beforeAll(function (done) {
    if ((0, _is_node["default"])()) {
      CanvasFactory = new _test_utils.NodeCanvasFactory();
    } else {
      CanvasFactory = new _display_utils.DOMCanvasFactory();
    }

    done();
  });
  afterAll(function (done) {
    CanvasFactory = null;
    done();
  });

  function waitSome(callback) {
    var WAIT_TIMEOUT = 10;
    setTimeout(function () {
      callback();
    }, WAIT_TIMEOUT);
  }

  describe('getDocument', function () {
    it('creates pdf doc from URL', function (done) {
      var loadingTask = (0, _api.getDocument)(basicApiGetDocumentParams);
      var progressReportedCapability = (0, _util.createPromiseCapability)();

      loadingTask.onProgress = function (progressData) {
        if (!progressReportedCapability.settled) {
          progressReportedCapability.resolve(progressData);
        }
      };

      var promises = [progressReportedCapability.promise, loadingTask.promise];
      Promise.all(promises).then(function (data) {
        expect(data[0].loaded / data[0].total >= 0).toEqual(true);
        expect(data[1] instanceof _api.PDFDocumentProxy).toEqual(true);
        expect(loadingTask).toEqual(data[1].loadingTask);
        loadingTask.destroy().then(done);
      })["catch"](done.fail);
    });
    it('creates pdf doc from URL and aborts before worker initialized', function (done) {
      var loadingTask = (0, _api.getDocument)(basicApiGetDocumentParams);
      var destroyed = loadingTask.destroy();
      loadingTask.promise.then(function (reason) {
        done.fail('shall fail loading');
      })["catch"](function (reason) {
        expect(true).toEqual(true);
        destroyed.then(done);
      });
    });
    it('creates pdf doc from URL and aborts loading after worker initialized', function (done) {
      var loadingTask = (0, _api.getDocument)(basicApiGetDocumentParams);

      var destroyed = loadingTask._worker.promise.then(function () {
        return loadingTask.destroy();
      });

      destroyed.then(function (data) {
        expect(true).toEqual(true);
        done();
      })["catch"](done.fail);
    });
    it('creates pdf doc from typed array', function (done) {
      var typedArrayPdfPromise;

      if ((0, _is_node["default"])()) {
        typedArrayPdfPromise = _test_utils.NodeFileReaderFactory.fetch({
          path: _test_utils.TEST_PDFS_PATH.node + basicApiFileName
        });
      } else {
        typedArrayPdfPromise = _test_utils.DOMFileReaderFactory.fetch({
          path: _test_utils.TEST_PDFS_PATH.dom + basicApiFileName
        });
      }

      typedArrayPdfPromise.then(function (typedArrayPdf) {
        expect(typedArrayPdf.length).toEqual(basicApiFileLength);
        var loadingTask = (0, _api.getDocument)(typedArrayPdf);
        var progressReportedCapability = (0, _util.createPromiseCapability)();

        loadingTask.onProgress = function (data) {
          progressReportedCapability.resolve(data);
        };

        return Promise.all([loadingTask.promise, progressReportedCapability.promise]).then(function (data) {
          expect(data[0] instanceof _api.PDFDocumentProxy).toEqual(true);
          expect(data[1].loaded / data[1].total).toEqual(1);
          loadingTask.destroy().then(done);
        });
      })["catch"](done.fail);
    });
    it('creates pdf doc from invalid PDF file', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('bug1020226.pdf'));
      loadingTask.promise.then(function () {
        done.fail('shall fail loading');
      })["catch"](function (error) {
        expect(error instanceof _util.InvalidPDFException).toEqual(true);
        loadingTask.destroy().then(done);
      });
    });
    it('creates pdf doc from non-existent URL', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('non-existent.pdf'));
      loadingTask.promise.then(function (error) {
        done.fail('shall fail loading');
      })["catch"](function (error) {
        expect(error instanceof _util.MissingPDFException).toEqual(true);
        loadingTask.destroy().then(done);
      });
    });
    it('creates pdf doc from PDF file protected with user and owner password', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('pr6531_1.pdf'));
      var passwordNeededCapability = (0, _util.createPromiseCapability)();
      var passwordIncorrectCapability = (0, _util.createPromiseCapability)();

      loadingTask.onPassword = function (updatePassword, reason) {
        if (reason === _util.PasswordResponses.NEED_PASSWORD && !passwordNeededCapability.settled) {
          passwordNeededCapability.resolve();
          updatePassword('qwerty');
          return;
        }

        if (reason === _util.PasswordResponses.INCORRECT_PASSWORD && !passwordIncorrectCapability.settled) {
          passwordIncorrectCapability.resolve();
          updatePassword('asdfasdf');
          return;
        }

        expect(false).toEqual(true);
      };

      var promises = [passwordNeededCapability.promise, passwordIncorrectCapability.promise, loadingTask.promise];
      Promise.all(promises).then(function (data) {
        expect(data[2] instanceof _api.PDFDocumentProxy).toEqual(true);
        loadingTask.destroy().then(done);
      })["catch"](done.fail);
    });
    it('creates pdf doc from PDF file protected with only a user password', function (done) {
      var filename = 'pr6531_2.pdf';
      var passwordNeededLoadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(filename, {
        password: ''
      }));
      var result1 = passwordNeededLoadingTask.promise.then(function () {
        done.fail('shall fail with no password');
        return Promise.reject(new Error('loadingTask should be rejected'));
      }, function (data) {
        expect(data instanceof _util.PasswordException).toEqual(true);
        expect(data.code).toEqual(_util.PasswordResponses.NEED_PASSWORD);
        return passwordNeededLoadingTask.destroy();
      });
      var passwordIncorrectLoadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(filename, {
        password: 'qwerty'
      }));
      var result2 = passwordIncorrectLoadingTask.promise.then(function () {
        done.fail('shall fail with wrong password');
        return Promise.reject(new Error('loadingTask should be rejected'));
      }, function (data) {
        expect(data instanceof _util.PasswordException).toEqual(true);
        expect(data.code).toEqual(_util.PasswordResponses.INCORRECT_PASSWORD);
        return passwordIncorrectLoadingTask.destroy();
      });
      var passwordAcceptedLoadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(filename, {
        password: 'asdfasdf'
      }));
      var result3 = passwordAcceptedLoadingTask.promise.then(function (data) {
        expect(data instanceof _api.PDFDocumentProxy).toEqual(true);
        return passwordAcceptedLoadingTask.destroy();
      });
      Promise.all([result1, result2, result3]).then(function () {
        done();
      })["catch"](done.fail);
    });
    it('creates pdf doc from password protected PDF file and aborts/throws ' + 'in the onPassword callback (issue 7806)', function (done) {
      var filename = 'issue3371.pdf';
      var passwordNeededLoadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(filename));
      var passwordIncorrectLoadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(filename, {
        password: 'qwerty'
      }));
      var passwordNeededDestroyed;

      passwordNeededLoadingTask.onPassword = function (callback, reason) {
        if (reason === _util.PasswordResponses.NEED_PASSWORD) {
          passwordNeededDestroyed = passwordNeededLoadingTask.destroy();
          return;
        }

        expect(false).toEqual(true);
      };

      var result1 = passwordNeededLoadingTask.promise.then(function () {
        done.fail('shall fail since the loadingTask should be destroyed');
        return Promise.reject(new Error('loadingTask should be rejected'));
      }, function (reason) {
        expect(reason instanceof _util.PasswordException).toEqual(true);
        expect(reason.code).toEqual(_util.PasswordResponses.NEED_PASSWORD);
        return passwordNeededDestroyed;
      });

      passwordIncorrectLoadingTask.onPassword = function (callback, reason) {
        if (reason === _util.PasswordResponses.INCORRECT_PASSWORD) {
          throw new Error('Incorrect password');
        }

        expect(false).toEqual(true);
      };

      var result2 = passwordIncorrectLoadingTask.promise.then(function () {
        done.fail('shall fail since the onPassword callback should throw');
        return Promise.reject(new Error('loadingTask should be rejected'));
      }, function (reason) {
        expect(reason instanceof _util.PasswordException).toEqual(true);
        expect(reason.code).toEqual(_util.PasswordResponses.INCORRECT_PASSWORD);
        return passwordIncorrectLoadingTask.destroy();
      });
      Promise.all([result1, result2]).then(function () {
        done();
      })["catch"](done.fail);
    });
  });
  describe('PDFWorker', function () {
    it('worker created or destroyed', function (done) {
      if ((0, _is_node["default"])()) {
        pending('Worker is not supported in Node.js.');
      }

      var worker = new _api.PDFWorker({
        name: 'test1'
      });
      worker.promise.then(function () {
        expect(worker.name).toEqual('test1');
        expect(!!worker.port).toEqual(true);
        expect(worker.destroyed).toEqual(false);
        expect(!!worker._webWorker).toEqual(true);
        expect(worker.port === worker._webWorker).toEqual(true);
        worker.destroy();
        expect(!!worker.port).toEqual(false);
        expect(worker.destroyed).toEqual(true);
        done();
      })["catch"](done.fail);
    });
    it('worker created or destroyed by getDocument', function (done) {
      if ((0, _is_node["default"])()) {
        pending('Worker is not supported in Node.js.');
      }

      var loadingTask = (0, _api.getDocument)(basicApiGetDocumentParams);
      var worker;
      loadingTask.promise.then(function () {
        worker = loadingTask._worker;
        expect(!!worker).toEqual(true);
      });
      var destroyPromise = loadingTask.promise.then(function () {
        return loadingTask.destroy();
      });
      destroyPromise.then(function () {
        var destroyedWorker = loadingTask._worker;
        expect(!!destroyedWorker).toEqual(false);
        expect(worker.destroyed).toEqual(true);
        done();
      })["catch"](done.fail);
    });
    it('worker created and can be used in getDocument', function (done) {
      if ((0, _is_node["default"])()) {
        pending('Worker is not supported in Node.js.');
      }

      var worker = new _api.PDFWorker({
        name: 'test1'
      });
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(basicApiFileName, {
        worker: worker
      }));
      loadingTask.promise.then(function () {
        var docWorker = loadingTask._worker;
        expect(!!docWorker).toEqual(false);
        var messageHandlerPort = loadingTask._transport.messageHandler.comObj;
        expect(messageHandlerPort === worker.port).toEqual(true);
      });
      var destroyPromise = loadingTask.promise.then(function () {
        return loadingTask.destroy();
      });
      destroyPromise.then(function () {
        expect(worker.destroyed).toEqual(false);
        worker.destroy();
        done();
      })["catch"](done.fail);
    });
    it('creates more than one worker', function (done) {
      if ((0, _is_node["default"])()) {
        pending('Worker is not supported in Node.js.');
      }

      var worker1 = new _api.PDFWorker({
        name: 'test1'
      });
      var worker2 = new _api.PDFWorker({
        name: 'test2'
      });
      var worker3 = new _api.PDFWorker({
        name: 'test3'
      });
      var ready = Promise.all([worker1.promise, worker2.promise, worker3.promise]);
      ready.then(function () {
        expect(worker1.port !== worker2.port && worker1.port !== worker3.port && worker2.port !== worker3.port).toEqual(true);
        worker1.destroy();
        worker2.destroy();
        worker3.destroy();
        done();
      })["catch"](done.fail);
    });
    it('gets current workerSrc', function () {
      if ((0, _is_node["default"])()) {
        pending('Worker is not supported in Node.js.');
      }

      var workerSrc = _api.PDFWorker.getWorkerSrc();

      expect(_typeof(workerSrc)).toEqual('string');
      expect(workerSrc).toEqual(_worker_options.GlobalWorkerOptions.workerSrc);
    });
  });
  describe('PDFDocument', function () {
    var loadingTask;
    var doc;
    beforeAll(function (done) {
      loadingTask = (0, _api.getDocument)(basicApiGetDocumentParams);
      loadingTask.promise.then(function (data) {
        doc = data;
        done();
      });
    });
    afterAll(function (done) {
      loadingTask.destroy().then(done);
    });
    it('gets number of pages', function () {
      expect(doc.numPages).toEqual(3);
    });
    it('gets fingerprint', function () {
      var fingerprint = doc.fingerprint;
      expect(_typeof(fingerprint)).toEqual('string');
      expect(fingerprint.length > 0).toEqual(true);
    });
    it('gets page', function (done) {
      var promise = doc.getPage(1);
      promise.then(function (data) {
        expect(data instanceof _api.PDFPageProxy).toEqual(true);
        expect(data.pageIndex).toEqual(0);
        done();
      })["catch"](done.fail);
    });
    it('gets non-existent page', function (done) {
      var outOfRangePromise = doc.getPage(100);
      var nonIntegerPromise = doc.getPage(2.5);
      var nonNumberPromise = doc.getPage('1');
      outOfRangePromise = outOfRangePromise.then(function () {
        throw new Error('shall fail for out-of-range pageNumber parameter');
      }, function (reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      nonIntegerPromise = nonIntegerPromise.then(function () {
        throw new Error('shall fail for non-integer pageNumber parameter');
      }, function (reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      nonNumberPromise = nonNumberPromise.then(function () {
        throw new Error('shall fail for non-number pageNumber parameter');
      }, function (reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      Promise.all([outOfRangePromise, nonIntegerPromise, nonNumberPromise]).then(function () {
        done();
      })["catch"](done.fail);
    });
    it('gets page index', function (done) {
      var ref = {
        num: 17,
        gen: 0
      };
      var promise = doc.getPageIndex(ref);
      promise.then(function (pageIndex) {
        expect(pageIndex).toEqual(1);
        done();
      })["catch"](done.fail);
    });
    it('gets invalid page index', function (done) {
      var ref = {
        num: 3,
        gen: 0
      };
      var promise = doc.getPageIndex(ref);
      promise.then(function () {
        done.fail('shall fail for invalid page reference.');
      })["catch"](function (reason) {
        expect(reason instanceof Error).toEqual(true);
        done();
      });
    });
    it('gets destinations, from /Dests dictionary', function (done) {
      var promise = doc.getDestinations();
      promise.then(function (data) {
        expect(data).toEqual({
          chapter1: [{
            gen: 0,
            num: 17
          }, {
            name: 'XYZ'
          }, 0, 841.89, null]
        });
        done();
      })["catch"](done.fail);
    });
    it('gets a destination, from /Dests dictionary', function (done) {
      var promise = doc.getDestination('chapter1');
      promise.then(function (data) {
        expect(data).toEqual([{
          gen: 0,
          num: 17
        }, {
          name: 'XYZ'
        }, 0, 841.89, null]);
        done();
      })["catch"](done.fail);
    });
    it('gets a non-existent destination, from /Dests dictionary', function (done) {
      var promise = doc.getDestination('non-existent-named-destination');
      promise.then(function (data) {
        expect(data).toEqual(null);
        done();
      })["catch"](done.fail);
    });
    it('gets destinations, from /Names (NameTree) dictionary', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('issue6204.pdf'));
      var promise = loadingTask.promise.then(function (pdfDocument) {
        return pdfDocument.getDestinations();
      });
      promise.then(function (destinations) {
        expect(destinations).toEqual({
          'Page.1': [{
            num: 1,
            gen: 0
          }, {
            name: 'XYZ'
          }, 0, 375, null],
          'Page.2': [{
            num: 6,
            gen: 0
          }, {
            name: 'XYZ'
          }, 0, 375, null]
        });
        loadingTask.destroy().then(done);
      })["catch"](done.fail);
    });
    it('gets a destination, from /Names (NameTree) dictionary', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('issue6204.pdf'));
      var promise = loadingTask.promise.then(function (pdfDocument) {
        return pdfDocument.getDestination('Page.1');
      });
      promise.then(function (destination) {
        expect(destination).toEqual([{
          num: 1,
          gen: 0
        }, {
          name: 'XYZ'
        }, 0, 375, null]);
        loadingTask.destroy().then(done);
      })["catch"](done.fail);
    });
    it('gets a non-existent destination, from /Names (NameTree) dictionary', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('issue6204.pdf'));
      var promise = loadingTask.promise.then(function (pdfDocument) {
        return pdfDocument.getDestination('non-existent-named-destination');
      });
      promise.then(function (destination) {
        expect(destination).toEqual(null);
        loadingTask.destroy().then(done);
      })["catch"](done.fail);
    });
    it('gets non-string destination', function (done) {
      var numberPromise = doc.getDestination(4.3);
      var booleanPromise = doc.getDestination(true);
      var arrayPromise = doc.getDestination([{
        num: 17,
        gen: 0
      }, {
        name: 'XYZ'
      }, 0, 841.89, null]);
      numberPromise = numberPromise.then(function () {
        throw new Error('shall fail for non-string destination.');
      }, function (reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      booleanPromise = booleanPromise.then(function () {
        throw new Error('shall fail for non-string destination.');
      }, function (reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      arrayPromise = arrayPromise.then(function () {
        throw new Error('shall fail for non-string destination.');
      }, function (reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      Promise.all([numberPromise, booleanPromise, arrayPromise]).then(done, done.fail);
    });
    it('gets non-existent page labels', function (done) {
      var promise = doc.getPageLabels();
      promise.then(function (data) {
        expect(data).toEqual(null);
        done();
      })["catch"](done.fail);
    });
    it('gets page labels', function (done) {
      var loadingTask0 = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('bug793632.pdf'));
      var promise0 = loadingTask0.promise.then(function (pdfDoc) {
        return pdfDoc.getPageLabels();
      });
      var loadingTask1 = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('issue1453.pdf'));
      var promise1 = loadingTask1.promise.then(function (pdfDoc) {
        return pdfDoc.getPageLabels();
      });
      var loadingTask2 = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('rotation.pdf'));
      var promise2 = loadingTask2.promise.then(function (pdfDoc) {
        return pdfDoc.getPageLabels();
      });
      var loadingTask3 = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('bad-PageLabels.pdf'));
      var promise3 = loadingTask3.promise.then(function (pdfDoc) {
        return pdfDoc.getPageLabels();
      });
      Promise.all([promise0, promise1, promise2, promise3]).then(function (pageLabels) {
        expect(pageLabels[0]).toEqual(['i', 'ii', 'iii', '1']);
        expect(pageLabels[1]).toEqual(['Front Page1']);
        expect(pageLabels[2]).toEqual(['1', '2']);
        expect(pageLabels[3]).toEqual(['X3']);
        Promise.all([loadingTask0.destroy(), loadingTask1.destroy(), loadingTask2.destroy(), loadingTask3.destroy()]).then(done);
      })["catch"](done.fail);
    });
    it('gets default page layout', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('tracemonkey.pdf'));
      loadingTask.promise.then(function (pdfDocument) {
        return pdfDocument.getPageLayout();
      }).then(function (mode) {
        expect(mode).toEqual('');
        loadingTask.destroy().then(done);
      })["catch"](done.fail);
    });
    it('gets non-default page layout', function (done) {
      doc.getPageLayout().then(function (mode) {
        expect(mode).toEqual('SinglePage');
        done();
      })["catch"](done.fail);
    });
    it('gets default page mode', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('tracemonkey.pdf'));
      loadingTask.promise.then(function (pdfDocument) {
        return pdfDocument.getPageMode();
      }).then(function (mode) {
        expect(mode).toEqual('UseNone');
        loadingTask.destroy().then(done);
      })["catch"](done.fail);
    });
    it('gets non-default page mode', function (done) {
      doc.getPageMode().then(function (mode) {
        expect(mode).toEqual('UseOutlines');
        done();
      })["catch"](done.fail);
    });
    it('gets default viewer preferences', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('tracemonkey.pdf'));
      loadingTask.promise.then(function (pdfDocument) {
        return pdfDocument.getViewerPreferences();
      }).then(function (prefs) {
        expect(_typeof(prefs) === 'object' && prefs !== null && (0, _util.isEmptyObj)(prefs)).toEqual(true);
        loadingTask.destroy().then(done);
      })["catch"](done.fail);
    });
    it('gets non-default viewer preferences', function (done) {
      doc.getViewerPreferences().then(function (prefs) {
        expect(prefs).toEqual({
          Direction: 'L2R'
        });
        done();
      })["catch"](done.fail);
    });
    it('gets default open action destination', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('tracemonkey.pdf'));
      loadingTask.promise.then(function (pdfDocument) {
        return pdfDocument.getOpenActionDestination();
      }).then(function (dest) {
        expect(dest).toEqual(null);
        loadingTask.destroy().then(done);
      })["catch"](done.fail);
    });
    it('gets non-default open action destination', function (done) {
      doc.getOpenActionDestination().then(function (dest) {
        expect(dest).toEqual([{
          num: 15,
          gen: 0
        }, {
          name: 'FitH'
        }, null]);
        done();
      })["catch"](done.fail);
    });
    it('gets non-existent attachments', function (done) {
      var promise = doc.getAttachments();
      promise.then(function (data) {
        expect(data).toEqual(null);
        done();
      })["catch"](done.fail);
    });
    it('gets attachments', function (done) {
      if ((0, _is_node["default"])()) {
        pending('TODO: Use a non-linked test-case.');
      }

      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('bug766138.pdf'));
      var promise = loadingTask.promise.then(function (pdfDoc) {
        return pdfDoc.getAttachments();
      });
      promise.then(function (data) {
        var attachment = data['Press Quality.joboptions'];
        expect(attachment.filename).toEqual('Press Quality.joboptions');
        expect(attachment.content instanceof Uint8Array).toBeTruthy();
        expect(attachment.content.length).toEqual(30098);
        loadingTask.destroy().then(done);
      })["catch"](done.fail);
    });
    it('gets javascript', function (done) {
      var promise = doc.getJavaScript();
      promise.then(function (data) {
        expect(data).toEqual(null);
        done();
      })["catch"](done.fail);
    });
    var viewerPrintRegExp = /\bprint\s*\(/;
    it('gets javascript with printing instructions (Print action)', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('bug1001080.pdf'));
      var promise = loadingTask.promise.then(function (doc) {
        return doc.getJavaScript();
      });
      promise.then(function (data) {
        expect(data).toEqual(['print({});']);
        expect(data[0]).toMatch(viewerPrintRegExp);
        loadingTask.destroy().then(done);
      })["catch"](done.fail);
    });
    it('gets javascript with printing instructions (JS action)', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('issue6106.pdf'));
      var promise = loadingTask.promise.then(function (doc) {
        return doc.getJavaScript();
      });
      promise.then(function (data) {
        expect(data).toEqual(['this.print({bUI:true,bSilent:false,bShrinkToFit:true});']);
        expect(data[0]).toMatch(viewerPrintRegExp);
        loadingTask.destroy().then(done);
      })["catch"](done.fail);
    });
    it('gets non-existent outline', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('tracemonkey.pdf'));
      var promise = loadingTask.promise.then(function (pdfDocument) {
        return pdfDocument.getOutline();
      });
      promise.then(function (outline) {
        expect(outline).toEqual(null);
        loadingTask.destroy().then(done);
      })["catch"](done.fail);
    });
    it('gets outline', function (done) {
      var promise = doc.getOutline();
      promise.then(function (outline) {
        expect(Array.isArray(outline)).toEqual(true);
        expect(outline.length).toEqual(2);
        var outlineItem = outline[1];
        expect(outlineItem.title).toEqual('Chapter 1');
        expect(Array.isArray(outlineItem.dest)).toEqual(true);
        expect(outlineItem.url).toEqual(null);
        expect(outlineItem.unsafeUrl).toBeUndefined();
        expect(outlineItem.newWindow).toBeUndefined();
        expect(outlineItem.bold).toEqual(true);
        expect(outlineItem.italic).toEqual(false);
        expect(outlineItem.color).toEqual(new Uint8ClampedArray([0, 64, 128]));
        expect(outlineItem.items.length).toEqual(1);
        expect(outlineItem.items[0].title).toEqual('Paragraph 1.1');
        done();
      })["catch"](done.fail);
    });
    it('gets outline containing a url', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('issue3214.pdf'));
      loadingTask.promise.then(function (pdfDocument) {
        pdfDocument.getOutline().then(function (outline) {
          expect(Array.isArray(outline)).toEqual(true);
          expect(outline.length).toEqual(5);
          var outlineItemTwo = outline[2];
          expect(_typeof(outlineItemTwo.title)).toEqual('string');
          expect(outlineItemTwo.dest).toEqual(null);
          expect(outlineItemTwo.url).toEqual('http://google.com/');
          expect(outlineItemTwo.unsafeUrl).toEqual('http://google.com');
          expect(outlineItemTwo.newWindow).toBeUndefined();
          var outlineItemOne = outline[1];
          expect(outlineItemOne.bold).toEqual(false);
          expect(outlineItemOne.italic).toEqual(true);
          expect(outlineItemOne.color).toEqual(new Uint8ClampedArray([0, 0, 0]));
          loadingTask.destroy().then(done);
        });
      })["catch"](done.fail);
    });
    it('gets non-existent permissions', function (done) {
      doc.getPermissions().then(function (permissions) {
        expect(permissions).toEqual(null);
        done();
      })["catch"](done.fail);
    });
    it('gets permissions', function (done) {
      var loadingTask0 = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('issue9972-1.pdf'));
      var promise0 = loadingTask0.promise.then(function (pdfDocument) {
        return pdfDocument.getPermissions();
      });
      var loadingTask1 = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('issue9972-2.pdf'));
      var promise1 = loadingTask1.promise.then(function (pdfDocument) {
        return pdfDocument.getPermissions();
      });
      var loadingTask2 = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('issue9972-3.pdf'));
      var promise2 = loadingTask2.promise.then(function (pdfDocument) {
        return pdfDocument.getPermissions();
      });
      var totalPermissionCount = Object.keys(_util.PermissionFlag).length;
      Promise.all([promise0, promise1, promise2]).then(function (permissions) {
        expect(permissions[0].length).toEqual(totalPermissionCount - 1);
        expect(permissions[0].includes(_util.PermissionFlag.MODIFY_CONTENTS)).toBeFalsy();
        expect(permissions[1].length).toEqual(totalPermissionCount - 2);
        expect(permissions[1].includes(_util.PermissionFlag.PRINT)).toBeFalsy();
        expect(permissions[1].includes(_util.PermissionFlag.PRINT_HIGH_QUALITY)).toBeFalsy();
        expect(permissions[2].length).toEqual(totalPermissionCount - 1);
        expect(permissions[2].includes(_util.PermissionFlag.COPY)).toBeFalsy();
        Promise.all([loadingTask0.destroy(), loadingTask1.destroy(), loadingTask2.destroy()]).then(done);
      })["catch"](done.fail);
    });
    it('gets metadata', function (done) {
      var promise = doc.getMetadata();
      promise.then(function (_ref) {
        var info = _ref.info,
            metadata = _ref.metadata,
            contentDispositionFilename = _ref.contentDispositionFilename;
        expect(info['Title']).toEqual('Basic API Test');
        expect(info['Custom']).toEqual(undefined);
        expect(info['PDFFormatVersion']).toEqual('1.7');
        expect(info['IsLinearized']).toEqual(false);
        expect(info['IsAcroFormPresent']).toEqual(false);
        expect(info['IsXFAPresent']).toEqual(false);
        expect(info['IsCollectionPresent']).toEqual(false);
        expect(metadata instanceof _metadata.Metadata).toEqual(true);
        expect(metadata.get('dc:title')).toEqual('Basic API Test');
        expect(contentDispositionFilename).toEqual(null);
        done();
      })["catch"](done.fail);
    });
    it('gets metadata, with custom info dict entries', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('tracemonkey.pdf'));
      loadingTask.promise.then(function (pdfDocument) {
        return pdfDocument.getMetadata();
      }).then(function (_ref2) {
        var info = _ref2.info,
            metadata = _ref2.metadata,
            contentDispositionFilename = _ref2.contentDispositionFilename;
        expect(info['Creator']).toEqual('TeX');
        expect(info['Producer']).toEqual('pdfeTeX-1.21a');
        expect(info['CreationDate']).toEqual('D:20090401163925-07\'00\'');
        var custom = info['Custom'];
        expect(_typeof(custom) === 'object' && custom !== null).toEqual(true);
        expect(custom['PTEX.Fullbanner']).toEqual('This is pdfeTeX, ' + 'Version 3.141592-1.21a-2.2 (Web2C 7.5.4) kpathsea version 3.5.6');
        expect(info['PDFFormatVersion']).toEqual('1.4');
        expect(info['IsLinearized']).toEqual(false);
        expect(info['IsAcroFormPresent']).toEqual(false);
        expect(info['IsXFAPresent']).toEqual(false);
        expect(info['IsCollectionPresent']).toEqual(false);
        expect(metadata).toEqual(null);
        expect(contentDispositionFilename).toEqual(null);
        loadingTask.destroy().then(done);
      })["catch"](done.fail);
    });
    it('gets data', function (done) {
      var promise = doc.getData();
      promise.then(function (data) {
        expect(data instanceof Uint8Array).toEqual(true);
        expect(data.length).toEqual(basicApiFileLength);
        done();
      })["catch"](done.fail);
    });
    it('gets download info', function (done) {
      var promise = doc.getDownloadInfo();
      promise.then(function (data) {
        expect(data).toEqual({
          length: basicApiFileLength
        });
        done();
      })["catch"](done.fail);
    });
    it('gets document stats', function (done) {
      var promise = doc.getStats();
      promise.then(function (stats) {
        expect(stats).toEqual({
          streamTypes: [],
          fontTypes: []
        });
        done();
      })["catch"](done.fail);
    });
    it('checks that fingerprints are unique', function (done) {
      var loadingTask1 = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('issue4436r.pdf'));
      var loadingTask2 = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('issue4575.pdf'));
      var promises = [loadingTask1.promise, loadingTask2.promise];
      Promise.all(promises).then(function (data) {
        var fingerprint1 = data[0].fingerprint;
        expect(_typeof(fingerprint1)).toEqual('string');
        expect(fingerprint1.length > 0).toEqual(true);
        var fingerprint2 = data[1].fingerprint;
        expect(_typeof(fingerprint2)).toEqual('string');
        expect(fingerprint2.length > 0).toEqual(true);
        expect(fingerprint1).not.toEqual(fingerprint2);
        Promise.all([loadingTask1.destroy(), loadingTask2.destroy()]).then(done);
      })["catch"](done.fail);
    });
    describe('Cross-origin', function () {
      var loadingTask;

      function _checkCanLoad(expectSuccess, filename, options) {
        if ((0, _is_node["default"])()) {
          pending('Cannot simulate cross-origin requests in Node.js');
        }

        var params = (0, _test_utils.buildGetDocumentParams)(filename, options);
        var url = new URL(params.url);

        if (url.hostname === 'localhost') {
          url.hostname = '127.0.0.1';
        } else if (params.url.hostname === '127.0.0.1') {
          url.hostname = 'localhost';
        } else {
          pending('Can only run cross-origin test on localhost!');
        }

        params.url = url.href;
        loadingTask = (0, _api.getDocument)(params);
        return loadingTask.promise.then(function (pdf) {
          return pdf.destroy();
        }).then(function () {
          expect(expectSuccess).toEqual(true);
        }, function (error) {
          if (expectSuccess) {
            expect(error).toEqual('There should not be any error');
          }

          expect(expectSuccess).toEqual(false);
        });
      }

      function testCanLoad(filename, options) {
        return _checkCanLoad(true, filename, options);
      }

      function testCannotLoad(filename, options) {
        return _checkCanLoad(false, filename, options);
      }

      afterEach(function (done) {
        if (loadingTask && !loadingTask.destroyed) {
          loadingTask.destroy().then(done);
        } else {
          done();
        }
      });
      it('server disallows cors', function (done) {
        testCannotLoad('basicapi.pdf').then(done);
      });
      it('server allows cors without credentials, default withCredentials', function (done) {
        testCanLoad('basicapi.pdf?cors=withoutCredentials').then(done);
      });
      it('server allows cors without credentials, and withCredentials=false', function (done) {
        testCanLoad('basicapi.pdf?cors=withoutCredentials', {
          withCredentials: false
        }).then(done);
      });
      it('server allows cors without credentials, but withCredentials=true', function (done) {
        testCannotLoad('basicapi.pdf?cors=withoutCredentials', {
          withCredentials: true
        }).then(done);
      });
      it('server allows cors with credentials, and withCredentials=true', function (done) {
        testCanLoad('basicapi.pdf?cors=withCredentials', {
          withCredentials: true
        }).then(done);
      });
      it('server allows cors with credentials, and withCredentials=false', function (done) {
        testCanLoad('basicapi.pdf?cors=withCredentials', {
          withCredentials: false
        }).then(done);
      });
    });
  });
  describe('Page', function () {
    var loadingTask;
    var pdfDocument, page;
    beforeAll(function (done) {
      loadingTask = (0, _api.getDocument)(basicApiGetDocumentParams);
      loadingTask.promise.then(function (doc) {
        pdfDocument = doc;
        pdfDocument.getPage(1).then(function (data) {
          page = data;
          done();
        });
      })["catch"](done.fail);
    });
    afterAll(function (done) {
      loadingTask.destroy().then(done);
    });
    it('gets page number', function () {
      expect(page.pageNumber).toEqual(1);
    });
    it('gets rotate', function () {
      expect(page.rotate).toEqual(0);
    });
    it('gets ref', function () {
      expect(page.ref).toEqual({
        num: 15,
        gen: 0
      });
    });
    it('gets userUnit', function () {
      expect(page.userUnit).toEqual(1.0);
    });
    it('gets view', function () {
      expect(page.view).toEqual([0, 0, 595.28, 841.89]);
    });
    it('gets viewport', function () {
      var viewport = page.getViewport({
        scale: 1.5,
        rotation: 90
      });
      expect(viewport.viewBox).toEqual(page.view);
      expect(viewport.scale).toEqual(1.5);
      expect(viewport.rotation).toEqual(90);
      expect(viewport.transform).toEqual([0, 1.5, 1.5, 0, 0, 0]);
      expect(viewport.width).toEqual(1262.835);
      expect(viewport.height).toEqual(892.92);
    });
    it('gets viewport respecting "dontFlip" argument', function () {
      var scale = 1;
      var rotation = 135;
      var viewport = page.getViewport({
        scale: scale,
        rotation: rotation
      });
      var dontFlipViewport = page.getViewport({
        scale: scale,
        rotation: rotation,
        dontFlip: true
      });
      expect(dontFlipViewport).not.toEqual(viewport);
      expect(dontFlipViewport).toEqual(viewport.clone({
        dontFlip: true
      }));
      expect(viewport.transform).toEqual([1, 0, 0, -1, 0, 841.89]);
      expect(dontFlipViewport.transform).toEqual([1, 0, -0, 1, 0, 0]);
    });
    it('gets annotations', function (done) {
      var defaultPromise = page.getAnnotations().then(function (data) {
        expect(data.length).toEqual(4);
      });
      var displayPromise = page.getAnnotations({
        intent: 'display'
      }).then(function (data) {
        expect(data.length).toEqual(4);
      });
      var printPromise = page.getAnnotations({
        intent: 'print'
      }).then(function (data) {
        expect(data.length).toEqual(4);
      });
      Promise.all([defaultPromise, displayPromise, printPromise]).then(function () {
        done();
      })["catch"](done.fail);
    });
    it('gets annotations containing relative URLs (bug 766086)', function (done) {
      var filename = 'bug766086.pdf';
      var defaultLoadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(filename));
      var defaultPromise = defaultLoadingTask.promise.then(function (pdfDoc) {
        return pdfDoc.getPage(1).then(function (pdfPage) {
          return pdfPage.getAnnotations();
        });
      });
      var docBaseUrlLoadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(filename, {
        docBaseUrl: 'http://www.example.com/test/pdfs/qwerty.pdf'
      }));
      var docBaseUrlPromise = docBaseUrlLoadingTask.promise.then(function (pdfDoc) {
        return pdfDoc.getPage(1).then(function (pdfPage) {
          return pdfPage.getAnnotations();
        });
      });
      var invalidDocBaseUrlLoadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(filename, {
        docBaseUrl: 'qwerty.pdf'
      }));
      var invalidDocBaseUrlPromise = invalidDocBaseUrlLoadingTask.promise.then(function (pdfDoc) {
        return pdfDoc.getPage(1).then(function (pdfPage) {
          return pdfPage.getAnnotations();
        });
      });
      Promise.all([defaultPromise, docBaseUrlPromise, invalidDocBaseUrlPromise]).then(function (data) {
        var defaultAnnotations = data[0];
        var docBaseUrlAnnotations = data[1];
        var invalidDocBaseUrlAnnotations = data[2];
        expect(defaultAnnotations[0].url).toBeUndefined();
        expect(defaultAnnotations[0].unsafeUrl).toEqual('../../0021/002156/215675E.pdf#15');
        expect(docBaseUrlAnnotations[0].url).toEqual('http://www.example.com/0021/002156/215675E.pdf#15');
        expect(docBaseUrlAnnotations[0].unsafeUrl).toEqual('../../0021/002156/215675E.pdf#15');
        expect(invalidDocBaseUrlAnnotations[0].url).toBeUndefined();
        expect(invalidDocBaseUrlAnnotations[0].unsafeUrl).toEqual('../../0021/002156/215675E.pdf#15');
        Promise.all([defaultLoadingTask.destroy(), docBaseUrlLoadingTask.destroy(), invalidDocBaseUrlLoadingTask.destroy()]).then(done);
      })["catch"](done.fail);
    });
    it('gets text content', function (done) {
      var defaultPromise = page.getTextContent();
      var parametersPromise = page.getTextContent({
        normalizeWhitespace: true,
        disableCombineTextItems: true
      });
      var promises = [defaultPromise, parametersPromise];
      Promise.all(promises).then(function (data) {
        expect(!!data[0].items).toEqual(true);
        expect(data[0].items.length).toEqual(7);
        expect(!!data[0].styles).toEqual(true);
        expect(JSON.stringify(data[0])).toEqual(JSON.stringify(data[1]));
        done();
      })["catch"](done.fail);
    });
    it('gets text content, with correct properties (issue 8276)', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('issue8276_reduced.pdf'));
      loadingTask.promise.then(function (pdfDoc) {
        pdfDoc.getPage(1).then(function (pdfPage) {
          pdfPage.getTextContent().then(function (_ref3) {
            var items = _ref3.items,
                styles = _ref3.styles;
            expect(items.length).toEqual(1);
            expect(Object.keys(styles)).toEqual(['Times']);
            expect(items[0]).toEqual({
              dir: 'ltr',
              fontName: 'Times',
              height: 18,
              str: 'Issue 8276',
              transform: [18, 0, 0, 18, 441.81, 708.4499999999999],
              width: 77.49
            });
            expect(styles.Times).toEqual({
              fontFamily: 'serif',
              ascent: NaN,
              descent: NaN,
              vertical: false
            });
            loadingTask.destroy().then(done);
          });
        });
      })["catch"](done.fail);
    });
    it('gets operator list', function (done) {
      var promise = page.getOperatorList();
      promise.then(function (oplist) {
        expect(!!oplist.fnArray).toEqual(true);
        expect(!!oplist.argsArray).toEqual(true);
        expect(oplist.lastChunk).toEqual(true);
        done();
      })["catch"](done.fail);
    });
    it('gets operatorList with JPEG image (issue 4888)', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('cmykjpeg.pdf'));
      loadingTask.promise.then(function (pdfDoc) {
        pdfDoc.getPage(1).then(function (pdfPage) {
          pdfPage.getOperatorList().then(function (opList) {
            var imgIndex = opList.fnArray.indexOf(_util.OPS.paintImageXObject);
            var imgArgs = opList.argsArray[imgIndex];

            var _pdfPage$objs$get = pdfPage.objs.get(imgArgs[0]),
                data = _pdfPage$objs$get.data;

            expect(data instanceof Uint8ClampedArray).toEqual(true);
            expect(data.length).toEqual(90000);
            loadingTask.destroy().then(done);
          });
        });
      })["catch"](done.fail);
    });
    it('gets document stats after parsing page', function (done) {
      var promise = page.getOperatorList().then(function () {
        return pdfDocument.getStats();
      });
      var expectedStreamTypes = [];
      expectedStreamTypes[_util.StreamType.FLATE] = true;
      var expectedFontTypes = [];
      expectedFontTypes[_util.FontType.TYPE1] = true;
      expectedFontTypes[_util.FontType.CIDFONTTYPE2] = true;
      promise.then(function (stats) {
        expect(stats).toEqual({
          streamTypes: expectedStreamTypes,
          fontTypes: expectedFontTypes
        });
        done();
      })["catch"](done.fail);
    });
    it('gets page stats after parsing page, without `pdfBug` set', function (done) {
      page.getOperatorList().then(function (opList) {
        return page.stats;
      }).then(function (stats) {
        expect(stats).toEqual(null);
        done();
      }, done.fail);
    });
    it('gets page stats after parsing page, with `pdfBug` set', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(basicApiFileName, {
        pdfBug: true
      }));
      loadingTask.promise.then(function (pdfDoc) {
        return pdfDoc.getPage(1).then(function (pdfPage) {
          return pdfPage.getOperatorList().then(function (opList) {
            return pdfPage.stats;
          });
        });
      }).then(function (stats) {
        expect(stats instanceof _display_utils.StatTimer).toEqual(true);
        expect(stats.times.length).toEqual(1);

        var _stats$times = _slicedToArray(stats.times, 1),
            statEntry = _stats$times[0];

        expect(statEntry.name).toEqual('Page Request');
        expect(statEntry.end - statEntry.start).toBeGreaterThan(0);
        loadingTask.destroy().then(done);
      }, done.fail);
    });
    it('gets page stats after rendering page, with `pdfBug` set', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(basicApiFileName, {
        pdfBug: true
      }));
      var canvasAndCtx;
      loadingTask.promise.then(function (pdfDoc) {
        return pdfDoc.getPage(1).then(function (pdfPage) {
          var viewport = pdfPage.getViewport({
            scale: 1
          });
          canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);
          var renderTask = pdfPage.render({
            canvasContext: canvasAndCtx.context,
            canvasFactory: CanvasFactory,
            viewport: viewport
          });
          return renderTask.promise.then(function () {
            return pdfPage.stats;
          });
        });
      }).then(function (stats) {
        expect(stats instanceof _display_utils.StatTimer).toEqual(true);
        expect(stats.times.length).toEqual(3);

        var _stats$times2 = _slicedToArray(stats.times, 3),
            statEntryOne = _stats$times2[0],
            statEntryTwo = _stats$times2[1],
            statEntryThree = _stats$times2[2];

        expect(statEntryOne.name).toEqual('Page Request');
        expect(statEntryOne.end - statEntryOne.start).toBeGreaterThan(0);
        expect(statEntryTwo.name).toEqual('Rendering');
        expect(statEntryTwo.end - statEntryTwo.start).toBeGreaterThan(0);
        expect(statEntryThree.name).toEqual('Overall');
        expect(statEntryThree.end - statEntryThree.start).toBeGreaterThan(0);
        CanvasFactory.destroy(canvasAndCtx);
        loadingTask.destroy().then(done);
      }, done.fail);
    });
    it('cancels rendering of page', function (done) {
      var viewport = page.getViewport({
        scale: 1
      });
      var canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);
      var renderTask = page.render({
        canvasContext: canvasAndCtx.context,
        canvasFactory: CanvasFactory,
        viewport: viewport
      });
      renderTask.cancel();
      renderTask.promise.then(function () {
        done.fail('shall cancel rendering');
      })["catch"](function (error) {
        expect(error instanceof _display_utils.RenderingCancelledException).toEqual(true);
        expect(error.type).toEqual('canvas');
        CanvasFactory.destroy(canvasAndCtx);
        done();
      });
    });
    it('re-render page, using the same canvas, after cancelling rendering', function (done) {
      var viewport = page.getViewport({
        scale: 1
      });
      var canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);
      var renderTask = page.render({
        canvasContext: canvasAndCtx.context,
        canvasFactory: CanvasFactory,
        viewport: viewport
      });
      renderTask.cancel();
      renderTask.promise.then(function () {
        throw new Error('shall cancel rendering');
      }, function (reason) {
        expect(reason instanceof _display_utils.RenderingCancelledException).toEqual(true);
      }).then(function () {
        var reRenderTask = page.render({
          canvasContext: canvasAndCtx.context,
          canvasFactory: CanvasFactory,
          viewport: viewport
        });
        return reRenderTask.promise;
      }).then(function () {
        CanvasFactory.destroy(canvasAndCtx);
        done();
      }, done.fail);
    });
    it('multiple render() on the same canvas', function (done) {
      var viewport = page.getViewport({
        scale: 1
      });
      var canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);
      var renderTask1 = page.render({
        canvasContext: canvasAndCtx.context,
        canvasFactory: CanvasFactory,
        viewport: viewport
      });
      var renderTask2 = page.render({
        canvasContext: canvasAndCtx.context,
        canvasFactory: CanvasFactory,
        viewport: viewport
      });
      Promise.all([renderTask1.promise, renderTask2.promise.then(function () {
        done.fail('shall fail rendering');
      }, function (reason) {
        expect(/multiple render\(\)/.test(reason.message)).toEqual(true);
      })]).then(done);
    });
  });
  describe('Multiple `getDocument` instances', function () {
    var pdf1 = (0, _test_utils.buildGetDocumentParams)('tracemonkey.pdf');
    var pdf2 = (0, _test_utils.buildGetDocumentParams)('TAMReview.pdf');
    var pdf3 = (0, _test_utils.buildGetDocumentParams)('issue6068.pdf');
    var loadingTasks = [];

    function renderPDF(_x) {
      return _renderPDF.apply(this, arguments);
    }

    function _renderPDF() {
      _renderPDF = _asyncToGenerator(
      /*#__PURE__*/
      _regenerator["default"].mark(function _callee(filename) {
        var loadingTask, pdf, page, viewport, canvasAndCtx, renderTask, data;
        return _regenerator["default"].wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                loadingTask = (0, _api.getDocument)(filename);
                loadingTasks.push(loadingTask);
                _context.next = 4;
                return loadingTask.promise;

              case 4:
                pdf = _context.sent;
                _context.next = 7;
                return pdf.getPage(1);

              case 7:
                page = _context.sent;
                viewport = page.getViewport({
                  scale: 1.2
                });
                canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);
                renderTask = page.render({
                  canvasContext: canvasAndCtx.context,
                  canvasFactory: CanvasFactory,
                  viewport: viewport
                });
                _context.next = 13;
                return renderTask.promise;

              case 13:
                data = canvasAndCtx.canvas.toDataURL();
                CanvasFactory.destroy(canvasAndCtx);
                return _context.abrupt("return", data);

              case 16:
              case "end":
                return _context.stop();
            }
          }
        }, _callee);
      }));
      return _renderPDF.apply(this, arguments);
    }

    afterEach(function (done) {
      var destroyPromises = loadingTasks.map(function (loadingTask) {
        return loadingTask.destroy();
      });
      Promise.all(destroyPromises).then(done);
    });
    it('should correctly render PDFs in parallel', function (done) {
      var baseline1, baseline2, baseline3;
      var promiseDone = renderPDF(pdf1).then(function (data1) {
        baseline1 = data1;
        return renderPDF(pdf2);
      }).then(function (data2) {
        baseline2 = data2;
        return renderPDF(pdf3);
      }).then(function (data3) {
        baseline3 = data3;
        return Promise.all([renderPDF(pdf1), renderPDF(pdf2), renderPDF(pdf3)]);
      }).then(function (dataUrls) {
        expect(dataUrls[0]).toEqual(baseline1);
        expect(dataUrls[1]).toEqual(baseline2);
        expect(dataUrls[2]).toEqual(baseline3);
        return true;
      });
      promiseDone.then(function () {
        done();
      })["catch"](done.fail);
    });
  });
  describe('PDFDataRangeTransport', function () {
    var dataPromise;
    beforeAll(function (done) {
      var fileName = 'tracemonkey.pdf';

      if ((0, _is_node["default"])()) {
        dataPromise = _test_utils.NodeFileReaderFactory.fetch({
          path: _test_utils.TEST_PDFS_PATH.node + fileName
        });
      } else {
        dataPromise = _test_utils.DOMFileReaderFactory.fetch({
          path: _test_utils.TEST_PDFS_PATH.dom + fileName
        });
      }

      done();
    });
    afterAll(function () {
      dataPromise = null;
    });
    it('should fetch document info and page using ranges', function (done) {
      var initialDataLength = 4000;
      var fetches = 0,
          loadingTask;
      dataPromise.then(function (data) {
        var initialData = data.subarray(0, initialDataLength);
        var transport = new _api.PDFDataRangeTransport(data.length, initialData);

        transport.requestDataRange = function (begin, end) {
          fetches++;
          waitSome(function () {
            transport.onDataProgress(4000);
            transport.onDataRange(begin, data.subarray(begin, end));
          });
        };

        loadingTask = (0, _api.getDocument)(transport);
        return loadingTask.promise;
      }).then(function (pdfDocument) {
        expect(pdfDocument.numPages).toEqual(14);
        return pdfDocument.getPage(10);
      }).then(function (pdfPage) {
        expect(pdfPage.rotate).toEqual(0);
        expect(fetches).toBeGreaterThan(2);
        loadingTask.destroy().then(done);
      })["catch"](done.fail);
    });
    it('should fetch document info and page using range and streaming', function (done) {
      var initialDataLength = 4000;
      var fetches = 0,
          loadingTask;
      dataPromise.then(function (data) {
        var initialData = data.subarray(0, initialDataLength);
        var transport = new _api.PDFDataRangeTransport(data.length, initialData);

        transport.requestDataRange = function (begin, end) {
          fetches++;

          if (fetches === 1) {
            transport.onDataProgressiveRead(data.subarray(initialDataLength));
          }

          waitSome(function () {
            transport.onDataRange(begin, data.subarray(begin, end));
          });
        };

        loadingTask = (0, _api.getDocument)(transport);
        return loadingTask.promise;
      }).then(function (pdfDocument) {
        expect(pdfDocument.numPages).toEqual(14);
        return pdfDocument.getPage(10);
      }).then(function (pdfPage) {
        expect(pdfPage.rotate).toEqual(0);
        expect(fetches).toEqual(1);
        waitSome(function () {
          loadingTask.destroy().then(done);
        });
      })["catch"](done.fail);
    });
    it('should fetch document info and page, without range, ' + 'using complete initialData', function (done) {
      var fetches = 0,
          loadingTask;
      dataPromise.then(function (data) {
        var transport = new _api.PDFDataRangeTransport(data.length, data, true);

        transport.requestDataRange = function (begin, end) {
          fetches++;
        };

        loadingTask = (0, _api.getDocument)({
          disableRange: true,
          range: transport
        });
        return loadingTask.promise;
      }).then(function (pdfDocument) {
        expect(pdfDocument.numPages).toEqual(14);
        return pdfDocument.getPage(10);
      }).then(function (pdfPage) {
        expect(pdfPage.rotate).toEqual(0);
        expect(fetches).toEqual(0);
        loadingTask.destroy().then(done);
      })["catch"](done.fail);
    });
  });
});