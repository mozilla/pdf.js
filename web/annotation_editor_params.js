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

/** @typedef {import("./event_utils.js").EventBus} EventBus */

import {
  AnnotationEditorParamsType,
  FeatureTest,
  getRGBA,
  Util,
} from "pdfjs-lib";
import { internalOpt } from "./internal_evt.js";

/**
 * @typedef {Object} AnnotationEditorParamsOptions
 * @property {HTMLInputElement} editorFreeTextFontSize
 * @property {HTMLInputElement} editorFreeTextColor
 * @property {HTMLSelectElement} editorFreeTextFontFamily
 * @property {HTMLButtonElement} editorFreeTextBold
 * @property {HTMLButtonElement} editorFreeTextItalic
 * @property {HTMLButtonElement} editorFreeTextUnderline
 * @property {NodeListOf<HTMLButtonElement>} editorFreeTextAlignments
 * @property {HTMLInputElement} editorInkColor
 * @property {HTMLInputElement} editorInkThickness
 * @property {HTMLInputElement} editorInkOpacity
 * @property {HTMLButtonElement} editorStampAddImage
 * @property {NodeListOf<HTMLButtonElement>} editorStampChoices
 * @property {HTMLInputElement} editorFreeHighlightThickness
 * @property {HTMLButtonElement} editorHighlightShowAll
 * @property {HTMLButtonElement} editorSignatureAddSignature
 */

class AnnotationEditorParams {
  /**
   * @param {AnnotationEditorParamsOptions} options
   * @param {EventBus} eventBus
   */
  constructor(options, eventBus) {
    this.eventBus = eventBus;
    this.#bindListeners(options);
  }

  /**
   * @param {AnnotationEditorParamsOptions} options
   */
  #bindListeners({
    editorFreeTextFontSize,
    editorFreeTextColor,
    editorFreeTextFontFamily,
    editorFreeTextBold,
    editorFreeTextItalic,
    editorFreeTextUnderline,
    editorFreeTextAlignments,
    editorInkColor,
    editorInkThickness,
    editorInkOpacity,
    editorStampAddImage,
    editorStampChoices,
    editorFreeHighlightThickness,
    editorHighlightShowAll,
    editorSignatureAddSignature,
  }) {
    const { eventBus } = this;

    const dispatchEvent = (typeStr, value) => {
      eventBus.dispatch("switchannotationeditorparams", {
        source: this,
        type: AnnotationEditorParamsType[typeStr],
        value,
      });
    };
    editorFreeTextFontSize.addEventListener("input", function () {
      dispatchEvent("FREETEXT_SIZE", this.valueAsNumber);
    });
    editorFreeTextColor.addEventListener("input", function () {
      dispatchEvent("FREETEXT_COLOR", this.value);
    });
    editorFreeTextFontFamily.addEventListener("input", function () {
      dispatchEvent("FREETEXT_FONT_FAMILY", this.value);
    });
    const bindTextToggle = (button, type) => {
      button.addEventListener("click", function () {
        const selected = this.getAttribute("aria-pressed") !== "true";
        this.setAttribute("aria-pressed", selected);
        dispatchEvent(type, selected);
      });
    };
    bindTextToggle(editorFreeTextBold, "FREETEXT_BOLD");
    bindTextToggle(editorFreeTextItalic, "FREETEXT_ITALIC");
    bindTextToggle(editorFreeTextUnderline, "FREETEXT_UNDERLINE");
    for (const button of editorFreeTextAlignments) {
      button.addEventListener("click", function () {
        for (const choice of editorFreeTextAlignments) {
          choice.setAttribute("aria-pressed", choice === this);
        }
        dispatchEvent("FREETEXT_ALIGNMENT", this.dataset.alignment);
      });
    }

    // Handlers for INK_COLOR and INK_OPACITY sync-back, set up differently
    // depending on whether alpha is supported.
    let updateInkColor, updateInkOpacity;

    if (FeatureTest.isAlphaColorInputSupported) {
      // Enable alpha on the color input and remove the now-redundant opacity
      // slider from the DOM.
      editorInkColor.setAttribute("alpha", "");
      editorInkOpacity.closest(".editorParamsSetter").remove();

      // Track last-known color/opacity so that sync-back events for either
      // property can reconstruct the full #RRGGBBAA without re-parsing the
      // input's current (format-varying) value.
      let currentInkColor = "#000000";
      let currentInkOpacity = 1;

      editorInkColor.addEventListener("input", function () {
        // The returned value format varies by browser; normalize it.
        const rgba = getRGBA(this.value);
        if (!rgba) {
          return;
        }
        const [r, g, b, opacity] = rgba;
        const hex = Util.makeHexColor(r, g, b);
        currentInkColor = hex;
        currentInkOpacity = opacity;
        dispatchEvent("INK_COLOR_AND_OPACITY", { color: hex, opacity });
      });

      updateInkColor = value => {
        currentInkColor = value;
        const alphaHex = Util.hexNums[Math.round(currentInkOpacity * 255)];
        editorInkColor.value = currentInkColor + alphaHex;
      };
      updateInkOpacity = value => {
        currentInkOpacity = value;
        const alphaHex = Util.hexNums[Math.round(currentInkOpacity * 255)];
        editorInkColor.value = currentInkColor + alphaHex;
      };
    } else {
      editorInkColor.addEventListener("input", function () {
        dispatchEvent("INK_COLOR", this.value);
      });
      editorInkOpacity.addEventListener("input", function () {
        dispatchEvent("INK_OPACITY", this.valueAsNumber);
      });

      updateInkColor = value => {
        editorInkColor.value = value;
      };
      updateInkOpacity = value => {
        editorInkOpacity.value = value;
      };
    }

    editorInkThickness.addEventListener("input", function () {
      dispatchEvent("INK_THICKNESS", this.valueAsNumber);
    });
    const setStampChoiceSelected = (button, selected) => {
      for (const choice of editorStampChoices) {
        choice.setAttribute("aria-pressed", choice === button && selected);
      }
      dispatchEvent(
        "STAMP_IMAGE",
        selected
          ? {
              altText: button.dataset.stampAlt,
              bitmapUrl: new URL(button.dataset.stampSrc, document.baseURI)
                .href,
              initialWidth: Number(button.dataset.stampWidth),
            }
          : null
      );
    };
    editorStampAddImage.addEventListener("click", () => {
      setStampChoiceSelected(null, false);
      eventBus.dispatch("reporttelemetry", {
        source: this,
        details: {
          type: "editing",
          data: { action: "pdfjs.image.add_image_click" },
        },
      });
      dispatchEvent("CREATE");
    });
    for (const choice of editorStampChoices) {
      choice.addEventListener("click", function () {
        const selected = this.getAttribute("aria-pressed") !== "true";
        setStampChoiceSelected(this, selected);
      });
    }
    editorFreeHighlightThickness.addEventListener("input", function () {
      dispatchEvent("HIGHLIGHT_THICKNESS", this.valueAsNumber);
    });
    editorHighlightShowAll.addEventListener("click", function () {
      const checked = this.getAttribute("aria-pressed") === "true";
      this.setAttribute("aria-pressed", !checked);
      dispatchEvent("HIGHLIGHT_SHOW_ALL", !checked);
    });
    editorSignatureAddSignature.addEventListener("click", () => {
      dispatchEvent("CREATE");
    });

    eventBus.on(
      "annotationeditorparamschanged",
      evt => {
        for (const [type, value] of evt.details) {
          switch (type) {
            case AnnotationEditorParamsType.FREETEXT_SIZE:
              editorFreeTextFontSize.value = value;
              break;
            case AnnotationEditorParamsType.FREETEXT_COLOR:
              editorFreeTextColor.value = value;
              break;
            case AnnotationEditorParamsType.FREETEXT_FONT_FAMILY:
              editorFreeTextFontFamily.value = value;
              break;
            case AnnotationEditorParamsType.FREETEXT_BOLD:
              editorFreeTextBold.setAttribute("aria-pressed", value);
              break;
            case AnnotationEditorParamsType.FREETEXT_ITALIC:
              editorFreeTextItalic.setAttribute("aria-pressed", value);
              break;
            case AnnotationEditorParamsType.FREETEXT_UNDERLINE:
              editorFreeTextUnderline.setAttribute("aria-pressed", value);
              break;
            case AnnotationEditorParamsType.FREETEXT_ALIGNMENT:
              for (const choice of editorFreeTextAlignments) {
                choice.setAttribute(
                  "aria-pressed",
                  choice.dataset.alignment === value
                );
              }
              break;
            case AnnotationEditorParamsType.INK_COLOR:
              updateInkColor(value);
              break;
            case AnnotationEditorParamsType.INK_THICKNESS:
              editorInkThickness.value = value;
              break;
            case AnnotationEditorParamsType.INK_OPACITY:
              updateInkOpacity(value);
              break;
            case AnnotationEditorParamsType.HIGHLIGHT_COLOR:
              eventBus.dispatch("mainhighlightcolorpickerupdatecolor", {
                source: this,
                value,
              });
              break;
            case AnnotationEditorParamsType.HIGHLIGHT_THICKNESS:
              editorFreeHighlightThickness.value = value;
              break;
            case AnnotationEditorParamsType.HIGHLIGHT_FREE:
              editorFreeHighlightThickness.disabled = !value;
              break;
            case AnnotationEditorParamsType.HIGHLIGHT_SHOW_ALL:
              editorHighlightShowAll.setAttribute("aria-pressed", value);
              break;
          }
        }
      },
      internalOpt
    );
  }
}

export { AnnotationEditorParams };
