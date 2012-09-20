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
    // Input: array of size numComps representing color component values
    // Output: array of rgb values, each value ranging from [0.1]
    getRgb: function ColorSpace_getRgb(color) {
      error('Should not call ColorSpace.getRgb: ' + color);
    },
    // Input: Uint8Array of component values, each value scaled to [0,255]
    // Output: Uint8Array of rgb values, each value scaled to [0,255]
    getRgbBuffer: function ColorSpace_getRgbBuffer(input) {
      error('Should not call ColorSpace.getRgbBuffer: ' + input);
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
    this.defaultColor = [];
    for (var i = 0; i < numComps; ++i)
      this.defaultColor.push(1);
    this.base = base;
    this.tintFn = tintFn;
  }

  AlternateCS.prototype = {
    getRgb: function AlternateCS_getRgb(color) {
      var tinted = this.tintFn(color);
      return this.base.getRgb(tinted);
    },
    getRgbBuffer: function AlternateCS_getRgbBuffer(input, bits) {
      var tintFn = this.tintFn;
      var base = this.base;
      var scale = 1 / ((1 << bits) - 1);
      var length = input.length;
      var pos = 0;
      var baseNumComps = base.numComps;
      var baseBuf = new Uint8Array(baseNumComps * length);
      var numComps = this.numComps;
      var scaled = [];

      for (var i = 0; i < length; i += numComps) {
        for (var z = 0; z < numComps; ++z)
          scaled[z] = input[i + z] * scale;

        var tinted = tintFn(scaled);
        for (var j = 0; j < baseNumComps; ++j)
          baseBuf[pos++] = 255 * tinted[j];
      }
      return base.getRgbBuffer(baseBuf, 8);
    },
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
    this.defaultColor = [0];
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
    getRgb: function IndexedCS_getRgb(color) {
      var numComps = this.base.numComps;
      var start = color[0] * numComps;
      var c = [];

      for (var i = start, ii = start + numComps; i < ii; ++i)
        c.push(this.lookup[i]);

      return this.base.getRgb(c);
    },
    getRgbBuffer: function IndexedCS_getRgbBuffer(input) {
      var base = this.base;
      var numComps = base.numComps;
      var lookup = this.lookup;
      var length = input.length;
      var baseBuf = new Uint8Array(length * numComps);
      var baseBufPos = 0;

      for (var i = 0; i < length; ++i) {
        var lookupPos = input[i] * numComps;
        for (var j = 0; j < numComps; ++j) {
          baseBuf[baseBufPos++] = lookup[lookupPos + j];
        }
      }

      return base.getRgbBuffer(baseBuf, 8);
    },
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
    this.defaultColor = [0];
  }

  DeviceGrayCS.prototype = {
    getRgb: function DeviceGrayCS_getRgb(color) {
      var c = color[0];
      return [c, c, c];
    },
    getRgbBuffer: function DeviceGrayCS_getRgbBuffer(input, bits) {
      var scale = 255 / ((1 << bits) - 1);
      var length = input.length;
      var rgbBuf = new Uint8Array(length * 3);
      for (var i = 0, j = 0; i < length; ++i) {
        var c = (scale * input[i]) | 0;
        rgbBuf[j++] = c;
        rgbBuf[j++] = c;
        rgbBuf[j++] = c;
      }
      return rgbBuf;
    },
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
    this.defaultColor = [0, 0, 0];
  }
  DeviceRgbCS.prototype = {
    getRgb: function DeviceRgbCS_getRgb(color) {
      return color;
    },
    getRgbBuffer: function DeviceRgbCS_getRgbBuffer(input, bits) {
      if (bits == 8)
        return input;
      var scale = 255 / ((1 << bits) - 1);
      var i, length = input.length;
      var rgbBuf = new Uint8Array(length);
      for (i = 0; i < length; ++i)
        rgbBuf[i] = (scale * input[i]) | 0;
      return rgbBuf;
    },
    isDefaultDecode: function DeviceRgbCS_isDefaultDecode(decodeMap) {
      return ColorSpace.isDefaultDecode(decodeMap, this.numComps);
    }
  };
  return DeviceRgbCS;
})();

var DeviceCmykCS = (function DeviceCmykCSClosure() {
  function DeviceCmykCS() {
    this.name = 'DeviceCMYK';
    this.numComps = 4;
    this.defaultColor = [0, 0, 0, 1];
  }
  DeviceCmykCS.prototype = {
    getRgb: function DeviceCmykCS_getRgb(color) {
      var c = color[0], m = color[1], y = color[2], k = color[3];

      // CMYK -> CMY: http://www.easyrgb.com/index.php?X=MATH&H=14#text14
      c = (c * (1 - k) + k);
      m = (m * (1 - k) + k);
      y = (y * (1 - k) + k);

      // CMY -> RGB: http://www.easyrgb.com/index.php?X=MATH&H=12#text12
      var r = (1 - c);
      var g = (1 - m);
      var b = (1 - y);

      return [r, g, b];
    },
    getRgbBuffer: function DeviceCmykCS_getRgbBuffer(colorBuf, bits) {
      var scale = 1 / ((1 << bits) - 1);
      var length = colorBuf.length / 4;
      var rgbBuf = new Uint8Array(length * 3);
      var rgbBufPos = 0;
      var colorBufPos = 0;

      for (var i = 0; i < length; i++) {
        var cmyk = [];
        for (var j = 0; j < 4; ++j)
          cmyk.push(scale * colorBuf[colorBufPos++]);

        var rgb = this.getRgb(cmyk);
        for (var j = 0; j < 3; ++j)
          rgbBuf[rgbBufPos++] = Math.round(rgb[j] * 255);
      }

      return rgbBuf;
    },
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
    this.defaultColor = [0, 0, 0];

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
  function g(x) {
    if (x >= 6 / 29)
      return x * x * x;
    else
      return (108 / 841) * (x - 4 / 29);
  }

  LabCS.prototype = {
    getRgb: function LabCS_getRgb(color) {
      // Ls,as,bs <---> L*,a*,b* in the spec
      var Ls = color[0], as = color[1], bs = color[2];

      // Adjust limits of 'as' and 'bs'
      as = as > this.amax ? this.amax : as;
      as = as < this.amin ? this.amin : as;
      bs = bs > this.bmax ? this.bmax : bs;
      bs = bs < this.bmin ? this.bmin : bs;

      // Computes intermediate variables X,Y,Z as per spec
      var M = (Ls + 16) / 116;
      var L = M + (as / 500);
      var N = M - (bs / 200);
      var X = this.XW * g(L);
      var Y = this.YW * g(M);
      var Z = this.ZW * g(N);

      // XYZ to RGB 3x3 matrix, from:
      // http://www.poynton.com/notes/colour_and_gamma/ColorFAQ.html#RTFToC18
      var XYZtoRGB = [3.240479, -1.537150, -0.498535,
                      -0.969256, 1.875992, 0.041556,
                      0.055648, -0.204043, 1.057311];

      return Util.apply3dTransform(XYZtoRGB, [X, Y, Z]);
    },
    getRgbBuffer: function LabCS_getRgbBuffer(input, bits) {
      if (bits == 8)
        return input;
      var scale = 255 / ((1 << bits) - 1);
      var i, length = input.length / 3;
      var rgbBuf = new Uint8Array(length);

      var j = 0;
      for (i = 0; i < length; ++i) {
        // Convert L*, a*, s* into RGB
        var rgb = this.getRgb([input[i], input[i + 1], input[i + 2]]);
        rgbBuf[j++] = rgb[0];
        rgbBuf[j++] = rgb[1];
        rgbBuf[j++] = rgb[2];
      }

      return rgbBuf;
    },
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
