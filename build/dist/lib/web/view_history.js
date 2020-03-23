/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ViewHistory = void 0;
const DEFAULT_VIEW_HISTORY_CACHE_SIZE = 20;

class ViewHistory {
  constructor(fingerprint, cacheSize = DEFAULT_VIEW_HISTORY_CACHE_SIZE) {
    this.fingerprint = fingerprint;
    this.cacheSize = cacheSize;
    this._initializedPromise = this._readFromStorage().then(databaseStr => {
      const database = JSON.parse(databaseStr || "{}");
      let index = -1;

      if (!Array.isArray(database.files)) {
        database.files = [];
      } else {
        while (database.files.length >= this.cacheSize) {
          database.files.shift();
        }

        for (let i = 0, ii = database.files.length; i < ii; i++) {
          const branch = database.files[i];

          if (branch.fingerprint === this.fingerprint) {
            index = i;
            break;
          }
        }
      }

      if (index === -1) {
        index = database.files.push({
          fingerprint: this.fingerprint
        }) - 1;
      }

      this.file = database.files[index];
      this.database = database;
    });
  }

  async _writeToStorage() {
    const databaseStr = JSON.stringify(this.database);
    localStorage.setItem("pdfjs.history", databaseStr);
  }

  async _readFromStorage() {
    return localStorage.getItem("pdfjs.history");
  }

  async set(name, val) {
    await this._initializedPromise;
    this.file[name] = val;
    return this._writeToStorage();
  }

  async setMultiple(properties) {
    await this._initializedPromise;

    for (const name in properties) {
      this.file[name] = properties[name];
    }

    return this._writeToStorage();
  }

  async get(name, defaultValue) {
    await this._initializedPromise;
    const val = this.file[name];
    return val !== undefined ? val : defaultValue;
  }

  async getMultiple(properties) {
    await this._initializedPromise;
    const values = Object.create(null);

    for (const name in properties) {
      const val = this.file[name];
      values[name] = val !== undefined ? val : properties[name];
    }

    return values;
  }

}

exports.ViewHistory = ViewHistory;