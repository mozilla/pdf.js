/* Copyright 2026 Mozilla Foundation
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

import { MathClamp } from "pdfjs-lib";

const MIN_DRAG_SIZE = 5;

class ZoomToRect {
  #activateAC = null;

  #dragAC = null;

  #clickAC = null;

  constructor({ element, onZoom, onCancel }) {
    this.element = element;
    this.onZoom = onZoom;
    this.onCancel = onCancel;
    this.overlay = element.ownerDocument.createElement("div");
    this.overlay.className = "zoomToRectSelection";
  }

  activate() {
    if (this.#activateAC) {
      return;
    }
    this.#activateAC = new AbortController();
    this.element.addEventListener("pointerdown", this.#start.bind(this), {
      capture: true,
      signal: this.#activateAC.signal,
    });
    this.element.addEventListener(
      "click",
      evt => {
        evt.preventDefault();
        evt.stopPropagation();
      },
      { capture: true, signal: this.#activateAC.signal }
    );
    this.element.ownerDocument.defaultView.addEventListener(
      "keydown",
      evt => {
        if (evt.key === "Escape") {
          this.#finish();
          this.onCancel();
          evt.preventDefault();
          evt.stopPropagation();
        }
      },
      { capture: true, signal: this.#activateAC.signal }
    );
    this.element.classList.add("zoomToRect");
    this.element.focus({ preventScroll: true });
  }

  deactivate() {
    this.#activateAC?.abort();
    this.#activateAC = null;
    this.#finish();
    this.element.classList.remove("zoomToRect");
  }

  #start(event) {
    if (
      event.button !== 0 ||
      !event.isPrimary ||
      event.pointerType !== "mouse" ||
      this.#dragAC
    ) {
      return;
    }
    const { element, overlay } = this;
    const bounds = element.getBoundingClientRect();
    // Leave the scrollbars available while the tool is active.
    if (
      event.clientX < bounds.left + element.clientLeft ||
      event.clientY < bounds.top + element.clientTop ||
      event.clientX >= bounds.left + element.clientLeft + element.clientWidth ||
      event.clientY >= bounds.top + element.clientTop + element.clientHeight
    ) {
      return;
    }
    const startX = event.clientX,
      startY = event.clientY;
    const pointerId = event.pointerId;
    this.#dragAC = new AbortController();
    const options = { capture: true, signal: this.#dragAC.signal };
    const win = element.ownerDocument.defaultView;
    // A click still follows pointerup even when pointerdown was cancelled.
    // Keep it suppressed if completing the zoom deactivates this tool.
    this.#clickAC?.abort();
    const clickAC = (this.#clickAC = new AbortController());
    const clearClick = () => {
      clickAC.abort();
      this.#clickAC = null;
    };
    win.addEventListener(
      "click",
      evt => {
        evt.preventDefault();
        evt.stopPropagation();
        clearClick();
      },
      { capture: true, signal: clickAC.signal }
    );
    // Some cancelled gestures produce no click; leave the next one available.
    win.addEventListener("pointerdown", clearClick, {
      capture: true,
      signal: clickAC.signal,
    });
    const getRect = evt => {
      const x = MathClamp(
        evt.clientX,
        bounds.left + element.clientLeft,
        bounds.left + element.clientLeft + element.clientWidth
      );
      const y = MathClamp(
        evt.clientY,
        bounds.top + element.clientTop,
        bounds.top + element.clientTop + element.clientHeight
      );
      return {
        x: Math.min(startX, x),
        y: Math.min(startY, y),
        width: Math.abs(startX - x),
        height: Math.abs(startY - y),
      };
    };
    const draw = evt => {
      const rect = getRect(evt);
      Object.assign(overlay.style, {
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    };
    win.addEventListener(
      "pointermove",
      evt => {
        if (evt.pointerId === pointerId) {
          draw(evt);
          evt.preventDefault();
        }
      },
      options
    );
    win.addEventListener(
      "pointerup",
      evt => {
        if (evt.pointerId !== pointerId) {
          return;
        }
        const rect = getRect(evt);
        this.#finish();
        evt.preventDefault();
        evt.stopPropagation();
        if (rect.width > MIN_DRAG_SIZE && rect.height > MIN_DRAG_SIZE) {
          this.onZoom(rect);
        }
      },
      options
    );
    win.addEventListener("pointercancel", () => this.#finish(), options);
    win.addEventListener("blur", () => this.#finish(), options);
    win.addEventListener("resize", () => this.#finish(), options);
    // Scrolling changes the document coordinates underneath the selection.
    element.addEventListener("scroll", () => this.#finish(), options);
    draw(event);
    element.ownerDocument.body.append(overlay);
    event.preventDefault();
    event.stopPropagation();
  }

  #finish() {
    this.#dragAC?.abort();
    this.#dragAC = null;
    this.overlay.remove();
  }
}

export { ZoomToRect };
