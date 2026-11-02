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

import { isNodeJS, warn } from "../shared/util.js";
import { fetchBinaryData } from "./core_utils.js";

class WasmLoader {
  static #modules = new Map();

  /**
   * Fetch a binary file in the worker or via the main thread.
   * @param {object} context - Document handler and options.
   * @param {string} kind - Base URL option name.
   * @param {string} filename
   * @returns {Promise<Uint8Array>}
   */
  static async fetch(context, kind, filename) {
    const { handler, options } = context;
    if (options.useWorkerFetch) {
      return fetchBinaryData(`${options[kind]}${filename}`);
    }
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
      throw new Error("Only worker-thread fetching supported.");
    }
    return handler.sendWithPromise("FetchBinaryData", { kind, filename });
  }

  static #compile(context, filename) {
    const cached = this.#modules.get(filename);
    if (cached) {
      // Retry with this context if the shared attempt fails.
      return cached.catch(() => this.#compile(context, filename));
    }
    const promise = this.fetch(context, "wasmUrl", filename)
      .then(bytes => WebAssembly.compile(bytes))
      .catch(ex => {
        // Don't cache failures.
        this.#modules.delete(filename);
        throw ex;
      });
    // Share compilation between concurrent callers.
    this.#modules.set(filename, promise);
    return promise;
  }

  static #importFallback(wasmUrl, filename) {
    if (typeof PDFJSDev === "undefined") {
      // eslint-disable-next-line no-unsanitized/method
      return import(`../${wasmUrl}${filename}`);
    }
    if (
      PDFJSDev.test("GENERIC") &&
      isNodeJS &&
      !/^[a-z][a-z0-9\-+.]+:/i.test(wasmUrl)
    ) {
      // eslint-disable-next-line no-undef
      wasmUrl = process.getBuiltinModule("url").pathToFileURL(wasmUrl).href;
    }
    return __raw_import__(`${wasmUrl}${filename}`);
  }

  /**
   * Initialize a Wasm module or its JS fallback.
   * @param {object} context - Document handler and options.
   * @param {string} filename - Wasm file.
   * @param {string} noWasmFilename - JS fallback file.
   * @param {Function} init - Receives `instantiate(imports) => exports`.
   * @returns {Promise<boolean>} Whether `init` was called without throwing.
   */
  static async load(context, filename, noWasmFilename, init) {
    const { useWasm, wasmUrl } = context.options;
    if (useWasm) {
      try {
        const module = await this.#compile(context, filename);
        init(imports => new WebAssembly.Instance(module, imports).exports);
        return true;
      } catch (ex) {
        warn(`WasmLoader - "${filename}": "${ex}".`);
      }
    }
    if (wasmUrl) {
      try {
        const { default: instantiate } = await this.#importFallback(
          wasmUrl,
          noWasmFilename
        );
        init(instantiate);
        return true;
      } catch (ex) {
        warn(`WasmLoader - "${noWasmFilename}": "${ex}".`);
      }
    }
    return false;
  }
}

export { WasmLoader };
