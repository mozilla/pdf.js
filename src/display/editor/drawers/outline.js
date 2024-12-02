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

import { unreachable } from "../../../shared/util.js";

class Outline {
  static PRECISION = 1e-4;

  /**
   * @returns {string} The SVG path of the outline.
   */
  toSVGPath() {
    unreachable("Abstract method `toSVGPath` must be implemented.");
  }

  /**
   * @type {Object|null} The bounding box of the outline.
   */
  // eslint-disable-next-line getter-return
  get box() {
    unreachable("Abstract getter `box` must be implemented.");
  }

  serialize(_bbox, _rotation) {
    unreachable("Abstract method `serialize` must be implemented.");
  }

  static _rescale(src, tx, ty, sx, sy, dest) {
    dest ||= new Float32Array(src.length);
    for (let i = 0, ii = src.length; i < ii; i += 2) {
      dest[i] = tx + src[i] * sx;
      dest[i + 1] = ty + src[i + 1] * sy;
    }
    return dest;
  }

  static _rescaleAndSwap(src, tx, ty, sx, sy, dest) {
    dest ||= new Float32Array(src.length);
    for (let i = 0, ii = src.length; i < ii; i += 2) {
      dest[i] = tx + src[i + 1] * sx;
      dest[i + 1] = ty + src[i] * sy;
    }
    return dest;
  }

  static _translate(src, tx, ty, dest) {
    dest ||= new Float32Array(src.length);
    for (let i = 0, ii = src.length; i < ii; i += 2) {
      dest[i] = tx + src[i];
      dest[i + 1] = ty + src[i + 1];
    }
    return dest;
  }

  static svgRound(x) {
    // 0.1234 will be 1234 and this way we economize 2 bytes per number.
    // Of course, it makes sense only when the viewBox is [0 0 10000 10000].
    // And it helps to avoid bugs like:
    //  https://bugzilla.mozilla.org/show_bug.cgi?id=1929340
    return Math.round(x * 10000);
  }

  static _normalizePoint(x, y, parentWidth, parentHeight, rotation) {
    switch (rotation) {
      case 90:
        return [1 - y / parentWidth, x / parentHeight];
      case 180:
        return [1 - x / parentWidth, 1 - y / parentHeight];
      case 270:
        return [y / parentWidth, 1 - x / parentHeight];
      default:
        return [x / parentWidth, y / parentHeight];
    }
  }

  static _normalizePagePoint(x, y, rotation) {
    switch (rotation) {
      case 90:
        return [1 - y, x];
      case 180:
        return [1 - x, 1 - y];
      case 270:
        return [y, 1 - x];
      default:
        return [x, y];
    }
  }

  static createBezierPoints(x1, y1, x2, y2, x3, y3) {
    return [
      (x1 + 5 * x2) / 6,
      (y1 + 5 * y2) / 6,
      (5 * x2 + x3) / 6,
      (5 * y2 + y3) / 6,
      (x2 + x3) / 2,
      (y2 + y3) / 2,
    ];
  }
}

export { Outline };
