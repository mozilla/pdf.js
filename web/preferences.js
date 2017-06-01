/* Copyright 2013 Mozilla Foundation
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

import { cloneObj } from './ui_utils';

var defaultPreferences = null;
function getDefaultPreferences() {
  if (!defaultPreferences) {
    if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('PRODUCTION')) {
      defaultPreferences = Promise.resolve(
        PDFJSDev.json('$ROOT/web/default_preferences.json'));
    } else {
      defaultPreferences = new Promise(function (resolve) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'default_preferences.json');
        xhr.onload = xhr.onerror = function loaded() {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            console.error(`Unable to load default preferences: ${e}`);
            resolve({});
          }
        };
        xhr.send();
      });
    }
  }
  return defaultPreferences;
}

/**
 * BasePreferences - Abstract base class for storing persistent settings.
 *   Used for settings that should be applied to all opened documents,
 *   or every time the viewer is loaded.
 */
class BasePreferences {
  constructor() {
    if (this.constructor === BasePreferences) {
      throw new Error('Cannot initialize BasePreferences.');
    }
    this.prefs = null;

    this._initializedPromise = getDefaultPreferences().then((defaults) => {
      Object.defineProperty(this, 'defaults', {
        value: Object.freeze(defaults),
        writable: false,
        enumerable: true,
        configurable: false,
      });

      this.prefs = cloneObj(defaults);
      return this._readFromStorage(defaults);
    }).then((prefObj) => {
      if (prefObj) {
        this.prefs = prefObj;
      }
    });
  }

  /**
   * Stub function for writing preferences to storage.
   * @param {Object} prefObj The preferences that should be written to storage.
   * @return {Promise} A promise that is resolved when the preference values
   *                   have been written.
   */
  _writeToStorage(prefObj) {
    return Promise.reject(new Error('Not implemented: _writeToStorage'));
  }

  /**
   * Stub function for reading preferences from storage.
   * @param {Object} prefObj The preferences that should be read from storage.
   * @return {Promise} A promise that is resolved with an {Object} containing
   *                   the preferences that have been read.
   */
  _readFromStorage(prefObj) {
    return Promise.reject(new Error('Not implemented: _readFromStorage'));
  }

  /**
   * Reset the preferences to their default values and update storage.
   * @return {Promise} A promise that is resolved when the preference values
   *                   have been reset.
   */
  reset() {
    return this._initializedPromise.then(() => {
      this.prefs = cloneObj(this.defaults);
      return this._writeToStorage(this.defaults);
    });
  }

  /**
   * Replace the current preference values with the ones from storage.
   * @return {Promise} A promise that is resolved when the preference values
   *                   have been updated.
   */
  reload() {
    return this._initializedPromise.then(() => {
      return this._readFromStorage(this.defaults);
    }).then((prefObj) => {
      if (prefObj) {
        this.prefs = prefObj;
      }
    });
  }

  /**
   * Set the value of a preference.
   * @param {string} name The name of the preference that should be changed.
   * @param {boolean|number|string} value The new value of the preference.
   * @return {Promise} A promise that is resolved when the value has been set,
   *                   provided that the preference exists and the types match.
   */
  set(name, value) {
    return this._initializedPromise.then(() => {
      if (this.defaults[name] === undefined) {
        throw new Error(`Set preference: "${name}" is undefined.`);
      } else if (value === undefined) {
        throw new Error('Set preference: no value is specified.');
      }
      var valueType = typeof value;
      var defaultType = typeof this.defaults[name];

      if (valueType !== defaultType) {
        if (valueType === 'number' && defaultType === 'string') {
          value = value.toString();
        } else {
          throw new Error(`Set preference: "${value}" is a ${valueType}, ` +
                          `expected a ${defaultType}.`);
        }
      } else {
        if (valueType === 'number' && (value | 0) !== value) {
          throw new Error(`Set preference: "${value}" must be an integer.`);
        }
      }
      this.prefs[name] = value;
      return this._writeToStorage(this.prefs);
    });
  }

  /**
   * Get the value of a preference.
   * @param {string} name The name of the preference whose value is requested.
   * @return {Promise} A promise that is resolved with a {boolean|number|string}
   *                   containing the value of the preference.
   */
  get(name) {
    return this._initializedPromise.then(() => {
      var defaultValue = this.defaults[name];

      if (defaultValue === undefined) {
        throw new Error(`Get preference: "${name}" is undefined.`);
      } else {
        var prefValue = this.prefs[name];

        if (prefValue !== undefined) {
          return prefValue;
        }
      }
      return defaultValue;
    });
  }
}

export {
  BasePreferences,
};
