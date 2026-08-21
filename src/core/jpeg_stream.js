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

import { FeatureTest, shadow, warn } from "../shared/util.js";
import { DecodeStream } from "./decode_stream.js";
import { Dict } from "./primitives.js";
import { ImageResizer } from "./image_resizer.js";
import { JpegImage } from "./jpg.js";

/**
 * For JPEG's we use a library to decode these images and the stream behaves
 * like all the other DecodeStreams.
 */
class JpegStream extends DecodeStream {
  static #isImageDecoderSupported = FeatureTest.isImageDecoderSupported;

  constructor(stream, maybeLength, params) {
    super(maybeLength);

    this.stream = stream;
    this.dict = stream.dict;
    this.maybeLength = maybeLength;
    this.params = params;
  }

  static get canUseImageDecoder() {
    return shadow(
      this,
      "canUseImageDecoder",
      this.#isImageDecoderSupported
        ? ImageDecoder.isTypeSupported("image/jpeg")
        : Promise.resolve(false)
    );
  }

  static setOptions({ isImageDecoderSupported = false }) {
    this.#isImageDecoderSupported = isImageDecoderSupported;
  }

  get bytes() {
    // If `this.maybeLength` is null, we'll get the entire stream.
    return shadow(this, "bytes", this.stream.getBytes(this.maybeLength));
  }

  ensureBuffer(requested) {
    // No-op, since `this.readBlock` will always parse the entire image and
    // directly insert all of its data into `this.buffer`.
  }

  readBlock() {
    this.decodeImage();
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

  decodeImage(bytes) {
    if (this.eof) {
      return this.buffer;
    }
    bytes = this.#skipUselessBytes(bytes || this.bytes);

    // TODO: if an image has a mask we need to combine the data.
    // So ideally get a VideoFrame from getTransferableImage and then use
    // copyTo.

    const jpegImage = new JpegImage(this.jpegOptions);
    jpegImage.parse(bytes);
    const data = jpegImage.getData({
      width: this.drawWidth,
      height: this.drawHeight,
      forceRGBA: this.forceRGBA,
      forceRGB: this.forceRGB,
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
    if (!(await JpegStream.canUseImageDecoder)) {
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
      const useImageDecoder = JpegImage.canUseImageDecoder(
        data,
        jpegOptions.colorTransform
      );
      if (!useImageDecoder) {
        return null;
      }
      if (
        useImageDecoder.width !== width ||
        useImageDecoder.height !== height
      ) {
        // The SOF dimensions disagree with the image dictionary, e.g. because
        // the height is only known from a DNL marker or because the scan simply
        // ends early (issue15492.pdf). `ImageDecoder` reports and scales the
        // frame according to the SOF, so let our own decoder, which honours the
        // actual JPEG image data, handle the image instead.
        return null;
      }
      if (useImageDecoder.exifStart) {
        // Replace the entire EXIF-block with dummy data, to ensure that a
        // non-default EXIF orientation won't cause the image to be rotated
        // when using `ImageDecoder` (fixes bug1942064.pdf).
        //
        // Copy the data first, to avoid modifying the original PDF document.
        data = data.slice();
        data.fill(0x00, useImageDecoder.exifStart, useImageDecoder.exifEnd);
      }
      const init = {
        data,
        type: "image/jpeg",
        preferAnimation: false,
      };
      // Request reduced dimensions; ImageDecoder treats them as best-effort.
      const reducePower = ImageResizer.getReducePower(width, height);
      if (reducePower) {
        const factor = 2 ** reducePower;
        init.desiredWidth = Math.ceil(width / factor);
        init.desiredHeight = Math.ceil(height / factor);
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
