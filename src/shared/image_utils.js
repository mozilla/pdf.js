/* Copyright 2022 Mozilla Foundation
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

import { FeatureTest, ImageKind } from "./util.js";

function convertToRGBA(params) {
  switch (params.kind) {
    case ImageKind.GRAYSCALE_1BPP:
      return convertBlackAndWhiteToRGBA(params);
    case ImageKind.RGB_24BPP:
      return convertRGBToRGBA(params);
  }

  return null;
}

function convertBlackAndWhiteToRGBA({
  src,
  srcPos = 0,
  dest,
  width,
  height,
  nonBlackColor = 0xffffffff,
  inverseDecode = false,
}) {
  const black = FeatureTest.isLittleEndian ? 0xff000000 : 0x000000ff;
  const [zeroMapping, oneMapping] = inverseDecode
    ? [nonBlackColor, black]
    : [black, nonBlackColor];
  const widthInSource = width >> 3;
  const widthRemainder = width & 7;
  const srcLength = src.length;
  dest = new Uint32Array(dest.buffer);
  let destPos = 0;

  for (let i = 0; i < height; i++) {
    for (const max = srcPos + widthInSource; srcPos < max; srcPos++) {
      const elem = srcPos < srcLength ? src[srcPos] : 255;
      dest[destPos++] = elem & 0b10000000 ? oneMapping : zeroMapping;
      dest[destPos++] = elem & 0b1000000 ? oneMapping : zeroMapping;
      dest[destPos++] = elem & 0b100000 ? oneMapping : zeroMapping;
      dest[destPos++] = elem & 0b10000 ? oneMapping : zeroMapping;
      dest[destPos++] = elem & 0b1000 ? oneMapping : zeroMapping;
      dest[destPos++] = elem & 0b100 ? oneMapping : zeroMapping;
      dest[destPos++] = elem & 0b10 ? oneMapping : zeroMapping;
      dest[destPos++] = elem & 0b1 ? oneMapping : zeroMapping;
    }
    if (widthRemainder === 0) {
      continue;
    }
    const elem = srcPos < srcLength ? src[srcPos++] : 255;
    for (let j = 0; j < widthRemainder; j++) {
      dest[destPos++] = elem & (1 << (7 - j)) ? oneMapping : zeroMapping;
    }
  }
  return { srcPos, destPos };
}

function convertRGBToRGBA({
  src,
  srcPos = 0,
  dest,
  destPos = 0,
  width,
  height,
}) {
  let i = 0;
  const len = width * height * 3;
  const len32 = len >> 2;
  const src32 = new Uint32Array(src.buffer, srcPos, len32);

  if (FeatureTest.isLittleEndian) {
    // It's a way faster to do the shuffle manually instead of working
    // component by component with some Uint8 arrays.
    for (; i < len32 - 2; i += 3, destPos += 4) {
      const s1 = src32[i]; // R2B1G1R1
      const s2 = src32[i + 1]; // G3R3B2G2
      const s3 = src32[i + 2]; // B4G4R4B3

      dest[destPos] = s1 | 0xff000000;
      dest[destPos + 1] = (s1 >>> 24) | (s2 << 8) | 0xff000000;
      dest[destPos + 2] = (s2 >>> 16) | (s3 << 16) | 0xff000000;
      dest[destPos + 3] = (s3 >>> 8) | 0xff000000;
    }

    for (let j = i * 4, jj = srcPos + len; j < jj; j += 3) {
      dest[destPos++] =
        src[j] | (src[j + 1] << 8) | (src[j + 2] << 16) | 0xff000000;
    }
  } else {
    for (; i < len32 - 2; i += 3, destPos += 4) {
      const s1 = src32[i]; // R1G1B1R2
      const s2 = src32[i + 1]; // G2B2R3G3
      const s3 = src32[i + 2]; // B3R4G4B4

      dest[destPos] = s1 | 0xff;
      dest[destPos + 1] = (s1 << 24) | (s2 >>> 8) | 0xff;
      dest[destPos + 2] = (s2 << 16) | (s3 >>> 16) | 0xff;
      dest[destPos + 3] = (s3 << 8) | 0xff;
    }

    for (let j = i * 4, jj = srcPos + len; j < jj; j += 3) {
      dest[destPos++] =
        (src[j] << 24) | (src[j + 1] << 16) | (src[j + 2] << 8) | 0xff;
    }
  }

  return { srcPos: srcPos + len, destPos };
}

function grayToRGBA(src, dest) {
  if (FeatureTest.isLittleEndian) {
    for (let i = 0, ii = src.length; i < ii; i++) {
      dest[i] = (src[i] * 0x10101) | 0xff000000;
    }
  } else {
    for (let i = 0, ii = src.length; i < ii; i++) {
      dest[i] = (src[i] * 0x1010100) | 0x000000ff;
    }
  }
}

export { convertBlackAndWhiteToRGBA, convertToRGBA, grayToRGBA };
