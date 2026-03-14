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

/**
 * Wraps two elements with a drag-to-resize handle between them.
 *
 * @param {HTMLElement} firstEl
 * @param {HTMLElement} secondEl
 * @param {object} [options]
 * @param {"row"|"column"} [options.direction="row"]  Layout axis.
 * @param {number}         [options.minSize=40]       Min px for each panel.
 * @param {Function}       [options.onResize]         Called after each resize.
 */
class SplitView {
  #container;

  #resizer;

  #isRow;

  #minSize;

  #onResize;

  #onPointerDown = null;

  #onKeyDown = null;

  constructor(
    firstEl,
    secondEl,
    { direction = "row", minSize = 40, onResize } = {}
  ) {
    this.#isRow = direction === "row";
    this.#minSize = minSize;
    this.#onResize = onResize;

    const resizer = (this.#resizer = document.createElement("div"));
    resizer.className = "spc-resizer";
    resizer.role = "separator";
    resizer.tabIndex = 0;
    resizer.ariaOrientation = this.#isRow ? "vertical" : "horizontal";
    resizer.ariaValueMin = 0;
    resizer.ariaValueMax = 100;
    resizer.ariaValueNow = 50;

    this.#container = document.createElement("div");
    this.#container.className = `spc-container spc-${direction}`;
    this.#container.append(firstEl, resizer, secondEl);

    this.#setupResizer();
  }

  get element() {
    return this.#container;
  }

  destroy() {
    if (this.#onPointerDown) {
      this.#resizer.removeEventListener("pointerdown", this.#onPointerDown);
      this.#onPointerDown = null;
    }
    if (this.#onKeyDown) {
      this.#resizer.removeEventListener("keydown", this.#onKeyDown);
      this.#onKeyDown = null;
    }
  }

  // Always read the live first/last child so callers can swap panels in-place.
  get #first() {
    return this.#container.firstElementChild;
  }

  get #second() {
    return this.#container.lastElementChild;
  }

  #dimension() {
    return this.#isRow ? "width" : "height";
  }

  #updateAria(containerSize, resizerSize) {
    const total = containerSize - resizerSize;
    if (total <= 0) {
      return;
    }
    const firstSize = this.#first.getBoundingClientRect()[this.#dimension()];
    this.#resizer.ariaValueNow = Math.round((firstSize / total) * 100);
  }

  #clampFirstSize(total, requestedFirst) {
    if (total <= 0) {
      return 0;
    }
    if (total <= this.#minSize * 2) {
      return Math.min(total, Math.max(0, requestedFirst));
    }
    return Math.max(
      this.#minSize,
      Math.min(total - this.#minSize, requestedFirst)
    );
  }

  #resize(newFirst) {
    const dimension = this.#dimension();
    const containerSize = this.#container.getBoundingClientRect()[dimension];
    const resizerSize = this.#resizer.getBoundingClientRect()[dimension];
    this.#resizeWithMetrics(newFirst, containerSize, resizerSize);
  }

  #resizeWithMetrics(newFirst, containerSize, resizerSize) {
    const total = containerSize - resizerSize;
    const clamped = this.#clampFirstSize(total, newFirst);
    this.#first.style.flexGrow = clamped;
    this.#second.style.flexGrow = total - clamped;
    this.#updateAria(containerSize, resizerSize);
  }

  #setupResizer() {
    const axis = this.#isRow ? "clientX" : "clientY";
    const cursor = this.#isRow ? "col-resize" : "row-resize";

    this.#onPointerDown = e => {
      if (e.button !== 0) {
        return;
      }
      e.preventDefault();

      const dimension = this.#dimension();
      const containerSize = this.#container.getBoundingClientRect()[dimension];
      const resizerSize = this.#resizer.getBoundingClientRect()[dimension];
      const startPos = e[axis];
      const startFirst = this.#first.getBoundingClientRect()[dimension];

      this.#resizer.classList.add("dragging");
      document.body.style.cursor = cursor;

      const ac = new AbortController();
      const { signal } = ac;

      const cancelDrag = () => {
        ac.abort();
        this.#resizer.classList.remove("dragging");
        document.body.style.cursor = "";
      };

      window.addEventListener(
        "pointermove",
        ev => {
          this.#resizeWithMetrics(
            startFirst + ev[axis] - startPos,
            containerSize,
            resizerSize
          );
        },
        { signal }
      );
      window.addEventListener(
        "pointerup",
        () => {
          cancelDrag();
          this.#updateAria(
            containerSize,
            this.#resizer.getBoundingClientRect()[dimension]
          );
          this.#onResize?.();
        },
        { signal }
      );
      window.addEventListener("blur", cancelDrag, { signal });
    };
    this.#resizer.addEventListener("pointerdown", this.#onPointerDown);

    this.#onKeyDown = e => {
      let delta = 0;
      if (
        (this.#isRow && e.key === "ArrowLeft") ||
        (!this.#isRow && e.key === "ArrowUp")
      ) {
        delta = -(e.shiftKey ? 50 : 10);
      } else if (
        (this.#isRow && e.key === "ArrowRight") ||
        (!this.#isRow && e.key === "ArrowDown")
      ) {
        delta = e.shiftKey ? 50 : 10;
      } else {
        return;
      }
      e.preventDefault();
      const dimension = this.#dimension();
      const inlineCurrent = parseFloat(this.#first.style.flexGrow);
      const currentFirst = isNaN(inlineCurrent)
        ? this.#first.getBoundingClientRect()[dimension]
        : inlineCurrent;
      this.#resize(currentFirst + delta);
      this.#onResize?.();
    };
    this.#resizer.addEventListener("keydown", this.#onKeyDown);
  }
}

export { SplitView };
