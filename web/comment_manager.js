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
  applyOpacity,
  CSSConstants,
  findContrastColor,
  MathClamp,
  noContextMenu,
  PDFDateString,
  renderRichText,
  shadow,
  stopEvent,
  Util,
} from "pdfjs-lib";
import { binarySearchFirstItem } from "./ui_utils.js";

class CommentManager {
  #dialog;

  #popup;

  #sidebar;

  static #hasForcedColors = null;

  constructor(
    commentDialog,
    sidebar,
    eventBus,
    linkService,
    overlayManager,
    ltr,
    hasForcedColors
  ) {
    const dateFormat = new Intl.DateTimeFormat(undefined, {
      dateStyle: "long",
    });
    this.dialogElement = commentDialog.dialog;
    this.#dialog = new CommentDialog(
      commentDialog,
      overlayManager,
      eventBus,
      ltr
    );
    this.#popup = new CommentPopup(
      eventBus,
      dateFormat,
      ltr,
      this.dialogElement
    );
    this.#sidebar = new CommentSidebar(
      sidebar,
      eventBus,
      linkService,
      this.#popup,
      dateFormat,
      ltr
    );
    this.#popup.sidebar = this.#sidebar;
    CommentManager.#hasForcedColors = hasForcedColors;
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

  updateComment(annotation) {
    this.#sidebar.updateComment(annotation);
  }

  toggleCommentPopup(editor, isSelected, visibility, isEditable) {
    if (isSelected) {
      this.selectComment(editor.uid);
    }
    this.#popup.toggle(editor, isSelected, visibility, isEditable);
  }

  destroyPopup() {
    this.#popup.destroy();
  }

  updatePopupColor(editor) {
    this.#popup.updateColor(editor);
  }

  showDialog(uiManager, editor, posX, posY, options) {
    return this.#dialog.open(uiManager, editor, posX, posY, options);
  }

  makeCommentColor(color, opacity) {
    return CommentManager._makeCommentColor(color, opacity);
  }

  static _makeCommentColor(color, opacity) {
    return this.#hasForcedColors
      ? null
      : findContrastColor(
          applyOpacity(...color, opacity ?? 1),
          CSSConstants.commentForegroundColor
        );
  }

  destroy() {
    this.#dialog.destroy();
    this.#sidebar.hide();
    this.#popup.destroy();
  }
}

class CommentSidebar {
  #annotations = null;

  #eventBus;

  #boundCommentClick = this.#commentClick.bind(this);

  #boundCommentKeydown = this.#commentKeydown.bind(this);

  #sidebar;

  #closeButton;

  #commentsList;

  #commentCount;

  #dateFormat;

  #sidebarTitle;

  #learnMoreUrl;

  #linkService;

  #popup;

  #elementsToAnnotations = null;

  #idsToElements = null;

  #uiManager = null;

  #minWidth = 0;

  #maxWidth = 0;

  #initialWidth = 0;

  #width = 0;

  #ltr;

  constructor(
    {
      learnMoreUrl,
      sidebar,
      sidebarResizer,
      commentsList,
      commentCount,
      sidebarTitle,
      closeButton,
      commentToolbarButton,
    },
    eventBus,
    linkService,
    popup,
    dateFormat,
    ltr
  ) {
    this.#sidebar = sidebar;
    this.#sidebarTitle = sidebarTitle;
    this.#commentsList = commentsList;
    this.#commentCount = commentCount;
    this.#learnMoreUrl = learnMoreUrl;
    this.#linkService = linkService;
    this.#closeButton = closeButton;
    this.#popup = popup;
    this.#dateFormat = dateFormat;
    this.#ltr = ltr;
    this.#eventBus = eventBus;

    const style = window.getComputedStyle(sidebar);
    this.#minWidth = parseFloat(style.getPropertyValue("--sidebar-min-width"));
    this.#maxWidth = parseFloat(style.getPropertyValue("--sidebar-max-width"));
    this.#initialWidth = this.#width = parseFloat(
      style.getPropertyValue("--sidebar-width")
    );

    this.#makeSidebarResizable(sidebarResizer);
    closeButton.addEventListener("click", () => {
      eventBus.dispatch("switchannotationeditormode", {
        source: this,
        mode: AnnotationEditorType.NONE,
      });
    });
    const keyDownCallback = e => {
      if (e.key === "ArrowDown" || e.key === "Home" || e.key === "F6") {
        this.#commentsList.firstElementChild.focus();
        stopEvent(e);
      } else if (e.key === "ArrowUp" || e.key === "End") {
        this.#commentsList.lastElementChild.focus();
        stopEvent(e);
      }
    };
    commentToolbarButton.addEventListener("keydown", keyDownCallback);
    sidebar.addEventListener("keydown", keyDownCallback);
    this.#sidebar.hidden = true;
  }

  #makeSidebarResizable(resizer) {
    let pointerMoveAC;
    const cancelResize = () => {
      this.#width = MathClamp(this.#width, this.#minWidth, this.#maxWidth);
      this.#sidebar.classList.remove("resizing");
      pointerMoveAC?.abort();
      pointerMoveAC = null;
    };
    resizer.addEventListener("pointerdown", e => {
      if (pointerMoveAC) {
        cancelResize();
        return;
      }
      const { clientX } = e;
      stopEvent(e);
      let prevX = clientX;
      pointerMoveAC = new AbortController();
      const { signal } = pointerMoveAC;
      const sign = this.#ltr ? -1 : 1;
      const sidebar = this.#sidebar;
      const sidebarStyle = sidebar.style;
      sidebar.classList.add("resizing");
      const parentStyle = sidebar.parentElement.style;
      parentStyle.minWidth = 0;
      window.addEventListener("contextmenu", noContextMenu, { signal });
      window.addEventListener(
        "pointermove",
        ev => {
          if (!pointerMoveAC) {
            return;
          }
          stopEvent(ev);
          const { clientX: x } = ev;
          const newWidth = (this.#width += sign * (x - prevX));
          prevX = x;
          if (newWidth > this.#maxWidth || newWidth < this.#minWidth) {
            return;
          }
          sidebarStyle.width = `${newWidth.toFixed(3)}px`;
          parentStyle.insetInlineStart = `${(this.#initialWidth - newWidth).toFixed(3)}px`;
        },
        { signal, capture: true }
      );
      window.addEventListener("blur", cancelResize, { signal });
      window.addEventListener(
        "pointerup",
        ev => {
          if (pointerMoveAC) {
            cancelResize();
            stopEvent(ev);
          }
        },
        { signal }
      );
    });
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
    this.#eventBus.dispatch("reporttelemetry", {
      source: this,
      details: {
        type: "commentSidebar",
        data: { numberOfAnnotations: annotations.length },
      },
    });
  }

  hide() {
    this.#sidebar.hidden = true;
    this.#commentsList.replaceChildren();
    this.#elementsToAnnotations = null;
    this.#idsToElements = null;
    this.#annotations = null;
  }

  removeComments(ids) {
    if (ids.length === 0 || !this.#idsToElements) {
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

  updateComment(annotation) {
    if (!this.#idsToElements) {
      return;
    }
    const {
      id,
      creationDate,
      modificationDate,
      richText,
      contentsObj,
      popupRef,
    } = annotation;

    if (!popupRef || (!richText && !contentsObj?.str)) {
      this.#removeComment(id);
    }

    const element = this.#idsToElements.get(id);
    if (!element) {
      return;
    }
    const prevAnnotation = this.#elementsToAnnotations.get(element);
    let index = binarySearchFirstItem(
      this.#annotations,
      a => this.#sortComments(a, prevAnnotation) >= 0
    );
    if (index >= this.#annotations.length) {
      return;
    }

    this.#setDate(element.firstChild, modificationDate || creationDate);
    this.#setText(element.lastChild, richText, contentsObj);

    this.#annotations.splice(index, 1);
    index = binarySearchFirstItem(
      this.#annotations,
      a => this.#sortComments(a, annotation) >= 0
    );
    this.#annotations.splice(index, 0, annotation);
    if (index >= this.#commentsList.children.length) {
      this.#commentsList.append(element);
    } else {
      this.#commentsList.insertBefore(
        element,
        this.#commentsList.children[index]
      );
    }
  }

  #removeComment(id) {
    const element = this.#idsToElements?.get(id);
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
    if (!this.#idsToElements) {
      return;
    }
    const hasNoElement = !element;
    element ||= this.#idsToElements.get(id);
    for (const el of this.#commentsList.children) {
      el.classList.toggle("selected", el === element);
    }
    if (hasNoElement) {
      element?.scrollIntoView({ behavior: "instant", block: "center" });
    }
  }

  addComment(annotation) {
    if (this.#idsToElements?.has(annotation.id)) {
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
    const textDiv = document.createElement("div");
    textDiv.className = "sidebarCommentText";
    textDiv.setAttribute(
      "data-l10n-id",
      "pdfjs-editor-comments-sidebar-no-comments1"
    );
    commentItem.append(textDiv);
    if (this.#learnMoreUrl) {
      const a = document.createElement("a");
      a.setAttribute(
        "data-l10n-id",
        "pdfjs-editor-comments-sidebar-no-comments-link"
      );
      a.href = this.#learnMoreUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      commentItem.append(a);
    }
    return commentItem;
  }

  #setDate(element, date) {
    date = PDFDateString.toDateObject(date);
    element.dateTime = date.toISOString();
    element.textContent = this.#dateFormat.format(date);
  }

  #setText(element, richText, contentsObj) {
    element.replaceChildren();
    const html =
      richText?.str && (!contentsObj?.str || richText.str === contentsObj.str)
        ? richText.html
        : contentsObj?.str;
    renderRichText(
      {
        html,
        dir: contentsObj?.dir || "auto",
        className: "richText",
      },
      element
    );
  }

  #createCommentElement(annotation) {
    const {
      id,
      creationDate,
      modificationDate,
      richText,
      contentsObj,
      color,
      opacity,
    } = annotation;
    const commentItem = document.createElement("li");
    commentItem.role = "button";
    commentItem.className = "sidebarComment";
    commentItem.tabIndex = -1;
    commentItem.style.backgroundColor =
      (color && CommentManager._makeCommentColor(color, opacity)) || "";
    const dateDiv = document.createElement("time");
    this.#setDate(dateDiv, modificationDate || creationDate);

    const textDiv = document.createElement("div");
    textDiv.className = "sidebarCommentText";
    this.#setText(textDiv, richText, contentsObj);

    commentItem.append(dateDiv, textDiv);
    commentItem.addEventListener("click", this.#boundCommentClick);
    commentItem.addEventListener("keydown", this.#boundCommentKeydown);

    this.#elementsToAnnotations.set(commentItem, annotation);
    this.#idsToElements.set(id, commentItem);
    return commentItem;
  }

  async #commentClick({ currentTarget }) {
    if (currentTarget.classList.contains("selected")) {
      currentTarget.classList.remove("selected");
      this.#popup._hide();
      return;
    }
    const annotation = this.#elementsToAnnotations.get(currentTarget);
    if (!annotation) {
      return;
    }
    this.#popup._hide();
    const { id, pageIndex, rect } = annotation;
    const pageNumber = pageIndex + 1;
    const pageVisiblePromise =
      this.#uiManager?.waitForEditorsRendered(pageNumber);
    this.#linkService?.goToXY(pageNumber, rect[0], rect[3], {
      center: "both",
    });
    this.selectComment(currentTarget);
    await pageVisiblePromise;
    this.#uiManager?.selectComment(pageIndex, id);
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
    const dateA = PDFDateString.toDateObject(
      a.modificationDate || a.creationDate
    );
    const dateB = PDFDateString.toDateObject(
      b.modificationDate || b.creationDate
    );
    if (dateA !== dateB) {
      if (dateA !== null && dateB !== null) {
        return dateB - dateA;
      }
      return dateA !== null ? -1 : 1;
    }
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

class CommentDialog {
  #dialog;

  #editor;

  #overlayManager;

  #previousText = "";

  #commentText = "";

  #textInput;

  #title;

  #saveButton;

  #uiManager;

  #prevDragX = 0;

  #prevDragY = 0;

  #dialogX = 0;

  #dialogY = 0;

  #isLTR;

  #eventBus;

  constructor(
    { dialog, toolbar, title, textInput, cancelButton, saveButton },
    overlayManager,
    eventBus,
    ltr
  ) {
    this.#dialog = dialog;
    this.#textInput = textInput;
    this.#overlayManager = overlayManager;
    this.#eventBus = eventBus;
    this.#saveButton = saveButton;
    this.#title = title;
    this.#isLTR = ltr;

    const finishBound = this.#finish.bind(this);
    dialog.addEventListener("close", finishBound);
    dialog.addEventListener("contextmenu", e => {
      if (e.target !== this.#textInput) {
        e.preventDefault();
      }
    });
    cancelButton.addEventListener("click", finishBound);
    saveButton.addEventListener("click", this.#save.bind(this));

    textInput.addEventListener("input", () => {
      saveButton.disabled = textInput.value === this.#previousText;
    });

    // Make the dialog draggable.
    let pointerMoveAC;
    const cancelDrag = () => {
      dialog.classList.remove("dragging");
      pointerMoveAC?.abort();
      pointerMoveAC = null;
    };
    toolbar.addEventListener("pointerdown", e => {
      if (pointerMoveAC) {
        cancelDrag();
        return;
      }
      const { clientX, clientY } = e;
      stopEvent(e);
      this.#prevDragX = clientX;
      this.#prevDragY = clientY;
      pointerMoveAC = new AbortController();
      const { signal } = pointerMoveAC;
      const { innerHeight, innerWidth } = window;
      dialog.classList.add("dragging");
      window.addEventListener(
        "pointermove",
        ev => {
          if (!pointerMoveAC) {
            return;
          }
          const { clientX: x, clientY: y } = ev;
          this.#setPosition(
            this.#dialogX + (x - this.#prevDragX) / innerWidth,
            this.#dialogY + (y - this.#prevDragY) / innerHeight
          );
          this.#prevDragX = x;
          this.#prevDragY = y;
          stopEvent(ev);
        },
        { signal }
      );
      window.addEventListener("blur", cancelDrag, { signal });
      window.addEventListener(
        "pointerup",
        ev => {
          if (pointerMoveAC) {
            cancelDrag();
            stopEvent(ev);
          }
        },
        { signal }
      );
    });

    overlayManager.register(dialog);
  }

  async open(uiManager, editor, posX, posY, options) {
    if (editor) {
      this.#uiManager = uiManager;
      this.#editor = editor;
    }
    const {
      contentsObj: { str },
      color,
      opacity,
    } = editor.getData();
    const { style: dialogStyle } = this.#dialog;
    if (color) {
      dialogStyle.backgroundColor = CommentManager._makeCommentColor(
        color,
        opacity
      );
      dialogStyle.borderColor = Util.makeHexColor(...color);
    } else {
      dialogStyle.backgroundColor = dialogStyle.borderColor = "";
    }
    this.#commentText = str || "";
    const textInput = this.#textInput;
    textInput.value = this.#previousText = this.#commentText;
    if (str) {
      this.#title.setAttribute(
        "data-l10n-id",
        "pdfjs-editor-edit-comment-dialog-title-when-editing"
      );
      this.#saveButton.setAttribute(
        "data-l10n-id",
        "pdfjs-editor-edit-comment-dialog-save-button-when-editing"
      );
    } else {
      this.#title.setAttribute(
        "data-l10n-id",
        "pdfjs-editor-edit-comment-dialog-title-when-adding"
      );
      this.#saveButton.setAttribute(
        "data-l10n-id",
        "pdfjs-editor-edit-comment-dialog-save-button-when-adding"
      );
    }
    if (options?.height) {
      textInput.style.height = `${options.height}px`;
    }
    this.#uiManager?.removeEditListeners();
    this.#saveButton.disabled = true;
    const parentDimensions = options?.parentDimensions;
    const { innerHeight, innerWidth } = window;
    if (editor.hasDefaultPopupPosition()) {
      const { dialogWidth, dialogHeight } = this._dialogDimensions;
      if (parentDimensions) {
        if (
          this.#isLTR &&
          posX + dialogWidth >
            Math.min(parentDimensions.x + parentDimensions.width, innerWidth)
        ) {
          const buttonWidth = this.#editor.commentButtonWidth;
          posX -= dialogWidth - buttonWidth * parentDimensions.width;
        } else if (!this.#isLTR) {
          const buttonWidth =
            this.#editor.commentButtonWidth * parentDimensions.width;
          if (posX - dialogWidth < Math.max(0, parentDimensions.x)) {
            posX = Math.max(0, posX);
          } else {
            posX -= dialogWidth - buttonWidth;
          }
        }
      }
      const height = Math.max(dialogHeight, options?.height || 0);
      if (posY + height > innerHeight) {
        posY = innerHeight - height;
      }
      if (posY < 0) {
        posY = 0;
      }
    }

    posX = MathClamp(posX / innerWidth, 0, 1);
    posY = MathClamp(posY / innerHeight, 0, 1);
    this.#setPosition(posX, posY);

    await this.#overlayManager.open(this.#dialog);
    textInput.focus();
  }

  async #save() {
    this.#editor.comment = this.#textInput.value;
    this.#finish();
  }

  get _dialogDimensions() {
    const dialog = this.#dialog;
    const { style } = dialog;
    style.opacity = "0";
    style.display = "block";
    const { width, height } = dialog.getBoundingClientRect();
    style.opacity = style.display = "";
    return shadow(this, "_dialogDimensions", {
      dialogWidth: width,
      dialogHeight: height,
    });
  }

  #setPosition(x, y) {
    this.#dialogX = x;
    this.#dialogY = y;
    const { style } = this.#dialog;
    style.left = `${100 * x}%`;
    style.top = `${100 * y}%`;
  }

  #finish() {
    if (!this.#editor) {
      return;
    }
    const edited = this.#textInput.value !== this.#commentText;
    this.#eventBus.dispatch("reporttelemetry", {
      source: this,
      details: {
        type: "comment",
        data: {
          edited,
        },
      },
    });

    this.#editor?.focusCommentButton();
    this.#editor = null;
    this.#textInput.value = this.#previousText = this.#commentText = "";
    this.#overlayManager.closeIfActive(this.#dialog);
    this.#textInput.style.height = "";
    this.#uiManager?.addEditListeners();
    this.#uiManager = null;
  }

  destroy() {
    this.#uiManager = null;
    this.#editor = null;
    this.#finish();
  }
}

class CommentPopup {
  #buttonsContainer = null;

  #eventBus;

  #commentDialog;

  #dateFormat;

  #editor = null;

  #isLTR;

  #container = null;

  #text = null;

  #time = null;

  #prevDragX = 0;

  #prevDragY = 0;

  #posX = 0;

  #posY = 0;

  #previousFocusedElement = null;

  #selected = false;

  #visible = false;

  constructor(eventBus, dateFormat, ltr, commentDialog) {
    this.#eventBus = eventBus;
    this.#dateFormat = dateFormat;
    this.#isLTR = ltr;
    this.#commentDialog = commentDialog;
    this.sidebar = null;
  }

  get _popupWidth() {
    const container = this.#createPopup();
    const { style } = container;
    style.opacity = "0";
    style.display = "block";
    document.body.append(container);
    const width = container.getBoundingClientRect().width;
    container.remove();
    style.opacity = style.display = "";
    return shadow(this, "_popupWidth", width);
  }

  #createPopup() {
    if (this.#container) {
      return this.#container;
    }
    const container = (this.#container = document.createElement("div"));
    container.className = "commentPopup";
    container.id = "commentPopup";
    container.tabIndex = -1;
    container.role = "dialog";
    container.ariaModal = "false";
    container.addEventListener("contextmenu", noContextMenu);
    container.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        this.toggle(this.#editor, true, false);
        this.#previousFocusedElement?.focus();
        stopEvent(e);
      }
    });
    container.addEventListener("click", () => {
      container.focus();
    });

    const top = document.createElement("div");
    top.className = "commentPopupTop";
    const time = (this.#time = document.createElement("time"));
    time.className = "commentPopupTime";

    const buttons = (this.#buttonsContainer = document.createElement("div"));
    buttons.className = "commentPopupButtons";
    const edit = document.createElement("button");
    edit.classList.add("commentPopupEdit", "toolbarButton");
    edit.tabIndex = 0;
    edit.setAttribute("data-l10n-id", "pdfjs-editor-edit-comment-popup-button");
    edit.ariaHasPopup = "dialog";
    edit.ariaControlsElements = [this.#commentDialog];
    const editLabel = document.createElement("span");
    editLabel.setAttribute(
      "data-l10n-id",
      "pdfjs-editor-edit-comment-popup-button-label"
    );
    edit.append(editLabel);
    edit.addEventListener("click", () => {
      const editor = this.#editor;
      const height = parseFloat(getComputedStyle(this.#text).height);
      this.toggle(editor, /* isSelected */ true, /* visibility */ false);
      editor.editComment({
        height,
      });
    });
    edit.addEventListener("contextmenu", noContextMenu);

    const del = document.createElement("button");
    del.classList.add("commentPopupDelete", "toolbarButton");
    del.tabIndex = 0;
    del.setAttribute(
      "data-l10n-id",
      "pdfjs-editor-delete-comment-popup-button"
    );
    const delLabel = document.createElement("span");
    delLabel.setAttribute(
      "data-l10n-id",
      "pdfjs-editor-delete-comment-popup-button-label"
    );
    del.append(delLabel);
    del.addEventListener("click", () => {
      this.#eventBus.dispatch("reporttelemetry", {
        source: this,
        details: {
          type: "comment",
          data: {
            deleted: true,
          },
        },
      });
      this.#editor.comment = null;
      this.#editor.focus();
      this.destroy();
    });
    del.addEventListener("contextmenu", noContextMenu);
    buttons.append(edit, del);

    top.append(time, buttons);

    const separator = document.createElement("hr");

    const text = (this.#text = document.createElement("div"));
    text.className = "commentPopupText";
    container.append(top, separator, text);

    // Make the dialog draggable.
    let pointerMoveAC;
    const cancelDrag = () => {
      container.classList.remove("dragging");
      pointerMoveAC?.abort();
      pointerMoveAC = null;
    };
    top.addEventListener("pointerdown", e => {
      if (pointerMoveAC) {
        cancelDrag();
        return;
      }
      const { target, clientX, clientY } = e;
      if (buttons.contains(target)) {
        return;
      }
      stopEvent(e);
      const { width: parentWidth, height: parentHeight } =
        this.#editor.parentBoundingClientRect;
      this.#prevDragX = clientX;
      this.#prevDragY = clientY;
      pointerMoveAC = new AbortController();
      const { signal } = pointerMoveAC;
      container.classList.add("dragging");
      window.addEventListener(
        "pointermove",
        ev => {
          if (!pointerMoveAC) {
            return; // Not dragging.
          }
          const { clientX: x, clientY: y } = ev;
          this.#setPosition(
            this.#posX + (x - this.#prevDragX) / parentWidth,
            this.#posY + (y - this.#prevDragY) / parentHeight,
            /* correctPosition = */ false
          );
          this.#prevDragX = x;
          this.#prevDragY = y;
          stopEvent(ev);
        },
        { signal }
      );
      window.addEventListener("blur", cancelDrag, { signal });
      window.addEventListener(
        "pointerup",
        ev => {
          if (pointerMoveAC) {
            cancelDrag();
            stopEvent(ev);
          }
        },
        { signal }
      );
    });

    return container;
  }

  updateColor(editor) {
    if (this.#editor !== editor || !this.#visible) {
      return;
    }
    const { color, opacity } = editor.getData();
    this.#container.style.backgroundColor =
      (color && CommentManager._makeCommentColor(color, opacity)) || "";
  }

  _hide(editor) {
    const container = this.#createPopup();

    container.classList.toggle("hidden", true);
    container.classList.toggle("selected", false);
    (editor || this.#editor)?.setCommentButtonStates({
      selected: false,
      hasPopup: false,
    });
    this.#editor = null;
    this.#selected = false;
    this.#visible = false;
    this.#text.replaceChildren();
    this.sidebar.selectComment(null);
  }

  toggle(editor, isSelected, visibility = undefined, isEditable = true) {
    if (!editor) {
      this.destroy();
      return;
    }

    if (isSelected) {
      visibility ??=
        this.#editor === editor ? !this.#selected || !this.#visible : true;
    } else {
      if (this.#selected) {
        return;
      }
      visibility ??= !this.#visible;
    }

    if (!visibility) {
      this._hide(editor);
      return;
    }

    this.#visible = true;
    if (this.#editor !== editor) {
      this.#editor?.setCommentButtonStates({
        selected: false,
        hasPopup: false,
      });
    }

    const container = this.#createPopup();
    this.#buttonsContainer.classList.toggle("hidden", !isEditable);
    container.classList.toggle("hidden", false);
    container.classList.toggle("selected", isSelected);
    this.#selected = isSelected;
    this.#editor = editor;
    editor.setCommentButtonStates({
      selected: isSelected,
      hasPopup: true,
    });

    const {
      contentsObj,
      richText,
      creationDate,
      modificationDate,
      color,
      opacity,
    } = editor.getData();
    container.style.backgroundColor =
      (color && CommentManager._makeCommentColor(color, opacity)) || "";
    this.#text.replaceChildren();
    const html =
      richText?.str && (!contentsObj?.str || richText.str === contentsObj.str)
        ? richText.html
        : contentsObj?.str;
    if (html) {
      renderRichText(
        {
          html,
          dir: contentsObj?.dir || "auto",
          className: "richText",
        },
        this.#text
      );
    }
    this.#time.textContent = this.#dateFormat.format(
      PDFDateString.toDateObject(modificationDate || creationDate)
    );
    this.#setPosition(
      ...editor.commentPopupPosition,
      /* correctPosition = */ editor.hasDefaultPopupPosition()
    );
    editor.elementBeforePopup.after(container);
    container.addEventListener(
      "focus",
      ({ relatedTarget }) => {
        this.#previousFocusedElement = relatedTarget;
      },
      { once: true }
    );
    if (isSelected) {
      setTimeout(() => container.focus(), 0);
    }
  }

  #setPosition(x, y, correctPosition) {
    if (!correctPosition) {
      this.#editor.commentPopupPosition = [x, y];
    } else {
      const parentRect = this.#editor.parentBoundingClientRect;
      const widthRatio = this._popupWidth / parentRect.width;
      if (
        (this.#isLTR && x + widthRatio > 1) ||
        (!this.#isLTR && x - widthRatio >= 0)
      ) {
        const buttonWidth = this.#editor.commentButtonWidth;
        x -= widthRatio - buttonWidth;
      }
      const margin = 0.01;
      if (this.#isLTR) {
        x = Math.max(x, -parentRect.x / parentRect.width + margin);
      } else {
        x = Math.min(
          x,
          (window.innerWidth - parentRect.x) / parentRect.width -
            widthRatio -
            margin
        );
      }
    }
    this.#posX = x;
    this.#posY = y;
    const { style } = this.#container;
    style.left = `${100 * x}%`;
    style.top = `${100 * y}%`;
  }

  destroy() {
    this._hide();
    this.#container?.remove();
    this.#container = this.#text = this.#time = null;
    this.#prevDragX = this.#prevDragY = Infinity;
    this.#posX = this.#posY = 0;
    this.#previousFocusedElement = null;
  }
}

export { CommentManager };
