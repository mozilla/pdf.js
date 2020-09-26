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

const CSS_UNITS = 96.0 / 72.0;
const DEFAULT_SCALE_VALUE = "auto";
const DEFAULT_SCALE = 1.0;
const MIN_SCALE = 0.1;
const MAX_SCALE = 10.0;
const UNKNOWN_SCALE = 0;
const MAX_AUTO_SCALE = 1.25;
const SCROLLBAR_PADDING = 40;
const VERTICAL_PADDING = 5;

const LOADINGBAR_END_OFFSET_VAR = "--loadingBar-end-offset";

const PresentationModeState = {
  UNKNOWN: 0,
  NORMAL: 1,
  CHANGING: 2,
  FULLSCREEN: 3,
};

const RendererType = {
  CANVAS: "canvas",
  SVG: "svg",
};

const TextLayerMode = {
  DISABLE: 0,
  ENABLE: 1,
  ENABLE_ENHANCE: 2,
};

const ScrollMode = {
  UNKNOWN: -1,
  VERTICAL: 0, // Default value.
  HORIZONTAL: 1,
  WRAPPED: 2,
};

const SpreadMode = {
  UNKNOWN: -1,
  NONE: 0, // Default value.
  ODD: 1,
  EVEN: 2,
};

// Used by `PDFViewerApplication`, and by the API unit-tests.
const AutoPrintRegExp = /\bprint\s*\(/;

// Replaces {{arguments}} with their values.
function formatL10nValue(text, args) {
  if (!args) {
    return text;
  }
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, name) => {
    return name in args ? args[name] : "{{" + name + "}}";
  });
}

/**
 * No-op implementation of the localization service.
 * @implements {IL10n}
 */
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

  async translate(element) {},
};

/**
 * Returns scale factor for the canvas. It makes sense for the HiDPI displays.
 * @returns {Object} The object with horizontal (sx) and vertical (sy)
 *                   scales. The scaled property is set to false if scaling is
 *                   not required, true otherwise.
 */
function getOutputScale(ctx) {
  const devicePixelRatio = window.devicePixelRatio || 1;
  const backingStoreRatio =
    ctx.webkitBackingStorePixelRatio ||
    ctx.mozBackingStorePixelRatio ||
    ctx.backingStorePixelRatio ||
    1;
  const pixelRatio = devicePixelRatio / backingStoreRatio;
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
    console.error("offsetParent is not set -- cannot scroll");
    return;
  }
  let offsetY = element.offsetTop + element.clientTop;
  let offsetX = element.offsetLeft + element.clientLeft;
  while (
    (parent.clientHeight === parent.scrollHeight &&
      parent.clientWidth === parent.scrollWidth) ||
    (skipOverflowHiddenElements &&
      getComputedStyle(parent).overflow === "hidden")
  ) {
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
  const debounceScroll = function (evt) {
    if (rAF) {
      return;
    }
    // schedule an invocation of scroll for next animation frame.
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
    _eventHandler: debounceScroll,
  };

  let rAF = null;
  viewAreaElement.addEventListener("scroll", debounceScroll, true);
  return state;
}

/**
 * Helper function to parse query string (e.g. ?param1=value&parm2=...).
 */
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

/**
 * Use binary search to find the index of the first item in a given array which
 * passes a given condition. The items are expected to be sorted in the sense
 * that if the condition is true for one item in the array, then it is also true
 * for all following items.
 *
 * @returns {number} Index of the first array element to pass the test,
 *                   or |items.length| if no such element exists.
 */
function binarySearchFirstItem(items, condition) {
  let minIndex = 0;
  let maxIndex = items.length - 1;

  if (maxIndex < 0 || !condition(items[maxIndex])) {
    return items.length;
  }
  if (condition(items[minIndex])) {
    return minIndex;
  }

  while (minIndex < maxIndex) {
    const currentIndex = (minIndex + maxIndex) >> 1;
    const currentItem = items[currentIndex];
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
  const xinv = 1 / x;
  const limit = 8;
  if (xinv > limit) {
    return [1, limit];
  } else if (Math.floor(xinv) === xinv) {
    return [1, xinv];
  }

  const x_ = x > 1 ? xinv : x;
  // a/b and c/d are neighbours in Farey sequence.
  let a = 0,
    b = 1,
    c = 1,
    d = 1;
  // Limiting search to order 8.
  while (true) {
    // Generating next term in sequence (order of q).
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
  // Select closest of the neighbours to x.
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

/**
 * Gets the size of the specified page, converted from PDF units to inches.
 * @param {Object} An Object containing the properties: {Array} `view`,
 *   {number} `userUnit`, and {number} `rotate`.
 * @returns {Object} An Object containing the properties: {number} `width`
 *   and {number} `height`, given in inches.
 */
function getPageSizeInches({ view, userUnit, rotate }) {
  const [x1, y1, x2, y2] = view;
  // We need to take the page rotation into account as well.
  const changeOrientation = rotate % 180 !== 0;

  const width = ((x2 - x1) / 72) * userUnit;
  const height = ((y2 - y1) / 72) * userUnit;

  return {
    width: changeOrientation ? height : width,
    height: changeOrientation ? width : height,
  };
}

/**
 * Helper function for getVisibleElements.
 *
 * @param {number} index - initial guess at the first visible element
 * @param {Array} views - array of pages, into which `index` is an index
 * @param {number} top - the top of the scroll pane
 * @returns {number} less than or equal to `index` that is definitely at or
 *   before the first visible element in `views`, but not by too much. (Usually,
 *   this will be the first element in the first partially visible row in
 *   `views`, although sometimes it goes back one row further.)
 */
function backtrackBeforeAllVisibleElements(index, views, top) {
  // binarySearchFirstItem's assumption is that the input is ordered, with only
  // one index where the conditions flips from false to true: [false ...,
  // true...]. With vertical scrolling and spreads, it is possible to have
  // [false ..., true, false, true ...]. With wrapped scrolling we can have a
  // similar sequence, with many more mixed true and false in the middle.
  //
  // So there is no guarantee that the binary search yields the index of the
  // first visible element. It could have been any of the other visible elements
  // that were preceded by a hidden element.

  // Of course, if either this element or the previous (hidden) element is also
  // the first element, there's nothing to worry about.
  if (index < 2) {
    return index;
  }

  // That aside, the possible cases are represented below.
  //
  //     ****  = fully hidden
  //     A*B*  = mix of partially visible and/or hidden pages
  //     CDEF  = fully visible
  //
  // (1) Binary search could have returned A, in which case we can stop.
  // (2) Binary search could also have returned B, in which case we need to
  // check the whole row.
  // (3) Binary search could also have returned C, in which case we need to
  // check the whole previous row.
  //
  // There's one other possibility:
  //
  //     ****  = fully hidden
  //     ABCD  = mix of fully and/or partially visible pages
  //
  // (4) Binary search could only have returned A.

  // Initially assume that we need to find the beginning of the current row
  // (case 1, 2, or 4), which means finding a page that is above the current
  // page's top. If the found page is partially visible, we're definitely not in
  // case 3, and this assumption is correct.
  let elt = views[index].div;
  let pageTop = elt.offsetTop + elt.clientTop;

  if (pageTop >= top) {
    // The found page is fully visible, so we're actually either in case 3 or 4,
    // and unfortunately we can't tell the difference between them without
    // scanning the entire previous row, so we just conservatively assume that
    // we do need to backtrack to that row. In both cases, the previous page is
    // in the previous row, so use its top instead.
    elt = views[index - 1].div;
    pageTop = elt.offsetTop + elt.clientTop;
  }

  // Now we backtrack to the first page that still has its bottom below
  // `pageTop`, which is the top of a page in the first visible row (unless
  // we're in case 4, in which case it's the row before that).
  // `index` is found by binary search, so the page at `index - 1` is
  // invisible and we can start looking for potentially visible pages from
  // `index - 2`. (However, if this loop terminates on its first iteration,
  // which is the case when pages are stacked vertically, `index` should remain
  // unchanged, so we use a distinct loop variable.)
  for (let i = index - 2; i >= 0; --i) {
    elt = views[i].div;
    if (elt.offsetTop + elt.clientTop + elt.clientHeight <= pageTop) {
      // We have reached the previous row, so stop now.
      // This loop is expected to terminate relatively quickly because the
      // number of pages per row is expected to be small.
      break;
    }
    index = i;
  }
  return index;
}

/**
 * Generic helper to find out what elements are visible within a scroll pane.
 *
 * Well, pretty generic. There are some assumptions placed on the elements
 * referenced by `views`:
 *   - If `horizontal`, no left of any earlier element is to the right of the
 *     left of any later element.
 *   - Otherwise, `views` can be split into contiguous rows where, within a row,
 *     no top of any element is below the bottom of any other element, and
 *     between rows, no bottom of any element in an earlier row is below the
 *     top of any element in a later row.
 *
 * (Here, top, left, etc. all refer to the padding edge of the element in
 * question. For pages, that ends up being equivalent to the bounding box of the
 * rendering canvas. Earlier and later refer to index in `views`, not page
 * layout.)
 *
 * @param scrollEl {HTMLElement} - a container that can possibly scroll
 * @param views {Array} - objects with a `div` property that contains an
 *   HTMLElement, which should all be descendents of `scrollEl` satisfying the
 *   above layout assumptions
 * @param sortByVisibility {boolean} - if true, the returned elements are sorted
 *   in descending order of the percent of their padding box that is visible
 * @param horizontal {boolean} - if true, the elements are assumed to be laid
 *   out horizontally instead of vertically
 * @returns {Object} `{ first, last, views: [{ id, x, y, view, percent }] }`
 */
function getVisibleElements(
  scrollEl,
  views,
  sortByVisibility = false,
  horizontal = false
) {
  const top = scrollEl.scrollTop,
    bottom = top + scrollEl.clientHeight;
  const left = scrollEl.scrollLeft,
    right = left + scrollEl.clientWidth;

  // Throughout this "generic" function, comments will assume we're working with
  // PDF document pages, which is the most important and complex case. In this
  // case, the visible elements we're actually interested is the page canvas,
  // which is contained in a wrapper which adds no padding/border/margin, which
  // is itself contained in `view.div` which adds no padding (but does add a
  // border). So, as specified in this function's doc comment, this function
  // does all of its work on the padding edge of the provided views, starting at
  // offsetLeft/Top (which includes margin) and adding clientLeft/Top (which is
  // the border). Adding clientWidth/Height gets us the bottom-right corner of
  // the padding edge.
  function isElementBottomAfterViewTop(view) {
    const element = view.div;
    const elementBottom =
      element.offsetTop + element.clientTop + element.clientHeight;
    return elementBottom > top;
  }
  function isElementRightAfterViewLeft(view) {
    const element = view.div;
    const elementRight =
      element.offsetLeft + element.clientLeft + element.clientWidth;
    return elementRight > left;
  }

  const visible = [],
    numViews = views.length;
  let firstVisibleElementInd =
    numViews === 0
      ? 0
      : binarySearchFirstItem(
          views,
          horizontal ? isElementRightAfterViewLeft : isElementBottomAfterViewTop
        );

  // Please note the return value of the `binarySearchFirstItem` function when
  // no valid element is found (hence the `firstVisibleElementInd` check below).
  if (
    firstVisibleElementInd > 0 &&
    firstVisibleElementInd < numViews &&
    !horizontal
  ) {
    // In wrapped scrolling (or vertical scrolling with spreads), with some page
    // sizes, isElementBottomAfterViewTop doesn't satisfy the binary search
    // condition: there can be pages with bottoms above the view top between
    // pages with bottoms below. This function detects and corrects that error;
    // see it for more comments.
    firstVisibleElementInd = backtrackBeforeAllVisibleElements(
      firstVisibleElementInd,
      views,
      top
    );
  }

  // lastEdge acts as a cutoff for us to stop looping, because we know all
  // subsequent pages will be hidden.
  //
  // When using wrapped scrolling or vertical scrolling with spreads, we can't
  // simply stop the first time we reach a page below the bottom of the view;
  // the tops of subsequent pages on the same row could still be visible. In
  // horizontal scrolling, we don't have that issue, so we can stop as soon as
  // we pass `right`, without needing the code below that handles the -1 case.
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
      // As commented above, this is only needed in non-horizontal cases.
      // Setting lastEdge to the bottom of the first page that is partially
      // visible ensures that the next page fully below lastEdge is on the
      // next row, which has to be fully hidden along with all subsequent rows.
      if (viewBottom >= bottom) {
        lastEdge = viewBottom;
      }
    } else if ((horizontal ? currentWidth : currentHeight) > lastEdge) {
      break;
    }

    if (
      viewBottom <= top ||
      currentHeight >= bottom ||
      viewRight <= left ||
      currentWidth >= right
    ) {
      continue;
    }

    const hiddenHeight =
      Math.max(0, top - currentHeight) + Math.max(0, viewBottom - bottom);
    const hiddenWidth =
      Math.max(0, left - currentWidth) + Math.max(0, viewRight - right);
    const percent =
      (((viewHeight - hiddenHeight) * (viewWidth - hiddenWidth) * 100) /
        viewHeight /
        viewWidth) |
      0;
    visible.push({
      id: view.id,
      x: currentWidth,
      y: currentHeight,
      view,
      percent,
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
      return a.id - b.id; // ensure stability
    });
  }
  return { first, last, views: visible };
}

/**
 * Event handler to suppress context menu.
 */
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

/**
 * Returns the filename or guessed filename from the url (see issue 3455).
 * @param {string} url - The original PDF location.
 * @param {string} defaultFilename - The value returned if the filename is
 *   unknown, or the protocol is unsupported.
 * @returns {string} Guessed PDF filename.
 */
function getPDFFileNameFromURL(url, defaultFilename = "document.pdf") {
  if (typeof url !== "string") {
    return defaultFilename;
  }
  if (isDataSchema(url)) {
    console.warn(
      "getPDFFileNameFromURL: " +
        'ignoring "data:" URL for performance reasons.'
    );
    return defaultFilename;
  }
  const reURI = /^(?:(?:[^:]+:)?\/\/[^\/]+)?([^?#]*)(\?[^#]*)?(#.*)?$/;
  //              SCHEME        HOST         1.PATH  2.QUERY   3.REF
  // Pattern to get last matching NAME.pdf
  const reFilename = /[^\/?#=]+\.pdf\b(?!.*\.pdf\b)/i;
  const splitURI = reURI.exec(url);
  let suggestedFilename =
    reFilename.exec(splitURI[1]) ||
    reFilename.exec(splitURI[2]) ||
    reFilename.exec(splitURI[3]);
  if (suggestedFilename) {
    suggestedFilename = suggestedFilename[0];
    if (suggestedFilename.includes("%")) {
      // URL-encoded %2Fpath%2Fto%2Ffile.pdf should be file.pdf
      try {
        suggestedFilename = reFilename.exec(
          decodeURIComponent(suggestedFilename)
        )[0];
      } catch (ex) {
        // Possible (extremely rare) errors:
        // URIError "Malformed URI", e.g. for "%AA.pdf"
        // TypeError "null has no properties", e.g. for "%2F.pdf"
      }
    }
  }
  return suggestedFilename || defaultFilename;
}

function normalizeWheelEventDirection(evt) {
  let delta = Math.sqrt(evt.deltaX * evt.deltaX + evt.deltaY * evt.deltaY);
  const angle = Math.atan2(evt.deltaY, evt.deltaX);
  if (-0.25 * Math.PI < angle && angle < 0.75 * Math.PI) {
    // All that is left-up oriented has to change the sign.
    delta = -delta;
  }
  return delta;
}

function normalizeWheelEventDelta(evt) {
  let delta = normalizeWheelEventDirection(evt);

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

function isValidRotation(angle) {
  return Number.isInteger(angle) && angle % 90 === 0;
}

function isValidScrollMode(mode) {
  return (
    Number.isInteger(mode) &&
    Object.values(ScrollMode).includes(mode) &&
    mode !== ScrollMode.UNKNOWN
  );
}

function isValidSpreadMode(mode) {
  return (
    Number.isInteger(mode) &&
    Object.values(SpreadMode).includes(mode) &&
    mode !== SpreadMode.UNKNOWN
  );
}

function isPortraitOrientation(size) {
  return size.width <= size.height;
}

const WaitOnType = {
  EVENT: "event",
  TIMEOUT: "timeout",
};

/**
 * @typedef {Object} WaitOnEventOrTimeoutParameters
 * @property {Object} target - The event target, can for example be:
 *   `window`, `document`, a DOM element, or an {EventBus} instance.
 * @property {string} name - The name of the event.
 * @property {number} delay - The delay, in milliseconds, after which the
 *   timeout occurs (if the event wasn't already dispatched).
 */

/**
 * Allows waiting for an event or a timeout, whichever occurs first.
 * Can be used to ensure that an action always occurs, even when an event
 * arrives late or not at all.
 *
 * @param {WaitOnEventOrTimeoutParameters}
 * @returns {Promise} A promise that is resolved with a {WaitOnType} value.
 */
function waitOnEventOrTimeout({ target, name, delay = 0 }) {
  return new Promise(function (resolve, reject) {
    if (
      typeof target !== "object" ||
      !(name && typeof name === "string") ||
      !(Number.isInteger(delay) && delay >= 0)
    ) {
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

/**
 * Promise that is resolved when DOM window becomes visible.
 */
const animationStarted = new Promise(function (resolve) {
  if (
    typeof PDFJSDev !== "undefined" &&
    PDFJSDev.test("LIB && TESTING") &&
    typeof window === "undefined"
  ) {
    // Prevent "ReferenceError: window is not defined" errors when running the
    // unit-tests in Node.js/Travis.
    setTimeout(resolve, 20);
    return;
  }
  window.requestAnimationFrame(resolve);
});

/**
 * NOTE: Only used to support various PDF viewer tests in `mozilla-central`.
 */
function dispatchDOMEvent(eventName, args = null) {
  if (typeof PDFJSDev !== "undefined" && !PDFJSDev.test("MOZCENTRAL")) {
    throw new Error("Not implemented: dispatchDOMEvent");
  }
  const details = Object.create(null);
  if (args && args.length > 0) {
    const obj = args[0];
    for (const key in obj) {
      const value = obj[key];
      if (key === "source") {
        if (value === window || value === document) {
          return; // No need to re-dispatch (already) global events.
        }
        continue; // Ignore the `source` property.
      }
      details[key] = value;
    }
  }
  const event = document.createEvent("CustomEvent");
  event.initCustomEvent(eventName, true, true, details);
  document.dispatchEvent(event);
}

/**
 * Simple event bus for an application. Listeners are attached using the `on`
 * and `off` methods. To raise an event, the `dispatch` method shall be used.
 */
class EventBus {
  constructor(options) {
    this._listeners = Object.create(null);

    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("MOZCENTRAL")) {
      this._isInAutomation = (options && options.isInAutomation) === true;
    }
  }

  /**
   * @param {string} eventName
   * @param {function} listener
   */
  on(eventName, listener) {
    this._on(eventName, listener, { external: true });
  }

  /**
   * @param {string} eventName
   * @param {function} listener
   */
  off(eventName, listener) {
    this._off(eventName, listener, { external: true });
  }

  dispatch(eventName) {
    const eventListeners = this._listeners[eventName];
    if (!eventListeners || eventListeners.length === 0) {
      if (
        (typeof PDFJSDev === "undefined" || PDFJSDev.test("MOZCENTRAL")) &&
        this._isInAutomation
      ) {
        const args = Array.prototype.slice.call(arguments, 1);
        dispatchDOMEvent(eventName, args);
      }
      return;
    }
    // Passing all arguments after the eventName to the listeners.
    const args = Array.prototype.slice.call(arguments, 1);
    let externalListeners;
    // Making copy of the listeners array in case if it will be modified
    // during dispatch.
    eventListeners.slice(0).forEach(function ({ listener, external }) {
      if (external) {
        if (!externalListeners) {
          externalListeners = [];
        }
        externalListeners.push(listener);
        return;
      }
      listener.apply(null, args);
    });
    // Dispatch any "external" listeners *after* the internal ones, to give the
    // viewer components time to handle events and update their state first.
    if (externalListeners) {
      externalListeners.forEach(function (listener) {
        listener.apply(null, args);
      });
      externalListeners = null;
    }
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("MOZCENTRAL")) &&
      this._isInAutomation
    ) {
      dispatchDOMEvent(eventName, args);
    }
  }

  /**
   * @ignore
   */
  _on(eventName, listener, options = null) {
    let eventListeners = this._listeners[eventName];
    if (!eventListeners) {
      this._listeners[eventName] = eventListeners = [];
    }
    eventListeners.push({
      listener,
      external: (options && options.external) === true,
    });
  }

  /**
   * @ignore
   */
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

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

class ProgressBar {
  constructor(id, { height, width, units } = {}) {
    this.visible = true;

    // Fetch the sub-elements for later.
    this.div = document.querySelector(id + " .progress");
    // Get the loading bar element, so it can be resized to fit the viewer.
    this.bar = this.div.parentNode;

    // Get options, with sensible defaults.
    this.height = height || 100;
    this.width = width || 100;
    this.units = units || "%";

    // Initialize heights.
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
    const progressSize = (this.width * this._percent) / 100;
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
      const doc = document.documentElement;
      doc.style.setProperty(LOADINGBAR_END_OFFSET_VAR, `${scrollbarWidth}px`);
    }
  }

  hide() {
    if (!this.visible) {
      return;
    }
    this.visible = false;
    this.bar.classList.add("hidden");
  }

  show() {
    if (this.visible) {
      return;
    }
    this.visible = true;
    this.bar.classList.remove("hidden");
  }
}

/**
 * Moves all elements of an array that satisfy condition to the end of the
 * array, preserving the order of the rest.
 */
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

/**
 * Get the active or focused element in current DOM.
 *
 * Recursively search for the truly active or focused element in case there are
 * shadow DOMs.
 *
 * @returns {Element} the truly active or focused element.
 */
function getActiveOrFocusedElement() {
  let curRoot = document;
  let curActiveOrFocused =
    curRoot.activeElement || curRoot.querySelector(":focus");

  while (curActiveOrFocused && curActiveOrFocused.shadowRoot) {
    curRoot = curActiveOrFocused.shadowRoot;
    curActiveOrFocused =
      curRoot.activeElement || curRoot.querySelector(":focus");
  }

  return curActiveOrFocused;
}

export {
  AutoPrintRegExp,
  CSS_UNITS,
  DEFAULT_SCALE_VALUE,
  DEFAULT_SCALE,
  MIN_SCALE,
  MAX_SCALE,
  UNKNOWN_SCALE,
  MAX_AUTO_SCALE,
  SCROLLBAR_PADDING,
  VERTICAL_PADDING,
  isValidRotation,
  isValidScrollMode,
  isValidSpreadMode,
  isPortraitOrientation,
  PresentationModeState,
  RendererType,
  TextLayerMode,
  ScrollMode,
  SpreadMode,
  NullL10n,
  EventBus,
  ProgressBar,
  getPDFFileNameFromURL,
  noContextMenuHandler,
  parseQueryString,
  backtrackBeforeAllVisibleElements, // only exported for testing
  getVisibleElements,
  roundToDivide,
  getPageSizeInches,
  approximateFraction,
  getOutputScale,
  scrollIntoView,
  watchScroll,
  binarySearchFirstItem,
  normalizeWheelEventDirection,
  normalizeWheelEventDelta,
  animationStarted,
  WaitOnType,
  waitOnEventOrTimeout,
  moveToEndOfArray,
  getActiveOrFocusedElement,
};
