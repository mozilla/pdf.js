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
    return 0.75;
  }

  static #neighborIndexToId(i0, j0, i, j) {
    /* 
        3 2 1
        4 X 0
        5 6 7

       0: 0,1 => 7
       1: -1,1 => 6
       2: -1,0 => 3
       3: -1,-1 => 0
       4: 0,-1 => 1
       5: 1,-1 => 2
       6: 1,0 => 5
       7: 1,1 => 8    
    */
    const id = i - i0 + 3 * (j - j0) + 4;
    switch (id) {
      case 0:
        return 3;
      case 1:
        return 4;
      case 2:
        return 5;
      case 3:
        return 2;
      case 5:
        return 6;
      case 6:
        return 1;
      case 7:
        return 0;
      case 8:
        return 7;
      default:
        return -1;
    }
  }

  static #neighborIdToIndex(i, j, id) {
    /* 
       3 2 1
       4 X 0
       5 6 7
    */
    switch (id) {
      case 0:
        return [i, j + 1];
      case 1:
        return [i - 1, j + 1];
      case 2:
        return [i - 1, j];
      case 3:
        return [i - 1, j - 1];
      case 4:
        return [i, j - 1];
      case 5:
        return [i + 1, j - 1];
      case 6:
        return [i + 1, j];
      case 7:
        return [i + 1, j + 1];
      default:
        return null;
    }
  }

  static #clockwiseNonZero(buf, width, i0, j0, i, j, offset) {
    const id = this.#neighborIndexToId(i0, j0, i, j);
    for (let k = 0; k < 8; k++) {
      const kk = (-k + id - offset + 16) % 8;
      const ij = this.#neighborIdToIndex(i0, j0, kk);
      if (buf[ij[0] * width + ij[1]] !== 0) {
        return ij;
      }
    }
    return null;
  }

  static #counterclockwiseNonZero(buf, width, i0, j0, i, j, offset) {
    const id = this.#neighborIndexToId(i0, j0, i, j);
    for (let k = 0; k < 8; k++) {
      const kk = (k + id + offset + 16) % 8;
      const ij = this.#neighborIdToIndex(i0, j0, kk);
      if (buf[ij[0] * width + ij[1]] !== 0) {
        return ij;
      }
    }
    return null;
  }

  static #findCountours(buf, width, height, threshold) {
    // Based on the Suzuki's algorithm:
    //  https://www.nevis.columbia.edu/~vgenty/public/suzuki_et_al.pdf

    const N = buf.length;
    const types = new Int32Array(N);
    for (let i = 0; i < N; i++) {
      types[i] = buf[i] <= threshold ? 1 : 0;
    }

    for (let i = 1; i < height - 1; i++) {
      types[i * width] = types[i * width + width - 1] = 0;
    }
    for (let i = 0; i < width; i++) {
      types[i] = types[width * height - 1 - i] = 0;
    }

    let nbd = 1;
    let lnbd;
    const contours = [];

    for (let i = 1; i < height - 1; i++) {
      lnbd = 1;
      for (let j = 1; j < width - 1; j++) {
        const ij = i * width + j;
        const pix = types[ij];
        if (pix === 0) {
          continue;
        }

        let i2 = i;
        let j2 = j;

        if (pix === 1 && types[ij - 1] === 0) {
          // Outer border.
          nbd += 1;
          j2 -= 1;
        } else if (pix >= 1 && types[ij + 1] === 0) {
          // Hole border.
          nbd += 1;
          j2 += 1;
          if (pix > 1) {
            lnbd = pix;
          }
        } else {
          if (pix !== 1) {
            lnbd = Math.abs(pix);
          }
          continue;
        }

        const points = [[j, i]];
        const isHole = j2 === j + 1;
        const contour = {
          isHole,
          points,
          id: nbd,
          parent: 0,
        };
        contours.push(contour);

        let contour0;
        for (const c of contours) {
          if (c.id === lnbd) {
            contour0 = c;
            break;
          }
        }

        if (!contour0) {
          contour.parent = isHole ? lnbd : 0;
        } else if (contour0.isHole) {
          contour.parent = isHole ? contour0.parent : lnbd;
        } else {
          contour.parent = isHole ? lnbd : contour0.parent;
        }

        const i1j1 = this.#clockwiseNonZero(types, width, i, j, i2, j2, 0);
        if (i1j1 === null) {
          types[ij] = -nbd;
          if (types[ij] !== 1) {
            lnbd = Math.abs(types[ij]);
          }
          continue;
        }
        const [i1, j1] = i1j1;
        i2 = i1;
        j2 = j1;
        let i3 = i;
        let j3 = j;

        while (true) {
          const [i4, j4] = this.#counterclockwiseNonZero(
            types,
            width,
            i3,
            j3,
            i2,
            j2,
            1
          );
          points.push([j4, i4]);
          const ij3 = i3 * width + j3;
          if (types[ij3 + 1] === 0) {
            types[ij3] = -nbd;
          } else if (types[ij3] === 1) {
            types[ij3] = nbd;
          }

          if (i4 === i && j4 === j && i3 === i1 && j3 === j1) {
            if (types[ij] !== 1) {
              lnbd = Math.abs(types[ij]);
            }
            break;
          } else {
            i2 = i3;
            j2 = j3;
            i3 = i4;
            j3 = j4;
          }
        }
      }
    }
    return contours;
  }

  static #douglasPeucker(points) {
    // Based on the Douglas-Peucker algorithm:
    //  https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm
    let dmax = 0;
    let index = 0;
    const end = points.length;
    if (points.length < 3) {
      return points;
    }

    const first = points[0];
    const last = points[end - 2];
    const [ax, ay] = first;
    const [bx, by] = last;
    const abx = bx - ax;
    const aby = by - ay;
    const dist = Math.hypot(abx, aby);

    // Guessing the epsilon value.
    // See "A novel framework for making dominant point detection methods
    // non-parametric".
    const m = aby / abx;
    const invS = 1 / dist;
    const phi = Math.atan(m);
    const cosPhi = Math.cos(phi);
    const sinPHi = Math.sin(phi);
    const tmax = invS * (Math.abs(cosPhi) + Math.abs(sinPHi));
    const poly = 1 - tmax + tmax * tmax;
    const partialPhi = Math.max(
      Math.atan(invS * Math.abs(sinPHi + cosPhi) * poly),
      Math.atan(invS * Math.abs(sinPHi - cosPhi) * poly)
    );
    const epsilon = (dist * partialPhi) ** 2;

    for (let i = 1; i < end - 1; i++) {
      const [x, y] = points[i];
      const d = Math.abs(abx * (ay - y) - aby * (ax - x)) / dist;
      if (d > dmax) {
        index = i;
        dmax = d;
      }
    }
    if (dmax > epsilon) {
      const recResults1 = this.#douglasPeucker(points.slice(0, index + 1));
      const recResults2 = this.#douglasPeucker(points.slice(index));
      return recResults1.slice(0, -1).concat(recResults2);
    }
    return [first, last];
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
    // const thresholded = this.#threshold(uint8Filtered, threshold);
    const contourList = this.#findCountours(
      uint8Filtered,
      newWidth,
      newHeight,
      threshold
    );
    console.log(contourList);

    ctx.filter = "none";
    //ctx.fillStyle = "white";
    //ctx.fillRect(0, 0, newWidth, newHeight);
    ctx.clearRect(0, 0, newWidth, newHeight);
    ctx.fillStyle = "black";
    ctx.beginPath();

    for (const contour of contourList) {
      let { points } = contour;
      points = this.#douglasPeucker(points);
      ctx.moveTo(...points[0]);

      for (let i = 2; i < points.length; i++) {
        const [x0, y0] = points[i - 2];
        const [x1, y1] = points[i - 1];
        const [x2, y2] = points[i];
        const prevX = (x0 + x1) / 2;
        const prevY = (y0 + y1) / 2;
        const x3 = (x1 + x2) / 2;
        const y3 = (y1 + y2) / 2;
        ctx.bezierCurveTo(
          prevX + (2 * (x1 - prevX)) / 3,
          prevY + (2 * (y1 - prevY)) / 3,
          x3 + (2 * (x1 - x3)) / 3,
          y3 + (2 * (y1 - y3)) / 3,
          x3,
          y3
        );
      }
    }

    ctx.fill();

    // const uint32Thresholded = this.#threshold(uint8Filtered, threshold);

    /* ctx.putImageData(
      new ImageData(
        new Uint8ClampedArray(uint32Thresholded.buffer),
        newWidth,
        newHeight
      ),
      0,
      0
    ); */
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
