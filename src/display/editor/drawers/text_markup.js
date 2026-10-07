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

import { HighlightOutline } from "./highlight.js";
import { Outline } from "./outline.js";

/**
 * Outline of a text markup (underline, squiggly or strikeout).
 * The markup itself is made of some thin shapes drawn along the text boxes,
 * whereas the clipping area (used to interact with the editor) and the focus
 * outline are the ones of the text boxes, exactly like for a highlight.
 */
class TextMarkupOutline extends Outline {
  #path;

  #textOutline;

  /**
   * @param {Array<object>} boxes - The boxes of the selected text, in the page
   *   coordinate system normalized to [0, 1] (the origin is the top-left
   *   corner).
   * @param {Array<number>} pageDimensions - The page dimensions in PDF units.
   * @param {boolean} isLTR
   * @param {Function} drawBox - A function returning, for a text box, the
   *   polygons (as flat arrays of normalized page coordinates) to fill.
   */
  constructor(boxes, [pageWidth, pageHeight], isLTR, drawBox) {
    super();
    const textOutline = (this.#textOutline = HighlightOutline.build(
      boxes,
      isLTR
    ));
    this.focusOutline = textOutline.focusOutline;
    this.firstPoint = textOutline.firstPoint;
    this.lastPoint = textOutline.lastPoint;

    // The shapes are drawn in the box coordinate system. They aren't clamped
    // since they can slightly overflow the text boxes (e.g. the bottom of a
    // squiggly line): the SVG element doesn't clip its content (see
    // draw_layer_builder.css).
    const [x, y, width, height] = textOutline.box;
    const buffer = [];
    for (const box of boxes) {
      for (const polygon of drawBox(box, pageWidth, pageHeight)) {
        for (let i = 0, ii = polygon.length; i < ii; i += 2) {
          const px = (polygon[i] - x) / width;
          const py = (polygon[i + 1] - y) / height;
          buffer.push(`${i === 0 ? "M" : "L"}${px} ${py}`);
        }
        buffer.push("Z");
      }
    }
    this.#path = buffer.join(" ");
  }

  get isFree() {
    return false;
  }

  /** @inheritdoc */
  get defaultSVGProperties() {
    return {
      bbox: this.box,
      root: {
        viewBox: "0 0 1 1",
      },
      rootClass: {
        textMarkup: true,
      },
      path: {
        d: this.toSVGPath(),
      },
      clipPath: {
        d: this.#textOutline.toSVGPath(),
      },
    };
  }

  /** @inheritdoc */
  getFocusSVGProperties(rotation) {
    return this.#textOutline.getFocusSVGProperties(rotation);
  }

  /** @inheritdoc */
  updateRotation(rotation) {
    return { root: { "data-main-rotation": rotation } };
  }

  /** @inheritdoc */
  serializeQuadPoints(pageTranslation, pageDimensions) {
    return this.#textOutline.serializeQuadPoints(
      pageTranslation,
      pageDimensions
    );
  }

  /** @inheritdoc */
  serialize(_bbox, _rotation) {
    // The appearance is built from the quadPoints.
    return null;
  }

  toSVGPath() {
    return this.#path;
  }

  get box() {
    return this.#textOutline.box;
  }
}

export { TextMarkupOutline };
