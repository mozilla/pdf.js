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
import PouchDB from './../node_modules/pouchdb/dist/pouchdb.js';
// import PouchDB from 'pouchdb';

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
      let database = JSON.parse(databaseStr || '{}');
      if (!('files' in database)) {
        database.files = [];
      } else {
        while (database.files.length >= this.cacheSize) {
          database.files.shift();
        }
      }
      let index = -1;
      for (let i = 0, length = database.files.length; i < length; i++) {
        let branch = database.files[i];
        if (branch.fingerprint === this.fingerprint) {
          index = i;
          break;
        }
      }
      if (index === -1) {
        index = database.files.push({ fingerprint: this.fingerprint, }) - 1;
      }
      this.file = database.files[index];
      this.database = database;
    });
  }

  async _writeToStorage() {
    let databaseStr = JSON.stringify(this.database);

    if (typeof PDFJSDev !== 'undefined' &&
        PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
      sessionStorage.setItem('pdfjs.history', databaseStr);
      return;
    }
    // console.log(databaseStr);
    let url = new URL(window.location.href);
    let origin = url.origin;
    console.log(origin)
    let db = new PouchDB(origin + '/db/pdf_js');
    try {
      let doc = await db.get('pdf_history');
      try {
        let res = await db.put({
          _id: 'pdf_history',
          databaseStr,
          _rev: doc._rev,
        });
        console.log(res);
      } catch (err) {
        console.log(err);
      }
    } catch (err) {
      console.log(err);
      try {
        let res = await db.put({
          _id: 'pdf_history',
          databaseStr,
        });
        console.log(res);
      } catch (err) {
        console.log(err);
      }
    }
    localStorage.setItem('pdfjs.history', databaseStr);
  }

  async _readFromStorage() {
    if (typeof PDFJSDev !== 'undefined' &&
        PDFJSDev.test('FIREFOX || MOZCENTRAL')) {
      return sessionStorage.getItem('pdfjs.history');
    }
    // console.log(databaseStr);
    let url = new URL(window.location.href);
    let origin = url.origin;
    let db = new PouchDB(origin + '/db/pdf_js');
    try {
      let doc = await db.get('pdf_history');
      console.log(doc);
      return doc['databaseStr'];
    } catch (err) {
      console.log(err);
    }
    //

    return localStorage.getItem('pdfjs.history');
  }

  async set(name, val) {
    await this._initializedPromise;
    this.file[name] = val;
    return this._writeToStorage();
  }

  async setMultiple(properties) {
    await this._initializedPromise;
    for (let name in properties) {
      this.file[name] = properties[name];
    }
    return this._writeToStorage();
  }

  async get(name, defaultValue) {
    await this._initializedPromise;
    let val = this.file[name];
    return val !== undefined ? val : defaultValue;
  }

  async getMultiple(properties) {
    await this._initializedPromise;
    let values = Object.create(null);

    for (let name in properties) {
      let val = this.file[name];
      values[name] = val !== undefined ? val : properties[name];
    }
    return values;
  }
}

export {
  ViewHistory,
};
