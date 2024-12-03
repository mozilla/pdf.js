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
  #altText = null;

  #altTextDecorative = false;

  #altTextButton = null;

  #altTextButtonLabel = null;

  #altTextTooltip = null;

  #altTextTooltipTimeout = null;

  #altTextWasFromKeyBoard = false;

  #badge = null;

  #editor = null;

  #guessedText = null;

  #textWithDisclaimer = null;

  #useNewAltTextFlow = false;

  static #l10nNewButton = null;

  static _l10n = null;

  constructor(editor) {
    this.#editor = editor;
    this.#useNewAltTextFlow = editor._uiManager.useNewAltTextFlow;

    AltText.#l10nNewButton ||= Object.freeze({
      added: "pdfjs-editor-new-alt-text-added-button",
      "added-label": "pdfjs-editor-new-alt-text-added-button-label",
      missing: "pdfjs-editor-new-alt-text-missing-button",
      "missing-label": "pdfjs-editor-new-alt-text-missing-button-label",
      review: "pdfjs-editor-new-alt-text-to-review-button",
      "review-label": "pdfjs-editor-new-alt-text-to-review-button-label",
    });
  }

  static initialize(l10n) {
    AltText._l10n ??= l10n;
  }

  async render() {
    const altText = (this.#altTextButton = document.createElement("button"));
    altText.className = "altText";
    altText.tabIndex = "0";

    const label = (this.#altTextButtonLabel = document.createElement("span"));
    altText.append(label);

    if (this.#useNewAltTextFlow) {
      altText.classList.add("new");
      altText.setAttribute("data-l10n-id", AltText.#l10nNewButton.missing);
      label.setAttribute(
        "data-l10n-id",
        AltText.#l10nNewButton["missing-label"]
      );
    } else {
      altText.setAttribute("data-l10n-id", "pdfjs-editor-alt-text-button");
      label.setAttribute("data-l10n-id", "pdfjs-editor-alt-text-button-label");
    }

    const signal = this.#editor._uiManager._signal;
    altText.addEventListener("contextmenu", noContextMenu, { signal });
    altText.addEventListener("pointerdown", event => event.stopPropagation(), {
      signal,
    });

    const onClick = event => {
      event.preventDefault();
      this.#editor._uiManager.editAltText(this.#editor);
      if (this.#useNewAltTextFlow) {
        this.#editor._reportTelemetry({
          action: "pdfjs.image.alt_text.image_status_label_clicked",
          data: { label: this.#label },
        });
      }
    };
    altText.addEventListener("click", onClick, { capture: true, signal });
    altText.addEventListener(
      "keydown",
      event => {
        if (event.target === altText && event.key === "Enter") {
          this.#altTextWasFromKeyBoard = true;
          onClick(event);
        }
      },
      { signal }
    );
    await this.#setState();

    return altText;
  }

  get #label() {
    return (
      (this.#altText && "added") ||
      (this.#altText === null && this.guessedText && "review") ||
      "missing"
    );
  }

  finish() {
    if (!this.#altTextButton) {
      return;
    }
    this.#altTextButton.focus({ focusVisible: this.#altTextWasFromKeyBoard });
    this.#altTextWasFromKeyBoard = false;
  }

  isEmpty() {
    if (this.#useNewAltTextFlow) {
      return this.#altText === null;
    }
    return !this.#altText && !this.#altTextDecorative;
  }

  hasData() {
    if (this.#useNewAltTextFlow) {
      return this.#altText !== null || !!this.#guessedText;
    }
    return this.isEmpty();
  }

  get guessedText() {
    return this.#guessedText;
  }

  async setGuessedText(guessedText) {
    if (this.#altText !== null) {
      // The user provided their own alt text, so we don't want to overwrite it.
      return;
    }
    this.#guessedText = guessedText;
    this.#textWithDisclaimer = await AltText._l10n.get(
      "pdfjs-editor-new-alt-text-generated-alt-text-with-disclaimer",
      { generatedAltText: guessedText }
    );
    this.#setState();
  }

  toggleAltTextBadge(visibility = false) {
    if (!this.#useNewAltTextFlow || this.#altText) {
      this.#badge?.remove();
      this.#badge = null;
      return;
    }
    if (!this.#badge) {
      const badge = (this.#badge = document.createElement("div"));
      badge.className = "noAltTextBadge";
      this.#editor.div.append(badge);
    }
    this.#badge.classList.toggle("hidden", !visibility);
  }

  serialize(isForCopying) {
    let altText = this.#altText;
    if (!isForCopying && this.#guessedText === altText) {
      altText = this.#textWithDisclaimer;
    }
    return {
      altText,
      decorative: this.#altTextDecorative,
      guessedText: this.#guessedText,
      textWithDisclaimer: this.#textWithDisclaimer,
    };
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
  set data({
    altText,
    decorative,
    guessedText,
    textWithDisclaimer,
    cancel = false,
  }) {
    if (guessedText) {
      this.#guessedText = guessedText;
      this.#textWithDisclaimer = textWithDisclaimer;
    }
    if (this.#altText === altText && this.#altTextDecorative === decorative) {
      return;
    }
    if (!cancel) {
      this.#altText = altText;
      this.#altTextDecorative = decorative;
    }
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

  shown() {
    this.#editor._reportTelemetry({
      action: "pdfjs.image.alt_text.image_status_label_displayed",
      data: { label: this.#label },
    });
  }

  destroy() {
    this.#altTextButton?.remove();
    this.#altTextButton = null;
    this.#altTextButtonLabel = null;
    this.#altTextTooltip = null;
    this.#badge?.remove();
    this.#badge = null;
  }

  async #setState() {
    const button = this.#altTextButton;
    if (!button) {
      return;
    }

    if (this.#useNewAltTextFlow) {
      button.classList.toggle("done", !!this.#altText);
      button.setAttribute("data-l10n-id", AltText.#l10nNewButton[this.#label]);

      this.#altTextButtonLabel?.setAttribute(
        "data-l10n-id",
        AltText.#l10nNewButton[`${this.#label}-label`]
      );
      if (!this.#altText) {
        this.#altTextTooltip?.remove();
        return;
      }
    } else {
      if (!this.#altText && !this.#altTextDecorative) {
        button.classList.remove("done");
        this.#altTextTooltip?.remove();
        return;
      }
      button.classList.add("done");
      button.setAttribute("data-l10n-id", "pdfjs-editor-alt-text-edit-button");
    }

    let tooltip = this.#altTextTooltip;
    if (!tooltip) {
      this.#altTextTooltip = tooltip = document.createElement("span");
      tooltip.className = "tooltip";
      tooltip.setAttribute("role", "tooltip");
      tooltip.id = `alt-text-tooltip-${this.#editor.id}`;

      const DELAY_TO_SHOW_TOOLTIP = 100;
      const signal = this.#editor._uiManager._signal;
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(this.#altTextTooltipTimeout);
          this.#altTextTooltipTimeout = null;
        },
        { once: true }
      );
      button.addEventListener(
        "mouseenter",
        () => {
          this.#altTextTooltipTimeout = setTimeout(() => {
            this.#altTextTooltipTimeout = null;
            this.#altTextTooltip.classList.add("show");
            this.#editor._reportTelemetry({
              action: "alt_text_tooltip",
            });
          }, DELAY_TO_SHOW_TOOLTIP);
        },
        { signal }
      );
      button.addEventListener(
        "mouseleave",
        () => {
          if (this.#altTextTooltipTimeout) {
            clearTimeout(this.#altTextTooltipTimeout);
            this.#altTextTooltipTimeout = null;
          }
          this.#altTextTooltip?.classList.remove("show");
        },
        { signal }
      );
    }
    if (this.#altTextDecorative) {
      tooltip.setAttribute(
        "data-l10n-id",
        "pdfjs-editor-alt-text-decorative-tooltip"
      );
    } else {
      tooltip.removeAttribute("data-l10n-id");
      tooltip.textContent = this.#altText;
    }

    if (!tooltip.parentNode) {
      button.append(tooltip);
    }

    const element = this.#editor.getImageForAltText();
    element?.setAttribute("aria-describedby", tooltip.id);
  }
}

export { AltText };
