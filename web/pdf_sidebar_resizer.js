/* Copyright 2017 Mozilla Foundation
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

import { NullL10n } from "./ui_utils.js";

const SIDEBAR_WIDTH_VAR = "--sidebar-width";
const SIDEBAR_MIN_WIDTH = 200; // pixels
const SIDEBAR_RESIZING_CLASS = "sidebarResizing";

/**
 * @typedef {Object} PDFSidebarResizerOptions
 * @property {HTMLDivElement} outerContainer - The outer container
 *   (encasing both the viewer and sidebar elements).
 * @property {HTMLDivElement} resizer - The DOM element that can be dragged in
 *   order to adjust the width of the sidebar.
 */

class PDFSidebarResizer {
  /**
   * @param {PDFSidebarResizerOptions} options
   * @param {EventBus} eventBus - The application event bus.
   * @param {IL10n} l10n - Localization service.
   */
  constructor(options, eventBus, l10n = NullL10n) {
    this.isRTL = false;
    this.sidebarOpen = false;
    this.doc = document.documentElement;
    this._width = null;
    this._outerContainerWidth = null;
    this._boundEvents = Object.create(null);

    this.outerContainer = options.outerContainer;
    this.resizer = options.resizer;
    this.eventBus = eventBus;

    l10n.getDirection().then(dir => {
      this.isRTL = dir === "rtl";
    });
    this._addEventListeners();
  }

  /**
   * @type {number}
   */
  get outerContainerWidth() {
    if (!this._outerContainerWidth) {
      this._outerContainerWidth = this.outerContainer.clientWidth;
    }
    return this._outerContainerWidth;
  }

  /**
   * @private
   * returns {boolean} Indicating if the sidebar width was updated.
   */
  _updateWidth(width = 0) {
    // Prevent the sidebar from becoming too narrow, or from occupying more
    // than half of the available viewer width.
    const maxWidth = Math.floor(this.outerContainerWidth / 2);
    if (width > maxWidth) {
      width = maxWidth;
    }
    if (width < SIDEBAR_MIN_WIDTH) {
      width = SIDEBAR_MIN_WIDTH;
    }
    // Only update the UI when the sidebar width did in fact change.
    if (width === this._width) {
      return false;
    }
    this._width = width;
    this.doc.style.setProperty(SIDEBAR_WIDTH_VAR, `${width}px`);
    return true;
  }

  /**
   * @private
   */
  _mouseMove(evt) {
    let width = evt.clientX;
    // For sidebar resizing to work correctly in RTL mode, invert the width.
    if (this.isRTL) {
      width = this.outerContainerWidth - width;
    }
    this._updateWidth(width);
  }

  /**
   * @private
   */
  _mouseUp(evt) {
    // Re-enable the `transition-duration` rules when sidebar resizing ends...
    this.outerContainer.classList.remove(SIDEBAR_RESIZING_CLASS);
    // ... and ensure that rendering will always be triggered.
    this.eventBus.dispatch("resize", { source: this });

    const _boundEvents = this._boundEvents;
    window.removeEventListener("mousemove", _boundEvents.mouseMove);
    window.removeEventListener("mouseup", _boundEvents.mouseUp);
  }

  /**
   * @private
   */
  _addEventListeners() {
    const _boundEvents = this._boundEvents;
    _boundEvents.mouseMove = this._mouseMove.bind(this);
    _boundEvents.mouseUp = this._mouseUp.bind(this);

    this.resizer.addEventListener("mousedown", evt => {
      if (evt.button !== 0) {
        return;
      }
      // Disable the `transition-duration` rules when sidebar resizing begins,
      // in order to improve responsiveness and to avoid visual glitches.
      this.outerContainer.classList.add(SIDEBAR_RESIZING_CLASS);

      window.addEventListener("mousemove", _boundEvents.mouseMove);
      window.addEventListener("mouseup", _boundEvents.mouseUp);
    });

    this.eventBus._on("sidebarviewchanged", evt => {
      this.sidebarOpen = !!(evt && evt.view);
    });

    this.eventBus._on("resize", evt => {
      // When the *entire* viewer is resized, such that it becomes narrower,
      // ensure that the sidebar doesn't end up being too wide.
      if (!evt || evt.source !== window) {
        return;
      }
      // Always reset the cached width when the viewer is resized.
      this._outerContainerWidth = null;

      if (!this._width) {
        // The sidebar hasn't been resized, hence no need to adjust its width.
        return;
      }
      // NOTE: If the sidebar is closed, we don't need to worry about
      //       visual glitches nor ensure that rendering is triggered.
      if (!this.sidebarOpen) {
        this._updateWidth(this._width);
        return;
      }
      this.outerContainer.classList.add(SIDEBAR_RESIZING_CLASS);
      const updated = this._updateWidth(this._width);

      Promise.resolve().then(() => {
        this.outerContainer.classList.remove(SIDEBAR_RESIZING_CLASS);
        // Trigger rendering if the sidebar width changed, to avoid
        // depending on the order in which 'resize' events are handled.
        if (updated) {
          this.eventBus.dispatch("resize", { source: this });
        }
      });
    });
  }
}

export { PDFSidebarResizer };
