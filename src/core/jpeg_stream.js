/* Copyright 2012 Mozilla Foundation
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

import { shadow, warn } from "../shared/util.js";
import { ColorSpaceUtils } from "./colorspace_utils.js";
import { DecodeStream } from "./decode_stream.js";
import { Dict } from "./primitives.js";
import { getJpegImageInfo } from "./jpeg_utils.js";

/**
 * For JPEG's we use a library to decode these images and the stream behaves
 * like all the other DecodeStreams.
 */
class JpegStream extends DecodeStream {
  #pdfManager;

  constructor(stream, maybeLength, params, pdfManager) {
    super(maybeLength);

    this.stream = stream;
    this.dict = stream.dict;
    this.maybeLength = maybeLength;
    this.params = params;
    this.#pdfManager = pdfManager;
  }

  static get canUseImageDecoder() {
    return shadow(
      this,
      "canUseImageDecoder",
      ImageDecoder.isTypeSupported("image/jpeg")
    );
  }

  get bytes() {
    // If `this.maybeLength` is null, we'll get the entire stream.
    return shadow(this, "bytes", this.stream.getBytes(this.maybeLength));
  }

  get isAsyncDecoder() {
    return true;
  }

  ensureBuffer(requested) {
    // The decoder supplies the entire buffer, even for a partial read.
  }

  get jpegOptions() {
    const jpegOptions = { colorTransform: undefined };

    // Fetching the 'ColorTransform' entry, if it exists.
    if (this.params instanceof Dict) {
      const colorTransform = this.params.get("ColorTransform");
      if (Number.isInteger(colorTransform)) {
        jpegOptions.colorTransform = colorTransform;
      }
    }
    return shadow(this, "jpegOptions", jpegOptions);
  }

  #skipUselessBytes(data) {
    // Some images may contain 'junk' before the SOI (start-of-image) marker.
    // Note: this seems to mainly affect inline images.
    for (let i = 0, ii = data.length - 1; i < ii; i++) {
      if (data[i] === 0xff && data[i + 1] === 0xd8) {
        if (i > 0) {
          data = data.subarray(i);
        }
        break;
      }
    }
    return data;
  }

  async getImageData(length, decoderOptions) {
    const data = await super.getImageData(length, decoderOptions);
    return this.canAsyncDecodeImageFromBuffer ? data : this.getBytes(length);
  }

  async decodeImage(bytes) {
    if (this.eof) {
      return this.buffer;
    }
    bytes = this.#skipUselessBytes(bytes || this.bytes);
    const { JpegImage } = await import(
      /* webpackChunkName: "jpeg" */ "./jpg.js"
    );

    // TODO: if an image has a mask we need to combine the data.
    // So ideally get a VideoFrame from getTransferableImage and then use
    // copyTo.

    const jpegImage = new JpegImage(this.jpegOptions);
    jpegImage.parse(bytes);
    const { forceRGBA, forceRGB } = this;
    const cmyk =
      jpegImage.numComponents === 4 && (forceRGBA || forceRGB)
        ? await ColorSpaceUtils.getCmyk(this.dict?.xref)
        : undefined;
    const data = jpegImage.getData({
      width: this.drawWidth,
      height: this.drawHeight,
      forceRGBA,
      forceRGB,
      cmyk,
    });
    this.buffer = data;
    this.bufferLength = data.length;
    this.eof = true;

    return this.buffer;
  }

  get canAsyncDecodeImageFromBuffer() {
    return this.stream.isAsync;
  }

  async getTransferableImage(width, height) {
    if (
      !this.#pdfManager.evaluatorOptions.isImageDecoderSupported ||
      !(await JpegStream.canUseImageDecoder)
    ) {
      return null;
    }
    const jpegOptions = this.jpegOptions;
    let decoder;
    try {
      // TODO: If the stream is Flate & DCT we could try to just pipe the
      // the DecompressionStream into the ImageDecoder: it'll avoid the
      // intermediate ArrayBuffer.
      const bytes =
        (this.canAsyncDecodeImageFromBuffer &&
          (await this.stream.asyncGetBytes())) ||
        this.bytes;
      if (!bytes) {
        return null;
      }
      let data = this.#skipUselessBytes(bytes);
      const info = getJpegImageInfo(data, jpegOptions.colorTransform);
      if (!info) {
        return null;
      }
      const {
        width: frameWidth,
        height: frameHeight,
        exifStart,
        exifEnd,
      } = info;
      const reducePower = this.#pdfManager.imageResizer.getReducePower(
        frameWidth,
        frameHeight
      );
      if (
        (frameWidth !== width || frameHeight !== height) &&
        (reducePower || !frameHeight)
      ) {
        // Only downscale when the SOF and image dictionary dimensions match.
        return null;
      }
      if (exifStart) {
        // Replace the entire EXIF-block with dummy data, to ensure that a
        // non-default EXIF orientation won't cause the image to be rotated
        // when using `ImageDecoder` (fixes bug1942064.pdf).
        //
        // Copy the data first, to avoid modifying the original PDF document.
        data = data.slice();
        data.fill(0x00, exifStart, exifEnd);
      }
      const init = {
        data,
        type: "image/jpeg",
        preferAnimation: false,
      };
      // Request reduced dimensions; ImageDecoder treats them as best-effort.
      if (reducePower) {
        const factor = 2 ** reducePower;
        init.desiredWidth = Math.ceil(frameWidth / factor);
        init.desiredHeight = Math.ceil(frameHeight / factor);
      }
      decoder = new ImageDecoder(init);

      return (await decoder.decode()).image;
    } catch (reason) {
      warn(`getTransferableImage - failed: "${reason}".`);
      return null;
    } finally {
      decoder?.close();
    }
  }

  get isImageStream() {
    return true;
  }
}

export { JpegStream };
