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

import { BaseException, shadow } from "../shared/util.js";
import OpenJPEG from "../../external/openjpeg/openjpeg.js";
import { Stream } from "./stream.js";
import { WasmImage } from "./wasm_image.js";

class JpxError extends BaseException {
  constructor(msg) {
    super(msg, "JpxError");
  }
}

class JpxImage extends WasmImage {
  _filename = "openjpeg.wasm";

  _noWasmFilename = "openjpeg_nowasm_fallback.js";

  static get instance() {
    return shadow(this, "instance", new JpxImage(/* trackInstance = */ true));
  }

  async decode(
    bytes,
    {
      numComponents,
      isIndexedColormap = false,
      smaskInData = false,
      reducePower = 0,
    } = {}
  ) {
    const padComponents = numComponents !== undefined;
    numComponents ??= 4;
    const module = await this._getModule(OpenJPEG);

    if (!module) {
      throw new JpxError("OpenJPEG failed to initialize");
    }
    let ptr;

    try {
      const size = bytes.length;
      ptr = module._malloc(size);
      module.writeArrayToMemory(bytes, ptr);
      const ret = module._jp2_decode(
        ptr,
        size,
        numComponents > 0 ? numComponents : 0,
        !!isIndexedColormap,
        !!smaskInData,
        reducePower,
        padComponents
      );
      if (ret) {
        const { errorMessages } = module;
        if (errorMessages) {
          delete module.errorMessages;
          throw new JpxError(errorMessages);
        }
        throw new JpxError("Unknown error");
      }
      const { imageData } = module;
      module.imageData = null;

      return imageData;
    } finally {
      if (ptr) {
        module._free(ptr);
      }
    }
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
