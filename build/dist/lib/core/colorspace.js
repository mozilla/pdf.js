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
exports.ColorSpace = void 0;

var _util = require("../shared/util");

var _primitives = require("./primitives");

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } return _assertThisInitialized(self); }

function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }

function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); if (superClass) _setPrototypeOf(subClass, superClass); }

function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

function resizeRgbImage(src, dest, w1, h1, w2, h2, alpha01) {
  var COMPONENTS = 3;
  alpha01 = alpha01 !== 1 ? 0 : alpha01;
  var xRatio = w1 / w2;
  var yRatio = h1 / h2;
  var newIndex = 0,
      oldIndex;
  var xScaled = new Uint16Array(w2);
  var w1Scanline = w1 * COMPONENTS;

  for (var i = 0; i < w2; i++) {
    xScaled[i] = Math.floor(i * xRatio) * COMPONENTS;
  }

  for (var _i = 0; _i < h2; _i++) {
    var py = Math.floor(_i * yRatio) * w1Scanline;

    for (var j = 0; j < w2; j++) {
      oldIndex = py + xScaled[j];
      dest[newIndex++] = src[oldIndex++];
      dest[newIndex++] = src[oldIndex++];
      dest[newIndex++] = src[oldIndex++];
      newIndex += alpha01;
    }
  }
}

var ColorSpace =
/*#__PURE__*/
function () {
  function ColorSpace(name, numComps) {
    _classCallCheck(this, ColorSpace);

    if (this.constructor === ColorSpace) {
      (0, _util.unreachable)('Cannot initialize ColorSpace.');
    }

    this.name = name;
    this.numComps = numComps;
  }

  _createClass(ColorSpace, [{
    key: "getRgb",
    value: function getRgb(src, srcOffset) {
      var rgb = new Uint8ClampedArray(3);
      this.getRgbItem(src, srcOffset, rgb, 0);
      return rgb;
    }
  }, {
    key: "getRgbItem",
    value: function getRgbItem(src, srcOffset, dest, destOffset) {
      (0, _util.unreachable)('Should not call ColorSpace.getRgbItem');
    }
  }, {
    key: "getRgbBuffer",
    value: function getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
      (0, _util.unreachable)('Should not call ColorSpace.getRgbBuffer');
    }
  }, {
    key: "getOutputLength",
    value: function getOutputLength(inputLength, alpha01) {
      (0, _util.unreachable)('Should not call ColorSpace.getOutputLength');
    }
  }, {
    key: "isPassthrough",
    value: function isPassthrough(bits) {
      return false;
    }
  }, {
    key: "isDefaultDecode",
    value: function isDefaultDecode(decodeMap, bpc) {
      return ColorSpace.isDefaultDecode(decodeMap, this.numComps);
    }
  }, {
    key: "fillRgb",
    value: function fillRgb(dest, originalWidth, originalHeight, width, height, actualHeight, bpc, comps, alpha01) {
      var count = originalWidth * originalHeight;
      var rgbBuf = null;
      var numComponentColors = 1 << bpc;
      var needsResizing = originalHeight !== height || originalWidth !== width;

      if (this.isPassthrough(bpc)) {
        rgbBuf = comps;
      } else if (this.numComps === 1 && count > numComponentColors && this.name !== 'DeviceGray' && this.name !== 'DeviceRGB') {
        var allColors = bpc <= 8 ? new Uint8Array(numComponentColors) : new Uint16Array(numComponentColors);

        for (var i = 0; i < numComponentColors; i++) {
          allColors[i] = i;
        }

        var colorMap = new Uint8ClampedArray(numComponentColors * 3);
        this.getRgbBuffer(allColors, 0, numComponentColors, colorMap, 0, bpc, 0);

        if (!needsResizing) {
          var destPos = 0;

          for (var _i2 = 0; _i2 < count; ++_i2) {
            var key = comps[_i2] * 3;
            dest[destPos++] = colorMap[key];
            dest[destPos++] = colorMap[key + 1];
            dest[destPos++] = colorMap[key + 2];
            destPos += alpha01;
          }
        } else {
          rgbBuf = new Uint8Array(count * 3);
          var rgbPos = 0;

          for (var _i3 = 0; _i3 < count; ++_i3) {
            var _key = comps[_i3] * 3;

            rgbBuf[rgbPos++] = colorMap[_key];
            rgbBuf[rgbPos++] = colorMap[_key + 1];
            rgbBuf[rgbPos++] = colorMap[_key + 2];
          }
        }
      } else {
        if (!needsResizing) {
          this.getRgbBuffer(comps, 0, width * actualHeight, dest, 0, bpc, alpha01);
        } else {
          rgbBuf = new Uint8ClampedArray(count * 3);
          this.getRgbBuffer(comps, 0, count, rgbBuf, 0, bpc, 0);
        }
      }

      if (rgbBuf) {
        if (needsResizing) {
          resizeRgbImage(rgbBuf, dest, originalWidth, originalHeight, width, height, alpha01);
        } else {
          var _destPos = 0,
              _rgbPos = 0;

          for (var _i4 = 0, ii = width * actualHeight; _i4 < ii; _i4++) {
            dest[_destPos++] = rgbBuf[_rgbPos++];
            dest[_destPos++] = rgbBuf[_rgbPos++];
            dest[_destPos++] = rgbBuf[_rgbPos++];
            _destPos += alpha01;
          }
        }
      }
    }
  }, {
    key: "usesZeroToOneRange",
    get: function get() {
      return (0, _util.shadow)(this, 'usesZeroToOneRange', true);
    }
  }], [{
    key: "parse",
    value: function parse(cs, xref, res, pdfFunctionFactory) {
      var IR = this.parseToIR(cs, xref, res, pdfFunctionFactory);
      return this.fromIR(IR);
    }
  }, {
    key: "fromIR",
    value: function fromIR(IR) {
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
            basePatternCS = this.fromIR(basePatternCS);
          }

          return new PatternCS(basePatternCS);

        case 'IndexedCS':
          var baseIndexedCS = IR[1];
          var hiVal = IR[2];
          var lookup = IR[3];
          return new IndexedCS(this.fromIR(baseIndexedCS), hiVal, lookup);

        case 'AlternateCS':
          var numComps = IR[1];
          var alt = IR[2];
          var tintFn = IR[3];
          return new AlternateCS(numComps, this.fromIR(alt), tintFn);

        case 'LabCS':
          whitePoint = IR[1];
          blackPoint = IR[2];
          var range = IR[3];
          return new LabCS(whitePoint, blackPoint, range);

        default:
          throw new _util.FormatError("Unknown colorspace name: ".concat(name));
      }
    }
  }, {
    key: "parseToIR",
    value: function parseToIR(cs, xref) {
      var res = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
      var pdfFunctionFactory = arguments.length > 3 ? arguments[3] : undefined;
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
            if ((0, _primitives.isDict)(res)) {
              var colorSpaces = res.get('ColorSpace');

              if ((0, _primitives.isDict)(colorSpaces)) {
                var resCS = colorSpaces.get(cs.name);

                if (resCS) {
                  if ((0, _primitives.isName)(resCS)) {
                    return this.parseToIR(resCS, xref, res, pdfFunctionFactory);
                  }

                  cs = resCS;
                  break;
                }
              }
            }

            throw new _util.FormatError("unrecognized colorspace ".concat(cs.name));
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
              var altIR = this.parseToIR(alt, xref, res, pdfFunctionFactory);
              var altCS = this.fromIR(altIR, pdfFunctionFactory);

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
              basePatternCS = this.parseToIR(basePatternCS, xref, res, pdfFunctionFactory);
            }

            return ['PatternCS', basePatternCS];

          case 'Indexed':
          case 'I':
            var baseIndexedCS = this.parseToIR(cs[1], xref, res, pdfFunctionFactory);
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
            alt = this.parseToIR(cs[2], xref, res, pdfFunctionFactory);
            var tintFn = pdfFunctionFactory.create(xref.fetchIfRef(cs[3]));
            return ['AlternateCS', numComps, alt, tintFn];

          case 'Lab':
            params = xref.fetchIfRef(cs[1]);
            whitePoint = params.getArray('WhitePoint');
            blackPoint = params.getArray('BlackPoint');
            var range = params.getArray('Range');
            return ['LabCS', whitePoint, blackPoint, range];

          default:
            throw new _util.FormatError("unimplemented color space object \"".concat(mode, "\""));
        }
      }

      throw new _util.FormatError("unrecognized color space object: \"".concat(cs, "\""));
    }
  }, {
    key: "isDefaultDecode",
    value: function isDefaultDecode(decode, numComps) {
      if (!Array.isArray(decode)) {
        return true;
      }

      if (numComps * 2 !== decode.length) {
        (0, _util.warn)('The decode map is not the correct length');
        return true;
      }

      for (var i = 0, ii = decode.length; i < ii; i += 2) {
        if (decode[i] !== 0 || decode[i + 1] !== 1) {
          return false;
        }
      }

      return true;
    }
  }, {
    key: "singletons",
    get: function get() {
      return (0, _util.shadow)(this, 'singletons', {
        get gray() {
          return (0, _util.shadow)(this, 'gray', new DeviceGrayCS());
        },

        get rgb() {
          return (0, _util.shadow)(this, 'rgb', new DeviceRgbCS());
        },

        get cmyk() {
          return (0, _util.shadow)(this, 'cmyk', new DeviceCmykCS());
        }

      });
    }
  }]);

  return ColorSpace;
}();

exports.ColorSpace = ColorSpace;

var AlternateCS =
/*#__PURE__*/
function (_ColorSpace) {
  _inherits(AlternateCS, _ColorSpace);

  function AlternateCS(numComps, base, tintFn) {
    var _this;

    _classCallCheck(this, AlternateCS);

    _this = _possibleConstructorReturn(this, _getPrototypeOf(AlternateCS).call(this, 'Alternate', numComps));
    _this.base = base;
    _this.tintFn = tintFn;
    _this.tmpBuf = new Float32Array(base.numComps);
    return _this;
  }

  _createClass(AlternateCS, [{
    key: "getRgbItem",
    value: function getRgbItem(src, srcOffset, dest, destOffset) {
      var tmpBuf = this.tmpBuf;
      this.tintFn(src, srcOffset, tmpBuf, 0);
      this.base.getRgbItem(tmpBuf, 0, dest, destOffset);
    }
  }, {
    key: "getRgbBuffer",
    value: function getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
      var tintFn = this.tintFn;
      var base = this.base;
      var scale = 1 / ((1 << bits) - 1);
      var baseNumComps = base.numComps;
      var usesZeroToOneRange = base.usesZeroToOneRange;
      var isPassthrough = (base.isPassthrough(8) || !usesZeroToOneRange) && alpha01 === 0;
      var pos = isPassthrough ? destOffset : 0;
      var baseBuf = isPassthrough ? dest : new Uint8ClampedArray(baseNumComps * count);
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
    }
  }, {
    key: "getOutputLength",
    value: function getOutputLength(inputLength, alpha01) {
      return this.base.getOutputLength(inputLength * this.base.numComps / this.numComps, alpha01);
    }
  }]);

  return AlternateCS;
}(ColorSpace);

var PatternCS =
/*#__PURE__*/
function (_ColorSpace2) {
  _inherits(PatternCS, _ColorSpace2);

  function PatternCS(baseCS) {
    var _this2;

    _classCallCheck(this, PatternCS);

    _this2 = _possibleConstructorReturn(this, _getPrototypeOf(PatternCS).call(this, 'Pattern', null));
    _this2.base = baseCS;
    return _this2;
  }

  _createClass(PatternCS, [{
    key: "isDefaultDecode",
    value: function isDefaultDecode(decodeMap, bpc) {
      (0, _util.unreachable)('Should not call PatternCS.isDefaultDecode');
    }
  }]);

  return PatternCS;
}(ColorSpace);

var IndexedCS =
/*#__PURE__*/
function (_ColorSpace3) {
  _inherits(IndexedCS, _ColorSpace3);

  function IndexedCS(base, highVal, lookup) {
    var _this3;

    _classCallCheck(this, IndexedCS);

    _this3 = _possibleConstructorReturn(this, _getPrototypeOf(IndexedCS).call(this, 'Indexed', 1));
    _this3.base = base;
    _this3.highVal = highVal;
    var baseNumComps = base.numComps;
    var length = baseNumComps * highVal;

    if ((0, _primitives.isStream)(lookup)) {
      _this3.lookup = new Uint8Array(length);
      var bytes = lookup.getBytes(length);

      _this3.lookup.set(bytes);
    } else if ((0, _util.isString)(lookup)) {
      _this3.lookup = new Uint8Array(length);

      for (var i = 0; i < length; ++i) {
        _this3.lookup[i] = lookup.charCodeAt(i);
      }
    } else if (lookup instanceof Uint8Array) {
      _this3.lookup = lookup;
    } else {
      throw new _util.FormatError("Unrecognized lookup table: ".concat(lookup));
    }

    return _this3;
  }

  _createClass(IndexedCS, [{
    key: "getRgbItem",
    value: function getRgbItem(src, srcOffset, dest, destOffset) {
      var numComps = this.base.numComps;
      var start = src[srcOffset] * numComps;
      this.base.getRgbBuffer(this.lookup, start, 1, dest, destOffset, 8, 0);
    }
  }, {
    key: "getRgbBuffer",
    value: function getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
      var base = this.base;
      var numComps = base.numComps;
      var outputDelta = base.getOutputLength(numComps, alpha01);
      var lookup = this.lookup;

      for (var i = 0; i < count; ++i) {
        var lookupPos = src[srcOffset++] * numComps;
        base.getRgbBuffer(lookup, lookupPos, 1, dest, destOffset, 8, alpha01);
        destOffset += outputDelta;
      }
    }
  }, {
    key: "getOutputLength",
    value: function getOutputLength(inputLength, alpha01) {
      return this.base.getOutputLength(inputLength * this.base.numComps, alpha01);
    }
  }, {
    key: "isDefaultDecode",
    value: function isDefaultDecode(decodeMap, bpc) {
      if (!Array.isArray(decodeMap)) {
        return true;
      }

      if (decodeMap.length !== 2) {
        (0, _util.warn)('Decode map length is not correct');
        return true;
      }

      if (!Number.isInteger(bpc) || bpc < 1) {
        (0, _util.warn)('Bits per component is not correct');
        return true;
      }

      return decodeMap[0] === 0 && decodeMap[1] === (1 << bpc) - 1;
    }
  }]);

  return IndexedCS;
}(ColorSpace);

var DeviceGrayCS =
/*#__PURE__*/
function (_ColorSpace4) {
  _inherits(DeviceGrayCS, _ColorSpace4);

  function DeviceGrayCS() {
    _classCallCheck(this, DeviceGrayCS);

    return _possibleConstructorReturn(this, _getPrototypeOf(DeviceGrayCS).call(this, 'DeviceGray', 1));
  }

  _createClass(DeviceGrayCS, [{
    key: "getRgbItem",
    value: function getRgbItem(src, srcOffset, dest, destOffset) {
      var c = src[srcOffset] * 255;
      dest[destOffset] = dest[destOffset + 1] = dest[destOffset + 2] = c;
    }
  }, {
    key: "getRgbBuffer",
    value: function getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
      var scale = 255 / ((1 << bits) - 1);
      var j = srcOffset,
          q = destOffset;

      for (var i = 0; i < count; ++i) {
        var c = scale * src[j++];
        dest[q++] = c;
        dest[q++] = c;
        dest[q++] = c;
        q += alpha01;
      }
    }
  }, {
    key: "getOutputLength",
    value: function getOutputLength(inputLength, alpha01) {
      return inputLength * (3 + alpha01);
    }
  }]);

  return DeviceGrayCS;
}(ColorSpace);

var DeviceRgbCS =
/*#__PURE__*/
function (_ColorSpace5) {
  _inherits(DeviceRgbCS, _ColorSpace5);

  function DeviceRgbCS() {
    _classCallCheck(this, DeviceRgbCS);

    return _possibleConstructorReturn(this, _getPrototypeOf(DeviceRgbCS).call(this, 'DeviceRGB', 3));
  }

  _createClass(DeviceRgbCS, [{
    key: "getRgbItem",
    value: function getRgbItem(src, srcOffset, dest, destOffset) {
      dest[destOffset] = src[srcOffset] * 255;
      dest[destOffset + 1] = src[srcOffset + 1] * 255;
      dest[destOffset + 2] = src[srcOffset + 2] * 255;
    }
  }, {
    key: "getRgbBuffer",
    value: function getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
      if (bits === 8 && alpha01 === 0) {
        dest.set(src.subarray(srcOffset, srcOffset + count * 3), destOffset);
        return;
      }

      var scale = 255 / ((1 << bits) - 1);
      var j = srcOffset,
          q = destOffset;

      for (var i = 0; i < count; ++i) {
        dest[q++] = scale * src[j++];
        dest[q++] = scale * src[j++];
        dest[q++] = scale * src[j++];
        q += alpha01;
      }
    }
  }, {
    key: "getOutputLength",
    value: function getOutputLength(inputLength, alpha01) {
      return inputLength * (3 + alpha01) / 3 | 0;
    }
  }, {
    key: "isPassthrough",
    value: function isPassthrough(bits) {
      return bits === 8;
    }
  }]);

  return DeviceRgbCS;
}(ColorSpace);

var DeviceCmykCS = function DeviceCmykCSClosure() {
  function convertToRgb(src, srcOffset, srcScale, dest, destOffset) {
    var c = src[srcOffset] * srcScale;
    var m = src[srcOffset + 1] * srcScale;
    var y = src[srcOffset + 2] * srcScale;
    var k = src[srcOffset + 3] * srcScale;
    dest[destOffset] = 255 + c * (-4.387332384609988 * c + 54.48615194189176 * m + 18.82290502165302 * y + 212.25662451639585 * k + -285.2331026137004) + m * (1.7149763477362134 * m - 5.6096736904047315 * y + -17.873870861415444 * k - 5.497006427196366) + y * (-2.5217340131683033 * y - 21.248923337353073 * k + 17.5119270841813) + k * (-21.86122147463605 * k - 189.48180835922747);
    dest[destOffset + 1] = 255 + c * (8.841041422036149 * c + 60.118027045597366 * m + 6.871425592049007 * y + 31.159100130055922 * k + -79.2970844816548) + m * (-15.310361306967817 * m + 17.575251261109482 * y + 131.35250912493976 * k - 190.9453302588951) + y * (4.444339102852739 * y + 9.8632861493405 * k - 24.86741582555878) + k * (-20.737325471181034 * k - 187.80453709719578);
    dest[destOffset + 2] = 255 + c * (0.8842522430003296 * c + 8.078677503112928 * m + 30.89978309703729 * y - 0.23883238689178934 * k + -14.183576799673286) + m * (10.49593273432072 * m + 63.02378494754052 * y + 50.606957656360734 * k - 112.23884253719248) + y * (0.03296041114873217 * y + 115.60384449646641 * k + -193.58209356861505) + k * (-22.33816807309886 * k - 180.12613974708367);
  }

  var DeviceCmykCS =
  /*#__PURE__*/
  function (_ColorSpace6) {
    _inherits(DeviceCmykCS, _ColorSpace6);

    function DeviceCmykCS() {
      _classCallCheck(this, DeviceCmykCS);

      return _possibleConstructorReturn(this, _getPrototypeOf(DeviceCmykCS).call(this, 'DeviceCMYK', 4));
    }

    _createClass(DeviceCmykCS, [{
      key: "getRgbItem",
      value: function getRgbItem(src, srcOffset, dest, destOffset) {
        convertToRgb(src, srcOffset, 1, dest, destOffset);
      }
    }, {
      key: "getRgbBuffer",
      value: function getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
        var scale = 1 / ((1 << bits) - 1);

        for (var i = 0; i < count; i++) {
          convertToRgb(src, srcOffset, scale, dest, destOffset);
          srcOffset += 4;
          destOffset += 3 + alpha01;
        }
      }
    }, {
      key: "getOutputLength",
      value: function getOutputLength(inputLength, alpha01) {
        return inputLength / 4 * (3 + alpha01) | 0;
      }
    }]);

    return DeviceCmykCS;
  }(ColorSpace);

  return DeviceCmykCS;
}();

var CalGrayCS = function CalGrayCSClosure() {
  function convertToRgb(cs, src, srcOffset, dest, destOffset, scale) {
    var A = src[srcOffset] * scale;
    var AG = Math.pow(A, cs.G);
    var L = cs.YW * AG;
    var val = Math.max(295.8 * Math.pow(L, 0.333333333333333333) - 40.8, 0);
    dest[destOffset] = val;
    dest[destOffset + 1] = val;
    dest[destOffset + 2] = val;
  }

  var CalGrayCS =
  /*#__PURE__*/
  function (_ColorSpace7) {
    _inherits(CalGrayCS, _ColorSpace7);

    function CalGrayCS(whitePoint, blackPoint, gamma) {
      var _this4;

      _classCallCheck(this, CalGrayCS);

      _this4 = _possibleConstructorReturn(this, _getPrototypeOf(CalGrayCS).call(this, 'CalGray', 1));

      if (!whitePoint) {
        throw new _util.FormatError('WhitePoint missing - required for color space CalGray');
      }

      blackPoint = blackPoint || [0, 0, 0];
      gamma = gamma || 1;
      _this4.XW = whitePoint[0];
      _this4.YW = whitePoint[1];
      _this4.ZW = whitePoint[2];
      _this4.XB = blackPoint[0];
      _this4.YB = blackPoint[1];
      _this4.ZB = blackPoint[2];
      _this4.G = gamma;

      if (_this4.XW < 0 || _this4.ZW < 0 || _this4.YW !== 1) {
        throw new _util.FormatError("Invalid WhitePoint components for ".concat(_this4.name) + ', no fallback available');
      }

      if (_this4.XB < 0 || _this4.YB < 0 || _this4.ZB < 0) {
        (0, _util.info)("Invalid BlackPoint for ".concat(_this4.name, ", falling back to default."));
        _this4.XB = _this4.YB = _this4.ZB = 0;
      }

      if (_this4.XB !== 0 || _this4.YB !== 0 || _this4.ZB !== 0) {
        (0, _util.warn)("".concat(_this4.name, ", BlackPoint: XB: ").concat(_this4.XB, ", YB: ").concat(_this4.YB, ", ") + "ZB: ".concat(_this4.ZB, ", only default values are supported."));
      }

      if (_this4.G < 1) {
        (0, _util.info)("Invalid Gamma: ".concat(_this4.G, " for ").concat(_this4.name, ", ") + 'falling back to default.');
        _this4.G = 1;
      }

      return _this4;
    }

    _createClass(CalGrayCS, [{
      key: "getRgbItem",
      value: function getRgbItem(src, srcOffset, dest, destOffset) {
        convertToRgb(this, src, srcOffset, dest, destOffset, 1);
      }
    }, {
      key: "getRgbBuffer",
      value: function getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
        var scale = 1 / ((1 << bits) - 1);

        for (var i = 0; i < count; ++i) {
          convertToRgb(this, src, srcOffset, dest, destOffset, scale);
          srcOffset += 1;
          destOffset += 3 + alpha01;
        }
      }
    }, {
      key: "getOutputLength",
      value: function getOutputLength(inputLength, alpha01) {
        return inputLength * (3 + alpha01);
      }
    }]);

    return CalGrayCS;
  }(ColorSpace);

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
    dest[destOffset] = sRGBTransferFunction(SRGB[0]) * 255;
    dest[destOffset + 1] = sRGBTransferFunction(SRGB[1]) * 255;
    dest[destOffset + 2] = sRGBTransferFunction(SRGB[2]) * 255;
  }

  var CalRGBCS =
  /*#__PURE__*/
  function (_ColorSpace8) {
    _inherits(CalRGBCS, _ColorSpace8);

    function CalRGBCS(whitePoint, blackPoint, gamma, matrix) {
      var _this5;

      _classCallCheck(this, CalRGBCS);

      _this5 = _possibleConstructorReturn(this, _getPrototypeOf(CalRGBCS).call(this, 'CalRGB', 3));

      if (!whitePoint) {
        throw new _util.FormatError('WhitePoint missing - required for color space CalRGB');
      }

      blackPoint = blackPoint || new Float32Array(3);
      gamma = gamma || new Float32Array([1, 1, 1]);
      matrix = matrix || new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      var XW = whitePoint[0];
      var YW = whitePoint[1];
      var ZW = whitePoint[2];
      _this5.whitePoint = whitePoint;
      var XB = blackPoint[0];
      var YB = blackPoint[1];
      var ZB = blackPoint[2];
      _this5.blackPoint = blackPoint;
      _this5.GR = gamma[0];
      _this5.GG = gamma[1];
      _this5.GB = gamma[2];
      _this5.MXA = matrix[0];
      _this5.MYA = matrix[1];
      _this5.MZA = matrix[2];
      _this5.MXB = matrix[3];
      _this5.MYB = matrix[4];
      _this5.MZB = matrix[5];
      _this5.MXC = matrix[6];
      _this5.MYC = matrix[7];
      _this5.MZC = matrix[8];

      if (XW < 0 || ZW < 0 || YW !== 1) {
        throw new _util.FormatError("Invalid WhitePoint components for ".concat(_this5.name) + ', no fallback available');
      }

      if (XB < 0 || YB < 0 || ZB < 0) {
        (0, _util.info)("Invalid BlackPoint for ".concat(_this5.name, " [").concat(XB, ", ").concat(YB, ", ").concat(ZB, "], ") + 'falling back to default.');
        _this5.blackPoint = new Float32Array(3);
      }

      if (_this5.GR < 0 || _this5.GG < 0 || _this5.GB < 0) {
        (0, _util.info)("Invalid Gamma [".concat(_this5.GR, ", ").concat(_this5.GG, ", ").concat(_this5.GB, "] for ") + "".concat(_this5.name, ", falling back to default."));
        _this5.GR = _this5.GG = _this5.GB = 1;
      }

      return _this5;
    }

    _createClass(CalRGBCS, [{
      key: "getRgbItem",
      value: function getRgbItem(src, srcOffset, dest, destOffset) {
        convertToRgb(this, src, srcOffset, dest, destOffset, 1);
      }
    }, {
      key: "getRgbBuffer",
      value: function getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
        var scale = 1 / ((1 << bits) - 1);

        for (var i = 0; i < count; ++i) {
          convertToRgb(this, src, srcOffset, dest, destOffset, scale);
          srcOffset += 3;
          destOffset += 3 + alpha01;
        }
      }
    }, {
      key: "getOutputLength",
      value: function getOutputLength(inputLength, alpha01) {
        return inputLength * (3 + alpha01) / 3 | 0;
      }
    }]);

    return CalRGBCS;
  }(ColorSpace);

  return CalRGBCS;
}();

var LabCS = function LabCSClosure() {
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

    dest[destOffset] = Math.sqrt(r) * 255;
    dest[destOffset + 1] = Math.sqrt(g) * 255;
    dest[destOffset + 2] = Math.sqrt(b) * 255;
  }

  var LabCS =
  /*#__PURE__*/
  function (_ColorSpace9) {
    _inherits(LabCS, _ColorSpace9);

    function LabCS(whitePoint, blackPoint, range) {
      var _this6;

      _classCallCheck(this, LabCS);

      _this6 = _possibleConstructorReturn(this, _getPrototypeOf(LabCS).call(this, 'Lab', 3));

      if (!whitePoint) {
        throw new _util.FormatError('WhitePoint missing - required for color space Lab');
      }

      blackPoint = blackPoint || [0, 0, 0];
      range = range || [-100, 100, -100, 100];
      _this6.XW = whitePoint[0];
      _this6.YW = whitePoint[1];
      _this6.ZW = whitePoint[2];
      _this6.amin = range[0];
      _this6.amax = range[1];
      _this6.bmin = range[2];
      _this6.bmax = range[3];
      _this6.XB = blackPoint[0];
      _this6.YB = blackPoint[1];
      _this6.ZB = blackPoint[2];

      if (_this6.XW < 0 || _this6.ZW < 0 || _this6.YW !== 1) {
        throw new _util.FormatError('Invalid WhitePoint components, no fallback available');
      }

      if (_this6.XB < 0 || _this6.YB < 0 || _this6.ZB < 0) {
        (0, _util.info)('Invalid BlackPoint, falling back to default');
        _this6.XB = _this6.YB = _this6.ZB = 0;
      }

      if (_this6.amin > _this6.amax || _this6.bmin > _this6.bmax) {
        (0, _util.info)('Invalid Range, falling back to defaults');
        _this6.amin = -100;
        _this6.amax = 100;
        _this6.bmin = -100;
        _this6.bmax = 100;
      }

      return _this6;
    }

    _createClass(LabCS, [{
      key: "getRgbItem",
      value: function getRgbItem(src, srcOffset, dest, destOffset) {
        convertToRgb(this, src, srcOffset, false, dest, destOffset);
      }
    }, {
      key: "getRgbBuffer",
      value: function getRgbBuffer(src, srcOffset, count, dest, destOffset, bits, alpha01) {
        var maxVal = (1 << bits) - 1;

        for (var i = 0; i < count; i++) {
          convertToRgb(this, src, srcOffset, maxVal, dest, destOffset);
          srcOffset += 3;
          destOffset += 3 + alpha01;
        }
      }
    }, {
      key: "getOutputLength",
      value: function getOutputLength(inputLength, alpha01) {
        return inputLength * (3 + alpha01) / 3 | 0;
      }
    }, {
      key: "isDefaultDecode",
      value: function isDefaultDecode(decodeMap, bpc) {
        return true;
      }
    }, {
      key: "usesZeroToOneRange",
      get: function get() {
        return (0, _util.shadow)(this, 'usesZeroToOneRange', false);
      }
    }]);

    return LabCS;
  }(ColorSpace);

  return LabCS;
}();