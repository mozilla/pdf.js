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

import {
  AES128Cipher,
  AES256Cipher,
  ARCFourCipher,
  PDF20,
} from "../../src/core/crypto.js";
import { bench, describe } from "vitest";
import {
  capturePasswordHashes,
  createRandomBytes,
  encryptAES,
} from "./crypto_utils.js";
import { calculateSHA512 } from "../../src/core/calculate_sha_other.js";
import { DecryptStream } from "../../src/core/decrypt_stream.js";
import { Stream } from "../../src/core/stream.js";

const DATA = createRandomBytes(2 ** 16);
const KEY_128 = createRandomBytes(16);
const KEY_256 = createRandomBytes(32);
const IV = createRandomBytes(16);

const STREAMS = [
  {
    kind: "AES-128",
    createCipher: () => new AES128Cipher(KEY_128),
    bytes: encryptAES(AES128Cipher, KEY_128, DATA),
  },
  {
    kind: "AES-256",
    createCipher: () => new AES256Cipher(KEY_256),
    bytes: encryptAES(AES256Cipher, KEY_256, DATA),
  },
  {
    kind: "RC4",
    createCipher: () => new ARCFourCipher(KEY_128),
    bytes: new ARCFourCipher(KEY_128).encrypt(DATA),
  },
];

const PASSWORD_HASHES = await capturePasswordHashes("issue6010_1.pdf", "abc");

describe("crypto", () => {
  for (const { kind, createCipher, bytes } of STREAMS) {
    bench(`DecryptStream: ${kind} (64 KiB)`, () => {
      const cipher = createCipher();
      return new DecryptStream(
        new Stream(bytes),
        bytes.length,
        (data, finalize) => cipher.decryptBlock(data, finalize)
      ).getBytes();
    });
  }

  bench("AES256Cipher.encrypt (64 KiB)", () =>
    new AES256Cipher(KEY_256).encrypt(DATA, IV)
  );

  bench("calculateSHA512 (64 KiB)", () =>
    calculateSHA512(DATA, 0, DATA.length)
  );

  bench("PDF20._hash (issue6010_1.pdf)", () => {
    const pdf20 = new PDF20();
    return PASSWORD_HASHES.map(args => pdf20._hash(...args));
  });
});
