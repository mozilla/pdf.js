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

import { captureCalls, processPdf } from "./capture_utils.js";
import { PDF20 } from "../../src/core/crypto.js";

/**
 * Unlike `crypto.getRandomValues`, always generate the same (xorshift32) bytes,
 * such that every benchmark run gets the same inputs.
 * @param {number} length
 * @returns {Uint8Array} Deterministic pseudo-random bytes.
 */
function createRandomBytes(length) {
  const bytes = new Uint8Array(length);
  let x = 0x9e3779b9;
  for (let i = 0; i < length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    bytes[i] = x;
  }
  return bytes;
}

/**
 * @param {typeof AESBaseCipher} Cipher
 * @param {Uint8Array} key
 * @param {Uint8Array} data
 * @returns {Uint8Array} IV followed by AES-CBC ciphertext with PKCS#7 padding.
 */
function encryptAES(Cipher, key, data) {
  const pad = 16 - (data.length % 16);
  const padded = new Uint8Array(data.length + pad);
  padded.set(data);
  padded.fill(pad, data.length);
  const iv = createRandomBytes(16);
  const encrypted = new Cipher(key).encrypt(padded, iv);
  const bytes = new Uint8Array(16 + encrypted.length);
  bytes.set(iv);
  bytes.set(encrypted, 16);
  return bytes;
}

/**
 * @param {string} filename
 * @param {string} password
 * @returns {Promise<Array<Array>>} `PDF20._hash` inputs from opening the PDF.
 */
async function capturePasswordHashes(filename, password) {
  const hashes = await captureCalls(
    PDF20.prototype,
    "_hash",
    () => processPdf(filename, { pages: [], password }),
    (pdf20, args) => args.map(arg => arg.slice()),
    { before: true }
  );
  if (hashes.length === 0) {
    throw new Error(`No password hash in "${filename}".`);
  }
  return hashes;
}

export { capturePasswordHashes, createRandomBytes, encryptAES };
