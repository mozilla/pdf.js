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

/** @typedef {import("./event_utils.js").EventBus} EventBus */
/** @typedef {import("./pdf_viewer.js").PDFViewer} PDFViewer */

import {
  normalizeWheelEventDelta,
  PresentationModeState,
  ScrollMode,
  SpreadMode,
} from "./ui_utils.js";
import { AnnotationEditorType } from "pdfjs-lib";

const DELAY_BEFORE_HIDING_CONTROLS = 3000; // in ms
const ACTIVE_SELECTOR = "pdfPresentationMode";
const CONTROLS_SELECTOR = "pdfPresentationModeControls";
const MOUSE_SCROLL_COOLDOWN_TIME = 50; // in ms
const PAGE_SWITCH_THRESHOLD = 0.1;

// Number of CSS pixels for a movement to count as a swipe.
const SWIPE_MIN_DISTANCE_THRESHOLD = 50;

// Swipe angle deviation from the x or y axis before it is not
// considered a swipe in that direction any more.
const SWIPE_ANGLE_THRESHOLD = Math.PI / 6;

/**
 * @typedef {Object} PDFPresentationModeOptions
 * @property {HTMLDivElement} container - The container for the viewer element.
 * @property {PDFViewer} pdfViewer - The document viewer.
 * @property {EventBus} eventBus - The application event bus.
 */

class PDFPresentationMode {
  #state = PresentationModeState.UNKNOWN;

  #args = null;

  #fullscreenChangeAbortController = null;

  #windowAbortController = null;

  /**
   * @param {PDFPresentationModeOptions} options
   */
  constructor({ container, pdfViewer, eventBus }) {
    this.container = container;
    this.pdfViewer = pdfViewer;
    this.eventBus = eventBus;

    this.contextMenuOpen = false;
    this.mouseScrollTimeStamp = 0;
    this.mouseScrollDelta = 0;
    this.touchSwipeState = null;
  }

  /**
   * Request the browser to enter fullscreen mode.
   * @returns {Promise<boolean>} Indicating if the request was successful.
   */
  async request() {
    const { container, pdfViewer } = this;

    if (this.active || !pdfViewer.pagesCount || !container.requestFullscreen) {
      return false;
    }
    this.#addFullscreenChangeListeners();
    this.#notifyStateChange(PresentationModeState.CHANGING);

    const promise = container.requestFullscreen();

    this.#args = {
      pageNumber: pdfViewer.currentPageNumber,
      scaleValue: pdfViewer.currentScaleValue,
      scrollMode: pdfViewer.scrollMode,
      spreadMode: null,
      annotationEditorMode: null,
    };

    if (
      pdfViewer.spreadMode !== SpreadMode.NONE &&
      !(pdfViewer.pageViewsReady && pdfViewer.hasEqualPageSizes)
    ) {
      console.warn(
        "Ignoring Spread modes when entering PresentationMode, " +
          "since the document may contain varying page sizes."
      );
      this.#args.spreadMode = pdfViewer.spreadMode;
    }
    if (pdfViewer.annotationEditorMode !== AnnotationEditorType.DISABLE) {
      this.#args.annotationEditorMode = pdfViewer.annotationEditorMode;
    }

    try {
      await promise;
      pdfViewer.focus(); // Fixes bug 1787456.
      return true;
    } catch {
      this.#removeFullscreenChangeListeners();
      this.#notifyStateChange(PresentationModeState.NORMAL);
    }
    return false;
  }

  get active() {
    return (
      this.#state === PresentationModeState.CHANGING ||
      this.#state === PresentationModeState.FULLSCREEN
    );
  }

  #mouseWheel(evt) {
    if (!this.active) {
      return;
    }
    evt.preventDefault();

    const delta = normalizeWheelEventDelta(evt);
    const currentTime = Date.now();
    const storedTime = this.mouseScrollTimeStamp;

    // If we've already switched page, avoid accidentally switching again.
    if (
      currentTime > storedTime &&
      currentTime - storedTime < MOUSE_SCROLL_COOLDOWN_TIME
    ) {
      return;
    }
    // If the scroll direction changed, reset the accumulated scroll delta.
    if (
      (this.mouseScrollDelta > 0 && delta < 0) ||
      (this.mouseScrollDelta < 0 && delta > 0)
    ) {
      this.#resetMouseScrollState();
    }
    this.mouseScrollDelta += delta;

    if (Math.abs(this.mouseScrollDelta) >= PAGE_SWITCH_THRESHOLD) {
      const totalDelta = this.mouseScrollDelta;
      this.#resetMouseScrollState();
      const success =
        totalDelta > 0
          ? this.pdfViewer.previousPage()
          : this.pdfViewer.nextPage();
      if (success) {
        this.mouseScrollTimeStamp = currentTime;
      }
    }
  }

  #notifyStateChange(state) {
    this.#state = state;

    this.eventBus.dispatch("presentationmodechanged", { source: this, state });
  }

  #enter() {
    this.#notifyStateChange(PresentationModeState.FULLSCREEN);
    this.container.classList.add(ACTIVE_SELECTOR);

    // Ensure that the correct page is scrolled into view when entering
    // Presentation Mode, by waiting until fullscreen mode in enabled.
    setTimeout(() => {
      this.pdfViewer.scrollMode = ScrollMode.PAGE;
      if (this.#args.spreadMode !== null) {
        this.pdfViewer.spreadMode = SpreadMode.NONE;
      }
      this.pdfViewer.currentPageNumber = this.#args.pageNumber;
      this.pdfViewer.currentScaleValue = "page-fit";

      if (this.#args.annotationEditorMode !== null) {
        this.pdfViewer.annotationEditorMode = {
          mode: AnnotationEditorType.NONE,
        };
      }
    }, 0);

    this.#addWindowListeners();
    this.#showControls();
    this.contextMenuOpen = false;

    // Text selection is disabled in Presentation Mode, thus it's not possible
    // for the user to deselect text that is selected (e.g. with "Select all")
    // when entering Presentation Mode, hence we remove any active selection.
    document.getSelection().empty();
  }

  #exit() {
    const pageNumber = this.pdfViewer.currentPageNumber;
    this.container.classList.remove(ACTIVE_SELECTOR);

    // Ensure that the correct page is scrolled into view when exiting
    // Presentation Mode, by waiting until fullscreen mode is disabled.
    setTimeout(() => {
      this.#removeFullscreenChangeListeners();
      this.#notifyStateChange(PresentationModeState.NORMAL);

      this.pdfViewer.scrollMode = this.#args.scrollMode;
      if (this.#args.spreadMode !== null) {
        this.pdfViewer.spreadMode = this.#args.spreadMode;
      }
      this.pdfViewer.currentScaleValue = this.#args.scaleValue;
      this.pdfViewer.currentPageNumber = pageNumber;

      if (this.#args.annotationEditorMode !== null) {
        this.pdfViewer.annotationEditorMode = {
          mode: this.#args.annotationEditorMode,
        };
      }
      this.#args = null;
    }, 0);

    this.#removeWindowListeners();
    this.#hideControls();
    this.#resetMouseScrollState();
    this.contextMenuOpen = false;
  }

  #mouseDown(evt) {
    if (this.contextMenuOpen) {
      this.contextMenuOpen = false;
      evt.preventDefault();
      return;
    }
    if (evt.button !== 0) {
      return;
    }
    // Enable clicking of links in presentation mode. Note: only links
    // pointing to destinations in the current PDF document work.
    if (
      evt.target.href &&
      evt.target.parentNode?.hasAttribute("data-internal-link")
    ) {
      return;
    }
    // Unless an internal link was clicked, advance one page.
    evt.preventDefault();

    if (evt.shiftKey) {
      this.pdfViewer.previousPage();
    } else {
      this.pdfViewer.nextPage();
    }
  }

  #contextMenu() {
    this.contextMenuOpen = true;
  }

  #showControls() {
    if (this.controlsTimeout) {
      clearTimeout(this.controlsTimeout);
    } else {
      this.container.classList.add(CONTROLS_SELECTOR);
    }
    this.controlsTimeout = setTimeout(() => {
      this.container.classList.remove(CONTROLS_SELECTOR);
      delete this.controlsTimeout;
    }, DELAY_BEFORE_HIDING_CONTROLS);
  }

  #hideControls() {
    if (!this.controlsTimeout) {
      return;
    }
    clearTimeout(this.controlsTimeout);
    this.container.classList.remove(CONTROLS_SELECTOR);
    delete this.controlsTimeout;
  }

  /**
   * Resets the properties used for tracking mouse scrolling events.
   */
  #resetMouseScrollState() {
    this.mouseScrollTimeStamp = 0;
    this.mouseScrollDelta = 0;
  }

  #touchSwipe(evt) {
    if (!this.active) {
      return;
    }
    if (evt.touches.length > 1) {
      // Multiple touch points detected; cancel the swipe.
      this.touchSwipeState = null;
      return;
    }

    switch (evt.type) {
      case "touchstart":
        this.touchSwipeState = {
          startX: evt.touches[0].pageX,
          startY: evt.touches[0].pageY,
          endX: evt.touches[0].pageX,
          endY: evt.touches[0].pageY,
        };
        break;
      case "touchmove":
        if (this.touchSwipeState === null) {
          return;
        }
        this.touchSwipeState.endX = evt.touches[0].pageX;
        this.touchSwipeState.endY = evt.touches[0].pageY;
        // Avoid the swipe from triggering browser gestures (Chrome in
        // particular has some sort of swipe gesture in fullscreen mode).
        evt.preventDefault();
        break;
      case "touchend":
        if (this.touchSwipeState === null) {
          return;
        }
        let delta = 0;
        const dx = this.touchSwipeState.endX - this.touchSwipeState.startX;
        const dy = this.touchSwipeState.endY - this.touchSwipeState.startY;
        const absAngle = Math.abs(Math.atan2(dy, dx));
        if (
          Math.abs(dx) > SWIPE_MIN_DISTANCE_THRESHOLD &&
          (absAngle <= SWIPE_ANGLE_THRESHOLD ||
            absAngle >= Math.PI - SWIPE_ANGLE_THRESHOLD)
        ) {
          // Horizontal swipe.
          delta = dx;
        } else if (
          Math.abs(dy) > SWIPE_MIN_DISTANCE_THRESHOLD &&
          Math.abs(absAngle - Math.PI / 2) <= SWIPE_ANGLE_THRESHOLD
        ) {
          // Vertical swipe.
          delta = dy;
        }
        if (delta > 0) {
          this.pdfViewer.previousPage();
        } else if (delta < 0) {
          this.pdfViewer.nextPage();
        }
        break;
    }
  }

  #addWindowListeners() {
    if (this.#windowAbortController) {
      return;
    }
    this.#windowAbortController = new AbortController();
    const { signal } = this.#windowAbortController;

    const touchSwipeBind = this.#touchSwipe.bind(this);

    window.addEventListener("mousemove", this.#showControls.bind(this), {
      signal,
    });
    window.addEventListener("mousedown", this.#mouseDown.bind(this), {
      signal,
    });
    window.addEventListener("wheel", this.#mouseWheel.bind(this), {
      passive: false,
      signal,
    });
    window.addEventListener("keydown", this.#resetMouseScrollState.bind(this), {
      signal,
    });
    window.addEventListener("contextmenu", this.#contextMenu.bind(this), {
      signal,
    });
    window.addEventListener("touchstart", touchSwipeBind, { signal });
    window.addEventListener("touchmove", touchSwipeBind, { signal });
    window.addEventListener("touchend", touchSwipeBind, { signal });
  }

  #removeWindowListeners() {
    this.#windowAbortController?.abort();
    this.#windowAbortController = null;
  }

  #addFullscreenChangeListeners() {
    if (this.#fullscreenChangeAbortController) {
      return;
    }
    this.#fullscreenChangeAbortController = new AbortController();

    window.addEventListener(
      "fullscreenchange",
      () => {
        if (/* isFullscreen = */ document.fullscreenElement) {
          this.#enter();
        } else {
          this.#exit();
        }
      },
      { signal: this.#fullscreenChangeAbortController.signal }
    );
  }

  #removeFullscreenChangeListeners() {
    this.#fullscreenChangeAbortController?.abort();
    this.#fullscreenChangeAbortController = null;
  }
}

export { PDFPresentationMode };
