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

import { Dict, Name } from "../../src/core/primitives.js";
import {
  GlobalColorSpaceCache,
  LocalColorSpaceCache,
} from "../../src/core/image_utils.js";
import { compilePatternInfo } from "../../src/core/obj_bin_transform_core.js";
import { Pattern } from "../../src/core/pattern.js";
import { PatternInfo } from "../../src/display/obj_bin_transform_display.js";

describe("pattern", function () {
  describe("FunctionBasedShading", function () {
    function createFunctionBasedShading({
      colorSpace = "DeviceRGB",
      domain = [0, 1, 0, 1],
      matrix = [2, 0, 0, 3, 10, 20],
      background = null,
      fn = (src, srcOffset, dest, destOffset) => {
        dest[destOffset] = src[srcOffset];
        dest[destOffset + 1] = src[srcOffset + 1];
        dest[destOffset + 2] = 0;
      },
    } = {}) {
      const dict = new Dict();
      dict.set("ShadingType", 1);
      dict.set("ColorSpace", Name.get(colorSpace));
      dict.set("Domain", domain);
      dict.set("Matrix", matrix);
      if (background) {
        dict.set("Background", background);
      }
      dict.set("Function", {
        fn,
      });

      const pdfFunctionFactory = {
        create(fnObj) {
          return fnObj.fn;
        },
      };
      const xref = {
        fetchIfRef(obj) {
          return obj;
        },
      };

      return Pattern.parseShading(
        dict,
        xref,
        /* res = */ null,
        pdfFunctionFactory,
        new GlobalColorSpaceCache(),
        new LocalColorSpaceCache()
      );
    }

    it("must convert Type 1 shading into packed mesh IR", function () {
      const shading = createFunctionBasedShading();
      const ir = shading.getIR();

      // #minStepsFromFnObj returns [32, 32] for non-Type-0 functions, so
      // stepsX = max(ceil(bboxW=2), 32) = 32  →  verticesPerRow = 33
      // stepsY = max(ceil(bboxH=3), 32) = 32  →  total vertices  = 33×33 = 1089
      const totalVertices = 33 * 33;
      const verticesPerRow = 33;

      expect(ir[0]).toEqual("Mesh");
      expect(ir[1]).toEqual(1);
      expect(ir[2]).toBeInstanceOf(Float32Array);
      expect(ir[2].length).toEqual(totalVertices * 2);
      // First row (y=0): x steps by 2/32=0.0625 in user space (matrix ×2).
      expect(Array.from(ir[2].slice(0, 6))).toEqual([
        10, 20, 10.0625, 20, 10.125, 20,
      ]);
      // Last row (y=1): same x steps, y=3+20=23.
      expect(Array.from(ir[2].slice(-6))).toEqual([
        11.875, 23, 11.9375, 23, 12, 23,
      ]);

      expect(ir[3]).toBeInstanceOf(Uint8ClampedArray);
      expect(ir[3].length).toEqual(totalVertices * 4);
      // col=0: x=0→R=0; col=1: x=1/32→R≈8; col=2: x=2/32→R≈16.
      expect(Array.from(ir[3].slice(0, 12))).toEqual([
        0, 0, 0, 0, 8, 0, 0, 0, 16, 0, 0, 0,
      ]);
      // Boundary vertices evaluated at 1−½step: G≈251, R≈251.
      expect(Array.from(ir[3].slice(-12))).toEqual([
        239, 251, 0, 0, 247, 251, 0, 0, 251, 251, 0, 0,
      ]);

      expect(ir[4]).toEqual([
        jasmine.objectContaining({
          verticesPerRow,
        }),
      ]);
      expect(ir[4][0].coords).toBeInstanceOf(Uint32Array);
      expect(Array.from(ir[4][0].coords)).toEqual(
        Array.from({ length: totalVertices }, (_, i) => i)
      );
      expect(ir[4][0].colors).toBeInstanceOf(Uint32Array);
      expect(Array.from(ir[4][0].colors)).toEqual(
        Array.from({ length: totalVertices }, (_, i) => i)
      );
      expect(ir[5]).toEqual([10, 20, 12, 23]);
      expect(ir[6]).toBeNull();
      expect(ir[7]).toBeNull();
    });

    it("must keep mesh colors intact through binary serialization", function () {
      const shading = createFunctionBasedShading({
        background: [0.25, 0.5, 0.75],
      });
      const buffer = compilePatternInfo(shading.getIR());
      const reconstructedIR = new PatternInfo(buffer).getIR();

      expect(reconstructedIR[0]).toEqual("Mesh");
      expect(reconstructedIR[1]).toEqual(1);
      expect(Array.from(reconstructedIR[2])).toEqual(
        Array.from(shading.coords)
      );
      expect(Array.from(reconstructedIR[3])).toEqual(
        Array.from(shading.colors)
      );
      expect(Array.from(reconstructedIR[7])).toEqual([64, 128, 191]);
    });

    it("must sample the upper and right edges half a step inside", function () {
      const shading = createFunctionBasedShading({
        colorSpace: "DeviceGray",
        fn(src, srcOffset, dest, destOffset) {
          dest[destOffset] =
            src[srcOffset] === 1 || src[srcOffset + 1] === 1 ? 1 : 0;
        },
      });
      const [, , , colors] = shading.getIR();

      // 33×33 grid (stepsX=stepsY=32); boundary vertices are evaluated at
      // 1−½step rather than exactly 1, so the fn always returns 0.
      const totalVertices = 33 * 33;
      expect(colors.length).toEqual(totalVertices * 4);
      expect(Array.from(colors)).toEqual(new Array(totalVertices * 4).fill(0));
    });
  });
});
