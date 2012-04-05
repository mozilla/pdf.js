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
      data.shift().update();
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

var RenderingQueue = (function RenderingQueueClosure() {
  function RenderingQueue() {
    this.items = [];
  }

  RenderingQueue.prototype = {
    enqueueDraw: function RenderingQueueEnqueueDraw(item) {
      if (!item.drawingRequired())
        return; // as no redraw required, no need for queueing.

      this.items.push(item);
      if (this.items.length > 1)
        return; // not first item

      item.draw(this.continueExecution.bind(this));
    },
    continueExecution: function RenderingQueueContinueExecution() {
      var item = this.items.shift();

      if (this.items.length == 0)
        return; // queue is empty

      item = this.items[0];
      item.draw(this.continueExecution.bind(this));
    }
  };

  return RenderingQueue;
})();

var FirefoxCom = (function FirefoxComClosure() {
  return {
    /**
     * Creates an event that hopefully the extension is listening for and will
     * synchronously respond to.
     * @param {String} action The action to trigger.
     * @param {String} data Optional data to send.
     * @return {*} The response.
     */
    request: function(action, data) {
      var request = document.createTextNode('');
      request.setUserData('action', action, null);
      request.setUserData('data', data, null);
      document.documentElement.appendChild(request);

      var sender = document.createEvent('Events');
      sender.initEvent('pdf.js.message', true, false);
      request.dispatchEvent(sender);
      var response = request.getUserData('response');
      document.documentElement.removeChild(request);
      return response;
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
      database = FirefoxCom.request('getDatabase', null) || '{}';
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
        FirefoxCom.request('setDatabase', database);
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
var renderingQueue = new RenderingQueue();
var currentPageNumber = 1;

var PDFView = {
  pages: [],
  thumbnails: [],
  currentScale: kUnknownScale,
  currentScaleValue: null,
  initialBookmark: document.location.hash.substring(1),

  setScale: function pdfViewSetScale(val, resetAutoSettings) {
    if (val == this.currentScale)
      return;

    var pages = this.pages;
    for (var i = 0; i < pages.length; i++)
      pages[i].update(val * kCssUnits);

    if (this.currentScale != val)
      this.pages[this.page - 1].scrollIntoView();
    this.currentScale = val;

    var event = document.createEvent('UIEvents');
    event.initUIEvent('scalechange', false, false, window, 0);
    event.scale = val;
    event.resetAutoSettings = resetAutoSettings;
    window.dispatchEvent(event);
  },

  parseScale: function pdfViewParseScale(value, resetAutoSettings) {
    if ('custom' == value)
      return;

    var scale = parseFloat(value);
    this.currentScaleValue = value;
    if (scale) {
      this.setScale(scale, true);
      return;
    }

    var currentPage = this.pages[this.page - 1];
    var pageWidthScale = (window.innerWidth - kScrollbarPadding) /
                          currentPage.width / kCssUnits;
    var pageHeightScale = (window.innerHeight - kScrollbarPadding) /
                           currentPage.height / kCssUnits;
    if ('page-width' == value)
      this.setScale(pageWidthScale, resetAutoSettings);
    if ('page-height' == value)
      this.setScale(pageHeightScale, resetAutoSettings);
    if ('page-fit' == value) {
      this.setScale(
        Math.min(pageWidthScale, pageHeightScale), resetAutoSettings);
    }
    if ('auto' == value)
      this.setScale(Math.min(1.0, pageWidthScale), resetAutoSettings);

    selectScaleOption(value);
  },

  zoomIn: function pdfViewZoomIn() {
    var newScale = Math.min(kMaxScale, this.currentScale * kDefaultScaleDelta);
    this.parseScale(newScale, true);
  },

  zoomOut: function pdfViewZoomOut() {
    var newScale = Math.max(kMinScale, this.currentScale / kDefaultScaleDelta);
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

  open: function pdfViewOpen(url, scale) {
    this.url = url;

    document.title = decodeURIComponent(getFileName(url)) || url;

    if (!PDFView.loadingBar) {
      PDFView.loadingBar = new ProgressBar('#loadingBar', {});
    }

    var self = this;
    PDFJS.getPdf(
      {
        url: url,
        progress: function getPdfProgress(evt) {
          if (evt.lengthComputable)
            self.progress(evt.loaded / evt.total);
        },
        error: function getPdfError(e) {
          var loadingIndicator = document.getElementById('loading');
          loadingIndicator.textContent = 'Error';
          var moreInfo = {
            message: 'Unexpected server response of ' + e.target.status + '.'
          };
          self.error('An error occurred while loading the PDF.', moreInfo);
        }
      },
      function getPdfLoad(data) {
        self.loading = true;
        self.load(data, scale);
        self.loading = false;
      });
  },

  download: function pdfViewDownload() {
    var url = this.url.split('#')[0];
    if (PDFJS.isFirefoxExtension) {
      FirefoxCom.request('download', url);
    } else {
      url += '#pdfjs.action=download', '_parent';
      window.open(url, '_parent');
    }
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
    errorMoreInfo.value = 'PDF.JS Build: ' + PDFJS.build + '\n';

    if (moreInfo) {
      errorMoreInfo.value += 'Message: ' + moreInfo.message;
      if (moreInfo.stack) {
        errorMoreInfo.value += '\n' + 'Stack: ' + moreInfo.stack;
      } else {
        if (moreInfo.filename)
          errorMoreInfo.value += '\n' + 'File: ' + moreInfo.filename;
        if (moreInfo.lineNumber)
          errorMoreInfo.value += '\n' + 'Line: ' + moreInfo.lineNumber;
      }
    }
    errorMoreInfo.rows = errorMoreInfo.value.split('\n').length - 1;
  },

  progress: function pdfViewProgress(level) {
    var percent = Math.round(level * 100);
    var loadingIndicator = document.getElementById('loading');
    loadingIndicator.textContent = 'Loading... ' + percent + '%';

    PDFView.loadingBar.percent = percent;
  },

  load: function pdfViewLoad(data, scale) {
    function bindOnAfterDraw(pageView, thumbnailView) {
      // when page is painted, using the image as thumbnail base
      pageView.onAfterDraw = function pdfViewLoadOnAfterDraw() {
        thumbnailView.setImage(pageView.canvas);
        preDraw();
      };
    }

    var errorWrapper = document.getElementById('errorWrapper');
    errorWrapper.setAttribute('hidden', 'true');

    var loadingBox = document.getElementById('loadingBox');
    loadingBox.setAttribute('hidden', 'true');

    var sidebar = document.getElementById('sidebarView');
    sidebar.parentNode.scrollTop = 0;

    while (sidebar.hasChildNodes())
      sidebar.removeChild(sidebar.lastChild);

    if ('_loadingInterval' in sidebar)
      clearInterval(sidebar._loadingInterval);

    var container = document.getElementById('viewer');
    while (container.hasChildNodes())
      container.removeChild(container.lastChild);

    var pdf;
    try {
      pdf = new PDFJS.PDFDoc(data);
    } catch (e) {
      this.error('An error occurred while reading the PDF.', e);
    }
    var pagesCount = pdf.numPages;
    var id = pdf.fingerprint;
    var storedHash = null;
    document.getElementById('numPages').textContent = pagesCount;
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
    var pagesRefMap = {};
    var thumbnails = this.thumbnails = [];
    for (var i = 1; i <= pagesCount; i++) {
      var page = pdf.getPage(i);
      var pageView = new PageView(container, page, i, page.width, page.height,
                                  page.stats, this.navigateTo.bind(this));
      var thumbnailView = new ThumbnailView(sidebar, page, i,
                                            page.width / page.height);
      bindOnAfterDraw(pageView, thumbnailView);

      pages.push(pageView);
      thumbnails.push(thumbnailView);
      var pageRef = page.ref;
      pagesRefMap[pageRef.num + ' ' + pageRef.gen + ' R'] = i;
    }

    this.pagesRefMap = pagesRefMap;
    this.destinations = pdf.catalog.destinations;

    if (pdf.catalog.documentOutline) {
      this.outline = new DocumentOutlineView(pdf.catalog.documentOutline);
      var outlineSwitchButton = document.getElementById('outlineSwitch');
      outlineSwitchButton.removeAttribute('disabled');
      this.switchSidebarView('outline');
    }

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

    this.metadata = null;
    var metadata = pdf.catalog.metadata;
    var info = this.documentInfo = pdf.info;
    var pdfTitle;

    if (metadata) {
      this.metadata = metadata = new PDFJS.Metadata(metadata);

      if (metadata.has('dc:title'))
        pdfTitle = metadata.get('dc:title');
    }

    if (!pdfTitle && info && info['Title'])
      pdfTitle = info['Title'];

    if (pdfTitle)
      document.title = pdfTitle;
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
    var thumbsScrollView = document.getElementById('sidebarScrollView');
    var outlineScrollView = document.getElementById('outlineScrollView');
    var thumbsSwitchButton = document.getElementById('thumbsSwitch');
    var outlineSwitchButton = document.getElementById('outlineSwitch');
    switch (view) {
      case 'thumbs':
        thumbsScrollView.removeAttribute('hidden');
        outlineScrollView.setAttribute('hidden', 'true');
        thumbsSwitchButton.setAttribute('data-selected', true);
        outlineSwitchButton.removeAttribute('data-selected');
        updateThumbViewArea();
        break;
      case 'outline':
        thumbsScrollView.setAttribute('hidden', 'true');
        outlineScrollView.removeAttribute('hidden');
        thumbsSwitchButton.removeAttribute('data-selected');
        outlineSwitchButton.setAttribute('data-selected', true);
        break;
    }
  },

  pinSidebar: function pdfViewPinSidebar() {
    document.getElementById('sidebar').classList.toggle('pinned');
  },

  getVisiblePages: function pdfViewGetVisiblePages() {
    var pages = this.pages;
    var kBottomMargin = 10;
    var visiblePages = [];

    var currentHeight = kBottomMargin;
    var windowTop = window.pageYOffset;
    for (var i = 1; i <= pages.length; ++i) {
      var page = pages[i - 1];
      var pageHeight = page.height * page.scale + kBottomMargin;
      if (currentHeight + pageHeight > windowTop)
        break;

      currentHeight += pageHeight;
    }

    var windowBottom = window.pageYOffset + window.innerHeight;
    for (; i <= pages.length && currentHeight < windowBottom; ++i) {
      var singlePage = pages[i - 1];
      visiblePages.push({ id: singlePage.id, y: currentHeight,
                          view: singlePage });
      currentHeight += singlePage.height * singlePage.scale + kBottomMargin;
    }
    return visiblePages;
  },

  getVisibleThumbs: function pdfViewGetVisibleThumbs() {
    var thumbs = this.thumbnails;
    var kBottomMargin = 5;
    var visibleThumbs = [];

    var view = document.getElementById('sidebarScrollView');
    var currentHeight = kBottomMargin;
    var top = view.scrollTop;
    for (var i = 1; i <= thumbs.length; ++i) {
      var thumb = thumbs[i - 1];
      var thumbHeight = thumb.height * thumb.scaleY + kBottomMargin;
      if (currentHeight + thumbHeight > top)
        break;

      currentHeight += thumbHeight;
    }

    var bottom = top + view.clientHeight;
    for (; i <= thumbs.length && currentHeight < bottom; ++i) {
      var singleThumb = thumbs[i - 1];
      visibleThumbs.push({ id: singleThumb.id, y: currentHeight,
                          view: singleThumb });
      currentHeight += singleThumb.height * singleThumb.scaleY + kBottomMargin;
    }

    return visibleThumbs;
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
  }
};

var PageView = function pageView(container, content, id, pageWidth, pageHeight,
                                 stats, navigateTo) {
  this.id = id;
  this.content = content;

  var view = this.content.view;
  this.x = view.x;
  this.y = view.y;
  this.width = view.width;
  this.height = view.height;

  var anchor = document.createElement('a');
  anchor.name = '' + this.id;

  var div = document.createElement('div');
  div.id = 'pageContainer' + this.id;
  div.className = 'page';

  container.appendChild(anchor);
  container.appendChild(div);

  this.update = function pageViewUpdate(scale) {
    this.scale = scale || this.scale;
    div.style.width = (this.width * this.scale) + 'px';
    div.style.height = (this.height * this.scale) + 'px';

    while (div.hasChildNodes())
      div.removeChild(div.lastChild);
    div.removeAttribute('data-loaded');

    delete this.canvas;

    this.loadingIconDiv = document.createElement('div');
    this.loadingIconDiv.className = 'loadingIcon';
    div.appendChild(this.loadingIconDiv);
  };

  function setupAnnotations(content, scale) {
    function bindLink(link, dest) {
      link.href = PDFView.getDestinationHash(dest);
      link.onclick = function pageViewSetupLinksOnclick() {
        if (dest)
          PDFView.navigateTo(dest);
        return false;
      };
    }
    function createElementWithStyle(tagName, item) {
      var element = document.createElement(tagName);
      element.style.left = (Math.floor(item.x - view.x) * scale) + 'px';
      element.style.top = (Math.floor(item.y - view.y) * scale) + 'px';
      element.style.width = Math.ceil(item.width * scale) + 'px';
      element.style.height = Math.ceil(item.height * scale) + 'px';
      return element;
    }
    function createCommentAnnotation(type, item) {
      var container = document.createElement('section');
      container.className = 'annotComment';

      var image = createElementWithStyle('img', item);
      image.src = kImageDirectory + type.toLowerCase() + '.svg';
      var content = document.createElement('div');
      content.setAttribute('hidden', true);
      var title = document.createElement('h1');
      var text = document.createElement('p');
      var offsetPos = Math.floor(item.x - view.x + item.width);
      content.style.left = (offsetPos * scale) + 'px';
      content.style.top = (Math.floor(item.y - view.y) * scale) + 'px';
      title.textContent = item.title;

      if (!item.content) {
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
           this.nextSibling.removeAttribute('hidden');
        }, false);

        image.addEventListener('mouseout', function annotationImageOut() {
           this.nextSibling.setAttribute('hidden', true);
        }, false);
      }

      content.appendChild(title);
      content.appendChild(text);
      container.appendChild(image);
      container.appendChild(content);

      return container;
    }

    var items = content.getAnnotations();
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
      }
    }
  }

  this.getPagePoint = function pageViewGetPagePoint(x, y) {
    var scale = PDFView.currentScale;
    return this.content.rotatePoint(x / scale, y / scale);
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
          widthScale = (window.innerWidth - kScrollbarPadding) /
            width / kCssUnits;
          heightScale = (window.innerHeight - kScrollbarPadding) /
            height / kCssUnits;
          scale = Math.min(widthScale, heightScale);
          break;
        default:
          return;
      }

      var boundingRect = [
        this.content.rotatePoint(x, y),
        this.content.rotatePoint(x + width, y + height)
      ];

      if (scale && scale !== PDFView.currentScale)
        PDFView.parseScale(scale, true);
      else if (PDFView.currentScale === kUnknownScale)
        PDFView.parseScale(kDefaultScale, true);

      setTimeout(function pageViewScrollIntoViewRelayout() {
        // letting page to re-layout before scrolling
        var scale = PDFView.currentScale;
        var x = Math.min(boundingRect[0].x, boundingRect[1].x);
        var y = Math.min(boundingRect[0].y, boundingRect[1].y);
        var width = Math.abs(boundingRect[0].x - boundingRect[1].x);
        var height = Math.abs(boundingRect[0].y - boundingRect[1].y);

        // using temporary div to scroll it into view
        var tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = Math.floor(x * scale) + 'px';
        tempDiv.style.top = Math.floor(y * scale) + 'px';
        tempDiv.style.width = Math.ceil(width * scale) + 'px';
        tempDiv.style.height = Math.ceil(height * scale) + 'px';
        div.appendChild(tempDiv);
        tempDiv.scrollIntoView(true);
        div.removeChild(tempDiv);
      }, 0);
  };

  this.drawingRequired = function() {
    return !div.querySelector('canvas');
  };

  this.draw = function pageviewDraw(callback) {
    if (!this.drawingRequired()) {
      this.updateStats();
      callback();
      return;
    }

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

    var scale = this.scale;
    canvas.width = pageWidth * scale;
    canvas.height = pageHeight * scale;

    var ctx = canvas.getContext('2d');
    ctx.save();
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.translate(-this.x * scale, -this.y * scale);

    // Rendering area

    var self = this;
    this.content.startRendering(ctx, function pageViewDrawCallback(error) {
      if (self.loadingIconDiv) {
        div.removeChild(self.loadingIconDiv);
        delete self.loadingIconDiv;
      }

      if (error)
        PDFView.error('An error occurred while rendering the page.', error);

      self.stats = content.stats;
      self.updateStats();
      if (self.onAfterDraw)
        self.onAfterDraw();

      cache.push(self);
      callback();
    }, textLayer);

    setupAnnotations(this.content, this.scale);
    div.setAttribute('data-loaded', true);
  };

  this.updateStats = function pageViewUpdateStats() {
    if (PDFJS.pdfBug && Stats.enabled) {
      var stats = this.stats;
      Stats.add(this.id, stats);
    }
  };
};

var ThumbnailView = function thumbnailView(container, page, id, pageRatio) {
  var anchor = document.createElement('a');
  anchor.href = PDFView.getAnchorUrl('#page=' + id);
  anchor.onclick = function stopNivigation() {
    PDFView.page = id;
    return false;
  };

  var view = page.view;
  this.width = view.width;
  this.height = view.height;
  this.id = id;

  var maxThumbSize = 134;
  var canvasWidth = pageRatio >= 1 ? maxThumbSize :
    maxThumbSize * pageRatio;
  var canvasHeight = pageRatio <= 1 ? maxThumbSize :
    maxThumbSize / pageRatio;
  var scaleX = this.scaleX = (canvasWidth / this.width);
  var scaleY = this.scaleY = (canvasHeight / this.height);

  var div = document.createElement('div');
  div.id = 'thumbnailContainer' + id;
  div.className = 'thumbnail';

  anchor.appendChild(div);
  container.appendChild(anchor);

  this.hasImage = false;

  function getPageDrawContext() {
    var canvas = document.createElement('canvas');
    canvas.id = 'thumbnail' + id;
    canvas.mozOpaque = true;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    div.setAttribute('data-loaded', true);
    div.appendChild(canvas);

    var ctx = canvas.getContext('2d');
    ctx.save();
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    var view = page.view;
    ctx.translate(-view.x * scaleX, -view.y * scaleY);
    div.style.width = (view.width * scaleX) + 'px';
    div.style.height = (view.height * scaleY) + 'px';
    div.style.lineHeight = (view.height * scaleY) + 'px';

    return ctx;
  }

  this.drawingRequired = function thumbnailViewDrawingRequired() {
    return !this.hasImage;
  };

  this.draw = function thumbnailViewDraw(callback) {
    if (this.hasImage) {
      callback();
      return;
    }

    var ctx = getPageDrawContext();
    page.startRendering(ctx, function thumbnailViewDrawStartRendering() {
      callback();
    });

    this.hasImage = true;
  };

  this.setImage = function thumbnailViewSetImage(img) {
    if (this.hasImage || !img)
      return;

    var ctx = getPageDrawContext();
    ctx.drawImage(img, 0, 0, img.width, img.height,
                  0, 0, ctx.canvas.width, ctx.canvas.height);

    this.hasImage = true;
  };
};

var DocumentOutlineView = function documentOutlineView(outline) {
  var outlineView = document.getElementById('outlineView');

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
  var params = PDFView.parseQueryString(document.location.search.substring(1));

  var file = PDFJS.isFirefoxExtension ?
              window.location.toString() : params.file || kDefaultURL;
  PDFView.open(file, 0);

  if (PDFJS.isFirefoxExtension || !window.File || !window.FileReader ||
      !window.FileList || !window.Blob) {
    document.getElementById('fileInput').setAttribute('hidden', 'true');
    document.getElementById('fileInputSeperator')
                              .setAttribute('hidden', 'true');
  } else {
    document.getElementById('fileInput').value = null;
  }

  // Special debugging flags in the hash section of the URL.
  var hash = document.location.hash.substring(1);
  var hashParams = PDFView.parseQueryString(hash);

  if ('disableWorker' in hashParams)
    PDFJS.disableWorker = (hashParams['disableWorker'] === 'true');

  if ('disableTextLayer' in hashParams)
    PDFJS.disableTextLayer = (hashParams['disableTextLayer'] === 'true');

  if ('pdfBug' in hashParams &&
      (!PDFJS.isFirefoxExtension || FirefoxCom.request('pdfBugEnabled'))) {
    PDFJS.pdfBug = true;
    var pdfBug = hashParams['pdfBug'];
    var enabled = pdfBug.split(',');
    PDFBug.enable(enabled);
    PDFBug.init();
  }

  var sidebarScrollView = document.getElementById('sidebarScrollView');
  sidebarScrollView.addEventListener('scroll', updateThumbViewArea, true);
}, true);

/**
 * Render the next not yet visible page already such that it is
 * hopefully ready once the user scrolls to it.
 */
function preDraw() {
  var pages = PDFView.pages;
  var visible = PDFView.getVisiblePages();
  var last = visible[visible.length - 1];
  // PageView.id is the actual page number, which is + 1 compared
  // to the index in `pages`. That means, pages[last.id] is the next
  // PageView instance.
  if (pages[last.id] && pages[last.id].drawingRequired()) {
    renderingQueue.enqueueDraw(pages[last.id]);
    return;
  }
  // If there is nothing to draw on the next page, maybe the user
  // is scrolling up, so, let's try to render the next page *before*
  // the first visible page
  if (pages[visible[0].id - 2]) {
    renderingQueue.enqueueDraw(pages[visible[0].id - 2]);
  }
}

function updateViewarea() {
  var visiblePages = PDFView.getVisiblePages();
  var pageToDraw;
  for (var i = 0; i < visiblePages.length; i++) {
    var page = visiblePages[i];
    var pageObj = PDFView.pages[page.id - 1];

    pageToDraw |= pageObj.drawingRequired();
    renderingQueue.enqueueDraw(pageObj);
  }

  if (!visiblePages.length)
    return;

  // If there is no need to draw a page that is currenlty visible, preDraw the
  // next page the user might scroll to.
  if (!pageToDraw) {
    preDraw();
  }

  updateViewarea.inProgress = true; // used in "set page"
  var currentId = PDFView.page;
  var firstPage = visiblePages[0];
  PDFView.page = firstPage.id;
  updateViewarea.inProgress = false;

  var currentScale = PDFView.currentScale;
  var currentScaleValue = PDFView.currentScaleValue;
  var normalizedScaleValue = currentScaleValue == currentScale ?
    currentScale * 100 : currentScaleValue;

  var kViewerTopMargin = 52;
  var pageNumber = firstPage.id;
  var pdfOpenParams = '#page=' + pageNumber;
  pdfOpenParams += '&zoom=' + normalizedScaleValue;
  var currentPage = PDFView.pages[pageNumber - 1];
  var topLeft = currentPage.getPagePoint(window.pageXOffset,
    window.pageYOffset - firstPage.y - kViewerTopMargin);
  pdfOpenParams += ',' + Math.round(topLeft.x) + ',' + Math.round(topLeft.y);

  var store = PDFView.store;
  store.set('exists', true);
  store.set('page', pageNumber);
  store.set('zoom', normalizedScaleValue);
  store.set('scrollLeft', Math.round(topLeft.x));
  store.set('scrollTop', Math.round(topLeft.y));
  var href = PDFView.getAnchorUrl(pdfOpenParams);
  document.getElementById('viewBookmark').href = href;
}

window.addEventListener('scroll', function webViewerScroll(evt) {
  updateViewarea();
}, true);

var thumbnailTimer;

function updateThumbViewArea() {
  // Only render thumbs after pausing scrolling for this amount of time
  // (makes UI more responsive)
  var delay = 50; // in ms

  if (thumbnailTimer)
    clearTimeout(thumbnailTimer);

  thumbnailTimer = setTimeout(function() {
    var visibleThumbs = PDFView.getVisibleThumbs();
    for (var i = 0; i < visibleThumbs.length; i++) {
      var thumb = visibleThumbs[i];
      renderingQueue.enqueueDraw(PDFView.thumbnails[thumb.id - 1]);
    }
  }, delay);
}

window.addEventListener('transitionend', updateThumbViewArea, true);
window.addEventListener('webkitTransitionEnd', updateThumbViewArea, true);

window.addEventListener('resize', function webViewerResize(evt) {
  if (document.getElementById('pageWidthOption').selected ||
      document.getElementById('pageFitOption').selected ||
      document.getElementById('pageAutoOption').selected)
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
    PDFView.load(uint8Array);
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
  if (document.getElementById('pageNumber').value != page)
    document.getElementById('pageNumber').value = page;
  document.getElementById('previous').disabled = (page <= 1);
  document.getElementById('next').disabled = (page >= PDFView.pages.length);
}, true);

window.addEventListener('keydown', function keydown(evt) {
  if (evt.ctrlKey || evt.altKey || evt.shiftKey || evt.metaKey)
    return;
  var curElement = document.activeElement;
  if (curElement && curElement.tagName == 'INPUT')
    return;
  var controlsElement = document.getElementById('controls');
  while (curElement) {
    if (curElement === controlsElement)
      return; // ignoring if the 'controls' element is focused
    curElement = curElement.parentNode;
  }
  var handled = false;
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

  if (handled) {
    evt.preventDefault();
  }
});
