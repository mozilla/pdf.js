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
/* globals PDFJS, require, module, requirejs */

// included from api.js for GENERIC build

'use strict';

var useRequireEnsure = false;
if (typeof module !== 'undefined' && module.require) {
  // node.js - disable worker and set require.ensure.
  PDFJS.disableWorker = true;
  if (typeof require.ensure === 'undefined') {
    require.ensure = require('node-ensure');
  }
  useRequireEnsure = true;
}
if (typeof __webpack_require__ !== 'undefined') {
  // Webpack - get/bundle pdf.worker.js as additional file.
  PDFJS.workerSrc = require('entry?name=[hash]-worker.js!./pdf.worker.js');
  useRequireEnsure = true;
}
if (typeof requirejs !== 'undefined' && requirejs.toUrl) {
  PDFJS.workerSrc = requirejs.toUrl('pdfjs-dist/build/pdf.worker.js');
}
var fakeWorkerFilesLoader = useRequireEnsure ? (function (callback) {
  require.ensure([], function () {
    require('./pdf.worker.js');
    callback();
  });
}) : (typeof requirejs !== 'undefined') ? (function (callback) {
  requirejs(['pdfjs-dist/build/pdf.worker'], function (worker) {
    callback();
  });
}) : null;
