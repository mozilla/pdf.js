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

/**
 * Key/value storage for annotation data in forms.
 */
class AnnotationStorage {
  constructor() {
    this._storage = new Map();
    this._modified = false;

    // Callbacks to signal when the modification state is set or reset.
    // This is used by the viewer to only bind on `beforeunload` if forms
    // are actually edited to prevent doing so unconditionally since that
    // can have undesirable efffects.
    this.onSetModified = null;
    this.onResetModified = null;
  }

  /**
   * Get the value for a given key if it exists
   * or store and return the default value
   *
   * @public
   * @memberof AnnotationStorage
   * @param {string} key
   * @param {Object} defaultValue
   * @returns {Object}
   */
  getOrCreateValue(key, defaultValue) {
    if (this._storage.has(key)) {
      return this._storage.get(key);
    }

    this._storage.set(key, defaultValue);
    return defaultValue;
  }

  /**
   * Set the value for a given key
   *
   * @public
   * @memberof AnnotationStorage
   * @param {string} key
   * @param {Object} value
   */
  setValue(key, value) {
    if (this._storage.get(key) !== value) {
      this._setModified();
    }
    this._storage.set(key, value);
  }

  getAll() {
    if (this._storage.size === 0) {
      return null;
    }
    return Object.fromEntries(this._storage);
  }

  get size() {
    return this._storage.size;
  }

  /**
   * @private
   */
  _setModified() {
    if (!this._modified) {
      this._modified = true;
      if (typeof this.onSetModified === "function") {
        this.onSetModified();
      }
    }
  }

  resetModified() {
    if (this._modified) {
      this._modified = false;
      if (typeof this.onResetModified === "function") {
        this.onResetModified();
      }
    }
  }
}

export { AnnotationStorage };
