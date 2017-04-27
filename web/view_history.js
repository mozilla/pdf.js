/* Copyright 2012 Mozilla Foundation
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

const DEFAULT_VIEW_HISTORY_CACHE_SIZE = 20;

/**
 * View History - This is a utility for saving various view parameters for
 *                recently opened files.
 *
 * The way that the view parameters are stored depends on how PDF.js is built,
 * for 'gulp <flag>' the following cases exist:
 *  - FIREFOX or MOZCENTRAL - uses sessionStorage.
 *  - GENERIC or CHROME     - uses localStorage, if it is available.
 */
class ViewHistory {
  constructor(fingerprint, cacheSize = DEFAULT_VIEW_HISTORY_CACHE_SIZE) {
    this.fingerprint = fingerprint;
    this.cacheSize = cacheSize;

    this._initializedPromise = this._readFromStorage().then((databaseStr) => {
      var database = JSON.parse(databaseStr || '{}');
      if (!('files' in database)) {
        database.files = [];
      }
      if (database.files.length >= this.cacheSize) {
        database.files.shift();
      }
      var index;
      for (var i = 0, length = database.files.length; i < length; i++) {
        var branch = database.files[i];
        if (branch.fingerprint === this.fingerprint) {
          index = i;
          break;
        }
      }
      if (typeof index !== 'number') {
        index = database.files.push({fingerprint: this.fingerprint}) - 1;
      }
      this.file = database.files[index];
      this.database = database;
    });
  }

  _writeToStorage() {
    return new Promise((resolve) => {
      var databaseStr = JSON.stringify(this.database);

      if (typeof PDFJSDev !== 'undefined' &&
          PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
        sessionStorage.setItem('pdfjs.history', databaseStr);
      } else {
        localStorage.setItem('pdfjs.history', databaseStr);
      }
      resolve();
    });
  }

  _readFromStorage() {
    return new Promise(function(resolve) {
      if (typeof PDFJSDev !== 'undefined' &&
          PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
        resolve(sessionStorage.getItem('pdfjs.history'));
      } else {
        var value = localStorage.getItem('pdfjs.history');

        // TODO: Remove this key-name conversion after a suitable time-frame.
        // Note that we only remove the old 'database' entry if it looks like
        // it was created by PDF.js, to avoid removing someone else's data.
        if (!value) {
          var databaseStr = localStorage.getItem('database');
          if (databaseStr) {
            try {
              var database = JSON.parse(databaseStr);
              if (typeof database.files[0].fingerprint === 'string') {
                localStorage.setItem('pdfjs.history', databaseStr);
                localStorage.removeItem('database');
                value = databaseStr;
              }
            } catch (ex) { }
          }
        }
        resolve(value);
      }
    });
  }

  set(name, val) {
    return this._initializedPromise.then(() => {
      this.file[name] = val;
      return this._writeToStorage();
    });
  }

  setMultiple(properties) {
    return this._initializedPromise.then(() => {
      for (var name in properties) {
        this.file[name] = properties[name];
      }
      return this._writeToStorage();
    });
  }

  get(name, defaultValue) {
    return this._initializedPromise.then(() => {
      var val = this.file[name];
      return val !== undefined ? val : defaultValue;
    });
  }

  getMultiple(properties) {
    return this._initializedPromise.then(() => {
      var values = Object.create(null);

      for (var name in properties) {
        var val = this.file[name];
        values[name] = val !== undefined ? val : properties[name];
      }
      return values;
    });
  }
}

export {
  ViewHistory,
};
