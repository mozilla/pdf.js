/* Copyright 2024 Mozilla Foundation
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

import { BaseException, warn } from "../shared/util.js";
import OpenJPEG from "../../external/openjpeg/openjpeg.js";
import { Stream } from "./stream.js";

class JpxError extends BaseException {
  constructor(msg) {
    super(msg, "JpxError");
  }
}

class JpxImage {
  static #module = null;

  static decode(data, decoderOptions) {
    decoderOptions ||= {};
    this.#module ||= OpenJPEG({ warn });
    const imageData = this.#module.decode(data, decoderOptions);
    if (typeof imageData === "string") {
      throw new JpxError(imageData);
    }
    return imageData;
  }

  static cleanup() {
    this.#module = null;
  }

  static parseImageProperties(stream) {
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("IMAGE_DECODERS")) {
      if (stream instanceof ArrayBuffer || ArrayBuffer.isView(stream)) {
        stream = new Stream(stream);
      } else {
        throw new JpxError("Invalid data format, must be a TypedArray.");
      }
    }
    // No need to use OpenJPEG here since we're only getting very basic
    // information which are located in the first bytes of the file.
    let newByte = stream.getByte();
    while (newByte >= 0) {
      const oldByte = newByte;
      newByte = stream.getByte();
      const code = (oldByte << 8) | newByte;
      // Image and tile size (SIZ)
      if (code === 0xff51) {
        stream.skip(4);
        const Xsiz = stream.getInt32() >>> 0; // Byte 4
        const Ysiz = stream.getInt32() >>> 0; // Byte 8
        const XOsiz = stream.getInt32() >>> 0; // Byte 12
        const YOsiz = stream.getInt32() >>> 0; // Byte 16
        stream.skip(16);
        const Csiz = stream.getUint16(); // Byte 36
        return {
          width: Xsiz - XOsiz,
          height: Ysiz - YOsiz,
          // Results are always returned as `Uint8ClampedArray`s.
          bitsPerComponent: 8,
          componentsCount: Csiz,
        };
      }
    }
    throw new JpxError("No size marker found in JPX stream");
  }
}

export { JpxError, JpxImage };
