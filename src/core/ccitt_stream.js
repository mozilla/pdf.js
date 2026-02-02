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
import { CCITTFaxDecoder } from "./ccitt.js";
import { DecodeStream } from "./decode_stream.js";
import { Dict } from "./primitives.js";
import { JBig2CCITTFaxWasmImage } from "./jbig2_ccittFax_wasm.js";

class CCITTFaxStream extends DecodeStream {
  constructor(str, maybeLength, params) {
    super(maybeLength);

    this.stream = str;
    this.maybeLength = maybeLength;
    this.dict = str.dict;

    if (!(params instanceof Dict)) {
      params = Dict.empty;
    }

    this.params = {
      K: params.get("K") || 0,
      EndOfLine: !!params.get("EndOfLine"),
      EncodedByteAlign: !!params.get("EncodedByteAlign"),
      Columns: params.get("Columns") || 1728,
      Rows: params.get("Rows") || 0,
      EndOfBlock: !!(params.get("EndOfBlock") ?? true),
      BlackIs1: !!params.get("BlackIs1"),
    };
  }

  get bytes() {
    // If `this.maybeLength` is null, we'll get the entire stream.
    return shadow(this, "bytes", this.stream.getBytes(this.maybeLength));
  }

  readBlock() {
    this.decodeImageFallback();
  }

  get isImageStream() {
    return true;
  }

  get isAsyncDecoder() {
    return true;
  }

  async decodeImage(bytes, length, _decoderOptions) {
    if (this.eof) {
      return this.buffer;
    }
    if (!bytes) {
      bytes = this.stream.isAsync
        ? (await this.stream.asyncGetBytes()) || this.bytes
        : this.bytes;
    }

    try {
      this.buffer = await JBig2CCITTFaxWasmImage.decode(
        bytes,
        this.dict.get("W", "Width"),
        this.dict.get("H", "Height"),
        null,
        this.params
      );
    } catch {
      warn("CCITTFaxStream: Falling back to JS CCITTFax decoder.");
      return this.decodeImageFallback(bytes, length);
    }
    this.bufferLength = this.buffer.length;
    this.eof = true;

    return this.buffer;
  }

  decodeImageFallback(bytes, length) {
    if (this.eof) {
      return this.buffer;
    }
    const { params } = this;
    if (!bytes) {
      this.stream.reset();
      bytes = this.bytes;
    }
    let pos = 0;
    const source = {
      next() {
        return bytes[pos++] ?? -1;
      },
    };
    if (length && this.buffer.byteLength < length) {
      this.buffer = new Uint8Array(length);
    }
    this.ccittFaxDecoder = new CCITTFaxDecoder(source, params);
    let outPos = 0;
    while (!this.eof) {
      const c = this.ccittFaxDecoder.readNextChar();
      if (c === -1) {
        this.eof = true;
        break;
      }
      if (!length) {
        this.ensureBuffer(outPos + 1);
      }
      this.buffer[outPos++] = c;
    }

    this.bufferLength = this.buffer.length;
    return this.buffer.subarray(0, length || this.bufferLength);
  }
}

export { CCITTFaxStream };
