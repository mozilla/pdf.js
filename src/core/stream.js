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

import { stringToBytes } from "../shared/util.js";

const Stream = (function StreamClosure() {
  // eslint-disable-next-line no-shadow
  function Stream(arrayBuffer, start, length, dict) {
    this.bytes =
      arrayBuffer instanceof Uint8Array
        ? arrayBuffer
        : new Uint8Array(arrayBuffer);
    this.start = start || 0;
    this.pos = this.start;
    this.end = start + length || this.bytes.length;
    this.dict = dict;
  }

  // required methods for a stream. if a particular stream does not
  // implement these, an error should be thrown
  Stream.prototype = {
    get length() {
      return this.end - this.start;
    },
    get isEmpty() {
      return this.length === 0;
    },
    getByte: function Stream_getByte() {
      if (this.pos >= this.end) {
        return -1;
      }
      return this.bytes[this.pos++];
    },
    getUint16: function Stream_getUint16() {
      const b0 = this.getByte();
      const b1 = this.getByte();
      if (b0 === -1 || b1 === -1) {
        return -1;
      }
      return (b0 << 8) + b1;
    },
    getInt32: function Stream_getInt32() {
      const b0 = this.getByte();
      const b1 = this.getByte();
      const b2 = this.getByte();
      const b3 = this.getByte();
      return (b0 << 24) + (b1 << 16) + (b2 << 8) + b3;
    },
    // Returns subarray of original buffer, should only be read.
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
    },
    peekByte: function Stream_peekByte() {
      const peekedByte = this.getByte();
      if (peekedByte !== -1) {
        this.pos--;
      }
      return peekedByte;
    },
    peekBytes(length, forceClamped = false) {
      const bytes = this.getBytes(length, forceClamped);
      this.pos -= bytes.length;
      return bytes;
    },

    getByteRange(begin, end) {
      if (begin < 0) {
        begin = 0;
      }
      if (end > this.end) {
        end = this.end;
      }
      return this.bytes.subarray(begin, end);
    },

    skip: function Stream_skip(n) {
      if (!n) {
        n = 1;
      }
      this.pos += n;
    },
    reset: function Stream_reset() {
      this.pos = this.start;
    },
    moveStart: function Stream_moveStart() {
      this.start = this.pos;
    },
    makeSubStream: function Stream_makeSubStream(start, length, dict) {
      return new Stream(this.bytes.buffer, start, length, dict);
    },
  };

  return Stream;
})();

const StringStream = (function StringStreamClosure() {
  // eslint-disable-next-line no-shadow
  function StringStream(str) {
    const bytes = stringToBytes(str);
    Stream.call(this, bytes);
  }

  StringStream.prototype = Stream.prototype;

  return StringStream;
})();

const NullStream = (function NullStreamClosure() {
  // eslint-disable-next-line no-shadow
  function NullStream() {
    Stream.call(this, new Uint8Array(0));
  }

  NullStream.prototype = Stream.prototype;

  return NullStream;
})();

export { NullStream, Stream, StringStream };
