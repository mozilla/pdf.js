/* Copyright 2017 Mozilla Foundation
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

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ColorSpace = undefined;

var _util = require('../shared/util');

var _primitives = require('./primitives');

var _function = require('./function');

var ColorSpace = function ColorSpaceClosure() {
  function resizeRgbImage(src, bpc, w1, h1, w2, h2, alpha01, dest) {
    var COMPONENTS = 3;
    alpha01 = alpha01 !== 1 ? 0 : alpha01;
    var xRatio = w1 / w2;
    var yRatio = h1 / h2;
    var i,
        j,
        py,
        newIndex = 0,
        oldIndex;
    var xScaled = new Uint16Array(w2);
    var w1Scanline = w1 * COMPONENTS;
    for (i = 0; i < w2; i++) {
      xScaled[i] = Math.floor(i * xRatio) * COMPONENTS;
    }
    for (i = 0; i < h2; i++) {
      py = Math.floor(i * yRatio) * w1Scanline;
      for (j = 0; j < w2; j++) {
        oldIndex = py + xScaled[j];
        dest[newIndex++] = src[oldIndex++];
        dest[newIndex++] = src[oldIndex++];
        dest[newIndex++] = src[oldIndex++];
        newIndex += alpha01;
      }
    }
  }
  function ColorSpace() {
    throw new Error('should not call ColorSpace constructor');
  }
  ColorSpace.prototype = {
    getRgb: function ColorSpace_getRgb(src, srcOffset) {
      var rgb = new Uint8Array(3);
      this.getRgbItem(src, srcOffset, rgb, 0);
      return rgb;
    },
    getRgbItem: function ColorSpace_getRgbItem(src, srcOffset, dest, destOffset) {
      throw new Error('Should not call ColorSpace.getRgbItem');
    },
    getRgbBuffer: function ColorSpace_getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
      throw new Error('Should not call ColorSpace.getRgbBuffer');
    },
    getOutputLength: function ColorSpace_getOutputLength(inputLength, alpha01) {
      throw new Error('Should not call ColorSpace.getOutputLength');
    },
    isPassthrough: function ColorSpace_isPassthrough(bits) {
      return false;
    },
    fillRgb: function ColorSpace_fillRgb(dest, originalWidth, originalHeight, width, height, actualHeight, bpc, comps, alpha01) {
      var count = originalWidth * originalHeight;
      var rgbBuf = null;
      var numComponentColors = 1 << bpc;
      var needsResizing = originalHeight !== height || originalWidth !== width;
      var i, ii;
      if (this.isPassthrough(bpc)) {
        rgbBuf = comps;
      } else if (this.numComps === 1 && count > numComponentColors && this.name !== 'DeviceGray' && this.name !== 'DeviceRGB') {
        var allColors = bpc <= 8 ? new Uint8Array(numComponentColors) : new Uint16Array(numComponentColors);
        var key;
        for (i = 0; i < numComponentColors; i++) {
          allColors[i] = i;
        }
        var colorMap = new Uint8Array(numComponentColors * 3);
        this.getRgbBuffer(allColors, 0, numComponentColors, colorMap, 0, bpc, 0);
        var destPos, rgbPos;
        if (!needsResizing) {
          destPos = 0;
          for (i = 0; i < count; ++i) {
            key = comps[i] * 3;
            dest[destPos++] = colorMap[key];
            dest[destPos++] = colorMap[key + 1];
            dest[destPos++] = colorMap[key + 2];
            destPos += alpha01;
          }
        } else {
          rgbBuf = new Uint8Array(count * 3);
          rgbPos = 0;
          for (i = 0; i < count; ++i) {
            key = comps[i] * 3;
            rgbBuf[rgbPos++] = colorMap[key];
            rgbBuf[rgbPos++] = colorMap[key + 1];
            rgbBuf[rgbPos++] = colorMap[key + 2];
          }
        }
      } else {
        if (!needsResizing) {
          this.getRgbBuffer(comps, 0, width * actualHeight, dest, 0, bpc, alpha01);
        } else {
          rgbBuf = new Uint8Array(count * 3);
          this.getRgbBuffer(comps, 0, count, rgbBuf, 0, bpc, 0);
        }
      }
      if (rgbBuf) {
        if (needsResizing) {
          resizeRgbImage(rgbBuf, bpc, originalWidth, originalHeight, width, height, alpha01, dest);
        } else {
          rgbPos = 0;
          destPos = 0;
          for (i = 0, ii = width * actualHeight; i < ii; i++) {
            dest[destPos++] = rgbBuf[rgbPos++];
            dest[destPos++] = rgbBuf[rgbPos++];
            dest[destPos++] = rgbBuf[rgbPos++];
            destPos += alpha01;
          }
        }
      }
    },
    usesZeroToOneRange: true
  };
  ColorSpace.parse = function ColorSpace_parse(cs, xref, res) {
    var IR = ColorSpace.parseToIR(cs, xref, res);
    if (IR instanceof AlternateCS) {
      return IR;
    }
    return ColorSpace.fromIR(IR);
  };
  ColorSpace.fromIR = function ColorSpace_fromIR(IR) {
    var name = Array.isArray(IR) ? IR[0] : IR;
    var whitePoint, blackPoint, gamma;
    switch (name) {
      case 'DeviceGrayCS':
        return this.singletons.gray;
      case 'DeviceRgbCS':
        return this.singletons.rgb;
      case 'DeviceCmykCS':
        return this.singletons.cmyk;
      case 'CalGrayCS':
        whitePoint = IR[1];
        blackPoint = IR[2];
        gamma = IR[3];
        return new CalGrayCS(whitePoint, blackPoint, gamma);
      case 'CalRGBCS':
        whitePoint = IR[1];
        blackPoint = IR[2];
        gamma = IR[3];
        var matrix = IR[4];
        return new CalRGBCS(whitePoint, blackPoint, gamma, matrix);
      case 'PatternCS':
        var basePatternCS = IR[1];
        if (basePatternCS) {
          basePatternCS = ColorSpace.fromIR(basePatternCS);
        }
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
        return new AlternateCS(numComps, ColorSpace.fromIR(alt), _function.PDFFunction.fromIR(tintFnIR));
      case 'LabCS':
        whitePoint = IR[1];
        blackPoint = IR[2];
        var range = IR[3];
        return new LabCS(whitePoint, blackPoint, range);
      default:
        throw new _util.FormatError('Unknown colorspace name: ' + name);
    }
  };
  ColorSpace.parseToIR = function ColorSpace_parseToIR(cs, xref, res) {
    if ((0, _primitives.isName)(cs)) {
      var colorSpaces = res.get('ColorSpace');
      if ((0, _primitives.isDict)(colorSpaces)) {
        var refcs = colorSpaces.get(cs.name);
        if (refcs) {
          cs = refcs;
        }
      }
    }
    cs = xref.fetchIfRef(cs);
    if ((0, _primitives.isName)(cs)) {
      switch (cs.name) {
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
          throw new _util.FormatError('unrecognized colorspace ' + cs.name);
      }
    }
    if (Array.isArray(cs)) {
      var mode = xref.fetchIfRef(cs[0]).name;
      var numComps, params, alt, whitePoint, blackPoint, gamma;
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
          params = xref.fetchIfRef(cs[1]);
          whitePoint = params.getArray('WhitePoint');
          blackPoint = params.getArray('BlackPoint');
          gamma = params.get('Gamma');
          return ['CalGrayCS', whitePoint, blackPoint, gamma];
        case 'CalRGB':
          params = xref.fetchIfRef(cs[1]);
          whitePoint = params.getArray('WhitePoint');
          blackPoint = params.getArray('BlackPoint');
          gamma = params.getArray('Gamma');
          var matrix = params.getArray('Matrix');
          return ['CalRGBCS', whitePoint, blackPoint, gamma, matrix];
        case 'ICCBased':
          var stream = xref.fetchIfRef(cs[1]);
          var dict = stream.dict;
          numComps = dict.get('N');
          alt = dict.get('Alternate');
          if (alt) {
            var altIR = ColorSpace.parseToIR(alt, xref, res);
            var altCS = ColorSpace.fromIR(altIR);
            if (altCS.numComps === numComps) {
              return altIR;
            }
            (0, _util.warn)('ICCBased color space: Ignoring incorrect /Alternate entry.');
          }
          if (numComps === 1) {
            return 'DeviceGrayCS';
          } else if (numComps === 3) {
            return 'DeviceRgbCS';
          } else if (numComps === 4) {
            return 'DeviceCmykCS';
          }
          break;
        case 'Pattern':
          var basePatternCS = cs[1] || null;
          if (basePatternCS) {
            basePatternCS = ColorSpace.parseToIR(basePatternCS, xref, res);
          }
          return ['PatternCS', basePatternCS];
        case 'Indexed':
        case 'I':
          var baseIndexedCS = ColorSpace.parseToIR(cs[1], xref, res);
          var hiVal = xref.fetchIfRef(cs[2]) + 1;
          var lookup = xref.fetchIfRef(cs[3]);
          if ((0, _primitives.isStream)(lookup)) {
            lookup = lookup.getBytes();
          }
          return ['IndexedCS', baseIndexedCS, hiVal, lookup];
        case 'Separation':
        case 'DeviceN':
          var name = xref.fetchIfRef(cs[1]);
          numComps = Array.isArray(name) ? name.length : 1;
          alt = ColorSpace.parseToIR(cs[2], xref, res);
          var tintFnIR = _function.PDFFunction.getIR(xref, xref.fetchIfRef(cs[3]));
          return ['AlternateCS', numComps, alt, tintFnIR];
        case 'Lab':
          params = xref.fetchIfRef(cs[1]);
          whitePoint = params.getArray('WhitePoint');
          blackPoint = params.getArray('BlackPoint');
          var range = params.getArray('Range');
          return ['LabCS', whitePoint, blackPoint, range];
        default:
          throw new _util.FormatError('unimplemented color space object "' + mode + '"');
      }
    }
    throw new _util.FormatError('unrecognized color space object: "' + cs + '"');
  };
  ColorSpace.isDefaultDecode = function ColorSpace_isDefaultDecode(decode, n) {
    if (!Array.isArray(decode)) {
      return true;
    }
    if (n * 2 !== decode.length) {
      (0, _util.warn)('The decode map is not the correct length');
      return true;
    }
    for (var i = 0, ii = decode.length; i < ii; i += 2) {
      if (decode[i] !== 0 || decode[i + 1] !== 1) {
        return false;
      }
    }
    return true;
  };
  ColorSpace.singletons = {
    get gray() {
      return (0, _util.shadow)(this, 'gray', new DeviceGrayCS());
    },
    get rgb() {
      return (0, _util.shadow)(this, 'rgb', new DeviceRgbCS());
    },
    get cmyk() {
      return (0, _util.shadow)(this, 'cmyk', new DeviceCmykCS());
    }
  };
  return ColorSpace;
}();
var AlternateCS = function AlternateCSClosure() {
  function AlternateCS(numComps, base, tintFn) {
    this.name = 'Alternate';
    this.numComps = numComps;
    this.defaultColor = new Float32Array(numComps);
    for (var i = 0; i < numComps; ++i) {
      this.defaultColor[i] = 1;
    }
    this.base = base;
    this.tintFn = tintFn;
    this.tmpBuf = new Float32Array(base.numComps);
  }
  AlternateCS.prototype = {
    getRgb: ColorSpace.prototype.getRgb,
    getRgbItem: function AlternateCS_getRgbItem(src, srcOffset, dest, destOffset) {
      var tmpBuf = this.tmpBuf;
      this.tintFn(src, srcOffset, tmpBuf, 0);
      this.base.getRgbItem(tmpBuf, 0, dest, destOffset);
    },
    getRgbBuffer: function AlternateCS_getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
      var tintFn = this.tintFn;
      var base = this.base;
      var scale = 1 / ((1 << bits) - 1);
      var baseNumComps = base.numComps;
      var usesZeroToOneRange = base.usesZeroToOneRange;
      var isPassthrough = (base.isPassthrough(8) || !usesZeroToOneRange) && alpha01 === 0;
      var pos = isPassthrough ? destOffset : 0;
      var baseBuf = isPassthrough ? dest : new Uint8Array(baseNumComps * count);
      var numComps = this.numComps;
      var scaled = new Float32Array(numComps);
      var tinted = new Float32Array(baseNumComps);
      var i, j;
      for (i = 0; i < count; i++) {
        for (j = 0; j < numComps; j++) {
          scaled[j] = src[srcOffset++] * scale;
        }
        tintFn(scaled, 0, tinted, 0);
        if (usesZeroToOneRange) {
          for (j = 0; j < baseNumComps; j++) {
            baseBuf[pos++] = tinted[j] * 255;
          }
        } else {
          base.getRgbItem(tinted, 0, baseBuf, pos);
          pos += baseNumComps;
        }
      }
      if (!isPassthrough) {
        base.getRgbBuffer(baseBuf, 0, count, dest, destOffset, 8, alpha01);
      }
    },
    getOutputLength: function AlternateCS_getOutputLength(inputLength, alpha01) {
      return this.base.getOutputLength(inputLength * this.base.numComps / this.numComps, alpha01);
    },
    isPassthrough: ColorSpace.prototype.isPassthrough,
    fillRgb: ColorSpace.prototype.fillRgb,
    isDefaultDecode: function AlternateCS_isDefaultDecode(decodeMap) {
      return ColorSpace.isDefaultDecode(decodeMap, this.numComps);
    },
    usesZeroToOneRange: true
  };
  return AlternateCS;
}();
var PatternCS = function PatternCSClosure() {
  function PatternCS(baseCS) {
    this.name = 'Pattern';
    this.base = baseCS;
  }
  PatternCS.prototype = {};
  return PatternCS;
}();
var IndexedCS = function IndexedCSClosure() {
  function IndexedCS(base, highVal, lookup) {
    this.name = 'Indexed';
    this.numComps = 1;
    this.defaultColor = new Uint8Array(this.numComps);
    this.base = base;
    this.highVal = highVal;
    var baseNumComps = base.numComps;
    var length = baseNumComps * highVal;
    if ((0, _primitives.isStream)(lookup)) {
      this.lookup = new Uint8Array(length);
      var bytes = lookup.getBytes(length);
      this.lookup.set(bytes);
    } else if ((0, _util.isString)(lookup)) {
      this.lookup = new Uint8Array(length);
      for (var i = 0; i < length; ++i) {
        this.lookup[i] = lookup.charCodeAt(i);
      }
    } else if (lookup instanceof Uint8Array || lookup instanceof Array) {
      this.lookup = lookup;
    } else {
      throw new _util.FormatError('Unrecognized lookup table: ' + lookup);
    }
  }
  IndexedCS.prototype = {
    getRgb: ColorSpace.prototype.getRgb,
    getRgbItem: function IndexedCS_getRgbItem(src, srcOffset, dest, destOffset) {
      var numComps = this.base.numComps;
      var start = src[srcOffset] * numComps;
      this.base.getRgbBuffer(this.lookup, start, 1, dest, destOffset, 8, 0);
    },
    getRgbBuffer: function IndexedCS_getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
      var base = this.base;
      var numComps = base.numComps;
      var outputDelta = base.getOutputLength(numComps, alpha01);
      var lookup = this.lookup;
      for (var i = 0; i < count; ++i) {
        var lookupPos = src[srcOffset++] * numComps;
        base.getRgbBuffer(lookup, lookupPos, 1, dest, destOffset, 8, alpha01);
        destOffset += outputDelta;
      }
    },
    getOutputLength: function IndexedCS_getOutputLength(inputLength, alpha01) {
      return this.base.getOutputLength(inputLength * this.base.numComps, alpha01);
    },
    isPassthrough: ColorSpace.prototype.isPassthrough,
    fillRgb: ColorSpace.prototype.fillRgb,
    isDefaultDecode: function IndexedCS_isDefaultDecode(decodeMap) {
      return true;
    },
    usesZeroToOneRange: true
  };
  return IndexedCS;
}();
var DeviceGrayCS = function DeviceGrayCSClosure() {
  function DeviceGrayCS() {
    this.name = 'DeviceGray';
    this.numComps = 1;
    this.defaultColor = new Float32Array(this.numComps);
  }
  DeviceGrayCS.prototype = {
    getRgb: ColorSpace.prototype.getRgb,
    getRgbItem: function DeviceGrayCS_getRgbItem(src, srcOffset, dest, destOffset) {
      var c = src[srcOffset] * 255 | 0;
      c = c < 0 ? 0 : c > 255 ? 255 : c;
      dest[destOffset] = dest[destOffset + 1] = dest[destOffset + 2] = c;
    },
    getRgbBuffer: function DeviceGrayCS_getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
      var scale = 255 / ((1 << bits) - 1);
      var j = srcOffset,
          q = destOffset;
      for (var i = 0; i < count; ++i) {
        var c = scale * src[j++] | 0;
        dest[q++] = c;
        dest[q++] = c;
        dest[q++] = c;
        q += alpha01;
      }
    },
    getOutputLength: function DeviceGrayCS_getOutputLength(inputLength, alpha01) {
      return inputLength * (3 + alpha01);
    },
    isPassthrough: ColorSpace.prototype.isPassthrough,
    fillRgb: ColorSpace.prototype.fillRgb,
    isDefaultDecode: function DeviceGrayCS_isDefaultDecode(decodeMap) {
      return ColorSpace.isDefaultDecode(decodeMap, this.numComps);
    },
    usesZeroToOneRange: true
  };
  return DeviceGrayCS;
}();
var DeviceRgbCS = function DeviceRgbCSClosure() {
  function DeviceRgbCS() {
    this.name = 'DeviceRGB';
    this.numComps = 3;
    this.defaultColor = new Float32Array(this.numComps);
  }
  DeviceRgbCS.prototype = {
    getRgb: ColorSpace.prototype.getRgb,
    getRgbItem: function DeviceRgbCS_getRgbItem(src, srcOffset, dest, destOffset) {
      var r = src[srcOffset] * 255 | 0;
      var g = src[srcOffset + 1] * 255 | 0;
      var b = src[srcOffset + 2] * 255 | 0;
      dest[destOffset] = r < 0 ? 0 : r > 255 ? 255 : r;
      dest[destOffset + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      dest[destOffset + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    },
    getRgbBuffer: function DeviceRgbCS_getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
      if (bits === 8 && alpha01 === 0) {
        dest.set(src.subarray(srcOffset, srcOffset + count * 3), destOffset);
        return;
      }
      var scale = 255 / ((1 << bits) - 1);
      var j = srcOffset,
          q = destOffset;
      for (var i = 0; i < count; ++i) {
        dest[q++] = scale * src[j++] | 0;
        dest[q++] = scale * src[j++] | 0;
        dest[q++] = scale * src[j++] | 0;
        q += alpha01;
      }
    },
    getOutputLength: function DeviceRgbCS_getOutputLength(inputLength, alpha01) {
      return inputLength * (3 + alpha01) / 3 | 0;
    },
    isPassthrough: function DeviceRgbCS_isPassthrough(bits) {
      return bits === 8;
    },
    fillRgb: ColorSpace.prototype.fillRgb,
    isDefaultDecode: function DeviceRgbCS_isDefaultDecode(decodeMap) {
      return ColorSpace.isDefaultDecode(decodeMap, this.numComps);
    },
    usesZeroToOneRange: true
  };
  return DeviceRgbCS;
}();
var DeviceCmykCS = function DeviceCmykCSClosure() {
  function convertToRgb(src, srcOffset, srcScale, dest, destOffset) {
    var c = src[srcOffset + 0] * srcScale;
    var m = src[srcOffset + 1] * srcScale;
    var y = src[srcOffset + 2] * srcScale;
    var k = src[srcOffset + 3] * srcScale;
    var r = c * (-4.387332384609988 * c + 54.48615194189176 * m + 18.82290502165302 * y + 212.25662451639585 * k + -285.2331026137004) + m * (1.7149763477362134 * m - 5.6096736904047315 * y + -17.873870861415444 * k - 5.497006427196366) + y * (-2.5217340131683033 * y - 21.248923337353073 * k + 17.5119270841813) + k * (-21.86122147463605 * k - 189.48180835922747) + 255 | 0;
    var g = c * (8.841041422036149 * c + 60.118027045597366 * m + 6.871425592049007 * y + 31.159100130055922 * k + -79.2970844816548) + m * (-15.310361306967817 * m + 17.575251261109482 * y + 131.35250912493976 * k - 190.9453302588951) + y * (4.444339102852739 * y + 9.8632861493405 * k - 24.86741582555878) + k * (-20.737325471181034 * k - 187.80453709719578) + 255 | 0;
    var b = c * (0.8842522430003296 * c + 8.078677503112928 * m + 30.89978309703729 * y - 0.23883238689178934 * k + -14.183576799673286) + m * (10.49593273432072 * m + 63.02378494754052 * y + 50.606957656360734 * k - 112.23884253719248) + y * (0.03296041114873217 * y + 115.60384449646641 * k + -193.58209356861505) + k * (-22.33816807309886 * k - 180.12613974708367) + 255 | 0;
    dest[destOffset] = r > 255 ? 255 : r < 0 ? 0 : r;
    dest[destOffset + 1] = g > 255 ? 255 : g < 0 ? 0 : g;
    dest[destOffset + 2] = b > 255 ? 255 : b < 0 ? 0 : b;
  }
  function DeviceCmykCS() {
    this.name = 'DeviceCMYK';
    this.numComps = 4;
    this.defaultColor = new Float32Array(this.numComps);
    this.defaultColor[3] = 1;
  }
  DeviceCmykCS.prototype = {
    getRgb: ColorSpace.prototype.getRgb,
    getRgbItem: function DeviceCmykCS_getRgbItem(src, srcOffset, dest, destOffset) {
      convertToRgb(src, srcOffset, 1, dest, destOffset);
    },
    getRgbBuffer: function DeviceCmykCS_getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
      var scale = 1 / ((1 << bits) - 1);
      for (var i = 0; i < count; i++) {
        convertToRgb(src, srcOffset, scale, dest, destOffset);
        srcOffset += 4;
        destOffset += 3 + alpha01;
      }
    },
    getOutputLength: function DeviceCmykCS_getOutputLength(inputLength, alpha01) {
      return inputLength / 4 * (3 + alpha01) | 0;
    },
    isPassthrough: ColorSpace.prototype.isPassthrough,
    fillRgb: ColorSpace.prototype.fillRgb,
    isDefaultDecode: function DeviceCmykCS_isDefaultDecode(decodeMap) {
      return ColorSpace.isDefaultDecode(decodeMap, this.numComps);
    },
    usesZeroToOneRange: true
  };
  return DeviceCmykCS;
}();
var CalGrayCS = function CalGrayCSClosure() {
  function CalGrayCS(whitePoint, blackPoint, gamma) {
    this.name = 'CalGray';
    this.numComps = 1;
    this.defaultColor = new Float32Array(this.numComps);
    if (!whitePoint) {
      throw new _util.FormatError('WhitePoint missing - required for color space CalGray');
    }
    blackPoint = blackPoint || [0, 0, 0];
    gamma = gamma || 1;
    this.XW = whitePoint[0];
    this.YW = whitePoint[1];
    this.ZW = whitePoint[2];
    this.XB = blackPoint[0];
    this.YB = blackPoint[1];
    this.ZB = blackPoint[2];
    this.G = gamma;
    if (this.XW < 0 || this.ZW < 0 || this.YW !== 1) {
      throw new _util.FormatError('Invalid WhitePoint components for ' + this.name + ', no fallback available');
    }
    if (this.XB < 0 || this.YB < 0 || this.ZB < 0) {
      (0, _util.info)('Invalid BlackPoint for ' + this.name + ', falling back to default');
      this.XB = this.YB = this.ZB = 0;
    }
    if (this.XB !== 0 || this.YB !== 0 || this.ZB !== 0) {
      (0, _util.warn)(this.name + ', BlackPoint: XB: ' + this.XB + ', YB: ' + this.YB + ', ZB: ' + this.ZB + ', only default values are supported.');
    }
    if (this.G < 1) {
      (0, _util.info)('Invalid Gamma: ' + this.G + ' for ' + this.name + ', falling back to default');
      this.G = 1;
    }
  }
  function convertToRgb(cs, src, srcOffset, dest, destOffset, scale) {
    var A = src[srcOffset] * scale;
    var AG = Math.pow(A, cs.G);
    var L = cs.YW * AG;
    var val = Math.max(295.8 * Math.pow(L, 0.333333333333333333) - 40.8, 0) | 0;
    dest[destOffset] = val;
    dest[destOffset + 1] = val;
    dest[destOffset + 2] = val;
  }
  CalGrayCS.prototype = {
    getRgb: ColorSpace.prototype.getRgb,
    getRgbItem: function CalGrayCS_getRgbItem(src, srcOffset, dest, destOffset) {
      convertToRgb(this, src, srcOffset, dest, destOffset, 1);
    },
    getRgbBuffer: function CalGrayCS_getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
      var scale = 1 / ((1 << bits) - 1);
      for (var i = 0; i < count; ++i) {
        convertToRgb(this, src, srcOffset, dest, destOffset, scale);
        srcOffset += 1;
        destOffset += 3 + alpha01;
      }
    },
    getOutputLength: function CalGrayCS_getOutputLength(inputLength, alpha01) {
      return inputLength * (3 + alpha01);
    },
    isPassthrough: ColorSpace.prototype.isPassthrough,
    fillRgb: ColorSpace.prototype.fillRgb,
    isDefaultDecode: function CalGrayCS_isDefaultDecode(decodeMap) {
      return ColorSpace.isDefaultDecode(decodeMap, this.numComps);
    },
    usesZeroToOneRange: true
  };
  return CalGrayCS;
}();
var CalRGBCS = function CalRGBCSClosure() {
  var BRADFORD_SCALE_MATRIX = new Float32Array([0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296]);
  var BRADFORD_SCALE_INVERSE_MATRIX = new Float32Array([0.9869929, -0.1470543, 0.1599627, 0.4323053, 0.5183603, 0.0492912, -0.0085287, 0.0400428, 0.9684867]);
  var SRGB_D65_XYZ_TO_RGB_MATRIX = new Float32Array([3.2404542, -1.5371385, -0.4985314, -0.9692660, 1.8760108, 0.0415560, 0.0556434, -0.2040259, 1.0572252]);
  var FLAT_WHITEPOINT_MATRIX = new Float32Array([1, 1, 1]);
  var tempNormalizeMatrix = new Float32Array(3);
  var tempConvertMatrix1 = new Float32Array(3);
  var tempConvertMatrix2 = new Float32Array(3);
  var DECODE_L_CONSTANT = Math.pow((8 + 16) / 116, 3) / 8.0;
  function CalRGBCS(whitePoint, blackPoint, gamma, matrix) {
    this.name = 'CalRGB';
    this.numComps = 3;
    this.defaultColor = new Float32Array(this.numComps);
    if (!whitePoint) {
      throw new _util.FormatError('WhitePoint missing - required for color space CalRGB');
    }
    blackPoint = blackPoint || new Float32Array(3);
    gamma = gamma || new Float32Array([1, 1, 1]);
    matrix = matrix || new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    var XW = whitePoint[0];
    var YW = whitePoint[1];
    var ZW = whitePoint[2];
    this.whitePoint = whitePoint;
    var XB = blackPoint[0];
    var YB = blackPoint[1];
    var ZB = blackPoint[2];
    this.blackPoint = blackPoint;
    this.GR = gamma[0];
    this.GG = gamma[1];
    this.GB = gamma[2];
    this.MXA = matrix[0];
    this.MYA = matrix[1];
    this.MZA = matrix[2];
    this.MXB = matrix[3];
    this.MYB = matrix[4];
    this.MZB = matrix[5];
    this.MXC = matrix[6];
    this.MYC = matrix[7];
    this.MZC = matrix[8];
    if (XW < 0 || ZW < 0 || YW !== 1) {
      throw new _util.FormatError('Invalid WhitePoint components for ' + this.name + ', no fallback available');
    }
    if (XB < 0 || YB < 0 || ZB < 0) {
      (0, _util.info)('Invalid BlackPoint for ' + this.name + ' [' + XB + ', ' + YB + ', ' + ZB + '], falling back to default');
      this.blackPoint = new Float32Array(3);
    }
    if (this.GR < 0 || this.GG < 0 || this.GB < 0) {
      (0, _util.info)('Invalid Gamma [' + this.GR + ', ' + this.GG + ', ' + this.GB + '] for ' + this.name + ', falling back to default');
      this.GR = this.GG = this.GB = 1;
    }
    if (this.MXA < 0 || this.MYA < 0 || this.MZA < 0 || this.MXB < 0 || this.MYB < 0 || this.MZB < 0 || this.MXC < 0 || this.MYC < 0 || this.MZC < 0) {
      (0, _util.info)('Invalid Matrix for ' + this.name + ' [' + this.MXA + ', ' + this.MYA + ', ' + this.MZA + this.MXB + ', ' + this.MYB + ', ' + this.MZB + this.MXC + ', ' + this.MYC + ', ' + this.MZC + '], falling back to default');
      this.MXA = this.MYB = this.MZC = 1;
      this.MXB = this.MYA = this.MZA = this.MXC = this.MYC = this.MZB = 0;
    }
  }
  function matrixProduct(a, b, result) {
    result[0] = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    result[1] = a[3] * b[0] + a[4] * b[1] + a[5] * b[2];
    result[2] = a[6] * b[0] + a[7] * b[1] + a[8] * b[2];
  }
  function convertToFlat(sourceWhitePoint, LMS, result) {
    result[0] = LMS[0] * 1 / sourceWhitePoint[0];
    result[1] = LMS[1] * 1 / sourceWhitePoint[1];
    result[2] = LMS[2] * 1 / sourceWhitePoint[2];
  }
  function convertToD65(sourceWhitePoint, LMS, result) {
    var D65X = 0.95047;
    var D65Y = 1;
    var D65Z = 1.08883;
    result[0] = LMS[0] * D65X / sourceWhitePoint[0];
    result[1] = LMS[1] * D65Y / sourceWhitePoint[1];
    result[2] = LMS[2] * D65Z / sourceWhitePoint[2];
  }
  function sRGBTransferFunction(color) {
    if (color <= 0.0031308) {
      return adjustToRange(0, 1, 12.92 * color);
    }
    return adjustToRange(0, 1, (1 + 0.055) * Math.pow(color, 1 / 2.4) - 0.055);
  }
  function adjustToRange(min, max, value) {
    return Math.max(min, Math.min(max, value));
  }
  function decodeL(L) {
    if (L < 0) {
      return -decodeL(-L);
    }
    if (L > 8.0) {
      return Math.pow((L + 16) / 116, 3);
    }
    return L * DECODE_L_CONSTANT;
  }
  function compensateBlackPoint(sourceBlackPoint, XYZ_Flat, result) {
    if (sourceBlackPoint[0] === 0 && sourceBlackPoint[1] === 0 && sourceBlackPoint[2] === 0) {
      result[0] = XYZ_Flat[0];
      result[1] = XYZ_Flat[1];
      result[2] = XYZ_Flat[2];
      return;
    }
    var zeroDecodeL = decodeL(0);
    var X_DST = zeroDecodeL;
    var X_SRC = decodeL(sourceBlackPoint[0]);
    var Y_DST = zeroDecodeL;
    var Y_SRC = decodeL(sourceBlackPoint[1]);
    var Z_DST = zeroDecodeL;
    var Z_SRC = decodeL(sourceBlackPoint[2]);
    var X_Scale = (1 - X_DST) / (1 - X_SRC);
    var X_Offset = 1 - X_Scale;
    var Y_Scale = (1 - Y_DST) / (1 - Y_SRC);
    var Y_Offset = 1 - Y_Scale;
    var Z_Scale = (1 - Z_DST) / (1 - Z_SRC);
    var Z_Offset = 1 - Z_Scale;
    result[0] = XYZ_Flat[0] * X_Scale + X_Offset;
    result[1] = XYZ_Flat[1] * Y_Scale + Y_Offset;
    result[2] = XYZ_Flat[2] * Z_Scale + Z_Offset;
  }
  function normalizeWhitePointToFlat(sourceWhitePoint, XYZ_In, result) {
    if (sourceWhitePoint[0] === 1 && sourceWhitePoint[2] === 1) {
      result[0] = XYZ_In[0];
      result[1] = XYZ_In[1];
      result[2] = XYZ_In[2];
      return;
    }
    var LMS = result;
    matrixProduct(BRADFORD_SCALE_MATRIX, XYZ_In, LMS);
    var LMS_Flat = tempNormalizeMatrix;
    convertToFlat(sourceWhitePoint, LMS, LMS_Flat);
    matrixProduct(BRADFORD_SCALE_INVERSE_MATRIX, LMS_Flat, result);
  }
  function normalizeWhitePointToD65(sourceWhitePoint, XYZ_In, result) {
    var LMS = result;
    matrixProduct(BRADFORD_SCALE_MATRIX, XYZ_In, LMS);
    var LMS_D65 = tempNormalizeMatrix;
    convertToD65(sourceWhitePoint, LMS, LMS_D65);
    matrixProduct(BRADFORD_SCALE_INVERSE_MATRIX, LMS_D65, result);
  }
  function convertToRgb(cs, src, srcOffset, dest, destOffset, scale) {
    var A = adjustToRange(0, 1, src[srcOffset] * scale);
    var B = adjustToRange(0, 1, src[srcOffset + 1] * scale);
    var C = adjustToRange(0, 1, src[srcOffset + 2] * scale);
    var AGR = Math.pow(A, cs.GR);
    var BGG = Math.pow(B, cs.GG);
    var CGB = Math.pow(C, cs.GB);
    var X = cs.MXA * AGR + cs.MXB * BGG + cs.MXC * CGB;
    var Y = cs.MYA * AGR + cs.MYB * BGG + cs.MYC * CGB;
    var Z = cs.MZA * AGR + cs.MZB * BGG + cs.MZC * CGB;
    var XYZ = tempConvertMatrix1;
    XYZ[0] = X;
    XYZ[1] = Y;
    XYZ[2] = Z;
    var XYZ_Flat = tempConvertMatrix2;
    normalizeWhitePointToFlat(cs.whitePoint, XYZ, XYZ_Flat);
    var XYZ_Black = tempConvertMatrix1;
    compensateBlackPoint(cs.blackPoint, XYZ_Flat, XYZ_Black);
    var XYZ_D65 = tempConvertMatrix2;
    normalizeWhitePointToD65(FLAT_WHITEPOINT_MATRIX, XYZ_Black, XYZ_D65);
    var SRGB = tempConvertMatrix1;
    matrixProduct(SRGB_D65_XYZ_TO_RGB_MATRIX, XYZ_D65, SRGB);
    var sR = sRGBTransferFunction(SRGB[0]);
    var sG = sRGBTransferFunction(SRGB[1]);
    var sB = sRGBTransferFunction(SRGB[2]);
    dest[destOffset] = Math.round(sR * 255);
    dest[destOffset + 1] = Math.round(sG * 255);
    dest[destOffset + 2] = Math.round(sB * 255);
  }
  CalRGBCS.prototype = {
    getRgb: ColorSpace.prototype.getRgb,
    getRgbItem: function CalRGBCS_getRgbItem(src, srcOffset, dest, destOffset) {
      convertToRgb(this, src, srcOffset, dest, destOffset, 1);
    },
    getRgbBuffer: function CalRGBCS_getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
      var scale = 1 / ((1 << bits) - 1);
      for (var i = 0; i < count; ++i) {
        convertToRgb(this, src, srcOffset, dest, destOffset, scale);
        srcOffset += 3;
        destOffset += 3 + alpha01;
      }
    },
    getOutputLength: function CalRGBCS_getOutputLength(inputLength, alpha01) {
      return inputLength * (3 + alpha01) / 3 | 0;
    },
    isPassthrough: ColorSpace.prototype.isPassthrough,
    fillRgb: ColorSpace.prototype.fillRgb,
    isDefaultDecode: function CalRGBCS_isDefaultDecode(decodeMap) {
      return ColorSpace.isDefaultDecode(decodeMap, this.numComps);
    },
    usesZeroToOneRange: true
  };
  return CalRGBCS;
}();
var LabCS = function LabCSClosure() {
  function LabCS(whitePoint, blackPoint, range) {
    this.name = 'Lab';
    this.numComps = 3;
    this.defaultColor = new Float32Array(this.numComps);
    if (!whitePoint) {
      throw new _util.FormatError('WhitePoint missing - required for color space Lab');
    }
    blackPoint = blackPoint || [0, 0, 0];
    range = range || [-100, 100, -100, 100];
    this.XW = whitePoint[0];
    this.YW = whitePoint[1];
    this.ZW = whitePoint[2];
    this.amin = range[0];
    this.amax = range[1];
    this.bmin = range[2];
    this.bmax = range[3];
    this.XB = blackPoint[0];
    this.YB = blackPoint[1];
    this.ZB = blackPoint[2];
    if (this.XW < 0 || this.ZW < 0 || this.YW !== 1) {
      throw new _util.FormatError('Invalid WhitePoint components, no fallback available');
    }
    if (this.XB < 0 || this.YB < 0 || this.ZB < 0) {
      (0, _util.info)('Invalid BlackPoint, falling back to default');
      this.XB = this.YB = this.ZB = 0;
    }
    if (this.amin > this.amax || this.bmin > this.bmax) {
      (0, _util.info)('Invalid Range, falling back to defaults');
      this.amin = -100;
      this.amax = 100;
      this.bmin = -100;
      this.bmax = 100;
    }
  }
  function fn_g(x) {
    var result;
    if (x >= 6 / 29) {
      result = x * x * x;
    } else {
      result = 108 / 841 * (x - 4 / 29);
    }
    return result;
  }
  function decode(value, high1, low2, high2) {
    return low2 + value * (high2 - low2) / high1;
  }
  function convertToRgb(cs, src, srcOffset, maxVal, dest, destOffset) {
    var Ls = src[srcOffset];
    var as = src[srcOffset + 1];
    var bs = src[srcOffset + 2];
    if (maxVal !== false) {
      Ls = decode(Ls, maxVal, 0, 100);
      as = decode(as, maxVal, cs.amin, cs.amax);
      bs = decode(bs, maxVal, cs.bmin, cs.bmax);
    }
    as = as > cs.amax ? cs.amax : as < cs.amin ? cs.amin : as;
    bs = bs > cs.bmax ? cs.bmax : bs < cs.bmin ? cs.bmin : bs;
    var M = (Ls + 16) / 116;
    var L = M + as / 500;
    var N = M - bs / 200;
    var X = cs.XW * fn_g(L);
    var Y = cs.YW * fn_g(M);
    var Z = cs.ZW * fn_g(N);
    var r, g, b;
    if (cs.ZW < 1) {
      r = X * 3.1339 + Y * -1.6170 + Z * -0.4906;
      g = X * -0.9785 + Y * 1.9160 + Z * 0.0333;
      b = X * 0.0720 + Y * -0.2290 + Z * 1.4057;
    } else {
      r = X * 3.2406 + Y * -1.5372 + Z * -0.4986;
      g = X * -0.9689 + Y * 1.8758 + Z * 0.0415;
      b = X * 0.0557 + Y * -0.2040 + Z * 1.0570;
    }
    dest[destOffset] = r <= 0 ? 0 : r >= 1 ? 255 : Math.sqrt(r) * 255 | 0;
    dest[destOffset + 1] = g <= 0 ? 0 : g >= 1 ? 255 : Math.sqrt(g) * 255 | 0;
    dest[destOffset + 2] = b <= 0 ? 0 : b >= 1 ? 255 : Math.sqrt(b) * 255 | 0;
  }
  LabCS.prototype = {
    getRgb: ColorSpace.prototype.getRgb,
    getRgbItem: function LabCS_getRgbItem(src, srcOffset, dest, destOffset) {
      convertToRgb(this, src, srcOffset, false, dest, destOffset);
    },
    getRgbBuffer: function LabCS_getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
      var maxVal = (1 << bits) - 1;
      for (var i = 0; i < count; i++) {
        convertToRgb(this, src, srcOffset, maxVal, dest, destOffset);
        srcOffset += 3;
        destOffset += 3 + alpha01;
      }
    },
    getOutputLength: function LabCS_getOutputLength(inputLength, alpha01) {
      return inputLength * (3 + alpha01) / 3 | 0;
    },
    isPassthrough: ColorSpace.prototype.isPassthrough,
    fillRgb: ColorSpace.prototype.fillRgb,
    isDefaultDecode: function LabCS_isDefaultDecode(decodeMap) {
      return true;
    },
    usesZeroToOneRange: false
  };
  return LabCS;
}();
exports.ColorSpace = ColorSpace;