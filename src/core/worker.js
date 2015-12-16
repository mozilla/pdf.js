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
/* globals NetworkManager */

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs/core/worker', ['exports', 'pdfjs/shared/util',
      'pdfjs/core/primitives', 'pdfjs/core/pdf_manager', 'pdfjs/shared/global'],
      factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('../shared/util.js'), require('./primitives.js'),
      require('./pdf_manager.js'), require('../shared/global.js'));
  } else {
    factory((root.pdfjsCoreWorker = {}), root.pdfjsSharedUtil,
      root.pdfjsCorePrimitives, root.pdfjsCorePdfManager,
      root.pdfjsSharedGlobal);
  }
}(this, function (exports, sharedUtil, corePrimitives, corePdfManager,
                  sharedGlobal) {

var UNSUPPORTED_FEATURES = sharedUtil.UNSUPPORTED_FEATURES;
var InvalidPDFException = sharedUtil.InvalidPDFException;
var MessageHandler = sharedUtil.MessageHandler;
var MissingPDFException = sharedUtil.MissingPDFException;
var UnexpectedResponseException = sharedUtil.UnexpectedResponseException;
var PasswordException = sharedUtil.PasswordException;
var PasswordResponses = sharedUtil.PasswordResponses;
var UnknownErrorException = sharedUtil.UnknownErrorException;
var XRefParseException = sharedUtil.XRefParseException;
var createPromiseCapability = sharedUtil.createPromiseCapability;
var error = sharedUtil.error;
var info = sharedUtil.info;
var isInt = sharedUtil.isInt;
var warn = sharedUtil.warn;
var Ref = corePrimitives.Ref;
var LocalPdfManager = corePdfManager.LocalPdfManager;
var NetworkPdfManager = corePdfManager.NetworkPdfManager;
var globalScope = sharedGlobal.globalScope;
var PDFJS = sharedGlobal.PDFJS;

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
  setup: function wphSetup(handler, port) {
    handler.on('test', function wphSetupTest(data) {
      // check if Uint8Array can be sent to worker
      if (!(data instanceof Uint8Array)) {
        handler.send('test', 'main', false);
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
      return WorkerMessageHandler.createDocumentHandler(data, port);
    });
  },
  createDocumentHandler: function wphCreateDocumentHandler(docParams, port) {
    // This context is actually holds references on pdfManager and handler,
    // until the latter is destroyed.
    var pdfManager;
    var terminated = false;
    var cancelXHRs = null;
    var WorkerTasks = [];

    var docId = docParams.docId;
    var workerHandlerName = docParams.docId + '_worker';
    var handler = new MessageHandler(workerHandlerName, docId, port);

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
        Promise.all([numPagesPromise, fingerprintPromise,
                     encryptedPromise]).then(function onDocReady(results) {
          var doc = {
            numPages: results[0],
            fingerprint: results[1],
            encrypted: !!results[2],
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

      return loadDocumentCapability.promise;
    }

    function getPdfManager(data) {
      var pdfManagerCapability = createPromiseCapability();
      var pdfManager;

      var source = data.source;
      var disableRange = data.disableRange;
      if (source.data) {
        try {
          pdfManager = new LocalPdfManager(docId, source.data, source.password);
          pdfManagerCapability.resolve(pdfManager);
        } catch (ex) {
          pdfManagerCapability.reject(ex);
        }
        return pdfManagerCapability.promise;
      } else if (source.chunkedViewerLoading) {
        try {
          pdfManager = new NetworkPdfManager(docId, source, handler);
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
            pdfManager = new NetworkPdfManager(docId, source, handler);
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
            pdfManager = new LocalPdfManager(docId, pdfFile, source.password);
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

    var setupDoc = function(data) {
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
    };

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
        return pdfManager.ensureCatalog('getDestination', [data.id]);
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
        return pdfManager.ensure(page, 'getAnnotationsData', [data.intent]);
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

          // For compatibility with older behavior, generating unknown
          // unsupported feature notification on errors.
          handler.send('UnsupportedFeature',
                       {featureId: UNSUPPORTED_FEATURES.unknown});

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
      var normalizeWhitespace = data.normalizeWhitespace;
      return pdfManager.getPage(pageIndex).then(function(page) {
        var task = new WorkerTask('GetTextContent: page ' + pageIndex);
        startWorkerTask(task);
        var pageNum = pageIndex + 1;
        var start = Date.now();
        return page.extractTextContent(task, normalizeWhitespace).then(
            function(textContent) {
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

      return Promise.all(waitOn).then(function () {
        // Notice that even if we destroying handler, resolved response promise
        // must be sent back.
        handler.destroy();
        handler = null;
      });
    });

    handler.on('Ready', function wphReady(data) {
      setupDoc(docParams);
      docParams = null; // we don't need docParams anymore -- saving memory.
    });
    return workerHandlerName;
  }
};

var consoleTimer = {};

var workerConsole = {
  log: function log() {
    var args = Array.prototype.slice.call(arguments);
    globalScope.postMessage({
      targetName: 'main',
      action: 'console_log',
      data: args
    });
  },

  error: function error() {
    var args = Array.prototype.slice.call(arguments);
    globalScope.postMessage({
      targetName: 'main',
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
if (typeof window === 'undefined' && typeof require === 'undefined') {
  if (!('console' in globalScope)) {
    globalScope.console = workerConsole;
  }

  var handler = new MessageHandler('worker', 'main', self);
  WorkerMessageHandler.setup(handler, self);
}

exports.WorkerTask = WorkerTask;
exports.WorkerMessageHandler = WorkerMessageHandler;
}));
