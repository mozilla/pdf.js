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

// Alpha lives in the high byte of a pixel on a little-endian host and in the
// low byte on a big-endian one.
const ALPHA_MASK =
  new Uint8Array(new Uint32Array([1]).buffer)[0] === 1 ? 0xff000000 : 0x000000ff;
const RGB_MASK = ~ALPHA_MASK;

class QCMS {
  static #memoryArray = null;

  static _memory = null;

  // Where the next `qcms_convert_array` result should land.
  static _destBuffer = null;

  static _destOffset = 0;

  // Set when the destination is RGBA and its alpha channel already holds
  // something worth keeping, which is the case whenever the image has an
  // /SMask: `fillOpacity` has run by then. The Wasm side does not know about
  // that, so it always fills alpha in, and the bytes are merged here instead of
  // copied wholesale.
  static _keepAlpha = false;

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
  // to the destination buffer without any intermediate copies. The wasm side
  // has already laid the result out the way the caller asked for it, so this is
  // one bulk copy unless the destination's alpha has to survive.
  const { _destBuffer, _destOffset, _keepAlpha, _memoryArray } = QCMS;
  if (!_keepAlpha) {
    _destBuffer.set(_memoryArray.subarray(ptr, ptr + len), _destOffset);
    return;
  }
  const count = len >> 2;
  const destStart = _destBuffer.byteOffset + _destOffset;
  if (((destStart | ptr) & 3) === 0) {
    // Both sides are pixel-aligned, so RGB can be merged a whole pixel at a
    // time. `len` is a multiple of 4 here: the wasm side wrote RGBA.
    const dest32 = new Uint32Array(_destBuffer.buffer, destStart, count);
    const src32 = new Uint32Array(QCMS._memory.buffer, ptr, count);
    for (let i = 0; i < count; i++) {
      dest32[i] = (dest32[i] & ALPHA_MASK) | (src32[i] & RGB_MASK);
    }
    return;
  }
  for (let i = ptr, ii = ptr + len, j = _destOffset; i < ii; i += 4, j += 4) {
    _destBuffer[j] = _memoryArray[i];
    _destBuffer[j + 1] = _memoryArray[i + 1];
    _destBuffer[j + 2] = _memoryArray[i + 2];
  }
}

export { copy_result, QCMS };
