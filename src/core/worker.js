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

import {
  AbortException, arrayByteLength, arraysToBytes, createPromiseCapability,
  getVerbosityLevel, info, InvalidPDFException, MissingPDFException,
  PasswordException, setVerbosityLevel, UnexpectedResponseException,
  UnknownErrorException, UNSUPPORTED_FEATURES, VerbosityLevel, warn
} from '../shared/util';
import { clearPrimitiveCaches, Ref } from './primitives';
import { LocalPdfManager, NetworkPdfManager } from './pdf_manager';
import isNodeJS from '../shared/is_node';
import { MessageHandler } from '../shared/message_handler';
import { PDFWorkerStream } from './worker_stream';
import { XRefParseException } from './core_utils';

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

    finish() {
      this._capability.resolve();
    },

    terminate() {
      this.terminated = true;
    },

    ensureNotTerminated() {
      if (this.terminated) {
        throw new Error('Worker task was terminated');
      }
    },
  };

  return WorkerTask;
})();

var WorkerMessageHandler = {
  setup(handler, port) {
    var testMessageProcessed = false;
    handler.on('test', function wphSetupTest(data) {
      if (testMessageProcessed) {
        return; // we already processed 'test' message once
      }
      testMessageProcessed = true;

      // check if Uint8Array can be sent to worker
      if (!(data instanceof Uint8Array)) {
        handler.send('test', null);
        return;
      }
      // making sure postMessage transfers are working
      const supportTransfers = data[0] === 255;
      handler.postMessageTransfers = supportTransfers;

      handler.send('test', { supportTransfers, });
    });

    handler.on('configure', function wphConfigure(data) {
      setVerbosityLevel(data.verbosity);
    });

    handler.on('GetDocRequest', function wphSetupDoc(data) {
      return WorkerMessageHandler.createDocumentHandler(data, port);
    });
  },
  createDocumentHandler(docParams, port) {
    // This context is actually holds references on pdfManager and handler,
    // until the latter is destroyed.
    var pdfManager;
    var terminated = false;
    var cancelXHRs = null;
    var WorkerTasks = [];
    const verbosity = getVerbosityLevel();

    const apiVersion = docParams.apiVersion;
    const workerVersion =
      typeof PDFJSDev !== 'undefined' && !PDFJSDev.test('TESTING') ?
      PDFJSDev.eval('BUNDLE_VERSION') : null;
    if (apiVersion !== workerVersion) {
      throw new Error(`The API version "${apiVersion}" does not match ` +
                      `the Worker version "${workerVersion}".`);
    }

    var docId = docParams.docId;
    var docBaseUrl = docParams.docBaseUrl;
    var workerHandlerName = docParams.docId + '_worker';
    var handler = new MessageHandler(workerHandlerName, docId, port);

    // Ensure that postMessage transfers are always correctly enabled/disabled,
    // to prevent "DataCloneError" in browsers without transfers support.
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

    async function loadDocument(recoveryMode) {
      await pdfManager.ensureDoc('checkHeader');
      await pdfManager.ensureDoc('parseStartXRef');
      await pdfManager.ensureDoc('parse', [recoveryMode]);

      if (!recoveryMode) {
        // Check that at least the first page can be successfully loaded,
        // since otherwise the XRef table is definitely not valid.
        await pdfManager.ensureDoc('checkFirstPage');
      }

      const [numPages, fingerprint] = await Promise.all([
        pdfManager.ensureDoc('numPages'),
        pdfManager.ensureDoc('fingerprint'),
      ]);
      return { numPages, fingerprint, };
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

      var pdfStream, cachedChunks = [];
      try {
        pdfStream = new PDFWorkerStream(handler);
      } catch (ex) {
        pdfManagerCapability.reject(ex);
        return pdfManagerCapability.promise;
      }

      var fullRequest = pdfStream.getFullReader();
      fullRequest.headersReady.then(function () {
        if (!fullRequest.isRangeSupported) {
          return;
        }

        // We don't need auto-fetch when streaming is enabled.
        var disableAutoFetch = source.disableAutoFetch ||
                               fullRequest.isStreamingSupported;
        pdfManager = new NetworkPdfManager(docId, pdfStream, {
          msgHandler: handler,
          password: source.password,
          length: fullRequest.contentLength,
          disableAutoFetch,
          rangeChunkSize: source.rangeChunkSize,
        }, evaluatorOptions, docBaseUrl);
        // There may be a chance that `pdfManager` is not initialized
        // for first few runs of `readchunk` block of code. Be sure
        // to send all cached chunks, if any, to chunked_stream via
        // pdf_manager.
        for (let i = 0; i < cachedChunks.length; i++) {
          pdfManager.sendProgressiveData(cachedChunks[i]);
        }

        cachedChunks = [];
        pdfManagerCapability.resolve(pdfManager);
        cancelXHRs = null;
      }).catch(function (reason) {
        pdfManagerCapability.reject(reason);
        cancelXHRs = null;
      });

      var loaded = 0;
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
                loaded,
                total: Math.max(loaded, fullRequest.contentLength || 0),
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

      cancelXHRs = function(reason) {
        pdfStream.cancelAllRequests(reason);
      };

      return pdfManagerCapability.promise;
    }

    function setupDoc(data) {
      function onSuccess(doc) {
        ensureNotTerminated();
        handler.send('GetDoc', { pdfInfo: doc, });
      }

      function onFailure(ex) {
        ensureNotTerminated();

        if (ex instanceof PasswordException) {
          var task = new WorkerTask(`PasswordException: response ${ex.code}`);
          startWorkerTask(task);

          handler.sendWithPromise('PasswordRequest', ex).then(function(data) {
            finishWorkerTask(task);
            pdfManager.updatePassword(data.password);
            pdfManagerReady();
          }).catch(function() {
            finishWorkerTask(task);
            handler.send('DocException', ex);
          });
        } else if (ex instanceof InvalidPDFException ||
                   ex instanceof MissingPDFException ||
                   ex instanceof UnexpectedResponseException ||
                   ex instanceof UnknownErrorException) {
          handler.send('DocException', ex);
        } else {
          handler.send('DocException',
                       new UnknownErrorException(ex.message, ex.toString()));
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
        maxImageSize: data.maxImageSize,
        disableFontFace: data.disableFontFace,
        nativeImageDecoderSupport: data.nativeImageDecoderSupport,
        ignoreErrors: data.ignoreErrors,
        isEvalSupported: data.isEvalSupported,
      };

      getPdfManager(data, evaluatorOptions).then(function (newPdfManager) {
        if (terminated) {
          // We were in a process of setting up the manager, but it got
          // terminated in the middle.
          newPdfManager.terminate(new AbortException('Worker was terminated.'));
          throw new Error('Worker was terminated');
        }
        pdfManager = newPdfManager;

        pdfManager.onLoadedStream().then(function(stream) {
          handler.send('DataLoaded', { length: stream.bytes.byteLength, });
        });
      }).then(pdfManagerReady, onFailure);
    }

    handler.on('GetPage', function wphSetupGetPage(data) {
      return pdfManager.getPage(data.pageIndex).then(function(page) {
        return Promise.all([
          pdfManager.ensure(page, 'rotate'),
          pdfManager.ensure(page, 'ref'),
          pdfManager.ensure(page, 'userUnit'),
          pdfManager.ensure(page, 'view'),
        ]).then(function([rotate, ref, userUnit, view]) {
          return {
            rotate,
            ref,
            userUnit,
            view,
          };
        });
      });
    });

    handler.on('GetPageIndex', function wphSetupGetPageIndex(data) {
      var ref = Ref.get(data.ref.num, data.ref.gen);
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

    handler.on('GetPageLayout', function wphSetupGetPageLayout(data) {
      return pdfManager.ensureCatalog('pageLayout');
    });

    handler.on('GetPageMode', function wphSetupGetPageMode(data) {
      return pdfManager.ensureCatalog('pageMode');
    });

    handler.on('GetViewerPreferences', function(data) {
      return pdfManager.ensureCatalog('viewerPreferences');
    });

    handler.on('GetOpenActionDestination', function(data) {
      return pdfManager.ensureCatalog('openActionDestination');
    });

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

    handler.on('GetPermissions', function(data) {
      return pdfManager.ensureCatalog('permissions');
    });

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

    handler.on('GetAnnotations', function({ pageIndex, intent, }) {
      return pdfManager.getPage(pageIndex).then(function(page) {
        return page.getAnnotationsData(intent);
      });
    });

    handler.on('GetOperatorList', function wphSetupRenderPage(data, sink) {
      var pageIndex = data.pageIndex;
      pdfManager.getPage(pageIndex).then(function(page) {
        var task = new WorkerTask(`GetOperatorList: page ${pageIndex}`);
        startWorkerTask(task);

        // NOTE: Keep this condition in sync with the `info` helper function.
        const start = (verbosity >= VerbosityLevel.INFOS ? Date.now() : 0);

        // Pre compile the pdf page and fetch the fonts/images.
        page.getOperatorList({
          handler,
          sink,
          task,
          intent: data.intent,
          renderInteractiveForms: data.renderInteractiveForms,
        }).then(function(operatorListInfo) {
          finishWorkerTask(task);

          if (start) {
            info(`page=${pageIndex + 1} - getOperatorList: time=` +
                 `${Date.now() - start}ms, len=${operatorListInfo.length}`);
          }
          sink.close();
        }, function(reason) {
          finishWorkerTask(task);
          if (task.terminated) {
            return; // ignoring errors from the terminated thread
          }
          // For compatibility with older behavior, generating unknown
          // unsupported feature notification on errors.
          handler.send('UnsupportedFeature',
                       { featureId: UNSUPPORTED_FEATURES.unknown, });

          sink.error(reason);

          // TODO: Should `reason` be re-thrown here (currently that casues
          //       "Uncaught exception: ..." messages in the console)?
        });
      });
    }, this);

    handler.on('GetTextContent', function wphExtractText(data, sink) {
      var pageIndex = data.pageIndex;
      sink.onPull = function (desiredSize) { };
      sink.onCancel = function (reason) { };

      pdfManager.getPage(pageIndex).then(function(page) {
        var task = new WorkerTask('GetTextContent: page ' + pageIndex);
        startWorkerTask(task);

        // NOTE: Keep this condition in sync with the `info` helper function.
        const start = (verbosity >= VerbosityLevel.INFOS ? Date.now() : 0);

        page.extractTextContent({
          handler,
          task,
          sink,
          normalizeWhitespace: data.normalizeWhitespace,
          combineTextItems: data.combineTextItems,
        }).then(function() {
          finishWorkerTask(task);

          if (start) {
            info(`page=${pageIndex + 1} - getTextContent: time=` +
                 `${Date.now() - start}ms`);
          }
          sink.close();
        }, function (reason) {
          finishWorkerTask(task);
          if (task.terminated) {
            return; // ignoring errors from the terminated thread
          }
          sink.error(reason);

          // TODO: Should `reason` be re-thrown here (currently that casues
          //       "Uncaught exception: ..." messages in the console)?
        });
      });
    });

    handler.on('FontFallback', function(data) {
      return pdfManager.fontFallback(data.id, handler);
    });

    handler.on('Cleanup', function wphCleanup(data) {
      return pdfManager.cleanup();
    });

    handler.on('Terminate', function wphTerminate(data) {
      terminated = true;
      if (pdfManager) {
        pdfManager.terminate(new AbortException('Worker was terminated.'));
        pdfManager = null;
      }
      if (cancelXHRs) {
        cancelXHRs(new AbortException('Worker was terminated.'));
      }
      clearPrimitiveCaches();

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
  },
  initializeFromPort(port) {
    var handler = new MessageHandler('worker', 'main', port);
    WorkerMessageHandler.setup(handler, port);
    handler.send('ready', null);
  },
};

function isMessagePort(maybePort) {
  return typeof maybePort.postMessage === 'function' &&
         ('onmessage' in maybePort);
}

// Worker thread (and not node.js)?
if (typeof window === 'undefined' && !isNodeJS() &&
    typeof self !== 'undefined' && isMessagePort(self)) {
  WorkerMessageHandler.initializeFromPort(self);
}

export {
  WorkerTask,
  WorkerMessageHandler,
};
