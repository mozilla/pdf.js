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

const THUMBNAIL_SCROLL_MARGIN = -19;

/**
 * @typedef {Object} PDFThumbnailViewerOptions
 * @property {HTMLDivElement} container - The container for the thumbnail
 *   elements.
 * @property {IPDFLinkService} linkService - The navigation/linking service.
 * @property {PDFRenderingQueue} renderingQueue - The rendering queue object.
 * @property {IL10n} l10n - Localization service.
 */

/**
 * Viewer control to display thumbnails for pages in a PDF document.
 *
 * @implements {IRenderableView}
 */
class PDFThumbnailViewer {
  /**
   * @param {PDFThumbnailViewerOptions} options
   */
  constructor({ container, linkService, renderingQueue, l10n = NullL10n, }) {
    this.container = container;
    this.linkService = linkService;
    this.renderingQueue = renderingQueue;
    this.l10n = l10n;

    this.scroll = watchScroll(this.container, this._scrollUpdated.bind(this));
    this._resetView();
  }

  /**
   * @private
   */
  _scrollUpdated() {
    this.renderingQueue.renderHighestPriority();
  }

  getThumbnail(index) {
    return this._thumbnails[index];
  }

  /**
   * @private
   */
  _getVisibleThumbs() {
    return getVisibleElements(this.container, this._thumbnails);
  }

  scrollThumbnailIntoView(page) {
    let selected = document.querySelector('.thumbnail.selected');
    if (selected) {
      selected.classList.remove('selected');
    }
    let thumbnail = document.querySelector(
      'div.thumbnail[data-page-number="' + page + '"]');
    if (thumbnail) {
      thumbnail.classList.add('selected');
    }
    let visibleThumbs = this._getVisibleThumbs();
    let numVisibleThumbs = visibleThumbs.views.length;

    // If the thumbnail isn't currently visible, scroll it into view.
    if (numVisibleThumbs > 0) {
      let first = visibleThumbs.first.id;
      // Account for only one thumbnail being visible.
      let last = (numVisibleThumbs > 1 ? visibleThumbs.last.id : first);
      if (page <= first || page >= last) {
        scrollIntoView(thumbnail, { top: THUMBNAIL_SCROLL_MARGIN, });
      }
    }
  }

  get pagesRotation() {
    return this._pagesRotation;
  }

  set pagesRotation(rotation) {
    if (!(typeof rotation === 'number' && rotation % 90 === 0)) {
      throw new Error('Invalid thumbnails rotation angle.');
    }
    if (!this.pdfDocument) {
      return;
    }
    this._pagesRotation = rotation;

    for (let i = 0, ii = this._thumbnails.length; i < ii; i++) {
      this._thumbnails[i].update(rotation);
    }
  }

  cleanup() {
    PDFThumbnailView.cleanup();
  }

  /**
   * @private
   */
  _resetView() {
    this._thumbnails = [];
    this._pageLabels = null;
    this._pagesRotation = 0;
    this._pagesRequests = [];

    // Remove the thumbnails from the DOM.
    this.container.textContent = '';
  }

  setDocument(pdfDocument) {
    if (this.pdfDocument) {
      this._cancelRendering();
      this._resetView();
    }

    this.pdfDocument = pdfDocument;
    if (!pdfDocument) {
      return;
    }

    pdfDocument.getPage(1).then((firstPage) => {
      let pagesCount = pdfDocument.numPages;
      let viewport = firstPage.getViewport(1.0);
      for (let pageNum = 1; pageNum <= pagesCount; ++pageNum) {
        let thumbnail = new PDFThumbnailView({
          container: this.container,
          id: pageNum,
          defaultViewport: viewport.clone(),
          linkService: this.linkService,
          renderingQueue: this.renderingQueue,
          disableCanvasToImageConversion: false,
          l10n: this.l10n,
        });
        this._thumbnails.push(thumbnail);
      }
    }).catch((reason) => {
      console.error('Unable to initialize thumbnail viewer', reason);
    });
  }

  /**
   * @private
   */
  _cancelRendering() {
    for (let i = 0, ii = this._thumbnails.length; i < ii; i++) {
      if (this._thumbnails[i]) {
        this._thumbnails[i].cancelRendering();
      }
    }
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
      console.error('PDFThumbnailViewer_setPageLabels: Invalid page labels.');
    } else {
      this._pageLabels = labels;
    }
    // Update all the `PDFThumbnailView` instances.
    for (let i = 0, ii = this._thumbnails.length; i < ii; i++) {
      let label = this._pageLabels && this._pageLabels[i];
      this._thumbnails[i].setPageLabel(label);
    }
  }

  /**
   * @param {PDFThumbnailView} thumbView
   * @returns {PDFPage}
   * @private
   */
  _ensurePdfPageLoaded(thumbView) {
    if (thumbView.pdfPage) {
      return Promise.resolve(thumbView.pdfPage);
    }
    let pageNumber = thumbView.id;
    if (this._pagesRequests[pageNumber]) {
      return this._pagesRequests[pageNumber];
    }
    let promise = this.pdfDocument.getPage(pageNumber).then((pdfPage) => {
      thumbView.setPdfPage(pdfPage);
      this._pagesRequests[pageNumber] = null;
      return pdfPage;
    }).catch((reason) => {
      console.error('Unable to get page for thumb view', reason);
      // Page error -- there is nothing can be done.
      this._pagesRequests[pageNumber] = null;
    });
    this._pagesRequests[pageNumber] = promise;
    return promise;
  }

  forceRendering() {
    let visibleThumbs = this._getVisibleThumbs();
    let thumbView = this.renderingQueue.getHighestPriority(visibleThumbs,
                                                           this._thumbnails,
                                                           this.scroll.down);
    if (thumbView) {
      this._ensurePdfPageLoaded(thumbView).then(() => {
        this.renderingQueue.renderView(thumbView);
      });
      return true;
    }
    return false;
  }
}

export {
  PDFThumbnailViewer,
};
