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

/** @typedef {import("../src/display/api").PDFDocumentProxy} PDFDocumentProxy */
/** @typedef {import("../src/display/api").PDFPageProxy} PDFPageProxy */
/** @typedef {import("./event_utils").EventBus} EventBus */
/** @typedef {import("./interfaces").IPDFLinkService} IPDFLinkService */
// eslint-disable-next-line max-len
/** @typedef {import("./pdf_rendering_queue").PDFRenderingQueue} PDFRenderingQueue */

import {
  binarySearchFirstItem,
  getVisibleElements,
  isValidRotation,
  PagesMapper,
  RenderingStates,
  watchScroll,
} from "./ui_utils.js";
import { MathClamp, noContextMenu, stopEvent } from "pdfjs-lib";
import { PDFThumbnailView } from "./pdf_thumbnail_view.js";

const SCROLL_OPTIONS = {
  behavior: "instant",
  block: "nearest",
  inline: "nearest",
  container: "nearest",
};

// This value is based on the one used in Firefox.
// See
// https://searchfox.org/firefox-main/rev/04cf27582307a9c351e991c740828d54cf786b76/dom/events/EventStateManager.cpp#2675-2698
// This threshold is used to distinguish between a click and a drag.
const DRAG_THRESHOLD = 5;

/**
 * @typedef {Object} PDFThumbnailViewerOptions
 * @property {HTMLDivElement} container - The container for the thumbnail
 *   elements.
 * @property {EventBus} eventBus - The application event bus.
 * @property {IPDFLinkService} linkService - The navigation/linking service.
 * @property {PDFRenderingQueue} renderingQueue - The rendering queue object.
 * @property {number} [maxCanvasPixels] - The maximum supported canvas size in
 *   total pixels, i.e. width * height. Use `-1` for no limit, or `0` for
 *   CSS-only zooming. The default value is 4096 * 8192 (32 mega-pixels).
 * @property {number} [maxCanvasDim] - The maximum supported canvas dimension,
 *   in either width or height. Use `-1` for no limit.
 *   The default value is 32767.
 * @property {Object} [pageColors] - Overwrites background and foreground colors
 *   with user defined ones in order to improve readability in high contrast
 *   mode.
 * @property {AbortSignal} [abortSignal] - The AbortSignal for the window
 *   events.
 * @property {boolean} [enableHWA] - Enables hardware acceleration for
 *   rendering. The default value is `false`.
 * @property {boolean} [enableSplitMerge] - Enables split and merge features.
 *   The default value is `false`.
 */

/**
 * Viewer control to display thumbnails for pages in a PDF document.
 */
class PDFThumbnailViewer {
  static #draggingScaleFactor = 0;

  #enableSplitMerge = false;

  #dragAC = null;

  #draggedContainer = null;

  #thumbnailsPositions = null;

  #lastDraggedOverIndex = NaN;

  #selectedPages = null;

  #draggedImageX = 0;

  #draggedImageY = 0;

  #draggedImageWidth = 0;

  #draggedImageHeight = 0;

  #draggedImageOffsetX = 0;

  #draggedImageOffsetY = 0;

  #dragMarker = null;

  #pageNumberToRemove = NaN;

  #currentScrollBottom = 0;

  #currentScrollTop = 0;

  #pagesMapper = PagesMapper.instance;

  #originalThumbnails = null;

  /**
   * @param {PDFThumbnailViewerOptions} options
   */
  constructor({
    container,
    eventBus,
    linkService,
    renderingQueue,
    maxCanvasPixels,
    maxCanvasDim,
    pageColors,
    abortSignal,
    enableHWA,
    enableSplitMerge,
  }) {
    this.scrollableContainer = container.parentElement;
    this.container = container;
    this.eventBus = eventBus;
    this.linkService = linkService;
    this.renderingQueue = renderingQueue;
    this.maxCanvasPixels = maxCanvasPixels;
    this.maxCanvasDim = maxCanvasDim;
    this.pageColors = pageColors || null;
    this.enableHWA = enableHWA || false;
    this.#enableSplitMerge = enableSplitMerge || false;

    this.scroll = watchScroll(
      this.scrollableContainer,
      this.#scrollUpdated.bind(this),
      abortSignal
    );
    this.#resetView();
    this.#addEventListeners();
  }

  #scrollUpdated() {
    this.renderingQueue.renderHighestPriority();
  }

  getThumbnail(index) {
    return this._thumbnails[index];
  }

  #getVisibleThumbs() {
    return getVisibleElements({
      scrollEl: this.scrollableContainer,
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
      prevThumbnailView.toggleCurrent(/* isCurrent = */ false);
      thumbnailView.toggleCurrent(/* isCurrent = */ true);
      this._currentPageNumber = pageNumber;
    }
    const { first, last, views } = this.#getVisibleThumbs();

    // If the thumbnail isn't currently visible, scroll it into view.
    if (views.length > 0) {
      let shouldScroll = false;
      if (
        pageNumber <= this.#pagesMapper.getPageNumber(first.id) ||
        pageNumber >= this.#pagesMapper.getPageNumber(last.id)
      ) {
        shouldScroll = true;
      } else {
        for (const { id, percent } of views) {
          const mappedPageNumber = this.#pagesMapper.getPageNumber(id);
          if (mappedPageNumber !== pageNumber) {
            continue;
          }
          shouldScroll = percent < 100;
          break;
        }
      }
      if (shouldScroll) {
        thumbnailView.div.scrollIntoView(SCROLL_OPTIONS);
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

    const updateArgs = { rotation };
    for (const thumbnail of this._thumbnails) {
      thumbnail.update(updateArgs);
    }
  }

  cleanup() {
    for (const thumbnail of this._thumbnails) {
      if (thumbnail.renderingState !== RenderingStates.FINISHED) {
        thumbnail.reset();
      }
    }
  }

  #resetView() {
    this._thumbnails = [];
    this._currentPageNumber = 1;
    this._pageLabels = null;
    this._pagesRotation = 0;

    // Remove the thumbnails from the DOM.
    this.container.textContent = "";
  }

  /**
   * @param {PDFDocumentProxy} pdfDocument
   */
  setDocument(pdfDocument) {
    if (this.pdfDocument) {
      this.#cancelRendering();
      this.#resetView();
    }

    this.pdfDocument = pdfDocument;
    if (!pdfDocument) {
      return;
    }
    const firstPagePromise = pdfDocument.getPage(1);
    const optionalContentConfigPromise = pdfDocument.getOptionalContentConfig({
      intent: "display",
    });

    firstPagePromise
      .then(firstPdfPage => {
        const pagesCount = pdfDocument.numPages;
        const viewport = firstPdfPage.getViewport({ scale: 1 });
        const fragment = document.createDocumentFragment();

        for (let pageNum = 1; pageNum <= pagesCount; ++pageNum) {
          const thumbnail = new PDFThumbnailView({
            container: fragment,
            eventBus: this.eventBus,
            id: pageNum,
            defaultViewport: viewport.clone(),
            optionalContentConfigPromise,
            linkService: this.linkService,
            renderingQueue: this.renderingQueue,
            maxCanvasPixels: this.maxCanvasPixels,
            maxCanvasDim: this.maxCanvasDim,
            pageColors: this.pageColors,
            enableHWA: this.enableHWA,
            enableSplitMerge: this.#enableSplitMerge,
          });
          this._thumbnails.push(thumbnail);
        }
        // Set the first `pdfPage` immediately, since it's already loaded,
        // rather than having to repeat the `PDFDocumentProxy.getPage` call in
        // the `this.#ensurePdfPageLoaded` method before rendering can start.
        this._thumbnails[0]?.setPdfPage(firstPdfPage);

        // Ensure that the current thumbnail is always highlighted on load.
        const thumbnailView = this._thumbnails[this._currentPageNumber - 1];
        thumbnailView.toggleCurrent(/* isCurrent = */ true);
        this.container.append(fragment);
      })
      .catch(reason => {
        console.error("Unable to initialize thumbnail viewer", reason);
      });
  }

  #cancelRendering() {
    for (const thumbnail of this._thumbnails) {
      thumbnail.cancelRendering();
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
   * @returns {Promise<PDFPageProxy | null>}
   */
  async #ensurePdfPageLoaded(thumbView) {
    if (thumbView.pdfPage) {
      return thumbView.pdfPage;
    }
    try {
      const pdfPage = await this.pdfDocument.getPage(thumbView.id);
      if (!thumbView.pdfPage) {
        thumbView.setPdfPage(pdfPage);
      }
      return pdfPage;
    } catch (reason) {
      console.error("Unable to get page for thumb view", reason);
      return null; // Page error -- there is nothing that can be done.
    }
  }

  #getScrollAhead(visible) {
    if (visible.first?.id === 1) {
      return true;
    } else if (visible.last?.id === this._thumbnails.length) {
      return false;
    }
    return this.scroll.down;
  }

  forceRendering() {
    const visibleThumbs = this.#getVisibleThumbs();
    const scrollAhead = this.#getScrollAhead(visibleThumbs);
    const thumbView = this.renderingQueue.getHighestPriority(
      visibleThumbs,
      this._thumbnails,
      scrollAhead,
      /* preRenderExtra */ false,
      /* ignoreDetailViews */ true
    );
    if (thumbView) {
      this.#ensurePdfPageLoaded(thumbView).then(() => {
        this.renderingQueue.renderView(thumbView);
      });
      return true;
    }
    return false;
  }

  static #getScaleFactor(image) {
    return (PDFThumbnailViewer.#draggingScaleFactor ||= parseFloat(
      getComputedStyle(image).getPropertyValue("--thumbnail-dragging-scale")
    ));
  }

  #onStartDragging(draggedThumbnail) {
    this.#currentScrollTop = this.scrollableContainer.scrollTop;
    this.#currentScrollBottom =
      this.#currentScrollTop + this.scrollableContainer.clientHeight;
    this.#dragAC = new AbortController();
    this.container.classList.add("isDragging");
    const startPageNumber = parseInt(
      draggedThumbnail.getAttribute("page-number"),
      10
    );
    this.#lastDraggedOverIndex = startPageNumber - 1;
    if (!this.#selectedPages?.has(startPageNumber)) {
      this.#pageNumberToRemove = startPageNumber;
      this.#selectPage(startPageNumber, true);
    }

    for (const selected of this.#selectedPages) {
      const thumbnail = this._thumbnails[selected - 1];
      const placeholder = (thumbnail.placeholder =
        document.createElement("div"));
      placeholder.classList.add("thumbnailImage", "placeholder");
      const { div, image } = thumbnail;
      div.classList.add("isDragging");
      placeholder.style.height = getComputedStyle(image).height;
      image.after(placeholder);
      if (selected !== startPageNumber) {
        image.classList.add("hidden");
        continue;
      }
      if (this.#selectedPages.size === 1) {
        image.classList.add("draggingThumbnail");
        this.#draggedContainer = image;
        continue;
      }
      // For multiple selected thumbnails, only the one being dragged is shown
      // (with the dragging style), while the others are hidden.
      const draggedContainer = (this.#draggedContainer =
        document.createElement("div"));
      draggedContainer.classList.add(
        "draggingThumbnail",
        "thumbnailImage",
        "multiple"
      );
      draggedContainer.style.height = getComputedStyle(image).height;
      image.replaceWith(draggedContainer);
      image.classList.remove("thumbnailImage");
      draggedContainer.append(image);
      draggedContainer.setAttribute(
        "data-multiple-count",
        this.#selectedPages.size
      );
    }
  }

  #onStopDragging(isDropping = false) {
    const draggedContainer = this.#draggedContainer;
    this.#draggedContainer = null;
    const lastDraggedOverIndex = this.#lastDraggedOverIndex;
    this.#lastDraggedOverIndex = NaN;
    this.#dragMarker?.remove();
    this.#dragMarker = null;
    this.#dragAC.abort();
    this.#dragAC = null;

    this.#originalThumbnails ||= this._thumbnails;

    this.container.classList.remove("isDragging");
    for (const selected of this.#selectedPages) {
      const thumbnail = this._thumbnails[selected - 1];
      const { div, placeholder, image } = thumbnail;
      placeholder.remove();
      image.classList.remove("draggingThumbnail", "hidden");
      div.classList.remove("isDragging");
    }

    if (draggedContainer.classList.contains("multiple")) {
      // Restore the dragged image to its thumbnail.
      const originalImage = draggedContainer.firstElementChild;
      draggedContainer.replaceWith(originalImage);
      originalImage.classList.add("thumbnailImage");
    } else {
      draggedContainer.style.translate = "";
    }

    const selectedPages = this.#selectedPages;
    if (
      !isNaN(lastDraggedOverIndex) &&
      isDropping &&
      !(
        selectedPages.size === 1 &&
        (selectedPages.has(lastDraggedOverIndex + 1) ||
          selectedPages.has(lastDraggedOverIndex + 2))
      )
    ) {
      const newIndex = lastDraggedOverIndex + 1;
      const pagesToMove = Array.from(selectedPages).sort((a, b) => a - b);
      const movedCount = pagesToMove.length;
      const thumbnails = this._thumbnails;
      const pagesMapper = this.#pagesMapper;
      const N = thumbnails.length;
      pagesMapper.pagesNumber = N;
      const currentPageId = pagesMapper.getPageId(this._currentPageNumber);

      // Move the thumbnails in the DOM.
      let thumbnail = thumbnails[pagesToMove[0] - 1];
      thumbnail.checkbox.checked = false;
      if (newIndex === 0) {
        thumbnails[0].div.before(thumbnail.div);
      } else {
        thumbnails[newIndex - 1].div.after(thumbnail.div);
      }
      for (let i = 1; i < movedCount; i++) {
        const newThumbnail = thumbnails[pagesToMove[i] - 1];
        newThumbnail.checkbox.checked = false;
        thumbnail.div.after(newThumbnail.div);
        thumbnail = newThumbnail;
      }

      this.eventBus.dispatch("beforepagesedited", {
        source: this,
        pagesMapper,
        index: newIndex,
        pagesToMove,
      });

      pagesMapper.movePages(selectedPages, pagesToMove, newIndex);

      const newThumbnails = (this._thumbnails = new Array(N));
      const originalThumbnails = this.#originalThumbnails;
      for (let i = 0; i < N; i++) {
        const newThumbnail = (newThumbnails[i] =
          originalThumbnails[pagesMapper.getPageId(i + 1) - 1]);
        newThumbnail.div.setAttribute("page-number", i + 1);
      }

      this._currentPageNumber = pagesMapper.getPageNumber(currentPageId);
      this.#computeThumbnailsPosition();

      selectedPages.clear();
      this.#pageNumberToRemove = NaN;

      this.eventBus.dispatch("pagesedited", {
        source: this,
        pagesMapper,
        index: newIndex,
        pagesToMove,
      });
    }

    if (!isNaN(this.#pageNumberToRemove)) {
      this.#selectPage(this.#pageNumberToRemove, false);
      this.#pageNumberToRemove = NaN;
    }
  }

  #moveDraggedContainer(dx, dy) {
    this.#draggedImageOffsetX += dx;
    this.#draggedImageOffsetY += dy;
    this.#draggedImageX += dx;
    this.#draggedImageY += dy;
    this.#draggedContainer.style.translate = `${this.#draggedImageOffsetX}px ${this.#draggedImageOffsetY}px`;
    if (
      this.#draggedImageY + this.#draggedImageHeight >
      this.#currentScrollBottom
    ) {
      this.scrollableContainer.scrollTop = Math.min(
        this.scrollableContainer.scrollTop + 20,
        this.scrollableContainer.scrollHeight
      );
    } else if (this.#draggedImageY < this.#currentScrollTop) {
      this.scrollableContainer.scrollTop = Math.max(
        this.scrollableContainer.scrollTop - 20,
        0
      );
    }

    const positionData = this.#findClosestThumbnail(
      this.#draggedImageX + this.#draggedImageWidth / 2,
      this.#draggedImageY + this.#draggedImageHeight / 2
    );
    if (!positionData) {
      return;
    }
    let dragMarker = this.#dragMarker;
    if (!dragMarker) {
      dragMarker = this.#dragMarker = document.createElement("div");
      dragMarker.className = "dragMarker";
      this.container.firstChild.before(dragMarker);
    }

    const [index, space] = positionData;
    const dragMarkerStyle = dragMarker.style;
    const { bbox, x: xPos } = this.#thumbnailsPositions;
    let x, y, width, height;
    if (index < 0) {
      if (xPos.length === 1) {
        y = bbox[1] - 8;
        x = bbox[4];
        width = bbox[2];
      } else {
        y = bbox[1];
        x = bbox[0] - 4;
        height = bbox[3];
      }
    } else if (xPos.length === 1) {
      y = bbox[index * 4 + 1] + bbox[index * 4 + 3] + space;
      x = bbox[index * 4];
      width = bbox[index * 4 + 2];
    } else {
      y = bbox[index * 4 + 1];
      x = bbox[index * 4] + bbox[index * 4 + 2] + space;
      height = bbox[index * 4 + 3];
    }
    dragMarkerStyle.translate = `${x}px ${y}px`;
    dragMarkerStyle.width = width ? `${width}px` : "";
    dragMarkerStyle.height = height ? `${height}px` : "";
  }

  #computeThumbnailsPosition() {
    // Collect the center of each thumbnail.
    // This is used to determine the closest thumbnail when dragging.
    // TODO: handle the RTL case.
    const positionsX = [];
    const positionsY = [];
    const positionsLastX = [];
    const bbox = new Float32Array(this._thumbnails.length * 4);
    let prevX = -Infinity;
    let prevY = -Infinity;
    let reminder = -1;
    let firstRightX;
    let lastRightX;
    let firstBottomY;
    for (let i = 0, ii = this._thumbnails.length; i < ii; i++) {
      const { div } = this._thumbnails[i];
      const {
        offsetTop: y,
        offsetLeft: x,
        offsetWidth: w,
        offsetHeight: h,
      } = div;
      bbox[i * 4] = x;
      bbox[i * 4 + 1] = y;
      bbox[i * 4 + 2] = w;
      bbox[i * 4 + 3] = h;
      if (x > prevX) {
        prevX = x + w / 2;
        firstRightX ??= prevX + w;
        positionsX.push(prevX);
      }
      if (reminder > 0 && i >= ii - reminder) {
        const cx = x + w / 2;
        positionsLastX.push(cx);
        lastRightX ??= cx + w;
      }
      if (y > prevY) {
        if (reminder === -1 && positionsX.length > 1) {
          reminder = ii % positionsX.length;
        }
        prevY = y + h / 2;
        firstBottomY ??= prevY + h;
        positionsY.push(prevY);
      }
    }
    const space =
      positionsX.length > 1
        ? (positionsX[1] - firstRightX) / 2
        : (positionsY[1] - firstBottomY) / 2;
    this.#thumbnailsPositions = {
      x: positionsX,
      y: positionsY,
      lastX: positionsLastX,
      space,
      lastSpace: (positionsLastX.at(-1) - lastRightX) / 2,
      bbox,
    };
  }

  #addEventListeners() {
    this.eventBus.on("resize", ({ source }) => {
      if (source.thumbnailsView === this.container) {
        this.#computeThumbnailsPosition();
      }
    });
    this.container.addEventListener("keydown", e => {
      switch (e.key) {
        case "ArrowLeft":
          this.#goToNextItem(e.target, false, true);
          stopEvent(e);
          break;
        case "ArrowRight":
          this.#goToNextItem(e.target, true, true);
          stopEvent(e);
          break;
        case "ArrowDown":
          this.#goToNextItem(e.target, true, false);
          stopEvent(e);
          break;
        case "ArrowUp":
          this.#goToNextItem(e.target, false, false);
          stopEvent(e);
          break;
        case "Home":
          this._thumbnails[0].image.focus();
          stopEvent(e);
          break;
        case "End":
          this._thumbnails.at(-1).image.focus();
          stopEvent(e);
          break;
        case "Enter":
        case " ":
          this.#goToPage(e);
          break;
      }
    });
    this.container.addEventListener("click", e => {
      const { target } = e;
      if (target instanceof HTMLInputElement) {
        const pageNumber = parseInt(
          target.parentElement.getAttribute("page-number"),
          10
        );
        this.#selectPage(pageNumber, target.checked);
        return;
      }
      this.#goToPage(e);
    });
    this.#addDragListeners();
  }

  #selectPage(pageNumber, checked) {
    const set = (this.#selectedPages ??= new Set());
    if (checked) {
      set.add(pageNumber);
    } else {
      set.delete(pageNumber);
    }
  }

  #addDragListeners() {
    if (!this.#enableSplitMerge) {
      return;
    }
    this.container.addEventListener("pointerdown", e => {
      const {
        target: draggedImage,
        clientX: clickX,
        clientY: clickY,
        pointerId: dragPointerId,
      } = e;
      if (
        !isNaN(this.#lastDraggedOverIndex) ||
        !draggedImage.classList.contains("thumbnailImage")
      ) {
        // We're already handling a drag, or the target is not draggable.
        return;
      }

      const thumbnail = draggedImage.parentElement;
      const pointerDownAC = new AbortController();
      const { signal: pointerDownSignal } = pointerDownAC;
      let prevDragX = clickX;
      let prevDragY = clickY;
      let prevScrollTop = this.scrollableContainer.scrollTop;

      // When dragging, the thumbnail is scaled down. To keep the cursor at the
      // same position on the thumbnail, we need to adjust the offset
      // accordingly.
      const scaleFactor = PDFThumbnailViewer.#getScaleFactor(draggedImage);
      this.#draggedImageOffsetX =
        ((scaleFactor - 1) * e.layerX + draggedImage.offsetLeft) / scaleFactor;
      this.#draggedImageOffsetY =
        ((scaleFactor - 1) * e.layerY + draggedImage.offsetTop) / scaleFactor;

      this.#draggedImageX = thumbnail.offsetLeft + this.#draggedImageOffsetX;
      this.#draggedImageY = thumbnail.offsetTop + this.#draggedImageOffsetY;
      this.#draggedImageWidth = draggedImage.offsetWidth / scaleFactor;
      this.#draggedImageHeight = draggedImage.offsetHeight / scaleFactor;

      this.container.addEventListener(
        "pointermove",
        ev => {
          const { clientX: x, clientY: y, pointerId } = ev;
          if (
            pointerId !== dragPointerId ||
            (Math.abs(x - clickX) <= DRAG_THRESHOLD &&
              Math.abs(y - clickY) <= DRAG_THRESHOLD)
          ) {
            // Not enough movement to be considered a drag.
            return;
          }

          if (isNaN(this.#lastDraggedOverIndex)) {
            // First movement while dragging.
            this.#onStartDragging(thumbnail);
            const stopDragging = (_e, isDropping = false) => {
              this.#onStopDragging(isDropping);
              pointerDownAC.abort();
            };
            const { signal } = this.#dragAC;
            window.addEventListener(
              "touchmove",
              stopEvent /* Prevent the container from scrolling */,
              { passive: false, signal }
            );
            window.addEventListener("contextmenu", noContextMenu, { signal });
            this.scrollableContainer.addEventListener(
              "scrollend",
              () => {
                const {
                  scrollableContainer: { clientHeight, scrollTop },
                } = this;
                this.#currentScrollTop = scrollTop;
                this.#currentScrollBottom = scrollTop + clientHeight;
                const dy = scrollTop - prevScrollTop;
                prevScrollTop = scrollTop;
                this.#moveDraggedContainer(0, dy);
              },
              { passive: true, signal }
            );
            window.addEventListener(
              "pointerup",
              upEv => {
                if (upEv.pointerId !== dragPointerId) {
                  return;
                }
                // Prevent the subsequent click event after pointerup.
                window.addEventListener("click", stopEvent, {
                  capture: true,
                  once: true,
                  signal,
                });
                stopEvent(upEv);
                stopDragging(upEv, /* isDropping = */ true);
              },
              { signal }
            );
            window.addEventListener("blur", stopDragging, { signal });
            window.addEventListener("pointercancel", stopDragging, { signal });
            window.addEventListener("wheel", stopEvent, {
              passive: false,
              signal,
            });
          }

          const dx = x - prevDragX;
          const dy = y - prevDragY;
          prevDragX = x;
          prevDragY = y;
          this.#moveDraggedContainer(dx, dy);
        },
        { passive: true, signal: pointerDownSignal }
      );
      window.addEventListener(
        "pointerup",
        ({ pointerId }) => {
          if (pointerId !== dragPointerId) {
            return;
          }
          pointerDownAC.abort();
        },
        { signal: pointerDownSignal }
      );
      window.addEventListener("dragstart", stopEvent, {
        capture: true,
        signal: pointerDownSignal,
      });
    });
  }

  #goToPage(e) {
    const { target } = e;
    if (target.classList.contains("thumbnailImage")) {
      const pageNumber = parseInt(
        target.parentElement.getAttribute("page-number"),
        10
      );
      this.linkService.goToPage(pageNumber);
      stopEvent(e);
    }
  }

  /**
   * Go to the next/previous menu item.
   * @param {HTMLElement} element
   * @param {boolean} forward
   * @param {boolean} horizontal
   */
  #goToNextItem(element, forward, horizontal) {
    let currentPageNumber = parseInt(
      element.parentElement.getAttribute("page-number"),
      10
    );
    if (isNaN(currentPageNumber)) {
      currentPageNumber = this._currentPageNumber;
    }

    const increment = forward ? 1 : -1;
    let nextThumbnail;
    if (horizontal) {
      const nextPageNumber = MathClamp(
        currentPageNumber + increment,
        1,
        this._thumbnails.length + 1
      );
      nextThumbnail = this._thumbnails[nextPageNumber - 1];
    } else {
      const currentThumbnail = this._thumbnails[currentPageNumber - 1];
      const { x: currentX, y: currentY } =
        currentThumbnail.div.getBoundingClientRect();
      let firstWithDifferentY;
      for (
        let i = currentPageNumber - 1 + increment;
        i >= 0 && i < this._thumbnails.length;
        i += increment
      ) {
        const thumbnail = this._thumbnails[i];
        const { x, y } = thumbnail.div.getBoundingClientRect();
        if (!firstWithDifferentY && y !== currentY) {
          firstWithDifferentY = thumbnail;
        }
        if (x === currentX) {
          nextThumbnail = thumbnail;
          break;
        }
      }
      if (!nextThumbnail) {
        nextThumbnail = firstWithDifferentY;
      }
    }
    if (nextThumbnail) {
      nextThumbnail.image.focus();
    }
  }

  #findClosestThumbnail(x, y) {
    const {
      x: positionsX,
      y: positionsY,
      lastX: positionsLastX,
      space: spaceBetweenThumbnails,
      lastSpace: lastSpaceBetweenThumbnails,
    } = this.#thumbnailsPositions;
    const lastDraggedOverIndex = this.#lastDraggedOverIndex;
    let xPos = lastDraggedOverIndex % positionsX.length;
    let yPos = Math.floor(lastDraggedOverIndex / positionsX.length);
    let xArray = yPos === positionsY.length - 1 ? positionsLastX : positionsX;
    if (
      positionsY[yPos] <= y &&
      y < (positionsY[yPos + 1] ?? Infinity) &&
      xArray[xPos] <= x &&
      x < (xArray[xPos + 1] ?? Infinity)
    ) {
      // Fast-path: we're still in the same thumbnail.
      return null;
    }

    yPos = binarySearchFirstItem(positionsY, cy => y < cy) - 1;
    xArray =
      yPos === positionsY.length - 1 && positionsLastX.length > 0
        ? positionsLastX
        : positionsX;
    xPos = Math.max(0, binarySearchFirstItem(xArray, cx => x < cx) - 1);
    const index = MathClamp(
      yPos * positionsX.length + xPos,
      -1,
      this._thumbnails.length - 1
    );
    if (index === lastDraggedOverIndex) {
      // No change.
      return null;
    }
    this.#lastDraggedOverIndex = index;
    const space =
      yPos === positionsY.length - 1 && positionsLastX.length > 0 && xPos >= 0
        ? lastSpaceBetweenThumbnails
        : spaceBetweenThumbnails;

    return [index, space];
  }
}

export { PDFThumbnailViewer };
