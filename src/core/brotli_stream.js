/* Copyright 2026 Mozilla Foundation
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

import { BrotliDecode } from "../../external/brotli/decode.js";
import { DecodeStream } from "./decode_stream.js";
import { Stream } from "./stream.js";

class BrotliStream extends DecodeStream {
  #isAsync = true;

  constructor(stream, maybeLength) {
    super(maybeLength);

    this.stream = stream;
    this.dict = stream.dict;
  }

  readBlock() {
    // TODO: add some telemetry to measure how often we fallback here.
    // Get all bytes from the input stream
    const bytes = this.stream.getBytes();
    const decodedData = BrotliDecode(
      new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length)
    );

    this.buffer = new Uint8Array(
      decodedData.buffer,
      decodedData.byteOffset,
      decodedData.length
    );
    this.bufferLength = this.buffer.length;
    this.eof = true;
  }

  async getImageData(length, _decoderOptions) {
    const data = await this.asyncGetBytes();
    if (!data) {
      return this.getBytes(length);
    }
    if (data.length <= length) {
      return data;
    }
    return data.subarray(0, length);
  }

  async asyncGetBytes() {
    const { decompressed, compressed } =
      await this.asyncGetBytesFromDecompressionStream("brotli");
    if (decompressed) {
      return decompressed;
    }
    // DecompressionStream failed (for example because there are some extra
    // bytes after the end of the compressed data), so we fallback to our
    // decoder.
    // We already get the bytes from the underlying stream, so we just reuse
    // them to avoid get them again.

    this.#isAsync = false;
    this.stream = new Stream(
      compressed,
      0,
      compressed.length,
      this.stream.dict
    );
    this.reset();
    return null;
  }

  get isAsync() {
    return this.#isAsync;
  }
}

export { BrotliStream };
