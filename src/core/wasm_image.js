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

import { createPromiseCapability, unreachable, warn } from "../shared/util.js";
import { WasmLoader } from "./wasm_loader.js";

class WasmImage {
  static #instances = new Set();

  static #options = { useWasm: true, useWorkerFetch: true, wasmUrl: null };

  #modulePromise = null;

  static setOptions({ getHandler, useWasm, useWorkerFetch, wasmUrl }) {
    WasmImage.#options = { getHandler, useWasm, useWorkerFetch, wasmUrl };
  }

  // eslint-disable-next-line getter-return
  static get instance() {
    unreachable("Abstract getter `instance` accessed");
  }

  static cleanup() {
    for (const instance of WasmImage.#instances) {
      instance.#modulePromise = null;
    }
  }

  constructor(filename, noWasmFilename) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === WasmImage
    ) {
      unreachable("Cannot initialize WasmImage.");
    }
    this._filename = filename;
    this._noWasmFilename = noWasmFilename;
    // Keep track of the instances for `cleanup` purposes.
    WasmImage.#instances.add(this);
  }

  async #instantiateWasm(failureCallback, imports, successCallback) {
    const loaded = await WasmLoader.load(
      {
        handler: WasmImage.#options.getHandler?.(),
        options: WasmImage.#options,
      },
      this._filename,
      this._noWasmFilename,
      instantiate => successCallback({ exports: instantiate(imports) })
    );
    if (!loaded) {
      failureCallback(null);
    }
  }

  _getModule(ImageDecoder) {
    if (!this.#modulePromise) {
      const { promise, resolve } = createPromiseCapability();
      this.#modulePromise = Promise.race([
        promise,
        ImageDecoder({
          warn,
          instantiateWasm: this.#instantiateWasm.bind(this, resolve),
        }),
      ]);
    }
    return this.#modulePromise;
  }

  async decode(bytes, _params) {
    unreachable("Abstract method `decode` called");
  }
}

export { WasmImage };
