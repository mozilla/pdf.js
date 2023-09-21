/* Copyright 2023 Mozilla Foundation
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

import { shadow } from "pdfjs-lib";

class AltTextManager {
  #boundUpdateUIState = this.#updateUIState.bind(this);

  #boundSetPosition = this.#setPosition.bind(this);

  #boundPointerDown = this.#pointerDown.bind(this);

  #currentEditor = null;

  #cancelButton;

  #dialog;

  #eventBus;

  #hasUsedPointer = false;

  #optionDescription;

  #optionDecorative;

  #overlayManager;

  #saveButton;

  #textarea;

  #uiManager;

  #previousAltText = null;

  constructor(
    {
      dialog,
      optionDescription,
      optionDecorative,
      textarea,
      cancelButton,
      saveButton,
    },
    overlayManager,
    eventBus
  ) {
    this.#dialog = dialog;
    this.#optionDescription = optionDescription;
    this.#optionDecorative = optionDecorative;
    this.#textarea = textarea;
    this.#cancelButton = cancelButton;
    this.#saveButton = saveButton;
    this.#overlayManager = overlayManager;
    this.#eventBus = eventBus;

    dialog.addEventListener("close", this.#close.bind(this));
    cancelButton.addEventListener("click", this.#cancel.bind(this));
    saveButton.addEventListener("click", this.#save.bind(this));
    optionDescription.addEventListener("change", this.#boundUpdateUIState);
    optionDecorative.addEventListener("change", this.#boundUpdateUIState);
    textarea.addEventListener("input", this.#boundUpdateUIState);

    this.#overlayManager.register(dialog);
  }

  get _elements() {
    return shadow(this, "_elements", [
      this.#optionDescription,
      this.#optionDecorative,
      this.#textarea,
      this.#saveButton,
      this.#cancelButton,
    ]);
  }

  async editAltText(uiManager, editor) {
    if (this.#currentEditor || !editor) {
      return;
    }

    this.#hasUsedPointer = false;
    for (const element of this._elements) {
      element.addEventListener("pointerdown", this.#boundPointerDown);
    }

    const { altText, decorative } = editor.altTextData;
    if (decorative === true) {
      this.#optionDecorative.checked = true;
      this.#optionDescription.checked = false;
    } else {
      this.#optionDecorative.checked = false;
      this.#optionDescription.checked = true;
    }
    this.#previousAltText = this.#textarea.value = altText?.trim() || "";
    this.#updateUIState();

    this.#currentEditor = editor;
    this.#uiManager = uiManager;
    this.#uiManager.removeEditListeners();
    this.#eventBus._on("resize", this.#boundSetPosition);

    try {
      await this.#overlayManager.open(this.#dialog);
      this.#setPosition();
    } catch (ex) {
      this.#close();
      throw ex;
    }
  }

  #setPosition() {
    if (!this.#currentEditor) {
      return;
    }
    const dialog = this.#dialog;
    const { style } = dialog;
    const { innerWidth: windowW, innerHeight: windowH } = window;
    const { width: dialogW, height: dialogH } = dialog.getBoundingClientRect();
    const { x, y, width, height } = this.#currentEditor.getClientDimensions();
    const MARGIN = 10;
    const isLTR = this.#uiManager.direction === "ltr";

    let left = null;
    let top = y;
    top += Math.min(windowH - (top + dialogH), 0);

    if (isLTR) {
      // Prefer to position the dialog "after" (so on the right) the editor.
      if (x + width + MARGIN + dialogW < windowW) {
        left = x + width + MARGIN;
      } else if (x > dialogW + MARGIN) {
        left = x - dialogW - MARGIN;
      }
    } else if (x > dialogW + MARGIN) {
      left = x - dialogW - MARGIN;
    } else if (x + width + MARGIN + dialogW < windowW) {
      left = x + width + MARGIN;
    }

    if (left === null) {
      top = null;
      left = x;
      left += Math.min(windowW - (left + dialogW), 0);
      if (y > dialogH + MARGIN) {
        top = y - dialogH - MARGIN;
      } else if (y + height + MARGIN + dialogH < windowH) {
        top = y + height + MARGIN;
      }
    }

    if (top !== null) {
      dialog.classList.add("positioned");
      if (isLTR) {
        style.left = `${left}px`;
      } else {
        style.right = `${windowW - left - dialogW}px`;
      }
      style.top = `${top}px`;
    } else {
      dialog.classList.remove("positioned");
      style.left = "";
      style.top = "";
    }
  }

  #finish() {
    if (this.#overlayManager.active === this.#dialog) {
      this.#overlayManager.close(this.#dialog);
    }
  }

  #cancel() {
    this.#eventBus.dispatch("reporttelemetry", {
      source: this,
      details: {
        type: "editing",
        subtype: this.#currentEditor.editorType,
        data: {
          action: "alt_text_cancel",
          alt_text_keyboard: !this.#hasUsedPointer,
        },
      },
    });
    this.#finish();
  }

  #close() {
    this.#removePointerDownListeners();
    this.#uiManager?.addEditListeners();
    this.#eventBus._off("resize", this.#boundSetPosition);
    this.#currentEditor = null;
    this.#uiManager = null;
  }

  #updateUIState() {
    const hasAltText = !!this.#textarea.value.trim();
    const decorative = this.#optionDecorative.checked;

    this.#textarea.disabled = decorative;
    this.#saveButton.disabled = !decorative && !hasAltText;
  }

  #save() {
    const altText = this.#textarea.value.trim();
    const decorative = this.#optionDecorative.checked;
    this.#currentEditor.altTextData = {
      altText,
      decorative,
    };
    this.#eventBus.dispatch("reporttelemetry", {
      source: this,
      details: {
        type: "editing",
        subtype: this.#currentEditor.editorType,
        data: {
          action: "alt_text_save",
          alt_text_description: !!altText,
          alt_text_edit:
            !!this.#previousAltText && this.#previousAltText !== altText,
          alt_text_decorative: decorative,
          alt_text_keyboard: !this.#hasUsedPointer,
        },
      },
    });
    this.#finish();
  }

  #pointerDown() {
    this.#hasUsedPointer = true;
    this.#removePointerDownListeners();
  }

  #removePointerDownListeners() {
    for (const element of this._elements) {
      element.removeEventListener("pointerdown", this.#boundPointerDown);
    }
  }

  destroy() {
    this.#currentEditor = null;
    this.#uiManager = null;
    this.#finish();
  }
}

export { AltTextManager };
