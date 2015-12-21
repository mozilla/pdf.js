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
/* globals global */

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs/shared/global', ['exports'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports);
  } else {
    factory((root.pdfjsSharedGlobal = {}));
  }
}(this, function (exports) {

  var globalScope = (typeof window !== 'undefined') ? window :
                    (typeof global !== 'undefined') ? global :
                    (typeof self !== 'undefined') ? self : this;

  var isWorker = (typeof window === 'undefined');

  // The global PDFJS object exposes the API
  // In production, it will be declared outside a global wrapper
  // In development, it will be declared here
  if (!globalScope.PDFJS) {
    globalScope.PDFJS = {};
  }

  globalScope.PDFJS.pdfBug = false;

  exports.globalScope = globalScope;
  exports.isWorker = isWorker;
  exports.PDFJS = globalScope.PDFJS;
}));
