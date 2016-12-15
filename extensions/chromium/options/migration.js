/*
Copyright 2016 Mozilla Foundation

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
/* eslint strict: ["error", "function"] */
/* globals chrome */

(function() {
  'use strict';
  var storageLocal = chrome.storage.local;
  var storageSync = chrome.storage.sync;

  if (!storageSync) {
    // No sync storage area - nothing to migrate to.
    return;
  }

  getStorageNames(function(storageKeys) {
    storageLocal.get(storageKeys, function(values) {
      if (!values || !Object.keys(values).length) {
        // No local storage - nothing to migrate.
        return;
      }
      migrateToSyncStorage(values);
    });
  });

  function getStorageNames(callback) {
    var x = new XMLHttpRequest();
    var schema_location = chrome.runtime.getManifest().storage.managed_schema;
    x.open('get', chrome.runtime.getURL(schema_location));
    x.onload = function() {
      var storageKeys = Object.keys(x.response.properties);
      callback(storageKeys);
    };
    x.responseType = 'json';
    x.send();
  }

  // Save |values| to storage.sync and delete the values with that key from
  // storage.local.
  function migrateToSyncStorage(values) {
    storageSync.set(values, function() {
      if (chrome.runtime.lastError) {
        console.error('Failed to migrate settings due to an error: ' +
            chrome.runtime.lastError.message);
        return;
      }
      // Migration successful. Delete local settings.
      storageLocal.remove(Object.keys(values), function() {
        // In theory remove() could fail (e.g. if the browser's storage
        // backend is corrupt), but since storageSync.set succeeded, consider
        // the migration successful.
        console.log(
            'Successfully migrated preferences from local to sync storage.');
      });
    });
  }
})();
