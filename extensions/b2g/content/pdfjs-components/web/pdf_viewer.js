/* Copyright 2014 Mozilla Foundation
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
/* jshint globalstrict: false */
/* umdutils ignore */

(function (root, factory) {
  'use strict';
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-dist/web/pdf_viewer', ['exports', 'pdfjs-dist/build/pdf'],
      factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('../build/pdf.js'));
  } else {
    factory((root.pdfjsDistWebPDFViewer = {}), root.pdfjsDistBuildPdf);
  }
}(this, function (exports, pdfjsLib) {
  'use strict';

  var pdfViewerLibs = {
    pdfjsWebPDFJS: pdfjsLib
  };

  (function () {


(function (root, factory) {
  {
    factory((root.pdfjsWebPDFRenderingQueue = {}));
  }
}(this, function (exports) {

var CLEANUP_TIMEOUT = 30000;

var RenderingStates = {
  INITIAL: 0,
  RUNNING: 1,
  PAUSED: 2,
  FINISHED: 3
};

/**
 * Controls rendering of the views for pages and thumbnails.
 * @class
 */
var PDFRenderingQueue = (function PDFRenderingQueueClosure() {
  /**
   * @constructs
   */
  function PDFRenderingQueue() {
    this.pdfViewer = null;
    this.pdfThumbnailViewer = null;
    this.onIdle = null;

    this.highestPriorityPage = null;
    this.idleTimeout = null;
    this.printing = false;
    this.isThumbnailViewEnabled = false;
  }

  PDFRenderingQueue.prototype = /** @lends PDFRenderingQueue.prototype */ {
    /**
     * @param {PDFViewer} pdfViewer
     */
    setViewer: function PDFRenderingQueue_setViewer(pdfViewer) {
      this.pdfViewer = pdfViewer;
    },

    /**
     * @param {PDFThumbnailViewer} pdfThumbnailViewer
     */
    setThumbnailViewer:
        function PDFRenderingQueue_setThumbnailViewer(pdfThumbnailViewer) {
      this.pdfThumbnailViewer = pdfThumbnailViewer;
    },

    /**
     * @param {IRenderableView} view
     * @returns {boolean}
     */
    isHighestPriority: function PDFRenderingQueue_isHighestPriority(view) {
      return this.highestPriorityPage === view.renderingId;
    },

    renderHighestPriority: function
        PDFRenderingQueue_renderHighestPriority(currentlyVisiblePages) {
      if (this.idleTimeout) {
        clearTimeout(this.idleTimeout);
        this.idleTimeout = null;
      }

      // Pages have a higher priority than thumbnails, so check them first.
      if (this.pdfViewer.forceRendering(currentlyVisiblePages)) {
        return;
      }
      // No pages needed rendering so check thumbnails.
      if (this.pdfThumbnailViewer && this.isThumbnailViewEnabled) {
        if (this.pdfThumbnailViewer.forceRendering()) {
          return;
        }
      }

      if (this.printing) {
        // If printing is currently ongoing do not reschedule cleanup.
        return;
      }

      if (this.onIdle) {
        this.idleTimeout = setTimeout(this.onIdle.bind(this), CLEANUP_TIMEOUT);
      }
    },

    getHighestPriority: function
        PDFRenderingQueue_getHighestPriority(visible, views, scrolledDown) {
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
        if (!this.isViewFinished(view)) {
          return view;
        }
      }

      // All the visible views have rendered, try to render next/previous pages.
      if (scrolledDown) {
        var nextPageIndex = visible.last.id;
        // ID's start at 1 so no need to add 1.
        if (views[nextPageIndex] &&
            !this.isViewFinished(views[nextPageIndex])) {
          return views[nextPageIndex];
        }
      } else {
        var previousPageIndex = visible.first.id - 2;
        if (views[previousPageIndex] &&
          !this.isViewFinished(views[previousPageIndex])) {
          return views[previousPageIndex];
        }
      }
      // Everything that needs to be rendered has been.
      return null;
    },

    /**
     * @param {IRenderableView} view
     * @returns {boolean}
     */
    isViewFinished: function PDFRenderingQueue_isViewFinished(view) {
      return view.renderingState === RenderingStates.FINISHED;
    },

    /**
     * Render a page or thumbnail view. This calls the appropriate function
     * based on the views state. If the view is already rendered it will return
     * false.
     * @param {IRenderableView} view
     */
    renderView: function PDFRenderingQueue_renderView(view) {
      var state = view.renderingState;
      switch (state) {
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
          var continueRendering = function () {
            this.renderHighestPriority();
          }.bind(this);
          view.draw().then(continueRendering, continueRendering);
          break;
      }
      return true;
    },
  };

  return PDFRenderingQueue;
})();

exports.RenderingStates = RenderingStates;
exports.PDFRenderingQueue = PDFRenderingQueue;
}));


(function (root, factory) {
  {
    factory((root.pdfjsWebDownloadManager = {}), root.pdfjsWebPDFJS);
  }
}(this, function (exports, pdfjsLib) {
  function download(blobUrl, filename) {
    var a = document.createElement('a');
    if (a.click) {
      // Use a.click() if available. Otherwise, Chrome might show
      // "Unsafe JavaScript attempt to initiate a navigation change
      //  for frame with URL" and not open the PDF at all.
      // Supported by (not mentioned = untested):
      // - Firefox 6 - 19 (4- does not support a.click, 5 ignores a.click)
      // - Chrome 19 - 26 (18- does not support a.click)
      // - Opera 9 - 12.15
      // - Internet Explorer 6 - 10
      // - Safari 6 (5.1- does not support a.click)
      a.href = blobUrl;
      a.target = '_parent';
      // Use a.download if available. This increases the likelihood that
      // the file is downloaded instead of opened by another PDF plugin.
      if ('download' in a) {
        a.download = filename;
      }
      // <a> must be in the document for IE and recent Firefox versions.
      // (otherwise .click() is ignored)
      (document.body || document.documentElement).appendChild(a);
      a.click();
      a.parentNode.removeChild(a);
    } else {
      if (window.top === window &&
          blobUrl.split('#')[0] === window.location.href.split('#')[0]) {
        // If _parent == self, then opening an identical URL with different
        // location hash will only cause a navigation, not a download.
        var padCharacter = blobUrl.indexOf('?') === -1 ? '?' : '&';
        blobUrl = blobUrl.replace(/#|$/, padCharacter + '$&');
      }
      window.open(blobUrl, '_parent');
    }
  }

  function DownloadManager() {}

  DownloadManager.prototype = {
    downloadUrl: function DownloadManager_downloadUrl(url, filename) {
      if (!pdfjsLib.isValidUrl(url, true)) {
        return; // restricted/invalid URL
      }

      download(url + '#pdfjs.action=download', filename);
    },

    downloadData: function DownloadManager_downloadData(data, filename,
                                                        contentType) {
      if (navigator.msSaveBlob) { // IE10 and above
        return navigator.msSaveBlob(new Blob([data], { type: contentType }),
                                    filename);
      }

      var blobUrl = pdfjsLib.createObjectURL(data, contentType,
        pdfjsLib.PDFJS.disableCreateObjectURL);
      download(blobUrl, filename);
    },

    download: function DownloadManager_download(blob, url, filename) {
      if (!URL) {
        // URL.createObjectURL is not supported
        this.downloadUrl(url, filename);
        return;
      }

      if (navigator.msSaveBlob) {
        // IE10 / IE11
        if (!navigator.msSaveBlob(blob, filename)) {
          this.downloadUrl(url, filename);
        }
        return;
      }

      var blobUrl = URL.createObjectURL(blob);
      download(blobUrl, filename);
    }
  };

  exports.DownloadManager = DownloadManager;
}));


(function (root, factory) {
  {
    factory((root.pdfjsWebUIUtils = {}), root.pdfjsWebPDFJS);
  }
}(this, function (exports, pdfjsLib) {

var CSS_UNITS = 96.0 / 72.0;
var DEFAULT_SCALE_VALUE = 'auto';
var DEFAULT_SCALE = 1.0;
var UNKNOWN_SCALE = 0;
var MAX_AUTO_SCALE = 1.25;
var SCROLLBAR_PADDING = 40;
var VERTICAL_PADDING = 5;

var mozL10n = document.mozL10n || document.webL10n;

var PDFJS = pdfjsLib.PDFJS;

/**
 * Disables fullscreen support, and by extension Presentation Mode,
 * in browsers which support the fullscreen API.
 * @var {boolean}
 */
PDFJS.disableFullscreen = (PDFJS.disableFullscreen === undefined ?
                           false : PDFJS.disableFullscreen);

/**
 * Enables CSS only zooming.
 * @var {boolean}
 */
PDFJS.useOnlyCssZoom = (PDFJS.useOnlyCssZoom === undefined ?
                        false : PDFJS.useOnlyCssZoom);

/**
 * The maximum supported canvas size in total pixels e.g. width * height.
 * The default value is 4096 * 4096. Use -1 for no limit.
 * @var {number}
 */
PDFJS.maxCanvasPixels = (PDFJS.maxCanvasPixels === undefined ?
                         16777216 : PDFJS.maxCanvasPixels);

/**
 * Disables saving of the last position of the viewed PDF.
 * @var {boolean}
 */
PDFJS.disableHistory = (PDFJS.disableHistory === undefined ?
                        false : PDFJS.disableHistory);

/**
 * Disables creation of the text layer that used for text selection and search.
 * @var {boolean}
 */
PDFJS.disableTextLayer = (PDFJS.disableTextLayer === undefined ?
                          false : PDFJS.disableTextLayer);

/**
 * Disables maintaining the current position in the document when zooming.
 */
PDFJS.ignoreCurrentPositionOnZoom = (PDFJS.ignoreCurrentPositionOnZoom ===
  undefined ? false : PDFJS.ignoreCurrentPositionOnZoom);

/**
 * Interface locale settings.
 * @var {string}
 */
PDFJS.locale = (PDFJS.locale === undefined ? navigator.language : PDFJS.locale);

/**
 * Returns scale factor for the canvas. It makes sense for the HiDPI displays.
 * @return {Object} The object with horizontal (sx) and vertical (sy)
                    scales. The scaled property is set to false if scaling is
                    not required, true otherwise.
 */
function getOutputScale(ctx) {
  var devicePixelRatio = window.devicePixelRatio || 1;
  var backingStoreRatio = ctx.webkitBackingStorePixelRatio ||
                          ctx.mozBackingStorePixelRatio ||
                          ctx.msBackingStorePixelRatio ||
                          ctx.oBackingStorePixelRatio ||
                          ctx.backingStorePixelRatio || 1;
  var pixelRatio = devicePixelRatio / backingStoreRatio;
  return {
    sx: pixelRatio,
    sy: pixelRatio,
    scaled: pixelRatio !== 1
  };
}

/**
 * Scrolls specified element into view of its parent.
 * @param {Object} element - The element to be visible.
 * @param {Object} spot - An object with optional top and left properties,
 *   specifying the offset from the top left edge.
 * @param {boolean} skipOverflowHiddenElements - Ignore elements that have
 *   the CSS rule `overflow: hidden;` set. The default is false.
 */
function scrollIntoView(element, spot, skipOverflowHiddenElements) {
  // Assuming offsetParent is available (it's not available when viewer is in
  // hidden iframe or object). We have to scroll: if the offsetParent is not set
  // producing the error. See also animationStartedClosure.
  var parent = element.offsetParent;
  if (!parent) {
    console.error('offsetParent is not set -- cannot scroll');
    return;
  }
  var checkOverflow = skipOverflowHiddenElements || false;
  var offsetY = element.offsetTop + element.clientTop;
  var offsetX = element.offsetLeft + element.clientLeft;
  while (parent.clientHeight === parent.scrollHeight ||
         (checkOverflow && getComputedStyle(parent).overflow === 'hidden')) {
    if (parent.dataset._scaleY) {
      offsetY /= parent.dataset._scaleY;
      offsetX /= parent.dataset._scaleX;
    }
    offsetY += parent.offsetTop;
    offsetX += parent.offsetLeft;
    parent = parent.offsetParent;
    if (!parent) {
      return; // no need to scroll
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

/**
 * Helper function to start monitoring the scroll event and converting them into
 * PDF.js friendly one: with scroll debounce and scroll direction.
 */
function watchScroll(viewAreaElement, callback) {
  var debounceScroll = function debounceScroll(evt) {
    if (rAF) {
      return;
    }
    // schedule an invocation of scroll for next animation frame.
    rAF = window.requestAnimationFrame(function viewAreaElementScrolled() {
      rAF = null;

      var currentY = viewAreaElement.scrollTop;
      var lastY = state.lastY;
      if (currentY !== lastY) {
        state.down = currentY > lastY;
      }
      state.lastY = currentY;
      callback(state);
    });
  };

  var state = {
    down: true,
    lastY: viewAreaElement.scrollTop,
    _eventHandler: debounceScroll
  };

  var rAF = null;
  viewAreaElement.addEventListener('scroll', debounceScroll, true);
  return state;
}

/**
 * Helper function to parse query string (e.g. ?param1=value&parm2=...).
 */
function parseQueryString(query) {
  var parts = query.split('&');
  var params = {};
  for (var i = 0, ii = parts.length; i < ii; ++i) {
    var param = parts[i].split('=');
    var key = param[0].toLowerCase();
    var value = param.length > 1 ? param[1] : null;
    params[decodeURIComponent(key)] = decodeURIComponent(value);
  }
  return params;
}

/**
 * Use binary search to find the index of the first item in a given array which
 * passes a given condition. The items are expected to be sorted in the sense
 * that if the condition is true for one item in the array, then it is also true
 * for all following items.
 *
 * @returns {Number} Index of the first array element to pass the test,
 *                   or |items.length| if no such element exists.
 */
function binarySearchFirstItem(items, condition) {
  var minIndex = 0;
  var maxIndex = items.length - 1;

  if (items.length === 0 || !condition(items[maxIndex])) {
    return items.length;
  }
  if (condition(items[minIndex])) {
    return minIndex;
  }

  while (minIndex < maxIndex) {
    var currentIndex = (minIndex + maxIndex) >> 1;
    var currentItem = items[currentIndex];
    if (condition(currentItem)) {
      maxIndex = currentIndex;
    } else {
      minIndex = currentIndex + 1;
    }
  }
  return minIndex; /* === maxIndex */
}

/**
 *  Approximates float number as a fraction using Farey sequence (max order
 *  of 8).
 *  @param {number} x - Positive float number.
 *  @returns {Array} Estimated fraction: the first array item is a numerator,
 *                   the second one is a denominator.
 */
function approximateFraction(x) {
  // Fast paths for int numbers or their inversions.
  if (Math.floor(x) === x) {
    return [x, 1];
  }
  var xinv = 1 / x;
  var limit = 8;
  if (xinv > limit) {
    return [1, limit];
  } else  if (Math.floor(xinv) === xinv) {
    return [1, xinv];
  }

  var x_ = x > 1 ? xinv : x;
  // a/b and c/d are neighbours in Farey sequence.
  var a = 0, b = 1, c = 1, d = 1;
  // Limiting search to order 8.
  while (true) {
    // Generating next term in sequence (order of q).
    var p = a + c, q = b + d;
    if (q > limit) {
      break;
    }
    if (x_ <= p / q) {
      c = p; d = q;
    } else {
      a = p; b = q;
    }
  }
  // Select closest of the neighbours to x.
  if (x_ - a / b < c / d - x_) {
    return x_ === x ? [a, b] : [b, a];
  } else {
    return x_ === x ? [c, d] : [d, c];
  }
}

function roundToDivide(x, div) {
  var r = x % div;
  return r === 0 ? x : Math.round(x - r + div);
}

/**
 * Generic helper to find out what elements are visible within a scroll pane.
 */
function getVisibleElements(scrollEl, views, sortByVisibility) {
  var top = scrollEl.scrollTop, bottom = top + scrollEl.clientHeight;
  var left = scrollEl.scrollLeft, right = left + scrollEl.clientWidth;

  function isElementBottomBelowViewTop(view) {
    var element = view.div;
    var elementBottom =
      element.offsetTop + element.clientTop + element.clientHeight;
    return elementBottom > top;
  }

  var visible = [], view, element;
  var currentHeight, viewHeight, hiddenHeight, percentHeight;
  var currentWidth, viewWidth;
  var firstVisibleElementInd = (views.length === 0) ? 0 :
    binarySearchFirstItem(views, isElementBottomBelowViewTop);

  for (var i = firstVisibleElementInd, ii = views.length; i < ii; i++) {
    view = views[i];
    element = view.div;
    currentHeight = element.offsetTop + element.clientTop;
    viewHeight = element.clientHeight;

    if (currentHeight > bottom) {
      break;
    }

    currentWidth = element.offsetLeft + element.clientLeft;
    viewWidth = element.clientWidth;
    if (currentWidth + viewWidth < left || currentWidth > right) {
      continue;
    }
    hiddenHeight = Math.max(0, top - currentHeight) +
      Math.max(0, currentHeight + viewHeight - bottom);
    percentHeight = ((viewHeight - hiddenHeight) * 100 / viewHeight) | 0;

    visible.push({
      id: view.id,
      x: currentWidth,
      y: currentHeight,
      view: view,
      percent: percentHeight
    });
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
}

/**
 * Event handler to suppress context menu.
 */
function noContextMenuHandler(e) {
  e.preventDefault();
}

/**
 * Returns the filename or guessed filename from the url (see issue 3455).
 * url {String} The original PDF location.
 * @return {String} Guessed PDF file name.
 */
function getPDFFileNameFromURL(url) {
  var reURI = /^(?:([^:]+:)?\/\/[^\/]+)?([^?#]*)(\?[^#]*)?(#.*)?$/;
  //            SCHEME      HOST         1.PATH  2.QUERY   3.REF
  // Pattern to get last matching NAME.pdf
  var reFilename = /[^\/?#=]+\.pdf\b(?!.*\.pdf\b)/i;
  var splitURI = reURI.exec(url);
  var suggestedFilename = reFilename.exec(splitURI[1]) ||
                           reFilename.exec(splitURI[2]) ||
                           reFilename.exec(splitURI[3]);
  if (suggestedFilename) {
    suggestedFilename = suggestedFilename[0];
    if (suggestedFilename.indexOf('%') !== -1) {
      // URL-encoded %2Fpath%2Fto%2Ffile.pdf should be file.pdf
      try {
        suggestedFilename =
          reFilename.exec(decodeURIComponent(suggestedFilename))[0];
      } catch(e) { // Possible (extremely rare) errors:
        // URIError "Malformed URI", e.g. for "%AA.pdf"
        // TypeError "null has no properties", e.g. for "%2F.pdf"
      }
    }
  }
  return suggestedFilename || 'document.pdf';
}

/**
 * Simple event bus for an application. Listeners are attached using the
 * `on` and `off` methods. To raise an event, the `dispatch` method shall be
 * used.
 */
var EventBus = (function EventBusClosure() {
  function EventBus() {
    this._listeners = Object.create(null);
  }
  EventBus.prototype = {
    on: function EventBus_on(eventName, listener) {
      var eventListeners = this._listeners[eventName];
      if (!eventListeners) {
        eventListeners = [];
        this._listeners[eventName] = eventListeners;
      }
      eventListeners.push(listener);
    },
    off: function EventBus_on(eventName, listener) {
      var eventListeners = this._listeners[eventName];
      var i;
      if (!eventListeners || ((i = eventListeners.indexOf(listener)) < 0)) {
        return;
      }
      eventListeners.splice(i, 1);
    },
    dispatch: function EventBus_dispath(eventName) {
      var eventListeners = this._listeners[eventName];
      if (!eventListeners || eventListeners.length === 0) {
        return;
      }
      // Passing all arguments after the eventName to the listeners.
      var args = Array.prototype.slice.call(arguments, 1);
      // Making copy of the listeners array in case if it will be modified
      // during dispatch.
      eventListeners.slice(0).forEach(function (listener) {
        listener.apply(null, args);
      });
    }
  };
  return EventBus;
})();

var ProgressBar = (function ProgressBarClosure() {

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }

  function ProgressBar(id, opts) {
    this.visible = true;

    // Fetch the sub-elements for later.
    this.div = document.querySelector(id + ' .progress');

    // Get the loading bar element, so it can be resized to fit the viewer.
    this.bar = this.div.parentNode;

    // Get options, with sensible defaults.
    this.height = opts.height || 100;
    this.width = opts.width || 100;
    this.units = opts.units || '%';

    // Initialize heights.
    this.div.style.height = this.height + this.units;
    this.percent = 0;
  }

  ProgressBar.prototype = {

    updateBar: function ProgressBar_updateBar() {
      if (this._indeterminate) {
        this.div.classList.add('indeterminate');
        this.div.style.width = this.width + this.units;
        return;
      }

      this.div.classList.remove('indeterminate');
      var progressSize = this.width * this._percent / 100;
      this.div.style.width = progressSize + this.units;
    },

    get percent() {
      return this._percent;
    },

    set percent(val) {
      this._indeterminate = isNaN(val);
      this._percent = clamp(val, 0, 100);
      this.updateBar();
    },

    setWidth: function ProgressBar_setWidth(viewer) {
      if (viewer) {
        var container = viewer.parentNode;
        var scrollbarWidth = container.offsetWidth - viewer.offsetWidth;
        if (scrollbarWidth > 0) {
          this.bar.setAttribute('style', 'width: calc(100% - ' +
                                         scrollbarWidth + 'px);');
        }
      }
    },

    hide: function ProgressBar_hide() {
      if (!this.visible) {
        return;
      }
      this.visible = false;
      this.bar.classList.add('hidden');
      document.body.classList.remove('loadingInProgress');
    },

    show: function ProgressBar_show() {
      if (this.visible) {
        return;
      }
      this.visible = true;
      document.body.classList.add('loadingInProgress');
      this.bar.classList.remove('hidden');
    }
  };

  return ProgressBar;
})();

exports.CSS_UNITS = CSS_UNITS;
exports.DEFAULT_SCALE_VALUE = DEFAULT_SCALE_VALUE;
exports.DEFAULT_SCALE = DEFAULT_SCALE;
exports.UNKNOWN_SCALE = UNKNOWN_SCALE;
exports.MAX_AUTO_SCALE = MAX_AUTO_SCALE;
exports.SCROLLBAR_PADDING = SCROLLBAR_PADDING;
exports.VERTICAL_PADDING = VERTICAL_PADDING;
exports.mozL10n = mozL10n;
exports.EventBus = EventBus;
exports.ProgressBar = ProgressBar;
exports.getPDFFileNameFromURL = getPDFFileNameFromURL;
exports.noContextMenuHandler = noContextMenuHandler;
exports.parseQueryString = parseQueryString;
exports.getVisibleElements = getVisibleElements;
exports.roundToDivide = roundToDivide;
exports.approximateFraction = approximateFraction;
exports.getOutputScale = getOutputScale;
exports.scrollIntoView = scrollIntoView;
exports.watchScroll = watchScroll;
exports.binarySearchFirstItem = binarySearchFirstItem;
}));


(function (root, factory) {
  {
    factory((root.pdfjsWebDOMEvents = {}), root.pdfjsWebUIUtils);
  }
}(this, function (exports, uiUtils) {
  var EventBus = uiUtils.EventBus;

  // Attaching to the application event bus to dispatch events to the DOM for
  // backwards viewer API compatibility.
  function attachDOMEventsToEventBus(eventBus) {
    eventBus.on('documentload', function () {
      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('documentload', true, true, {});
      window.dispatchEvent(event);
    });
    eventBus.on('pagerendered', function (e) {
      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('pagerendered', true, true, {
        pageNumber: e.pageNumber,
        cssTransform: e.cssTransform,
      });
      e.source.div.dispatchEvent(event);
    });
    eventBus.on('textlayerrendered', function (e) {
      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('textlayerrendered', true, true, {
        pageNumber: e.pageNumber
      });
      e.source.textLayerDiv.dispatchEvent(event);
    });
    eventBus.on('pagechange', function (e) {
      var event = document.createEvent('UIEvents');
      event.initUIEvent('pagechange', true, true, window, 0);
      event.pageNumber = e.pageNumber;
      event.previousPageNumber = e.previousPageNumber;
      e.source.container.dispatchEvent(event);
    });
    eventBus.on('pagesinit', function (e) {
      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('pagesinit', true, true, null);
      e.source.container.dispatchEvent(event);
    });
    eventBus.on('pagesloaded', function (e) {
      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('pagesloaded', true, true, {
        pagesCount: e.pagesCount
      });
      e.source.container.dispatchEvent(event);
    });
    eventBus.on('scalechange', function (e) {
      var event = document.createEvent('UIEvents');
      event.initUIEvent('scalechange', true, true, window, 0);
      event.scale = e.scale;
      event.presetValue = e.presetValue;
      e.source.container.dispatchEvent(event);
    });
    eventBus.on('updateviewarea', function (e) {
      var event = document.createEvent('UIEvents');
      event.initUIEvent('updateviewarea', true, true, window, 0);
      event.location = e.location;
      e.source.container.dispatchEvent(event);
    });
    eventBus.on('find', function (e) {
      if (e.source === window) {
        return; // event comes from FirefoxCom, no need to replicate
      }
      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('find' + e.type, true, true, {
        query: e.query,
        caseSensitive: e.caseSensitive,
        highlightAll: e.highlightAll,
        findPrevious: e.findPrevious
      });
      window.dispatchEvent(event);
    });
    eventBus.on('attachmentsloaded', function (e) {
      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('attachmentsloaded', true, true, {
        attachmentsCount: e.attachmentsCount
      });
      e.source.container.dispatchEvent(event);
    });
    eventBus.on('sidebarviewchanged', function (e) {
      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('sidebarviewchanged', true, true, {
        view: e.view,
      });
      e.source.outerContainer.dispatchEvent(event);
    });
    eventBus.on('pagemode', function (e) {
      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('pagemode', true, true, {
        mode: e.mode,
      });
      e.source.pdfViewer.container.dispatchEvent(event);
    });
    eventBus.on('namedaction', function (e) {
      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('namedaction', true, true, {
        action: e.action
      });
      e.source.pdfViewer.container.dispatchEvent(event);
    });
    eventBus.on('presentationmodechanged', function (e) {
      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('presentationmodechanged', true, true, {
        active: e.active,
        switchInProgress: e.switchInProgress
      });
      window.dispatchEvent(event);
    });
    eventBus.on('outlineloaded', function (e) {
      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('outlineloaded', true, true, {
        outlineCount: e.outlineCount
      });
      e.source.container.dispatchEvent(event);
    });
  }

  var globalEventBus = null;
  function getGlobalEventBus() {
    if (globalEventBus) {
      return globalEventBus;
    }
    globalEventBus = new EventBus();
    attachDOMEventsToEventBus(globalEventBus);
    return globalEventBus;
  }

  exports.attachDOMEventsToEventBus = attachDOMEventsToEventBus;
  exports.getGlobalEventBus = getGlobalEventBus;
}));


(function (root, factory) {
  {
    factory((root.pdfjsWebPDFFindController = {}), root.pdfjsWebUIUtils);
  }
}(this, function (exports, uiUtils) {

var scrollIntoView = uiUtils.scrollIntoView;

var FindStates = {
  FIND_FOUND: 0,
  FIND_NOTFOUND: 1,
  FIND_WRAPPED: 2,
  FIND_PENDING: 3
};

var FIND_SCROLL_OFFSET_TOP = -50;
var FIND_SCROLL_OFFSET_LEFT = -400;

var CHARACTERS_TO_NORMALIZE = {
  '\u2018': '\'', // Left single quotation mark
  '\u2019': '\'', // Right single quotation mark
  '\u201A': '\'', // Single low-9 quotation mark
  '\u201B': '\'', // Single high-reversed-9 quotation mark
  '\u201C': '"', // Left double quotation mark
  '\u201D': '"', // Right double quotation mark
  '\u201E': '"', // Double low-9 quotation mark
  '\u201F': '"', // Double high-reversed-9 quotation mark
  '\u00BC': '1/4', // Vulgar fraction one quarter
  '\u00BD': '1/2', // Vulgar fraction one half
  '\u00BE': '3/4', // Vulgar fraction three quarters
};

/**
 * Provides "search" or "find" functionality for the PDF.
 * This object actually performs the search for a given string.
 */
var PDFFindController = (function PDFFindControllerClosure() {
  function PDFFindController(options) {
    this.pdfViewer = options.pdfViewer || null;

    this.onUpdateResultsCount = null;
    this.onUpdateState = null;

    this.reset();

    // Compile the regular expression for text normalization once.
    var replace = Object.keys(CHARACTERS_TO_NORMALIZE).join('');
    this.normalizationRegex = new RegExp('[' + replace + ']', 'g');
  }

  PDFFindController.prototype = {
    reset: function PDFFindController_reset() {
      this.startedTextExtraction = false;
      this.extractTextPromises = [];
      this.pendingFindMatches = Object.create(null);
      this.active = false; // If active, find results will be highlighted.
      this.pageContents = []; // Stores the text for each page.
      this.pageMatches = [];
      this.matchCount = 0;
      this.selected = { // Currently selected match.
        pageIdx: -1,
        matchIdx: -1
      };
      this.offset = { // Where the find algorithm currently is in the document.
        pageIdx: null,
        matchIdx: null
      };
      this.pagesToSearch = null;
      this.resumePageIdx = null;
      this.state = null;
      this.dirtyMatch = false;
      this.findTimeout = null;

      this.firstPagePromise = new Promise(function (resolve) {
        this.resolveFirstPage = resolve;
      }.bind(this));
    },

    normalize: function PDFFindController_normalize(text) {
      return text.replace(this.normalizationRegex, function (ch) {
        return CHARACTERS_TO_NORMALIZE[ch];
      });
    },

    calcFindMatch: function PDFFindController_calcFindMatch(pageIndex) {
      var pageContent = this.normalize(this.pageContents[pageIndex]);
      var query = this.normalize(this.state.query);
      var caseSensitive = this.state.caseSensitive;
      var queryLen = query.length;

      if (queryLen === 0) {
        // Do nothing: the matches should be wiped out already.
        return;
      }

      if (!caseSensitive) {
        pageContent = pageContent.toLowerCase();
        query = query.toLowerCase();
      }

      var matches = [];
      var matchIdx = -queryLen;
      while (true) {
        matchIdx = pageContent.indexOf(query, matchIdx + queryLen);
        if (matchIdx === -1) {
          break;
        }
        matches.push(matchIdx);
      }
      this.pageMatches[pageIndex] = matches;
      this.updatePage(pageIndex);
      if (this.resumePageIdx === pageIndex) {
        this.resumePageIdx = null;
        this.nextPageMatch();
      }

      // Update the matches count
      if (matches.length > 0) {
        this.matchCount += matches.length;
        this.updateUIResultsCount();
      }
    },

    extractText: function PDFFindController_extractText() {
      if (this.startedTextExtraction) {
        return;
      }
      this.startedTextExtraction = true;

      this.pageContents = [];
      var extractTextPromisesResolves = [];
      var numPages = this.pdfViewer.pagesCount;
      for (var i = 0; i < numPages; i++) {
        this.extractTextPromises.push(new Promise(function (resolve) {
          extractTextPromisesResolves.push(resolve);
        }));
      }

      var self = this;
      function extractPageText(pageIndex) {
        self.pdfViewer.getPageTextContent(pageIndex).then(
          function textContentResolved(textContent) {
            var textItems = textContent.items;
            var str = [];

            for (var i = 0, len = textItems.length; i < len; i++) {
              str.push(textItems[i].str);
            }

            // Store the pageContent as a string.
            self.pageContents.push(str.join(''));

            extractTextPromisesResolves[pageIndex](pageIndex);
            if ((pageIndex + 1) < self.pdfViewer.pagesCount) {
              extractPageText(pageIndex + 1);
            }
          }
        );
      }
      extractPageText(0);
    },

    executeCommand: function PDFFindController_executeCommand(cmd, state) {
      if (this.state === null || cmd !== 'findagain') {
        this.dirtyMatch = true;
      }
      this.state = state;
      this.updateUIState(FindStates.FIND_PENDING);

      this.firstPagePromise.then(function() {
        this.extractText();

        clearTimeout(this.findTimeout);
        if (cmd === 'find') {
          // Only trigger the find action after 250ms of silence.
          this.findTimeout = setTimeout(this.nextMatch.bind(this), 250);
        } else {
          this.nextMatch();
        }
      }.bind(this));
    },

    updatePage: function PDFFindController_updatePage(index) {
      if (this.selected.pageIdx === index) {
        // If the page is selected, scroll the page into view, which triggers
        // rendering the page, which adds the textLayer. Once the textLayer is
        // build, it will scroll onto the selected match.
        this.pdfViewer.scrollPageIntoView(index + 1);
      }

      var page = this.pdfViewer.getPageView(index);
      if (page.textLayer) {
        page.textLayer.updateMatches();
      }
    },

    nextMatch: function PDFFindController_nextMatch() {
      var previous = this.state.findPrevious;
      var currentPageIndex = this.pdfViewer.currentPageNumber - 1;
      var numPages = this.pdfViewer.pagesCount;

      this.active = true;

      if (this.dirtyMatch) {
        // Need to recalculate the matches, reset everything.
        this.dirtyMatch = false;
        this.selected.pageIdx = this.selected.matchIdx = -1;
        this.offset.pageIdx = currentPageIndex;
        this.offset.matchIdx = null;
        this.hadMatch = false;
        this.resumePageIdx = null;
        this.pageMatches = [];
        this.matchCount = 0;
        var self = this;

        for (var i = 0; i < numPages; i++) {
          // Wipe out any previous highlighted matches.
          this.updatePage(i);

          // As soon as the text is extracted start finding the matches.
          if (!(i in this.pendingFindMatches)) {
            this.pendingFindMatches[i] = true;
            this.extractTextPromises[i].then(function(pageIdx) {
              delete self.pendingFindMatches[pageIdx];
              self.calcFindMatch(pageIdx);
            });
          }
        }
      }

      // If there's no query there's no point in searching.
      if (this.state.query === '') {
        this.updateUIState(FindStates.FIND_FOUND);
        return;
      }

      // If we're waiting on a page, we return since we can't do anything else.
      if (this.resumePageIdx) {
        return;
      }

      var offset = this.offset;
      // Keep track of how many pages we should maximally iterate through.
      this.pagesToSearch = numPages;
      // If there's already a matchIdx that means we are iterating through a
      // page's matches.
      if (offset.matchIdx !== null) {
        var numPageMatches = this.pageMatches[offset.pageIdx].length;
        if ((!previous && offset.matchIdx + 1 < numPageMatches) ||
            (previous && offset.matchIdx > 0)) {
          // The simple case; we just have advance the matchIdx to select
          // the next match on the page.
          this.hadMatch = true;
          offset.matchIdx = (previous ? offset.matchIdx - 1 :
                                        offset.matchIdx + 1);
          this.updateMatch(true);
          return;
        }
        // We went beyond the current page's matches, so we advance to
        // the next page.
        this.advanceOffsetPage(previous);
      }
      // Start searching through the page.
      this.nextPageMatch();
    },

    matchesReady: function PDFFindController_matchesReady(matches) {
      var offset = this.offset;
      var numMatches = matches.length;
      var previous = this.state.findPrevious;

      if (numMatches) {
        // There were matches for the page, so initialize the matchIdx.
        this.hadMatch = true;
        offset.matchIdx = (previous ? numMatches - 1 : 0);
        this.updateMatch(true);
        return true;
      } else {
        // No matches, so attempt to search the next page.
        this.advanceOffsetPage(previous);
        if (offset.wrapped) {
          offset.matchIdx = null;
          if (this.pagesToSearch < 0) {
            // No point in wrapping again, there were no matches.
            this.updateMatch(false);
            // while matches were not found, searching for a page
            // with matches should nevertheless halt.
            return true;
          }
        }
        // Matches were not found (and searching is not done).
        return false;
      }
    },

    /**
     * The method is called back from the text layer when match presentation
     * is updated.
     * @param {number} pageIndex - page index.
     * @param {number} index - match index.
     * @param {Array} elements - text layer div elements array.
     * @param {number} beginIdx - start index of the div array for the match.
     */
    updateMatchPosition: function PDFFindController_updateMatchPosition(
        pageIndex, index, elements, beginIdx) {
      if (this.selected.matchIdx === index &&
          this.selected.pageIdx === pageIndex) {
        var spot = {
          top: FIND_SCROLL_OFFSET_TOP,
          left: FIND_SCROLL_OFFSET_LEFT
        };
        scrollIntoView(elements[beginIdx], spot,
                       /* skipOverflowHiddenElements = */ true);
      }
    },

    nextPageMatch: function PDFFindController_nextPageMatch() {
      if (this.resumePageIdx !== null) {
        console.error('There can only be one pending page.');
      }
      do {
        var pageIdx = this.offset.pageIdx;
        var matches = this.pageMatches[pageIdx];
        if (!matches) {
          // The matches don't exist yet for processing by "matchesReady",
          // so set a resume point for when they do exist.
          this.resumePageIdx = pageIdx;
          break;
        }
      } while (!this.matchesReady(matches));
    },

    advanceOffsetPage: function PDFFindController_advanceOffsetPage(previous) {
      var offset = this.offset;
      var numPages = this.extractTextPromises.length;
      offset.pageIdx = (previous ? offset.pageIdx - 1 : offset.pageIdx + 1);
      offset.matchIdx = null;

      this.pagesToSearch--;

      if (offset.pageIdx >= numPages || offset.pageIdx < 0) {
        offset.pageIdx = (previous ? numPages - 1 : 0);
        offset.wrapped = true;
      }
    },

    updateMatch: function PDFFindController_updateMatch(found) {
      var state = FindStates.FIND_NOTFOUND;
      var wrapped = this.offset.wrapped;
      this.offset.wrapped = false;

      if (found) {
        var previousPage = this.selected.pageIdx;
        this.selected.pageIdx = this.offset.pageIdx;
        this.selected.matchIdx = this.offset.matchIdx;
        state = (wrapped ? FindStates.FIND_WRAPPED : FindStates.FIND_FOUND);
        // Update the currently selected page to wipe out any selected matches.
        if (previousPage !== -1 && previousPage !== this.selected.pageIdx) {
          this.updatePage(previousPage);
        }
      }

      this.updateUIState(state, this.state.findPrevious);
      if (this.selected.pageIdx !== -1) {
        this.updatePage(this.selected.pageIdx);
      }
    },

    updateUIResultsCount:
        function PDFFindController_updateUIResultsCount() {
      if (this.onUpdateResultsCount) {
        this.onUpdateResultsCount(this.matchCount);
      }
    },

    updateUIState: function PDFFindController_updateUIState(state, previous) {
      if (this.onUpdateState) {
        this.onUpdateState(state, previous, this.matchCount);
      }
    }
  };
  return PDFFindController;
})();

exports.FindStates = FindStates;
exports.PDFFindController = PDFFindController;
}));


(function (root, factory) {
  {
    factory((root.pdfjsWebPDFHistory = {}), root.pdfjsWebDOMEvents);
  }
}(this, function (exports, domEvents) {

  function PDFHistory(options) {
    this.linkService = options.linkService;
    this.eventBus = options.eventBus || domEvents.getGlobalEventBus();

    this.initialized = false;
    this.initialDestination = null;
    this.initialBookmark = null;
  }

  PDFHistory.prototype = {
    /**
     * @param {string} fingerprint
     */
    initialize: function pdfHistoryInitialize(fingerprint) {
      this.initialized = true;
      this.reInitialized = false;
      this.allowHashChange = true;
      this.historyUnlocked = true;
      this.isViewerInPresentationMode = false;

      this.previousHash = window.location.hash.substring(1);
      this.currentBookmark = '';
      this.currentPage = 0;
      this.updatePreviousBookmark = false;
      this.previousBookmark = '';
      this.previousPage = 0;
      this.nextHashParam = '';

      this.fingerprint = fingerprint;
      this.currentUid = this.uid = 0;
      this.current = {};

      var state = window.history.state;
      if (this._isStateObjectDefined(state)) {
        // This corresponds to navigating back to the document
        // from another page in the browser history.
        if (state.target.dest) {
          this.initialDestination = state.target.dest;
        } else {
          this.initialBookmark = state.target.hash;
        }
        this.currentUid = state.uid;
        this.uid = state.uid + 1;
        this.current = state.target;
      } else {
        // This corresponds to the loading of a new document.
        if (state && state.fingerprint &&
          this.fingerprint !== state.fingerprint) {
          // Reinitialize the browsing history when a new document
          // is opened in the web viewer.
          this.reInitialized = true;
        }
        this._pushOrReplaceState({fingerprint: this.fingerprint}, true);
      }

      var self = this;
      window.addEventListener('popstate', function pdfHistoryPopstate(evt) {
        if (!self.historyUnlocked) {
          return;
        }
        if (evt.state) {
          // Move back/forward in the history.
          self._goTo(evt.state);
          return;
        }

        // If the state is not set, then the user tried to navigate to a
        // different hash by manually editing the URL and pressing Enter, or by
        // clicking on an in-page link (e.g. the "current view" link).
        // Save the current view state to the browser history.

        // Note: In Firefox, history.null could also be null after an in-page
        // navigation to the same URL, and without dispatching the popstate
        // event: https://bugzilla.mozilla.org/show_bug.cgi?id=1183881

        if (self.uid === 0) {
          // Replace the previous state if it was not explicitly set.
          var previousParams = (self.previousHash && self.currentBookmark &&
            self.previousHash !== self.currentBookmark) ?
            {hash: self.currentBookmark, page: self.currentPage} :
            {page: 1};
          replacePreviousHistoryState(previousParams, function() {
            updateHistoryWithCurrentHash();
          });
        } else {
          updateHistoryWithCurrentHash();
        }
      }, false);


      function updateHistoryWithCurrentHash() {
        self.previousHash = window.location.hash.slice(1);
        self._pushToHistory({hash: self.previousHash}, false, true);
        self._updatePreviousBookmark();
      }

      function replacePreviousHistoryState(params, callback) {
        // To modify the previous history entry, the following happens:
        // 1. history.back()
        // 2. _pushToHistory, which calls history.replaceState( ... )
        // 3. history.forward()
        // Because a navigation via the history API does not immediately update
        // the history state, the popstate event is used for synchronization.
        self.historyUnlocked = false;

        // Suppress the hashchange event to avoid side effects caused by
        // navigating back and forward.
        self.allowHashChange = false;
        window.addEventListener('popstate', rewriteHistoryAfterBack);
        history.back();

        function rewriteHistoryAfterBack() {
          window.removeEventListener('popstate', rewriteHistoryAfterBack);
          window.addEventListener('popstate', rewriteHistoryAfterForward);
          self._pushToHistory(params, false, true);
          history.forward();
        }
        function rewriteHistoryAfterForward() {
          window.removeEventListener('popstate', rewriteHistoryAfterForward);
          self.allowHashChange = true;
          self.historyUnlocked = true;
          callback();
        }
      }

      function pdfHistoryBeforeUnload() {
        var previousParams = self._getPreviousParams(null, true);
        if (previousParams) {
          var replacePrevious = (!self.current.dest &&
          self.current.hash !== self.previousHash);
          self._pushToHistory(previousParams, false, replacePrevious);
          self._updatePreviousBookmark();
        }
        // Remove the event listener when navigating away from the document,
        // since 'beforeunload' prevents Firefox from caching the document.
        window.removeEventListener('beforeunload', pdfHistoryBeforeUnload,
                                   false);
      }

      window.addEventListener('beforeunload', pdfHistoryBeforeUnload, false);

      window.addEventListener('pageshow', function pdfHistoryPageShow(evt) {
        // If the entire viewer (including the PDF file) is cached in
        // the browser, we need to reattach the 'beforeunload' event listener
        // since the 'DOMContentLoaded' event is not fired on 'pageshow'.
        window.addEventListener('beforeunload', pdfHistoryBeforeUnload, false);
      }, false);

      self.eventBus.on('presentationmodechanged', function(e) {
        self.isViewerInPresentationMode = e.active;
      });
    },

    clearHistoryState: function pdfHistory_clearHistoryState() {
      this._pushOrReplaceState(null, true);
    },

    _isStateObjectDefined: function pdfHistory_isStateObjectDefined(state) {
      return (state && state.uid >= 0 &&
      state.fingerprint && this.fingerprint === state.fingerprint &&
      state.target && state.target.hash) ? true : false;
    },

    _pushOrReplaceState: function pdfHistory_pushOrReplaceState(stateObj,
                                                                replace) {
      if (replace) {
        window.history.replaceState(stateObj, '', document.URL);
      } else {
        window.history.pushState(stateObj, '', document.URL);
      }
    },

    get isHashChangeUnlocked() {
      if (!this.initialized) {
        return true;
      }
      return this.allowHashChange;
    },

    _updatePreviousBookmark: function pdfHistory_updatePreviousBookmark() {
      if (this.updatePreviousBookmark &&
        this.currentBookmark && this.currentPage) {
        this.previousBookmark = this.currentBookmark;
        this.previousPage = this.currentPage;
        this.updatePreviousBookmark = false;
      }
    },

    updateCurrentBookmark: function pdfHistoryUpdateCurrentBookmark(bookmark,
                                                                    pageNum) {
      if (this.initialized) {
        this.currentBookmark = bookmark.substring(1);
        this.currentPage = pageNum | 0;
        this._updatePreviousBookmark();
      }
    },

    updateNextHashParam: function pdfHistoryUpdateNextHashParam(param) {
      if (this.initialized) {
        this.nextHashParam = param;
      }
    },

    push: function pdfHistoryPush(params, isInitialBookmark) {
      if (!(this.initialized && this.historyUnlocked)) {
        return;
      }
      if (params.dest && !params.hash) {
        params.hash = (this.current.hash && this.current.dest &&
        this.current.dest === params.dest) ?
          this.current.hash :
          this.linkService.getDestinationHash(params.dest).split('#')[1];
      }
      if (params.page) {
        params.page |= 0;
      }
      if (isInitialBookmark) {
        var target = window.history.state.target;
        if (!target) {
          // Invoked when the user specifies an initial bookmark,
          // thus setting initialBookmark, when the document is loaded.
          this._pushToHistory(params, false);
          this.previousHash = window.location.hash.substring(1);
        }
        this.updatePreviousBookmark = this.nextHashParam ? false : true;
        if (target) {
          // If the current document is reloaded,
          // avoid creating duplicate entries in the history.
          this._updatePreviousBookmark();
        }
        return;
      }
      if (this.nextHashParam) {
        if (this.nextHashParam === params.hash) {
          this.nextHashParam = null;
          this.updatePreviousBookmark = true;
          return;
        } else {
          this.nextHashParam = null;
        }
      }

      if (params.hash) {
        if (this.current.hash) {
          if (this.current.hash !== params.hash) {
            this._pushToHistory(params, true);
          } else {
            if (!this.current.page && params.page) {
              this._pushToHistory(params, false, true);
            }
            this.updatePreviousBookmark = true;
          }
        } else {
          this._pushToHistory(params, true);
        }
      } else if (this.current.page && params.page &&
        this.current.page !== params.page) {
        this._pushToHistory(params, true);
      }
    },

    _getPreviousParams: function pdfHistory_getPreviousParams(onlyCheckPage,
                                                              beforeUnload) {
      if (!(this.currentBookmark && this.currentPage)) {
        return null;
      } else if (this.updatePreviousBookmark) {
        this.updatePreviousBookmark = false;
      }
      if (this.uid > 0 && !(this.previousBookmark && this.previousPage)) {
        // Prevent the history from getting stuck in the current state,
        // effectively preventing the user from going back/forward in
        // the history.
        //
        // This happens if the current position in the document didn't change
        // when the history was previously updated. The reasons for this are
        // either:
        // 1. The current zoom value is such that the document does not need to,
        //    or cannot, be scrolled to display the destination.
        // 2. The previous destination is broken, and doesn't actally point to a
        //    position within the document.
        //    (This is either due to a bad PDF generator, or the user making a
        //     mistake when entering a destination in the hash parameters.)
        return null;
      }
      if ((!this.current.dest && !onlyCheckPage) || beforeUnload) {
        if (this.previousBookmark === this.currentBookmark) {
          return null;
        }
      } else if (this.current.page || onlyCheckPage) {
        if (this.previousPage === this.currentPage) {
          return null;
        }
      } else {
        return null;
      }
      var params = {hash: this.currentBookmark, page: this.currentPage};
      if (this.isViewerInPresentationMode) {
        params.hash = null;
      }
      return params;
    },

    _stateObj: function pdfHistory_stateObj(params) {
      return {fingerprint: this.fingerprint, uid: this.uid, target: params};
    },

    _pushToHistory: function pdfHistory_pushToHistory(params,
                                                      addPrevious, overwrite) {
      if (!this.initialized) {
        return;
      }
      if (!params.hash && params.page) {
        params.hash = ('page=' + params.page);
      }
      if (addPrevious && !overwrite) {
        var previousParams = this._getPreviousParams();
        if (previousParams) {
          var replacePrevious = (!this.current.dest &&
          this.current.hash !== this.previousHash);
          this._pushToHistory(previousParams, false, replacePrevious);
        }
      }
      this._pushOrReplaceState(this._stateObj(params),
        (overwrite || this.uid === 0));
      this.currentUid = this.uid++;
      this.current = params;
      this.updatePreviousBookmark = true;
    },

    _goTo: function pdfHistory_goTo(state) {
      if (!(this.initialized && this.historyUnlocked &&
        this._isStateObjectDefined(state))) {
        return;
      }
      if (!this.reInitialized && state.uid < this.currentUid) {
        var previousParams = this._getPreviousParams(true);
        if (previousParams) {
          this._pushToHistory(this.current, false);
          this._pushToHistory(previousParams, false);
          this.currentUid = state.uid;
          window.history.back();
          return;
        }
      }
      this.historyUnlocked = false;

      if (state.target.dest) {
        this.linkService.navigateTo(state.target.dest);
      } else {
        this.linkService.setHash(state.target.hash);
      }
      this.currentUid = state.uid;
      if (state.uid > this.uid) {
        this.uid = state.uid;
      }
      this.current = state.target;
      this.updatePreviousBookmark = true;

      var currentHash = window.location.hash.substring(1);
      if (this.previousHash !== currentHash) {
        this.allowHashChange = false;
      }
      this.previousHash = currentHash;

      this.historyUnlocked = true;
    },

    back: function pdfHistoryBack() {
      this.go(-1);
    },

    forward: function pdfHistoryForward() {
      this.go(1);
    },

    go: function pdfHistoryGo(direction) {
      if (this.initialized && this.historyUnlocked) {
        var state = window.history.state;
        if (direction === -1 && state && state.uid > 0) {
          window.history.back();
        } else if (direction === 1 && state && state.uid < (this.uid - 1)) {
          window.history.forward();
        }
      }
    }
  };

  exports.PDFHistory = PDFHistory;
}));


(function (root, factory) {
  {
    factory((root.pdfjsWebPDFLinkService = {}), root.pdfjsWebUIUtils,
      root.pdfjsWebDOMEvents);
  }
}(this, function (exports, uiUtils, domEvents) {

var parseQueryString = uiUtils.parseQueryString;

/**
 * @typedef {Object} PDFLinkServiceOptions
 * @property {EventBus} eventBus - The application event bus.
 */

/**
 * Performs navigation functions inside PDF, such as opening specified page,
 * or destination.
 * @class
 * @implements {IPDFLinkService}
 */
var PDFLinkService = (function () {
  /**
   * @constructs PDFLinkService
   * @param {PDFLinkServiceOptions} options
   */
  function PDFLinkService(options) {
    options = options || {};
    this.eventBus = options.eventBus || domEvents.getGlobalEventBus();
    this.baseUrl = null;
    this.pdfDocument = null;
    this.pdfViewer = null;
    this.pdfHistory = null;

    this._pagesRefCache = null;
  }

  PDFLinkService.prototype = {
    setDocument: function PDFLinkService_setDocument(pdfDocument, baseUrl) {
      this.baseUrl = baseUrl;
      this.pdfDocument = pdfDocument;
      this._pagesRefCache = Object.create(null);
    },

    setViewer: function PDFLinkService_setViewer(pdfViewer) {
      this.pdfViewer = pdfViewer;
    },

    setHistory: function PDFLinkService_setHistory(pdfHistory) {
      this.pdfHistory = pdfHistory;
    },

    /**
     * @returns {number}
     */
    get pagesCount() {
      return this.pdfDocument.numPages;
    },

    /**
     * @returns {number}
     */
    get page() {
      return this.pdfViewer.currentPageNumber;
    },

    /**
     * @param {number} value
     */
    set page(value) {
      this.pdfViewer.currentPageNumber = value;
    },

    /**
     * @param dest - The PDF destination object.
     */
    navigateTo: function PDFLinkService_navigateTo(dest) {
      var destString = '';
      var self = this;

      var goToDestination = function(destRef) {
        // dest array looks like that: <page-ref> </XYZ|FitXXX> <args..>
        var pageNumber = destRef instanceof Object ?
          self._pagesRefCache[destRef.num + ' ' + destRef.gen + ' R'] :
          (destRef + 1);
        if (pageNumber) {
          if (pageNumber > self.pagesCount) {
            pageNumber = self.pagesCount;
          }
          self.pdfViewer.scrollPageIntoView(pageNumber, dest);

          if (self.pdfHistory) {
            // Update the browsing history.
            self.pdfHistory.push({
              dest: dest,
              hash: destString,
              page: pageNumber
            });
          }
        } else {
          self.pdfDocument.getPageIndex(destRef).then(function (pageIndex) {
            var pageNum = pageIndex + 1;
            var cacheKey = destRef.num + ' ' + destRef.gen + ' R';
            self._pagesRefCache[cacheKey] = pageNum;
            goToDestination(destRef);
          });
        }
      };

      var destinationPromise;
      if (typeof dest === 'string') {
        destString = dest;
        destinationPromise = this.pdfDocument.getDestination(dest);
      } else {
        destinationPromise = Promise.resolve(dest);
      }
      destinationPromise.then(function(destination) {
        dest = destination;
        if (!(destination instanceof Array)) {
          return; // invalid destination
        }
        goToDestination(destination[0]);
      });
    },

    /**
     * @param dest - The PDF destination object.
     * @returns {string} The hyperlink to the PDF object.
     */
    getDestinationHash: function PDFLinkService_getDestinationHash(dest) {
      if (typeof dest === 'string') {
        return this.getAnchorUrl('#' + escape(dest));
      }
      if (dest instanceof Array) {
        var destRef = dest[0]; // see navigateTo method for dest format
        var pageNumber = destRef instanceof Object ?
          this._pagesRefCache[destRef.num + ' ' + destRef.gen + ' R'] :
          (destRef + 1);
        if (pageNumber) {
          var pdfOpenParams = this.getAnchorUrl('#page=' + pageNumber);
          var destKind = dest[1];
          if (typeof destKind === 'object' && 'name' in destKind &&
              destKind.name === 'XYZ') {
            var scale = (dest[4] || this.pdfViewer.currentScaleValue);
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
      return this.getAnchorUrl('');
    },

    /**
     * Prefix the full url on anchor links to make sure that links are resolved
     * relative to the current URL instead of the one defined in <base href>.
     * @param {String} anchor The anchor hash, including the #.
     * @returns {string} The hyperlink to the PDF object.
     */
    getAnchorUrl: function PDFLinkService_getAnchorUrl(anchor) {
      return (this.baseUrl || '') + anchor;
    },

    /**
     * @param {string} hash
     */
    setHash: function PDFLinkService_setHash(hash) {
      if (hash.indexOf('=') >= 0) {
        var params = parseQueryString(hash);
        // borrowing syntax from "Parameters for Opening PDF Files"
        if ('nameddest' in params) {
          if (this.pdfHistory) {
            this.pdfHistory.updateNextHashParam(params.nameddest);
          }
          this.navigateTo(params.nameddest);
          return;
        }
        var pageNumber, dest;
        if ('page' in params) {
          pageNumber = (params.page | 0) || 1;
        }
        if ('zoom' in params) {
          // Build the destination array.
          var zoomArgs = params.zoom.split(','); // scale,left,top
          var zoomArg = zoomArgs[0];
          var zoomArgNumber = parseFloat(zoomArg);

          if (zoomArg.indexOf('Fit') === -1) {
            // If the zoomArg is a number, it has to get divided by 100. If it's
            // a string, it should stay as it is.
            dest = [null, { name: 'XYZ' },
                    zoomArgs.length > 1 ? (zoomArgs[1] | 0) : null,
                    zoomArgs.length > 2 ? (zoomArgs[2] | 0) : null,
                    (zoomArgNumber ? zoomArgNumber / 100 : zoomArg)];
          } else {
            if (zoomArg === 'Fit' || zoomArg === 'FitB') {
              dest = [null, { name: zoomArg }];
            } else if ((zoomArg === 'FitH' || zoomArg === 'FitBH') ||
                       (zoomArg === 'FitV' || zoomArg === 'FitBV')) {
              dest = [null, { name: zoomArg },
                      zoomArgs.length > 1 ? (zoomArgs[1] | 0) : null];
            } else if (zoomArg === 'FitR') {
              if (zoomArgs.length !== 5) {
                console.error('PDFLinkService_setHash: ' +
                              'Not enough parameters for \'FitR\'.');
              } else {
                dest = [null, { name: zoomArg },
                        (zoomArgs[1] | 0), (zoomArgs[2] | 0),
                        (zoomArgs[3] | 0), (zoomArgs[4] | 0)];
              }
            } else {
              console.error('PDFLinkService_setHash: \'' + zoomArg +
                            '\' is not a valid zoom value.');
            }
          }
        }
        if (dest) {
          this.pdfViewer.scrollPageIntoView(pageNumber || this.page, dest);
        } else if (pageNumber) {
          this.page = pageNumber; // simple page
        }
        if ('pagemode' in params) {
          this.eventBus.dispatch('pagemode', {
            source: this,
            mode: params.pagemode
          });
        }
      } else if (/^\d+$/.test(hash)) { // page number
        this.page = hash;
      } else { // named destination
        if (this.pdfHistory) {
          this.pdfHistory.updateNextHashParam(unescape(hash));
        }
        this.navigateTo(unescape(hash));
      }
    },

    /**
     * @param {string} action
     */
    executeNamedAction: function PDFLinkService_executeNamedAction(action) {
      // See PDF reference, table 8.45 - Named action
      switch (action) {
        case 'GoBack':
          if (this.pdfHistory) {
            this.pdfHistory.back();
          }
          break;

        case 'GoForward':
          if (this.pdfHistory) {
            this.pdfHistory.forward();
          }
          break;

        case 'NextPage':
          this.page++;
          break;

        case 'PrevPage':
          this.page--;
          break;

        case 'LastPage':
          this.page = this.pagesCount;
          break;

        case 'FirstPage':
          this.page = 1;
          break;

        default:
          break; // No action according to spec
      }

      this.eventBus.dispatch('namedaction', {
        source: this,
        action: action
      });
    },

    /**
     * @param {number} pageNum - page number.
     * @param {Object} pageRef - reference to the page.
     */
    cachePageRef: function PDFLinkService_cachePageRef(pageNum, pageRef) {
      var refStr = pageRef.num + ' ' + pageRef.gen + ' R';
      this._pagesRefCache[refStr] = pageNum;
    }
  };

  return PDFLinkService;
})();

var SimpleLinkService = (function SimpleLinkServiceClosure() {
  function SimpleLinkService() {}

  SimpleLinkService.prototype = {
    /**
     * @returns {number}
     */
    get page() {
      return 0;
    },
    /**
     * @param {number} value
     */
    set page(value) {},
    /**
     * @param dest - The PDF destination object.
     */
    navigateTo: function (dest) {},
    /**
     * @param dest - The PDF destination object.
     * @returns {string} The hyperlink to the PDF object.
     */
    getDestinationHash: function (dest) {
      return '#';
    },
    /**
     * @param hash - The PDF parameters/hash.
     * @returns {string} The hyperlink to the PDF object.
     */
    getAnchorUrl: function (hash) {
      return '#';
    },
    /**
     * @param {string} hash
     */
    setHash: function (hash) {},
    /**
     * @param {string} action
     */
    executeNamedAction: function (action) {},
    /**
     * @param {number} pageNum - page number.
     * @param {Object} pageRef - reference to the page.
     */
    cachePageRef: function (pageNum, pageRef) {}
  };
  return SimpleLinkService;
})();

exports.PDFLinkService = PDFLinkService;
exports.SimpleLinkService = SimpleLinkService;
}));


(function (root, factory) {
  {
    factory((root.pdfjsWebPDFPageView = {}), root.pdfjsWebUIUtils,
      root.pdfjsWebPDFRenderingQueue, root.pdfjsWebDOMEvents,
      root.pdfjsWebPDFJS);
  }
}(this, function (exports, uiUtils, pdfRenderingQueue, domEvents, pdfjsLib) {

var CSS_UNITS = uiUtils.CSS_UNITS;
var DEFAULT_SCALE = uiUtils.DEFAULT_SCALE;
var getOutputScale = uiUtils.getOutputScale;
var approximateFraction = uiUtils.approximateFraction;
var roundToDivide = uiUtils.roundToDivide;
var RenderingStates = pdfRenderingQueue.RenderingStates;

var TEXT_LAYER_RENDER_DELAY = 200; // ms

/**
 * @typedef {Object} PDFPageViewOptions
 * @property {HTMLDivElement} container - The viewer element.
 * @property {EventBus} eventBus - The application event bus.
 * @property {number} id - The page unique ID (normally its number).
 * @property {number} scale - The page scale display.
 * @property {PageViewport} defaultViewport - The page viewport.
 * @property {PDFRenderingQueue} renderingQueue - The rendering queue object.
 * @property {IPDFTextLayerFactory} textLayerFactory
 * @property {IPDFAnnotationLayerFactory} annotationLayerFactory
 */

/**
 * @class
 * @implements {IRenderableView}
 */
var PDFPageView = (function PDFPageViewClosure() {
  /**
   * @constructs PDFPageView
   * @param {PDFPageViewOptions} options
   */
  function PDFPageView(options) {
    var container = options.container;
    var id = options.id;
    var scale = options.scale;
    var defaultViewport = options.defaultViewport;
    var renderingQueue = options.renderingQueue;
    var textLayerFactory = options.textLayerFactory;
    var annotationLayerFactory = options.annotationLayerFactory;

    this.id = id;
    this.renderingId = 'page' + id;

    this.rotation = 0;
    this.scale = scale || DEFAULT_SCALE;
    this.viewport = defaultViewport;
    this.pdfPageRotate = defaultViewport.rotation;
    this.hasRestrictedScaling = false;

    this.eventBus = options.eventBus || domEvents.getGlobalEventBus();
    this.renderingQueue = renderingQueue;
    this.textLayerFactory = textLayerFactory;
    this.annotationLayerFactory = annotationLayerFactory;

    this.renderingState = RenderingStates.INITIAL;
    this.resume = null;

    this.onBeforeDraw = null;
    this.onAfterDraw = null;

    this.textLayer = null;

    this.zoomLayer = null;

    this.annotationLayer = null;

    var div = document.createElement('div');
    div.id = 'pageContainer' + this.id;
    div.className = 'page';
    div.style.width = Math.floor(this.viewport.width) + 'px';
    div.style.height = Math.floor(this.viewport.height) + 'px';
    div.setAttribute('data-page-number', this.id);
    this.div = div;

    container.appendChild(div);
  }

  PDFPageView.prototype = {
    setPdfPage: function PDFPageView_setPdfPage(pdfPage) {
      this.pdfPage = pdfPage;
      this.pdfPageRotate = pdfPage.rotate;
      var totalRotation = (this.rotation + this.pdfPageRotate) % 360;
      this.viewport = pdfPage.getViewport(this.scale * CSS_UNITS,
                                          totalRotation);
      this.stats = pdfPage.stats;
      this.reset();
    },

    destroy: function PDFPageView_destroy() {
      this.zoomLayer = null;
      this.reset();
      if (this.pdfPage) {
        this.pdfPage.cleanup();
      }
    },

    reset: function PDFPageView_reset(keepZoomLayer, keepAnnotations) {
      if (this.renderTask) {
        this.renderTask.cancel();
      }
      this.resume = null;
      this.renderingState = RenderingStates.INITIAL;

      var div = this.div;
      div.style.width = Math.floor(this.viewport.width) + 'px';
      div.style.height = Math.floor(this.viewport.height) + 'px';

      var childNodes = div.childNodes;
      var currentZoomLayerNode = (keepZoomLayer && this.zoomLayer) || null;
      var currentAnnotationNode = (keepAnnotations && this.annotationLayer &&
                                   this.annotationLayer.div) || null;
      for (var i = childNodes.length - 1; i >= 0; i--) {
        var node = childNodes[i];
        if (currentZoomLayerNode === node || currentAnnotationNode === node) {
          continue;
        }
        div.removeChild(node);
      }
      div.removeAttribute('data-loaded');

      if (currentAnnotationNode) {
        // Hide annotationLayer until all elements are resized
        // so they are not displayed on the already-resized page
        this.annotationLayer.hide();
      } else {
        this.annotationLayer = null;
      }

      if (this.canvas && !currentZoomLayerNode) {
        // Zeroing the width and height causes Firefox to release graphics
        // resources immediately, which can greatly reduce memory consumption.
        this.canvas.width = 0;
        this.canvas.height = 0;
        delete this.canvas;
      }

      this.loadingIconDiv = document.createElement('div');
      this.loadingIconDiv.className = 'loadingIcon';
      div.appendChild(this.loadingIconDiv);
    },

    update: function PDFPageView_update(scale, rotation) {
      this.scale = scale || this.scale;

      if (typeof rotation !== 'undefined') {
        this.rotation = rotation;
      }

      var totalRotation = (this.rotation + this.pdfPageRotate) % 360;
      this.viewport = this.viewport.clone({
        scale: this.scale * CSS_UNITS,
        rotation: totalRotation
      });

      var isScalingRestricted = false;
      if (this.canvas && pdfjsLib.PDFJS.maxCanvasPixels > 0) {
        var outputScale = this.outputScale;
        if (((Math.floor(this.viewport.width) * outputScale.sx) | 0) *
            ((Math.floor(this.viewport.height) * outputScale.sy) | 0) >
            pdfjsLib.PDFJS.maxCanvasPixels) {
          isScalingRestricted = true;
        }
      }

      if (this.canvas) {
        if (pdfjsLib.PDFJS.useOnlyCssZoom ||
            (this.hasRestrictedScaling && isScalingRestricted)) {
          this.cssTransform(this.canvas, true);

          this.eventBus.dispatch('pagerendered', {
            source: this,
            pageNumber: this.id,
            cssTransform: true,
          });
          return;
        }
        if (!this.zoomLayer) {
          this.zoomLayer = this.canvas.parentNode;
          this.zoomLayer.style.position = 'absolute';
        }
      }
      if (this.zoomLayer) {
        this.cssTransform(this.zoomLayer.firstChild);
      }
      this.reset(/* keepZoomLayer = */ true, /* keepAnnotations = */ true);
    },

    /**
     * Called when moved in the parent's container.
     */
    updatePosition: function PDFPageView_updatePosition() {
      if (this.textLayer) {
        this.textLayer.render(TEXT_LAYER_RENDER_DELAY);
      }
    },

    cssTransform: function PDFPageView_transform(canvas, redrawAnnotations) {
      var CustomStyle = pdfjsLib.CustomStyle;

      // Scale canvas, canvas wrapper, and page container.
      var width = this.viewport.width;
      var height = this.viewport.height;
      var div = this.div;
      canvas.style.width = canvas.parentNode.style.width = div.style.width =
        Math.floor(width) + 'px';
      canvas.style.height = canvas.parentNode.style.height = div.style.height =
        Math.floor(height) + 'px';
      // The canvas may have been originally rotated, rotate relative to that.
      var relativeRotation = this.viewport.rotation - canvas._viewport.rotation;
      var absRotation = Math.abs(relativeRotation);
      var scaleX = 1, scaleY = 1;
      if (absRotation === 90 || absRotation === 270) {
        // Scale x and y because of the rotation.
        scaleX = height / width;
        scaleY = width / height;
      }
      var cssTransform = 'rotate(' + relativeRotation + 'deg) ' +
        'scale(' + scaleX + ',' + scaleY + ')';
      CustomStyle.setProp('transform', canvas, cssTransform);

      if (this.textLayer) {
        // Rotating the text layer is more complicated since the divs inside the
        // the text layer are rotated.
        // TODO: This could probably be simplified by drawing the text layer in
        // one orientation then rotating overall.
        var textLayerViewport = this.textLayer.viewport;
        var textRelativeRotation = this.viewport.rotation -
          textLayerViewport.rotation;
        var textAbsRotation = Math.abs(textRelativeRotation);
        var scale = width / textLayerViewport.width;
        if (textAbsRotation === 90 || textAbsRotation === 270) {
          scale = width / textLayerViewport.height;
        }
        var textLayerDiv = this.textLayer.textLayerDiv;
        var transX, transY;
        switch (textAbsRotation) {
          case 0:
            transX = transY = 0;
            break;
          case 90:
            transX = 0;
            transY = '-' + textLayerDiv.style.height;
            break;
          case 180:
            transX = '-' + textLayerDiv.style.width;
            transY = '-' + textLayerDiv.style.height;
            break;
          case 270:
            transX = '-' + textLayerDiv.style.width;
            transY = 0;
            break;
          default:
            console.error('Bad rotation value.');
            break;
        }
        CustomStyle.setProp('transform', textLayerDiv,
            'rotate(' + textAbsRotation + 'deg) ' +
            'scale(' + scale + ', ' + scale + ') ' +
            'translate(' + transX + ', ' + transY + ')');
        CustomStyle.setProp('transformOrigin', textLayerDiv, '0% 0%');
      }

      if (redrawAnnotations && this.annotationLayer) {
        this.annotationLayer.render(this.viewport, 'display');
      }
    },

    get width() {
      return this.viewport.width;
    },

    get height() {
      return this.viewport.height;
    },

    getPagePoint: function PDFPageView_getPagePoint(x, y) {
      return this.viewport.convertToPdfPoint(x, y);
    },

    draw: function PDFPageView_draw() {
      if (this.renderingState !== RenderingStates.INITIAL) {
        console.error('Must be in new state before drawing');
      }

      this.renderingState = RenderingStates.RUNNING;

      var pdfPage = this.pdfPage;
      var viewport = this.viewport;
      var div = this.div;
      // Wrap the canvas so if it has a css transform for highdpi the overflow
      // will be hidden in FF.
      var canvasWrapper = document.createElement('div');
      canvasWrapper.style.width = div.style.width;
      canvasWrapper.style.height = div.style.height;
      canvasWrapper.classList.add('canvasWrapper');

      var canvas = document.createElement('canvas');
      canvas.id = 'page' + this.id;
      // Keep the canvas hidden until the first draw callback, or until drawing
      // is complete when `!this.renderingQueue`, to prevent black flickering.
      canvas.setAttribute('hidden', 'hidden');
      var isCanvasHidden = true;

      canvasWrapper.appendChild(canvas);
      if (this.annotationLayer && this.annotationLayer.div) {
        // annotationLayer needs to stay on top
        div.insertBefore(canvasWrapper, this.annotationLayer.div);
      } else {
        div.appendChild(canvasWrapper);
      }
      this.canvas = canvas;

      canvas.mozOpaque = true;
      var ctx = canvas.getContext('2d', {alpha: false});
      var outputScale = getOutputScale(ctx);
      this.outputScale = outputScale;

      if (pdfjsLib.PDFJS.useOnlyCssZoom) {
        var actualSizeViewport = viewport.clone({scale: CSS_UNITS});
        // Use a scale that will make the canvas be the original intended size
        // of the page.
        outputScale.sx *= actualSizeViewport.width / viewport.width;
        outputScale.sy *= actualSizeViewport.height / viewport.height;
        outputScale.scaled = true;
      }

      if (pdfjsLib.PDFJS.maxCanvasPixels > 0) {
        var pixelsInViewport = viewport.width * viewport.height;
        var maxScale =
          Math.sqrt(pdfjsLib.PDFJS.maxCanvasPixels / pixelsInViewport);
        if (outputScale.sx > maxScale || outputScale.sy > maxScale) {
          outputScale.sx = maxScale;
          outputScale.sy = maxScale;
          outputScale.scaled = true;
          this.hasRestrictedScaling = true;
        } else {
          this.hasRestrictedScaling = false;
        }
      }

      var sfx = approximateFraction(outputScale.sx);
      var sfy = approximateFraction(outputScale.sy);
      canvas.width = roundToDivide(viewport.width * outputScale.sx, sfx[0]);
      canvas.height = roundToDivide(viewport.height * outputScale.sy, sfy[0]);
      canvas.style.width = roundToDivide(viewport.width, sfx[1]) + 'px';
      canvas.style.height = roundToDivide(viewport.height, sfy[1]) + 'px';
      // Add the viewport so it's known what it was originally drawn with.
      canvas._viewport = viewport;

      var textLayerDiv = null;
      var textLayer = null;
      if (this.textLayerFactory) {
        textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        textLayerDiv.style.width = canvasWrapper.style.width;
        textLayerDiv.style.height = canvasWrapper.style.height;
        if (this.annotationLayer && this.annotationLayer.div) {
          // annotationLayer needs to stay on top
          div.insertBefore(textLayerDiv, this.annotationLayer.div);
        } else {
          div.appendChild(textLayerDiv);
        }

        textLayer = this.textLayerFactory.createTextLayerBuilder(textLayerDiv,
                                                                 this.id - 1,
                                                                 this.viewport);
      }
      this.textLayer = textLayer;

      var resolveRenderPromise, rejectRenderPromise;
      var promise = new Promise(function (resolve, reject) {
        resolveRenderPromise = resolve;
        rejectRenderPromise = reject;
      });

      // Rendering area

      var self = this;
      function pageViewDrawCallback(error) {
        // The renderTask may have been replaced by a new one, so only remove
        // the reference to the renderTask if it matches the one that is
        // triggering this callback.
        if (renderTask === self.renderTask) {
          self.renderTask = null;
        }

        if (error === 'cancelled') {
          rejectRenderPromise(error);
          return;
        }

        self.renderingState = RenderingStates.FINISHED;

        if (isCanvasHidden) {
          self.canvas.removeAttribute('hidden');
          isCanvasHidden = false;
        }

        if (self.loadingIconDiv) {
          div.removeChild(self.loadingIconDiv);
          delete self.loadingIconDiv;
        }

        if (self.zoomLayer) {
          // Zeroing the width and height causes Firefox to release graphics
          // resources immediately, which can greatly reduce memory consumption.
          var zoomLayerCanvas = self.zoomLayer.firstChild;
          zoomLayerCanvas.width = 0;
          zoomLayerCanvas.height = 0;

          if (div.contains(self.zoomLayer)) {
            // Prevent "Node was not found" errors if the `zoomLayer` was
            // already removed. This may occur intermittently if the scale
            // changes many times in very quick succession.
            div.removeChild(self.zoomLayer);
          }
          self.zoomLayer = null;
        }

        self.error = error;
        self.stats = pdfPage.stats;
        if (self.onAfterDraw) {
          self.onAfterDraw();
        }
        self.eventBus.dispatch('pagerendered', {
          source: self,
          pageNumber: self.id,
          cssTransform: false,
        });

        if (!error) {
          resolveRenderPromise(undefined);
        } else {
          rejectRenderPromise(error);
        }
      }

      var renderContinueCallback = null;
      if (this.renderingQueue) {
        renderContinueCallback = function renderContinueCallback(cont) {
          if (!self.renderingQueue.isHighestPriority(self)) {
            self.renderingState = RenderingStates.PAUSED;
            self.resume = function resumeCallback() {
              self.renderingState = RenderingStates.RUNNING;
              cont();
            };
            return;
          }
          if (isCanvasHidden) {
            self.canvas.removeAttribute('hidden');
            isCanvasHidden = false;
          }
          cont();
        };
      }

      var transform = !outputScale.scaled ? null :
        [outputScale.sx, 0, 0, outputScale.sy, 0, 0];
      var renderContext = {
        canvasContext: ctx,
        transform: transform,
        viewport: this.viewport,
        // intent: 'default', // === 'display'
      };
      var renderTask = this.renderTask = this.pdfPage.render(renderContext);
      renderTask.onContinue = renderContinueCallback;

      this.renderTask.promise.then(
        function pdfPageRenderCallback() {
          pageViewDrawCallback(null);
          if (textLayer) {
            self.pdfPage.getTextContent({ normalizeWhitespace: true }).then(
              function textContentResolved(textContent) {
                textLayer.setTextContent(textContent);
                textLayer.render(TEXT_LAYER_RENDER_DELAY);
              }
            );
          }
        },
        function pdfPageRenderError(error) {
          pageViewDrawCallback(error);
        }
      );

      if (this.annotationLayerFactory) {
        if (!this.annotationLayer) {
          this.annotationLayer = this.annotationLayerFactory.
            createAnnotationLayerBuilder(div, this.pdfPage);
        }
        this.annotationLayer.render(this.viewport, 'display');
      }
      div.setAttribute('data-loaded', true);

      if (self.onBeforeDraw) {
        self.onBeforeDraw();
      }
      return promise;
    },

    beforePrint: function PDFPageView_beforePrint(printContainer) {
      var CustomStyle = pdfjsLib.CustomStyle;
      var pdfPage = this.pdfPage;

      var viewport = pdfPage.getViewport(1);
      // Use the same hack we use for high dpi displays for printing to get
      // better output until bug 811002 is fixed in FF.
      var PRINT_OUTPUT_SCALE = 2;
      var canvas = document.createElement('canvas');

      // The logical size of the canvas.
      canvas.width = Math.floor(viewport.width) * PRINT_OUTPUT_SCALE;
      canvas.height = Math.floor(viewport.height) * PRINT_OUTPUT_SCALE;

      // The rendered size of the canvas, relative to the size of canvasWrapper.
      canvas.style.width = (PRINT_OUTPUT_SCALE * 100) + '%';

      var cssScale = 'scale(' + (1 / PRINT_OUTPUT_SCALE) + ', ' +
                                (1 / PRINT_OUTPUT_SCALE) + ')';
      CustomStyle.setProp('transform' , canvas, cssScale);
      CustomStyle.setProp('transformOrigin' , canvas, '0% 0%');

      var canvasWrapper = document.createElement('div');
      canvasWrapper.appendChild(canvas);
      printContainer.appendChild(canvasWrapper);

      canvas.mozPrintCallback = function(obj) {
        var ctx = obj.context;

        ctx.save();
        ctx.fillStyle = 'rgb(255, 255, 255)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        // Used by the mozCurrentTransform polyfill in src/display/canvas.js.
        ctx._transformMatrix =
          [PRINT_OUTPUT_SCALE, 0, 0, PRINT_OUTPUT_SCALE, 0, 0];
        ctx.scale(PRINT_OUTPUT_SCALE, PRINT_OUTPUT_SCALE);

        var renderContext = {
          canvasContext: ctx,
          viewport: viewport,
          intent: 'print'
        };

        pdfPage.render(renderContext).promise.then(function() {
          // Tell the printEngine that rendering this canvas/page has finished.
          obj.done();
        }, function(error) {
          console.error(error);
          // Tell the printEngine that rendering this canvas/page has failed.
          // This will make the print proces stop.
          if ('abort' in obj) {
            obj.abort();
          } else {
            obj.done();
          }
        });
      };
    },
  };

  return PDFPageView;
})();

exports.PDFPageView = PDFPageView;
}));


(function (root, factory) {
  {
    factory((root.pdfjsWebTextLayerBuilder = {}), root.pdfjsWebDOMEvents,
      root.pdfjsWebPDFJS);
  }
}(this, function (exports, domEvents, pdfjsLib) {

/**
 * @typedef {Object} TextLayerBuilderOptions
 * @property {HTMLDivElement} textLayerDiv - The text layer container.
 * @property {EventBus} eventBus - The application event bus.
 * @property {number} pageIndex - The page index.
 * @property {PageViewport} viewport - The viewport of the text layer.
 * @property {PDFFindController} findController
 */

/**
 * TextLayerBuilder provides text-selection functionality for the PDF.
 * It does this by creating overlay divs over the PDF text. These divs
 * contain text that matches the PDF text they are overlaying. This object
 * also provides a way to highlight text that is being searched for.
 * @class
 */
var TextLayerBuilder = (function TextLayerBuilderClosure() {
  function TextLayerBuilder(options) {
    this.textLayerDiv = options.textLayerDiv;
    this.eventBus = options.eventBus || domEvents.getGlobalEventBus();
    this.renderingDone = false;
    this.divContentDone = false;
    this.pageIdx = options.pageIndex;
    this.pageNumber = this.pageIdx + 1;
    this.matches = [];
    this.viewport = options.viewport;
    this.textDivs = [];
    this.findController = options.findController || null;
    this.textLayerRenderTask = null;
    this._bindMouse();
  }

  TextLayerBuilder.prototype = {
    _finishRendering: function TextLayerBuilder_finishRendering() {
      this.renderingDone = true;

      var endOfContent = document.createElement('div');
      endOfContent.className = 'endOfContent';
      this.textLayerDiv.appendChild(endOfContent);

      this.eventBus.dispatch('textlayerrendered', {
        source: this,
        pageNumber: this.pageNumber
      });
    },

    /**
     * Renders the text layer.
     * @param {number} timeout (optional) if specified, the rendering waits
     *   for specified amount of ms.
     */
    render: function TextLayerBuilder_render(timeout) {
      if (!this.divContentDone || this.renderingDone) {
        return;
      }

      if (this.textLayerRenderTask) {
        this.textLayerRenderTask.cancel();
        this.textLayerRenderTask = null;
      }

      this.textDivs = [];
      var textLayerFrag = document.createDocumentFragment();
      this.textLayerRenderTask = pdfjsLib.renderTextLayer({
        textContent: this.textContent,
        container: textLayerFrag,
        viewport: this.viewport,
        textDivs: this.textDivs,
        timeout: timeout
      });
      this.textLayerRenderTask.promise.then(function () {
        this.textLayerDiv.appendChild(textLayerFrag);
        this._finishRendering();
        this.updateMatches();
      }.bind(this), function (reason) {
        // canceled or failed to render text layer -- skipping errors
      });
    },

    setTextContent: function TextLayerBuilder_setTextContent(textContent) {
      if (this.textLayerRenderTask) {
        this.textLayerRenderTask.cancel();
        this.textLayerRenderTask = null;
      }
      this.textContent = textContent;
      this.divContentDone = true;
    },

    convertMatches: function TextLayerBuilder_convertMatches(matches) {
      var i = 0;
      var iIndex = 0;
      var bidiTexts = this.textContent.items;
      var end = bidiTexts.length - 1;
      var queryLen = (this.findController === null ?
                      0 : this.findController.state.query.length);
      var ret = [];

      for (var m = 0, len = matches.length; m < len; m++) {
        // Calculate the start position.
        var matchIdx = matches[m];

        // Loop over the divIdxs.
        while (i !== end && matchIdx >= (iIndex + bidiTexts[i].str.length)) {
          iIndex += bidiTexts[i].str.length;
          i++;
        }

        if (i === bidiTexts.length) {
          console.error('Could not find a matching mapping');
        }

        var match = {
          begin: {
            divIdx: i,
            offset: matchIdx - iIndex
          }
        };

        // Calculate the end position.
        matchIdx += queryLen;

        // Somewhat the same array as above, but use > instead of >= to get
        // the end position right.
        while (i !== end && matchIdx > (iIndex + bidiTexts[i].str.length)) {
          iIndex += bidiTexts[i].str.length;
          i++;
        }

        match.end = {
          divIdx: i,
          offset: matchIdx - iIndex
        };
        ret.push(match);
      }

      return ret;
    },

    renderMatches: function TextLayerBuilder_renderMatches(matches) {
      // Early exit if there is nothing to render.
      if (matches.length === 0) {
        return;
      }

      var bidiTexts = this.textContent.items;
      var textDivs = this.textDivs;
      var prevEnd = null;
      var pageIdx = this.pageIdx;
      var isSelectedPage = (this.findController === null ?
        false : (pageIdx === this.findController.selected.pageIdx));
      var selectedMatchIdx = (this.findController === null ?
                              -1 : this.findController.selected.matchIdx);
      var highlightAll = (this.findController === null ?
                          false : this.findController.state.highlightAll);
      var infinity = {
        divIdx: -1,
        offset: undefined
      };

      function beginText(begin, className) {
        var divIdx = begin.divIdx;
        textDivs[divIdx].textContent = '';
        appendTextToDiv(divIdx, 0, begin.offset, className);
      }

      function appendTextToDiv(divIdx, fromOffset, toOffset, className) {
        var div = textDivs[divIdx];
        var content = bidiTexts[divIdx].str.substring(fromOffset, toOffset);
        var node = document.createTextNode(content);
        if (className) {
          var span = document.createElement('span');
          span.className = className;
          span.appendChild(node);
          div.appendChild(span);
          return;
        }
        div.appendChild(node);
      }

      var i0 = selectedMatchIdx, i1 = i0 + 1;
      if (highlightAll) {
        i0 = 0;
        i1 = matches.length;
      } else if (!isSelectedPage) {
        // Not highlighting all and this isn't the selected page, so do nothing.
        return;
      }

      for (var i = i0; i < i1; i++) {
        var match = matches[i];
        var begin = match.begin;
        var end = match.end;
        var isSelected = (isSelectedPage && i === selectedMatchIdx);
        var highlightSuffix = (isSelected ? ' selected' : '');

        if (this.findController) {
          this.findController.updateMatchPosition(pageIdx, i, textDivs,
                                                  begin.divIdx);
        }

        // Match inside new div.
        if (!prevEnd || begin.divIdx !== prevEnd.divIdx) {
          // If there was a previous div, then add the text at the end.
          if (prevEnd !== null) {
            appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
          }
          // Clear the divs and set the content until the starting point.
          beginText(begin);
        } else {
          appendTextToDiv(prevEnd.divIdx, prevEnd.offset, begin.offset);
        }

        if (begin.divIdx === end.divIdx) {
          appendTextToDiv(begin.divIdx, begin.offset, end.offset,
                          'highlight' + highlightSuffix);
        } else {
          appendTextToDiv(begin.divIdx, begin.offset, infinity.offset,
                          'highlight begin' + highlightSuffix);
          for (var n0 = begin.divIdx + 1, n1 = end.divIdx; n0 < n1; n0++) {
            textDivs[n0].className = 'highlight middle' + highlightSuffix;
          }
          beginText(end, 'highlight end' + highlightSuffix);
        }
        prevEnd = end;
      }

      if (prevEnd) {
        appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
      }
    },

    updateMatches: function TextLayerBuilder_updateMatches() {
      // Only show matches when all rendering is done.
      if (!this.renderingDone) {
        return;
      }

      // Clear all matches.
      var matches = this.matches;
      var textDivs = this.textDivs;
      var bidiTexts = this.textContent.items;
      var clearedUntilDivIdx = -1;

      // Clear all current matches.
      for (var i = 0, len = matches.length; i < len; i++) {
        var match = matches[i];
        var begin = Math.max(clearedUntilDivIdx, match.begin.divIdx);
        for (var n = begin, end = match.end.divIdx; n <= end; n++) {
          var div = textDivs[n];
          div.textContent = bidiTexts[n].str;
          div.className = '';
        }
        clearedUntilDivIdx = match.end.divIdx + 1;
      }

      if (this.findController === null || !this.findController.active) {
        return;
      }

      // Convert the matches on the page controller into the match format
      // used for the textLayer.
      this.matches = this.convertMatches(this.findController === null ?
        [] : (this.findController.pageMatches[this.pageIdx] || []));
      this.renderMatches(this.matches);
    },

    /**
     * Fixes text selection: adds additional div where mouse was clicked.
     * This reduces flickering of the content if mouse slowly dragged down/up.
     * @private
     */
    _bindMouse: function TextLayerBuilder_bindMouse() {
      var div = this.textLayerDiv;
      div.addEventListener('mousedown', function (e) {
        var end = div.querySelector('.endOfContent');
        if (!end) {
          return;
        }
        // On non-Firefox browsers, the selection will feel better if the height
        // of the endOfContent div will be adjusted to start at mouse click
        // location -- this will avoid flickering when selections moves up.
        // However it does not work when selection started on empty space.
        var adjustTop = e.target !== div;
        adjustTop = adjustTop && window.getComputedStyle(end).
          getPropertyValue('-moz-user-select') !== 'none';
        if (adjustTop) {
          var divBounds = div.getBoundingClientRect();
          var r = Math.max(0, (e.pageY - divBounds.top) / divBounds.height);
          end.style.top = (r * 100).toFixed(2) + '%';
        }
        end.classList.add('active');
      });
      div.addEventListener('mouseup', function (e) {
        var end = div.querySelector('.endOfContent');
        if (!end) {
          return;
        }
        end.style.top = '';
        end.classList.remove('active');
      });
    },
  };
  return TextLayerBuilder;
})();

/**
 * @constructor
 * @implements IPDFTextLayerFactory
 */
function DefaultTextLayerFactory() {}
DefaultTextLayerFactory.prototype = {
  /**
   * @param {HTMLDivElement} textLayerDiv
   * @param {number} pageIndex
   * @param {PageViewport} viewport
   * @returns {TextLayerBuilder}
   */
  createTextLayerBuilder: function (textLayerDiv, pageIndex, viewport) {
    return new TextLayerBuilder({
      textLayerDiv: textLayerDiv,
      pageIndex: pageIndex,
      viewport: viewport
    });
  }
};

exports.TextLayerBuilder = TextLayerBuilder;
exports.DefaultTextLayerFactory = DefaultTextLayerFactory;
}));


(function (root, factory) {
  {
    factory((root.pdfjsWebAnnotationLayerBuilder = {}), root.pdfjsWebUIUtils,
      root.pdfjsWebPDFLinkService, root.pdfjsWebPDFJS);
  }
}(this, function (exports, uiUtils, pdfLinkService, pdfjsLib) {

var mozL10n = uiUtils.mozL10n;
var SimpleLinkService = pdfLinkService.SimpleLinkService;

/**
 * @typedef {Object} AnnotationLayerBuilderOptions
 * @property {HTMLDivElement} pageDiv
 * @property {PDFPage} pdfPage
 * @property {IPDFLinkService} linkService
 * @property {DownloadManager} downloadManager
 */

/**
 * @class
 */
var AnnotationLayerBuilder = (function AnnotationLayerBuilderClosure() {
  /**
   * @param {AnnotationLayerBuilderOptions} options
   * @constructs AnnotationLayerBuilder
   */
  function AnnotationLayerBuilder(options) {
    this.pageDiv = options.pageDiv;
    this.pdfPage = options.pdfPage;
    this.linkService = options.linkService;
    this.downloadManager = options.downloadManager;

    this.div = null;
  }

  AnnotationLayerBuilder.prototype =
      /** @lends AnnotationLayerBuilder.prototype */ {

    /**
     * @param {PageViewport} viewport
     * @param {string} intent (default value is 'display')
     */
    render: function AnnotationLayerBuilder_render(viewport, intent) {
      var self = this;
      var parameters = {
        intent: (intent === undefined ? 'display' : intent),
      };

      this.pdfPage.getAnnotations(parameters).then(function (annotations) {
        viewport = viewport.clone({ dontFlip: true });
        parameters = {
          viewport: viewport,
          div: self.div,
          annotations: annotations,
          page: self.pdfPage,
          linkService: self.linkService,
          downloadManager: self.downloadManager
        };

        if (self.div) {
          // If an annotationLayer already exists, refresh its children's
          // transformation matrices.
          pdfjsLib.AnnotationLayer.update(parameters);
        } else {
          // Create an annotation layer div and render the annotations
          // if there is at least one annotation.
          if (annotations.length === 0) {
            return;
          }

          self.div = document.createElement('div');
          self.div.className = 'annotationLayer';
          self.pageDiv.appendChild(self.div);
          parameters.div = self.div;

          pdfjsLib.AnnotationLayer.render(parameters);
          if (typeof mozL10n !== 'undefined') {
            mozL10n.translate(self.div);
          }
        }
      });
    },

    hide: function AnnotationLayerBuilder_hide() {
      if (!this.div) {
        return;
      }
      this.div.setAttribute('hidden', 'true');
    }
  };

  return AnnotationLayerBuilder;
})();

/**
 * @constructor
 * @implements IPDFAnnotationLayerFactory
 */
function DefaultAnnotationLayerFactory() {}
DefaultAnnotationLayerFactory.prototype = {
  /**
   * @param {HTMLDivElement} pageDiv
   * @param {PDFPage} pdfPage
   * @returns {AnnotationLayerBuilder}
   */
  createAnnotationLayerBuilder: function (pageDiv, pdfPage) {
    return new AnnotationLayerBuilder({
      pageDiv: pageDiv,
      pdfPage: pdfPage,
      linkService: new SimpleLinkService(),
    });
  }
};

exports.AnnotationLayerBuilder = AnnotationLayerBuilder;
exports.DefaultAnnotationLayerFactory = DefaultAnnotationLayerFactory;
}));


(function (root, factory) {
  {
    factory((root.pdfjsWebPDFViewer = {}), root.pdfjsWebUIUtils,
      root.pdfjsWebPDFPageView, root.pdfjsWebPDFRenderingQueue,
      root.pdfjsWebTextLayerBuilder, root.pdfjsWebAnnotationLayerBuilder,
      root.pdfjsWebPDFLinkService, root.pdfjsWebDOMEvents, root.pdfjsWebPDFJS);
  }
}(this, function (exports, uiUtils, pdfPageView, pdfRenderingQueue,
                  textLayerBuilder, annotationLayerBuilder, pdfLinkService,
                  domEvents, pdfjsLib) {

var UNKNOWN_SCALE = uiUtils.UNKNOWN_SCALE;
var SCROLLBAR_PADDING = uiUtils.SCROLLBAR_PADDING;
var VERTICAL_PADDING = uiUtils.VERTICAL_PADDING;
var MAX_AUTO_SCALE = uiUtils.MAX_AUTO_SCALE;
var CSS_UNITS = uiUtils.CSS_UNITS;
var DEFAULT_SCALE = uiUtils.DEFAULT_SCALE;
var DEFAULT_SCALE_VALUE = uiUtils.DEFAULT_SCALE_VALUE;
var scrollIntoView = uiUtils.scrollIntoView;
var watchScroll = uiUtils.watchScroll;
var getVisibleElements = uiUtils.getVisibleElements;
var PDFPageView = pdfPageView.PDFPageView;
var RenderingStates = pdfRenderingQueue.RenderingStates;
var PDFRenderingQueue = pdfRenderingQueue.PDFRenderingQueue;
var TextLayerBuilder = textLayerBuilder.TextLayerBuilder;
var AnnotationLayerBuilder = annotationLayerBuilder.AnnotationLayerBuilder;
var SimpleLinkService = pdfLinkService.SimpleLinkService;

var PresentationModeState = {
  UNKNOWN: 0,
  NORMAL: 1,
  CHANGING: 2,
  FULLSCREEN: 3,
};

var DEFAULT_CACHE_SIZE = 10;

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
 *   around the pages. The default is false.
 */

/**
 * Simple viewer control to display PDF content/pages.
 * @class
 * @implements {IRenderableView}
 */
var PDFViewer = (function pdfViewer() {
  function PDFPageViewBuffer(size) {
    var data = [];
    this.push = function cachePush(view) {
      var i = data.indexOf(view);
      if (i >= 0) {
        data.splice(i, 1);
      }
      data.push(view);
      if (data.length > size) {
        data.shift().destroy();
      }
    };
    this.resize = function (newSize) {
      size = newSize;
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
      // Prevent unnecessary re-rendering of all pages when the scale
      // changes only because of limited numerical precision.
      return true;
    }
    return false;
  }

  /**
   * @constructs PDFViewer
   * @param {PDFViewerOptions} options
   */
  function PDFViewer(options) {
    this.container = options.container;
    this.viewer = options.viewer || options.container.firstElementChild;
    this.eventBus = options.eventBus || domEvents.getGlobalEventBus();
    this.linkService = options.linkService || new SimpleLinkService();
    this.downloadManager = options.downloadManager || null;
    this.removePageBorders = options.removePageBorders || false;

    this.defaultRenderingQueue = !options.renderingQueue;
    if (this.defaultRenderingQueue) {
      // Custom rendering queue is not specified, using default one
      this.renderingQueue = new PDFRenderingQueue();
      this.renderingQueue.setViewer(this);
    } else {
      this.renderingQueue = options.renderingQueue;
    }

    this.scroll = watchScroll(this.container, this._scrollUpdate.bind(this));
    this.presentationModeState = PresentationModeState.UNKNOWN;
    this._resetView();

    if (this.removePageBorders) {
      this.viewer.classList.add('removePageBorders');
    }
  }

  PDFViewer.prototype = /** @lends PDFViewer.prototype */{
    get pagesCount() {
      return this._pages.length;
    },

    getPageView: function (index) {
      return this._pages[index];
    },

    get currentPageNumber() {
      return this._currentPageNumber;
    },

    set currentPageNumber(val) {
      if (!this.pdfDocument) {
        this._currentPageNumber = val;
        return;
      }
      this._setCurrentPageNumber(val);
      // The intent can be to just reset a scroll position and/or scale.
      this._resetCurrentPageView();
    },

    _setCurrentPageNumber: function pdfViewer_setCurrentPageNumber(val) {
      if (this._currentPageNumber === val) {
        return;
      }
      var arg;
      if (!(0 < val && val <= this.pagesCount)) {
        arg = {
          source: this,
          pageNumber: this._currentPageNumber,
          previousPageNumber: val
        };
        this.eventBus.dispatch('pagechanging', arg);
        this.eventBus.dispatch('pagechange', arg);
        return;
      }

      arg = {
        source: this,
        pageNumber: val,
        previousPageNumber: this._currentPageNumber
      };
      this._currentPageNumber = val;
      this.eventBus.dispatch('pagechanging', arg);
      this.eventBus.dispatch('pagechange', arg);
    },

    /**
     * @returns {number}
     */
    get currentScale() {
      return this._currentScale !== UNKNOWN_SCALE ? this._currentScale :
                                                    DEFAULT_SCALE;
    },

    /**
     * @param {number} val - Scale of the pages in percents.
     */
    set currentScale(val) {
      if (isNaN(val))  {
        throw new Error('Invalid numeric scale');
      }
      if (!this.pdfDocument) {
        this._currentScale = val;
        this._currentScaleValue = val !== UNKNOWN_SCALE ? val.toString() : null;
        return;
      }
      this._setScale(val, false);
    },

    /**
     * @returns {string}
     */
    get currentScaleValue() {
      return this._currentScaleValue;
    },

    /**
     * @param val - The scale of the pages (in percent or predefined value).
     */
    set currentScaleValue(val) {
      if (!this.pdfDocument) {
        this._currentScale = isNaN(val) ? UNKNOWN_SCALE : val;
        this._currentScaleValue = val;
        return;
      }
      this._setScale(val, false);
    },

    /**
     * @returns {number}
     */
    get pagesRotation() {
      return this._pagesRotation;
    },

    /**
     * @param {number} rotation - The rotation of the pages (0, 90, 180, 270).
     */
    set pagesRotation(rotation) {
      this._pagesRotation = rotation;

      for (var i = 0, l = this._pages.length; i < l; i++) {
        var pageView = this._pages[i];
        pageView.update(pageView.scale, rotation);
      }

      this._setScale(this._currentScaleValue, true);

      if (this.defaultRenderingQueue) {
        this.update();
      }
    },

    /**
     * @param pdfDocument {PDFDocument}
     */
    setDocument: function (pdfDocument) {
      if (this.pdfDocument) {
        this._resetView();
      }

      this.pdfDocument = pdfDocument;
      if (!pdfDocument) {
        return;
      }

      var pagesCount = pdfDocument.numPages;
      var self = this;

      var resolvePagesPromise;
      var pagesPromise = new Promise(function (resolve) {
        resolvePagesPromise = resolve;
      });
      this.pagesPromise = pagesPromise;
      pagesPromise.then(function () {
        self.eventBus.dispatch('pagesloaded', {
          source: self,
          pagesCount: pagesCount
        });
      });

      var isOnePageRenderedResolved = false;
      var resolveOnePageRendered = null;
      var onePageRendered = new Promise(function (resolve) {
        resolveOnePageRendered = resolve;
      });
      this.onePageRendered = onePageRendered;

      var bindOnAfterAndBeforeDraw = function (pageView) {
        pageView.onBeforeDraw = function pdfViewLoadOnBeforeDraw() {
          // Add the page to the buffer at the start of drawing. That way it can
          // be evicted from the buffer and destroyed even if we pause its
          // rendering.
          self._buffer.push(this);
        };
        // when page is painted, using the image as thumbnail base
        pageView.onAfterDraw = function pdfViewLoadOnAfterDraw() {
          if (!isOnePageRenderedResolved) {
            isOnePageRenderedResolved = true;
            resolveOnePageRendered();
          }
        };
      };

      var firstPagePromise = pdfDocument.getPage(1);
      this.firstPagePromise = firstPagePromise;

      // Fetch a single page so we can get a viewport that will be the default
      // viewport for all pages
      return firstPagePromise.then(function(pdfPage) {
        var scale = this.currentScale;
        var viewport = pdfPage.getViewport(scale * CSS_UNITS);
        for (var pageNum = 1; pageNum <= pagesCount; ++pageNum) {
          var textLayerFactory = null;
          if (!pdfjsLib.PDFJS.disableTextLayer) {
            textLayerFactory = this;
          }
          var pageView = new PDFPageView({
            container: this.viewer,
            eventBus: this.eventBus,
            id: pageNum,
            scale: scale,
            defaultViewport: viewport.clone(),
            renderingQueue: this.renderingQueue,
            textLayerFactory: textLayerFactory,
            annotationLayerFactory: this
          });
          bindOnAfterAndBeforeDraw(pageView);
          this._pages.push(pageView);
        }

        var linkService = this.linkService;

        // Fetch all the pages since the viewport is needed before printing
        // starts to create the correct size canvas. Wait until one page is
        // rendered so we don't tie up too many resources early on.
        onePageRendered.then(function () {
          if (!pdfjsLib.PDFJS.disableAutoFetch) {
            var getPagesLeft = pagesCount;
            for (var pageNum = 1; pageNum <= pagesCount; ++pageNum) {
              pdfDocument.getPage(pageNum).then(function (pageNum, pdfPage) {
                var pageView = self._pages[pageNum - 1];
                if (!pageView.pdfPage) {
                  pageView.setPdfPage(pdfPage);
                }
                linkService.cachePageRef(pageNum, pdfPage.ref);
                getPagesLeft--;
                if (!getPagesLeft) {
                  resolvePagesPromise();
                }
              }.bind(null, pageNum));
            }
          } else {
            // XXX: Printing is semi-broken with auto fetch disabled.
            resolvePagesPromise();
          }
        });

        self.eventBus.dispatch('pagesinit', {source: self});

        if (this.defaultRenderingQueue) {
          this.update();
        }

        if (this.findController) {
          this.findController.resolveFirstPage();
        }
      }.bind(this));
    },

    _resetView: function () {
      this._pages = [];
      this._currentPageNumber = 1;
      this._currentScale = UNKNOWN_SCALE;
      this._currentScaleValue = null;
      this._buffer = new PDFPageViewBuffer(DEFAULT_CACHE_SIZE);
      this._location = null;
      this._pagesRotation = 0;
      this._pagesRequests = [];

      var container = this.viewer;
      while (container.hasChildNodes()) {
        container.removeChild(container.lastChild);
      }
    },

    _scrollUpdate: function PDFViewer_scrollUpdate() {
      if (this.pagesCount === 0) {
        return;
      }
      this.update();
      for (var i = 0, ii = this._pages.length; i < ii; i++) {
        this._pages[i].updatePosition();
      }
    },

    _setScaleDispatchEvent: function pdfViewer_setScaleDispatchEvent(
        newScale, newValue, preset) {
      var arg = {
        source: this,
        scale: newScale,
        presetValue: preset ? newValue : undefined
      };
      this.eventBus.dispatch('scalechanging', arg);
      this.eventBus.dispatch('scalechange', arg);
    },

    _setScaleUpdatePages: function pdfViewer_setScaleUpdatePages(
        newScale, newValue, noScroll, preset) {
      this._currentScaleValue = newValue;

      if (isSameScale(this._currentScale, newScale)) {
        if (preset) {
          this._setScaleDispatchEvent(newScale, newValue, true);
        }
        return;
      }

      for (var i = 0, ii = this._pages.length; i < ii; i++) {
        this._pages[i].update(newScale);
      }
      this._currentScale = newScale;

      if (!noScroll) {
        var page = this._currentPageNumber, dest;
        if (this._location && !pdfjsLib.PDFJS.ignoreCurrentPositionOnZoom &&
            !(this.isInPresentationMode || this.isChangingPresentationMode)) {
          page = this._location.pageNumber;
          dest = [null, { name: 'XYZ' }, this._location.left,
                  this._location.top, null];
        }
        this.scrollPageIntoView(page, dest);
      }

      this._setScaleDispatchEvent(newScale, newValue, preset);

      if (this.defaultRenderingQueue) {
        this.update();
      }
    },

    _setScale: function pdfViewer_setScale(value, noScroll) {
      var scale = parseFloat(value);

      if (scale > 0) {
        this._setScaleUpdatePages(scale, value, noScroll, false);
      } else {
        var currentPage = this._pages[this._currentPageNumber - 1];
        if (!currentPage) {
          return;
        }
        var hPadding = (this.isInPresentationMode || this.removePageBorders) ?
          0 : SCROLLBAR_PADDING;
        var vPadding = (this.isInPresentationMode || this.removePageBorders) ?
          0 : VERTICAL_PADDING;
        var pageWidthScale = (this.container.clientWidth - hPadding) /
                             currentPage.width * currentPage.scale;
        var pageHeightScale = (this.container.clientHeight - vPadding) /
                              currentPage.height * currentPage.scale;
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
            var isLandscape = (currentPage.width > currentPage.height);
            // For pages in landscape mode, fit the page height to the viewer
            // *unless* the page would thus become too wide to fit horizontally.
            var horizontalScale = isLandscape ?
              Math.min(pageHeightScale, pageWidthScale) : pageWidthScale;
            scale = Math.min(MAX_AUTO_SCALE, horizontalScale);
            break;
          default:
            console.error('pdfViewSetScale: \'' + value +
              '\' is an unknown zoom value.');
            return;
        }
        this._setScaleUpdatePages(scale, value, noScroll, true);
      }
    },

    /**
     * Refreshes page view: scrolls to the current page and updates the scale.
     */
    _resetCurrentPageView: function () {
      if (this.isInPresentationMode) {
        // Fixes the case when PDF has different page sizes.
        this._setScale(this._currentScaleValue, true);
      }

      var pageView = this._pages[this._currentPageNumber - 1];
      scrollIntoView(pageView.div);
    },

    /**
     * Scrolls page into view.
     * @param {number} pageNumber
     * @param {Array} dest - (optional) original PDF destination array:
     *   <page-ref> </XYZ|FitXXX> <args..>
     */
    scrollPageIntoView: function PDFViewer_scrollPageIntoView(pageNumber,
                                                              dest) {
      if (!this.pdfDocument) {
        return;
      }

      if (this.isInPresentationMode || !dest) {
        this._setCurrentPageNumber(pageNumber);
        this._resetCurrentPageView();
        return;
      }

      var pageView = this._pages[pageNumber - 1];
      var x = 0, y = 0;
      var width = 0, height = 0, widthScale, heightScale;
      var changeOrientation = (pageView.rotation % 180 === 0 ? false : true);
      var pageWidth = (changeOrientation ? pageView.height : pageView.width) /
        pageView.scale / CSS_UNITS;
      var pageHeight = (changeOrientation ? pageView.width : pageView.height) /
        pageView.scale / CSS_UNITS;
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
          y = y !== null ? y : pageHeight;
          break;
        case 'Fit':
        case 'FitB':
          scale = 'page-fit';
          break;
        case 'FitH':
        case 'FitBH':
          y = dest[2];
          scale = 'page-width';
          // According to the PDF spec, section 12.3.2.2, a `null` value in the
          // parameter should maintain the position relative to the new page.
          if (y === null && this._location) {
            x = this._location.left;
            y = this._location.top;
          }
          break;
        case 'FitV':
        case 'FitBV':
          x = dest[2];
          width = pageWidth;
          height = pageHeight;
          scale = 'page-height';
          break;
        case 'FitR':
          x = dest[2];
          y = dest[3];
          width = dest[4] - x;
          height = dest[5] - y;
          var hPadding = this.removePageBorders ? 0 : SCROLLBAR_PADDING;
          var vPadding = this.removePageBorders ? 0 : VERTICAL_PADDING;

          widthScale = (this.container.clientWidth - hPadding) /
            width / CSS_UNITS;
          heightScale = (this.container.clientHeight - vPadding) /
            height / CSS_UNITS;
          scale = Math.min(Math.abs(widthScale), Math.abs(heightScale));
          break;
        default:
          return;
      }

      if (scale && scale !== this._currentScale) {
        this.currentScaleValue = scale;
      } else if (this._currentScale === UNKNOWN_SCALE) {
        this.currentScaleValue = DEFAULT_SCALE_VALUE;
      }

      if (scale === 'page-fit' && !dest[4]) {
        scrollIntoView(pageView.div);
        return;
      }

      var boundingRect = [
        pageView.viewport.convertToViewportPoint(x, y),
        pageView.viewport.convertToViewportPoint(x + width, y + height)
      ];
      var left = Math.min(boundingRect[0][0], boundingRect[1][0]);
      var top = Math.min(boundingRect[0][1], boundingRect[1][1]);

      scrollIntoView(pageView.div, { left: left, top: top });
    },

    _updateLocation: function (firstPage) {
      var currentScale = this._currentScale;
      var currentScaleValue = this._currentScaleValue;
      var normalizedScaleValue =
        parseFloat(currentScaleValue) === currentScale ?
        Math.round(currentScale * 10000) / 100 : currentScaleValue;

      var pageNumber = firstPage.id;
      var pdfOpenParams = '#page=' + pageNumber;
      pdfOpenParams += '&zoom=' + normalizedScaleValue;
      var currentPageView = this._pages[pageNumber - 1];
      var container = this.container;
      var topLeft = currentPageView.getPagePoint(
        (container.scrollLeft - firstPage.x),
        (container.scrollTop - firstPage.y));
      var intLeft = Math.round(topLeft[0]);
      var intTop = Math.round(topLeft[1]);
      pdfOpenParams += ',' + intLeft + ',' + intTop;

      this._location = {
        pageNumber: pageNumber,
        scale: normalizedScaleValue,
        top: intTop,
        left: intLeft,
        pdfOpenParams: pdfOpenParams
      };
    },

    update: function PDFViewer_update() {
      var visible = this._getVisiblePages();
      var visiblePages = visible.views;
      if (visiblePages.length === 0) {
        return;
      }

      var suggestedCacheSize = Math.max(DEFAULT_CACHE_SIZE,
          2 * visiblePages.length + 1);
      this._buffer.resize(suggestedCacheSize);

      this.renderingQueue.renderHighestPriority(visible);

      var currentId = this._currentPageNumber;
      var firstPage = visible.first;

      for (var i = 0, ii = visiblePages.length, stillFullyVisible = false;
           i < ii; ++i) {
        var page = visiblePages[i];

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

      if (!this.isInPresentationMode) {
        this._setCurrentPageNumber(currentId);
      }

      this._updateLocation(firstPage);

      this.eventBus.dispatch('updateviewarea', {
        source: this,
        location: this._location
      });
    },

    containsElement: function (element) {
      return this.container.contains(element);
    },

    focus: function () {
      this.container.focus();
    },

    get isInPresentationMode() {
      return this.presentationModeState === PresentationModeState.FULLSCREEN;
    },

    get isChangingPresentationMode() {
      return this.presentationModeState === PresentationModeState.CHANGING;
    },

    get isHorizontalScrollbarEnabled() {
      return (this.isInPresentationMode ?
        false : (this.container.scrollWidth > this.container.clientWidth));
    },

    _getVisiblePages: function () {
      if (!this.isInPresentationMode) {
        return getVisibleElements(this.container, this._pages, true);
      } else {
        // The algorithm in getVisibleElements doesn't work in all browsers and
        // configurations when presentation mode is active.
        var visible = [];
        var currentPage = this._pages[this._currentPageNumber - 1];
        visible.push({ id: currentPage.id, view: currentPage });
        return { first: currentPage, last: currentPage, views: visible };
      }
    },

    cleanup: function () {
      for (var i = 0, ii = this._pages.length; i < ii; i++) {
        if (this._pages[i] &&
            this._pages[i].renderingState !== RenderingStates.FINISHED) {
          this._pages[i].reset();
        }
      }
    },

    /**
     * @param {PDFPageView} pageView
     * @returns {PDFPage}
     * @private
     */
    _ensurePdfPageLoaded: function (pageView) {
      if (pageView.pdfPage) {
        return Promise.resolve(pageView.pdfPage);
      }
      var pageNumber = pageView.id;
      if (this._pagesRequests[pageNumber]) {
        return this._pagesRequests[pageNumber];
      }
      var promise = this.pdfDocument.getPage(pageNumber).then(
          function (pdfPage) {
        pageView.setPdfPage(pdfPage);
        this._pagesRequests[pageNumber] = null;
        return pdfPage;
      }.bind(this));
      this._pagesRequests[pageNumber] = promise;
      return promise;
    },

    forceRendering: function (currentlyVisiblePages) {
      var visiblePages = currentlyVisiblePages || this._getVisiblePages();
      var pageView = this.renderingQueue.getHighestPriority(visiblePages,
                                                            this._pages,
                                                            this.scroll.down);
      if (pageView) {
        this._ensurePdfPageLoaded(pageView).then(function () {
          this.renderingQueue.renderView(pageView);
        }.bind(this));
        return true;
      }
      return false;
    },

    getPageTextContent: function (pageIndex) {
      return this.pdfDocument.getPage(pageIndex + 1).then(function (page) {
        return page.getTextContent({ normalizeWhitespace: true });
      });
    },

    /**
     * @param {HTMLDivElement} textLayerDiv
     * @param {number} pageIndex
     * @param {PageViewport} viewport
     * @returns {TextLayerBuilder}
     */
    createTextLayerBuilder: function (textLayerDiv, pageIndex, viewport) {
      return new TextLayerBuilder({
        textLayerDiv: textLayerDiv,
        eventBus: this.eventBus,
        pageIndex: pageIndex,
        viewport: viewport,
        findController: this.isInPresentationMode ? null : this.findController
      });
    },

    /**
     * @param {HTMLDivElement} pageDiv
     * @param {PDFPage} pdfPage
     * @returns {AnnotationLayerBuilder}
     */
    createAnnotationLayerBuilder: function (pageDiv, pdfPage) {
      return new AnnotationLayerBuilder({
        pageDiv: pageDiv,
        pdfPage: pdfPage,
        linkService: this.linkService,
        downloadManager: this.downloadManager
      });
    },

    setFindController: function (findController) {
      this.findController = findController;
    },
  };

  return PDFViewer;
})();

exports.PresentationModeState = PresentationModeState;
exports.PDFViewer = PDFViewer;
}));
  }).call(pdfViewerLibs);

  var PDFJS = pdfjsLib.PDFJS;

  PDFJS.PDFViewer = pdfViewerLibs.pdfjsWebPDFViewer.PDFViewer;
  PDFJS.PDFPageView = pdfViewerLibs.pdfjsWebPDFPageView.PDFPageView;
  PDFJS.PDFLinkService = pdfViewerLibs.pdfjsWebPDFLinkService.PDFLinkService;
  PDFJS.TextLayerBuilder =
    pdfViewerLibs.pdfjsWebTextLayerBuilder.TextLayerBuilder;
  PDFJS.DefaultTextLayerFactory =
    pdfViewerLibs.pdfjsWebTextLayerBuilder.DefaultTextLayerFactory;
  PDFJS.AnnotationLayerBuilder =
    pdfViewerLibs.pdfjsWebAnnotationLayerBuilder.AnnotationLayerBuilder;
  PDFJS.DefaultAnnotationLayerFactory =
    pdfViewerLibs.pdfjsWebAnnotationLayerBuilder.DefaultAnnotationLayerFactory;
  PDFJS.PDFHistory = pdfViewerLibs.pdfjsWebPDFHistory.PDFHistory;
  PDFJS.PDFFindController =
    pdfViewerLibs.pdfjsWebPDFFindController.PDFFindController;
  PDFJS.EventBus = pdfViewerLibs.pdfjsWebUIUtils.EventBus;

  PDFJS.DownloadManager = pdfViewerLibs.pdfjsWebDownloadManager.DownloadManager;
  PDFJS.ProgressBar = pdfViewerLibs.pdfjsWebUIUtils.ProgressBar;

  exports.PDFJS = PDFJS;
}));

