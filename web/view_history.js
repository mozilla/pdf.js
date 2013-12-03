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
/* globals DEFAULT_SCALE, VIEW_HISTORY_MEMORY */

'use strict';

var DEFAULT_PARAMETERS = {
  exists: false,
  page: 1,
//#if !PRODUCTION
  zoom: 'auto',
//#else
//zoom: DEFAULT_SCALE,
//#endif
  scrollLeft: 0,
  scrollTop: 0
};

var ViewHistory = (function ViewHistoryClosure() {
  function ViewHistory(preferences, fingerprint) {
    this.preferences = preferences;
    this.fingerprint = fingerprint;
    this.database = {};

    this.initializedPromise =
        this.preferences.initializedPromise.then(function() {
      var database = JSON.parse(this.preferences.get('database'));

      if (!('files' in database)) {
        database.files = [];
      } else if (database.files.length >= VIEW_HISTORY_MEMORY) {
        database.files.shift();
      }
      var index, branch;
      for (var i = 0, ii = database.files.length; i < ii; i++) {
        branch = database.files[i];
        if (branch.fingerprint === this.fingerprint) {
          index = i;
          break;
        }
      }
      if (typeof index !== 'number') {
        index = database.files.push({ fingerprint: this.fingerprint }) - 1;
      }
      this.file = database.files[index];
      this.database = database;
    }.bind(this));
  }

  ViewHistory.prototype = {
    setMultiple: function ViewHistory_setMaxHeight(paramObj) {
      var keys = Object.keys(paramObj), key;
      for (var i = (keys.length - 1); i >= 0; i--) {
        key = keys[i];
        this.set(key, paramObj[key], !!i);
      }
    },

    set: function ViewHistory_set(name, value, _preventWritingToStorage) {
      if (!this.initializedPromise.isResolved) {
        return;
      } else if (DEFAULT_PARAMETERS[name] === undefined) {
        console.error('ViewHistory_set: \'' + name + '\' is undefined.');
        if (_preventWritingToStorage === undefined) {
          _preventWritingToStorage = true;
        }
      } else {
        this.file[name] = value;
      }
      if (!_preventWritingToStorage) {
        this.preferences.set('database', JSON.stringify(this.database));
      }
    },

    get: function ViewHistory_get(name) {
      var defaultParam = DEFAULT_PARAMETERS[name];

      if (defaultParam === undefined) {
        console.error('ViewHistory_get: \'' + name + '\' is undefined.');
        return;
      } else if (this.initializedPromise.isResolved) {
        var param = this.file[name];

        if (param !== undefined) {
          return param;
        }
      }
      return defaultParam;
    }
  };

  return ViewHistory;
})();
