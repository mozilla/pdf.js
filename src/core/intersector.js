/* Copyright 2025 Mozilla Foundation
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

class SingleIntersector {
  #annotation;

  minX = Infinity;

  minY = Infinity;

  maxX = -Infinity;

  maxY = -Infinity;

  #quadPoints = null;

  #text = [];

  #extraChars = [];

  #lastIntersectingQuadIndex = -1;

  #canTakeExtraChars = false;

  constructor(annotation) {
    this.#annotation = annotation;
    const quadPoints = annotation.data.quadPoints;
    if (!quadPoints) {
      // If there are no quad points, we use the rectangle to determine the
      // bounds of the annotation.
      [this.minX, this.minY, this.maxX, this.maxY] = annotation.data.rect;
      return;
    }

    for (let i = 0, ii = quadPoints.length; i < ii; i += 8) {
      this.minX = Math.min(this.minX, quadPoints[i]);
      this.maxX = Math.max(this.maxX, quadPoints[i + 2]);
      this.minY = Math.min(this.minY, quadPoints[i + 5]);
      this.maxY = Math.max(this.maxY, quadPoints[i + 1]);
    }
    if (quadPoints.length > 8) {
      this.#quadPoints = quadPoints;
    }
  }

  /**
   * Check if the given point intersects with the annotation's quad points.
   * The point (x, y) is supposed to be the center of the glyph.
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  #intersects(x, y) {
    if (this.minX >= x || this.maxX <= x || this.minY >= y || this.maxY <= y) {
      return false;
    }

    const quadPoints = this.#quadPoints;
    if (!quadPoints) {
      // We've only one quad, so if we intersect min/max bounds then we
      // intersect the quad.
      return true;
    }

    if (this.#lastIntersectingQuadIndex >= 0) {
      const i = this.#lastIntersectingQuadIndex;
      if (
        !(
          quadPoints[i] >= x ||
          quadPoints[i + 2] <= x ||
          quadPoints[i + 5] >= y ||
          quadPoints[i + 1] <= y
        )
      ) {
        return true;
      }
      this.#lastIntersectingQuadIndex = -1;
    }

    for (let i = 0, ii = quadPoints.length; i < ii; i += 8) {
      if (
        !(
          quadPoints[i] >= x ||
          quadPoints[i + 2] <= x ||
          quadPoints[i + 5] >= y ||
          quadPoints[i + 1] <= y
        )
      ) {
        this.#lastIntersectingQuadIndex = i;
        return true;
      }
    }
    return false;
  }

  addGlyph(x, y, glyph) {
    if (!this.#intersects(x, y)) {
      this.disableExtraChars();
      return false;
    }

    if (this.#extraChars.length > 0) {
      this.#text.push(this.#extraChars.join(""));
      this.#extraChars.length = 0;
    }
    this.#text.push(glyph);
    this.#canTakeExtraChars = true;

    return true;
  }

  addExtraChar(char) {
    if (this.#canTakeExtraChars) {
      this.#extraChars.push(char);
    }
  }

  disableExtraChars() {
    if (!this.#canTakeExtraChars) {
      return;
    }
    this.#canTakeExtraChars = false;
    this.#extraChars.length = 0;
  }

  setText() {
    this.#annotation.data.overlaidText = this.#text.join("");
  }
}

// The grid is STEPS x STEPS.
const STEPS = 64;

class Intersector {
  #intersectors = [];

  #grid = [];

  #minX;

  #maxX;

  #minY;

  #maxY;

  #invXRatio;

  #invYRatio;

  constructor(annotations) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const intersectors = this.#intersectors;
    for (const annotation of annotations) {
      if (!annotation.data.quadPoints && !annotation.data.rect) {
        continue;
      }
      const intersector = new SingleIntersector(annotation);
      intersectors.push(intersector);
      minX = Math.min(minX, intersector.minX);
      minY = Math.min(minY, intersector.minY);
      maxX = Math.max(maxX, intersector.maxX);
      maxY = Math.max(maxY, intersector.maxY);
    }
    this.#minX = minX;
    this.#minY = minY;
    this.#maxX = maxX;
    this.#maxY = maxY;
    this.#invXRatio = (STEPS - 1) / (maxX - minX);
    this.#invYRatio = (STEPS - 1) / (maxY - minY);
    for (const intersector of intersectors) {
      // TODO: instead of using the intersector bounds, we could iterate over
      // the grid cells that the quad points intersect.
      const iMin = this.#getGridIndex(intersector.minX, intersector.minY);
      const iMax = this.#getGridIndex(intersector.maxX, intersector.maxY);
      const w = (iMax - iMin) % STEPS;
      const h = Math.floor((iMax - iMin) / STEPS);
      for (let i = iMin; i <= iMin + h * STEPS; i += STEPS) {
        for (let j = 0; j <= w; j++) {
          let existing = this.#grid[i + j];
          if (!existing) {
            this.#grid[i + j] = existing = [];
          }
          existing.push(intersector);
        }
      }
    }
  }

  #getGridIndex(x, y) {
    const i = Math.floor((x - this.#minX) * this.#invXRatio);
    const j = Math.floor((y - this.#minY) * this.#invYRatio);
    return i + j * STEPS;
  }

  addGlyph(transform, width, height, glyph) {
    const x = transform[4] + width / 2;
    const y = transform[5] + height / 2;
    if (x < this.#minX || y < this.#minY || x > this.#maxX || y > this.#maxY) {
      return;
    }
    const intersectors = this.#grid[this.#getGridIndex(x, y)];
    if (!intersectors) {
      return;
    }

    for (const intersector of intersectors) {
      intersector.addGlyph(x, y, glyph);
    }
  }

  addExtraChar(char) {
    for (const intersector of this.#intersectors) {
      intersector.addExtraChar(char);
    }
  }

  setText() {
    for (const intersector of this.#intersectors) {
      intersector.setText();
    }
  }
}

export { Intersector };
