/* Copyright 2012 Mozilla Foundation
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
/* globals PDFJS, createPromiseCapability, LocalPdfManager, NetworkPdfManager,
           NetworkManager, isInt, MissingPDFException,
           UnexpectedResponseException, PasswordException, Promise, warn,
           PasswordResponses, InvalidPDFException, UnknownErrorException,
           XRefParseException, Ref, info, globalScope, error, MessageHandler,
           org */

'use strict';

var WorkerTask = (function WorkerTaskClosure() {
  function WorkerTask(name) {
    this.name = name;
    this.terminated = false;
    this._capability = createPromiseCapability();
  }

  WorkerTask.prototype = {
    get finished() {
      return this._capability.promise;
    },

    finish: function () {
      this._capability.resolve();
    },

    terminate: function () {
      this.terminated = true;
    },

    ensureNotTerminated: function () {
      if (this.terminated) {
        throw new Error('Worker task was terminated');
      }
    }
  };

  return WorkerTask;
})();

var WorkerMessageHandler = PDFJS.WorkerMessageHandler = {
  setup: function wphSetup(handler) {
    var pdfManager;
    var todo;
    var terminated = false;
    var cancelXHRs = null;
    var WorkerTasks = [];

    function findSignatures() {
      return new Promise(function(resolve, reject) {
        pdfManager.ensureXRef('root').then(function foundAcroForm(results) {
          todo = results;
          var acroForm = results.get('AcroForm');
          if (acroForm) {
            var fields = acroForm.get('Fields');
            var promises = [];
            for (var i = 0; i < fields.length; i ++) {
              if (isRef(fields[i])) {
                var promise = pdfManager.ensureXRef('fetch', [fields[i]]);
                promises.push(promise);
              }
            }
            
            var signatureData = [];
            Promise.all(promises).then(function foundSignatures(signatures) {
              for (var i = 0; i < signatures.length; i ++) {
                var sigField = signatures[i];
                var sigFieldType = sigField.get('FT');
                if ((typeof sigFieldType === 'undefined') || (sigFieldType.name !== 'Sig'))
                  continue;

                var v = sigField.get('V');
                var byteRange = v.get('ByteRange');
                var subFilter = v.get('SubFilter');
                var contents = v.get('Contents');
                var reason = v.get('Reason');
                var time = v.get('M');
                var name = v.get('Name');
                var location = v.get('Location');
                var contactInfo = v.get('ContactInfo');
                
                signatureData.push({
                  contents: contents,
                  byteRange: byteRange,
                  type: subFilter.name,
                  name: name,
                  reason: reason,
                  time: time,
                  location: location,
                  contactInfo: contactInfo
                });
              }
              resolve(signatureData);
            }, function() {
              resolve([]);
            });
          } else {
            resolve([]);
          }
        });
      }).then(function(signatures) {
        function checkSig(sigData) {
          // TODO reformat, clean up
          try
          {
              var trustedCertificates = [];
              // TODO hack
              globalScope.exports = globalScope;
              importScripts('../src/pkijs/common.js', '../src/pkijs/asn1.js', '../src/pkijs/x509_schema.js', '../src/pkijs/x509_simpl.js', '../src/pkijs/cms_schema.js', '../src/pkijs/cms_simpl.js');
              var byteRange = sigData.byteRange;
              var contents = sigData.contents;

              var contentLength = contents.length;
              var contentBuffer = new ArrayBuffer(contentLength);
              var contentView = new Uint8Array(contentBuffer);

              for(var i = 0; i < contentLength; i++)
                  contentView[i] = contents.charCodeAt(i);

              var sequence = Promise.resolve();

              var asn1 = org.pkijs.fromBER(contentBuffer);

              var cms_content_simp = new org.pkijs.simpl.CMS_CONTENT_INFO({ schema: asn1.result });
              var cms_signed_simp = new org.pkijs.simpl.CMS_SIGNED_DATA({ schema: cms_content_simp.content });

              var signedDataBuffer = new ArrayBuffer(byteRange[1] + byteRange[3]);
              var signedDataView = new Uint8Array(signedDataBuffer);

              var count = 0;
              // TODO not kosher accessing these props
              var s = todo.xref.stream.makeSubStream(byteRange[0], byteRange[1]);
              for(var i = byteRange[0]; i < (byteRange[0] + byteRange[1]); i++, count++)
                  signedDataView[count] = s.getByte();

              var s2 = todo.xref.stream.makeSubStream(byteRange[2], byteRange[3]);
              for(var j = byteRange[2]; j < (byteRange[2] + byteRange[3]); j++, count++)
                  signedDataView[count] = s2.getByte();

              console.log(signedDataView);
              sequence = sequence.then(
                  function()
                  {
                      return cms_signed_simp.verify({ signer: 0, data: signedDataBuffer, trusted_certs: trustedCertificates });
                  }
                  );

              if("signedAttrs" in cms_signed_simp.signerInfos[0])
              {
                  var crypto = org.pkijs.getCrypto();
                  if(typeof crypto == "undefined")
                      throw new Error("WebCrypto extension is not installed");

                  var sha_algorithm = "";

                  switch(cms_signed_simp.signerInfos[0].digestAlgorithm.algorithm_id)
                  {
                      case "1.3.14.3.2.26":
                          sha_algorithm = "sha-1";
                          break;
                      case "2.16.840.1.101.3.4.2.1":
                          sha_algorithm = "sha-256";
                          break;
                      case "2.16.840.1.101.3.4.2.2":
                          sha_algorithm = "sha-384";
                          break;
                      case "2.16.840.1.101.3.4.2.3":
                          sha_algorithm = "sha-512";
                          break;
                      default:
                              throw new Error("Unknown hashing algorithm");
                  };

                  sequence = sequence.then(
                      function(result)
                      {
                          if(result === false)
                              return new Promise(function(resolve, reject) { reject("Signature verification failed"); });

                          return crypto.digest({ name: sha_algorithm }, new Uint8Array(signedDataBuffer));
                      });

                  sequence = sequence.then(
                      function(result)
                      {
                          var messageDigest = new ArrayBuffer(0);
                          console.log(cms_signed_simp);

                          for(var j = 0; j < cms_signed_simp.signerInfos[0].signedAttrs.attributes.length; j++)
                          {
                              if(cms_signed_simp.signerInfos[0].signedAttrs.attributes[j].attrType === "1.2.840.113549.1.9.4")
                              {
                                  messageDigest = cms_signed_simp.signerInfos[0].signedAttrs.attributes[j].attrValues[0].value_block.value_hex;
                                  break;
                              }
                          }

                          if(messageDigest.byteLength === 0)
                              return new Promise(function(resolve, reject) { reject("No signed attribute \"MessageDigest\""); });

                          var view1 = new Uint8Array(messageDigest);
                          var view2 = new Uint8Array(result);

                          if(view1.length !== view2.length)
                              return new Promise(function(resolve, reject) { reject("Hash is not correct"); });

                          for(var i = 0; i < view1.length; i++)
                          {
                              if(view1[i] !== view2[i])
                                  return new Promise(function(resolve, reject) { reject("Hash is not correct"); });
                          }
                      });
              }

              sequence.then(
                  function(result)
                  {
                      if(typeof result !== "undefined")
                      {
                          if(result === false)
                          {
                              console.log("PDF verification failed!")
                              return;
                          }
                      }

                      console.log("PDF successfully verified!")
                  },
                  function(error)
                  {
                      console.error("Error: " + error);
                  }
                  );
          }
          catch(err)
          {
              console.error(err);
          }
        }

        signatures.forEach(function(sigData) {
          checkSig(sigData);
        });

        return signatures;
      });
    }

    function ensureNotTerminated() {
      if (terminated) {
        throw new Error('Worker was terminated');
      }
    }

    function startWorkerTask(task) {
      WorkerTasks.push(task);
    }

    function finishWorkerTask(task) {
      task.finish();
      var i = WorkerTasks.indexOf(task);
      WorkerTasks.splice(i, 1);
    }

    function loadDocument(recoveryMode) {
      var loadDocumentCapability = createPromiseCapability();

      var parseSuccess = function parseSuccess() {
        var numPagesPromise = pdfManager.ensureDoc('numPages');
        var fingerprintPromise = pdfManager.ensureDoc('fingerprint');
        var encryptedPromise = pdfManager.ensureXRef('encrypt');
        // TODO don't need signatures, but do need to pass info that shows whether sigs exist and are valid
        var signaturesPromise = findSignatures();
        Promise.all([numPagesPromise, fingerprintPromise,
                     encryptedPromise, signaturesPromise]).then(function onDocReady(results) {
          var doc = {
            numPages: results[0],
            fingerprint: results[1],
            encrypted: !!results[2],
            signatures: results[3],
          };
          loadDocumentCapability.resolve(doc);
        },
        parseFailure);
      };

      var parseFailure = function parseFailure(e) {
        loadDocumentCapability.reject(e);
      };

      pdfManager.ensureDoc('checkHeader', []).then(function() {
        pdfManager.ensureDoc('parseStartXRef', []).then(function() {
          pdfManager.ensureDoc('parse', [recoveryMode]).then(
            parseSuccess, parseFailure);
        }, parseFailure);
      }, parseFailure);

      return loadDocumentCapability.promise.then(function(doc) {
        findSignatures();
        return doc;
      });
    }

    function getPdfManager(data) {
      var pdfManagerCapability = createPromiseCapability();
      var pdfManager;

      var source = data.source;
      var disableRange = data.disableRange;
      if (source.data) {
        try {
          pdfManager = new LocalPdfManager(source.data, source.password);
          pdfManagerCapability.resolve(pdfManager);
        } catch (ex) {
          pdfManagerCapability.reject(ex);
        }
        return pdfManagerCapability.promise;
      } else if (source.chunkedViewerLoading) {
        try {
          pdfManager = new NetworkPdfManager(source, handler);
          pdfManagerCapability.resolve(pdfManager);
        } catch (ex) {
          pdfManagerCapability.reject(ex);
        }
        return pdfManagerCapability.promise;
      }

      var networkManager = new NetworkManager(source.url, {
        httpHeaders: source.httpHeaders,
        withCredentials: source.withCredentials
      });
      var cachedChunks = [];
      var fullRequestXhrId = networkManager.requestFull({
        onHeadersReceived: function onHeadersReceived() {
          if (disableRange) {
            return;
          }

          var fullRequestXhr = networkManager.getRequestXhr(fullRequestXhrId);
          if (fullRequestXhr.getResponseHeader('Accept-Ranges') !== 'bytes') {
            return;
          }

          var contentEncoding =
            fullRequestXhr.getResponseHeader('Content-Encoding') || 'identity';
          if (contentEncoding !== 'identity') {
            return;
          }

          var length = fullRequestXhr.getResponseHeader('Content-Length');
          length = parseInt(length, 10);
          if (!isInt(length)) {
            return;
          }
          source.length = length;
          if (length <= 2 * source.rangeChunkSize) {
            // The file size is smaller than the size of two chunks, so it does
            // not make any sense to abort the request and retry with a range
            // request.
            return;
          }

          if (networkManager.isStreamingRequest(fullRequestXhrId)) {
            // We can continue fetching when progressive loading is enabled,
            // and we don't need the autoFetch feature.
            source.disableAutoFetch = true;
          } else {
            // NOTE: by cancelling the full request, and then issuing range
            // requests, there will be an issue for sites where you can only
            // request the pdf once. However, if this is the case, then the
            // server should not be returning that it can support range
            // requests.
            networkManager.abortRequest(fullRequestXhrId);
          }

          try {
            pdfManager = new NetworkPdfManager(source, handler);
            pdfManagerCapability.resolve(pdfManager);
          } catch (ex) {
            pdfManagerCapability.reject(ex);
          }
          cancelXHRs = null;
        },

        onProgressiveData: source.disableStream ? null :
            function onProgressiveData(chunk) {
          if (!pdfManager) {
            cachedChunks.push(chunk);
            return;
          }
          pdfManager.sendProgressiveData(chunk);
        },

        onDone: function onDone(args) {
          if (pdfManager) {
            return; // already processed
          }

          var pdfFile;
          if (args === null) {
            // TODO add some streaming manager, e.g. for unknown length files.
            // The data was returned in the onProgressiveData, combining...
            var pdfFileLength = 0, pos = 0;
            cachedChunks.forEach(function (chunk) {
              pdfFileLength += chunk.byteLength;
            });
            if (source.length && pdfFileLength !== source.length) {
              warn('reported HTTP length is different from actual');
            }
            var pdfFileArray = new Uint8Array(pdfFileLength);
            cachedChunks.forEach(function (chunk) {
              pdfFileArray.set(new Uint8Array(chunk), pos);
              pos += chunk.byteLength;
            });
            pdfFile = pdfFileArray.buffer;
          } else {
            pdfFile = args.chunk;
          }

          // the data is array, instantiating directly from it
          try {
            pdfManager = new LocalPdfManager(pdfFile, source.password);
            pdfManagerCapability.resolve(pdfManager);
          } catch (ex) {
            pdfManagerCapability.reject(ex);
          }
          cancelXHRs = null;
        },

        onError: function onError(status) {
          var exception;
          if (status === 404 || status === 0 && /^file:/.test(source.url)) {
            exception = new MissingPDFException('Missing PDF "' +
                                                source.url + '".');
            handler.send('MissingPDF', exception);
          } else {
            exception = new UnexpectedResponseException(
              'Unexpected server response (' + status +
              ') while retrieving PDF "' + source.url + '".', status);
            handler.send('UnexpectedResponse', exception);
          }
          cancelXHRs = null;
        },

        onProgress: function onProgress(evt) {
          handler.send('DocProgress', {
            loaded: evt.loaded,
            total: evt.lengthComputable ? evt.total : source.length
          });
        }
      });

      cancelXHRs = function () {
        networkManager.abortRequest(fullRequestXhrId);
      };

      return pdfManagerCapability.promise;
    }

    handler.on('test', function wphSetupTest(data) {
      // check if Uint8Array can be sent to worker
      if (!(data instanceof Uint8Array)) {
        handler.send('test', false);
        return;
      }
      // making sure postMessage transfers are working
      var supportTransfers = data[0] === 255;
      handler.postMessageTransfers = supportTransfers;
      // check if the response property is supported by xhr
      var xhr = new XMLHttpRequest();
      var responseExists = 'response' in xhr;
      // check if the property is actually implemented
      try {
        var dummy = xhr.responseType;
      } catch (e) {
        responseExists = false;
      }
      if (!responseExists) {
        handler.send('test', false);
        return;
      }
      handler.send('test', {
        supportTypedArray: true,
        supportTransfers: supportTransfers
      });
    });

    handler.on('GetDocRequest', function wphSetupDoc(data) {
      var onSuccess = function(doc) {
        ensureNotTerminated();
        handler.send('GetDoc', { pdfInfo: doc });
      };

      var onFailure = function(e) {
        if (e instanceof PasswordException) {
          if (e.code === PasswordResponses.NEED_PASSWORD) {
            handler.send('NeedPassword', e);
          } else if (e.code === PasswordResponses.INCORRECT_PASSWORD) {
            handler.send('IncorrectPassword', e);
          }
        } else if (e instanceof InvalidPDFException) {
          handler.send('InvalidPDF', e);
        } else if (e instanceof MissingPDFException) {
          handler.send('MissingPDF', e);
        } else if (e instanceof UnexpectedResponseException) {
          handler.send('UnexpectedResponse', e);
        } else {
          handler.send('UnknownError',
                       new UnknownErrorException(e.message, e.toString()));
        }
      };

      ensureNotTerminated();

      PDFJS.maxImageSize = data.maxImageSize === undefined ?
                           -1 : data.maxImageSize;
      PDFJS.disableFontFace = data.disableFontFace;
      PDFJS.disableCreateObjectURL = data.disableCreateObjectURL;
      PDFJS.verbosity = data.verbosity;
      PDFJS.cMapUrl = data.cMapUrl === undefined ?
                           null : data.cMapUrl;
      PDFJS.cMapPacked = data.cMapPacked === true;

      getPdfManager(data).then(function (newPdfManager) {
        if (terminated) {
          // We were in a process of setting up the manager, but it got
          // terminated in the middle.
          newPdfManager.terminate();
          throw new Error('Worker was terminated');
        }

        pdfManager = newPdfManager;

        handler.send('PDFManagerReady', null);
        pdfManager.onLoadedStream().then(function(stream) {
          handler.send('DataLoaded', { length: stream.bytes.byteLength });
        });
      }).then(function pdfManagerReady() {
        ensureNotTerminated();

        loadDocument(false).then(onSuccess, function loadFailure(ex) {
          ensureNotTerminated();

          // Try again with recoveryMode == true
          if (!(ex instanceof XRefParseException)) {
            if (ex instanceof PasswordException) {
              // after password exception prepare to receive a new password
              // to repeat loading
              pdfManager.passwordChanged().then(pdfManagerReady);
            }

            onFailure(ex);
            return;
          }

          pdfManager.requestLoadedStream();
          pdfManager.onLoadedStream().then(function() {
            ensureNotTerminated();

            loadDocument(true).then(onSuccess, onFailure);
          });
        }, onFailure);
      }, onFailure);
    });

    handler.on('GetPage', function wphSetupGetPage(data) {
      return pdfManager.getPage(data.pageIndex).then(function(page) {
        var rotatePromise = pdfManager.ensure(page, 'rotate');
        var refPromise = pdfManager.ensure(page, 'ref');
        var viewPromise = pdfManager.ensure(page, 'view');

        return Promise.all([rotatePromise, refPromise, viewPromise]).then(
            function(results) {
          return {
            rotate: results[0],
            ref: results[1],
            view: results[2]
          };
        });
      });
    });

    handler.on('GetPageIndex', function wphSetupGetPageIndex(data) {
      var ref = new Ref(data.ref.num, data.ref.gen);
      var catalog = pdfManager.pdfDocument.catalog;
      return catalog.getPageIndex(ref);
    });

    handler.on('GetDestinations',
      function wphSetupGetDestinations(data) {
        return pdfManager.ensureCatalog('destinations');
      }
    );

    handler.on('GetDestination',
      function wphSetupGetDestination(data) {
        return pdfManager.ensureCatalog('getDestination', [ data.id ]);
      }
    );

    handler.on('GetAttachments',
      function wphSetupGetAttachments(data) {
        return pdfManager.ensureCatalog('attachments');
      }
    );

    handler.on('GetJavaScript',
      function wphSetupGetJavaScript(data) {
        return pdfManager.ensureCatalog('javaScript');
      }
    );

    handler.on('GetOutline',
      function wphSetupGetOutline(data) {
        return pdfManager.ensureCatalog('documentOutline');
      }
    );

    handler.on('GetMetadata',
      function wphSetupGetMetadata(data) {
        return Promise.all([pdfManager.ensureDoc('documentInfo'),
                            pdfManager.ensureCatalog('metadata')]);
      }
    );

    handler.on('GetData', function wphSetupGetData(data) {
      pdfManager.requestLoadedStream();
      return pdfManager.onLoadedStream().then(function(stream) {
        return stream.bytes;
      });
    });

    handler.on('GetStats',
      function wphSetupGetStats(data) {
        return pdfManager.pdfDocument.xref.stats;
      }
    );

    handler.on('UpdatePassword', function wphSetupUpdatePassword(data) {
      pdfManager.updatePassword(data);
    });

    handler.on('GetAnnotations', function wphSetupGetAnnotations(data) {
      return pdfManager.getPage(data.pageIndex).then(function(page) {
        return pdfManager.ensure(page, 'getAnnotationsData', []);
      });
    });

    handler.on('RenderPageRequest', function wphSetupRenderPage(data) {
      var pageIndex = data.pageIndex;
      pdfManager.getPage(pageIndex).then(function(page) {
        var task = new WorkerTask('RenderPageRequest: page ' + pageIndex);
        startWorkerTask(task);

        var pageNum = pageIndex + 1;
        var start = Date.now();
        // Pre compile the pdf page and fetch the fonts/images.
        page.getOperatorList(handler, task, data.intent).then(
            function(operatorList) {
          finishWorkerTask(task);

          info('page=' + pageNum + ' - getOperatorList: time=' +
               (Date.now() - start) + 'ms, len=' + operatorList.totalLength);
        }, function(e) {
          finishWorkerTask(task);
          if (task.terminated) {
            return; // ignoring errors from the terminated thread
          }

          var minimumStackMessage =
            'worker.js: while trying to getPage() and getOperatorList()';

          var wrappedException;

          // Turn the error into an obj that can be serialized
          if (typeof e === 'string') {
            wrappedException = {
              message: e,
              stack: minimumStackMessage
            };
          } else if (typeof e === 'object') {
            wrappedException = {
              message: e.message || e.toString(),
              stack: e.stack || minimumStackMessage
            };
          } else {
            wrappedException = {
              message: 'Unknown exception type: ' + (typeof e),
              stack: minimumStackMessage
            };
          }

          handler.send('PageError', {
            pageNum: pageNum,
            error: wrappedException,
            intent: data.intent
          });
        });
      });
    }, this);

    handler.on('GetTextContent', function wphExtractText(data) {
      var pageIndex = data.pageIndex;
      return pdfManager.getPage(pageIndex).then(function(page) {
        var task = new WorkerTask('GetTextContent: page ' + pageIndex);
        startWorkerTask(task);
        var pageNum = pageIndex + 1;
        var start = Date.now();
        return page.extractTextContent(task).then(function(textContent) {
          finishWorkerTask(task);
          info('text indexing: page=' + pageNum + ' - time=' +
               (Date.now() - start) + 'ms');
          return textContent;
        }, function (reason) {
          finishWorkerTask(task);
          if (task.terminated) {
            return; // ignoring errors from the terminated thread
          }
          throw reason;
        });
      });
    });

    handler.on('Cleanup', function wphCleanup(data) {
      return pdfManager.cleanup();
    });

    handler.on('Terminate', function wphTerminate(data) {
      terminated = true;
      if (pdfManager) {
        pdfManager.terminate();
        pdfManager = null;
      }
      if (cancelXHRs) {
        cancelXHRs();
      }

      var waitOn = [];
      WorkerTasks.forEach(function (task) {
        waitOn.push(task.finished);
        task.terminate();
      });

      return Promise.all(waitOn).then(function () {});
    });
  }
};

var consoleTimer = {};

var workerConsole = {
  log: function log() {
    var args = Array.prototype.slice.call(arguments);
    globalScope.postMessage({
      action: 'console_log',
      data: args
    });
  },

  error: function error() {
    var args = Array.prototype.slice.call(arguments);
    globalScope.postMessage({
      action: 'console_error',
      data: args
    });
    throw 'pdf.js execution error';
  },

  time: function time(name) {
    consoleTimer[name] = Date.now();
  },

  timeEnd: function timeEnd(name) {
    var time = consoleTimer[name];
    if (!time) {
      error('Unknown timer name ' + name);
    }
    this.log('Timer:', name, Date.now() - time);
  }
};


// Worker thread?
if (typeof window === 'undefined') {
  if (!('console' in globalScope)) {
    globalScope.console = workerConsole;
  }

  // Listen for unsupported features so we can pass them on to the main thread.
  PDFJS.UnsupportedManager.listen(function (msg) {
    globalScope.postMessage({
      action: '_unsupported_feature',
      data: msg
    });
  });

  var handler = new MessageHandler('worker_processor', this);
  WorkerMessageHandler.setup(handler);
}
