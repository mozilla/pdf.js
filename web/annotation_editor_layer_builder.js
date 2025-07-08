/* Copyright 2022 Mozilla Foundation
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

/** @typedef {import("../src/display/api").PDFPageProxy} PDFPageProxy */
// eslint-disable-next-line max-len
/** @typedef {import("../src/display/display_utils").PageViewport} PageViewport */
// eslint-disable-next-line max-len
/** @typedef {import("../src/display/editor/tools.js").AnnotationEditorUIManager} AnnotationEditorUIManager */
// eslint-disable-next-line max-len
/** @typedef {import("./text_accessibility.js").TextAccessibilityManager} TextAccessibilityManager */
/** @typedef {import("./interfaces").IL10n} IL10n */
// eslint-disable-next-line max-len
/** @typedef {import("../src/display/annotation_layer.js").AnnotationLayer} AnnotationLayer */
// eslint-disable-next-line max-len
/** @typedef {import("../src/display/struct_tree_layer_builder.js").StructTreeLayerBuilder} StructTreeLayerBuilder */

import { AnnotationEditorLayer } from "pdfjs-lib";
import { GenericL10n } from "web-null_l10n";

/**
 * @typedef {Object} AnnotationEditorLayerBuilderOptions
 * @property {AnnotationEditorUIManager} [uiManager]
 * @property {PDFPageProxy} pdfPage
 * @property {IL10n} [l10n]
 * @property {StructTreeLayerBuilder} [structTreeLayer]
 * @property {TextAccessibilityManager} [accessibilityManager]
 * @property {AnnotationLayer} [annotationLayer]
 * @property {TextLayer} [textLayer]
 * @property {DrawLayer} [drawLayer]
 * @property {function} [onAppend]
 */

/**
 * @typedef {Object} AnnotationEditorLayerBuilderRenderOptions
 * @property {PageViewport} viewport
 * @property {string} [intent] - The default value is "display".
 */

class AnnotationEditorLayerBuilder {
  #annotationLayer = null;

  #drawLayer = null;

  #onAppend = null;

  #structTreeLayer = null;

  #textLayer = null;

  #uiManager;

  /**
   * @param {AnnotationEditorLayerBuilderOptions} options
   */
  constructor(options) {
    this.pdfPage = options.pdfPage;
    this.accessibilityManager = options.accessibilityManager;
    this.l10n = options.l10n;
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
      this.l10n ||= new GenericL10n();
    }
    this.annotationEditorLayer = null;
    this.div = null;
    this._cancelled = false;
    this.#uiManager = options.uiManager;
    this.#annotationLayer = options.annotationLayer || null;
    this.#textLayer = options.textLayer || null;
    this.#drawLayer = options.drawLayer || null;
    this.#onAppend = options.onAppend || null;
    this.#structTreeLayer = options.structTreeLayer || null;
  }

  /**
   * @param {AnnotationEditorLayerBuilderRenderOptions} options
   * @returns {Promise<void>}
   */
  async render({ viewport, intent = "display" }) {
    if (intent !== "display") {
      return;
    }

    if (this._cancelled) {
      return;
    }

    const clonedViewport = viewport.clone({ dontFlip: true });
    if (this.div) {
      this.annotationEditorLayer.update({ viewport: clonedViewport });
      this.show();
      return;
    }

    // Create an AnnotationEditor layer div
    const div = (this.div = document.createElement("div"));
    div.className = "annotationEditorLayer";
    div.hidden = true;
    div.dir = this.#uiManager.direction;
    this.#onAppend?.(div);

    this.annotationEditorLayer = new AnnotationEditorLayer({
      uiManager: this.#uiManager,
      div,
      structTreeLayer: this.#structTreeLayer,
      accessibilityManager: this.accessibilityManager,
      pageIndex: this.pdfPage.pageNumber - 1,
      l10n: this.l10n,
      viewport: clonedViewport,
      annotationLayer: this.#annotationLayer,
      textLayer: this.#textLayer,
      drawLayer: this.#drawLayer,
    });

    const parameters = {
      viewport: clonedViewport,
      div,
      annotations: null,
      intent,
    };

    this.annotationEditorLayer.render(parameters);
    this.show();
  }

  cancel() {
    this._cancelled = true;

    if (!this.div) {
      return;
    }
    this.annotationEditorLayer.destroy();
  }

  hide() {
    if (!this.div) {
      return;
    }
    this.annotationEditorLayer.pause(/* on */ true);
    this.div.hidden = true;
  }

  show() {
    if (!this.div || this.annotationEditorLayer.isInvisible) {
      return;
    }
    this.div.hidden = false;
    this.annotationEditorLayer.pause(/* on */ false);
  }
}

export { AnnotationEditorLayerBuilder };

// === STRAIGHT LINE DRAWING FEATURE FOR ANNOTATION EDITOR ===

// 1. Find or create the annotation editor layer (where we overlay our canvas)
const editorLayer = document.querySelector(".annotationEditorLayer");
if (editorLayer) {
  // 2. Create a canvas overlay if it doesn't exist
  let canvas = document.getElementById("annotation-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "annotation-canvas";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.width = editorLayer.offsetWidth;
    canvas.height = editorLayer.offsetHeight;
    canvas.style.pointerEvents = "auto";
    editorLayer.appendChild(canvas);
  }

  const ctx = canvas.getContext("2d");
  let drawing = false;
  let startX = 0, startY = 0, currentX = 0, currentY = 0;

  // 3. Start drawing when mouse is pressed
  canvas.addEventListener("mousedown", function (event) {
    drawing = true;
    startX = event.offsetX;
    startY = event.offsetY;
    currentX = startX;
    currentY = startY;
  });

  // 4. Draw a preview line as the mouse moves
  canvas.addEventListener("mousemove", function (event) {
    if (!drawing) return;

    // Clear previous preview
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let x = event.offsetX;
    let y = event.offsetY;

    // If Shift is held, snap to straight lines (horizontal, vertical, or 45-degree)
    if (event.shiftKey) {
      const dx = x - startX;
      const dy = y - startY;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      if (Math.abs(angle) < 22.5 || Math.abs(angle) > 157.5) {
        // Horizontal
        y = startY;
      } else if (Math.abs(angle) > 67.5 && Math.abs(angle) < 112.5) {
        // Vertical
        x = startX;
      } else {
        // 45-degree
        const signX = dx >= 0 ? 1 : -1;
        const signY = dy >= 0 ? 1 : -1;
        const len = Math.min(Math.abs(dx), Math.abs(dy));
        x = startX + signX * len;
        y = startY + signY * len;
      }
    }

    currentX = x;
    currentY = y;

    // Draw the preview line
    ctx.strokeStyle = "black";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(currentX, currentY);
    ctx.stroke();
  });

  // 5. Finish drawing when mouse is released
  canvas.addEventListener("mouseup", function () {
    if (!drawing) return;
    drawing = false;

    // Draw the final line
    ctx.strokeStyle = "black";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(currentX, currentY);
    ctx.stroke();

    // TODO: Save the annotation to your data model here if needed
  });

  // 6. Cancel drawing if mouse leaves the canvas
  canvas.addEventListener("mouseleave", function () {
    if (drawing) {
      drawing = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  });
}
