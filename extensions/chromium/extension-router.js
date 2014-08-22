/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
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
/* globals chrome */

'use strict';

(function ExtensionRouterClosure() {
  var VIEWER_URL = chrome.extension.getURL('content/web/viewer.html');
  var CRX_BASE_URL = chrome.extension.getURL('/');

  var schemes = [
    'http',
    'https',
    'ftp',
    'file',
    'chrome-extension',
    // Chromium OS
    'filesystem',
    // Chromium OS, shorthand for filesystem:<origin>/external/
    'drive'
  ];

  /**
   * @param {string} url The URL prefixed with chrome-extension://.../
   * @return {string|undefined} The percent-encoded URL of the (PDF) file.
   */
  function parseExtensionURL(url) {
    url = url.substring(CRX_BASE_URL.length);
    // Find the (url-encoded) colon and verify that the scheme is whitelisted.
    var schemeIndex = url.search(/:|%3A/i);
    if (schemeIndex === -1) {
      return;
    }
    var scheme = url.slice(0, schemeIndex).toLowerCase();
    if (schemes.indexOf(scheme) >= 0) {
      url = url.split('#')[0];
      if (url.charAt(schemeIndex) === ':') {
        url = encodeURIComponent(url);
      }
      return url;
    }
  }

  // TODO(rob): Use declarativeWebRequest once declared URL-encoding is
  //            supported, see http://crbug.com/273589
  //            (or rewrite the query string parser in viewer.js to get it to
  //             recognize the non-URL-encoded PDF URL.)
  chrome.webRequest.onBeforeRequest.addListener(function(details) {
    // This listener converts chrome-extension://.../http://...pdf to
    // chrome-extension://.../content/web/viewer.html?file=http%3A%2F%2F...pdf
    var url = parseExtensionURL(details.url);
    if (url) {
      url = VIEWER_URL + '?file=' + url;
      var i = details.url.indexOf('#');
      if (i > 0) {
        url += details.url.slice(i);
      }
      console.log('Redirecting ' + details.url + ' to ' + url);
      return { redirectUrl: url };
    }
  }, {
    types: ['main_frame', 'sub_frame'],
    urls: schemes.map(function(scheme) {
      // Format: "chrome-extension://[EXTENSIONID]/<scheme>*"
      return CRX_BASE_URL + scheme + '*';
    })
  }, ['blocking']);

  // When session restore is used, viewer pages may be loaded before the
  // webRequest event listener is attached (= page not found).
  // Reload these tabs.
  chrome.tabs.query({
    url: CRX_BASE_URL + '*:*'
  }, function(tabsFromLastSession) {
    for (var i = 0; i < tabsFromLastSession.length; ++i) {
      chrome.tabs.reload(tabsFromLastSession[i].id);
    }
  });
  console.log('Set up extension URL router.');
})();
