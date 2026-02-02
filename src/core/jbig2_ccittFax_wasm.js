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

import { BaseException, warn } from "../shared/util.js";
import { fetchBinaryData } from "./core_utils.js";
import JBig2 from "../../external/jbig2/jbig2.js";

class JBig2Error extends BaseException {
  constructor(msg) {
    super(msg, "Jbig2Error");
  }
}

class JBig2CCITTFaxWasmImage {
  static #buffer = null;

  static #handler = null;

  static #modulePromise = null;

  static #useWasm = true;

  static #useWorkerFetch = true;

  static #wasmUrl = null;

  static setOptions({ handler, useWasm, useWorkerFetch, wasmUrl }) {
    this.#useWasm = useWasm;
    this.#useWorkerFetch = useWorkerFetch;
    this.#wasmUrl = wasmUrl;

    if (!useWorkerFetch) {
      this.#handler = handler;
    }
  }

  static async #instantiateWasm(fallbackCallback, imports, successCallback) {
    const filename = "jbig2.wasm";
    try {
      if (!this.#buffer) {
        if (this.#useWorkerFetch) {
          this.#buffer = await fetchBinaryData(`${this.#wasmUrl}${filename}`);
        } else {
          this.#buffer = await this.#handler.sendWithPromise(
            "FetchBinaryData",
            { type: "wasmFactory", filename }
          );
        }
      }
      const results = await WebAssembly.instantiate(this.#buffer, imports);
      return successCallback(results.instance);
    } catch (reason) {
      warn(`JBig2Image#instantiateWasm: ${reason}`);
      return fallbackCallback(null);
    } finally {
      this.#handler = null;
    }
  }

  static async decode(bytes, width, height, globals, CCITTOptions) {
    if (!this.#modulePromise) {
      const { promise, resolve } = Promise.withResolvers();
      const promises = [promise];
      if (this.#useWasm) {
        promises.push(
          JBig2({
            warn,
            instantiateWasm: this.#instantiateWasm.bind(this, resolve),
          })
        );
      } else {
        resolve(null);
      }
      this.#modulePromise = Promise.race(promises);
    }
    const module = await this.#modulePromise;
    if (!module) {
      throw new JBig2Error("JBig2 failed to initialize");
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
        throw new JBig2Error("Unknown error");
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

  static cleanup() {
    this.#modulePromise = null;
  }
}

export { JBig2CCITTFaxWasmImage, JBig2Error };
