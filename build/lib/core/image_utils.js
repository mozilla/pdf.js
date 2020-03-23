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
exports.NativeImageDecoder = void 0;

var _colorspace = require("./colorspace.js");

var _jpeg_stream = require("./jpeg_stream.js");

var _stream = require("./stream.js");

class NativeImageDecoder {
  constructor({
    xref,
    resources,
    handler,
    forceDataSchema = false,
    pdfFunctionFactory
  }) {
    this.xref = xref;
    this.resources = resources;
    this.handler = handler;
    this.forceDataSchema = forceDataSchema;
    this.pdfFunctionFactory = pdfFunctionFactory;
  }

  canDecode(image) {
    return image instanceof _jpeg_stream.JpegStream && NativeImageDecoder.isDecodable(image, this.xref, this.resources, this.pdfFunctionFactory) && image.maybeValidDimensions;
  }

  decode(image) {
    const dict = image.dict;
    let colorSpace = dict.get("ColorSpace", "CS");
    colorSpace = _colorspace.ColorSpace.parse(colorSpace, this.xref, this.resources, this.pdfFunctionFactory);
    return this.handler.sendWithPromise("JpegDecode", [image.getIR(this.forceDataSchema), colorSpace.numComps]).then(function ({
      data,
      width,
      height
    }) {
      return new _stream.Stream(data, 0, data.length, dict);
    });
  }

  static isSupported(image, xref, res, pdfFunctionFactory) {
    const dict = image.dict;

    if (dict.has("DecodeParms") || dict.has("DP")) {
      return false;
    }

    const cs = _colorspace.ColorSpace.parse(dict.get("ColorSpace", "CS"), xref, res, pdfFunctionFactory);

    return (cs.name === "DeviceGray" || cs.name === "DeviceRGB") && cs.isDefaultDecode(dict.getArray("Decode", "D"));
  }

  static isDecodable(image, xref, res, pdfFunctionFactory) {
    const dict = image.dict;

    if (dict.has("DecodeParms") || dict.has("DP")) {
      return false;
    }

    const cs = _colorspace.ColorSpace.parse(dict.get("ColorSpace", "CS"), xref, res, pdfFunctionFactory);

    const bpc = dict.get("BitsPerComponent", "BPC") || 1;
    return (cs.numComps === 1 || cs.numComps === 3) && cs.isDefaultDecode(dict.getArray("Decode", "D"), bpc);
  }

}

exports.NativeImageDecoder = NativeImageDecoder;