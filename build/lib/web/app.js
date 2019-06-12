/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2019 Mozilla Foundation
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
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PDFPrintServiceFactory = exports.DefaultExternalServices = exports.PDFViewerApplication = void 0;

var _regenerator = _interopRequireDefault(require("@babel/runtime/regenerator"));

var _ui_utils = require("./ui_utils");

var _app_options = require("./app_options");

var _pdf = require("../pdf");

var _pdf_cursor_tools = require("./pdf_cursor_tools");

var _pdf_rendering_queue = require("./pdf_rendering_queue");

var _pdf_sidebar = require("./pdf_sidebar");

var _overlay_manager = require("./overlay_manager");

var _password_prompt = require("./password_prompt");

var _pdf_attachment_viewer = require("./pdf_attachment_viewer");

var _pdf_document_properties = require("./pdf_document_properties");

var _pdf_find_bar = require("./pdf_find_bar");

var _pdf_find_controller = require("./pdf_find_controller");

var _pdf_history = require("./pdf_history");

var _pdf_link_service = require("./pdf_link_service");

var _pdf_outline_viewer = require("./pdf_outline_viewer");

var _pdf_presentation_mode = require("./pdf_presentation_mode");

var _pdf_sidebar_resizer = require("./pdf_sidebar_resizer");

var _pdf_thumbnail_viewer = require("./pdf_thumbnail_viewer");

var _pdf_viewer = require("./pdf_viewer");

var _secondary_toolbar = require("./secondary_toolbar");

var _toolbar = require("./toolbar");

var _view_history = require("./view_history");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

var DEFAULT_SCALE_DELTA = 1.1;
var DISABLE_AUTO_FETCH_LOADING_BAR_TIMEOUT = 5000;
var FORCE_PAGES_LOADED_TIMEOUT = 10000;
var WHEEL_ZOOM_DISABLED_TIMEOUT = 1000;
var ViewOnLoad = {
  UNKNOWN: -1,
  PREVIOUS: 0,
  INITIAL: 1
};
var DefaultExternalServices = {
  updateFindControlState: function updateFindControlState(data) {},
  updateFindMatchesCount: function updateFindMatchesCount(data) {},
  initPassiveLoading: function initPassiveLoading(callbacks) {},
  fallback: function fallback(data, callback) {},
  reportTelemetry: function reportTelemetry(data) {},
  createDownloadManager: function createDownloadManager(options) {
    throw new Error('Not implemented: createDownloadManager');
  },
  createPreferences: function createPreferences() {
    throw new Error('Not implemented: createPreferences');
  },
  createL10n: function createL10n(options) {
    throw new Error('Not implemented: createL10n');
  },
  supportsIntegratedFind: false,
  supportsDocumentFonts: true,
  supportsDocumentColors: true,
  supportedMouseWheelZoomModifierKeys: {
    ctrlKey: true,
    metaKey: true
  }
};
exports.DefaultExternalServices = DefaultExternalServices;
var PDFViewerApplication = {
  initialBookmark: document.location.hash.substring(1),
  initialized: false,
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
  url: '',
  baseUrl: '',
  externalServices: DefaultExternalServices,
  _boundEvents: {},
  contentDispositionFilename: null,
  initialize: function () {
    var _initialize = _asyncToGenerator(
    /*#__PURE__*/
    _regenerator["default"].mark(function _callee(appConfig) {
      var _this = this;

      var appContainer;
      return _regenerator["default"].wrap(function _callee$(_context) {
        while (1) {
          switch (_context.prev = _context.next) {
            case 0:
              this.preferences = this.externalServices.createPreferences();
              this.appConfig = appConfig;
              _context.next = 4;
              return this._readPreferences();

            case 4:
              _context.next = 6;
              return this._parseHashParameters();

            case 6:
              _context.next = 8;
              return this._initializeL10n();

            case 8:
              if (this.isViewerEmbedded && _app_options.AppOptions.get('externalLinkTarget') === _pdf.LinkTarget.NONE) {
                _app_options.AppOptions.set('externalLinkTarget', _pdf.LinkTarget.TOP);
              }

              _context.next = 11;
              return this._initializeViewerComponents();

            case 11:
              this.bindEvents();
              this.bindWindowEvents();
              appContainer = appConfig.appContainer || document.documentElement;
              this.l10n.translate(appContainer).then(function () {
                _this.eventBus.dispatch('localized', {
                  source: _this
                });
              });
              this.initialized = true;

            case 16:
            case "end":
              return _context.stop();
          }
        }
      }, _callee, this);
    }));

    function initialize(_x) {
      return _initialize.apply(this, arguments);
    }

    return initialize;
  }(),
  _readPreferences: function () {
    var _readPreferences2 = _asyncToGenerator(
    /*#__PURE__*/
    _regenerator["default"].mark(function _callee2() {
      var prefs, name;
      return _regenerator["default"].wrap(function _callee2$(_context2) {
        while (1) {
          switch (_context2.prev = _context2.next) {
            case 0:
              if (!(_app_options.AppOptions.get('disablePreferences') === true)) {
                _context2.next = 2;
                break;
              }

              return _context2.abrupt("return");

            case 2:
              _context2.prev = 2;
              _context2.next = 5;
              return this.preferences.getAll();

            case 5:
              prefs = _context2.sent;

              for (name in prefs) {
                _app_options.AppOptions.set(name, prefs[name]);
              }

              _context2.next = 12;
              break;

            case 9:
              _context2.prev = 9;
              _context2.t0 = _context2["catch"](2);
              console.error("_readPreferences: \"".concat(_context2.t0.message, "\"."));

            case 12:
            case "end":
              return _context2.stop();
          }
        }
      }, _callee2, this, [[2, 9]]);
    }));

    function _readPreferences() {
      return _readPreferences2.apply(this, arguments);
    }

    return _readPreferences;
  }(),
  _parseHashParameters: function () {
    var _parseHashParameters2 = _asyncToGenerator(
    /*#__PURE__*/
    _regenerator["default"].mark(function _callee3() {
      var waitOn, hash, hashParams, viewer, enabled;
      return _regenerator["default"].wrap(function _callee3$(_context3) {
        while (1) {
          switch (_context3.prev = _context3.next) {
            case 0:
              if (_app_options.AppOptions.get('pdfBugEnabled')) {
                _context3.next = 2;
                break;
              }

              return _context3.abrupt("return", undefined);

            case 2:
              waitOn = [];
              hash = document.location.hash.substring(1);
              hashParams = (0, _ui_utils.parseQueryString)(hash);

              if ('disableworker' in hashParams && hashParams['disableworker'] === 'true') {
                waitOn.push(loadFakeWorker());
              }

              if ('disablerange' in hashParams) {
                _app_options.AppOptions.set('disableRange', hashParams['disablerange'] === 'true');
              }

              if ('disablestream' in hashParams) {
                _app_options.AppOptions.set('disableStream', hashParams['disablestream'] === 'true');
              }

              if ('disableautofetch' in hashParams) {
                _app_options.AppOptions.set('disableAutoFetch', hashParams['disableautofetch'] === 'true');
              }

              if ('disablefontface' in hashParams) {
                _app_options.AppOptions.set('disableFontFace', hashParams['disablefontface'] === 'true');
              }

              if ('disablehistory' in hashParams) {
                _app_options.AppOptions.set('disableHistory', hashParams['disablehistory'] === 'true');
              }

              if ('webgl' in hashParams) {
                _app_options.AppOptions.set('enableWebGL', hashParams['webgl'] === 'true');
              }

              if ('useonlycsszoom' in hashParams) {
                _app_options.AppOptions.set('useOnlyCssZoom', hashParams['useonlycsszoom'] === 'true');
              }

              if ('verbosity' in hashParams) {
                _app_options.AppOptions.set('verbosity', hashParams['verbosity'] | 0);
              }

              if (!('textlayer' in hashParams)) {
                _context3.next = 23;
                break;
              }

              _context3.t0 = hashParams['textlayer'];
              _context3.next = _context3.t0 === 'off' ? 18 : _context3.t0 === 'visible' ? 20 : _context3.t0 === 'shadow' ? 20 : _context3.t0 === 'hover' ? 20 : 23;
              break;

            case 18:
              _app_options.AppOptions.set('textLayerMode', _ui_utils.TextLayerMode.DISABLE);

              return _context3.abrupt("break", 23);

            case 20:
              viewer = this.appConfig.viewerContainer;
              viewer.classList.add('textLayer-' + hashParams['textlayer']);
              return _context3.abrupt("break", 23);

            case 23:
              if ('pdfbug' in hashParams) {
                _app_options.AppOptions.set('pdfBug', true);

                enabled = hashParams['pdfbug'].split(',');
                waitOn.push(loadAndEnablePDFBug(enabled));
              }

              if ('locale' in hashParams) {
                _app_options.AppOptions.set('locale', hashParams['locale']);
              }

              return _context3.abrupt("return", Promise.all(waitOn)["catch"](function (reason) {
                console.error("_parseHashParameters: \"".concat(reason.message, "\"."));
              }));

            case 26:
            case "end":
              return _context3.stop();
          }
        }
      }, _callee3, this);
    }));

    function _parseHashParameters() {
      return _parseHashParameters2.apply(this, arguments);
    }

    return _parseHashParameters;
  }(),
  _initializeL10n: function () {
    var _initializeL10n2 = _asyncToGenerator(
    /*#__PURE__*/
    _regenerator["default"].mark(function _callee4() {
      var dir;
      return _regenerator["default"].wrap(function _callee4$(_context4) {
        while (1) {
          switch (_context4.prev = _context4.next) {
            case 0:
              this.l10n = this.externalServices.createL10n({
                locale: _app_options.AppOptions.get('locale')
              });
              _context4.next = 3;
              return this.l10n.getDirection();

            case 3:
              dir = _context4.sent;
              document.getElementsByTagName('html')[0].dir = dir;

            case 5:
            case "end":
              return _context4.stop();
          }
        }
      }, _callee4, this);
    }));

    function _initializeL10n() {
      return _initializeL10n2.apply(this, arguments);
    }

    return _initializeL10n;
  }(),
  _initializeViewerComponents: function () {
    var _initializeViewerComponents2 = _asyncToGenerator(
    /*#__PURE__*/
    _regenerator["default"].mark(function _callee5() {
      var appConfig, eventBus, pdfRenderingQueue, pdfLinkService, downloadManager, findController, container, viewer;
      return _regenerator["default"].wrap(function _callee5$(_context5) {
        while (1) {
          switch (_context5.prev = _context5.next) {
            case 0:
              appConfig = this.appConfig;
              this.overlayManager = new _overlay_manager.OverlayManager();
              eventBus = appConfig.eventBus || (0, _ui_utils.getGlobalEventBus)(_app_options.AppOptions.get('eventBusDispatchToDOM'));
              this.eventBus = eventBus;
              pdfRenderingQueue = new _pdf_rendering_queue.PDFRenderingQueue();
              pdfRenderingQueue.onIdle = this.cleanup.bind(this);
              this.pdfRenderingQueue = pdfRenderingQueue;
              pdfLinkService = new _pdf_link_service.PDFLinkService({
                eventBus: eventBus,
                externalLinkTarget: _app_options.AppOptions.get('externalLinkTarget'),
                externalLinkRel: _app_options.AppOptions.get('externalLinkRel')
              });
              this.pdfLinkService = pdfLinkService;
              downloadManager = this.externalServices.createDownloadManager({
                disableCreateObjectURL: _app_options.AppOptions.get('disableCreateObjectURL')
              });
              this.downloadManager = downloadManager;
              findController = new _pdf_find_controller.PDFFindController({
                linkService: pdfLinkService,
                eventBus: eventBus
              });
              this.findController = findController;
              container = appConfig.mainContainer;
              viewer = appConfig.viewerContainer;
              this.pdfViewer = new _pdf_viewer.PDFViewer({
                container: container,
                viewer: viewer,
                eventBus: eventBus,
                renderingQueue: pdfRenderingQueue,
                linkService: pdfLinkService,
                downloadManager: downloadManager,
                findController: findController,
                renderer: _app_options.AppOptions.get('renderer'),
                enableWebGL: _app_options.AppOptions.get('enableWebGL'),
                l10n: this.l10n,
                textLayerMode: _app_options.AppOptions.get('textLayerMode'),
                imageResourcesPath: _app_options.AppOptions.get('imageResourcesPath'),
                renderInteractiveForms: _app_options.AppOptions.get('renderInteractiveForms'),
                enablePrintAutoRotate: _app_options.AppOptions.get('enablePrintAutoRotate'),
                useOnlyCssZoom: _app_options.AppOptions.get('useOnlyCssZoom'),
                maxCanvasPixels: _app_options.AppOptions.get('maxCanvasPixels')
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
                eventBus: eventBus
              });
              pdfLinkService.setHistory(this.pdfHistory);
              this.findBar = new _pdf_find_bar.PDFFindBar(appConfig.findBar, eventBus, this.l10n);
              this.pdfDocumentProperties = new _pdf_document_properties.PDFDocumentProperties(appConfig.documentProperties, this.overlayManager, eventBus, this.l10n);
              this.pdfCursorTools = new _pdf_cursor_tools.PDFCursorTools({
                container: container,
                eventBus: eventBus,
                cursorToolOnLoad: _app_options.AppOptions.get('cursorToolOnLoad')
              });
              this.toolbar = new _toolbar.Toolbar(appConfig.toolbar, eventBus, this.l10n);
              this.secondaryToolbar = new _secondary_toolbar.SecondaryToolbar(appConfig.secondaryToolbar, container, eventBus);

              if (this.supportsFullscreen) {
                this.pdfPresentationMode = new _pdf_presentation_mode.PDFPresentationMode({
                  container: container,
                  viewer: viewer,
                  pdfViewer: this.pdfViewer,
                  eventBus: eventBus,
                  contextMenuItems: appConfig.fullscreen
                });
              }

              this.passwordPrompt = new _password_prompt.PasswordPrompt(appConfig.passwordOverlay, this.overlayManager, this.l10n);
              this.pdfOutlineViewer = new _pdf_outline_viewer.PDFOutlineViewer({
                container: appConfig.sidebar.outlineView,
                eventBus: eventBus,
                linkService: pdfLinkService
              });
              this.pdfAttachmentViewer = new _pdf_attachment_viewer.PDFAttachmentViewer({
                container: appConfig.sidebar.attachmentsView,
                eventBus: eventBus,
                downloadManager: downloadManager
              });
              this.pdfSidebar = new _pdf_sidebar.PDFSidebar({
                elements: appConfig.sidebar,
                pdfViewer: this.pdfViewer,
                pdfThumbnailViewer: this.pdfThumbnailViewer,
                eventBus: eventBus,
                l10n: this.l10n
              });
              this.pdfSidebar.onToggled = this.forceRendering.bind(this);
              this.pdfSidebarResizer = new _pdf_sidebar_resizer.PDFSidebarResizer(appConfig.sidebarResizer, eventBus, this.l10n);

            case 34:
            case "end":
              return _context5.stop();
          }
        }
      }, _callee5, this);
    }));

    function _initializeViewerComponents() {
      return _initializeViewerComponents2.apply(this, arguments);
    }

    return _initializeViewerComponents;
  }(),
  run: function run(config) {
    this.initialize(config).then(webViewerInitialized);
  },
  zoomIn: function zoomIn(ticks) {
    var newScale = this.pdfViewer.currentScale;

    do {
      newScale = (newScale * DEFAULT_SCALE_DELTA).toFixed(2);
      newScale = Math.ceil(newScale * 10) / 10;
      newScale = Math.min(_ui_utils.MAX_SCALE, newScale);
    } while (--ticks > 0 && newScale < _ui_utils.MAX_SCALE);

    this.pdfViewer.currentScaleValue = newScale;
  },
  zoomOut: function zoomOut(ticks) {
    var newScale = this.pdfViewer.currentScale;

    do {
      newScale = (newScale / DEFAULT_SCALE_DELTA).toFixed(2);
      newScale = Math.floor(newScale * 10) / 10;
      newScale = Math.max(_ui_utils.MIN_SCALE, newScale);
    } while (--ticks > 0 && newScale > _ui_utils.MIN_SCALE);

    this.pdfViewer.currentScaleValue = newScale;
  },
  zoomReset: function zoomReset() {
    var ignoreDuplicate = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

    if (this.pdfViewer.isInPresentationMode) {
      return;
    } else if (ignoreDuplicate && this.pdfViewer.currentScaleValue === _ui_utils.DEFAULT_SCALE_VALUE) {
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
    var support;
    var doc = document.documentElement;
    support = !!(doc.requestFullscreen || doc.mozRequestFullScreen || doc.webkitRequestFullScreen || doc.msRequestFullscreen);

    if (document.fullscreenEnabled === false || document.mozFullScreenEnabled === false || document.webkitFullscreenEnabled === false || document.msFullscreenEnabled === false) {
      support = false;
    }

    return (0, _pdf.shadow)(this, 'supportsFullscreen', support);
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
    var bar = new _ui_utils.ProgressBar('#loadingBar');
    return (0, _pdf.shadow)(this, 'loadingBar', bar);
  },

  get supportedMouseWheelZoomModifierKeys() {
    return this.externalServices.supportedMouseWheelZoomModifierKeys;
  },

  initPassiveLoading: function initPassiveLoading() {
    throw new Error('Not implemented: initPassiveLoading');
  },
  setTitleUsingUrl: function setTitleUsingUrl() {
    var url = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
    this.url = url;
    this.baseUrl = url.split('#')[0];
    var title = (0, _ui_utils.getPDFFileNameFromURL)(url, '');

    if (!title) {
      try {
        title = decodeURIComponent((0, _pdf.getFilenameFromUrl)(url)) || url;
      } catch (ex) {
        title = url;
      }
    }

    this.setTitle(title);
  },
  setTitle: function setTitle(title) {
    if (this.isViewerEmbedded) {
      return;
    }

    document.title = title;
  },
  close: function () {
    var _close = _asyncToGenerator(
    /*#__PURE__*/
    _regenerator["default"].mark(function _callee6() {
      var errorWrapper, promise;
      return _regenerator["default"].wrap(function _callee6$(_context6) {
        while (1) {
          switch (_context6.prev = _context6.next) {
            case 0:
              errorWrapper = this.appConfig.errorWrapper.container;
              errorWrapper.setAttribute('hidden', 'true');

              if (this.pdfLoadingTask) {
                _context6.next = 4;
                break;
              }

              return _context6.abrupt("return", undefined);

            case 4:
              promise = this.pdfLoadingTask.destroy();
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
              this.url = '';
              this.baseUrl = '';
              this.contentDispositionFilename = null;
              this.pdfSidebar.reset();
              this.pdfOutlineViewer.reset();
              this.pdfAttachmentViewer.reset();
              this.findBar.reset();
              this.toolbar.reset();
              this.secondaryToolbar.reset();

              if (typeof PDFBug !== 'undefined') {
                PDFBug.cleanup();
              }

              return _context6.abrupt("return", promise);

            case 21:
            case "end":
              return _context6.stop();
          }
        }
      }, _callee6, this);
    }));

    function close() {
      return _close.apply(this, arguments);
    }

    return close;
  }(),
  open: function () {
    var _open = _asyncToGenerator(
    /*#__PURE__*/
    _regenerator["default"].mark(function _callee7(file, args) {
      var _this2 = this;

      var workerParameters, key, parameters, apiParameters, _key, prop, loadingTask;

      return _regenerator["default"].wrap(function _callee7$(_context7) {
        while (1) {
          switch (_context7.prev = _context7.next) {
            case 0:
              if (!this.pdfLoadingTask) {
                _context7.next = 3;
                break;
              }

              _context7.next = 3;
              return this.close();

            case 3:
              workerParameters = _app_options.AppOptions.getAll(_app_options.OptionKind.WORKER);

              for (key in workerParameters) {
                _pdf.GlobalWorkerOptions[key] = workerParameters[key];
              }

              parameters = Object.create(null);

              if (typeof file === 'string') {
                this.setTitleUsingUrl(file);
                parameters.url = file;
              } else if (file && 'byteLength' in file) {
                parameters.data = file;
              } else if (file.url && file.originalUrl) {
                this.setTitleUsingUrl(file.originalUrl);
                parameters.url = file.url;
              }

              apiParameters = _app_options.AppOptions.getAll(_app_options.OptionKind.API);

              for (_key in apiParameters) {
                parameters[_key] = apiParameters[_key];
              }

              if (args) {
                for (prop in args) {
                  if (prop === 'length') {
                    this.pdfDocumentProperties.setFileSize(args[prop]);
                  }

                  parameters[prop] = args[prop];
                }
              }

              loadingTask = (0, _pdf.getDocument)(parameters);
              this.pdfLoadingTask = loadingTask;

              loadingTask.onPassword = function (updateCallback, reason) {
                _this2.passwordPrompt.setUpdateCallback(updateCallback, reason);

                _this2.passwordPrompt.open();
              };

              loadingTask.onProgress = function (_ref) {
                var loaded = _ref.loaded,
                    total = _ref.total;

                _this2.progress(loaded / total);
              };

              loadingTask.onUnsupportedFeature = this.fallback.bind(this);
              return _context7.abrupt("return", loadingTask.promise.then(function (pdfDocument) {
                _this2.load(pdfDocument);
              }, function (exception) {
                if (loadingTask !== _this2.pdfLoadingTask) {
                  return undefined;
                }

                var message = exception && exception.message;
                var loadingErrorMessage;

                if (exception instanceof _pdf.InvalidPDFException) {
                  loadingErrorMessage = _this2.l10n.get('invalid_file_error', null, 'Invalid or corrupted PDF file.');
                } else if (exception instanceof _pdf.MissingPDFException) {
                  loadingErrorMessage = _this2.l10n.get('missing_file_error', null, 'Missing PDF file.');
                } else if (exception instanceof _pdf.UnexpectedResponseException) {
                  loadingErrorMessage = _this2.l10n.get('unexpected_response_error', null, 'Unexpected server response.');
                } else {
                  loadingErrorMessage = _this2.l10n.get('loading_error', null, 'An error occurred while loading the PDF.');
                }

                return loadingErrorMessage.then(function (msg) {
                  _this2.error(msg, {
                    message: message
                  });

                  throw new Error(msg);
                });
              }));

            case 16:
            case "end":
              return _context7.stop();
          }
        }
      }, _callee7, this);
    }));

    function open(_x2, _x3) {
      return _open.apply(this, arguments);
    }

    return open;
  }(),
  download: function download() {
    var _this3 = this;

    function downloadByUrl() {
      downloadManager.downloadUrl(url, filename);
    }

    var url = this.baseUrl;
    var filename = this.contentDispositionFilename || (0, _ui_utils.getPDFFileNameFromURL)(this.url);
    var downloadManager = this.downloadManager;

    downloadManager.onerror = function (err) {
      _this3.error("PDF failed to download: ".concat(err));
    };

    if (!this.pdfDocument || !this.downloadComplete) {
      downloadByUrl();
      return;
    }

    this.pdfDocument.getData().then(function (data) {
      var blob = new Blob([data], {
        type: 'application/pdf'
      });
      downloadManager.download(blob, url, filename);
    })["catch"](downloadByUrl);
  },
  fallback: function fallback(featureId) {},
  error: function error(message, moreInfo) {
    var moreInfoText = [this.l10n.get('error_version_info', {
      version: _pdf.version || '?',
      build: _pdf.build || '?'
    }, 'PDF.js v{{version}} (build: {{build}})')];

    if (moreInfo) {
      moreInfoText.push(this.l10n.get('error_message', {
        message: moreInfo.message
      }, 'Message: {{message}}'));

      if (moreInfo.stack) {
        moreInfoText.push(this.l10n.get('error_stack', {
          stack: moreInfo.stack
        }, 'Stack: {{stack}}'));
      } else {
        if (moreInfo.filename) {
          moreInfoText.push(this.l10n.get('error_file', {
            file: moreInfo.filename
          }, 'File: {{file}}'));
        }

        if (moreInfo.lineNumber) {
          moreInfoText.push(this.l10n.get('error_line', {
            line: moreInfo.lineNumber
          }, 'Line: {{line}}'));
        }
      }
    }

    var errorWrapperConfig = this.appConfig.errorWrapper;
    var errorWrapper = errorWrapperConfig.container;
    errorWrapper.removeAttribute('hidden');
    var errorMessage = errorWrapperConfig.errorMessage;
    errorMessage.textContent = message;
    var closeButton = errorWrapperConfig.closeButton;

    closeButton.onclick = function () {
      errorWrapper.setAttribute('hidden', 'true');
    };

    var errorMoreInfo = errorWrapperConfig.errorMoreInfo;
    var moreInfoButton = errorWrapperConfig.moreInfoButton;
    var lessInfoButton = errorWrapperConfig.lessInfoButton;

    moreInfoButton.onclick = function () {
      errorMoreInfo.removeAttribute('hidden');
      moreInfoButton.setAttribute('hidden', 'true');
      lessInfoButton.removeAttribute('hidden');
      errorMoreInfo.style.height = errorMoreInfo.scrollHeight + 'px';
    };

    lessInfoButton.onclick = function () {
      errorMoreInfo.setAttribute('hidden', 'true');
      moreInfoButton.removeAttribute('hidden');
      lessInfoButton.setAttribute('hidden', 'true');
    };

    moreInfoButton.oncontextmenu = _ui_utils.noContextMenuHandler;
    lessInfoButton.oncontextmenu = _ui_utils.noContextMenuHandler;
    closeButton.oncontextmenu = _ui_utils.noContextMenuHandler;
    moreInfoButton.removeAttribute('hidden');
    lessInfoButton.setAttribute('hidden', 'true');
    Promise.all(moreInfoText).then(function (parts) {
      errorMoreInfo.value = parts.join('\n');
    });
  },
  progress: function progress(level) {
    var _this4 = this;

    if (this.downloadComplete) {
      return;
    }

    var percent = Math.round(level * 100);

    if (percent > this.loadingBar.percent || isNaN(percent)) {
      this.loadingBar.percent = percent;
      var disableAutoFetch = this.pdfDocument ? this.pdfDocument.loadingParams['disableAutoFetch'] : _app_options.AppOptions.get('disableAutoFetch');

      if (disableAutoFetch && percent) {
        if (this.disableAutoFetchLoadingBarTimeout) {
          clearTimeout(this.disableAutoFetchLoadingBarTimeout);
          this.disableAutoFetchLoadingBarTimeout = null;
        }

        this.loadingBar.show();
        this.disableAutoFetchLoadingBarTimeout = setTimeout(function () {
          _this4.loadingBar.hide();

          _this4.disableAutoFetchLoadingBarTimeout = null;
        }, DISABLE_AUTO_FETCH_LOADING_BAR_TIMEOUT);
      }
    }
  },
  load: function load(pdfDocument) {
    var _this5 = this;

    this.pdfDocument = pdfDocument;
    pdfDocument.getDownloadInfo().then(function () {
      _this5.downloadComplete = true;

      _this5.loadingBar.hide();

      firstPagePromise.then(function () {
        _this5.eventBus.dispatch('documentloaded', {
          source: _this5
        });
      });
    });
    var pageLayoutPromise = pdfDocument.getPageLayout()["catch"](function () {});
    var pageModePromise = pdfDocument.getPageMode()["catch"](function () {});
    var openActionDestPromise = pdfDocument.getOpenActionDestination()["catch"](function () {});
    this.toolbar.setPagesCount(pdfDocument.numPages, false);
    this.secondaryToolbar.setPagesCount(pdfDocument.numPages);
    var store = this.store = new _view_history.ViewHistory(pdfDocument.fingerprint);
    var baseDocumentUrl;
    baseDocumentUrl = null;
    this.pdfLinkService.setDocument(pdfDocument, baseDocumentUrl);
    this.pdfDocumentProperties.setDocument(pdfDocument, this.url);
    var pdfViewer = this.pdfViewer;
    pdfViewer.setDocument(pdfDocument);
    var firstPagePromise = pdfViewer.firstPagePromise;
    var pagesPromise = pdfViewer.pagesPromise;
    var onePageRendered = pdfViewer.onePageRendered;
    var pdfThumbnailViewer = this.pdfThumbnailViewer;
    pdfThumbnailViewer.setDocument(pdfDocument);
    firstPagePromise.then(function (pdfPage) {
      _this5.loadingBar.setWidth(_this5.appConfig.viewerContainer);

      var storePromise = store.getMultiple({
        page: null,
        zoom: _ui_utils.DEFAULT_SCALE_VALUE,
        scrollLeft: '0',
        scrollTop: '0',
        rotation: null,
        sidebarView: _pdf_sidebar.SidebarView.UNKNOWN,
        scrollMode: _ui_utils.ScrollMode.UNKNOWN,
        spreadMode: _ui_utils.SpreadMode.UNKNOWN
      })["catch"](function () {});
      Promise.all([storePromise, pageLayoutPromise, pageModePromise, openActionDestPromise]).then(
      /*#__PURE__*/
      function () {
        var _ref3 = _asyncToGenerator(
        /*#__PURE__*/
        _regenerator["default"].mark(function _callee8(_ref2) {
          var _ref4, _ref4$, values, pageLayout, pageMode, openActionDest, viewOnLoad, initialBookmark, zoom, hash, rotation, sidebarView, scrollMode, spreadMode;

          return _regenerator["default"].wrap(function _callee8$(_context8) {
            while (1) {
              switch (_context8.prev = _context8.next) {
                case 0:
                  _ref4 = _slicedToArray(_ref2, 4), _ref4$ = _ref4[0], values = _ref4$ === void 0 ? {} : _ref4$, pageLayout = _ref4[1], pageMode = _ref4[2], openActionDest = _ref4[3];
                  viewOnLoad = _app_options.AppOptions.get('viewOnLoad');

                  _this5._initializePdfHistory({
                    fingerprint: pdfDocument.fingerprint,
                    viewOnLoad: viewOnLoad,
                    initialDest: openActionDest
                  });

                  initialBookmark = _this5.initialBookmark;
                  zoom = _app_options.AppOptions.get('defaultZoomValue');
                  hash = zoom ? "zoom=".concat(zoom) : null;
                  rotation = null;
                  sidebarView = _app_options.AppOptions.get('sidebarViewOnLoad');
                  scrollMode = _app_options.AppOptions.get('scrollModeOnLoad');
                  spreadMode = _app_options.AppOptions.get('spreadModeOnLoad');

                  if (values.page && viewOnLoad !== ViewOnLoad.INITIAL) {
                    hash = "page=".concat(values.page, "&zoom=").concat(zoom || values.zoom, ",") + "".concat(values.scrollLeft, ",").concat(values.scrollTop);
                    rotation = parseInt(values.rotation, 10);

                    if (sidebarView === _pdf_sidebar.SidebarView.UNKNOWN) {
                      sidebarView = values.sidebarView | 0;
                    }

                    if (scrollMode === _ui_utils.ScrollMode.UNKNOWN) {
                      scrollMode = values.scrollMode | 0;
                    }

                    if (spreadMode === _ui_utils.SpreadMode.UNKNOWN) {
                      spreadMode = values.spreadMode | 0;
                    }
                  }

                  if (pageMode && sidebarView === _pdf_sidebar.SidebarView.UNKNOWN) {
                    sidebarView = apiPageModeToSidebarView(pageMode);
                  }

                  if (pageLayout && spreadMode === _ui_utils.SpreadMode.UNKNOWN) {
                    spreadMode = apiPageLayoutToSpreadMode(pageLayout);
                  }

                  _this5.setInitialView(hash, {
                    rotation: rotation,
                    sidebarView: sidebarView,
                    scrollMode: scrollMode,
                    spreadMode: spreadMode
                  });

                  _this5.eventBus.dispatch('documentinit', {
                    source: _this5
                  });

                  if (!_this5.isViewerEmbedded) {
                    pdfViewer.focus();
                  }

                  _context8.next = 18;
                  return Promise.race([pagesPromise, new Promise(function (resolve) {
                    setTimeout(resolve, FORCE_PAGES_LOADED_TIMEOUT);
                  })]);

                case 18:
                  if (!(!initialBookmark && !hash)) {
                    _context8.next = 20;
                    break;
                  }

                  return _context8.abrupt("return");

                case 20:
                  if (!pdfViewer.hasEqualPageSizes) {
                    _context8.next = 22;
                    break;
                  }

                  return _context8.abrupt("return");

                case 22:
                  _this5.initialBookmark = initialBookmark;
                  pdfViewer.currentScaleValue = pdfViewer.currentScaleValue;

                  _this5.setInitialView(hash);

                case 25:
                case "end":
                  return _context8.stop();
              }
            }
          }, _callee8);
        }));

        return function (_x4) {
          return _ref3.apply(this, arguments);
        };
      }())["catch"](function () {
        _this5.setInitialView();
      }).then(function () {
        pdfViewer.update();
      });
    });
    pdfDocument.getPageLabels().then(function (labels) {
      if (!labels || _app_options.AppOptions.get('disablePageLabels')) {
        return;
      }

      var i = 0,
          numLabels = labels.length;

      if (numLabels !== _this5.pagesCount) {
        console.error('The number of Page Labels does not match ' + 'the number of pages in the document.');
        return;
      }

      while (i < numLabels && labels[i] === (i + 1).toString()) {
        i++;
      }

      if (i === numLabels) {
        return;
      }

      pdfViewer.setPageLabels(labels);
      pdfThumbnailViewer.setPageLabels(labels);

      _this5.toolbar.setPagesCount(pdfDocument.numPages, true);

      _this5.toolbar.setPageNumber(pdfViewer.currentPageNumber, pdfViewer.currentPageLabel);
    });
    pagesPromise.then(function () {
      if (!_this5.supportsPrinting) {
        return;
      }

      pdfDocument.getJavaScript().then(function (javaScript) {
        if (!javaScript) {
          return;
        }

        javaScript.some(function (js) {
          if (!js) {
            return false;
          }

          console.warn('Warning: JavaScript is not supported');

          _this5.fallback(_pdf.UNSUPPORTED_FEATURES.javaScript);

          return true;
        });
        var regex = /\bprint\s*\(/;

        for (var i = 0, ii = javaScript.length; i < ii; i++) {
          var js = javaScript[i];

          if (js && regex.test(js)) {
            setTimeout(function () {
              window.print();
            });
            return;
          }
        }
      });
    });
    Promise.all([onePageRendered, _ui_utils.animationStarted]).then(function () {
      pdfDocument.getOutline().then(function (outline) {
        _this5.pdfOutlineViewer.render({
          outline: outline
        });
      });
      pdfDocument.getAttachments().then(function (attachments) {
        _this5.pdfAttachmentViewer.render({
          attachments: attachments
        });
      });
    });
    pdfDocument.getMetadata().then(function (_ref5) {
      var info = _ref5.info,
          metadata = _ref5.metadata,
          contentDispositionFilename = _ref5.contentDispositionFilename;
      _this5.documentInfo = info;
      _this5.metadata = metadata;
      _this5.contentDispositionFilename = contentDispositionFilename;
      console.log('PDF ' + pdfDocument.fingerprint + ' [' + info.PDFFormatVersion + ' ' + (info.Producer || '-').trim() + ' / ' + (info.Creator || '-').trim() + ']' + ' (PDF.js: ' + (_pdf.version || '-') + (_app_options.AppOptions.get('enableWebGL') ? ' [WebGL]' : '') + ')');
      var pdfTitle;

      if (metadata && metadata.has('dc:title')) {
        var title = metadata.get('dc:title');

        if (title !== 'Untitled') {
          pdfTitle = title;
        }
      }

      if (!pdfTitle && info && info['Title']) {
        pdfTitle = info['Title'];
      }

      if (pdfTitle) {
        _this5.setTitle("".concat(pdfTitle, " - ").concat(contentDispositionFilename || document.title));
      } else if (contentDispositionFilename) {
        _this5.setTitle(contentDispositionFilename);
      }

      if (info.IsAcroFormPresent) {
        console.warn('Warning: AcroForm/XFA is not supported');

        _this5.fallback(_pdf.UNSUPPORTED_FEATURES.forms);
      }
    });
  },
  _initializePdfHistory: function _initializePdfHistory(_ref6) {
    var fingerprint = _ref6.fingerprint,
        viewOnLoad = _ref6.viewOnLoad,
        _ref6$initialDest = _ref6.initialDest,
        initialDest = _ref6$initialDest === void 0 ? null : _ref6$initialDest;

    if (_app_options.AppOptions.get('disableHistory') || this.isViewerEmbedded) {
      return;
    }

    this.pdfHistory.initialize({
      fingerprint: fingerprint,
      resetHistory: viewOnLoad === ViewOnLoad.INITIAL,
      updateUrl: _app_options.AppOptions.get('historyUpdateUrl')
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
  setInitialView: function setInitialView(storedHash) {
    var _this6 = this;

    var _ref7 = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
        rotation = _ref7.rotation,
        sidebarView = _ref7.sidebarView,
        scrollMode = _ref7.scrollMode,
        spreadMode = _ref7.spreadMode;

    var setRotation = function setRotation(angle) {
      if ((0, _ui_utils.isValidRotation)(angle)) {
        _this6.pdfViewer.pagesRotation = angle;
      }
    };

    var setViewerModes = function setViewerModes(scroll, spread) {
      if ((0, _ui_utils.isValidScrollMode)(scroll)) {
        _this6.pdfViewer.scrollMode = scroll;
      }

      if ((0, _ui_utils.isValidSpreadMode)(spread)) {
        _this6.pdfViewer.spreadMode = spread;
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
  cleanup: function cleanup() {
    if (!this.pdfDocument) {
      return;
    }

    this.pdfViewer.cleanup();
    this.pdfThumbnailViewer.cleanup();

    if (this.pdfViewer.renderer !== _ui_utils.RendererType.SVG) {
      this.pdfDocument.cleanup();
    }
  },
  forceRendering: function forceRendering() {
    this.pdfRenderingQueue.printing = this.printing;
    this.pdfRenderingQueue.isThumbnailViewEnabled = this.pdfSidebar.isThumbnailViewVisible;
    this.pdfRenderingQueue.renderHighestPriority();
  },
  beforePrint: function beforePrint() {
    var _this7 = this;

    if (this.printService) {
      return;
    }

    if (!this.supportsPrinting) {
      this.l10n.get('printing_not_supported', null, 'Warning: Printing is not fully supported by ' + 'this browser.').then(function (printMessage) {
        _this7.error(printMessage);
      });
      return;
    }

    if (!this.pdfViewer.pageViewsReady) {
      this.l10n.get('printing_not_ready', null, 'Warning: The PDF is not fully loaded for printing.').then(function (notReadyMessage) {
        window.alert(notReadyMessage);
      });
      return;
    }

    var pagesOverview = this.pdfViewer.getPagesOverview();
    var printContainer = this.appConfig.printContainer;
    var printService = PDFPrintServiceFactory.instance.createPrintService(this.pdfDocument, pagesOverview, printContainer, this.l10n);
    this.printService = printService;
    this.forceRendering();
    printService.layout();
  },
  afterPrint: function pdfViewSetupAfterPrint() {
    if (this.printService) {
      this.printService.destroy();
      this.printService = null;
    }

    this.forceRendering();
  },
  rotatePages: function rotatePages(delta) {
    if (!this.pdfDocument) {
      return;
    }

    var newRotation = (this.pdfViewer.pagesRotation + 360 + delta) % 360;
    this.pdfViewer.pagesRotation = newRotation;
  },
  requestPresentationMode: function requestPresentationMode() {
    if (!this.pdfPresentationMode) {
      return;
    }

    this.pdfPresentationMode.request();
  },
  bindEvents: function bindEvents() {
    var eventBus = this.eventBus,
        _boundEvents = this._boundEvents;
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
    eventBus.on('rotationchanging', webViewerRotationChanging);
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
    eventBus.on('zoomreset', webViewerZoomReset);
    eventBus.on('pagenumberchanged', webViewerPageNumberChanged);
    eventBus.on('scalechanged', webViewerScaleChanged);
    eventBus.on('rotatecw', webViewerRotateCw);
    eventBus.on('rotateccw', webViewerRotateCcw);
    eventBus.on('switchscrollmode', webViewerSwitchScrollMode);
    eventBus.on('scrollmodechanged', webViewerScrollModeChanged);
    eventBus.on('switchspreadmode', webViewerSwitchSpreadMode);
    eventBus.on('spreadmodechanged', webViewerSpreadModeChanged);
    eventBus.on('documentproperties', webViewerDocumentProperties);
    eventBus.on('find', webViewerFind);
    eventBus.on('findfromurlhash', webViewerFindFromUrlHash);
    eventBus.on('updatefindmatchescount', webViewerUpdateFindMatchesCount);
    eventBus.on('updatefindcontrolstate', webViewerUpdateFindControlState);
    eventBus.on('fileinputchange', webViewerFileInputChange);
  },
  bindWindowEvents: function bindWindowEvents() {
    var eventBus = this.eventBus,
        _boundEvents = this._boundEvents;

    _boundEvents.windowResize = function () {
      eventBus.dispatch('resize', {
        source: window
      });
    };

    _boundEvents.windowHashChange = function () {
      eventBus.dispatch('hashchange', {
        source: window,
        hash: document.location.hash.substring(1)
      });
    };

    _boundEvents.windowBeforePrint = function () {
      eventBus.dispatch('beforeprint', {
        source: window
      });
    };

    _boundEvents.windowAfterPrint = function () {
      eventBus.dispatch('afterprint', {
        source: window
      });
    };

    window.addEventListener('visibilitychange', webViewerVisibilityChange);
    window.addEventListener('wheel', webViewerWheel, {
      passive: false
    });
    window.addEventListener('click', webViewerClick);
    window.addEventListener('keydown', webViewerKeyDown);
    window.addEventListener('resize', _boundEvents.windowResize);
    window.addEventListener('hashchange', _boundEvents.windowHashChange);
    window.addEventListener('beforeprint', _boundEvents.windowBeforePrint);
    window.addEventListener('afterprint', _boundEvents.windowAfterPrint);
  },
  unbindEvents: function unbindEvents() {
    var eventBus = this.eventBus,
        _boundEvents = this._boundEvents;
    eventBus.off('resize', webViewerResize);
    eventBus.off('hashchange', webViewerHashchange);
    eventBus.off('beforeprint', _boundEvents.beforePrint);
    eventBus.off('afterprint', _boundEvents.afterPrint);
    eventBus.off('pagerendered', webViewerPageRendered);
    eventBus.off('textlayerrendered', webViewerTextLayerRendered);
    eventBus.off('updateviewarea', webViewerUpdateViewarea);
    eventBus.off('pagechanging', webViewerPageChanging);
    eventBus.off('scalechanging', webViewerScaleChanging);
    eventBus.off('rotationchanging', webViewerRotationChanging);
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
    eventBus.off('zoomreset', webViewerZoomReset);
    eventBus.off('pagenumberchanged', webViewerPageNumberChanged);
    eventBus.off('scalechanged', webViewerScaleChanged);
    eventBus.off('rotatecw', webViewerRotateCw);
    eventBus.off('rotateccw', webViewerRotateCcw);
    eventBus.off('switchscrollmode', webViewerSwitchScrollMode);
    eventBus.off('scrollmodechanged', webViewerScrollModeChanged);
    eventBus.off('switchspreadmode', webViewerSwitchSpreadMode);
    eventBus.off('spreadmodechanged', webViewerSpreadModeChanged);
    eventBus.off('documentproperties', webViewerDocumentProperties);
    eventBus.off('find', webViewerFind);
    eventBus.off('findfromurlhash', webViewerFindFromUrlHash);
    eventBus.off('updatefindmatchescount', webViewerUpdateFindMatchesCount);
    eventBus.off('updatefindcontrolstate', webViewerUpdateFindControlState);
    eventBus.off('fileinputchange', webViewerFileInputChange);
    _boundEvents.beforePrint = null;
    _boundEvents.afterPrint = null;
  },
  unbindWindowEvents: function unbindWindowEvents() {
    var _boundEvents = this._boundEvents;
    window.removeEventListener('visibilitychange', webViewerVisibilityChange);
    window.removeEventListener('wheel', webViewerWheel);
    window.removeEventListener('click', webViewerClick);
    window.removeEventListener('keydown', webViewerKeyDown);
    window.removeEventListener('resize', _boundEvents.windowResize);
    window.removeEventListener('hashchange', _boundEvents.windowHashChange);
    window.removeEventListener('beforeprint', _boundEvents.windowBeforePrint);
    window.removeEventListener('afterprint', _boundEvents.windowAfterPrint);
    _boundEvents.windowResize = null;
    _boundEvents.windowHashChange = null;
    _boundEvents.windowBeforePrint = null;
    _boundEvents.windowAfterPrint = null;
  }
};
exports.PDFViewerApplication = PDFViewerApplication;
var validateFileURL;
{
  var HOSTED_VIEWER_ORIGINS = ['null', 'http://mozilla.github.io', 'https://mozilla.github.io'];

  validateFileURL = function validateFileURL(file) {
    if (file === undefined) {
      return;
    }

    try {
      var viewerOrigin = new _pdf.URL(window.location.href).origin || 'null';

      if (HOSTED_VIEWER_ORIGINS.includes(viewerOrigin)) {
        return;
      }

      var _ref8 = new _pdf.URL(file, window.location.href),
          origin = _ref8.origin,
          protocol = _ref8.protocol;

      if (origin !== viewerOrigin && protocol !== 'blob:') {
        throw new Error('file origin does not match viewer\'s');
      }
    } catch (ex) {
      var message = ex && ex.message;
      PDFViewerApplication.l10n.get('loading_error', null, 'An error occurred while loading the PDF.').then(function (loadingErrorMessage) {
        PDFViewerApplication.error(loadingErrorMessage, {
          message: message
        });
      });
      throw ex;
    }
  };
}

function loadFakeWorker() {
  if (!_pdf.GlobalWorkerOptions.workerSrc) {
    _pdf.GlobalWorkerOptions.workerSrc = _app_options.AppOptions.get('workerSrc');
  }

  return (0, _pdf.loadScript)(_pdf.PDFWorker.getWorkerSrc());
}

function loadAndEnablePDFBug(enabledTabs) {
  var appConfig = PDFViewerApplication.appConfig;
  return (0, _pdf.loadScript)(appConfig.debuggerScriptPath).then(function () {
    PDFBug.enable(enabledTabs);
    PDFBug.init({
      OPS: _pdf.OPS,
      createObjectURL: _pdf.createObjectURL
    }, appConfig.mainContainer);
  });
}

function webViewerInitialized() {
  var appConfig = PDFViewerApplication.appConfig;
  var file;
  var queryString = document.location.search.substring(1);
  var params = (0, _ui_utils.parseQueryString)(queryString);
  file = 'file' in params ? params.file : _app_options.AppOptions.get('defaultUrl');
  validateFileURL(file);
  var fileInput = document.createElement('input');
  fileInput.id = appConfig.openFileInputName;
  fileInput.className = 'fileInput';
  fileInput.setAttribute('type', 'file');
  fileInput.oncontextmenu = _ui_utils.noContextMenuHandler;
  document.body.appendChild(fileInput);

  if (!window.File || !window.FileReader || !window.FileList || !window.Blob) {
    appConfig.toolbar.openFile.setAttribute('hidden', 'true');
    appConfig.secondaryToolbar.openFileButton.setAttribute('hidden', 'true');
  } else {
    fileInput.value = null;
  }

  fileInput.addEventListener('change', function (evt) {
    var files = evt.target.files;

    if (!files || files.length === 0) {
      return;
    }

    PDFViewerApplication.eventBus.dispatch('fileinputchange', {
      source: this,
      fileInput: evt.target
    });
  });
  appConfig.mainContainer.addEventListener('dragover', function (evt) {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'move';
  });
  appConfig.mainContainer.addEventListener('drop', function (evt) {
    evt.preventDefault();
    var files = evt.dataTransfer.files;

    if (!files || files.length === 0) {
      return;
    }

    PDFViewerApplication.eventBus.dispatch('fileinputchange', {
      source: this,
      fileInput: evt.dataTransfer
    });
  });

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

  appConfig.mainContainer.addEventListener('transitionend', function (evt) {
    if (evt.target === this) {
      PDFViewerApplication.eventBus.dispatch('resize', {
        source: this
      });
    }
  }, true);
  appConfig.sidebar.toggleButton.addEventListener('click', function () {
    PDFViewerApplication.pdfSidebar.toggle();
  });

  try {
    webViewerOpenFileViaURL(file);
  } catch (reason) {
    PDFViewerApplication.l10n.get('loading_error', null, 'An error occurred while loading the PDF.').then(function (msg) {
      PDFViewerApplication.error(msg, reason);
    });
  }
}

var webViewerOpenFileViaURL;
{
  webViewerOpenFileViaURL = function webViewerOpenFileViaURL(file) {
    if (file && file.lastIndexOf('file:', 0) === 0) {
      PDFViewerApplication.setTitleUsingUrl(file);
      var xhr = new XMLHttpRequest();

      xhr.onload = function () {
        PDFViewerApplication.open(new Uint8Array(xhr.response));
      };

      xhr.open('GET', file);
      xhr.responseType = 'arraybuffer';
      xhr.send();
      return;
    }

    if (file) {
      PDFViewerApplication.open(file);
    }
  };
}

function webViewerPageRendered(evt) {
  var pageNumber = evt.pageNumber;
  var pageIndex = pageNumber - 1;
  var pageView = PDFViewerApplication.pdfViewer.getPageView(pageIndex);

  if (pageNumber === PDFViewerApplication.page) {
    PDFViewerApplication.toolbar.updateLoadingIndicatorState(false);
  }

  if (!pageView) {
    return;
  }

  if (PDFViewerApplication.pdfSidebar.isThumbnailViewVisible) {
    var thumbnailView = PDFViewerApplication.pdfThumbnailViewer.getThumbnail(pageIndex);
    thumbnailView.setImage(pageView);
  }

  if (typeof Stats !== 'undefined' && Stats.enabled && pageView.stats) {
    Stats.add(pageNumber, pageView.stats);
  }

  if (pageView.error) {
    PDFViewerApplication.l10n.get('rendering_error', null, 'An error occurred while rendering the page.').then(function (msg) {
      PDFViewerApplication.error(msg, pageView.error);
    });
  }
}

function webViewerTextLayerRendered(evt) {}

function webViewerPageMode(evt) {
  var mode = evt.mode,
      view;

  switch (mode) {
    case 'thumbs':
      view = _pdf_sidebar.SidebarView.THUMBS;
      break;

    case 'bookmarks':
    case 'outline':
      view = _pdf_sidebar.SidebarView.OUTLINE;
      break;

    case 'attachments':
      view = _pdf_sidebar.SidebarView.ATTACHMENTS;
      break;

    case 'none':
      view = _pdf_sidebar.SidebarView.NONE;
      break;

    default:
      console.error('Invalid "pagemode" hash parameter: ' + mode);
      return;
  }

  PDFViewerApplication.pdfSidebar.switchView(view, true);
}

function webViewerNamedAction(evt) {
  var action = evt.action;

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
  var active = evt.active,
      switchInProgress = evt.switchInProgress;
  PDFViewerApplication.pdfViewer.presentationModeState = switchInProgress ? _ui_utils.PresentationModeState.CHANGING : active ? _ui_utils.PresentationModeState.FULLSCREEN : _ui_utils.PresentationModeState.NORMAL;
}

function webViewerSidebarViewChanged(evt) {
  PDFViewerApplication.pdfRenderingQueue.isThumbnailViewEnabled = PDFViewerApplication.pdfSidebar.isThumbnailViewVisible;
  var store = PDFViewerApplication.store;

  if (store && PDFViewerApplication.isInitialViewSet) {
    store.set('sidebarView', evt.view)["catch"](function () {});
  }
}

function webViewerUpdateViewarea(evt) {
  var location = evt.location,
      store = PDFViewerApplication.store;

  if (store && PDFViewerApplication.isInitialViewSet) {
    store.setMultiple({
      'page': location.pageNumber,
      'zoom': location.scale,
      'scrollLeft': location.left,
      'scrollTop': location.top,
      'rotation': location.rotation
    })["catch"](function () {});
  }

  var href = PDFViewerApplication.pdfLinkService.getAnchorUrl(location.pdfOpenParams);
  PDFViewerApplication.appConfig.toolbar.viewBookmark.href = href;
  PDFViewerApplication.appConfig.secondaryToolbar.viewBookmarkButton.href = href;
  var currentPage = PDFViewerApplication.pdfViewer.getPageView(PDFViewerApplication.page - 1);
  var loading = currentPage.renderingState !== _pdf_rendering_queue.RenderingStates.FINISHED;
  PDFViewerApplication.toolbar.updateLoadingIndicatorState(loading);
}

function webViewerScrollModeChanged(evt) {
  var store = PDFViewerApplication.store;

  if (store && PDFViewerApplication.isInitialViewSet) {
    store.set('scrollMode', evt.mode)["catch"](function () {});
  }
}

function webViewerSpreadModeChanged(evt) {
  var store = PDFViewerApplication.store;

  if (store && PDFViewerApplication.isInitialViewSet) {
    store.set('spreadMode', evt.mode)["catch"](function () {});
  }
}

function webViewerResize() {
  var pdfDocument = PDFViewerApplication.pdfDocument,
      pdfViewer = PDFViewerApplication.pdfViewer;

  if (!pdfDocument) {
    return;
  }

  var currentScaleValue = pdfViewer.currentScaleValue;

  if (currentScaleValue === 'auto' || currentScaleValue === 'page-fit' || currentScaleValue === 'page-width') {
    pdfViewer.currentScaleValue = currentScaleValue;
  }

  pdfViewer.update();
}

function webViewerHashchange(evt) {
  var hash = evt.hash;

  if (!hash) {
    return;
  }

  if (!PDFViewerApplication.isInitialViewSet) {
    PDFViewerApplication.initialBookmark = hash;
  } else if (!PDFViewerApplication.pdfHistory.popStateInProgress) {
    PDFViewerApplication.pdfLinkService.setHash(hash);
  }
}

var webViewerFileInputChange;
{
  webViewerFileInputChange = function webViewerFileInputChange(evt) {
    if (PDFViewerApplication.pdfViewer && PDFViewerApplication.pdfViewer.isInPresentationMode) {
      return;
    }

    var file = evt.fileInput.files[0];

    if (_pdf.URL.createObjectURL && !_app_options.AppOptions.get('disableCreateObjectURL')) {
      var url = _pdf.URL.createObjectURL(file);

      if (file.name) {
        url = {
          url: url,
          originalUrl: file.name
        };
      }

      PDFViewerApplication.open(url);
    } else {
      PDFViewerApplication.setTitleUsingUrl(file.name);
      var fileReader = new FileReader();

      fileReader.onload = function webViewerChangeFileReaderOnload(evt) {
        var buffer = evt.target.result;
        PDFViewerApplication.open(new Uint8Array(buffer));
      };

      fileReader.readAsArrayBuffer(file);
    }

    var appConfig = PDFViewerApplication.appConfig;
    appConfig.toolbar.viewBookmark.setAttribute('hidden', 'true');
    appConfig.secondaryToolbar.viewBookmarkButton.setAttribute('hidden', 'true');
    appConfig.toolbar.download.setAttribute('hidden', 'true');
    appConfig.secondaryToolbar.downloadButton.setAttribute('hidden', 'true');
  };
}

function webViewerPresentationMode() {
  PDFViewerApplication.requestPresentationMode();
}

function webViewerOpenFile() {
  var openFileInputName = PDFViewerApplication.appConfig.openFileInputName;
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

function webViewerZoomReset(evt) {
  PDFViewerApplication.zoomReset(evt && evt.ignoreDuplicate);
}

function webViewerPageNumberChanged(evt) {
  var pdfViewer = PDFViewerApplication.pdfViewer;

  if (evt.value !== '') {
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
  PDFViewerApplication.findController.executeCommand('find' + evt.type, {
    query: evt.query,
    phraseSearch: evt.phraseSearch,
    caseSensitive: evt.caseSensitive,
    entireWord: evt.entireWord,
    highlightAll: evt.highlightAll,
    findPrevious: evt.findPrevious
  });
}

function webViewerFindFromUrlHash(evt) {
  PDFViewerApplication.findController.executeCommand('find', {
    query: evt.query,
    phraseSearch: evt.phraseSearch,
    caseSensitive: false,
    entireWord: false,
    highlightAll: true,
    findPrevious: false
  });
}

function webViewerUpdateFindMatchesCount(_ref9) {
  var matchesCount = _ref9.matchesCount;

  if (PDFViewerApplication.supportsIntegratedFind) {
    PDFViewerApplication.externalServices.updateFindMatchesCount(matchesCount);
  } else {
    PDFViewerApplication.findBar.updateResultsCount(matchesCount);
  }
}

function webViewerUpdateFindControlState(_ref10) {
  var state = _ref10.state,
      previous = _ref10.previous,
      matchesCount = _ref10.matchesCount;

  if (PDFViewerApplication.supportsIntegratedFind) {
    PDFViewerApplication.externalServices.updateFindControlState({
      result: state,
      findPrevious: previous,
      matchesCount: matchesCount
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
  var page = evt.pageNumber;
  PDFViewerApplication.toolbar.setPageNumber(page, evt.pageLabel || null);
  PDFViewerApplication.secondaryToolbar.setPageNumber(page);

  if (PDFViewerApplication.pdfSidebar.isThumbnailViewVisible) {
    PDFViewerApplication.pdfThumbnailViewer.scrollThumbnailIntoView(page);
  }

  if (typeof Stats !== 'undefined' && Stats.enabled) {
    var pageView = PDFViewerApplication.pdfViewer.getPageView(page - 1);

    if (pageView && pageView.stats) {
      Stats.add(page, pageView.stats);
    }
  }
}

function webViewerVisibilityChange(evt) {
  if (document.visibilityState === 'visible') {
    setZoomDisabledTimeout();
  }
}

var zoomDisabledTimeout = null;

function setZoomDisabledTimeout() {
  if (zoomDisabledTimeout) {
    clearTimeout(zoomDisabledTimeout);
  }

  zoomDisabledTimeout = setTimeout(function () {
    zoomDisabledTimeout = null;
  }, WHEEL_ZOOM_DISABLED_TIMEOUT);
}

function webViewerWheel(evt) {
  var pdfViewer = PDFViewerApplication.pdfViewer;

  if (pdfViewer.isInPresentationMode) {
    return;
  }

  if (evt.ctrlKey || evt.metaKey) {
    var support = PDFViewerApplication.supportedMouseWheelZoomModifierKeys;

    if (evt.ctrlKey && !support.ctrlKey || evt.metaKey && !support.metaKey) {
      return;
    }

    evt.preventDefault();

    if (zoomDisabledTimeout || document.visibilityState === 'hidden') {
      return;
    }

    var previousScale = pdfViewer.currentScale;
    var delta = (0, _ui_utils.normalizeWheelEventDelta)(evt);
    var MOUSE_WHEEL_DELTA_PER_PAGE_SCALE = 3.0;
    var ticks = delta * MOUSE_WHEEL_DELTA_PER_PAGE_SCALE;

    if (ticks < 0) {
      PDFViewerApplication.zoomOut(-ticks);
    } else {
      PDFViewerApplication.zoomIn(ticks);
    }

    var currentScale = pdfViewer.currentScale;

    if (previousScale !== currentScale) {
      var scaleCorrectionFactor = currentScale / previousScale - 1;
      var rect = pdfViewer.container.getBoundingClientRect();
      var dx = evt.clientX - rect.left;
      var dy = evt.clientY - rect.top;
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

  var appConfig = PDFViewerApplication.appConfig;

  if (PDFViewerApplication.pdfViewer.containsElement(evt.target) || appConfig.toolbar.container.contains(evt.target) && evt.target !== appConfig.secondaryToolbar.toggleButton) {
    PDFViewerApplication.secondaryToolbar.close();
  }
}

function webViewerKeyDown(evt) {
  if (PDFViewerApplication.overlayManager.active) {
    return;
  }

  var handled = false,
      ensureViewerFocused = false;
  var cmd = (evt.ctrlKey ? 1 : 0) | (evt.altKey ? 2 : 0) | (evt.shiftKey ? 4 : 0) | (evt.metaKey ? 8 : 0);
  var pdfViewer = PDFViewerApplication.pdfViewer;
  var isViewerInPresentationMode = pdfViewer && pdfViewer.isInPresentationMode;

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
          var findState = PDFViewerApplication.findController.state;

          if (findState) {
            PDFViewerApplication.findController.executeCommand('findagain', {
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

  var curElement = document.activeElement || document.querySelector(':focus');
  var curElementTagName = curElement && curElement.tagName.toUpperCase();

  if (curElementTagName === 'INPUT' || curElementTagName === 'TEXTAREA' || curElementTagName === 'SELECT') {
    if (evt.keyCode !== 27) {
      return;
    }
  }

  if (cmd === 0) {
    var turnPage = 0,
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

    if (turnPage !== 0 && (!turnOnlyIfPageFit || pdfViewer.currentScaleValue === 'page-fit')) {
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
        if (!isViewerInPresentationMode && pdfViewer.currentScaleValue !== 'page-fit') {
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
    if (evt.keyCode >= 33 && evt.keyCode <= 40 || evt.keyCode === 32 && curElementTagName !== 'BUTTON') {
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
    case 'SinglePage':
    case 'OneColumn':
      return _ui_utils.SpreadMode.NONE;

    case 'TwoColumnLeft':
    case 'TwoPageLeft':
      return _ui_utils.SpreadMode.ODD;

    case 'TwoColumnRight':
    case 'TwoPageRight':
      return _ui_utils.SpreadMode.EVEN;
  }

  return _ui_utils.SpreadMode.NONE;
}

function apiPageModeToSidebarView(mode) {
  switch (mode) {
    case 'UseNone':
      return _pdf_sidebar.SidebarView.NONE;

    case 'UseThumbs':
      return _pdf_sidebar.SidebarView.THUMBS;

    case 'UseOutlines':
      return _pdf_sidebar.SidebarView.OUTLINE;

    case 'UseAttachments':
      return _pdf_sidebar.SidebarView.ATTACHMENTS;

    case 'UseOC':
  }

  return _pdf_sidebar.SidebarView.NONE;
}

var PDFPrintServiceFactory = {
  instance: {
    supportsPrinting: false,
    createPrintService: function createPrintService() {
      throw new Error('Not implemented: createPrintService');
    }
  }
};
exports.PDFPrintServiceFactory = PDFPrintServiceFactory;