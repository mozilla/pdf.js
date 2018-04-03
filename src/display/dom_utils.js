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
      return Promise.reject(new Error(
        'The CMap "baseUrl" parameter must be specified, ensure that ' +
        'the "cMapUrl" and "cMapPacked" API parameters are provided.'));
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

const LinkTarget = {
  NONE: 0, // Default value.
  SELF: 1,
  BLANK: 2,
  PARENT: 3,
  TOP: 4,
};

const LinkTargetStringMap = [
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
 * @property {LinkTarget} target - (optional) The link target.
 *   The default value is `LinkTarget.NONE`.
 * @property {string} rel - (optional) The link relationship.
 *   The default value is `DEFAULT_LINK_REL`.
 */

/**
 * Adds various attributes (href, title, target, rel) to hyperlinks.
 * @param {HTMLLinkElement} link - The link element.
 * @param {ExternalLinkParameters} params
 */
function addLinkAttributes(link, { url, target, rel, } = {}) {
  link.href = link.title = (url ? removeNullCharacters(url) : '');

  if (url) {
    const LinkTargetValues = Object.values(LinkTarget);
    let targetIndex =
      LinkTargetValues.includes(target) ? target : LinkTarget.NONE;
    link.target = LinkTargetStringMap[targetIndex];

    link.rel = (typeof rel === 'string' ? rel : DEFAULT_LINK_REL);
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
  getFilenameFromUrl,
  LinkTarget,
  DEFAULT_LINK_REL,
  DOMCanvasFactory,
  DOMCMapReaderFactory,
  DOMSVGFactory,
  StatTimer,
  DummyStatTimer,
};
