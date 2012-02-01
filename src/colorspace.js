/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var ColorSpace = (function ColorSpaceClosure() {
  // Constructor should define this.numComps, this.defaultColor, this.name
  function ColorSpace() {
    error('should not call ColorSpace constructor');
  }

  ColorSpace.prototype = {
    // Input: array of size numComps representing color component values
    // Output: array of rgb values, each value ranging from [0.1]
    getRgb: function colorSpaceGetRgb(color) {
      error('Should not call ColorSpace.getRgb: ' + color);
    },
    // Input: Uint8Array of component values, each value scaled to [0,255]
    // Output: Uint8Array of rgb values, each value scaled to [0,255]
    getRgbBuffer: function colorSpaceGetRgbBuffer(input) {
      error('Should not call ColorSpace.getRgbBuffer: ' + input);
    }
  };

  ColorSpace.parse = function colorSpaceParse(cs, xref, res) {
    var IR = ColorSpace.parseToIR(cs, xref, res);
    if (IR instanceof AlternateCS)
      return IR;

    return ColorSpace.fromIR(IR);
  };

  ColorSpace.fromIR = function colorSpaceFromIR(IR) {
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
      default:
        error('Unkown name ' + name);
    }
    return null;
  };

  ColorSpace.parseToIR = function colorSpaceParseToIR(cs, xref, res) {
    if (isName(cs)) {
      var colorSpaces = xref.fetchIfRef(res.get('ColorSpace'));
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
          var baseIndexedCS = ColorSpace.parseToIR(cs[1], xref, res);
          var hiVal = cs[2] + 1;
          var lookup = xref.fetchIfRef(cs[3]);
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
  ColorSpace.isDefaultDecode = function colorSpaceIsDefaultDecode(decode, n) {
    if (!decode)
      return true;

    if (n * 2 !== decode.length) {
      warning('The decode map is not the correct length');
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
    getRgb: function altcs_getRgb(color) {
      var tinted = this.tintFn(color);
      return this.base.getRgb(tinted);
    },
    getRgbBuffer: function altcs_getRgbBuffer(input, bits) {
      var tintFn = this.tintFn;
      var base = this.base;
      var scale = 1 / ((1 << bits) - 1);
      var length = input.length;
      var pos = 0;
      var baseNumComps = base.numComps;
      var baseBuf = new Uint8Array(baseNumComps * length);
      var numComps = this.numComps;
      var scaled = new Array(numComps);

      for (var i = 0; i < length; i += numComps) {
        for (var z = 0; z < numComps; ++z)
          scaled[z] = input[i + z] * scale;

        var tinted = tintFn(scaled);
        for (var j = 0; j < baseNumComps; ++j)
          baseBuf[pos++] = 255 * tinted[j];
      }
      return base.getRgbBuffer(baseBuf, 8);
    },
    isDefaultDecode: function altcs_isDefaultDecode(decodeMap) {
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
    var lookupArray = new Uint8Array(length);

    if (isStream(lookup)) {
      var bytes = lookup.getBytes(length);
      lookupArray.set(bytes);
    } else if (isString(lookup)) {
      for (var i = 0; i < length; ++i)
        lookupArray[i] = lookup.charCodeAt(i);
    } else {
      error('Unrecognized lookup table: ' + lookup);
    }
    this.lookup = lookupArray;
  }

  IndexedCS.prototype = {
    getRgb: function indexcs_getRgb(color) {
      var numComps = this.base.numComps;
      var start = color[0] * numComps;
      var c = [];

      for (var i = start, ii = start + numComps; i < ii; ++i)
        c.push(this.lookup[i]);

      return this.base.getRgb(c);
    },
    getRgbBuffer: function indexcs_getRgbBuffer(input) {
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
    isDefaultDecode: function indexcs_isDefaultDecode(decodeMap) {
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
    getRgb: function graycs_getRgb(color) {
      var c = color[0];
      return [c, c, c];
    },
    getRgbBuffer: function graycs_getRgbBuffer(input, bits) {
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
    isDefaultDecode: function graycs_isDefaultDecode(decodeMap) {
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
    getRgb: function rgbcs_getRgb(color) {
      return color;
    },
    getRgbBuffer: function rgbcs_getRgbBuffer(input, bits) {
      if (bits == 8)
        return input;
      var scale = 255 / ((1 << bits) - 1);
      var i, length = input.length;
      var rgbBuf = new Uint8Array(length);
      for (i = 0; i < length; ++i)
        rgbBuf[i] = (scale * input[i]) | 0;
      return rgbBuf;
    },
    isDefaultDecode: function rgbcs_isDefaultDecode(decodeMap) {
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
    getRgb: function cmykcs_getRgb(color) {
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
    getRgbBuffer: function cmykcs_getRgbBuffer(colorBuf, bits) {
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
    isDefaultDecode: function cmykcs_isDefaultDecode(decodeMap) {
      return ColorSpace.isDefaultDecode(decodeMap, this.numComps);
    }
  };

  return DeviceCmykCS;
})();

