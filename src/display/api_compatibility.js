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

let compatibilityParams = Object.create(null);
if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) {
  const userAgent =
    (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const isIE = /Trident/.test(userAgent);
  const isIOS = /\b(iPad|iPhone|iPod)(?=;)/.test(userAgent);
  const isIOSChrome = /CriOS/.test(userAgent);
  const isSafari = /Safari\//.test(userAgent) &&
                   !/(Chrome\/|Android\s)/.test(userAgent);

  // Checks if possible to use URL.createObjectURL()
  // Support: IE, Chrome on iOS
  (function checkOnBlobSupport() {
    // Sometimes IE and Chrome on iOS losing the data created with
    // createObjectURL(), see issues #3977 and #8081.
    if (isIE || isIOSChrome) {
      compatibilityParams.disableCreateObjectURL = true;
    }
  })();

  // Support: Safari 6.0+, iOS
  (function checkRangeRequests() {
    // Safari has issues with cached range requests, see issue #3260.
    // Last tested with version 6.0.4.
    if (isSafari || isIOS) {
      compatibilityParams.disableRange = true;
      compatibilityParams.disableStream = true;
    }
  })();
}
const apiCompatibilityParams = Object.freeze(compatibilityParams);

export {
  apiCompatibilityParams,
};
