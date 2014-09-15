/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
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
 /*globals watchScroll, Cache, DEFAULT_CACHE_SIZE, PageView, UNKNOWN_SCALE,
           IGNORE_CURRENT_POSITION_ON_ZOOM, SCROLLBAR_PADDING, VERTICAL_PADDING,
           MAX_AUTO_SCALE, getVisibleElements, RenderingStates, Promise,
           CSS_UNITS, PDFJS */

'use strict';

var PresentationModeState = {
  UNKNOWN: 0,
  NORMAL: 1,
  CHANGING: 2,
  FULLSCREEN: 3,
};

var PDFViewer = (function pdfViewer() {
  function PDFViewer(options) {
    this.container = options.container;
    this.viewer = options.viewer;
    this.renderingQueue = options.renderingQueue;
    this.linkService = options.linkService;

    this.scroll = watchScroll(this.container, this._scrollUpdate.bind(this));
    this.updateInProgress = false;
    this.presentationModeState = PresentationModeState.UNKNOWN;
    this.resetView();
  }

  PDFViewer.prototype = {
    get pagesCount() {
      return this.pages.length;
    },

    getPageView: function (index) {
      return this.pages[index];
    },

    setCurrentPageNumber: function (val) {
      var event = document.createEvent('UIEvents');
      event.initUIEvent('pagechange', true, true, window, 0);
      event.updateInProgress = this.updateInProgress;

      if (!(0 < val && val <= this.pagesCount)) {
        this.previousPageNumber = val;
        event.pageNumber = this.page;
        this.container.dispatchEvent(event);
        return;
      }

      this.pages[val - 1].updateStats();
      this.previousPageNumber = this.currentPageNumber;
      this.currentPageNumber = val;
      event.pageNumber = val;
      this.container.dispatchEvent(event);
    },

    setDocument: function (pdfDocument) {
      if (this.pdfDocument) {
        this.resetView();
      }

      this.pdfDocument = pdfDocument;
      if (!pdfDocument) {
        return;
      }

      var pagesCount = pdfDocument.numPages;
      var pagesRefMap = this.pagesRefMap = {};
      var self = this;

      var resolvePagesPromise;
      var pagesPromise = new Promise(function (resolve) {
        resolvePagesPromise = resolve;
      });
      this.pagesPromise = pagesPromise;
      pagesPromise.then(function () {
        var event = document.createEvent('CustomEvent');
        event.initCustomEvent('pagesloaded', true, true, {
          pagesCount: pagesCount
        });
        self.container.dispatchEvent(event);
      });

      var isOnePageRenderedResolved = false;
      var resolveOnePageRendered = null;
      var onePageRendered = new Promise(function (resolve) {
        resolveOnePageRendered = resolve;
      });
      this.onePageRendered = onePageRendered;

      var bindOnAfterDraw = function (pageView) {
        // when page is painted, using the image as thumbnail base
        pageView.onAfterDraw = function pdfViewLoadOnAfterDraw() {
          if (!isOnePageRenderedResolved) {
            isOnePageRenderedResolved = true;
            resolveOnePageRendered();
          }
          var event = document.createEvent('CustomEvent');
          event.initCustomEvent('pagerendered', true, true, {
            pageNumber: pageView.id
          });
          self.container.dispatchEvent(event);
        };
      };

      var firstPagePromise = pdfDocument.getPage(1);
      this.firstPagePromise = firstPagePromise;

      // Fetch a single page so we can get a viewport that will be the default
      // viewport for all pages
      return firstPagePromise.then(function(pdfPage) {
        var scale = this.currentScale || 1.0;
        var viewport = pdfPage.getViewport(scale * CSS_UNITS);
        for (var pageNum = 1; pageNum <= pagesCount; ++pageNum) {
          var pageSource = new PDFPageSource(pdfDocument, pageNum);
          var pageView = new PageView(this.viewer, pageNum, scale,
                                      viewport.clone(), this.linkService,
                                      this.renderingQueue, this.cache,
                                      pageSource, this);
          bindOnAfterDraw(pageView);
          this.pages.push(pageView);
        }

        // Fetch all the pages since the viewport is needed before printing
        // starts to create the correct size canvas. Wait until one page is
        // rendered so we don't tie up too many resources early on.
        onePageRendered.then(function () {
          if (!PDFJS.disableAutoFetch) {
            var getPagesLeft = pagesCount;
            for (var pageNum = 1; pageNum <= pagesCount; ++pageNum) {
              pdfDocument.getPage(pageNum).then(function (pageNum, pdfPage) {
                var pageView = self.pages[pageNum - 1];
                if (!pageView.pdfPage) {
                  pageView.setPdfPage(pdfPage);
                }
                var refStr = pdfPage.ref.num + ' ' + pdfPage.ref.gen + ' R';
                pagesRefMap[refStr] = pageNum;
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
      }.bind(this));
    },

    resetView: function () {
      this.cache = new Cache(DEFAULT_CACHE_SIZE);
      this.pages = [];
      this.currentPageNumber = 1;
      this.previousPageNumber = 1;
      this.currentScale = UNKNOWN_SCALE;
      this.currentScaleValue = null;
      this.location = null;

      var container = this.viewer;
      while (container.hasChildNodes()) {
        container.removeChild(container.lastChild);
      }
    },

    _scrollUpdate: function () {
      if (this.pagesCount === 0) {
        return;
      }
      this.update();
    },

    _setScaleUpdatePages: function pdfViewer_setScaleUpdatePages(
        newScale, newValue, resetAutoSettings, noScroll, preset) {
      this.currentScaleValue = newValue;
      if (newScale === this.currentScale) {
        return;
      }
      for (var i = 0, ii = this.pages.length; i < ii; i++) {
        this.pages[i].update(newScale);
      }
      this.currentScale = newScale;

      if (!noScroll) {
        var page = this.currentPageNumber, dest;
        var inPresentationMode =
          this.presentationModeState === PresentationModeState.CHANGING ||
          this.presentationModeState === PresentationModeState.FULLSCREEN;
        if (this.location && !inPresentationMode &&
          !IGNORE_CURRENT_POSITION_ON_ZOOM) {
          page = this.location.pageNumber;
          dest = [null, { name: 'XYZ' }, this.location.left,
            this.location.top, null];
        }
        this.pages[page - 1].scrollIntoView(dest);
      }

      var event = document.createEvent('UIEvents');
      event.initUIEvent('scalechange', true, true, window, 0);
      event.scale = newScale;
      event.resetAutoSettings = resetAutoSettings;
      if (preset) {
        event.presetValue = newValue;
      }
      this.container.dispatchEvent(event);
    },

    setScale: function pdfViewer_setScale(value, resetAutoSettings, noScroll) {
      if (value === 'custom') {
        return;
      }
      var scale = parseFloat(value);

      if (scale > 0) {
        this._setScaleUpdatePages(scale, value, true, noScroll, false);
      } else {
        var currentPage = this.pages[this.currentPageNumber - 1];
        if (!currentPage) {
          return;
        }
        var inPresentationMode =
          this.presentationModeState === PresentationModeState.FULLSCREEN;
        var hPadding = inPresentationMode ? 0 : SCROLLBAR_PADDING;
        var vPadding = inPresentationMode ? 0 : VERTICAL_PADDING;
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
            var horizontalScale = isLandscape ? pageHeightScale :
                                                pageWidthScale;
            scale = Math.min(MAX_AUTO_SCALE, horizontalScale);
            break;
          default:
            console.error('pdfViewSetScale: \'' + value +
              '\' is an unknown zoom value.');
            return;
        }
        this._setScaleUpdatePages(scale, value, resetAutoSettings, noScroll,
                                  true);
      }
    },

    updateRotation: function pdfViewRotatePages(rotation) {
      for (var i = 0, l = this.pages.length; i < l; i++) {
        var page = this.pages[i];
        page.update(page.scale, rotation);
      }

      this.setScale(this.currentScaleValue, true, true);
    },

    updateLocation: function (firstPage) {
      var currentScale = this.currentScale;
      var currentScaleValue = this.currentScaleValue;
      var normalizedScaleValue =
        parseFloat(currentScaleValue) === currentScale ?
        Math.round(currentScale * 10000) / 100 : currentScaleValue;

      var pageNumber = firstPage.id;
      var pdfOpenParams = '#page=' + pageNumber;
      pdfOpenParams += '&zoom=' + normalizedScaleValue;
      var currentPageView = this.pages[pageNumber - 1];
      var container = this.container;
      var topLeft = currentPageView.getPagePoint(
        (container.scrollLeft - firstPage.x),
        (container.scrollTop - firstPage.y));
      var intLeft = Math.round(topLeft[0]);
      var intTop = Math.round(topLeft[1]);
      pdfOpenParams += ',' + intLeft + ',' + intTop;

      this.location = {
        pageNumber: pageNumber,
        scale: normalizedScaleValue,
        top: intTop,
        left: intLeft,
        pdfOpenParams: pdfOpenParams
      };
    },

    update: function () {
      var visible = this.getVisiblePages();
      var visiblePages = visible.views;
      if (visiblePages.length === 0) {
        return;
      }

      this.updateInProgress = true;

      var suggestedCacheSize = Math.max(DEFAULT_CACHE_SIZE,
          2 * visiblePages.length + 1);
      this.cache.resize(suggestedCacheSize);

      this.renderingQueue.renderHighestPriority(visible);

      var currentId = this.currentPageNumber;
      var firstPage = visible.first;

      for (var i = 0, ii = visiblePages.length, stillFullyVisible = false;
           i < ii; ++i) {
        var page = visiblePages[i];

        if (page.percent < 100) {
          break;
        }
        if (page.id === this.currentPageNumber) {
          stillFullyVisible = true;
          break;
        }
      }

      if (!stillFullyVisible) {
        currentId = visiblePages[0].id;
      }

      if (this.presentationModeState !== PresentationModeState.FULLSCREEN) {
        this.setCurrentPageNumber(currentId);
      }

      this.updateLocation(firstPage);

      this.updateInProgress = false;

      var event = document.createEvent('UIEvents');
      event.initUIEvent('updateviewarea', true, true, window, 0);
      this.container.dispatchEvent(event);
    },

    containsElement: function (element) {
      return this.container.contains(element);
    },

    focus: function () {
      this.container.focus();
    },

    blur: function () {
      this.container.blur();
    },

    get isHorizontalScrollbarEnabled() {
      return (this.presentationModeState === PresentationModeState.FULLSCREEN ?
        false : (this.container.scrollWidth > this.container.clientWidth));
    },

    getVisiblePages: function () {
      if (this.presentationModeState !== PresentationModeState.FULLSCREEN) {
        return getVisibleElements(this.container, this.pages, true);
      } else {
        // The algorithm in getVisibleElements doesn't work in all browsers and
        // configurations when presentation mode is active.
        var visible = [];
        var currentPage = this.pages[this.currentPageNumber - 1];
        visible.push({ id: currentPage.id, view: currentPage });
        return { first: currentPage, last: currentPage, views: visible };
      }
    },

    cleanup: function () {
      for (var i = 0, ii = this.pages.length; i < ii; i++) {
        if (this.pages[i] &&
          this.pages[i].renderingState !== RenderingStates.FINISHED) {
          this.pages[i].reset();
        }
      }
    },

    forceRendering: function (currentlyVisiblePages) {
      var visiblePages = currentlyVisiblePages || this.getVisiblePages();
      var pageView = this.renderingQueue.getHighestPriority(visiblePages,
                                                            this.pages,
                                                            this.scroll.down);
      if (pageView) {
        this.renderingQueue.renderView(pageView);
        return;
      }
    },

    getPageTextContent: function (pageIndex) {
      return this.pdfDocument.getPage(pageIndex + 1).then(function (page) {
        return page.getTextContent();
      });
    },
  };

  return PDFViewer;
})();

var PDFPageSource = (function PDFPageSourceClosure() {
  function PDFPageSource(pdfDocument, pageNumber) {
    this.pdfDocument = pdfDocument;
    this.pageNumber = pageNumber;
  }

  PDFPageSource.prototype = {
    getPage: function () {
      return this.pdfDocument.getPage(this.pageNumber);
    }
  };

  return PDFPageSource;
})();
