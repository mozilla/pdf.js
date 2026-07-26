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
      if (Array.isArray(colorSpace)) {
        // `setIfName` only accepts a name, and would silently drop an Array.
        dict.set("ColorSpace", colorSpace);
      } else {
        dict.setIfName("ColorSpace", colorSpace);
      }
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

      expect(ir[0]).toEqual("Mesh");
      expect(ir[1]).toEqual(1);
      // Vertices are pre-expanded: 3×4 lattice →
      // 6 quads → 12 triangles → 36 vertices
      expect(ir[2]).toBeInstanceOf(Float32Array);
      expect(ir[2].length).toEqual(72); // 36 vertices × 2 coords
      expect(ir[3]).toBeInstanceOf(Uint8Array);
      expect(ir[3].length).toEqual(144); // 36 vertices × 4 bytes
      expect(ir[4]).toEqual(36); // vertexCount
      expect(ir[5]).toEqual([10, 20, 12, 23]);
      expect(ir[6]).toBeNull();
      expect(ir[7]).toBeNull();
    });

    it("must bound the color component buffer while batching", function () {
      const numComps = 32;
      let batchStarts = 0;
      let componentBufferLength = 0;
      const colorSpace = [
        Name.get("DeviceN"),
        Array.from({ length: numComps }, (_, i) => Name.get(`Colorant${i}`)),
        Name.get("DeviceRGB"),
        {
          fn(src, srcOffset, dest, destOffset) {
            dest[destOffset] = src[srcOffset];
            dest[destOffset + 1] = src[srcOffset + 1];
            dest[destOffset + 2] = src[srcOffset + 2];
          },
        },
      ];
      const shading = createFunctionBasedShading({
        colorSpace,
        matrix: [64, 0, 0, 64, 0, 0],
        fn(src, srcOffset, dest, destOffset) {
          if (destOffset === 0) {
            batchStarts++;
            componentBufferLength = dest.length;
          }
          dest[destOffset] = src[srcOffset];
          dest[destOffset + 1] = src[srcOffset + 1];
          dest[destOffset + 2] = 0.5;
          dest.fill(0, destOffset + 3, destOffset + numComps);
        },
      });
      const [, , , colors] = shading.getIR();

      const totalVertices = (64 + 1) ** 2;
      expect(batchStarts).toBeGreaterThan(1);
      expect(componentBufferLength).toBeLessThan(totalVertices * numComps);
      expect(Array.from(colors.subarray(0, 4))).toEqual([0, 0, 128, 0]);
    });

    it("must keep mesh colors intact through binary serialization", function () {
      const shading = createFunctionBasedShading({
        background: [0.25, 0.5, 0.75],
      });
      const ir = shading.getIR();
      const buffer = compilePatternInfo(ir);
      const reconstructedIR = new PatternInfo(buffer).getIR();

      expect(reconstructedIR[0]).toEqual("Mesh");
      expect(reconstructedIR[1]).toEqual(1);
      expect(Array.from(reconstructedIR[2])).toEqual(Array.from(ir[2]));
      expect(Array.from(reconstructedIR[3])).toEqual(Array.from(ir[3]));
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

      expect(colors.length).toEqual(144);
      expect(Array.from(colors)).toEqual(new Array(144).fill(0));
    });
  });
});
