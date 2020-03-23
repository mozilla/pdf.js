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
exports.JpegStream = void 0;

var _util = require("../shared/util.js");

var _stream = require("./stream.js");

var _primitives = require("./primitives.js");

var _jpg = require("./jpg.js");

const JpegStream = function JpegStreamClosure() {
  function JpegStream(stream, maybeLength, dict, params) {
    let ch;

    while ((ch = stream.getByte()) !== -1) {
      if (ch === 0xff) {
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
  Object.defineProperty(JpegStream.prototype, "bytes", {
    get: function JpegStream_bytes() {
      return (0, _util.shadow)(this, "bytes", this.stream.getBytes(this.maybeLength));
    },
    configurable: true
  });

  JpegStream.prototype.ensureBuffer = function (requested) {};

  JpegStream.prototype.readBlock = function () {
    if (this.eof) {
      return;
    }

    const jpegOptions = {
      decodeTransform: undefined,
      colorTransform: undefined
    };
    const decodeArr = this.dict.getArray("Decode", "D");

    if (this.forceRGB && Array.isArray(decodeArr)) {
      const bitsPerComponent = this.dict.get("BitsPerComponent") || 8;
      const decodeArrLength = decodeArr.length;
      const transform = new Int32Array(decodeArrLength);
      let transformNeeded = false;
      const maxValue = (1 << bitsPerComponent) - 1;

      for (let i = 0; i < decodeArrLength; i += 2) {
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
      const colorTransform = this.params.get("ColorTransform");

      if (Number.isInteger(colorTransform)) {
        jpegOptions.colorTransform = colorTransform;
      }
    }

    const jpegImage = new _jpg.JpegImage(jpegOptions);
    jpegImage.parse(this.bytes);
    const data = jpegImage.getData({
      width: this.drawWidth,
      height: this.drawHeight,
      forceRGB: this.forceRGB,
      isSourcePDF: true
    });
    this.buffer = data;
    this.bufferLength = data.length;
    this.eof = true;
  };

  Object.defineProperty(JpegStream.prototype, "maybeValidDimensions", {
    get: function JpegStream_maybeValidDimensions() {
      const {
        dict,
        stream
      } = this;
      const dictHeight = dict.get("Height", "H");
      const startPos = stream.pos;
      let validDimensions = true,
          foundSOF = false,
          b;

      while ((b = stream.getByte()) !== -1) {
        if (b !== 0xff) {
          continue;
        }

        switch (stream.getByte()) {
          case 0xc0:
          case 0xc1:
          case 0xc2:
            foundSOF = true;
            stream.pos += 2;
            stream.pos += 1;
            const scanLines = stream.getUint16();

            if (scanLines === dictHeight) {
              break;
            }

            if (scanLines === 0) {
              validDimensions = false;
              break;
            }

            if (scanLines > dictHeight * 10) {
              validDimensions = false;
              break;
            }

            break;

          case 0xc3:
          case 0xc5:
          case 0xc6:
          case 0xc7:
          case 0xc9:
          case 0xca:
          case 0xcb:
          case 0xcd:
          case 0xce:
          case 0xcf:
            foundSOF = true;
            break;

          case 0xc4:
          case 0xcc:
          case 0xda:
          case 0xdb:
          case 0xdc:
          case 0xdd:
          case 0xde:
          case 0xdf:
          case 0xe0:
          case 0xe1:
          case 0xe2:
          case 0xe3:
          case 0xe4:
          case 0xe5:
          case 0xe6:
          case 0xe7:
          case 0xe8:
          case 0xe9:
          case 0xea:
          case 0xeb:
          case 0xec:
          case 0xed:
          case 0xee:
          case 0xef:
          case 0xfe:
            const markerLength = stream.getUint16();

            if (markerLength > 2) {
              stream.skip(markerLength - 2);
            } else {
              stream.skip(-2);
            }

            break;

          case 0xff:
            stream.skip(-1);
            break;

          case 0xd9:
            foundSOF = true;
            break;
        }

        if (foundSOF) {
          break;
        }
      }

      stream.pos = startPos;
      return (0, _util.shadow)(this, "maybeValidDimensions", validDimensions);
    },
    configurable: true
  });

  JpegStream.prototype.getIR = function (forceDataSchema = false) {
    return (0, _util.createObjectURL)(this.bytes, "image/jpeg", forceDataSchema);
  };

  return JpegStream;
}();

exports.JpegStream = JpegStream;