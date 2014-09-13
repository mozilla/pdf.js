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
           MAX_AUTO_SCALE, getVisibleElements, PresentationMode,
           RenderingStates */

'use strict';

var PDFViewer = (function pdfViewer() {
  function PDFViewer(options) {
    this.container = options.container;
    this.viewer = options.viewer;
    this.renderingQueue = options.renderingQueue;
    this.linkService = options.linkService;

    this.scroll = watchScroll(this.container, this._scrollUpdate.bind(this));
    this.pages = [];
    this.cache = new Cache(DEFAULT_CACHE_SIZE);
    this.currentPageNumber = 1;
    this.previousPageNumber = 1;
    this.updateInProgress = true;
    this.resetView();
  }

  PDFViewer.prototype = {
    get pagesCount() {
      return this.pages.length;
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

    addPage: function (pageNum, scale, viewport) {
      var pageView = new PageView(this.viewer, pageNum, scale, viewport,
                                  this.linkService, this.renderingQueue,
                                  this.cache, this);
      this.pages.push(pageView);
      return pageView;
    },

    resetView: function () {
      this.currentScale = UNKNOWN_SCALE;
      this.currentScaleValue = null;
      this.location = null;
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
        if (this.location && !this.inPresentationMode &&
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
        var hPadding = PresentationMode.active ? 0 : SCROLLBAR_PADDING;
        var vPadding = PresentationMode.active ? 0 : VERTICAL_PADDING;
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

    removeAllPages: function () {
      var container = this.viewer;
      while (container.hasChildNodes()) {
        container.removeChild(container.lastChild);
      }
      this.pages = [];
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

    get inPresentationMode() {
      return PresentationMode.active || PresentationMode.switchInProgress;
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

      if (!PresentationMode.active) {
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
      return (PresentationMode.active ? false :
        (this.container.scrollWidth > this.container.clientWidth));
    },

    getVisiblePages: function () {
      if (!PresentationMode.active) {
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
        this.renderingQueue.renderView(pageView, 'page');
        return;
      }
    },
  };

  return PDFViewer;
})();
