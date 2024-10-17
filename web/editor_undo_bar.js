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

class EditorUndoBar {
  #container;

  #controller = null;

  isOpen = false;

  #message;

  #undoButton;

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
  }

  show(action, type) {
    this.hide();
    this.#message.setAttribute("data-l10n-args", JSON.stringify({ type }));
    this.#container.hidden = false;
    this.isOpen = true;

    this.#controller = new AbortController();
    const opts = { signal: this.#controller.signal };

    this.#undoButton.addEventListener(
      "click",
      () => {
        action();
        this.hide();
      },
      opts
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
