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

import { noContextMenu, stopEvent } from "../display_utils.js";

class Comment {
  #commentStandaloneButton = null;

  #commentToolbarButton = null;

  #commentWasFromKeyBoard = false;

  #editor = null;

  #initialText = null;

  #richText = null;

  #text = null;

  #date = null;

  #deleted = false;

  #popupPosition = null;

  constructor(editor) {
    this.#editor = editor;
  }

  renderForToolbar() {
    const button = (this.#commentToolbarButton =
      document.createElement("button"));
    button.className = "comment";
    return this.#render(button, false);
  }

  renderForStandalone() {
    const button = (this.#commentStandaloneButton =
      document.createElement("button"));
    button.className = "annotationCommentButton";

    const position = this.#editor.commentButtonPosition;
    if (position) {
      const { style } = button;
      style.insetInlineEnd = `calc(${
        100 *
        (this.#editor._uiManager.direction === "ltr"
          ? 1 - position[0]
          : position[0])
      }% - var(--comment-button-dim))`;
      style.top = `calc(${100 * position[1]}% - var(--comment-button-dim))`;
      const color = this.#editor.commentButtonColor;
      if (color) {
        style.backgroundColor = color;
      }
    }

    return this.#render(button, true);
  }

  focusButton() {
    setTimeout(() => {
      (this.#commentStandaloneButton ?? this.#commentToolbarButton)?.focus();
    }, 0);
  }

  onUpdatedColor() {
    if (!this.#commentStandaloneButton) {
      return;
    }
    const color = this.#editor.commentButtonColor;
    if (color) {
      this.#commentStandaloneButton.style.backgroundColor = color;
    }
    this.#editor._uiManager.updatePopupColor(this.#editor);
  }

  get commentButtonWidth() {
    return (
      (this.#commentStandaloneButton?.getBoundingClientRect().width ?? 0) /
      this.#editor.parent.boundingClientRect.width
    );
  }

  get commentPopupPositionInLayer() {
    if (this.#popupPosition) {
      return this.#popupPosition;
    }
    if (!this.#commentStandaloneButton) {
      return null;
    }
    const { x, y, height } =
      this.#commentStandaloneButton.getBoundingClientRect();
    const {
      x: parentX,
      y: parentY,
      width: parentWidth,
      height: parentHeight,
    } = this.#editor.parent.boundingClientRect;
    return [(x - parentX) / parentWidth, (y + height - parentY) / parentHeight];
  }

  set commentPopupPositionInLayer(pos) {
    this.#popupPosition = pos;
  }

  hasDefaultPopupPosition() {
    return this.#popupPosition === null;
  }

  removeStandaloneCommentButton() {
    this.#commentStandaloneButton?.remove();
    this.#commentStandaloneButton = null;
  }

  removeToolbarCommentButton() {
    this.#commentToolbarButton?.remove();
    this.#commentToolbarButton = null;
  }

  setCommentButtonStates({ selected, hasPopup }) {
    if (!this.#commentStandaloneButton) {
      return;
    }
    this.#commentStandaloneButton.classList.toggle("selected", selected);
    this.#commentStandaloneButton.ariaExpanded = hasPopup;
  }

  #render(comment, isStandalone) {
    if (!this.#editor._uiManager.hasCommentManager()) {
      return null;
    }

    comment.tabIndex = "0";
    comment.ariaHasPopup = "dialog";

    if (isStandalone) {
      comment.ariaControls = "commentPopup";
      comment.setAttribute("data-l10n-id", "pdfjs-show-comment-button");
    } else {
      comment.ariaControlsElements = [
        this.#editor._uiManager.getCommentDialogElement(),
      ];
      comment.setAttribute("data-l10n-id", "pdfjs-editor-add-comment-button");
    }

    const signal = this.#editor._uiManager._signal;
    if (!(signal instanceof AbortSignal) || signal.aborted) {
      return comment;
    }

    comment.addEventListener("contextmenu", noContextMenu, { signal });
    if (isStandalone) {
      comment.addEventListener(
        "focusin",
        e => {
          this.#editor._focusEventsAllowed = false;
          stopEvent(e);
        },
        {
          capture: true,
          signal,
        }
      );
      comment.addEventListener(
        "focusout",
        e => {
          this.#editor._focusEventsAllowed = true;
          stopEvent(e);
        },
        {
          capture: true,
          signal,
        }
      );
    }
    comment.addEventListener("pointerdown", event => event.stopPropagation(), {
      signal,
    });

    const onClick = event => {
      event.preventDefault();
      if (comment === this.#commentToolbarButton) {
        this.edit();
      } else {
        this.#editor.toggleComment(/* isSelected = */ true);
      }
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

    comment.addEventListener(
      "pointerenter",
      () => {
        this.#editor.toggleComment(
          /* isSelected = */ false,
          /* visibility = */ true
        );
      },
      { signal }
    );
    comment.addEventListener(
      "pointerleave",
      () => {
        this.#editor.toggleComment(
          /* isSelected = */ false,
          /* visibility = */ false
        );
      },
      { signal }
    );

    return comment;
  }

  edit(options) {
    const position = this.commentPopupPositionInLayer;
    let posX, posY;
    if (position) {
      [posX, posY] = position;
    } else {
      // The position is in the editor coordinates.
      [posX, posY] = this.#editor.commentButtonPosition;
      const { width, height, x, y } = this.#editor;
      posX = x + posX * width;
      posY = y + posY * height;
    }
    const parentDimensions = this.#editor.parent.boundingClientRect;
    const {
      x: parentX,
      y: parentY,
      width: parentWidth,
      height: parentHeight,
    } = parentDimensions;
    this.#editor._uiManager.editComment(
      this.#editor,
      parentX + posX * parentWidth,
      parentY + posY * parentHeight,
      { ...options, parentDimensions }
    );
  }

  finish() {
    if (!this.#commentToolbarButton) {
      return;
    }
    this.#commentToolbarButton.focus({
      focusVisible: this.#commentWasFromKeyBoard,
    });
    this.#commentWasFromKeyBoard = false;
  }

  isDeleted() {
    return this.#deleted || this.#text === "";
  }

  isEmpty() {
    return this.#text === null;
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
      richText: this.#richText,
      date: this.#date,
      deleted: this.isDeleted(),
    };
  }

  /**
   * Set the comment data.
   */
  set data(text) {
    if (text !== this.#text) {
      this.#richText = null;
    }
    if (text === null) {
      this.#text = "";
      this.#deleted = true;
      return;
    }
    this.#text = text;
    this.#date = new Date();
    this.#deleted = false;
  }

  setInitialText(text, richText = null) {
    this.#initialText = text;
    this.data = text;
    this.#date = null;
    this.#richText = richText;
  }

  shown() {}

  destroy() {
    this.#commentToolbarButton?.remove();
    this.#commentToolbarButton = null;
    this.#commentStandaloneButton?.remove();
    this.#commentStandaloneButton = null;
    this.#text = "";
    this.#richText = null;
    this.#date = null;
    this.#editor = null;
    this.#commentWasFromKeyBoard = false;
    this.#deleted = false;
  }
}

export { Comment };
