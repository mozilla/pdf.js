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

import { createPromiseCapability, PDFJS } from 'pdfjs-lib';
import {
  CSS_UNITS, DEFAULT_SCALE, DEFAULT_SCALE_VALUE, getVisibleElements,
  MAX_AUTO_SCALE, NullL10n, RendererType, SCROLLBAR_PADDING, scrollIntoView,
  UNKNOWN_SCALE, VERTICAL_PADDING, watchScroll
} from './ui_utils';
import { PDFRenderingQueue, RenderingStates } from './pdf_rendering_queue';
import { AnnotationLayerBuilder } from './annotation_layer_builder';
import { getGlobalEventBus } from './dom_events';
import { PDFPageView } from './pdf_page_view';
import { SimpleLinkService } from './pdf_link_service';
import { TextLayerBuilder } from './text_layer_builder';

const PresentationModeState = {
  UNKNOWN: 0,
  NORMAL: 1,
  CHANGING: 2,
  FULLSCREEN: 3,
};

const DEFAULT_CACHE_SIZE = 10;

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
 * @property {boolean} enhanceTextSelection - (optional) Enables the improved
 *   text selection behaviour. The default is `false`.
 * @property {boolean} renderInteractiveForms - (optional) Enables rendering of
 *   interactive form elements. The default is `false`.
 * @property {boolean} enablePrintAutoRotate - (optional) Enables automatic
 *   rotation of pages whose orientation differ from the first page upon
 *   printing. The default is `false`.
 * @property {string} renderer - 'canvas' or 'svg'. The default is 'canvas'.
 * @property {IL10n} l10n - Localization service.
 */

function PDFPageViewBuffer(size) {
  let data = [];
  this.push = function cachePush(view) {
    let i = data.indexOf(view);
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

function isPortraitOrientation(size) {
  return size.width <= size.height;
}

/**
 * Simple viewer control to display PDF content/pages.
 * @implements {IRenderableView}
 */
class PDFViewer {
  /**
   * @param {PDFViewerOptions} options
   */
  constructor(options) {
    this.container = options.container;
    this.viewer = options.viewer || options.container.firstElementChild;
    this.eventBus = options.eventBus || getGlobalEventBus();
    this.linkService = options.linkService || new SimpleLinkService();
    this.downloadManager = options.downloadManager || null;
    this.removePageBorders = options.removePageBorders || false;
    this.enhanceTextSelection = options.enhanceTextSelection || false;
    this.renderInteractiveForms = options.renderInteractiveForms || false;
    this.enablePrintAutoRotate = options.enablePrintAutoRotate || false;
    this.renderer = options.renderer || RendererType.CANVAS;
    this.l10n = options.l10n || NullL10n;

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

  get pagesCount() {
    return this._pages.length;
  }

  getPageView(index) {
    return this._pages[index];
  }

  /**
   * @returns {boolean} true if all {PDFPageView} objects are initialized.
   */
  get pageViewsReady() {
    return this._pageViewsReady;
  }

  /**
   * @returns {number}
   */
  get currentPageNumber() {
    return this._currentPageNumber;
  }

  /**
   * @param {number} val - The page number.
   */
  set currentPageNumber(val) {
    if ((val | 0) !== val) { // Ensure that `val` is an integer.
      throw new Error('Invalid page number.');
    }
    if (!this.pdfDocument) {
      return;
    }
    // The intent can be to just reset a scroll position and/or scale.
    this._setCurrentPageNumber(val, /* resetCurrentPageView = */ true);
  }

  /**
   * @private
   */
  _setCurrentPageNumber(val, resetCurrentPageView = false) {
    if (this._currentPageNumber === val) {
      if (resetCurrentPageView) {
        this._resetCurrentPageView();
      }
      return;
    }

    if (!(0 < val && val <= this.pagesCount)) {
      console.error(
        `PDFViewer._setCurrentPageNumber: "${val}" is out of bounds.`);
      return;
    }

    let arg = {
      source: this,
      pageNumber: val,
      pageLabel: this._pageLabels && this._pageLabels[val - 1],
    };
    this._currentPageNumber = val;
    this.eventBus.dispatch('pagechanging', arg);
    this.eventBus.dispatch('pagechange', arg);

    if (resetCurrentPageView) {
      this._resetCurrentPageView();
    }
  }

  /**
   * @returns {string|null} Returns the current page label,
   *                        or `null` if no page labels exist.
   */
  get currentPageLabel() {
    return this._pageLabels && this._pageLabels[this._currentPageNumber - 1];
  }

  /**
   * @param {string} val - The page label.
   */
  set currentPageLabel(val) {
    let pageNumber = val | 0; // Fallback page number.
    if (this._pageLabels) {
      let i = this._pageLabels.indexOf(val);
      if (i >= 0) {
        pageNumber = i + 1;
      }
    }
    this.currentPageNumber = pageNumber;
  }

  /**
   * @returns {number}
   */
  get currentScale() {
    return this._currentScale !== UNKNOWN_SCALE ? this._currentScale :
                                                  DEFAULT_SCALE;
  }

  /**
   * @param {number} val - Scale of the pages in percents.
   */
  set currentScale(val) {
    if (isNaN(val)) {
      throw new Error('Invalid numeric scale');
    }
    if (!this.pdfDocument) {
      return;
    }
    this._setScale(val, false);
  }

  /**
   * @returns {string}
   */
  get currentScaleValue() {
    return this._currentScaleValue;
  }

  /**
   * @param val - The scale of the pages (in percent or predefined value).
   */
  set currentScaleValue(val) {
    if (!this.pdfDocument) {
      return;
    }
    this._setScale(val, false);
  }

  /**
   * @returns {number}
   */
  get pagesRotation() {
    return this._pagesRotation;
  }

  /**
   * @param {number} rotation - The rotation of the pages (0, 90, 180, 270).
   */
  set pagesRotation(rotation) {
    if (!(typeof rotation === 'number' && rotation % 90 === 0)) {
      throw new Error('Invalid pages rotation angle.');
    }
    if (!this.pdfDocument) {
      return;
    }
    this._pagesRotation = rotation;

    for (let i = 0, ii = this._pages.length; i < ii; i++) {
      let pageView = this._pages[i];
      pageView.update(pageView.scale, rotation);
    }

    this._setScale(this._currentScaleValue, true);

    if (this.defaultRenderingQueue) {
      this.update();
    }
  }

  /**
   * @param pdfDocument {PDFDocument}
   */
  setDocument(pdfDocument) {
    if (this.pdfDocument) {
      this._cancelRendering();
      this._resetView();
    }

    this.pdfDocument = pdfDocument;
    if (!pdfDocument) {
      return;
    }
    let pagesCount = pdfDocument.numPages;

    let pagesCapability = createPromiseCapability();
    this.pagesPromise = pagesCapability.promise;

    pagesCapability.promise.then(() => {
      this._pageViewsReady = true;
      this.eventBus.dispatch('pagesloaded', {
        source: this,
        pagesCount,
      });
    });

    let isOnePageRenderedResolved = false;
    let onePageRenderedCapability = createPromiseCapability();
    this.onePageRendered = onePageRenderedCapability.promise;

    let bindOnAfterAndBeforeDraw = (pageView) => {
      pageView.onBeforeDraw = () => {
        // Add the page to the buffer at the start of drawing. That way it can
        // be evicted from the buffer and destroyed even if we pause its
        // rendering.
        this._buffer.push(pageView);
      };
      pageView.onAfterDraw = () => {
        if (!isOnePageRenderedResolved) {
          isOnePageRenderedResolved = true;
          onePageRenderedCapability.resolve();
        }
      };
    };

    let firstPagePromise = pdfDocument.getPage(1);
    this.firstPagePromise = firstPagePromise;

    // Fetch a single page so we can get a viewport that will be the default
    // viewport for all pages
    firstPagePromise.then((pdfPage) => {
      let scale = this.currentScale;
      let viewport = pdfPage.getViewport(scale * CSS_UNITS);
      for (let pageNum = 1; pageNum <= pagesCount; ++pageNum) {
        let textLayerFactory = null;
        if (!PDFJS.disableTextLayer) {
          textLayerFactory = this;
        }
        let pageView = new PDFPageView({
          container: this.viewer,
          eventBus: this.eventBus,
          id: pageNum,
          scale,
          defaultViewport: viewport.clone(),
          renderingQueue: this.renderingQueue,
          textLayerFactory,
          annotationLayerFactory: this,
          enhanceTextSelection: this.enhanceTextSelection,
          renderInteractiveForms: this.renderInteractiveForms,
          renderer: this.renderer,
          l10n: this.l10n,
        });
        bindOnAfterAndBeforeDraw(pageView);
        this._pages.push(pageView);
      }

      // Fetch all the pages since the viewport is needed before printing
      // starts to create the correct size canvas. Wait until one page is
      // rendered so we don't tie up too many resources early on.
      onePageRenderedCapability.promise.then(() => {
        if (PDFJS.disableAutoFetch) {
          // XXX: Printing is semi-broken with auto fetch disabled.
          pagesCapability.resolve();
          return;
        }
        let getPagesLeft = pagesCount;
        for (let pageNum = 1; pageNum <= pagesCount; ++pageNum) {
          pdfDocument.getPage(pageNum).then((pdfPage) => {
            let pageView = this._pages[pageNum - 1];
            if (!pageView.pdfPage) {
              pageView.setPdfPage(pdfPage);
            }
            this.linkService.cachePageRef(pageNum, pdfPage.ref);
            if (--getPagesLeft === 0) {
              pagesCapability.resolve();
            }
          }, (reason) => {
            console.error(`Unable to get page ${pageNum} to initialize viewer`,
                          reason);
            if (--getPagesLeft === 0) {
              pagesCapability.resolve();
            }
          });
        }
      });

      this.eventBus.dispatch('pagesinit', { source: this, });

      if (this.defaultRenderingQueue) {
        this.update();
      }

      if (this.findController) {
        this.findController.resolveFirstPage();
      }
    }).catch((reason) => {
      console.error('Unable to initialize viewer', reason);
    });
  }

  /**
   * @param {Array|null} labels
   */
  setPageLabels(labels) {
    if (!this.pdfDocument) {
      return;
    }
    if (!labels) {
      this._pageLabels = null;
    } else if (!(labels instanceof Array &&
                 this.pdfDocument.numPages === labels.length)) {
      this._pageLabels = null;
      console.error('PDFViewer.setPageLabels: Invalid page labels.');
    } else {
      this._pageLabels = labels;
    }
    // Update all the `PDFPageView` instances.
    for (let i = 0, ii = this._pages.length; i < ii; i++) {
      let pageView = this._pages[i];
      let label = this._pageLabels && this._pageLabels[i];
      pageView.setPageLabel(label);
    }
  }

  _resetView() {
    this._pages = [];
    this._currentPageNumber = 1;
    this._currentScale = UNKNOWN_SCALE;
    this._currentScaleValue = null;
    this._pageLabels = null;
    this._buffer = new PDFPageViewBuffer(DEFAULT_CACHE_SIZE);
    this._location = null;
    this._pagesRotation = 0;
    this._pagesRequests = [];
    this._pageViewsReady = false;

    // Remove the pages from the DOM.
    this.viewer.textContent = '';
  }

  _scrollUpdate() {
    if (this.pagesCount === 0) {
      return;
    }
    this.update();
  }

  _setScaleDispatchEvent(newScale, newValue, preset = false) {
    let arg = {
      source: this,
      scale: newScale,
      presetValue: preset ? newValue : undefined,
    };
    this.eventBus.dispatch('scalechanging', arg);
    this.eventBus.dispatch('scalechange', arg);
  }

  _setScaleUpdatePages(newScale, newValue, noScroll = false, preset = false) {
    this._currentScaleValue = newValue.toString();

    if (isSameScale(this._currentScale, newScale)) {
      if (preset) {
        this._setScaleDispatchEvent(newScale, newValue, true);
      }
      return;
    }

    for (let i = 0, ii = this._pages.length; i < ii; i++) {
      this._pages[i].update(newScale);
    }
    this._currentScale = newScale;

    if (!noScroll) {
      let page = this._currentPageNumber, dest;
      if (this._location && !PDFJS.ignoreCurrentPositionOnZoom &&
          !(this.isInPresentationMode || this.isChangingPresentationMode)) {
        page = this._location.pageNumber;
        dest = [null, { name: 'XYZ', }, this._location.left,
                this._location.top, null];
      }
      this.scrollPageIntoView({
        pageNumber: page,
        destArray: dest,
        allowNegativeOffset: true,
      });
    }

    this._setScaleDispatchEvent(newScale, newValue, preset);

    if (this.defaultRenderingQueue) {
      this.update();
    }
  }

  _setScale(value, noScroll = false) {
    let scale = parseFloat(value);

    if (scale > 0) {
      this._setScaleUpdatePages(scale, value, noScroll, /* preset = */ false);
    } else {
      let currentPage = this._pages[this._currentPageNumber - 1];
      if (!currentPage) {
        return;
      }
      let hPadding = (this.isInPresentationMode || this.removePageBorders) ?
        0 : SCROLLBAR_PADDING;
      let vPadding = (this.isInPresentationMode || this.removePageBorders) ?
        0 : VERTICAL_PADDING;
      let pageWidthScale = (this.container.clientWidth - hPadding) /
                           currentPage.width * currentPage.scale;
      let pageHeightScale = (this.container.clientHeight - vPadding) /
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
          let isLandscape = (currentPage.width > currentPage.height);
          // For pages in landscape mode, fit the page height to the viewer
          // *unless* the page would thus become too wide to fit horizontally.
          let horizontalScale = isLandscape ?
            Math.min(pageHeightScale, pageWidthScale) : pageWidthScale;
          scale = Math.min(MAX_AUTO_SCALE, horizontalScale);
          break;
        default:
          console.error(
            `PDFViewer._setScale: "${value}" is an unknown zoom value.`);
          return;
      }
      this._setScaleUpdatePages(scale, value, noScroll, /* preset = */ true);
    }
  }

  /**
   * Refreshes page view: scrolls to the current page and updates the scale.
   * @private
   */
  _resetCurrentPageView() {
    if (this.isInPresentationMode) {
      // Fixes the case when PDF has different page sizes.
      this._setScale(this._currentScaleValue, true);
    }

    let pageView = this._pages[this._currentPageNumber - 1];
    scrollIntoView(pageView.div);
  }

  /**
   * @typedef ScrollPageIntoViewParameters
   * @property {number} pageNumber - The page number.
   * @property {Array} destArray - (optional) The original PDF destination
   *   array, in the format: <page-ref> </XYZ|/FitXXX> <args..>
   * @property {boolean} allowNegativeOffset - (optional) Allow negative page
   *   offsets. The default value is `false`.
   */

  /**
   * Scrolls page into view.
   * @param {ScrollPageIntoViewParameters} params
   */
  scrollPageIntoView(params) {
    if (!this.pdfDocument) {
      return;
    }
    if ((typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) &&
        (arguments.length > 1 || typeof params === 'number')) {
      console.warn('Call of scrollPageIntoView() with obsolete signature.');
      let paramObj = {};
      if (typeof params === 'number') {
        paramObj.pageNumber = params; // pageNumber argument was found.
      }
      if (arguments[1] instanceof Array) {
        paramObj.destArray = arguments[1]; // destArray argument was found.
      }
      params = paramObj;
    }
    let pageNumber = params.pageNumber || 0;
    let dest = params.destArray || null;
    let allowNegativeOffset = params.allowNegativeOffset || false;

    if (this.isInPresentationMode || !dest) {
      this._setCurrentPageNumber(pageNumber, /* resetCurrentPageView = */ true);
      return;
    }

    let pageView = this._pages[pageNumber - 1];
    if (!pageView) {
      console.error(
        'PDFViewer.scrollPageIntoView: Invalid "pageNumber" parameter.');
      return;
    }
    let x = 0, y = 0;
    let width = 0, height = 0, widthScale, heightScale;
    let changeOrientation = (pageView.rotation % 180 === 0 ? false : true);
    let pageWidth = (changeOrientation ? pageView.height : pageView.width) /
      pageView.scale / CSS_UNITS;
    let pageHeight = (changeOrientation ? pageView.width : pageView.height) /
      pageView.scale / CSS_UNITS;
    let scale = 0;
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
        let hPadding = this.removePageBorders ? 0 : SCROLLBAR_PADDING;
        let vPadding = this.removePageBorders ? 0 : VERTICAL_PADDING;

        widthScale = (this.container.clientWidth - hPadding) /
          width / CSS_UNITS;
        heightScale = (this.container.clientHeight - vPadding) /
          height / CSS_UNITS;
        scale = Math.min(Math.abs(widthScale), Math.abs(heightScale));
        break;
      default:
        console.error(`PDFViewer.scrollPageIntoView: "${dest[1].name}" ` +
                      'is not a valid destination type.');
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

    let boundingRect = [
      pageView.viewport.convertToViewportPoint(x, y),
      pageView.viewport.convertToViewportPoint(x + width, y + height)
    ];
    let left = Math.min(boundingRect[0][0], boundingRect[1][0]);
    let top = Math.min(boundingRect[0][1], boundingRect[1][1]);

    if (!allowNegativeOffset) {
      // Some bad PDF generators will create destinations with e.g. top values
      // that exceeds the page height. Ensure that offsets are not negative,
      // to prevent a previous page from becoming visible (fixes bug 874482).
      left = Math.max(left, 0);
      top = Math.max(top, 0);
    }
    scrollIntoView(pageView.div, { left, top, });
  }

  _updateLocation(firstPage) {
    let currentScale = this._currentScale;
    let currentScaleValue = this._currentScaleValue;
    let normalizedScaleValue =
      parseFloat(currentScaleValue) === currentScale ?
      Math.round(currentScale * 10000) / 100 : currentScaleValue;

    let pageNumber = firstPage.id;
    let pdfOpenParams = '#page=' + pageNumber;
    pdfOpenParams += '&zoom=' + normalizedScaleValue;
    let currentPageView = this._pages[pageNumber - 1];
    let container = this.container;
    let topLeft = currentPageView.getPagePoint(
      (container.scrollLeft - firstPage.x),
      (container.scrollTop - firstPage.y));
    let intLeft = Math.round(topLeft[0]);
    let intTop = Math.round(topLeft[1]);
    pdfOpenParams += ',' + intLeft + ',' + intTop;

    this._location = {
      pageNumber,
      scale: normalizedScaleValue,
      top: intTop,
      left: intLeft,
      pdfOpenParams,
    };
  }

  update() {
    let visible = this._getVisiblePages();
    let visiblePages = visible.views;
    if (visiblePages.length === 0) {
      return;
    }

    let suggestedCacheSize = Math.max(DEFAULT_CACHE_SIZE,
                                      2 * visiblePages.length + 1);
    this._buffer.resize(suggestedCacheSize);

    this.renderingQueue.renderHighestPriority(visible);

    let currentId = this._currentPageNumber;
    let firstPage = visible.first;
    let stillFullyVisible = false;

    for (let i = 0, ii = visiblePages.length; i < ii; ++i) {
      let page = visiblePages[i];

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
      location: this._location,
    });
  }

  containsElement(element) {
    return this.container.contains(element);
  }

  focus() {
    this.container.focus();
  }

  get isInPresentationMode() {
    return this.presentationModeState === PresentationModeState.FULLSCREEN;
  }

  get isChangingPresentationMode() {
    return this.presentationModeState === PresentationModeState.CHANGING;
  }

  get isHorizontalScrollbarEnabled() {
    return (this.isInPresentationMode ?
      false : (this.container.scrollWidth > this.container.clientWidth));
  }

  _getVisiblePages() {
    if (!this.isInPresentationMode) {
      return getVisibleElements(this.container, this._pages, true);
    }
    // The algorithm in getVisibleElements doesn't work in all browsers and
    // configurations when presentation mode is active.
    let visible = [];
    let currentPage = this._pages[this._currentPageNumber - 1];
    visible.push({ id: currentPage.id, view: currentPage, });
    return { first: currentPage, last: currentPage, views: visible, };
  }

  cleanup() {
    for (let i = 0, ii = this._pages.length; i < ii; i++) {
      if (this._pages[i] &&
          this._pages[i].renderingState !== RenderingStates.FINISHED) {
        this._pages[i].reset();
      }
    }
  }

  /**
   * @private
   */
  _cancelRendering() {
    for (let i = 0, ii = this._pages.length; i < ii; i++) {
      if (this._pages[i]) {
        this._pages[i].cancelRendering();
      }
    }
  }

  /**
   * @param {PDFPageView} pageView
   * @returns {Promise} Returns a promise containing a {PDFPageProxy} object.
   * @private
   */
  _ensurePdfPageLoaded(pageView) {
    if (pageView.pdfPage) {
      return Promise.resolve(pageView.pdfPage);
    }
    let pageNumber = pageView.id;
    if (this._pagesRequests[pageNumber]) {
      return this._pagesRequests[pageNumber];
    }
    let promise = this.pdfDocument.getPage(pageNumber).then((pdfPage) => {
      if (!pageView.pdfPage) {
        pageView.setPdfPage(pdfPage);
      }
      this._pagesRequests[pageNumber] = null;
      return pdfPage;
    }).catch((reason) => {
      console.error('Unable to get page for page view', reason);
      // Page error -- there is nothing can be done.
      this._pagesRequests[pageNumber] = null;
    });
    this._pagesRequests[pageNumber] = promise;
    return promise;
  }

  forceRendering(currentlyVisiblePages) {
    let visiblePages = currentlyVisiblePages || this._getVisiblePages();
    let pageView = this.renderingQueue.getHighestPriority(visiblePages,
                                                          this._pages,
                                                          this.scroll.down);
    if (pageView) {
      this._ensurePdfPageLoaded(pageView).then(() => {
        this.renderingQueue.renderView(pageView);
      });
      return true;
    }
    return false;
  }

  getPageTextContent(pageIndex) {
    return this.pdfDocument.getPage(pageIndex + 1).then(function(page) {
      return page.getTextContent({
        normalizeWhitespace: true,
      });
    });
  }

  /**
   * @param {HTMLDivElement} textLayerDiv
   * @param {number} pageIndex
   * @param {PageViewport} viewport
   * @returns {TextLayerBuilder}
   */
  createTextLayerBuilder(textLayerDiv, pageIndex, viewport,
                         enhanceTextSelection = false) {
    return new TextLayerBuilder({
      textLayerDiv,
      eventBus: this.eventBus,
      pageIndex,
      viewport,
      findController: this.isInPresentationMode ? null : this.findController,
      enhanceTextSelection: this.isInPresentationMode ? false :
                                                        enhanceTextSelection,
    });
  }

  /**
   * @param {HTMLDivElement} pageDiv
   * @param {PDFPage} pdfPage
   * @param {boolean} renderInteractiveForms
   * @param {IL10n} l10n
   * @returns {AnnotationLayerBuilder}
   */
  createAnnotationLayerBuilder(pageDiv, pdfPage, renderInteractiveForms = false,
                               l10n = NullL10n) {
    return new AnnotationLayerBuilder({
      pageDiv,
      pdfPage,
      renderInteractiveForms,
      linkService: this.linkService,
      downloadManager: this.downloadManager,
      l10n,
    });
  }

  setFindController(findController) {
    this.findController = findController;
  }

  /**
   * @returns {boolean} Whether all pages of the PDF document have identical
   *                    widths and heights.
   */
  get hasEqualPageSizes() {
    let firstPageView = this._pages[0];
    for (let i = 1, ii = this._pages.length; i < ii; ++i) {
      let pageView = this._pages[i];
      if (pageView.width !== firstPageView.width ||
          pageView.height !== firstPageView.height) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns sizes of the pages.
   * @returns {Array} Array of objects with width/height/rotation fields.
   */
  getPagesOverview() {
    let pagesOverview = this._pages.map(function(pageView) {
      let viewport = pageView.pdfPage.getViewport(1);
      return {
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation,
      };
    });
    if (!this.enablePrintAutoRotate) {
      return pagesOverview;
    }
    let isFirstPagePortrait = isPortraitOrientation(pagesOverview[0]);
    return pagesOverview.map(function (size) {
      if (isFirstPagePortrait === isPortraitOrientation(size)) {
        return size;
      }
      return {
        width: size.height,
        height: size.width,
        rotation: (size.rotation + 90) % 360,
      };
    });
  }
}

export {
  PresentationModeState,
  PDFViewer,
};
