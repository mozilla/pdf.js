/* Copyright 2015 Mozilla Foundation
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

import { stringToBytes, unreachable } from "../shared/util.js";
import { fetchData } from "./dom_utils.js";

class BaseBinaryDataFactory {
  #errorStr = Object.freeze({
    cMapUrl: "CMap",
    standardFontDataUrl: "font",
    wasmUrl: "wasm",
  });

  constructor({ cMapUrl = null, standardFontDataUrl = null, wasmUrl = null }) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === BaseBinaryDataFactory
    ) {
      unreachable("Cannot initialize BaseBinaryDataFactory.");
    }
    this.cMapUrl = cMapUrl;
    this.standardFontDataUrl = standardFontDataUrl;
    this.wasmUrl = wasmUrl;
  }

  async fetch({ kind, filename }) {
    switch (kind) {
      case "cMapUrl":
      case "standardFontDataUrl":
      case "wasmUrl":
        break;
      default:
        unreachable(`Not implemented: ${kind}`);
    }
    const baseUrl = this[kind];
    if (!baseUrl) {
      throw new Error(`Ensure that the \`${kind}\` API parameter is provided.`);
    }
    const url = `${baseUrl}${filename}`;

    return this._fetch(url, kind).catch(reason => {
      throw new Error(`Unable to load ${this.#errorStr[kind]} data at: ${url}`);
    });
  }

  /**
   * @ignore
   * @returns {Promise<Uint8Array>}
   */
  async _fetch(url, kind) {
    unreachable("Abstract method `_fetch` called.");
  }
}

class DOMBinaryDataFactory extends BaseBinaryDataFactory {
  /**
   * @ignore
   */
  async _fetch(url, kind) {
    const type =
      kind === "cMapUrl" && !url.endsWith(".bcmap") ? "text" : "bytes";
    const data = await fetchData(url, type);
    return data instanceof Uint8Array ? data : stringToBytes(data);
  }
}

export { BaseBinaryDataFactory, DOMBinaryDataFactory };
