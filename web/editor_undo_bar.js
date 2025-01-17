/* Copyright 2024 Mozilla Foundation
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

import { noContextMenu } from "pdfjs-lib";

class EditorUndoBar {
  #closeButton = null;

  #container;

  #eventBus = null;

  #focusTimeout = null;

  #initController = null;

  isOpen = false;

  #message;

  #showController = null;

  #undoButton;

  static #l10nMessages = Object.freeze({
    highlight: "pdfjs-editor-undo-bar-message-highlight",
    freetext: "pdfjs-editor-undo-bar-message-freetext",
    stamp: "pdfjs-editor-undo-bar-message-stamp",
    ink: "pdfjs-editor-undo-bar-message-ink",
    signature: "pdfjs-editor-undo-bar-message-signature",
    _multiple: "pdfjs-editor-undo-bar-message-multiple",
  });

  constructor({ container, message, undoButton, closeButton }, eventBus) {
    this.#container = container;
    this.#message = message;
    this.#undoButton = undoButton;
    this.#closeButton = closeButton;
    this.#eventBus = eventBus;
  }

  destroy() {
    this.#initController?.abort();
    this.#initController = null;

    this.hide();
  }

  show(undoAction, messageData) {
    if (!this.#initController) {
      this.#initController = new AbortController();
      const opts = { signal: this.#initController.signal };
      const boundHide = this.hide.bind(this);

      this.#container.addEventListener("contextmenu", noContextMenu, opts);
      this.#closeButton.addEventListener("click", boundHide, opts);
      this.#eventBus._on("beforeprint", boundHide, opts);
      this.#eventBus._on("download", boundHide, opts);
    }

    this.hide();

    if (typeof messageData === "string") {
      this.#message.setAttribute(
        "data-l10n-id",
        EditorUndoBar.#l10nMessages[messageData]
      );
    } else {
      this.#message.setAttribute(
        "data-l10n-id",
        EditorUndoBar.#l10nMessages._multiple
      );
      this.#message.setAttribute(
        "data-l10n-args",
        JSON.stringify({ count: messageData })
      );
    }
    this.isOpen = true;
    this.#container.hidden = false;

    this.#showController = new AbortController();

    this.#undoButton.addEventListener(
      "click",
      () => {
        undoAction();
        this.hide();
      },
      { signal: this.#showController.signal }
    );

    // Without the setTimeout, VoiceOver will read out the document title
    // instead of the popup label.
    this.#focusTimeout = setTimeout(() => {
      this.#container.focus();
      this.#focusTimeout = null;
    }, 100);
  }

  hide() {
    if (!this.isOpen) {
      return;
    }
    this.isOpen = false;
    this.#container.hidden = true;

    this.#showController?.abort();
    this.#showController = null;

    if (this.#focusTimeout) {
      clearTimeout(this.#focusTimeout);
      this.#focusTimeout = null;
    }
  }
}

export { EditorUndoBar };
