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

import { bindEvents, KeyboardManager } from "./tools.js";
import { AnnotationEditorType } from "../../shared/util.js";
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
  #boundClick;

  #boundMouseover;

  #editors = new Map();

  #uiManager;

  static _initialized = false;

  static _keyboardManager = new KeyboardManager([
    [["ctrl+a", "mac+meta+a"], AnnotationEditorLayer.prototype.selectAll],
    [["ctrl+c", "mac+meta+c"], AnnotationEditorLayer.prototype.copy],
    [["ctrl+v", "mac+meta+v"], AnnotationEditorLayer.prototype.paste],
    [["ctrl+x", "mac+meta+x"], AnnotationEditorLayer.prototype.cut],
    [["ctrl+z", "mac+meta+z"], AnnotationEditorLayer.prototype.undo],
    [
      ["ctrl+y", "ctrl+shift+Z", "mac+meta+shift+Z"],
      AnnotationEditorLayer.prototype.redo,
    ],
    [
      [
        "ctrl+Backspace",
        "mac+Backspace",
        "mac+ctrl+Backspace",
        "mac+alt+Backspace",
      ],
      AnnotationEditorLayer.prototype.suppress,
    ],
  ]);

  /**
   * @param {AnnotationEditorLayerOptions} options
   */
  constructor(options) {
    if (!AnnotationEditorLayer._initialized) {
      AnnotationEditorLayer._initialized = true;
      FreeTextEditor.initialize(options.l10n);

      options.uiManager.registerEditorTypes([FreeTextEditor, InkEditor]);
    }
    this.#uiManager = options.uiManager;
    this.annotationStorage = options.annotationStorage;
    this.pageIndex = options.pageIndex;
    this.div = options.div;
    this.#boundClick = this.click.bind(this);
    this.#boundMouseover = this.mouseover.bind(this);

    for (const editor of this.#uiManager.getEditors(options.pageIndex)) {
      this.add(editor);
    }

    this.#uiManager.addLayer(this);
  }

  /**
   * The mode has changed: it must be updated.
   * @param {number} mode
   */
  updateMode(mode) {
    switch (mode) {
      case AnnotationEditorType.INK:
        // We want to have the ink editor covering all of the page without
        // having to click to create it: it must be here when we start to draw.
        this.div.addEventListener("mouseover", this.#boundMouseover);
        this.div.removeEventListener("click", this.#boundClick);
        break;
      case AnnotationEditorType.FREETEXT:
        this.div.removeEventListener("mouseover", this.#boundMouseover);
        this.div.addEventListener("click", this.#boundClick);
        break;
      default:
        this.div.removeEventListener("mouseover", this.#boundMouseover);
        this.div.removeEventListener("click", this.#boundClick);
    }

    this.setActiveEditor(null);
  }

  /**
   * Mouseover callback.
   * @param {MouseEvent} event
   */
  mouseover(event) {
    if (
      event.target === this.div &&
      event.buttons === 0 &&
      !this.#uiManager.hasActive()
    ) {
      // The div is the target so there is no ink editor, hence we can
      // create a new one.
      // event.buttons === 0 is here to avoid adding a new ink editor
      // when we drop an editor.
      const editor = this.#createAndAddNewEditor(event);
      editor.setInBackground();
    }
  }

  /**
   * Add some commands into the CommandManager (undo/redo stuff).
   * @param {Object} params
   */
  addCommands(params) {
    this.#uiManager.addCommands(params);
  }

  /**
   * Undo the last command.
   */
  undo() {
    this.#uiManager.undo();
  }

  /**
   * Redo the last command.
   */
  redo() {
    this.#uiManager.redo();
  }

  /**
   * Suppress the selected editor or all editors.
   * @returns {undefined}
   */
  suppress() {
    this.#uiManager.suppress();
  }

  /**
   * Copy the selected editor.
   */
  copy() {
    this.#uiManager.copy();
  }

  /**
   * Cut the selected editor.
   */
  cut() {
    this.#uiManager.cut(this);
  }

  /**
   * Paste a previously copied editor.
   * @returns {undefined}
   */
  paste() {
    this.#uiManager.paste(this);
  }

  /**
   * Select all the editors.
   */
  selectAll() {
    this.#uiManager.selectAll();
  }

  /**
   * Unselect all the editors.
   */
  unselectAll() {
    this.#uiManager.unselectAll();
  }

  /**
   * Enable pointer events on the main div in order to enable
   * editor creation.
   */
  enable() {
    this.div.style.pointerEvents = "auto";
  }

  /**
   * Disable editor creation.
   */
  disable() {
    this.div.style.pointerEvents = "none";
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

    if (currentActive && currentActive !== editor) {
      currentActive.commitOrRemove();
    }

    if (editor) {
      this.unselectAll();
      this.div.removeEventListener("click", this.#boundClick);
    } else {
      // When in Ink mode, setting the editor to null allows the
      // user to have to make one click in order to start drawing.
      this.#uiManager.allowClick =
        this.#uiManager.getMode() === AnnotationEditorType.INK;
      this.div.addEventListener("click", this.#boundClick);
    }
  }

  attach(editor) {
    this.#editors.set(editor.id, editor);
  }

  detach(editor) {
    this.#editors.delete(editor.id);
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
    editor.div.remove();
    editor.isAttachedToDOM = false;
    if (this.#uiManager.isActive(editor) || this.#editors.size === 0) {
      this.setActiveEditor(null);
      this.#uiManager.allowClick = true;
    }
  }

  /**
   * An editor can have a different parent, for example after having
   * being dragged and droped from a page to another.
   * @param {AnnotationEditor} editor
   * @returns {undefined}
   */
  #changeParent(editor) {
    if (editor.parent === this) {
      return;
    }

    if (this.#uiManager.isActive(editor)) {
      editor.parent.setActiveEditor(null);
    }

    this.attach(editor);
    editor.pageIndex = this.pageIndex;
    editor.parent.detach(editor);
    editor.parent = this;
    if (editor.div && editor.isAttachedToDOM) {
      editor.div.remove();
      this.div.append(editor.div);
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
   * Create and add a new editor.
   * @param {MouseEvent} event
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
   * Mouseclick callback.
   * @param {MouseEvent} event
   * @returns {undefined}
   */
  click(event) {
    if (!this.#uiManager.allowClick) {
      this.#uiManager.allowClick = true;
      return;
    }

    this.#createAndAddNewEditor(event);
  }

  /**
   * Drag callback.
   * @param {DragEvent} event
   * @returns {undefined}
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
  }

  /**
   * Dragover callback.
   * @param {DragEvent} event
   */
  dragover(event) {
    event.preventDefault();
  }

  /**
   * Keydown callback.
   * @param {KeyboardEvent} event
   */
  keydown(event) {
    if (!this.#uiManager.getActive()?.shouldGetKeyboardEvents()) {
      AnnotationEditorLayer._keyboardManager.exec(this, event);
    }
  }

  /**
   * Destroy the main editor.
   */
  destroy() {
    for (const editor of this.#editors.values()) {
      editor.isAttachedToDOM = false;
      editor.div.remove();
      editor.parent = null;
      this.div = null;
    }
    this.#editors.clear();
    this.#uiManager.removeLayer(this);
  }

  /**
   * Render the main editor.
   * @param {Object} parameters
   */
  render(parameters) {
    this.viewport = parameters.viewport;
    bindEvents(this, this.div, ["dragover", "drop", "keydown"]);
    this.div.addEventListener("click", this.#boundClick);
    this.setDimensions();
  }

  /**
   * Update the main editor.
   * @param {Object} parameters
   */
  update(parameters) {
    this.setActiveEditor(null);
    this.viewport = parameters.viewport;
    this.setDimensions();
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
