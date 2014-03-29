/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
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
/* globals chrome */

'use strict';

var Features = {
  featureDetectLastUA: '',
  // Whether ftp: in XMLHttpRequest is allowed
  extensionSupportsFTP: false,
};

chrome.storage.local.get(Features, function(features) {
  Features = features;
  if (features.featureDetectLastUA === navigator.userAgent) {
    // Browser not upgraded, so the features did probably not change.
    return;
  }

  if (!features.extensionSupportsFTP) {
    features.extensionSupportsFTP = featureTestFTP();
  }

  Features.featureDetectLastUA = navigator.userAgent;
  chrome.storage.local.set(Features);
});

// Tests whether the extension can perform a FTP request.
// Feature is supported since Chromium 35.0.1888.0 (r256810).
function featureTestFTP() {
  var x = new XMLHttpRequest();
  // The URL does not need to exist, as long as the scheme is ftp:.
  x.open('GET', 'ftp://ftp.mozilla.org/');
  try {
    x.send();
    // Previous call did not throw error, so the feature is supported!
    // Immediately abort the request so that the network is not hit at all.
    x.abort();
    return true;
  } catch (e) {
    return false;
  }
}
