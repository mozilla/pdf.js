/* Copyright 2016 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/*globals require, parseQueryString, chrome, PDFViewerApplication */

'use strict';

var DEFAULT_URL = 'compressed.tracemonkey-pldi-09.pdf';

//#include app.js

//#if CHROME
//(function rewriteUrlClosure() {
//  // Run this code outside DOMContentLoaded to make sure that the URL
//  // is rewritten as soon as possible.
//  var queryString = document.location.search.slice(1);
//  var params = parseQueryString(queryString);
//  DEFAULT_URL = params.file || '';
//
//  // Example: chrome-extension://.../http://example.com/file.pdf
//  var humanReadableUrl = '/' + DEFAULT_URL + location.hash;
//  history.replaceState(history.state, '', humanReadableUrl);
//  if (top === window) {
//    chrome.runtime.sendMessage('showPageAction');
//  }
//})();
//#endif

function webViewerLoad() {
//#if !PRODUCTION
  require.config({paths: {'pdfjs': '../src'}});
  require(['pdfjs/main_loader'], function (loader) {
    PDFViewerApplication.run();
  });
//#else
//PDFViewerApplication.run();
//#endif
}

document.addEventListener('DOMContentLoaded', webViewerLoad, true);
