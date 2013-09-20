/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
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
/* globals PDFJS, PDFBug, FirefoxCom, Stats, Cache, PDFFindBar, CustomStyle,
           PDFFindController, ProgressBar, TextLayerBuilder, DownloadManager,
           getFileName, getOutputScale, scrollIntoView, getPDFFileNameFromURL,
           PDFHistory, ThumbnailView, noContextMenuHandler, SecondaryToolbar */

'use strict';

var DEFAULT_URL = 'compressed.tracemonkey-pldi-09.pdf';
var DEFAULT_SCALE = 'auto';
var DEFAULT_SCALE_DELTA = 1.1;
var UNKNOWN_SCALE = 0;
var CACHE_SIZE = 20;
var CSS_UNITS = 96.0 / 72.0;
var SCROLLBAR_PADDING = 40;
var VERTICAL_PADDING = 5;
var MIN_SCALE = 0.25;
var MAX_SCALE = 4.0;
var SETTINGS_MEMORY = 20;
var SCALE_SELECT_CONTAINER_PADDING = 8;
var SCALE_SELECT_PADDING = 22;
var RenderingStates = {
  INITIAL: 0,
  RUNNING: 1,
  PAUSED: 2,
  FINISHED: 3
};
var FindStates = {
  FIND_FOUND: 0,
  FIND_NOTFOUND: 1,
  FIND_WRAPPED: 2,
  FIND_PENDING: 3
};

PDFJS.imageResourcesPath = './images/';
//#if (FIREFOX || MOZCENTRAL || B2G || GENERIC || CHROME)
//PDFJS.workerSrc = '../build/pdf.worker.js';
//#endif

var mozL10n = document.mozL10n || document.webL10n;

//#include ui_utils.js
//#if GENERIC || CHROME
//#include download_manager.js
//#endif

//#if FIREFOX || MOZCENTRAL
//#include firefoxcom.js
//#endif

// Settings Manager - This is a utility for saving settings
// First we see if localStorage is available
// If not, we use FUEL in FF
// Use asyncStorage for B2G
var Settings = (function SettingsClosure() {
//#if !(FIREFOX || MOZCENTRAL || B2G)
  var isLocalStorageEnabled = (function localStorageEnabledTest() {
    // Feature test as per http://diveintohtml5.info/storage.html
    // The additional localStorage call is to get around a FF quirk, see
    // bug #495747 in bugzilla
    try {
      return 'localStorage' in window && window['localStorage'] !== null &&
          localStorage;
    } catch (e) {
      return false;
    }
  })();
//#endif

  function Settings(fingerprint) {
    this.fingerprint = fingerprint;
    this.initializedPromise = new PDFJS.Promise();

    var resolvePromise = (function settingsResolvePromise(db) {
      this.initialize(db || '{}');
      this.initializedPromise.resolve();
    }).bind(this);

//#if B2G
//  asyncStorage.getItem('database', resolvePromise);
//#endif

//#if FIREFOX || MOZCENTRAL
//  resolvePromise(FirefoxCom.requestSync('getDatabase', null));
//#endif

//#if !(FIREFOX || MOZCENTRAL || B2G)
    if (isLocalStorageEnabled)
      resolvePromise(localStorage.getItem('database'));
//#endif
  }

  Settings.prototype = {
    initialize: function settingsInitialize(database) {
      database = JSON.parse(database);
      if (!('files' in database))
        database.files = [];
      if (database.files.length >= SETTINGS_MEMORY)
        database.files.shift();
      var index;
      for (var i = 0, length = database.files.length; i < length; i++) {
        var branch = database.files[i];
        if (branch.fingerprint == this.fingerprint) {
          index = i;
          break;
        }
      }
      if (typeof index != 'number')
        index = database.files.push({fingerprint: this.fingerprint}) - 1;
      this.file = database.files[index];
      this.database = database;
    },

    set: function settingsSet(name, val) {
      if (!this.initializedPromise.isResolved)
        return;

      var file = this.file;
      file[name] = val;
      var database = JSON.stringify(this.database);

//#if B2G
//    asyncStorage.setItem('database', database);
//#endif

//#if FIREFOX || MOZCENTRAL
//    FirefoxCom.requestSync('setDatabase', database);
//#endif

//#if !(FIREFOX || MOZCENTRAL || B2G)
      if (isLocalStorageEnabled)
        localStorage.setItem('database', database);
//#endif
    },

    get: function settingsGet(name, defaultValue) {
      if (!this.initializedPromise.isResolved)
        return defaultValue;

      return this.file[name] || defaultValue;
    }
  };

  return Settings;
})();

var cache = new Cache(CACHE_SIZE);
var currentPageNumber = 1;

//#include pdf_find_bar.js
//#include pdf_find_controller.js
//#include pdf_history.js
//#include secondary_toolbar.js

var PDFView = {
  pages: [],
  thumbnails: [],
  currentScale: UNKNOWN_SCALE,
  currentScaleValue: null,
  initialBookmark: document.location.hash.substring(1),
  container: null,
  thumbnailContainer: null,
  initialized: false,
  fellback: false,
  pdfDocument: null,
  sidebarOpen: false,
  pageViewScroll: null,
  thumbnailViewScroll: null,
  isPresentationMode: false,
  presentationModeArgs: null,
  pageRotation: 0,
  mouseScrollTimeStamp: 0,
  mouseScrollDelta: 0,
  lastScroll: 0,
  previousPageNumber: 1,
  isViewerEmbedded: (window.parent !== window),

  // called once when the document is loaded
  initialize: function pdfViewInitialize() {
    var self = this;
    var container = this.container = document.getElementById('viewerContainer');
    this.pageViewScroll = {};
    this.watchScroll(container, this.pageViewScroll, updateViewarea);

    var thumbnailContainer = this.thumbnailContainer =
                             document.getElementById('thumbnailView');
    this.thumbnailViewScroll = {};
    this.watchScroll(thumbnailContainer, this.thumbnailViewScroll,
                     this.renderHighestPriority.bind(this));

    SecondaryToolbar.initialize({
      toolbar: document.getElementById('secondaryToolbar'),
      toggleButton: document.getElementById('secondaryToolbarToggle'),
      presentationMode: document.getElementById('secondaryPresentationMode'),
      openFile: document.getElementById('secondaryOpenFile'),
      print: document.getElementById('secondaryPrint'),
      download: document.getElementById('secondaryDownload'),
      firstPage: document.getElementById('firstPage'),
      lastPage: document.getElementById('lastPage'),
      pageRotateCw: document.getElementById('pageRotateCw'),
      pageRotateCcw: document.getElementById('pageRotateCcw')
    });

    PDFFindBar.initialize({
      bar: document.getElementById('findbar'),
      toggleButton: document.getElementById('viewFind'),
      findField: document.getElementById('findInput'),
      highlightAllCheckbox: document.getElementById('findHighlightAll'),
      caseSensitiveCheckbox: document.getElementById('findMatchCase'),
      findMsg: document.getElementById('findMsg'),
      findStatusIcon: document.getElementById('findStatusIcon'),
      findPreviousButton: document.getElementById('findPrevious'),
      findNextButton: document.getElementById('findNext')
    });

    PDFFindController.initialize({
      pdfPageSource: this,
      integratedFind: this.supportsIntegratedFind
    });

    this.initialized = true;
    container.addEventListener('scroll', function() {
      self.lastScroll = Date.now();
    }, false);
  },

  getPage: function pdfViewGetPage(n) {
    return this.pdfDocument.getPage(n);
  },

  // Helper function to keep track whether a div was scrolled up or down and
  // then call a callback.
  watchScroll: function pdfViewWatchScroll(viewAreaElement, state, callback) {
    state.down = true;
    state.lastY = viewAreaElement.scrollTop;
    viewAreaElement.addEventListener('scroll', function webViewerScroll(evt) {
      var currentY = viewAreaElement.scrollTop;
      var lastY = state.lastY;
      if (currentY > lastY)
        state.down = true;
      else if (currentY < lastY)
        state.down = false;
      // else do nothing and use previous value
      state.lastY = currentY;
      callback();
    }, true);
  },

  setScale: function pdfViewSetScale(val, resetAutoSettings, noScroll) {
    if (val == this.currentScale)
      return;

    var pages = this.pages;
    for (var i = 0; i < pages.length; i++)
      pages[i].update(val * CSS_UNITS);

    if (!noScroll && this.currentScale != val)
      this.pages[this.page - 1].scrollIntoView();
    this.currentScale = val;

    var event = document.createEvent('UIEvents');
    event.initUIEvent('scalechange', false, false, window, 0);
    event.scale = val;
    event.resetAutoSettings = resetAutoSettings;
    window.dispatchEvent(event);
  },

  parseScale: function pdfViewParseScale(value, resetAutoSettings, noScroll) {
    if ('custom' == value)
      return;

    var scale = parseFloat(value);
    this.currentScaleValue = value;
    if (scale) {
      this.setScale(scale, true, noScroll);
      return;
    }

    var container = this.container;
    var currentPage = this.pages[this.page - 1];
    if (!currentPage) {
      return;
    }

    var pageWidthScale = (container.clientWidth - SCROLLBAR_PADDING) /
                          currentPage.width * currentPage.scale / CSS_UNITS;
    var pageHeightScale = (container.clientHeight - VERTICAL_PADDING) /
                           currentPage.height * currentPage.scale / CSS_UNITS;
    switch (value) {
      case 'page-actual':
        scale = 1;
        break;
      case 'page-width':
        scale = pageWidthScale;
        break;
      case 'page-height':
        scale = pageHeightScale;
        break;
      case 'page-fit':
        scale = Math.min(pageWidthScale, pageHeightScale);
        break;
      case 'auto':
        scale = Math.min(1.0, pageWidthScale);
        break;
    }
    this.setScale(scale, resetAutoSettings, noScroll);

    selectScaleOption(value);
  },

  zoomIn: function pdfViewZoomIn(ticks) {
    var newScale = this.currentScale;
    do {
      newScale = (newScale * DEFAULT_SCALE_DELTA).toFixed(2);
      newScale = Math.ceil(newScale * 10) / 10;
      newScale = Math.min(MAX_SCALE, newScale);
    } while (--ticks && newScale < MAX_SCALE);
    this.parseScale(newScale, true);
  },

  zoomOut: function pdfViewZoomOut(ticks) {
    var newScale = this.currentScale;
    do {
      newScale = (newScale / DEFAULT_SCALE_DELTA).toFixed(2);
      newScale = Math.floor(newScale * 10) / 10;
      newScale = Math.max(MIN_SCALE, newScale);
    } while (--ticks && newScale > MIN_SCALE);
    this.parseScale(newScale, true);
  },

  set page(val) {
    var pages = this.pages;
    var input = document.getElementById('pageNumber');
    var event = document.createEvent('UIEvents');
    event.initUIEvent('pagechange', false, false, window, 0);

    if (!(0 < val && val <= pages.length)) {
      this.previousPageNumber = val;
      event.pageNumber = this.page;
      window.dispatchEvent(event);
      return;
    }

    pages[val - 1].updateStats();
    this.previousPageNumber = currentPageNumber;
    currentPageNumber = val;
    event.pageNumber = val;
    window.dispatchEvent(event);

    // checking if the this.page was called from the updateViewarea function:
    // avoiding the creation of two "set page" method (internal and public)
    if (updateViewarea.inProgress)
      return;

    // Avoid scrolling the first page during loading
    if (this.loading && val == 1)
      return;

    pages[val - 1].scrollIntoView();
  },

  get page() {
    return currentPageNumber;
  },

  get supportsPrinting() {
    var canvas = document.createElement('canvas');
    var value = 'mozPrintCallback' in canvas;
    // shadow
    Object.defineProperty(this, 'supportsPrinting', { value: value,
                                                      enumerable: true,
                                                      configurable: true,
                                                      writable: false });
    return value;
  },

  get supportsFullscreen() {
    var doc = document.documentElement;
    var support = doc.requestFullscreen || doc.mozRequestFullScreen ||
                  doc.webkitRequestFullScreen || doc.msRequestFullscreen;

    if (document.fullscreenEnabled === false ||
        document.mozFullScreenEnabled === false ||
        document.webkitFullscreenEnabled === false ||
        document.msFullscreenEnabled === false) {
      support = false;
    } else if (this.isViewerEmbedded) {
      // Need to check if the viewer is embedded as well, to prevent issues with
      // presentation mode when the viewer is embedded in '<object>' tags.
      support = false;
    }

    Object.defineProperty(this, 'supportsFullscreen', { value: support,
                                                        enumerable: true,
                                                        configurable: true,
                                                        writable: false });
    return support;
  },

  get supportsIntegratedFind() {
    var support = false;
//#if !(FIREFOX || MOZCENTRAL)
//#else
//  support = FirefoxCom.requestSync('supportsIntegratedFind');
//#endif
    Object.defineProperty(this, 'supportsIntegratedFind', { value: support,
                                                            enumerable: true,
                                                            configurable: true,
                                                            writable: false });
    return support;
  },

  get supportsDocumentFonts() {
    var support = true;
//#if !(FIREFOX || MOZCENTRAL)
//#else
//  support = FirefoxCom.requestSync('supportsDocumentFonts');
//#endif
    Object.defineProperty(this, 'supportsDocumentFonts', { value: support,
                                                           enumerable: true,
                                                           configurable: true,
                                                           writable: false });
    return support;
  },

  get supportsDocumentColors() {
    var support = true;
//#if !(FIREFOX || MOZCENTRAL)
//#else
//  support = FirefoxCom.requestSync('supportsDocumentColors');
//#endif
    Object.defineProperty(this, 'supportsDocumentColors', { value: support,
                                                            enumerable: true,
                                                            configurable: true,
                                                            writable: false });
    return support;
  },

  get loadingBar() {
    var bar = new ProgressBar('#loadingBar', {});
    Object.defineProperty(this, 'loadingBar', { value: bar,
                                                enumerable: true,
                                                configurable: true,
                                                writable: false });
    return bar;
  },

  get isHorizontalScrollbarEnabled() {
    var div = document.getElementById('viewerContainer');
    return div.scrollWidth > div.clientWidth;
  },

  initPassiveLoading: function pdfViewInitPassiveLoading() {
    var pdfDataRangeTransport = {
      rangeListeners: [],
      progressListeners: [],

      addRangeListener: function PdfDataRangeTransport_addRangeListener(
                                   listener) {
        this.rangeListeners.push(listener);
      },

      addProgressListener: function PdfDataRangeTransport_addProgressListener(
                                      listener) {
        this.progressListeners.push(listener);
      },

      onDataRange: function PdfDataRangeTransport_onDataRange(begin, chunk) {
        var listeners = this.rangeListeners;
        for (var i = 0, n = listeners.length; i < n; ++i) {
          listeners[i](begin, chunk);
        }
      },

      onDataProgress: function PdfDataRangeTransport_onDataProgress(loaded) {
        var listeners = this.progressListeners;
        for (var i = 0, n = listeners.length; i < n; ++i) {
          listeners[i](loaded);
        }
      },

      requestDataRange: function PdfDataRangeTransport_requestDataRange(
                                  begin, end) {
        FirefoxCom.request('requestDataRange', { begin: begin, end: end });
      }
    };

    window.addEventListener('message', function windowMessage(e) {
      var args = e.data;

      if (typeof args !== 'object' || !('pdfjsLoadAction' in args))
        return;
      switch (args.pdfjsLoadAction) {
        case 'supportsRangedLoading':
          PDFView.open(args.pdfUrl, 0, undefined, pdfDataRangeTransport, {
            length: args.length
          });
          break;
        case 'range':
          pdfDataRangeTransport.onDataRange(args.begin, args.chunk);
          break;
        case 'rangeProgress':
          pdfDataRangeTransport.onDataProgress(args.loaded);
          break;
        case 'progress':
          PDFView.progress(args.loaded / args.total);
          break;
        case 'complete':
          if (!args.data) {
            PDFView.error(mozL10n.get('loading_error', null,
                          'An error occurred while loading the PDF.'), e);
            break;
          }
          PDFView.open(args.data, 0);
          break;
      }
    });
    FirefoxCom.requestSync('initPassiveLoading', null);
  },

  setTitleUsingUrl: function pdfViewSetTitleUsingUrl(url) {
    this.url = url;
    try {
      this.setTitle(decodeURIComponent(getFileName(url)) || url);
    } catch (e) {
      // decodeURIComponent may throw URIError,
      // fall back to using the unprocessed url in that case
      this.setTitle(url);
    }
  },

  setTitle: function pdfViewSetTitle(title) {
    document.title = title;
//#if B2G
//  document.getElementById('activityTitle').textContent = title;
//#endif
  },

  // TODO(mack): This function signature should really be pdfViewOpen(url, args)
  open: function pdfViewOpen(url, scale, password,
                             pdfDataRangeTransport, args) {
    var parameters = {password: password};
    if (typeof url === 'string') { // URL
      this.setTitleUsingUrl(url);
      parameters.url = url;
    } else if (url && 'byteLength' in url) { // ArrayBuffer
      parameters.data = url;
    }
    if (args) {
      for (var prop in args) {
        parameters[prop] = args[prop];
      }
    }

    this.pdfDocument = null;
    var self = this;
    self.loading = true;
    var passwordNeeded = function passwordNeeded(updatePassword, reason) {
      var promptString = mozL10n.get('request_password', null,
                                'PDF is protected by a password:');

      if (reason === PDFJS.PasswordResponses.INCORRECT_PASSWORD) {
        promptString += '\n' + mozL10n.get('invalid_password', null,
                                'Invalid Password.');
      }

      password = prompt(promptString);
      if (password && password.length > 0) {
        return updatePassword(password);
      }
    };

    function getDocumentProgress(progressData) {
      self.progress(progressData.loaded / progressData.total);
    }

    PDFJS.getDocument(parameters, pdfDataRangeTransport, passwordNeeded,
                      getDocumentProgress).then(
      function getDocumentCallback(pdfDocument) {
        self.load(pdfDocument, scale);
        self.loading = false;
      },
      function getDocumentError(message, exception) {
        var loadingErrorMessage = mozL10n.get('loading_error', null,
          'An error occurred while loading the PDF.');

        if (exception && exception.name === 'InvalidPDFException') {
          // change error message also for other builds
          var loadingErrorMessage = mozL10n.get('invalid_file_error', null,
                                        'Invalid or corrupted PDF file.');
//#if B2G
//        window.alert(loadingErrorMessage);
//        return window.close();
//#endif
        }

        if (exception && exception.name === 'MissingPDFException') {
          // special message for missing PDF's
          var loadingErrorMessage = mozL10n.get('missing_file_error', null,
                                        'Missing PDF file.');

//#if B2G
//        window.alert(loadingErrorMessage);
//        return window.close();
//#endif
        }

        var moreInfo = {
          message: message
        };
        self.error(loadingErrorMessage, moreInfo);
        self.loading = false;
      }
    );
  },

  download: function pdfViewDownload() {
    function noData() {
      downloadManager.downloadUrl(url, filename);
    }

    var url = this.url.split('#')[0];
    var filename = getPDFFileNameFromURL(url);
    var downloadManager = new DownloadManager();
    downloadManager.onerror = function (err) {
      // This error won't really be helpful because it's likely the
      // fallback won't work either (or is already open).
      PDFView.error('PDF failed to download.');
    };

    if (!this.pdfDocument) { // the PDF is not ready yet
      noData();
      return;
    }

    this.pdfDocument.getData().then(
      function getDataSuccess(data) {
        var blob = PDFJS.createBlob(data, 'application/pdf');
        downloadManager.download(blob, url, filename);
      },
      noData // Error occurred try downloading with just the url.
    ).then(null, noData);
  },

  fallback: function pdfViewFallback() {
//#if !(FIREFOX || MOZCENTRAL)
//  return;
//#else
//  // Only trigger the fallback once so we don't spam the user with messages
//  // for one PDF.
//  if (this.fellback)
//    return;
//  this.fellback = true;
//  var url = this.url.split('#')[0];
//  FirefoxCom.request('fallback', url, function response(download) {
//    if (!download)
//      return;
//    PDFView.download();
//  });
//#endif
  },

  navigateTo: function pdfViewNavigateTo(dest) {
    var destString = '';
    var self = this;

    var goToDestination = function(destRef) {
      self.pendingRefStr = null;
      // dest array looks like that: <page-ref> </XYZ|FitXXX> <args..>
      var pageNumber = destRef instanceof Object ?
        self.pagesRefMap[destRef.num + ' ' + destRef.gen + ' R'] :
        (destRef + 1);
      if (pageNumber) {
        if (pageNumber > self.pages.length) {
          pageNumber = self.pages.length;
        }
        var currentPage = self.pages[pageNumber - 1];
        currentPage.scrollIntoView(dest);

        // Update the browsing history.
        PDFHistory.push({ dest: dest, hash: destString, page: pageNumber });
      } else {
        self.pendingRefStrLoaded = new PDFJS.Promise();
        self.pendingRefStr = destRef.num + ' ' + destRef.gen + ' R';
        self.pendingRefStrLoaded.then(function() {
          goToDestination(destRef);
        });
      }
    };

    this.destinationsPromise.then(function() {
      if (typeof dest === 'string') {
        destString = dest;
        dest = self.destinations[dest];
      }
      if (!(dest instanceof Array)) {
        return; // invalid destination
      }
      goToDestination(dest[0]);
    });
  },

  getDestinationHash: function pdfViewGetDestinationHash(dest) {
    if (typeof dest === 'string')
      return PDFView.getAnchorUrl('#' + escape(dest));
    if (dest instanceof Array) {
      var destRef = dest[0]; // see navigateTo method for dest format
      var pageNumber = destRef instanceof Object ?
        this.pagesRefMap[destRef.num + ' ' + destRef.gen + ' R'] :
        (destRef + 1);
      if (pageNumber) {
        var pdfOpenParams = PDFView.getAnchorUrl('#page=' + pageNumber);
        var destKind = dest[1];
        if (typeof destKind === 'object' && 'name' in destKind &&
            destKind.name == 'XYZ') {
          var scale = (dest[4] || this.currentScaleValue);
          var scaleNumber = parseFloat(scale);
          if (scaleNumber) {
            scale = scaleNumber * 100;
          }
          pdfOpenParams += '&zoom=' + scale;
          if (dest[2] || dest[3]) {
            pdfOpenParams += ',' + (dest[2] || 0) + ',' + (dest[3] || 0);
          }
        }
        return pdfOpenParams;
      }
    }
    return '';
  },

  /**
   * For the firefox extension we prefix the full url on anchor links so they
   * don't come up as resource:// urls and so open in new tab/window works.
   * @param {String} anchor The anchor hash include the #.
   */
  getAnchorUrl: function getAnchorUrl(anchor) {
//#if !(FIREFOX || MOZCENTRAL)
    return anchor;
//#else
//  return this.url.split('#')[0] + anchor;
//#endif
  },


  /**
   * Show the error box.
   * @param {String} message A message that is human readable.
   * @param {Object} moreInfo (optional) Further information about the error
   *                            that is more technical.  Should have a 'message'
   *                            and optionally a 'stack' property.
   */
  error: function pdfViewError(message, moreInfo) {
    var moreInfoText = mozL10n.get('error_version_info',
      {version: PDFJS.version || '?', build: PDFJS.build || '?'},
      'PDF.js v{{version}} (build: {{build}})') + '\n';
    if (moreInfo) {
      moreInfoText +=
        mozL10n.get('error_message', {message: moreInfo.message},
        'Message: {{message}}');
      if (moreInfo.stack) {
        moreInfoText += '\n' +
          mozL10n.get('error_stack', {stack: moreInfo.stack},
          'Stack: {{stack}}');
      } else {
        if (moreInfo.filename) {
          moreInfoText += '\n' +
            mozL10n.get('error_file', {file: moreInfo.filename},
            'File: {{file}}');
        }
        if (moreInfo.lineNumber) {
          moreInfoText += '\n' +
            mozL10n.get('error_line', {line: moreInfo.lineNumber},
            'Line: {{line}}');
        }
      }
    }

//#if !(FIREFOX || MOZCENTRAL)
    var errorWrapper = document.getElementById('errorWrapper');
    errorWrapper.removeAttribute('hidden');

    var errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;

    var closeButton = document.getElementById('errorClose');
    closeButton.onclick = function() {
      errorWrapper.setAttribute('hidden', 'true');
    };

    var errorMoreInfo = document.getElementById('errorMoreInfo');
    var moreInfoButton = document.getElementById('errorShowMore');
    var lessInfoButton = document.getElementById('errorShowLess');
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
    errorMoreInfo.value = moreInfoText;
//#else
//  console.error(message + '\n' + moreInfoText);
//  this.fallback();
//#endif
  },

  progress: function pdfViewProgress(level) {
    var percent = Math.round(level * 100);
    // When we transition from full request to range requests, it's possible
    // that we discard some of the loaded data. This can cause the loading
    // bar to move backwards. So prevent this by only updating the bar if it
    // increases.
    if (percent > PDFView.loadingBar.percent) {
      PDFView.loadingBar.percent = percent;
    }
  },

  load: function pdfViewLoad(pdfDocument, scale) {
    function bindOnAfterDraw(pageView, thumbnailView) {
      // when page is painted, using the image as thumbnail base
      pageView.onAfterDraw = function pdfViewLoadOnAfterDraw() {
        thumbnailView.setImage(pageView.canvas);
      };
    }

    PDFFindController.reset();

    this.pdfDocument = pdfDocument;

    var errorWrapper = document.getElementById('errorWrapper');
    errorWrapper.setAttribute('hidden', 'true');

    pdfDocument.dataLoaded().then(function() {
      PDFView.loadingBar.hide();
      var outerContainer = document.getElementById('outerContainer');
      outerContainer.classList.remove('loadingInProgress');
    });

    var thumbsView = document.getElementById('thumbnailView');
    thumbsView.parentNode.scrollTop = 0;

    while (thumbsView.hasChildNodes())
      thumbsView.removeChild(thumbsView.lastChild);

    if ('_loadingInterval' in thumbsView)
      clearInterval(thumbsView._loadingInterval);

    var container = document.getElementById('viewer');
    while (container.hasChildNodes())
      container.removeChild(container.lastChild);

    var pagesCount = pdfDocument.numPages;

    var id = pdfDocument.fingerprint;
    document.getElementById('numPages').textContent =
      mozL10n.get('page_of', {pageCount: pagesCount}, 'of {{pageCount}}');
    document.getElementById('pageNumber').max = pagesCount;

    PDFView.documentFingerprint = id;
    var store = PDFView.store = new Settings(id);

    this.pageRotation = 0;

    var pages = this.pages = [];
    var pagesRefMap = this.pagesRefMap = {};
    var thumbnails = this.thumbnails = [];

    var pagesPromise = this.pagesPromise = new PDFJS.Promise();
    var self = this;

    var firstPagePromise = pdfDocument.getPage(1);

    // Fetch a single page so we can get a viewport that will be the default
    // viewport for all pages
    firstPagePromise.then(function(pdfPage) {
      var viewport = pdfPage.getViewport(scale || 1.0);
      var pagePromises = [];
      for (var pageNum = 1; pageNum <= pagesCount; ++pageNum) {
        var viewportClone = viewport.clone();
        var pageView = new PageView(container, pageNum, scale,
                                    self.navigateTo.bind(self),
                                    viewportClone);
        var thumbnailView = new ThumbnailView(thumbsView, pageNum,
                                              viewportClone);
        bindOnAfterDraw(pageView, thumbnailView);
        pages.push(pageView);
        thumbnails.push(thumbnailView);
      }

      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('documentload', true, true, {});
      window.dispatchEvent(event);

      PDFView.loadingBar.setWidth(container);

      for (var pageNum = 1; pageNum <= pagesCount; ++pageNum) {
        var pagePromise = pdfDocument.getPage(pageNum);
        pagePromise.then(function(pdfPage) {
          var pageNum = pdfPage.pageNumber;
          var pageView = pages[pageNum - 1];
          if (!pageView.pdfPage) {
            // The pdfPage might already be set if we've already entered
            // pageView.draw()
            pageView.setPdfPage(pdfPage);
          }
          var thumbnailView = thumbnails[pageNum - 1];
          if (!thumbnailView.pdfPage) {
            thumbnailView.setPdfPage(pdfPage);
          }

          var pageRef = pdfPage.ref;
          var refStr = pageRef.num + ' ' + pageRef.gen + ' R';
          pagesRefMap[refStr] = pdfPage.pageNumber;

          if (self.pendingRefStr && self.pendingRefStr === refStr) {
            self.pendingRefStrLoaded.resolve();
          }
        });
        pagePromises.push(pagePromise);
      }

      PDFFindController.firstPagePromise.resolve();

      PDFJS.Promise.all(pagePromises).then(function(pages) {
        pagesPromise.resolve(pages);
      });
    });

    var storePromise = store.initializedPromise;
    PDFJS.Promise.all([firstPagePromise, storePromise]).then(function() {
      var storedHash = null;
      if (store.get('exists', false)) {
        var pageNum = store.get('page', '1');
        var zoom = store.get('zoom', PDFView.currentScale);
        var left = store.get('scrollLeft', '0');
        var top = store.get('scrollTop', '0');

        storedHash = 'page=' + pageNum + '&zoom=' + zoom + ',' +
                     left + ',' + top;
      }
      // Initialize the browsing history.
      PDFHistory.initialize(self.documentFingerprint);

      self.setInitialView(storedHash, scale);

      // Make all navigation keys work on document load,
      // unless the viewer is embedded in a web page.
      if (!self.isViewerEmbedded) {
        self.container.focus();
//#if (FIREFOX || MOZCENTRAL)
//      self.container.blur();
//#endif
      }
    });

    pagesPromise.then(function() {
      if (PDFView.supportsPrinting) {
        pdfDocument.getJavaScript().then(function(javaScript) {
          if (javaScript.length) {
            console.warn('Warning: JavaScript is not supported');
            PDFView.fallback();
          }
          // Hack to support auto printing.
          var regex = /\bprint\s*\(/g;
          for (var i = 0, ii = javaScript.length; i < ii; i++) {
            var js = javaScript[i];
            if (js && regex.test(js)) {
              setTimeout(function() {
                window.print();
              });
              return;
            }
          }
        });
      }
    });

    var destinationsPromise =
      this.destinationsPromise = pdfDocument.getDestinations();
    destinationsPromise.then(function(destinations) {
      self.destinations = destinations;
    });

    // outline depends on destinations and pagesRefMap
    var promises = [pagesPromise, destinationsPromise,
                    PDFView.animationStartedPromise];
    PDFJS.Promise.all(promises).then(function() {
      pdfDocument.getOutline().then(function(outline) {
        self.outline = new DocumentOutlineView(outline);
        document.getElementById('viewOutline').disabled = !outline;
      });
    });

    pdfDocument.getMetadata().then(function(data) {
      var info = data.info, metadata = data.metadata;
      self.documentInfo = info;
      self.metadata = metadata;

      // Provides some basic debug information
      console.log('PDF ' + pdfDocument.fingerprint + ' [' +
                  info.PDFFormatVersion + ' ' + (info.Producer || '-') +
                  ' / ' + (info.Creator || '-') + ']' +
                  (PDFJS.version ? ' (PDF.js: ' + PDFJS.version + ')' : ''));

      var pdfTitle;
      if (metadata) {
        if (metadata.has('dc:title'))
          pdfTitle = metadata.get('dc:title');
      }

      if (!pdfTitle && info && info['Title'])
        pdfTitle = info['Title'];

      if (pdfTitle)
        self.setTitle(pdfTitle + ' - ' + document.title);

      if (info.IsAcroFormPresent) {
        console.warn('Warning: AcroForm/XFA is not supported');
        PDFView.fallback();
      }

//#if (FIREFOX || MOZCENTRAL)
//    var versionId = String(info.PDFFormatVersion).slice(-1) | 0;
//    var generatorId = 0;
//    var KNOWN_GENERATORS = ["acrobat distiller", "acrobat pdfwritter",
//     "adobe livecycle", "adobe pdf library", "adobe photoshop", "ghostscript",
//     "tcpdf", "cairo", "dvipdfm", "dvips", "pdftex", "pdfkit", "itext",
//     "prince", "quarkxpress", "mac os x", "microsoft", "openoffice", "oracle",
//     "luradocument", "pdf-xchange", "antenna house", "aspose.cells", "fpdf"];
//    var generatorId = 0;
//    if (info.Producer) {
//      KNOWN_GENERATORS.some(function (generator, s, i) {
//        if (generator.indexOf(s) < 0) {
//          return false;
//        }
//        generatorId = i + 1;
//        return true;
//      }.bind(null, info.Producer.toLowerCase()));
//    }
//    var formType = !info.IsAcroFormPresent ? null : info.IsXFAPresent ?
//                   'xfa' : 'acroform';
//    FirefoxCom.request('reportTelemetry', JSON.stringify({
//      type: 'documentInfo',
//      version: versionId,
//      generator: generatorId,
//      formType: formType
//    }));
//#endif
    });
  },

  setInitialView: function pdfViewSetInitialView(storedHash, scale) {
    // Reset the current scale, as otherwise the page's scale might not get
    // updated if the zoom level stayed the same.
    this.currentScale = 0;
    this.currentScaleValue = null;
    // When opening a new file (when one is already loaded in the viewer):
    // Reset 'currentPageNumber', since otherwise the page's scale will be wrong
    // if 'currentPageNumber' is larger than the number of pages in the file.
    document.getElementById('pageNumber').value = currentPageNumber = 1;

    if (PDFHistory.initialDestination) {
      this.navigateTo(PDFHistory.initialDestination);
      PDFHistory.initialDestination = null;
    } else if (this.initialBookmark) {
      this.setHash(this.initialBookmark);
      PDFHistory.push({ hash: this.initialBookmark }, !!this.initialBookmark);
      this.initialBookmark = null;
    } else if (storedHash) {
      this.setHash(storedHash);
    } else if (scale) {
      this.parseScale(scale, true);
      this.page = 1;
    }

    if (PDFView.currentScale === UNKNOWN_SCALE) {
      // Scale was not initialized: invalid bookmark or scale was not specified.
      // Setting the default one.
      this.parseScale(DEFAULT_SCALE, true);
    }
  },

  renderHighestPriority: function pdfViewRenderHighestPriority() {
    // Pages have a higher priority than thumbnails, so check them first.
    var visiblePages = this.getVisiblePages();
    var pageView = this.getHighestPriority(visiblePages, this.pages,
                                           this.pageViewScroll.down);
    if (pageView) {
      this.renderView(pageView, 'page');
      return;
    }
    // No pages needed rendering so check thumbnails.
    if (this.sidebarOpen) {
      var visibleThumbs = this.getVisibleThumbs();
      var thumbView = this.getHighestPriority(visibleThumbs,
                                              this.thumbnails,
                                              this.thumbnailViewScroll.down);
      if (thumbView)
        this.renderView(thumbView, 'thumbnail');
    }
  },

  getHighestPriority: function pdfViewGetHighestPriority(visible, views,
                                                         scrolledDown) {
    // The state has changed figure out which page has the highest priority to
    // render next (if any).
    // Priority:
    // 1 visible pages
    // 2 if last scrolled down page after the visible pages
    // 2 if last scrolled up page before the visible pages
    var visibleViews = visible.views;

    var numVisible = visibleViews.length;
    if (numVisible === 0) {
      return false;
    }
    for (var i = 0; i < numVisible; ++i) {
      var view = visibleViews[i].view;
      if (!this.isViewFinished(view))
        return view;
    }

    // All the visible views have rendered, try to render next/previous pages.
    if (scrolledDown) {
      var nextPageIndex = visible.last.id;
      // ID's start at 1 so no need to add 1.
      if (views[nextPageIndex] && !this.isViewFinished(views[nextPageIndex]))
        return views[nextPageIndex];
    } else {
      var previousPageIndex = visible.first.id - 2;
      if (views[previousPageIndex] &&
          !this.isViewFinished(views[previousPageIndex]))
        return views[previousPageIndex];
    }
    // Everything that needs to be rendered has been.
    return false;
  },

  isViewFinished: function pdfViewNeedsRendering(view) {
    return view.renderingState === RenderingStates.FINISHED;
  },

  // Render a page or thumbnail view. This calls the appropriate function based
  // on the views state. If the view is already rendered it will return false.
  renderView: function pdfViewRender(view, type) {
    var state = view.renderingState;
    switch (state) {
      case RenderingStates.FINISHED:
        return false;
      case RenderingStates.PAUSED:
        PDFView.highestPriorityPage = type + view.id;
        view.resume();
        break;
      case RenderingStates.RUNNING:
        PDFView.highestPriorityPage = type + view.id;
        break;
      case RenderingStates.INITIAL:
        PDFView.highestPriorityPage = type + view.id;
        view.draw(this.renderHighestPriority.bind(this));
        break;
    }
    return true;
  },

  setHash: function pdfViewSetHash(hash) {
    if (!hash)
      return;

    if (hash.indexOf('=') >= 0) {
      var params = PDFView.parseQueryString(hash);
      // borrowing syntax from "Parameters for Opening PDF Files"
      if ('nameddest' in params) {
        PDFHistory.updateNextHashParam(params.nameddest);
        PDFView.navigateTo(params.nameddest);
        return;
      }
      if ('page' in params) {
        var pageNumber = (params.page | 0) || 1;
        if ('zoom' in params) {
          var zoomArgs = params.zoom.split(','); // scale,left,top
          // building destination array

          // If the zoom value, it has to get divided by 100. If it is a string,
          // it should stay as it is.
          var zoomArg = zoomArgs[0];
          var zoomArgNumber = parseFloat(zoomArg);
          if (zoomArgNumber)
            zoomArg = zoomArgNumber / 100;

          var dest = [null, {name: 'XYZ'},
                      zoomArgs.length > 1 ? (zoomArgs[1] | 0) : null,
                      zoomArgs.length > 2 ? (zoomArgs[2] | 0) : null,
                      zoomArg];
          var currentPage = this.pages[pageNumber - 1];
          currentPage.scrollIntoView(dest);
        } else {
          this.page = pageNumber; // simple page
        }
      }
      if ('pagemode' in params) {
        var toggle = document.getElementById('sidebarToggle');
        if (params.pagemode === 'thumbs' || params.pagemode === 'bookmarks') {
          if (!this.sidebarOpen) {
            toggle.click();
          }
          this.switchSidebarView(params.pagemode === 'thumbs' ?
                                 'thumbs' : 'outline');
        } else if (params.pagemode === 'none' && this.sidebarOpen) {
          toggle.click();
        }
      }
    } else if (/^\d+$/.test(hash)) { // page number
      this.page = hash;
    } else { // named destination
      PDFHistory.updateNextHashParam(unescape(hash));
      PDFView.navigateTo(unescape(hash));
    }
  },

  switchSidebarView: function pdfViewSwitchSidebarView(view) {
    var thumbsView = document.getElementById('thumbnailView');
    var outlineView = document.getElementById('outlineView');

    var thumbsButton = document.getElementById('viewThumbnail');
    var outlineButton = document.getElementById('viewOutline');

    switch (view) {
      case 'thumbs':
        var wasOutlineViewVisible = thumbsView.classList.contains('hidden');

        thumbsButton.classList.add('toggled');
        outlineButton.classList.remove('toggled');
        thumbsView.classList.remove('hidden');
        outlineView.classList.add('hidden');

        PDFView.renderHighestPriority();

        if (wasOutlineViewVisible) {
          // Ensure that the thumbnail of the current page is visible
          // when switching from the outline view.
          scrollIntoView(document.getElementById('thumbnailContainer' +
                                                 this.page));
        }
        break;

      case 'outline':
        thumbsButton.classList.remove('toggled');
        outlineButton.classList.add('toggled');
        thumbsView.classList.add('hidden');
        outlineView.classList.remove('hidden');

        if (outlineButton.getAttribute('disabled'))
          return;
        break;
    }
  },

  getVisiblePages: function pdfViewGetVisiblePages() {
    return this.getVisibleElements(this.container, this.pages,
                                   !this.isPresentationMode);
  },

  getVisibleThumbs: function pdfViewGetVisibleThumbs() {
    return this.getVisibleElements(this.thumbnailContainer, this.thumbnails);
  },

  // Generic helper to find out what elements are visible within a scroll pane.
  getVisibleElements: function pdfViewGetVisibleElements(
      scrollEl, views, sortByVisibility) {
    var top = scrollEl.scrollTop, bottom = top + scrollEl.clientHeight;
    var left = scrollEl.scrollLeft, right = left + scrollEl.clientWidth;

    var visible = [], view;
    var currentHeight, viewHeight, hiddenHeight, percentHeight;
    var currentWidth, viewWidth;
    for (var i = 0, ii = views.length; i < ii; ++i) {
      view = views[i];
      currentHeight = view.el.offsetTop + view.el.clientTop;
      viewHeight = view.el.clientHeight;
      if ((currentHeight + viewHeight) < top) {
        continue;
      }
      if (currentHeight > bottom) {
        break;
      }
      currentWidth = view.el.offsetLeft + view.el.clientLeft;
      viewWidth = view.el.clientWidth;
      if ((currentWidth + viewWidth) < left || currentWidth > right) {
        continue;
      }
      hiddenHeight = Math.max(0, top - currentHeight) +
                     Math.max(0, currentHeight + viewHeight - bottom);
      percentHeight = ((viewHeight - hiddenHeight) * 100 / viewHeight) | 0;

      visible.push({ id: view.id, y: currentHeight,
                     view: view, percent: percentHeight });
    }

    var first = visible[0];
    var last = visible[visible.length - 1];

    if (sortByVisibility) {
      visible.sort(function(a, b) {
        var pc = a.percent - b.percent;
        if (Math.abs(pc) > 0.001) {
          return -pc;
        }
        return a.id - b.id; // ensure stability
      });
    }
    return {first: first, last: last, views: visible};
  },

  // Helper function to parse query string (e.g. ?param1=value&parm2=...).
  parseQueryString: function pdfViewParseQueryString(query) {
    var parts = query.split('&');
    var params = {};
    for (var i = 0, ii = parts.length; i < parts.length; ++i) {
      var param = parts[i].split('=');
      var key = param[0];
      var value = param.length > 1 ? param[1] : null;
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    }
    return params;
  },

  beforePrint: function pdfViewSetupBeforePrint() {
    if (!this.supportsPrinting) {
      var printMessage = mozL10n.get('printing_not_supported', null,
          'Warning: Printing is not fully supported by this browser.');
      this.error(printMessage);
      return;
    }

    var alertNotReady = false;
    if (!this.pages.length) {
      alertNotReady = true;
    } else {
      for (var i = 0, ii = this.pages.length; i < ii; ++i) {
        if (!this.pages[i].pdfPage) {
          alertNotReady = true;
          break;
        }
      }
    }
    if (alertNotReady) {
      var notReadyMessage = mozL10n.get('printing_not_ready', null,
          'Warning: The PDF is not fully loaded for printing.');
      window.alert(notReadyMessage);
      return;
    }

    var body = document.querySelector('body');
    body.setAttribute('data-mozPrintCallback', true);
    for (var i = 0, ii = this.pages.length; i < ii; ++i) {
      this.pages[i].beforePrint();
    }
  },

  afterPrint: function pdfViewSetupAfterPrint() {
    var div = document.getElementById('printContainer');
    while (div.hasChildNodes())
      div.removeChild(div.lastChild);
  },

  presentationMode: function pdfViewPresentationMode() {
    if (!this.supportsFullscreen) {
      return false;
    }
    var isPresentationMode = document.fullscreenElement ||
                             document.mozFullScreen ||
                             document.webkitIsFullScreen ||
                             document.msFullscreenElement;

    if (isPresentationMode) {
      return false;
    }

    var wrapper = document.getElementById('viewerContainer');
    if (document.documentElement.requestFullscreen) {
      wrapper.requestFullscreen();
    } else if (document.documentElement.mozRequestFullScreen) {
      wrapper.mozRequestFullScreen();
    } else if (document.documentElement.webkitRequestFullScreen) {
      wrapper.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT);
    } else if (document.documentElement.msRequestFullscreen) {
      wrapper.msRequestFullscreen();
    } else {
      return false;
    }

    this.presentationModeArgs = {
      page: this.page,
      previousScale: this.currentScaleValue
    };

    return true;
  },

  enterPresentationMode: function pdfViewEnterPresentationMode() {
    this.isPresentationMode = true;
    this.page = this.presentationModeArgs.page;
    this.parseScale('page-fit', true);
    this.showPresentationControls();

    var viewer = document.getElementById('viewer');
    viewer.setAttribute('contextmenu', 'viewerContextMenu');
  },

  exitPresentationMode: function pdfViewExitPresentationMode() {
    this.isPresentationMode = false;
    this.parseScale(this.presentationModeArgs.previousScale);
    this.page = this.page;
    this.clearMouseScrollState();
    this.hidePresentationControls();
    this.presentationModeArgs = null;

    var viewer = document.getElementById('viewer');
    viewer.removeAttribute('contextmenu');

    // Ensure that the thumbnail of the current page is visible
    // when exiting presentation mode.
    scrollIntoView(document.getElementById('thumbnailContainer' + this.page));
  },

  showPresentationControls: function pdfViewShowPresentationControls() {
    var DELAY_BEFORE_HIDING_CONTROLS = 3000;
    var wrapper = document.getElementById('viewerContainer');
    if (this.presentationControlsTimeout) {
      clearTimeout(this.presentationControlsTimeout);
    } else {
      wrapper.classList.add('presentationControls');
    }
    this.presentationControlsTimeout = setTimeout(function hideControls() {
      wrapper.classList.remove('presentationControls');
      delete PDFView.presentationControlsTimeout;
    }, DELAY_BEFORE_HIDING_CONTROLS);
  },

  hidePresentationControls: function pdfViewShowPresentationControls() {
    if (!this.presentationControlsTimeout) {
      return;
    }
    clearTimeout(this.presentationControlsTimeout);
    delete this.presentationControlsTimeout;

    var wrapper = document.getElementById('viewerContainer');
    wrapper.classList.remove('presentationControls');
  },

  rotatePages: function pdfViewPageRotation(delta) {

    this.pageRotation = (this.pageRotation + 360 + delta) % 360;

    for (var i = 0, l = this.pages.length; i < l; i++) {
      var page = this.pages[i];
      page.update(page.scale, this.pageRotation);
    }

    for (var i = 0, l = this.thumbnails.length; i < l; i++) {
      var thumb = this.thumbnails[i];
      thumb.update(this.pageRotation);
    }

    this.parseScale(this.currentScaleValue, true);

    this.renderHighestPriority();

    var currentPage = this.pages[this.page - 1];
    if (!currentPage) {
      return;
    }

    // Wait for presentation mode to take effect
    setTimeout(function() {
      currentPage.scrollIntoView();
    }, 0);
  },

  /**
   * This function flips the page in presentation mode if the user scrolls up
   * or down with large enough motion and prevents page flipping too often.
   *
   * @this {PDFView}
   * @param {number} mouseScrollDelta The delta value from the mouse event.
   */
  mouseScroll: function pdfViewMouseScroll(mouseScrollDelta) {
    var MOUSE_SCROLL_COOLDOWN_TIME = 50;

    var currentTime = (new Date()).getTime();
    var storedTime = this.mouseScrollTimeStamp;

    // In case one page has already been flipped there is a cooldown time
    // which has to expire before next page can be scrolled on to.
    if (currentTime > storedTime &&
        currentTime - storedTime < MOUSE_SCROLL_COOLDOWN_TIME)
      return;

    // In case the user decides to scroll to the opposite direction than before
    // clear the accumulated delta.
    if ((this.mouseScrollDelta > 0 && mouseScrollDelta < 0) ||
        (this.mouseScrollDelta < 0 && mouseScrollDelta > 0))
      this.clearMouseScrollState();

    this.mouseScrollDelta += mouseScrollDelta;

    var PAGE_FLIP_THRESHOLD = 120;
    if (Math.abs(this.mouseScrollDelta) >= PAGE_FLIP_THRESHOLD) {

      var PageFlipDirection = {
        UP: -1,
        DOWN: 1
      };

      // In presentation mode scroll one page at a time.
      var pageFlipDirection = (this.mouseScrollDelta > 0) ?
                                PageFlipDirection.UP :
                                PageFlipDirection.DOWN;
      this.clearMouseScrollState();
      var currentPage = this.page;

      // In case we are already on the first or the last page there is no need
      // to do anything.
      if ((currentPage == 1 && pageFlipDirection == PageFlipDirection.UP) ||
          (currentPage == this.pages.length &&
           pageFlipDirection == PageFlipDirection.DOWN))
        return;

      this.page += pageFlipDirection;
      this.mouseScrollTimeStamp = currentTime;
    }
  },

  /**
   * This function clears the member attributes used with mouse scrolling in
   * presentation mode.
   *
   * @this {PDFView}
   */
  clearMouseScrollState: function pdfViewClearMouseScrollState() {
    this.mouseScrollTimeStamp = 0;
    this.mouseScrollDelta = 0;
  }
};

var PageView = function pageView(container, id, scale,
                                 navigateTo, defaultViewport) {
  this.id = id;

  this.rotation = 0;
  this.scale = scale || 1.0;
  this.viewport = defaultViewport;
  this.pdfPageRotate = defaultViewport.rotate;

  this.renderingState = RenderingStates.INITIAL;
  this.resume = null;

  this.textContent = null;
  this.textLayer = null;

  this.annotationLayer = null;

  var anchor = document.createElement('a');
  anchor.name = '' + this.id;

  var div = this.el = document.createElement('div');
  div.id = 'pageContainer' + this.id;
  div.className = 'page';
  div.style.width = Math.floor(this.viewport.width) + 'px';
  div.style.height = Math.floor(this.viewport.height) + 'px';

  container.appendChild(anchor);
  container.appendChild(div);

  this.setPdfPage = function pageViewSetPdfPage(pdfPage) {
    this.pdfPage = pdfPage;
    this.pdfPageRotate = pdfPage.rotate;
    this.viewport = pdfPage.getViewport(this.scale);
    this.stats = pdfPage.stats;
    this.update();
  };

  this.destroy = function pageViewDestroy() {
    this.update();
    if (this.pdfPage) {
      this.pdfPage.destroy();
    }
  };

  this.update = function pageViewUpdate(scale, rotation) {
    if (this.renderTask) {
      this.renderTask.cancel();
    }
    this.resume = null;
    this.renderingState = RenderingStates.INITIAL;

    if (typeof rotation !== 'undefined') {
      this.rotation = rotation;
    }

    this.scale = scale || this.scale;

    var totalRotation = (this.rotation + this.pdfPageRotate) % 360;
    this.viewport = this.viewport.clone({
      scale: this.scale,
      rotation: totalRotation
    });

    div.style.width = Math.floor(this.viewport.width) + 'px';
    div.style.height = Math.floor(this.viewport.height) + 'px';

    while (div.hasChildNodes())
      div.removeChild(div.lastChild);
    div.removeAttribute('data-loaded');

    this.annotationLayer = null;

    delete this.canvas;

    this.loadingIconDiv = document.createElement('div');
    this.loadingIconDiv.className = 'loadingIcon';
    div.appendChild(this.loadingIconDiv);
  };

  Object.defineProperty(this, 'width', {
    get: function PageView_getWidth() {
      return this.viewport.width;
    },
    enumerable: true
  });

  Object.defineProperty(this, 'height', {
    get: function PageView_getHeight() {
      return this.viewport.height;
    },
    enumerable: true
  });

  var self = this;

  function setupAnnotations(pageDiv, pdfPage, viewport) {

    function bindLink(link, dest) {
      link.href = PDFView.getDestinationHash(dest);
      link.onclick = function pageViewSetupLinksOnclick() {
        if (dest)
          PDFView.navigateTo(dest);
        return false;
      };
      link.className = 'internalLink';
    }

    function bindNamedAction(link, action) {
      link.href = PDFView.getAnchorUrl('');
      link.onclick = function pageViewSetupNamedActionOnClick() {
        // See PDF reference, table 8.45 - Named action
        switch (action) {
          case 'GoToPage':
            document.getElementById('pageNumber').focus();
            break;

          case 'GoBack':
            PDFHistory.back();
            break;

          case 'GoForward':
            PDFHistory.forward();
            break;

          case 'Find':
            if (!PDFView.supportsIntegratedFind) {
              PDFFindBar.toggle();
            }
            break;

          case 'NextPage':
            PDFView.page++;
            break;

          case 'PrevPage':
            PDFView.page--;
            break;

          case 'LastPage':
            PDFView.page = PDFView.pages.length;
            break;

          case 'FirstPage':
            PDFView.page = 1;
            break;

          default:
            break; // No action according to spec
        }
        return false;
      };
      link.className = 'internalLink';
    }

    pdfPage.getAnnotations().then(function(annotationsData) {
      if (self.annotationLayer) {
        // If an annotationLayer already exists, delete it to avoid creating
        // duplicate annotations when rapidly re-zooming the document.
        pageDiv.removeChild(self.annotationLayer);
        self.annotationLayer = null;
      }
      viewport = viewport.clone({ dontFlip: true });
      for (var i = 0; i < annotationsData.length; i++) {
        var data = annotationsData[i];
        var annotation = PDFJS.Annotation.fromData(data);
        if (!annotation || !annotation.hasHtml()) {
          continue;
        }

        var element = annotation.getHtmlElement(pdfPage.commonObjs);
        mozL10n.translate(element);

        data = annotation.getData();
        var rect = data.rect;
        var view = pdfPage.view;
        rect = PDFJS.Util.normalizeRect([
          rect[0],
          view[3] - rect[1] + view[1],
          rect[2],
          view[3] - rect[3] + view[1]
        ]);
        element.style.left = rect[0] + 'px';
        element.style.top = rect[1] + 'px';
        element.style.position = 'absolute';

        var transform = viewport.transform;
        var transformStr = 'matrix(' + transform.join(',') + ')';
        CustomStyle.setProp('transform', element, transformStr);
        var transformOriginStr = -rect[0] + 'px ' + -rect[1] + 'px';
        CustomStyle.setProp('transformOrigin', element, transformOriginStr);

        if (data.subtype === 'Link' && !data.url) {
          if (data.action) {
            bindNamedAction(element, data.action);
          } else {
            bindLink(element, ('dest' in data) ? data.dest : null);
          }
        }

        if (!self.annotationLayer) {
          var annotationLayerDiv = document.createElement('div');
          annotationLayerDiv.className = 'annotationLayer';
          pageDiv.appendChild(annotationLayerDiv);
          self.annotationLayer = annotationLayerDiv;
        }
        self.annotationLayer.appendChild(element);
      }
    });
  }

  this.getPagePoint = function pageViewGetPagePoint(x, y) {
    return this.viewport.convertToPdfPoint(x, y);
  };

  this.scrollIntoView = function pageViewScrollIntoView(dest) {
      if (PDFView.isPresentationMode) { // Avoid breaking presentation mode.
        dest = null;
      }
      if (!dest) {
        scrollIntoView(div);
        return;
      }

      var x = 0, y = 0;
      var width = 0, height = 0, widthScale, heightScale;
      var scale = 0;
      switch (dest[1].name) {
        case 'XYZ':
          x = dest[2];
          y = dest[3];
          scale = dest[4];
          // If x and/or y coordinates are not supplied, default to
          // _top_ left of the page (not the obvious bottom left,
          // since aligning the bottom of the intended page with the
          // top of the window is rarely helpful).
          x = x !== null ? x : 0;
          y = y !== null ? y : this.height / this.scale;
          break;
        case 'Fit':
        case 'FitB':
          scale = 'page-fit';
          break;
        case 'FitH':
        case 'FitBH':
          y = dest[2];
          scale = 'page-width';
          break;
        case 'FitV':
        case 'FitBV':
          x = dest[2];
          scale = 'page-height';
          break;
        case 'FitR':
          x = dest[2];
          y = dest[3];
          width = dest[4] - x;
          height = dest[5] - y;
          widthScale = (PDFView.container.clientWidth - SCROLLBAR_PADDING) /
            width / CSS_UNITS;
          heightScale = (PDFView.container.clientHeight - SCROLLBAR_PADDING) /
            height / CSS_UNITS;
          scale = Math.min(widthScale, heightScale);
          break;
        default:
          return;
      }

      if (scale && scale !== PDFView.currentScale) {
        PDFView.parseScale(scale, true, true);
      } else if (PDFView.currentScale === UNKNOWN_SCALE) {
        PDFView.parseScale(DEFAULT_SCALE, true, true);
      }

      if (scale === 'page-fit' && !dest[4]) {
        scrollIntoView(div);
        return;
      }

      var boundingRect = [
        this.viewport.convertToViewportPoint(x, y),
        this.viewport.convertToViewportPoint(x + width, y + height)
      ];
      setTimeout(function pageViewScrollIntoViewRelayout() {
        // letting page to re-layout before scrolling
        var scale = PDFView.currentScale;
        var x = Math.min(boundingRect[0][0], boundingRect[1][0]);
        var y = Math.min(boundingRect[0][1], boundingRect[1][1]);
        var width = Math.abs(boundingRect[0][0] - boundingRect[1][0]);
        var height = Math.abs(boundingRect[0][1] - boundingRect[1][1]);

        scrollIntoView(div, {left: x, top: y, width: width, height: height});
      }, 0);
  };

  this.getTextContent = function pageviewGetTextContent() {
    if (!this.textContent) {
      this.textContent = this.pdfPage.getTextContent();
    }
    return this.textContent;
  };

  this.draw = function pageviewDraw(callback) {
    var pdfPage = this.pdfPage;

    if (!pdfPage) {
      var promise = PDFView.getPage(this.id);
      promise.then(function(pdfPage) {
        this.setPdfPage(pdfPage);
        this.draw(callback);
      }.bind(this));
      return;
    }

    if (this.renderingState !== RenderingStates.INITIAL) {
      console.error('Must be in new state before drawing');
    }

    this.renderingState = RenderingStates.RUNNING;

    var viewport = this.viewport;
    // Wrap the canvas so if it has a css transform for highdpi the overflow
    // will be hidden in FF.
    var canvasWrapper = document.createElement('div');
    canvasWrapper.style.width = div.style.width;
    canvasWrapper.style.height = div.style.height;
    canvasWrapper.classList.add('canvasWrapper');

    var canvas = document.createElement('canvas');
    canvas.id = 'page' + this.id;
    canvasWrapper.appendChild(canvas);
    div.appendChild(canvasWrapper);
    this.canvas = canvas;

    var scale = this.scale;
    var outputScale = getOutputScale();
    canvas.width = Math.floor(viewport.width) * outputScale.sx;
    canvas.height = Math.floor(viewport.height) * outputScale.sy;

    var textLayerDiv = null;
    if (!PDFJS.disableTextLayer) {
      textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      textLayerDiv.style.width = canvas.width + 'px';
      textLayerDiv.style.height = canvas.height + 'px';
      div.appendChild(textLayerDiv);
    }
    var textLayer = this.textLayer =
      textLayerDiv ? new TextLayerBuilder({
        textLayerDiv: textLayerDiv,
        pageIndex: this.id - 1,
        lastScrollSource: PDFView,
        viewport: this.viewport,
        isViewerInPresentationMode: PDFView.isPresentationMode
      }) : null;

    if (outputScale.scaled) {
      var cssScale = 'scale(' + (1 / outputScale.sx) + ', ' +
                                (1 / outputScale.sy) + ')';
      CustomStyle.setProp('transform' , canvas, cssScale);
      CustomStyle.setProp('transformOrigin' , canvas, '0% 0%');
      if (textLayerDiv) {
        CustomStyle.setProp('transform' , textLayerDiv, cssScale);
        CustomStyle.setProp('transformOrigin' , textLayerDiv, '0% 0%');
      }
    }

    var ctx = canvas.getContext('2d');
    // TODO(mack): use data attributes to store these
    ctx._scaleX = outputScale.sx;
    ctx._scaleY = outputScale.sy;
    if (outputScale.scaled) {
      ctx.scale(outputScale.sx, outputScale.sy);
    }
//#if (FIREFOX || MOZCENTRAL)
//  // Checking if document fonts are used only once
//  var checkIfDocumentFontsUsed = !PDFView.pdfDocument.embeddedFontsUsed;
//#endif

    // Rendering area

    var self = this;
    function pageViewDrawCallback(error) {
      // The renderTask may have been replaced by a new one, so only remove the
      // reference to the renderTask if it matches the one that is triggering
      // this callback.
      if (renderTask === self.renderTask) {
        self.renderTask = null;
      }

      if (error === 'cancelled') {
        return;
      }

      self.renderingState = RenderingStates.FINISHED;

      if (self.loadingIconDiv) {
        div.removeChild(self.loadingIconDiv);
        delete self.loadingIconDiv;
      }

//#if (FIREFOX || MOZCENTRAL)
//    if (checkIfDocumentFontsUsed && PDFView.pdfDocument.embeddedFontsUsed &&
//        PDFJS.disableFontFace) {
//      console.error(mozL10n.get('web_fonts_disabled', null,
//        'Web fonts are disabled: unable to use embedded PDF fonts.'));
//      PDFView.fallback();
//    }
//    if (self.textLayer && self.textLayer.textDivs &&
//        self.textLayer.textDivs.length > 0 &&
//        !PDFView.supportsDocumentColors) {
//      console.error(mozL10n.get('document_colors_disabled', null,
//        'PDF documents are not allowed to use their own colors: ' +
//        '\'Allow pages to choose their own colors\' ' +
//        'is deactivated in the browser.'));
//      PDFView.fallback();
//    }
//#endif
      if (error) {
        PDFView.error(mozL10n.get('rendering_error', null,
          'An error occurred while rendering the page.'), error);
      }

      self.stats = pdfPage.stats;
      self.updateStats();
      if (self.onAfterDraw)
        self.onAfterDraw();

      cache.push(self);

      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('pagerender', true, true, {
        pageNumber: pdfPage.pageNumber
      });
      div.dispatchEvent(event);

//#if (FIREFOX || MOZCENTRAL)
//    FirefoxCom.request('reportTelemetry', JSON.stringify({
//      type: 'pageInfo'
//    }));
//    // TODO add stream types report here
//#endif
      callback();
    }

    var renderContext = {
      canvasContext: ctx,
      viewport: this.viewport,
      textLayer: textLayer,
      continueCallback: function pdfViewcContinueCallback(cont) {
        if (PDFView.highestPriorityPage !== 'page' + self.id) {
          self.renderingState = RenderingStates.PAUSED;
          self.resume = function resumeCallback() {
            self.renderingState = RenderingStates.RUNNING;
            cont();
          };
          return;
        }
        cont();
      }
    };
    var renderTask = this.renderTask = this.pdfPage.render(renderContext);

    this.renderTask.then(
      function pdfPageRenderCallback() {
        pageViewDrawCallback(null);
      },
      function pdfPageRenderError(error) {
        pageViewDrawCallback(error);
      }
    );

    if (textLayer) {
      this.getTextContent().then(
        function textContentResolved(textContent) {
          textLayer.setTextContent(textContent);
        }
      );
    }

    setupAnnotations(div, pdfPage, this.viewport);
    div.setAttribute('data-loaded', true);
  };

  this.beforePrint = function pageViewBeforePrint() {
    var pdfPage = this.pdfPage;

    var viewport = pdfPage.getViewport(1);
    // Use the same hack we use for high dpi displays for printing to get better
    // output until bug 811002 is fixed in FF.
    var PRINT_OUTPUT_SCALE = 2;
    var canvas = this.canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width) * PRINT_OUTPUT_SCALE;
    canvas.height = Math.floor(viewport.height) * PRINT_OUTPUT_SCALE;
    canvas.style.width = (PRINT_OUTPUT_SCALE * viewport.width) + 'pt';
    canvas.style.height = (PRINT_OUTPUT_SCALE * viewport.height) + 'pt';
    var cssScale = 'scale(' + (1 / PRINT_OUTPUT_SCALE) + ', ' +
                              (1 / PRINT_OUTPUT_SCALE) + ')';
    CustomStyle.setProp('transform' , canvas, cssScale);
    CustomStyle.setProp('transformOrigin' , canvas, '0% 0%');

    var printContainer = document.getElementById('printContainer');
    printContainer.appendChild(canvas);

    var self = this;
    canvas.mozPrintCallback = function(obj) {
      var ctx = obj.context;

      ctx.save();
      ctx.fillStyle = 'rgb(255, 255, 255)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.scale(PRINT_OUTPUT_SCALE, PRINT_OUTPUT_SCALE);

      var renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      pdfPage.render(renderContext).then(function() {
        // Tell the printEngine that rendering this canvas/page has finished.
        obj.done();
        self.pdfPage.destroy();
      }, function(error) {
        console.error(error);
        // Tell the printEngine that rendering this canvas/page has failed.
        // This will make the print proces stop.
        if ('abort' in obj)
          obj.abort();
        else
          obj.done();
        self.pdfPage.destroy();
      });
    };
  };

  this.updateStats = function pageViewUpdateStats() {
    if (!this.stats) {
      return;
    }

    if (PDFJS.pdfBug && Stats.enabled) {
      var stats = this.stats;
      Stats.add(this.id, stats);
    }
  };
};

//#include thumbnail_view.js
//#include text_layer_builder.js

var DocumentOutlineView = function documentOutlineView(outline) {
  var outlineView = document.getElementById('outlineView');
  var outlineButton = document.getElementById('viewOutline');
  while (outlineView.firstChild)
    outlineView.removeChild(outlineView.firstChild);

  if (!outline) {
    if (!outlineView.classList.contains('hidden'))
      PDFView.switchSidebarView('thumbs');

    return;
  }

  function bindItemLink(domObj, item) {
    domObj.href = PDFView.getDestinationHash(item.dest);
    domObj.onclick = function documentOutlineViewOnclick(e) {
      PDFView.navigateTo(item.dest);
      return false;
    };
  }


  var queue = [{parent: outlineView, items: outline}];
  while (queue.length > 0) {
    var levelData = queue.shift();
    var i, n = levelData.items.length;
    for (i = 0; i < n; i++) {
      var item = levelData.items[i];
      var div = document.createElement('div');
      div.className = 'outlineItem';
      var a = document.createElement('a');
      bindItemLink(a, item);
      a.textContent = item.title;
      div.appendChild(a);

      if (item.items.length > 0) {
        var itemsDiv = document.createElement('div');
        itemsDiv.className = 'outlineItems';
        div.appendChild(itemsDiv);
        queue.push({parent: itemsDiv, items: item.items});
      }

      levelData.parent.appendChild(div);
    }
  }
};

document.addEventListener('DOMContentLoaded', function webViewerLoad(evt) {
  PDFView.initialize();

//#if !(FIREFOX || MOZCENTRAL)
  var params = PDFView.parseQueryString(document.location.search.substring(1));
  var file = params.file || DEFAULT_URL;
//#else
//var file = window.location.href.split('#')[0];
//#endif

//#if CHROME
//if (location.protocol !== 'chrome-extension:') {
//  file = location.href.split('#')[0];
//}
//#endif

//#if !(FIREFOX || MOZCENTRAL || CHROME)
  var fileInput = document.createElement('input');
  fileInput.id = 'fileInput';
  fileInput.className = 'fileInput';
  fileInput.setAttribute('type', 'file');
  fileInput.setAttribute('style',
    'visibility: hidden; position: fixed; right: 0; top: 0');
  fileInput.oncontextmenu = noContextMenuHandler;
  document.body.appendChild(fileInput);

  if (!window.File || !window.FileReader || !window.FileList || !window.Blob) {
    document.getElementById('openFile').setAttribute('hidden', 'true');
    document.getElementById('secondaryOpenFile').setAttribute('hidden', 'true');
  } else {
    document.getElementById('fileInput').value = null;
  }
//#else
//document.getElementById('openFile').setAttribute('hidden', 'true');
//document.getElementById('secondaryOpenFile').setAttribute('hidden', 'true');
//#endif

  // Special debugging flags in the hash section of the URL.
  var hash = document.location.hash.substring(1);
  var hashParams = PDFView.parseQueryString(hash);

  if ('disableWorker' in hashParams) {
    PDFJS.disableWorker = (hashParams['disableWorker'] === 'true');
  }

  if ('disableRange' in hashParams) {
    PDFJS.disableRange = (hashParams['disableRange'] === 'true');
  }

  if ('disableAutoFetch' in hashParams) {
    PDFJS.disableAutoFetch = (hashParams['disableAutoFetch'] === 'true');
  }

  if ('disableFontFace' in hashParams) {
    PDFJS.disableFontFace = (hashParams['disableFontFace'] === 'true');
  }

  if ('disableHistory' in hashParams) {
    PDFJS.disableHistory = (hashParams['disableHistory'] === 'true');
  }

//#if !(FIREFOX || MOZCENTRAL)
  var locale = navigator.language;
  if ('locale' in hashParams)
    locale = hashParams['locale'];
  mozL10n.setLanguage(locale);
//#endif
//#if (FIREFOX || MOZCENTRAL)
//if (!PDFView.supportsDocumentFonts) {
//  PDFJS.disableFontFace = true;
//}
//#endif

  if ('textLayer' in hashParams) {
    switch (hashParams['textLayer']) {
      case 'off':
        PDFJS.disableTextLayer = true;
        break;
      case 'visible':
      case 'shadow':
      case 'hover':
        var viewer = document.getElementById('viewer');
        viewer.classList.add('textLayer-' + hashParams['textLayer']);
        break;
    }
  }

//#if !(FIREFOX || MOZCENTRAL)
  if ('pdfBug' in hashParams) {
//#else
//if ('pdfBug' in hashParams && FirefoxCom.requestSync('pdfBugEnabled')) {
//#endif
    PDFJS.pdfBug = true;
    var pdfBug = hashParams['pdfBug'];
    var enabled = pdfBug.split(',');
    PDFBug.enable(enabled);
    PDFBug.init();
  }

  if (!PDFView.supportsPrinting) {
    document.getElementById('print').classList.add('hidden');
    document.getElementById('secondaryPrint').classList.add('hidden');
  }

  if (!PDFView.supportsFullscreen) {
    document.getElementById('presentationMode').classList.add('hidden');
    document.getElementById('secondaryPresentationMode').
      classList.add('hidden');
  }

  if (PDFView.supportsIntegratedFind) {
    document.getElementById('viewFind').classList.add('hidden');
  }

  // Listen for warnings to trigger the fallback UI.  Errors should be caught
  // and call PDFView.error() so we don't need to listen for those.
  PDFJS.LogManager.addLogger({
    warn: function() {
      PDFView.fallback();
    }
  });

  // Suppress context menus for some controls
  document.getElementById('scaleSelect').oncontextmenu = noContextMenuHandler;

  var mainContainer = document.getElementById('mainContainer');
  var outerContainer = document.getElementById('outerContainer');
  mainContainer.addEventListener('transitionend', function(e) {
    if (e.target == mainContainer) {
      var event = document.createEvent('UIEvents');
      event.initUIEvent('resize', false, false, window, 0);
      window.dispatchEvent(event);
      outerContainer.classList.remove('sidebarMoving');
    }
  }, true);

  document.getElementById('sidebarToggle').addEventListener('click',
    function() {
      this.classList.toggle('toggled');
      outerContainer.classList.add('sidebarMoving');
      outerContainer.classList.toggle('sidebarOpen');
      PDFView.sidebarOpen = outerContainer.classList.contains('sidebarOpen');
      PDFView.renderHighestPriority();
    });

  document.getElementById('viewThumbnail').addEventListener('click',
    function() {
      PDFView.switchSidebarView('thumbs');
    });

  document.getElementById('viewOutline').addEventListener('click',
    function() {
      PDFView.switchSidebarView('outline');
    });

  document.getElementById('previous').addEventListener('click',
    function() {
      PDFView.page--;
    });

  document.getElementById('next').addEventListener('click',
    function() {
      PDFView.page++;
    });

  document.getElementById('zoomIn').addEventListener('click',
    function() {
      PDFView.zoomIn();
    });

  document.getElementById('zoomOut').addEventListener('click',
    function() {
      PDFView.zoomOut();
    });

  document.getElementById('pageNumber').addEventListener('click',
    function() {
      this.select();
    });

  document.getElementById('pageNumber').addEventListener('change',
    function() {
      // Handle the user inputting a floating point number.
      PDFView.page = (this.value | 0);

      if (this.value !== (this.value | 0).toString()) {
        this.value = PDFView.page;
      }
    });

  document.getElementById('scaleSelect').addEventListener('change',
    function() {
      PDFView.parseScale(this.value);
    });

  document.getElementById('presentationMode').addEventListener('click',
    SecondaryToolbar.presentationModeClick.bind(SecondaryToolbar));

  document.getElementById('openFile').addEventListener('click',
    SecondaryToolbar.openFileClick.bind(SecondaryToolbar));

  document.getElementById('print').addEventListener('click',
    SecondaryToolbar.printClick.bind(SecondaryToolbar));

  document.getElementById('download').addEventListener('click',
    SecondaryToolbar.downloadClick.bind(SecondaryToolbar));

  document.getElementById('contextFirstPage').addEventListener('click',
    SecondaryToolbar.firstPageClick.bind(SecondaryToolbar));

  document.getElementById('contextLastPage').addEventListener('click',
    SecondaryToolbar.lastPageClick.bind(SecondaryToolbar));

  document.getElementById('contextPageRotateCw').addEventListener('click',
    SecondaryToolbar.pageRotateCwClick.bind(SecondaryToolbar));

  document.getElementById('contextPageRotateCcw').addEventListener('click',
    SecondaryToolbar.pageRotateCcwClick.bind(SecondaryToolbar));

//#if (FIREFOX || MOZCENTRAL)
//PDFView.setTitleUsingUrl(file);
//PDFView.initPassiveLoading();
//return;
//#endif

//#if !B2G
  PDFView.open(file, 0);
//#endif
}, true);

function updateViewarea() {

  if (!PDFView.initialized)
    return;
  var visible = PDFView.getVisiblePages();
  var visiblePages = visible.views;
  if (visiblePages.length === 0) {
    return;
  }

  PDFView.renderHighestPriority();

  var currentId = PDFView.page;
  var firstPage = visible.first;

  for (var i = 0, ii = visiblePages.length, stillFullyVisible = false;
       i < ii; ++i) {
    var page = visiblePages[i];

    if (page.percent < 100)
      break;

    if (page.id === PDFView.page) {
      stillFullyVisible = true;
      break;
    }
  }

  if (!stillFullyVisible) {
    currentId = visiblePages[0].id;
  }

  updateViewarea.inProgress = true; // used in "set page"
  PDFView.page = currentId;
  updateViewarea.inProgress = false;

  var currentScale = PDFView.currentScale;
  var currentScaleValue = PDFView.currentScaleValue;
  var normalizedScaleValue = currentScaleValue == currentScale ?
    currentScale * 100 : currentScaleValue;

  var pageNumber = firstPage.id;
  var pdfOpenParams = '#page=' + pageNumber;
  pdfOpenParams += '&zoom=' + normalizedScaleValue;
  var currentPage = PDFView.pages[pageNumber - 1];
  var topLeft = currentPage.getPagePoint(PDFView.container.scrollLeft,
    (PDFView.container.scrollTop - firstPage.y));
  pdfOpenParams += ',' + Math.round(topLeft[0]) + ',' + Math.round(topLeft[1]);

  var store = PDFView.store;
  store.initializedPromise.then(function() {
    store.set('exists', true);
    store.set('page', pageNumber);
    store.set('zoom', normalizedScaleValue);
    store.set('scrollLeft', Math.round(topLeft[0]));
    store.set('scrollTop', Math.round(topLeft[1]));
  });
  var href = PDFView.getAnchorUrl(pdfOpenParams);
  document.getElementById('viewBookmark').href = href;

  // Update the current bookmark in the browsing history.
  PDFHistory.updateCurrentBookmark(pdfOpenParams, pageNumber);
}

window.addEventListener('resize', function webViewerResize(evt) {
  if (PDFView.initialized &&
      (document.getElementById('pageWidthOption').selected ||
       document.getElementById('pageFitOption').selected ||
       document.getElementById('pageAutoOption').selected)) {
    PDFView.parseScale(document.getElementById('scaleSelect').value);
  }
  updateViewarea();

  // Set the 'max-height' CSS property of the secondary toolbar.
  SecondaryToolbar.setMaxHeight(PDFView.container);
});

window.addEventListener('hashchange', function webViewerHashchange(evt) {
  if (PDFHistory.isHashChangeUnlocked) {
    PDFView.setHash(document.location.hash.substring(1));
  }
});

window.addEventListener('change', function webViewerChange(evt) {
  var files = evt.target.files;
  if (!files || files.length === 0)
    return;

  // Read the local file into a Uint8Array.
  var fileReader = new FileReader();
  fileReader.onload = function webViewerChangeFileReaderOnload(evt) {
    var buffer = evt.target.result;
    var uint8Array = new Uint8Array(buffer);
    PDFView.open(uint8Array, 0);
  };

  var file = files[0];
  fileReader.readAsArrayBuffer(file);
  PDFView.setTitleUsingUrl(file.name);

  // URL does not reflect proper document location - hiding some icons.
  document.getElementById('viewBookmark').setAttribute('hidden', 'true');
  document.getElementById('download').setAttribute('hidden', 'true');
  document.getElementById('secondaryDownload').setAttribute('hidden', 'true');
}, true);

function selectScaleOption(value) {
  var options = document.getElementById('scaleSelect').options;
  var predefinedValueFound = false;
  for (var i = 0; i < options.length; i++) {
    var option = options[i];
    if (option.value != value) {
      option.selected = false;
      continue;
    }
    option.selected = true;
    predefinedValueFound = true;
  }
  return predefinedValueFound;
}

window.addEventListener('localized', function localized(evt) {
  document.getElementsByTagName('html')[0].dir = mozL10n.getDirection();

  PDFView.animationStartedPromise.then(function() {
    // Adjust the width of the zoom box to fit the content.
    // Note: This is only done if the zoom box is actually visible,
    // since otherwise element.clientWidth will return 0.
    var container = document.getElementById('scaleSelectContainer');
    if (container.clientWidth > 0) {
      var select = document.getElementById('scaleSelect');
      select.setAttribute('style', 'min-width: inherit;');
      var width = select.clientWidth + SCALE_SELECT_CONTAINER_PADDING;
      select.setAttribute('style', 'min-width: ' +
                                   (width + SCALE_SELECT_PADDING) + 'px;');
      container.setAttribute('style', 'min-width: ' + width + 'px; ' +
                                      'max-width: ' + width + 'px;');
    }

    // Set the 'max-height' CSS property of the secondary toolbar.
    SecondaryToolbar.setMaxHeight(PDFView.container);
  });
}, true);

window.addEventListener('scalechange', function scalechange(evt) {
  document.getElementById('zoomOut').disabled = (evt.scale === MIN_SCALE);
  document.getElementById('zoomIn').disabled = (evt.scale === MAX_SCALE);

  var customScaleOption = document.getElementById('customScaleOption');
  customScaleOption.selected = false;

  if (!evt.resetAutoSettings &&
      (document.getElementById('pageWidthOption').selected ||
       document.getElementById('pageFitOption').selected ||
       document.getElementById('pageAutoOption').selected)) {
    updateViewarea();
    return;
  }

  var predefinedValueFound = selectScaleOption('' + evt.scale);
  if (!predefinedValueFound) {
    customScaleOption.textContent = Math.round(evt.scale * 10000) / 100 + '%';
    customScaleOption.selected = true;
  }
  updateViewarea();
}, true);

window.addEventListener('pagechange', function pagechange(evt) {
  var page = evt.pageNumber;
  if (PDFView.previousPageNumber !== page) {
    document.getElementById('pageNumber').value = page;
    var selected = document.querySelector('.thumbnail.selected');
    if (selected)
      selected.classList.remove('selected');
    var thumbnail = document.getElementById('thumbnailContainer' + page);
    thumbnail.classList.add('selected');
    var visibleThumbs = PDFView.getVisibleThumbs();
    var numVisibleThumbs = visibleThumbs.views.length;
    // If the thumbnail isn't currently visible scroll it into view.
    if (numVisibleThumbs > 0) {
      var first = visibleThumbs.first.id;
      // Account for only one thumbnail being visible.
      var last = numVisibleThumbs > 1 ?
                  visibleThumbs.last.id : first;
      if (page <= first || page >= last)
        scrollIntoView(thumbnail);
    }

  }
  document.getElementById('previous').disabled = (page <= 1);
  document.getElementById('next').disabled = (page >= PDFView.pages.length);
}, true);

// Firefox specific event, so that we can prevent browser from zooming
window.addEventListener('DOMMouseScroll', function(evt) {
  if (evt.ctrlKey) {
    evt.preventDefault();

    var ticks = evt.detail;
    var direction = (ticks > 0) ? 'zoomOut' : 'zoomIn';
    PDFView[direction](Math.abs(ticks));
  } else if (PDFView.isPresentationMode) {
    var FIREFOX_DELTA_FACTOR = -40;
    PDFView.mouseScroll(evt.detail * FIREFOX_DELTA_FACTOR);
  }
}, false);

window.addEventListener('mousemove', function mousemove(evt) {
  if (PDFView.isPresentationMode) {
    PDFView.showPresentationControls();
  }
}, false);

window.addEventListener('mousedown', function mousedown(evt) {
  if (PDFView.isPresentationMode && evt.button === 0) {
    // Enable clicking of links in presentation mode.
    // Note: Only links that point to the currently loaded PDF document works.
    var targetHref = evt.target.href;
    var internalLink = targetHref && (targetHref.replace(/#.*$/, '') ===
                                      window.location.href.replace(/#.*$/, ''));
    if (!internalLink) {
      // Unless an internal link was clicked, advance a page in presentation
      // mode.
      evt.preventDefault();
      PDFView.page++;
    }
  }
}, false);

window.addEventListener('click', function click(evt) {
  if (!PDFView.isPresentationMode) {
    if (SecondaryToolbar.isOpen && PDFView.container.contains(evt.target)) {
      SecondaryToolbar.close();
    }
  } else if (evt.button === 0) {
    // Necessary since preventDefault() in 'mousedown' won't stop
    // the event propagation in all circumstances in presentation mode.
    evt.preventDefault();
  }
}, false);

window.addEventListener('keydown', function keydown(evt) {
  var handled = false;
  var cmd = (evt.ctrlKey ? 1 : 0) |
            (evt.altKey ? 2 : 0) |
            (evt.shiftKey ? 4 : 0) |
            (evt.metaKey ? 8 : 0);

  // First, handle the key bindings that are independent whether an input
  // control is selected or not.
  if (cmd === 1 || cmd === 8 || cmd === 5 || cmd === 12) {
    // either CTRL or META key with optional SHIFT.
    switch (evt.keyCode) {
      case 70: // f
        if (!PDFView.supportsIntegratedFind) {
          PDFFindBar.toggle();
          handled = true;
        }
        break;
      case 71: // g
        if (!PDFView.supportsIntegratedFind) {
          PDFFindBar.dispatchEvent('again', cmd === 5 || cmd === 12);
          handled = true;
        }
        break;
      case 61: // FF/Mac '='
      case 107: // FF '+' and '='
      case 187: // Chrome '+'
      case 171: // FF with German keyboard
        PDFView.zoomIn();
        handled = true;
        break;
      case 173: // FF/Mac '-'
      case 109: // FF '-'
      case 189: // Chrome '-'
        PDFView.zoomOut();
        handled = true;
        break;
      case 48: // '0'
      case 96: // '0' on Numpad of Swedish keyboard
        // keeping it unhandled (to restore page zoom to 100%)
        setTimeout(function () {
          // ... and resetting the scale after browser adjusts its scale
          PDFView.parseScale(DEFAULT_SCALE, true);
        });
        handled = false;
        break;
    }
  }

  // CTRL+ALT or Option+Command
  if (cmd === 3 || cmd === 10) {
    switch (evt.keyCode) {
      case 80: // p
        PDFView.presentationMode();
        SecondaryToolbar.close();
        handled = true;
        break;
    }
  }

  if (handled) {
    evt.preventDefault();
    return;
  }

  // Some shortcuts should not get handled if a control/input element
  // is selected.
  var curElement = document.activeElement || document.querySelector(':focus');
  if (curElement && (curElement.tagName.toUpperCase() === 'INPUT' ||
                     curElement.tagName.toUpperCase() === 'TEXTAREA' ||
                     curElement.tagName.toUpperCase() === 'SELECT')) {
    // Make sure that the secondary toolbar is closed when Escape is pressed.
    if (evt.keyCode !== 27) { // 'Esc'
      return;
    }
  }
  var controlsElement = document.getElementById('toolbar');
  while (curElement) {
    if (curElement === controlsElement && !PDFView.isPresentationMode)
      return; // ignoring if the 'toolbar' element is focused
    curElement = curElement.parentNode;
  }

  if (cmd === 0) { // no control key pressed at all.
    switch (evt.keyCode) {
      case 38: // up arrow
      case 33: // pg up
      case 8: // backspace
        if (!PDFView.isPresentationMode &&
            PDFView.currentScaleValue !== 'page-fit') {
          break;
        }
        /* in presentation mode */
        /* falls through */
      case 37: // left arrow
        // horizontal scrolling using arrow keys
        if (PDFView.isHorizontalScrollbarEnabled) {
          break;
        }
        /* falls through */
      case 75: // 'k'
      case 80: // 'p'
        PDFView.page--;
        handled = true;
        break;
      case 27: // esc key
        if (SecondaryToolbar.isOpen) {
          SecondaryToolbar.close();
          handled = true;
        }
        if (!PDFView.supportsIntegratedFind && PDFFindBar.opened) {
          PDFFindBar.close();
          handled = true;
        }
        break;
      case 40: // down arrow
      case 34: // pg down
      case 32: // spacebar
        if (!PDFView.isPresentationMode &&
            PDFView.currentScaleValue !== 'page-fit') {
          break;
        }
        /* falls through */
      case 39: // right arrow
        // horizontal scrolling using arrow keys
        if (PDFView.isHorizontalScrollbarEnabled) {
          break;
        }
        /* falls through */
      case 74: // 'j'
      case 78: // 'n'
        PDFView.page++;
        handled = true;
        break;

      case 36: // home
        if (PDFView.isPresentationMode) {
          PDFView.page = 1;
          handled = true;
        }
        break;
      case 35: // end
        if (PDFView.isPresentationMode) {
          PDFView.page = PDFView.pdfDocument.numPages;
          handled = true;
        }
        break;

      case 82: // 'r'
        PDFView.rotatePages(90);
        break;
    }
  }

  if (cmd === 4) { // shift-key
    switch (evt.keyCode) {
      case 32: // spacebar
        if (!PDFView.isPresentationMode &&
            PDFView.currentScaleValue !== 'page-fit') {
          break;
        }
        PDFView.page--;
        handled = true;
        break;

      case 82: // 'r'
        PDFView.rotatePages(-90);
        break;
    }
  }

  if (cmd === 2) { // alt-key
    switch (evt.keyCode) {
      case 37: // left arrow
        if (PDFView.isPresentationMode) {
          PDFHistory.back();
          handled = true;
        }
        break;
      case 39: // right arrow
        if (PDFView.isPresentationMode) {
          PDFHistory.forward();
          handled = true;
        }
        break;
    }
  }

  if (handled) {
    evt.preventDefault();
    PDFView.clearMouseScrollState();
  }
});

window.addEventListener('beforeprint', function beforePrint(evt) {
  PDFView.beforePrint();
});

window.addEventListener('afterprint', function afterPrint(evt) {
  PDFView.afterPrint();
});

(function presentationModeClosure() {
  function presentationModeChange(e) {
    var isPresentationMode = document.fullscreenElement ||
                             document.mozFullScreen ||
                             document.webkitIsFullScreen ||
                             document.msFullscreenElement;

    if (isPresentationMode) {
      PDFView.enterPresentationMode();
    } else {
      PDFView.exitPresentationMode();
    }
  }

  window.addEventListener('fullscreenchange', presentationModeChange, false);
  window.addEventListener('mozfullscreenchange', presentationModeChange, false);
  window.addEventListener('webkitfullscreenchange', presentationModeChange,
                          false);
  window.addEventListener('MSFullscreenChange', presentationModeChange, false);
})();

(function animationStartedClosure() {
  // The offsetParent is not set until the pdf.js iframe or object is visible.
  // Waiting for first animation.
  var requestAnimationFrame = window.requestAnimationFrame ||
                              window.mozRequestAnimationFrame ||
                              window.webkitRequestAnimationFrame ||
                              window.oRequestAnimationFrame ||
                              window.msRequestAnimationFrame ||
                              function startAtOnce(callback) { callback(); };
  PDFView.animationStartedPromise = new PDFJS.Promise();
  requestAnimationFrame(function onAnimationFrame() {
    PDFView.animationStartedPromise.resolve();
  });
})();

//#if B2G
//window.navigator.mozSetMessageHandler('activity', function(activity) {
//  var url = activity.source.data.url;
//  PDFJS.maxImageSize = 1024 * 1024;
//  PDFView.open(url);
//  var cancelButton = document.getElementById('activityClose');
//  cancelButton.addEventListener('click', function() {
//    activity.postResult('close');
//  });
//});
//#endif
