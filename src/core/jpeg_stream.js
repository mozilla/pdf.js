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

import { createObjectURL, shadow } from "../shared/util.js";
import { DecodeStream } from "./stream.js";
import { isDict } from "./primitives.js";
import { JpegImage } from "./jpg.js";

/**
 * Depending on the type of JPEG a JpegStream is handled in different ways. For
 * JPEG's that are supported natively such as DeviceGray and DeviceRGB the image
 * data is stored and then loaded by the browser. For unsupported JPEG's we use
 * a library to decode these images and the stream behaves like all the other
 * DecodeStreams.
 */
const JpegStream = (function JpegStreamClosure() {
  // eslint-disable-next-line no-shadow
  function JpegStream(stream, maybeLength, dict, params) {
    // Some images may contain 'junk' before the SOI (start-of-image) marker.
    // Note: this seems to mainly affect inline images.
    let ch;
    while ((ch = stream.getByte()) !== -1) {
      // Find the first byte of the SOI marker (0xFFD8).
      if (ch === 0xff) {
        stream.skip(-1); // Reset the stream position to the SOI.
        break;
      }
    }
    this.stream = stream;
    this.maybeLength = maybeLength;
    this.dict = dict;
    this.params = params;

    DecodeStream.call(this, maybeLength);
  }

  JpegStream.prototype = Object.create(DecodeStream.prototype);

  Object.defineProperty(JpegStream.prototype, "bytes", {
    get: function JpegStream_bytes() {
      // If `this.maybeLength` is null, we'll get the entire stream.
      return shadow(this, "bytes", this.stream.getBytes(this.maybeLength));
    },
    configurable: true,
  });

  JpegStream.prototype.ensureBuffer = function (requested) {
    // No-op, since `this.readBlock` will always parse the entire image and
    // directly insert all of its data into `this.buffer`.
  };

  JpegStream.prototype.readBlock = function () {
    if (this.eof) {
      return;
    }
    const jpegOptions = {
      decodeTransform: undefined,
      colorTransform: undefined,
    };

    // Checking if values need to be transformed before conversion.
    const decodeArr = this.dict.getArray("Decode", "D");
    if (this.forceRGB && Array.isArray(decodeArr)) {
      const bitsPerComponent = this.dict.get("BitsPerComponent") || 8;
      const decodeArrLength = decodeArr.length;
      const transform = new Int32Array(decodeArrLength);
      let transformNeeded = false;
      const maxValue = (1 << bitsPerComponent) - 1;
      for (let i = 0; i < decodeArrLength; i += 2) {
        transform[i] = ((decodeArr[i + 1] - decodeArr[i]) * 256) | 0;
        transform[i + 1] = (decodeArr[i] * maxValue) | 0;
        if (transform[i] !== 256 || transform[i + 1] !== 0) {
          transformNeeded = true;
        }
      }
      if (transformNeeded) {
        jpegOptions.decodeTransform = transform;
      }
    }
    // Fetching the 'ColorTransform' entry, if it exists.
    if (isDict(this.params)) {
      const colorTransform = this.params.get("ColorTransform");
      if (Number.isInteger(colorTransform)) {
        jpegOptions.colorTransform = colorTransform;
      }
    }
    const jpegImage = new JpegImage(jpegOptions);

    jpegImage.parse(this.bytes);
    const data = jpegImage.getData({
      width: this.drawWidth,
      height: this.drawHeight,
      forceRGB: this.forceRGB,
      isSourcePDF: true,
    });
    this.buffer = data;
    this.bufferLength = data.length;
    this.eof = true;
  };

  Object.defineProperty(JpegStream.prototype, "maybeValidDimensions", {
    get: function JpegStream_maybeValidDimensions() {
      const { dict, stream } = this;
      const dictHeight = dict.get("Height", "H");
      const startPos = stream.pos;

      let validDimensions = true,
        foundSOF = false,
        b;
      while ((b = stream.getByte()) !== -1) {
        if (b !== 0xff) {
          // Not a valid marker.
          continue;
        }
        switch (stream.getByte()) {
          case 0xc0: // SOF0
          case 0xc1: // SOF1
          case 0xc2: // SOF2
            // These three SOF{n} markers are the only ones that the built-in
            // PDF.js JPEG decoder currently supports.
            foundSOF = true;

            stream.pos += 2; // Skip marker length.
            stream.pos += 1; // Skip precision.
            const scanLines = stream.getUint16();
            const samplesPerLine = stream.getUint16();

            // Letting the browser handle the JPEG decoding, on the main-thread,
            // will cause a *large* increase in peak memory usage since there's
            // a handful of short-lived copies of the image data. For very big
            // JPEG images, always let the PDF.js image decoder handle them to
            // reduce overall memory usage during decoding (see issue 11694).
            if (scanLines * samplesPerLine > 1e6) {
              validDimensions = false;
              break;
            }

            // The "normal" case, where the image data and dictionary agrees.
            if (scanLines === dictHeight) {
              break;
            }
            // A DNL (Define Number of Lines) marker is expected,
            // which browsers (usually) cannot decode natively.
            if (scanLines === 0) {
              validDimensions = false;
              break;
            }
            // The dimensions of the image, among other properties, should
            // always be taken from the image data *itself* rather than the
            // XObject dictionary. However there's cases of corrupt images that
            // browsers cannot decode natively, for example:
            //  - JPEG images with DNL markers, where the SOF `scanLines`
            //    parameter has an unexpected value (see issue 8614).
            //  - JPEG images with too large SOF `scanLines` parameter, where
            //    the EOI marker is encountered prematurely (see issue 10880).
            // In an attempt to handle these kinds of corrupt images, compare
            // the dimensions in the image data with the dictionary and *always*
            // let the PDF.js JPEG decoder (rather than the browser) handle the
            // image if the difference is larger than one order of magnitude
            // (since that would generally suggest that something is off).
            if (scanLines > dictHeight * 10) {
              validDimensions = false;
              break;
            }
            break;

          case 0xc3: // SOF3
          /* falls through */
          case 0xc5: // SOF5
          case 0xc6: // SOF6
          case 0xc7: // SOF7
          /* falls through */
          case 0xc9: // SOF9
          case 0xca: // SOF10
          case 0xcb: // SOF11
          /* falls through */
          case 0xcd: // SOF13
          case 0xce: // SOF14
          case 0xcf: // SOF15
            foundSOF = true;
            break;

          case 0xc4: // DHT
          case 0xcc: // DAC
          /* falls through */
          case 0xda: // SOS
          case 0xdb: // DQT
          case 0xdc: // DNL
          case 0xdd: // DRI
          case 0xde: // DHP
          case 0xdf: // EXP
          /* falls through */
          case 0xe0: // APP0
          case 0xe1: // APP1
          case 0xe2: // APP2
          case 0xe3: // APP3
          case 0xe4: // APP4
          case 0xe5: // APP5
          case 0xe6: // APP6
          case 0xe7: // APP7
          case 0xe8: // APP8
          case 0xe9: // APP9
          case 0xea: // APP10
          case 0xeb: // APP11
          case 0xec: // APP12
          case 0xed: // APP13
          case 0xee: // APP14
          case 0xef: // APP15
          /* falls through */
          case 0xfe: // COM
            const markerLength = stream.getUint16();
            if (markerLength > 2) {
              stream.skip(markerLength - 2); // Jump to the next marker.
            } else {
              // The marker length is invalid, resetting the stream position.
              stream.skip(-2);
            }
            break;

          case 0xff: // Fill byte.
            // Avoid skipping a valid marker, resetting the stream position.
            stream.skip(-1);
            break;

          case 0xd9: // EOI
            foundSOF = true;
            break;
        }
        if (foundSOF) {
          break;
        }
      }
      // Finally, don't forget to reset the stream position.
      stream.pos = startPos;

      return shadow(this, "maybeValidDimensions", validDimensions);
    },
    configurable: true,
  });

  JpegStream.prototype.getIR = function (forceDataSchema = false) {
    return createObjectURL(this.bytes, "image/jpeg", forceDataSchema);
  };

  return JpegStream;
})();

export { JpegStream };
