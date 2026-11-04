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

import { BaseException, shadow } from "../shared/util.js";
import JBig2 from "../../external/jbig2/jbig2.js";
import { WasmImage } from "./wasm_image.js";

class Jbig2Error extends BaseException {
  constructor(msg) {
    super(msg, "Jbig2Error");
  }
}

class JBig2CCITTFaxImage extends WasmImage {
  _filename = "jbig2.wasm";

  _noWasmFilename = "jbig2_nowasm_fallback.js";

  static get instance() {
    return shadow(this, "instance", new JBig2CCITTFaxImage());
  }

  async decode(bytes, width, height, globals, CCITTOptions) {
    const module = await this._getModule(JBig2);

    if (!module) {
      throw new Jbig2Error("JBig2 failed to initialize");
    }
    let ptr, globalsPtr;

    try {
      const size = bytes.length;
      ptr = module._malloc(size);
      module.writeArrayToMemory(bytes, ptr);

      if (CCITTOptions) {
        module._ccitt_decode(
          ptr,
          size,
          width,
          height,
          CCITTOptions.K,
          CCITTOptions.EndOfLine ? 1 : 0,
          CCITTOptions.EncodedByteAlign ? 1 : 0,
          CCITTOptions.BlackIs1 ? 1 : 0,
          CCITTOptions.Columns,
          CCITTOptions.Rows
        );
      } else {
        const globalsSize = globals ? globals.length : 0;
        if (globalsSize > 0) {
          globalsPtr = module._malloc(globalsSize);
          module.writeArrayToMemory(globals, globalsPtr);
        }
        module._jbig2_decode(ptr, size, width, height, globalsPtr, globalsSize);
      }
      if (!module.imageData) {
        throw new Jbig2Error("Unknown error");
      }
      const { imageData } = module;
      module.imageData = null;

      return imageData;
    } finally {
      if (ptr) {
        module._free(ptr);
      }
      if (globalsPtr) {
        module._free(globalsPtr);
      }
    }
  }
}

export { JBig2CCITTFaxImage, Jbig2Error };
