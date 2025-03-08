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

import { shadow } from "../shared/util.js";

const PARAMS = {
  get k() {
    return shadow(
      this,
      "k",
      [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
        0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
        0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
        0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
        0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
        0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
        0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
      ]
    );
  },
};

function rotr(x, n) {
  return (x >>> n) | (x << (32 - n));
}

function ch(x, y, z) {
  return (x & y) ^ (~x & z);
}

function maj(x, y, z) {
  return (x & y) ^ (x & z) ^ (y & z);
}

function sigma(x) {
  return rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22);
}

function sigmaPrime(x) {
  return rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25);
}

function littleSigma(x) {
  return rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
}

function littleSigmaPrime(x) {
  return rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10);
}

function calculateSHA256(data, offset, length) {
  // initial hash values
  let h0 = 0x6a09e667,
    h1 = 0xbb67ae85,
    h2 = 0x3c6ef372,
    h3 = 0xa54ff53a,
    h4 = 0x510e527f,
    h5 = 0x9b05688c,
    h6 = 0x1f83d9ab,
    h7 = 0x5be0cd19;
  // pre-processing
  const paddedLength = Math.ceil((length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  let i, j;
  for (i = 0; i < length; ++i) {
    padded[i] = data[offset++];
  }
  padded[i++] = 0x80;
  const n = paddedLength - 8;
  if (i < n) {
    i = n;
  }
  i += 3;
  padded[i++] = (length >>> 29) & 0xff;
  padded[i++] = (length >> 21) & 0xff;
  padded[i++] = (length >> 13) & 0xff;
  padded[i++] = (length >> 5) & 0xff;
  padded[i++] = (length << 3) & 0xff;
  const w = new Uint32Array(64);
  const { k } = PARAMS;
  // for each 512 bit block
  for (i = 0; i < paddedLength; ) {
    for (j = 0; j < 16; ++j) {
      w[j] =
        (padded[i] << 24) |
        (padded[i + 1] << 16) |
        (padded[i + 2] << 8) |
        padded[i + 3];
      i += 4;
    }

    for (j = 16; j < 64; ++j) {
      w[j] =
        (littleSigmaPrime(w[j - 2]) +
          w[j - 7] +
          littleSigma(w[j - 15]) +
          w[j - 16]) |
        0;
    }
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      h = h7,
      t1,
      t2;
    for (j = 0; j < 64; ++j) {
      t1 = h + sigmaPrime(e) + ch(e, f, g) + k[j] + w[j];
      t2 = sigma(a) + maj(a, b, c);
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }
  // prettier-ignore
  return new Uint8Array([
    (h0 >> 24) & 0xFF, (h0 >> 16) & 0xFF, (h0 >> 8) & 0xFF, (h0) & 0xFF,
    (h1 >> 24) & 0xFF, (h1 >> 16) & 0xFF, (h1 >> 8) & 0xFF, (h1) & 0xFF,
    (h2 >> 24) & 0xFF, (h2 >> 16) & 0xFF, (h2 >> 8) & 0xFF, (h2) & 0xFF,
    (h3 >> 24) & 0xFF, (h3 >> 16) & 0xFF, (h3 >> 8) & 0xFF, (h3) & 0xFF,
    (h4 >> 24) & 0xFF, (h4 >> 16) & 0xFF, (h4 >> 8) & 0xFF, (h4) & 0xFF,
    (h5 >> 24) & 0xFF, (h5 >> 16) & 0xFF, (h5 >> 8) & 0xFF, (h5) & 0xFF,
    (h6 >> 24) & 0xFF, (h6 >> 16) & 0xFF, (h6 >> 8) & 0xFF, (h6) & 0xFF,
    (h7 >> 24) & 0xFF, (h7 >> 16) & 0xFF, (h7 >> 8) & 0xFF, (h7) & 0xFF
  ]);
}

export { calculateSHA256 };
