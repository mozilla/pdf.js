/* Copyright 2020 Mozilla Foundation
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

import { shadow, unreachable } from "../shared/util.js";
import { AnnotationEditor } from "./editor/editor.js";
import { MurmurHash3_64 } from "../shared/murmurhash3.js";

const SerializableEmpty = Object.freeze({
  map: null,
  hash: "",
  transfer: undefined,
});

/**
 * Key/value storage for annotation data in forms.
 */
class AnnotationStorage {
  #modified = false;

  #modifiedIds = null;

  #editorsMap = null;

  #storage = new Map();

  constructor() {
    // Callbacks to signal when the modification state is set or reset.
    // This is used by the viewer to only bind on `beforeunload` if forms
    // are actually edited to prevent doing so unconditionally since that
    // can have undesirable effects.
    this.onSetModified = null;
    this.onResetModified = null;
    this.onAnnotationEditor = null;

    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      // For testing purposes.
      Object.defineProperty(this, "_setValues", {
        value: obj => {
          for (const [key, val] of Object.entries(obj)) {
            this.setValue(key, val);
          }
        },
      });
    }
  }

  /**
   * Get the value for a given key if it exists, or return the default value.
   * @param {string} key
   * @param {Object} defaultValue
   * @returns {Object}
   */
  getValue(key, defaultValue) {
    const value = this.#storage.get(key);
    if (value === undefined) {
      return defaultValue;
    }

    return Object.assign(defaultValue, value);
  }

  /**
   * Get the value for a given key.
   * @param {string} key
   * @returns {Object}
   */
  getRawValue(key) {
    return this.#storage.get(key);
  }

  /**
   * Remove a value from the storage.
   * @param {string} key
   */
  remove(key) {
    const storedValue = this.#storage.get(key);
    if (storedValue === undefined) {
      return;
    }
    if (storedValue instanceof AnnotationEditor) {
      this.#editorsMap.delete(storedValue.annotationElementId);
    }
    this.#storage.delete(key);

    if (this.#storage.size === 0) {
      this.resetModified();
    }

    if (typeof this.onAnnotationEditor === "function") {
      for (const value of this.#storage.values()) {
        if (value instanceof AnnotationEditor) {
          return;
        }
      }
      this.onAnnotationEditor(null);
    }
  }

  /**
   * Set the value for a given key
   * @param {string} key
   * @param {Object} value
   */
  setValue(key, value) {
    const obj = this.#storage.get(key);
    let modified = false;
    if (obj !== undefined) {
      for (const [entry, val] of Object.entries(value)) {
        if (obj[entry] !== val) {
          modified = true;
          obj[entry] = val;
        }
      }
    } else {
      modified = true;
      this.#storage.set(key, value);
    }
    if (modified) {
      this.#setModified();
    }

    if (value instanceof AnnotationEditor) {
      (this.#editorsMap ||= new Map()).set(value.annotationElementId, value);
      if (typeof this.onAnnotationEditor === "function") {
        this.onAnnotationEditor(value.constructor._type);
      }
    }
  }

  /**
   * Check if the storage contains the given key.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.#storage.has(key);
  }

  get size() {
    return this.#storage.size;
  }

  #setModified() {
    if (!this.#modified) {
      this.#modified = true;
      if (typeof this.onSetModified === "function") {
        this.onSetModified();
      }
    }
  }

  resetModified() {
    if (this.#modified) {
      this.#modified = false;
      if (typeof this.onResetModified === "function") {
        this.onResetModified();
      }
    }
  }

  /**
   * @returns {PrintAnnotationStorage}
   */
  get print() {
    return new PrintAnnotationStorage(this);
  }

  /**
   * PLEASE NOTE: Only intended for usage within the API itself.
   * @ignore
   */
  get serializable() {
    if (this.#storage.size === 0) {
      return SerializableEmpty;
    }
    const map = new Map(),
      hash = new MurmurHash3_64(),
      transfer = [];
    const context = Object.create(null);
    let hasBitmap = false;

    for (const [key, val] of this.#storage) {
      const serialized =
        val instanceof AnnotationEditor
          ? val.serialize(/* isForCopying = */ false, context)
          : val;
      if (serialized) {
        map.set(key, serialized);

        hash.update(`${key}:${JSON.stringify(serialized)}`);
        hasBitmap ||= !!serialized.bitmap;
      }
    }

    if (hasBitmap) {
      // We must transfer the bitmap data separately, since it can be changed
      // during serialization with SVG images.
      for (const value of map.values()) {
        if (value.bitmap) {
          transfer.push(value.bitmap);
        }
      }
    }

    return map.size > 0
      ? { map, hash: hash.hexdigest(), transfer }
      : SerializableEmpty;
  }

  get editorStats() {
    let stats = null;
    const typeToEditor = new Map();
    let numberOfEditedComments = 0;
    let numberOfDeletedComments = 0;
    for (const value of this.#storage.values()) {
      if (!(value instanceof AnnotationEditor)) {
        if (value.popup) {
          if (value.popup.deleted) {
            numberOfDeletedComments += 1;
          } else {
            numberOfEditedComments += 1;
          }
        }
        continue;
      }
      if (value.isCommentDeleted) {
        numberOfDeletedComments += 1;
      } else if (value.hasEditedComment) {
        numberOfEditedComments += 1;
      }
      const editorStats = value.telemetryFinalData;
      if (!editorStats) {
        continue;
      }
      const { type } = editorStats;
      if (!typeToEditor.has(type)) {
        typeToEditor.set(type, Object.getPrototypeOf(value).constructor);
      }
      stats ||= Object.create(null);
      const map = (stats[type] ||= new Map());
      for (const [key, val] of Object.entries(editorStats)) {
        if (key === "type") {
          continue;
        }
        let counters = map.get(key);
        if (!counters) {
          counters = new Map();
          map.set(key, counters);
        }
        const count = counters.get(val) ?? 0;
        counters.set(val, count + 1);
      }
    }
    if (numberOfDeletedComments > 0 || numberOfEditedComments > 0) {
      stats ||= Object.create(null);
      stats.comments = {
        deleted: numberOfDeletedComments,
        edited: numberOfEditedComments,
      };
    }
    if (!stats) {
      return null;
    }
    for (const [type, editor] of typeToEditor) {
      stats[type] = editor.computeTelemetryFinalData(stats[type]);
    }
    return stats;
  }

  resetModifiedIds() {
    this.#modifiedIds = null;
  }

  updateEditor(annotationId, data) {
    const value = this.#editorsMap?.get(annotationId);
    if (value) {
      value.updateFromAnnotationLayer(data);
      return true;
    }
    return false;
  }

  getEditor(annotationId) {
    return this.#editorsMap?.get(annotationId) || null;
  }

  /**
   * @returns {{ids: Set<string>, hash: string}}
   */
  get modifiedIds() {
    if (this.#modifiedIds) {
      return this.#modifiedIds;
    }
    const ids = [];
    if (this.#editorsMap) {
      for (const value of this.#editorsMap.values()) {
        if (!value.serialize()) {
          continue;
        }
        ids.push(value.annotationElementId);
      }
    }
    return (this.#modifiedIds = {
      ids: new Set(ids),
      hash: ids.join(","),
    });
  }

  [Symbol.iterator]() {
    return this.#storage.entries();
  }
}

/**
 * A special `AnnotationStorage` for use during printing, where the serializable
 * data is *frozen* upon initialization, to prevent scripting from modifying its
 * contents. (Necessary since printing is triggered synchronously in browsers.)
 */
class PrintAnnotationStorage extends AnnotationStorage {
  #serializable;

  constructor(parent) {
    super();
    const { map, hash, transfer } = parent.serializable;
    // Create a *copy* of the data, since Objects are passed by reference in JS.
    const clone = structuredClone(map, transfer ? { transfer } : null);

    this.#serializable = { map: clone, hash, transfer };
  }

  /**
   * @returns {PrintAnnotationStorage}
   */
  // eslint-disable-next-line getter-return
  get print() {
    unreachable("Should not call PrintAnnotationStorage.print");
  }

  /**
   * PLEASE NOTE: Only intended for usage within the API itself.
   * @ignore
   */
  get serializable() {
    return this.#serializable;
  }

  get modifiedIds() {
    return shadow(this, "modifiedIds", {
      ids: new Set(),
      hash: "",
    });
  }
}

export { AnnotationStorage, PrintAnnotationStorage, SerializableEmpty };
