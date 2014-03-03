/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2012 Mozilla Foundation
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
/* globals ColorSpace, error, isArray, ImageKind, isStream, JpegStream, Name,
           Promise, Stream, warn, LegacyPromise */

'use strict';

var PDFImage = (function PDFImageClosure() {
  /**
   * Decode the image in the main thread if it supported. Resovles the promise
   * when the image data is ready.
   */
  function handleImageData(handler, xref, res, image, promise) {
    if (image instanceof JpegStream && image.isNativelyDecodable(xref, res)) {
      // For natively supported jpegs send them to the main thread for decoding.
      var dict = image.dict;
      var colorSpace = dict.get('ColorSpace', 'CS');
      colorSpace = ColorSpace.parse(colorSpace, xref, res);
      var numComps = colorSpace.numComps;
      handler.send('JpegDecode', [image.getIR(), numComps], function(message) {
        var data = message.data;
        var stream = new Stream(data, 0, data.length, image.dict);
        promise.resolve(stream);
      });
    } else {
      promise.resolve(image);
    }
  }
  /**
   * Decode and clamp a value. The formula is different from the spec because we
   * don't decode to float range [0,1], we decode it in the [0,max] range.
   */
  function decodeAndClamp(value, addend, coefficient, max) {
    value = addend + value * coefficient;
    // Clamp the value to the range
    return value < 0 ? 0 : value > max ? max : value;
  }
  function PDFImage(xref, res, image, inline, smask, mask, isMask) {
    this.image = image;
    if (image.getParams) {
      // JPX/JPEG2000 streams directly contain bits per component
      // and color space mode information.
      warn('get params from actual stream');
      // var bits = ...
      // var colorspace = ...
    }
    // TODO cache rendered images?

    var dict = image.dict;
    this.width = dict.get('Width', 'W');
    this.height = dict.get('Height', 'H');

    if (this.width < 1 || this.height < 1)
      error('Invalid image width: ' + this.width + ' or height: ' +
            this.height);

    this.interpolate = dict.get('Interpolate', 'I') || false;
    this.imageMask = dict.get('ImageMask', 'IM') || false;
    this.matte = dict.get('Matte') || false;

    var bitsPerComponent = image.bitsPerComponent;
    if (!bitsPerComponent) {
      bitsPerComponent = dict.get('BitsPerComponent', 'BPC');
      if (!bitsPerComponent) {
        if (this.imageMask)
          bitsPerComponent = 1;
        else
          error('Bits per component missing in image: ' + this.imageMask);
      }
    }
    this.bpc = bitsPerComponent;

    if (!this.imageMask) {
      var colorSpace = dict.get('ColorSpace', 'CS');
      if (!colorSpace) {
        warn('JPX images (which don"t require color spaces');
        colorSpace = Name.get('DeviceRGB');
      }
      this.colorSpace = ColorSpace.parse(colorSpace, xref, res);
      this.numComps = this.colorSpace.numComps;
    }

    this.decode = dict.get('Decode', 'D');
    this.needsDecode = false;
    if (this.decode &&
        ((this.colorSpace && !this.colorSpace.isDefaultDecode(this.decode)) ||
         (isMask && !ColorSpace.isDefaultDecode(this.decode, 1)))) {
      this.needsDecode = true;
      // Do some preprocessing to avoid more math.
      var max = (1 << bitsPerComponent) - 1;
      this.decodeCoefficients = [];
      this.decodeAddends = [];
      for (var i = 0, j = 0; i < this.decode.length; i += 2, ++j) {
        var dmin = this.decode[i];
        var dmax = this.decode[i + 1];
        this.decodeCoefficients[j] = dmax - dmin;
        this.decodeAddends[j] = max * dmin;
      }
    }

    if (smask) {
      this.smask = new PDFImage(xref, res, smask, false);
    } else if (mask) {
      if (isStream(mask)) {
        this.mask = new PDFImage(xref, res, mask, false, null, null, true);
      } else {
        // Color key mask (just an array).
        this.mask = mask;
      }
    }
  }
  /**
   * Handles processing of image data and calls the callback with an argument
   * of a PDFImage when the image is ready to be used.
   */
  PDFImage.buildImage = function PDFImage_buildImage(callback, handler, xref,
                                                     res, image, inline) {
    var imageDataPromise = new LegacyPromise();
    var smaskPromise = new LegacyPromise();
    var maskPromise = new LegacyPromise();
    // The image data and smask data may not be ready yet, wait till both are
    // resolved.
    Promise.all([imageDataPromise, smaskPromise, maskPromise]).then(
        function(results) {
      var imageData = results[0], smaskData = results[1], maskData = results[2];
      var image = new PDFImage(xref, res, imageData, inline, smaskData,
                               maskData);
      callback(image);
    });

    handleImageData(handler, xref, res, image, imageDataPromise);

    var smask = image.dict.get('SMask');
    var mask = image.dict.get('Mask');

    if (smask) {
      handleImageData(handler, xref, res, smask, smaskPromise);
      maskPromise.resolve(null);
    } else {
      smaskPromise.resolve(null);
      if (mask) {
        if (isStream(mask)) {
          handleImageData(handler, xref, res, mask, maskPromise);
        } else if (isArray(mask)) {
          maskPromise.resolve(mask);
        } else {
          warn('Unsupported mask format.');
          maskPromise.resolve(null);
        }
      } else {
        maskPromise.resolve(null);
      }
    }
  };

  /**
   * Resize an image using the nearest neighbor algorithm.  Currently only
   * supports one and three component images.
   * @param {TypedArray} pixels The original image with one component.
   * @param {Number} bpc Number of bits per component.
   * @param {Number} components Number of color components, 1 or 3 is supported.
   * @param {Number} w1 Original width.
   * @param {Number} h1 Original height.
   * @param {Number} w2 New width.
   * @param {Number} h2 New height.
   * @return {TypedArray} Resized image data.
   */
  PDFImage.resize = function PDFImage_resize(pixels, bpc, components,
                                             w1, h1, w2, h2) {
    var length = w2 * h2 * components;
    var temp = bpc <= 8 ? new Uint8Array(length) :
        bpc <= 16 ? new Uint16Array(length) : new Uint32Array(length);
    var xRatio = w1 / w2;
    var yRatio = h1 / h2;
    var px, py, newIndex, oldIndex;
    for (var i = 0; i < h2; i++) {
      for (var j = 0; j < w2; j++) {
        px = Math.floor(j * xRatio);
        py = Math.floor(i * yRatio);
        newIndex = (i * w2) + j;
        oldIndex = ((py * w1) + px);
        if (components === 1) {
          temp[newIndex] = pixels[oldIndex];
        } else if (components === 3) {
          newIndex *= 3;
          oldIndex *= 3;
          temp[newIndex] = pixels[oldIndex];
          temp[newIndex + 1] = pixels[oldIndex + 1];
          temp[newIndex + 2] = pixels[oldIndex + 2];
        }
      }
    }
    return temp;
  };

  PDFImage.createMask = function PDFImage_createMask(imgArray, width, height,
                                                     inverseDecode) {
    // Copy imgArray into a typed array (inverting if necessary) so it can be
    // transferred to the main thread.
    var length = ((width + 7) >> 3) * height;
    var data = new Uint8Array(length);
    if (inverseDecode) {
      for (var i = 0; i < length; i++) {
        data[i] = ~imgArray[i];
      }
    } else {
      for (var i = 0; i < length; i++) {
        data[i] = imgArray[i];
      }
    }

    return {data: data, width: width, height: height};
  };

  PDFImage.prototype = {
    get drawWidth() {
      if (!this.smask)
        return this.width;
      return Math.max(this.width, this.smask.width);
    },
    get drawHeight() {
      if (!this.smask)
        return this.height;
      return Math.max(this.height, this.smask.height);
    },
    decodeBuffer: function PDFImage_decodeBuffer(buffer) {
      var bpc = this.bpc;
      var decodeMap = this.decode;
      var numComps = this.numComps;

      var decodeAddends, decodeCoefficients;
      var decodeAddends = this.decodeAddends;
      var decodeCoefficients = this.decodeCoefficients;
      var max = (1 << bpc) - 1;

      if (bpc === 1) {
        // If the buffer needed decode that means it just needs to be inverted.
        for (var i = 0, ii = buffer.length; i < ii; i++) {
          buffer[i] = +!(buffer[i]);
        }
        return;
      }
      var index = 0;
      for (var i = 0, ii = this.width * this.height; i < ii; i++) {
        for (var j = 0; j < numComps; j++) {
          buffer[index] = decodeAndClamp(buffer[index], decodeAddends[j],
                                            decodeCoefficients[j], max);
          index++;
        }
      }
    },
    getComponents: function PDFImage_getComponents(buffer) {
      var bpc = this.bpc;

      // This image doesn't require any extra work.
      if (bpc === 8) {
        return buffer;
      }

      var width = this.width;
      var height = this.height;
      var numComps = this.numComps;

      var length = width * height * numComps;
      var bufferPos = 0;
      var output = bpc <= 8 ? new Uint8Array(length) :
        bpc <= 16 ? new Uint16Array(length) : new Uint32Array(length);
      var rowComps = width * numComps;

      var max = (1 << bpc) - 1;

      if (bpc === 1) {
        // Optimization for reading 1 bpc images.
        var mask = 0;
        var buf = 0;

        for (var i = 0, ii = length; i < ii; ++i) {
          if (i % rowComps === 0) {
            mask = 0;
            buf = 0;
          } else {
            mask >>= 1;
          }

          if (mask <= 0) {
            buf = buffer[bufferPos++];
            mask = 128;
          }

          output[i] = +!!(buf & mask);
        }
      } else {
        // The general case that handles all other bpc values.
        var bits = 0, buf = 0;
        for (var i = 0, ii = length; i < ii; ++i) {
          if (i % rowComps === 0) {
            buf = 0;
            bits = 0;
          }

          while (bits < bpc) {
            buf = (buf << 8) | buffer[bufferPos++];
            bits += 8;
          }

          var remainingBits = bits - bpc;
          var value = buf >> remainingBits;
          output[i] = value < 0 ? 0 : value > max ? max : value;
          buf = buf & ((1 << remainingBits) - 1);
          bits = remainingBits;
        }
      }
      return output;
    },
    fillOpacity: function PDFImage_fillOpacity(rgbaBuf, width, height,
                                               actualHeight, image) {
      var smask = this.smask;
      var mask = this.mask;
      var alphaBuf;

      if (smask) {
        var sw = smask.width;
        var sh = smask.height;
        alphaBuf = new Uint8Array(sw * sh);
        smask.fillGrayBuffer(alphaBuf);
        if (sw != width || sh != height)
          alphaBuf = PDFImage.resize(alphaBuf, smask.bpc, 1, sw, sh, width,
                                     height);
      } else if (mask) {
        if (mask instanceof PDFImage) {
          var sw = mask.width;
          var sh = mask.height;
          alphaBuf = new Uint8Array(sw * sh);
          mask.numComps = 1;
          mask.fillGrayBuffer(alphaBuf);

          // Need to invert values in rgbaBuf
          for (var i = 0, ii = sw * sh; i < ii; ++i)
            alphaBuf[i] = 255 - alphaBuf[i];

          if (sw != width || sh != height)
            alphaBuf = PDFImage.resize(alphaBuf, mask.bpc, 1, sw, sh, width,
                                       height);
        } else if (isArray(mask)) {
          // Color key mask: if any of the compontents are outside the range
          // then they should be painted.
          alphaBuf = new Uint8Array(width * height);
          var numComps = this.numComps;
          for (var i = 0, ii = width * height; i < ii; ++i) {
            var opacity = 0;
            var imageOffset = i * numComps;
            for (var j = 0; j < numComps; ++j) {
              var color = image[imageOffset + j];
              var maskOffset = j * 2;
              if (color < mask[maskOffset] || color > mask[maskOffset + 1]) {
                opacity = 255;
                break;
              }
            }
            alphaBuf[i] = opacity;
          }
        } else {
          error('Unknown mask format.');
        }
      }

      if (alphaBuf) {
        for (var i = 0, j = 3, ii = width * actualHeight; i < ii; ++i, j += 4) {
          rgbaBuf[j] = alphaBuf[i];
        }
      } else {
        // Common case: no mask (and no need to allocate the extra buffer).
        for (var i = 0, j = 3, ii = width * actualHeight; i < ii; ++i, j += 4) {
          rgbaBuf[j] = 255;
        }
      }
    },
    undoPreblend: function PDFImage_undoPreblend(buffer, width, height) {
      var matte = this.smask && this.smask.matte;
      if (!matte) {
        return;
      }

      function clamp(value) {
        return (value < 0 ? 0 : value > 255 ? 255 : value) | 0;
      }

      var matteRgb = this.colorSpace.getRgb(matte, 0);
      var length = width * height * 4;
      for (var i = 0; i < length; i += 4) {
        var alpha = buffer[i + 3];
        if (alpha === 0) {
          // according formula we have to get Infinity in all components
          // making it as white (tipical paper color) should be okay
          buffer[i] = 255;
          buffer[i + 1] = 255;
          buffer[i + 2] = 255;
          continue;
        }
        var k = 255 / alpha;
        buffer[i] = clamp((buffer[i] - matteRgb[0]) * k + matteRgb[0]);
        buffer[i + 1] = clamp((buffer[i + 1] - matteRgb[1]) * k + matteRgb[1]);
        buffer[i + 2] = clamp((buffer[i + 2] - matteRgb[2]) * k + matteRgb[2]);
      }
    },
    createImageData: function PDFImage_createImageData(forceRGBA) {
      var drawWidth = this.drawWidth;
      var drawHeight = this.drawHeight;
      var imgData = {       // other fields are filled in below
        width: drawWidth,
        height: drawHeight,
      };

      var numComps = this.numComps;
      var originalWidth = this.width;
      var originalHeight = this.height;
      var bpc = this.bpc;

      // Rows start at byte boundary.
      var rowBytes = (originalWidth * numComps * bpc + 7) >> 3;
      var imgArray = this.getImageBytes(originalHeight * rowBytes);

      if (!forceRGBA) {
        // If it is a 1-bit-per-pixel grayscale (i.e. black-and-white) image
        // without any complications, we pass a same-sized copy to the main
        // thread rather than expanding by 32x to RGBA form. This saves *lots*
        // of memory for many scanned documents. It's also much faster.
        //
        // Similarly, if it is a 24-bit-per pixel RGB image without any
        // complications, we avoid expanding by 1.333x to RGBA form.
        var kind;
        if (this.colorSpace.name === 'DeviceGray' && bpc === 1) {
          kind = ImageKind.GRAYSCALE_1BPP;
        } else if (this.colorSpace.name === 'DeviceRGB' && bpc === 8) {
          kind = ImageKind.RGB_24BPP;
        }
        if (kind && !this.smask && !this.mask && !this.needsDecode &&
            drawWidth === originalWidth && drawHeight === originalHeight) {
          imgData.kind = kind;

          // We must make a copy of imgArray, otherwise it'll be neutered upon
          // transfer which will break any code that subsequently reuses it.
          var newArray = new Uint8Array(imgArray.length);
          newArray.set(imgArray);
          imgData.data = newArray;
          return imgData;
        }
      }

      // imgArray can be incomplete (e.g. after CCITT fax encoding).
      var actualHeight = 0 | (imgArray.length / rowBytes *
                         drawHeight / originalHeight);

      var comps = this.getComponents(imgArray);

      var rgbaBuf = new Uint8Array(drawWidth * drawHeight * 4);

      // Handle opacity here since color key masking needs to be performed on
      // undecoded values.
      this.fillOpacity(rgbaBuf, drawWidth, drawHeight, actualHeight, comps);

      if (this.needsDecode) {
        this.decodeBuffer(comps);
      }

      this.colorSpace.fillRgb(rgbaBuf, originalWidth, originalHeight, drawWidth,
                              drawHeight, actualHeight, bpc, comps);

      this.undoPreblend(rgbaBuf, drawWidth, actualHeight);

      imgData.kind = ImageKind.RGBA_32BPP;
      imgData.data = rgbaBuf;
      return imgData;
    },
    fillGrayBuffer: function PDFImage_fillGrayBuffer(buffer) {
      var numComps = this.numComps;
      if (numComps != 1)
        error('Reading gray scale from a color image: ' + numComps);

      var width = this.width;
      var height = this.height;
      var bpc = this.bpc;

      // rows start at byte boundary;
      var rowBytes = (width * numComps * bpc + 7) >> 3;
      var imgArray = this.getImageBytes(height * rowBytes);

      var comps = this.getComponents(imgArray);
      if (this.needsDecode) {
        this.decodeBuffer(comps);
      }
      var length = width * height;
      // we aren't using a colorspace so we need to scale the value
      var scale = 255 / ((1 << bpc) - 1);
      for (var i = 0; i < length; ++i)
        buffer[i] = (scale * comps[i]) | 0;
    },
    getImageBytes: function PDFImage_getImageBytes(length) {
      this.image.reset();
      return this.image.getBytes(length);
    }
  };
  return PDFImage;
})();
