/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */

/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


;
let pdfjsWebApp, pdfjsWebAppOptions;
{
  pdfjsWebApp = __webpack_require__(1);
  pdfjsWebAppOptions = __webpack_require__(3);
}
;
{
  __webpack_require__(33);
}
;
{
  __webpack_require__(38);
}

function getViewerConfiguration() {
  return {
    appContainer: document.body,
    mainContainer: document.getElementById("viewerContainer"),
    viewerContainer: document.getElementById("viewer"),
    eventBus: null,
    toolbar: {
      container: document.getElementById("toolbarViewer"),
      numPages: document.getElementById("numPages"),
      pageNumber: document.getElementById("pageNumber"),
      scaleSelectContainer: document.getElementById("scaleSelectContainer"),
      scaleSelect: document.getElementById("scaleSelect"),
      customScaleOption: document.getElementById("customScaleOption"),
      previous: document.getElementById("previous"),
      next: document.getElementById("next"),
      zoomIn: document.getElementById("zoomIn"),
      zoomOut: document.getElementById("zoomOut"),
      viewFind: document.getElementById("viewFind"),
      openFile: document.getElementById("openFile"),
      print: document.getElementById("print"),
      presentationModeButton: document.getElementById("presentationMode"),
      download: document.getElementById("download"),
      viewBookmark: document.getElementById("viewBookmark")
    },
    secondaryToolbar: {
      toolbar: document.getElementById("secondaryToolbar"),
      toggleButton: document.getElementById("secondaryToolbarToggle"),
      toolbarButtonContainer: document.getElementById("secondaryToolbarButtonContainer"),
      presentationModeButton: document.getElementById("secondaryPresentationMode"),
      openFileButton: document.getElementById("secondaryOpenFile"),
      printButton: document.getElementById("secondaryPrint"),
      downloadButton: document.getElementById("secondaryDownload"),
      viewBookmarkButton: document.getElementById("secondaryViewBookmark"),
      firstPageButton: document.getElementById("firstPage"),
      lastPageButton: document.getElementById("lastPage"),
      pageRotateCwButton: document.getElementById("pageRotateCw"),
      pageRotateCcwButton: document.getElementById("pageRotateCcw"),
      cursorSelectToolButton: document.getElementById("cursorSelectTool"),
      cursorHandToolButton: document.getElementById("cursorHandTool"),
      scrollVerticalButton: document.getElementById("scrollVertical"),
      scrollHorizontalButton: document.getElementById("scrollHorizontal"),
      scrollWrappedButton: document.getElementById("scrollWrapped"),
      spreadNoneButton: document.getElementById("spreadNone"),
      spreadOddButton: document.getElementById("spreadOdd"),
      spreadEvenButton: document.getElementById("spreadEven"),
      documentPropertiesButton: document.getElementById("documentProperties")
    },
    fullscreen: {
      contextFirstPage: document.getElementById("contextFirstPage"),
      contextLastPage: document.getElementById("contextLastPage"),
      contextPageRotateCw: document.getElementById("contextPageRotateCw"),
      contextPageRotateCcw: document.getElementById("contextPageRotateCcw")
    },
    sidebar: {
      outerContainer: document.getElementById("outerContainer"),
      viewerContainer: document.getElementById("viewerContainer"),
      toggleButton: document.getElementById("sidebarToggle"),
      thumbnailButton: document.getElementById("viewThumbnail"),
      outlineButton: document.getElementById("viewOutline"),
      attachmentsButton: document.getElementById("viewAttachments"),
      thumbnailView: document.getElementById("thumbnailView"),
      outlineView: document.getElementById("outlineView"),
      attachmentsView: document.getElementById("attachmentsView")
    },
    sidebarResizer: {
      outerContainer: document.getElementById("outerContainer"),
      resizer: document.getElementById("sidebarResizer")
    },
    findBar: {
      bar: document.getElementById("findbar"),
      toggleButton: document.getElementById("viewFind"),
      findField: document.getElementById("findInput"),
      highlightAllCheckbox: document.getElementById("findHighlightAll"),
      caseSensitiveCheckbox: document.getElementById("findMatchCase"),
      entireWordCheckbox: document.getElementById("findEntireWord"),
      findMsg: document.getElementById("findMsg"),
      findResultsCount: document.getElementById("findResultsCount"),
      findPreviousButton: document.getElementById("findPrevious"),
      findNextButton: document.getElementById("findNext")
    },
    passwordOverlay: {
      overlayName: "passwordOverlay",
      container: document.getElementById("passwordOverlay"),
      label: document.getElementById("passwordText"),
      input: document.getElementById("password"),
      submitButton: document.getElementById("passwordSubmit"),
      cancelButton: document.getElementById("passwordCancel")
    },
    documentProperties: {
      overlayName: "documentPropertiesOverlay",
      container: document.getElementById("documentPropertiesOverlay"),
      closeButton: document.getElementById("documentPropertiesClose"),
      fields: {
        fileName: document.getElementById("fileNameField"),
        fileSize: document.getElementById("fileSizeField"),
        title: document.getElementById("titleField"),
        author: document.getElementById("authorField"),
        subject: document.getElementById("subjectField"),
        keywords: document.getElementById("keywordsField"),
        creationDate: document.getElementById("creationDateField"),
        modificationDate: document.getElementById("modificationDateField"),
        creator: document.getElementById("creatorField"),
        producer: document.getElementById("producerField"),
        version: document.getElementById("versionField"),
        pageCount: document.getElementById("pageCountField"),
        pageSize: document.getElementById("pageSizeField"),
        linearized: document.getElementById("linearizedField")
      }
    },
    errorWrapper: {
      container: document.getElementById("errorWrapper"),
      errorMessage: document.getElementById("errorMessage"),
      closeButton: document.getElementById("errorClose"),
      errorMoreInfo: document.getElementById("errorMoreInfo"),
      moreInfoButton: document.getElementById("errorShowMore"),
      lessInfoButton: document.getElementById("errorShowLess")
    },
    printContainer: document.getElementById("printContainer"),
    openFileInputName: "fileInput",
    debuggerScriptPath: "./debugger.js"
  };
}

function webViewerLoad() {
  const config = getViewerConfiguration();
  window.PDFViewerApplication = pdfjsWebApp.PDFViewerApplication;
  window.PDFViewerApplicationOptions = pdfjsWebAppOptions.AppOptions;
  const event = document.createEvent("CustomEvent");
  event.initCustomEvent("webviewerloaded", true, true, {});
  document.dispatchEvent(event);
  pdfjsWebApp.PDFViewerApplication.run(config);
}

if (document.readyState === "interactive" || document.readyState === "complete") {
  webViewerLoad();
} else {
  document.addEventListener("DOMContentLoaded", webViewerLoad, true);
}

/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFPrintServiceFactory = exports.DefaultExternalServices = exports.PDFViewerApplication = void 0;

var _ui_utils = __webpack_require__(2);

var _app_options = __webpack_require__(3);

var _pdfjsLib = __webpack_require__(4);

var _pdf_cursor_tools = __webpack_require__(6);

var _pdf_rendering_queue = __webpack_require__(8);

var _pdf_sidebar = __webpack_require__(9);

var _overlay_manager = __webpack_require__(10);

var _password_prompt = __webpack_require__(11);

var _pdf_attachment_viewer = __webpack_require__(12);

var _pdf_document_properties = __webpack_require__(13);

var _pdf_find_bar = __webpack_require__(14);

var _pdf_find_controller = __webpack_require__(15);

var _pdf_history = __webpack_require__(17);

var _pdf_link_service = __webpack_require__(18);

var _pdf_outline_viewer = __webpack_require__(19);

var _pdf_presentation_mode = __webpack_require__(20);

var _pdf_sidebar_resizer = __webpack_require__(21);

var _pdf_thumbnail_viewer = __webpack_require__(22);

var _pdf_viewer = __webpack_require__(24);

var _secondary_toolbar = __webpack_require__(29);

var _toolbar = __webpack_require__(31);

var _view_history = __webpack_require__(32);

const DEFAULT_SCALE_DELTA = 1.1;
const DISABLE_AUTO_FETCH_LOADING_BAR_TIMEOUT = 5000;
const FORCE_PAGES_LOADED_TIMEOUT = 10000;
const WHEEL_ZOOM_DISABLED_TIMEOUT = 1000;
const ViewOnLoad = {
  UNKNOWN: -1,
  PREVIOUS: 0,
  INITIAL: 1
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
    return (0, _pdfjsLib.shadow)(this, "supportsIntegratedFind", false);
  }

  static get supportsDocumentFonts() {
    return (0, _pdfjsLib.shadow)(this, "supportsDocumentFonts", true);
  }

  static get supportedMouseWheelZoomModifierKeys() {
    return (0, _pdfjsLib.shadow)(this, "supportedMouseWheelZoomModifierKeys", {
      ctrlKey: true,
      metaKey: true
    });
  }

}

exports.DefaultExternalServices = DefaultExternalServices;
const PDFViewerApplication = {
  initialBookmark: document.location.hash.substring(1),
  _initializedCapability: (0, _pdfjsLib.createPromiseCapability)(),
  fellback: false,
  appConfig: null,
  pdfDocument: null,
  pdfLoadingTask: null,
  printService: null,
  pdfViewer: null,
  pdfThumbnailViewer: null,
  pdfRenderingQueue: null,
  pdfPresentationMode: null,
  pdfDocumentProperties: null,
  pdfLinkService: null,
  pdfHistory: null,
  pdfSidebar: null,
  pdfSidebarResizer: null,
  pdfOutlineViewer: null,
  pdfAttachmentViewer: null,
  pdfCursorTools: null,
  store: null,
  downloadManager: null,
  overlayManager: null,
  preferences: null,
  toolbar: null,
  secondaryToolbar: null,
  eventBus: null,
  l10n: null,
  isInitialViewSet: false,
  downloadComplete: false,
  isViewerEmbedded: window.parent !== window,
  url: "",
  baseUrl: "",
  externalServices: DefaultExternalServices,
  _boundEvents: {},
  contentDispositionFilename: null,

  async initialize(appConfig) {
    this.preferences = this.externalServices.createPreferences();
    this.appConfig = appConfig;
    await this._readPreferences();
    await this._parseHashParameters();
    await this._initializeL10n();

    if (this.isViewerEmbedded && _app_options.AppOptions.get("externalLinkTarget") === _pdfjsLib.LinkTarget.NONE) {
      _app_options.AppOptions.set("externalLinkTarget", _pdfjsLib.LinkTarget.TOP);
    }

    await this._initializeViewerComponents();
    this.bindEvents();
    this.bindWindowEvents();
    const appContainer = appConfig.appContainer || document.documentElement;
    this.l10n.translate(appContainer).then(() => {
      this.eventBus.dispatch("localized", {
        source: this
      });
    });

    this._initializedCapability.resolve();
  },

  async _readPreferences() {
    if (_app_options.AppOptions.get("disablePreferences") === true) {
      return;
    }

    try {
      const prefs = await this.preferences.getAll();

      for (const name in prefs) {
        _app_options.AppOptions.set(name, prefs[name]);
      }
    } catch (reason) {
      console.error(`_readPreferences: "${reason.message}".`);
    }
  },

  async _parseHashParameters() {
    if (!_app_options.AppOptions.get("pdfBugEnabled")) {
      return undefined;
    }

    const hash = document.location.hash.substring(1);

    if (!hash) {
      return undefined;
    }

    const hashParams = (0, _ui_utils.parseQueryString)(hash),
          waitOn = [];

    if ("disableworker" in hashParams && hashParams["disableworker"] === "true") {
      waitOn.push(loadFakeWorker());
    }

    if ("disablerange" in hashParams) {
      _app_options.AppOptions.set("disableRange", hashParams["disablerange"] === "true");
    }

    if ("disablestream" in hashParams) {
      _app_options.AppOptions.set("disableStream", hashParams["disablestream"] === "true");
    }

    if ("disableautofetch" in hashParams) {
      _app_options.AppOptions.set("disableAutoFetch", hashParams["disableautofetch"] === "true");
    }

    if ("disablefontface" in hashParams) {
      _app_options.AppOptions.set("disableFontFace", hashParams["disablefontface"] === "true");
    }

    if ("disablehistory" in hashParams) {
      _app_options.AppOptions.set("disableHistory", hashParams["disablehistory"] === "true");
    }

    if ("webgl" in hashParams) {
      _app_options.AppOptions.set("enableWebGL", hashParams["webgl"] === "true");
    }

    if ("verbosity" in hashParams) {
      _app_options.AppOptions.set("verbosity", hashParams["verbosity"] | 0);
    }

    if ("textlayer" in hashParams) {
      switch (hashParams["textlayer"]) {
        case "off":
          _app_options.AppOptions.set("textLayerMode", _ui_utils.TextLayerMode.DISABLE);

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
      _app_options.AppOptions.set("pdfBug", true);

      const enabled = hashParams["pdfbug"].split(",");
      waitOn.push(loadAndEnablePDFBug(enabled));
    }

    if ("locale" in hashParams) {
      _app_options.AppOptions.set("locale", hashParams["locale"]);
    }

    return Promise.all(waitOn).catch(reason => {
      console.error(`_parseHashParameters: "${reason.message}".`);
    });
  },

  async _initializeL10n() {
    this.l10n = this.externalServices.createL10n({
      locale: _app_options.AppOptions.get("locale")
    });
    const dir = await this.l10n.getDirection();
    document.getElementsByTagName("html")[0].dir = dir;
  },

  async _initializeViewerComponents() {
    const appConfig = this.appConfig;
    this.overlayManager = new _overlay_manager.OverlayManager();
    const eventBus = appConfig.eventBus || new _ui_utils.EventBus({
      dispatchToDOM: _app_options.AppOptions.get("eventBusDispatchToDOM")
    });
    this.eventBus = eventBus;
    const pdfRenderingQueue = new _pdf_rendering_queue.PDFRenderingQueue();
    pdfRenderingQueue.onIdle = this.cleanup.bind(this);
    this.pdfRenderingQueue = pdfRenderingQueue;
    const pdfLinkService = new _pdf_link_service.PDFLinkService({
      eventBus,
      externalLinkTarget: _app_options.AppOptions.get("externalLinkTarget"),
      externalLinkRel: _app_options.AppOptions.get("externalLinkRel"),
      ignoreDestinationZoom: _app_options.AppOptions.get("ignoreDestinationZoom")
    });
    this.pdfLinkService = pdfLinkService;
    const downloadManager = this.externalServices.createDownloadManager({
      disableCreateObjectURL: _app_options.AppOptions.get("disableCreateObjectURL")
    });
    this.downloadManager = downloadManager;
    const findController = new _pdf_find_controller.PDFFindController({
      linkService: pdfLinkService,
      eventBus
    });
    this.findController = findController;
    const container = appConfig.mainContainer;
    const viewer = appConfig.viewerContainer;
    this.pdfViewer = new _pdf_viewer.PDFViewer({
      container,
      viewer,
      eventBus,
      renderingQueue: pdfRenderingQueue,
      linkService: pdfLinkService,
      downloadManager,
      findController,
      renderer: _app_options.AppOptions.get("renderer"),
      enableWebGL: _app_options.AppOptions.get("enableWebGL"),
      l10n: this.l10n,
      textLayerMode: _app_options.AppOptions.get("textLayerMode"),
      imageResourcesPath: _app_options.AppOptions.get("imageResourcesPath"),
      renderInteractiveForms: _app_options.AppOptions.get("renderInteractiveForms"),
      enablePrintAutoRotate: _app_options.AppOptions.get("enablePrintAutoRotate"),
      useOnlyCssZoom: _app_options.AppOptions.get("useOnlyCssZoom"),
      maxCanvasPixels: _app_options.AppOptions.get("maxCanvasPixels")
    });
    pdfRenderingQueue.setViewer(this.pdfViewer);
    pdfLinkService.setViewer(this.pdfViewer);
    this.pdfThumbnailViewer = new _pdf_thumbnail_viewer.PDFThumbnailViewer({
      container: appConfig.sidebar.thumbnailView,
      renderingQueue: pdfRenderingQueue,
      linkService: pdfLinkService,
      l10n: this.l10n
    });
    pdfRenderingQueue.setThumbnailViewer(this.pdfThumbnailViewer);
    this.pdfHistory = new _pdf_history.PDFHistory({
      linkService: pdfLinkService,
      eventBus
    });
    pdfLinkService.setHistory(this.pdfHistory);

    if (!this.supportsIntegratedFind) {
      this.findBar = new _pdf_find_bar.PDFFindBar(appConfig.findBar, eventBus, this.l10n);
    }

    this.pdfDocumentProperties = new _pdf_document_properties.PDFDocumentProperties(appConfig.documentProperties, this.overlayManager, eventBus, this.l10n);
    this.pdfCursorTools = new _pdf_cursor_tools.PDFCursorTools({
      container,
      eventBus,
      cursorToolOnLoad: _app_options.AppOptions.get("cursorToolOnLoad")
    });
    this.toolbar = new _toolbar.Toolbar(appConfig.toolbar, eventBus, this.l10n);
    this.secondaryToolbar = new _secondary_toolbar.SecondaryToolbar(appConfig.secondaryToolbar, container, eventBus);

    if (this.supportsFullscreen) {
      this.pdfPresentationMode = new _pdf_presentation_mode.PDFPresentationMode({
        container,
        pdfViewer: this.pdfViewer,
        eventBus,
        contextMenuItems: appConfig.fullscreen
      });
    }

    this.passwordPrompt = new _password_prompt.PasswordPrompt(appConfig.passwordOverlay, this.overlayManager, this.l10n);
    this.pdfOutlineViewer = new _pdf_outline_viewer.PDFOutlineViewer({
      container: appConfig.sidebar.outlineView,
      eventBus,
      linkService: pdfLinkService
    });
    this.pdfAttachmentViewer = new _pdf_attachment_viewer.PDFAttachmentViewer({
      container: appConfig.sidebar.attachmentsView,
      eventBus,
      downloadManager
    });
    this.pdfSidebar = new _pdf_sidebar.PDFSidebar({
      elements: appConfig.sidebar,
      pdfViewer: this.pdfViewer,
      pdfThumbnailViewer: this.pdfThumbnailViewer,
      eventBus,
      l10n: this.l10n
    });
    this.pdfSidebar.onToggled = this.forceRendering.bind(this);
    this.pdfSidebarResizer = new _pdf_sidebar_resizer.PDFSidebarResizer(appConfig.sidebarResizer, eventBus, this.l10n);
  },

  run(config) {
    this.initialize(config).then(webViewerInitialized);
  },

  get initialized() {
    return this._initializedCapability.settled;
  },

  get initializedPromise() {
    return this._initializedCapability.promise;
  },

  zoomIn(ticks) {
    if (this.pdfViewer.isInPresentationMode) {
      return;
    }

    let newScale = this.pdfViewer.currentScale;

    do {
      newScale = (newScale * DEFAULT_SCALE_DELTA).toFixed(2);
      newScale = Math.ceil(newScale * 10) / 10;
      newScale = Math.min(_ui_utils.MAX_SCALE, newScale);
    } while (--ticks > 0 && newScale < _ui_utils.MAX_SCALE);

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
      newScale = Math.max(_ui_utils.MIN_SCALE, newScale);
    } while (--ticks > 0 && newScale > _ui_utils.MIN_SCALE);

    this.pdfViewer.currentScaleValue = newScale;
  },

  zoomReset() {
    if (this.pdfViewer.isInPresentationMode) {
      return;
    }

    this.pdfViewer.currentScaleValue = _ui_utils.DEFAULT_SCALE_VALUE;
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
    const doc = document.documentElement;
    support = !!(doc.requestFullscreen || doc.mozRequestFullScreen || doc.webkitRequestFullScreen || doc.msRequestFullscreen);

    if (document.fullscreenEnabled === false || document.mozFullScreenEnabled === false || document.webkitFullscreenEnabled === false || document.msFullscreenEnabled === false) {
      support = false;
    }

    return (0, _pdfjsLib.shadow)(this, "supportsFullscreen", support);
  },

  get supportsIntegratedFind() {
    return this.externalServices.supportsIntegratedFind;
  },

  get supportsDocumentFonts() {
    return this.externalServices.supportsDocumentFonts;
  },

  get loadingBar() {
    const bar = new _ui_utils.ProgressBar("#loadingBar");
    return (0, _pdfjsLib.shadow)(this, "loadingBar", bar);
  },

  get supportedMouseWheelZoomModifierKeys() {
    return this.externalServices.supportedMouseWheelZoomModifierKeys;
  },

  initPassiveLoading() {
    throw new Error("Not implemented: initPassiveLoading");
  },

  setTitleUsingUrl(url = "") {
    this.url = url;
    this.baseUrl = url.split("#")[0];
    let title = (0, _ui_utils.getPDFFileNameFromURL)(url, "");

    if (!title) {
      try {
        title = decodeURIComponent((0, _pdfjsLib.getFilenameFromUrl)(url)) || url;
      } catch (ex) {
        title = url;
      }
    }

    this.setTitle(title);
  },

  setTitle(title) {
    if (this.isViewerEmbedded) {
      return;
    }

    document.title = title;
  },

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

  async open(file, args) {
    if (this.pdfLoadingTask) {
      await this.close();
    }

    const workerParameters = _app_options.AppOptions.getAll(_app_options.OptionKind.WORKER);

    for (const key in workerParameters) {
      _pdfjsLib.GlobalWorkerOptions[key] = workerParameters[key];
    }

    const parameters = Object.create(null);

    if (typeof file === "string") {
      this.setTitleUsingUrl(file);
      parameters.url = file;
    } else if (file && "byteLength" in file) {
      parameters.data = file;
    } else if (file.url && file.originalUrl) {
      this.setTitleUsingUrl(file.originalUrl);
      parameters.url = file.url;
    }

    const apiParameters = _app_options.AppOptions.getAll(_app_options.OptionKind.API);

    for (const key in apiParameters) {
      let value = apiParameters[key];

      if (key === "docBaseUrl" && !value) {}

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

    const loadingTask = (0, _pdfjsLib.getDocument)(parameters);
    this.pdfLoadingTask = loadingTask;

    loadingTask.onPassword = (updateCallback, reason) => {
      this.pdfLinkService.externalLinkEnabled = false;
      this.passwordPrompt.setUpdateCallback(updateCallback, reason);
      this.passwordPrompt.open();
    };

    loadingTask.onProgress = ({
      loaded,
      total
    }) => {
      this.progress(loaded / total);
    };

    loadingTask.onUnsupportedFeature = this.fallback.bind(this);
    return loadingTask.promise.then(pdfDocument => {
      this.load(pdfDocument);
    }, exception => {
      if (loadingTask !== this.pdfLoadingTask) {
        return undefined;
      }

      const message = exception && exception.message;
      let loadingErrorMessage;

      if (exception instanceof _pdfjsLib.InvalidPDFException) {
        loadingErrorMessage = this.l10n.get("invalid_file_error", null, "Invalid or corrupted PDF file.");
      } else if (exception instanceof _pdfjsLib.MissingPDFException) {
        loadingErrorMessage = this.l10n.get("missing_file_error", null, "Missing PDF file.");
      } else if (exception instanceof _pdfjsLib.UnexpectedResponseException) {
        loadingErrorMessage = this.l10n.get("unexpected_response_error", null, "Unexpected server response.");
      } else {
        loadingErrorMessage = this.l10n.get("loading_error", null, "An error occurred while loading the PDF.");
      }

      return loadingErrorMessage.then(msg => {
        this.error(msg, {
          message
        });
        throw new Error(msg);
      });
    });
  },

  download() {
    function downloadByUrl() {
      downloadManager.downloadUrl(url, filename);
    }

    const url = this.baseUrl;
    const filename = this.contentDispositionFilename || (0, _ui_utils.getPDFFileNameFromURL)(this.url);
    const downloadManager = this.downloadManager;

    downloadManager.onerror = err => {
      this.error(`PDF failed to download: ${err}`);
    };

    if (!this.pdfDocument || !this.downloadComplete) {
      downloadByUrl();
      return;
    }

    this.pdfDocument.getData().then(function (data) {
      const blob = new Blob([data], {
        type: "application/pdf"
      });
      downloadManager.download(blob, url, filename);
    }).catch(downloadByUrl);
  },

  fallback(featureId) {
    if (this.fellback) {
      return;
    }

    this.fellback = true;
    this.externalServices.fallback({
      featureId,
      url: this.baseUrl
    }, function response(download) {
      if (!download) {
        return;
      }

      PDFViewerApplication.download();
    });
  },

  error(message, moreInfo) {
    const moreInfoText = [this.l10n.get("error_version_info", {
      version: _pdfjsLib.version || "?",
      build: _pdfjsLib.build || "?"
    }, "PDF.js v{{version}} (build: {{build}})")];

    if (moreInfo) {
      moreInfoText.push(this.l10n.get("error_message", {
        message: moreInfo.message
      }, "Message: {{message}}"));

      if (moreInfo.stack) {
        moreInfoText.push(this.l10n.get("error_stack", {
          stack: moreInfo.stack
        }, "Stack: {{stack}}"));
      } else {
        if (moreInfo.filename) {
          moreInfoText.push(this.l10n.get("error_file", {
            file: moreInfo.filename
          }, "File: {{file}}"));
        }

        if (moreInfo.lineNumber) {
          moreInfoText.push(this.l10n.get("error_line", {
            line: moreInfo.lineNumber
          }, "Line: {{line}}"));
        }
      }
    }

    const errorWrapperConfig = this.appConfig.errorWrapper;
    const errorWrapper = errorWrapperConfig.container;
    errorWrapper.removeAttribute("hidden");
    const errorMessage = errorWrapperConfig.errorMessage;
    errorMessage.textContent = message;
    const closeButton = errorWrapperConfig.closeButton;

    closeButton.onclick = function () {
      errorWrapper.setAttribute("hidden", "true");
    };

    const errorMoreInfo = errorWrapperConfig.errorMoreInfo;
    const moreInfoButton = errorWrapperConfig.moreInfoButton;
    const lessInfoButton = errorWrapperConfig.lessInfoButton;

    moreInfoButton.onclick = function () {
      errorMoreInfo.removeAttribute("hidden");
      moreInfoButton.setAttribute("hidden", "true");
      lessInfoButton.removeAttribute("hidden");
      errorMoreInfo.style.height = errorMoreInfo.scrollHeight + "px";
    };

    lessInfoButton.onclick = function () {
      errorMoreInfo.setAttribute("hidden", "true");
      moreInfoButton.removeAttribute("hidden");
      lessInfoButton.setAttribute("hidden", "true");
    };

    moreInfoButton.oncontextmenu = _ui_utils.noContextMenuHandler;
    lessInfoButton.oncontextmenu = _ui_utils.noContextMenuHandler;
    closeButton.oncontextmenu = _ui_utils.noContextMenuHandler;
    moreInfoButton.removeAttribute("hidden");
    lessInfoButton.setAttribute("hidden", "true");
    Promise.all(moreInfoText).then(parts => {
      errorMoreInfo.value = parts.join("\n");
    });
  },

  progress(level) {
    if (this.downloadComplete) {
      return;
    }

    const percent = Math.round(level * 100);

    if (percent > this.loadingBar.percent || isNaN(percent)) {
      this.loadingBar.percent = percent;
      const disableAutoFetch = this.pdfDocument ? this.pdfDocument.loadingParams["disableAutoFetch"] : _app_options.AppOptions.get("disableAutoFetch");

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
        this.eventBus.dispatch("documentloaded", {
          source: this
        });
      });
    });
    const pageLayoutPromise = pdfDocument.getPageLayout().catch(function () {});
    const pageModePromise = pdfDocument.getPageMode().catch(function () {});
    const openActionPromise = pdfDocument.getOpenAction().catch(function () {});
    this.toolbar.setPagesCount(pdfDocument.numPages, false);
    this.secondaryToolbar.setPagesCount(pdfDocument.numPages);
    let baseDocumentUrl;
    baseDocumentUrl = null;
    this.pdfLinkService.setDocument(pdfDocument, baseDocumentUrl);
    this.pdfDocumentProperties.setDocument(pdfDocument, this.url);
    const pdfViewer = this.pdfViewer;
    pdfViewer.setDocument(pdfDocument);
    const {
      firstPagePromise,
      onePageRendered,
      pagesPromise
    } = pdfViewer;
    const pdfThumbnailViewer = this.pdfThumbnailViewer;
    pdfThumbnailViewer.setDocument(pdfDocument);
    const storedPromise = (this.store = new _view_history.ViewHistory(pdfDocument.fingerprint)).getMultiple({
      page: null,
      zoom: _ui_utils.DEFAULT_SCALE_VALUE,
      scrollLeft: "0",
      scrollTop: "0",
      rotation: null,
      sidebarView: _pdf_sidebar.SidebarView.UNKNOWN,
      scrollMode: _ui_utils.ScrollMode.UNKNOWN,
      spreadMode: _ui_utils.SpreadMode.UNKNOWN
    }).catch(() => {
      return Object.create(null);
    });
    firstPagePromise.then(pdfPage => {
      this.loadingBar.setWidth(this.appConfig.viewerContainer);
      Promise.all([_ui_utils.animationStarted, storedPromise, pageLayoutPromise, pageModePromise, openActionPromise]).then(async ([timeStamp, stored, pageLayout, pageMode, openAction]) => {
        const viewOnLoad = _app_options.AppOptions.get("viewOnLoad");

        this._initializePdfHistory({
          fingerprint: pdfDocument.fingerprint,
          viewOnLoad,
          initialDest: openAction && openAction.dest
        });

        const initialBookmark = this.initialBookmark;

        const zoom = _app_options.AppOptions.get("defaultZoomValue");

        let hash = zoom ? `zoom=${zoom}` : null;
        let rotation = null;

        let sidebarView = _app_options.AppOptions.get("sidebarViewOnLoad");

        let scrollMode = _app_options.AppOptions.get("scrollModeOnLoad");

        let spreadMode = _app_options.AppOptions.get("spreadModeOnLoad");

        if (stored.page && viewOnLoad !== ViewOnLoad.INITIAL) {
          hash = `page=${stored.page}&zoom=${zoom || stored.zoom},` + `${stored.scrollLeft},${stored.scrollTop}`;
          rotation = parseInt(stored.rotation, 10);

          if (sidebarView === _pdf_sidebar.SidebarView.UNKNOWN) {
            sidebarView = stored.sidebarView | 0;
          }

          if (scrollMode === _ui_utils.ScrollMode.UNKNOWN) {
            scrollMode = stored.scrollMode | 0;
          }

          if (spreadMode === _ui_utils.SpreadMode.UNKNOWN) {
            spreadMode = stored.spreadMode | 0;
          }
        }

        if (pageMode && sidebarView === _pdf_sidebar.SidebarView.UNKNOWN) {
          sidebarView = apiPageModeToSidebarView(pageMode);
        }

        if (pageLayout && spreadMode === _ui_utils.SpreadMode.UNKNOWN) {
          spreadMode = apiPageLayoutToSpreadMode(pageLayout);
        }

        this.setInitialView(hash, {
          rotation,
          sidebarView,
          scrollMode,
          spreadMode
        });
        this.eventBus.dispatch("documentinit", {
          source: this
        });

        if (!this.isViewerEmbedded) {
          pdfViewer.focus();
        }

        await Promise.race([pagesPromise, new Promise(resolve => {
          setTimeout(resolve, FORCE_PAGES_LOADED_TIMEOUT);
        })]);

        if (!initialBookmark && !hash) {
          return;
        }

        if (pdfViewer.hasEqualPageSizes) {
          return;
        }

        this.initialBookmark = initialBookmark;
        pdfViewer.currentScaleValue = pdfViewer.currentScaleValue;
        this.setInitialView(hash);
      }).catch(() => {
        this.setInitialView();
      }).then(function () {
        pdfViewer.update();
      });
    });
    pdfDocument.getPageLabels().then(labels => {
      if (!labels || _app_options.AppOptions.get("disablePageLabels")) {
        return;
      }

      const numLabels = labels.length;

      if (numLabels !== this.pagesCount) {
        console.error("The number of Page Labels does not match " + "the number of pages in the document.");
        return;
      }

      let i = 0;

      while (i < numLabels && labels[i] === (i + 1).toString()) {
        i++;
      }

      if (i === numLabels) {
        return;
      }

      pdfViewer.setPageLabels(labels);
      pdfThumbnailViewer.setPageLabels(labels);
      this.toolbar.setPagesCount(pdfDocument.numPages, true);
      this.toolbar.setPageNumber(pdfViewer.currentPageNumber, pdfViewer.currentPageLabel);
    });
    pagesPromise.then(async () => {
      const [openAction, javaScript] = await Promise.all([openActionPromise, pdfDocument.getJavaScript()]);
      let triggerAutoPrint = false;

      if (openAction && openAction.action === "Print") {
        triggerAutoPrint = true;
      }

      if (javaScript) {
        javaScript.some(js => {
          if (!js) {
            return false;
          }

          console.warn("Warning: JavaScript is not supported");
          this.fallback(_pdfjsLib.UNSUPPORTED_FEATURES.javaScript);
          return true;
        });

        if (!triggerAutoPrint) {
          for (const js of javaScript) {
            if (js && _ui_utils.AutoPrintRegExp.test(js)) {
              triggerAutoPrint = true;
              break;
            }
          }
        }
      }

      if (!this.supportsPrinting) {
        return;
      }

      if (triggerAutoPrint) {
        setTimeout(function () {
          window.print();
        });
      }
    });
    onePageRendered.then(() => {
      pdfDocument.getOutline().then(outline => {
        this.pdfOutlineViewer.render({
          outline
        });
      });
      pdfDocument.getAttachments().then(attachments => {
        this.pdfAttachmentViewer.render({
          attachments
        });
      });
    });
    pdfDocument.getMetadata().then(({
      info,
      metadata,
      contentDispositionFilename
    }) => {
      this.documentInfo = info;
      this.metadata = metadata;
      this.contentDispositionFilename = contentDispositionFilename;
      console.log("PDF " + pdfDocument.fingerprint + " [" + info.PDFFormatVersion + " " + (info.Producer || "-").trim() + " / " + (info.Creator || "-").trim() + "]" + " (PDF.js: " + (_pdfjsLib.version || "-") + (_app_options.AppOptions.get("enableWebGL") ? " [WebGL]" : "") + ")");
      let pdfTitle;
      const infoTitle = info && info["Title"];

      if (infoTitle) {
        pdfTitle = infoTitle;
      }

      const metadataTitle = metadata && metadata.get("dc:title");

      if (metadataTitle) {
        if (metadataTitle !== "Untitled" && !/[\uFFF0-\uFFFF]/g.test(metadataTitle)) {
          pdfTitle = metadataTitle;
        }
      }

      if (pdfTitle) {
        this.setTitle(`${pdfTitle} - ${contentDispositionFilename || document.title}`);
      } else if (contentDispositionFilename) {
        this.setTitle(contentDispositionFilename);
      }

      if (info.IsAcroFormPresent) {
        console.warn("Warning: AcroForm/XFA is not supported");
        this.fallback(_pdfjsLib.UNSUPPORTED_FEATURES.forms);
      }

      let versionId = "other";
      const KNOWN_VERSIONS = ["1.0", "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9", "2.0", "2.1", "2.2", "2.3"];

      if (KNOWN_VERSIONS.includes(info.PDFFormatVersion)) {
        versionId = `v${info.PDFFormatVersion.replace(".", "_")}`;
      }

      let generatorId = "other";
      const KNOWN_GENERATORS = ["acrobat distiller", "acrobat pdfwriter", "adobe livecycle", "adobe pdf library", "adobe photoshop", "ghostscript", "tcpdf", "cairo", "dvipdfm", "dvips", "pdftex", "pdfkit", "itext", "prince", "quarkxpress", "mac os x", "microsoft", "openoffice", "oracle", "luradocument", "pdf-xchange", "antenna house", "aspose.cells", "fpdf"];

      if (info.Producer) {
        const producer = info.Producer.toLowerCase();
        KNOWN_GENERATORS.some(function (generator) {
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
        formType
      });
    });
  },

  _initializePdfHistory({
    fingerprint,
    viewOnLoad,
    initialDest = null
  }) {
    if (_app_options.AppOptions.get("disableHistory") || this.isViewerEmbedded) {
      return;
    }

    this.pdfHistory.initialize({
      fingerprint,
      resetHistory: viewOnLoad === ViewOnLoad.INITIAL,
      updateUrl: _app_options.AppOptions.get("historyUpdateUrl")
    });

    if (this.pdfHistory.initialBookmark) {
      this.initialBookmark = this.pdfHistory.initialBookmark;
      this.initialRotation = this.pdfHistory.initialRotation;
    }

    if (initialDest && !this.initialBookmark && viewOnLoad === ViewOnLoad.UNKNOWN) {
      this.initialBookmark = JSON.stringify(initialDest);
      this.pdfHistory.push({
        explicitDest: initialDest,
        pageNumber: null
      });
    }
  },

  setInitialView(storedHash, {
    rotation,
    sidebarView,
    scrollMode,
    spreadMode
  } = {}) {
    const setRotation = angle => {
      if ((0, _ui_utils.isValidRotation)(angle)) {
        this.pdfViewer.pagesRotation = angle;
      }
    };

    const setViewerModes = (scroll, spread) => {
      if ((0, _ui_utils.isValidScrollMode)(scroll)) {
        this.pdfViewer.scrollMode = scroll;
      }

      if ((0, _ui_utils.isValidSpreadMode)(spread)) {
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

    this.toolbar.setPageNumber(this.pdfViewer.currentPageNumber, this.pdfViewer.currentPageLabel);
    this.secondaryToolbar.setPageNumber(this.pdfViewer.currentPageNumber);

    if (!this.pdfViewer.currentScaleValue) {
      this.pdfViewer.currentScaleValue = _ui_utils.DEFAULT_SCALE_VALUE;
    }
  },

  cleanup() {
    if (!this.pdfDocument) {
      return;
    }

    this.pdfViewer.cleanup();
    this.pdfThumbnailViewer.cleanup();

    if (this.pdfViewer.renderer !== _ui_utils.RendererType.SVG) {
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
      return;
    }

    if (!this.supportsPrinting) {
      this.l10n.get("printing_not_supported", null, "Warning: Printing is not fully supported by this browser.").then(printMessage => {
        this.error(printMessage);
      });
      return;
    }

    if (!this.pdfViewer.pageViewsReady) {
      this.l10n.get("printing_not_ready", null, "Warning: The PDF is not fully loaded for printing.").then(notReadyMessage => {
        window.alert(notReadyMessage);
      });
      return;
    }

    const pagesOverview = this.pdfViewer.getPagesOverview();
    const printContainer = this.appConfig.printContainer;
    const printService = PDFPrintServiceFactory.instance.createPrintService(this.pdfDocument, pagesOverview, printContainer, this.l10n);
    this.printService = printService;
    this.forceRendering();
    printService.layout();
    this.externalServices.reportTelemetry({
      type: "print"
    });
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
  },

  requestPresentationMode() {
    if (!this.pdfPresentationMode) {
      return;
    }

    this.pdfPresentationMode.request();
  },

  bindEvents() {
    const {
      eventBus,
      _boundEvents
    } = this;
    _boundEvents.beforePrint = this.beforePrint.bind(this);
    _boundEvents.afterPrint = this.afterPrint.bind(this);

    eventBus._on("resize", webViewerResize);

    eventBus._on("hashchange", webViewerHashchange);

    eventBus._on("beforeprint", _boundEvents.beforePrint);

    eventBus._on("afterprint", _boundEvents.afterPrint);

    eventBus._on("pagerendered", webViewerPageRendered);

    eventBus._on("updateviewarea", webViewerUpdateViewarea);

    eventBus._on("pagechanging", webViewerPageChanging);

    eventBus._on("scalechanging", webViewerScaleChanging);

    eventBus._on("rotationchanging", webViewerRotationChanging);

    eventBus._on("sidebarviewchanged", webViewerSidebarViewChanged);

    eventBus._on("pagemode", webViewerPageMode);

    eventBus._on("namedaction", webViewerNamedAction);

    eventBus._on("presentationmodechanged", webViewerPresentationModeChanged);

    eventBus._on("presentationmode", webViewerPresentationMode);

    eventBus._on("print", webViewerPrint);

    eventBus._on("download", webViewerDownload);

    eventBus._on("firstpage", webViewerFirstPage);

    eventBus._on("lastpage", webViewerLastPage);

    eventBus._on("nextpage", webViewerNextPage);

    eventBus._on("previouspage", webViewerPreviousPage);

    eventBus._on("zoomin", webViewerZoomIn);

    eventBus._on("zoomout", webViewerZoomOut);

    eventBus._on("zoomreset", webViewerZoomReset);

    eventBus._on("pagenumberchanged", webViewerPageNumberChanged);

    eventBus._on("scalechanged", webViewerScaleChanged);

    eventBus._on("rotatecw", webViewerRotateCw);

    eventBus._on("rotateccw", webViewerRotateCcw);

    eventBus._on("switchscrollmode", webViewerSwitchScrollMode);

    eventBus._on("scrollmodechanged", webViewerScrollModeChanged);

    eventBus._on("switchspreadmode", webViewerSwitchSpreadMode);

    eventBus._on("spreadmodechanged", webViewerSpreadModeChanged);

    eventBus._on("documentproperties", webViewerDocumentProperties);

    eventBus._on("find", webViewerFind);

    eventBus._on("findfromurlhash", webViewerFindFromUrlHash);

    eventBus._on("updatefindmatchescount", webViewerUpdateFindMatchesCount);

    eventBus._on("updatefindcontrolstate", webViewerUpdateFindControlState);

    eventBus._on("fileinputchange", webViewerFileInputChange);

    eventBus._on("openfile", webViewerOpenFile);
  },

  bindWindowEvents() {
    const {
      eventBus,
      _boundEvents
    } = this;

    _boundEvents.windowResize = () => {
      eventBus.dispatch("resize", {
        source: window
      });
    };

    _boundEvents.windowHashChange = () => {
      eventBus.dispatch("hashchange", {
        source: window,
        hash: document.location.hash.substring(1)
      });
    };

    _boundEvents.windowBeforePrint = () => {
      eventBus.dispatch("beforeprint", {
        source: window
      });
    };

    _boundEvents.windowAfterPrint = () => {
      eventBus.dispatch("afterprint", {
        source: window
      });
    };

    window.addEventListener("visibilitychange", webViewerVisibilityChange);
    window.addEventListener("wheel", webViewerWheel, {
      passive: false
    });
    window.addEventListener("click", webViewerClick);
    window.addEventListener("keydown", webViewerKeyDown);
    window.addEventListener("resize", _boundEvents.windowResize);
    window.addEventListener("hashchange", _boundEvents.windowHashChange);
    window.addEventListener("beforeprint", _boundEvents.windowBeforePrint);
    window.addEventListener("afterprint", _boundEvents.windowAfterPrint);
  },

  unbindEvents() {
    const {
      eventBus,
      _boundEvents
    } = this;

    eventBus._off("resize", webViewerResize);

    eventBus._off("hashchange", webViewerHashchange);

    eventBus._off("beforeprint", _boundEvents.beforePrint);

    eventBus._off("afterprint", _boundEvents.afterPrint);

    eventBus._off("pagerendered", webViewerPageRendered);

    eventBus._off("updateviewarea", webViewerUpdateViewarea);

    eventBus._off("pagechanging", webViewerPageChanging);

    eventBus._off("scalechanging", webViewerScaleChanging);

    eventBus._off("rotationchanging", webViewerRotationChanging);

    eventBus._off("sidebarviewchanged", webViewerSidebarViewChanged);

    eventBus._off("pagemode", webViewerPageMode);

    eventBus._off("namedaction", webViewerNamedAction);

    eventBus._off("presentationmodechanged", webViewerPresentationModeChanged);

    eventBus._off("presentationmode", webViewerPresentationMode);

    eventBus._off("print", webViewerPrint);

    eventBus._off("download", webViewerDownload);

    eventBus._off("firstpage", webViewerFirstPage);

    eventBus._off("lastpage", webViewerLastPage);

    eventBus._off("nextpage", webViewerNextPage);

    eventBus._off("previouspage", webViewerPreviousPage);

    eventBus._off("zoomin", webViewerZoomIn);

    eventBus._off("zoomout", webViewerZoomOut);

    eventBus._off("zoomreset", webViewerZoomReset);

    eventBus._off("pagenumberchanged", webViewerPageNumberChanged);

    eventBus._off("scalechanged", webViewerScaleChanged);

    eventBus._off("rotatecw", webViewerRotateCw);

    eventBus._off("rotateccw", webViewerRotateCcw);

    eventBus._off("switchscrollmode", webViewerSwitchScrollMode);

    eventBus._off("scrollmodechanged", webViewerScrollModeChanged);

    eventBus._off("switchspreadmode", webViewerSwitchSpreadMode);

    eventBus._off("spreadmodechanged", webViewerSpreadModeChanged);

    eventBus._off("documentproperties", webViewerDocumentProperties);

    eventBus._off("find", webViewerFind);

    eventBus._off("findfromurlhash", webViewerFindFromUrlHash);

    eventBus._off("updatefindmatchescount", webViewerUpdateFindMatchesCount);

    eventBus._off("updatefindcontrolstate", webViewerUpdateFindControlState);

    eventBus._off("fileinputchange", webViewerFileInputChange);

    eventBus._off("openfile", webViewerOpenFile);

    _boundEvents.beforePrint = null;
    _boundEvents.afterPrint = null;
  },

  unbindWindowEvents() {
    const {
      _boundEvents
    } = this;
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
  }

};
exports.PDFViewerApplication = PDFViewerApplication;
let validateFileURL;
{
  const HOSTED_VIEWER_ORIGINS = ["null", "http://mozilla.github.io", "https://mozilla.github.io"];

  validateFileURL = function (file) {
    if (file === undefined) {
      return;
    }

    try {
      const viewerOrigin = new URL(window.location.href).origin || "null";

      if (HOSTED_VIEWER_ORIGINS.includes(viewerOrigin)) {
        return;
      }

      const {
        origin,
        protocol
      } = new URL(file, window.location.href);

      if (origin !== viewerOrigin && protocol !== "blob:") {
        throw new Error("file origin does not match viewer's");
      }
    } catch (ex) {
      const message = ex && ex.message;
      PDFViewerApplication.l10n.get("loading_error", null, "An error occurred while loading the PDF.").then(loadingErrorMessage => {
        PDFViewerApplication.error(loadingErrorMessage, {
          message
        });
      });
      throw ex;
    }
  };
}

async function loadFakeWorker() {
  if (!_pdfjsLib.GlobalWorkerOptions.workerSrc) {
    _pdfjsLib.GlobalWorkerOptions.workerSrc = _app_options.AppOptions.get("workerSrc");
  }

  return (0, _pdfjsLib.loadScript)(_pdfjsLib.PDFWorker.getWorkerSrc());
}

function loadAndEnablePDFBug(enabledTabs) {
  const appConfig = PDFViewerApplication.appConfig;
  return (0, _pdfjsLib.loadScript)(appConfig.debuggerScriptPath).then(function () {
    PDFBug.enable(enabledTabs);
    PDFBug.init({
      OPS: _pdfjsLib.OPS
    }, appConfig.mainContainer);
  });
}

function webViewerInitialized() {
  const appConfig = PDFViewerApplication.appConfig;
  let file;
  const queryString = document.location.search.substring(1);
  const params = (0, _ui_utils.parseQueryString)(queryString);
  file = "file" in params ? params.file : _app_options.AppOptions.get("defaultUrl");
  validateFileURL(file);
  const fileInput = document.createElement("input");
  fileInput.id = appConfig.openFileInputName;
  fileInput.className = "fileInput";
  fileInput.setAttribute("type", "file");
  fileInput.oncontextmenu = _ui_utils.noContextMenuHandler;
  document.body.appendChild(fileInput);

  if (!window.File || !window.FileReader || !window.FileList || !window.Blob) {
    appConfig.toolbar.openFile.setAttribute("hidden", "true");
    appConfig.secondaryToolbar.openFileButton.setAttribute("hidden", "true");
  } else {
    fileInput.value = null;
  }

  fileInput.addEventListener("change", function (evt) {
    const files = evt.target.files;

    if (!files || files.length === 0) {
      return;
    }

    PDFViewerApplication.eventBus.dispatch("fileinputchange", {
      source: this,
      fileInput: evt.target
    });
  });
  appConfig.mainContainer.addEventListener("dragover", function (evt) {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = "move";
  });
  appConfig.mainContainer.addEventListener("drop", function (evt) {
    evt.preventDefault();
    const files = evt.dataTransfer.files;

    if (!files || files.length === 0) {
      return;
    }

    PDFViewerApplication.eventBus.dispatch("fileinputchange", {
      source: this,
      fileInput: evt.dataTransfer
    });
  });

  if (!PDFViewerApplication.supportsDocumentFonts) {
    _app_options.AppOptions.set("disableFontFace", true);

    PDFViewerApplication.l10n.get("web_fonts_disabled", null, "Web fonts are disabled: unable to use embedded PDF fonts.").then(msg => {
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

  appConfig.mainContainer.addEventListener("transitionend", function (evt) {
    if (evt.target === this) {
      PDFViewerApplication.eventBus.dispatch("resize", {
        source: this
      });
    }
  }, true);

  try {
    webViewerOpenFileViaURL(file);
  } catch (reason) {
    PDFViewerApplication.l10n.get("loading_error", null, "An error occurred while loading the PDF.").then(msg => {
      PDFViewerApplication.error(msg, reason);
    });
  }
}

let webViewerOpenFileViaURL;
{
  webViewerOpenFileViaURL = function (file) {
    if (file && file.lastIndexOf("file:", 0) === 0) {
      PDFViewerApplication.setTitleUsingUrl(file);
      const xhr = new XMLHttpRequest();

      xhr.onload = function () {
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
}

function webViewerPageRendered(evt) {
  const pageNumber = evt.pageNumber;
  const pageIndex = pageNumber - 1;
  const pageView = PDFViewerApplication.pdfViewer.getPageView(pageIndex);

  if (pageNumber === PDFViewerApplication.page) {
    PDFViewerApplication.toolbar.updateLoadingIndicatorState(false);
  }

  if (!pageView) {
    return;
  }

  if (PDFViewerApplication.pdfSidebar.isThumbnailViewVisible) {
    const thumbnailView = PDFViewerApplication.pdfThumbnailViewer.getThumbnail(pageIndex);
    thumbnailView.setImage(pageView);
  }

  if (typeof Stats !== "undefined" && Stats.enabled && pageView.stats) {
    Stats.add(pageNumber, pageView.stats);
  }

  if (pageView.error) {
    PDFViewerApplication.l10n.get("rendering_error", null, "An error occurred while rendering the page.").then(msg => {
      PDFViewerApplication.error(msg, pageView.error);
    });
  }

  PDFViewerApplication.externalServices.reportTelemetry({
    type: "pageInfo",
    timestamp: evt.timestamp
  });
  PDFViewerApplication.pdfDocument.getStats().then(function (stats) {
    PDFViewerApplication.externalServices.reportTelemetry({
      type: "documentStats",
      stats
    });
  });
}

function webViewerPageMode({
  mode
}) {
  let view;

  switch (mode) {
    case "thumbs":
      view = _pdf_sidebar.SidebarView.THUMBS;
      break;

    case "bookmarks":
    case "outline":
      view = _pdf_sidebar.SidebarView.OUTLINE;
      break;

    case "attachments":
      view = _pdf_sidebar.SidebarView.ATTACHMENTS;
      break;

    case "none":
      view = _pdf_sidebar.SidebarView.NONE;
      break;

    default:
      console.error('Invalid "pagemode" hash parameter: ' + mode);
      return;
  }

  PDFViewerApplication.pdfSidebar.switchView(view, true);
}

function webViewerNamedAction(evt) {
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

function webViewerPresentationModeChanged({
  active,
  switchInProgress
}) {
  let state = _ui_utils.PresentationModeState.NORMAL;

  if (switchInProgress) {
    state = _ui_utils.PresentationModeState.CHANGING;
  } else if (active) {
    state = _ui_utils.PresentationModeState.FULLSCREEN;
  }

  PDFViewerApplication.pdfViewer.presentationModeState = state;
}

function webViewerSidebarViewChanged(evt) {
  PDFViewerApplication.pdfRenderingQueue.isThumbnailViewEnabled = PDFViewerApplication.pdfSidebar.isThumbnailViewVisible;
  const store = PDFViewerApplication.store;

  if (store && PDFViewerApplication.isInitialViewSet) {
    store.set("sidebarView", evt.view).catch(function () {});
  }
}

function webViewerUpdateViewarea(evt) {
  const location = evt.location,
        store = PDFViewerApplication.store;

  if (store && PDFViewerApplication.isInitialViewSet) {
    store.setMultiple({
      page: location.pageNumber,
      zoom: location.scale,
      scrollLeft: location.left,
      scrollTop: location.top,
      rotation: location.rotation
    }).catch(function () {});
  }

  const href = PDFViewerApplication.pdfLinkService.getAnchorUrl(location.pdfOpenParams);
  PDFViewerApplication.appConfig.toolbar.viewBookmark.href = href;
  PDFViewerApplication.appConfig.secondaryToolbar.viewBookmarkButton.href = href;
  const currentPage = PDFViewerApplication.pdfViewer.getPageView(PDFViewerApplication.page - 1);
  const loading = currentPage.renderingState !== _pdf_rendering_queue.RenderingStates.FINISHED;
  PDFViewerApplication.toolbar.updateLoadingIndicatorState(loading);
}

function webViewerScrollModeChanged(evt) {
  const store = PDFViewerApplication.store;

  if (store && PDFViewerApplication.isInitialViewSet) {
    store.set("scrollMode", evt.mode).catch(function () {});
  }
}

function webViewerSpreadModeChanged(evt) {
  const store = PDFViewerApplication.store;

  if (store && PDFViewerApplication.isInitialViewSet) {
    store.set("spreadMode", evt.mode).catch(function () {});
  }
}

function webViewerResize() {
  const {
    pdfDocument,
    pdfViewer
  } = PDFViewerApplication;

  if (!pdfDocument) {
    return;
  }

  const currentScaleValue = pdfViewer.currentScaleValue;

  if (currentScaleValue === "auto" || currentScaleValue === "page-fit" || currentScaleValue === "page-width") {
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

let webViewerFileInputChange, webViewerOpenFile;
{
  webViewerFileInputChange = function (evt) {
    if (PDFViewerApplication.pdfViewer && PDFViewerApplication.pdfViewer.isInPresentationMode) {
      return;
    }

    const file = evt.fileInput.files[0];

    if (URL.createObjectURL && !_app_options.AppOptions.get("disableCreateObjectURL")) {
      let url = URL.createObjectURL(file);

      if (file.name) {
        url = {
          url,
          originalUrl: file.name
        };
      }

      PDFViewerApplication.open(url);
    } else {
      PDFViewerApplication.setTitleUsingUrl(file.name);
      const fileReader = new FileReader();

      fileReader.onload = function webViewerChangeFileReaderOnload(event) {
        const buffer = event.target.result;
        PDFViewerApplication.open(new Uint8Array(buffer));
      };

      fileReader.readAsArrayBuffer(file);
    }

    const appConfig = PDFViewerApplication.appConfig;
    appConfig.toolbar.viewBookmark.setAttribute("hidden", "true");
    appConfig.secondaryToolbar.viewBookmarkButton.setAttribute("hidden", "true");
    appConfig.toolbar.download.setAttribute("hidden", "true");
    appConfig.secondaryToolbar.downloadButton.setAttribute("hidden", "true");
  };

  webViewerOpenFile = function (evt) {
    const openFileInputName = PDFViewerApplication.appConfig.openFileInputName;
    document.getElementById(openFileInputName).click();
  };
}

function webViewerPresentationMode() {
  PDFViewerApplication.requestPresentationMode();
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

  if (evt.value !== "") {
    pdfViewer.currentPageLabel = evt.value;
  }

  if (evt.value !== pdfViewer.currentPageNumber.toString() && evt.value !== pdfViewer.currentPageLabel) {
    PDFViewerApplication.toolbar.setPageNumber(pdfViewer.currentPageNumber, pdfViewer.currentPageLabel);
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
    findPrevious: evt.findPrevious
  });
}

function webViewerFindFromUrlHash(evt) {
  PDFViewerApplication.findController.executeCommand("find", {
    query: evt.query,
    phraseSearch: evt.phraseSearch,
    caseSensitive: false,
    entireWord: false,
    highlightAll: true,
    findPrevious: false
  });
}

function webViewerUpdateFindMatchesCount({
  matchesCount
}) {
  if (PDFViewerApplication.supportsIntegratedFind) {
    PDFViewerApplication.externalServices.updateFindMatchesCount(matchesCount);
  } else {
    PDFViewerApplication.findBar.updateResultsCount(matchesCount);
  }
}

function webViewerUpdateFindControlState({
  state,
  previous,
  matchesCount
}) {
  if (PDFViewerApplication.supportsIntegratedFind) {
    PDFViewerApplication.externalServices.updateFindControlState({
      result: state,
      findPrevious: previous,
      matchesCount
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
  PDFViewerApplication.pdfViewer.currentPageNumber = evt.pageNumber;
}

function webViewerPageChanging(evt) {
  const page = evt.pageNumber;
  PDFViewerApplication.toolbar.setPageNumber(page, evt.pageLabel || null);
  PDFViewerApplication.secondaryToolbar.setPageNumber(page);

  if (PDFViewerApplication.pdfSidebar.isThumbnailViewVisible) {
    PDFViewerApplication.pdfThumbnailViewer.scrollThumbnailIntoView(page);
  }

  if (typeof Stats !== "undefined" && Stats.enabled) {
    const pageView = PDFViewerApplication.pdfViewer.getPageView(page - 1);

    if (pageView && pageView.stats) {
      Stats.add(page, pageView.stats);
    }
  }
}

function webViewerVisibilityChange(evt) {
  if (document.visibilityState === "visible") {
    setZoomDisabledTimeout();
  }
}

let zoomDisabledTimeout = null;

function setZoomDisabledTimeout() {
  if (zoomDisabledTimeout) {
    clearTimeout(zoomDisabledTimeout);
  }

  zoomDisabledTimeout = setTimeout(function () {
    zoomDisabledTimeout = null;
  }, WHEEL_ZOOM_DISABLED_TIMEOUT);
}

function webViewerWheel(evt) {
  const {
    pdfViewer,
    supportedMouseWheelZoomModifierKeys
  } = PDFViewerApplication;

  if (pdfViewer.isInPresentationMode) {
    return;
  }

  if (evt.ctrlKey && supportedMouseWheelZoomModifierKeys.ctrlKey || evt.metaKey && supportedMouseWheelZoomModifierKeys.metaKey) {
    evt.preventDefault();

    if (zoomDisabledTimeout || document.visibilityState === "hidden") {
      return;
    }

    const previousScale = pdfViewer.currentScale;
    const delta = (0, _ui_utils.normalizeWheelEventDelta)(evt);
    const MOUSE_WHEEL_DELTA_PER_PAGE_SCALE = 3.0;
    const ticks = delta * MOUSE_WHEEL_DELTA_PER_PAGE_SCALE;

    if (ticks < 0) {
      PDFViewerApplication.zoomOut(-ticks);
    } else {
      PDFViewerApplication.zoomIn(ticks);
    }

    const currentScale = pdfViewer.currentScale;

    if (previousScale !== currentScale) {
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

  if (PDFViewerApplication.pdfViewer.containsElement(evt.target) || appConfig.toolbar.container.contains(evt.target) && evt.target !== appConfig.secondaryToolbar.toggleButton) {
    PDFViewerApplication.secondaryToolbar.close();
  }
}

function webViewerKeyDown(evt) {
  if (PDFViewerApplication.overlayManager.active) {
    return;
  }

  let handled = false,
      ensureViewerFocused = false;
  const cmd = (evt.ctrlKey ? 1 : 0) | (evt.altKey ? 2 : 0) | (evt.shiftKey ? 4 : 0) | (evt.metaKey ? 8 : 0);
  const pdfViewer = PDFViewerApplication.pdfViewer;
  const isViewerInPresentationMode = pdfViewer && pdfViewer.isInPresentationMode;

  if (cmd === 1 || cmd === 8 || cmd === 5 || cmd === 12) {
    switch (evt.keyCode) {
      case 70:
        if (!PDFViewerApplication.supportsIntegratedFind) {
          PDFViewerApplication.findBar.open();
          handled = true;
        }

        break;

      case 71:
        if (!PDFViewerApplication.supportsIntegratedFind) {
          const findState = PDFViewerApplication.findController.state;

          if (findState) {
            PDFViewerApplication.findController.executeCommand("findagain", {
              query: findState.query,
              phraseSearch: findState.phraseSearch,
              caseSensitive: findState.caseSensitive,
              entireWord: findState.entireWord,
              highlightAll: findState.highlightAll,
              findPrevious: cmd === 5 || cmd === 12
            });
          }

          handled = true;
        }

        break;

      case 61:
      case 107:
      case 187:
      case 171:
        if (!isViewerInPresentationMode) {
          PDFViewerApplication.zoomIn();
        }

        handled = true;
        break;

      case 173:
      case 109:
      case 189:
        if (!isViewerInPresentationMode) {
          PDFViewerApplication.zoomOut();
        }

        handled = true;
        break;

      case 48:
      case 96:
        if (!isViewerInPresentationMode) {
          setTimeout(function () {
            PDFViewerApplication.zoomReset();
          });
          handled = false;
        }

        break;

      case 38:
        if (isViewerInPresentationMode || PDFViewerApplication.page > 1) {
          PDFViewerApplication.page = 1;
          handled = true;
          ensureViewerFocused = true;
        }

        break;

      case 40:
        if (isViewerInPresentationMode || PDFViewerApplication.page < PDFViewerApplication.pagesCount) {
          PDFViewerApplication.page = PDFViewerApplication.pagesCount;
          handled = true;
          ensureViewerFocused = true;
        }

        break;
    }
  }

  if (cmd === 1 || cmd === 8) {
    switch (evt.keyCode) {
      case 83:
        PDFViewerApplication.download();
        handled = true;
        break;
    }
  }

  if (cmd === 3 || cmd === 10) {
    switch (evt.keyCode) {
      case 80:
        PDFViewerApplication.requestPresentationMode();
        handled = true;
        break;

      case 71:
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

  const curElement = document.activeElement || document.querySelector(":focus");
  const curElementTagName = curElement && curElement.tagName.toUpperCase();

  if (curElementTagName === "INPUT" || curElementTagName === "TEXTAREA" || curElementTagName === "SELECT" || curElement && curElement.isContentEditable) {
    if (evt.keyCode !== 27) {
      return;
    }
  }

  if (cmd === 0) {
    let turnPage = 0,
        turnOnlyIfPageFit = false;

    switch (evt.keyCode) {
      case 38:
      case 33:
        if (pdfViewer.isVerticalScrollbarEnabled) {
          turnOnlyIfPageFit = true;
        }

        turnPage = -1;
        break;

      case 8:
        if (!isViewerInPresentationMode) {
          turnOnlyIfPageFit = true;
        }

        turnPage = -1;
        break;

      case 37:
        if (pdfViewer.isHorizontalScrollbarEnabled) {
          turnOnlyIfPageFit = true;
        }

      case 75:
      case 80:
        turnPage = -1;
        break;

      case 27:
        if (PDFViewerApplication.secondaryToolbar.isOpen) {
          PDFViewerApplication.secondaryToolbar.close();
          handled = true;
        }

        if (!PDFViewerApplication.supportsIntegratedFind && PDFViewerApplication.findBar.opened) {
          PDFViewerApplication.findBar.close();
          handled = true;
        }

        break;

      case 40:
      case 34:
        if (pdfViewer.isVerticalScrollbarEnabled) {
          turnOnlyIfPageFit = true;
        }

        turnPage = 1;
        break;

      case 13:
      case 32:
        if (!isViewerInPresentationMode) {
          turnOnlyIfPageFit = true;
        }

        turnPage = 1;
        break;

      case 39:
        if (pdfViewer.isHorizontalScrollbarEnabled) {
          turnOnlyIfPageFit = true;
        }

      case 74:
      case 78:
        turnPage = 1;
        break;

      case 36:
        if (isViewerInPresentationMode || PDFViewerApplication.page > 1) {
          PDFViewerApplication.page = 1;
          handled = true;
          ensureViewerFocused = true;
        }

        break;

      case 35:
        if (isViewerInPresentationMode || PDFViewerApplication.page < PDFViewerApplication.pagesCount) {
          PDFViewerApplication.page = PDFViewerApplication.pagesCount;
          handled = true;
          ensureViewerFocused = true;
        }

        break;

      case 83:
        PDFViewerApplication.pdfCursorTools.switchTool(_pdf_cursor_tools.CursorTool.SELECT);
        break;

      case 72:
        PDFViewerApplication.pdfCursorTools.switchTool(_pdf_cursor_tools.CursorTool.HAND);
        break;

      case 82:
        PDFViewerApplication.rotatePages(90);
        break;

      case 115:
        PDFViewerApplication.pdfSidebar.toggle();
        break;
    }

    if (turnPage !== 0 && (!turnOnlyIfPageFit || pdfViewer.currentScaleValue === "page-fit")) {
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

  if (cmd === 4) {
    switch (evt.keyCode) {
      case 13:
      case 32:
        if (!isViewerInPresentationMode && pdfViewer.currentScaleValue !== "page-fit") {
          break;
        }

        if (PDFViewerApplication.page > 1) {
          PDFViewerApplication.page--;
        }

        handled = true;
        break;

      case 82:
        PDFViewerApplication.rotatePages(-90);
        break;
    }
  }

  if (!handled && !isViewerInPresentationMode) {
    if (evt.keyCode >= 33 && evt.keyCode <= 40 || evt.keyCode === 32 && curElementTagName !== "BUTTON") {
      ensureViewerFocused = true;
    }
  }

  if (ensureViewerFocused && !pdfViewer.containsElement(curElement)) {
    pdfViewer.focus();
  }

  if (handled) {
    evt.preventDefault();
  }
}

function apiPageLayoutToSpreadMode(layout) {
  switch (layout) {
    case "SinglePage":
    case "OneColumn":
      return _ui_utils.SpreadMode.NONE;

    case "TwoColumnLeft":
    case "TwoPageLeft":
      return _ui_utils.SpreadMode.ODD;

    case "TwoColumnRight":
    case "TwoPageRight":
      return _ui_utils.SpreadMode.EVEN;
  }

  return _ui_utils.SpreadMode.NONE;
}

function apiPageModeToSidebarView(mode) {
  switch (mode) {
    case "UseNone":
      return _pdf_sidebar.SidebarView.NONE;

    case "UseThumbs":
      return _pdf_sidebar.SidebarView.THUMBS;

    case "UseOutlines":
      return _pdf_sidebar.SidebarView.OUTLINE;

    case "UseAttachments":
      return _pdf_sidebar.SidebarView.ATTACHMENTS;

    case "UseOC":
  }

  return _pdf_sidebar.SidebarView.NONE;
}

const PDFPrintServiceFactory = {
  instance: {
    supportsPrinting: false,

    createPrintService() {
      throw new Error("Not implemented: createPrintService");
    }

  }
};
exports.PDFPrintServiceFactory = PDFPrintServiceFactory;

/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isValidRotation = isValidRotation;
exports.isValidScrollMode = isValidScrollMode;
exports.isValidSpreadMode = isValidSpreadMode;
exports.isPortraitOrientation = isPortraitOrientation;
exports.getGlobalEventBus = getGlobalEventBus;
exports.clamp = clamp;
exports.getPDFFileNameFromURL = getPDFFileNameFromURL;
exports.noContextMenuHandler = noContextMenuHandler;
exports.parseQueryString = parseQueryString;
exports.backtrackBeforeAllVisibleElements = backtrackBeforeAllVisibleElements;
exports.getVisibleElements = getVisibleElements;
exports.roundToDivide = roundToDivide;
exports.getPageSizeInches = getPageSizeInches;
exports.approximateFraction = approximateFraction;
exports.getOutputScale = getOutputScale;
exports.scrollIntoView = scrollIntoView;
exports.watchScroll = watchScroll;
exports.binarySearchFirstItem = binarySearchFirstItem;
exports.normalizeWheelEventDelta = normalizeWheelEventDelta;
exports.waitOnEventOrTimeout = waitOnEventOrTimeout;
exports.moveToEndOfArray = moveToEndOfArray;
exports.WaitOnType = exports.animationStarted = exports.ProgressBar = exports.EventBus = exports.NullL10n = exports.SpreadMode = exports.ScrollMode = exports.TextLayerMode = exports.RendererType = exports.PresentationModeState = exports.VERTICAL_PADDING = exports.SCROLLBAR_PADDING = exports.MAX_AUTO_SCALE = exports.UNKNOWN_SCALE = exports.MAX_SCALE = exports.MIN_SCALE = exports.DEFAULT_SCALE = exports.DEFAULT_SCALE_VALUE = exports.CSS_UNITS = exports.AutoPrintRegExp = void 0;
const CSS_UNITS = 96.0 / 72.0;
exports.CSS_UNITS = CSS_UNITS;
const DEFAULT_SCALE_VALUE = "auto";
exports.DEFAULT_SCALE_VALUE = DEFAULT_SCALE_VALUE;
const DEFAULT_SCALE = 1.0;
exports.DEFAULT_SCALE = DEFAULT_SCALE;
const MIN_SCALE = 0.1;
exports.MIN_SCALE = MIN_SCALE;
const MAX_SCALE = 10.0;
exports.MAX_SCALE = MAX_SCALE;
const UNKNOWN_SCALE = 0;
exports.UNKNOWN_SCALE = UNKNOWN_SCALE;
const MAX_AUTO_SCALE = 1.25;
exports.MAX_AUTO_SCALE = MAX_AUTO_SCALE;
const SCROLLBAR_PADDING = 40;
exports.SCROLLBAR_PADDING = SCROLLBAR_PADDING;
const VERTICAL_PADDING = 5;
exports.VERTICAL_PADDING = VERTICAL_PADDING;
const PresentationModeState = {
  UNKNOWN: 0,
  NORMAL: 1,
  CHANGING: 2,
  FULLSCREEN: 3
};
exports.PresentationModeState = PresentationModeState;
const RendererType = {
  CANVAS: "canvas",
  SVG: "svg"
};
exports.RendererType = RendererType;
const TextLayerMode = {
  DISABLE: 0,
  ENABLE: 1,
  ENABLE_ENHANCE: 2
};
exports.TextLayerMode = TextLayerMode;
const ScrollMode = {
  UNKNOWN: -1,
  VERTICAL: 0,
  HORIZONTAL: 1,
  WRAPPED: 2
};
exports.ScrollMode = ScrollMode;
const SpreadMode = {
  UNKNOWN: -1,
  NONE: 0,
  ODD: 1,
  EVEN: 2
};
exports.SpreadMode = SpreadMode;
const AutoPrintRegExp = /\bprint\s*\(/;
exports.AutoPrintRegExp = AutoPrintRegExp;

function formatL10nValue(text, args) {
  if (!args) {
    return text;
  }

  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, name) => {
    return name in args ? args[name] : "{{" + name + "}}";
  });
}

const NullL10n = {
  async getLanguage() {
    return "en-us";
  },

  async getDirection() {
    return "ltr";
  },

  async get(property, args, fallback) {
    return formatL10nValue(fallback, args);
  },

  async translate(element) {}

};
exports.NullL10n = NullL10n;

function getOutputScale(ctx) {
  const devicePixelRatio = window.devicePixelRatio || 1;
  const backingStoreRatio = ctx.webkitBackingStorePixelRatio || ctx.mozBackingStorePixelRatio || ctx.msBackingStorePixelRatio || ctx.oBackingStorePixelRatio || ctx.backingStorePixelRatio || 1;
  const pixelRatio = devicePixelRatio / backingStoreRatio;
  return {
    sx: pixelRatio,
    sy: pixelRatio,
    scaled: pixelRatio !== 1
  };
}

function scrollIntoView(element, spot, skipOverflowHiddenElements = false) {
  let parent = element.offsetParent;

  if (!parent) {
    console.error("offsetParent is not set -- cannot scroll");
    return;
  }

  let offsetY = element.offsetTop + element.clientTop;
  let offsetX = element.offsetLeft + element.clientLeft;

  while (parent.clientHeight === parent.scrollHeight && parent.clientWidth === parent.scrollWidth || skipOverflowHiddenElements && getComputedStyle(parent).overflow === "hidden") {
    if (parent.dataset._scaleY) {
      offsetY /= parent.dataset._scaleY;
      offsetX /= parent.dataset._scaleX;
    }

    offsetY += parent.offsetTop;
    offsetX += parent.offsetLeft;
    parent = parent.offsetParent;

    if (!parent) {
      return;
    }
  }

  if (spot) {
    if (spot.top !== undefined) {
      offsetY += spot.top;
    }

    if (spot.left !== undefined) {
      offsetX += spot.left;
      parent.scrollLeft = offsetX;
    }
  }

  parent.scrollTop = offsetY;
}

function watchScroll(viewAreaElement, callback) {
  const debounceScroll = function (evt) {
    if (rAF) {
      return;
    }

    rAF = window.requestAnimationFrame(function viewAreaElementScrolled() {
      rAF = null;
      const currentX = viewAreaElement.scrollLeft;
      const lastX = state.lastX;

      if (currentX !== lastX) {
        state.right = currentX > lastX;
      }

      state.lastX = currentX;
      const currentY = viewAreaElement.scrollTop;
      const lastY = state.lastY;

      if (currentY !== lastY) {
        state.down = currentY > lastY;
      }

      state.lastY = currentY;
      callback(state);
    });
  };

  const state = {
    right: true,
    down: true,
    lastX: viewAreaElement.scrollLeft,
    lastY: viewAreaElement.scrollTop,
    _eventHandler: debounceScroll
  };
  let rAF = null;
  viewAreaElement.addEventListener("scroll", debounceScroll, true);
  return state;
}

function parseQueryString(query) {
  const parts = query.split("&");
  const params = Object.create(null);

  for (let i = 0, ii = parts.length; i < ii; ++i) {
    const param = parts[i].split("=");
    const key = param[0].toLowerCase();
    const value = param.length > 1 ? param[1] : null;
    params[decodeURIComponent(key)] = decodeURIComponent(value);
  }

  return params;
}

function binarySearchFirstItem(items, condition) {
  let minIndex = 0;
  let maxIndex = items.length - 1;

  if (items.length === 0 || !condition(items[maxIndex])) {
    return items.length;
  }

  if (condition(items[minIndex])) {
    return minIndex;
  }

  while (minIndex < maxIndex) {
    const currentIndex = minIndex + maxIndex >> 1;
    const currentItem = items[currentIndex];

    if (condition(currentItem)) {
      maxIndex = currentIndex;
    } else {
      minIndex = currentIndex + 1;
    }
  }

  return minIndex;
}

function approximateFraction(x) {
  if (Math.floor(x) === x) {
    return [x, 1];
  }

  const xinv = 1 / x;
  const limit = 8;

  if (xinv > limit) {
    return [1, limit];
  } else if (Math.floor(xinv) === xinv) {
    return [1, xinv];
  }

  const x_ = x > 1 ? xinv : x;
  let a = 0,
      b = 1,
      c = 1,
      d = 1;

  while (true) {
    const p = a + c,
          q = b + d;

    if (q > limit) {
      break;
    }

    if (x_ <= p / q) {
      c = p;
      d = q;
    } else {
      a = p;
      b = q;
    }
  }

  let result;

  if (x_ - a / b < c / d - x_) {
    result = x_ === x ? [a, b] : [b, a];
  } else {
    result = x_ === x ? [c, d] : [d, c];
  }

  return result;
}

function roundToDivide(x, div) {
  const r = x % div;
  return r === 0 ? x : Math.round(x - r + div);
}

function getPageSizeInches({
  view,
  userUnit,
  rotate
}) {
  const [x1, y1, x2, y2] = view;
  const changeOrientation = rotate % 180 !== 0;
  const width = (x2 - x1) / 72 * userUnit;
  const height = (y2 - y1) / 72 * userUnit;
  return {
    width: changeOrientation ? height : width,
    height: changeOrientation ? width : height
  };
}

function backtrackBeforeAllVisibleElements(index, views, top) {
  if (index < 2) {
    return index;
  }

  let elt = views[index].div;
  let pageTop = elt.offsetTop + elt.clientTop;

  if (pageTop >= top) {
    elt = views[index - 1].div;
    pageTop = elt.offsetTop + elt.clientTop;
  }

  for (let i = index - 2; i >= 0; --i) {
    elt = views[i].div;

    if (elt.offsetTop + elt.clientTop + elt.clientHeight <= pageTop) {
      break;
    }

    index = i;
  }

  return index;
}

function getVisibleElements(scrollEl, views, sortByVisibility = false, horizontal = false) {
  const top = scrollEl.scrollTop,
        bottom = top + scrollEl.clientHeight;
  const left = scrollEl.scrollLeft,
        right = left + scrollEl.clientWidth;

  function isElementBottomAfterViewTop(view) {
    const element = view.div;
    const elementBottom = element.offsetTop + element.clientTop + element.clientHeight;
    return elementBottom > top;
  }

  function isElementRightAfterViewLeft(view) {
    const element = view.div;
    const elementRight = element.offsetLeft + element.clientLeft + element.clientWidth;
    return elementRight > left;
  }

  const visible = [],
        numViews = views.length;
  let firstVisibleElementInd = numViews === 0 ? 0 : binarySearchFirstItem(views, horizontal ? isElementRightAfterViewLeft : isElementBottomAfterViewTop);

  if (firstVisibleElementInd > 0 && firstVisibleElementInd < numViews && !horizontal) {
    firstVisibleElementInd = backtrackBeforeAllVisibleElements(firstVisibleElementInd, views, top);
  }

  let lastEdge = horizontal ? right : -1;

  for (let i = firstVisibleElementInd; i < numViews; i++) {
    const view = views[i],
          element = view.div;
    const currentWidth = element.offsetLeft + element.clientLeft;
    const currentHeight = element.offsetTop + element.clientTop;
    const viewWidth = element.clientWidth,
          viewHeight = element.clientHeight;
    const viewRight = currentWidth + viewWidth;
    const viewBottom = currentHeight + viewHeight;

    if (lastEdge === -1) {
      if (viewBottom >= bottom) {
        lastEdge = viewBottom;
      }
    } else if ((horizontal ? currentWidth : currentHeight) > lastEdge) {
      break;
    }

    if (viewBottom <= top || currentHeight >= bottom || viewRight <= left || currentWidth >= right) {
      continue;
    }

    const hiddenHeight = Math.max(0, top - currentHeight) + Math.max(0, viewBottom - bottom);
    const hiddenWidth = Math.max(0, left - currentWidth) + Math.max(0, viewRight - right);
    const percent = (viewHeight - hiddenHeight) * (viewWidth - hiddenWidth) * 100 / viewHeight / viewWidth | 0;
    visible.push({
      id: view.id,
      x: currentWidth,
      y: currentHeight,
      view,
      percent
    });
  }

  const first = visible[0],
        last = visible[visible.length - 1];

  if (sortByVisibility) {
    visible.sort(function (a, b) {
      const pc = a.percent - b.percent;

      if (Math.abs(pc) > 0.001) {
        return -pc;
      }

      return a.id - b.id;
    });
  }

  return {
    first,
    last,
    views: visible
  };
}

function noContextMenuHandler(evt) {
  evt.preventDefault();
}

function isDataSchema(url) {
  let i = 0;
  const ii = url.length;

  while (i < ii && url[i].trim() === "") {
    i++;
  }

  return url.substring(i, i + 5).toLowerCase() === "data:";
}

function getPDFFileNameFromURL(url, defaultFilename = "document.pdf") {
  if (typeof url !== "string") {
    return defaultFilename;
  }

  if (isDataSchema(url)) {
    console.warn("getPDFFileNameFromURL: " + 'ignoring "data:" URL for performance reasons.');
    return defaultFilename;
  }

  const reURI = /^(?:(?:[^:]+:)?\/\/[^\/]+)?([^?#]*)(\?[^#]*)?(#.*)?$/;
  const reFilename = /[^\/?#=]+\.pdf\b(?!.*\.pdf\b)/i;
  const splitURI = reURI.exec(url);
  let suggestedFilename = reFilename.exec(splitURI[1]) || reFilename.exec(splitURI[2]) || reFilename.exec(splitURI[3]);

  if (suggestedFilename) {
    suggestedFilename = suggestedFilename[0];

    if (suggestedFilename.includes("%")) {
      try {
        suggestedFilename = reFilename.exec(decodeURIComponent(suggestedFilename))[0];
      } catch (ex) {}
    }
  }

  return suggestedFilename || defaultFilename;
}

function normalizeWheelEventDelta(evt) {
  let delta = Math.sqrt(evt.deltaX * evt.deltaX + evt.deltaY * evt.deltaY);
  const angle = Math.atan2(evt.deltaY, evt.deltaX);

  if (-0.25 * Math.PI < angle && angle < 0.75 * Math.PI) {
    delta = -delta;
  }

  const MOUSE_DOM_DELTA_PIXEL_MODE = 0;
  const MOUSE_DOM_DELTA_LINE_MODE = 1;
  const MOUSE_PIXELS_PER_LINE = 30;
  const MOUSE_LINES_PER_PAGE = 30;

  if (evt.deltaMode === MOUSE_DOM_DELTA_PIXEL_MODE) {
    delta /= MOUSE_PIXELS_PER_LINE * MOUSE_LINES_PER_PAGE;
  } else if (evt.deltaMode === MOUSE_DOM_DELTA_LINE_MODE) {
    delta /= MOUSE_LINES_PER_PAGE;
  }

  return delta;
}

function isValidRotation(angle) {
  return Number.isInteger(angle) && angle % 90 === 0;
}

function isValidScrollMode(mode) {
  return Number.isInteger(mode) && Object.values(ScrollMode).includes(mode) && mode !== ScrollMode.UNKNOWN;
}

function isValidSpreadMode(mode) {
  return Number.isInteger(mode) && Object.values(SpreadMode).includes(mode) && mode !== SpreadMode.UNKNOWN;
}

function isPortraitOrientation(size) {
  return size.width <= size.height;
}

const WaitOnType = {
  EVENT: "event",
  TIMEOUT: "timeout"
};
exports.WaitOnType = WaitOnType;

function waitOnEventOrTimeout({
  target,
  name,
  delay = 0
}) {
  return new Promise(function (resolve, reject) {
    if (typeof target !== "object" || !(name && typeof name === "string") || !(Number.isInteger(delay) && delay >= 0)) {
      throw new Error("waitOnEventOrTimeout - invalid parameters.");
    }

    function handler(type) {
      if (target instanceof EventBus) {
        target._off(name, eventHandler);
      } else {
        target.removeEventListener(name, eventHandler);
      }

      if (timeout) {
        clearTimeout(timeout);
      }

      resolve(type);
    }

    const eventHandler = handler.bind(null, WaitOnType.EVENT);

    if (target instanceof EventBus) {
      target._on(name, eventHandler);
    } else {
      target.addEventListener(name, eventHandler);
    }

    const timeoutHandler = handler.bind(null, WaitOnType.TIMEOUT);
    const timeout = setTimeout(timeoutHandler, delay);
  });
}

const animationStarted = new Promise(function (resolve) {
  window.requestAnimationFrame(resolve);
});
exports.animationStarted = animationStarted;

function dispatchDOMEvent(eventName, args = null) {
  const details = Object.create(null);

  if (args && args.length > 0) {
    const obj = args[0];

    for (const key in obj) {
      const value = obj[key];

      if (key === "source") {
        if (value === window || value === document) {
          return;
        }

        continue;
      }

      details[key] = value;
    }
  }

  const event = document.createEvent("CustomEvent");
  event.initCustomEvent(eventName, true, true, details);
  document.dispatchEvent(event);
}

class EventBus {
  constructor({
    dispatchToDOM = false
  } = {}) {
    this._listeners = Object.create(null);
    this._dispatchToDOM = dispatchToDOM === true;

    if (dispatchToDOM) {
      console.error("The `eventBusDispatchToDOM` option/preference is deprecated, " + "add event listeners to the EventBus instance rather than the DOM.");
    }
  }

  on(eventName, listener) {
    this._on(eventName, listener, {
      external: true
    });
  }

  off(eventName, listener) {
    this._off(eventName, listener, {
      external: true
    });
  }

  dispatch(eventName) {
    const eventListeners = this._listeners[eventName];

    if (!eventListeners || eventListeners.length === 0) {
      if (this._dispatchToDOM) {
        const args = Array.prototype.slice.call(arguments, 1);
        dispatchDOMEvent(eventName, args);
      }

      return;
    }

    const args = Array.prototype.slice.call(arguments, 1);
    let externalListeners;
    eventListeners.slice(0).forEach(function ({
      listener,
      external
    }) {
      if (external) {
        if (!externalListeners) {
          externalListeners = [];
        }

        externalListeners.push(listener);
        return;
      }

      listener.apply(null, args);
    });

    if (externalListeners) {
      externalListeners.forEach(function (listener) {
        listener.apply(null, args);
      });
      externalListeners = null;
    }

    if (this._dispatchToDOM) {
      dispatchDOMEvent(eventName, args);
    }
  }

  _on(eventName, listener, options = null) {
    let eventListeners = this._listeners[eventName];

    if (!eventListeners) {
      this._listeners[eventName] = eventListeners = [];
    }

    eventListeners.push({
      listener,
      external: (options && options.external) === true
    });
  }

  _off(eventName, listener, options = null) {
    const eventListeners = this._listeners[eventName];

    if (!eventListeners) {
      return;
    }

    for (let i = 0, ii = eventListeners.length; i < ii; i++) {
      if (eventListeners[i].listener === listener) {
        eventListeners.splice(i, 1);
        return;
      }
    }
  }

}

exports.EventBus = EventBus;
let globalEventBus = null;

function getGlobalEventBus(dispatchToDOM = false) {
  console.error("getGlobalEventBus is deprecated, use a manually created EventBus instance instead.");

  if (!globalEventBus) {
    globalEventBus = new EventBus({
      dispatchToDOM
    });
  }

  return globalEventBus;
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

class ProgressBar {
  constructor(id, {
    height,
    width,
    units
  } = {}) {
    this.visible = true;
    this.div = document.querySelector(id + " .progress");
    this.bar = this.div.parentNode;
    this.height = height || 100;
    this.width = width || 100;
    this.units = units || "%";
    this.div.style.height = this.height + this.units;
    this.percent = 0;
  }

  _updateBar() {
    if (this._indeterminate) {
      this.div.classList.add("indeterminate");
      this.div.style.width = this.width + this.units;
      return;
    }

    this.div.classList.remove("indeterminate");
    const progressSize = this.width * this._percent / 100;
    this.div.style.width = progressSize + this.units;
  }

  get percent() {
    return this._percent;
  }

  set percent(val) {
    this._indeterminate = isNaN(val);
    this._percent = clamp(val, 0, 100);

    this._updateBar();
  }

  setWidth(viewer) {
    if (!viewer) {
      return;
    }

    const container = viewer.parentNode;
    const scrollbarWidth = container.offsetWidth - viewer.offsetWidth;

    if (scrollbarWidth > 0) {
      this.bar.style.width = `calc(100% - ${scrollbarWidth}px)`;
    }
  }

  hide() {
    if (!this.visible) {
      return;
    }

    this.visible = false;
    this.bar.classList.add("hidden");
    document.body.classList.remove("loadingInProgress");
  }

  show() {
    if (this.visible) {
      return;
    }

    this.visible = true;
    document.body.classList.add("loadingInProgress");
    this.bar.classList.remove("hidden");
  }

}

exports.ProgressBar = ProgressBar;

function moveToEndOfArray(arr, condition) {
  const moved = [],
        len = arr.length;
  let write = 0;

  for (let read = 0; read < len; ++read) {
    if (condition(arr[read])) {
      moved.push(arr[read]);
    } else {
      arr[write] = arr[read];
      ++write;
    }
  }

  for (let read = 0; write < len; ++read, ++write) {
    arr[write] = moved[read];
  }
}

/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.OptionKind = exports.AppOptions = void 0;

var _pdfjsLib = __webpack_require__(4);

var _viewer_compatibility = __webpack_require__(5);

const OptionKind = {
  VIEWER: 0x02,
  API: 0x04,
  WORKER: 0x08,
  PREFERENCE: 0x80
};
exports.OptionKind = OptionKind;
const defaultOptions = {
  cursorToolOnLoad: {
    value: 0,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  defaultUrl: {
    value: "compressed.tracemonkey-pldi-09.pdf",
    kind: OptionKind.VIEWER
  },
  defaultZoomValue: {
    value: "",
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  disableHistory: {
    value: false,
    kind: OptionKind.VIEWER
  },
  disablePageLabels: {
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  enablePrintAutoRotate: {
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  enableWebGL: {
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  eventBusDispatchToDOM: {
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  externalLinkRel: {
    value: "noopener noreferrer nofollow",
    kind: OptionKind.VIEWER
  },
  externalLinkTarget: {
    value: 0,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  historyUpdateUrl: {
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  ignoreDestinationZoom: {
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  imageResourcesPath: {
    value: "./images/",
    kind: OptionKind.VIEWER
  },
  maxCanvasPixels: {
    value: 16777216,
    compatibility: _viewer_compatibility.viewerCompatibilityParams.maxCanvasPixels,
    kind: OptionKind.VIEWER
  },
  pdfBugEnabled: {
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  renderer: {
    value: "canvas",
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  renderInteractiveForms: {
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  sidebarViewOnLoad: {
    value: -1,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  scrollModeOnLoad: {
    value: -1,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  spreadModeOnLoad: {
    value: -1,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  textLayerMode: {
    value: 1,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  useOnlyCssZoom: {
    value: false,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  viewOnLoad: {
    value: 0,
    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
  },
  cMapPacked: {
    value: true,
    kind: OptionKind.API
  },
  cMapUrl: {
    value: "../web/cmaps/",
    kind: OptionKind.API
  },
  disableAutoFetch: {
    value: false,
    kind: OptionKind.API + OptionKind.PREFERENCE
  },
  disableCreateObjectURL: {
    value: false,
    compatibility: _pdfjsLib.apiCompatibilityParams.disableCreateObjectURL,
    kind: OptionKind.API
  },
  disableFontFace: {
    value: false,
    kind: OptionKind.API + OptionKind.PREFERENCE
  },
  disableRange: {
    value: false,
    kind: OptionKind.API + OptionKind.PREFERENCE
  },
  disableStream: {
    value: false,
    kind: OptionKind.API + OptionKind.PREFERENCE
  },
  docBaseUrl: {
    value: "",
    kind: OptionKind.API
  },
  isEvalSupported: {
    value: true,
    kind: OptionKind.API
  },
  maxImageSize: {
    value: -1,
    kind: OptionKind.API
  },
  pdfBug: {
    value: false,
    kind: OptionKind.API
  },
  verbosity: {
    value: 1,
    kind: OptionKind.API
  },
  workerPort: {
    value: null,
    kind: OptionKind.WORKER
  },
  workerSrc: {
    value: "../build/pdf.worker.js",
    kind: OptionKind.WORKER
  }
};
{
  defaultOptions.disablePreferences = {
    value: false,
    kind: OptionKind.VIEWER
  };
  defaultOptions.locale = {
    value: typeof navigator !== "undefined" ? navigator.language : "en-US",
    kind: OptionKind.VIEWER
  };
  defaultOptions.printResolution = {
    value: 150,
    kind: OptionKind.VIEWER
  };
}
const userOptions = Object.create(null);

class AppOptions {
  constructor() {
    throw new Error("Cannot initialize AppOptions.");
  }

  static get(name) {
    const userOption = userOptions[name];

    if (userOption !== undefined) {
      return userOption;
    }

    const defaultOption = defaultOptions[name];

    if (defaultOption !== undefined) {
      return defaultOption.compatibility || defaultOption.value;
    }

    return undefined;
  }

  static getAll(kind = null) {
    const options = Object.create(null);

    for (const name in defaultOptions) {
      const defaultOption = defaultOptions[name];

      if (kind) {
        if ((kind & defaultOption.kind) === 0) {
          continue;
        }

        if (kind === OptionKind.PREFERENCE) {
          const value = defaultOption.value,
                valueType = typeof value;

          if (valueType === "boolean" || valueType === "string" || valueType === "number" && Number.isInteger(value)) {
            options[name] = value;
            continue;
          }

          throw new Error(`Invalid type for preference: ${name}`);
        }
      }

      const userOption = userOptions[name];
      options[name] = userOption !== undefined ? userOption : defaultOption.compatibility || defaultOption.value;
    }

    return options;
  }

  static set(name, value) {
    userOptions[name] = value;
  }

  static remove(name) {
    delete userOptions[name];
  }

}

exports.AppOptions = AppOptions;

/***/ }),
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


let pdfjsLib;

if (typeof window !== "undefined" && window["pdfjs-dist/build/pdf"]) {
  pdfjsLib = window["pdfjs-dist/build/pdf"];
} else {
  pdfjsLib = require("../build/pdf.js");
}

module.exports = pdfjsLib;

/***/ }),
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const compatibilityParams = Object.create(null);
{
  const userAgent = typeof navigator !== "undefined" && navigator.userAgent || "";
  const platform = typeof navigator !== "undefined" && navigator.platform || "";
  const maxTouchPoints = typeof navigator !== "undefined" && navigator.maxTouchPoints || 1;
  const isAndroid = /Android/.test(userAgent);
  const isIOS = /\b(iPad|iPhone|iPod)(?=;)/.test(userAgent) || platform === "MacIntel" && maxTouchPoints > 1;

  (function checkCanvasSizeLimitation() {
    if (isIOS || isAndroid) {
      compatibilityParams.maxCanvasPixels = 5242880;
    }
  })();
}
exports.viewerCompatibilityParams = Object.freeze(compatibilityParams);

/***/ }),
/* 6 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFCursorTools = exports.CursorTool = void 0;

var _grab_to_pan = __webpack_require__(7);

const CursorTool = {
  SELECT: 0,
  HAND: 1,
  ZOOM: 2
};
exports.CursorTool = CursorTool;

class PDFCursorTools {
  constructor({
    container,
    eventBus,
    cursorToolOnLoad = CursorTool.SELECT
  }) {
    this.container = container;
    this.eventBus = eventBus;
    this.active = CursorTool.SELECT;
    this.activeBeforePresentationMode = null;
    this.handTool = new _grab_to_pan.GrabToPan({
      element: this.container
    });

    this._addEventListeners();

    Promise.resolve().then(() => {
      this.switchTool(cursorToolOnLoad);
    });
  }

  get activeTool() {
    return this.active;
  }

  switchTool(tool) {
    if (this.activeBeforePresentationMode !== null) {
      return;
    }

    if (tool === this.active) {
      return;
    }

    const disableActiveTool = () => {
      switch (this.active) {
        case CursorTool.SELECT:
          break;

        case CursorTool.HAND:
          this.handTool.deactivate();
          break;

        case CursorTool.ZOOM:
      }
    };

    switch (tool) {
      case CursorTool.SELECT:
        disableActiveTool();
        break;

      case CursorTool.HAND:
        disableActiveTool();
        this.handTool.activate();
        break;

      case CursorTool.ZOOM:
      default:
        console.error(`switchTool: "${tool}" is an unsupported value.`);
        return;
    }

    this.active = tool;

    this._dispatchEvent();
  }

  _dispatchEvent() {
    this.eventBus.dispatch("cursortoolchanged", {
      source: this,
      tool: this.active
    });
  }

  _addEventListeners() {
    this.eventBus._on("switchcursortool", evt => {
      this.switchTool(evt.tool);
    });

    this.eventBus._on("presentationmodechanged", evt => {
      if (evt.switchInProgress) {
        return;
      }

      let previouslyActive;

      if (evt.active) {
        previouslyActive = this.active;
        this.switchTool(CursorTool.SELECT);
        this.activeBeforePresentationMode = previouslyActive;
      } else {
        previouslyActive = this.activeBeforePresentationMode;
        this.activeBeforePresentationMode = null;
        this.switchTool(previouslyActive);
      }
    });
  }

}

exports.PDFCursorTools = PDFCursorTools;

/***/ }),
/* 7 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GrabToPan = GrabToPan;

function GrabToPan(options) {
  this.element = options.element;
  this.document = options.element.ownerDocument;

  if (typeof options.ignoreTarget === "function") {
    this.ignoreTarget = options.ignoreTarget;
  }

  this.onActiveChanged = options.onActiveChanged;
  this.activate = this.activate.bind(this);
  this.deactivate = this.deactivate.bind(this);
  this.toggle = this.toggle.bind(this);
  this._onmousedown = this._onmousedown.bind(this);
  this._onmousemove = this._onmousemove.bind(this);
  this._endPan = this._endPan.bind(this);
  const overlay = this.overlay = document.createElement("div");
  overlay.className = "grab-to-pan-grabbing";
}

GrabToPan.prototype = {
  CSS_CLASS_GRAB: "grab-to-pan-grab",
  activate: function GrabToPan_activate() {
    if (!this.active) {
      this.active = true;
      this.element.addEventListener("mousedown", this._onmousedown, true);
      this.element.classList.add(this.CSS_CLASS_GRAB);

      if (this.onActiveChanged) {
        this.onActiveChanged(true);
      }
    }
  },
  deactivate: function GrabToPan_deactivate() {
    if (this.active) {
      this.active = false;
      this.element.removeEventListener("mousedown", this._onmousedown, true);

      this._endPan();

      this.element.classList.remove(this.CSS_CLASS_GRAB);

      if (this.onActiveChanged) {
        this.onActiveChanged(false);
      }
    }
  },
  toggle: function GrabToPan_toggle() {
    if (this.active) {
      this.deactivate();
    } else {
      this.activate();
    }
  },
  ignoreTarget: function GrabToPan_ignoreTarget(node) {
    return node[matchesSelector]("a[href], a[href] *, input, textarea, button, button *, select, option");
  },
  _onmousedown: function GrabToPan__onmousedown(event) {
    if (event.button !== 0 || this.ignoreTarget(event.target)) {
      return;
    }

    if (event.originalTarget) {
      try {
        event.originalTarget.tagName;
      } catch (e) {
        return;
      }
    }

    this.scrollLeftStart = this.element.scrollLeft;
    this.scrollTopStart = this.element.scrollTop;
    this.clientXStart = event.clientX;
    this.clientYStart = event.clientY;
    this.document.addEventListener("mousemove", this._onmousemove, true);
    this.document.addEventListener("mouseup", this._endPan, true);
    this.element.addEventListener("scroll", this._endPan, true);
    event.preventDefault();
    event.stopPropagation();
    const focusedElement = document.activeElement;

    if (focusedElement && !focusedElement.contains(event.target)) {
      focusedElement.blur();
    }
  },
  _onmousemove: function GrabToPan__onmousemove(event) {
    this.element.removeEventListener("scroll", this._endPan, true);

    if (isLeftMouseReleased(event)) {
      this._endPan();

      return;
    }

    const xDiff = event.clientX - this.clientXStart;
    const yDiff = event.clientY - this.clientYStart;
    const scrollTop = this.scrollTopStart - yDiff;
    const scrollLeft = this.scrollLeftStart - xDiff;

    if (this.element.scrollTo) {
      this.element.scrollTo({
        top: scrollTop,
        left: scrollLeft,
        behavior: "instant"
      });
    } else {
      this.element.scrollTop = scrollTop;
      this.element.scrollLeft = scrollLeft;
    }

    if (!this.overlay.parentNode) {
      document.body.appendChild(this.overlay);
    }
  },
  _endPan: function GrabToPan__endPan() {
    this.element.removeEventListener("scroll", this._endPan, true);
    this.document.removeEventListener("mousemove", this._onmousemove, true);
    this.document.removeEventListener("mouseup", this._endPan, true);
    this.overlay.remove();
  }
};
let matchesSelector;
["webkitM", "mozM", "msM", "oM", "m"].some(function (prefix) {
  let name = prefix + "atches";

  if (name in document.documentElement) {
    matchesSelector = name;
  }

  name += "Selector";

  if (name in document.documentElement) {
    matchesSelector = name;
  }

  return matchesSelector;
});
const isNotIEorIsIE10plus = !document.documentMode || document.documentMode > 9;
const chrome = window.chrome;
const isChrome15OrOpera15plus = chrome && (chrome.webstore || chrome.app);
const isSafari6plus = /Apple/.test(navigator.vendor) && /Version\/([6-9]\d*|[1-5]\d+)/.test(navigator.userAgent);

function isLeftMouseReleased(event) {
  if ("buttons" in event && isNotIEorIsIE10plus) {
    return !(event.buttons & 1);
  }

  if (isChrome15OrOpera15plus || isSafari6plus) {
    return event.which === 0;
  }

  return false;
}

/***/ }),
/* 8 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFRenderingQueue = exports.RenderingStates = void 0;
const CLEANUP_TIMEOUT = 30000;
const RenderingStates = {
  INITIAL: 0,
  RUNNING: 1,
  PAUSED: 2,
  FINISHED: 3
};
exports.RenderingStates = RenderingStates;

class PDFRenderingQueue {
  constructor() {
    this.pdfViewer = null;
    this.pdfThumbnailViewer = null;
    this.onIdle = null;
    this.highestPriorityPage = null;
    this.idleTimeout = null;
    this.printing = false;
    this.isThumbnailViewEnabled = false;
  }

  setViewer(pdfViewer) {
    this.pdfViewer = pdfViewer;
  }

  setThumbnailViewer(pdfThumbnailViewer) {
    this.pdfThumbnailViewer = pdfThumbnailViewer;
  }

  isHighestPriority(view) {
    return this.highestPriorityPage === view.renderingId;
  }

  renderHighestPriority(currentlyVisiblePages) {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }

    if (this.pdfViewer.forceRendering(currentlyVisiblePages)) {
      return;
    }

    if (this.pdfThumbnailViewer && this.isThumbnailViewEnabled) {
      if (this.pdfThumbnailViewer.forceRendering()) {
        return;
      }
    }

    if (this.printing) {
      return;
    }

    if (this.onIdle) {
      this.idleTimeout = setTimeout(this.onIdle.bind(this), CLEANUP_TIMEOUT);
    }
  }

  getHighestPriority(visible, views, scrolledDown) {
    const visibleViews = visible.views;
    const numVisible = visibleViews.length;

    if (numVisible === 0) {
      return null;
    }

    for (let i = 0; i < numVisible; ++i) {
      const view = visibleViews[i].view;

      if (!this.isViewFinished(view)) {
        return view;
      }
    }

    if (scrolledDown) {
      const nextPageIndex = visible.last.id;

      if (views[nextPageIndex] && !this.isViewFinished(views[nextPageIndex])) {
        return views[nextPageIndex];
      }
    } else {
      const previousPageIndex = visible.first.id - 2;

      if (views[previousPageIndex] && !this.isViewFinished(views[previousPageIndex])) {
        return views[previousPageIndex];
      }
    }

    return null;
  }

  isViewFinished(view) {
    return view.renderingState === RenderingStates.FINISHED;
  }

  renderView(view) {
    switch (view.renderingState) {
      case RenderingStates.FINISHED:
        return false;

      case RenderingStates.PAUSED:
        this.highestPriorityPage = view.renderingId;
        view.resume();
        break;

      case RenderingStates.RUNNING:
        this.highestPriorityPage = view.renderingId;
        break;

      case RenderingStates.INITIAL:
        this.highestPriorityPage = view.renderingId;
        view.draw().finally(() => {
          this.renderHighestPriority();
        }).catch(reason => {
          console.error(`renderView: "${reason}"`);
        });
        break;
    }

    return true;
  }

}

exports.PDFRenderingQueue = PDFRenderingQueue;

/***/ }),
/* 9 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFSidebar = exports.SidebarView = void 0;

var _ui_utils = __webpack_require__(2);

var _pdf_rendering_queue = __webpack_require__(8);

const UI_NOTIFICATION_CLASS = "pdfSidebarNotification";
const SidebarView = {
  UNKNOWN: -1,
  NONE: 0,
  THUMBS: 1,
  OUTLINE: 2,
  ATTACHMENTS: 3,
  LAYERS: 4
};
exports.SidebarView = SidebarView;

class PDFSidebar {
  constructor({
    elements,
    pdfViewer,
    pdfThumbnailViewer,
    eventBus,
    l10n = _ui_utils.NullL10n,
    disableNotification = false
  }) {
    this.isOpen = false;
    this.active = SidebarView.THUMBS;
    this.isInitialViewSet = false;
    this.onToggled = null;
    this.pdfViewer = pdfViewer;
    this.pdfThumbnailViewer = pdfThumbnailViewer;
    this.outerContainer = elements.outerContainer;
    this.viewerContainer = elements.viewerContainer;
    this.toggleButton = elements.toggleButton;
    this.thumbnailButton = elements.thumbnailButton;
    this.outlineButton = elements.outlineButton;
    this.attachmentsButton = elements.attachmentsButton;
    this.thumbnailView = elements.thumbnailView;
    this.outlineView = elements.outlineView;
    this.attachmentsView = elements.attachmentsView;
    this.eventBus = eventBus;
    this.l10n = l10n;
    this._disableNotification = disableNotification;

    this._addEventListeners();
  }

  reset() {
    this.isInitialViewSet = false;

    this._hideUINotification(null);

    this.switchView(SidebarView.THUMBS);
    this.outlineButton.disabled = false;
    this.attachmentsButton.disabled = false;
  }

  get visibleView() {
    return this.isOpen ? this.active : SidebarView.NONE;
  }

  get isThumbnailViewVisible() {
    return this.isOpen && this.active === SidebarView.THUMBS;
  }

  get isOutlineViewVisible() {
    return this.isOpen && this.active === SidebarView.OUTLINE;
  }

  get isAttachmentsViewVisible() {
    return this.isOpen && this.active === SidebarView.ATTACHMENTS;
  }

  setInitialView(view = SidebarView.NONE) {
    if (this.isInitialViewSet) {
      return;
    }

    this.isInitialViewSet = true;

    if (view === SidebarView.NONE || view === SidebarView.UNKNOWN) {
      this._dispatchEvent();

      return;
    }

    if (!this._switchView(view, true)) {
      this._dispatchEvent();
    }
  }

  switchView(view, forceOpen = false) {
    this._switchView(view, forceOpen);
  }

  _switchView(view, forceOpen = false) {
    const isViewChanged = view !== this.active;
    let shouldForceRendering = false;

    switch (view) {
      case SidebarView.NONE:
        if (this.isOpen) {
          this.close();
          return true;
        }

        return false;

      case SidebarView.THUMBS:
        if (this.isOpen && isViewChanged) {
          shouldForceRendering = true;
        }

        break;

      case SidebarView.OUTLINE:
        if (this.outlineButton.disabled) {
          return false;
        }

        break;

      case SidebarView.ATTACHMENTS:
        if (this.attachmentsButton.disabled) {
          return false;
        }

        break;

      default:
        console.error(`PDFSidebar._switchView: "${view}" is not a valid view.`);
        return false;
    }

    this.active = view;
    this.thumbnailButton.classList.toggle("toggled", view === SidebarView.THUMBS);
    this.outlineButton.classList.toggle("toggled", view === SidebarView.OUTLINE);
    this.attachmentsButton.classList.toggle("toggled", view === SidebarView.ATTACHMENTS);
    this.thumbnailView.classList.toggle("hidden", view !== SidebarView.THUMBS);
    this.outlineView.classList.toggle("hidden", view !== SidebarView.OUTLINE);
    this.attachmentsView.classList.toggle("hidden", view !== SidebarView.ATTACHMENTS);

    if (forceOpen && !this.isOpen) {
      this.open();
      return true;
    }

    if (shouldForceRendering) {
      this._updateThumbnailViewer();

      this._forceRendering();
    }

    if (isViewChanged) {
      this._dispatchEvent();
    }

    this._hideUINotification(this.active);

    return isViewChanged;
  }

  open() {
    if (this.isOpen) {
      return;
    }

    this.isOpen = true;
    this.toggleButton.classList.add("toggled");
    this.outerContainer.classList.add("sidebarMoving", "sidebarOpen");

    if (this.active === SidebarView.THUMBS) {
      this._updateThumbnailViewer();
    }

    this._forceRendering();

    this._dispatchEvent();

    this._hideUINotification(this.active);
  }

  close() {
    if (!this.isOpen) {
      return;
    }

    this.isOpen = false;
    this.toggleButton.classList.remove("toggled");
    this.outerContainer.classList.add("sidebarMoving");
    this.outerContainer.classList.remove("sidebarOpen");

    this._forceRendering();

    this._dispatchEvent();
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  _dispatchEvent() {
    this.eventBus.dispatch("sidebarviewchanged", {
      source: this,
      view: this.visibleView
    });
  }

  _forceRendering() {
    if (this.onToggled) {
      this.onToggled();
    } else {
      this.pdfViewer.forceRendering();
      this.pdfThumbnailViewer.forceRendering();
    }
  }

  _updateThumbnailViewer() {
    const {
      pdfViewer,
      pdfThumbnailViewer
    } = this;
    const pagesCount = pdfViewer.pagesCount;

    for (let pageIndex = 0; pageIndex < pagesCount; pageIndex++) {
      const pageView = pdfViewer.getPageView(pageIndex);

      if (pageView && pageView.renderingState === _pdf_rendering_queue.RenderingStates.FINISHED) {
        const thumbnailView = pdfThumbnailViewer.getThumbnail(pageIndex);
        thumbnailView.setImage(pageView);
      }
    }

    pdfThumbnailViewer.scrollThumbnailIntoView(pdfViewer.currentPageNumber);
  }

  _showUINotification(view) {
    if (this._disableNotification) {
      return;
    }

    this.l10n.get("toggle_sidebar_notification.title", null, "Toggle Sidebar (document contains outline/attachments)").then(msg => {
      this.toggleButton.title = msg;
    });

    if (!this.isOpen) {
      this.toggleButton.classList.add(UI_NOTIFICATION_CLASS);
    } else if (view === this.active) {
      return;
    }

    switch (view) {
      case SidebarView.OUTLINE:
        this.outlineButton.classList.add(UI_NOTIFICATION_CLASS);
        break;

      case SidebarView.ATTACHMENTS:
        this.attachmentsButton.classList.add(UI_NOTIFICATION_CLASS);
        break;
    }
  }

  _hideUINotification(view) {
    if (this._disableNotification) {
      return;
    }

    const removeNotification = sidebarView => {
      switch (sidebarView) {
        case SidebarView.OUTLINE:
          this.outlineButton.classList.remove(UI_NOTIFICATION_CLASS);
          break;

        case SidebarView.ATTACHMENTS:
          this.attachmentsButton.classList.remove(UI_NOTIFICATION_CLASS);
          break;
      }
    };

    if (!this.isOpen && view !== null) {
      return;
    }

    this.toggleButton.classList.remove(UI_NOTIFICATION_CLASS);

    if (view !== null) {
      removeNotification(view);
      return;
    }

    for (view in SidebarView) {
      removeNotification(SidebarView[view]);
    }

    this.l10n.get("toggle_sidebar.title", null, "Toggle Sidebar").then(msg => {
      this.toggleButton.title = msg;
    });
  }

  _addEventListeners() {
    this.viewerContainer.addEventListener("transitionend", evt => {
      if (evt.target === this.viewerContainer) {
        this.outerContainer.classList.remove("sidebarMoving");
      }
    });
    this.toggleButton.addEventListener("click", () => {
      this.toggle();
    });
    this.thumbnailButton.addEventListener("click", () => {
      this.switchView(SidebarView.THUMBS);
    });
    this.outlineButton.addEventListener("click", () => {
      this.switchView(SidebarView.OUTLINE);
    });
    this.outlineButton.addEventListener("dblclick", () => {
      this.eventBus.dispatch("toggleoutlinetree", {
        source: this
      });
    });
    this.attachmentsButton.addEventListener("click", () => {
      this.switchView(SidebarView.ATTACHMENTS);
    });

    this.eventBus._on("outlineloaded", evt => {
      const outlineCount = evt.outlineCount;
      this.outlineButton.disabled = !outlineCount;

      if (outlineCount) {
        this._showUINotification(SidebarView.OUTLINE);
      } else if (this.active === SidebarView.OUTLINE) {
        this.switchView(SidebarView.THUMBS);
      }
    });

    this.eventBus._on("attachmentsloaded", evt => {
      if (evt.attachmentsCount) {
        this.attachmentsButton.disabled = false;

        this._showUINotification(SidebarView.ATTACHMENTS);

        return;
      }

      Promise.resolve().then(() => {
        if (this.attachmentsView.hasChildNodes()) {
          return;
        }

        this.attachmentsButton.disabled = true;

        if (this.active === SidebarView.ATTACHMENTS) {
          this.switchView(SidebarView.THUMBS);
        }
      });
    });

    this.eventBus._on("presentationmodechanged", evt => {
      if (!evt.active && !evt.switchInProgress && this.isThumbnailViewVisible) {
        this._updateThumbnailViewer();
      }
    });
  }

}

exports.PDFSidebar = PDFSidebar;

/***/ }),
/* 10 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.OverlayManager = void 0;

class OverlayManager {
  constructor() {
    this._overlays = {};
    this._active = null;
    this._keyDownBound = this._keyDown.bind(this);
  }

  get active() {
    return this._active;
  }

  async register(name, element, callerCloseMethod = null, canForceClose = false) {
    let container;

    if (!name || !element || !(container = element.parentNode)) {
      throw new Error("Not enough parameters.");
    } else if (this._overlays[name]) {
      throw new Error("The overlay is already registered.");
    }

    this._overlays[name] = {
      element,
      container,
      callerCloseMethod,
      canForceClose
    };
  }

  async unregister(name) {
    if (!this._overlays[name]) {
      throw new Error("The overlay does not exist.");
    } else if (this._active === name) {
      throw new Error("The overlay cannot be removed while it is active.");
    }

    delete this._overlays[name];
  }

  async open(name) {
    if (!this._overlays[name]) {
      throw new Error("The overlay does not exist.");
    } else if (this._active) {
      if (this._overlays[name].canForceClose) {
        this._closeThroughCaller();
      } else if (this._active === name) {
        throw new Error("The overlay is already active.");
      } else {
        throw new Error("Another overlay is currently active.");
      }
    }

    this._active = name;

    this._overlays[this._active].element.classList.remove("hidden");

    this._overlays[this._active].container.classList.remove("hidden");

    window.addEventListener("keydown", this._keyDownBound);
  }

  async close(name) {
    if (!this._overlays[name]) {
      throw new Error("The overlay does not exist.");
    } else if (!this._active) {
      throw new Error("The overlay is currently not active.");
    } else if (this._active !== name) {
      throw new Error("Another overlay is currently active.");
    }

    this._overlays[this._active].container.classList.add("hidden");

    this._overlays[this._active].element.classList.add("hidden");

    this._active = null;
    window.removeEventListener("keydown", this._keyDownBound);
  }

  _keyDown(evt) {
    if (this._active && evt.keyCode === 27) {
      this._closeThroughCaller();

      evt.preventDefault();
    }
  }

  _closeThroughCaller() {
    if (this._overlays[this._active].callerCloseMethod) {
      this._overlays[this._active].callerCloseMethod();
    }

    if (this._active) {
      this.close(this._active);
    }
  }

}

exports.OverlayManager = OverlayManager;

/***/ }),
/* 11 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PasswordPrompt = void 0;

var _ui_utils = __webpack_require__(2);

var _pdfjsLib = __webpack_require__(4);

class PasswordPrompt {
  constructor(options, overlayManager, l10n = _ui_utils.NullL10n) {
    this.overlayName = options.overlayName;
    this.container = options.container;
    this.label = options.label;
    this.input = options.input;
    this.submitButton = options.submitButton;
    this.cancelButton = options.cancelButton;
    this.overlayManager = overlayManager;
    this.l10n = l10n;
    this.updateCallback = null;
    this.reason = null;
    this.submitButton.addEventListener("click", this.verify.bind(this));
    this.cancelButton.addEventListener("click", this.close.bind(this));
    this.input.addEventListener("keydown", e => {
      if (e.keyCode === 13) {
        this.verify();
      }
    });
    this.overlayManager.register(this.overlayName, this.container, this.close.bind(this), true);
  }

  open() {
    this.overlayManager.open(this.overlayName).then(() => {
      this.input.focus();
      let promptString;

      if (this.reason === _pdfjsLib.PasswordResponses.INCORRECT_PASSWORD) {
        promptString = this.l10n.get("password_invalid", null, "Invalid password. Please try again.");
      } else {
        promptString = this.l10n.get("password_label", null, "Enter the password to open this PDF file.");
      }

      promptString.then(msg => {
        this.label.textContent = msg;
      });
    });
  }

  close() {
    this.overlayManager.close(this.overlayName).then(() => {
      this.input.value = "";
    });
  }

  verify() {
    const password = this.input.value;

    if (password && password.length > 0) {
      this.close();
      this.updateCallback(password);
    }
  }

  setUpdateCallback(updateCallback, reason) {
    this.updateCallback = updateCallback;
    this.reason = reason;
  }

}

exports.PasswordPrompt = PasswordPrompt;

/***/ }),
/* 12 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFAttachmentViewer = void 0;

var _pdfjsLib = __webpack_require__(4);

class PDFAttachmentViewer {
  constructor({
    container,
    eventBus,
    downloadManager
  }) {
    this.container = container;
    this.eventBus = eventBus;
    this.downloadManager = downloadManager;
    this.reset();

    this.eventBus._on("fileattachmentannotation", this._appendAttachment.bind(this));
  }

  reset(keepRenderedCapability = false) {
    this.attachments = null;
    this.container.textContent = "";

    if (!keepRenderedCapability) {
      this._renderedCapability = (0, _pdfjsLib.createPromiseCapability)();
    }
  }

  _dispatchEvent(attachmentsCount) {
    this._renderedCapability.resolve();

    this.eventBus.dispatch("attachmentsloaded", {
      source: this,
      attachmentsCount
    });
  }

  _bindPdfLink(button, content, filename) {
    if (this.downloadManager.disableCreateObjectURL) {
      throw new Error('bindPdfLink: Unsupported "disableCreateObjectURL" value.');
    }

    let blobUrl;

    button.onclick = function () {
      if (!blobUrl) {
        blobUrl = (0, _pdfjsLib.createObjectURL)(content, "application/pdf");
      }

      let viewerUrl;
      viewerUrl = "?file=" + encodeURIComponent(blobUrl + "#" + filename);
      window.open(viewerUrl);
      return false;
    };
  }

  _bindLink(button, content, filename) {
    button.onclick = () => {
      this.downloadManager.downloadData(content, filename, "");
      return false;
    };
  }

  render({
    attachments,
    keepRenderedCapability = false
  }) {
    let attachmentsCount = 0;

    if (this.attachments) {
      this.reset(keepRenderedCapability === true);
    }

    this.attachments = attachments || null;

    if (!attachments) {
      this._dispatchEvent(attachmentsCount);

      return;
    }

    const names = Object.keys(attachments).sort(function (a, b) {
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
    attachmentsCount = names.length;

    for (let i = 0; i < attachmentsCount; i++) {
      const item = attachments[names[i]];
      const filename = (0, _pdfjsLib.removeNullCharacters)((0, _pdfjsLib.getFilenameFromUrl)(item.filename));
      const div = document.createElement("div");
      div.className = "attachmentsItem";
      const button = document.createElement("button");
      button.textContent = filename;

      if (/\.pdf$/i.test(filename) && !this.downloadManager.disableCreateObjectURL) {
        this._bindPdfLink(button, item.content, filename);
      } else {
        this._bindLink(button, item.content, filename);
      }

      div.appendChild(button);
      this.container.appendChild(div);
    }

    this._dispatchEvent(attachmentsCount);
  }

  _appendAttachment({
    id,
    filename,
    content
  }) {
    this._renderedCapability.promise.then(() => {
      let attachments = this.attachments;

      if (!attachments) {
        attachments = Object.create(null);
      } else {
        for (const name in attachments) {
          if (id === name) {
            return;
          }
        }
      }

      attachments[id] = {
        filename,
        content
      };
      this.render({
        attachments,
        keepRenderedCapability: true
      });
    });
  }

}

exports.PDFAttachmentViewer = PDFAttachmentViewer;

/***/ }),
/* 13 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFDocumentProperties = void 0;

var _pdfjsLib = __webpack_require__(4);

var _ui_utils = __webpack_require__(2);

const DEFAULT_FIELD_CONTENT = "-";
const NON_METRIC_LOCALES = ["en-us", "en-lr", "my"];
const US_PAGE_NAMES = {
  "8.5x11": "Letter",
  "8.5x14": "Legal"
};
const METRIC_PAGE_NAMES = {
  "297x420": "A3",
  "210x297": "A4"
};

function getPageName(size, isPortrait, pageNames) {
  const width = isPortrait ? size.width : size.height;
  const height = isPortrait ? size.height : size.width;
  return pageNames[`${width}x${height}`];
}

class PDFDocumentProperties {
  constructor({
    overlayName,
    fields,
    container,
    closeButton
  }, overlayManager, eventBus, l10n = _ui_utils.NullL10n) {
    this.overlayName = overlayName;
    this.fields = fields;
    this.container = container;
    this.overlayManager = overlayManager;
    this.l10n = l10n;

    this._reset();

    closeButton.addEventListener("click", this.close.bind(this));
    this.overlayManager.register(this.overlayName, this.container, this.close.bind(this));

    eventBus._on("pagechanging", evt => {
      this._currentPageNumber = evt.pageNumber;
    });

    eventBus._on("rotationchanging", evt => {
      this._pagesRotation = evt.pagesRotation;
    });

    this._isNonMetricLocale = true;
    l10n.getLanguage().then(locale => {
      this._isNonMetricLocale = NON_METRIC_LOCALES.includes(locale);
    });
  }

  open() {
    const freezeFieldData = data => {
      Object.defineProperty(this, "fieldData", {
        value: Object.freeze(data),
        writable: false,
        enumerable: true,
        configurable: true
      });
    };

    Promise.all([this.overlayManager.open(this.overlayName), this._dataAvailableCapability.promise]).then(() => {
      const currentPageNumber = this._currentPageNumber;
      const pagesRotation = this._pagesRotation;

      if (this.fieldData && currentPageNumber === this.fieldData["_currentPageNumber"] && pagesRotation === this.fieldData["_pagesRotation"]) {
        this._updateUI();

        return;
      }

      this.pdfDocument.getMetadata().then(({
        info,
        metadata,
        contentDispositionFilename
      }) => {
        return Promise.all([info, metadata, contentDispositionFilename || (0, _ui_utils.getPDFFileNameFromURL)(this.url || ""), this._parseFileSize(this.maybeFileSize), this._parseDate(info.CreationDate), this._parseDate(info.ModDate), this.pdfDocument.getPage(currentPageNumber).then(pdfPage => {
          return this._parsePageSize((0, _ui_utils.getPageSizeInches)(pdfPage), pagesRotation);
        }), this._parseLinearization(info.IsLinearized)]);
      }).then(([info, metadata, fileName, fileSize, creationDate, modDate, pageSize, isLinearized]) => {
        freezeFieldData({
          fileName,
          fileSize,
          title: info.Title,
          author: info.Author,
          subject: info.Subject,
          keywords: info.Keywords,
          creationDate,
          modificationDate: modDate,
          creator: info.Creator,
          producer: info.Producer,
          version: info.PDFFormatVersion,
          pageCount: this.pdfDocument.numPages,
          pageSize,
          linearized: isLinearized,
          _currentPageNumber: currentPageNumber,
          _pagesRotation: pagesRotation
        });

        this._updateUI();

        return this.pdfDocument.getDownloadInfo();
      }).then(({
        length
      }) => {
        this.maybeFileSize = length;
        return this._parseFileSize(length);
      }).then(fileSize => {
        if (fileSize === this.fieldData["fileSize"]) {
          return;
        }

        const data = Object.assign(Object.create(null), this.fieldData);
        data["fileSize"] = fileSize;
        freezeFieldData(data);

        this._updateUI();
      });
    });
  }

  close() {
    this.overlayManager.close(this.overlayName);
  }

  setDocument(pdfDocument, url = null) {
    if (this.pdfDocument) {
      this._reset();

      this._updateUI(true);
    }

    if (!pdfDocument) {
      return;
    }

    this.pdfDocument = pdfDocument;
    this.url = url;

    this._dataAvailableCapability.resolve();
  }

  setFileSize(fileSize) {
    if (Number.isInteger(fileSize) && fileSize > 0) {
      this.maybeFileSize = fileSize;
    }
  }

  _reset() {
    this.pdfDocument = null;
    this.url = null;
    this.maybeFileSize = 0;
    delete this.fieldData;
    this._dataAvailableCapability = (0, _pdfjsLib.createPromiseCapability)();
    this._currentPageNumber = 1;
    this._pagesRotation = 0;
  }

  _updateUI(reset = false) {
    if (reset || !this.fieldData) {
      for (const id in this.fields) {
        this.fields[id].textContent = DEFAULT_FIELD_CONTENT;
      }

      return;
    }

    if (this.overlayManager.active !== this.overlayName) {
      return;
    }

    for (const id in this.fields) {
      const content = this.fieldData[id];
      this.fields[id].textContent = content || content === 0 ? content : DEFAULT_FIELD_CONTENT;
    }
  }

  async _parseFileSize(fileSize = 0) {
    const kb = fileSize / 1024;

    if (!kb) {
      return undefined;
    } else if (kb < 1024) {
      return this.l10n.get("document_properties_kb", {
        size_kb: (+kb.toPrecision(3)).toLocaleString(),
        size_b: fileSize.toLocaleString()
      }, "{{size_kb}} KB ({{size_b}} bytes)");
    }

    return this.l10n.get("document_properties_mb", {
      size_mb: (+(kb / 1024).toPrecision(3)).toLocaleString(),
      size_b: fileSize.toLocaleString()
    }, "{{size_mb}} MB ({{size_b}} bytes)");
  }

  async _parsePageSize(pageSizeInches, pagesRotation) {
    if (!pageSizeInches) {
      return undefined;
    }

    if (pagesRotation % 180 !== 0) {
      pageSizeInches = {
        width: pageSizeInches.height,
        height: pageSizeInches.width
      };
    }

    const isPortrait = (0, _ui_utils.isPortraitOrientation)(pageSizeInches);
    let sizeInches = {
      width: Math.round(pageSizeInches.width * 100) / 100,
      height: Math.round(pageSizeInches.height * 100) / 100
    };
    let sizeMillimeters = {
      width: Math.round(pageSizeInches.width * 25.4 * 10) / 10,
      height: Math.round(pageSizeInches.height * 25.4 * 10) / 10
    };
    let pageName = null;
    let rawName = getPageName(sizeInches, isPortrait, US_PAGE_NAMES) || getPageName(sizeMillimeters, isPortrait, METRIC_PAGE_NAMES);

    if (!rawName && !(Number.isInteger(sizeMillimeters.width) && Number.isInteger(sizeMillimeters.height))) {
      const exactMillimeters = {
        width: pageSizeInches.width * 25.4,
        height: pageSizeInches.height * 25.4
      };
      const intMillimeters = {
        width: Math.round(sizeMillimeters.width),
        height: Math.round(sizeMillimeters.height)
      };

      if (Math.abs(exactMillimeters.width - intMillimeters.width) < 0.1 && Math.abs(exactMillimeters.height - intMillimeters.height) < 0.1) {
        rawName = getPageName(intMillimeters, isPortrait, METRIC_PAGE_NAMES);

        if (rawName) {
          sizeInches = {
            width: Math.round(intMillimeters.width / 25.4 * 100) / 100,
            height: Math.round(intMillimeters.height / 25.4 * 100) / 100
          };
          sizeMillimeters = intMillimeters;
        }
      }
    }

    if (rawName) {
      pageName = this.l10n.get("document_properties_page_size_name_" + rawName.toLowerCase(), null, rawName);
    }

    return Promise.all([this._isNonMetricLocale ? sizeInches : sizeMillimeters, this.l10n.get("document_properties_page_size_unit_" + (this._isNonMetricLocale ? "inches" : "millimeters"), null, this._isNonMetricLocale ? "in" : "mm"), pageName, this.l10n.get("document_properties_page_size_orientation_" + (isPortrait ? "portrait" : "landscape"), null, isPortrait ? "portrait" : "landscape")]).then(([{
      width,
      height
    }, unit, name, orientation]) => {
      return this.l10n.get("document_properties_page_size_dimension_" + (name ? "name_" : "") + "string", {
        width: width.toLocaleString(),
        height: height.toLocaleString(),
        unit,
        name,
        orientation
      }, "{{width}} × {{height}} {{unit}} (" + (name ? "{{name}}, " : "") + "{{orientation}})");
    });
  }

  async _parseDate(inputDate) {
    const dateObject = _pdfjsLib.PDFDateString.toDateObject(inputDate);

    if (!dateObject) {
      return undefined;
    }

    return this.l10n.get("document_properties_date_string", {
      date: dateObject.toLocaleDateString(),
      time: dateObject.toLocaleTimeString()
    }, "{{date}}, {{time}}");
  }

  _parseLinearization(isLinearized) {
    return this.l10n.get("document_properties_linearized_" + (isLinearized ? "yes" : "no"), null, isLinearized ? "Yes" : "No");
  }

}

exports.PDFDocumentProperties = PDFDocumentProperties;

/***/ }),
/* 14 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFFindBar = void 0;

var _ui_utils = __webpack_require__(2);

var _pdf_find_controller = __webpack_require__(15);

const MATCHES_COUNT_LIMIT = 1000;

class PDFFindBar {
  constructor(options, eventBus, l10n = _ui_utils.NullL10n) {
    this.opened = false;
    this.bar = options.bar || null;
    this.toggleButton = options.toggleButton || null;
    this.findField = options.findField || null;
    this.highlightAll = options.highlightAllCheckbox || null;
    this.caseSensitive = options.caseSensitiveCheckbox || null;
    this.entireWord = options.entireWordCheckbox || null;
    this.findMsg = options.findMsg || null;
    this.findResultsCount = options.findResultsCount || null;
    this.findPreviousButton = options.findPreviousButton || null;
    this.findNextButton = options.findNextButton || null;
    this.eventBus = eventBus || (0, _ui_utils.getGlobalEventBus)();
    this.l10n = l10n;
    this.toggleButton.addEventListener("click", () => {
      this.toggle();
    });
    this.findField.addEventListener("input", () => {
      this.dispatchEvent("");
    });
    this.bar.addEventListener("keydown", e => {
      switch (e.keyCode) {
        case 13:
          if (e.target === this.findField) {
            this.dispatchEvent("again", e.shiftKey);
          }

          break;

        case 27:
          this.close();
          break;
      }
    });
    this.findPreviousButton.addEventListener("click", () => {
      this.dispatchEvent("again", true);
    });
    this.findNextButton.addEventListener("click", () => {
      this.dispatchEvent("again", false);
    });
    this.highlightAll.addEventListener("click", () => {
      this.dispatchEvent("highlightallchange");
    });
    this.caseSensitive.addEventListener("click", () => {
      this.dispatchEvent("casesensitivitychange");
    });
    this.entireWord.addEventListener("click", () => {
      this.dispatchEvent("entirewordchange");
    });

    this.eventBus._on("resize", this._adjustWidth.bind(this));
  }

  reset() {
    this.updateUIState();
  }

  dispatchEvent(type, findPrev) {
    this.eventBus.dispatch("find", {
      source: this,
      type,
      query: this.findField.value,
      phraseSearch: true,
      caseSensitive: this.caseSensitive.checked,
      entireWord: this.entireWord.checked,
      highlightAll: this.highlightAll.checked,
      findPrevious: findPrev
    });
  }

  updateUIState(state, previous, matchesCount) {
    let notFound = false;
    let findMsg = "";
    let status = "";

    switch (state) {
      case _pdf_find_controller.FindState.FOUND:
        break;

      case _pdf_find_controller.FindState.PENDING:
        status = "pending";
        break;

      case _pdf_find_controller.FindState.NOT_FOUND:
        findMsg = this.l10n.get("find_not_found", null, "Phrase not found");
        notFound = true;
        break;

      case _pdf_find_controller.FindState.WRAPPED:
        if (previous) {
          findMsg = this.l10n.get("find_reached_top", null, "Reached top of document, continued from bottom");
        } else {
          findMsg = this.l10n.get("find_reached_bottom", null, "Reached end of document, continued from top");
        }

        break;
    }

    this.findField.classList.toggle("notFound", notFound);
    this.findField.setAttribute("data-status", status);
    Promise.resolve(findMsg).then(msg => {
      this.findMsg.textContent = msg;

      this._adjustWidth();
    });
    this.updateResultsCount(matchesCount);
  }

  updateResultsCount({
    current = 0,
    total = 0
  } = {}) {
    if (!this.findResultsCount) {
      return;
    }

    const limit = MATCHES_COUNT_LIMIT;
    let matchesCountMsg = "";

    if (total > 0) {
      if (total > limit) {
        matchesCountMsg = this.l10n.get("find_match_count_limit", {
          limit
        }, "More than {{limit}} match" + (limit !== 1 ? "es" : ""));
      } else {
        matchesCountMsg = this.l10n.get("find_match_count", {
          current,
          total
        }, "{{current}} of {{total}} match" + (total !== 1 ? "es" : ""));
      }
    }

    Promise.resolve(matchesCountMsg).then(msg => {
      this.findResultsCount.textContent = msg;
      this.findResultsCount.classList.toggle("hidden", !total);

      this._adjustWidth();
    });
  }

  open() {
    if (!this.opened) {
      this.opened = true;
      this.toggleButton.classList.add("toggled");
      this.bar.classList.remove("hidden");
    }

    this.findField.select();
    this.findField.focus();

    this._adjustWidth();
  }

  close() {
    if (!this.opened) {
      return;
    }

    this.opened = false;
    this.toggleButton.classList.remove("toggled");
    this.bar.classList.add("hidden");
    this.eventBus.dispatch("findbarclose", {
      source: this
    });
  }

  toggle() {
    if (this.opened) {
      this.close();
    } else {
      this.open();
    }
  }

  _adjustWidth() {
    if (!this.opened) {
      return;
    }

    this.bar.classList.remove("wrapContainers");
    const findbarHeight = this.bar.clientHeight;
    const inputContainerHeight = this.bar.firstElementChild.clientHeight;

    if (findbarHeight > inputContainerHeight) {
      this.bar.classList.add("wrapContainers");
    }
  }

}

exports.PDFFindBar = PDFFindBar;

/***/ }),
/* 15 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFFindController = exports.FindState = void 0;

var _ui_utils = __webpack_require__(2);

var _pdfjsLib = __webpack_require__(4);

var _pdf_find_utils = __webpack_require__(16);

const FindState = {
  FOUND: 0,
  NOT_FOUND: 1,
  WRAPPED: 2,
  PENDING: 3
};
exports.FindState = FindState;
const FIND_TIMEOUT = 250;
const MATCH_SCROLL_OFFSET_TOP = -50;
const MATCH_SCROLL_OFFSET_LEFT = -400;
const CHARACTERS_TO_NORMALIZE = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201A": "'",
  "\u201B": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u201E": '"',
  "\u201F": '"',
  "\u00BC": "1/4",
  "\u00BD": "1/2",
  "\u00BE": "3/4"
};
let normalizationRegex = null;

function normalize(text) {
  if (!normalizationRegex) {
    const replace = Object.keys(CHARACTERS_TO_NORMALIZE).join("");
    normalizationRegex = new RegExp(`[${replace}]`, "g");
  }

  return text.replace(normalizationRegex, function (ch) {
    return CHARACTERS_TO_NORMALIZE[ch];
  });
}

class PDFFindController {
  constructor({
    linkService,
    eventBus
  }) {
    this._linkService = linkService;
    this._eventBus = eventBus || (0, _ui_utils.getGlobalEventBus)();

    this._reset();

    eventBus._on("findbarclose", this._onFindBarClose.bind(this));
  }

  get highlightMatches() {
    return this._highlightMatches;
  }

  get pageMatches() {
    return this._pageMatches;
  }

  get pageMatchesLength() {
    return this._pageMatchesLength;
  }

  get selected() {
    return this._selected;
  }

  get state() {
    return this._state;
  }

  setDocument(pdfDocument) {
    if (this._pdfDocument) {
      this._reset();
    }

    if (!pdfDocument) {
      return;
    }

    this._pdfDocument = pdfDocument;

    this._firstPageCapability.resolve();
  }

  executeCommand(cmd, state) {
    if (!state) {
      return;
    }

    const pdfDocument = this._pdfDocument;

    if (this._state === null || this._shouldDirtyMatch(cmd, state)) {
      this._dirtyMatch = true;
    }

    this._state = state;

    if (cmd !== "findhighlightallchange") {
      this._updateUIState(FindState.PENDING);
    }

    this._firstPageCapability.promise.then(() => {
      if (!this._pdfDocument || pdfDocument && this._pdfDocument !== pdfDocument) {
        return;
      }

      this._extractText();

      const findbarClosed = !this._highlightMatches;
      const pendingTimeout = !!this._findTimeout;

      if (this._findTimeout) {
        clearTimeout(this._findTimeout);
        this._findTimeout = null;
      }

      if (cmd === "find") {
        this._findTimeout = setTimeout(() => {
          this._nextMatch();

          this._findTimeout = null;
        }, FIND_TIMEOUT);
      } else if (this._dirtyMatch) {
        this._nextMatch();
      } else if (cmd === "findagain") {
        this._nextMatch();

        if (findbarClosed && this._state.highlightAll) {
          this._updateAllPages();
        }
      } else if (cmd === "findhighlightallchange") {
        if (pendingTimeout) {
          this._nextMatch();
        } else {
          this._highlightMatches = true;
        }

        this._updateAllPages();
      } else {
        this._nextMatch();
      }
    });
  }

  scrollMatchIntoView({
    element = null,
    pageIndex = -1,
    matchIndex = -1
  }) {
    if (!this._scrollMatches || !element) {
      return;
    } else if (matchIndex === -1 || matchIndex !== this._selected.matchIdx) {
      return;
    } else if (pageIndex === -1 || pageIndex !== this._selected.pageIdx) {
      return;
    }

    this._scrollMatches = false;
    const spot = {
      top: MATCH_SCROLL_OFFSET_TOP,
      left: MATCH_SCROLL_OFFSET_LEFT
    };
    (0, _ui_utils.scrollIntoView)(element, spot, true);
  }

  _reset() {
    this._highlightMatches = false;
    this._scrollMatches = false;
    this._pdfDocument = null;
    this._pageMatches = [];
    this._pageMatchesLength = [];
    this._state = null;
    this._selected = {
      pageIdx: -1,
      matchIdx: -1
    };
    this._offset = {
      pageIdx: null,
      matchIdx: null,
      wrapped: false
    };
    this._extractTextPromises = [];
    this._pageContents = [];
    this._matchesCountTotal = 0;
    this._pagesToSearch = null;
    this._pendingFindMatches = Object.create(null);
    this._resumePageIdx = null;
    this._dirtyMatch = false;
    clearTimeout(this._findTimeout);
    this._findTimeout = null;
    this._firstPageCapability = (0, _pdfjsLib.createPromiseCapability)();
  }

  get _query() {
    if (this._state.query !== this._rawQuery) {
      this._rawQuery = this._state.query;
      this._normalizedQuery = normalize(this._state.query);
    }

    return this._normalizedQuery;
  }

  _shouldDirtyMatch(cmd, state) {
    if (state.query !== this._state.query) {
      return true;
    }

    switch (cmd) {
      case "findagain":
        const pageNumber = this._selected.pageIdx + 1;
        const linkService = this._linkService;

        if (pageNumber >= 1 && pageNumber <= linkService.pagesCount && pageNumber !== linkService.page && !linkService.isPageVisible(pageNumber)) {
          return true;
        }

        return false;

      case "findhighlightallchange":
        return false;
    }

    return true;
  }

  _prepareMatches(matchesWithLength, matches, matchesLength) {
    function isSubTerm(currentIndex) {
      const currentElem = matchesWithLength[currentIndex];
      const nextElem = matchesWithLength[currentIndex + 1];

      if (currentIndex < matchesWithLength.length - 1 && currentElem.match === nextElem.match) {
        currentElem.skipped = true;
        return true;
      }

      for (let i = currentIndex - 1; i >= 0; i--) {
        const prevElem = matchesWithLength[i];

        if (prevElem.skipped) {
          continue;
        }

        if (prevElem.match + prevElem.matchLength < currentElem.match) {
          break;
        }

        if (prevElem.match + prevElem.matchLength >= currentElem.match + currentElem.matchLength) {
          currentElem.skipped = true;
          return true;
        }
      }

      return false;
    }

    matchesWithLength.sort(function (a, b) {
      return a.match === b.match ? a.matchLength - b.matchLength : a.match - b.match;
    });

    for (let i = 0, len = matchesWithLength.length; i < len; i++) {
      if (isSubTerm(i)) {
        continue;
      }

      matches.push(matchesWithLength[i].match);
      matchesLength.push(matchesWithLength[i].matchLength);
    }
  }

  _isEntireWord(content, startIdx, length) {
    if (startIdx > 0) {
      const first = content.charCodeAt(startIdx);
      const limit = content.charCodeAt(startIdx - 1);

      if ((0, _pdf_find_utils.getCharacterType)(first) === (0, _pdf_find_utils.getCharacterType)(limit)) {
        return false;
      }
    }

    const endIdx = startIdx + length - 1;

    if (endIdx < content.length - 1) {
      const last = content.charCodeAt(endIdx);
      const limit = content.charCodeAt(endIdx + 1);

      if ((0, _pdf_find_utils.getCharacterType)(last) === (0, _pdf_find_utils.getCharacterType)(limit)) {
        return false;
      }
    }

    return true;
  }

  _calculatePhraseMatch(query, pageIndex, pageContent, entireWord) {
    const matches = [];
    const queryLen = query.length;
    let matchIdx = -queryLen;

    while (true) {
      matchIdx = pageContent.indexOf(query, matchIdx + queryLen);

      if (matchIdx === -1) {
        break;
      }

      if (entireWord && !this._isEntireWord(pageContent, matchIdx, queryLen)) {
        continue;
      }

      matches.push(matchIdx);
    }

    this._pageMatches[pageIndex] = matches;
  }

  _calculateWordMatch(query, pageIndex, pageContent, entireWord) {
    const matchesWithLength = [];
    const queryArray = query.match(/\S+/g);

    for (let i = 0, len = queryArray.length; i < len; i++) {
      const subquery = queryArray[i];
      const subqueryLen = subquery.length;
      let matchIdx = -subqueryLen;

      while (true) {
        matchIdx = pageContent.indexOf(subquery, matchIdx + subqueryLen);

        if (matchIdx === -1) {
          break;
        }

        if (entireWord && !this._isEntireWord(pageContent, matchIdx, subqueryLen)) {
          continue;
        }

        matchesWithLength.push({
          match: matchIdx,
          matchLength: subqueryLen,
          skipped: false
        });
      }
    }

    this._pageMatchesLength[pageIndex] = [];
    this._pageMatches[pageIndex] = [];

    this._prepareMatches(matchesWithLength, this._pageMatches[pageIndex], this._pageMatchesLength[pageIndex]);
  }

  _calculateMatch(pageIndex) {
    let pageContent = this._pageContents[pageIndex];
    let query = this._query;
    const {
      caseSensitive,
      entireWord,
      phraseSearch
    } = this._state;

    if (query.length === 0) {
      return;
    }

    if (!caseSensitive) {
      pageContent = pageContent.toLowerCase();
      query = query.toLowerCase();
    }

    if (phraseSearch) {
      this._calculatePhraseMatch(query, pageIndex, pageContent, entireWord);
    } else {
      this._calculateWordMatch(query, pageIndex, pageContent, entireWord);
    }

    if (this._state.highlightAll) {
      this._updatePage(pageIndex);
    }

    if (this._resumePageIdx === pageIndex) {
      this._resumePageIdx = null;

      this._nextPageMatch();
    }

    const pageMatchesCount = this._pageMatches[pageIndex].length;

    if (pageMatchesCount > 0) {
      this._matchesCountTotal += pageMatchesCount;

      this._updateUIResultsCount();
    }
  }

  _extractText() {
    if (this._extractTextPromises.length > 0) {
      return;
    }

    let promise = Promise.resolve();

    for (let i = 0, ii = this._linkService.pagesCount; i < ii; i++) {
      const extractTextCapability = (0, _pdfjsLib.createPromiseCapability)();
      this._extractTextPromises[i] = extractTextCapability.promise;
      promise = promise.then(() => {
        return this._pdfDocument.getPage(i + 1).then(pdfPage => {
          return pdfPage.getTextContent({
            normalizeWhitespace: true
          });
        }).then(textContent => {
          const textItems = textContent.items;
          const strBuf = [];

          for (let j = 0, jj = textItems.length; j < jj; j++) {
            strBuf.push(textItems[j].str);
          }

          this._pageContents[i] = normalize(strBuf.join(""));
          extractTextCapability.resolve(i);
        }, reason => {
          console.error(`Unable to get text content for page ${i + 1}`, reason);
          this._pageContents[i] = "";
          extractTextCapability.resolve(i);
        });
      });
    }
  }

  _updatePage(index) {
    if (this._scrollMatches && this._selected.pageIdx === index) {
      this._linkService.page = index + 1;
    }

    this._eventBus.dispatch("updatetextlayermatches", {
      source: this,
      pageIndex: index
    });
  }

  _updateAllPages() {
    this._eventBus.dispatch("updatetextlayermatches", {
      source: this,
      pageIndex: -1
    });
  }

  _nextMatch() {
    const previous = this._state.findPrevious;
    const currentPageIndex = this._linkService.page - 1;
    const numPages = this._linkService.pagesCount;
    this._highlightMatches = true;

    if (this._dirtyMatch) {
      this._dirtyMatch = false;
      this._selected.pageIdx = this._selected.matchIdx = -1;
      this._offset.pageIdx = currentPageIndex;
      this._offset.matchIdx = null;
      this._offset.wrapped = false;
      this._resumePageIdx = null;
      this._pageMatches.length = 0;
      this._pageMatchesLength.length = 0;
      this._matchesCountTotal = 0;

      this._updateAllPages();

      for (let i = 0; i < numPages; i++) {
        if (this._pendingFindMatches[i] === true) {
          continue;
        }

        this._pendingFindMatches[i] = true;

        this._extractTextPromises[i].then(pageIdx => {
          delete this._pendingFindMatches[pageIdx];

          this._calculateMatch(pageIdx);
        });
      }
    }

    if (this._query === "") {
      this._updateUIState(FindState.FOUND);

      return;
    }

    if (this._resumePageIdx) {
      return;
    }

    const offset = this._offset;
    this._pagesToSearch = numPages;

    if (offset.matchIdx !== null) {
      const numPageMatches = this._pageMatches[offset.pageIdx].length;

      if (!previous && offset.matchIdx + 1 < numPageMatches || previous && offset.matchIdx > 0) {
        offset.matchIdx = previous ? offset.matchIdx - 1 : offset.matchIdx + 1;

        this._updateMatch(true);

        return;
      }

      this._advanceOffsetPage(previous);
    }

    this._nextPageMatch();
  }

  _matchesReady(matches) {
    const offset = this._offset;
    const numMatches = matches.length;
    const previous = this._state.findPrevious;

    if (numMatches) {
      offset.matchIdx = previous ? numMatches - 1 : 0;

      this._updateMatch(true);

      return true;
    }

    this._advanceOffsetPage(previous);

    if (offset.wrapped) {
      offset.matchIdx = null;

      if (this._pagesToSearch < 0) {
        this._updateMatch(false);

        return true;
      }
    }

    return false;
  }

  _nextPageMatch() {
    if (this._resumePageIdx !== null) {
      console.error("There can only be one pending page.");
    }

    let matches = null;

    do {
      const pageIdx = this._offset.pageIdx;
      matches = this._pageMatches[pageIdx];

      if (!matches) {
        this._resumePageIdx = pageIdx;
        break;
      }
    } while (!this._matchesReady(matches));
  }

  _advanceOffsetPage(previous) {
    const offset = this._offset;
    const numPages = this._linkService.pagesCount;
    offset.pageIdx = previous ? offset.pageIdx - 1 : offset.pageIdx + 1;
    offset.matchIdx = null;
    this._pagesToSearch--;

    if (offset.pageIdx >= numPages || offset.pageIdx < 0) {
      offset.pageIdx = previous ? numPages - 1 : 0;
      offset.wrapped = true;
    }
  }

  _updateMatch(found = false) {
    let state = FindState.NOT_FOUND;
    const wrapped = this._offset.wrapped;
    this._offset.wrapped = false;

    if (found) {
      const previousPage = this._selected.pageIdx;
      this._selected.pageIdx = this._offset.pageIdx;
      this._selected.matchIdx = this._offset.matchIdx;
      state = wrapped ? FindState.WRAPPED : FindState.FOUND;

      if (previousPage !== -1 && previousPage !== this._selected.pageIdx) {
        this._updatePage(previousPage);
      }
    }

    this._updateUIState(state, this._state.findPrevious);

    if (this._selected.pageIdx !== -1) {
      this._scrollMatches = true;

      this._updatePage(this._selected.pageIdx);
    }
  }

  _onFindBarClose(evt) {
    const pdfDocument = this._pdfDocument;

    this._firstPageCapability.promise.then(() => {
      if (!this._pdfDocument || pdfDocument && this._pdfDocument !== pdfDocument) {
        return;
      }

      if (this._findTimeout) {
        clearTimeout(this._findTimeout);
        this._findTimeout = null;
      }

      if (this._resumePageIdx) {
        this._resumePageIdx = null;
        this._dirtyMatch = true;
      }

      this._updateUIState(FindState.FOUND);

      this._highlightMatches = false;

      this._updateAllPages();
    });
  }

  _requestMatchesCount() {
    const {
      pageIdx,
      matchIdx
    } = this._selected;
    let current = 0,
        total = this._matchesCountTotal;

    if (matchIdx !== -1) {
      for (let i = 0; i < pageIdx; i++) {
        current += this._pageMatches[i] && this._pageMatches[i].length || 0;
      }

      current += matchIdx + 1;
    }

    if (current < 1 || current > total) {
      current = total = 0;
    }

    return {
      current,
      total
    };
  }

  _updateUIResultsCount() {
    this._eventBus.dispatch("updatefindmatchescount", {
      source: this,
      matchesCount: this._requestMatchesCount()
    });
  }

  _updateUIState(state, previous) {
    this._eventBus.dispatch("updatefindcontrolstate", {
      source: this,
      state,
      previous,
      matchesCount: this._requestMatchesCount()
    });
  }

}

exports.PDFFindController = PDFFindController;

/***/ }),
/* 16 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getCharacterType = getCharacterType;
exports.CharacterType = void 0;
const CharacterType = {
  SPACE: 0,
  ALPHA_LETTER: 1,
  PUNCT: 2,
  HAN_LETTER: 3,
  KATAKANA_LETTER: 4,
  HIRAGANA_LETTER: 5,
  HALFWIDTH_KATAKANA_LETTER: 6,
  THAI_LETTER: 7
};
exports.CharacterType = CharacterType;

function isAlphabeticalScript(charCode) {
  return charCode < 0x2e80;
}

function isAscii(charCode) {
  return (charCode & 0xff80) === 0;
}

function isAsciiAlpha(charCode) {
  return charCode >= 0x61 && charCode <= 0x7a || charCode >= 0x41 && charCode <= 0x5a;
}

function isAsciiDigit(charCode) {
  return charCode >= 0x30 && charCode <= 0x39;
}

function isAsciiSpace(charCode) {
  return charCode === 0x20 || charCode === 0x09 || charCode === 0x0d || charCode === 0x0a;
}

function isHan(charCode) {
  return charCode >= 0x3400 && charCode <= 0x9fff || charCode >= 0xf900 && charCode <= 0xfaff;
}

function isKatakana(charCode) {
  return charCode >= 0x30a0 && charCode <= 0x30ff;
}

function isHiragana(charCode) {
  return charCode >= 0x3040 && charCode <= 0x309f;
}

function isHalfwidthKatakana(charCode) {
  return charCode >= 0xff60 && charCode <= 0xff9f;
}

function isThai(charCode) {
  return (charCode & 0xff80) === 0x0e00;
}

function getCharacterType(charCode) {
  if (isAlphabeticalScript(charCode)) {
    if (isAscii(charCode)) {
      if (isAsciiSpace(charCode)) {
        return CharacterType.SPACE;
      } else if (isAsciiAlpha(charCode) || isAsciiDigit(charCode) || charCode === 0x5f) {
        return CharacterType.ALPHA_LETTER;
      }

      return CharacterType.PUNCT;
    } else if (isThai(charCode)) {
      return CharacterType.THAI_LETTER;
    } else if (charCode === 0xa0) {
      return CharacterType.SPACE;
    }

    return CharacterType.ALPHA_LETTER;
  }

  if (isHan(charCode)) {
    return CharacterType.HAN_LETTER;
  } else if (isKatakana(charCode)) {
    return CharacterType.KATAKANA_LETTER;
  } else if (isHiragana(charCode)) {
    return CharacterType.HIRAGANA_LETTER;
  } else if (isHalfwidthKatakana(charCode)) {
    return CharacterType.HALFWIDTH_KATAKANA_LETTER;
  }

  return CharacterType.ALPHA_LETTER;
}

/***/ }),
/* 17 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isDestHashesEqual = isDestHashesEqual;
exports.isDestArraysEqual = isDestArraysEqual;
exports.PDFHistory = void 0;

var _ui_utils = __webpack_require__(2);

const HASH_CHANGE_TIMEOUT = 1000;
const POSITION_UPDATED_THRESHOLD = 50;
const UPDATE_VIEWAREA_TIMEOUT = 1000;

function getCurrentHash() {
  return document.location.hash;
}

class PDFHistory {
  constructor({
    linkService,
    eventBus
  }) {
    this.linkService = linkService;
    this.eventBus = eventBus || (0, _ui_utils.getGlobalEventBus)();
    this._initialized = false;
    this._fingerprint = "";
    this.reset();
    this._boundEvents = null;
    this._isViewerInPresentationMode = false;

    this.eventBus._on("presentationmodechanged", evt => {
      this._isViewerInPresentationMode = evt.active || evt.switchInProgress;
    });

    this.eventBus._on("pagesinit", () => {
      this._isPagesLoaded = false;

      const onPagesLoaded = evt => {
        this.eventBus._off("pagesloaded", onPagesLoaded);

        this._isPagesLoaded = !!evt.pagesCount;
      };

      this.eventBus._on("pagesloaded", onPagesLoaded);
    });
  }

  initialize({
    fingerprint,
    resetHistory = false,
    updateUrl = false
  }) {
    if (!fingerprint || typeof fingerprint !== "string") {
      console.error('PDFHistory.initialize: The "fingerprint" must be a non-empty string.');
      return;
    }

    if (this._initialized) {
      this.reset();
    }

    const reInitialized = this._fingerprint !== "" && this._fingerprint !== fingerprint;
    this._fingerprint = fingerprint;
    this._updateUrl = updateUrl === true;
    this._initialized = true;

    this._bindEvents();

    const state = window.history.state;
    this._popStateInProgress = false;
    this._blockHashChange = 0;
    this._currentHash = getCurrentHash();
    this._numPositionUpdates = 0;
    this._uid = this._maxUid = 0;
    this._destination = null;
    this._position = null;

    if (!this._isValidState(state, true) || resetHistory) {
      const {
        hash,
        page,
        rotation
      } = this._parseCurrentHash();

      if (!hash || reInitialized || resetHistory) {
        this._pushOrReplaceState(null, true);

        return;
      }

      this._pushOrReplaceState({
        hash,
        page,
        rotation
      }, true);

      return;
    }

    const destination = state.destination;

    this._updateInternalState(destination, state.uid, true);

    if (this._uid > this._maxUid) {
      this._maxUid = this._uid;
    }

    if (destination.rotation !== undefined) {
      this._initialRotation = destination.rotation;
    }

    if (destination.dest) {
      this._initialBookmark = JSON.stringify(destination.dest);
      this._destination.page = null;
    } else if (destination.hash) {
      this._initialBookmark = destination.hash;
    } else if (destination.page) {
      this._initialBookmark = `page=${destination.page}`;
    }
  }

  reset() {
    if (this._initialized) {
      this._pageHide();

      this._initialized = false;

      this._unbindEvents();
    }

    if (this._updateViewareaTimeout) {
      clearTimeout(this._updateViewareaTimeout);
      this._updateViewareaTimeout = null;
    }

    this._initialBookmark = null;
    this._initialRotation = null;
  }

  push({
    namedDest = null,
    explicitDest,
    pageNumber
  }) {
    if (!this._initialized) {
      return;
    }

    if (namedDest && typeof namedDest !== "string") {
      console.error("PDFHistory.push: " + `"${namedDest}" is not a valid namedDest parameter.`);
      return;
    } else if (!Array.isArray(explicitDest)) {
      console.error("PDFHistory.push: " + `"${explicitDest}" is not a valid explicitDest parameter.`);
      return;
    } else if (!(Number.isInteger(pageNumber) && pageNumber > 0 && pageNumber <= this.linkService.pagesCount)) {
      if (pageNumber !== null || this._destination) {
        console.error("PDFHistory.push: " + `"${pageNumber}" is not a valid pageNumber parameter.`);
        return;
      }
    }

    const hash = namedDest || JSON.stringify(explicitDest);

    if (!hash) {
      return;
    }

    let forceReplace = false;

    if (this._destination && (isDestHashesEqual(this._destination.hash, hash) || isDestArraysEqual(this._destination.dest, explicitDest))) {
      if (this._destination.page) {
        return;
      }

      forceReplace = true;
    }

    if (this._popStateInProgress && !forceReplace) {
      return;
    }

    this._pushOrReplaceState({
      dest: explicitDest,
      hash,
      page: pageNumber,
      rotation: this.linkService.rotation
    }, forceReplace);

    if (!this._popStateInProgress) {
      this._popStateInProgress = true;
      Promise.resolve().then(() => {
        this._popStateInProgress = false;
      });
    }
  }

  pushCurrentPosition() {
    if (!this._initialized || this._popStateInProgress) {
      return;
    }

    this._tryPushCurrentPosition();
  }

  back() {
    if (!this._initialized || this._popStateInProgress) {
      return;
    }

    const state = window.history.state;

    if (this._isValidState(state) && state.uid > 0) {
      window.history.back();
    }
  }

  forward() {
    if (!this._initialized || this._popStateInProgress) {
      return;
    }

    const state = window.history.state;

    if (this._isValidState(state) && state.uid < this._maxUid) {
      window.history.forward();
    }
  }

  get popStateInProgress() {
    return this._initialized && (this._popStateInProgress || this._blockHashChange > 0);
  }

  get initialBookmark() {
    return this._initialized ? this._initialBookmark : null;
  }

  get initialRotation() {
    return this._initialized ? this._initialRotation : null;
  }

  _pushOrReplaceState(destination, forceReplace = false) {
    const shouldReplace = forceReplace || !this._destination;
    const newState = {
      fingerprint: this._fingerprint,
      uid: shouldReplace ? this._uid : this._uid + 1,
      destination
    };

    this._updateInternalState(destination, newState.uid);

    let newUrl;

    if (this._updateUrl && destination && destination.hash) {
      const baseUrl = document.location.href.split("#")[0];

      if (!baseUrl.startsWith("file://")) {
        newUrl = `${baseUrl}#${destination.hash}`;
      }
    }

    if (shouldReplace) {
      window.history.replaceState(newState, "", newUrl);
    } else {
      this._maxUid = this._uid;
      window.history.pushState(newState, "", newUrl);
    }
  }

  _tryPushCurrentPosition(temporary = false) {
    if (!this._position) {
      return;
    }

    let position = this._position;

    if (temporary) {
      position = Object.assign(Object.create(null), this._position);
      position.temporary = true;
    }

    if (!this._destination) {
      this._pushOrReplaceState(position);

      return;
    }

    if (this._destination.temporary) {
      this._pushOrReplaceState(position, true);

      return;
    }

    if (this._destination.hash === position.hash) {
      return;
    }

    if (!this._destination.page && (POSITION_UPDATED_THRESHOLD <= 0 || this._numPositionUpdates <= POSITION_UPDATED_THRESHOLD)) {
      return;
    }

    let forceReplace = false;

    if (this._destination.page >= position.first && this._destination.page <= position.page) {
      if (this._destination.dest || !this._destination.first) {
        return;
      }

      forceReplace = true;
    }

    this._pushOrReplaceState(position, forceReplace);
  }

  _isValidState(state, checkReload = false) {
    if (!state) {
      return false;
    }

    if (state.fingerprint !== this._fingerprint) {
      if (checkReload) {
        if (typeof state.fingerprint !== "string" || state.fingerprint.length !== this._fingerprint.length) {
          return false;
        }

        const [perfEntry] = performance.getEntriesByType("navigation");

        if (!perfEntry || perfEntry.type !== "reload") {
          return false;
        }
      } else {
        return false;
      }
    }

    if (!Number.isInteger(state.uid) || state.uid < 0) {
      return false;
    }

    if (state.destination === null || typeof state.destination !== "object") {
      return false;
    }

    return true;
  }

  _updateInternalState(destination, uid, removeTemporary = false) {
    if (this._updateViewareaTimeout) {
      clearTimeout(this._updateViewareaTimeout);
      this._updateViewareaTimeout = null;
    }

    if (removeTemporary && destination && destination.temporary) {
      delete destination.temporary;
    }

    this._destination = destination;
    this._uid = uid;
    this._numPositionUpdates = 0;
  }

  _parseCurrentHash() {
    const hash = unescape(getCurrentHash()).substring(1);
    let page = (0, _ui_utils.parseQueryString)(hash).page | 0;

    if (!(Number.isInteger(page) && page > 0 && page <= this.linkService.pagesCount)) {
      page = null;
    }

    return {
      hash,
      page,
      rotation: this.linkService.rotation
    };
  }

  _updateViewarea({
    location
  }) {
    if (this._updateViewareaTimeout) {
      clearTimeout(this._updateViewareaTimeout);
      this._updateViewareaTimeout = null;
    }

    this._position = {
      hash: this._isViewerInPresentationMode ? `page=${location.pageNumber}` : location.pdfOpenParams.substring(1),
      page: this.linkService.page,
      first: location.pageNumber,
      rotation: location.rotation
    };

    if (this._popStateInProgress) {
      return;
    }

    if (POSITION_UPDATED_THRESHOLD > 0 && this._isPagesLoaded && this._destination && !this._destination.page) {
      this._numPositionUpdates++;
    }

    if (UPDATE_VIEWAREA_TIMEOUT > 0) {
      this._updateViewareaTimeout = setTimeout(() => {
        if (!this._popStateInProgress) {
          this._tryPushCurrentPosition(true);
        }

        this._updateViewareaTimeout = null;
      }, UPDATE_VIEWAREA_TIMEOUT);
    }
  }

  _popState({
    state
  }) {
    const newHash = getCurrentHash(),
          hashChanged = this._currentHash !== newHash;
    this._currentHash = newHash;

    if (!state) {
      this._uid++;

      const {
        hash,
        page,
        rotation
      } = this._parseCurrentHash();

      this._pushOrReplaceState({
        hash,
        page,
        rotation
      }, true);

      return;
    }

    if (!this._isValidState(state)) {
      return;
    }

    this._popStateInProgress = true;

    if (hashChanged) {
      this._blockHashChange++;
      (0, _ui_utils.waitOnEventOrTimeout)({
        target: window,
        name: "hashchange",
        delay: HASH_CHANGE_TIMEOUT
      }).then(() => {
        this._blockHashChange--;
      });
    }

    const destination = state.destination;

    this._updateInternalState(destination, state.uid, true);

    if (this._uid > this._maxUid) {
      this._maxUid = this._uid;
    }

    if ((0, _ui_utils.isValidRotation)(destination.rotation)) {
      this.linkService.rotation = destination.rotation;
    }

    if (destination.dest) {
      this.linkService.navigateTo(destination.dest);
    } else if (destination.hash) {
      this.linkService.setHash(destination.hash);
    } else if (destination.page) {
      this.linkService.page = destination.page;
    }

    Promise.resolve().then(() => {
      this._popStateInProgress = false;
    });
  }

  _pageHide() {
    if (!this._destination || this._destination.temporary) {
      this._tryPushCurrentPosition();
    }
  }

  _bindEvents() {
    if (this._boundEvents) {
      return;
    }

    this._boundEvents = {
      updateViewarea: this._updateViewarea.bind(this),
      popState: this._popState.bind(this),
      pageHide: this._pageHide.bind(this)
    };

    this.eventBus._on("updateviewarea", this._boundEvents.updateViewarea);

    window.addEventListener("popstate", this._boundEvents.popState);
    window.addEventListener("pagehide", this._boundEvents.pageHide);
  }

  _unbindEvents() {
    if (!this._boundEvents) {
      return;
    }

    this.eventBus._off("updateviewarea", this._boundEvents.updateViewarea);

    window.removeEventListener("popstate", this._boundEvents.popState);
    window.removeEventListener("pagehide", this._boundEvents.pageHide);
    this._boundEvents = null;
  }

}

exports.PDFHistory = PDFHistory;

function isDestHashesEqual(destHash, pushHash) {
  if (typeof destHash !== "string" || typeof pushHash !== "string") {
    return false;
  }

  if (destHash === pushHash) {
    return true;
  }

  const {
    nameddest
  } = (0, _ui_utils.parseQueryString)(destHash);

  if (nameddest === pushHash) {
    return true;
  }

  return false;
}

function isDestArraysEqual(firstDest, secondDest) {
  function isEntryEqual(first, second) {
    if (typeof first !== typeof second) {
      return false;
    }

    if (Array.isArray(first) || Array.isArray(second)) {
      return false;
    }

    if (first !== null && typeof first === "object" && second !== null) {
      if (Object.keys(first).length !== Object.keys(second).length) {
        return false;
      }

      for (const key in first) {
        if (!isEntryEqual(first[key], second[key])) {
          return false;
        }
      }

      return true;
    }

    return first === second || Number.isNaN(first) && Number.isNaN(second);
  }

  if (!(Array.isArray(firstDest) && Array.isArray(secondDest))) {
    return false;
  }

  if (firstDest.length !== secondDest.length) {
    return false;
  }

  for (let i = 0, ii = firstDest.length; i < ii; i++) {
    if (!isEntryEqual(firstDest[i], secondDest[i])) {
      return false;
    }
  }

  return true;
}

/***/ }),
/* 18 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SimpleLinkService = exports.PDFLinkService = void 0;

var _ui_utils = __webpack_require__(2);

class PDFLinkService {
  constructor({
    eventBus,
    externalLinkTarget = null,
    externalLinkRel = null,
    externalLinkEnabled = true,
    ignoreDestinationZoom = false
  } = {}) {
    this.eventBus = eventBus || (0, _ui_utils.getGlobalEventBus)();
    this.externalLinkTarget = externalLinkTarget;
    this.externalLinkRel = externalLinkRel;
    this.externalLinkEnabled = externalLinkEnabled;
    this._ignoreDestinationZoom = ignoreDestinationZoom;
    this.baseUrl = null;
    this.pdfDocument = null;
    this.pdfViewer = null;
    this.pdfHistory = null;
    this._pagesRefCache = null;
  }

  setDocument(pdfDocument, baseUrl = null) {
    this.baseUrl = baseUrl;
    this.pdfDocument = pdfDocument;
    this._pagesRefCache = Object.create(null);
  }

  setViewer(pdfViewer) {
    this.pdfViewer = pdfViewer;
  }

  setHistory(pdfHistory) {
    this.pdfHistory = pdfHistory;
  }

  get pagesCount() {
    return this.pdfDocument ? this.pdfDocument.numPages : 0;
  }

  get page() {
    return this.pdfViewer.currentPageNumber;
  }

  set page(value) {
    this.pdfViewer.currentPageNumber = value;
  }

  get rotation() {
    return this.pdfViewer.pagesRotation;
  }

  set rotation(value) {
    this.pdfViewer.pagesRotation = value;
  }

  navigateTo(dest) {
    const goToDestination = ({
      namedDest,
      explicitDest
    }) => {
      const destRef = explicitDest[0];
      let pageNumber;

      if (destRef instanceof Object) {
        pageNumber = this._cachedPageNumber(destRef);

        if (pageNumber === null) {
          this.pdfDocument.getPageIndex(destRef).then(pageIndex => {
            this.cachePageRef(pageIndex + 1, destRef);
            goToDestination({
              namedDest,
              explicitDest
            });
          }).catch(() => {
            console.error(`PDFLinkService.navigateTo: "${destRef}" is not ` + `a valid page reference, for dest="${dest}".`);
          });
          return;
        }
      } else if (Number.isInteger(destRef)) {
        pageNumber = destRef + 1;
      } else {
        console.error(`PDFLinkService.navigateTo: "${destRef}" is not ` + `a valid destination reference, for dest="${dest}".`);
        return;
      }

      if (!pageNumber || pageNumber < 1 || pageNumber > this.pagesCount) {
        console.error(`PDFLinkService.navigateTo: "${pageNumber}" is not ` + `a valid page number, for dest="${dest}".`);
        return;
      }

      if (this.pdfHistory) {
        this.pdfHistory.pushCurrentPosition();
        this.pdfHistory.push({
          namedDest,
          explicitDest,
          pageNumber
        });
      }

      this.pdfViewer.scrollPageIntoView({
        pageNumber,
        destArray: explicitDest,
        ignoreDestinationZoom: this._ignoreDestinationZoom
      });
    };

    new Promise((resolve, reject) => {
      if (typeof dest === "string") {
        this.pdfDocument.getDestination(dest).then(destArray => {
          resolve({
            namedDest: dest,
            explicitDest: destArray
          });
        });
        return;
      }

      resolve({
        namedDest: "",
        explicitDest: dest
      });
    }).then(data => {
      if (!Array.isArray(data.explicitDest)) {
        console.error(`PDFLinkService.navigateTo: "${data.explicitDest}" is` + ` not a valid destination array, for dest="${dest}".`);
        return;
      }

      goToDestination(data);
    });
  }

  getDestinationHash(dest) {
    if (typeof dest === "string") {
      return this.getAnchorUrl("#" + escape(dest));
    }

    if (Array.isArray(dest)) {
      const str = JSON.stringify(dest);
      return this.getAnchorUrl("#" + escape(str));
    }

    return this.getAnchorUrl("");
  }

  getAnchorUrl(anchor) {
    return (this.baseUrl || "") + anchor;
  }

  setHash(hash) {
    let pageNumber, dest;

    if (hash.includes("=")) {
      const params = (0, _ui_utils.parseQueryString)(hash);

      if ("search" in params) {
        this.eventBus.dispatch("findfromurlhash", {
          source: this,
          query: params["search"].replace(/"/g, ""),
          phraseSearch: params["phrase"] === "true"
        });
      }

      if ("nameddest" in params) {
        this.navigateTo(params.nameddest);
        return;
      }

      if ("page" in params) {
        pageNumber = params.page | 0 || 1;
      }

      if ("zoom" in params) {
        const zoomArgs = params.zoom.split(",");
        const zoomArg = zoomArgs[0];
        const zoomArgNumber = parseFloat(zoomArg);

        if (!zoomArg.includes("Fit")) {
          dest = [null, {
            name: "XYZ"
          }, zoomArgs.length > 1 ? zoomArgs[1] | 0 : null, zoomArgs.length > 2 ? zoomArgs[2] | 0 : null, zoomArgNumber ? zoomArgNumber / 100 : zoomArg];
        } else {
          if (zoomArg === "Fit" || zoomArg === "FitB") {
            dest = [null, {
              name: zoomArg
            }];
          } else if (zoomArg === "FitH" || zoomArg === "FitBH" || zoomArg === "FitV" || zoomArg === "FitBV") {
            dest = [null, {
              name: zoomArg
            }, zoomArgs.length > 1 ? zoomArgs[1] | 0 : null];
          } else if (zoomArg === "FitR") {
            if (zoomArgs.length !== 5) {
              console.error('PDFLinkService.setHash: Not enough parameters for "FitR".');
            } else {
              dest = [null, {
                name: zoomArg
              }, zoomArgs[1] | 0, zoomArgs[2] | 0, zoomArgs[3] | 0, zoomArgs[4] | 0];
            }
          } else {
            console.error(`PDFLinkService.setHash: "${zoomArg}" is not ` + "a valid zoom value.");
          }
        }
      }

      if (dest) {
        this.pdfViewer.scrollPageIntoView({
          pageNumber: pageNumber || this.page,
          destArray: dest,
          allowNegativeOffset: true
        });
      } else if (pageNumber) {
        this.page = pageNumber;
      }

      if ("pagemode" in params) {
        this.eventBus.dispatch("pagemode", {
          source: this,
          mode: params.pagemode
        });
      }
    } else {
      dest = unescape(hash);

      try {
        dest = JSON.parse(dest);

        if (!Array.isArray(dest)) {
          dest = dest.toString();
        }
      } catch (ex) {}

      if (typeof dest === "string" || isValidExplicitDestination(dest)) {
        this.navigateTo(dest);
        return;
      }

      console.error(`PDFLinkService.setHash: "${unescape(hash)}" is not ` + "a valid destination.");
    }
  }

  executeNamedAction(action) {
    switch (action) {
      case "GoBack":
        if (this.pdfHistory) {
          this.pdfHistory.back();
        }

        break;

      case "GoForward":
        if (this.pdfHistory) {
          this.pdfHistory.forward();
        }

        break;

      case "NextPage":
        if (this.page < this.pagesCount) {
          this.page++;
        }

        break;

      case "PrevPage":
        if (this.page > 1) {
          this.page--;
        }

        break;

      case "LastPage":
        this.page = this.pagesCount;
        break;

      case "FirstPage":
        this.page = 1;
        break;

      default:
        break;
    }

    this.eventBus.dispatch("namedaction", {
      source: this,
      action
    });
  }

  cachePageRef(pageNum, pageRef) {
    if (!pageRef) {
      return;
    }

    const refStr = pageRef.gen === 0 ? `${pageRef.num}R` : `${pageRef.num}R${pageRef.gen}`;
    this._pagesRefCache[refStr] = pageNum;
  }

  _cachedPageNumber(pageRef) {
    const refStr = pageRef.gen === 0 ? `${pageRef.num}R` : `${pageRef.num}R${pageRef.gen}`;
    return this._pagesRefCache && this._pagesRefCache[refStr] || null;
  }

  isPageVisible(pageNumber) {
    return this.pdfViewer.isPageVisible(pageNumber);
  }

}

exports.PDFLinkService = PDFLinkService;

function isValidExplicitDestination(dest) {
  if (!Array.isArray(dest)) {
    return false;
  }

  const destLength = dest.length;

  if (destLength < 2) {
    return false;
  }

  const page = dest[0];

  if (!(typeof page === "object" && Number.isInteger(page.num) && Number.isInteger(page.gen)) && !(Number.isInteger(page) && page >= 0)) {
    return false;
  }

  const zoom = dest[1];

  if (!(typeof zoom === "object" && typeof zoom.name === "string")) {
    return false;
  }

  let allowNull = true;

  switch (zoom.name) {
    case "XYZ":
      if (destLength !== 5) {
        return false;
      }

      break;

    case "Fit":
    case "FitB":
      return destLength === 2;

    case "FitH":
    case "FitBH":
    case "FitV":
    case "FitBV":
      if (destLength !== 3) {
        return false;
      }

      break;

    case "FitR":
      if (destLength !== 6) {
        return false;
      }

      allowNull = false;
      break;

    default:
      return false;
  }

  for (let i = 2; i < destLength; i++) {
    const param = dest[i];

    if (!(typeof param === "number" || allowNull && param === null)) {
      return false;
    }
  }

  return true;
}

class SimpleLinkService {
  constructor() {
    this.externalLinkTarget = null;
    this.externalLinkRel = null;
    this.externalLinkEnabled = true;
    this._ignoreDestinationZoom = false;
  }

  get pagesCount() {
    return 0;
  }

  get page() {
    return 0;
  }

  set page(value) {}

  get rotation() {
    return 0;
  }

  set rotation(value) {}

  navigateTo(dest) {}

  getDestinationHash(dest) {
    return "#";
  }

  getAnchorUrl(hash) {
    return "#";
  }

  setHash(hash) {}

  executeNamedAction(action) {}

  cachePageRef(pageNum, pageRef) {}

  isPageVisible(pageNumber) {
    return true;
  }

}

exports.SimpleLinkService = SimpleLinkService;

/***/ }),
/* 19 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFOutlineViewer = void 0;

var _pdfjsLib = __webpack_require__(4);

const DEFAULT_TITLE = "\u2013";

class PDFOutlineViewer {
  constructor({
    container,
    linkService,
    eventBus
  }) {
    this.container = container;
    this.linkService = linkService;
    this.eventBus = eventBus;
    this.reset();

    eventBus._on("toggleoutlinetree", this.toggleOutlineTree.bind(this));
  }

  reset() {
    this.outline = null;
    this.lastToggleIsShow = true;
    this.container.textContent = "";
    this.container.classList.remove("outlineWithDeepNesting");
  }

  _dispatchEvent(outlineCount) {
    this.eventBus.dispatch("outlineloaded", {
      source: this,
      outlineCount
    });
  }

  _bindLink(element, {
    url,
    newWindow,
    dest
  }) {
    const {
      linkService
    } = this;

    if (url) {
      (0, _pdfjsLib.addLinkAttributes)(element, {
        url,
        target: newWindow ? _pdfjsLib.LinkTarget.BLANK : linkService.externalLinkTarget,
        rel: linkService.externalLinkRel,
        enabled: linkService.externalLinkEnabled
      });
      return;
    }

    element.href = linkService.getDestinationHash(dest);

    element.onclick = () => {
      if (dest) {
        linkService.navigateTo(dest);
      }

      return false;
    };
  }

  _setStyles(element, {
    bold,
    italic
  }) {
    if (bold) {
      element.style.fontWeight = "bold";
    }

    if (italic) {
      element.style.fontStyle = "italic";
    }
  }

  _addToggleButton(div, {
    count,
    items
  }) {
    const toggler = document.createElement("div");
    toggler.className = "outlineItemToggler";

    if (count < 0 && Math.abs(count) === items.length) {
      toggler.classList.add("outlineItemsHidden");
    }

    toggler.onclick = evt => {
      evt.stopPropagation();
      toggler.classList.toggle("outlineItemsHidden");

      if (evt.shiftKey) {
        const shouldShowAll = !toggler.classList.contains("outlineItemsHidden");

        this._toggleOutlineItem(div, shouldShowAll);
      }
    };

    div.insertBefore(toggler, div.firstChild);
  }

  _toggleOutlineItem(root, show = false) {
    this.lastToggleIsShow = show;

    for (const toggler of root.querySelectorAll(".outlineItemToggler")) {
      toggler.classList.toggle("outlineItemsHidden", !show);
    }
  }

  toggleOutlineTree() {
    if (!this.outline) {
      return;
    }

    this._toggleOutlineItem(this.container, !this.lastToggleIsShow);
  }

  render({
    outline
  }) {
    let outlineCount = 0;

    if (this.outline) {
      this.reset();
    }

    this.outline = outline || null;

    if (!outline) {
      this._dispatchEvent(outlineCount);

      return;
    }

    const fragment = document.createDocumentFragment();
    const queue = [{
      parent: fragment,
      items: this.outline
    }];
    let hasAnyNesting = false;

    while (queue.length > 0) {
      const levelData = queue.shift();

      for (const item of levelData.items) {
        const div = document.createElement("div");
        div.className = "outlineItem";
        const element = document.createElement("a");

        this._bindLink(element, item);

        this._setStyles(element, item);

        element.textContent = (0, _pdfjsLib.removeNullCharacters)(item.title) || DEFAULT_TITLE;
        div.appendChild(element);

        if (item.items.length > 0) {
          hasAnyNesting = true;

          this._addToggleButton(div, item);

          const itemsDiv = document.createElement("div");
          itemsDiv.className = "outlineItems";
          div.appendChild(itemsDiv);
          queue.push({
            parent: itemsDiv,
            items: item.items
          });
        }

        levelData.parent.appendChild(div);
        outlineCount++;
      }
    }

    if (hasAnyNesting) {
      this.container.classList.add("outlineWithDeepNesting");
      this.lastToggleIsShow = fragment.querySelectorAll(".outlineItemsHidden").length === 0;
    }

    this.container.appendChild(fragment);

    this._dispatchEvent(outlineCount);
  }

}

exports.PDFOutlineViewer = PDFOutlineViewer;

/***/ }),
/* 20 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFPresentationMode = void 0;

var _ui_utils = __webpack_require__(2);

const DELAY_BEFORE_RESETTING_SWITCH_IN_PROGRESS = 1500;
const DELAY_BEFORE_HIDING_CONTROLS = 3000;
const ACTIVE_SELECTOR = "pdfPresentationMode";
const CONTROLS_SELECTOR = "pdfPresentationModeControls";
const MOUSE_SCROLL_COOLDOWN_TIME = 50;
const PAGE_SWITCH_THRESHOLD = 0.1;
const SWIPE_MIN_DISTANCE_THRESHOLD = 50;
const SWIPE_ANGLE_THRESHOLD = Math.PI / 6;

class PDFPresentationMode {
  constructor({
    container,
    pdfViewer,
    eventBus,
    contextMenuItems = null
  }) {
    this.container = container;
    this.pdfViewer = pdfViewer;
    this.eventBus = eventBus;
    this.active = false;
    this.args = null;
    this.contextMenuOpen = false;
    this.mouseScrollTimeStamp = 0;
    this.mouseScrollDelta = 0;
    this.touchSwipeState = null;

    if (contextMenuItems) {
      contextMenuItems.contextFirstPage.addEventListener("click", () => {
        this.contextMenuOpen = false;
        this.eventBus.dispatch("firstpage", {
          source: this
        });
      });
      contextMenuItems.contextLastPage.addEventListener("click", () => {
        this.contextMenuOpen = false;
        this.eventBus.dispatch("lastpage", {
          source: this
        });
      });
      contextMenuItems.contextPageRotateCw.addEventListener("click", () => {
        this.contextMenuOpen = false;
        this.eventBus.dispatch("rotatecw", {
          source: this
        });
      });
      contextMenuItems.contextPageRotateCcw.addEventListener("click", () => {
        this.contextMenuOpen = false;
        this.eventBus.dispatch("rotateccw", {
          source: this
        });
      });
    }
  }

  request() {
    if (this.switchInProgress || this.active || !this.pdfViewer.pagesCount) {
      return false;
    }

    this._addFullscreenChangeListeners();

    this._setSwitchInProgress();

    this._notifyStateChange();

    if (this.container.requestFullscreen) {
      this.container.requestFullscreen();
    } else if (this.container.mozRequestFullScreen) {
      this.container.mozRequestFullScreen();
    } else if (this.container.webkitRequestFullscreen) {
      this.container.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
    } else if (this.container.msRequestFullscreen) {
      this.container.msRequestFullscreen();
    } else {
      return false;
    }

    this.args = {
      page: this.pdfViewer.currentPageNumber,
      previousScale: this.pdfViewer.currentScaleValue
    };
    return true;
  }

  _mouseWheel(evt) {
    if (!this.active) {
      return;
    }

    evt.preventDefault();
    const delta = (0, _ui_utils.normalizeWheelEventDelta)(evt);
    const currentTime = new Date().getTime();
    const storedTime = this.mouseScrollTimeStamp;

    if (currentTime > storedTime && currentTime - storedTime < MOUSE_SCROLL_COOLDOWN_TIME) {
      return;
    }

    if (this.mouseScrollDelta > 0 && delta < 0 || this.mouseScrollDelta < 0 && delta > 0) {
      this._resetMouseScrollState();
    }

    this.mouseScrollDelta += delta;

    if (Math.abs(this.mouseScrollDelta) >= PAGE_SWITCH_THRESHOLD) {
      const totalDelta = this.mouseScrollDelta;

      this._resetMouseScrollState();

      const success = totalDelta > 0 ? this._goToPreviousPage() : this._goToNextPage();

      if (success) {
        this.mouseScrollTimeStamp = currentTime;
      }
    }
  }

  get isFullscreen() {
    return !!(document.fullscreenElement || document.mozFullScreen || document.webkitIsFullScreen || document.msFullscreenElement);
  }

  _goToPreviousPage() {
    const page = this.pdfViewer.currentPageNumber;

    if (page <= 1) {
      return false;
    }

    this.pdfViewer.currentPageNumber = page - 1;
    return true;
  }

  _goToNextPage() {
    const page = this.pdfViewer.currentPageNumber;

    if (page >= this.pdfViewer.pagesCount) {
      return false;
    }

    this.pdfViewer.currentPageNumber = page + 1;
    return true;
  }

  _notifyStateChange() {
    this.eventBus.dispatch("presentationmodechanged", {
      source: this,
      active: this.active,
      switchInProgress: !!this.switchInProgress
    });
  }

  _setSwitchInProgress() {
    if (this.switchInProgress) {
      clearTimeout(this.switchInProgress);
    }

    this.switchInProgress = setTimeout(() => {
      this._removeFullscreenChangeListeners();

      delete this.switchInProgress;

      this._notifyStateChange();
    }, DELAY_BEFORE_RESETTING_SWITCH_IN_PROGRESS);
  }

  _resetSwitchInProgress() {
    if (this.switchInProgress) {
      clearTimeout(this.switchInProgress);
      delete this.switchInProgress;
    }
  }

  _enter() {
    this.active = true;

    this._resetSwitchInProgress();

    this._notifyStateChange();

    this.container.classList.add(ACTIVE_SELECTOR);
    setTimeout(() => {
      this.pdfViewer.currentPageNumber = this.args.page;
      this.pdfViewer.currentScaleValue = "page-fit";
    }, 0);

    this._addWindowListeners();

    this._showControls();

    this.contextMenuOpen = false;
    this.container.setAttribute("contextmenu", "viewerContextMenu");
    window.getSelection().removeAllRanges();
  }

  _exit() {
    const page = this.pdfViewer.currentPageNumber;
    this.container.classList.remove(ACTIVE_SELECTOR);
    setTimeout(() => {
      this.active = false;

      this._removeFullscreenChangeListeners();

      this._notifyStateChange();

      this.pdfViewer.currentScaleValue = this.args.previousScale;
      this.pdfViewer.currentPageNumber = page;
      this.args = null;
    }, 0);

    this._removeWindowListeners();

    this._hideControls();

    this._resetMouseScrollState();

    this.container.removeAttribute("contextmenu");
    this.contextMenuOpen = false;
  }

  _mouseDown(evt) {
    if (this.contextMenuOpen) {
      this.contextMenuOpen = false;
      evt.preventDefault();
      return;
    }

    if (evt.button === 0) {
      const isInternalLink = evt.target.href && evt.target.classList.contains("internalLink");

      if (!isInternalLink) {
        evt.preventDefault();

        if (evt.shiftKey) {
          this._goToPreviousPage();
        } else {
          this._goToNextPage();
        }
      }
    }
  }

  _contextMenu() {
    this.contextMenuOpen = true;
  }

  _showControls() {
    if (this.controlsTimeout) {
      clearTimeout(this.controlsTimeout);
    } else {
      this.container.classList.add(CONTROLS_SELECTOR);
    }

    this.controlsTimeout = setTimeout(() => {
      this.container.classList.remove(CONTROLS_SELECTOR);
      delete this.controlsTimeout;
    }, DELAY_BEFORE_HIDING_CONTROLS);
  }

  _hideControls() {
    if (!this.controlsTimeout) {
      return;
    }

    clearTimeout(this.controlsTimeout);
    this.container.classList.remove(CONTROLS_SELECTOR);
    delete this.controlsTimeout;
  }

  _resetMouseScrollState() {
    this.mouseScrollTimeStamp = 0;
    this.mouseScrollDelta = 0;
  }

  _touchSwipe(evt) {
    if (!this.active) {
      return;
    }

    if (evt.touches.length > 1) {
      this.touchSwipeState = null;
      return;
    }

    switch (evt.type) {
      case "touchstart":
        this.touchSwipeState = {
          startX: evt.touches[0].pageX,
          startY: evt.touches[0].pageY,
          endX: evt.touches[0].pageX,
          endY: evt.touches[0].pageY
        };
        break;

      case "touchmove":
        if (this.touchSwipeState === null) {
          return;
        }

        this.touchSwipeState.endX = evt.touches[0].pageX;
        this.touchSwipeState.endY = evt.touches[0].pageY;
        evt.preventDefault();
        break;

      case "touchend":
        if (this.touchSwipeState === null) {
          return;
        }

        let delta = 0;
        const dx = this.touchSwipeState.endX - this.touchSwipeState.startX;
        const dy = this.touchSwipeState.endY - this.touchSwipeState.startY;
        const absAngle = Math.abs(Math.atan2(dy, dx));

        if (Math.abs(dx) > SWIPE_MIN_DISTANCE_THRESHOLD && (absAngle <= SWIPE_ANGLE_THRESHOLD || absAngle >= Math.PI - SWIPE_ANGLE_THRESHOLD)) {
          delta = dx;
        } else if (Math.abs(dy) > SWIPE_MIN_DISTANCE_THRESHOLD && Math.abs(absAngle - Math.PI / 2) <= SWIPE_ANGLE_THRESHOLD) {
          delta = dy;
        }

        if (delta > 0) {
          this._goToPreviousPage();
        } else if (delta < 0) {
          this._goToNextPage();
        }

        break;
    }
  }

  _addWindowListeners() {
    this.showControlsBind = this._showControls.bind(this);
    this.mouseDownBind = this._mouseDown.bind(this);
    this.mouseWheelBind = this._mouseWheel.bind(this);
    this.resetMouseScrollStateBind = this._resetMouseScrollState.bind(this);
    this.contextMenuBind = this._contextMenu.bind(this);
    this.touchSwipeBind = this._touchSwipe.bind(this);
    window.addEventListener("mousemove", this.showControlsBind);
    window.addEventListener("mousedown", this.mouseDownBind);
    window.addEventListener("wheel", this.mouseWheelBind);
    window.addEventListener("keydown", this.resetMouseScrollStateBind);
    window.addEventListener("contextmenu", this.contextMenuBind);
    window.addEventListener("touchstart", this.touchSwipeBind);
    window.addEventListener("touchmove", this.touchSwipeBind);
    window.addEventListener("touchend", this.touchSwipeBind);
  }

  _removeWindowListeners() {
    window.removeEventListener("mousemove", this.showControlsBind);
    window.removeEventListener("mousedown", this.mouseDownBind);
    window.removeEventListener("wheel", this.mouseWheelBind);
    window.removeEventListener("keydown", this.resetMouseScrollStateBind);
    window.removeEventListener("contextmenu", this.contextMenuBind);
    window.removeEventListener("touchstart", this.touchSwipeBind);
    window.removeEventListener("touchmove", this.touchSwipeBind);
    window.removeEventListener("touchend", this.touchSwipeBind);
    delete this.showControlsBind;
    delete this.mouseDownBind;
    delete this.mouseWheelBind;
    delete this.resetMouseScrollStateBind;
    delete this.contextMenuBind;
    delete this.touchSwipeBind;
  }

  _fullscreenChange() {
    if (this.isFullscreen) {
      this._enter();
    } else {
      this._exit();
    }
  }

  _addFullscreenChangeListeners() {
    this.fullscreenChangeBind = this._fullscreenChange.bind(this);
    window.addEventListener("fullscreenchange", this.fullscreenChangeBind);
    window.addEventListener("mozfullscreenchange", this.fullscreenChangeBind);
    window.addEventListener("webkitfullscreenchange", this.fullscreenChangeBind);
    window.addEventListener("MSFullscreenChange", this.fullscreenChangeBind);
  }

  _removeFullscreenChangeListeners() {
    window.removeEventListener("fullscreenchange", this.fullscreenChangeBind);
    window.removeEventListener("mozfullscreenchange", this.fullscreenChangeBind);
    window.removeEventListener("webkitfullscreenchange", this.fullscreenChangeBind);
    window.removeEventListener("MSFullscreenChange", this.fullscreenChangeBind);
    delete this.fullscreenChangeBind;
  }

}

exports.PDFPresentationMode = PDFPresentationMode;

/***/ }),
/* 21 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFSidebarResizer = void 0;

var _ui_utils = __webpack_require__(2);

const SIDEBAR_WIDTH_VAR = "--sidebar-width";
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_RESIZING_CLASS = "sidebarResizing";

class PDFSidebarResizer {
  constructor(options, eventBus, l10n = _ui_utils.NullL10n) {
    this.enabled = false;
    this.isRTL = false;
    this.sidebarOpen = false;
    this.doc = document.documentElement;
    this._width = null;
    this._outerContainerWidth = null;
    this._boundEvents = Object.create(null);
    this.outerContainer = options.outerContainer;
    this.resizer = options.resizer;
    this.eventBus = eventBus;
    this.l10n = l10n;

    if (typeof CSS === "undefined" || typeof CSS.supports !== "function" || !CSS.supports(SIDEBAR_WIDTH_VAR, `calc(-1 * ${SIDEBAR_MIN_WIDTH}px)`)) {
      console.warn("PDFSidebarResizer: " + "The browser does not support resizing of the sidebar.");
      return;
    }

    this.enabled = true;
    this.resizer.classList.remove("hidden");
    this.l10n.getDirection().then(dir => {
      this.isRTL = dir === "rtl";
    });

    this._addEventListeners();
  }

  get outerContainerWidth() {
    if (!this._outerContainerWidth) {
      this._outerContainerWidth = this.outerContainer.clientWidth;
    }

    return this._outerContainerWidth;
  }

  _updateWidth(width = 0) {
    if (!this.enabled) {
      return false;
    }

    const newWidth = (0, _ui_utils.clamp)(width, SIDEBAR_MIN_WIDTH, Math.floor(this.outerContainerWidth / 2));

    if (newWidth === this._width) {
      return false;
    }

    this._width = newWidth;
    this.doc.style.setProperty(SIDEBAR_WIDTH_VAR, `${newWidth}px`);
    return true;
  }

  _mouseMove(evt) {
    let width = evt.clientX;

    if (this.isRTL) {
      width = this.outerContainerWidth - width;
    }

    this._updateWidth(width);
  }

  _mouseUp(evt) {
    this.outerContainer.classList.remove(SIDEBAR_RESIZING_CLASS);
    this.eventBus.dispatch("resize", {
      source: this
    });
    const _boundEvents = this._boundEvents;
    window.removeEventListener("mousemove", _boundEvents.mouseMove);
    window.removeEventListener("mouseup", _boundEvents.mouseUp);
  }

  _addEventListeners() {
    if (!this.enabled) {
      return;
    }

    const _boundEvents = this._boundEvents;
    _boundEvents.mouseMove = this._mouseMove.bind(this);
    _boundEvents.mouseUp = this._mouseUp.bind(this);
    this.resizer.addEventListener("mousedown", evt => {
      if (evt.button !== 0) {
        return;
      }

      this.outerContainer.classList.add(SIDEBAR_RESIZING_CLASS);
      window.addEventListener("mousemove", _boundEvents.mouseMove);
      window.addEventListener("mouseup", _boundEvents.mouseUp);
    });

    this.eventBus._on("sidebarviewchanged", evt => {
      this.sidebarOpen = !!(evt && evt.view);
    });

    this.eventBus._on("resize", evt => {
      if (!evt || evt.source !== window) {
        return;
      }

      this._outerContainerWidth = null;

      if (!this._width) {
        return;
      }

      if (!this.sidebarOpen) {
        this._updateWidth(this._width);

        return;
      }

      this.outerContainer.classList.add(SIDEBAR_RESIZING_CLASS);

      const updated = this._updateWidth(this._width);

      Promise.resolve().then(() => {
        this.outerContainer.classList.remove(SIDEBAR_RESIZING_CLASS);

        if (updated) {
          this.eventBus.dispatch("resize", {
            source: this
          });
        }
      });
    });
  }

}

exports.PDFSidebarResizer = PDFSidebarResizer;

/***/ }),
/* 22 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFThumbnailViewer = void 0;

var _ui_utils = __webpack_require__(2);

var _pdf_thumbnail_view = __webpack_require__(23);

const THUMBNAIL_SCROLL_MARGIN = -19;
const THUMBNAIL_SELECTED_CLASS = "selected";

class PDFThumbnailViewer {
  constructor({
    container,
    linkService,
    renderingQueue,
    l10n = _ui_utils.NullL10n
  }) {
    this.container = container;
    this.linkService = linkService;
    this.renderingQueue = renderingQueue;
    this.l10n = l10n;
    this.scroll = (0, _ui_utils.watchScroll)(this.container, this._scrollUpdated.bind(this));

    this._resetView();
  }

  _scrollUpdated() {
    this.renderingQueue.renderHighestPriority();
  }

  getThumbnail(index) {
    return this._thumbnails[index];
  }

  _getVisibleThumbs() {
    return (0, _ui_utils.getVisibleElements)(this.container, this._thumbnails);
  }

  scrollThumbnailIntoView(pageNumber) {
    if (!this.pdfDocument) {
      return;
    }

    const thumbnailView = this._thumbnails[pageNumber - 1];

    if (!thumbnailView) {
      console.error('scrollThumbnailIntoView: Invalid "pageNumber" parameter.');
      return;
    }

    if (pageNumber !== this._currentPageNumber) {
      const prevThumbnailView = this._thumbnails[this._currentPageNumber - 1];
      prevThumbnailView.div.classList.remove(THUMBNAIL_SELECTED_CLASS);
      thumbnailView.div.classList.add(THUMBNAIL_SELECTED_CLASS);
    }

    const visibleThumbs = this._getVisibleThumbs();

    const numVisibleThumbs = visibleThumbs.views.length;

    if (numVisibleThumbs > 0) {
      const first = visibleThumbs.first.id;
      const last = numVisibleThumbs > 1 ? visibleThumbs.last.id : first;
      let shouldScroll = false;

      if (pageNumber <= first || pageNumber >= last) {
        shouldScroll = true;
      } else {
        visibleThumbs.views.some(function (view) {
          if (view.id !== pageNumber) {
            return false;
          }

          shouldScroll = view.percent < 100;
          return true;
        });
      }

      if (shouldScroll) {
        (0, _ui_utils.scrollIntoView)(thumbnailView.div, {
          top: THUMBNAIL_SCROLL_MARGIN
        });
      }
    }

    this._currentPageNumber = pageNumber;
  }

  get pagesRotation() {
    return this._pagesRotation;
  }

  set pagesRotation(rotation) {
    if (!(0, _ui_utils.isValidRotation)(rotation)) {
      throw new Error("Invalid thumbnails rotation angle.");
    }

    if (!this.pdfDocument) {
      return;
    }

    if (this._pagesRotation === rotation) {
      return;
    }

    this._pagesRotation = rotation;

    for (let i = 0, ii = this._thumbnails.length; i < ii; i++) {
      this._thumbnails[i].update(rotation);
    }
  }

  cleanup() {
    _pdf_thumbnail_view.PDFThumbnailView.cleanup();
  }

  _resetView() {
    this._thumbnails = [];
    this._currentPageNumber = 1;
    this._pageLabels = null;
    this._pagesRotation = 0;
    this._pagesRequests = new WeakMap();
    this.container.textContent = "";
  }

  setDocument(pdfDocument) {
    if (this.pdfDocument) {
      this._cancelRendering();

      this._resetView();
    }

    this.pdfDocument = pdfDocument;

    if (!pdfDocument) {
      return;
    }

    pdfDocument.getPage(1).then(firstPdfPage => {
      const pagesCount = pdfDocument.numPages;
      const viewport = firstPdfPage.getViewport({
        scale: 1
      });

      for (let pageNum = 1; pageNum <= pagesCount; ++pageNum) {
        const thumbnail = new _pdf_thumbnail_view.PDFThumbnailView({
          container: this.container,
          id: pageNum,
          defaultViewport: viewport.clone(),
          linkService: this.linkService,
          renderingQueue: this.renderingQueue,
          disableCanvasToImageConversion: false,
          l10n: this.l10n
        });

        this._thumbnails.push(thumbnail);
      }

      const firstThumbnailView = this._thumbnails[0];

      if (firstThumbnailView) {
        firstThumbnailView.setPdfPage(firstPdfPage);
      }

      const thumbnailView = this._thumbnails[this._currentPageNumber - 1];
      thumbnailView.div.classList.add(THUMBNAIL_SELECTED_CLASS);
    }).catch(reason => {
      console.error("Unable to initialize thumbnail viewer", reason);
    });
  }

  _cancelRendering() {
    for (let i = 0, ii = this._thumbnails.length; i < ii; i++) {
      if (this._thumbnails[i]) {
        this._thumbnails[i].cancelRendering();
      }
    }
  }

  setPageLabels(labels) {
    if (!this.pdfDocument) {
      return;
    }

    if (!labels) {
      this._pageLabels = null;
    } else if (!(Array.isArray(labels) && this.pdfDocument.numPages === labels.length)) {
      this._pageLabels = null;
      console.error("PDFThumbnailViewer_setPageLabels: Invalid page labels.");
    } else {
      this._pageLabels = labels;
    }

    for (let i = 0, ii = this._thumbnails.length; i < ii; i++) {
      const label = this._pageLabels && this._pageLabels[i];

      this._thumbnails[i].setPageLabel(label);
    }
  }

  _ensurePdfPageLoaded(thumbView) {
    if (thumbView.pdfPage) {
      return Promise.resolve(thumbView.pdfPage);
    }

    if (this._pagesRequests.has(thumbView)) {
      return this._pagesRequests.get(thumbView);
    }

    const promise = this.pdfDocument.getPage(thumbView.id).then(pdfPage => {
      if (!thumbView.pdfPage) {
        thumbView.setPdfPage(pdfPage);
      }

      this._pagesRequests.delete(thumbView);

      return pdfPage;
    }).catch(reason => {
      console.error("Unable to get page for thumb view", reason);

      this._pagesRequests.delete(thumbView);
    });

    this._pagesRequests.set(thumbView, promise);

    return promise;
  }

  forceRendering() {
    const visibleThumbs = this._getVisibleThumbs();

    const thumbView = this.renderingQueue.getHighestPriority(visibleThumbs, this._thumbnails, this.scroll.down);

    if (thumbView) {
      this._ensurePdfPageLoaded(thumbView).then(() => {
        this.renderingQueue.renderView(thumbView);
      });

      return true;
    }

    return false;
  }

}

exports.PDFThumbnailViewer = PDFThumbnailViewer;

/***/ }),
/* 23 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFThumbnailView = void 0;

var _pdfjsLib = __webpack_require__(4);

var _ui_utils = __webpack_require__(2);

var _pdf_rendering_queue = __webpack_require__(8);

const MAX_NUM_SCALING_STEPS = 3;
const THUMBNAIL_CANVAS_BORDER_WIDTH = 1;
const THUMBNAIL_WIDTH = 98;

const TempImageFactory = function TempImageFactoryClosure() {
  let tempCanvasCache = null;
  return {
    getCanvas(width, height) {
      let tempCanvas = tempCanvasCache;

      if (!tempCanvas) {
        tempCanvas = document.createElement("canvas");
        tempCanvasCache = tempCanvas;
      }

      tempCanvas.width = width;
      tempCanvas.height = height;
      tempCanvas.mozOpaque = true;
      const ctx = tempCanvas.getContext("2d", {
        alpha: false
      });
      ctx.save();
      ctx.fillStyle = "rgb(255, 255, 255)";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
      return tempCanvas;
    },

    destroyCanvas() {
      const tempCanvas = tempCanvasCache;

      if (tempCanvas) {
        tempCanvas.width = 0;
        tempCanvas.height = 0;
      }

      tempCanvasCache = null;
    }

  };
}();

class PDFThumbnailView {
  constructor({
    container,
    id,
    defaultViewport,
    linkService,
    renderingQueue,
    disableCanvasToImageConversion = false,
    l10n = _ui_utils.NullL10n
  }) {
    this.id = id;
    this.renderingId = "thumbnail" + id;
    this.pageLabel = null;
    this.pdfPage = null;
    this.rotation = 0;
    this.viewport = defaultViewport;
    this.pdfPageRotate = defaultViewport.rotation;
    this.linkService = linkService;
    this.renderingQueue = renderingQueue;
    this.renderTask = null;
    this.renderingState = _pdf_rendering_queue.RenderingStates.INITIAL;
    this.resume = null;
    this.disableCanvasToImageConversion = disableCanvasToImageConversion;
    this.pageWidth = this.viewport.width;
    this.pageHeight = this.viewport.height;
    this.pageRatio = this.pageWidth / this.pageHeight;
    this.canvasWidth = THUMBNAIL_WIDTH;
    this.canvasHeight = this.canvasWidth / this.pageRatio | 0;
    this.scale = this.canvasWidth / this.pageWidth;
    this.l10n = l10n;
    const anchor = document.createElement("a");
    anchor.href = linkService.getAnchorUrl("#page=" + id);

    this._thumbPageTitle.then(msg => {
      anchor.title = msg;
    });

    anchor.onclick = function () {
      linkService.page = id;
      return false;
    };

    this.anchor = anchor;
    const div = document.createElement("div");
    div.className = "thumbnail";
    div.setAttribute("data-page-number", this.id);
    this.div = div;
    const ring = document.createElement("div");
    ring.className = "thumbnailSelectionRing";
    const borderAdjustment = 2 * THUMBNAIL_CANVAS_BORDER_WIDTH;
    ring.style.width = this.canvasWidth + borderAdjustment + "px";
    ring.style.height = this.canvasHeight + borderAdjustment + "px";
    this.ring = ring;
    div.appendChild(ring);
    anchor.appendChild(div);
    container.appendChild(anchor);
  }

  setPdfPage(pdfPage) {
    this.pdfPage = pdfPage;
    this.pdfPageRotate = pdfPage.rotate;
    const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
    this.viewport = pdfPage.getViewport({
      scale: 1,
      rotation: totalRotation
    });
    this.reset();
  }

  reset() {
    this.cancelRendering();
    this.renderingState = _pdf_rendering_queue.RenderingStates.INITIAL;
    this.pageWidth = this.viewport.width;
    this.pageHeight = this.viewport.height;
    this.pageRatio = this.pageWidth / this.pageHeight;
    this.canvasHeight = this.canvasWidth / this.pageRatio | 0;
    this.scale = this.canvasWidth / this.pageWidth;
    this.div.removeAttribute("data-loaded");
    const ring = this.ring;
    const childNodes = ring.childNodes;

    for (let i = childNodes.length - 1; i >= 0; i--) {
      ring.removeChild(childNodes[i]);
    }

    const borderAdjustment = 2 * THUMBNAIL_CANVAS_BORDER_WIDTH;
    ring.style.width = this.canvasWidth + borderAdjustment + "px";
    ring.style.height = this.canvasHeight + borderAdjustment + "px";

    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
      delete this.canvas;
    }

    if (this.image) {
      this.image.removeAttribute("src");
      delete this.image;
    }
  }

  update(rotation) {
    if (typeof rotation !== "undefined") {
      this.rotation = rotation;
    }

    const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
    this.viewport = this.viewport.clone({
      scale: 1,
      rotation: totalRotation
    });
    this.reset();
  }

  cancelRendering() {
    if (this.renderTask) {
      this.renderTask.cancel();
      this.renderTask = null;
    }

    this.resume = null;
  }

  _getPageDrawContext(noCtxScale = false) {
    const canvas = document.createElement("canvas");
    this.canvas = canvas;
    canvas.mozOpaque = true;
    const ctx = canvas.getContext("2d", {
      alpha: false
    });
    const outputScale = (0, _ui_utils.getOutputScale)(ctx);
    canvas.width = this.canvasWidth * outputScale.sx | 0;
    canvas.height = this.canvasHeight * outputScale.sy | 0;
    canvas.style.width = this.canvasWidth + "px";
    canvas.style.height = this.canvasHeight + "px";

    if (!noCtxScale && outputScale.scaled) {
      ctx.scale(outputScale.sx, outputScale.sy);
    }

    return ctx;
  }

  _convertCanvasToImage() {
    if (!this.canvas) {
      return;
    }

    if (this.renderingState !== _pdf_rendering_queue.RenderingStates.FINISHED) {
      return;
    }

    const className = "thumbnailImage";

    if (this.disableCanvasToImageConversion) {
      this.canvas.className = className;

      this._thumbPageCanvas.then(msg => {
        this.canvas.setAttribute("aria-label", msg);
      });

      this.div.setAttribute("data-loaded", true);
      this.ring.appendChild(this.canvas);
      return;
    }

    const image = document.createElement("img");
    image.className = className;

    this._thumbPageCanvas.then(msg => {
      image.setAttribute("aria-label", msg);
    });

    image.style.width = this.canvasWidth + "px";
    image.style.height = this.canvasHeight + "px";
    image.src = this.canvas.toDataURL();
    this.image = image;
    this.div.setAttribute("data-loaded", true);
    this.ring.appendChild(image);
    this.canvas.width = 0;
    this.canvas.height = 0;
    delete this.canvas;
  }

  draw() {
    if (this.renderingState !== _pdf_rendering_queue.RenderingStates.INITIAL) {
      console.error("Must be in new state before drawing");
      return Promise.resolve(undefined);
    }

    const {
      pdfPage
    } = this;

    if (!pdfPage) {
      this.renderingState = _pdf_rendering_queue.RenderingStates.FINISHED;
      return Promise.reject(new Error("pdfPage is not loaded"));
    }

    this.renderingState = _pdf_rendering_queue.RenderingStates.RUNNING;
    const renderCapability = (0, _pdfjsLib.createPromiseCapability)();

    const finishRenderTask = error => {
      if (renderTask === this.renderTask) {
        this.renderTask = null;
      }

      if (error instanceof _pdfjsLib.RenderingCancelledException) {
        renderCapability.resolve(undefined);
        return;
      }

      this.renderingState = _pdf_rendering_queue.RenderingStates.FINISHED;

      this._convertCanvasToImage();

      if (!error) {
        renderCapability.resolve(undefined);
      } else {
        renderCapability.reject(error);
      }
    };

    const ctx = this._getPageDrawContext();

    const drawViewport = this.viewport.clone({
      scale: this.scale
    });

    const renderContinueCallback = cont => {
      if (!this.renderingQueue.isHighestPriority(this)) {
        this.renderingState = _pdf_rendering_queue.RenderingStates.PAUSED;

        this.resume = () => {
          this.renderingState = _pdf_rendering_queue.RenderingStates.RUNNING;
          cont();
        };

        return;
      }

      cont();
    };

    const renderContext = {
      canvasContext: ctx,
      viewport: drawViewport
    };
    const renderTask = this.renderTask = pdfPage.render(renderContext);
    renderTask.onContinue = renderContinueCallback;
    renderTask.promise.then(function () {
      finishRenderTask(null);
    }, function (error) {
      finishRenderTask(error);
    });
    return renderCapability.promise;
  }

  setImage(pageView) {
    if (this.renderingState !== _pdf_rendering_queue.RenderingStates.INITIAL) {
      return;
    }

    const img = pageView.canvas;

    if (!img) {
      return;
    }

    if (!this.pdfPage) {
      this.setPdfPage(pageView.pdfPage);
    }

    this.renderingState = _pdf_rendering_queue.RenderingStates.FINISHED;

    const ctx = this._getPageDrawContext(true);

    const canvas = ctx.canvas;

    if (img.width <= 2 * canvas.width) {
      ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, canvas.width, canvas.height);

      this._convertCanvasToImage();

      return;
    }

    let reducedWidth = canvas.width << MAX_NUM_SCALING_STEPS;
    let reducedHeight = canvas.height << MAX_NUM_SCALING_STEPS;
    const reducedImage = TempImageFactory.getCanvas(reducedWidth, reducedHeight);
    const reducedImageCtx = reducedImage.getContext("2d");

    while (reducedWidth > img.width || reducedHeight > img.height) {
      reducedWidth >>= 1;
      reducedHeight >>= 1;
    }

    reducedImageCtx.drawImage(img, 0, 0, img.width, img.height, 0, 0, reducedWidth, reducedHeight);

    while (reducedWidth > 2 * canvas.width) {
      reducedImageCtx.drawImage(reducedImage, 0, 0, reducedWidth, reducedHeight, 0, 0, reducedWidth >> 1, reducedHeight >> 1);
      reducedWidth >>= 1;
      reducedHeight >>= 1;
    }

    ctx.drawImage(reducedImage, 0, 0, reducedWidth, reducedHeight, 0, 0, canvas.width, canvas.height);

    this._convertCanvasToImage();
  }

  get _thumbPageTitle() {
    return this.l10n.get("thumb_page_title", {
      page: this.pageLabel !== null ? this.pageLabel : this.id
    }, "Page {{page}}");
  }

  get _thumbPageCanvas() {
    return this.l10n.get("thumb_page_canvas", {
      page: this.pageLabel !== null ? this.pageLabel : this.id
    }, "Thumbnail of Page {{page}}");
  }

  setPageLabel(label) {
    this.pageLabel = typeof label === "string" ? label : null;

    this._thumbPageTitle.then(msg => {
      this.anchor.title = msg;
    });

    if (this.renderingState !== _pdf_rendering_queue.RenderingStates.FINISHED) {
      return;
    }

    this._thumbPageCanvas.then(msg => {
      if (this.image) {
        this.image.setAttribute("aria-label", msg);
      } else if (this.disableCanvasToImageConversion && this.canvas) {
        this.canvas.setAttribute("aria-label", msg);
      }
    });
  }

  static cleanup() {
    TempImageFactory.destroyCanvas();
  }

}

exports.PDFThumbnailView = PDFThumbnailView;

/***/ }),
/* 24 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFViewer = void 0;

var _base_viewer = __webpack_require__(25);

var _pdfjsLib = __webpack_require__(4);

class PDFViewer extends _base_viewer.BaseViewer {
  get _setDocumentViewerElement() {
    return (0, _pdfjsLib.shadow)(this, "_setDocumentViewerElement", this.viewer);
  }

  _scrollIntoView({
    pageDiv,
    pageSpot = null,
    pageNumber = null
  }) {
    if (!pageSpot && !this.isInPresentationMode) {
      const left = pageDiv.offsetLeft + pageDiv.clientLeft;
      const right = left + pageDiv.clientWidth;
      const {
        scrollLeft,
        clientWidth
      } = this.container;

      if (this._isScrollModeHorizontal || left < scrollLeft || right > scrollLeft + clientWidth) {
        pageSpot = {
          left: 0,
          top: 0
        };
      }
    }

    super._scrollIntoView({
      pageDiv,
      pageSpot,
      pageNumber
    });
  }

  _getVisiblePages() {
    if (this.isInPresentationMode) {
      return this._getCurrentVisiblePage();
    }

    return super._getVisiblePages();
  }

  _updateHelper(visiblePages) {
    if (this.isInPresentationMode) {
      return;
    }

    let currentId = this._currentPageNumber;
    let stillFullyVisible = false;

    for (const page of visiblePages) {
      if (page.percent < 100) {
        break;
      }

      if (page.id === currentId) {
        stillFullyVisible = true;
        break;
      }
    }

    if (!stillFullyVisible) {
      currentId = visiblePages[0].id;
    }

    this._setCurrentPageNumber(currentId);
  }

}

exports.PDFViewer = PDFViewer;

/***/ }),
/* 25 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.BaseViewer = void 0;

var _ui_utils = __webpack_require__(2);

var _pdf_rendering_queue = __webpack_require__(8);

var _annotation_layer_builder = __webpack_require__(26);

var _pdfjsLib = __webpack_require__(4);

var _pdf_page_view = __webpack_require__(27);

var _pdf_link_service = __webpack_require__(18);

var _text_layer_builder = __webpack_require__(28);

const DEFAULT_CACHE_SIZE = 10;

function PDFPageViewBuffer(size) {
  const data = [];

  this.push = function (view) {
    const i = data.indexOf(view);

    if (i >= 0) {
      data.splice(i, 1);
    }

    data.push(view);

    if (data.length > size) {
      data.shift().destroy();
    }
  };

  this.resize = function (newSize, pagesToKeep) {
    size = newSize;

    if (pagesToKeep) {
      const pageIdsToKeep = new Set();

      for (let i = 0, iMax = pagesToKeep.length; i < iMax; ++i) {
        pageIdsToKeep.add(pagesToKeep[i].id);
      }

      (0, _ui_utils.moveToEndOfArray)(data, function (page) {
        return pageIdsToKeep.has(page.id);
      });
    }

    while (data.length > size) {
      data.shift().destroy();
    }
  };
}

function isSameScale(oldScale, newScale) {
  if (newScale === oldScale) {
    return true;
  }

  if (Math.abs(newScale - oldScale) < 1e-15) {
    return true;
  }

  return false;
}

class BaseViewer {
  constructor(options) {
    if (this.constructor === BaseViewer) {
      throw new Error("Cannot initialize BaseViewer.");
    }

    this._name = this.constructor.name;
    this.container = options.container;
    this.viewer = options.viewer || options.container.firstElementChild;
    this.eventBus = options.eventBus || (0, _ui_utils.getGlobalEventBus)();
    this.linkService = options.linkService || new _pdf_link_service.SimpleLinkService();
    this.downloadManager = options.downloadManager || null;
    this.findController = options.findController || null;
    this.removePageBorders = options.removePageBorders || false;
    this.textLayerMode = Number.isInteger(options.textLayerMode) ? options.textLayerMode : _ui_utils.TextLayerMode.ENABLE;
    this.imageResourcesPath = options.imageResourcesPath || "";
    this.renderInteractiveForms = options.renderInteractiveForms || false;
    this.enablePrintAutoRotate = options.enablePrintAutoRotate || false;
    this.renderer = options.renderer || _ui_utils.RendererType.CANVAS;
    this.enableWebGL = options.enableWebGL || false;
    this.useOnlyCssZoom = options.useOnlyCssZoom || false;
    this.maxCanvasPixels = options.maxCanvasPixels;
    this.l10n = options.l10n || _ui_utils.NullL10n;
    this.defaultRenderingQueue = !options.renderingQueue;

    if (this.defaultRenderingQueue) {
      this.renderingQueue = new _pdf_rendering_queue.PDFRenderingQueue();
      this.renderingQueue.setViewer(this);
    } else {
      this.renderingQueue = options.renderingQueue;
    }

    this.scroll = (0, _ui_utils.watchScroll)(this.container, this._scrollUpdate.bind(this));
    this.presentationModeState = _ui_utils.PresentationModeState.UNKNOWN;
    this._onBeforeDraw = this._onAfterDraw = null;

    this._resetView();

    if (this.removePageBorders) {
      this.viewer.classList.add("removePageBorders");
    }

    Promise.resolve().then(() => {
      this.eventBus.dispatch("baseviewerinit", {
        source: this
      });
    });
  }

  get pagesCount() {
    return this._pages.length;
  }

  getPageView(index) {
    return this._pages[index];
  }

  get pageViewsReady() {
    if (!this._pagesCapability.settled) {
      return false;
    }

    return this._pages.every(function (pageView) {
      return pageView && pageView.pdfPage;
    });
  }

  get currentPageNumber() {
    return this._currentPageNumber;
  }

  set currentPageNumber(val) {
    if (!Number.isInteger(val)) {
      throw new Error("Invalid page number.");
    }

    if (!this.pdfDocument) {
      return;
    }

    if (!this._setCurrentPageNumber(val, true)) {
      console.error(`${this._name}.currentPageNumber: "${val}" is not a valid page.`);
    }
  }

  _setCurrentPageNumber(val, resetCurrentPageView = false) {
    if (this._currentPageNumber === val) {
      if (resetCurrentPageView) {
        this._resetCurrentPageView();
      }

      return true;
    }

    if (!(0 < val && val <= this.pagesCount)) {
      return false;
    }

    this._currentPageNumber = val;
    this.eventBus.dispatch("pagechanging", {
      source: this,
      pageNumber: val,
      pageLabel: this._pageLabels && this._pageLabels[val - 1]
    });

    if (resetCurrentPageView) {
      this._resetCurrentPageView();
    }

    return true;
  }

  get currentPageLabel() {
    return this._pageLabels && this._pageLabels[this._currentPageNumber - 1];
  }

  set currentPageLabel(val) {
    if (!this.pdfDocument) {
      return;
    }

    let page = val | 0;

    if (this._pageLabels) {
      const i = this._pageLabels.indexOf(val);

      if (i >= 0) {
        page = i + 1;
      }
    }

    if (!this._setCurrentPageNumber(page, true)) {
      console.error(`${this._name}.currentPageLabel: "${val}" is not a valid page.`);
    }
  }

  get currentScale() {
    return this._currentScale !== _ui_utils.UNKNOWN_SCALE ? this._currentScale : _ui_utils.DEFAULT_SCALE;
  }

  set currentScale(val) {
    if (isNaN(val)) {
      throw new Error("Invalid numeric scale.");
    }

    if (!this.pdfDocument) {
      return;
    }

    this._setScale(val, false);
  }

  get currentScaleValue() {
    return this._currentScaleValue;
  }

  set currentScaleValue(val) {
    if (!this.pdfDocument) {
      return;
    }

    this._setScale(val, false);
  }

  get pagesRotation() {
    return this._pagesRotation;
  }

  set pagesRotation(rotation) {
    if (!(0, _ui_utils.isValidRotation)(rotation)) {
      throw new Error("Invalid pages rotation angle.");
    }

    if (!this.pdfDocument) {
      return;
    }

    if (this._pagesRotation === rotation) {
      return;
    }

    this._pagesRotation = rotation;
    const pageNumber = this._currentPageNumber;

    for (let i = 0, ii = this._pages.length; i < ii; i++) {
      const pageView = this._pages[i];
      pageView.update(pageView.scale, rotation);
    }

    if (this._currentScaleValue) {
      this._setScale(this._currentScaleValue, true);
    }

    this.eventBus.dispatch("rotationchanging", {
      source: this,
      pagesRotation: rotation,
      pageNumber
    });

    if (this.defaultRenderingQueue) {
      this.update();
    }
  }

  get firstPagePromise() {
    return this.pdfDocument ? this._firstPageCapability.promise : null;
  }

  get onePageRendered() {
    return this.pdfDocument ? this._onePageRenderedCapability.promise : null;
  }

  get pagesPromise() {
    return this.pdfDocument ? this._pagesCapability.promise : null;
  }

  get _setDocumentViewerElement() {
    throw new Error("Not implemented: _setDocumentViewerElement");
  }

  setDocument(pdfDocument) {
    if (this.pdfDocument) {
      this._cancelRendering();

      this._resetView();

      if (this.findController) {
        this.findController.setDocument(null);
      }
    }

    this.pdfDocument = pdfDocument;

    if (!pdfDocument) {
      return;
    }

    const pagesCount = pdfDocument.numPages;
    const firstPagePromise = pdfDocument.getPage(1);

    this._pagesCapability.promise.then(() => {
      this.eventBus.dispatch("pagesloaded", {
        source: this,
        pagesCount
      });
    });

    this._onBeforeDraw = evt => {
      const pageView = this._pages[evt.pageNumber - 1];

      if (!pageView) {
        return;
      }

      this._buffer.push(pageView);
    };

    this.eventBus._on("pagerender", this._onBeforeDraw);

    this._onAfterDraw = evt => {
      if (evt.cssTransform || this._onePageRenderedCapability.settled) {
        return;
      }

      this._onePageRenderedCapability.resolve();

      this.eventBus._off("pagerendered", this._onAfterDraw);

      this._onAfterDraw = null;
    };

    this.eventBus._on("pagerendered", this._onAfterDraw);

    firstPagePromise.then(firstPdfPage => {
      this._firstPageCapability.resolve(firstPdfPage);

      const scale = this.currentScale;
      const viewport = firstPdfPage.getViewport({
        scale: scale * _ui_utils.CSS_UNITS
      });
      const textLayerFactory = this.textLayerMode !== _ui_utils.TextLayerMode.DISABLE ? this : null;

      for (let pageNum = 1; pageNum <= pagesCount; ++pageNum) {
        const pageView = new _pdf_page_view.PDFPageView({
          container: this._setDocumentViewerElement,
          eventBus: this.eventBus,
          id: pageNum,
          scale,
          defaultViewport: viewport.clone(),
          renderingQueue: this.renderingQueue,
          textLayerFactory,
          textLayerMode: this.textLayerMode,
          annotationLayerFactory: this,
          imageResourcesPath: this.imageResourcesPath,
          renderInteractiveForms: this.renderInteractiveForms,
          renderer: this.renderer,
          enableWebGL: this.enableWebGL,
          useOnlyCssZoom: this.useOnlyCssZoom,
          maxCanvasPixels: this.maxCanvasPixels,
          l10n: this.l10n
        });

        this._pages.push(pageView);
      }

      const firstPageView = this._pages[0];

      if (firstPageView) {
        firstPageView.setPdfPage(firstPdfPage);
        this.linkService.cachePageRef(1, firstPdfPage.ref);
      }

      if (this._spreadMode !== _ui_utils.SpreadMode.NONE) {
        this._updateSpreadMode();
      }

      this._onePageRenderedCapability.promise.then(() => {
        if (this.findController) {
          this.findController.setDocument(pdfDocument);
        }

        if (pdfDocument.loadingParams["disableAutoFetch"] || pagesCount > 7500) {
          this._pagesCapability.resolve();

          return;
        }

        let getPagesLeft = pagesCount - 1;

        if (getPagesLeft <= 0) {
          this._pagesCapability.resolve();

          return;
        }

        for (let pageNum = 2; pageNum <= pagesCount; ++pageNum) {
          pdfDocument.getPage(pageNum).then(pdfPage => {
            const pageView = this._pages[pageNum - 1];

            if (!pageView.pdfPage) {
              pageView.setPdfPage(pdfPage);
            }

            this.linkService.cachePageRef(pageNum, pdfPage.ref);

            if (--getPagesLeft === 0) {
              this._pagesCapability.resolve();
            }
          }, reason => {
            console.error(`Unable to get page ${pageNum} to initialize viewer`, reason);

            if (--getPagesLeft === 0) {
              this._pagesCapability.resolve();
            }
          });
        }
      });

      this.eventBus.dispatch("pagesinit", {
        source: this
      });

      if (this.defaultRenderingQueue) {
        this.update();
      }
    }).catch(reason => {
      console.error("Unable to initialize viewer", reason);
    });
  }

  setPageLabels(labels) {
    if (!this.pdfDocument) {
      return;
    }

    if (!labels) {
      this._pageLabels = null;
    } else if (!(Array.isArray(labels) && this.pdfDocument.numPages === labels.length)) {
      this._pageLabels = null;
      console.error(`${this._name}.setPageLabels: Invalid page labels.`);
    } else {
      this._pageLabels = labels;
    }

    for (let i = 0, ii = this._pages.length; i < ii; i++) {
      const pageView = this._pages[i];
      const label = this._pageLabels && this._pageLabels[i];
      pageView.setPageLabel(label);
    }
  }

  _resetView() {
    this._pages = [];
    this._currentPageNumber = 1;
    this._currentScale = _ui_utils.UNKNOWN_SCALE;
    this._currentScaleValue = null;
    this._pageLabels = null;
    this._buffer = new PDFPageViewBuffer(DEFAULT_CACHE_SIZE);
    this._location = null;
    this._pagesRotation = 0;
    this._pagesRequests = new WeakMap();
    this._firstPageCapability = (0, _pdfjsLib.createPromiseCapability)();
    this._onePageRenderedCapability = (0, _pdfjsLib.createPromiseCapability)();
    this._pagesCapability = (0, _pdfjsLib.createPromiseCapability)();
    this._scrollMode = _ui_utils.ScrollMode.VERTICAL;
    this._spreadMode = _ui_utils.SpreadMode.NONE;

    if (this._onBeforeDraw) {
      this.eventBus._off("pagerender", this._onBeforeDraw);

      this._onBeforeDraw = null;
    }

    if (this._onAfterDraw) {
      this.eventBus._off("pagerendered", this._onAfterDraw);

      this._onAfterDraw = null;
    }

    this.viewer.textContent = "";

    this._updateScrollMode();
  }

  _scrollUpdate() {
    if (this.pagesCount === 0) {
      return;
    }

    this.update();
  }

  _scrollIntoView({
    pageDiv,
    pageSpot = null,
    pageNumber = null
  }) {
    (0, _ui_utils.scrollIntoView)(pageDiv, pageSpot);
  }

  _setScaleUpdatePages(newScale, newValue, noScroll = false, preset = false) {
    this._currentScaleValue = newValue.toString();

    if (isSameScale(this._currentScale, newScale)) {
      if (preset) {
        this.eventBus.dispatch("scalechanging", {
          source: this,
          scale: newScale,
          presetValue: newValue
        });
      }

      return;
    }

    for (let i = 0, ii = this._pages.length; i < ii; i++) {
      this._pages[i].update(newScale);
    }

    this._currentScale = newScale;

    if (!noScroll) {
      let page = this._currentPageNumber,
          dest;

      if (this._location && !(this.isInPresentationMode || this.isChangingPresentationMode)) {
        page = this._location.pageNumber;
        dest = [null, {
          name: "XYZ"
        }, this._location.left, this._location.top, null];
      }

      this.scrollPageIntoView({
        pageNumber: page,
        destArray: dest,
        allowNegativeOffset: true
      });
    }

    this.eventBus.dispatch("scalechanging", {
      source: this,
      scale: newScale,
      presetValue: preset ? newValue : undefined
    });

    if (this.defaultRenderingQueue) {
      this.update();
    }
  }

  _setScale(value, noScroll = false) {
    let scale = parseFloat(value);

    if (scale > 0) {
      this._setScaleUpdatePages(scale, value, noScroll, false);
    } else {
      const currentPage = this._pages[this._currentPageNumber - 1];

      if (!currentPage) {
        return;
      }

      const noPadding = this.isInPresentationMode || this.removePageBorders;
      let hPadding = noPadding ? 0 : _ui_utils.SCROLLBAR_PADDING;
      let vPadding = noPadding ? 0 : _ui_utils.VERTICAL_PADDING;

      if (!noPadding && this._isScrollModeHorizontal) {
        [hPadding, vPadding] = [vPadding, hPadding];
      }

      const pageWidthScale = (this.container.clientWidth - hPadding) / currentPage.width * currentPage.scale;
      const pageHeightScale = (this.container.clientHeight - vPadding) / currentPage.height * currentPage.scale;

      switch (value) {
        case "page-actual":
          scale = 1;
          break;

        case "page-width":
          scale = pageWidthScale;
          break;

        case "page-height":
          scale = pageHeightScale;
          break;

        case "page-fit":
          scale = Math.min(pageWidthScale, pageHeightScale);
          break;

        case "auto":
          const horizontalScale = (0, _ui_utils.isPortraitOrientation)(currentPage) ? pageWidthScale : Math.min(pageHeightScale, pageWidthScale);
          scale = Math.min(_ui_utils.MAX_AUTO_SCALE, horizontalScale);
          break;

        default:
          console.error(`${this._name}._setScale: "${value}" is an unknown zoom value.`);
          return;
      }

      this._setScaleUpdatePages(scale, value, noScroll, true);
    }
  }

  _resetCurrentPageView() {
    if (this.isInPresentationMode) {
      this._setScale(this._currentScaleValue, true);
    }

    const pageView = this._pages[this._currentPageNumber - 1];

    this._scrollIntoView({
      pageDiv: pageView.div
    });
  }

  scrollPageIntoView({
    pageNumber,
    destArray = null,
    allowNegativeOffset = false,
    ignoreDestinationZoom = false
  }) {
    if (!this.pdfDocument) {
      return;
    }

    const pageView = Number.isInteger(pageNumber) && this._pages[pageNumber - 1];

    if (!pageView) {
      console.error(`${this._name}.scrollPageIntoView: ` + `"${pageNumber}" is not a valid pageNumber parameter.`);
      return;
    }

    if (this.isInPresentationMode || !destArray) {
      this._setCurrentPageNumber(pageNumber, true);

      return;
    }

    let x = 0,
        y = 0;
    let width = 0,
        height = 0,
        widthScale,
        heightScale;
    const changeOrientation = pageView.rotation % 180 !== 0;
    const pageWidth = (changeOrientation ? pageView.height : pageView.width) / pageView.scale / _ui_utils.CSS_UNITS;
    const pageHeight = (changeOrientation ? pageView.width : pageView.height) / pageView.scale / _ui_utils.CSS_UNITS;
    let scale = 0;

    switch (destArray[1].name) {
      case "XYZ":
        x = destArray[2];
        y = destArray[3];
        scale = destArray[4];
        x = x !== null ? x : 0;
        y = y !== null ? y : pageHeight;
        break;

      case "Fit":
      case "FitB":
        scale = "page-fit";
        break;

      case "FitH":
      case "FitBH":
        y = destArray[2];
        scale = "page-width";

        if (y === null && this._location) {
          x = this._location.left;
          y = this._location.top;
        }

        break;

      case "FitV":
      case "FitBV":
        x = destArray[2];
        width = pageWidth;
        height = pageHeight;
        scale = "page-height";
        break;

      case "FitR":
        x = destArray[2];
        y = destArray[3];
        width = destArray[4] - x;
        height = destArray[5] - y;
        const hPadding = this.removePageBorders ? 0 : _ui_utils.SCROLLBAR_PADDING;
        const vPadding = this.removePageBorders ? 0 : _ui_utils.VERTICAL_PADDING;
        widthScale = (this.container.clientWidth - hPadding) / width / _ui_utils.CSS_UNITS;
        heightScale = (this.container.clientHeight - vPadding) / height / _ui_utils.CSS_UNITS;
        scale = Math.min(Math.abs(widthScale), Math.abs(heightScale));
        break;

      default:
        console.error(`${this._name}.scrollPageIntoView: ` + `"${destArray[1].name}" is not a valid destination type.`);
        return;
    }

    if (!ignoreDestinationZoom) {
      if (scale && scale !== this._currentScale) {
        this.currentScaleValue = scale;
      } else if (this._currentScale === _ui_utils.UNKNOWN_SCALE) {
        this.currentScaleValue = _ui_utils.DEFAULT_SCALE_VALUE;
      }
    }

    if (scale === "page-fit" && !destArray[4]) {
      this._scrollIntoView({
        pageDiv: pageView.div,
        pageNumber
      });

      return;
    }

    const boundingRect = [pageView.viewport.convertToViewportPoint(x, y), pageView.viewport.convertToViewportPoint(x + width, y + height)];
    let left = Math.min(boundingRect[0][0], boundingRect[1][0]);
    let top = Math.min(boundingRect[0][1], boundingRect[1][1]);

    if (!allowNegativeOffset) {
      left = Math.max(left, 0);
      top = Math.max(top, 0);
    }

    this._scrollIntoView({
      pageDiv: pageView.div,
      pageSpot: {
        left,
        top
      },
      pageNumber
    });
  }

  _updateLocation(firstPage) {
    const currentScale = this._currentScale;
    const currentScaleValue = this._currentScaleValue;
    const normalizedScaleValue = parseFloat(currentScaleValue) === currentScale ? Math.round(currentScale * 10000) / 100 : currentScaleValue;
    const pageNumber = firstPage.id;
    let pdfOpenParams = "#page=" + pageNumber;
    pdfOpenParams += "&zoom=" + normalizedScaleValue;
    const currentPageView = this._pages[pageNumber - 1];
    const container = this.container;
    const topLeft = currentPageView.getPagePoint(container.scrollLeft - firstPage.x, container.scrollTop - firstPage.y);
    const intLeft = Math.round(topLeft[0]);
    const intTop = Math.round(topLeft[1]);
    pdfOpenParams += "," + intLeft + "," + intTop;
    this._location = {
      pageNumber,
      scale: normalizedScaleValue,
      top: intTop,
      left: intLeft,
      rotation: this._pagesRotation,
      pdfOpenParams
    };
  }

  _updateHelper(visiblePages) {
    throw new Error("Not implemented: _updateHelper");
  }

  update() {
    const visible = this._getVisiblePages();

    const visiblePages = visible.views,
          numVisiblePages = visiblePages.length;

    if (numVisiblePages === 0) {
      return;
    }

    const newCacheSize = Math.max(DEFAULT_CACHE_SIZE, 2 * numVisiblePages + 1);

    this._buffer.resize(newCacheSize, visiblePages);

    this.renderingQueue.renderHighestPriority(visible);

    this._updateHelper(visiblePages);

    this._updateLocation(visible.first);

    this.eventBus.dispatch("updateviewarea", {
      source: this,
      location: this._location
    });
  }

  containsElement(element) {
    return this.container.contains(element);
  }

  focus() {
    this.container.focus();
  }

  get _isScrollModeHorizontal() {
    return this.isInPresentationMode ? false : this._scrollMode === _ui_utils.ScrollMode.HORIZONTAL;
  }

  get isInPresentationMode() {
    return this.presentationModeState === _ui_utils.PresentationModeState.FULLSCREEN;
  }

  get isChangingPresentationMode() {
    return this.presentationModeState === _ui_utils.PresentationModeState.CHANGING;
  }

  get isHorizontalScrollbarEnabled() {
    return this.isInPresentationMode ? false : this.container.scrollWidth > this.container.clientWidth;
  }

  get isVerticalScrollbarEnabled() {
    return this.isInPresentationMode ? false : this.container.scrollHeight > this.container.clientHeight;
  }

  _getCurrentVisiblePage() {
    if (!this.pagesCount) {
      return {
        views: []
      };
    }

    const pageView = this._pages[this._currentPageNumber - 1];
    const element = pageView.div;
    const view = {
      id: pageView.id,
      x: element.offsetLeft + element.clientLeft,
      y: element.offsetTop + element.clientTop,
      view: pageView
    };
    return {
      first: view,
      last: view,
      views: [view]
    };
  }

  _getVisiblePages() {
    return (0, _ui_utils.getVisibleElements)(this.container, this._pages, true, this._isScrollModeHorizontal);
  }

  isPageVisible(pageNumber) {
    if (!this.pdfDocument) {
      return false;
    }

    if (pageNumber < 1 || pageNumber > this.pagesCount) {
      console.error(`${this._name}.isPageVisible: "${pageNumber}" is out of bounds.`);
      return false;
    }

    return this._getVisiblePages().views.some(function (view) {
      return view.id === pageNumber;
    });
  }

  cleanup() {
    for (let i = 0, ii = this._pages.length; i < ii; i++) {
      if (this._pages[i] && this._pages[i].renderingState !== _pdf_rendering_queue.RenderingStates.FINISHED) {
        this._pages[i].reset();
      }
    }
  }

  _cancelRendering() {
    for (let i = 0, ii = this._pages.length; i < ii; i++) {
      if (this._pages[i]) {
        this._pages[i].cancelRendering();
      }
    }
  }

  _ensurePdfPageLoaded(pageView) {
    if (pageView.pdfPage) {
      return Promise.resolve(pageView.pdfPage);
    }

    if (this._pagesRequests.has(pageView)) {
      return this._pagesRequests.get(pageView);
    }

    const promise = this.pdfDocument.getPage(pageView.id).then(pdfPage => {
      if (!pageView.pdfPage) {
        pageView.setPdfPage(pdfPage);
      }

      this._pagesRequests.delete(pageView);

      return pdfPage;
    }).catch(reason => {
      console.error("Unable to get page for page view", reason);

      this._pagesRequests.delete(pageView);
    });

    this._pagesRequests.set(pageView, promise);

    return promise;
  }

  forceRendering(currentlyVisiblePages) {
    const visiblePages = currentlyVisiblePages || this._getVisiblePages();

    const scrollAhead = this._isScrollModeHorizontal ? this.scroll.right : this.scroll.down;
    const pageView = this.renderingQueue.getHighestPriority(visiblePages, this._pages, scrollAhead);

    if (pageView) {
      this._ensurePdfPageLoaded(pageView).then(() => {
        this.renderingQueue.renderView(pageView);
      });

      return true;
    }

    return false;
  }

  createTextLayerBuilder(textLayerDiv, pageIndex, viewport, enhanceTextSelection = false, eventBus) {
    return new _text_layer_builder.TextLayerBuilder({
      textLayerDiv,
      eventBus,
      pageIndex,
      viewport,
      findController: this.isInPresentationMode ? null : this.findController,
      enhanceTextSelection: this.isInPresentationMode ? false : enhanceTextSelection
    });
  }

  createAnnotationLayerBuilder(pageDiv, pdfPage, imageResourcesPath = "", renderInteractiveForms = false, l10n = _ui_utils.NullL10n) {
    return new _annotation_layer_builder.AnnotationLayerBuilder({
      pageDiv,
      pdfPage,
      imageResourcesPath,
      renderInteractiveForms,
      linkService: this.linkService,
      downloadManager: this.downloadManager,
      l10n
    });
  }

  get hasEqualPageSizes() {
    const firstPageView = this._pages[0];

    for (let i = 1, ii = this._pages.length; i < ii; ++i) {
      const pageView = this._pages[i];

      if (pageView.width !== firstPageView.width || pageView.height !== firstPageView.height) {
        return false;
      }
    }

    return true;
  }

  getPagesOverview() {
    const pagesOverview = this._pages.map(function (pageView) {
      const viewport = pageView.pdfPage.getViewport({
        scale: 1
      });
      return {
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation
      };
    });

    if (!this.enablePrintAutoRotate) {
      return pagesOverview;
    }

    const isFirstPagePortrait = (0, _ui_utils.isPortraitOrientation)(pagesOverview[0]);
    return pagesOverview.map(function (size) {
      if (isFirstPagePortrait === (0, _ui_utils.isPortraitOrientation)(size)) {
        return size;
      }

      return {
        width: size.height,
        height: size.width,
        rotation: (size.rotation + 90) % 360
      };
    });
  }

  get scrollMode() {
    return this._scrollMode;
  }

  set scrollMode(mode) {
    if (this._scrollMode === mode) {
      return;
    }

    if (!(0, _ui_utils.isValidScrollMode)(mode)) {
      throw new Error(`Invalid scroll mode: ${mode}`);
    }

    this._scrollMode = mode;
    this.eventBus.dispatch("scrollmodechanged", {
      source: this,
      mode
    });

    this._updateScrollMode(this._currentPageNumber);
  }

  _updateScrollMode(pageNumber = null) {
    const scrollMode = this._scrollMode,
          viewer = this.viewer;
    viewer.classList.toggle("scrollHorizontal", scrollMode === _ui_utils.ScrollMode.HORIZONTAL);
    viewer.classList.toggle("scrollWrapped", scrollMode === _ui_utils.ScrollMode.WRAPPED);

    if (!this.pdfDocument || !pageNumber) {
      return;
    }

    if (this._currentScaleValue && isNaN(this._currentScaleValue)) {
      this._setScale(this._currentScaleValue, true);
    }

    this._setCurrentPageNumber(pageNumber, true);

    this.update();
  }

  get spreadMode() {
    return this._spreadMode;
  }

  set spreadMode(mode) {
    if (this._spreadMode === mode) {
      return;
    }

    if (!(0, _ui_utils.isValidSpreadMode)(mode)) {
      throw new Error(`Invalid spread mode: ${mode}`);
    }

    this._spreadMode = mode;
    this.eventBus.dispatch("spreadmodechanged", {
      source: this,
      mode
    });

    this._updateSpreadMode(this._currentPageNumber);
  }

  _updateSpreadMode(pageNumber = null) {
    if (!this.pdfDocument) {
      return;
    }

    const viewer = this.viewer,
          pages = this._pages;
    viewer.textContent = "";

    if (this._spreadMode === _ui_utils.SpreadMode.NONE) {
      for (let i = 0, iMax = pages.length; i < iMax; ++i) {
        viewer.appendChild(pages[i].div);
      }
    } else {
      const parity = this._spreadMode - 1;
      let spread = null;

      for (let i = 0, iMax = pages.length; i < iMax; ++i) {
        if (spread === null) {
          spread = document.createElement("div");
          spread.className = "spread";
          viewer.appendChild(spread);
        } else if (i % 2 === parity) {
          spread = spread.cloneNode(false);
          viewer.appendChild(spread);
        }

        spread.appendChild(pages[i].div);
      }
    }

    if (!pageNumber) {
      return;
    }

    this._setCurrentPageNumber(pageNumber, true);

    this.update();
  }

}

exports.BaseViewer = BaseViewer;

/***/ }),
/* 26 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DefaultAnnotationLayerFactory = exports.AnnotationLayerBuilder = void 0;

var _pdfjsLib = __webpack_require__(4);

var _ui_utils = __webpack_require__(2);

var _pdf_link_service = __webpack_require__(18);

class AnnotationLayerBuilder {
  constructor({
    pageDiv,
    pdfPage,
    linkService,
    downloadManager,
    imageResourcesPath = "",
    renderInteractiveForms = false,
    l10n = _ui_utils.NullL10n
  }) {
    this.pageDiv = pageDiv;
    this.pdfPage = pdfPage;
    this.linkService = linkService;
    this.downloadManager = downloadManager;
    this.imageResourcesPath = imageResourcesPath;
    this.renderInteractiveForms = renderInteractiveForms;
    this.l10n = l10n;
    this.div = null;
    this._cancelled = false;
  }

  render(viewport, intent = "display") {
    this.pdfPage.getAnnotations({
      intent
    }).then(annotations => {
      if (this._cancelled) {
        return;
      }

      const parameters = {
        viewport: viewport.clone({
          dontFlip: true
        }),
        div: this.div,
        annotations,
        page: this.pdfPage,
        imageResourcesPath: this.imageResourcesPath,
        renderInteractiveForms: this.renderInteractiveForms,
        linkService: this.linkService,
        downloadManager: this.downloadManager
      };

      if (this.div) {
        _pdfjsLib.AnnotationLayer.update(parameters);
      } else {
        if (annotations.length === 0) {
          return;
        }

        this.div = document.createElement("div");
        this.div.className = "annotationLayer";
        this.pageDiv.appendChild(this.div);
        parameters.div = this.div;

        _pdfjsLib.AnnotationLayer.render(parameters);

        this.l10n.translate(this.div);
      }
    });
  }

  cancel() {
    this._cancelled = true;
  }

  hide() {
    if (!this.div) {
      return;
    }

    this.div.setAttribute("hidden", "true");
  }

}

exports.AnnotationLayerBuilder = AnnotationLayerBuilder;

class DefaultAnnotationLayerFactory {
  createAnnotationLayerBuilder(pageDiv, pdfPage, imageResourcesPath = "", renderInteractiveForms = false, l10n = _ui_utils.NullL10n) {
    return new AnnotationLayerBuilder({
      pageDiv,
      pdfPage,
      imageResourcesPath,
      renderInteractiveForms,
      linkService: new _pdf_link_service.SimpleLinkService(),
      l10n
    });
  }

}

exports.DefaultAnnotationLayerFactory = DefaultAnnotationLayerFactory;

/***/ }),
/* 27 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFPageView = void 0;

var _ui_utils = __webpack_require__(2);

var _pdfjsLib = __webpack_require__(4);

var _pdf_rendering_queue = __webpack_require__(8);

var _viewer_compatibility = __webpack_require__(5);

const MAX_CANVAS_PIXELS = _viewer_compatibility.viewerCompatibilityParams.maxCanvasPixels || 16777216;

class PDFPageView {
  constructor(options) {
    const container = options.container;
    const defaultViewport = options.defaultViewport;
    this.id = options.id;
    this.renderingId = "page" + this.id;
    this.pdfPage = null;
    this.pageLabel = null;
    this.rotation = 0;
    this.scale = options.scale || _ui_utils.DEFAULT_SCALE;
    this.viewport = defaultViewport;
    this.pdfPageRotate = defaultViewport.rotation;
    this.hasRestrictedScaling = false;
    this.textLayerMode = Number.isInteger(options.textLayerMode) ? options.textLayerMode : _ui_utils.TextLayerMode.ENABLE;
    this.imageResourcesPath = options.imageResourcesPath || "";
    this.renderInteractiveForms = options.renderInteractiveForms || false;
    this.useOnlyCssZoom = options.useOnlyCssZoom || false;
    this.maxCanvasPixels = options.maxCanvasPixels || MAX_CANVAS_PIXELS;
    this.eventBus = options.eventBus || (0, _ui_utils.getGlobalEventBus)();
    this.renderingQueue = options.renderingQueue;
    this.textLayerFactory = options.textLayerFactory;
    this.annotationLayerFactory = options.annotationLayerFactory;
    this.renderer = options.renderer || _ui_utils.RendererType.CANVAS;
    this.enableWebGL = options.enableWebGL || false;
    this.l10n = options.l10n || _ui_utils.NullL10n;
    this.paintTask = null;
    this.paintedViewportMap = new WeakMap();
    this.renderingState = _pdf_rendering_queue.RenderingStates.INITIAL;
    this.resume = null;
    this.error = null;
    this.annotationLayer = null;
    this.textLayer = null;
    this.zoomLayer = null;
    const div = document.createElement("div");
    div.className = "page";
    div.style.width = Math.floor(this.viewport.width) + "px";
    div.style.height = Math.floor(this.viewport.height) + "px";
    div.setAttribute("data-page-number", this.id);
    this.div = div;
    container.appendChild(div);
  }

  setPdfPage(pdfPage) {
    this.pdfPage = pdfPage;
    this.pdfPageRotate = pdfPage.rotate;
    const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
    this.viewport = pdfPage.getViewport({
      scale: this.scale * _ui_utils.CSS_UNITS,
      rotation: totalRotation
    });
    this.stats = pdfPage.stats;
    this.reset();
  }

  destroy() {
    this.reset();

    if (this.pdfPage) {
      this.pdfPage.cleanup();
    }
  }

  _resetZoomLayer(removeFromDOM = false) {
    if (!this.zoomLayer) {
      return;
    }

    const zoomLayerCanvas = this.zoomLayer.firstChild;
    this.paintedViewportMap.delete(zoomLayerCanvas);
    zoomLayerCanvas.width = 0;
    zoomLayerCanvas.height = 0;

    if (removeFromDOM) {
      this.zoomLayer.remove();
    }

    this.zoomLayer = null;
  }

  reset(keepZoomLayer = false, keepAnnotations = false) {
    this.cancelRendering(keepAnnotations);
    this.renderingState = _pdf_rendering_queue.RenderingStates.INITIAL;
    const div = this.div;
    div.style.width = Math.floor(this.viewport.width) + "px";
    div.style.height = Math.floor(this.viewport.height) + "px";
    const childNodes = div.childNodes;
    const currentZoomLayerNode = keepZoomLayer && this.zoomLayer || null;
    const currentAnnotationNode = keepAnnotations && this.annotationLayer && this.annotationLayer.div || null;

    for (let i = childNodes.length - 1; i >= 0; i--) {
      const node = childNodes[i];

      if (currentZoomLayerNode === node || currentAnnotationNode === node) {
        continue;
      }

      div.removeChild(node);
    }

    div.removeAttribute("data-loaded");

    if (currentAnnotationNode) {
      this.annotationLayer.hide();
    } else if (this.annotationLayer) {
      this.annotationLayer.cancel();
      this.annotationLayer = null;
    }

    if (!currentZoomLayerNode) {
      if (this.canvas) {
        this.paintedViewportMap.delete(this.canvas);
        this.canvas.width = 0;
        this.canvas.height = 0;
        delete this.canvas;
      }

      this._resetZoomLayer();
    }

    if (this.svg) {
      this.paintedViewportMap.delete(this.svg);
      delete this.svg;
    }

    this.loadingIconDiv = document.createElement("div");
    this.loadingIconDiv.className = "loadingIcon";
    div.appendChild(this.loadingIconDiv);
  }

  update(scale, rotation) {
    this.scale = scale || this.scale;

    if (typeof rotation !== "undefined") {
      this.rotation = rotation;
    }

    const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
    this.viewport = this.viewport.clone({
      scale: this.scale * _ui_utils.CSS_UNITS,
      rotation: totalRotation
    });

    if (this.svg) {
      this.cssTransform(this.svg, true);
      this.eventBus.dispatch("pagerendered", {
        source: this,
        pageNumber: this.id,
        cssTransform: true,
        timestamp: performance.now()
      });
      return;
    }

    let isScalingRestricted = false;

    if (this.canvas && this.maxCanvasPixels > 0) {
      const outputScale = this.outputScale;

      if ((Math.floor(this.viewport.width) * outputScale.sx | 0) * (Math.floor(this.viewport.height) * outputScale.sy | 0) > this.maxCanvasPixels) {
        isScalingRestricted = true;
      }
    }

    if (this.canvas) {
      if (this.useOnlyCssZoom || this.hasRestrictedScaling && isScalingRestricted) {
        this.cssTransform(this.canvas, true);
        this.eventBus.dispatch("pagerendered", {
          source: this,
          pageNumber: this.id,
          cssTransform: true,
          timestamp: performance.now()
        });
        return;
      }

      if (!this.zoomLayer && !this.canvas.hasAttribute("hidden")) {
        this.zoomLayer = this.canvas.parentNode;
        this.zoomLayer.style.position = "absolute";
      }
    }

    if (this.zoomLayer) {
      this.cssTransform(this.zoomLayer.firstChild);
    }

    this.reset(true, true);
  }

  cancelRendering(keepAnnotations = false) {
    if (this.paintTask) {
      this.paintTask.cancel();
      this.paintTask = null;
    }

    this.resume = null;

    if (this.textLayer) {
      this.textLayer.cancel();
      this.textLayer = null;
    }

    if (!keepAnnotations && this.annotationLayer) {
      this.annotationLayer.cancel();
      this.annotationLayer = null;
    }
  }

  cssTransform(target, redrawAnnotations = false) {
    const width = this.viewport.width;
    const height = this.viewport.height;
    const div = this.div;
    target.style.width = target.parentNode.style.width = div.style.width = Math.floor(width) + "px";
    target.style.height = target.parentNode.style.height = div.style.height = Math.floor(height) + "px";
    const relativeRotation = this.viewport.rotation - this.paintedViewportMap.get(target).rotation;
    const absRotation = Math.abs(relativeRotation);
    let scaleX = 1,
        scaleY = 1;

    if (absRotation === 90 || absRotation === 270) {
      scaleX = height / width;
      scaleY = width / height;
    }

    const cssTransform = "rotate(" + relativeRotation + "deg) " + "scale(" + scaleX + "," + scaleY + ")";
    target.style.transform = cssTransform;

    if (this.textLayer) {
      const textLayerViewport = this.textLayer.viewport;
      const textRelativeRotation = this.viewport.rotation - textLayerViewport.rotation;
      const textAbsRotation = Math.abs(textRelativeRotation);
      let scale = width / textLayerViewport.width;

      if (textAbsRotation === 90 || textAbsRotation === 270) {
        scale = width / textLayerViewport.height;
      }

      const textLayerDiv = this.textLayer.textLayerDiv;
      let transX, transY;

      switch (textAbsRotation) {
        case 0:
          transX = transY = 0;
          break;

        case 90:
          transX = 0;
          transY = "-" + textLayerDiv.style.height;
          break;

        case 180:
          transX = "-" + textLayerDiv.style.width;
          transY = "-" + textLayerDiv.style.height;
          break;

        case 270:
          transX = "-" + textLayerDiv.style.width;
          transY = 0;
          break;

        default:
          console.error("Bad rotation value.");
          break;
      }

      textLayerDiv.style.transform = "rotate(" + textAbsRotation + "deg) " + "scale(" + scale + ", " + scale + ") " + "translate(" + transX + ", " + transY + ")";
      textLayerDiv.style.transformOrigin = "0% 0%";
    }

    if (redrawAnnotations && this.annotationLayer) {
      this.annotationLayer.render(this.viewport, "display");
    }
  }

  get width() {
    return this.viewport.width;
  }

  get height() {
    return this.viewport.height;
  }

  getPagePoint(x, y) {
    return this.viewport.convertToPdfPoint(x, y);
  }

  draw() {
    if (this.renderingState !== _pdf_rendering_queue.RenderingStates.INITIAL) {
      console.error("Must be in new state before drawing");
      this.reset();
    }

    const {
      div,
      pdfPage
    } = this;

    if (!pdfPage) {
      this.renderingState = _pdf_rendering_queue.RenderingStates.FINISHED;

      if (this.loadingIconDiv) {
        div.removeChild(this.loadingIconDiv);
        delete this.loadingIconDiv;
      }

      return Promise.reject(new Error("pdfPage is not loaded"));
    }

    this.renderingState = _pdf_rendering_queue.RenderingStates.RUNNING;
    const canvasWrapper = document.createElement("div");
    canvasWrapper.style.width = div.style.width;
    canvasWrapper.style.height = div.style.height;
    canvasWrapper.classList.add("canvasWrapper");

    if (this.annotationLayer && this.annotationLayer.div) {
      div.insertBefore(canvasWrapper, this.annotationLayer.div);
    } else {
      div.appendChild(canvasWrapper);
    }

    let textLayer = null;

    if (this.textLayerMode !== _ui_utils.TextLayerMode.DISABLE && this.textLayerFactory) {
      const textLayerDiv = document.createElement("div");
      textLayerDiv.className = "textLayer";
      textLayerDiv.style.width = canvasWrapper.style.width;
      textLayerDiv.style.height = canvasWrapper.style.height;

      if (this.annotationLayer && this.annotationLayer.div) {
        div.insertBefore(textLayerDiv, this.annotationLayer.div);
      } else {
        div.appendChild(textLayerDiv);
      }

      textLayer = this.textLayerFactory.createTextLayerBuilder(textLayerDiv, this.id - 1, this.viewport, this.textLayerMode === _ui_utils.TextLayerMode.ENABLE_ENHANCE, this.eventBus);
    }

    this.textLayer = textLayer;
    let renderContinueCallback = null;

    if (this.renderingQueue) {
      renderContinueCallback = cont => {
        if (!this.renderingQueue.isHighestPriority(this)) {
          this.renderingState = _pdf_rendering_queue.RenderingStates.PAUSED;

          this.resume = () => {
            this.renderingState = _pdf_rendering_queue.RenderingStates.RUNNING;
            cont();
          };

          return;
        }

        cont();
      };
    }

    const finishPaintTask = async error => {
      if (paintTask === this.paintTask) {
        this.paintTask = null;
      }

      if (error instanceof _pdfjsLib.RenderingCancelledException) {
        this.error = null;
        return;
      }

      this.renderingState = _pdf_rendering_queue.RenderingStates.FINISHED;

      if (this.loadingIconDiv) {
        div.removeChild(this.loadingIconDiv);
        delete this.loadingIconDiv;
      }

      this._resetZoomLayer(true);

      this.error = error;
      this.stats = pdfPage.stats;
      this.eventBus.dispatch("pagerendered", {
        source: this,
        pageNumber: this.id,
        cssTransform: false,
        timestamp: performance.now()
      });

      if (error) {
        throw error;
      }
    };

    const paintTask = this.renderer === _ui_utils.RendererType.SVG ? this.paintOnSvg(canvasWrapper) : this.paintOnCanvas(canvasWrapper);
    paintTask.onRenderContinue = renderContinueCallback;
    this.paintTask = paintTask;
    const resultPromise = paintTask.promise.then(function () {
      return finishPaintTask(null).then(function () {
        if (textLayer) {
          const readableStream = pdfPage.streamTextContent({
            normalizeWhitespace: true
          });
          textLayer.setTextContentStream(readableStream);
          textLayer.render();
        }
      });
    }, function (reason) {
      return finishPaintTask(reason);
    });

    if (this.annotationLayerFactory) {
      if (!this.annotationLayer) {
        this.annotationLayer = this.annotationLayerFactory.createAnnotationLayerBuilder(div, pdfPage, this.imageResourcesPath, this.renderInteractiveForms, this.l10n);
      }

      this.annotationLayer.render(this.viewport, "display");
    }

    div.setAttribute("data-loaded", true);
    this.eventBus.dispatch("pagerender", {
      source: this,
      pageNumber: this.id
    });
    return resultPromise;
  }

  paintOnCanvas(canvasWrapper) {
    const renderCapability = (0, _pdfjsLib.createPromiseCapability)();
    const result = {
      promise: renderCapability.promise,

      onRenderContinue(cont) {
        cont();
      },

      cancel() {
        renderTask.cancel();
      }

    };
    const viewport = this.viewport;
    const canvas = document.createElement("canvas");
    this.l10n.get("page_canvas", {
      page: this.id
    }, "Page {{page}}").then(msg => {
      canvas.setAttribute("aria-label", msg);
    });
    canvas.setAttribute("hidden", "hidden");
    let isCanvasHidden = true;

    const showCanvas = function () {
      if (isCanvasHidden) {
        canvas.removeAttribute("hidden");
        isCanvasHidden = false;
      }
    };

    canvasWrapper.appendChild(canvas);
    this.canvas = canvas;
    canvas.mozOpaque = true;
    const ctx = canvas.getContext("2d", {
      alpha: false
    });
    const outputScale = (0, _ui_utils.getOutputScale)(ctx);
    this.outputScale = outputScale;

    if (this.useOnlyCssZoom) {
      const actualSizeViewport = viewport.clone({
        scale: _ui_utils.CSS_UNITS
      });
      outputScale.sx *= actualSizeViewport.width / viewport.width;
      outputScale.sy *= actualSizeViewport.height / viewport.height;
      outputScale.scaled = true;
    }

    if (this.maxCanvasPixels > 0) {
      const pixelsInViewport = viewport.width * viewport.height;
      const maxScale = Math.sqrt(this.maxCanvasPixels / pixelsInViewport);

      if (outputScale.sx > maxScale || outputScale.sy > maxScale) {
        outputScale.sx = maxScale;
        outputScale.sy = maxScale;
        outputScale.scaled = true;
        this.hasRestrictedScaling = true;
      } else {
        this.hasRestrictedScaling = false;
      }
    }

    const sfx = (0, _ui_utils.approximateFraction)(outputScale.sx);
    const sfy = (0, _ui_utils.approximateFraction)(outputScale.sy);
    canvas.width = (0, _ui_utils.roundToDivide)(viewport.width * outputScale.sx, sfx[0]);
    canvas.height = (0, _ui_utils.roundToDivide)(viewport.height * outputScale.sy, sfy[0]);
    canvas.style.width = (0, _ui_utils.roundToDivide)(viewport.width, sfx[1]) + "px";
    canvas.style.height = (0, _ui_utils.roundToDivide)(viewport.height, sfy[1]) + "px";
    this.paintedViewportMap.set(canvas, viewport);
    const transform = !outputScale.scaled ? null : [outputScale.sx, 0, 0, outputScale.sy, 0, 0];
    const renderContext = {
      canvasContext: ctx,
      transform,
      viewport: this.viewport,
      enableWebGL: this.enableWebGL,
      renderInteractiveForms: this.renderInteractiveForms
    };
    const renderTask = this.pdfPage.render(renderContext);

    renderTask.onContinue = function (cont) {
      showCanvas();

      if (result.onRenderContinue) {
        result.onRenderContinue(cont);
      } else {
        cont();
      }
    };

    renderTask.promise.then(function () {
      showCanvas();
      renderCapability.resolve(undefined);
    }, function (error) {
      showCanvas();
      renderCapability.reject(error);
    });
    return result;
  }

  paintOnSvg(wrapper) {
    let cancelled = false;

    const ensureNotCancelled = () => {
      if (cancelled) {
        throw new _pdfjsLib.RenderingCancelledException(`Rendering cancelled, page ${this.id}`, "svg");
      }
    };

    const pdfPage = this.pdfPage;
    const actualSizeViewport = this.viewport.clone({
      scale: _ui_utils.CSS_UNITS
    });
    const promise = pdfPage.getOperatorList().then(opList => {
      ensureNotCancelled();
      const svgGfx = new _pdfjsLib.SVGGraphics(pdfPage.commonObjs, pdfPage.objs);
      return svgGfx.getSVG(opList, actualSizeViewport).then(svg => {
        ensureNotCancelled();
        this.svg = svg;
        this.paintedViewportMap.set(svg, actualSizeViewport);
        svg.style.width = wrapper.style.width;
        svg.style.height = wrapper.style.height;
        this.renderingState = _pdf_rendering_queue.RenderingStates.FINISHED;
        wrapper.appendChild(svg);
      });
    });
    return {
      promise,

      onRenderContinue(cont) {
        cont();
      },

      cancel() {
        cancelled = true;
      }

    };
  }

  setPageLabel(label) {
    this.pageLabel = typeof label === "string" ? label : null;

    if (this.pageLabel !== null) {
      this.div.setAttribute("data-page-label", this.pageLabel);
    } else {
      this.div.removeAttribute("data-page-label");
    }
  }

}

exports.PDFPageView = PDFPageView;

/***/ }),
/* 28 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DefaultTextLayerFactory = exports.TextLayerBuilder = void 0;

var _ui_utils = __webpack_require__(2);

var _pdfjsLib = __webpack_require__(4);

const EXPAND_DIVS_TIMEOUT = 300;

class TextLayerBuilder {
  constructor({
    textLayerDiv,
    eventBus,
    pageIndex,
    viewport,
    findController = null,
    enhanceTextSelection = false
  }) {
    this.textLayerDiv = textLayerDiv;
    this.eventBus = eventBus || (0, _ui_utils.getGlobalEventBus)();
    this.textContent = null;
    this.textContentItemsStr = [];
    this.textContentStream = null;
    this.renderingDone = false;
    this.pageIdx = pageIndex;
    this.pageNumber = this.pageIdx + 1;
    this.matches = [];
    this.viewport = viewport;
    this.textDivs = [];
    this.findController = findController;
    this.textLayerRenderTask = null;
    this.enhanceTextSelection = enhanceTextSelection;
    this._onUpdateTextLayerMatches = null;

    this._bindMouse();
  }

  _finishRendering() {
    this.renderingDone = true;

    if (!this.enhanceTextSelection) {
      const endOfContent = document.createElement("div");
      endOfContent.className = "endOfContent";
      this.textLayerDiv.appendChild(endOfContent);
    }

    this.eventBus.dispatch("textlayerrendered", {
      source: this,
      pageNumber: this.pageNumber,
      numTextDivs: this.textDivs.length
    });
  }

  render(timeout = 0) {
    if (!(this.textContent || this.textContentStream) || this.renderingDone) {
      return;
    }

    this.cancel();
    this.textDivs = [];
    const textLayerFrag = document.createDocumentFragment();
    this.textLayerRenderTask = (0, _pdfjsLib.renderTextLayer)({
      textContent: this.textContent,
      textContentStream: this.textContentStream,
      container: textLayerFrag,
      viewport: this.viewport,
      textDivs: this.textDivs,
      textContentItemsStr: this.textContentItemsStr,
      timeout,
      enhanceTextSelection: this.enhanceTextSelection
    });
    this.textLayerRenderTask.promise.then(() => {
      this.textLayerDiv.appendChild(textLayerFrag);

      this._finishRendering();

      this._updateMatches();
    }, function (reason) {});

    if (!this._onUpdateTextLayerMatches) {
      this._onUpdateTextLayerMatches = evt => {
        if (evt.pageIndex === this.pageIdx || evt.pageIndex === -1) {
          this._updateMatches();
        }
      };

      this.eventBus._on("updatetextlayermatches", this._onUpdateTextLayerMatches);
    }
  }

  cancel() {
    if (this.textLayerRenderTask) {
      this.textLayerRenderTask.cancel();
      this.textLayerRenderTask = null;
    }

    if (this._onUpdateTextLayerMatches) {
      this.eventBus._off("updatetextlayermatches", this._onUpdateTextLayerMatches);

      this._onUpdateTextLayerMatches = null;
    }
  }

  setTextContentStream(readableStream) {
    this.cancel();
    this.textContentStream = readableStream;
  }

  setTextContent(textContent) {
    this.cancel();
    this.textContent = textContent;
  }

  _convertMatches(matches, matchesLength) {
    if (!matches) {
      return [];
    }

    const {
      findController,
      textContentItemsStr
    } = this;
    let i = 0,
        iIndex = 0;
    const end = textContentItemsStr.length - 1;
    const queryLen = findController.state.query.length;
    const result = [];

    for (let m = 0, mm = matches.length; m < mm; m++) {
      let matchIdx = matches[m];

      while (i !== end && matchIdx >= iIndex + textContentItemsStr[i].length) {
        iIndex += textContentItemsStr[i].length;
        i++;
      }

      if (i === textContentItemsStr.length) {
        console.error("Could not find a matching mapping");
      }

      const match = {
        begin: {
          divIdx: i,
          offset: matchIdx - iIndex
        }
      };

      if (matchesLength) {
        matchIdx += matchesLength[m];
      } else {
        matchIdx += queryLen;
      }

      while (i !== end && matchIdx > iIndex + textContentItemsStr[i].length) {
        iIndex += textContentItemsStr[i].length;
        i++;
      }

      match.end = {
        divIdx: i,
        offset: matchIdx - iIndex
      };
      result.push(match);
    }

    return result;
  }

  _renderMatches(matches) {
    if (matches.length === 0) {
      return;
    }

    const {
      findController,
      pageIdx,
      textContentItemsStr,
      textDivs
    } = this;
    const isSelectedPage = pageIdx === findController.selected.pageIdx;
    const selectedMatchIdx = findController.selected.matchIdx;
    const highlightAll = findController.state.highlightAll;
    let prevEnd = null;
    const infinity = {
      divIdx: -1,
      offset: undefined
    };

    function beginText(begin, className) {
      const divIdx = begin.divIdx;
      textDivs[divIdx].textContent = "";
      appendTextToDiv(divIdx, 0, begin.offset, className);
    }

    function appendTextToDiv(divIdx, fromOffset, toOffset, className) {
      const div = textDivs[divIdx];
      const content = textContentItemsStr[divIdx].substring(fromOffset, toOffset);
      const node = document.createTextNode(content);

      if (className) {
        const span = document.createElement("span");
        span.className = className;
        span.appendChild(node);
        div.appendChild(span);
        return;
      }

      div.appendChild(node);
    }

    let i0 = selectedMatchIdx,
        i1 = i0 + 1;

    if (highlightAll) {
      i0 = 0;
      i1 = matches.length;
    } else if (!isSelectedPage) {
      return;
    }

    for (let i = i0; i < i1; i++) {
      const match = matches[i];
      const begin = match.begin;
      const end = match.end;
      const isSelected = isSelectedPage && i === selectedMatchIdx;
      const highlightSuffix = isSelected ? " selected" : "";

      if (isSelected) {
        findController.scrollMatchIntoView({
          element: textDivs[begin.divIdx],
          pageIndex: pageIdx,
          matchIndex: selectedMatchIdx
        });
      }

      if (!prevEnd || begin.divIdx !== prevEnd.divIdx) {
        if (prevEnd !== null) {
          appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
        }

        beginText(begin);
      } else {
        appendTextToDiv(prevEnd.divIdx, prevEnd.offset, begin.offset);
      }

      if (begin.divIdx === end.divIdx) {
        appendTextToDiv(begin.divIdx, begin.offset, end.offset, "highlight" + highlightSuffix);
      } else {
        appendTextToDiv(begin.divIdx, begin.offset, infinity.offset, "highlight begin" + highlightSuffix);

        for (let n0 = begin.divIdx + 1, n1 = end.divIdx; n0 < n1; n0++) {
          textDivs[n0].className = "highlight middle" + highlightSuffix;
        }

        beginText(end, "highlight end" + highlightSuffix);
      }

      prevEnd = end;
    }

    if (prevEnd) {
      appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
    }
  }

  _updateMatches() {
    if (!this.renderingDone) {
      return;
    }

    const {
      findController,
      matches,
      pageIdx,
      textContentItemsStr,
      textDivs
    } = this;
    let clearedUntilDivIdx = -1;

    for (let i = 0, ii = matches.length; i < ii; i++) {
      const match = matches[i];
      const begin = Math.max(clearedUntilDivIdx, match.begin.divIdx);

      for (let n = begin, end = match.end.divIdx; n <= end; n++) {
        const div = textDivs[n];
        div.textContent = textContentItemsStr[n];
        div.className = "";
      }

      clearedUntilDivIdx = match.end.divIdx + 1;
    }

    if (!findController || !findController.highlightMatches) {
      return;
    }

    const pageMatches = findController.pageMatches[pageIdx] || null;
    const pageMatchesLength = findController.pageMatchesLength[pageIdx] || null;
    this.matches = this._convertMatches(pageMatches, pageMatchesLength);

    this._renderMatches(this.matches);
  }

  _bindMouse() {
    const div = this.textLayerDiv;
    let expandDivsTimer = null;
    div.addEventListener("mousedown", evt => {
      if (this.enhanceTextSelection && this.textLayerRenderTask) {
        this.textLayerRenderTask.expandTextDivs(true);

        if (expandDivsTimer) {
          clearTimeout(expandDivsTimer);
          expandDivsTimer = null;
        }

        return;
      }

      const end = div.querySelector(".endOfContent");

      if (!end) {
        return;
      }

      let adjustTop = evt.target !== div;
      adjustTop = adjustTop && window.getComputedStyle(end).getPropertyValue("-moz-user-select") !== "none";

      if (adjustTop) {
        const divBounds = div.getBoundingClientRect();
        const r = Math.max(0, (evt.pageY - divBounds.top) / divBounds.height);
        end.style.top = (r * 100).toFixed(2) + "%";
      }

      end.classList.add("active");
    });
    div.addEventListener("mouseup", () => {
      if (this.enhanceTextSelection && this.textLayerRenderTask) {
        expandDivsTimer = setTimeout(() => {
          if (this.textLayerRenderTask) {
            this.textLayerRenderTask.expandTextDivs(false);
          }

          expandDivsTimer = null;
        }, EXPAND_DIVS_TIMEOUT);
        return;
      }

      const end = div.querySelector(".endOfContent");

      if (!end) {
        return;
      }

      end.style.top = "";
      end.classList.remove("active");
    });
  }

}

exports.TextLayerBuilder = TextLayerBuilder;

class DefaultTextLayerFactory {
  createTextLayerBuilder(textLayerDiv, pageIndex, viewport, enhanceTextSelection = false, eventBus) {
    return new TextLayerBuilder({
      textLayerDiv,
      pageIndex,
      viewport,
      enhanceTextSelection,
      eventBus
    });
  }

}

exports.DefaultTextLayerFactory = DefaultTextLayerFactory;

/***/ }),
/* 29 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SecondaryToolbar = void 0;

var _ui_utils = __webpack_require__(2);

var _pdf_cursor_tools = __webpack_require__(6);

var _pdf_single_page_viewer = __webpack_require__(30);

class SecondaryToolbar {
  constructor(options, mainContainer, eventBus) {
    this.toolbar = options.toolbar;
    this.toggleButton = options.toggleButton;
    this.toolbarButtonContainer = options.toolbarButtonContainer;
    this.buttons = [{
      element: options.presentationModeButton,
      eventName: "presentationmode",
      close: true
    }, {
      element: options.openFileButton,
      eventName: "openfile",
      close: true
    }, {
      element: options.printButton,
      eventName: "print",
      close: true
    }, {
      element: options.downloadButton,
      eventName: "download",
      close: true
    }, {
      element: options.viewBookmarkButton,
      eventName: null,
      close: true
    }, {
      element: options.firstPageButton,
      eventName: "firstpage",
      close: true
    }, {
      element: options.lastPageButton,
      eventName: "lastpage",
      close: true
    }, {
      element: options.pageRotateCwButton,
      eventName: "rotatecw",
      close: false
    }, {
      element: options.pageRotateCcwButton,
      eventName: "rotateccw",
      close: false
    }, {
      element: options.cursorSelectToolButton,
      eventName: "switchcursortool",
      eventDetails: {
        tool: _pdf_cursor_tools.CursorTool.SELECT
      },
      close: true
    }, {
      element: options.cursorHandToolButton,
      eventName: "switchcursortool",
      eventDetails: {
        tool: _pdf_cursor_tools.CursorTool.HAND
      },
      close: true
    }, {
      element: options.scrollVerticalButton,
      eventName: "switchscrollmode",
      eventDetails: {
        mode: _ui_utils.ScrollMode.VERTICAL
      },
      close: true
    }, {
      element: options.scrollHorizontalButton,
      eventName: "switchscrollmode",
      eventDetails: {
        mode: _ui_utils.ScrollMode.HORIZONTAL
      },
      close: true
    }, {
      element: options.scrollWrappedButton,
      eventName: "switchscrollmode",
      eventDetails: {
        mode: _ui_utils.ScrollMode.WRAPPED
      },
      close: true
    }, {
      element: options.spreadNoneButton,
      eventName: "switchspreadmode",
      eventDetails: {
        mode: _ui_utils.SpreadMode.NONE
      },
      close: true
    }, {
      element: options.spreadOddButton,
      eventName: "switchspreadmode",
      eventDetails: {
        mode: _ui_utils.SpreadMode.ODD
      },
      close: true
    }, {
      element: options.spreadEvenButton,
      eventName: "switchspreadmode",
      eventDetails: {
        mode: _ui_utils.SpreadMode.EVEN
      },
      close: true
    }, {
      element: options.documentPropertiesButton,
      eventName: "documentproperties",
      close: true
    }];
    this.items = {
      firstPage: options.firstPageButton,
      lastPage: options.lastPageButton,
      pageRotateCw: options.pageRotateCwButton,
      pageRotateCcw: options.pageRotateCcwButton
    };
    this.mainContainer = mainContainer;
    this.eventBus = eventBus;
    this.opened = false;
    this.containerHeight = null;
    this.previousContainerHeight = null;
    this.reset();

    this._bindClickListeners();

    this._bindCursorToolsListener(options);

    this._bindScrollModeListener(options);

    this._bindSpreadModeListener(options);

    this.eventBus._on("resize", this._setMaxHeight.bind(this));

    this.eventBus._on("baseviewerinit", evt => {
      if (evt.source instanceof _pdf_single_page_viewer.PDFSinglePageViewer) {
        this.toolbarButtonContainer.classList.add("hiddenScrollModeButtons", "hiddenSpreadModeButtons");
      } else {
        this.toolbarButtonContainer.classList.remove("hiddenScrollModeButtons", "hiddenSpreadModeButtons");
      }
    });
  }

  get isOpen() {
    return this.opened;
  }

  setPageNumber(pageNumber) {
    this.pageNumber = pageNumber;

    this._updateUIState();
  }

  setPagesCount(pagesCount) {
    this.pagesCount = pagesCount;

    this._updateUIState();
  }

  reset() {
    this.pageNumber = 0;
    this.pagesCount = 0;

    this._updateUIState();

    this.eventBus.dispatch("secondarytoolbarreset", {
      source: this
    });
  }

  _updateUIState() {
    this.items.firstPage.disabled = this.pageNumber <= 1;
    this.items.lastPage.disabled = this.pageNumber >= this.pagesCount;
    this.items.pageRotateCw.disabled = this.pagesCount === 0;
    this.items.pageRotateCcw.disabled = this.pagesCount === 0;
  }

  _bindClickListeners() {
    this.toggleButton.addEventListener("click", this.toggle.bind(this));

    for (const {
      element,
      eventName,
      close,
      eventDetails
    } of this.buttons) {
      element.addEventListener("click", evt => {
        if (eventName !== null) {
          const details = {
            source: this
          };

          for (const property in eventDetails) {
            details[property] = eventDetails[property];
          }

          this.eventBus.dispatch(eventName, details);
        }

        if (close) {
          this.close();
        }
      });
    }
  }

  _bindCursorToolsListener(buttons) {
    this.eventBus._on("cursortoolchanged", function ({
      tool
    }) {
      buttons.cursorSelectToolButton.classList.toggle("toggled", tool === _pdf_cursor_tools.CursorTool.SELECT);
      buttons.cursorHandToolButton.classList.toggle("toggled", tool === _pdf_cursor_tools.CursorTool.HAND);
    });
  }

  _bindScrollModeListener(buttons) {
    function scrollModeChanged({
      mode
    }) {
      buttons.scrollVerticalButton.classList.toggle("toggled", mode === _ui_utils.ScrollMode.VERTICAL);
      buttons.scrollHorizontalButton.classList.toggle("toggled", mode === _ui_utils.ScrollMode.HORIZONTAL);
      buttons.scrollWrappedButton.classList.toggle("toggled", mode === _ui_utils.ScrollMode.WRAPPED);
      const isScrollModeHorizontal = mode === _ui_utils.ScrollMode.HORIZONTAL;
      buttons.spreadNoneButton.disabled = isScrollModeHorizontal;
      buttons.spreadOddButton.disabled = isScrollModeHorizontal;
      buttons.spreadEvenButton.disabled = isScrollModeHorizontal;
    }

    this.eventBus._on("scrollmodechanged", scrollModeChanged);

    this.eventBus._on("secondarytoolbarreset", evt => {
      if (evt.source === this) {
        scrollModeChanged({
          mode: _ui_utils.ScrollMode.VERTICAL
        });
      }
    });
  }

  _bindSpreadModeListener(buttons) {
    function spreadModeChanged({
      mode
    }) {
      buttons.spreadNoneButton.classList.toggle("toggled", mode === _ui_utils.SpreadMode.NONE);
      buttons.spreadOddButton.classList.toggle("toggled", mode === _ui_utils.SpreadMode.ODD);
      buttons.spreadEvenButton.classList.toggle("toggled", mode === _ui_utils.SpreadMode.EVEN);
    }

    this.eventBus._on("spreadmodechanged", spreadModeChanged);

    this.eventBus._on("secondarytoolbarreset", evt => {
      if (evt.source === this) {
        spreadModeChanged({
          mode: _ui_utils.SpreadMode.NONE
        });
      }
    });
  }

  open() {
    if (this.opened) {
      return;
    }

    this.opened = true;

    this._setMaxHeight();

    this.toggleButton.classList.add("toggled");
    this.toolbar.classList.remove("hidden");
  }

  close() {
    if (!this.opened) {
      return;
    }

    this.opened = false;
    this.toolbar.classList.add("hidden");
    this.toggleButton.classList.remove("toggled");
  }

  toggle() {
    if (this.opened) {
      this.close();
    } else {
      this.open();
    }
  }

  _setMaxHeight() {
    if (!this.opened) {
      return;
    }

    this.containerHeight = this.mainContainer.clientHeight;

    if (this.containerHeight === this.previousContainerHeight) {
      return;
    }

    this.toolbarButtonContainer.style.maxHeight = `${this.containerHeight - _ui_utils.SCROLLBAR_PADDING}px`;
    this.previousContainerHeight = this.containerHeight;
  }

}

exports.SecondaryToolbar = SecondaryToolbar;

/***/ }),
/* 30 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFSinglePageViewer = void 0;

var _base_viewer = __webpack_require__(25);

var _pdfjsLib = __webpack_require__(4);

class PDFSinglePageViewer extends _base_viewer.BaseViewer {
  constructor(options) {
    super(options);

    this.eventBus._on("pagesinit", evt => {
      this._ensurePageViewVisible();
    });
  }

  get _setDocumentViewerElement() {
    return (0, _pdfjsLib.shadow)(this, "_setDocumentViewerElement", this._shadowViewer);
  }

  _resetView() {
    super._resetView();

    this._previousPageNumber = 1;
    this._shadowViewer = document.createDocumentFragment();
    this._updateScrollDown = null;
  }

  _ensurePageViewVisible() {
    const pageView = this._pages[this._currentPageNumber - 1];
    const previousPageView = this._pages[this._previousPageNumber - 1];
    const viewerNodes = this.viewer.childNodes;

    switch (viewerNodes.length) {
      case 0:
        this.viewer.appendChild(pageView.div);
        break;

      case 1:
        if (viewerNodes[0] !== previousPageView.div) {
          throw new Error("_ensurePageViewVisible: Unexpected previously visible page.");
        }

        if (pageView === previousPageView) {
          break;
        }

        this._shadowViewer.appendChild(previousPageView.div);

        this.viewer.appendChild(pageView.div);
        this.container.scrollTop = 0;
        break;

      default:
        throw new Error("_ensurePageViewVisible: Only one page should be visible at a time.");
    }

    this._previousPageNumber = this._currentPageNumber;
  }

  _scrollUpdate() {
    if (this._updateScrollDown) {
      this._updateScrollDown();
    }

    super._scrollUpdate();
  }

  _scrollIntoView({
    pageDiv,
    pageSpot = null,
    pageNumber = null
  }) {
    if (pageNumber) {
      this._setCurrentPageNumber(pageNumber);
    }

    const scrolledDown = this._currentPageNumber >= this._previousPageNumber;

    this._ensurePageViewVisible();

    this.update();

    super._scrollIntoView({
      pageDiv,
      pageSpot,
      pageNumber
    });

    this._updateScrollDown = () => {
      this.scroll.down = scrolledDown;
      this._updateScrollDown = null;
    };
  }

  _getVisiblePages() {
    return this._getCurrentVisiblePage();
  }

  _updateHelper(visiblePages) {}

  get _isScrollModeHorizontal() {
    return (0, _pdfjsLib.shadow)(this, "_isScrollModeHorizontal", false);
  }

  _updateScrollMode() {}

  _updateSpreadMode() {}

}

exports.PDFSinglePageViewer = PDFSinglePageViewer;

/***/ }),
/* 31 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Toolbar = void 0;

var _ui_utils = __webpack_require__(2);

const PAGE_NUMBER_LOADING_INDICATOR = "visiblePageIsLoading";
const SCALE_SELECT_CONTAINER_WIDTH = 140;
const SCALE_SELECT_WIDTH = 162;

class Toolbar {
  constructor(options, eventBus, l10n = _ui_utils.NullL10n) {
    this.toolbar = options.container;
    this.eventBus = eventBus;
    this.l10n = l10n;
    this.buttons = [{
      element: options.previous,
      eventName: "previouspage"
    }, {
      element: options.next,
      eventName: "nextpage"
    }, {
      element: options.zoomIn,
      eventName: "zoomin"
    }, {
      element: options.zoomOut,
      eventName: "zoomout"
    }, {
      element: options.openFile,
      eventName: "openfile"
    }, {
      element: options.print,
      eventName: "print"
    }, {
      element: options.presentationModeButton,
      eventName: "presentationmode"
    }, {
      element: options.download,
      eventName: "download"
    }, {
      element: options.viewBookmark,
      eventName: null
    }];
    this.items = {
      numPages: options.numPages,
      pageNumber: options.pageNumber,
      scaleSelectContainer: options.scaleSelectContainer,
      scaleSelect: options.scaleSelect,
      customScaleOption: options.customScaleOption,
      previous: options.previous,
      next: options.next,
      zoomIn: options.zoomIn,
      zoomOut: options.zoomOut
    };
    this._wasLocalized = false;
    this.reset();

    this._bindListeners();
  }

  setPageNumber(pageNumber, pageLabel) {
    this.pageNumber = pageNumber;
    this.pageLabel = pageLabel;

    this._updateUIState(false);
  }

  setPagesCount(pagesCount, hasPageLabels) {
    this.pagesCount = pagesCount;
    this.hasPageLabels = hasPageLabels;

    this._updateUIState(true);
  }

  setPageScale(pageScaleValue, pageScale) {
    this.pageScaleValue = (pageScaleValue || pageScale).toString();
    this.pageScale = pageScale;

    this._updateUIState(false);
  }

  reset() {
    this.pageNumber = 0;
    this.pageLabel = null;
    this.hasPageLabels = false;
    this.pagesCount = 0;
    this.pageScaleValue = _ui_utils.DEFAULT_SCALE_VALUE;
    this.pageScale = _ui_utils.DEFAULT_SCALE;

    this._updateUIState(true);

    this.updateLoadingIndicatorState();
  }

  _bindListeners() {
    const {
      pageNumber,
      scaleSelect
    } = this.items;
    const self = this;

    for (const {
      element,
      eventName
    } of this.buttons) {
      element.addEventListener("click", evt => {
        if (eventName !== null) {
          this.eventBus.dispatch(eventName, {
            source: this
          });
        }
      });
    }

    pageNumber.addEventListener("click", function () {
      this.select();
    });
    pageNumber.addEventListener("change", function () {
      self.eventBus.dispatch("pagenumberchanged", {
        source: self,
        value: this.value
      });
    });
    scaleSelect.addEventListener("change", function () {
      if (this.value === "custom") {
        return;
      }

      self.eventBus.dispatch("scalechanged", {
        source: self,
        value: this.value
      });
    });
    scaleSelect.oncontextmenu = _ui_utils.noContextMenuHandler;

    this.eventBus._on("localized", () => {
      this._wasLocalized = true;

      this._adjustScaleWidth();

      this._updateUIState(true);
    });
  }

  _updateUIState(resetNumPages = false) {
    if (!this._wasLocalized) {
      return;
    }

    const {
      pageNumber,
      pagesCount,
      pageScaleValue,
      pageScale,
      items
    } = this;

    if (resetNumPages) {
      if (this.hasPageLabels) {
        items.pageNumber.type = "text";
      } else {
        items.pageNumber.type = "number";
        this.l10n.get("of_pages", {
          pagesCount
        }, "of {{pagesCount}}").then(msg => {
          items.numPages.textContent = msg;
        });
      }

      items.pageNumber.max = pagesCount;
    }

    if (this.hasPageLabels) {
      items.pageNumber.value = this.pageLabel;
      this.l10n.get("page_of_pages", {
        pageNumber,
        pagesCount
      }, "({{pageNumber}} of {{pagesCount}})").then(msg => {
        items.numPages.textContent = msg;
      });
    } else {
      items.pageNumber.value = pageNumber;
    }

    items.previous.disabled = pageNumber <= 1;
    items.next.disabled = pageNumber >= pagesCount;
    items.zoomOut.disabled = pageScale <= _ui_utils.MIN_SCALE;
    items.zoomIn.disabled = pageScale >= _ui_utils.MAX_SCALE;
    const customScale = Math.round(pageScale * 10000) / 100;
    this.l10n.get("page_scale_percent", {
      scale: customScale
    }, "{{scale}}%").then(msg => {
      let predefinedValueFound = false;

      for (const option of items.scaleSelect.options) {
        if (option.value !== pageScaleValue) {
          option.selected = false;
          continue;
        }

        option.selected = true;
        predefinedValueFound = true;
      }

      if (!predefinedValueFound) {
        items.customScaleOption.textContent = msg;
        items.customScaleOption.selected = true;
      }
    });
  }

  updateLoadingIndicatorState(loading = false) {
    const pageNumberInput = this.items.pageNumber;
    pageNumberInput.classList.toggle(PAGE_NUMBER_LOADING_INDICATOR, loading);
  }

  async _adjustScaleWidth() {
    const {
      items,
      l10n
    } = this;
    const predefinedValuesPromise = Promise.all([l10n.get("page_scale_auto", null, "Automatic Zoom"), l10n.get("page_scale_actual", null, "Actual Size"), l10n.get("page_scale_fit", null, "Page Fit"), l10n.get("page_scale_width", null, "Page Width")]);
    let canvas = document.createElement("canvas");
    canvas.mozOpaque = true;
    let ctx = canvas.getContext("2d", {
      alpha: false
    });
    await _ui_utils.animationStarted;
    const {
      fontSize,
      fontFamily
    } = getComputedStyle(items.scaleSelect);
    ctx.font = `${fontSize} ${fontFamily}`;
    let maxWidth = 0;

    for (const predefinedValue of await predefinedValuesPromise) {
      const {
        width
      } = ctx.measureText(predefinedValue);

      if (width > maxWidth) {
        maxWidth = width;
      }
    }

    const overflow = SCALE_SELECT_WIDTH - SCALE_SELECT_CONTAINER_WIDTH;
    maxWidth += 1.5 * overflow;

    if (maxWidth > SCALE_SELECT_CONTAINER_WIDTH) {
      items.scaleSelect.style.width = `${maxWidth + overflow}px`;
      items.scaleSelectContainer.style.width = `${maxWidth}px`;
    }

    canvas.width = 0;
    canvas.height = 0;
    canvas = ctx = null;
  }

}

exports.Toolbar = Toolbar;

/***/ }),
/* 32 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ViewHistory = void 0;
const DEFAULT_VIEW_HISTORY_CACHE_SIZE = 20;

class ViewHistory {
  constructor(fingerprint, cacheSize = DEFAULT_VIEW_HISTORY_CACHE_SIZE) {
    this.fingerprint = fingerprint;
    this.cacheSize = cacheSize;
    this._initializedPromise = this._readFromStorage().then(databaseStr => {
      const database = JSON.parse(databaseStr || "{}");
      let index = -1;

      if (!Array.isArray(database.files)) {
        database.files = [];
      } else {
        while (database.files.length >= this.cacheSize) {
          database.files.shift();
        }

        for (let i = 0, ii = database.files.length; i < ii; i++) {
          const branch = database.files[i];

          if (branch.fingerprint === this.fingerprint) {
            index = i;
            break;
          }
        }
      }

      if (index === -1) {
        index = database.files.push({
          fingerprint: this.fingerprint
        }) - 1;
      }

      this.file = database.files[index];
      this.database = database;
    });
  }

  async _writeToStorage() {
    const databaseStr = JSON.stringify(this.database);
    localStorage.setItem("pdfjs.history", databaseStr);
  }

  async _readFromStorage() {
    return localStorage.getItem("pdfjs.history");
  }

  async set(name, val) {
    await this._initializedPromise;
    this.file[name] = val;
    return this._writeToStorage();
  }

  async setMultiple(properties) {
    await this._initializedPromise;

    for (const name in properties) {
      this.file[name] = properties[name];
    }

    return this._writeToStorage();
  }

  async get(name, defaultValue) {
    await this._initializedPromise;
    const val = this.file[name];
    return val !== undefined ? val : defaultValue;
  }

  async getMultiple(properties) {
    await this._initializedPromise;
    const values = Object.create(null);

    for (const name in properties) {
      const val = this.file[name];
      values[name] = val !== undefined ? val : properties[name];
    }

    return values;
  }

}

exports.ViewHistory = ViewHistory;

/***/ }),
/* 33 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GenericCom = void 0;

var _app = __webpack_require__(1);

var _preferences = __webpack_require__(34);

var _download_manager = __webpack_require__(35);

var _genericl10n = __webpack_require__(36);

;
const GenericCom = {};
exports.GenericCom = GenericCom;

class GenericPreferences extends _preferences.BasePreferences {
  async _writeToStorage(prefObj) {
    localStorage.setItem("pdfjs.preferences", JSON.stringify(prefObj));
  }

  async _readFromStorage(prefObj) {
    return JSON.parse(localStorage.getItem("pdfjs.preferences"));
  }

}

class GenericExternalServices extends _app.DefaultExternalServices {
  static createDownloadManager(options) {
    return new _download_manager.DownloadManager(options);
  }

  static createPreferences() {
    return new GenericPreferences();
  }

  static createL10n({
    locale = "en-US"
  }) {
    return new _genericl10n.GenericL10n(locale);
  }

}

_app.PDFViewerApplication.externalServices = GenericExternalServices;

/***/ }),
/* 34 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.BasePreferences = void 0;
let defaultPreferences = null;

function getDefaultPreferences() {
  if (!defaultPreferences) {
    defaultPreferences = Promise.resolve({
      "cursorToolOnLoad": 0,
      "defaultZoomValue": "",
      "disablePageLabels": false,
      "enablePrintAutoRotate": false,
      "enableWebGL": false,
      "eventBusDispatchToDOM": false,
      "externalLinkTarget": 0,
      "historyUpdateUrl": false,
      "ignoreDestinationZoom": false,
      "pdfBugEnabled": false,
      "renderer": "canvas",
      "renderInteractiveForms": false,
      "sidebarViewOnLoad": -1,
      "scrollModeOnLoad": -1,
      "spreadModeOnLoad": -1,
      "textLayerMode": 1,
      "useOnlyCssZoom": false,
      "viewOnLoad": 0,
      "disableAutoFetch": false,
      "disableFontFace": false,
      "disableRange": false,
      "disableStream": false
    });
  }

  return defaultPreferences;
}

class BasePreferences {
  constructor() {
    if (this.constructor === BasePreferences) {
      throw new Error("Cannot initialize BasePreferences.");
    }

    this.prefs = null;
    this._initializedPromise = getDefaultPreferences().then(defaults => {
      Object.defineProperty(this, "defaults", {
        value: Object.freeze(defaults),
        writable: false,
        enumerable: true,
        configurable: false
      });
      this.prefs = Object.assign(Object.create(null), defaults);
      return this._readFromStorage(defaults);
    }).then(prefs => {
      if (!prefs) {
        return;
      }

      for (const name in prefs) {
        const defaultValue = this.defaults[name],
              prefValue = prefs[name];

        if (defaultValue === undefined || typeof prefValue !== typeof defaultValue) {
          continue;
        }

        this.prefs[name] = prefValue;
      }
    });
  }

  async _writeToStorage(prefObj) {
    throw new Error("Not implemented: _writeToStorage");
  }

  async _readFromStorage(prefObj) {
    throw new Error("Not implemented: _readFromStorage");
  }

  async reset() {
    await this._initializedPromise;
    this.prefs = Object.assign(Object.create(null), this.defaults);
    return this._writeToStorage(this.defaults);
  }

  async set(name, value) {
    await this._initializedPromise;
    const defaultValue = this.defaults[name];

    if (defaultValue === undefined) {
      throw new Error(`Set preference: "${name}" is undefined.`);
    } else if (value === undefined) {
      throw new Error("Set preference: no value is specified.");
    }

    const valueType = typeof value;
    const defaultType = typeof defaultValue;

    if (valueType !== defaultType) {
      if (valueType === "number" && defaultType === "string") {
        value = value.toString();
      } else {
        throw new Error(`Set preference: "${value}" is a ${valueType}, ` + `expected a ${defaultType}.`);
      }
    } else {
      if (valueType === "number" && !Number.isInteger(value)) {
        throw new Error(`Set preference: "${value}" must be an integer.`);
      }
    }

    this.prefs[name] = value;
    return this._writeToStorage(this.prefs);
  }

  async get(name) {
    await this._initializedPromise;
    const defaultValue = this.defaults[name];

    if (defaultValue === undefined) {
      throw new Error(`Get preference: "${name}" is undefined.`);
    } else {
      const prefValue = this.prefs[name];

      if (prefValue !== undefined) {
        return prefValue;
      }
    }

    return defaultValue;
  }

  async getAll() {
    await this._initializedPromise;
    return Object.assign(Object.create(null), this.defaults, this.prefs);
  }

}

exports.BasePreferences = BasePreferences;

/***/ }),
/* 35 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DownloadManager = void 0;

var _pdfjsLib = __webpack_require__(4);

;
const DISABLE_CREATE_OBJECT_URL = _pdfjsLib.apiCompatibilityParams.disableCreateObjectURL || false;

function download(blobUrl, filename) {
  const a = document.createElement("a");

  if (!a.click) {
    throw new Error('DownloadManager: "a.click()" is not supported.');
  }

  a.href = blobUrl;
  a.target = "_parent";

  if ("download" in a) {
    a.download = filename;
  }

  (document.body || document.documentElement).appendChild(a);
  a.click();
  a.remove();
}

class DownloadManager {
  constructor({
    disableCreateObjectURL = DISABLE_CREATE_OBJECT_URL
  }) {
    this.disableCreateObjectURL = disableCreateObjectURL;
  }

  downloadUrl(url, filename) {
    if (!(0, _pdfjsLib.createValidAbsoluteUrl)(url, "http://example.com")) {
      return;
    }

    download(url + "#pdfjs.action=download", filename);
  }

  downloadData(data, filename, contentType) {
    if (navigator.msSaveBlob) {
      navigator.msSaveBlob(new Blob([data], {
        type: contentType
      }), filename);
      return;
    }

    const blobUrl = (0, _pdfjsLib.createObjectURL)(data, contentType, this.disableCreateObjectURL);
    download(blobUrl, filename);
  }

  download(blob, url, filename) {
    if (navigator.msSaveBlob) {
      if (!navigator.msSaveBlob(blob, filename)) {
        this.downloadUrl(url, filename);
      }

      return;
    }

    if (this.disableCreateObjectURL) {
      this.downloadUrl(url, filename);
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    download(blobUrl, filename);
  }

}

exports.DownloadManager = DownloadManager;

/***/ }),
/* 36 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GenericL10n = void 0;

__webpack_require__(37);

const webL10n = document.webL10n;

class GenericL10n {
  constructor(lang) {
    this._lang = lang;
    this._ready = new Promise((resolve, reject) => {
      webL10n.setLanguage(lang, () => {
        resolve(webL10n);
      });
    });
  }

  async getLanguage() {
    const l10n = await this._ready;
    return l10n.getLanguage();
  }

  async getDirection() {
    const l10n = await this._ready;
    return l10n.getDirection();
  }

  async get(property, args, fallback) {
    const l10n = await this._ready;
    return l10n.get(property, args, fallback);
  }

  async translate(element) {
    const l10n = await this._ready;
    return l10n.translate(element);
  }

}

exports.GenericL10n = GenericL10n;

/***/ }),
/* 37 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


document.webL10n = function (window, document, undefined) {
  var gL10nData = {};
  var gTextData = '';
  var gTextProp = 'textContent';
  var gLanguage = '';
  var gMacros = {};
  var gReadyState = 'loading';
  var gAsyncResourceLoading = true;

  function getL10nResourceLinks() {
    return document.querySelectorAll('link[type="application/l10n"]');
  }

  function getL10nDictionary() {
    var script = document.querySelector('script[type="application/l10n"]');
    return script ? JSON.parse(script.innerHTML) : null;
  }

  function getTranslatableChildren(element) {
    return element ? element.querySelectorAll('*[data-l10n-id]') : [];
  }

  function getL10nAttributes(element) {
    if (!element) return {};
    var l10nId = element.getAttribute('data-l10n-id');
    var l10nArgs = element.getAttribute('data-l10n-args');
    var args = {};

    if (l10nArgs) {
      try {
        args = JSON.parse(l10nArgs);
      } catch (e) {
        console.warn('could not parse arguments for #' + l10nId);
      }
    }

    return {
      id: l10nId,
      args: args
    };
  }

  function xhrLoadText(url, onSuccess, onFailure) {
    onSuccess = onSuccess || function _onSuccess(data) {};

    onFailure = onFailure || function _onFailure() {};

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, gAsyncResourceLoading);

    if (xhr.overrideMimeType) {
      xhr.overrideMimeType('text/plain; charset=utf-8');
    }

    xhr.onreadystatechange = function () {
      if (xhr.readyState == 4) {
        if (xhr.status == 200 || xhr.status === 0) {
          onSuccess(xhr.responseText);
        } else {
          onFailure();
        }
      }
    };

    xhr.onerror = onFailure;
    xhr.ontimeout = onFailure;

    try {
      xhr.send(null);
    } catch (e) {
      onFailure();
    }
  }

  function parseResource(href, lang, successCallback, failureCallback) {
    var baseURL = href.replace(/[^\/]*$/, '') || './';

    function evalString(text) {
      if (text.lastIndexOf('\\') < 0) return text;
      return text.replace(/\\\\/g, '\\').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\b/g, '\b').replace(/\\f/g, '\f').replace(/\\{/g, '{').replace(/\\}/g, '}').replace(/\\"/g, '"').replace(/\\'/g, "'");
    }

    function parseProperties(text, parsedPropertiesCallback) {
      var dictionary = {};
      var reBlank = /^\s*|\s*$/;
      var reComment = /^\s*#|^\s*$/;
      var reSection = /^\s*\[(.*)\]\s*$/;
      var reImport = /^\s*@import\s+url\((.*)\)\s*$/i;
      var reSplit = /^([^=\s]*)\s*=\s*(.+)$/;

      function parseRawLines(rawText, extendedSyntax, parsedRawLinesCallback) {
        var entries = rawText.replace(reBlank, '').split(/[\r\n]+/);
        var currentLang = '*';
        var genericLang = lang.split('-', 1)[0];
        var skipLang = false;
        var match = '';

        function nextEntry() {
          while (true) {
            if (!entries.length) {
              parsedRawLinesCallback();
              return;
            }

            var line = entries.shift();
            if (reComment.test(line)) continue;

            if (extendedSyntax) {
              match = reSection.exec(line);

              if (match) {
                currentLang = match[1].toLowerCase();
                skipLang = currentLang !== '*' && currentLang !== lang && currentLang !== genericLang;
                continue;
              } else if (skipLang) {
                continue;
              }

              match = reImport.exec(line);

              if (match) {
                loadImport(baseURL + match[1], nextEntry);
                return;
              }
            }

            var tmp = line.match(reSplit);

            if (tmp && tmp.length == 3) {
              dictionary[tmp[1]] = evalString(tmp[2]);
            }
          }
        }

        nextEntry();
      }

      function loadImport(url, callback) {
        xhrLoadText(url, function (content) {
          parseRawLines(content, false, callback);
        }, function () {
          console.warn(url + ' not found.');
          callback();
        });
      }

      parseRawLines(text, true, function () {
        parsedPropertiesCallback(dictionary);
      });
    }

    xhrLoadText(href, function (response) {
      gTextData += response;
      parseProperties(response, function (data) {
        for (var key in data) {
          var id,
              prop,
              index = key.lastIndexOf('.');

          if (index > 0) {
            id = key.substring(0, index);
            prop = key.substring(index + 1);
          } else {
            id = key;
            prop = gTextProp;
          }

          if (!gL10nData[id]) {
            gL10nData[id] = {};
          }

          gL10nData[id][prop] = data[key];
        }

        if (successCallback) {
          successCallback();
        }
      });
    }, failureCallback);
  }

  function loadLocale(lang, callback) {
    if (lang) {
      lang = lang.toLowerCase();
    }

    callback = callback || function _callback() {};

    clear();
    gLanguage = lang;
    var langLinks = getL10nResourceLinks();
    var langCount = langLinks.length;

    if (langCount === 0) {
      var dict = getL10nDictionary();

      if (dict && dict.locales && dict.default_locale) {
        console.log('using the embedded JSON directory, early way out');
        gL10nData = dict.locales[lang];

        if (!gL10nData) {
          var defaultLocale = dict.default_locale.toLowerCase();

          for (var anyCaseLang in dict.locales) {
            anyCaseLang = anyCaseLang.toLowerCase();

            if (anyCaseLang === lang) {
              gL10nData = dict.locales[lang];
              break;
            } else if (anyCaseLang === defaultLocale) {
              gL10nData = dict.locales[defaultLocale];
            }
          }
        }

        callback();
      } else {
        console.log('no resource to load, early way out');
      }

      gReadyState = 'complete';
      return;
    }

    var onResourceLoaded = null;
    var gResourceCount = 0;

    onResourceLoaded = function () {
      gResourceCount++;

      if (gResourceCount >= langCount) {
        callback();
        gReadyState = 'complete';
      }
    };

    function L10nResourceLink(link) {
      var href = link.href;

      this.load = function (lang, callback) {
        parseResource(href, lang, callback, function () {
          console.warn(href + ' not found.');
          console.warn('"' + lang + '" resource not found');
          gLanguage = '';
          callback();
        });
      };
    }

    for (var i = 0; i < langCount; i++) {
      var resource = new L10nResourceLink(langLinks[i]);
      resource.load(lang, onResourceLoaded);
    }
  }

  function clear() {
    gL10nData = {};
    gTextData = '';
    gLanguage = '';
  }

  function getPluralRules(lang) {
    var locales2rules = {
      'af': 3,
      'ak': 4,
      'am': 4,
      'ar': 1,
      'asa': 3,
      'az': 0,
      'be': 11,
      'bem': 3,
      'bez': 3,
      'bg': 3,
      'bh': 4,
      'bm': 0,
      'bn': 3,
      'bo': 0,
      'br': 20,
      'brx': 3,
      'bs': 11,
      'ca': 3,
      'cgg': 3,
      'chr': 3,
      'cs': 12,
      'cy': 17,
      'da': 3,
      'de': 3,
      'dv': 3,
      'dz': 0,
      'ee': 3,
      'el': 3,
      'en': 3,
      'eo': 3,
      'es': 3,
      'et': 3,
      'eu': 3,
      'fa': 0,
      'ff': 5,
      'fi': 3,
      'fil': 4,
      'fo': 3,
      'fr': 5,
      'fur': 3,
      'fy': 3,
      'ga': 8,
      'gd': 24,
      'gl': 3,
      'gsw': 3,
      'gu': 3,
      'guw': 4,
      'gv': 23,
      'ha': 3,
      'haw': 3,
      'he': 2,
      'hi': 4,
      'hr': 11,
      'hu': 0,
      'id': 0,
      'ig': 0,
      'ii': 0,
      'is': 3,
      'it': 3,
      'iu': 7,
      'ja': 0,
      'jmc': 3,
      'jv': 0,
      'ka': 0,
      'kab': 5,
      'kaj': 3,
      'kcg': 3,
      'kde': 0,
      'kea': 0,
      'kk': 3,
      'kl': 3,
      'km': 0,
      'kn': 0,
      'ko': 0,
      'ksb': 3,
      'ksh': 21,
      'ku': 3,
      'kw': 7,
      'lag': 18,
      'lb': 3,
      'lg': 3,
      'ln': 4,
      'lo': 0,
      'lt': 10,
      'lv': 6,
      'mas': 3,
      'mg': 4,
      'mk': 16,
      'ml': 3,
      'mn': 3,
      'mo': 9,
      'mr': 3,
      'ms': 0,
      'mt': 15,
      'my': 0,
      'nah': 3,
      'naq': 7,
      'nb': 3,
      'nd': 3,
      'ne': 3,
      'nl': 3,
      'nn': 3,
      'no': 3,
      'nr': 3,
      'nso': 4,
      'ny': 3,
      'nyn': 3,
      'om': 3,
      'or': 3,
      'pa': 3,
      'pap': 3,
      'pl': 13,
      'ps': 3,
      'pt': 3,
      'rm': 3,
      'ro': 9,
      'rof': 3,
      'ru': 11,
      'rwk': 3,
      'sah': 0,
      'saq': 3,
      'se': 7,
      'seh': 3,
      'ses': 0,
      'sg': 0,
      'sh': 11,
      'shi': 19,
      'sk': 12,
      'sl': 14,
      'sma': 7,
      'smi': 7,
      'smj': 7,
      'smn': 7,
      'sms': 7,
      'sn': 3,
      'so': 3,
      'sq': 3,
      'sr': 11,
      'ss': 3,
      'ssy': 3,
      'st': 3,
      'sv': 3,
      'sw': 3,
      'syr': 3,
      'ta': 3,
      'te': 3,
      'teo': 3,
      'th': 0,
      'ti': 4,
      'tig': 3,
      'tk': 3,
      'tl': 4,
      'tn': 3,
      'to': 0,
      'tr': 0,
      'ts': 3,
      'tzm': 22,
      'uk': 11,
      'ur': 3,
      've': 3,
      'vi': 0,
      'vun': 3,
      'wa': 4,
      'wae': 3,
      'wo': 0,
      'xh': 3,
      'xog': 3,
      'yo': 0,
      'zh': 0,
      'zu': 3
    };

    function isIn(n, list) {
      return list.indexOf(n) !== -1;
    }

    function isBetween(n, start, end) {
      return start <= n && n <= end;
    }

    var pluralRules = {
      '0': function (n) {
        return 'other';
      },
      '1': function (n) {
        if (isBetween(n % 100, 3, 10)) return 'few';
        if (n === 0) return 'zero';
        if (isBetween(n % 100, 11, 99)) return 'many';
        if (n == 2) return 'two';
        if (n == 1) return 'one';
        return 'other';
      },
      '2': function (n) {
        if (n !== 0 && n % 10 === 0) return 'many';
        if (n == 2) return 'two';
        if (n == 1) return 'one';
        return 'other';
      },
      '3': function (n) {
        if (n == 1) return 'one';
        return 'other';
      },
      '4': function (n) {
        if (isBetween(n, 0, 1)) return 'one';
        return 'other';
      },
      '5': function (n) {
        if (isBetween(n, 0, 2) && n != 2) return 'one';
        return 'other';
      },
      '6': function (n) {
        if (n === 0) return 'zero';
        if (n % 10 == 1 && n % 100 != 11) return 'one';
        return 'other';
      },
      '7': function (n) {
        if (n == 2) return 'two';
        if (n == 1) return 'one';
        return 'other';
      },
      '8': function (n) {
        if (isBetween(n, 3, 6)) return 'few';
        if (isBetween(n, 7, 10)) return 'many';
        if (n == 2) return 'two';
        if (n == 1) return 'one';
        return 'other';
      },
      '9': function (n) {
        if (n === 0 || n != 1 && isBetween(n % 100, 1, 19)) return 'few';
        if (n == 1) return 'one';
        return 'other';
      },
      '10': function (n) {
        if (isBetween(n % 10, 2, 9) && !isBetween(n % 100, 11, 19)) return 'few';
        if (n % 10 == 1 && !isBetween(n % 100, 11, 19)) return 'one';
        return 'other';
      },
      '11': function (n) {
        if (isBetween(n % 10, 2, 4) && !isBetween(n % 100, 12, 14)) return 'few';
        if (n % 10 === 0 || isBetween(n % 10, 5, 9) || isBetween(n % 100, 11, 14)) return 'many';
        if (n % 10 == 1 && n % 100 != 11) return 'one';
        return 'other';
      },
      '12': function (n) {
        if (isBetween(n, 2, 4)) return 'few';
        if (n == 1) return 'one';
        return 'other';
      },
      '13': function (n) {
        if (isBetween(n % 10, 2, 4) && !isBetween(n % 100, 12, 14)) return 'few';
        if (n != 1 && isBetween(n % 10, 0, 1) || isBetween(n % 10, 5, 9) || isBetween(n % 100, 12, 14)) return 'many';
        if (n == 1) return 'one';
        return 'other';
      },
      '14': function (n) {
        if (isBetween(n % 100, 3, 4)) return 'few';
        if (n % 100 == 2) return 'two';
        if (n % 100 == 1) return 'one';
        return 'other';
      },
      '15': function (n) {
        if (n === 0 || isBetween(n % 100, 2, 10)) return 'few';
        if (isBetween(n % 100, 11, 19)) return 'many';
        if (n == 1) return 'one';
        return 'other';
      },
      '16': function (n) {
        if (n % 10 == 1 && n != 11) return 'one';
        return 'other';
      },
      '17': function (n) {
        if (n == 3) return 'few';
        if (n === 0) return 'zero';
        if (n == 6) return 'many';
        if (n == 2) return 'two';
        if (n == 1) return 'one';
        return 'other';
      },
      '18': function (n) {
        if (n === 0) return 'zero';
        if (isBetween(n, 0, 2) && n !== 0 && n != 2) return 'one';
        return 'other';
      },
      '19': function (n) {
        if (isBetween(n, 2, 10)) return 'few';
        if (isBetween(n, 0, 1)) return 'one';
        return 'other';
      },
      '20': function (n) {
        if ((isBetween(n % 10, 3, 4) || n % 10 == 9) && !(isBetween(n % 100, 10, 19) || isBetween(n % 100, 70, 79) || isBetween(n % 100, 90, 99))) return 'few';
        if (n % 1000000 === 0 && n !== 0) return 'many';
        if (n % 10 == 2 && !isIn(n % 100, [12, 72, 92])) return 'two';
        if (n % 10 == 1 && !isIn(n % 100, [11, 71, 91])) return 'one';
        return 'other';
      },
      '21': function (n) {
        if (n === 0) return 'zero';
        if (n == 1) return 'one';
        return 'other';
      },
      '22': function (n) {
        if (isBetween(n, 0, 1) || isBetween(n, 11, 99)) return 'one';
        return 'other';
      },
      '23': function (n) {
        if (isBetween(n % 10, 1, 2) || n % 20 === 0) return 'one';
        return 'other';
      },
      '24': function (n) {
        if (isBetween(n, 3, 10) || isBetween(n, 13, 19)) return 'few';
        if (isIn(n, [2, 12])) return 'two';
        if (isIn(n, [1, 11])) return 'one';
        return 'other';
      }
    };
    var index = locales2rules[lang.replace(/-.*$/, '')];

    if (!(index in pluralRules)) {
      console.warn('plural form unknown for [' + lang + ']');
      return function () {
        return 'other';
      };
    }

    return pluralRules[index];
  }

  gMacros.plural = function (str, param, key, prop) {
    var n = parseFloat(param);
    if (isNaN(n)) return str;
    if (prop != gTextProp) return str;

    if (!gMacros._pluralRules) {
      gMacros._pluralRules = getPluralRules(gLanguage);
    }

    var index = '[' + gMacros._pluralRules(n) + ']';

    if (n === 0 && key + '[zero]' in gL10nData) {
      str = gL10nData[key + '[zero]'][prop];
    } else if (n == 1 && key + '[one]' in gL10nData) {
      str = gL10nData[key + '[one]'][prop];
    } else if (n == 2 && key + '[two]' in gL10nData) {
      str = gL10nData[key + '[two]'][prop];
    } else if (key + index in gL10nData) {
      str = gL10nData[key + index][prop];
    } else if (key + '[other]' in gL10nData) {
      str = gL10nData[key + '[other]'][prop];
    }

    return str;
  };

  function getL10nData(key, args, fallback) {
    var data = gL10nData[key];

    if (!data) {
      console.warn('#' + key + ' is undefined.');

      if (!fallback) {
        return null;
      }

      data = fallback;
    }

    var rv = {};

    for (var prop in data) {
      var str = data[prop];
      str = substIndexes(str, args, key, prop);
      str = substArguments(str, args, key);
      rv[prop] = str;
    }

    return rv;
  }

  function substIndexes(str, args, key, prop) {
    var reIndex = /\{\[\s*([a-zA-Z]+)\(([a-zA-Z]+)\)\s*\]\}/;
    var reMatch = reIndex.exec(str);
    if (!reMatch || !reMatch.length) return str;
    var macroName = reMatch[1];
    var paramName = reMatch[2];
    var param;

    if (args && paramName in args) {
      param = args[paramName];
    } else if (paramName in gL10nData) {
      param = gL10nData[paramName];
    }

    if (macroName in gMacros) {
      var macro = gMacros[macroName];
      str = macro(str, param, key, prop);
    }

    return str;
  }

  function substArguments(str, args, key) {
    var reArgs = /\{\{\s*(.+?)\s*\}\}/g;
    return str.replace(reArgs, function (matched_text, arg) {
      if (args && arg in args) {
        return args[arg];
      }

      if (arg in gL10nData) {
        return gL10nData[arg];
      }

      console.log('argument {{' + arg + '}} for #' + key + ' is undefined.');
      return matched_text;
    });
  }

  function translateElement(element) {
    var l10n = getL10nAttributes(element);
    if (!l10n.id) return;
    var data = getL10nData(l10n.id, l10n.args);

    if (!data) {
      console.warn('#' + l10n.id + ' is undefined.');
      return;
    }

    if (data[gTextProp]) {
      if (getChildElementCount(element) === 0) {
        element[gTextProp] = data[gTextProp];
      } else {
        var children = element.childNodes;
        var found = false;

        for (var i = 0, l = children.length; i < l; i++) {
          if (children[i].nodeType === 3 && /\S/.test(children[i].nodeValue)) {
            if (found) {
              children[i].nodeValue = '';
            } else {
              children[i].nodeValue = data[gTextProp];
              found = true;
            }
          }
        }

        if (!found) {
          var textNode = document.createTextNode(data[gTextProp]);
          element.insertBefore(textNode, element.firstChild);
        }
      }

      delete data[gTextProp];
    }

    for (var k in data) {
      element[k] = data[k];
    }
  }

  function getChildElementCount(element) {
    if (element.children) {
      return element.children.length;
    }

    if (typeof element.childElementCount !== 'undefined') {
      return element.childElementCount;
    }

    var count = 0;

    for (var i = 0; i < element.childNodes.length; i++) {
      count += element.nodeType === 1 ? 1 : 0;
    }

    return count;
  }

  function translateFragment(element) {
    element = element || document.documentElement;
    var children = getTranslatableChildren(element);
    var elementCount = children.length;

    for (var i = 0; i < elementCount; i++) {
      translateElement(children[i]);
    }

    translateElement(element);
  }

  return {
    get: function (key, args, fallbackString) {
      var index = key.lastIndexOf('.');
      var prop = gTextProp;

      if (index > 0) {
        prop = key.substring(index + 1);
        key = key.substring(0, index);
      }

      var fallback;

      if (fallbackString) {
        fallback = {};
        fallback[prop] = fallbackString;
      }

      var data = getL10nData(key, args, fallback);

      if (data && prop in data) {
        return data[prop];
      }

      return '{{' + key + '}}';
    },
    getData: function () {
      return gL10nData;
    },
    getText: function () {
      return gTextData;
    },
    getLanguage: function () {
      return gLanguage;
    },
    setLanguage: function (lang, callback) {
      loadLocale(lang, function () {
        if (callback) callback();
      });
    },
    getDirection: function () {
      var rtlList = ['ar', 'he', 'fa', 'ps', 'ur'];
      var shortCode = gLanguage.split('-', 1)[0];
      return rtlList.indexOf(shortCode) >= 0 ? 'rtl' : 'ltr';
    },
    translate: translateFragment,
    getReadyState: function () {
      return gReadyState;
    },
    ready: function (callback) {
      if (!callback) {
        return;
      } else if (gReadyState == 'complete' || gReadyState == 'interactive') {
        window.setTimeout(function () {
          callback();
        });
      } else if (document.addEventListener) {
        document.addEventListener('localized', function once() {
          document.removeEventListener('localized', once);
          callback();
        });
      }
    }
  };
}(window, document);

/***/ }),
/* 38 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFPrintService = PDFPrintService;

var _ui_utils = __webpack_require__(2);

var _app = __webpack_require__(1);

var _app_options = __webpack_require__(3);

let activeService = null;
let overlayManager = null;

function renderPage(activeServiceOnEntry, pdfDocument, pageNumber, size) {
  const scratchCanvas = activeService.scratchCanvas;
  const PRINT_RESOLUTION = _app_options.AppOptions.get("printResolution") || 150;
  const PRINT_UNITS = PRINT_RESOLUTION / 72.0;
  scratchCanvas.width = Math.floor(size.width * PRINT_UNITS);
  scratchCanvas.height = Math.floor(size.height * PRINT_UNITS);
  const width = Math.floor(size.width * _ui_utils.CSS_UNITS) + "px";
  const height = Math.floor(size.height * _ui_utils.CSS_UNITS) + "px";
  const ctx = scratchCanvas.getContext("2d");
  ctx.save();
  ctx.fillStyle = "rgb(255, 255, 255)";
  ctx.fillRect(0, 0, scratchCanvas.width, scratchCanvas.height);
  ctx.restore();
  return pdfDocument.getPage(pageNumber).then(function (pdfPage) {
    const renderContext = {
      canvasContext: ctx,
      transform: [PRINT_UNITS, 0, 0, PRINT_UNITS, 0, 0],
      viewport: pdfPage.getViewport({
        scale: 1,
        rotation: size.rotation
      }),
      intent: "print"
    };
    return pdfPage.render(renderContext).promise;
  }).then(function () {
    return {
      width,
      height
    };
  });
}

function PDFPrintService(pdfDocument, pagesOverview, printContainer, l10n) {
  this.pdfDocument = pdfDocument;
  this.pagesOverview = pagesOverview;
  this.printContainer = printContainer;
  this.l10n = l10n || _ui_utils.NullL10n;
  this.disableCreateObjectURL = pdfDocument.loadingParams["disableCreateObjectURL"];
  this.currentPage = -1;
  this.scratchCanvas = document.createElement("canvas");
}

PDFPrintService.prototype = {
  layout() {
    this.throwIfInactive();
    const body = document.querySelector("body");
    body.setAttribute("data-pdfjsprinting", true);
    const hasEqualPageSizes = this.pagesOverview.every(function (size) {
      return size.width === this.pagesOverview[0].width && size.height === this.pagesOverview[0].height;
    }, this);

    if (!hasEqualPageSizes) {
      console.warn("Not all pages have the same size. The printed " + "result may be incorrect!");
    }

    this.pageStyleSheet = document.createElement("style");
    const pageSize = this.pagesOverview[0];
    this.pageStyleSheet.textContent = "@supports ((size:A4) and (size:1pt 1pt)) {" + "@page { size: " + pageSize.width + "pt " + pageSize.height + "pt;}" + "}";
    body.appendChild(this.pageStyleSheet);
  },

  destroy() {
    if (activeService !== this) {
      return;
    }

    this.printContainer.textContent = "";
    const body = document.querySelector("body");
    body.removeAttribute("data-pdfjsprinting");

    if (this.pageStyleSheet) {
      this.pageStyleSheet.remove();
      this.pageStyleSheet = null;
    }

    this.scratchCanvas.width = this.scratchCanvas.height = 0;
    this.scratchCanvas = null;
    activeService = null;
    ensureOverlay().then(function () {
      if (overlayManager.active !== "printServiceOverlay") {
        return;
      }

      overlayManager.close("printServiceOverlay");
    });
  },

  renderPages() {
    const pageCount = this.pagesOverview.length;

    const renderNextPage = (resolve, reject) => {
      this.throwIfInactive();

      if (++this.currentPage >= pageCount) {
        renderProgress(pageCount, pageCount, this.l10n);
        resolve();
        return;
      }

      const index = this.currentPage;
      renderProgress(index, pageCount, this.l10n);
      renderPage(this, this.pdfDocument, index + 1, this.pagesOverview[index]).then(this.useRenderedPage.bind(this)).then(function () {
        renderNextPage(resolve, reject);
      }, reject);
    };

    return new Promise(renderNextPage);
  },

  useRenderedPage(printItem) {
    this.throwIfInactive();
    const img = document.createElement("img");
    img.style.width = printItem.width;
    img.style.height = printItem.height;
    const scratchCanvas = this.scratchCanvas;

    if ("toBlob" in scratchCanvas && !this.disableCreateObjectURL) {
      scratchCanvas.toBlob(function (blob) {
        img.src = URL.createObjectURL(blob);
      });
    } else {
      img.src = scratchCanvas.toDataURL();
    }

    const wrapper = document.createElement("div");
    wrapper.appendChild(img);
    this.printContainer.appendChild(wrapper);
    return new Promise(function (resolve, reject) {
      img.onload = resolve;
      img.onerror = reject;
    });
  },

  performPrint() {
    this.throwIfInactive();
    return new Promise(resolve => {
      setTimeout(() => {
        if (!this.active) {
          resolve();
          return;
        }

        print.call(window);
        setTimeout(resolve, 20);
      }, 0);
    });
  },

  get active() {
    return this === activeService;
  },

  throwIfInactive() {
    if (!this.active) {
      throw new Error("This print request was cancelled or completed.");
    }
  }

};
const print = window.print;

window.print = function () {
  if (activeService) {
    console.warn("Ignored window.print() because of a pending print job.");
    return;
  }

  ensureOverlay().then(function () {
    if (activeService) {
      overlayManager.open("printServiceOverlay");
    }
  });

  try {
    dispatchEvent("beforeprint");
  } finally {
    if (!activeService) {
      console.error("Expected print service to be initialized.");
      ensureOverlay().then(function () {
        if (overlayManager.active === "printServiceOverlay") {
          overlayManager.close("printServiceOverlay");
        }
      });
      return;
    }

    const activeServiceOnEntry = activeService;
    activeService.renderPages().then(function () {
      return activeServiceOnEntry.performPrint();
    }).catch(function () {}).then(function () {
      if (activeServiceOnEntry.active) {
        abort();
      }
    });
  }
};

function dispatchEvent(eventType) {
  const event = document.createEvent("CustomEvent");
  event.initCustomEvent(eventType, false, false, "custom");
  window.dispatchEvent(event);
}

function abort() {
  if (activeService) {
    activeService.destroy();
    dispatchEvent("afterprint");
  }
}

function renderProgress(index, total, l10n) {
  const progressContainer = document.getElementById("printServiceOverlay");
  const progress = Math.round(100 * index / total);
  const progressBar = progressContainer.querySelector("progress");
  const progressPerc = progressContainer.querySelector(".relative-progress");
  progressBar.value = progress;
  l10n.get("print_progress_percent", {
    progress
  }, progress + "%").then(msg => {
    progressPerc.textContent = msg;
  });
}

window.addEventListener("keydown", function (event) {
  if (event.keyCode === 80 && (event.ctrlKey || event.metaKey) && !event.altKey && (!event.shiftKey || window.chrome || window.opera)) {
    window.print();
    event.preventDefault();

    if (event.stopImmediatePropagation) {
      event.stopImmediatePropagation();
    } else {
      event.stopPropagation();
    }
  }
}, true);

if ("onbeforeprint" in window) {
  const stopPropagationIfNeeded = function (event) {
    if (event.detail !== "custom" && event.stopImmediatePropagation) {
      event.stopImmediatePropagation();
    }
  };

  window.addEventListener("beforeprint", stopPropagationIfNeeded);
  window.addEventListener("afterprint", stopPropagationIfNeeded);
}

let overlayPromise;

function ensureOverlay() {
  if (!overlayPromise) {
    overlayManager = _app.PDFViewerApplication.overlayManager;

    if (!overlayManager) {
      throw new Error("The overlay manager has not yet been initialized.");
    }

    overlayPromise = overlayManager.register("printServiceOverlay", document.getElementById("printServiceOverlay"), abort, true);
    document.getElementById("printCancel").onclick = abort;
  }

  return overlayPromise;
}

_app.PDFPrintServiceFactory.instance = {
  supportsPrinting: true,

  createPrintService(pdfDocument, pagesOverview, printContainer, l10n) {
    if (activeService) {
      throw new Error("The print service is created and active.");
    }

    activeService = new PDFPrintService(pdfDocument, pagesOverview, printContainer, l10n);
    return activeService;
  }

};

/***/ })
/******/ ]);
//# sourceMappingURL=viewer.js.map