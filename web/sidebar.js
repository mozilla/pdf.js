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

import { MathClamp, noContextMenu, stopEvent } from "pdfjs-lib";

/**
 * Viewer control to display a sidebar with resizer functionality.
 */
class Sidebar {
  #minWidth = 0;

  #maxWidth = 0;

  #initialWidth = 0;

  #width = 0;

  #coefficient;

  #visible = false;

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

    const style = window.getComputedStyle(sidebar);
    this.#minWidth = parseFloat(style.getPropertyValue("--sidebar-min-width"));
    this.#maxWidth = parseFloat(style.getPropertyValue("--sidebar-max-width"));
    this.#initialWidth = this.#width = parseFloat(
      style.getPropertyValue("--sidebar-width")
    );

    this.#makeSidebarResizable(resizer, isResizerOnTheLeft);
    toggleButton.addEventListener("click", this.toggle.bind(this));
    sidebar.hidden = true;
  }

  #makeSidebarResizable(resizer, isResizerOnTheLeft) {
    resizer.ariaValueMin = this.#minWidth;
    resizer.ariaValueMax = this.#maxWidth;
    resizer.ariaValueNow = this.#width;

    let pointerMoveAC;
    const cancelResize = () => {
      this.#width = MathClamp(this.#width, this.#minWidth, this.#maxWidth);
      this._sidebar.classList.remove("resizing");
      pointerMoveAC?.abort();
      pointerMoveAC = null;
    };
    resizer.addEventListener("pointerdown", e => {
      if (pointerMoveAC) {
        cancelResize();
        return;
      }
      const { clientX } = e;
      stopEvent(e);
      let prevX = clientX;
      pointerMoveAC = new AbortController();
      const { signal } = pointerMoveAC;
      const sidebar = this._sidebar;
      const sidebarStyle = sidebar.style;
      sidebar.classList.add("resizing");
      const parentStyle = sidebar.parentElement.style;
      parentStyle.minWidth = 0;
      window.addEventListener("contextmenu", noContextMenu, { signal });
      window.addEventListener(
        "pointermove",
        ev => {
          if (!pointerMoveAC) {
            return;
          }
          stopEvent(ev);
          const { clientX: x } = ev;
          this.#setNewWidth(
            x - prevX,
            parentStyle,
            resizer,
            sidebarStyle,
            isResizerOnTheLeft,
            /* isFromKeyboard */ false
          );
          prevX = x;
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
    resizer.addEventListener("keydown", e => {
      const { key } = e;
      const isArrowLeft = key === "ArrowLeft";
      if (isArrowLeft || key === "ArrowRight") {
        const base = e.ctrlKey || e.metaKey ? 10 : 1;
        const dx = base * (isArrowLeft ? -1 : 1);
        this.#setNewWidth(
          dx,
          this._sidebar.parentElement.style,
          resizer,
          this._sidebar.style,
          isResizerOnTheLeft,
          /* isFromKeyboard */ true
        );
        stopEvent(e);
      }
    });
  }

  #setNewWidth(
    dx,
    parentStyle,
    resizer,
    sidebarStyle,
    isResizerOnTheLeft,
    isFromKeyboard
  ) {
    let newWidth = this.#width + this.#coefficient * dx;
    if (!isFromKeyboard) {
      this.#width = newWidth;
    }
    if (
      (newWidth > this.#maxWidth || newWidth < this.#minWidth) &&
      (this.#width === this.#maxWidth || this.#width === this.#minWidth)
    ) {
      return;
    }
    newWidth = MathClamp(newWidth, this.#minWidth, this.#maxWidth);
    if (isFromKeyboard) {
      this.#width = newWidth;
    }
    resizer.ariaValueNow = Math.round(newWidth);
    sidebarStyle.width = `${newWidth.toFixed(3)}px`;
    if (isResizerOnTheLeft) {
      parentStyle.insetInlineStart = `${(this.#initialWidth - newWidth).toFixed(3)}px`;
    }
  }

  /**
   * Toggle the sidebar's visibility.
   */
  toggle() {
    this._sidebar.hidden = !(this.#visible = !this.#visible);
  }
}

export { Sidebar };
