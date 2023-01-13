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

class LZWStream extends DecodeStream {
  constructor(str, maybeLength, earlyChange) {
    super(maybeLength);

    this.str = str;
    this.dict = str.dict;
    this.cachedData = 0;
    this.bitsCached = 0;

    const maxLzwDictionarySize = 4096;
    const lzwState = {
      earlyChange,
      codeLength: 9,
      nextCode: 258,
      dictionaryValues: new Uint8Array(maxLzwDictionarySize),
      dictionaryLengths: new Uint16Array(maxLzwDictionarySize),
      dictionaryPrevCodes: new Uint16Array(maxLzwDictionarySize),
      currentSequence: new Uint8Array(maxLzwDictionarySize),
      currentSequenceLength: 0,
    };
    for (let i = 0; i < 256; ++i) {
      lzwState.dictionaryValues[i] = i;
      lzwState.dictionaryLengths[i] = 1;
    }
    this.lzwState = lzwState;
  }

  readBits(n) {
    let bitsCached = this.bitsCached;
    let cachedData = this.cachedData;
    while (bitsCached < n) {
      const c = this.str.getByte();
      if (c === -1) {
        this.eof = true;
        return null;
      }
      cachedData = (cachedData << 8) | c;
      bitsCached += 8;
    }
    this.bitsCached = bitsCached -= n;
    this.cachedData = cachedData;
    this.lastCode = null;
    return (cachedData >>> bitsCached) & ((1 << n) - 1);
  }

  readBlock() {
    const blockSize = 512,
      decodedSizeDelta = blockSize;
    let estimatedDecodedSize = blockSize * 2;
    let i, j, q;

    const lzwState = this.lzwState;
    if (!lzwState) {
      return; // eof was found
    }

    const earlyChange = lzwState.earlyChange;
    let nextCode = lzwState.nextCode;
    const dictionaryValues = lzwState.dictionaryValues;
    const dictionaryLengths = lzwState.dictionaryLengths;
    const dictionaryPrevCodes = lzwState.dictionaryPrevCodes;
    let codeLength = lzwState.codeLength;
    let prevCode = lzwState.prevCode;
    const currentSequence = lzwState.currentSequence;
    let currentSequenceLength = lzwState.currentSequenceLength;

    let decodedLength = 0;
    let currentBufferLength = this.bufferLength;
    let buffer = this.ensureBuffer(this.bufferLength + estimatedDecodedSize);

    for (i = 0; i < blockSize; i++) {
      const code = this.readBits(codeLength);
      const hasPrev = currentSequenceLength > 0;
      if (code < 256) {
        currentSequence[0] = code;
        currentSequenceLength = 1;
      } else if (code >= 258) {
        if (code < nextCode) {
          currentSequenceLength = dictionaryLengths[code];
          for (j = currentSequenceLength - 1, q = code; j >= 0; j--) {
            currentSequence[j] = dictionaryValues[q];
            q = dictionaryPrevCodes[q];
          }
        } else {
          currentSequence[currentSequenceLength++] = currentSequence[0];
        }
      } else if (code === 256) {
        codeLength = 9;
        nextCode = 258;
        currentSequenceLength = 0;
        continue;
      } else {
        this.eof = true;
        delete this.lzwState;
        break;
      }

      if (hasPrev) {
        dictionaryPrevCodes[nextCode] = prevCode;
        dictionaryLengths[nextCode] = dictionaryLengths[prevCode] + 1;
        dictionaryValues[nextCode] = currentSequence[0];
        nextCode++;
        codeLength =
          (nextCode + earlyChange) & (nextCode + earlyChange - 1)
            ? codeLength
            : Math.min(
                Math.log(nextCode + earlyChange) / 0.6931471805599453 + 1,
                12
              ) | 0;
      }
      prevCode = code;

      decodedLength += currentSequenceLength;
      if (estimatedDecodedSize < decodedLength) {
        do {
          estimatedDecodedSize += decodedSizeDelta;
        } while (estimatedDecodedSize < decodedLength);
        buffer = this.ensureBuffer(this.bufferLength + estimatedDecodedSize);
      }
      for (j = 0; j < currentSequenceLength; j++) {
        buffer[currentBufferLength++] = currentSequence[j];
      }
    }
    lzwState.nextCode = nextCode;
    lzwState.codeLength = codeLength;
    lzwState.prevCode = prevCode;
    lzwState.currentSequenceLength = currentSequenceLength;

    this.bufferLength = currentBufferLength;
  }
}

export { LZWStream };
