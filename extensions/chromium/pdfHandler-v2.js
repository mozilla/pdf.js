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

//
// Stream URL storage manager
//

// Hash map of "<tab id>": { "<pdf url>": ["<stream url>", ...], ... }
var urlToStream = {};

// Note: Execution of this script stops when the streamsPrivate API is
// not available, because an error will be thrown. Don't bother with
// catching and handling the error, because it is a great way to see
// when the streamsPrivate API is unavailable.
chrome.streamsPrivate.onExecuteMimeTypeHandler.addListener(handleStream);

// Chrome before 27 does not support tabIds on stream events.
var streamSupportsTabId = true;
// "tabId" used for Chrome before 27.
var STREAM_NO_TABID = 0;

function hasStream(tabId, pdfUrl) {
  var streams = urlToStream[streamSupportsTabId ? tabId : STREAM_NO_TABID];
  return streams && streams[pdfUrl] && streams[pdfUrl].length > 0;
}

/**
* Get stream URL for a given tabId and PDF url. The retrieved stream URL
* will be removed from the list.
* @return {string|undefined} The blob:-URL
*/
function getStream(tabId, pdfUrl) {
  if (!streamSupportsTabId) tabId = STREAM_NO_TABID;
  if (hasStream(tabId, pdfUrl)) {
    var streamUrl = urlToStream[tabId][pdfUrl].shift();
    if (urlToStream[tabId][pdfUrl].length === 0) {
      delete urlToStream[tabId][pdfUrl];
      if (Object.keys(urlToStream[tabId]).length === 0) {
        delete urlToStream[tabId];
      }
    }
    return streamUrl;
  }
}

function setStream(tabId, pdfUrl, streamUrl) {
  tabId = tabId || STREAM_NO_TABID;
  if (!urlToStream[tabId]) urlToStream[tabId] = {};
  if (!urlToStream[tabId][pdfUrl]) urlToStream[tabId][pdfUrl] = [];
  urlToStream[tabId][pdfUrl].push(streamUrl);
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message && message.action === 'getPDFStream') {
    var pdfUrl = message.data;
    var streamUrl = getStream(sender.tab.id, pdfUrl);
    sendResponse({
      streamUrl: streamUrl
    });
  }
});

//
// PDF detection and activation of PDF viewer.
//

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
  streamSupportsTabId = typeof tabId === 'number';

  setStream(tabId, pdfUrl, streamUrl);

  if (!tabId) { // Chrome doesn't set the tabId before v27
    // PDF.js targets Chrome 28+ because of fatal bugs in incognito mode
    // for older versions of Chrome. So, don't bother implementing a fallback.
    // For those who are interested, either loop through all tabs, or use the
    // webNavigation.onBeforeNavigate event to map pdfUrls to tab + frame IDs.
    return;
  }

  // Check if the frame has already been rendered.
  chrome.webNavigation.getAllFrames({
    tabId: tabId
  }, function(details) {
    if (details) {
      details = details.filter(function(frame) {
        return frame.url === pdfUrl;
      });
      if (details.length > 0) {
        if (details.length !== 1) {
          // (Rare case) Multiple frames with same URL.
          // TODO(rob): Find a better way to handle this case.
          console.warn('More than one frame found for tabId ' + tabId +
            ' with URL ' + pdfUrl + '. Using first frame.');
        }
        details = details[0];
        details = {
          tabId: tabId,
          frameId: details.frameId,
          url: details.url
        };
        handleWebNavigation(details);
      } else {
        console.warn('No webNavigation frames found for tabId ' + tabId);
      }
    } else {
      console.warn('Unable to get frame information for tabId ' + tabId);
    }
  });
}

/**
 * This method is called when the chrome.streamsPrivate API has intercepted
 *  the PDF stream. This method detects such streams, finds the frame where
 *  the request was made, and loads the viewer in that frame.
 *
 * @param details {object}
 * @param details.tabId {number} The ID of the tab
 * @param details.url {string} The URL being navigated when the error occurred.
 * @param details.frameId {number} 0 indicates the navigation happens in the tab
 *                                 content window; a positive value indicates
 *                                 navigation in a subframe.
 */
function handleWebNavigation(details) {
  var tabId = details.tabId;
  var frameId = details.frameId;
  var pdfUrl = details.url;

  if (!hasStream(tabId, pdfUrl)) {
    console.log('No PDF stream found in tab ' + tabId + ' for ' + pdfUrl);
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
