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

function applyMaskImageData({
  src,
  srcPos = 0,
  dest,
  destPos = 3,
  width,
  height,
  inverseDecode = false,
}) {
  const srcLength = src.byteLength;
  const zeroMapping = inverseDecode ? 0 : 255;
  const oneMapping = inverseDecode ? 255 : 0;

  for (let j = 0; j < height; j++) {
    let elem,
      mask = 0;
    for (let k = 0; k < width; k++) {
      if (mask === 0) {
        elem = srcPos < srcLength ? src[srcPos++] : 255;
        mask = 128;
      }
      dest[destPos] = elem & mask ? oneMapping : zeroMapping;
      destPos += 4;
      mask >>= 1;
    }
  }

  return { srcPos, destPos };
}

export { applyMaskImageData };
