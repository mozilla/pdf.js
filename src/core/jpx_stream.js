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

import { DecodeStream } from './stream';
import { JpxImage } from './jpx';
import { shadow } from '../shared/util';

/**
 * For JPEG 2000's we use a library to decode these images and
 * the stream behaves like all the other DecodeStreams.
 */
var JpxStream = (function JpxStreamClosure() {
  function JpxStream(stream, maybeLength, dict, params) {
    this.stream = stream;
    this.maybeLength = maybeLength;
    this.dict = dict;
    this.params = params;

    DecodeStream.call(this, maybeLength);
  }

  JpxStream.prototype = Object.create(DecodeStream.prototype);

  Object.defineProperty(JpxStream.prototype, 'bytes', {
    get: function JpxStream_bytes() {
      // If this.maybeLength is null, we'll get the entire stream.
      return shadow(this, 'bytes', this.stream.getBytes(this.maybeLength));
    },
    configurable: true,
  });

  JpxStream.prototype.ensureBuffer = function JpxStream_ensureBuffer(req) {
    if (this.bufferLength) {
      return;
    }

    var jpxImage = new JpxImage();
    jpxImage.parse(this.bytes);

    var width = jpxImage.width;
    var height = jpxImage.height;
    var componentsCount = jpxImage.componentsCount;
    var tileCount = jpxImage.tiles.length;
    if (tileCount === 1) {
      this.buffer = jpxImage.tiles[0].items;
    } else {
      var data = new Uint8ClampedArray(width * height * componentsCount);

      for (var k = 0; k < tileCount; k++) {
        var tileComponents = jpxImage.tiles[k];
        var tileWidth = tileComponents.width;
        var tileHeight = tileComponents.height;
        var tileLeft = tileComponents.left;
        var tileTop = tileComponents.top;

        var src = tileComponents.items;
        var srcPosition = 0;
        var dataPosition = (width * tileTop + tileLeft) * componentsCount;
        var imgRowSize = width * componentsCount;
        var tileRowSize = tileWidth * componentsCount;

        for (var j = 0; j < tileHeight; j++) {
          var rowBytes = src.subarray(srcPosition, srcPosition + tileRowSize);
          data.set(rowBytes, dataPosition);
          srcPosition += tileRowSize;
          dataPosition += imgRowSize;
        }
      }
      this.buffer = data;
    }
    this.bufferLength = this.buffer.length;
    this.eof = true;
  };

  return JpxStream;
})();

export {
  JpxStream,
};
