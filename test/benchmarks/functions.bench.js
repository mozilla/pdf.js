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

import { bench, describe } from "vitest";
import { AlternateCS } from "../../src/core/colorspace.js";
import { captureImages } from "./image_utils.js";
import { captureShadings } from "./shading_utils.js";
import { Pattern } from "../../src/core/pattern.js";

const SHADINGS = [
  { kind: "axial, exponential", filename: "bug1019475_1.pdf" },
  {
    kind: "axial, stitched",
    filename: "bug1703683_page2_reduced.pdf",
    filter: dict => dict.get("ShadingType") === 2,
  },
  { kind: "axial, sampled", filename: "bug852992_reduced.pdf" },
  { kind: "radial", filename: "radial_gradients.pdf" },
  {
    kind: "function-based, PostScript",
    filename: "function_based_shading.pdf",
    filter: dict => dict.getArray("Matrix")[5] > 500,
  },
  {
    kind: "function-based, sampled",
    filename: "function_based_shading_cmyk.pdf",
    filter: dict => dict.getArray("Matrix")[0] < 600,
  },
  { kind: "Coons patch mesh", filename: "coons-allflags-withfunction.pdf" },
  { kind: "tensor-product patch mesh", filename: "personwithdog.pdf" },
];
for (const entry of SHADINGS) {
  entry.shadings = await captureShadings(entry.filename, entry.filter);
}

const DEVICEN_IMAGES = await captureImages(
  "colorspace_cos.pdf",
  image => image.colorSpace instanceof AlternateCS
);

describe("functions", () => {
  for (const { kind, filename, shadings } of SHADINGS) {
    bench(`Pattern.parseShading: ${kind} (${filename})`, () =>
      shadings.map(input => Pattern.parseShading(...input.args()).getIR())
    );
  }

  bench(
    "PDFImage.createImageData: DeviceN, PostScript tint (colorspace_cos.pdf)",
    async () =>
      Promise.all(
        DEVICEN_IMAGES.map(({ image, forceRGBA }) =>
          image.createImageData(
            forceRGBA,
            /* isOffscreenCanvasSupported = */ true
          )
        )
      )
  );
});
