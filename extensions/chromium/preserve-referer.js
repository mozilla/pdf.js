/*
Copyright 2015 Mozilla Foundation

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
/* import-globals-from pdfHandler.js */

'use strict';
/**
 * This file is one part of the Referer persistency implementation. The other
 * part resides in chromecom.js.
 *
 * This file collects request headers for every http(s) request, and temporarily
 * stores the request headers in a dictionary. Upon completion of the request
 * (success or failure), the headers are discarded.
 * pdfHandler.js will call saveReferer(details) when it is about to redirect to
 * the viewer. Upon calling saveReferer, the Referer header is extracted from
 * the request headers and saved.
 *
 * When the viewer is opened, it opens a port ("chromecom-referrer"). This port
 * is used to set up the webRequest listeners that stick the Referer headers to
 * the HTTP requests created by this extension. When the port is disconnected,
 * the webRequest listeners and the referrer information is discarded.
 *
 * See setReferer in chromecom.js for more explanation of this logic.
 */

// Remembers the request headers for every http(s) page request for the duration
// of the request.
var g_requestHeaders = {};
// g_referrers[tabId][frameId] = referrer of PDF frame.
var g_referrers = {};

var extraInfoSpecWithHeaders; // = ['requestHeaders', 'extraHeaders']

(function() {
  var requestFilter = {
    urls: ['*://*/*'],
    types: ['main_frame', 'sub_frame'],
  };
  function registerListener(extraInfoSpec) {
    extraInfoSpecWithHeaders = extraInfoSpec;
    // May throw if the given extraInfoSpec is unsupported.
    chrome.webRequest.onSendHeaders.addListener(function(details) {
      g_requestHeaders[details.requestId] = details.requestHeaders;
    }, requestFilter, extraInfoSpec);
  }
  try {
    registerListener(['requestHeaders', 'extraHeaders']);
  } catch (e) {
    // "extraHeaders" is not supported in Chrome 71 and earlier.
    registerListener(['requestHeaders']);
  }
  chrome.webRequest.onBeforeRedirect.addListener(forgetHeaders, requestFilter);
  chrome.webRequest.onCompleted.addListener(forgetHeaders, requestFilter);
  chrome.webRequest.onErrorOccurred.addListener(forgetHeaders, requestFilter);
  function forgetHeaders(details) {
    delete g_requestHeaders[details.requestId];
  }
})();

/**
 * @param {object} details - onHeadersReceived event data.
 */
function saveReferer(details) {
  var referer = g_requestHeaders[details.requestId] &&
      getHeaderFromHeaders(g_requestHeaders[details.requestId], 'referer');
  referer = referer && referer.value || '';
  if (!g_referrers[details.tabId]) {
    g_referrers[details.tabId] = {};
  }
  g_referrers[details.tabId][details.frameId] = referer;
}

chrome.tabs.onRemoved.addListener(function(tabId) {
  delete g_referrers[tabId];
});

// This method binds a webRequest event handler which adds the Referer header
// to matching PDF resource requests (only if the Referer is non-empty). The
// handler is removed as soon as the PDF viewer frame is unloaded.
chrome.runtime.onConnect.addListener(function onReceivePort(port) {
  if (port.name !== 'chromecom-referrer') {
    return;
  }
  // Note: sender.frameId is only set in Chrome 41+.
  if (!('frameId' in port.sender)) {
    port.disconnect();
    return;
  }
  var tabId = port.sender.tab.id;
  var frameId = port.sender.frameId;

  // If the PDF is viewed for the first time, then the referer will be set here.
  var referer = g_referrers[tabId] && g_referrers[tabId][frameId] || '';
  port.onMessage.addListener(function(data) {
    // If the viewer was opened directly (without opening a PDF URL first), then
    // the background script does not know about g_referrers, but the viewer may
    // know about the referer if stored in the history state (see chromecom.js).
    if (data.referer) {
      referer = data.referer;
    }
    chrome.webRequest.onBeforeSendHeaders.removeListener(onBeforeSendHeaders);
    if (referer) {
      // Only add a blocking request handler if the referer has to be rewritten.
      chrome.webRequest.onBeforeSendHeaders.addListener(onBeforeSendHeaders, {
        urls: [data.requestUrl],
        types: ['xmlhttprequest'],
        tabId: tabId,
      }, ['blocking', ...extraInfoSpecWithHeaders]);
    }
    // Acknowledge the message, and include the latest referer for this frame.
    port.postMessage(referer);
  });

  // The port is only disconnected when the other end reloads.
  port.onDisconnect.addListener(function() {
    if (g_referrers[tabId]) {
      delete g_referrers[tabId][frameId];
    }
    chrome.webRequest.onBeforeSendHeaders.removeListener(onBeforeSendHeaders);
    chrome.webRequest.onHeadersReceived.removeListener(exposeOnHeadersReceived);
  });

  // Expose some response headers for fetch API calls from PDF.js;
  // This is a work-around for https://crbug.com/784528
  chrome.webRequest.onHeadersReceived.addListener(exposeOnHeadersReceived, {
    urls: ['https://*/*'],
    types: ['xmlhttprequest'],
    tabId: tabId,
  }, ['blocking', 'responseHeaders']);

  function onBeforeSendHeaders(details) {
    if (details.frameId !== frameId) {
      return undefined;
    }
    var headers = details.requestHeaders;
    var refererHeader = getHeaderFromHeaders(headers, 'referer');
    if (!refererHeader) {
      refererHeader = { name: 'Referer', };
      headers.push(refererHeader);
    } else if (refererHeader.value &&
        refererHeader.value.lastIndexOf('chrome-extension:', 0) !== 0) {
      // Sanity check. If the referer is set, and the value is not the URL of
      // this extension, then the request was not initiated by this extension.
      return undefined;
    }
    refererHeader.value = referer;
    return { requestHeaders: headers, };
  }

  function exposeOnHeadersReceived(details) {
    if (details.frameId !== frameId) {
      return undefined;
    }
    var headers = details.responseHeaders;
    var aceh = getHeaderFromHeaders(headers, 'access-control-expose-headers');
    // List of headers that PDF.js uses in src/display/network_utils.js
    var acehValue =
      'accept-ranges,content-encoding,content-length,content-disposition';
    if (aceh) {
      aceh.value += ',' + acehValue;
    } else {
      aceh = { name: 'Access-Control-Expose-Headers', value: acehValue, };
      headers.push(aceh);
    }
    return { responseHeaders: headers, };
  }
});
