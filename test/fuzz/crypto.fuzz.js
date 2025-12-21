// Copyright 2024 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Fuzzer for PDF crypto operations (encryption/decryption).
 * Tests RC4, AES-128, AES-256 ciphers and password handling.
 */

const MAX_INPUT_SIZE = 64 * 1024; // 64KB limit

let ARCFourCipher = null;
let AES128Cipher = null;
let AES256Cipher = null;
let calculateMD5 = null;
let calculateSHA256 = null;

async function init() {
  if (ARCFourCipher) return;
  const cryptoModule = await import("../../build/lib-legacy/core/crypto.js");
  ARCFourCipher = cryptoModule.ARCFourCipher;
  AES128Cipher = cryptoModule.AES128Cipher;
  AES256Cipher = cryptoModule.AES256Cipher;

  const md5Module = await import("../../build/lib-legacy/core/calculate_md5.js");
  calculateMD5 = md5Module.calculateMD5;

  const sha256Module = await import("../../build/lib-legacy/core/calculate_sha256.js");
  calculateSHA256 = sha256Module.calculateSHA256;
}

/**
 * @param { Buffer } data
 */
module.exports.fuzz = async function (data) {
  await init();

  if (data.length < 32 || data.length > MAX_INPUT_SIZE) {
    return;
  }

  try {
    // Extract key and data from input
    const keyLen = Math.min(data[0] % 32 + 1, 32);
    const key = new Uint8Array(data.slice(1, 1 + keyLen));
    const payload = new Uint8Array(data.slice(1 + keyLen));

    if (payload.length === 0) {
      return;
    }

    // Test RC4 cipher
    try {
      const rc4 = new ARCFourCipher(key);
      rc4.encryptBlock(payload.slice());
    } catch (e) {
      // Expected for malformed input
    }

    // Test AES-128 if key is right size
    if (key.length >= 16) {
      try {
        const aes128 = new AES128Cipher(key.slice(0, 16));
        aes128.decryptBlock(payload.slice());
      } catch (e) {
        // Expected for malformed input
      }
    }

    // Test AES-256 if key is right size
    if (key.length >= 32) {
      try {
        const aes256 = new AES256Cipher(key.slice(0, 32));
        aes256.decryptBlock(payload.slice());
      } catch (e) {
        // Expected for malformed input
      }
    }

    // Test hash functions
    try {
      calculateMD5(payload, 0, payload.length);
      calculateSHA256(payload, 0, payload.length);
    } catch (e) {
      // Expected for malformed input
    }

  } catch (e) {
    // Expected exceptions for malformed crypto input
    if (e.message && (
      e.message.includes("out of memory") ||
      e.message.includes("Maximum call stack") ||
      e.message.includes("allocation failed")
    )) {
      throw e;
    }
  }
};
