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
        index = database.files.push({
          fingerprint: this.fingerprint
        }) - 1;
      }

      this.file = database.files[index];
      this.database = database;
    });
  }

  async _writeToStorage() {
    let databaseStr = JSON.stringify(this.database);
    localStorage.setItem('pdfjs.history', databaseStr);
  }

  async _readFromStorage() {
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

exports.ViewHistory = ViewHistory;