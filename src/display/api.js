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
/* globals requirejs, __non_webpack_require__ */

import {
  assert, createPromiseCapability, getVerbosityLevel, info, InvalidPDFException,
  isArrayBuffer, isSameOrigin, MissingPDFException, NativeImageDecoding,
  PasswordException, setVerbosityLevel, shadow, stringToBytes,
  UnexpectedResponseException, UnknownErrorException, unreachable, URL, warn
} from '../shared/util';
import {
  DOMCanvasFactory, DOMCMapReaderFactory, DummyStatTimer, loadScript,
  PageViewport, RenderingCancelledException, StatTimer
} from './dom_utils';
import { FontFaceObject, FontLoader } from './font_loader';
import { apiCompatibilityParams } from './api_compatibility';
import { CanvasGraphics } from './canvas';
import globalScope from '../shared/global_scope';
import { GlobalWorkerOptions } from './worker_options';
import { MessageHandler } from '../shared/message_handler';
import { Metadata } from './metadata';
import { PDFDataTransportStream } from './transport_stream';
import { WebGLContext } from './webgl';

const DEFAULT_RANGE_CHUNK_SIZE = 65536; // 2^16 = 65536

let isWorkerDisabled = false;
let fallbackWorkerSrc;

let fakeWorkerFilesLoader = null;
if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('GENERIC')) {
  let useRequireEnsure = false;
  // For GENERIC build we need to add support for different fake file loaders
  // for different frameworks.
  if (typeof window === 'undefined') {
    // node.js - disable worker and set require.ensure.
    isWorkerDisabled = true;
    if (typeof __non_webpack_require__.ensure === 'undefined') {
      __non_webpack_require__.ensure = __non_webpack_require__('node-ensure');
    }
    useRequireEnsure = true;
  } else if (typeof __non_webpack_require__ !== 'undefined' &&
             typeof __non_webpack_require__.ensure === 'function') {
    useRequireEnsure = true;
  }
  if (typeof requirejs !== 'undefined' && requirejs.toUrl) {
    fallbackWorkerSrc = requirejs.toUrl('pdfjs-dist/build/pdf.worker.js');
  }
  const dynamicLoaderSupported =
    typeof requirejs !== 'undefined' && requirejs.load;
  fakeWorkerFilesLoader = useRequireEnsure ? (function() {
    return new Promise(function(resolve, reject) {
      __non_webpack_require__.ensure([], function() {
        try {
          let worker;
          if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('LIB')) {
            worker = __non_webpack_require__('../pdf.worker.js');
          } else {
            worker = __non_webpack_require__('./pdf.worker.js');
          }
          resolve(worker.WorkerMessageHandler);
        } catch (ex) {
          reject(ex);
        }
      }, reject, 'pdfjsWorker');
    });
  }) : dynamicLoaderSupported ? (function() {
    return new Promise(function(resolve, reject) {
      requirejs(['pdfjs-dist/build/pdf.worker'], function(worker) {
        try {
          resolve(worker.WorkerMessageHandler);
        } catch (ex) {
          reject(ex);
        }
      }, reject);
    });
  }) : null;

  if (!fallbackWorkerSrc && typeof document !== 'undefined') {
    const pdfjsFilePath = document.currentScript && document.currentScript.src;
    if (pdfjsFilePath) {
      fallbackWorkerSrc =
        pdfjsFilePath.replace(/(\.(?:min\.)?js)(\?.*)?$/i, '.worker$1$2');
    }
  }
}

/**
 * @typedef {function} IPDFStreamFactory
 * @param {DocumentInitParameters} params The document initialization
 * parameters. The "url" key is always present.
 * @return {IPDFStream}
 */

/** @type IPDFStreamFactory */
var createPDFNetworkStream;

/**
 * Sets the function that instantiates a IPDFStream as an alternative PDF data
 * transport.
 * @param {IPDFStreamFactory} pdfNetworkStreamFactory - the factory function
 * that takes document initialization parameters (including a "url") and returns
 * an instance of IPDFStream.
 */
function setPDFNetworkStreamFactory(pdfNetworkStreamFactory) {
  createPDFNetworkStream = pdfNetworkStreamFactory;
}

/**
 * Document initialization / loading parameters object.
 *
 * @typedef {Object} DocumentInitParameters
 * @property {string}     url   - The URL of the PDF.
 * @property {TypedArray|Array|string} data - Binary PDF data. Use typed arrays
 *   (Uint8Array) to improve the memory usage. If PDF data is BASE64-encoded,
 *   use atob() to convert it to a binary string first.
 * @property {Object}     httpHeaders - Basic authentication headers.
 * @property {boolean}    withCredentials - Indicates whether or not cross-site
 *   Access-Control requests should be made using credentials such as cookies
 *   or authorization headers. The default is false.
 * @property {string}     password - For decrypting password-protected PDFs.
 * @property {TypedArray} initialData - A typed array with the first portion or
 *   all of the pdf data. Used by the extension since some data is already
 *   loaded before the switch to range requests.
 * @property {number}     length - The PDF file length. It's used for progress
 *   reports and range requests operations.
 * @property {PDFDataRangeTransport} range
 * @property {number}     rangeChunkSize - Optional parameter to specify
 *   maximum number of bytes fetched per range request. The default value is
 *   2^16 = 65536.
 * @property {PDFWorker}  worker - (optional) The worker that will be used for
 *   the loading and parsing of the PDF data.
 * @property {boolean} postMessageTransfers - (optional) Enables transfer usage
 *   in postMessage for ArrayBuffers. The default value is `true`.
 * @property {number} verbosity - (optional) Controls the logging level; the
 *   constants from {VerbosityLevel} should be used.
 * @property {string} docBaseUrl - (optional) The base URL of the document,
 *   used when attempting to recover valid absolute URLs for annotations, and
 *   outline items, that (incorrectly) only specify relative URLs.
 * @property {string} nativeImageDecoderSupport - (optional) Strategy for
 *   decoding certain (simple) JPEG images in the browser. This is useful for
 *   environments without DOM image and canvas support, such as e.g. Node.js.
 *   Valid values are 'decode', 'display' or 'none'; where 'decode' is intended
 *   for browsers with full image/canvas support, 'display' for environments
 *   with limited image support through stubs (useful for SVG conversion),
 *   and 'none' where JPEG images will be decoded entirely by PDF.js.
 *   The default value is 'decode'.
 * @property {string} cMapUrl - (optional) The URL where the predefined
 *   Adobe CMaps are located. Include trailing slash.
 * @property {boolean} cMapPacked - (optional) Specifies if the Adobe CMaps are
 *   binary packed.
 * @property {Object} CMapReaderFactory - (optional) The factory that will be
 *   used when reading built-in CMap files. Providing a custom factory is useful
 *   for environments without `XMLHttpRequest` support, such as e.g. Node.js.
 *   The default value is {DOMCMapReaderFactory}.
 * @property {boolean} stopAtErrors - (optional) Reject certain promises, e.g.
 *   `getOperatorList`, `getTextContent`, and `RenderTask`, when the associated
 *   PDF data cannot be successfully parsed, instead of attempting to recover
 *   whatever possible of the data. The default value is `false`.
 * @property {number} maxImageSize - (optional) The maximum allowed image size
 *   in total pixels, i.e. width * height. Images above this value will not be
 *   rendered. Use -1 for no limit, which is also the default value.
 * @property {boolean} isEvalSupported - (optional) Determines if we can eval
 *   strings as JS. Primarily used to improve performance of font rendering,
 *   and when parsing PDF functions. The default value is `true`.
 * @property {boolean} disableFontFace - (optional) By default fonts are
 *   converted to OpenType fonts and loaded via font face rules. If disabled,
 *   fonts will be rendered using a built-in font renderer that constructs the
 *   glyphs with primitive path commands. The default value is `false`.
 * @property {boolean} disableRange - (optional) Disable range request loading
 *   of PDF files. When enabled, and if the server supports partial content
 *   requests, then the PDF will be fetched in chunks.
 *   The default value is `false`.
 * @property {boolean} disableStream - (optional) Disable streaming of PDF file
 *   data. By default PDF.js attempts to load PDFs in chunks.
 *   The default value is `false`.
 * @property {boolean} disableAutoFetch - (optional) Disable pre-fetching of PDF
 *   file data. When range requests are enabled PDF.js will automatically keep
 *   fetching more data even if it isn't needed to display the current page.
 *   The default value is `false`.
 *   NOTE: It is also necessary to disable streaming, see above,
 *         in order for disabling of pre-fetching to work correctly.
 * @property {boolean} disableCreateObjectURL - (optional) Disable the use of
 *   `URL.createObjectURL`, for compatibility with older browsers.
 *   The default value is `false`.
 * @property {boolean} pdfBug - (optional) Enables special hooks for debugging
 *   PDF.js (see `web/debugger.js`). The default value is `false`.
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
 * @param {string|TypedArray|DocumentInitParameters|PDFDataRangeTransport} src
 * Can be a url to where a PDF is located, a typed array (Uint8Array)
 * already populated with data or parameter object.
 *
 * @return {PDFDocumentLoadingTask}
 */
function getDocument(src) {
  var task = new PDFDocumentLoadingTask();

  var source;
  if (typeof src === 'string') {
    source = { url: src, };
  } else if (isArrayBuffer(src)) {
    source = { data: src, };
  } else if (src instanceof PDFDataRangeTransport) {
    source = { range: src, };
  } else {
    if (typeof src !== 'object') {
      throw new Error('Invalid parameter in getDocument, ' +
                      'need either Uint8Array, string or a parameter object');
    }
    if (!src.url && !src.data && !src.range) {
      throw new Error(
        'Invalid parameter object: need either .data, .range or .url');
    }

    source = src;
  }

  let params = Object.create(null);
  var rangeTransport = null;
  let worker = null;

  for (var key in source) {
    if (key === 'url' && typeof window !== 'undefined') {
      // The full path is required in the 'url' field.
      params[key] = new URL(source[key], window.location).href;
      continue;
    } else if (key === 'range') {
      rangeTransport = source[key];
      continue;
    } else if (key === 'worker') {
      worker = source[key];
      continue;
    } else if (key === 'data' && !(source[key] instanceof Uint8Array)) {
      // Converting string or array-like data to Uint8Array.
      var pdfBytes = source[key];
      if (typeof pdfBytes === 'string') {
        params[key] = stringToBytes(pdfBytes);
      } else if (typeof pdfBytes === 'object' && pdfBytes !== null &&
                 !isNaN(pdfBytes.length)) {
        params[key] = new Uint8Array(pdfBytes);
      } else if (isArrayBuffer(pdfBytes)) {
        params[key] = new Uint8Array(pdfBytes);
      } else {
        throw new Error('Invalid PDF binary data: either typed array, ' +
                        'string or array-like object is expected in the ' +
                        'data property.');
      }
      continue;
    }
    params[key] = source[key];
  }

  params.rangeChunkSize = params.rangeChunkSize || DEFAULT_RANGE_CHUNK_SIZE;
  params.CMapReaderFactory = params.CMapReaderFactory || DOMCMapReaderFactory;
  params.ignoreErrors = params.stopAtErrors !== true;
  params.pdfBug = params.pdfBug === true;

  const NativeImageDecoderValues = Object.values(NativeImageDecoding);
  if (params.nativeImageDecoderSupport === undefined ||
      !NativeImageDecoderValues.includes(params.nativeImageDecoderSupport)) {
    params.nativeImageDecoderSupport =
      (apiCompatibilityParams.nativeImageDecoderSupport ||
       NativeImageDecoding.DECODE);
  }
  if (!Number.isInteger(params.maxImageSize)) {
    params.maxImageSize = -1;
  }
  if (typeof params.isEvalSupported !== 'boolean') {
    params.isEvalSupported = true;
  }
  if (typeof params.disableFontFace !== 'boolean') {
    params.disableFontFace = apiCompatibilityParams.disableFontFace || false;
  }

  if (typeof params.disableRange !== 'boolean') {
    params.disableRange = false;
  }
  if (typeof params.disableStream !== 'boolean') {
    params.disableStream = false;
  }
  if (typeof params.disableAutoFetch !== 'boolean') {
    params.disableAutoFetch = false;
  }
  if (typeof params.disableCreateObjectURL !== 'boolean') {
    params.disableCreateObjectURL =
      apiCompatibilityParams.disableCreateObjectURL || false;
  }

  // Set the main-thread verbosity level.
  setVerbosityLevel(params.verbosity);

  if (!worker) {
    const workerParams = {
      postMessageTransfers: params.postMessageTransfers,
      verbosity: params.verbosity,
    };
    // Worker was not provided -- creating and owning our own. If message port
    // is specified in global worker options, using it.
    let workerPort = GlobalWorkerOptions.workerPort;
    if (workerPort) {
      workerParams.port = workerPort;
      worker = PDFWorker.fromPort(workerParams);
    } else {
      worker = new PDFWorker(workerParams);
    }
    task._worker = worker;
  }
  var docId = task.docId;
  worker.promise.then(function () {
    if (task.destroyed) {
      throw new Error('Loading aborted');
    }
    return _fetchDocument(worker, params, rangeTransport, docId).then(
        function (workerId) {
      if (task.destroyed) {
        throw new Error('Loading aborted');
      }

      let networkStream;
      if (rangeTransport) {
        networkStream = new PDFDataTransportStream({
          length: params.length,
          initialData: params.initialData,
          disableRange: params.disableRange,
          disableStream: params.disableStream,
        }, rangeTransport);
      } else if (!params.data) {
        networkStream = createPDFNetworkStream({
          url: params.url,
          length: params.length,
          httpHeaders: params.httpHeaders,
          withCredentials: params.withCredentials,
          rangeChunkSize: params.rangeChunkSize,
          disableRange: params.disableRange,
          disableStream: params.disableStream,
        });
      }

      var messageHandler = new MessageHandler(docId, workerId, worker.port);
      messageHandler.postMessageTransfers = worker.postMessageTransfers;
      var transport = new WorkerTransport(messageHandler, task, networkStream,
                                          params);
      task._transport = transport;
      messageHandler.send('Ready', null);
    });
  }).catch(task._capability.reject);

  return task;
}

/**
 * Starts fetching of specified PDF document/data.
 * @param {PDFWorker} worker
 * @param {Object} source
 * @param {PDFDataRangeTransport} pdfDataRangeTransport
 * @param {string} docId Unique document id, used as MessageHandler id.
 * @returns {Promise} The promise, which is resolved when worker id of
 *                    MessageHandler is known.
 * @private
 */
function _fetchDocument(worker, source, pdfDataRangeTransport, docId) {
  if (worker.destroyed) {
    return Promise.reject(new Error('Worker was destroyed'));
  }

  if (pdfDataRangeTransport) {
    source.length = pdfDataRangeTransport.length;
    source.initialData = pdfDataRangeTransport.initialData;
  }
  return worker.messageHandler.sendWithPromise('GetDocRequest', {
    docId,
    apiVersion: (typeof PDFJSDev !== 'undefined' ?
                 PDFJSDev.eval('BUNDLE_VERSION') : null),
    source: { // Only send the required properties, and *not* the entire object.
      data: source.data,
      url: source.url,
      password: source.password,
      disableAutoFetch: source.disableAutoFetch,
      rangeChunkSize: source.rangeChunkSize,
      length: source.length,
    },
    maxImageSize: source.maxImageSize,
    disableFontFace: source.disableFontFace,
    disableCreateObjectURL: source.disableCreateObjectURL,
    postMessageTransfers: worker.postMessageTransfers,
    docBaseUrl: source.docBaseUrl,
    nativeImageDecoderSupport: source.nativeImageDecoderSupport,
    ignoreErrors: source.ignoreErrors,
    isEvalSupported: source.isEvalSupported,
  }).then(function (workerId) {
    if (worker.destroyed) {
      throw new Error('Worker was destroyed');
    }
    return workerId;
  });
}

/**
 * PDF document loading operation.
 * @class
 * @alias PDFDocumentLoadingTask
 */
var PDFDocumentLoadingTask = (function PDFDocumentLoadingTaskClosure() {
  var nextDocumentId = 0;

  /** @constructs PDFDocumentLoadingTask */
  function PDFDocumentLoadingTask() {
    this._capability = createPromiseCapability();
    this._transport = null;
    this._worker = null;

    /**
     * Unique document loading task id -- used in MessageHandlers.
     * @type {string}
     */
    this.docId = 'd' + (nextDocumentId++);

    /**
     * Shows if loading task is destroyed.
     * @type {boolean}
     */
    this.destroyed = false;

    /**
     * Callback to request a password if wrong or no password was provided.
     * The callback receives two parameters: function that needs to be called
     * with new password and reason (see {PasswordResponses}).
     */
    this.onPassword = null;

    /**
     * Callback to be able to monitor the loading progress of the PDF file
     * (necessary to implement e.g. a loading bar). The callback receives
     * an {Object} with the properties: {number} loaded and {number} total.
     */
    this.onProgress = null;

    /**
     * Callback to when unsupported feature is used. The callback receives
     * an {UNSUPPORTED_FEATURES} argument.
     */
    this.onUnsupportedFeature = null;
  }

  PDFDocumentLoadingTask.prototype =
      /** @lends PDFDocumentLoadingTask.prototype */ {
    /**
     * @return {Promise}
     */
    get promise() {
      return this._capability.promise;
    },

    /**
     * Aborts all network requests and destroys worker.
     * @return {Promise} A promise that is resolved after destruction activity
     *                   is completed.
     */
    destroy() {
      this.destroyed = true;

      var transportDestroyed = !this._transport ? Promise.resolve() :
        this._transport.destroy();
      return transportDestroyed.then(() => {
        this._transport = null;
        if (this._worker) {
          this._worker.destroy();
          this._worker = null;
        }
      });
    },

    /**
     * Registers callbacks to indicate the document loading completion.
     *
     * @param {function} onFulfilled The callback for the loading completion.
     * @param {function} onRejected The callback for the loading failure.
     * @return {Promise} A promise that is resolved after the onFulfilled or
     *                   onRejected callback.
     */
    then: function PDFDocumentLoadingTask_then(onFulfilled, onRejected) {
      return this.promise.then.apply(this.promise, arguments);
    },
  };

  return PDFDocumentLoadingTask;
})();

/**
 * Abstract class to support range requests file loading.
 * @param {number} length
 * @param {Uint8Array} initialData
 */
class PDFDataRangeTransport {
  constructor(length, initialData) {
    this.length = length;
    this.initialData = initialData;

    this._rangeListeners = [];
    this._progressListeners = [];
    this._progressiveReadListeners = [];
    this._readyCapability = createPromiseCapability();
  }

  addRangeListener(listener) {
    this._rangeListeners.push(listener);
  }

  addProgressListener(listener) {
    this._progressListeners.push(listener);
  }

  addProgressiveReadListener(listener) {
    this._progressiveReadListeners.push(listener);
  }

  onDataRange(begin, chunk) {
    for (const listener of this._rangeListeners) {
      listener(begin, chunk);
    }
  }

  onDataProgress(loaded) {
    this._readyCapability.promise.then(() => {
      for (const listener of this._progressListeners) {
        listener(loaded);
      }
    });
  }

  onDataProgressiveRead(chunk) {
    this._readyCapability.promise.then(() => {
      for (const listener of this._progressiveReadListeners) {
        listener(chunk);
      }
    });
  }

  transportReady() {
    this._readyCapability.resolve();
  }

  requestDataRange(begin, end) {
    unreachable('Abstract method PDFDataRangeTransport.requestDataRange');
  }

  abort() {}
}

/**
 * Proxy to a PDFDocument in the worker thread. Also, contains commonly used
 * properties that can be read synchronously.
 */
class PDFDocumentProxy {
  constructor(pdfInfo, transport, loadingTask) {
    this.loadingTask = loadingTask;

    this._pdfInfo = pdfInfo;
    this._transport = transport;
  }

  /**
   * @return {number} Total number of pages the PDF contains.
   */
  get numPages() {
    return this._pdfInfo.numPages;
  }

  /**
   * @return {string} A (not guaranteed to be) unique ID to identify a PDF.
   */
  get fingerprint() {
    return this._pdfInfo.fingerprint;
  }

  /**
   * @param {number} pageNumber - The page number to get. The first page is 1.
   * @return {Promise} A promise that is resolved with a {@link PDFPageProxy}
   *   object.
   */
  getPage(pageNumber) {
    return this._transport.getPage(pageNumber);
  }

  /**
   * @param {{num: number, gen: number}} ref - The page reference. Must have
   *   the `num` and `gen` properties.
   * @return {Promise} A promise that is resolved with the page index that is
   *   associated with the reference.
   */
  getPageIndex(ref) {
    return this._transport.getPageIndex(ref);
  }

  /**
   * @return {Promise} A promise that is resolved with a lookup table for
   *   mapping named destinations to reference numbers.
   *
   * This can be slow for large documents. Use `getDestination` instead.
   */
  getDestinations() {
    return this._transport.getDestinations();
  }

  /**
   * @param {string} id - The named destination to get.
   * @return {Promise} A promise that is resolved with all information
   *   of the given named destination.
   */
  getDestination(id) {
    return this._transport.getDestination(id);
  }

  /**
   * @return {Promise} A promise that is resolved with an {Array} containing
   *   the page labels that correspond to the page indexes, or `null` when
   *   no page labels are present in the PDF file.
   */
  getPageLabels() {
    return this._transport.getPageLabels();
  }

  /**
   * @return {Promise} A promise that is resolved with a {string} containing
   *   the page mode name.
   */
  getPageMode() {
    return this._transport.getPageMode();
  }

  /**
   * @return {Promise} A promise that is resolved with a lookup table for
   *   mapping named attachments to their content.
   */
  getAttachments() {
    return this._transport.getAttachments();
  }

  /**
   * @return {Promise} A promise that is resolved with an {Array} of all the
   *   JavaScript strings in the name tree, or `null` if no JavaScript exists.
   */
  getJavaScript() {
    return this._transport.getJavaScript();
  }

  /**
   * @return {Promise} A promise that is resolved with an {Array} that is a
   * tree outline (if it has one) of the PDF. The tree is in the format of:
   * [
   *   {
   *     title: string,
   *     bold: boolean,
   *     italic: boolean,
   *     color: rgb Uint8ClampedArray,
   *     dest: dest obj,
   *     url: string,
   *     items: array of more items like this
   *   },
   *   ...
   * ]
   */
  getOutline() {
    return this._transport.getOutline();
  }

  /**
   * @return {Promise} A promise that is resolved with an {Array} that contains
   *   the permission flags for the PDF document, or `null` when
   *   no permissions are present in the PDF file.
   */
  getPermissions() {
    return this._transport.getPermissions();
  }

  /**
   * @return {Promise} A promise that is resolved with an {Object} that has
   *   `info` and `metadata` properties. `info` is an {Object} filled with
   *   anything available in the information dictionary and similarly
   *   `metadata` is a {Metadata} object with information from the metadata
   *   section of the PDF.
   */
  getMetadata() {
    return this._transport.getMetadata();
  }

  /**
   * @return {Promise} A promise that is resolved with a {TypedArray} that has
   * the raw data from the PDF.
   */
  getData() {
    return this._transport.getData();
  }

  /**
   * @return {Promise} A promise that is resolved when the document's data
   *   is loaded. It is resolved with an {Object} that contains the `length`
   *   property that indicates size of the PDF data in bytes.
   */
  getDownloadInfo() {
    return this._transport.downloadInfoCapability.promise;
  }

  /**
   * @return {Promise} A promise this is resolved with current statistics about
   *   document structures (see {@link PDFDocumentStats}).
   */
  getStats() {
    return this._transport.getStats();
  }

  /**
   * Cleans up resources allocated by the document, e.g. created `@font-face`.
   */
  cleanup() {
    this._transport.startCleanup();
  }

  /**
   * Destroys the current document instance and terminates the worker.
   */
  destroy() {
    return this.loadingTask.destroy();
  }

  /**
   * @return {Object} A subset of the current {DocumentInitParameters},
   *   which are either needed in the viewer and/or whose default values
   *   may be affected by the `apiCompatibilityParams`.
   */
  get loadingParams() {
    return this._transport.loadingParams;
  }
}

/**
 * Page getTextContent parameters.
 *
 * @typedef {Object} getTextContentParameters
 * @property {boolean} normalizeWhitespace - replaces all occurrences of
 *   whitespace with standard spaces (0x20). The default value is `false`.
 * @property {boolean} disableCombineTextItems - do not attempt to combine
 *   same line {@link TextItem}'s. The default value is `false`.
 */

/**
 * Page text content.
 *
 * @typedef {Object} TextContent
 * @property {array} items - array of {@link TextItem}
 * @property {Object} styles - {@link TextStyles} objects, indexed by font name.
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
 * Page annotation parameters.
 *
 * @typedef {Object} GetAnnotationsParameters
 * @property {string} intent - Determines the annotations that will be fetched,
 *                    can be either 'display' (viewable annotations) or 'print'
 *                    (printable annotations).
 *                    If the parameter is omitted, all annotations are fetched.
 */

/**
 * Page render parameters.
 *
 * @typedef {Object} RenderParameters
 * @property {Object} canvasContext - A 2D context of a DOM Canvas object.
 * @property {PageViewport} viewport - Rendering viewport obtained by
 *                                calling of PDFPage.getViewport method.
 * @property {string} intent - Rendering intent, can be 'display' or 'print'
 *                    (default value is 'display').
 * @property {boolean} enableWebGL - (optional) Enables WebGL accelerated
 *   rendering for some operations. The default value is `false`.
 * @property {boolean} renderInteractiveForms - (optional) Whether or not
 *                     interactive form elements are rendered in the display
 *                     layer. If so, we do not render them on canvas as well.
 * @property {Array}  transform - (optional) Additional transform, applied
 *                    just before viewport transform.
 * @property {Object} imageLayer - (optional) An object that has beginLayout,
 *                    endLayout and appendImage functions.
 * @property {Object} canvasFactory - (optional) The factory that will be used
 *                    when creating canvases. The default value is
 *                    {DOMCanvasFactory}.
 * @property {Object} background - (optional) Background to use for the canvas.
 *                    Can use any valid canvas.fillStyle: A DOMString parsed as
 *                    CSS <color> value, a CanvasGradient object (a linear or
 *                    radial gradient) or a CanvasPattern object (a repetitive
 *                    image). The default value is 'rgb(255,255,255)'.
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
 * @alias PDFPageProxy
 */
var PDFPageProxy = (function PDFPageProxyClosure() {
  function PDFPageProxy(pageIndex, pageInfo, transport, pdfBug = false) {
    this.pageIndex = pageIndex;
    this._pageInfo = pageInfo;
    this.transport = transport;
    this._stats = (pdfBug ? new StatTimer() : DummyStatTimer);
    this._pdfBug = pdfBug;
    this.commonObjs = transport.commonObjs;
    this.objs = new PDFObjects();
    this.cleanupAfterRender = false;
    this.pendingCleanup = false;
    this.intentStates = Object.create(null);
    this.destroyed = false;
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
      return this._pageInfo.rotate;
    },
    /**
     * @return {Object} The reference that points to this page. It has 'num' and
     * 'gen' properties.
     */
    get ref() {
      return this._pageInfo.ref;
    },
    /**
     * @return {number} The default size of units in 1/72nds of an inch.
     */
    get userUnit() {
      return this._pageInfo.userUnit;
    },
    /**
     * @return {Array} An array of the visible portion of the PDF page in the
     * user space units - [x1, y1, x2, y2].
     */
    get view() {
      return this._pageInfo.view;
    },

    /**
     * @param {number} scale The desired scale of the viewport.
     * @param {number} rotate Degrees to rotate the viewport. If omitted this
     * defaults to the page rotation.
     * @param {boolean} dontFlip (optional) If true, axis Y will not be flipped.
     * @return {PageViewport} Contains 'width' and 'height' properties
     * along with transforms required for rendering.
     */
    getViewport(scale, rotate = this.rotate, dontFlip = false) {
      return new PageViewport({
        viewBox: this.view,
        scale,
        rotation: rotate,
        dontFlip,
      });
    },
    /**
     * @param {GetAnnotationsParameters} params - Annotation parameters.
     * @return {Promise} A promise that is resolved with an {Array} of the
     * annotation objects.
     */
    getAnnotations: function PDFPageProxy_getAnnotations(params) {
      var intent = (params && params.intent) || null;

      if (!this.annotationsPromise || this.annotationsIntent !== intent) {
        this.annotationsPromise = this.transport.getAnnotations(this.pageIndex,
                                                                intent);
        this.annotationsIntent = intent;
      }
      return this.annotationsPromise;
    },
    /**
     * Begins the process of rendering a page to the desired context.
     * @param {RenderParameters} params Page render parameters.
     * @return {RenderTask} An object that contains the promise, which
     *                      is resolved when the page finishes rendering.
     */
    render: function PDFPageProxy_render(params) {
      let stats = this._stats;
      stats.time('Overall');

      // If there was a pending destroy cancel it so no cleanup happens during
      // this call to render.
      this.pendingCleanup = false;

      var renderingIntent = (params.intent === 'print' ? 'print' : 'display');
      var canvasFactory = params.canvasFactory || new DOMCanvasFactory();
      let webGLContext = new WebGLContext({
        enable: params.enableWebGL,
      });

      if (!this.intentStates[renderingIntent]) {
        this.intentStates[renderingIntent] = Object.create(null);
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
          lastChunk: false,
        };

        stats.time('Page Request');
        this.transport.messageHandler.send('RenderPageRequest', {
          pageIndex: this.pageNumber - 1,
          intent: renderingIntent,
          renderInteractiveForms: (params.renderInteractiveForms === true),
        });
      }

      var complete = (error) => {
        var i = intentState.renderTasks.indexOf(internalRenderTask);
        if (i >= 0) {
          intentState.renderTasks.splice(i, 1);
        }

        if (this.cleanupAfterRender) {
          this.pendingCleanup = true;
        }
        this._tryCleanup();

        if (error) {
          internalRenderTask.capability.reject(error);
        } else {
          internalRenderTask.capability.resolve();
        }
        stats.timeEnd('Rendering');
        stats.timeEnd('Overall');
      };

      var internalRenderTask = new InternalRenderTask(complete, params,
                                                      this.objs,
                                                      this.commonObjs,
                                                      intentState.operatorList,
                                                      this.pageNumber,
                                                      canvasFactory,
                                                      webGLContext,
                                                      this._pdfBug);
      internalRenderTask.useRequestAnimationFrame = renderingIntent !== 'print';
      if (!intentState.renderTasks) {
        intentState.renderTasks = [];
      }
      intentState.renderTasks.push(internalRenderTask);
      var renderTask = internalRenderTask.task;

      intentState.displayReadyCapability.promise.then((transparency) => {
        if (this.pendingCleanup) {
          complete();
          return;
        }
        stats.time('Rendering');
        internalRenderTask.initializeGraphics(transparency);
        internalRenderTask.operatorListChanged();
      }).catch(complete);

      return renderTask;
    },

    /**
     * @return {Promise} A promise resolved with an {@link PDFOperatorList}
     *   object that represents page's operator list.
     */
    getOperatorList: function PDFPageProxy_getOperatorList() {
      function operatorListChanged() {
        if (intentState.operatorList.lastChunk) {
          intentState.opListReadCapability.resolve(intentState.operatorList);

          var i = intentState.renderTasks.indexOf(opListTask);
          if (i >= 0) {
            intentState.renderTasks.splice(i, 1);
          }
        }
      }

      var renderingIntent = 'oplist';
      if (!this.intentStates[renderingIntent]) {
        this.intentStates[renderingIntent] = Object.create(null);
      }
      var intentState = this.intentStates[renderingIntent];
      var opListTask;

      if (!intentState.opListReadCapability) {
        opListTask = {};
        opListTask.operatorListChanged = operatorListChanged;
        intentState.receivingOperatorList = true;
        intentState.opListReadCapability = createPromiseCapability();
        intentState.renderTasks = [];
        intentState.renderTasks.push(opListTask);
        intentState.operatorList = {
          fnArray: [],
          argsArray: [],
          lastChunk: false,
        };

        this._stats.time('Page Request');
        this.transport.messageHandler.send('RenderPageRequest', {
          pageIndex: this.pageIndex,
          intent: renderingIntent,
        });
      }
      return intentState.opListReadCapability.promise;
    },

    /**
     * @param {getTextContentParameters} params - getTextContent parameters.
     * @return {ReadableStream} ReadableStream to read textContent chunks.
     */
    streamTextContent(params = {}) {
      const TEXT_CONTENT_CHUNK_SIZE = 100;
      return this.transport.messageHandler.sendWithStream('GetTextContent', {
        pageIndex: this.pageNumber - 1,
        normalizeWhitespace: (params.normalizeWhitespace === true),
        combineTextItems: (params.disableCombineTextItems !== true),
      }, {
        highWaterMark: TEXT_CONTENT_CHUNK_SIZE,
        size(textContent) {
          return textContent.items.length;
        },
      });
    },

    /**
     * @param {getTextContentParameters} params - getTextContent parameters.
     * @return {Promise} That is resolved a {@link TextContent}
     * object that represent the page text content.
     */
    getTextContent: function PDFPageProxy_getTextContent(params) {
      params = params || {};
      let readableStream = this.streamTextContent(params);

      return new Promise(function(resolve, reject) {
        function pump() {
          reader.read().then(function({ value, done, }) {
            if (done) {
              resolve(textContent);
              return;
            }
            Object.assign(textContent.styles, value.styles);
            textContent.items.push(...value.items);
            pump();
          }, reject);
        }

        let reader = readableStream.getReader();
        let textContent = {
          items: [],
          styles: Object.create(null),
        };

        pump();
      });
    },

    /**
     * Destroys page object.
     */
    _destroy: function PDFPageProxy_destroy() {
      this.destroyed = true;
      this.transport.pageCache[this.pageIndex] = null;

      var waitOn = [];
      Object.keys(this.intentStates).forEach(function(intent) {
        if (intent === 'oplist') {
          // Avoid errors below, since the renderTasks are just stubs.
          return;
        }
        var intentState = this.intentStates[intent];
        intentState.renderTasks.forEach(function(renderTask) {
          var renderCompleted = renderTask.capability.promise.
            catch(function () {}); // ignoring failures
          waitOn.push(renderCompleted);
          renderTask.cancel();
        });
      }, this);
      this.objs.clear();
      this.annotationsPromise = null;
      this.pendingCleanup = false;
      return Promise.all(waitOn);
    },

    /**
     * Cleans up resources allocated by the page.
     * @param {boolean} resetStats - (optional) Reset page stats, if enabled.
     *   The default value is `false`.
     */
    cleanup(resetStats = false) {
      this.pendingCleanup = true;
      this._tryCleanup(resetStats);
    },
    /**
     * For internal use only. Attempts to clean up if rendering is in a state
     * where that's possible.
     * @ignore
     */
    _tryCleanup(resetStats = false) {
      if (!this.pendingCleanup ||
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
      if (resetStats && this._stats instanceof StatTimer) {
        this._stats = new StatTimer();
      }
      this.pendingCleanup = false;
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
        this._tryCleanup();
      }
    },

    /**
     * @return {Object} Returns page stats, if enabled.
     */
    get stats() {
      return (this._stats instanceof StatTimer ? this._stats : null);
    },
  };
  return PDFPageProxy;
})();

class LoopbackPort {
  constructor(defer = true) {
    this._listeners = [];
    this._defer = defer;
    this._deferred = Promise.resolve(undefined);
  }

  postMessage(obj, transfers) {
    function cloneValue(value) {
      // Trying to perform a structured clone close to the spec, including
      // transfers.
      if (typeof value !== 'object' || value === null) {
        return value;
      }
      if (cloned.has(value)) { // already cloned the object
        return cloned.get(value);
      }
      var result;
      var buffer;
      if ((buffer = value.buffer) && isArrayBuffer(buffer)) {
        // We found object with ArrayBuffer (typed array).
        var transferable = transfers && transfers.includes(buffer);
        if (value === buffer) {
          // Special case when we are faking typed arrays in compatibility.js.
          result = value;
        } else if (transferable) {
          result = new value.constructor(buffer, value.byteOffset,
                                         value.byteLength);
        } else {
          result = new value.constructor(value);
        }
        cloned.set(value, result);
        return result;
      }
      result = Array.isArray(value) ? [] : {};
      cloned.set(value, result); // adding to cache now for cyclic references
      // Cloning all value and object properties, however ignoring properties
      // defined via getter.
      for (var i in value) {
        var desc, p = value;
        while (!(desc = Object.getOwnPropertyDescriptor(p, i))) {
          p = Object.getPrototypeOf(p);
        }
        if (typeof desc.value === 'undefined' ||
            typeof desc.value === 'function') {
          continue;
        }
        result[i] = cloneValue(desc.value);
      }
      return result;
    }

    if (!this._defer) {
      this._listeners.forEach(function (listener) {
        listener.call(this, { data: obj, });
      }, this);
      return;
    }

    var cloned = new WeakMap();
    var e = { data: cloneValue(obj), };
    this._deferred.then(() => {
      this._listeners.forEach(function (listener) {
        listener.call(this, e);
      }, this);
    });
  }

  addEventListener(name, listener) {
    this._listeners.push(listener);
  }

  removeEventListener(name, listener) {
    var i = this._listeners.indexOf(listener);
    this._listeners.splice(i, 1);
  }

  terminate() {
    this._listeners = [];
  }
}

/**
 * @typedef {Object} PDFWorkerParameters
 * @property {string} name - (optional) The name of the worker.
 * @property {Object} port - (optional) The `workerPort`.
 * @property {boolean} postMessageTransfers - (optional) Enables transfer usage
 *   in postMessage for ArrayBuffers. The default value is `true`.
 * @property {number} verbosity - (optional) Controls the logging level; the
 *   constants from {VerbosityLevel} should be used.
 */

/**
 * PDF.js web worker abstraction, it controls instantiation of PDF documents and
 * WorkerTransport for them. If creation of a web worker is not possible,
 * a "fake" worker will be used instead.
 * @class
 */
var PDFWorker = (function PDFWorkerClosure() {
  let nextFakeWorkerId = 0;

  function getWorkerSrc() {
    if (GlobalWorkerOptions.workerSrc) {
      return GlobalWorkerOptions.workerSrc;
    }
    if (typeof fallbackWorkerSrc !== 'undefined') {
      return fallbackWorkerSrc;
    }
    throw new Error('No "GlobalWorkerOptions.workerSrc" specified.');
  }

  function getMainThreadWorkerMessageHandler() {
    try {
      if (typeof window !== 'undefined') {
        return (window.pdfjsWorker && window.pdfjsWorker.WorkerMessageHandler);
      }
    } catch (ex) { }
    return null;
  }

  let fakeWorkerFilesLoadedCapability;

  // Loads worker code into main thread.
  function setupFakeWorkerGlobal() {
    if (fakeWorkerFilesLoadedCapability) {
      return fakeWorkerFilesLoadedCapability.promise;
    }
    fakeWorkerFilesLoadedCapability = createPromiseCapability();

    let mainWorkerMessageHandler = getMainThreadWorkerMessageHandler();
    if (mainWorkerMessageHandler) {
      // The worker was already loaded using a `<script>` tag.
      fakeWorkerFilesLoadedCapability.resolve(mainWorkerMessageHandler);
      return fakeWorkerFilesLoadedCapability.promise;
    }
    // In the developer build load worker_loader.js which in turn loads all the
    // other files and resolves the promise. In production only the
    // pdf.worker.js file is needed.
    if (typeof PDFJSDev === 'undefined' || !PDFJSDev.test('PRODUCTION')) {
      if (typeof SystemJS === 'object') {
        SystemJS.import('pdfjs/core/worker').then((worker) => {
          fakeWorkerFilesLoadedCapability.resolve(worker.WorkerMessageHandler);
        }).catch(fakeWorkerFilesLoadedCapability.reject);
      } else if (typeof require === 'function') {
        try {
          let worker = require('../core/worker.js');
          fakeWorkerFilesLoadedCapability.resolve(worker.WorkerMessageHandler);
        } catch (ex) {
          fakeWorkerFilesLoadedCapability.reject(ex);
        }
      } else {
        fakeWorkerFilesLoadedCapability.reject(new Error(
          'SystemJS or CommonJS must be used to load fake worker.'));
      }
    } else {
      const loader = fakeWorkerFilesLoader || function() {
        return loadScript(getWorkerSrc()).then(function() {
          return window.pdfjsWorker.WorkerMessageHandler;
        });
      };
      loader().then(fakeWorkerFilesLoadedCapability.resolve,
                    fakeWorkerFilesLoadedCapability.reject);
    }
    return fakeWorkerFilesLoadedCapability.promise;
  }

  function createCDNWrapper(url) {
    // We will rely on blob URL's property to specify origin.
    // We want this function to fail in case if createObjectURL or Blob do not
    // exist or fail for some reason -- our Worker creation will fail anyway.
    var wrapper = 'importScripts(\'' + url + '\');';
    return URL.createObjectURL(new Blob([wrapper]));
  }

  let pdfWorkerPorts = new WeakMap();

  /**
   * @param {PDFWorkerParameters} params - The worker initialization parameters.
   */
  function PDFWorker({ name = null, port = null,
                       postMessageTransfers = true,
                       verbosity = getVerbosityLevel(), } = {}) {
    if (port && pdfWorkerPorts.has(port)) {
      throw new Error('Cannot use more than one PDFWorker per port');
    }

    this.name = name;
    this.destroyed = false;
    this.postMessageTransfers = postMessageTransfers !== false;
    this.verbosity = verbosity;

    this._readyCapability = createPromiseCapability();
    this._port = null;
    this._webWorker = null;
    this._messageHandler = null;

    if (port) {
      pdfWorkerPorts.set(port, this);
      this._initializeFromPort(port);
      return;
    }

    this._initialize();
  }

  PDFWorker.prototype = /** @lends PDFWorker.prototype */ {
    get promise() {
      return this._readyCapability.promise;
    },

    get port() {
      return this._port;
    },

    get messageHandler() {
      return this._messageHandler;
    },

    _initializeFromPort: function PDFWorker_initializeFromPort(port) {
      this._port = port;
      this._messageHandler = new MessageHandler('main', 'worker', port);
      this._messageHandler.on('ready', function () {
        // Ignoring 'ready' event -- MessageHandler shall be already initialized
        // and ready to accept the messages.
      });
      this._readyCapability.resolve();
    },

    _initialize: function PDFWorker_initialize() {
      // If worker support isn't disabled explicit and the browser has worker
      // support, create a new web worker and test if it/the browser fulfills
      // all requirements to run parts of pdf.js in a web worker.
      // Right now, the requirement is, that an Uint8Array is still an
      // Uint8Array as it arrives on the worker. (Chrome added this with v.15.)
      if (typeof Worker !== 'undefined' && !isWorkerDisabled &&
          !getMainThreadWorkerMessageHandler()) {
        let workerSrc = getWorkerSrc();

        try {
          // Wraps workerSrc path into blob URL, if the former does not belong
          // to the same origin.
          if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('GENERIC') &&
              !isSameOrigin(window.location.href, workerSrc)) {
            workerSrc = createCDNWrapper(
              new URL(workerSrc, window.location).href);
          }

          // Some versions of FF can't create a worker on localhost, see:
          // https://bugzilla.mozilla.org/show_bug.cgi?id=683280
          var worker = new Worker(workerSrc);
          var messageHandler = new MessageHandler('main', 'worker', worker);
          var terminateEarly = () => {
            worker.removeEventListener('error', onWorkerError);
            messageHandler.destroy();
            worker.terminate();
            if (this.destroyed) {
              this._readyCapability.reject(new Error('Worker was destroyed'));
            } else {
              // Fall back to fake worker if the termination is caused by an
              // error (e.g. NetworkError / SecurityError).
              this._setupFakeWorker();
            }
          };

          var onWorkerError = () => {
            if (!this._webWorker) {
              // Worker failed to initialize due to an error. Clean up and fall
              // back to the fake worker.
              terminateEarly();
            }
          };
          worker.addEventListener('error', onWorkerError);

          messageHandler.on('test', (data) => {
            worker.removeEventListener('error', onWorkerError);
            if (this.destroyed) {
              terminateEarly();
              return; // worker was destroyed
            }
            if (data && data.supportTypedArray) {
              this._messageHandler = messageHandler;
              this._port = worker;
              this._webWorker = worker;
              if (!data.supportTransfers) {
                this.postMessageTransfers = false;
              }
              this._readyCapability.resolve();
              // Send global setting, e.g. verbosity level.
              messageHandler.send('configure', {
                verbosity: this.verbosity,
              });
            } else {
              this._setupFakeWorker();
              messageHandler.destroy();
              worker.terminate();
            }
          });

          messageHandler.on('ready', (data) => {
            worker.removeEventListener('error', onWorkerError);
            if (this.destroyed) {
              terminateEarly();
              return; // worker was destroyed
            }
            try {
              sendTest();
            } catch (e) {
              // We need fallback to a faked worker.
              this._setupFakeWorker();
            }
          });

          const sendTest = () => {
            let testObj = new Uint8Array([this.postMessageTransfers ? 255 : 0]);
            // Some versions of Opera throw a DATA_CLONE_ERR on serializing the
            // typed array. Also, checking if we can use transfers.
            try {
              messageHandler.send('test', testObj, [testObj.buffer]);
            } catch (ex) {
              info('Cannot use postMessage transfers');
              testObj[0] = 0;
              messageHandler.send('test', testObj);
            }
          };

          // It might take time for worker to initialize (especially when AMD
          // loader is used). We will try to send test immediately, and then
          // when 'ready' message will arrive. The worker shall process only
          // first received 'test'.
          sendTest();
          return;
        } catch (e) {
          info('The worker has been disabled.');
        }
      }
      // Either workers are disabled, not supported or have thrown an exception.
      // Thus, we fallback to a faked worker.
      this._setupFakeWorker();
    },

    _setupFakeWorker: function PDFWorker_setupFakeWorker() {
      if (!isWorkerDisabled) {
        warn('Setting up fake worker.');
        isWorkerDisabled = true;
      }

      setupFakeWorkerGlobal().then((WorkerMessageHandler) => {
        if (this.destroyed) {
          this._readyCapability.reject(new Error('Worker was destroyed'));
          return;
        }
        let port = new LoopbackPort();
        this._port = port;

        // All fake workers use the same port, making id unique.
        var id = 'fake' + (nextFakeWorkerId++);

        // If the main thread is our worker, setup the handling for the
        // messages -- the main thread sends to it self.
        var workerHandler = new MessageHandler(id + '_worker', id, port);
        WorkerMessageHandler.setup(workerHandler, port);

        var messageHandler = new MessageHandler(id, id + '_worker', port);
        this._messageHandler = messageHandler;
        this._readyCapability.resolve();
      }).catch((reason) => {
        this._readyCapability.reject(
          new Error(`Setting up fake worker failed: "${reason.message}".`));
      });
    },

    /**
     * Destroys the worker instance.
     */
    destroy: function PDFWorker_destroy() {
      this.destroyed = true;
      if (this._webWorker) {
        // We need to terminate only web worker created resource.
        this._webWorker.terminate();
        this._webWorker = null;
      }
      pdfWorkerPorts.delete(this._port);
      this._port = null;
      if (this._messageHandler) {
        this._messageHandler.destroy();
        this._messageHandler = null;
      }
    },
  };

  /**
   * @param {PDFWorkerParameters} params - The worker initialization parameters.
   */
  PDFWorker.fromPort = function(params) {
    if (!params || !params.port) {
      throw new Error('PDFWorker.fromPort - invalid method signature.');
    }
    if (pdfWorkerPorts.has(params.port)) {
      return pdfWorkerPorts.get(params.port);
    }
    return new PDFWorker(params);
  };

  PDFWorker.getWorkerSrc = function() {
    return getWorkerSrc();
  };

  return PDFWorker;
})();

/**
 * For internal use only.
 * @ignore
 */
class WorkerTransport {
  constructor(messageHandler, loadingTask, networkStream, params) {
    this.messageHandler = messageHandler;
    this.loadingTask = loadingTask;
    this.commonObjs = new PDFObjects();
    this.fontLoader = new FontLoader(loadingTask.docId);
    this._params = params;
    this.CMapReaderFactory = new params.CMapReaderFactory({
      baseUrl: params.cMapUrl,
      isCompressed: params.cMapPacked,
    });

    this.destroyed = false;
    this.destroyCapability = null;
    this._passwordCapability = null;

    this._networkStream = networkStream;
    this._fullReader = null;
    this._lastProgress = null;

    this.pageCache = [];
    this.pagePromises = [];
    this.downloadInfoCapability = createPromiseCapability();

    this.setupMessageHandler();
  }

  destroy() {
    if (this.destroyCapability) {
      return this.destroyCapability.promise;
    }

    this.destroyed = true;
    this.destroyCapability = createPromiseCapability();

    if (this._passwordCapability) {
      this._passwordCapability.reject(
        new Error('Worker was destroyed during onPassword callback'));
    }

    const waitOn = [];
    // We need to wait for all renderings to be completed, e.g.
    // timeout/rAF can take a long time.
    this.pageCache.forEach(function(page) {
      if (page) {
        waitOn.push(page._destroy());
      }
    });
    this.pageCache = [];
    this.pagePromises = [];
    // We also need to wait for the worker to finish its long running tasks.
    const terminated = this.messageHandler.sendWithPromise('Terminate', null);
    waitOn.push(terminated);
    Promise.all(waitOn).then(() => {
      this.fontLoader.clear();
      if (this._networkStream) {
        this._networkStream.cancelAllRequests();
      }

      if (this.messageHandler) {
        this.messageHandler.destroy();
        this.messageHandler = null;
      }
      this.destroyCapability.resolve();
    }, this.destroyCapability.reject);
    return this.destroyCapability.promise;
  }

  setupMessageHandler() {
    const { messageHandler, loadingTask, } = this;

    messageHandler.on('GetReader', function(data, sink) {
      assert(this._networkStream);
      this._fullReader = this._networkStream.getFullReader();
      this._fullReader.onProgress = (evt) => {
        this._lastProgress = {
          loaded: evt.loaded,
          total: evt.total,
        };
      };
      sink.onPull = () => {
        this._fullReader.read().then(function({ value, done, }) {
          if (done) {
            sink.close();
            return;
          }
          assert(isArrayBuffer(value));
          // Enqueue data chunk into sink, and transfer it
          // to other side as `Transferable` object.
          sink.enqueue(new Uint8Array(value), 1, [value]);
        }).catch((reason) => {
          sink.error(reason);
        });
      };

      sink.onCancel = (reason) => {
        this._fullReader.cancel(reason);
      };
    }, this);

    messageHandler.on('ReaderHeadersReady', function(data) {
      const headersCapability = createPromiseCapability();
      const fullReader = this._fullReader;
      fullReader.headersReady.then(() => {
        // If stream or range are disabled, it's our only way to report
        // loading progress.
        if (!fullReader.isStreamingSupported || !fullReader.isRangeSupported) {
          if (this._lastProgress && loadingTask.onProgress) {
            loadingTask.onProgress(this._lastProgress);
          }
          fullReader.onProgress = (evt) => {
            if (loadingTask.onProgress) {
              loadingTask.onProgress({
                loaded: evt.loaded,
                total: evt.total,
              });
            }
          };
        }

        headersCapability.resolve({
          isStreamingSupported: fullReader.isStreamingSupported,
          isRangeSupported: fullReader.isRangeSupported,
          contentLength: fullReader.contentLength,
        });
      }, headersCapability.reject);

      return headersCapability.promise;
    }, this);

    messageHandler.on('GetRangeReader', function(data, sink) {
      assert(this._networkStream);
      const rangeReader =
        this._networkStream.getRangeReader(data.begin, data.end);

      sink.onPull = () => {
        rangeReader.read().then(function({ value, done, }) {
          if (done) {
            sink.close();
            return;
          }
          assert(isArrayBuffer(value));
          sink.enqueue(new Uint8Array(value), 1, [value]);
        }).catch((reason) => {
          sink.error(reason);
        });
      };

      sink.onCancel = (reason) => {
        rangeReader.cancel(reason);
      };
    }, this);

    messageHandler.on('GetDoc', function({ pdfInfo, }) {
      this.numPages = pdfInfo.numPages;
      this.pdfDocument = new PDFDocumentProxy(pdfInfo, this, loadingTask);
      loadingTask._capability.resolve(this.pdfDocument);
    }, this);

    messageHandler.on('PasswordRequest', function(exception) {
      this._passwordCapability = createPromiseCapability();

      if (loadingTask.onPassword) {
        const updatePassword = (password) => {
          this._passwordCapability.resolve({
            password,
          });
        };
        try {
          loadingTask.onPassword(updatePassword, exception.code);
        } catch (ex) {
          this._passwordCapability.reject(ex);
        }
      } else {
        this._passwordCapability.reject(
          new PasswordException(exception.message, exception.code));
      }
      return this._passwordCapability.promise;
    }, this);

    messageHandler.on('PasswordException', function(exception) {
      loadingTask._capability.reject(
        new PasswordException(exception.message, exception.code));
    }, this);

    messageHandler.on('InvalidPDF', function(exception) {
      loadingTask._capability.reject(
        new InvalidPDFException(exception.message));
    }, this);

    messageHandler.on('MissingPDF', function(exception) {
      loadingTask._capability.reject(
        new MissingPDFException(exception.message));
    }, this);

    messageHandler.on('UnexpectedResponse', function(exception) {
      loadingTask._capability.reject(
        new UnexpectedResponseException(exception.message, exception.status));
    }, this);

    messageHandler.on('UnknownError', function(exception) {
      loadingTask._capability.reject(
        new UnknownErrorException(exception.message, exception.details));
    }, this);

    messageHandler.on('DataLoaded', function(data) {
      // For consistency: Ensure that progress is always reported when the
      // entire PDF file has been loaded, regardless of how it was fetched.
      if (loadingTask.onProgress) {
        loadingTask.onProgress({
          loaded: data.length,
          total: data.length,
        });
      }
      this.downloadInfoCapability.resolve(data);
    }, this);

    messageHandler.on('StartRenderPage', function(data) {
      if (this.destroyed) {
        return; // Ignore any pending requests if the worker was terminated.
      }

      const page = this.pageCache[data.pageIndex];
      page._stats.timeEnd('Page Request');
      page._startRenderPage(data.transparency, data.intent);
    }, this);

    messageHandler.on('RenderPageChunk', function(data) {
      if (this.destroyed) {
        return; // Ignore any pending requests if the worker was terminated.
      }

      const page = this.pageCache[data.pageIndex];
      page._renderPageChunk(data.operatorList, data.intent);
    }, this);

    messageHandler.on('commonobj', function(data) {
      if (this.destroyed) {
        return; // Ignore any pending requests if the worker was terminated.
      }

      const [id, type, exportedData] = data;
      if (this.commonObjs.hasData(id)) {
        return;
      }

      switch (type) {
        case 'Font':
          const params = this._params;

          if ('error' in exportedData) {
            const exportedError = exportedData.error;
            warn(`Error during font loading: ${exportedError}`);
            this.commonObjs.resolve(id, exportedError);
            break;
          }

          let fontRegistry = null;
          if (params.pdfBug && globalScope.FontInspector &&
              globalScope.FontInspector.enabled) {
            fontRegistry = {
              registerFont(font, url) {
                globalScope['FontInspector'].fontAdded(font, url);
              },
            };
          }
          const font = new FontFaceObject(exportedData, {
            isEvalSupported: params.isEvalSupported,
            disableFontFace: params.disableFontFace,
            ignoreErrors: params.ignoreErrors,
            onUnsupportedFeature: this._onUnsupportedFeature.bind(this),
            fontRegistry,
          });
          const fontReady = (fontObjs) => {
            this.commonObjs.resolve(id, font);
          };

          this.fontLoader.bind([font], fontReady);
          break;
        case 'FontPath':
          this.commonObjs.resolve(id, exportedData);
          break;
        default:
          throw new Error(`Got unknown common object type ${type}`);
      }
    }, this);

    messageHandler.on('obj', function(data) {
      if (this.destroyed) {
        return; // Ignore any pending requests if the worker was terminated.
      }

      const [id, pageIndex, type, imageData] = data;
      const pageProxy = this.pageCache[pageIndex];
      if (pageProxy.objs.hasData(id)) {
        return;
      }

      switch (type) {
        case 'JpegStream':
          return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = function() {
              resolve(img);
            };
            img.onerror = function() {
              reject(new Error('Error during JPEG image loading'));
              // Note that when the browser image loading/decoding fails,
              // we'll fallback to the built-in PDF.js JPEG decoder; see
              // `PartialEvaluator.buildPaintImageXObject` in the
              // `src/core/evaluator.js` file.
            };
            img.src = imageData;
          }).then((img) => {
            pageProxy.objs.resolve(id, img);
          });
        case 'Image':
          pageProxy.objs.resolve(id, imageData);

          // Heuristic that will allow us not to store large data.
          const MAX_IMAGE_SIZE_TO_STORE = 8000000;
          if (imageData && 'data' in imageData &&
              imageData.data.length > MAX_IMAGE_SIZE_TO_STORE) {
            pageProxy.cleanupAfterRender = true;
          }
          break;
        default:
          throw new Error(`Got unknown object type ${type}`);
      }
    }, this);

    messageHandler.on('DocProgress', function(data) {
      if (this.destroyed) {
        return; // Ignore any pending requests if the worker was terminated.
      }

      if (loadingTask.onProgress) {
        loadingTask.onProgress({
          loaded: data.loaded,
          total: data.total,
        });
      }
    }, this);

    messageHandler.on('PageError', function(data) {
      if (this.destroyed) {
        return; // Ignore any pending requests if the worker was terminated.
      }

      const page = this.pageCache[data.pageNum - 1];
      const intentState = page.intentStates[data.intent];

      if (intentState.displayReadyCapability) {
        intentState.displayReadyCapability.reject(data.error);
      } else {
        throw new Error(data.error);
      }

      if (intentState.operatorList) {
        // Mark operator list as complete.
        intentState.operatorList.lastChunk = true;
        for (let i = 0; i < intentState.renderTasks.length; i++) {
          intentState.renderTasks[i].operatorListChanged();
        }
      }
    }, this);

    messageHandler.on('UnsupportedFeature', this._onUnsupportedFeature, this);

    messageHandler.on('JpegDecode', function(data) {
      if (this.destroyed) {
        return Promise.reject(new Error('Worker was destroyed'));
      }

      if (typeof document === 'undefined') {
        // Make sure that this code is not executing in node.js, as
        // it's using DOM image, and there is no library to support that.
        return Promise.reject(new Error('"document" is not defined.'));
      }

      const [imageUrl, components] = data;
      if (components !== 3 && components !== 1) {
        return Promise.reject(
          new Error('Only 3 components or 1 component can be returned'));
      }

      return new Promise(function (resolve, reject) {
        const img = new Image();
        img.onload = function () {
          const width = img.width;
          const height = img.height;
          const size = width * height;
          const rgbaLength = size * 4;
          const buf = new Uint8ClampedArray(size * components);
          const tmpCanvas = document.createElement('canvas');
          tmpCanvas.width = width;
          tmpCanvas.height = height;
          const tmpCtx = tmpCanvas.getContext('2d');
          tmpCtx.drawImage(img, 0, 0);
          const data = tmpCtx.getImageData(0, 0, width, height).data;

          if (components === 3) {
            for (let i = 0, j = 0; i < rgbaLength; i += 4, j += 3) {
              buf[j] = data[i];
              buf[j + 1] = data[i + 1];
              buf[j + 2] = data[i + 2];
            }
          } else if (components === 1) {
            for (let i = 0, j = 0; i < rgbaLength; i += 4, j++) {
              buf[j] = data[i];
            }
          }
          resolve({ data: buf, width, height, });
        };
        img.onerror = function () {
          reject(new Error('JpegDecode failed to load image'));
        };
        img.src = imageUrl;
      });
    }, this);

    messageHandler.on('FetchBuiltInCMap', function(data) {
      if (this.destroyed) {
        return Promise.reject(new Error('Worker was destroyed'));
      }
      return this.CMapReaderFactory.fetch({
        name: data.name,
      });
    }, this);
  }

  _onUnsupportedFeature({ featureId, }) {
    if (this.destroyed) {
      return; // Ignore any pending requests if the worker was terminated.
    }
    if (this.loadingTask.onUnsupportedFeature) {
      this.loadingTask.onUnsupportedFeature(featureId);
    }
  }

  getData() {
    return this.messageHandler.sendWithPromise('GetData', null);
  }

  getPage(pageNumber) {
    if (!Number.isInteger(pageNumber) ||
        pageNumber <= 0 || pageNumber > this.numPages) {
      return Promise.reject(new Error('Invalid page request'));
    }

    const pageIndex = pageNumber - 1;
    if (pageIndex in this.pagePromises) {
      return this.pagePromises[pageIndex];
    }
    const promise = this.messageHandler.sendWithPromise('GetPage', {
      pageIndex,
    }).then((pageInfo) => {
      if (this.destroyed) {
        throw new Error('Transport destroyed');
      }
      const page = new PDFPageProxy(pageIndex, pageInfo, this,
                                    this._params.pdfBug);
      this.pageCache[pageIndex] = page;
      return page;
    });
    this.pagePromises[pageIndex] = promise;
    return promise;
  }

  getPageIndex(ref) {
    return this.messageHandler.sendWithPromise('GetPageIndex', {
      ref,
    }).catch(function(reason) {
      return Promise.reject(new Error(reason));
    });
  }

  getAnnotations(pageIndex, intent) {
    return this.messageHandler.sendWithPromise('GetAnnotations', {
      pageIndex,
      intent,
    });
  }

  getDestinations() {
    return this.messageHandler.sendWithPromise('GetDestinations', null);
  }

  getDestination(id) {
    if (typeof id !== 'string') {
      return Promise.reject(new Error('Invalid destination request.'));
    }
    return this.messageHandler.sendWithPromise('GetDestination', {
      id,
    });
  }

  getPageLabels() {
    return this.messageHandler.sendWithPromise('GetPageLabels', null);
  }

  getPageMode() {
    return this.messageHandler.sendWithPromise('GetPageMode', null);
  }

  getAttachments() {
    return this.messageHandler.sendWithPromise('GetAttachments', null);
  }

  getJavaScript() {
    return this.messageHandler.sendWithPromise('GetJavaScript', null);
  }

  getOutline() {
    return this.messageHandler.sendWithPromise('GetOutline', null);
  }

  getPermissions() {
    return this.messageHandler.sendWithPromise('GetPermissions', null);
  }

  getMetadata() {
    return this.messageHandler.sendWithPromise('GetMetadata', null).
        then((results) => {
      return {
        info: results[0],
        metadata: (results[1] ? new Metadata(results[1]) : null),
        contentDispositionFilename: (this._fullReader ?
                                     this._fullReader.filename : null),
      };
    });
  }

  getStats() {
    return this.messageHandler.sendWithPromise('GetStats', null);
  }

  startCleanup() {
    this.messageHandler.sendWithPromise('Cleanup', null).then(() => {
      for (let i = 0, ii = this.pageCache.length; i < ii; i++) {
        const page = this.pageCache[i];
        if (page) {
          page.cleanup();
        }
      }
      this.commonObjs.clear();
      this.fontLoader.clear();
    });
  }

  get loadingParams() {
    const params = this._params;
    return shadow(this, 'loadingParams', {
      disableAutoFetch: params.disableAutoFetch,
      disableCreateObjectURL: params.disableCreateObjectURL,
      disableFontFace: params.disableFontFace,
      nativeImageDecoderSupport: params.nativeImageDecoderSupport,
    });
  }
}

/**
 * A PDF document and page is built of many objects. E.g. there are objects
 * for fonts, images, rendering code and such. These objects might get processed
 * inside of a worker. The `PDFObjects` implements some basic functions to
 * manage these objects.
 * @ignore
 */
var PDFObjects = (function PDFObjectsClosure() {
  function PDFObjects() {
    this.objs = Object.create(null);
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
        resolved: false,
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
        throw new Error(`Requesting object that isn't resolved yet ${objId}`);
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
      }
      return objs[objId].resolved;
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
      }
      return objs[objId].data;
    },

    clear: function PDFObjects_clear() {
      this.objs = Object.create(null);
    },
  };
  return PDFObjects;
})();

/**
 * Allows controlling of the rendering tasks.
 * @class
 * @alias RenderTask
 */
var RenderTask = (function RenderTaskClosure() {
  function RenderTask(internalRenderTask) {
    this._internalRenderTask = internalRenderTask;

    /**
     * Callback for incremental rendering -- a function that will be called
     * each time the rendering is paused.  To continue rendering call the
     * function that is the first argument to the callback.
     * @type {function}
     */
    this.onContinue = null;
  }

  RenderTask.prototype = /** @lends RenderTask.prototype */ {
    /**
     * Promise for rendering task completion.
     * @return {Promise}
     */
    get promise() {
      return this._internalRenderTask.capability.promise;
    },

    /**
     * Cancels the rendering task. If the task is currently rendering it will
     * not be cancelled until graphics pauses with a timeout. The promise that
     * this object extends will be rejected when cancelled.
     */
    cancel: function RenderTask_cancel() {
      this._internalRenderTask.cancel();
    },

    /**
     * Registers callbacks to indicate the rendering task completion.
     *
     * @param {function} onFulfilled The callback for the rendering completion.
     * @param {function} onRejected The callback for the rendering failure.
     * @return {Promise} A promise that is resolved after the onFulfilled or
     *                   onRejected callback.
     */
    then: function RenderTask_then(onFulfilled, onRejected) {
      return this.promise.then.apply(this.promise, arguments);
    },
  };

  return RenderTask;
})();

/**
 * For internal use only.
 * @ignore
 */
var InternalRenderTask = (function InternalRenderTaskClosure() {
  let canvasInRendering = new WeakMap();

  function InternalRenderTask(callback, params, objs, commonObjs, operatorList,
                              pageNumber, canvasFactory, webGLContext,
                              pdfBug = false) {
    this.callback = callback;
    this.params = params;
    this.objs = objs;
    this.commonObjs = commonObjs;
    this.operatorListIdx = null;
    this.operatorList = operatorList;
    this.pageNumber = pageNumber;
    this.canvasFactory = canvasFactory;
    this.webGLContext = webGLContext;
    this._pdfBug = pdfBug;

    this.running = false;
    this.graphicsReadyCallback = null;
    this.graphicsReady = false;
    this.useRequestAnimationFrame = false;
    this.cancelled = false;
    this.capability = createPromiseCapability();
    this.task = new RenderTask(this);
    // caching this-bound methods
    this._continueBound = this._continue.bind(this);
    this._scheduleNextBound = this._scheduleNext.bind(this);
    this._nextBound = this._next.bind(this);
    this._canvas = params.canvasContext.canvas;
  }

  InternalRenderTask.prototype = {

    initializeGraphics(transparency) {
      if (this.cancelled) {
        return;
      }
      if (this._canvas) {
        if (canvasInRendering.has(this._canvas)) {
          throw new Error(
            'Cannot use the same canvas during multiple render() operations. ' +
            'Use different canvas or ensure previous operations were ' +
            'cancelled or completed.');
        }
        canvasInRendering.set(this._canvas, this);
      }

      if (this._pdfBug && globalScope.StepperManager &&
          globalScope.StepperManager.enabled) {
        this.stepper = globalScope.StepperManager.create(this.pageNumber - 1);
        this.stepper.init(this.operatorList);
        this.stepper.nextBreakPoint = this.stepper.getNextBreakPoint();
      }

      var params = this.params;
      this.gfx = new CanvasGraphics(params.canvasContext, this.commonObjs,
                                    this.objs, this.canvasFactory,
                                    this.webGLContext, params.imageLayer);

      this.gfx.beginDrawing({
        transform: params.transform,
        viewport: params.viewport,
        transparency,
        background: params.background,
      });
      this.operatorListIdx = 0;
      this.graphicsReady = true;
      if (this.graphicsReadyCallback) {
        this.graphicsReadyCallback();
      }
    },

    cancel: function InternalRenderTask_cancel() {
      this.running = false;
      this.cancelled = true;
      if (this._canvas) {
        canvasInRendering.delete(this._canvas);
      }
      this.callback(new RenderingCancelledException(
        'Rendering cancelled, page ' + this.pageNumber, 'canvas'));
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
      if (this.task.onContinue) {
        this.task.onContinue(this._scheduleNextBound);
      } else {
        this._scheduleNext();
      }
    },

    _scheduleNext: function InternalRenderTask__scheduleNext() {
      if (this.useRequestAnimationFrame && typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          this._nextBound().catch(this.callback);
        });
      } else {
        Promise.resolve().then(this._nextBound).catch(this.callback);
      }
    },

    _next: function InternalRenderTask__next() {
      return new Promise(() => {
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
            if (this._canvas) {
              canvasInRendering.delete(this._canvas);
            }
            this.callback();
          }
        }
      });
    },

  };

  return InternalRenderTask;
})();

var version, build;
if (typeof PDFJSDev !== 'undefined') {
  version = PDFJSDev.eval('BUNDLE_VERSION');
  build = PDFJSDev.eval('BUNDLE_BUILD');
}

export {
  getDocument,
  LoopbackPort,
  PDFDataRangeTransport,
  PDFWorker,
  PDFDocumentProxy,
  PDFPageProxy,
  setPDFNetworkStreamFactory,
  version,
  build,
};
