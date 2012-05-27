/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

function MessageHandler(name, comObj) {
  this.name = name;
  this.comObj = comObj;
  this.callbackIndex = 1;
  var callbacks = this.callbacks = {};
  var ah = this.actionHandler = {};

  ah['console_log'] = [function ahConsoleLog(data) {
    console.log.apply(console, data);
  }];
  ah['console_error'] = [function ahConsoleError(data) {
    console.error.apply(console, data);
  }];
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
    var pdfModel = null;

    handler.on('test', function wphSetupTest(data) {
      handler.send('test', data instanceof Uint8Array);
    });

    handler.on('GetDocRequest', function wphSetupDoc(data) {
      // Create only the model of the PDFDoc, which is enough for
      // processing the content of the pdf.
      var pdfData = data.data;
      var pdfPassword = data.params.password;
      try {
        pdfModel = new PDFDocument(new Stream(pdfData), pdfPassword);
      } catch (e) {
        if (e instanceof PasswordException) {
          if (e.code === 'needpassword') {
            handler.send('NeedPassword', {
              exception: e
            });
          } else if (e.code === 'incorrectpassword') {
            handler.send('IncorrectPassword', {
              exception: e
            });
          }

          return;
        } else {
          throw e;
        }
      }
      var doc = {
        numPages: pdfModel.numPages,
        fingerprint: pdfModel.getFingerprint(),
        destinations: pdfModel.catalog.destinations,
        outline: pdfModel.catalog.documentOutline,
        info: pdfModel.getDocumentInfo(),
        metadata: pdfModel.catalog.metadata,
        encrypted: !!pdfModel.xref.encrypt
      };
      handler.send('GetDoc', {pdfInfo: doc});
    });

    handler.on('GetPageRequest', function wphSetupGetPage(data) {
      var pageNumber = data.pageIndex + 1;
      var pdfPage = pdfModel.getPage(pageNumber);
      var page = {
        pageIndex: data.pageIndex,
        rotate: pdfPage.rotate,
        ref: pdfPage.ref,
        view: pdfPage.view
      };
      handler.send('GetPage', {pageInfo: page});
    });

    handler.on('GetData', function wphSetupGetData(data, promise) {
      promise.resolve(pdfModel.stream.bytes);
    });

    handler.on('GetAnnotationsRequest', function wphSetupGetAnnotations(data) {
      var pdfPage = pdfModel.getPage(data.pageIndex + 1);
      handler.send('GetAnnotations', {
        pageIndex: data.pageIndex,
        annotations: pdfPage.getAnnotations()
      });
    });

    handler.on('RenderPageRequest', function wphSetupRenderPage(data) {
      var pageNum = data.pageIndex + 1;

      // The following code does quite the same as
      // Page.prototype.startRendering, but stops at one point and sends the
      // result back to the main thread.
      var gfx = new CanvasGraphics(null);

      var start = Date.now();

      var dependency = [];
      var operatorList = null;
      try {
        var page = pdfModel.getPage(pageNum);
        // Pre compile the pdf page and fetch the fonts/images.
        operatorList = page.getOperatorList(handler, dependency);
      } catch (e) {
        var minimumStackMessage =
            'worker.js: while trying to getPage() and getOperatorList()';

        // Turn the error into an obj that can be serialized
        if (typeof e === 'string') {
          e = {
            message: e,
            stack: minimumStackMessage
          };
        } else if (typeof e === 'object') {
          e = {
            message: e.message || e.toString(),
            stack: e.stack || minimumStackMessage
          };
        } else {
          e = {
            message: 'Unknown exception type: ' + (typeof e),
            stack: minimumStackMessage
          };
        }

        handler.send('PageError', {
          pageNum: pageNum,
          error: e
        });
        return;
      }

      console.log('page=%d - getOperatorList: time=%dms, len=%d', pageNum,
                              Date.now() - start, operatorList.fnArray.length);

      // Filter the dependecies for fonts.
      var fonts = {};
      for (var i = 0, ii = dependency.length; i < ii; i++) {
        var dep = dependency[i];
        if (dep.indexOf('font_') == 0) {
          fonts[dep] = true;
        }
      }
      handler.send('RenderPage', {
        pageIndex: data.pageIndex,
        operatorList: operatorList,
        depFonts: Object.keys(fonts)
      });
    }, this);

    handler.on('GetTextContent', function wphExtractText(data, promise) {
      var pageNum = data.pageIndex + 1;
      var start = Date.now();

      var textContent = '';
      try {
        var page = pdfModel.getPage(pageNum);
        textContent = page.extractTextContent();
        promise.resolve(textContent);
      } catch (e) {
        // Skip errored pages
        promise.reject(e);
      }

      console.log('text indexing: page=%d - time=%dms',
                      pageNum, Date.now() - start);
    });
  }
};

var consoleTimer = {};

var workerConsole = {
  log: function log() {
    var args = Array.prototype.slice.call(arguments);
    postMessage({
      action: 'console_log',
      data: args
    });
  },

  error: function error() {
    var args = Array.prototype.slice.call(arguments);
    postMessage({
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
    if (time == null) {
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
      postMessage({
        action: '_warn',
        data: msg
      });
    }
  });

  var handler = new MessageHandler('worker_processor', this);
  WorkerMessageHandler.setup(handler);
}

