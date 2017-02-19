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

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs/core/worker', ['exports', 'pdfjs/shared/util',
      'pdfjs/core/primitives', 'pdfjs/core/pdf_manager'],
      factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('../shared/util.js'), require('./primitives.js'),
      require('./pdf_manager.js'));
  } else {
    factory((root.pdfjsCoreWorker = {}), root.pdfjsSharedUtil,
      root.pdfjsCorePrimitives, root.pdfjsCorePdfManager);
  }
}(this, function (exports, sharedUtil, corePrimitives, corePdfManager) {

var UNSUPPORTED_FEATURES = sharedUtil.UNSUPPORTED_FEATURES;
var InvalidPDFException = sharedUtil.InvalidPDFException;
var MessageHandler = sharedUtil.MessageHandler;
var MissingPDFException = sharedUtil.MissingPDFException;
var UnexpectedResponseException = sharedUtil.UnexpectedResponseException;
var PasswordException = sharedUtil.PasswordException;
var UnknownErrorException = sharedUtil.UnknownErrorException;
var XRefParseException = sharedUtil.XRefParseException;
var arrayByteLength = sharedUtil.arrayByteLength;
var arraysToBytes = sharedUtil.arraysToBytes;
var assert = sharedUtil.assert;
var createPromiseCapability = sharedUtil.createPromiseCapability;
var info = sharedUtil.info;
var warn = sharedUtil.warn;
var setVerbosityLevel = sharedUtil.setVerbosityLevel;
var isNodeJS = sharedUtil.isNodeJS;
var Ref = corePrimitives.Ref;
var LocalPdfManager = corePdfManager.LocalPdfManager;
var NetworkPdfManager = corePdfManager.NetworkPdfManager;

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

if (typeof PDFJSDev === 'undefined' || !PDFJSDev.test('PRODUCTION')) {
/**
 * Interface that represents PDF data transport. If possible, it allows
 * progressively load entire or fragment of the PDF binary data.
 *
 * @interface
 */
function IPDFStream() {} // eslint-disable-line no-inner-declarations
IPDFStream.prototype = {
  /**
   * Gets a reader for the entire PDF data.
   * @returns {IPDFStreamReader}
   */
  getFullReader: function () {
    return null;
  },

  /**
   * Gets a reader for the range of the PDF data.
   * @param {number} begin - the start offset of the data.
   * @param {number} end - the end offset of the data.
   * @returns {IPDFStreamRangeReader}
   */
  getRangeReader: function (begin, end) {
    return null;
  },

  /**
   * Cancels all opened reader and closes all their opened requests.
   * @param {Object} reason - the reason for cancelling
   */
  cancelAllRequests: function (reason) {},
};

/**
 * Interface for a PDF binary data reader.
 *
 * @interface
 */
function IPDFStreamReader() {} // eslint-disable-line no-inner-declarations
IPDFStreamReader.prototype = {
  /**
   * Gets a promise that is resolved when the headers and other metadata of
   * the PDF data stream are available.
   * @returns {Promise}
   */
  get headersReady() {
    return null;
  },

  /**
   * Gets PDF binary data length. It is defined after the headersReady promise
   * is resolved.
   * @returns {number} The data length (or 0 if unknown).
   */
  get contentLength() {
    return 0;
  },

  /**
   * Gets ability of the stream to handle range requests. It is defined after
   * the headersReady promise is resolved. Rejected when the reader is cancelled
   * or an error occurs.
   * @returns {boolean}
   */
  get isRangeSupported() {
    return false;
  },

  /**
   * Gets ability of the stream to progressively load binary data. It is defined
   * after the headersReady promise is resolved.
   * @returns {boolean}
   */
  get isStreamingSupported() {
    return false;
  },

  /**
   * Requests a chunk of the binary data. The method returns the promise, which
   * is resolved into object with properties "value" and "done". If the done
   * is set to true, then the stream has reached its end, otherwise the value
   * contains binary data. Cancelled requests will be resolved with the done is
   * set to true.
   * @returns {Promise}
   */
  read: function () {},

  /**
   * Cancels all pending read requests and closes the stream.
   * @param {Object} reason
   */
  cancel: function (reason) {},

  /**
   * Sets or gets the progress callback. The callback can be useful when the
   * isStreamingSupported property of the object is defined as false.
   * The callback is called with one parameter: an object with the loaded and
   * total properties.
   */
  onProgress: null,
};

/**
 * Interface for a PDF binary data fragment reader.
 *
 * @interface
 */
function IPDFStreamRangeReader() {} // eslint-disable-line no-inner-declarations
IPDFStreamRangeReader.prototype = {
  /**
   * Gets ability of the stream to progressively load binary data.
   * @returns {boolean}
   */
  get isStreamingSupported() {
    return false;
  },

  /**
   * Requests a chunk of the binary data. The method returns the promise, which
   * is resolved into object with properties "value" and "done". If the done
   * is set to true, then the stream has reached its end, otherwise the value
   * contains binary data. Cancelled requests will be resolved with the done is
   * set to true.
   * @returns {Promise}
   */
  read: function () {},

  /**
   * Cancels all pending read requests and closes the stream.
   * @param {Object} reason
   */
  cancel: function (reason) {},

  /**
   * Sets or gets the progress callback. The callback can be useful when the
   * isStreamingSupported property of the object is defined as false.
   * The callback is called with one parameter: an object with the loaded
   * property.
   */
  onProgress: null,
};
}

/** @implements {IPDFStream} */
var PDFWorkerStream = (function PDFWorkerStreamClosure() {
  function PDFWorkerStream(params, msgHandler) {
    this._queuedChunks = [];
    var initialData = params.initialData;
    if (initialData && initialData.length > 0) {
      this._queuedChunks.push(initialData);
    }
    this._msgHandler = msgHandler;

    this._isRangeSupported = !(params.disableRange);
    this._isStreamingSupported = !(params.disableStream);
    this._contentLength = params.length;

    this._fullRequestReader = null;
    this._rangeReaders = [];

    msgHandler.on('OnDataRange', this._onReceiveData.bind(this));
    msgHandler.on('OnDataProgress', this._onProgress.bind(this));
  }
  PDFWorkerStream.prototype = {
    _onReceiveData: function PDFWorkerStream_onReceiveData(args) {
       if (args.begin === undefined) {
         if (this._fullRequestReader) {
           this._fullRequestReader._enqueue(args.chunk);
         } else {
           this._queuedChunks.push(args.chunk);
         }
       } else {
         var found = this._rangeReaders.some(function (rangeReader) {
           if (rangeReader._begin !== args.begin) {
             return false;
           }
           rangeReader._enqueue(args.chunk);
           return true;
         });
         assert(found);
       }
    },

    _onProgress: function PDFWorkerStream_onProgress(evt) {
       if (this._rangeReaders.length > 0) {
         // Reporting to first range reader.
         var firstReader = this._rangeReaders[0];
         if (firstReader.onProgress) {
           firstReader.onProgress({loaded: evt.loaded});
         }
       }
    },

    _removeRangeReader: function PDFWorkerStream_removeRangeReader(reader) {
      var i = this._rangeReaders.indexOf(reader);
      if (i >= 0) {
        this._rangeReaders.splice(i, 1);
      }
    },

    getFullReader: function PDFWorkerStream_getFullReader() {
      assert(!this._fullRequestReader);
      var queuedChunks = this._queuedChunks;
      this._queuedChunks = null;
      return new PDFWorkerStreamReader(this, queuedChunks);
    },

    getRangeReader: function PDFWorkerStream_getRangeReader(begin, end) {
      var reader = new PDFWorkerStreamRangeReader(this, begin, end);
      this._msgHandler.send('RequestDataRange', { begin: begin, end: end });
      this._rangeReaders.push(reader);
      return reader;
    },

    cancelAllRequests: function PDFWorkerStream_cancelAllRequests(reason) {
      if (this._fullRequestReader) {
        this._fullRequestReader.cancel(reason);
      }
      var readers = this._rangeReaders.slice(0);
      readers.forEach(function (rangeReader) {
        rangeReader.cancel(reason);
      });
    }
  };

  /** @implements {IPDFStreamReader} */
  function PDFWorkerStreamReader(stream, queuedChunks) {
    this._stream = stream;
    this._done = false;
    this._queuedChunks = queuedChunks || [];
    this._requests = [];
    this._headersReady = Promise.resolve();
    stream._fullRequestReader = this;

    this.onProgress = null; // not used
  }
  PDFWorkerStreamReader.prototype = {
    _enqueue: function PDFWorkerStreamReader_enqueue(chunk) {
      if (this._done) {
        return; // ignore new data
      }
      if (this._requests.length > 0) {
        var requestCapability = this._requests.shift();
        requestCapability.resolve({value: chunk, done: false});
        return;
      }
      this._queuedChunks.push(chunk);
    },

    get headersReady() {
      return this._headersReady;
    },

    get isRangeSupported() {
      return this._stream._isRangeSupported;
    },

    get isStreamingSupported() {
      return this._stream._isStreamingSupported;
    },

    get contentLength() {
      return this._stream._contentLength;
    },

    read: function PDFWorkerStreamReader_read() {
      if (this._queuedChunks.length > 0) {
        var chunk = this._queuedChunks.shift();
        return Promise.resolve({value: chunk, done: false});
      }
      if (this._done) {
        return Promise.resolve({value: undefined, done: true});
      }
      var requestCapability = createPromiseCapability();
      this._requests.push(requestCapability);
      return requestCapability.promise;
    },

    cancel: function PDFWorkerStreamReader_cancel(reason) {
      this._done = true;
      this._requests.forEach(function (requestCapability) {
        requestCapability.resolve({value: undefined, done: true});
      });
      this._requests = [];
    }
  };

  /** @implements {IPDFStreamRangeReader} */
  function PDFWorkerStreamRangeReader(stream, begin, end) {
    this._stream = stream;
    this._begin = begin;
    this._end = end;
    this._queuedChunk = null;
    this._requests = [];
    this._done = false;

    this.onProgress = null;
  }
  PDFWorkerStreamRangeReader.prototype = {
    _enqueue: function PDFWorkerStreamRangeReader_enqueue(chunk) {
      if (this._done) {
        return; // ignore new data
      }
      if (this._requests.length === 0) {
        this._queuedChunk = chunk;
      } else {
        var requestsCapability = this._requests.shift();
        requestsCapability.resolve({value: chunk, done: false});
        this._requests.forEach(function (requestCapability) {
          requestCapability.resolve({value: undefined, done: true});
        });
        this._requests = [];
      }
      this._done = true;
      this._stream._removeRangeReader(this);
    },

    get isStreamingSupported() {
      return false;
    },

    read: function PDFWorkerStreamRangeReader_read() {
      if (this._queuedChunk) {
        return Promise.resolve({value: this._queuedChunk, done: false});
      }
      if (this._done) {
        return Promise.resolve({value: undefined, done: true});
      }
      var requestCapability = createPromiseCapability();
      this._requests.push(requestCapability);
      return requestCapability.promise;
    },

    cancel: function PDFWorkerStreamRangeReader_cancel(reason) {
      this._done = true;
      this._requests.forEach(function (requestCapability) {
        requestCapability.resolve({value: undefined, done: true});
      });
      this._requests = [];
      this._stream._removeRangeReader(this);
    }
  };

  return PDFWorkerStream;
})();

/** @type IPDFStream */
var PDFNetworkStream;

/**
 * Sets PDFNetworkStream class to be used as alternative PDF data transport.
 * @param {IPDFStream} cls - the PDF data transport.
 */
function setPDFNetworkStreamClass(cls) {
  PDFNetworkStream = cls;
}

var WorkerMessageHandler = {
  setup: function wphSetup(handler, port) {
    var testMessageProcessed = false;
    handler.on('test', function wphSetupTest(data) {
      if (testMessageProcessed) {
        return; // we already processed 'test' message once
      }
      testMessageProcessed = true;

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
        xhr.responseType; // eslint-disable-line no-unused-expressions
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

    handler.on('configure', function wphConfigure(data) {
      setVerbosityLevel(data.verbosity);
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
    var docBaseUrl = docParams.docBaseUrl;
    var workerHandlerName = docParams.docId + '_worker';
    var handler = new MessageHandler(workerHandlerName, docId, port);

    // Ensure that postMessage transfers are correctly enabled/disabled,
    // to prevent "DataCloneError" in older versions of IE (see issue 6957).
    handler.postMessageTransfers = docParams.postMessageTransfers;

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

    function getPdfManager(data, evaluatorOptions) {
      var pdfManagerCapability = createPromiseCapability();
      var pdfManager;

      var source = data.source;
      if (source.data) {
        try {
          pdfManager = new LocalPdfManager(docId, source.data, source.password,
                                           evaluatorOptions, docBaseUrl);
          pdfManagerCapability.resolve(pdfManager);
        } catch (ex) {
          pdfManagerCapability.reject(ex);
        }
        return pdfManagerCapability.promise;
      }

      var pdfStream;
      try {
        if (source.chunkedViewerLoading) {
          pdfStream = new PDFWorkerStream(source, handler);
        } else {
          assert(PDFNetworkStream, 'pdfjs/core/network module is not loaded');
          pdfStream = new PDFNetworkStream(data);
        }
      } catch (ex) {
        pdfManagerCapability.reject(ex);
        return pdfManagerCapability.promise;
      }

      var fullRequest = pdfStream.getFullReader();
      fullRequest.headersReady.then(function () {
        if (!fullRequest.isStreamingSupported ||
            !fullRequest.isRangeSupported) {
          // If stream or range are disabled, it's our only way to report
          // loading progress.
          fullRequest.onProgress = function (evt) {
            handler.send('DocProgress', {
              loaded: evt.loaded,
              total: evt.total
            });
          };
        }

        if (!fullRequest.isRangeSupported) {
          return;
        }

        // We don't need auto-fetch when streaming is enabled.
        var disableAutoFetch = source.disableAutoFetch ||
                               fullRequest.isStreamingSupported;
        pdfManager = new NetworkPdfManager(docId, pdfStream, {
          msgHandler: handler,
          url: source.url,
          password: source.password,
          length: fullRequest.contentLength,
          disableAutoFetch: disableAutoFetch,
          rangeChunkSize: source.rangeChunkSize
        }, evaluatorOptions, docBaseUrl);
        pdfManagerCapability.resolve(pdfManager);
        cancelXHRs = null;
      }).catch(function (reason) {
        pdfManagerCapability.reject(reason);
        cancelXHRs = null;
      });

      var cachedChunks = [], loaded = 0;
      var flushChunks = function () {
        var pdfFile = arraysToBytes(cachedChunks);
        if (source.length && pdfFile.length !== source.length) {
          warn('reported HTTP length is different from actual');
        }
        // the data is array, instantiating directly from it
        try {
          pdfManager = new LocalPdfManager(docId, pdfFile, source.password,
                                           evaluatorOptions, docBaseUrl);
          pdfManagerCapability.resolve(pdfManager);
        } catch (ex) {
          pdfManagerCapability.reject(ex);
        }
        cachedChunks = [];
      };
      var readPromise = new Promise(function (resolve, reject) {
        var readChunk = function (chunk) {
          try {
            ensureNotTerminated();
            if (chunk.done) {
              if (!pdfManager) {
                flushChunks();
              }
              cancelXHRs = null;
              return;
            }

            var data = chunk.value;
            loaded += arrayByteLength(data);
            if (!fullRequest.isStreamingSupported) {
              handler.send('DocProgress', {
                loaded: loaded,
                total: Math.max(loaded, fullRequest.contentLength || 0)
              });
            }

            if (pdfManager) {
              pdfManager.sendProgressiveData(data);
            } else {
              cachedChunks.push(data);
            }

            fullRequest.read().then(readChunk, reject);
          } catch (e) {
            reject(e);
          }
        };
        fullRequest.read().then(readChunk, reject);
      });
      readPromise.catch(function (e) {
        pdfManagerCapability.reject(e);
        cancelXHRs = null;
      });

      cancelXHRs = function () {
        pdfStream.cancelAllRequests('abort');
      };

      return pdfManagerCapability.promise;
    }

    function setupDoc(data) {
      function onSuccess(doc) {
        ensureNotTerminated();
        handler.send('GetDoc', { pdfInfo: doc });
      }

      function onFailure(e) {
        if (e instanceof PasswordException) {
          var task = new WorkerTask('PasswordException: response ' + e.code);
          startWorkerTask(task);

          handler.sendWithPromise('PasswordRequest', e).then(function (data) {
            finishWorkerTask(task);
            pdfManager.updatePassword(data.password);
            pdfManagerReady();
          }).catch(function (ex) {
            finishWorkerTask(task);
            handler.send('PasswordException', ex);
          }.bind(null, e));
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
      }

      function pdfManagerReady() {
        ensureNotTerminated();

        loadDocument(false).then(onSuccess, function loadFailure(ex) {
          ensureNotTerminated();

          // Try again with recoveryMode == true
          if (!(ex instanceof XRefParseException)) {
            onFailure(ex);
            return;
          }
          pdfManager.requestLoadedStream();
          pdfManager.onLoadedStream().then(function() {
            ensureNotTerminated();

            loadDocument(true).then(onSuccess, onFailure);
          });
        }, onFailure);
      }

      ensureNotTerminated();

      var evaluatorOptions = {
        forceDataSchema: data.disableCreateObjectURL,
        maxImageSize: data.maxImageSize === undefined ? -1 : data.maxImageSize,
        disableFontFace: data.disableFontFace,
        disableNativeImageDecoder: data.disableNativeImageDecoder,
        ignoreErrors: data.ignoreErrors,
      };

      getPdfManager(data, evaluatorOptions).then(function (newPdfManager) {
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
      }).then(pdfManagerReady, onFailure);
    }

    handler.on('GetPage', function wphSetupGetPage(data) {
      return pdfManager.getPage(data.pageIndex).then(function(page) {
        var rotatePromise = pdfManager.ensure(page, 'rotate');
        var refPromise = pdfManager.ensure(page, 'ref');
        var userUnitPromise = pdfManager.ensure(page, 'userUnit');
        var viewPromise = pdfManager.ensure(page, 'view');

        return Promise.all([
          rotatePromise, refPromise, userUnitPromise, viewPromise
        ]).then(function(results) {
          return {
            rotate: results[0],
            ref: results[1],
            userUnit: results[2],
            view: results[3]
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

    handler.on('GetPageLabels',
      function wphSetupGetPageLabels(data) {
        return pdfManager.ensureCatalog('pageLabels');
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
        page.getOperatorList(handler, task, data.intent,
                             data.renderInteractiveForms).then(
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
      return pdfManager.getPage(pageIndex).then(function(page) {
        var task = new WorkerTask('GetTextContent: page ' + pageIndex);
        startWorkerTask(task);

        var pageNum = pageIndex + 1;
        var start = Date.now();
        return page.extractTextContent(handler, task, data.normalizeWhitespace,
                                       data.combineTextItems).then(
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

function initializeWorker() {
  var handler = new MessageHandler('worker', 'main', self);
  WorkerMessageHandler.setup(handler, self);
  handler.send('ready', null);
}

// Worker thread (and not node.js)?
if (typeof window === 'undefined' && !isNodeJS()) {
  initializeWorker();
}

exports.setPDFNetworkStreamClass = setPDFNetworkStreamClass;
exports.WorkerTask = WorkerTask;
exports.WorkerMessageHandler = WorkerMessageHandler;
}));
