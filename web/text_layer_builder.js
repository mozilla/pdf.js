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

// eslint-disable-next-line max-len
/** @typedef {import("../src/display/display_utils").PageViewport} PageViewport */
/** @typedef {import("./event_utils").EventBus} EventBus */
/** @typedef {import("./text_highlighter").TextHighlighter} TextHighlighter */
// eslint-disable-next-line max-len
/** @typedef {import("./text_accessibility.js").TextAccessibilityManager} TextAccessibilityManager */

import { renderTextLayer, updateTextLayer } from "pdfjs-lib";

/**
 * @typedef {Object} TextLayerBuilderOptions
 * @property {HTMLDivElement} textLayerDiv - The text layer container.
 * @property {EventBus} eventBus - The application event bus.
 * @property {number} pageIndex - The page index.
 * @property {PageViewport} viewport - The viewport of the text layer.
 * @property {TextHighlighter} highlighter - Optional object that will handle
 *   highlighting text from the find controller.
 * @property {TextAccessibilityManager} [accessibilityManager]
 * @property {boolean} [isOffscreenCanvasSupported] - Allows to use an
 *   OffscreenCanvas if needed.
 */

/**
 * The text layer builder provides text selection functionality for the PDF.
 * It does this by creating overlay divs over the PDF's text. These divs
 * contain text that matches the PDF text they are overlaying.
 */
class TextLayerBuilder {
  constructor({
    eventBus,
    pageIndex,
    viewport,
    highlighter = null,
    accessibilityManager = null,
    isOffscreenCanvasSupported = true,
  }) {
    this.eventBus = eventBus;
    this.textContent = null;
    this.textContentItemsStr = [];
    this.textContentStream = null;
    this.renderingDone = false;
    this.pageNumber = pageIndex + 1;
    this.textDivs = [];
    this.textDivProperties = new WeakMap();
    this.textLayerRenderTask = null;
    this.highlighter = highlighter;
    this.accessibilityManager = accessibilityManager;
    this.isOffscreenCanvasSupported = isOffscreenCanvasSupported;
    this.scale = 0;

    this.div = document.createElement("div");
    this.div.className = "textLayer";
    this.#setDimensions(viewport);
    this.#update(viewport);
  }

  #finishRendering() {
    this.renderingDone = true;

    const endOfContent = document.createElement("div");
    endOfContent.className = "endOfContent";
    this.div.append(endOfContent);

    this.eventBus.dispatch("textlayerrendered", {
      source: this,
      pageNumber: this.pageNumber,
      numTextDivs: this.textDivs.length,
    });

    this.#bindMouse();
  }

  /**
   * Renders the text layer.
   *
   * @param {number} [timeout] - Wait for a specified amount of milliseconds
   *                             before rendering.
   */
  render(viewport, timeout = 0) {
    if (!(this.textContent || this.textContentStream)) {
      return;
    }

    const scale = viewport.scale * (globalThis.devicePixelRatio || 1);

    if (this.renderingDone) {
      this.#update(viewport);
      if (scale !== this.scale) {
        updateTextLayer({
          viewport,
          scale,
          textDivs: this.textDivs,
          textDivProperties: this.textDivProperties,
          isOffscreenCanvasSupported: this.isOffscreenCanvasSupported,
        });
        this.scale = scale;
      }
      this.show();
    } else {
      this.cancel();

      this.highlighter?.setTextMapping(this.textDivs, this.textContentItemsStr);
      this.accessibilityManager?.setTextMapping(this.textDivs);

      const textLayerFrag = document.createDocumentFragment();
      this.textLayerRenderTask = renderTextLayer({
        textContent: this.textContent,
        textContentStream: this.textContentStream,
        container: textLayerFrag,
        viewport,
        textDivs: this.textDivs,
        textDivProperties: this.textDivProperties,
        textContentItemsStr: this.textContentItemsStr,
        isOffscreenCanvasSupported: this.isOffscreenCanvasSupported,
        timeout,
        scale,
      });
      this.textLayerRenderTask.promise.then(
        () => {
          this.div.append(textLayerFrag);
          this.#finishRendering();
          this.highlighter?.enable();
          this.accessibilityManager?.enable();
          this.div.style.display = "";
          this.scale = scale;
          this.show();
        },
        function (reason) {
          // Cancelled or failed to render text layer; skipping errors.
        }
      );
    }
  }

  #setDimensions(viewport) {
    const { div } = this;
    const [pageLLx, pageLLy, pageURx, pageURy] = viewport.viewBox;
    const pageWidth = pageURx - pageLLx;
    const pageHeight = pageURy - pageLLy;
    const { style } = div;

    style.width = `calc(var(--scale-factor) * ${pageWidth}px)`;
    style.height = `calc(var(--scale-factor) * ${pageHeight}px)`;
  }

  #update(viewport) {
    this.div.setAttribute("data-main-rotation", viewport.rotation);
  }

  hide() {
    this.div.setAttribute("hidden", "true");
  }

  show() {
    this.div.removeAttribute("hidden");
  }

  /**
   * Cancel rendering of the text layer.
   */
  cancel() {
    if (this.textLayerRenderTask) {
      this.textLayerRenderTask.cancel();
      this.textLayerRenderTask = null;
    }
    this.highlighter?.disable();
    this.accessibilityManager?.disable();
    this.renderingDone = false;
  }

  setTextContentStream(readableStream) {
    this.cancel();
    this.textContentStream = readableStream;
  }

  setTextContent(textContent) {
    this.cancel();
    this.textContent = textContent;
  }

  /**
   * Improves text selection by adding an additional div where the mouse was
   * clicked. This reduces flickering of the content if the mouse is slowly
   * dragged up or down.
   */
  #bindMouse() {
    const { div } = this;

    div.addEventListener("mousedown", evt => {
      const end = div.querySelector(".endOfContent");
      if (!end) {
        return;
      }
      if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
        // On non-Firefox browsers, the selection will feel better if the height
        // of the `endOfContent` div is adjusted to start at mouse click
        // location. This avoids flickering when the selection moves up.
        // However it does not work when selection is started on empty space.
        let adjustTop = evt.target !== div;
        if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
          adjustTop &&=
            getComputedStyle(end).getPropertyValue("-moz-user-select") !==
            "none";
        }
        if (adjustTop) {
          const divBounds = div.getBoundingClientRect();
          const r = Math.max(0, (evt.pageY - divBounds.top) / divBounds.height);
          end.style.top = (r * 100).toFixed(2) + "%";
        }
      }
      end.classList.add("active");
    });

    div.addEventListener("mouseup", () => {
      const end = div.querySelector(".endOfContent");
      if (!end) {
        return;
      }
      if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
        end.style.top = "";
      }
      end.classList.remove("active");
    });
  }
}

export { TextLayerBuilder };
