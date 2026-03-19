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

import { deprecated, fetchData } from "./display_utils.js";
import { stringToBytes, unreachable } from "../shared/util.js";

class BaseBinaryDataFactory {
  constructor({
    cMapUrl = null,
    cMapPacked = true,
    standardFontDataUrl = null,
    wasmUrl = null,
    src = null, // TODO: Remove after a suitable number of releases.
  }) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === BaseBinaryDataFactory
    ) {
      unreachable("Cannot initialize BaseBinaryDataFactory.");
    }
    this.cMapUrl = cMapUrl;
    this.cMapPacked = cMapPacked;
    this.standardFontDataUrl = standardFontDataUrl;
    this.wasmUrl = wasmUrl;

    // TODO begin: Remove after a suitable number of releases.
    if (!src || src.BinaryDataFactory) {
      // The user provided a custom `BinaryDataFactory`, avoid initializing
      // any deprecated fallback factories below.
      return;
    }
    if (src.CMapReaderFactory) {
      deprecated(
        "Replace the `CMapReaderFactory` API parameter with `BinaryDataFactory`."
      );
      this._cMapReaderFactory = new src.CMapReaderFactory({
        baseUrl: cMapUrl,
        isCompressed: cMapPacked,
      });
    }
    if (src.StandardFontDataFactory) {
      deprecated(
        "Replace the `StandardFontDataFactory` API parameter with `BinaryDataFactory`."
      );
      this._standardFontDataFactory = new src.StandardFontDataFactory({
        baseUrl: standardFontDataUrl,
      });
    }
    if (src.WasmFactory) {
      deprecated(
        "Replace the `WasmFactory` API parameter with `BinaryDataFactory`."
      );
      this._wasmFactory = new src.WasmFactory({ baseUrl: wasmUrl });
    }
    // TODO end: Remove after a suitable number of releases.
  }

  async fetch(data) {
    switch (data.kind) {
      case "cMap":
        if (this._cMapReaderFactory) {
          return this._cMapReaderFactory.fetch(data);
        }
        return this.#fetchCMap(data);
      case "standardFontData":
        if (this._standardFontDataFactory) {
          return this._standardFontDataFactory.fetch(data);
        }
        return this.#fetchStandardFontData(data);
      case "wasm":
        if (this._wasmFactory) {
          return this._wasmFactory.fetch(data);
        }
        return this.#fetchWasm(data);
    }
    throw new Error(`Not implemented: ${data.kind}.`);
  }

  /**
   * @ignore
   * @returns {Promise<Uint8Array>}
   */
  async _fetch(url, type) {
    unreachable("Abstract method `_fetch` called.");
  }

  async #fetchCMap({ name }) {
    if (!this.cMapUrl) {
      throw new Error(
        "Ensure that the `cMapUrl` and `cMapPacked` API parameters are provided."
      );
    }
    const url = this.cMapUrl + name + (this.cMapPacked ? ".bcmap" : "");

    return this._fetch(url, /* type = */ this.cMapPacked ? "bytes" : "text")
      .then(cMapData => ({ cMapData, isCompressed: this.cMapPacked }))
      .catch(reason => {
        throw new Error(
          `Unable to load ${this.cMapPacked ? "binary " : ""}CMap at: ${url}`
        );
      });
  }

  async #fetchStandardFontData({ filename }) {
    if (!this.standardFontDataUrl) {
      throw new Error(
        "Ensure that the `standardFontDataUrl` API parameter is provided."
      );
    }
    const url = `${this.standardFontDataUrl}${filename}`;

    return this._fetch(url, /* type = */ "bytes").catch(reason => {
      throw new Error(`Unable to load font data at: ${url}`);
    });
  }

  async #fetchWasm({ filename }) {
    if (!this.wasmUrl) {
      throw new Error("Ensure that the `wasmUrl` API parameter is provided.");
    }
    const url = `${this.wasmUrl}${filename}`;

    return this._fetch(url, /* type = */ "bytes").catch(reason => {
      throw new Error(`Unable to load wasm data at: ${url}`);
    });
  }
}

class DOMBinaryDataFactory extends BaseBinaryDataFactory {
  /**
   * @ignore
   */
  async _fetch(url, type) {
    const data = await fetchData(url, type);
    return data instanceof Uint8Array ? data : stringToBytes(data);
  }
}

export { BaseBinaryDataFactory, DOMBinaryDataFactory };
