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
    localStorage.setItem("pdfjs.signature", JSON.stringify(this.#signatures));
  }

  async getAll() {
    if (!this.#signatures) {
      const data = localStorage.getItem("pdfjs.signature");
      this.#signatures = data ? JSON.parse(data) : Object.create(null);
    }
    return this.#signatures;
  }

  async isFull() {
    return Object.keys(await this.getAll()).length === 5;
  }

  async create(data) {
    if (await this.isFull()) {
      return null;
    }
    const uuid = getUuid();
    this.#signatures[uuid] = data;
    this.#save();

    return uuid;
  }

  async delete(uuid) {
    const signatures = await this.getAll();
    if (!signatures[uuid]) {
      return false;
    }
    delete signatures[uuid];
    this.#save();

    return true;
  }

  async update(uuid, data) {
    const signatures = await this.getAll();
    const oldData = signatures[uuid];
    if (!oldData) {
      return false;
    }
    Object.assign(oldData, data);
    this.#save();

    return true;
  }
}

export { SignatureStorage };
