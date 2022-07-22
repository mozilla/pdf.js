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

/** @typedef {import("./editor.js").AnnotationEditor} AnnotationEditor */
// eslint-disable-next-line max-len
/** @typedef {import("./tools.js").AnnotationEditorUIManager} AnnotationEditorUIManager */
// eslint-disable-next-line max-len
/** @typedef {import("../annotation_storage.js").AnnotationStorage} AnnotationStorage */
/** @typedef {import("../../web/interfaces").IL10n} IL10n */

import { AnnotationEditorType, shadow } from "../../shared/util.js";
import { binarySearchFirstItem } from "../display_utils.js";
import { bindEvents } from "./tools.js";
import { FreeTextEditor } from "./freetext.js";
import { InkEditor } from "./ink.js";

/**
 * @typedef {Object} AnnotationEditorLayerOptions
 * @property {Object} mode
 * @property {HTMLDivElement} div
 * @property {AnnotationEditorUIManager} uiManager
 * @property {boolean} enabled
 * @property {AnnotationStorage} annotationStorag
 * @property {number} pageIndex
 * @property {IL10n} l10n
 */

/**
 * Manage all the different editors on a page.
 */
class AnnotationEditorLayer {
  #allowClick = false;

  #boundPointerup = this.pointerup.bind(this);

  #boundPointerdown = this.pointerdown.bind(this);

  #editors = new Map();

  #isCleaningUp = false;

  #textLayerMap = new WeakMap();

  #textNodes = new Map();

  #uiManager;

  #waitingEditors = new Set();

  static _initialized = false;

  /**
   * @param {AnnotationEditorLayerOptions} options
   */
  constructor(options) {
    if (!AnnotationEditorLayer._initialized) {
      AnnotationEditorLayer._initialized = true;
      FreeTextEditor.initialize(options.l10n);
      InkEditor.initialize(options.l10n);

      options.uiManager.registerEditorTypes([FreeTextEditor, InkEditor]);
    }
    this.#uiManager = options.uiManager;
    this.annotationStorage = options.annotationStorage;
    this.pageIndex = options.pageIndex;
    this.div = options.div;

    this.#uiManager.addLayer(this);
  }

  get textLayerElements() {
    // When zooming the text layer is removed from the DOM and sometimes
    // it's rebuilt hence the nodes are no longer valid.

    const textLayer = this.div.parentNode
      .getElementsByClassName("textLayer")
      .item(0);

    if (!textLayer) {
      return shadow(this, "textLayerElements", null);
    }

    let textChildren = this.#textLayerMap.get(textLayer);
    if (textChildren) {
      return textChildren;
    }

    textChildren = textLayer.querySelectorAll(`span[role="presentation"]`);
    if (textChildren.length === 0) {
      return shadow(this, "textLayerElements", null);
    }

    textChildren = Array.from(textChildren);
    textChildren.sort(AnnotationEditorLayer.#compareElementPositions);
    this.#textLayerMap.set(textLayer, textChildren);

    return textChildren;
  }

  get #hasTextLayer() {
    return !!this.div.parentNode.querySelector(".textLayer .endOfContent");
  }

  /**
   * Update the toolbar if it's required to reflect the tool currently used.
   * @param {number} mode
   */
  updateToolbar(mode) {
    this.#uiManager.updateToolbar(mode);
  }

  /**
   * The mode has changed: it must be updated.
   * @param {number} mode
   */
  updateMode(mode = this.#uiManager.getMode()) {
    this.#cleanup();
    if (mode === AnnotationEditorType.INK) {
      // We always want to an ink editor ready to draw in.
      this.addInkEditorIfNeeded(false);
      this.disableClick();
    } else {
      this.enableClick();
    }
    this.#uiManager.unselectAll();
  }

  addInkEditorIfNeeded(isCommitting) {
    if (
      !isCommitting &&
      this.#uiManager.getMode() !== AnnotationEditorType.INK
    ) {
      return;
    }

    if (!isCommitting) {
      // We're removing an editor but an empty one can already exist so in this
      // case we don't need to create a new one.
      for (const editor of this.#editors.values()) {
        if (editor.isEmpty()) {
          editor.setInBackground();
          return;
        }
      }
    }

    const editor = this.#createAndAddNewEditor({ offsetX: 0, offsetY: 0 });
    editor.setInBackground();
  }

  /**
   * Set the editing state.
   * @param {boolean} isEditing
   */
  setEditingState(isEditing) {
    this.#uiManager.setEditingState(isEditing);
  }

  /**
   * Add some commands into the CommandManager (undo/redo stuff).
   * @param {Object} params
   */
  addCommands(params) {
    this.#uiManager.addCommands(params);
  }

  /**
   * Enable pointer events on the main div in order to enable
   * editor creation.
   */
  enable() {
    this.div.style.pointerEvents = "auto";
    for (const editor of this.#editors.values()) {
      editor.enableEditing();
    }
  }

  /**
   * Disable editor creation.
   */
  disable() {
    this.div.style.pointerEvents = "none";
    for (const editor of this.#editors.values()) {
      editor.disableEditing();
    }
  }

  /**
   * Set the current editor.
   * @param {AnnotationEditor} editor
   */
  setActiveEditor(editor) {
    const currentActive = this.#uiManager.getActive();
    if (currentActive === editor) {
      return;
    }

    this.#uiManager.setActiveEditor(editor);
  }

  enableClick() {
    this.div.addEventListener("pointerdown", this.#boundPointerdown);
    this.div.addEventListener("pointerup", this.#boundPointerup);
  }

  disableClick() {
    this.div.removeEventListener("pointerdown", this.#boundPointerdown);
    this.div.removeEventListener("pointerup", this.#boundPointerup);
  }

  attach(editor) {
    this.#editors.set(editor.id, editor);
  }

  detach(editor) {
    this.#editors.delete(editor.id);
    this.removePointerInTextLayer(editor);
  }

  /**
   * Remove an editor.
   * @param {AnnotationEditor} editor
   */
  remove(editor) {
    // Since we can undo a removal we need to keep the
    // parent property as it is, so don't null it!

    this.#uiManager.removeEditor(editor);
    this.detach(editor);
    this.annotationStorage.removeKey(editor.id);
    editor.div.style.display = "none";
    setTimeout(() => {
      // When the div is removed from DOM the focus can move on the
      // document.body, so we just slightly postpone the removal in
      // order to let an element potentially grab the focus before
      // the body.
      editor.div.style.display = "";
      editor.div.remove();
      editor.isAttachedToDOM = false;
      if (document.activeElement === document.body) {
        this.#uiManager.focusMainContainer();
      }
    }, 0);

    if (!this.#isCleaningUp) {
      this.addInkEditorIfNeeded(/* isCommitting = */ false);
    }
  }

  /**
   * An editor can have a different parent, for example after having
   * being dragged and droped from a page to another.
   * @param {AnnotationEditor} editor
   */
  #changeParent(editor) {
    if (editor.parent === this) {
      return;
    }

    this.attach(editor);
    editor.pageIndex = this.pageIndex;
    editor.parent?.detach(editor);
    editor.parent = this;
    if (editor.div && editor.isAttachedToDOM) {
      editor.div.remove();
      this.div.append(editor.div);
    }
  }

  /**
   * Compare the positions of two elements, it must correspond to
   * the visual ordering.
   *
   * @param {HTMLElement} e1
   * @param {HTMLElement} e2
   * @returns {number}
   */
  static #compareElementPositions(e1, e2) {
    const rect1 = e1.getBoundingClientRect();
    const rect2 = e2.getBoundingClientRect();

    if (rect1.y + rect1.height <= rect2.y) {
      return -1;
    }

    if (rect2.y + rect2.height <= rect1.y) {
      return +1;
    }

    const centerX1 = rect1.x + rect1.width / 2;
    const centerX2 = rect2.x + rect2.width / 2;

    return centerX1 - centerX2;
  }

  /**
   * Function called when the text layer has finished rendering.
   */
  onTextLayerRendered() {
    this.#textNodes.clear();
    for (const editor of this.#waitingEditors) {
      if (editor.isAttachedToDOM) {
        this.addPointerInTextLayer(editor);
      }
    }
    this.#waitingEditors.clear();
  }

  /**
   * Remove an aria-owns id from a node in the text layer.
   * @param {AnnotationEditor} editor
   */
  removePointerInTextLayer(editor) {
    if (!this.#hasTextLayer) {
      this.#waitingEditors.delete(editor);
      return;
    }

    const { id } = editor;
    const node = this.#textNodes.get(id);
    if (!node) {
      return;
    }

    this.#textNodes.delete(id);
    let owns = node.getAttribute("aria-owns");
    if (owns?.includes(id)) {
      owns = owns
        .split(" ")
        .filter(x => x !== id)
        .join(" ");
      if (owns) {
        node.setAttribute("aria-owns", owns);
      } else {
        node.removeAttribute("aria-owns");
        node.setAttribute("role", "presentation");
      }
    }
  }

  /**
   * Find the text node which is the nearest and add an aria-owns attribute
   * in order to correctly position this editor in the text flow.
   * @param {AnnotationEditor} editor
   */
  addPointerInTextLayer(editor) {
    if (!this.#hasTextLayer) {
      // The text layer needs to be there, so we postpone the association.
      this.#waitingEditors.add(editor);
      return;
    }

    this.removePointerInTextLayer(editor);

    const children = this.textLayerElements;
    if (!children) {
      return;
    }
    const { contentDiv } = editor;
    const id = editor.getIdForTextLayer();

    const index = binarySearchFirstItem(
      children,
      node =>
        AnnotationEditorLayer.#compareElementPositions(contentDiv, node) < 0
    );
    const node = children[Math.max(0, index - 1)];
    const owns = node.getAttribute("aria-owns");
    if (!owns?.includes(id)) {
      node.setAttribute("aria-owns", owns ? `${owns} ${id}` : id);
    }
    node.removeAttribute("role");

    this.#textNodes.set(id, node);
  }

  /**
   * Move a div in the DOM in order to respect the visual order.
   * @param {HTMLDivElement} div
   */
  moveDivInDOM(editor) {
    this.addPointerInTextLayer(editor);

    const { div, contentDiv } = editor;
    if (!this.div.hasChildNodes()) {
      this.div.append(div);
      return;
    }

    const children = Array.from(this.div.childNodes).filter(
      node => node !== div
    );

    if (children.length === 0) {
      return;
    }

    const index = binarySearchFirstItem(
      children,
      node =>
        AnnotationEditorLayer.#compareElementPositions(contentDiv, node) < 0
    );

    if (index === 0) {
      children[0].before(div);
    } else {
      children[index - 1].after(div);
    }
  }

  /**
   * Add a new editor in the current view.
   * @param {AnnotationEditor} editor
   */
  add(editor) {
    this.#changeParent(editor);
    this.annotationStorage.setValue(editor.id, editor);
    this.#uiManager.addEditor(editor);
    this.attach(editor);

    if (!editor.isAttachedToDOM) {
      const div = editor.render();
      this.div.append(div);
      editor.isAttachedToDOM = true;
    }

    this.moveDivInDOM(editor);
    editor.onceAdded();
  }

  /**
   * Add or rebuild depending if it has been removed or not.
   * @param {AnnotationEditor} editor
   */
  addOrRebuild(editor) {
    if (editor.needsToBeRebuilt()) {
      editor.rebuild();
    } else {
      this.add(editor);
    }
  }

  /**
   * Add a new editor and make this addition undoable.
   * @param {AnnotationEditor} editor
   */
  addANewEditor(editor) {
    const cmd = () => {
      this.addOrRebuild(editor);
    };
    const undo = () => {
      editor.remove();
    };

    this.addCommands({ cmd, undo, mustExec: true });
  }

  /**
   * Add a new editor and make this addition undoable.
   * @param {AnnotationEditor} editor
   */
  addUndoableEditor(editor) {
    const cmd = () => {
      this.addOrRebuild(editor);
    };
    const undo = () => {
      editor.remove();
    };

    this.addCommands({ cmd, undo, mustExec: false });
  }

  /**
   * Get an id for an editor.
   * @returns {string}
   */
  getNextId() {
    return this.#uiManager.getId();
  }

  /**
   * Create a new editor
   * @param {Object} params
   * @returns {AnnotationEditor}
   */
  #createNewEditor(params) {
    switch (this.#uiManager.getMode()) {
      case AnnotationEditorType.FREETEXT:
        return new FreeTextEditor(params);
      case AnnotationEditorType.INK:
        return new InkEditor(params);
    }
    return null;
  }

  /**
   * Create a new editor
   * @param {Object} data
   * @returns {AnnotationEditor}
   */
  deserialize(data) {
    switch (data.annotationType) {
      case AnnotationEditorType.FREETEXT:
        return FreeTextEditor.deserialize(data, this);
      case AnnotationEditorType.INK:
        return InkEditor.deserialize(data, this);
    }
    return null;
  }

  /**
   * Create and add a new editor.
   * @param {PointerEvent} event
   * @returns {AnnotationEditor}
   */
  #createAndAddNewEditor(event) {
    const id = this.getNextId();
    const editor = this.#createNewEditor({
      parent: this,
      id,
      x: event.offsetX,
      y: event.offsetY,
    });
    if (editor) {
      this.add(editor);
    }

    return editor;
  }

  /**
   * Set the last selected editor.
   * @param {AnnotationEditor} editor
   */
  setSelected(editor) {
    this.#uiManager.setSelected(editor);
  }

  /**
   * Check if the editor is selected.
   * @param {AnnotationEditor} editor
   */
  isSelected(editor) {
    return this.#uiManager.isSelected(editor);
  }

  /**
   * Unselect an editor.
   * @param {AnnotationEditor} editor
   */
  unselect(editor) {
    this.#uiManager.unselect(editor);
  }

  get isMultipleSelection() {
    return this.#uiManager.isMultipleSelection;
  }

  /**
   * An editor just got a mousedown with ctrl key pressed.
   * @param {boolean}} isMultiple
   */
  set isMultipleSelection(isMultiple) {
    this.#uiManager.isMultipleSelection = isMultiple;
  }

  /**
   * Pointerup callback.
   * @param {PointerEvent} event
   */
  pointerup(event) {
    if (event.target !== this.div) {
      return;
    }

    if (!this.#allowClick) {
      this.#allowClick = true;
      return;
    }

    this.#createAndAddNewEditor(event);
  }

  /**
   * Pointerdown callback.
   * @param {PointerEvent} event
   */
  pointerdown(event) {
    if (event.target !== this.div) {
      return;
    }

    const editor = this.#uiManager.getActive();
    this.#allowClick = !editor || editor.isEmpty();
  }

  /**
   * Drag callback.
   * @param {DragEvent} event
   */
  drop(event) {
    const id = event.dataTransfer.getData("text/plain");
    const editor = this.#uiManager.getEditor(id);
    if (!editor) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    this.#changeParent(editor);

    const rect = this.div.getBoundingClientRect();
    const endX = event.clientX - rect.x;
    const endY = event.clientY - rect.y;

    editor.translate(endX - editor.startX, endY - editor.startY);
    this.moveDivInDOM(editor);
    editor.div.focus();
  }

  /**
   * Dragover callback.
   * @param {DragEvent} event
   */
  dragover(event) {
    event.preventDefault();
  }

  /**
   * Destroy the main editor.
   */
  destroy() {
    if (this.#uiManager.getActive()?.parent === this) {
      this.#uiManager.setActiveEditor(null);
    }

    for (const editor of this.#editors.values()) {
      this.removePointerInTextLayer(editor);
      editor.isAttachedToDOM = false;
      editor.div.remove();
      editor.parent = null;
    }
    this.#textNodes.clear();
    this.div = null;
    this.#editors.clear();
    this.#waitingEditors.clear();
    this.#uiManager.removeLayer(this);
  }

  #cleanup() {
    // When we're cleaning up, some editors are removed but we don't want
    // to add a new one which will induce an addition in this.#editors, hence
    // an infinite loop.
    this.#isCleaningUp = true;
    for (const editor of this.#editors.values()) {
      if (editor.isEmpty()) {
        editor.remove();
      }
    }
    this.#isCleaningUp = false;
  }

  /**
   * Render the main editor.
   * @param {Object} parameters
   */
  render(parameters) {
    this.viewport = parameters.viewport;
    bindEvents(this, this.div, ["dragover", "drop"]);
    this.setDimensions();
    for (const editor of this.#uiManager.getEditors(this.pageIndex)) {
      this.add(editor);
    }
    this.updateMode();
  }

  /**
   * Update the main editor.
   * @param {Object} parameters
   */
  update(parameters) {
    this.viewport = parameters.viewport;
    this.setDimensions();
    this.updateMode();
  }

  /**
   * Get the scale factor from the viewport.
   * @returns {number}
   */
  get scaleFactor() {
    return this.viewport.scale;
  }

  /**
   * Get page dimensions.
   * @returns {Object} dimensions.
   */
  get pageDimensions() {
    const [pageLLx, pageLLy, pageURx, pageURy] = this.viewport.viewBox;
    const width = pageURx - pageLLx;
    const height = pageURy - pageLLy;

    return [width, height];
  }

  get viewportBaseDimensions() {
    const { width, height, rotation } = this.viewport;
    return rotation % 180 === 0 ? [width, height] : [height, width];
  }

  /**
   * Set the dimensions of the main div.
   */
  setDimensions() {
    const { width, height, rotation } = this.viewport;

    const flipOrientation = rotation % 180 !== 0,
      widthStr = Math.floor(width) + "px",
      heightStr = Math.floor(height) + "px";

    this.div.style.width = flipOrientation ? heightStr : widthStr;
    this.div.style.height = flipOrientation ? widthStr : heightStr;
    this.div.setAttribute("data-main-rotation", rotation);
  }
}

export { AnnotationEditorLayer };
