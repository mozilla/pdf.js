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
/* eslint no-var: error */

/**
 * @module pdfjsLib
 */

import {
  AbortException, assert, createPromiseCapability, getVerbosityLevel, info,
  InvalidPDFException, isArrayBuffer, isSameOrigin, MissingPDFException,
  NativeImageDecoding, PasswordException, setVerbosityLevel, shadow,
  stringToBytes, UnexpectedResponseException, UnknownErrorException,
  unreachable, warn
} from '../shared/util';
import {
  DOMCanvasFactory, DOMCMapReaderFactory, loadScript, PageViewport,
  releaseImageResources, RenderingCancelledException, StatTimer
} from './display_utils';
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
const RENDERING_CANCELLED_TIMEOUT = 100; // ms

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

  if (!fallbackWorkerSrc && typeof document === 'object' &&
      'currentScript' in document) {
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
 * @returns {IPDFStream}
 */

/** @type IPDFStreamFactory */
let createPDFNetworkStream;

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
 * @property {string}     [url] - The URL of the PDF.
 * @property {TypedArray|Array|string} [data] - Binary PDF data. Use typed
 *    arrays (Uint8Array) to improve the memory usage. If PDF data is
 *    BASE64-encoded, use atob() to convert it to a binary string first.
 * @property {Object}     [httpHeaders] - Basic authentication headers.
 * @property {boolean}    [withCredentials] - Indicates whether or not
 *   cross-site Access-Control requests should be made using credentials such
 *   as cookies or authorization headers. The default is false.
 * @property {string}     [password] - For decrypting password-protected PDFs.
 * @property {TypedArray} [initialData] - A typed array with the first portion
 *   or all of the pdf data. Used by the extension since some data is already
 *   loaded before the switch to range requests.
 * @property {number}     [length] - The PDF file length. It's used for
 *   progress reports and range requests operations.
 * @property {PDFDataRangeTransport} [range]
 * @property {number}     [rangeChunkSize] - Specify maximum number of bytes
 *   fetched per range request. The default value is 2^16 = 65536.
 * @property {PDFWorker}  [worker] - The worker that will be used for
 *   the loading and parsing of the PDF data.
 * @property {number} [verbosity] - Controls the logging level; the
 *   constants from {VerbosityLevel} should be used.
 * @property {string} [docBaseUrl] - The base URL of the document,
 *   used when attempting to recover valid absolute URLs for annotations, and
 *   outline items, that (incorrectly) only specify relative URLs.
 * @property {string} [nativeImageDecoderSupport] - Strategy for
 *   decoding certain (simple) JPEG images in the browser. This is useful for
 *   environments without DOM image and canvas support, such as e.g. Node.js.
 *   Valid values are 'decode', 'display' or 'none'; where 'decode' is intended
 *   for browsers with full image/canvas support, 'display' for environments
 *   with limited image support through stubs (useful for SVG conversion),
 *   and 'none' where JPEG images will be decoded entirely by PDF.js.
 *   The default value is 'decode'.
 * @property {string} [cMapUrl] - The URL where the predefined
 *   Adobe CMaps are located. Include trailing slash.
 * @property {boolean} [cMapPacked] - Specifies if the Adobe CMaps are
 *   binary packed.
 * @property {Object} [CMapReaderFactory] - The factory that will be
 *   used when reading built-in CMap files. Providing a custom factory is useful
 *   for environments without `XMLHttpRequest` support, such as e.g. Node.js.
 *   The default value is {DOMCMapReaderFactory}.
 * @property {boolean} [stopAtErrors] - Reject certain promises, e.g.
 *   `getOperatorList`, `getTextContent`, and `RenderTask`, when the associated
 *   PDF data cannot be successfully parsed, instead of attempting to recover
 *   whatever possible of the data. The default value is `false`.
 * @property {number} [maxImageSize] - The maximum allowed image size
 *   in total pixels, i.e. width * height. Images above this value will not be
 *   rendered. Use -1 for no limit, which is also the default value.
 * @property {boolean} [isEvalSupported] - Determines if we can eval
 *   strings as JS. Primarily used to improve performance of font rendering,
 *   and when parsing PDF functions. The default value is `true`.
 * @property {boolean} [disableFontFace] - By default fonts are
 *   converted to OpenType fonts and loaded via font face rules. If disabled,
 *   fonts will be rendered using a built-in font renderer that constructs the
 *   glyphs with primitive path commands. The default value is `false`.
 * @property {boolean} [disableRange] - Disable range request loading
 *   of PDF files. When enabled, and if the server supports partial content
 *   requests, then the PDF will be fetched in chunks.
 *   The default value is `false`.
 * @property {boolean} [disableStream] - Disable streaming of PDF file
 *   data. By default PDF.js attempts to load PDFs in chunks.
 *   The default value is `false`.
 * @property {boolean} [disableAutoFetch] - Disable pre-fetching of PDF
 *   file data. When range requests are enabled PDF.js will automatically keep
 *   fetching more data even if it isn't needed to display the current page.
 *   The default value is `false`.
 *   NOTE: It is also necessary to disable streaming, see above,
 *         in order for disabling of pre-fetching to work correctly.
 * @property {boolean} [disableCreateObjectURL] - Disable the use of
 *   `URL.createObjectURL`, for compatibility with older browsers.
 *   The default value is `false`.
 * @property {boolean} [pdfBug] - Enables special hooks for debugging
 *   PDF.js (see `web/debugger.js`). The default value is `false`.
 */

/**
 * @typedef {Object} PDFDocumentStats
 * @property {Object} streamTypes - Used stream types in the document (an item
 *   is set to true if specific stream ID was used in the document).
 * @property {Object} fontTypes - Used font types in the document (an item
 *   is set to true if specific font ID was used in the document).
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
 * @returns {PDFDocumentLoadingTask}
 */
function getDocument(src) {
  const task = new PDFDocumentLoadingTask();

  let source;
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
  const params = Object.create(null);
  let rangeTransport = null, worker = null;

  for (const key in source) {
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
      const pdfBytes = source[key];
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
      verbosity: params.verbosity,
      port: GlobalWorkerOptions.workerPort,
    };
    // Worker was not provided -- creating and owning our own. If message port
    // is specified in global worker options, using it.
    worker = workerParams.port ? PDFWorker.fromPort(workerParams) :
                                 new PDFWorker(workerParams);
    task._worker = worker;
  }
  const docId = task.docId;
  worker.promise.then(function() {
    if (task.destroyed) {
      throw new Error('Loading aborted');
    }
    return _fetchDocument(worker, params, rangeTransport, docId).then(
        function(workerId) {
      if (task.destroyed) {
        throw new Error('Loading aborted');
      }

      let networkStream;
      if (rangeTransport) {
        networkStream = new PDFDataTransportStream({
          length: params.length,
          initialData: params.initialData,
          progressiveDone: params.progressiveDone,
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

      const messageHandler = new MessageHandler(docId, workerId, worker.port);
      messageHandler.postMessageTransfers = worker.postMessageTransfers;
      const transport = new WorkerTransport(messageHandler, task, networkStream,
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
    source.progressiveDone = pdfDataRangeTransport.progressiveDone;
  }
  return worker.messageHandler.sendWithPromise('GetDocRequest', {
    docId,
    apiVersion: typeof PDFJSDev !== 'undefined' && !PDFJSDev.test('TESTING') ?
                PDFJSDev.eval('BUNDLE_VERSION') : null,
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
  }).then(function(workerId) {
    if (worker.destroyed) {
      throw new Error('Worker was destroyed');
    }
    return workerId;
  });
}

const PDFDocumentLoadingTask = (function PDFDocumentLoadingTaskClosure() {
  let nextDocumentId = 0;

  /**
   * The loading task controls the operations required to load a PDF document
   * (such as network requests) and provides a way to listen for completion,
   * after which individual pages can be rendered.
   */
  class PDFDocumentLoadingTask {
    constructor() {
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

    /**
     * Promise for document loading task completion.
     * @type {Promise}
     */
    get promise() {
      return this._capability.promise;
    }

    /**
     * Aborts all network requests and destroys worker.
     * @returns {Promise} A promise that is resolved after destruction activity
     *                    is completed.
     */
    destroy() {
      this.destroyed = true;

      const transportDestroyed = !this._transport ? Promise.resolve() :
        this._transport.destroy();
      return transportDestroyed.then(() => {
        this._transport = null;
        if (this._worker) {
          this._worker.destroy();
          this._worker = null;
        }
      });
    }

    /**
     * Registers callbacks to indicate the document loading completion.
     * @ignore
     */
    then(onFulfilled, onRejected) {
      throw new Error('Removed API method: ' +
        'PDFDocumentLoadingTask.then, use the `promise` getter instead.');
    }
  }
  return PDFDocumentLoadingTask;
})();

/**
 * Abstract class to support range requests file loading.
 * @param {number} length
 * @param {Uint8Array} initialData
 * @param {boolean} progressiveDone
 */
class PDFDataRangeTransport {
  constructor(length, initialData, progressiveDone = false) {
    this.length = length;
    this.initialData = initialData;
    this.progressiveDone = progressiveDone;

    this._rangeListeners = [];
    this._progressListeners = [];
    this._progressiveReadListeners = [];
    this._progressiveDoneListeners = [];
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

  addProgressiveDoneListener(listener) {
    this._progressiveDoneListeners.push(listener);
  }

  onDataRange(begin, chunk) {
    for (const listener of this._rangeListeners) {
      listener(begin, chunk);
    }
  }

  onDataProgress(loaded, total) {
    this._readyCapability.promise.then(() => {
      for (const listener of this._progressListeners) {
        listener(loaded, total);
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

  onDataProgressiveDone() {
    this._readyCapability.promise.then(() => {
      for (const listener of this._progressiveDoneListeners) {
        listener();
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
  constructor(pdfInfo, transport) {
    this._pdfInfo = pdfInfo;
    this._transport = transport;
  }

  /**
   * @type {number} Total number of pages the PDF contains.
   */
  get numPages() {
    return this._pdfInfo.numPages;
  }

  /**
   * @type {string} A (not guaranteed to be) unique ID to identify a PDF.
   */
  get fingerprint() {
    return this._pdfInfo.fingerprint;
  }

  /**
   * @param {number} pageNumber - The page number to get. The first page is 1.
   * @returns {Promise} A promise that is resolved with a {@link PDFPageProxy}
   *   object.
   */
  getPage(pageNumber) {
    return this._transport.getPage(pageNumber);
  }

  /**
   * @param {{num: number, gen: number}} ref - The page reference. Must have
   *   the `num` and `gen` properties.
   * @returns {Promise} A promise that is resolved with the page index that is
   *   associated with the reference.
   */
  getPageIndex(ref) {
    return this._transport.getPageIndex(ref);
  }

  /**
   * @returns {Promise} A promise that is resolved with a lookup table for
   *   mapping named destinations to reference numbers.
   *
   * This can be slow for large documents. Use `getDestination` instead.
   */
  getDestinations() {
    return this._transport.getDestinations();
  }

  /**
   * @param {string} id - The named destination to get.
   * @returns {Promise} A promise that is resolved with all information
   *   of the given named destination.
   */
  getDestination(id) {
    return this._transport.getDestination(id);
  }

  /**
   * @returns {Promise} A promise that is resolved with an {Array} containing
   *   the page labels that correspond to the page indexes, or `null` when
   *   no page labels are present in the PDF file.
   */
  getPageLabels() {
    return this._transport.getPageLabels();
  }

  /**
   * @returns {Promise} A promise that is resolved with a {string} containing
   *   the page layout name.
   */
  getPageLayout() {
    return this._transport.getPageLayout();
  }

  /**
   * @returns {Promise} A promise that is resolved with a {string} containing
   *   the page mode name.
   */
  getPageMode() {
    return this._transport.getPageMode();
  }

  /**
   * @returns {Promise} A promise that is resolved with an {Object} containing
   *   the viewer preferences.
   */
  getViewerPreferences() {
    return this._transport.getViewerPreferences();
  }

  /**
   * @returns {Promise} A promise that is resolved with an {Array} containing
   *   the destination, or `null` when no open action is present in the PDF.
   */
  getOpenActionDestination() {
    return this._transport.getOpenActionDestination();
  }

  /**
   * @returns {Promise} A promise that is resolved with a lookup table for
   *   mapping named attachments to their content.
   */
  getAttachments() {
    return this._transport.getAttachments();
  }

  /**
   * @returns {Promise} A promise that is resolved with an {Array} of all the
   *   JavaScript strings in the name tree, or `null` if no JavaScript exists.
   */
  getJavaScript() {
    return this._transport.getJavaScript();
  }

  /**
   * @returns {Promise} A promise that is resolved with an {Array} that is a
   * tree outline (if it has one) of the PDF. The tree is in the format of:
   * [
   *   {
   *     title: string,
   *     bold: boolean,
   *     italic: boolean,
   *     color: rgb Uint8ClampedArray,
   *     count: integer or undefined,
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
   * @returns {Promise} A promise that is resolved with an {Array} that contains
   *   the permission flags for the PDF document, or `null` when
   *   no permissions are present in the PDF file.
   */
  getPermissions() {
    return this._transport.getPermissions();
  }

  /**
   * @returns {Promise} A promise that is resolved with an {Object} that has
   *   `info` and `metadata` properties. `info` is an {Object} filled with
   *   anything available in the information dictionary and similarly
   *   `metadata` is a {Metadata} object with information from the metadata
   *   section of the PDF.
   */
  getMetadata() {
    return this._transport.getMetadata();
  }

  /**
   * @returns {Promise} A promise that is resolved with a {TypedArray} that has
   *   the raw data from the PDF.
   */
  getData() {
    return this._transport.getData();
  }

  /**
   * @returns {Promise} A promise that is resolved when the document's data
   *   is loaded. It is resolved with an {Object} that contains the `length`
   *   property that indicates size of the PDF data in bytes.
   */
  getDownloadInfo() {
    return this._transport.downloadInfoCapability.promise;
  }

  /**
   * @returns {Promise} A promise this is resolved with current statistics about
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
   * @type {Object} A subset of the current {DocumentInitParameters}, which are
   *   either needed in the viewer and/or whose default values may be affected
   *   by the `apiCompatibilityParams`.
   */
  get loadingParams() {
    return this._transport.loadingParams;
  }

  /**
   * @type {PDFDocumentLoadingTask} The loadingTask for the current document.
   */
  get loadingTask() {
    return this._transport.loadingTask;
  }
}

/**
 * Page getViewport parameters.
 *
 * @typedef {Object} GetViewportParameters
 * @property {number} scale - The desired scale of the viewport.
 * @property {number} [rotation] - The desired rotation, in degrees, of
 *   the viewport. If omitted it defaults to the page rotation.
 * @property {number} [offsetX] - The horizontal, i.e. x-axis, offset.
 *   The default value is `0`.
 * @property {number} [offsetY] - The vertical, i.e. y-axis, offset.
 *   The default value is `0`.
 * @property {boolean} [dontFlip] - If true, the y-axis will not be
 *   flipped. The default value is `false`.
 */

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
 * @property {Object} styles - {@link TextStyle} objects, indexed by font name.
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
 *                          calling the `PDFPageProxy.getViewport` method.
 * @property {string} [intent] - Rendering intent, can be 'display' or 'print'
 *                    (default value is 'display').
 * @property {boolean} [enableWebGL] - Enables WebGL accelerated rendering
 *                     for some operations. The default value is `false`.
 * @property {boolean} [renderInteractiveForms] - Whether or not
 *                     interactive form elements are rendered in the display
 *                     layer. If so, we do not render them on canvas as well.
 * @property {Array}  [transform] - Additional transform, applied
 *                    just before viewport transform.
 * @property {Object} [imageLayer] - An object that has beginLayout,
 *                    endLayout and appendImage functions.
 * @property {Object} [canvasFactory] - The factory that will be used
 *                    when creating canvases. The default value is
 *                    {DOMCanvasFactory}.
 * @property {Object} [background] - Background to use for the canvas.
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
 * @alias PDFPageProxy
 */
class PDFPageProxy {
  constructor(pageIndex, pageInfo, transport, pdfBug = false) {
    this.pageIndex = pageIndex;
    this._pageInfo = pageInfo;
    this._transport = transport;
    this._stats = (pdfBug ? new StatTimer() : null);
    this._pdfBug = pdfBug;
    this.commonObjs = transport.commonObjs;
    this.objs = new PDFObjects();

    this.cleanupAfterRender = false;
    this.pendingCleanup = false;
    this.intentStates = Object.create(null);
    this.destroyed = false;
  }

  /**
   * @type {number} Page number of the page. First page is 1.
   */
  get pageNumber() {
    return this.pageIndex + 1;
  }

  /**
   * @type {number} The number of degrees the page is rotated clockwise.
   */
  get rotate() {
    return this._pageInfo.rotate;
  }

  /**
   * @type {Object} The reference that points to this page. It has `num` and
   *   `gen` properties.
   */
  get ref() {
    return this._pageInfo.ref;
  }

  /**
   * @type {number} The default size of units in 1/72nds of an inch.
   */
  get userUnit() {
    return this._pageInfo.userUnit;
  }

  /**
   * @type {Array} An array of the visible portion of the PDF page in user
   *   space units [x1, y1, x2, y2].
   */
  get view() {
    return this._pageInfo.view;
  }

  /**
   * @param {GetViewportParameters} params - Viewport parameters.
   * @returns {PageViewport} Contains 'width' and 'height' properties
   *   along with transforms required for rendering.
   */
  getViewport({ scale, rotation = this.rotate,
                offsetX = 0, offsetY = 0, dontFlip = false, } = {}) {
    if ((typeof PDFJSDev !== 'undefined' && PDFJSDev.test('GENERIC')) &&
        (arguments.length > 1 || typeof arguments[0] === 'number')) {
      throw new Error(
        'PDFPageProxy.getViewport is called with obsolete arguments.');
    }
    return new PageViewport({
      viewBox: this.view,
      scale,
      rotation,
      offsetX,
      offsetY,
      dontFlip,
    });
  }

  /**
   * @param {GetAnnotationsParameters} params - Annotation parameters.
   * @returns {Promise} A promise that is resolved with an {Array} of the
   *   annotation objects.
   */
  getAnnotations({ intent = null, } = {}) {
    if (!this.annotationsPromise || this.annotationsIntent !== intent) {
      this.annotationsPromise = this._transport.getAnnotations(this.pageIndex,
                                                               intent);
      this.annotationsIntent = intent;
    }
    return this.annotationsPromise;
  }

  /**
   * Begins the process of rendering a page to the desired context.
   * @param {RenderParameters} params Page render parameters.
   * @returns {RenderTask} An object that contains the promise, which
   *                       is resolved when the page finishes rendering.
   */
  render({ canvasContext, viewport, intent = 'display', enableWebGL = false,
           renderInteractiveForms = false, transform = null, imageLayer = null,
           canvasFactory = null, background = null, }) {
    if (this._stats) {
      this._stats.time('Overall');
    }

    const renderingIntent = (intent === 'print' ? 'print' : 'display');
    // If there was a pending destroy, cancel it so no cleanup happens during
    // this call to render.
    this.pendingCleanup = false;

    if (!this.intentStates[renderingIntent]) {
      this.intentStates[renderingIntent] = Object.create(null);
    }
    const intentState = this.intentStates[renderingIntent];

    // Ensure that a pending `streamReader` cancel timeout is always aborted.
    if (intentState.streamReaderCancelTimeout) {
      clearTimeout(intentState.streamReaderCancelTimeout);
      intentState.streamReaderCancelTimeout = null;
    }

    const canvasFactoryInstance = canvasFactory || new DOMCanvasFactory();
    const webGLContext = new WebGLContext({
      enable: enableWebGL,
    });

    // If there's no displayReadyCapability yet, then the operatorList
    // was never requested before. Make the request and create the promise.
    if (!intentState.displayReadyCapability) {
      intentState.displayReadyCapability = createPromiseCapability();
      intentState.operatorList = {
        fnArray: [],
        argsArray: [],
        lastChunk: false,
      };

      if (this._stats) {
        this._stats.time('Page Request');
      }
      this._pumpOperatorList({
        pageIndex: this.pageNumber - 1,
        intent: renderingIntent,
        renderInteractiveForms: renderInteractiveForms === true,
      });
    }

    const complete = (error) => {
      const i = intentState.renderTasks.indexOf(internalRenderTask);
      if (i >= 0) {
        intentState.renderTasks.splice(i, 1);
      }

      // Attempt to reduce memory usage during *printing*, by always running
      // cleanup once rendering has finished (regardless of cleanupAfterRender).
      if (this.cleanupAfterRender || renderingIntent === 'print') {
        this.pendingCleanup = true;
      }
      this._tryCleanup();

      if (error) {
        internalRenderTask.capability.reject(error);

        this._abortOperatorList({
          intentState,
          reason: error,
        });
      } else {
        internalRenderTask.capability.resolve();
      }
      if (this._stats) {
        this._stats.timeEnd('Rendering');
        this._stats.timeEnd('Overall');
      }
    };

    const internalRenderTask = new InternalRenderTask({
      callback: complete,
      params: { // Include the required properties, and *not* the entire object.
        canvasContext,
        viewport,
        transform,
        imageLayer,
        background,
      },
      objs: this.objs,
      commonObjs: this.commonObjs,
      operatorList: intentState.operatorList,
      pageNumber: this.pageNumber,
      canvasFactory: canvasFactoryInstance,
      webGLContext,
      useRequestAnimationFrame: renderingIntent !== 'print',
      pdfBug: this._pdfBug,
    });

    if (!intentState.renderTasks) {
      intentState.renderTasks = [];
    }
    intentState.renderTasks.push(internalRenderTask);
    const renderTask = internalRenderTask.task;

    intentState.displayReadyCapability.promise.then((transparency) => {
      if (this.pendingCleanup) {
        complete();
        return;
      }
      if (this._stats) {
        this._stats.time('Rendering');
      }
      internalRenderTask.initializeGraphics(transparency);
      internalRenderTask.operatorListChanged();
    }).catch(complete);

    return renderTask;
  }

  /**
   * @returns {Promise} A promise resolved with an {@link PDFOperatorList}
   *   object that represents page's operator list.
   */
  getOperatorList() {
    function operatorListChanged() {
      if (intentState.operatorList.lastChunk) {
        intentState.opListReadCapability.resolve(intentState.operatorList);

        const i = intentState.renderTasks.indexOf(opListTask);
        if (i >= 0) {
          intentState.renderTasks.splice(i, 1);
        }
      }
    }

    const renderingIntent = 'oplist';
    if (!this.intentStates[renderingIntent]) {
      this.intentStates[renderingIntent] = Object.create(null);
    }
    const intentState = this.intentStates[renderingIntent];
    let opListTask;

    if (!intentState.opListReadCapability) {
      opListTask = {};
      opListTask.operatorListChanged = operatorListChanged;
      intentState.opListReadCapability = createPromiseCapability();
      intentState.renderTasks = [];
      intentState.renderTasks.push(opListTask);
      intentState.operatorList = {
        fnArray: [],
        argsArray: [],
        lastChunk: false,
      };

      if (this._stats) {
        this._stats.time('Page Request');
      }
      this._pumpOperatorList({
        pageIndex: this.pageIndex,
        intent: renderingIntent,
      });
    }
    return intentState.opListReadCapability.promise;
  }

  /**
   * @param {getTextContentParameters} params - getTextContent parameters.
   * @returns {ReadableStream} ReadableStream to read textContent chunks.
   */
  streamTextContent({ normalizeWhitespace = false,
                      disableCombineTextItems = false, } = {}) {
    const TEXT_CONTENT_CHUNK_SIZE = 100;

    return this._transport.messageHandler.sendWithStream('GetTextContent', {
      pageIndex: this.pageNumber - 1,
      normalizeWhitespace: normalizeWhitespace === true,
      combineTextItems: disableCombineTextItems !== true,
    }, {
      highWaterMark: TEXT_CONTENT_CHUNK_SIZE,
      size(textContent) {
        return textContent.items.length;
      },
    });
  }

  /**
   * @param {getTextContentParameters} params - getTextContent parameters.
   * @returns {Promise} That is resolved a {@link TextContent}
   *   object that represent the page text content.
   */
  getTextContent(params = {}) {
    const readableStream = this.streamTextContent(params);

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

      const reader = readableStream.getReader();
      const textContent = {
        items: [],
        styles: Object.create(null),
      };
      pump();
    });
  }

  /**
   * Destroys the page object.
   * @private
   */
  _destroy() {
    this.destroyed = true;
    this._transport.pageCache[this.pageIndex] = null;

    const waitOn = [];
    Object.keys(this.intentStates).forEach((intent) => {
      const intentState = this.intentStates[intent];
      this._abortOperatorList({
        intentState,
        reason: new Error('Page was destroyed.'),
        force: true,
      });

      if (intent === 'oplist') {
        // Avoid errors below, since the renderTasks are just stubs.
        return;
      }
      intentState.renderTasks.forEach(function(renderTask) {
        const renderCompleted = renderTask.capability.promise.
          catch(function() {}); // ignoring failures
        waitOn.push(renderCompleted);
        renderTask.cancel();
      });
    });
    this.objs.clear();
    this.annotationsPromise = null;
    this.pendingCleanup = false;
    return Promise.all(waitOn);
  }

  /**
   * Cleans up resources allocated by the page.
   * @param {boolean} [resetStats] - Reset page stats, if enabled.
   *   The default value is `false`.
   */
  cleanup(resetStats = false) {
    this.pendingCleanup = true;
    this._tryCleanup(resetStats);
  }

  /**
   * Attempts to clean up if rendering is in a state where that's possible.
   * @private
   */
  _tryCleanup(resetStats = false) {
    if (!this.pendingCleanup ||
        Object.keys(this.intentStates).some((intent) => {
          const intentState = this.intentStates[intent];
          return (intentState.renderTasks.length !== 0 ||
                  !intentState.operatorList.lastChunk);
        })) {
      return;
    }

    Object.keys(this.intentStates).forEach((intent) => {
      delete this.intentStates[intent];
    });
    this.objs.clear();
    this.annotationsPromise = null;
    if (resetStats && this._stats) {
      this._stats = new StatTimer();
    }
    this.pendingCleanup = false;
  }

  /**
   * @private
   */
  _startRenderPage(transparency, intent) {
    const intentState = this.intentStates[intent];
    if (!intentState) {
      return; // Rendering was cancelled.
    }
    if (this._stats) {
      this._stats.timeEnd('Page Request');
    }
    // TODO Refactor RenderPageRequest to separate rendering
    // and operator list logic
    if (intentState.displayReadyCapability) {
      intentState.displayReadyCapability.resolve(transparency);
    }
  }

  /**
   * @private
   */
  _renderPageChunk(operatorListChunk, intentState) {
    // Add the new chunk to the current operator list.
    for (let i = 0, ii = operatorListChunk.length; i < ii; i++) {
      intentState.operatorList.fnArray.push(operatorListChunk.fnArray[i]);
      intentState.operatorList.argsArray.push(
        operatorListChunk.argsArray[i]);
    }
    intentState.operatorList.lastChunk = operatorListChunk.lastChunk;

    // Notify all the rendering tasks there are more operators to be consumed.
    for (let i = 0; i < intentState.renderTasks.length; i++) {
      intentState.renderTasks[i].operatorListChanged();
    }

    if (operatorListChunk.lastChunk) {
      this._tryCleanup();
    }
  }

  /**
   * @private
   */
  _pumpOperatorList(args) {
    assert(args.intent,
           'PDFPageProxy._pumpOperatorList: Expected "intent" argument.');

    const readableStream =
      this._transport.messageHandler.sendWithStream('GetOperatorList', args);
    const reader = readableStream.getReader();

    const intentState = this.intentStates[args.intent];
    intentState.streamReader = reader;

    const pump = () => {
      reader.read().then(({ value, done, }) => {
        if (done) {
          intentState.streamReader = null;
          return;
        }
        if (this._transport.destroyed) {
          return; // Ignore any pending requests if the worker was terminated.
        }
        this._renderPageChunk(value, intentState);
        pump();
      }, (reason) => {
        intentState.streamReader = null;

        if (this._transport.destroyed) {
          return; // Ignore any pending requests if the worker was terminated.
        }
        if (intentState.operatorList) {
          // Mark operator list as complete.
          intentState.operatorList.lastChunk = true;

          for (let i = 0; i < intentState.renderTasks.length; i++) {
            intentState.renderTasks[i].operatorListChanged();
          }
          this._tryCleanup();
        }

        if (intentState.displayReadyCapability) {
          intentState.displayReadyCapability.reject(reason);
        } else if (intentState.opListReadCapability) {
          intentState.opListReadCapability.reject(reason);
        } else {
          throw reason;
        }
      });
    };
    pump();
  }

  /**
   * @private
   */
  _abortOperatorList({ intentState, reason, force = false, }) {
    assert(reason instanceof Error,
           'PDFPageProxy._abortOperatorList: Expected "reason" argument.');

    if (!intentState.streamReader) {
      return;
    }
    if (!force) {
      // Ensure that an Error occurring in *only* one `InternalRenderTask`, e.g.
      // multiple render() calls on the same canvas, won't break all rendering.
      if (intentState.renderTasks.length !== 0) {
        return;
      }
      // Don't immediately abort parsing on the worker-thread when rendering is
      // cancelled, since that will unnecessarily delay re-rendering when (for
      // partially parsed pages) e.g. zooming/rotation occurs in the viewer.
      if (reason instanceof RenderingCancelledException) {
        intentState.streamReaderCancelTimeout = setTimeout(() => {
          this._abortOperatorList({ intentState, reason, force: true, });
          intentState.streamReaderCancelTimeout = null;
        }, RENDERING_CANCELLED_TIMEOUT);
        return;
      }
    }
    intentState.streamReader.cancel(
      new AbortException(reason && reason.message));
    intentState.streamReader = null;

    if (this._transport.destroyed) {
      return; // Ignore any pending requests if the worker was terminated.
    }
    // Remove the current `intentState`, since a cancelled `getOperatorList`
    // call on the worker-thread cannot be re-started...
    Object.keys(this.intentStates).some((intent) => {
      if (this.intentStates[intent] === intentState) {
        delete this.intentStates[intent];
        return true;
      }
      return false;
    });
    // ... and force clean-up to ensure that any old state is always removed.
    this.cleanup();
  }

  /**
   * @type {Object} Returns page stats, if enabled; returns `null` otherwise.
   */
  get stats() {
    return this._stats;
  }
}

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
      let buffer, result;
      if ((buffer = value.buffer) && isArrayBuffer(buffer)) {
        // We found object with ArrayBuffer (typed array).
        const transferable = transfers && transfers.includes(buffer);
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
      for (const i in value) {
        let desc, p = value;
        while (!(desc = Object.getOwnPropertyDescriptor(p, i))) {
          p = Object.getPrototypeOf(p);
        }
        if (typeof desc.value === 'undefined') {
          continue;
        }
        if (typeof desc.value === 'function') {
          if (value.hasOwnProperty && value.hasOwnProperty(i)) {
            throw new Error(
              `LoopbackPort.postMessage - cannot clone: ${value[i]}`);
          }
          continue;
        }
        result[i] = cloneValue(desc.value);
      }
      return result;
    }

    if (!this._defer) {
      this._listeners.forEach((listener) => {
        listener.call(this, { data: obj, });
      });
      return;
    }

    const cloned = new WeakMap();
    const e = { data: cloneValue(obj), };
    this._deferred.then(() => {
      this._listeners.forEach((listener) => {
        listener.call(this, e);
      });
    });
  }

  addEventListener(name, listener) {
    this._listeners.push(listener);
  }

  removeEventListener(name, listener) {
    const i = this._listeners.indexOf(listener);
    this._listeners.splice(i, 1);
  }

  terminate() {
    this._listeners.length = 0;
  }
}

/**
 * @typedef {Object} PDFWorkerParameters
 * @property {string} [name] - The name of the worker.
 * @property {Object} [port] - The `workerPort`.
 * @property {number} [verbosity] - Controls the logging level; the
 *   constants from {VerbosityLevel} should be used.
 */

const PDFWorker = (function PDFWorkerClosure() {
  const pdfWorkerPorts = new WeakMap();
  let nextFakeWorkerId = 0;
  let fakeWorkerFilesLoadedCapability;

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

  // Loads worker code into main thread.
  function setupFakeWorkerGlobal() {
    if (fakeWorkerFilesLoadedCapability) {
      return fakeWorkerFilesLoadedCapability.promise;
    }
    fakeWorkerFilesLoadedCapability = createPromiseCapability();

    const mainWorkerMessageHandler = getMainThreadWorkerMessageHandler();
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
      } else {
        fakeWorkerFilesLoadedCapability.reject(
          new Error('SystemJS must be used to load fake worker.'));
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
    const wrapper = 'importScripts(\'' + url + '\');';
    return URL.createObjectURL(new Blob([wrapper]));
  }

  /**
   * PDF.js web worker abstraction, which controls the instantiation of PDF
   * documents. Message handlers are used to pass information from the main
   * thread to the worker thread and vice versa. If the creation of a web
   * worker is not possible, a "fake" worker will be used instead.
   */
  class PDFWorker {
    /**
     * @param {PDFWorkerParameters} params - Worker initialization parameters.
     */
    constructor({ name = null, port = null,
                  verbosity = getVerbosityLevel(), } = {}) {
      if (port && pdfWorkerPorts.has(port)) {
        throw new Error('Cannot use more than one PDFWorker per port');
      }

      this.name = name;
      this.destroyed = false;
      this.postMessageTransfers = true;
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

    get promise() {
      return this._readyCapability.promise;
    }

    get port() {
      return this._port;
    }

    get messageHandler() {
      return this._messageHandler;
    }

    _initializeFromPort(port) {
      this._port = port;
      this._messageHandler = new MessageHandler('main', 'worker', port);
      this._messageHandler.on('ready', function() {
        // Ignoring 'ready' event -- MessageHandler shall be already initialized
        // and ready to accept the messages.
      });
      this._readyCapability.resolve();
    }

    _initialize() {
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
          const worker = new Worker(workerSrc);
          const messageHandler = new MessageHandler('main', 'worker', worker);
          const terminateEarly = () => {
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

          const onWorkerError = () => {
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
            if (data) { // supportTypedArray
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
              warn('Cannot use postMessage transfers.');
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
    }

    _setupFakeWorker() {
      if (!isWorkerDisabled) {
        warn('Setting up fake worker.');
        isWorkerDisabled = true;
      }

      setupFakeWorkerGlobal().then((WorkerMessageHandler) => {
        if (this.destroyed) {
          this._readyCapability.reject(new Error('Worker was destroyed'));
          return;
        }
        const port = new LoopbackPort();
        this._port = port;

        // All fake workers use the same port, making id unique.
        const id = 'fake' + (nextFakeWorkerId++);

        // If the main thread is our worker, setup the handling for the
        // messages -- the main thread sends to it self.
        const workerHandler = new MessageHandler(id + '_worker', id, port);
        WorkerMessageHandler.setup(workerHandler, port);

        const messageHandler = new MessageHandler(id, id + '_worker', port);
        this._messageHandler = messageHandler;
        this._readyCapability.resolve();
      }).catch((reason) => {
        this._readyCapability.reject(
          new Error(`Setting up fake worker failed: "${reason.message}".`));
      });
    }

    /**
     * Destroys the worker instance.
     */
    destroy() {
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
    }

    /**
     * @param {PDFWorkerParameters} params - The worker initialization
     *                                       parameters.
     */
    static fromPort(params) {
      if (!params || !params.port) {
        throw new Error('PDFWorker.fromPort - invalid method signature.');
      }
      if (pdfWorkerPorts.has(params.port)) {
        return pdfWorkerPorts.get(params.port);
      }
      return new PDFWorker(params);
    }

    static getWorkerSrc() {
      return getWorkerSrc();
    }
  }
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
    this.fontLoader = new FontLoader({
      docId: loadingTask.docId,
      onUnsupportedFeature: this._onUnsupportedFeature.bind(this),
    });
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
    this.pageCache.length = 0;
    this.pagePromises.length = 0;
    // We also need to wait for the worker to finish its long running tasks.
    const terminated = this.messageHandler.sendWithPromise('Terminate', null);
    waitOn.push(terminated);
    Promise.all(waitOn).then(() => {
      this.fontLoader.clear();
      if (this._networkStream) {
        this._networkStream.cancelAllRequests(
          new AbortException('Worker was terminated.'));
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

    messageHandler.on('GetReader', (data, sink) => {
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
    });

    messageHandler.on('ReaderHeadersReady', (data) => {
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
    });

    messageHandler.on('GetRangeReader', (data, sink) => {
      assert(this._networkStream);
      const rangeReader =
        this._networkStream.getRangeReader(data.begin, data.end);

      // When streaming is enabled, it's possible that the data requested here
      // has already been fetched via the `_fullRequestReader` implementation.
      // However, given that the PDF data is loaded asynchronously on the
      // main-thread and then sent via `postMessage` to the worker-thread,
      // it may not have been available during parsing (hence the attempt to
      // use range requests here).
      //
      // To avoid wasting time and resources here, we'll thus *not* dispatch
      // range requests if the data was already loaded but has not been sent to
      // the worker-thread yet (which will happen via the `_fullRequestReader`).
      if (!rangeReader) {
        sink.close();
        return;
      }

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
    });

    messageHandler.on('GetDoc', ({ pdfInfo, }) => {
      this._numPages = pdfInfo.numPages;
      loadingTask._capability.resolve(new PDFDocumentProxy(pdfInfo, this));
    });

    messageHandler.on('DocException', function(ex) {
      let reason;
      switch (ex.name) {
        case 'PasswordException':
          reason = new PasswordException(ex.message, ex.code);
          break;
        case 'InvalidPDFException':
          reason = new InvalidPDFException(ex.message);
          break;
        case 'MissingPDFException':
          reason = new MissingPDFException(ex.message);
          break;
        case 'UnexpectedResponseException':
          reason = new UnexpectedResponseException(ex.message, ex.status);
          break;
        case 'UnknownErrorException':
          reason = new UnknownErrorException(ex.message, ex.details);
          break;
      }
      if (typeof PDFJSDev === 'undefined' ||
          PDFJSDev.test('!PRODUCTION || TESTING')) {
        assert(reason instanceof Error, 'DocException: expected an Error.');
      }
      loadingTask._capability.reject(reason);
    });

    messageHandler.on('PasswordRequest', (exception) => {
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
    });

    messageHandler.on('DataLoaded', (data) => {
      // For consistency: Ensure that progress is always reported when the
      // entire PDF file has been loaded, regardless of how it was fetched.
      if (loadingTask.onProgress) {
        loadingTask.onProgress({
          loaded: data.length,
          total: data.length,
        });
      }
      this.downloadInfoCapability.resolve(data);
    });

    messageHandler.on('StartRenderPage', (data) => {
      if (this.destroyed) {
        return; // Ignore any pending requests if the worker was terminated.
      }

      const page = this.pageCache[data.pageIndex];
      page._startRenderPage(data.transparency, data.intent);
    });

    messageHandler.on('commonobj', (data) => {
      if (this.destroyed) {
        return; // Ignore any pending requests if the worker was terminated.
      }

      const [id, type, exportedData] = data;
      if (this.commonObjs.has(id)) {
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

          this.fontLoader.bind(font).then(() => {
            this.commonObjs.resolve(id, font);
          }, (reason) => {
            messageHandler.sendWithPromise('FontFallback', {
              id,
            }).finally(() => {
              this.commonObjs.resolve(id, font);
            });
          });
          break;
        case 'FontPath':
        case 'FontType3Res':
          this.commonObjs.resolve(id, exportedData);
          break;
        default:
          throw new Error(`Got unknown common object type ${type}`);
      }
    });

    messageHandler.on('obj', (data) => {
      if (this.destroyed) {
        // Ignore any pending requests if the worker was terminated.
        return undefined;
      }

      const [id, pageIndex, type, imageData] = data;
      const pageProxy = this.pageCache[pageIndex];
      if (pageProxy.objs.has(id)) {
        return undefined;
      }

      switch (type) {
        case 'JpegStream':
          return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = function() {
              resolve(img);
            };
            img.onerror = function() {
              // Note that when the browser image loading/decoding fails,
              // we'll fallback to the built-in PDF.js JPEG decoder; see
              // `PartialEvaluator.buildPaintImageXObject` in the
              // `src/core/evaluator.js` file.
              reject(new Error('Error during JPEG image loading'));

              // Always remember to release the image data if errors occurred.
              releaseImageResources(img);
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
      return undefined;
    });

    messageHandler.on('DocProgress', (data) => {
      if (this.destroyed) {
        return; // Ignore any pending requests if the worker was terminated.
      }

      if (loadingTask.onProgress) {
        loadingTask.onProgress({
          loaded: data.loaded,
          total: data.total,
        });
      }
    });

    messageHandler.on('UnsupportedFeature',
                      this._onUnsupportedFeature.bind(this));

    messageHandler.on('JpegDecode', (data) => {
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

      return new Promise(function(resolve, reject) {
        const img = new Image();
        img.onload = function() {
          const { width, height, } = img;
          const size = width * height;
          const rgbaLength = size * 4;
          const buf = new Uint8ClampedArray(size * components);
          let tmpCanvas = document.createElement('canvas');
          tmpCanvas.width = width;
          tmpCanvas.height = height;
          let tmpCtx = tmpCanvas.getContext('2d');
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

          // Immediately release the image data once decoding has finished.
          releaseImageResources(img);
          // Zeroing the width and height cause Firefox to release graphics
          // resources immediately, which can greatly reduce memory consumption.
          tmpCanvas.width = 0;
          tmpCanvas.height = 0;
          tmpCanvas = null;
          tmpCtx = null;
        };
        img.onerror = function() {
          reject(new Error('JpegDecode failed to load image'));

          // Always remember to release the image data if errors occurred.
          releaseImageResources(img);
        };
        img.src = imageUrl;
      });
    });

    messageHandler.on('FetchBuiltInCMap', (data, sink) => {
      if (this.destroyed) {
        sink.error(new Error('Worker was destroyed'));
        return;
      }
      let fetched = false;

      sink.onPull = () => {
        if (fetched) {
          sink.close();
          return;
        }
        fetched = true;

        this.CMapReaderFactory.fetch(data).then(function(builtInCMap) {
          sink.enqueue(builtInCMap, 1, [builtInCMap.cMapData.buffer]);
        }).catch(function(reason) {
          sink.error(reason);
        });
      };
    });
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
        pageNumber <= 0 || pageNumber > this._numPages) {
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

  getPageLayout() {
    return this.messageHandler.sendWithPromise('GetPageLayout', null);
  }

  getPageMode() {
    return this.messageHandler.sendWithPromise('GetPageMode', null);
  }

  getViewerPreferences() {
    return this.messageHandler.sendWithPromise('GetViewerPreferences', null);
  }

  getOpenActionDestination() {
    return this.messageHandler.sendWithPromise('GetOpenActionDestination',
                                               null);
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
 * A PDF document and page is built of many objects. E.g. there are objects for
 * fonts, images, rendering code, etc. These objects may get processed inside of
 * a worker. This class implements some basic methods to manage these objects.
 * @ignore
 */
class PDFObjects {
  constructor() {
    this._objs = Object.create(null);
  }

  /**
   * Ensures there is an object defined for `objId`.
   * @private
   */
  _ensureObj(objId) {
    if (this._objs[objId]) {
      return this._objs[objId];
    }
    return this._objs[objId] = {
      capability: createPromiseCapability(),
      data: null,
      resolved: false,
    };
  }

  /**
   * If called *without* callback, this returns the data of `objId` but the
   * object needs to be resolved. If it isn't, this method throws.
   *
   * If called *with* a callback, the callback is called with the data of the
   * object once the object is resolved. That means, if you call this method
   * and the object is already resolved, the callback gets called right away.
   */
  get(objId, callback = null) {
    // If there is a callback, then the get can be async and the object is
    // not required to be resolved right now.
    if (callback) {
      this._ensureObj(objId).capability.promise.then(callback);
      return null;
    }
    // If there isn't a callback, the user expects to get the resolved data
    // directly.
    const obj = this._objs[objId];
    // If there isn't an object yet or the object isn't resolved, then the
    // data isn't ready yet!
    if (!obj || !obj.resolved) {
      throw new Error(`Requesting object that isn't resolved yet ${objId}.`);
    }
    return obj.data;
  }

  has(objId) {
    const obj = this._objs[objId];
    return (obj ? obj.resolved : false);
  }

  /**
   * Resolves the object `objId` with optional `data`.
   */
  resolve(objId, data) {
    const obj = this._ensureObj(objId);

    obj.resolved = true;
    obj.data = data;
    obj.capability.resolve(data);
  }

  clear() {
    for (const objId in this._objs) {
      const { data, } = this._objs[objId];

      if (typeof Image !== 'undefined' && data instanceof Image) {
        // Always release the image data when clearing out the cached objects.
        releaseImageResources(data);
      }
    }
    this._objs = Object.create(null);
  }
}

/**
 * Allows controlling of the rendering tasks.
 * @alias RenderTask
 */
class RenderTask {
  constructor(internalRenderTask) {
    this._internalRenderTask = internalRenderTask;

    /**
     * Callback for incremental rendering -- a function that will be called
     * each time the rendering is paused.  To continue rendering call the
     * function that is the first argument to the callback.
     * @type {function}
     */
    this.onContinue = null;
  }

  /**
   * Promise for rendering task completion.
   * @type {Promise}
   */
  get promise() {
    return this._internalRenderTask.capability.promise;
  }

  /**
   * Cancels the rendering task. If the task is currently rendering it will
   * not be cancelled until graphics pauses with a timeout. The promise that
   * this object extends will be rejected when cancelled.
   */
  cancel() {
    this._internalRenderTask.cancel();
  }

  /**
   * Registers callbacks to indicate the rendering task completion.
   * @ignore
   */
  then(onFulfilled, onRejected) {
    throw new Error('Removed API method: ' +
      'RenderTask.then, use the `promise` getter instead.');
  }
}

/**
 * For internal use only.
 * @ignore
 */
const InternalRenderTask = (function InternalRenderTaskClosure() {
  const canvasInRendering = new WeakSet();

  class InternalRenderTask {
    constructor({ callback, params, objs, commonObjs, operatorList, pageNumber,
                  canvasFactory, webGLContext, useRequestAnimationFrame = false,
                  pdfBug = false, }) {
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
      this._useRequestAnimationFrame = (useRequestAnimationFrame === true &&
                                        typeof window !== 'undefined');
      this.cancelled = false;
      this.capability = createPromiseCapability();
      this.task = new RenderTask(this);
      // caching this-bound methods
      this._continueBound = this._continue.bind(this);
      this._scheduleNextBound = this._scheduleNext.bind(this);
      this._nextBound = this._next.bind(this);
      this._canvas = params.canvasContext.canvas;
    }

    initializeGraphics(transparency = false) {
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
        canvasInRendering.add(this._canvas);
      }

      if (this._pdfBug && globalScope.StepperManager &&
          globalScope.StepperManager.enabled) {
        this.stepper = globalScope.StepperManager.create(this.pageNumber - 1);
        this.stepper.init(this.operatorList);
        this.stepper.nextBreakPoint = this.stepper.getNextBreakPoint();
      }
      const {
        canvasContext, viewport, transform, imageLayer, background,
      } = this.params;

      this.gfx = new CanvasGraphics(canvasContext, this.commonObjs, this.objs,
                                    this.canvasFactory, this.webGLContext,
                                    imageLayer);
      this.gfx.beginDrawing({
        transform,
        viewport,
        transparency,
        background,
      });
      this.operatorListIdx = 0;
      this.graphicsReady = true;
      if (this.graphicsReadyCallback) {
        this.graphicsReadyCallback();
      }
    }

    cancel(error = null) {
      this.running = false;
      this.cancelled = true;
      if (this.gfx) {
        this.gfx.endDrawing();
      }
      if (this._canvas) {
        canvasInRendering.delete(this._canvas);
      }
      this.callback(error || new RenderingCancelledException(
        `Rendering cancelled, page ${this.pageNumber}`, 'canvas'));
    }

    operatorListChanged() {
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
    }

    _continue() {
      this.running = true;
      if (this.cancelled) {
        return;
      }
      if (this.task.onContinue) {
        this.task.onContinue(this._scheduleNextBound);
      } else {
        this._scheduleNext();
      }
    }

    _scheduleNext() {
      if (this._useRequestAnimationFrame) {
        window.requestAnimationFrame(() => {
          this._nextBound().catch(this.cancel.bind(this));
        });
      } else {
        Promise.resolve().then(this._nextBound).catch(this.cancel.bind(this));
      }
    }

    async _next() {
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
    }
  }
  return InternalRenderTask;
})();

const version = (typeof PDFJSDev !== 'undefined' ?
                 PDFJSDev.eval('BUNDLE_VERSION') : null);
const build = (typeof PDFJSDev !== 'undefined' ?
               PDFJSDev.eval('BUNDLE_BUILD') : null);

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
