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

import { objectFromMap } from "../shared/util.js";

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
    // can have undesirable effects.
    this.onSetModified = null;
    this.onResetModified = null;
  }

  /**
   * Get the value for a given key if it exists, or return the default value.
   *
   * @public
   * @memberof AnnotationStorage
   * @param {string} key
   * @param {string} fieldName name of the input field
   * @param {Object} defaultValue
   * @returns {Object}
   */
  // #718 modified by ngx-extended-pdf-viewer
  getValue(key, fieldname, defaultValue, radioButtonField = undefined) {
    let obj = this._storage.get(key);
    if (obj === undefined) {
      if (window.getFormValue) {
        window.assignFormIdAndFieldName(key, fieldname, radioButtonField);
        // necessary because radio buttons don't have a reference to their field
        const ngObj = window.getFormValue(fieldname);
        if (ngObj !== undefined && ngObj.value !== undefined) {
          if (radioButtonField) {
            const value = { value: ngObj.value === radioButtonField };
            obj = value;
          } else {
            obj = ngObj;
          }
          this.setValue(key, undefined, obj); // second parameter is undefined to prevent infinite loops
        }
        if (obj === undefined && defaultValue !== undefined && defaultValue.value !== undefined && defaultValue.value !== "") {
          // send the pre-filled form value to Angular via (formDataChange)
          if (radioButtonField) {
            if (defaultValue.value) {
              window.setFormValue(fieldname, radioButtonField);
            }
          } else {
            window.setFormValue(fieldname, defaultValue.value);
          }
        }
      }
    }
    // #718 end of modification by ngx-extended-pdf-viewer
    return obj !== undefined ? obj : defaultValue;
  }

  /**
   * Set the value for a given key
   *
   * @public
   * @memberof AnnotationStorage
   * @param {string} key
   * @param {string} fieldName name of the input field
   * @param {Object} value
   */
  // #718 modified by ngx-extended-pdf-viewer
  setValue(key, fieldname, value, radioButtonField = undefined) {
    // #718 end of modification by ngx-extended-pdf-viewer
    const obj = this._storage.get(key);
    let modified = false;
    if (obj !== undefined) {
      for (const [entry, val] of Object.entries(value)) {
        if (
          entry !== "radioValue" && // #718 modified by ngx-extended-pdf-viewer
          entry !== "emitMessage" && // #718 modified by ngx-extended-pdf-viewer
          obj[entry] !== val
        ) {
          modified = true;
          obj[entry] = val;
        }
      }
    } else {
      this._storage.set(key, value);
      modified = true;
    }
    if (modified) {
      this._setModified();
      // #718 modified by ngx-extended-pdf-viewer
      if (fieldname || radioButtonField) {
        if (window.setFormValue) {
          if (value.items) {
            window.setFormValue(fieldname, value.items);
          } else if (value.emitMessage === false) {
            // ignore this field
          } else if (value.radioValue) {
            window.setFormValue(fieldname, value.radioValue);
          } else {
            for (const val of Object.values(value)) {
              window.setFormValue(fieldname, val);
            }
          }
        }
      }
      // #718 end of modification by ngx-extended-pdf-viewer
    }
  }

  getAll() {
    return this._storage.size > 0 ? objectFromMap(this._storage) : null;
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

  /**
   * PLEASE NOTE: Only intended for usage within the API itself.
   * @ignore
   */
  get serializable() {
    return this._storage.size > 0 ? this._storage : null;
  }
}

export { AnnotationStorage };
