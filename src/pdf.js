/* Copyright 2012 Mozilla Foundation
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
/* eslint strict: ["error", "function"] */
/* umdutils ignore */

(function (root, factory) {
  'use strict';
  if (typeof define === 'function' && define.amd) {
    define(PDFJSDev.eval('BUNDLE_AMD_NAME'), ['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    factory((root[PDFJSDev.eval('BUNDLE_JS_NAME')] = {}));
  }
}(this, function (exports) {
  // Use strict in our context only - users might not want it
  'use strict';

  var pdfjsVersion = PDFJSDev.eval('BUNDLE_VERSION');
  var pdfjsBuild = PDFJSDev.eval('BUNDLE_BUILD');

  var pdfjsFilePath =
    typeof document !== 'undefined' && document.currentScript ?
      document.currentScript.src : null;

  var pdfjsLibs = {};

  (function pdfjsWrapper() {

//#expand __BUNDLE__

  }).call(pdfjsLibs);

  if (PDFJSDev.test('MAIN_FILE')) {
    exports.PDFJS = pdfjsLibs.pdfjsDisplayGlobal.PDFJS;
    exports.build = pdfjsLibs.pdfjsDisplayAPI.build;
    exports.version = pdfjsLibs.pdfjsDisplayAPI.version;
    exports.getDocument = pdfjsLibs.pdfjsDisplayAPI.getDocument;
    exports.PDFDataRangeTransport =
      pdfjsLibs.pdfjsDisplayAPI.PDFDataRangeTransport;
    exports.PDFWorker = pdfjsLibs.pdfjsDisplayAPI.PDFWorker;
    exports.renderTextLayer = pdfjsLibs.pdfjsDisplayTextLayer.renderTextLayer;
    exports.AnnotationLayer =
      pdfjsLibs.pdfjsDisplayAnnotationLayer.AnnotationLayer;
    exports.CustomStyle = pdfjsLibs.pdfjsDisplayDOMUtils.CustomStyle;
    exports.PasswordResponses = pdfjsLibs.pdfjsSharedUtil.PasswordResponses;
    exports.InvalidPDFException = pdfjsLibs.pdfjsSharedUtil.InvalidPDFException;
    exports.MissingPDFException = pdfjsLibs.pdfjsSharedUtil.MissingPDFException;
    exports.SVGGraphics = pdfjsLibs.pdfjsDisplaySVG.SVGGraphics;
    exports.UnexpectedResponseException =
      pdfjsLibs.pdfjsSharedUtil.UnexpectedResponseException;
    exports.OPS = pdfjsLibs.pdfjsSharedUtil.OPS;
    exports.UNSUPPORTED_FEATURES =
      pdfjsLibs.pdfjsSharedUtil.UNSUPPORTED_FEATURES;
    exports.isValidUrl = pdfjsLibs.pdfjsDisplayDOMUtils.isValidUrl;
    exports.createValidAbsoluteUrl =
      pdfjsLibs.pdfjsSharedUtil.createValidAbsoluteUrl;
    exports.createObjectURL = pdfjsLibs.pdfjsSharedUtil.createObjectURL;
    exports.removeNullCharacters =
      pdfjsLibs.pdfjsSharedUtil.removeNullCharacters;
    exports.shadow = pdfjsLibs.pdfjsSharedUtil.shadow;
    exports.createBlob = pdfjsLibs.pdfjsSharedUtil.createBlob;
    exports.getFilenameFromUrl =
      pdfjsLibs.pdfjsDisplayDOMUtils.getFilenameFromUrl;
    exports.addLinkAttributes =
      pdfjsLibs.pdfjsDisplayDOMUtils.addLinkAttributes;
  } else {
    exports.WorkerMessageHandler =
      pdfjsLibs.pdfjsCoreWorker.WorkerMessageHandler;
  }
}));
