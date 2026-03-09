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
// eslint-disable-next-line max-len
/** @typedef {import("./pdf_rendering_queue").PDFRenderingQueue} PDFRenderingQueue */
/** @typedef {import("./pdf_link_service.js").PDFLinkService} PDFLinkService */

import {
  binarySearchFirstItem,
  getVisibleElements,
  isValidRotation,
  watchScroll,
} from "./ui_utils.js";
import { MathClamp, noContextMenu, stopEvent } from "pdfjs-lib";
import { Menu } from "./menu.js";
import { PDFThumbnailView } from "./pdf_thumbnail_view.js";
import { RenderingStates } from "./renderable_view.js";

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
const DRAG_THRESHOLD_IN_PIXELS = 5;
const PIXELS_TO_SCROLL_WHEN_DRAGGING = 20;
const SPACE_FOR_DRAG_MARKER_WHEN_NO_NEXT_ELEMENT = 15;

/**
 * @typedef {Object} PDFThumbnailViewerOptions
 * @property {HTMLDivElement} container - The container for the thumbnail
 *   elements.
 * @property {EventBus} eventBus - The application event bus.
 * @property {PDFLinkService} linkService - The navigation/linking service.
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
 * @property {Object} [statusBar] - The status bar elements to manage the status
 *   label and action when editing pages.
 * @property {Object} [undoBar] - The undo bar elements to manage the undo
 *   action.
 * @property {Object} [manageMenu] - The menu elements to manage saving edited
 *   PDF.
 * @property {HTMLButtonElement} addFileButton - The button that opens a dialog
 *   to add a PDF file to merge with the current one.

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

  #pagesMapper = null;

  #manageSaveAsButton = null;

  #manageDeleteButton = null;

  #manageCopyButton = null;

  #manageCutButton = null;

  #copiedThumbnails = null;

  #savedThumbnails = null;

  #deletedPageNumbers = null;

  #copiedPageNumbers = null;

  #boundPastePages = this.#pastePages.bind(this);

  #isCut = false;

  #isOneColumnView = false;

  #scrollableContainerWidth = 0;

  #scrollableContainerHeight = 0;

  #previousStates = {
    hasSelectedPages: false,
  };

  #statusLabel = null;

  #statusBar = null;

  #undoBar = null;

  #undoLabel = null;

  #undoButton = null;

  #undoCloseButton = null;

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
    statusBar,
    undoBar,
    manageMenu,
    addFileButton,
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
    this.#statusLabel = statusBar?.viewsManagerStatusActionLabel || null;
    this.#statusBar = statusBar?.viewsManagerStatusAction || null;
    this.#undoBar = undoBar?.viewsManagerStatusUndo || null;
    this.#undoLabel = undoBar?.viewsManagerStatusUndoLabel || null;
    this.#undoButton = undoBar?.viewsManagerStatusUndoButton || null;
    this.#undoCloseButton = undoBar?.viewsManagerStatusUndoCloseButton || null;

    // TODO: uncomment when the "add file" feature is implemented.
    // this.#addFileButton = addFileButton;

    if (this.#enableSplitMerge && manageMenu) {
      const { button, menu, copy, cut, delete: del, saveAs } = manageMenu;
      this.eventBus.on(
        "pagesloaded",
        () => {
          button.disabled = false;
        },
        { once: true }
      );

      this._manageMenu = new Menu(menu, button, [copy, cut, del, saveAs]);
      this.#manageSaveAsButton = saveAs;
      saveAs.addEventListener("click", this.#saveExtractedPages.bind(this));
      this.#manageDeleteButton = del;
      del.addEventListener("click", this.#deletePages.bind(this, "delete"));
      this.#manageCopyButton = copy;
      copy.addEventListener("click", this.#copyPages.bind(this));
      this.#manageCutButton = cut;
      cut.addEventListener("click", this.#cutPages.bind(this));

      this.#toggleMenuEntries(false);
      button.disabled = true;

      this.eventBus.on("editingaction", ({ name }) => {
        switch (name) {
          case "copyPage":
            this.#copyPages();
            break;
          case "cutPage":
            this.#cutPages();
            break;
          case "deletePage":
            this.#deletePages("delete");
            break;
          case "savePage":
            this.#saveExtractedPages();
            break;
        }
      });

      this.#undoButton?.addEventListener("click", this.#undo.bind(this));
      this.#undoCloseButton?.addEventListener(
        "click",
        this.#dismissUndo.bind(this)
      );
    } else {
      manageMenu.button.hidden = true;
    }

    this.scroll = watchScroll(
      this.scrollableContainer,
      this.#scrollUpdated.bind(this),
      abortSignal
    );
    this.#resetView();
    this.#addEventListeners();
  }

  /**
   * Update the different possible states of this manager, e.g. is there
   * something to copy, paste, ...
   * @param {Object} details
   */
  #dispatchUpdateStates(details) {
    const hasChanged = Object.entries(details).some(
      ([key, value]) => this.#previousStates[key] !== value
    );

    if (hasChanged) {
      this.eventBus.dispatch("editingstateschanged", {
        source: this,
        details: Object.assign(this.#previousStates, details),
      });
    }
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

  #resetCurrentThumbnail(newPageNumber) {
    if (!this.pdfDocument) {
      return;
    }
    const thumbnailView = this._thumbnails[this._currentPageNumber - 1];
    thumbnailView?.toggleCurrent(/* isCurrent = */ false);
    this._currentPageNumber = newPageNumber;
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
      this.#resetCurrentThumbnail(pageNumber);
      thumbnailView.toggleCurrent(/* isCurrent = */ true);
    }
    const { first, last, views } = this.#getVisibleThumbs();

    // If the thumbnail isn't currently visible, scroll it into view.
    if (views.length > 0) {
      let shouldScroll = false;
      if (pageNumber <= first.id || pageNumber >= last.id) {
        shouldScroll = true;
      } else {
        for (const { id, percent } of views) {
          if (id !== pageNumber) {
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
    this.#pagesMapper = pdfDocument.pagesMapper;
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

  hasStructuralChanges() {
    return this.#pagesMapper?.hasBeenAltered() || false;
  }

  getStructuralChanges() {
    return this.#pagesMapper?.getPageMappingForSaving() || null;
  }

  static #getScaleFactor(image) {
    return (PDFThumbnailViewer.#draggingScaleFactor ||= parseFloat(
      getComputedStyle(image).getPropertyValue("--thumbnail-dragging-scale")
    ));
  }

  #updateThumbnails(currentPageNumber) {
    let newCurrentPageNumber = 0;
    const pagesMapper = this.#pagesMapper;
    const prevThumbnails = (this.#savedThumbnails = this._thumbnails);
    const newThumbnails = (this._thumbnails = []);
    const fragment = document.createDocumentFragment();
    const isCut = this.#isCut;
    for (let i = 1, ii = pagesMapper.pagesNumber; i <= ii; i++) {
      const prevPageNumber = pagesMapper.getPrevPageNumber(i);
      if (prevPageNumber < 0) {
        let thumbnail = this.#copiedThumbnails.get(-prevPageNumber);
        thumbnail.checkbox.checked = false;
        if (isCut) {
          thumbnail.updateId(i);
          fragment.append(thumbnail.div);
        } else {
          thumbnail = thumbnail.clone(fragment, i);
        }
        newThumbnails.push(thumbnail);
        continue;
      }
      if (prevPageNumber === currentPageNumber) {
        newCurrentPageNumber = i;
      }
      const newThumbnail = prevThumbnails[prevPageNumber - 1];
      newThumbnails.push(newThumbnail);
      newThumbnail.updateId(i);
      newThumbnail.checkbox.checked = false;
      fragment.append(newThumbnail.div);
    }
    this.container.replaceChildren(fragment);
    return newCurrentPageNumber;
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
      placeholder.classList.add("thumbnailImageContainer", "placeholder");
      const { div, imageContainer } = thumbnail;
      div.classList.add("isDragging");
      placeholder.style.height = getComputedStyle(imageContainer).height;
      imageContainer.after(placeholder);
      if (selected !== startPageNumber) {
        imageContainer.classList.add("hidden");
        continue;
      }
      if (this.#selectedPages.size === 1) {
        imageContainer.classList.add("draggingThumbnail");
        this.#draggedContainer = imageContainer;
        continue;
      }
      // For multiple selected thumbnails, only the one being dragged is shown
      // (with the dragging style), while the others are hidden.
      const draggedContainer = (this.#draggedContainer =
        document.createElement("div"));
      draggedContainer.classList.add(
        "draggingThumbnail",
        "thumbnailImageContainer",
        "multiple"
      );
      draggedContainer.style.height = getComputedStyle(imageContainer).height;
      imageContainer.replaceWith(draggedContainer);
      imageContainer.classList.remove("thumbnailImageContainer");
      draggedContainer.append(imageContainer);
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

    this.container.classList.remove("isDragging");
    for (const selected of this.#selectedPages) {
      const thumbnail = this._thumbnails[selected - 1];
      const { div, placeholder, imageContainer } = thumbnail;
      placeholder.remove();
      imageContainer.classList.remove("draggingThumbnail", "hidden");
      div.classList.remove("isDragging");
    }

    if (draggedContainer.classList.contains("multiple")) {
      // Restore the dragged image to its thumbnail.
      const originalImageContainer = draggedContainer.firstElementChild;
      draggedContainer.replaceWith(originalImageContainer);
      originalImageContainer.classList.add("thumbnailImageContainer");
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
      this._thumbnails[this._currentPageNumber - 1]?.toggleCurrent(
        /* isCurrent = */ false
      );
      this._currentPageNumber = -1;

      const newIndex = lastDraggedOverIndex + 1;
      const pagesToMove = Array.from(selectedPages).sort((a, b) => a - b);
      const pagesMapper = this.#pagesMapper;
      let currentPageNumber = isNaN(this.#pageNumberToRemove)
        ? pagesToMove[0]
        : this.#pageNumberToRemove;

      pagesMapper.movePages(selectedPages, pagesToMove, newIndex);

      currentPageNumber = this.#updateThumbnails(currentPageNumber);
      this.#computeThumbnailsPosition();

      selectedPages.clear();
      this.#pageNumberToRemove = NaN;
      this.#updateMenuEntries();

      this.eventBus.dispatch("pagesedited", {
        source: this,
        pagesMapper,
        type: "move",
      });

      this.#updateCurrentPage(currentPageNumber);
    }

    if (!isNaN(this.#pageNumberToRemove)) {
      this.#selectPage(this.#pageNumberToRemove, false);
      this.#pageNumberToRemove = NaN;
    }
  }

  #clearSelection() {
    for (const pageNumber of this.#selectedPages) {
      this._thumbnails[pageNumber - 1].toggleSelected(false);
    }
    this.#selectedPages.clear();
  }

  #updateCurrentPage(currentPageNumber) {
    setTimeout(() => {
      this.#resetCurrentThumbnail(0);
      this.forceRendering();
      const newPageNumber = currentPageNumber || 1;
      this.linkService.goToPage(newPageNumber);
      const thumbnailView = this._thumbnails[newPageNumber - 1];
      thumbnailView.imageContainer.focus();
    }, 0);
  }

  #undo() {
    if (this.#copiedThumbnails) {
      // We undo a copy or a cut.
      this.#copiedThumbnails = null;
      this.#pagesMapper.cancelCopy();
      this.#clearSelection();
      this.#toggleMenuEntries(false);
      this.#updateStatus("select");
      this.#togglePasteMode(false);

      this.eventBus.dispatch("pagesedited", {
        source: this,
        pagesMapper: this.#pagesMapper,
        type: "cancelCopy",
      });
    }

    this.#isCut = false;
    if (this.#savedThumbnails) {
      const fragment = document.createDocumentFragment();
      for (let i = 1, ii = this.#savedThumbnails.length; i <= ii; i++) {
        const thumbnail = this.#savedThumbnails[i - 1];
        thumbnail.updateId(i);
        thumbnail.checkbox.checked = false;
        fragment.append(thumbnail.div);
      }
      this.container.replaceChildren(fragment);
      this._thumbnails = this.#savedThumbnails;
      this.#savedThumbnails = null;
      this.#pagesMapper.cancelDelete();

      this.eventBus.dispatch("pagesedited", {
        source: this,
        pagesMapper: this.#pagesMapper,
        type: "cancelDelete",
      });
    }
  }

  #dismissUndo() {
    this.#copiedThumbnails = null;
    if (this.#deletedPageNumbers) {
      for (const pageNumber of this.#deletedPageNumbers) {
        this.#savedThumbnails[pageNumber - 1].destroy();
      }
      this.#deletedPageNumbers = null;
      this.#savedThumbnails = null;
    }
    this.#isCut = false;
    this.#updateStatus("select");
    this.#togglePasteMode(false);
    this.#pagesMapper.cleanSavedData();

    this.eventBus.dispatch("pagesedited", {
      source: this,
      pagesMapper: this.#pagesMapper,
      type: "cleanSavedData",
    });
  }

  #togglePasteMode(enable) {
    if (enable) {
      this.container.classList.add("pasteMode");
      for (const thumbnail of this._thumbnails) {
        thumbnail.addPasteButton(this.#boundPastePages);
      }
    } else {
      this.container.classList.remove("pasteMode");
      for (const thumbnail of this._thumbnails) {
        thumbnail.removePasteButton();
      }
    }
  }

  #saveExtractedPages() {
    this.eventBus.dispatch("saveextractedpages", {
      source: this,
      data: this.#pagesMapper.extractPages(this.#selectedPages),
    });
    this.#clearSelection();
    this.#toggleMenuEntries(false);
  }

  #copyPages(clearSelection = true) {
    this.#updateStatus(this.#isCut ? "cut" : "copy");
    const pageNumbersToCopy = (this.#copiedPageNumbers = Uint32Array.from(
      this.#selectedPages
    ).sort((a, b) => a - b));
    const pagesMapper = this.#pagesMapper;
    pagesMapper.copyPages(pageNumbersToCopy);
    this.#copiedThumbnails = new Map();
    for (const pageNumber of pageNumbersToCopy) {
      this.#copiedThumbnails.set(pageNumber, this._thumbnails[pageNumber - 1]);
    }
    this.eventBus.dispatch("pagesedited", {
      source: this,
      pagesMapper,
      pageNumbers: pageNumbersToCopy,
      type: "copy",
    });
    if (clearSelection) {
      this.#clearSelection();
    }
    this.#togglePasteMode(true);
    this.#toggleMenuEntries(false);
  }

  #cutPages() {
    this.#isCut = true;
    this.#copyPages(false);
    this.#deletePages(/* type = */ "cut");
  }

  #pastePages(index) {
    this.#togglePasteMode(false);
    this.#toggleMenuEntries(true);

    const pagesMapper = this.#pagesMapper;
    let currentPageNumber = this.#copiedPageNumbers.includes(
      this._currentPageNumber
    )
      ? 0
      : this._currentPageNumber;

    pagesMapper.pastePages(index);
    currentPageNumber = this.#updateThumbnails(currentPageNumber);

    this.eventBus.dispatch("pagesedited", {
      source: this,
      pagesMapper,
      hasBeenCut: this.#isCut,
      type: "paste",
    });

    this.#copiedThumbnails = null;
    this.#isCut = false;
    this.#updateMenuEntries();
    this.#updateStatus("select");

    this.#updateCurrentPage(currentPageNumber);
  }

  #deletePages(type = "delete") {
    const selectedPages = this.#selectedPages;
    if (selectedPages.size === 0) {
      return;
    }
    if (type === "delete") {
      this.#updateStatus("delete");
    }
    const pagesMapper = this.#pagesMapper;
    let currentPageNumber = selectedPages.has(this._currentPageNumber)
      ? 0
      : this._currentPageNumber;
    const pagesToDelete = (this.#deletedPageNumbers = Uint32Array.from(
      selectedPages
    ).sort((a, b) => a - b));

    pagesMapper.deletePages(pagesToDelete);
    currentPageNumber = this.#updateThumbnails(currentPageNumber);
    selectedPages.clear();
    this.#updateMenuEntries();

    this.eventBus.dispatch("pagesedited", {
      source: this,
      pagesMapper,
      pageNumbers: pagesToDelete,
      type,
    });

    this.#updateCurrentPage(currentPageNumber);
  }

  #updateMenuEntries() {
    this.#manageSaveAsButton.disabled =
      this.#manageDeleteButton.disabled =
      this.#manageCopyButton.disabled =
      this.#manageCutButton.disabled =
        !this.#selectedPages?.size;
    this.#dispatchUpdateStates({
      hasSelectedPages: !!this.#selectedPages?.size,
    });
  }

  #toggleMenuEntries(enable) {
    this.#manageSaveAsButton.disabled =
      this.#manageDeleteButton.disabled =
      this.#manageCopyButton.disabled =
      this.#manageCutButton.disabled =
        !enable;
  }

  #updateStatus(type) {
    if (!this.#statusBar || !this.#undoBar) {
      return;
    }
    const count = this.#selectedPages?.size || 0;
    if (type === "select") {
      this.#statusLabel.setAttribute(
        "data-l10n-id",
        count
          ? "pdfjs-views-manager-pages-status-action-label"
          : "pdfjs-views-manager-pages-status-none-action-label"
      );
      if (count) {
        this.#statusLabel.setAttribute(
          "data-l10n-args",
          JSON.stringify({ count })
        );
      } else {
        this.#statusLabel.removeAttribute("data-l10n-args");
      }
      this.#statusBar.classList.toggle("hidden", false);
      this.#undoBar.classList.toggle("hidden", true);
      return;
    }

    let l10nId;
    switch (type) {
      case "copy":
        l10nId = "pdfjs-views-manager-pages-status-undo-copy-label";
        break;
      case "cut":
        l10nId = "pdfjs-views-manager-status-undo-cut-label";
        break;
      case "delete":
        l10nId = "pdfjs-views-manager-pages-status-undo-delete-label";
        break;
    }
    this.#undoLabel.setAttribute("data-l10n-id", l10nId);
    this.#undoLabel.setAttribute("data-l10n-args", JSON.stringify({ count }));

    if (type === "copy") {
      this.#undoButton.firstElementChild.setAttribute(
        "data-l10n-id",
        "pdfjs-views-manager-status-done-button-label"
      );
      this.#undoCloseButton.classList.toggle("hidden", true);
    } else {
      this.#undoButton.firstElementChild.setAttribute(
        "data-l10n-id",
        "pdfjs-views-manager-status-undo-button-label"
      );
      this.#undoCloseButton.classList.toggle("hidden", false);
    }

    this.#statusBar.classList.toggle("hidden", true);
    this.#undoBar.classList.toggle("hidden", false);
  }

  #moveDraggedContainer(dx, dy) {
    if (this.#isOneColumnView) {
      dx = 0;
    }
    if (
      this.#draggedImageX + dx < 0 ||
      this.#draggedImageX + this.#draggedImageWidth + dx >
        this.#scrollableContainerWidth
    ) {
      dx = 0;
    }
    if (
      this.#draggedImageY + dy < 0 ||
      this.#draggedImageY + this.#draggedImageHeight + dy >
        this.#scrollableContainerHeight
    ) {
      dy = 0;
    }

    this.#draggedImageX += dx;
    this.#draggedImageY += dy;
    this.#draggedImageOffsetX += dx;
    this.#draggedImageOffsetY += dy;
    this.#draggedContainer.style.translate = `${this.#draggedImageOffsetX}px ${this.#draggedImageOffsetY}px`;
    if (
      this.#draggedImageY + this.#draggedImageHeight >
      this.#currentScrollBottom
    ) {
      this.scrollableContainer.scrollTop = Math.min(
        this.scrollableContainer.scrollTop + PIXELS_TO_SCROLL_WHEN_DRAGGING,
        this.#scrollableContainerHeight
      );
    } else if (this.#draggedImageY < this.#currentScrollTop) {
      this.scrollableContainer.scrollTop = Math.max(
        this.scrollableContainer.scrollTop - PIXELS_TO_SCROLL_WHEN_DRAGGING,
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
        y = bbox[1] - SPACE_FOR_DRAG_MARKER_WHEN_NO_NEXT_ELEMENT;
        x = bbox[4];
        width = bbox[2];
      } else {
        y = bbox[1];
        x = bbox[0] - SPACE_FOR_DRAG_MARKER_WHEN_NO_NEXT_ELEMENT;
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
      if (w === 0) {
        // The thumbnail view isn't visible.
        return;
      }
      bbox[i * 4] = x;
      bbox[i * 4 + 1] = y;
      bbox[i * 4 + 2] = w;
      bbox[i * 4 + 3] = h;
      if (x > prevX) {
        prevX = x + w / 2;
        firstRightX ??= prevX + w;
        positionsX.push(prevX);
      }
      if (y > prevY) {
        if (reminder === -1 && positionsX.length > 1) {
          reminder = ii % positionsX.length;
        }
        prevY = y + h / 2;
        firstBottomY ??= prevY + h;
        positionsY.push(prevY);
      }
      if (reminder > 0 && i >= ii - reminder) {
        const cx = x + w / 2;
        positionsLastX.push(cx);
        lastRightX ??= cx + w;
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
    this.#isOneColumnView = positionsX.length === 1;
    ({
      clientWidth: this.#scrollableContainerWidth,
      scrollHeight: this.#scrollableContainerHeight,
    } = this.scrollableContainer);
  }

  #addEventListeners() {
    this.eventBus.on("resize", ({ source }) => {
      if (source.thumbnailsView === this.container) {
        this.#computeThumbnailsPosition();
      }
    });
    this.container.addEventListener("focusout", () => {
      this.#dispatchUpdateStates({
        hasSelectedPages: false,
      });
    });
    this.container.addEventListener("focusin", () => {
      this.#dispatchUpdateStates({
        hasSelectedPages: !!this.#selectedPages?.size,
      });
    });
    this.container.addEventListener("keydown", e => {
      const { target } = e;
      const isCheckbox =
        target instanceof HTMLInputElement && target.type === "checkbox";

      switch (e.key) {
        case "ArrowLeft":
          this.#goToNextItem(target, false, true, isCheckbox);
          stopEvent(e);
          break;
        case "ArrowRight":
          this.#goToNextItem(target, true, true, isCheckbox);
          stopEvent(e);
          break;
        case "ArrowDown":
          this.#goToNextItem(target, true, false, isCheckbox);
          stopEvent(e);
          break;
        case "ArrowUp":
          this.#goToNextItem(target, false, false, isCheckbox);
          stopEvent(e);
          break;
        case "Home":
          this.#focusThumbnailElement(this._thumbnails[0], isCheckbox);
          stopEvent(e);
          break;
        case "End":
          this.#focusThumbnailElement(this._thumbnails.at(-1), isCheckbox);
          stopEvent(e);
          break;
        case "Enter":
        case " ":
          if (!isCheckbox) {
            this.#goToPage(e);
          }
          // For checkboxes, let the default behavior handle toggling
          break;
        case "c":
          if (
            this.#enableSplitMerge &&
            (e.ctrlKey || e.metaKey) &&
            this.#selectedPages?.size
          ) {
            this.#copyPages();
            stopEvent(e);
          }
          break;
        case "x":
          if (
            this.#enableSplitMerge &&
            (e.ctrlKey || e.metaKey) &&
            this.#selectedPages?.size
          ) {
            this.#cutPages();
            stopEvent(e);
          }
          break;
        case "Delete":
        case "Backspace":
          if (this.#enableSplitMerge && this.#selectedPages?.size) {
            this.#deletePages();
            stopEvent(e);
          }
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
    this.#updateMenuEntries();
    this.#updateStatus("select");
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
        e.button !== 0 || // Skip right click.
        this.#pagesMapper.copiedPageNumbers?.length > 0 ||
        !isNaN(this.#lastDraggedOverIndex) ||
        !draggedImage.classList.contains("thumbnailImageContainer")
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
      this.#draggedImageOffsetY =
        ((scaleFactor - 1) * e.layerY + draggedImage.offsetTop) / scaleFactor;

      if (this.#isOneColumnView) {
        this.#draggedImageOffsetX =
          draggedImage.offsetLeft +
          ((scaleFactor - 1) * 0.5 * draggedImage.offsetWidth) / scaleFactor;
      } else {
        this.#draggedImageOffsetX =
          ((scaleFactor - 1) * e.layerX + draggedImage.offsetLeft) /
          scaleFactor;
      }
      this.#draggedImageX = thumbnail.offsetLeft + this.#draggedImageOffsetX;
      this.#draggedImageY = thumbnail.offsetTop + this.#draggedImageOffsetY;
      this.#draggedImageWidth = draggedImage.offsetWidth / scaleFactor;
      this.#draggedImageHeight = draggedImage.offsetHeight / scaleFactor;

      this.container.addEventListener(
        "pointermove",
        ev => {
          const { clientX: x, clientY: y, pointerId } = ev;
          if (isNaN(this.#lastDraggedOverIndex)) {
            if (
              pointerId !== dragPointerId ||
              (Math.abs(x - clickX) <= DRAG_THRESHOLD_IN_PIXELS &&
                Math.abs(y - clickY) <= DRAG_THRESHOLD_IN_PIXELS)
            ) {
              // Not enough movement to be considered a drag.
              return;
            }

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
            window.addEventListener(
              "keydown",
              kEv => {
                if (
                  kEv.key === "Escape" &&
                  !isNaN(this.#lastDraggedOverIndex)
                ) {
                  stopDragging(kEv);
                }
              },
              { signal }
            );
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
    if (target.classList.contains("thumbnailImageContainer")) {
      const pageNumber = parseInt(
        target.parentElement.getAttribute("page-number"),
        10
      );
      this.linkService.goToPage(pageNumber);
      stopEvent(e);
    }
  }

  /**
   * Focus either the checkbox or image of a thumbnail.
   * @param {PDFThumbnailView} thumbnail
   * @param {boolean} focusCheckbox - If true, focus checkbox; otherwise focus
   *   image
   */
  #focusThumbnailElement(thumbnail, focusCheckbox) {
    if (focusCheckbox && thumbnail.checkbox) {
      thumbnail.checkbox.focus();
    } else {
      thumbnail.imageContainer.focus();
    }
  }

  /**
   * Go to the next/previous menu item.
   * @param {HTMLElement} element
   * @param {boolean} forward
   * @param {boolean} horizontal
   * @param {boolean} navigateCheckboxes - If true, focus checkboxes;
   *   otherwise focus images
   */
  #goToNextItem(element, forward, horizontal, navigateCheckboxes = false) {
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
      this.#focusThumbnailElement(nextThumbnail, navigateCheckboxes);
    }
  }

  // Given the drag center (x, y), find the drop slot index: the drag marker
  // will be placed after thumbnail[index], or before all thumbnails if index
  // is -1. Returns null when the drop slot hasn't changed (no marker update
  // needed), or [index, space] where space is the gap (in px) between
  // thumbnails at that slot, used to position the marker.
  //
  // positionsX holds the x-center of each column, positionsY the y-center of
  // each row. positionsLastX holds the x-centers for an incomplete last row
  // (when the total number of thumbnails is not a multiple of the column
  // count).
  #findClosestThumbnail(x, y) {
    if (!this.#thumbnailsPositions) {
      this.#computeThumbnailsPosition();
    }
    const {
      x: positionsX,
      y: positionsY,
      lastX: positionsLastX,
      space: spaceBetweenThumbnails,
      lastSpace: lastSpaceBetweenThumbnails,
    } = this.#thumbnailsPositions;
    const lastDraggedOverIndex = this.#lastDraggedOverIndex;

    // Fast-path: reconstruct the row/col of the previous drop slot and check
    // whether (x, y) still falls inside the same cell's bounds.
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

    let index;
    // binarySearchFirstItem returns the first row index whose center is below
    // y, i.e. the first i such that positionsY[i] > y.
    yPos = binarySearchFirstItem(positionsY, cy => y < cy);
    if (this.#isOneColumnView) {
      // In a single column the drop slot is simply the row boundary: the marker
      // goes after row (yPos - 1), meaning before row yPos. index = -1 when y
      // is above the first thumbnail's center (drop before thumbnail 0).
      index = yPos - 1;
    } else {
      // Grid layout: first pick the nearest row, then the nearest column.

      if (yPos === positionsY.length) {
        // y is below the last row's center — clamp to the last row.
        yPos = positionsY.length - 1;
      } else {
        // Choose between the row just above (yPos - 1) and the row at yPos by
        // comparing distances, so the marker snaps to whichever row center is
        // closer to y.
        const dist1 = Math.abs(positionsY[yPos - 1] - y);
        const dist2 = Math.abs(positionsY[yPos] - y);
        yPos = dist1 < dist2 ? yPos - 1 : yPos;
      }
      // The last row may be incomplete, so use its own x-center array.
      xArray =
        yPos === positionsY.length - 1 && positionsLastX.length > 0
          ? positionsLastX
          : positionsX;
      // Find the column: the first column whose center is to the right of x,
      // minus 1, gives the column the cursor is in (or -1 if before column 0).
      xPos = binarySearchFirstItem(xArray, cx => x < cx) - 1;
      if (yPos < 0) {
        // y is above the first row: force drop before the very first thumbnail.
        if (xPos <= 0) {
          xPos = -1;
        }
        yPos = 0;
      }
      // Convert (row, col) to a flat thumbnail index, clamped to
      // [-1, length-1].
      index = MathClamp(
        yPos * positionsX.length + xPos,
        -1,
        this._thumbnails.length - 1
      );
    }
    if (index === lastDraggedOverIndex) {
      // No change.
      return null;
    }
    this.#lastDraggedOverIndex = index;
    // Use the last-row gap when the drop slot is in the incomplete last row.
    const space =
      yPos === positionsY.length - 1 && positionsLastX.length > 0 && xPos >= 0
        ? lastSpaceBetweenThumbnails
        : spaceBetweenThumbnails;

    return [index, space];
  }
}

export { PDFThumbnailViewer };
