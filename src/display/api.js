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

/**
 * @module pdfjsLib
 */

import {
  AbortException,
  assert,
  createPromiseCapability,
  getVerbosityLevel,
  info,
  InvalidPDFException,
  isArrayBuffer,
  isSameOrigin,
  MissingPDFException,
  PasswordException,
  setVerbosityLevel,
  shadow,
  stringToBytes,
  UnexpectedResponseException,
  UnknownErrorException,
  unreachable,
  warn,
} from "../shared/util.js";
import {
  deprecated,
  DOMCanvasFactory,
  DOMCMapReaderFactory,
  DOMStandardFontDataFactory,
  isDataScheme,
  loadScript,
  PageViewport,
  RenderingCancelledException,
  StatTimer,
} from "./display_utils.js";
import { FontFaceObject, FontLoader } from "./font_loader.js";
import {
  NodeCanvasFactory,
  NodeCMapReaderFactory,
  NodeStandardFontDataFactory,
} from "./node_utils.js";
import { AnnotationStorage } from "./annotation_storage.js";
import { CanvasGraphics } from "./canvas.js";
import { GlobalWorkerOptions } from "./worker_options.js";
import { isNodeJS } from "../shared/is_node.js";
import { MessageHandler } from "../shared/message_handler.js";
import { Metadata } from "./metadata.js";
import { OptionalContentConfig } from "./optional_content_config.js";
import { PDFDataTransportStream } from "./transport_stream.js";

const DEFAULT_RANGE_CHUNK_SIZE = 65536; // 2^16 = 65536
const RENDERING_CANCELLED_TIMEOUT = 100; // ms

const DefaultCanvasFactory =
  (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) && isNodeJS
    ? NodeCanvasFactory
    : DOMCanvasFactory;
const DefaultCMapReaderFactory =
  (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) && isNodeJS
    ? NodeCMapReaderFactory
    : DOMCMapReaderFactory;
const DefaultStandardFontDataFactory =
  (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) && isNodeJS
    ? NodeStandardFontDataFactory
    : DOMStandardFontDataFactory;

/**
 * @typedef {function} IPDFStreamFactory
 * @param {DocumentInitParameters} params - The document initialization
 *   parameters. The "url" key is always present.
 * @returns {Promise} A promise, which is resolved with an instance of
 *   {IPDFStream}.
 * @ignore
 */

/**
 * @type IPDFStreamFactory
 * @private
 */
let createPDFNetworkStream;

/**
 * Sets the function that instantiates an {IPDFStream} as an alternative PDF
 * data transport.
 *
 * @param {IPDFStreamFactory} pdfNetworkStreamFactory - The factory function
 *   that takes document initialization parameters (including a "url") and
 *   returns a promise which is resolved with an instance of {IPDFStream}.
 * @ignore
 */
function setPDFNetworkStreamFactory(pdfNetworkStreamFactory) {
  createPDFNetworkStream = pdfNetworkStreamFactory;
}

/**
 * @typedef { Int8Array | Uint8Array | Uint8ClampedArray |
 *            Int16Array | Uint16Array |
 *            Int32Array | Uint32Array | Float32Array |
 *            Float64Array
 * } TypedArray
 */

/**
 * @typedef {Object} RefProxy
 * @property {number} num
 * @property {number} gen
 */

/**
 * Document initialization / loading parameters object.
 *
 * @typedef {Object} DocumentInitParameters
 * @property {string|URL} [url] - The URL of the PDF.
 * @property {TypedArray|Array<number>|string} [data] - Binary PDF data. Use
 *    typed arrays (Uint8Array) to improve the memory usage. If PDF data is
 *    BASE64-encoded, use `atob()` to convert it to a binary string first.
 * @property {Object} [httpHeaders] - Basic authentication headers.
 * @property {boolean} [withCredentials] - Indicates whether or not
 *   cross-site Access-Control requests should be made using credentials such
 *   as cookies or authorization headers. The default is `false`.
 * @property {string} [password] - For decrypting password-protected PDFs.
 * @property {TypedArray} [initialData] - A typed array with the first portion
 *   or all of the pdf data. Used by the extension since some data is already
 *   loaded before the switch to range requests.
 * @property {number} [length] - The PDF file length. It's used for progress
 *   reports and range requests operations.
 * @property {PDFDataRangeTransport} [range] - Allows for using a custom range
 *   transport implementation.
 * @property {number} [rangeChunkSize] - Specify maximum number of bytes fetched
 *   per range request. The default value is {@link DEFAULT_RANGE_CHUNK_SIZE}.
 * @property {PDFWorker} [worker] - The worker that will be used for loading and
 *   parsing the PDF data.
 * @property {number} [verbosity] - Controls the logging level; the constants
 *   from {@link VerbosityLevel} should be used.
 * @property {string} [docBaseUrl] - The base URL of the document, used when
 *   attempting to recover valid absolute URLs for annotations, and outline
 *   items, that (incorrectly) only specify relative URLs.
 * @property {string} [cMapUrl] - The URL where the predefined Adobe CMaps are
 *   located. Include the trailing slash.
 * @property {boolean} [cMapPacked] - Specifies if the Adobe CMaps are binary
 *   packed or not.
 * @property {Object} [CMapReaderFactory] - The factory that will be used when
 *   reading built-in CMap files. Providing a custom factory is useful for
 *   environments without Fetch API or `XMLHttpRequest` support, such as
 *   Node.js. The default value is {DOMCMapReaderFactory}.
 * @property {boolean} [useSystemFonts] - When `true`, fonts that aren't
 *   embedded in the PDF document will fallback to a system font.
 *   The default value is `true` in web environments and `false` in Node.js;
 *   unless `disableFontFace === true` in which case this defaults to `false`
 *   regardless of the environment (to prevent completely broken fonts).
 * @property {string} [standardFontDataUrl] - The URL where the standard font
 *   files are located. Include the trailing slash.
 * @property {Object} [StandardFontDataFactory] - The factory that will be used
 *   when reading the standard font files. Providing a custom factory is useful
 *   for environments without Fetch API or `XMLHttpRequest` support, such as
 *   Node.js. The default value is {DOMStandardFontDataFactory}.
 * @property {boolean} [useWorkerFetch] - Enable using the Fetch API in the
 *   worker-thread when reading CMap and standard font files. When `true`,
 *   the `CMapReaderFactory` and `StandardFontDataFactory` options are ignored.
 *   The default value is `true` in web environments and `false` in Node.js.
 * @property {boolean} [stopAtErrors] - Reject certain promises, e.g.
 *   `getOperatorList`, `getTextContent`, and `RenderTask`, when the associated
 *   PDF data cannot be successfully parsed, instead of attempting to recover
 *   whatever possible of the data. The default value is `false`.
 * @property {number} [maxImageSize] - The maximum allowed image size in total
 *   pixels, i.e. width * height. Images above this value will not be rendered.
 *   Use -1 for no limit, which is also the default value.
 * @property {boolean} [isEvalSupported] - Determines if we can evaluate strings
 *   as JavaScript. Primarily used to improve performance of font rendering, and
 *   when parsing PDF functions. The default value is `true`.
 * @property {boolean} [disableFontFace] - By default fonts are converted to
 *   OpenType fonts and loaded via the Font Loading API or `@font-face` rules.
 *   If disabled, fonts will be rendered using a built-in font renderer that
 *   constructs the glyphs with primitive path commands.
 *   The default value is `false` in web environments and `true` in Node.js.
 * @property {boolean} [fontExtraProperties] - Include additional properties,
 *   which are unused during rendering of PDF documents, when exporting the
 *   parsed font data from the worker-thread. This may be useful for debugging
 *   purposes (and backwards compatibility), but note that it will lead to
 *   increased memory usage. The default value is `false`.
 * @property {boolean} [enableXfa] - Render Xfa forms if any.
 *   The default value is `false`.
 * @property {HTMLDocument} [ownerDocument] - Specify an explicit document
 *   context to create elements with and to load resources, such as fonts,
 *   into. Defaults to the current document.
 * @property {boolean} [disableRange] - Disable range request loading of PDF
 *   files. When enabled, and if the server supports partial content requests,
 *   then the PDF will be fetched in chunks. The default value is `false`.
 * @property {boolean} [disableStream] - Disable streaming of PDF file data.
 *   By default PDF.js attempts to load PDF files in chunks. The default value
 *   is `false`.
 * @property {boolean} [disableAutoFetch] - Disable pre-fetching of PDF file
 *   data. When range requests are enabled PDF.js will automatically keep
 *   fetching more data even if it isn't needed to display the current page.
 *   The default value is `false`.
 *
 *   NOTE: It is also necessary to disable streaming, see above, in order for
 *   disabling of pre-fetching to work correctly.
 * @property {boolean} [pdfBug] - Enables special hooks for debugging PDF.js
 *   (see `web/debugger.js`). The default value is `false`.
 */

/**
 * This is the main entry point for loading a PDF and interacting with it.
 *
 * NOTE: If a URL is used to fetch the PDF data a standard Fetch API call (or
 * XHR as fallback) is used, which means it must follow same origin rules,
 * e.g. no cross-domain requests without CORS.
 *
 * @param {string|URL|TypedArray|PDFDataRangeTransport|DocumentInitParameters}
 *   src - Can be a URL where a PDF file is located, a typed array (Uint8Array)
 *         already populated with data, or a parameter object.
 * @returns {PDFDocumentLoadingTask}
 */
function getDocument(src) {
  const task = new PDFDocumentLoadingTask();

  let source;
  if (typeof src === "string" || src instanceof URL) {
    source = { url: src };
  } else if (isArrayBuffer(src)) {
    source = { data: src };
  } else if (src instanceof PDFDataRangeTransport) {
    source = { range: src };
  } else {
    if (typeof src !== "object") {
      throw new Error(
        "Invalid parameter in getDocument, " +
          "need either string, URL, Uint8Array, or parameter object."
      );
    }
    if (!src.url && !src.data && !src.range) {
      throw new Error(
        "Invalid parameter object: need either .data, .range or .url"
      );
    }
    source = src;
  }
  const params = Object.create(null);
  let rangeTransport = null,
    worker = null;

  for (const key in source) {
    const value = source[key];

    switch (key) {
      case "url":
        if (typeof window !== "undefined") {
          try {
            // The full path is required in the 'url' field.
            params[key] = new URL(value, window.location).href;
            continue;
          } catch (ex) {
            warn(`Cannot create valid URL: "${ex}".`);
          }
        } else if (typeof value === "string" || value instanceof URL) {
          params[key] = value.toString(); // Support Node.js environments.
          continue;
        }
        throw new Error(
          "Invalid PDF url data: " +
            "either string or URL-object is expected in the url property."
        );
      case "range":
        rangeTransport = value;
        continue;
      case "worker":
        worker = value;
        continue;
      case "data":
        // Converting string or array-like data to Uint8Array.
        if (
          typeof PDFJSDev !== "undefined" &&
          PDFJSDev.test("GENERIC") &&
          isNodeJS &&
          typeof Buffer !== "undefined" && // eslint-disable-line no-undef
          value instanceof Buffer // eslint-disable-line no-undef
        ) {
          params[key] = new Uint8Array(value);
        } else if (value instanceof Uint8Array) {
          break; // Use the data as-is when it's already a Uint8Array.
        } else if (typeof value === "string") {
          params[key] = stringToBytes(value);
        } else if (
          typeof value === "object" &&
          value !== null &&
          !isNaN(value.length)
        ) {
          params[key] = new Uint8Array(value);
        } else if (isArrayBuffer(value)) {
          params[key] = new Uint8Array(value);
        } else {
          throw new Error(
            "Invalid PDF binary data: either typed array, " +
              "string, or array-like object is expected in the data property."
          );
        }
        continue;
    }
    params[key] = value;
  }

  params.rangeChunkSize = params.rangeChunkSize || DEFAULT_RANGE_CHUNK_SIZE;
  params.CMapReaderFactory =
    params.CMapReaderFactory || DefaultCMapReaderFactory;
  params.StandardFontDataFactory =
    params.StandardFontDataFactory || DefaultStandardFontDataFactory;
  params.ignoreErrors = params.stopAtErrors !== true;
  params.fontExtraProperties = params.fontExtraProperties === true;
  params.pdfBug = params.pdfBug === true;
  params.enableXfa = params.enableXfa === true;

  if (
    typeof params.docBaseUrl !== "string" ||
    isDataScheme(params.docBaseUrl)
  ) {
    // Ignore "data:"-URLs, since they can't be used to recover valid absolute
    // URLs anyway. We want to avoid sending them to the worker-thread, since
    // they contain the *entire* PDF document and can thus be arbitrarily long.
    params.docBaseUrl = null;
  }
  if (!Number.isInteger(params.maxImageSize)) {
    params.maxImageSize = -1;
  }
  if (typeof params.useWorkerFetch !== "boolean") {
    params.useWorkerFetch =
      params.CMapReaderFactory === DOMCMapReaderFactory &&
      params.StandardFontDataFactory === DOMStandardFontDataFactory;
  }
  if (typeof params.isEvalSupported !== "boolean") {
    params.isEvalSupported = true;
  }
  if (typeof params.disableFontFace !== "boolean") {
    params.disableFontFace =
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) && isNodeJS;
  }
  if (typeof params.useSystemFonts !== "boolean") {
    params.useSystemFonts =
      !(
        (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) &&
        isNodeJS
      ) && !params.disableFontFace;
  }
  if (typeof params.ownerDocument === "undefined") {
    params.ownerDocument = globalThis.document;
  }

  if (typeof params.disableRange !== "boolean") {
    params.disableRange = false;
  }
  if (typeof params.disableStream !== "boolean") {
    params.disableStream = false;
  }
  if (typeof params.disableAutoFetch !== "boolean") {
    params.disableAutoFetch = false;
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
    worker = workerParams.port
      ? PDFWorker.fromPort(workerParams)
      : new PDFWorker(workerParams);
    task._worker = worker;
  }
  const docId = task.docId;
  worker.promise
    .then(function () {
      if (task.destroyed) {
        throw new Error("Loading aborted");
      }

      const workerIdPromise = _fetchDocument(
        worker,
        params,
        rangeTransport,
        docId
      );
      const networkStreamPromise = new Promise(function (resolve) {
        let networkStream;
        if (rangeTransport) {
          networkStream = new PDFDataTransportStream(
            {
              length: params.length,
              initialData: params.initialData,
              progressiveDone: params.progressiveDone,
              contentDispositionFilename: params.contentDispositionFilename,
              disableRange: params.disableRange,
              disableStream: params.disableStream,
            },
            rangeTransport
          );
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
        resolve(networkStream);
      });

      return Promise.all([workerIdPromise, networkStreamPromise]).then(
        function ([workerId, networkStream]) {
          if (task.destroyed) {
            throw new Error("Loading aborted");
          }

          const messageHandler = new MessageHandler(
            docId,
            workerId,
            worker.port
          );
          messageHandler.postMessageTransfers = worker.postMessageTransfers;
          const transport = new WorkerTransport(
            messageHandler,
            task,
            networkStream,
            params
          );
          task._transport = transport;
          messageHandler.send("Ready", null);
        }
      );
    })
    .catch(task._capability.reject);

  return task;
}

/**
 * Starts fetching of specified PDF document/data.
 *
 * @param {PDFWorker} worker
 * @param {Object} source
 * @param {PDFDataRangeTransport} pdfDataRangeTransport
 * @param {string} docId - Unique document ID, used in `MessageHandler`.
 * @returns {Promise} A promise that is resolved when the worker ID of the
 *   `MessageHandler` is known.
 * @private
 */
function _fetchDocument(worker, source, pdfDataRangeTransport, docId) {
  if (worker.destroyed) {
    return Promise.reject(new Error("Worker was destroyed"));
  }

  if (pdfDataRangeTransport) {
    source.length = pdfDataRangeTransport.length;
    source.initialData = pdfDataRangeTransport.initialData;
    source.progressiveDone = pdfDataRangeTransport.progressiveDone;
    source.contentDispositionFilename =
      pdfDataRangeTransport.contentDispositionFilename;
  }
  return worker.messageHandler
    .sendWithPromise("GetDocRequest", {
      docId,
      apiVersion:
        typeof PDFJSDev !== "undefined" && !PDFJSDev.test("TESTING")
          ? PDFJSDev.eval("BUNDLE_VERSION")
          : null,
      // Only send the required properties, and *not* the entire object.
      source: {
        data: source.data,
        url: source.url,
        password: source.password,
        disableAutoFetch: source.disableAutoFetch,
        rangeChunkSize: source.rangeChunkSize,
        length: source.length,
      },
      maxImageSize: source.maxImageSize,
      disableFontFace: source.disableFontFace,
      postMessageTransfers: worker.postMessageTransfers,
      docBaseUrl: source.docBaseUrl,
      ignoreErrors: source.ignoreErrors,
      isEvalSupported: source.isEvalSupported,
      fontExtraProperties: source.fontExtraProperties,
      enableXfa: source.enableXfa,
      useSystemFonts: source.useSystemFonts,
      cMapUrl: source.useWorkerFetch ? source.cMapUrl : null,
      standardFontDataUrl: source.useWorkerFetch
        ? source.standardFontDataUrl
        : null,
    })
    .then(function (workerId) {
      if (worker.destroyed) {
        throw new Error("Worker was destroyed");
      }
      return workerId;
    });
}

/**
 * @typedef {Object} OnProgressParameters
 * @property {number} loaded - Currently loaded number of bytes.
 * @property {number} total - Total number of bytes in the PDF file.
 */

/**
 * The loading task controls the operations required to load a PDF document
 * (such as network requests) and provides a way to listen for completion,
 * after which individual pages can be rendered.
 *
 * @typedef {Object} PDFDocumentLoadingTask
 * @property {string} docId - Unique identifier for the document loading task.
 * @property {boolean} destroyed - Whether the loading task is destroyed or not.
 * @property {function} [onPassword] - Callback to request a password if a wrong
 *   or no password was provided. The callback receives two parameters: a
 *   function that should be called with the new password, and a reason (see
 *   {@link PasswordResponses}).
 * @property {function} [onProgress] - Callback to be able to monitor the
 *   loading progress of the PDF file (necessary to implement e.g. a loading
 *   bar). The callback receives an {@link OnProgressParameters} argument.
 * @property {function} [onUnsupportedFeature] - Callback for when an
 *   unsupported feature is used in the PDF document. The callback receives an
 *   {@link UNSUPPORTED_FEATURES} argument.
 * @property {Promise<PDFDocumentProxy>} promise - Promise for document loading
 *   task completion.
 * @property {function} destroy - Abort all network requests and destroy
 *   the worker. Returns a promise that is resolved when destruction is
 *   completed.
 */

/**
 * @type {any}
 * @ignore
 */
const PDFDocumentLoadingTask = (function PDFDocumentLoadingTaskClosure() {
  let nextDocumentId = 0;

  /**
   * The loading task controls the operations required to load a PDF document
   * (such as network requests) and provides a way to listen for completion,
   * after which individual pages can be rendered.
   */
  // eslint-disable-next-line no-shadow
  class PDFDocumentLoadingTask {
    constructor() {
      this._capability = createPromiseCapability();
      this._transport = null;
      this._worker = null;

      /**
       * Unique identifier for the document loading task.
       * @type {string}
       */
      this.docId = "d" + nextDocumentId++;

      /**
       * Whether the loading task is destroyed or not.
       * @type {boolean}
       */
      this.destroyed = false;

      /**
       * Callback to request a password if a wrong or no password was provided.
       * The callback receives two parameters: a function that should be called
       * with the new password, and a reason (see {@link PasswordResponses}).
       * @type {function}
       */
      this.onPassword = null;

      /**
       * Callback to be able to monitor the loading progress of the PDF file
       * (necessary to implement e.g. a loading bar).
       * The callback receives an {@link OnProgressParameters} argument.
       * @type {function}
       */
      this.onProgress = null;

      /**
       * Callback for when an unsupported feature is used in the PDF document.
       * The callback receives an {@link UNSUPPORTED_FEATURES} argument.
       * @type {function}
       */
      this.onUnsupportedFeature = null;
    }

    /**
     * Promise for document loading task completion.
     * @type {Promise<PDFDocumentProxy>}
     */
    get promise() {
      return this._capability.promise;
    }

    /**
     * @returns {Promise<void>} A promise that is resolved when destruction is
     *   completed.
     */
    destroy() {
      this.destroyed = true;

      const transportDestroyed = !this._transport
        ? Promise.resolve()
        : this._transport.destroy();
      return transportDestroyed.then(() => {
        this._transport = null;
        if (this._worker) {
          this._worker.destroy();
          this._worker = null;
        }
      });
    }
  }
  return PDFDocumentLoadingTask;
})();

/**
 * Abstract class to support range requests file loading.
 */
class PDFDataRangeTransport {
  /**
   * @param {number} length
   * @param {Uint8Array} initialData
   * @param {boolean} [progressiveDone]
   * @param {string} [contentDispositionFilename]
   */
  constructor(
    length,
    initialData,
    progressiveDone = false,
    contentDispositionFilename = null
  ) {
    this.length = length;
    this.initialData = initialData;
    this.progressiveDone = progressiveDone;
    this.contentDispositionFilename = contentDispositionFilename;

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
    unreachable("Abstract method PDFDataRangeTransport.requestDataRange");
  }

  abort() {}
}

/**
 * Proxy to a `PDFDocument` in the worker thread.
 */
class PDFDocumentProxy {
  constructor(pdfInfo, transport) {
    this._pdfInfo = pdfInfo;
    this._transport = transport;
  }

  /**
   * @type {AnnotationStorage} Storage for annotation data in forms.
   */
  get annotationStorage() {
    return this._transport.annotationStorage;
  }

  /**
   * @type {number} Total number of pages in the PDF file.
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
   * @type {boolean} True if only XFA form.
   */
  get isPureXfa() {
    return !!this._transport._htmlForXfa;
  }

  /**
   * NOTE: This is (mostly) intended to support printing of XFA forms.
   *
   * @type {Object | null} An object representing a HTML tree structure
   *   to render the XFA, or `null` when no XFA form exists.
   */
  get allXfaHtml() {
    return this._transport._htmlForXfa;
  }

  /**
   * @param {number} pageNumber - The page number to get. The first page is 1.
   * @returns {Promise<PDFPageProxy>} A promise that is resolved with
   *   a {@link PDFPageProxy} object.
   */
  getPage(pageNumber) {
    return this._transport.getPage(pageNumber);
  }

  /**
   * @param {RefProxy} ref - The page reference.
   * @returns {Promise<number>} A promise that is resolved with the page index,
   *   starting from zero, that is associated with the reference.
   */
  getPageIndex(ref) {
    return this._transport.getPageIndex(ref);
  }

  /**
   * @returns {Promise<Object<string, Array<any>>>} A promise that is resolved
   *   with a mapping from named destinations to references.
   *
   * This can be slow for large documents. Use `getDestination` instead.
   */
  getDestinations() {
    return this._transport.getDestinations();
  }

  /**
   * @param {string} id - The named destination to get.
   * @returns {Promise<Array<any> | null>} A promise that is resolved with all
   *   information of the given named destination, or `null` when the named
   *   destination is not present in the PDF file.
   */
  getDestination(id) {
    return this._transport.getDestination(id);
  }

  /**
   * @returns {Promise<Array<string> | null>} A promise that is resolved with
   *   an {Array} containing the page labels that correspond to the page
   *   indexes, or `null` when no page labels are present in the PDF file.
   */
  getPageLabels() {
    return this._transport.getPageLabels();
  }

  /**
   * @returns {Promise<string>} A promise that is resolved with a {string}
   *   containing the page layout name.
   */
  getPageLayout() {
    return this._transport.getPageLayout();
  }

  /**
   * @returns {Promise<string>} A promise that is resolved with a {string}
   *   containing the page mode name.
   */
  getPageMode() {
    return this._transport.getPageMode();
  }

  /**
   * @returns {Promise<Object | null>} A promise that is resolved with an
   *   {Object} containing the viewer preferences, or `null` when no viewer
   *   preferences are present in the PDF file.
   */
  getViewerPreferences() {
    return this._transport.getViewerPreferences();
  }

  /**
   * @returns {Promise<any | null>} A promise that is resolved with an {Array}
   *   containing the destination, or `null` when no open action is present
   *   in the PDF.
   */
  getOpenAction() {
    return this._transport.getOpenAction();
  }

  /**
   * @returns {Promise<any>} A promise that is resolved with a lookup table
   *   for mapping named attachments to their content.
   */
  getAttachments() {
    return this._transport.getAttachments();
  }

  /**
   * @returns {Promise<Array<string> | null>} A promise that is resolved with
   *   an {Array} of all the JavaScript strings in the name tree, or `null`
   *   if no JavaScript exists.
   */
  getJavaScript() {
    return this._transport.getJavaScript();
  }

  /**
   * @returns {Promise<Object | null>} A promise that is resolved with
   *   an {Object} with the JavaScript actions:
   *     - from the name tree (like getJavaScript);
   *     - from A or AA entries in the catalog dictionary.
   *   , or `null` if no JavaScript exists.
   */
  getJSActions() {
    return this._transport.getDocJSActions();
  }

  /**
   * @typedef {Object} OutlineNode
   * @property {string} title
   * @property {boolean} bold
   * @property {boolean} italic
   * @property {Uint8ClampedArray} color - The color in RGB format to use for
   *   display purposes.
   * @property {string | Array<any> | null} dest
   * @property {string | null} url
   * @property {string | undefined} unsafeUrl
   * @property {boolean | undefined} newWindow
   * @property {number | undefined} count
   * @property {Array<OutlineNode>} items
   */

  /**
   * @returns {Promise<Array<OutlineNode>>} A promise that is resolved with an
   *   {Array} that is a tree outline (if it has one) of the PDF file.
   */
  getOutline() {
    return this._transport.getOutline();
  }

  /**
   * @returns {Promise<OptionalContentConfig>} A promise that is resolved with
   *   an {@link OptionalContentConfig} that contains all the optional content
   *   groups (assuming that the document has any).
   */
  getOptionalContentConfig() {
    return this._transport.getOptionalContentConfig();
  }

  /**
   * @returns {Promise<Array<number> | null>} A promise that is resolved with
   *   an {Array} that contains the permission flags for the PDF document, or
   *   `null` when no permissions are present in the PDF file.
   */
  getPermissions() {
    return this._transport.getPermissions();
  }

  /**
   * @returns {Promise<{ info: Object, metadata: Metadata }>} A promise that is
   *   resolved with an {Object} that has `info` and `metadata` properties.
   *   `info` is an {Object} filled with anything available in the information
   *   dictionary and similarly `metadata` is a {Metadata} object with
   *   information from the metadata section of the PDF.
   */
  getMetadata() {
    return this._transport.getMetadata();
  }

  /**
   * @typedef {Object} MarkInfo
   * Properties correspond to Table 321 of the PDF 32000-1:2008 spec.
   * @property {boolean} Marked
   * @property {boolean} UserProperties
   * @property {boolean} Suspects
   */

  /**
   * @returns {Promise<MarkInfo | null>} A promise that is resolved with
   *   a {MarkInfo} object that contains the MarkInfo flags for the PDF
   *   document, or `null` when no MarkInfo values are present in the PDF file.
   */
  getMarkInfo() {
    return this._transport.getMarkInfo();
  }

  /**
   * @returns {Promise<TypedArray>} A promise that is resolved with a
   *   {TypedArray} that has the raw data from the PDF.
   */
  getData() {
    return this._transport.getData();
  }

  /**
   * @returns {Promise<{ length: number }>} A promise that is resolved when the
   *   document's data is loaded. It is resolved with an {Object} that contains
   *   the `length` property that indicates size of the PDF data in bytes.
   */
  getDownloadInfo() {
    return this._transport.downloadInfoCapability.promise;
  }

  /**
   * @typedef {Object} PDFDocumentStats
   * @property {Object<string, boolean>} streamTypes - Used stream types in the
   *   document (an item is set to true if specific stream ID was used in the
   *   document).
   * @property {Object<string, boolean>} fontTypes - Used font types in the
   *   document (an item is set to true if specific font ID was used in the
   *   document).
   */

  /**
   * @returns {Promise<PDFDocumentStats>} A promise this is resolved with
   *   current statistics about document structures (see
   *   {@link PDFDocumentStats}).
   */
  getStats() {
    return this._transport.getStats();
  }

  /**
   * Cleans up resources allocated by the document on both the main and worker
   * threads.
   *
   * NOTE: Do not, under any circumstances, call this method when rendering is
   * currently ongoing since that may lead to rendering errors.
   *
   * @param {boolean} [keepLoadedFonts] - Let fonts remain attached to the DOM.
   *   NOTE: This will increase persistent memory usage, hence don't use this
   *   option unless absolutely necessary. The default value is `false`.
   * @returns {Promise} A promise that is resolved when clean-up has finished.
   */
  cleanup(keepLoadedFonts = false) {
    return this._transport.startCleanup(keepLoadedFonts || this.isPureXfa);
  }

  /**
   * Destroys the current document instance and terminates the worker.
   */
  destroy() {
    return this.loadingTask.destroy();
  }

  /**
   * @type {DocumentInitParameters} A subset of the current
   *   {DocumentInitParameters}, which are needed in the viewer.
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

  /**
   * @returns {Promise<Uint8Array>} A promise that is resolved with a
   *   {Uint8Array} containing the full data of the saved document.
   */
  saveDocument() {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) &&
      this._transport.annotationStorage.size <= 0
    ) {
      deprecated(
        "saveDocument called while `annotationStorage` is empty, " +
          "please use the getData-method instead."
      );
    }
    return this._transport.saveDocument();
  }

  /**
   * @returns {Promise<Array<Object> | null>} A promise that is resolved with an
   *   {Array<Object>} containing /AcroForm field data for the JS sandbox,
   *   or `null` when no field data is present in the PDF file.
   */
  getFieldObjects() {
    return this._transport.getFieldObjects();
  }

  /**
   * @returns {Promise<boolean>} A promise that is resolved with `true`
   *   if some /AcroForm fields have JavaScript actions.
   */
  hasJSActions() {
    return this._transport.hasJSActions();
  }

  /**
   * @returns {Promise<Array<string> | null>} A promise that is resolved with an
   *   {Array<string>} containing IDs of annotations that have a calculation
   *   action, or `null` when no such annotations are present in the PDF file.
   */
  getCalculationOrderIds() {
    return this._transport.getCalculationOrderIds();
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
 * @property {boolean} normalizeWhitespace - Replaces all occurrences of
 *   whitespace with standard spaces (0x20). The default value is `false`.
 * @property {boolean} disableCombineTextItems - Do not attempt to combine
 *   same line {@link TextItem}'s. The default value is `false`.
 * @property {boolean} [includeMarkedContent] - When true include marked
 *   content items in the items array of TextContent. The default is `false`.
 */

/**
 * Page text content.
 *
 * @typedef {Object} TextContent
 * @property {Array<TextItem | TextMarkedContent>} items - Array of
 *   {@link TextItem} and {@link TextMarkedContent} objects. TextMarkedContent
 *   items are included when includeMarkedContent is true.
 * @property {Object<string, TextStyle>} styles - {@link TextStyle} objects,
 *   indexed by font name.
 */

/**
 * Page text content part.
 *
 * @typedef {Object} TextItem
 * @property {string} str - Text content.
 * @property {string} dir - Text direction: 'ttb', 'ltr' or 'rtl'.
 * @property {Array<any>} transform - Transformation matrix.
 * @property {number} width - Width in device space.
 * @property {number} height - Height in device space.
 * @property {string} fontName - Font name used by PDF.js for converted font.
 * @property {boolean} hasEOL - Indicating if the text content is followed by a
 *   line-break.
 */

/**
 * Page text marked content part.
 *
 * @typedef {Object} TextMarkedContent
 * @property {string} type - Either 'beginMarkedContent',
 *   'beginMarkedContentProps', or 'endMarkedContent'.
 * @property {string} id - The marked content identifier. Only used for type
 *   'beginMarkedContentProps'.
 */

/**
 * Text style.
 *
 * @typedef {Object} TextStyle
 * @property {number} ascent - Font ascent.
 * @property {number} descent - Font descent.
 * @property {boolean} vertical - Whether or not the text is in vertical mode.
 * @property {string} fontFamily - The possible font family.
 */

/**
 * Page annotation parameters.
 *
 * @typedef {Object} GetAnnotationsParameters
 * @property {string} intent - Determines the annotations that will be fetched,
 *   can be either 'display' (viewable annotations) or 'print' (printable
 *   annotations). If the parameter is omitted, all annotations are fetched.
 */

/**
 * Page render parameters.
 *
 * @typedef {Object} RenderParameters
 * @property {Object} canvasContext - A 2D context of a DOM Canvas object.
 * @property {PageViewport} viewport - Rendering viewport obtained by calling
 *   the `PDFPageProxy.getViewport` method.
 * @property {string} [intent] - Rendering intent, can be 'display' or 'print'.
 *   The default value is 'display'.
 * @property {boolean} [renderInteractiveForms] - Whether or not interactive
 *   form elements are rendered in the display layer. If so, we do not render
 *   them on the canvas as well. The default value is `false`.
 * @property {Array<any>} [transform] - Additional transform, applied just
 *   before viewport transform.
 * @property {Object} [imageLayer] - An object that has `beginLayout`,
 *   `endLayout` and `appendImage` functions.
 * @property {Object} [canvasFactory] - The factory instance that will be used
 *   when creating canvases. The default value is {new DOMCanvasFactory()}.
 * @property {Object | string} [background] - Background to use for the canvas.
 *   Any valid `canvas.fillStyle` can be used: a `DOMString` parsed as CSS
 *   <color> value, a `CanvasGradient` object (a linear or radial gradient) or
 *   a `CanvasPattern` object (a repetitive image). The default value is
 *   'rgb(255,255,255)'.
 * @property {boolean} [includeAnnotationStorage] - Render stored interactive
 *   form element data, from the {@link AnnotationStorage}-instance, onto the
 *   canvas itself; useful e.g. for printing. The default value is `false`.
 * @property {Promise<OptionalContentConfig>} [optionalContentConfigPromise] -
 *   A promise that should resolve with an {@link OptionalContentConfig}
 *   created from `PDFDocumentProxy.getOptionalContentConfig`. If `null`,
 *   the configuration will be fetched automatically with the default visibility
 *   states set.
 */

/**
 * Structure tree node. The root node will have a role "Root".
 *
 * @typedef {Object} StructTreeNode
 * @property {Array<StructTreeNode | StructTreeContent>} children - Array of
 *   {@link StructTreeNode} and {@link StructTreeContent} objects.
 * @property {string} role - element's role, already mapped if a role map exists
 * in the PDF.
 */

/**
 * Structure tree content.
 *
 * @typedef {Object} StructTreeContent
 * @property {string} type - either "content" for page and stream structure
 *   elements or "object" for object references.
 * @property {string} id - unique id that will map to the text layer.
 */

/**
 * PDF page operator list.
 *
 * @typedef {Object} PDFOperatorList
 * @property {Array<number>} fnArray - Array containing the operator functions.
 * @property {Array<any>} argsArray - Array containing the arguments of the
 *   functions.
 */

/**
 * Proxy to a `PDFPage` in the worker thread.
 */
class PDFPageProxy {
  constructor(pageIndex, pageInfo, transport, ownerDocument, pdfBug = false) {
    this._pageIndex = pageIndex;
    this._pageInfo = pageInfo;
    this._ownerDocument = ownerDocument;
    this._transport = transport;
    this._stats = pdfBug ? new StatTimer() : null;
    this._pdfBug = pdfBug;
    this.commonObjs = transport.commonObjs;
    this.objs = new PDFObjects();

    this.cleanupAfterRender = false;
    this.pendingCleanup = false;
    this._intentStates = new Map();
    this.destroyed = false;
  }

  /**
   * @type {number} Page number of the page. First page is 1.
   */
  get pageNumber() {
    return this._pageIndex + 1;
  }

  /**
   * @type {number} The number of degrees the page is rotated clockwise.
   */
  get rotate() {
    return this._pageInfo.rotate;
  }

  /**
   * @type {RefProxy | null} The reference that points to this page.
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
   * @type {Array<number>} An array of the visible portion of the PDF page in
   *   user space units [x1, y1, x2, y2].
   */
  get view() {
    return this._pageInfo.view;
  }

  /**
   * @param {GetViewportParameters} params - Viewport parameters.
   * @returns {PageViewport} Contains 'width' and 'height' properties
   *   along with transforms required for rendering.
   */
  getViewport({
    scale,
    rotation = this.rotate,
    offsetX = 0,
    offsetY = 0,
    dontFlip = false,
  } = {}) {
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
   * @returns {Promise<Array<any>>} A promise that is resolved with an
   *   {Array} of the annotation objects.
   */
  getAnnotations({ intent = null } = {}) {
    if (!this._annotationsPromise || this._annotationsIntent !== intent) {
      this._annotationsPromise = this._transport.getAnnotations(
        this._pageIndex,
        intent
      );
      this._annotationsIntent = intent;
    }
    return this._annotationsPromise;
  }

  /**
   * @returns {Promise<Object>} A promise that is resolved with an
   *   {Object} with JS actions.
   */
  getJSActions() {
    return (this._jsActionsPromise ||= this._transport.getPageJSActions(
      this._pageIndex
    ));
  }

  /**
   * @returns {Promise<Object | null>} A promise that is resolved with
   *   an {Object} with a fake DOM object (a tree structure where elements
   *   are {Object} with a name, attributes (class, style, ...), value and
   *   children, very similar to a HTML DOM tree), or `null` if no XFA exists.
   */
  async getXfa() {
    return this._transport._htmlForXfa?.children[this._pageIndex] || null;
  }

  /**
   * Begins the process of rendering a page to the desired context.
   *
   * @param {RenderParameters} params Page render parameters.
   * @returns {RenderTask} An object that contains a promise that is
   *   resolved when the page finishes rendering.
   */
  render({
    canvasContext,
    viewport,
    intent = "display",
    renderInteractiveForms = false,
    transform = null,
    imageLayer = null,
    canvasFactory = null,
    background = null,
    includeAnnotationStorage = false,
    optionalContentConfigPromise = null,
  }) {
    if (this._stats) {
      this._stats.time("Overall");
    }

    const renderingIntent = intent === "print" ? "print" : "display";
    // If there was a pending destroy, cancel it so no cleanup happens during
    // this call to render.
    this.pendingCleanup = false;

    if (!optionalContentConfigPromise) {
      optionalContentConfigPromise = this._transport.getOptionalContentConfig();
    }

    let intentState = this._intentStates.get(renderingIntent);
    if (!intentState) {
      intentState = Object.create(null);
      this._intentStates.set(renderingIntent, intentState);
    }

    // Ensure that a pending `streamReader` cancel timeout is always aborted.
    if (intentState.streamReaderCancelTimeout) {
      clearTimeout(intentState.streamReaderCancelTimeout);
      intentState.streamReaderCancelTimeout = null;
    }

    const canvasFactoryInstance =
      canvasFactory ||
      new DefaultCanvasFactory({ ownerDocument: this._ownerDocument });
    const annotationStorage = includeAnnotationStorage
      ? this._transport.annotationStorage.serializable
      : null;

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
        this._stats.time("Page Request");
      }
      this._pumpOperatorList({
        pageIndex: this._pageIndex,
        intent: renderingIntent,
        renderInteractiveForms: renderInteractiveForms === true,
        annotationStorage,
      });
    }

    const complete = error => {
      intentState.renderTasks.delete(internalRenderTask);

      // Attempt to reduce memory usage during *printing*, by always running
      // cleanup once rendering has finished (regardless of cleanupAfterRender).
      if (this.cleanupAfterRender || renderingIntent === "print") {
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
        this._stats.timeEnd("Rendering");
        this._stats.timeEnd("Overall");
      }
    };

    const internalRenderTask = new InternalRenderTask({
      callback: complete,
      // Only include the required properties, and *not* the entire object.
      params: {
        canvasContext,
        viewport,
        transform,
        imageLayer,
        background,
      },
      objs: this.objs,
      commonObjs: this.commonObjs,
      operatorList: intentState.operatorList,
      pageIndex: this._pageIndex,
      canvasFactory: canvasFactoryInstance,
      useRequestAnimationFrame: renderingIntent !== "print",
      pdfBug: this._pdfBug,
    });

    (intentState.renderTasks ||= new Set()).add(internalRenderTask);
    const renderTask = internalRenderTask.task;

    Promise.all([
      intentState.displayReadyCapability.promise,
      optionalContentConfigPromise,
    ])
      .then(([transparency, optionalContentConfig]) => {
        if (this.pendingCleanup) {
          complete();
          return;
        }
        if (this._stats) {
          this._stats.time("Rendering");
        }
        internalRenderTask.initializeGraphics({
          transparency,
          optionalContentConfig,
        });
        internalRenderTask.operatorListChanged();
      })
      .catch(complete);

    return renderTask;
  }

  /**
   * @returns {Promise<PDFOperatorList>} A promise resolved with an
   *   {@link PDFOperatorList} object that represents page's operator list.
   */
  getOperatorList() {
    function operatorListChanged() {
      if (intentState.operatorList.lastChunk) {
        intentState.opListReadCapability.resolve(intentState.operatorList);

        intentState.renderTasks.delete(opListTask);
      }
    }

    const renderingIntent = "oplist";
    let intentState = this._intentStates.get(renderingIntent);
    if (!intentState) {
      intentState = Object.create(null);
      this._intentStates.set(renderingIntent, intentState);
    }
    let opListTask;

    if (!intentState.opListReadCapability) {
      opListTask = Object.create(null);
      opListTask.operatorListChanged = operatorListChanged;
      intentState.opListReadCapability = createPromiseCapability();
      (intentState.renderTasks ||= new Set()).add(opListTask);
      intentState.operatorList = {
        fnArray: [],
        argsArray: [],
        lastChunk: false,
      };

      if (this._stats) {
        this._stats.time("Page Request");
      }
      this._pumpOperatorList({
        pageIndex: this._pageIndex,
        intent: renderingIntent,
      });
    }
    return intentState.opListReadCapability.promise;
  }

  /**
   * @param {getTextContentParameters} params - getTextContent parameters.
   * @returns {ReadableStream} Stream for reading text content chunks.
   */
  streamTextContent({
    normalizeWhitespace = false,
    disableCombineTextItems = false,
    includeMarkedContent = false,
  } = {}) {
    const TEXT_CONTENT_CHUNK_SIZE = 100;

    return this._transport.messageHandler.sendWithStream(
      "GetTextContent",
      {
        pageIndex: this._pageIndex,
        normalizeWhitespace: normalizeWhitespace === true,
        combineTextItems: disableCombineTextItems !== true,
        includeMarkedContent: includeMarkedContent === true,
      },
      {
        highWaterMark: TEXT_CONTENT_CHUNK_SIZE,
        size(textContent) {
          return textContent.items.length;
        },
      }
    );
  }

  /**
   * @param {getTextContentParameters} params - getTextContent parameters.
   * @returns {Promise<TextContent>} A promise that is resolved with a
   *   {@link TextContent} object that represents the page's text content.
   */
  getTextContent(params = {}) {
    const readableStream = this.streamTextContent(params);

    return new Promise(function (resolve, reject) {
      function pump() {
        reader.read().then(function ({ value, done }) {
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
   * @returns {Promise<StructTreeNode>} A promise that is resolved with a
   *   {@link StructTreeNode} object that represents the page's structure tree,
   *   or `null` when no structure tree is present for the current page.
   */
  getStructTree() {
    return (this._structTreePromise ||= this._transport.getStructTree(
      this._pageIndex
    ));
  }

  /**
   * Destroys the page object.
   * @private
   */
  _destroy() {
    this.destroyed = true;
    this._transport.pageCache[this._pageIndex] = null;

    const waitOn = [];
    for (const [intent, intentState] of this._intentStates) {
      this._abortOperatorList({
        intentState,
        reason: new Error("Page was destroyed."),
        force: true,
      });

      if (intent === "oplist") {
        // Avoid errors below, since the renderTasks are just stubs.
        continue;
      }
      for (const internalRenderTask of intentState.renderTasks) {
        waitOn.push(internalRenderTask.completed);
        internalRenderTask.cancel();
      }
    }
    this.objs.clear();
    this._annotationsPromise = null;
    this._jsActionsPromise = null;
    this._structTreePromise = null;
    this.pendingCleanup = false;
    return Promise.all(waitOn);
  }

  /**
   * Cleans up resources allocated by the page.
   *
   * @param {boolean} [resetStats] - Reset page stats, if enabled.
   *   The default value is `false`.
   * @returns {boolean} Indicates if clean-up was successfully run.
   */
  cleanup(resetStats = false) {
    this.pendingCleanup = true;
    return this._tryCleanup(resetStats);
  }

  /**
   * Attempts to clean up if rendering is in a state where that's possible.
   * @private
   */
  _tryCleanup(resetStats = false) {
    if (!this.pendingCleanup) {
      return false;
    }
    for (const { renderTasks, operatorList } of this._intentStates.values()) {
      if (renderTasks.size > 0 || !operatorList.lastChunk) {
        return false;
      }
    }

    this._intentStates.clear();
    this.objs.clear();
    this._annotationsPromise = null;
    this._jsActionsPromise = null;
    this._structTreePromise = null;
    if (resetStats && this._stats) {
      this._stats = new StatTimer();
    }
    this.pendingCleanup = false;
    return true;
  }

  /**
   * @private
   */
  _startRenderPage(transparency, intent) {
    const intentState = this._intentStates.get(intent);
    if (!intentState) {
      return; // Rendering was cancelled.
    }
    if (this._stats) {
      this._stats.timeEnd("Page Request");
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
      intentState.operatorList.argsArray.push(operatorListChunk.argsArray[i]);
    }
    intentState.operatorList.lastChunk = operatorListChunk.lastChunk;

    // Notify all the rendering tasks there are more operators to be consumed.
    for (const internalRenderTask of intentState.renderTasks) {
      internalRenderTask.operatorListChanged();
    }

    if (operatorListChunk.lastChunk) {
      this._tryCleanup();
    }
  }

  /**
   * @private
   */
  _pumpOperatorList(args) {
    assert(
      args.intent,
      'PDFPageProxy._pumpOperatorList: Expected "intent" argument.'
    );

    const readableStream = this._transport.messageHandler.sendWithStream(
      "GetOperatorList",
      args
    );
    const reader = readableStream.getReader();

    const intentState = this._intentStates.get(args.intent);
    intentState.streamReader = reader;

    const pump = () => {
      reader.read().then(
        ({ value, done }) => {
          if (done) {
            intentState.streamReader = null;
            return;
          }
          if (this._transport.destroyed) {
            return; // Ignore any pending requests if the worker was terminated.
          }
          this._renderPageChunk(value, intentState);
          pump();
        },
        reason => {
          intentState.streamReader = null;

          if (this._transport.destroyed) {
            return; // Ignore any pending requests if the worker was terminated.
          }
          if (intentState.operatorList) {
            // Mark operator list as complete.
            intentState.operatorList.lastChunk = true;

            for (const internalRenderTask of intentState.renderTasks) {
              internalRenderTask.operatorListChanged();
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
        }
      );
    };
    pump();
  }

  /**
   * @private
   */
  _abortOperatorList({ intentState, reason, force = false }) {
    assert(
      reason instanceof Error ||
        (typeof reason === "object" && reason !== null),
      'PDFPageProxy._abortOperatorList: Expected "reason" argument.'
    );

    if (!intentState.streamReader) {
      return;
    }
    if (!force) {
      // Ensure that an Error occurring in *only* one `InternalRenderTask`, e.g.
      // multiple render() calls on the same canvas, won't break all rendering.
      if (intentState.renderTasks.size > 0) {
        return;
      }
      // Don't immediately abort parsing on the worker-thread when rendering is
      // cancelled, since that will unnecessarily delay re-rendering when (for
      // partially parsed pages) e.g. zooming/rotation occurs in the viewer.
      if (reason instanceof RenderingCancelledException) {
        intentState.streamReaderCancelTimeout = setTimeout(() => {
          this._abortOperatorList({ intentState, reason, force: true });
          intentState.streamReaderCancelTimeout = null;
        }, RENDERING_CANCELLED_TIMEOUT);
        return;
      }
    }
    intentState.streamReader.cancel(new AbortException(reason?.message));
    intentState.streamReader = null;

    if (this._transport.destroyed) {
      return; // Ignore any pending requests if the worker was terminated.
    }
    // Remove the current `intentState`, since a cancelled `getOperatorList`
    // call on the worker-thread cannot be re-started...
    for (const [intent, curIntentState] of this._intentStates) {
      if (curIntentState === intentState) {
        this._intentStates.delete(intent);
        break;
      }
    }
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
  constructor() {
    this._listeners = [];
    this._deferred = Promise.resolve(undefined);
  }

  postMessage(obj, transfers) {
    function cloneValue(value) {
      // Trying to perform a structured clone close to the spec, including
      // transfers.
      if (typeof value !== "object" || value === null) {
        return value;
      }
      if (cloned.has(value)) {
        // already cloned the object
        return cloned.get(value);
      }
      let buffer, result;
      if ((buffer = value.buffer) && isArrayBuffer(buffer)) {
        // We found object with ArrayBuffer (typed array).
        if (transfers?.includes(buffer)) {
          result = new value.constructor(
            buffer,
            value.byteOffset,
            value.byteLength
          );
        } else {
          result = new value.constructor(value);
        }
        cloned.set(value, result);
        return result;
      }
      if (value instanceof Map) {
        result = new Map();
        cloned.set(value, result); // Adding to cache now for cyclic references.
        for (const [key, val] of value) {
          result.set(key, cloneValue(val));
        }
        return result;
      }
      if (value instanceof Set) {
        result = new Set();
        cloned.set(value, result); // Adding to cache now for cyclic references.
        for (const val of value) {
          result.add(cloneValue(val));
        }
        return result;
      }
      if (value instanceof URL) {
        throw new Error(`LoopbackPort.postMessage - cannot clone: ${value}`);
      }
      result = Array.isArray(value) ? [] : Object.create(null);
      cloned.set(value, result); // Adding to cache now for cyclic references.
      // Cloning all value and object properties, however ignoring properties
      // defined via getter.
      for (const i in value) {
        let desc,
          p = value;
        while (!(desc = Object.getOwnPropertyDescriptor(p, i))) {
          p = Object.getPrototypeOf(p);
        }
        if (typeof desc.value === "undefined") {
          continue;
        }
        if (typeof desc.value === "function") {
          if (value.hasOwnProperty?.(i)) {
            throw new Error(
              `LoopbackPort.postMessage - cannot clone: ${value[i]}`
            );
          }
          continue;
        }
        result[i] = cloneValue(desc.value);
      }
      return result;
    }

    const cloned = new WeakMap();
    const event = { data: cloneValue(obj) };

    this._deferred.then(() => {
      for (const listener of this._listeners) {
        listener.call(this, event);
      }
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
 * @property {Object} [port] - The `workerPort` object.
 * @property {number} [verbosity] - Controls the logging level; the
 *   constants from {@link VerbosityLevel} should be used.
 */

/** @type {any} */
const PDFWorker = (function PDFWorkerClosure() {
  const pdfWorkerPorts = new WeakMap();
  let isWorkerDisabled = false;
  let fallbackWorkerSrc;
  let nextFakeWorkerId = 0;
  let fakeWorkerCapability;

  if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("GENERIC")) {
    // eslint-disable-next-line no-undef
    if (isNodeJS && typeof __non_webpack_require__ === "function") {
      // Workers aren't supported in Node.js, force-disabling them there.
      isWorkerDisabled = true;

      if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("LIB")) {
        fallbackWorkerSrc = "../pdf.worker.js";
      } else {
        fallbackWorkerSrc = "./pdf.worker.js";
      }
    } else if (typeof document === "object" && "currentScript" in document) {
      const pdfjsFilePath = document.currentScript?.src;
      if (pdfjsFilePath) {
        fallbackWorkerSrc = pdfjsFilePath.replace(
          /(\.(?:min\.)?js)(\?.*)?$/i,
          ".worker$1$2"
        );
      }
    }
  }

  function getWorkerSrc() {
    if (GlobalWorkerOptions.workerSrc) {
      return GlobalWorkerOptions.workerSrc;
    }
    if (typeof fallbackWorkerSrc !== "undefined") {
      if (!isNodeJS) {
        deprecated('No "GlobalWorkerOptions.workerSrc" specified.');
      }
      return fallbackWorkerSrc;
    }
    throw new Error('No "GlobalWorkerOptions.workerSrc" specified.');
  }

  function getMainThreadWorkerMessageHandler() {
    let mainWorkerMessageHandler;
    try {
      mainWorkerMessageHandler = globalThis.pdfjsWorker?.WorkerMessageHandler;
    } catch (ex) {
      /* Ignore errors. */
    }
    return mainWorkerMessageHandler || null;
  }

  // Loads worker code into main thread.
  function setupFakeWorkerGlobal() {
    if (fakeWorkerCapability) {
      return fakeWorkerCapability.promise;
    }
    fakeWorkerCapability = createPromiseCapability();

    const loader = async function () {
      const mainWorkerMessageHandler = getMainThreadWorkerMessageHandler();

      if (mainWorkerMessageHandler) {
        // The worker was already loaded using e.g. a `<script>` tag.
        return mainWorkerMessageHandler;
      }
      if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("PRODUCTION")) {
        const worker = await import("pdfjs/core/worker.js");
        return worker.WorkerMessageHandler;
      }
      if (
        PDFJSDev.test("GENERIC") &&
        isNodeJS &&
        // eslint-disable-next-line no-undef
        typeof __non_webpack_require__ === "function"
      ) {
        // Since bundlers, such as Webpack, cannot be told to leave `require`
        // statements alone we are thus forced to jump through hoops in order
        // to prevent `Critical dependency: ...` warnings in third-party
        // deployments of the built `pdf.js`/`pdf.worker.js` files; see
        // https://github.com/webpack/webpack/issues/8826
        //
        // The following hack is based on the assumption that code running in
        // Node.js won't ever be affected by e.g. Content Security Policies that
        // prevent the use of `eval`. If that ever occurs, we should revert this
        // to a normal `__non_webpack_require__` statement and simply document
        // the Webpack warnings instead (telling users to ignore them).
        //
        // eslint-disable-next-line no-eval
        const worker = eval("require")(getWorkerSrc());
        return worker.WorkerMessageHandler;
      }
      await loadScript(getWorkerSrc());
      return window.pdfjsWorker.WorkerMessageHandler;
    };
    loader().then(fakeWorkerCapability.resolve, fakeWorkerCapability.reject);

    return fakeWorkerCapability.promise;
  }

  function createCDNWrapper(url) {
    // We will rely on blob URL's property to specify origin.
    // We want this function to fail in case if createObjectURL or Blob do not
    // exist or fail for some reason -- our Worker creation will fail anyway.
    const wrapper = "importScripts('" + url + "');";
    return URL.createObjectURL(new Blob([wrapper]));
  }

  /**
   * PDF.js web worker abstraction that controls the instantiation of PDF
   * documents. Message handlers are used to pass information from the main
   * thread to the worker thread and vice versa. If the creation of a web
   * worker is not possible, a "fake" worker will be used instead.
   */
  // eslint-disable-next-line no-shadow
  class PDFWorker {
    /**
     * @param {PDFWorkerParameters} params - Worker initialization parameters.
     */
    constructor({
      name = null,
      port = null,
      verbosity = getVerbosityLevel(),
    } = {}) {
      if (port && pdfWorkerPorts.has(port)) {
        throw new Error("Cannot use more than one PDFWorker per port");
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
      this._messageHandler = new MessageHandler("main", "worker", port);
      this._messageHandler.on("ready", function () {
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
      if (
        typeof Worker !== "undefined" &&
        !isWorkerDisabled &&
        !getMainThreadWorkerMessageHandler()
      ) {
        let workerSrc = getWorkerSrc();

        try {
          // Wraps workerSrc path into blob URL, if the former does not belong
          // to the same origin.
          if (
            typeof PDFJSDev !== "undefined" &&
            PDFJSDev.test("GENERIC") &&
            !isSameOrigin(window.location.href, workerSrc)
          ) {
            workerSrc = createCDNWrapper(
              new URL(workerSrc, window.location).href
            );
          }

          // Some versions of FF can't create a worker on localhost, see:
          // https://bugzilla.mozilla.org/show_bug.cgi?id=683280
          const worker = new Worker(workerSrc);
          const messageHandler = new MessageHandler("main", "worker", worker);
          const terminateEarly = () => {
            worker.removeEventListener("error", onWorkerError);
            messageHandler.destroy();
            worker.terminate();
            if (this.destroyed) {
              this._readyCapability.reject(new Error("Worker was destroyed"));
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
          worker.addEventListener("error", onWorkerError);

          messageHandler.on("test", data => {
            worker.removeEventListener("error", onWorkerError);
            if (this.destroyed) {
              terminateEarly();
              return; // worker was destroyed
            }
            if (data) {
              // supportTypedArray
              this._messageHandler = messageHandler;
              this._port = worker;
              this._webWorker = worker;
              if (!data.supportTransfers) {
                this.postMessageTransfers = false;
              }
              this._readyCapability.resolve();
              // Send global setting, e.g. verbosity level.
              messageHandler.send("configure", {
                verbosity: this.verbosity,
              });
            } else {
              this._setupFakeWorker();
              messageHandler.destroy();
              worker.terminate();
            }
          });

          messageHandler.on("ready", data => {
            worker.removeEventListener("error", onWorkerError);
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
            const testObj = new Uint8Array([
              this.postMessageTransfers ? 255 : 0,
            ]);
            // Some versions of Opera throw a DATA_CLONE_ERR on serializing the
            // typed array. Also, checking if we can use transfers.
            try {
              messageHandler.send("test", testObj, [testObj.buffer]);
            } catch (ex) {
              warn("Cannot use postMessage transfers.");
              testObj[0] = 0;
              messageHandler.send("test", testObj);
            }
          };

          // It might take time for worker to initialize (especially when AMD
          // loader is used). We will try to send test immediately, and then
          // when 'ready' message will arrive. The worker shall process only
          // first received 'test'.
          sendTest();
          return;
        } catch (e) {
          info("The worker has been disabled.");
        }
      }
      // Either workers are disabled, not supported or have thrown an exception.
      // Thus, we fallback to a faked worker.
      this._setupFakeWorker();
    }

    _setupFakeWorker() {
      if (!isWorkerDisabled) {
        warn("Setting up fake worker.");
        isWorkerDisabled = true;
      }

      setupFakeWorkerGlobal()
        .then(WorkerMessageHandler => {
          if (this.destroyed) {
            this._readyCapability.reject(new Error("Worker was destroyed"));
            return;
          }
          const port = new LoopbackPort();
          this._port = port;

          // All fake workers use the same port, making id unique.
          const id = "fake" + nextFakeWorkerId++;

          // If the main thread is our worker, setup the handling for the
          // messages -- the main thread sends to it self.
          const workerHandler = new MessageHandler(id + "_worker", id, port);
          WorkerMessageHandler.setup(workerHandler, port);

          const messageHandler = new MessageHandler(id, id + "_worker", port);
          this._messageHandler = messageHandler;
          this._readyCapability.resolve();
          // Send global setting, e.g. verbosity level.
          messageHandler.send("configure", {
            verbosity: this.verbosity,
          });
        })
        .catch(reason => {
          this._readyCapability.reject(
            new Error(`Setting up fake worker failed: "${reason.message}".`)
          );
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
     *   parameters.
     */
    static fromPort(params) {
      if (!params || !params.port) {
        throw new Error("PDFWorker.fromPort - invalid method signature.");
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
      ownerDocument: params.ownerDocument,
      styleElement: params.styleElement,
    });
    this._params = params;

    if (!params.useWorkerFetch) {
      this.CMapReaderFactory = new params.CMapReaderFactory({
        baseUrl: params.cMapUrl,
        isCompressed: params.cMapPacked,
      });
      this.StandardFontDataFactory = new params.StandardFontDataFactory({
        baseUrl: params.standardFontDataUrl,
      });
    }

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

  get annotationStorage() {
    return shadow(this, "annotationStorage", new AnnotationStorage());
  }

  destroy() {
    if (this.destroyCapability) {
      return this.destroyCapability.promise;
    }

    this.destroyed = true;
    this.destroyCapability = createPromiseCapability();

    if (this._passwordCapability) {
      this._passwordCapability.reject(
        new Error("Worker was destroyed during onPassword callback")
      );
    }

    const waitOn = [];
    // We need to wait for all renderings to be completed, e.g.
    // timeout/rAF can take a long time.
    for (const page of this.pageCache) {
      if (page) {
        waitOn.push(page._destroy());
      }
    }
    this.pageCache.length = 0;
    this.pagePromises.length = 0;
    // Allow `AnnotationStorage`-related clean-up when destroying the document.
    if (this.hasOwnProperty("annotationStorage")) {
      this.annotationStorage.resetModified();
    }
    // We also need to wait for the worker to finish its long running tasks.
    const terminated = this.messageHandler.sendWithPromise("Terminate", null);
    waitOn.push(terminated);

    Promise.all(waitOn).then(() => {
      this.commonObjs.clear();
      this.fontLoader.clear();
      this._hasJSActionsPromise = null;

      if (this._networkStream) {
        this._networkStream.cancelAllRequests(
          new AbortException("Worker was terminated.")
        );
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
    const { messageHandler, loadingTask } = this;

    messageHandler.on("GetReader", (data, sink) => {
      assert(
        this._networkStream,
        "GetReader - no `IPDFStream` instance available."
      );
      this._fullReader = this._networkStream.getFullReader();
      this._fullReader.onProgress = evt => {
        this._lastProgress = {
          loaded: evt.loaded,
          total: evt.total,
        };
      };
      sink.onPull = () => {
        this._fullReader
          .read()
          .then(function ({ value, done }) {
            if (done) {
              sink.close();
              return;
            }
            assert(
              isArrayBuffer(value),
              "GetReader - expected an ArrayBuffer."
            );
            // Enqueue data chunk into sink, and transfer it
            // to other side as `Transferable` object.
            sink.enqueue(new Uint8Array(value), 1, [value]);
          })
          .catch(reason => {
            sink.error(reason);
          });
      };

      sink.onCancel = reason => {
        this._fullReader.cancel(reason);

        sink.ready.catch(readyReason => {
          if (this.destroyed) {
            return; // Ignore any pending requests if the worker was terminated.
          }
          throw readyReason;
        });
      };
    });

    messageHandler.on("ReaderHeadersReady", data => {
      const headersCapability = createPromiseCapability();
      const fullReader = this._fullReader;
      fullReader.headersReady.then(() => {
        // If stream or range are disabled, it's our only way to report
        // loading progress.
        if (!fullReader.isStreamingSupported || !fullReader.isRangeSupported) {
          if (this._lastProgress && loadingTask.onProgress) {
            loadingTask.onProgress(this._lastProgress);
          }
          fullReader.onProgress = evt => {
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

    messageHandler.on("GetRangeReader", (data, sink) => {
      assert(
        this._networkStream,
        "GetRangeReader - no `IPDFStream` instance available."
      );
      const rangeReader = this._networkStream.getRangeReader(
        data.begin,
        data.end
      );

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
        rangeReader
          .read()
          .then(function ({ value, done }) {
            if (done) {
              sink.close();
              return;
            }
            assert(
              isArrayBuffer(value),
              "GetRangeReader - expected an ArrayBuffer."
            );
            sink.enqueue(new Uint8Array(value), 1, [value]);
          })
          .catch(reason => {
            sink.error(reason);
          });
      };

      sink.onCancel = reason => {
        rangeReader.cancel(reason);

        sink.ready.catch(readyReason => {
          if (this.destroyed) {
            return; // Ignore any pending requests if the worker was terminated.
          }
          throw readyReason;
        });
      };
    });

    messageHandler.on("GetDoc", ({ pdfInfo }) => {
      this._numPages = pdfInfo.numPages;
      this._htmlForXfa = pdfInfo.htmlForXfa;
      delete pdfInfo.htmlForXfa;
      loadingTask._capability.resolve(new PDFDocumentProxy(pdfInfo, this));
    });

    messageHandler.on("DocException", function (ex) {
      let reason;
      switch (ex.name) {
        case "PasswordException":
          reason = new PasswordException(ex.message, ex.code);
          break;
        case "InvalidPDFException":
          reason = new InvalidPDFException(ex.message);
          break;
        case "MissingPDFException":
          reason = new MissingPDFException(ex.message);
          break;
        case "UnexpectedResponseException":
          reason = new UnexpectedResponseException(ex.message, ex.status);
          break;
        case "UnknownErrorException":
          reason = new UnknownErrorException(ex.message, ex.details);
          break;
      }
      if (!(reason instanceof Error)) {
        const msg = "DocException - expected a valid Error.";
        if (
          typeof PDFJSDev === "undefined" ||
          PDFJSDev.test("!PRODUCTION || TESTING")
        ) {
          unreachable(msg);
        } else {
          warn(msg);
        }
      }
      loadingTask._capability.reject(reason);
    });

    messageHandler.on("PasswordRequest", exception => {
      this._passwordCapability = createPromiseCapability();

      if (loadingTask.onPassword) {
        const updatePassword = password => {
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
          new PasswordException(exception.message, exception.code)
        );
      }
      return this._passwordCapability.promise;
    });

    messageHandler.on("DataLoaded", data => {
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

    messageHandler.on("StartRenderPage", data => {
      if (this.destroyed) {
        return; // Ignore any pending requests if the worker was terminated.
      }

      const page = this.pageCache[data.pageIndex];
      page._startRenderPage(data.transparency, data.intent);
    });

    messageHandler.on("commonobj", data => {
      if (this.destroyed) {
        return; // Ignore any pending requests if the worker was terminated.
      }

      const [id, type, exportedData] = data;
      if (this.commonObjs.has(id)) {
        return;
      }

      switch (type) {
        case "Font":
          const params = this._params;

          if ("error" in exportedData) {
            const exportedError = exportedData.error;
            warn(`Error during font loading: ${exportedError}`);
            this.commonObjs.resolve(id, exportedError);
            break;
          }

          let fontRegistry = null;
          if (params.pdfBug && globalThis.FontInspector?.enabled) {
            fontRegistry = {
              registerFont(font, url) {
                globalThis.FontInspector.fontAdded(font, url);
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

          this.fontLoader
            .bind(font)
            .catch(reason => {
              return messageHandler.sendWithPromise("FontFallback", { id });
            })
            .finally(() => {
              if (!params.fontExtraProperties && font.data) {
                // Immediately release the `font.data` property once the font
                // has been attached to the DOM, since it's no longer needed,
                // rather than waiting for a `PDFDocumentProxy.cleanup` call.
                // Since `font.data` could be very large, e.g. in some cases
                // multiple megabytes, this will help reduce memory usage.
                font.data = null;
              }
              this.commonObjs.resolve(id, font);
            });
          break;
        case "FontPath":
        case "Image":
          this.commonObjs.resolve(id, exportedData);
          break;
        default:
          throw new Error(`Got unknown common object type ${type}`);
      }
    });

    messageHandler.on("obj", data => {
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
        case "Image":
          pageProxy.objs.resolve(id, imageData);

          // Heuristic that will allow us not to store large data.
          const MAX_IMAGE_SIZE_TO_STORE = 8000000;
          if (imageData?.data?.length > MAX_IMAGE_SIZE_TO_STORE) {
            pageProxy.cleanupAfterRender = true;
          }
          break;
        default:
          throw new Error(`Got unknown object type ${type}`);
      }
      return undefined;
    });

    messageHandler.on("DocProgress", data => {
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

    messageHandler.on(
      "UnsupportedFeature",
      this._onUnsupportedFeature.bind(this)
    );

    messageHandler.on("FetchBuiltInCMap", data => {
      if (this.destroyed) {
        return Promise.reject(new Error("Worker was destroyed."));
      }
      if (!this.CMapReaderFactory) {
        return Promise.reject(
          new Error(
            "CMapReaderFactory not initialized, see the `useWorkerFetch` parameter."
          )
        );
      }
      return this.CMapReaderFactory.fetch(data);
    });

    messageHandler.on("FetchStandardFontData", data => {
      if (this.destroyed) {
        return Promise.reject(new Error("Worker was destroyed."));
      }
      if (!this.StandardFontDataFactory) {
        return Promise.reject(
          new Error(
            "StandardFontDataFactory not initialized, see the `useWorkerFetch` parameter."
          )
        );
      }
      return this.StandardFontDataFactory.fetch(data);
    });
  }

  _onUnsupportedFeature({ featureId }) {
    if (this.destroyed) {
      return; // Ignore any pending requests if the worker was terminated.
    }
    if (this.loadingTask.onUnsupportedFeature) {
      this.loadingTask.onUnsupportedFeature(featureId);
    }
  }

  getData() {
    return this.messageHandler.sendWithPromise("GetData", null);
  }

  getPage(pageNumber) {
    if (
      !Number.isInteger(pageNumber) ||
      pageNumber <= 0 ||
      pageNumber > this._numPages
    ) {
      return Promise.reject(new Error("Invalid page request"));
    }

    const pageIndex = pageNumber - 1;
    if (pageIndex in this.pagePromises) {
      return this.pagePromises[pageIndex];
    }
    const promise = this.messageHandler
      .sendWithPromise("GetPage", {
        pageIndex,
      })
      .then(pageInfo => {
        if (this.destroyed) {
          throw new Error("Transport destroyed");
        }
        const page = new PDFPageProxy(
          pageIndex,
          pageInfo,
          this,
          this._params.ownerDocument,
          this._params.pdfBug
        );
        this.pageCache[pageIndex] = page;
        return page;
      });
    this.pagePromises[pageIndex] = promise;
    return promise;
  }

  getPageIndex(ref) {
    return this.messageHandler
      .sendWithPromise("GetPageIndex", {
        ref,
      })
      .catch(function (reason) {
        return Promise.reject(new Error(reason));
      });
  }

  getAnnotations(pageIndex, intent) {
    return this.messageHandler.sendWithPromise("GetAnnotations", {
      pageIndex,
      intent,
    });
  }

  saveDocument() {
    return this.messageHandler
      .sendWithPromise("SaveDocument", {
        isPureXfa: !!this._htmlForXfa,
        numPages: this._numPages,
        annotationStorage: this.annotationStorage.serializable,
        filename: this._fullReader?.filename ?? null,
      })
      .finally(() => {
        this.annotationStorage.resetModified();
      });
  }

  getFieldObjects() {
    return this.messageHandler.sendWithPromise("GetFieldObjects", null);
  }

  hasJSActions() {
    return (this._hasJSActionsPromise ||= this.messageHandler.sendWithPromise(
      "HasJSActions",
      null
    ));
  }

  getCalculationOrderIds() {
    return this.messageHandler.sendWithPromise("GetCalculationOrderIds", null);
  }

  getDestinations() {
    return this.messageHandler.sendWithPromise("GetDestinations", null);
  }

  getDestination(id) {
    if (typeof id !== "string") {
      return Promise.reject(new Error("Invalid destination request."));
    }
    return this.messageHandler.sendWithPromise("GetDestination", {
      id,
    });
  }

  getPageLabels() {
    return this.messageHandler.sendWithPromise("GetPageLabels", null);
  }

  getPageLayout() {
    return this.messageHandler.sendWithPromise("GetPageLayout", null);
  }

  getPageMode() {
    return this.messageHandler.sendWithPromise("GetPageMode", null);
  }

  getViewerPreferences() {
    return this.messageHandler.sendWithPromise("GetViewerPreferences", null);
  }

  getOpenAction() {
    return this.messageHandler.sendWithPromise("GetOpenAction", null);
  }

  getAttachments() {
    return this.messageHandler.sendWithPromise("GetAttachments", null);
  }

  getJavaScript() {
    return this.messageHandler.sendWithPromise("GetJavaScript", null);
  }

  getDocJSActions() {
    return this.messageHandler.sendWithPromise("GetDocJSActions", null);
  }

  getPageJSActions(pageIndex) {
    return this.messageHandler.sendWithPromise("GetPageJSActions", {
      pageIndex,
    });
  }

  getStructTree(pageIndex) {
    return this.messageHandler.sendWithPromise("GetStructTree", {
      pageIndex,
    });
  }

  getOutline() {
    return this.messageHandler.sendWithPromise("GetOutline", null);
  }

  getOptionalContentConfig() {
    return this.messageHandler
      .sendWithPromise("GetOptionalContentConfig", null)
      .then(results => {
        return new OptionalContentConfig(results);
      });
  }

  getPermissions() {
    return this.messageHandler.sendWithPromise("GetPermissions", null);
  }

  getMetadata() {
    return this.messageHandler
      .sendWithPromise("GetMetadata", null)
      .then(results => {
        return {
          info: results[0],
          metadata: results[1] ? new Metadata(results[1]) : null,
          contentDispositionFilename: this._fullReader?.filename ?? null,
          contentLength: this._fullReader?.contentLength ?? null,
        };
      });
  }

  getMarkInfo() {
    return this.messageHandler.sendWithPromise("GetMarkInfo", null);
  }

  getStats() {
    return this.messageHandler.sendWithPromise("GetStats", null);
  }

  async startCleanup(keepLoadedFonts = false) {
    await this.messageHandler.sendWithPromise("Cleanup", null);

    if (this.destroyed) {
      return; // No need to manually clean-up when destruction has started.
    }
    for (let i = 0, ii = this.pageCache.length; i < ii; i++) {
      const page = this.pageCache[i];
      if (!page) {
        continue;
      }
      const cleanupSuccessful = page.cleanup();

      if (!cleanupSuccessful) {
        throw new Error(`startCleanup: Page ${i + 1} is currently rendering.`);
      }
    }
    this.commonObjs.clear();
    if (!keepLoadedFonts) {
      this.fontLoader.clear();
    }
    this._hasJSActionsPromise = null;
  }

  get loadingParams() {
    const params = this._params;
    return shadow(this, "loadingParams", {
      disableAutoFetch: params.disableAutoFetch,
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
    return (this._objs[objId] = {
      capability: createPromiseCapability(),
      data: null,
      resolved: false,
    });
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
    return obj?.resolved || false;
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
    this._objs = Object.create(null);
  }
}

/**
 * Allows controlling of the rendering tasks.
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
   * @type {Promise<void>}
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
}

/**
 * For internal use only.
 * @ignore
 */
const InternalRenderTask = (function InternalRenderTaskClosure() {
  const canvasInRendering = new WeakSet();

  // eslint-disable-next-line no-shadow
  class InternalRenderTask {
    constructor({
      callback,
      params,
      objs,
      commonObjs,
      operatorList,
      pageIndex,
      canvasFactory,
      useRequestAnimationFrame = false,
      pdfBug = false,
    }) {
      this.callback = callback;
      this.params = params;
      this.objs = objs;
      this.commonObjs = commonObjs;
      this.operatorListIdx = null;
      this.operatorList = operatorList;
      this._pageIndex = pageIndex;
      this.canvasFactory = canvasFactory;
      this._pdfBug = pdfBug;

      this.running = false;
      this.graphicsReadyCallback = null;
      this.graphicsReady = false;
      this._useRequestAnimationFrame =
        useRequestAnimationFrame === true && typeof window !== "undefined";
      this.cancelled = false;
      this.capability = createPromiseCapability();
      this.task = new RenderTask(this);
      // caching this-bound methods
      this._cancelBound = this.cancel.bind(this);
      this._continueBound = this._continue.bind(this);
      this._scheduleNextBound = this._scheduleNext.bind(this);
      this._nextBound = this._next.bind(this);
      this._canvas = params.canvasContext.canvas;
    }

    get completed() {
      return this.capability.promise.catch(function () {
        // Ignoring errors, since we only want to know when rendering is
        // no longer pending.
      });
    }

    initializeGraphics({ transparency = false, optionalContentConfig }) {
      if (this.cancelled) {
        return;
      }
      if (this._canvas) {
        if (canvasInRendering.has(this._canvas)) {
          throw new Error(
            "Cannot use the same canvas during multiple render() operations. " +
              "Use different canvas or ensure previous operations were " +
              "cancelled or completed."
          );
        }
        canvasInRendering.add(this._canvas);
      }

      if (this._pdfBug && globalThis.StepperManager?.enabled) {
        this.stepper = globalThis.StepperManager.create(this._pageIndex);
        this.stepper.init(this.operatorList);
        this.stepper.nextBreakPoint = this.stepper.getNextBreakPoint();
      }
      const { canvasContext, viewport, transform, imageLayer, background } =
        this.params;

      this.gfx = new CanvasGraphics(
        canvasContext,
        this.commonObjs,
        this.objs,
        this.canvasFactory,
        imageLayer,
        optionalContentConfig
      );
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
      this.callback(
        error ||
          new RenderingCancelledException(
            `Rendering cancelled, page ${this._pageIndex + 1}`,
            "canvas"
          )
      );
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
          this._nextBound().catch(this._cancelBound);
        });
      } else {
        Promise.resolve().then(this._nextBound).catch(this._cancelBound);
      }
    }

    async _next() {
      if (this.cancelled) {
        return;
      }
      this.operatorListIdx = this.gfx.executeOperatorList(
        this.operatorList,
        this.operatorListIdx,
        this._continueBound,
        this.stepper
      );
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

/** @type {string} */
const version =
  typeof PDFJSDev !== "undefined" ? PDFJSDev.eval("BUNDLE_VERSION") : null;
/** @type {string} */
const build =
  typeof PDFJSDev !== "undefined" ? PDFJSDev.eval("BUNDLE_BUILD") : null;

export {
  build,
  DefaultCanvasFactory,
  DefaultCMapReaderFactory,
  DefaultStandardFontDataFactory,
  getDocument,
  LoopbackPort,
  PDFDataRangeTransport,
  PDFDocumentProxy,
  PDFPageProxy,
  PDFWorker,
  setPDFNetworkStreamFactory,
  version,
};
