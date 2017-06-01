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

import {
  getVisibleElements, NullL10n, scrollIntoView, watchScroll
} from './ui_utils';
import { PDFThumbnailView } from './pdf_thumbnail_view';

var THUMBNAIL_SCROLL_MARGIN = -19;

/**
 * @typedef {Object} PDFThumbnailViewerOptions
 * @property {HTMLDivElement} container - The container for the thumbnail
 *   elements.
 * @property {IPDFLinkService} linkService - The navigation/linking service.
 * @property {PDFRenderingQueue} renderingQueue - The rendering queue object.
 * @property {IL10n} l10n - Localization service.
 */

/**
 * Simple viewer control to display thumbnails for pages.
 * @class
 * @implements {IRenderableView}
 */
var PDFThumbnailViewer = (function PDFThumbnailViewerClosure() {
  /**
   * @constructs PDFThumbnailViewer
   * @param {PDFThumbnailViewerOptions} options
   */
  function PDFThumbnailViewer(options) {
    this.container = options.container;
    this.renderingQueue = options.renderingQueue;
    this.linkService = options.linkService;
    this.l10n = options.l10n || NullL10n;

    this.scroll = watchScroll(this.container, this._scrollUpdated.bind(this));
    this._resetView();
  }

  PDFThumbnailViewer.prototype = {
    /**
     * @private
     */
    _scrollUpdated: function PDFThumbnailViewer_scrollUpdated() {
      this.renderingQueue.renderHighestPriority();
    },

    getThumbnail: function PDFThumbnailViewer_getThumbnail(index) {
      return this.thumbnails[index];
    },

    /**
     * @private
     */
    _getVisibleThumbs: function PDFThumbnailViewer_getVisibleThumbs() {
      return getVisibleElements(this.container, this.thumbnails);
    },

    scrollThumbnailIntoView:
        function PDFThumbnailViewer_scrollThumbnailIntoView(page) {
      var selected = document.querySelector('.thumbnail.selected');
      if (selected) {
        selected.classList.remove('selected');
      }
      var thumbnail = document.querySelector(
        'div.thumbnail[data-page-number="' + page + '"]');
      if (thumbnail) {
        thumbnail.classList.add('selected');
      }
      var visibleThumbs = this._getVisibleThumbs();
      var numVisibleThumbs = visibleThumbs.views.length;

      // If the thumbnail isn't currently visible, scroll it into view.
      if (numVisibleThumbs > 0) {
        var first = visibleThumbs.first.id;
        // Account for only one thumbnail being visible.
        var last = (numVisibleThumbs > 1 ? visibleThumbs.last.id : first);
        if (page <= first || page >= last) {
          scrollIntoView(thumbnail, { top: THUMBNAIL_SCROLL_MARGIN, });
        }
      }
    },

    get pagesRotation() {
      return this._pagesRotation;
    },

    set pagesRotation(rotation) {
      this._pagesRotation = rotation;
      for (var i = 0, l = this.thumbnails.length; i < l; i++) {
        var thumb = this.thumbnails[i];
        thumb.update(rotation);
      }
    },

    cleanup: function PDFThumbnailViewer_cleanup() {
      PDFThumbnailView.cleanup();
    },

    /**
     * @private
     */
    _resetView: function PDFThumbnailViewer_resetView() {
      this.thumbnails = [];
      this._pageLabels = null;
      this._pagesRotation = 0;
      this._pagesRequests = [];

      // Remove the thumbnails from the DOM.
      this.container.textContent = '';
    },

    setDocument: function PDFThumbnailViewer_setDocument(pdfDocument) {
      if (this.pdfDocument) {
        this._cancelRendering();
        this._resetView();
      }

      this.pdfDocument = pdfDocument;
      if (!pdfDocument) {
        return Promise.resolve();
      }

      return pdfDocument.getPage(1).then((firstPage) => {
        var pagesCount = pdfDocument.numPages;
        var viewport = firstPage.getViewport(1.0);
        for (let pageNum = 1; pageNum <= pagesCount; ++pageNum) {
          var thumbnail = new PDFThumbnailView({
            container: this.container,
            id: pageNum,
            defaultViewport: viewport.clone(),
            linkService: this.linkService,
            renderingQueue: this.renderingQueue,
            disableCanvasToImageConversion: false,
            l10n: this.l10n,
          });
          this.thumbnails.push(thumbnail);
        }
      });
    },

    /**
     * @private
     */
    _cancelRendering: function PDFThumbnailViewer_cancelRendering() {
      for (var i = 0, ii = this.thumbnails.length; i < ii; i++) {
        if (this.thumbnails[i]) {
          this.thumbnails[i].cancelRendering();
        }
      }
    },

    /**
     * @param {Array|null} labels
     */
    setPageLabels: function PDFThumbnailViewer_setPageLabels(labels) {
      if (!this.pdfDocument) {
        return;
      }
      if (!labels) {
        this._pageLabels = null;
      } else if (!(labels instanceof Array &&
                   this.pdfDocument.numPages === labels.length)) {
        this._pageLabels = null;
        console.error('PDFThumbnailViewer_setPageLabels: Invalid page labels.');
      } else {
        this._pageLabels = labels;
      }
      // Update all the `PDFThumbnailView` instances.
      for (var i = 0, ii = this.thumbnails.length; i < ii; i++) {
        var thumbnailView = this.thumbnails[i];
        var label = this._pageLabels && this._pageLabels[i];
        thumbnailView.setPageLabel(label);
      }
    },

    /**
     * @param {PDFThumbnailView} thumbView
     * @returns {PDFPage}
     * @private
     */
    _ensurePdfPageLoaded(thumbView) {
      if (thumbView.pdfPage) {
        return Promise.resolve(thumbView.pdfPage);
      }
      var pageNumber = thumbView.id;
      if (this._pagesRequests[pageNumber]) {
        return this._pagesRequests[pageNumber];
      }
      var promise = this.pdfDocument.getPage(pageNumber).then((pdfPage) => {
        thumbView.setPdfPage(pdfPage);
        this._pagesRequests[pageNumber] = null;
        return pdfPage;
      });
      this._pagesRequests[pageNumber] = promise;
      return promise;
    },

    forceRendering() {
      var visibleThumbs = this._getVisibleThumbs();
      var thumbView = this.renderingQueue.getHighestPriority(visibleThumbs,
                                                             this.thumbnails,
                                                             this.scroll.down);
      if (thumbView) {
        this._ensurePdfPageLoaded(thumbView).then(() => {
          this.renderingQueue.renderView(thumbView);
        });
        return true;
      }
      return false;
    },
  };

  return PDFThumbnailViewer;
})();

export {
  PDFThumbnailViewer,
};
