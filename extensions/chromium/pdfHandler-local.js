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
/* globals chrome, isPdfDownloadable */

'use strict';

// The onHeadersReceived event is not generated for local resources.
// Fortunately, local PDF files will have the .pdf extension, so there's
// no need to detect the Content-Type
// Unfortunately, the omnibox won't show the URL.
// Unfortunately, this method will not work for pages in incognito mode,
//  unless "incognito":"split" is used AND http:/crbug.com/224094 is fixed.

// Keeping track of incognito tab IDs will become obsolete when
// "incognito":"split" can be used.
var incognitoTabIds = [];
chrome.windows.getAll({ populate: true }, function(windows) {
  windows.forEach(function(win) {
    if (win.incognito) {
      win.tabs.forEach(function(tab) {
        incognitoTabIds.push(tab.id);
      });
    }
  });
});
chrome.tabs.onCreated.addListener(function(tab) {
  if (tab.incognito) incognitoTabIds.push(tab.id);
});
chrome.tabs.onRemoved.addListener(function(tabId) {
  var index = incognitoTabIds.indexOf(tabId);
  if (index !== -1) incognitoTabIds.splice(index, 1);
});

chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (isPdfDownloadable(details)) // Defined in pdfHandler.js
      return;

    if (incognitoTabIds.indexOf(details.tabId) !== -1)
      return; // Doesn't work in incognito mode, so don't redirect.

    var viewerPage = 'content/web/viewer.html';
    var url = chrome.extension.getURL(viewerPage) +
      '?file=' + encodeURIComponent(details.url);
    return { redirectUrl: url };
  },
  {
    urls: [
      'file://*/*.pdf',
      'file://*/*.PDF'
    ],
    types: ['main_frame', 'sub_frame']
  },
  ['blocking']);
