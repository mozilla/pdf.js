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

import { fromBase64Util, toBase64Util, warn } from "../../../shared/util.js";
import { ContourDrawOutline } from "./contour.js";
import { InkDrawOutline } from "./inkdraw.js";
import { Outline } from "./outline.js";

const BASE_HEADER_LENGTH = 8;
const POINTS_PROPERTIES_NUMBER = 3;

/**
 * Basic text editor in order to create a Signature annotation.
 */
class SignatureExtractor {
  static #PARAMETERS = {
    maxDim: 512,
    sigmaSFactor: 0.02,
    sigmaR: 25,
    kernelSize: 16,
  };

  static #neighborIndexToId(i0, j0, i, j) {
    /*
      The idea is to map the neighbors of a pixel into a unique id.
        3 2 1
        4 X 0
        5 6 7
    */

    i -= i0;
    j -= j0;

    if (i === 0) {
      return j > 0 ? 0 : 4;
    }

    if (i === 1) {
      return j + 6;
    }

    return 2 - j;
  }

  static #neighborIdToIndex = new Int32Array([
    0, 1, -1, 1, -1, 0, -1, -1, 0, -1, 1, -1, 1, 0, 1, 1,
  ]);

  static #clockwiseNonZero(buf, width, i0, j0, i, j, offset) {
    const id = this.#neighborIndexToId(i0, j0, i, j);
    for (let k = 0; k < 8; k++) {
      const kk = (-k + id - offset + 16) % 8;
      const shiftI = this.#neighborIdToIndex[2 * kk];
      const shiftJ = this.#neighborIdToIndex[2 * kk + 1];
      if (buf[(i0 + shiftI) * width + (j0 + shiftJ)] !== 0) {
        return kk;
      }
    }
    return -1;
  }

  static #counterClockwiseNonZero(buf, width, i0, j0, i, j, offset) {
    const id = this.#neighborIndexToId(i0, j0, i, j);
    for (let k = 0; k < 8; k++) {
      const kk = (k + id + offset + 16) % 8;
      const shiftI = this.#neighborIdToIndex[2 * kk];
      const shiftJ = this.#neighborIdToIndex[2 * kk + 1];
      if (buf[(i0 + shiftI) * width + (j0 + shiftJ)] !== 0) {
        return kk;
      }
    }
    return -1;
  }

  static #findContours(buf, width, height, threshold) {
    // Based on the Suzuki's algorithm:
    //  https://web.archive.org/web/20231213161741/https://www.nevis.columbia.edu/~vgenty/public/suzuki_et_al.pdf

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

        const points = [j, i];
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

        const k = this.#clockwiseNonZero(types, width, i, j, i2, j2, 0);
        if (k === -1) {
          types[ij] = -nbd;
          if (types[ij] !== 1) {
            lnbd = Math.abs(types[ij]);
          }
          continue;
        }

        let shiftI = this.#neighborIdToIndex[2 * k];
        let shiftJ = this.#neighborIdToIndex[2 * k + 1];
        const i1 = i + shiftI;
        const j1 = j + shiftJ;
        i2 = i1;
        j2 = j1;
        let i3 = i;
        let j3 = j;

        while (true) {
          const kk = this.#counterClockwiseNonZero(
            types,
            width,
            i3,
            j3,
            i2,
            j2,
            1
          );
          shiftI = this.#neighborIdToIndex[2 * kk];
          shiftJ = this.#neighborIdToIndex[2 * kk + 1];
          const i4 = i3 + shiftI;
          const j4 = j3 + shiftJ;
          points.push(j4, i4);
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

  static #douglasPeuckerHelper(points, start, end, output) {
    // Based on the Douglas-Peucker algorithm:
    //  https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm
    if (end - start <= 4) {
      for (let i = start; i < end - 2; i += 2) {
        output.push(points[i], points[i + 1]);
      }
      return;
    }

    const ax = points[start];
    const ay = points[start + 1];
    const abx = points[end - 4] - ax;
    const aby = points[end - 3] - ay;
    const dist = Math.hypot(abx, aby);
    const nabx = abx / dist;
    const naby = aby / dist;
    const aa = nabx * ay - naby * ax;

    // Guessing the epsilon value.
    // See "A novel framework for making dominant point detection methods
    // non-parametric".
    const m = aby / abx;
    const invS = 1 / dist;
    const phi = Math.atan(m);
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const tmax = invS * (Math.abs(cosPhi) + Math.abs(sinPhi));
    const poly = invS * (1 - tmax + tmax ** 2);
    const partialPhi = Math.max(
      Math.atan(Math.abs(sinPhi + cosPhi) * poly),
      Math.atan(Math.abs(sinPhi - cosPhi) * poly)
    );

    let dmax = 0;
    let index = start;
    for (let i = start + 2; i < end - 2; i += 2) {
      const d = Math.abs(aa - nabx * points[i + 1] + naby * points[i]);
      if (d > dmax) {
        index = i;
        dmax = d;
      }
    }

    if (dmax > (dist * partialPhi) ** 2) {
      this.#douglasPeuckerHelper(points, start, index + 2, output);
      this.#douglasPeuckerHelper(points, index, end, output);
    } else {
      output.push(ax, ay);
    }
  }

  static #douglasPeucker(points) {
    const output = [];
    const len = points.length;
    this.#douglasPeuckerHelper(points, 0, len, output);
    output.push(points[len - 2], points[len - 1]);
    return output.length <= 4 ? null : output;
  }

  static #bilateralFilter(buf, width, height, sigmaS, sigmaR, kernelSize) {
    // The bilateral filter is a nonlinear filter that does spatial averaging.
    // Its main interest is to preserve edges while removing noise.
    // See https://en.wikipedia.org/wiki/Bilateral_filter for more details.
    // sigmaS is the standard deviation of the spatial gaussian.
    // sigmaR is the standard deviation of the range (in term of pixel
    // intensity) gaussian.

    // Create a gaussian kernel
    const kernel = new Float32Array(kernelSize ** 2);
    const sigmaS2 = -2 * sigmaS ** 2;
    const halfSize = kernelSize >> 1;

    for (let i = 0; i < kernelSize; i++) {
      const x = (i - halfSize) ** 2;
      for (let j = 0; j < kernelSize; j++) {
        kernel[i * kernelSize + j] = Math.exp(
          (x + (j - halfSize) ** 2) / sigmaS2
        );
      }
    }

    // Create the range values to be used with the distance between pixels.
    // It's a way faster with a lookup table than computing the exponential.
    const rangeValues = new Float32Array(256);
    const sigmaR2 = -2 * sigmaR ** 2;
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

    return [out, histogram];
  }

  static #getHistogram(buf) {
    const histogram = new Uint32Array(256);
    for (const g of buf) {
      histogram[g]++;
    }
    return histogram;
  }

  static #toUint8(buf) {
    // We have a RGBA buffer, containing a grayscale image.
    // We want to convert it into a basic G buffer.
    // Also, we want to normalize the values between 0 and 255 in order to
    // increase the contrast.
    const N = buf.length;
    const out = new Uint8ClampedArray(N >> 2);
    let max = -Infinity;
    let min = Infinity;
    for (let i = 0, ii = out.length; i < ii; i++) {
      const pix = (out[i] = buf[i << 2]);
      max = Math.max(max, pix);
      min = Math.min(min, pix);
    }
    const ratio = 255 / (max - min);
    for (let i = 0, ii = out.length; i < ii; i++) {
      out[i] = (out[i] - min) * ratio;
    }

    return out;
  }

  static #guessThreshold(histogram) {
    // We want to find the threshold that will separate the background from the
    // foreground.
    // We could have used Otsu's method, but unfortunately it doesn't work well
    // when the background has too much shade of greys.
    // So the idea is to find a maximum in the black part of the histogram and
    // figure out the value which will be the first one of the white part.

    let i;
    let M = -Infinity;
    let L = -Infinity;
    const min = histogram.findIndex(v => v !== 0);
    let pos = min;
    let spos = min;
    for (i = min; i < 256; i++) {
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

  static #getGrayPixels(bitmap) {
    const originalBitmap = bitmap;
    const { width, height } = bitmap;
    const { maxDim } = this.#PARAMETERS;
    let newWidth = width;
    let newHeight = height;

    if (width > maxDim || height > maxDim) {
      let prevWidth = width;
      let prevHeight = height;

      let steps = Math.log2(Math.max(width, height) / maxDim);
      const isteps = Math.floor(steps);
      steps = steps === isteps ? isteps - 1 : isteps;
      for (let i = 0; i < steps; i++) {
        newWidth = Math.ceil(prevWidth / 2);
        newHeight = Math.ceil(prevHeight / 2);

        const offscreen = new OffscreenCanvas(newWidth, newHeight);
        const ctx = offscreen.getContext("2d");
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
        prevWidth = newWidth;
        prevHeight = newHeight;

        // Release the resources associated with the bitmap.
        if (bitmap !== originalBitmap) {
          bitmap.close();
        }
        bitmap = offscreen.transferToImageBitmap();
      }

      const ratio = Math.min(maxDim / newWidth, maxDim / newHeight);
      newWidth = Math.round(newWidth * ratio);
      newHeight = Math.round(newHeight * ratio);
    }
    const offscreen = new OffscreenCanvas(newWidth, newHeight);
    const ctx = offscreen.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, newWidth, newHeight);
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

    return [uint8Buf, newWidth, newHeight];
  }

  static extractContoursFromText(
    text,
    { fontFamily, fontStyle, fontWeight },
    pageWidth,
    pageHeight,
    rotation,
    innerMargin
  ) {
    let canvas = new OffscreenCanvas(1, 1);
    let ctx = canvas.getContext("2d", { alpha: false });
    const fontSize = 200;
    const font =
      (ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`);
    const {
      actualBoundingBoxLeft,
      actualBoundingBoxRight,
      actualBoundingBoxAscent,
      actualBoundingBoxDescent,
      fontBoundingBoxAscent,
      fontBoundingBoxDescent,
      width,
    } = ctx.measureText(text);

    // We rescale the canvas to make "sure" the text fits.
    const SCALE = 1.5;
    const canvasWidth = Math.ceil(
      Math.max(
        Math.abs(actualBoundingBoxLeft) + Math.abs(actualBoundingBoxRight) || 0,
        width
      ) * SCALE
    );
    const canvasHeight = Math.ceil(
      Math.max(
        Math.abs(actualBoundingBoxAscent) +
          Math.abs(actualBoundingBoxDescent) || fontSize,
        Math.abs(fontBoundingBoxAscent) + Math.abs(fontBoundingBoxDescent) ||
          fontSize
      ) * SCALE
    );
    canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
    ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
    ctx.font = font;
    ctx.filter = "grayscale(1)";
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = "black";
    ctx.fillText(
      text,
      (canvasWidth * (SCALE - 1)) / 2,
      (canvasHeight * (3 - SCALE)) / 2
    );

    const uint8Buf = this.#toUint8(
      ctx.getImageData(0, 0, canvasWidth, canvasHeight).data
    );
    const histogram = this.#getHistogram(uint8Buf);
    const threshold = this.#guessThreshold(histogram);

    const contourList = this.#findContours(
      uint8Buf,
      canvasWidth,
      canvasHeight,
      threshold
    );

    return this.processDrawnLines({
      lines: { curves: contourList, width: canvasWidth, height: canvasHeight },
      pageWidth,
      pageHeight,
      rotation,
      innerMargin,
      mustSmooth: true,
      areContours: true,
    });
  }

  static process(bitmap, pageWidth, pageHeight, rotation, innerMargin) {
    const [uint8Buf, width, height] = this.#getGrayPixels(bitmap);
    const [buffer, histogram] = this.#bilateralFilter(
      uint8Buf,
      width,
      height,
      Math.hypot(width, height) * this.#PARAMETERS.sigmaSFactor,
      this.#PARAMETERS.sigmaR,
      this.#PARAMETERS.kernelSize
    );

    const threshold = this.#guessThreshold(histogram);
    const contourList = this.#findContours(buffer, width, height, threshold);

    return this.processDrawnLines({
      lines: { curves: contourList, width, height },
      pageWidth,
      pageHeight,
      rotation,
      innerMargin,
      mustSmooth: true,
      areContours: true,
    });
  }

  static processDrawnLines({
    lines,
    pageWidth,
    pageHeight,
    rotation,
    innerMargin,
    mustSmooth,
    areContours,
  }) {
    if (rotation % 180 !== 0) {
      [pageWidth, pageHeight] = [pageHeight, pageWidth];
    }

    const { curves, width, height } = lines;
    const thickness = lines.thickness ?? 0;
    const linesAndPoints = [];
    const ratio = Math.min(pageWidth / width, pageHeight / height);
    const xScale = ratio / pageWidth;
    const yScale = ratio / pageHeight;
    const newCurves = [];

    for (const { points } of curves) {
      const reducedPoints = mustSmooth ? this.#douglasPeucker(points) : points;
      if (!reducedPoints) {
        continue;
      }
      newCurves.push(reducedPoints);

      const len = reducedPoints.length;
      const newPoints = new Float32Array(len);
      const line = new Float32Array(3 * (len === 2 ? 2 : len - 2));
      linesAndPoints.push({ line, points: newPoints });

      if (len === 2) {
        newPoints[0] = reducedPoints[0] * xScale;
        newPoints[1] = reducedPoints[1] * yScale;
        line.set([NaN, NaN, NaN, NaN, newPoints[0], newPoints[1]], 0);
        continue;
      }

      let [x1, y1, x2, y2] = reducedPoints;
      x1 *= xScale;
      y1 *= yScale;
      x2 *= xScale;
      y2 *= yScale;
      newPoints.set([x1, y1, x2, y2], 0);

      line.set([NaN, NaN, NaN, NaN, x1, y1], 0);
      for (let i = 4; i < len; i += 2) {
        const x = (newPoints[i] = reducedPoints[i] * xScale);
        const y = (newPoints[i + 1] = reducedPoints[i + 1] * yScale);
        line.set(Outline.createBezierPoints(x1, y1, x2, y2, x, y), (i - 2) * 3);
        [x1, y1, x2, y2] = [x2, y2, x, y];
      }
    }

    if (linesAndPoints.length === 0) {
      return null;
    }

    const outline = areContours
      ? new ContourDrawOutline()
      : new InkDrawOutline();

    outline.build(
      linesAndPoints,
      pageWidth,
      pageHeight,
      1,
      rotation,
      areContours ? 0 : thickness,
      innerMargin
    );

    return { outline, newCurves, areContours, thickness, width, height };
  }

  static async compressSignature({
    outlines,
    areContours,
    thickness,
    width,
    height,
  }) {
    // We create a single array containing all the outlines.
    // The format is the following:
    // - 4 bytes: data length.
    // - 4 bytes: version.
    // - 4 bytes: width.
    // - 4 bytes: height.
    // - 4 bytes: 0 if it's a contour, 1 if it's an ink.
    // - 4 bytes: thickness.
    // - 4 bytes: number of drawings.
    // - 4 bytes: size of the buffer containing the diff of the coordinates.
    // - 4 bytes: number of points in the first drawing.
    // - 4 bytes: x coordinate of the first point.
    // - 4 bytes: y coordinate of the first point.
    // - 4 bytes: number of points in the second drawing.
    // - 4 bytes: x coordinate of the first point.
    // - 4 bytes: y coordinate of the first point.
    // - ...
    // - The buffer containing the diff of the coordinates.

    // The coordinates are supposed to be positive integers.

    // We also compute the min and max difference between two points.
    // This will help us to determine the type of the buffer (Int8, Int16 or
    // Int32) in order to minimize the amount of data we have.
    let minDiff = Infinity;
    let maxDiff = -Infinity;
    let outlinesLength = 0;
    for (const points of outlines) {
      outlinesLength += points.length;
      for (let i = 2, ii = points.length; i < ii; i++) {
        const dx = points[i] - points[i - 2];
        minDiff = Math.min(minDiff, dx);
        maxDiff = Math.max(maxDiff, dx);
      }
    }

    let bufferType;
    if (minDiff >= -128 && maxDiff <= 127) {
      bufferType = Int8Array;
    } else if (minDiff >= -32768 && maxDiff <= 32767) {
      bufferType = Int16Array;
    } else {
      bufferType = Int32Array;
    }

    const len = outlines.length;
    const headerLength = BASE_HEADER_LENGTH + POINTS_PROPERTIES_NUMBER * len;
    const header = new Uint32Array(headerLength);

    let offset = 0;
    header[offset++] =
      headerLength * Uint32Array.BYTES_PER_ELEMENT +
      (outlinesLength - 2 * len) * bufferType.BYTES_PER_ELEMENT;
    header[offset++] = 0; // Version.
    header[offset++] = width;
    header[offset++] = height;
    header[offset++] = areContours ? 0 : 1;
    header[offset++] = Math.max(0, Math.floor(thickness ?? 0));
    header[offset++] = len;
    header[offset++] = bufferType.BYTES_PER_ELEMENT;
    for (const points of outlines) {
      header[offset++] = points.length - 2;
      header[offset++] = points[0];
      header[offset++] = points[1];
    }

    const cs = new CompressionStream("deflate-raw");
    const writer = cs.writable.getWriter();
    await writer.ready;

    writer.write(header);
    const BufferCtor = bufferType.prototype.constructor;
    for (const points of outlines) {
      const diffs = new BufferCtor(points.length - 2);
      for (let i = 2, ii = points.length; i < ii; i++) {
        diffs[i - 2] = points[i] - points[i - 2];
      }
      writer.write(diffs);
    }

    writer.close();

    const buf = await new Response(cs.readable).arrayBuffer();
    const bytes = new Uint8Array(buf);

    return toBase64Util(bytes);
  }

  static async decompressSignature(signatureData) {
    try {
      const bytes = fromBase64Util(signatureData);
      const { readable, writable } = new DecompressionStream("deflate-raw");
      const writer = writable.getWriter();
      await writer.ready;

      // We can't await writer.write() because it'll block until the reader
      // starts which happens few lines below.
      writer
        .write(bytes)
        .then(async () => {
          await writer.ready;
          await writer.close();
        })
        .catch(() => {});

      let data = null;
      let offset = 0;
      for await (const chunk of readable) {
        data ||= new Uint8Array(new Uint32Array(chunk.buffer, 0, 4)[0]);
        data.set(chunk, offset);
        offset += chunk.length;
      }

      // We take a bit too much data for the header but it's fine.
      const header = new Uint32Array(data.buffer, 0, data.length >> 2);
      const version = header[1];
      if (version !== 0) {
        throw new Error(`Invalid version: ${version}`);
      }
      const width = header[2];
      const height = header[3];
      const areContours = header[4] === 0;
      const thickness = header[5];
      const numberOfDrawings = header[6];
      const bufferType = header[7];
      const outlines = [];
      const diffsOffset =
        (BASE_HEADER_LENGTH + POINTS_PROPERTIES_NUMBER * numberOfDrawings) *
        Uint32Array.BYTES_PER_ELEMENT;
      let diffs;

      switch (bufferType) {
        case Int8Array.BYTES_PER_ELEMENT:
          diffs = new Int8Array(data.buffer, diffsOffset);
          break;
        case Int16Array.BYTES_PER_ELEMENT:
          diffs = new Int16Array(data.buffer, diffsOffset);
          break;
        case Int32Array.BYTES_PER_ELEMENT:
          diffs = new Int32Array(data.buffer, diffsOffset);
          break;
      }

      offset = 0;
      for (let i = 0; i < numberOfDrawings; i++) {
        const len = header[POINTS_PROPERTIES_NUMBER * i + BASE_HEADER_LENGTH];
        const points = new Float32Array(len + 2);
        outlines.push(points);

        for (let j = 0; j < POINTS_PROPERTIES_NUMBER - 1; j++) {
          points[j] =
            header[POINTS_PROPERTIES_NUMBER * i + BASE_HEADER_LENGTH + j + 1];
        }
        for (let j = 0; j < len; j++) {
          points[j + 2] = points[j] + diffs[offset++];
        }
      }

      return {
        areContours,
        thickness,
        outlines,
        width,
        height,
      };
    } catch (e) {
      warn(`decompressSignature: ${e}`);
      return null;
    }
  }
}

export { SignatureExtractor };
