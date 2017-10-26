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

import { createObjectURL, shadow } from '../shared/util';
import { DecodeStream } from './stream';
import { isDict } from './primitives';
import { JpegImage } from './jpg';

/**
 * Depending on the type of JPEG a JpegStream is handled in different ways. For
 * JPEG's that are supported natively such as DeviceGray and DeviceRGB the image
 * data is stored and then loaded by the browser.  For unsupported JPEG's we use
 * a library to decode these images and the stream behaves like all the other
 * DecodeStreams.
 */
var JpegStream = (function JpegStreamClosure() {
  function JpegStream(stream, maybeLength, dict, params) {
    // Some images may contain 'junk' before the SOI (start-of-image) marker.
    // Note: this seems to mainly affect inline images.
    var ch;
    while ((ch = stream.getByte()) !== -1) {
      if (ch === 0xFF) { // Find the first byte of the SOI marker (0xFFD8).
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

  Object.defineProperty(JpegStream.prototype, 'bytes', {
    get: function JpegStream_bytes() {
      // If this.maybeLength is null, we'll get the entire stream.
      return shadow(this, 'bytes', this.stream.getBytes(this.maybeLength));
    },
    configurable: true,
  });

  JpegStream.prototype.ensureBuffer = function JpegStream_ensureBuffer(req) {
    if (this.bufferLength) {
      return;
    }
    var jpegImage = new JpegImage();

    // Checking if values need to be transformed before conversion.
    var decodeArr = this.dict.getArray('Decode', 'D');
    if (this.forceRGB && Array.isArray(decodeArr)) {
      var bitsPerComponent = this.dict.get('BitsPerComponent') || 8;
      var decodeArrLength = decodeArr.length;
      var transform = new Int32Array(decodeArrLength);
      var transformNeeded = false;
      var maxValue = (1 << bitsPerComponent) - 1;
      for (var i = 0; i < decodeArrLength; i += 2) {
        transform[i] = ((decodeArr[i + 1] - decodeArr[i]) * 256) | 0;
        transform[i + 1] = (decodeArr[i] * maxValue) | 0;
        if (transform[i] !== 256 || transform[i + 1] !== 0) {
          transformNeeded = true;
        }
      }
      if (transformNeeded) {
        jpegImage.decodeTransform = transform;
      }
    }
    // Fetching the 'ColorTransform' entry, if it exists.
    if (isDict(this.params)) {
      var colorTransform = this.params.get('ColorTransform');
      if (Number.isInteger(colorTransform)) {
        jpegImage.colorTransform = colorTransform;
      }
    }

    jpegImage.parse(this.bytes);
    var data = jpegImage.getData(this.drawWidth, this.drawHeight,
                                 this.forceRGB);
    this.buffer = data;
    this.bufferLength = data.length;
    this.eof = true;
  };

  JpegStream.prototype.getBytes = function JpegStream_getBytes(length) {
    this.ensureBuffer();
    return this.buffer;
  };

  JpegStream.prototype.getIR = function JpegStream_getIR(forceDataSchema) {
    return createObjectURL(this.bytes, 'image/jpeg', forceDataSchema);
  };

  return JpegStream;
})();

export {
  JpegStream,
};
