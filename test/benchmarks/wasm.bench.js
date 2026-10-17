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
import { captureImages, captureWasmImages } from "./image_utils.js";
import { JBig2CCITTFaxImage } from "../../src/core/jbig2_ccittFax.js";
import { JpxImage } from "../../src/core/jpx.js";

const WASM_IMAGES = [
  { kind: "JPX", filename: "issue5475.pdf", ImageClass: JpxImage },
  {
    kind: "JBIG2 generic region",
    filename: "bitmap-tpgdon.pdf",
    ImageClass: JBig2CCITTFaxImage,
  },
  {
    kind: "JBIG2 MMR",
    filename: "bitmap-mmr.pdf",
    ImageClass: JBig2CCITTFaxImage,
  },
  {
    kind: "JBIG2 text region",
    filename: "bitmap-symbol.pdf",
    ImageClass: JBig2CCITTFaxImage,
  },
  { kind: "CCITT", filename: "issue5747.pdf", ImageClass: JBig2CCITTFaxImage },
];
for (const entry of WASM_IMAGES) {
  entry.images = await captureWasmImages(
    entry.filename,
    entry.ImageClass,
    entry.options
  );
}

const ICC_IMAGES = await captureImages(
  "issue6931_reduced.pdf",
  image => image.colorSpace.name === "ICCBased"
);

describe("wasm", () => {
  for (const { kind, filename, ImageClass, images } of WASM_IMAGES) {
    bench(`${ImageClass.name}.decode: ${kind} (${filename})`, async () =>
      Promise.all(images.map(args => ImageClass.instance.decode(...args)))
    );
  }

  bench(
    "PDFImage.createImageData: ICCBased (issue6931_reduced.pdf)",
    async () =>
      Promise.all(
        ICC_IMAGES.map(({ image, forceRGBA }) =>
          image.createImageData(
            forceRGBA,
            /* isOffscreenCanvasSupported = */ true
          )
        )
      )
  );
});
