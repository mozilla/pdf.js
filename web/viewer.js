/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var kDefaultURL = 'compressed.tracemonkey-pldi-09.pdf';
var kDefaultScale = 'auto';
var kDefaultScaleDelta = 1.1;
var kUnknownScale = 0;
var kCacheSize = 20;
var kCssUnits = 96.0 / 72.0;
var kScrollbarPadding = 40;
var kMinScale = 0.25;
var kMaxScale = 4.0;
var kImageDirectory = './images/';
var kSettingsMemory = 20;
var RenderingStates = {
  INITIAL: 0,
  RUNNING: 1,
  PAUSED: 2,
  FINISHED: 3
};


var mozL10n = document.mozL10n || document.webL10n;

function getFileName(url) {
  var anchor = url.indexOf('#');
  var query = url.indexOf('?');
  var end = Math.min(
    anchor > 0 ? anchor : url.length,
    query > 0 ? query : url.length);
  return url.substring(url.lastIndexOf('/', end) + 1, end);
}

var Cache = function cacheCache(size) {
  var data = [];
  this.push = function cachePush(view) {
    var i = data.indexOf(view);
    if (i >= 0)
      data.splice(i);
    data.push(view);
    if (data.length > size)
      data.shift().destroy();
  };
};

var ProgressBar = (function ProgressBarClosure() {

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }

  function ProgressBar(id, opts) {

    // Fetch the sub-elements for later
    this.div = document.querySelector(id + ' .progress');

    // Get options, with sensible defaults
    this.height = opts.height || 100;
    this.width = opts.width || 100;
    this.units = opts.units || '%';
    this.percent = opts.percent || 0;

    // Initialize heights
    this.div.style.height = this.height + this.units;
  }

  ProgressBar.prototype = {

    updateBar: function ProgressBar_updateBar() {
      var progressSize = this.width * this._percent / 100;

      if (this._percent > 95)
        this.div.classList.add('full');

      this.div.style.width = progressSize + this.units;
    },

    get percent() {
      return this._percent;
    },

    set percent(val) {
      this._percent = clamp(val, 0, 100);
      this.updateBar();
    }
  };

  return ProgressBar;
})();

var FirefoxCom = (function FirefoxComClosure() {
  return {
    /**
     * Creates an event that the extension is listening for and will
     * synchronously respond to.
     * NOTE: It is reccomended to use request() instead since one day we may not
     * be able to synchronously reply.
     * @param {String} action The action to trigger.
     * @param {String} data Optional data to send.
     * @return {*} The response.
     */
    requestSync: function(action, data) {
      var request = document.createTextNode('');
      request.setUserData('action', action, null);
      request.setUserData('data', data, null);
      request.setUserData('sync', true, null);
      document.documentElement.appendChild(request);

      var sender = document.createEvent('Events');
      sender.initEvent('pdf.js.message', true, false);
      request.dispatchEvent(sender);
      var response = request.getUserData('response');
      document.documentElement.removeChild(request);
      return response;
    },
    /**
     * Creates an event that the extension is listening for and will
     * asynchronously respond by calling the callback.
     * @param {String} action The action to trigger.
     * @param {String} data Optional data to send.
     * @param {Function} callback Optional response callback that will be called
     * with one data argument.
     */
    request: function(action, data, callback) {
      var request = document.createTextNode('');
      request.setUserData('action', action, null);
      request.setUserData('data', data, null);
      request.setUserData('sync', false, null);
      if (callback) {
        request.setUserData('callback', callback, null);

        document.addEventListener('pdf.js.response', function listener(event) {
          var node = event.target,
              callback = node.getUserData('callback'),
              response = node.getUserData('response');

          document.documentElement.removeChild(node);

          document.removeEventListener('pdf.js.response', listener, false);
          return callback(response);
        }, false);
      }
      document.documentElement.appendChild(request);

      var sender = document.createEvent('HTMLEvents');
      sender.initEvent('pdf.js.message', true, false);
      return request.dispatchEvent(sender);
    }
  };
})();

// Settings Manager - This is a utility for saving settings
// First we see if localStorage is available
// If not, we use FUEL in FF
var Settings = (function SettingsClosure() {
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

  var isFirefoxExtension = PDFJS.isFirefoxExtension;

  function Settings(fingerprint) {
    var database = null;
    var index;
    if (isFirefoxExtension)
      database = FirefoxCom.requestSync('getDatabase', null) || '{}';
    else if (isLocalStorageEnabled)
      database = localStorage.getItem('database') || '{}';
    else
      return false;

    database = JSON.parse(database);
    if (!('files' in database))
      database.files = [];
    if (database.files.length >= kSettingsMemory)
      database.files.shift();
    for (var i = 0, length = database.files.length; i < length; i++) {
      var branch = database.files[i];
      if (branch.fingerprint == fingerprint) {
        index = i;
        break;
      }
    }
    if (typeof index != 'number')
      index = database.files.push({fingerprint: fingerprint}) - 1;
    this.file = database.files[index];
    this.database = database;
  }

  Settings.prototype = {
    set: function settingsSet(name, val) {
      if (!('file' in this))
        return false;

      var file = this.file;
      file[name] = val;
      var database = JSON.stringify(this.database);
      if (isFirefoxExtension)
        FirefoxCom.requestSync('setDatabase', database);
      else if (isLocalStorageEnabled)
        localStorage.setItem('database', database);
    },

    get: function settingsGet(name, defaultValue) {
      if (!('file' in this))
        return defaultValue;

      return this.file[name] || defaultValue;
    }
  };

  return Settings;
})();

var cache = new Cache(kCacheSize);
var currentPageNumber = 1;

var PDFView = {
  pages: [],
  thumbnails: [],
  currentScale: kUnknownScale,
  currentScaleValue: null,
  initialBookmark: document.location.hash.substring(1),
  startedTextExtraction: false,
  pageText: [],
  container: null,
  thumbnailContainer: null,
  initialized: false,
  fellback: false,
  pdfDocument: null,
  sidebarOpen: false,
  pageViewScroll: null,
  thumbnailViewScroll: null,

  // called once when the document is loaded
  initialize: function pdfViewInitialize() {
    var container = this.container = document.getElementById('viewerContainer');
    this.pageViewScroll = {};
    this.watchScroll(container, this.pageViewScroll, updateViewarea);

    var thumbnailContainer = this.thumbnailContainer =
                             document.getElementById('thumbnailView');
    this.thumbnailViewScroll = {};
    this.watchScroll(thumbnailContainer, this.thumbnailViewScroll,
                     this.renderHighestPriority.bind(this));

    this.initialized = true;
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
      pages[i].update(val * kCssUnits);

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
    var pageWidthScale = (container.clientWidth - kScrollbarPadding) /
                          currentPage.width * currentPage.scale / kCssUnits;
    var pageHeightScale = (container.clientHeight - kScrollbarPadding) /
                           currentPage.height * currentPage.scale / kCssUnits;
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

  zoomIn: function pdfViewZoomIn() {
    var newScale = (this.currentScale * kDefaultScaleDelta).toFixed(2);
    newScale = Math.min(kMaxScale, newScale);
    this.parseScale(newScale, true);
  },

  zoomOut: function pdfViewZoomOut() {
    var newScale = (this.currentScale / kDefaultScaleDelta).toFixed(2);
    newScale = Math.max(kMinScale, newScale);
    this.parseScale(newScale, true);
  },

  set page(val) {
    var pages = this.pages;
    var input = document.getElementById('pageNumber');
    if (!(0 < val && val <= pages.length)) {
      var event = document.createEvent('UIEvents');
      event.initUIEvent('pagechange', false, false, window, 0);
      event.pageNumber = this.page;
      window.dispatchEvent(event);
      return;
    }

    pages[val - 1].updateStats();
    currentPageNumber = val;
    var event = document.createEvent('UIEvents');
    event.initUIEvent('pagechange', false, false, window, 0);
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

  open: function pdfViewOpen(url, scale, password) {
    var parameters = {password: password};
    if (typeof url === 'string') { // URL
      this.url = url;
      document.title = decodeURIComponent(getFileName(url)) || url;
      parameters.url = url;
    } else if (url && 'byteLength' in url) { // ArrayBuffer
      parameters.data = url;
    }

    if (!PDFView.loadingBar) {
      PDFView.loadingBar = new ProgressBar('#loadingBar', {});
    }

    this.pdfDocument = null;
    var self = this;
    self.loading = true;
    PDFJS.getDocument(parameters).then(
      function getDocumentCallback(pdfDocument) {
        self.load(pdfDocument, scale);
        self.loading = false;
      },
      function getDocumentError(message, exception) {
        if (exception && exception.name === 'PasswordException') {
          if (exception.code === 'needpassword') {
            var promptString = mozL10n.get('request_password', null,
                                      'PDF is protected by a password:');
            password = prompt(promptString);
            if (password && password.length > 0) {
              return PDFView.open(url, scale, password);
            }
          }
        }

        var loadingIndicator = document.getElementById('loading');
        loadingIndicator.textContent = mozL10n.get('loading_error_indicator',
          null, 'Error');
        var moreInfo = {
          message: message
        };
        self.error(mozL10n.get('loading_error', null,
          'An error occurred while loading the PDF.'), moreInfo);
        self.loading = false;
      },
      function getDocumentProgress(progressData) {
        self.progress(progressData.loaded / progressData.total);
      }
    );
  },

  download: function pdfViewDownload() {
    function noData() {
      FirefoxCom.request('download', { originalUrl: url });
    }

    var url = this.url.split('#')[0];
    if (PDFJS.isFirefoxExtension) {
      // Document isn't ready just try to download with the url.
      if (!this.pdfDocument) {
        noData();
        return;
      }
      this.pdfDocument.getData().then(
        function getDataSuccess(data) {
          var bb = new MozBlobBuilder();
          bb.append(data.buffer);
          var blobUrl = window.URL.createObjectURL(
                          bb.getBlob('application/pdf'));

          FirefoxCom.request('download', { blobUrl: blobUrl, originalUrl: url },
            function response(err) {
              if (err) {
                // This error won't really be helpful because it's likely the
                // fallback won't work either (or is already open).
                PDFView.error('PDF failed to download.');
              }
              window.URL.revokeObjectURL(blobUrl);
            }
          );
        },
        noData // Error ocurred try downloading with just the url.
      );
    } else {
      url += '#pdfjs.action=download', '_parent';
      window.open(url, '_parent');
    }
  },

  fallback: function pdfViewFallback() {
    if (!PDFJS.isFirefoxExtension)
      return;
    // Only trigger the fallback once so we don't spam the user with messages
    // for one PDF.
    if (this.fellback)
      return;
    this.fellback = true;
    var url = this.url.split('#')[0];
    FirefoxCom.request('fallback', url, function response(download) {
      if (!download)
        return;
      PDFView.download();
    });
  },

  navigateTo: function pdfViewNavigateTo(dest) {
    if (typeof dest === 'string')
      dest = this.destinations[dest];
    if (!(dest instanceof Array))
      return; // invalid destination
    // dest array looks like that: <page-ref> </XYZ|FitXXX> <args..>
    var destRef = dest[0];
    var pageNumber = destRef instanceof Object ?
      this.pagesRefMap[destRef.num + ' ' + destRef.gen + ' R'] : (destRef + 1);
    if (pageNumber > this.pages.length)
      pageNumber = this.pages.length;
    if (pageNumber) {
      this.page = pageNumber;
      var currentPage = this.pages[pageNumber - 1];
      currentPage.scrollIntoView(dest);
    }
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
          var scale = (dest[4] || this.currentScale);
          pdfOpenParams += '&zoom=' + (scale * 100);
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
    if (PDFJS.isFirefoxExtension)
      return this.url.split('#')[0] + anchor;
    return anchor;
  },

  /**
   * Show the error box.
   * @param {String} message A message that is human readable.
   * @param {Object} moreInfo (optional) Further information about the error
   *                            that is more technical.  Should have a 'message'
   *                            and optionally a 'stack' property.
   */
  error: function pdfViewError(message, moreInfo) {
    var moreInfoText = mozL10n.get('error_build', {build: PDFJS.build},
      'PDF.JS Build: {{build}}') + '\n';
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
    if (PDFJS.isFirefoxExtension) {
      console.error(message + '\n' + moreInfoText);
      this.fallback();
      return;
    }
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
    };
    lessInfoButton.onclick = function() {
      errorMoreInfo.setAttribute('hidden', 'true');
      moreInfoButton.removeAttribute('hidden');
      lessInfoButton.setAttribute('hidden', 'true');
    };
    moreInfoButton.removeAttribute('hidden');
    lessInfoButton.setAttribute('hidden', 'true');
    errorMoreInfo.value = moreInfoText;

    errorMoreInfo.rows = moreInfoText.split('\n').length - 1;
  },

  progress: function pdfViewProgress(level) {
    var percent = Math.round(level * 100);
    PDFView.loadingBar.percent = percent;
  },

  load: function pdfViewLoad(pdfDocument, scale) {
    function bindOnAfterDraw(pageView, thumbnailView) {
      // when page is painted, using the image as thumbnail base
      pageView.onAfterDraw = function pdfViewLoadOnAfterDraw() {
        thumbnailView.setImage(pageView.canvas);
      };
    }

    this.pdfDocument = pdfDocument;

    var errorWrapper = document.getElementById('errorWrapper');
    errorWrapper.setAttribute('hidden', 'true');

    var loadingBox = document.getElementById('loadingBox');
    loadingBox.setAttribute('hidden', 'true');
    var loadingIndicator = document.getElementById('loading');
    loadingIndicator.textContent = '';

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
    var storedHash = null;
    document.getElementById('numPages').textContent =
      mozL10n.get('page_of', {pageCount: pagesCount}, 'of {{pageCount}}');
    document.getElementById('pageNumber').max = pagesCount;
    PDFView.documentFingerprint = id;
    var store = PDFView.store = new Settings(id);
    if (store.get('exists', false)) {
      var page = store.get('page', '1');
      var zoom = store.get('zoom', PDFView.currentScale);
      var left = store.get('scrollLeft', '0');
      var top = store.get('scrollTop', '0');

      storedHash = 'page=' + page + '&zoom=' + zoom + ',' + left + ',' + top;
    }

    var pages = this.pages = [];
    this.pageText = [];
    this.startedTextExtraction = false;
    var pagesRefMap = {};
    var thumbnails = this.thumbnails = [];
    var pagePromises = [];
    for (var i = 1; i <= pagesCount; i++)
      pagePromises.push(pdfDocument.getPage(i));
    var self = this;
    var pagesPromise = PDFJS.Promise.all(pagePromises);
    pagesPromise.then(function(promisedPages) {
      for (var i = 1; i <= pagesCount; i++) {
        var page = promisedPages[i - 1];
        var pageView = new PageView(container, page, i, scale,
                                    page.stats, self.navigateTo.bind(self));
        var thumbnailView = new ThumbnailView(thumbsView, page, i);
        bindOnAfterDraw(pageView, thumbnailView);

        pages.push(pageView);
        thumbnails.push(thumbnailView);
        var pageRef = page.ref;
        pagesRefMap[pageRef.num + ' ' + pageRef.gen + ' R'] = i;
      }

      self.pagesRefMap = pagesRefMap;
    });

    var destinationsPromise = pdfDocument.getDestinations();
    destinationsPromise.then(function(destinations) {
      self.destinations = destinations;
    });

    // outline and initial view depends on destinations and pagesRefMap
    PDFJS.Promise.all([pagesPromise, destinationsPromise]).then(function() {
      pdfDocument.getOutline().then(function(outline) {
        self.outline = new DocumentOutlineView(outline);
      });

      self.setInitialView(storedHash, scale);
    });

    pdfDocument.getMetadata().then(function(data) {
      var info = data.info, metadata = data.metadata;
      self.documentInfo = info;
      self.metadata = metadata;

      var pdfTitle;
      if (metadata) {
        if (metadata.has('dc:title'))
          pdfTitle = metadata.get('dc:title');
      }

      if (!pdfTitle && info && info['Title'])
        pdfTitle = info['Title'];

      if (pdfTitle)
        document.title = pdfTitle + ' - ' + document.title;
    });
  },

  setInitialView: function pdfViewSetInitialView(storedHash, scale) {
    // Reset the current scale, as otherwise the page's scale might not get
    // updated if the zoom level stayed the same.
    this.currentScale = 0;
    this.currentScaleValue = null;
    if (this.initialBookmark) {
      this.setHash(this.initialBookmark);
      this.initialBookmark = null;
    }
    else if (storedHash)
      this.setHash(storedHash);
    else if (scale) {
      this.parseScale(scale, true);
      this.page = 1;
    }

    if (PDFView.currentScale === kUnknownScale) {
      // Scale was not initialized: invalid bookmark or scale was not specified.
      // Setting the default one.
      this.parseScale(kDefaultScale, true);
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

  getHighestPriority: function pdfViewGetHighestPriority(visibleViews, views,
                                                         scrolledDown) {
    // The state has changed figure out which page has the highest priority to
    // render next (if any).
    // Priority:
    // 1 visible pages
    // 2 if last scrolled down page after the visible pages
    // 2 if last scrolled up page before the visible pages
    var numVisible = visibleViews.length;
    if (numVisible === 0) {
      info('No visible views.');
      return false;
    }
    for (var i = 0; i < numVisible; ++i) {
      var view = visibleViews[i].view;
      if (!this.isViewFinshed(view))
        return view;
    }

    // All the visible views have rendered, try to render next/previous pages.
    if (scrolledDown) {
      var lastVisible = visibleViews[visibleViews.length - 1];
      var nextPageIndex = lastVisible.id;
      // ID's start at 1 so no need to add 1.
      if (views[nextPageIndex] && !this.isViewFinshed(views[nextPageIndex]))
        return views[nextPageIndex];
    } else {
      var previousPageIndex = visibleViews[0].id - 2;
      if (views[previousPageIndex] &&
          !this.isViewFinshed(views[previousPageIndex]))
        return views[previousPageIndex];
    }
    // Everything that needs to be rendered has been.
    return false;
  },

  isViewFinshed: function pdfViewNeedsRendering(view) {
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

  search: function pdfViewStartSearch() {
    // Limit this function to run every <SEARCH_TIMEOUT>ms.
    var SEARCH_TIMEOUT = 250;
    var lastSeach = this.lastSearch;
    var now = Date.now();
    if (lastSeach && (now - lastSeach) < SEARCH_TIMEOUT) {
      if (!this.searchTimer) {
        this.searchTimer = setTimeout(function resumeSearch() {
            PDFView.search();
          },
          SEARCH_TIMEOUT - (now - lastSeach)
        );
      }
      return;
    }
    this.searchTimer = null;
    this.lastSearch = now;

    function bindLink(link, pageNumber) {
      link.href = '#' + pageNumber;
      link.onclick = function searchBindLink() {
        PDFView.page = pageNumber;
        return false;
      };
    }

    var searchResults = document.getElementById('searchResults');

    var searchTermsInput = document.getElementById('searchTermsInput');
    searchResults.removeAttribute('hidden');
    searchResults.textContent = '';

    var terms = searchTermsInput.value;

    if (!terms)
      return;

    // simple search: removing spaces and hyphens, then scanning every
    terms = terms.replace(/\s-/g, '').toLowerCase();
    var index = PDFView.pageText;
    var pageFound = false;
    for (var i = 0, ii = index.length; i < ii; i++) {
      var pageText = index[i].replace(/\s-/g, '').toLowerCase();
      var j = pageText.indexOf(terms);
      if (j < 0)
        continue;

      var pageNumber = i + 1;
      var textSample = index[i].substr(j, 50);
      var link = document.createElement('a');
      bindLink(link, pageNumber);
      link.textContent = 'Page ' + pageNumber + ': ' + textSample;
      searchResults.appendChild(link);

      pageFound = true;
    }
    if (!pageFound) {
      searchResults.textContent = '';
      var noResults = document.createElement('div');
      noResults.classList.add('noResults');
      noResults.textContent = mozL10n.get('search_terms_not_found', null,
                                              '(Not found)');
      searchResults.appendChild(noResults);
    }
  },

  setHash: function pdfViewSetHash(hash) {
    if (!hash)
      return;

    if (hash.indexOf('=') >= 0) {
      var params = PDFView.parseQueryString(hash);
      // borrowing syntax from "Parameters for Opening PDF Files"
      if ('nameddest' in params) {
        PDFView.navigateTo(params.nameddest);
        return;
      }
      if ('page' in params) {
        var pageNumber = (params.page | 0) || 1;
        this.page = pageNumber;
        if ('zoom' in params) {
          var zoomArgs = params.zoom.split(','); // scale,left,top
          // building destination array

          // If the zoom value, it has to get divided by 100. If it is a string,
          // it should stay as it is.
          var zoomArg = zoomArgs[0];
          var zoomArgNumber = parseFloat(zoomArg);
          if (zoomArgNumber)
            zoomArg = zoomArgNumber / 100;

          var dest = [null, {name: 'XYZ'}, (zoomArgs[1] | 0),
            (zoomArgs[2] | 0), zoomArg];
          var currentPage = this.pages[pageNumber - 1];
          currentPage.scrollIntoView(dest);
        } else
          this.page = params.page; // simple page
        return;
      }
    } else if (/^\d+$/.test(hash)) // page number
      this.page = hash;
    else // named destination
      PDFView.navigateTo(unescape(hash));
  },

  switchSidebarView: function pdfViewSwitchSidebarView(view) {
    var thumbsView = document.getElementById('thumbnailView');
    var outlineView = document.getElementById('outlineView');
    var searchView = document.getElementById('searchView');

    var thumbsButton = document.getElementById('viewThumbnail');
    var outlineButton = document.getElementById('viewOutline');
    var searchButton = document.getElementById('viewSearch');

    switch (view) {
      case 'thumbs':
        thumbsButton.classList.add('toggled');
        outlineButton.classList.remove('toggled');
        searchButton.classList.remove('toggled');
        thumbsView.classList.remove('hidden');
        outlineView.classList.add('hidden');
        searchView.classList.add('hidden');

        PDFView.renderHighestPriority();
        break;

      case 'outline':
        thumbsButton.classList.remove('toggled');
        outlineButton.classList.add('toggled');
        searchButton.classList.remove('toggled');
        thumbsView.classList.add('hidden');
        outlineView.classList.remove('hidden');
        searchView.classList.add('hidden');

        if (outlineButton.getAttribute('disabled'))
          return;
        break;

      case 'search':
        thumbsButton.classList.remove('toggled');
        outlineButton.classList.remove('toggled');
        searchButton.classList.add('toggled');
        thumbsView.classList.add('hidden');
        outlineView.classList.add('hidden');
        searchView.classList.remove('hidden');

        var searchTermsInput = document.getElementById('searchTermsInput');
        searchTermsInput.focus();
        // Start text extraction as soon as the search gets displayed.
        this.extractText();
        break;
    }
  },

  extractText: function() {
    if (this.startedTextExtraction)
      return;
    this.startedTextExtraction = true;
    var self = this;
    function extractPageText(pageIndex) {
      self.pages[pageIndex].pdfPage.getTextContent().then(
        function textContentResolved(textContent) {
          self.pageText[pageIndex] = textContent;
          self.search();
          if ((pageIndex + 1) < self.pages.length)
            extractPageText(pageIndex + 1);
        }
      );
    };
    extractPageText(0);
  },

  getVisiblePages: function pdfViewGetVisiblePages() {
    return this.getVisibleElements(this.container,
                                   this.pages);
  },

  getVisibleThumbs: function pdfViewGetVisibleThumbs() {
    return this.getVisibleElements(this.thumbnailContainer,
                                   this.thumbnails);
  },

  // Generic helper to find out what elements are visible within a scroll pane.
  getVisibleElements: function pdfViewGetVisibleElements(scrollEl, views) {
    var currentHeight = 0, view;
    var top = scrollEl.scrollTop;

    for (var i = 1; i <= views.length; ++i) {
      view = views[i - 1];
      currentHeight = view.el.offsetTop;
      if (currentHeight + view.el.clientHeight > top)
        break;
      currentHeight += view.el.clientHeight;
    }

    var visible = [];
    var bottom = top + scrollEl.clientHeight;
    for (; i <= views.length && currentHeight < bottom; ++i) {
      view = views[i - 1];
      currentHeight = view.el.offsetTop;
      visible.push({ id: view.id, y: currentHeight,
                     view: view });
      currentHeight += view.el.clientHeight;
    }

    return visible;
  },

  // Helper function to parse query string (e.g. ?param1=value&parm2=...).
  parseQueryString: function pdfViewParseQueryString(query) {
    var parts = query.split('&');
    var params = {};
    for (var i = 0, ii = parts.length; i < parts.length; ++i) {
      var param = parts[i].split('=');
      var key = param[0];
      var value = param.length > 1 ? param[1] : null;
      params[unescape(key)] = unescape(value);
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
  }
};

var PageView = function pageView(container, pdfPage, id, scale,
                                 stats, navigateTo) {
  this.id = id;
  this.pdfPage = pdfPage;

  this.scale = scale || 1.0;
  this.viewport = this.pdfPage.getViewport(this.scale);

  this.renderingState = RenderingStates.INITIAL;
  this.resume = null;

  var anchor = document.createElement('a');
  anchor.name = '' + this.id;

  var div = this.el = document.createElement('div');
  div.id = 'pageContainer' + this.id;
  div.className = 'page';

  container.appendChild(anchor);
  container.appendChild(div);

  this.destroy = function pageViewDestroy() {
    this.update();
    this.pdfPage.destroy();
  };

  this.update = function pageViewUpdate(scale) {
    this.renderingState = RenderingStates.INITIAL;
    this.resume = null;

    this.scale = scale || this.scale;
    var viewport = this.pdfPage.getViewport(this.scale);

    this.viewport = viewport;
    div.style.width = viewport.width + 'px';
    div.style.height = viewport.height + 'px';

    while (div.hasChildNodes())
      div.removeChild(div.lastChild);
    div.removeAttribute('data-loaded');

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

  function setupAnnotations(pdfPage, viewport) {
    function bindLink(link, dest) {
      link.href = PDFView.getDestinationHash(dest);
      link.onclick = function pageViewSetupLinksOnclick() {
        if (dest)
          PDFView.navigateTo(dest);
        return false;
      };
    }
    function createElementWithStyle(tagName, item) {
      var rect = viewport.convertToViewportRectangle(item.rect);
      rect = PDFJS.Util.normalizeRect(rect);
      var element = document.createElement(tagName);
      element.style.left = Math.floor(rect[0]) + 'px';
      element.style.top = Math.floor(rect[1]) + 'px';
      element.style.width = Math.ceil(rect[2] - rect[0]) + 'px';
      element.style.height = Math.ceil(rect[3] - rect[1]) + 'px';
      return element;
    }
    function createCommentAnnotation(type, item) {
      var container = document.createElement('section');
      container.className = 'annotComment';

      var image = createElementWithStyle('img', item);
      var type = item.type;
      var rect = viewport.convertToViewportRectangle(item.rect);
      rect = PDFJS.Util.normalizeRect(rect);
      image.src = kImageDirectory + 'annotation-' + type.toLowerCase() + '.svg';
      image.alt = mozL10n.get('text_annotation_type', {type: type},
        '[{{type}} Annotation]');
      var content = document.createElement('div');
      content.setAttribute('hidden', true);
      var title = document.createElement('h1');
      var text = document.createElement('p');
      content.style.left = Math.floor(rect[2]) + 'px';
      content.style.top = Math.floor(rect[1]) + 'px';
      title.textContent = item.title;

      if (!item.content && !item.title) {
        content.setAttribute('hidden', true);
      } else {
        var e = document.createElement('span');
        var lines = item.content.split('\n');
        for (var i = 0, ii = lines.length; i < ii; ++i) {
          var line = lines[i];
          e.appendChild(document.createTextNode(line));
          if (i < (ii - 1))
            e.appendChild(document.createElement('br'));
        }
        text.appendChild(e);
        image.addEventListener('mouseover', function annotationImageOver() {
           content.removeAttribute('hidden');
        }, false);

        image.addEventListener('mouseout', function annotationImageOut() {
           content.setAttribute('hidden', true);
        }, false);
      }

      content.appendChild(title);
      content.appendChild(text);
      container.appendChild(image);
      container.appendChild(content);

      return container;
    }

    pdfPage.getAnnotations().then(function(items) {
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        switch (item.type) {
          case 'Link':
            var link = createElementWithStyle('a', item);
            link.href = item.url || '';
            if (!item.url)
              bindLink(link, ('dest' in item) ? item.dest : null);
            div.appendChild(link);
            break;
          case 'Text':
            var comment = createCommentAnnotation(item.name, item);
            if (comment)
              div.appendChild(comment);
            break;
          case 'Widget':
            // TODO: support forms
            PDFView.fallback();
            break;
        }
      }
    });
  }

  this.getPagePoint = function pageViewGetPagePoint(x, y) {
    return this.viewport.convertToPdfPoint(x, y);
  };

  this.scrollIntoView = function pageViewScrollIntoView(dest) {
      if (!dest) {
        div.scrollIntoView(true);
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
          widthScale = (this.container.clientWidth - kScrollbarPadding) /
            width / kCssUnits;
          heightScale = (this.container.clientHeight - kScrollbarPadding) /
            height / kCssUnits;
          scale = Math.min(widthScale, heightScale);
          break;
        default:
          return;
      }

      if (scale && scale !== PDFView.currentScale)
        PDFView.parseScale(scale, true, true);
      else if (PDFView.currentScale === kUnknownScale)
        PDFView.parseScale(kDefaultScale, true, true);

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

        // using temporary div to scroll it into view
        var tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = Math.floor(x) + 'px';
        tempDiv.style.top = Math.floor(y) + 'px';
        tempDiv.style.width = Math.ceil(width) + 'px';
        tempDiv.style.height = Math.ceil(height) + 'px';
        div.appendChild(tempDiv);
        tempDiv.scrollIntoView(true);
        div.removeChild(tempDiv);
      }, 0);
  };

  this.draw = function pageviewDraw(callback) {
    if (this.renderingState !== RenderingStates.INITIAL)
      error('Must be in new state before drawing');

    this.renderingState = RenderingStates.RUNNING;

    var canvas = document.createElement('canvas');
    canvas.id = 'page' + this.id;
    canvas.mozOpaque = true;
    div.appendChild(canvas);
    this.canvas = canvas;

    var textLayerDiv = null;
    if (!PDFJS.disableTextLayer) {
      textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      div.appendChild(textLayerDiv);
    }
    var textLayer = textLayerDiv ? new TextLayerBuilder(textLayerDiv) : null;

    var scale = this.scale, viewport = this.viewport;
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    var ctx = canvas.getContext('2d');
    ctx.save();
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Rendering area

    var self = this;
    function pageViewDrawCallback(error) {
      self.renderingState = RenderingStates.FINISHED;

      if (self.loadingIconDiv) {
        div.removeChild(self.loadingIconDiv);
        delete self.loadingIconDiv;
      }

      if (error) {
        PDFView.error(mozL10n.get('rendering_error', null,
          'An error occurred while rendering the page.'), error);
      }

      self.stats = pdfPage.stats;
      self.updateStats();
      if (self.onAfterDraw)
        self.onAfterDraw();

      cache.push(self);
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
    this.pdfPage.render(renderContext).then(
      function pdfPageRenderCallback() {
        pageViewDrawCallback(null);
      },
      function pdfPageRenderError(error) {
        pageViewDrawCallback(error);
      }
    );

    setupAnnotations(this.pdfPage, this.viewport);
    div.setAttribute('data-loaded', true);
  };

  this.beforePrint = function pageViewBeforePrint() {
    var pdfPage = this.pdfPage;
    var viewport = pdfPage.getViewport(1);

    var canvas = this.canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = viewport.width + 'pt';
    canvas.style.height = viewport.height + 'pt';

    var printContainer = document.getElementById('printContainer');
    printContainer.appendChild(canvas);

    var self = this;
    canvas.mozPrintCallback = function(obj) {
      var ctx = obj.context;
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
        if ('abort' in object)
          obj.abort();
        else
          obj.done();
        self.pdfPage.destroy();
      });
    };
  };

  this.updateStats = function pageViewUpdateStats() {
    if (PDFJS.pdfBug && Stats.enabled) {
      var stats = this.stats;
      Stats.add(this.id, stats);
    }
  };
};

var ThumbnailView = function thumbnailView(container, pdfPage, id) {
  var anchor = document.createElement('a');
  anchor.href = PDFView.getAnchorUrl('#page=' + id);
  anchor.title = mozL10n.get('thumb_page_title', {page: id}, 'Page {{page}}');
  anchor.onclick = function stopNavigation() {
    PDFView.page = id;
    return false;
  };

  var viewport = pdfPage.getViewport(1);
  var pageWidth = this.width = viewport.width;
  var pageHeight = this.height = viewport.height;
  var pageRatio = pageWidth / pageHeight;
  this.id = id;

  var canvasWidth = 98;
  var canvasHeight = canvasWidth / this.width * this.height;
  var scaleX = this.scaleX = (canvasWidth / pageWidth);
  var scaleY = this.scaleY = (canvasHeight / pageHeight);

  var div = this.el = document.createElement('div');
  div.id = 'thumbnailContainer' + id;
  div.className = 'thumbnail';

  anchor.appendChild(div);
  container.appendChild(anchor);

  this.hasImage = false;
  this.renderingState = RenderingStates.INITIAL;

  function getPageDrawContext() {
    var canvas = document.createElement('canvas');
    canvas.id = 'thumbnail' + id;
    canvas.mozOpaque = true;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.className = 'thumbnailImage';
    canvas.setAttribute('aria-label', mozL10n.get('thumb_page_canvas',
      {page: id}, 'Thumbnail of Page {{page}}'));

    div.setAttribute('data-loaded', true);

    var ring = document.createElement('div');
    ring.className = 'thumbnailSelectionRing';
    ring.appendChild(canvas);
    div.appendChild(ring);

    var ctx = canvas.getContext('2d');
    ctx.save();
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.restore();
    return ctx;
  }

  this.drawingRequired = function thumbnailViewDrawingRequired() {
    return !this.hasImage;
  };

  this.draw = function thumbnailViewDraw(callback) {
    if (this.renderingState !== RenderingStates.INITIAL)
      error('Must be in new state before drawing');

    this.renderingState = RenderingStates.RUNNING;
    if (this.hasImage) {
      callback();
      return;
    }

    var self = this;
    var ctx = getPageDrawContext();
    var drawViewport = pdfPage.getViewport(scaleX);
    var renderContext = {
      canvasContext: ctx,
      viewport: drawViewport,
      continueCallback: function(cont) {
        if (PDFView.highestPriorityPage !== 'thumbnail' + self.id) {
          self.renderingState = RenderingStates.PAUSED;
          self.resume = function() {
            self.renderingState = RenderingStates.RUNNING;
            cont();
          };
          return;
        }
        cont();
      }
    };
    pdfPage.render(renderContext).then(
      function pdfPageRenderCallback() {
        self.renderingState = RenderingStates.FINISHED;
        callback();
      },
      function pdfPageRenderError(error) {
        self.renderingState = RenderingStates.FINISHED;
        callback();
      }
    );
    this.hasImage = true;
  };

  this.setImage = function thumbnailViewSetImage(img) {
    if (this.hasImage || !img)
      return;
    this.renderingState = RenderingStates.FINISHED;
    var ctx = getPageDrawContext();
    ctx.drawImage(img, 0, 0, img.width, img.height,
                  0, 0, ctx.canvas.width, ctx.canvas.height);

    this.hasImage = true;
  };
};

var DocumentOutlineView = function documentOutlineView(outline) {
  var outlineView = document.getElementById('outlineView');
  while (outlineView.firstChild)
    outlineView.removeChild(outlineView.firstChild);

  function bindItemLink(domObj, item) {
    domObj.href = PDFView.getDestinationHash(item.dest);
    domObj.onclick = function documentOutlineViewOnclick(e) {
      PDFView.navigateTo(item.dest);
      return false;
    };
  }

  if (!outline) {
    var noOutline = document.createElement('div');
    noOutline.classList.add('noOutline');
    noOutline.textContent = mozL10n.get('no_outline', null,
      'No Outline Available');
    outlineView.appendChild(noOutline);
    return;
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

// optimised CSS custom property getter/setter
var CustomStyle = (function CustomStyleClosure() {

  // As noted on: http://www.zachstronaut.com/posts/2009/02/17/
  //              animate-css-transforms-firefox-webkit.html
  // in some versions of IE9 it is critical that ms appear in this list
  // before Moz
  var prefixes = ['ms', 'Moz', 'Webkit', 'O'];
  var _cache = { };

  function CustomStyle() {
  }

  CustomStyle.getProp = function get(propName, element) {
    // check cache only when no element is given
    if (arguments.length == 1 && typeof _cache[propName] == 'string') {
      return _cache[propName];
    }

    element = element || document.documentElement;
    var style = element.style, prefixed, uPropName;

    // test standard property first
    if (typeof style[propName] == 'string') {
      return (_cache[propName] = propName);
    }

    // capitalize
    uPropName = propName.charAt(0).toUpperCase() + propName.slice(1);

    // test vendor specific properties
    for (var i = 0, l = prefixes.length; i < l; i++) {
      prefixed = prefixes[i] + uPropName;
      if (typeof style[prefixed] == 'string') {
        return (_cache[propName] = prefixed);
      }
    }

    //if all fails then set to undefined
    return (_cache[propName] = 'undefined');
  }

  CustomStyle.setProp = function set(propName, element, str) {
    var prop = this.getProp(propName);
    if (prop != 'undefined')
      element.style[prop] = str;
  }

  return CustomStyle;
})();

var TextLayerBuilder = function textLayerBuilder(textLayerDiv) {
  this.textLayerDiv = textLayerDiv;

  this.beginLayout = function textLayerBuilderBeginLayout() {
    this.textDivs = [];
    this.textLayerQueue = [];
  };

  this.endLayout = function textLayerBuilderEndLayout() {
    var self = this;
    var textDivs = this.textDivs;
    var textLayerDiv = this.textLayerDiv;
    var renderTimer = null;
    var renderingDone = false;
    var renderInterval = 0;
    var resumeInterval = 500; // in ms

    // Render the text layer, one div at a time
    function renderTextLayer() {
      if (textDivs.length === 0) {
        clearInterval(renderTimer);
        renderingDone = true;
        return;
      }
      var textDiv = textDivs.shift();
      if (textDiv.dataset.textLength > 0) {
        textLayerDiv.appendChild(textDiv);

        if (textDiv.dataset.textLength > 1) { // avoid div by zero
          // Adjust div width to match canvas text
          // Due to the .offsetWidth calls, this is slow
          // This needs to come after appending to the DOM
          var textScale = textDiv.dataset.canvasWidth / textDiv.offsetWidth;
          CustomStyle.setProp('transform' , textDiv,
            'scale(' + textScale + ', 1)');
          CustomStyle.setProp('transformOrigin' , textDiv, '0% 0%');
        }
      } // textLength > 0
    }
    renderTimer = setInterval(renderTextLayer, renderInterval);

    // Stop rendering when user scrolls. Resume after XXX milliseconds
    // of no scroll events
    var scrollTimer = null;
    function textLayerOnScroll() {
      if (renderingDone) {
        window.removeEventListener('scroll', textLayerOnScroll, false);
        return;
      }

      // Immediately pause rendering
      clearInterval(renderTimer);

      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function textLayerScrollTimer() {
        // Resume rendering
        renderTimer = setInterval(renderTextLayer, renderInterval);
      }, resumeInterval);
    }; // textLayerOnScroll

    window.addEventListener('scroll', textLayerOnScroll, false);
  }; // endLayout

  this.appendText = function textLayerBuilderAppendText(text,
                                                        fontName, fontSize) {
    var textDiv = document.createElement('div');

    // vScale and hScale already contain the scaling to pixel units
    var fontHeight = fontSize * text.geom.vScale;
    textDiv.dataset.canvasWidth = text.canvasWidth * text.geom.hScale;
    textDiv.dataset.fontName = fontName;

    textDiv.style.fontSize = fontHeight + 'px';
    textDiv.style.left = text.geom.x + 'px';
    textDiv.style.top = (text.geom.y - fontHeight) + 'px';
    textDiv.textContent = PDFJS.bidi(text, -1);
    textDiv.dir = text.direction;
    textDiv.dataset.textLength = text.length;
    this.textDivs.push(textDiv);
  };
};

window.addEventListener('load', function webViewerLoad(evt) {
  PDFView.initialize();
  var params = PDFView.parseQueryString(document.location.search.substring(1));

  var file = PDFJS.isFirefoxExtension ?
              window.location.toString() : params.file || kDefaultURL;

  if (PDFJS.isFirefoxExtension || !window.File || !window.FileReader ||
      !window.FileList || !window.Blob) {
    document.getElementById('openFile').setAttribute('hidden', 'true');
  } else {
    document.getElementById('fileInput').value = null;
  }

  // Special debugging flags in the hash section of the URL.
  var hash = document.location.hash.substring(1);
  var hashParams = PDFView.parseQueryString(hash);

  if ('disableWorker' in hashParams)
    PDFJS.disableWorker = (hashParams['disableWorker'] === 'true');

  if (!PDFJS.isFirefoxExtension) {
    var locale = navigator.language;
    if ('locale' in hashParams)
      locale = hashParams['locale'];
    mozL10n.language.code = locale;
  }

  if ('disableTextLayer' in hashParams)
    PDFJS.disableTextLayer = (hashParams['disableTextLayer'] === 'true');

  if ('pdfBug' in hashParams &&
      (!PDFJS.isFirefoxExtension || FirefoxCom.requestSync('pdfBugEnabled'))) {
    PDFJS.pdfBug = true;
    var pdfBug = hashParams['pdfBug'];
    var enabled = pdfBug.split(',');
    PDFBug.enable(enabled);
    PDFBug.init();
  }

  if (!PDFJS.isFirefoxExtension ||
    (PDFJS.isFirefoxExtension && FirefoxCom.requestSync('searchEnabled'))) {
    document.querySelector('#viewSearch').classList.remove('hidden');
  }

  if (!PDFView.supportsPrinting) {
    document.getElementById('print').classList.add('hidden');
  }

  // Listen for warnings to trigger the fallback UI.  Errors should be caught
  // and call PDFView.error() so we don't need to listen for those.
  PDFJS.LogManager.addLogger({
    warn: function() {
      PDFView.fallback();
    }
  });

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

  PDFView.open(file, 0);
}, true);

function updateViewarea() {
  if (!PDFView.initialized)
    return;
  var visiblePages = PDFView.getVisiblePages();

  PDFView.renderHighestPriority();

  updateViewarea.inProgress = true; // used in "set page"
  var currentId = PDFView.page;
  var firstPage = visiblePages[0];
  PDFView.page = firstPage.id;
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
  store.set('exists', true);
  store.set('page', pageNumber);
  store.set('zoom', normalizedScaleValue);
  store.set('scrollLeft', Math.round(topLeft[0]));
  store.set('scrollTop', Math.round(topLeft[1]));
  var href = PDFView.getAnchorUrl(pdfOpenParams);
  document.getElementById('viewBookmark').href = href;
}

window.addEventListener('resize', function webViewerResize(evt) {
  if (PDFView.initialized &&
      (document.getElementById('pageWidthOption').selected ||
      document.getElementById('pageFitOption').selected ||
      document.getElementById('pageAutoOption').selected))
      PDFView.parseScale(document.getElementById('scaleSelect').value);
  updateViewarea();
});

window.addEventListener('hashchange', function webViewerHashchange(evt) {
  PDFView.setHash(document.location.hash.substring(1));
});

window.addEventListener('change', function webViewerChange(evt) {
  var files = evt.target.files;
  if (!files || files.length == 0)
    return;

  // Read the local file into a Uint8Array.
  var fileReader = new FileReader();
  fileReader.onload = function webViewerChangeFileReaderOnload(evt) {
    var data = evt.target.result;
    var buffer = new ArrayBuffer(data.length);
    var uint8Array = new Uint8Array(buffer);

    for (var i = 0; i < data.length; i++)
      uint8Array[i] = data.charCodeAt(i);

    PDFView.open(uint8Array, 0);
  };

  // Read as a binary string since "readAsArrayBuffer" is not yet
  // implemented in Firefox.
  var file = files[0];
  fileReader.readAsBinaryString(file);
  document.title = file.name;

  // URL does not reflect proper document location - hiding some icons.
  document.getElementById('viewBookmark').setAttribute('hidden', 'true');
  document.getElementById('download').setAttribute('hidden', 'true');
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
  document.getElementsByTagName('html')[0].dir = mozL10n.language.direction;
}, true);

window.addEventListener('scalechange', function scalechange(evt) {
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
  if (document.getElementById('pageNumber').value != page) {
    document.getElementById('pageNumber').value = page;
    var selected = document.querySelector('.thumbnail.selected');
    if (selected)
      selected.classList.remove('selected');
    var thumbnail = document.getElementById('thumbnailContainer' + page);
    thumbnail.classList.add('selected');
    var visibleThumbs = PDFView.getVisibleThumbs();
    var numVisibleThumbs = visibleThumbs.length;
    // If the thumbnail isn't currently visible scroll it into view.
    if (numVisibleThumbs > 0) {
      var first = visibleThumbs[0].id;
      // Account for only one thumbnail being visible.
      var last = numVisibleThumbs > 1 ?
                  visibleThumbs[numVisibleThumbs - 1].id : first;
      if (page <= first || page >= last)
        thumbnail.scrollIntoView();
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
    for (var i = 0, length = Math.abs(ticks); i < length; i++)
      PDFView[direction]();
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
  if (cmd == 1 || cmd == 8) { // either CTRL or META key.
    switch (evt.keyCode) {
      case 61: // FF/Mac '='
      case 107: // FF '+' and '='
      case 187: // Chrome '+'
        PDFView.zoomIn();
        handled = true;
        break;
      case 109: // FF '-'
      case 189: // Chrome '-'
        PDFView.zoomOut();
        handled = true;
        break;
      case 48: // '0'
        PDFView.parseScale(kDefaultScale, true);
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
  var curElement = document.activeElement;
  if (curElement && curElement.tagName == 'INPUT')
    return;
  var controlsElement = document.getElementById('controls');
  while (curElement) {
    if (curElement === controlsElement)
      return; // ignoring if the 'controls' element is focused
    curElement = curElement.parentNode;
  }

  if (cmd == 0) { // no control key pressed at all.
    switch (evt.keyCode) {
      case 37: // left arrow
      case 75: // 'k'
      case 80: // 'p'
        PDFView.page--;
        handled = true;
        break;
      case 39: // right arrow
      case 74: // 'j'
      case 78: // 'n'
        PDFView.page++;
        handled = true;
        break;
    }
  }

  if (handled) {
    evt.preventDefault();
  }
});

window.addEventListener('beforeprint', function beforePrint(evt) {
  PDFView.beforePrint();
});

window.addEventListener('afterprint', function afterPrint(evt) {
  PDFView.afterPrint();
});
