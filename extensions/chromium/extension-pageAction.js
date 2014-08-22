/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/*
Copyright 2014 Mozilla Foundation

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

(function ExtensionPageActionClosure() {
  var VIEWER_URL = chrome.extension.getURL('content/web/viewer.html');

  /**
   * @param {string} url URL of PDF Viewer.
   * @return {string|undefined} The percent-encoded URL of the (PDF) file.
   */
  function parseViewerURL(url) {
    if (url.lastIndexOf(VIEWER_URL, 0) !== 0) {
      // Does not even start with the correct URL. Bye!
      return;
    }
    url = url.match(/[&?]file=([^&#]+)/);
    if (url) {
      url = url[1];
      return url;
    }
  }

  /**
   * @param {number} tabId ID of tab where the page action will be shown
   * @param {string} url URL to be displayed in page action
   */
  function showPageAction(tabId, displayUrl) {
    var url = parsePDFjsExtensionURL(displayUrl) || parseViewerURL(displayUrl);
    if (url) {
      chrome.pageAction.setPopup({
        tabId: tabId,
        popup: 'pageActionPopup.html?file=' + url
      });
      chrome.pageAction.show(tabId);
    } else {
      console.log('Unable to get PDF url from ' + displayUrl);
    }
  }

  chrome.runtime.onMessage.addListener(function(message, sender) {
    if (message === 'showPageAction' && sender.tab) {
      showPageAction(sender.tab.id, sender.tab.url);
    }
  });

  console.log('Set up page action.');
})();
