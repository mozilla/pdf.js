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

class InkDrawOutliner {
  // The last 3 points of the line.
  #last = new Float64Array(6);

  #line;

  #lines;

  #rotation;

  #thickness;

  #points;

  #lastSVGPath = "";

  #lastIndex = 0;

  #outlines = new InkDrawOutline();

  #parentWidth;

  #parentHeight;

  constructor(x, y, parentWidth, parentHeight, rotation, thickness) {
    this.#parentWidth = parentWidth;
    this.#parentHeight = parentHeight;
    this.#rotation = rotation;
    this.#thickness = thickness;

    [x, y] = this.#normalizePoint(x, y);

    const line = (this.#line = [NaN, NaN, NaN, NaN, x, y]);
    this.#points = [x, y];
    this.#lines = [{ line, points: this.#points }];
    this.#last.set(line, 0);
  }

  updateProperty(name, value) {
    if (name === "stroke-width") {
      this.#thickness = value;
    }
  }

  #normalizePoint(x, y) {
    return Outline._normalizePoint(
      x,
      y,
      this.#parentWidth,
      this.#parentHeight,
      this.#rotation
    );
  }

  isEmpty() {
    return !this.#lines || this.#lines.length === 0;
  }

  isCancellable() {
    // The user a second finger after drawing 5 points: it's small enough
    // to not be a real drawing.
    return this.#points.length <= 10;
  }

  add(x, y) {
    // The point is in canvas coordinates which means that there is no rotation.
    // It's the same as parent coordinates.
    [x, y] = this.#normalizePoint(x, y);
    const [x1, y1, x2, y2] = this.#last.subarray(2, 6);
    const diffX = x - x2;
    const diffY = y - y2;
    const d = Math.hypot(this.#parentWidth * diffX, this.#parentHeight * diffY);
    if (d <= 2) {
      // The idea is to avoid garbage points around the last point.
      // When the points are too close, it just leads to bad normal vectors and
      // control points.
      return null;
    }

    this.#points.push(x, y);

    if (isNaN(x1)) {
      // We've only one point.
      this.#last.set([x2, y2, x, y], 2);
      this.#line.push(NaN, NaN, NaN, NaN, x, y);
      return {
        path: {
          d: this.toSVGPath(),
        },
      };
    }

    if (isNaN(this.#last[0])) {
      // We've only two points.
      this.#line.splice(6, 6);
    }

    this.#last.set([x1, y1, x2, y2, x, y], 0);
    this.#line.push(...Outline.createBezierPoints(x1, y1, x2, y2, x, y));

    return {
      path: {
        d: this.toSVGPath(),
      },
    };
  }

  end(x, y) {
    const change = this.add(x, y);
    if (change) {
      return change;
    }
    if (this.#points.length === 2) {
      // We've only one point.
      return {
        path: {
          d: this.toSVGPath(),
        },
      };
    }
    return null;
  }

  startNew(x, y, parentWidth, parentHeight, rotation) {
    this.#parentWidth = parentWidth;
    this.#parentHeight = parentHeight;
    this.#rotation = rotation;

    [x, y] = this.#normalizePoint(x, y);

    const line = (this.#line = [NaN, NaN, NaN, NaN, x, y]);
    this.#points = [x, y];
    const last = this.#lines.at(-1);
    if (last) {
      last.line = new Float32Array(last.line);
      last.points = new Float32Array(last.points);
    }
    this.#lines.push({ line, points: this.#points });
    this.#last.set(line, 0);
    this.#lastIndex = 0;
    this.toSVGPath();

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
    this.#line = element.line;
    this.#points = element.points;
    this.#lastIndex = 0;
    return {
      path: {
        d: this.toSVGPath(),
      },
    };
  }

  removeLastElement() {
    if (!this.#lines) {
      return this.#outlines.removeLastElement();
    }
    this.#lines.pop();
    this.#lastSVGPath = "";
    for (let i = 0, ii = this.#lines.length; i < ii; i++) {
      const { line, points } = this.#lines[i];
      this.#line = line;
      this.#points = points;
      this.#lastIndex = 0;
      this.toSVGPath();
    }

    return {
      path: {
        d: this.#lastSVGPath,
      },
    };
  }

  toSVGPath() {
    const firstX = Outline.svgRound(this.#line[4]);
    const firstY = Outline.svgRound(this.#line[5]);
    if (this.#points.length === 2) {
      this.#lastSVGPath = `${this.#lastSVGPath} M ${firstX} ${firstY} Z`;
      return this.#lastSVGPath;
    }

    if (this.#points.length <= 6) {
      // We've 2 or 3 points.
      const i = this.#lastSVGPath.lastIndexOf("M");
      this.#lastSVGPath = `${this.#lastSVGPath.slice(0, i)} M ${firstX} ${firstY}`;
      this.#lastIndex = 6;
    }

    if (this.#points.length === 4) {
      const secondX = Outline.svgRound(this.#line[10]);
      const secondY = Outline.svgRound(this.#line[11]);
      this.#lastSVGPath = `${this.#lastSVGPath} L ${secondX} ${secondY}`;
      this.#lastIndex = 12;
      return this.#lastSVGPath;
    }

    const buffer = [];
    if (this.#lastIndex === 0) {
      buffer.push(`M ${firstX} ${firstY}`);
      this.#lastIndex = 6;
    }

    for (let i = this.#lastIndex, ii = this.#line.length; i < ii; i += 6) {
      const [c1x, c1y, c2x, c2y, x, y] = this.#line
        .slice(i, i + 6)
        .map(Outline.svgRound);
      buffer.push(`C${c1x} ${c1y} ${c2x} ${c2y} ${x} ${y}`);
    }
    this.#lastSVGPath += buffer.join(" ");
    this.#lastIndex = this.#line.length;

    return this.#lastSVGPath;
  }

  getOutlines(parentWidth, parentHeight, scale, innerMargin) {
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
    const buffer = [];
    for (const { line } of this.#lines) {
      buffer.push(`M${Outline.svgRound(line[4])} ${Outline.svgRound(line[5])}`);
      if (line.length === 6) {
        buffer.push("Z");
        continue;
      }
      if (line.length === 12 && isNaN(line[6])) {
        buffer.push(
          `L${Outline.svgRound(line[10])} ${Outline.svgRound(line[11])}`
        );
        continue;
      }
      for (let i = 6, ii = line.length; i < ii; i += 6) {
        const [c1x, c1y, c2x, c2y, x, y] = line
          .subarray(i, i + 6)
          .map(Outline.svgRound);
        buffer.push(`C${c1x} ${c1y} ${c2x} ${c2y} ${x} ${y}`);
      }
    }
    return buffer.join("");
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
        const line = new Float32Array(3 * (len - 2));
        lines.push(line);
        let [x1, y1, x2, y2] = point.subarray(0, 4);
        line.set([NaN, NaN, NaN, NaN, x1, y1], 0);
        for (let i = 4; i < len; i += 2) {
          const x = point[i];
          const y = point[i + 1];
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
    const bbox = (this.#bbox = new Float32Array([
      Infinity,
      Infinity,
      -Infinity,
      -Infinity,
    ]));

    for (const { line } of this.#lines) {
      if (line.length <= 12) {
        // We've only one or two points => no bezier curve.
        for (let i = 4, ii = line.length; i < ii; i += 6) {
          const [x, y] = line.subarray(i, i + 2);
          bbox[0] = Math.min(bbox[0], x);
          bbox[1] = Math.min(bbox[1], y);
          bbox[2] = Math.max(bbox[2], x);
          bbox[3] = Math.max(bbox[3], y);
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
    bbox[0] = Math.min(1, Math.max(0, bbox[0] - marginX));
    bbox[1] = Math.min(1, Math.max(0, bbox[1] - marginY));
    bbox[2] = Math.min(1, Math.max(0, bbox[2] + marginX));
    bbox[3] = Math.min(1, Math.max(0, bbox[3] + marginY));

    bbox[2] -= bbox[0];
    bbox[3] -= bbox[1];
  }

  get box() {
    return this.#bbox;
  }

  updateProperty(name, value) {
    if (name === "stroke-width") {
      return this.#updateThickness(value);
    }
    return null;
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
