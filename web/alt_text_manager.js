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

class AltTextManager {
  #boundUpdateUIState = this.#updateUIState.bind(this);

  #boundSetPosition = this.#setPosition.bind(this);

  #currentEditor = null;

  #dialog;

  #eventBus = null;

  #optionDescription;

  #optionDecorative;

  #overlayManager;

  #saveButton;

  #textarea;

  #uiManager;

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
    this.#saveButton = saveButton;
    this.#overlayManager = overlayManager;
    this.#eventBus = eventBus;

    dialog.addEventListener("close", this.#close.bind(this));
    cancelButton.addEventListener("click", this.#finish.bind(this));
    saveButton.addEventListener("click", this.#save.bind(this));
    optionDescription.addEventListener("change", this.#boundUpdateUIState);
    optionDecorative.addEventListener("change", this.#boundUpdateUIState);
    textarea.addEventListener("input", this.#boundUpdateUIState);

    this.#overlayManager.register(dialog);
  }

  async editAltText(uiManager, editor) {
    if (this.#currentEditor || !editor) {
      return;
    }

    const { altText, decorative } = editor.altTextData;
    if (decorative === true) {
      this.#optionDecorative.checked = true;
      this.#optionDescription.checked = false;
    } else {
      this.#optionDecorative.checked = false;
      this.#optionDescription.checked = true;
    }
    this.#textarea.value = altText?.trim() || "";
    this.#updateUIState();

    this.#currentEditor = editor;
    this.#uiManager = uiManager;
    this.#uiManager.removeKeyboardManager();
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
    let top = Math.max(0, y - MARGIN);
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
      left = Math.max(0, x - MARGIN);
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
    if (this.#dialog) {
      this.#overlayManager.close(this.#dialog);
    }
  }

  #close() {
    this.#uiManager?.addKeyboardManager();
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
    this.#currentEditor.altTextData = {
      altText: this.#textarea.value.trim(),
      decorative: this.#optionDecorative.checked,
    };
    this.#finish();
  }

  destroy() {
    this.#currentEditor = null;
    this.#uiManager = null;
    this.#finish();
  }
}

export { AltTextManager };
