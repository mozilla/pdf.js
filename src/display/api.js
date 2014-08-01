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
/* globals CanvasGraphics, combineUrl, createScratchCanvas, error,
           FontLoader, globalScope, info, isArrayBuffer, loadJpegStream,
           MessageHandler, PDFJS, Promise, StatTimer, warn,
           PasswordResponses, Util, loadScript, createPromiseCapability,
           FontFace */

'use strict';

/**
 * The maximum allowed image size in total pixels e.g. width * height. Images
 * above this value will not be drawn. Use -1 for no limit.
 * @var {number}
 */
PDFJS.maxImageSize = (PDFJS.maxImageSize === undefined ?
                      -1 : PDFJS.maxImageSize);

/**
 * The url of where the predefined Adobe CMaps are located. Include trailing
 * slash.
 * @var {string}
 */
PDFJS.cMapUrl = (PDFJS.cMapUrl === undefined ? null : PDFJS.cMapUrl);

/**
 * Specifies if CMaps are binary packed.
 * @var {boolean}
 */
PDFJS.cMapPacked = PDFJS.cMapPacked === undefined ? false : PDFJS.cMapPacked;

/*
 * By default fonts are converted to OpenType fonts and loaded via font face
 * rules. If disabled, the font will be rendered using a built in font renderer
 * that constructs the glyphs with primitive path commands.
 * @var {boolean}
 */
PDFJS.disableFontFace = (PDFJS.disableFontFace === undefined ?
                         false : PDFJS.disableFontFace);

/**
 * Path for image resources, mainly for annotation icons. Include trailing
 * slash.
 * @var {string}
 */
PDFJS.imageResourcesPath = (PDFJS.imageResourcesPath === undefined ?
                            '' : PDFJS.imageResourcesPath);

/**
 * Disable the web worker and run all code on the main thread. This will happen
 * automatically if the browser doesn't support workers or sending typed arrays
 * to workers.
 * @var {boolean}
 */
PDFJS.disableWorker = (PDFJS.disableWorker === undefined ?
                       false : PDFJS.disableWorker);

/**
 * Path and filename of the worker file. Required when the worker is enabled in
 * development mode. If unspecified in the production build, the worker will be
 * loaded based on the location of the pdf.js file.
 * @var {string}
 */
PDFJS.workerSrc = (PDFJS.workerSrc === undefined ? null : PDFJS.workerSrc);

/**
 * Disable range request loading of PDF files. When enabled and if the server
 * supports partial content requests then the PDF will be fetched in chunks.
 * Enabled (false) by default.
 * @var {boolean}
 */
PDFJS.disableRange = (PDFJS.disableRange === undefined ?
                      false : PDFJS.disableRange);

/**
 * Disable pre-fetching of PDF file data. When range requests are enabled PDF.js
 * will automatically keep fetching more data even if it isn't needed to display
 * the current page. This default behavior can be disabled.
 * @var {boolean}
 */
PDFJS.disableAutoFetch = (PDFJS.disableAutoFetch === undefined ?
                          false : PDFJS.disableAutoFetch);

/**
 * Enables special hooks for debugging PDF.js.
 * @var {boolean}
 */
PDFJS.pdfBug = (PDFJS.pdfBug === undefined ? false : PDFJS.pdfBug);

/**
 * Enables transfer usage in postMessage for ArrayBuffers.
 * @var {boolean}
 */
PDFJS.postMessageTransfers = (PDFJS.postMessageTransfers === undefined ?
                              true : PDFJS.postMessageTransfers);

/**
 * Disables URL.createObjectURL usage.
 * @var {boolean}
 */
PDFJS.disableCreateObjectURL = (PDFJS.disableCreateObjectURL === undefined ?
                                false : PDFJS.disableCreateObjectURL);

/**
 * Disables WebGL usage.
 * @var {boolean}
 */
PDFJS.disableWebGL = (PDFJS.disableWebGL === undefined ?
                      true : PDFJS.disableWebGL);

/**
 * Enables CSS only zooming.
 * @var {boolean}
 */
PDFJS.useOnlyCssZoom = (PDFJS.useOnlyCssZoom === undefined ?
                        false : PDFJS.useOnlyCssZoom);

/**
 * Controls the logging level.
 * The constants from PDFJS.VERBOSITY_LEVELS should be used:
 * - errors
 * - warnings [default]
 * - infos
 * @var {number}
 */
PDFJS.verbosity = (PDFJS.verbosity === undefined ?
                   PDFJS.VERBOSITY_LEVELS.warnings : PDFJS.verbosity);

/**
 * The maximum supported canvas size in total pixels e.g. width * height. 
 * The default value is 4096 * 4096. Use -1 for no limit.
 * @var {number}
 */
PDFJS.maxCanvasPixels = (PDFJS.maxCanvasPixels === undefined ?
                         16777216 : PDFJS.maxCanvasPixels);

/**
 * Document initialization / loading parameters object.
 *
 * @typedef {Object} DocumentInitParameters
 * @property {string}     url   - The URL of the PDF.
 * @property {TypedArray} data  - A typed array with PDF data.
 * @property {Object}     httpHeaders - Basic authentication headers.
 * @property {boolean}    withCredentials - Indicates whether or not cross-site
 *   Access-Control requests should be made using credentials such as cookies
 *   or authorization headers. The default is false.
 * @property {string}     password - For decrypting password-protected PDFs.
 * @property {TypedArray} initialData - A typed array with the first portion or
 *   all of the pdf data. Used by the extension since some data is already
 *   loaded before the switch to range requests.
 */

/**
 * @typedef {Object} PDFDocumentStats
 * @property {Array} streamTypes - Used stream types in the document (an item
 *   is set to true if specific stream ID was used in the document).
 * @property {Array} fontTypes - Used font type in the document (an item is set
 *   to true if specific font ID was used in the document).
 */

/**
 * This is the main entry point for loading a PDF and interacting with it.
 * NOTE: If a URL is used to fetch the PDF data a standard XMLHttpRequest(XHR)
 * is used, which means it must follow the same origin rules that any XHR does
 * e.g. No cross domain requests without CORS.
 *
 * @param {string|TypedArray|DocumentInitParameters} source Can be a url to
 * where a PDF is located, a typed array (Uint8Array) already populated with
 * data or parameter object.
 *
 * @param {Object} pdfDataRangeTransport is optional. It is used if you want
 * to manually serve range requests for data in the PDF. See viewer.js for
 * an example of pdfDataRangeTransport's interface.
 *
 * @param {function} passwordCallback is optional. It is used to request a
 * password if wrong or no password was provided. The callback receives two
 * parameters: function that needs to be called with new password and reason
 * (see {PasswordResponses}).
 *
 * @return {Promise} A promise that is resolved with {@link PDFDocumentProxy}
 *   object.
 */
PDFJS.getDocument = function getDocument(source,
                                         pdfDataRangeTransport,
                                         passwordCallback,
                                         progressCallback) {
  var workerInitializedCapability, workerReadyCapability, transport;

  if (typeof source === 'string') {
    source = { url: source };
  } else if (isArrayBuffer(source)) {
    source = { data: source };
  } else if (typeof source !== 'object') {
    error('Invalid parameter in getDocument, need either Uint8Array, ' +
          'string or a parameter object');
  }

  if (!source.url && !source.data) {
    error('Invalid parameter array, need either .data or .url');
  }

  // copy/use all keys as is except 'url' -- full path is required
  var params = {};
  for (var key in source) {
    if (key === 'url' && typeof window !== 'undefined') {
      params[key] = combineUrl(window.location.href, source[key]);
      continue;
    }
    params[key] = source[key];
  }

  workerInitializedCapability = createPromiseCapability();
  workerReadyCapability = createPromiseCapability();
  transport = new WorkerTransport(workerInitializedCapability,
                                  workerReadyCapability, pdfDataRangeTransport,
                                  progressCallback);
  workerInitializedCapability.promise.then(function transportInitialized() {
    transport.passwordCallback = passwordCallback;
    transport.fetchDocument(params);
  });
  return workerReadyCapability.promise;
};

/**
 * Proxy to a PDFDocument in the worker thread. Also, contains commonly used
 * properties that can be read synchronously.
 * @class
 */
var PDFDocumentProxy = (function PDFDocumentProxyClosure() {
  function PDFDocumentProxy(pdfInfo, transport) {
    this.pdfInfo = pdfInfo;
    this.transport = transport;
  }
  PDFDocumentProxy.prototype = /** @lends PDFDocumentProxy.prototype */ {
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
     * @param {number} pageNumber The page number to get. The first page is 1.
     * @return {Promise} A promise that is resolved with a {@link PDFPageProxy}
     * object.
     */
    getPage: function PDFDocumentProxy_getPage(pageNumber) {
      return this.transport.getPage(pageNumber);
    },
    /**
     * @param {{num: number, gen: number}} ref The page reference. Must have
     *   the 'num' and 'gen' properties.
     * @return {Promise} A promise that is resolved with the page index that is
     * associated with the reference.
     */
    getPageIndex: function PDFDocumentProxy_getPageIndex(ref) {
      return this.transport.getPageIndex(ref);
    },
    /**
     * @return {Promise} A promise that is resolved with a lookup table for
     * mapping named destinations to reference numbers.
     */
    getDestinations: function PDFDocumentProxy_getDestinations() {
      return this.transport.getDestinations();
    },
    /**
     * @return {Promise} A promise that is resolved with a lookup table for
     * mapping named attachments to their content.
     */
    getAttachments: function PDFDocumentProxy_getAttachments() {
      return this.transport.getAttachments();
    },
    /**
     * @return {Promise} A promise that is resolved with an array of all the
     * JavaScript strings in the name tree.
     */
    getJavaScript: function PDFDocumentProxy_getJavaScript() {
      return this.transport.getJavaScript();
    },
    /**
     * @return {Promise} A promise that is resolved with an {Array} that is a
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
      return this.transport.getOutline();
    },
    /**
     * @return {Promise} A promise that is resolved with an {Object} that has
     * info and metadata properties.  Info is an {Object} filled with anything
     * available in the information dictionary and similarly metadata is a
     * {Metadata} object with information from the metadata section of the PDF.
     */
    getMetadata: function PDFDocumentProxy_getMetadata() {
      return this.transport.getMetadata();
    },
    /**
     * @return {Promise} A promise that is resolved with a TypedArray that has
     * the raw data from the PDF.
     */
    getData: function PDFDocumentProxy_getData() {
      return this.transport.getData();
    },
    /**
     * @return {Promise} A promise that is resolved when the document's data
     * is loaded. It is resolved with an {Object} that contains the length
     * property that indicates size of the PDF data in bytes.
     */
    getDownloadInfo: function PDFDocumentProxy_getDownloadInfo() {
      return this.transport.downloadInfoCapability.promise;
    },
    /**
     * @returns {Promise} A promise this is resolved with current stats about
     * document structures (see {@link PDFDocumentStats}).
     */
    getStats: function PDFDocumentProxy_getStats() {
      return this.transport.getStats();
    },
    /**
     * Cleans up resources allocated by the document, e.g. created @font-face.
     */
    cleanup: function PDFDocumentProxy_cleanup() {
      this.transport.startCleanup();
    },
    /**
     * Destroys current document instance and terminates worker.
     */
    destroy: function PDFDocumentProxy_destroy() {
      this.transport.destroy();
    }
  };
  return PDFDocumentProxy;
})();

/**
 * Page text content.
 *
 * @typedef {Object} TextContent
 * @property {array} items - array of {@link TextItem}
 * @property {Object} styles - {@link TextStyles} objects, indexed by font
 *                    name.
 */

/**
 * Page text content part.
 *
 * @typedef {Object} TextItem
 * @property {string} str - text content.
 * @property {string} dir - text direction: 'ttb', 'ltr' or 'rtl'.
 * @property {array} transform - transformation matrix.
 * @property {number} width - width in device space.
 * @property {number} height - height in device space.
 * @property {string} fontName - font name used by pdf.js for converted font.
 */

/**
 * Text style.
 *
 * @typedef {Object} TextStyle
 * @property {number} ascent - font ascent.
 * @property {number} descent - font descent.
 * @property {boolean} vertical - text is in vertical mode.
 * @property {string} fontFamily - possible font family
 */

/**
 * Page render parameters.
 *
 * @typedef {Object} RenderParameters
 * @property {Object} canvasContext - A 2D context of a DOM Canvas object.
 * @property {PDFJS.PageViewport} viewport - Rendering viewport obtained by
 *                                calling of PDFPage.getViewport method.
 * @property {string} intent - Rendering intent, can be 'display' or 'print'
 *                    (default value is 'display').
 * @property {Object} imageLayer - (optional) An object that has beginLayout,
 *                    endLayout and appendImage functions.
 * @property {function} continueCallback - (optional) A function that will be
 *                      called each time the rendering is paused.  To continue
 *                      rendering call the function that is the first argument
 *                      to the callback.
 */
 
/**
 * PDF page operator list.
 *
 * @typedef {Object} PDFOperatorList
 * @property {Array} fnArray - Array containing the operator functions.
 * @property {Array} argsArray - Array containing the arguments of the
 *                               functions.
 */

/**
 * Proxy to a PDFPage in the worker thread.
 * @class
 */
var PDFPageProxy = (function PDFPageProxyClosure() {
  function PDFPageProxy(pageIndex, pageInfo, transport) {
    this.pageIndex = pageIndex;
    this.pageInfo = pageInfo;
    this.transport = transport;
    this.stats = new StatTimer();
    this.stats.enabled = !!globalScope.PDFJS.enableStats;
    this.commonObjs = transport.commonObjs;
    this.objs = new PDFObjects();
    this.cleanupAfterRender = false;
    this.pendingDestroy = false;
    this.intentStates = {};
  }
  PDFPageProxy.prototype = /** @lends PDFPageProxy.prototype */ {
    /**
     * @return {number} Page number of the page. First page is 1.
     */
    get pageNumber() {
      return this.pageIndex + 1;
    },
    /**
     * @return {number} The number of degrees the page is rotated clockwise.
     */
    get rotate() {
      return this.pageInfo.rotate;
    },
    /**
     * @return {Object} The reference that points to this page. It has 'num' and
     * 'gen' properties.
     */
    get ref() {
      return this.pageInfo.ref;
    },
    /**
     * @return {Array} An array of the visible portion of the PDF page in the
     * user space units - [x1, y1, x2, y2].
     */
    get view() {
      return this.pageInfo.view;
    },
    /**
     * @param {number} scale The desired scale of the viewport.
     * @param {number} rotate Degrees to rotate the viewport. If omitted this
     * defaults to the page rotation.
     * @return {PDFJS.PageViewport} Contains 'width' and 'height' properties
     * along with transforms required for rendering.
     */
    getViewport: function PDFPageProxy_getViewport(scale, rotate) {
      if (arguments.length < 2) {
        rotate = this.rotate;
      }
      return new PDFJS.PageViewport(this.view, scale, rotate, 0, 0);
    },
    /**
     * @return {Promise} A promise that is resolved with an {Array} of the
     * annotation objects.
     */
    getAnnotations: function PDFPageProxy_getAnnotations() {
      if (this.annotationsPromise) {
        return this.annotationsPromise;
      }

      var promise = this.transport.getAnnotations(this.pageIndex);
      this.annotationsPromise = promise;
      return promise;
    },
    /**
     * Begins the process of rendering a page to the desired context.
     * @param {RenderParameters} params Page render parameters.
     * @return {RenderTask} An object that contains the promise, which
     *                      is resolved when the page finishes rendering.
     */
    render: function PDFPageProxy_render(params) {
      var stats = this.stats;
      stats.time('Overall');

      // If there was a pending destroy cancel it so no cleanup happens during
      // this call to render.
      this.pendingDestroy = false;

      var renderingIntent = (params.intent === 'print' ? 'print' : 'display');

      if (!this.intentStates[renderingIntent]) {
        this.intentStates[renderingIntent] = {};
      }
      var intentState = this.intentStates[renderingIntent];

      // If there's no displayReadyCapability yet, then the operatorList
      // was never requested before. Make the request and create the promise.
      if (!intentState.displayReadyCapability) {
        intentState.receivingOperatorList = true;
        intentState.displayReadyCapability = createPromiseCapability();
        intentState.operatorList = {
          fnArray: [],
          argsArray: [],
          lastChunk: false
        };

        this.stats.time('Page Request');
        this.transport.messageHandler.send('RenderPageRequest', {
          pageIndex: this.pageNumber - 1,
          intent: renderingIntent
        });
      }

      var internalRenderTask = new InternalRenderTask(complete, params,
                                                      this.objs,
                                                      this.commonObjs,
                                                      intentState.operatorList,
                                                      this.pageNumber);
      if (!intentState.renderTasks) {
        intentState.renderTasks = [];
      }
      intentState.renderTasks.push(internalRenderTask);
      var renderTask = new RenderTask(internalRenderTask);

      var self = this;
      intentState.displayReadyCapability.promise.then(
        function pageDisplayReadyPromise(transparency) {
          if (self.pendingDestroy) {
            complete();
            return;
          }
          stats.time('Rendering');
          internalRenderTask.initalizeGraphics(transparency);
          internalRenderTask.operatorListChanged();
        },
        function pageDisplayReadPromiseError(reason) {
          complete(reason);
        }
      );

      function complete(error) {
        var i = intentState.renderTasks.indexOf(internalRenderTask);
        if (i >= 0) {
          intentState.renderTasks.splice(i, 1);
        }

        if (self.cleanupAfterRender) {
          self.pendingDestroy = true;
        }
        self._tryDestroy();

        if (error) {
          internalRenderTask.capability.reject(error);
        } else {
          internalRenderTask.capability.resolve();
        }
        stats.timeEnd('Rendering');
        stats.timeEnd('Overall');
      }

      return renderTask;
    },

    /**
     * @return {Promise} A promise resolved with an {@link PDFOperatorList}
     * object that represents page's operator list.
     */
    getOperatorList: function PDFPageProxy_getOperatorList() {
      function operatorListChanged() {
        if (intentState.operatorList.lastChunk) {
          intentState.opListReadCapability.resolve(intentState.operatorList);
        }
      }

      var renderingIntent = 'oplist';
      if (!this.intentStates[renderingIntent]) {
        this.intentStates[renderingIntent] = {};
      }
      var intentState = this.intentStates[renderingIntent];

      if (!intentState.opListReadCapability) {
        var opListTask = {};
        opListTask.operatorListChanged = operatorListChanged;
        intentState.receivingOperatorList = true;
        intentState.opListReadCapability = createPromiseCapability();
        intentState.renderTasks = [];
        intentState.renderTasks.push(opListTask);
        intentState.operatorList = {
          fnArray: [],
          argsArray: [],
          lastChunk: false
        };

        this.transport.messageHandler.send('RenderPageRequest', {
          pageIndex: this.pageIndex,
          intent: renderingIntent
        });
      }
      return intentState.opListReadCapability.promise;
    },

    /**
     * @return {Promise} That is resolved a {@link TextContent}
     * object that represent the page text content.
     */
    getTextContent: function PDFPageProxy_getTextContent() {
      return this.transport.messageHandler.sendWithPromise('GetTextContent', {
        pageIndex: this.pageNumber - 1
      });
    },
    /**
     * Destroys resources allocated by the page.
     */
    destroy: function PDFPageProxy_destroy() {
      this.pendingDestroy = true;
      this._tryDestroy();
    },
    /**
     * For internal use only. Attempts to clean up if rendering is in a state
     * where that's possible.
     * @ignore
     */
    _tryDestroy: function PDFPageProxy__destroy() {
      if (!this.pendingDestroy ||
          Object.keys(this.intentStates).some(function(intent) {
            var intentState = this.intentStates[intent];
            return (intentState.renderTasks.length !== 0 ||
                    intentState.receivingOperatorList);
          }, this)) {
        return;
      }

      Object.keys(this.intentStates).forEach(function(intent) {
        delete this.intentStates[intent];
      }, this);
      this.objs.clear();
      this.annotationsPromise = null;
      this.pendingDestroy = false;
    },
    /**
     * For internal use only.
     * @ignore
     */
    _startRenderPage: function PDFPageProxy_startRenderPage(transparency,
                                                            intent) {
      var intentState = this.intentStates[intent];
      // TODO Refactor RenderPageRequest to separate rendering
      // and operator list logic
      if (intentState.displayReadyCapability) {
        intentState.displayReadyCapability.resolve(transparency);
      }
    },
    /**
     * For internal use only.
     * @ignore
     */
    _renderPageChunk: function PDFPageProxy_renderPageChunk(operatorListChunk,
                                                            intent) {
      var intentState = this.intentStates[intent];
      var i, ii;
      // Add the new chunk to the current operator list.
      for (i = 0, ii = operatorListChunk.length; i < ii; i++) {
        intentState.operatorList.fnArray.push(operatorListChunk.fnArray[i]);
        intentState.operatorList.argsArray.push(
          operatorListChunk.argsArray[i]);
      }
      intentState.operatorList.lastChunk = operatorListChunk.lastChunk;

      // Notify all the rendering tasks there are more operators to be consumed.
      for (i = 0; i < intentState.renderTasks.length; i++) {
        intentState.renderTasks[i].operatorListChanged();
      }

      if (operatorListChunk.lastChunk) {
        intentState.receivingOperatorList = false;
        this._tryDestroy();
      }
    }
  };
  return PDFPageProxy;
})();

/**
 * For internal use only.
 * @ignore
 */
var WorkerTransport = (function WorkerTransportClosure() {
  function WorkerTransport(workerInitializedCapability, workerReadyCapability,
                           pdfDataRangeTransport, progressCallback) {
    this.pdfDataRangeTransport = pdfDataRangeTransport;

    this.workerInitializedCapability = workerInitializedCapability;
    this.workerReadyCapability = workerReadyCapability;
    this.progressCallback = progressCallback;
    this.commonObjs = new PDFObjects();

    this.pageCache = [];
    this.pagePromises = [];
    this.downloadInfoCapability = createPromiseCapability();
    this.passwordCallback = null;

    // If worker support isn't disabled explicit and the browser has worker
    // support, create a new web worker and test if it/the browser fullfills
    // all requirements to run parts of pdf.js in a web worker.
    // Right now, the requirement is, that an Uint8Array is still an Uint8Array
    // as it arrives on the worker. Chrome added this with version 15.
//#if !SINGLE_FILE
    if (!globalScope.PDFJS.disableWorker && typeof Worker !== 'undefined') {
      var workerSrc = PDFJS.workerSrc;
      if (!workerSrc) {
        error('No PDFJS.workerSrc specified');
      }

      try {
        // Some versions of FF can't create a worker on localhost, see:
        // https://bugzilla.mozilla.org/show_bug.cgi?id=683280
        var worker = new Worker(workerSrc);
        var messageHandler = new MessageHandler('main', worker);
        this.messageHandler = messageHandler;

        messageHandler.on('test', function transportTest(data) {
          var supportTypedArray = data && data.supportTypedArray;
          if (supportTypedArray) {
            this.worker = worker;
            if (!data.supportTransfers) {
              PDFJS.postMessageTransfers = false;
            }
            this.setupMessageHandler(messageHandler);
            workerInitializedCapability.resolve();
          } else {
            this.setupFakeWorker();
          }
        }.bind(this));

        var testObj = new Uint8Array([PDFJS.postMessageTransfers ? 255 : 0]);
        // Some versions of Opera throw a DATA_CLONE_ERR on serializing the
        // typed array. Also, checking if we can use transfers.
        try {
          messageHandler.send('test', testObj, [testObj.buffer]);
        } catch (ex) {
          info('Cannot use postMessage transfers');
          testObj[0] = 0;
          messageHandler.send('test', testObj);
        }
        return;
      } catch (e) {
        info('The worker has been disabled.');
      }
    }
//#endif
    // Either workers are disabled, not supported or have thrown an exception.
    // Thus, we fallback to a faked worker.
    this.setupFakeWorker();
  }
  WorkerTransport.prototype = {
    destroy: function WorkerTransport_destroy() {
      this.pageCache = [];
      this.pagePromises = [];
      var self = this;
      this.messageHandler.sendWithPromise('Terminate', null).then(function () {
        FontLoader.clear();
        if (self.worker) {
          self.worker.terminate();
        }
      });
    },

    setupFakeWorker: function WorkerTransport_setupFakeWorker() {
      globalScope.PDFJS.disableWorker = true;

      if (!PDFJS.fakeWorkerFilesLoadedCapability) {
        PDFJS.fakeWorkerFilesLoadedCapability = createPromiseCapability();
        // In the developer build load worker_loader which in turn loads all the
        // other files and resolves the promise. In production only the
        // pdf.worker.js file is needed.
//#if !PRODUCTION
        Util.loadScript(PDFJS.workerSrc);
//#endif
//#if PRODUCTION && SINGLE_FILE
//      PDFJS.fakeWorkerFilesLoadedCapability.resolve();
//#endif
//#if PRODUCTION && !SINGLE_FILE
//      Util.loadScript(PDFJS.workerSrc, function() {
//        PDFJS.fakeWorkerFilesLoadedCapability.resolve();
//      });
//#endif
      }
      PDFJS.fakeWorkerFilesLoadedCapability.promise.then(function () {
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
        PDFJS.WorkerMessageHandler.setup(messageHandler);

        this.workerInitializedCapability.resolve();
      }.bind(this));
    },

    setupMessageHandler:
      function WorkerTransport_setupMessageHandler(messageHandler) {
      this.messageHandler = messageHandler;

      function updatePassword(password) {
        messageHandler.send('UpdatePassword', password);
      }

      var pdfDataRangeTransport = this.pdfDataRangeTransport;
      if (pdfDataRangeTransport) {
        pdfDataRangeTransport.addRangeListener(function(begin, chunk) {
          messageHandler.send('OnDataRange', {
            begin: begin,
            chunk: chunk
          });
        });

        pdfDataRangeTransport.addProgressListener(function(loaded) {
          messageHandler.send('OnDataProgress', {
            loaded: loaded
          });
        });

        messageHandler.on('RequestDataRange',
          function transportDataRange(data) {
            pdfDataRangeTransport.requestDataRange(data.begin, data.end);
          }, this);
      }

      messageHandler.on('GetDoc', function transportDoc(data) {
        var pdfInfo = data.pdfInfo;
        this.numPages = data.pdfInfo.numPages;
        var pdfDocument = new PDFDocumentProxy(pdfInfo, this);
        this.pdfDocument = pdfDocument;
        this.workerReadyCapability.resolve(pdfDocument);
      }, this);

      messageHandler.on('NeedPassword', function transportPassword(data) {
        if (this.passwordCallback) {
          return this.passwordCallback(updatePassword,
                                       PasswordResponses.NEED_PASSWORD);
        }
        this.workerReadyCapability.reject(data.exception.message,
                                          data.exception);
      }, this);

      messageHandler.on('IncorrectPassword', function transportBadPass(data) {
        if (this.passwordCallback) {
          return this.passwordCallback(updatePassword,
                                       PasswordResponses.INCORRECT_PASSWORD);
        }
        this.workerReadyCapability.reject(data.exception.message,
                                          data.exception);
      }, this);

      messageHandler.on('InvalidPDF', function transportInvalidPDF(data) {
        this.workerReadyCapability.reject(data.exception.name, data.exception);
      }, this);

      messageHandler.on('MissingPDF', function transportMissingPDF(data) {
        this.workerReadyCapability.reject(data.exception.message,
                                          data.exception);
      }, this);

      messageHandler.on('UnknownError', function transportUnknownError(data) {
        this.workerReadyCapability.reject(data.exception.message,
                                          data.exception);
      }, this);

      messageHandler.on('DataLoaded', function transportPage(data) {
        this.downloadInfoCapability.resolve(data);
      }, this);

      messageHandler.on('StartRenderPage', function transportRender(data) {
        var page = this.pageCache[data.pageIndex];

        page.stats.timeEnd('Page Request');
        page._startRenderPage(data.transparency, data.intent);
      }, this);

      messageHandler.on('RenderPageChunk', function transportRender(data) {
        var page = this.pageCache[data.pageIndex];

        page._renderPageChunk(data.operatorList, data.intent);
      }, this);

      messageHandler.on('commonobj', function transportObj(data) {
        var id = data[0];
        var type = data[1];
        if (this.commonObjs.hasData(id)) {
          return;
        }

        switch (type) {
          case 'Font':
            var exportedData = data[2];

            var font;
            if ('error' in exportedData) {
              var error = exportedData.error;
              warn('Error during font loading: ' + error);
              this.commonObjs.resolve(id, error);
              break;
            } else {
              font = new FontFace(exportedData);
            }

            FontLoader.bind(
              [font],
              function fontReady(fontObjs) {
                this.commonObjs.resolve(id, font);
              }.bind(this)
            );
            break;
          case 'FontPath':
            this.commonObjs.resolve(id, data[2]);
            break;
          default:
            error('Got unknown common object type ' + type);
        }
      }, this);

      messageHandler.on('obj', function transportObj(data) {
        var id = data[0];
        var pageIndex = data[1];
        var type = data[2];
        var pageProxy = this.pageCache[pageIndex];
        var imageData;
        if (pageProxy.objs.hasData(id)) {
          return;
        }

        switch (type) {
          case 'JpegStream':
            imageData = data[3];
            loadJpegStream(id, imageData, pageProxy.objs);
            break;
          case 'Image':
            imageData = data[3];
            pageProxy.objs.resolve(id, imageData);

            // heuristics that will allow not to store large data
            var MAX_IMAGE_SIZE_TO_STORE = 8000000;
            if (imageData && 'data' in imageData &&
                imageData.data.length > MAX_IMAGE_SIZE_TO_STORE) {
              pageProxy.cleanupAfterRender = true;
            }
            break;
          default:
            error('Got unknown object type ' + type);
        }
      }, this);

      messageHandler.on('DocProgress', function transportDocProgress(data) {
        if (this.progressCallback) {
          this.progressCallback({
            loaded: data.loaded,
            total: data.total
          });
        }
      }, this);

      messageHandler.on('DocError', function transportDocError(data) {
        this.workerReadyCapability.reject(data);
      }, this);

      messageHandler.on('PageError', function transportError(data) {
        var page = this.pageCache[data.pageNum - 1];
        var intentState = page.intentStates[data.intent];
        if (intentState.displayReadyCapability.promise) {
          intentState.displayReadyCapability.reject(data.error);
        } else {
          error(data.error);
        }
      }, this);

      messageHandler.on('JpegDecode', function(data) {
        var imageUrl = data[0];
        var components = data[1];
        if (components !== 3 && components !== 1) {
          return Promise.reject(
            new Error('Only 3 components or 1 component can be returned'));
        }

        return new Promise(function (resolve, reject) {
          var img = new Image();
          img.onload = function () {
            var width = img.width;
            var height = img.height;
            var size = width * height;
            var rgbaLength = size * 4;
            var buf = new Uint8Array(size * components);
            var tmpCanvas = createScratchCanvas(width, height);
            var tmpCtx = tmpCanvas.getContext('2d');
            tmpCtx.drawImage(img, 0, 0);
            var data = tmpCtx.getImageData(0, 0, width, height).data;
            var i, j;

            if (components === 3) {
              for (i = 0, j = 0; i < rgbaLength; i += 4, j += 3) {
                buf[j] = data[i];
                buf[j + 1] = data[i + 1];
                buf[j + 2] = data[i + 2];
              }
            } else if (components === 1) {
              for (i = 0, j = 0; i < rgbaLength; i += 4, j++) {
                buf[j] = data[i];
              }
            }
            resolve({ data: buf, width: width, height: height});
          };
          img.onerror = function () {
            reject(new Error('JpegDecode failed to load image'));
          };
          img.src = imageUrl;
        });
      });
    },

    fetchDocument: function WorkerTransport_fetchDocument(source) {
      source.disableAutoFetch = PDFJS.disableAutoFetch;
      source.chunkedViewerLoading = !!this.pdfDataRangeTransport;
      this.messageHandler.send('GetDocRequest', {
        source: source,
        disableRange: PDFJS.disableRange,
        maxImageSize: PDFJS.maxImageSize,
        cMapUrl: PDFJS.cMapUrl,
        cMapPacked: PDFJS.cMapPacked,
        disableFontFace: PDFJS.disableFontFace,
        disableCreateObjectURL: PDFJS.disableCreateObjectURL,
        verbosity: PDFJS.verbosity
      });
    },

    getData: function WorkerTransport_getData() {
      return this.messageHandler.sendWithPromise('GetData', null);
    },

    getPage: function WorkerTransport_getPage(pageNumber, capability) {
      if (pageNumber <= 0 || pageNumber > this.numPages ||
          (pageNumber|0) !== pageNumber) {
        return Promise.reject(new Error('Invalid page request'));
      }

      var pageIndex = pageNumber - 1;
      if (pageIndex in this.pagePromises) {
        return this.pagePromises[pageIndex];
      }
      var promise = this.messageHandler.sendWithPromise('GetPage', {
        pageIndex: pageIndex
      }).then(function (pageInfo) {
        var page = new PDFPageProxy(pageIndex, pageInfo, this);
        this.pageCache[pageIndex] = page;
        return page;
      }.bind(this));
      this.pagePromises[pageIndex] = promise;
      return promise;
    },

    getPageIndex: function WorkerTransport_getPageIndexByRef(ref) {
      return this.messageHandler.sendWithPromise('GetPageIndex', { ref: ref });
    },

    getAnnotations: function WorkerTransport_getAnnotations(pageIndex) {
      return this.messageHandler.sendWithPromise('GetAnnotations',
        { pageIndex: pageIndex });
    },

    getDestinations: function WorkerTransport_getDestinations() {
      return this.messageHandler.sendWithPromise('GetDestinations', null);
    },

    getAttachments: function WorkerTransport_getAttachments() {
      return this.messageHandler.sendWithPromise('GetAttachments', null);
    },

    getJavaScript: function WorkerTransport_getJavaScript() {
      return this.messageHandler.sendWithPromise('GetJavaScript', null);
    },

    getOutline: function WorkerTransport_getOutline() {
      return this.messageHandler.sendWithPromise('GetOutline', null);
    },

    getMetadata: function WorkerTransport_getMetadata() {
      return this.messageHandler.sendWithPromise('GetMetadata', null).
        then(function transportMetadata(results) {
        return {
          info: results[0],
          metadata: (results[1] ? new PDFJS.Metadata(results[1]) : null)
        };
      });
    },

    getStats: function WorkerTransport_getStats() {
      return this.messageHandler.sendWithPromise('GetStats', null);
    },

    startCleanup: function WorkerTransport_startCleanup() {
      this.messageHandler.sendWithPromise('Cleanup', null).
        then(function endCleanup() {
        for (var i = 0, ii = this.pageCache.length; i < ii; i++) {
          var page = this.pageCache[i];
          if (page) {
            page.destroy();
          }
        }
        this.commonObjs.clear();
        FontLoader.clear();
      }.bind(this));
    }
  };
  return WorkerTransport;

})();

/**
 * A PDF document and page is built of many objects. E.g. there are objects
 * for fonts, images, rendering code and such. These objects might get processed
 * inside of a worker. The `PDFObjects` implements some basic functions to
 * manage these objects.
 * @ignore
 */
var PDFObjects = (function PDFObjectsClosure() {
  function PDFObjects() {
    this.objs = {};
  }

  PDFObjects.prototype = {
    /**
     * Internal function.
     * Ensures there is an object defined for `objId`.
     */
    ensureObj: function PDFObjects_ensureObj(objId) {
      if (this.objs[objId]) {
        return this.objs[objId];
      }

      var obj = {
        capability: createPromiseCapability(),
        data: null,
        resolved: false
      };
      this.objs[objId] = obj;

      return obj;
    },

    /**
     * If called *without* callback, this returns the data of `objId` but the
     * object needs to be resolved. If it isn't, this function throws.
     *
     * If called *with* a callback, the callback is called with the data of the
     * object once the object is resolved. That means, if you call this
     * function and the object is already resolved, the callback gets called
     * right away.
     */
    get: function PDFObjects_get(objId, callback) {
      // If there is a callback, then the get can be async and the object is
      // not required to be resolved right now
      if (callback) {
        this.ensureObj(objId).capability.promise.then(callback);
        return null;
      }

      // If there isn't a callback, the user expects to get the resolved data
      // directly.
      var obj = this.objs[objId];

      // If there isn't an object yet or the object isn't resolved, then the
      // data isn't ready yet!
      if (!obj || !obj.resolved) {
        error('Requesting object that isn\'t resolved yet ' + objId);
      }

      return obj.data;
    },

    /**
     * Resolves the object `objId` with optional `data`.
     */
    resolve: function PDFObjects_resolve(objId, data) {
      var obj = this.ensureObj(objId);

      obj.resolved = true;
      obj.data = data;
      obj.capability.resolve(data);
    },

    isResolved: function PDFObjects_isResolved(objId) {
      var objs = this.objs;

      if (!objs[objId]) {
        return false;
      } else {
        return objs[objId].resolved;
      }
    },

    hasData: function PDFObjects_hasData(objId) {
      return this.isResolved(objId);
    },

    /**
     * Returns the data of `objId` if object exists, null otherwise.
     */
    getData: function PDFObjects_getData(objId) {
      var objs = this.objs;
      if (!objs[objId] || !objs[objId].resolved) {
        return null;
      } else {
        return objs[objId].data;
      }
    },

    clear: function PDFObjects_clear() {
      this.objs = {};
    }
  };
  return PDFObjects;
})();

/**
 * Allows controlling of the rendering tasks.
 * @class
 */
var RenderTask = (function RenderTaskClosure() {
  function RenderTask(internalRenderTask) {
    this.internalRenderTask = internalRenderTask;
    /**
     * Promise for rendering task completion.
     * @type {Promise}
     */
    this.promise = this.internalRenderTask.capability.promise;
  }

  RenderTask.prototype = /** @lends RenderTask.prototype */ {
    /**
     * Cancels the rendering task. If the task is currently rendering it will
     * not be cancelled until graphics pauses with a timeout. The promise that
     * this object extends will resolved when cancelled.
     */
    cancel: function RenderTask_cancel() {
      this.internalRenderTask.cancel();
    },

    /**
     * Registers callback to indicate the rendering task completion.
     *
     * @param {function} onFulfilled The callback for the rendering completion.
     * @param {function} onRejected The callback for the rendering failure.
     * @return {Promise} A promise that is resolved after the onFulfilled or
     *                   onRejected callback.
     */
    then: function RenderTask_then(onFulfilled, onRejected) {
      return this.promise.then(onFulfilled, onRejected);
    }
  };

  return RenderTask;
})();

/**
 * For internal use only.
 * @ignore
 */
var InternalRenderTask = (function InternalRenderTaskClosure() {

  function InternalRenderTask(callback, params, objs, commonObjs, operatorList,
                              pageNumber) {
    this.callback = callback;
    this.params = params;
    this.objs = objs;
    this.commonObjs = commonObjs;
    this.operatorListIdx = null;
    this.operatorList = operatorList;
    this.pageNumber = pageNumber;
    this.running = false;
    this.graphicsReadyCallback = null;
    this.graphicsReady = false;
    this.cancelled = false;
    this.capability = createPromiseCapability();
    // caching this-bound methods
    this._continueBound = this._continue.bind(this);
    this._scheduleNextBound = this._scheduleNext.bind(this);
    this._nextBound = this._next.bind(this);
  }

  InternalRenderTask.prototype = {

    initalizeGraphics:
        function InternalRenderTask_initalizeGraphics(transparency) {

      if (this.cancelled) {
        return;
      }
      if (PDFJS.pdfBug && 'StepperManager' in globalScope &&
          globalScope.StepperManager.enabled) {
        this.stepper = globalScope.StepperManager.create(this.pageNumber - 1);
        this.stepper.init(this.operatorList);
        this.stepper.nextBreakPoint = this.stepper.getNextBreakPoint();
      }

      var params = this.params;
      this.gfx = new CanvasGraphics(params.canvasContext, this.commonObjs,
                                    this.objs, params.imageLayer);

      this.gfx.beginDrawing(params.viewport, transparency);
      this.operatorListIdx = 0;
      this.graphicsReady = true;
      if (this.graphicsReadyCallback) {
        this.graphicsReadyCallback();
      }
    },

    cancel: function InternalRenderTask_cancel() {
      this.running = false;
      this.cancelled = true;
      this.callback('cancelled');
    },

    operatorListChanged: function InternalRenderTask_operatorListChanged() {
      if (!this.graphicsReady) {
        if (!this.graphicsReadyCallback) {
          this.graphicsReadyCallback = this._continueBound;
        }
        return;
      }

      if (this.stepper) {
        this.stepper.updateOperatorList(this.operatorList);
      }

      if (this.running) {
        return;
      }
      this._continue();
    },

    _continue: function InternalRenderTask__continue() {
      this.running = true;
      if (this.cancelled) {
        return;
      }
      if (this.params.continueCallback) {
        this.params.continueCallback(this._scheduleNextBound);
      } else {
        this._scheduleNext();
      }
    },

    _scheduleNext: function InternalRenderTask__scheduleNext() {
      window.requestAnimationFrame(this._nextBound);
    },

    _next: function InternalRenderTask__next() {
      if (this.cancelled) {
        return;
      }
      this.operatorListIdx = this.gfx.executeOperatorList(this.operatorList,
                                        this.operatorListIdx,
                                        this._continueBound,
                                        this.stepper);
      if (this.operatorListIdx === this.operatorList.argsArray.length) {
        this.running = false;
        if (this.operatorList.lastChunk) {
          this.gfx.endDrawing();
          this.callback();
        }
      }
    }

  };

  return InternalRenderTask;
})();
