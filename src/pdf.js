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
/* jshint globalstrict: false */
/* umdutils ignore */

(function (root, factory) {
  'use strict';
  if (typeof define === 'function' && define.amd) {
//#expand define('__BUNDLE_AMD_NAME__', ['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
//#expand factory((root.__BUNDLE_JS_NAME__ = {}));
  }
}(this, function (exports) {
  // Use strict in our context only - users might not want it
  'use strict';

//#expand var pdfjsVersion = '__BUNDLE_VERSION__';
//#expand var pdfjsBuild = '__BUNDLE_BUILD__';

  var pdfjsFilePath =
    typeof document !== 'undefined' && document.currentScript ?
      document.currentScript.src : null;

  var pdfjsLibs = {};

  (function pdfjsWrapper() {

//#expand __BUNDLE__

  }).call(pdfjsLibs);

  exports.PDFJS = pdfjsLibs.pdfjsSharedGlobal.PDFJS;

//#if MAIN_FILE
  exports.getDocument = pdfjsLibs.pdfjsDisplayAPI.getDocument;
  exports.PDFDataRangeTransport =
    pdfjsLibs.pdfjsDisplayAPI.PDFDataRangeTransport;
  exports.renderTextLayer = pdfjsLibs.pdfjsDisplayTextLayer.renderTextLayer;
  exports.AnnotationLayer =
    pdfjsLibs.pdfjsDisplayAnnotationLayer.AnnotationLayer;
  exports.CustomStyle = pdfjsLibs.pdfjsDisplayDOMUtils.CustomStyle;
  exports.PasswordResponses = pdfjsLibs.pdfjsSharedUtil.PasswordResponses;
  exports.InvalidPDFException = pdfjsLibs.pdfjsSharedUtil.InvalidPDFException;
  exports.MissingPDFException = pdfjsLibs.pdfjsSharedUtil.MissingPDFException;
  exports.UnexpectedResponseException =
    pdfjsLibs.pdfjsSharedUtil.UnexpectedResponseException;
//#endif
}));
