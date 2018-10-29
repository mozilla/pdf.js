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
  // web/interfaces.js
  //

  /**
   * @interface
   */
  class IRenderableView {
    /**
     * @returns {string} - Unique ID for rendering queue.
     */
    renderingId: string;

    /**
     * @returns {RenderingStates}
     */
    renderingState: RenderingStates;

    /**
     * @returns {Promise} Resolved on draw completion.
     */
    draw(): Promise<void>;

    resume(): void;
  }

  interface IL10n {
    /**
     * @returns {Promise<string>} - Resolves to the current locale.
     */
    getLanguage(): Promise<string>;

    /**
     * @returns {Promise<string>} - Resolves to 'rtl' or 'ltr'.
     */
    getDirection(): Promise<TextDirection>;

    /**
     * Translates text identified by the key and adds/formats data using the args
     * property bag. If the key was not found, translation falls back to the
     * fallback text.
     * @param {string} key
     * @param {object} args
     * @param {string} fallback
     * @returns {Promise<string>}
     */
    get(key: string, args: StringMap, fallback: string): Promise<string>;

    /**
     * Translates HTML element.
     * @param {HTMLElement} element
     * @returns {Promise<void>}
     */
    translate(element: HTMLElement): Promise<void>;
  }

  interface IPDFTextLayerFactory {
    createTextLayerBuilder(
      textLayerDiv: HTMLDivElement,
      pageIndex: PageIndex,
      viewport: PageViewport,
      enhanceTextSelection?: boolean
    ): TextLayerBuilder;
  }

  interface IPDFAnnotationLayerFactory {
    /**
     * @param {HTMLDivElement} pageDiv
     * @param {PDFPage} pdfPage
     * @param {string} imageResourcesPath - (optional) Path for image resources,
     *   mainly for annotation icons. Include trailing slash.
     * @param {boolean} renderInteractiveForms
     * @param {IL10n} l10n
     * @returns {AnnotationLayerBuilder}
     */
    createAnnotationLayerBuilder(
      pageDiv: HTMLDivElement,
      pdfPage: PDFPageProxy,
      imageResourcesPath?: string,
      renderInteractiveForms?: boolean,
      l10n?: IL10n
    ): AnnotationLayerBuilder;
  }

  interface IPDFLinkService {
    /**
     * @returns {number}
     */
    page: number;

    /**
     * @returns {number}
     */
    rotation: number;

    /**
     * @param {string|Array} dest - The named, or explicit, PDF destination.
     */
    navigateTo(dest: Destination): void;

    /**
     * @param {string|Array} dest - The PDF destination object.
     * @returns {string} The hyperlink to the PDF object.
     */
    getDestinationHash(dest: Destination): string;

    /**
     * Prefix the full url on anchor links to make sure that links are resolved
     * relative to the current URL instead of the one defined in <base href>.
     * @param {String} anchor The anchor hash, including the #.
     * @returns {string} The hyperlink to the PDF object.
     */
    getAnchorUrl(hash: string): string;

    /**
     * @param {string} hash
     */
    setHash(hash: string): void;

    /**
     * @param {string} action
     */
    executeNamedAction(action: string): void;

    /**
     * @param {Object} params
     */
    onFileAttachmentAnnotation(params: {
      id: string;
      filename: string;
      content: any;
    }): void;

    /**
     * @param {number} pageNum - page number.
     * @param {Object} pageRef - reference to the page.
     */
    cachePageRef(pageNum: number, pageRef: Ref): void;
  }

  //
  // web/pdf_link_service.js
  //
  interface SimpleLinkService extends IPDFLinkService {}
  let SimpleLinkService: new () => SimpleLinkService;

  interface PDFLinkService extends IPDFLinkService {
    eventBus: EventBus;
    baseUrl: string;
    pdfDocument: PDFDocumentProxy;
    pdfViewer: PDFViewer;
    pdfHistory: PDFHistory;
    setDocument(pdfDocument: PDFDocumentProxy, baseUrl: string): void;
    setViewer(pdfViewer: PDFViewer): void;
    setHistory(pdfHistory: PDFHistory): void;
  }

  /**
   * @typedef {Object} PDFLinkServiceOptions
   * @property {EventBus} eventBus - The application event bus.
   * @property {number} externalLinkTarget - (optional) Specifies the `target`
   *   attribute for external links. Must use one of the values from {LinkTarget}.
   *   Defaults to using no target.
   * @property {string} externalLinkRel - (optional) Specifies the `rel` attribute
   *   for external links. Defaults to stripping the referrer.
   */
  interface PDFLinkServiceOptions {
    eventBus?: EventBus;
    externalLinkTarget?: LinkTarget;
    externalLinkRel?: string;
  }

  /**
   * @param {PDFLinkServiceOptions} options
   * Constructor for PDFLinkService
   */
  let PDFLinkService: new (options?: PDFLinkServiceOptions) => PDFLinkService;

  //
  // web/ui_utils.js
  //

  enum TextLayerMode {}

  namespace TextLayerMode {
    const DISABLE: TextLayerMode;
    const ENABLE: TextLayerMode;
    const ENABLE_ENHANCE: TextLayerMode;
  }

  /**
   * Simple event bus for an application. Listeners are attached using the
   * `on` and `off` methods. To raise an event, the `dispatch` method shall be
   * used.
   */
  class EventBus {
    constructor();
    on(eventName: string, listener: (...args: any[]) => void): void;
    off(eventName: string, listener: (...args: any[]) => void): void;
    dispatch(eventName: string, ...args: any[]): void;
  }

  enum RendererType {
    CANVAS,
    SVG
  }

  /**
   * No-op implemetation of the localization service.
   * @implements {IL10n}
   */
  interface NullL10n extends IL10n {}

  class ProgressBar {
    visible: boolean;
    div: HTMLDivElement;
    bar: HTMLElement; // Loading bar element
    height: number;
    width: number;
    units: string;
    percent: number;

    constructor(
      id: string,
      options?: { height?: number; width?: number; units?: string }
    );
    setWidth(viewer: HTMLElement | undefined): void;
    hide(): void;
    show(): void;
  }

  //
  // web/pdf_rendering_queue.js
  //
  enum RenderingStates {
    INITIAL,
    RUNNING,
    PAUSED,
    FINISHED
  }

  /**
   * Controls rendering of the views for pages and thumbnails.
   */
  class PDFRenderingQueue {
    pdfViewer: PDFViewer | null;
    pdfThumbnailViewer: PDFThumbnailViewer | null;
    highestPriorityPage: PageIndex | null;
    idleTimeout: number | null;
    printing: boolean;
    isThumbnailViewEnabled: boolean;

    constructor();

    /**
     * @param {PDFViewer} pdfViewer
     */
    setViewer(pdfViewer: PDFViewer): void;

    /**
     * @param {PDFThumbnailViewer} pdfThumbnailViewer
     */
    setThumbnailViewer(pdfThumbnailViewer: PDFThumbnailViewer): void;

    /**
     * @param {IRenderableView} view
     * @returns {boolean}
     */
    isHighestPriority(view: IRenderableView): boolean;

    /**
     * @param {Object} currentlyVisiblePages
     */
    renderHighestPriority(currentlyVisiblePages?: VisiblePages): void;

    /**
     * @param {Object} visible
     * @param {Array} views
     * @param {boolean} scrolledDown
     */
    getHighestPriority(
      visible: VisiblePages,
      views: PDFPageView[],
      scrolledDown: boolean
    ): PDFPageView;

    /**
     * @param {IRenderableView} view
     * @returns {boolean}
     */
    isViewFinished(view: IRenderableView): boolean;

    /**
     * Render a page or thumbnail view. This calls the appropriate function
     * based on the views state. If the view is already rendered it will return
     * `false`.
     *
     * @param {IRenderableView} view
     */
    renderView(view: IRenderableView): boolean;
  }

  //
  // web/base_viewer.js
  //

  /**
   * Simple viewer control to display PDF content/pages.
   * @implements {IRenderableView}
   */
  class BaseViewer {
    /**
     * @param {PDFViewerOptions} options
     */
    constructor(options: PDFViewerOptions);

    readonly pagesCount: number;
    getPageView(index: number): PDFPageView;

    /**
     * @param {number} val - The page number.
     */
    currentPageNumber: number;

    /**
     * @returns {string|null} Returns the current page label,
     *                        or `null` if no page labels exist.
     */
    currentPageLabel: string | null;

    /**
     * @returns {boolean} true if all {PDFPageView} objects are initialized.
     */
    pageViewsReady: boolean;

    /**
     * @param {number} val - Scale of the pages in percents.
     */
    currentScale: number;

    /**
     * @param val - The scale of the pages (in percent or predefined value).
     */
    currentScaleValue: string;

    /**
     * @param {number} rotation - The rotation of the pages (0, 90, 180, 270).
     */
    pagesRotation: number;

    setDocument(pdfDocument: PDFDocumentProxy): void;

    setPageLabels(labels: string[] | null): void;

    /**
     * Scrolls page into view.
     * @param {ScrollPageIntoViewParameters} params
     */
    scrollPageIntoView(params: ScrollPageIntoViewParameters): void;

    update(): void;
    containsElement(element: HTMLElement): boolean;
    focus(): void;
    readonly isInPresentationMode: boolean;
    readonly isChangingPresentationMode: boolean;
    readonly isHorizontalScrollbarEnabled: boolean;
    cleanup(): void;
    forceRendering(currentlyVisiblePages?: VisiblePages): boolean;
    getPageTextContent(pageIndex: PageIndex): TextContent;

    /**
     * @param {HTMLDivElement} textLayerDiv
     * @param {number} pageIndex
     * @param {PageViewport} viewport
     * @returns {TextLayerBuilder}
     */
    createTextLayerBuilder(
      textLayerDiv: HTMLDivElement,
      pageIndex: PageIndex,
      viewport: PageViewport,
      enhanceTextSelection?: boolean
    ): TextLayerBuilder;

    /**
     * @param {HTMLDivElement} pageDiv
     * @param {PDFPage} pdfPage
     * @param {boolean} renderInteractiveForms
     * @param {IL10n} l10n
     * @returns {AnnotationLayerBuilder}
     */
    createAnnotationLayerBuilder(
      pageDiv: HTMLDivElement,
      pdfPage: PDFPageProxy,
      renderInteractiveForms?: boolean,
      l10n?: IL10n
    ): AnnotationLayerBuilder;

    setFindController(findController: any): void;

    /**
     * @returns {boolean} Whether all pages of the PDF document have identical
     *                    widths and heights.
     */
    readonly hasEqualPageSizes: boolean;

    /**
     * Returns sizes of the pages.
     * @returns {Array} Array of objects with width/height/rotation fields.
     */
    getPagesOverview(): PageSize[];
  }

  interface PageSize {
    width: number;
    height: number;
    rotation: number;
  }

  /**
   * @typedef ScrollPageIntoViewParameters
   * @property {number} pageNumber - The page number.
   * @property {Array} destArray - (optional) The original PDF destination
   *   array, in the format: <page-ref> </XYZ|/FitXXX> <args..>
   * @property {boolean} allowNegativeOffset - (optional) Allow negative page
   *   offsets. The default value is `false`.
   */
  interface ScrollPageIntoViewParameters {
    pageNumber: number;
    destArray?: any[];
    allowNegativeOffset?: boolean;
  }

  /**
   * @typedef {Object} PDFViewerOptions
   * @property {HTMLDivElement} container - The container for the viewer element.
   * @property {HTMLDivElement} viewer - (optional) The viewer element.
   * @property {EventBus} eventBus - The application event bus.
   * @property {IPDFLinkService} linkService - The navigation/linking service.
   * @property {DownloadManager} downloadManager - (optional) The download
   *   manager component.
   * @property {PDFRenderingQueue} renderingQueue - (optional) The rendering
   *   queue object.
   * @property {boolean} removePageBorders - (optional) Removes the border shadow
   *   around the pages. The default value is `false`.
   * @property {number} textLayerMode - (optional) Controls if the text layer used
   *   for selection and searching is created, and if the improved text selection
   *   behaviour is enabled. The constants from {TextLayerMode} should be used.
   *   The default value is `TextLayerMode.ENABLE`.
   * @property {string} imageResourcesPath - (optional) Path for image resources,
   *   mainly for annotation icons. Include trailing slash.
   * @property {boolean} renderInteractiveForms - (optional) Enables rendering of
   *   interactive form elements. The default is `false`.
   * @property {boolean} enablePrintAutoRotate - (optional) Enables automatic
   *   rotation of pages whose orientation differ from the first page upon
   *   printing. The default is `false`.
   * @property {string} renderer - 'canvas' or 'svg'. The default is 'canvas'.
   * @property {boolean} enableWebGL - (optional) Enables WebGL accelerated
   *   rendering for some operations. The default value is `false`.
   * @property {boolean} useOnlyCssZoom - (optional) Enables CSS only zooming.
   *   The default value is `false`.
   * @property {number} maxCanvasPixels - (optional) The maximum supported canvas
   *   size in total pixels, i.e. width * height. Use -1 for no limit.
   *   The default value is 4096 * 4096 (16 mega-pixels).
   * @property {IL10n} l10n - Localization service.
   */
  interface PDFViewerOptions {
    container: HTMLDivElement;
    viewer?: HTMLDivElement;
    eventBus?: EventBus;
    linkService?: IPDFLinkService;
    downloadManager?: DownloadManager;
    renderingQueue?: PDFRenderingQueue;
    removePageBorders?: boolean;
    textLayerMode?: TextLayerMode;
    imageResourcesPath?: string;
    renderInteractiveForms?: boolean;
    enablePrintAutoRotate?: boolean;
    renderer?: RendererType;
    enableWebGL?: boolean;
    useOnlyCssZoom?: boolean;
    maxCanvasPixels?: number;
    l10n?: IL10n;
  }

  //
  // web/text_layer_builder.js
  //

  /**
   * @typedef {Object} TextLayerBuilderOptions
   * @property {HTMLDivElement} textLayerDiv - The text layer container.
   * @property {EventBus} eventBus - The application event bus.
   * @property {number} pageIndex - The page index.
   * @property {PageViewport} viewport - The viewport of the text layer.
   * @property {PDFFindController} findController
   * @property {boolean} enhanceTextSelection - Option to turn on improved
   *   text selection.
   */

  interface TextLayerBuilderOptions {
    textLayerDiv: HTMLDivElement;
    eventBus: EventBus;
    pageIndex: PageIndex;
    viewport: PageViewport;
    findController: PDFFindController;
    enhanceTextSelection: boolean;
  }

  /**
   * The text layer builder provides text selection functionality for the PDF.
   * It does this by creating overlay divs over the PDF's text. These divs
   * contain text that matches the PDF text they are overlaying. This object
   * also provides a way to highlight text that is being searched for.
   */
  class TextLayerBuilder {
    constructor(arg: TextLayerBuilderOptions);
    textLayerDiv: HTMLDivElement;
    eventBus: EventBus;
    textContent: TextContent | null;
    textContentItemsStr: string[];
    textContentStream: ReadableStream | null;
    renderingDone: boolean;
    pageIdx: PageIndex;
    pageNumber: number;
    matches: Match[];
    viewport: PageViewport;
    textDivs: HTMLDivElement[];
    findController: PDFFindController;
    textLayerRenderTask: TextLayerRenderTask | null;
    enhanceTextSelection: boolean;
  }

  interface TextPosition {
    divIdx: number;
    offset: number;
  }

  interface Match {
    begin: TextPosition;
    end: TextPosition;
  }

  /**
   * @implements IPDFTextLayerFactory
   */
  class DefaultTextLayerFactory implements IPDFTextLayerFactory {
    /**
     * @param {HTMLDivElement} textLayerDiv
     * @param {number} pageIndex
     * @param {PageViewport} viewport
     * @param {boolean} enhanceTextSelection
     * @returns {TextLayerBuilder}
     */
    createTextLayerBuilder(
      textLayerDiv: HTMLDivElement,
      pageIndex: PageIndex,
      viewport: PageViewport,
      enhanceTextSelection?: boolean
    ): TextLayerBuilder;
  }

  //
  // web/pdf_find_controller.js
  //

  interface PDFFindControllerOptions {
    pdfViewer: PDFViewer;
  }

  interface FindCommandState {
    query: string;
    phraseSearch: boolean;
    caseSensitive: boolean;
    highlightAll: boolean;
    findPrevious: boolean;
  }

  class PDFFindController {
    constructor(options: PDFFindControllerOptions);
    reset(): void;
    nextMatch(): void;
    executeCommand(cmd: string, state: FindCommandState): void;
  }

  //
  // web/annotation_layer_builder.js
  //
  /**
   * @typedef {Object} AnnotationLayerBuilderOptions
   * @property {HTMLDivElement} pageDiv
   * @property {PDFPage} pdfPage
   * @property {boolean} renderInteractiveForms
   * @property {IPDFLinkService} linkService
   * @property {DownloadManager} downloadManager
   * @property {IL10n} l10n - Localization service.
   */

  interface AnnotationLayerBuilderOptions {
    AnnotationLayerBuilderOptions: Object;
    pageDiv: HTMLDivElement;
    pdfPage: PDFPageProxy;
    renderInteractiveForms: boolean;
    linkService: IPDFLinkService;
    downloadManager: DownloadManager;
    l10n: IL10n;
  }

  class AnnotationLayerBuilder {
    pageDiv: HTMLDivElement;
    pdfPage: PDFPageProxy;
    linkService: IPDFLinkService;
    downloadManager: DownloadManager;
    renderInteractiveForms: boolean;
    l10n: IL10n;
    div: HTMLDivElement | null;

    constructor(options: AnnotationLayerBuilderOptions);

    /**
     * @param {PageViewport} viewport
     * @param {string} intent (default value is 'display')
     */
    render(viewport: PageViewport, intent?: string): void;

    cancel(): void;
    hide(): void;
  }

  /**
   * @implements IPDFAnnotationLayerFactory
   */
  class DefaultAnnotationLayerFactory implements IPDFAnnotationLayerFactory {
    /**
     * @param {HTMLDivElement} pageDiv
     * @param {PDFPage} pdfPage
     * @param {string} imageResourcesPath - (optional) Path for image resources,
     *   mainly for annotation icons. Include trailing slash.
     * @param {boolean} renderInteractiveForms
     * @param {IL10n} l10n
     * @returns {AnnotationLayerBuilder}
     */
    createAnnotationLayerBuilder(
      pageDiv: HTMLDivElement,
      pdfPage: PDFPageProxy,
      imageResourcesPath?: string,
      renderInteractiveForms?: boolean,
      l10n?: IL10n
    ): AnnotationLayerBuilder;
  }

  //
  // web/download_manager.js
  //
  interface DownloadManager {
    downloadUrl(url: URL | string, filename: string): void;
    downloadData(data: Uint8Array, filename: string, contentType: string): void;
    download(blob: Blob, url: URL | string, filename: string): void;
  }

  //
  // web/pdf_page_view.js
  //
  interface PageView {
    id: number;
    x: number;
    y: number;
    view: PDFPageView;
  }

  interface VisiblePages {
    first: PDFPageView;
    last: PDFPageView;
    views: PDFPageView[];
  }

  /**
   * @typedef {Object} PDFPageViewOptions
   * @property {HTMLDivElement} container - The viewer element.
   * @property {EventBus} eventBus - The application event bus.
   * @property {number} id - The page unique ID (normally its number).
   * @property {number} scale - The page scale display.
   * @property {PageViewport} defaultViewport - The page viewport.
   * @property {PDFRenderingQueue} renderingQueue - The rendering queue object.
   * @property {IPDFTextLayerFactory} textLayerFactory
   * @property {number} textLayerMode - (optional) Controls if the text layer used
   *   for selection and searching is created, and if the improved text selection
   *   behaviour is enabled. The constants from {TextLayerMode} should be used.
   *   The default value is `TextLayerMode.ENABLE`.
   * @property {IPDFAnnotationLayerFactory} annotationLayerFactory
   * @property {string} imageResourcesPath - (optional) Path for image resources,
   *   mainly for annotation icons. Include trailing slash.
   * @property {boolean} renderInteractiveForms - Turns on rendering of
   *   interactive form elements. The default is `false`.
   * @property {string} renderer - 'canvas' or 'svg'. The default is 'canvas'.
   * @property {boolean} enableWebGL - (optional) Enables WebGL accelerated
   *   rendering for some operations. The default value is `false`.
   * @property {boolean} useOnlyCssZoom - (optional) Enables CSS only zooming.
   *   The default value is `false`.
   * @property {number} maxCanvasPixels - (optional) The maximum supported canvas
   *   size in total pixels, i.e. width * height. Use -1 for no limit.
   *   The default value is 4096 * 4096 (16 mega-pixels).
   * @property {IL10n} l10n - Localization service.
   */

  interface PDFPageViewOptions {
    container: HTMLDivElement;
    eventBus: EventBus;
    id: PageIndex;
    scale: number;
    defaultViewport: PageViewport;
    renderingQueue: PDFRenderingQueue;
    textLayerFactory: IPDFTextLayerFactory;
    textLayerMode: TextLayerMode;
    annotationLayerFactory: IPDFAnnotationLayerFactory;
    imageResourcesPath?: string;
    renderInteractiveForms: boolean;
    renderer: RendererType;
    enableWebGL?: boolean;
    useOnlyCssZoom?: boolean;
    maxCanvasPixels?: number;
    l10n: IL10n;
  }

  class PDFPageView {
    id: PageIndex;
    renderingId: string;
    pdfPage: PDFPageProxy | null;
    pageLabel: string | null;
    rotation: number;
    scale: number;
    viewport: PageViewport;
    pdfPageRotate: number;
    hasRestrictedScaling: boolean;
    enhanceTextSelection: boolean;
    renderInteractiveForms: boolean;
    eventBus: EventBus;
    renderingQueue: PDFRenderingQueue;
    textLayerFactory: IPDFTextLayerFactory;
    annotationLayerFactory: IPDFAnnotationLayerFactory;
    renderer: RendererType;
    l10n: IL10n;
    paintTask: RenderTask | null;
    paintedViewportMap: WeakMap<HTMLCanvasElement | SVGElement, PageViewport>;
    renderingState: RenderingStates;
    resume: () => void | null;
    error: Error | null;
    onBeforeDraw: () => void | null;
    onAfterDraw: () => void | null;
    annotationLayer: AnnotationLayerBuilder | null;
    textLayer: TextLayerBuilder | null;
    zoomLayer: any | null;
    div: HTMLDivElement;

    constructor(options: PDFPageViewOptions);
    setPdfPage(pdfPage: PDFPageProxy): void;
    destroy(): void;
    reset(keepZoomLayer?: boolean, keepAnnotations?: boolean): void;
    update(scale?: number, rotation?: number): void;
    cancelRendering(keepAnnotations?: boolean): void;
    cssTransform(
      target: HTMLCanvasElement | SVGElement,
      redrawAnnotations?: boolean
    ): void;
    width: number;
    height: number;
    getPagePoint(x: number, y: number): Point;
    draw(): Promise<void>;
    paintOnCanvas(canvasWrapper: HTMLDivElement): RenderTask;
    paintOnSvg(wrapper: HTMLDivElement): RenderTask;
    /**
     * @param {string|null} label
     */
    setPageLabel(label: string | null): void;
  }

  //
  // web/pdf_viewer.js
  //
  class PDFViewer extends BaseViewer {
    update(): void;
  }

  //
  // web/pdf_thumbnail_viewer.js
  //

  /**
   * @typedef {Object} PDFThumbnailViewerOptions
   * @property {HTMLDivElement} container - The container for the thumbnail
   *   elements.
   * @property {IPDFLinkService} linkService - The navigation/linking service.
   * @property {PDFRenderingQueue} renderingQueue - The rendering queue object.
   * @property {IL10n} l10n - Localization service.
   */
  interface PDFThumbnailViewerOptions {
    container: HTMLDivElement;
    linkService: IPDFLinkService;
    renderingQueue: PDFRenderingQueue;
    l10n: IL10n;
  }

  class PDFThumbnailViewer {
    container: HTMLDivElement;
    linkService: IPDFLinkService;
    renderingQueue: PDFRenderingQueue;
    l10n: IL10n;
    scroll: {
      down: boolean;
      lastY: number;
      _eventHandler: (evt: any) => void;
    };

    constructor(options: PDFThumbnailViewerOptions);
    getThumbnail(index: PageIndex): PDFThumbnailView;
    scrollThumbnailIntoView(page: PageIndex): void;
    pagesRotation: number;
    cleanup(): void;
    setDocument(pdfDocument: PDFDocumentProxy): void;
    setPageLabels(labels: string[]): void;
    forceRendering(): boolean;
  }

  /**
   * @typedef {Object} PDFThumbnailViewOptions
   * @property {HTMLDivElement} container - The viewer element.
   * @property {number} id - The thumbnail's unique ID (normally its number).
   * @property {PageViewport} defaultViewport - The page viewport.
   * @property {IPDFLinkService} linkService - The navigation/linking service.
   * @property {PDFRenderingQueue} renderingQueue - The rendering queue object.
   * @property {boolean} disableCanvasToImageConversion - (optional) Don't convert
   *   the canvas thumbnails to images. This prevents `toDataURL` calls,
   *   but increases the overall memory usage. The default value is `false`.
   * @property {IL10n} l10n - Localization service.
   */
  interface PDFThumbnailViewOptions {
    container: HTMLDivElement;
    id: PageIndex;
    defaultViewport: PageViewport;
    linkService: IPDFLinkService;
    renderingQueue: PDFRenderingQueue;
    disableCanvasToImageConversion?: boolean;
    l10n: IL10n;
  }

  //
  // web/pdf_thumbnail_view.js
  //
  class PDFThumbnailView {
    id: PageIndex;
    renderingId: string;
    pageLabel: string | null;
    pdfPage: PDFPageProxy | null;
    rotation: number;
    viewport: PageViewport;
    pdfPageRotate: number;
    linkService: IPDFLinkService;
    renderingQueue: PDFRenderingQueue;
    renderTask: RenderTask | null;
    renderingState: RenderingStates;
    resume: () => void | null;
    disableCanvasToImageConversion: boolean;
    pageWidth: number;
    pageHeight: number;
    pageRatio: number;
    canvasWidth: number;
    canvasHeight: number;
    scale: number;
    l10n: IL10n;

    // container > anchor > div.thumbnail[data-page-number=<page#>] > ring.thumbnailSelectionRing
    anchor: HTMLAnchorElement;
    div: HTMLDivElement;
    ring: HTMLDivElement;

    constructor(options: PDFThumbnailViewerOptions);
    setPdfPage(pdfPage: PDFPageProxy): void;
    reset(): void;
    update(rotation: number): void;
    cancelRendering(): void;
    draw(): Promise<void>;
    setImage(pageView: PageView): void;
    readonly pageId: PageIndex;
    setPageLabel(label: string | null): void;
    static cleanup(): void;
  }

  //
  // web/pdf_history.js
  //

  /**
   * @typedef {Object} PDFHistoryOptions
   * @property {IPDFLinkService} linkService - The navigation/linking service.
   * @property {EventBus} eventBus - The application event bus.
   */
  interface PDFHistoryOptions {
    linkService: IPDFLinkService;
    eventBus?: EventBus;
  }

  /**
   * @typedef {Object} PushParameters
   * @property {string} namedDest - (optional) The named destination. If absent,
   *   a stringified version of `explicitDest` is used.
   * @property {Array} explicitDest - The explicit destination array.
   * @property {number} pageNumber - The page to which the destination points.
   */
  interface PushParameters {
    namedDest: string;
    explicitDest: Destination[];
    pageNumber: number;
  }

  class PDFHistory {
    linkService: IPDFLinkService;
    eventBus: EventBus;
    initialized: boolean;
    initialBookmark: string | null;
    initialRotation: number | null;

    constructor(options: PDFHistoryOptions);

    /**
     * Initialize the history for the PDF document, using either the current
     * browser history entry or the document hash, whichever is present.
     * @param {string} fingerprint - The PDF document's unique fingerprint.
     * @param {boolean} resetHistory - (optional) Reset the browsing history.
     */
    initialize(fingerprint: string, resetHistory?: boolean): void;

    /**
     * Push an internal destination to the browser history.
     * @param {PushParameters}
     */
    push(parameters: PushParameters): void;

    /**
     * Push the current position to the browser history.
     */
    pushCurrentPosition(): void;

    /**
     * Go back one step in the browser history.
     * NOTE: Avoids navigating away from the document, useful for "named actions".
     */
    back(): void;

    /**
     * Go forward one step in the browser history.
     * NOTE: Avoids navigating away from the document, useful for "named actions".
     */
    forward(): void;

    /**
     * @returns {boolean} Indicating if the user is currently moving through the
     *   browser history, useful e.g. for skipping the next 'hashchange' event.
     */
    readonly popStateInProgress: boolean;
  }

  //
  // web/pdf_single_page_viewer.js
  //
  class PDFSinglePageViewer extends BaseViewer {
    constructor(options: PDFViewerOptions);
    update(): void;
  }

  //
  // web/genericl10n.js
  //
  interface GenericL10n extends IL10n {}

  // Constructor function
  let GenericL10n: new (lang: string) => GenericL10n;
}
