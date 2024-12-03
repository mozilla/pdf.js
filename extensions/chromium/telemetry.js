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

(function () {
  "use strict";
  // This module sends the browser and extension version to a server, to
  // determine whether it is safe to drop support for old Chrome versions in
  // future extension updates.
  //
  // The source code for the server is available at:
  // https://github.com/Rob--W/pdfjs-telemetry
  var LOG_URL = "https://pdfjs.robwu.nl/logpdfjs";

  // The minimum time to wait before sending a ping, so that we don't send too
  // many requests even if the user restarts their browser very often.
  // We want one ping a day, so a minimum delay of 12 hours should be OK.
  var MINIMUM_TIME_BETWEEN_PING = 12 * 36e5;

  if (chrome.extension.inIncognitoContext) {
    // The extension uses incognito split mode, so there are two background
    // pages. Only send telemetry when not in incognito mode.
    return;
  }

  if (chrome.runtime.id !== "oemmndcbldboiebfnladdacbdfmadadm") {
    // Only send telemetry for the official PDF.js extension.
    console.warn("Disabled telemetry because this is not an official build.");
    return;
  }

  // The localStorage API is unavailable in service workers. We store data in
  // chrome.storage.local and use this "localStorage" object to enable
  // synchronous access in the logic.
  const localStorage = {
    telemetryLastTime: 0,
    telemetryDeduplicationId: "",
    telemetryLastVersion: "",
  };

  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === "maybeSendPing") {
      maybeSendPing();
    }
  });
  chrome.storage.session.get({ didPingCheck: false }, async items => {
    if (items?.didPingCheck) {
      return;
    }
    maybeSendPing();
    await chrome.alarms.clear("maybeSendPing");
    await chrome.alarms.create("maybeSendPing", { periodInMinutes: 60 });
    chrome.storage.session.set({ didPingCheck: true });
  });

  function updateLocalStorage(key, value) {
    localStorage[key] = value;
    // Note: We mirror the data in localStorage because the following is async.
    chrome.storage.local.set({ [key]: value });
  }

  function maybeSendPing() {
    getLoggingPref(function (didOptOut) {
      if (didOptOut) {
        // Respect the user's decision to not send statistics.
        return;
      }
      if (!navigator.onLine) {
        // No network available; Wait until the next scheduled ping opportunity.
        // Even if onLine is true, the server may still be unreachable. But
        // because it is impossible to tell whether a request failed due to the
        // inability to connect, or a deliberate connection termination by the
        // server, we don't validate the response and assume that the request
        // succeeded. This ensures that the server cannot ask the client to
        // send more pings.
        return;
      }
      doSendPing();
    });
  }

  function doSendPing() {
    chrome.storage.local.get(localStorage, items => {
      Object.assign(localStorage, items);

      var lastTime = parseInt(localStorage.telemetryLastTime) || 0;
      var wasUpdated = didUpdateSinceLastCheck();
      if (!wasUpdated && Date.now() - lastTime < MINIMUM_TIME_BETWEEN_PING) {
        return;
      }
      updateLocalStorage("telemetryLastTime", Date.now());

      var deduplication_id = getDeduplicationId(wasUpdated);
      var extension_version = chrome.runtime.getManifest().version;
      fetch(LOG_URL, {
        method: "POST",
        headers: new Headers({
          "Deduplication-Id": deduplication_id,
          "Extension-Version": extension_version,
        }),
        // Set mode=cors so that the above custom headers are included in the
        // request.
        mode: "cors",
        // Omits credentials such as cookies in the requests, which guarantees
        // that the server cannot track the client via HTTP cookies.
        credentials: "omit",
        cache: "no-store",
      });
    });
  }

  /**
   * Generate a 40-bit hexadecimal string (=10 letters, 1.1E12 possibilities).
   * This is used by the server to discard duplicate entries of the same browser
   * version when the log data is aggregated.
   */
  function getDeduplicationId(wasUpdated) {
    var id = localStorage.telemetryDeduplicationId;
    // The ID is only used to deduplicate reports for the same browser version,
    // so it is OK to change the ID if the browser is updated. By changing the
    // ID, the server cannot track users for a long period even if it wants to.
    if (!id || !/^[0-9a-f]{10}$/.test(id) || wasUpdated) {
      id = "";
      var buf = new Uint8Array(5);
      crypto.getRandomValues(buf);
      for (const c of buf) {
        id += (c >>> 4).toString(16) + (c & 0xf).toString(16);
      }
      updateLocalStorage("telemetryDeduplicationId", id);
    }
    return id;
  }

  /**
   * Returns whether the browser has received a major update since the last call
   * to this function.
   */
  function didUpdateSinceLastCheck() {
    var chromeVersion = /Chrome\/(\d+)\./.exec(navigator.userAgent);
    chromeVersion = chromeVersion && chromeVersion[1];
    if (!chromeVersion || localStorage.telemetryLastVersion === chromeVersion) {
      return false;
    }
    updateLocalStorage("telemetryLastVersion", chromeVersion);
    return true;
  }

  /**
   * Get the value of the telemetry preference. The callback is invoked with a
   * boolean if a preference is found, and with the undefined value otherwise.
   */
  function getLoggingPref(callback) {
    // Try to look up the preference in the storage, in the following order:
    var areas = ["sync", "local", "managed"];

    next();
    function next(result) {
      var storageAreaName = areas.shift();
      if (typeof result === "boolean" || !storageAreaName) {
        callback(result);
        return;
      }

      if (!chrome.storage[storageAreaName]) {
        next();
        return;
      }

      chrome.storage[storageAreaName].get("disableTelemetry", function (items) {
        next(items && items.disableTelemetry);
      });
    }
  }
})();
