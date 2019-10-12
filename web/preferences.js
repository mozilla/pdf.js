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

let defaultPreferences = null;
function getDefaultPreferences() {
  if (!defaultPreferences) {
    if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('PRODUCTION')) {
      defaultPreferences = Promise.resolve(
        PDFJSDev.json('$ROOT/build/default_preferences.json'));
    } else {
      defaultPreferences = new Promise(function(resolve, reject) {
        if (typeof SystemJS === 'object') {
          SystemJS.import('./app_options').then(resolve, reject);
        } else if (typeof require === 'function') {
          try {
            resolve(require('./app_options.js'));
          } catch (ex) {
            reject(ex);
          }
        } else {
          reject(new Error(
            'SystemJS or CommonJS must be used to load AppOptions.'));
        }
      }).then(function({ AppOptions, OptionKind, }) {
        return AppOptions.getAll(OptionKind.PREFERENCE);
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

      this.prefs = Object.assign(Object.create(null), defaults);
      return this._readFromStorage(defaults);
    }).then((prefs) => {
      if (!prefs) {
        return;
      }
      for (let name in prefs) {
        const defaultValue = this.defaults[name], prefValue = prefs[name];
        // Ignore preferences not present in, or whose types don't match,
        // the default values.
        if (defaultValue === undefined ||
            typeof prefValue !== typeof defaultValue) {
          continue;
        }
        this.prefs[name] = prefValue;
      }
    });
  }

  /**
   * Stub function for writing preferences to storage.
   * @param {Object} prefObj The preferences that should be written to storage.
   * @returns {Promise} A promise that is resolved when the preference values
   *                    have been written.
   */
  async _writeToStorage(prefObj) {
    throw new Error('Not implemented: _writeToStorage');
  }

  /**
   * Stub function for reading preferences from storage.
   * @param {Object} prefObj The preferences that should be read from storage.
   * @returns {Promise} A promise that is resolved with an {Object} containing
   *                    the preferences that have been read.
   */
  async _readFromStorage(prefObj) {
    throw new Error('Not implemented: _readFromStorage');
  }

  /**
   * Reset the preferences to their default values and update storage.
   * @returns {Promise} A promise that is resolved when the preference values
   *                    have been reset.
   */
  async reset() {
    await this._initializedPromise;
    this.prefs = Object.assign(Object.create(null), this.defaults);
    return this._writeToStorage(this.defaults);
  }

  /**
   * Set the value of a preference.
   * @param {string} name The name of the preference that should be changed.
   * @param {boolean|number|string} value The new value of the preference.
   * @returns {Promise} A promise that is resolved when the value has been set,
   *                    provided that the preference exists and the types match.
   */
  async set(name, value) {
    await this._initializedPromise;
    let defaultValue = this.defaults[name];

    if (defaultValue === undefined) {
      throw new Error(`Set preference: "${name}" is undefined.`);
    } else if (value === undefined) {
      throw new Error('Set preference: no value is specified.');
    }
    let valueType = typeof value;
    let defaultType = typeof defaultValue;

    if (valueType !== defaultType) {
      if (valueType === 'number' && defaultType === 'string') {
        value = value.toString();
      } else {
        throw new Error(`Set preference: "${value}" is a ${valueType}, ` +
                        `expected a ${defaultType}.`);
      }
    } else {
      if (valueType === 'number' && !Number.isInteger(value)) {
        throw new Error(`Set preference: "${value}" must be an integer.`);
      }
    }
    this.prefs[name] = value;
    return this._writeToStorage(this.prefs);
  }

  /**
   * Get the value of a preference.
   * @param {string} name The name of the preference whose value is requested.
   * @returns {Promise} A promise resolved with a {boolean|number|string}
   *                    containing the value of the preference.
   */
  async get(name) {
    await this._initializedPromise;
    let defaultValue = this.defaults[name];

    if (defaultValue === undefined) {
      throw new Error(`Get preference: "${name}" is undefined.`);
    } else {
      let prefValue = this.prefs[name];

      if (prefValue !== undefined) {
        return prefValue;
      }
    }
    return defaultValue;
  }

  /**
   * Get the values of all preferences.
   * @returns {Promise} A promise that is resolved with an {Object} containing
   *                    the values of all preferences.
   */
  async getAll() {
    await this._initializedPromise;
    return Object.assign(Object.create(null), this.defaults, this.prefs);
  }
}

export {
  BasePreferences,
};
