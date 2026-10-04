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

import { internalOpt } from "./internal_evt.js";

class ZoomRestoreButton {
  #view = null;

  constructor({ button, pdfViewer, eventBus }) {
    this.button = button;
    this.pdfViewer = pdfViewer;
    button.addEventListener("click", () => this.#restore());
    eventBus.on("pagesdestroy", () => this.#reset(), internalOpt);
  }

  capture() {
    const { pdfViewer } = this;
    const { scrollLeft, scrollTop } = pdfViewer.container;
    this.#view = {
      scale: pdfViewer.currentScale,
      scrollLeft,
      scrollTop,
    };
  }

  show() {
    this.button.hidden = false;
  }

  #restore() {
    const view = this.#view;
    if (!view) {
      return;
    }
    const { pdfViewer } = this;
    pdfViewer.currentScale = view.scale;
    pdfViewer.container.scrollTo(view.scrollLeft, view.scrollTop);
    this.#reset();
    pdfViewer.focus();
  }

  #reset() {
    this.#view = null;
    this.button.hidden = true;
  }
}

export { ZoomRestoreButton };
