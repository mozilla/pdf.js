/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var PDFImage = (function pdfImage() {
  /**
   * Decode the image in the main thread if it supported. Resovles the promise
   * when the image data is ready.
   */
  function handleImageData(handler, xref, res, image, promise) {
    if (image instanceof JpegStream && image.isNative) {
      // For natively supported jpegs send them to the main thread for decoding.
      var dict = image.dict;
      var colorSpace = dict.get('ColorSpace', 'CS');
      colorSpace =  ColorSpace.parse(colorSpace, xref, res);
      var numComps = colorSpace.numComps;
      handler.send('jpeg_decode', [image.getIR(), numComps], function(message) {
        var data = message.data;
        var stream = new Stream(data, 0, data.length, image.dict);
        promise.resolve(stream);
      });
    } else {
      promise.resolve(image);
    }
  }
  function constructor(xref, res, image, inline, smask) {
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

    var mask = xref.fetchIfRef(dict.get('Mask'));

    if (mask) {
      TODO('masked images');
    } else if (smask) {
      this.smask = new PDFImage(xref, res, smask, false);
    }
  }
  /**
   * Handles processing of image data and calls the callback with an argument
   * of a PDFImage when the image is ready to be used.
   */
  constructor.buildImage = function buildImage(callback, handler, xref, res,
                                               image, inline) {
    var promise = new Promise();
    var smaskPromise = new Promise();
    var promises = [promise, smaskPromise];
    // The image data and smask data may not be ready yet, wait till both are
    // resolved.
    Promise.all(promises).then(function(results) {
      var image = new PDFImage(xref, res, results[0], inline, results[1]);
      callback(image);
    });

    handleImageData(handler, xref, res, image, promise);

    var smask = xref.fetchIfRef(image.dict.get('SMask'));
    if (smask)
      handleImageData(handler, xref, res, smask, smaskPromise);
    else
      smaskPromise.resolve(null);
  };

  constructor.prototype = {
    getComponents: function getComponents(buffer, decodeMap) {
      var bpc = this.bpc;
      if (bpc == 8)
        return buffer;

      var width = this.width;
      var height = this.height;
      var numComps = this.numComps;

      var length = width * height;
      var bufferPos = 0;
      var output = bpc <= 8 ? new Uint8Array(length) :
        bpc <= 16 ? new Uint16Array(length) : new Uint32Array(length);
      var rowComps = width * numComps;

      if (bpc == 1) {
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
        if (decodeMap != null)
          TODO('interpolate component values');
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
          output[i] = buf >> remainingBits;
          buf = buf & ((1 << remainingBits) - 1);
          bits = remainingBits;
        }
      }
      return output;
    },
    getOpacity: function getOpacity() {
      var smask = this.smask;
      var width = this.width;
      var height = this.height;
      var buf = new Uint8Array(width * height);

      if (smask) {
        var sw = smask.width;
        var sh = smask.height;
        if (sw != this.width || sh != this.height)
          error('smask dimensions do not match image dimensions: ' + sw +
                ' != ' + this.width + ', ' + sh + ' != ' + this.height);

        smask.fillGrayBuffer(buf);
        return buf;
      } else {
        for (var i = 0, ii = width * height; i < ii; ++i)
          buf[i] = 255;
      }
      return buf;
    },
    applyStencilMask: function applyStencilMask(buffer, inverseDecode) {
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
    fillRgbaBuffer: function fillRgbaBuffer(buffer, decodeMap) {
      var numComps = this.numComps;
      var width = this.width;
      var height = this.height;
      var bpc = this.bpc;

      // rows start at byte boundary;
      var rowBytes = (width * numComps * bpc + 7) >> 3;
      var imgArray = this.getImageBytes(height * rowBytes);

      var comps = this.colorSpace.getRgbBuffer(
        this.getComponents(imgArray, decodeMap), bpc);
      var compsPos = 0;
      var opacity = this.getOpacity();
      var opacityPos = 0;
      var length = width * height * 4;

      for (var i = 0; i < length; i += 4) {
        buffer[i] = comps[compsPos++];
        buffer[i + 1] = comps[compsPos++];
        buffer[i + 2] = comps[compsPos++];
        buffer[i + 3] = opacity[opacityPos++];
      }
    },
    fillGrayBuffer: function fillGrayBuffer(buffer) {
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

      for (var i = 0; i < length; ++i)
        buffer[i] = comps[i];
    },
    getImageBytes: function getImageBytes(length) {
      this.image.reset();
      return this.image.getBytes(length);
    }
  };
  return constructor;
})();
function loadJpegStream(id, imageData, objs) {
  var img = new Image();
  img.onload = (function jpegImageLoaderOnload() {
    objs.resolve(id, img);
  });
  img.src = 'data:image/jpeg;base64,' + window.btoa(imageData);
}
