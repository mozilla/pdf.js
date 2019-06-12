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
exports.Jbig2Stream = void 0;

var _primitives = require("./primitives");

var _stream = require("./stream");

var _jbig = require("./jbig2");

var _util = require("../shared/util");

var Jbig2Stream = function Jbig2StreamClosure() {
  function Jbig2Stream(stream, maybeLength, dict, params) {
    this.stream = stream;
    this.maybeLength = maybeLength;
    this.dict = dict;
    this.params = params;

    _stream.DecodeStream.call(this, maybeLength);
  }

  Jbig2Stream.prototype = Object.create(_stream.DecodeStream.prototype);
  Object.defineProperty(Jbig2Stream.prototype, 'bytes', {
    get: function get() {
      return (0, _util.shadow)(this, 'bytes', this.stream.getBytes(this.maybeLength));
    },
    configurable: true
  });

  Jbig2Stream.prototype.ensureBuffer = function (requested) {};

  Jbig2Stream.prototype.readBlock = function () {
    if (this.eof) {
      return;
    }

    var jbig2Image = new _jbig.Jbig2Image();
    var chunks = [];

    if ((0, _primitives.isDict)(this.params)) {
      var globalsStream = this.params.get('JBIG2Globals');

      if ((0, _primitives.isStream)(globalsStream)) {
        var globals = globalsStream.getBytes();
        chunks.push({
          data: globals,
          start: 0,
          end: globals.length
        });
      }
    }

    chunks.push({
      data: this.bytes,
      start: 0,
      end: this.bytes.length
    });
    var data = jbig2Image.parseChunks(chunks);
    var dataLength = data.length;

    for (var i = 0; i < dataLength; i++) {
      data[i] ^= 0xFF;
    }

    this.buffer = data;
    this.bufferLength = dataLength;
    this.eof = true;
  };

  return Jbig2Stream;
}();

exports.Jbig2Stream = Jbig2Stream;