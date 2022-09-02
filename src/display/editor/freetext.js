/* Copyright 2022 Mozilla Foundation
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

// eslint-disable-next-line max-len
/** @typedef {import("./annotation_editor_layer.js").AnnotationEditorLayer} AnnotationEditorLayer */

import {
  AnnotationEditorParamsType,
  AnnotationEditorType,
  assert,
  LINE_FACTOR,
  Util,
} from "../../shared/util.js";
import { bindEvents, KeyboardManager } from "./tools.js";
import { AnnotationEditor } from "./editor.js";

/**
 * Basic text editor in order to create a FreeTex annotation.
 */
class FreeTextEditor extends AnnotationEditor {
  #boundEditorDivBlur = this.editorDivBlur.bind(this);

  #boundEditorDivFocus = this.editorDivFocus.bind(this);

  #boundEditorDivKeydown = this.editorDivKeydown.bind(this);

  #color;

  #content = "";

  #hasAlreadyBeenCommitted = false;

  #fontSize;

  static _freeTextDefaultContent = "";

  static _l10nPromise;

  static _internalPadding = 0;

  static _defaultColor = null;

  static _defaultFontSize = 10;

  static _keyboardManager = new KeyboardManager([
    [
      ["ctrl+Enter", "mac+meta+Enter", "Escape", "mac+Escape"],
      FreeTextEditor.prototype.commitOrRemove,
    ],
  ]);

  static _type = "freetext";

  constructor(params) {
    super({ ...params, name: "freeTextEditor" });
    this.#color =
      params.color ||
      FreeTextEditor._defaultColor ||
      AnnotationEditor._defaultLineColor;
    this.#fontSize = params.fontSize || FreeTextEditor._defaultFontSize;
  }

  static initialize(l10n) {
    this._l10nPromise = new Map(
      ["free_text2_default_content", "editor_free_text2_aria_label"].map(
        str => [str, l10n.get(str)]
      )
    );

    const style = getComputedStyle(document.documentElement);

    if (
      typeof PDFJSDev === "undefined" ||
      PDFJSDev.test("!PRODUCTION || TESTING")
    ) {
      const lineHeight = parseFloat(
        style.getPropertyValue("--freetext-line-height")
      );
      assert(
        lineHeight === LINE_FACTOR,
        "Update the CSS variable to agree with the constant."
      );
    }

    this._internalPadding = parseFloat(
      style.getPropertyValue("--freetext-padding")
    );
  }

  static updateDefaultParams(type, value) {
    switch (type) {
      case AnnotationEditorParamsType.FREETEXT_SIZE:
        FreeTextEditor._defaultFontSize = value;
        break;
      case AnnotationEditorParamsType.FREETEXT_COLOR:
        FreeTextEditor._defaultColor = value;
        break;
    }
  }

  /** @inheritdoc */
  updateParams(type, value) {
    switch (type) {
      case AnnotationEditorParamsType.FREETEXT_SIZE:
        this.#updateFontSize(value);
        break;
      case AnnotationEditorParamsType.FREETEXT_COLOR:
        this.#updateColor(value);
        break;
    }
  }

  static get defaultPropertiesToUpdate() {
    return [
      [
        AnnotationEditorParamsType.FREETEXT_SIZE,
        FreeTextEditor._defaultFontSize,
      ],
      [
        AnnotationEditorParamsType.FREETEXT_COLOR,
        FreeTextEditor._defaultColor || AnnotationEditor._defaultLineColor,
      ],
    ];
  }

  get propertiesToUpdate() {
    return [
      [AnnotationEditorParamsType.FREETEXT_SIZE, this.#fontSize],
      [AnnotationEditorParamsType.FREETEXT_COLOR, this.#color],
    ];
  }

  /**
   * Update the font size and make this action as undoable.
   * @param {number} fontSize
   */
  #updateFontSize(fontSize) {
    const setFontsize = size => {
      this.editorDiv.style.fontSize = `calc(${size}px * var(--scale-factor))`;
      this.translate(0, -(size - this.#fontSize) * this.parent.scaleFactor);
      this.#fontSize = size;
      this.#setEditorDimensions();
    };
    const savedFontsize = this.#fontSize;
    this.parent.addCommands({
      cmd: () => {
        setFontsize(fontSize);
      },
      undo: () => {
        setFontsize(savedFontsize);
      },
      mustExec: true,
      type: AnnotationEditorParamsType.FREETEXT_SIZE,
      overwriteIfSameType: true,
      keepUndo: true,
    });
  }

  /**
   * Update the color and make this action undoable.
   * @param {string} color
   */
  #updateColor(color) {
    const savedColor = this.#color;
    this.parent.addCommands({
      cmd: () => {
        this.#color = color;
        this.editorDiv.style.color = color;
      },
      undo: () => {
        this.#color = savedColor;
        this.editorDiv.style.color = savedColor;
      },
      mustExec: true,
      type: AnnotationEditorParamsType.FREETEXT_COLOR,
      overwriteIfSameType: true,
      keepUndo: true,
    });
  }

  /** @inheritdoc */
  getInitialTranslation() {
    // The start of the base line is where the user clicked.
    return [
      -FreeTextEditor._internalPadding * this.parent.scaleFactor,
      -(FreeTextEditor._internalPadding + this.#fontSize) *
        this.parent.scaleFactor,
    ];
  }

  /** @inheritdoc */
  rebuild() {
    super.rebuild();
    if (this.div === null) {
      return;
    }

    if (!this.isAttachedToDOM) {
      // At some point this editor was removed and we're rebuilting it,
      // hence we must add it to its parent.
      this.parent.add(this);
    }
  }

  /** @inheritdoc */
  enableEditMode() {
    if (this.isInEditMode()) {
      return;
    }

    this.parent.setEditingState(false);
    this.parent.updateToolbar(AnnotationEditorType.FREETEXT);
    super.enableEditMode();
    this.enableEditing();
    this.overlayDiv.classList.remove("enabled");
    this.editorDiv.contentEditable = true;
    this.div.draggable = false;
    this.editorDiv.addEventListener("keydown", this.#boundEditorDivKeydown);
    this.editorDiv.addEventListener("focus", this.#boundEditorDivFocus);
    this.editorDiv.addEventListener("blur", this.#boundEditorDivBlur);
    this.parent.div.classList.remove("freeTextEditing");
  }

  /** @inheritdoc */
  disableEditMode() {
    if (!this.isInEditMode()) {
      return;
    }

    this.parent.setEditingState(true);
    super.disableEditMode();
    this.disableEditing();
    this.overlayDiv.classList.add("enabled");
    this.editorDiv.contentEditable = false;
    this.div.draggable = true;
    this.editorDiv.removeEventListener("keydown", this.#boundEditorDivKeydown);
    this.editorDiv.removeEventListener("focus", this.#boundEditorDivFocus);
    this.editorDiv.removeEventListener("blur", this.#boundEditorDivBlur);

    // On Chrome, the focus is given to <body> when contentEditable is set to
    // false, hence we focus the div.
    this.div.focus();

    // In case the blur callback hasn't been called.
    this.isEditing = false;
    this.parent.div.classList.add("freeTextEditing");
  }

  /** @inheritdoc */
  focusin(event) {
    super.focusin(event);
    if (event.target !== this.editorDiv) {
      this.editorDiv.focus();
    }
  }

  /** @inheritdoc */
  onceAdded() {
    if (this.width) {
      // The editor was created in using ctrl+c.
      return;
    }
    this.enableEditMode();
    this.editorDiv.focus();
  }

  /** @inheritdoc */
  isEmpty() {
    return !this.editorDiv || this.editorDiv.innerText.trim() === "";
  }

  /** @inheritdoc */
  remove() {
    this.isEditing = false;
    this.parent.setEditingState(true);
    this.parent.div.classList.add("freeTextEditing");
    super.remove();
  }

  /**
   * Extract the text from this editor.
   * @returns {string}
   */
  #extractText() {
    const divs = this.editorDiv.getElementsByTagName("div");
    if (divs.length === 0) {
      return this.editorDiv.innerText;
    }
    const buffer = [];
    for (let i = 0, ii = divs.length; i < ii; i++) {
      const div = divs[i];
      const first = div.firstChild;
      if (first?.nodeName === "#text") {
        buffer.push(first.data);
      } else {
        buffer.push("");
      }
    }
    return buffer.join("\n");
  }

  #setEditorDimensions() {
    const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
    const rect = this.div.getBoundingClientRect();

    this.width = rect.width / parentWidth;
    this.height = rect.height / parentHeight;
  }

  /**
   * Commit the content we have in this editor.
   * @returns {undefined}
   */
  commit() {
    super.commit();
    if (!this.#hasAlreadyBeenCommitted) {
      // This editor has something and it's the first time
      // it's commited so we can add it in the undo/redo stack.
      this.#hasAlreadyBeenCommitted = true;
      this.parent.addUndoableEditor(this);
    }

    this.disableEditMode();
    this.#content = this.#extractText().trimEnd();

    this.#setEditorDimensions();
  }

  /** @inheritdoc */
  shouldGetKeyboardEvents() {
    return this.isInEditMode();
  }

  /**
   * ondblclick callback.
   * @param {MouseEvent} event
   */
  dblclick(event) {
    this.enableEditMode();
    this.editorDiv.focus();
  }

  /**
   * onkeydown callback.
   * @param {KeyboardEvent} event
   */
  keydown(event) {
    if (event.target === this.div && event.key === "Enter") {
      this.enableEditMode();
      this.editorDiv.focus();
    }
  }

  editorDivKeydown(event) {
    FreeTextEditor._keyboardManager.exec(this, event);
  }

  editorDivFocus(event) {
    this.isEditing = true;
  }

  editorDivBlur(event) {
    this.isEditing = false;
  }

  /** @inheritdoc */
  disableEditing() {
    this.editorDiv.setAttribute("role", "comment");
    this.editorDiv.removeAttribute("aria-multiline");
  }

  /** @inheritdoc */
  enableEditing() {
    this.editorDiv.setAttribute("role", "textbox");
    this.editorDiv.setAttribute("aria-multiline", true);
  }

  /** @inheritdoc */
  render() {
    if (this.div) {
      return this.div;
    }

    let baseX, baseY;
    if (this.width) {
      baseX = this.x;
      baseY = this.y;
    }

    super.render();
    this.editorDiv = document.createElement("div");
    this.editorDiv.className = "internal";

    this.editorDiv.setAttribute("id", `${this.id}-editor`);
    this.enableEditing();

    FreeTextEditor._l10nPromise
      .get("editor_free_text2_aria_label")
      .then(msg => this.editorDiv?.setAttribute("aria-label", msg));

    FreeTextEditor._l10nPromise
      .get("free_text2_default_content")
      .then(msg => this.editorDiv?.setAttribute("default-content", msg));
    this.editorDiv.contentEditable = true;

    const { style } = this.editorDiv;
    style.fontSize = `calc(${this.#fontSize}px * var(--scale-factor))`;
    style.color = this.#color;

    this.div.append(this.editorDiv);

    this.overlayDiv = document.createElement("div");
    this.overlayDiv.classList.add("overlay", "enabled");
    this.div.append(this.overlayDiv);

    // TODO: implement paste callback.
    // The goal is to sanitize and have something suitable for this
    // editor.
    bindEvents(this, this.div, ["dblclick", "keydown"]);

    if (this.width) {
      // This editor was created in using copy (ctrl+c).
      const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
      this.setAt(
        baseX * parentWidth,
        baseY * parentHeight,
        this.width * parentWidth,
        this.height * parentHeight
      );

      for (const line of this.#content.split("\n")) {
        const div = document.createElement("div");
        div.append(
          line ? document.createTextNode(line) : document.createElement("br")
        );
        this.editorDiv.append(div);
      }

      this.div.draggable = true;
      this.editorDiv.contentEditable = false;
    } else {
      this.div.draggable = false;
      this.editorDiv.contentEditable = true;
    }

    return this.div;
  }

  get contentDiv() {
    return this.editorDiv;
  }

  /** @inheritdoc */
  static deserialize(data, parent) {
    const editor = super.deserialize(data, parent);

    editor.#fontSize = data.fontSize;
    editor.#color = Util.makeHexColor(...data.color);
    editor.#content = data.value;

    return editor;
  }

  /** @inheritdoc */
  serialize() {
    if (this.isEmpty()) {
      return null;
    }

    const padding = FreeTextEditor._internalPadding * this.parent.scaleFactor;
    const rect = this.getRect(padding, padding);

    const color = AnnotationEditor._colorManager.convert(
      getComputedStyle(this.editorDiv).color
    );

    return {
      annotationType: AnnotationEditorType.FREETEXT,
      color,
      fontSize: this.#fontSize,
      value: this.#content,
      pageIndex: this.parent.pageIndex,
      rect,
      rotation: this.rotation,
    };
  }
}

export { FreeTextEditor };
