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

class ZoomToRect {
  #activateAC = null;

  #mouseDownAC = null;

  constructor({ element, onZoom }) {
    this.element = element;
    this.document = element.ownerDocument;
    this.onZoom = onZoom;

    const overlay = (this.overlay = document.createElement("div"));
    overlay.className = "zoom-to-rect-grabbing";
  }

  activate() {
    if (!this.#activateAC) {
      this.#activateAC = new AbortController();

      this.element.addEventListener("mousedown", this.#onMouseDown.bind(this), {
        capture: true,
        signal: this.#activateAC.signal,
      });
      this.element.classList.add("zoom-to-rect-grab");
    }
  }

  deactivate() {
    if (this.#activateAC) {
      this.#activateAC.abort();
      this.#activateAC = null;
      this.#endZoom();
      this.element.classList.remove("zoom-to-rect-grab");
    }
  }

  toggle() {
    if (this.#activateAC) {
      this.deactivate();
    } else {
      this.activate();
    }
  }

  #onMouseDown(event) {
    if (event.button !== 0 || this.#mouseDownAC) {
      return;
    }
    const { element, overlay } = this;
    const rect = element.getBoundingClientRect();
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.startTop = rect.top;
    this.startLeft = rect.left;

    this.#mouseDownAC = new AbortController();
    const boundEndZoom = this.#endZoom.bind(this);
    const mouseOpts = { capture: true, signal: this.#mouseDownAC.signal };

    window.addEventListener(
      "mousemove",
      this.#onMouseMove.bind(this),
      mouseOpts
    );
    window.addEventListener("mouseup", boundEndZoom, mouseOpts);
    window.addEventListener("keydown", this.#onKeyDown.bind(this), mouseOpts);

    element.classList.add("zoom-to-rect-grabbing");
    overlay.style.width = "0";
    overlay.style.height = "0";
    this.document.body.append(overlay);

    event.preventDefault();
    event.stopPropagation();
  }

  #onKeyDown(event) {
    if (event.key === "Escape") {
      this.#endZoom(null);
    }
  }

  #onMouseMove(event) {
    const currentX = event.clientX;
    const currentY = event.clientY;

    const x = Math.min(this.startX, currentX);
    const y = Math.min(this.startY, currentY);
    const width = Math.abs(this.startX - currentX);
    const height = Math.abs(this.startY - currentY);

    this.overlay.style.left = `${x}px`;
    this.overlay.style.top = `${y}px`;
    this.overlay.style.width = `${width}px`;
    this.overlay.style.height = `${height}px`;
  }

  #endZoom(event) {
    this.#mouseDownAC?.abort();
    this.#mouseDownAC = null;
    this.element.classList.remove("zoom-to-rect-grabbing");
    this.overlay.remove();

    if (event) {
      const rect = {
        x: Math.min(this.startX, event.clientX),
        y: Math.min(this.startY, event.clientY),
        width: Math.abs(this.startX - event.clientX),
        height: Math.abs(this.startY - event.clientY),
      };
      // Ignore very small clicks/drags to prevent accidental zooms
      if (rect.width > 5 && rect.height > 5) {
        this.onZoom(rect);
      }
    }
  }
}

export { ZoomToRect };
