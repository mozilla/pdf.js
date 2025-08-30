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
  AnnotationEditorType,
  changeLightness,
  getRGB,
  noContextMenu,
  PDFDateString,
  shadow,
  stopEvent,
} from "pdfjs-lib";
import { binarySearchFirstItem } from "./ui_utils.js";

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

  #sidebar;

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
    sidebar,
    eventBus,
    linkService,
    overlayManager
  ) {
    this.#actions = actions;
    this.#dialog = dialog;
    this.#editMenuItem = editMenuItem;
    this.#deleteMenuItem = deleteMenuItem;
    this.#menu = menu;
    this.#sidebar = new CommentSidebar(sidebar, eventBus, linkService);
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

  setSidebarUiManager(uiManager) {
    this.#sidebar.setUIManager(uiManager);
  }

  showSidebar(annotations) {
    this.#sidebar.show(annotations);
  }

  hideSidebar() {
    this.#sidebar.hide();
  }

  removeComments(ids) {
    this.#sidebar.removeComments(ids);
  }

  selectComment(id) {
    this.#sidebar.selectComment(null, id);
  }

  addComment(annotation) {
    this.#sidebar.addComment(annotation);
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

  #renderActionsButton(visible) {
    this.#actions.classList.toggle("hidden", !visible);
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
      this.#renderActionsButton(false);
      this.#edit();
    } else {
      this.#renderActionsButton(true);
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
    return changeLightness(r, g, b);
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
    this.#editMenuItem.disabled = true;
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
    this.#sidebar.hide();
  }
}

class CommentSidebar {
  #annotations = null;

  #boundCommentClick = this.#commentClick.bind(this);

  #boundCommentKeydown = this.#commentKeydown.bind(this);

  #sidebar;

  #closeButton;

  #commentsList;

  #commentCount;

  #sidebarTitle;

  #linkService;

  #elementsToAnnotations = null;

  #idsToElements = null;

  #uiManager = null;

  constructor(
    {
      sidebar,
      commentsList,
      commentCount,
      sidebarTitle,
      closeButton,
      commentToolbarButton,
    },
    eventBus,
    linkService
  ) {
    this.#sidebar = sidebar;
    this.#sidebarTitle = sidebarTitle;
    this.#commentsList = commentsList;
    this.#commentCount = commentCount;
    this.#linkService = linkService;
    this.#closeButton = closeButton;

    closeButton.addEventListener("click", () => {
      eventBus.dispatch("switchannotationeditormode", {
        source: this,
        mode: AnnotationEditorType.NONE,
      });
    });
    commentToolbarButton.addEventListener("keydown", e => {
      if (e.key === "ArrowDown" || e.key === "Home" || e.key === "F6") {
        this.#commentsList.firstElementChild.focus();
        stopEvent(e);
      } else if (e.key === "ArrowUp" || e.key === "End") {
        this.#commentsList.lastElementChild.focus();
        stopEvent(e);
      }
    });
    this.#sidebar.hidden = true;
  }

  setUIManager(uiManager) {
    this.#uiManager = uiManager;
  }

  show(annotations) {
    this.#elementsToAnnotations = new WeakMap();
    this.#idsToElements = new Map();
    this.#annotations = annotations;
    annotations.sort(this.#sortComments.bind(this));
    if (annotations.length !== 0) {
      const fragment = document.createDocumentFragment();
      for (const annotation of annotations) {
        fragment.append(this.#createCommentElement(annotation));
      }

      this.#setCommentsCount(fragment);
      this.#commentsList.append(fragment);
    } else {
      this.#setCommentsCount();
    }
    this.#sidebar.hidden = false;
  }

  hide() {
    this.#sidebar.hidden = true;
    this.#commentsList.replaceChildren();
    this.#elementsToAnnotations = null;
    this.#idsToElements = null;
    this.#annotations = null;
  }

  removeComments(ids) {
    if (ids.length === 0) {
      return;
    }
    if (
      new Set(this.#idsToElements.keys()).difference(new Set(ids)).size === 0
    ) {
      this.#removeAll();
      return;
    }
    for (const id of ids) {
      this.#removeComment(id);
    }
  }

  focusComment(id) {
    const element = this.#idsToElements.get(id);
    if (!element) {
      return;
    }
    this.#sidebar.scrollTop = element.offsetTop - this.#sidebar.offsetTop;
    for (const el of this.#commentsList.children) {
      el.classList.toggle("selected", el === element);
    }
  }

  #removeComment(id) {
    const element = this.#idsToElements.get(id);
    if (!element) {
      return;
    }
    const annotation = this.#elementsToAnnotations.get(element);
    const index = binarySearchFirstItem(
      this.#annotations,
      a => this.#sortComments(a, annotation) >= 0
    );
    if (index >= this.#annotations.length) {
      return;
    }
    this.#annotations.splice(index, 1);
    element.remove();
    this.#idsToElements.delete(id);
    this.#setCommentsCount();
  }

  #removeAll() {
    this.#commentsList.replaceChildren();
    this.#elementsToAnnotations = new WeakMap();
    this.#idsToElements.clear();
    this.#annotations.length = 0;
    this.#setCommentsCount();
  }

  selectComment(element, id = null) {
    element ||= this.#idsToElements.get(id);
    for (const el of this.#commentsList.children) {
      el.classList.toggle("selected", el === element);
    }
  }

  addComment(annotation) {
    if (this.#idsToElements.has(annotation.id)) {
      return;
    }
    const { popupRef, contentsObj } = annotation;
    if (!popupRef || !contentsObj?.str) {
      return;
    }
    const commentItem = this.#createCommentElement(annotation);
    if (this.#annotations.length === 0) {
      this.#commentsList.replaceChildren(commentItem);
      this.#annotations.push(annotation);
      this.#setCommentsCount();
      return;
    }
    const index = binarySearchFirstItem(
      this.#annotations,
      a => this.#sortComments(a, annotation) >= 0
    );
    this.#annotations.splice(index, 0, annotation);
    if (index >= this.#commentsList.children.length) {
      this.#commentsList.append(commentItem);
    } else {
      this.#commentsList.insertBefore(
        commentItem,
        this.#commentsList.children[index]
      );
    }
    this.#setCommentsCount();
  }

  #setCommentsCount(container = this.#commentsList) {
    const count = this.#idsToElements.size;
    this.#sidebarTitle.setAttribute(
      "data-l10n-args",
      JSON.stringify({ count })
    );
    this.#commentCount.textContent = count;
    if (count === 0) {
      container.append(this.#createZeroCommentElement());
    }
  }

  #createZeroCommentElement() {
    const commentItem = document.createElement("li");
    commentItem.classList.add("sidebarComment", "noComments");
    commentItem.role = "button";
    const textDiv = document.createElement("div");
    textDiv.className = "sidebarCommentText";
    textDiv.setAttribute(
      "data-l10n-id",
      "pdfjs-editor-comments-sidebar-no-comments"
    );
    commentItem.addEventListener("keydown", this.#boundCommentKeydown);
    commentItem.append(textDiv);
    return commentItem;
  }

  #createCommentElement(annotation) {
    const {
      id,
      creationDate,
      modificationDate,
      contentsObj: { str: text },
    } = annotation;
    const commentItem = document.createElement("li");
    commentItem.role = "button";
    commentItem.className = "sidebarComment";
    commentItem.tabIndex = -1;

    const dateDiv = document.createElement("time");
    const date = PDFDateString.toDateObject(modificationDate || creationDate);
    dateDiv.dateTime = date.toISOString();
    const dateFormat = new Intl.DateTimeFormat(undefined, {
      dateStyle: "long",
    });
    dateDiv.textContent = dateFormat.format(date);

    const textDiv = document.createElement("div");
    textDiv.className = "sidebarCommentText";
    textDiv.textContent = text;
    commentItem.append(dateDiv, textDiv);
    commentItem.addEventListener("click", this.#boundCommentClick);
    commentItem.addEventListener("keydown", this.#boundCommentKeydown);

    this.#elementsToAnnotations.set(commentItem, annotation);
    this.#idsToElements.set(id, commentItem);
    return commentItem;
  }

  async #commentClick({ currentTarget }) {
    if (currentTarget.classList.contains("selected")) {
      return;
    }
    const annotation = this.#elementsToAnnotations.get(currentTarget);
    if (!annotation) {
      return;
    }
    const { id, pageIndex, rect } = annotation;
    const SPACE_ABOVE_ANNOTATION = 10;
    const pageNumber = pageIndex + 1;
    const pageVisiblePromise = this.#uiManager?.waitForPageRendered(pageNumber);
    this.#linkService?.goToXY(
      pageNumber,
      rect[0],
      rect[3] + SPACE_ABOVE_ANNOTATION
    );
    this.selectComment(currentTarget);
    await pageVisiblePromise;
    this.#uiManager?.showComment(pageIndex, id);
  }

  #commentKeydown(e) {
    const { key, currentTarget } = e;
    switch (key) {
      case "ArrowDown":
        (
          currentTarget.nextElementSibling ||
          this.#commentsList.firstElementChild
        ).focus();
        stopEvent(e);
        break;
      case "ArrowUp":
        (
          currentTarget.previousElementSibling ||
          this.#commentsList.lastElementChild
        ).focus();
        stopEvent(e);
        break;
      case "Home":
        this.#commentsList.firstElementChild.focus();
        stopEvent(e);
        break;
      case "End":
        this.#commentsList.lastElementChild.focus();
        stopEvent(e);
        break;
      case "Enter":
      case " ":
        this.#commentClick(e);
        stopEvent(e);
        break;
      case "ShiftTab":
        this.#closeButton.focus();
        stopEvent(e);
        break;
    }
  }

  #sortComments(a, b) {
    if (a.pageIndex !== b.pageIndex) {
      return a.pageIndex - b.pageIndex;
    }
    if (a.rect[3] !== b.rect[3]) {
      return b.rect[3] - a.rect[3];
    }
    if (a.rect[0] !== b.rect[0]) {
      return a.rect[0] - b.rect[0];
    }
    if (a.rect[1] !== b.rect[1]) {
      return b.rect[1] - a.rect[1];
    }
    if (a.rect[2] !== b.rect[2]) {
      return a.rect[2] - b.rect[2];
    }
    return a.id.localeCompare(b.id);
  }
}

export { CommentManager };
