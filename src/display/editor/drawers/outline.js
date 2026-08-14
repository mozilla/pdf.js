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

  /** @type {Outline|null} Optional hover/selection outline drawn separately. */
  focusOutline = null;

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

  /** @type {Object} */
  // eslint-disable-next-line getter-return
  get defaultSVGProperties() {
    unreachable("Abstract getter `defaultSVGProperties` must be implemented.");
  }

  /** @type {Object} SVG properties used to finalize a drawing session. */
  get defaultProperties() {
    return this.defaultSVGProperties;
  }

  /**
   * @param {number} _rotation - the rotation to apply to the outline.
   * @returns {Object|null}
   */
  getFocusSVGProperties(_rotation) {
    return null;
  }

  /** @type {boolean} Whether `DrawLayer.drawOutline` applies its mask. */
  get focusMustRemoveSelfIntersections() {
    return false;
  }

  /**
   * @param {string} _name
   * @param {*} _value
   * @returns {Array<number>|Float32Array|null} The new bounding box, if any.
   */
  updateProperty(_name, _value) {
    return null;
  }

  /**
   * @param {Array<number>} _dimensions
   * @param {number} _scale
   * @returns {Array<number>|Float32Array|null} The new bounding box, if any.
   */
  updateParentDimensions(_dimensions, _scale) {
    return null;
  }

  /**
   * @param {Array<number>} _pageTranslation
   * @param {Array<number>} _pageDimensions
   * @returns {Float32Array|null}
   */
  serializeQuadPoints(_pageTranslation, _pageDimensions) {
    return null;
  }

  /**
   * @param {number} _rotation
   * @returns {Object} the SVG properties to apply to the rotated shape.
   */
  updateRotation(_rotation) {
    return {};
  }

  /**
   * Called on each resizing step, hence the outline itself is unchanged.
   * @param {Array<number>} _bbox - the bounding box being resized to.
   * @returns {Object} the SVG properties to apply to the resizing shape.
   */
  getPathResizingSVGProperties(_bbox) {
    return {};
  }

  /**
   * Called once the resizing is done, hence the outline can be updated.
   * @param {Array<number>} _bbox - the new bounding box.
   * @returns {Object} the SVG properties to apply to the resized shape.
   */
  getPathResizedSVGProperties(_bbox) {
    return {};
  }

  /**
   * Called once the translation is done, hence the outline can be updated.
   * @param {Array<number>} _bbox - the new bounding box.
   * @param {Array<number>} _parentDimensions
   * @returns {Object} the SVG properties to apply to the translated shape.
   */
  getPathTranslatedSVGProperties(_bbox, _parentDimensions) {
    return {};
  }

  /**
   * Rotate a bounding box which lives in the unit square.
   * @param {Array<number>} bbox
   * @param {number} angle
   * @returns {Array<number>}
   */
  static _rotateBox([x, y, width, height], angle) {
    switch (angle) {
      case 90:
        return [1 - y - height, x, height, width];
      case 180:
        return [1 - x - width, 1 - y - height, width, height];
      case 270:
        return [y, 1 - x - width, height, width];
    }
    return [x, y, width, height];
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
