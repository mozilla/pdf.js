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

import { shadow, warn } from "../shared/util.js";
import { BaseStream } from "./base_stream.js";
import { DecodeStream } from "./decode_stream.js";
import { Dict } from "./primitives.js";
import { JBig2CCITTFaxWasmImage } from "./jbig2_ccittFax_wasm.js";
import { Jbig2Image } from "./jbig2.js";

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

  readBlock() {
    this.decodeImageFallback();
  }

  get isAsyncDecoder() {
    return true;
  }

  get isImageStream() {
    return true;
  }

  async decodeImage(bytes, length, _decoderOptions) {
    if (this.eof) {
      return this.buffer;
    }
    bytes ||= this.bytes;
    try {
      let globals = null;
      if (this.params instanceof Dict) {
        const globalsStream = this.params.get("JBIG2Globals");
        if (globalsStream instanceof BaseStream) {
          globals = globalsStream.getBytes();
        }
      }
      this.buffer = await JBig2CCITTFaxWasmImage.decode(
        bytes,
        this.dict.get("Width"),
        this.dict.get("Height"),
        globals
      );
    } catch {
      warn("Jbig2Stream: Falling back to JS JBIG2 decoder.");
      return this.decodeImageFallback(bytes, length);
    }
    this.bufferLength = this.buffer.length;
    this.eof = true;

    return this.buffer;
  }

  decodeImageFallback(bytes, _length) {
    if (this.eof) {
      return this.buffer;
    }
    bytes ||= this.bytes;
    const jbig2Image = new Jbig2Image();

    const chunks = [];
    if (this.params instanceof Dict) {
      const globalsStream = this.params.get("JBIG2Globals");
      if (globalsStream instanceof BaseStream) {
        const globals = globalsStream.getBytes();
        chunks.push({ data: globals, start: 0, end: globals.length });
      }
    }
    chunks.push({ data: bytes, start: 0, end: bytes.length });
    const data = jbig2Image.parseChunks(chunks);
    const dataLength = data.length;

    // JBIG2 had black as 1 and white as 0, inverting the colors
    for (let i = 0; i < dataLength; i++) {
      data[i] ^= 0xff;
    }
    this.buffer = data;
    this.bufferLength = dataLength;
    this.eof = true;

    return this.buffer;
  }

  get canAsyncDecodeImageFromBuffer() {
    return this.stream.isAsync;
  }
}

export { Jbig2Stream };
