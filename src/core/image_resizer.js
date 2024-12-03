/* Copyright 2023 Mozilla Foundation
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

import { FeatureTest, ImageKind, shadow, warn } from "../shared/util.js";
import { convertToRGBA } from "../shared/image_utils.js";
import { MAX_INT_32 } from "./core_utils.js";

const MIN_IMAGE_DIM = 2048;

// In Chrome, there aren't max dimensions but only a max area. So an image with
// a very large dimensions is acceptable but it probably doesn't hurt to reduce
// it when considering that it will finally rendered on a small canvas.
const MAX_IMAGE_DIM = 65537;
const MAX_ERROR = 128;

// Large images are encoded in using the BMP format (it's a way faster than
// encoding in PNG because there are no checksums to compute).
// Unfortunately, createImageBitmap will create a task in the main thread in
// order to build the bitmap, hence the main thread is blocked during the
// decoding which can be a bit long (see bug 1817244).
// When bug 1759728 is fixed we can remove the BMP workaround and at least it
// should be a way faster to create the bitmap.

class ImageResizer {
  static #goodSquareLength = MIN_IMAGE_DIM;

  static #isImageDecoderSupported = FeatureTest.isImageDecoderSupported;

  constructor(imgData, isMask) {
    this._imgData = imgData;
    this._isMask = isMask;
  }

  static get canUseImageDecoder() {
    return shadow(
      this,
      "canUseImageDecoder",
      this.#isImageDecoderSupported
        ? ImageDecoder.isTypeSupported("image/bmp")
        : Promise.resolve(false)
    );
  }

  static needsToBeResized(width, height) {
    if (width <= this.#goodSquareLength && height <= this.#goodSquareLength) {
      return false;
    }

    const { MAX_DIM } = this;
    if (width > MAX_DIM || height > MAX_DIM) {
      return true;
    }

    const area = width * height;
    if (this._hasMaxArea) {
      return area > this.MAX_AREA;
    }

    if (area < this.#goodSquareLength ** 2) {
      return false;
    }

    // We try as much as possible to avoid to compute the max area.
    if (this._areGoodDims(width, height)) {
      this.#goodSquareLength = Math.max(
        this.#goodSquareLength,
        Math.floor(Math.sqrt(width * height))
      );
      return false;
    }

    // TODO: the computation can be a bit long because we potentially allocate
    // some large canvas, so in the Firefox case this value (and MAX_DIM) can be
    // infered from prefs (MAX_AREA = gfx.max-alloc-size / 4, 4 is because of
    // RGBA).
    this.#goodSquareLength = this._guessMax(
      this.#goodSquareLength,
      MAX_DIM,
      MAX_ERROR,
      0
    );
    const maxArea = (this.MAX_AREA = this.#goodSquareLength ** 2);

    return area > maxArea;
  }

  static get MAX_DIM() {
    return shadow(
      this,
      "MAX_DIM",
      this._guessMax(MIN_IMAGE_DIM, MAX_IMAGE_DIM, 0, 1)
    );
  }

  static get MAX_AREA() {
    this._hasMaxArea = true;
    return shadow(
      this,
      "MAX_AREA",
      this._guessMax(this.#goodSquareLength, this.MAX_DIM, MAX_ERROR, 0) ** 2
    );
  }

  static set MAX_AREA(area) {
    if (area >= 0) {
      this._hasMaxArea = true;
      shadow(this, "MAX_AREA", area);
    }
  }

  static setOptions({
    canvasMaxAreaInBytes = -1,
    isImageDecoderSupported = false,
  }) {
    if (!this._hasMaxArea) {
      // Divide by 4 to have the value in pixels.
      this.MAX_AREA = canvasMaxAreaInBytes >> 2;
    }
    this.#isImageDecoderSupported = isImageDecoderSupported;
  }

  static _areGoodDims(width, height) {
    try {
      // This code is working in either Firefox or Chrome.
      // There is a faster solution using transferToImageBitmap which is faster
      // in Firefox (when the dimensions are wrong the resulting bitmap has its
      // dimensions equal to 1) but it doesn't find the correct values in
      // Chrome.
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      ctx.fillRect(0, 0, 1, 1);
      const opacity = ctx.getImageData(0, 0, 1, 1).data[3];
      canvas.width = canvas.height = 1;
      return opacity !== 0;
    } catch {
      return false;
    }
  }

  static _guessMax(start, end, tolerance, defaultHeight) {
    // We don't really need to have exact values.
    // When we're here then we're in a corner case: we've a very large image.
    // So we could potentially downscale an image which fits in the canvas,
    // it's maybe a pity in term of perfs but we'll reduce the memory use.
    // The tolerance is the acceptable error we can make on the limit we want.
    // On Chrome, when the tolerance 0 then it can take ~5s to compute the max
    // area... and having a tolerance of 128 divides the time by 2.
    while (start + tolerance + 1 < end) {
      const middle = Math.floor((start + end) / 2);
      const height = defaultHeight || middle;
      if (this._areGoodDims(middle, height)) {
        start = middle;
      } else {
        end = middle;
      }
    }
    return start;
  }

  static async createImage(imgData, isMask = false) {
    return new ImageResizer(imgData, isMask)._createImage();
  }

  async _createImage() {
    const { _imgData: imgData } = this;
    const { width, height } = imgData;

    if (width * height * 4 > MAX_INT_32) {
      // The resulting RGBA image is too large.
      // We just rescale the data.
      const result = this.#rescaleImageData();
      if (result) {
        return result;
      }
    }

    const data = this._encodeBMP();
    let decoder, imagePromise;

    if (await ImageResizer.canUseImageDecoder) {
      decoder = new ImageDecoder({
        data,
        type: "image/bmp",
        preferAnimation: false,
        transfer: [data.buffer],
      });
      imagePromise = decoder
        .decode()
        .catch(reason => {
          warn(`BMP image decoding failed: ${reason}`);
          // It's a bit unfortunate to create the BMP twice but we shouldn't be
          // here in the first place.
          return createImageBitmap(
            new Blob([this._encodeBMP().buffer], {
              type: "image/bmp",
            })
          );
        })
        .finally(() => {
          decoder.close();
        });
    } else {
      imagePromise = createImageBitmap(
        new Blob([data.buffer], {
          type: "image/bmp",
        })
      );
    }

    const { MAX_AREA, MAX_DIM } = ImageResizer;
    const minFactor = Math.max(
      width / MAX_DIM,
      height / MAX_DIM,
      Math.sqrt((width * height) / MAX_AREA)
    );

    const firstFactor = Math.max(minFactor, 2);

    // Add 1 to the ratio and round it with 1 digit.
    // We add 1.25 in order to have a final image under the limits
    // (and not just at the limits) to reduce memory use.
    const factor = Math.round(10 * (minFactor + 1.25)) / 10 / firstFactor;

    const N = Math.floor(Math.log2(factor));
    const steps = new Array(N + 2).fill(2);
    steps[0] = firstFactor;
    steps.splice(-1, 1, factor / (1 << N));

    let newWidth = width;
    let newHeight = height;
    const result = await imagePromise;
    let bitmap = result.image || result;

    for (const step of steps) {
      const prevWidth = newWidth;
      const prevHeight = newHeight;

      // See bug 1820511 (Windows specific bug).
      // TODO: once the above bug is fixed we could revert to:
      // newWidth = Math.floor(newWidth / 2);
      newWidth = Math.floor(newWidth / step) - 1;
      newHeight = Math.floor(newHeight / step) - 1;

      const canvas = new OffscreenCanvas(newWidth, newHeight);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        bitmap,
        0,
        0,
        prevWidth,
        prevHeight,
        0,
        0,
        newWidth,
        newHeight
      );

      // Release the resources associated with the bitmap.
      bitmap.close();
      bitmap = canvas.transferToImageBitmap();
    }

    imgData.data = null;
    imgData.bitmap = bitmap;
    imgData.width = newWidth;
    imgData.height = newHeight;

    return imgData;
  }

  #rescaleImageData() {
    const { _imgData: imgData } = this;
    const { data, width, height, kind } = imgData;
    const rgbaSize = width * height * 4;
    // K is such as width * height * 4 / 2 ** K <= 2 ** 31 - 1
    const K = Math.ceil(Math.log2(rgbaSize / MAX_INT_32));
    const newWidth = width >> K;
    const newHeight = height >> K;
    let rgbaData;
    let maxHeight = height;

    // We try to allocate the buffer with the maximum size but it can fail.
    try {
      rgbaData = new Uint8Array(rgbaSize);
    } catch {
      // n is such as 2 ** n - 1 > width * height * 4
      let n = Math.floor(Math.log2(rgbaSize + 1));

      while (true) {
        try {
          rgbaData = new Uint8Array(2 ** n - 1);
          break;
        } catch {
          n -= 1;
        }
      }

      maxHeight = Math.floor((2 ** n - 1) / (width * 4));
      const newSize = width * maxHeight * 4;
      if (newSize < rgbaData.length) {
        rgbaData = new Uint8Array(newSize);
      }
    }

    const src32 = new Uint32Array(rgbaData.buffer);
    const dest32 = new Uint32Array(newWidth * newHeight);

    let srcPos = 0;
    let newIndex = 0;
    const step = Math.ceil(height / maxHeight);
    const remainder = height % maxHeight === 0 ? height : height % maxHeight;
    for (let k = 0; k < step; k++) {
      const h = k < step - 1 ? maxHeight : remainder;
      ({ srcPos } = convertToRGBA({
        kind,
        src: data,
        dest: src32,
        width,
        height: h,
        inverseDecode: this._isMask,
        srcPos,
      }));

      for (let i = 0, ii = h >> K; i < ii; i++) {
        const buf = src32.subarray((i << K) * width);
        for (let j = 0; j < newWidth; j++) {
          dest32[newIndex++] = buf[j << K];
        }
      }
    }

    if (ImageResizer.needsToBeResized(newWidth, newHeight)) {
      imgData.data = dest32;
      imgData.width = newWidth;
      imgData.height = newHeight;
      imgData.kind = ImageKind.RGBA_32BPP;

      return null;
    }

    const canvas = new OffscreenCanvas(newWidth, newHeight);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(dest32.buffer), newWidth, newHeight),
      0,
      0
    );
    imgData.data = null;
    imgData.bitmap = canvas.transferToImageBitmap();
    imgData.width = newWidth;
    imgData.height = newHeight;

    return imgData;
  }

  _encodeBMP() {
    const { width, height, kind } = this._imgData;
    let data = this._imgData.data;
    let bitPerPixel;
    let colorTable = new Uint8Array(0);
    let maskTable = colorTable;
    let compression = 0;

    // Each row of the image must be padded in order to have a final size which
    // is a multiple of 4.

    switch (kind) {
      case ImageKind.GRAYSCALE_1BPP: {
        bitPerPixel = 1;
        colorTable = new Uint8Array(
          this._isMask
            ? [255, 255, 255, 255, 0, 0, 0, 0]
            : [0, 0, 0, 0, 255, 255, 255, 255]
        );
        const rowLen = (width + 7) >> 3;
        const rowSize = (rowLen + 3) & -4;
        if (rowLen !== rowSize) {
          const newData = new Uint8Array(rowSize * height);
          let k = 0;
          for (
            let i = 0, ii = height * rowLen;
            i < ii;
            i += rowLen, k += rowSize
          ) {
            newData.set(data.subarray(i, i + rowLen), k);
          }
          data = newData;
        }
        break;
      }
      case ImageKind.RGB_24BPP: {
        bitPerPixel = 24;
        if (width & 3) {
          const rowLen = 3 * width;
          const rowSize = (rowLen + 3) & -4;
          const extraLen = rowSize - rowLen;
          const newData = new Uint8Array(rowSize * height);
          let k = 0;
          for (let i = 0, ii = height * rowLen; i < ii; i += rowLen) {
            const row = data.subarray(i, i + rowLen);
            for (let j = 0; j < rowLen; j += 3) {
              newData[k++] = row[j + 2];
              newData[k++] = row[j + 1];
              newData[k++] = row[j];
            }
            k += extraLen;
          }
          data = newData;
        } else {
          for (let i = 0, ii = data.length; i < ii; i += 3) {
            // Just swap R and B.
            const tmp = data[i];
            data[i] = data[i + 2];
            data[i + 2] = tmp;
          }
        }
        break;
      }
      case ImageKind.RGBA_32BPP:
        bitPerPixel = 32;
        compression = 3;
        maskTable = new Uint8Array(
          4 /* R mask */ +
            4 /* G mask */ +
            4 /* B mask */ +
            4 /* A mask */ +
            52 /* Windows color space stuff */
        );
        const view = new DataView(maskTable.buffer);
        if (FeatureTest.isLittleEndian) {
          view.setUint32(0, 0x000000ff, true);
          view.setUint32(4, 0x0000ff00, true);
          view.setUint32(8, 0x00ff0000, true);
          view.setUint32(12, 0xff000000, true);
        } else {
          view.setUint32(0, 0xff000000, true);
          view.setUint32(4, 0x00ff0000, true);
          view.setUint32(8, 0x0000ff00, true);
          view.setUint32(12, 0x000000ff, true);
        }
        break;
      default:
        throw new Error("invalid format");
    }

    let i = 0;
    const headerLength = 40 + maskTable.length;
    const fileLength = 14 + headerLength + colorTable.length + data.length;
    const bmpData = new Uint8Array(fileLength);
    const view = new DataView(bmpData.buffer);

    // Signature.
    view.setUint16(i, 0x4d42, true);
    i += 2;

    // File size.
    view.setUint32(i, fileLength, true);
    i += 4;

    // Reserved.
    view.setUint32(i, 0, true);
    i += 4;

    // Data offset.
    view.setUint32(i, 14 + headerLength + colorTable.length, true);
    i += 4;

    // Header size.
    view.setUint32(i, headerLength, true);
    i += 4;

    // Width.
    view.setInt32(i, width, true);
    i += 4;

    // Height.
    // Negative height indicates that the image is stored from top to bottom.
    view.setInt32(i, -height, true);
    i += 4;

    // Number of planes (must be 1).
    view.setUint16(i, 1, true);
    i += 2;

    // Number of bit per pixel.
    view.setUint16(i, bitPerPixel, true);
    i += 2;

    // Compression method.
    view.setUint32(i, compression, true);
    i += 4;

    // The image size.
    view.setUint32(i, 0, true);
    i += 4;

    // Horizontal resolution.
    view.setInt32(i, 0, true);
    i += 4;

    // Vertical resolution.
    view.setInt32(i, 0, true);
    i += 4;

    // Number of colors in the palette (0 to default).
    view.setUint32(i, colorTable.length / 4, true);
    i += 4;

    // Number of important colors used (0 to default).
    view.setUint32(i, 0, true);
    i += 4;

    bmpData.set(maskTable, i);
    i += maskTable.length;

    bmpData.set(colorTable, i);
    i += colorTable.length;

    bmpData.set(data, i);

    return bmpData;
  }
}

export { ImageResizer };
