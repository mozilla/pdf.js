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
exports.JpegStream = void 0;

var _util = require("../shared/util");

var _stream = require("./stream");

var _primitives = require("./primitives");

var _jpg = require("./jpg");

var JpegStream = function JpegStreamClosure() {
  function JpegStream(stream, maybeLength, dict, params) {
    var ch;

    while ((ch = stream.getByte()) !== -1) {
      if (ch === 0xFF) {
        stream.skip(-1);
        break;
      }
    }

    this.stream = stream;
    this.maybeLength = maybeLength;
    this.dict = dict;
    this.params = params;

    _stream.DecodeStream.call(this, maybeLength);
  }

  JpegStream.prototype = Object.create(_stream.DecodeStream.prototype);
  Object.defineProperty(JpegStream.prototype, 'bytes', {
    get: function JpegStream_bytes() {
      return (0, _util.shadow)(this, 'bytes', this.stream.getBytes(this.maybeLength));
    },
    configurable: true
  });

  JpegStream.prototype.ensureBuffer = function (requested) {};

  JpegStream.prototype.readBlock = function () {
    if (this.eof) {
      return;
    }

    var jpegOptions = {
      decodeTransform: undefined,
      colorTransform: undefined
    };
    var decodeArr = this.dict.getArray('Decode', 'D');

    if (this.forceRGB && Array.isArray(decodeArr)) {
      var bitsPerComponent = this.dict.get('BitsPerComponent') || 8;
      var decodeArrLength = decodeArr.length;
      var transform = new Int32Array(decodeArrLength);
      var transformNeeded = false;
      var maxValue = (1 << bitsPerComponent) - 1;

      for (var i = 0; i < decodeArrLength; i += 2) {
        transform[i] = (decodeArr[i + 1] - decodeArr[i]) * 256 | 0;
        transform[i + 1] = decodeArr[i] * maxValue | 0;

        if (transform[i] !== 256 || transform[i + 1] !== 0) {
          transformNeeded = true;
        }
      }

      if (transformNeeded) {
        jpegOptions.decodeTransform = transform;
      }
    }

    if ((0, _primitives.isDict)(this.params)) {
      var colorTransform = this.params.get('ColorTransform');

      if (Number.isInteger(colorTransform)) {
        jpegOptions.colorTransform = colorTransform;
      }
    }

    var jpegImage = new _jpg.JpegImage(jpegOptions);
    jpegImage.parse(this.bytes);
    var data = jpegImage.getData({
      width: this.drawWidth,
      height: this.drawHeight,
      forceRGB: this.forceRGB,
      isSourcePDF: true
    });
    this.buffer = data;
    this.bufferLength = data.length;
    this.eof = true;
  };

  JpegStream.prototype.getIR = function () {
    var forceDataSchema = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;
    return (0, _util.createObjectURL)(this.bytes, 'image/jpeg', forceDataSchema);
  };

  return JpegStream;
}();

exports.JpegStream = JpegStream;