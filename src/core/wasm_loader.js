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

import { BrotliStream } from "./brotli_stream.js";
import { Stream } from "./stream.js";
import { warn } from "../shared/util.js";

// Attempt native decoding first, and fallback to the JS decoder.
async function decodeBrotli(data) {
  const stream = new BrotliStream(new Stream(data), data.length);
  return (await stream.asyncGetBytes()) ?? stream.getBytes();
}

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
    const url = this.#getWorkerUrl(context, kind, filename);
    if (
      (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) &&
      !url
    ) {
      return context.handler.sendWithPromise("FetchBinaryData", {
        kind,
        filename,
      });
    }
    const response = await this.#workerFetch(url);
    return response.bytes();
  }

  static #getWorkerUrl({ options }, kind, filename) {
    if (
      (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) &&
      !options.useWorkerFetch
    ) {
      return null;
    }
    const baseUrl = options[kind];
    if (!baseUrl) {
      throw new Error(`Ensure that the \`${kind}\` API parameter is provided.`);
    }
    return `${baseUrl}${filename}`;
  }

  static async #workerFetch(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch file "${url}" with "${response.statusText}".`
      );
    }
    return response;
  }

  static async #fetchAndCompile(context, filename, url) {
    if (
      (typeof PDFJSDev === "undefined" || !PDFJSDev.test("MOZCENTRAL")) &&
      !url
    ) {
      return WebAssembly.compile(
        await this.fetch(context, "wasmUrl", filename)
      );
    }
    const { body } = await this.#workerFetch(url);
    // Streaming compilation requires the exact MIME type, without parameters
    // (e.g. Firefox adds a charset to resource:// responses).
    return WebAssembly.compileStreaming(
      new Response(body, { headers: { "Content-Type": "application/wasm" } })
    );
  }

  /**
   * Compile a Wasm module, sharing successful compilations across documents.
   * @param {object} context - Document handler and options.
   * @param {string} filename
   * @returns {Promise<WebAssembly.Module>}
   */
  static async compile(context, filename) {
    // Check the document's worker URL before using a shared module.
    const url = this.#getWorkerUrl(context, "wasmUrl", filename);
    const cached = this.#modules.get(filename);
    if (cached) {
      // Retry with this context if the shared attempt fails.
      return cached.catch(() => this.compile(context, filename));
    }
    const promise = this.#fetchAndCompile(context, filename, url).catch(ex => {
      // Don't cache failures.
      this.#modules.delete(filename);
      throw ex;
    });
    // Share compilation between concurrent callers.
    this.#modules.set(filename, promise);
    return promise;
  }

  static async #importFallback(context, wasmUrl, filename) {
    let source;
    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
      const { body } = await this.#workerFetch(`${wasmUrl}${filename}.br`);
      source = body.pipeThrough(new DecompressionStream("brotli"));
    } else {
      const data = await this.fetch(context, "wasmUrl", `${filename}.br`);
      source = await decodeBrotli(data);
    }
    const blob = await new Response(source, {
      headers: { "Content-Type": "text/javascript" },
    }).blob();
    const url = URL.createObjectURL(blob);
    try {
      return typeof PDFJSDev === "undefined"
        ? await import(url) // eslint-disable-line no-unsanitized/method
        : await __raw_import__(url);
    } finally {
      URL.revokeObjectURL(url);
    }
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
        const module = await this.compile(context, filename);
        init(imports => new WebAssembly.Instance(module, imports).exports);
        return true;
      } catch (ex) {
        warn(`WasmLoader - "${filename}": "${ex}".`);
      }
    }
    if (wasmUrl) {
      try {
        const { default: instantiate } = await this.#importFallback(
          context,
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

export { decodeBrotli, WasmLoader };
