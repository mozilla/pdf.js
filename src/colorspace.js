/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var ColorSpace = (function colorSpaceColorSpace() {
  // Constructor should define this.numComps, this.defaultColor, this.name
  function constructor() {
    error('should not call ColorSpace constructor');
  }

  constructor.prototype = {
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

  constructor.parse = function colorSpaceParse(cs, xref, res) {
    var IR = constructor.parseToIR(cs, xref, res, true);
    if (IR instanceof SeparationCS)
      return IR;

    return constructor.fromIR(IR);
  };

  constructor.fromIR = function colorSpaceFromIR(IR) {
    var name;
    if (isArray(IR)) {
      name = IR[0];
    } else {
      name = IR;
    }

    switch (name) {
      case 'DeviceGrayCS':
        return new DeviceGrayCS();
      case 'DeviceRgbCS':
        return new DeviceRgbCS();
      case 'DeviceCmykCS':
        return new DeviceCmykCS();
      case 'PatternCS':
        var baseCS = IR[1];
        if (baseCS == null) {
          return new PatternCS(null);
        } else {
          return new PatternCS(ColorSpace.fromIR(baseCS));
        }
      case 'IndexedCS':
        var baseCS = IR[1];
        var hiVal = IR[2];
        var lookup = IR[3];
        return new IndexedCS(ColorSpace.fromIR(baseCS), hiVal, lookup);
      case 'SeparationCS':
        var alt = IR[1];
        var tintFnIR = IR[2];

        return new SeparationCS(
          ColorSpace.fromIR(alt),
          PDFFunction.fromIR(tintFnIR)
        );
      default:
        error('Unkown name ' + name);
    }
    return null;
  }

  constructor.parseToIR = function colorSpaceParseToIR(cs, xref, res,
                                                       parseOnly) {
    if (isName(cs)) {
      var colorSpaces = xref.fetchIfRef(res.get('ColorSpace'));
      if (isDict(colorSpaces)) {
        var refcs = colorSpaces.get(cs.name);
        if (refcs)
          cs = refcs;
      }
    }

    cs = xref.fetchIfRef(cs);

    if (isName(cs)) {
      var mode = cs.name;
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
      var mode = cs[0].name;
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
          var baseCS = cs[1];
          if (baseCS)
            baseCS = ColorSpace.parseToIR(baseCS, xref, res);
          return ['PatternCS', baseCS];
        case 'Indexed':
          var baseCS = ColorSpace.parseToIR(cs[1], xref, res);
          var hiVal = cs[2] + 1;
          var lookup = xref.fetchIfRef(cs[3]);
          return ['IndexedCS', baseCS, hiVal, lookup];
        case 'Separation':
          var alt = ColorSpace.parseToIR(cs[2], xref, res);
          var tintFnIR = PDFFunction.getIR(xref, xref.fetchIfRef(cs[3]));
          return ['SeparationCS', alt, tintFnIR];
        case 'Lab':
        case 'DeviceN':
        default:
          error('unimplemented color space object "' + mode + '"');
      }
    } else {
      error('unrecognized color space object: "' + cs + '"');
    }
    return null;
  };

  return constructor;
})();

var SeparationCS = (function separationCS() {
  function constructor(base, tintFn) {
    this.name = 'Separation';
    this.numComps = 1;
    this.defaultColor = [1];

    this.base = base;
    this.tintFn = tintFn;
  }

  constructor.prototype = {
    getRgb: function sepcs_getRgb(color) {
      var tinted = this.tintFn(color);
      return this.base.getRgb(tinted);
    },
    getRgbBuffer: function sepcs_getRgbBuffer(input, bits) {
      var tintFn = this.tintFn;
      var base = this.base;
      var scale = 1 / ((1 << bits) - 1);

      var length = input.length;
      var pos = 0;

      var numComps = base.numComps;
      var baseBuf = new Uint8Array(numComps * length);
      for (var i = 0; i < length; ++i) {
        var scaled = input[i] * scale;
        var tinted = tintFn([scaled]);
        for (var j = 0; j < numComps; ++j)
          baseBuf[pos++] = 255 * tinted[j];
      }
      return base.getRgbBuffer(baseBuf, 8);
    }
  };

  return constructor;
})();

var PatternCS = (function patternCS() {
  function constructor(baseCS) {
    this.name = 'Pattern';
    this.base = baseCS;
  }
  constructor.prototype = {};

  return constructor;
})();

var IndexedCS = (function indexedCS() {
  function constructor(base, highVal, lookup) {
    this.name = 'Indexed';
    this.numComps = 1;
    this.defaultColor = [0];

    this.base = base;
    var baseNumComps = base.numComps;
    this.highVal = highVal;

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

  constructor.prototype = {
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
    }
  };
  return constructor;
})();

var DeviceGrayCS = (function deviceGrayCS() {
  function constructor() {
    this.name = 'DeviceGray';
    this.numComps = 1;
    this.defaultColor = [0];
  }

  constructor.prototype = {
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
    }
  };
  return constructor;
})();

var DeviceRgbCS = (function deviceRgbCS() {
  function constructor(bits) {
    this.name = 'DeviceRGB';
    this.numComps = 3;
    this.defaultColor = [0, 0, 0];
  }
  constructor.prototype = {
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
    }
  };
  return constructor;
})();

var DeviceCmykCS = (function deviceCmykCS() {
  function constructor() {
    this.name = 'DeviceCMYK';
    this.numComps = 4;
    this.defaultColor = [0, 0, 0, 1];
  }
  constructor.prototype = {
    getRgb: function cmykcs_getRgb(color) {
      var c = color[0], m = color[1], y = color[2], k = color[3];
      var c1 = 1 - c, m1 = 1 - m, y1 = 1 - y, k1 = 1 - k;

      var x, r, g, b;
      // this is a matrix multiplication, unrolled for performance
      // code is taken from the poppler implementation
      x = c1 * m1 * y1 * k1; // 0 0 0 0
      r = g = b = x;
      x = c1 * m1 * y1 * k;  // 0 0 0 1
      r += 0.1373 * x;
      g += 0.1216 * x;
      b += 0.1255 * x;
      x = c1 * m1 * y * k1; // 0 0 1 0
      r += x;
      g += 0.9490 * x;
      x = c1 * m1 * y * k;  // 0 0 1 1
      r += 0.1098 * x;
      g += 0.1020 * x;
      x = c1 * m * y1 * k1; // 0 1 0 0
      r += 0.9255 * x;
      b += 0.5490 * x;
      x = c1 * m * y1 * k;  // 0 1 0 1
      r += 0.1412 * x;
      x = c1 * m * y * k1; // 0 1 1 0
      r += 0.9294 * x;
      g += 0.1098 * x;
      b += 0.1412 * x;
      x = c1 * m * y * k;  // 0 1 1 1
      r += 0.1333 * x;
      x = c * m1 * y1 * k1; // 1 0 0 0
      g += 0.6784 * x;
      b += 0.9373 * x;
      x = c * m1 * y1 * k;  // 1 0 0 1
      g += 0.0588 * x;
      b += 0.1412 * x;
      x = c * m1 * y * k1; // 1 0 1 0
      g += 0.6510 * x;
      b += 0.3137 * x;
      x = c * m1 * y * k;  // 1 0 1 1
      g += 0.0745 * x;
      x = c * m * y1 * k1; // 1 1 0 0
      r += 0.1804 * x;
      g += 0.1922 * x;
      b += 0.5725 * x;
      x = c * m * y1 * k;  // 1 1 0 1
      b += 0.0078 * x;
      x = c * m * y * k1; // 1 1 1 0
      r += 0.2118 * x;
      g += 0.2119 * x;
      b += 0.2235 * x;

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
    }
  };

  return constructor;
})();

