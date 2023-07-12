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

import { AnnotationEditorType, FeatureTest } from "../../shared/util.js";
import { StampEditor } from "./stamp.js";

/**
 * Basic text editor in order to create a Signature annotation.
 */
class SignatureEditor extends StampEditor {
  static _type = "signature";

  constructor(params) {
    super({ ...params, name: "signatureEditor" });
  }

  get MAX_RATIO() {
    return 0.1;
  }

  static #bilateralFilter(buf, width, height, sigmaS, sigmaR, kernelSize) {
    // The bilateral filter is a nonlinear filter that does spatial averaging.
    // It's main interest is to preserve edges while removing noise.
    // See https://en.wikipedia.org/wiki/Bilateral_filter for more details.

    // Create a gaussian kernel
    const kernel = new Float32Array(kernelSize * kernelSize);
    const sigmaS2 = -2 * sigmaS * sigmaS;
    const halfSize = kernelSize >> 1;

    for (let i = 0; i < kernelSize; i++) {
      const x = (i - halfSize) ** 2;
      for (let j = 0; j < kernelSize; j++) {
        const y = (j - halfSize) ** 2;
        const v = Math.exp((x + y) / sigmaS2);
        kernel[i * kernelSize + j] = v;
      }
    }

    // Create the range values to be used with the distance between pixels.
    // It's a way faster with a lookup table than computing the exponential.
    const rangeValues = new Float32Array(256);
    const sigmaR2 = -2 * sigmaR * sigmaR;
    for (let i = 0; i < 256; i++) {
      rangeValues[i] = Math.exp(i ** 2 / sigmaR2);
    }

    const N = buf.length;
    const out = new Uint8Array(N);

    // We compute the histogram here instead of doing it later: it's slightly
    // faster.
    const histogram = new Uint32Array(256);
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        const ij = i * width + j;
        const center = buf[ij];
        let sum = 0;
        let norm = 0;

        for (let k = 0; k < kernelSize; k++) {
          const y = i + k - halfSize;
          if (y < 0 || y >= height) {
            continue;
          }
          for (let l = 0; l < kernelSize; l++) {
            const x = j + l - halfSize;
            if (x < 0 || x >= width) {
              continue;
            }
            const neighbour = buf[y * width + x];
            const w =
              kernel[k * kernelSize + l] *
              rangeValues[Math.abs(neighbour - center)];
            sum += neighbour * w;
            norm += w;
          }
        }

        const pix = (out[ij] = Math.round(sum / norm));
        histogram[pix]++;
      }
    }

    // Translate the histogram so that the first non-zero value is at index 0.
    // We want to map the darkest pixel to black.
    let min;
    for (let i = 0; i < 256; i++) {
      if (histogram[i] !== 0) {
        min = i;
        break;
      }
    }

    // Translate the histogram.
    for (let i = 0; i < 256 - min; i++) {
      histogram[i] = histogram[i + min];
    }
    for (let i = 256 - min; i < 256; i++) {
      histogram[i] = 0;
    }

    // Translate the pixels.
    for (let i = 0; i < N; i++) {
      out[i] -= min;
    }

    return [out, histogram];
  }

  static #toUint8(buf) {
    // We have a RGBA buffer, containing a grayscale image.
    // We want to convert it into a basic G buffer.
    // Also, we want to normalize the values between 0 and 255 in order to
    // increase the contrast.
    const N = buf.length;
    const out = new Uint8Array(N >> 2);
    let max = -Infinity;
    let min = Infinity;
    for (let i = 0; i < N; i++) {
      const pix = (out[i] = buf[i << 2] & 0xff);
      if (pix > max) {
        max = pix;
      }
      if (pix < min) {
        min = pix;
      }
    }
    const ratio = 255 / (max - min);
    for (let i = 0; i < N; i++) {
      out[i] = Math.round((out[i] - min) * ratio);
    }

    return out;
  }

  static #threshold(buf, threshold) {
    // Apply the threshold to the buffer and transform the grayscale into
    // transparency.
    const N = buf.length;
    const out = new Uint32Array(N);
    if (FeatureTest.isLittleEndian) {
      for (let i = 0; i < N; i++) {
        const pix = buf[i];
        out[i] = pix <= threshold ? (255 - pix) << 24 : 0;
      }
    } else {
      for (let i = 0; i < N; i++) {
        const pix = buf[i];
        out[i] = pix <= threshold ? 255 - pix : 0;
      }
    }
    return out;
  }

  static #guessThreshold(histogram) {
    // We want to find the threshold that will separate the background from the
    // foreground.
    // We could have used Otsu's method, but unfortunatelly it doesn't work well
    // when the background has too much shade of greys.
    // So the idea is to find a maximum in the black part of the histogram and
    // figure out the value which will be the first one of the white part.

    let i;
    let M = -Infinity;
    let L = -Infinity;
    let pos = 0;
    let spos = 0;
    for (i = 0; i < 255; i++) {
      const v = histogram[i];
      if (v > M) {
        if (i - pos > L) {
          L = i - pos;
          spos = i - 1;
        }
        M = v;
        pos = i;
      }
    }
    for (i = spos - 1; i >= 0; i--) {
      if (histogram[i] > histogram[i + 1]) {
        break;
      }
    }

    return i;
  }

  _preProcess(bitmap) {
    return SignatureEditor.preProcess(bitmap);
  }

  static preProcess(bitmap) {
    const { width, height } = bitmap;
    let newWidth = width;
    let newHeight = height;
    const maxDim = 512;
    if (width > maxDim || height > maxDim) {
      const ratio = maxDim / Math.max(width, height);
      newWidth = Math.floor(width * ratio);
      newHeight = Math.floor(height * ratio);
      bitmap = this._scaleBitmap(bitmap, newWidth, newHeight);
    }

    const offscreen = new OffscreenCanvas(newWidth, newHeight);
    const ctx = offscreen.getContext("2d");
    ctx.filter = "grayscale(1)";
    ctx.drawImage(
      bitmap,
      0,
      0,
      bitmap.width,
      bitmap.height,
      0,
      0,
      newWidth,
      newHeight
    );
    const grayImage = ctx.getImageData(0, 0, newWidth, newHeight).data;
    const uint8Buf = this.#toUint8(grayImage);
    const sigmaS = Math.hypot(newWidth, newHeight) * 0.02;
    const [uint8Filtered, histogram] = this.#bilateralFilter(
      uint8Buf,
      newWidth,
      newHeight,
      sigmaS,
      25,
      16
    );
    const threshold = this.#guessThreshold(histogram);
    const uint32Thresholded = this.#threshold(uint8Filtered, threshold);

    ctx.putImageData(
      new ImageData(
        new Uint8ClampedArray(uint32Thresholded.buffer),
        newWidth,
        newHeight
      ),
      0,
      0
    );
    bitmap = offscreen.transferToImageBitmap();

    return bitmap;
  }

  /** @inheritdoc */
  serialize(isForCopying = false, context = null) {
    const serialized = super.serialize(isForCopying, context);
    serialized.annotationType = AnnotationEditorType.SIGNATURE;
    // All the data are in the transparent channel, hence we don't care about
    // the other channels.
    serialized.onlyAlpha = true;

    return serialized;
  }
}

export { SignatureEditor };
