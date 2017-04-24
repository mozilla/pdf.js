/* Copyright 2016 Mozilla Foundation
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
/* globals module, __pdfjsdev_webpack__ */

'use strict';

if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('PRODUCTION')) {
  var pdfjsLib;
  // The if below protected by __pdfjsdev_webpack__ check from webpack parsing.
  if (typeof __pdfjsdev_webpack__ === 'undefined') {
    if (typeof window !== 'undefined' && window['pdfjs-dist/build/pdf']) {
      pdfjsLib = window['pdfjs-dist/build/pdf'];
    } else if (typeof require === 'function') {
      if (PDFJSDev.test('LIB')) {
        pdfjsLib = require('../pdf.js');
      } else {
        pdfjsLib = require('../build/pdf.js');
      }
    } else {
      throw new Error('Neither `require` nor `window` found');
    }
  }
  module.exports = pdfjsLib;
} else {
  (function (root, factory) {
    if (typeof define === 'function' && define.amd) {
      define('pdfjs-web/pdfjs', ['exports', 'pdfjs/main_loader'], factory);
    } else if (typeof exports !== 'undefined') {
      factory(exports, require('../src/main_loader.js'));
    } else {
      factory((root.pdfjsWebPDFJS = {}), root.pdfjsMainLoader);
    }
  }(this, function (exports, mainLoader) {
    // Re-export all mainLoader members.
    for (var i in mainLoader) {
      if (Object.prototype.hasOwnProperty.call(mainLoader, i)) {
        exports[i] = mainLoader[i];
      }
    }
  }));
}
