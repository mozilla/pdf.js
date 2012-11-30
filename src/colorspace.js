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

var ColorSpace = (function ColorSpaceClosure() {
  // Constructor should define this.numComps, this.defaultColor, this.name
  function ColorSpace() {
    error('should not call ColorSpace constructor');
  }

  ColorSpace.prototype = {
    /**
     * Converts the color value to the RGB color. The color components are
     * located in the src array starting from the srcOffset. Returns the array
     * of the rgb components, each value ranging from [0,255].
     */
    getRgb: function ColorSpace_getRgb(src, srcOffset) {
      error('Should not call ColorSpace.getRgb');
    },
    /**
     * Converts the color value to the RGB color, similar to the getRgb method.
     * The result placed into the dest array starting from the destOffset.
     */
    getRgbItem: function ColorSpace_getRgb(src, srcOffset, dest, destOffset) {
      error('Should not call ColorSpace.getRgbItem');
    },
    /**
     * Converts the specified number of the color values to the RGB colors.
     * The colors are located in the src array starting from the srcOffset.
     * The result is placed into the dest array starting from the destOffset.
     * The src array items shall be in [0,2^bits) range, the dest array items
     * will be in [0,255] range.
     */
    getRgbBuffer: function ColorSpace_getRgbBuffer(src, srcOffset, count,
                                                   dest, destOffset, bits) {
      error('Should not call ColorSpace.getRgbBuffer');
    },
    /**
     * Determines amount of the bytes is required to store the reslut of the
     * conversion that done by the getRgbBuffer method.
     */
    getOutputLength: function ColorSpace_getOutputLength(inputLength) {
      error('Should not call ColorSpace.getOutputLength');
    },
    /**
     * Returns true if source data will be equal the result/output data.
     */
    isPassthrough: function ColorSpace_isPassthrough(bits) {
      return false;
    },
    /**
     * Creates the output buffer and converts the specified number of the color
     * values to the RGB colors, similar to the getRgbBuffer.
     */
    createRgbBuffer: function ColorSpace_createRgbBuffer(src, srcOffset,
                                                         count, bits) {
      if (this.isPassthrough(bits)) {
        return src.subarray(srcOffset);
      }
      var destLength = this.getOutputLength(count * this.numComps);
      var dest = new Uint8Array(destLength);
      this.getRgbBuffer(src, srcOffset, count, dest, 0, bits);
      return dest;
    }
  };

  ColorSpace.parse = function ColorSpace_parse(cs, xref, res) {
    var IR = ColorSpace.parseToIR(cs, xref, res);
    if (IR instanceof AlternateCS)
      return IR;

    return ColorSpace.fromIR(IR);
  };

  ColorSpace.fromIR = function ColorSpace_fromIR(IR) {
    var name = isArray(IR) ? IR[0] : IR;

    switch (name) {
      case 'DeviceGrayCS':
        return new DeviceGrayCS();
      case 'DeviceRgbCS':
        return new DeviceRgbCS();
      case 'DeviceCmykCS':
        return new DeviceCmykCS();
      case 'PatternCS':
        var basePatternCS = IR[1];
        if (basePatternCS)
          basePatternCS = ColorSpace.fromIR(basePatternCS);
        return new PatternCS(basePatternCS);
      case 'IndexedCS':
        var baseIndexedCS = IR[1];
        var hiVal = IR[2];
        var lookup = IR[3];
        return new IndexedCS(ColorSpace.fromIR(baseIndexedCS), hiVal, lookup);
      case 'AlternateCS':
        var numComps = IR[1];
        var alt = IR[2];
        var tintFnIR = IR[3];

        return new AlternateCS(numComps, ColorSpace.fromIR(alt),
                                PDFFunction.fromIR(tintFnIR));
      case 'LabCS':
        var whitePoint = IR[1].WhitePoint;
        var blackPoint = IR[1].BlackPoint;
        var range = IR[1].Range;
        return new LabCS(whitePoint, blackPoint, range);
      default:
        error('Unkown name ' + name);
    }
    return null;
  };

  ColorSpace.parseToIR = function ColorSpace_parseToIR(cs, xref, res) {
    if (isName(cs)) {
      var colorSpaces = res.get('ColorSpace');
      if (isDict(colorSpaces)) {
        var refcs = colorSpaces.get(cs.name);
        if (refcs)
          cs = refcs;
      }
    }

    cs = xref.fetchIfRef(cs);
    var mode;

    if (isName(cs)) {
      mode = cs.name;
      this.mode = mode;

      switch (mode) {
        case 'DeviceGray':
        case 'G':
          return 'DeviceGrayCS';
        case 'DeviceRGB':
        case 'RGB':
          return 'DeviceRgbCS';
        case 'DeviceCMYK':
        case 'CMYK':
          return 'DeviceCmykCS';
        case 'Pattern':
          return ['PatternCS', null];
        default:
          error('unrecognized colorspace ' + mode);
      }
    } else if (isArray(cs)) {
      mode = cs[0].name;
      this.mode = mode;

      switch (mode) {
        case 'DeviceGray':
        case 'G':
          return 'DeviceGrayCS';
        case 'DeviceRGB':
        case 'RGB':
          return 'DeviceRgbCS';
        case 'DeviceCMYK':
        case 'CMYK':
          return 'DeviceCmykCS';
        case 'CalGray':
          return 'DeviceGrayCS';
        case 'CalRGB':
          return 'DeviceRgbCS';
        case 'ICCBased':
          var stream = xref.fetchIfRef(cs[1]);
          var dict = stream.dict;
          var numComps = dict.get('N');
          if (numComps == 1)
            return 'DeviceGrayCS';
          if (numComps == 3)
            return 'DeviceRgbCS';
          if (numComps == 4)
            return 'DeviceCmykCS';
          break;
        case 'Pattern':
          var basePatternCS = cs[1];
          if (basePatternCS)
            basePatternCS = ColorSpace.parseToIR(basePatternCS, xref, res);
          return ['PatternCS', basePatternCS];
        case 'Indexed':
        case 'I':
          var baseIndexedCS = ColorSpace.parseToIR(cs[1], xref, res);
          var hiVal = cs[2] + 1;
          var lookup = xref.fetchIfRef(cs[3]);
          if (isStream(lookup)) {
            lookup = lookup.getBytes();
          }
          return ['IndexedCS', baseIndexedCS, hiVal, lookup];
        case 'Separation':
        case 'DeviceN':
          var name = cs[1];
          var numComps = 1;
          if (isName(name))
            numComps = 1;
          else if (isArray(name))
            numComps = name.length;
          var alt = ColorSpace.parseToIR(cs[2], xref, res);
          var tintFnIR = PDFFunction.getIR(xref, xref.fetchIfRef(cs[3]));
          return ['AlternateCS', numComps, alt, tintFnIR];
        case 'Lab':
          var params = cs[1].getAll();
          return ['LabCS', params];
        default:
          error('unimplemented color space object "' + mode + '"');
      }
    } else {
      error('unrecognized color space object: "' + cs + '"');
    }
    return null;
  };
  /**
   * Checks if a decode map matches the default decode map for a color space.
   * This handles the general decode maps where there are two values per
   * component. e.g. [0, 1, 0, 1, 0, 1] for a RGB color.
   * This does not handle Lab, Indexed, or Pattern decode maps since they are
   * slightly different.
   * @param {Array} decode Decode map (usually from an image).
   * @param {Number} n Number of components the color space has.
   */
  ColorSpace.isDefaultDecode = function ColorSpace_isDefaultDecode(decode, n) {
    if (!decode)
      return true;

    if (n * 2 !== decode.length) {
      warn('The decode map is not the correct length');
      return true;
    }
    for (var i = 0, ii = decode.length; i < ii; i += 2) {
      if (decode[i] != 0 || decode[i + 1] != 1)
        return false;
    }
    return true;
  };

  return ColorSpace;
})();

/**
 * Alternate color space handles both Separation and DeviceN color spaces.  A
 * Separation color space is actually just a DeviceN with one color component.
 * Both color spaces use a tinting function to convert colors to a base color
 * space.
 */
var AlternateCS = (function AlternateCSClosure() {
  function AlternateCS(numComps, base, tintFn) {
    this.name = 'Alternate';
    this.numComps = numComps;
    this.defaultColor = new Float32Array(numComps);
    for (var i = 0; i < numComps; ++i) {
      this.defaultColor[i] = 1;
    }
    this.base = base;
    this.tintFn = tintFn;
  }

  AlternateCS.prototype = {
    getRgb: function AlternateCS_getRgb(src, srcOffset) {
      var rgb = new Uint8Array(3);
      this.getRgbItem(src, srcOffset, rgb, 0);
      return rgb;
    },
    getRgbItem: function AlternateCS_getRgbItem(src, srcOffset,
                                                dest, destOffset) {
      var baseNumComps = this.base.numComps;
      var input = 'subarray' in src ?
        src.subarray(srcOffset, srcOffset + this.numComps) :
        Array.prototype.slice.call(src, srcOffset, srcOffset + this.numComps);
      var tinted = this.tintFn(input);
      this.base.getRgbItem(tinted, 0, dest, destOffset);
    },
    getRgbBuffer: function AlternateCS_getRgbBuffer(src, srcOffset, count,
                                                    dest, destOffset, bits) {
      var tintFn = this.tintFn;
      var base = this.base;
      var scale = 1 / ((1 << bits) - 1);
      var baseNumComps = base.numComps;
      var isGetRgbBufferSupported = 'getRgbBuffer' in base;
      var isPassthrough = base.isPassthrough(8) || !isGetRgbBufferSupported;
      var pos = isPassthrough ? destOffset : 0;
      var baseBuf = isPassthrough ? dest : new Uint8Array(baseNumComps * count);
      var numComps = this.numComps;

      var scaled = new Float32Array(numComps);
      for (var i = 0; i < count; i++) {
        for (var j = 0; j < numComps; j++) {
          scaled[j] = src[srcOffset++] * scale;
        }
        var tinted = tintFn(scaled);
        if (isGetRgbBufferSupported) {
          for (var j = 0; j < baseNumComps; j++) {
            baseBuf[pos++] = tinted[j] * 255;
          }
        } else {
          base.getRgbItem(tinted, 0, baseBuf, pos);
          pos += baseNumComps;
        }
      }
      if (!isPassthrough) {
        base.getRgbBuffer(baseBuf, 0, count, dest, destOffset, 8);
      }
    },
    getOutputLength: function AlternateCS_getOutputLength(inputLength) {
      return this.base.getOutputLength(inputLength *
                                       this.base.numComps / this.numComps);
    },
    isPassthrough: ColorSpace.prototype.isPassthrough,
    createRgbBuffer: ColorSpace.prototype.createRgbBuffer,
    isDefaultDecode: function AlternateCS_isDefaultDecode(decodeMap) {
      return ColorSpace.isDefaultDecode(decodeMap, this.numComps);
    }
  };

  return AlternateCS;
})();

var PatternCS = (function PatternCSClosure() {
  function PatternCS(baseCS) {
    this.name = 'Pattern';
    this.base = baseCS;
  }
  PatternCS.prototype = {};

  return PatternCS;
})();

var IndexedCS = (function IndexedCSClosure() {
  function IndexedCS(base, highVal, lookup) {
    this.name = 'Indexed';
    this.numComps = 1;
    this.defaultColor = new Uint8Array([0]);
    this.base = base;
    this.highVal = highVal;

    var baseNumComps = base.numComps;
    var length = baseNumComps * highVal;
    var lookupArray;

    if (isStream(lookup)) {
      lookupArray = new Uint8Array(length);
      var bytes = lookup.getBytes(length);
      lookupArray.set(bytes);
    } else if (isString(lookup)) {
      lookupArray = new Uint8Array(length);
      for (var i = 0; i < length; ++i)
        lookupArray[i] = lookup.charCodeAt(i);
    } else if (lookup instanceof Uint8Array) {
      lookupArray = lookup;
    } else {
      error('Unrecognized lookup table: ' + lookup);
    }
    this.lookup = lookupArray;
  }

  IndexedCS.prototype = {
    getRgb: function IndexedCS_getRgb(src, srcOffset) {
      var numComps = this.base.numComps;
      var start = src[srcOffset] * numComps;
      return this.base.getRgb(this.lookup, start);
    },
    getRgbItem: function IndexedCS_getRgbItem(src, srcOffset,
                                              dest, destOffset) {
      var numComps = this.base.numComps;
      var start = src[srcOffset] * numComps;
      this.base.getRgbItem(this.lookup, start, dest, destOffset);
    },
    getRgbBuffer: function IndexedCS_getRgbBuffer(src, srcOffset, count,
                                                  dest, destOffset) {
      var base = this.base;
      var numComps = base.numComps;
      var outputDelta = base.getOutputLength(numComps);
      var lookup = this.lookup;

      for (var i = 0; i < count; ++i) {
        var lookupPos = src[srcOffset++] * numComps;
        base.getRgbBuffer(lookup, lookupPos, 1, dest, destOffset, 8);
        destOffset += outputDelta;
      }
    },
    getOutputLength: function IndexedCS_getOutputLength(inputLength) {
      return this.base.getOutputLength(inputLength * this.base.numComps);
    },
    isPassthrough: ColorSpace.prototype.isPassthrough,
    createRgbBuffer: ColorSpace.prototype.createRgbBuffer,
    isDefaultDecode: function IndexedCS_isDefaultDecode(decodeMap) {
      // indexed color maps shouldn't be changed
      return true;
    }
  };
  return IndexedCS;
})();

var DeviceGrayCS = (function DeviceGrayCSClosure() {
  function DeviceGrayCS() {
    this.name = 'DeviceGray';
    this.numComps = 1;
    this.defaultColor = new Float32Array([0]);
  }

  DeviceGrayCS.prototype = {
    getRgb: function DeviceGrayCS_getRgb(src, srcOffset) {
      var rgb = new Uint8Array(3);
      this.getRgbItem(src, srcOffset, rgb, 0);
      return rgb;
    },
    getRgbItem: function DeviceGrayCS_getRgbItem(src, srcOffset,
                                                 dest, destOffset) {
      var c = (src[srcOffset] * 255) | 0;
      c = c < 0 ? 0 : c > 255 ? 255 : c;
      dest[destOffset] = dest[destOffset + 1] = dest[destOffset + 2] = c;
    },
    getRgbBuffer: function DeviceGrayCS_getRgbBuffer(src, srcOffset, count,
                                                     dest, destOffset, bits) {
      var scale = 255 / ((1 << bits) - 1);
      var j = srcOffset, q = destOffset;
      for (var i = 0; i < count; ++i) {
        var c = (scale * src[j++]) | 0;
        dest[q++] = c;
        dest[q++] = c;
        dest[q++] = c;
      }
    },
    getOutputLength: function DeviceGrayCS_getOutputLength(inputLength) {
      return inputLength * 3;
    },
    isPassthrough: ColorSpace.prototype.isPassthrough,
    createRgbBuffer: ColorSpace.prototype.createRgbBuffer,
    isDefaultDecode: function DeviceGrayCS_isDefaultDecode(decodeMap) {
      return ColorSpace.isDefaultDecode(decodeMap, this.numComps);
    }
  };
  return DeviceGrayCS;
})();

var DeviceRgbCS = (function DeviceRgbCSClosure() {
  function DeviceRgbCS() {
    this.name = 'DeviceRGB';
    this.numComps = 3;
    this.defaultColor = new Float32Array([0, 0, 0]);
  }
  DeviceRgbCS.prototype = {
    getRgb: function DeviceRgbCS_getRgb(src, srcOffset) {
      var rgb = new Uint8Array(3);
      this.getRgbItem(src, srcOffset, rgb, 0);
      return rgb;
    },
    getRgbItem: function DeviceRgbCS_getRgbItem(src, srcOffset,
                                                dest, destOffset) {
      var r = src[srcOffset] * 255;
      var g = src[srcOffset + 1] * 255;
      var b = src[srcOffset + 2] * 255;
      dest[destOffset] = r < 0 ? 0 : r > 255 ? 255 : r;
      dest[destOffset + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      dest[destOffset + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    },
    getRgbBuffer: function DeviceRgbCS_getRgbBuffer(src, srcOffset, count,
                                                    dest, destOffset, bits) {
      var length = count * 3;
      if (bits == 8) {
        dest.set(src.subarray(srcOffset, srcOffset + length), destOffset);
        return;
      }
      var scale = 255 / ((1 << bits) - 1);
      var j = srcOffset, q = destOffset;
      for (var i = 0; i < length; ++i) {
        dest[q++] = (scale * input[j++]) | 0;
      }
    },
    getOutputLength: function DeviceRgbCS_getOutputLength(inputLength) {
      return inputLength;
    },
    isPassthrough: function DeviceRgbCS_isPassthrough(bits) {
      return bits == 8;
    },
    createRgbBuffer: ColorSpace.prototype.createRgbBuffer,
    isDefaultDecode: function DeviceRgbCS_isDefaultDecode(decodeMap) {
      return ColorSpace.isDefaultDecode(decodeMap, this.numComps);
    }
  };
  return DeviceRgbCS;
})();

var DeviceCmykCS = (function DeviceCmykCSClosure() {
  // Sampled RGB colors from CMYK US Web Coated (SWOP) colorspace
  var lut = new Uint8Array([
    255, 255, 254, 221, 222, 223, 191, 193, 195, 161, 163, 166, 133, 136, 138,
    105, 107, 109, 75, 75, 77, 35, 31, 32, 255, 252, 224, 226, 220, 198, 195,
    191, 173, 164, 162, 147, 136, 134, 122, 107, 106, 96, 75, 74, 66, 33, 29,
    24, 255, 249, 197, 229, 218, 174, 198, 190, 153, 166, 160, 129, 138, 133,
    107, 108, 104, 83, 76, 73, 56, 33, 28, 15, 255, 247, 168, 232, 216, 149,
    200, 188, 130, 168, 158, 110, 139, 131, 90, 110, 103, 70, 77, 72, 45, 32,
    27, 4, 255, 245, 140, 234, 214, 124, 202, 186, 108, 170, 157, 91, 140, 130,
    74, 110, 102, 56, 77, 71, 33, 31, 27, 0, 255, 243, 107, 235, 212, 95, 203,
    184, 83, 171, 155, 69, 141, 129, 55, 111, 101, 40, 77, 70, 19, 29, 26, 0,
    255, 241, 64, 237, 211, 59, 204, 183, 52, 171, 154, 42, 142, 128, 31, 111,
    100, 16, 77, 69, 0, 27, 26, 0, 255, 240, 0, 238, 209, 0, 205, 182, 3, 172,
    153, 0, 142, 127, 0, 112, 100, 0, 77, 69, 0, 26, 25, 0, 251, 225, 236, 218,
    196, 207, 189, 171, 181, 160, 144, 154, 133, 120, 128, 105, 94, 101, 74, 64,
    70, 35, 21, 25, 255, 222, 208, 222, 195, 184, 192, 169, 161, 162, 143, 136,
    135, 118, 113, 106, 92, 88, 75, 63, 60, 34, 20, 17, 255, 220, 184, 225, 193,
    162, 195, 168, 142, 164, 142, 120, 136, 117, 99, 107, 91, 77, 75, 62, 50,
    33, 20, 8, 255, 218, 157, 227, 191, 139, 197, 166, 121, 165, 140, 102, 137,
    116, 84, 108, 90, 64, 76, 61, 40, 32, 19, 0, 255, 216, 132, 229, 189, 116,
    198, 165, 101, 167, 139, 85, 138, 115, 69, 109, 89, 51, 76, 61, 28, 31, 18,
    0, 255, 214, 102, 230, 188, 90, 199, 163, 78, 167, 138, 65, 139, 114, 51,
    109, 89, 35, 76, 60, 14, 29, 18, 0, 255, 213, 65, 232, 186, 58, 200, 162,
    50, 168, 136, 39, 139, 113, 28, 110, 88, 12, 76, 60, 0, 27, 18, 0, 255, 212,
    8, 232, 185, 13, 201, 161, 11, 169, 136, 3, 139, 112, 0, 110, 87, 0, 76, 59,
    0, 26, 18, 0, 248, 197, 219, 216, 172, 192, 187, 150, 168, 158, 126, 143,
    132, 104, 119, 104, 81, 93, 74, 54, 64, 35, 10, 19, 251, 195, 193, 219, 171,
    171, 190, 149, 150, 161, 125, 127, 133, 103, 105, 106, 80, 81, 75, 53, 54,
    34, 10, 10, 254, 193, 171, 221, 169, 151, 192, 148, 132, 162, 124, 112, 134,
    102, 92, 106, 79, 70, 75, 52, 45, 34, 9, 1, 255, 191, 147, 223, 168, 130,
    193, 146, 113, 163, 123, 95, 135, 101, 77, 107, 78, 58, 75, 52, 35, 32, 9,
    0, 255, 190, 124, 225, 166, 109, 195, 145, 95, 164, 122, 79, 136, 100, 63,
    107, 77, 46, 76, 51, 24, 31, 9, 0, 255, 188, 97, 226, 165, 85, 196, 143, 74,
    165, 121, 60, 137, 99, 47, 108, 77, 31, 75, 51, 10, 29, 9, 0, 255, 187, 64,
    227, 164, 56, 196, 142, 48, 165, 120, 37, 137, 98, 25, 108, 76, 9, 75, 50,
    0, 28, 9, 0, 255, 186, 23, 228, 163, 21, 197, 142, 15, 166, 119, 5, 137, 98,
    0, 108, 76, 0, 75, 50, 0, 27, 8, 0, 245, 168, 201, 214, 147, 177, 186, 128,
    155, 157, 107, 131, 131, 88, 109, 104, 67, 85, 74, 42, 57, 35, 0, 12, 248,
    166, 178, 216, 146, 157, 188, 127, 138, 159, 107, 116, 132, 87, 96, 105, 66,
    74, 74, 41, 48, 35, 0, 3, 250, 165, 158, 218, 145, 139, 189, 126, 122, 160,
    106, 103, 133, 86, 84, 105, 66, 64, 75, 41, 39, 33, 0, 0, 252, 164, 136,
    220, 144, 120, 190, 125, 104, 161, 105, 87, 134, 86, 71, 106, 65, 52, 75,
    41, 29, 32, 0, 0, 253, 162, 115, 221, 142, 101, 191, 124, 88, 161, 104, 72,
    134, 85, 58, 106, 64, 41, 75, 40, 19, 31, 0, 0, 254, 161, 91, 222, 141, 80,
    192, 123, 68, 162, 103, 55, 134, 84, 42, 106, 64, 26, 75, 40, 6, 29, 0, 0,
    255, 160, 62, 223, 140, 54, 193, 122, 45, 162, 102, 34, 135, 83, 22, 106,
    63, 5, 74, 40, 0, 28, 0, 0, 255, 159, 29, 223, 140, 25, 193, 121, 18, 163,
    101, 7, 135, 83, 0, 107, 63, 0, 74, 40, 0, 28, 0, 0, 243, 142, 185, 212,
    123, 163, 184, 107, 142, 156, 89, 120, 130, 72, 100, 104, 53, 77, 74, 29,
    51, 35, 0, 4, 245, 140, 164, 214, 123, 145, 186, 106, 127, 157, 89, 107,
    131, 72, 88, 104, 53, 67, 74, 29, 42, 34, 0, 0, 247, 139, 146, 215, 122,
    129, 187, 106, 112, 158, 88, 94, 132, 71, 77, 104, 53, 57, 74, 29, 33, 33,
    0, 0, 248, 138, 126, 217, 121, 111, 188, 105, 96, 159, 87, 80, 132, 70, 64,
    105, 52, 47, 74, 29, 24, 31, 0, 0, 249, 137, 107, 218, 120, 94, 189, 104,
    81, 159, 86, 66, 132, 70, 52, 105, 52, 36, 74, 29, 15, 30, 0, 0, 250, 136,
    85, 218, 119, 74, 189, 103, 63, 160, 86, 51, 133, 69, 38, 105, 51, 22, 74,
    29, 2, 29, 0, 0, 251, 135, 59, 219, 118, 51, 190, 102, 42, 160, 85, 31, 133,
    69, 19, 105, 51, 3, 74, 29, 0, 29, 0, 0, 252, 134, 31, 219, 118, 26, 190,
    102, 19, 160, 85, 7, 133, 69, 0, 105, 51, 0, 73, 29, 0, 28, 0, 0, 240, 113,
    169, 210, 98, 149, 183, 84, 130, 155, 69, 110, 129, 54, 90, 103, 37, 70, 74,
    11, 44, 32, 0, 1, 242, 111, 150, 212, 97, 132, 184, 84, 116, 156, 69, 97,
    130, 54, 79, 103, 37, 60, 74, 12, 36, 31, 0, 0, 244, 111, 134, 213, 97, 118,
    185, 83, 102, 157, 68, 86, 130, 54, 69, 104, 37, 51, 74, 13, 28, 30, 0, 0,
    245, 110, 116, 214, 96, 102, 186, 83, 88, 157, 68, 73, 131, 53, 58, 104, 37,
    41, 74, 14, 19, 29, 0, 0, 246, 110, 98, 215, 96, 86, 186, 82, 74, 157, 67,
    60, 131, 53, 46, 104, 37, 30, 73, 14, 10, 28, 0, 0, 247, 109, 79, 215, 95,
    69, 187, 82, 58, 158, 67, 46, 131, 53, 33, 104, 37, 18, 73, 15, 1, 28, 0, 0,
    247, 108, 56, 216, 95, 48, 187, 82, 40, 158, 67, 29, 131, 53, 16, 104, 37,
    0, 73, 15, 0, 27, 0, 0, 248, 108, 32, 216, 94, 27, 187, 81, 20, 158, 67, 8,
    131, 53, 0, 104, 37, 0, 72, 16, 0, 27, 0, 0, 238, 78, 154, 208, 66, 135,
    181, 55, 118, 154, 43, 99, 129, 30, 81, 103, 12, 62, 74, 0, 38, 27, 0, 0,
    240, 77, 136, 210, 66, 120, 183, 56, 105, 155, 43, 88, 129, 30, 71, 103, 13,
    53, 73, 0, 29, 26, 0, 0, 241, 77, 122, 211, 66, 107, 183, 56, 93, 155, 44,
    77, 129, 31, 62, 103, 14, 44, 73, 0, 23, 26, 0, 0, 242, 77, 106, 211, 66,
    92, 184, 56, 80, 155, 44, 65, 129, 31, 51, 103, 15, 35, 73, 0, 14, 25, 0, 0,
    243, 77, 90, 212, 66, 79, 184, 56, 67, 156, 44, 54, 129, 32, 41, 103, 16,
    25, 73, 0, 6, 25, 0, 0, 243, 77, 73, 213, 66, 63, 184, 56, 53, 156, 44, 41,
    130, 32, 28, 103, 17, 13, 72, 0, 0, 25, 0, 0, 244, 77, 53, 213, 67, 45, 185,
    56, 37, 156, 45, 26, 130, 33, 13, 103, 18, 0, 72, 0, 0, 25, 0, 0, 244, 77,
    33, 213, 67, 28, 185, 57, 21, 156, 45, 9, 130, 33, 0, 103, 19, 0, 72, 0, 0,
    24, 0, 0, 237, 13, 138, 207, 4, 122, 180, 0, 106, 153, 0, 89, 128, 0, 72,
    102, 0, 54, 73, 0, 31, 21, 0, 0, 238, 16, 123, 208, 6, 108, 181, 0, 94, 154,
    0, 78, 128, 0, 63, 102, 0, 46, 72, 0, 24, 21, 0, 0, 239, 20, 110, 209, 11,
    96, 181, 1, 83, 154, 0, 69, 128, 0, 54, 102, 0, 38, 72, 0, 17, 22, 0, 0,
    239, 23, 96, 209, 15, 84, 182, 5, 72, 154, 0, 58, 128, 0, 45, 102, 0, 29,
    72, 0, 9, 22, 0, 0, 240, 26, 82, 210, 19, 71, 182, 10, 60, 154, 0, 48, 128,
    0, 35, 102, 0, 20, 72, 0, 3, 22, 0, 0, 241, 27, 67, 210, 21, 58, 182, 14,
    48, 154, 3, 37, 128, 0, 24, 102, 0, 8, 71, 0, 0, 22, 0, 0, 241, 29, 50, 210,
    23, 42, 183, 17, 34, 154, 6, 23, 129, 0, 10, 102, 0, 0, 71, 0, 0, 22, 0, 0,
    241, 30, 34, 211, 25, 28, 183, 19, 21, 155, 9, 10, 129, 0, 0, 102, 0, 0, 71,
    0, 0, 22, 0, 0, 211, 239, 252, 184, 210, 221, 160, 183, 194, 135, 155, 164,
    111, 128, 137, 87, 101, 109, 59, 70, 76, 22, 28, 32, 218, 237, 223, 190,
    208, 196, 165, 181, 172, 139, 153, 146, 114, 127, 121, 89, 100, 95, 61, 69,
    66, 21, 27, 25, 223, 235, 196, 195, 206, 174, 169, 179, 152, 142, 151, 129,
    117, 126, 107, 91, 99, 83, 62, 68, 56, 20, 26, 17, 227, 232, 168, 198, 204,
    149, 171, 177, 130, 144, 150, 110, 119, 124, 91, 93, 98, 70, 63, 68, 46, 20,
    25, 6, 231, 230, 142, 201, 202, 125, 174, 176, 109, 146, 148, 92, 120, 123,
    75, 94, 97, 57, 63, 67, 35, 19, 25, 0, 234, 229, 112, 203, 200, 98, 176,
    174, 86, 147, 147, 71, 121, 122, 57, 94, 96, 42, 64, 66, 21, 17, 24, 0, 236,
    227, 75, 205, 199, 66, 177, 173, 57, 148, 146, 47, 122, 121, 35, 95, 95, 21,
    64, 65, 2, 14, 24, 0, 238, 226, 32, 207, 198, 30, 178, 172, 25, 149, 145,
    17, 123, 120, 6, 95, 94, 0, 64, 65, 0, 11, 24, 0, 211, 211, 233, 184, 186,
    206, 160, 162, 180, 135, 137, 153, 112, 113, 127, 88, 89, 100, 61, 60, 70,
    23, 18, 26, 217, 209, 207, 190, 184, 183, 165, 161, 160, 139, 136, 136, 115,
    112, 113, 90, 88, 88, 62, 59, 60, 23, 17, 19, 221, 208, 183, 193, 183, 162,
    167, 159, 142, 141, 134, 120, 116, 111, 99, 91, 87, 77, 62, 59, 51, 22, 17,
    10, 224, 206, 158, 196, 181, 139, 170, 157, 122, 143, 133, 103, 118, 110,
    84, 92, 86, 64, 63, 58, 40, 22, 16, 0, 227, 204, 133, 198, 179, 118, 172,
    156, 102, 144, 132, 86, 119, 109, 70, 93, 85, 52, 64, 57, 30, 20, 16, 0,
    230, 203, 106, 200, 178, 93, 173, 155, 81, 145, 130, 67, 120, 108, 53, 94,
    84, 37, 64, 57, 17, 17, 16, 0, 232, 201, 73, 202, 177, 64, 175, 154, 55,
    146, 129, 44, 121, 107, 33, 94, 83, 18, 64, 56, 0, 15, 16, 0, 233, 201, 38,
    203, 176, 32, 175, 153, 27, 147, 129, 18, 121, 106, 6, 94, 83, 0, 64, 56, 0,
    13, 16, 0, 210, 186, 216, 184, 163, 191, 160, 143, 167, 136, 120, 142, 112,
    99, 118, 88, 77, 93, 61, 50, 64, 24, 6, 21, 215, 184, 192, 189, 162, 170,
    164, 141, 149, 138, 119, 126, 115, 98, 104, 90, 76, 81, 62, 50, 54, 24, 6,
    12, 219, 183, 171, 192, 161, 151, 166, 140, 132, 140, 118, 112, 116, 97, 92,
    91, 75, 71, 63, 49, 46, 23, 6, 3, 222, 181, 148, 194, 159, 130, 168, 139,
    114, 142, 117, 95, 117, 96, 78, 92, 74, 59, 63, 49, 36, 22, 6, 0, 224, 180,
    125, 196, 158, 110, 170, 138, 96, 143, 116, 80, 118, 95, 64, 92, 74, 47, 64,
    48, 25, 20, 6, 0, 226, 178, 100, 197, 157, 88, 171, 136, 76, 144, 115, 62,
    119, 94, 49, 93, 73, 33, 64, 48, 13, 18, 6, 0, 228, 177, 71, 199, 156, 62,
    172, 135, 52, 144, 114, 41, 119, 94, 30, 93, 72, 14, 64, 47, 0, 16, 6, 0,
    229, 177, 40, 200, 155, 34, 173, 135, 27, 145, 113, 18, 120, 93, 5, 93, 72,
    0, 63, 47, 0, 15, 6, 0, 210, 159, 199, 184, 140, 176, 160, 122, 154, 136,
    102, 131, 113, 84, 108, 89, 64, 85, 62, 39, 57, 25, 0, 14, 214, 158, 177,
    188, 139, 157, 163, 121, 137, 138, 102, 116, 114, 83, 96, 90, 63, 74, 63,
    38, 48, 25, 0, 5, 217, 157, 158, 190, 138, 139, 165, 120, 122, 139, 101,
    103, 115, 82, 84, 91, 62, 64, 63, 38, 40, 23, 0, 0, 219, 156, 137, 192, 137,
    120, 167, 119, 105, 140, 100, 88, 116, 82, 71, 91, 62, 53, 63, 38, 30, 22,
    0, 0, 221, 155, 116, 193, 136, 102, 168, 118, 89, 141, 99, 73, 117, 81, 59,
    92, 61, 42, 63, 38, 21, 20, 0, 0, 223, 153, 94, 195, 135, 82, 169, 117, 70,
    142, 98, 57, 117, 80, 44, 92, 61, 29, 63, 37, 8, 18, 0, 0, 224, 153, 68,
    196, 134, 58, 170, 116, 49, 143, 97, 38, 118, 80, 26, 92, 60, 11, 63, 37, 0,
    17, 0, 0, 225, 152, 41, 197, 133, 34, 170, 116, 27, 143, 97, 17, 118, 79, 4,
    92, 60, 0, 63, 37, 0, 16, 0, 0, 209, 134, 183, 183, 118, 162, 160, 102, 142,
    136, 85, 120, 113, 69, 100, 89, 50, 77, 62, 26, 51, 23, 0, 6, 213, 133, 163,
    187, 117, 144, 163, 102, 126, 137, 85, 107, 114, 68, 88, 90, 50, 67, 63, 26,
    43, 22, 0, 1, 215, 133, 146, 188, 116, 129, 164, 101, 112, 139, 84, 94, 115,
    68, 77, 91, 50, 58, 63, 27, 34, 20, 0, 0, 217, 132, 127, 190, 116, 111, 165,
    100, 97, 139, 84, 81, 116, 67, 65, 91, 49, 48, 63, 27, 25, 19, 0, 0, 219,
    131, 108, 191, 115, 95, 166, 100, 82, 140, 83, 68, 116, 67, 53, 91, 49, 37,
    63, 27, 17, 17, 0, 0, 220, 130, 88, 192, 114, 76, 167, 99, 65, 141, 82, 53,
    116, 66, 40, 91, 49, 24, 63, 27, 5, 16, 0, 0, 221, 129, 64, 193, 113, 55,
    168, 98, 46, 141, 82, 35, 117, 66, 23, 91, 49, 7, 63, 27, 0, 14, 0, 0, 222,
    129, 41, 194, 113, 34, 168, 98, 26, 141, 81, 16, 117, 66, 3, 92, 48, 0, 62,
    27, 0, 13, 0, 0, 209, 108, 168, 183, 94, 148, 160, 81, 130, 135, 66, 110,
    113, 51, 91, 89, 35, 70, 63, 8, 45, 18, 0, 1, 212, 107, 150, 186, 94, 132,
    162, 81, 116, 137, 66, 97, 114, 52, 80, 90, 35, 60, 63, 9, 37, 16, 0, 0,
    214, 107, 134, 187, 93, 118, 163, 80, 103, 138, 66, 86, 114, 51, 70, 90, 35,
    52, 63, 10, 29, 15, 0, 0, 215, 106, 117, 188, 93, 103, 164, 80, 89, 138, 66,
    74, 115, 51, 59, 90, 35, 42, 63, 11, 21, 13, 0, 0, 216, 106, 100, 189, 92,
    88, 164, 79, 75, 139, 65, 62, 115, 51, 48, 91, 35, 32, 63, 12, 12, 12, 0, 0,
    217, 105, 82, 190, 92, 71, 165, 79, 60, 139, 65, 48, 115, 51, 35, 91, 35,
    20, 62, 13, 3, 11, 0, 0, 218, 105, 61, 191, 92, 52, 166, 79, 43, 140, 65,
    32, 116, 51, 20, 91, 35, 3, 62, 14, 0, 10, 0, 0, 219, 104, 41, 192, 91, 34,
    166, 78, 26, 140, 65, 15, 116, 51, 2, 91, 35, 0, 62, 14, 0, 10, 0, 0, 208,
    76, 153, 183, 65, 135, 159, 54, 118, 135, 42, 99, 113, 29, 82, 89, 10, 62,
    62, 0, 38, 10, 0, 0, 211, 76, 137, 185, 65, 121, 161, 55, 105, 136, 43, 88,
    114, 30, 72, 90, 12, 54, 63, 0, 31, 9, 0, 0, 212, 76, 122, 186, 66, 108,
    162, 55, 94, 137, 43, 78, 114, 30, 63, 90, 13, 45, 62, 0, 24, 9, 0, 0, 213,
    76, 107, 187, 66, 94, 162, 55, 81, 137, 43, 67, 114, 31, 52, 90, 15, 36, 62,
    0, 16, 8, 0, 0, 214, 76, 92, 188, 66, 80, 163, 55, 69, 138, 44, 56, 114, 31,
    42, 90, 16, 27, 62, 0, 8, 8, 0, 0, 215, 76, 76, 188, 66, 65, 164, 55, 55,
    138, 44, 43, 114, 32, 31, 90, 16, 16, 62, 0, 1, 7, 0, 0, 216, 76, 57, 189,
    66, 49, 164, 56, 40, 138, 44, 29, 115, 32, 16, 90, 17, 1, 61, 0, 0, 7, 0, 0,
    217, 76, 40, 190, 66, 33, 164, 56, 25, 138, 44, 14, 114, 33, 1, 90, 18, 0,
    61, 0, 0, 7, 0, 0, 207, 26, 139, 182, 16, 122, 159, 3, 106, 135, 0, 89, 113,
    0, 73, 89, 0, 55, 62, 0, 32, 4, 0, 0, 210, 27, 124, 184, 18, 109, 160, 7,
    95, 136, 0, 79, 113, 0, 64, 90, 0, 47, 62, 0, 25, 4, 0, 0, 211, 30, 111,
    185, 21, 98, 161, 11, 84, 136, 0, 70, 113, 0, 55, 90, 0, 39, 62, 0, 18, 4,
    0, 0, 212, 32, 98, 185, 24, 85, 161, 15, 73, 136, 2, 60, 113, 0, 46, 90, 0,
    30, 61, 0, 11, 4, 0, 0, 213, 34, 85, 186, 26, 73, 162, 17, 62, 137, 5, 50,
    113, 0, 37, 89, 0, 22, 61, 0, 5, 4, 0, 0, 213, 35, 70, 187, 27, 60, 162, 19,
    50, 137, 8, 39, 114, 0, 26, 89, 0, 11, 61, 0, 0, 4, 0, 0, 214, 35, 54, 187,
    29, 45, 163, 21, 37, 137, 11, 26, 114, 0, 13, 89, 0, 0, 60, 0, 0, 4, 0, 0,
    214, 35, 40, 188, 29, 32, 163, 22, 24, 137, 12, 13, 114, 0, 0, 89, 0, 0, 60,
    0, 0, 4, 0, 0, 169, 226, 249, 148, 199, 219, 129, 173, 192, 108, 147, 163,
    88, 122, 136, 68, 96, 108, 43, 66, 76, 4, 25, 33, 178, 224, 221, 156, 197,
    195, 136, 172, 171, 114, 145, 145, 93, 121, 120, 71, 95, 95, 46, 65, 66, 4,
    24, 25, 185, 222, 196, 162, 195, 173, 140, 170, 151, 117, 144, 128, 96, 119,
    106, 74, 94, 83, 47, 65, 57, 4, 24, 18, 190, 220, 169, 166, 193, 149, 144,
    168, 130, 120, 142, 110, 99, 118, 91, 76, 93, 70, 49, 64, 46, 3, 23, 8, 195,
    218, 143, 170, 191, 126, 147, 167, 110, 123, 141, 93, 100, 117, 76, 77, 92,
    58, 50, 63, 36, 3, 23, 0, 199, 216, 115, 173, 190, 101, 149, 165, 88, 125,
    140, 74, 102, 116, 59, 78, 91, 43, 51, 63, 23, 0, 23, 0, 202, 215, 83, 176,
    189, 72, 152, 164, 62, 126, 138, 51, 103, 115, 39, 79, 90, 25, 51, 62, 6, 0,
    22, 0, 204, 214, 50, 178, 188, 43, 153, 163, 37, 127, 138, 28, 104, 114, 18,
    80, 89, 3, 51, 62, 0, 0, 22, 0, 172, 200, 231, 152, 176, 204, 132, 154, 178,
    111, 130, 152, 91, 108, 126, 70, 84, 100, 46, 57, 70, 9, 15, 27, 180, 198,
    205, 158, 175, 182, 138, 153, 159, 116, 129, 135, 95, 107, 112, 73, 83, 88,
    48, 56, 60, 8, 15, 20, 186, 197, 182, 163, 173, 161, 141, 151, 141, 119,
    128, 119, 97, 106, 99, 75, 82, 77, 49, 55, 51, 8, 14, 11, 190, 195, 158,
    166, 172, 139, 144, 150, 122, 121, 127, 103, 99, 105, 84, 77, 81, 65, 50,
    55, 41, 8, 14, 2, 194, 193, 135, 169, 170, 119, 147, 148, 103, 123, 125, 87,
    101, 104, 70, 78, 81, 53, 51, 54, 31, 5, 14, 0, 197, 192, 109, 172, 169, 96,
    149, 147, 83, 124, 124, 69, 102, 103, 55, 79, 80, 39, 51, 54, 19, 2, 14, 0,
    200, 191, 80, 174, 168, 69, 150, 146, 59, 126, 123, 48, 103, 102, 36, 79,
    79, 22, 52, 53, 2, 0, 14, 0, 202, 190, 51, 176, 167, 43, 152, 145, 36, 127,
    123, 27, 103, 101, 16, 80, 79, 1, 52, 53, 0, 0, 14, 0, 175, 176, 215, 154,
    156, 190, 134, 136, 166, 113, 115, 141, 93, 94, 118, 72, 73, 93, 48, 47, 64,
    12, 2, 22, 182, 175, 191, 160, 154, 169, 139, 135, 148, 117, 114, 126, 96,
    94, 104, 75, 72, 81, 50, 47, 55, 12, 3, 14, 186, 174, 170, 163, 153, 151,
    142, 134, 132, 119, 113, 111, 98, 93, 92, 76, 71, 71, 51, 46, 46, 11, 3, 5,
    190, 172, 148, 166, 152, 130, 144, 132, 114, 121, 112, 96, 100, 92, 78, 77,
    71, 59, 51, 46, 36, 9, 4, 0, 192, 171, 127, 169, 151, 111, 146, 131, 97,
    123, 111, 81, 101, 91, 65, 78, 70, 48, 52, 45, 26, 6, 4, 0, 195, 170, 103,
    171, 150, 90, 148, 130, 78, 124, 110, 64, 102, 90, 51, 79, 70, 35, 52, 45,
    15, 3, 5, 0, 198, 169, 76, 173, 149, 66, 149, 129, 56, 125, 109, 45, 103,
    89, 33, 79, 69, 18, 52, 45, 0, 1, 5, 0, 199, 168, 51, 174, 148, 43, 150,
    129, 35, 126, 108, 26, 103, 89, 14, 80, 69, 0, 52, 45, 0, 0, 5, 0, 177, 151,
    198, 156, 134, 175, 136, 117, 153, 115, 98, 130, 95, 80, 108, 74, 60, 85,
    50, 36, 58, 11, 0, 15, 183, 150, 176, 161, 133, 156, 140, 116, 137, 118, 97,
    116, 97, 79, 96, 76, 60, 74, 51, 36, 49, 11, 0, 6, 186, 150, 158, 163, 132,
    139, 142, 115, 122, 120, 97, 103, 99, 79, 84, 77, 59, 64, 52, 36, 41, 9, 0,
    1, 189, 148, 137, 166, 131, 121, 144, 114, 105, 121, 96, 88, 100, 78, 72,
    78, 59, 54, 52, 36, 31, 7, 0, 0, 191, 147, 118, 168, 130, 103, 145, 113, 90,
    122, 95, 75, 101, 77, 60, 78, 59, 43, 52, 35, 22, 5, 0, 0, 193, 147, 97,
    169, 129, 84, 147, 112, 72, 123, 94, 59, 101, 77, 46, 79, 58, 31, 52, 35,
    11, 4, 0, 0, 195, 146, 73, 171, 128, 62, 148, 111, 53, 124, 93, 41, 102, 76,
    30, 79, 58, 15, 52, 35, 0, 3, 0, 0, 197, 145, 50, 172, 128, 42, 149, 111,
    34, 125, 93, 24, 102, 76, 12, 79, 57, 0, 52, 35, 0, 2, 0, 0, 179, 128, 183,
    157, 113, 162, 137, 98, 142, 116, 82, 120, 96, 66, 100, 75, 48, 78, 51, 24,
    52, 5, 0, 8, 183, 128, 163, 161, 113, 144, 140, 98, 126, 119, 81, 107, 98,
    65, 88, 76, 48, 68, 52, 24, 43, 6, 0, 1, 186, 127, 146, 163, 112, 129, 142,
    97, 112, 120, 81, 95, 99, 65, 77, 77, 47, 58, 52, 24, 35, 4, 0, 0, 188, 126,
    128, 165, 111, 112, 144, 96, 97, 121, 80, 81, 100, 65, 66, 78, 47, 48, 53,
    24, 26, 3, 0, 0, 190, 126, 110, 167, 110, 96, 145, 96, 83, 122, 80, 69, 101,
    64, 54, 78, 47, 38, 52, 25, 18, 2, 0, 0, 192, 125, 90, 168, 110, 79, 146,
    95, 67, 123, 79, 54, 101, 64, 42, 79, 47, 26, 52, 25, 7, 2, 0, 0, 194, 124,
    69, 170, 109, 59, 147, 95, 49, 123, 79, 38, 101, 63, 26, 79, 47, 11, 52, 25,
    0, 1, 0, 0, 195, 124, 49, 171, 109, 40, 148, 94, 32, 124, 78, 22, 102, 63,
    9, 79, 46, 0, 52, 25, 0, 1, 0, 0, 180, 104, 168, 158, 91, 148, 138, 78, 130,
    117, 64, 110, 97, 49, 91, 76, 33, 70, 52, 7, 46, 2, 0, 1, 184, 103, 150,
    162, 91, 133, 141, 78, 116, 119, 64, 98, 99, 50, 80, 77, 33, 61, 52, 8, 37,
    2, 0, 0, 186, 103, 135, 163, 90, 119, 142, 78, 103, 120, 64, 87, 99, 50, 70,
    78, 33, 52, 52, 10, 30, 1, 0, 0, 188, 103, 118, 165, 90, 103, 143, 77, 90,
    121, 63, 75, 100, 49, 60, 78, 33, 43, 52, 11, 22, 1, 0, 0, 189, 102, 102,
    166, 89, 89, 144, 77, 76, 121, 63, 63, 100, 49, 49, 78, 34, 33, 52, 12, 14,
    0, 0, 0, 191, 102, 84, 167, 89, 73, 145, 77, 62, 122, 63, 50, 101, 49, 37,
    78, 34, 22, 52, 13, 4, 0, 0, 0, 192, 101, 65, 168, 89, 55, 146, 76, 46, 123,
    63, 35, 101, 49, 23, 78, 34, 7, 51, 13, 0, 0, 0, 0, 193, 101, 48, 169, 88,
    39, 146, 76, 31, 123, 63, 20, 101, 49, 8, 78, 34, 0, 51, 14, 0, 0, 0, 0,
    181, 75, 154, 159, 64, 136, 139, 54, 118, 118, 41, 100, 98, 28, 82, 77, 8,
    63, 51, 0, 39, 0, 0, 0, 184, 75, 137, 162, 65, 121, 141, 54, 106, 119, 42,
    89, 99, 29, 72, 77, 11, 54, 52, 0, 32, 0, 0, 0, 186, 75, 123, 163, 65, 109,
    142, 54, 94, 120, 43, 79, 99, 30, 63, 78, 12, 46, 52, 0, 25, 0, 0, 0, 187,
    76, 108, 164, 65, 95, 143, 55, 82, 121, 43, 68, 100, 31, 54, 78, 14, 37, 52,
    0, 17, 0, 0, 0, 188, 76, 94, 165, 65, 82, 144, 55, 70, 121, 43, 57, 100, 31,
    44, 78, 15, 28, 51, 0, 9, 0, 0, 0, 189, 75, 78, 166, 65, 68, 144, 55, 57,
    121, 43, 45, 100, 31, 33, 78, 16, 18, 51, 0, 2, 0, 0, 0, 190, 75, 61, 167,
    65, 52, 145, 55, 42, 122, 44, 31, 100, 32, 19, 78, 16, 4, 51, 0, 0, 0, 0, 0,
    191, 75, 46, 168, 65, 37, 145, 55, 29, 122, 44, 18, 100, 32, 5, 78, 17, 0,
    50, 0, 0, 0, 0, 0, 181, 35, 140, 160, 24, 123, 140, 12, 107, 118, 0, 90, 98,
    0, 74, 77, 0, 56, 51, 0, 33, 0, 0, 0, 184, 34, 125, 162, 26, 110, 141, 15,
    96, 120, 1, 80, 99, 0, 65, 78, 0, 48, 51, 0, 26, 0, 0, 0, 186, 36, 113, 163,
    27, 99, 142, 18, 86, 120, 5, 71, 99, 0, 57, 78, 0, 40, 51, 0, 20, 0, 0, 0,
    187, 38, 99, 164, 30, 87, 142, 21, 74, 120, 8, 61, 99, 0, 48, 78, 0, 32, 51,
    0, 12, 0, 0, 0, 187, 39, 87, 164, 31, 75, 143, 22, 64, 120, 11, 51, 100, 0,
    39, 78, 0, 24, 51, 0, 6, 0, 0, 0, 188, 40, 73, 165, 32, 62, 143, 24, 52,
    121, 13, 40, 100, 0, 28, 78, 0, 14, 51, 0, 0, 0, 0, 0, 189, 40, 58, 166, 33,
    48, 144, 25, 39, 121, 15, 28, 100, 1, 16, 78, 0, 2, 50, 0, 0, 0, 0, 0, 190,
    40, 45, 166, 34, 36, 144, 26, 27, 121, 16, 17, 100, 3, 3, 77, 0, 0, 49, 0,
    0, 0, 0, 0, 120, 213, 247, 106, 188, 217, 92, 164, 190, 76, 139, 162, 60,
    115, 135, 43, 91, 107, 21, 62, 76, 0, 22, 34, 134, 211, 219, 118, 186, 193,
    102, 162, 169, 84, 138, 144, 67, 114, 120, 49, 90, 95, 26, 62, 66, 0, 22,
    26, 143, 209, 195, 125, 184, 172, 108, 161, 151, 90, 136, 128, 72, 113, 106,
    53, 89, 83, 29, 61, 57, 0, 22, 19, 150, 207, 169, 131, 182, 149, 113, 159,
    130, 94, 135, 110, 76, 112, 91, 56, 88, 71, 31, 60, 47, 0, 21, 9, 156, 205,
    145, 136, 181, 127, 117, 158, 111, 97, 133, 94, 78, 111, 77, 58, 87, 59, 33,
    60, 37, 0, 21, 0, 161, 204, 118, 141, 179, 104, 121, 156, 90, 100, 132, 75,
    81, 110, 61, 60, 86, 45, 35, 59, 25, 0, 21, 0, 165, 203, 89, 144, 178, 77,
    124, 155, 67, 102, 131, 55, 82, 109, 43, 62, 85, 29, 36, 59, 10, 0, 21, 0,
    169, 202, 62, 147, 178, 53, 126, 155, 45, 104, 131, 36, 84, 108, 25, 62, 85,
    11, 36, 58, 0, 0, 21, 0, 129, 189, 229, 114, 167, 202, 99, 146, 177, 83,
    124, 151, 67, 102, 126, 49, 79, 99, 28, 53, 70, 0, 12, 28, 140, 188, 204,
    124, 166, 180, 107, 145, 158, 89, 123, 134, 72, 101, 111, 54, 79, 88, 31,
    53, 60, 0, 12, 21, 148, 186, 182, 130, 164, 161, 112, 144, 141, 93, 121,
    119, 76, 100, 99, 56, 78, 77, 33, 52, 51, 0, 12, 13, 153, 184, 158, 134,
    163, 140, 116, 142, 122, 97, 120, 103, 78, 99, 85, 59, 77, 65, 35, 52, 42,
    0, 12, 3, 158, 183, 136, 138, 161, 120, 119, 141, 104, 99, 119, 87, 80, 98,
    71, 60, 77, 54, 36, 51, 32, 0, 12, 0, 162, 182, 112, 142, 160, 98, 122, 140,
    85, 102, 118, 70, 82, 97, 56, 62, 76, 41, 37, 51, 21, 0, 11, 0, 166, 181,
    85, 145, 159, 74, 125, 139, 63, 103, 117, 51, 84, 97, 39, 63, 75, 25, 37,
    51, 6, 0, 11, 0, 168, 180, 60, 147, 158, 51, 126, 138, 43, 105, 116, 34, 85,
    96, 23, 64, 75, 8, 38, 50, 0, 0, 11, 0, 136, 167, 213, 120, 148, 188, 105,
    129, 165, 88, 109, 140, 71, 90, 117, 54, 69, 92, 32, 44, 64, 0, 2, 23, 145,
    166, 190, 128, 147, 168, 111, 128, 147, 93, 108, 125, 75, 89, 104, 57, 68,
    81, 34, 44, 55, 0, 2, 15, 151, 165, 170, 133, 146, 150, 115, 127, 131, 96,
    107, 111, 78, 88, 92, 59, 68, 71, 36, 43, 46, 0, 2, 6, 155, 163, 148, 136,
    144, 131, 118, 126, 114, 99, 106, 96, 80, 87, 79, 61, 67, 60, 37, 43, 37, 0,
    2, 0, 159, 162, 128, 140, 143, 112, 121, 125, 97, 101, 105, 82, 82, 87, 66,
    62, 67, 49, 38, 43, 27, 0, 2, 0, 163, 161, 105, 142, 142, 92, 123, 124, 80,
    103, 104, 66, 83, 86, 52, 63, 66, 37, 39, 43, 17, 0, 2, 0, 166, 160, 81,
    145, 141, 70, 125, 123, 59, 104, 104, 48, 84, 85, 36, 64, 66, 21, 39, 42, 2,
    0, 1, 0, 168, 160, 59, 147, 141, 50, 126, 122, 41, 105, 103, 32, 85, 85, 20,
    64, 65, 6, 39, 42, 0, 0, 1, 0, 142, 144, 197, 125, 128, 174, 109, 111, 153,
    92, 93, 130, 75, 76, 108, 57, 57, 85, 36, 33, 58, 0, 0, 16, 149, 143, 176,
    131, 127, 156, 114, 110, 136, 96, 93, 116, 78, 75, 96, 60, 57, 74, 37, 33,
    49, 0, 0, 7, 153, 142, 157, 135, 126, 139, 117, 110, 122, 98, 92, 103, 80,
    75, 84, 61, 56, 65, 38, 33, 41, 0, 0, 1, 157, 142, 138, 138, 125, 121, 120,
    109, 106, 100, 91, 89, 82, 74, 72, 62, 56, 54, 39, 33, 32, 0, 0, 0, 160,
    141, 119, 140, 124, 105, 122, 108, 91, 102, 91, 76, 83, 74, 61, 63, 56, 44,
    40, 33, 23, 0, 0, 0, 163, 140, 99, 143, 123, 86, 124, 107, 74, 103, 90, 61,
    84, 73, 48, 64, 55, 32, 40, 33, 13, 0, 0, 0, 165, 139, 77, 145, 122, 66,
    125, 107, 56, 104, 89, 44, 85, 73, 33, 65, 55, 18, 40, 33, 1, 0, 0, 0, 167,
    139, 57, 146, 122, 48, 126, 106, 39, 105, 89, 29, 86, 72, 18, 65, 55, 3, 40,
    33, 0, 0, 0, 0, 146, 123, 182, 129, 108, 161, 113, 94, 141, 95, 78, 120, 78,
    62, 99, 60, 45, 78, 38, 21, 52, 0, 0, 9, 152, 122, 163, 134, 108, 144, 117,
    94, 126, 98, 78, 107, 80, 62, 88, 61, 45, 68, 39, 22, 44, 0, 0, 1, 156, 122,
    146, 137, 107, 129, 119, 93, 113, 100, 77, 95, 82, 62, 78, 63, 45, 59, 40,
    22, 36, 0, 0, 0, 158, 121, 128, 139, 107, 113, 121, 92, 98, 101, 77, 82, 83,
    62, 66, 64, 45, 49, 40, 23, 27, 0, 0, 0, 161, 120, 111, 141, 106, 97, 122,
    92, 84, 103, 77, 70, 84, 62, 56, 64, 45, 40, 40, 23, 19, 0, 0, 0, 163, 120,
    93, 143, 105, 81, 124, 91, 69, 104, 76, 56, 85, 61, 43, 65, 45, 28, 40, 24,
    9, 0, 0, 0, 165, 119, 73, 145, 105, 62, 125, 91, 52, 105, 76, 41, 85, 61,
    29, 65, 44, 15, 40, 24, 0, 0, 0, 0, 166, 119, 55, 146, 104, 46, 126, 90, 37,
    105, 75, 27, 86, 61, 15, 65, 44, 0, 40, 24, 0, 0, 0, 0, 150, 100, 168, 132,
    88, 148, 115, 75, 130, 97, 61, 110, 80, 47, 91, 62, 30, 71, 39, 7, 46, 0, 0,
    2, 154, 100, 150, 136, 88, 133, 119, 75, 116, 100, 61, 98, 82, 47, 81, 63,
    31, 62, 40, 9, 38, 0, 0, 0, 157, 100, 135, 138, 87, 119, 120, 75, 104, 101,
    61, 87, 83, 48, 71, 64, 31, 53, 40, 10, 31, 0, 0, 0, 159, 99, 119, 140, 87,
    104, 122, 75, 91, 102, 61, 75, 84, 48, 61, 64, 32, 44, 40, 11, 23, 0, 0, 0,
    161, 99, 104, 141, 87, 90, 123, 74, 78, 103, 61, 64, 84, 48, 50, 65, 32, 35,
    40, 12, 15, 0, 0, 0, 163, 99, 87, 143, 86, 75, 124, 74, 64, 104, 61, 52, 85,
    47, 39, 65, 32, 24, 40, 13, 6, 0, 0, 0, 164, 98, 69, 144, 86, 58, 125, 74,
    49, 104, 61, 38, 85, 47, 26, 65, 32, 11, 40, 13, 0, 0, 0, 0, 166, 98, 53,
    145, 86, 44, 126, 74, 35, 105, 60, 25, 86, 47, 13, 65, 32, 0, 40, 14, 0, 0,
    0, 0, 152, 75, 154, 134, 64, 136, 117, 53, 119, 99, 41, 101, 82, 27, 83, 63,
    7, 64, 39, 0, 40, 0, 0, 0, 156, 74, 138, 138, 64, 122, 120, 53, 106, 101,
    41, 90, 83, 28, 73, 64, 10, 55, 40, 0, 33, 0, 0, 0, 158, 74, 124, 139, 64,
    110, 121, 54, 95, 102, 42, 80, 84, 29, 64, 65, 12, 47, 41, 0, 26, 0, 0, 0,
    160, 75, 110, 140, 64, 96, 122, 54, 83, 103, 42, 69, 84, 30, 55, 65, 13, 39,
    41, 0, 18, 0, 0, 0, 161, 75, 96, 142, 64, 83, 123, 54, 71, 103, 43, 58, 85,
    30, 45, 65, 14, 30, 41, 0, 11, 0, 0, 0, 163, 75, 81, 143, 64, 70, 124, 54,
    59, 104, 43, 47, 85, 31, 35, 65, 15, 20, 41, 0, 3, 0, 0, 0, 164, 74, 65,
    144, 64, 55, 125, 54, 45, 104, 43, 34, 85, 31, 22, 66, 16, 7, 41, 0, 0, 0,
    0, 0, 165, 74, 51, 145, 64, 42, 125, 54, 33, 105, 43, 22, 86, 32, 10, 65,
    17, 0, 40, 0, 0, 0, 0, 0, 154, 41, 142, 136, 30, 124, 119, 19, 108, 101, 3,
    91, 83, 0, 75, 64, 0, 57, 39, 0, 34, 0, 0, 0, 158, 40, 127, 139, 31, 112,
    121, 21, 97, 102, 7, 81, 84, 0, 66, 65, 0, 49, 40, 0, 27, 0, 0, 0, 159, 41,
    114, 140, 32, 100, 122, 23, 87, 103, 10, 72, 85, 0, 58, 65, 0, 42, 40, 0,
    21, 0, 0, 0, 160, 43, 101, 141, 34, 88, 123, 25, 76, 103, 13, 62, 85, 0, 49,
    65, 0, 33, 41, 0, 14, 0, 0, 0, 161, 44, 89, 142, 35, 77, 123, 26, 65, 103,
    15, 53, 85, 1, 40, 65, 0, 25, 41, 0, 7, 0, 0, 0, 162, 44, 75, 143, 36, 64,
    124, 28, 54, 104, 17, 42, 85, 3, 30, 65, 0, 16, 40, 0, 1, 0, 0, 0, 164, 45,
    61, 144, 37, 51, 124, 29, 42, 104, 18, 31, 85, 4, 19, 65, 0, 4, 40, 0, 0, 0,
    0, 0, 164, 45, 49, 144, 37, 40, 125, 29, 31, 105, 19, 20, 86, 6, 7, 65, 0,
    0, 39, 0, 0, 0, 0, 0, 49, 202, 244, 45, 178, 215, 38, 156, 188, 28, 132,
    160, 14, 110, 134, 0, 86, 107, 0, 59, 76, 0, 20, 34, 80, 200, 217, 70, 176,
    192, 60, 154, 168, 47, 131, 143, 34, 109, 119, 16, 85, 94, 0, 58, 66, 0, 20,
    27, 95, 198, 194, 84, 175, 171, 71, 153, 150, 57, 130, 127, 42, 108, 106,
    25, 84, 83, 0, 58, 57, 0, 20, 19, 107, 196, 169, 93, 173, 149, 79, 151, 130,
    64, 128, 110, 49, 106, 91, 32, 84, 71, 3, 57, 47, 0, 19, 10, 115, 195, 145,
    100, 171, 128, 86, 150, 112, 69, 127, 94, 53, 105, 78, 36, 83, 59, 8, 57,
    37, 0, 19, 1, 122, 193, 120, 107, 170, 106, 91, 149, 92, 74, 126, 77, 57,
    104, 62, 39, 82, 46, 13, 56, 26, 0, 18, 0, 128, 192, 93, 112, 169, 81, 95,
    148, 70, 77, 125, 58, 60, 104, 46, 42, 81, 31, 15, 56, 13, 0, 17, 0, 132,
    191, 69, 115, 168, 60, 98, 147, 51, 79, 124, 41, 62, 103, 30, 43, 81, 17,
    16, 56, 0, 0, 17, 0, 77, 180, 227, 69, 159, 200, 60, 139, 176, 48, 118, 150,
    35, 97, 125, 20, 75, 99, 0, 50, 70, 0, 9, 29, 96, 178, 203, 85, 158, 179,
    73, 138, 157, 59, 117, 133, 45, 96, 111, 29, 75, 87, 3, 50, 60, 0, 9, 21,
    107, 177, 181, 94, 156, 160, 80, 137, 140, 65, 116, 119, 51, 96, 98, 34, 74,
    77, 9, 49, 52, 0, 8, 14, 115, 175, 158, 101, 155, 140, 86, 135, 122, 71,
    114, 103, 55, 95, 85, 38, 73, 65, 14, 49, 42, 0, 7, 4, 121, 174, 137, 106,
    153, 120, 91, 134, 105, 74, 113, 88, 58, 94, 72, 41, 73, 54, 17, 49, 33, 0,
    6, 0, 127, 173, 114, 111, 152, 100, 95, 133, 86, 78, 112, 72, 61, 93, 58,
    43, 72, 42, 19, 48, 22, 0, 6, 0, 132, 172, 88, 115, 151, 77, 98, 132, 66,
    80, 112, 54, 63, 92, 42, 45, 72, 28, 20, 48, 9, 0, 5, 0, 135, 171, 67, 118,
    151, 57, 100, 131, 49, 82, 111, 39, 65, 92, 28, 46, 71, 13, 21, 48, 0, 0, 5,
    0, 93, 159, 211, 83, 141, 187, 72, 123, 164, 59, 104, 140, 46, 85, 116, 31,
    65, 92, 8, 41, 64, 0, 1, 23, 106, 158, 189, 94, 140, 167, 81, 122, 147, 67,
    103, 124, 52, 85, 103, 36, 65, 81, 14, 41, 55, 0, 0, 15, 114, 157, 169, 100,
    139, 150, 87, 121, 131, 71, 102, 111, 56, 84, 92, 40, 64, 71, 17, 41, 47, 0,
    0, 7, 121, 156, 148, 106, 138, 131, 91, 120, 114, 75, 101, 96, 60, 83, 79,
    43, 64, 60, 20, 40, 37, 0, 0, 1, 126, 155, 129, 110, 136, 113, 95, 119, 98,
    78, 101, 82, 62, 83, 67, 45, 63, 50, 22, 40, 28, 0, 0, 0, 130, 154, 107,
    114, 135, 94, 98, 118, 81, 81, 100, 67, 64, 82, 54, 46, 63, 38, 23, 40, 18,
    0, 0, 0, 134, 153, 84, 117, 135, 73, 101, 117, 62, 83, 99, 51, 66, 81, 39,
    48, 62, 24, 24, 40, 5, 0, 0, 0, 137, 152, 65, 119, 134, 55, 102, 117, 46,
    84, 99, 36, 67, 81, 25, 48, 62, 11, 24, 40, 0, 0, 0, 0, 105, 138, 196, 93,
    122, 173, 81, 106, 152, 67, 89, 129, 53, 72, 107, 38, 54, 84, 17, 30, 58, 0,
    0, 17, 115, 137, 175, 101, 121, 155, 88, 106, 136, 73, 89, 115, 58, 72, 95,
    42, 54, 74, 21, 31, 49, 0, 0, 8, 120, 136, 157, 106, 120, 139, 92, 105, 121,
    76, 88, 103, 61, 71, 84, 44, 53, 65, 23, 31, 41, 0, 0, 1, 125, 135, 138,
    110, 119, 122, 95, 104, 106, 79, 87, 89, 63, 71, 73, 46, 53, 55, 25, 31, 33,
    0, 0, 0, 129, 134, 120, 113, 119, 105, 98, 103, 91, 81, 87, 76, 65, 71, 61,
    48, 53, 45, 26, 31, 24, 0, 0, 0, 133, 134, 101, 116, 118, 88, 100, 103, 76,
    83, 86, 62, 67, 70, 49, 49, 53, 34, 27, 31, 14, 0, 0, 0, 136, 133, 80, 119,
    117, 69, 102, 102, 58, 85, 86, 47, 68, 70, 35, 50, 52, 20, 27, 31, 3, 0, 0,
    0, 138, 133, 62, 121, 117, 52, 104, 102, 43, 86, 85, 33, 69, 69, 22, 50, 52,
    7, 27, 31, 0, 0, 0, 0, 114, 118, 182, 100, 104, 161, 87, 90, 141, 73, 75,
    120, 59, 59, 99, 43, 42, 78, 22, 20, 52, 0, 0, 10, 121, 117, 163, 106, 104,
    144, 92, 90, 126, 77, 75, 107, 62, 59, 88, 46, 42, 68, 24, 21, 44, 0, 0, 2,
    125, 117, 146, 110, 103, 129, 95, 89, 113, 79, 74, 95, 64, 59, 78, 47, 42,
    59, 26, 21, 36, 0, 0, 0, 129, 116, 129, 113, 102, 113, 98, 89, 99, 82, 74,
    83, 66, 59, 67, 49, 42, 50, 27, 22, 28, 0, 0, 0, 132, 116, 112, 116, 102,
    98, 100, 88, 85, 83, 73, 71, 67, 59, 57, 50, 43, 41, 28, 22, 20, 0, 0, 0,
    134, 115, 95, 118, 101, 82, 102, 88, 71, 85, 73, 58, 68, 59, 45, 51, 43, 30,
    29, 22, 11, 0, 0, 0, 137, 115, 76, 120, 101, 65, 104, 87, 55, 86, 73, 44,
    69, 58, 32, 51, 42, 18, 29, 22, 1, 0, 0, 0, 139, 114, 60, 122, 100, 50, 105,
    87, 41, 87, 72, 31, 70, 58, 19, 51, 42, 4, 29, 22, 0, 0, 0, 0, 120, 97, 168,
    106, 85, 149, 92, 73, 130, 77, 59, 110, 63, 45, 91, 47, 28, 71, 25, 6, 47,
    0, 0, 3, 126, 97, 151, 111, 85, 133, 96, 73, 117, 80, 59, 98, 65, 46, 81,
    48, 29, 62, 27, 7, 39, 0, 0, 0, 129, 97, 136, 113, 85, 120, 98, 73, 104, 82,
    59, 88, 67, 46, 72, 50, 30, 54, 29, 8, 32, 0, 0, 0, 132, 96, 120, 116, 84,
    105, 100, 72, 91, 84, 59, 76, 68, 46, 61, 51, 30, 45, 29, 9, 24, 0, 0, 0,
    134, 96, 105, 117, 84, 92, 102, 72, 79, 85, 59, 65, 69, 46, 52, 51, 30, 36,
    30, 10, 16, 0, 0, 0, 136, 96, 89, 119, 84, 77, 103, 72, 66, 86, 59, 53, 69,
    46, 41, 52, 31, 26, 30, 11, 7, 0, 0, 0, 138, 95, 71, 121, 83, 61, 105, 72,
    51, 87, 59, 40, 70, 46, 28, 52, 31, 14, 30, 11, 0, 0, 0, 0, 139, 95, 57,
    122, 83, 47, 106, 71, 38, 88, 59, 28, 71, 46, 17, 52, 31, 2, 29, 12, 0, 0,
    0, 0, 125, 74, 155, 110, 63, 137, 96, 52, 120, 81, 40, 101, 66, 27, 83, 49,
    7, 64, 27, 0, 41, 0, 0, 0, 129, 73, 139, 114, 63, 123, 99, 53, 107, 83, 41,
    90, 68, 28, 74, 51, 10, 56, 29, 0, 33, 0, 0, 0, 132, 74, 125, 116, 63, 110,
    101, 53, 96, 84, 41, 80, 69, 29, 65, 51, 12, 48, 30, 0, 27, 0, 0, 0, 134,
    74, 111, 118, 64, 97, 102, 53, 84, 85, 42, 70, 69, 29, 56, 52, 13, 40, 30,
    0, 19, 0, 0, 0, 136, 74, 97, 119, 64, 85, 103, 53, 73, 86, 42, 60, 70, 30,
    47, 52, 14, 31, 30, 0, 12, 0, 0, 0, 137, 74, 83, 121, 64, 71, 104, 54, 61,
    87, 42, 49, 71, 30, 36, 53, 15, 22, 30, 0, 5, 0, 0, 0, 139, 74, 67, 122, 64,
    57, 105, 54, 47, 88, 42, 36, 71, 31, 25, 53, 16, 9, 30, 0, 0, 0, 0, 0, 140,
    73, 54, 123, 64, 45, 106, 54, 36, 88, 43, 26, 71, 31, 14, 53, 17, 1, 29, 0,
    0, 0, 0, 0, 129, 44, 143, 114, 34, 126, 99, 24, 110, 84, 9, 92, 68, 0, 76,
    51, 0, 58, 28, 0, 35, 0, 0, 0, 132, 44, 128, 117, 35, 113, 102, 25, 98, 85,
    12, 82, 69, 0, 67, 52, 0, 50, 29, 0, 28, 0, 0, 0, 134, 45, 116, 118, 36,
    102, 103, 27, 88, 86, 14, 73, 70, 0, 59, 52, 0, 43, 29, 0, 22, 0, 0, 0, 136,
    46, 103, 119, 37, 90, 103, 28, 77, 87, 17, 64, 71, 1, 50, 53, 0, 35, 30, 0,
    15, 0, 0, 0, 137, 47, 90, 120, 38, 78, 104, 29, 67, 87, 18, 54, 71, 3, 42,
    53, 0, 27, 29, 0, 8, 0, 0, 0, 138, 47, 77, 121, 39, 66, 105, 30, 56, 88, 19,
    44, 71, 5, 32, 53, 0, 18, 29, 0, 2, 0, 0, 0, 139, 48, 63, 122, 39, 53, 106,
    31, 44, 88, 20, 33, 71, 7, 21, 53, 0, 6, 28, 0, 0, 0, 0, 0, 140, 48, 52,
    123, 40, 42, 107, 31, 33, 89, 21, 23, 72, 8, 10, 53, 0, 0, 27, 0, 0, 0, 0,
    0, 0, 192, 242, 0, 169, 213, 0, 148, 187, 0, 125, 159, 0, 104, 133, 0, 82,
    106, 0, 56, 76, 0, 18, 34, 0, 189, 216, 0, 167, 190, 0, 147, 167, 0, 124,
    142, 0, 103, 119, 0, 81, 94, 0, 55, 66, 0, 16, 27, 0, 188, 193, 0, 166, 170,
    0, 145, 149, 0, 123, 127, 0, 102, 105, 0, 80, 83, 0, 55, 57, 0, 15, 20, 32,
    186, 168, 27, 164, 149, 17, 144, 130, 0, 122, 110, 0, 101, 91, 0, 79, 71, 0,
    55, 47, 0, 14, 11, 56, 184, 146, 47, 163, 129, 37, 142, 113, 23, 121, 95, 5,
    100, 78, 0, 79, 60, 0, 54, 38, 0, 14, 2, 70, 183, 122, 60, 161, 107, 49,
    141, 94, 35, 120, 79, 20, 100, 64, 0, 78, 48, 0, 54, 27, 0, 13, 0, 80, 182,
    96, 69, 160, 84, 57, 140, 73, 43, 119, 61, 28, 99, 48, 6, 78, 34, 0, 53, 15,
    0, 13, 0, 87, 181, 74, 75, 160, 65, 62, 140, 56, 47, 119, 46, 32, 98, 35,
    12, 77, 21, 0, 53, 2, 0, 13, 0, 0, 171, 225, 0, 151, 199, 0, 132, 174, 0,
    112, 149, 0, 92, 124, 0, 71, 98, 0, 47, 69, 0, 4, 29, 0, 169, 201, 0, 150,
    178, 0, 131, 156, 0, 111, 133, 0, 92, 111, 0, 71, 87, 0, 47, 60, 0, 3, 22,
    41, 168, 180, 36, 148, 159, 28, 130, 140, 15, 110, 118, 0, 91, 98, 0, 70,
    77, 0, 46, 52, 0, 2, 14, 61, 166, 158, 53, 147, 139, 43, 129, 122, 31, 109,
    103, 17, 90, 85, 0, 70, 66, 0, 46, 43, 0, 2, 5, 73, 165, 137, 64, 146, 121,
    53, 128, 106, 40, 108, 89, 26, 89, 73, 6, 69, 55, 0, 46, 33, 0, 1, 0, 83,
    164, 115, 72, 145, 101, 60, 127, 88, 46, 107, 73, 32, 89, 59, 14, 69, 43, 0,
    46, 23, 0, 1, 0, 90, 163, 91, 78, 144, 80, 65, 126, 69, 51, 106, 57, 37, 88,
    44, 19, 68, 30, 0, 45, 11, 0, 1, 0, 95, 163, 72, 82, 143, 62, 69, 125, 53,
    54, 106, 43, 39, 88, 32, 22, 68, 18, 0, 45, 0, 0, 1, 0, 0, 152, 210, 0, 134,
    186, 0, 117, 163, 0, 99, 139, 0, 81, 116, 0, 62, 92, 0, 38, 64, 0, 1, 24,
    47, 151, 188, 42, 133, 167, 35, 117, 146, 24, 98, 124, 10, 81, 103, 0, 61,
    81, 0, 38, 55, 0, 0, 16, 65, 150, 169, 57, 132, 149, 47, 116, 131, 36, 98,
    111, 23, 80, 92, 4, 61, 71, 0, 38, 47, 0, 0, 7, 76, 148, 148, 67, 131, 131,
    56, 115, 114, 44, 97, 96, 31, 79, 79, 14, 61, 61, 0, 38, 38, 0, 0, 1, 84,
    147, 129, 74, 130, 114, 62, 114, 99, 49, 96, 83, 35, 79, 68, 19, 60, 50, 0,
    37, 29, 0, 0, 0, 91, 146, 109, 80, 129, 95, 67, 113, 83, 53, 95, 69, 39, 78,
    55, 23, 60, 39, 1, 37, 20, 0, 0, 0, 97, 146, 87, 84, 128, 76, 71, 112, 65,
    57, 95, 53, 42, 78, 41, 26, 60, 26, 4, 37, 7, 0, 0, 0, 101, 145, 69, 88,
    128, 59, 74, 112, 50, 59, 94, 40, 44, 77, 29, 27, 59, 15, 4, 37, 0, 0, 0, 0,
    52, 132, 195, 47, 117, 172, 40, 102, 151, 30, 85, 129, 19, 69, 107, 2, 51,
    84, 0, 28, 58, 0, 0, 18, 70, 131, 175, 61, 116, 155, 52, 101, 135, 41, 85,
    115, 29, 68, 95, 13, 51, 74, 0, 28, 49, 0, 0, 9, 80, 130, 157, 70, 115, 139,
    59, 100, 121, 47, 84, 103, 35, 68, 85, 19, 51, 65, 0, 28, 42, 0, 0, 1, 87,
    130, 138, 76, 114, 122, 65, 100, 106, 52, 84, 89, 39, 68, 73, 24, 50, 55, 4,
    28, 33, 0, 0, 0, 93, 129, 121, 81, 114, 106, 69, 99, 92, 56, 83, 77, 42, 67,
    62, 27, 50, 46, 7, 29, 25, 0, 0, 0, 98, 128, 102, 86, 113, 89, 73, 98, 77,
    59, 82, 64, 45, 67, 50, 29, 50, 35, 9, 29, 16, 0, 0, 0, 102, 127, 82, 89,
    112, 71, 76, 98, 61, 61, 82, 49, 47, 66, 37, 31, 50, 23, 11, 29, 4, 0, 0, 0,
    105, 127, 66, 92, 112, 56, 78, 97, 47, 63, 82, 37, 48, 66, 25, 32, 50, 11,
    10, 29, 0, 0, 0, 0, 72, 114, 181, 63, 100, 160, 54, 87, 140, 44, 72, 119,
    32, 57, 99, 18, 39, 78, 0, 18, 52, 0, 0, 11, 83, 113, 163, 73, 100, 144, 62,
    86, 126, 50, 71, 107, 38, 57, 88, 24, 40, 68, 3, 19, 44, 0, 0, 3, 89, 113,
    147, 78, 99, 129, 67, 86, 113, 55, 71, 95, 42, 57, 78, 27, 40, 60, 8, 19,
    37, 0, 0, 0, 95, 112, 129, 83, 98, 114, 71, 85, 99, 58, 71, 83, 45, 56, 67,
    30, 40, 50, 11, 20, 29, 0, 0, 0, 99, 111, 113, 86, 98, 99, 74, 85, 86, 60,
    70, 72, 47, 56, 57, 31, 40, 41, 12, 20, 21, 0, 0, 0, 103, 111, 96, 90, 97,
    84, 77, 84, 72, 63, 70, 59, 49, 56, 46, 33, 40, 31, 13, 21, 12, 0, 0, 0,
    106, 110, 78, 93, 97, 67, 79, 84, 57, 64, 70, 46, 50, 56, 34, 34, 40, 19,
    13, 21, 2, 0, 0, 0, 108, 110, 63, 95, 97, 53, 81, 84, 44, 66, 69, 34, 51,
    56, 22, 35, 40, 7, 13, 21, 0, 0, 0, 0, 85, 94, 168, 74, 82, 149, 64, 70,
    130, 53, 57, 110, 41, 43, 91, 27, 26, 71, 5, 5, 47, 0, 0, 4, 92, 94, 151,
    81, 82, 134, 70, 70, 117, 57, 57, 99, 45, 44, 81, 30, 27, 62, 10, 7, 39, 0,
    0, 0, 97, 94, 136, 85, 82, 120, 73, 70, 105, 60, 57, 88, 47, 44, 72, 32, 28,
    54, 13, 8, 32, 0, 0, 0, 101, 94, 121, 88, 82, 106, 76, 70, 92, 62, 57, 77,
    49, 44, 62, 34, 28, 45, 14, 9, 25, 0, 0, 0, 104, 93, 106, 91, 81, 93, 78,
    70, 80, 64, 57, 66, 50, 44, 52, 35, 29, 37, 14, 10, 17, 0, 0, 0, 106, 93,
    90, 93, 81, 78, 80, 69, 67, 66, 57, 55, 52, 44, 42, 36, 29, 27, 15, 11, 8,
    0, 0, 0, 109, 92, 74, 96, 81, 63, 82, 69, 53, 67, 57, 42, 53, 44, 30, 36,
    29, 16, 15, 11, 1, 0, 0, 0, 111, 92, 60, 97, 80, 50, 83, 69, 41, 68, 57, 31,
    53, 44, 20, 37, 30, 5, 15, 11, 0, 0, 0, 0, 94, 73, 155, 82, 63, 137, 72, 52,
    120, 59, 40, 102, 47, 26, 84, 32, 8, 65, 9, 0, 42, 0, 0, 0, 99, 73, 140, 87,
    63, 124, 76, 52, 108, 62, 40, 91, 49, 27, 75, 34, 11, 57, 12, 0, 34, 0, 0,
    0, 103, 73, 126, 90, 63, 111, 78, 53, 97, 64, 41, 81, 51, 28, 66, 35, 13,
    49, 13, 0, 27, 0, 0, 0, 105, 73, 112, 92, 63, 98, 80, 53, 85, 66, 41, 71,
    52, 29, 57, 36, 14, 41, 15, 0, 20, 0, 0, 0, 107, 73, 99, 94, 63, 86, 81, 53,
    74, 67, 41, 61, 53, 29, 48, 37, 15, 32, 16, 0, 13, 0, 0, 0, 110, 73, 85, 96,
    63, 73, 83, 53, 62, 68, 42, 50, 54, 30, 38, 38, 16, 23, 16, 1, 5, 0, 0, 0,
    112, 73, 69, 98, 63, 59, 84, 53, 49, 69, 42, 38, 55, 30, 27, 38, 16, 12, 17,
    1, 0, 0, 0, 0, 113, 73, 57, 99, 63, 47, 85, 53, 38, 70, 42, 28, 55, 30, 17,
    38, 17, 3, 16, 2, 0, 0, 0, 0, 101, 47, 144, 88, 38, 127, 77, 27, 111, 64,
    14, 94, 51, 0, 77, 35, 0, 59, 9, 0, 36, 0, 0, 0, 105, 47, 129, 92, 38, 114,
    80, 28, 99, 66, 16, 83, 53, 0, 68, 37, 0, 51, 13, 0, 29, 0, 0, 0, 107, 48,
    117, 94, 39, 103, 81, 29, 89, 67, 18, 74, 54, 2, 60, 38, 0, 44, 15, 0, 23,
    0, 0, 0, 109, 49, 104, 95, 40, 91, 82, 31, 79, 68, 19, 65, 54, 5, 51, 39, 0,
    36, 17, 0, 16, 0, 0, 0, 110, 50, 92, 97, 40, 80, 84, 31, 68, 69, 20, 56, 55,
    7, 43, 39, 0, 28, 17, 0, 9, 0, 0, 0, 112, 50, 79, 98, 41, 68, 85, 32, 57,
    70, 21, 46, 56, 8, 34, 40, 0, 20, 18, 0, 3, 0, 0, 0, 113, 50, 65, 100, 41,
    55, 86, 33, 46, 71, 22, 35, 56, 10, 23, 40, 0, 8, 17, 0, 0, 0, 0, 0, 115,
    50, 54, 101, 41, 44, 87, 33, 36, 71, 23, 25, 56, 11, 14, 40, 0, 1, 16, 0, 0,
    0, 0, 0, 0, 182, 240, 0, 161, 212, 0, 141, 185, 0, 120, 158, 0, 99, 132, 0,
    78, 106, 0, 53, 75, 0, 12, 35, 0, 180, 214, 0, 159, 189, 0, 140, 166, 0,
    119, 141, 0, 99, 118, 0, 77, 94, 0, 53, 66, 0, 11, 28, 0, 179, 192, 0, 158,
    169, 0, 138, 149, 0, 118, 126, 0, 98, 105, 0, 77, 83, 0, 52, 57, 0, 10, 21,
    0, 177, 168, 0, 156, 149, 0, 137, 130, 0, 116, 110, 0, 97, 91, 0, 76, 71, 0,
    52, 48, 0, 9, 12, 0, 175, 146, 0, 155, 129, 0, 136, 113, 0, 115, 96, 0, 96,
    79, 0, 75, 60, 0, 51, 39, 0, 9, 3, 0, 174, 123, 0, 154, 109, 0, 135, 95, 0,
    115, 80, 0, 95, 65, 0, 75, 49, 0, 51, 28, 0, 8, 0, 0, 173, 98, 0, 153, 87,
    0, 134, 76, 0, 114, 63, 0, 95, 50, 0, 74, 35, 0, 51, 17, 0, 8, 0, 0, 172,
    78, 0, 152, 70, 0, 134, 60, 0, 114, 49, 0, 94, 38, 0, 74, 24, 0, 51, 5, 0,
    8, 0, 0, 163, 224, 0, 144, 198, 0, 126, 173, 0, 107, 148, 0, 88, 123, 0, 68,
    98, 0, 44, 69, 0, 1, 29, 0, 162, 200, 0, 143, 177, 0, 125, 155, 0, 106, 132,
    0, 88, 110, 0, 68, 87, 0, 44, 60, 0, 1, 22, 0, 160, 180, 0, 142, 159, 0,
    124, 139, 0, 105, 118, 0, 87, 98, 0, 67, 77, 0, 44, 52, 0, 0, 15, 0, 159,
    158, 0, 140, 139, 0, 123, 122, 0, 104, 103, 0, 86, 85, 0, 67, 66, 0, 43, 43,
    0, 0, 5, 0, 157, 138, 0, 139, 121, 0, 122, 106, 0, 103, 89, 0, 85, 73, 0,
    66, 56, 0, 43, 34, 0, 0, 0, 0, 156, 116, 0, 138, 102, 0, 121, 89, 0, 103,
    75, 0, 85, 60, 0, 66, 44, 0, 43, 24, 0, 0, 0, 6, 155, 94, 2, 137, 82, 0,
    120, 71, 0, 102, 59, 0, 84, 46, 0, 65, 32, 0, 43, 13, 0, 0, 0, 30, 155, 75,
    23, 137, 66, 11, 120, 57, 0, 102, 46, 0, 84, 35, 0, 65, 20, 0, 43, 2, 0, 0,
    0, 0, 145, 209, 0, 129, 185, 0, 112, 162, 0, 95, 138, 0, 77, 115, 0, 59, 91,
    0, 35, 64, 0, 1, 24, 0, 144, 188, 0, 128, 166, 0, 112, 145, 0, 94, 124, 0,
    77, 103, 0, 58, 81, 0, 35, 55, 0, 0, 16, 0, 143, 168, 0, 127, 149, 0, 111,
    130, 0, 93, 111, 0, 77, 92, 0, 58, 71, 0, 35, 47, 0, 0, 8, 0, 142, 148, 0,
    126, 131, 0, 110, 114, 0, 93, 97, 0, 76, 79, 0, 58, 61, 0, 35, 38, 0, 0, 1,
    0, 141, 130, 0, 125, 114, 0, 109, 100, 0, 92, 84, 0, 75, 68, 0, 58, 51, 0,
    35, 30, 0, 0, 0, 27, 140, 110, 22, 124, 97, 12, 108, 84, 0, 91, 70, 0, 75,
    56, 0, 57, 40, 0, 35, 21, 0, 0, 0, 43, 139, 89, 36, 123, 78, 26, 108, 67,
    12, 91, 55, 0, 74, 43, 0, 57, 28, 0, 35, 9, 0, 0, 0, 51, 139, 72, 43, 123,
    63, 33, 107, 53, 20, 90, 43, 3, 74, 31, 0, 57, 18, 0, 35, 1, 0, 0, 0, 0,
    127, 194, 0, 112, 172, 0, 98, 151, 0, 81, 128, 0, 66, 107, 0, 48, 84, 0, 26,
    58, 0, 0, 18, 0, 126, 174, 0, 111, 154, 0, 97, 135, 0, 81, 115, 0, 65, 95,
    0, 48, 74, 0, 26, 50, 0, 0, 9, 0, 125, 157, 0, 111, 139, 0, 96, 121, 0, 81,
    103, 0, 65, 85, 0, 48, 65, 0, 27, 42, 0, 0, 2, 20, 125, 139, 17, 110, 122,
    9, 96, 107, 0, 80, 90, 0, 65, 73, 0, 48, 56, 0, 27, 34, 0, 0, 0, 39, 124,
    122, 33, 109, 107, 25, 95, 93, 13, 80, 78, 0, 65, 63, 0, 48, 46, 0, 27, 26,
    0, 0, 0, 51, 123, 103, 43, 108, 90, 34, 94, 78, 23, 79, 65, 8, 64, 51, 0,
    48, 36, 0, 27, 17, 0, 0, 0, 59, 122, 84, 51, 108, 73, 41, 94, 63, 29, 79,
    51, 15, 64, 39, 0, 47, 24, 0, 27, 6, 0, 0, 0, 64, 122, 69, 55, 107, 59, 45,
    94, 50, 32, 78, 39, 19, 64, 28, 0, 47, 14, 0, 27, 0, 0, 0, 0, 0, 110, 181,
    0, 97, 160, 0, 83, 140, 0, 69, 119, 0, 54, 99, 0, 37, 78, 0, 16, 53, 0, 0,
    12, 7, 109, 163, 8, 96, 144, 3, 83, 126, 0, 69, 107, 0, 54, 88, 0, 38, 68,
    0, 17, 45, 0, 0, 3, 34, 109, 147, 30, 96, 129, 23, 83, 113, 13, 69, 95, 0,
    54, 78, 0, 38, 60, 0, 18, 37, 0, 0, 0, 48, 108, 130, 41, 95, 114, 33, 82,
    99, 23, 68, 84, 10, 54, 68, 0, 38, 51, 0, 18, 29, 0, 0, 0, 56, 108, 114, 49,
    94, 100, 40, 82, 87, 29, 68, 72, 16, 54, 58, 0, 38, 42, 0, 18, 22, 0, 0, 0,
    63, 107, 97, 55, 94, 85, 45, 81, 73, 34, 68, 60, 21, 54, 47, 5, 38, 32, 0,
    18, 13, 0, 0, 0, 68, 106, 80, 59, 93, 69, 49, 81, 59, 37, 67, 47, 25, 54,
    35, 9, 38, 21, 0, 18, 4, 0, 0, 0, 72, 106, 66, 63, 93, 56, 52, 81, 47, 40,
    67, 36, 27, 53, 25, 11, 38, 11, 0, 18, 0, 0, 0, 0, 28, 92, 168, 24, 80, 149,
    19, 68, 130, 11, 55, 111, 0, 41, 92, 0, 25, 71, 0, 6, 47, 0, 0, 5, 46, 92,
    151, 40, 80, 134, 33, 68, 117, 24, 55, 99, 12, 42, 81, 0, 26, 63, 0, 7, 40,
    0, 0, 0, 55, 91, 137, 48, 80, 121, 40, 68, 105, 30, 55, 89, 18, 42, 72, 2,
    27, 55, 0, 8, 32, 0, 0, 0, 62, 91, 121, 54, 79, 107, 45, 68, 93, 34, 55, 77,
    23, 42, 62, 7, 27, 46, 0, 8, 25, 0, 0, 0, 67, 91, 107, 58, 79, 93, 49, 68,
    81, 38, 55, 67, 26, 42, 53, 12, 27, 37, 0, 8, 18, 0, 0, 0, 72, 90, 91, 62,
    79, 79, 52, 67, 68, 41, 55, 56, 29, 42, 43, 15, 28, 28, 1, 9, 9, 0, 0, 0,
    76, 90, 75, 66, 78, 65, 56, 67, 55, 43, 55, 44, 31, 42, 32, 17, 28, 18, 2,
    9, 2, 0, 0, 0, 78, 90, 62, 68, 78, 52, 58, 67, 43, 45, 55, 33, 32, 42, 22,
    19, 28, 7, 2, 9, 0, 0, 0, 0, 53, 72, 156, 46, 62, 138, 39, 51, 121, 30, 39,
    102, 20, 25, 84, 2, 9, 65, 0, 0, 42, 0, 0, 0, 62, 72, 140, 55, 62, 124, 46,
    52, 108, 36, 40, 91, 25, 27, 75, 9, 11, 57, 0, 0, 34, 0, 0, 0, 68, 72, 127,
    59, 62, 112, 50, 52, 97, 39, 40, 82, 28, 27, 66, 13, 12, 49, 0, 0, 28, 0, 0,
    0, 72, 73, 113, 63, 62, 99, 53, 52, 86, 42, 40, 71, 30, 28, 57, 17, 13, 41,
    0, 0, 21, 0, 0, 0, 76, 72, 100, 66, 62, 87, 56, 52, 75, 44, 41, 62, 32, 29,
    48, 19, 14, 33, 3, 0, 13, 0, 0, 0, 79, 72, 86, 69, 62, 74, 58, 52, 63, 46,
    41, 51, 34, 29, 39, 21, 15, 24, 4, 1, 6, 0, 0, 0, 81, 72, 71, 71, 62, 61,
    60, 52, 51, 48, 41, 40, 35, 29, 28, 22, 15, 13, 5, 1, 0, 0, 0, 0, 83, 72,
    59, 73, 62, 49, 62, 52, 41, 49, 41, 31, 36, 30, 20, 22, 16, 5, 4, 2, 0, 0,
    0, 0, 67, 49, 144, 59, 40, 128, 50, 30, 112, 40, 18, 95, 29, 2, 78, 13, 0,
    60, 0, 0, 37, 0, 0, 0, 73, 50, 130, 64, 40, 115, 55, 31, 100, 44, 19, 84,
    32, 4, 69, 18, 0, 52, 0, 0, 30, 0, 0, 0, 76, 50, 118, 67, 41, 104, 57, 32,
    90, 46, 20, 75, 34, 7, 61, 20, 0, 45, 0, 0, 24, 0, 0, 0, 79, 51, 105, 69,
    42, 92, 59, 33, 80, 47, 21, 66, 35, 9, 52, 22, 0, 37, 1, 0, 16, 0, 0, 0, 81,
    52, 93, 71, 42, 81, 61, 33, 70, 49, 22, 57, 36, 11, 44, 23, 0, 29, 2, 0, 9,
    0, 0, 0, 83, 52, 80, 73, 43, 69, 62, 34, 59, 50, 23, 47, 37, 12, 35, 23, 0,
    21, 3, 0, 3, 0, 0, 0, 85, 52, 67, 75, 43, 57, 64, 34, 47, 51, 24, 36, 38,
    13, 25, 24, 0, 10, 3, 0, 0, 0, 0, 0, 87, 52, 56, 76, 43, 46, 65, 34, 37, 52,
    24, 27, 39, 14, 16, 24, 0, 2, 2, 0, 0, 0, 0, 0, 0, 174, 238, 0, 154, 210, 0,
    135, 184, 0, 115, 157, 0, 95, 132, 0, 75, 105, 0, 50, 75, 0, 6, 35, 0, 172,
    213, 0, 153, 188, 0, 134, 165, 0, 114, 141, 0, 94, 118, 0, 74, 93, 0, 50,
    66, 0, 5, 28, 0, 171, 191, 0, 151, 169, 0, 133, 148, 0, 113, 126, 0, 94,
    105, 0, 73, 83, 0, 50, 57, 0, 5, 21, 0, 169, 168, 0, 150, 148, 0, 131, 130,
    0, 112, 110, 0, 93, 92, 0, 73, 71, 0, 49, 48, 0, 5, 13, 0, 167, 146, 0, 148,
    130, 0, 130, 113, 0, 111, 96, 0, 92, 79, 0, 72, 61, 0, 49, 39, 0, 4, 3, 0,
    166, 124, 0, 147, 110, 0, 129, 96, 0, 110, 81, 0, 92, 66, 0, 72, 49, 0, 49,
    29, 0, 4, 0, 0, 165, 100, 0, 146, 89, 0, 129, 78, 0, 110, 65, 0, 91, 52, 0,
    72, 37, 0, 49, 18, 0, 4, 0, 0, 164, 82, 0, 146, 73, 0, 128, 64, 0, 109, 52,
    0, 91, 41, 0, 72, 26, 0, 49, 8, 0, 4, 0, 0, 157, 223, 0, 138, 197, 0, 121,
    172, 0, 102, 147, 0, 84, 123, 0, 65, 98, 0, 41, 69, 0, 1, 30, 0, 155, 199,
    0, 137, 176, 0, 120, 155, 0, 102, 132, 0, 84, 110, 0, 65, 87, 0, 41, 60, 0,
    1, 22, 0, 154, 179, 0, 136, 158, 0, 119, 139, 0, 101, 118, 0, 83, 98, 0, 64,
    77, 0, 41, 52, 0, 0, 15, 0, 152, 158, 0, 135, 139, 0, 118, 122, 0, 100, 103,
    0, 83, 85, 0, 64, 66, 0, 41, 43, 0, 0, 6, 0, 151, 138, 0, 133, 122, 0, 117,
    106, 0, 99, 90, 0, 82, 74, 0, 64, 56, 0, 41, 35, 0, 0, 0, 0, 150, 117, 0,
    133, 103, 0, 116, 90, 0, 99, 76, 0, 82, 61, 0, 63, 45, 0, 41, 25, 0, 0, 0,
    0, 149, 95, 0, 132, 84, 0, 116, 73, 0, 98, 61, 0, 81, 48, 0, 63, 33, 0, 41,
    15, 0, 0, 0, 0, 148, 78, 0, 131, 69, 0, 115, 59, 0, 98, 49, 0, 81, 37, 0,
    63, 23, 0, 40, 4, 0, 0, 0, 0, 140, 208, 0, 124, 184, 0, 108, 161, 0, 91,
    137, 0, 74, 115, 0, 56, 91, 0, 33, 64, 0, 1, 24, 0, 139, 187, 0, 123, 165,
    0, 107, 145, 0, 90, 123, 0, 74, 102, 0, 56, 80, 0, 33, 55, 0, 0, 17, 0, 138,
    168, 0, 122, 149, 0, 106, 130, 0, 90, 110, 0, 73, 91, 0, 56, 71, 0, 33, 47,
    0, 0, 8, 0, 136, 148, 0, 121, 131, 0, 105, 115, 0, 89, 97, 0, 73, 80, 0, 55,
    61, 0, 33, 39, 0, 0, 1, 0, 135, 130, 0, 120, 115, 0, 105, 100, 0, 88, 84, 0,
    72, 69, 0, 55, 52, 0, 33, 30, 0, 0, 0, 0, 135, 111, 0, 119, 98, 0, 104, 85,
    0, 88, 71, 0, 72, 57, 0, 55, 41, 0, 33, 22, 0, 0, 0, 0, 134, 91, 0, 118, 80,
    0, 103, 69, 0, 87, 57, 0, 72, 44, 0, 54, 30, 0, 33, 11, 0, 0, 0, 0, 133, 75,
    0, 118, 65, 0, 103, 56, 0, 87, 45, 0, 71, 34, 0, 54, 20, 0, 33, 2, 0, 0, 0,
    0, 123, 194, 0, 108, 171, 0, 94, 150, 0, 78, 128, 0, 63, 106, 0, 46, 84, 0,
    24, 58, 0, 0, 19, 0, 122, 174, 0, 107, 154, 0, 93, 135, 0, 78, 114, 0, 63,
    95, 0, 46, 74, 0, 25, 50, 0, 0, 10, 0, 121, 157, 0, 107, 139, 0, 93, 121, 0,
    78, 103, 0, 63, 85, 0, 46, 65, 0, 25, 42, 0, 0, 2, 0, 120, 139, 0, 106, 122,
    0, 92, 107, 0, 77, 90, 0, 62, 74, 0, 46, 56, 0, 25, 34, 0, 0, 0, 0, 119,
    122, 0, 105, 107, 0, 91, 93, 0, 77, 78, 0, 62, 63, 0, 45, 47, 0, 25, 26, 0,
    0, 0, 0, 119, 104, 0, 104, 91, 0, 91, 79, 0, 76, 66, 0, 62, 52, 0, 45, 37,
    0, 25, 18, 0, 0, 0, 0, 118, 86, 0, 104, 75, 0, 90, 64, 0, 76, 52, 0, 61, 40,
    0, 45, 26, 0, 25, 7, 0, 0, 0, 0, 118, 71, 0, 104, 61, 0, 90, 52, 0, 75, 42,
    0, 61, 30, 0, 45, 17, 0, 24, 1, 0, 0, 0, 0, 107, 181, 0, 94, 160, 0, 81,
    140, 0, 66, 119, 0, 52, 99, 0, 35, 78, 0, 15, 53, 0, 0, 13, 0, 106, 163, 0,
    93, 144, 0, 80, 126, 0, 66, 107, 0, 52, 88, 0, 36, 68, 0, 15, 45, 0, 0, 4,
    0, 106, 147, 0, 93, 130, 0, 80, 113, 0, 66, 96, 0, 52, 79, 0, 36, 60, 0, 16,
    37, 0, 0, 0, 0, 105, 130, 0, 92, 115, 0, 79, 100, 0, 66, 84, 0, 52, 68, 0,
    36, 51, 0, 16, 30, 0, 0, 0, 0, 104, 115, 0, 91, 101, 0, 79, 87, 0, 65, 73,
    0, 52, 59, 0, 36, 43, 0, 16, 22, 0, 0, 0, 0, 104, 98, 0, 91, 86, 0, 79, 74,
    0, 65, 61, 0, 52, 48, 0, 36, 33, 0, 16, 14, 0, 0, 0, 0, 103, 81, 0, 90, 70,
    0, 78, 60, 0, 65, 49, 0, 52, 37, 0, 36, 22, 0, 16, 5, 0, 0, 0, 0, 103, 68,
    0, 90, 58, 0, 78, 49, 0, 65, 38, 0, 51, 27, 0, 36, 13, 0, 16, 0, 0, 0, 0, 0,
    90, 168, 0, 78, 149, 0, 67, 130, 0, 54, 111, 0, 40, 92, 0, 24, 72, 0, 6, 47,
    0, 0, 6, 0, 90, 152, 0, 78, 134, 0, 67, 117, 0, 54, 99, 0, 40, 82, 0, 25,
    63, 0, 6, 40, 0, 0, 0, 0, 89, 137, 0, 78, 121, 0, 66, 106, 0, 54, 89, 0, 41,
    73, 0, 26, 55, 0, 7, 33, 0, 0, 0, 0, 89, 122, 0, 77, 107, 0, 66, 93, 0, 54,
    78, 0, 41, 63, 0, 26, 46, 0, 7, 25, 0, 0, 0, 0, 89, 108, 0, 77, 94, 0, 66,
    81, 0, 53, 68, 0, 41, 54, 0, 26, 38, 0, 8, 18, 0, 0, 0, 7, 88, 92, 4, 77,
    80, 0, 66, 69, 0, 53, 57, 0, 41, 44, 0, 27, 29, 0, 8, 10, 0, 0, 0, 23, 88,
    77, 19, 76, 66, 11, 65, 56, 0, 53, 45, 0, 41, 33, 0, 27, 19, 0, 8, 3, 0, 0,
    0, 30, 88, 64, 26, 76, 54, 18, 65, 45, 4, 53, 35, 0, 41, 24, 0, 27, 9, 0, 8,
    0, 0, 0, 0, 0, 72, 156, 0, 62, 138, 0, 51, 121, 0, 39, 103, 0, 26, 85, 0, 9,
    66, 0, 0, 42, 0, 0, 0, 0, 72, 141, 0, 62, 125, 0, 51, 109, 0, 39, 92, 0, 27,
    75, 0, 11, 57, 0, 0, 35, 0, 0, 0, 0, 72, 128, 0, 62, 113, 0, 51, 98, 0, 40,
    82, 0, 27, 67, 0, 12, 50, 0, 1, 28, 0, 0, 0, 17, 72, 114, 13, 62, 100, 6,
    51, 87, 0, 40, 72, 0, 28, 58, 0, 13, 42, 0, 1, 21, 0, 0, 0, 28, 72, 101, 23,
    61, 88, 16, 51, 76, 4, 40, 62, 0, 28, 49, 0, 14, 34, 0, 1, 14, 0, 0, 0, 36,
    72, 87, 30, 61, 75, 23, 51, 64, 12, 40, 52, 1, 28, 40, 0, 14, 25, 0, 1, 7,
    0, 0, 0, 41, 71, 72, 35, 61, 62, 28, 51, 52, 17, 40, 41, 5, 28, 29, 0, 14,
    15, 0, 0, 0, 0, 0, 0, 45, 71, 60, 39, 61, 51, 31, 51, 42, 20, 40, 32, 8, 29,
    21, 0, 15, 6, 0, 0, 0, 0, 0, 0, 0, 51, 145, 0, 42, 129, 0, 33, 113, 0, 20,
    96, 0, 5, 79, 0, 0, 60, 0, 0, 37, 0, 0, 0, 24, 52, 131, 21, 42, 116, 15, 33,
    101, 5, 21, 85, 0, 7, 69, 0, 0, 52, 0, 1, 30, 0, 0, 0, 34, 52, 119, 29, 43,
    105, 22, 33, 91, 12, 22, 76, 0, 8, 61, 0, 0, 45, 0, 1, 24, 0, 0, 0, 40, 53,
    106, 34, 43, 93, 27, 34, 80, 17, 23, 67, 5, 9, 53, 0, 0, 37, 0, 0, 16, 0, 0,
    0, 45, 53, 94, 38, 44, 82, 31, 34, 70, 20, 24, 58, 10, 11, 45, 0, 0, 29, 0,
    0, 9, 0, 0, 0, 48, 53, 81, 42, 44, 70, 34, 35, 60, 24, 24, 48, 13, 12, 36,
    0, 0, 21, 0, 0, 3, 0, 0, 0, 51, 53, 68, 45, 44, 58, 37, 35, 48, 26, 25, 37,
    15, 13, 26, 2, 1, 11, 0, 0, 0, 0, 0, 0, 54, 54, 57, 47, 44, 47, 39, 35, 39,
    28, 25, 29, 17, 13, 17, 4, 1, 3, 0, 0, 0, 0, 0, 0]);

  function convertToRgb(src, srcOffset, srcScale, dest, destOffset) {
    // using lut as in spline interpolation (see function.js)
    var cubeVertices = 16; // 1 << number of colors
    var cubeN = new Float32Array(cubeVertices);
    var cubeVertex = new Uint32Array(cubeVertices);
    for (var j = 0; j < cubeVertices; j++)
      cubeN[j] = 1;

    var k = 3, pos = 1;
    var lutDomain = 7, lutStep = 8;
    for (var i = 3; i >= 0; i--) {
      var e = src[srcOffset + i] * srcScale * lutDomain;

      var e0 = e < lutDomain ? Math.floor(e) : e - 1; // e1 = e0 + 1;
      var n0 = e0 + 1 - e; // (e1 - e) / (e1 - e0);
      var n1 = e - e0; // (e - e0) / (e1 - e0);
      var offset0 = e0 * k;
      var offset1 = offset0 + k; // e1 * k
      for (var j = 0; j < cubeVertices; j++) {
        if (j & pos) {
          cubeN[j] *= n1;
          cubeVertex[j] += offset1;
        } else {
          cubeN[j] *= n0;
          cubeVertex[j] += offset0;
        }
      }

      k *= lutStep;
      pos <<= 1;
    }
    var y0 = 0, y1 = 0, y2 = 0;
    for (var i = 0; i < cubeVertices; i++)
      y0 += lut[cubeVertex[i]] * cubeN[i];
    for (var i = 0; i < cubeVertices; i++)
      y1 += lut[cubeVertex[i] + 1] * cubeN[i];
    for (var i = 0; i < cubeVertices; i++)
      y2 += lut[cubeVertex[i] + 2] * cubeN[i];
    dest[destOffset] = y0 > 255 ? 255 : y0;
    dest[destOffset + 1] = y1 > 255 ? 255 : y1;
    dest[destOffset + 2] = y2 > 255 ? 255 : y2;
  }

  function DeviceCmykCS() {
    this.name = 'DeviceCMYK';
    this.numComps = 4;
    this.defaultColor = new Float32Array([0, 0, 0, 1]);
  }
  DeviceCmykCS.prototype = {
    getRgb: function DeviceCmykCS_getRgb(src, srcOffset) {
      var rgb = new Uint8Array(3);
      convertToRgb(src, srcOffset, 1, rgb, 0);
      return rgb;
    },
    getRgbItem: function DeviceCmykCS_getRgbItem(src, srcOffset,
                                                 dest, destOffset) {
      convertToRgb(src, srcOffset, 1, dest, destOffset);
    },
    getRgbBuffer: function DeviceCmykCS_getRgbBuffer(src, srcOffset, count,
                                                     dest, destOffset, bits) {
      var scale = 1 / ((1 << bits) - 1);
      for (var i = 0; i < count; i++) {
        convertToRgb(src, srcOffset, scale, dest, destOffset);
        srcOffset += 4;
        destOffset += 3;
      }
    },
    getOutputLength: function DeviceCmykCS_getOutputLength(inputLength) {
      return (inputLength >> 2) * 3;
    },
    isPassthrough: ColorSpace.prototype.isPassthrough,
    createRgbBuffer: ColorSpace.prototype.createRgbBuffer,
    isDefaultDecode: function DeviceCmykCS_isDefaultDecode(decodeMap) {
      return ColorSpace.isDefaultDecode(decodeMap, this.numComps);
    }
  };

  return DeviceCmykCS;
})();

//
// LabCS: Based on "PDF Reference, Sixth Ed", p.250
//
var LabCS = (function LabCSClosure() {
  function LabCS(whitePoint, blackPoint, range) {
    this.name = 'Lab';
    this.numComps = 3;
    this.defaultColor = new Float32Array([0, 0, 0]);

    if (!whitePoint)
      error('WhitePoint missing - required for color space Lab');
    blackPoint = blackPoint || [0, 0, 0];
    range = range || [-100, 100, -100, 100];

    // Translate args to spec variables
    this.XW = whitePoint[0];
    this.YW = whitePoint[1];
    this.ZW = whitePoint[2];
    this.amin = range[0];
    this.amax = range[1];
    this.bmin = range[2];
    this.bmax = range[3];

    // These are here just for completeness - the spec doesn't offer any
    // formulas that use BlackPoint in Lab
    this.XB = blackPoint[0];
    this.YB = blackPoint[1];
    this.ZB = blackPoint[2];

    // Validate vars as per spec
    if (this.XW < 0 || this.ZW < 0 || this.YW !== 1)
      error('Invalid WhitePoint components, no fallback available');

    if (this.XB < 0 || this.YB < 0 || this.ZB < 0) {
      info('Invalid BlackPoint, falling back to default');
      this.XB = this.YB = this.ZB = 0;
    }

    if (this.amin > this.amax || this.bmin > this.bmax) {
      info('Invalid Range, falling back to defaults');
      this.amin = -100;
      this.amax = 100;
      this.bmin = -100;
      this.bmax = 100;
    }
  };

  // Function g(x) from spec
  function fn_g(x) {
    if (x >= 6 / 29)
      return x * x * x;
    else
      return (108 / 841) * (x - 4 / 29);
  }

  function convertToRgb(cs, src, srcOffset, dest, destOffset) {
    // Ls,as,bs <---> L*,a*,b* in the spec
    var Ls = src[srcOffset];
    var as = src[srcOffset + 1];
    var bs = src[srcOffset + 2];

    // Adjust limits of 'as' and 'bs'
    as = as > cs.amax ? cs.amax : as < cs.amin ? cs.amin : as;
    bs = bs > cs.bmax ? cs.bmax : bs < cs.bmin ? cs.bmin : bs;

    // Computes intermediate variables X,Y,Z as per spec
    var M = (Ls + 16) / 116;
    var L = M + (as / 500);
    var N = M - (bs / 200);

    var X = cs.XW * fn_g(L);
    var Y = cs.YW * fn_g(M);
    var Z = cs.ZW * fn_g(N);

    var r, g, b;
    // Using different conversions for D50 and D65 white points,
    // per http://www.color.org/srgb.pdf
    if (cs.ZW < 1) {
      // Assuming D50 (X=0.9642, Y=1.00, Z=0.8249)
      r = X * 3.1339 + Y * -1.6170 + Z * -0.4906;
      g = X * -0.9785 + Y * 1.9160 + Z * 0.0333;
      b = X * 0.0720 + Y * -0.2290 + Z * 1.4057;
    } else {
      // Assuming D65 (X=0.9505, Y=1.00, Z=1.0888)
      r = X * 3.2406 + Y * -1.5372 + Z * -0.4986;
      g = X * -0.9689 + Y * 1.8758 + Z * 0.0415;
      b = X * 0.0557 + Y * -0.2040 + Z * 1.0570;
    }

    // clamp color values to [0,255] range
    dest[destOffset] = r < 0 ? 0 : r > 1 ? 255 : r * 255;
    dest[destOffset + 1] = g < 0 ? 0 : g > 1 ? 255 : g * 255;
    dest[destOffset + 2] = b < 0 ? 0 : b > 1 ? 255 : b * 255;
  }

  LabCS.prototype = {
    getRgb: function LabCS_getRgb(src, srcOffset) {
      var rgb = new Uint8Array(3);
      convertToRgb(this, src, srcOffset, rgb, 0);
      return rgb;
    },
    getRgbItem: function LabCS_getRgbItem(src, srcOffset, dest, destOffset) {
      convertToRgb(this, src, srcOffset, dest, destOffset);
    },
    getOutputLength: function LabCS_getOutputLength(inputLength) {
      return inputLength;
    },
    isPassthrough: ColorSpace.prototype.isPassthrough,
    isDefaultDecode: function LabCS_isDefaultDecode(decodeMap) {
      // From Table 90 in Adobe's:
      // "Document management - Portable document format", 1st ed, 2008
      if (decodeMap[0] === 0 && decodeMap[1] === 100 &&
          decodeMap[2] === this.amin && decodeMap[3] === this.amax &&
          decodeMap[4] === this.bmin && decodeMap[5] === this.bmax)
        return true;
      else
        return false;
    }
  };
  return LabCS;
})();
