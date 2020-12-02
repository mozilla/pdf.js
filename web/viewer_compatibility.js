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

const compatibilityParams = Object.create(null);
if (typeof PDFJSDev === "undefined" || PDFJSDev.test("GENERIC")) {
  const userAgent =
    (typeof navigator !== "undefined" && navigator.userAgent) || "";
  const platform =
    (typeof navigator !== "undefined" && navigator.platform) || "";
  const maxTouchPoints =
    (typeof navigator !== "undefined" && navigator.maxTouchPoints) || 1;

  const isAndroid = /Android/.test(userAgent);
  const isIOS =
    /\b(iPad|iPhone|iPod)(?=;)/.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1);
  const isIOSChrome = /CriOS/.test(userAgent);

  // Checks if possible to use URL.createObjectURL()
  // Support: IE, Chrome on iOS
  (function checkOnBlobSupport() {
    // Sometimes Chrome on iOS loses data created with createObjectURL(),
    // see issue #8081.
    if (isIOSChrome) {
      compatibilityParams.disableCreateObjectURL = true;
    }
  })();

  // Limit canvas size to 5 mega-pixels on mobile.
  // Support: Android, iOS
  (function checkCanvasSizeLimitation() {
    if (isIOS || isAndroid) {
      compatibilityParams.maxCanvasPixels = 5242880;
    }
  })();
}
const viewerCompatibilityParams = Object.freeze(compatibilityParams);

export { viewerCompatibilityParams };
