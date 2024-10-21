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

import { AnnotationEditorType } from "../src/shared/util.js";

class EditorUndoBar {
  #container;

  #controller = null;

  isOpen = false;

  #message;

  #undoButton;

  static #l10nMessages = Object.freeze({
    highlight: "pdfjs-editor-undo-bar-message-highlight",
    freetext: "pdfjs-editor-undo-bar-message-freetext",
    stamp: "pdfjs-editor-undo-bar-message-stamp",
    ink: "pdfjs-editor-undo-bar-message-ink",
    _multiple: "pdfjs-editor-undo-bar-message-multiple",
  });

  constructor({ container, message, undoButton, closeButton }, eventBus) {
    this.#container = container;
    this.#message = message;
    this.#undoButton = undoButton;

    // Caveat: we have to pick between registering these everytime the bar is
    // shown and not having the ability to cleanup using AbortController.
    const boundHide = this.hide.bind(this);
    closeButton.addEventListener("click", boundHide);
    eventBus._on("beforeprint", boundHide);
    eventBus._on("download", boundHide);
    eventBus._on("secondarytoolbaraction", boundHide);
    eventBus._on("annotationeditormodechanged", ({ mode }) => {
      if (mode === AnnotationEditorType.NONE) {
        this.hide();
      }
    })
  }

  show(undoAction, messageData) {
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

    this.#controller = new AbortController();

    this.#undoButton.addEventListener(
      "click",
      () => {
        undoAction();
        this.hide();
      },
      { signal: this.#controller.signal }
    );
    this.#undoButton.focus();
  }

  hide() {
    if (!this.isOpen) {
      return;
    }
    this.isOpen = false;
    this.#container.hidden = true;
    this.#controller?.abort();
    this.#controller = null;
  }
}

export { EditorUndoBar };
