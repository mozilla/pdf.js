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
  captureCalls,
  captureMethodCalls,
  processPdf,
  readStream,
} from "./capture_utils.js";
import { Dict, Name } from "../../src/core/primitives.js";
import {
  GlobalColorSpaceCache,
  LocalColorSpaceCache,
} from "../../src/core/image_utils.js";
import { NullStream, Stream } from "../../src/core/stream.js";
import { DecodeStream } from "../../src/core/decode_stream.js";
import { ImageResizer } from "../../src/core/image_resizer.js";
import { isArrayEqual } from "../../src/shared/util.js";
import { JpegImage } from "../../src/core/jpg.js";
import { PDFImage } from "../../src/core/image.js";
import { XRef } from "../../src/core/xref.js";

class ImageDataStub {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

/**
 * Store image data as the bitmap without canvas rendering.
 */
class OffscreenCanvasStub {
  #imageData = null;

  constructor(width, height) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    return {
      createImageData: (width, height) =>
        new ImageDataStub(
          new Uint8ClampedArray(width * height * 4),
          width,
          height
        ),
      putImageData: imageData => {
        this.#imageData = imageData;
      },
      fillRect() {},
      getImageData: () =>
        new ImageDataStub(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1),
    };
  }

  transferToImageBitmap() {
    return this.#imageData;
  }
}

globalThis.ImageData = ImageDataStub;
globalThis.OffscreenCanvas = OffscreenCanvasStub;

// The stub above accepts any canvas size, so the actual canvas limits can't be
// probed. Instead set a small limit (one megapixel), such that images which are
// just larger than `MIN_IMAGE_DIM` (see `ImageResizer.needsToBeResized`) in one
// dimension, hence still fast enough to benchmark, are downscaled.
ImageResizer.setOptions({ canvasMaxAreaInBytes: 4 * 2 ** 20 });

/**
 * @param {BaseStream} stream
 * @returns {BaseStream} Decoded bytes in a Stream or DecodeStream.
 */
function copyStream(stream) {
  const bytes = readStream(stream);
  if (!(stream instanceof DecodeStream)) {
    return new Stream(bytes, 0, bytes.length, stream.dict);
  }
  const copy = new DecodeStream();
  copy.buffer = bytes;
  copy.bufferLength = bytes.length;
  copy.eof = true;
  copy.dict = stream.dict;
  return copy;
}

function copyImageStreams(image) {
  const pdfImages = [image, image.smask, image.mask].filter(
    pdfImage => pdfImage instanceof PDFImage
  );
  return pdfImages.some(pdfImage => pdfImage.image.isImageStream)
    ? null
    : pdfImages.map(pdfImage => [pdfImage, copyStream(pdfImage.image)]);
}

/**
 * Check that replaying, i.e. re-running, the captured call produces a bitmap
 * and that doing it twice gives the same result: the image streams can be read
 * again, hence every benchmark iteration does the same work.
 * @param {string} filename
 * @param {Function} replay
 */
async function checkReplay(filename, replay) {
  const { bitmap } = await replay();
  if (!bitmap || !isArrayEqual(bitmap.data, (await replay()).bitmap.data)) {
    throw new Error(`Image in "${filename}" can't be replayed.`);
  }
}

/**
 * @param {string} filename
 * @param {Function} filter - Predicate on `PDFImage`.
 * @param {object} [options] - See `processPdf`.
 * @returns {Promise<Array<object>>} Images and `forceRGBA`, excluding JPEG,
 *   JPX, JBIG2 and CCITT.
 */
async function captureImages(filename, filter, options) {
  const images = await captureCalls(
    PDFImage.prototype,
    "createImageData",
    () => processPdf(filename, { ...options, operatorList: true }),
    (image, [forceRGBA]) => {
      const streams = filter(image) && copyImageStreams(image);
      return streams ? { image, forceRGBA, streams } : undefined;
    },
    { before: true }
  );
  if (images.length === 0) {
    throw new Error(`No matching image in "${filename}".`);
  }
  for (const { image, forceRGBA, streams } of images) {
    for (const [pdfImage, stream] of streams) {
      pdfImage.image = stream;
    }
    await checkReplay(filename, () => image.createImageData(forceRGBA, true));
  }
  return images.map(({ image, forceRGBA }) => ({ image, forceRGBA }));
}

/**
 * @param {string} filename
 * @param {object} [options] - See `processPdf`.
 * @returns {Promise<Array<BaseStream>>} Copied mask streams, excluding JPEG,
 *   JPX, JBIG2 and CCITT.
 */
async function captureImageMasks(filename, options) {
  const masks = await captureCalls(
    PDFImage,
    "createMask",
    () => processPdf(filename, { ...options, operatorList: true }),
    (target, [{ image }]) =>
      image.isImageStream ? undefined : copyStream(image),
    { before: true }
  );
  if (masks.length === 0) {
    throw new Error(`No image mask in "${filename}".`);
  }
  for (const image of masks) {
    await checkReplay(filename, () => {
      image.reset();
      return PDFImage.createMask({ image, isOffscreenCanvasSupported: true });
    });
  }
  return masks;
}

function createImageStream(width, height, colorSpace, getSample) {
  const numComps = colorSpace === "DeviceRGB" ? 3 : 1;
  const bytes = new Uint8Array(width * height * numComps);
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < numComps; c++) {
        bytes[i++] = getSample(x, y, c);
      }
    }
  }
  const dict = new Dict(null);
  dict.set("Width", width);
  dict.set("Height", height);
  dict.set("BitsPerComponent", 8);
  dict.set("ColorSpace", Name.get(colorSpace));
  return new Stream(bytes, 0, bytes.length, dict);
}

/**
 * @param {object} params
 * @param {number} params.width
 * @param {number} params.height
 * @param {string} params.colorSpace - "DeviceGray" or "DeviceRGB".
 * @param {boolean} [params.smask]
 * @returns {Promise<PDFImage>} 8 bpc gradient image.
 */
async function createSyntheticImage({
  width,
  height,
  colorSpace,
  smask = false,
}) {
  const image = new PDFImage({
    xref: new XRef(new NullStream(), /* pdfManager = */ null),
    res: null,
    image: createImageStream(
      width,
      height,
      colorSpace,
      (x, y, c) => (x + (c + 1) * y) & 0xff
    ),
    smask: smask
      ? createImageStream(width, height, "DeviceGray", (x, y) => (x ^ y) & 0xff)
      : null,
    pdfFunctionFactory: null,
    globalColorSpaceCache: new GlobalColorSpaceCache(),
    localColorSpaceCache: new LocalColorSpaceCache(),
  });
  await checkReplay("synthetic", () => image.createImageData(false, true));
  return image;
}

/**
 * @param {string} filename
 * @param {object} [options] - See `processPdf`.
 * @returns {Promise<Array<object>>} JPEG bytes, constructor options and
 *   `getData` options.
 */
async function captureJpegImages(filename, options) {
  const data = new Map();
  const [, images] = await captureMethodCalls(
    () => processPdf(filename, { ...options, operatorList: true }),
    [
      {
        target: JpegImage.prototype,
        name: "parse",
        snapshot: (jpegImage, [bytes]) => {
          data.set(jpegImage, bytes.slice());
        },
        before: true,
      },
      {
        target: JpegImage.prototype,
        name: "getData",
        snapshot: (jpegImage, [getDataOptions]) => ({
          bytes: data.get(jpegImage),
          options: { colorTransform: jpegImage._colorTransform },
          getDataOptions: { ...getDataOptions },
        }),
        before: true,
      },
    ]
  );
  if (images.length === 0) {
    throw new Error(`No JPEG image in "${filename}".`);
  }
  return images;
}

/**
 * @param {string} filename
 * @param {typeof WasmImage} ImageClass - `JpxImage` or `JBig2CCITTFaxImage`.
 * @param {object} [options] - See `processPdf`.
 * @returns {Promise<Array<Array>>} `decode` arguments with copied byte arrays.
 */
async function captureWasmImages(filename, ImageClass, options) {
  const images = await captureCalls(
    ImageClass.prototype,
    "decode",
    () => processPdf(filename, { ...options, operatorList: true }),
    (image, args) =>
      args.map(arg => (arg instanceof Uint8Array ? arg.slice() : arg)),
    { before: true }
  );
  if (images.length === 0) {
    throw new Error(`No ${ImageClass.name} image in "${filename}".`);
  }
  return images;
}

export {
  captureImageMasks,
  captureImages,
  captureJpegImages,
  captureWasmImages,
  createSyntheticImage,
};
