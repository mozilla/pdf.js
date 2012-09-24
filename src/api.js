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

 'use strict';

/**
 * This is the main entry point for loading a PDF and interacting with it.
 * NOTE: If a URL is used to fetch the PDF data a standard XMLHttpRequest(XHR)
 * is used, which means it must follow the same origin rules that any XHR does
 * e.g. No cross domain requests without CORS.
 *
 * @param {string|TypedAray|object} source Can be an url to where a PDF is
 * located, a typed array (Uint8Array) already populated with data or
 * and parameter object with the following possible fields:
 *  - url   - The URL of the PDF.
 *  - data  - A typed array with PDF data.
 *  - httpHeaders - Basic authentication headers.
 *  - password - For decrypting password-protected PDFs.
 *
 * @return {Promise} A promise that is resolved with {PDFDocumentProxy} object.
 */
PDFJS.getDocument = function getDocument(source) {
  var workerInitializedPromise, workerReadyPromise, transport;

  if (typeof source === 'string') {
    source = { url: source };
  } else if (isArrayBuffer(source)) {
    source = { data: source };
  } else if (typeof source !== 'object') {
    error('Invalid parameter in getDocument, need either Uint8Array, ' +
          'string or a parameter object');
  }

  if (!source.url && !source.data)
    error('Invalid parameter array, need either .data or .url');

  // copy/use all keys as is except 'url' -- full path is required
  var params = {};
  for (var key in source) {
    if (key === 'url' && typeof window !== 'undefined') {
      params[key] = combineUrl(window.location.href, source[key]);
      continue;
    }
    params[key] = source[key];
  }

  workerInitializedPromise = new PDFJS.Promise();
  workerReadyPromise = new PDFJS.Promise();
  transport = new WorkerTransport(workerInitializedPromise, workerReadyPromise);
  workerInitializedPromise.then(function transportInitialized() {
    transport.fetchDocument(params);
  });
  return workerReadyPromise;
};

/**
 * Proxy to a PDFDocument in the worker thread. Also, contains commonly used
 * properties that can be read synchronously.
 */
var PDFDocumentProxy = (function PDFDocumentProxyClosure() {
  function PDFDocumentProxy(pdfInfo, transport) {
    this.pdfInfo = pdfInfo;
    this.transport = transport;
  }
  PDFDocumentProxy.prototype = {
    /**
     * @return {number} Total number of pages the PDF contains.
     */
    get numPages() {
      return this.pdfInfo.numPages;
    },
    /**
     * @return {string} A unique ID to identify a PDF. Not guaranteed to be
     * unique.
     */
    get fingerprint() {
      return this.pdfInfo.fingerprint;
    },
    /**
     * @param {number} The page number to get. The first page is 1.
     * @return {Promise} A promise that is resolved with a {PDFPageProxy}
     * object.
     */
    getPage: function PDFDocumentProxy_getPage(number) {
      return this.transport.getPage(number);
    },
    /**
     * @return {Promise} A promise that is resolved with a lookup table for
     * mapping named destinations to reference numbers.
     */
    getDestinations: function PDFDocumentProxy_getDestinations() {
      var promise = new PDFJS.Promise();
      var destinations = this.pdfInfo.destinations;
      promise.resolve(destinations);
      return promise;
    },
    /**
     * @return {Promise} A promise that is resolved with an {array} that is a
     * tree outline (if it has one) of the PDF. The tree is in the format of:
     * [
     *  {
     *   title: string,
     *   bold: boolean,
     *   italic: boolean,
     *   color: rgb array,
     *   dest: dest obj,
     *   items: array of more items like this
     *  },
     *  ...
     * ].
     */
    getOutline: function PDFDocumentProxy_getOutline() {
      var promise = new PDFJS.Promise();
      var outline = this.pdfInfo.outline;
      promise.resolve(outline);
      return promise;
    },
    /**
     * @return {Promise} A promise that is resolved with an {object} that has
     * info and metadata properties.  Info is an {object} filled with anything
     * available in the information dictionary and similarly metadata is a
     * {Metadata} object with information from the metadata section of the PDF.
     */
    getMetadata: function PDFDocumentProxy_getMetadata() {
      var promise = new PDFJS.Promise();
      var info = this.pdfInfo.info;
      var metadata = this.pdfInfo.metadata;
      promise.resolve({
        info: info,
        metadata: metadata ? new PDFJS.Metadata(metadata) : null
      });
      return promise;
    },
    isEncrypted: function PDFDocumentProxy_isEncrypted() {
      var promise = new PDFJS.Promise();
      promise.resolve(this.pdfInfo.encrypted);
      return promise;
    },
    /**
     * @return {Promise} A promise that is resolved with a TypedArray that has
     * the raw data from the PDF.
     */
    getData: function PDFDocumentProxy_getData() {
      var promise = new PDFJS.Promise();
      this.transport.getData(promise);
      return promise;
    },
    destroy: function PDFDocumentProxy_destroy() {
      this.transport.destroy();
    }
  };
  return PDFDocumentProxy;
})();

var PDFPageProxy = (function PDFPageProxyClosure() {
  function PDFPageProxy(pageInfo, transport) {
    this.pageInfo = pageInfo;
    this.transport = transport;
    this.stats = new StatTimer();
    this.stats.enabled = !!globalScope.PDFJS.enableStats;
    this.objs = transport.objs;
    this.renderInProgress = false;
  }
  PDFPageProxy.prototype = {
    /**
     * @return {number} Page number of the page. First page is 1.
     */
    get pageNumber() {
      return this.pageInfo.pageIndex + 1;
    },
    /**
     * @return {number} The number of degrees the page is rotated clockwise.
     */
    get rotate() {
      return this.pageInfo.rotate;
    },
    /**
     * @return {object} The reference that points to this page. It has 'num' and
     * 'gen' properties.
     */
    get ref() {
      return this.pageInfo.ref;
    },
    /**
     * @return {array} An array of the visible portion of the PDF page in the
     * user space units - [x1, y1, x2, y2].
     */
    get view() {
      return this.pageInfo.view;
    },
    /**
     * @param {number} scale The desired scale of the viewport.
     * @param {number} rotate Degrees to rotate the viewport. If omitted this
     * defaults to the page rotation.
     * @return {PageViewport} Contains 'width' and 'height' properties along
     * with transforms required for rendering.
     */
    getViewport: function PDFPageProxy_getViewport(scale, rotate) {
      if (arguments.length < 2)
        rotate = this.rotate;
      return new PDFJS.PageViewport(this.view, scale, rotate, 0, 0);
    },
    /**
     * @return {Promise} A promise that is resolved with an {array} of the
     * annotation objects.
     */
    getAnnotations: function PDFPageProxy_getAnnotations() {
      if (this.annotationsPromise)
        return this.annotationsPromise;

      var promise = new PDFJS.Promise();
      this.annotationsPromise = promise;
      this.transport.getAnnotations(this.pageInfo.pageIndex);
      return promise;
    },
    /**
     * Begins the process of rendering a page to the desired context.
     * @param {object} params A parameter object that supports:
     * {
     *   canvasContext(required): A 2D context of a DOM Canvas object.,
     *   textLayer(optional): An object that has beginLayout, endLayout, and
     *                        appendText functions.,
     *   continueCallback(optional): A function that will be called each time
     *                               the rendering is paused.  To continue
     *                               rendering call the function that is the
     *                               first argument to the callback.
     * }.
     * @return {Promise} A promise that is resolved when the page finishes
     * rendering.
     */
    render: function PDFPageProxy_render(params) {
      this.renderInProgress = true;

      var promise = new Promise();
      var stats = this.stats;
      stats.time('Overall');
      // If there is no displayReadyPromise yet, then the operatorList was never
      // requested before. Make the request and create the promise.
      if (!this.displayReadyPromise) {
        this.displayReadyPromise = new Promise();
        this.destroyed = false;

        this.stats.time('Page Request');
        this.transport.messageHandler.send('RenderPageRequest', {
          pageIndex: this.pageNumber - 1
        });
      }

      var self = this;
      function complete(error) {
        self.renderInProgress = false;
        if (self.destroyed) {
          delete self.operatorList;
          delete self.displayReadyPromise;
        }

        if (error)
          promise.reject(error);
        else
          promise.resolve();
      };
      var continueCallback = params.continueCallback;

      // Once the operatorList and fonts are loaded, do the actual rendering.
      this.displayReadyPromise.then(
        function pageDisplayReadyPromise() {
          if (self.destroyed) {
            complete();
            return;
          }

          var gfx = new CanvasGraphics(params.canvasContext,
            this.objs, params.textLayer);
          try {
            this.display(gfx, params.viewport, complete, continueCallback);
          } catch (e) {
            complete(e);
          }
        }.bind(this),
        function pageDisplayReadPromiseError(reason) {
          complete(reason);
        }
      );

      return promise;
    },
    /**
     * For internal use only.
     */
    startRenderingFromOperatorList:
      function PDFPageProxy_startRenderingFromOperatorList(operatorList,
                                                           fonts) {
      var self = this;
      this.operatorList = operatorList;

      var displayContinuation = function pageDisplayContinuation() {
        // Always defer call to display() to work around bug in
        // Firefox error reporting from XHR callbacks.
        setTimeout(function pageSetTimeout() {
          self.displayReadyPromise.resolve();
        });
      };

      this.ensureFonts(fonts,
        function pageStartRenderingFromOperatorListEnsureFonts() {
          displayContinuation();
        }
      );
    },
    /**
     * For internal use only.
     */
    ensureFonts: function PDFPageProxy_ensureFonts(fonts, callback) {
      this.stats.time('Font Loading');
      // Convert the font names to the corresponding font obj.
      var fontObjs = [];
      for (var i = 0, ii = fonts.length; i < ii; i++) {
        var obj = this.objs.objs[fonts[i]].data;
        if (obj.error) {
          warn('Error during font loading: ' + obj.error);
          continue;
        }
        fontObjs.push(obj);
      }

      // Load all the fonts
      FontLoader.bind(
        fontObjs,
        function pageEnsureFontsFontObjs(fontObjs) {
          this.stats.timeEnd('Font Loading');

          callback.call(this);
        }.bind(this)
      );
    },
    /**
     * For internal use only.
     */
    display: function PDFPageProxy_display(gfx, viewport, callback,
                                           continueCallback) {
      var stats = this.stats;
      stats.time('Rendering');

      gfx.beginDrawing(viewport);

      var startIdx = 0;
      var length = this.operatorList.fnArray.length;
      var operatorList = this.operatorList;
      var stepper = null;
      if (PDFJS.pdfBug && 'StepperManager' in globalScope &&
          globalScope['StepperManager'].enabled) {
        stepper = globalScope['StepperManager'].create(this.pageNumber - 1);
        stepper.init(operatorList);
        stepper.nextBreakPoint = stepper.getNextBreakPoint();
      }

      var continueWrapper;
      if (continueCallback)
        continueWrapper = function() { continueCallback(next); }
      else
        continueWrapper = next;

      var self = this;
      function next() {
        startIdx = gfx.executeOperatorList(operatorList, startIdx,
                                           continueWrapper, stepper);
        if (startIdx == length) {
          gfx.endDrawing();
          stats.timeEnd('Rendering');
          stats.timeEnd('Overall');
          if (callback) callback();
        }
      }
      continueWrapper();
    },
    /**
     * @return {Promise} That is resolved with the a {string} that is the text
     * content from the page.
     */
    getTextContent: function PDFPageProxy_getTextContent() {
      var promise = new PDFJS.Promise();
      this.transport.messageHandler.send('GetTextContent', {
          pageIndex: this.pageNumber - 1
        },
        function textContentCallback(textContent) {
          promise.resolve(textContent);
        }
      );
      return promise;
    },
    /**
     * Stub for future feature.
     */
    getOperationList: function PDFPageProxy_getOperationList() {
      var promise = new PDFJS.Promise();
      var operationList = { // not implemented
        dependencyFontsID: null,
        operatorList: null
      };
      promise.resolve(operationList);
      return promise;
    },
    /**
     * Destroys resources allocated by the page.
     */
    destroy: function PDFPageProxy_destroy() {
      this.destroyed = true;

      if (!this.renderInProgress) {
        delete this.operatorList;
        delete this.displayReadyPromise;
      }
    }
  };
  return PDFPageProxy;
})();
/**
 * For internal use only.
 */
var WorkerTransport = (function WorkerTransportClosure() {
  function WorkerTransport(workerInitializedPromise, workerReadyPromise) {
    this.workerReadyPromise = workerReadyPromise;
    this.objs = new PDFObjects();

    this.pageCache = [];
    this.pagePromises = [];
    this.fontsLoading = {};

    // If worker support isn't disabled explicit and the browser has worker
    // support, create a new web worker and test if it/the browser fullfills
    // all requirements to run parts of pdf.js in a web worker.
    // Right now, the requirement is, that an Uint8Array is still an Uint8Array
    // as it arrives on the worker. Chrome added this with version 15.
    if (!globalScope.PDFJS.disableWorker && typeof Worker !== 'undefined') {
      var workerSrc = PDFJS.workerSrc;
      if (typeof workerSrc === 'undefined') {
        error('No PDFJS.workerSrc specified');
      }

      try {
        var worker;
//#if !(FIREFOX || MOZCENTRAL)
        // Some versions of FF can't create a worker on localhost, see:
        // https://bugzilla.mozilla.org/show_bug.cgi?id=683280
        worker = new Worker(workerSrc);
//#else
//      // The firefox extension can't load the worker from the resource://
//      // url so we have to inline the script and then use the blob loader.
//      var script = document.querySelector('#PDFJS_SCRIPT_TAG');
//      var blob = PDFJS.createBlob(script.textContent, script.type);
//      var blobUrl = window.URL.createObjectURL(blob);
//      worker = new Worker(blobUrl);
//#endif
        var messageHandler = new MessageHandler('main', worker);
        this.messageHandler = messageHandler;

        messageHandler.on('test', function transportTest(supportTypedArray) {
          if (supportTypedArray) {
            this.worker = worker;
            this.setupMessageHandler(messageHandler);
          } else {
            globalScope.PDFJS.disableWorker = true;
            this.setupFakeWorker();
          }
          workerInitializedPromise.resolve();
        }.bind(this));

        var testObj = new Uint8Array(1);
        // Some versions of Opera throw a DATA_CLONE_ERR on
        // serializing the typed array.
        messageHandler.send('test', testObj);
        return;
      } catch (e) {
        info('The worker has been disabled.');
      }
    }
    // Either workers are disabled, not supported or have thrown an exception.
    // Thus, we fallback to a faked worker.
    globalScope.PDFJS.disableWorker = true;
    this.setupFakeWorker();
    workerInitializedPromise.resolve();
  }
  WorkerTransport.prototype = {
    destroy: function WorkerTransport_destroy() {
      if (this.worker)
        this.worker.terminate();

      this.pageCache = [];
      this.pagePromises = [];
    },
    setupFakeWorker: function WorkerTransport_setupFakeWorker() {
      warn('Setting up fake worker.');
      // If we don't use a worker, just post/sendMessage to the main thread.
      var fakeWorker = {
        postMessage: function WorkerTransport_postMessage(obj) {
          fakeWorker.onmessage({data: obj});
        },
        terminate: function WorkerTransport_terminate() {}
      };

      var messageHandler = new MessageHandler('main', fakeWorker);
      this.setupMessageHandler(messageHandler);

      // If the main thread is our worker, setup the handling for the messages
      // the main thread sends to it self.
      WorkerMessageHandler.setup(messageHandler);
    },

    setupMessageHandler:
      function WorkerTransport_setupMessageHandler(messageHandler) {
      this.messageHandler = messageHandler;

      messageHandler.on('GetDoc', function transportDoc(data) {
        var pdfInfo = data.pdfInfo;
        var pdfDocument = new PDFDocumentProxy(pdfInfo, this);
        this.pdfDocument = pdfDocument;
        this.workerReadyPromise.resolve(pdfDocument);
      }, this);

      messageHandler.on('NeedPassword', function transportPassword(data) {
        this.workerReadyPromise.reject(data.exception.message, data.exception);
      }, this);

      messageHandler.on('IncorrectPassword', function transportBadPass(data) {
        this.workerReadyPromise.reject(data.exception.message, data.exception);
      }, this);

      messageHandler.on('GetPage', function transportPage(data) {
        var pageInfo = data.pageInfo;
        var page = new PDFPageProxy(pageInfo, this);
        this.pageCache[pageInfo.pageIndex] = page;
        var promise = this.pagePromises[pageInfo.pageIndex];
        promise.resolve(page);
      }, this);

      messageHandler.on('GetAnnotations', function transportAnnotations(data) {
        var annotations = data.annotations;
        var promise = this.pageCache[data.pageIndex].annotationsPromise;
        promise.resolve(annotations);
      }, this);

      messageHandler.on('RenderPage', function transportRender(data) {
        var page = this.pageCache[data.pageIndex];
        var depFonts = data.depFonts;

        page.stats.timeEnd('Page Request');
        page.startRenderingFromOperatorList(data.operatorList, depFonts);
      }, this);

      messageHandler.on('obj', function transportObj(data) {
        var id = data[0];
        var type = data[1];
        if (this.objs.hasData(id))
          return;

        switch (type) {
          case 'JpegStream':
            var imageData = data[2];
            loadJpegStream(id, imageData, this.objs);
            break;
          case 'Image':
            var imageData = data[2];
            this.objs.resolve(id, imageData);
            break;
          case 'Font':
            var exportedData = data[2];

            // At this point, only the font object is created but the font is
            // not yet attached to the DOM. This is done in `FontLoader.bind`.
            var font;
            if ('error' in exportedData)
              font = new ErrorFont(exportedData.error);
            else
              font = new Font(exportedData);
            this.objs.resolve(id, font);
            break;
          default:
            error('Got unkown object type ' + type);
        }
      }, this);

      messageHandler.on('DocProgress', function transportDocProgress(data) {
        this.workerReadyPromise.progress({
          loaded: data.loaded,
          total: data.total
        });
      }, this);

      messageHandler.on('DocError', function transportDocError(data) {
        this.workerReadyPromise.reject(data);
      }, this);

      messageHandler.on('PageError', function transportError(data) {
        var page = this.pageCache[data.pageNum - 1];
        if (page.displayReadyPromise)
          page.displayReadyPromise.reject(data.error);
        else
          error(data.error);
      }, this);

      messageHandler.on('JpegDecode', function(data, promise) {
        var imageData = data[0];
        var components = data[1];
        if (components != 3 && components != 1)
          error('Only 3 component or 1 component can be returned');

        var img = new Image();
        img.onload = (function messageHandler_onloadClosure() {
          var width = img.width;
          var height = img.height;
          var size = width * height;
          var rgbaLength = size * 4;
          var buf = new Uint8Array(size * components);
          var tmpCanvas = createScratchCanvas(width, height);
          var tmpCtx = tmpCanvas.getContext('2d');
          tmpCtx.drawImage(img, 0, 0);
          var data = tmpCtx.getImageData(0, 0, width, height).data;

          if (components == 3) {
            for (var i = 0, j = 0; i < rgbaLength; i += 4, j += 3) {
              buf[j] = data[i];
              buf[j + 1] = data[i + 1];
              buf[j + 2] = data[i + 2];
            }
          } else if (components == 1) {
            for (var i = 0, j = 0; i < rgbaLength; i += 4, j++) {
              buf[j] = data[i];
            }
          }
          promise.resolve({ data: buf, width: width, height: height});
        }).bind(this);
        var src = 'data:image/jpeg;base64,' + window.btoa(imageData);
        img.src = src;
      });
    },

    fetchDocument: function WorkerTransport_fetchDocument(source) {
      this.messageHandler.send('GetDocRequest', {source: source});
    },

    getData: function WorkerTransport_getData(promise) {
      this.messageHandler.send('GetData', null, function(data) {
        promise.resolve(data);
      });
    },

    getPage: function WorkerTransport_getPage(pageNumber, promise) {
      var pageIndex = pageNumber - 1;
      if (pageIndex in this.pagePromises)
        return this.pagePromises[pageIndex];
      var promise = new PDFJS.Promise('Page ' + pageNumber);
      this.pagePromises[pageIndex] = promise;
      this.messageHandler.send('GetPageRequest', { pageIndex: pageIndex });
      return promise;
    },

    getAnnotations: function WorkerTransport_getAnnotations(pageIndex) {
      this.messageHandler.send('GetAnnotationsRequest',
        { pageIndex: pageIndex });
    }
  };
  return WorkerTransport;

})();
