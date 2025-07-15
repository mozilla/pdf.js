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

  #minX = Infinity;

  #minY = Infinity;

  #maxX = -Infinity;

  #maxY = -Infinity;

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
      [this.#minX, this.#minY, this.#maxX, this.#maxY] = annotation.data.rect;
      return;
    }

    for (let i = 0, ii = quadPoints.length; i < ii; i += 8) {
      this.#minX = Math.min(this.#minX, quadPoints[i]);
      this.#maxX = Math.max(this.#maxX, quadPoints[i + 2]);
      this.#minY = Math.min(this.#minY, quadPoints[i + 5]);
      this.#maxY = Math.max(this.#maxY, quadPoints[i + 1]);
    }
    if (quadPoints.length > 8) {
      this.#quadPoints = quadPoints;
    }
  }

  overlaps(other) {
    return !(
      this.#minX >= other.#maxX ||
      this.#maxX <= other.#minX ||
      this.#minY >= other.#maxY ||
      this.#maxY <= other.#minY
    );
  }

  /**
   * Check if the given point intersects with the annotation's quad points.
   * The point (x, y) is supposed to be the center of the glyph.
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  #intersects(x, y) {
    if (
      this.#minX >= x ||
      this.#maxX <= x ||
      this.#minY >= y ||
      this.#maxY <= y
    ) {
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

class Intersector {
  #intersectors = new Map();

  constructor(annotations) {
    for (const annotation of annotations) {
      if (!annotation.data.quadPoints && !annotation.data.rect) {
        continue;
      }
      const intersector = new SingleIntersector(annotation);
      for (const [otherIntersector, overlapping] of this.#intersectors) {
        if (otherIntersector.overlaps(intersector)) {
          if (!overlapping) {
            this.#intersectors.set(otherIntersector, new Set([intersector]));
          } else {
            overlapping.add(intersector);
          }
        }
      }
      this.#intersectors.set(intersector, null);
    }
  }

  addGlyph(transform, width, height, glyph) {
    const x = transform[4] + width / 2;
    const y = transform[5] + height / 2;
    let overlappingIntersectors;
    for (const [intersector, overlapping] of this.#intersectors) {
      if (overlappingIntersectors) {
        if (overlappingIntersectors.has(intersector)) {
          intersector.addGlyph(x, y, glyph);
        } else {
          intersector.disableExtraChars();
        }
        continue;
      }
      if (!intersector.addGlyph(x, y, glyph)) {
        continue;
      }
      overlappingIntersectors = overlapping;
    }
  }

  addExtraChar(char) {
    for (const intersector of this.#intersectors.keys()) {
      intersector.addExtraChar(char);
    }
  }

  setText() {
    for (const intersector of this.#intersectors.keys()) {
      intersector.setText();
    }
  }
}

export { Intersector };
