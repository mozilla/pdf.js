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

function isPdfDownloadable(details) {
  return details.url.indexOf('pdfjs.action=download') >= 0;
}

chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (isPdfDownloadable(details))
      return;

    var viewerPage = 'content/web/viewer.html';
    var url = chrome.extension.getURL(viewerPage) +
      '?file=' + encodeURIComponent(details.url);
    return { redirectUrl: url };
  },
  {
    urls: [
      'http://*/*.pdf',
      'https://*/*.pdf',
      'file://*/*.pdf',
      'http://*/*.PDF',
      'https://*/*.PDF',
      'file://*/*.PDF'
    ],
    types: ['main_frame']
  },
  ['blocking']);
