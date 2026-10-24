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

import { F32_BBOX_INIT, Util } from "../../../shared/util.js";
import { InputSmoother } from "./input_smoother.js";
import { MathClamp } from "../../../shared/math_clamp.js";
import { Outline } from "./outline.js";

function svgPoint(data, i) {
  return `${Outline.svgRound(data[i])} ${Outline.svgRound(data[i + 1])}`;
}

function pushCurves(buffer, line, start) {
  for (let i = start, ii = line.length; i < ii; i += 6) {
    buffer.push(
      `C${svgPoint(line, i)} ${svgPoint(line, i + 2)} ${svgPoint(line, i + 4)}`
    );
  }
}

/**
 * @param {Array<number>|Float32Array} line - Start point prefixed by four NaNs,
 *   optionally followed by a similarly prefixed point or Bézier segments.
 * @returns {string}
 */
function lineToSVGPath(line) {
  const start = `M${svgPoint(line, 4)}`;
  if (line.length === 6) {
    return `${start}Z`;
  }
  if (line.length === 12 && isNaN(line[6])) {
    return `${start}L${svgPoint(line, 10)}`;
  }
  const buffer = [start];
  pushCurves(buffer, line, 6);
  return buffer.join("");
}

class InkDrawOutliner {
  // The last 3 points of the line.
  #last = new Float64Array(6);

  // Latest normalized input position, set by #normalizeToTip.
  #tip = new Float64Array(2);

  #line;

  #lines;

  #rotation;

  #smoother = null;

  #thickness;

  #points;

  // Count input points that pass the distance filter, including the start.
  #inputCount = 1;

  // Last input point accepted by the distance filter.
  #lastInput = new Float64Array(2);

  #lastSVGPath = "";

  #lastIndex = 0;

  #outlines = new InkDrawOutline();

  #parentWidth;

  #parentHeight;

  constructor(x, y, parentWidth, parentHeight, rotation, thickness, timeStamp) {
    this.#parentWidth = parentWidth;
    this.#parentHeight = parentHeight;
    this.#rotation = rotation;
    this.#thickness = thickness;
    this.#lines = [];
    this.#startLine(x, y, timeStamp);
  }

  #startLine(x, y, timeStamp) {
    [x, y] = this.#normalizeToTip(x, y);

    const line = (this.#line = [NaN, NaN, NaN, NaN, x, y]);
    this.#points = [x, y];
    this.#lines.push({ line, points: this.#points });
    this.#last.set(line, 0);
    this.#lastIndex = 0;
    this.#inputCount = 1;
    this.#lastInput.set(this.#tip);
    this.#smoother =
      timeStamp === undefined ? null : new InputSmoother(x, y, timeStamp);
  }

  updateProperty(name, value) {
    if (name === "stroke-width") {
      this.#thickness = value;
    }
  }

  #normalizeToTip(x, y) {
    return Outline._normalizePoint(
      x,
      y,
      this.#parentWidth,
      this.#parentHeight,
      this.#rotation,
      this.#tip
    );
  }

  isEmpty() {
    return !this.#lines?.length;
  }

  isCancellable() {
    // A second finger can cancel a short stroke; upsampled points don't count.
    return this.#inputCount <= 5;
  }

  add(x, y, timeStamp) {
    this.#addSample(x, y, timeStamp);

    return {
      path: {
        d: this.#toSVGPathWithTip(),
      },
    };
  }

  addPoints(points, timeStamps) {
    for (let i = 0, ii = points.length; i < ii; i += 2) {
      this.#addSample(points[i], points[i + 1], timeStamps?.[i / 2]);
    }

    return {
      path: {
        d: this.#toSVGPathWithTip(),
      },
    };
  }

  #addSample(x, y, timeStamp) {
    [x, y] = this.#normalizeToTip(x, y);
    const [lastX, lastY] = this.#lastInput;
    if (!this.#isTooClose(x, y, lastX, lastY)) {
      this.#inputCount++;
      this.#lastInput.set(this.#tip);
    }
    if (this.#smoother) {
      this.#addSmoothedPoints(this.#smoother.add(x, y, timeStamp));
    } else {
      this.#addPoint(x, y);
    }
  }

  #isTooClose(x, y, lastX, lastY) {
    return (
      Math.hypot(
        this.#parentWidth * (x - lastX),
        this.#parentHeight * (y - lastY)
      ) <= 2
    );
  }

  #addSmoothedPoints(points) {
    for (let i = 0, ii = points.length; i < ii; i += 2) {
      this.#addPoint(points[i], points[i + 1]);
    }
  }

  #addPoint(x, y) {
    const [, , x1, y1, x2, y2] = this.#last;
    if (this.#isTooClose(x, y, x2, y2)) {
      // Ignore points within two pixels of the last accepted point.
      return;
    }

    this.#points.push(x, y);

    if (isNaN(x1)) {
      // The second point creates a straight segment.
      this.#line.push(NaN, NaN, NaN, NaN, x, y);
    } else {
      if (isNaN(this.#last[0])) {
        // The third point replaces the straight segment with a Bézier curve.
        this.#line.splice(6, 6);
      }
      Outline.createBezierPoints(x1, y1, x2, y2, x, y, this.#line);
    }
    this.#last.copyWithin(0, 2);
    this.#last[4] = x;
    this.#last[5] = y;
  }

  #updatePath() {
    // Wait for the third point to replace the initial straight segment.
    const line = this.#line;
    if (this.#points.length < 6 || this.#lastIndex === line.length) {
      return;
    }
    const buffer = [this.#lastSVGPath];
    if (this.#lastIndex === 0) {
      buffer.push(`M${svgPoint(line, 4)}`);
      this.#lastIndex = 6;
    }
    pushCurves(buffer, line, this.#lastIndex);
    this.#lastSVGPath = buffer.join("");
    this.#lastIndex = line.length;
  }

  #endLine() {
    if (!this.#line) {
      return;
    }
    if (this.#smoother) {
      this.#addSmoothedPoints(this.#smoother.end());
      this.#smoother = null;
    }
    if (this.#points.length < 6) {
      this.#lastSVGPath += lineToSVGPath(this.#line);
    } else {
      // Repeat the last accepted point so the final curve reaches it.
      const [, , x1, y1, x2, y2] = this.#last;
      Outline.createBezierPoints(x1, y1, x2, y2, x2, y2, this.#line);
      this.#updatePath();
    }
    this.#line = this.#points = null;
  }

  end(x, y, timeStamp) {
    if (this.#line && x !== undefined) {
      this.#addSample(x, y, timeStamp);
    }
    this.#endLine();
    return {
      path: {
        d: this.#lastSVGPath,
      },
    };
  }

  startNew(x, y, parentWidth, parentHeight, rotation, timeStamp) {
    this.#parentWidth = parentWidth;
    this.#parentHeight = parentHeight;
    this.#rotation = rotation;

    const last = this.#lines.at(-1);
    if (last) {
      last.line = new Float32Array(last.line);
      last.points = new Float32Array(last.points);
    }
    this.#startLine(x, y, timeStamp);

    return null;
  }

  getLastElement() {
    return this.#lines.at(-1);
  }

  setLastElement(element) {
    if (!this.#lines) {
      return this.#outlines.setLastElement(element);
    }
    this.#lines.push(element);
    this.#lastSVGPath += lineToSVGPath(element.line);
    return {
      path: {
        d: this.#lastSVGPath,
      },
    };
  }

  removeLastElement() {
    if (!this.#lines) {
      return this.#outlines.removeLastElement();
    }
    // The removed line can be the one being drawn.
    this.#line = this.#points = this.#smoother = null;
    this.#lines.pop();
    this.#lastSVGPath = this.#lines
      .map(({ line }) => lineToSVGPath(line))
      .join("");

    return {
      path: {
        d: this.#lastSVGPath,
      },
    };
  }

  /**
   * Extend the stored path through pending smoothed points to the pointer.
   * This preview polyline is rebuilt on each update and is not stored.
   * @returns {string} the SVG path to display while drawing.
   */
  #toSVGPathWithTip() {
    this.#updatePath();
    const buffer = [this.#lastSVGPath];
    if (this.#lastIndex === 0) {
      // Preview the first one or two points until a curve is stored.
      buffer.push(`M${svgPoint(this.#line, 4)}`);
      if (this.#points.length === 4) {
        buffer.push(`L${svgPoint(this.#line, 10)}`);
      }
    }
    let points = this.#smoother?.pendingPoints;
    if (!points?.length) {
      points = this.#tip;
    }
    for (let i = 0, ii = points.length; i < ii; i += 2) {
      buffer.push(`L${svgPoint(points, i)}`);
    }
    return buffer.join("");
  }

  getOutlines(parentWidth, parentHeight, scale, innerMargin) {
    // pointercancel can end the session without calling end().
    this.#endLine();
    const last = this.#lines.at(-1);
    last.line = new Float32Array(last.line);
    last.points = new Float32Array(last.points);

    this.#outlines.build(
      this.#lines,
      parentWidth,
      parentHeight,
      scale,
      this.#rotation,
      this.#thickness,
      innerMargin
    );

    // We reset everything: the drawing is done.
    this.#last = null;
    this.#line = null;
    this.#lines = null;
    this.#lastSVGPath = null;

    return this.#outlines;
  }

  get defaultSVGProperties() {
    return {
      root: {
        viewBox: "0 0 10000 10000",
      },
      rootClass: {
        draw: true,
      },
      bbox: [0, 0, 1, 1],
    };
  }
}

class InkDrawOutline extends Outline {
  #bbox;

  #currentRotation = 0;

  #innerMargin;

  #lines;

  #parentWidth;

  #parentHeight;

  #parentScale;

  #rotation;

  #thickness;

  build(
    lines,
    parentWidth,
    parentHeight,
    parentScale,
    rotation,
    thickness,
    innerMargin
  ) {
    this.#parentWidth = parentWidth;
    this.#parentHeight = parentHeight;
    this.#parentScale = parentScale;
    this.#rotation = rotation;
    this.#thickness = thickness;
    this.#innerMargin = innerMargin ?? 0;
    this.#lines = lines;

    this.#computeBbox();
  }

  get thickness() {
    return this.#thickness;
  }

  setLastElement(element) {
    this.#lines.push(element);
    return {
      path: {
        d: this.toSVGPath(),
      },
    };
  }

  removeLastElement() {
    this.#lines.pop();
    return {
      path: {
        d: this.toSVGPath(),
      },
    };
  }

  toSVGPath() {
    return this.#lines.map(({ line }) => lineToSVGPath(line)).join("");
  }

  serialize([pageX, pageY, pageWidth, pageHeight], isForCopying) {
    const serializedLines = [];
    const serializedPoints = [];
    const [x, y, width, height] = this.#getBBoxWithNoMargin();
    let tx, ty, sx, sy, x1, y1, x2, y2, rescaleFn;

    switch (this.#rotation) {
      case 0:
        rescaleFn = Outline._rescale;
        tx = pageX;
        ty = pageY + pageHeight;
        sx = pageWidth;
        sy = -pageHeight;
        x1 = pageX + x * pageWidth;
        y1 = pageY + (1 - y - height) * pageHeight;
        x2 = pageX + (x + width) * pageWidth;
        y2 = pageY + (1 - y) * pageHeight;
        break;
      case 90:
        rescaleFn = Outline._rescaleAndSwap;
        tx = pageX;
        ty = pageY;
        sx = pageWidth;
        sy = pageHeight;
        x1 = pageX + y * pageWidth;
        y1 = pageY + x * pageHeight;
        x2 = pageX + (y + height) * pageWidth;
        y2 = pageY + (x + width) * pageHeight;
        break;
      case 180:
        rescaleFn = Outline._rescale;
        tx = pageX + pageWidth;
        ty = pageY;
        sx = -pageWidth;
        sy = pageHeight;
        x1 = pageX + (1 - x - width) * pageWidth;
        y1 = pageY + y * pageHeight;
        x2 = pageX + (1 - x) * pageWidth;
        y2 = pageY + (y + height) * pageHeight;
        break;
      case 270:
        rescaleFn = Outline._rescaleAndSwap;
        tx = pageX + pageWidth;
        ty = pageY + pageHeight;
        sx = -pageWidth;
        sy = -pageHeight;
        x1 = pageX + (1 - y - height) * pageWidth;
        y1 = pageY + (1 - x - width) * pageHeight;
        x2 = pageX + (1 - y) * pageWidth;
        y2 = pageY + (1 - x) * pageHeight;
        break;
    }

    for (const { line, points } of this.#lines) {
      serializedLines.push(
        rescaleFn(
          line,
          tx,
          ty,
          sx,
          sy,
          isForCopying ? new Array(line.length) : null
        )
      );
      serializedPoints.push(
        rescaleFn(
          points,
          tx,
          ty,
          sx,
          sy,
          isForCopying ? new Array(points.length) : null
        )
      );
    }

    return {
      lines: serializedLines,
      points: serializedPoints,
      rect: [x1, y1, x2, y2],
    };
  }

  static deserialize(
    pageX,
    pageY,
    pageWidth,
    pageHeight,
    innerMargin,
    { paths: { lines, points }, rotation, thickness }
  ) {
    const newLines = [];
    let tx, ty, sx, sy, rescaleFn;
    switch (rotation) {
      case 0:
        rescaleFn = Outline._rescale;
        tx = -pageX / pageWidth;
        ty = pageY / pageHeight + 1;
        sx = 1 / pageWidth;
        sy = -1 / pageHeight;
        break;
      case 90:
        rescaleFn = Outline._rescaleAndSwap;
        tx = -pageY / pageHeight;
        ty = -pageX / pageWidth;
        sx = 1 / pageHeight;
        sy = 1 / pageWidth;
        break;
      case 180:
        rescaleFn = Outline._rescale;
        tx = pageX / pageWidth + 1;
        ty = -pageY / pageHeight;
        sx = -1 / pageWidth;
        sy = 1 / pageHeight;
        break;
      case 270:
        rescaleFn = Outline._rescaleAndSwap;
        tx = pageY / pageHeight + 1;
        ty = pageX / pageWidth + 1;
        sx = -1 / pageHeight;
        sy = -1 / pageWidth;
        break;
    }

    if (!lines) {
      lines = [];
      for (const point of points) {
        const len = point.length;
        if (len === 2) {
          lines.push(
            new Float32Array([NaN, NaN, NaN, NaN, point[0], point[1]])
          );
          continue;
        }
        if (len === 4) {
          lines.push(
            new Float32Array([
              NaN,
              NaN,
              NaN,
              NaN,
              point[0],
              point[1],
              NaN,
              NaN,
              NaN,
              NaN,
              point[2],
              point[3],
            ])
          );
          continue;
        }
        const line = new Float32Array(3 * len);
        lines.push(line);
        let [x1, y1, x2, y2] = point.subarray(0, 4);
        line.set([NaN, NaN, NaN, NaN, x1, y1], 0);
        for (let i = 4; i <= len; i += 2) {
          // Repeat the last point so the final curve reaches it.
          const j = Math.min(i, len - 2);
          const x = point[j];
          const y = point[j + 1];
          line.set(
            Outline.createBezierPoints(x1, y1, x2, y2, x, y),
            (i - 2) * 3
          );
          [x1, y1, x2, y2] = [x2, y2, x, y];
        }
      }
    }

    for (let i = 0, ii = lines.length; i < ii; i++) {
      newLines.push({
        line: rescaleFn(
          lines[i].map(x => x ?? NaN),
          tx,
          ty,
          sx,
          sy
        ),
        points: rescaleFn(
          points[i].map(x => x ?? NaN),
          tx,
          ty,
          sx,
          sy
        ),
      });
    }

    const outlines = new this.prototype.constructor();
    outlines.build(
      newLines,
      pageWidth,
      pageHeight,
      1,
      rotation,
      thickness,
      innerMargin
    );

    return outlines;
  }

  #getMarginComponents(thickness = this.#thickness) {
    const margin = this.#innerMargin + (thickness / 2) * this.#parentScale;
    return this.#rotation % 180 === 0
      ? [margin / this.#parentWidth, margin / this.#parentHeight]
      : [margin / this.#parentHeight, margin / this.#parentWidth];
  }

  #getBBoxWithNoMargin() {
    const [x, y, width, height] = this.#bbox;
    const [marginX, marginY] = this.#getMarginComponents(0);

    return [
      x + marginX,
      y + marginY,
      width - 2 * marginX,
      height - 2 * marginY,
    ];
  }

  #computeBbox() {
    const bbox = (this.#bbox = F32_BBOX_INIT.slice());

    for (const { line } of this.#lines) {
      if (line.length <= 12) {
        // We've only one or two points => no bezier curve.
        for (let i = 4, ii = line.length; i < ii; i += 6) {
          Util.pointBoundingBox(line[i], line[i + 1], bbox);
        }
        continue;
      }
      let lastX = line[4],
        lastY = line[5];
      for (let i = 6, ii = line.length; i < ii; i += 6) {
        const [c1x, c1y, c2x, c2y, x, y] = line.subarray(i, i + 6);
        Util.bezierBoundingBox(lastX, lastY, c1x, c1y, c2x, c2y, x, y, bbox);
        lastX = x;
        lastY = y;
      }
    }

    const [marginX, marginY] = this.#getMarginComponents();
    bbox[0] = MathClamp(bbox[0] - marginX, 0, 1);
    bbox[1] = MathClamp(bbox[1] - marginY, 0, 1);
    bbox[2] = MathClamp(bbox[2] + marginX, 0, 1);
    bbox[3] = MathClamp(bbox[3] + marginY, 0, 1);

    bbox[2] -= bbox[0];
    bbox[3] -= bbox[1];
  }

  get box() {
    return this.#bbox;
  }

  updateProperty(name, value) {
    return name === "stroke-width" ? this.#updateThickness(value) : null;
  }

  #updateThickness(thickness) {
    const [oldMarginX, oldMarginY] = this.#getMarginComponents();
    this.#thickness = thickness;
    const [newMarginX, newMarginY] = this.#getMarginComponents();
    const [diffMarginX, diffMarginY] = [
      newMarginX - oldMarginX,
      newMarginY - oldMarginY,
    ];
    const bbox = this.#bbox;
    bbox[0] -= diffMarginX;
    bbox[1] -= diffMarginY;
    bbox[2] += 2 * diffMarginX;
    bbox[3] += 2 * diffMarginY;

    return bbox;
  }

  updateParentDimensions([width, height], scale) {
    const [oldMarginX, oldMarginY] = this.#getMarginComponents();
    this.#parentWidth = width;
    this.#parentHeight = height;
    this.#parentScale = scale;
    const [newMarginX, newMarginY] = this.#getMarginComponents();
    const diffMarginX = newMarginX - oldMarginX;
    const diffMarginY = newMarginY - oldMarginY;

    const bbox = this.#bbox;
    bbox[0] -= diffMarginX;
    bbox[1] -= diffMarginY;
    bbox[2] += 2 * diffMarginX;
    bbox[3] += 2 * diffMarginY;

    return bbox;
  }

  updateRotation(rotation) {
    this.#currentRotation = rotation;
    return {
      path: {
        transform: this.rotationTransform,
      },
    };
  }

  get viewBox() {
    return this.#bbox.map(Outline.svgRound).join(" ");
  }

  get defaultProperties() {
    const [x, y] = this.#bbox;
    return {
      root: {
        viewBox: this.viewBox,
      },
      path: {
        "transform-origin": `${Outline.svgRound(x)} ${Outline.svgRound(y)}`,
      },
    };
  }

  get rotationTransform() {
    const [, , width, height] = this.#bbox;
    let a = 0,
      b = 0,
      c = 0,
      d = 0,
      e = 0,
      f = 0;
    switch (this.#currentRotation) {
      case 90:
        b = height / width;
        c = -width / height;
        e = width;
        break;
      case 180:
        a = -1;
        d = -1;
        e = width;
        f = height;
        break;
      case 270:
        b = -height / width;
        c = width / height;
        f = height;
        break;
      default:
        return "";
    }
    return `matrix(${a} ${b} ${c} ${d} ${Outline.svgRound(e)} ${Outline.svgRound(f)})`;
  }

  getPathResizingSVGProperties([newX, newY, newWidth, newHeight]) {
    const [marginX, marginY] = this.#getMarginComponents();
    const [x, y, width, height] = this.#bbox;

    if (
      Math.abs(width - marginX) <= Outline.PRECISION ||
      Math.abs(height - marginY) <= Outline.PRECISION
    ) {
      // Center the path in the new bounding box.
      const tx = newX + newWidth / 2 - (x + width / 2);
      const ty = newY + newHeight / 2 - (y + height / 2);
      return {
        path: {
          "transform-origin": `${Outline.svgRound(newX)} ${Outline.svgRound(newY)}`,
          transform: `${this.rotationTransform} translate(${tx} ${ty})`,
        },
      };
    }

    // We compute the following transform:
    //  1. Translate the path to the origin (-marginX, -marginY).
    //  2. Scale the path to the new size:
    //   ((newWidth - 2*marginX) / (bbox.width - 2*marginX),
    //   (newHeight - 2*marginY) / (bbox.height - 2*marginY)).
    //  3. Translate the path back to its original position
    //   (marginX, marginY).
    //  4. Scale the inverse of bbox scaling:
    //   (bbox.width / newWidth, bbox.height / newHeight).

    const s1x = (newWidth - 2 * marginX) / (width - 2 * marginX);
    const s1y = (newHeight - 2 * marginY) / (height - 2 * marginY);
    const s2x = width / newWidth;
    const s2y = height / newHeight;

    return {
      path: {
        "transform-origin": `${Outline.svgRound(x)} ${Outline.svgRound(y)}`,
        transform:
          `${this.rotationTransform} scale(${s2x} ${s2y}) ` +
          `translate(${Outline.svgRound(marginX)} ${Outline.svgRound(marginY)}) scale(${s1x} ${s1y}) ` +
          `translate(${Outline.svgRound(-marginX)} ${Outline.svgRound(-marginY)})`,
      },
    };
  }

  getPathResizedSVGProperties([newX, newY, newWidth, newHeight]) {
    const [marginX, marginY] = this.#getMarginComponents();
    const bbox = this.#bbox;
    const [x, y, width, height] = bbox;

    bbox[0] = newX;
    bbox[1] = newY;
    bbox[2] = newWidth;
    bbox[3] = newHeight;

    if (
      Math.abs(width - marginX) <= Outline.PRECISION ||
      Math.abs(height - marginY) <= Outline.PRECISION
    ) {
      // Center the path in the new bounding box.
      const tx = newX + newWidth / 2 - (x + width / 2);
      const ty = newY + newHeight / 2 - (y + height / 2);
      for (const { line, points } of this.#lines) {
        Outline._translate(line, tx, ty, line);
        Outline._translate(points, tx, ty, points);
      }
      return {
        root: {
          viewBox: this.viewBox,
        },
        path: {
          "transform-origin": `${Outline.svgRound(newX)} ${Outline.svgRound(newY)}`,
          transform: this.rotationTransform || null,
          d: this.toSVGPath(),
        },
      };
    }

    // We compute the following transform:
    //  1. Translate the path to the origin (-(x + marginX), -(y + marginY)).
    //  2. Scale the path to the new size:
    //   ((newWidth - 2*marginX) / (bbox.width - 2*marginX),
    //   (newHeight - 2*marginY) / (bbox.height - 2*marginY)).
    //  3. Translate the path back to its new position
    //     (newX + marginX,y newY + marginY).

    const s1x = (newWidth - 2 * marginX) / (width - 2 * marginX);
    const s1y = (newHeight - 2 * marginY) / (height - 2 * marginY);
    const tx = -s1x * (x + marginX) + newX + marginX;
    const ty = -s1y * (y + marginY) + newY + marginY;

    if (s1x !== 1 || s1y !== 1 || tx !== 0 || ty !== 0) {
      for (const { line, points } of this.#lines) {
        Outline._rescale(line, tx, ty, s1x, s1y, line);
        Outline._rescale(points, tx, ty, s1x, s1y, points);
      }
    }

    return {
      root: {
        viewBox: this.viewBox,
      },
      path: {
        "transform-origin": `${Outline.svgRound(newX)} ${Outline.svgRound(newY)}`,
        transform: this.rotationTransform || null,
        d: this.toSVGPath(),
      },
    };
  }

  getPathTranslatedSVGProperties([newX, newY], parentDimensions) {
    const [newParentWidth, newParentHeight] = parentDimensions;
    const bbox = this.#bbox;
    const tx = newX - bbox[0];
    const ty = newY - bbox[1];

    if (
      this.#parentWidth === newParentWidth &&
      this.#parentHeight === newParentHeight
    ) {
      // We don't change the parent dimensions so it's a simple translation.
      for (const { line, points } of this.#lines) {
        Outline._translate(line, tx, ty, line);
        Outline._translate(points, tx, ty, points);
      }
    } else {
      const sx = this.#parentWidth / newParentWidth;
      const sy = this.#parentHeight / newParentHeight;
      this.#parentWidth = newParentWidth;
      this.#parentHeight = newParentHeight;

      for (const { line, points } of this.#lines) {
        Outline._rescale(line, tx, ty, sx, sy, line);
        Outline._rescale(points, tx, ty, sx, sy, points);
      }
      bbox[2] *= sx;
      bbox[3] *= sy;
    }
    bbox[0] = newX;
    bbox[1] = newY;

    return {
      root: {
        viewBox: this.viewBox,
      },
      path: {
        d: this.toSVGPath(),
        "transform-origin": `${Outline.svgRound(newX)} ${Outline.svgRound(newY)}`,
      },
    };
  }

  get defaultSVGProperties() {
    const bbox = this.#bbox;
    return {
      root: {
        viewBox: this.viewBox,
      },
      rootClass: {
        draw: true,
      },
      path: {
        d: this.toSVGPath(),
        "transform-origin": `${Outline.svgRound(bbox[0])} ${Outline.svgRound(bbox[1])}`,
        transform: this.rotationTransform || null,
      },
      bbox,
    };
  }
}

export { InkDrawOutline, InkDrawOutliner };
