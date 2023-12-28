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

import { AppOptions, OptionKind } from "./app_options.js";

/**
 * BasePreferences - Abstract base class for storing persistent settings.
 *   Used for settings that should be applied to all opened documents,
 *   or every time the viewer is loaded.
 */
class BasePreferences {
  #defaults = Object.freeze(
    typeof PDFJSDev === "undefined"
      ? AppOptions.getAll(OptionKind.PREFERENCE)
      : PDFJSDev.eval("DEFAULT_PREFERENCES")
  );

  #prefs = Object.create(null);

  #initializedPromise = null;

  constructor() {
    if (this.constructor === BasePreferences) {
      throw new Error("Cannot initialize BasePreferences.");
    }

    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("CHROME")) {
      Object.defineProperty(this, "defaults", {
        get() {
          return this.#defaults;
        },
      });
    }

    this.#initializedPromise = this._readFromStorage(this.#defaults).then(
      ({ browserPrefs, prefs }) => {
        const BROWSER_PREFS =
          typeof PDFJSDev === "undefined"
            ? AppOptions.getAll(OptionKind.BROWSER)
            : PDFJSDev.eval("BROWSER_PREFERENCES");
        const options = Object.create(null);

        for (const [name, defaultVal] of Object.entries(BROWSER_PREFS)) {
          const prefVal = browserPrefs?.[name];
          options[name] =
            typeof prefVal === typeof defaultVal ? prefVal : defaultVal;
        }
        for (const [name, defaultVal] of Object.entries(this.#defaults)) {
          const prefVal = prefs?.[name];
          // Ignore preferences whose types don't match the default values.
          options[name] = this.#prefs[name] =
            typeof prefVal === typeof defaultVal ? prefVal : defaultVal;
        }
        AppOptions.setAll(options, /* init = */ true);
      }
    );
  }

  /**
   * Stub function for writing preferences to storage.
   * @param {Object} prefObj The preferences that should be written to storage.
   * @returns {Promise} A promise that is resolved when the preference values
   *                    have been written.
   */
  async _writeToStorage(prefObj) {
    throw new Error("Not implemented: _writeToStorage");
  }

  /**
   * Stub function for reading preferences from storage.
   * @param {Object} prefObj The preferences that should be read from storage.
   * @returns {Promise} A promise that is resolved with an {Object} containing
   *                    the preferences that have been read.
   */
  async _readFromStorage(prefObj) {
    throw new Error("Not implemented: _readFromStorage");
  }

  /**
   * Reset the preferences to their default values and update storage.
   * @returns {Promise} A promise that is resolved when the preference values
   *                    have been reset.
   */
  async reset() {
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
      throw new Error("Please use `about:config` to change preferences.");
    }
    await this.#initializedPromise;
    const prefs = this.#prefs;

    this.#prefs = Object.create(null);
    return this._writeToStorage(this.#defaults).catch(reason => {
      // Revert all preference values, since writing to storage failed.
      this.#prefs = prefs;
      throw reason;
    });
  }

  /**
   * Set the value of a preference.
   * @param {string} name The name of the preference that should be changed.
   * @param {boolean|number|string} value The new value of the preference.
   * @returns {Promise} A promise that is resolved when the value has been set,
   *                    provided that the preference exists and the types match.
   */
  async set(name, value) {
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
      throw new Error("Please use `about:config` to change preferences.");
    }
    await this.#initializedPromise;
    const defaultValue = this.#defaults[name],
      prefs = this.#prefs;

    if (defaultValue === undefined) {
      throw new Error(`Set preference: "${name}" is undefined.`);
    } else if (value === undefined) {
      throw new Error("Set preference: no value is specified.");
    }
    const valueType = typeof value,
      defaultType = typeof defaultValue;

    if (valueType !== defaultType) {
      if (valueType === "number" && defaultType === "string") {
        value = value.toString();
      } else {
        throw new Error(
          `Set preference: "${value}" is a ${valueType}, expected a ${defaultType}.`
        );
      }
    } else if (valueType === "number" && !Number.isInteger(value)) {
      throw new Error(`Set preference: "${value}" must be an integer.`);
    }

    this.#prefs[name] = value;
    return this._writeToStorage(this.#prefs).catch(reason => {
      // Revert all preference values, since writing to storage failed.
      this.#prefs = prefs;
      throw reason;
    });
  }

  /**
   * Get the value of a preference.
   * @param {string} name The name of the preference whose value is requested.
   * @returns {Promise} A promise resolved with a {boolean|number|string}
   *                    containing the value of the preference.
   */
  async get(name) {
    await this.#initializedPromise;
    const defaultValue = this.#defaults[name];

    if (defaultValue === undefined) {
      throw new Error(`Get preference: "${name}" is undefined.`);
    }
    return this.#prefs[name] ?? defaultValue;
  }

  get initializedPromise() {
    return this.#initializedPromise;
  }
}

export { BasePreferences };
