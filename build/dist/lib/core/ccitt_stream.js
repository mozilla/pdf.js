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
exports.CCITTFaxStream = void 0;

var _primitives = require("./primitives");

var _ccitt = require("./ccitt");

var _stream = require("./stream");

var CCITTFaxStream = function CCITTFaxStreamClosure() {
  function CCITTFaxStream(str, maybeLength, params) {
    this.str = str;
    this.dict = str.dict;

    if (!(0, _primitives.isDict)(params)) {
      params = _primitives.Dict.empty;
    }

    var source = {
      next: function next() {
        return str.getByte();
      }
    };
    this.ccittFaxDecoder = new _ccitt.CCITTFaxDecoder(source, {
      K: params.get('K'),
      EndOfLine: params.get('EndOfLine'),
      EncodedByteAlign: params.get('EncodedByteAlign'),
      Columns: params.get('Columns'),
      Rows: params.get('Rows'),
      EndOfBlock: params.get('EndOfBlock'),
      BlackIs1: params.get('BlackIs1')
    });

    _stream.DecodeStream.call(this, maybeLength);
  }

  CCITTFaxStream.prototype = Object.create(_stream.DecodeStream.prototype);

  CCITTFaxStream.prototype.readBlock = function () {
    while (!this.eof) {
      var c = this.ccittFaxDecoder.readNextChar();

      if (c === -1) {
        this.eof = true;
        return;
      }

      this.ensureBuffer(this.bufferLength + 1);
      this.buffer[this.bufferLength++] = c;
    }
  };

  return CCITTFaxStream;
}();

exports.CCITTFaxStream = CCITTFaxStream;