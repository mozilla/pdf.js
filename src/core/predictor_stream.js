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
import { FormatError } from "../shared/util.js";
import { isDict } from "./primitives.js";

class PredictorStream extends DecodeStream {
  constructor(str, maybeLength, params) {
    super(maybeLength);

    if (!isDict(params)) {
      return str; // no prediction
    }
    const predictor = (this.predictor = params.get("Predictor") || 1);

    if (predictor <= 1) {
      return str; // no prediction
    }
    if (predictor !== 2 && (predictor < 10 || predictor > 15)) {
      throw new FormatError(`Unsupported predictor: ${predictor}`);
    }

    if (predictor === 2) {
      this.readBlock = this.readBlockTiff;
    } else {
      this.readBlock = this.readBlockPng;
    }

    this.str = str;
    this.dict = str.dict;

    const colors = (this.colors = params.get("Colors") || 1);
    const bits = (this.bits = params.get("BitsPerComponent") || 8);
    const columns = (this.columns = params.get("Columns") || 1);

    this.pixBytes = (colors * bits + 7) >> 3;
    this.rowBytes = (columns * colors * bits + 7) >> 3;

    return this;
  }

  readBlockTiff() {
    const rowBytes = this.rowBytes;

    const bufferLength = this.bufferLength;
    const buffer = this.ensureBuffer(bufferLength + rowBytes);

    const bits = this.bits;
    const colors = this.colors;

    const rawBytes = this.str.getBytes(rowBytes);
    this.eof = !rawBytes.length;
    if (this.eof) {
      return;
    }

    let inbuf = 0,
      outbuf = 0;
    let inbits = 0,
      outbits = 0;
    let pos = bufferLength;
    let i;

    if (bits === 1 && colors === 1) {
      // Optimized version of the loop in the "else"-branch
      // for 1 bit-per-component and 1 color TIFF images.
      for (i = 0; i < rowBytes; ++i) {
        let c = rawBytes[i] ^ inbuf;
        c ^= c >> 1;
        c ^= c >> 2;
        c ^= c >> 4;
        inbuf = (c & 1) << 7;
        buffer[pos++] = c;
      }
    } else if (bits === 8) {
      for (i = 0; i < colors; ++i) {
        buffer[pos++] = rawBytes[i];
      }
      for (; i < rowBytes; ++i) {
        buffer[pos] = buffer[pos - colors] + rawBytes[i];
        pos++;
      }
    } else if (bits === 16) {
      const bytesPerPixel = colors * 2;
      for (i = 0; i < bytesPerPixel; ++i) {
        buffer[pos++] = rawBytes[i];
      }
      for (; i < rowBytes; i += 2) {
        const sum =
          ((rawBytes[i] & 0xff) << 8) +
          (rawBytes[i + 1] & 0xff) +
          ((buffer[pos - bytesPerPixel] & 0xff) << 8) +
          (buffer[pos - bytesPerPixel + 1] & 0xff);
        buffer[pos++] = (sum >> 8) & 0xff;
        buffer[pos++] = sum & 0xff;
      }
    } else {
      const compArray = new Uint8Array(colors + 1);
      const bitMask = (1 << bits) - 1;
      let j = 0,
        k = bufferLength;
      const columns = this.columns;
      for (i = 0; i < columns; ++i) {
        for (let kk = 0; kk < colors; ++kk) {
          if (inbits < bits) {
            inbuf = (inbuf << 8) | (rawBytes[j++] & 0xff);
            inbits += 8;
          }
          compArray[kk] =
            (compArray[kk] + (inbuf >> (inbits - bits))) & bitMask;
          inbits -= bits;
          outbuf = (outbuf << bits) | compArray[kk];
          outbits += bits;
          if (outbits >= 8) {
            buffer[k++] = (outbuf >> (outbits - 8)) & 0xff;
            outbits -= 8;
          }
        }
      }
      if (outbits > 0) {
        buffer[k++] =
          (outbuf << (8 - outbits)) + (inbuf & ((1 << (8 - outbits)) - 1));
      }
    }
    this.bufferLength += rowBytes;
  }

  readBlockPng() {
    const rowBytes = this.rowBytes;
    const pixBytes = this.pixBytes;

    const predictor = this.str.getByte();
    const rawBytes = this.str.getBytes(rowBytes);
    this.eof = !rawBytes.length;
    if (this.eof) {
      return;
    }

    const bufferLength = this.bufferLength;
    const buffer = this.ensureBuffer(bufferLength + rowBytes);

    let prevRow = buffer.subarray(bufferLength - rowBytes, bufferLength);
    if (prevRow.length === 0) {
      prevRow = new Uint8Array(rowBytes);
    }

    let i,
      j = bufferLength,
      up,
      c;
    switch (predictor) {
      case 0:
        for (i = 0; i < rowBytes; ++i) {
          buffer[j++] = rawBytes[i];
        }
        break;
      case 1:
        for (i = 0; i < pixBytes; ++i) {
          buffer[j++] = rawBytes[i];
        }
        for (; i < rowBytes; ++i) {
          buffer[j] = (buffer[j - pixBytes] + rawBytes[i]) & 0xff;
          j++;
        }
        break;
      case 2:
        for (i = 0; i < rowBytes; ++i) {
          buffer[j++] = (prevRow[i] + rawBytes[i]) & 0xff;
        }
        break;
      case 3:
        for (i = 0; i < pixBytes; ++i) {
          buffer[j++] = (prevRow[i] >> 1) + rawBytes[i];
        }
        for (; i < rowBytes; ++i) {
          buffer[j] =
            (((prevRow[i] + buffer[j - pixBytes]) >> 1) + rawBytes[i]) & 0xff;
          j++;
        }
        break;
      case 4:
        // we need to save the up left pixels values. the simplest way
        // is to create a new buffer
        for (i = 0; i < pixBytes; ++i) {
          up = prevRow[i];
          c = rawBytes[i];
          buffer[j++] = up + c;
        }
        for (; i < rowBytes; ++i) {
          up = prevRow[i];
          const upLeft = prevRow[i - pixBytes];
          const left = buffer[j - pixBytes];
          const p = left + up - upLeft;

          let pa = p - left;
          if (pa < 0) {
            pa = -pa;
          }
          let pb = p - up;
          if (pb < 0) {
            pb = -pb;
          }
          let pc = p - upLeft;
          if (pc < 0) {
            pc = -pc;
          }

          c = rawBytes[i];
          if (pa <= pb && pa <= pc) {
            buffer[j++] = left + c;
          } else if (pb <= pc) {
            buffer[j++] = up + c;
          } else {
            buffer[j++] = upLeft + c;
          }
        }
        break;
      default:
        throw new FormatError(`Unsupported predictor: ${predictor}`);
    }
    this.bufferLength += rowBytes;
  }
}

export { PredictorStream };
