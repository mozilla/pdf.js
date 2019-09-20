/* Copyright 2017 Mozilla Foundation
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
declare namespace _pdfjs {
    //
    // src/display/api.js
    //
    const version: string;
    const build: string;
    type Chunk = Uint8Array;
    type RangeListener = (begin: number, chunk: Chunk) => void;
    type ProgressListener = (loaded: number) => void;
    type ProgressiveReadListener = (chunk: Chunk) => void;

    // BUG: LoopbackPort defines terminate(),
    // but MessagePort defines stop() ?
    interface LoopbackPort extends MessagePort {}
    let LoopbackPort: new (defer: boolean) => LoopbackPort;

    /**
     * Abstract class to support range requests file loading.
     * @class
     * @alias PDFDataRangeTransport
     * @param {number} length
     * @param {Uint8Array} initialData
     */
    class PDFDataRangeTransport {
        length: number;
        initialData: Chunk;

        constructor(length: number, initialData: Chunk);
        addRangeListener(listener: RangeListener): void;
        addProgressListener(listener: ProgressListener): void;
        addProgressiveReadListener(listener: ProgressiveReadListener): void;
        onDataRange(begin: number, chunk: Chunk): void;
        onDataProgress(loaded: number): void;
        onDataProgressiveRead(chunk: Chunk): void;
        transportReady(): void;
        requestDataRange(begin: number, end: number): void;
        abort(): void;
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
    interface PDFWorkerParameters {
        name?: string;
        port?: MessagePort;
        postMessageTransfers?: boolean;
        verbosity?: VerbosityLevel;
    }

    /**
     * PDF.js web worker abstraction, it controls instantiation of PDF documents and
     * WorkerTransport for them.  If creation of a web worker is not possible,
     * a "fake" worker will be used instead.
     * @class
     */
    class PDFWorker {
        constructor(params?: PDFWorkerParameters);
        name: string;
        destroyed: boolean;
        postMessageTransfers: boolean;
        promise: Promise<void>;
        port: MessagePort;
        messageHandler: MessageHandler;
        destroy(): void;
        fromPort(params: PDFWorkerParameters): PDFWorker;
    }

    interface DownloadInfo {
        length: number;
    }

    /**
     * Proxy to a PDFDocument in the worker thread. Also, contains commonly used
     * properties that can be read synchronously.
     * @class
     * @alias PDFDocumentProxy
     */
    interface PDFDocumentProxy {
        loadingTask: PDFDocumentLoadingTask;
        pdfInfo: {
            encrypted?: boolean;
            fingerprint: string;
            numPages: number;
        };

        /**
         * @return {number} Total number of pages the PDF contains.
         */
        numPages: number;

        /**
         * @return {string} A unique ID to identify a PDF. Not guaranteed to be
         * unique.
         */
        fingerprint: string;

        /**
         * @param {number} pageNumber The page number to get. The first page is 1.
         * @return {Promise} A promise that is resolved with a {@link PDFPageProxy}
         * object.
         */
        getPage(pageNumber: number): Promise<PDFPageProxy>;

        /**
         * @param {{num: number, gen: number}} ref The page reference. Must have
         *   the 'num' and 'gen' properties.
         * @return {Promise} A promise that is resolved with the page index that is
         * associated with the reference.
         */
        getPageIndex(ref: Ref): Promise<PageIndex>;

        /**
         * @return {Promise} A promise that is resolved with a lookup table for
         * mapping named destinations to reference numbers.
         *
         * This can be slow for large documents: use getDestination instead
         */
        getDestinations(): Promise<Destination>;

        /**
         * @param {string} id The named destination to get.
         * @return {Promise} A promise that is resolved with all information
         * of the given named destination.
         */
        getDestination(id: string): Promise<DestinationTarget | null>;

        /**
         * @return {Promise} A promise that is resolved with:
         *   an Array containing the pageLabels that correspond to the pageIndexes,
         *   or `null` when no pageLabels are present in the PDF file.
         */
        getPageLabels(): Promise<PageLabels[] | null>;

        /**
         * @return {Promise} A promise that is resolved with a {string} containing
         *   the PageMode name.
         */
        getPageMode(): Promise<string>;

        /**
         * @return {Promise} A promise that is resolved with a lookup table for
         * mapping named attachments to their content.
         */
        getAttachments(): Promise<Attachments | null>;

        /**
         * @return {Promise} A promise that is resolved with an {Array} of all the
         * JavaScript strings in the name tree, or `null` if no JavaScript exists.
         */
        getJavaScript(): Promise<string[] | null>;

        /**
         * @return {Promise} A promise that is resolved with an {Array} that is a
         * tree outline (if it has one) of the PDF. The tree is in the format of:
         * [
         *  {
         *   title: string,
         *   bold: boolean,
         *   italic: boolean,
         *   color: rgb Uint8Array,
         *   dest: dest obj,
         *   url: string,
         *   items: array of more items like this
         *  },
         *  ...
         * ].
         */
        getOutline(): Promise<Outline[] | null>;

        /**
         * @return {Promise} A promise that is resolved with an {Object} that has
         * info and metadata properties.  Info is an {Object} filled with anything
         * available in the information dictionary and similarly metadata is a
         * {Metadata} object with information from the metadata section of the PDF.
         */
        getMetadata(): Promise<MetadataProxy>;

        /**
         * @return {Promise} A promise that is resolved with a TypedArray that has
         * the raw data from the PDF.
         */
        getData(): Promise<Uint8Array>;

        /**
         * @return {Promise} A promise that is resolved when the document's data
         * is loaded. It is resolved with an {Object} that contains the length
         * property that indicates size of the PDF data in bytes.
         */
        getDownloadInfo(): Promise<DownloadInfo>;

        /**
         * @return {Promise} A promise this is resolved with current stats about
         * document structures (see {@link PDFDocumentStats}).
         */
        getStats(): Promise<PDFDocumentStats>;

        /**
         * Cleans up resources allocated by the document, e.g. created @font-face.
         */
        cleanup(): void;

        /**
         * Destroys current document instance and terminates worker.
         */
        destroy(): Promise<void>;
    }

    interface Outline {
        title: string;
        bold: boolean;
        italic: boolean;
        color: Color /* rgb */;
        dest: Array<Name | string | any[]> | null;
        unsafeUrl?: string;
        url: string | null;
        items: Outline[];
    }

    interface MetadataInfo {
        PDFFormatVersion?: string;
        IsAcroFormPresent?: boolean;
        IsXFAPresent?: boolean;
        Title?: string;
        Author?: string;
        Subject?: string;
        Keywords?: string;
        Creator?: string;
        Producer?: string;
        CreationDate?: string;
        ModDate?: string;
        Trapped?: Name;

        // typing for other keys in case this is not a complete list, and for
        // forwards compatibility
        [key: string]: any;
    }

    interface MetadataProxy {
        info: MetadataInfo;
        metadata: Metadata | null;
    }

    /**
     * @typedef {Object} PDFDocumentStats
     * @property {Array} streamTypes - Used stream types in the document (an item
     *   is set to true if specific stream ID was used in the document).
     * @property {Array} fontTypes - Used font type in the document (an item is set
     *   to true if specific font ID was used in the document).
     */
    interface PDFDocumentStats {
        streamTypes: StreamType[];
        fontTypes: FontType[];
    }

    interface PageInfo {
        /**
         * @return {number} The number of degrees the page is rotated clockwise.
         */
        rotate: number;

        /**
         * @return {Object} The reference that points to this page. It has 'num' and
         * 'gen' properties.
         */
        ref: Ref;

        /**
         * @return {number} The default size of units in 1/72nds of an inch.
         */
        userUnit: number;

        /**
         * @return {Array} An array of the visible portion of the PDF page in the
         * user space units - [x1, y1, x2, y2].
         */
        view: Rect;
    }

    interface OperatorList {
        fnArray: OPS[];
        argsArray: any[][];
        lastChunk: boolean;
    }

    interface IntentState {
        receivingOperatorList: boolean;
        displayReadyCapability: PromiseCapability<boolean>;
        operatorList: OperatorList;
        // Internal use only
        // renderTasks: RenderTask[];
    }

    interface IntentStates {
        [intent: string]: IntentState;
    }

    /**
     * Proxy to a PDFPage in the worker thread.
     * @class
     * @alias PDFPageProxy
     */
    interface PDFPageProxy {
        pageIndex: PageIndex;
        pageInfo: PageInfo;
        commonObjs: PDFObjects;
        objs: PDFObjects;
        cleanupAfterRender: boolean;
        pendingCleanup: boolean;
        intentStates: IntentStates;
        destroyed: boolean;

        /**
         * @return {number} Page number of the page. First page is 1.
         */
        pageNumber: number;

        /**
         * @return {number} The number of degrees the page is rotated clockwise.
         */
        rotate: number;
        /**
         * @return {Object} The reference that points to this page. It has 'num' and
         * 'gen' properties.
         */
        ref: Ref;

        /**
         * @return {number} The default size of units in 1/72nds of an inch.
         */
        userUnit: number;

        /**
         * @return {Array} An array of the visible portion of the PDF page in the
         * user space units - [x1, y1, x2, y2].
         */
        view: Rect; // Probably define a custom type

        /**
         * The size of the current page, converted from PDF units to inches.
         * @return {Object} An Object containing the properties: {number} `width`
         *   and {number} `height`, given in inches.
         */
        pageSizeInches: { width: number; height: number };

        /**
         * @param {number} scale The desired scale of the viewport.
         * @param {number} rotate Degrees to rotate the viewport. If omitted this
         * defaults to the page rotation.
         * @param {boolean} dontFlip (optional) If true, axis Y will not be flipped.
         * @return {PageViewport} Contains 'width' and 'height' properties
         * along with transforms required for rendering.
         */
        getViewport(args: {
            scale: number;
            rotate?: number;
            dontFlip?: boolean;
        }): PageViewport;

        /**
         * @param {GetAnnotationsParameters} params - Annotation parameters.
         * @return {Promise} A promise that is resolved with an {Array} of the
         * annotation objects.
         */
        getAnnotations(params?: GetAnnotationsParameters): Promise<Annotation[]>;

        /**
         * Begins the process of rendering a page to the desired context.
         * @param {RenderParameters} params Page render parameters.
         * @return {RenderTask} An object that contains the promise, which
         *                      is resolved when the page finishes rendering.
         */
        render(params: RenderParameters): RenderTask;

        /**
         * @return {Promise} A promise resolved with an {@link PDFOperatorList}
         *   object that represents page's operator list.
         */
        getOperatorList(): Promise<PDFOperatorList>;

        /**
         * @param {getTextContentParameters} params - getTextContent parameters.
         * @return {ReadableStream} ReadableStream to read textContent chunks.
         */
        streamTextContent(params?: getTextContentParameters): ReadableStream;

        /**
         * @param {getTextContentParameters} params - getTextContent parameters.
         * @return {Promise} That is resolved a {@link TextContent}
         * object that represent the page text content.
         */
        getTextContent(params?: getTextContentParameters): Promise<TextContent>;

        /**
         * Cleans up resources allocated by the page.
         * @param {boolean} resetStats - (optional) Reset page stats, if enabled.
         *   The default value is `false`.
         */
        cleanup(resetStats?: boolean): void;
    }

    type PDFObject = object;

    /**
     * A PDF document and page is built of many objects. E.g. there are objects
     * for fonts, images, rendering code and such. These objects might get processed
     * inside of a worker. The `PDFObjects` implements some basic functions to
     * manage these objects.
     * @ignore
     */
    interface PDFObjects {
        objs: { [objId: string]: PDFObject };

        /**
         * If called *without* callback, this returns the data of `objId` but the
         * object needs to be resolved. If it isn't, this function throws.
         *
         * If called *with* a callback, the callback is called with the data of the
         * object once the object is resolved. That means, if you call this
         * function and the object is already resolved, the callback gets called
         * right away.
         */
        get(objId: string, callback?: (data: any) => void): any | null;

        /**
         * Resolves the object `objId` with optional `data`.
         */
        resolve(objId: string, data: any): void;
        isResolved(objId: string): boolean;
        hasData(objId: string): boolean;

        /**
         * Returns the data of `objId` if object exists, null otherwise.
         */
        getData(objId: string): any;
        clear(): void;
    }

    type RenderingIntent = "display" | "print";

    /**
     * Page annotation parameters.
     *
     * @typedef {Object} GetAnnotationsParameters
     * @property {string} intent - Determines the annotations that will be fetched,
     *                    can be either 'display' (viewable annotations) or 'print'
     *                    (printable annotations).
     *                    If the parameter is omitted, all annotations are fetched.
     */
    interface GetAnnotationsParameters {
        intent: RenderingIntent | undefined;
    }

    /**
     * @param {Array} color - The color array containing either 0
     *                        (transparent), 1 (grayscale), 3 (RGB) or
     *                        4 (CMYK) elements
     */
    type Color = Uint8ClampedArray;

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
    interface RenderParameters {
        canvasContext: CanvasRenderingContext2D;
        viewport: PageViewport;
        intent?: RenderingIntent;
        enableWebGL?: boolean;
        renderInteractiveForms?: boolean;
        transform?: Transform[];
        imageLayer?: ImageLayer;
        canvasFactory?: CanvasFactory;
        background?: string;
    }

    interface RenderTask {
        /**
         * Promise for rendering task completion.
         * @return {Promise}
         */
        promise: Promise<void>;

        /**
         * Cancels the rendering task. If the task is currently rendering it will
         * not be cancelled until graphics pauses with a timeout. The promise that
         * this object extends will be rejected when cancelled.
         */
        cancel(): void;

        /**
         * Registers callbacks to indicate the rendering task completion.
         *
         * @param {function} onFulfilled The callback for the rendering completion.
         * @param {function} onRejected The callback for the rendering failure.
         * @return {Promise} A promise that is resolved after the onFulfilled or
         *                   onRejected callback.
         */
        then<R1, R2>(
            onFulfilled?: (value?: void) => R1 | PromiseLike<R1>,
            onRejected?: (reason?: Error) => R2 | PromiseLike<R2>
        ): Promise<R1 | R2>;
    }

    /**
     * PDF page operator list.
     *
     * @typedef {Object} PDFOperatorList
     * @property {Array} fnArray - Array containing the operator functions.
     * @property {Array} argsArray - Array containing the arguments of the
     *                               functions.
     */
    interface PDFOperatorList {
        fnArray: OPS[];
        argsArray: any[][];
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
    interface getTextContentParameters {
        normalizeWhitespace?: boolean;
        disableCombineTextItems?: boolean;
    }

    /**
     * Page text content.
     *
     * @typedef {Object} TextContent
     * @property {array} items - array of {@link TextItem}
     * @property {Object} styles - {@link TextStyles} objects, indexed by font name.
     */
    interface TextContent {
        items: TextItem[];
        styles: { [fontName: string]: TextStyles };
    }

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
    type TextDirection = "ttb" | "ltr" | "rtl";
    interface TextItem {
        str: string;
        dir: TextDirection;
        transform: Transform;
        width: number;
        height: number;
        fontName: string;
    }

    /**
     * Text style.
     *
     * @typedef {Object} TextStyle
     * @property {number} ascent - font ascent.
     * @property {number} descent - font descent.
     * @property {boolean} vertical - text is in vertical mode.
     * @property {string} fontFamily - possible font family
     */
    interface TextStyles {
        ascent: number;
        descent: number;
        vertical?: boolean;
        fontFamily: string;
    }

    /**
     * PDF document loading operation.
     * @class
     * @alias PDFDocumentLoadingTask
     */
    interface PDFDocumentLoadingTask {
        /**
         * Unique document loading task id -- used in MessageHandlers.
         * @type {string}
         */
        docId: string;

        /**
         * Shows if loading task is destroyed.
         * @type {boolean}
         */
        destroyed: boolean;

        /**
         * Callback to request a password if wrong or no password was provided.
         * The callback receives two parameters: function that needs to be called
         * with new password and reason (see {PasswordResponses}).
         */
        onPassword: passwordCallback | null;

        /**
         * Callback to be able to monitor the loading progress of the PDF file
         * (necessary to implement e.g. a loading bar). The callback receives
         * an {Object} with the properties: {number} loaded and {number} total.
         */
        onProgress: documentLoadingProgressCallback | null;

        /**
         * Callback to when unsupported feature is used. The callback receives
         * an {UNSUPPORTED_FEATURES} argument.
         */
        onUnsupportedFeature: unsupportedFeatureCallback | null;

        /**
         * @type {Promise<PDFDocumentProxy>}
         */
        promise: Promise<PDFDocumentProxy>;

        /**
         * Aborts all network requests and destroys worker.
         * @return {Promise} A promise that is resolved after destruction activity
         *                   is completed.
         */
        destroy(): Promise<void>;

        /**
         * Registers callbacks to indicate the document loading completion.
         *
         * @param {function} onFulfilled The callback for the loading completion.
         * @param {function} onRejected The callback for the loading failure.
         * @return {Promise} A promise that is resolved after the onFulfilled or
         *                   onRejected callback.
         */
        then<R1, R2>(
            onFulfilled?: (value?: PDFDocumentProxy) => R1 | PromiseLike<R1>,
            onRejected?: (reason?: Error) => R2 | PromiseLike<R2>
        ): Promise<R1 | R2>;
    }

    type documentLoadingProgressCallback = (
        documentLoadingProgress: DocumentLoadingProgress
    ) => void;

    type passwordCallback = (
        newPassword: (password: string) => void,
        reason: PasswordResponses
    ) => void;

    type unsupportedFeatureCallback = (feature: UNSUPPORTED_FEATURES) => void;

    interface DocumentLoadingProgress {
        loaded: number;
        total: number;
    }

    interface CMapReaderFactory {
        fetch(args: {
            name: string;
        }): Promise<{ cMapData: Uint8Array; compressionType: CMapCompressionType }>;
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
     * @property {PDFWorker}  worker - The worker that will be used for the loading
     *   and parsing of the PDF data.
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
    interface DocumentInitParameters {
        url?: string;
        data?: Uint8Array | ArrayLike<number> | ArrayBufferLike | string;
        headers?: Headers;
        withCredentials?: boolean;
        password?: string;
        initialData?: Uint8Array;
        length?: number;
        range?: PDFDataRangeTransport;
        rangeChunkSize?: number;
        worker?: PDFWorker;
        postMessageTransfers?: boolean;
        verbosity?: VerbosityLevel;
        docBaseUrl?: string;
        nativeImageDecoderSupport?: NativeImageDecoding;
        cMapUrl?: string;
        cMapPacked?: boolean;
        CMapReaderFactory?: CMapReaderFactory;
        stopAtErrors?: boolean;
        maxImageSize?: number;
        isEvalSupported?: boolean;
        disableFontFace?: boolean;
        disableRange?: boolean;
        disableStream?: boolean;
        disableAutoFetch?: boolean;
        disableCreateObjectURL?: boolean;
        pdfBug?: boolean;
    }

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
    function getDocument(
        src: string | Uint8Array | DocumentInitParameters | PDFDataRangeTransport
    ): PDFDocumentLoadingTask;

    //
    // src/display/api_compatibility.js
    //
    namespace apiCompatibilityParams {
        const userAgent: string;
        const isIE: boolean;
        const isIOS: boolean;
        const isIOSChrome: boolean;
        const isSafari: boolean;
        const disableCreateObjectURL: boolean | undefined;
        const disableRange: boolean | undefined;
        const disableStream: boolean | undefined;
    }

    //
    // src/display/dom_utils.js
    //
    class RenderingCancelledException extends Error {
        type: string;
        constructor(msg: string, type: string);
    }

    enum LinkTarget {}

    namespace LinkTarget {
        const NONE: LinkTarget; // Default value.
        const SELF: LinkTarget;
        const BLANK: LinkTarget;
        const PARENT: LinkTarget;
        const TOP: LinkTarget;
    }

    /**
     * Adds various attributes (href, title, target, rel) to hyperlinks.
     * @param {HTMLLinkElement} link - The link element.
     * @param {ExternalLinkParameters} params
     */
    function addLinkAttributes(
        link: HTMLLinkElement,
        params: ExternalLinkParameters
    ): void;

    // Gets the file name from a given URL.
    function getFilenameFromUrl(url: string): string;

    interface CanvasAndContext {
        canvas: HTMLCanvasElement;
        context: CanvasRenderingContext2D;
    }

    interface CanvasFactory {
        create(width: number, height: number): CanvasAndContext;
        reset(cac: CanvasAndContext, width: number, height: number): void;
        destroy(cac: CanvasAndContext): void;
    }

    interface DOMCanvasFactory extends CanvasFactory {}

    /**
     *  Constructor functions, use like `new DomCanvasFactory()`
     */
    let DOMCanvasFactory: new () => DOMCanvasFactory;

    /**
     * @typedef ExternalLinkParameters
     * @typedef {Object} ExternalLinkParameters
     * @property {string} url - An absolute URL.
     * @property {LinkTarget} target - (optional) The link target.
     *   The default value is `LinkTarget.NONE`.
     * @property {string} rel - (optional) The link relationship.
     *   The default value is `DEFAULT_LINK_REL`.
     */
    interface ExternalLinkParameters {
        url: string;
        target?: LinkTarget;
        rel?: string;
    }

    class DOMSVGFactory {
        create(width: number, height: number): SVGElement;
        createElement(type: string): SVGElement;
    }

    //
    // src/display/annotation_layer.js
    //

    /**
     * @typedef {Object} AnnotationLayerParameters
     * @property {PageViewport} viewport
     * @property {HTMLDivElement} div
     * @property {Array} annotations
     * @property {PDFPage} page
     * @property {IPDFLinkService} linkService
     * @property {string} imageResourcesPath - (optional) Path for image resources,
     *   mainly for annotation icons. Include trailing slash.
     * @property {boolean} renderInteractiveForms
     */
    interface AnnotationLayerParameters {
        viewport: PageViewport;
        div: HTMLDivElement;
        annotations: Annotation[];
        page: PDFPageProxy;
        linkService: IPDFLinkService;
        imageResourcesPath?: string;
        renderInteractiveForms: boolean;
    }

    class AnnotationLayer {
        static render(parameters: AnnotationLayerParameters): void;
        static update(parameters: AnnotationLayerParameters): void;
    }

    //
    // src/display/text_layer.js
    //

    interface TextLayerRenderTask {
        promise: Promise<void>;
        cancel(): void;
        expandTextDivs(timeout: number): void;
    }

    /**
     * Text layer render parameters.
     *
     * @typedef {Object} TextLayerRenderParameters
     * @property {TextContent} textContent - (optional) Text content to render
     *   (the object is returned by the page's getTextContent() method).
     * @property {ReadableStream} textContentStream - (optional) Text content
     *   stream to render (the stream is returned by the page's
     *   streamTextContent() method).
     * @property {HTMLElement} container - HTML element that will contain text runs.
     * @property {PageViewport} viewport - The target viewport to properly
     *   layout the text runs.
     * @property {Array} textDivs - (optional) HTML elements that are correspond
     *   the text items of the textContent input. This is output and shall be
     *   initially be set to empty array.
     * @property {Array} textContentItemsStr - (optional) Strings that correspond
     *   the `str` property of the text items of textContent input. This is output
     *   and shall be initially be set to empty array.
     * @property {number} timeout - (optional) Delay in milliseconds before
     *   rendering of the text  runs occurs.
     * @property {boolean} enhanceTextSelection - (optional) Whether to turn on the
     *   text selection enhancement.
     */
    interface TextLayerRenderParameters {
        textContent?: TextContent;
        textContentStream?: ReadableStream;
        container: HTMLElement;
        viewport: PageViewport;
        textDivs?: HTMLElement[];
        textContentItemsStr?: string[];
        timeout?: number;
        enhanceTextSelection?: boolean;
    }

    /**
     * Starts rendering of the text layer.
     *
     * @param {TextLayerRenderParameters} renderParameters
     * @returns {TextLayerRenderTask}
     */
    function renderTextLayer(
        renderParameters: TextLayerRenderParameters
    ): TextLayerRenderTask;

    //
    // src/display/metadata.js
    //
    class Metadata {
        get(name: string): string | null;
        getAll(): StringMap;
        has(name: string): boolean;
    }

    //
    // src/display/svg.js
    //
    class SVGGraphics {
        svgFactory: DOMSVGFactory;
        commonObjs: PDFObjects;
        objs: PDFObjects;
        forceDataSchema: boolean;
        embedFonts: boolean;

        constructor(commonObjs: PDFObjects, objs: PDFObjects, forceDataSchema?: boolean);

        getSVG(
            operatorList: PDFOperatorList,
            viewport: PageViewport
        ): Promise<SVGElement>;
    }

    //
    // src/display/worker_options.js
    //
    namespace GlobalWorkerOptions {
        /**
         * Defines global port for worker process. Overrides the `workerSrc` option.
         * @var {Object}
         */
        let workerPort: MessagePort | null;

        /**
         * Path and filename of the worker file. Required when workers are enabled in
         * development mode. If unspecified in production builds, the worker will be
         * loaded based on the location of the `pdf.js` file.
         *
         * NOTE: The `workerSrc` should always be set in custom applications, in order
         *       to prevent issues caused by third-party frameworks and libraries.
         * @var {string}
         */
        let workerSrc: string;
    }
}
