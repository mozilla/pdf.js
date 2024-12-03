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
      ? AppOptions.getAll(OptionKind.PREFERENCE, /* defaultOnly = */ true)
      : PDFJSDev.eval("DEFAULT_PREFERENCES")
  );

  #initializedPromise = null;

  constructor() {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === BasePreferences
    ) {
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
        if (
          (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) &&
          AppOptions._checkDisablePreferences()
        ) {
          return;
        }
        AppOptions.setAll({ ...browserPrefs, ...prefs }, /* prefs = */ true);
      }
    );

    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
      window.addEventListener(
        "updatedPreference",
        async ({ detail: { name, value } }) => {
          await this.#initializedPromise;
          AppOptions.setAll({ [name]: value }, /* prefs = */ true);
        }
      );
    }
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
    AppOptions.setAll(this.#defaults, /* prefs = */ true);

    await this._writeToStorage(this.#defaults);
  }

  /**
   * Set the value of a preference.
   * @param {string} name The name of the preference that should be changed.
   * @param {boolean|number|string} value The new value of the preference.
   * @returns {Promise} A promise that is resolved when the value has been set,
   *                    provided that the preference exists and the types match.
   */
  async set(name, value) {
    await this.#initializedPromise;
    AppOptions.setAll({ [name]: value }, /* prefs = */ true);

    await this._writeToStorage(
      typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")
        ? { [name]: AppOptions.get(name) }
        : AppOptions.getAll(OptionKind.PREFERENCE)
    );
  }

  /**
   * Get the value of a preference.
   * @param {string} name The name of the preference whose value is requested.
   * @returns {Promise} A promise resolved with a {boolean|number|string}
   *                    containing the value of the preference.
   */
  async get(name) {
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
      throw new Error("Not implemented: get");
    }
    await this.#initializedPromise;
    return AppOptions.get(name);
  }

  get initializedPromise() {
    return this.#initializedPromise;
  }
}

export { BasePreferences };
