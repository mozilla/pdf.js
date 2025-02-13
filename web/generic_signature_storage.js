/* Copyright 2025 Mozilla Foundation
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

import { getUuid } from "pdfjs-lib";

class SignatureStorage {
  // TODO: Encrypt the data in using a password and add a UI for entering it.
  // We could use the Web Crypto API for this (see https://bradyjoslin.com/blog/encryption-webcrypto/
  // for an example).

  #signatures = null;

  #save() {
    localStorage.setItem(
      "pdfjs.signature",
      JSON.stringify(Object.fromEntries(this.#signatures.entries()))
    );
  }

  async getAll() {
    if (!this.#signatures) {
      this.#signatures = new Map();
      const data = localStorage.getItem("pdfjs.signature");
      if (data) {
        for (const [key, value] of Object.entries(JSON.parse(data))) {
          this.#signatures.set(key, value);
        }
      }
    }
    return this.#signatures;
  }

  async isFull() {
    // Only allow 5 signatures to be saved.
    return (await this.getAll()).size === 5;
  }

  async create(data) {
    if (await this.isFull()) {
      return null;
    }
    const uuid = getUuid();
    this.#signatures.set(uuid, data);
    this.#save();

    return uuid;
  }

  async delete(uuid) {
    const signatures = await this.getAll();
    if (!signatures.has(uuid)) {
      return false;
    }
    signatures.delete(uuid);
    this.#save();

    return true;
  }

  async update(uuid, data) {
    const signatures = await this.getAll();
    const oldData = signatures.get(uuid);
    if (!oldData) {
      return false;
    }
    Object.assign(oldData, data);
    this.#save();

    return true;
  }
}

export { SignatureStorage };
