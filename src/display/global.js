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
/* globals pdfjsVersion, pdfjsBuild */

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs/display/global', ['exports', 'pdfjs/shared/util'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('../shared/util.js'));
  } else {
    factory((root.pdfjsDisplayGlobal = {}), root.pdfjsSharedUtil);
  }
}(this, function (exports, sharedUtil) {

  var globalScope = sharedUtil.globalScope;

  var isWorker = (typeof window === 'undefined');

  // The global PDFJS object exposes the API
  // In production, it will be declared outside a global wrapper
  // In development, it will be declared here
  if (!globalScope.PDFJS) {
    globalScope.PDFJS = {};
  }
  var PDFJS = globalScope.PDFJS;

  if (typeof pdfjsVersion !== 'undefined') {
    PDFJS.version = pdfjsVersion;
  }
  if (typeof pdfjsBuild !== 'undefined') {
    PDFJS.build = pdfjsBuild;
  }

  PDFJS.pdfBug = false;

  if (PDFJS.verbosity !== undefined) {
    sharedUtil.setVerbosityLevel(PDFJS.verbosity);
  }
  delete PDFJS.verbosity;
  Object.defineProperty(PDFJS, 'verbosity', {
    get: function () { return sharedUtil.getVerbosityLevel(); },
    set: function (level) { sharedUtil.setVerbosityLevel(level); },
    enumerable: true,
    configurable: true
  });

  PDFJS.VERBOSITY_LEVELS = sharedUtil.VERBOSITY_LEVELS;
  PDFJS.OPS = sharedUtil.OPS;
  PDFJS.UNSUPPORTED_FEATURES = sharedUtil.UNSUPPORTED_FEATURES;
  PDFJS.isValidUrl = sharedUtil.isValidUrl;
  PDFJS.shadow = sharedUtil.shadow;
  PDFJS.createBlob = sharedUtil.createBlob;
  PDFJS.createObjectURL = function PDFJS_createObjectURL(data, contentType) {
    return sharedUtil.createObjectURL(data, contentType,
                                      PDFJS.disableCreateObjectURL);
  };
  Object.defineProperty(PDFJS, 'isLittleEndian', {
    configurable: true,
    get: function PDFJS_isLittleEndian() {
      var value = sharedUtil.isLittleEndian();
      return sharedUtil.shadow(PDFJS, 'isLittleEndian', value);
    }
  });
  PDFJS.removeNullCharacters = sharedUtil.removeNullCharacters;
  PDFJS.PasswordResponses = sharedUtil.PasswordResponses;
  PDFJS.PasswordException = sharedUtil.PasswordException;
  PDFJS.UnknownErrorException = sharedUtil.UnknownErrorException;
  PDFJS.InvalidPDFException = sharedUtil.InvalidPDFException;
  PDFJS.MissingPDFException = sharedUtil.MissingPDFException;
  PDFJS.UnexpectedResponseException = sharedUtil.UnexpectedResponseException;
  PDFJS.Util = sharedUtil.Util;
  PDFJS.PageViewport = sharedUtil.PageViewport;
  PDFJS.createPromiseCapability = sharedUtil.createPromiseCapability;

  exports.globalScope = globalScope;
  exports.isWorker = isWorker;
  exports.PDFJS = globalScope.PDFJS;
}));
