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

import { bindEvents } from "./tools.js";
import { unreachable } from "../../shared/util.js";

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
  #isInEditMode = false;

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

  /**
   * This editor will be behind the others.
   */
  setInBackground() {
    this.div.classList.add("background");
  }

  /**
   * This editor will be in the foreground.
   */
  setInForeground() {
    this.div.classList.remove("background");
  }

  /**
   * onfocus callback.
   */
  focusin(/* event */) {
    this.parent.setActiveEditor(this);
  }

  /**
   * onblur callback.
   * @param {FocusEvent} event
   * @returns {undefined}
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

    this.commitOrRemove();
    this.parent.setActiveEditor(null);
  }

  commitOrRemove() {
    if (this.isEmpty()) {
      this.remove();
    } else {
      this.commit();
    }
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
    this.div.tabIndex = 100;

    const [tx, ty] = this.getInitialTranslation();
    this.translate(tx, ty);

    bindEvents(this, this.div, ["dragstart", "focusin", "focusout"]);

    return this.div;
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
   * @returns {undefined}
   */
  enableEditMode() {
    this.#isInEditMode = true;
  }

  /**
   * Disable edit mode.
   * @returns {undefined}
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
   * Copy the elements of an editor in order to be able to build
   * a new one from these data.
   * It's used on ctrl+c action.
   *
   * To implement in subclasses.
   * @returns {AnnotationEditor}
   */
  copy() {
    unreachable("An editor must be copyable");
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
   * @returns {undefined}
   */
  rebuild() {
    unreachable("An editor must be rebuildable");
  }

  /**
   * Serialize the editor.
   * The result of the serialization will be used to construct a
   * new annotation to add to the pdf document.
   *
   * To implement in subclasses.
   * @returns {undefined}
   */
  serialize() {
    unreachable("An editor must be serializable");
  }

  /**
   * Remove this editor.
   * It's used on ctrl+backspace action.
   *
   * @returns {undefined}
   */
  remove() {
    this.parent.remove(this);
  }

  /**
   * Select this editor.
   */
  select() {
    if (this.div) {
      this.div.classList.add("selectedEditor");
    }
  }

  /**
   * Unselect this editor.
   */
  unselect() {
    if (this.div) {
      this.div.classList.remove("selectedEditor");
    }
  }

  /**
   * Update some parameters which have been changed through the UI.
   * @param {number} type
   * @param {*} value
   */
  updateParams(type, value) {}

  /**
   * Get some properties to update in the UI.
   * @returns {Object}
   */
  get propertiesToUpdate() {
    return {};
  }
}

export { AnnotationEditor };
