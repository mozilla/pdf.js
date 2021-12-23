/* Copyright 2012 Mozilla Foundation
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

import { BaseStream } from "./base_stream.js";
import { stringToBytes } from "../shared/util.js";

class Stream extends BaseStream {
  constructor(arrayBuffer, start, length, dict) {
    super();

    this.bytes =
      arrayBuffer instanceof Uint8Array
        ? arrayBuffer
        : new Uint8Array(arrayBuffer);
    this.start = start || 0;
    this.pos = this.start;
    this.end = start + length || this.bytes.length;
    this.dict = dict;
  }

  get length() {
    return this.end - this.start;
  }

  get isEmpty() {
    return this.length === 0;
  }

  getByte() {
    if (this.pos >= this.end) {
      return -1;
    }
    return this.bytes[this.pos++];
  }

  getBytes(length, forceClamped = false) {
    const bytes = this.bytes;
    const pos = this.pos;
    const strEnd = this.end;

    if (!length) {
      const subarray = bytes.subarray(pos, strEnd);
      // `this.bytes` is always a `Uint8Array` here.
      return forceClamped ? new Uint8ClampedArray(subarray) : subarray;
    }
    let end = pos + length;
    if (end > strEnd) {
      end = strEnd;
    }
    this.pos = end;
    const subarray = bytes.subarray(pos, end);
    // `this.bytes` is always a `Uint8Array` here.
    return forceClamped ? new Uint8ClampedArray(subarray) : subarray;
  }

  getByteRange(begin, end) {
    if (begin < 0) {
      begin = 0;
    }
    if (end > this.end) {
      end = this.end;
    }
    return this.bytes.subarray(begin, end);
  }

  reset() {
    this.pos = this.start;
  }

  moveStart() {
    this.start = this.pos;
  }

  makeSubStream(start, length, dict = null) {
    return new Stream(this.bytes.buffer, start, length, dict);
  }
}

class StringStream extends Stream {
  constructor(str) {
    super(stringToBytes(str));
  }
}

class NullStream extends Stream {
  constructor() {
    super(new Uint8Array(0));
  }
}

export { NullStream, Stream, StringStream };
