/* Copyright 2021 Mozilla Foundation
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

import { bytesToString, shadow, unreachable } from "../shared/util.js";

class BaseStream {
  constructor() {
    if (this.constructor === BaseStream) {
      unreachable("Cannot initialize BaseStream.");
    }
  }

  // eslint-disable-next-line getter-return
  get length() {
    unreachable("Abstract getter `length` accessed");
  }

  // eslint-disable-next-line getter-return
  get isEmpty() {
    unreachable("Abstract getter `isEmpty` accessed");
  }

  get isDataLoaded() {
    return shadow(this, "isDataLoaded", true);
  }

  getByte() {
    unreachable("Abstract method `getByte` called");
  }

  getBytes(length, forceClamped = false) {
    unreachable("Abstract method `getBytes` called");
  }

  peekByte() {
    const peekedByte = this.getByte();
    if (peekedByte !== -1) {
      this.pos--;
    }
    return peekedByte;
  }

  peekBytes(length, forceClamped = false) {
    const bytes = this.getBytes(length, forceClamped);
    this.pos -= bytes.length;
    return bytes;
  }

  getUint16() {
    const b0 = this.getByte();
    const b1 = this.getByte();
    if (b0 === -1 || b1 === -1) {
      return -1;
    }
    return (b0 << 8) + b1;
  }

  getInt32() {
    const b0 = this.getByte();
    const b1 = this.getByte();
    const b2 = this.getByte();
    const b3 = this.getByte();
    return (b0 << 24) + (b1 << 16) + (b2 << 8) + b3;
  }

  getByteRange(begin, end) {
    unreachable("Abstract method `getByteRange` called");
  }

  getString(length) {
    return bytesToString(this.getBytes(length, /* forceClamped = */ false));
  }

  skip(n) {
    this.pos += n || 1;
  }

  reset() {
    unreachable("Abstract method `reset` called");
  }

  moveStart() {
    unreachable("Abstract method `moveStart` called");
  }

  makeSubStream(start, length, dict = null) {
    unreachable("Abstract method `makeSubStream` called");
  }

  /**
   * @returns {Array | null}
   */
  getBaseStreams() {
    return null;
  }
}

export { BaseStream };
