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

// Do not reload the extension when an update becomes available, UNLESS the PDF
// viewer is not displaying any PDF files. Otherwise the tabs would close, which
// is quite disruptive (crbug.com/511670).
chrome.runtime.onUpdateAvailable.addListener(function () {
  chrome.tabs.query({ url: chrome.runtime.getURL("*") }, tabs => {
    if (tabs?.length) {
      return;
    }
    chrome.runtime.reload();
  });
});
