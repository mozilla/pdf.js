/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2019 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

{
  var isURLSupported = false;

  try {
    if (typeof URL === 'function' && _typeof(URL.prototype) === 'object' && 'origin' in URL.prototype) {
      var u = new URL('b', 'http://a');
      u.pathname = 'c%20d';
      isURLSupported = u.href === 'http://a/c%20d';
    }
  } catch (ex) {}

  if (isURLSupported) {
    exports.URL = URL;
  } else {
    var PolyfillURL = require('../../external/url/url-lib').URL;

    var OriginalURL = require('./global_scope').URL;

    if (OriginalURL) {
      PolyfillURL.createObjectURL = function (blob) {
        return OriginalURL.createObjectURL.apply(OriginalURL, arguments);
      };

      PolyfillURL.revokeObjectURL = function (url) {
        OriginalURL.revokeObjectURL(url);
      };
    }

    exports.URL = PolyfillURL;
  }
}