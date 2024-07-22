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
  constructor(arrayBuffer, start = 0, length = null, dict = null) {
    super();
    this.bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
    this.start = start;
    this.pos = start;
    this.end = length !== null ? start + length : this.bytes.length;
    this.dict = dict;
  }

  get length() {
    return this.end - this.start;
  }

  get isEmpty() {
    return this.length === 0;
  }

  getByte() {
    return this.pos < this.end ? this.bytes[this.pos++] : -1;
  }

  getBytes(length) {
    const end = length ? Math.min(this.pos + length, this.end) : this.end;
    const result = this.bytes.subarray(this.pos, end);
    this.pos = end;
    return result;
  }

  getByteRange(begin, end) {
    return this.bytes.subarray(Math.max(0, begin), Math.min(this.end, end));
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
