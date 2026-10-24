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

import {
  captureImageMasks,
  captureImages,
  captureJpegImages,
  createSyntheticImage,
} from "./image_utils.js";
import { benchmark } from "./bench_utils.js";
import { describe } from "vitest";
import { JpegImage } from "../../src/core/jpg.js";
import { PDFImage } from "../../src/core/image.js";

const JPEG_IMAGES = [
  { kind: "baseline", filename: "stamps.pdf" },
  { kind: "progressive", filename: "pdkids.pdf", options: { pages: [2, 13] } },
];
for (const entry of JPEG_IMAGES) {
  entry.images = await captureJpegImages(entry.filename, entry.options);
}

const IMAGES = [
  {
    kind: "DeviceRGB with an SMask",
    filename: "bug1868759.pdf",
    filter: image => image.colorSpace.name === "DeviceRGB" && image.smask,
  },
  {
    kind: "Indexed with a larger Mask",
    filename: "issue4246.pdf",
    filter: image =>
      image.colorSpace.name === "Indexed" && image.mask instanceof PDFImage,
  },
  {
    kind: "Indexed 4 bpc",
    filename: "issue7200.pdf",
    filter: image => image.colorSpace.name === "Indexed" && image.bpc === 4,
  },
  {
    kind: "DeviceGray",
    filename: "issue7891_bc0.pdf",
    filter: image => image.colorSpace.name === "DeviceGray" && image.bpc === 8,
  },
  {
    kind: "DeviceRGB",
    filename: "issue11931.pdf",
    filter: image =>
      image.colorSpace.name === "DeviceRGB" && image.bpc === 8 && !image.smask,
  },
  {
    kind: "DeviceGray 1 bpc",
    filename: "image-rotated-black-white-ratio.pdf",
    filter: image => image.colorSpace.name === "DeviceGray" && image.bpc === 1,
  },
];
for (const entry of IMAGES) {
  entry.images = await captureImages(
    entry.filename,
    entry.filter,
    entry.options
  );
}

// Downscaling requires a dimension larger than 2048 pixels, and the matching
// (non-JPEG) DeviceRGB and DeviceGray images in the test PDFs are several times
// larger than needed (e.g. 2980x2977 in images.pdf), which is too slow to
// benchmark. Hence generate images which are just large enough instead.
const SYNTHETIC_IMAGES = [
  { kind: "DeviceRGB with an SMask", colorSpace: "DeviceRGB", smask: true },
  { kind: "DeviceGray", colorSpace: "DeviceGray" },
];
for (const entry of SYNTHETIC_IMAGES) {
  entry.image = await createSyntheticImage({
    width: 2200,
    height: 1000,
    ...entry,
  });
}

const IMAGE_MASKS = await captureImageMasks("issue17147.pdf");

describe("images", () => {
  for (const { kind, filename, images } of JPEG_IMAGES) {
    benchmark(`JpegImage: ${kind} (${filename})`, () =>
      images.map(({ bytes, options, getDataOptions }) => {
        const jpegImage = new JpegImage(options);
        jpegImage.parse(bytes);
        return jpegImage.getData(getDataOptions);
      })
    );
  }

  for (const { kind, filename, images } of IMAGES) {
    benchmark(`PDFImage.createImageData: ${kind} (${filename})`, async () =>
      Promise.all(
        images.map(({ image, forceRGBA }) =>
          image.createImageData(
            forceRGBA,
            /* isOffscreenCanvasSupported = */ true
          )
        )
      )
    );
  }

  for (const { kind, image } of SYNTHETIC_IMAGES) {
    benchmark(
      `PDFImage.createImageData: downscaled ${kind} (2200x1000)`,
      async () =>
        image.createImageData(
          /* forceRGBA = */ false,
          /* isOffscreenCanvasSupported = */ true
        )
    );
  }

  benchmark("PDFImage.createMask (issue17147.pdf)", async () =>
    Promise.all(
      IMAGE_MASKS.map(image => {
        image.reset();
        return PDFImage.createMask({ image, isOffscreenCanvasSupported: true });
      })
    )
  );
});
