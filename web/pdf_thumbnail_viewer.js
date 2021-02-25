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
  getVisibleElements,
  isValidRotation,
  scrollIntoView,
  watchScroll,
} from "./ui_utils.js";
import { PDFThumbnailView, TempImageFactory } from "./pdf_thumbnail_view.js";
import { RenderingStates } from "./pdf_rendering_queue.js";

const THUMBNAIL_SCROLL_MARGIN = -19;
const THUMBNAIL_SELECTED_CLASS = "selected";

/**
 * @typedef {Object} PDFThumbnailViewerOptions
 * @property {HTMLDivElement} container - The container for the thumbnail
 *   elements.
 * @property {EventBus} eventBus - The application event bus.
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
  constructor({ container, eventBus, linkService, renderingQueue, l10n }) {
    this.container = container;
    this.linkService = linkService;
    this.renderingQueue = renderingQueue;
    this.l10n = l10n;

    this.scroll = watchScroll(this.container, this._scrollUpdated.bind(this));
    this._resetView();

    eventBus._on("optionalcontentconfigchanged", () => {
      // Ensure that the thumbnails always render with the *default* optional
      // content configuration.
      this._setImageDisabled = true;
    });
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
    return getVisibleElements({
      scrollEl: this.container,
      views: this._thumbnails,
    });
  }

  scrollThumbnailIntoView(pageNumber) {
    if (!this.pdfDocument) {
      return;
    }
    const thumbnailView = this._thumbnails[pageNumber - 1];

    if (!thumbnailView) {
      console.error('scrollThumbnailIntoView: Invalid "pageNumber" parameter.');
      return;
    }

    if (pageNumber !== this._currentPageNumber) {
      const prevThumbnailView = this._thumbnails[this._currentPageNumber - 1];
      // Remove the highlight from the previous thumbnail...
      prevThumbnailView.div.classList.remove(THUMBNAIL_SELECTED_CLASS);
      // ... and add the highlight to the new thumbnail.
      thumbnailView.div.classList.add(THUMBNAIL_SELECTED_CLASS);
    }
    const visibleThumbs = this._getVisibleThumbs();
    const numVisibleThumbs = visibleThumbs.views.length;

    // If the thumbnail isn't currently visible, scroll it into view.
    if (numVisibleThumbs > 0) {
      const first = visibleThumbs.first.id;
      // Account for only one thumbnail being visible.
      const last = numVisibleThumbs > 1 ? visibleThumbs.last.id : first;

      let shouldScroll = false;
      if (pageNumber <= first || pageNumber >= last) {
        shouldScroll = true;
      } else {
        visibleThumbs.views.some(function (view) {
          if (view.id !== pageNumber) {
            return false;
          }
          shouldScroll = view.percent < 100;
          return true;
        });
      }
      if (shouldScroll) {
        scrollIntoView(thumbnailView.div, { top: THUMBNAIL_SCROLL_MARGIN });
      }
    }

    this._currentPageNumber = pageNumber;
  }

  get pagesRotation() {
    return this._pagesRotation;
  }

  set pagesRotation(rotation) {
    if (!isValidRotation(rotation)) {
      throw new Error("Invalid thumbnails rotation angle.");
    }
    if (!this.pdfDocument) {
      return;
    }
    if (this._pagesRotation === rotation) {
      return; // The rotation didn't change.
    }
    this._pagesRotation = rotation;

    for (let i = 0, ii = this._thumbnails.length; i < ii; i++) {
      this._thumbnails[i].update(rotation);
    }
  }

  cleanup() {
    for (let i = 0, ii = this._thumbnails.length; i < ii; i++) {
      if (
        this._thumbnails[i] &&
        this._thumbnails[i].renderingState !== RenderingStates.FINISHED
      ) {
        this._thumbnails[i].reset();
      }
    }
    TempImageFactory.destroyCanvas();
  }

  /**
   * @private
   */
  _resetView() {
    this._thumbnails = [];
    this._currentPageNumber = 1;
    this._pageLabels = null;
    this._pagesRotation = 0;
    this._optionalContentConfigPromise = null;
    this._pagesRequests = new WeakMap();
    this._setImageDisabled = false;

    // Remove the thumbnails from the DOM.
    this.container.textContent = "";
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
    const firstPagePromise = pdfDocument.getPage(1);
    const optionalContentConfigPromise = pdfDocument.getOptionalContentConfig();

    firstPagePromise
      .then(firstPdfPage => {
        this._optionalContentConfigPromise = optionalContentConfigPromise;

        const pagesCount = pdfDocument.numPages;
        const viewport = firstPdfPage.getViewport({ scale: 1 });
        const checkSetImageDisabled = () => {
          return this._setImageDisabled;
        };

        for (let pageNum = 1; pageNum <= pagesCount; ++pageNum) {
          const thumbnail = new PDFThumbnailView({
            container: this.container,
            id: pageNum,
            defaultViewport: viewport.clone(),
            optionalContentConfigPromise,
            linkService: this.linkService,
            renderingQueue: this.renderingQueue,
            checkSetImageDisabled,
            disableCanvasToImageConversion: false,
            l10n: this.l10n,
          });
          this._thumbnails.push(thumbnail);
        }
        // Set the first `pdfPage` immediately, since it's already loaded,
        // rather than having to repeat the `PDFDocumentProxy.getPage` call in
        // the `this._ensurePdfPageLoaded` method before rendering can start.
        const firstThumbnailView = this._thumbnails[0];
        if (firstThumbnailView) {
          firstThumbnailView.setPdfPage(firstPdfPage);
        }

        // Ensure that the current thumbnail is always highlighted on load.
        const thumbnailView = this._thumbnails[this._currentPageNumber - 1];
        thumbnailView.div.classList.add(THUMBNAIL_SELECTED_CLASS);
      })
      .catch(reason => {
        console.error("Unable to initialize thumbnail viewer", reason);
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
    } else if (
      !(Array.isArray(labels) && this.pdfDocument.numPages === labels.length)
    ) {
      this._pageLabels = null;
      console.error("PDFThumbnailViewer_setPageLabels: Invalid page labels.");
    } else {
      this._pageLabels = labels;
    }
    // Update all the `PDFThumbnailView` instances.
    for (let i = 0, ii = this._thumbnails.length; i < ii; i++) {
      this._thumbnails[i].setPageLabel(this._pageLabels?.[i] ?? null);
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
    if (this._pagesRequests.has(thumbView)) {
      return this._pagesRequests.get(thumbView);
    }
    const promise = this.pdfDocument
      .getPage(thumbView.id)
      .then(pdfPage => {
        if (!thumbView.pdfPage) {
          thumbView.setPdfPage(pdfPage);
        }
        this._pagesRequests.delete(thumbView);
        return pdfPage;
      })
      .catch(reason => {
        console.error("Unable to get page for thumb view", reason);
        // Page error -- there is nothing that can be done.
        this._pagesRequests.delete(thumbView);
      });
    this._pagesRequests.set(thumbView, promise);
    return promise;
  }

  forceRendering() {
    const visibleThumbs = this._getVisibleThumbs();
    const thumbView = this.renderingQueue.getHighestPriority(
      visibleThumbs,
      this._thumbnails,
      this.scroll.down
    );
    if (thumbView) {
      this._ensurePdfPageLoaded(thumbView).then(() => {
        this.renderingQueue.renderView(thumbView);
      });
      return true;
    }
    return false;
  }
}

export { PDFThumbnailViewer };
