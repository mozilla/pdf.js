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

import { getRGB, noContextMenu, shadow, stopEvent } from "pdfjs-lib";

class CommentManager {
  #actions;

  #currentEditor;

  #dialog;

  #deleteMenuItem;

  #editMenuItem;

  #overlayManager;

  #previousText = "";

  #commentText = "";

  #menu;

  #textInput;

  #textView;

  #saveButton;

  #uiManager;

  #prevDragX = Infinity;

  #prevDragY = Infinity;

  #dialogX = 0;

  #dialogY = 0;

  #menuAC = null;

  constructor(
    {
      dialog,
      toolbar,
      actions,
      menu,
      editMenuItem,
      deleteMenuItem,
      closeButton,
      textInput,
      textView,
      cancelButton,
      saveButton,
    },
    overlayManager
  ) {
    this.#actions = actions;
    this.#dialog = dialog;
    this.#editMenuItem = editMenuItem;
    this.#deleteMenuItem = deleteMenuItem;
    this.#menu = menu;
    this.#textInput = textInput;
    this.#textView = textView;
    this.#overlayManager = overlayManager;
    this.#saveButton = saveButton;

    const finishBound = this.#finish.bind(this);
    dialog.addEventListener("close", finishBound);
    dialog.addEventListener("contextmenu", e => {
      if (e.target !== this.#textInput) {
        e.preventDefault();
      }
    });
    cancelButton.addEventListener("click", finishBound);
    closeButton.addEventListener("click", finishBound);
    saveButton.addEventListener("click", this.#save.bind(this));

    this.#makeMenu();
    editMenuItem.addEventListener("click", () => {
      this.#closeMenu();
      this.#edit();
    });
    deleteMenuItem.addEventListener("click", () => {
      this.#closeMenu();
      this.#textInput.value = "";
      this.#currentEditor.comment = null;
      this.#save();
    });

    textInput.addEventListener("input", () => {
      saveButton.disabled = textInput.value === this.#previousText;
      this.#deleteMenuItem.disabled = textInput.value === "";
    });
    textView.addEventListener("dblclick", () => {
      this.#edit();
    });

    // Make the dialog draggable.
    let pointerMoveAC;
    const cancelDrag = () => {
      this.#prevDragX = this.#prevDragY = Infinity;
      this.#dialog.classList.remove("dragging");
      pointerMoveAC?.abort();
      pointerMoveAC = null;
    };
    toolbar.addEventListener("pointerdown", e => {
      const { target, clientX, clientY } = e;
      if (target !== toolbar) {
        return;
      }
      this.#closeMenu();
      this.#prevDragX = clientX;
      this.#prevDragY = clientY;
      pointerMoveAC = new AbortController();
      const { signal } = pointerMoveAC;
      dialog.classList.add("dragging");
      window.addEventListener(
        "pointermove",
        ev => {
          if (this.#prevDragX !== Infinity) {
            const { clientX: x, clientY: y } = ev;
            this.#setPosition(
              this.#dialogX + x - this.#prevDragX,
              this.#dialogY + y - this.#prevDragY
            );
            this.#prevDragX = x;
            this.#prevDragY = y;
            stopEvent(ev);
          }
        },
        { signal }
      );
      window.addEventListener("blur", cancelDrag, { signal });
      stopEvent(e);
    });
    dialog.addEventListener("pointerup", e => {
      if (this.#prevDragX === Infinity) {
        return; // Not dragging.
      }
      cancelDrag();
      stopEvent(e);
    });

    overlayManager.register(dialog);
  }

  #closeMenu() {
    if (!this.#menuAC) {
      return;
    }
    const menu = this.#menu;
    menu.classList.toggle("hidden", true);
    this.#actions.ariaExpanded = "false";
    this.#menuAC.abort();
    this.#menuAC = null;
    if (menu.contains(document.activeElement)) {
      // If the menu is closed while focused, focus the actions button.
      setTimeout(() => {
        if (!this.#dialog.contains(document.activeElement)) {
          this.#actions.focus();
        }
      }, 0);
    }
  }

  #makeMenu() {
    this.#actions.addEventListener("click", e => {
      const closeMenu = this.#closeMenu.bind(this);
      if (this.#menuAC) {
        closeMenu();
        return;
      }

      const menu = this.#menu;
      menu.classList.toggle("hidden", false);
      this.#actions.ariaExpanded = "true";
      this.#menuAC = new AbortController();
      const { signal } = this.#menuAC;
      window.addEventListener(
        "pointerdown",
        ({ target }) => {
          if (target !== this.#actions && !menu.contains(target)) {
            closeMenu();
          }
        },
        { signal }
      );
      window.addEventListener("blur", closeMenu, { signal });
      this.#actions.addEventListener(
        "keydown",
        ({ key }) => {
          switch (key) {
            case "ArrowDown":
            case "Home":
              menu.firstElementChild.focus();
              stopEvent(e);
              break;
            case "ArrowUp":
            case "End":
              menu.lastElementChild.focus();
              stopEvent(e);
              break;
            case "Escape":
              closeMenu();
              stopEvent(e);
          }
        },
        { signal }
      );
    });

    const keyboardListener = e => {
      const { key, target } = e;
      const menu = this.#menu;
      switch (key) {
        case "Escape":
          this.#closeMenu();
          stopEvent(e);
          break;
        case "ArrowDown":
        case "Tab":
          (target.nextElementSibling || menu.firstElementChild).focus();
          stopEvent(e);
          break;
        case "ArrowUp":
        case "ShiftTab":
          (target.previousElementSibling || menu.lastElementChild).focus();
          stopEvent(e);
          break;
        case "Home":
          menu.firstElementChild.focus();
          stopEvent(e);
          break;
        case "End":
          menu.lastElementChild.focus();
          stopEvent(e);
          break;
      }
    };
    for (const menuItem of this.#menu.children) {
      if (menuItem.classList.contains("hidden")) {
        continue; // Skip hidden menu items.
      }
      menuItem.addEventListener("keydown", keyboardListener);
      menuItem.addEventListener("contextmenu", noContextMenu);
    }
    this.#menu.addEventListener("contextmenu", noContextMenu);
  }

  async open(uiManager, editor, position) {
    if (editor) {
      this.#uiManager = uiManager;
      this.#currentEditor = editor;
    }
    const {
      comment: { text, color },
    } = editor;
    this.#dialog.style.setProperty(
      "--dialog-base-color",
      this.#lightenColor(color) || "var(--default-dialog-bg-color)"
    );
    this.#commentText = text || "";
    if (!text) {
      this.#edit();
    } else {
      this.#setText(text);
      this.#textInput.classList.toggle("hidden", true);
      this.#textView.classList.toggle("hidden", false);
      this.#editMenuItem.disabled = this.#deleteMenuItem.disabled = false;
    }
    this.#uiManager.removeEditListeners();
    this.#saveButton.disabled = true;

    const x =
      position.right !== undefined
        ? position.right - this._dialogWidth
        : position.left;
    const y = position.top;
    this.#setPosition(x, y, /* isInitial */ true);

    await this.#overlayManager.open(this.#dialog);
  }

  async #save() {
    this.#currentEditor.comment = this.#textInput.value;
    this.#finish();
  }

  get _dialogWidth() {
    const dialog = this.#dialog;
    const { style } = dialog;
    style.opacity = "0";
    style.display = "block";
    const width = dialog.getBoundingClientRect().width;
    style.opacity = style.display = "";
    return shadow(this, "_dialogWidth", width);
  }

  #lightenColor(color) {
    if (!color) {
      return null; // No color provided.
    }
    const [r, g, b] = getRGB(color);
    const gray = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const ratio = gray < 0.9 ? Math.round((0.9 - gray) * 100) : 0;
    return `color-mix(in srgb, ${ratio}% white, ${color})`;
  }

  #setText(text) {
    const textView = this.#textView;
    for (const line of text.split("\n")) {
      const span = document.createElement("span");
      span.textContent = line;
      textView.append(span, document.createElement("br"));
    }
  }

  #setPosition(x, y, isInitial = false) {
    this.#dialogX = x;
    this.#dialogY = y;
    const { style } = this.#dialog;
    style.left = `${x}px`;
    style.top = isInitial
      ? `calc(${y}px + var(--editor-toolbar-vert-offset))`
      : `${y}px`;
  }

  #edit() {
    const textInput = this.#textInput;
    const textView = this.#textView;
    if (textView.childElementCount > 0) {
      const height = parseFloat(getComputedStyle(textView).height);
      textInput.value = this.#previousText = this.#commentText;
      textInput.style.height = `${height + 20}px`;
    } else {
      textInput.value = this.#previousText = this.#commentText;
    }

    textInput.classList.toggle("hidden", false);
    textView.classList.toggle("hidden", true);
    this.#editMenuItem.disabled = this.#deleteMenuItem.disabled = true;
    setTimeout(() => textInput.focus(), 0);
  }

  #finish() {
    this.#textView.replaceChildren();
    this.#textInput.value = this.#previousText = this.#commentText = "";
    this.#overlayManager.closeIfActive(this.#dialog);
    this.#textInput.style.height = "";
    this.#uiManager?.addEditListeners();
    this.#uiManager = null;
    this.#currentEditor = null;
  }

  destroy() {
    this.#uiManager = null;
    this.#finish();
  }
}

export { CommentManager };
