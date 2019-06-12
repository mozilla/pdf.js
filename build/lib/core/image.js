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
exports.PDFImage = void 0;

var _util = require("../shared/util");

var _primitives = require("./primitives");

var _colorspace = require("./colorspace");

var _stream = require("./stream");

var _jpeg_stream = require("./jpeg_stream");

var _jpx = require("./jpx");

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

var PDFImage = function PDFImageClosure() {
  function handleImageData(image, nativeDecoder) {
    if (nativeDecoder && nativeDecoder.canDecode(image)) {
      return nativeDecoder.decode(image)["catch"](function (reason) {
        (0, _util.warn)('Native image decoding failed -- trying to recover: ' + (reason && reason.message));
        return image;
      });
    }

    return Promise.resolve(image);
  }

  function decodeAndClamp(value, addend, coefficient, max) {
    value = addend + value * coefficient;
    return value < 0 ? 0 : value > max ? max : value;
  }

  function resizeImageMask(src, bpc, w1, h1, w2, h2) {
    var length = w2 * h2;
    var dest = bpc <= 8 ? new Uint8Array(length) : bpc <= 16 ? new Uint16Array(length) : new Uint32Array(length);
    var xRatio = w1 / w2;
    var yRatio = h1 / h2;
    var i,
        j,
        py,
        newIndex = 0,
        oldIndex;
    var xScaled = new Uint16Array(w2);
    var w1Scanline = w1;

    for (i = 0; i < w2; i++) {
      xScaled[i] = Math.floor(i * xRatio);
    }

    for (i = 0; i < h2; i++) {
      py = Math.floor(i * yRatio) * w1Scanline;

      for (j = 0; j < w2; j++) {
        oldIndex = py + xScaled[j];
        dest[newIndex++] = src[oldIndex];
      }
    }

    return dest;
  }

  function PDFImage(_ref) {
    var xref = _ref.xref,
        res = _ref.res,
        image = _ref.image,
        _ref$isInline = _ref.isInline,
        isInline = _ref$isInline === void 0 ? false : _ref$isInline,
        _ref$smask = _ref.smask,
        smask = _ref$smask === void 0 ? null : _ref$smask,
        _ref$mask = _ref.mask,
        mask = _ref$mask === void 0 ? null : _ref$mask,
        _ref$isMask = _ref.isMask,
        isMask = _ref$isMask === void 0 ? false : _ref$isMask,
        pdfFunctionFactory = _ref.pdfFunctionFactory;
    this.image = image;
    var dict = image.dict;
    var filter = dict.get('Filter');

    if ((0, _primitives.isName)(filter)) {
      switch (filter.name) {
        case 'JPXDecode':
          var jpxImage = new _jpx.JpxImage();
          jpxImage.parseImageProperties(image.stream);
          image.stream.reset();
          image.width = jpxImage.width;
          image.height = jpxImage.height;
          image.bitsPerComponent = jpxImage.bitsPerComponent;
          image.numComps = jpxImage.componentsCount;
          break;

        case 'JBIG2Decode':
          image.bitsPerComponent = 1;
          image.numComps = 1;
          break;
      }
    }

    var width = dict.get('Width', 'W');
    var height = dict.get('Height', 'H');

    if (Number.isInteger(image.width) && image.width > 0 && Number.isInteger(image.height) && image.height > 0 && (image.width !== width || image.height !== height)) {
      (0, _util.warn)('PDFImage - using the Width/Height of the image data, ' + 'rather than the image dictionary.');
      width = image.width;
      height = image.height;
    }

    if (width < 1 || height < 1) {
      throw new _util.FormatError("Invalid image width: ".concat(width, " or ") + "height: ".concat(height));
    }

    this.width = width;
    this.height = height;
    this.interpolate = dict.get('Interpolate', 'I') || false;
    this.imageMask = dict.get('ImageMask', 'IM') || false;
    this.matte = dict.get('Matte') || false;
    var bitsPerComponent = image.bitsPerComponent;

    if (!bitsPerComponent) {
      bitsPerComponent = dict.get('BitsPerComponent', 'BPC');

      if (!bitsPerComponent) {
        if (this.imageMask) {
          bitsPerComponent = 1;
        } else {
          throw new _util.FormatError("Bits per component missing in image: ".concat(this.imageMask));
        }
      }
    }

    this.bpc = bitsPerComponent;

    if (!this.imageMask) {
      var colorSpace = dict.get('ColorSpace', 'CS');

      if (!colorSpace) {
        (0, _util.info)('JPX images (which do not require color spaces)');

        switch (image.numComps) {
          case 1:
            colorSpace = _primitives.Name.get('DeviceGray');
            break;

          case 3:
            colorSpace = _primitives.Name.get('DeviceRGB');
            break;

          case 4:
            colorSpace = _primitives.Name.get('DeviceCMYK');
            break;

          default:
            throw new Error("JPX images with ".concat(image.numComps, " ") + 'color components not supported.');
        }
      }

      var resources = isInline ? res : null;
      this.colorSpace = _colorspace.ColorSpace.parse(colorSpace, xref, resources, pdfFunctionFactory);
      this.numComps = this.colorSpace.numComps;
    }

    this.decode = dict.getArray('Decode', 'D');
    this.needsDecode = false;

    if (this.decode && (this.colorSpace && !this.colorSpace.isDefaultDecode(this.decode, bitsPerComponent) || isMask && !_colorspace.ColorSpace.isDefaultDecode(this.decode, 1))) {
      this.needsDecode = true;
      var max = (1 << bitsPerComponent) - 1;
      this.decodeCoefficients = [];
      this.decodeAddends = [];
      var isIndexed = this.colorSpace && this.colorSpace.name === 'Indexed';

      for (var i = 0, j = 0; i < this.decode.length; i += 2, ++j) {
        var dmin = this.decode[i];
        var dmax = this.decode[i + 1];
        this.decodeCoefficients[j] = isIndexed ? (dmax - dmin) / max : dmax - dmin;
        this.decodeAddends[j] = isIndexed ? dmin : max * dmin;
      }
    }

    if (smask) {
      this.smask = new PDFImage({
        xref: xref,
        res: res,
        image: smask,
        isInline: isInline,
        pdfFunctionFactory: pdfFunctionFactory
      });
    } else if (mask) {
      if ((0, _primitives.isStream)(mask)) {
        var maskDict = mask.dict,
            imageMask = maskDict.get('ImageMask', 'IM');

        if (!imageMask) {
          (0, _util.warn)('Ignoring /Mask in image without /ImageMask.');
        } else {
          this.mask = new PDFImage({
            xref: xref,
            res: res,
            image: mask,
            isInline: isInline,
            isMask: true,
            pdfFunctionFactory: pdfFunctionFactory
          });
        }
      } else {
        this.mask = mask;
      }
    }
  }

  PDFImage.buildImage = function (_ref2) {
    var handler = _ref2.handler,
        xref = _ref2.xref,
        res = _ref2.res,
        image = _ref2.image,
        _ref2$isInline = _ref2.isInline,
        isInline = _ref2$isInline === void 0 ? false : _ref2$isInline,
        _ref2$nativeDecoder = _ref2.nativeDecoder,
        nativeDecoder = _ref2$nativeDecoder === void 0 ? null : _ref2$nativeDecoder,
        pdfFunctionFactory = _ref2.pdfFunctionFactory;
    var imagePromise = handleImageData(image, nativeDecoder);
    var smaskPromise;
    var maskPromise;
    var smask = image.dict.get('SMask');
    var mask = image.dict.get('Mask');

    if (smask) {
      smaskPromise = handleImageData(smask, nativeDecoder);
      maskPromise = Promise.resolve(null);
    } else {
      smaskPromise = Promise.resolve(null);

      if (mask) {
        if ((0, _primitives.isStream)(mask)) {
          maskPromise = handleImageData(mask, nativeDecoder);
        } else if (Array.isArray(mask)) {
          maskPromise = Promise.resolve(mask);
        } else {
          (0, _util.warn)('Unsupported mask format.');
          maskPromise = Promise.resolve(null);
        }
      } else {
        maskPromise = Promise.resolve(null);
      }
    }

    return Promise.all([imagePromise, smaskPromise, maskPromise]).then(function (_ref3) {
      var _ref4 = _slicedToArray(_ref3, 3),
          imageData = _ref4[0],
          smaskData = _ref4[1],
          maskData = _ref4[2];

      return new PDFImage({
        xref: xref,
        res: res,
        image: imageData,
        isInline: isInline,
        smask: smaskData,
        mask: maskData,
        pdfFunctionFactory: pdfFunctionFactory
      });
    });
  };

  PDFImage.createMask = function (_ref5) {
    var imgArray = _ref5.imgArray,
        width = _ref5.width,
        height = _ref5.height,
        imageIsFromDecodeStream = _ref5.imageIsFromDecodeStream,
        inverseDecode = _ref5.inverseDecode;
    var computedLength = (width + 7 >> 3) * height;
    var actualLength = imgArray.byteLength;
    var haveFullData = computedLength === actualLength;
    var data, i;

    if (imageIsFromDecodeStream && (!inverseDecode || haveFullData)) {
      data = imgArray;
    } else if (!inverseDecode) {
      data = new Uint8ClampedArray(actualLength);
      data.set(imgArray);
    } else {
      data = new Uint8ClampedArray(computedLength);
      data.set(imgArray);

      for (i = actualLength; i < computedLength; i++) {
        data[i] = 0xff;
      }
    }

    if (inverseDecode) {
      for (i = 0; i < actualLength; i++) {
        data[i] ^= 0xFF;
      }
    }

    return {
      data: data,
      width: width,
      height: height
    };
  };

  PDFImage.prototype = {
    get drawWidth() {
      return Math.max(this.width, this.smask && this.smask.width || 0, this.mask && this.mask.width || 0);
    },

    get drawHeight() {
      return Math.max(this.height, this.smask && this.smask.height || 0, this.mask && this.mask.height || 0);
    },

    decodeBuffer: function decodeBuffer(buffer) {
      var bpc = this.bpc;
      var numComps = this.numComps;
      var decodeAddends = this.decodeAddends;
      var decodeCoefficients = this.decodeCoefficients;
      var max = (1 << bpc) - 1;
      var i, ii;

      if (bpc === 1) {
        for (i = 0, ii = buffer.length; i < ii; i++) {
          buffer[i] = +!buffer[i];
        }

        return;
      }

      var index = 0;

      for (i = 0, ii = this.width * this.height; i < ii; i++) {
        for (var j = 0; j < numComps; j++) {
          buffer[index] = decodeAndClamp(buffer[index], decodeAddends[j], decodeCoefficients[j], max);
          index++;
        }
      }
    },
    getComponents: function getComponents(buffer) {
      var bpc = this.bpc;

      if (bpc === 8) {
        return buffer;
      }

      var width = this.width;
      var height = this.height;
      var numComps = this.numComps;
      var length = width * height * numComps;
      var bufferPos = 0;
      var output = bpc <= 8 ? new Uint8Array(length) : bpc <= 16 ? new Uint16Array(length) : new Uint32Array(length);
      var rowComps = width * numComps;
      var max = (1 << bpc) - 1;
      var i = 0,
          ii,
          buf;

      if (bpc === 1) {
        var mask, loop1End, loop2End;

        for (var j = 0; j < height; j++) {
          loop1End = i + (rowComps & ~7);
          loop2End = i + rowComps;

          while (i < loop1End) {
            buf = buffer[bufferPos++];
            output[i] = buf >> 7 & 1;
            output[i + 1] = buf >> 6 & 1;
            output[i + 2] = buf >> 5 & 1;
            output[i + 3] = buf >> 4 & 1;
            output[i + 4] = buf >> 3 & 1;
            output[i + 5] = buf >> 2 & 1;
            output[i + 6] = buf >> 1 & 1;
            output[i + 7] = buf & 1;
            i += 8;
          }

          if (i < loop2End) {
            buf = buffer[bufferPos++];
            mask = 128;

            while (i < loop2End) {
              output[i++] = +!!(buf & mask);
              mask >>= 1;
            }
          }
        }
      } else {
        var bits = 0;
        buf = 0;

        for (i = 0, ii = length; i < ii; ++i) {
          if (i % rowComps === 0) {
            buf = 0;
            bits = 0;
          }

          while (bits < bpc) {
            buf = buf << 8 | buffer[bufferPos++];
            bits += 8;
          }

          var remainingBits = bits - bpc;
          var value = buf >> remainingBits;
          output[i] = value < 0 ? 0 : value > max ? max : value;
          buf = buf & (1 << remainingBits) - 1;
          bits = remainingBits;
        }
      }

      return output;
    },
    fillOpacity: function fillOpacity(rgbaBuf, width, height, actualHeight, image) {
      var smask = this.smask;
      var mask = this.mask;
      var alphaBuf, sw, sh, i, ii, j;

      if (smask) {
        sw = smask.width;
        sh = smask.height;
        alphaBuf = new Uint8ClampedArray(sw * sh);
        smask.fillGrayBuffer(alphaBuf);

        if (sw !== width || sh !== height) {
          alphaBuf = resizeImageMask(alphaBuf, smask.bpc, sw, sh, width, height);
        }
      } else if (mask) {
        if (mask instanceof PDFImage) {
          sw = mask.width;
          sh = mask.height;
          alphaBuf = new Uint8ClampedArray(sw * sh);
          mask.numComps = 1;
          mask.fillGrayBuffer(alphaBuf);

          for (i = 0, ii = sw * sh; i < ii; ++i) {
            alphaBuf[i] = 255 - alphaBuf[i];
          }

          if (sw !== width || sh !== height) {
            alphaBuf = resizeImageMask(alphaBuf, mask.bpc, sw, sh, width, height);
          }
        } else if (Array.isArray(mask)) {
          alphaBuf = new Uint8ClampedArray(width * height);
          var numComps = this.numComps;

          for (i = 0, ii = width * height; i < ii; ++i) {
            var opacity = 0;
            var imageOffset = i * numComps;

            for (j = 0; j < numComps; ++j) {
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
          throw new _util.FormatError('Unknown mask format.');
        }
      }

      if (alphaBuf) {
        for (i = 0, j = 3, ii = width * actualHeight; i < ii; ++i, j += 4) {
          rgbaBuf[j] = alphaBuf[i];
        }
      } else {
        for (i = 0, j = 3, ii = width * actualHeight; i < ii; ++i, j += 4) {
          rgbaBuf[j] = 255;
        }
      }
    },
    undoPreblend: function undoPreblend(buffer, width, height) {
      var matte = this.smask && this.smask.matte;

      if (!matte) {
        return;
      }

      var matteRgb = this.colorSpace.getRgb(matte, 0);
      var matteR = matteRgb[0];
      var matteG = matteRgb[1];
      var matteB = matteRgb[2];
      var length = width * height * 4;

      for (var i = 0; i < length; i += 4) {
        var alpha = buffer[i + 3];

        if (alpha === 0) {
          buffer[i] = 255;
          buffer[i + 1] = 255;
          buffer[i + 2] = 255;
          continue;
        }

        var k = 255 / alpha;
        buffer[i] = (buffer[i] - matteR) * k + matteR;
        buffer[i + 1] = (buffer[i + 1] - matteG) * k + matteG;
        buffer[i + 2] = (buffer[i + 2] - matteB) * k + matteB;
      }
    },
    createImageData: function createImageData() {
      var forceRGBA = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;
      var drawWidth = this.drawWidth;
      var drawHeight = this.drawHeight;
      var imgData = {
        width: drawWidth,
        height: drawHeight,
        kind: 0,
        data: null
      };
      var numComps = this.numComps;
      var originalWidth = this.width;
      var originalHeight = this.height;
      var bpc = this.bpc;
      var rowBytes = originalWidth * numComps * bpc + 7 >> 3;
      var imgArray;

      if (!forceRGBA) {
        var kind;

        if (this.colorSpace.name === 'DeviceGray' && bpc === 1) {
          kind = _util.ImageKind.GRAYSCALE_1BPP;
        } else if (this.colorSpace.name === 'DeviceRGB' && bpc === 8 && !this.needsDecode) {
          kind = _util.ImageKind.RGB_24BPP;
        }

        if (kind && !this.smask && !this.mask && drawWidth === originalWidth && drawHeight === originalHeight) {
          imgData.kind = kind;
          imgArray = this.getImageBytes(originalHeight * rowBytes);

          if (this.image instanceof _stream.DecodeStream) {
            imgData.data = imgArray;
          } else {
            var newArray = new Uint8ClampedArray(imgArray.length);
            newArray.set(imgArray);
            imgData.data = newArray;
          }

          if (this.needsDecode) {
            (0, _util.assert)(kind === _util.ImageKind.GRAYSCALE_1BPP, 'PDFImage.createImageData: The image must be grayscale.');
            var buffer = imgData.data;

            for (var i = 0, ii = buffer.length; i < ii; i++) {
              buffer[i] ^= 0xff;
            }
          }

          return imgData;
        }

        if (this.image instanceof _jpeg_stream.JpegStream && !this.smask && !this.mask) {
          var imageLength = originalHeight * rowBytes;

          switch (this.colorSpace.name) {
            case 'DeviceGray':
              imageLength *= 3;

            case 'DeviceRGB':
            case 'DeviceCMYK':
              imgData.kind = _util.ImageKind.RGB_24BPP;
              imgData.data = this.getImageBytes(imageLength, drawWidth, drawHeight, true);
              return imgData;
          }
        }
      }

      imgArray = this.getImageBytes(originalHeight * rowBytes);
      var actualHeight = 0 | imgArray.length / rowBytes * drawHeight / originalHeight;
      var comps = this.getComponents(imgArray);
      var alpha01, maybeUndoPreblend;

      if (!forceRGBA && !this.smask && !this.mask) {
        imgData.kind = _util.ImageKind.RGB_24BPP;
        imgData.data = new Uint8ClampedArray(drawWidth * drawHeight * 3);
        alpha01 = 0;
        maybeUndoPreblend = false;
      } else {
        imgData.kind = _util.ImageKind.RGBA_32BPP;
        imgData.data = new Uint8ClampedArray(drawWidth * drawHeight * 4);
        alpha01 = 1;
        maybeUndoPreblend = true;
        this.fillOpacity(imgData.data, drawWidth, drawHeight, actualHeight, comps);
      }

      if (this.needsDecode) {
        this.decodeBuffer(comps);
      }

      this.colorSpace.fillRgb(imgData.data, originalWidth, originalHeight, drawWidth, drawHeight, actualHeight, bpc, comps, alpha01);

      if (maybeUndoPreblend) {
        this.undoPreblend(imgData.data, drawWidth, actualHeight);
      }

      return imgData;
    },
    fillGrayBuffer: function fillGrayBuffer(buffer) {
      var numComps = this.numComps;

      if (numComps !== 1) {
        throw new _util.FormatError("Reading gray scale from a color image: ".concat(numComps));
      }

      var width = this.width;
      var height = this.height;
      var bpc = this.bpc;
      var rowBytes = width * numComps * bpc + 7 >> 3;
      var imgArray = this.getImageBytes(height * rowBytes);
      var comps = this.getComponents(imgArray);
      var i, length;

      if (bpc === 1) {
        length = width * height;

        if (this.needsDecode) {
          for (i = 0; i < length; ++i) {
            buffer[i] = comps[i] - 1 & 255;
          }
        } else {
          for (i = 0; i < length; ++i) {
            buffer[i] = -comps[i] & 255;
          }
        }

        return;
      }

      if (this.needsDecode) {
        this.decodeBuffer(comps);
      }

      length = width * height;
      var scale = 255 / ((1 << bpc) - 1);

      for (i = 0; i < length; ++i) {
        buffer[i] = scale * comps[i];
      }
    },
    getImageBytes: function getImageBytes(length, drawWidth, drawHeight) {
      var forceRGB = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;
      this.image.reset();
      this.image.drawWidth = drawWidth || this.width;
      this.image.drawHeight = drawHeight || this.height;
      this.image.forceRGB = !!forceRGB;
      return this.image.getBytes(length, true);
    }
  };
  return PDFImage;
}();

exports.PDFImage = PDFImage;