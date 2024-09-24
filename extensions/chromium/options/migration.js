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
"use strict";

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== "update") {
    // We only need to run migration logic for extension updates, not for new
    // installs or browser updates.
    return;
  }
  var storageLocal = chrome.storage.local;
  var storageSync = chrome.storage.sync;

  if (!storageSync) {
    // No sync storage area - nothing to migrate to.
    return;
  }

  getStorageNames(function (storageKeys) {
    storageLocal.get(storageKeys, function (values) {
      if (!values || !Object.keys(values).length) {
        // No local storage - nothing to migrate.
        // ... except possibly for a renamed preference name.
        migrateRenamedStorage();
        return;
      }
      migrateToSyncStorage(values);
    });
  });

  async function getStorageNames(callback) {
    var schema_location = chrome.runtime.getManifest().storage.managed_schema;
    var res = await fetch(chrome.runtime.getURL(schema_location));
    var storageManifest = await res.json();
    var storageKeys = Object.keys(storageManifest.properties);
    callback(storageKeys);
  }

  // Save |values| to storage.sync and delete the values with that key from
  // storage.local.
  function migrateToSyncStorage(values) {
    storageSync.set(values, function () {
      if (chrome.runtime.lastError) {
        console.error(
          "Failed to migrate settings due to an error: " +
            chrome.runtime.lastError.message
        );
        return;
      }
      // Migration successful. Delete local settings.
      storageLocal.remove(Object.keys(values), function () {
        // In theory remove() could fail (e.g. if the browser's storage
        // backend is corrupt), but since storageSync.set succeeded, consider
        // the migration successful.
        console.log(
          "Successfully migrated preferences from local to sync storage."
        );
        migrateRenamedStorage();
      });
    });
  }

  // TODO: Remove this migration code somewhere in the future, when most users
  // have had their chance of migrating to the new preference format.
  // Note: We cannot modify managed preferences, so the migration logic is
  // duplicated in web/chromecom.js too.
  function migrateRenamedStorage() {
    storageSync.get(
      [
        "enableHandToolOnLoad",
        "cursorToolOnLoad",
        "disableTextLayer",
        "enhanceTextSelection",
        "textLayerMode",
        "showPreviousViewOnLoad",
        "disablePageMode",
        "viewOnLoad",
      ],
      function (items) {
        // Migration code for https://github.com/mozilla/pdf.js/pull/7635.
        if (typeof items.enableHandToolOnLoad === "boolean") {
          if (items.enableHandToolOnLoad) {
            storageSync.set(
              {
                cursorToolOnLoad: 1,
              },
              function () {
                if (!chrome.runtime.lastError) {
                  storageSync.remove("enableHandToolOnLoad");
                }
              }
            );
          } else {
            storageSync.remove("enableHandToolOnLoad");
          }
        }
        // Migration code for https://github.com/mozilla/pdf.js/pull/9479.
        if (typeof items.disableTextLayer === "boolean") {
          if (items.disableTextLayer) {
            storageSync.set(
              {
                textLayerMode: 0,
              },
              function () {
                if (!chrome.runtime.lastError) {
                  storageSync.remove([
                    "disableTextLayer",
                    "enhanceTextSelection",
                  ]);
                }
              }
            );
          } else {
            storageSync.remove(["disableTextLayer", "enhanceTextSelection"]);
          }
        }
        // Migration code for https://github.com/mozilla/pdf.js/pull/10502.
        if (typeof items.showPreviousViewOnLoad === "boolean") {
          if (!items.showPreviousViewOnLoad) {
            storageSync.set(
              {
                viewOnLoad: 1,
              },
              function () {
                if (!chrome.runtime.lastError) {
                  storageSync.remove([
                    "showPreviousViewOnLoad",
                    "disablePageMode",
                  ]);
                }
              }
            );
          } else {
            storageSync.remove(["showPreviousViewOnLoad", "disablePageMode"]);
          }
        }
      }
    );
  }
});
