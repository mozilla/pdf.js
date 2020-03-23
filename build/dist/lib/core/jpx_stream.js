/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.JpxStream = void 0;

var _stream = require("./stream.js");

var _jpx = require("./jpx.js");

var _util = require("../shared/util.js");

const JpxStream = function JpxStreamClosure() {
  function JpxStream(stream, maybeLength, dict, params) {
    this.stream = stream;
    this.maybeLength = maybeLength;
    this.dict = dict;
    this.params = params;

    _stream.DecodeStream.call(this, maybeLength);
  }

  JpxStream.prototype = Object.create(_stream.DecodeStream.prototype);
  Object.defineProperty(JpxStream.prototype, "bytes", {
    get: function JpxStream_bytes() {
      return (0, _util.shadow)(this, "bytes", this.stream.getBytes(this.maybeLength));
    },
    configurable: true
  });

  JpxStream.prototype.ensureBuffer = function (requested) {};

  JpxStream.prototype.readBlock = function () {
    if (this.eof) {
      return;
    }

    const jpxImage = new _jpx.JpxImage();
    jpxImage.parse(this.bytes);
    const width = jpxImage.width;
    const height = jpxImage.height;
    const componentsCount = jpxImage.componentsCount;
    const tileCount = jpxImage.tiles.length;

    if (tileCount === 1) {
      this.buffer = jpxImage.tiles[0].items;
    } else {
      const data = new Uint8ClampedArray(width * height * componentsCount);

      for (let k = 0; k < tileCount; k++) {
        const tileComponents = jpxImage.tiles[k];
        const tileWidth = tileComponents.width;
        const tileHeight = tileComponents.height;
        const tileLeft = tileComponents.left;
        const tileTop = tileComponents.top;
        const src = tileComponents.items;
        let srcPosition = 0;
        let dataPosition = (width * tileTop + tileLeft) * componentsCount;
        const imgRowSize = width * componentsCount;
        const tileRowSize = tileWidth * componentsCount;

        for (let j = 0; j < tileHeight; j++) {
          const rowBytes = src.subarray(srcPosition, srcPosition + tileRowSize);
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
}();

exports.JpxStream = JpxStream;