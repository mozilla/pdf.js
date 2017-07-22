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

import {
  CMapCompressionType, createValidAbsoluteUrl, deprecated, globalScope,
  removeNullCharacters, stringToBytes, warn
} from '../shared/util';

var DEFAULT_LINK_REL = 'noopener noreferrer nofollow';

class DOMCanvasFactory {
  create(width, height) {
    if (width <= 0 || height <= 0) {
      throw new Error('invalid canvas size');
    }
    let canvas = document.createElement('canvas');
    let context = canvas.getContext('2d');
    canvas.width = width;
    canvas.height = height;
    return {
      canvas,
      context,
    };
  }

  reset(canvasAndContext, width, height) {
    if (!canvasAndContext.canvas) {
      throw new Error('canvas is not specified');
    }
    if (width <= 0 || height <= 0) {
      throw new Error('invalid canvas size');
    }
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext) {
    if (!canvasAndContext.canvas) {
      throw new Error('canvas is not specified');
    }
    // Zeroing the width and height cause Firefox to release graphics
    // resources immediately, which can greatly reduce memory consumption.
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

class DOMCMapReaderFactory {
  constructor({ baseUrl = null, isCompressed = false, }) {
    this.baseUrl = baseUrl;
    this.isCompressed = isCompressed;
  }

  fetch({ name, }) {
    if (!name) {
      return Promise.reject(new Error('CMap name must be specified.'));
    }
    return new Promise((resolve, reject) => {
      let url = this.baseUrl + name + (this.isCompressed ? '.bcmap' : '');

      let request = new XMLHttpRequest();
      request.open('GET', url, true);

      if (this.isCompressed) {
        request.responseType = 'arraybuffer';
      }
      request.onreadystatechange = () => {
        if (request.readyState !== XMLHttpRequest.DONE) {
          return;
        }
        if (request.status === 200 || request.status === 0) {
          let data;
          if (this.isCompressed && request.response) {
            data = new Uint8Array(request.response);
          } else if (!this.isCompressed && request.responseText) {
            data = stringToBytes(request.responseText);
          }
          if (data) {
            resolve({
              cMapData: data,
              compressionType: this.isCompressed ?
                CMapCompressionType.BINARY : CMapCompressionType.NONE,
            });
            return;
          }
        }
        reject(new Error('Unable to load ' +
                         (this.isCompressed ? 'binary ' : '') +
                         'CMap at: ' + url));
      };

      request.send(null);
    });
  }
}

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

    // If all fails then set to undefined.
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

var RenderingCancelledException = (function RenderingCancelledException() {
  function RenderingCancelledException(msg, type) {
    this.message = msg;
    this.type = type;
  }

  RenderingCancelledException.prototype = new Error();
  RenderingCancelledException.prototype.name = 'RenderingCancelledException';
  RenderingCancelledException.constructor = RenderingCancelledException;

  return RenderingCancelledException;
})();

var LinkTarget = {
  NONE: 0, // Default value.
  SELF: 1,
  BLANK: 2,
  PARENT: 3,
  TOP: 4,
};

var LinkTargetStringMap = [
  '',
  '_self',
  '_blank',
  '_parent',
  '_top'
];

/**
 * @typedef ExternalLinkParameters
 * @typedef {Object} ExternalLinkParameters
 * @property {string} url - An absolute URL.
 * @property {LinkTarget} target - The link target.
 * @property {string} rel - The link relationship.
 */

/**
 * Adds various attributes (href, title, target, rel) to hyperlinks.
 * @param {HTMLLinkElement} link - The link element.
 * @param {ExternalLinkParameters} params
 */
function addLinkAttributes(link, params) {
  var url = params && params.url;
  link.href = link.title = (url ? removeNullCharacters(url) : '');

  if (url) {
    var target = params.target;
    if (typeof target === 'undefined') {
      target = getDefaultSetting('externalLinkTarget');
    }
    link.target = LinkTargetStringMap[target];

    var rel = params.rel;
    if (typeof rel === 'undefined') {
      rel = getDefaultSetting('externalLinkRel');
    }
    link.rel = rel;
  }
}

// Gets the file name from a given URL.
function getFilenameFromUrl(url) {
  var anchor = url.indexOf('#');
  var query = url.indexOf('?');
  var end = Math.min(
    anchor > 0 ? anchor : url.length,
    query > 0 ? query : url.length);
  return url.substring(url.lastIndexOf('/', end) + 1, end);
}

function getDefaultSetting(id) {
  // The list of the settings and their default is maintained for backward
  // compatibility and shall not be extended or modified. See also global.js.
  var globalSettings = globalScope.PDFJS;
  switch (id) {
    case 'pdfBug':
      return globalSettings ? globalSettings.pdfBug : false;
    case 'disableAutoFetch':
      return globalSettings ? globalSettings.disableAutoFetch : false;
    case 'disableStream':
      return globalSettings ? globalSettings.disableStream : false;
    case 'disableRange':
      return globalSettings ? globalSettings.disableRange : false;
    case 'disableFontFace':
      return globalSettings ? globalSettings.disableFontFace : false;
    case 'disableCreateObjectURL':
      return globalSettings ? globalSettings.disableCreateObjectURL : false;
    case 'disableWebGL':
      return globalSettings ? globalSettings.disableWebGL : true;
    case 'cMapUrl':
      return globalSettings ? globalSettings.cMapUrl : null;
    case 'cMapPacked':
      return globalSettings ? globalSettings.cMapPacked : false;
    case 'postMessageTransfers':
      return globalSettings ? globalSettings.postMessageTransfers : true;
    case 'workerPort':
      return globalSettings ? globalSettings.workerPort : null;
    case 'workerSrc':
      return globalSettings ? globalSettings.workerSrc : null;
    case 'disableWorker':
      return globalSettings ? globalSettings.disableWorker : false;
    case 'maxImageSize':
      return globalSettings ? globalSettings.maxImageSize : -1;
    case 'imageResourcesPath':
      return globalSettings ? globalSettings.imageResourcesPath : '';
    case 'isEvalSupported':
      return globalSettings ? globalSettings.isEvalSupported : true;
    case 'externalLinkTarget':
      if (!globalSettings) {
        return LinkTarget.NONE;
      }
      switch (globalSettings.externalLinkTarget) {
        case LinkTarget.NONE:
        case LinkTarget.SELF:
        case LinkTarget.BLANK:
        case LinkTarget.PARENT:
        case LinkTarget.TOP:
          return globalSettings.externalLinkTarget;
      }
      warn('PDFJS.externalLinkTarget is invalid: ' +
           globalSettings.externalLinkTarget);
      // Reset the external link target, to suppress further warnings.
      globalSettings.externalLinkTarget = LinkTarget.NONE;
      return LinkTarget.NONE;
    case 'externalLinkRel':
      return globalSettings ? globalSettings.externalLinkRel : DEFAULT_LINK_REL;
    case 'enableStats':
      return !!(globalSettings && globalSettings.enableStats);
    case 'pdfjsNext':
      return !!(globalSettings && globalSettings.pdfjsNext);
    default:
      throw new Error('Unknown default setting: ' + id);
  }
}

function isExternalLinkTargetSet() {
  var externalLinkTarget = getDefaultSetting('externalLinkTarget');
  switch (externalLinkTarget) {
    case LinkTarget.NONE:
      return false;
    case LinkTarget.SELF:
    case LinkTarget.BLANK:
    case LinkTarget.PARENT:
    case LinkTarget.TOP:
      return true;
  }
}

function isValidUrl(url, allowRelative) {
  deprecated('isValidUrl(), please use createValidAbsoluteUrl() instead.');
  var baseUrl = allowRelative ? 'http://example.com' : null;
  return createValidAbsoluteUrl(url, baseUrl) !== null;
}

export {
  CustomStyle,
  RenderingCancelledException,
  addLinkAttributes,
  isExternalLinkTargetSet,
  isValidUrl,
  getFilenameFromUrl,
  LinkTarget,
  getDefaultSetting,
  DEFAULT_LINK_REL,
  DOMCanvasFactory,
  DOMCMapReaderFactory,
};
