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
import { fetchData } from "./display_utils.js";

class BaseCMapReaderFactory {
  constructor({ baseUrl = null, isCompressed = true }) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === BaseCMapReaderFactory
    ) {
      unreachable("Cannot initialize BaseCMapReaderFactory.");
    }
    this.baseUrl = baseUrl;
    this.isCompressed = isCompressed;
  }

  async fetch({ name }) {
    if (!this.baseUrl) {
      throw new Error(
        "Ensure that the `cMapUrl` and `cMapPacked` API parameters are provided."
      );
    }
    if (!name) {
      throw new Error("CMap name must be specified.");
    }
    const url = this.baseUrl + name + (this.isCompressed ? ".bcmap" : "");

    return this._fetch(url)
      .then(cMapData => ({ cMapData, isCompressed: this.isCompressed }))
      .catch(reason => {
        throw new Error(
          `Unable to load ${this.isCompressed ? "binary " : ""}CMap at: ${url}`
        );
      });
  }

  /**
   * @ignore
   * @returns {Promise<Uint8Array>}
   */
  async _fetch(url) {
    unreachable("Abstract method `_fetch` called.");
  }
}

class DOMCMapReaderFactory extends BaseCMapReaderFactory {
  /**
   * @ignore
   */
  async _fetch(url) {
    const data = await fetchData(
      url,
      /* type = */ this.isCompressed ? "arraybuffer" : "text"
    );
    return data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : stringToBytes(data);
  }
}

export { BaseCMapReaderFactory, DOMCMapReaderFactory };
