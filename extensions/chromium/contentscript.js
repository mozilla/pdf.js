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

if (CSS.supports('animation', '0s')) {
  document.addEventListener('animationstart', onAnimationStart, true);
} else {
  document.addEventListener('webkitAnimationStart', onAnimationStart, true);
}

function onAnimationStart(event) {
  if (event.animationName === 'pdfjs-detected-object-or-embed') {
    watchObjectOrEmbed(event.target);
  }
}

// Called for every <object> or <embed> element in the page.
// This may change the type, src/data attributes and/or the child nodes of the
// element. This function only affects elements for the first call. Subsequent
// invocations have no effect.
function watchObjectOrEmbed(elem) {
  var mimeType = elem.type;
  if (mimeType && mimeType.toLowerCase() !== 'application/pdf') {
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

  if (elem.__I_saw_this_element) {
    return;
  }
  elem.__I_saw_this_element = true;

  var tagName = elem.tagName.toUpperCase();
  var updateEmbedOrObject;
  if (tagName === 'EMBED') {
    updateEmbedOrObject = updateEmbedElement;
  } else if (tagName === 'OBJECT') {
    updateEmbedOrObject = updateObjectElement;
  } else {
    return;
  }

  var lastSrc;
  var isUpdating = false;

  function updateViewerFrame() {
    if (!isUpdating) {
      isUpdating = true;
      try {
        if (lastSrc !== elem[srcAttribute]) {
          updateEmbedOrObject(elem);
          lastSrc = elem[srcAttribute];
        }
      } finally {
        isUpdating = false;
      }
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

// Display the PDF Viewer in an <embed>.
function updateEmbedElement(elem) {
  if (elem.type === 'text/html' && elem.src.lastIndexOf(VIEWER_URL, 0) === 0) {
    // The viewer is already shown.
    return;
  }
  // The <embed> tag needs to be removed and re-inserted before any src changes
  // are effective.
  var parentNode = elem.parentNode;
  var nextSibling = elem.nextSibling;
  if (parentNode) {
    parentNode.removeChild(elem);
  }
  elem.type = 'text/html';
  elem.src = getEmbeddedViewerURL(elem.src);
  if (parentNode) {
    parentNode.insertBefore(elem, nextSibling);
  }
}

// Display the PDF Viewer in an <object>.
function updateObjectElement(elem) {
  // <object> elements are terrible. Experiments (in49.0.2623.75) show that the
  // following happens:
  // - When fallback content is shown (e.g. because the built-in PDF Viewer is
  //   disabled), updating the "data" attribute has no effect. Not surprising
  //   considering that HTMLObjectElement::m_useFallbackContent is not reset
  //   once it is set to true. Source:
  //   WebKit/Source/core/html/HTMLObjectElement.cpp#378 (rev 749fe30d676b6c14).
  // - When the built-in PDF Viewer plugin is enabled, updating the "data"
  //   attribute reloads the content (provided that the type was correctly set).
  // - When <object type=text/html data="chrome-extension://..."> is used
  //   (tested with a data-URL, data:text/html,<object...>, the extension's
  //   origin whitelist is not set up, so the viewer can't load the PDF file.
  // - The content of the <object> tag may be affected by <param> tags.
  //
  // To make sure that our solution works for all cases, we will insert a frame
  // as fallback content and force the <object> tag to render its fallback
  // content.
  var iframe = elem.firstElementChild;
  if (!iframe || !iframe.__inserted_by_pdfjs) {
    iframe = createFullSizeIframe();
    elem.textContent = '';
    elem.appendChild(iframe);
    iframe.__inserted_by_pdfjs = true;
  }
  iframe.src = getEmbeddedViewerURL(elem.data);

  // Some bogus content type that is not handled by any plugin.
  elem.type = 'application/not-a-pee-dee-eff-type';
  // Force the <object> to reload and render its fallback content.
  elem.data += '';

  // Usually the browser renders plugin content in this tag, which is completely
  // oblivious of styles such as padding, but we insert and render child nodes,
  // so force padding to be zero to avoid undesired dimension changes.
  elem.style.padding = '0';

  // <object> and <embed> elements have a "display:inline" style by default.
  // Despite this property, when a plugin is loaded in the tag, the tag is
  // treated like "display:inline-block". However, when the browser does not
  // render plugin content, the <object> tag does not behave like that, and as
  // a result the width and height is ignored.
  // Force "display:inline-block" to make sure that the width/height as set by
  // web pages is respected.
  // (<embed> behaves as expected with the default display value, but setting it
  // to display:inline-block doesn't hurt).
  elem.style.display = 'inline-block';
}

// Create an <iframe> element without borders that takes the full width and
// height.
function createFullSizeIframe() {
  var iframe = document.createElement('iframe');
  iframe.style.background = 'none';
  iframe.style.border = 'none';
  iframe.style.borderRadius = 'none';
  iframe.style.boxShadow = 'none';
  iframe.style.cssFloat = 'none';
  iframe.style.display = 'block';
  iframe.style.height = '100%';
  iframe.style.margin = '0';
  iframe.style.maxHeight = 'none';
  iframe.style.maxWidth = 'none';
  iframe.style.position = 'static';
  iframe.style.transform = 'none';
  iframe.style.visibility = 'visible';
  iframe.style.width = '100%';
  return iframe;
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
