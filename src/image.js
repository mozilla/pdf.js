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
  function PDFImage(xref, res, image, inline, smask, mask) {
    this.image = image;
    if (image.getParams) {
      // JPX/JPEG2000 streams directly contain bits per component
      // and color space mode information.
      TODO('get params from actual stream');
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
        TODO('JPX images (which don"t require color spaces');
        colorSpace = new Name('DeviceRGB');
      }
      this.colorSpace = ColorSpace.parse(colorSpace, xref, res);
      this.numComps = this.colorSpace.numComps;
    }

    this.decode = dict.get('Decode', 'D');
    this.needsDecode = false;
    if (this.decode && this.colorSpace &&
        !this.colorSpace.isDefaultDecode(this.decode)) {
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
        this.mask = new PDFImage(xref, res, mask, false);
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
    var imageDataPromise = new Promise();
    var smaskPromise = new Promise();
    var maskPromise = new Promise();
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
    getComponents: function PDFImage_getComponents(buffer) {
      var bpc = this.bpc;
      var needsDecode = this.needsDecode;
      var decodeMap = this.decode;

      // This image doesn't require any extra work.
      if (bpc == 8 && !needsDecode)
        return buffer;

      var bufferLength = buffer.length;
      var width = this.width;
      var height = this.height;
      var numComps = this.numComps;

      var length = width * height * numComps;
      var bufferPos = 0;
      var output = bpc <= 8 ? new Uint8Array(length) :
        bpc <= 16 ? new Uint16Array(length) : new Uint32Array(length);
      var rowComps = width * numComps;
      var decodeAddends, decodeCoefficients;
      if (needsDecode) {
        decodeAddends = this.decodeAddends;
        decodeCoefficients = this.decodeCoefficients;
      }
      var max = (1 << bpc) - 1;

      if (bpc == 8) {
        // Optimization for reading 8 bpc images that have a decode.
        for (var i = 0, ii = length; i < ii; ++i) {
          var compIndex = i % numComps;
          var value = buffer[i];
          value = decodeAndClamp(value, decodeAddends[compIndex],
                          decodeCoefficients[compIndex], max);
          output[i] = value;
        }
      } else if (bpc == 1) {
        // Optimization for reading 1 bpc images.
        var valueZero = 0, valueOne = 1;
        if (decodeMap) {
          valueZero = decodeMap[0] ? 1 : 0;
          valueOne = decodeMap[1] ? 1 : 0;
        }
        var mask = 0;
        var buf = 0;

        for (var i = 0, ii = length; i < ii; ++i) {
          if (i % rowComps == 0) {
            mask = 0;
            buf = 0;
          } else {
            mask >>= 1;
          }

          if (mask <= 0) {
            buf = buffer[bufferPos++];
            mask = 128;
          }

          output[i] = !(buf & mask) ? valueZero : valueOne;
        }
      } else {
        // The general case that handles all other bpc values.
        var bits = 0, buf = 0;
        for (var i = 0, ii = length; i < ii; ++i) {
          if (i % rowComps == 0) {
            buf = 0;
            bits = 0;
          }

          while (bits < bpc) {
            buf = (buf << 8) | buffer[bufferPos++];
            bits += 8;
          }

          var remainingBits = bits - bpc;
          var value = buf >> remainingBits;
          if (needsDecode) {
            var compIndex = i % numComps;
            value = decodeAndClamp(value, decodeAddends[compIndex],
                            decodeCoefficients[compIndex], max);
          }
          output[i] = value;
          buf = buf & ((1 << remainingBits) - 1);
          bits = remainingBits;
        }
      }
      return output;
    },
    getOpacity: function PDFImage_getOpacity(width, height, image) {
      var smask = this.smask;
      var mask = this.mask;
      var originalWidth = this.width;
      var originalHeight = this.height;
      var buf;

      if (smask) {
        var sw = smask.width;
        var sh = smask.height;
        buf = new Uint8Array(sw * sh);
        smask.fillGrayBuffer(buf);
        if (sw != width || sh != height)
          buf = PDFImage.resize(buf, smask.bpc, 1, sw, sh, width, height);
      } else if (mask) {
        if (mask instanceof PDFImage) {
          var sw = mask.width;
          var sh = mask.height;
          buf = new Uint8Array(sw * sh);
          mask.numComps = 1;
          mask.fillGrayBuffer(buf);

          // Need to invert values in buffer
          for (var i = 0, ii = sw * sh; i < ii; ++i)
            buf[i] = 255 - buf[i];

          if (sw != width || sh != height)
            buf = PDFImage.resize(buf, mask.bpc, 1, sw, sh, width, height);
        } else if (isArray(mask)) {
          // Color key mask: if any of the compontents are outside the range
          // then they should be painted.
          buf = new Uint8Array(width * height);
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
            buf[i] = opacity;
          }
        } else {
          error('Unknown mask format.');
        }
      } else {
        buf = new Uint8Array(width * height);
        for (var i = 0, ii = width * height; i < ii; ++i)
          buf[i] = 255;
      }
      return buf;
    },
    applyStencilMask: function PDFImage_applyStencilMask(buffer,
                                                         inverseDecode) {
      var width = this.width, height = this.height;
      var bitStrideLength = (width + 7) >> 3;
      var imgArray = this.getImageBytes(bitStrideLength * height);
      var imgArrayPos = 0;
      var i, j, mask, buf;
      // removing making non-masked pixels transparent
      var bufferPos = 3; // alpha component offset
      for (i = 0; i < height; i++) {
        mask = 0;
        for (j = 0; j < width; j++) {
          if (!mask) {
            buf = imgArray[imgArrayPos++];
            mask = 128;
          }
          if (!(buf & mask) == inverseDecode) {
            buffer[bufferPos] = 0;
          }
          bufferPos += 4;
          mask >>= 1;
        }
      }
    },
    fillRgbaBuffer: function PDFImage_fillRgbaBuffer(buffer, width, height) {
      var numComps = this.numComps;
      var originalWidth = this.width;
      var originalHeight = this.height;
      var bpc = this.bpc;

      // rows start at byte boundary;
      var rowBytes = (originalWidth * numComps * bpc + 7) >> 3;
      var imgArray = this.getImageBytes(originalHeight * rowBytes);

      // imgArray can be incomplete (e.g. after CCITT fax encoding)
      var actualHeight = 0 | (imgArray.length / rowBytes *
                         height / originalHeight);

      var comps = this.colorSpace.createRgbBuffer(this.getComponents(imgArray),
        0, originalWidth * originalHeight, bpc);
      if (originalWidth != width || originalHeight != height)
        comps = PDFImage.resize(comps, this.bpc, 3, originalWidth,
                                originalHeight, width, height);
      var compsPos = 0;
      var opacity = this.getOpacity(width, height, imgArray);
      var opacityPos = 0;
      var length = width * actualHeight * 4;

      for (var i = 0; i < length; i += 4) {
        buffer[i] = comps[compsPos++];
        buffer[i + 1] = comps[compsPos++];
        buffer[i + 2] = comps[compsPos++];
        buffer[i + 3] = opacity[opacityPos++];
      }
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
      var length = width * height;
      // we aren't using a colorspace so we need to scale the value
      var scale = 255 / ((1 << bpc) - 1);
      for (var i = 0; i < length; ++i)
        buffer[i] = (scale * comps[i]) | 0;
    },
    getImageData: function PDFImage_getImageData() {
      var drawWidth = this.drawWidth;
      var drawHeight = this.drawHeight;
      var imgData = {
        width: drawWidth,
        height: drawHeight,
        data: new Uint8Array(drawWidth * drawHeight * 4)
      };
      var pixels = imgData.data;
      this.fillRgbaBuffer(pixels, drawWidth, drawHeight);
      return imgData;
    },
    getImageBytes: function PDFImage_getImageBytes(length) {
      this.image.reset();
      return this.image.getBytes(length);
    }
  };
  return PDFImage;
})();

function loadJpegStream(id, imageData, objs) {
  var img = new Image();
  img.onload = (function loadJpegStream_onloadClosure() {
    objs.resolve(id, img);
  });
  img.src = 'data:image/jpeg;base64,' + window.btoa(imageData);
}

