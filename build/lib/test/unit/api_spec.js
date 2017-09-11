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
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _test_utils = require('./test_utils');

var _util = require('../../shared/util');

var _dom_utils = require('../../display/dom_utils');

var _api = require('../../display/api');

var _global = require('../../display/global');

describe('api', function () {
  var basicApiFileName = 'basicapi.pdf';
  var basicApiFileLength = 105779;
  var basicApiGetDocumentParams = (0, _test_utils.buildGetDocumentParams)(basicApiFileName);
  var CanvasFactory = void 0;
  beforeAll(function (done) {
    if ((0, _util.isNodeJS)()) {
      _global.PDFJS.pdfjsNext = true;
    } else {
      CanvasFactory = new _dom_utils.DOMCanvasFactory();
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
  describe('PDFJS', function () {
    describe('getDocument', function () {
      it('creates pdf doc from URL', function (done) {
        if ((0, _util.isNodeJS)()) {
          pending('XMLHttpRequest is not supported in Node.js.');
        }
        var loadingTask = (0, _api.getDocument)(basicApiGetDocumentParams);
        var isProgressReportedResolved = false;
        var progressReportedCapability = (0, _util.createPromiseCapability)();
        loadingTask.onProgress = function (progressData) {
          if (!isProgressReportedResolved) {
            isProgressReportedResolved = true;
            progressReportedCapability.resolve(progressData);
          }
        };
        var promises = [progressReportedCapability.promise, loadingTask.promise];
        Promise.all(promises).then(function (data) {
          expect(data[0].loaded / data[0].total > 0).toEqual(true);
          expect(data[1] instanceof _api.PDFDocumentProxy).toEqual(true);
          expect(loadingTask).toEqual(data[1].loadingTask);
          loadingTask.destroy().then(done);
        }).catch(function (reason) {
          done.fail(reason);
        });
      });
      it('creates pdf doc from URL and aborts before worker initialized', function (done) {
        if ((0, _util.isNodeJS)()) {
          pending('XMLHttpRequest is not supported in Node.js.');
        }
        var loadingTask = (0, _api.getDocument)(basicApiGetDocumentParams);
        var destroyed = loadingTask.destroy();
        loadingTask.promise.then(function (reason) {
          done.fail('shall fail loading');
        }).catch(function (reason) {
          expect(true).toEqual(true);
          destroyed.then(done);
        });
      });
      it('creates pdf doc from URL and aborts loading after worker initialized', function (done) {
        if ((0, _util.isNodeJS)()) {
          pending('XMLHttpRequest is not supported in Node.js.');
        }
        var loadingTask = (0, _api.getDocument)(basicApiGetDocumentParams);
        var destroyed = loadingTask._worker.promise.then(function () {
          return loadingTask.destroy();
        });
        destroyed.then(function (data) {
          expect(true).toEqual(true);
          done();
        }).catch(function (reason) {
          done.fail(reason);
        });
      });
      it('creates pdf doc from typed array', function (done) {
        var typedArrayPdf;
        if ((0, _util.isNodeJS)()) {
          typedArrayPdf = _test_utils.NodeFileReaderFactory.fetch({ path: _test_utils.TEST_PDFS_PATH.node + basicApiFileName });
        } else {
          var nonBinaryRequest = _global.PDFJS.disableWorker;
          var request = new XMLHttpRequest();
          request.open('GET', _test_utils.TEST_PDFS_PATH.dom + basicApiFileName, false);
          if (!nonBinaryRequest) {
            try {
              request.responseType = 'arraybuffer';
              nonBinaryRequest = request.responseType !== 'arraybuffer';
            } catch (e) {
              nonBinaryRequest = true;
            }
          }
          if (nonBinaryRequest && request.overrideMimeType) {
            request.overrideMimeType('text/plain; charset=x-user-defined');
          }
          request.send(null);
          if (nonBinaryRequest) {
            typedArrayPdf = (0, _util.stringToBytes)(request.responseText);
          } else {
            typedArrayPdf = new Uint8Array(request.response);
          }
        }
        expect(typedArrayPdf.length).toEqual(basicApiFileLength);
        var loadingTask = (0, _api.getDocument)(typedArrayPdf);
        loadingTask.promise.then(function (data) {
          expect(data instanceof _api.PDFDocumentProxy).toEqual(true);
          loadingTask.destroy().then(done);
        }).catch(function (reason) {
          done.fail(reason);
        });
      });
      it('creates pdf doc from invalid PDF file', function (done) {
        var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('bug1020226.pdf'));
        loadingTask.promise.then(function () {
          done.fail('shall fail loading');
        }).catch(function (error) {
          expect(error instanceof _util.InvalidPDFException).toEqual(true);
          loadingTask.destroy().then(done);
        });
      });
      it('creates pdf doc from non-existent URL', function (done) {
        if ((0, _util.isNodeJS)()) {
          pending('XMLHttpRequest is not supported in Node.js.');
        }
        var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('non-existent.pdf'));
        loadingTask.promise.then(function (error) {
          done.fail('shall fail loading');
        }).catch(function (error) {
          expect(error instanceof _util.MissingPDFException).toEqual(true);
          loadingTask.destroy().then(done);
        });
      });
      it('creates pdf doc from PDF file protected with user and owner password', function (done) {
        var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('pr6531_1.pdf'));
        var isPasswordNeededResolved = false;
        var passwordNeededCapability = (0, _util.createPromiseCapability)();
        var isPasswordIncorrectResolved = false;
        var passwordIncorrectCapability = (0, _util.createPromiseCapability)();
        loadingTask.onPassword = function (updatePassword, reason) {
          if (reason === _util.PasswordResponses.NEED_PASSWORD && !isPasswordNeededResolved) {
            isPasswordNeededResolved = true;
            passwordNeededCapability.resolve();
            updatePassword('qwerty');
            return;
          }
          if (reason === _util.PasswordResponses.INCORRECT_PASSWORD && !isPasswordIncorrectResolved) {
            isPasswordIncorrectResolved = true;
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
        }).catch(function (reason) {
          done.fail(reason);
        });
      });
      it('creates pdf doc from PDF file protected with only a user password', function (done) {
        var filename = 'pr6531_2.pdf';
        var passwordNeededLoadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(filename, { password: '' }));
        var result1 = passwordNeededLoadingTask.promise.then(function () {
          done.fail('shall fail with no password');
          return Promise.reject(new Error('loadingTask should be rejected'));
        }, function (data) {
          expect(data instanceof _util.PasswordException).toEqual(true);
          expect(data.code).toEqual(_util.PasswordResponses.NEED_PASSWORD);
          return passwordNeededLoadingTask.destroy();
        });
        var passwordIncorrectLoadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(filename, { password: 'qwerty' }));
        var result2 = passwordIncorrectLoadingTask.promise.then(function () {
          done.fail('shall fail with wrong password');
          return Promise.reject(new Error('loadingTask should be rejected'));
        }, function (data) {
          expect(data instanceof _util.PasswordException).toEqual(true);
          expect(data.code).toEqual(_util.PasswordResponses.INCORRECT_PASSWORD);
          return passwordIncorrectLoadingTask.destroy();
        });
        var passwordAcceptedLoadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(filename, { password: 'asdfasdf' }));
        var result3 = passwordAcceptedLoadingTask.promise.then(function (data) {
          expect(data instanceof _api.PDFDocumentProxy).toEqual(true);
          return passwordAcceptedLoadingTask.destroy();
        });
        Promise.all([result1, result2, result3]).then(function () {
          done();
        }).catch(function (reason) {
          done.fail(reason);
        });
      });
      it('creates pdf doc from password protected PDF file and aborts/throws ' + 'in the onPassword callback (issue 7806)', function (done) {
        var filename = 'issue3371.pdf';
        var passwordNeededLoadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(filename));
        var passwordIncorrectLoadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(filename, { password: 'qwerty' }));
        var passwordNeededDestroyed = void 0;
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
        }).catch(function (reason) {
          done.fail(reason);
        });
      });
    });
  });
  describe('PDFWorker', function () {
    if ((0, _util.isNodeJS)()) {
      pending('Worker is not supported in Node.js.');
    }
    it('worker created or destroyed', function (done) {
      var worker = new _global.PDFJS.PDFWorker('test1');
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
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('worker created or destroyed by getDocument', function (done) {
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
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('worker created and can be used in getDocument', function (done) {
      var worker = new _global.PDFJS.PDFWorker('test1');
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(basicApiFileName, { worker: worker }));
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
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('creates more than one worker', function (done) {
      var worker1 = new _global.PDFJS.PDFWorker('test1');
      var worker2 = new _global.PDFJS.PDFWorker('test2');
      var worker3 = new _global.PDFJS.PDFWorker('test3');
      var ready = Promise.all([worker1.promise, worker2.promise, worker3.promise]);
      ready.then(function () {
        expect(worker1.port !== worker2.port && worker1.port !== worker3.port && worker2.port !== worker3.port).toEqual(true);
        worker1.destroy();
        worker2.destroy();
        worker3.destroy();
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
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
      expect(typeof fingerprint === 'undefined' ? 'undefined' : _typeof(fingerprint)).toEqual('string');
      expect(fingerprint.length > 0).toEqual(true);
    });
    it('gets page', function (done) {
      var promise = doc.getPage(1);
      promise.then(function (data) {
        expect(data instanceof _api.PDFPageProxy).toEqual(true);
        expect(data.pageIndex).toEqual(0);
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
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
      }).catch(function (reason) {
        done.fail(reason);
      });
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
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets invalid page index', function (done) {
      var ref = {
        num: 3,
        gen: 0
      };
      var promise = doc.getPageIndex(ref);
      promise.then(function () {
        done.fail('shall fail for invalid page reference.');
      }).catch(function (reason) {
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
          }, { name: 'XYZ' }, 0, 841.89, null]
        });
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets a destination, from /Dests dictionary', function (done) {
      var promise = doc.getDestination('chapter1');
      promise.then(function (data) {
        expect(data).toEqual([{
          gen: 0,
          num: 17
        }, { name: 'XYZ' }, 0, 841.89, null]);
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets a non-existent destination, from /Dests dictionary', function (done) {
      var promise = doc.getDestination('non-existent-named-destination');
      promise.then(function (data) {
        expect(data).toEqual(null);
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
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
          }, { name: 'XYZ' }, 0, 375, null],
          'Page.2': [{
            num: 6,
            gen: 0
          }, { name: 'XYZ' }, 0, 375, null]
        });
        loadingTask.destroy().then(done);
      }).catch(function (reason) {
        done.fail(reason);
      });
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
        }, { name: 'XYZ' }, 0, 375, null]);
        loadingTask.destroy().then(done);
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets a non-existent destination, from /Names (NameTree) dictionary', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('issue6204.pdf'));
      var promise = loadingTask.promise.then(function (pdfDocument) {
        return pdfDocument.getDestination('non-existent-named-destination');
      });
      promise.then(function (destination) {
        expect(destination).toEqual(null);
        loadingTask.destroy().then(done);
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets non-existent page labels', function (done) {
      var promise = doc.getPageLabels();
      promise.then(function (data) {
        expect(data).toEqual(null);
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
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
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets default page mode', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('tracemonkey.pdf'));
      loadingTask.promise.then(function (pdfDocument) {
        return pdfDocument.getPageMode();
      }).then(function (mode) {
        expect(mode).toEqual('UseNone');
        loadingTask.destroy().then(done);
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets non-default page mode', function (done) {
      doc.getPageMode().then(function (mode) {
        expect(mode).toEqual('UseOutlines');
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets non-existent attachments', function (done) {
      var promise = doc.getAttachments();
      promise.then(function (data) {
        expect(data).toEqual(null);
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets attachments', function (done) {
      if ((0, _util.isNodeJS)()) {
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
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets javascript', function (done) {
      var promise = doc.getJavaScript();
      promise.then(function (data) {
        expect(data).toEqual([]);
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
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
      }).catch(function (reason) {
        done.fail(reason);
      });
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
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets non-existent outline', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('tracemonkey.pdf'));
      var promise = loadingTask.promise.then(function (pdfDocument) {
        return pdfDocument.getOutline();
      });
      promise.then(function (outline) {
        expect(outline).toEqual(null);
        loadingTask.destroy().then(done);
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets outline', function (done) {
      var promise = doc.getOutline();
      promise.then(function (outline) {
        expect(outline instanceof Array).toEqual(true);
        expect(outline.length).toEqual(2);
        var outlineItem = outline[1];
        expect(outlineItem.title).toEqual('Chapter 1');
        expect(outlineItem.dest instanceof Array).toEqual(true);
        expect(outlineItem.url).toEqual(null);
        expect(outlineItem.unsafeUrl).toBeUndefined();
        expect(outlineItem.newWindow).toBeUndefined();
        expect(outlineItem.bold).toEqual(true);
        expect(outlineItem.italic).toEqual(false);
        expect(outlineItem.color).toEqual(new Uint8Array([0, 64, 128]));
        expect(outlineItem.items.length).toEqual(1);
        expect(outlineItem.items[0].title).toEqual('Paragraph 1.1');
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets outline containing a url', function (done) {
      var loadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('issue3214.pdf'));
      loadingTask.promise.then(function (pdfDocument) {
        pdfDocument.getOutline().then(function (outline) {
          expect(outline instanceof Array).toEqual(true);
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
          expect(outlineItemOne.color).toEqual(new Uint8Array([0, 0, 0]));
          loadingTask.destroy().then(done);
        });
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets metadata', function (done) {
      if ((0, _util.isNodeJS)()) {
        pending('Document is not supported in Node.js.');
      }
      var promise = doc.getMetadata();
      promise.then(function (metadata) {
        expect(metadata.info['Title']).toEqual('Basic API Test');
        expect(metadata.info['PDFFormatVersion']).toEqual('1.7');
        expect(metadata.metadata.get('dc:title')).toEqual('Basic API Test');
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets data', function (done) {
      var promise = doc.getData();
      promise.then(function (data) {
        expect(data instanceof Uint8Array).toEqual(true);
        expect(data.length).toEqual(basicApiFileLength);
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets download info', function (done) {
      var promise = doc.getDownloadInfo();
      promise.then(function (data) {
        expect(data).toEqual({ length: basicApiFileLength });
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets stats', function (done) {
      var promise = doc.getStats();
      promise.then(function (stats) {
        expect(stats).toEqual({
          streamTypes: [],
          fontTypes: []
        });
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('checks that fingerprints are unique', function (done) {
      var loadingTask1 = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('issue4436r.pdf'));
      var loadingTask2 = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)('issue4575.pdf'));
      var promises = [loadingTask1.promise, loadingTask2.promise];
      Promise.all(promises).then(function (data) {
        var fingerprint1 = data[0].fingerprint;
        expect(typeof fingerprint1 === 'undefined' ? 'undefined' : _typeof(fingerprint1)).toEqual('string');
        expect(fingerprint1.length > 0).toEqual(true);
        var fingerprint2 = data[1].fingerprint;
        expect(typeof fingerprint2 === 'undefined' ? 'undefined' : _typeof(fingerprint2)).toEqual('string');
        expect(fingerprint2.length > 0).toEqual(true);
        expect(fingerprint1).not.toEqual(fingerprint2);
        Promise.all([loadingTask1.destroy(), loadingTask2.destroy()]).then(done);
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    describe('Cross-origin', function () {
      var loadingTask;
      function _checkCanLoad(expectSuccess, filename, options) {
        if ((0, _util.isNodeJS)()) {
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
        if (loadingTask) {
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
        testCanLoad('basicapi.pdf?cors=withoutCredentials', { withCredentials: false }).then(done);
      });
      it('server allows cors without credentials, but withCredentials=true', function (done) {
        testCannotLoad('basicapi.pdf?cors=withoutCredentials', { withCredentials: true }).then(done);
      });
      it('server allows cors with credentials, and withCredentials=true', function (done) {
        testCanLoad('basicapi.pdf?cors=withCredentials', { withCredentials: true }).then(done);
      });
      it('server allows cors with credentials, and withCredentials=false', function (done) {
        testCanLoad('basicapi.pdf?cors=withCredentials', { withCredentials: false }).then(done);
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
      }).catch(function (reason) {
        done.fail(reason);
      });
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
      var viewport = page.getViewport(1.5, 90);
      expect(viewport.viewBox).toEqual(page.view);
      expect(viewport.scale).toEqual(1.5);
      expect(viewport.rotation).toEqual(90);
      expect(viewport.transform).toEqual([0, 1.5, 1.5, 0, 0, 0]);
      expect(viewport.width).toEqual(1262.835);
      expect(viewport.height).toEqual(892.92);
    });
    it('gets annotations', function (done) {
      var defaultPromise = page.getAnnotations().then(function (data) {
        expect(data.length).toEqual(4);
      });
      var displayPromise = page.getAnnotations({ intent: 'display' }).then(function (data) {
        expect(data.length).toEqual(4);
      });
      var printPromise = page.getAnnotations({ intent: 'print' }).then(function (data) {
        expect(data.length).toEqual(4);
      });
      Promise.all([defaultPromise, displayPromise, printPromise]).then(function () {
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets annotations containing relative URLs (bug 766086)', function (done) {
      var filename = 'bug766086.pdf';
      var defaultLoadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(filename));
      var defaultPromise = defaultLoadingTask.promise.then(function (pdfDoc) {
        return pdfDoc.getPage(1).then(function (pdfPage) {
          return pdfPage.getAnnotations();
        });
      });
      var docBaseUrlLoadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(filename, { docBaseUrl: 'http://www.example.com/test/pdfs/qwerty.pdf' }));
      var docBaseUrlPromise = docBaseUrlLoadingTask.promise.then(function (pdfDoc) {
        return pdfDoc.getPage(1).then(function (pdfPage) {
          return pdfPage.getAnnotations();
        });
      });
      var invalidDocBaseUrlLoadingTask = (0, _api.getDocument)((0, _test_utils.buildGetDocumentParams)(filename, { docBaseUrl: 'qwerty.pdf' }));
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
      }).catch(function (reason) {
        done.fail(reason);
      });
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
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets operator list', function (done) {
      var promise = page.getOperatorList();
      promise.then(function (oplist) {
        expect(!!oplist.fnArray).toEqual(true);
        expect(!!oplist.argsArray).toEqual(true);
        expect(oplist.lastChunk).toEqual(true);
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('gets stats after parsing page', function (done) {
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
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('cancels rendering of page', function (done) {
      if ((0, _util.isNodeJS)()) {
        pending('TODO: Support Canvas testing in Node.js.');
      }
      var viewport = page.getViewport(1);
      var canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);
      var renderTask = page.render({
        canvasContext: canvasAndCtx.context,
        viewport: viewport
      });
      renderTask.cancel();
      renderTask.promise.then(function () {
        done.fail('shall cancel rendering');
      }).catch(function (error) {
        expect(error instanceof _dom_utils.RenderingCancelledException).toEqual(true);
        expect(error.type).toEqual('canvas');
        CanvasFactory.destroy(canvasAndCtx);
        done();
      });
    });
    it('multiple render() on the same canvas', function (done) {
      if ((0, _util.isNodeJS)()) {
        pending('TODO: Support Canvas testing in Node.js.');
      }
      var viewport = page.getViewport(1);
      var canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);
      var renderTask1 = page.render({
        canvasContext: canvasAndCtx.context,
        viewport: viewport
      });
      var renderTask2 = page.render({
        canvasContext: canvasAndCtx.context,
        viewport: viewport
      });
      Promise.all([renderTask1.promise, renderTask2.promise.then(function () {
        done.fail('shall fail rendering');
      }, function (reason) {
        expect(/multiple render\(\)/.test(reason.message)).toEqual(true);
      })]).then(done);
    });
  });
  describe('Multiple PDFJS instances', function () {
    if ((0, _util.isNodeJS)()) {
      pending('TODO: Support Canvas testing in Node.js.');
    }
    var pdf1 = (0, _test_utils.buildGetDocumentParams)('tracemonkey.pdf');
    var pdf2 = (0, _test_utils.buildGetDocumentParams)('TAMReview.pdf');
    var pdf3 = (0, _test_utils.buildGetDocumentParams)('issue6068.pdf');
    var loadingTasks = [];
    var pdfDocuments = [];
    function renderPDF(filename) {
      var loadingTask = (0, _api.getDocument)(filename);
      loadingTasks.push(loadingTask);
      return loadingTask.promise.then(function (pdf) {
        pdfDocuments.push(pdf);
        return pdf.getPage(1);
      }).then(function (page) {
        var viewport = page.getViewport(1.2);
        var canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);
        return page.render({
          canvasContext: canvasAndCtx.context,
          viewport: viewport
        }).then(function () {
          var data = canvasAndCtx.canvas.toDataURL();
          CanvasFactory.destroy(canvasAndCtx);
          return data;
        });
      });
    }
    afterEach(function (done) {
      var destroyPromises = pdfDocuments.map(function (pdfDocument) {
        return pdfDocument.destroy();
      });
      var destroyPromises2 = loadingTasks.map(function (loadingTask) {
        return loadingTask.destroy();
      });
      Promise.all(destroyPromises.concat(destroyPromises2)).then(function () {
        done();
      });
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
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
  });
  describe('PDFDataRangeTransport', function () {
    if ((0, _util.isNodeJS)()) {
      pending('XMLHttpRequest is not supported in Node.js.');
    }
    var pdfPath = new URL('../pdfs/tracemonkey.pdf', window.location).href;
    var loadPromise;
    function getDocumentData() {
      if (loadPromise) {
        return loadPromise;
      }
      loadPromise = new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest(pdfPath);
        xhr.open('GET', pdfPath);
        xhr.responseType = 'arraybuffer';
        xhr.onload = function () {
          resolve(new Uint8Array(xhr.response));
        };
        xhr.onerror = function () {
          reject(new Error('PDF is not loaded'));
        };
        xhr.send();
      });
      return loadPromise;
    }
    it('should fetch document info and page using ranges', function (done) {
      var transport;
      var initialDataLength = 4000;
      var fetches = 0;
      var getDocumentPromise = getDocumentData().then(function (data) {
        var initialData = data.subarray(0, initialDataLength);
        transport = new _global.PDFJS.PDFDataRangeTransport(data.length, initialData);
        transport.requestDataRange = function (begin, end) {
          fetches++;
          waitSome(function () {
            transport.onDataProgress(4000);
            transport.onDataRange(begin, data.subarray(begin, end));
          });
        };
        var loadingTask = (0, _api.getDocument)(transport);
        return loadingTask.promise;
      });
      var pdfDocument;
      var getPagePromise = getDocumentPromise.then(function (pdfDocument_) {
        pdfDocument = pdfDocument_;
        var pagePromise = pdfDocument.getPage(10);
        return pagePromise;
      });
      getPagePromise.then(function (page) {
        expect(pdfDocument.numPages).toEqual(14);
        expect(page.rotate).toEqual(0);
        expect(fetches).toBeGreaterThan(2);
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
    it('should fetch document info and page using range and streaming', function (done) {
      var transport;
      var initialDataLength = 4000;
      var fetches = 0;
      var getDocumentPromise = getDocumentData().then(function (data) {
        var initialData = data.subarray(0, initialDataLength);
        transport = new _global.PDFJS.PDFDataRangeTransport(data.length, initialData);
        transport.requestDataRange = function (begin, end) {
          fetches++;
          if (fetches === 1) {
            transport.onDataProgressiveRead(data.subarray(initialDataLength));
          }
          waitSome(function () {
            transport.onDataRange(begin, data.subarray(begin, end));
          });
        };
        var loadingTask = (0, _api.getDocument)(transport);
        return loadingTask.promise;
      });
      var pdfDocument;
      var getPagePromise = getDocumentPromise.then(function (pdfDocument_) {
        pdfDocument = pdfDocument_;
        var pagePromise = pdfDocument.getPage(10);
        return pagePromise;
      });
      getPagePromise.then(function (page) {
        expect(pdfDocument.numPages).toEqual(14);
        expect(page.rotate).toEqual(0);
        expect(fetches).toEqual(1);
        done();
      }).catch(function (reason) {
        done.fail(reason);
      });
    });
  });
});