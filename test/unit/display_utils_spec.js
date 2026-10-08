/* Copyright 2017 Mozilla Foundation
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

import {
  applyOpacity,
  findContrastColor,
  getRGB,
  getRGBA,
} from "../../src/display/display_utils.js";
import { isNodeJS } from "../../src/shared/util.js";

describe("display_utils", function () {
  describe("getRGBA", function () {
    it("parses a 6-digit hex color as fully opaque", function () {
      expect(getRGBA("#ff0000")).toEqual([255, 0, 0, 1]);
      expect(getRGBA("#00ff00")).toEqual([0, 255, 0, 1]);
      expect(getRGBA("#1a2b3c")).toEqual([26, 43, 60, 1]);
    });

    it("parses an 8-digit hex color with alpha", function () {
      expect(getRGBA("#ff000080")).toEqual([255, 0, 0, 128 / 255]);
      expect(getRGBA("#00ff00ff")).toEqual([0, 255, 0, 1]);
      expect(getRGBA("#00000000")).toEqual([0, 0, 0, 0]);
    });

    it("parses an rgb() color as fully opaque", function () {
      expect(getRGBA("rgb(255, 0, 0)")).toEqual([255, 0, 0, 1]);
      expect(getRGBA("rgb(0, 128, 64)")).toEqual([0, 128, 64, 1]);
    });

    it("parses an rgba() color with alpha", function () {
      expect(getRGBA("rgba(255, 0, 0, 0.5)")).toEqual([255, 0, 0, 0.5]);
      expect(getRGBA("rgba(0, 0, 0, 0)")).toEqual([0, 0, 0, 0]);
      expect(getRGBA("rgba(1, 2, 3, 1)")).toEqual([1, 2, 3, 1]);
    });

    it("parses a color(srgb) value as fully opaque when no alpha", function () {
      expect(getRGBA("color(srgb 1 0 0)")).toEqual([255, 0, 0, 1]);
      expect(getRGBA("color(srgb 0 0.5 0.25)")).toEqual([0, 128, 64, 1]);
    });

    it("parses a color(srgb) value with alpha", function () {
      expect(getRGBA("color(srgb 1 0 0 / 0.5)")).toEqual([255, 0, 0, 0.5]);
      expect(getRGBA("color(srgb 0 0 0 / 0)")).toEqual([0, 0, 0, 0]);
    });

    it("treats 'none' alpha in color(srgb) as fully opaque", function () {
      expect(getRGBA("color(srgb 1 0 0 / none)")).toEqual([255, 0, 0, 1]);
    });
  });

  describe("getRGB", function () {
    it("returns only the RGB components, dropping alpha", function () {
      expect(getRGB("#ff000080")).toEqual([255, 0, 0]);
      expect(getRGB("rgba(0, 128, 64, 0.5)")).toEqual([0, 128, 64]);
      expect(getRGB("color(srgb 0 0.5 0.25 / 0.8)")).toEqual([0, 128, 64]);
    });
  });

  describe("findContrastColor", function () {
    it("Check that the lightness is changed correctly", function () {
      expect(findContrastColor([210, 98, 76], [197, 113, 89])).toEqual(
        "#260e09"
      );
    });
  });

  describe("applyOpacity", function () {
    it("Check that the opacity is applied correctly", function () {
      if (isNodeJS) {
        pending("OffscreenCanvas is not supported in Node.js.");
      }
      const canvas = new OffscreenCanvas(1, 1);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(123, 45, 67)";
      ctx.globalAlpha = 0.8;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      expect(applyOpacity([123, 45, 67], ctx.globalAlpha)).toEqual([r, g, b]);
    });
  });
});
