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
  shadow,
  Util,
} from "../../shared/util.js";
import { bindEvents, KeyboardManager } from "./tools.js";
import { AnnotationEditor } from "./editor.js";
import { FreeTextAnnotationElement } from "../annotation_layer.js";

/**
 * Basic text editor in order to create a FreeTex annotation.
 */
class FreeTextEditor extends AnnotationEditor {
  #boundEditorDivBlur = this.editorDivBlur.bind(this);

  #boundEditorDivFocus = this.editorDivFocus.bind(this);

  #boundEditorDivInput = this.editorDivInput.bind(this);

  #boundEditorDivKeydown = this.editorDivKeydown.bind(this);

  #color;

  #content = "";

  #editorDivId = `${this.id}-editor`;

  #fontSize;

  #initialData = null;

  static _freeTextDefaultContent = "";

  static _l10nPromise;

  static _internalPadding = 0;

  static _defaultColor = null;

  static _defaultFontSize = 10;

  static get _keyboardManager() {
    return shadow(
      this,
      "_keyboardManager",
      new KeyboardManager([
        [
          // Commit the text in case the user use ctrl+s to save the document.
          // The event must bubble in order to be caught by the viewer.
          // See bug 1831574.
          ["ctrl+s", "mac+meta+s", "ctrl+p", "mac+meta+p"],
          FreeTextEditor.prototype.commitOrRemove,
          /* bubbles = */ true,
        ],
        [
          ["ctrl+Enter", "mac+meta+Enter", "Escape", "mac+Escape"],
          FreeTextEditor.prototype.commitOrRemove,
        ],
      ])
    );
  }

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

    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
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
      this.translate(0, -(size - this.#fontSize) * this.parentScale);
      this.#fontSize = size;
      this.#setEditorDimensions();
    };
    const savedFontsize = this.#fontSize;
    this.addCommands({
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
    this.addCommands({
      cmd: () => {
        this.#color = this.editorDiv.style.color = color;
      },
      undo: () => {
        this.#color = this.editorDiv.style.color = savedColor;
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
    const scale = this.parentScale;
    return [
      -FreeTextEditor._internalPadding * scale,
      -(FreeTextEditor._internalPadding + this.#fontSize) * scale,
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
    this.overlayDiv.classList.remove("enabled");
    this.editorDiv.contentEditable = true;
    this.div.draggable = false;
    this.div.removeAttribute("aria-activedescendant");
    this.editorDiv.addEventListener("keydown", this.#boundEditorDivKeydown);
    this.editorDiv.addEventListener("focus", this.#boundEditorDivFocus);
    this.editorDiv.addEventListener("blur", this.#boundEditorDivBlur);
    this.editorDiv.addEventListener("input", this.#boundEditorDivInput);
  }

  /** @inheritdoc */
  disableEditMode() {
    if (!this.isInEditMode()) {
      return;
    }

    this.parent.setEditingState(true);
    super.disableEditMode();
    this.overlayDiv.classList.add("enabled");
    this.editorDiv.contentEditable = false;
    this.div.setAttribute("aria-activedescendant", this.#editorDivId);
    this.div.draggable = true;
    this.editorDiv.removeEventListener("keydown", this.#boundEditorDivKeydown);
    this.editorDiv.removeEventListener("focus", this.#boundEditorDivFocus);
    this.editorDiv.removeEventListener("blur", this.#boundEditorDivBlur);
    this.editorDiv.removeEventListener("input", this.#boundEditorDivInput);

    // On Chrome, the focus is given to <body> when contentEditable is set to
    // false, hence we focus the div.
    this.div.focus({
      preventScroll: true /* See issue #15744 */,
    });

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
      this.#cheatInitialRect();
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
    for (const div of divs) {
      buffer.push(div.innerText.replace(/\r\n?|\n/, ""));
    }
    return buffer.join("\n");
  }

  #setEditorDimensions() {
    const [parentWidth, parentHeight] = this.parentDimensions;

    let rect;
    if (this.isAttachedToDOM) {
      rect = this.div.getBoundingClientRect();
    } else {
      // This editor isn't on screen but we need to get its dimensions, so
      // we just insert it in the DOM, get its bounding box and then remove it.
      const { currentLayer, div } = this;
      const savedDisplay = div.style.display;
      div.style.display = "hidden";
      currentLayer.div.append(this.div);
      rect = div.getBoundingClientRect();
      div.remove();
      div.style.display = savedDisplay;
    }

    // The dimensions are relative to the rotation of the page, hence we need to
    // take that into account (see issue #16636).
    if (this.rotation % 180 === this.parentRotation % 180) {
      this.width = rect.width / parentWidth;
      this.height = rect.height / parentHeight;
    } else {
      this.width = rect.height / parentWidth;
      this.height = rect.width / parentHeight;
    }
  }

  /**
   * Commit the content we have in this editor.
   * @returns {undefined}
   */
  commit() {
    if (!this.isInEditMode()) {
      return;
    }

    super.commit();
    this.disableEditMode();
    const savedText = this.#content;
    const newText = (this.#content = this.#extractText().trimEnd());
    if (savedText === newText) {
      return;
    }

    const setText = text => {
      this.#content = text;
      if (!text) {
        this.remove();
        return;
      }
      this.#setContent();
      this.rebuild();
      this.#setEditorDimensions();
    };
    this.addCommands({
      cmd: () => {
        setText(newText);
      },
      undo: () => {
        setText(savedText);
      },
      mustExec: false,
    });
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

  editorDivInput(event) {
    this.parent.div.classList.toggle("freeTextEditing", this.isEmpty());
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

    this.editorDiv.setAttribute("id", this.#editorDivId);
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
      const [parentWidth, parentHeight] = this.parentDimensions;
      if (this.annotationElementId) {
        const [tx] = this.getInitialTranslation();
        this.setAt(baseX * parentWidth, baseY * parentHeight, tx, tx);
      } else {
        this.setAt(
          baseX * parentWidth,
          baseY * parentHeight,
          this.width * parentWidth,
          this.height * parentHeight
        );
      }

      this.#setContent();
      this.div.draggable = true;
      this.editorDiv.contentEditable = false;
    } else {
      this.div.draggable = false;
      this.editorDiv.contentEditable = true;
    }

    return this.div;
  }

  #setContent() {
    this.editorDiv.replaceChildren();
    if (!this.#content) {
      return;
    }
    for (const line of this.#content.split("\n")) {
      const div = document.createElement("div");
      div.append(
        line ? document.createTextNode(line) : document.createElement("br")
      );
      this.editorDiv.append(div);
    }
  }

  get contentDiv() {
    return this.editorDiv;
  }

  /** @inheritdoc */
  static deserialize(data, parent, uiManager) {
    let initialData = null;
    if (data instanceof FreeTextAnnotationElement) {
      const {
        data: {
          defaultAppearanceData: { fontSize, fontColor },
          rect,
          rotation,
          id,
        },
        textContent,
        parent: {
          page: { pageNumber },
        },
      } = data;
      // textContent is supposed to be an array of strings containing each line
      // of text. However, it can be null or empty.
      if (!textContent || textContent.length === 0) {
        // Empty annotation.
        return null;
      }
      initialData = data = {
        annotationType: AnnotationEditorType.FREETEXT,
        color: Array.from(fontColor),
        fontSize,
        value: textContent.join("\n"),
        pageIndex: pageNumber - 1,
        rect,
        rotation,
        id,
        deleted: false,
      };
    }
    const editor = super.deserialize(data, parent, uiManager);

    editor.#fontSize = data.fontSize;
    editor.#color = Util.makeHexColor(...data.color);
    editor.#content = data.value;
    editor.annotationElementId = data.id || null;
    editor.#initialData = initialData;

    return editor;
  }

  /** @inheritdoc */
  serialize(isForCopying = false) {
    if (this.isEmpty()) {
      return null;
    }

    if (this.deleted) {
      return {
        pageIndex: this.pageIndex,
        id: this.annotationElementId,
        deleted: true,
      };
    }

    const padding = FreeTextEditor._internalPadding * this.parentScale;
    const rect = this.getRect(padding, padding);
    const color = AnnotationEditor._colorManager.convert(
      this.isAttachedToDOM
        ? getComputedStyle(this.editorDiv).color
        : this.#color
    );

    const serialized = {
      annotationType: AnnotationEditorType.FREETEXT,
      color,
      fontSize: this.#fontSize,
      value: this.#content,
      pageIndex: this.pageIndex,
      rect,
      rotation: this.rotation,
    };

    if (isForCopying) {
      // Don't add the id when copying because the pasted editor mustn't be
      // linked to an existing annotation.
      return serialized;
    }

    if (this.annotationElementId && !this.#hasElementChanged(serialized)) {
      return null;
    }

    serialized.id = this.annotationElementId;

    return serialized;
  }

  #hasElementChanged(serialized) {
    const { value, fontSize, color, rect, pageIndex } = this.#initialData;

    return (
      serialized.value !== value ||
      serialized.fontSize !== fontSize ||
      serialized.rect.some((x, i) => Math.abs(x - rect[i]) >= 1) ||
      serialized.color.some((c, i) => c !== color[i]) ||
      serialized.pageIndex !== pageIndex
    );
  }

  #cheatInitialRect(delayed = false) {
    // The annotation has a rect but the editor has an other one.
    // When we want to know if the annotation has changed (e.g. has been moved)
    // we must compare the editor initial rect with the current one.
    // So this method is a hack to have a way to compare the real rects.
    if (!this.annotationElementId) {
      return;
    }

    this.#setEditorDimensions();
    if (!delayed && (this.width === 0 || this.height === 0)) {
      setTimeout(() => this.#cheatInitialRect(/* delayed = */ true), 0);
      return;
    }

    const padding = FreeTextEditor._internalPadding * this.parentScale;
    this.#initialData.rect = this.getRect(padding, padding);
  }
}

export { FreeTextEditor };
