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

import { Util } from "../../shared/util.js";

class Outliner {
  #box;

  #verticalEdges = [];

  #intervals = [];

  /**
   * Construct an outliner.
   * @param {Array<Object>} boxes - An array of axis-aligned rectangles.
   * @param {number} borderWidth - The width of the border of the boxes, it
   *   allows to make the boxes bigger (or smaller).
   * @param {number} innerMargin - The margin between the boxes and the
   *   outlines. It's important to not have a null innerMargin when we want to
   *   draw the outline else the stroked outline could be clipped because of its
   *   width.
   * @param {boolean} isLTR - true if we're in LTR mode. It's used to determine
   *   the last point of the boxes.
   */
  constructor(boxes, borderWidth = 0, innerMargin = 0, isLTR = true) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    // We round the coordinates to slightly reduce the number of edges in the
    // final outlines.
    const NUMBER_OF_DIGITS = 4;
    const EPSILON = 10 ** -NUMBER_OF_DIGITS;

    // The coordinates of the boxes are in the page coordinate system.
    for (const { x, y, width, height } of boxes) {
      const x1 = Math.floor((x - borderWidth) / EPSILON) * EPSILON;
      const x2 = Math.ceil((x + width + borderWidth) / EPSILON) * EPSILON;
      const y1 = Math.floor((y - borderWidth) / EPSILON) * EPSILON;
      const y2 = Math.ceil((y + height + borderWidth) / EPSILON) * EPSILON;
      const left = [x1, y1, y2, true];
      const right = [x2, y1, y2, false];
      this.#verticalEdges.push(left, right);

      minX = Math.min(minX, x1);
      maxX = Math.max(maxX, x2);
      minY = Math.min(minY, y1);
      maxY = Math.max(maxY, y2);
    }

    const bboxWidth = maxX - minX + 2 * innerMargin;
    const bboxHeight = maxY - minY + 2 * innerMargin;
    const shiftedMinX = minX - innerMargin;
    const shiftedMinY = minY - innerMargin;
    const lastEdge = this.#verticalEdges.at(isLTR ? -1 : -2);
    const lastPoint = [lastEdge[0], lastEdge[2]];

    // Convert the coordinates of the edges into box coordinates.
    for (const edge of this.#verticalEdges) {
      const [x, y1, y2] = edge;
      edge[0] = (x - shiftedMinX) / bboxWidth;
      edge[1] = (y1 - shiftedMinY) / bboxHeight;
      edge[2] = (y2 - shiftedMinY) / bboxHeight;
    }

    this.#box = {
      x: shiftedMinX,
      y: shiftedMinY,
      width: bboxWidth,
      height: bboxHeight,
      lastPoint,
    };
  }

  getOutlines() {
    // We begin to sort lexicographically the vertical edges by their abscissa,
    // and then by their ordinate.
    this.#verticalEdges.sort(
      (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
    );

    // We're now using a sweep line algorithm to find the outlines.
    // We start with the leftmost vertical edge, and we're going to iterate
    // over all the vertical edges from left to right.
    // Each time we encounter a left edge, we're going to insert the interval
    // [y1, y2] in the set of intervals.
    // This set of intervals is used to break the vertical edges into chunks:
    // we only take the part of the vertical edge that isn't in the union of
    // the intervals.
    const outlineVerticalEdges = [];
    for (const edge of this.#verticalEdges) {
      if (edge[3]) {
        // Left edge.
        outlineVerticalEdges.push(...this.#breakEdge(edge));
        this.#insert(edge);
      } else {
        // Right edge.
        this.#remove(edge);
        outlineVerticalEdges.push(...this.#breakEdge(edge));
      }
    }
    return this.#getOutlines(outlineVerticalEdges);
  }

  #getOutlines(outlineVerticalEdges) {
    const edges = [];
    const allEdges = new Set();

    for (const edge of outlineVerticalEdges) {
      const [x, y1, y2] = edge;
      edges.push([x, y1, edge], [x, y2, edge]);
    }

    // We sort lexicographically the vertices of each edge by their ordinate and
    // by their abscissa.
    // Every pair (v_2i, v_{2i + 1}) of vertices defines a horizontal edge.
    // So for every vertical edge, we're going to add the two vertical edges
    // which are connected to it through a horizontal edge.
    edges.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (let i = 0, ii = edges.length; i < ii; i += 2) {
      const edge1 = edges[i][2];
      const edge2 = edges[i + 1][2];
      edge1.push(edge2);
      edge2.push(edge1);
      allEdges.add(edge1);
      allEdges.add(edge2);
    }
    const outlines = [];
    let outline;

    while (allEdges.size > 0) {
      const edge = allEdges.values().next().value;
      let [x, y1, y2, edge1, edge2] = edge;
      allEdges.delete(edge);
      let lastPointX = x;
      let lastPointY = y1;

      outline = [x, y2];
      outlines.push(outline);

      while (true) {
        let e;
        if (allEdges.has(edge1)) {
          e = edge1;
        } else if (allEdges.has(edge2)) {
          e = edge2;
        } else {
          break;
        }

        allEdges.delete(e);
        [x, y1, y2, edge1, edge2] = e;

        if (lastPointX !== x) {
          outline.push(lastPointX, lastPointY, x, lastPointY === y1 ? y1 : y2);
          lastPointX = x;
        }
        lastPointY = lastPointY === y1 ? y2 : y1;
      }
      outline.push(lastPointX, lastPointY);
    }
    return new HighlightOutline(outlines, this.#box);
  }

  #binarySearch(y) {
    const array = this.#intervals;
    let start = 0;
    let end = array.length - 1;

    while (start <= end) {
      const middle = (start + end) >> 1;
      const y1 = array[middle][0];
      if (y1 === y) {
        return middle;
      }
      if (y1 < y) {
        start = middle + 1;
      } else {
        end = middle - 1;
      }
    }
    return end + 1;
  }

  #insert([, y1, y2]) {
    const index = this.#binarySearch(y1);
    this.#intervals.splice(index, 0, [y1, y2]);
  }

  #remove([, y1, y2]) {
    const index = this.#binarySearch(y1);
    for (let i = index; i < this.#intervals.length; i++) {
      const [start, end] = this.#intervals[i];
      if (start !== y1) {
        break;
      }
      if (start === y1 && end === y2) {
        this.#intervals.splice(i, 1);
        return;
      }
    }
    for (let i = index - 1; i >= 0; i--) {
      const [start, end] = this.#intervals[i];
      if (start !== y1) {
        break;
      }
      if (start === y1 && end === y2) {
        this.#intervals.splice(i, 1);
        return;
      }
    }
  }

  #breakEdge(edge) {
    const [x, y1, y2] = edge;
    const results = [[x, y1, y2]];
    const index = this.#binarySearch(y2);
    for (let i = 0; i < index; i++) {
      const [start, end] = this.#intervals[i];
      for (let j = 0, jj = results.length; j < jj; j++) {
        const [, y3, y4] = results[j];
        if (end <= y3 || y4 <= start) {
          // There is no intersection between the interval and the edge, hence
          // we keep it as is.
          continue;
        }
        if (y3 >= start) {
          if (y4 > end) {
            results[j][1] = end;
          } else {
            if (jj === 1) {
              return [];
            }
            // The edge is included in the interval, hence we remove it.
            results.splice(j, 1);
            j--;
            jj--;
          }
          continue;
        }
        results[j][2] = start;
        if (y4 > end) {
          results.push([x, end, y4]);
        }
      }
    }
    return results;
  }
}

class Outline {
  /**
   * @returns {string} The SVG path of the outline.
   */
  toSVGPath() {
    throw new Error("Abstract method `toSVGPath` must be implemented.");
  }

  /**
   * @type {Object|null} The bounding box of the outline.
   */
  get box() {
    throw new Error("Abstract getter `box` must be implemented.");
  }

  serialize(_bbox, _rotation) {
    throw new Error("Abstract method `serialize` must be implemented.");
  }

  get free() {
    return this instanceof FreeHighlightOutline;
  }
}

class HighlightOutline extends Outline {
  #box;

  #outlines;

  constructor(outlines, box) {
    super();
    this.#outlines = outlines;
    this.#box = box;
  }

  toSVGPath() {
    const buffer = [];
    for (const polygon of this.#outlines) {
      let [prevX, prevY] = polygon;
      buffer.push(`M${prevX} ${prevY}`);
      for (let i = 2; i < polygon.length; i += 2) {
        const x = polygon[i];
        const y = polygon[i + 1];
        if (x === prevX) {
          buffer.push(`V${y}`);
          prevY = y;
        } else if (y === prevY) {
          buffer.push(`H${x}`);
          prevX = x;
        }
      }
      buffer.push("Z");
    }
    return buffer.join(" ");
  }

  /**
   * Serialize the outlines into the PDF page coordinate system.
   * @param {Array<number>} _bbox - the bounding box of the annotation.
   * @param {number} _rotation - the rotation of the annotation.
   * @returns {Array<Array<number>>}
   */
  serialize([blX, blY, trX, trY], _rotation) {
    const outlines = [];
    const width = trX - blX;
    const height = trY - blY;
    for (const outline of this.#outlines) {
      const points = new Array(outline.length);
      for (let i = 0; i < outline.length; i += 2) {
        points[i] = blX + outline[i] * width;
        points[i + 1] = trY - outline[i + 1] * height;
      }
      outlines.push(points);
    }
    return outlines;
  }

  get box() {
    return this.#box;
  }
}

class FreeOutliner {
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
  #last = new Float64Array(18);

  #lastX;

  #lastY;

  #min;

  #min_dist;

  #scaleFactor;

  #thickness;

  #points = [];

  static #MIN_DIST = 8;

  static #MIN_DIFF = 2;

  static #MIN = FreeOutliner.#MIN_DIST + FreeOutliner.#MIN_DIFF;

  constructor({ x, y }, box, scaleFactor, thickness, isLTR, innerMargin = 0) {
    this.#box = box;
    this.#thickness = thickness * scaleFactor;
    this.#isLTR = isLTR;
    this.#last.set([NaN, NaN, NaN, NaN, x, y], 6);
    this.#innerMargin = innerMargin;
    this.#min_dist = FreeOutliner.#MIN_DIST * scaleFactor;
    this.#min = FreeOutliner.#MIN * scaleFactor;
    this.#scaleFactor = scaleFactor;
    this.#points.push(x, y);
  }

  get free() {
    return true;
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
    const lastTop = this.#last.subarray(4, 6);
    const lastBottom = this.#last.subarray(16, 18);
    const [x, y, width, height] = this.#box;
    const [lastTopX, lastTopY, lastBottomX, lastBottomY] =
      this.#getLastCoords();

    if (isNaN(this.#last[6]) && !this.isEmpty()) {
      // We've only two points.
      return `M${(this.#last[2] - x) / width} ${
        (this.#last[3] - y) / height
      } L${(this.#last[4] - x) / width} ${(this.#last[5] - y) / height} L${lastTopX} ${lastTopY} L${lastBottomX} ${lastBottomY} L${
        (this.#last[16] - x) / width
      } ${(this.#last[17] - y) / height} L${(this.#last[14] - x) / width} ${
        (this.#last[15] - y) / height
      } Z`;
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

    buffer.push(
      `L${(lastTop[0] - x) / width} ${(lastTop[1] - y) / height} L${lastTopX} ${lastTopY} L${lastBottomX} ${lastBottomY} L${
        (lastBottom[0] - x) / width
      } ${(lastBottom[1] - y) / height}`
    );
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
    buffer.push(`L${bottom[4]} ${bottom[5]} Z`);

    return buffer.join(" ");
  }

  getOutlines() {
    const top = this.#top;
    const bottom = this.#bottom;
    const last = this.#last;
    const lastTop = last.subarray(4, 6);
    const lastBottom = last.subarray(16, 18);
    const [layerX, layerY, layerWidth, layerHeight] = this.#box;

    const points = new Float64Array((this.#points?.length ?? 0) + 2);
    for (let i = 0, ii = points.length - 2; i < ii; i += 2) {
      points[i] = (this.#points[i] - layerX) / layerWidth;
      points[i + 1] = (this.#points[i + 1] - layerY) / layerHeight;
    }
    points[points.length - 2] = (this.#lastX - layerX) / layerWidth;
    points[points.length - 1] = (this.#lastY - layerY) / layerHeight;
    const [lastTopX, lastTopY, lastBottomX, lastBottomY] =
      this.#getLastCoords();

    if (isNaN(last[6]) && !this.isEmpty()) {
      // We've only two points.
      const outline = new Float64Array(36);
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
      return new FreeHighlightOutline(
        outline,
        points,
        this.#box,
        this.#scaleFactor,
        this.#innerMargin,
        this.#isLTR
      );
    }

    const outline = new Float64Array(
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
      N
    );
    N += 24;

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
    outline.set([NaN, NaN, NaN, NaN, bottom[4], bottom[5]], N);
    return new FreeHighlightOutline(
      outline,
      points,
      this.#box,
      this.#scaleFactor,
      this.#innerMargin,
      this.#isLTR
    );
  }
}

class FreeHighlightOutline extends Outline {
  #box;

  #bbox = null;

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
    this.#computeMinMax(isLTR);

    const { x, y, width, height } = this.#bbox;
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
        outline = this.#rescale(this.#outline, blX, trY, width, -height);
        points = this.#rescale(this.#points, blX, trY, width, -height);
        break;
      case 90:
        outline = this.#rescaleAndSwap(this.#outline, blX, blY, width, height);
        points = this.#rescaleAndSwap(this.#points, blX, blY, width, height);
        break;
      case 180:
        outline = this.#rescale(this.#outline, trX, blY, -width, height);
        points = this.#rescale(this.#points, trX, blY, -width, height);
        break;
      case 270:
        outline = this.#rescaleAndSwap(
          this.#outline,
          trX,
          trY,
          -width,
          -height
        );
        points = this.#rescaleAndSwap(this.#points, trX, trY, -width, -height);
        break;
    }
    return { outline: Array.from(outline), points: [Array.from(points)] };
  }

  #rescale(src, tx, ty, sx, sy) {
    const dest = new Float64Array(src.length);
    for (let i = 0, ii = src.length; i < ii; i += 2) {
      dest[i] = tx + src[i] * sx;
      dest[i + 1] = ty + src[i + 1] * sy;
    }
    return dest;
  }

  #rescaleAndSwap(src, tx, ty, sx, sy) {
    const dest = new Float64Array(src.length);
    for (let i = 0, ii = src.length; i < ii; i += 2) {
      dest[i] = tx + src[i + 1] * sx;
      dest[i + 1] = ty + src[i] * sy;
    }
    return dest;
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

    const x = minX - this.#innerMargin,
      y = minY - this.#innerMargin,
      width = maxX - minX + 2 * this.#innerMargin,
      height = maxY - minY + 2 * this.#innerMargin;
    this.#bbox = { x, y, width, height, lastPoint: [lastPointX, lastPointY] };
  }

  get box() {
    return this.#bbox;
  }

  getNewOutline(thickness, innerMargin) {
    // Build the outline of the highlight to use as the focus outline.
    const { x, y, width, height } = this.#bbox;
    const [layerX, layerY, layerWidth, layerHeight] = this.#box;
    const sx = width * layerWidth;
    const sy = height * layerHeight;
    const tx = x * layerWidth + layerX;
    const ty = y * layerHeight + layerY;
    const outliner = new FreeOutliner(
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

export { FreeOutliner, Outliner };
