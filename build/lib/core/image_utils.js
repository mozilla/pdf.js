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
exports.NativeImageDecoder = void 0;

var _colorspace = require("./colorspace");

var _jpeg_stream = require("./jpeg_stream");

var _stream = require("./stream");

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var NativeImageDecoder =
/*#__PURE__*/
function () {
  function NativeImageDecoder(_ref) {
    var xref = _ref.xref,
        resources = _ref.resources,
        handler = _ref.handler,
        _ref$forceDataSchema = _ref.forceDataSchema,
        forceDataSchema = _ref$forceDataSchema === void 0 ? false : _ref$forceDataSchema,
        pdfFunctionFactory = _ref.pdfFunctionFactory;

    _classCallCheck(this, NativeImageDecoder);

    this.xref = xref;
    this.resources = resources;
    this.handler = handler;
    this.forceDataSchema = forceDataSchema;
    this.pdfFunctionFactory = pdfFunctionFactory;
  }

  _createClass(NativeImageDecoder, [{
    key: "canDecode",
    value: function canDecode(image) {
      return image instanceof _jpeg_stream.JpegStream && NativeImageDecoder.isDecodable(image, this.xref, this.resources, this.pdfFunctionFactory);
    }
  }, {
    key: "decode",
    value: function decode(image) {
      var dict = image.dict;
      var colorSpace = dict.get('ColorSpace', 'CS');
      colorSpace = _colorspace.ColorSpace.parse(colorSpace, this.xref, this.resources, this.pdfFunctionFactory);
      return this.handler.sendWithPromise('JpegDecode', [image.getIR(this.forceDataSchema), colorSpace.numComps]).then(function (_ref2) {
        var data = _ref2.data,
            width = _ref2.width,
            height = _ref2.height;
        return new _stream.Stream(data, 0, data.length, dict);
      });
    }
  }], [{
    key: "isSupported",
    value: function isSupported(image, xref, res, pdfFunctionFactory) {
      var dict = image.dict;

      if (dict.has('DecodeParms') || dict.has('DP')) {
        return false;
      }

      var cs = _colorspace.ColorSpace.parse(dict.get('ColorSpace', 'CS'), xref, res, pdfFunctionFactory);

      return (cs.name === 'DeviceGray' || cs.name === 'DeviceRGB') && cs.isDefaultDecode(dict.getArray('Decode', 'D'));
    }
  }, {
    key: "isDecodable",
    value: function isDecodable(image, xref, res, pdfFunctionFactory) {
      var dict = image.dict;

      if (dict.has('DecodeParms') || dict.has('DP')) {
        return false;
      }

      var cs = _colorspace.ColorSpace.parse(dict.get('ColorSpace', 'CS'), xref, res, pdfFunctionFactory);

      var bpc = dict.get('BitsPerComponent', 'BPC') || 1;
      return (cs.numComps === 1 || cs.numComps === 3) && cs.isDefaultDecode(dict.getArray('Decode', 'D'), bpc);
    }
  }]);

  return NativeImageDecoder;
}();

exports.NativeImageDecoder = NativeImageDecoder;