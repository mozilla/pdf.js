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

      expect(ColorConverters.CMYK_RGB(color)).toEqual(["RGB", 0.6, 0.4, 0.5]);

      expect(ColorConverters.CMYK_G(color)).toEqual(["G", 0.471]);

      expect(ColorConverters.CMYK_rgb(color)).toEqual([153, 102, 127.5]);

      expect(ColorConverters.CMYK_HTML(color)).toEqual("#99667f");
    });

    it("should check T conversion", function () {
      const color = [0.4, 0.5, 0.6];

      expect(ColorConverters.T_rgb(color)).toEqual([null]);

      expect(ColorConverters.T_HTML(color)).toEqual("#00000000");
    });
  });
});
