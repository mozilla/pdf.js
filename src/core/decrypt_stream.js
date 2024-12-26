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

const chunkSize = 512;

class DecryptStream extends DecodeStream {
  constructor(str, maybeLength, decrypt) {
    super(maybeLength);

    this.str = str;
    this.dict = str.dict;
    this.decrypt = decrypt;
    this.nextChunk = null;
    this.initialized = false;
  }

  readBlock() {
    let chunk;
    if (this.initialized) {
      chunk = this.nextChunk;
    } else {
      chunk = this.str.getBytes(chunkSize);
      this.initialized = true;
    }
    if (!chunk?.length) {
      this.eof = true;
      return;
    }
    this.nextChunk = this.str.getBytes(chunkSize);
    const hasMoreData = this.nextChunk?.length > 0;

    const decrypt = this.decrypt;
    chunk = decrypt(chunk, !hasMoreData);

    const bufferLength = this.bufferLength,
      newLength = bufferLength + chunk.length,
      buffer = this.ensureBuffer(newLength);
    buffer.set(chunk, bufferLength);
    this.bufferLength = newLength;
  }
}

export { DecryptStream };
