/* Copyright 2017 Mozilla Foundation
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

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DOMSVGFactory = exports.DOMCMapReaderFactory = exports.DOMCanvasFactory = exports.DEFAULT_LINK_REL = exports.getDefaultSetting = exports.LinkTarget = exports.getFilenameFromUrl = exports.isValidUrl = exports.isExternalLinkTargetSet = exports.addLinkAttributes = exports.RenderingCancelledException = exports.CustomStyle = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _util = require('../shared/util');

var _global_scope = require('../shared/global_scope');

var _global_scope2 = _interopRequireDefault(_global_scope);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var DEFAULT_LINK_REL = 'noopener noreferrer nofollow';
var SVG_NS = 'http://www.w3.org/2000/svg';

var DOMCanvasFactory = function () {
  function DOMCanvasFactory() {
    _classCallCheck(this, DOMCanvasFactory);
  }

  _createClass(DOMCanvasFactory, [{
    key: 'create',
    value: function create(width, height) {
      if (width <= 0 || height <= 0) {
        throw new Error('invalid canvas size');
      }
      var canvas = document.createElement('canvas');
      var context = canvas.getContext('2d');
      canvas.width = width;
      canvas.height = height;
      return {
        canvas: canvas,
        context: context
      };
    }
  }, {
    key: 'reset',
    value: function reset(canvasAndContext, width, height) {
      if (!canvasAndContext.canvas) {
        throw new Error('canvas is not specified');
      }
      if (width <= 0 || height <= 0) {
        throw new Error('invalid canvas size');
      }
      canvasAndContext.canvas.width = width;
      canvasAndContext.canvas.height = height;
    }
  }, {
    key: 'destroy',
    value: function destroy(canvasAndContext) {
      if (!canvasAndContext.canvas) {
        throw new Error('canvas is not specified');
      }
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
      canvasAndContext.canvas = null;
      canvasAndContext.context = null;
    }
  }]);

  return DOMCanvasFactory;
}();

var DOMCMapReaderFactory = function () {
  function DOMCMapReaderFactory(_ref) {
    var _ref$baseUrl = _ref.baseUrl,
        baseUrl = _ref$baseUrl === undefined ? null : _ref$baseUrl,
        _ref$isCompressed = _ref.isCompressed,
        isCompressed = _ref$isCompressed === undefined ? false : _ref$isCompressed;

    _classCallCheck(this, DOMCMapReaderFactory);

    this.baseUrl = baseUrl;
    this.isCompressed = isCompressed;
  }

  _createClass(DOMCMapReaderFactory, [{
    key: 'fetch',
    value: function fetch(_ref2) {
      var _this = this;

      var name = _ref2.name;

      if (!name) {
        return Promise.reject(new Error('CMap name must be specified.'));
      }
      return new Promise(function (resolve, reject) {
        var url = _this.baseUrl + name + (_this.isCompressed ? '.bcmap' : '');
        var request = new XMLHttpRequest();
        request.open('GET', url, true);
        if (_this.isCompressed) {
          request.responseType = 'arraybuffer';
        }
        request.onreadystatechange = function () {
          if (request.readyState !== XMLHttpRequest.DONE) {
            return;
          }
          if (request.status === 200 || request.status === 0) {
            var data = void 0;
            if (_this.isCompressed && request.response) {
              data = new Uint8Array(request.response);
            } else if (!_this.isCompressed && request.responseText) {
              data = (0, _util.stringToBytes)(request.responseText);
            }
            if (data) {
              resolve({
                cMapData: data,
                compressionType: _this.isCompressed ? _util.CMapCompressionType.BINARY : _util.CMapCompressionType.NONE
              });
              return;
            }
          }
          reject(new Error('Unable to load ' + (_this.isCompressed ? 'binary ' : '') + 'CMap at: ' + url));
        };
        request.send(null);
      });
    }
  }]);

  return DOMCMapReaderFactory;
}();

var DOMSVGFactory = function () {
  function DOMSVGFactory() {
    _classCallCheck(this, DOMSVGFactory);
  }

  _createClass(DOMSVGFactory, [{
    key: 'create',
    value: function create(width, height) {
      (0, _util.assert)(width > 0 && height > 0, 'Invalid SVG dimensions');
      var svg = document.createElementNS(SVG_NS, 'svg:svg');
      svg.setAttribute('version', '1.1');
      svg.setAttribute('width', width + 'px');
      svg.setAttribute('height', height + 'px');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      return svg;
    }
  }, {
    key: 'createElement',
    value: function createElement(type) {
      (0, _util.assert)(typeof type === 'string', 'Invalid SVG element type');
      return document.createElementNS(SVG_NS, type);
    }
  }]);

  return DOMSVGFactory;
}();

var CustomStyle = function CustomStyleClosure() {
  var prefixes = ['ms', 'Moz', 'Webkit', 'O'];
  var _cache = Object.create(null);
  function CustomStyle() {}
  CustomStyle.getProp = function get(propName, element) {
    if (arguments.length === 1 && typeof _cache[propName] === 'string') {
      return _cache[propName];
    }
    element = element || document.documentElement;
    var style = element.style,
        prefixed,
        uPropName;
    if (typeof style[propName] === 'string') {
      return _cache[propName] = propName;
    }
    uPropName = propName.charAt(0).toUpperCase() + propName.slice(1);
    for (var i = 0, l = prefixes.length; i < l; i++) {
      prefixed = prefixes[i] + uPropName;
      if (typeof style[prefixed] === 'string') {
        return _cache[propName] = prefixed;
      }
    }
    return _cache[propName] = 'undefined';
  };
  CustomStyle.setProp = function set(propName, element, str) {
    var prop = this.getProp(propName);
    if (prop !== 'undefined') {
      element.style[prop] = str;
    }
  };
  return CustomStyle;
}();
var RenderingCancelledException = function RenderingCancelledException() {
  function RenderingCancelledException(msg, type) {
    this.message = msg;
    this.type = type;
  }
  RenderingCancelledException.prototype = new Error();
  RenderingCancelledException.prototype.name = 'RenderingCancelledException';
  RenderingCancelledException.constructor = RenderingCancelledException;
  return RenderingCancelledException;
}();
var LinkTarget = {
  NONE: 0,
  SELF: 1,
  BLANK: 2,
  PARENT: 3,
  TOP: 4
};
var LinkTargetStringMap = ['', '_self', '_blank', '_parent', '_top'];
function addLinkAttributes(link, params) {
  var url = params && params.url;
  link.href = link.title = url ? (0, _util.removeNullCharacters)(url) : '';
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
function getFilenameFromUrl(url) {
  var anchor = url.indexOf('#');
  var query = url.indexOf('?');
  var end = Math.min(anchor > 0 ? anchor : url.length, query > 0 ? query : url.length);
  return url.substring(url.lastIndexOf('/', end) + 1, end);
}
function getDefaultSetting(id) {
  var globalSettings = _global_scope2.default.PDFJS;
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
      (0, _util.warn)('PDFJS.externalLinkTarget is invalid: ' + globalSettings.externalLinkTarget);
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
  (0, _util.deprecated)('isValidUrl(), please use createValidAbsoluteUrl() instead.');
  var baseUrl = allowRelative ? 'http://example.com' : null;
  return (0, _util.createValidAbsoluteUrl)(url, baseUrl) !== null;
}
exports.CustomStyle = CustomStyle;
exports.RenderingCancelledException = RenderingCancelledException;
exports.addLinkAttributes = addLinkAttributes;
exports.isExternalLinkTargetSet = isExternalLinkTargetSet;
exports.isValidUrl = isValidUrl;
exports.getFilenameFromUrl = getFilenameFromUrl;
exports.LinkTarget = LinkTarget;
exports.getDefaultSetting = getDefaultSetting;
exports.DEFAULT_LINK_REL = DEFAULT_LINK_REL;
exports.DOMCanvasFactory = DOMCanvasFactory;
exports.DOMCMapReaderFactory = DOMCMapReaderFactory;
exports.DOMSVGFactory = DOMSVGFactory;