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

import { PDFJS } from 'pdfjs-lib';

const CSS_UNITS = 96.0 / 72.0;
const DEFAULT_SCALE_VALUE = 'auto';
const DEFAULT_SCALE = 1.0;
const MIN_SCALE = 0.25;
const MAX_SCALE = 10.0;
const UNKNOWN_SCALE = 0;
const MAX_AUTO_SCALE = 1.25;
const SCROLLBAR_PADDING = 40;
const VERTICAL_PADDING = 5;

const RendererType = {
  CANVAS: 'canvas',
  SVG: 'svg',
};

// Replaces {{arguments}} with their values.
function formatL10nValue(text, args) {
  if (!args) {
    return text;
  }
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, name) => {
    return (name in args ? args[name] : '{{' + name + '}}');
  });
}

/**
 * No-op implemetation of the localization service.
 * @implements {IL10n}
 */
let NullL10n = {
  get(property, args, fallback) {
    return Promise.resolve(formatL10nValue(fallback, args));
  },

  translate(element) {
    return Promise.resolve();
  },
};

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

if (typeof PDFJSDev === 'undefined' ||
    !PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
  /**
   * Interface locale settings.
   * @var {string}
   */
  PDFJS.locale =
    (PDFJS.locale === undefined && typeof navigator !== 'undefined' ?
     navigator.language : PDFJS.locale);
}

/**
 * Returns scale factor for the canvas. It makes sense for the HiDPI displays.
 * @return {Object} The object with horizontal (sx) and vertical (sy)
                    scales. The scaled property is set to false if scaling is
                    not required, true otherwise.
 */
function getOutputScale(ctx) {
  let devicePixelRatio = window.devicePixelRatio || 1;
  let backingStoreRatio = ctx.webkitBackingStorePixelRatio ||
                          ctx.mozBackingStorePixelRatio ||
                          ctx.msBackingStorePixelRatio ||
                          ctx.oBackingStorePixelRatio ||
                          ctx.backingStorePixelRatio || 1;
  let pixelRatio = devicePixelRatio / backingStoreRatio;
  return {
    sx: pixelRatio,
    sy: pixelRatio,
    scaled: pixelRatio !== 1,
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
function scrollIntoView(element, spot, skipOverflowHiddenElements = false) {
  // Assuming offsetParent is available (it's not available when viewer is in
  // hidden iframe or object). We have to scroll: if the offsetParent is not set
  // producing the error. See also animationStarted.
  let parent = element.offsetParent;
  if (!parent) {
    console.error('offsetParent is not set -- cannot scroll');
    return;
  }
  let offsetY = element.offsetTop + element.clientTop;
  let offsetX = element.offsetLeft + element.clientLeft;
  while (parent.clientHeight === parent.scrollHeight ||
         (skipOverflowHiddenElements &&
          getComputedStyle(parent).overflow === 'hidden')) {
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
  let debounceScroll = function(evt) {
    if (rAF) {
      return;
    }
    // schedule an invocation of scroll for next animation frame.
    rAF = window.requestAnimationFrame(function viewAreaElementScrolled() {
      rAF = null;

      let currentY = viewAreaElement.scrollTop;
      let lastY = state.lastY;
      if (currentY !== lastY) {
        state.down = currentY > lastY;
      }
      state.lastY = currentY;
      callback(state);
    });
  };

  let state = {
    down: true,
    lastY: viewAreaElement.scrollTop,
    _eventHandler: debounceScroll,
  };

  let rAF = null;
  viewAreaElement.addEventListener('scroll', debounceScroll, true);
  return state;
}

/**
 * Helper function to parse query string (e.g. ?param1=value&parm2=...).
 */
function parseQueryString(query) {
  let parts = query.split('&');
  let params = Object.create(null);
  for (let i = 0, ii = parts.length; i < ii; ++i) {
    let param = parts[i].split('=');
    let key = param[0].toLowerCase();
    let value = param.length > 1 ? param[1] : null;
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
  let minIndex = 0;
  let maxIndex = items.length - 1;

  if (items.length === 0 || !condition(items[maxIndex])) {
    return items.length;
  }
  if (condition(items[minIndex])) {
    return minIndex;
  }

  while (minIndex < maxIndex) {
    let currentIndex = (minIndex + maxIndex) >> 1;
    let currentItem = items[currentIndex];
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
  let xinv = 1 / x;
  let limit = 8;
  if (xinv > limit) {
    return [1, limit];
  } else if (Math.floor(xinv) === xinv) {
    return [1, xinv];
  }

  let x_ = x > 1 ? xinv : x;
  // a/b and c/d are neighbours in Farey sequence.
  let a = 0, b = 1, c = 1, d = 1;
  // Limiting search to order 8.
  while (true) {
    // Generating next term in sequence (order of q).
    let p = a + c, q = b + d;
    if (q > limit) {
      break;
    }
    if (x_ <= p / q) {
      c = p; d = q;
    } else {
      a = p; b = q;
    }
  }
  let result;
  // Select closest of the neighbours to x.
  if (x_ - a / b < c / d - x_) {
    result = x_ === x ? [a, b] : [b, a];
  } else {
    result = x_ === x ? [c, d] : [d, c];
  }
  return result;
}

function roundToDivide(x, div) {
  let r = x % div;
  return r === 0 ? x : Math.round(x - r + div);
}

/**
 * Generic helper to find out what elements are visible within a scroll pane.
 */
function getVisibleElements(scrollEl, views, sortByVisibility = false) {
  let top = scrollEl.scrollTop, bottom = top + scrollEl.clientHeight;
  let left = scrollEl.scrollLeft, right = left + scrollEl.clientWidth;

  function isElementBottomBelowViewTop(view) {
    let element = view.div;
    let elementBottom =
      element.offsetTop + element.clientTop + element.clientHeight;
    return elementBottom > top;
  }

  let visible = [], view, element;
  let currentHeight, viewHeight, hiddenHeight, percentHeight;
  let currentWidth, viewWidth;
  let firstVisibleElementInd = views.length === 0 ? 0 :
    binarySearchFirstItem(views, isElementBottomBelowViewTop);

  for (let i = firstVisibleElementInd, ii = views.length; i < ii; i++) {
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
      view,
      percent: percentHeight,
    });
  }

  let first = visible[0];
  let last = visible[visible.length - 1];

  if (sortByVisibility) {
    visible.sort(function(a, b) {
      let pc = a.percent - b.percent;
      if (Math.abs(pc) > 0.001) {
        return -pc;
      }
      return a.id - b.id; // ensure stability
    });
  }
  return { first, last, views: visible, };
}

/**
 * Event handler to suppress context menu.
 */
function noContextMenuHandler(evt) {
  evt.preventDefault();
}

function isDataSchema(url) {
  let i = 0, ii = url.length;
  while (i < ii && url[i].trim() === '') {
    i++;
  }
  return url.substr(i, 5).toLowerCase() === 'data:';
}

/**
 * Returns the filename or guessed filename from the url (see issue 3455).
 * @param {string} url - The original PDF location.
 * @param {string} defaultFilename - The value returned if the filename is
 *   unknown, or the protocol is unsupported.
 * @returns {string} Guessed PDF filename.
 */
function getPDFFileNameFromURL(url, defaultFilename = 'document.pdf') {
  if (isDataSchema(url)) {
    console.warn('getPDFFileNameFromURL: ' +
                 'ignoring "data:" URL for performance reasons.');
    return defaultFilename;
  }
  const reURI = /^(?:(?:[^:]+:)?\/\/[^\/]+)?([^?#]*)(\?[^#]*)?(#.*)?$/;
  //            SCHEME        HOST         1.PATH  2.QUERY   3.REF
  // Pattern to get last matching NAME.pdf
  const reFilename = /[^\/?#=]+\.pdf\b(?!.*\.pdf\b)/i;
  let splitURI = reURI.exec(url);
  let suggestedFilename = reFilename.exec(splitURI[1]) ||
                          reFilename.exec(splitURI[2]) ||
                          reFilename.exec(splitURI[3]);
  if (suggestedFilename) {
    suggestedFilename = suggestedFilename[0];
    if (suggestedFilename.indexOf('%') !== -1) {
      // URL-encoded %2Fpath%2Fto%2Ffile.pdf should be file.pdf
      try {
        suggestedFilename =
          reFilename.exec(decodeURIComponent(suggestedFilename))[0];
      } catch (ex) { // Possible (extremely rare) errors:
        // URIError "Malformed URI", e.g. for "%AA.pdf"
        // TypeError "null has no properties", e.g. for "%2F.pdf"
      }
    }
  }
  return suggestedFilename || defaultFilename;
}

function normalizeWheelEventDelta(evt) {
  let delta = Math.sqrt(evt.deltaX * evt.deltaX + evt.deltaY * evt.deltaY);
  let angle = Math.atan2(evt.deltaY, evt.deltaX);
  if (-0.25 * Math.PI < angle && angle < 0.75 * Math.PI) {
    // All that is left-up oriented has to change the sign.
    delta = -delta;
  }

  const MOUSE_DOM_DELTA_PIXEL_MODE = 0;
  const MOUSE_DOM_DELTA_LINE_MODE = 1;
  const MOUSE_PIXELS_PER_LINE = 30;
  const MOUSE_LINES_PER_PAGE = 30;

  // Converts delta to per-page units
  if (evt.deltaMode === MOUSE_DOM_DELTA_PIXEL_MODE) {
    delta /= MOUSE_PIXELS_PER_LINE * MOUSE_LINES_PER_PAGE;
  } else if (evt.deltaMode === MOUSE_DOM_DELTA_LINE_MODE) {
    delta /= MOUSE_LINES_PER_PAGE;
  }
  return delta;
}

function cloneObj(obj) {
  let result = Object.create(null);
  for (let i in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, i)) {
      result[i] = obj[i];
    }
  }
  return result;
}

/**
 * Promise that is resolved when DOM window becomes visible.
 */
let animationStarted = new Promise(function (resolve) {
  window.requestAnimationFrame(resolve);
});

/**
 * (deprecated) External localization service.
 */
let mozL10n;

/**
 * (deprecated) Promise that is resolved when UI localization is finished.
 */
let localized = Promise.resolve();

/**
 * Simple event bus for an application. Listeners are attached using the
 * `on` and `off` methods. To raise an event, the `dispatch` method shall be
 * used.
 */
class EventBus {
  constructor() {
    this._listeners = Object.create(null);
  }

  on(eventName, listener) {
    let eventListeners = this._listeners[eventName];
    if (!eventListeners) {
      eventListeners = [];
      this._listeners[eventName] = eventListeners;
    }
    eventListeners.push(listener);
  }

  off(eventName, listener) {
    let eventListeners = this._listeners[eventName];
    let i;
    if (!eventListeners || ((i = eventListeners.indexOf(listener)) < 0)) {
      return;
    }
    eventListeners.splice(i, 1);
  }

  dispatch(eventName) {
    let eventListeners = this._listeners[eventName];
    if (!eventListeners || eventListeners.length === 0) {
      return;
    }
    // Passing all arguments after the eventName to the listeners.
    let args = Array.prototype.slice.call(arguments, 1);
    // Making copy of the listeners array in case if it will be modified
    // during dispatch.
    eventListeners.slice(0).forEach(function (listener) {
      listener.apply(null, args);
    });
  }
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

class ProgressBar {
  constructor(id, { height, width, units, } = {}) {
    this.visible = true;

    // Fetch the sub-elements for later.
    this.div = document.querySelector(id + ' .progress');
    // Get the loading bar element, so it can be resized to fit the viewer.
    this.bar = this.div.parentNode;

    // Get options, with sensible defaults.
    this.height = height || 100;
    this.width = width || 100;
    this.units = units || '%';

    // Initialize heights.
    this.div.style.height = this.height + this.units;
    this.percent = 0;
  }

  _updateBar() {
    if (this._indeterminate) {
      this.div.classList.add('indeterminate');
      this.div.style.width = this.width + this.units;
      return;
    }

    this.div.classList.remove('indeterminate');
    let progressSize = this.width * this._percent / 100;
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
    let container = viewer.parentNode;
    let scrollbarWidth = container.offsetWidth - viewer.offsetWidth;
    if (scrollbarWidth > 0) {
      this.bar.setAttribute('style', 'width: calc(100% - ' +
                                     scrollbarWidth + 'px);');
    }
  }

  hide() {
    if (!this.visible) {
      return;
    }
    this.visible = false;
    this.bar.classList.add('hidden');
    document.body.classList.remove('loadingInProgress');
  }

  show() {
    if (this.visible) {
      return;
    }
    this.visible = true;
    document.body.classList.add('loadingInProgress');
    this.bar.classList.remove('hidden');
  }
}

export {
  CSS_UNITS,
  DEFAULT_SCALE_VALUE,
  DEFAULT_SCALE,
  MIN_SCALE,
  MAX_SCALE,
  UNKNOWN_SCALE,
  MAX_AUTO_SCALE,
  SCROLLBAR_PADDING,
  VERTICAL_PADDING,
  cloneObj,
  RendererType,
  mozL10n,
  NullL10n,
  EventBus,
  ProgressBar,
  getPDFFileNameFromURL,
  noContextMenuHandler,
  parseQueryString,
  getVisibleElements,
  roundToDivide,
  approximateFraction,
  getOutputScale,
  scrollIntoView,
  watchScroll,
  binarySearchFirstItem,
  normalizeWheelEventDelta,
  animationStarted,
  localized,
};
