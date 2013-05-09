/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
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
/* globals error, globalScope, InvalidPDFException, log,
           MissingPDFException, PasswordException, PDFDocument, PDFJS, Promise,
           Stream, UnknownErrorException, warn, NetworkManager, LocalPdfManager,
           NetworkPdfManager, XRefParseException, NotImplementedException,
           isInt, PasswordResponses */

'use strict';

function MessageHandler(name, comObj) {
  this.name = name;
  this.comObj = comObj;
  this.callbackIndex = 1;
  var callbacks = this.callbacks = {};
  var ah = this.actionHandler = {};

  ah['console_log'] = [function ahConsoleLog(data) {
    log.apply(null, data);
  }];
  // If there's no console available, console_error in the
  // action handler will do nothing.
  if ('console' in globalScope) {
    ah['console_error'] = [function ahConsoleError(data) {
      globalScope['console'].error.apply(null, data);
    }];
  } else {
    ah['console_error'] = [function ahConsoleError(data) {
      log.apply(null, data);
    }];
  }
  ah['_warn'] = [function ah_Warn(data) {
    warn(data);
  }];

  comObj.onmessage = function messageHandlerComObjOnMessage(event) {
    var data = event.data;
    if (data.isReply) {
      var callbackId = data.callbackId;
      if (data.callbackId in callbacks) {
        var callback = callbacks[callbackId];
        delete callbacks[callbackId];
        callback(data.data);
      } else {
        error('Cannot resolve callback ' + callbackId);
      }
    } else if (data.action in ah) {
      var action = ah[data.action];
      if (data.callbackId) {
        var promise = new Promise();
        promise.then(function(resolvedData) {
          comObj.postMessage({
            isReply: true,
            callbackId: data.callbackId,
            data: resolvedData
          });
        });
        action[0].call(action[1], data.data, promise);
      } else {
        action[0].call(action[1], data.data);
      }
    } else {
      error('Unkown action from worker: ' + data.action);
    }
  };
}

MessageHandler.prototype = {
  on: function messageHandlerOn(actionName, handler, scope) {
    var ah = this.actionHandler;
    if (ah[actionName]) {
      error('There is already an actionName called "' + actionName + '"');
    }
    ah[actionName] = [handler, scope];
  },
  /**
   * Sends a message to the comObj to invoke the action with the supplied data.
   * @param {String} actionName Action to call.
   * @param {JSON} data JSON data to send.
   * @param {function} [callback] Optional callback that will handle a reply.
   */
  send: function messageHandlerSend(actionName, data, callback) {
    var message = {
      action: actionName,
      data: data
    };
    if (callback) {
      var callbackId = this.callbackIndex++;
      this.callbacks[callbackId] = callback;
      message.callbackId = callbackId;
    }
    this.comObj.postMessage(message);
  }
};

var WorkerMessageHandler = {
  setup: function wphSetup(handler) {
    var pdfManager;

    function loadDocument(recoveryMode) {
      var loadDocumentPromise = new Promise();

      var parseSuccess = function parseSuccess() {
        var numPagesPromise = pdfManager.ensureModel('numPages');
        var fingerprintPromise = pdfManager.ensureModel('fingerprint');
        var outlinePromise = pdfManager.ensureCatalog('documentOutline');
        var infoPromise = pdfManager.ensureModel('documentInfo');
        var metadataPromise = pdfManager.ensureCatalog('metadata');
        var encryptedPromise = pdfManager.ensureXRef('encrypt');
        var javaScriptPromise = pdfManager.ensureCatalog('javaScript');
        Promise.all([numPagesPromise, fingerprintPromise, outlinePromise,
          infoPromise, metadataPromise, encryptedPromise,
          javaScriptPromise]).then(
            function onDocReady(results) {

          var doc = {
            numPages: results[0],
            fingerprint: results[1],
            outline: results[2],
            info: results[3],
            metadata: results[4],
            encrypted: !!results[5],
            javaScript: results[6]
          };
          loadDocumentPromise.resolve(doc);
        },
        parseFailure);
      };

      var parseFailure = function parseFailure(e) {
        loadDocumentPromise.reject(e);
      };

      pdfManager.ensureModel('checkHeader', []).then(function() {
        pdfManager.ensureModel('parseStartXRef', []).then(function() {
          pdfManager.ensureModel('parse', [recoveryMode]).then(
              parseSuccess, parseFailure);
        }, parseFailure);
      }, parseFailure);

      return loadDocumentPromise;
    }

    function getPdfManager(data) {
      var pdfManagerPromise = new Promise();

      var source = data.source;
      var disableRange = data.disableRange;
      if (source.data) {
        pdfManager = new LocalPdfManager(source.data, source.password);
        pdfManagerPromise.resolve();
        return pdfManagerPromise;
      } else if (source.chunkedViewerLoading) {
        pdfManager = new NetworkPdfManager(source, handler);
        pdfManagerPromise.resolve();
        return pdfManagerPromise;
      }

      var networkManager = new NetworkManager(source.url, {
        httpHeaders: source.httpHeaders
      });
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

          // NOTE: by cancelling the full request, and then issuing range
          // requests, there will be an issue for sites where you can only
          // request the pdf once. However, if this is the case, then the
          // server should not be returning that it can support range requests.
          networkManager.abortRequest(fullRequestXhrId);

          source.length = length;
          pdfManager = new NetworkPdfManager(source, handler);
          pdfManagerPromise.resolve(pdfManager);
        },

        onDone: function onDone(args) {
          // the data is array, instantiating directly from it
          pdfManager = new LocalPdfManager(args.chunk, source.password);
          pdfManagerPromise.resolve();
        },

        onError: function onError(status) {
          if (status == 404) {
            var exception = new MissingPDFException( 'Missing PDF "' +
                source.url + '".');
            handler.send('MissingPDF', { exception: exception });
          } else {
            handler.send('DocError', 'Unexpected server response (' +
                status + ') while retrieving PDF "' +
                source.url + '".');
          }
        },

        onProgress: function onProgress(evt) {
          handler.send('DocProgress', {
            loaded: evt.loaded,
            total: evt.lengthComputable ? evt.total : void(0)
          });
        }
      });

      return pdfManagerPromise;
    }

    handler.on('test', function wphSetupTest(data) {
      // check if Uint8Array can be sent to worker
      if (!(data instanceof Uint8Array)) {
        handler.send('test', false);
        return;
      }
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
      handler.send('test', true);
    });

    handler.on('GetDocRequest', function wphSetupDoc(data) {

      var onSuccess = function(doc) {
        handler.send('GetDoc', { pdfInfo: doc });
        pdfManager.ensureModel('traversePages', []).then(null, onFailure);
      };

      var onFailure = function(e) {
        if (e instanceof PasswordException) {
          if (e.code === PasswordResponses.NEED_PASSWORD) {
            handler.send('NeedPassword', {
              exception: e
            });
          } else if (e.code === PasswordResponses.INCORRECT_PASSWORD) {
            handler.send('IncorrectPassword', {
              exception: e
            });
          }
        } else if (e instanceof InvalidPDFException) {
          handler.send('InvalidPDF', {
            exception: e
          });
        } else if (e instanceof MissingPDFException) {
          handler.send('MissingPDF', {
            exception: e
          });
        } else {
          handler.send('UnknownError', {
            exception: new UnknownErrorException(e.message, e.toString())
          });
        }
      };

      getPdfManager(data).then(function pdfManagerReady() {
        loadDocument(false).then(onSuccess, function loadFailure(ex) {
          // Try again with recoveryMode == true
          if (!(ex instanceof XRefParseException)) {
            if (ex instanceof PasswordException) {
              // after password exception prepare to receive a new password
              // to repeat loading
              pdfManager.passwordChangedPromise = new Promise();
              pdfManager.passwordChangedPromise.then(pdfManagerReady);
            }

            onFailure(ex);
            return;
          }

          pdfManager.requestLoadedStream();
          pdfManager.onLoadedStream().then(function() {
            loadDocument(true).then(onSuccess, onFailure);
          });
        });
      });
    });

    handler.on('GetPageRequest', function wphSetupGetPage(data) {
      var pageIndex = data.pageIndex;
      pdfManager.getPage(pageIndex).then(function(page) {
        var rotatePromise = pdfManager.ensure(page, 'rotate');
        var refPromise = pdfManager.ensure(page, 'ref');
        var viewPromise = pdfManager.ensure(page, 'view');

        Promise.all([rotatePromise, refPromise, viewPromise]).then(
            function(results) {
          var page = {
            pageIndex: data.pageIndex,
            rotate: results[0],
            ref: results[1],
            view: results[2]
          };

          handler.send('GetPage', { pageInfo: page });
        });
      });
    });

    handler.on('GetDestinations',
      function wphSetupGetDestinations(data, promise) {
        pdfManager.ensureCatalog('destinations').then(function(destinations) {
          promise.resolve(destinations);
        });
      }
    );

    handler.on('GetData', function wphSetupGetData(data, promise) {
      pdfManager.requestLoadedStream();
      pdfManager.onLoadedStream().then(function(stream) {
        promise.resolve(stream.bytes);
      });
    });

    handler.on('DataLoaded', function wphSetupDataLoaded(data, promise) {
      pdfManager.onLoadedStream().then(function(stream) {
        promise.resolve({ length: stream.bytes.byteLength });
      });
    });

    handler.on('UpdatePassword', function wphSetupUpdatePassword(data) {
      pdfManager.updatePassword(data);
    });

    handler.on('GetAnnotationsRequest', function wphSetupGetAnnotations(data) {
      pdfManager.getPage(data.pageIndex).then(function(page) {
        pdfManager.ensure(page, 'getAnnotationsData', []).then(
          function(annotationsData) {
            handler.send('GetAnnotations', {
              pageIndex: data.pageIndex,
              annotations: annotationsData
            });
          }
        );
      });
    });

    handler.on('RenderPageRequest', function wphSetupRenderPage(data) {
      pdfManager.getPage(data.pageIndex).then(function(page) {

        var pageNum = data.pageIndex + 1;
        var start = Date.now();
        // Pre compile the pdf page and fetch the fonts/images.
        page.getOperatorList(handler).then(function(opListData) {

          var operatorList = opListData.queue;
          var dependency = Object.keys(opListData.dependencies);

          // The following code does quite the same as
          // Page.prototype.startRendering, but stops at one point and sends the
          // result back to the main thread.

          log('page=%d - getOperatorList: time=%dms, len=%d', pageNum,
              Date.now() - start, operatorList.fnArray.length);

          // Filter the dependecies for fonts.
          var fonts = {};
          for (var i = 0, ii = dependency.length; i < ii; i++) {
            var dep = dependency[i];
            if (dep.indexOf('g_font_') === 0) {
              fonts[dep] = true;
            }
          }
          handler.send('RenderPage', {
            pageIndex: data.pageIndex,
            operatorList: operatorList,
            depFonts: Object.keys(fonts)
          });
        }, function(e) {

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
            error: wrappedException
          });
        });
      });
    }, this);

    handler.on('GetTextContent', function wphExtractText(data, promise) {
      pdfManager.getPage(data.pageIndex).then(function(page) {
        var pageNum = data.pageIndex + 1;
        var start = Date.now();
        page.extractTextContent().then(function(textContent) {
          promise.resolve(textContent);
          log('text indexing: page=%d - time=%dms', pageNum,
              Date.now() - start);
        }, function (e) {
          // Skip errored pages
          promise.reject(e);
        });
      });
    });

    handler.on('Terminate', function wphTerminate(data, promise) {
      pdfManager.streamManager.networkManager.abortAllRequests();
      promise.resolve();
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
      error('Unkown timer name ' + name);
    }
    this.log('Timer:', name, Date.now() - time);
  }
};

// Worker thread?
if (typeof window === 'undefined') {
  globalScope.console = workerConsole;

  // Add a logger so we can pass warnings on to the main thread, errors will
  // throw an exception which will be forwarded on automatically.
  PDFJS.LogManager.addLogger({
    warn: function(msg) {
      globalScope.postMessage({
        action: '_warn',
        data: msg
      });
    }
  });

  var handler = new MessageHandler('worker_processor', this);
  WorkerMessageHandler.setup(handler);
}
