/* Copyright 2019 Mozilla Foundation
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
/* eslint no-var: error */

import { ColorSpace } from "./colorspace.js";
import { JpegStream } from "./jpeg_stream.js";
import { Stream } from "./stream.js";

class NativeImageDecoder {
  constructor({
    xref,
    resources,
    handler,
    forceDataSchema = false,
    pdfFunctionFactory,
  }) {
    this.xref = xref;
    this.resources = resources;
    this.handler = handler;
    this.forceDataSchema = forceDataSchema;
    this.pdfFunctionFactory = pdfFunctionFactory;
  }

  canDecode(image) {
    return (
      image instanceof JpegStream &&
      NativeImageDecoder.isDecodable(
        image,
        this.xref,
        this.resources,
        this.pdfFunctionFactory
      )
    );
  }

  decode(image) {
    // For natively supported JPEGs send them to the main thread for decoding.
    const dict = image.dict;
    let colorSpace = dict.get("ColorSpace", "CS");
    colorSpace = ColorSpace.parse(
      colorSpace,
      this.xref,
      this.resources,
      this.pdfFunctionFactory
    );

    return this.handler
      .sendWithPromise("JpegDecode", [
        image.getIR(this.forceDataSchema),
        colorSpace.numComps,
      ])
      .then(function({ data, width, height }) {
        return new Stream(data, 0, data.length, dict);
      });
  }

  /**
   * Checks if the image can be decoded and displayed by the browser without any
   * further processing such as color space conversions.
   */
  static isSupported(image, xref, res, pdfFunctionFactory) {
    const dict = image.dict;
    if (dict.has("DecodeParms") || dict.has("DP")) {
      return false;
    }
    const cs = ColorSpace.parse(
      dict.get("ColorSpace", "CS"),
      xref,
      res,
      pdfFunctionFactory
    );
    // isDefaultDecode() of DeviceGray and DeviceRGB needs no `bpc` argument.
    return (
      (cs.name === "DeviceGray" || cs.name === "DeviceRGB") &&
      cs.isDefaultDecode(dict.getArray("Decode", "D"))
    );
  }

  /**
   * Checks if the image can be decoded by the browser.
   */
  static isDecodable(image, xref, res, pdfFunctionFactory) {
    const dict = image.dict;
    if (dict.has("DecodeParms") || dict.has("DP")) {
      return false;
    }
    const cs = ColorSpace.parse(
      dict.get("ColorSpace", "CS"),
      xref,
      res,
      pdfFunctionFactory
    );
    const bpc = dict.get("BitsPerComponent", "BPC") || 1;
    return (
      (cs.numComps === 1 || cs.numComps === 3) &&
      cs.isDefaultDecode(dict.getArray("Decode", "D"), bpc)
    );
  }
}

export { NativeImageDecoder };
