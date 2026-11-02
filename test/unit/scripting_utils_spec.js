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

import { ColorConverters } from "../../src/shared/scripting_utils.js";

describe("scripting_utils", function () {
  describe("ColorConverters", function () {
    it("should check G conversion", function () {
      const color = [0.5];

      expect(ColorConverters.G_CMYK(color)).toEqual(["CMYK", 0, 0, 0, 0.5]);

      expect(ColorConverters.G_RGB(color)).toEqual(["RGB", 0.5, 0.5, 0.5]);

      expect(ColorConverters.G_rgb(color)).toEqual([127.5, 127.5, 127.5]);

      expect(ColorConverters.G_HTML(color)).toEqual("#7f7f7f");
    });

    it("should check RGB conversion", function () {
      const color = [0.4, 0.5, 0.6];

      expect(ColorConverters.RGB_CMYK(color)).toEqual([
        "CMYK",
        0.6,
        0.5,
        0.4,
        0.4,
      ]);

      expect(ColorConverters.RGB_G(color)).toEqual(["G", 0.481]);

      expect(ColorConverters.RGB_rgb(color)).toEqual([102, 127.5, 153]);

      expect(ColorConverters.RGB_HTML(color)).toEqual("#667f99");
    });

    it("should check CMYK conversion", function () {
      const color = [0.4, 0.5, 0.6, 0];

      expect(ColorConverters.CMYK_RGB(color)).toEqual(["RGB", 0.6, 0.5, 0.4]);

      expect(ColorConverters.CMYK_G(color)).toEqual(["G", 0.519]);

      expect(ColorConverters.CMYK_rgb(color)).toEqual([153, 127.5, 102]);

      expect(ColorConverters.CMYK_HTML(color)).toEqual("#997f66");
    });

    // `RGB_CMYK` emits [cyan, magenta, yellow, black] and
    // `src/scripting_api/color.js` declares e.g.
    // `yellow = ["CMYK", 0, 0, 1, 0]`, while `DeviceCmykCS` in
    // `src/core/colorspace.js` reads src[0]/[1]/[2]/[3] as c/m/y/k:
    // the CMYK converters must read that very same component order.
    it("should read CMYK components as cyan, magenta, yellow, black", function () {
      expect(ColorConverters.CMYK_rgb([0, 0, 1, 0])).toEqual([255, 255, 0]);
      expect(ColorConverters.CMYK_rgb([0, 1, 0, 0])).toEqual([255, 0, 255]);
      expect(ColorConverters.CMYK_rgb([1, 0, 0, 0])).toEqual([0, 255, 255]);

      expect(ColorConverters.CMYK_HTML([0, 0, 1, 0])).toEqual("#ffff00");
      expect(ColorConverters.CMYK_HTML([0, 1, 0, 0])).toEqual("#ff00ff");
      expect(ColorConverters.CMYK_HTML([1, 0, 0, 0])).toEqual("#00ffff");
    });

    it("should round-trip a RGB color through CMYK without a black component", function () {
      const color = [0.4, 0.7, 1];
      const cmyk = ColorConverters.RGB_CMYK(color).slice(1);

      expect(ColorConverters.CMYK_RGB(cmyk)).toEqual(["RGB", ...color]);
      expect(ColorConverters.CMYK_HTML(cmyk)).toEqual(
        ColorConverters.RGB_HTML(color)
      );
    });

    it("should convert CMYK to gray with more weight on magenta than on yellow", function () {
      expect(ColorConverters.CMYK_G([0, 1, 0, 0])[1]).toBeCloseTo(0.41, 10);
      expect(ColorConverters.CMYK_G([0, 0, 1, 0])[1]).toBeCloseTo(0.89, 10);
    });

    it("should check T conversion", function () {
      const color = [0.4, 0.5, 0.6];

      expect(ColorConverters.T_rgb(color)).toEqual([null]);

      expect(ColorConverters.T_HTML(color)).toEqual("#00000000");
    });
  });
});
