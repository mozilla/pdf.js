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

/** @typedef {import("./interfaces").IRenderableView} IRenderableView */
/** @typedef {import("./pdf_viewer").PDFViewer} PDFViewer */
// eslint-disable-next-line max-len
/** @typedef {import("./pdf_thumbnail_viewer").PDFThumbnailViewer} PDFThumbnailViewer */

import { RenderingCancelledException } from "pdfjs-lib";
import { RenderingStates } from "./ui_utils.js";

const CLEANUP_TIMEOUT = 30000;

/**
 * Controls rendering of the views for pages and thumbnails.
 */
class PDFRenderingQueue {
  constructor() {
    this.pdfViewer = null;
    this.pdfThumbnailViewer = null;
    this.onIdle = null;
    this.highestPriorityPage = null;
    /** @type {number} */
    this.idleTimeout = null;
    this.printing = false;
    this.isThumbnailViewEnabled = false;

    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
      Object.defineProperty(this, "hasViewer", {
        value: () => !!this.pdfViewer,
      });
    }
  }

  /**
   * @param {PDFViewer} pdfViewer
   */
  setViewer(pdfViewer) {
    this.pdfViewer = pdfViewer;
  }

  /**
   * @param {PDFThumbnailViewer} pdfThumbnailViewer
   */
  setThumbnailViewer(pdfThumbnailViewer) {
    this.pdfThumbnailViewer = pdfThumbnailViewer;
  }

  /**
   * @param {IRenderableView} view
   * @returns {boolean}
   */
  isHighestPriority(view) {
    return this.highestPriorityPage === view.renderingId;
  }

  /**
   * @param {Object} currentlyVisiblePages
   */
  renderHighestPriority(currentlyVisiblePages) {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }

    // Pages have a higher priority than thumbnails, so check them first.
    if (this.pdfViewer.forceRendering(currentlyVisiblePages)) {
      return;
    }
    // No pages needed rendering, so check thumbnails.
    if (
      this.isThumbnailViewEnabled &&
      this.pdfThumbnailViewer?.forceRendering()
    ) {
      return;
    }

    if (this.printing) {
      // If printing is currently ongoing do not reschedule cleanup.
      return;
    }

    if (this.onIdle) {
      this.idleTimeout = setTimeout(this.onIdle.bind(this), CLEANUP_TIMEOUT);
    }
  }

  /**
   * @param {Object} visible
   * @param {Array} views
   * @param {boolean} scrolledDown
   * @param {boolean} [preRenderExtra]
   * @param {boolean} [ignoreDetailViews]
   */
  getHighestPriority(
    visible,
    views,
    scrolledDown,
    preRenderExtra = false,
    ignoreDetailViews = false
  ) {
    /**
     * The state has changed. Figure out which page has the highest priority to
     * render next (if any).
     *
     * Priority:
     * 1. visible pages
     * 2. zoomed-in partial views of visible pages, unless `ignoreDetailViews`
     * 3. if last scrolled down, the page after the visible pages, or
     *    if last scrolled up, the page before the visible pages
     */
    const visibleViews = visible.views,
      numVisible = visibleViews.length;

    if (numVisible === 0) {
      return null;
    }
    for (let i = 0; i < numVisible; i++) {
      const view = visibleViews[i].view;
      if (!this.isViewFinished(view)) {
        return view;
      }
    }

    if (!ignoreDetailViews) {
      for (let i = 0; i < numVisible; i++) {
        const { detailView } = visibleViews[i].view;
        if (detailView && !this.isViewFinished(detailView)) {
          return detailView;
        }
      }
    }

    const firstId = visible.first.id,
      lastId = visible.last.id;

    // All the visible views have rendered; try to handle any "holes" in the
    // page layout (can happen e.g. with spreadModes at higher zoom levels).
    if (lastId - firstId + 1 > numVisible) {
      const visibleIds = visible.ids;
      for (let i = 1, ii = lastId - firstId; i < ii; i++) {
        const holeId = scrolledDown ? firstId + i : lastId - i;
        if (visibleIds.has(holeId)) {
          continue;
        }
        const holeView = views[holeId - 1];
        if (!this.isViewFinished(holeView)) {
          return holeView;
        }
      }
    }

    // All the visible views have rendered; try to render next/previous page.
    // (IDs start at 1, so no need to add 1 when `scrolledDown === true`.)
    let preRenderIndex = scrolledDown ? lastId : firstId - 2;
    let preRenderView = views[preRenderIndex];

    if (preRenderView && !this.isViewFinished(preRenderView)) {
      return preRenderView;
    }
    if (preRenderExtra) {
      preRenderIndex += scrolledDown ? 1 : -1;
      preRenderView = views[preRenderIndex];

      if (preRenderView && !this.isViewFinished(preRenderView)) {
        return preRenderView;
      }
    }
    // Everything that needs to be rendered has been.
    return null;
  }

  /**
   * @param {IRenderableView} view
   * @returns {boolean}
   */
  isViewFinished(view) {
    return view.renderingState === RenderingStates.FINISHED;
  }

  /**
   * Render a page or thumbnail view. This calls the appropriate function
   * based on the views state. If the view is already rendered it will return
   * `false`.
   *
   * @param {IRenderableView} view
   */
  renderView(view) {
    switch (view.renderingState) {
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
        view
          .draw()
          .finally(() => {
            this.renderHighestPriority();
          })
          .catch(reason => {
            if (reason instanceof RenderingCancelledException) {
              return;
            }
            console.error("renderView:", reason);
          });
        break;
    }
    return true;
  }
}

export { PDFRenderingQueue };
