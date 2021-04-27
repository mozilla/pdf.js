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
import { isDict } from "./primitives.js";
import { JpegImage } from "./jpg.js";
import { shadow } from "../shared/util.js";

/**
 * For JPEG's we use a library to decode these images and the stream behaves
 * like all the other DecodeStreams.
 */
class JpegStream extends DecodeStream {
  constructor(stream, maybeLength, params) {
    // Some images may contain 'junk' before the SOI (start-of-image) marker.
    // Note: this seems to mainly affect inline images.
    let ch;
    while ((ch = stream.getByte()) !== -1) {
      // Find the first byte of the SOI marker (0xFFD8).
      if (ch === 0xff) {
        stream.skip(-1); // Reset the stream position to the SOI.
        break;
      }
    }
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
    if (this.eof) {
      return;
    }
    const jpegOptions = {
      decodeTransform: undefined,
      colorTransform: undefined,
    };

    // Checking if values need to be transformed before conversion.
    const decodeArr = this.dict.getArray("Decode", "D");
    if (this.forceRGB && Array.isArray(decodeArr)) {
      const bitsPerComponent = this.dict.get("BitsPerComponent") || 8;
      const decodeArrLength = decodeArr.length;
      const transform = new Int32Array(decodeArrLength);
      let transformNeeded = false;
      const maxValue = (1 << bitsPerComponent) - 1;
      for (let i = 0; i < decodeArrLength; i += 2) {
        transform[i] = ((decodeArr[i + 1] - decodeArr[i]) * 256) | 0;
        transform[i + 1] = (decodeArr[i] * maxValue) | 0;
        if (transform[i] !== 256 || transform[i + 1] !== 0) {
          transformNeeded = true;
        }
      }
      if (transformNeeded) {
        jpegOptions.decodeTransform = transform;
      }
    }
    // Fetching the 'ColorTransform' entry, if it exists.
    if (isDict(this.params)) {
      const colorTransform = this.params.get("ColorTransform");
      if (Number.isInteger(colorTransform)) {
        jpegOptions.colorTransform = colorTransform;
      }
    }
    const jpegImage = new JpegImage(jpegOptions);

    jpegImage.parse(this.bytes);
    const data = jpegImage.getData({
      width: this.drawWidth,
      height: this.drawHeight,
      forceRGB: this.forceRGB,
      isSourcePDF: true,
    });
    this.buffer = data;
    this.bufferLength = data.length;
    this.eof = true;
  }
}

export { JpegStream };
