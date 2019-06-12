/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2019 Mozilla Foundation
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

var _stream = require("./stream");

var _jpx = require("./jpx");

var _util = require("../shared/util");

var JpxStream = function JpxStreamClosure() {
  function JpxStream(stream, maybeLength, dict, params) {
    this.stream = stream;
    this.maybeLength = maybeLength;
    this.dict = dict;
    this.params = params;

    _stream.DecodeStream.call(this, maybeLength);
  }

  JpxStream.prototype = Object.create(_stream.DecodeStream.prototype);
  Object.defineProperty(JpxStream.prototype, 'bytes', {
    get: function JpxStream_bytes() {
      return (0, _util.shadow)(this, 'bytes', this.stream.getBytes(this.maybeLength));
    },
    configurable: true
  });

  JpxStream.prototype.ensureBuffer = function (requested) {};

  JpxStream.prototype.readBlock = function () {
    if (this.eof) {
      return;
    }

    var jpxImage = new _jpx.JpxImage();
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
}();

exports.JpxStream = JpxStream;