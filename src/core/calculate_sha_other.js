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

class Word64 {
  constructor(highInteger, lowInteger) {
    this.high = highInteger | 0;
    this.low = lowInteger | 0;
  }

  and(word) {
    this.high &= word.high;
    this.low &= word.low;
  }

  xor(word) {
    this.high ^= word.high;
    this.low ^= word.low;
  }

  shiftRight(places) {
    if (places >= 32) {
      this.low = (this.high >>> (places - 32)) | 0;
      this.high = 0;
    } else {
      this.low = (this.low >>> places) | (this.high << (32 - places));
      this.high = (this.high >>> places) | 0;
    }
  }

  rotateRight(places) {
    let low, high;
    if (places & 32) {
      high = this.low;
      low = this.high;
    } else {
      low = this.low;
      high = this.high;
    }
    places &= 31;
    this.low = (low >>> places) | (high << (32 - places));
    this.high = (high >>> places) | (low << (32 - places));
  }

  not() {
    this.high = ~this.high;
    this.low = ~this.low;
  }

  add(word) {
    const lowAdd = (this.low >>> 0) + (word.low >>> 0);
    let highAdd = (this.high >>> 0) + (word.high >>> 0);
    if (lowAdd > 0xffffffff) {
      highAdd += 1;
    }
    this.low = lowAdd | 0;
    this.high = highAdd | 0;
  }

  copyTo(bytes, offset) {
    bytes[offset] = (this.high >>> 24) & 0xff;
    bytes[offset + 1] = (this.high >> 16) & 0xff;
    bytes[offset + 2] = (this.high >> 8) & 0xff;
    bytes[offset + 3] = this.high & 0xff;
    bytes[offset + 4] = (this.low >>> 24) & 0xff;
    bytes[offset + 5] = (this.low >> 16) & 0xff;
    bytes[offset + 6] = (this.low >> 8) & 0xff;
    bytes[offset + 7] = this.low & 0xff;
  }

  assign(word) {
    this.high = word.high;
    this.low = word.low;
  }
}

const PARAMS = {
  get k() {
    return shadow(this, "k", [
      new Word64(0x428a2f98, 0xd728ae22),
      new Word64(0x71374491, 0x23ef65cd),
      new Word64(0xb5c0fbcf, 0xec4d3b2f),
      new Word64(0xe9b5dba5, 0x8189dbbc),
      new Word64(0x3956c25b, 0xf348b538),
      new Word64(0x59f111f1, 0xb605d019),
      new Word64(0x923f82a4, 0xaf194f9b),
      new Word64(0xab1c5ed5, 0xda6d8118),
      new Word64(0xd807aa98, 0xa3030242),
      new Word64(0x12835b01, 0x45706fbe),
      new Word64(0x243185be, 0x4ee4b28c),
      new Word64(0x550c7dc3, 0xd5ffb4e2),
      new Word64(0x72be5d74, 0xf27b896f),
      new Word64(0x80deb1fe, 0x3b1696b1),
      new Word64(0x9bdc06a7, 0x25c71235),
      new Word64(0xc19bf174, 0xcf692694),
      new Word64(0xe49b69c1, 0x9ef14ad2),
      new Word64(0xefbe4786, 0x384f25e3),
      new Word64(0x0fc19dc6, 0x8b8cd5b5),
      new Word64(0x240ca1cc, 0x77ac9c65),
      new Word64(0x2de92c6f, 0x592b0275),
      new Word64(0x4a7484aa, 0x6ea6e483),
      new Word64(0x5cb0a9dc, 0xbd41fbd4),
      new Word64(0x76f988da, 0x831153b5),
      new Word64(0x983e5152, 0xee66dfab),
      new Word64(0xa831c66d, 0x2db43210),
      new Word64(0xb00327c8, 0x98fb213f),
      new Word64(0xbf597fc7, 0xbeef0ee4),
      new Word64(0xc6e00bf3, 0x3da88fc2),
      new Word64(0xd5a79147, 0x930aa725),
      new Word64(0x06ca6351, 0xe003826f),
      new Word64(0x14292967, 0x0a0e6e70),
      new Word64(0x27b70a85, 0x46d22ffc),
      new Word64(0x2e1b2138, 0x5c26c926),
      new Word64(0x4d2c6dfc, 0x5ac42aed),
      new Word64(0x53380d13, 0x9d95b3df),
      new Word64(0x650a7354, 0x8baf63de),
      new Word64(0x766a0abb, 0x3c77b2a8),
      new Word64(0x81c2c92e, 0x47edaee6),
      new Word64(0x92722c85, 0x1482353b),
      new Word64(0xa2bfe8a1, 0x4cf10364),
      new Word64(0xa81a664b, 0xbc423001),
      new Word64(0xc24b8b70, 0xd0f89791),
      new Word64(0xc76c51a3, 0x0654be30),
      new Word64(0xd192e819, 0xd6ef5218),
      new Word64(0xd6990624, 0x5565a910),
      new Word64(0xf40e3585, 0x5771202a),
      new Word64(0x106aa070, 0x32bbd1b8),
      new Word64(0x19a4c116, 0xb8d2d0c8),
      new Word64(0x1e376c08, 0x5141ab53),
      new Word64(0x2748774c, 0xdf8eeb99),
      new Word64(0x34b0bcb5, 0xe19b48a8),
      new Word64(0x391c0cb3, 0xc5c95a63),
      new Word64(0x4ed8aa4a, 0xe3418acb),
      new Word64(0x5b9cca4f, 0x7763e373),
      new Word64(0x682e6ff3, 0xd6b2b8a3),
      new Word64(0x748f82ee, 0x5defb2fc),
      new Word64(0x78a5636f, 0x43172f60),
      new Word64(0x84c87814, 0xa1f0ab72),
      new Word64(0x8cc70208, 0x1a6439ec),
      new Word64(0x90befffa, 0x23631e28),
      new Word64(0xa4506ceb, 0xde82bde9),
      new Word64(0xbef9a3f7, 0xb2c67915),
      new Word64(0xc67178f2, 0xe372532b),
      new Word64(0xca273ece, 0xea26619c),
      new Word64(0xd186b8c7, 0x21c0c207),
      new Word64(0xeada7dd6, 0xcde0eb1e),
      new Word64(0xf57d4f7f, 0xee6ed178),
      new Word64(0x06f067aa, 0x72176fba),
      new Word64(0x0a637dc5, 0xa2c898a6),
      new Word64(0x113f9804, 0xbef90dae),
      new Word64(0x1b710b35, 0x131c471b),
      new Word64(0x28db77f5, 0x23047d84),
      new Word64(0x32caab7b, 0x40c72493),
      new Word64(0x3c9ebe0a, 0x15c9bebc),
      new Word64(0x431d67c4, 0x9c100d4c),
      new Word64(0x4cc5d4be, 0xcb3e42b6),
      new Word64(0x597f299c, 0xfc657e2a),
      new Word64(0x5fcb6fab, 0x3ad6faec),
      new Word64(0x6c44198c, 0x4a475817),
    ]);
  },
};

function ch(result, x, y, z, tmp) {
  result.assign(x);
  result.and(y);
  tmp.assign(x);
  tmp.not();
  tmp.and(z);
  result.xor(tmp);
}

function maj(result, x, y, z, tmp) {
  result.assign(x);
  result.and(y);
  tmp.assign(x);
  tmp.and(z);
  result.xor(tmp);
  tmp.assign(y);
  tmp.and(z);
  result.xor(tmp);
}

function sigma(result, x, tmp) {
  result.assign(x);
  result.rotateRight(28);
  tmp.assign(x);
  tmp.rotateRight(34);
  result.xor(tmp);
  tmp.assign(x);
  tmp.rotateRight(39);
  result.xor(tmp);
}

function sigmaPrime(result, x, tmp) {
  result.assign(x);
  result.rotateRight(14);
  tmp.assign(x);
  tmp.rotateRight(18);
  result.xor(tmp);
  tmp.assign(x);
  tmp.rotateRight(41);
  result.xor(tmp);
}

function littleSigma(result, x, tmp) {
  result.assign(x);
  result.rotateRight(1);
  tmp.assign(x);
  tmp.rotateRight(8);
  result.xor(tmp);
  tmp.assign(x);
  tmp.shiftRight(7);
  result.xor(tmp);
}

function littleSigmaPrime(result, x, tmp) {
  result.assign(x);
  result.rotateRight(19);
  tmp.assign(x);
  tmp.rotateRight(61);
  result.xor(tmp);
  tmp.assign(x);
  tmp.shiftRight(6);
  result.xor(tmp);
}

function calculateSHA512(data, offset, length, mode384 = false) {
  // initial hash values
  let h0, h1, h2, h3, h4, h5, h6, h7;
  if (!mode384) {
    h0 = new Word64(0x6a09e667, 0xf3bcc908);
    h1 = new Word64(0xbb67ae85, 0x84caa73b);
    h2 = new Word64(0x3c6ef372, 0xfe94f82b);
    h3 = new Word64(0xa54ff53a, 0x5f1d36f1);
    h4 = new Word64(0x510e527f, 0xade682d1);
    h5 = new Word64(0x9b05688c, 0x2b3e6c1f);
    h6 = new Word64(0x1f83d9ab, 0xfb41bd6b);
    h7 = new Word64(0x5be0cd19, 0x137e2179);
  } else {
    // SHA384 is exactly the same
    // except with different starting values and a trimmed result
    h0 = new Word64(0xcbbb9d5d, 0xc1059ed8);
    h1 = new Word64(0x629a292a, 0x367cd507);
    h2 = new Word64(0x9159015a, 0x3070dd17);
    h3 = new Word64(0x152fecd8, 0xf70e5939);
    h4 = new Word64(0x67332667, 0xffc00b31);
    h5 = new Word64(0x8eb44a87, 0x68581511);
    h6 = new Word64(0xdb0c2e0d, 0x64f98fa7);
    h7 = new Word64(0x47b5481d, 0xbefa4fa4);
  }

  // pre-processing
  const paddedLength = Math.ceil((length + 17) / 128) * 128;
  const padded = new Uint8Array(paddedLength);
  let i, j;
  for (i = 0; i < length; ++i) {
    padded[i] = data[offset++];
  }
  padded[i++] = 0x80;
  const n = paddedLength - 16;
  if (i < n) {
    i = n;
  }
  i += 11;
  padded[i++] = (length >>> 29) & 0xff;
  padded[i++] = (length >> 21) & 0xff;
  padded[i++] = (length >> 13) & 0xff;
  padded[i++] = (length >> 5) & 0xff;
  padded[i++] = (length << 3) & 0xff;

  const w = new Array(80);
  for (i = 0; i < 80; i++) {
    w[i] = new Word64(0, 0);
  }
  const { k } = PARAMS;

  let a = new Word64(0, 0),
    b = new Word64(0, 0),
    c = new Word64(0, 0);
  let d = new Word64(0, 0),
    e = new Word64(0, 0),
    f = new Word64(0, 0);
  let g = new Word64(0, 0),
    h = new Word64(0, 0);
  const t1 = new Word64(0, 0),
    t2 = new Word64(0, 0);
  const tmp1 = new Word64(0, 0),
    tmp2 = new Word64(0, 0);
  let tmp3;

  // for each 1024 bit block
  for (i = 0; i < paddedLength; ) {
    for (j = 0; j < 16; ++j) {
      w[j].high =
        (padded[i] << 24) |
        (padded[i + 1] << 16) |
        (padded[i + 2] << 8) |
        padded[i + 3];
      w[j].low =
        (padded[i + 4] << 24) |
        (padded[i + 5] << 16) |
        (padded[i + 6] << 8) |
        padded[i + 7];
      i += 8;
    }
    for (j = 16; j < 80; ++j) {
      tmp3 = w[j];
      littleSigmaPrime(tmp3, w[j - 2], tmp2);
      tmp3.add(w[j - 7]);
      littleSigma(tmp1, w[j - 15], tmp2);
      tmp3.add(tmp1);
      tmp3.add(w[j - 16]);
    }

    a.assign(h0);
    b.assign(h1);
    c.assign(h2);
    d.assign(h3);
    e.assign(h4);
    f.assign(h5);
    g.assign(h6);
    h.assign(h7);
    for (j = 0; j < 80; ++j) {
      t1.assign(h);
      sigmaPrime(tmp1, e, tmp2);
      t1.add(tmp1);
      ch(tmp1, e, f, g, tmp2);
      t1.add(tmp1);
      t1.add(k[j]);
      t1.add(w[j]);

      sigma(t2, a, tmp2);
      maj(tmp1, a, b, c, tmp2);
      t2.add(tmp1);

      tmp3 = h;
      h = g;
      g = f;
      f = e;
      d.add(t1);
      e = d;
      d = c;
      c = b;
      b = a;
      tmp3.assign(t1);
      tmp3.add(t2);
      a = tmp3;
    }
    h0.add(a);
    h1.add(b);
    h2.add(c);
    h3.add(d);
    h4.add(e);
    h5.add(f);
    h6.add(g);
    h7.add(h);
  }

  let result;
  if (!mode384) {
    result = new Uint8Array(64);
    h0.copyTo(result, 0);
    h1.copyTo(result, 8);
    h2.copyTo(result, 16);
    h3.copyTo(result, 24);
    h4.copyTo(result, 32);
    h5.copyTo(result, 40);
    h6.copyTo(result, 48);
    h7.copyTo(result, 56);
  } else {
    result = new Uint8Array(48);
    h0.copyTo(result, 0);
    h1.copyTo(result, 8);
    h2.copyTo(result, 16);
    h3.copyTo(result, 24);
    h4.copyTo(result, 32);
    h5.copyTo(result, 40);
  }
  return result;
}

function calculateSHA384(data, offset, length) {
  return calculateSHA512(data, offset, length, /* mode384 = */ true);
}

export { calculateSHA384, calculateSHA512 };
