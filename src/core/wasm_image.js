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

import { unreachable, warn } from "../shared/util.js";
import { fetchBinaryData } from "./core_utils.js";

class WasmImage {
  static #getHandler = null;

  static #instances = new Set();

  static #useWasm = true;

  static #useWorkerFetch = true;

  static #wasmUrl = null;

  #buffer = null;

  #modulePromise = null;

  _filename = null;

  _noWasmFilename = null;

  static setOptions({ getHandler, useWasm, useWorkerFetch, wasmUrl }) {
    WasmImage.#useWasm = useWasm;
    WasmImage.#useWorkerFetch = useWorkerFetch;
    WasmImage.#wasmUrl = wasmUrl;

    if (!useWorkerFetch) {
      WasmImage.#getHandler = getHandler;
    }
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

  constructor(trackInstance = false) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === WasmImage
    ) {
      unreachable("Cannot initialize WasmImage.");
    }

    if (trackInstance) {
      // Keep track of the instances for `cleanup` purposes.
      WasmImage.#instances.add(this);
    }
  }

  async #getJsInstance(imports) {
    const { default: instantiate } = await (typeof PDFJSDev === "undefined"
      ? // eslint-disable-next-line no-unsanitized/method
        import(`../${WasmImage.#wasmUrl}${this._noWasmFilename}`)
      : __raw_import__(`${WasmImage.#wasmUrl}${this._noWasmFilename}`));
    return { exports: instantiate(imports) };
  }

  async #getWasmInstance(imports) {
    if (!this.#buffer) {
      if (WasmImage.#useWorkerFetch) {
        this.#buffer = await fetchBinaryData(
          `${WasmImage.#wasmUrl}${this._filename}`
        );
      } else {
        if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
          throw new Error("Only worker-thread fetching supported.");
        }
        this.#buffer = await WasmImage.#getHandler().sendWithPromise(
          "FetchBinaryData",
          { kind: "wasmUrl", filename: this._filename }
        );
      }
    }
    const results = await WebAssembly.instantiate(this.#buffer, imports);
    return results.instance;
  }

  async #instantiateWasm(failureCallback, imports, successCallback) {
    if (WasmImage.#useWasm) {
      try {
        return successCallback(await this.#getWasmInstance(imports));
      } catch (ex) {
        warn(`#getWasmInstance: ${ex}`);
      }
    }
    try {
      return successCallback(await this.#getJsInstance(imports));
    } catch (ex) {
      warn(`#getJsInstance: ${ex}`);
    }
    failureCallback(null);
    return null;
  }

  _getModule(ImageDecoder) {
    if (!this.#modulePromise) {
      const { promise, resolve } = Promise.withResolvers();
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
