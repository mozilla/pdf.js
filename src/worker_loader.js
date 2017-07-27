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

'use strict';

// Patch importScripts to work around a bug in WebKit and Chrome 48-.
// See https://crbug.com/572225 and https://webkit.org/b/153317.
self.importScripts = (function (importScripts) {
  return function() {
    setTimeout(function () {}, 0);
    return importScripts.apply(this, arguments);
  };
})(importScripts);

importScripts('./shared/compatibility.js');
importScripts('../node_modules/systemjs/dist/system.js');
importScripts('../systemjs.config.js');

SystemJS.import('pdfjs/core/worker').then(function () {
  // Worker is loaded at this point.
});
