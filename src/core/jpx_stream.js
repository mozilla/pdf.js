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

import { DecodeStream } from "./decode_stream.js";
import { JpxImage } from "./jpx.js";
import { shadow } from "../shared/util.js";

/**
 * For JPEG 2000's we use a library to decode these images and
 * the stream behaves like all the other DecodeStreams.
 */
class JpxStream extends DecodeStream {
  constructor(stream, maybeLength) {
    super(maybeLength);

    this.stream = stream;
    this.dict = stream.dict;
    this.maybeLength = maybeLength;
  }

  get bytes() {
    // If `this.maybeLength` is null, we'll get the entire stream.
    return shadow(this, "bytes", this.stream.getBytes(this.maybeLength));
  }

  ensureBuffer(requested) {
    // No-op, since `this.readBlock` will always parse the entire image and
    // directly insert all of its data into `this.buffer`.
  }

  get isAsyncDecoder() {
    return true;
  }

  #reducePower = 0;

  async decodeImage(bytes, _length, decoderOptions) {
    if (this.eof && this.#reducePower === decoderOptions?.reducePower) {
      return this.buffer;
    }
    bytes ||= this.bytes;
    this.buffer = await JpxImage.instance.decode(bytes, decoderOptions);
    this.bufferLength = this.buffer.length;
    this.eof = true;
    this.#reducePower = decoderOptions?.reducePower;

    return this.buffer;
  }

  get canAsyncDecodeImageFromBuffer() {
    return this.stream.isAsync;
  }

  get isImageStream() {
    return true;
  }
}

export { JpxStream };
