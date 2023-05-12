/* Copyright 2017 Mozilla Foundation
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
/* globals __non_webpack_require__ */

import { isNodeJS } from "./is_node.js";

// Support: Node.js
(function checkDOMMatrix() {
  if (globalThis.DOMMatrix || !isNodeJS) {
    return;
  }
  globalThis.DOMMatrix = __non_webpack_require__("canvas").DOMMatrix;
})();

// Support: Node.js
(function checkPath2D() {
  if (globalThis.Path2D || !isNodeJS) {
    return;
  }
  const { CanvasRenderingContext2D } = __non_webpack_require__("canvas");
  const { polyfillPath2D } = __non_webpack_require__("path2d-polyfill");

  globalThis.CanvasRenderingContext2D = CanvasRenderingContext2D;
  polyfillPath2D(globalThis);
})();

// Support: Chrome<92
(function checkArrayAt() {
  if (Array.prototype.at) {
    return;
  }
  require("core-js/es/array/at.js");
})();

// Support: Chrome<92
(function checkTypedArrayAt() {
  if (Uint8Array.prototype.at) {
    return;
  }
  require("core-js/es/typed-array/at.js");
})();

// Support: Chrome<98
(function checkStructuredClone() {
  if (globalThis.structuredClone) {
    return;
  }
  require("core-js/web/structured-clone.js");
})();
