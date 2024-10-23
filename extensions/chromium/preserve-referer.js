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

"use strict";
/**
 * This file is one part of the Referer persistency implementation. The other
 * part resides in chromecom.js.
 *
 * This file collects Referer headers for every http(s) request, and temporarily
 * stores the request headers in a dictionary, for REFERRER_IN_MEMORY_TIME ms.
 *
 * When the viewer is opened, it opens a port ("chromecom-referrer"). This port
 * is used to set up the webRequest listeners that stick the Referer headers to
 * the HTTP requests created by this extension. When the port is disconnected,
 * the webRequest listeners and the referrer information is discarded.
 *
 * See setReferer in chromecom.js for more explanation of this logic.
 */

/* exported canRequestBody */ // Used in pdfHandler.js

// g_referrers[tabId][frameId] = referrer of PDF frame.
var g_referrers = {};
var g_referrerTimers = {};
// The background script will eventually suspend after 30 seconds of inactivity.
// This can be delayed when extension events are firing. To prevent the data
// from being kept in memory for too long, cap the data duration to 5 minutes.
var REFERRER_IN_MEMORY_TIME = 300000;

// g_postRequests[tabId] = Set of frameId that were loaded via POST.
var g_postRequests = {};

var rIsReferer = /^referer$/i;
chrome.webRequest.onSendHeaders.addListener(
  function saveReferer(details) {
    const { tabId, frameId, requestHeaders, method } = details;
    g_referrers[tabId] ??= {};
    g_referrers[tabId][frameId] = requestHeaders.find(h =>
      rIsReferer.test(h.name)
    )?.value;
    setCanRequestBody(tabId, frameId, method !== "GET");
    forgetReferrerEventually(tabId);
  },
  { urls: ["*://*/*"], types: ["main_frame", "sub_frame"] },
  ["requestHeaders", "extraHeaders"]
);

function forgetReferrerEventually(tabId) {
  if (g_referrerTimers[tabId]) {
    clearTimeout(g_referrerTimers[tabId]);
  }
  g_referrerTimers[tabId] = setTimeout(() => {
    delete g_referrers[tabId];
    delete g_referrerTimers[tabId];
    delete g_postRequests[tabId];
  }, REFERRER_IN_MEMORY_TIME);
}

// Keeps track of whether a document in tabId + frameId is loaded through a
// POST form submission. Although this logic has nothing to do with referrer
// tracking, it is still here to enable re-use of the webRequest listener above.
function setCanRequestBody(tabId, frameId, isPOST) {
  if (isPOST) {
    g_postRequests[tabId] ??= new Set();
    g_postRequests[tabId].add(frameId);
  } else {
    g_postRequests[tabId]?.delete(frameId);
  }
}

function canRequestBody(tabId, frameId) {
  // Returns true unless the frame is known to be loaded through a POST request.
  // If the background suspends, the information may be lost. This is acceptable
  // because the information is only potentially needed shortly after document
  // load, by contentscript.js.
  return !g_postRequests[tabId]?.has(frameId);
}

// This method binds a webRequest event handler which adds the Referer header
// to matching PDF resource requests (only if the Referer is non-empty). The
// handler is removed as soon as the PDF viewer frame is unloaded.
chrome.runtime.onConnect.addListener(function onReceivePort(port) {
  if (port.name !== "chromecom-referrer") {
    return;
  }
  var tabId = port.sender.tab.id;
  var frameId = port.sender.frameId;
  var dnrRequestId;

  // If the PDF is viewed for the first time, then the referer will be set here.
  // Note: g_referrers could be empty if the background script was suspended by
  // the browser. In that case, chromecom.js may send us the referer (below).
  var referer = (g_referrers[tabId] && g_referrers[tabId][frameId]) || "";
  port.onMessage.addListener(function (data) {
    // If the viewer was opened directly (without opening a PDF URL first), then
    // the background script does not know about g_referrers, but the viewer may
    // know about the referer if stored in the history state (see chromecom.js).
    if (data.referer) {
      referer = data.referer;
    }
    dnrRequestId = data.dnrRequestId;
    setStickyReferrer(dnrRequestId, tabId, data.requestUrl, referer, () => {
      // Acknowledge the message, and include the latest referer for this frame.
      port.postMessage(referer);
    });
  });

  // The port is only disconnected when the other end reloads.
  port.onDisconnect.addListener(function () {
    unsetStickyReferrer(dnrRequestId);
  });
});

function setStickyReferrer(dnrRequestId, tabId, url, referer, callback) {
  if (!referer) {
    unsetStickyReferrer(dnrRequestId);
    callback();
    return;
  }
  const rule = {
    id: dnrRequestId,
    condition: {
      urlFilter: `|${url}|`,
      // The viewer and background are presumed to have the same origin:
      initiatorDomains: [location.hostname], // = chrome.runtime.id.
      resourceTypes: ["xmlhttprequest"],
      tabIds: [tabId],
    },
    action: {
      type: "modifyHeaders",
      requestHeaders: [{ operation: "set", header: "referer", value: referer }],
    },
  };
  chrome.declarativeNetRequest.updateSessionRules(
    { removeRuleIds: [dnrRequestId], addRules: [rule] },
    callback
  );
}

function unsetStickyReferrer(dnrRequestId) {
  if (dnrRequestId) {
    chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [dnrRequestId],
    });
  }
}
