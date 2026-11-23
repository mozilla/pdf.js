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

  #modulePromises = new WeakMap();

  // eslint-disable-next-line getter-return
  static get instance() {
    unreachable("Abstract getter `instance` accessed");
  }

  static cleanup(context) {
    for (const instance of WasmImage.#instances) {
      instance.#modulePromises.delete(context);
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

  async #instantiateWasm(context, failureCallback, imports, successCallback) {
    const loaded = await WasmLoader.load(
      context,
      this._filename,
      this._noWasmFilename,
      instantiate => successCallback({ exports: instantiate(imports) })
    );
    if (!loaded) {
      failureCallback(null);
    }
  }

  _getModule(context, loadDecoder) {
    return this.#modulePromises.getOrInsertComputed(context, () => {
      const { promise, resolve } = createPromiseCapability();
      return Promise.race([
        promise,
        loadDecoder().then(({ default: createDecoder }) =>
          createDecoder({
            warn,
            instantiateWasm: this.#instantiateWasm.bind(this, context, resolve),
          })
        ),
      ]);
    });
  }

  async decode(context, bytes, _params) {
    unreachable("Abstract method `decode` called");
  }
}

export { WasmImage };
