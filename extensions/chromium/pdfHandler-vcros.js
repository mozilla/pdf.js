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
/* eslint strict: ["error", "function"] */
/* globals chrome, getViewerURL */

(function() {
  'use strict';

  if (!chrome.fileBrowserHandler) {
    // Not on Chromium OS, bail out
    return;
  }
  chrome.fileBrowserHandler.onExecute.addListener(onExecuteFileBrowserHandler);

  /**
   * Invoked when "Open with PDF Viewer" is chosen in the File browser.
   *
   * @param {String} id      File browser action ID as specified in
   *                         manifest.json
   * @param {Object} details Object of type FileHandlerExecuteEventDetails
   */
  function onExecuteFileBrowserHandler(id, details) {
    if (id !== 'open-as-pdf') {
      return;
    }
    var fileEntries = details.entries;
    // "tab_id" is the currently documented format, but it is inconsistent with
    // the other Chrome APIs that use "tabId" (http://crbug.com/179767)
    var tabId = details.tab_id || details.tabId;
    if (tabId > 0) {
      chrome.tabs.get(tabId, function(tab) {
        openViewer(tab && tab.windowId, fileEntries);
      });
    } else {
      // Re-use existing window, if available.
      chrome.windows.getLastFocused(function(chromeWindow) {
        var windowId = chromeWindow && chromeWindow.id;
        if (windowId) {
          chrome.windows.update(windowId, { focused: true });
        }
        openViewer(windowId, fileEntries);
      });
    }
  }

  /**
   * Open the PDF Viewer for the given list of PDF files.
   *
   * @param {number} windowId
   * @param {Array} fileEntries List of Entry objects (HTML5 FileSystem API)
   */
  function openViewer(windowId, fileEntries) {
    if (!fileEntries.length) {
      return;
    }
    var fileEntry = fileEntries.shift();
    var url = fileEntry.toURL();
    // Use drive: alias to get shorter (more human-readable) URLs.
    url = url.replace(/^filesystem:chrome-extension:\/\/[a-p]{32}\/external\//,
                      'drive:');
    url = getViewerURL(url);

    if (windowId) {
      chrome.tabs.create({
        windowId: windowId,
        active: true,
        url: url
      }, function() {
        openViewer(windowId, fileEntries);
      });
    } else {
      chrome.windows.create({
        type: 'normal',
        focused: true,
        url: url
      }, function(chromeWindow) {
        openViewer(chromeWindow.id, fileEntries);
      });
    }
  }
})();
