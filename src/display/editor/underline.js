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
 * Editor to underline some text.
 */
class UnderlineEditor extends TextMarkupEditor {
  static _defaultDrawingOptions = null;

  static _type = "underline";

  static _editorType = AnnotationEditorType.UNDERLINE;

  constructor(params) {
    super({ ...params, name: "underlineEditor" });
    this.defaultL10nId = "pdfjs-editor-underline-editor";
  }

  /** @inheritdoc */
  static get typesMap() {
    return shadow(
      this,
      "typesMap",
      new Map([[AnnotationEditorParamsType.UNDERLINE_COLOR, "fill"]])
    );
  }

  get colorType() {
    return AnnotationEditorParamsType.UNDERLINE_COLOR;
  }

  /** @inheritdoc */
  static _drawBox({ x, y, width, height }, _pageWidth, pageHeight) {
    // Same line as the one of the appearance stream (see `UnderlineAnnotation`
    // in the core layer): 1.3 unit above the bottom and 0.571 unit thick.
    const lineY = y + height - 1.3 / pageHeight;
    const halfWidth = 0.571 / 2 / pageHeight;
    const top = lineY - halfWidth;
    const bottom = lineY + halfWidth;
    return [[x, top, x + width, top, x + width, bottom, x, bottom]];
  }
}

export { UnderlineEditor };
