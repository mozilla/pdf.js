/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/*
Copyright 2012 Mozilla Foundation

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
/* globals chrome, Features, saveReferer */

'use strict';

var VIEWER_URL = chrome.extension.getURL('content/web/viewer.html');

function getViewerURL(pdf_url) {
  return VIEWER_URL + '?file=' + encodeURIComponent(pdf_url);
}

/**
 * @param {Object} details First argument of the webRequest.onHeadersReceived
 *                         event. The property "url" is read.
 * @return {boolean} True if the PDF file should be downloaded.
 */
function isPdfDownloadable(details) {
  if (details.url.indexOf('pdfjs.action=download') >= 0) {
    return true;
  }
  // Display the PDF viewer regardless of the Content-Disposition header
  // if the file is displayed in the main frame.
  if (details.type === 'main_frame') {
    return false;
  }
  var cdHeader = (details.responseHeaders &&
    getHeaderFromHeaders(details.responseHeaders, 'content-disposition'));
  return (cdHeader && /^attachment/i.test(cdHeader.value));
}

/**
 * Get the header from the list of headers for a given name.
 * @param {Array} headers responseHeaders of webRequest.onHeadersReceived
 * @return {undefined|{name: string, value: string}} The header, if found.
 */
function getHeaderFromHeaders(headers, headerName) {
  for (var i=0; i<headers.length; ++i) {
    var header = headers[i];
    if (header.name.toLowerCase() === headerName) {
      return header;
    }
  }
}

/**
 * Check if the request is a PDF file.
 * @param {Object} details First argument of the webRequest.onHeadersReceived
 *                         event. The properties "responseHeaders" and "url"
 *                         are read.
 * @return {boolean} True if the resource is a PDF file.
 */
function isPdfFile(details) {
  var header = getHeaderFromHeaders(details.responseHeaders, 'content-type');
  if (header) {
    var headerValue = header.value.toLowerCase().split(';',1)[0].trim();
    return (headerValue === 'application/pdf' ||
            headerValue === 'application/octet-stream' &&
            details.url.toLowerCase().indexOf('.pdf') > 0);
  }
}

/**
 * Takes a set of headers, and set "Content-Disposition: attachment".
 * @param {Object} details First argument of the webRequest.onHeadersReceived
 *                         event. The property "responseHeaders" is read and
 *                         modified if needed.
 * @return {Object|undefined} The return value for the onHeadersReceived event.
 *                            Object with key "responseHeaders" if the headers
 *                            have been modified, undefined otherwise.
 */
function getHeadersWithContentDispositionAttachment(details) {
  var headers = details.responseHeaders;
  var cdHeader = getHeaderFromHeaders(headers, 'content-disposition');
  if (!cdHeader) {
    cdHeader = {name: 'Content-Disposition'};
    headers.push(cdHeader);
  }
  if (!/^attachment/i.test(cdHeader.value)) {
    cdHeader.value = 'attachment' + cdHeader.value.replace(/^[^;]+/i, '');
    return { responseHeaders: headers };
  }
}

chrome.webRequest.onHeadersReceived.addListener(
  function(details) {
    if (details.method !== 'GET') {
      // Don't intercept POST requests until http://crbug.com/104058 is fixed.
      return;
    }
    if (!isPdfFile(details)) {
      return;
    }
    if (isPdfDownloadable(details)) {
      // Force download by ensuring that Content-Disposition: attachment is set
      return getHeadersWithContentDispositionAttachment(details);
    }

    var viewerUrl = getViewerURL(details.url);

    // Implemented in preserve-referer.js
    saveReferer(details);

    // Replace frame with viewer
    if (Features.webRequestRedirectUrl) {
      return { redirectUrl: viewerUrl };
    }
    // Aww.. redirectUrl is not yet supported, so we have to use a different
    // method as fallback (Chromium <35).

    if (details.frameId === 0) {
      // Main frame. Just replace the tab and be done!
      chrome.tabs.update(details.tabId, {
        url: viewerUrl
      });
      return { cancel: true };
    } else {
      // Sub frame. Requires some more work...
      // The navigation will be cancelled at the end of the webRequest cycle.
      chrome.webNavigation.onErrorOccurred.addListener(function listener(nav) {
        if (nav.tabId !== details.tabId || nav.frameId !== details.frameId) {
          return;
        }
        chrome.webNavigation.onErrorOccurred.removeListener(listener);

        // Locate frame and insert viewer
        chrome.tabs.executeScriptInFrame(details.tabId, {
          frameId: details.frameId,
          code: 'location.href = ' + JSON.stringify(viewerUrl) + ';'
        }, function(result) {
          if (!result) {
            console.warn('Frame not found! Opening viewer in new tab...');
            chrome.tabs.create({
              url: viewerUrl
            });
          }
        });
      }, {
        url: [{ urlEquals: details.url.split('#', 1)[0] }]
      });
      // Prevent frame from rendering by using X-Frame-Options.
      // Do not use { cancel: true }, because that makes the frame inaccessible
      // to the content script that has to replace the frame's URL.
      return {
        responseHeaders: [{
          name: 'X-Content-Type-Options',
          value: 'nosniff'
        }, {
          name: 'X-Frame-Options',
          value: 'deny'
        }]
      };
    }

    // Immediately abort the request, because the frame that initiated the
    // request will be replaced with the PDF Viewer (within a split second).
  },
  {
    urls: [
      '<all_urls>'
    ],
    types: ['main_frame', 'sub_frame']
  },
  ['blocking','responseHeaders']);

chrome.webRequest.onBeforeRequest.addListener(
  function onBeforeRequestForFTP(details) {
    if (!Features.extensionSupportsFTP) {
      chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequestForFTP);
      return;
    }
    if (isPdfDownloadable(details)) {
      return;
    }
    var viewerUrl = getViewerURL(details.url);
    return { redirectUrl: viewerUrl };
  },
  {
    urls: [
      'ftp://*/*.pdf',
      'ftp://*/*.PDF'
    ],
    types: ['main_frame', 'sub_frame']
  },
  ['blocking']);

chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (isPdfDownloadable(details)) {
      return;
    }

    // NOTE: The manifest file has declared an empty content script
    // at file://*/* to make sure that the viewer can load the PDF file
    // through XMLHttpRequest. Necessary to deal with http://crbug.com/302548
    var viewerUrl = getViewerURL(details.url);

    return { redirectUrl: viewerUrl };
  },
  {
    urls: [
      'file://*/*.pdf',
      'file://*/*.PDF'
    ],
    types: ['main_frame', 'sub_frame']
  },
  ['blocking']);
