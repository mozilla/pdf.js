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
  assert, CMapCompressionType, removeNullCharacters, stringToBytes,
  unreachable, warn
} from '../shared/util';
import globalScope from '../shared/global_scope';

const DEFAULT_LINK_REL = 'noopener noreferrer nofollow';
const SVG_NS = 'http://www.w3.org/2000/svg';

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
    if (!this.baseUrl) {
      return Promise.reject(new Error('CMap baseUrl must be specified, ' +
        'see "PDFJS.cMapUrl" (and also "PDFJS.cMapPacked").'));
    }
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

class DOMSVGFactory {
  create(width, height) {
    assert(width > 0 && height > 0, 'Invalid SVG dimensions');

    let svg = document.createElementNS(SVG_NS, 'svg:svg');
    svg.setAttribute('version', '1.1');
    svg.setAttribute('width', width + 'px');
    svg.setAttribute('height', height + 'px');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

    return svg;
  }

  createElement(type) {
    assert(typeof type === 'string', 'Invalid SVG element type');

    return document.createElementNS(SVG_NS, type);
  }
}

class SimpleDOMNode {
  constructor(nodeName, nodeValue) {
    this.nodeName = nodeName;
    this.nodeValue = nodeValue;

    Object.defineProperty(this, 'parentNode', { value: null, writable: true, });
  }

  get firstChild() {
    return this.childNodes[0];
  }

  get nextSibling() {
    let index = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[index + 1];
  }

  get textContent() {
    if (!this.childNodes) {
      return this.nodeValue || '';
    }
    return this.childNodes.map(function(child) {
      return child.textContent;
    }).join('');
  }

  hasChildNodes() {
    return this.childNodes && this.childNodes.length > 0;
  }
}

class SimpleXMLParser {
  parseFromString(data) {
    let nodes = [];

    // Remove all comments and processing instructions.
    data = data.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g, '').trim();
    data = data.replace(/<!DOCTYPE[^>\[]+(\[[^\]]+)?[^>]+>/g, '').trim();

    // Extract all text nodes and replace them with a numeric index in
    // the nodes.
    data = data.replace(/>([^<][\s\S]*?)</g, (all, text) => {
      let length = nodes.length;
      let node = new SimpleDOMNode('#text', this._decodeXML(text));
      nodes.push(node);
      if (node.textContent.trim().length === 0) {
        return '><'; // Ignore whitespace.
      }
      return '>' + length + ',<';
    });

    // Extract all CDATA nodes.
    data = data.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,
        function(all, text) {
      let length = nodes.length;
      let node = new SimpleDOMNode('#text', text);
      nodes.push(node);
      return length + ',';
    });

    // Until nodes without '<' and '>' content are present, replace them
    // with a numeric index in the nodes.
    let regex =
      /<([\w\:]+)((?:[\s\w:=]|'[^']*'|"[^"]*")*)(?:\/>|>([\d,]*)<\/[^>]+>)/g;
    let lastLength;
    do {
      lastLength = nodes.length;
      data = data.replace(regex, function(all, name, attrs, data) {
        let length = nodes.length;
        let node = new SimpleDOMNode(name);
        let children = [];
        if (data) {
          data = data.split(',');
          data.pop();
          data.forEach(function(child) {
            let childNode = nodes[+child];
            childNode.parentNode = node;
            children.push(childNode);
          });
        }

        node.childNodes = children;
        nodes.push(node);
        return length + ',';
      });
    } while (lastLength < nodes.length);

    // We should only have one root index left, which will be last in the nodes.
    return {
      documentElement: nodes.pop(),
    };
  }

  _decodeXML(text) {
    if (text.indexOf('&') < 0) {
      return text;
    }

    return text.replace(/&(#(x[0-9a-f]+|\d+)|\w+);/gi,
        function(all, entityName, number) {
      if (number) {
        if (number[0] === 'x') {
          number = parseInt(number.substring(1), 16);
        } else {
          number = +number;
        }
        return String.fromCharCode(number);
      }

      switch (entityName) {
        case 'amp':
          return '&';
        case 'lt':
          return '<';
        case 'gt':
          return '>';
        case 'quot':
          return '\"';
        case 'apos':
          return '\'';
      }
      return '&' + entityName + ';';
    });
  }
}

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

class StatTimer {
  constructor(enable = true) {
    this.enabled = !!enable;
    this.started = Object.create(null);
    this.times = [];
  }

  time(name) {
    if (!this.enabled) {
      return;
    }
    if (name in this.started) {
      warn('Timer is already running for ' + name);
    }
    this.started[name] = Date.now();
  }

  timeEnd(name) {
    if (!this.enabled) {
      return;
    }
    if (!(name in this.started)) {
      warn('Timer has not been started for ' + name);
    }
    this.times.push({
      'name': name,
      'start': this.started[name],
      'end': Date.now(),
    });
    // Remove timer from started so it can be called again.
    delete this.started[name];
  }

  toString() {
    let times = this.times;
    // Find the longest name for padding purposes.
    let out = '', longest = 0;
    for (let i = 0, ii = times.length; i < ii; ++i) {
      let name = times[i]['name'];
      if (name.length > longest) {
        longest = name.length;
      }
    }
    for (let i = 0, ii = times.length; i < ii; ++i) {
      let span = times[i];
      let duration = span.end - span.start;
      out += `${span['name'].padEnd(longest)} ${duration}ms\n`;
    }
    return out;
  }
}

/**
 * Helps avoid having to initialize {StatTimer} instances, e.g. one for every
 * page, in cases where the collected stats are not actually being used.
 * This (dummy) class can thus, since all its methods are `static`, be directly
 * shared between multiple call-sites without the need to be initialized first.
 *
 * NOTE: This must implement the same interface as {StatTimer}.
 */
class DummyStatTimer {
  constructor() {
    unreachable('Cannot initialize DummyStatTimer.');
  }

  static time(name) {}

  static timeEnd(name) {}

  static toString() {
    return '';
  }
}

export {
  RenderingCancelledException,
  addLinkAttributes,
  isExternalLinkTargetSet,
  getFilenameFromUrl,
  LinkTarget,
  getDefaultSetting,
  DEFAULT_LINK_REL,
  DOMCanvasFactory,
  DOMCMapReaderFactory,
  DOMSVGFactory,
  SimpleXMLParser,
  StatTimer,
  DummyStatTimer,
};
