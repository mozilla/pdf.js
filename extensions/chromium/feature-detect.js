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

'use strict';

var Features = {
  featureDetectLastUA: '',
  // Whether ftp: in XMLHttpRequest is allowed
  extensionSupportsFTP: false,
  // Whether redirectUrl at onHeadersReceived is supported.
  webRequestRedirectUrl: false,
};

chrome.storage.local.get(Features, function(features) {
  Features = features;
  if (features.featureDetectLastUA === navigator.userAgent) {
    // Browser not upgraded, so the features did probably not change.
    return;
  }

  // In case of a downgrade, the features must be tested again.
  var lastVersion = /Chrome\/\d+\.0\.(\d+)/.exec(features.featureDetectLastUA);
  lastVersion = lastVersion ? parseInt(lastVersion[1], 10) : 0;
  var newVersion = /Chrome\/\d+\.0\.(\d+)/.exec(navigator.userAgent);
  var isDowngrade = newVersion && parseInt(newVersion[1], 10) < lastVersion;

  var inconclusiveTestCount = 0;

  if (isDowngrade || !features.extensionSupportsFTP) {
    features.extensionSupportsFTP = featureTestFTP();
  }

  if (isDowngrade || !features.webRequestRedirectUrl) {
    ++inconclusiveTestCount;
    // Relatively expensive (and asynchronous) test:
    featureTestRedirectOnHeadersReceived(function(result) {
      // result = 'yes', 'no' or 'maybe'.
      if (result !== 'maybe') {
        --inconclusiveTestCount;
      }
      features.webRequestRedirectUrl = result === 'yes';
      checkTestCompletion();
    });
  }

  checkTestCompletion();

  function checkTestCompletion() {
    // Only stamp the feature detection results when all tests have finished.
    if (inconclusiveTestCount === 0) {
      Features.featureDetectLastUA = navigator.userAgent;
    }
    chrome.storage.local.set(Features);
  }
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

// Tests whether redirectUrl at the onHeadersReceived stage is functional.
// Feature is supported since Chromium 35.0.1911.0 (r259546).
function featureTestRedirectOnHeadersReceived(callback) {
  // The following URL is really going to be accessed via the network.
  // It is the only way to feature-detect this feature, because the
  // onHeadersReceived event is only triggered for http(s) requests.
  var url = 'http://example.com/?feature-detect-' + chrome.runtime.id;
  function onHeadersReceived(details) {
    // If supported, the request is redirected.
    // If not supported, the return value is ignored.
    return {
      redirectUrl: chrome.runtime.getURL('/manifest.json'),
    };
  }
  chrome.webRequest.onHeadersReceived.addListener(onHeadersReceived, {
    types: ['xmlhttprequest'],
    urls: [url],
  }, ['blocking']);

  var x = new XMLHttpRequest();
  x.open('get', url);
  x.onloadend = function() {
    chrome.webRequest.onHeadersReceived.removeListener(onHeadersReceived);
    if (!x.responseText) {
      // Network error? Anyway, can't tell with certainty whether the feature
      // is supported.
      callback('maybe');
    } else if (/^\s*\{/.test(x.responseText)) {
      // If the response starts with "{", assume that the redirection to the
      // manifest file succeeded, so the feature is supported.
      callback('yes');
    } else {
      // Did not get the content of manifest.json, so the redirect seems not to
      // be followed. The feature is not supported.
      callback('no');
    }
  };
  x.send();
}
