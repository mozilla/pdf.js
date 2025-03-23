/* Copyright 2012 Mozilla Foundation
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
  bytesToString,
  FormatError,
  isArrayEqual,
  PasswordException,
  PasswordResponses,
  shadow,
  stringToBytes,
  unreachable,
  utf8StringToString,
  warn,
} from "../shared/util.js";
import { calculateSHA384, calculateSHA512 } from "./calculate_sha_other.js";
import { Dict, isName, Name } from "./primitives.js";
import { calculateMD5 } from "./calculate_md5.js";
import { calculateSHA256 } from "./calculate_sha256.js";
import { DecryptStream } from "./decrypt_stream.js";

class ARCFourCipher {
  constructor(key) {
    this.a = 0;
    this.b = 0;
    const s = new Uint8Array(256);
    const keyLength = key.length;

    for (let i = 0; i < 256; ++i) {
      s[i] = i;
    }
    for (let i = 0, j = 0; i < 256; ++i) {
      const tmp = s[i];
      j = (j + tmp + key[i % keyLength]) & 0xff;
      s[i] = s[j];
      s[j] = tmp;
    }
    this.s = s;
  }

  encryptBlock(data) {
    let a = this.a,
      b = this.b;
    const s = this.s;
    const n = data.length;
    const output = new Uint8Array(n);
    for (let i = 0; i < n; ++i) {
      a = (a + 1) & 0xff;
      const tmp = s[a];
      b = (b + tmp) & 0xff;
      const tmp2 = s[b];
      s[a] = tmp2;
      s[b] = tmp;
      output[i] = data[i] ^ s[(tmp + tmp2) & 0xff];
    }
    this.a = a;
    this.b = b;
    return output;
  }

  decryptBlock(data) {
    return this.encryptBlock(data);
  }

  encrypt(data) {
    return this.encryptBlock(data);
  }
}

class NullCipher {
  decryptBlock(data) {
    return data;
  }

  encrypt(data) {
    return data;
  }
}

class AESBaseCipher {
  _s = new Uint8Array([
    0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b,
    0xfe, 0xd7, 0xab, 0x76, 0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0,
    0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0, 0xb7, 0xfd, 0x93, 0x26,
    0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
    0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2,
    0xeb, 0x27, 0xb2, 0x75, 0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0,
    0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84, 0x53, 0xd1, 0x00, 0xed,
    0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
    0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f,
    0x50, 0x3c, 0x9f, 0xa8, 0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5,
    0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2, 0xcd, 0x0c, 0x13, 0xec,
    0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
    0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14,
    0xde, 0x5e, 0x0b, 0xdb, 0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c,
    0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79, 0xe7, 0xc8, 0x37, 0x6d,
    0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
    0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f,
    0x4b, 0xbd, 0x8b, 0x8a, 0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e,
    0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e, 0xe1, 0xf8, 0x98, 0x11,
    0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
    0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f,
    0xb0, 0x54, 0xbb, 0x16,
  ]);

  _inv_s = new Uint8Array([
    0x52, 0x09, 0x6a, 0xd5, 0x30, 0x36, 0xa5, 0x38, 0xbf, 0x40, 0xa3, 0x9e,
    0x81, 0xf3, 0xd7, 0xfb, 0x7c, 0xe3, 0x39, 0x82, 0x9b, 0x2f, 0xff, 0x87,
    0x34, 0x8e, 0x43, 0x44, 0xc4, 0xde, 0xe9, 0xcb, 0x54, 0x7b, 0x94, 0x32,
    0xa6, 0xc2, 0x23, 0x3d, 0xee, 0x4c, 0x95, 0x0b, 0x42, 0xfa, 0xc3, 0x4e,
    0x08, 0x2e, 0xa1, 0x66, 0x28, 0xd9, 0x24, 0xb2, 0x76, 0x5b, 0xa2, 0x49,
    0x6d, 0x8b, 0xd1, 0x25, 0x72, 0xf8, 0xf6, 0x64, 0x86, 0x68, 0x98, 0x16,
    0xd4, 0xa4, 0x5c, 0xcc, 0x5d, 0x65, 0xb6, 0x92, 0x6c, 0x70, 0x48, 0x50,
    0xfd, 0xed, 0xb9, 0xda, 0x5e, 0x15, 0x46, 0x57, 0xa7, 0x8d, 0x9d, 0x84,
    0x90, 0xd8, 0xab, 0x00, 0x8c, 0xbc, 0xd3, 0x0a, 0xf7, 0xe4, 0x58, 0x05,
    0xb8, 0xb3, 0x45, 0x06, 0xd0, 0x2c, 0x1e, 0x8f, 0xca, 0x3f, 0x0f, 0x02,
    0xc1, 0xaf, 0xbd, 0x03, 0x01, 0x13, 0x8a, 0x6b, 0x3a, 0x91, 0x11, 0x41,
    0x4f, 0x67, 0xdc, 0xea, 0x97, 0xf2, 0xcf, 0xce, 0xf0, 0xb4, 0xe6, 0x73,
    0x96, 0xac, 0x74, 0x22, 0xe7, 0xad, 0x35, 0x85, 0xe2, 0xf9, 0x37, 0xe8,
    0x1c, 0x75, 0xdf, 0x6e, 0x47, 0xf1, 0x1a, 0x71, 0x1d, 0x29, 0xc5, 0x89,
    0x6f, 0xb7, 0x62, 0x0e, 0xaa, 0x18, 0xbe, 0x1b, 0xfc, 0x56, 0x3e, 0x4b,
    0xc6, 0xd2, 0x79, 0x20, 0x9a, 0xdb, 0xc0, 0xfe, 0x78, 0xcd, 0x5a, 0xf4,
    0x1f, 0xdd, 0xa8, 0x33, 0x88, 0x07, 0xc7, 0x31, 0xb1, 0x12, 0x10, 0x59,
    0x27, 0x80, 0xec, 0x5f, 0x60, 0x51, 0x7f, 0xa9, 0x19, 0xb5, 0x4a, 0x0d,
    0x2d, 0xe5, 0x7a, 0x9f, 0x93, 0xc9, 0x9c, 0xef, 0xa0, 0xe0, 0x3b, 0x4d,
    0xae, 0x2a, 0xf5, 0xb0, 0xc8, 0xeb, 0xbb, 0x3c, 0x83, 0x53, 0x99, 0x61,
    0x17, 0x2b, 0x04, 0x7e, 0xba, 0x77, 0xd6, 0x26, 0xe1, 0x69, 0x14, 0x63,
    0x55, 0x21, 0x0c, 0x7d,
  ]);

  _mix = new Uint32Array([
    0x00000000, 0x0e090d0b, 0x1c121a16, 0x121b171d, 0x3824342c, 0x362d3927,
    0x24362e3a, 0x2a3f2331, 0x70486858, 0x7e416553, 0x6c5a724e, 0x62537f45,
    0x486c5c74, 0x4665517f, 0x547e4662, 0x5a774b69, 0xe090d0b0, 0xee99ddbb,
    0xfc82caa6, 0xf28bc7ad, 0xd8b4e49c, 0xd6bde997, 0xc4a6fe8a, 0xcaaff381,
    0x90d8b8e8, 0x9ed1b5e3, 0x8ccaa2fe, 0x82c3aff5, 0xa8fc8cc4, 0xa6f581cf,
    0xb4ee96d2, 0xbae79bd9, 0xdb3bbb7b, 0xd532b670, 0xc729a16d, 0xc920ac66,
    0xe31f8f57, 0xed16825c, 0xff0d9541, 0xf104984a, 0xab73d323, 0xa57ade28,
    0xb761c935, 0xb968c43e, 0x9357e70f, 0x9d5eea04, 0x8f45fd19, 0x814cf012,
    0x3bab6bcb, 0x35a266c0, 0x27b971dd, 0x29b07cd6, 0x038f5fe7, 0x0d8652ec,
    0x1f9d45f1, 0x119448fa, 0x4be30393, 0x45ea0e98, 0x57f11985, 0x59f8148e,
    0x73c737bf, 0x7dce3ab4, 0x6fd52da9, 0x61dc20a2, 0xad766df6, 0xa37f60fd,
    0xb16477e0, 0xbf6d7aeb, 0x955259da, 0x9b5b54d1, 0x894043cc, 0x87494ec7,
    0xdd3e05ae, 0xd33708a5, 0xc12c1fb8, 0xcf2512b3, 0xe51a3182, 0xeb133c89,
    0xf9082b94, 0xf701269f, 0x4de6bd46, 0x43efb04d, 0x51f4a750, 0x5ffdaa5b,
    0x75c2896a, 0x7bcb8461, 0x69d0937c, 0x67d99e77, 0x3daed51e, 0x33a7d815,
    0x21bccf08, 0x2fb5c203, 0x058ae132, 0x0b83ec39, 0x1998fb24, 0x1791f62f,
    0x764dd68d, 0x7844db86, 0x6a5fcc9b, 0x6456c190, 0x4e69e2a1, 0x4060efaa,
    0x527bf8b7, 0x5c72f5bc, 0x0605bed5, 0x080cb3de, 0x1a17a4c3, 0x141ea9c8,
    0x3e218af9, 0x302887f2, 0x223390ef, 0x2c3a9de4, 0x96dd063d, 0x98d40b36,
    0x8acf1c2b, 0x84c61120, 0xaef93211, 0xa0f03f1a, 0xb2eb2807, 0xbce2250c,
    0xe6956e65, 0xe89c636e, 0xfa877473, 0xf48e7978, 0xdeb15a49, 0xd0b85742,
    0xc2a3405f, 0xccaa4d54, 0x41ecdaf7, 0x4fe5d7fc, 0x5dfec0e1, 0x53f7cdea,
    0x79c8eedb, 0x77c1e3d0, 0x65daf4cd, 0x6bd3f9c6, 0x31a4b2af, 0x3fadbfa4,
    0x2db6a8b9, 0x23bfa5b2, 0x09808683, 0x07898b88, 0x15929c95, 0x1b9b919e,
    0xa17c0a47, 0xaf75074c, 0xbd6e1051, 0xb3671d5a, 0x99583e6b, 0x97513360,
    0x854a247d, 0x8b432976, 0xd134621f, 0xdf3d6f14, 0xcd267809, 0xc32f7502,
    0xe9105633, 0xe7195b38, 0xf5024c25, 0xfb0b412e, 0x9ad7618c, 0x94de6c87,
    0x86c57b9a, 0x88cc7691, 0xa2f355a0, 0xacfa58ab, 0xbee14fb6, 0xb0e842bd,
    0xea9f09d4, 0xe49604df, 0xf68d13c2, 0xf8841ec9, 0xd2bb3df8, 0xdcb230f3,
    0xcea927ee, 0xc0a02ae5, 0x7a47b13c, 0x744ebc37, 0x6655ab2a, 0x685ca621,
    0x42638510, 0x4c6a881b, 0x5e719f06, 0x5078920d, 0x0a0fd964, 0x0406d46f,
    0x161dc372, 0x1814ce79, 0x322bed48, 0x3c22e043, 0x2e39f75e, 0x2030fa55,
    0xec9ab701, 0xe293ba0a, 0xf088ad17, 0xfe81a01c, 0xd4be832d, 0xdab78e26,
    0xc8ac993b, 0xc6a59430, 0x9cd2df59, 0x92dbd252, 0x80c0c54f, 0x8ec9c844,
    0xa4f6eb75, 0xaaffe67e, 0xb8e4f163, 0xb6edfc68, 0x0c0a67b1, 0x02036aba,
    0x10187da7, 0x1e1170ac, 0x342e539d, 0x3a275e96, 0x283c498b, 0x26354480,
    0x7c420fe9, 0x724b02e2, 0x605015ff, 0x6e5918f4, 0x44663bc5, 0x4a6f36ce,
    0x587421d3, 0x567d2cd8, 0x37a10c7a, 0x39a80171, 0x2bb3166c, 0x25ba1b67,
    0x0f853856, 0x018c355d, 0x13972240, 0x1d9e2f4b, 0x47e96422, 0x49e06929,
    0x5bfb7e34, 0x55f2733f, 0x7fcd500e, 0x71c45d05, 0x63df4a18, 0x6dd64713,
    0xd731dcca, 0xd938d1c1, 0xcb23c6dc, 0xc52acbd7, 0xef15e8e6, 0xe11ce5ed,
    0xf307f2f0, 0xfd0efffb, 0xa779b492, 0xa970b999, 0xbb6bae84, 0xb562a38f,
    0x9f5d80be, 0x91548db5, 0x834f9aa8, 0x8d4697a3,
  ]);

  _mixCol = new Uint8Array(256).map((_, i) =>
    i < 128 ? i << 1 : (i << 1) ^ 0x1b
  );

  constructor() {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === AESBaseCipher
    ) {
      unreachable("Cannot initialize AESBaseCipher.");
    }
    this.buffer = new Uint8Array(16);
    this.bufferPosition = 0;
  }

  _expandKey(cipherKey) {
    unreachable("Cannot call `_expandKey` on the base class");
  }

  _decrypt(input, key) {
    let t, u, v;
    const state = new Uint8Array(16);
    state.set(input);

    // AddRoundKey
    for (let j = 0, k = this._keySize; j < 16; ++j, ++k) {
      state[j] ^= key[k];
    }
    for (let i = this._cyclesOfRepetition - 1; i >= 1; --i) {
      // InvShiftRows
      t = state[13];
      state[13] = state[9];
      state[9] = state[5];
      state[5] = state[1];
      state[1] = t;
      t = state[14];
      u = state[10];
      state[14] = state[6];
      state[10] = state[2];
      state[6] = t;
      state[2] = u;
      t = state[15];
      u = state[11];
      v = state[7];
      state[15] = state[3];
      state[11] = t;
      state[7] = u;
      state[3] = v;
      // InvSubBytes
      for (let j = 0; j < 16; ++j) {
        state[j] = this._inv_s[state[j]];
      }
      // AddRoundKey
      for (let j = 0, k = i * 16; j < 16; ++j, ++k) {
        state[j] ^= key[k];
      }
      // InvMixColumns
      for (let j = 0; j < 16; j += 4) {
        const s0 = this._mix[state[j]];
        const s1 = this._mix[state[j + 1]];
        const s2 = this._mix[state[j + 2]];
        const s3 = this._mix[state[j + 3]];
        t =
          s0 ^
          (s1 >>> 8) ^
          (s1 << 24) ^
          (s2 >>> 16) ^
          (s2 << 16) ^
          (s3 >>> 24) ^
          (s3 << 8);
        state[j] = (t >>> 24) & 0xff;
        state[j + 1] = (t >> 16) & 0xff;
        state[j + 2] = (t >> 8) & 0xff;
        state[j + 3] = t & 0xff;
      }
    }
    // InvShiftRows
    t = state[13];
    state[13] = state[9];
    state[9] = state[5];
    state[5] = state[1];
    state[1] = t;
    t = state[14];
    u = state[10];
    state[14] = state[6];
    state[10] = state[2];
    state[6] = t;
    state[2] = u;
    t = state[15];
    u = state[11];
    v = state[7];
    state[15] = state[3];
    state[11] = t;
    state[7] = u;
    state[3] = v;
    for (let j = 0; j < 16; ++j) {
      // InvSubBytes
      state[j] = this._inv_s[state[j]];
      // AddRoundKey
      state[j] ^= key[j];
    }
    return state;
  }

  _encrypt(input, key) {
    const s = this._s;

    let t, u, v;
    const state = new Uint8Array(16);
    state.set(input);

    for (let j = 0; j < 16; ++j) {
      // AddRoundKey
      state[j] ^= key[j];
    }

    for (let i = 1; i < this._cyclesOfRepetition; i++) {
      // SubBytes
      for (let j = 0; j < 16; ++j) {
        state[j] = s[state[j]];
      }
      // ShiftRows
      v = state[1];
      state[1] = state[5];
      state[5] = state[9];
      state[9] = state[13];
      state[13] = v;
      v = state[2];
      u = state[6];
      state[2] = state[10];
      state[6] = state[14];
      state[10] = v;
      state[14] = u;
      v = state[3];
      u = state[7];
      t = state[11];
      state[3] = state[15];
      state[7] = v;
      state[11] = u;
      state[15] = t;
      // MixColumns
      for (let j = 0; j < 16; j += 4) {
        const s0 = state[j];
        const s1 = state[j + 1];
        const s2 = state[j + 2];
        const s3 = state[j + 3];
        t = s0 ^ s1 ^ s2 ^ s3;
        state[j] ^= t ^ this._mixCol[s0 ^ s1];
        state[j + 1] ^= t ^ this._mixCol[s1 ^ s2];
        state[j + 2] ^= t ^ this._mixCol[s2 ^ s3];
        state[j + 3] ^= t ^ this._mixCol[s3 ^ s0];
      }
      // AddRoundKey
      for (let j = 0, k = i * 16; j < 16; ++j, ++k) {
        state[j] ^= key[k];
      }
    }

    // SubBytes
    for (let j = 0; j < 16; ++j) {
      state[j] = s[state[j]];
    }
    // ShiftRows
    v = state[1];
    state[1] = state[5];
    state[5] = state[9];
    state[9] = state[13];
    state[13] = v;
    v = state[2];
    u = state[6];
    state[2] = state[10];
    state[6] = state[14];
    state[10] = v;
    state[14] = u;
    v = state[3];
    u = state[7];
    t = state[11];
    state[3] = state[15];
    state[7] = v;
    state[11] = u;
    state[15] = t;
    // AddRoundKey
    for (let j = 0, k = this._keySize; j < 16; ++j, ++k) {
      state[j] ^= key[k];
    }
    return state;
  }

  _decryptBlock2(data, finalize) {
    const sourceLength = data.length;
    let buffer = this.buffer,
      bufferLength = this.bufferPosition;
    const result = [];
    let iv = this.iv;

    for (let i = 0; i < sourceLength; ++i) {
      buffer[bufferLength] = data[i];
      ++bufferLength;
      if (bufferLength < 16) {
        continue;
      }
      // buffer is full, decrypting
      const plain = this._decrypt(buffer, this._key);
      // xor-ing the IV vector to get plain text
      for (let j = 0; j < 16; ++j) {
        plain[j] ^= iv[j];
      }
      iv = buffer;
      result.push(plain);
      buffer = new Uint8Array(16);
      bufferLength = 0;
    }
    // saving incomplete buffer
    this.buffer = buffer;
    this.bufferLength = bufferLength;
    this.iv = iv;
    if (result.length === 0) {
      return new Uint8Array(0);
    }
    // combining plain text blocks into one
    let outputLength = 16 * result.length;
    if (finalize) {
      // undo a padding that is described in RFC 2898
      const lastBlock = result.at(-1);
      let psLen = lastBlock[15];
      if (psLen <= 16) {
        for (let i = 15, ii = 16 - psLen; i >= ii; --i) {
          if (lastBlock[i] !== psLen) {
            // Invalid padding, assume that the block has no padding.
            psLen = 0;
            break;
          }
        }
        outputLength -= psLen;
        result[result.length - 1] = lastBlock.subarray(0, 16 - psLen);
      }
    }
    const output = new Uint8Array(outputLength);
    for (let i = 0, j = 0, ii = result.length; i < ii; ++i, j += 16) {
      output.set(result[i], j);
    }
    return output;
  }

  decryptBlock(data, finalize, iv = null) {
    const sourceLength = data.length;
    const buffer = this.buffer;
    let bufferLength = this.bufferPosition;
    // If an IV is not supplied, wait for IV values. They are at the start
    // of the stream.
    if (iv) {
      this.iv = iv;
    } else {
      for (
        let i = 0;
        bufferLength < 16 && i < sourceLength;
        ++i, ++bufferLength
      ) {
        buffer[bufferLength] = data[i];
      }
      if (bufferLength < 16) {
        // Need more data.
        this.bufferLength = bufferLength;
        return new Uint8Array(0);
      }
      this.iv = buffer;
      data = data.subarray(16);
    }
    this.buffer = new Uint8Array(16);
    this.bufferLength = 0;
    // starting decryption
    this.decryptBlock = this._decryptBlock2;
    return this.decryptBlock(data, finalize);
  }

  encrypt(data, iv) {
    const sourceLength = data.length;
    let buffer = this.buffer,
      bufferLength = this.bufferPosition;
    const result = [];

    iv ||= new Uint8Array(16);
    for (let i = 0; i < sourceLength; ++i) {
      buffer[bufferLength] = data[i];
      ++bufferLength;
      if (bufferLength < 16) {
        continue;
      }

      for (let j = 0; j < 16; ++j) {
        buffer[j] ^= iv[j];
      }

      // buffer is full, encrypting
      const cipher = this._encrypt(buffer, this._key);
      iv = cipher;
      result.push(cipher);
      buffer = new Uint8Array(16);
      bufferLength = 0;
    }
    // saving incomplete buffer
    this.buffer = buffer;
    this.bufferLength = bufferLength;
    this.iv = iv;
    if (result.length === 0) {
      return new Uint8Array(0);
    }
    // combining plain text blocks into one
    const outputLength = 16 * result.length;
    const output = new Uint8Array(outputLength);
    for (let i = 0, j = 0, ii = result.length; i < ii; ++i, j += 16) {
      output.set(result[i], j);
    }
    return output;
  }
}

class AES128Cipher extends AESBaseCipher {
  _rcon = new Uint8Array([
    0x8d, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c,
    0xd8, 0xab, 0x4d, 0x9a, 0x2f, 0x5e, 0xbc, 0x63, 0xc6, 0x97, 0x35, 0x6a,
    0xd4, 0xb3, 0x7d, 0xfa, 0xef, 0xc5, 0x91, 0x39, 0x72, 0xe4, 0xd3, 0xbd,
    0x61, 0xc2, 0x9f, 0x25, 0x4a, 0x94, 0x33, 0x66, 0xcc, 0x83, 0x1d, 0x3a,
    0x74, 0xe8, 0xcb, 0x8d, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80,
    0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d, 0x9a, 0x2f, 0x5e, 0xbc, 0x63, 0xc6,
    0x97, 0x35, 0x6a, 0xd4, 0xb3, 0x7d, 0xfa, 0xef, 0xc5, 0x91, 0x39, 0x72,
    0xe4, 0xd3, 0xbd, 0x61, 0xc2, 0x9f, 0x25, 0x4a, 0x94, 0x33, 0x66, 0xcc,
    0x83, 0x1d, 0x3a, 0x74, 0xe8, 0xcb, 0x8d, 0x01, 0x02, 0x04, 0x08, 0x10,
    0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d, 0x9a, 0x2f, 0x5e,
    0xbc, 0x63, 0xc6, 0x97, 0x35, 0x6a, 0xd4, 0xb3, 0x7d, 0xfa, 0xef, 0xc5,
    0x91, 0x39, 0x72, 0xe4, 0xd3, 0xbd, 0x61, 0xc2, 0x9f, 0x25, 0x4a, 0x94,
    0x33, 0x66, 0xcc, 0x83, 0x1d, 0x3a, 0x74, 0xe8, 0xcb, 0x8d, 0x01, 0x02,
    0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d,
    0x9a, 0x2f, 0x5e, 0xbc, 0x63, 0xc6, 0x97, 0x35, 0x6a, 0xd4, 0xb3, 0x7d,
    0xfa, 0xef, 0xc5, 0x91, 0x39, 0x72, 0xe4, 0xd3, 0xbd, 0x61, 0xc2, 0x9f,
    0x25, 0x4a, 0x94, 0x33, 0x66, 0xcc, 0x83, 0x1d, 0x3a, 0x74, 0xe8, 0xcb,
    0x8d, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c,
    0xd8, 0xab, 0x4d, 0x9a, 0x2f, 0x5e, 0xbc, 0x63, 0xc6, 0x97, 0x35, 0x6a,
    0xd4, 0xb3, 0x7d, 0xfa, 0xef, 0xc5, 0x91, 0x39, 0x72, 0xe4, 0xd3, 0xbd,
    0x61, 0xc2, 0x9f, 0x25, 0x4a, 0x94, 0x33, 0x66, 0xcc, 0x83, 0x1d, 0x3a,
    0x74, 0xe8, 0xcb, 0x8d,
  ]);

  constructor(key) {
    super();

    this._cyclesOfRepetition = 10;
    this._keySize = 160; // bits

    this._key = this._expandKey(key);
  }

  _expandKey(cipherKey) {
    const b = 176;
    const s = this._s;
    const rcon = this._rcon;

    const result = new Uint8Array(b);
    result.set(cipherKey);

    for (let j = 16, i = 1; j < b; ++i) {
      // RotWord
      let t1 = result[j - 3];
      let t2 = result[j - 2];
      let t3 = result[j - 1];
      let t4 = result[j - 4];
      // SubWord
      t1 = s[t1];
      t2 = s[t2];
      t3 = s[t3];
      t4 = s[t4];
      // Rcon
      t1 ^= rcon[i];
      for (let n = 0; n < 4; ++n) {
        result[j] = t1 ^= result[j - 16];
        j++;
        result[j] = t2 ^= result[j - 16];
        j++;
        result[j] = t3 ^= result[j - 16];
        j++;
        result[j] = t4 ^= result[j - 16];
        j++;
      }
    }
    return result;
  }
}

class AES256Cipher extends AESBaseCipher {
  constructor(key) {
    super();

    this._cyclesOfRepetition = 14;
    this._keySize = 224; // bits

    this._key = this._expandKey(key);
  }

  _expandKey(cipherKey) {
    const b = 240;
    const s = this._s;

    const result = new Uint8Array(b);
    result.set(cipherKey);

    let r = 1;
    let t1, t2, t3, t4;
    for (let j = 32, i = 1; j < b; ++i) {
      if (j % 32 === 16) {
        t1 = s[t1];
        t2 = s[t2];
        t3 = s[t3];
        t4 = s[t4];
      } else if (j % 32 === 0) {
        // RotWord
        t1 = result[j - 3];
        t2 = result[j - 2];
        t3 = result[j - 1];
        t4 = result[j - 4];
        // SubWord
        t1 = s[t1];
        t2 = s[t2];
        t3 = s[t3];
        t4 = s[t4];
        // Rcon
        t1 ^= r;
        if ((r <<= 1) >= 256) {
          r = (r ^ 0x1b) & 0xff;
        }
      }

      for (let n = 0; n < 4; ++n) {
        result[j] = t1 ^= result[j - 32];
        j++;
        result[j] = t2 ^= result[j - 32];
        j++;
        result[j] = t3 ^= result[j - 32];
        j++;
        result[j] = t4 ^= result[j - 32];
        j++;
      }
    }
    return result;
  }
}

class PDFBase {
  constructor() {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === PDFBase
    ) {
      unreachable("Cannot initialize PDFBase.");
    }
  }

  _hash(password, input, userBytes) {
    unreachable("Abstract method `_hash` called");
  }

  checkOwnerPassword(password, ownerValidationSalt, userBytes, ownerPassword) {
    const hashData = new Uint8Array(password.length + 56);
    hashData.set(password, 0);
    hashData.set(ownerValidationSalt, password.length);
    hashData.set(userBytes, password.length + ownerValidationSalt.length);
    const result = this._hash(password, hashData, userBytes);
    return isArrayEqual(result, ownerPassword);
  }

  checkUserPassword(password, userValidationSalt, userPassword) {
    const hashData = new Uint8Array(password.length + 8);
    hashData.set(password, 0);
    hashData.set(userValidationSalt, password.length);
    const result = this._hash(password, hashData, []);
    return isArrayEqual(result, userPassword);
  }

  getOwnerKey(password, ownerKeySalt, userBytes, ownerEncryption) {
    const hashData = new Uint8Array(password.length + 56);
    hashData.set(password, 0);
    hashData.set(ownerKeySalt, password.length);
    hashData.set(userBytes, password.length + ownerKeySalt.length);
    const key = this._hash(password, hashData, userBytes);
    const cipher = new AES256Cipher(key);
    return cipher.decryptBlock(ownerEncryption, false, new Uint8Array(16));
  }

  getUserKey(password, userKeySalt, userEncryption) {
    const hashData = new Uint8Array(password.length + 8);
    hashData.set(password, 0);
    hashData.set(userKeySalt, password.length);
    // `key` is the decryption key for the UE string.
    const key = this._hash(password, hashData, []);
    const cipher = new AES256Cipher(key);
    return cipher.decryptBlock(userEncryption, false, new Uint8Array(16));
  }
}

class PDF17 extends PDFBase {
  _hash(password, input, userBytes) {
    return calculateSHA256(input, 0, input.length);
  }
}

class PDF20 extends PDFBase {
  _hash(password, input, userBytes) {
    // This refers to Algorithm 2.B as defined in ISO 32000-2.
    let k = calculateSHA256(input, 0, input.length).subarray(0, 32);
    let e = [0];
    let i = 0;
    while (i < 64 || e.at(-1) > i - 32) {
      const combinedLength = password.length + k.length + userBytes.length,
        combinedArray = new Uint8Array(combinedLength);
      let writeOffset = 0;
      combinedArray.set(password, writeOffset);
      writeOffset += password.length;
      combinedArray.set(k, writeOffset);
      writeOffset += k.length;
      combinedArray.set(userBytes, writeOffset);

      const k1 = new Uint8Array(combinedLength * 64);
      for (let j = 0, pos = 0; j < 64; j++, pos += combinedLength) {
        k1.set(combinedArray, pos);
      }
      // AES128 CBC NO PADDING with first 16 bytes of k as the key
      // and the second 16 as the iv.
      const cipher = new AES128Cipher(k.subarray(0, 16));
      e = cipher.encrypt(k1, k.subarray(16, 32));
      // Now we have to take the first 16 bytes of an unsigned big endian
      // integer and compute the remainder modulo 3. That is a fairly large
      // number and JavaScript isn't going to handle that well.
      // The number is e0 + 256 * e1 + 256^2 * e2... and 256 % 3 === 1, hence
      // the powers of 256 are === 1 modulo 3 and finally the number modulo 3
      // is equal to the remainder modulo 3 of the sum of the e_n.
      const remainder = Math.sumPrecise(e.slice(0, 16)) % 3;
      if (remainder === 0) {
        k = calculateSHA256(e, 0, e.length);
      } else if (remainder === 1) {
        k = calculateSHA384(e, 0, e.length);
      } else if (remainder === 2) {
        k = calculateSHA512(e, 0, e.length);
      }
      i++;
    }
    return k.subarray(0, 32);
  }
}

class CipherTransform {
  constructor(stringCipherConstructor, streamCipherConstructor) {
    this.StringCipherConstructor = stringCipherConstructor;
    this.StreamCipherConstructor = streamCipherConstructor;
  }

  createStream(stream, length) {
    const cipher = new this.StreamCipherConstructor();
    return new DecryptStream(
      stream,
      length,
      function cipherTransformDecryptStream(data, finalize) {
        return cipher.decryptBlock(data, finalize);
      }
    );
  }

  decryptString(s) {
    const cipher = new this.StringCipherConstructor();
    let data = stringToBytes(s);
    data = cipher.decryptBlock(data, true);
    return bytesToString(data);
  }

  encryptString(s) {
    const cipher = new this.StringCipherConstructor();
    if (cipher instanceof AESBaseCipher) {
      // Append some chars equal to "16 - (M mod 16)"
      // where M is the string length (see section 7.6.2 in PDF specification)
      // to have a final string where the length is a multiple of 16.
      // Special note:
      //   "Note that the pad is present when M is evenly divisible by 16;
      //   it contains 16 bytes of 0x10."
      const strLen = s.length;
      const pad = 16 - (strLen % 16);
      s += String.fromCharCode(pad).repeat(pad);

      // Generate an initialization vector
      const iv = new Uint8Array(16);
      crypto.getRandomValues(iv);

      let data = stringToBytes(s);
      data = cipher.encrypt(data, iv);

      const buf = new Uint8Array(16 + data.length);
      buf.set(iv);
      buf.set(data, 16);

      return bytesToString(buf);
    }

    let data = stringToBytes(s);
    data = cipher.encrypt(data);
    return bytesToString(data);
  }
}

class CipherTransformFactory {
  static get _defaultPasswordBytes() {
    return shadow(
      this,
      "_defaultPasswordBytes",
      new Uint8Array([
        0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56,
        0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
        0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
      ])
    );
  }

  #createEncryptionKey20(
    revision,
    password,
    ownerPassword,
    ownerValidationSalt,
    ownerKeySalt,
    uBytes,
    userPassword,
    userValidationSalt,
    userKeySalt,
    ownerEncryption,
    userEncryption,
    perms
  ) {
    if (password) {
      const passwordLength = Math.min(127, password.length);
      password = password.subarray(0, passwordLength);
    } else {
      password = [];
    }
    const pdfAlgorithm = revision === 6 ? new PDF20() : new PDF17();

    if (
      pdfAlgorithm.checkUserPassword(password, userValidationSalt, userPassword)
    ) {
      return pdfAlgorithm.getUserKey(password, userKeySalt, userEncryption);
    } else if (
      password.length &&
      pdfAlgorithm.checkOwnerPassword(
        password,
        ownerValidationSalt,
        uBytes,
        ownerPassword
      )
    ) {
      return pdfAlgorithm.getOwnerKey(
        password,
        ownerKeySalt,
        uBytes,
        ownerEncryption
      );
    }

    return null;
  }

  #prepareKeyData(
    fileId,
    password,
    ownerPassword,
    userPassword,
    flags,
    revision,
    keyLength,
    encryptMetadata
  ) {
    const hashDataSize = 40 + ownerPassword.length + fileId.length;
    const hashData = new Uint8Array(hashDataSize);
    let i = 0,
      j,
      n;
    if (password) {
      n = Math.min(32, password.length);
      for (; i < n; ++i) {
        hashData[i] = password[i];
      }
    }
    j = 0;
    while (i < 32) {
      hashData[i++] = CipherTransformFactory._defaultPasswordBytes[j++];
    }
    // as now the padded password in the hashData[0..i]
    hashData.set(ownerPassword, i);
    i += ownerPassword.length;
    hashData[i++] = flags & 0xff;
    hashData[i++] = (flags >> 8) & 0xff;
    hashData[i++] = (flags >> 16) & 0xff;
    hashData[i++] = (flags >>> 24) & 0xff;
    hashData.set(fileId, i);
    i += fileId.length;
    if (revision >= 4 && !encryptMetadata) {
      hashData.fill(0xff, i, i + 4);
      i += 4;
    }
    let hash = calculateMD5(hashData, 0, i);
    const keyLengthInBytes = keyLength >> 3;
    if (revision >= 3) {
      for (j = 0; j < 50; ++j) {
        hash = calculateMD5(hash, 0, keyLengthInBytes);
      }
    }
    const encryptionKey = hash.subarray(0, keyLengthInBytes);
    let cipher, checkData;

    if (revision >= 3) {
      i = 0;
      hashData.set(CipherTransformFactory._defaultPasswordBytes, i);
      i += 32;
      hashData.set(fileId, i);
      i += fileId.length;

      cipher = new ARCFourCipher(encryptionKey);
      checkData = cipher.encryptBlock(calculateMD5(hashData, 0, i));
      n = encryptionKey.length;
      const derivedKey = new Uint8Array(n);
      for (j = 1; j <= 19; ++j) {
        for (let k = 0; k < n; ++k) {
          derivedKey[k] = encryptionKey[k] ^ j;
        }
        cipher = new ARCFourCipher(derivedKey);
        checkData = cipher.encryptBlock(checkData);
      }
    } else {
      cipher = new ARCFourCipher(encryptionKey);
      checkData = cipher.encryptBlock(
        CipherTransformFactory._defaultPasswordBytes
      );
    }
    return checkData.every((data, k) => userPassword[k] === data)
      ? encryptionKey
      : null;
  }

  #decodeUserPassword(password, ownerPassword, revision, keyLength) {
    const hashData = new Uint8Array(32);
    let i = 0;
    const n = Math.min(32, password.length);
    for (; i < n; ++i) {
      hashData[i] = password[i];
    }
    let j = 0;
    while (i < 32) {
      hashData[i++] = CipherTransformFactory._defaultPasswordBytes[j++];
    }
    let hash = calculateMD5(hashData, 0, i);
    const keyLengthInBytes = keyLength >> 3;
    if (revision >= 3) {
      for (j = 0; j < 50; ++j) {
        hash = calculateMD5(hash, 0, hash.length);
      }
    }

    let cipher, userPassword;
    if (revision >= 3) {
      userPassword = ownerPassword;
      const derivedKey = new Uint8Array(keyLengthInBytes);
      for (j = 19; j >= 0; j--) {
        for (let k = 0; k < keyLengthInBytes; ++k) {
          derivedKey[k] = hash[k] ^ j;
        }
        cipher = new ARCFourCipher(derivedKey);
        userPassword = cipher.encryptBlock(userPassword);
      }
    } else {
      cipher = new ARCFourCipher(hash.subarray(0, keyLengthInBytes));
      userPassword = cipher.encryptBlock(ownerPassword);
    }
    return userPassword;
  }

  #buildObjectKey(num, gen, encryptionKey, isAes = false) {
    const n = encryptionKey.length;
    const key = new Uint8Array(n + 9);
    key.set(encryptionKey);
    let i = n;
    key[i++] = num & 0xff;
    key[i++] = (num >> 8) & 0xff;
    key[i++] = (num >> 16) & 0xff;
    key[i++] = gen & 0xff;
    key[i++] = (gen >> 8) & 0xff;
    if (isAes) {
      key[i++] = 0x73;
      key[i++] = 0x41;
      key[i++] = 0x6c;
      key[i++] = 0x54;
    }
    const hash = calculateMD5(key, 0, i);
    return hash.subarray(0, Math.min(n + 5, 16));
  }

  #buildCipherConstructor(cf, name, num, gen, key) {
    if (!(name instanceof Name)) {
      throw new FormatError("Invalid crypt filter name.");
    }
    const self = this;
    const cryptFilter = cf.get(name.name);
    const cfm = cryptFilter?.get("CFM");

    if (!cfm || cfm.name === "None") {
      return function () {
        return new NullCipher();
      };
    }
    if (cfm.name === "V2") {
      return function () {
        return new ARCFourCipher(
          self.#buildObjectKey(num, gen, key, /* isAes = */ false)
        );
      };
    }
    if (cfm.name === "AESV2") {
      return function () {
        return new AES128Cipher(
          self.#buildObjectKey(num, gen, key, /* isAes = */ true)
        );
      };
    }
    if (cfm.name === "AESV3") {
      return function () {
        return new AES256Cipher(key);
      };
    }
    throw new FormatError("Unknown crypto method");
  }

  constructor(dict, fileId, password) {
    const filter = dict.get("Filter");
    if (!isName(filter, "Standard")) {
      throw new FormatError("unknown encryption method");
    }
    this.filterName = filter.name;
    this.dict = dict;
    const algorithm = dict.get("V");
    if (
      !Number.isInteger(algorithm) ||
      (algorithm !== 1 && algorithm !== 2 && algorithm !== 4 && algorithm !== 5)
    ) {
      throw new FormatError("unsupported encryption algorithm");
    }
    this.algorithm = algorithm;
    let keyLength = dict.get("Length");
    if (!keyLength) {
      // Spec asks to rely on encryption dictionary's Length entry, however
      // some PDFs don't have it. Trying to recover.
      if (algorithm <= 3) {
        // For 1 and 2 it's fixed to 40-bit, for 3 40-bit is a minimal value.
        keyLength = 40;
      } else {
        // Trying to find default handler -- it usually has Length.
        const cfDict = dict.get("CF");
        const streamCryptoName = dict.get("StmF");
        if (cfDict instanceof Dict && streamCryptoName instanceof Name) {
          cfDict.suppressEncryption = true; // See comment below.
          const handlerDict = cfDict.get(streamCryptoName.name);
          keyLength = handlerDict?.get("Length") || 128;
          if (keyLength < 40) {
            // Sometimes it's incorrect value of bits, generators specify
            // bytes.
            keyLength <<= 3;
          }
        }
      }
    }
    if (!Number.isInteger(keyLength) || keyLength < 40 || keyLength % 8 !== 0) {
      throw new FormatError("invalid key length");
    }

    const ownerBytes = stringToBytes(dict.get("O")),
      userBytes = stringToBytes(dict.get("U"));
    // prepare keys
    const ownerPassword = ownerBytes.subarray(0, 32);
    const userPassword = userBytes.subarray(0, 32);
    const flags = dict.get("P");
    const revision = dict.get("R");
    // meaningful when V is 4 or 5
    const encryptMetadata =
      (algorithm === 4 || algorithm === 5) &&
      dict.get("EncryptMetadata") !== false;
    this.encryptMetadata = encryptMetadata;

    const fileIdBytes = stringToBytes(fileId);
    let passwordBytes;
    if (password) {
      if (revision === 6) {
        try {
          password = utf8StringToString(password);
        } catch {
          warn(
            "CipherTransformFactory: Unable to convert UTF8 encoded password."
          );
        }
      }
      passwordBytes = stringToBytes(password);
    }

    let encryptionKey;
    if (algorithm !== 5) {
      encryptionKey = this.#prepareKeyData(
        fileIdBytes,
        passwordBytes,
        ownerPassword,
        userPassword,
        flags,
        revision,
        keyLength,
        encryptMetadata
      );
    } else {
      const ownerValidationSalt = ownerBytes.subarray(32, 40);
      const ownerKeySalt = ownerBytes.subarray(40, 48);
      const uBytes = userBytes.subarray(0, 48);
      const userValidationSalt = userBytes.subarray(32, 40);
      const userKeySalt = userBytes.subarray(40, 48);
      const ownerEncryption = stringToBytes(dict.get("OE"));
      const userEncryption = stringToBytes(dict.get("UE"));
      const perms = stringToBytes(dict.get("Perms"));
      encryptionKey = this.#createEncryptionKey20(
        revision,
        passwordBytes,
        ownerPassword,
        ownerValidationSalt,
        ownerKeySalt,
        uBytes,
        userPassword,
        userValidationSalt,
        userKeySalt,
        ownerEncryption,
        userEncryption,
        perms
      );
    }
    if (!encryptionKey) {
      if (!password) {
        throw new PasswordException(
          "No password given",
          PasswordResponses.NEED_PASSWORD
        );
      }
      // Attempting use the password as an owner password
      const decodedPassword = this.#decodeUserPassword(
        passwordBytes,
        ownerPassword,
        revision,
        keyLength
      );
      encryptionKey = this.#prepareKeyData(
        fileIdBytes,
        decodedPassword,
        ownerPassword,
        userPassword,
        flags,
        revision,
        keyLength,
        encryptMetadata
      );
    }

    if (!encryptionKey) {
      throw new PasswordException(
        "Incorrect Password",
        PasswordResponses.INCORRECT_PASSWORD
      );
    }

    if (algorithm === 4 && encryptionKey.length < 16) {
      // Extend key to 16 byte minimum (undocumented),
      // fixes issue19484_1.pdf and issue19484_2.pdf.
      this.encryptionKey = new Uint8Array(16);
      this.encryptionKey.set(encryptionKey);
    } else {
      this.encryptionKey = encryptionKey;
    }

    if (algorithm >= 4) {
      const cf = dict.get("CF");
      if (cf instanceof Dict) {
        // The 'CF' dictionary itself should not be encrypted, and by setting
        // `suppressEncryption` we can prevent an infinite loop inside of
        // `XRef_fetchUncompressed` if the dictionary contains indirect
        // objects (fixes issue7665.pdf).
        cf.suppressEncryption = true;
      }
      this.cf = cf;
      this.stmf = dict.get("StmF") || Name.get("Identity");
      this.strf = dict.get("StrF") || Name.get("Identity");
      this.eff = dict.get("EFF") || this.stmf;
    }
  }

  createCipherTransform(num, gen) {
    if (this.algorithm === 4 || this.algorithm === 5) {
      return new CipherTransform(
        this.#buildCipherConstructor(
          this.cf,
          this.strf,
          num,
          gen,
          this.encryptionKey
        ),
        this.#buildCipherConstructor(
          this.cf,
          this.stmf,
          num,
          gen,
          this.encryptionKey
        )
      );
    }
    // algorithms 1 and 2
    const key = this.#buildObjectKey(
      num,
      gen,
      this.encryptionKey,
      /* isAes = */ false
    );
    const cipherConstructor = function () {
      return new ARCFourCipher(key);
    };
    return new CipherTransform(cipherConstructor, cipherConstructor);
  }
}

export {
  AES128Cipher,
  AES256Cipher,
  ARCFourCipher,
  CipherTransformFactory,
  PDF17,
  PDF20,
};
