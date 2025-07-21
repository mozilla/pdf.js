/* Copyright 2025 Mozilla Foundation
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

class Comment {
  #commentButton = null;

  #commentWasFromKeyBoard = false;

  #editor = null;

  #initialText = null;

  #text = null;

  #date = null;

  #deleted = false;

  constructor(editor) {
    this.#editor = editor;
    this.toolbar = null;
  }

  render() {
    if (!this.#editor._uiManager.hasCommentManager()) {
      return null;
    }
    const comment = (this.#commentButton = document.createElement("button"));
    comment.className = "comment";
    comment.tabIndex = "0";
    comment.setAttribute("data-l10n-id", "pdfjs-editor-edit-comment-button");

    const signal = this.#editor._uiManager._signal;
    comment.addEventListener("contextmenu", noContextMenu, { signal });
    comment.addEventListener("pointerdown", event => event.stopPropagation(), {
      signal,
    });

    const onClick = event => {
      event.preventDefault();
      this.edit();
    };
    comment.addEventListener("click", onClick, { capture: true, signal });
    comment.addEventListener(
      "keydown",
      event => {
        if (event.target === comment && event.key === "Enter") {
          this.#commentWasFromKeyBoard = true;
          onClick(event);
        }
      },
      { signal }
    );

    return comment;
  }

  edit() {
    const { bottom, left, right } = this.#editor.getClientDimensions();
    const position = { top: bottom };
    if (this.#editor._uiManager.direction === "ltr") {
      position.right = right;
    } else {
      position.left = left;
    }
    this.#editor._uiManager.editComment(this.#editor, position);
  }

  finish() {
    if (!this.#commentButton) {
      return;
    }
    this.#commentButton.focus({ focusVisible: this.#commentWasFromKeyBoard });
    this.#commentWasFromKeyBoard = false;
  }

  isDeleted() {
    return this.#deleted || this.#text === "";
  }

  hasBeenEdited() {
    return this.isDeleted() || this.#text !== this.#initialText;
  }

  serialize() {
    return this.data;
  }

  get data() {
    return {
      text: this.#text,
      date: this.#date,
      deleted: this.#deleted,
    };
  }

  /**
   * Set the comment data.
   */
  set data(text) {
    if (text === null) {
      this.#text = "";
      this.#deleted = true;
      return;
    }
    this.#text = text;
    this.#date = new Date();
    this.#deleted = false;
  }

  setInitialText(text) {
    this.#initialText = text;
    this.data = text;
  }

  toggle(enabled = false) {
    if (!this.#commentButton) {
      return;
    }
    this.#commentButton.disabled = !enabled;
  }

  shown() {}

  destroy() {
    this.#commentButton?.remove();
    this.#commentButton = null;
    this.#text = "";
    this.#date = null;
    this.#editor = null;
    this.#commentWasFromKeyBoard = false;
    this.#deleted = false;
  }
}

export { Comment };
