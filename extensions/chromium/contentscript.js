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

var VIEWER_URL = chrome.extension.getURL('content/web/viewer.html');

function getViewerURL(pdf_url) {
  return VIEWER_URL + '?file=' + encodeURIComponent(pdf_url);
}

document.addEventListener('beforeload', function(event) {
  var elem = event.target;
  if (elem.nodeName.toUpperCase() !== 'EMBED') {
    return;
  }
  if (!/^application\/pdf$/i.test(elem.type)) {
    return;
  }
  event.preventDefault();
  elem.type = 'text/html';
  elem.src = getViewerURL(elem.src);
}, true);
