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
/* globals chrome, URL, getViewerURL */

'use strict';

// Hash map of "<pdf url>": "<stream url>"
var urlToStream = {};

// Note: Execution of this script stops when the streamsPrivate API is
// not available, because an error will be thrown. Don't bother with
// catching and handling the error, because it is a great way to see
// when the streamsPrivate API is unavailable.
chrome.streamsPrivate.onExecuteMimeTypeHandler.addListener(handleStream);

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message && message.action === 'getPDFStream') {
    var pdfUrl = message.data;
    var streamUrl = urlToStream[pdfUrl];
    // The stream can be used only once.
    delete urlToStream[pdfUrl];
    sendResponse({
      streamUrl: streamUrl
    });
  }
});

/**
 * Callback for when we receive a stream
 *
 * @param mimeType {string} The mime type of the incoming stream
 * @param pdfUrl {string} The full URL to the file
 * @param streamUrl {string} The url pointing to the open stream
 * @param tabId {number} The ID of the tab in which the stream has been opened
 *                       (undefined before Chrome 27, http://crbug.com/225605)
 */
function handleStream(mimeType, pdfUrl, streamUrl, tabId) {
  console.log('Intercepted ' + mimeType + ' in tab ' + tabId + ' with URL ' +
              pdfUrl + '\nAvailable as: ' + streamUrl);
  urlToStream[pdfUrl] = streamUrl;
}

/**
 * Callback for when a navigation error has occurred.
 * This event is triggered when the chrome.streamsPrivate API has intercepted
 *  the PDF stream. This method detects such streams, finds the frame where
 *  the request was made, and loads the viewer in that frame.
 *
 * @param details {object}
 * @param details.tabId {number} The ID of the tab
 * @param details.url {string} The URL being navigated when the error occurred.
 * @param details.frameId {number} 0 indicates the navigation happens in the tab
 *                                 content window; a positive value indicates
 *                                 navigation in a subframe.
 * @param details.error {string}
 */
function webNavigationOnErrorOccurred(details) {
  var tabId = details.tabId;
  var frameId = details.frameId;
  var pdfUrl = details.url;

  if (details.error === 'net::ERR_ABORTED') {
    if (!urlToStream[pdfUrl]) {
      console.log('No saved PDF stream found for ' + pdfUrl);
      return;
    }
    var viewerUrl = getViewerURL(pdfUrl);

    if (frameId === 0) { // Main frame
      console.log('Going to render PDF Viewer in main frame for ' + pdfUrl);
      chrome.tabs.update(tabId, {
        url: viewerUrl
      });
    } else {
      console.log('Going to render PDF Viewer in sub frame for ' + pdfUrl);
      // Non-standard Chrome API. chrome.tabs.executeScriptInFrame and docs
      // is available at https://github.com/Rob--W/chrome-api
      chrome.tabs.executeScriptInFrame(tabId, {
        frameId: frameId,
        code: 'location.href = ' + JSON.stringify(viewerUrl) + ';'
      }, function(result) {
        if (!result) { // Did the tab disappear? Is the frame inaccessible?
          console.warn('Frame not found, viewer not rendered in tab ' + tabId);
        }
      });
    }
  }
}

chrome.webNavigation.onErrorOccurred.addListener(webNavigationOnErrorOccurred);
