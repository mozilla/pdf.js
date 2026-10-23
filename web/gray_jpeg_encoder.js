// Baseline single-component (grayscale) JPEG encoder; jsPDF maps 1 component to /DeviceGray.
const ZIGZAG = [
  0, 1, 5, 6, 14, 15, 27, 28, 2, 4, 7, 13, 16, 26, 29, 42,
  3, 8, 12, 17, 25, 30, 41, 43, 9, 11, 18, 24, 31, 40, 44, 53,
  10, 19, 23, 32, 39, 45, 52, 54, 20, 22, 33, 38, 46, 51, 55, 60,
  21, 34, 37, 47, 50, 56, 59, 61, 35, 36, 48, 49, 57, 58, 62, 63,
];
const STD_Y_QT = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];
const DC_NRCODES = [0, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_NRCODES = [0, 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const AC_VALUES = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];
const AASF = [1.0, 1.387039845, 1.306562965, 1.175875602, 1.0, 0.785694958, 0.5411961, 0.275899379];

function buildHuffman(nrcodes, values) {
  const table = [];
  let code = 0, pos = 0;
  for (let len = 1; len <= 16; len++) {
    for (let j = 0; j < nrcodes[len]; j++) {
      table[values[pos++]] = [code++, len];
    }
    code <<= 1;
  }
  return table;
}
const HT_DC = buildHuffman(DC_NRCODES, DC_VALUES);
const HT_AC = buildHuffman(AC_NRCODES, AC_VALUES);

// AAN forward DCT on 8 values with stride s.
function fdct1d(d, o, s) {
  const t0 = d[o] + d[o + 7 * s], t7 = d[o] - d[o + 7 * s];
  const t1 = d[o + s] + d[o + 6 * s], t6 = d[o + s] - d[o + 6 * s];
  const t2 = d[o + 2 * s] + d[o + 5 * s], t5 = d[o + 2 * s] - d[o + 5 * s];
  const t3 = d[o + 3 * s] + d[o + 4 * s], t4 = d[o + 3 * s] - d[o + 4 * s];
  let t10 = t0 + t3, t13 = t0 - t3, t11 = t1 + t2, t12 = t1 - t2;
  d[o] = t10 + t11;
  d[o + 4 * s] = t10 - t11;
  const z1 = (t12 + t13) * 0.707106781;
  d[o + 2 * s] = t13 + z1;
  d[o + 6 * s] = t13 - z1;
  t10 = t4 + t5;
  t11 = t5 + t6;
  t12 = t6 + t7;
  const z5 = (t10 - t12) * 0.382683433;
  const z2 = 0.5411961 * t10 + z5;
  const z4 = 1.306562965 * t12 + z5;
  const z3 = t11 * 0.707106781;
  const z11 = t7 + z3, z13 = t7 - z3;
  d[o + 5 * s] = z13 + z2;
  d[o + 3 * s] = z13 - z2;
  d[o + s] = z11 + z4;
  d[o + 7 * s] = z11 - z4;
}

function bits(v) {
  const a = v < 0 ? -v : v;
  let len = 0;
  while (a >> len) {
    len++;
  }
  return [v < 0 ? v + (1 << len) - 1 : v, len];
}

function encodeGrayJpeg(canvas, quality = 50) {
  const w = canvas.width, h = canvas.height;
  const rgba = canvas.getContext("2d").getImageData(0, 0, w, h).data;

  quality = Math.min(100, Math.max(1, quality));
  const sf = quality < 50 ? Math.floor(5000 / quality) : 200 - quality * 2;
  const qt = new Uint8Array(64); // zigzag order
  for (let i = 0; i < 64; i++) {
    qt[ZIGZAG[i]] = Math.min(255, Math.max(1, Math.floor((STD_Y_QT[i] * sf + 50) / 100)));
  }
  const fdtbl = new Float64Array(64);
  for (let r = 0, k = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++, k++) {
      fdtbl[k] = 1 / (qt[ZIGZAG[k]] * AASF[r] * AASF[c] * 8);
    }
  }

  const out = [];
  const word = v => out.push(v >> 8, v & 0xff);
  let bitBuf = 0, bitPos = 7;
  const writeBits = ([value, len]) => {
    for (let p = len - 1; p >= 0; p--) {
      if (value & (1 << p)) {
        bitBuf |= 1 << bitPos;
      }
      if (--bitPos < 0) {
        out.push(bitBuf);
        if (bitBuf === 0xff) {
          out.push(0);
        }
        bitBuf = 0;
        bitPos = 7;
      }
    }
  };

  word(0xffd8); // SOI
  word(0xffe0); // APP0 JFIF (jsPDF expects it right after SOI)
  word(16);
  out.push(0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0);
  word(0xffdb); // DQT
  word(67);
  out.push(0, ...qt);
  word(0xffc0); // SOF0
  word(11);
  out.push(8);
  word(h);
  word(w);
  out.push(1, 1, 0x11, 0);
  word(0xffc4); // DHT
  word(210);
  out.push(0x00, ...DC_NRCODES.slice(1), ...DC_VALUES);
  out.push(0x10, ...AC_NRCODES.slice(1), ...AC_VALUES);
  word(0xffda); // SOS
  word(8);
  out.push(1, 1, 0x00, 0, 63, 0);

  const block = new Float64Array(64);
  const du = new Int32Array(64);
  let dc = 0;
  for (let by = 0; by < h; by += 8) {
    for (let bx = 0; bx < w; bx += 8) {
      for (let k = 0; k < 64; k++) {
        const y = Math.min(by + (k >> 3), h - 1);
        const x = Math.min(bx + (k & 7), w - 1);
        const p = (y * w + x) * 4;
        block[k] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2] - 128;
      }
      for (let i = 0; i < 8; i++) {
        fdct1d(block, i * 8, 1);
      }
      for (let i = 0; i < 8; i++) {
        fdct1d(block, i, 8);
      }
      for (let k = 0; k < 64; k++) {
        du[ZIGZAG[k]] = Math.round(block[k] * fdtbl[k]);
      }

      const [dv, dl] = bits(du[0] - dc);
      dc = du[0];
      writeBits(HT_DC[dl]);
      if (dl) {
        writeBits([dv, dl]);
      }

      let end = 63;
      while (end > 0 && du[end] === 0) {
        end--;
      }
      let run = 0;
      for (let i = 1; i <= end; i++) {
        if (du[i] === 0) {
          run++;
          continue;
        }
        while (run >= 16) {
          writeBits(HT_AC[0xf0]);
          run -= 16;
        }
        const [av, al] = bits(du[i]);
        writeBits(HT_AC[(run << 4) | al]);
        writeBits([av, al]);
        run = 0;
      }
      if (end < 63) {
        writeBits(HT_AC[0x00]); // EOB
      }
    }
  }
  if (bitPos < 7) {
    writeBits([(1 << (bitPos + 1)) - 1, bitPos + 1]);
  }
  word(0xffd9); // EOI
  return new Uint8Array(out);
}

export { encodeGrayJpeg };
