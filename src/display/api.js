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
  AnnotationMode,
  assert,
  FeatureTest,
  getVerbosityLevel,
  info,
  isNodeJS,
  RenderingIntentFlag,
  setVerbosityLevel,
  shadow,
  stringToBytes,
  unreachable,
  warn,
} from "../shared/util.js";
import {
  AnnotationStorage,
  PrintAnnotationStorage,
  SerializableEmpty,
} from "./annotation_storage.js";
import { FontFaceObject, FontLoader } from "./font_loader.js";
import {
  isDataScheme,
  isValidFetchUrl,
  PageViewport,
  RenderingCancelledException,
  StatTimer,
} from "./display_utils.js";
import { MessageHandler, wrapReason } from "../shared/message_handler.js";
import {
  NodeCanvasFactory,
  NodeCMapReaderFactory,
  NodeFilterFactory,
  NodeStandardFontDataFactory,
  NodeWasmFactory,
} from "display-node_utils";
import { CanvasGraphics } from "./canvas.js";
import { DOMCanvasFactory } from "./canvas_factory.js";
import { DOMCMapReaderFactory } from "display-cmap_reader_factory";
import { DOMFilterFactory } from "./filter_factory.js";
import { DOMStandardFontDataFactory } from "display-standard_fontdata_factory";
import { DOMWasmFactory } from "display-wasm_factory";
import { GlobalWorkerOptions } from "./worker_options.js";
import { Metadata } from "./metadata.js";
import { OptionalContentConfig } from "./optional_content_config.js";
import { PDFDataTransportStream } from "./transport_stream.js";
import { PDFFetchStream } from "display-fetch_stream";
import { PDFNetworkStream } from "display-network";
import { PDFNodeStream } from "display-node_stream";
import { TextLayer } from "./text_layer.js";
import { XfaText } from "./xfa_text.js";

const DEFAULT_RANGE_CHUNK_SIZE = 65536; // 2^16 = 65536
const RENDERING_CANCELLED_TIMEOUT = 100; // ms

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
 * @property {string | URL} [url] - The URL of the PDF.
 * @property {TypedArray | ArrayBuffer | Array<number> | string} [data] -
 *   Binary PDF data.
 *   Use TypedArrays (Uint8Array) to improve the memory usage. If PDF data is
 *   BASE64-encoded, use `atob()` to convert it to a binary string first.
 *
 *   NOTE: If TypedArrays are used they will generally be transferred to the
 *   worker-thread. This will help reduce main-thread memory usage, however
 *   it will take ownership of the TypedArrays.
 * @property {Object} [httpHeaders] - Basic authentication headers.
 * @property {boolean} [withCredentials] - Indicates whether or not
 *   cross-site Access-Control requests should be made using credentials such
 *   as cookies or authorization headers. The default is `false`.
 * @property {string} [password] - For decrypting password-protected PDFs.
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
 *   packed or not. The default value is `true`.
 * @property {Object} [CMapReaderFactory] - The factory that will be used when
 *   reading built-in CMap files.
 *   The default value is {DOMCMapReaderFactory}.
 * @property {boolean} [useSystemFonts] - When `true`, fonts that aren't
 *   embedded in the PDF document will fallback to a system font.
 *   The default value is `true` in web environments and `false` in Node.js;
 *   unless `disableFontFace === true` in which case this defaults to `false`
 *   regardless of the environment (to prevent completely broken fonts).
 * @property {string} [standardFontDataUrl] - The URL where the standard font
 *   files are located. Include the trailing slash.
 * @property {Object} [StandardFontDataFactory] - The factory that will be used
 *   when reading the standard font files.
 *   The default value is {DOMStandardFontDataFactory}.
 * @property {string} [wasmUrl] - The URL where the wasm files are located.
 *   Include the trailing slash.
 * @property {Object} [WasmFactory] - The factory that will be used
 *   when reading the wasm files.
 *   The default value is {DOMWasmFactory}.
 * @property {boolean} [useWorkerFetch] - Enable using the Fetch API in the
 *   worker-thread when reading CMap and standard font files. When `true`,
 *   the `CMapReaderFactory`, `StandardFontDataFactory`, and `WasmFactory`
 *   options are ignored.
 *   The default value is `true` in web environments and `false` in Node.js.
 * @property {boolean} [useWasm] - Attempt to use WebAssembly in order to
 *    improve e.g. image decoding performance.
 *    The default value is `true`.
 * @property {boolean} [stopAtErrors] - Reject certain promises, e.g.
 *   `getOperatorList`, `getTextContent`, and `RenderTask`, when the associated
 *   PDF data cannot be successfully parsed, instead of attempting to recover
 *   whatever possible of the data. The default value is `false`.
 * @property {number} [maxImageSize] - The maximum allowed image size in total
 *   pixels, i.e. width * height. Images above this value will not be rendered.
 *   Use -1 for no limit, which is also the default value.
 * @property {boolean} [isEvalSupported] - Determines if we can evaluate strings
 *   as JavaScript. Primarily used to improve performance of PDF functions.
 *   The default value is `true`.
 * @property {boolean} [isOffscreenCanvasSupported] - Determines if we can use
 *   `OffscreenCanvas` in the worker. Primarily used to improve performance of
 *   image conversion/rendering.
 *   The default value is `true` in web environments and `false` in Node.js.
 * @property {boolean} [isImageDecoderSupported] - Determines if we can use
 *   `ImageDecoder` in the worker. Primarily used to improve performance of
 *   image conversion/rendering.
 *   The default value is `true` in web environments and `false` in Node.js.
 *
 *   NOTE: Also temporarily disabled in Chromium browsers, until we no longer
 *   support the affected browser versions, because of various bugs:
 *
 *    - Crashes when using the BMP decoder with huge images, e.g. issue6741.pdf;
 *      see https://issues.chromium.org/issues/374807001
 *
 *    - Broken images when using the JPEG decoder with images that have custom
 *      colour profiles, e.g. GitHub discussion 19030;
 *      see https://issues.chromium.org/issues/378869810
 *
 * @property {number} [canvasMaxAreaInBytes] - The integer value is used to
 *   know when an image must be resized (uses `OffscreenCanvas` in the worker).
 *   If it's -1 then a possibly slow algorithm is used to guess the max value.
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
 * @property {Object} [CanvasFactory] - The factory that will be used when
 *    creating canvases. The default value is {DOMCanvasFactory}.
 * @property {Object} [FilterFactory] - The factory that will be used to
 *    create SVG filters when rendering some images on the main canvas.
 *    The default value is {DOMFilterFactory}.
 * @property {boolean} [enableHWA] - Enables hardware acceleration for
 *   rendering. The default value is `false`.
 */

/**
 * This is the main entry point for loading a PDF and interacting with it.
 *
 * NOTE: If a URL is used to fetch the PDF data a standard Fetch API call (or
 * XHR as fallback) is used, which means it must follow same origin rules,
 * e.g. no cross-domain requests without CORS.
 *
 * @param {string | URL | TypedArray | ArrayBuffer | DocumentInitParameters}
 *   src - Can be a URL where a PDF file is located, a typed array (Uint8Array)
 *         already populated with data, or a parameter object.
 * @returns {PDFDocumentLoadingTask}
 */
function getDocument(src = {}) {
  if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
    if (typeof src === "string" || src instanceof URL) {
      src = { url: src };
    } else if (src instanceof ArrayBuffer || ArrayBuffer.isView(src)) {
      src = { data: src };
    }
  }
  const task = new PDFDocumentLoadingTask();
  const { docId } = task;

  const url = src.url ? getUrlProp(src.url) : null;
  const data = src.data ? getDataProp(src.data) : null;
  const httpHeaders = src.httpHeaders || null;
  const withCredentials = src.withCredentials === true;
  const password = src.password ?? null;
  const rangeTransport =
    src.range instanceof PDFDataRangeTransport ? src.range : null;
  const rangeChunkSize =
    Number.isInteger(src.rangeChunkSize) && src.rangeChunkSize > 0
      ? src.rangeChunkSize
      : DEFAULT_RANGE_CHUNK_SIZE;
  let worker = src.worker instanceof PDFWorker ? src.worker : null;
  const verbosity = src.verbosity;
  // Ignore "data:"-URLs, since they can't be used to recover valid absolute
  // URLs anyway. We want to avoid sending them to the worker-thread, since
  // they contain the *entire* PDF document and can thus be arbitrarily long.
  const docBaseUrl =
    typeof src.docBaseUrl === "string" && !isDataScheme(src.docBaseUrl)
      ? src.docBaseUrl
      : null;
  const cMapUrl = getFactoryUrlProp(src.cMapUrl);
  const cMapPacked = src.cMapPacked !== false;
  const CMapReaderFactory =
    src.CMapReaderFactory ||
    (typeof PDFJSDev !== "undefined" && PDFJSDev.test("GENERIC") && isNodeJS
      ? NodeCMapReaderFactory
      : DOMCMapReaderFactory);
  const standardFontDataUrl = getFactoryUrlProp(src.standardFontDataUrl);
  const StandardFontDataFactory =
    src.StandardFontDataFactory ||
    (typeof PDFJSDev !== "undefined" && PDFJSDev.test("GENERIC") && isNodeJS
      ? NodeStandardFontDataFactory
      : DOMStandardFontDataFactory);
  const wasmUrl = getFactoryUrlProp(src.wasmUrl);
  const WasmFactory =
    src.WasmFactory ||
    (typeof PDFJSDev !== "undefined" && PDFJSDev.test("GENERIC") && isNodeJS
      ? NodeWasmFactory
      : DOMWasmFactory);
  const ignoreErrors = src.stopAtErrors !== true;
  const maxImageSize =
    Number.isInteger(src.maxImageSize) && src.maxImageSize > -1
      ? src.maxImageSize
      : -1;
  const isEvalSupported = src.isEvalSupported !== false;
  const isOffscreenCanvasSupported =
    typeof src.isOffscreenCanvasSupported === "boolean"
      ? src.isOffscreenCanvasSupported
      : !isNodeJS;
  const isImageDecoderSupported =
    // eslint-disable-next-line no-nested-ternary
    typeof src.isImageDecoderSupported === "boolean"
      ? src.isImageDecoderSupported
      : // eslint-disable-next-line no-nested-ternary
        typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")
        ? true
        : typeof PDFJSDev !== "undefined" && PDFJSDev.test("CHROME")
          ? false
          : !isNodeJS && (FeatureTest.platform.isFirefox || !globalThis.chrome);
  const canvasMaxAreaInBytes = Number.isInteger(src.canvasMaxAreaInBytes)
    ? src.canvasMaxAreaInBytes
    : -1;
  const disableFontFace =
    typeof src.disableFontFace === "boolean" ? src.disableFontFace : isNodeJS;
  const fontExtraProperties = src.fontExtraProperties === true;
  const enableXfa = src.enableXfa === true;
  const ownerDocument = src.ownerDocument || globalThis.document;
  const disableRange = src.disableRange === true;
  const disableStream = src.disableStream === true;
  const disableAutoFetch = src.disableAutoFetch === true;
  const pdfBug = src.pdfBug === true;
  const CanvasFactory =
    src.CanvasFactory ||
    (typeof PDFJSDev !== "undefined" && PDFJSDev.test("GENERIC") && isNodeJS
      ? NodeCanvasFactory
      : DOMCanvasFactory);
  const FilterFactory =
    src.FilterFactory ||
    (typeof PDFJSDev !== "undefined" && PDFJSDev.test("GENERIC") && isNodeJS
      ? NodeFilterFactory
      : DOMFilterFactory);
  const enableHWA = src.enableHWA === true;
  const useWasm = src.useWasm !== false;

  // Parameters whose default values depend on other parameters.
  const length = rangeTransport ? rangeTransport.length : (src.length ?? NaN);
  const useSystemFonts =
    typeof src.useSystemFonts === "boolean"
      ? src.useSystemFonts
      : !isNodeJS && !disableFontFace;
  const useWorkerFetch =
    typeof src.useWorkerFetch === "boolean"
      ? src.useWorkerFetch
      : (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) ||
        !!(
          CMapReaderFactory === DOMCMapReaderFactory &&
          StandardFontDataFactory === DOMStandardFontDataFactory &&
          WasmFactory === DOMWasmFactory &&
          cMapUrl &&
          standardFontDataUrl &&
          wasmUrl &&
          isValidFetchUrl(cMapUrl, document.baseURI) &&
          isValidFetchUrl(standardFontDataUrl, document.baseURI) &&
          isValidFetchUrl(wasmUrl, document.baseURI)
        );

  // Parameters only intended for development/testing purposes.
  const styleElement =
    typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")
      ? src.styleElement
      : null;

  // Set the main-thread verbosity level.
  setVerbosityLevel(verbosity);

  // Ensure that the various factories can be initialized, when necessary,
  // since the user may provide *custom* ones.
  const transportFactory = {
    canvasFactory: new CanvasFactory({ ownerDocument, enableHWA }),
    filterFactory: new FilterFactory({ docId, ownerDocument }),
    cMapReaderFactory:
      (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) ||
      useWorkerFetch
        ? null
        : new CMapReaderFactory({ baseUrl: cMapUrl, isCompressed: cMapPacked }),
    standardFontDataFactory:
      (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) ||
      useWorkerFetch
        ? null
        : new StandardFontDataFactory({ baseUrl: standardFontDataUrl }),
    wasmFactory:
      (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) ||
      useWorkerFetch
        ? null
        : new WasmFactory({ baseUrl: wasmUrl }),
  };

  if (!worker) {
    const workerParams = {
      verbosity,
      port: GlobalWorkerOptions.workerPort,
    };
    // Worker was not provided -- creating and owning our own. If message port
    // is specified in global worker options, using it.
    worker = workerParams.port
      ? PDFWorker.fromPort(workerParams)
      : new PDFWorker(workerParams);
    task._worker = worker;
  }

  const docParams = {
    docId,
    apiVersion:
      typeof PDFJSDev !== "undefined" && !PDFJSDev.test("TESTING")
        ? PDFJSDev.eval("BUNDLE_VERSION")
        : null,
    data,
    password,
    disableAutoFetch,
    rangeChunkSize,
    length,
    docBaseUrl,
    enableXfa,
    evaluatorOptions: {
      maxImageSize,
      disableFontFace,
      ignoreErrors,
      isEvalSupported,
      isOffscreenCanvasSupported,
      isImageDecoderSupported,
      canvasMaxAreaInBytes,
      fontExtraProperties,
      useSystemFonts,
      useWasm,
      useWorkerFetch,
      cMapUrl,
      standardFontDataUrl,
      wasmUrl,
    },
  };
  const transportParams = {
    disableFontFace,
    fontExtraProperties,
    ownerDocument,
    pdfBug,
    styleElement,
    loadingParams: {
      disableAutoFetch,
      enableXfa,
    },
  };

  worker.promise
    .then(function () {
      if (task.destroyed) {
        throw new Error("Loading aborted");
      }
      if (worker.destroyed) {
        throw new Error("Worker was destroyed");
      }

      const workerIdPromise = worker.messageHandler.sendWithPromise(
        "GetDocRequest",
        docParams,
        data ? [data.buffer] : null
      );

      let networkStream;
      if (rangeTransport) {
        networkStream = new PDFDataTransportStream(rangeTransport, {
          disableRange,
          disableStream,
        });
      } else if (!data) {
        if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
          throw new Error("Not implemented: NetworkStream");
        }
        if (!url) {
          throw new Error("getDocument - no `url` parameter provided.");
        }
        let NetworkStream;

        if (
          typeof PDFJSDev !== "undefined" &&
          PDFJSDev.test("GENERIC") &&
          isNodeJS
        ) {
          if (isValidFetchUrl(url)) {
            if (
              typeof fetch === "undefined" ||
              typeof Response === "undefined" ||
              !("body" in Response.prototype)
            ) {
              throw new Error(
                "getDocument - the Fetch API was disabled in Node.js, see `--no-experimental-fetch`."
              );
            }
            NetworkStream = PDFFetchStream;
          } else {
            NetworkStream = PDFNodeStream;
          }
        } else {
          NetworkStream = isValidFetchUrl(url)
            ? PDFFetchStream
            : PDFNetworkStream;
        }

        networkStream = new NetworkStream({
          url,
          length,
          httpHeaders,
          withCredentials,
          rangeChunkSize,
          disableRange,
          disableStream,
        });
      }

      return workerIdPromise.then(workerId => {
        if (task.destroyed) {
          throw new Error("Loading aborted");
        }
        if (worker.destroyed) {
          throw new Error("Worker was destroyed");
        }

        const messageHandler = new MessageHandler(docId, workerId, worker.port);
        const transport = new WorkerTransport(
          messageHandler,
          task,
          networkStream,
          transportParams,
          transportFactory
        );
        task._transport = transport;
        messageHandler.send("Ready", null);
      });
    })
    .catch(task._capability.reject);

  return task;
}

function getUrlProp(val) {
  if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
    return null; // The 'url' is unused with `PDFDataRangeTransport`.
  }
  if (val instanceof URL) {
    return val.href;
  }
  if (typeof val === "string") {
    if (
      typeof PDFJSDev !== "undefined" &&
      PDFJSDev.test("GENERIC") &&
      isNodeJS
    ) {
      return val; // Use the url as-is in Node.js environments.
    }

    // The full path is required in the 'url' field.
    const url = URL.parse(val, window.location);
    if (url) {
      return url.href;
    }
  }
  throw new Error(
    "Invalid PDF url data: " +
      "either string or URL-object is expected in the url property."
  );
}

function getDataProp(val) {
  // Converting string or array-like data to Uint8Array.
  if (
    typeof PDFJSDev !== "undefined" &&
    PDFJSDev.test("GENERIC") &&
    isNodeJS &&
    typeof Buffer !== "undefined" && // eslint-disable-line no-undef
    val instanceof Buffer // eslint-disable-line no-undef
  ) {
    throw new Error(
      "Please provide binary data as `Uint8Array`, rather than `Buffer`."
    );
  }
  if (val instanceof Uint8Array && val.byteLength === val.buffer.byteLength) {
    // Use the data as-is when it's already a Uint8Array that completely
    // "utilizes" its underlying ArrayBuffer, to prevent any possible
    // issues when transferring it to the worker-thread.
    return val;
  }
  if (typeof val === "string") {
    return stringToBytes(val);
  }
  if (
    val instanceof ArrayBuffer ||
    ArrayBuffer.isView(val) ||
    (typeof val === "object" && !isNaN(val?.length))
  ) {
    return new Uint8Array(val);
  }
  throw new Error(
    "Invalid PDF binary data: either TypedArray, " +
      "string, or array-like object is expected in the data property."
  );
}

function getFactoryUrlProp(val) {
  if (typeof val !== "string") {
    return null;
  }
  if (val.endsWith("/")) {
    return val;
  }
  throw new Error(`Invalid factory url: "${val}" must include trailing slash.`);
}

function isRefProxy(ref) {
  return (
    typeof ref === "object" &&
    Number.isInteger(ref?.num) &&
    ref.num >= 0 &&
    Number.isInteger(ref?.gen) &&
    ref.gen >= 0
  );
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
 */
class PDFDocumentLoadingTask {
  static #docId = 0;

  constructor() {
    this._capability = Promise.withResolvers();
    this._transport = null;
    this._worker = null;

    /**
     * Unique identifier for the document loading task.
     * @type {string}
     */
    this.docId = `d${PDFDocumentLoadingTask.#docId++}`;

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
  }

  /**
   * Promise for document loading task completion.
   * @type {Promise<PDFDocumentProxy>}
   */
  get promise() {
    return this._capability.promise;
  }

  /**
   * Abort all network requests and destroy the worker.
   * @returns {Promise<void>} A promise that is resolved when destruction is
   *   completed.
   */
  async destroy() {
    this.destroyed = true;

    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
      await this._transport?.destroy();
    } else {
      try {
        if (this._worker?.port) {
          this._worker._pendingDestroy = true;
        }
        await this._transport?.destroy();
      } catch (ex) {
        if (this._worker?.port) {
          delete this._worker._pendingDestroy;
        }
        throw ex;
      }
    }
    this._transport = null;

    this._worker?.destroy();
    this._worker = null;
  }
}

/**
 * Abstract class to support range requests file loading.
 *
 * NOTE: The TypedArrays passed to the constructor and relevant methods below
 * will generally be transferred to the worker-thread. This will help reduce
 * main-thread memory usage, however it will take ownership of the TypedArrays.
 */
class PDFDataRangeTransport {
  /**
   * @param {number} length
   * @param {Uint8Array|null} initialData
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
    this._readyCapability = Promise.withResolvers();
  }

  /**
   * @param {function} listener
   */
  addRangeListener(listener) {
    this._rangeListeners.push(listener);
  }

  /**
   * @param {function} listener
   */
  addProgressListener(listener) {
    this._progressListeners.push(listener);
  }

  /**
   * @param {function} listener
   */
  addProgressiveReadListener(listener) {
    this._progressiveReadListeners.push(listener);
  }

  /**
   * @param {function} listener
   */
  addProgressiveDoneListener(listener) {
    this._progressiveDoneListeners.push(listener);
  }

  /**
   * @param {number} begin
   * @param {Uint8Array|null} chunk
   */
  onDataRange(begin, chunk) {
    for (const listener of this._rangeListeners) {
      listener(begin, chunk);
    }
  }

  /**
   * @param {number} loaded
   * @param {number|undefined} total
   */
  onDataProgress(loaded, total) {
    this._readyCapability.promise.then(() => {
      for (const listener of this._progressListeners) {
        listener(loaded, total);
      }
    });
  }

  /**
   * @param {Uint8Array|null} chunk
   */
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

  /**
   * @param {number} begin
   * @param {number} end
   */
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

    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      // For testing purposes.
      Object.defineProperty(this, "getNetworkStreamName", {
        value: () => this._transport.getNetworkStreamName(),
      });
      Object.defineProperty(this, "getXFADatasets", {
        value: () => this._transport.getXFADatasets(),
      });
      Object.defineProperty(this, "getXRefPrevValue", {
        value: () => this._transport.getXRefPrevValue(),
      });
      Object.defineProperty(this, "getStartXRefPos", {
        value: () => this._transport.getStartXRefPos(),
      });
      Object.defineProperty(this, "getAnnotArray", {
        value: pageIndex => this._transport.getAnnotArray(pageIndex),
      });
    }
  }

  /**
   * @type {AnnotationStorage} Storage for annotation data in forms.
   */
  get annotationStorage() {
    return this._transport.annotationStorage;
  }

  /**
   * @type {Object} The canvas factory instance.
   */
  get canvasFactory() {
    return this._transport.canvasFactory;
  }

  /**
   * @type {Object} The filter factory instance.
   */
  get filterFactory() {
    return this._transport.filterFactory;
  }

  /**
   * @type {number} Total number of pages in the PDF file.
   */
  get numPages() {
    return this._pdfInfo.numPages;
  }

  /**
   * @type {Array<string | null>} A (not guaranteed to be) unique ID to identify
   *   the PDF document.
   *   NOTE: The first element will always be defined for all PDF documents,
   *   whereas the second element is only defined for *modified* PDF documents.
   */
  get fingerprints() {
    return this._pdfInfo.fingerprints;
  }

  /**
   * @type {boolean} True if only XFA form.
   */
  get isPureXfa() {
    return shadow(this, "isPureXfa", !!this._transport._htmlForXfa);
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
   * @returns {Promise<Object | null>} A promise that is resolved with
   *   an {Object} with the JavaScript actions:
   *     - from the name tree.
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
   * @typedef {Object} GetOptionalContentConfigParameters
   * @property {string} [intent] - Determines the optional content groups that
   *   are visible by default; valid values are:
   *    - 'display' (viewable groups).
   *    - 'print' (printable groups).
   *    - 'any' (all groups).
   *   The default value is 'display'.
   */

  /**
   * @param {GetOptionalContentConfigParameters} [params] - Optional content
   *   config parameters.
   * @returns {Promise<OptionalContentConfig>} A promise that is resolved with
   *   an {@link OptionalContentConfig} that contains all the optional content
   *   groups (assuming that the document has any).
   */
  getOptionalContentConfig({ intent = "display" } = {}) {
    const { renderingIntent } = this._transport.getRenderingIntent(intent);

    return this._transport.getOptionalContentConfig(renderingIntent);
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
   * @returns {Promise<Uint8Array>} A promise that is resolved with a
   *   {Uint8Array} containing the raw data of the PDF document.
   */
  getData() {
    return this._transport.getData();
  }

  /**
   * @returns {Promise<Uint8Array>} A promise that is resolved with a
   *   {Uint8Array} containing the full data of the saved document.
   */
  saveDocument() {
    return this._transport.saveDocument();
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
   * @param {RefProxy} ref - The page reference.
   * @returns {number | null} The page number, if it's cached.
   */
  cachedPageNumber(ref) {
    return this._transport.cachedPageNumber(ref);
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
   * @returns {Promise<Object<string, Array<Object>> | null>} A promise that is
   *   resolved with an {Object} containing /AcroForm field data for the JS
   *   sandbox, or `null` when no field data is present in the PDF file.
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
 * @property {boolean} [includeMarkedContent] - When true include marked
 *   content items in the items array of TextContent. The default is `false`.
 * @property {boolean} [disableNormalization] - When true the text is *not*
 *   normalized in the worker-thread. The default is `false`.
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
 * @property {string | null} lang - The document /Lang attribute.
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
 * @property {string} [intent] - Determines the annotations that are fetched,
 *   can be 'display' (viewable annotations), 'print' (printable annotations),
 *   or 'any' (all annotations). The default value is 'display'.
 */

/**
 * Page render parameters.
 *
 * @typedef {Object} RenderParameters
 * @property {CanvasRenderingContext2D} canvasContext - A 2D context of a DOM
 *   Canvas object.
 * @property {PageViewport} viewport - Rendering viewport obtained by calling
 *   the `PDFPageProxy.getViewport` method.
 * @property {string} [intent] - Rendering intent, can be 'display', 'print',
 *   or 'any'. The default value is 'display'.
 * @property {number} [annotationMode] Controls which annotations are rendered
 *   onto the canvas, for annotations with appearance-data; the values from
 *   {@link AnnotationMode} should be used. The following values are supported:
 *    - `AnnotationMode.DISABLE`, which disables all annotations.
 *    - `AnnotationMode.ENABLE`, which includes all possible annotations (thus
 *      it also depends on the `intent`-option, see above).
 *    - `AnnotationMode.ENABLE_FORMS`, which excludes annotations that contain
 *      interactive form elements (those will be rendered in the display layer).
 *    - `AnnotationMode.ENABLE_STORAGE`, which includes all possible annotations
 *      (as above) but where interactive form elements are updated with data
 *      from the {@link AnnotationStorage}-instance; useful e.g. for printing.
 *   The default value is `AnnotationMode.ENABLE`.
 * @property {Array<any>} [transform] - Additional transform, applied just
 *   before viewport transform.
 * @property {CanvasGradient | CanvasPattern | string} [background] - Background
 *   to use for the canvas.
 *   Any valid `canvas.fillStyle` can be used: a `DOMString` parsed as CSS
 *   <color> value, a `CanvasGradient` object (a linear or radial gradient) or
 *   a `CanvasPattern` object (a repetitive image). The default value is
 *   'rgb(255,255,255)'.
 *
 *   NOTE: This option may be partially, or completely, ignored when the
 *   `pageColors`-option is used.
 * @property {Object} [pageColors] - Overwrites background and foreground colors
 *   with user defined ones in order to improve readability in high contrast
 *   mode.
 * @property {Promise<OptionalContentConfig>} [optionalContentConfigPromise] -
 *   A promise that should resolve with an {@link OptionalContentConfig}
 *   created from `PDFDocumentProxy.getOptionalContentConfig`. If `null`,
 *   the configuration will be fetched automatically with the default visibility
 *   states set.
 * @property {Map<string, HTMLCanvasElement>} [annotationCanvasMap] - Map some
 *   annotation ids with canvases used to render them.
 * @property {PrintAnnotationStorage} [printAnnotationStorage]
 * @property {boolean} [isEditing] - Render the page in editing mode.
 */

/**
 * Page getOperatorList parameters.
 *
 * @typedef {Object} GetOperatorListParameters
 * @property {string} [intent] - Rendering intent, can be 'display', 'print',
 *   or 'any'. The default value is 'display'.
 * @property {number} [annotationMode] Controls which annotations are included
 *   in the operatorList, for annotations with appearance-data; the values from
 *   {@link AnnotationMode} should be used. The following values are supported:
 *    - `AnnotationMode.DISABLE`, which disables all annotations.
 *    - `AnnotationMode.ENABLE`, which includes all possible annotations (thus
 *      it also depends on the `intent`-option, see above).
 *    - `AnnotationMode.ENABLE_FORMS`, which excludes annotations that contain
 *      interactive form elements (those will be rendered in the display layer).
 *    - `AnnotationMode.ENABLE_STORAGE`, which includes all possible annotations
 *      (as above) but where interactive form elements are updated with data
 *      from the {@link AnnotationStorage}-instance; useful e.g. for printing.
 *   The default value is `AnnotationMode.ENABLE`.
 * @property {PrintAnnotationStorage} [printAnnotationStorage]
 * @property {boolean} [isEditing] - Render the page in editing mode.
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
  #pendingCleanup = false;

  constructor(pageIndex, pageInfo, transport, pdfBug = false) {
    this._pageIndex = pageIndex;
    this._pageInfo = pageInfo;
    this._transport = transport;
    this._stats = pdfBug ? new StatTimer() : null;
    this._pdfBug = pdfBug;
    /** @type {PDFObjects} */
    this.commonObjs = transport.commonObjs;
    this.objs = new PDFObjects();

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
      userUnit: this.userUnit,
      scale,
      rotation,
      offsetX,
      offsetY,
      dontFlip,
    });
  }

  /**
   * @param {GetAnnotationsParameters} [params] - Annotation parameters.
   * @returns {Promise<Array<any>>} A promise that is resolved with an
   *   {Array} of the annotation objects.
   */
  getAnnotations({ intent = "display" } = {}) {
    const { renderingIntent } = this._transport.getRenderingIntent(intent);

    return this._transport.getAnnotations(this._pageIndex, renderingIntent);
  }

  /**
   * @returns {Promise<Object>} A promise that is resolved with an
   *   {Object} with JS actions.
   */
  getJSActions() {
    return this._transport.getPageJSActions(this._pageIndex);
  }

  /**
   * @type {Object} The filter factory instance.
   */
  get filterFactory() {
    return this._transport.filterFactory;
  }

  /**
   * @type {boolean} True if only XFA form.
   */
  get isPureXfa() {
    return shadow(this, "isPureXfa", !!this._transport._htmlForXfa);
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
   * @param {RenderParameters} params - Page render parameters.
   * @returns {RenderTask} An object that contains a promise that is
   *   resolved when the page finishes rendering.
   */
  render({
    canvasContext,
    viewport,
    intent = "display",
    annotationMode = AnnotationMode.ENABLE,
    transform = null,
    background = null,
    optionalContentConfigPromise = null,
    annotationCanvasMap = null,
    pageColors = null,
    printAnnotationStorage = null,
    isEditing = false,
  }) {
    this._stats?.time("Overall");

    const intentArgs = this._transport.getRenderingIntent(
      intent,
      annotationMode,
      printAnnotationStorage,
      isEditing
    );
    const { renderingIntent, cacheKey } = intentArgs;
    // If there was a pending destroy, cancel it so no cleanup happens during
    // this call to render.
    this.#pendingCleanup = false;

    optionalContentConfigPromise ||=
      this._transport.getOptionalContentConfig(renderingIntent);

    let intentState = this._intentStates.get(cacheKey);
    if (!intentState) {
      intentState = Object.create(null);
      this._intentStates.set(cacheKey, intentState);
    }

    // Ensure that a pending `streamReader` cancel timeout is always aborted.
    if (intentState.streamReaderCancelTimeout) {
      clearTimeout(intentState.streamReaderCancelTimeout);
      intentState.streamReaderCancelTimeout = null;
    }

    const intentPrint = !!(renderingIntent & RenderingIntentFlag.PRINT);

    // If there's no displayReadyCapability yet, then the operatorList
    // was never requested before. Make the request and create the promise.
    if (!intentState.displayReadyCapability) {
      intentState.displayReadyCapability = Promise.withResolvers();
      intentState.operatorList = {
        fnArray: [],
        argsArray: [],
        lastChunk: false,
        separateAnnots: null,
      };

      this._stats?.time("Page Request");
      this._pumpOperatorList(intentArgs);
    }

    const complete = error => {
      intentState.renderTasks.delete(internalRenderTask);

      // Attempt to reduce memory usage during *printing*, by always running
      // cleanup immediately once rendering has finished.
      if (intentPrint) {
        this.#pendingCleanup = true;
      }
      this.#tryCleanup();

      if (error) {
        internalRenderTask.capability.reject(error);

        this._abortOperatorList({
          intentState,
          reason: error instanceof Error ? error : new Error(error),
        });
      } else {
        internalRenderTask.capability.resolve();
      }

      if (this._stats) {
        this._stats.timeEnd("Rendering");
        this._stats.timeEnd("Overall");

        if (globalThis.Stats?.enabled) {
          globalThis.Stats.add(this.pageNumber, this._stats);
        }
      }
    };

    const internalRenderTask = new InternalRenderTask({
      callback: complete,
      // Only include the required properties, and *not* the entire object.
      params: {
        canvasContext,
        viewport,
        transform,
        background,
      },
      objs: this.objs,
      commonObjs: this.commonObjs,
      annotationCanvasMap,
      operatorList: intentState.operatorList,
      pageIndex: this._pageIndex,
      canvasFactory: this._transport.canvasFactory,
      filterFactory: this._transport.filterFactory,
      useRequestAnimationFrame: !intentPrint,
      pdfBug: this._pdfBug,
      pageColors,
    });

    (intentState.renderTasks ||= new Set()).add(internalRenderTask);
    const renderTask = internalRenderTask.task;

    Promise.all([
      intentState.displayReadyCapability.promise,
      optionalContentConfigPromise,
    ])
      .then(([transparency, optionalContentConfig]) => {
        if (this.destroyed) {
          complete();
          return;
        }
        this._stats?.time("Rendering");

        if (!(optionalContentConfig.renderingIntent & renderingIntent)) {
          throw new Error(
            "Must use the same `intent`-argument when calling the `PDFPageProxy.render` " +
              "and `PDFDocumentProxy.getOptionalContentConfig` methods."
          );
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
   * @param {GetOperatorListParameters} params - Page getOperatorList
   *   parameters.
   * @returns {Promise<PDFOperatorList>} A promise resolved with an
   *   {@link PDFOperatorList} object that represents the page's operator list.
   */
  getOperatorList({
    intent = "display",
    annotationMode = AnnotationMode.ENABLE,
    printAnnotationStorage = null,
    isEditing = false,
  } = {}) {
    if (typeof PDFJSDev !== "undefined" && !PDFJSDev.test("GENERIC")) {
      throw new Error("Not implemented: getOperatorList");
    }
    function operatorListChanged() {
      if (intentState.operatorList.lastChunk) {
        intentState.opListReadCapability.resolve(intentState.operatorList);

        intentState.renderTasks.delete(opListTask);
      }
    }

    const intentArgs = this._transport.getRenderingIntent(
      intent,
      annotationMode,
      printAnnotationStorage,
      isEditing,
      /* isOpList = */ true
    );
    let intentState = this._intentStates.get(intentArgs.cacheKey);
    if (!intentState) {
      intentState = Object.create(null);
      this._intentStates.set(intentArgs.cacheKey, intentState);
    }
    let opListTask;

    if (!intentState.opListReadCapability) {
      opListTask = Object.create(null);
      opListTask.operatorListChanged = operatorListChanged;
      intentState.opListReadCapability = Promise.withResolvers();
      (intentState.renderTasks ||= new Set()).add(opListTask);
      intentState.operatorList = {
        fnArray: [],
        argsArray: [],
        lastChunk: false,
        separateAnnots: null,
      };

      this._stats?.time("Page Request");
      this._pumpOperatorList(intentArgs);
    }
    return intentState.opListReadCapability.promise;
  }

  /**
   * NOTE: All occurrences of whitespace will be replaced by
   * standard spaces (0x20).
   *
   * @param {getTextContentParameters} params - getTextContent parameters.
   * @returns {ReadableStream} Stream for reading text content chunks.
   */
  streamTextContent({
    includeMarkedContent = false,
    disableNormalization = false,
  } = {}) {
    const TEXT_CONTENT_CHUNK_SIZE = 100;

    return this._transport.messageHandler.sendWithStream(
      "GetTextContent",
      {
        pageIndex: this._pageIndex,
        includeMarkedContent: includeMarkedContent === true,
        disableNormalization: disableNormalization === true,
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
   * NOTE: All occurrences of whitespace will be replaced by
   * standard spaces (0x20).
   *
   * @param {getTextContentParameters} params - getTextContent parameters.
   * @returns {Promise<TextContent>} A promise that is resolved with a
   *   {@link TextContent} object that represents the page's text content.
   */
  getTextContent(params = {}) {
    if (this._transport._htmlForXfa) {
      // TODO: We need to revisit this once the XFA foreground patch lands and
      // only do this for non-foreground XFA.
      return this.getXfa().then(xfa => XfaText.textContent(xfa));
    }
    const readableStream = this.streamTextContent(params);

    return new Promise(function (resolve, reject) {
      function pump() {
        reader.read().then(function ({ value, done }) {
          if (done) {
            resolve(textContent);
            return;
          }
          textContent.lang ??= value.lang;
          Object.assign(textContent.styles, value.styles);
          textContent.items.push(...value.items);
          pump();
        }, reject);
      }

      const reader = readableStream.getReader();
      const textContent = {
        items: [],
        styles: Object.create(null),
        lang: null,
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
    return this._transport.getStructTree(this._pageIndex);
  }

  /**
   * Destroys the page object.
   * @private
   */
  _destroy() {
    this.destroyed = true;

    const waitOn = [];
    for (const intentState of this._intentStates.values()) {
      this._abortOperatorList({
        intentState,
        reason: new Error("Page was destroyed."),
        force: true,
      });

      if (intentState.opListReadCapability) {
        // Avoid errors below, since the renderTasks are just stubs.
        continue;
      }
      for (const internalRenderTask of intentState.renderTasks) {
        waitOn.push(internalRenderTask.completed);
        internalRenderTask.cancel();
      }
    }
    this.objs.clear();
    this.#pendingCleanup = false;

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
    this.#pendingCleanup = true;
    const success = this.#tryCleanup();

    if (resetStats && success) {
      this._stats &&= new StatTimer();
    }
    return success;
  }

  /**
   * Attempts to clean up if rendering is in a state where that's possible.
   * @returns {boolean} Indicates if clean-up was successfully run.
   */
  #tryCleanup() {
    if (!this.#pendingCleanup || this.destroyed) {
      return false;
    }
    for (const { renderTasks, operatorList } of this._intentStates.values()) {
      if (renderTasks.size > 0 || !operatorList.lastChunk) {
        return false;
      }
    }
    this._intentStates.clear();
    this.objs.clear();
    this.#pendingCleanup = false;
    return true;
  }

  /**
   * @private
   */
  _startRenderPage(transparency, cacheKey) {
    const intentState = this._intentStates.get(cacheKey);
    if (!intentState) {
      return; // Rendering was cancelled.
    }
    this._stats?.timeEnd("Page Request");

    // TODO Refactor RenderPageRequest to separate rendering
    // and operator list logic
    intentState.displayReadyCapability?.resolve(transparency);
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
    intentState.operatorList.separateAnnots = operatorListChunk.separateAnnots;

    // Notify all the rendering tasks there are more operators to be consumed.
    for (const internalRenderTask of intentState.renderTasks) {
      internalRenderTask.operatorListChanged();
    }

    if (operatorListChunk.lastChunk) {
      this.#tryCleanup();
    }
  }

  /**
   * @private
   */
  _pumpOperatorList({
    renderingIntent,
    cacheKey,
    annotationStorageSerializable,
    modifiedIds,
  }) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        Number.isInteger(renderingIntent) && renderingIntent > 0,
        '_pumpOperatorList: Expected valid "renderingIntent" argument.'
      );
    }
    const { map, transfer } = annotationStorageSerializable;

    const readableStream = this._transport.messageHandler.sendWithStream(
      "GetOperatorList",
      {
        pageIndex: this._pageIndex,
        intent: renderingIntent,
        cacheKey,
        annotationStorage: map,
        modifiedIds,
      },
      transfer
    );
    const reader = readableStream.getReader();

    const intentState = this._intentStates.get(cacheKey);
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
            this.#tryCleanup();
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
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        reason instanceof Error,
        '_abortOperatorList: Expected valid "reason" argument.'
      );
    }

    if (!intentState.streamReader) {
      return;
    }
    // Ensure that a pending `streamReader` cancel timeout is always aborted.
    if (intentState.streamReaderCancelTimeout) {
      clearTimeout(intentState.streamReaderCancelTimeout);
      intentState.streamReaderCancelTimeout = null;
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
        let delay = RENDERING_CANCELLED_TIMEOUT;
        if (reason.extraDelay > 0 && reason.extraDelay < /* ms = */ 1000) {
          // Above, we prevent the total delay from becoming arbitrarily large.
          delay += reason.extraDelay;
        }

        intentState.streamReaderCancelTimeout = setTimeout(() => {
          intentState.streamReaderCancelTimeout = null;
          this._abortOperatorList({ intentState, reason, force: true });
        }, delay);
        return;
      }
    }
    intentState.streamReader
      .cancel(new AbortException(reason.message))
      .catch(() => {
        // Avoid "Uncaught promise" messages in the console.
      });
    intentState.streamReader = null;

    if (this._transport.destroyed) {
      return; // Ignore any pending requests if the worker was terminated.
    }
    // Remove the current `intentState`, since a cancelled `getOperatorList`
    // call on the worker-thread cannot be re-started...
    for (const [curCacheKey, curIntentState] of this._intentStates) {
      if (curIntentState === intentState) {
        this._intentStates.delete(curCacheKey);
        break;
      }
    }
    // ... and force clean-up to ensure that any old state is always removed.
    this.cleanup();
  }

  /**
   * @type {StatTimer | null} Returns page stats, if enabled; returns `null`
   *   otherwise.
   */
  get stats() {
    return this._stats;
  }
}

class LoopbackPort {
  #listeners = new Map();

  #deferred = Promise.resolve();

  postMessage(obj, transfer) {
    const event = {
      data: structuredClone(obj, transfer ? { transfer } : null),
    };

    this.#deferred.then(() => {
      for (const [listener] of this.#listeners) {
        listener.call(this, event);
      }
    });
  }

  addEventListener(name, listener, options = null) {
    let rmAbort = null;
    if (options?.signal instanceof AbortSignal) {
      const { signal } = options;
      if (signal.aborted) {
        warn("LoopbackPort - cannot use an `aborted` signal.");
        return;
      }
      const onAbort = () => this.removeEventListener(name, listener);
      rmAbort = () => signal.removeEventListener("abort", onAbort);

      signal.addEventListener("abort", onAbort);
    }
    this.#listeners.set(listener, rmAbort);
  }

  removeEventListener(name, listener) {
    const rmAbort = this.#listeners.get(listener);
    rmAbort?.();

    this.#listeners.delete(listener);
  }

  terminate() {
    for (const [, rmAbort] of this.#listeners) {
      rmAbort?.();
    }
    this.#listeners.clear();
  }
}

/**
 * @typedef {Object} PDFWorkerParameters
 * @property {string} [name] - The name of the worker.
 * @property {Worker} [port] - The `workerPort` object.
 * @property {number} [verbosity] - Controls the logging level;
 *   the constants from {@link VerbosityLevel} should be used.
 */

/**
 * PDF.js web worker abstraction that controls the instantiation of PDF
 * documents. Message handlers are used to pass information from the main
 * thread to the worker thread and vice versa. If the creation of a web
 * worker is not possible, a "fake" worker will be used instead.
 *
 * @param {PDFWorkerParameters} params - The worker initialization parameters.
 */
class PDFWorker {
  static #fakeWorkerId = 0;

  static #isWorkerDisabled = false;

  static #workerPorts;

  static {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
      if (isNodeJS) {
        // Workers aren't supported in Node.js, force-disabling them there.
        this.#isWorkerDisabled = true;

        GlobalWorkerOptions.workerSrc ||= PDFJSDev.test("LIB")
          ? "../pdf.worker.js"
          : "./pdf.worker.mjs";
      }

      // Check if URLs have the same origin. For non-HTTP based URLs, returns
      // false.
      this._isSameOrigin = (baseUrl, otherUrl) => {
        const base = URL.parse(baseUrl);
        if (!base?.origin || base.origin === "null") {
          return false; // non-HTTP url
        }
        const other = new URL(otherUrl, base);
        return base.origin === other.origin;
      };

      this._createCDNWrapper = url => {
        // We will rely on blob URL's property to specify origin.
        // We want this function to fail in case if createObjectURL or Blob do
        // not exist or fail for some reason -- our Worker creation will fail
        // anyway.
        const wrapper = `await import("${url}");`;
        return URL.createObjectURL(
          new Blob([wrapper], { type: "text/javascript" })
        );
      };
    }
  }

  constructor({
    name = null,
    port = null,
    verbosity = getVerbosityLevel(),
  } = {}) {
    this.name = name;
    this.destroyed = false;
    this.verbosity = verbosity;

    this._readyCapability = Promise.withResolvers();
    this._port = null;
    this._webWorker = null;
    this._messageHandler = null;

    if (
      (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) &&
      port
    ) {
      if (PDFWorker.#workerPorts?.has(port)) {
        throw new Error("Cannot use more than one PDFWorker per port.");
      }
      (PDFWorker.#workerPorts ||= new WeakMap()).set(port, this);
      this._initializeFromPort(port);
      return;
    }
    this._initialize();
  }

  /**
   * Promise for worker initialization completion.
   * @type {Promise<void>}
   */
  get promise() {
    return this._readyCapability.promise;
  }

  #resolve() {
    this._readyCapability.resolve();
    // Send global setting, e.g. verbosity level.
    this._messageHandler.send("configure", {
      verbosity: this.verbosity,
    });
  }

  /**
   * The current `workerPort`, when it exists.
   * @type {Worker}
   */
  get port() {
    return this._port;
  }

  /**
   * The current MessageHandler-instance.
   * @type {MessageHandler}
   */
  get messageHandler() {
    return this._messageHandler;
  }

  _initializeFromPort(port) {
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
      throw new Error("Not implemented: _initializeFromPort");
    }
    this._port = port;
    this._messageHandler = new MessageHandler("main", "worker", port);
    this._messageHandler.on("ready", function () {
      // Ignoring "ready" event -- MessageHandler should already be initialized
      // and ready to accept messages.
    });
    this.#resolve();
  }

  _initialize() {
    // If worker support isn't disabled explicit and the browser has worker
    // support, create a new web worker and test if it/the browser fulfills
    // all requirements to run parts of pdf.js in a web worker.
    // Right now, the requirement is, that an Uint8Array is still an
    // Uint8Array as it arrives on the worker.
    if (
      PDFWorker.#isWorkerDisabled ||
      PDFWorker.#mainThreadWorkerMessageHandler
    ) {
      this._setupFakeWorker();
      return;
    }
    let { workerSrc } = PDFWorker;

    try {
      // Wraps workerSrc path into blob URL, if the former does not belong
      // to the same origin.
      if (
        typeof PDFJSDev !== "undefined" &&
        PDFJSDev.test("GENERIC") &&
        !PDFWorker._isSameOrigin(window.location, workerSrc)
      ) {
        workerSrc = PDFWorker._createCDNWrapper(
          new URL(workerSrc, window.location).href
        );
      }

      const worker = new Worker(workerSrc, { type: "module" });
      const messageHandler = new MessageHandler("main", "worker", worker);
      const terminateEarly = () => {
        ac.abort();
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

      const ac = new AbortController();
      worker.addEventListener(
        "error",
        () => {
          if (!this._webWorker) {
            // Worker failed to initialize due to an error. Clean up and fall
            // back to the fake worker.
            terminateEarly();
          }
        },
        { signal: ac.signal }
      );

      messageHandler.on("test", data => {
        ac.abort();
        if (this.destroyed || !data) {
          terminateEarly();
          return;
        }
        this._messageHandler = messageHandler;
        this._port = worker;
        this._webWorker = worker;

        this.#resolve();
      });

      messageHandler.on("ready", data => {
        ac.abort();
        if (this.destroyed) {
          terminateEarly();
          return;
        }
        try {
          sendTest();
        } catch {
          // We need fallback to a faked worker.
          this._setupFakeWorker();
        }
      });

      const sendTest = () => {
        const testObj = new Uint8Array();
        // Ensure that we can use `postMessage` transfers.
        messageHandler.send("test", testObj, [testObj.buffer]);
      };

      // It might take time for the worker to initialize. We will try to send
      // the "test" message immediately, and once the "ready" message arrives.
      // The worker shall process only the first received "test" message.
      sendTest();
      return;
    } catch {
      info("The worker has been disabled.");
    }
    // Either workers are not supported or have thrown an exception.
    // Thus, we fallback to a faked worker.
    this._setupFakeWorker();
  }

  _setupFakeWorker() {
    if (!PDFWorker.#isWorkerDisabled) {
      warn("Setting up fake worker.");
      PDFWorker.#isWorkerDisabled = true;
    }

    PDFWorker._setupFakeWorkerGlobal
      .then(WorkerMessageHandler => {
        if (this.destroyed) {
          this._readyCapability.reject(new Error("Worker was destroyed"));
          return;
        }
        const port = new LoopbackPort();
        this._port = port;

        // All fake workers use the same port, making id unique.
        const id = `fake${PDFWorker.#fakeWorkerId++}`;

        // If the main thread is our worker, setup the handling for the
        // messages -- the main thread sends to it self.
        const workerHandler = new MessageHandler(id + "_worker", id, port);
        WorkerMessageHandler.setup(workerHandler, port);

        this._messageHandler = new MessageHandler(id, id + "_worker", port);
        this.#resolve();
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

    // We need to terminate only web worker created resource.
    this._webWorker?.terminate();
    this._webWorker = null;

    PDFWorker.#workerPorts?.delete(this._port);
    this._port = null;

    this._messageHandler?.destroy();
    this._messageHandler = null;
  }

  /**
   * @param {PDFWorkerParameters} params - The worker initialization parameters.
   */
  static fromPort(params) {
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
      throw new Error("Not implemented: fromPort");
    }
    if (!params?.port) {
      throw new Error("PDFWorker.fromPort - invalid method signature.");
    }
    const cachedPort = this.#workerPorts?.get(params.port);
    if (cachedPort) {
      if (cachedPort._pendingDestroy) {
        throw new Error(
          "PDFWorker.fromPort - the worker is being destroyed.\n" +
            "Please remember to await `PDFDocumentLoadingTask.destroy()`-calls."
        );
      }
      return cachedPort;
    }
    return new PDFWorker(params);
  }

  /**
   * The current `workerSrc`, when it exists.
   * @type {string}
   */
  static get workerSrc() {
    if (GlobalWorkerOptions.workerSrc) {
      return GlobalWorkerOptions.workerSrc;
    }
    throw new Error('No "GlobalWorkerOptions.workerSrc" specified.');
  }

  static get #mainThreadWorkerMessageHandler() {
    try {
      return globalThis.pdfjsWorker?.WorkerMessageHandler || null;
    } catch {
      return null;
    }
  }

  // Loads worker code into the main-thread.
  static get _setupFakeWorkerGlobal() {
    const loader = async () => {
      if (this.#mainThreadWorkerMessageHandler) {
        // The worker was already loaded using e.g. a `<script>` tag.
        return this.#mainThreadWorkerMessageHandler;
      }
      const worker =
        typeof PDFJSDev === "undefined"
          ? await import("pdfjs/pdf.worker.js")
          : await __non_webpack_import__(this.workerSrc);
      return worker.WorkerMessageHandler;
    };

    return shadow(this, "_setupFakeWorkerGlobal", loader());
  }
}

/**
 * For internal use only.
 * @ignore
 */
class WorkerTransport {
  #methodPromises = new Map();

  #pageCache = new Map();

  #pagePromises = new Map();

  #pageRefCache = new Map();

  #passwordCapability = null;

  constructor(messageHandler, loadingTask, networkStream, params, factory) {
    this.messageHandler = messageHandler;
    this.loadingTask = loadingTask;
    this.commonObjs = new PDFObjects();
    this.fontLoader = new FontLoader({
      ownerDocument: params.ownerDocument,
      styleElement: params.styleElement,
    });
    this.loadingParams = params.loadingParams;
    this._params = params;

    this.canvasFactory = factory.canvasFactory;
    this.filterFactory = factory.filterFactory;
    this.cMapReaderFactory = factory.cMapReaderFactory;
    this.standardFontDataFactory = factory.standardFontDataFactory;
    this.wasmFactory = factory.wasmFactory;

    this.destroyed = false;
    this.destroyCapability = null;

    this._networkStream = networkStream;
    this._fullReader = null;
    this._lastProgress = null;
    this.downloadInfoCapability = Promise.withResolvers();

    this.setupMessageHandler();

    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      // For testing purposes.
      Object.defineProperty(this, "getNetworkStreamName", {
        value: () => networkStream?.constructor?.name || null,
      });
      Object.defineProperty(this, "getXFADatasets", {
        value: () =>
          this.messageHandler.sendWithPromise("GetXFADatasets", null),
      });
      Object.defineProperty(this, "getXRefPrevValue", {
        value: () =>
          this.messageHandler.sendWithPromise("GetXRefPrevValue", null),
      });
      Object.defineProperty(this, "getStartXRefPos", {
        value: () =>
          this.messageHandler.sendWithPromise("GetStartXRefPos", null),
      });
      Object.defineProperty(this, "getAnnotArray", {
        value: pageIndex =>
          this.messageHandler.sendWithPromise("GetAnnotArray", { pageIndex }),
      });
    }
  }

  #cacheSimpleMethod(name, data = null) {
    const cachedPromise = this.#methodPromises.get(name);
    if (cachedPromise) {
      return cachedPromise;
    }
    const promise = this.messageHandler.sendWithPromise(name, data);

    this.#methodPromises.set(name, promise);
    return promise;
  }

  get annotationStorage() {
    return shadow(this, "annotationStorage", new AnnotationStorage());
  }

  getRenderingIntent(
    intent,
    annotationMode = AnnotationMode.ENABLE,
    printAnnotationStorage = null,
    isEditing = false,
    isOpList = false
  ) {
    let renderingIntent = RenderingIntentFlag.DISPLAY; // Default value.
    let annotationStorageSerializable = SerializableEmpty;

    switch (intent) {
      case "any":
        renderingIntent = RenderingIntentFlag.ANY;
        break;
      case "display":
        break;
      case "print":
        renderingIntent = RenderingIntentFlag.PRINT;
        break;
      default:
        warn(`getRenderingIntent - invalid intent: ${intent}`);
    }

    const annotationStorage =
      renderingIntent & RenderingIntentFlag.PRINT &&
      printAnnotationStorage instanceof PrintAnnotationStorage
        ? printAnnotationStorage
        : this.annotationStorage;

    switch (annotationMode) {
      case AnnotationMode.DISABLE:
        renderingIntent += RenderingIntentFlag.ANNOTATIONS_DISABLE;
        break;
      case AnnotationMode.ENABLE:
        break;
      case AnnotationMode.ENABLE_FORMS:
        renderingIntent += RenderingIntentFlag.ANNOTATIONS_FORMS;
        break;
      case AnnotationMode.ENABLE_STORAGE:
        renderingIntent += RenderingIntentFlag.ANNOTATIONS_STORAGE;

        annotationStorageSerializable = annotationStorage.serializable;
        break;
      default:
        warn(`getRenderingIntent - invalid annotationMode: ${annotationMode}`);
    }

    if (isEditing) {
      renderingIntent += RenderingIntentFlag.IS_EDITING;
    }
    if (isOpList) {
      renderingIntent += RenderingIntentFlag.OPLIST;
    }

    const { ids: modifiedIds, hash: modifiedIdsHash } =
      annotationStorage.modifiedIds;

    const cacheKeyBuf = [
      renderingIntent,
      annotationStorageSerializable.hash,
      modifiedIdsHash,
    ];

    return {
      renderingIntent,
      cacheKey: cacheKeyBuf.join("_"),
      annotationStorageSerializable,
      modifiedIds,
    };
  }

  destroy() {
    if (this.destroyCapability) {
      return this.destroyCapability.promise;
    }

    this.destroyed = true;
    this.destroyCapability = Promise.withResolvers();

    this.#passwordCapability?.reject(
      new Error("Worker was destroyed during onPassword callback")
    );

    const waitOn = [];
    // We need to wait for all renderings to be completed, e.g.
    // timeout/rAF can take a long time.
    for (const page of this.#pageCache.values()) {
      waitOn.push(page._destroy());
    }
    this.#pageCache.clear();
    this.#pagePromises.clear();
    this.#pageRefCache.clear();
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
      this.#methodPromises.clear();
      this.filterFactory.destroy();
      TextLayer.cleanup();

      this._networkStream?.cancelAllRequests(
        new AbortException("Worker was terminated.")
      );

      this.messageHandler?.destroy();
      this.messageHandler = null;

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
              value instanceof ArrayBuffer,
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

    messageHandler.on("ReaderHeadersReady", async data => {
      await this._fullReader.headersReady;

      const { isStreamingSupported, isRangeSupported, contentLength } =
        this._fullReader;

      // If stream or range are disabled, it's our only way to report
      // loading progress.
      if (!isStreamingSupported || !isRangeSupported) {
        if (this._lastProgress) {
          loadingTask.onProgress?.(this._lastProgress);
        }
        this._fullReader.onProgress = evt => {
          loadingTask.onProgress?.({
            loaded: evt.loaded,
            total: evt.total,
          });
        };
      }

      return { isStreamingSupported, isRangeSupported, contentLength };
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
              value instanceof ArrayBuffer,
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

    messageHandler.on("DocException", ex => {
      loadingTask._capability.reject(wrapReason(ex));
    });

    messageHandler.on("PasswordRequest", ex => {
      this.#passwordCapability = Promise.withResolvers();

      try {
        if (!loadingTask.onPassword) {
          throw wrapReason(ex);
        }

        const updatePassword = password => {
          if (password instanceof Error) {
            this.#passwordCapability.reject(password);
          } else {
            this.#passwordCapability.resolve({ password });
          }
        };
        loadingTask.onPassword(updatePassword, ex.code);
      } catch (err) {
        this.#passwordCapability.reject(err);
      }
      return this.#passwordCapability.promise;
    });

    messageHandler.on("DataLoaded", data => {
      // For consistency: Ensure that progress is always reported when the
      // entire PDF file has been loaded, regardless of how it was fetched.
      loadingTask.onProgress?.({
        loaded: data.length,
        total: data.length,
      });

      this.downloadInfoCapability.resolve(data);
    });

    messageHandler.on("StartRenderPage", data => {
      if (this.destroyed) {
        return; // Ignore any pending requests if the worker was terminated.
      }

      const page = this.#pageCache.get(data.pageIndex);
      page._startRenderPage(data.transparency, data.cacheKey);
    });

    messageHandler.on("commonobj", ([id, type, exportedData]) => {
      if (this.destroyed) {
        return null; // Ignore any pending requests if the worker was terminated.
      }

      if (this.commonObjs.has(id)) {
        return null;
      }

      switch (type) {
        case "Font":
          const { disableFontFace, fontExtraProperties, pdfBug } = this._params;

          if ("error" in exportedData) {
            const exportedError = exportedData.error;
            warn(`Error during font loading: ${exportedError}`);
            this.commonObjs.resolve(id, exportedError);
            break;
          }

          const inspectFont =
            pdfBug && globalThis.FontInspector?.enabled
              ? (font, url) => globalThis.FontInspector.fontAdded(font, url)
              : null;
          const font = new FontFaceObject(exportedData, {
            disableFontFace,
            fontExtraProperties,
            inspectFont,
          });

          this.fontLoader
            .bind(font)
            .catch(() => messageHandler.sendWithPromise("FontFallback", { id }))
            .finally(() => {
              if (!fontExtraProperties && font.data) {
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
        case "CopyLocalImage":
          const { imageRef } = exportedData;
          assert(imageRef, "The imageRef must be defined.");

          for (const pageProxy of this.#pageCache.values()) {
            for (const [, data] of pageProxy.objs) {
              if (data?.ref !== imageRef) {
                continue;
              }
              if (!data.dataLen) {
                return null;
              }
              this.commonObjs.resolve(id, structuredClone(data));
              return data.dataLen;
            }
          }
          break;
        case "FontPath":
        case "Image":
        case "Pattern":
          this.commonObjs.resolve(id, exportedData);
          break;
        default:
          throw new Error(`Got unknown common object type ${type}`);
      }

      return null;
    });

    messageHandler.on("obj", ([id, pageIndex, type, imageData]) => {
      if (this.destroyed) {
        // Ignore any pending requests if the worker was terminated.
        return;
      }

      const pageProxy = this.#pageCache.get(pageIndex);
      if (pageProxy.objs.has(id)) {
        return;
      }
      // Don't store data *after* cleanup has successfully run, see bug 1854145.
      if (pageProxy._intentStates.size === 0) {
        imageData?.bitmap?.close(); // Release any `ImageBitmap` data.
        return;
      }

      switch (type) {
        case "Image":
        case "Pattern":
          pageProxy.objs.resolve(id, imageData);
          break;
        default:
          throw new Error(`Got unknown object type ${type}`);
      }
    });

    messageHandler.on("DocProgress", data => {
      if (this.destroyed) {
        return; // Ignore any pending requests if the worker was terminated.
      }
      loadingTask.onProgress?.({
        loaded: data.loaded,
        total: data.total,
      });
    });

    messageHandler.on("FetchBinaryData", async data => {
      if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
        throw new Error("Not implemented: FetchBinaryData");
      }
      if (this.destroyed) {
        throw new Error("Worker was destroyed.");
      }
      const factory = this[data.type];

      if (!factory) {
        throw new Error(
          `${data.type} not initialized, see the \`useWorkerFetch\` parameter.`
        );
      }
      return factory.fetch(data);
    });
  }

  getData() {
    return this.messageHandler.sendWithPromise("GetData", null);
  }

  saveDocument() {
    if (this.annotationStorage.size <= 0) {
      warn(
        "saveDocument called while `annotationStorage` is empty, " +
          "please use the getData-method instead."
      );
    }
    const { map, transfer } = this.annotationStorage.serializable;

    return this.messageHandler
      .sendWithPromise(
        "SaveDocument",
        {
          isPureXfa: !!this._htmlForXfa,
          numPages: this._numPages,
          annotationStorage: map,
          filename: this._fullReader?.filename ?? null,
        },
        transfer
      )
      .finally(() => {
        this.annotationStorage.resetModified();
      });
  }

  getPage(pageNumber) {
    if (
      !Number.isInteger(pageNumber) ||
      pageNumber <= 0 ||
      pageNumber > this._numPages
    ) {
      return Promise.reject(new Error("Invalid page request."));
    }

    const pageIndex = pageNumber - 1,
      cachedPromise = this.#pagePromises.get(pageIndex);
    if (cachedPromise) {
      return cachedPromise;
    }
    const promise = this.messageHandler
      .sendWithPromise("GetPage", {
        pageIndex,
      })
      .then(pageInfo => {
        if (this.destroyed) {
          throw new Error("Transport destroyed");
        }
        if (pageInfo.refStr) {
          this.#pageRefCache.set(pageInfo.refStr, pageNumber);
        }

        const page = new PDFPageProxy(
          pageIndex,
          pageInfo,
          this,
          this._params.pdfBug
        );
        this.#pageCache.set(pageIndex, page);
        return page;
      });
    this.#pagePromises.set(pageIndex, promise);
    return promise;
  }

  getPageIndex(ref) {
    if (!isRefProxy(ref)) {
      return Promise.reject(new Error("Invalid pageIndex request."));
    }
    return this.messageHandler.sendWithPromise("GetPageIndex", {
      num: ref.num,
      gen: ref.gen,
    });
  }

  getAnnotations(pageIndex, intent) {
    return this.messageHandler.sendWithPromise("GetAnnotations", {
      pageIndex,
      intent,
    });
  }

  getFieldObjects() {
    return this.#cacheSimpleMethod("GetFieldObjects");
  }

  hasJSActions() {
    return this.#cacheSimpleMethod("HasJSActions");
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

  getDocJSActions() {
    return this.#cacheSimpleMethod("GetDocJSActions");
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

  getOptionalContentConfig(renderingIntent) {
    return this.#cacheSimpleMethod("GetOptionalContentConfig").then(
      data => new OptionalContentConfig(data, renderingIntent)
    );
  }

  getPermissions() {
    return this.messageHandler.sendWithPromise("GetPermissions", null);
  }

  getMetadata() {
    const name = "GetMetadata",
      cachedPromise = this.#methodPromises.get(name);
    if (cachedPromise) {
      return cachedPromise;
    }
    const promise = this.messageHandler
      .sendWithPromise(name, null)
      .then(results => ({
        info: results[0],
        metadata: results[1] ? new Metadata(results[1]) : null,
        contentDispositionFilename: this._fullReader?.filename ?? null,
        contentLength: this._fullReader?.contentLength ?? null,
      }));
    this.#methodPromises.set(name, promise);
    return promise;
  }

  getMarkInfo() {
    return this.messageHandler.sendWithPromise("GetMarkInfo", null);
  }

  async startCleanup(keepLoadedFonts = false) {
    if (this.destroyed) {
      return; // No need to manually clean-up when destruction has started.
    }
    await this.messageHandler.sendWithPromise("Cleanup", null);

    for (const page of this.#pageCache.values()) {
      const cleanupSuccessful = page.cleanup();

      if (!cleanupSuccessful) {
        throw new Error(
          `startCleanup: Page ${page.pageNumber} is currently rendering.`
        );
      }
    }
    this.commonObjs.clear();
    if (!keepLoadedFonts) {
      this.fontLoader.clear();
    }
    this.#methodPromises.clear();
    this.filterFactory.destroy(/* keepHCM = */ true);
    TextLayer.cleanup();
  }

  cachedPageNumber(ref) {
    if (!isRefProxy(ref)) {
      return null;
    }
    const refStr = ref.gen === 0 ? `${ref.num}R` : `${ref.num}R${ref.gen}`;
    return this.#pageRefCache.get(refStr) ?? null;
  }
}

const INITIAL_DATA = Symbol("INITIAL_DATA");

/**
 * A PDF document and page is built of many objects. E.g. there are objects for
 * fonts, images, rendering code, etc. These objects may get processed inside of
 * a worker. This class implements some basic methods to manage these objects.
 */
class PDFObjects {
  #objs = Object.create(null);

  /**
   * Ensures there is an object defined for `objId`.
   *
   * @param {string} objId
   * @returns {Object}
   */
  #ensureObj(objId) {
    return (this.#objs[objId] ||= {
      ...Promise.withResolvers(),
      data: INITIAL_DATA,
    });
  }

  /**
   * If called *without* callback, this returns the data of `objId` but the
   * object needs to be resolved. If it isn't, this method throws.
   *
   * If called *with* a callback, the callback is called with the data of the
   * object once the object is resolved. That means, if you call this method
   * and the object is already resolved, the callback gets called right away.
   *
   * @param {string} objId
   * @param {function} [callback]
   * @returns {any}
   */
  get(objId, callback = null) {
    // If there is a callback, then the get can be async and the object is
    // not required to be resolved right now.
    if (callback) {
      const obj = this.#ensureObj(objId);
      obj.promise.then(() => callback(obj.data));
      return null;
    }
    // If there isn't a callback, the user expects to get the resolved data
    // directly.
    const obj = this.#objs[objId];
    // If there isn't an object yet or the object isn't resolved, then the
    // data isn't ready yet!
    if (!obj || obj.data === INITIAL_DATA) {
      throw new Error(`Requesting object that isn't resolved yet ${objId}.`);
    }
    return obj.data;
  }

  /**
   * @param {string} objId
   * @returns {boolean}
   */
  has(objId) {
    const obj = this.#objs[objId];
    return !!obj && obj.data !== INITIAL_DATA;
  }

  /**
   * @param {string} objId
   * @returns {boolean}
   */
  delete(objId) {
    const obj = this.#objs[objId];
    if (!obj || obj.data === INITIAL_DATA) {
      // Only allow removing the object *after* it's been resolved.
      return false;
    }
    delete this.#objs[objId];
    return true;
  }

  /**
   * Resolves the object `objId` with optional `data`.
   *
   * @param {string} objId
   * @param {any} [data]
   */
  resolve(objId, data = null) {
    const obj = this.#ensureObj(objId);
    obj.data = data;
    obj.resolve();
  }

  clear() {
    for (const objId in this.#objs) {
      const { data } = this.#objs[objId];
      data?.bitmap?.close(); // Release any `ImageBitmap` data.
    }
    this.#objs = Object.create(null);
  }

  *[Symbol.iterator]() {
    for (const objId in this.#objs) {
      const { data } = this.#objs[objId];

      if (data === INITIAL_DATA) {
        continue;
      }
      yield [objId, data];
    }
  }
}

/**
 * Allows controlling of the rendering tasks.
 */
class RenderTask {
  #internalRenderTask = null;

  /**
   * Callback for incremental rendering -- a function that will be called
   * each time the rendering is paused.  To continue rendering call the
   * function that is the first argument to the callback.
   * @type {function}
   */
  onContinue = null;

  /**
   * A function that will be synchronously called when the rendering tasks
   * finishes with an error (either because of an actual error, or because the
   * rendering is cancelled).
   *
   * @type {function}
   * @param {Error} error
   */
  onError = null;

  constructor(internalRenderTask) {
    this.#internalRenderTask = internalRenderTask;

    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      // For testing purposes.
      Object.defineProperty(this, "getOperatorList", {
        value: () => this.#internalRenderTask.operatorList,
      });
    }
  }

  /**
   * Promise for rendering task completion.
   * @type {Promise<void>}
   */
  get promise() {
    return this.#internalRenderTask.capability.promise;
  }

  /**
   * Cancels the rendering task. If the task is currently rendering it will
   * not be cancelled until graphics pauses with a timeout. The promise that
   * this object extends will be rejected when cancelled.
   *
   * @param {number} [extraDelay]
   */
  cancel(extraDelay = 0) {
    this.#internalRenderTask.cancel(/* error = */ null, extraDelay);
  }

  /**
   * Whether form fields are rendered separately from the main operatorList.
   * @type {boolean}
   */
  get separateAnnots() {
    const { separateAnnots } = this.#internalRenderTask.operatorList;
    if (!separateAnnots) {
      return false;
    }
    const { annotationCanvasMap } = this.#internalRenderTask;
    return (
      separateAnnots.form ||
      (separateAnnots.canvas && annotationCanvasMap?.size > 0)
    );
  }
}

/**
 * For internal use only.
 * @ignore
 */
class InternalRenderTask {
  #rAF = null;

  static #canvasInUse = new WeakSet();

  constructor({
    callback,
    params,
    objs,
    commonObjs,
    annotationCanvasMap,
    operatorList,
    pageIndex,
    canvasFactory,
    filterFactory,
    useRequestAnimationFrame = false,
    pdfBug = false,
    pageColors = null,
  }) {
    this.callback = callback;
    this.params = params;
    this.objs = objs;
    this.commonObjs = commonObjs;
    this.annotationCanvasMap = annotationCanvasMap;
    this.operatorListIdx = null;
    this.operatorList = operatorList;
    this._pageIndex = pageIndex;
    this.canvasFactory = canvasFactory;
    this.filterFactory = filterFactory;
    this._pdfBug = pdfBug;
    this.pageColors = pageColors;

    this.running = false;
    this.graphicsReadyCallback = null;
    this.graphicsReady = false;
    this._useRequestAnimationFrame =
      useRequestAnimationFrame === true && typeof window !== "undefined";
    this.cancelled = false;
    this.capability = Promise.withResolvers();
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
      if (InternalRenderTask.#canvasInUse.has(this._canvas)) {
        throw new Error(
          "Cannot use the same canvas during multiple render() operations. " +
            "Use different canvas or ensure previous operations were " +
            "cancelled or completed."
        );
      }
      InternalRenderTask.#canvasInUse.add(this._canvas);
    }

    if (this._pdfBug && globalThis.StepperManager?.enabled) {
      this.stepper = globalThis.StepperManager.create(this._pageIndex);
      this.stepper.init(this.operatorList);
      this.stepper.nextBreakPoint = this.stepper.getNextBreakPoint();
    }
    const { canvasContext, viewport, transform, background } = this.params;

    this.gfx = new CanvasGraphics(
      canvasContext,
      this.commonObjs,
      this.objs,
      this.canvasFactory,
      this.filterFactory,
      { optionalContentConfig },
      this.annotationCanvasMap,
      this.pageColors
    );
    this.gfx.beginDrawing({
      transform,
      viewport,
      transparency,
      background,
    });
    this.operatorListIdx = 0;
    this.graphicsReady = true;
    this.graphicsReadyCallback?.();
  }

  cancel(error = null, extraDelay = 0) {
    this.running = false;
    this.cancelled = true;
    this.gfx?.endDrawing();
    if (this.#rAF) {
      window.cancelAnimationFrame(this.#rAF);
      this.#rAF = null;
    }
    InternalRenderTask.#canvasInUse.delete(this._canvas);

    error ||= new RenderingCancelledException(
      `Rendering cancelled, page ${this._pageIndex + 1}`,
      extraDelay
    );
    this.callback(error);

    this.task.onError?.(error);
  }

  operatorListChanged() {
    if (!this.graphicsReady) {
      this.graphicsReadyCallback ||= this._continueBound;
      return;
    }
    this.stepper?.updateOperatorList(this.operatorList);

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
      this.#rAF = window.requestAnimationFrame(() => {
        this.#rAF = null;
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
        InternalRenderTask.#canvasInUse.delete(this._canvas);

        this.callback();
      }
    }
  }
}

/** @type {string} */
const version =
  typeof PDFJSDev !== "undefined" ? PDFJSDev.eval("BUNDLE_VERSION") : null;
/** @type {string} */
const build =
  typeof PDFJSDev !== "undefined" ? PDFJSDev.eval("BUNDLE_BUILD") : null;

export {
  build,
  getDocument,
  LoopbackPort,
  PDFDataRangeTransport,
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  PDFWorker,
  RenderTask,
  version,
};
