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

import { AnnotationEditorParamsType } from "pdfjs-lib";

class AnnotationEditorParams {
  /**
   * @param {AnnotationEditorParamsOptions} options
   * @param {EventBus} eventBus
   */
  constructor(options, eventBus) {
    this.eventBus = eventBus;
    this.#bindListeners(options);
  }

  #bindListeners({
    editorFreeTextFontSize,
    editorFreeTextColor,
    editorInkColor,
    editorInkThickness,
    editorInkOpacity,
  }) {
    editorFreeTextFontSize.addEventListener("input", evt => {
      this.eventBus.dispatch("switchannotationeditorparams", {
        source: this,
        type: AnnotationEditorParamsType.FREETEXT_SIZE,
        value: editorFreeTextFontSize.valueAsNumber,
      });
    });
    editorFreeTextColor.addEventListener("input", evt => {
      this.eventBus.dispatch("switchannotationeditorparams", {
        source: this,
        type: AnnotationEditorParamsType.FREETEXT_COLOR,
        value: editorFreeTextColor.value,
      });
    });
    editorInkColor.addEventListener("input", evt => {
      this.eventBus.dispatch("switchannotationeditorparams", {
        source: this,
        type: AnnotationEditorParamsType.INK_COLOR,
        value: editorInkColor.value,
      });
    });
    editorInkThickness.addEventListener("input", evt => {
      this.eventBus.dispatch("switchannotationeditorparams", {
        source: this,
        type: AnnotationEditorParamsType.INK_THICKNESS,
        value: editorInkThickness.valueAsNumber,
      });
    });
    editorInkOpacity.addEventListener("input", evt => {
      this.eventBus.dispatch("switchannotationeditorparams", {
        source: this,
        type: AnnotationEditorParamsType.INK_OPACITY,
        value: editorInkOpacity.valueAsNumber,
      });
    });

    this.eventBus._on("annotationeditorparamschanged", evt => {
      for (const [type, value] of evt.details) {
        switch (type) {
          case AnnotationEditorParamsType.FREETEXT_SIZE:
            editorFreeTextFontSize.value = value;
            break;
          case AnnotationEditorParamsType.FREETEXT_COLOR:
            editorFreeTextColor.value = value;
            break;
          case AnnotationEditorParamsType.INK_COLOR:
            editorInkColor.value = value;
            break;
          case AnnotationEditorParamsType.INK_THICKNESS:
            editorInkThickness.value = value;
            break;
          case AnnotationEditorParamsType.INK_OPACITY:
            editorInkOpacity.value = value;
            break;
        }
      }
    });
  }
}

export { AnnotationEditorParams };
