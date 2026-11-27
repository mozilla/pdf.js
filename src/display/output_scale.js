/* Copyright 2015 Mozilla Foundation
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

/**
 * Scale factors for the canvas, necessary with HiDPI displays.
 */
class OutputScale {
  constructor() {
    const { pixelRatio } = OutputScale;

    /**
     * @type {number} Horizontal scale.
     */
    this.sx = pixelRatio;

    /**
     * @type {number} Vertical scale.
     */
    this.sy = pixelRatio;
  }

  /**
   * @type {boolean} Returns `true` when scaling is required, `false` otherwise.
   */
  get scaled() {
    return this.sx !== 1 || this.sy !== 1;
  }

  /**
   * @type {boolean} Returns `true` when scaling is symmetric,
   *   `false` otherwise.
   */
  get symmetric() {
    return this.sx === this.sy;
  }

  /**
   * @returns {boolean} Returns `true` if scaling was limited,
   *   `false` otherwise.
   */
  limitCanvas(width, height, maxPixels, maxDim, capAreaFactor = -1) {
    let maxAreaScale = Infinity,
      maxWidthScale = Infinity,
      maxHeightScale = Infinity;

    maxPixels = OutputScale.capPixels(maxPixels, capAreaFactor);
    if (maxPixels > 0) {
      maxAreaScale = Math.sqrt(maxPixels / (width * height));
    }
    if (maxDim > 0) {
      maxWidthScale = maxDim / width;
      maxHeightScale = maxDim / height;
    }
    const maxScale = Math.min(maxAreaScale, maxWidthScale, maxHeightScale);

    if (this.sx > maxScale || this.sy > maxScale) {
      this.sx = maxScale;
      this.sy = maxScale;
      return true;
    }
    return false;
  }

  static get pixelRatio() {
    return globalThis.devicePixelRatio || 1;
  }

  static capPixels(maxPixels, capAreaFactor) {
    if (capAreaFactor >= 0) {
      const winPixels = Math.ceil(
        (typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING")
          ? window.innerWidth * window.innerHeight
          : window.screen.availWidth * window.screen.availHeight) *
          this.pixelRatio ** 2 *
          (1 + capAreaFactor / 100)
      );
      return maxPixels > 0 ? Math.min(maxPixels, winPixels) : winPixels;
    }
    return maxPixels;
  }
}

export { OutputScale };
