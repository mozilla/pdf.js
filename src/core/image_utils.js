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

import { assert, info, shadow } from "../shared/util.js";
import { ColorSpace } from "./colorspace.js";
import { JpegStream } from "./jpeg_stream.js";
import { RefSetCache } from "./primitives.js";
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
      image.maybeValidDimensions &&
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
      .then(function ({ data, width, height }) {
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

class GlobalImageCache {
  static get NUM_PAGES_THRESHOLD() {
    return shadow(this, "NUM_PAGES_THRESHOLD", 2);
  }

  static get MAX_IMAGES_TO_CACHE() {
    return shadow(this, "MAX_IMAGES_TO_CACHE", 10);
  }

  constructor() {
    if (
      typeof PDFJSDev === "undefined" ||
      PDFJSDev.test("!PRODUCTION || TESTING")
    ) {
      assert(
        GlobalImageCache.NUM_PAGES_THRESHOLD > 1,
        "GlobalImageCache - invalid NUM_PAGES_THRESHOLD constant."
      );
    }
    this._refCache = new RefSetCache();
    this._imageCache = new RefSetCache();
  }

  shouldCache(ref, pageIndex) {
    const pageIndexSet = this._refCache.get(ref);
    const numPages = pageIndexSet
      ? pageIndexSet.size + (pageIndexSet.has(pageIndex) ? 0 : 1)
      : 1;

    if (numPages < GlobalImageCache.NUM_PAGES_THRESHOLD) {
      return false;
    }
    if (
      !this._imageCache.has(ref) &&
      this._imageCache.size >= GlobalImageCache.MAX_IMAGES_TO_CACHE
    ) {
      return false;
    }
    return true;
  }

  addPageIndex(ref, pageIndex) {
    let pageIndexSet = this._refCache.get(ref);
    if (!pageIndexSet) {
      pageIndexSet = new Set();
      this._refCache.put(ref, pageIndexSet);
    }
    pageIndexSet.add(pageIndex);
  }

  getData(ref, pageIndex) {
    if (!this._refCache.has(ref)) {
      return null;
    }
    const pageIndexSet = this._refCache.get(ref);

    if (pageIndexSet.size < GlobalImageCache.NUM_PAGES_THRESHOLD) {
      return null;
    }
    if (!this._imageCache.has(ref)) {
      return null;
    }
    // Ensure that we keep track of all pages containing the image reference.
    pageIndexSet.add(pageIndex);

    return this._imageCache.get(ref);
  }

  setData(ref, data) {
    if (!this._refCache.has(ref)) {
      throw new Error(
        'GlobalImageCache.setData - expected "addPageIndex" to have been called.'
      );
    }
    if (this._imageCache.has(ref)) {
      return;
    }
    if (this._imageCache.size >= GlobalImageCache.MAX_IMAGES_TO_CACHE) {
      info(
        "GlobalImageCache.setData - ignoring image above MAX_IMAGES_TO_CACHE."
      );
      return;
    }
    this._imageCache.put(ref, data);
  }

  clear(onlyData = false) {
    if (!onlyData) {
      this._refCache.clear();
    }
    this._imageCache.clear();
  }
}

export { NativeImageDecoder, GlobalImageCache };
