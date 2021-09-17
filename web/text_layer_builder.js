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
/** @typedef {import("./interfaces").IPDFTextLayerFactory} IPDFTextLayerFactory */

import { renderTextLayer } from "pdfjs-lib";

const EXPAND_DIVS_TIMEOUT = 300; // ms

/**
 * @typedef {Object} TextLayerBuilderOptions
 * @property {HTMLDivElement} textLayerDiv - The text layer container.
 * @property {EventBus} eventBus - The application event bus.
 * @property {number} pageIndex - The page index.
 * @property {PageViewport} viewport - The viewport of the text layer.
 * @property {TextHighlighter} highlighter - Optional object that will handle
 *   highlighting text from the find controller.
 * @property {boolean} enhanceTextSelection - Option to turn on improved
 *   text selection.
 */

/**
 * The text layer builder provides text selection functionality for the PDF.
 * It does this by creating overlay divs over the PDF's text. These divs
 * contain text that matches the PDF text they are overlaying.
 */
class TextLayerBuilder {
  constructor({
    textLayerDiv,
    eventBus,
    pageIndex,
    viewport,
    highlighter = null,
    enhanceTextSelection = false,
  }) {
    this.textLayerDiv = textLayerDiv;
    this.eventBus = eventBus;
    this.textContent = null;
    this.textContentItemsStr = [];
    this.textContentStream = null;
    this.renderingDone = false;
    this.pageNumber = pageIndex + 1;
    this.viewport = viewport;
    this.textDivs = [];
    this.textLayerRenderTask = null;
    this.highlighter = highlighter;
    this.enhanceTextSelection = enhanceTextSelection;

    this._bindMouse();
  }

  /**
   * @private
   */
  _finishRendering() {
    this.renderingDone = true;

    if (!this.enhanceTextSelection) {
      const endOfContent = document.createElement("div");
      endOfContent.className = "endOfContent";
      this.textLayerDiv.appendChild(endOfContent);
    }

    this.eventBus.dispatch("textlayerrendered", {
      source: this,
      pageNumber: this.pageNumber,
      numTextDivs: this.textDivs.length,
    });
  }

  /**
   * Renders the text layer.
   *
   * @param {number} [timeout] - Wait for a specified amount of milliseconds
   *                             before rendering.
   */
  render(timeout = 0) {
    if (!(this.textContent || this.textContentStream) || this.renderingDone) {
      return;
    }
    this.cancel();

    this.textDivs.length = 0;
    this.highlighter?.setTextMapping(this.textDivs, this.textContentItemsStr);

    const textLayerFrag = document.createDocumentFragment();
    this.textLayerRenderTask = renderTextLayer({
      textContent: this.textContent,
      textContentStream: this.textContentStream,
      container: textLayerFrag,
      viewport: this.viewport,
      textDivs: this.textDivs,
      textContentItemsStr: this.textContentItemsStr,
      timeout,
      enhanceTextSelection: this.enhanceTextSelection,
    });
    this.textLayerRenderTask.promise.then(
      () => {
        this.textLayerDiv.appendChild(textLayerFrag);
        this._finishRendering();
        this.highlighter?.enable();
      },
      function (reason) {
        // Cancelled or failed to render text layer; skipping errors.
      }
    );
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
   *
   * @private
   */
  _bindMouse() {
    const div = this.textLayerDiv;
    let expandDivsTimer = null;

    div.addEventListener("mousedown", evt => {
      if (this.enhanceTextSelection && this.textLayerRenderTask) {
        this.textLayerRenderTask.expandTextDivs(true);
        if (
          (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) &&
          expandDivsTimer
        ) {
          clearTimeout(expandDivsTimer);
          expandDivsTimer = null;
        }
        return;
      }

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
          adjustTop =
            adjustTop &&
            window
              .getComputedStyle(end)
              .getPropertyValue("-moz-user-select") !== "none";
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
      if (this.enhanceTextSelection && this.textLayerRenderTask) {
        if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
          expandDivsTimer = setTimeout(() => {
            if (this.textLayerRenderTask) {
              this.textLayerRenderTask.expandTextDivs(false);
            }
            expandDivsTimer = null;
          }, EXPAND_DIVS_TIMEOUT);
        } else {
          this.textLayerRenderTask.expandTextDivs(false);
        }
        return;
      }

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

/**
 * @implements IPDFTextLayerFactory
 */
class DefaultTextLayerFactory {
  /**
   * @param {HTMLDivElement} textLayerDiv
   * @param {number} pageIndex
   * @param {PageViewport} viewport
   * @param {boolean} enhanceTextSelection
   * @param {EventBus} eventBus
   * @param {TextHighlighter} highlighter
   * @returns {TextLayerBuilder}
   */
  createTextLayerBuilder(
    textLayerDiv,
    pageIndex,
    viewport,
    enhanceTextSelection = false,
    eventBus,
    highlighter
  ) {
    return new TextLayerBuilder({
      textLayerDiv,
      pageIndex,
      viewport,
      enhanceTextSelection,
      eventBus,
      highlighter,
    });
  }
}

export { DefaultTextLayerFactory, TextLayerBuilder };
