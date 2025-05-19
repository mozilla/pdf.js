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
  static #memoryArray = null;

  static _memory = null;

  static _mustAddAlpha = false;

  static _destBuffer = null;

  static _destOffset = 0;

  static _destLength = 0;

  static _cssColor = "";

  static _makeHexColor = null;

  static get _memoryArray() {
    const array = this.#memoryArray;
    if (array?.byteLength) {
      return array;
    }
    return (this.#memoryArray = new Uint8Array(this._memory.buffer));
  }
}

function copy_result(ptr, len) {
  // This function is called from the wasm module (it's an external
  // "C" function). Its goal is to copy the result from the wasm memory
  // to the destination buffer without any intermediate copies.
  const { _mustAddAlpha, _destBuffer, _destOffset, _destLength, _memoryArray } =
    QCMS;
  if (len === _destLength) {
    _destBuffer.set(_memoryArray.subarray(ptr, ptr + len), _destOffset);
    return;
  }
  if (_mustAddAlpha) {
    for (let i = ptr, ii = ptr + len, j = _destOffset; i < ii; i += 3, j += 4) {
      _destBuffer[j] = _memoryArray[i];
      _destBuffer[j + 1] = _memoryArray[i + 1];
      _destBuffer[j + 2] = _memoryArray[i + 2];
      _destBuffer[j + 3] = 255;
    }
  } else {
    for (let i = ptr, ii = ptr + len, j = _destOffset; i < ii; i += 3, j += 4) {
      _destBuffer[j] = _memoryArray[i];
      _destBuffer[j + 1] = _memoryArray[i + 1];
      _destBuffer[j + 2] = _memoryArray[i + 2];
    }
  }
}

function copy_rgb(ptr) {
  const { _destBuffer, _destOffset, _memoryArray } = QCMS;
  _destBuffer[_destOffset] = _memoryArray[ptr];
  _destBuffer[_destOffset + 1] = _memoryArray[ptr + 1];
  _destBuffer[_destOffset + 2] = _memoryArray[ptr + 2];
}

function make_cssRGB(ptr) {
  const { _memoryArray } = QCMS;
  QCMS._cssColor = QCMS._makeHexColor(
    _memoryArray[ptr],
    _memoryArray[ptr + 1],
    _memoryArray[ptr + 2]
  );
}

export { copy_result, copy_rgb, make_cssRGB, QCMS };
