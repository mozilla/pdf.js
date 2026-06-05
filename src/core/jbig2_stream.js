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
import { DecodeStream } from "./decode_stream.js";
import { Dict } from "./primitives.js";
import { JBig2CCITTFaxImage } from "./jbig2_ccittFax.js";
import { shadow } from "../shared/util.js";

/**
 * For JBIG2's we use a library to decode these images and
 * the stream behaves like all the other DecodeStreams.
 */
class Jbig2Stream extends DecodeStream {
  constructor(stream, maybeLength, params) {
    super(maybeLength);

    this.stream = stream;
    this.dict = stream.dict;
    this.maybeLength = maybeLength;
    this.params = params;
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

  get isImageStream() {
    return true;
  }

  // The JBIG2 file header is defined in ITU-T T.88, Annex D.4:
  // https://www.itu.int/rec/T-REC-T.88
  static stripFileHeader(bytes) {
    if (
      bytes.length >= 9 &&
      bytes[0] === 0x97 &&
      bytes[1] === 0x4a &&
      bytes[2] === 0x42 &&
      bytes[3] === 0x32 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      const headerLength = (bytes[8] & 2) === 0 ? 13 : 9;
      return bytes.subarray(headerLength);
    }
    return bytes;
  }

  async decodeImage(bytes, length, _decoderOptions) {
    if (this.eof) {
      return this.buffer;
    }
    bytes = Jbig2Stream.stripFileHeader(bytes || this.bytes);

    let globals = null;
    if (this.params instanceof Dict) {
      const globalsStream = this.params.get("JBIG2Globals");
      if (globalsStream instanceof BaseStream) {
        globals = Jbig2Stream.stripFileHeader(globalsStream.getBytes());
      }
    }
    this.buffer = await JBig2CCITTFaxImage.instance.decode(
      bytes,
      this.dict.get("Width"),
      this.dict.get("Height"),
      globals
    );
    this.bufferLength = this.buffer.length;
    this.eof = true;

    return this.buffer;
  }

  get canAsyncDecodeImageFromBuffer() {
    return this.stream.isAsync;
  }
}

export { Jbig2Stream };
