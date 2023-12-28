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

import { DOMSVGFactory, shadow } from "pdfjs-lib";

class AltTextManager {
  #boundUpdateUIState = this.#updateUIState.bind(this);

  #boundSetPosition = this.#setPosition.bind(this);

  #boundOnClick = this.#onClick.bind(this);

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

  #svgElement = null;

  #rectElement = null;

  #container;

  #telemetryData = null;

  constructor(
    {
      dialog,
      optionDescription,
      optionDecorative,
      textarea,
      cancelButton,
      saveButton,
    },
    container,
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
    this.#container = container;

    dialog.addEventListener("close", this.#close.bind(this));
    dialog.addEventListener("contextmenu", event => {
      if (event.target !== this.#textarea) {
        event.preventDefault();
      }
    });
    cancelButton.addEventListener("click", this.#finish.bind(this));
    saveButton.addEventListener("click", this.#save.bind(this));
    optionDescription.addEventListener("change", this.#boundUpdateUIState);
    optionDecorative.addEventListener("change", this.#boundUpdateUIState);

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

  #createSVGElement() {
    if (this.#svgElement) {
      return;
    }

    // We create a mask to add to the dialog backdrop: the idea is to have a
    // darken background everywhere except on the editor to clearly see the
    // picture to describe.

    const svgFactory = new DOMSVGFactory();
    const svg = (this.#svgElement = svgFactory.createElement("svg"));
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    const defs = svgFactory.createElement("defs");
    svg.append(defs);
    const mask = svgFactory.createElement("mask");
    defs.append(mask);
    mask.setAttribute("id", "alttext-manager-mask");
    mask.setAttribute("maskContentUnits", "objectBoundingBox");
    let rect = svgFactory.createElement("rect");
    mask.append(rect);
    rect.setAttribute("fill", "white");
    rect.setAttribute("width", "1");
    rect.setAttribute("height", "1");
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");

    rect = this.#rectElement = svgFactory.createElement("rect");
    mask.append(rect);
    rect.setAttribute("fill", "black");
    this.#dialog.append(svg);
  }

  async editAltText(uiManager, editor) {
    if (this.#currentEditor || !editor) {
      return;
    }

    this.#createSVGElement();

    this.#hasUsedPointer = false;
    for (const element of this._elements) {
      element.addEventListener("click", this.#boundOnClick);
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
    const {
      x: containerX,
      y: containerY,
      width: containerW,
      height: containerH,
    } = this.#container.getBoundingClientRect();
    const { innerWidth: windowW, innerHeight: windowH } = window;
    const { width: dialogW, height: dialogH } = dialog.getBoundingClientRect();
    const { x, y, width, height } = this.#currentEditor.getClientDimensions();
    const MARGIN = 10;
    const isLTR = this.#uiManager.direction === "ltr";

    const xs = Math.max(x, containerX);
    const xe = Math.min(x + width, containerX + containerW);
    const ys = Math.max(y, containerY);
    const ye = Math.min(y + height, containerY + containerH);
    this.#rectElement.setAttribute("width", `${(xe - xs) / windowW}`);
    this.#rectElement.setAttribute("height", `${(ye - ys) / windowH}`);
    this.#rectElement.setAttribute("x", `${xs / windowW}`);
    this.#rectElement.setAttribute("y", `${ys / windowH}`);

    let left = null;
    let top = Math.max(y, 0);
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
      left = Math.max(x, 0);
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

  #close() {
    this.#eventBus.dispatch("reporttelemetry", {
      source: this,
      details: {
        type: "editing",
        subtype: this.#currentEditor.editorType,
        data: this.#telemetryData || {
          action: "alt_text_cancel",
          alt_text_keyboard: !this.#hasUsedPointer,
        },
      },
    });
    this.#telemetryData = null;

    this.#removeOnClickListeners();
    this.#uiManager?.addEditListeners();
    this.#eventBus._off("resize", this.#boundSetPosition);
    this.#currentEditor.altTextFinish();
    this.#currentEditor = null;
    this.#uiManager = null;
  }

  #updateUIState() {
    this.#textarea.disabled = this.#optionDecorative.checked;
  }

  #save() {
    const altText = this.#textarea.value.trim();
    const decorative = this.#optionDecorative.checked;
    this.#currentEditor.altTextData = {
      altText,
      decorative,
    };
    this.#telemetryData = {
      action: "alt_text_save",
      alt_text_description: !!altText,
      alt_text_edit:
        !!this.#previousAltText && this.#previousAltText !== altText,
      alt_text_decorative: decorative,
      alt_text_keyboard: !this.#hasUsedPointer,
    };
    this.#finish();
  }

  #onClick(evt) {
    if (evt.detail === 0) {
      return; // The keyboard was used.
    }
    this.#hasUsedPointer = true;
    this.#removeOnClickListeners();
  }

  #removeOnClickListeners() {
    for (const element of this._elements) {
      element.removeEventListener("click", this.#boundOnClick);
    }
  }

  destroy() {
    this.#uiManager = null; // Avoid re-adding the edit listeners.
    this.#finish();
    this.#svgElement?.remove();
    this.#svgElement = this.#rectElement = null;
  }
}

export { AltTextManager };
