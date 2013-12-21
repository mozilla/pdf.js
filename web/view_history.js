/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
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
/* globals PDFJS, VIEW_HISTORY_MEMORY, isLocalStorageEnabled */

'use strict';

/**
 * View History - This is a utility for saving various view parameters for
 *                recently opened files.
 *
 * The way that the view parameters are stored depends on how PDF.js is built,
 * for 'node make <flag>' the following cases exist:
 *  - FIREFOX or MOZCENTRAL - uses about:config.
 *  - B2G                   - uses asyncStorage.
 *  - GENERIC or CHROME     - uses localStorage, if it is available.
 */
var ViewHistory = (function ViewHistoryClosure() {
  function ViewHistory(fingerprint) {
    this.fingerprint = fingerprint;
    this.initializedPromise = new PDFJS.Promise();

    var resolvePromise = (function ViewHistoryResolvePromise(db) {
      this.initialize(db || '{}');
      this.initializedPromise.resolve();
    }).bind(this);

//#if B2G
//  asyncStorage.getItem('database', resolvePromise);
//#endif

//#if FIREFOX || MOZCENTRAL
//  resolvePromise(FirefoxCom.requestSync('getDatabase', null));
//#endif

//#if !(FIREFOX || MOZCENTRAL || B2G)
    if (isLocalStorageEnabled) {
      resolvePromise(localStorage.getItem('database'));
    }
//#endif
  }

  ViewHistory.prototype = {
    initialize: function ViewHistory_initialize(database) {
      database = JSON.parse(database);
      if (!('files' in database)) {
        database.files = [];
      }
      if (database.files.length >= VIEW_HISTORY_MEMORY) {
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
    },

    set: function ViewHistory_set(name, val) {
      if (!this.initializedPromise.isResolved) {
        return;
      }
      var file = this.file;
      file[name] = val;
      var database = JSON.stringify(this.database);

//#if B2G
//    asyncStorage.setItem('database', database);
//#endif

//#if FIREFOX || MOZCENTRAL
//    FirefoxCom.requestSync('setDatabase', database);
//#endif

//#if !(FIREFOX || MOZCENTRAL || B2G)
      if (isLocalStorageEnabled) {
        localStorage.setItem('database', database);
      }
//#endif
    },

    get: function ViewHistory_get(name, defaultValue) {
      if (!this.initializedPromise.isResolved) {
        return defaultValue;
      }
      return this.file[name] || defaultValue;
    }
  };

  return ViewHistory;
})();
