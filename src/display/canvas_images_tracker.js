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

import { BBOX_INIT, FeatureTest, Util } from "../shared/util.js";
import { getCurrentTransform } from "./display_utils.js";

/**
 * Tracks image bounds, normalized by the canvas dimensions.
 */
class CanvasImagesTracker {
  #canvasWidth;

  #canvasHeight;

  #capacity = 4;

  #count = 0;

  // Three corners per image: [x1, y1, x2, y2, x3, y3].
  #coords = new CanvasImagesTracker.#CoordsArray(this.#capacity * 6);

  static #CoordsArray =
    (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) ||
    FeatureTest.isFloat16ArraySupported
      ? Float16Array
      : Float32Array;

  constructor(canvas) {
    this.#canvasWidth = canvas.width;
    this.#canvasHeight = canvas.height;
  }

  record(ctx, width, height, clipBox) {
    if (this.#count === this.#capacity) {
      this.#capacity *= 2;
      const newCoords = new CanvasImagesTracker.#CoordsArray(
        this.#capacity * 6
      );
      newCoords.set(this.#coords);
      this.#coords = newCoords;
    }

    const transform = getCurrentTransform(ctx);

    let coords;

    if (clipBox[0] !== Infinity) {
      const bbox = BBOX_INIT.slice();
      Util.transformedRectBoundingBox(0, -height, width, 0, transform, bbox);

      const finalBBox = Util.intersect(clipBox, bbox);
      if (!finalBBox) {
        // The image is fully clipped out.
        return;
      }

      const [minX, minY, maxX, maxY] = finalBBox;

      if (
        minX !== bbox[0] ||
        minY !== bbox[1] ||
        maxX !== bbox[2] ||
        maxY !== bbox[3]
      ) {
        // Approximate the clipped image using the transform's rotation.
        const rotationAngle = Math.atan2(transform[1], transform[0]);

        // Fold the rotation into the first quadrant.
        const sin = Math.abs(Math.sin(rotationAngle));
        const cos = Math.abs(Math.cos(rotationAngle));

        if (
          sin < 1e-6 ||
          cos < 1e-6 ||
          // Near 45 degrees, cos² - sin² approaches zero.
          Math.abs(sin - cos) < 1e-6
        ) {
          coords = [minX, minY, minX, maxY, maxX, minY];
        } else {
          // Solve for corner offsets a and b in the clipped bounding box.
          // Alpha is the folded rotation angle.
          //
          //               ------------b----------
          //              +-----------------------*----+
          //            | |                _ -‾    \   |
          //            a |           _ -‾          \  |
          //            | |alpha _ -‾                \ |
          //            | | _ -‾                      \|
          //              |\                       _ -‾|
          //              | \                 _ -‾     |
          //              |  \           _ -‾          |
          //              |   \     _ -‾               |
          //              +----*-----------------------+

          const finalBBoxWidth = maxX - minX;
          const finalBBoxHeight = maxY - minY;

          const sin2 = sin * sin;
          const cos2 = cos * cos;
          const cosSin = cos * sin;
          const denom = cos2 - sin2;

          const a = (finalBBoxHeight * cos2 - finalBBoxWidth * cosSin) / denom;
          const b = (finalBBoxHeight * cosSin - finalBBoxWidth * sin2) / denom;

          coords = [minX + b, minY, minX, minY + a, maxX, maxY - a];
        }
      }
    }

    if (!coords) {
      // Image-space corners: top left, bottom left, top right.
      coords = [0, -height, 0, 0, width, -height];
      Util.applyTransform(coords, transform, 0);
      Util.applyTransform(coords, transform, 2);
      Util.applyTransform(coords, transform, 4);
    }
    coords[0] /= this.#canvasWidth;
    coords[1] /= this.#canvasHeight;
    coords[2] /= this.#canvasWidth;
    coords[3] /= this.#canvasHeight;
    coords[4] /= this.#canvasWidth;
    coords[5] /= this.#canvasHeight;
    this.#coords.set(coords, this.#count * 6);
    this.#count++;
  }

  take() {
    return this.#coords.subarray(0, this.#count * 6);
  }
}

export { CanvasImagesTracker };
