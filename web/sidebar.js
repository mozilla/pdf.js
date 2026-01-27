/* Copyright 2025 Mozilla Foundation
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

import { noContextMenu, stopEvent } from "pdfjs-lib";

// Timeout before ending resize operation.
const RESIZE_TIMEOUT = 400; // ms

/**
 * Viewer control to display a sidebar with resizer functionality.
 */
class Sidebar {
  #initialWidth = 0;

  #width = 0;

  #coefficient;

  #resizeTimeout = null;

  #resizer;

  #isResizerOnTheLeft;

  #isKeyboardResizing = false;

  #resizeObserver;

  #prevX = 0;

  /**
   * @typedef {Object} SidebarElements
   * @property {HTMLElement} sidebar - The sidebar element.
   * @property {HTMLElement} resizer - The sidebar resizer element.
   * @property {HTMLElement} toggleButton - The button used to toggle the
   *   sidebar.
   */

  /**
   * Create a sidebar with resizer functionality.
   * @param {SidebarElements} sidebarElements
   * @param {boolean} ltr
   * @param {boolean} isResizerOnTheLeft
   */
  constructor({ sidebar, resizer, toggleButton }, ltr, isResizerOnTheLeft) {
    this._sidebar = sidebar;
    this.#coefficient = ltr === isResizerOnTheLeft ? -1 : 1;
    this.#resizer = resizer;
    this.#isResizerOnTheLeft = isResizerOnTheLeft;

    const style = window.getComputedStyle(sidebar);
    this.#initialWidth = this.#width = parseFloat(
      style.getPropertyValue("--sidebar-width")
    );
    resizer.ariaValueMin =
      parseFloat(style.getPropertyValue("--sidebar-min-width")) || 0;
    resizer.ariaValueMax =
      parseFloat(style.getPropertyValue("--sidebar-max-width")) || Infinity;
    resizer.ariaValueNow = this.#width;

    this.#makeSidebarResizable();
    toggleButton.addEventListener("click", this.toggle.bind(this));
    this._isOpen = false;
    sidebar.hidden = true;

    this.#resizeObserver = new ResizeObserver(
      ([
        {
          borderBoxSize: [{ inlineSize }],
        },
      ]) => {
        if (!isNaN(this.#prevX)) {
          this.#prevX += this.#coefficient * (inlineSize - this.#width);
        }
        this.#setWidth(inlineSize);
      }
    );
    this.#resizeObserver.observe(sidebar);
  }

  #makeSidebarResizable() {
    const sidebarStyle = this._sidebar.style;
    let pointerMoveAC;
    const cancelResize = () => {
      this.#resizeTimeout = null;
      this._sidebar.classList.remove("resizing");
      pointerMoveAC?.abort();
      pointerMoveAC = null;
      this.#isKeyboardResizing = false;
      this.onStopResizing();
      this.#prevX = NaN;
    };
    this.#resizer.addEventListener("pointerdown", e => {
      if (pointerMoveAC) {
        cancelResize();
        return;
      }
      this.onStartResizing();
      const { clientX } = e;
      stopEvent(e);
      this.#prevX = clientX;
      pointerMoveAC = new AbortController();
      const { signal } = pointerMoveAC;
      const sidebar = this._sidebar;
      sidebar.classList.add("resizing");
      const parentStyle = sidebar.parentElement.style;
      parentStyle.minWidth = 0;
      window.addEventListener("contextmenu", noContextMenu, { signal });
      window.addEventListener(
        "pointermove",
        ev => {
          if (!pointerMoveAC || Math.abs(ev.clientX - this.#prevX) < 1) {
            return;
          }
          stopEvent(ev);
          sidebarStyle.width = `${Math.round(this.#width + this.#coefficient * (ev.clientX - this.#prevX))}px`;
        },
        { signal, capture: true }
      );
      window.addEventListener("blur", cancelResize, { signal });
      window.addEventListener(
        "pointerup",
        ev => {
          if (pointerMoveAC) {
            cancelResize();
            stopEvent(ev);
          }
        },
        { signal }
      );
    });
    this.#resizer.addEventListener("keydown", e => {
      const { key } = e;
      const isArrowLeft = key === "ArrowLeft";
      if (isArrowLeft || key === "ArrowRight") {
        if (!this.#isKeyboardResizing) {
          this._sidebar.classList.add("resizing");
          this.#isKeyboardResizing = true;
          this.onStartResizing();
        }

        const base = e.ctrlKey || e.metaKey ? 10 : 1;
        const dx = base * (isArrowLeft ? -1 : 1);
        clearTimeout(this.#resizeTimeout);
        this.#resizeTimeout = setTimeout(cancelResize, RESIZE_TIMEOUT);
        sidebarStyle.width = `${Math.round(this.#width + this.#coefficient * dx)}px`;
        stopEvent(e);
      }
    });
  }

  #setWidth(newWidth) {
    this.#width = newWidth;
    this.#resizer.ariaValueNow = Math.round(newWidth);
    if (this.#isResizerOnTheLeft) {
      this._sidebar.parentElement.style.insetInlineStart = `${(this.#initialWidth - newWidth).toFixed(3)}px`;
    }
    this.onResizing(newWidth);
  }

  /**
   * Get the current width of the sidebar in pixels.
   * @returns {number}
   */
  get width() {
    return this.#width;
  }

  /**
   * Set the width of the sidebar in pixels.
   * @param {number} newWidth
   */
  set width(newWidth) {
    this._sidebar.style.width = `${newWidth}px`;
  }

  /**
   * Callback to be executed when the user starts resizing the sidebar.
   */
  onStartResizing() {}

  /**
   * Callback to be executed when the user stops resizing the sidebar.
   */
  onStopResizing() {}

  /**
   * Callback to be executed when the sidebar is being resized.
   * @param {number} newWidth - The new width of the sidebar in pixels.
   */
  onResizing(_newWidth) {}

  /**
   * Toggle the sidebar's visibility.
   * @param {boolean} [visibility] - The visibility state to set.
   */
  toggle(visibility = !this._isOpen) {
    this._sidebar.hidden = !(this._isOpen = visibility);
  }

  destroy() {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
  }
}

export { Sidebar };
