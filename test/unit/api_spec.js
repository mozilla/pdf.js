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
  buildGetDocumentParams, NodeFileReaderFactory, TEST_PDFS_PATH
} from './test_utils';
import {
  createPromiseCapability, FontType, InvalidPDFException, MissingPDFException,
  OPS, PasswordException, PasswordResponses, PermissionFlag, StreamType,
  stringToBytes
} from '../../src/shared/util';
import {
  DOMCanvasFactory, RenderingCancelledException, StatTimer
} from '../../src/display/dom_utils';
import {
  getDocument, PDFDataRangeTransport, PDFDocumentProxy, PDFPageProxy, PDFWorker
} from '../../src/display/api';
import { GlobalWorkerOptions } from '../../src/display/worker_options';
import isNodeJS from '../../src/shared/is_node';
import { Metadata } from '../../src/display/metadata';

describe('api', function() {
  let basicApiFileName = 'basicapi.pdf';
  let basicApiFileLength = 105779; // bytes
  let basicApiGetDocumentParams = buildGetDocumentParams(basicApiFileName);

  let CanvasFactory;

  beforeAll(function(done) {
    if (isNodeJS()) {
      // NOTE: To support running the canvas-related tests in Node.js,
      // a `NodeCanvasFactory` would need to be added (in test_utils.js).
    } else {
      CanvasFactory = new DOMCanvasFactory();
    }
    done();
  });

  afterAll(function(done) {
    CanvasFactory = null;
    done();
  });

  function waitSome(callback) {
    var WAIT_TIMEOUT = 10;
    setTimeout(function () {
      callback();
    }, WAIT_TIMEOUT);
  }

  describe('getDocument', function() {
    it('creates pdf doc from URL', function(done) {
      var loadingTask = getDocument(basicApiGetDocumentParams);

      var isProgressReportedResolved = false;
      var progressReportedCapability = createPromiseCapability();

      // Attach the callback that is used to report loading progress;
      // similarly to how viewer.js works.
      loadingTask.onProgress = function (progressData) {
        if (!isProgressReportedResolved) {
          isProgressReportedResolved = true;
          progressReportedCapability.resolve(progressData);
        }
      };

      var promises = [
        progressReportedCapability.promise,
        loadingTask.promise
      ];
      Promise.all(promises).then(function (data) {
        expect((data[0].loaded / data[0].total) >= 0).toEqual(true);
        expect(data[1] instanceof PDFDocumentProxy).toEqual(true);
        expect(loadingTask).toEqual(data[1].loadingTask);
        loadingTask.destroy().then(done);
      }).catch(done.fail);
    });
    it('creates pdf doc from URL and aborts before worker initialized',
        function(done) {
      var loadingTask = getDocument(basicApiGetDocumentParams);
      let destroyed = loadingTask.destroy();

      loadingTask.promise.then(function(reason) {
        done.fail('shall fail loading');
      }).catch(function (reason) {
        expect(true).toEqual(true);
        destroyed.then(done);
      });
    });
    it('creates pdf doc from URL and aborts loading after worker initialized',
        function(done) {
      var loadingTask = getDocument(basicApiGetDocumentParams);
      // This can be somewhat random -- we cannot guarantee perfect
      // 'Terminate' message to the worker before/after setting up pdfManager.
      var destroyed = loadingTask._worker.promise.then(function () {
        return loadingTask.destroy();
      });
      destroyed.then(function (data) {
        expect(true).toEqual(true);
        done();
      }).catch(done.fail);
    });
    it('creates pdf doc from typed array', function(done) {
      var typedArrayPdf;
      if (isNodeJS()) {
        typedArrayPdf = NodeFileReaderFactory.fetch({
          path: TEST_PDFS_PATH.node + basicApiFileName,
        });
      } else {
        let nonBinaryRequest = false;
        let request = new XMLHttpRequest();
        request.open('GET', TEST_PDFS_PATH.dom + basicApiFileName, false);
        try {
          request.responseType = 'arraybuffer';
          nonBinaryRequest = request.responseType !== 'arraybuffer';
        } catch (e) {
          nonBinaryRequest = true;
        }
        if (nonBinaryRequest && request.overrideMimeType) {
          request.overrideMimeType('text/plain; charset=x-user-defined');
        }
        request.send(null);

        if (nonBinaryRequest) {
          typedArrayPdf = stringToBytes(request.responseText);
        } else {
          typedArrayPdf = new Uint8Array(request.response);
        }
      }
      // Sanity check to make sure that we fetched the entire PDF file.
      expect(typedArrayPdf.length).toEqual(basicApiFileLength);

      const loadingTask = getDocument(typedArrayPdf);

      const progressReportedCapability = createPromiseCapability();
      loadingTask.onProgress = function(data) {
        progressReportedCapability.resolve(data);
      };

      Promise.all([
        loadingTask.promise,
        progressReportedCapability.promise,
      ]).then(function(data) {
        expect(data[0] instanceof PDFDocumentProxy).toEqual(true);
        expect(data[1].loaded / data[1].total).toEqual(1);

        loadingTask.destroy().then(done);
      }).catch(done.fail);
    });
    it('creates pdf doc from invalid PDF file', function(done) {
      // A severely corrupt PDF file (even Adobe Reader fails to open it).
      var loadingTask = getDocument(buildGetDocumentParams('bug1020226.pdf'));
      loadingTask.promise.then(function () {
        done.fail('shall fail loading');
      }).catch(function (error) {
        expect(error instanceof InvalidPDFException).toEqual(true);
        loadingTask.destroy().then(done);
      });
    });
    it('creates pdf doc from non-existent URL', function(done) {
      var loadingTask = getDocument(
        buildGetDocumentParams('non-existent.pdf'));
      loadingTask.promise.then(function(error) {
        done.fail('shall fail loading');
      }).catch(function (error) {
        expect(error instanceof MissingPDFException).toEqual(true);
        loadingTask.destroy().then(done);
      });
    });
    it('creates pdf doc from PDF file protected with user and owner password',
        function (done) {
      var loadingTask = getDocument(buildGetDocumentParams('pr6531_1.pdf'));

      var isPasswordNeededResolved = false;
      var passwordNeededCapability = createPromiseCapability();
      var isPasswordIncorrectResolved = false;
      var passwordIncorrectCapability = createPromiseCapability();

      // Attach the callback that is used to request a password;
      // similarly to how viewer.js handles passwords.
      loadingTask.onPassword = function (updatePassword, reason) {
        if (reason === PasswordResponses.NEED_PASSWORD &&
            !isPasswordNeededResolved) {
          isPasswordNeededResolved = true;
          passwordNeededCapability.resolve();

          updatePassword('qwerty'); // Provide an incorrect password.
          return;
        }
        if (reason === PasswordResponses.INCORRECT_PASSWORD &&
            !isPasswordIncorrectResolved) {
          isPasswordIncorrectResolved = true;
          passwordIncorrectCapability.resolve();

          updatePassword('asdfasdf'); // Provide the correct password.
          return;
        }
        // Shouldn't get here.
        expect(false).toEqual(true);
      };

      var promises = [
        passwordNeededCapability.promise,
        passwordIncorrectCapability.promise,
        loadingTask.promise
      ];
      Promise.all(promises).then(function (data) {
        expect(data[2] instanceof PDFDocumentProxy).toEqual(true);
        loadingTask.destroy().then(done);
      }).catch(done.fail);
    });
    it('creates pdf doc from PDF file protected with only a user password',
        function (done) {
      var filename = 'pr6531_2.pdf';

      var passwordNeededLoadingTask = getDocument(
        buildGetDocumentParams(filename, {
          password: '',
        }));
      var result1 = passwordNeededLoadingTask.promise.then(function () {
        done.fail('shall fail with no password');
        return Promise.reject(new Error('loadingTask should be rejected'));
      }, function (data) {
        expect(data instanceof PasswordException).toEqual(true);
        expect(data.code).toEqual(PasswordResponses.NEED_PASSWORD);
        return passwordNeededLoadingTask.destroy();
      });

      var passwordIncorrectLoadingTask = getDocument(
        buildGetDocumentParams(filename, {
          password: 'qwerty',
        }));
      var result2 = passwordIncorrectLoadingTask.promise.then(function () {
        done.fail('shall fail with wrong password');
        return Promise.reject(new Error('loadingTask should be rejected'));
      }, function (data) {
        expect(data instanceof PasswordException).toEqual(true);
        expect(data.code).toEqual(PasswordResponses.INCORRECT_PASSWORD);
        return passwordIncorrectLoadingTask.destroy();
      });

      var passwordAcceptedLoadingTask = getDocument(
        buildGetDocumentParams(filename, {
          password: 'asdfasdf',
        }));
      var result3 = passwordAcceptedLoadingTask.promise.then(function (data) {
        expect(data instanceof PDFDocumentProxy).toEqual(true);
        return passwordAcceptedLoadingTask.destroy();
      });
      Promise.all([result1, result2, result3]).then(function () {
        done();
      }).catch(done.fail);
    });

    it('creates pdf doc from password protected PDF file and aborts/throws ' +
       'in the onPassword callback (issue 7806)', function (done) {
      var filename = 'issue3371.pdf';

      var passwordNeededLoadingTask = getDocument(
        buildGetDocumentParams(filename));
      var passwordIncorrectLoadingTask = getDocument(
        buildGetDocumentParams(filename, {
          password: 'qwerty',
        }));

      let passwordNeededDestroyed;
      passwordNeededLoadingTask.onPassword = function (callback, reason) {
        if (reason === PasswordResponses.NEED_PASSWORD) {
          passwordNeededDestroyed = passwordNeededLoadingTask.destroy();
          return;
        }
        // Shouldn't get here.
        expect(false).toEqual(true);
      };
      var result1 = passwordNeededLoadingTask.promise.then(function () {
        done.fail('shall fail since the loadingTask should be destroyed');
        return Promise.reject(new Error('loadingTask should be rejected'));
      }, function (reason) {
        expect(reason instanceof PasswordException).toEqual(true);
        expect(reason.code).toEqual(PasswordResponses.NEED_PASSWORD);
        return passwordNeededDestroyed;
      });

      passwordIncorrectLoadingTask.onPassword = function (callback, reason) {
        if (reason === PasswordResponses.INCORRECT_PASSWORD) {
          throw new Error('Incorrect password');
        }
        // Shouldn't get here.
        expect(false).toEqual(true);
      };
      var result2 = passwordIncorrectLoadingTask.promise.then(function () {
        done.fail('shall fail since the onPassword callback should throw');
        return Promise.reject(new Error('loadingTask should be rejected'));
      }, function (reason) {
        expect(reason instanceof PasswordException).toEqual(true);
        expect(reason.code).toEqual(PasswordResponses.INCORRECT_PASSWORD);
        return passwordIncorrectLoadingTask.destroy();
      });

      Promise.all([result1, result2]).then(function () {
        done();
      }).catch(done.fail);
    });
  });

  describe('PDFWorker', function() {
    it('worker created or destroyed', function (done) {
      if (isNodeJS()) {
        pending('Worker is not supported in Node.js.');
      }

      var worker = new PDFWorker({ name: 'test1', });
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
      }).catch(done.fail);
    });
    it('worker created or destroyed by getDocument', function (done) {
      if (isNodeJS()) {
        pending('Worker is not supported in Node.js.');
      }

      var loadingTask = getDocument(basicApiGetDocumentParams);
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
      }).catch(done.fail);
    });
    it('worker created and can be used in getDocument', function (done) {
      if (isNodeJS()) {
        pending('Worker is not supported in Node.js.');
      }

      var worker = new PDFWorker({ name: 'test1', });
      var loadingTask = getDocument(
        buildGetDocumentParams(basicApiFileName, {
          worker,
        }));
      loadingTask.promise.then(function () {
        var docWorker = loadingTask._worker;
        expect(!!docWorker).toEqual(false);
        // checking is the same port is used in the MessageHandler
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
      }).catch(done.fail);
    });
    it('creates more than one worker', function (done) {
      if (isNodeJS()) {
        pending('Worker is not supported in Node.js.');
      }

      var worker1 = new PDFWorker({ name: 'test1', });
      var worker2 = new PDFWorker({ name: 'test2', });
      var worker3 = new PDFWorker({ name: 'test3', });
      var ready = Promise.all([worker1.promise, worker2.promise,
        worker3.promise]);
      ready.then(function () {
        expect(worker1.port !== worker2.port &&
               worker1.port !== worker3.port &&
               worker2.port !== worker3.port).toEqual(true);
        worker1.destroy();
        worker2.destroy();
        worker3.destroy();
        done();
      }).catch(done.fail);
    });
    it('gets current workerSrc', function() {
      if (isNodeJS()) {
        pending('Worker is not supported in Node.js.');
      }

      let workerSrc = PDFWorker.getWorkerSrc();
      expect(typeof workerSrc).toEqual('string');
      expect(workerSrc).toEqual(GlobalWorkerOptions.workerSrc);
    });
  });
  describe('PDFDocument', function() {
    var loadingTask;
    var doc;

    beforeAll(function(done) {
      loadingTask = getDocument(basicApiGetDocumentParams);
      loadingTask.promise.then(function(data) {
        doc = data;
        done();
      });
    });

    afterAll(function(done) {
      loadingTask.destroy().then(done);
    });

    it('gets number of pages', function() {
      expect(doc.numPages).toEqual(3);
    });
    it('gets fingerprint', function() {
      var fingerprint = doc.fingerprint;
      expect(typeof fingerprint).toEqual('string');
      expect(fingerprint.length > 0).toEqual(true);
    });
    it('gets page', function(done) {
      var promise = doc.getPage(1);
      promise.then(function(data) {
        expect(data instanceof PDFPageProxy).toEqual(true);
        expect(data.pageIndex).toEqual(0);
        done();
      }).catch(done.fail);
    });
    it('gets non-existent page', function(done) {
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

      Promise.all([outOfRangePromise, nonIntegerPromise, nonNumberPromise]).
        then(function () {
          done();
        }).catch(done.fail);
    });
    it('gets page index', function(done) {
      // reference to second page
      var ref = { num: 17, gen: 0, };
      var promise = doc.getPageIndex(ref);
      promise.then(function(pageIndex) {
        expect(pageIndex).toEqual(1);
        done();
      }).catch(done.fail);
    });
    it('gets invalid page index', function (done) {
      var ref = { num: 3, gen: 0, }; // Reference to a font dictionary.
      var promise = doc.getPageIndex(ref);
      promise.then(function () {
        done.fail('shall fail for invalid page reference.');
      }).catch(function (reason) {
        expect(reason instanceof Error).toEqual(true);
        done();
      });
    });

    it('gets destinations, from /Dests dictionary', function(done) {
      var promise = doc.getDestinations();
      promise.then(function(data) {
        expect(data).toEqual({
          chapter1: [{ gen: 0, num: 17, }, { name: 'XYZ', }, 0, 841.89, null],
        });
        done();
      }).catch(done.fail);
    });
    it('gets a destination, from /Dests dictionary', function(done) {
      var promise = doc.getDestination('chapter1');
      promise.then(function(data) {
        expect(data).toEqual([{ gen: 0, num: 17, }, { name: 'XYZ', },
                              0, 841.89, null]);
        done();
      }).catch(done.fail);
    });
    it('gets a non-existent destination, from /Dests dictionary',
        function(done) {
      var promise = doc.getDestination('non-existent-named-destination');
      promise.then(function(data) {
        expect(data).toEqual(null);
        done();
      }).catch(done.fail);
    });

    it('gets destinations, from /Names (NameTree) dictionary', function(done) {
      var loadingTask = getDocument(buildGetDocumentParams('issue6204.pdf'));
      var promise = loadingTask.promise.then(function (pdfDocument) {
        return pdfDocument.getDestinations();
      });
      promise.then(function (destinations) {
        expect(destinations).toEqual({
          'Page.1': [{ num: 1, gen: 0, }, { name: 'XYZ', }, 0, 375, null],
          'Page.2': [{ num: 6, gen: 0, }, { name: 'XYZ', }, 0, 375, null],
        });

        loadingTask.destroy().then(done);
      }).catch(done.fail);
    });
    it('gets a destination, from /Names (NameTree) dictionary', function(done) {
      var loadingTask = getDocument(buildGetDocumentParams('issue6204.pdf'));
      var promise = loadingTask.promise.then(function (pdfDocument) {
        return pdfDocument.getDestination('Page.1');
      });
      promise.then(function (destination) {
        expect(destination).toEqual([{ num: 1, gen: 0, }, { name: 'XYZ', },
                                     0, 375, null]);

        loadingTask.destroy().then(done);
      }).catch(done.fail);
    });
    it('gets a non-existent destination, from /Names (NameTree) dictionary',
        function(done) {
      var loadingTask = getDocument(buildGetDocumentParams('issue6204.pdf'));
      var promise = loadingTask.promise.then(function (pdfDocument) {
        return pdfDocument.getDestination('non-existent-named-destination');
      });
      promise.then(function (destination) {
        expect(destination).toEqual(null);

        loadingTask.destroy().then(done);
      }).catch(done.fail);
    });

    it('gets non-string destination', function(done) {
      let numberPromise = doc.getDestination(4.3);
      let booleanPromise = doc.getDestination(true);
      let arrayPromise = doc.getDestination([
        { num: 17, gen: 0, }, { name: 'XYZ', }, 0, 841.89, null]);

      numberPromise = numberPromise.then(function() {
        throw new Error('shall fail for non-string destination.');
      }, function(reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      booleanPromise = booleanPromise.then(function() {
        throw new Error('shall fail for non-string destination.');
      }, function(reason) {
        expect(reason instanceof Error).toEqual(true);
      });
      arrayPromise = arrayPromise.then(function() {
        throw new Error('shall fail for non-string destination.');
      }, function(reason) {
        expect(reason instanceof Error).toEqual(true);
      });

      Promise.all([numberPromise, booleanPromise, arrayPromise]).then(
        done, done.fail);
    });

    it('gets non-existent page labels', function (done) {
      var promise = doc.getPageLabels();
      promise.then(function (data) {
        expect(data).toEqual(null);
        done();
      }).catch(done.fail);
    });
    it('gets page labels', function (done) {
      // PageLabels with Roman/Arabic numerals.
      var loadingTask0 = getDocument(buildGetDocumentParams('bug793632.pdf'));
      var promise0 = loadingTask0.promise.then(function (pdfDoc) {
        return pdfDoc.getPageLabels();
      });

      // PageLabels with only a label prefix.
      var loadingTask1 = getDocument(buildGetDocumentParams('issue1453.pdf'));
      var promise1 = loadingTask1.promise.then(function (pdfDoc) {
        return pdfDoc.getPageLabels();
      });

      // PageLabels identical to standard page numbering.
      var loadingTask2 = getDocument(buildGetDocumentParams('rotation.pdf'));
      var promise2 = loadingTask2.promise.then(function (pdfDoc) {
        return pdfDoc.getPageLabels();
      });

      // PageLabels with bad "Prefix" entries.
      var loadingTask3 = getDocument(
        buildGetDocumentParams('bad-PageLabels.pdf'));
      var promise3 = loadingTask3.promise.then(function (pdfDoc) {
        return pdfDoc.getPageLabels();
      });

      Promise.all([promise0, promise1, promise2, promise3]).then(
          function (pageLabels) {
        expect(pageLabels[0]).toEqual(['i', 'ii', 'iii', '1']);
        expect(pageLabels[1]).toEqual(['Front Page1']);
        expect(pageLabels[2]).toEqual(['1', '2']);
        expect(pageLabels[3]).toEqual(['X3']);

        Promise.all([
          loadingTask0.destroy(),
          loadingTask1.destroy(),
          loadingTask2.destroy(),
          loadingTask3.destroy()
        ]).then(done);
      }).catch(done.fail);
    });

    it('gets default page mode', function(done) {
      var loadingTask = getDocument(buildGetDocumentParams('tracemonkey.pdf'));

      loadingTask.promise.then(function(pdfDocument) {
        return pdfDocument.getPageMode();
      }).then(function(mode) {
        expect(mode).toEqual('UseNone');

        loadingTask.destroy().then(done);
      }).catch(done.fail);
    });
    it('gets non-default page mode', function(done) {
      doc.getPageMode().then(function(mode) {
        expect(mode).toEqual('UseOutlines');
        done();
      }).catch(done.fail);
    });

    it('gets non-existent attachments', function(done) {
      var promise = doc.getAttachments();
      promise.then(function (data) {
        expect(data).toEqual(null);
        done();
      }).catch(done.fail);
    });
    it('gets attachments', function(done) {
      if (isNodeJS()) { // The PDF file used is a linked test-case.
        pending('TODO: Use a non-linked test-case.');
      }
      var loadingTask = getDocument(buildGetDocumentParams('bug766138.pdf'));
      var promise = loadingTask.promise.then(function (pdfDoc) {
        return pdfDoc.getAttachments();
      });
      promise.then(function (data) {
        var attachment = data['Press Quality.joboptions'];
        expect(attachment.filename).toEqual('Press Quality.joboptions');
        expect(attachment.content instanceof Uint8Array).toBeTruthy();
        expect(attachment.content.length).toEqual(30098);

        loadingTask.destroy().then(done);
      }).catch(done.fail);
    });

    it('gets javascript', function(done) {
      var promise = doc.getJavaScript();
      promise.then(function (data) {
        expect(data).toEqual(null);
        done();
      }).catch(done.fail);
    });
    // Keep this in sync with the pattern in viewer.js. The pattern is used to
    // detect whether or not to automatically start printing.
    var viewerPrintRegExp = /\bprint\s*\(/;
    it('gets javascript with printing instructions (Print action)',
        function(done) {
      // PDF document with "Print" Named action in OpenAction
      var loadingTask = getDocument(buildGetDocumentParams('bug1001080.pdf'));
      var promise = loadingTask.promise.then(function(doc) {
        return doc.getJavaScript();
      });
      promise.then(function (data) {
        expect(data).toEqual(['print({});']);
        expect(data[0]).toMatch(viewerPrintRegExp);
        loadingTask.destroy().then(done);
      }).catch(done.fail);
    });
    it('gets javascript with printing instructions (JS action)',
        function(done) {
      // PDF document with "JavaScript" action in OpenAction
      var loadingTask = getDocument(buildGetDocumentParams('issue6106.pdf'));
      var promise = loadingTask.promise.then(function(doc) {
        return doc.getJavaScript();
      });
      promise.then(function (data) {
        expect(data).toEqual(
          ['this.print({bUI:true,bSilent:false,bShrinkToFit:true});']);
        expect(data[0]).toMatch(viewerPrintRegExp);
        loadingTask.destroy().then(done);
      }).catch(done.fail);
    });
    it('gets non-existent outline', function(done) {
      var loadingTask = getDocument(buildGetDocumentParams('tracemonkey.pdf'));

      var promise = loadingTask.promise.then(function (pdfDocument) {
        return pdfDocument.getOutline();
      });
      promise.then(function (outline) {
        expect(outline).toEqual(null);

        loadingTask.destroy().then(done);
      }).catch(done.fail);
    });
    it('gets outline', function(done) {
      var promise = doc.getOutline();
      promise.then(function(outline) {
        // Two top level entries.
        expect(Array.isArray(outline)).toEqual(true);
        expect(outline.length).toEqual(2);
        // Make sure some basic attributes are set.
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
      }).catch(done.fail);
    });
    it('gets outline containing a url', function(done) {
      var loadingTask = getDocument(buildGetDocumentParams('issue3214.pdf'));

      loadingTask.promise.then(function (pdfDocument) {
        pdfDocument.getOutline().then(function (outline) {
          expect(Array.isArray(outline)).toEqual(true);
          expect(outline.length).toEqual(5);

          var outlineItemTwo = outline[2];
          expect(typeof outlineItemTwo.title).toEqual('string');
          expect(outlineItemTwo.dest).toEqual(null);
          expect(outlineItemTwo.url).toEqual('http://google.com/');
          expect(outlineItemTwo.unsafeUrl).toEqual('http://google.com');
          expect(outlineItemTwo.newWindow).toBeUndefined();

          var outlineItemOne = outline[1];
          expect(outlineItemOne.bold).toEqual(false);
          expect(outlineItemOne.italic).toEqual(true);
          expect(outlineItemOne.color).toEqual(
            new Uint8ClampedArray([0, 0, 0]));

          loadingTask.destroy().then(done);
        });
      }).catch(done.fail);
    });

    it('gets non-existent permissions', function(done) {
      doc.getPermissions().then(function(permissions) {
        expect(permissions).toEqual(null);

        done();
      }).catch(done.fail);
    });

    it('gets permissions', function (done) {
      // Editing not allowed.
      const loadingTask0 =
        getDocument(buildGetDocumentParams('issue9972-1.pdf'));
      const promise0 = loadingTask0.promise.then(function(pdfDocument) {
        return pdfDocument.getPermissions();
      });

      // Printing not allowed.
      const loadingTask1 =
        getDocument(buildGetDocumentParams('issue9972-2.pdf'));
      const promise1 = loadingTask1.promise.then(function(pdfDocument) {
        return pdfDocument.getPermissions();
      });

      // Copying not allowed.
      const loadingTask2 =
        getDocument(buildGetDocumentParams('issue9972-3.pdf'));
      const promise2 = loadingTask2.promise.then(function(pdfDocument) {
        return pdfDocument.getPermissions();
      });

      const totalPermissionCount = Object.keys(PermissionFlag).length;
      Promise.all([promise0, promise1, promise2]).then(function(permissions) {
        expect(permissions[0].length).toEqual(totalPermissionCount - 1);
        expect(permissions[0].includes(PermissionFlag.MODIFY_CONTENTS))
          .toBeFalsy();

        expect(permissions[1].length).toEqual(totalPermissionCount - 2);
        expect(permissions[1].includes(PermissionFlag.PRINT)).toBeFalsy();
        expect(permissions[1].includes(PermissionFlag.PRINT_HIGH_QUALITY))
          .toBeFalsy();

        expect(permissions[2].length).toEqual(totalPermissionCount - 1);
        expect(permissions[2].includes(PermissionFlag.COPY)).toBeFalsy();

        Promise.all([
          loadingTask0.destroy(),
          loadingTask1.destroy(),
          loadingTask2.destroy(),
        ]).then(done);
      }).catch(done.fail);
    });

    it('gets metadata', function(done) {
      var promise = doc.getMetadata();
      promise.then(function({ info, metadata, contentDispositionFilename, }) {
        expect(info['Title']).toEqual('Basic API Test');
        // The following are PDF.js specific, non-standard, properties.
        expect(info['PDFFormatVersion']).toEqual('1.7');
        expect(info['IsLinearized']).toEqual(false);
        expect(info['IsAcroFormPresent']).toEqual(false);
        expect(info['IsXFAPresent']).toEqual(false);

        expect(metadata instanceof Metadata).toEqual(true);
        expect(metadata.get('dc:title')).toEqual('Basic API Test');

        expect(contentDispositionFilename).toEqual(null);
        done();
      }).catch(done.fail);
    });
    it('gets data', function(done) {
      var promise = doc.getData();
      promise.then(function (data) {
        expect(data instanceof Uint8Array).toEqual(true);
        expect(data.length).toEqual(basicApiFileLength);
        done();
      }).catch(done.fail);
    });
    it('gets download info', function(done) {
      var promise = doc.getDownloadInfo();
      promise.then(function (data) {
        expect(data).toEqual({ length: basicApiFileLength, });
        done();
      }).catch(done.fail);
    });
    it('gets document stats', function(done) {
      var promise = doc.getStats();
      promise.then(function (stats) {
        expect(stats).toEqual({ streamTypes: [], fontTypes: [], });
        done();
      }).catch(done.fail);
    });

    it('checks that fingerprints are unique', function(done) {
      var loadingTask1 = getDocument(buildGetDocumentParams('issue4436r.pdf'));

      var loadingTask2 = getDocument(buildGetDocumentParams('issue4575.pdf'));

      var promises = [loadingTask1.promise,
                      loadingTask2.promise];
      Promise.all(promises).then(function (data) {
        var fingerprint1 = data[0].fingerprint;
        expect(typeof fingerprint1).toEqual('string');
        expect(fingerprint1.length > 0).toEqual(true);

        var fingerprint2 = data[1].fingerprint;
        expect(typeof fingerprint2).toEqual('string');
        expect(fingerprint2.length > 0).toEqual(true);

        expect(fingerprint1).not.toEqual(fingerprint2);

        Promise.all([
          loadingTask1.destroy(),
          loadingTask2.destroy()
        ]).then(done);
      }).catch(done.fail);
    });

    describe('Cross-origin', function() {
      var loadingTask;
      function _checkCanLoad(expectSuccess, filename, options) {
        if (isNodeJS()) {
          pending('Cannot simulate cross-origin requests in Node.js');
        }
        var params = buildGetDocumentParams(filename, options);
        var url = new URL(params.url);
        if (url.hostname === 'localhost') {
          url.hostname = '127.0.0.1';
        } else if (params.url.hostname === '127.0.0.1') {
          url.hostname = 'localhost';
        } else {
          pending('Can only run cross-origin test on localhost!');
        }
        params.url = url.href;
        loadingTask = getDocument(params);
        return loadingTask.promise.then(function(pdf) {
          return pdf.destroy();
        }).then(function() {
          expect(expectSuccess).toEqual(true);
        }, function(error) {
          if (expectSuccess) {
            // For ease of debugging.
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
      afterEach(function(done) {
        if (loadingTask) {
          loadingTask.destroy().then(done);
        } else {
          done();
        }
      });
      it('server disallows cors', function(done) {
        testCannotLoad('basicapi.pdf').then(done);
      });
      it('server allows cors without credentials, default withCredentials',
          function(done) {
        testCanLoad('basicapi.pdf?cors=withoutCredentials').then(done);
      });
      it('server allows cors without credentials, and withCredentials=false',
          function(done) {
        testCanLoad('basicapi.pdf?cors=withoutCredentials', {
          withCredentials: false,
        }).then(done);
      });
      it('server allows cors without credentials, but withCredentials=true',
          function(done) {
        testCannotLoad('basicapi.pdf?cors=withoutCredentials', {
          withCredentials: true,
        }).then(done);
      });
      it('server allows cors with credentials, and withCredentials=true',
          function(done) {
        testCanLoad('basicapi.pdf?cors=withCredentials', {
          withCredentials: true,
        }).then(done);
      });
      it('server allows cors with credentials, and withCredentials=false',
          function(done) {
        // The server supports even more than we need, so if the previous tests
        // pass, then this should pass for sure.
        // The only case where this test fails is when the server does not reply
        // with the Access-Control-Allow-Origin header.
        testCanLoad('basicapi.pdf?cors=withCredentials', {
          withCredentials: false,
        }).then(done);
      });
    });
  });
  describe('Page', function() {
    var loadingTask;
    var pdfDocument, page;

    beforeAll(function(done) {
      loadingTask = getDocument(basicApiGetDocumentParams);
      loadingTask.promise.then(function(doc) {
        pdfDocument = doc;
        pdfDocument.getPage(1).then(function(data) {
          page = data;
          done();
        });
      }).catch(done.fail);
    });

    afterAll(function(done) {
      loadingTask.destroy().then(done);
    });

    it('gets page number', function () {
      expect(page.pageNumber).toEqual(1);
    });
    it('gets rotate', function () {
      expect(page.rotate).toEqual(0);
    });
    it('gets ref', function () {
      expect(page.ref).toEqual({ num: 15, gen: 0, });
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
    it('gets viewport respecting "dontFlip" argument', function () {
      const scale = 1;
      const rotation = 135;
      let viewport = page.getViewport(scale, rotation);
      let dontFlipViewport = page.getViewport(scale, rotation, true);

      expect(dontFlipViewport).not.toEqual(viewport);
      expect(dontFlipViewport).toEqual(viewport.clone({ dontFlip: true, }));

      expect(viewport.transform).toEqual([1, 0, 0, -1, 0, 841.89]);
      expect(dontFlipViewport.transform).toEqual([1, 0, -0, 1, 0, 0]);
    });
    it('gets annotations', function (done) {
      var defaultPromise = page.getAnnotations().then(function (data) {
        expect(data.length).toEqual(4);
      });

      var displayPromise = page.getAnnotations({ intent: 'display', }).then(
          function (data) {
        expect(data.length).toEqual(4);
      });

      var printPromise = page.getAnnotations({ intent: 'print', }).then(
          function (data) {
        expect(data.length).toEqual(4);
      });
      Promise.all([defaultPromise, displayPromise, printPromise]).then(
          function () {
        done();
      }).catch(done.fail);
    });

    it('gets annotations containing relative URLs (bug 766086)',
        function (done) {
      var filename = 'bug766086.pdf';

      var defaultLoadingTask = getDocument(buildGetDocumentParams(filename));
      var defaultPromise = defaultLoadingTask.promise.then(function (pdfDoc) {
        return pdfDoc.getPage(1).then(function (pdfPage) {
          return pdfPage.getAnnotations();
        });
      });

      var docBaseUrlLoadingTask = getDocument(
        buildGetDocumentParams(filename, {
          docBaseUrl: 'http://www.example.com/test/pdfs/qwerty.pdf',
        }));
      var docBaseUrlPromise = docBaseUrlLoadingTask.promise.then(
          function (pdfDoc) {
        return pdfDoc.getPage(1).then(function (pdfPage) {
          return pdfPage.getAnnotations();
        });
      });

      var invalidDocBaseUrlLoadingTask = getDocument(
        buildGetDocumentParams(filename, {
          docBaseUrl: 'qwerty.pdf',
        }));
      var invalidDocBaseUrlPromise = invalidDocBaseUrlLoadingTask.promise.then(
          function (pdfDoc) {
        return pdfDoc.getPage(1).then(function (pdfPage) {
          return pdfPage.getAnnotations();
        });
      });

      Promise.all([defaultPromise, docBaseUrlPromise,
                   invalidDocBaseUrlPromise]).then(function (data) {
        var defaultAnnotations = data[0];
        var docBaseUrlAnnotations = data[1];
        var invalidDocBaseUrlAnnotations = data[2];

        expect(defaultAnnotations[0].url).toBeUndefined();
        expect(defaultAnnotations[0].unsafeUrl).toEqual(
          '../../0021/002156/215675E.pdf#15');

        expect(docBaseUrlAnnotations[0].url).toEqual(
          'http://www.example.com/0021/002156/215675E.pdf#15');
        expect(docBaseUrlAnnotations[0].unsafeUrl).toEqual(
          '../../0021/002156/215675E.pdf#15');

        expect(invalidDocBaseUrlAnnotations[0].url).toBeUndefined();
        expect(invalidDocBaseUrlAnnotations[0].unsafeUrl).toEqual(
          '../../0021/002156/215675E.pdf#15');

        Promise.all([
          defaultLoadingTask.destroy(),
          docBaseUrlLoadingTask.destroy(),
          invalidDocBaseUrlLoadingTask.destroy()
        ]).then(done);
      }).catch(done.fail);
    });

    it('gets text content', function (done) {
      var defaultPromise = page.getTextContent();
      var parametersPromise = page.getTextContent({
        normalizeWhitespace: true,
        disableCombineTextItems: true,
      });

      var promises = [
        defaultPromise,
        parametersPromise,
      ];
      Promise.all(promises).then(function (data) {
        expect(!!data[0].items).toEqual(true);
        expect(data[0].items.length).toEqual(7);
        expect(!!data[0].styles).toEqual(true);

        // A simple check that ensures the two `textContent` object match.
        expect(JSON.stringify(data[0])).toEqual(JSON.stringify(data[1]));
        done();
      }).catch(done.fail);
    });
    it('gets operator list', function(done) {
      var promise = page.getOperatorList();
      promise.then(function (oplist) {
        expect(!!oplist.fnArray).toEqual(true);
        expect(!!oplist.argsArray).toEqual(true);
        expect(oplist.lastChunk).toEqual(true);
        done();
      }).catch(done.fail);
    });
    it('gets operatorList with JPEG image (issue 4888)', function(done) {
      let loadingTask = getDocument(buildGetDocumentParams('cmykjpeg.pdf'));

      loadingTask.promise.then((pdfDoc) => {
        pdfDoc.getPage(1).then((pdfPage) => {
          pdfPage.getOperatorList().then((opList) => {
            let imgIndex = opList.fnArray.indexOf(OPS.paintImageXObject);
            let imgArgs = opList.argsArray[imgIndex];
            let { data: imgData, } = pdfPage.objs.get(imgArgs[0]);

            expect(imgData instanceof Uint8ClampedArray).toEqual(true);
            expect(imgData.length).toEqual(90000);
            done();
          });
        });
      }).catch(done.fail);
    });
    it('gets document stats after parsing page', function(done) {
      var promise = page.getOperatorList().then(function () {
        return pdfDocument.getStats();
      });
      var expectedStreamTypes = [];
      expectedStreamTypes[StreamType.FLATE] = true;
      var expectedFontTypes = [];
      expectedFontTypes[FontType.TYPE1] = true;
      expectedFontTypes[FontType.CIDFONTTYPE2] = true;

      promise.then(function (stats) {
        expect(stats).toEqual({ streamTypes: expectedStreamTypes,
                                fontTypes: expectedFontTypes, });
        done();
      }).catch(done.fail);
    });

    it('gets page stats after parsing page, without `pdfBug` set',
        function(done) {
      page.getOperatorList().then((opList) => {
        return page.stats;
      }).then((stats) => {
        expect(stats).toEqual(null);
        done();
      }, done.fail);
    });
    it('gets page stats after parsing page, with `pdfBug` set', function(done) {
      let loadingTask = getDocument(
        buildGetDocumentParams(basicApiFileName, { pdfBug: true, }));

      loadingTask.promise.then((pdfDoc) => {
        return pdfDoc.getPage(1).then((pdfPage) => {
          return pdfPage.getOperatorList().then((opList) => {
            return pdfPage.stats;
          });
        });
      }).then((stats) => {
        expect(stats instanceof StatTimer).toEqual(true);
        expect(stats.times.length).toEqual(1);

        let [statEntry] = stats.times;
        expect(statEntry.name).toEqual('Page Request');
        expect(statEntry.end - statEntry.start).toBeGreaterThan(0);

        loadingTask.destroy().then(done);
      }, done.fail);
    });
    it('gets page stats after rendering page, with `pdfBug` set',
        function(done) {
      if (isNodeJS()) {
        pending('TODO: Support Canvas testing in Node.js.');
      }
      let loadingTask = getDocument(
        buildGetDocumentParams(basicApiFileName, { pdfBug: true, }));
      let canvasAndCtx;

      loadingTask.promise.then((pdfDoc) => {
        return pdfDoc.getPage(1).then((pdfPage) => {
          let viewport = pdfPage.getViewport(1);
          canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);

          let renderTask = pdfPage.render({
            canvasContext: canvasAndCtx.context,
            viewport,
          });
          return renderTask.promise.then(() => {
            return pdfPage.stats;
          });
        });
      }).then((stats) => {
        expect(stats instanceof StatTimer).toEqual(true);
        expect(stats.times.length).toEqual(3);

        let [statEntryOne, statEntryTwo, statEntryThree] = stats.times;
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

    it('cancels rendering of page', function(done) {
      if (isNodeJS()) {
        pending('TODO: Support Canvas testing in Node.js.');
      }
      var viewport = page.getViewport(1);
      var canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);

      var renderTask = page.render({
        canvasContext: canvasAndCtx.context,
        viewport,
      });
      renderTask.cancel();

      renderTask.promise.then(function() {
        done.fail('shall cancel rendering');
      }).catch(function (error) {
        expect(error instanceof RenderingCancelledException).toEqual(true);
        expect(error.type).toEqual('canvas');
        CanvasFactory.destroy(canvasAndCtx);
        done();
      });
    });

    it('re-render page, using the same canvas, after cancelling rendering',
        function(done) {
      if (isNodeJS()) {
        pending('TODO: Support Canvas testing in Node.js.');
      }
      let viewport = page.getViewport(1);
      let canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);

      let renderTask = page.render({
        canvasContext: canvasAndCtx.context,
        viewport,
      });
      renderTask.cancel();

      renderTask.promise.then(() => {
        throw new Error('shall cancel rendering');
      }, (reason) => {
        expect(reason instanceof RenderingCancelledException).toEqual(true);
      }).then(() => {
        let reRenderTask = page.render({
          canvasContext: canvasAndCtx.context,
          viewport,
        });
        return reRenderTask.promise;
      }).then(() => {
        CanvasFactory.destroy(canvasAndCtx);
        done();
      }, done.fail);
    });

    it('multiple render() on the same canvas', function(done) {
      if (isNodeJS()) {
        pending('TODO: Support Canvas testing in Node.js.');
      }
      var viewport = page.getViewport(1);
      var canvasAndCtx = CanvasFactory.create(viewport.width, viewport.height);

      var renderTask1 = page.render({
        canvasContext: canvasAndCtx.context,
        viewport,
      });
      var renderTask2 = page.render({
        canvasContext: canvasAndCtx.context,
        viewport,
      });

      Promise.all([
        renderTask1.promise,
        renderTask2.promise.then(() => {
          done.fail('shall fail rendering');
        }, (reason) => {
          /* it fails because we already using this canvas */
          expect(/multiple render\(\)/.test(reason.message)).toEqual(true);
        })
      ]).then(done);
    });
  });
  describe('Multiple `getDocument` instances', function() {
    // Regression test for https://github.com/mozilla/pdf.js/issues/6205
    // A PDF using the Helvetica font.
    var pdf1 = buildGetDocumentParams('tracemonkey.pdf');
    // A PDF using the Times font.
    var pdf2 = buildGetDocumentParams('TAMReview.pdf');
    // A PDF using the Arial font.
    var pdf3 = buildGetDocumentParams('issue6068.pdf');
    var loadingTasks = [];
    var pdfDocuments = [];

    // Render the first page of the given PDF file.
    // Fulfills the promise with the base64-encoded version of the PDF.
    function renderPDF(filename) {
      var loadingTask = getDocument(filename);
      loadingTasks.push(loadingTask);
      return loadingTask.promise
        .then(function(pdf) {
          pdfDocuments.push(pdf);
          return pdf.getPage(1);
        }).then(function(page) {
          var viewport = page.getViewport(1.2);
          var canvasAndCtx = CanvasFactory.create(viewport.width,
                                                  viewport.height);
          return page.render({
            canvasContext: canvasAndCtx.context,
            viewport,
          }).then(function() {
            var data = canvasAndCtx.canvas.toDataURL();
            CanvasFactory.destroy(canvasAndCtx);
            return data;
          });
        });
    }

    afterEach(function(done) {
      // Issue 6205 reported an issue with font rendering, so clear the loaded
      // fonts so that we can see whether loading PDFs in parallel does not
      // cause any issues with the rendered fonts.
      var destroyPromises = pdfDocuments.map(function(pdfDocument) {
        return pdfDocument.destroy();
      });

      // Destroy the workers.
      var destroyPromises2 = loadingTasks.map(function(loadingTask) {
        return loadingTask.destroy();
      });

      Promise.all(destroyPromises.concat(destroyPromises2)).then(function() {
        done();
      });
    });

    it('should correctly render PDFs in parallel', function(done) {
      if (isNodeJS()) {
        pending('TODO: Support Canvas testing in Node.js.');
      }

      var baseline1, baseline2, baseline3;
      var promiseDone = renderPDF(pdf1).then(function(data1) {
        baseline1 = data1;
        return renderPDF(pdf2);
      }).then(function(data2) {
        baseline2 = data2;
        return renderPDF(pdf3);
      }).then(function(data3) {
        baseline3 = data3;
        return Promise.all([
          renderPDF(pdf1),
          renderPDF(pdf2),
          renderPDF(pdf3),
        ]);
      }).then(function(dataUrls) {
        expect(dataUrls[0]).toEqual(baseline1);
        expect(dataUrls[1]).toEqual(baseline2);
        expect(dataUrls[2]).toEqual(baseline3);
        return true;
      });
      promiseDone.then(function() {
        done();
      }).catch(done.fail);
    });
  });
  describe('PDFDataRangeTransport', function () {
    var loadPromise;
    function getDocumentData() {
      const pdfPath = new URL('../pdfs/tracemonkey.pdf', window.location).href;
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
      if (isNodeJS()) {
        pending('XMLHttpRequest is not supported in Node.js.');
      }

      var transport;
      var initialDataLength = 4000;
      var fetches = 0;
      var getDocumentPromise = getDocumentData().then(function (data) {
        var initialData = data.subarray(0, initialDataLength);
        transport = new PDFDataRangeTransport(data.length, initialData);
        transport.requestDataRange = function (begin, end) {
          fetches++;
          waitSome(function () {
            transport.onDataProgress(4000);
            transport.onDataRange(begin, data.subarray(begin, end));
          });
        };
        var loadingTask = getDocument(transport);
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
      }).catch(done.fail);
    });
    it('should fetch document info and page using range and streaming',
        function (done) {
      if (isNodeJS()) {
        pending('XMLHttpRequest is not supported in Node.js.');
      }

      var transport;
      var initialDataLength = 4000;
      var fetches = 0;
      var getDocumentPromise = getDocumentData().then(function (data) {
        var initialData = data.subarray(0, initialDataLength);
        transport = new PDFDataRangeTransport(data.length, initialData);
        transport.requestDataRange = function (begin, end) {
          fetches++;
          if (fetches === 1) {
            // send rest of the data on first range request.
            transport.onDataProgressiveRead(data.subarray(initialDataLength));
          }
          waitSome(function () {
            transport.onDataRange(begin, data.subarray(begin, end));
          });
        };
        var loadingTask = getDocument(transport);
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
      }).catch(done.fail);
    });
  });
});
