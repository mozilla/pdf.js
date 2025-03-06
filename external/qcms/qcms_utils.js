/* Copyright 2025 Mozilla Foundation
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

class QCMS {
  static _module = null;

  static _mustAddAlpha = false;

  static _destBuffer = null;
}

function copy_result(ptr, len) {
  // This function is called from the wasm module (it's an external
  // "C" function). Its goal is to copy the result from the wasm memory
  // to the destination buffer without any intermediate copies.
  const { _module, _mustAddAlpha, _destBuffer } = QCMS;
  const result = new Uint8Array(_module.memory.buffer, ptr, len);
  if (result.length === _destBuffer.length) {
    _destBuffer.set(result);
    return;
  }
  if (_mustAddAlpha) {
    for (let i = 0, j = 0, ii = result.length; i < ii; i += 3, j += 4) {
      _destBuffer[j] = result[i];
      _destBuffer[j + 1] = result[i + 1];
      _destBuffer[j + 2] = result[i + 2];
      _destBuffer[j + 3] = 255;
    }
  } else {
    for (let i = 0, j = 0, ii = result.length; i < ii; i += 3, j += 4) {
      _destBuffer[j] = result[i];
      _destBuffer[j + 1] = result[i + 1];
      _destBuffer[j + 2] = result[i + 2];
    }
  }
}

function copy_rgb(ptr) {
  QCMS._destBuffer.set(new Uint8Array(QCMS._module.memory.buffer, ptr, 3));
}

export { copy_result, copy_rgb, QCMS };
