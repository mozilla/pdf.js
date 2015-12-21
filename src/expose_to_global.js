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

/*
 NOTE: This file is created as a helper to expose all loaded internal exported
 members to global scope.
 */

'use strict';

(function (root) {
  for (var i in root) {
    if (/^pdfjs(Shared|Core|Display)/.test(i)) {
      var obj = root[i];
      for (var j in obj) {
        if (Object.getOwnPropertyDescriptor(root, j)) {
          continue; // ignoring if already set
        }
        root[j] =  obj[j];
      }
    }
  }
})(window);
