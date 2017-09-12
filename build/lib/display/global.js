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
exports.PDFJS = exports.isWorker = exports.globalScope = undefined;

var _api = require('./api');

var _dom_utils = require('./dom_utils');

var _util = require('../shared/util');

var _annotation_layer = require('./annotation_layer');

var _global_scope = require('../shared/global_scope');

var _global_scope2 = _interopRequireDefault(_global_scope);

var _metadata = require('./metadata');

var _text_layer = require('./text_layer');

var _svg = require('./svg');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var isWorker = typeof window === 'undefined';
if (!_global_scope2.default.PDFJS) {
  _global_scope2.default.PDFJS = {};
}
var PDFJS = _global_scope2.default.PDFJS;
{
  PDFJS.version = '1.9.559';
  PDFJS.build = 'f07111b1';
}
PDFJS.pdfBug = false;
if (PDFJS.verbosity !== undefined) {
  (0, _util.setVerbosityLevel)(PDFJS.verbosity);
}
delete PDFJS.verbosity;
Object.defineProperty(PDFJS, 'verbosity', {
  get: function get() {
    return (0, _util.getVerbosityLevel)();
  },
  set: function set(level) {
    (0, _util.setVerbosityLevel)(level);
  },

  enumerable: true,
  configurable: true
});
PDFJS.VERBOSITY_LEVELS = _util.VERBOSITY_LEVELS;
PDFJS.OPS = _util.OPS;
PDFJS.UNSUPPORTED_FEATURES = _util.UNSUPPORTED_FEATURES;
PDFJS.isValidUrl = _dom_utils.isValidUrl;
PDFJS.shadow = _util.shadow;
PDFJS.createBlob = _util.createBlob;
PDFJS.createObjectURL = function PDFJS_createObjectURL(data, contentType) {
  return (0, _util.createObjectURL)(data, contentType, PDFJS.disableCreateObjectURL);
};
Object.defineProperty(PDFJS, 'isLittleEndian', {
  configurable: true,
  get: function PDFJS_isLittleEndian() {
    return (0, _util.shadow)(PDFJS, 'isLittleEndian', (0, _util.isLittleEndian)());
  }
});
PDFJS.removeNullCharacters = _util.removeNullCharacters;
PDFJS.PasswordResponses = _util.PasswordResponses;
PDFJS.PasswordException = _util.PasswordException;
PDFJS.UnknownErrorException = _util.UnknownErrorException;
PDFJS.InvalidPDFException = _util.InvalidPDFException;
PDFJS.MissingPDFException = _util.MissingPDFException;
PDFJS.UnexpectedResponseException = _util.UnexpectedResponseException;
PDFJS.Util = _util.Util;
PDFJS.PageViewport = _util.PageViewport;
PDFJS.createPromiseCapability = _util.createPromiseCapability;
PDFJS.maxImageSize = PDFJS.maxImageSize === undefined ? -1 : PDFJS.maxImageSize;
PDFJS.cMapUrl = PDFJS.cMapUrl === undefined ? null : PDFJS.cMapUrl;
PDFJS.cMapPacked = PDFJS.cMapPacked === undefined ? false : PDFJS.cMapPacked;
PDFJS.disableFontFace = PDFJS.disableFontFace === undefined ? false : PDFJS.disableFontFace;
PDFJS.imageResourcesPath = PDFJS.imageResourcesPath === undefined ? '' : PDFJS.imageResourcesPath;
PDFJS.disableWorker = PDFJS.disableWorker === undefined ? false : PDFJS.disableWorker;
PDFJS.workerSrc = PDFJS.workerSrc === undefined ? null : PDFJS.workerSrc;
PDFJS.workerPort = PDFJS.workerPort === undefined ? null : PDFJS.workerPort;
PDFJS.disableRange = PDFJS.disableRange === undefined ? false : PDFJS.disableRange;
PDFJS.disableStream = PDFJS.disableStream === undefined ? false : PDFJS.disableStream;
PDFJS.disableAutoFetch = PDFJS.disableAutoFetch === undefined ? false : PDFJS.disableAutoFetch;
PDFJS.pdfBug = PDFJS.pdfBug === undefined ? false : PDFJS.pdfBug;
PDFJS.postMessageTransfers = PDFJS.postMessageTransfers === undefined ? true : PDFJS.postMessageTransfers;
PDFJS.disableCreateObjectURL = PDFJS.disableCreateObjectURL === undefined ? false : PDFJS.disableCreateObjectURL;
PDFJS.disableWebGL = PDFJS.disableWebGL === undefined ? true : PDFJS.disableWebGL;
PDFJS.externalLinkTarget = PDFJS.externalLinkTarget === undefined ? _dom_utils.LinkTarget.NONE : PDFJS.externalLinkTarget;
PDFJS.externalLinkRel = PDFJS.externalLinkRel === undefined ? _dom_utils.DEFAULT_LINK_REL : PDFJS.externalLinkRel;
PDFJS.isEvalSupported = PDFJS.isEvalSupported === undefined ? true : PDFJS.isEvalSupported;
PDFJS.pdfjsNext = PDFJS.pdfjsNext === undefined ? false : PDFJS.pdfjsNext;
{
  var savedOpenExternalLinksInNewWindow = PDFJS.openExternalLinksInNewWindow;
  delete PDFJS.openExternalLinksInNewWindow;
  Object.defineProperty(PDFJS, 'openExternalLinksInNewWindow', {
    get: function get() {
      return PDFJS.externalLinkTarget === _dom_utils.LinkTarget.BLANK;
    },
    set: function set(value) {
      if (value) {
        (0, _util.deprecated)('PDFJS.openExternalLinksInNewWindow, please use ' + '"PDFJS.externalLinkTarget = PDFJS.LinkTarget.BLANK" instead.');
      }
      if (PDFJS.externalLinkTarget !== _dom_utils.LinkTarget.NONE) {
        (0, _util.warn)('PDFJS.externalLinkTarget is already initialized');
        return;
      }
      PDFJS.externalLinkTarget = value ? _dom_utils.LinkTarget.BLANK : _dom_utils.LinkTarget.NONE;
    },

    enumerable: true,
    configurable: true
  });
  if (savedOpenExternalLinksInNewWindow) {
    PDFJS.openExternalLinksInNewWindow = savedOpenExternalLinksInNewWindow;
  }
}
PDFJS.getDocument = _api.getDocument;
PDFJS.LoopbackPort = _api.LoopbackPort;
PDFJS.PDFDataRangeTransport = _api.PDFDataRangeTransport;
PDFJS.PDFWorker = _api.PDFWorker;
PDFJS.hasCanvasTypedArrays = true;
PDFJS.CustomStyle = _dom_utils.CustomStyle;
PDFJS.LinkTarget = _dom_utils.LinkTarget;
PDFJS.addLinkAttributes = _dom_utils.addLinkAttributes;
PDFJS.getFilenameFromUrl = _dom_utils.getFilenameFromUrl;
PDFJS.isExternalLinkTargetSet = _dom_utils.isExternalLinkTargetSet;
PDFJS.AnnotationLayer = _annotation_layer.AnnotationLayer;
PDFJS.renderTextLayer = _text_layer.renderTextLayer;
PDFJS.Metadata = _metadata.Metadata;
PDFJS.SVGGraphics = _svg.SVGGraphics;
PDFJS.UnsupportedManager = _api._UnsupportedManager;
exports.globalScope = _global_scope2.default;
exports.isWorker = isWorker;
exports.PDFJS = PDFJS;