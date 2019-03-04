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

import { assert, OPS, warn } from '../shared/util';
import { ColorSpace } from './colorspace';
import { JpegStream } from './jpeg_stream';
import { Stream } from './stream';

class NativeImageDecoder {
  constructor({ xref, resources, handler, forceDataSchema = false,
                pdfFunctionFactory, }) {
    this.xref = xref;
    this.resources = resources;
    this.handler = handler;
    this.forceDataSchema = forceDataSchema;
    this.pdfFunctionFactory = pdfFunctionFactory;
  }

  canDecode(image) {
    return image instanceof JpegStream &&
           NativeImageDecoder.isDecodable(image, this.xref, this.resources,
                                          this.pdfFunctionFactory);
  }

  decode(image) {
    // For natively supported JPEGs send them to the main thread for decoding.
    const dict = image.dict;
    let colorSpace = dict.get('ColorSpace', 'CS');
    colorSpace = ColorSpace.parse(colorSpace, this.xref, this.resources,
                                  this.pdfFunctionFactory);

    return this.handler.sendWithPromise('JpegDecode', [
      image.getIR(this.forceDataSchema), colorSpace.numComps
    ]).then(function({ data, width, height, }) {
      return new Stream(data, 0, data.length, dict);
    });
  }

  /**
   * Checks if the image can be decoded and displayed by the browser without any
   * further processing such as color space conversions.
   */
  static isSupported(image, xref, res, pdfFunctionFactory) {
    const dict = image.dict;
    if (dict.has('DecodeParms') || dict.has('DP')) {
      return false;
    }
    const cs = ColorSpace.parse(dict.get('ColorSpace', 'CS'), xref, res,
                                pdfFunctionFactory);
    // isDefaultDecode() of DeviceGray and DeviceRGB needs no `bpc` argument.
    return (cs.name === 'DeviceGray' || cs.name === 'DeviceRGB') &&
           cs.isDefaultDecode(dict.getArray('Decode', 'D'));
  }

  /**
   * Checks if the image can be decoded by the browser.
   */
  static isDecodable(image, xref, res, pdfFunctionFactory) {
    const dict = image.dict;
    if (dict.has('DecodeParms') || dict.has('DP')) {
      return false;
    }
    const cs = ColorSpace.parse(dict.get('ColorSpace', 'CS'), xref, res,
                                pdfFunctionFactory);
    const bpc = dict.get('BitsPerComponent', 'BPC') || 1;
    return (cs.numComps === 1 || cs.numComps === 3) &&
           cs.isDefaultDecode(dict.getArray('Decode', 'D'), bpc);
  }
}

const ImageCacheKind = {
  NON_EXISTING: 0,
  EXISTING: 1,
  NEEDS_RESIZING: 2,
};

class ImageCache {
  constructor({ handler, pageIndex, transform = null, }) {
    this._handler = handler;
    this._pageIndex = pageIndex;
    this._transform = transform;
    this._cache = Object.create(null);
  }

  get({ key, }) {
    if (typeof PDFJSDev === 'undefined' ||
        PDFJSDev.test('!PRODUCTION || TESTING')) {
      assert(typeof key === 'string' && key.length > 0,
             'ImageCache.get: Invalid `key` parameter.');
    }
    const cacheEntry = this._cache[key];

    if (cacheEntry === undefined) {
      return null;
    }
    return {
      fn: cacheEntry.fn,
      args: cacheEntry.args,
    };
  }

  getKind({ key, ctm, }) {
    if (typeof PDFJSDev === 'undefined' ||
        PDFJSDev.test('!PRODUCTION || TESTING')) {
      assert(typeof key === 'string' && key.length > 0,
             'ImageCache.getKind: Invalid `key` parameter.');

      assert(typeof ctm === 'object' && ctm.length === 6,
             'ImageCache.getKind: Invalid `ctm` parameter.');
    }
    const cacheEntry = this._cache[key];

    if (cacheEntry === undefined) {
      return ImageCacheKind.NON_EXISTING;
    }
    return ImageCacheKind.EXISTING;
  }

  set({ key, fn, args, dimensions, }) {
    if (typeof PDFJSDev === 'undefined' ||
        PDFJSDev.test('!PRODUCTION || TESTING')) {
      assert(typeof key === 'string' && key.length > 0,
             'ImageCache.set: Invalid `key` parameter.');

      assert(Object.values(OPS).includes(fn),
             'ImageCache.set: Invalid `fn` parameter.');
      assert(typeof args === 'object',
             'ImageCache.set: Invalid `args` parameter.');

      assert(typeof dimensions === 'object' && dimensions !== null,
             'ImageCache.set: Invalid `dimensions` parameter.');
      assert(Number.isInteger(dimensions.width) && dimensions.width > 0,
             'ImageCache.set: Non-integer `dimensions.width` parameter.');
      assert(Number.isInteger(dimensions.height) && dimensions.height > 0,
             'ImageCache.set: Non-integer `dimensions.height` parameter.');
      assert(typeof dimensions.downsized === 'boolean',
            'ImageCache.set: Non-boolean `dimensions.downsized` parameter.');
    }

    if (this._cache[key] !== undefined) {
      warn(`ImageCache.set: Overwriting existing entry for "${key}".`);
    }

    this._cache[key] = { fn, args, dimensions, };
  }

  remove({ key, }) {
    if (typeof PDFJSDev === 'undefined' ||
        PDFJSDev.test('!PRODUCTION || TESTING')) {
      assert(typeof key === 'string' && key.length > 0,
             'ImageCache.remove: Invalid `key` parameter.');
    }

    if (this._cache[key] === undefined) {
      warn('ImageCache.remove: ' +
           `Attempting to remove non-existent entry for "${key}".`);
      return;
    }

    this._handler.send('obj', [key, this._pageIndex, 'ImageCacheRemove']);
    delete this._cache[key];
  }

  clear() {
    this._cache = Object.create(null);
  }
}

export {
  NativeImageDecoder,
  ImageCache,
  ImageCacheKind,
};
