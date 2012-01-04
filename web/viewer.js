/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var kDefaultURL = 'compressed.tracemonkey-pldi-09.pdf';
var kDefaultScale = 'auto';
var kDefaultScaleDelta = 1.1;
var kCacheSize = 20;
var kCssUnits = 96.0 / 72.0;
var kScrollbarPadding = 40;
var kMinScale = 0.25;
var kMaxScale = 4.0;
var kImageDirectory = './images/';
var kSettingsMemory = 20;

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

var RenderingQueue = (function RenderingQueueClosure() {
  function RenderingQueue() {
    this.items = [];
  }

  RenderingQueue.prototype = {
    enqueueDraw: function RenderingQueueEnqueueDraw(item) {
      if ('rendering' in item)
        return; // is already in the queue

      item.rendering = true;
      this.items.push(item);
      if (this.items.length > 1)
        return; // not first item

      item.draw(this.continueExecution.bind(this));
    },
    continueExecution: function RenderingQueueContinueExecution() {
      var item = this.items.shift();
      delete item.rendering;

      if (this.items.length == 0)
        return; // queue is empty

      item = this.items[0];
      item.draw(this.continueExecution.bind(this));
    }
  };

  return RenderingQueue;
})();

// Settings Manager - This is a utility for saving settings
// First we see if localStorage is available, FF bug #495747
// If not, we use FUEL in FF
var Settings = (function SettingsClosure() {
  var isLocalStorageEnabled = (function localStorageEnabledTest() {
    try {
      localStorage;
    } catch (e) {
      return false;
    }
    return true;
  })();
  var extPrefix = 'extensions.uriloader@pdf.js';
  var isExtension = location.protocol == 'chrome:' && !isLocalStorageEnabled;
  var inPrivateBrowsing = false;
  if (isExtension) {
    var pbs = Components.classes['@mozilla.org/privatebrowsing;1']
              .getService(Components.interfaces.nsIPrivateBrowsingService);
    inPrivateBrowsing = pbs.privateBrowsingEnabled;
  }

  function Settings(fingerprint) {
    var database = null;
    var index;
    if (inPrivateBrowsing)
      return false;
    else if (isExtension)
      database = Application.prefs.getValue(extPrefix + '.database', '{}');
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
    if (isExtension)
      Application.prefs.setValue(extPrefix + '.database',
          JSON.stringify(database));
    else if (isLocalStorageEnabled)
      localStorage.setItem('database', JSON.stringify(database));
  }

  Settings.prototype = {
    set: function settingsSet(name, val) {
      if (inPrivateBrowsing)
        return false;
      var file = this.file;
      file[name] = val;
      if (isExtension)
        Application.prefs.setValue(extPrefix + '.database',
            JSON.stringify(this.database));
      else if (isLocalStorageEnabled)
        localStorage.setItem('database', JSON.stringify(this.database));
    },

    get: function settingsGet(name, defaultValue) {
      if (inPrivateBrowsing)
        return defaultValue;
      else
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
  currentScale: 0,
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
    this.setScale(newScale, true);
  },

  zoomOut: function pdfViewZoomOut() {
    var newScale = Math.max(kMinScale, this.currentScale / kDefaultScaleDelta);
    this.setScale(newScale, true);
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
    document.title = this.url = url;

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
          loadingIndicator.innerHTML = 'Error';
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
    window.open(this.url + '#pdfjs.action=download', '_parent');
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
      return '#' + escape(dest);
    if (dest instanceof Array) {
      var destRef = dest[0]; // see navigateTo method for dest format
      var pageNumber = destRef instanceof Object ?
        this.pagesRefMap[destRef.num + ' ' + destRef.gen + ' R'] :
        (destRef + 1);
      if (pageNumber) {
        var pdfOpenParams = '#page=' + pageNumber;
        var destKind = dest[1];
        if ('name' in destKind && destKind.name == 'XYZ') {
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
    errorMessage.innerHTML = message;

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
    errorMoreInfo.innerHTML = 'PDF.JS Build: ' + PDFJS.build + '\n';

    if (moreInfo) {
      errorMoreInfo.innerHTML += 'Message: ' + moreInfo.message;
      if (moreInfo.stack)
        errorMoreInfo.innerHTML += '\n' + 'Stack: ' + moreInfo.stack;
    }
  },

  progress: function pdfViewProgress(level) {
    var percent = Math.round(level * 100);
    var loadingIndicator = document.getElementById('loading');
    loadingIndicator.innerHTML = 'Loading... ' + percent + '%';
  },

  load: function pdfViewLoad(data, scale) {
    function bindOnAfterDraw(pageView, thumbnailView) {
      // when page is painted, using the image as thumbnail base
      pageView.onAfterDraw = function pdfViewLoadOnAfterDraw() {
        thumbnailView.setImage(pageView.canvas);
      };
    }

    var errorWrapper = document.getElementById('errorWrapper');
    errorWrapper.setAttribute('hidden', 'true');

    var loadingIndicator = document.getElementById('loading');
    loadingIndicator.setAttribute('hidden', 'true');

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
    document.getElementById('numPages').innerHTML = pagesCount;
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
    else {
      this.parseScale(scale || kDefaultScale, true);
      this.page = 1;
    }
  },

  setHash: function pdfViewSetHash(hash) {
    if (!hash)
      return;

    if (hash.indexOf('=') >= 0) {
      // parsing query string
      var paramsPairs = hash.split('&');
      var params = {};
      for (var i = 0; i < paramsPairs.length; ++i) {
        var paramPair = paramsPairs[i].split('=');
        params[paramPair[0]] = paramPair[1];
      }
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
        text.innerHTML = item.content.replace('\n', '<br />');
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

  this.draw = function pageviewDraw(callback) {
    if (div.hasChildNodes()) {
      this.updateStats();
      callback();
      return;
    }

    var canvas = document.createElement('canvas');
    canvas.id = 'page' + this.id;
    canvas.mozOpaque = true;
    div.appendChild(canvas);
    this.canvas = canvas;

    var textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    div.appendChild(textLayer);

    var scale = this.scale;
    canvas.width = pageWidth * scale;
    canvas.height = pageHeight * scale;

    var ctx = canvas.getContext('2d');
    ctx.save();
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.translate(-this.x * scale, -this.y * scale);

    stats.begin = Date.now();
    this.content.startRendering(ctx,
      (function pageViewDrawCallback(error) {
        if (error)
          PDFView.error('An error occurred while rendering the page.', error);
        this.updateStats();
        if (this.onAfterDraw)
          this.onAfterDraw();

        cache.push(this);
        callback();
      }).bind(this), textLayer
    );

    setupAnnotations(this.content, this.scale);
    div.setAttribute('data-loaded', true);
  };

  this.updateStats = function pageViewUpdateStats() {
    var t1 = stats.compile, t2 = stats.fonts, t3 = stats.render;
    var str = 'Time to compile/fonts/render: ' +
              (t1 - stats.begin) + '/' + (t2 - t1) + '/' + (t3 - t2) + ' ms';
    document.getElementById('info').innerHTML = str;
  };
};

var ThumbnailView = function thumbnailView(container, page, id, pageRatio) {
  var anchor = document.createElement('a');
  anchor.href = '#' + id;
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
    if (this.hasImage)
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

window.addEventListener('load', function webViewerLoad(evt) {
  var params = document.location.search.substring(1).split('&');
  for (var i = 0; i < params.length; i++) {
    var param = params[i].split('=');
    params[unescape(param[0])] = unescape(param[1]);
  }

  var scale = ('scale' in params) ? params.scale : 0;
  PDFView.open(params.file || kDefaultURL, parseFloat(scale));

  if (!window.File || !window.FileReader || !window.FileList || !window.Blob)
    document.getElementById('fileInput').setAttribute('hidden', 'true');
  else
    document.getElementById('fileInput').value = null;

  if ('disableWorker' in params)
    PDFJS.disableWorker = params['disableWorker'] === 'true' ? true : false;

  var sidebarScrollView = document.getElementById('sidebarScrollView');
  sidebarScrollView.addEventListener('scroll', updateThumbViewArea, true);
}, true);

window.addEventListener('unload', function webViewerUnload(evt) {
  window.scrollTo(0, 0);
}, true);

function updateViewarea() {
  var visiblePages = PDFView.getVisiblePages();
  for (var i = 0; i < visiblePages.length; i++) {
    var page = visiblePages[i];
    renderingQueue.enqueueDraw(PDFView.pages[page.id - 1]);
  }

  if (!visiblePages.length)
    return;

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

  document.getElementById('viewBookmark').href = pdfOpenParams;
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
      PDFView.setScale(kDefaultScale, true);
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
