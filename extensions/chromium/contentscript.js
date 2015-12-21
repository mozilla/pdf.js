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
/* globals chrome, CSS */

'use strict';

var VIEWER_URL = chrome.extension.getURL('content/web/viewer.html');

function getViewerURL(pdf_url) {
  return VIEWER_URL + '?file=' + encodeURIComponent(pdf_url);
}

// (un)prefixed property names
var createShadowRoot, shadowRoot;
if (typeof Element.prototype.createShadowRoot !== 'undefined') {
  // Chrome 35+
  createShadowRoot = 'createShadowRoot';
  shadowRoot = 'shadowRoot';
} else if (typeof Element.prototype.webkitCreateShadowRoot !== 'undefined') {
  // Chrome 25 - 34
  createShadowRoot = 'webkitCreateShadowRoot';
  shadowRoot = 'webkitShadowRoot';
  try {
    document.createElement('embed').webkitCreateShadowRoot();
  } catch (e) {
    // Only supported since Chrome 33.
    createShadowRoot = shadowRoot = '';
  }
}

// Only observe the document if we can make use of Shadow DOM.
if (createShadowRoot) {
  if (CSS.supports('animation', '0s')) {
    document.addEventListener('animationstart', onAnimationStart, true);
  } else {
    document.addEventListener('webkitAnimationStart', onAnimationStart, true);
  }
}

function onAnimationStart(event) {
  if (event.animationName === 'pdfjs-detected-object-or-embed') {
    watchObjectOrEmbed(event.target);
  }
}

// Called for every <object> or <embed> element in the page.
// It does not trigger any Mutation observers, but it may modify the
// shadow DOM rooted under the given element.
// Calling this function multiple times for the same element is safe, i.e.
// it has no side effects.
function watchObjectOrEmbed(elem) {
  var mimeType = elem.type;
  if (mimeType && 'application/pdf' !== mimeType.toLowerCase()) {
    return;
  }
  // <embed src> <object data>
  var srcAttribute = 'src' in elem ? 'src' : 'data';
  var path = elem[srcAttribute];
  if (!mimeType && !/\.pdf($|[?#])/i.test(path)) {
    return;
  }

  if (elem.tagName === 'EMBED' && elem.name === 'plugin' &&
      elem.parentNode === document.body &&
      elem.parentNode.childElementCount === 1 && elem.src === location.href) {
    // This page is most likely Chrome's default page that embeds a PDF file.
    // The fact that the extension's background page did not intercept and
    // redirect this PDF request means that this PDF cannot be opened by PDF.js,
    // e.g. because it is a response to a POST request (as in #6174).
    // A reduced test case to test PDF response to POST requests is available at
    // https://robwu.nl/pdfjs/issue6174/.
    // Until #4483 is fixed, POST requests should be ignored.
    return;
  }

  if (elem[shadowRoot]) {
    // If the element already has a shadow root, assume that we've already
    // seen this element.
    return;
  }
  elem[createShadowRoot]();

  function updateViewerFrame() {
    var path = elem[srcAttribute];
    if (!path) {
      elem[shadowRoot].textContent = '';
    } else {
      elem[shadowRoot].innerHTML =
        // Set display: inline-block; to the host element (<embed>/<object>) to
        // ensure that the dimensions defined on the host element are applied to
        // the iframe (http://crbug.com/358648).
        // The styles are declared in the shadow DOM to allow page authors to
        // override these styles (e.g. .style.display = 'none';).
        '<style>\n' +
        // Chrome 35+
        ':host { display: inline-block; }\n' +
        // Chrome 33 and 34 (not 35+ because of http://crbug.com/351248)
        '*:not(style):not(iframe) { display: inline-block; }\n' +
        'iframe { width: 100%; height: 100%; border: 0; }\n' +
        '</style>' +
        '<iframe allowfullscreen></iframe>';
      elem[shadowRoot].lastChild.src = getEmbeddedViewerURL(path);
    }
  }

  updateViewerFrame();

  // Watch for page-initiated changes of the src/data attribute.
  var srcObserver = new MutationObserver(updateViewerFrame);
  srcObserver.observe(elem, {
    attributes: true,
    childList: false,
    characterData: false,
    attributeFilter: [srcAttribute]
  });
}

// Get the viewer URL, provided that the path is a valid URL.
function getEmbeddedViewerURL(path) {
  var fragment = /^([^#]*)(#.*)?$/.exec(path);
  path = fragment[1];
  fragment = fragment[2] || '';

  // Resolve relative path to document.
  var a = document.createElement('a');
  a.href = document.baseURI;
  a.href = path;
  path = a.href;
  return getViewerURL(path) + fragment;
}
