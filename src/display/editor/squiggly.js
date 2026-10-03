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

import {
  AnnotationEditorParamsType,
  AnnotationEditorType,
  shadow,
} from "../../shared/util.js";
import { TextMarkupEditor } from "./text_markup.js";

/**
 * Editor to underline some text with a squiggly line.
 */
class SquigglyEditor extends TextMarkupEditor {
  static _defaultDrawingOptions = null;

  static _type = "squiggly";

  static _editorType = AnnotationEditorType.SQUIGGLY;

  constructor(params) {
    super({ ...params, name: "squigglyEditor" });
    this.defaultL10nId = "pdfjs-editor-squiggly-editor";
  }

  /** @inheritdoc */
  static get typesMap() {
    return shadow(
      this,
      "typesMap",
      new Map([[AnnotationEditorParamsType.SQUIGGLY_COLOR, "fill"]])
    );
  }

  get colorType() {
    return AnnotationEditorParamsType.SQUIGGLY_COLOR;
  }

  /** @inheritdoc */
  static _drawBox({ x, y, width, height }, pageWidth, pageHeight) {
    // Same zigzag as the one of the appearance stream (see
    // `SquigglyAnnotation` in the core layer): a step of 2 units, an amplitude
    // of a sixth of the text height and 1 unit thick.
    const bottom = y + height;
    const dy = height / 6;
    const step = 2 / pageWidth;
    const halfWidth = 0.5 / pageHeight;
    const xEnd = x + width;

    const points = [x, bottom - dy];
    let shift = dy;
    let px = x;
    do {
      px += step;
      shift = shift === 0 ? dy : 0;
      points.push(Math.min(px, xEnd), bottom - shift);
    } while (px < xEnd);

    // Thicken the zigzag in going forward on its top edge and backward on its
    // bottom one.
    const polygon = [];
    for (let i = 0, ii = points.length; i < ii; i += 2) {
      polygon.push(points[i], points[i + 1] - halfWidth);
    }
    for (let i = points.length - 2; i >= 0; i -= 2) {
      polygon.push(points[i], points[i + 1] + halfWidth);
    }
    return [polygon];
  }
}

export { SquigglyEditor };
