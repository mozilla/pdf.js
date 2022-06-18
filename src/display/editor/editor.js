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

import { unreachable, Util } from "../../shared/util.js";
import { bindEvents } from "./tools.js";

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
    this.x = Math.round(parameters.x);
    this.y = Math.round(parameters.y);

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
   * Get the pointer coordinates in order to correctly translate the
   * div in case of drag-and-drop.
   * @param {MouseEvent} event
   */
  mousedown(event) {
    this.mouseX = event.offsetX;
    this.mouseY = event.offsetY;
  }

  /**
   * We use drag-and-drop in order to move an editor on a page.
   * @param {DragEvent} event
   */
  dragstart(event) {
    event.dataTransfer.setData("text/plain", this.id);
    event.dataTransfer.effectAllowed = "move";
  }

  /**
   * Set the editor position within its parent.
   * @param {number} x
   * @param {number} y
   */
  setAt(x, y) {
    this.x = Math.round(x);
    this.y = Math.round(y);

    this.div.style.left = `${this.x}px`;
    this.div.style.top = `${this.y}px`;
  }

  /**
   * Translate the editor position within its parent.
   * @param {number} x
   * @param {number} y
   */
  translate(x, y) {
    this.setAt(this.x + x, this.y + y);
  }

  /**
   * Set the dimensions of this editor.
   * @param {number} width
   * @param {number} height
   */
  setDims(width, height) {
    this.div.style.width = `${width}px`;
    this.div.style.height = `${height}px`;
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
    this.div.className = this.name;
    this.div.setAttribute("id", this.id);
    this.div.tabIndex = 100;

    const [tx, ty] = this.getInitialTranslation();
    this.x = Math.round(this.x + tx);
    this.y = Math.round(this.y + ty);

    this.div.style.left = `${this.x}px`;
    this.div.style.top = `${this.y}px`;

    bindEvents(this, this.div, [
      "dragstart",
      "focusin",
      "focusout",
      "mousedown",
    ]);

    return this.div;
  }

  /**
   * Executed once this editor has been rendered.
   */
  onceAdded() {}

  /**
   * Apply the current transform (zoom) to this editor.
   * @param {Array<number>} transform
   */
  transform(transform) {
    const { style } = this.div;
    const width = parseFloat(style.width);
    const height = parseFloat(style.height);

    const [x1, y1] = Util.applyTransform([this.x, this.y], transform);

    if (!Number.isNaN(width)) {
      const [x2] = Util.applyTransform([this.x + width, 0], transform);
      this.div.style.width = `${x2 - x1}px`;
    }
    if (!Number.isNaN(height)) {
      const [, y2] = Util.applyTransform([0, this.y + height], transform);
      this.div.style.height = `${y2 - y1}px`;
    }
    this.setAt(x1, y1);
  }

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
}

export { AnnotationEditor };
