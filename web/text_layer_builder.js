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
/** @typedef {import("../src/display/api").TextContent} TextContent */
/** @typedef {import("./text_highlighter").TextHighlighter} TextHighlighter */
// eslint-disable-next-line max-len
/** @typedef {import("./text_accessibility.js").TextAccessibilityManager} TextAccessibilityManager */

import { normalizeUnicode, renderTextLayer, updateTextLayer } from "pdfjs-lib";
import { removeNullCharacters } from "./ui_utils.js";

/**
 * @typedef {Object} TextLayerBuilderOptions
 * @property {TextHighlighter} highlighter - Optional object that will handle
 *   highlighting text from the find controller.
 * @property {TextAccessibilityManager} [accessibilityManager]
 * @property {function} [onAppend]
 */

/**
 * The text layer builder provides text selection functionality for the PDF.
 * It does this by creating overlay divs over the PDF's text. These divs
 * contain text that matches the PDF text they are overlaying.
 */
class TextLayerBuilder {
  #enablePermissions = false;

  #onAppend = null;

  #rotation = 0;

  #scale = 0;

  #textContentSource = null;

  static #textLayers = new Map();

  static #selectionChangeAbortController = null;

  constructor({
    highlighter = null,
    accessibilityManager = null,
    enablePermissions = false,
    onAppend = null,
  }) {
    this.textContentItemsStr = [];
    this.renderingDone = false;
    this.textDivs = [];
    this.textDivProperties = new WeakMap();
    this.textLayerRenderTask = null;
    this.highlighter = highlighter;
    this.accessibilityManager = accessibilityManager;
    this.#enablePermissions = enablePermissions === true;
    this.#onAppend = onAppend;

    this.div = document.createElement("div");
    this.div.tabIndex = 0;
    this.div.className = "textLayer";
  }

  #finishRendering() {
    this.renderingDone = true;

    const endOfContent = document.createElement("div");
    endOfContent.className = "endOfContent";
    this.div.append(endOfContent);

    this.#bindMouse(endOfContent);
  }

  get numTextDivs() {
    return this.textDivs.length;
  }

  /**
   * Renders the text layer.
   * @param {PageViewport} viewport
   */
  async render(viewport) {
    if (!this.#textContentSource) {
      throw new Error('No "textContentSource" parameter specified.');
    }

    const scale = viewport.scale * (globalThis.devicePixelRatio || 1);
    const { rotation } = viewport;
    if (this.renderingDone) {
      const mustRotate = rotation !== this.#rotation;
      const mustRescale = scale !== this.#scale;
      if (mustRotate || mustRescale) {
        this.hide();
        updateTextLayer({
          container: this.div,
          viewport,
          textDivs: this.textDivs,
          textDivProperties: this.textDivProperties,
          mustRescale,
          mustRotate,
        });
        this.#scale = scale;
        this.#rotation = rotation;
      }
      this.show();
      return;
    }

    this.cancel();
    this.highlighter?.setTextMapping(this.textDivs, this.textContentItemsStr);
    this.accessibilityManager?.setTextMapping(this.textDivs);

    this.textLayerRenderTask = renderTextLayer({
      textContentSource: this.#textContentSource,
      container: this.div,
      viewport,
      textDivs: this.textDivs,
      textDivProperties: this.textDivProperties,
      textContentItemsStr: this.textContentItemsStr,
    });

    await this.textLayerRenderTask.promise;
    this.#finishRendering();
    this.#scale = scale;
    this.#rotation = rotation;
    // Ensure that the textLayer is appended to the DOM *before* handling
    // e.g. a pending search operation.
    this.#onAppend?.(this.div);
    this.highlighter?.enable();
    this.accessibilityManager?.enable();
  }

  hide() {
    if (!this.div.hidden && this.renderingDone) {
      // We turn off the highlighter in order to avoid to scroll into view an
      // element of the text layer which could be hidden.
      this.highlighter?.disable();
      this.div.hidden = true;
    }
  }

  show() {
    if (this.div.hidden && this.renderingDone) {
      this.div.hidden = false;
      this.highlighter?.enable();
    }
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
    this.textContentItemsStr.length = 0;
    this.textDivs.length = 0;
    this.textDivProperties = new WeakMap();
    TextLayerBuilder.#removeGlobalSelectionListener(this.div);
  }

  /**
   * @param {ReadableStream | TextContent} source
   */
  setTextContentSource(source) {
    this.cancel();
    this.#textContentSource = source;
  }

  /**
   * Improves text selection by adding an additional div where the mouse was
   * clicked. This reduces flickering of the content if the mouse is slowly
   * dragged up or down.
   */
  #bindMouse(end) {
    const { div } = this;

    div.addEventListener("mousedown", evt => {
      end.classList.add("active");
    });

    div.addEventListener("copy", event => {
      if (!this.#enablePermissions) {
        const selection = document.getSelection();
        event.clipboardData.setData(
          "text/plain",
          removeNullCharacters(normalizeUnicode(selection.toString()))
        );
      }
      event.preventDefault();
      event.stopPropagation();
    });

    TextLayerBuilder.#textLayers.set(div, end);
    TextLayerBuilder.#enableGlobalSelectionListener();
  }

  static #removeGlobalSelectionListener(textLayerDiv) {
    this.#textLayers.delete(textLayerDiv);

    if (this.#textLayers.size === 0) {
      this.#selectionChangeAbortController?.abort();
      this.#selectionChangeAbortController = null;
    }
  }

  static #enableGlobalSelectionListener() {
    if (TextLayerBuilder.#selectionChangeAbortController) {
      // document-level event listeners already installed
      return;
    }
    TextLayerBuilder.#selectionChangeAbortController = new AbortController();

    const reset = (end, textLayer) => {
      if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
        textLayer.append(end);
        end.style.width = "";
        end.style.height = "";
      }
      end.classList.remove("active");
    };

    document.addEventListener(
      "pointerup",
      () => {
        TextLayerBuilder.#textLayers.forEach(reset);
      },
      { signal: TextLayerBuilder.#selectionChangeAbortController.signal }
    );

    if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
      // eslint-disable-next-line no-var
      var isFirefox, prevRange;
    }

    document.addEventListener(
      "selectionchange",
      () => {
        const selection = document.getSelection();
        if (selection.rangeCount === 0) {
          TextLayerBuilder.#textLayers.forEach(reset);
          return;
        }

        // Even though the spec says that .rangeCount should be 0 or 1, Firefox
        // creates multiple ranges when selecting across multiple pages.
        // Make sure to collect all the .textLayer elements where the selection
        // is happening.
        const activeTextLayers = new Set();
        for (let i = 0; i < selection.rangeCount; i++) {
          const range = selection.getRangeAt(i);
          for (const textLayerDiv of TextLayerBuilder.#textLayers.keys()) {
            if (
              !activeTextLayers.has(textLayerDiv) &&
              range.intersectsNode(textLayerDiv)
            ) {
              activeTextLayers.add(textLayerDiv);
            }
          }
        }

        for (const [textLayerDiv, endDiv] of TextLayerBuilder.#textLayers) {
          if (activeTextLayers.has(textLayerDiv)) {
            endDiv.classList.add("active");
          } else {
            reset(endDiv, textLayerDiv);
          }
        }

        if (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) {
          if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("CHROME")) {
            isFirefox = false;
          } else {
            isFirefox ??=
              getComputedStyle(
                TextLayerBuilder.#textLayers.values().next().value
              ).getPropertyValue("-moz-user-select") === "none";
          }

          if (!isFirefox) {
            // In non-Firefox browsers, when hovering over an empty space (thus,
            // on .endOfContent), the selection will expand to cover all the
            // text between the current selection and .endOfContent. By moving
            // .endOfContent to right after (or before, depending on which side
            // of the selection the user is moving), we limit the selection jump
            // to at most cover the enteirety of the <span> where the selection
            // is being modified.
            const range = selection.getRangeAt(0);
            const modifyStart =
              prevRange &&
              (range.compareBoundaryPoints(Range.END_TO_END, prevRange) === 0 ||
                range.compareBoundaryPoints(Range.START_TO_END, prevRange) ===
                  0);
            let anchor = modifyStart
              ? range.startContainer
              : range.endContainer;
            if (anchor.nodeType === Node.TEXT_NODE) {
              anchor = anchor.parentNode;
            }

            const parentTextLayer = anchor.parentElement.closest(".textLayer");
            const endDiv = TextLayerBuilder.#textLayers.get(parentTextLayer);
            if (endDiv) {
              endDiv.style.width = parentTextLayer.style.width;
              endDiv.style.height = parentTextLayer.style.height;
              anchor.parentElement.insertBefore(
                endDiv,
                modifyStart ? anchor : anchor.nextSibling
              );
            }

            prevRange = range.cloneRange();
          }
        }
      },
      { signal: TextLayerBuilder.#selectionChangeAbortController.signal }
    );
  }
}

export { TextLayerBuilder };
