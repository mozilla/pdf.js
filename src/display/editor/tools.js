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
/** @typedef {import("./annotation_editor_layer.js").AnnotationEditorLayer} AnnotationEditorLayer */

import {
  AnnotationEditorPrefix,
  AnnotationEditorType,
  shadow,
  Util,
} from "../../shared/util.js";
import { getColorValues, getRGB } from "../display_utils.js";

function bindEvents(obj, element, names) {
  for (const name of names) {
    element.addEventListener(name, obj[name].bind(obj));
  }
}
/**
 * Class to create some unique ids for the different editors.
 */
class IdManager {
  #id = 0;

  /**
   * Get a unique id.
   * @returns {string}
   */
  getId() {
    return `${AnnotationEditorPrefix}${this.#id++}`;
  }
}

/**
 * Class to handle undo/redo.
 * Commands are just saved in a buffer.
 * If we hit some memory issues we could likely use a circular buffer.
 * It has to be used as a singleton.
 */
class CommandManager {
  #commands = [];

  #maxSize = 100;

  // When the position is NaN, it means the buffer is empty.
  #position = NaN;

  #start = 0;

  /**
   * Add a new couple of commands to be used in case of redo/undo.
   * @param {function} cmd
   * @param {function} undo
   * @param {boolean} mustExec
   * @param {number} type
   * @param {boolean} overwriteIfSameType
   * @param {boolean} keepUndo
   */
  add({
    cmd,
    undo,
    mustExec,
    type = NaN,
    overwriteIfSameType = false,
    keepUndo = false,
  }) {
    const save = { cmd, undo, type };
    if (
      overwriteIfSameType &&
      !isNaN(this.#position) &&
      this.#commands[this.#position].type === type
    ) {
      // For example when we change a color we don't want to
      // be able to undo all the steps, hence we only want to
      // keep the last undoable action in this sequence of actions.
      if (keepUndo) {
        save.undo = this.#commands[this.#position].undo;
      }
      this.#commands[this.#position] = save;
      if (mustExec) {
        cmd();
      }
      return;
    }
    const next = (this.#position + 1) % this.#maxSize;
    if (next !== this.#start) {
      if (this.#start < next) {
        this.#commands = this.#commands.slice(this.#start, next);
      } else {
        this.#commands = this.#commands
          .slice(this.#start)
          .concat(this.#commands.slice(0, next));
      }
      this.#start = 0;
      this.#position = this.#commands.length - 1;
    }
    this.#setCommands(save);

    if (mustExec) {
      cmd();
    }
  }

  /**
   * Undo the last command.
   */
  undo() {
    if (isNaN(this.#position)) {
      // Nothing to undo.
      return;
    }
    this.#commands[this.#position].undo();
    if (this.#position === this.#start) {
      this.#position = NaN;
    } else {
      this.#position = (this.#maxSize + this.#position - 1) % this.#maxSize;
    }
  }

  /**
   * Redo the last command.
   */
  redo() {
    if (isNaN(this.#position)) {
      if (this.#start < this.#commands.length) {
        this.#commands[this.#start].cmd();
        this.#position = this.#start;
      }
      return;
    }

    const next = (this.#position + 1) % this.#maxSize;
    if (next !== this.#start && next < this.#commands.length) {
      this.#commands[next].cmd();
      this.#position = next;
    }
  }

  /**
   * Check if there is something to undo.
   * @returns {boolean}
   */
  hasSomethingToUndo() {
    return !isNaN(this.#position);
  }

  /**
   * Check if there is something to redo.
   * @returns {boolean}
   */
  hasSomethingToRedo() {
    if (isNaN(this.#position) && this.#start < this.#commands.length) {
      return true;
    }
    const next = (this.#position + 1) % this.#maxSize;
    return next !== this.#start && next < this.#commands.length;
  }

  #setCommands(cmds) {
    if (this.#commands.length < this.#maxSize) {
      this.#commands.push(cmds);
      this.#position = isNaN(this.#position) ? 0 : this.#position + 1;
      return;
    }

    if (isNaN(this.#position)) {
      this.#position = this.#start;
    } else {
      this.#position = (this.#position + 1) % this.#maxSize;
      if (this.#position === this.#start) {
        this.#start = (this.#start + 1) % this.#maxSize;
      }
    }
    this.#commands[this.#position] = cmds;
  }

  destroy() {
    this.#commands = null;
  }
}

/**
 * Class to handle the different keyboards shortcuts we can have on mac or
 * non-mac OSes.
 */
class KeyboardManager {
  /**
   * Create a new keyboard manager class.
   * @param {Array<Array>} callbacks - an array containing an array of shortcuts
   * and a callback to call.
   * A shortcut is a string like `ctrl+c` or `mac+ctrl+c` for mac OS.
   */
  constructor(callbacks) {
    this.buffer = [];
    this.callbacks = new Map();
    this.allKeys = new Set();

    const isMac = KeyboardManager.platform.isMac;
    for (const [keys, callback] of callbacks) {
      for (const key of keys) {
        const isMacKey = key.startsWith("mac+");
        if (isMac && isMacKey) {
          this.callbacks.set(key.slice(4), callback);
          this.allKeys.add(key.split("+").at(-1));
        } else if (!isMac && !isMacKey) {
          this.callbacks.set(key, callback);
          this.allKeys.add(key.split("+").at(-1));
        }
      }
    }
  }

  static get platform() {
    const platform = typeof navigator !== "undefined" ? navigator.platform : "";

    return shadow(this, "platform", {
      isWin: platform.includes("Win"),
      isMac: platform.includes("Mac"),
    });
  }

  /**
   * Serialize an event into a string in order to match a
   * potential key for a callback.
   * @param {KeyboardEvent} event
   * @returns {string}
   */
  #serialize(event) {
    if (event.altKey) {
      this.buffer.push("alt");
    }
    if (event.ctrlKey) {
      this.buffer.push("ctrl");
    }
    if (event.metaKey) {
      this.buffer.push("meta");
    }
    if (event.shiftKey) {
      this.buffer.push("shift");
    }
    this.buffer.push(event.key);
    const str = this.buffer.join("+");
    this.buffer.length = 0;

    return str;
  }

  /**
   * Execute a callback, if any, for a given keyboard event.
   * The page is used as `this` in the callback.
   * @param {AnnotationEditorLayer} page.
   * @param {KeyboardEvent} event
   * @returns
   */
  exec(page, event) {
    if (!this.allKeys.has(event.key)) {
      return;
    }
    const callback = this.callbacks.get(this.#serialize(event));
    if (!callback) {
      return;
    }
    callback.bind(page)();
    event.preventDefault();
  }
}

/**
 * Basic clipboard to copy/paste some editors.
 * It has to be used as a singleton.
 */
class ClipboardManager {
  #elements = null;

  /**
   * Copy an element.
   * @param {AnnotationEditor|Array<AnnotationEditor>} element
   */
  copy(element) {
    if (!element) {
      return;
    }
    if (Array.isArray(element)) {
      this.#elements = element.map(el => el.serialize());
    } else {
      this.#elements = [element.serialize()];
    }
    this.#elements = this.#elements.filter(el => !!el);
    if (this.#elements.length === 0) {
      this.#elements = null;
    }
  }

  /**
   * Create a new element.
   * @returns {AnnotationEditor|null}
   */
  paste() {
    return this.#elements;
  }

  /**
   * Check if the clipboard is empty.
   * @returns {boolean}
   */
  isEmpty() {
    return this.#elements === null;
  }

  destroy() {
    this.#elements = null;
  }
}

class ColorManager {
  static _colorsMapping = new Map([
    ["CanvasText", [0, 0, 0]],
    ["Canvas", [255, 255, 255]],
  ]);

  get _colors() {
    if (
      typeof PDFJSDev !== "undefined" &&
      PDFJSDev.test("LIB") &&
      typeof document === "undefined"
    ) {
      return shadow(this, "_colors", ColorManager._colorsMapping);
    }

    const colors = new Map([
      ["CanvasText", null],
      ["Canvas", null],
    ]);
    getColorValues(colors);
    return shadow(this, "_colors", colors);
  }

  /**
   * In High Contrast Mode, the color on the screen is not always the
   * real color used in the pdf.
   * For example in some cases white can appear to be black but when saving
   * we want to have white.
   * @param {string} color
   * @returns {Array<number>}
   */
  convert(color) {
    const rgb = getRGB(color);
    if (!window.matchMedia("(forced-colors: active)").matches) {
      return rgb;
    }

    for (const [name, RGB] of this._colors) {
      if (RGB.every((x, i) => x === rgb[i])) {
        return ColorManager._colorsMapping.get(name);
      }
    }
    return rgb;
  }

  /**
   * An input element must have its color value as a hex string
   * and not as color name.
   * So this function converts a name into an hex string.
   * @param {string} name
   * @returns {string}
   */
  getHexCode(name) {
    const rgb = this._colors.get(name);
    if (!rgb) {
      return name;
    }
    return Util.makeHexColor(...rgb);
  }
}

/**
 * A pdf has several pages and each of them when it will rendered
 * will have an AnnotationEditorLayer which will contain the some
 * new Annotations associated to an editor in order to modify them.
 *
 * This class is used to manage all the different layers, editors and
 * some action like copy/paste, undo/redo, ...
 */
class AnnotationEditorUIManager {
  #activeEditor = null;

  #allEditors = new Map();

  #allLayers = new Map();

  #clipboardManager = new ClipboardManager();

  #commandManager = new CommandManager();

  #currentPageIndex = 0;

  #editorTypes = null;

  #eventBus = null;

  #idManager = new IdManager();

  #isAllSelected = false;

  #isEnabled = false;

  #mode = AnnotationEditorType.NONE;

  #previousActiveEditor = null;

  #boundOnEditingAction = this.onEditingAction.bind(this);

  #boundOnPageChanging = this.onPageChanging.bind(this);

  #boundOnTextLayerRendered = this.onTextLayerRendered.bind(this);

  #previousStates = {
    isEditing: false,
    isEmpty: true,
    hasEmptyClipboard: true,
    hasSomethingToUndo: false,
    hasSomethingToRedo: false,
    hasSelectedEditor: false,
  };

  constructor(eventBus) {
    this.#eventBus = eventBus;
    this.#eventBus._on("editingaction", this.#boundOnEditingAction);
    this.#eventBus._on("pagechanging", this.#boundOnPageChanging);
    this.#eventBus._on("textlayerrendered", this.#boundOnTextLayerRendered);
  }

  destroy() {
    this.#eventBus._off("editingaction", this.#boundOnEditingAction);
    this.#eventBus._off("pagechanging", this.#boundOnPageChanging);
    this.#eventBus._off("textlayerrendered", this.#boundOnTextLayerRendered);
    for (const layer of this.#allLayers.values()) {
      layer.destroy();
    }
    this.#allLayers.clear();
    this.#allEditors.clear();
    this.#activeEditor = null;
    this.#clipboardManager.destroy();
    this.#commandManager.destroy();
  }

  onPageChanging({ pageNumber }) {
    this.#currentPageIndex = pageNumber - 1;
  }

  onTextLayerRendered({ pageNumber }) {
    const pageIndex = pageNumber - 1;
    const layer = this.#allLayers.get(pageIndex);
    layer?.onTextLayerRendered();
  }

  /**
   * Execute an action for a given name.
   * For example, the user can click on the "Undo" entry in the context menu
   * and it'll trigger the undo action.
   * @param {Object} details
   */
  onEditingAction(details) {
    if (
      ["undo", "redo", "cut", "copy", "paste", "delete", "selectAll"].includes(
        details.name
      )
    ) {
      this[details.name]();
    }
  }

  /**
   * Update the different possible states of this manager, e.g. is the clipboard
   * empty or is there something to undo, ...
   * @param {Object} details
   */
  #dispatchUpdateStates(details) {
    const hasChanged = Object.entries(details).some(
      ([key, value]) => this.#previousStates[key] !== value
    );

    if (hasChanged) {
      this.#eventBus.dispatch("annotationeditorstateschanged", {
        source: this,
        details: Object.assign(this.#previousStates, details),
      });
    }
  }

  #dispatchUpdateUI(details) {
    this.#eventBus.dispatch("annotationeditorparamschanged", {
      source: this,
      details,
    });
  }

  /**
   * Set the editing state.
   * It can be useful to temporarily disable it when the user is editing a
   * FreeText annotation.
   * @param {boolean} isEditing
   */
  setEditingState(isEditing) {
    if (isEditing) {
      this.#dispatchUpdateStates({
        isEditing: this.#mode !== AnnotationEditorType.NONE,
        isEmpty: this.#isEmpty(),
        hasSomethingToUndo: this.#commandManager.hasSomethingToUndo(),
        hasSomethingToRedo: this.#commandManager.hasSomethingToRedo(),
        hasSelectedEditor: false,
        hasEmptyClipboard: this.#clipboardManager.isEmpty(),
      });
    } else {
      this.#dispatchUpdateStates({
        isEditing: false,
      });
    }
  }

  registerEditorTypes(types) {
    this.#editorTypes = types;
    for (const editorType of this.#editorTypes) {
      this.#dispatchUpdateUI(editorType.defaultPropertiesToUpdate);
    }
  }

  /**
   * Get an id.
   * @returns {string}
   */
  getId() {
    return this.#idManager.getId();
  }

  /**
   * Add a new layer for a page which will contains the editors.
   * @param {AnnotationEditorLayer} layer
   */
  addLayer(layer) {
    this.#allLayers.set(layer.pageIndex, layer);
    if (this.#isEnabled) {
      layer.enable();
    } else {
      layer.disable();
    }
  }

  /**
   * Remove a layer.
   * @param {AnnotationEditorLayer} layer
   */
  removeLayer(layer) {
    this.#allLayers.delete(layer.pageIndex);
  }

  /**
   * Change the editor mode (None, FreeText, Ink, ...)
   * @param {number} mode
   */
  updateMode(mode) {
    this.#mode = mode;
    if (mode === AnnotationEditorType.NONE) {
      this.setEditingState(false);
      this.#disableAll();
    } else {
      this.setEditingState(true);
      this.#enableAll();
      for (const layer of this.#allLayers.values()) {
        layer.updateMode(mode);
      }
    }
  }

  /**
   * Update the toolbar if it's required to reflect the tool currently used.
   * @param {number} mode
   * @returns {undefined}
   */
  updateToolbar(mode) {
    if (mode === this.#mode) {
      return;
    }
    this.#eventBus.dispatch("switchannotationeditormode", {
      source: this,
      mode,
    });
  }

  /**
   * Update a parameter in the current editor or globally.
   * @param {number} type
   * @param {*} value
   */
  updateParams(type, value) {
    (this.#activeEditor || this.#previousActiveEditor)?.updateParams(
      type,
      value
    );
    for (const editorType of this.#editorTypes) {
      editorType.updateDefaultParams(type, value);
    }
  }

  /**
   * Enable all the layers.
   */
  #enableAll() {
    if (!this.#isEnabled) {
      this.#isEnabled = true;
      for (const layer of this.#allLayers.values()) {
        layer.enable();
      }
    }
  }

  /**
   * Disable all the layers.
   */
  #disableAll() {
    if (this.#isEnabled) {
      this.#isEnabled = false;
      for (const layer of this.#allLayers.values()) {
        layer.disable();
      }
    }
  }

  /**
   * Get all the editors belonging to a give page.
   * @param {number} pageIndex
   * @returns {Array<AnnotationEditor>}
   */
  getEditors(pageIndex) {
    const editors = [];
    for (const editor of this.#allEditors.values()) {
      if (editor.pageIndex === pageIndex) {
        editors.push(editor);
      }
    }
    return editors;
  }

  /**
   * Get an editor with the given id.
   * @param {string} id
   * @returns {AnnotationEditor}
   */
  getEditor(id) {
    return this.#allEditors.get(id);
  }

  /**
   * Add a new editor.
   * @param {AnnotationEditor} editor
   */
  addEditor(editor) {
    this.#allEditors.set(editor.id, editor);
  }

  /**
   * Remove an editor.
   * @param {AnnotationEditor} editor
   */
  removeEditor(editor) {
    this.#allEditors.delete(editor.id);
  }

  /**
   * Add an editor to the layer it belongs to or add it to the global map.
   * @param {AnnotationEditor} editor
   */
  #addEditorToLayer(editor) {
    const layer = this.#allLayers.get(editor.pageIndex);
    if (layer) {
      layer.addOrRebuild(editor);
    } else {
      this.addEditor(editor);
    }
  }

  /**
   * Set the given editor as the active one.
   * @param {AnnotationEditor} editor
   */
  setActiveEditor(editor) {
    if (this.#activeEditor === editor) {
      return;
    }

    this.#previousActiveEditor = this.#activeEditor;

    this.#activeEditor = editor;
    if (editor) {
      this.#dispatchUpdateUI(editor.propertiesToUpdate);
      this.#dispatchUpdateStates({ hasSelectedEditor: true });
    } else {
      this.#dispatchUpdateStates({ hasSelectedEditor: false });
      if (this.#previousActiveEditor) {
        this.#dispatchUpdateUI(this.#previousActiveEditor.propertiesToUpdate);
      } else {
        for (const editorType of this.#editorTypes) {
          this.#dispatchUpdateUI(editorType.defaultPropertiesToUpdate);
        }
      }
    }
  }

  /**
   * Undo the last command.
   */
  undo() {
    this.#commandManager.undo();
    this.#dispatchUpdateStates({
      hasSomethingToUndo: this.#commandManager.hasSomethingToUndo(),
      hasSomethingToRedo: true,
      isEmpty: this.#isEmpty(),
    });
  }

  /**
   * Redo the last undoed command.
   */
  redo() {
    this.#commandManager.redo();
    this.#dispatchUpdateStates({
      hasSomethingToUndo: true,
      hasSomethingToRedo: this.#commandManager.hasSomethingToRedo(),
      isEmpty: this.#isEmpty(),
    });
  }

  /**
   * Add a command to execute (cmd) and another one to undo it.
   * @param {Object} params
   */
  addCommands(params) {
    this.#commandManager.add(params);
    this.#dispatchUpdateStates({
      hasSomethingToUndo: true,
      hasSomethingToRedo: false,
      isEmpty: this.#isEmpty(),
    });
  }

  #isEmpty() {
    if (this.#allEditors.size === 0) {
      return true;
    }

    if (this.#allEditors.size === 1) {
      for (const editor of this.#allEditors.values()) {
        return editor.isEmpty();
      }
    }

    return false;
  }

  /**
   * Unselect the current editor.
   */
  unselect() {
    if (this.#activeEditor) {
      this.#activeEditor.parent.setActiveEditor(null);
    }
  }

  /**
   * Delete the current editor or all.
   */
  delete() {
    let cmd, undo;
    if (this.#isAllSelected) {
      const editors = Array.from(this.#allEditors.values());
      cmd = () => {
        for (const editor of editors) {
          if (!editor.isEmpty()) {
            editor.remove();
          }
        }
      };

      undo = () => {
        for (const editor of editors) {
          this.#addEditorToLayer(editor);
        }
      };

      this.addCommands({ cmd, undo, mustExec: true });
    } else {
      if (!this.#activeEditor) {
        return;
      }
      const editor = this.#activeEditor;
      cmd = () => {
        editor.remove();
      };
      undo = () => {
        this.#addEditorToLayer(editor);
      };
    }

    this.addCommands({ cmd, undo, mustExec: true });
  }

  /**
   * Copy the selected editor.
   */
  copy() {
    if (this.#activeEditor) {
      this.#clipboardManager.copy(this.#activeEditor);
      this.#dispatchUpdateStates({ hasEmptyClipboard: false });
    }
  }

  /**
   * Cut the selected editor.
   */
  cut() {
    if (this.#activeEditor) {
      this.#clipboardManager.copy(this.#activeEditor);
      const editor = this.#activeEditor;
      const cmd = () => {
        editor.remove();
      };
      const undo = () => {
        this.#addEditorToLayer(editor);
      };

      this.addCommands({ cmd, undo, mustExec: true });
    }
  }

  /**
   * Paste a previously copied editor.
   * @returns {undefined}
   */
  paste() {
    if (this.#clipboardManager.isEmpty()) {
      return;
    }

    const layer = this.#allLayers.get(this.#currentPageIndex);
    const newEditors = this.#clipboardManager
      .paste()
      .map(data => layer.deserialize(data));

    const cmd = () => {
      newEditors.map(editor => this.#addEditorToLayer(editor));
    };
    const undo = () => {
      newEditors.map(editor => editor.remove());
    };
    this.addCommands({ cmd, undo, mustExec: true });
  }

  /**
   * Select all the editors.
   */
  selectAll() {
    this.#isAllSelected = true;
    for (const editor of this.#allEditors.values()) {
      editor.select();
    }
    this.#dispatchUpdateStates({ hasSelectedEditor: true });
  }

  /**
   * Unselect all the editors.
   */
  unselectAll() {
    this.#isAllSelected = false;

    for (const editor of this.#allEditors.values()) {
      editor.unselect();
    }
    this.#dispatchUpdateStates({ hasSelectedEditor: this.hasActive() });
  }

  /**
   * Is the current editor the one passed as argument?
   * @param {AnnotationEditor} editor
   * @returns
   */
  isActive(editor) {
    return this.#activeEditor === editor;
  }

  /**
   * Get the current active editor.
   * @returns {AnnotationEditor|null}
   */
  getActive() {
    return this.#activeEditor;
  }

  /**
   * Check if there is an active editor.
   * @returns {boolean}
   */
  hasActive() {
    return this.#activeEditor !== null;
  }

  /**
   * Get the current editor mode.
   * @returns {number}
   */
  getMode() {
    return this.#mode;
  }
}

export { AnnotationEditorUIManager, bindEvents, ColorManager, KeyboardManager };
