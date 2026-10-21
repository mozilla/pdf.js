/* Copyright 2026 Mozilla Foundation
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

/** @typedef {import("./page_viewport").PageViewport} PageViewport */

import { BBOX_INIT, Util } from "../shared/util.js";

const BBOX_EPSILON = 1e-6;

/**
 * Operation bounds stored as `[minX, minY, maxX, maxY]` bytes in 1/256 of the
 * page view box. Decoding adds one unit to the upper bounds.
 */
class OperatorBBoxes {
  #data;

  #view;

  /**
   * @param {Uint8ClampedArray} data
   * @param {Array<number>} view
   */
  constructor(data, view) {
    this.#data = data;
    this.#view = view;
  }

  get length() {
    return this.#data.length >> 2;
  }

  /**
   * @param {number} index
   * @param {PageViewport} viewport
   * @returns {Array<number> | null} `[minX, minY, maxX, maxY]` in viewport
   *   coordinates.
   */
  getViewportBBox(index, viewport) {
    const data = this.#data;
    const offset = index * 4;
    if (!(data[offset] <= data[offset + 2])) {
      return null;
    }
    const [x0, y0, x1, y1] = this.#view;
    const scaleX = (x1 - x0 || 1) / 256;
    const scaleY = (y1 - y0 || 1) / 256;
    const bbox = BBOX_INIT.slice();
    Util.transformedRectBoundingBox(
      x0 + data[offset] * scaleX,
      y0 + data[offset + 1] * scaleY,
      x0 + (data[offset + 2] + 1) * scaleX,
      y0 + (data[offset + 3] + 1) * scaleY,
      viewport.transform,
      bbox
    );
    return bbox;
  }

  /**
   * @param {PageViewport} viewport
   * @param {Array<number>} rect - `[minX, minY, maxX, maxY]` in viewport
   *   coordinates.
   * @returns {function(number): boolean} Filter retaining operations whose
   *   bounds intersect `rect`, including dependencies.
   */
  getFilter(viewport, rect) {
    const bbox = BBOX_INIT.slice();
    Util.transformedRectBoundingBox(
      rect[0],
      rect[1],
      rect[2],
      rect[3],
      Util.inverseTransform(viewport.transform),
      bbox
    );
    const [x0, y0, x1, y1] = this.#view;
    const scaleX = 256 / (x1 - x0 || 1);
    const scaleY = 256 / (y1 - y0 || 1);
    const maxMinX = Math.floor((bbox[2] - x0) * scaleX + BBOX_EPSILON);
    const maxMinY = Math.floor((bbox[3] - y0) * scaleY + BBOX_EPSILON);
    const minMaxX = Math.ceil((bbox[0] - x0) * scaleX - BBOX_EPSILON) - 1;
    const minMaxY = Math.ceil((bbox[1] - y0) * scaleY - BBOX_EPSILON) - 1;
    const data = this.#data;
    return index => {
      const offset = index * 4;
      const minX = data[offset];
      const maxX = data[offset + 2];
      return (
        minX <= maxX &&
        minX <= maxMinX &&
        maxX >= minMaxX &&
        data[offset + 1] <= maxMinY &&
        data[offset + 3] >= minMaxY
      );
    };
  }
}

export { OperatorBBoxes };
