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
  createBlob, createObjectURL, createPromiseCapability, getVerbosityLevel,
  InvalidPDFException, isLittleEndian, MissingPDFException, OPS, PageViewport,
  PasswordException, PasswordResponses, removeNullCharacters, setVerbosityLevel,
  shadow, UnexpectedResponseException, UnknownErrorException,
  UNSUPPORTED_FEATURES, Util, VERBOSITY_LEVELS
} from '../shared/util';
import { CustomStyle, getFilenameFromUrl } from './dom_utils';
import {
  getDocument, LoopbackPort, PDFDataRangeTransport, PDFWorker
} from './api';
import { AnnotationLayer } from './annotation_layer';
import globalScope from '../shared/global_scope';
import { Metadata } from './metadata';
import { renderTextLayer } from './text_layer';
import { SVGGraphics } from './svg';

// The global PDFJS object is now deprecated and will not be supported in
// the future. The members below are maintained for backward  compatibility
// and shall not be extended or modified. If the global.js is included as
// a module, we will create a global PDFJS object instance or use existing.
if (!globalScope.PDFJS) {
  globalScope.PDFJS = {};
}
var PDFJS = globalScope.PDFJS;

if (typeof PDFJSDev !== 'undefined') {
  PDFJS.version = PDFJSDev.eval('BUNDLE_VERSION');
  PDFJS.build = PDFJSDev.eval('BUNDLE_BUILD');
}

PDFJS.pdfBug = false;

if (PDFJS.verbosity !== undefined) {
  setVerbosityLevel(PDFJS.verbosity);
}
delete PDFJS.verbosity;
Object.defineProperty(PDFJS, 'verbosity', {
  get() {
    return getVerbosityLevel();
  },
  set(level) {
    setVerbosityLevel(level);
  },
  enumerable: true,
  configurable: true,
});

PDFJS.VERBOSITY_LEVELS = VERBOSITY_LEVELS;
PDFJS.OPS = OPS;
PDFJS.UNSUPPORTED_FEATURES = UNSUPPORTED_FEATURES;
PDFJS.shadow = shadow;
PDFJS.createBlob = createBlob;
PDFJS.createObjectURL = function PDFJS_createObjectURL(data, contentType) {
  return createObjectURL(data, contentType, PDFJS.disableCreateObjectURL);
};
Object.defineProperty(PDFJS, 'isLittleEndian', {
  configurable: true,
  get: function PDFJS_isLittleEndian() {
    return shadow(PDFJS, 'isLittleEndian', isLittleEndian());
  },
});
PDFJS.removeNullCharacters = removeNullCharacters;
PDFJS.PasswordResponses = PasswordResponses;
PDFJS.PasswordException = PasswordException;
PDFJS.UnknownErrorException = UnknownErrorException;
PDFJS.InvalidPDFException = InvalidPDFException;
PDFJS.MissingPDFException = MissingPDFException;
PDFJS.UnexpectedResponseException = UnexpectedResponseException;
PDFJS.Util = Util;
PDFJS.PageViewport = PageViewport;
PDFJS.createPromiseCapability = createPromiseCapability;

/**
 * Disable the web worker and run all code on the main thread. This will
 * happen automatically if the browser doesn't support workers or sending
 * typed arrays to workers.
 * @var {boolean}
 */
PDFJS.disableWorker = (PDFJS.disableWorker === undefined ?
                       false : PDFJS.disableWorker);

/**
 * Path and filename of the worker file. Required when the worker is enabled
 * in development mode. If unspecified in the production build, the worker
 * will be loaded based on the location of the pdf.js file. It is recommended
 * that the workerSrc is set in a custom application to prevent issues caused
 * by third-party frameworks and libraries.
 * @var {string}
 */
PDFJS.workerSrc = (PDFJS.workerSrc === undefined ? null : PDFJS.workerSrc);

/**
 * Defines global port for worker process. Overrides workerSrc and
 * disableWorker setting.
 */
PDFJS.workerPort = (PDFJS.workerPort === undefined ? null : PDFJS.workerPort);

/**
 * Enables special hooks for debugging PDF.js.
 * @var {boolean}
 */
PDFJS.pdfBug = (PDFJS.pdfBug === undefined ? false : PDFJS.pdfBug);

/**
 * Enables transfer usage in postMessage for ArrayBuffers.
 * @var {boolean}
 */
PDFJS.postMessageTransfers = (PDFJS.postMessageTransfers === undefined ?
                              true : PDFJS.postMessageTransfers);

/**
 * Disables URL.createObjectURL usage.
 * @var {boolean}
 */
PDFJS.disableCreateObjectURL = (PDFJS.disableCreateObjectURL === undefined ?
                                false : PDFJS.disableCreateObjectURL);

PDFJS.getDocument = getDocument;
PDFJS.LoopbackPort = LoopbackPort;
PDFJS.PDFDataRangeTransport = PDFDataRangeTransport;
PDFJS.PDFWorker = PDFWorker;

PDFJS.CustomStyle = CustomStyle;
PDFJS.getFilenameFromUrl = getFilenameFromUrl;

PDFJS.AnnotationLayer = AnnotationLayer;

PDFJS.renderTextLayer = renderTextLayer;

PDFJS.Metadata = Metadata;

PDFJS.SVGGraphics = SVGGraphics;

export {
  globalScope,
  PDFJS,
};
