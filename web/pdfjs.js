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
/* umdutils ignore */

'use strict';

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
