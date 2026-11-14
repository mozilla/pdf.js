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

import {
  clientRectToLayerLeftBottom,
  getUnrotatedSize,
  layerFractionToClientPoint,
  noContextMenu,
  stopEvent,
} from "../dom_utils.js";

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
    if (!this.#commentStandaloneButton) {
      return 0;
    }
    const rotation = this.#editor.parentRotation;
    const [buttonWidth] = getUnrotatedSize(
      this.#commentStandaloneButton.getBoundingClientRect(),
      rotation
    );
    const [parentWidth] = getUnrotatedSize(
      this.#editor.parent.boundingClientRect,
      rotation
    );
    return buttonWidth / parentWidth;
  }

  get commentPopupPositionInLayer() {
    if (this.#popupPosition) {
      return this.#popupPosition;
    }
    if (!this.#commentStandaloneButton) {
      return null;
    }
    // The position is relative to the layer, which can be rotated.
    return clientRectToLayerLeftBottom(
      this.#commentStandaloneButton.getBoundingClientRect(),
      this.#editor.parent.boundingClientRect,
      this.#editor.parentRotation
    );
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
    const parentDimensions = this.#editor.parent.boundingClientRect;
    let posX, posY;
    const position = this.#popupPosition;
    if (position) {
      [posX, posY] = layerFractionToClientPoint(
        position[0],
        position[1],
        parentDimensions,
        this.#editor.parentRotation
      );
    } else if (this.#commentStandaloneButton) {
      // The dialog isn't rotated, hence it's anchored to the bottom-left corner
      // of the button as it's displayed.
      const { x, y, height } =
        this.#commentStandaloneButton.getBoundingClientRect();
      posX = x;
      posY = y + height;
    } else {
      // The position is in the editor coordinates.
      [posX, posY] = this.#editor.commentButtonPosition;
      const { width, height, x, y } = this.#editor;
      [posX, posY] = layerFractionToClientPoint(
        x + posX * width,
        y + posY * height,
        parentDimensions,
        this.#editor.parentRotation
      );
    }
    this.#editor._uiManager.editComment(this.#editor, posX, posY, {
      ...options,
      parentDimensions,
    });
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

  /**
   * Restore the comment data (used for undo).
   * @param {object} data - The comment data to restore.
   * @param {string} data.text - The comment text.
   * @param {string|null} data.richText - The rich text content.
   * @param {Date|null} data.date - The original date.
   */
  restoreData({ text, richText, date }) {
    this.#text = text;
    this.#richText = richText;
    this.#date = date;
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
