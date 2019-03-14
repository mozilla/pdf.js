/* Copyright 2018 Mozilla Foundation
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
/* eslint-disable no-restricted-globals */

if (typeof PDFJSDev !== 'undefined' && !PDFJSDev.test('GENERIC')) {
  // The `URL` constructor is assumed to be available in the extension builds.
  exports.URL = URL;
} else {
  let isURLSupported = false;
  try {
    if (typeof URL === 'function' && typeof URL.prototype === 'object' &&
        ('origin' in URL.prototype)) {
      const u = new URL('b', 'http://a');
      u.pathname = 'c%20d';
      isURLSupported = (u.href === 'http://a/c%20d');
    }
  } catch (ex) {
    // The `URL` constructor cannot be used.
  }

  if (isURLSupported) {
    exports.URL = URL;
  } else if (typeof PDFJSDev !== 'undefined' &&
             PDFJSDev.test('IMAGE_DECODERS')) {
    class DummyURL {
      constructor() {
        throw new Error('The current image decoders doesn\'t utilize the ' +
                        '`URL` constructor, hence it shouldn\'t need to be ' +
                        'polyfilled for the IMAGE_DECODERS build target.');
      }
    }
    exports.URL = DummyURL;
  } else {
    const PolyfillURL = require('../../external/url/url-lib').URL;

    // Attempt to copy over the static methods.
    const OriginalURL = require('./global_scope').URL;
    if (OriginalURL) {
      PolyfillURL.createObjectURL = function(blob) {
        // IE extension allows a second optional options argument, see
        // http://msdn.microsoft.com/en-us/library/ie/hh772302(v=vs.85).aspx
        return OriginalURL.createObjectURL.apply(OriginalURL, arguments);
      };
      PolyfillURL.revokeObjectURL = function(url) {
        OriginalURL.revokeObjectURL(url);
      };
    }
    exports.URL = PolyfillURL;
  }
}
