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

import { OperatorBBoxes } from "../../src/display/operator_bboxes.js";
import { PageViewport } from "../../src/display/page_viewport.js";

describe("operator_bboxes", function () {
  describe("OperatorBBoxes", function () {
    const view = [100, 200, 356, 456];
    const bboxes = new OperatorBBoxes(
      new Uint8ClampedArray([10, 20, 30, 40, 255, 255, 0, 0]),
      view
    );

    it("converts the bounding boxes to viewport coordinates", function () {
      const viewport = new PageViewport({
        viewBox: view,
        userUnit: 1,
        scale: 1,
        rotation: 0,
      });
      expect(bboxes.length).toEqual(2);
      expect(bboxes.getViewportBBox(0, viewport)).toEqual([10, 215, 31, 236]);
      expect(bboxes.getViewportBBox(1, viewport)).toBeNull();
      expect(bboxes.getViewportBBox(2, viewport)).toBeNull();

      const rotatedViewport = new PageViewport({
        viewBox: view,
        userUnit: 1,
        scale: 1,
        rotation: 90,
      });
      expect(bboxes.getViewportBBox(0, rotatedViewport)).toEqual([
        20, 10, 41, 31,
      ]);
    });

    it("filters the operations intersecting a viewport area", function () {
      const viewport = new PageViewport({
        viewBox: view,
        userUnit: 1,
        scale: 1,
        rotation: 0,
      });
      const filter = bboxes.getFilter(viewport, [0, 0, 20, 220]);
      expect(filter(0)).toBeTrue();
      expect(filter(1)).toBeFalse();
      expect(filter(2)).toBeFalse();
      expect(bboxes.getFilter(viewport, [31, 236, 50, 250])(0)).toBeTrue();
      expect(bboxes.getFilter(viewport, [32, 0, 50, 250])(0)).toBeFalse();

      const rotatedViewport = new PageViewport({
        viewBox: view,
        userUnit: 1,
        scale: 1,
        rotation: 90,
      });
      expect(bboxes.getFilter(rotatedViewport, [0, 0, 20, 10])(0)).toBeTrue();
      expect(bboxes.getFilter(rotatedViewport, [0, 0, 19, 10])(0)).toBeFalse();
    });

    it("keeps an operation touching the area despite rounding errors", function () {
      const scale = 0.5274;
      const viewport = new PageViewport({
        viewBox: [0, 0, 256, 256],
        userUnit: 1,
        scale,
        rotation: 0,
      });
      const filter = new OperatorBBoxes(
        new Uint8ClampedArray([0, 0, 10, 63]),
        [0, 0, 256, 256]
      ).getFilter(viewport, [0, 0, 10 * scale, 192 * scale]);
      expect(filter(0)).toBeTrue();
    });
  });
});
