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

import { bindEvents, ColorManager, KeyboardManager } from "./tools.js";
import { shadow, unreachable } from "../../shared/util.js";

/**
 * @typedef {Object} AnnotationEditorParameters
 * @property {AnnotationEditorLayer} parent - the layer containing this editor
 * @property {string} id - editor id
 * @property {number} x - x-coordinate
 * @property {number} y - y-coordinate
 */

/**
 * Base class for editors.
 */
class AnnotationEditor {
  #boundFocusin = this.focusin.bind(this);

  #boundFocusout = this.focusout.bind(this);

  #hasBeenSelected = false;

  #isEditing = false;

  #isInEditMode = false;

  #zIndex = AnnotationEditor._zIndex++;

  static _colorManager = new ColorManager();

  static _zIndex = 1;

  /**
   * @param {AnnotationEditorParameters} parameters
   */
  constructor(parameters) {
    if (this.constructor === AnnotationEditor) {
      unreachable("Cannot initialize AnnotationEditor.");
    }

    this.parent = parameters.parent;
    this.id = parameters.id;
    this.width = this.height = null;
    this.pageIndex = parameters.parent.pageIndex;
    this.name = parameters.name;
    this.div = null;

    const [width, height] = this.parent.viewportBaseDimensions;
    this.x = parameters.x / width;
    this.y = parameters.y / height;
    this.rotation = this.parent.viewport.rotation;

    this.isAttachedToDOM = false;
  }

  static get _defaultLineColor() {
    return shadow(
      this,
      "_defaultLineColor",
      this._colorManager.getHexCode("CanvasText")
    );
  }

  /**
   * This editor will be behind the others.
   */
  setInBackground() {
    this.div.style.zIndex = 0;
  }

  /**
   * This editor will be in the foreground.
   */
  setInForeground() {
    this.div.style.zIndex = this.#zIndex;
  }

  /**
   * onfocus callback.
   */
  focusin(event) {
    if (!this.#hasBeenSelected) {
      this.parent.setSelected(this);
    } else {
      this.#hasBeenSelected = false;
    }
  }

  /**
   * onblur callback.
   * @param {FocusEvent} event
   */
  focusout(event) {
    if (!this.isAttachedToDOM) {
      return;
    }

    // In case of focusout, the relatedTarget is the element which
    // is grabbing the focus.
    // So if the related target is an element under the div for this
    // editor, then the editor isn't unactive.
    const target = event.relatedTarget;
    if (target?.closest(`#${this.id}`)) {
      return;
    }

    event.preventDefault();

    if (!this.parent.isMultipleSelection) {
      this.commitOrRemove();
    }
  }

  commitOrRemove() {
    if (this.isEmpty()) {
      this.remove();
    } else {
      this.commit();
    }
  }

  /**
   * Commit the data contained in this editor.
   */
  commit() {
    this.parent.addToAnnotationStorage(this);
  }

  /**
   * We use drag-and-drop in order to move an editor on a page.
   * @param {DragEvent} event
   */
  dragstart(event) {
    const rect = this.parent.div.getBoundingClientRect();
    this.startX = event.clientX - rect.x;
    this.startY = event.clientY - rect.y;
    event.dataTransfer.setData("text/plain", this.id);
    event.dataTransfer.effectAllowed = "move";
  }

  /**
   * Set the editor position within its parent.
   * @param {number} x
   * @param {number} y
   * @param {number} tx - x-translation in screen coordinates.
   * @param {number} ty - y-translation in screen coordinates.
   */
  setAt(x, y, tx, ty) {
    const [width, height] = this.parent.viewportBaseDimensions;
    [tx, ty] = this.screenToPageTranslation(tx, ty);

    this.x = (x + tx) / width;
    this.y = (y + ty) / height;

    this.div.style.left = `${100 * this.x}%`;
    this.div.style.top = `${100 * this.y}%`;
  }

  /**
   * Translate the editor position within its parent.
   * @param {number} x - x-translation in screen coordinates.
   * @param {number} y - y-translation in screen coordinates.
   */
  translate(x, y) {
    const [width, height] = this.parent.viewportBaseDimensions;
    [x, y] = this.screenToPageTranslation(x, y);

    this.x += x / width;
    this.y += y / height;

    this.div.style.left = `${100 * this.x}%`;
    this.div.style.top = `${100 * this.y}%`;
  }

  /**
   * Convert a screen translation into a page one.
   * @param {number} x
   * @param {number} y
   */
  screenToPageTranslation(x, y) {
    const { rotation } = this.parent.viewport;
    switch (rotation) {
      case 90:
        return [y, -x];
      case 180:
        return [-x, -y];
      case 270:
        return [-y, x];
      default:
        return [x, y];
    }
  }

  /**
   * Set the dimensions of this editor.
   * @param {number} width
   * @param {number} height
   */
  setDims(width, height) {
    const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
    this.div.style.width = `${(100 * width) / parentWidth}%`;
    this.div.style.height = `${(100 * height) / parentHeight}%`;
  }

  /**
   * Get the translation used to position this editor when it's created.
   * @returns {Array<number>}
   */
  getInitialTranslation() {
    return [0, 0];
  }

  /**
   * Render this editor in a div.
   * @returns {HTMLDivElement}
   */
  render() {
    this.div = document.createElement("div");
    this.div.setAttribute("data-editor-rotation", (360 - this.rotation) % 360);
    this.div.className = this.name;
    this.div.setAttribute("id", this.id);
    this.div.setAttribute("tabIndex", 0);

    this.setInForeground();

    this.div.addEventListener("focusin", this.#boundFocusin);
    this.div.addEventListener("focusout", this.#boundFocusout);

    const [tx, ty] = this.getInitialTranslation();
    this.translate(tx, ty);

    bindEvents(this, this.div, ["dragstart", "pointerdown"]);

    return this.div;
  }

  /**
   * Onpointerdown callback.
   * @param {PointerEvent} event
   */
  pointerdown(event) {
    const isMac = KeyboardManager.platform.isMac;
    if (event.button !== 0 || (event.ctrlKey && isMac)) {
      // Avoid to focus this editor because of a non-left click.
      event.preventDefault();
      return;
    }

    if (
      (event.ctrlKey && !isMac) ||
      event.shiftKey ||
      (event.metaKey && isMac)
    ) {
      this.parent.toggleSelected(this);
    } else {
      this.parent.setSelected(this);
    }

    this.#hasBeenSelected = true;
  }

  getRect(tx, ty) {
    const [parentWidth, parentHeight] = this.parent.viewportBaseDimensions;
    const [pageWidth, pageHeight] = this.parent.pageDimensions;
    const shiftX = (pageWidth * tx) / parentWidth;
    const shiftY = (pageHeight * ty) / parentHeight;
    const x = this.x * pageWidth;
    const y = this.y * pageHeight;
    const width = this.width * pageWidth;
    const height = this.height * pageHeight;

    switch (this.rotation) {
      case 0:
        return [
          x + shiftX,
          pageHeight - y - shiftY - height,
          x + shiftX + width,
          pageHeight - y - shiftY,
        ];
      case 90:
        return [
          x + shiftY,
          pageHeight - y + shiftX,
          x + shiftY + height,
          pageHeight - y + shiftX + width,
        ];
      case 180:
        return [
          x - shiftX - width,
          pageHeight - y + shiftY,
          x - shiftX,
          pageHeight - y + shiftY + height,
        ];
      case 270:
        return [
          x - shiftY - height,
          pageHeight - y - shiftX - width,
          x - shiftY,
          pageHeight - y - shiftX,
        ];
      default:
        throw new Error("Invalid rotation");
    }
  }

  getRectInCurrentCoords(rect, pageHeight) {
    const [x1, y1, x2, y2] = rect;

    const width = x2 - x1;
    const height = y2 - y1;

    switch (this.rotation) {
      case 0:
        return [x1, pageHeight - y2, width, height];
      case 90:
        return [x1, pageHeight - y1, height, width];
      case 180:
        return [x2, pageHeight - y1, width, height];
      case 270:
        return [x2, pageHeight - y2, height, width];
      default:
        throw new Error("Invalid rotation");
    }
  }

  /**
   * Executed once this editor has been rendered.
   */
  onceAdded() {}

  /**
   * Check if the editor contains something.
   * @returns {boolean}
   */
  isEmpty() {
    return false;
  }

  /**
   * Enable edit mode.
   */
  enableEditMode() {
    this.#isInEditMode = true;
  }

  /**
   * Disable edit mode.
   */
  disableEditMode() {
    this.#isInEditMode = false;
  }

  /**
   * Check if the editor is edited.
   * @returns {boolean}
   */
  isInEditMode() {
    return this.#isInEditMode;
  }

  /**
   * If it returns true, then this editor handle the keyboard
   * events itself.
   * @returns {boolean}
   */
  shouldGetKeyboardEvents() {
    return false;
  }

  /**
   * Check if this editor needs to be rebuilt or not.
   * @returns {boolean}
   */
  needsToBeRebuilt() {
    return this.div && !this.isAttachedToDOM;
  }

  /**
   * Rebuild the editor in case it has been removed on undo.
   *
   * To implement in subclasses.
   */
  rebuild() {
    this.div?.addEventListener("focusin", this.#boundFocusin);
  }

  /**
   * Serialize the editor.
   * The result of the serialization will be used to construct a
   * new annotation to add to the pdf document.
   *
   * To implement in subclasses.
   */
  serialize() {
    unreachable("An editor must be serializable");
  }

  /**
   * Deserialize the editor.
   * The result of the deserialization is a new editor.
   *
   * @param {Object} data
   * @param {AnnotationEditorLayer} parent
   * @returns {AnnotationEditor}
   */
  static deserialize(data, parent) {
    const editor = new this.prototype.constructor({
      parent,
      id: parent.getNextId(),
    });
    editor.rotation = data.rotation;

    const [pageWidth, pageHeight] = parent.pageDimensions;
    const [x, y, width, height] = editor.getRectInCurrentCoords(
      data.rect,
      pageHeight
    );
    editor.x = x / pageWidth;
    editor.y = y / pageHeight;
    editor.width = width / pageWidth;
    editor.height = height / pageHeight;

    return editor;
  }

  /**
   * Remove this editor.
   * It's used on ctrl+backspace action.
   */
  remove() {
    this.div.removeEventListener("focusin", this.#boundFocusin);
    this.div.removeEventListener("focusout", this.#boundFocusout);

    if (!this.isEmpty()) {
      // The editor is removed but it can be back at some point thanks to
      // undo/redo so we must commit it before.
      this.commit();
    }
    this.parent.remove(this);
  }

  /**
   * Select this editor.
   */
  select() {
    this.div?.classList.add("selectedEditor");
  }

  /**
   * Unselect this editor.
   */
  unselect() {
    this.div?.classList.remove("selectedEditor");
  }

  /**
   * Update some parameters which have been changed through the UI.
   * @param {number} type
   * @param {*} value
   */
  updateParams(type, value) {}

  /**
   * When the user disables the editing mode some editors can change some of
   * their properties.
   */
  disableEditing() {}

  /**
   * When the user enables the editing mode some editors can change some of
   * their properties.
   */
  enableEditing() {}

  /**
   * Get some properties to update in the UI.
   * @returns {Object}
   */
  get propertiesToUpdate() {
    return {};
  }

  /**
   * Get the div which really contains the displayed content.
   */
  get contentDiv() {
    return this.div;
  }

  /**
   * If true then the editor is currently edited.
   * @type {boolean}
   */
  get isEditing() {
    return this.#isEditing;
  }

  /**
   * When set to true, it means that this editor is currently edited.
   * @param {boolean} value
   */
  set isEditing(value) {
    this.#isEditing = value;
    if (value) {
      this.parent.setSelected(this);
      this.parent.setActiveEditor(this);
    } else {
      this.parent.setActiveEditor(null);
    }
  }
}

export { AnnotationEditor };
