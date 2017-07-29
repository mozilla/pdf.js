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
  animationStarted, DEFAULT_SCALE_VALUE, getPDFFileNameFromURL, MAX_SCALE,
  MIN_SCALE, noContextMenuHandler, normalizeWheelEventDelta,
  parseQueryString, ProgressBar, RendererType, UNKNOWN_SCALE
} from './ui_utils';
import {
  build, createBlob, getDocument, getFilenameFromUrl, InvalidPDFException,
  MissingPDFException, OPS, PDFJS, shadow, UnexpectedResponseException,
  UNSUPPORTED_FEATURES, version
} from 'pdfjs-lib';
import { CursorTool, PDFCursorTools } from './pdf_cursor_tools';
import { PDFRenderingQueue, RenderingStates } from './pdf_rendering_queue';
import { PDFSidebar, SidebarView } from './pdf_sidebar';
import { PDFViewer, PresentationModeState } from './pdf_viewer';
import { getGlobalEventBus } from './dom_events';
import { OverlayManager } from './overlay_manager';
import { PasswordPrompt } from './password_prompt';
import { PDFAttachmentViewer } from './pdf_attachment_viewer';
import { PDFDocumentProperties } from './pdf_document_properties';
import { PDFFindBar } from './pdf_find_bar';
import { PDFFindController } from './pdf_find_controller';
import { PDFHistory } from './pdf_history';
import { PDFLinkService } from './pdf_link_service';
import { PDFOutlineViewer } from './pdf_outline_viewer';
import { PDFPresentationMode } from './pdf_presentation_mode';
import { PDFThumbnailViewer } from './pdf_thumbnail_viewer';
import { SecondaryToolbar } from './secondary_toolbar';
import { Toolbar } from './toolbar';
import { ViewHistory } from './view_history';

const DEFAULT_SCALE_DELTA = 1.1;
const DISABLE_AUTO_FETCH_LOADING_BAR_TIMEOUT = 5000;

function configure(PDFJS) {
  PDFJS.imageResourcesPath = './images/';
  if (typeof PDFJSDev !== 'undefined' &&
      PDFJSDev.test('FIREFOX || MOZCENTRAL || GENERIC || CHROME')) {
    PDFJS.workerSrc = '../build/pdf.worker.js';
  }
  if (typeof PDFJSDev === 'undefined' || !PDFJSDev.test('PRODUCTION')) {
    PDFJS.cMapUrl = '../external/bcmaps/';
    PDFJS.cMapPacked = true;
    PDFJS.workerSrc = '../src/worker_loader.js';
    PDFJS.pdfjsNext = true;
  } else {
    PDFJS.cMapUrl = '../web/cmaps/';
    PDFJS.cMapPacked = true;
  }
}

const DefaultExternalServices = {
  updateFindControlState(data) {},
  initPassiveLoading(callbacks) {},
  fallback(data, callback) {},
  reportTelemetry(data) {},
  createDownloadManager() {
    throw new Error('Not implemented: createDownloadManager');
  },
  createPreferences() {
    throw new Error('Not implemented: createPreferences');
  },
  createL10n() {
    throw new Error('Not implemented: createL10n');
  },
  supportsIntegratedFind: false,
  supportsDocumentFonts: true,
  supportsDocumentColors: true,
  supportedMouseWheelZoomModifierKeys: {
    ctrlKey: true,
    metaKey: true,
  },
};

let PDFViewerApplication = {
  initialBookmark: document.location.hash.substring(1),
  initialDestination: null,
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
  viewerPrefs: {
    sidebarViewOnLoad: SidebarView.NONE,
    pdfBugEnabled: false,
    showPreviousViewOnLoad: true,
    defaultZoomValue: '',
    disablePageMode: false,
    disablePageLabels: false,
    renderer: 'canvas',
    enhanceTextSelection: false,
    renderInteractiveForms: false,
    enablePrintAutoRotate: false,
  },
  isViewerEmbedded: (window.parent !== window),
  url: '',
  baseUrl: '',
  externalServices: DefaultExternalServices,
  _boundEvents: {},

  // Called once when the document is loaded.
  initialize(appConfig) {
    this.preferences = this.externalServices.createPreferences();

    configure(PDFJS);
    this.appConfig = appConfig;

    return this._readPreferences().then(() => {
      return this._initializeL10n();
    }).then(() => {
      return this._initializeViewerComponents();
    }).then(() => {
      // Bind the various event handlers *after* the viewer has been
      // initialized, to prevent errors if an event arrives too soon.
      this.bindEvents();
      this.bindWindowEvents();

      // We can start UI localization now.
      let appContainer = appConfig.appContainer || document.documentElement;
      this.l10n.translate(appContainer).then(() => {
        // Dispatch the 'localized' event on the `eventBus` once the viewer
        // has been fully initialized and translated.
        this.eventBus.dispatch('localized');
      });

      if (this.isViewerEmbedded && !PDFJS.isExternalLinkTargetSet()) {
        // Prevent external links from "replacing" the viewer,
        // when it's embedded in e.g. an iframe or an object.
        PDFJS.externalLinkTarget = PDFJS.LinkTarget.TOP;
      }

      this.initialized = true;
    });
  },

  /**
   * @private
   */
  _readPreferences() {
    let { preferences, viewerPrefs, } = this;

    return Promise.all([
      preferences.get('enableWebGL').then(function resolved(value) {
        PDFJS.disableWebGL = !value;
      }),
      preferences.get('sidebarViewOnLoad').then(function resolved(value) {
        viewerPrefs['sidebarViewOnLoad'] = value;
      }),
      preferences.get('pdfBugEnabled').then(function resolved(value) {
        viewerPrefs['pdfBugEnabled'] = value;
      }),
      preferences.get('showPreviousViewOnLoad').then(function resolved(value) {
        viewerPrefs['showPreviousViewOnLoad'] = value;
      }),
      preferences.get('defaultZoomValue').then(function resolved(value) {
        viewerPrefs['defaultZoomValue'] = value;
      }),
      preferences.get('enhanceTextSelection').then(function resolved(value) {
        viewerPrefs['enhanceTextSelection'] = value;
      }),
      preferences.get('disableTextLayer').then(function resolved(value) {
        if (PDFJS.disableTextLayer === true) {
          return;
        }
        PDFJS.disableTextLayer = value;
      }),
      preferences.get('disableRange').then(function resolved(value) {
        if (PDFJS.disableRange === true) {
          return;
        }
        PDFJS.disableRange = value;
      }),
      preferences.get('disableStream').then(function resolved(value) {
        if (PDFJS.disableStream === true) {
          return;
        }
        PDFJS.disableStream = value;
      }),
      preferences.get('disableAutoFetch').then(function resolved(value) {
        PDFJS.disableAutoFetch = value;
      }),
      preferences.get('disableFontFace').then(function resolved(value) {
        if (PDFJS.disableFontFace === true) {
          return;
        }
        PDFJS.disableFontFace = value;
      }),
      preferences.get('useOnlyCssZoom').then(function resolved(value) {
        PDFJS.useOnlyCssZoom = value;
      }),
      preferences.get('externalLinkTarget').then(function resolved(value) {
        if (PDFJS.isExternalLinkTargetSet()) {
          return;
        }
        PDFJS.externalLinkTarget = value;
      }),
      preferences.get('renderer').then(function resolved(value) {
        viewerPrefs['renderer'] = value;
      }),
      preferences.get('renderInteractiveForms').then(function resolved(value) {
        viewerPrefs['renderInteractiveForms'] = value;
      }),
      preferences.get('disablePageMode').then(function resolved(value) {
        viewerPrefs['disablePageMode'] = value;
      }),
      preferences.get('disablePageLabels').then(function resolved(value) {
        viewerPrefs['disablePageLabels'] = value;
      }),
      preferences.get('enablePrintAutoRotate').then(function resolved(value) {
        viewerPrefs['enablePrintAutoRotate'] = value;
      }),
    ]).catch(function(reason) { });
  },

  _initializeL10n() {
    // Locale can be changed only when special debugging flags is present in
    // the hash section of the URL, or development version of viewer is used.
    // It is not possible to change locale for Firefox extension builds.
    if (typeof PDFJSDev === 'undefined' || !PDFJSDev.test('PRODUCTION') ||
        (!PDFJSDev.test('FIREFOX || MOZCENTRAL') &&
         this.viewerPrefs['pdfBugEnabled'])) {
      let hash = document.location.hash.substring(1);
      let hashParams = parseQueryString(hash);
      if ('locale' in hashParams) {
        PDFJS.locale = hashParams['locale'];
      }
    }
    this.l10n = this.externalServices.createL10n();
    return this.l10n.getDirection().then((dir) => {
      document.getElementsByTagName('html')[0].dir = dir;
    });
  },

  /**
   * @private
   */
  _initializeViewerComponents() {
    let appConfig = this.appConfig;

    return new Promise((resolve, reject) => {
      this.overlayManager = new OverlayManager();

      let eventBus = appConfig.eventBus || getGlobalEventBus();
      this.eventBus = eventBus;

      let pdfRenderingQueue = new PDFRenderingQueue();
      pdfRenderingQueue.onIdle = this.cleanup.bind(this);
      this.pdfRenderingQueue = pdfRenderingQueue;

      let pdfLinkService = new PDFLinkService({
        eventBus,
      });
      this.pdfLinkService = pdfLinkService;

      let downloadManager = this.externalServices.createDownloadManager();
      this.downloadManager = downloadManager;

      let container = appConfig.mainContainer;
      let viewer = appConfig.viewerContainer;
      this.pdfViewer = new PDFViewer({
        container,
        viewer,
        eventBus,
        renderingQueue: pdfRenderingQueue,
        linkService: pdfLinkService,
        downloadManager,
        renderer: this.viewerPrefs['renderer'],
        l10n: this.l10n,
        enhanceTextSelection: this.viewerPrefs['enhanceTextSelection'],
        renderInteractiveForms: this.viewerPrefs['renderInteractiveForms'],
        enablePrintAutoRotate: this.viewerPrefs['enablePrintAutoRotate'],
      });
      pdfRenderingQueue.setViewer(this.pdfViewer);
      pdfLinkService.setViewer(this.pdfViewer);

      let thumbnailContainer = appConfig.sidebar.thumbnailView;
      this.pdfThumbnailViewer = new PDFThumbnailViewer({
        container: thumbnailContainer,
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

      this.findController = new PDFFindController({
        pdfViewer: this.pdfViewer,
      });
      this.findController.onUpdateResultsCount = (matchCount) => {
        if (this.supportsIntegratedFind) {
          return;
        }
        this.findBar.updateResultsCount(matchCount);
      };
      this.findController.onUpdateState = (state, previous, matchCount) => {
        if (this.supportsIntegratedFind) {
          this.externalServices.updateFindControlState({
            result: state,
            findPrevious: previous,
          });
        } else {
          this.findBar.updateUIState(state, previous, matchCount);
        }
      };

      this.pdfViewer.setFindController(this.findController);

      // TODO: improve `PDFFindBar` constructor parameter passing
      let findBarConfig = Object.create(appConfig.findBar);
      findBarConfig.findController = this.findController;
      findBarConfig.eventBus = eventBus;
      this.findBar = new PDFFindBar(findBarConfig, this.l10n);

      this.pdfDocumentProperties =
        new PDFDocumentProperties(appConfig.documentProperties,
                                  this.overlayManager, this.l10n);

      this.pdfCursorTools = new PDFCursorTools({
        container,
        eventBus,
        preferences: this.preferences,
      });

      this.toolbar = new Toolbar(appConfig.toolbar, container, eventBus,
                                 this.l10n);

      this.secondaryToolbar =
        new SecondaryToolbar(appConfig.secondaryToolbar, container, eventBus);

      if (this.supportsFullscreen) {
        this.pdfPresentationMode = new PDFPresentationMode({
          container,
          viewer,
          pdfViewer: this.pdfViewer,
          eventBus,
          contextMenuItems: appConfig.fullscreen,
        });
      }

      this.passwordPrompt = new PasswordPrompt(appConfig.passwordOverlay,
                                               this.overlayManager, this.l10n);

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

      // TODO: improve `PDFSidebar` constructor parameter passing
      let sidebarConfig = Object.create(appConfig.sidebar);
      sidebarConfig.pdfViewer = this.pdfViewer;
      sidebarConfig.pdfThumbnailViewer = this.pdfThumbnailViewer;
      sidebarConfig.pdfOutlineViewer = this.pdfOutlineViewer;
      sidebarConfig.eventBus = eventBus;
      this.pdfSidebar = new PDFSidebar(sidebarConfig, this.l10n);
      this.pdfSidebar.onToggled = this.forceRendering.bind(this);

      resolve(undefined);
    });
  },

  run(config) {
    this.initialize(config).then(webViewerInitialized);
  },

  zoomIn(ticks) {
    let newScale = this.pdfViewer.currentScale;
    do {
      newScale = (newScale * DEFAULT_SCALE_DELTA).toFixed(2);
      newScale = Math.ceil(newScale * 10) / 10;
      newScale = Math.min(MAX_SCALE, newScale);
    } while (--ticks > 0 && newScale < MAX_SCALE);
    this.pdfViewer.currentScaleValue = newScale;
  },

  zoomOut(ticks) {
    let newScale = this.pdfViewer.currentScale;
    do {
      newScale = (newScale / DEFAULT_SCALE_DELTA).toFixed(2);
      newScale = Math.floor(newScale * 10) / 10;
      newScale = Math.max(MIN_SCALE, newScale);
    } while (--ticks > 0 && newScale > MIN_SCALE);
    this.pdfViewer.currentScaleValue = newScale;
  },

  get pagesCount() {
    return this.pdfDocument ? this.pdfDocument.numPages : 0;
  },

  get pageRotation() {
    return this.pdfViewer.pagesRotation;
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
    if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('MOZCENTRAL')) {
      support = document.fullscreenEnabled === true ||
                document.mozFullScreenEnabled === true;
    } else {
      let doc = document.documentElement;
      support = !!(doc.requestFullscreen || doc.mozRequestFullScreen ||
                   doc.webkitRequestFullScreen || doc.msRequestFullscreen);

      if (document.fullscreenEnabled === false ||
          document.mozFullScreenEnabled === false ||
          document.webkitFullscreenEnabled === false ||
          document.msFullscreenEnabled === false) {
        support = false;
      }
    }
    if (support && PDFJS.disableFullscreen === true) {
      support = false;
    }

    return shadow(this, 'supportsFullscreen', support);
  },

  get supportsIntegratedFind() {
    return this.externalServices.supportsIntegratedFind;
  },

  get supportsDocumentFonts() {
    return this.externalServices.supportsDocumentFonts;
  },

  get supportsDocumentColors() {
    return this.externalServices.supportsDocumentColors;
  },

  get loadingBar() {
    let bar = new ProgressBar('#loadingBar');
    return shadow(this, 'loadingBar', bar);
  },

  get supportedMouseWheelZoomModifierKeys() {
    return this.externalServices.supportedMouseWheelZoomModifierKeys;
  },

  initPassiveLoading() {
    if (typeof PDFJSDev === 'undefined' ||
        !PDFJSDev.test('FIREFOX || MOZCENTRAL || CHROME')) {
      throw new Error('Not implemented: initPassiveLoading');
    }
    this.externalServices.initPassiveLoading({
      onOpenWithTransport(url, length, transport) {
        PDFViewerApplication.open(url, { range: transport, });

        if (length) {
          PDFViewerApplication.pdfDocumentProperties.setFileSize(length);
        }
      },
      onOpenWithData(data) {
        PDFViewerApplication.open(data);
      },
      onOpenWithURL(url, length, originalURL) {
        let file = url, args = null;
        if (length !== undefined) {
          args = { length, };
        }
        if (originalURL !== undefined) {
          file = { file: url, originalURL, };
        }
        PDFViewerApplication.open(file, args);
      },
      onError(err) {
        PDFViewerApplication.l10n.get('loading_error', null,
            'An error occurred while loading the PDF.').then((msg) => {
          PDFViewerApplication.error(msg, err);
        });
      },
      onProgress(loaded, total) {
        PDFViewerApplication.progress(loaded / total);
      },
    });
  },

  setTitleUsingUrl(url) {
    this.url = url;
    this.baseUrl = url.split('#')[0];
    let title = getPDFFileNameFromURL(url, '');
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
  close() {
    let errorWrapper = this.appConfig.errorWrapper.container;
    errorWrapper.setAttribute('hidden', 'true');

    if (!this.pdfLoadingTask) {
      return Promise.resolve();
    }

    let promise = this.pdfLoadingTask.destroy();
    this.pdfLoadingTask = null;

    if (this.pdfDocument) {
      this.pdfDocument = null;

      this.pdfThumbnailViewer.setDocument(null);
      this.pdfViewer.setDocument(null);
      this.pdfLinkService.setDocument(null, null);
      this.pdfDocumentProperties.setDocument(null, null);
    }
    this.store = null;
    this.isInitialViewSet = false;
    this.downloadComplete = false;

    this.pdfSidebar.reset();
    this.pdfOutlineViewer.reset();
    this.pdfAttachmentViewer.reset();

    this.findController.reset();
    this.findBar.reset();
    this.toolbar.reset();
    this.secondaryToolbar.reset();

    if (typeof PDFBug !== 'undefined') {
      PDFBug.cleanup();
    }
    return promise;
  },

  /**
   * Opens PDF document specified by URL or array with additional arguments.
   * @param {string|TypedArray|ArrayBuffer} file - PDF location or binary data.
   * @param {Object} args - (optional) Additional arguments for the getDocument
   *                        call, e.g. HTTP headers ('httpHeaders') or
   *                        alternative data transport ('range').
   * @returns {Promise} - Returns the promise, which is resolved when document
   *                      is opened.
   */
  open(file, args) {
    if ((typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) &&
        (arguments.length > 2 || typeof args === 'number')) {
      return Promise.reject(
        new Error('Call of open() with obsolete signature.'));
    }
    if (this.pdfLoadingTask) {
      // We need to destroy already opened document.
      return this.close().then(() => {
        // Reload the preferences if a document was previously opened.
        this.preferences.reload();
        // ... and repeat the open() call.
        return this.open(file, args);
      });
    }

    let parameters = Object.create(null), scale;
    if (typeof file === 'string') { // URL
      this.setTitleUsingUrl(file);
      parameters.url = file;
    } else if (file && 'byteLength' in file) { // ArrayBuffer
      parameters.data = file;
    } else if (file.url && file.originalUrl) {
      this.setTitleUsingUrl(file.originalUrl);
      parameters.url = file.url;
    }
    if (typeof PDFJSDev !== 'undefined' &&
        PDFJSDev.test('FIREFOX || MOZCENTRAL || CHROME')) {
      parameters.docBaseUrl = this.baseUrl;
    }

    if (args) {
      for (let prop in args) {
        parameters[prop] = args[prop];
      }

      if (args.scale) {
        scale = args.scale;
      }
      if (args.length) {
        this.pdfDocumentProperties.setFileSize(args.length);
      }
    }

    let loadingTask = getDocument(parameters);
    this.pdfLoadingTask = loadingTask;

    loadingTask.onPassword = (updateCallback, reason) => {
      this.passwordPrompt.setUpdateCallback(updateCallback, reason);
      this.passwordPrompt.open();
    };

    loadingTask.onProgress = ({ loaded, total, }) => {
      this.progress(loaded / total);
    };

    // Listen for unsupported features to trigger the fallback UI.
    loadingTask.onUnsupportedFeature = this.fallback.bind(this);

    return loadingTask.promise.then((pdfDocument) => {
      this.load(pdfDocument, scale);
    }, (exception) => {
      let message = exception && exception.message;
      let loadingErrorMessage;
      if (exception instanceof InvalidPDFException) {
        // change error message also for other builds
        loadingErrorMessage = this.l10n.get('invalid_file_error', null,
                                            'Invalid or corrupted PDF file.');
      } else if (exception instanceof MissingPDFException) {
        // special message for missing PDF's
        loadingErrorMessage = this.l10n.get('missing_file_error', null,
                                            'Missing PDF file.');
      } else if (exception instanceof UnexpectedResponseException) {
        loadingErrorMessage = this.l10n.get('unexpected_response_error', null,
                                            'Unexpected server response.');
      } else {
        loadingErrorMessage = this.l10n.get('loading_error', null,
          'An error occurred while loading the PDF.');
      }

      return loadingErrorMessage.then((msg) => {
        this.error(msg, { message, });
        throw new Error(msg);
      });
    });
  },

  download() {
    function downloadByUrl() {
      downloadManager.downloadUrl(url, filename);
    }

    let url = this.baseUrl;
    // Use this.url instead of this.baseUrl to perform filename detection based
    // on the reference fragment as ultimate fallback if needed.
    let filename = getPDFFileNameFromURL(this.url);
    let downloadManager = this.downloadManager;
    downloadManager.onerror = (err) => {
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

    this.pdfDocument.getData().then(function(data) {
      let blob = createBlob(data, 'application/pdf');
      downloadManager.download(blob, url, filename);
    }).catch(downloadByUrl); // Error occurred, try downloading with the URL.
  },

  fallback(featureId) {
    if (typeof PDFJSDev !== 'undefined' &&
        PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
      // Only trigger the fallback once so we don't spam the user with messages
      // for one PDF.
      if (this.fellback) {
        return;
      }
      this.fellback = true;
      this.externalServices.fallback({
        featureId,
        url: this.baseUrl,
      }, function response(download) {
        if (!download) {
          return;
        }
        PDFViewerApplication.download();
      });
    }
  },

  /**
   * Show the error box.
   * @param {String} message A message that is human readable.
   * @param {Object} moreInfo (optional) Further information about the error
   *                            that is more technical.  Should have a 'message'
   *                            and optionally a 'stack' property.
   */
  error(message, moreInfo) {
    let moreInfoText = [this.l10n.get('error_version_info',
      { version: version || '?', build: build || '?', },
      'PDF.js v{{version}} (build: {{build}})')];
    if (moreInfo) {
      moreInfoText.push(
        this.l10n.get('error_message', { message: moreInfo.message, },
                      'Message: {{message}}'));
      if (moreInfo.stack) {
        moreInfoText.push(
          this.l10n.get('error_stack', { stack: moreInfo.stack, },
                        'Stack: {{stack}}'));
      } else {
        if (moreInfo.filename) {
          moreInfoText.push(
            this.l10n.get('error_file', { file: moreInfo.filename, },
                          'File: {{file}}'));
        }
        if (moreInfo.lineNumber) {
          moreInfoText.push(
            this.l10n.get('error_line', { line: moreInfo.lineNumber, },
                          'Line: {{line}}'));
        }
      }
    }

    if (typeof PDFJSDev === 'undefined' ||
        !PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
      let errorWrapperConfig = this.appConfig.errorWrapper;
      let errorWrapper = errorWrapperConfig.container;
      errorWrapper.removeAttribute('hidden');

      let errorMessage = errorWrapperConfig.errorMessage;
      errorMessage.textContent = message;

      let closeButton = errorWrapperConfig.closeButton;
      closeButton.onclick = function() {
        errorWrapper.setAttribute('hidden', 'true');
      };

      let errorMoreInfo = errorWrapperConfig.errorMoreInfo;
      let moreInfoButton = errorWrapperConfig.moreInfoButton;
      let lessInfoButton = errorWrapperConfig.lessInfoButton;
      moreInfoButton.onclick = function() {
        errorMoreInfo.removeAttribute('hidden');
        moreInfoButton.setAttribute('hidden', 'true');
        lessInfoButton.removeAttribute('hidden');
        errorMoreInfo.style.height = errorMoreInfo.scrollHeight + 'px';
      };
      lessInfoButton.onclick = function() {
        errorMoreInfo.setAttribute('hidden', 'true');
        moreInfoButton.removeAttribute('hidden');
        lessInfoButton.setAttribute('hidden', 'true');
      };
      moreInfoButton.oncontextmenu = noContextMenuHandler;
      lessInfoButton.oncontextmenu = noContextMenuHandler;
      closeButton.oncontextmenu = noContextMenuHandler;
      moreInfoButton.removeAttribute('hidden');
      lessInfoButton.setAttribute('hidden', 'true');
      Promise.all(moreInfoText).then((parts) => {
        errorMoreInfo.value = parts.join('\n');
      });
    } else {
      console.error(message + '\n' + moreInfoText);
      this.fallback();
    }
  },

  progress(level) {
    if (this.downloadComplete) {
      // Don't accidentally show the loading bar again when the entire file has
      // already been fetched (only an issue when disableAutoFetch is enabled).
      return;
    }
    let percent = Math.round(level * 100);
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
      if (PDFJS.disableAutoFetch && percent) {
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

  load(pdfDocument, scale) {
    scale = scale || UNKNOWN_SCALE;
    this.pdfDocument = pdfDocument;

    pdfDocument.getDownloadInfo().then(() => {
      this.downloadComplete = true;
      this.loadingBar.hide();

      firstPagePromise.then(() => {
        this.eventBus.dispatch('documentload', { source: this, });
      });
    });

    // Since the `setInitialView` call below depends on this being resolved,
    // fetch it early to avoid delaying initial rendering of the PDF document.
    let pageModePromise = pdfDocument.getPageMode().catch(
      function() { /* Avoid breaking initial rendering; ignoring errors. */ });

    this.toolbar.setPagesCount(pdfDocument.numPages, false);
    this.secondaryToolbar.setPagesCount(pdfDocument.numPages);

    let id = this.documentFingerprint = pdfDocument.fingerprint;
    let store = this.store = new ViewHistory(id);

    let baseDocumentUrl;
    if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) {
      baseDocumentUrl = null;
    } else if (PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
      baseDocumentUrl = this.baseUrl;
    } else if (PDFJSDev.test('CHROME')) {
      baseDocumentUrl = location.href.split('#')[0];
    }
    this.pdfLinkService.setDocument(pdfDocument, baseDocumentUrl);
    this.pdfDocumentProperties.setDocument(pdfDocument, this.url);

    let pdfViewer = this.pdfViewer;
    pdfViewer.setDocument(pdfDocument);
    let firstPagePromise = pdfViewer.firstPagePromise;
    let pagesPromise = pdfViewer.pagesPromise;
    let onePageRendered = pdfViewer.onePageRendered;

    let pdfThumbnailViewer = this.pdfThumbnailViewer;
    pdfThumbnailViewer.setDocument(pdfDocument);

    firstPagePromise.then((pdfPage) => {
      this.loadingBar.setWidth(this.appConfig.viewerContainer);

      if (!PDFJS.disableHistory && !this.isViewerEmbedded) {
        // The browsing history is only enabled when the viewer is standalone,
        // i.e. not when it is embedded in a web page.
        if (!this.viewerPrefs['showPreviousViewOnLoad']) {
          this.pdfHistory.clearHistoryState();
        }
        this.pdfHistory.initialize(this.documentFingerprint);

        if (this.pdfHistory.initialDestination) {
          this.initialDestination = this.pdfHistory.initialDestination;
        } else if (this.pdfHistory.initialBookmark) {
          this.initialBookmark = this.pdfHistory.initialBookmark;
        }
      }

      let initialParams = {
        destination: this.initialDestination,
        bookmark: this.initialBookmark,
        hash: null,
      };
      let storePromise = store.getMultiple({
        exists: false,
        page: '1',
        zoom: DEFAULT_SCALE_VALUE,
        scrollLeft: '0',
        scrollTop: '0',
        sidebarView: SidebarView.NONE,
      }).catch(() => { /* Unable to read from storage; ignoring errors. */ });

      Promise.all([storePromise, pageModePromise]).then(
          ([values = {}, pageMode]) => {
        // Initialize the default values, from user preferences.
        let hash = this.viewerPrefs['defaultZoomValue'] ?
          ('zoom=' + this.viewerPrefs['defaultZoomValue']) : null;
        let sidebarView = this.viewerPrefs['sidebarViewOnLoad'];

        if (values.exists && this.viewerPrefs['showPreviousViewOnLoad']) {
          hash = 'page=' + values.page +
            '&zoom=' + (this.viewerPrefs['defaultZoomValue'] || values.zoom) +
            ',' + values.scrollLeft + ',' + values.scrollTop;
          sidebarView = sidebarView || (values.sidebarView | 0);
        }
        if (pageMode && !this.viewerPrefs['disablePageMode']) {
          // Always let the user preference/history take precedence.
          sidebarView = sidebarView || apiPageModeToSidebarView(pageMode);
        }
        return {
          hash,
          sidebarView,
        };
      }).then(({ hash, sidebarView, }) => {
        this.setInitialView(hash, { sidebarView, scale, });
        initialParams.hash = hash;

        // Make all navigation keys work on document load,
        // unless the viewer is embedded in a web page.
        if (!this.isViewerEmbedded) {
          pdfViewer.focus();
        }
        return pagesPromise;
      }).then(() => {
        // For documents with different page sizes, once all pages are resolved,
        // ensure that the correct location becomes visible on load.
        if (!initialParams.destination && !initialParams.bookmark &&
            !initialParams.hash) {
          return;
        }
        if (pdfViewer.hasEqualPageSizes) {
          return;
        }
        this.initialDestination = initialParams.destination;
        this.initialBookmark = initialParams.bookmark;

        pdfViewer.currentScaleValue = pdfViewer.currentScaleValue;
        this.setInitialView(initialParams.hash);
      }).then(function() {
        // At this point, rendering of the initial page(s) should always have
        // started (and may even have completed).
        // To prevent any future issues, e.g. the document being completely
        // blank on load, always trigger rendering here.
        pdfViewer.update();
      });
    });

    pdfDocument.getPageLabels().then((labels) => {
      if (!labels || this.viewerPrefs['disablePageLabels']) {
        return;
      }
      let i = 0, numLabels = labels.length;
      if (numLabels !== this.pagesCount) {
        console.error('The number of Page Labels does not match ' +
                      'the number of pages in the document.');
        return;
      }
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
      this.toolbar.setPageNumber(pdfViewer.currentPageNumber,
                                 pdfViewer.currentPageLabel);
    });

    pagesPromise.then(() => {
      if (!this.supportsPrinting) {
        return;
      }
      pdfDocument.getJavaScript().then((javaScript) => {
        if (javaScript.length) {
          console.warn('Warning: JavaScript is not supported');
          this.fallback(UNSUPPORTED_FEATURES.javaScript);
        }
        // Hack to support auto printing.
        let regex = /\bprint\s*\(/;
        for (let i = 0, ii = javaScript.length; i < ii; i++) {
          let js = javaScript[i];
          if (js && regex.test(js)) {
            setTimeout(function() {
              window.print();
            });
            return;
          }
        }
      });
    });

    Promise.all([onePageRendered, animationStarted]).then(() => {
      pdfDocument.getOutline().then((outline) => {
        this.pdfOutlineViewer.render({ outline, });
      });
      pdfDocument.getAttachments().then((attachments) => {
        this.pdfAttachmentViewer.render({ attachments, });
      });
    });

    pdfDocument.getMetadata().then(({ info, metadata, }) => {
      this.documentInfo = info;
      this.metadata = metadata;

      // Provides some basic debug information
      console.log('PDF ' + pdfDocument.fingerprint + ' [' +
                  info.PDFFormatVersion + ' ' + (info.Producer || '-').trim() +
                  ' / ' + (info.Creator || '-').trim() + ']' +
                  ' (PDF.js: ' + (version || '-') +
                  (!PDFJS.disableWebGL ? ' [WebGL]' : '') + ')');

      let pdfTitle;
      if (metadata && metadata.has('dc:title')) {
        let title = metadata.get('dc:title');
        // Ghostscript sometimes return 'Untitled', sets the title to 'Untitled'
        if (title !== 'Untitled') {
          pdfTitle = title;
        }
      }

      if (!pdfTitle && info && info['Title']) {
        pdfTitle = info['Title'];
      }

      if (pdfTitle) {
        this.setTitle(pdfTitle + ' - ' + document.title);
      }

      if (info.IsAcroFormPresent) {
        console.warn('Warning: AcroForm/XFA is not supported');
        this.fallback(UNSUPPORTED_FEATURES.forms);
      }

      if (typeof PDFJSDev !== 'undefined' &&
          PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
        let versionId = String(info.PDFFormatVersion).slice(-1) | 0;
        let generatorId = 0;
        const KNOWN_GENERATORS = [
          'acrobat distiller', 'acrobat pdfwriter', 'adobe livecycle',
          'adobe pdf library', 'adobe photoshop', 'ghostscript', 'tcpdf',
          'cairo', 'dvipdfm', 'dvips', 'pdftex', 'pdfkit', 'itext', 'prince',
          'quarkxpress', 'mac os x', 'microsoft', 'openoffice', 'oracle',
          'luradocument', 'pdf-xchange', 'antenna house', 'aspose.cells', 'fpdf'
        ];
        if (info.Producer) {
          KNOWN_GENERATORS.some(function (generator, s, i) {
            if (generator.indexOf(s) < 0) {
              return false;
            }
            generatorId = i + 1;
            return true;
          }.bind(null, info.Producer.toLowerCase()));
        }
        let formType = !info.IsAcroFormPresent ? null : info.IsXFAPresent ?
                      'xfa' : 'acroform';
        this.externalServices.reportTelemetry({
          type: 'documentInfo',
          version: versionId,
          generator: generatorId,
          formType,
        });
      }
    });
  },

  setInitialView(storedHash, options = {}) {
    let { scale = 0, sidebarView = SidebarView.NONE, } = options;

    this.isInitialViewSet = true;
    this.pdfSidebar.setInitialView(sidebarView);

    if (this.initialDestination) {
      this.pdfLinkService.navigateTo(this.initialDestination);
      this.initialDestination = null;
    } else if (this.initialBookmark) {
      this.pdfLinkService.setHash(this.initialBookmark);
      this.pdfHistory.push({ hash: this.initialBookmark, }, true);
      this.initialBookmark = null;
    } else if (storedHash) {
      this.pdfLinkService.setHash(storedHash);
    } else if (scale) {
      this.pdfViewer.currentScaleValue = scale;
      this.page = 1;
    }

    // Ensure that the correct page number is displayed in the UI,
    // even if the active page didn't change during document load.
    this.toolbar.setPageNumber(this.pdfViewer.currentPageNumber,
                               this.pdfViewer.currentPageLabel);
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
    this.pdfRenderingQueue.isThumbnailViewEnabled =
      this.pdfSidebar.isThumbnailViewVisible;
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
      this.l10n.get('printing_not_supported', null,
                    'Warning: Printing is not fully supported by ' +
                    'this browser.').then((printMessage) => {
        this.error(printMessage);
      });
      return;
    }

    // The beforePrint is a sync method and we need to know layout before
    // returning from this method. Ensure that we can get sizes of the pages.
    if (!this.pdfViewer.pageViewsReady) {
      this.l10n.get('printing_not_ready', null,
                    'Warning: The PDF is not fully loaded for printing.').
          then((notReadyMessage) => {
        window.alert(notReadyMessage);
      });
      return;
    }

    let pagesOverview = this.pdfViewer.getPagesOverview();
    let printContainer = this.appConfig.printContainer;
    let printService = PDFPrintServiceFactory.instance.createPrintService(
      this.pdfDocument, pagesOverview, printContainer, this.l10n);
    this.printService = printService;
    this.forceRendering();

    printService.layout();

    if (typeof PDFJSDev !== 'undefined' &&
        PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
      this.externalServices.reportTelemetry({
        type: 'print',
      });
    }
  },

  afterPrint: function pdfViewSetupAfterPrint() {
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
    let { pdfViewer, pdfThumbnailViewer, } = this;
    let pageNumber = pdfViewer.currentPageNumber;
    let newRotation = (pdfViewer.pagesRotation + 360 + delta) % 360;

    pdfViewer.pagesRotation = newRotation;
    pdfThumbnailViewer.pagesRotation = newRotation;

    this.forceRendering();
    // Ensure that the active page doesn't change during rotation.
    pdfViewer.currentPageNumber = pageNumber;
  },

  requestPresentationMode() {
    if (!this.pdfPresentationMode) {
      return;
    }
    this.pdfPresentationMode.request();
  },

  bindEvents() {
    let { eventBus, _boundEvents, } = this;

    _boundEvents.beforePrint = this.beforePrint.bind(this);
    _boundEvents.afterPrint = this.afterPrint.bind(this);

    eventBus.on('resize', webViewerResize);
    eventBus.on('hashchange', webViewerHashchange);
    eventBus.on('beforeprint', _boundEvents.beforePrint);
    eventBus.on('afterprint', _boundEvents.afterPrint);
    eventBus.on('pagerendered', webViewerPageRendered);
    eventBus.on('textlayerrendered', webViewerTextLayerRendered);
    eventBus.on('updateviewarea', webViewerUpdateViewarea);
    eventBus.on('pagechanging', webViewerPageChanging);
    eventBus.on('scalechanging', webViewerScaleChanging);
    eventBus.on('sidebarviewchanged', webViewerSidebarViewChanged);
    eventBus.on('pagemode', webViewerPageMode);
    eventBus.on('namedaction', webViewerNamedAction);
    eventBus.on('presentationmodechanged', webViewerPresentationModeChanged);
    eventBus.on('presentationmode', webViewerPresentationMode);
    eventBus.on('openfile', webViewerOpenFile);
    eventBus.on('print', webViewerPrint);
    eventBus.on('download', webViewerDownload);
    eventBus.on('firstpage', webViewerFirstPage);
    eventBus.on('lastpage', webViewerLastPage);
    eventBus.on('nextpage', webViewerNextPage);
    eventBus.on('previouspage', webViewerPreviousPage);
    eventBus.on('zoomin', webViewerZoomIn);
    eventBus.on('zoomout', webViewerZoomOut);
    eventBus.on('pagenumberchanged', webViewerPageNumberChanged);
    eventBus.on('scalechanged', webViewerScaleChanged);
    eventBus.on('rotatecw', webViewerRotateCw);
    eventBus.on('rotateccw', webViewerRotateCcw);
    eventBus.on('documentproperties', webViewerDocumentProperties);
    eventBus.on('find', webViewerFind);
    eventBus.on('findfromurlhash', webViewerFindFromUrlHash);
    if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) {
      eventBus.on('fileinputchange', webViewerFileInputChange);
    }
  },

  bindWindowEvents() {
    let { eventBus, _boundEvents, } = this;

    _boundEvents.windowResize = () => {
      eventBus.dispatch('resize');
    };
    _boundEvents.windowHashChange = () => {
      eventBus.dispatch('hashchange', {
        hash: document.location.hash.substring(1),
      });
    };
    _boundEvents.windowBeforePrint = () => {
      eventBus.dispatch('beforeprint');
    };
    _boundEvents.windowAfterPrint = () => {
      eventBus.dispatch('afterprint');
    };

    window.addEventListener('wheel', webViewerWheel);
    window.addEventListener('click', webViewerClick);
    window.addEventListener('keydown', webViewerKeyDown);
    window.addEventListener('resize', _boundEvents.windowResize);
    window.addEventListener('hashchange', _boundEvents.windowHashChange);
    window.addEventListener('beforeprint', _boundEvents.windowBeforePrint);
    window.addEventListener('afterprint', _boundEvents.windowAfterPrint);
    if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) {
      _boundEvents.windowChange = (evt) => {
        let files = evt.target.files;
        if (!files || files.length === 0) {
          return;
        }
        eventBus.dispatch('fileinputchange', {
          fileInput: evt.target,
        });
      };
      window.addEventListener('change', _boundEvents.windowChange);
    }
  },

  unbindEvents() {
    let { eventBus, _boundEvents, } = this;

    eventBus.off('resize', webViewerResize);
    eventBus.off('hashchange', webViewerHashchange);
    eventBus.off('beforeprint', _boundEvents.beforePrint);
    eventBus.off('afterprint', _boundEvents.afterPrint);
    eventBus.off('pagerendered', webViewerPageRendered);
    eventBus.off('textlayerrendered', webViewerTextLayerRendered);
    eventBus.off('updateviewarea', webViewerUpdateViewarea);
    eventBus.off('pagechanging', webViewerPageChanging);
    eventBus.off('scalechanging', webViewerScaleChanging);
    eventBus.off('sidebarviewchanged', webViewerSidebarViewChanged);
    eventBus.off('pagemode', webViewerPageMode);
    eventBus.off('namedaction', webViewerNamedAction);
    eventBus.off('presentationmodechanged', webViewerPresentationModeChanged);
    eventBus.off('presentationmode', webViewerPresentationMode);
    eventBus.off('openfile', webViewerOpenFile);
    eventBus.off('print', webViewerPrint);
    eventBus.off('download', webViewerDownload);
    eventBus.off('firstpage', webViewerFirstPage);
    eventBus.off('lastpage', webViewerLastPage);
    eventBus.off('nextpage', webViewerNextPage);
    eventBus.off('previouspage', webViewerPreviousPage);
    eventBus.off('zoomin', webViewerZoomIn);
    eventBus.off('zoomout', webViewerZoomOut);
    eventBus.off('pagenumberchanged', webViewerPageNumberChanged);
    eventBus.off('scalechanged', webViewerScaleChanged);
    eventBus.off('rotatecw', webViewerRotateCw);
    eventBus.off('rotateccw', webViewerRotateCcw);
    eventBus.off('documentproperties', webViewerDocumentProperties);
    eventBus.off('find', webViewerFind);
    eventBus.off('findfromurlhash', webViewerFindFromUrlHash);
    if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) {
      eventBus.off('fileinputchange', webViewerFileInputChange);
    }

    _boundEvents.beforePrint = null;
    _boundEvents.afterPrint = null;
  },

  unbindWindowEvents() {
    let { _boundEvents, } = this;

    window.removeEventListener('wheel', webViewerWheel);
    window.removeEventListener('click', webViewerClick);
    window.removeEventListener('keydown', webViewerKeyDown);
    window.removeEventListener('resize', _boundEvents.windowResize);
    window.removeEventListener('hashchange', _boundEvents.windowHashChange);
    window.removeEventListener('beforeprint', _boundEvents.windowBeforePrint);
    window.removeEventListener('afterprint', _boundEvents.windowAfterPrint);
    if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) {
      window.removeEventListener('change', _boundEvents.windowChange);
      _boundEvents.windowChange = null;
    }

    _boundEvents.windowResize = null;
    _boundEvents.windowHashChange = null;
    _boundEvents.windowBeforePrint = null;
    _boundEvents.windowAfterPrint = null;
  },
};

let validateFileURL;
if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) {
  const HOSTED_VIEWER_ORIGINS = ['null',
    'http://mozilla.github.io', 'https://mozilla.github.io'];
  validateFileURL = function validateFileURL(file) {
    if (file === undefined) {
      return;
    }
    try {
      let viewerOrigin = new URL(window.location.href).origin || 'null';
      if (HOSTED_VIEWER_ORIGINS.indexOf(viewerOrigin) >= 0) {
        // Hosted or local viewer, allow for any file locations
        return;
      }
      let fileOrigin = new URL(file, window.location.href).origin;
      // Removing of the following line will not guarantee that the viewer will
      // start accepting URLs from foreign origin -- CORS headers on the remote
      // server must be properly configured.
      if (fileOrigin !== viewerOrigin) {
        throw new Error('file origin does not match viewer\'s');
      }
    } catch (ex) {
      let message = ex && ex.message;
      PDFViewerApplication.l10n.get('loading_error', null,
          'An error occurred while loading the PDF.').
          then((loadingErrorMessage) => {
        PDFViewerApplication.error(loadingErrorMessage, { message, });
      });
      throw ex;
    }
  };
}

function loadAndEnablePDFBug(enabledTabs) {
  return new Promise(function (resolve, reject) {
    let appConfig = PDFViewerApplication.appConfig;
    let script = document.createElement('script');
    script.src = appConfig.debuggerScriptPath;
    script.onload = function () {
      PDFBug.enable(enabledTabs);
      PDFBug.init({
        PDFJS,
        OPS,
      }, appConfig.mainContainer);
      resolve();
    };
    script.onerror = function () {
      reject(new Error('Cannot load debugger at ' + script.src));
    };
    (document.getElementsByTagName('head')[0] || document.body).
      appendChild(script);
  });
}

function webViewerInitialized() {
  let appConfig = PDFViewerApplication.appConfig;
  let file;
  if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) {
    let queryString = document.location.search.substring(1);
    let params = parseQueryString(queryString);
    file = 'file' in params ? params.file : appConfig.defaultUrl;
    validateFileURL(file);
  } else if (PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
    file = window.location.href.split('#')[0];
  } else if (PDFJSDev.test('CHROME')) {
    file = appConfig.defaultUrl;
  }

  let waitForBeforeOpening = [];
  if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) {
    let fileInput = document.createElement('input');
    fileInput.id = appConfig.openFileInputName;
    fileInput.className = 'fileInput';
    fileInput.setAttribute('type', 'file');
    fileInput.oncontextmenu = noContextMenuHandler;
    document.body.appendChild(fileInput);

    if (!window.File || !window.FileReader ||
        !window.FileList || !window.Blob) {
      appConfig.toolbar.openFile.setAttribute('hidden', 'true');
      appConfig.secondaryToolbar.openFileButton.setAttribute('hidden', 'true');
    } else {
      fileInput.value = null;
    }
  } else {
    appConfig.toolbar.openFile.setAttribute('hidden', 'true');
    appConfig.secondaryToolbar.openFileButton.setAttribute('hidden', 'true');
  }

  if ((typeof PDFJSDev === 'undefined' || !PDFJSDev.test('PRODUCTION')) ||
      PDFViewerApplication.viewerPrefs['pdfBugEnabled']) {
    // Special debugging flags in the hash section of the URL.
    let hash = document.location.hash.substring(1);
    let hashParams = parseQueryString(hash);

    if ('disableworker' in hashParams) {
      PDFJS.disableWorker = (hashParams['disableworker'] === 'true');
    }
    if ('disablerange' in hashParams) {
      PDFJS.disableRange = (hashParams['disablerange'] === 'true');
    }
    if ('disablestream' in hashParams) {
      PDFJS.disableStream = (hashParams['disablestream'] === 'true');
    }
    if ('disableautofetch' in hashParams) {
      PDFJS.disableAutoFetch = (hashParams['disableautofetch'] === 'true');
    }
    if ('disablefontface' in hashParams) {
      PDFJS.disableFontFace = (hashParams['disablefontface'] === 'true');
    }
    if ('disablehistory' in hashParams) {
      PDFJS.disableHistory = (hashParams['disablehistory'] === 'true');
    }
    if ('webgl' in hashParams) {
      PDFJS.disableWebGL = (hashParams['webgl'] !== 'true');
    }
    if ('useonlycsszoom' in hashParams) {
      PDFJS.useOnlyCssZoom = (hashParams['useonlycsszoom'] === 'true');
    }
    if ('verbosity' in hashParams) {
      PDFJS.verbosity = hashParams['verbosity'] | 0;
    }
    if ('ignorecurrentpositiononzoom' in hashParams) {
      PDFJS.ignoreCurrentPositionOnZoom =
        (hashParams['ignorecurrentpositiononzoom'] === 'true');
    }
    if (typeof PDFJSDev === 'undefined' || !PDFJSDev.test('PRODUCTION')) {
      if ('disablebcmaps' in hashParams && hashParams['disablebcmaps']) {
        PDFJS.cMapUrl = '../external/cmaps/';
        PDFJS.cMapPacked = false;
      }
    }
    if ('textlayer' in hashParams) {
      switch (hashParams['textlayer']) {
        case 'off':
          PDFJS.disableTextLayer = true;
          break;
        case 'visible':
        case 'shadow':
        case 'hover':
          let viewer = appConfig.viewerContainer;
          viewer.classList.add('textLayer-' + hashParams['textlayer']);
          break;
      }
    }
    if ('pdfbug' in hashParams) {
      PDFJS.pdfBug = true;
      let pdfBug = hashParams['pdfbug'];
      let enabled = pdfBug.split(',');
      waitForBeforeOpening.push(loadAndEnablePDFBug(enabled));
    }
  }

  if (typeof PDFJSDev !== 'undefined' &&
      PDFJSDev.test('FIREFOX || MOZCENTRAL') &&
      !PDFViewerApplication.supportsDocumentFonts) {
    PDFJS.disableFontFace = true;
    PDFViewerApplication.l10n.get('web_fonts_disabled', null,
      'Web fonts are disabled: unable to use embedded PDF fonts.').
        then((msg) => {
      console.warn(msg);
    });
  }

  if (!PDFViewerApplication.supportsPrinting) {
    appConfig.toolbar.print.classList.add('hidden');
    appConfig.secondaryToolbar.printButton.classList.add('hidden');
  }

  if (!PDFViewerApplication.supportsFullscreen) {
    appConfig.toolbar.presentationModeButton.classList.add('hidden');
    appConfig.secondaryToolbar.presentationModeButton.classList.add('hidden');
  }

  if (PDFViewerApplication.supportsIntegratedFind) {
    appConfig.toolbar.viewFind.classList.add('hidden');
  }

  appConfig.sidebar.mainContainer.addEventListener('transitionend',
    function(evt) {
      if (evt.target === /* mainContainer */ this) {
        PDFViewerApplication.eventBus.dispatch('resize');
      }
    }, true);

  appConfig.sidebar.toggleButton.addEventListener('click', function() {
    PDFViewerApplication.pdfSidebar.toggle();
  });

  Promise.all(waitForBeforeOpening).then(function () {
    webViewerOpenFileViaURL(file);
  }).catch(function (reason) {
    PDFViewerApplication.l10n.get('loading_error', null,
        'An error occurred while opening.').then((msg) => {
      PDFViewerApplication.error(msg, reason);
    });
  });
}

let webViewerOpenFileViaURL;
if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) {
  webViewerOpenFileViaURL = function webViewerOpenFileViaURL(file) {
    if (file && file.lastIndexOf('file:', 0) === 0) {
      // file:-scheme. Load the contents in the main thread because QtWebKit
      // cannot load file:-URLs in a Web Worker. file:-URLs are usually loaded
      // very quickly, so there is no need to set up progress event listeners.
      PDFViewerApplication.setTitleUsingUrl(file);
      let xhr = new XMLHttpRequest();
      xhr.onload = function() {
        PDFViewerApplication.open(new Uint8Array(xhr.response));
      };
      try {
        xhr.open('GET', file);
        xhr.responseType = 'arraybuffer';
        xhr.send();
      } catch (ex) {
        PDFViewerApplication.l10n.get('loading_error', null,
            'An error occurred while loading the PDF.').then((msg) => {
          PDFViewerApplication.error(msg, ex);
        });
      }
      return;
    }

    if (file) {
      PDFViewerApplication.open(file);
    }
  };
} else if (PDFJSDev.test('FIREFOX || MOZCENTRAL || CHROME')) {
  webViewerOpenFileViaURL = function webViewerOpenFileViaURL(file) {
    PDFViewerApplication.setTitleUsingUrl(file);
    PDFViewerApplication.initPassiveLoading();
  };
} else {
  webViewerOpenFileViaURL = function webViewerOpenFileURL(file) {
    if (file) {
      throw new Error('Not implemented: webViewerOpenFileURL');
    }
  };
}

function webViewerPageRendered(evt) {
  let pageNumber = evt.pageNumber;
  let pageIndex = pageNumber - 1;
  let pageView = PDFViewerApplication.pdfViewer.getPageView(pageIndex);

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
    let thumbnailView = PDFViewerApplication.pdfThumbnailViewer.
                        getThumbnail(pageIndex);
    thumbnailView.setImage(pageView);
  }

  if (PDFJS.pdfBug && Stats.enabled && pageView.stats) {
    Stats.add(pageNumber, pageView.stats);
  }

  if (pageView.error) {
    PDFViewerApplication.l10n.get('rendering_error', null,
        'An error occurred while rendering the page.').then((msg) => {
      PDFViewerApplication.error(msg, pageView.error);
    });
  }

  if (typeof PDFJSDev !== 'undefined' &&
      PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
    PDFViewerApplication.externalServices.reportTelemetry({
      type: 'pageInfo',
    });
    // It is a good time to report stream and font types.
    PDFViewerApplication.pdfDocument.getStats().then(function (stats) {
      PDFViewerApplication.externalServices.reportTelemetry({
        type: 'documentStats',
        stats,
      });
    });
  }
}

function webViewerTextLayerRendered(evt) {
  if (typeof PDFJSDev !== 'undefined' &&
      PDFJSDev.test('FIREFOX || MOZCENTRAL') &&
      evt.numTextDivs > 0 && !PDFViewerApplication.supportsDocumentColors) {
    PDFViewerApplication.l10n.get('document_colors_not_allowed', null,
      'PDF documents are not allowed to use their own colors: ' +
      '\'Allow pages to choose their own colors\' ' +
      'is deactivated in the browser.').
        then((msg) => {
      console.error(msg);
    });
    PDFViewerApplication.fallback();
  }
}

function webViewerPageMode(evt) {
  // Handle the 'pagemode' hash parameter, see also `PDFLinkService_setHash`.
  let mode = evt.mode, view;
  switch (mode) {
    case 'thumbs':
      view = SidebarView.THUMBS;
      break;
    case 'bookmarks':
    case 'outline':
      view = SidebarView.OUTLINE;
      break;
    case 'attachments':
      view = SidebarView.ATTACHMENTS;
      break;
    case 'none':
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
  let action = evt.action;
  switch (action) {
    case 'GoToPage':
      PDFViewerApplication.appConfig.toolbar.pageNumber.select();
      break;

    case 'Find':
      if (!PDFViewerApplication.supportsIntegratedFind) {
        PDFViewerApplication.findBar.toggle();
      }
      break;
  }
}

function webViewerPresentationModeChanged(evt) {
  let { active, switchInProgress, } = evt;
  PDFViewerApplication.pdfViewer.presentationModeState =
    switchInProgress ? PresentationModeState.CHANGING :
    active ? PresentationModeState.FULLSCREEN : PresentationModeState.NORMAL;
}

function webViewerSidebarViewChanged(evt) {
  PDFViewerApplication.pdfRenderingQueue.isThumbnailViewEnabled =
    PDFViewerApplication.pdfSidebar.isThumbnailViewVisible;

  let store = PDFViewerApplication.store;
  if (store && PDFViewerApplication.isInitialViewSet) {
    // Only update the storage when the document has been loaded *and* rendered.
    store.set('sidebarView', evt.view).catch(function() { });
  }
}

function webViewerUpdateViewarea(evt) {
  let location = evt.location, store = PDFViewerApplication.store;

  if (store && PDFViewerApplication.isInitialViewSet) {
    store.setMultiple({
      'exists': true,
      'page': location.pageNumber,
      'zoom': location.scale,
      'scrollLeft': location.left,
      'scrollTop': location.top,
    }).catch(function() { /* unable to write to storage */ });
  }
  let href =
    PDFViewerApplication.pdfLinkService.getAnchorUrl(location.pdfOpenParams);
  PDFViewerApplication.appConfig.toolbar.viewBookmark.href = href;
  PDFViewerApplication.appConfig.secondaryToolbar.viewBookmarkButton.href =
    href;

  // Update the current bookmark in the browsing history.
  PDFViewerApplication.pdfHistory.updateCurrentBookmark(location.pdfOpenParams,
                                                        location.pageNumber);

  // Show/hide the loading indicator in the page number input element.
  let currentPage =
    PDFViewerApplication.pdfViewer.getPageView(PDFViewerApplication.page - 1);
  let loading = currentPage.renderingState !== RenderingStates.FINISHED;
  PDFViewerApplication.toolbar.updateLoadingIndicatorState(loading);
}

function webViewerResize() {
  let { pdfDocument, pdfViewer, } = PDFViewerApplication;
  if (!pdfDocument) {
    return;
  }
  let currentScaleValue = pdfViewer.currentScaleValue;
  if (currentScaleValue === 'auto' ||
      currentScaleValue === 'page-fit' ||
      currentScaleValue === 'page-width') {
    // Note: the scale is constant for 'page-actual'.
    pdfViewer.currentScaleValue = currentScaleValue;
  }
  pdfViewer.update();
}

function webViewerHashchange(evt) {
  if (PDFViewerApplication.pdfHistory.isHashChangeUnlocked) {
    let hash = evt.hash;
    if (!hash) {
      return;
    }
    if (!PDFViewerApplication.isInitialViewSet) {
      PDFViewerApplication.initialBookmark = hash;
    } else {
      PDFViewerApplication.pdfLinkService.setHash(hash);
    }
  }
}

let webViewerFileInputChange;
if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) {
  webViewerFileInputChange = function webViewerFileInputChange(evt) {
    let file = evt.fileInput.files[0];

    if (!PDFJS.disableCreateObjectURL && URL.createObjectURL) {
      PDFViewerApplication.open(URL.createObjectURL(file));
    } else {
      // Read the local file into a Uint8Array.
      let fileReader = new FileReader();
      fileReader.onload = function webViewerChangeFileReaderOnload(evt) {
        let buffer = evt.target.result;
        PDFViewerApplication.open(new Uint8Array(buffer));
      };
      fileReader.readAsArrayBuffer(file);
    }

    PDFViewerApplication.setTitleUsingUrl(file.name);

    // URL does not reflect proper document location - hiding some icons.
    let appConfig = PDFViewerApplication.appConfig;
    appConfig.toolbar.viewBookmark.setAttribute('hidden', 'true');
    appConfig.secondaryToolbar.viewBookmarkButton.setAttribute('hidden',
                                                               'true');
    appConfig.toolbar.download.setAttribute('hidden', 'true');
    appConfig.secondaryToolbar.downloadButton.setAttribute('hidden', 'true');
  };
}

function webViewerPresentationMode() {
  PDFViewerApplication.requestPresentationMode();
}
function webViewerOpenFile() {
  let openFileInputName = PDFViewerApplication.appConfig.openFileInputName;
  document.getElementById(openFileInputName).click();
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
function webViewerPageNumberChanged(evt) {
  let pdfViewer = PDFViewerApplication.pdfViewer;
  pdfViewer.currentPageLabel = evt.value;

  // Ensure that the page number input displays the correct value, even if the
  // value entered by the user was invalid (e.g. a floating point number).
  if (evt.value !== pdfViewer.currentPageNumber.toString() &&
      evt.value !== pdfViewer.currentPageLabel) {
    PDFViewerApplication.toolbar.setPageNumber(
      pdfViewer.currentPageNumber, pdfViewer.currentPageLabel);
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
function webViewerDocumentProperties() {
  PDFViewerApplication.pdfDocumentProperties.open();
}

function webViewerFind(evt) {
  PDFViewerApplication.findController.executeCommand('find' + evt.type, {
    query: evt.query,
    phraseSearch: evt.phraseSearch,
    caseSensitive: evt.caseSensitive,
    highlightAll: evt.highlightAll,
    findPrevious: evt.findPrevious,
  });
}

function webViewerFindFromUrlHash(evt) {
  PDFViewerApplication.findController.executeCommand('find', {
    query: evt.query,
    phraseSearch: evt.phraseSearch,
    caseSensitive: false,
    highlightAll: true,
    findPrevious: false,
  });
}

function webViewerScaleChanging(evt) {
  PDFViewerApplication.toolbar.setPageScale(evt.presetValue, evt.scale);

  PDFViewerApplication.pdfViewer.update();
}

function webViewerPageChanging(evt) {
  let page = evt.pageNumber;

  PDFViewerApplication.toolbar.setPageNumber(page, evt.pageLabel || null);
  PDFViewerApplication.secondaryToolbar.setPageNumber(page);

  if (PDFViewerApplication.pdfSidebar.isThumbnailViewVisible) {
    PDFViewerApplication.pdfThumbnailViewer.scrollThumbnailIntoView(page);
  }

  // we need to update stats
  if (PDFJS.pdfBug && Stats.enabled) {
    let pageView = PDFViewerApplication.pdfViewer.getPageView(page - 1);
    if (pageView.stats) {
      Stats.add(page, pageView.stats);
    }
  }
}

let zoomDisabled = false, zoomDisabledTimeout;
function webViewerWheel(evt) {
  let pdfViewer = PDFViewerApplication.pdfViewer;
  if (pdfViewer.isInPresentationMode) {
    return;
  }

  if (evt.ctrlKey || evt.metaKey) {
    let support = PDFViewerApplication.supportedMouseWheelZoomModifierKeys;
    if ((evt.ctrlKey && !support.ctrlKey) ||
        (evt.metaKey && !support.metaKey)) {
      return;
    }
    // Only zoom the pages, not the entire viewer.
    evt.preventDefault();
    // NOTE: this check must be placed *after* preventDefault.
    if (zoomDisabled) {
      return;
    }

    let previousScale = pdfViewer.currentScale;

    let delta = normalizeWheelEventDelta(evt);

    const MOUSE_WHEEL_DELTA_PER_PAGE_SCALE = 3.0;
    let ticks = delta * MOUSE_WHEEL_DELTA_PER_PAGE_SCALE;
    if (ticks < 0) {
      PDFViewerApplication.zoomOut(-ticks);
    } else {
      PDFViewerApplication.zoomIn(ticks);
    }

    let currentScale = pdfViewer.currentScale;
    if (previousScale !== currentScale) {
      // After scaling the page via zoomIn/zoomOut, the position of the upper-
      // left corner is restored. When the mouse wheel is used, the position
      // under the cursor should be restored instead.
      let scaleCorrectionFactor = currentScale / previousScale - 1;
      let rect = pdfViewer.container.getBoundingClientRect();
      let dx = evt.clientX - rect.left;
      let dy = evt.clientY - rect.top;
      pdfViewer.container.scrollLeft += dx * scaleCorrectionFactor;
      pdfViewer.container.scrollTop += dy * scaleCorrectionFactor;
    }
  } else {
    zoomDisabled = true;
    clearTimeout(zoomDisabledTimeout);
    zoomDisabledTimeout = setTimeout(function () {
      zoomDisabled = false;
    }, 1000);
  }
}

function webViewerClick(evt) {
  if (!PDFViewerApplication.secondaryToolbar.isOpen) {
    return;
  }
  let appConfig = PDFViewerApplication.appConfig;
  if (PDFViewerApplication.pdfViewer.containsElement(evt.target) ||
      (appConfig.toolbar.container.contains(evt.target) &&
       evt.target !== appConfig.secondaryToolbar.toggleButton)) {
    PDFViewerApplication.secondaryToolbar.close();
  }
}

function webViewerKeyDown(evt) {
  if (PDFViewerApplication.overlayManager.active) {
    return;
  }

  let handled = false, ensureViewerFocused = false;
  let cmd = (evt.ctrlKey ? 1 : 0) |
            (evt.altKey ? 2 : 0) |
            (evt.shiftKey ? 4 : 0) |
            (evt.metaKey ? 8 : 0);

  let pdfViewer = PDFViewerApplication.pdfViewer;
  let isViewerInPresentationMode = pdfViewer && pdfViewer.isInPresentationMode;

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
          let findState = PDFViewerApplication.findController.state;
          if (findState) {
            PDFViewerApplication.findController.executeCommand('findagain', {
              query: findState.query,
              phraseSearch: findState.phraseSearch,
              caseSensitive: findState.caseSensitive,
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
          setTimeout(function () {
            // ... and resetting the scale after browser adjusts its scale
            pdfViewer.currentScaleValue = DEFAULT_SCALE_VALUE;
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
        if (isViewerInPresentationMode ||
            PDFViewerApplication.page < PDFViewerApplication.pagesCount) {
          PDFViewerApplication.page = PDFViewerApplication.pagesCount;
          handled = true;
          ensureViewerFocused = true;
        }
        break;
    }
  }

  if (typeof PDFJSDev === 'undefined' ||
      !PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
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
  let curElement = document.activeElement || document.querySelector(':focus');
  let curElementTagName = curElement && curElement.tagName.toUpperCase();
  if (curElementTagName === 'INPUT' ||
      curElementTagName === 'TEXTAREA' ||
      curElementTagName === 'SELECT') {
    // Make sure that the secondary toolbar is closed when Escape is pressed.
    if (evt.keyCode !== 27) { // 'Esc'
      return;
    }
  }

  if (cmd === 0) { // no control key pressed at all.
    switch (evt.keyCode) {
      case 38: // up arrow
      case 33: // pg up
      case 8: // backspace
        if (!isViewerInPresentationMode &&
            pdfViewer.currentScaleValue !== 'page-fit') {
          break;
        }
        /* in presentation mode */
        /* falls through */
      case 37: // left arrow
        // horizontal scrolling using arrow keys
        if (pdfViewer.isHorizontalScrollbarEnabled) {
          break;
        }
        /* falls through */
      case 75: // 'k'
      case 80: // 'p'
        if (PDFViewerApplication.page > 1) {
          PDFViewerApplication.page--;
        }
        handled = true;
        break;
      case 27: // esc key
        if (PDFViewerApplication.secondaryToolbar.isOpen) {
          PDFViewerApplication.secondaryToolbar.close();
          handled = true;
        }
        if (!PDFViewerApplication.supportsIntegratedFind &&
            PDFViewerApplication.findBar.opened) {
          PDFViewerApplication.findBar.close();
          handled = true;
        }
        break;
      case 40: // down arrow
      case 34: // pg down
      case 32: // spacebar
        if (!isViewerInPresentationMode &&
            pdfViewer.currentScaleValue !== 'page-fit') {
          break;
        }
        /* falls through */
      case 39: // right arrow
        // horizontal scrolling using arrow keys
        if (pdfViewer.isHorizontalScrollbarEnabled) {
          break;
        }
        /* falls through */
      case 74: // 'j'
      case 78: // 'n'
        if (PDFViewerApplication.page < PDFViewerApplication.pagesCount) {
          PDFViewerApplication.page++;
        }
        handled = true;
        break;

      case 36: // home
        if (isViewerInPresentationMode || PDFViewerApplication.page > 1) {
          PDFViewerApplication.page = 1;
          handled = true;
          ensureViewerFocused = true;
        }
        break;
      case 35: // end
        if (isViewerInPresentationMode ||
            PDFViewerApplication.page < PDFViewerApplication.pagesCount) {
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
    }
  }

  if (cmd === 4) { // shift-key
    switch (evt.keyCode) {
      case 32: // spacebar
        if (!isViewerInPresentationMode &&
            pdfViewer.currentScaleValue !== 'page-fit') {
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
    if ((evt.keyCode >= 33 && evt.keyCode <= 40) ||
        (evt.keyCode === 32 && curElementTagName !== 'BUTTON')) {
      ensureViewerFocused = true;
    }
  }

  if (cmd === 2) { // alt-key
    switch (evt.keyCode) {
      case 37: // left arrow
        if (isViewerInPresentationMode) {
          PDFViewerApplication.pdfHistory.back();
          handled = true;
        }
        break;
      case 39: // right arrow
        if (isViewerInPresentationMode) {
          PDFViewerApplication.pdfHistory.forward();
          handled = true;
        }
        break;
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
 * Converts API PageMode values to the format used by `PDFSidebar`.
 * NOTE: There's also a "FullScreen" parameter which is not possible to support,
 *       since the Fullscreen API used in browsers requires that entering
 *       fullscreen mode only occurs as a result of a user-initiated event.
 * @param {string} mode - The API PageMode value.
 * @returns {number} A value from {SidebarView}.
 */
function apiPageModeToSidebarView(mode) {
  switch (mode) {
    case 'UseNone':
      return SidebarView.NONE;
    case 'UseThumbs':
      return SidebarView.THUMBS;
    case 'UseOutlines':
      return SidebarView.OUTLINE;
    case 'UseAttachments':
      return SidebarView.ATTACHMENTS;
    case 'UseOC':
      // Not implemented, since we don't support Optional Content Groups yet.
  }
  return SidebarView.NONE; // Default value.
}

/* Abstract factory for the print service. */
let PDFPrintServiceFactory = {
  instance: {
    supportsPrinting: false,
    createPrintService() {
      throw new Error('Not implemented: createPrintService');
    },
  },
};

export {
  PDFViewerApplication,
  DefaultExternalServices,
  PDFPrintServiceFactory,
};
