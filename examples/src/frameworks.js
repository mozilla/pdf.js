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
/* globals require, module, requirejs,
           workerSrc: true, isWorkerDisabled: true */

// included from api.js for GENERIC build

'use strict';

var useRequireEnsure = false;
if (typeof window === 'undefined') {
  // node.js - disable worker and set require.ensure.
  isWorkerDisabled = true;
  if (typeof require.ensure === 'undefined') {
    require.ensure = require('node-ensure');
  }
  useRequireEnsure = true;
}
if (typeof __webpack_require__ !== 'undefined') {
  useRequireEnsure = true;
}
if (typeof requirejs !== 'undefined' && requirejs.toUrl) {
  workerSrc = requirejs.toUrl('pdfjs-dist/build/pdf.worker.js');
}
var dynamicLoaderSupported = typeof requirejs !== 'undefined' && requirejs.load;
var fakeWorkerFilesLoader = useRequireEnsure ? (function (callback) {
  require.ensure([], function () {
    var worker = require('./pdf.worker.js');
    callback(worker.WorkerMessageHandler);
  });
}) : dynamicLoaderSupported ? (function (callback) {
  requirejs(['pdfjs-dist/build/pdf.worker'], function (worker) {
    callback(worker.WorkerMessageHandler);
  });
}) : null;
