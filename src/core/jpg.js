/* Copyright 2014 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { assert, BaseException, warn } from "../shared/util.js";
import { ColorSpaceUtils } from "./colorspace_utils.js";
import { DeviceCmykCS } from "./colorspace.js";
import { grayToRGBA } from "../shared/image_utils.js";
import { readUint16 } from "./core_utils.js";

class JpegError extends BaseException {
  constructor(msg) {
    super(msg, "JpegError");
  }
}

class DNLMarkerError extends BaseException {
  constructor(message, scanLines) {
    super(message, "DNLMarkerError");
    this.scanLines = scanLines;
  }
}

class EOIMarkerError extends BaseException {
  constructor(msg) {
    super(msg, "EOIMarkerError");
  }
}

/**
 * This code was forked from https://github.com/notmasteryet/jpgjs.
 * The original version was created by GitHub user notmasteryet.
 *
 * - The JPEG specification can be found in the ITU CCITT Recommendation T.81
 *   (www.w3.org/Graphics/JPEG/itu-t81.pdf)
 * - The JFIF specification can be found in the JPEG File Interchange Format
 *   (www.w3.org/Graphics/JPEG/jfif3.pdf)
 * - The Adobe Application-Specific JPEG markers in the
 *   Supporting the DCT Filters in PostScript Level 2, Technical Note #5116
 *   (partners.adobe.com/public/developer/en/ps/sdk/5116.DCT_Filter.pdf)
 */

// prettier-ignore
const dctZigZag = new Uint8Array([
   0,
   1,  8,
  16,  9,  2,
   3, 10, 17, 24,
  32, 25, 18, 11, 4,
   5, 12, 19, 26, 33, 40,
  48, 41, 34, 27, 20, 13,  6,
   7, 14, 21, 28, 35, 42, 49, 56,
  57, 50, 43, 36, 29, 22, 15,
  23, 30, 37, 44, 51, 58,
  59, 52, 45, 38, 31,
  39, 46, 53, 60,
  61, 54, 47,
  55, 62,
  63
]);

const dctCos1 = 4017; // cos(pi/16)
const dctSin1 = 799; // sin(pi/16)
const dctCos3 = 3406; // cos(3*pi/16)
const dctSin3 = 2276; // sin(3*pi/16)
const dctCos6 = 1567; // cos(6*pi/16)
const dctSin6 = 3784; // sin(6*pi/16)
const dctSqrt2 = 5793; // sqrt(2)
const dctSqrt1d2 = 2896; // sqrt(2) / 2

function buildHuffmanTable(codeLengths, values) {
  let k = 0,
    i,
    j,
    length = 16;
  while (length > 0 && !codeLengths[length - 1]) {
    length--;
  }
  const code = [{ children: [], index: 0 }];
  let p = code[0],
    q;
  for (i = 0; i < length; i++) {
    for (j = 0; j < codeLengths[i]; j++) {
      p = code.pop();
      p.children[p.index] = values[k];
      while (p.index > 0) {
        p = code.pop();
      }
      p.index++;
      code.push(p);
      while (code.length <= i) {
        code.push((q = { children: [], index: 0 }));
        p.children[p.index] = q.children;
        p = q;
      }
      k++;
    }
    if (i + 1 < length) {
      // p here points to last code
      code.push((q = { children: [], index: 0 }));
      p.children[p.index] = q.children;
      p = q;
    }
  }
  return code[0].children;
}

function getBlockBufferOffset(component, row, col) {
  return 64 * ((component.blocksPerLine + 1) * row + col);
}

function decodeScan(
  data,
  offset,
  frame,
  components,
  resetInterval,
  spectralStart,
  spectralEnd,
  successivePrev,
  successive,
  parseDNLMarker = false
) {
  const mcusPerLine = frame.mcusPerLine;
  const progressive = frame.progressive;

  const startOffset = offset;
  let bitsData = 0,
    bitsCount = 0;

  function readBit() {
    if (bitsCount > 0) {
      bitsCount--;
      return (bitsData >> bitsCount) & 1;
    }
    bitsData = data[offset++];
    if (bitsData === 0xff) {
      const nextByte = data[offset++];
      if (nextByte) {
        if (nextByte === /* DNL = */ 0xdc && parseDNLMarker) {
          offset += 2; // Skip marker length.

          const scanLines = readUint16(data, offset);
          offset += 2;
          if (scanLines > 0 && scanLines !== frame.scanLines) {
            throw new DNLMarkerError(
              "Found DNL marker (0xFFDC) while parsing scan data",
              scanLines
            );
          }
        } else if (nextByte === /* EOI = */ 0xd9) {
          if (parseDNLMarker) {
            // NOTE: only 8-bit JPEG images are supported in this decoder.
            const maybeScanLines = blockRow * (frame.precision === 8 ? 8 : 0);
            // Heuristic to attempt to handle corrupt JPEG images with too
            // large `scanLines` parameter, by falling back to the currently
            // parsed number of scanLines when it's at least (approximately)
            // one "half" order of magnitude smaller than expected (fixes
            // issue10880.pdf, issue10989.pdf, issue15492.pdf).
            if (
              maybeScanLines > 0 &&
              Math.round(frame.scanLines / maybeScanLines) >= 5
            ) {
              throw new DNLMarkerError(
                "Found EOI marker (0xFFD9) while parsing scan data, " +
                  "possibly caused by incorrect `scanLines` parameter",
                maybeScanLines
              );
            }
          }
          throw new EOIMarkerError(
            "Found EOI marker (0xFFD9) while parsing scan data"
          );
        }
        throw new JpegError(
          `unexpected marker ${((bitsData << 8) | nextByte).toString(16)}`
        );
      }
      // unstuff 0
    }
    bitsCount = 7;
    return bitsData >>> 7;
  }

  function decodeHuffman(tree) {
    let node = tree;
    while (true) {
      node = node[readBit()];
      switch (typeof node) {
        case "number":
          return node;
        case "object":
          continue;
      }
      throw new JpegError("invalid huffman sequence");
    }
  }

  function receive(length) {
    let n = 0;
    while (length > 0) {
      n = (n << 1) | readBit();
      length--;
    }
    return n;
  }

  function receiveAndExtend(length) {
    if (length === 1) {
      return readBit() === 1 ? 1 : -1;
    }
    const n = receive(length);
    if (n >= 1 << (length - 1)) {
      return n;
    }
    return n + (-1 << length) + 1;
  }

  function decodeBaseline(component, blockOffset) {
    const t = decodeHuffman(component.huffmanTableDC);
    const diff = t === 0 ? 0 : receiveAndExtend(t);
    component.blockData[blockOffset] = component.pred += diff;
    let k = 1;
    while (k < 64) {
      const rs = decodeHuffman(component.huffmanTableAC);
      const s = rs & 15,
        r = rs >> 4;
      if (s === 0) {
        if (r < 15) {
          break;
        }
        k += 16;
        continue;
      }
      k += r;
      const z = dctZigZag[k];
      component.blockData[blockOffset + z] = receiveAndExtend(s);
      k++;
    }
  }

  function decodeDCFirst(component, blockOffset) {
    const t = decodeHuffman(component.huffmanTableDC);
    const diff = t === 0 ? 0 : receiveAndExtend(t) << successive;
    component.blockData[blockOffset] = component.pred += diff;
  }

  function decodeDCSuccessive(component, blockOffset) {
    component.blockData[blockOffset] |= readBit() << successive;
  }

  let eobrun = 0;
  function decodeACFirst(component, blockOffset) {
    if (eobrun > 0) {
      eobrun--;
      return;
    }
    let k = spectralStart;
    const e = spectralEnd;
    while (k <= e) {
      const rs = decodeHuffman(component.huffmanTableAC);
      const s = rs & 15,
        r = rs >> 4;
      if (s === 0) {
        if (r < 15) {
          eobrun = receive(r) + (1 << r) - 1;
          break;
        }
        k += 16;
        continue;
      }
      k += r;
      const z = dctZigZag[k];
      component.blockData[blockOffset + z] =
        receiveAndExtend(s) * (1 << successive);
      k++;
    }
  }

  let successiveACState = 0,
    successiveACNextValue;
  function decodeACSuccessive(component, blockOffset) {
    let k = spectralStart;
    const e = spectralEnd;
    let r = 0;
    let s;
    let rs;
    while (k <= e) {
      const offsetZ = blockOffset + dctZigZag[k];
      const sign = component.blockData[offsetZ] < 0 ? -1 : 1;
      switch (successiveACState) {
        case 0: // initial state
          rs = decodeHuffman(component.huffmanTableAC);
          s = rs & 15;
          r = rs >> 4;
          if (s === 0) {
            if (r < 15) {
              eobrun = receive(r) + (1 << r);
              successiveACState = 4;
            } else {
              r = 16;
              successiveACState = 1;
            }
          } else {
            if (s !== 1) {
              throw new JpegError("invalid ACn encoding");
            }
            successiveACNextValue = receiveAndExtend(s);
            successiveACState = r ? 2 : 3;
          }
          continue;
        case 1: // skipping r zero items
        case 2:
          if (component.blockData[offsetZ]) {
            component.blockData[offsetZ] += sign * (readBit() << successive);
          } else {
            r--;
            if (r === 0) {
              successiveACState = successiveACState === 2 ? 3 : 0;
            }
          }
          break;
        case 3: // set value for a zero item
          if (component.blockData[offsetZ]) {
            component.blockData[offsetZ] += sign * (readBit() << successive);
          } else {
            component.blockData[offsetZ] = successiveACNextValue << successive;
            successiveACState = 0;
          }
          break;
        case 4: // eob
          if (component.blockData[offsetZ]) {
            component.blockData[offsetZ] += sign * (readBit() << successive);
          }
          break;
      }
      k++;
    }
    if (successiveACState === 4) {
      eobrun--;
      if (eobrun === 0) {
        successiveACState = 0;
      }
    }
  }

  let blockRow = 0;
  function decodeMcu(component, decode, mcu, row, col) {
    const mcuRow = (mcu / mcusPerLine) | 0;
    const mcuCol = mcu % mcusPerLine;
    blockRow = mcuRow * component.v + row;
    const blockCol = mcuCol * component.h + col;
    const blockOffset = getBlockBufferOffset(component, blockRow, blockCol);
    decode(component, blockOffset);
  }

  function decodeBlock(component, decode, mcu) {
    blockRow = (mcu / component.blocksPerLine) | 0;
    const blockCol = mcu % component.blocksPerLine;
    const blockOffset = getBlockBufferOffset(component, blockRow, blockCol);
    decode(component, blockOffset);
  }

  const componentsLength = components.length;
  let component, i, j, k, n;
  let decodeFn;
  if (progressive) {
    if (spectralStart === 0) {
      decodeFn = successivePrev === 0 ? decodeDCFirst : decodeDCSuccessive;
    } else {
      decodeFn = successivePrev === 0 ? decodeACFirst : decodeACSuccessive;
    }
  } else {
    decodeFn = decodeBaseline;
  }

  let mcu = 0,
    fileMarker;
  const mcuExpected =
    componentsLength === 1
      ? components[0].blocksPerLine * components[0].blocksPerColumn
      : mcusPerLine * frame.mcusPerColumn;

  let h, v;
  while (mcu <= mcuExpected) {
    // reset interval stuff
    const mcuToRead = resetInterval
      ? Math.min(mcuExpected - mcu, resetInterval)
      : mcuExpected;

    // The `mcuToRead === 0` case should only occur when all of the expected
    // MCU data has been already parsed, i.e. when `mcu === mcuExpected`, but
    // some corrupt JPEG images contain more data than intended and we thus
    // want to skip over any extra RSTx markers below (fixes issue11794.pdf).
    if (mcuToRead > 0) {
      for (i = 0; i < componentsLength; i++) {
        components[i].pred = 0;
      }
      eobrun = 0;

      if (componentsLength === 1) {
        component = components[0];
        for (n = 0; n < mcuToRead; n++) {
          decodeBlock(component, decodeFn, mcu);
          mcu++;
        }
      } else {
        for (n = 0; n < mcuToRead; n++) {
          for (i = 0; i < componentsLength; i++) {
            component = components[i];
            h = component.h;
            v = component.v;
            for (j = 0; j < v; j++) {
              for (k = 0; k < h; k++) {
                decodeMcu(component, decodeFn, mcu, j, k);
              }
            }
          }
          mcu++;
        }
      }
    }

    // find marker
    bitsCount = 0;
    fileMarker = findNextFileMarker(data, offset);
    if (!fileMarker) {
      break; // Reached the end of the image data without finding any marker.
    }
    if (fileMarker.invalid) {
      // Some bad images seem to pad Scan blocks with e.g. zero bytes, skip
      // past those to attempt to find a valid marker (fixes issue4090.pdf).
      const partialMsg = mcuToRead > 0 ? "unexpected" : "excessive";
      warn(
        `decodeScan - ${partialMsg} MCU data, current marker is: ${fileMarker.invalid}`
      );
      offset = fileMarker.offset;
    }
    if (fileMarker.marker >= 0xffd0 && fileMarker.marker <= 0xffd7) {
      // RSTx
      offset += 2;
    } else {
      break;
    }
  }

  return offset - startOffset;
}

// A port of poppler's IDCT method which in turn is taken from:
//   Christoph Loeffler, Adriaan Ligtenberg, George S. Moschytz,
//   'Practical Fast 1-D DCT Algorithms with 11 Multiplications',
//   IEEE Intl. Conf. on Acoustics, Speech & Signal Processing, 1989,
//   988-991.
function quantizeAndInverse(component, blockBufferOffset, p) {
  const qt = component.quantizationTable,
    blockData = component.blockData;
  let v0, v1, v2, v3, v4, v5, v6, v7;
  let p0, p1, p2, p3, p4, p5, p6, p7;
  let t;

  if (!qt) {
    throw new JpegError("missing required Quantization Table.");
  }

  // inverse DCT on rows
  for (let row = 0; row < 64; row += 8) {
    // gather block data
    p0 = blockData[blockBufferOffset + row];
    p1 = blockData[blockBufferOffset + row + 1];
    p2 = blockData[blockBufferOffset + row + 2];
    p3 = blockData[blockBufferOffset + row + 3];
    p4 = blockData[blockBufferOffset + row + 4];
    p5 = blockData[blockBufferOffset + row + 5];
    p6 = blockData[blockBufferOffset + row + 6];
    p7 = blockData[blockBufferOffset + row + 7];

    // dequant p0
    p0 *= qt[row];

    // check for all-zero AC coefficients
    if ((p1 | p2 | p3 | p4 | p5 | p6 | p7) === 0) {
      t = (dctSqrt2 * p0 + 512) >> 10;
      p[row] = t;
      p[row + 1] = t;
      p[row + 2] = t;
      p[row + 3] = t;
      p[row + 4] = t;
      p[row + 5] = t;
      p[row + 6] = t;
      p[row + 7] = t;
      continue;
    }
    // dequant p1 ... p7
    p1 *= qt[row + 1];
    p2 *= qt[row + 2];
    p3 *= qt[row + 3];
    p4 *= qt[row + 4];
    p5 *= qt[row + 5];
    p6 *= qt[row + 6];
    p7 *= qt[row + 7];

    // stage 4
    v0 = (dctSqrt2 * p0 + 128) >> 8;
    v1 = (dctSqrt2 * p4 + 128) >> 8;
    v2 = p2;
    v3 = p6;
    v4 = (dctSqrt1d2 * (p1 - p7) + 128) >> 8;
    v7 = (dctSqrt1d2 * (p1 + p7) + 128) >> 8;
    v5 = p3 << 4;
    v6 = p5 << 4;

    // stage 3
    v0 = (v0 + v1 + 1) >> 1;
    v1 = v0 - v1;
    t = (v2 * dctSin6 + v3 * dctCos6 + 128) >> 8;
    v2 = (v2 * dctCos6 - v3 * dctSin6 + 128) >> 8;
    v3 = t;
    v4 = (v4 + v6 + 1) >> 1;
    v6 = v4 - v6;
    v7 = (v7 + v5 + 1) >> 1;
    v5 = v7 - v5;

    // stage 2
    v0 = (v0 + v3 + 1) >> 1;
    v3 = v0 - v3;
    v1 = (v1 + v2 + 1) >> 1;
    v2 = v1 - v2;
    t = (v4 * dctSin3 + v7 * dctCos3 + 2048) >> 12;
    v4 = (v4 * dctCos3 - v7 * dctSin3 + 2048) >> 12;
    v7 = t;
    t = (v5 * dctSin1 + v6 * dctCos1 + 2048) >> 12;
    v5 = (v5 * dctCos1 - v6 * dctSin1 + 2048) >> 12;
    v6 = t;

    // stage 1
    p[row] = v0 + v7;
    p[row + 7] = v0 - v7;
    p[row + 1] = v1 + v6;
    p[row + 6] = v1 - v6;
    p[row + 2] = v2 + v5;
    p[row + 5] = v2 - v5;
    p[row + 3] = v3 + v4;
    p[row + 4] = v3 - v4;
  }

  // inverse DCT on columns
  for (let col = 0; col < 8; ++col) {
    p0 = p[col];
    p1 = p[col + 8];
    p2 = p[col + 16];
    p3 = p[col + 24];
    p4 = p[col + 32];
    p5 = p[col + 40];
    p6 = p[col + 48];
    p7 = p[col + 56];

    // check for all-zero AC coefficients
    if ((p1 | p2 | p3 | p4 | p5 | p6 | p7) === 0) {
      t = (dctSqrt2 * p0 + 8192) >> 14;
      // Convert to 8-bit.
      if (t < -2040) {
        t = 0;
      } else if (t >= 2024) {
        t = 255;
      } else {
        t = (t + 2056) >> 4;
      }
      blockData[blockBufferOffset + col] = t;
      blockData[blockBufferOffset + col + 8] = t;
      blockData[blockBufferOffset + col + 16] = t;
      blockData[blockBufferOffset + col + 24] = t;
      blockData[blockBufferOffset + col + 32] = t;
      blockData[blockBufferOffset + col + 40] = t;
      blockData[blockBufferOffset + col + 48] = t;
      blockData[blockBufferOffset + col + 56] = t;
      continue;
    }

    // stage 4
    v0 = (dctSqrt2 * p0 + 2048) >> 12;
    v1 = (dctSqrt2 * p4 + 2048) >> 12;
    v2 = p2;
    v3 = p6;
    v4 = (dctSqrt1d2 * (p1 - p7) + 2048) >> 12;
    v7 = (dctSqrt1d2 * (p1 + p7) + 2048) >> 12;
    v5 = p3;
    v6 = p5;

    // stage 3
    // Shift v0 by 128.5 << 5 here, so we don't need to shift p0...p7 when
    // converting to UInt8 range later.
    v0 = ((v0 + v1 + 1) >> 1) + 4112;
    v1 = v0 - v1;
    t = (v2 * dctSin6 + v3 * dctCos6 + 2048) >> 12;
    v2 = (v2 * dctCos6 - v3 * dctSin6 + 2048) >> 12;
    v3 = t;
    v4 = (v4 + v6 + 1) >> 1;
    v6 = v4 - v6;
    v7 = (v7 + v5 + 1) >> 1;
    v5 = v7 - v5;

    // stage 2
    v0 = (v0 + v3 + 1) >> 1;
    v3 = v0 - v3;
    v1 = (v1 + v2 + 1) >> 1;
    v2 = v1 - v2;
    t = (v4 * dctSin3 + v7 * dctCos3 + 2048) >> 12;
    v4 = (v4 * dctCos3 - v7 * dctSin3 + 2048) >> 12;
    v7 = t;
    t = (v5 * dctSin1 + v6 * dctCos1 + 2048) >> 12;
    v5 = (v5 * dctCos1 - v6 * dctSin1 + 2048) >> 12;
    v6 = t;

    // stage 1
    p0 = v0 + v7;
    p7 = v0 - v7;
    p1 = v1 + v6;
    p6 = v1 - v6;
    p2 = v2 + v5;
    p5 = v2 - v5;
    p3 = v3 + v4;
    p4 = v3 - v4;

    // Convert to 8-bit integers.
    if (p0 < 16) {
      p0 = 0;
    } else if (p0 >= 4080) {
      p0 = 255;
    } else {
      p0 >>= 4;
    }
    if (p1 < 16) {
      p1 = 0;
    } else if (p1 >= 4080) {
      p1 = 255;
    } else {
      p1 >>= 4;
    }
    if (p2 < 16) {
      p2 = 0;
    } else if (p2 >= 4080) {
      p2 = 255;
    } else {
      p2 >>= 4;
    }
    if (p3 < 16) {
      p3 = 0;
    } else if (p3 >= 4080) {
      p3 = 255;
    } else {
      p3 >>= 4;
    }
    if (p4 < 16) {
      p4 = 0;
    } else if (p4 >= 4080) {
      p4 = 255;
    } else {
      p4 >>= 4;
    }
    if (p5 < 16) {
      p5 = 0;
    } else if (p5 >= 4080) {
      p5 = 255;
    } else {
      p5 >>= 4;
    }
    if (p6 < 16) {
      p6 = 0;
    } else if (p6 >= 4080) {
      p6 = 255;
    } else {
      p6 >>= 4;
    }
    if (p7 < 16) {
      p7 = 0;
    } else if (p7 >= 4080) {
      p7 = 255;
    } else {
      p7 >>= 4;
    }

    // store block data
    blockData[blockBufferOffset + col] = p0;
    blockData[blockBufferOffset + col + 8] = p1;
    blockData[blockBufferOffset + col + 16] = p2;
    blockData[blockBufferOffset + col + 24] = p3;
    blockData[blockBufferOffset + col + 32] = p4;
    blockData[blockBufferOffset + col + 40] = p5;
    blockData[blockBufferOffset + col + 48] = p6;
    blockData[blockBufferOffset + col + 56] = p7;
  }
}

function buildComponentData(frame, component) {
  const blocksPerLine = component.blocksPerLine;
  const blocksPerColumn = component.blocksPerColumn;
  const computationBuffer = new Int16Array(64);

  for (let blockRow = 0; blockRow < blocksPerColumn; blockRow++) {
    for (let blockCol = 0; blockCol < blocksPerLine; blockCol++) {
      const offset = getBlockBufferOffset(component, blockRow, blockCol);
      quantizeAndInverse(component, offset, computationBuffer);
    }
  }
  return component.blockData;
}

function findNextFileMarker(data, currentPos, startPos = currentPos) {
  const maxPos = data.length - 1;
  let newPos = startPos < currentPos ? startPos : currentPos;

  if (currentPos >= maxPos) {
    return null; // Don't attempt to read non-existent data and just return.
  }
  const currentMarker = readUint16(data, currentPos);
  if (currentMarker >= 0xffc0 && currentMarker <= 0xfffe) {
    return {
      invalid: null,
      marker: currentMarker,
      offset: currentPos,
    };
  }
  let newMarker = readUint16(data, newPos);
  while (!(newMarker >= 0xffc0 && newMarker <= 0xfffe)) {
    if (++newPos >= maxPos) {
      return null; // Don't attempt to read non-existent data and just return.
    }
    newMarker = readUint16(data, newPos);
  }
  return {
    invalid: currentMarker.toString(16),
    marker: newMarker,
    offset: newPos,
  };
}

function prepareComponents(frame) {
  const mcusPerLine = Math.ceil(frame.samplesPerLine / 8 / frame.maxH);
  const mcusPerColumn = Math.ceil(frame.scanLines / 8 / frame.maxV);
  for (const component of frame.components) {
    const blocksPerLine = Math.ceil(
      (Math.ceil(frame.samplesPerLine / 8) * component.h) / frame.maxH
    );
    const blocksPerColumn = Math.ceil(
      (Math.ceil(frame.scanLines / 8) * component.v) / frame.maxV
    );
    const blocksPerLineForMcu = mcusPerLine * component.h;
    const blocksPerColumnForMcu = mcusPerColumn * component.v;

    const blocksBufferSize =
      64 * blocksPerColumnForMcu * (blocksPerLineForMcu + 1);
    component.blockData = new Int16Array(blocksBufferSize);
    component.blocksPerLine = blocksPerLine;
    component.blocksPerColumn = blocksPerColumn;
  }
  frame.mcusPerLine = mcusPerLine;
  frame.mcusPerColumn = mcusPerColumn;
}

function readDataBlock(data, offset) {
  const length = readUint16(data, offset);
  offset += 2;
  let endOffset = offset + length - 2;

  const fileMarker = findNextFileMarker(data, endOffset, offset);
  if (fileMarker?.invalid) {
    warn(
      "readDataBlock - incorrect length, current marker is: " +
        fileMarker.invalid
    );
    endOffset = fileMarker.offset;
  }

  const array = data.subarray(offset, endOffset);
  return {
    appData: array,
    oldOffset: offset,
    newOffset: offset + array.length,
  };
}

function skipData(data, offset) {
  const length = readUint16(data, offset);
  offset += 2;
  const endOffset = offset + length - 2;

  const fileMarker = findNextFileMarker(data, endOffset, offset);
  if (fileMarker?.invalid) {
    return fileMarker.offset;
  }
  return endOffset;
}

class JpegImage {
  constructor({ decodeTransform = null, colorTransform = -1 } = {}) {
    this._decodeTransform = decodeTransform;
    this._colorTransform = colorTransform;
  }

  static canUseImageDecoder(data, colorTransform = -1) {
    const jpegInfo = Object.create(null);
    let offset = 0;
    let numComponents = null;
    let fileMarker = readUint16(data, offset);
    offset += 2;
    if (fileMarker !== /* SOI (Start of Image) = */ 0xffd8) {
      throw new JpegError("SOI not found");
    }
    fileMarker = readUint16(data, offset);
    offset += 2;

    markerLoop: while (fileMarker !== /* EOI (End of Image) = */ 0xffd9) {
      switch (fileMarker) {
        case 0xffe1: // APP1 - Exif
          // TODO: Remove this once https://github.com/w3c/webcodecs/issues/870
          //       is fixed.
          const { appData, oldOffset, newOffset } = readDataBlock(data, offset);
          offset = newOffset;

          // 'Exif\x00\x00'
          if (
            appData[0] === 0x45 &&
            appData[1] === 0x78 &&
            appData[2] === 0x69 &&
            appData[3] === 0x66 &&
            appData[4] === 0 &&
            appData[5] === 0
          ) {
            if (jpegInfo.exifStart) {
              throw new JpegError("Duplicate EXIF-blocks found.");
            }
            // Don't do the EXIF-block replacement here, see `JpegStream`,
            // since that can modify the original PDF document.
            jpegInfo.exifStart = oldOffset + 6;
            jpegInfo.exifEnd = newOffset;
          }
          fileMarker = readUint16(data, offset);
          offset += 2;
          continue;
        case 0xffc0: // SOF0 (Start of Frame, Baseline DCT)
        case 0xffc1: // SOF1 (Start of Frame, Extended DCT)
        case 0xffc2: // SOF2 (Start of Frame, Progressive DCT)
          // Skip marker length.
          // Skip precision.
          // Skip scanLines.
          // Skip samplesPerLine.
          numComponents = data[offset + (2 + 1 + 2 + 2)];
          break markerLoop;
        case 0xffff: // Fill bytes
          if (data[offset] !== 0xff) {
            // Avoid skipping a valid marker.
            offset--;
          }
          break;
      }
      offset = skipData(data, offset);
      fileMarker = readUint16(data, offset);
      offset += 2;
    }
    if (numComponents === 3 && colorTransform === 0) {
      return null;
    }
    if (numComponents === 4) {
      jpegInfo.cmyk = true;
    }
    return jpegInfo;
  }

  parse(data, { dnlScanLines = null } = {}) {
    let offset = 0;
    let jfif = null;
    let adobe = null;
    let frame, resetInterval;
    let numSOSMarkers = 0;
    const quantizationTables = [];
    const huffmanTablesAC = [],
      huffmanTablesDC = [];

    let fileMarker = readUint16(data, offset);
    offset += 2;
    if (fileMarker !== /* SOI (Start of Image) = */ 0xffd8) {
      throw new JpegError("SOI not found");
    }
    fileMarker = readUint16(data, offset);
    offset += 2;

    markerLoop: while (fileMarker !== /* EOI (End of Image) = */ 0xffd9) {
      let i, j, l;
      switch (fileMarker) {
        case 0xffe0: // APP0 (Application Specific)
        case 0xffe1: // APP1
        case 0xffe2: // APP2
        case 0xffe3: // APP3
        case 0xffe4: // APP4
        case 0xffe5: // APP5
        case 0xffe6: // APP6
        case 0xffe7: // APP7
        case 0xffe8: // APP8
        case 0xffe9: // APP9
        case 0xffea: // APP10
        case 0xffeb: // APP11
        case 0xffec: // APP12
        case 0xffed: // APP13
        case 0xffee: // APP14
        case 0xffef: // APP15
        case 0xfffe: // COM (Comment)
          const { appData, newOffset } = readDataBlock(data, offset);
          offset = newOffset;

          if (fileMarker === 0xffe0) {
            // 'JFIF\x00'
            if (
              appData[0] === 0x4a &&
              appData[1] === 0x46 &&
              appData[2] === 0x49 &&
              appData[3] === 0x46 &&
              appData[4] === 0
            ) {
              jfif = {
                version: { major: appData[5], minor: appData[6] },
                densityUnits: appData[7],
                xDensity: (appData[8] << 8) | appData[9],
                yDensity: (appData[10] << 8) | appData[11],
                thumbWidth: appData[12],
                thumbHeight: appData[13],
                thumbData: appData.subarray(
                  14,
                  14 + 3 * appData[12] * appData[13]
                ),
              };
            }
          }
          // TODO APP1 - Exif
          if (fileMarker === 0xffee) {
            // 'Adobe'
            if (
              appData[0] === 0x41 &&
              appData[1] === 0x64 &&
              appData[2] === 0x6f &&
              appData[3] === 0x62 &&
              appData[4] === 0x65
            ) {
              adobe = {
                version: (appData[5] << 8) | appData[6],
                flags0: (appData[7] << 8) | appData[8],
                flags1: (appData[9] << 8) | appData[10],
                transformCode: appData[11],
              };
            }
          }
          break;

        case 0xffdb: // DQT (Define Quantization Tables)
          const quantizationTablesLength = readUint16(data, offset);
          offset += 2;
          const quantizationTablesEnd = quantizationTablesLength + offset - 2;
          let z;
          while (offset < quantizationTablesEnd) {
            const quantizationTableSpec = data[offset++];
            const tableData = new Uint16Array(64);
            if (quantizationTableSpec >> 4 === 0) {
              // 8 bit values
              for (j = 0; j < 64; j++) {
                z = dctZigZag[j];
                tableData[z] = data[offset++];
              }
            } else if (quantizationTableSpec >> 4 === 1) {
              // 16 bit values
              for (j = 0; j < 64; j++) {
                z = dctZigZag[j];
                tableData[z] = readUint16(data, offset);
                offset += 2;
              }
            } else {
              throw new JpegError("DQT - invalid table spec");
            }
            quantizationTables[quantizationTableSpec & 15] = tableData;
          }
          break;

        case 0xffc0: // SOF0 (Start of Frame, Baseline DCT)
        case 0xffc1: // SOF1 (Start of Frame, Extended DCT)
        case 0xffc2: // SOF2 (Start of Frame, Progressive DCT)
          if (frame) {
            throw new JpegError("Only single frame JPEGs supported");
          }
          offset += 2; // Skip marker length.

          frame = {};
          frame.extended = fileMarker === 0xffc1;
          frame.progressive = fileMarker === 0xffc2;
          frame.precision = data[offset++];
          const sofScanLines = readUint16(data, offset);
          offset += 2;
          frame.scanLines = dnlScanLines || sofScanLines;
          frame.samplesPerLine = readUint16(data, offset);
          offset += 2;
          frame.components = [];
          frame.componentIds = {};
          const componentsCount = data[offset++];
          let maxH = 0,
            maxV = 0;
          for (i = 0; i < componentsCount; i++) {
            const componentId = data[offset];
            const h = data[offset + 1] >> 4;
            const v = data[offset + 1] & 15;
            if (maxH < h) {
              maxH = h;
            }
            if (maxV < v) {
              maxV = v;
            }
            const qId = data[offset + 2];
            l = frame.components.push({
              h,
              v,
              quantizationId: qId,
              quantizationTable: null, // See comment below.
            });
            frame.componentIds[componentId] = l - 1;
            offset += 3;
          }
          frame.maxH = maxH;
          frame.maxV = maxV;
          prepareComponents(frame);
          break;

        case 0xffc4: // DHT (Define Huffman Tables)
          const huffmanLength = readUint16(data, offset);
          offset += 2;
          for (i = 2; i < huffmanLength; ) {
            const huffmanTableSpec = data[offset++];
            const codeLengths = new Uint8Array(16);
            let codeLengthSum = 0;
            for (j = 0; j < 16; j++, offset++) {
              codeLengthSum += codeLengths[j] = data[offset];
            }
            const huffmanValues = new Uint8Array(codeLengthSum);
            for (j = 0; j < codeLengthSum; j++, offset++) {
              huffmanValues[j] = data[offset];
            }
            i += 17 + codeLengthSum;

            (huffmanTableSpec >> 4 === 0 ? huffmanTablesDC : huffmanTablesAC)[
              huffmanTableSpec & 15
            ] = buildHuffmanTable(codeLengths, huffmanValues);
          }
          break;

        case 0xffdd: // DRI (Define Restart Interval)
          offset += 2; // Skip marker length.

          resetInterval = readUint16(data, offset);
          offset += 2;
          break;

        case 0xffda: // SOS (Start of Scan)
          // A DNL marker (0xFFDC), if it exists, is only allowed at the end
          // of the first scan segment and may only occur once in an image.
          // Furthermore, to prevent an infinite loop, do *not* attempt to
          // parse DNL markers during re-parsing of the JPEG scan data.
          const parseDNLMarker = ++numSOSMarkers === 1 && !dnlScanLines;

          offset += 2; // Skip marker length.

          const selectorsCount = data[offset++],
            components = [];
          for (i = 0; i < selectorsCount; i++) {
            const index = data[offset++];
            const componentIndex = frame.componentIds[index];
            const component = frame.components[componentIndex];
            component.index = index;
            const tableSpec = data[offset++];
            component.huffmanTableDC = huffmanTablesDC[tableSpec >> 4];
            component.huffmanTableAC = huffmanTablesAC[tableSpec & 15];
            components.push(component);
          }
          const spectralStart = data[offset++],
            spectralEnd = data[offset++],
            successiveApproximation = data[offset++];
          try {
            const processed = decodeScan(
              data,
              offset,
              frame,
              components,
              resetInterval,
              spectralStart,
              spectralEnd,
              successiveApproximation >> 4,
              successiveApproximation & 15,
              parseDNLMarker
            );
            offset += processed;
          } catch (ex) {
            if (ex instanceof DNLMarkerError) {
              warn(`${ex.message} -- attempting to re-parse the JPEG image.`);
              return this.parse(data, { dnlScanLines: ex.scanLines });
            } else if (ex instanceof EOIMarkerError) {
              warn(`${ex.message} -- ignoring the rest of the image data.`);
              break markerLoop;
            }
            throw ex;
          }
          break;

        case 0xffdc: // DNL (Define Number of Lines)
          // Ignore the marker, since it's being handled in `decodeScan`.
          offset += 4;
          break;

        case 0xffff: // Fill bytes
          if (data[offset] !== 0xff) {
            // Avoid skipping a valid marker.
            offset--;
          }
          break;

        default:
          // Could be incorrect encoding -- the last 0xFF byte of the previous
          // block could have been eaten by the encoder, hence we fallback to
          // `startPos = offset - 3` when looking for the next valid marker.
          const nextFileMarker = findNextFileMarker(
            data,
            /* currentPos = */ offset - 2,
            /* startPos = */ offset - 3
          );
          if (nextFileMarker?.invalid) {
            warn(
              "JpegImage.parse - unexpected data, current marker is: " +
                nextFileMarker.invalid
            );
            offset = nextFileMarker.offset;
            break;
          }
          if (!nextFileMarker || offset >= data.length - 1) {
            warn(
              "JpegImage.parse - reached the end of the image data " +
                "without finding an EOI marker (0xFFD9)."
            );
            break markerLoop;
          }
          throw new JpegError(
            "JpegImage.parse - unknown marker: " + fileMarker.toString(16)
          );
      }
      fileMarker = readUint16(data, offset);
      offset += 2;
    }

    if (!frame) {
      throw new JpegError("JpegImage.parse - no frame data found.");
    }
    this.width = frame.samplesPerLine;
    this.height = frame.scanLines;
    this.jfif = jfif;
    this.adobe = adobe;
    this.components = [];
    for (const component of frame.components) {
      // Prevent errors when DQT markers are placed after SOF{n} markers,
      // by assigning the `quantizationTable` entry after the entire image
      // has been parsed (fixes issue7406.pdf).
      const quantizationTable = quantizationTables[component.quantizationId];
      if (quantizationTable) {
        component.quantizationTable = quantizationTable;
      }

      this.components.push({
        index: component.index,
        output: buildComponentData(frame, component),
        scaleX: component.h / frame.maxH,
        scaleY: component.v / frame.maxV,
        blocksPerLine: component.blocksPerLine,
        blocksPerColumn: component.blocksPerColumn,
      });
    }
    this.numComponents = this.components.length;
    return undefined;
  }

  _getLinearizedBlockData(width, height, isSourcePDF = false) {
    const scaleX = this.width / width,
      scaleY = this.height / height;

    let component, componentScaleX, componentScaleY, blocksPerScanline;
    let x, y, i, j, k;
    let index;
    let offset = 0;
    let output;
    const numComponents = this.components.length;
    const dataLength = width * height * numComponents;
    const data = new Uint8ClampedArray(dataLength);
    const xScaleBlockOffset = new Uint32Array(width);
    const mask3LSB = 0xfffffff8; // used to clear the 3 LSBs
    let lastComponentScaleX;

    for (i = 0; i < numComponents; i++) {
      component = this.components[i];
      componentScaleX = component.scaleX * scaleX;
      componentScaleY = component.scaleY * scaleY;
      offset = i;
      output = component.output;
      blocksPerScanline = (component.blocksPerLine + 1) << 3;
      // Precalculate the `xScaleBlockOffset`. Since it doesn't depend on the
      // component data, that's only necessary when `componentScaleX` changes.
      if (componentScaleX !== lastComponentScaleX) {
        for (x = 0; x < width; x++) {
          j = 0 | (x * componentScaleX);
          xScaleBlockOffset[x] = ((j & mask3LSB) << 3) | (j & 7);
        }
        lastComponentScaleX = componentScaleX;
      }
      // linearize the blocks of the component
      for (y = 0; y < height; y++) {
        j = 0 | (y * componentScaleY);
        index = (blocksPerScanline * (j & mask3LSB)) | ((j & 7) << 3);
        for (x = 0; x < width; x++) {
          data[offset] = output[index + xScaleBlockOffset[x]];
          offset += numComponents;
        }
      }
    }

    // decodeTransform contains pairs of multiplier (-256..256) and additive
    let transform = this._decodeTransform;

    // In PDF files, JPEG images with CMYK colour spaces are usually inverted
    // (this can be observed by extracting the raw image data).
    // Since the conversion algorithms (see below) were written primarily for
    // the PDF use-cases, attempting to use `JpegImage` to parse standalone
    // JPEG (CMYK) images may thus result in inverted images (see issue 9513).
    //
    // Unfortunately it's not (always) possible to tell, from the image data
    // alone, if it needs to be inverted. Thus in an attempt to provide better
    // out-of-box behaviour when `JpegImage` is used standalone, default to
    // inverting JPEG (CMYK) images if and only if the image data does *not*
    // come from a PDF file and no `decodeTransform` was passed by the user.
    if (!isSourcePDF && numComponents === 4 && !transform) {
      transform = new Int32Array([-256, 255, -256, 255, -256, 255, -256, 255]);
    }

    if (transform) {
      for (i = 0; i < dataLength; ) {
        for (j = 0, k = 0; j < numComponents; j++, i++, k += 2) {
          data[i] = ((data[i] * transform[k]) >> 8) + transform[k + 1];
        }
      }
    }
    return data;
  }

  get _isColorConversionNeeded() {
    if (this.adobe) {
      // The adobe transform marker overrides any previous setting.
      return !!this.adobe.transformCode;
    }
    if (this.numComponents === 3) {
      if (this._colorTransform === 0) {
        // If the Adobe transform marker is not present and the image
        // dictionary has a 'ColorTransform' entry, explicitly set to `0`,
        // then the colours should *not* be transformed.
        return false;
      } else if (
        this.components[0].index === /* "R" = */ 0x52 &&
        this.components[1].index === /* "G" = */ 0x47 &&
        this.components[2].index === /* "B" = */ 0x42
      ) {
        // If the three components are indexed as RGB in ASCII
        // then the colours should *not* be transformed.
        return false;
      }
      return true;
    }
    // `this.numComponents !== 3`
    if (this._colorTransform === 1) {
      // If the Adobe transform marker is not present and the image
      // dictionary has a 'ColorTransform' entry, explicitly set to `1`,
      // then the colours should be transformed.
      return true;
    }
    return false;
  }

  _convertYccToRgb(data) {
    let Y, Cb, Cr;
    for (let i = 0, length = data.length; i < length; i += 3) {
      Y = data[i];
      Cb = data[i + 1];
      Cr = data[i + 2];
      data[i] = Y - 179.456 + 1.402 * Cr;
      data[i + 1] = Y + 135.459 - 0.344 * Cb - 0.714 * Cr;
      data[i + 2] = Y - 226.816 + 1.772 * Cb;
    }
    return data;
  }

  _convertYccToRgba(data, out) {
    for (let i = 0, j = 0, length = data.length; i < length; i += 3, j += 4) {
      const Y = data[i];
      const Cb = data[i + 1];
      const Cr = data[i + 2];
      out[j] = Y - 179.456 + 1.402 * Cr;
      out[j + 1] = Y + 135.459 - 0.344 * Cb - 0.714 * Cr;
      out[j + 2] = Y - 226.816 + 1.772 * Cb;
      out[j + 3] = 255;
    }
    return out;
  }

  _convertYcckToRgb(data) {
    this._convertYcckToCmyk(data);
    return this._convertCmykToRgb(data);
  }

  _convertYcckToRgba(data) {
    this._convertYcckToCmyk(data);
    return this._convertCmykToRgba(data);
  }

  _convertYcckToCmyk(data) {
    let Y, Cb, Cr;
    for (let i = 0, length = data.length; i < length; i += 4) {
      Y = data[i];
      Cb = data[i + 1];
      Cr = data[i + 2];
      data[i] = 434.456 - Y - 1.402 * Cr;
      data[i + 1] = 119.541 - Y + 0.344 * Cb + 0.714 * Cr;
      data[i + 2] = 481.816 - Y - 1.772 * Cb;
      // K in data[i + 3] is unchanged
    }
    return data;
  }

  _convertCmykToRgb(data) {
    const count = data.length / 4;
    ColorSpaceUtils.cmyk.getRgbBuffer(data, 0, count, data, 0, 8, 0);
    return data.subarray(0, count * 3);
  }

  _convertCmykToRgba(data) {
    ColorSpaceUtils.cmyk.getRgbBuffer(data, 0, data.length / 4, data, 0, 8, 1);

    if (ColorSpaceUtils.cmyk instanceof DeviceCmykCS) {
      // The alpha-component isn't updated by `DeviceCmykCS`, doing it manually.
      for (let i = 3, ii = data.length; i < ii; i += 4) {
        data[i] = 255;
      }
    }
    return data;
  }

  getData({
    width,
    height,
    forceRGBA = false,
    forceRGB = false,
    isSourcePDF = false,
  }) {
    if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
      assert(
        isSourcePDF === true,
        'JpegImage.getData: Unexpected "isSourcePDF" value for PDF files.'
      );
    }
    if (this.numComponents > 4) {
      throw new JpegError("Unsupported color mode");
    }
    // Type of data: Uint8ClampedArray(width * height * numComponents)
    const data = this._getLinearizedBlockData(width, height, isSourcePDF);

    if (this.numComponents === 1 && (forceRGBA || forceRGB)) {
      const len = data.length * (forceRGBA ? 4 : 3);
      const rgbaData = new Uint8ClampedArray(len);
      let offset = 0;
      if (forceRGBA) {
        grayToRGBA(data, new Uint32Array(rgbaData.buffer));
      } else {
        for (const grayColor of data) {
          rgbaData[offset++] = grayColor;
          rgbaData[offset++] = grayColor;
          rgbaData[offset++] = grayColor;
        }
      }
      return rgbaData;
    } else if (this.numComponents === 3 && this._isColorConversionNeeded) {
      if (forceRGBA) {
        const rgbaData = new Uint8ClampedArray((data.length / 3) * 4);
        return this._convertYccToRgba(data, rgbaData);
      }
      return this._convertYccToRgb(data);
    } else if (this.numComponents === 4) {
      if (this._isColorConversionNeeded) {
        if (forceRGBA) {
          return this._convertYcckToRgba(data);
        }
        if (forceRGB) {
          return this._convertYcckToRgb(data);
        }
        return this._convertYcckToCmyk(data);
      } else if (forceRGBA) {
        return this._convertCmykToRgba(data);
      } else if (forceRGB) {
        return this._convertCmykToRgb(data);
      }
    }
    return data;
  }
}

export { JpegError, JpegImage };
