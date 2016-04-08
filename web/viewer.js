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
/*globals require, chrome */

'use strict';

var DEFAULT_URL = 'compressed.tracemonkey-pldi-09.pdf';

var pdfjsWebLibs = {};
(function () {
//#expand __BUNDLE__
}).call(pdfjsWebLibs);

//#if FIREFOX || MOZCENTRAL
//// FIXME the l10n.js file in the Firefox extension needs global FirefoxCom.
//window.FirefoxCom = pdfjsWebLibs.pdfjsWebFirefoxCom.FirefoxCom;
//#endif

//#if CHROME
//(function rewriteUrlClosure() {
//  // Run this code outside DOMContentLoaded to make sure that the URL
//  // is rewritten as soon as possible.
//  var queryString = document.location.search.slice(1);
//  var m = /(^|&)file=([^&]*)/.exec(queryString);
//  DEFAULT_URL = m ? decodeURIComponent(m[2]) : '';
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
  require.config({paths: {'pdfjs': '../src', 'pdfjs-web': '.'}});
  require(['pdfjs/main_loader', 'pdfjs-web/app'], function (loader, web) {
    window.pdfjsLib = loader;
    window.PDFViewerApplication = web.PDFViewerApplication;
    web.PDFViewerApplication.run();
  });
//#else
//window.pdfjsLib = window.pdfjsDistBuildPdf;
//window.PDFViewerApplication = pdfjsWebLibs.pdfjsWebApp.PDFViewerApplication;
//pdfjsWebLibs.pdfjsWebApp.PDFViewerApplication.run();
//#endif
}

document.addEventListener('DOMContentLoaded', webViewerLoad, true);
