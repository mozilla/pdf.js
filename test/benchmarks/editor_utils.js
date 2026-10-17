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

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createImage } from "../../src/core/editor/pdf_images.js";
import { isName } from "../../src/core/primitives.js";
import { readFile } from "./bench_utils.js";
import zlib from "zlib";

globalThis.OffscreenCanvas = function OffscreenCanvas(width, height) {
  return createCanvas(width, height);
};

/**
 * Use synchronous deflate so compression runs in the benchmark thread.
 */
globalThis.CompressionStream = class extends TransformStream {
  constructor(format) {
    const chunks = [];
    super({
      transform(chunk) {
        chunks.push(chunk);
      },
      flush(controller) {
        controller.enqueue(
          new Uint8Array(zlib.deflateSync(Buffer.concat(chunks)))
        );
      },
    });
  }
};

/**
 * @param {string} filename - In `test/images/`.
 * @returns {Promise<Image>} Decoded test image for `createImage`.
 */
async function loadTestImage(filename) {
  const bitmap = await loadImage(
    Buffer.from(readFile(`test/images/${filename}`))
  );
  const { imageStream } = await createImage(bitmap, /* xref = */ null);
  if (
    !isName(imageStream.dict.get("Filter"), "FlateDecode") ||
    imageStream.dict.get("DecodeParms")?.get("Predictor") !== 15
  ) {
    throw new Error(`"${filename}" isn't saved with a PNG predictor.`);
  }
  return bitmap;
}

export { loadTestImage };
