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
/* globals PDFBug, Stats */

import {
  animationStarted,
  AutoPrintRegExp,
  DEFAULT_SCALE_VALUE,
  getGlobalEventBus,
  getPDFFileNameFromURL,
  isValidRotation,
  isValidScrollMode,
  isValidSpreadMode,
  MAX_SCALE,
  MIN_SCALE,
  noContextMenuHandler,
  normalizeWheelEventDelta,
  parseQueryString,
  PresentationModeState,
  ProgressBar,
  RendererType,
  ScrollMode,
  SpreadMode,
  TextLayerMode,
} from "./ui_utils.js";
import { AppOptions, OptionKind } from "./app_options.js";
import {
  build,
  getDocument,
  getFilenameFromUrl,
  GlobalWorkerOptions,
  InvalidPDFException,
  LinkTarget,
  loadScript,
  MissingPDFException,
  OPS,
  PDFWorker,
  shadow,
  UnexpectedResponseException,
  UNSUPPORTED_FEATURES,
  version,
} from "pdfjs-lib";
import { CursorTool, PDFCursorTools } from "./pdf_cursor_tools.js";
import { PDFRenderingQueue, RenderingStates } from "./pdf_rendering_queue.js";
import { PDFSidebar, SidebarView } from "./pdf_sidebar.js";
import { OverlayManager } from "./overlay_manager.js";
import { PasswordPrompt } from "./password_prompt.js";
import { PDFAttachmentViewer } from "./pdf_attachment_viewer.js";
import { PDFDocumentProperties } from "./pdf_document_properties.js";
import { PDFFindBar } from "./pdf_find_bar.js";
import { PDFFindController } from "./pdf_find_controller.js";
import { PDFHistory } from "./pdf_history.js";
import { PDFLinkService } from "./pdf_link_service.js";
import { PDFOutlineViewer } from "./pdf_outline_viewer.js";
import { PDFPresentationMode } from "./pdf_presentation_mode.js";
import { PDFSidebarResizer } from "./pdf_sidebar_resizer.js";
import { PDFThumbnailViewer } from "./pdf_thumbnail_viewer.js";
import { PDFViewer } from "./pdf_viewer.js";
import { SecondaryToolbar } from "./secondary_toolbar.js";
import { Toolbar } from "./toolbar.js";
import { ViewHistory } from "./view_history.js";

const DEFAULT_SCALE_DELTA = 1.1;
const DISABLE_AUTO_FETCH_LOADING_BAR_TIMEOUT = 5000; // ms
const FORCE_PAGES_LOADED_TIMEOUT = 10000; // ms
const WHEEL_ZOOM_DISABLED_TIMEOUT = 1000; // ms

const ViewOnLoad = {
  UNKNOWN: -1,
  PREVIOUS: 0, // Default value.
  INITIAL: 1,
};

class DefaultExternalServices {
  constructor() {
    throw new Error("Cannot initialize DefaultExternalServices.");
  }

  static updateFindControlState(data) {}

  static updateFindMatchesCount(data) {}

  static initPassiveLoading(callbacks) {}

  static fallback(data, callback) {}

  static reportTelemetry(data) {}

  static createDownloadManager(options) {
    throw new Error("Not implemented: createDownloadManager");
  }

  static createPreferences() {
    throw new Error("Not implemented: createPreferences");
  }

  static createL10n(options) {
    throw new Error("Not implemented: createL10n");
  }

  static get supportsIntegratedFind() {
    return shadow(this, "supportsIntegratedFind", false);
  }

  static get supportsDocumentFonts() {
    return shadow(this, "supportsDocumentFonts", true);
  }

  static get supportedMouseWheelZoomModifierKeys() {
    return shadow(this, "supportedMouseWheelZoomModifierKeys", {
      ctrlKey: true,
      metaKey: true,
    });
  }
}

const PDFViewerApplication = {
  initialBookmark: document.location.hash.substring(1),
  initialized: false,
  fellback: false,
  appConfig: null,
  pdfDocument: null,
  pdfLoadingTask: null,
  printService: null,
  /** @type {PDFViewer} */
  pdfViewer: null,
  /** @type {PDFThumbnailViewer} */
  pdfThumbnailViewer: null,
  /** @type {PDFRenderingQueue} */
  pdfRenderingQueue: null,
  /** @type {PDFPresentationMode} */
  pdfPresentationMode: null,
  /** @type {PDFDocumentProperties} */
  pdfDocumentProperties: null,
  /** @type {PDFLinkService} */
  pdfLinkService: null,
  /** @type {PDFHistory} */
  pdfHistory: null,
  /** @type {PDFSidebar} */
  pdfSidebar: null,
  /** @type {PDFSidebarResizer} */
  pdfSidebarResizer: null,
  /** @type {PDFOutlineViewer} */
  pdfOutlineViewer: null,
  /** @type {PDFAttachmentViewer} */
  pdfAttachmentViewer: null,
  /** @type {PDFCursorTools} */
  pdfCursorTools: null,
  /** @type {ViewHistory} */
  store: null,
  /** @type {DownloadManager} */
  downloadManager: null,
  /** @type {OverlayManager} */
  overlayManager: null,
  /** @type {Preferences} */
  preferences: null,
  /** @type {Toolbar} */
  toolbar: null,
  /** @type {SecondaryToolbar} */
  secondaryToolbar: null,
  /** @type {EventBus} */
  eventBus: null,
  /** @type {IL10n} */
  l10n: null,
  isInitialViewSet: false,
  downloadComplete: false,
  isViewerEmbedded: window.parent !== window,
  url: "",
  baseUrl: "",
  externalServices: DefaultExternalServices,
  _boundEvents: {},
  contentDispositionFilename: null,

  // Called once when the document is loaded.
  async initialize(appConfig) {
    this.preferences = this.externalServices.createPreferences();
    this.appConfig = appConfig;

    await this._readPreferences();
    await this._parseHashParameters();
    await this._initializeL10n();

    if (
      this.isViewerEmbedded &&
      AppOptions.get("externalLinkTarget") === LinkTarget.NONE
    ) {
      // Prevent external links from "replacing" the viewer,
      // when it's embedded in e.g. an <iframe> or an <object>.
      AppOptions.set("externalLinkTarget", LinkTarget.TOP);
    }
    await this._initializeViewerComponents();

    // Bind the various event handlers *after* the viewer has been
    // initialized, to prevent errors if an event arrives too soon.
    this.bindEvents();
    this.bindWindowEvents();

    // We can start UI localization now.
    const appContainer = appConfig.appContainer || document.documentElement;
    this.l10n.translate(appContainer).then(() => {
      // Dispatch the 'localized' event on the `eventBus` once the viewer
      // has been fully initialized and translated.
      this.eventBus.dispatch("localized", { source: this });
    });

    this.initialized = true;
  },

  /**
   * @private
   */
  async _readPreferences() {
    if (AppOptions.get("disablePreferences") === true) {
      // Give custom implementations of the default viewer a simpler way to
      // opt-out of having the `Preferences` override existing `AppOptions`.
      return;
    }
    try {
      const prefs = await this.preferences.getAll();
      for (const name in prefs) {
        AppOptions.set(name, prefs[name]);
      }
    } catch (reason) {
      console.error(`_readPreferences: "${reason.message}".`);
    }
  },

  /**
   * Potentially parse special debugging flags in the hash section of the URL.
   * @private
   */
  async _parseHashParameters() {
    if (
      typeof PDFJSDev !== "undefined" &&
      PDFJSDev.test("PRODUCTION") &&
      !AppOptions.get("pdfBugEnabled")
    ) {
      return undefined;
    }
    const hash = document.location.hash.substring(1);
    if (!hash) {
      return undefined;
    }
    const hashParams = parseQueryString(hash),
      waitOn = [];

    if (
      "disableworker" in hashParams &&
      hashParams["disableworker"] === "true"
    ) {
      waitOn.push(loadFakeWorker());
    }
    if ("disablerange" in hashParams) {
      AppOptions.set("disableRange", hashParams["disablerange"] === "true");
    }
    if ("disablestream" in hashParams) {
      AppOptions.set("disableStream", hashParams["disablestream"] === "true");
    }
    if ("disableautofetch" in hashParams) {
      AppOptions.set(
        "disableAutoFetch",
        hashParams["disableautofetch"] === "true"
      );
    }
    if ("disablefontface" in hashParams) {
      AppOptions.set(
        "disableFontFace",
        hashParams["disablefontface"] === "true"
      );
    }
    if ("disablehistory" in hashParams) {
      AppOptions.set("disableHistory", hashParams["disablehistory"] === "true");
    }
    if ("webgl" in hashParams) {
      AppOptions.set("enableWebGL", hashParams["webgl"] === "true");
    }
    if ("verbosity" in hashParams) {
      AppOptions.set("verbosity", hashParams["verbosity"] | 0);
    }
    if ("textlayer" in hashParams) {
      switch (hashParams["textlayer"]) {
        case "off":
          AppOptions.set("textLayerMode", TextLayerMode.DISABLE);
          break;
        case "visible":
        case "shadow":
        case "hover":
          const viewer = this.appConfig.viewerContainer;
          viewer.classList.add("textLayer-" + hashParams["textlayer"]);
          break;
      }
    }
    if ("pdfbug" in hashParams) {
      AppOptions.set("pdfBug", true);
      const enabled = hashParams["pdfbug"].split(",");
      waitOn.push(loadAndEnablePDFBug(enabled));
    }
    // It is not possible to change locale for the (various) extension builds.
    if (
      (typeof PDFJSDev === "undefined" ||
        PDFJSDev.test("!PRODUCTION || GENERIC")) &&
      "locale" in hashParams
    ) {
      AppOptions.set("locale", hashParams["locale"]);
    }

    return Promise.all(waitOn).catch(reason => {
      console.error(`_parseHashParameters: "${reason.message}".`);
    });
  },

  /**
   * @private
   */
  async _initializeL10n() {
    this.l10n = this.externalServices.createL10n({
      locale: AppOptions.get("locale"),
    });
    const dir = await this.l10n.getDirection();
    document.getElementsByTagName("html")[0].dir = dir;
  },

  /**
   * @private
   */
  async _initializeViewerComponents() {
    const appConfig = this.appConfig;

    this.overlayManager = new OverlayManager();

    const eventBus =
      appConfig.eventBus ||
      getGlobalEventBus(AppOptions.get("eventBusDispatchToDOM"));
    this.eventBus = eventBus;

    const pdfRenderingQueue = new PDFRenderingQueue();
    pdfRenderingQueue.onIdle = this.cleanup.bind(this);
    this.pdfRenderingQueue = pdfRenderingQueue;

    const pdfLinkService = new PDFLinkService({
      eventBus,
      externalLinkTarget: AppOptions.get("externalLinkTarget"),
      externalLinkRel: AppOptions.get("externalLinkRel"),
    });
    this.pdfLinkService = pdfLinkService;

    const downloadManager = this.externalServices.createDownloadManager({
      disableCreateObjectURL: AppOptions.get("disableCreateObjectURL"),
    });
    this.downloadManager = downloadManager;

    const findController = new PDFFindController({
      linkService: pdfLinkService,
      eventBus,
    });
    this.findController = findController;

    const container = appConfig.mainContainer;
    const viewer = appConfig.viewerContainer;
    this.pdfViewer = new PDFViewer({
      container,
      viewer,
      eventBus,
      renderingQueue: pdfRenderingQueue,
      linkService: pdfLinkService,
      downloadManager,
      findController,
      renderer: AppOptions.get("renderer"),
      enableWebGL: AppOptions.get("enableWebGL"),
      l10n: this.l10n,
      textLayerMode: AppOptions.get("textLayerMode"),
      imageResourcesPath: AppOptions.get("imageResourcesPath"),
      renderInteractiveForms: AppOptions.get("renderInteractiveForms"),
      enablePrintAutoRotate: AppOptions.get("enablePrintAutoRotate"),
      useOnlyCssZoom: AppOptions.get("useOnlyCssZoom"),
      maxCanvasPixels: AppOptions.get("maxCanvasPixels"),
    });
    pdfRenderingQueue.setViewer(this.pdfViewer);
    pdfLinkService.setViewer(this.pdfViewer);

    this.pdfThumbnailViewer = new PDFThumbnailViewer({
      container: appConfig.sidebar.thumbnailView,
      renderingQueue: pdfRenderingQueue,
      linkService: pdfLinkService,
      l10n: this.l10n,
    });
    pdfRenderingQueue.setThumbnailViewer(this.pdfThumbnailViewer);

    this.pdfHistory = new PDFHistory({
      linkService: pdfLinkService,
      eventBus,
    });
    pdfLinkService.setHistory(this.pdfHistory);

    if (!this.supportsIntegratedFind) {
      this.findBar = new PDFFindBar(appConfig.findBar, eventBus, this.l10n);
    }

    this.pdfDocumentProperties = new PDFDocumentProperties(
      appConfig.documentProperties,
      this.overlayManager,
      eventBus,
      this.l10n
    );

    this.pdfCursorTools = new PDFCursorTools({
      container,
      eventBus,
      cursorToolOnLoad: AppOptions.get("cursorToolOnLoad"),
    });

    this.toolbar = new Toolbar(appConfig.toolbar, eventBus, this.l10n);

    this.secondaryToolbar = new SecondaryToolbar(
      appConfig.secondaryToolbar,
      container,
      eventBus
    );

    if (this.supportsFullscreen) {
      this.pdfPresentationMode = new PDFPresentationMode({
        container,
        pdfViewer: this.pdfViewer,
        eventBus,
        contextMenuItems: appConfig.fullscreen,
      });
    }

    this.passwordPrompt = new PasswordPrompt(
      appConfig.passwordOverlay,
      this.overlayManager,
      this.l10n
    );

    this.pdfOutlineViewer = new PDFOutlineViewer({
      container: appConfig.sidebar.outlineView,
      eventBus,
      linkService: pdfLinkService,
    });

    this.pdfAttachmentViewer = new PDFAttachmentViewer({
      container: appConfig.sidebar.attachmentsView,
      eventBus,
      downloadManager,
    });

    this.pdfSidebar = new PDFSidebar({
      elements: appConfig.sidebar,
      pdfViewer: this.pdfViewer,
      pdfThumbnailViewer: this.pdfThumbnailViewer,
      eventBus,
      l10n: this.l10n,
    });
    this.pdfSidebar.onToggled = this.forceRendering.bind(this);

    this.pdfSidebarResizer = new PDFSidebarResizer(
      appConfig.sidebarResizer,
      eventBus,
      this.l10n
    );
  },

  run(config) {
    this.initialize(config).then(webViewerInitialized);
  },

  zoomIn(ticks) {
    if (this.pdfViewer.isInPresentationMode) {
      return;
    }
    let newScale = this.pdfViewer.currentScale;
    do {
      newScale = (newScale * DEFAULT_SCALE_DELTA).toFixed(2);
      newScale = Math.ceil(newScale * 10) / 10;
      newScale = Math.min(MAX_SCALE, newScale);
    } while (--ticks > 0 && newScale < MAX_SCALE);
    this.pdfViewer.currentScaleValue = newScale;
  },

  zoomOut(ticks) {
    if (this.pdfViewer.isInPresentationMode) {
      return;
    }
    let newScale = this.pdfViewer.currentScale;
    do {
      newScale = (newScale / DEFAULT_SCALE_DELTA).toFixed(2);
      newScale = Math.floor(newScale * 10) / 10;
      newScale = Math.max(MIN_SCALE, newScale);
    } while (--ticks > 0 && newScale > MIN_SCALE);
    this.pdfViewer.currentScaleValue = newScale;
  },

  zoomReset() {
    if (this.pdfViewer.isInPresentationMode) {
      return;
    }
    this.pdfViewer.currentScaleValue = DEFAULT_SCALE_VALUE;
  },

  get pagesCount() {
    return this.pdfDocument ? this.pdfDocument.numPages : 0;
  },

  set page(val) {
    this.pdfViewer.currentPageNumber = val;
  },

  get page() {
    return this.pdfViewer.currentPageNumber;
  },

  get printing() {
    return !!this.printService;
  },

  get supportsPrinting() {
    return PDFPrintServiceFactory.instance.supportsPrinting;
  },

  get supportsFullscreen() {
    let support;
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
      support =
        document.fullscreenEnabled === true ||
        document.mozFullScreenEnabled === true;
    } else {
      const doc = document.documentElement;
      support = !!(
        doc.requestFullscreen ||
        doc.mozRequestFullScreen ||
        doc.webkitRequestFullScreen ||
        doc.msRequestFullscreen
      );

      if (
        document.fullscreenEnabled === false ||
        document.mozFullScreenEnabled === false ||
        document.webkitFullscreenEnabled === false ||
        document.msFullscreenEnabled === false
      ) {
        support = false;
      }
    }
    return shadow(this, "supportsFullscreen", support);
  },

  get supportsIntegratedFind() {
    return this.externalServices.supportsIntegratedFind;
  },

  get supportsDocumentFonts() {
    return this.externalServices.supportsDocumentFonts;
  },

  get loadingBar() {
    const bar = new ProgressBar("#loadingBar");
    return shadow(this, "loadingBar", bar);
  },

  get supportedMouseWheelZoomModifierKeys() {
    return this.externalServices.supportedMouseWheelZoomModifierKeys;
  },

  initPassiveLoading() {
    if (
      typeof PDFJSDev === "undefined" ||
      !PDFJSDev.test("MOZCENTRAL || CHROME")
    ) {
      throw new Error("Not implemented: initPassiveLoading");
    }
    this.externalServices.initPassiveLoading({
      onOpenWithTransport(url, length, transport) {
        PDFViewerApplication.open(url, { length, range: transport });
      },
      onOpenWithData(data) {
        PDFViewerApplication.open(data);
      },
      onOpenWithURL(url, length, originalUrl) {
        let file = url,
          args = null;
        if (length !== undefined) {
          args = { length };
        }
        if (originalUrl !== undefined) {
          file = { url, originalUrl };
        }
        PDFViewerApplication.open(file, args);
      },
      onError(err) {
        PDFViewerApplication.l10n
          .get(
            "loading_error",
            null,
            "An error occurred while loading the PDF."
          )
          .then(msg => {
            PDFViewerApplication.error(msg, err);
          });
      },
      onProgress(loaded, total) {
        PDFViewerApplication.progress(loaded / total);
      },
    });
  },

  setTitleUsingUrl(url = "") {
    this.url = url;
    this.baseUrl = url.split("#")[0];
    let title = getPDFFileNameFromURL(url, "");
    if (!title) {
      try {
        title = decodeURIComponent(getFilenameFromUrl(url)) || url;
      } catch (ex) {
        // decodeURIComponent may throw URIError,
        // fall back to using the unprocessed url in that case
        title = url;
      }
    }
    this.setTitle(title);
  },

  setTitle(title) {
    if (this.isViewerEmbedded) {
      // Embedded PDF viewers should not be changing their parent page's title.
      return;
    }
    document.title = title;
  },

  /**
   * Closes opened PDF document.
   * @returns {Promise} - Returns the promise, which is resolved when all
   *                      destruction is completed.
   */
  async close() {
    const errorWrapper = this.appConfig.errorWrapper.container;
    errorWrapper.setAttribute("hidden", "true");

    if (!this.pdfLoadingTask) {
      return undefined;
    }

    const promise = this.pdfLoadingTask.destroy();
    this.pdfLoadingTask = null;

    if (this.pdfDocument) {
      this.pdfDocument = null;

      this.pdfThumbnailViewer.setDocument(null);
      this.pdfViewer.setDocument(null);
      this.pdfLinkService.setDocument(null);
      this.pdfDocumentProperties.setDocument(null);
    }
    this.store = null;
    this.isInitialViewSet = false;
    this.downloadComplete = false;
    this.url = "";
    this.baseUrl = "";
    this.contentDispositionFilename = null;

    this.pdfSidebar.reset();
    this.pdfOutlineViewer.reset();
    this.pdfAttachmentViewer.reset();

    if (this.pdfHistory) {
      this.pdfHistory.reset();
    }
    if (this.findBar) {
      this.findBar.reset();
    }
    this.toolbar.reset();
    this.secondaryToolbar.reset();

    if (typeof PDFBug !== "undefined") {
      PDFBug.cleanup();
    }
    return promise;
  },

  /**
   * Opens PDF document specified by URL or array with additional arguments.
   * @param {string|TypedArray|ArrayBuffer} file - PDF location or binary data.
   * @param {Object} [args] - Additional arguments for the getDocument call,
   *                          e.g. HTTP headers ('httpHeaders') or alternative
   *                          data transport ('range').
   * @returns {Promise} - Returns the promise, which is resolved when document
   *                      is opened.
   */
  async open(file, args) {
    if (this.pdfLoadingTask) {
      // We need to destroy already opened document.
      await this.close();
    }
    // Set the necessary global worker parameters, using the available options.
    const workerParameters = AppOptions.getAll(OptionKind.WORKER);
    for (const key in workerParameters) {
      GlobalWorkerOptions[key] = workerParameters[key];
    }

    const parameters = Object.create(null);
    if (typeof file === "string") {
      // URL
      this.setTitleUsingUrl(file);
      parameters.url = file;
    } else if (file && "byteLength" in file) {
      // ArrayBuffer
      parameters.data = file;
    } else if (file.url && file.originalUrl) {
      this.setTitleUsingUrl(file.originalUrl);
      parameters.url = file.url;
    }
    // Set the necessary API parameters, using the available options.
    const apiParameters = AppOptions.getAll(OptionKind.API);
    for (const key in apiParameters) {
      let value = apiParameters[key];

      if (key === "docBaseUrl" && !value) {
        if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("PRODUCTION")) {
          value = document.URL.split("#")[0];
        } else if (PDFJSDev.test("MOZCENTRAL || CHROME")) {
          value = this.baseUrl;
        }
      }
      parameters[key] = value;
    }

    if (args) {
      for (const key in args) {
        const value = args[key];

        if (key === "length") {
          this.pdfDocumentProperties.setFileSize(value);
        }
        parameters[key] = value;
      }
    }

    const loadingTask = getDocument(parameters);
    this.pdfLoadingTask = loadingTask;

    loadingTask.onPassword = (updateCallback, reason) => {
      this.pdfLinkService.externalLinkEnabled = false;
      this.passwordPrompt.setUpdateCallback(updateCallback, reason);
      this.passwordPrompt.open();
    };

    loadingTask.onProgress = ({ loaded, total }) => {
      this.progress(loaded / total);
    };

    // Listen for unsupported features to trigger the fallback UI.
    loadingTask.onUnsupportedFeature = this.fallback.bind(this);

    return loadingTask.promise.then(
      pdfDocument => {
        this.load(pdfDocument);
      },
      exception => {
        if (loadingTask !== this.pdfLoadingTask) {
          return undefined; // Ignore errors for previously opened PDF files.
        }

        const message = exception && exception.message;
        let loadingErrorMessage;
        if (exception instanceof InvalidPDFException) {
          // change error message also for other builds
          loadingErrorMessage = this.l10n.get(
            "invalid_file_error",
            null,
            "Invalid or corrupted PDF file."
          );
        } else if (exception instanceof MissingPDFException) {
          // special message for missing PDF's
          loadingErrorMessage = this.l10n.get(
            "missing_file_error",
            null,
            "Missing PDF file."
          );
        } else if (exception instanceof UnexpectedResponseException) {
          loadingErrorMessage = this.l10n.get(
            "unexpected_response_error",
            null,
            "Unexpected server response."
          );
        } else {
          loadingErrorMessage = this.l10n.get(
            "loading_error",
            null,
            "An error occurred while loading the PDF."
          );
        }

        return loadingErrorMessage.then(msg => {
          this.error(msg, { message });
          throw new Error(msg);
        });
      }
    );
  },

  download() {
    function downloadByUrl() {
      downloadManager.downloadUrl(url, filename);
    }

    const url = this.baseUrl;
    // Use this.url instead of this.baseUrl to perform filename detection based
    // on the reference fragment as ultimate fallback if needed.
    const filename =
      this.contentDispositionFilename || getPDFFileNameFromURL(this.url);
    const downloadManager = this.downloadManager;
    downloadManager.onerror = err => {
      // This error won't really be helpful because it's likely the
      // fallback won't work either (or is already open).
      this.error(`PDF failed to download: ${err}`);
    };

    // When the PDF document isn't ready, or the PDF file is still downloading,
    // simply download using the URL.
    if (!this.pdfDocument || !this.downloadComplete) {
      downloadByUrl();
      return;
    }

    this.pdfDocument
      .getData()
      .then(function(data) {
        const blob = new Blob([data], { type: "application/pdf" });
        downloadManager.download(blob, url, filename);
      })
      .catch(downloadByUrl); // Error occurred, try downloading with the URL.
  },

  fallback(featureId) {
    if (
      typeof PDFJSDev === "undefined" ||
      PDFJSDev.test("MOZCENTRAL || GENERIC")
    ) {
      // Only trigger the fallback once so we don't spam the user with messages
      // for one PDF.
      if (this.fellback) {
        return;
      }
      this.fellback = true;
      this.externalServices.fallback(
        {
          featureId,
          url: this.baseUrl,
        },
        function response(download) {
          if (!download) {
            return;
          }
          PDFViewerApplication.download();
        }
      );
    }
  },

  /**
   * Show the error box.
   * @param {string} message - A message that is human readable.
   * @param {Object} [moreInfo] - Further information about the error that is
   *                              more technical.  Should have a 'message' and
   *                              optionally a 'stack' property.
   */
  error(message, moreInfo) {
    const moreInfoText = [
      this.l10n.get(
        "error_version_info",
        { version: version || "?", build: build || "?" },
        "PDF.js v{{version}} (build: {{build}})"
      ),
    ];
    if (moreInfo) {
      moreInfoText.push(
        this.l10n.get(
          "error_message",
          { message: moreInfo.message },
          "Message: {{message}}"
        )
      );
      if (moreInfo.stack) {
        moreInfoText.push(
          this.l10n.get(
            "error_stack",
            { stack: moreInfo.stack },
            "Stack: {{stack}}"
          )
        );
      } else {
        if (moreInfo.filename) {
          moreInfoText.push(
            this.l10n.get(
              "error_file",
              { file: moreInfo.filename },
              "File: {{file}}"
            )
          );
        }
        if (moreInfo.lineNumber) {
          moreInfoText.push(
            this.l10n.get(
              "error_line",
              { line: moreInfo.lineNumber },
              "Line: {{line}}"
            )
          );
        }
      }
    }

    if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
      const errorWrapperConfig = this.appConfig.errorWrapper;
      const errorWrapper = errorWrapperConfig.container;
      errorWrapper.removeAttribute("hidden");

      const errorMessage = errorWrapperConfig.errorMessage;
      errorMessage.textContent = message;

      const closeButton = errorWrapperConfig.closeButton;
      closeButton.onclick = function() {
        errorWrapper.setAttribute("hidden", "true");
      };

      const errorMoreInfo = errorWrapperConfig.errorMoreInfo;
      const moreInfoButton = errorWrapperConfig.moreInfoButton;
      const lessInfoButton = errorWrapperConfig.lessInfoButton;
      moreInfoButton.onclick = function() {
        errorMoreInfo.removeAttribute("hidden");
        moreInfoButton.setAttribute("hidden", "true");
        lessInfoButton.removeAttribute("hidden");
        errorMoreInfo.style.height = errorMoreInfo.scrollHeight + "px";
      };
      lessInfoButton.onclick = function() {
        errorMoreInfo.setAttribute("hidden", "true");
        moreInfoButton.removeAttribute("hidden");
        lessInfoButton.setAttribute("hidden", "true");
      };
      moreInfoButton.oncontextmenu = noContextMenuHandler;
      lessInfoButton.oncontextmenu = noContextMenuHandler;
      closeButton.oncontextmenu = noContextMenuHandler;
      moreInfoButton.removeAttribute("hidden");
      lessInfoButton.setAttribute("hidden", "true");
      Promise.all(moreInfoText).then(parts => {
        errorMoreInfo.value = parts.join("\n");
      });
    } else {
      Promise.all(moreInfoText).then(parts => {
        console.error(message + "\n" + parts.join("\n"));
      });
      this.fallback();
    }
  },

  progress(level) {
    if (this.downloadComplete) {
      // Don't accidentally show the loading bar again when the entire file has
      // already been fetched (only an issue when disableAutoFetch is enabled).
      return;
    }
    const percent = Math.round(level * 100);
    // When we transition from full request to range requests, it's possible
    // that we discard some of the loaded data. This can cause the loading
    // bar to move backwards. So prevent this by only updating the bar if it
    // increases.
    if (percent > this.loadingBar.percent || isNaN(percent)) {
      this.loadingBar.percent = percent;

      // When disableAutoFetch is enabled, it's not uncommon for the entire file
      // to never be fetched (depends on e.g. the file structure). In this case
      // the loading bar will not be completely filled, nor will it be hidden.
      // To prevent displaying a partially filled loading bar permanently, we
      // hide it when no data has been loaded during a certain amount of time.
      const disableAutoFetch = this.pdfDocument
        ? this.pdfDocument.loadingParams["disableAutoFetch"]
        : AppOptions.get("disableAutoFetch");

      if (disableAutoFetch && percent) {
        if (this.disableAutoFetchLoadingBarTimeout) {
          clearTimeout(this.disableAutoFetchLoadingBarTimeout);
          this.disableAutoFetchLoadingBarTimeout = null;
        }
        this.loadingBar.show();

        this.disableAutoFetchLoadingBarTimeout = setTimeout(() => {
          this.loadingBar.hide();
          this.disableAutoFetchLoadingBarTimeout = null;
        }, DISABLE_AUTO_FETCH_LOADING_BAR_TIMEOUT);
      }
    }
  },

  load(pdfDocument) {
    this.pdfDocument = pdfDocument;

    pdfDocument.getDownloadInfo().then(() => {
      this.downloadComplete = true;
      this.loadingBar.hide();

      firstPagePromise.then(() => {
        this.eventBus.dispatch("documentloaded", { source: this });
      });
    });

    // Since the `setInitialView` call below depends on this being resolved,
    // fetch it early to avoid delaying initial rendering of the PDF document.
    const pageLayoutPromise = pdfDocument.getPageLayout().catch(function() {
      /* Avoid breaking initial rendering; ignoring errors. */
    });
    const pageModePromise = pdfDocument.getPageMode().catch(function() {
      /* Avoid breaking initial rendering; ignoring errors. */
    });
    const openActionDestPromise = pdfDocument
      .getOpenActionDestination()
      .catch(function() {
        /* Avoid breaking initial rendering; ignoring errors. */
      });

    this.toolbar.setPagesCount(pdfDocument.numPages, false);
    this.secondaryToolbar.setPagesCount(pdfDocument.numPages);

    const store = (this.store = new ViewHistory(pdfDocument.fingerprint));

    let baseDocumentUrl;
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
      baseDocumentUrl = null;
    } else if (PDFJSDev.test("MOZCENTRAL")) {
      baseDocumentUrl = this.baseUrl;
    } else if (PDFJSDev.test("CHROME")) {
      baseDocumentUrl = location.href.split("#")[0];
    }
    this.pdfLinkService.setDocument(pdfDocument, baseDocumentUrl);
    this.pdfDocumentProperties.setDocument(pdfDocument, this.url);

    const pdfViewer = this.pdfViewer;
    pdfViewer.setDocument(pdfDocument);
    const firstPagePromise = pdfViewer.firstPagePromise;
    const pagesPromise = pdfViewer.pagesPromise;
    const onePageRendered = pdfViewer.onePageRendered;

    const pdfThumbnailViewer = this.pdfThumbnailViewer;
    pdfThumbnailViewer.setDocument(pdfDocument);

    firstPagePromise.then(pdfPage => {
      this.loadingBar.setWidth(this.appConfig.viewerContainer);

      const storePromise = store
        .getMultiple({
          page: null,
          zoom: DEFAULT_SCALE_VALUE,
          scrollLeft: "0",
          scrollTop: "0",
          rotation: null,
          sidebarView: SidebarView.UNKNOWN,
          scrollMode: ScrollMode.UNKNOWN,
          spreadMode: SpreadMode.UNKNOWN,
        })
        .catch(() => {
          /* Unable to read from storage; ignoring errors. */
        });

      Promise.all([
        animationStarted,
        storePromise,
        pageLayoutPromise,
        pageModePromise,
        openActionDestPromise,
      ])
        .then(
          async ([
            timeStamp,
            values = {},
            pageLayout,
            pageMode,
            openActionDest,
          ]) => {
            const viewOnLoad = AppOptions.get("viewOnLoad");

            this._initializePdfHistory({
              fingerprint: pdfDocument.fingerprint,
              viewOnLoad,
              initialDest: openActionDest,
            });
            const initialBookmark = this.initialBookmark;

            // Initialize the default values, from user preferences.
            const zoom = AppOptions.get("defaultZoomValue");
            let hash = zoom ? `zoom=${zoom}` : null;

            let rotation = null;
            let sidebarView = AppOptions.get("sidebarViewOnLoad");
            let scrollMode = AppOptions.get("scrollModeOnLoad");
            let spreadMode = AppOptions.get("spreadModeOnLoad");

            if (values.page && viewOnLoad !== ViewOnLoad.INITIAL) {
              hash =
                `page=${values.page}&zoom=${zoom || values.zoom},` +
                `${values.scrollLeft},${values.scrollTop}`;

              rotation = parseInt(values.rotation, 10);
              // Always let user preferences take precedence over the view
              // history.
              if (sidebarView === SidebarView.UNKNOWN) {
                sidebarView = values.sidebarView | 0;
              }
              if (scrollMode === ScrollMode.UNKNOWN) {
                scrollMode = values.scrollMode | 0;
              }
              if (spreadMode === SpreadMode.UNKNOWN) {
                spreadMode = values.spreadMode | 0;
              }
            }
            // Always let the user preference/view history take precedence.
            if (pageMode && sidebarView === SidebarView.UNKNOWN) {
              sidebarView = apiPageModeToSidebarView(pageMode);
            }
            if (pageLayout && spreadMode === SpreadMode.UNKNOWN) {
              spreadMode = apiPageLayoutToSpreadMode(pageLayout);
            }

            this.setInitialView(hash, {
              rotation,
              sidebarView,
              scrollMode,
              spreadMode,
            });
            this.eventBus.dispatch("documentinit", { source: this });
            // Make all navigation keys work on document load,
            // unless the viewer is embedded in a web page.
            if (!this.isViewerEmbedded) {
              pdfViewer.focus();
            }

            // For documents with different page sizes, once all pages are
            // resolved, ensure that the correct location becomes visible on
            // load.
            // (To reduce the risk, in very large and/or slow loading documents,
            //  that the location changes *after* the user has started
            //  interacting with the viewer, wait for either `pagesPromise` or
            //  a timeout.)
            await Promise.race([
              pagesPromise,
              new Promise(resolve => {
                setTimeout(resolve, FORCE_PAGES_LOADED_TIMEOUT);
              }),
            ]);
            if (!initialBookmark && !hash) {
              return;
            }
            if (pdfViewer.hasEqualPageSizes) {
              return;
            }
            this.initialBookmark = initialBookmark;

            // eslint-disable-next-line no-self-assign
            pdfViewer.currentScaleValue = pdfViewer.currentScaleValue;
            // Re-apply the initial document location.
            this.setInitialView(hash);
          }
        )
        .catch(() => {
          // Ensure that the document is always completely initialized,
          // even if there are any errors thrown above.
          this.setInitialView();
        })
        .then(function() {
          // At this point, rendering of the initial page(s) should always have
          // started (and may even have completed).
          // To prevent any future issues, e.g. the document being completely
          // blank on load, always trigger rendering here.
          pdfViewer.update();
        });
    });

    pdfDocument.getPageLabels().then(labels => {
      if (!labels || AppOptions.get("disablePageLabels")) {
        return;
      }
      const numLabels = labels.length;
      if (numLabels !== this.pagesCount) {
        console.error(
          "The number of Page Labels does not match " +
            "the number of pages in the document."
        );
        return;
      }
      let i = 0;
      // Ignore page labels that correspond to standard page numbering.
      while (i < numLabels && labels[i] === (i + 1).toString()) {
        i++;
      }
      if (i === numLabels) {
        return;
      }

      pdfViewer.setPageLabels(labels);
      pdfThumbnailViewer.setPageLabels(labels);

      // Changing toolbar page display to use labels and we need to set
      // the label of the current page.
      this.toolbar.setPagesCount(pdfDocument.numPages, true);
      this.toolbar.setPageNumber(
        pdfViewer.currentPageNumber,
        pdfViewer.currentPageLabel
      );
    });

    pagesPromise.then(() => {
      if (!this.supportsPrinting) {
        return;
      }
      pdfDocument.getJavaScript().then(javaScript => {
        if (!javaScript) {
          return;
        }
        javaScript.some(js => {
          if (!js) {
            // Don't warn/fallback for empty JavaScript actions.
            return false;
          }
          console.warn("Warning: JavaScript is not supported");
          this.fallback(UNSUPPORTED_FEATURES.javaScript);
          return true;
        });

        // Hack to support auto printing.
        for (const js of javaScript) {
          if (js && AutoPrintRegExp.test(js)) {
            setTimeout(function() {
              window.print();
            });
            return;
          }
        }
      });
    });

    onePageRendered.then(() => {
      pdfDocument.getOutline().then(outline => {
        this.pdfOutlineViewer.render({ outline });
      });
      pdfDocument.getAttachments().then(attachments => {
        this.pdfAttachmentViewer.render({ attachments });
      });
    });

    pdfDocument
      .getMetadata()
      .then(({ info, metadata, contentDispositionFilename }) => {
        this.documentInfo = info;
        this.metadata = metadata;
        this.contentDispositionFilename = contentDispositionFilename;

        // Provides some basic debug information
        console.log(
          "PDF " +
            pdfDocument.fingerprint +
            " [" +
            info.PDFFormatVersion +
            " " +
            (info.Producer || "-").trim() +
            " / " +
            (info.Creator || "-").trim() +
            "]" +
            " (PDF.js: " +
            (version || "-") +
            (AppOptions.get("enableWebGL") ? " [WebGL]" : "") +
            ")"
        );

        let pdfTitle;

        const infoTitle = info && info["Title"];
        if (infoTitle) {
          pdfTitle = infoTitle;
        }
        const metadataTitle = metadata && metadata.get("dc:title");
        if (metadataTitle) {
          // Ghostscript can produce invalid 'dc:title' Metadata entries:
          //  - The title may be "Untitled" (fixes bug 1031612).
          //  - The title may contain incorrectly encoded characters, which thus
          //    looks broken, hence we ignore the Metadata entry when it
          //    contains characters from the Specials Unicode block
          //    (fixes bug 1605526).
          if (
            metadataTitle !== "Untitled" &&
            !/[\uFFF0-\uFFFF]/g.test(metadataTitle)
          ) {
            pdfTitle = metadataTitle;
          }
        }

        if (pdfTitle) {
          this.setTitle(
            `${pdfTitle} - ${contentDispositionFilename || document.title}`
          );
        } else if (contentDispositionFilename) {
          this.setTitle(contentDispositionFilename);
        }

        if (info.IsAcroFormPresent) {
          console.warn("Warning: AcroForm/XFA is not supported");
          this.fallback(UNSUPPORTED_FEATURES.forms);
        }

        if (
          typeof PDFJSDev === "undefined" ||
          PDFJSDev.test("MOZCENTRAL || GENERIC")
        ) {
          // Telemetry labels must be C++ variable friendly.
          let versionId = "other";
          // Keep these in sync with mozilla central's Histograms.json.
          const KNOWN_VERSIONS = [
            "1.0",
            "1.1",
            "1.2",
            "1.3",
            "1.4",
            "1.5",
            "1.6",
            "1.7",
            "1.8",
            "1.9",
            "2.0",
            "2.1",
            "2.2",
            "2.3",
          ];
          if (KNOWN_VERSIONS.includes(info.PDFFormatVersion)) {
            versionId = `v${info.PDFFormatVersion.replace(".", "_")}`;
          }

          let generatorId = "other";
          // Keep these in sync with mozilla central's Histograms.json.
          const KNOWN_GENERATORS = [
            "acrobat distiller",
            "acrobat pdfwriter",
            "adobe livecycle",
            "adobe pdf library",
            "adobe photoshop",
            "ghostscript",
            "tcpdf",
            "cairo",
            "dvipdfm",
            "dvips",
            "pdftex",
            "pdfkit",
            "itext",
            "prince",
            "quarkxpress",
            "mac os x",
            "microsoft",
            "openoffice",
            "oracle",
            "luradocument",
            "pdf-xchange",
            "antenna house",
            "aspose.cells",
            "fpdf",
          ];
          if (info.Producer) {
            const producer = info.Producer.toLowerCase();
            KNOWN_GENERATORS.some(function(generator) {
              if (!producer.includes(generator)) {
                return false;
              }
              generatorId = generator.replace(/[ .\-]/g, "_");
              return true;
            });
          }

          let formType = null;
          if (info.IsAcroFormPresent) {
            formType = info.IsXFAPresent ? "xfa" : "acroform";
          }
          this.externalServices.reportTelemetry({
            type: "documentInfo",
            version: versionId,
            generator: generatorId,
            formType,
          });
        }
      });
  },

  /**
   * @private
   */
  _initializePdfHistory({ fingerprint, viewOnLoad, initialDest = null }) {
    if (AppOptions.get("disableHistory") || this.isViewerEmbedded) {
      // The browsing history is only enabled when the viewer is standalone,
      // i.e. not when it is embedded in a web page.
      return;
    }
    this.pdfHistory.initialize({
      fingerprint,
      resetHistory: viewOnLoad === ViewOnLoad.INITIAL,
      updateUrl: AppOptions.get("historyUpdateUrl"),
    });

    if (this.pdfHistory.initialBookmark) {
      this.initialBookmark = this.pdfHistory.initialBookmark;

      this.initialRotation = this.pdfHistory.initialRotation;
    }

    // Always let the browser history/document hash take precedence.
    if (
      initialDest &&
      !this.initialBookmark &&
      viewOnLoad === ViewOnLoad.UNKNOWN
    ) {
      this.initialBookmark = JSON.stringify(initialDest);
      // TODO: Re-factor the `PDFHistory` initialization to remove this hack
      // that's currently necessary to prevent weird initial history state.
      this.pdfHistory.push({ explicitDest: initialDest, pageNumber: null });
    }
  },

  setInitialView(
    storedHash,
    { rotation, sidebarView, scrollMode, spreadMode } = {}
  ) {
    const setRotation = angle => {
      if (isValidRotation(angle)) {
        this.pdfViewer.pagesRotation = angle;
      }
    };
    const setViewerModes = (scroll, spread) => {
      if (isValidScrollMode(scroll)) {
        this.pdfViewer.scrollMode = scroll;
      }
      if (isValidSpreadMode(spread)) {
        this.pdfViewer.spreadMode = spread;
      }
    };
    this.isInitialViewSet = true;
    this.pdfSidebar.setInitialView(sidebarView);

    setViewerModes(scrollMode, spreadMode);

    if (this.initialBookmark) {
      setRotation(this.initialRotation);
      delete this.initialRotation;

      this.pdfLinkService.setHash(this.initialBookmark);
      this.initialBookmark = null;
    } else if (storedHash) {
      setRotation(rotation);

      this.pdfLinkService.setHash(storedHash);
    }

    // Ensure that the correct page number is displayed in the UI,
    // even if the active page didn't change during document load.
    this.toolbar.setPageNumber(
      this.pdfViewer.currentPageNumber,
      this.pdfViewer.currentPageLabel
    );
    this.secondaryToolbar.setPageNumber(this.pdfViewer.currentPageNumber);

    if (!this.pdfViewer.currentScaleValue) {
      // Scale was not initialized: invalid bookmark or scale was not specified.
      // Setting the default one.
      this.pdfViewer.currentScaleValue = DEFAULT_SCALE_VALUE;
    }
  },

  cleanup() {
    if (!this.pdfDocument) {
      return; // run cleanup when document is loaded
    }
    this.pdfViewer.cleanup();
    this.pdfThumbnailViewer.cleanup();

    // We don't want to remove fonts used by active page SVGs.
    if (this.pdfViewer.renderer !== RendererType.SVG) {
      this.pdfDocument.cleanup();
    }
  },

  forceRendering() {
    this.pdfRenderingQueue.printing = this.printing;
    this.pdfRenderingQueue.isThumbnailViewEnabled = this.pdfSidebar.isThumbnailViewVisible;
    this.pdfRenderingQueue.renderHighestPriority();
  },

  beforePrint() {
    if (this.printService) {
      // There is no way to suppress beforePrint/afterPrint events,
      // but PDFPrintService may generate double events -- this will ignore
      // the second event that will be coming from native window.print().
      return;
    }

    if (!this.supportsPrinting) {
      this.l10n
        .get(
          "printing_not_supported",
          null,
          "Warning: Printing is not fully supported by this browser."
        )
        .then(printMessage => {
          this.error(printMessage);
        });
      return;
    }

    // The beforePrint is a sync method and we need to know layout before
    // returning from this method. Ensure that we can get sizes of the pages.
    if (!this.pdfViewer.pageViewsReady) {
      this.l10n
        .get(
          "printing_not_ready",
          null,
          "Warning: The PDF is not fully loaded for printing."
        )
        .then(notReadyMessage => {
          window.alert(notReadyMessage);
        });
      return;
    }

    const pagesOverview = this.pdfViewer.getPagesOverview();
    const printContainer = this.appConfig.printContainer;
    const printService = PDFPrintServiceFactory.instance.createPrintService(
      this.pdfDocument,
      pagesOverview,
      printContainer,
      this.l10n
    );
    this.printService = printService;
    this.forceRendering();

    printService.layout();

    if (
      typeof PDFJSDev === "undefined" ||
      PDFJSDev.test("MOZCENTRAL || GENERIC")
    ) {
      this.externalServices.reportTelemetry({
        type: "print",
      });
    }
  },

  afterPrint() {
    if (this.printService) {
      this.printService.destroy();
      this.printService = null;
    }
    this.forceRendering();
  },

  rotatePages(delta) {
    if (!this.pdfDocument) {
      return;
    }
    const newRotation = (this.pdfViewer.pagesRotation + 360 + delta) % 360;
    this.pdfViewer.pagesRotation = newRotation;
    // Note that the thumbnail viewer is updated, and rendering is triggered,
    // in the 'rotationchanging' event handler.
  },

  requestPresentationMode() {
    if (!this.pdfPresentationMode) {
      return;
    }
    this.pdfPresentationMode.request();
  },

  bindEvents() {
    const { eventBus, _boundEvents } = this;

    _boundEvents.beforePrint = this.beforePrint.bind(this);
    _boundEvents.afterPrint = this.afterPrint.bind(this);

    eventBus.on("resize", webViewerResize);
    eventBus.on("hashchange", webViewerHashchange);
    eventBus.on("beforeprint", _boundEvents.beforePrint);
    eventBus.on("afterprint", _boundEvents.afterPrint);
    eventBus.on("pagerendered", webViewerPageRendered);
    eventBus.on("updateviewarea", webViewerUpdateViewarea);
    eventBus.on("pagechanging", webViewerPageChanging);
    eventBus.on("scalechanging", webViewerScaleChanging);
    eventBus.on("rotationchanging", webViewerRotationChanging);
    eventBus.on("sidebarviewchanged", webViewerSidebarViewChanged);
    eventBus.on("pagemode", webViewerPageMode);
    eventBus.on("namedaction", webViewerNamedAction);
    eventBus.on("presentationmodechanged", webViewerPresentationModeChanged);
    eventBus.on("presentationmode", webViewerPresentationMode);
    eventBus.on("openfile", webViewerOpenFile);
    eventBus.on("print", webViewerPrint);
    eventBus.on("download", webViewerDownload);
    eventBus.on("firstpage", webViewerFirstPage);
    eventBus.on("lastpage", webViewerLastPage);
    eventBus.on("nextpage", webViewerNextPage);
    eventBus.on("previouspage", webViewerPreviousPage);
    eventBus.on("zoomin", webViewerZoomIn);
    eventBus.on("zoomout", webViewerZoomOut);
    eventBus.on("zoomreset", webViewerZoomReset);
    eventBus.on("pagenumberchanged", webViewerPageNumberChanged);
    eventBus.on("scalechanged", webViewerScaleChanged);
    eventBus.on("rotatecw", webViewerRotateCw);
    eventBus.on("rotateccw", webViewerRotateCcw);
    eventBus.on("switchscrollmode", webViewerSwitchScrollMode);
    eventBus.on("scrollmodechanged", webViewerScrollModeChanged);
    eventBus.on("switchspreadmode", webViewerSwitchSpreadMode);
    eventBus.on("spreadmodechanged", webViewerSpreadModeChanged);
    eventBus.on("documentproperties", webViewerDocumentProperties);
    eventBus.on("find", webViewerFind);
    eventBus.on("findfromurlhash", webViewerFindFromUrlHash);
    eventBus.on("updatefindmatchescount", webViewerUpdateFindMatchesCount);
    eventBus.on("updatefindcontrolstate", webViewerUpdateFindControlState);
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
      eventBus.on("fileinputchange", webViewerFileInputChange);
    }
  },

  bindWindowEvents() {
    const { eventBus, _boundEvents } = this;

    _boundEvents.windowResize = () => {
      eventBus.dispatch("resize", { source: window });
    };
    _boundEvents.windowHashChange = () => {
      eventBus.dispatch("hashchange", {
        source: window,
        hash: document.location.hash.substring(1),
      });
    };
    _boundEvents.windowBeforePrint = () => {
      eventBus.dispatch("beforeprint", { source: window });
    };
    _boundEvents.windowAfterPrint = () => {
      eventBus.dispatch("afterprint", { source: window });
    };

    window.addEventListener("visibilitychange", webViewerVisibilityChange);
    window.addEventListener("wheel", webViewerWheel, { passive: false });
    window.addEventListener("click", webViewerClick);
    window.addEventListener("keydown", webViewerKeyDown);
    window.addEventListener("resize", _boundEvents.windowResize);
    window.addEventListener("hashchange", _boundEvents.windowHashChange);
    window.addEventListener("beforeprint", _boundEvents.windowBeforePrint);
    window.addEventListener("afterprint", _boundEvents.windowAfterPrint);
  },

  unbindEvents() {
    const { eventBus, _boundEvents } = this;

    eventBus.off("resize", webViewerResize);
    eventBus.off("hashchange", webViewerHashchange);
    eventBus.off("beforeprint", _boundEvents.beforePrint);
    eventBus.off("afterprint", _boundEvents.afterPrint);
    eventBus.off("pagerendered", webViewerPageRendered);
    eventBus.off("updateviewarea", webViewerUpdateViewarea);
    eventBus.off("pagechanging", webViewerPageChanging);
    eventBus.off("scalechanging", webViewerScaleChanging);
    eventBus.off("rotationchanging", webViewerRotationChanging);
    eventBus.off("sidebarviewchanged", webViewerSidebarViewChanged);
    eventBus.off("pagemode", webViewerPageMode);
    eventBus.off("namedaction", webViewerNamedAction);
    eventBus.off("presentationmodechanged", webViewerPresentationModeChanged);
    eventBus.off("presentationmode", webViewerPresentationMode);
    eventBus.off("openfile", webViewerOpenFile);
    eventBus.off("print", webViewerPrint);
    eventBus.off("download", webViewerDownload);
    eventBus.off("firstpage", webViewerFirstPage);
    eventBus.off("lastpage", webViewerLastPage);
    eventBus.off("nextpage", webViewerNextPage);
    eventBus.off("previouspage", webViewerPreviousPage);
    eventBus.off("zoomin", webViewerZoomIn);
    eventBus.off("zoomout", webViewerZoomOut);
    eventBus.off("zoomreset", webViewerZoomReset);
    eventBus.off("pagenumberchanged", webViewerPageNumberChanged);
    eventBus.off("scalechanged", webViewerScaleChanged);
    eventBus.off("rotatecw", webViewerRotateCw);
    eventBus.off("rotateccw", webViewerRotateCcw);
    eventBus.off("switchscrollmode", webViewerSwitchScrollMode);
    eventBus.off("scrollmodechanged", webViewerScrollModeChanged);
    eventBus.off("switchspreadmode", webViewerSwitchSpreadMode);
    eventBus.off("spreadmodechanged", webViewerSpreadModeChanged);
    eventBus.off("documentproperties", webViewerDocumentProperties);
    eventBus.off("find", webViewerFind);
    eventBus.off("findfromurlhash", webViewerFindFromUrlHash);
    eventBus.off("updatefindmatchescount", webViewerUpdateFindMatchesCount);
    eventBus.off("updatefindcontrolstate", webViewerUpdateFindControlState);
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
      eventBus.off("fileinputchange", webViewerFileInputChange);
    }

    _boundEvents.beforePrint = null;
    _boundEvents.afterPrint = null;
  },

  unbindWindowEvents() {
    const { _boundEvents } = this;

    window.removeEventListener("visibilitychange", webViewerVisibilityChange);
    window.removeEventListener("wheel", webViewerWheel);
    window.removeEventListener("click", webViewerClick);
    window.removeEventListener("keydown", webViewerKeyDown);
    window.removeEventListener("resize", _boundEvents.windowResize);
    window.removeEventListener("hashchange", _boundEvents.windowHashChange);
    window.removeEventListener("beforeprint", _boundEvents.windowBeforePrint);
    window.removeEventListener("afterprint", _boundEvents.windowAfterPrint);

    _boundEvents.windowResize = null;
    _boundEvents.windowHashChange = null;
    _boundEvents.windowBeforePrint = null;
    _boundEvents.windowAfterPrint = null;
  },
};

let validateFileURL;
if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
  const HOSTED_VIEWER_ORIGINS = [
    "null",
    "http://mozilla.github.io",
    "https://mozilla.github.io",
  ];
  validateFileURL = function validateFileURL(file) {
    if (file === undefined) {
      return;
    }
    try {
      const viewerOrigin = new URL(window.location.href).origin || "null";
      if (HOSTED_VIEWER_ORIGINS.includes(viewerOrigin)) {
        // Hosted or local viewer, allow for any file locations
        return;
      }
      const { origin, protocol } = new URL(file, window.location.href);
      // Removing of the following line will not guarantee that the viewer will
      // start accepting URLs from foreign origin -- CORS headers on the remote
      // server must be properly configured.
      // IE10 / IE11 does not include an origin in `blob:`-URLs. So don't block
      // any blob:-URL. The browser's same-origin policy will block requests to
      // blob:-URLs from other origins, so this is safe.
      if (origin !== viewerOrigin && protocol !== "blob:") {
        throw new Error("file origin does not match viewer's");
      }
    } catch (ex) {
      const message = ex && ex.message;
      PDFViewerApplication.l10n
        .get("loading_error", null, "An error occurred while loading the PDF.")
        .then(loadingErrorMessage => {
          PDFViewerApplication.error(loadingErrorMessage, { message });
        });
      throw ex;
    }
  };
}

async function loadFakeWorker() {
  if (!GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = AppOptions.get("workerSrc");
  }
  if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("PRODUCTION")) {
    if (typeof SystemJS !== "object") {
      throw new Error("SystemJS must be used to load fake worker.");
    }
    window.pdfjsWorker = await SystemJS.import("pdfjs/core/worker.js");
    return undefined;
  }
  return loadScript(PDFWorker.getWorkerSrc());
}

function loadAndEnablePDFBug(enabledTabs) {
  const appConfig = PDFViewerApplication.appConfig;
  return loadScript(appConfig.debuggerScriptPath).then(function() {
    PDFBug.enable(enabledTabs);
    PDFBug.init({ OPS }, appConfig.mainContainer);
  });
}

function webViewerInitialized() {
  const appConfig = PDFViewerApplication.appConfig;
  let file;
  if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
    const queryString = document.location.search.substring(1);
    const params = parseQueryString(queryString);
    file = "file" in params ? params.file : AppOptions.get("defaultUrl");
    validateFileURL(file);
  } else if (PDFJSDev.test("MOZCENTRAL")) {
    file = window.location.href.split("#")[0];
  } else if (PDFJSDev.test("CHROME")) {
    file = AppOptions.get("defaultUrl");
  }

  if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
    const fileInput = document.createElement("input");
    fileInput.id = appConfig.openFileInputName;
    fileInput.className = "fileInput";
    fileInput.setAttribute("type", "file");
    fileInput.oncontextmenu = noContextMenuHandler;
    document.body.appendChild(fileInput);

    if (
      !window.File ||
      !window.FileReader ||
      !window.FileList ||
      !window.Blob
    ) {
      appConfig.toolbar.openFile.setAttribute("hidden", "true");
      appConfig.secondaryToolbar.openFileButton.setAttribute("hidden", "true");
    } else {
      fileInput.value = null;
    }

    fileInput.addEventListener("change", function(evt) {
      const files = evt.target.files;
      if (!files || files.length === 0) {
        return;
      }
      PDFViewerApplication.eventBus.dispatch("fileinputchange", {
        source: this,
        fileInput: evt.target,
      });
    });

    // Enable draging-and-dropping a new PDF file onto the viewerContainer.
    appConfig.mainContainer.addEventListener("dragover", function(evt) {
      evt.preventDefault();

      evt.dataTransfer.dropEffect = "move";
    });
    appConfig.mainContainer.addEventListener("drop", function(evt) {
      evt.preventDefault();

      const files = evt.dataTransfer.files;
      if (!files || files.length === 0) {
        return;
      }
      PDFViewerApplication.eventBus.dispatch("fileinputchange", {
        source: this,
        fileInput: evt.dataTransfer,
      });
    });
  } else {
    appConfig.toolbar.openFile.setAttribute("hidden", "true");
    appConfig.secondaryToolbar.openFileButton.setAttribute("hidden", "true");
  }

  if (
    (typeof PDFJSDev === "undefined" ||
      PDFJSDev.test("MOZCENTRAL || GENERIC")) &&
    !PDFViewerApplication.supportsDocumentFonts
  ) {
    AppOptions.set("disableFontFace", true);
    PDFViewerApplication.l10n
      .get(
        "web_fonts_disabled",
        null,
        "Web fonts are disabled: unable to use embedded PDF fonts."
      )
      .then(msg => {
        console.warn(msg);
      });
  }

  if (!PDFViewerApplication.supportsPrinting) {
    appConfig.toolbar.print.classList.add("hidden");
    appConfig.secondaryToolbar.printButton.classList.add("hidden");
  }

  if (!PDFViewerApplication.supportsFullscreen) {
    appConfig.toolbar.presentationModeButton.classList.add("hidden");
    appConfig.secondaryToolbar.presentationModeButton.classList.add("hidden");
  }

  if (PDFViewerApplication.supportsIntegratedFind) {
    appConfig.toolbar.viewFind.classList.add("hidden");
  }

  appConfig.mainContainer.addEventListener(
    "transitionend",
    function(evt) {
      if (evt.target === /* mainContainer */ this) {
        PDFViewerApplication.eventBus.dispatch("resize", { source: this });
      }
    },
    true
  );

  try {
    webViewerOpenFileViaURL(file);
  } catch (reason) {
    PDFViewerApplication.l10n
      .get("loading_error", null, "An error occurred while loading the PDF.")
      .then(msg => {
        PDFViewerApplication.error(msg, reason);
      });
  }
}

let webViewerOpenFileViaURL;
if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
  webViewerOpenFileViaURL = function webViewerOpenFileViaURL(file) {
    if (file && file.lastIndexOf("file:", 0) === 0) {
      // file:-scheme. Load the contents in the main thread because QtWebKit
      // cannot load file:-URLs in a Web Worker. file:-URLs are usually loaded
      // very quickly, so there is no need to set up progress event listeners.
      PDFViewerApplication.setTitleUsingUrl(file);
      const xhr = new XMLHttpRequest();
      xhr.onload = function() {
        PDFViewerApplication.open(new Uint8Array(xhr.response));
      };
      xhr.open("GET", file);
      xhr.responseType = "arraybuffer";
      xhr.send();
      return;
    }

    if (file) {
      PDFViewerApplication.open(file);
    }
  };
} else if (PDFJSDev.test("MOZCENTRAL || CHROME")) {
  webViewerOpenFileViaURL = function webViewerOpenFileViaURL(file) {
    PDFViewerApplication.setTitleUsingUrl(file);
    PDFViewerApplication.initPassiveLoading();
  };
} else {
  webViewerOpenFileViaURL = function webViewerOpenFileViaURL(file) {
    if (file) {
      throw new Error("Not implemented: webViewerOpenFileViaURL");
    }
  };
}

function webViewerPageRendered(evt) {
  const pageNumber = evt.pageNumber;
  const pageIndex = pageNumber - 1;
  const pageView = PDFViewerApplication.pdfViewer.getPageView(pageIndex);

  // If the page is still visible when it has finished rendering,
  // ensure that the page number input loading indicator is hidden.
  if (pageNumber === PDFViewerApplication.page) {
    PDFViewerApplication.toolbar.updateLoadingIndicatorState(false);
  }

  // Prevent errors in the edge-case where the PDF document is removed *before*
  // the 'pagerendered' event handler is invoked.
  if (!pageView) {
    return;
  }

  // Use the rendered page to set the corresponding thumbnail image.
  if (PDFViewerApplication.pdfSidebar.isThumbnailViewVisible) {
    const thumbnailView = PDFViewerApplication.pdfThumbnailViewer.getThumbnail(
      pageIndex
    );
    thumbnailView.setImage(pageView);
  }

  if (typeof Stats !== "undefined" && Stats.enabled && pageView.stats) {
    Stats.add(pageNumber, pageView.stats);
  }

  if (pageView.error) {
    PDFViewerApplication.l10n
      .get(
        "rendering_error",
        null,
        "An error occurred while rendering the page."
      )
      .then(msg => {
        PDFViewerApplication.error(msg, pageView.error);
      });
  }

  if (
    typeof PDFJSDev === "undefined" ||
    PDFJSDev.test("MOZCENTRAL || GENERIC")
  ) {
    PDFViewerApplication.externalServices.reportTelemetry({
      type: "pageInfo",
      timestamp: evt.timestamp,
    });
    // It is a good time to report stream and font types.
    PDFViewerApplication.pdfDocument.getStats().then(function(stats) {
      PDFViewerApplication.externalServices.reportTelemetry({
        type: "documentStats",
        stats,
      });
    });
  }
}

function webViewerPageMode({ mode }) {
  // Handle the 'pagemode' hash parameter, see also `PDFLinkService_setHash`.
  let view;
  switch (mode) {
    case "thumbs":
      view = SidebarView.THUMBS;
      break;
    case "bookmarks":
    case "outline":
      view = SidebarView.OUTLINE;
      break;
    case "attachments":
      view = SidebarView.ATTACHMENTS;
      break;
    case "none":
      view = SidebarView.NONE;
      break;
    default:
      console.error('Invalid "pagemode" hash parameter: ' + mode);
      return;
  }
  PDFViewerApplication.pdfSidebar.switchView(view, /* forceOpen = */ true);
}

function webViewerNamedAction(evt) {
  // Processing couple of named actions that might be useful.
  // See also PDFLinkService.executeNamedAction
  const action = evt.action;
  switch (action) {
    case "GoToPage":
      PDFViewerApplication.appConfig.toolbar.pageNumber.select();
      break;

    case "Find":
      if (!PDFViewerApplication.supportsIntegratedFind) {
        PDFViewerApplication.findBar.toggle();
      }
      break;
  }
}

function webViewerPresentationModeChanged({ active, switchInProgress }) {
  let state = PresentationModeState.NORMAL;
  if (switchInProgress) {
    state = PresentationModeState.CHANGING;
  } else if (active) {
    state = PresentationModeState.FULLSCREEN;
  }
  PDFViewerApplication.pdfViewer.presentationModeState = state;
}

function webViewerSidebarViewChanged(evt) {
  PDFViewerApplication.pdfRenderingQueue.isThumbnailViewEnabled =
    PDFViewerApplication.pdfSidebar.isThumbnailViewVisible;

  const store = PDFViewerApplication.store;
  if (store && PDFViewerApplication.isInitialViewSet) {
    // Only update the storage when the document has been loaded *and* rendered.
    store.set("sidebarView", evt.view).catch(function() {});
  }
}

function webViewerUpdateViewarea(evt) {
  const location = evt.location,
    store = PDFViewerApplication.store;

  if (store && PDFViewerApplication.isInitialViewSet) {
    store
      .setMultiple({
        page: location.pageNumber,
        zoom: location.scale,
        scrollLeft: location.left,
        scrollTop: location.top,
        rotation: location.rotation,
      })
      .catch(function() {
        /* unable to write to storage */
      });
  }
  const href = PDFViewerApplication.pdfLinkService.getAnchorUrl(
    location.pdfOpenParams
  );
  PDFViewerApplication.appConfig.toolbar.viewBookmark.href = href;
  PDFViewerApplication.appConfig.secondaryToolbar.viewBookmarkButton.href = href;

  // Show/hide the loading indicator in the page number input element.
  const currentPage = PDFViewerApplication.pdfViewer.getPageView(
    PDFViewerApplication.page - 1
  );
  const loading = currentPage.renderingState !== RenderingStates.FINISHED;
  PDFViewerApplication.toolbar.updateLoadingIndicatorState(loading);
}

function webViewerScrollModeChanged(evt) {
  const store = PDFViewerApplication.store;
  if (store && PDFViewerApplication.isInitialViewSet) {
    // Only update the storage when the document has been loaded *and* rendered.
    store.set("scrollMode", evt.mode).catch(function() {});
  }
}

function webViewerSpreadModeChanged(evt) {
  const store = PDFViewerApplication.store;
  if (store && PDFViewerApplication.isInitialViewSet) {
    // Only update the storage when the document has been loaded *and* rendered.
    store.set("spreadMode", evt.mode).catch(function() {});
  }
}

function webViewerResize() {
  const { pdfDocument, pdfViewer } = PDFViewerApplication;
  if (!pdfDocument) {
    return;
  }
  const currentScaleValue = pdfViewer.currentScaleValue;
  if (
    currentScaleValue === "auto" ||
    currentScaleValue === "page-fit" ||
    currentScaleValue === "page-width"
  ) {
    // Note: the scale is constant for 'page-actual'.
    pdfViewer.currentScaleValue = currentScaleValue;
  }
  pdfViewer.update();
}

function webViewerHashchange(evt) {
  const hash = evt.hash;
  if (!hash) {
    return;
  }
  if (!PDFViewerApplication.isInitialViewSet) {
    PDFViewerApplication.initialBookmark = hash;
  } else if (!PDFViewerApplication.pdfHistory.popStateInProgress) {
    PDFViewerApplication.pdfLinkService.setHash(hash);
  }
}

let webViewerFileInputChange;
if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
  webViewerFileInputChange = function webViewerFileInputChange(evt) {
    if (
      PDFViewerApplication.pdfViewer &&
      PDFViewerApplication.pdfViewer.isInPresentationMode
    ) {
      return; // Opening a new PDF file isn't supported in Presentation Mode.
    }
    const file = evt.fileInput.files[0];

    if (URL.createObjectURL && !AppOptions.get("disableCreateObjectURL")) {
      let url = URL.createObjectURL(file);
      if (file.name) {
        url = { url, originalUrl: file.name };
      }
      PDFViewerApplication.open(url);
    } else {
      PDFViewerApplication.setTitleUsingUrl(file.name);
      // Read the local file into a Uint8Array.
      const fileReader = new FileReader();
      fileReader.onload = function webViewerChangeFileReaderOnload(evt) {
        const buffer = evt.target.result;
        PDFViewerApplication.open(new Uint8Array(buffer));
      };
      fileReader.readAsArrayBuffer(file);
    }

    // URL does not reflect proper document location - hiding some icons.
    const appConfig = PDFViewerApplication.appConfig;
    appConfig.toolbar.viewBookmark.setAttribute("hidden", "true");
    appConfig.secondaryToolbar.viewBookmarkButton.setAttribute(
      "hidden",
      "true"
    );
    appConfig.toolbar.download.setAttribute("hidden", "true");
    appConfig.secondaryToolbar.downloadButton.setAttribute("hidden", "true");
  };
}

function webViewerPresentationMode() {
  PDFViewerApplication.requestPresentationMode();
}
function webViewerOpenFile() {
  if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
    const openFileInputName = PDFViewerApplication.appConfig.openFileInputName;
    document.getElementById(openFileInputName).click();
  }
}
function webViewerPrint() {
  window.print();
}
function webViewerDownload() {
  PDFViewerApplication.download();
}
function webViewerFirstPage() {
  if (PDFViewerApplication.pdfDocument) {
    PDFViewerApplication.page = 1;
  }
}
function webViewerLastPage() {
  if (PDFViewerApplication.pdfDocument) {
    PDFViewerApplication.page = PDFViewerApplication.pagesCount;
  }
}
function webViewerNextPage() {
  PDFViewerApplication.page++;
}
function webViewerPreviousPage() {
  PDFViewerApplication.page--;
}
function webViewerZoomIn() {
  PDFViewerApplication.zoomIn();
}
function webViewerZoomOut() {
  PDFViewerApplication.zoomOut();
}
function webViewerZoomReset() {
  PDFViewerApplication.zoomReset();
}
function webViewerPageNumberChanged(evt) {
  const pdfViewer = PDFViewerApplication.pdfViewer;
  // Note that for `<input type="number">` HTML elements, an empty string will
  // be returned for non-number inputs; hence we simply do nothing in that case.
  if (evt.value !== "") {
    pdfViewer.currentPageLabel = evt.value;
  }

  // Ensure that the page number input displays the correct value, even if the
  // value entered by the user was invalid (e.g. a floating point number).
  if (
    evt.value !== pdfViewer.currentPageNumber.toString() &&
    evt.value !== pdfViewer.currentPageLabel
  ) {
    PDFViewerApplication.toolbar.setPageNumber(
      pdfViewer.currentPageNumber,
      pdfViewer.currentPageLabel
    );
  }
}
function webViewerScaleChanged(evt) {
  PDFViewerApplication.pdfViewer.currentScaleValue = evt.value;
}
function webViewerRotateCw() {
  PDFViewerApplication.rotatePages(90);
}
function webViewerRotateCcw() {
  PDFViewerApplication.rotatePages(-90);
}
function webViewerSwitchScrollMode(evt) {
  PDFViewerApplication.pdfViewer.scrollMode = evt.mode;
}
function webViewerSwitchSpreadMode(evt) {
  PDFViewerApplication.pdfViewer.spreadMode = evt.mode;
}
function webViewerDocumentProperties() {
  PDFViewerApplication.pdfDocumentProperties.open();
}

function webViewerFind(evt) {
  PDFViewerApplication.findController.executeCommand("find" + evt.type, {
    query: evt.query,
    phraseSearch: evt.phraseSearch,
    caseSensitive: evt.caseSensitive,
    entireWord: evt.entireWord,
    highlightAll: evt.highlightAll,
    findPrevious: evt.findPrevious,
  });
}

function webViewerFindFromUrlHash(evt) {
  PDFViewerApplication.findController.executeCommand("find", {
    query: evt.query,
    phraseSearch: evt.phraseSearch,
    caseSensitive: false,
    entireWord: false,
    highlightAll: true,
    findPrevious: false,
  });
}

function webViewerUpdateFindMatchesCount({ matchesCount }) {
  if (PDFViewerApplication.supportsIntegratedFind) {
    PDFViewerApplication.externalServices.updateFindMatchesCount(matchesCount);
  } else {
    PDFViewerApplication.findBar.updateResultsCount(matchesCount);
  }
}

function webViewerUpdateFindControlState({ state, previous, matchesCount }) {
  if (PDFViewerApplication.supportsIntegratedFind) {
    PDFViewerApplication.externalServices.updateFindControlState({
      result: state,
      findPrevious: previous,
      matchesCount,
    });
  } else {
    PDFViewerApplication.findBar.updateUIState(state, previous, matchesCount);
  }
}

function webViewerScaleChanging(evt) {
  PDFViewerApplication.toolbar.setPageScale(evt.presetValue, evt.scale);

  PDFViewerApplication.pdfViewer.update();
}

function webViewerRotationChanging(evt) {
  PDFViewerApplication.pdfThumbnailViewer.pagesRotation = evt.pagesRotation;

  PDFViewerApplication.forceRendering();
  // Ensure that the active page doesn't change during rotation.
  PDFViewerApplication.pdfViewer.currentPageNumber = evt.pageNumber;
}

function webViewerPageChanging(evt) {
  const page = evt.pageNumber;

  PDFViewerApplication.toolbar.setPageNumber(page, evt.pageLabel || null);
  PDFViewerApplication.secondaryToolbar.setPageNumber(page);

  if (PDFViewerApplication.pdfSidebar.isThumbnailViewVisible) {
    PDFViewerApplication.pdfThumbnailViewer.scrollThumbnailIntoView(page);
  }

  // We need to update stats.
  if (typeof Stats !== "undefined" && Stats.enabled) {
    const pageView = PDFViewerApplication.pdfViewer.getPageView(page - 1);
    if (pageView && pageView.stats) {
      Stats.add(page, pageView.stats);
    }
  }
}

function webViewerVisibilityChange(evt) {
  if (document.visibilityState === "visible") {
    // Ignore mouse wheel zooming during tab switches (bug 1503412).
    setZoomDisabledTimeout();
  }
}

let zoomDisabledTimeout = null;
function setZoomDisabledTimeout() {
  if (zoomDisabledTimeout) {
    clearTimeout(zoomDisabledTimeout);
  }
  zoomDisabledTimeout = setTimeout(function() {
    zoomDisabledTimeout = null;
  }, WHEEL_ZOOM_DISABLED_TIMEOUT);
}

function webViewerWheel(evt) {
  const {
    pdfViewer,
    supportedMouseWheelZoomModifierKeys,
  } = PDFViewerApplication;

  if (pdfViewer.isInPresentationMode) {
    return;
  }

  if (
    (evt.ctrlKey && supportedMouseWheelZoomModifierKeys.ctrlKey) ||
    (evt.metaKey && supportedMouseWheelZoomModifierKeys.metaKey)
  ) {
    // Only zoom the pages, not the entire viewer.
    evt.preventDefault();
    // NOTE: this check must be placed *after* preventDefault.
    if (zoomDisabledTimeout || document.visibilityState === "hidden") {
      return;
    }

    const previousScale = pdfViewer.currentScale;

    const delta = normalizeWheelEventDelta(evt);

    const MOUSE_WHEEL_DELTA_PER_PAGE_SCALE = 3.0;
    const ticks = delta * MOUSE_WHEEL_DELTA_PER_PAGE_SCALE;
    if (ticks < 0) {
      PDFViewerApplication.zoomOut(-ticks);
    } else {
      PDFViewerApplication.zoomIn(ticks);
    }

    const currentScale = pdfViewer.currentScale;
    if (previousScale !== currentScale) {
      // After scaling the page via zoomIn/zoomOut, the position of the upper-
      // left corner is restored. When the mouse wheel is used, the position
      // under the cursor should be restored instead.
      const scaleCorrectionFactor = currentScale / previousScale - 1;
      const rect = pdfViewer.container.getBoundingClientRect();
      const dx = evt.clientX - rect.left;
      const dy = evt.clientY - rect.top;
      pdfViewer.container.scrollLeft += dx * scaleCorrectionFactor;
      pdfViewer.container.scrollTop += dy * scaleCorrectionFactor;
    }
  } else {
    setZoomDisabledTimeout();
  }
}

function webViewerClick(evt) {
  if (!PDFViewerApplication.secondaryToolbar.isOpen) {
    return;
  }
  const appConfig = PDFViewerApplication.appConfig;
  if (
    PDFViewerApplication.pdfViewer.containsElement(evt.target) ||
    (appConfig.toolbar.container.contains(evt.target) &&
      evt.target !== appConfig.secondaryToolbar.toggleButton)
  ) {
    PDFViewerApplication.secondaryToolbar.close();
  }
}

function webViewerKeyDown(evt) {
  if (PDFViewerApplication.overlayManager.active) {
    return;
  }

  let handled = false,
    ensureViewerFocused = false;
  const cmd =
    (evt.ctrlKey ? 1 : 0) |
    (evt.altKey ? 2 : 0) |
    (evt.shiftKey ? 4 : 0) |
    (evt.metaKey ? 8 : 0);

  const pdfViewer = PDFViewerApplication.pdfViewer;
  const isViewerInPresentationMode =
    pdfViewer && pdfViewer.isInPresentationMode;

  // First, handle the key bindings that are independent whether an input
  // control is selected or not.
  if (cmd === 1 || cmd === 8 || cmd === 5 || cmd === 12) {
    // either CTRL or META key with optional SHIFT.
    switch (evt.keyCode) {
      case 70: // f
        if (!PDFViewerApplication.supportsIntegratedFind) {
          PDFViewerApplication.findBar.open();
          handled = true;
        }
        break;
      case 71: // g
        if (!PDFViewerApplication.supportsIntegratedFind) {
          const findState = PDFViewerApplication.findController.state;
          if (findState) {
            PDFViewerApplication.findController.executeCommand("findagain", {
              query: findState.query,
              phraseSearch: findState.phraseSearch,
              caseSensitive: findState.caseSensitive,
              entireWord: findState.entireWord,
              highlightAll: findState.highlightAll,
              findPrevious: cmd === 5 || cmd === 12,
            });
          }
          handled = true;
        }
        break;
      case 61: // FF/Mac '='
      case 107: // FF '+' and '='
      case 187: // Chrome '+'
      case 171: // FF with German keyboard
        if (!isViewerInPresentationMode) {
          PDFViewerApplication.zoomIn();
        }
        handled = true;
        break;
      case 173: // FF/Mac '-'
      case 109: // FF '-'
      case 189: // Chrome '-'
        if (!isViewerInPresentationMode) {
          PDFViewerApplication.zoomOut();
        }
        handled = true;
        break;
      case 48: // '0'
      case 96: // '0' on Numpad of Swedish keyboard
        if (!isViewerInPresentationMode) {
          // keeping it unhandled (to restore page zoom to 100%)
          setTimeout(function() {
            // ... and resetting the scale after browser adjusts its scale
            PDFViewerApplication.zoomReset();
          });
          handled = false;
        }
        break;

      case 38: // up arrow
        if (isViewerInPresentationMode || PDFViewerApplication.page > 1) {
          PDFViewerApplication.page = 1;
          handled = true;
          ensureViewerFocused = true;
        }
        break;
      case 40: // down arrow
        if (
          isViewerInPresentationMode ||
          PDFViewerApplication.page < PDFViewerApplication.pagesCount
        ) {
          PDFViewerApplication.page = PDFViewerApplication.pagesCount;
          handled = true;
          ensureViewerFocused = true;
        }
        break;
    }
  }

  if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
    // CTRL or META without shift
    if (cmd === 1 || cmd === 8) {
      switch (evt.keyCode) {
        case 83: // s
          PDFViewerApplication.download();
          handled = true;
          break;
      }
    }
  }

  // CTRL+ALT or Option+Command
  if (cmd === 3 || cmd === 10) {
    switch (evt.keyCode) {
      case 80: // p
        PDFViewerApplication.requestPresentationMode();
        handled = true;
        break;
      case 71: // g
        // focuses input#pageNumber field
        PDFViewerApplication.appConfig.toolbar.pageNumber.select();
        handled = true;
        break;
    }
  }

  if (handled) {
    if (ensureViewerFocused && !isViewerInPresentationMode) {
      pdfViewer.focus();
    }
    evt.preventDefault();
    return;
  }

  // Some shortcuts should not get handled if a control/input element
  // is selected.
  const curElement = document.activeElement || document.querySelector(":focus");
  const curElementTagName = curElement && curElement.tagName.toUpperCase();
  if (
    curElementTagName === "INPUT" ||
    curElementTagName === "TEXTAREA" ||
    curElementTagName === "SELECT" ||
    (curElement && curElement.isContentEditable)
  ) {
    // Make sure that the secondary toolbar is closed when Escape is pressed.
    if (evt.keyCode !== /* Esc = */ 27) {
      return;
    }
  }

  // No control key pressed at all.
  if (cmd === 0) {
    let turnPage = 0,
      turnOnlyIfPageFit = false;
    switch (evt.keyCode) {
      case 38: // up arrow
      case 33: // pg up
        // vertical scrolling using arrow/pg keys
        if (pdfViewer.isVerticalScrollbarEnabled) {
          turnOnlyIfPageFit = true;
        }
        turnPage = -1;
        break;
      case 8: // backspace
        if (!isViewerInPresentationMode) {
          turnOnlyIfPageFit = true;
        }
        turnPage = -1;
        break;
      case 37: // left arrow
        // horizontal scrolling using arrow keys
        if (pdfViewer.isHorizontalScrollbarEnabled) {
          turnOnlyIfPageFit = true;
        }
      /* falls through */
      case 75: // 'k'
      case 80: // 'p'
        turnPage = -1;
        break;
      case 27: // esc key
        if (PDFViewerApplication.secondaryToolbar.isOpen) {
          PDFViewerApplication.secondaryToolbar.close();
          handled = true;
        }
        if (
          !PDFViewerApplication.supportsIntegratedFind &&
          PDFViewerApplication.findBar.opened
        ) {
          PDFViewerApplication.findBar.close();
          handled = true;
        }
        break;
      case 40: // down arrow
      case 34: // pg down
        // vertical scrolling using arrow/pg keys
        if (pdfViewer.isVerticalScrollbarEnabled) {
          turnOnlyIfPageFit = true;
        }
        turnPage = 1;
        break;
      case 13: // enter key
      case 32: // spacebar
        if (!isViewerInPresentationMode) {
          turnOnlyIfPageFit = true;
        }
        turnPage = 1;
        break;
      case 39: // right arrow
        // horizontal scrolling using arrow keys
        if (pdfViewer.isHorizontalScrollbarEnabled) {
          turnOnlyIfPageFit = true;
        }
      /* falls through */
      case 74: // 'j'
      case 78: // 'n'
        turnPage = 1;
        break;

      case 36: // home
        if (isViewerInPresentationMode || PDFViewerApplication.page > 1) {
          PDFViewerApplication.page = 1;
          handled = true;
          ensureViewerFocused = true;
        }
        break;
      case 35: // end
        if (
          isViewerInPresentationMode ||
          PDFViewerApplication.page < PDFViewerApplication.pagesCount
        ) {
          PDFViewerApplication.page = PDFViewerApplication.pagesCount;
          handled = true;
          ensureViewerFocused = true;
        }
        break;

      case 83: // 's'
        PDFViewerApplication.pdfCursorTools.switchTool(CursorTool.SELECT);
        break;
      case 72: // 'h'
        PDFViewerApplication.pdfCursorTools.switchTool(CursorTool.HAND);
        break;

      case 82: // 'r'
        PDFViewerApplication.rotatePages(90);
        break;

      case 115: // F4
        PDFViewerApplication.pdfSidebar.toggle();
        break;
    }

    if (
      turnPage !== 0 &&
      (!turnOnlyIfPageFit || pdfViewer.currentScaleValue === "page-fit")
    ) {
      if (turnPage > 0) {
        if (PDFViewerApplication.page < PDFViewerApplication.pagesCount) {
          PDFViewerApplication.page++;
        }
      } else {
        if (PDFViewerApplication.page > 1) {
          PDFViewerApplication.page--;
        }
      }
      handled = true;
    }
  }

  // shift-key
  if (cmd === 4) {
    switch (evt.keyCode) {
      case 13: // enter key
      case 32: // spacebar
        if (
          !isViewerInPresentationMode &&
          pdfViewer.currentScaleValue !== "page-fit"
        ) {
          break;
        }
        if (PDFViewerApplication.page > 1) {
          PDFViewerApplication.page--;
        }
        handled = true;
        break;

      case 82: // 'r'
        PDFViewerApplication.rotatePages(-90);
        break;
    }
  }

  if (!handled && !isViewerInPresentationMode) {
    // 33=Page Up  34=Page Down  35=End    36=Home
    // 37=Left     38=Up         39=Right  40=Down
    // 32=Spacebar
    if (
      (evt.keyCode >= 33 && evt.keyCode <= 40) ||
      (evt.keyCode === 32 && curElementTagName !== "BUTTON")
    ) {
      ensureViewerFocused = true;
    }
  }

  if (ensureViewerFocused && !pdfViewer.containsElement(curElement)) {
    // The page container is not focused, but a page navigation key has been
    // pressed. Change the focus to the viewer container to make sure that
    // navigation by keyboard works as expected.
    pdfViewer.focus();
  }

  if (handled) {
    evt.preventDefault();
  }
}

/**
 * Converts API PageLayout values to the format used by `PDFViewer`.
 * NOTE: This is supported to the extent that the viewer implements the
 *       necessary Scroll/Spread modes (since SinglePage, TwoPageLeft,
 *       and TwoPageRight all suggests using non-continuous scrolling).
 * @param {string} mode - The API PageLayout value.
 * @returns {number} A value from {SpreadMode}.
 */
function apiPageLayoutToSpreadMode(layout) {
  switch (layout) {
    case "SinglePage":
    case "OneColumn":
      return SpreadMode.NONE;
    case "TwoColumnLeft":
    case "TwoPageLeft":
      return SpreadMode.ODD;
    case "TwoColumnRight":
    case "TwoPageRight":
      return SpreadMode.EVEN;
  }
  return SpreadMode.NONE; // Default value.
}

/**
 * Converts API PageMode values to the format used by `PDFSidebar`.
 * NOTE: There's also a "FullScreen" parameter which is not possible to support,
 *       since the Fullscreen API used in browsers requires that entering
 *       fullscreen mode only occurs as a result of a user-initiated event.
 * @param {string} mode - The API PageMode value.
 * @returns {number} A value from {SidebarView}.
 */
function apiPageModeToSidebarView(mode) {
  switch (mode) {
    case "UseNone":
      return SidebarView.NONE;
    case "UseThumbs":
      return SidebarView.THUMBS;
    case "UseOutlines":
      return SidebarView.OUTLINE;
    case "UseAttachments":
      return SidebarView.ATTACHMENTS;
    case "UseOC":
    // Not implemented, since we don't support Optional Content Groups yet.
  }
  return SidebarView.NONE; // Default value.
}

/* Abstract factory for the print service. */
const PDFPrintServiceFactory = {
  instance: {
    supportsPrinting: false,
    createPrintService() {
      throw new Error("Not implemented: createPrintService");
    },
  },
};

export {
  PDFViewerApplication,
  DefaultExternalServices,
  PDFPrintServiceFactory,
};
