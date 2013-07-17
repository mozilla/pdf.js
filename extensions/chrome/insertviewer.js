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
/* globals chrome */

'use strict';

var VIEWER_URL = chrome.extension.getURL('content/web/viewer.html');
var BASE_URL = VIEWER_URL.replace(/[^\/]+$/, '');

function getViewerURL(pdf_url) {
  return VIEWER_URL + '?file=' + encodeURIComponent(pdf_url);
}

function showViewer(url) {
  if (document.documentElement === null) {
    // If the root element hasn't been rendered yet, delay the next operation.
    // Otherwise, document.readyState will get stuck in "interactive".
    setTimeout(showViewer, 0, url);
    return;
  }
  // Cancel page load and empty document.
  window.stop();
  document.body.textContent = '';

  replaceDocumentWithViewer(url);
}
function makeLinksAbsolute(doc) {
  normalize('href', 'link[href]');
  normalize('src', 'style[src],script[src]');

  function normalize(attribute, selector) {
    var nodes = doc.querySelectorAll(selector);
    for (var i=0; i<nodes.length; ++i) {
      var node = nodes[i];
      var newAttribute = makeAbsolute(node.getAttribute(attribute));
      node.setAttribute(attribute, newAttribute);
    }
  }
  function makeAbsolute(url) {
    if (url.indexOf('://') !== -1) return url;
    return BASE_URL + url;
  }
}
function replaceDocumentWithViewer(url) {
  var x = new XMLHttpRequest();
  x.open('GET', VIEWER_URL);
  x.responseType = 'document';
  x.onload = function() {
    // Resolve all relative URLs
    makeLinksAbsolute(x.response);

    // Remove all <script> elements (added back later).
    // I assumed that no inline script tags exist.
    var scripts = [], script;

    // new Worker('chrome-extension://..../pdf.js') fails, despite having
    // the correct permissions. Fix it:
    script = document.createElement('script');
    script.onload = loadNextScript;
    script.src = chrome.extension.getURL('patch-worker.js');
    scripts.push(script);

    while (x.response.scripts.length) {
      script = x.response.scripts[0];
      var newScript = document.createElement('script');
      newScript.onload = loadNextScript;
      newScript.src = script.src;
      script.parentNode.removeChild(script);
      scripts.push(newScript);
    }

    // Replace document with viewer
    var docEl = document.adoptNode(x.response.documentElement);
    document.replaceChild(docEl, document.documentElement);
    // Force Chrome to render content
    // (without this line, the layout is broken and querySelector
    //  fails to find elements, even when they appear in the doc)
    document.body.innerHTML += '';

    // Load all scripts
    loadNextScript();

    function loadNextScript() {
      if (scripts.length > 0)
        document.head.appendChild(scripts.shift());
      else
        renderPDF(url);
    }
  };
  x.send();
}
function renderPDF(url) {
  var args = {
    BASE_URL: BASE_URL,
    pdf_url: url
  };
  // The following technique is explained at
  // http://stackoverflow.com/a/9517879/938089
  var script = document.createElement('script');
  script.textContent =
  '(function(args) {' +
  '  PDFJS.imageResourcesPath = args.BASE_URL + PDFJS.imageResourcesPath;' +
  '  PDFJS.workerSrc = args.BASE_URL + PDFJS.workerSrc;' +
  '  window.DEFAULT_URL = args.pdf_url;' +
  '})(' + JSON.stringify(args) + ');';
  document.head.appendChild(script);

  // Trigger domready
  if (document.readyState === 'complete') {
    var event = document.createEvent('Event');
    event.initEvent('DOMContentLoaded', true, true);
    document.dispatchEvent(event);
  }
}


// Activate the content script only once per frame (until reload)
if (!window.hasRun) {
  window.hasRun = true;
  chrome.extension.onMessage.addListener(function listener(message) {
    if (message && message.type === 'showPDFViewer' &&
        message.url === location.href) {
          chrome.extension.onMessage.removeListener(listener);
          showViewer(message.url);
        }
  });
}
