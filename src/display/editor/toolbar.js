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

class EditorToolbar {
  #toolbar = null;

  #editor;

  #buttons = null;

  constructor(editor) {
    this.#editor = editor;
  }

  render() {
    const editToolbar = (this.#toolbar = document.createElement("div"));
    editToolbar.className = "editToolbar";
    editToolbar.addEventListener("contextmenu", noContextMenu);
    editToolbar.addEventListener("pointerdown", EditorToolbar.#pointerDown);

    const buttons = (this.#buttons = document.createElement("div"));
    buttons.className = "buttons";
    editToolbar.append(buttons);

    this.#addDeleteButton();

    return editToolbar;
  }

  static #pointerDown(e) {
    e.stopPropagation();
  }

  #focusIn(e) {
    this.#editor._focusEventsAllowed = false;
    e.preventDefault();
    e.stopPropagation();
  }

  #focusOut(e) {
    this.#editor._focusEventsAllowed = true;
    e.preventDefault();
    e.stopPropagation();
  }

  #addListenersToElement(element) {
    // If we're clicking on a button with the keyboard or with
    // the mouse, we don't want to trigger any focus events on
    // the editor.
    element.addEventListener("focusin", this.#focusIn.bind(this), {
      capture: true,
    });
    element.addEventListener("focusout", this.#focusOut.bind(this), {
      capture: true,
    });
    element.addEventListener("contextmenu", noContextMenu);
  }

  hide() {
    this.#toolbar.classList.add("hidden");
  }

  show() {
    this.#toolbar.classList.remove("hidden");
  }

  #addDeleteButton() {
    const button = document.createElement("button");
    button.className = "delete";
    button.tabIndex = 0;
    this.#addListenersToElement(button);
    button.addEventListener("click", e => {
      this.#editor._uiManager.delete();
    });
    this.#buttons.append(button);
  }

  remove() {
    this.#toolbar.remove();
  }
}

export { EditorToolbar };
