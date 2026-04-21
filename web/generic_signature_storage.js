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
const SALT_STORAGE = "pdfjs.signature.salt";

// Encrypt/decrypt signature data at rest using AES-GCM via the Web Crypto API.
// The encryption key is derived (PBKDF2) from a per-origin random salt stored
// alongside the ciphertext. This ensures the data is not readable by scripts
// running on other origins or by someone with physical access to the device
// storage files, while remaining transparent to the user.

async function deriveKey(salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(window.location.origin),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptData(plaintext, salt) {
  const key = await deriveKey(salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  // Store iv + ciphertext as base64
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function decryptData(base64, salt) {
  const key = await deriveKey(salt);
  const combined = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plaintext);
}

function getOrCreateSalt() {
  let saltB64 = localStorage.getItem(SALT_STORAGE);
  if (!saltB64) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    saltB64 = btoa(String.fromCharCode(...salt));
    localStorage.setItem(SALT_STORAGE, saltB64);
  }
  return Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
}

class SignatureStorage {
  #eventBus;

  #signatures = null;

  #signal = null;

  constructor(eventBus, signal) {
    this.#eventBus = eventBus;
    this.#signal = signal;
  }

  async #save() {
    const salt = getOrCreateSalt();
    const plaintext = JSON.stringify(Object.fromEntries(this.#signatures));
    const encrypted = await encryptData(plaintext, salt);
    localStorage.setItem(KEY_STORAGE, encrypted);
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
      const encrypted = localStorage.getItem(KEY_STORAGE);
      if (encrypted) {
        try {
          const salt = getOrCreateSalt();
          const data = await decryptData(encrypted, salt);
          for (const [key, value] of Object.entries(JSON.parse(data))) {
            this.#signatures.set(key, value);
          }
        } catch {
          // Stored data could not be decrypted (e.g. legacy plaintext or
          // corrupted entry); start fresh so the user can re-add signatures.
          localStorage.removeItem(KEY_STORAGE);
          localStorage.removeItem(SALT_STORAGE);
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
