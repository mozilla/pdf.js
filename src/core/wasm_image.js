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
  static #handler = null;

  static #instances = new Set();

  static #useWasm = true;

  static #useWorkerFetch = true;

  static #wasmUrl = null;

  #buffer = null;

  #modulePromise = null;

  _filename = null;

  _noWasmFilename = null;

  static setOptions({ handler, useWasm, useWorkerFetch, wasmUrl }) {
    WasmImage.#useWasm = useWasm;
    WasmImage.#useWorkerFetch = useWorkerFetch;
    WasmImage.#wasmUrl = wasmUrl;

    if (!useWorkerFetch) {
      WasmImage.#handler = handler;
    }
  }

  // eslint-disable-next-line getter-return
  static get instance() {
    /* istanbul ignore next */
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
      /* istanbul ignore next */
      unreachable("Cannot initialize WasmImage.");
    }

    if (trackInstance) {
      // Keep track of the instances for `cleanup` purposes.
      WasmImage.#instances.add(this);
    }
  }

  async #getJsModule(fallbackCallback) {
    let instance = null;
    try {
      const mod = await (typeof PDFJSDev === "undefined"
        ? // eslint-disable-next-line no-unsanitized/method
          import(`../${WasmImage.#wasmUrl}${this._noWasmFilename}`)
        : __raw_import__(`${WasmImage.#wasmUrl}${this._noWasmFilename}`));
      instance = mod.default();
    } catch (ex) {
      warn(`#getJsModule: ${ex}`);
    }
    fallbackCallback(instance);
  }

  async #instantiateWasm(fallbackCallback, imports, successCallback) {
    try {
      if (!this.#buffer) {
        if (WasmImage.#useWorkerFetch) {
          this.#buffer = await fetchBinaryData(
            `${WasmImage.#wasmUrl}${this._filename}`
          );
        } else {
          if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
            throw new Error("Only worker-thread fetching supported.");
          }
          this.#buffer = await WasmImage.#handler.sendWithPromise(
            "FetchBinaryData",
            { kind: "wasmUrl", filename: this._filename }
          );
        }
      }
      const results = await WebAssembly.instantiate(this.#buffer, imports);
      return successCallback(results.instance);
    } catch (ex) {
      warn(`#instantiateWasm: ${ex}`);

      this.#getJsModule(fallbackCallback);
      return null;
    }
  }

  _getModule(ImageDecoder) {
    if (!this.#modulePromise) {
      const { promise, resolve } = Promise.withResolvers();
      const promises = [promise];
      if (!WasmImage.#useWasm) {
        this.#getJsModule(resolve);
      } else {
        promises.push(
          ImageDecoder({
            warn,
            instantiateWasm: this.#instantiateWasm.bind(this, resolve),
          })
        );
      }
      this.#modulePromise = Promise.race(promises);
    }
    return this.#modulePromise;
  }

  async decode(bytes, _params) {
    /* istanbul ignore next */
    unreachable("Abstract method `decode` called");
  }
}

export { WasmImage };
