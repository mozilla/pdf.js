/* Copyright 2024 Mozilla Foundation
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

import { Outline } from "./outline.js";
import { Util } from "../../../shared/util.js";

class FreeDrawOutliner {
  #box;

  #bottom = [];

  #innerMargin;

  #isLTR;

  #top = [];

  // The first 6 elements are the last 3 points of the top part of the outline.
  // The next 6 elements are the last 3 points of the line.
  // The next 6 elements are the last 3 points of the bottom part of the
  // outline.
  // We track the last 3 points in order to be able to:
  //  - compute the normal of the line,
  //  - compute the control points of the quadratic Bézier curve.
  #last = new Float32Array(18);

  #lastX;

  #lastY;

  #min;

  #min_dist;

  #scaleFactor;

  #thickness;

  #points = [];

  static #MIN_DIST = 8;

  static #MIN_DIFF = 2;

  static #MIN = FreeDrawOutliner.#MIN_DIST + FreeDrawOutliner.#MIN_DIFF;

  constructor({ x, y }, box, scaleFactor, thickness, isLTR, innerMargin = 0) {
    this.#box = box;
    this.#thickness = thickness * scaleFactor;
    this.#isLTR = isLTR;
    this.#last.set([NaN, NaN, NaN, NaN, x, y], 6);
    this.#innerMargin = innerMargin;
    this.#min_dist = FreeDrawOutliner.#MIN_DIST * scaleFactor;
    this.#min = FreeDrawOutliner.#MIN * scaleFactor;
    this.#scaleFactor = scaleFactor;
    this.#points.push(x, y);
  }

  isEmpty() {
    // When we add a second point then this.#last.slice(6) will be something
    // like [NaN, NaN, firstX, firstY, secondX, secondY,...] so having a NaN
    // at index 8 means that we've only one point.
    return isNaN(this.#last[8]);
  }

  #getLastCoords() {
    const lastTop = this.#last.subarray(4, 6);
    const lastBottom = this.#last.subarray(16, 18);
    const [x, y, width, height] = this.#box;

    return [
      (this.#lastX + (lastTop[0] - lastBottom[0]) / 2 - x) / width,
      (this.#lastY + (lastTop[1] - lastBottom[1]) / 2 - y) / height,
      (this.#lastX + (lastBottom[0] - lastTop[0]) / 2 - x) / width,
      (this.#lastY + (lastBottom[1] - lastTop[1]) / 2 - y) / height,
    ];
  }

  add({ x, y }) {
    this.#lastX = x;
    this.#lastY = y;
    const [layerX, layerY, layerWidth, layerHeight] = this.#box;
    let [x1, y1, x2, y2] = this.#last.subarray(8, 12);
    const diffX = x - x2;
    const diffY = y - y2;
    const d = Math.hypot(diffX, diffY);
    if (d < this.#min) {
      // The idea is to avoid garbage points around the last point.
      // When the points are too close, it just leads to bad normal vectors and
      // control points.
      return false;
    }
    const diffD = d - this.#min_dist;
    const K = diffD / d;
    const shiftX = K * diffX;
    const shiftY = K * diffY;

    // We update the last 3 points of the line.
    let x0 = x1;
    let y0 = y1;
    x1 = x2;
    y1 = y2;
    x2 += shiftX;
    y2 += shiftY;

    // We keep track of the points in order to be able to compute the focus
    // outline.
    this.#points?.push(x, y);

    // Create the normal unit vector.
    // |(shiftX, shiftY)| = |K| * |(diffX, diffY)| = |K| * d = diffD.
    const nX = -shiftY / diffD;
    const nY = shiftX / diffD;
    const thX = nX * this.#thickness;
    const thY = nY * this.#thickness;
    this.#last.set(this.#last.subarray(2, 8), 0);
    this.#last.set([x2 + thX, y2 + thY], 4);
    this.#last.set(this.#last.subarray(14, 18), 12);
    this.#last.set([x2 - thX, y2 - thY], 16);

    if (isNaN(this.#last[6])) {
      if (this.#top.length === 0) {
        this.#last.set([x1 + thX, y1 + thY], 2);
        this.#top.push(
          NaN,
          NaN,
          NaN,
          NaN,
          (x1 + thX - layerX) / layerWidth,
          (y1 + thY - layerY) / layerHeight
        );
        this.#last.set([x1 - thX, y1 - thY], 14);
        this.#bottom.push(
          NaN,
          NaN,
          NaN,
          NaN,
          (x1 - thX - layerX) / layerWidth,
          (y1 - thY - layerY) / layerHeight
        );
      }
      this.#last.set([x0, y0, x1, y1, x2, y2], 6);
      return !this.isEmpty();
    }

    this.#last.set([x0, y0, x1, y1, x2, y2], 6);

    const angle = Math.abs(
      Math.atan2(y0 - y1, x0 - x1) - Math.atan2(shiftY, shiftX)
    );
    if (angle < Math.PI / 2) {
      // In order to avoid some possible artifacts, we're going to use the a
      // straight line instead of a quadratic Bézier curve.
      [x1, y1, x2, y2] = this.#last.subarray(2, 6);
      this.#top.push(
        NaN,
        NaN,
        NaN,
        NaN,
        ((x1 + x2) / 2 - layerX) / layerWidth,
        ((y1 + y2) / 2 - layerY) / layerHeight
      );
      [x1, y1, x0, y0] = this.#last.subarray(14, 18);
      this.#bottom.push(
        NaN,
        NaN,
        NaN,
        NaN,
        ((x0 + x1) / 2 - layerX) / layerWidth,
        ((y0 + y1) / 2 - layerY) / layerHeight
      );
      return true;
    }

    // Control points and the final point for the quadratic Bézier curve.
    [x0, y0, x1, y1, x2, y2] = this.#last.subarray(0, 6);
    this.#top.push(
      ((x0 + 5 * x1) / 6 - layerX) / layerWidth,
      ((y0 + 5 * y1) / 6 - layerY) / layerHeight,
      ((5 * x1 + x2) / 6 - layerX) / layerWidth,
      ((5 * y1 + y2) / 6 - layerY) / layerHeight,
      ((x1 + x2) / 2 - layerX) / layerWidth,
      ((y1 + y2) / 2 - layerY) / layerHeight
    );
    [x2, y2, x1, y1, x0, y0] = this.#last.subarray(12, 18);
    this.#bottom.push(
      ((x0 + 5 * x1) / 6 - layerX) / layerWidth,
      ((y0 + 5 * y1) / 6 - layerY) / layerHeight,
      ((5 * x1 + x2) / 6 - layerX) / layerWidth,
      ((5 * y1 + y2) / 6 - layerY) / layerHeight,
      ((x1 + x2) / 2 - layerX) / layerWidth,
      ((y1 + y2) / 2 - layerY) / layerHeight
    );
    return true;
  }

  toSVGPath() {
    if (this.isEmpty()) {
      // We've only one point.
      return "";
    }
    const top = this.#top;
    const bottom = this.#bottom;

    if (isNaN(this.#last[6]) && !this.isEmpty()) {
      // We've only two points.
      return this.#toSVGPathTwoPoints();
    }

    const buffer = [];
    buffer.push(`M${top[4]} ${top[5]}`);
    for (let i = 6; i < top.length; i += 6) {
      if (isNaN(top[i])) {
        buffer.push(`L${top[i + 4]} ${top[i + 5]}`);
      } else {
        buffer.push(
          `C${top[i]} ${top[i + 1]} ${top[i + 2]} ${top[i + 3]} ${top[i + 4]} ${
            top[i + 5]
          }`
        );
      }
    }

    this.#toSVGPathEnd(buffer);

    for (let i = bottom.length - 6; i >= 6; i -= 6) {
      if (isNaN(bottom[i])) {
        buffer.push(`L${bottom[i + 4]} ${bottom[i + 5]}`);
      } else {
        buffer.push(
          `C${bottom[i]} ${bottom[i + 1]} ${bottom[i + 2]} ${bottom[i + 3]} ${
            bottom[i + 4]
          } ${bottom[i + 5]}`
        );
      }
    }

    this.#toSVGPathStart(buffer);

    return buffer.join(" ");
  }

  #toSVGPathTwoPoints() {
    const [x, y, width, height] = this.#box;
    const [lastTopX, lastTopY, lastBottomX, lastBottomY] =
      this.#getLastCoords();

    return `M${(this.#last[2] - x) / width} ${
      (this.#last[3] - y) / height
    } L${(this.#last[4] - x) / width} ${(this.#last[5] - y) / height} L${lastTopX} ${lastTopY} L${lastBottomX} ${lastBottomY} L${
      (this.#last[16] - x) / width
    } ${(this.#last[17] - y) / height} L${(this.#last[14] - x) / width} ${
      (this.#last[15] - y) / height
    } Z`;
  }

  #toSVGPathStart(buffer) {
    const bottom = this.#bottom;
    buffer.push(`L${bottom[4]} ${bottom[5]} Z`);
  }

  #toSVGPathEnd(buffer) {
    const [x, y, width, height] = this.#box;
    const lastTop = this.#last.subarray(4, 6);
    const lastBottom = this.#last.subarray(16, 18);
    const [lastTopX, lastTopY, lastBottomX, lastBottomY] =
      this.#getLastCoords();

    buffer.push(
      `L${(lastTop[0] - x) / width} ${(lastTop[1] - y) / height} L${lastTopX} ${lastTopY} L${lastBottomX} ${lastBottomY} L${
        (lastBottom[0] - x) / width
      } ${(lastBottom[1] - y) / height}`
    );
  }

  newFreeDrawOutline(outline, points, box, scaleFactor, innerMargin, isLTR) {
    return new FreeDrawOutline(
      outline,
      points,
      box,
      scaleFactor,
      innerMargin,
      isLTR
    );
  }

  getOutlines() {
    const top = this.#top;
    const bottom = this.#bottom;
    const last = this.#last;
    const [layerX, layerY, layerWidth, layerHeight] = this.#box;

    const points = new Float32Array((this.#points?.length ?? 0) + 2);
    for (let i = 0, ii = points.length - 2; i < ii; i += 2) {
      points[i] = (this.#points[i] - layerX) / layerWidth;
      points[i + 1] = (this.#points[i + 1] - layerY) / layerHeight;
    }
    points[points.length - 2] = (this.#lastX - layerX) / layerWidth;
    points[points.length - 1] = (this.#lastY - layerY) / layerHeight;

    if (isNaN(last[6]) && !this.isEmpty()) {
      // We've only two points.
      return this.#getOutlineTwoPoints(points);
    }

    const outline = new Float32Array(
      this.#top.length + 24 + this.#bottom.length
    );
    let N = top.length;
    for (let i = 0; i < N; i += 2) {
      if (isNaN(top[i])) {
        outline[i] = outline[i + 1] = NaN;
        continue;
      }
      outline[i] = top[i];
      outline[i + 1] = top[i + 1];
    }

    N = this.#getOutlineEnd(outline, N);

    for (let i = bottom.length - 6; i >= 6; i -= 6) {
      for (let j = 0; j < 6; j += 2) {
        if (isNaN(bottom[i + j])) {
          outline[N] = outline[N + 1] = NaN;
          N += 2;
          continue;
        }
        outline[N] = bottom[i + j];
        outline[N + 1] = bottom[i + j + 1];
        N += 2;
      }
    }

    this.#getOutlineStart(outline, N);

    return this.newFreeDrawOutline(
      outline,
      points,
      this.#box,
      this.#scaleFactor,
      this.#innerMargin,
      this.#isLTR
    );
  }

  #getOutlineTwoPoints(points) {
    const last = this.#last;
    const [layerX, layerY, layerWidth, layerHeight] = this.#box;
    const [lastTopX, lastTopY, lastBottomX, lastBottomY] =
      this.#getLastCoords();
    const outline = new Float32Array(36);
    outline.set(
      [
        NaN,
        NaN,
        NaN,
        NaN,
        (last[2] - layerX) / layerWidth,
        (last[3] - layerY) / layerHeight,
        NaN,
        NaN,
        NaN,
        NaN,
        (last[4] - layerX) / layerWidth,
        (last[5] - layerY) / layerHeight,
        NaN,
        NaN,
        NaN,
        NaN,
        lastTopX,
        lastTopY,
        NaN,
        NaN,
        NaN,
        NaN,
        lastBottomX,
        lastBottomY,
        NaN,
        NaN,
        NaN,
        NaN,
        (last[16] - layerX) / layerWidth,
        (last[17] - layerY) / layerHeight,
        NaN,
        NaN,
        NaN,
        NaN,
        (last[14] - layerX) / layerWidth,
        (last[15] - layerY) / layerHeight,
      ],
      0
    );
    return this.newFreeDrawOutline(
      outline,
      points,
      this.#box,
      this.#scaleFactor,
      this.#innerMargin,
      this.#isLTR
    );
  }

  #getOutlineStart(outline, pos) {
    const bottom = this.#bottom;
    outline.set([NaN, NaN, NaN, NaN, bottom[4], bottom[5]], pos);
    return (pos += 6);
  }

  #getOutlineEnd(outline, pos) {
    const lastTop = this.#last.subarray(4, 6);
    const lastBottom = this.#last.subarray(16, 18);
    const [layerX, layerY, layerWidth, layerHeight] = this.#box;
    const [lastTopX, lastTopY, lastBottomX, lastBottomY] =
      this.#getLastCoords();
    outline.set(
      [
        NaN,
        NaN,
        NaN,
        NaN,
        (lastTop[0] - layerX) / layerWidth,
        (lastTop[1] - layerY) / layerHeight,
        NaN,
        NaN,
        NaN,
        NaN,
        lastTopX,
        lastTopY,
        NaN,
        NaN,
        NaN,
        NaN,
        lastBottomX,
        lastBottomY,
        NaN,
        NaN,
        NaN,
        NaN,
        (lastBottom[0] - layerX) / layerWidth,
        (lastBottom[1] - layerY) / layerHeight,
      ],
      pos
    );
    return (pos += 24);
  }
}

class FreeDrawOutline extends Outline {
  #box;

  #bbox = new Float32Array(4);

  #innerMargin;

  #isLTR;

  #points;

  #scaleFactor;

  #outline;

  constructor(outline, points, box, scaleFactor, innerMargin, isLTR) {
    super();
    this.#outline = outline;
    this.#points = points;
    this.#box = box;
    this.#scaleFactor = scaleFactor;
    this.#innerMargin = innerMargin;
    this.#isLTR = isLTR;
    this.lastPoint = [NaN, NaN];
    this.#computeMinMax(isLTR);

    const [x, y, width, height] = this.#bbox;
    for (let i = 0, ii = outline.length; i < ii; i += 2) {
      outline[i] = (outline[i] - x) / width;
      outline[i + 1] = (outline[i + 1] - y) / height;
    }
    for (let i = 0, ii = points.length; i < ii; i += 2) {
      points[i] = (points[i] - x) / width;
      points[i + 1] = (points[i + 1] - y) / height;
    }
  }

  toSVGPath() {
    const buffer = [`M${this.#outline[4]} ${this.#outline[5]}`];
    for (let i = 6, ii = this.#outline.length; i < ii; i += 6) {
      if (isNaN(this.#outline[i])) {
        buffer.push(`L${this.#outline[i + 4]} ${this.#outline[i + 5]}`);
        continue;
      }
      buffer.push(
        `C${this.#outline[i]} ${this.#outline[i + 1]} ${this.#outline[i + 2]} ${
          this.#outline[i + 3]
        } ${this.#outline[i + 4]} ${this.#outline[i + 5]}`
      );
    }
    buffer.push("Z");
    return buffer.join(" ");
  }

  serialize([blX, blY, trX, trY], rotation) {
    const width = trX - blX;
    const height = trY - blY;
    let outline;
    let points;
    switch (rotation) {
      case 0:
        outline = Outline._rescale(this.#outline, blX, trY, width, -height);
        points = Outline._rescale(this.#points, blX, trY, width, -height);
        break;
      case 90:
        outline = Outline._rescaleAndSwap(
          this.#outline,
          blX,
          blY,
          width,
          height
        );
        points = Outline._rescaleAndSwap(this.#points, blX, blY, width, height);
        break;
      case 180:
        outline = Outline._rescale(this.#outline, trX, blY, -width, height);
        points = Outline._rescale(this.#points, trX, blY, -width, height);
        break;
      case 270:
        outline = Outline._rescaleAndSwap(
          this.#outline,
          trX,
          trY,
          -width,
          -height
        );
        points = Outline._rescaleAndSwap(
          this.#points,
          trX,
          trY,
          -width,
          -height
        );
        break;
    }
    return { outline: Array.from(outline), points: [Array.from(points)] };
  }

  #computeMinMax(isLTR) {
    const outline = this.#outline;
    let lastX = outline[4];
    let lastY = outline[5];
    let minX = lastX;
    let minY = lastY;
    let maxX = lastX;
    let maxY = lastY;
    let lastPointX = lastX;
    let lastPointY = lastY;
    const ltrCallback = isLTR ? Math.max : Math.min;

    for (let i = 6, ii = outline.length; i < ii; i += 6) {
      if (isNaN(outline[i])) {
        minX = Math.min(minX, outline[i + 4]);
        minY = Math.min(minY, outline[i + 5]);
        maxX = Math.max(maxX, outline[i + 4]);
        maxY = Math.max(maxY, outline[i + 5]);
        if (lastPointY < outline[i + 5]) {
          lastPointX = outline[i + 4];
          lastPointY = outline[i + 5];
        } else if (lastPointY === outline[i + 5]) {
          lastPointX = ltrCallback(lastPointX, outline[i + 4]);
        }
      } else {
        const bbox = Util.bezierBoundingBox(
          lastX,
          lastY,
          ...outline.slice(i, i + 6)
        );
        minX = Math.min(minX, bbox[0]);
        minY = Math.min(minY, bbox[1]);
        maxX = Math.max(maxX, bbox[2]);
        maxY = Math.max(maxY, bbox[3]);
        if (lastPointY < bbox[3]) {
          lastPointX = bbox[2];
          lastPointY = bbox[3];
        } else if (lastPointY === bbox[3]) {
          lastPointX = ltrCallback(lastPointX, bbox[2]);
        }
      }
      lastX = outline[i + 4];
      lastY = outline[i + 5];
    }

    const bbox = this.#bbox;
    bbox[0] = minX - this.#innerMargin;
    bbox[1] = minY - this.#innerMargin;
    bbox[2] = maxX - minX + 2 * this.#innerMargin;
    bbox[3] = maxY - minY + 2 * this.#innerMargin;
    this.lastPoint = [lastPointX, lastPointY];
  }

  get box() {
    return this.#bbox;
  }

  newOutliner(point, box, scaleFactor, thickness, isLTR, innerMargin = 0) {
    return new FreeDrawOutliner(
      point,
      box,
      scaleFactor,
      thickness,
      isLTR,
      innerMargin
    );
  }

  getNewOutline(thickness, innerMargin) {
    // Build the outline of the highlight to use as the focus outline.
    const [x, y, width, height] = this.#bbox;
    const [layerX, layerY, layerWidth, layerHeight] = this.#box;
    const sx = width * layerWidth;
    const sy = height * layerHeight;
    const tx = x * layerWidth + layerX;
    const ty = y * layerHeight + layerY;
    const outliner = this.newOutliner(
      {
        x: this.#points[0] * sx + tx,
        y: this.#points[1] * sy + ty,
      },
      this.#box,
      this.#scaleFactor,
      thickness,
      this.#isLTR,
      innerMargin ?? this.#innerMargin
    );
    for (let i = 2; i < this.#points.length; i += 2) {
      outliner.add({
        x: this.#points[i] * sx + tx,
        y: this.#points[i + 1] * sy + ty,
      });
    }
    return outliner.getOutlines();
  }
}

export { FreeDrawOutline, FreeDrawOutliner };
