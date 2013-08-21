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
/* globals chrome */

'use strict';

/**
 * @param {Object} details First argument of the webRequest.onHeadersReceived
 *                         event. The property "url" is read.
 * @return {boolean} True if the PDF file should be downloaded.
 */
function isPdfDownloadable(details) {
  if (details.url.indexOf('pdfjs.action=download') >= 0)
    return true;
  // Display the PDF viewer regardless of the Content-Disposition header
  // if the file is displayed in the main frame.
  if (details.type == 'main_frame')
    return false;
  var cdHeader = details.responseHeaders &&
    getHeaderFromHeaders(details.responseHeaders, 'content-disposition');
  return cdHeader && /^attachment/i.test(cdHeader.value);
}

/**
 * Insert the content script in a tab which renders the PDF viewer.
 * @param {number} tabId ID of the tab used by the Chrome APIs.
 * @param {string} url URL of the PDF file. Used to detect whether the viewer
 *                     should be activated in a specific (i)frame.
 */
function insertPDFJSForTab(tabId, url) {
  chrome.tabs.executeScript(tabId, {
    file: 'insertviewer.js',
    allFrames: true,
    runAt: 'document_start'
  }, function() {
    chrome.tabs.sendMessage(tabId, {
      type: 'showPDFViewer',
      url: url
    });
  });
}

/**
 * Try to render the PDF viewer when (a frame within) a tab unloads.
 * This indicates that a PDF file may be loading.
 * @param {number} tabId ID of the tab used by the Chrome APIs.
 * @param {string} url The URL of the pdf file.
 */
function activatePDFJSForTab(tabId, url) {
  if (!chrome.webNavigation) {
    // Opera... does not support the webNavigation API.
    activatePDFJSForTabFallbackForOpera(tabId, url);
    return;
  }
  var listener = function webNavigationEventListener(details) {
    if (details.tabId === tabId) {
      insertPDFJSForTab(tabId, url);
      chrome.webNavigation.onCommitted.removeListener(listener);
    }
  };
  var urlFilter = {
    url: [{ urlEquals: url.split('#', 1)[0] }]
  };
  chrome.webNavigation.onCommitted.addListener(listener, urlFilter);
}

/**
 * Fallback for Opera.
 * @see activatePDFJSForTab
 **/
function activatePDFJSForTabFallbackForOpera(tabId, url) {
  chrome.tabs.onUpdated.addListener(function listener(_tabId) {
    if (tabId === _tabId) {
      insertPDFJSForTab(tabId, url);
      chrome.tabs.onUpdated.removeListener(listener);
    }
  });
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
    return headerValue === 'application/pdf' ||
      headerValue === 'application/octet-stream' &&
      details.url.toLowerCase().indexOf('.pdf') > 0;
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
    if (!isPdfFile(details))
      return;

    if (isPdfDownloadable(details)) {
      // Force download by ensuring that Content-Disposition: attachment is set
      return getHeadersWithContentDispositionAttachment(details);
    }

    // Replace frame's content with the PDF viewer.
    // This approach maintains the friendly URL in the location bar.
    activatePDFJSForTab(details.tabId, details.url);

    return {
      responseHeaders: [
        // Set Cache-Control header to avoid downloading a file twice
        // NOTE: This does not behave as desired, Chrome's network stack is
        // oblivious for Cache control header modifications.
        {name:'Cache-Control',value:'max-age=600'},
        // Temporary render response as XHTML.
        // Since PDFs are never valid XHTML, the garbage is not going to be
        // rendered. insertviewer.js will quickly replace the document with
        // the PDF.js viewer.
        {name:'Content-Type',value:'application/xhtml+xml; charset=US-ASCII'},
      ]
    };
  },
  {
    urls: [
      '<all_urls>'
    ],
    types: ['main_frame', 'sub_frame']
  },
  ['blocking','responseHeaders']);
