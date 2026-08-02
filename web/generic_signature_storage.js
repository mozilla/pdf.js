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

const KEY_STORAGE = "pdfjs.signature";
const KEY_CRYPTO = "pdfjs.signature.key";

class SignatureStorage {
  #eventBus;

  #key = null;

  #signatures = null;

  #signal = null;

  constructor(eventBus, signal) {
    this.#eventBus = eventBus;
    this.#signal = signal;
  }

  async #getKey() {
    if (this.#key) {
      return this.#key;
    }
    const stored = localStorage.getItem(KEY_CRYPTO);
    if (stored) {
      const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
      this.#key = await crypto.subtle.importKey(
        "raw",
        raw,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
      );
    } else {
      this.#key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );
      const exported = await crypto.subtle.exportKey("raw", this.#key);
      localStorage.setItem(
        KEY_CRYPTO,
        btoa(String.fromCharCode(...new Uint8Array(exported)))
      );
    }
    return this.#key;
  }

  async #save() {
    const key = await this.#getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(
      JSON.stringify(Object.fromEntries(this.#signatures))
    );
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoded
    );
    const payload = new Uint8Array(iv.length + ciphertext.byteLength);
    payload.set(iv, 0);
    payload.set(new Uint8Array(ciphertext), iv.length);
    localStorage.setItem(
      KEY_STORAGE,
      btoa(String.fromCharCode(...payload))
    );
  }

  async getAll() {
    if (this.#signal) {
      window.addEventListener(
        "storage",
        ({ key }) => {
          if (key === KEY_STORAGE) {
            this.#signatures = null;
            this.#eventBus?.dispatch("storedsignatureschanged", {
              source: this,
            });
          }
        },
        { signal: this.#signal }
      );
      this.#signal = null;
    }
    if (!this.#signatures) {
      this.#signatures = new Map();
      const data = localStorage.getItem(KEY_STORAGE);
      if (data) {
        try {
          const cryptoKey = await this.#getKey();
          const payload = Uint8Array.from(atob(data), c => c.charCodeAt(0));
          const iv = payload.slice(0, 12);
          const ciphertext = payload.slice(12);
          const plaintext = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            cryptoKey,
            ciphertext
          );
          const parsed = JSON.parse(new TextDecoder().decode(plaintext));
          for (const [key, value] of Object.entries(parsed)) {
            this.#signatures.set(key, value);
          }
        } catch {
          // Corrupted or unreadable data — start fresh.
          localStorage.removeItem(KEY_STORAGE);
        }
      }
    }
    return this.#signatures;
  }

  async isFull() {
    // Only allow 5 signatures to be saved.
    return (await this.size()) === 5;
  }

  async size() {
    return (await this.getAll()).size;
  }

  async create(data) {
    if (await this.isFull()) {
      return null;
    }
    const uuid = getUuid();
    this.#signatures.set(uuid, data);
    await this.#save();

    return uuid;
  }

  async delete(uuid) {
    const signatures = await this.getAll();
    if (!signatures.has(uuid)) {
      return false;
    }
    signatures.delete(uuid);
    await this.#save();

    return true;
  }
}

export { SignatureStorage };
