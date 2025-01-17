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
import { Stream } from "./stream.js";

// Lots of DecodeStreams are created whose buffers are never used.  For these
// we share a single empty buffer. This is (a) space-efficient and (b) avoids
// having special cases that would be required if we used |null| for an empty
// buffer.
const emptyBuffer = new Uint8Array(0);

// Super class for the decoding streams.
class DecodeStream extends BaseStream {
  constructor(maybeMinBufferLength) {
    super();
    this._rawMinBufferLength = maybeMinBufferLength || 0;

    this.pos = 0;
    this.bufferLength = 0;
    this.eof = false;
    this.buffer = emptyBuffer;
    this.minBufferLength = 512;
    if (maybeMinBufferLength) {
      // Compute the first power of two that is as big as maybeMinBufferLength.
      while (this.minBufferLength < maybeMinBufferLength) {
        this.minBufferLength *= 2;
      }
    }
  }

  get isEmpty() {
    while (!this.eof && this.bufferLength === 0) {
      this.readBlock();
    }
    return this.bufferLength === 0;
  }

  ensureBuffer(requested) {
    const buffer = this.buffer;
    if (requested <= buffer.byteLength) {
      return buffer;
    }
    let size = this.minBufferLength;
    while (size < requested) {
      size *= 2;
    }
    const buffer2 = new Uint8Array(size);
    buffer2.set(buffer);
    return (this.buffer = buffer2);
  }

  getByte() {
    const pos = this.pos;
    while (this.bufferLength <= pos) {
      if (this.eof) {
        return -1;
      }
      this.readBlock();
    }
    return this.buffer[this.pos++];
  }

  getBytes(length, decoderOptions = null) {
    const pos = this.pos;
    let end;

    if (length) {
      this.ensureBuffer(pos + length);
      end = pos + length;

      while (!this.eof && this.bufferLength < end) {
        this.readBlock(decoderOptions);
      }
      const bufEnd = this.bufferLength;
      if (end > bufEnd) {
        end = bufEnd;
      }
    } else {
      while (!this.eof) {
        this.readBlock(decoderOptions);
      }
      end = this.bufferLength;
    }

    this.pos = end;
    return this.buffer.subarray(pos, end);
  }

  async getImageData(length, decoderOptions) {
    if (!this.canAsyncDecodeImageFromBuffer) {
      if (this.isAsyncDecoder) {
        return this.decodeImage(null, decoderOptions);
      }
      return this.getBytes(length, decoderOptions);
    }
    const data = await this.stream.asyncGetBytes();
    return this.decodeImage(data, decoderOptions);
  }

  reset() {
    this.pos = 0;
  }

  makeSubStream(start, length, dict = null) {
    if (length === undefined) {
      while (!this.eof) {
        this.readBlock();
      }
    } else {
      const end = start + length;
      while (this.bufferLength <= end && !this.eof) {
        this.readBlock();
      }
    }
    return new Stream(this.buffer, start, length, dict);
  }

  getBaseStreams() {
    return this.str ? this.str.getBaseStreams() : null;
  }
}

class StreamsSequenceStream extends DecodeStream {
  constructor(streams, onError = null) {
    streams = streams.filter(s => s instanceof BaseStream);

    let maybeLength = 0;
    for (const stream of streams) {
      maybeLength +=
        stream instanceof DecodeStream
          ? stream._rawMinBufferLength
          : stream.length;
    }
    super(maybeLength);

    this.streams = streams;
    this._onError = onError;
  }

  readBlock() {
    const streams = this.streams;
    if (streams.length === 0) {
      this.eof = true;
      return;
    }
    const stream = streams.shift();
    let chunk;
    try {
      chunk = stream.getBytes();
    } catch (reason) {
      if (this._onError) {
        this._onError(reason, stream.dict?.objId);
        return;
      }
      throw reason;
    }
    const bufferLength = this.bufferLength;
    const newLength = bufferLength + chunk.length;
    const buffer = this.ensureBuffer(newLength);
    buffer.set(chunk, bufferLength);
    this.bufferLength = newLength;
  }

  getBaseStreams() {
    const baseStreamsBuf = [];
    for (const stream of this.streams) {
      const baseStreams = stream.getBaseStreams();
      if (baseStreams) {
        baseStreamsBuf.push(...baseStreams);
      }
    }
    return baseStreamsBuf.length > 0 ? baseStreamsBuf : null;
  }
}

export { DecodeStream, StreamsSequenceStream };
