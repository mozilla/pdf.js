/*
Copyright 2013 Mozilla Foundation

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

(function ExtensionRouterClosure() {
  var VIEWER_URL = chrome.runtime.getURL("content/web/viewer.html");
  var CRX_BASE_URL = chrome.runtime.getURL("/");

  var schemes = [
    "http",
    "https",
    "file",
    "chrome-extension",
    "blob",
    "data",
    // Chromium OS
    "filesystem",
    // Chromium OS, shorthand for filesystem:<origin>/external/
    "drive",
  ];

  /**
   * @param {string} url The URL prefixed with chrome-extension://.../
   * @returns {string|undefined} The percent-encoded URL of the (PDF) file.
   */
  function parseExtensionURL(url) {
    url = url.substring(CRX_BASE_URL.length);
    // Find the (url-encoded) colon and verify that the scheme is allowed.
    var schemeIndex = url.search(/:|%3A/i);
    if (schemeIndex === -1) {
      return undefined;
    }
    var scheme = url.slice(0, schemeIndex).toLowerCase();
    if (schemes.includes(scheme)) {
      url = url.split("#", 1)[0];
      if (url.charAt(schemeIndex) === ":") {
        url = encodeURIComponent(url);
      }
      return url;
    }
    return undefined;
  }

  function resolveViewerURL(originalUrl) {
    if (originalUrl.startsWith(CRX_BASE_URL)) {
      // This listener converts chrome-extension://.../http://...pdf to
      // chrome-extension://.../content/web/viewer.html?file=http%3A%2F%2F...pdf
      var url = parseExtensionURL(originalUrl);
      if (url) {
        url = VIEWER_URL + "?file=" + url;
        var i = originalUrl.indexOf("#");
        if (i > 0) {
          url += originalUrl.slice(i);
        }
        return url;
      }
    }
    return undefined;
  }

  self.addEventListener("fetch", event => {
    const req = event.request;
    if (req.destination === "document") {
      var url = resolveViewerURL(req.url);
      if (url) {
        console.log("Redirecting " + req.url + " to " + url);
        event.respondWith(Response.redirect(url));
      }
    }
  });

  // Ctrl + F5 bypasses service worker. the pretty extension URLs will fail to
  // resolve in that case. Catch this and redirect to destination.
  chrome.webNavigation.onErrorOccurred.addListener(
    details => {
      if (details.frameId !== 0) {
        // Not a top-level frame. Cannot easily navigate a specific child frame.
        return;
      }
      const url = resolveViewerURL(details.url);
      if (url) {
        console.log(`Redirecting ${details.url} to ${url} (fallback)`);
        chrome.tabs.update(details.tabId, { url });
      }
    },
    { url: [{ urlPrefix: CRX_BASE_URL }] }
  );

  console.log("Set up extension URL router.");
})();
