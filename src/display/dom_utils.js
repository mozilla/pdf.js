/* Copyright 2015 Mozilla Foundation
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

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs/display/dom_utils', ['exports', 'pdfjs/shared/util',
      'pdfjs/display/global'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('../shared/util.js'), require('./global.js'));
  } else {
    factory((root.pdfjsDisplayDOMUtils = {}), root.pdfjsSharedUtil,
      root.pdfjsDisplayGlobal);
  }
}(this, function (exports, sharedUtil, displayGlobal) {

var deprecated = sharedUtil.deprecated;
var removeNullCharacters = sharedUtil.removeNullCharacters;
var shadow = sharedUtil.shadow;
var warn = sharedUtil.warn;
var PDFJS = displayGlobal.PDFJS;

/**
 * Optimised CSS custom property getter/setter.
 * @class
 */
var CustomStyle = (function CustomStyleClosure() {

  // As noted on: http://www.zachstronaut.com/posts/2009/02/17/
  //              animate-css-transforms-firefox-webkit.html
  // in some versions of IE9 it is critical that ms appear in this list
  // before Moz
  var prefixes = ['ms', 'Moz', 'Webkit', 'O'];
  var _cache = Object.create(null);

  function CustomStyle() {}

  CustomStyle.getProp = function get(propName, element) {
    // check cache only when no element is given
    if (arguments.length === 1 && typeof _cache[propName] === 'string') {
      return _cache[propName];
    }

    element = element || document.documentElement;
    var style = element.style, prefixed, uPropName;

    // test standard property first
    if (typeof style[propName] === 'string') {
      return (_cache[propName] = propName);
    }

    // capitalize
    uPropName = propName.charAt(0).toUpperCase() + propName.slice(1);

    // test vendor specific properties
    for (var i = 0, l = prefixes.length; i < l; i++) {
      prefixed = prefixes[i] + uPropName;
      if (typeof style[prefixed] === 'string') {
        return (_cache[propName] = prefixed);
      }
    }

    //if all fails then set to undefined
    return (_cache[propName] = 'undefined');
  };

  CustomStyle.setProp = function set(propName, element, str) {
    var prop = this.getProp(propName);
    if (prop !== 'undefined') {
      element.style[prop] = str;
    }
  };

  return CustomStyle;
})();

PDFJS.CustomStyle = CustomStyle;

//#if !(FIREFOX || MOZCENTRAL || CHROME)
//// Lazy test if the userAgent support CanvasTypedArrays
function hasCanvasTypedArrays() {
  var canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  var ctx = canvas.getContext('2d');
  var imageData = ctx.createImageData(1, 1);
  return (typeof imageData.data.buffer !== 'undefined');
}

Object.defineProperty(PDFJS, 'hasCanvasTypedArrays', {
  configurable: true,
  get: function PDFJS_hasCanvasTypedArrays() {
    return shadow(PDFJS, 'hasCanvasTypedArrays', hasCanvasTypedArrays());
  }
});
//#else
//PDFJS.hasCanvasTypedArrays = true;
//#endif

var LinkTarget = {
  NONE: 0, // Default value.
  SELF: 1,
  BLANK: 2,
  PARENT: 3,
  TOP: 4,
};

PDFJS.LinkTarget = LinkTarget;

var LinkTargetStringMap = [
  '',
  '_self',
  '_blank',
  '_parent',
  '_top'
];

function isExternalLinkTargetSet() {
//#if !MOZCENTRAL
  if (PDFJS.openExternalLinksInNewWindow) {
    deprecated('PDFJS.openExternalLinksInNewWindow, please use ' +
      '"PDFJS.externalLinkTarget = PDFJS.LinkTarget.BLANK" instead.');
    if (PDFJS.externalLinkTarget === LinkTarget.NONE) {
      PDFJS.externalLinkTarget = LinkTarget.BLANK;
    }
    // Reset the deprecated parameter, to suppress further warnings.
    PDFJS.openExternalLinksInNewWindow = false;
  }
//#endif
  switch (PDFJS.externalLinkTarget) {
    case LinkTarget.NONE:
      return false;
    case LinkTarget.SELF:
    case LinkTarget.BLANK:
    case LinkTarget.PARENT:
    case LinkTarget.TOP:
      return true;
  }
  warn('PDFJS.externalLinkTarget is invalid: ' + PDFJS.externalLinkTarget);
  // Reset the external link target, to suppress further warnings.
  PDFJS.externalLinkTarget = LinkTarget.NONE;
  return false;
}
PDFJS.isExternalLinkTargetSet = isExternalLinkTargetSet;

/**
 * Adds various attributes (href, title, target, rel) to hyperlinks.
 * @param {HTMLLinkElement} link - The link element.
 * @param {Object} params - An object with the properties:
 * @param {string} params.url - An absolute URL.
 */
function addLinkAttributes(link, params) {
  var url = params && params.url;
  link.href = link.title = (url ? removeNullCharacters(url) : '');

  if (url) {
    if (isExternalLinkTargetSet()) {
      link.target = LinkTargetStringMap[PDFJS.externalLinkTarget];
    }
    // Strip referrer from the URL.
    link.rel = PDFJS.externalLinkRel;
  }
}
PDFJS.addLinkAttributes = addLinkAttributes;

// Gets the file name from a given URL.
function getFilenameFromUrl(url) {
  var anchor = url.indexOf('#');
  var query = url.indexOf('?');
  var end = Math.min(
    anchor > 0 ? anchor : url.length,
    query > 0 ? query : url.length);
  return url.substring(url.lastIndexOf('/', end) + 1, end);
}
PDFJS.getFilenameFromUrl = getFilenameFromUrl;

exports.CustomStyle = CustomStyle;
exports.addLinkAttributes = addLinkAttributes;
exports.isExternalLinkTargetSet = isExternalLinkTargetSet;
exports.getFilenameFromUrl = getFilenameFromUrl;
exports.LinkTarget = LinkTarget;
}));
