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

function isPdfDownloadable(details) {
  return details.url.indexOf('pdfjs.action=download') >= 0;
}

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
function activatePDFJSForTab(tabId, url) {
  chrome.tabs.onUpdated.addListener(function listener(_tabId) {
    if (tabId === _tabId) {
      insertPDFJSForTab(tabId, url);
      chrome.tabs.onUpdated.removeListener(listener);
    }
  });
}

chrome.webRequest.onHeadersReceived.addListener(
  function(details) {
    // Check if the response is a PDF file
    var isPDF = false;
    var headers = details.responseHeaders;
    var header, i;
    var cdHeader;
    if (!headers)
      return;
    for (i=0; i<headers.length; ++i) {
      header = headers[i];
      if (header.name.toLowerCase() == 'content-type') {
        var headerValue = header.value.toLowerCase().split(';',1)[0].trim();
        isPDF = headerValue === 'application/pdf' ||
                headerValue === 'application/octet-stream' &&
                details.url.toLowerCase().indexOf('.pdf') > 0;
        break;
      }
    }
    if (!isPDF)
      return;

    if (isPdfDownloadable(details)) {
      // Force download by ensuring that Content-Disposition: attachment is set
      if (!cdHeader) {
        for (; i<headers.length; ++i) {
          header = headers[i];
          if (header.name.toLowerCase() == 'content-disposition') {
            cdHeader = header;
            break;
          }
        }
      }
      if (!cdHeader) {
        cdHeader = {name: 'Content-Disposition', value: ''};
        headers.push(cdHeader);
      }
      if (cdHeader.value.toLowerCase().indexOf('attachment') === -1) {
        cdHeader.value = 'attachment' + cdHeader.value.replace(/^[^;]+/i, '');
        return {
          responseHeaders: headers
        };
      }
      return;
    }

    // Replace frame's content with the PDF viewer
    // This approach maintains the friendly URL in the 
    // location bar
    activatePDFJSForTab(details.tabId, details.url);

    return {
      responseHeaders: [
        // Set Cache-Control header to avoid downloading a file twice
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
