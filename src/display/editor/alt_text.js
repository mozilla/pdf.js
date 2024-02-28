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

import { noContextMenu } from "../display_utils.js";

class AltText {
  #altText = "";

  #altTextDecorative = false;

  #altTextButton = null;

  #altTextTooltip = null;

  #altTextTooltipTimeout = null;

  #altTextWasFromKeyBoard = false;

  #editor = null;

  static _l10nPromise = null;

  constructor(editor) {
    this.#editor = editor;
  }

  static initialize(l10nPromise) {
    AltText._l10nPromise ||= l10nPromise;
  }

  async render() {
    const altText = (this.#altTextButton = document.createElement("button"));
    altText.className = "altText";
    const msg = await AltText._l10nPromise.get(
      "pdfjs-editor-alt-text-button-label"
    );
    altText.textContent = msg;
    altText.setAttribute("aria-label", msg);
    altText.tabIndex = "0";
    altText.addEventListener("contextmenu", noContextMenu);
    altText.addEventListener("pointerdown", event => event.stopPropagation());

    const onClick = event => {
      event.preventDefault();
      this.#editor._uiManager.editAltText(this.#editor);
    };
    altText.addEventListener("click", onClick, { capture: true });
    altText.addEventListener("keydown", event => {
      if (event.target === altText && event.key === "Enter") {
        this.#altTextWasFromKeyBoard = true;
        onClick(event);
      }
    });
    await this.#setState();

    return altText;
  }

  finish() {
    if (!this.#altTextButton) {
      return;
    }
    this.#altTextButton.focus({ focusVisible: this.#altTextWasFromKeyBoard });
    this.#altTextWasFromKeyBoard = false;
  }

  isEmpty() {
    return !this.#altText && !this.#altTextDecorative;
  }

  get data() {
    return {
      altText: this.#altText,
      decorative: this.#altTextDecorative,
    };
  }

  /**
   * Set the alt text data.
   */
  set data({ altText, decorative }) {
    if (this.#altText === altText && this.#altTextDecorative === decorative) {
      return;
    }
    this.#altText = altText;
    this.#altTextDecorative = decorative;
    this.#setState();
  }

  toggle(enabled = false) {
    if (!this.#altTextButton) {
      return;
    }
    if (!enabled && this.#altTextTooltipTimeout) {
      clearTimeout(this.#altTextTooltipTimeout);
      this.#altTextTooltipTimeout = null;
    }
    this.#altTextButton.disabled = !enabled;
  }

  destroy() {
    this.#altTextButton?.remove();
    this.#altTextButton = null;
    this.#altTextTooltip = null;
  }

  async #setState() {
    const button = this.#altTextButton;
    if (!button) {
      return;
    }
    if (!this.#altText && !this.#altTextDecorative) {
      button.classList.remove("done");
      this.#altTextTooltip?.remove();
      return;
    }
    button.classList.add("done");

    AltText._l10nPromise
      .get("pdfjs-editor-alt-text-edit-button-label")
      .then(msg => {
        button.setAttribute("aria-label", msg);
      });
    let tooltip = this.#altTextTooltip;
    if (!tooltip) {
      this.#altTextTooltip = tooltip = document.createElement("span");
      tooltip.className = "tooltip";
      tooltip.setAttribute("role", "tooltip");
      const id = (tooltip.id = `alt-text-tooltip-${this.#editor.id}`);
      button.setAttribute("aria-describedby", id);

      const DELAY_TO_SHOW_TOOLTIP = 100;
      button.addEventListener("mouseenter", () => {
        this.#altTextTooltipTimeout = setTimeout(() => {
          this.#altTextTooltipTimeout = null;
          this.#altTextTooltip.classList.add("show");
          this.#editor._reportTelemetry({
            action: "alt_text_tooltip",
          });
        }, DELAY_TO_SHOW_TOOLTIP);
      });
      button.addEventListener("mouseleave", () => {
        if (this.#altTextTooltipTimeout) {
          clearTimeout(this.#altTextTooltipTimeout);
          this.#altTextTooltipTimeout = null;
        }
        this.#altTextTooltip?.classList.remove("show");
      });
    }
    tooltip.innerText = this.#altTextDecorative
      ? await AltText._l10nPromise.get(
          "pdfjs-editor-alt-text-decorative-tooltip"
        )
      : this.#altText;

    if (!tooltip.parentNode) {
      button.append(tooltip);
    }

    const element = this.#editor.getImageForAltText();
    element?.setAttribute("aria-describedby", tooltip.id);
  }
}

export { AltText };
