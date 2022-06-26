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
} from "../../shared/util.js";

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
   */
  add(cmd, undo, mustExec) {
    const save = [cmd, undo];
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
    this.#commands[this.#position][1]();
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
        this.#commands[this.#start][0]();
        this.#position = this.#start;
      }
      return;
    }

    const next = (this.#position + 1) % this.#maxSize;
    if (next !== this.#start && next < this.#commands.length) {
      this.#commands[next][0]();
      this.#position = next;
    }
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
  constructor() {
    this.element = null;
  }

  /**
   * Copy an element.
   * @param {AnnotationEditor} element
   */
  copy(element) {
    this.element = element.copy();
  }

  /**
   * Create a new element.
   * @returns {AnnotationEditor|null}
   */
  paste() {
    return this.element?.copy() || null;
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

  #allLayers = new Set();

  #allowClick = true;

  #clipboardManager = new ClipboardManager();

  #commandManager = new CommandManager();

  #idManager = new IdManager();

  #isAllSelected = false;

  #isEnabled = false;

  #mode = AnnotationEditorType.NONE;

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
    this.#allLayers.add(layer);
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
    this.#allLayers.delete(layer);
  }

  /**
   * Change the editor mode (None, FreeText, Ink, ...)
   * @param {number} mode
   */
  updateMode(mode) {
    this.#mode = mode;
    if (mode === AnnotationEditorType.NONE) {
      this.#disableAll();
    } else {
      this.#enableAll();
      for (const layer of this.#allLayers) {
        layer.updateMode(mode);
      }
    }
  }

  /**
   * Enable all the layers.
   */
  #enableAll() {
    if (!this.#isEnabled) {
      this.#isEnabled = true;
      for (const layer of this.#allLayers) {
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
      for (const layer of this.#allLayers) {
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
   * Set the given editor as the active one.
   * @param {AnnotationEditor} editor
   */
  setActiveEditor(editor) {
    this.#activeEditor = editor;
  }

  /**
   * Undo the last command.
   */
  undo() {
    this.#commandManager.undo();
  }

  /**
   * Redo the last undoed command.
   */
  redo() {
    this.#commandManager.redo();
  }

  /**
   * Add a command to execute (cmd) and another one to undo it.
   * @param {function} cmd
   * @param {function} undo
   * @param {boolean} mustExec
   */
  addCommands(cmd, undo, mustExec) {
    this.#commandManager.add(cmd, undo, mustExec);
  }

  /**
   * When set to true a click on the current layer will trigger
   * an editor creation.
   * @return {boolean}
   */
  get allowClick() {
    return this.#allowClick;
  }

  /**
   * @param {boolean} allow
   */
  set allowClick(allow) {
    this.#allowClick = allow;
  }

  /**
   * Unselect the current editor.
   */
  unselect() {
    if (this.#activeEditor) {
      this.#activeEditor.parent.setActiveEditor(null);
    }
    this.#allowClick = true;
  }

  /**
   * Suppress some editors from the given layer.
   * @param {AnnotationEditorLayer} layer
   */
  suppress(layer) {
    let cmd, undo;
    if (this.#isAllSelected) {
      const editors = Array.from(this.#allEditors.values());
      cmd = () => {
        for (const editor of editors) {
          editor.remove();
        }
      };

      undo = () => {
        for (const editor of editors) {
          layer.addOrRebuild(editor);
        }
      };

      this.addCommands(cmd, undo, true);
    } else {
      if (!this.#activeEditor) {
        return;
      }
      const editor = this.#activeEditor;
      cmd = () => {
        editor.remove();
      };
      undo = () => {
        layer.addOrRebuild(editor);
      };
    }

    this.addCommands(cmd, undo, true);
  }

  /**
   * Copy the selected editor.
   */
  copy() {
    if (this.#activeEditor) {
      this.#clipboardManager.copy(this.#activeEditor);
    }
  }

  /**
   * Cut the selected editor.
   * @param {AnnotationEditorLayer}
   */
  cut(layer) {
    if (this.#activeEditor) {
      this.#clipboardManager.copy(this.#activeEditor);
      const editor = this.#activeEditor;
      const cmd = () => {
        editor.remove();
      };
      const undo = () => {
        layer.addOrRebuild(editor);
      };

      this.addCommands(cmd, undo, true);
    }
  }

  /**
   * Paste a previously copied editor.
   * @param {AnnotationEditorLayer}
   * @returns {undefined}
   */
  paste(layer) {
    const editor = this.#clipboardManager.paste();
    if (!editor) {
      return;
    }
    const cmd = () => {
      layer.addOrRebuild(editor);
    };
    const undo = () => {
      editor.remove();
    };

    this.addCommands(cmd, undo, true);
  }

  /**
   * Select all the editors.
   */
  selectAll() {
    this.#isAllSelected = true;
    for (const editor of this.#allEditors.values()) {
      editor.select();
    }
  }

  /**
   * Unselect all the editors.
   */
  unselectAll() {
    this.#isAllSelected = false;
    for (const editor of this.#allEditors.values()) {
      editor.unselect();
    }
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

export { AnnotationEditorUIManager, bindEvents, KeyboardManager };
