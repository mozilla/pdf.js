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
exports.CMapFactory = exports.IdentityCMap = exports.CMap = void 0;

var _util = require("../shared/util");

var _primitives = require("./primitives");

var _parser = require("./parser");

var _core_utils = require("./core_utils");

var _stream = require("./stream");

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } return _assertThisInitialized(self); }

function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }

function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); if (superClass) _setPrototypeOf(subClass, superClass); }

function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var BUILT_IN_CMAPS = ['Adobe-GB1-UCS2', 'Adobe-CNS1-UCS2', 'Adobe-Japan1-UCS2', 'Adobe-Korea1-UCS2', '78-EUC-H', '78-EUC-V', '78-H', '78-RKSJ-H', '78-RKSJ-V', '78-V', '78ms-RKSJ-H', '78ms-RKSJ-V', '83pv-RKSJ-H', '90ms-RKSJ-H', '90ms-RKSJ-V', '90msp-RKSJ-H', '90msp-RKSJ-V', '90pv-RKSJ-H', '90pv-RKSJ-V', 'Add-H', 'Add-RKSJ-H', 'Add-RKSJ-V', 'Add-V', 'Adobe-CNS1-0', 'Adobe-CNS1-1', 'Adobe-CNS1-2', 'Adobe-CNS1-3', 'Adobe-CNS1-4', 'Adobe-CNS1-5', 'Adobe-CNS1-6', 'Adobe-GB1-0', 'Adobe-GB1-1', 'Adobe-GB1-2', 'Adobe-GB1-3', 'Adobe-GB1-4', 'Adobe-GB1-5', 'Adobe-Japan1-0', 'Adobe-Japan1-1', 'Adobe-Japan1-2', 'Adobe-Japan1-3', 'Adobe-Japan1-4', 'Adobe-Japan1-5', 'Adobe-Japan1-6', 'Adobe-Korea1-0', 'Adobe-Korea1-1', 'Adobe-Korea1-2', 'B5-H', 'B5-V', 'B5pc-H', 'B5pc-V', 'CNS-EUC-H', 'CNS-EUC-V', 'CNS1-H', 'CNS1-V', 'CNS2-H', 'CNS2-V', 'ETHK-B5-H', 'ETHK-B5-V', 'ETen-B5-H', 'ETen-B5-V', 'ETenms-B5-H', 'ETenms-B5-V', 'EUC-H', 'EUC-V', 'Ext-H', 'Ext-RKSJ-H', 'Ext-RKSJ-V', 'Ext-V', 'GB-EUC-H', 'GB-EUC-V', 'GB-H', 'GB-V', 'GBK-EUC-H', 'GBK-EUC-V', 'GBK2K-H', 'GBK2K-V', 'GBKp-EUC-H', 'GBKp-EUC-V', 'GBT-EUC-H', 'GBT-EUC-V', 'GBT-H', 'GBT-V', 'GBTpc-EUC-H', 'GBTpc-EUC-V', 'GBpc-EUC-H', 'GBpc-EUC-V', 'H', 'HKdla-B5-H', 'HKdla-B5-V', 'HKdlb-B5-H', 'HKdlb-B5-V', 'HKgccs-B5-H', 'HKgccs-B5-V', 'HKm314-B5-H', 'HKm314-B5-V', 'HKm471-B5-H', 'HKm471-B5-V', 'HKscs-B5-H', 'HKscs-B5-V', 'Hankaku', 'Hiragana', 'KSC-EUC-H', 'KSC-EUC-V', 'KSC-H', 'KSC-Johab-H', 'KSC-Johab-V', 'KSC-V', 'KSCms-UHC-H', 'KSCms-UHC-HW-H', 'KSCms-UHC-HW-V', 'KSCms-UHC-V', 'KSCpc-EUC-H', 'KSCpc-EUC-V', 'Katakana', 'NWP-H', 'NWP-V', 'RKSJ-H', 'RKSJ-V', 'Roman', 'UniCNS-UCS2-H', 'UniCNS-UCS2-V', 'UniCNS-UTF16-H', 'UniCNS-UTF16-V', 'UniCNS-UTF32-H', 'UniCNS-UTF32-V', 'UniCNS-UTF8-H', 'UniCNS-UTF8-V', 'UniGB-UCS2-H', 'UniGB-UCS2-V', 'UniGB-UTF16-H', 'UniGB-UTF16-V', 'UniGB-UTF32-H', 'UniGB-UTF32-V', 'UniGB-UTF8-H', 'UniGB-UTF8-V', 'UniJIS-UCS2-H', 'UniJIS-UCS2-HW-H', 'UniJIS-UCS2-HW-V', 'UniJIS-UCS2-V', 'UniJIS-UTF16-H', 'UniJIS-UTF16-V', 'UniJIS-UTF32-H', 'UniJIS-UTF32-V', 'UniJIS-UTF8-H', 'UniJIS-UTF8-V', 'UniJIS2004-UTF16-H', 'UniJIS2004-UTF16-V', 'UniJIS2004-UTF32-H', 'UniJIS2004-UTF32-V', 'UniJIS2004-UTF8-H', 'UniJIS2004-UTF8-V', 'UniJISPro-UCS2-HW-V', 'UniJISPro-UCS2-V', 'UniJISPro-UTF8-V', 'UniJISX0213-UTF32-H', 'UniJISX0213-UTF32-V', 'UniJISX02132004-UTF32-H', 'UniJISX02132004-UTF32-V', 'UniKS-UCS2-H', 'UniKS-UCS2-V', 'UniKS-UTF16-H', 'UniKS-UTF16-V', 'UniKS-UTF32-H', 'UniKS-UTF32-V', 'UniKS-UTF8-H', 'UniKS-UTF8-V', 'V', 'WP-Symbol'];

var CMap =
/*#__PURE__*/
function () {
  function CMap() {
    var builtInCMap = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

    _classCallCheck(this, CMap);

    this.codespaceRanges = [[], [], [], []];
    this.numCodespaceRanges = 0;
    this._map = [];
    this.name = '';
    this.vertical = false;
    this.useCMap = null;
    this.builtInCMap = builtInCMap;
  }

  _createClass(CMap, [{
    key: "addCodespaceRange",
    value: function addCodespaceRange(n, low, high) {
      this.codespaceRanges[n - 1].push(low, high);
      this.numCodespaceRanges++;
    }
  }, {
    key: "mapCidRange",
    value: function mapCidRange(low, high, dstLow) {
      while (low <= high) {
        this._map[low++] = dstLow++;
      }
    }
  }, {
    key: "mapBfRange",
    value: function mapBfRange(low, high, dstLow) {
      var lastByte = dstLow.length - 1;

      while (low <= high) {
        this._map[low++] = dstLow;
        dstLow = dstLow.substring(0, lastByte) + String.fromCharCode(dstLow.charCodeAt(lastByte) + 1);
      }
    }
  }, {
    key: "mapBfRangeToArray",
    value: function mapBfRangeToArray(low, high, array) {
      var i = 0,
          ii = array.length;

      while (low <= high && i < ii) {
        this._map[low] = array[i++];
        ++low;
      }
    }
  }, {
    key: "mapOne",
    value: function mapOne(src, dst) {
      this._map[src] = dst;
    }
  }, {
    key: "lookup",
    value: function lookup(code) {
      return this._map[code];
    }
  }, {
    key: "contains",
    value: function contains(code) {
      return this._map[code] !== undefined;
    }
  }, {
    key: "forEach",
    value: function forEach(callback) {
      var map = this._map;
      var length = map.length;

      if (length <= 0x10000) {
        for (var i = 0; i < length; i++) {
          if (map[i] !== undefined) {
            callback(i, map[i]);
          }
        }
      } else {
        for (var _i in map) {
          callback(_i, map[_i]);
        }
      }
    }
  }, {
    key: "charCodeOf",
    value: function charCodeOf(value) {
      var map = this._map;

      if (map.length <= 0x10000) {
        return map.indexOf(value);
      }

      for (var charCode in map) {
        if (map[charCode] === value) {
          return charCode | 0;
        }
      }

      return -1;
    }
  }, {
    key: "getMap",
    value: function getMap() {
      return this._map;
    }
  }, {
    key: "readCharCode",
    value: function readCharCode(str, offset, out) {
      var c = 0;
      var codespaceRanges = this.codespaceRanges;

      for (var n = 0, nn = codespaceRanges.length; n < nn; n++) {
        c = (c << 8 | str.charCodeAt(offset + n)) >>> 0;
        var codespaceRange = codespaceRanges[n];

        for (var k = 0, kk = codespaceRange.length; k < kk;) {
          var low = codespaceRange[k++];
          var high = codespaceRange[k++];

          if (c >= low && c <= high) {
            out.charcode = c;
            out.length = n + 1;
            return;
          }
        }
      }

      out.charcode = 0;
      out.length = 1;
    }
  }, {
    key: "length",
    get: function get() {
      return this._map.length;
    }
  }, {
    key: "isIdentityCMap",
    get: function get() {
      if (!(this.name === 'Identity-H' || this.name === 'Identity-V')) {
        return false;
      }

      if (this._map.length !== 0x10000) {
        return false;
      }

      for (var i = 0; i < 0x10000; i++) {
        if (this._map[i] !== i) {
          return false;
        }
      }

      return true;
    }
  }]);

  return CMap;
}();

exports.CMap = CMap;

var IdentityCMap =
/*#__PURE__*/
function (_CMap) {
  _inherits(IdentityCMap, _CMap);

  function IdentityCMap(vertical, n) {
    var _this;

    _classCallCheck(this, IdentityCMap);

    _this = _possibleConstructorReturn(this, _getPrototypeOf(IdentityCMap).call(this));
    _this.vertical = vertical;

    _this.addCodespaceRange(n, 0, 0xffff);

    return _this;
  }

  _createClass(IdentityCMap, [{
    key: "mapCidRange",
    value: function mapCidRange(low, high, dstLow) {
      (0, _util.unreachable)('should not call mapCidRange');
    }
  }, {
    key: "mapBfRange",
    value: function mapBfRange(low, high, dstLow) {
      (0, _util.unreachable)('should not call mapBfRange');
    }
  }, {
    key: "mapBfRangeToArray",
    value: function mapBfRangeToArray(low, high, array) {
      (0, _util.unreachable)('should not call mapBfRangeToArray');
    }
  }, {
    key: "mapOne",
    value: function mapOne(src, dst) {
      (0, _util.unreachable)('should not call mapCidOne');
    }
  }, {
    key: "lookup",
    value: function lookup(code) {
      return Number.isInteger(code) && code <= 0xffff ? code : undefined;
    }
  }, {
    key: "contains",
    value: function contains(code) {
      return Number.isInteger(code) && code <= 0xffff;
    }
  }, {
    key: "forEach",
    value: function forEach(callback) {
      for (var i = 0; i <= 0xffff; i++) {
        callback(i, i);
      }
    }
  }, {
    key: "charCodeOf",
    value: function charCodeOf(value) {
      return Number.isInteger(value) && value <= 0xffff ? value : -1;
    }
  }, {
    key: "getMap",
    value: function getMap() {
      var map = new Array(0x10000);

      for (var i = 0; i <= 0xffff; i++) {
        map[i] = i;
      }

      return map;
    }
  }, {
    key: "length",
    get: function get() {
      return 0x10000;
    }
  }, {
    key: "isIdentityCMap",
    get: function get() {
      (0, _util.unreachable)('should not access .isIdentityCMap');
    }
  }]);

  return IdentityCMap;
}(CMap);

exports.IdentityCMap = IdentityCMap;

var BinaryCMapReader = function BinaryCMapReaderClosure() {
  function hexToInt(a, size) {
    var n = 0;

    for (var i = 0; i <= size; i++) {
      n = n << 8 | a[i];
    }

    return n >>> 0;
  }

  function hexToStr(a, size) {
    if (size === 1) {
      return String.fromCharCode(a[0], a[1]);
    }

    if (size === 3) {
      return String.fromCharCode(a[0], a[1], a[2], a[3]);
    }

    return String.fromCharCode.apply(null, a.subarray(0, size + 1));
  }

  function addHex(a, b, size) {
    var c = 0;

    for (var i = size; i >= 0; i--) {
      c += a[i] + b[i];
      a[i] = c & 255;
      c >>= 8;
    }
  }

  function incHex(a, size) {
    var c = 1;

    for (var i = size; i >= 0 && c > 0; i--) {
      c += a[i];
      a[i] = c & 255;
      c >>= 8;
    }
  }

  var MAX_NUM_SIZE = 16;
  var MAX_ENCODED_NUM_SIZE = 19;

  function BinaryCMapStream(data) {
    this.buffer = data;
    this.pos = 0;
    this.end = data.length;
    this.tmpBuf = new Uint8Array(MAX_ENCODED_NUM_SIZE);
  }

  BinaryCMapStream.prototype = {
    readByte: function readByte() {
      if (this.pos >= this.end) {
        return -1;
      }

      return this.buffer[this.pos++];
    },
    readNumber: function readNumber() {
      var n = 0;
      var last;

      do {
        var b = this.readByte();

        if (b < 0) {
          throw new _util.FormatError('unexpected EOF in bcmap');
        }

        last = !(b & 0x80);
        n = n << 7 | b & 0x7F;
      } while (!last);

      return n;
    },
    readSigned: function readSigned() {
      var n = this.readNumber();
      return n & 1 ? ~(n >>> 1) : n >>> 1;
    },
    readHex: function readHex(num, size) {
      num.set(this.buffer.subarray(this.pos, this.pos + size + 1));
      this.pos += size + 1;
    },
    readHexNumber: function readHexNumber(num, size) {
      var last;
      var stack = this.tmpBuf,
          sp = 0;

      do {
        var b = this.readByte();

        if (b < 0) {
          throw new _util.FormatError('unexpected EOF in bcmap');
        }

        last = !(b & 0x80);
        stack[sp++] = b & 0x7F;
      } while (!last);

      var i = size,
          buffer = 0,
          bufferSize = 0;

      while (i >= 0) {
        while (bufferSize < 8 && stack.length > 0) {
          buffer = stack[--sp] << bufferSize | buffer;
          bufferSize += 7;
        }

        num[i] = buffer & 255;
        i--;
        buffer >>= 8;
        bufferSize -= 8;
      }
    },
    readHexSigned: function readHexSigned(num, size) {
      this.readHexNumber(num, size);
      var sign = num[size] & 1 ? 255 : 0;
      var c = 0;

      for (var i = 0; i <= size; i++) {
        c = (c & 1) << 8 | num[i];
        num[i] = c >> 1 ^ sign;
      }
    },
    readString: function readString() {
      var len = this.readNumber();
      var s = '';

      for (var i = 0; i < len; i++) {
        s += String.fromCharCode(this.readNumber());
      }

      return s;
    }
  };

  function processBinaryCMap(data, cMap, extend) {
    return new Promise(function (resolve, reject) {
      var stream = new BinaryCMapStream(data);
      var header = stream.readByte();
      cMap.vertical = !!(header & 1);
      var useCMap = null;
      var start = new Uint8Array(MAX_NUM_SIZE);
      var end = new Uint8Array(MAX_NUM_SIZE);

      var _char = new Uint8Array(MAX_NUM_SIZE);

      var charCode = new Uint8Array(MAX_NUM_SIZE);
      var tmp = new Uint8Array(MAX_NUM_SIZE);
      var code;
      var b;

      while ((b = stream.readByte()) >= 0) {
        var type = b >> 5;

        if (type === 7) {
          switch (b & 0x1F) {
            case 0:
              stream.readString();
              break;

            case 1:
              useCMap = stream.readString();
              break;
          }

          continue;
        }

        var sequence = !!(b & 0x10);
        var dataSize = b & 15;

        if (dataSize + 1 > MAX_NUM_SIZE) {
          throw new Error('processBinaryCMap: Invalid dataSize.');
        }

        var ucs2DataSize = 1;
        var subitemsCount = stream.readNumber();
        var i;

        switch (type) {
          case 0:
            stream.readHex(start, dataSize);
            stream.readHexNumber(end, dataSize);
            addHex(end, start, dataSize);
            cMap.addCodespaceRange(dataSize + 1, hexToInt(start, dataSize), hexToInt(end, dataSize));

            for (i = 1; i < subitemsCount; i++) {
              incHex(end, dataSize);
              stream.readHexNumber(start, dataSize);
              addHex(start, end, dataSize);
              stream.readHexNumber(end, dataSize);
              addHex(end, start, dataSize);
              cMap.addCodespaceRange(dataSize + 1, hexToInt(start, dataSize), hexToInt(end, dataSize));
            }

            break;

          case 1:
            stream.readHex(start, dataSize);
            stream.readHexNumber(end, dataSize);
            addHex(end, start, dataSize);
            stream.readNumber();

            for (i = 1; i < subitemsCount; i++) {
              incHex(end, dataSize);
              stream.readHexNumber(start, dataSize);
              addHex(start, end, dataSize);
              stream.readHexNumber(end, dataSize);
              addHex(end, start, dataSize);
              stream.readNumber();
            }

            break;

          case 2:
            stream.readHex(_char, dataSize);
            code = stream.readNumber();
            cMap.mapOne(hexToInt(_char, dataSize), code);

            for (i = 1; i < subitemsCount; i++) {
              incHex(_char, dataSize);

              if (!sequence) {
                stream.readHexNumber(tmp, dataSize);
                addHex(_char, tmp, dataSize);
              }

              code = stream.readSigned() + (code + 1);
              cMap.mapOne(hexToInt(_char, dataSize), code);
            }

            break;

          case 3:
            stream.readHex(start, dataSize);
            stream.readHexNumber(end, dataSize);
            addHex(end, start, dataSize);
            code = stream.readNumber();
            cMap.mapCidRange(hexToInt(start, dataSize), hexToInt(end, dataSize), code);

            for (i = 1; i < subitemsCount; i++) {
              incHex(end, dataSize);

              if (!sequence) {
                stream.readHexNumber(start, dataSize);
                addHex(start, end, dataSize);
              } else {
                start.set(end);
              }

              stream.readHexNumber(end, dataSize);
              addHex(end, start, dataSize);
              code = stream.readNumber();
              cMap.mapCidRange(hexToInt(start, dataSize), hexToInt(end, dataSize), code);
            }

            break;

          case 4:
            stream.readHex(_char, ucs2DataSize);
            stream.readHex(charCode, dataSize);
            cMap.mapOne(hexToInt(_char, ucs2DataSize), hexToStr(charCode, dataSize));

            for (i = 1; i < subitemsCount; i++) {
              incHex(_char, ucs2DataSize);

              if (!sequence) {
                stream.readHexNumber(tmp, ucs2DataSize);
                addHex(_char, tmp, ucs2DataSize);
              }

              incHex(charCode, dataSize);
              stream.readHexSigned(tmp, dataSize);
              addHex(charCode, tmp, dataSize);
              cMap.mapOne(hexToInt(_char, ucs2DataSize), hexToStr(charCode, dataSize));
            }

            break;

          case 5:
            stream.readHex(start, ucs2DataSize);
            stream.readHexNumber(end, ucs2DataSize);
            addHex(end, start, ucs2DataSize);
            stream.readHex(charCode, dataSize);
            cMap.mapBfRange(hexToInt(start, ucs2DataSize), hexToInt(end, ucs2DataSize), hexToStr(charCode, dataSize));

            for (i = 1; i < subitemsCount; i++) {
              incHex(end, ucs2DataSize);

              if (!sequence) {
                stream.readHexNumber(start, ucs2DataSize);
                addHex(start, end, ucs2DataSize);
              } else {
                start.set(end);
              }

              stream.readHexNumber(end, ucs2DataSize);
              addHex(end, start, ucs2DataSize);
              stream.readHex(charCode, dataSize);
              cMap.mapBfRange(hexToInt(start, ucs2DataSize), hexToInt(end, ucs2DataSize), hexToStr(charCode, dataSize));
            }

            break;

          default:
            reject(new Error('processBinaryCMap: Unknown type: ' + type));
            return;
        }
      }

      if (useCMap) {
        resolve(extend(useCMap));
        return;
      }

      resolve(cMap);
    });
  }

  function BinaryCMapReader() {}

  BinaryCMapReader.prototype = {
    process: processBinaryCMap
  };
  return BinaryCMapReader;
}();

var CMapFactory = function CMapFactoryClosure() {
  function strToInt(str) {
    var a = 0;

    for (var i = 0; i < str.length; i++) {
      a = a << 8 | str.charCodeAt(i);
    }

    return a >>> 0;
  }

  function expectString(obj) {
    if (!(0, _util.isString)(obj)) {
      throw new _util.FormatError('Malformed CMap: expected string.');
    }
  }

  function expectInt(obj) {
    if (!Number.isInteger(obj)) {
      throw new _util.FormatError('Malformed CMap: expected int.');
    }
  }

  function parseBfChar(cMap, lexer) {
    while (true) {
      var obj = lexer.getObj();

      if ((0, _primitives.isEOF)(obj)) {
        break;
      }

      if ((0, _primitives.isCmd)(obj, 'endbfchar')) {
        return;
      }

      expectString(obj);
      var src = strToInt(obj);
      obj = lexer.getObj();
      expectString(obj);
      var dst = obj;
      cMap.mapOne(src, dst);
    }
  }

  function parseBfRange(cMap, lexer) {
    while (true) {
      var obj = lexer.getObj();

      if ((0, _primitives.isEOF)(obj)) {
        break;
      }

      if ((0, _primitives.isCmd)(obj, 'endbfrange')) {
        return;
      }

      expectString(obj);
      var low = strToInt(obj);
      obj = lexer.getObj();
      expectString(obj);
      var high = strToInt(obj);
      obj = lexer.getObj();

      if (Number.isInteger(obj) || (0, _util.isString)(obj)) {
        var dstLow = Number.isInteger(obj) ? String.fromCharCode(obj) : obj;
        cMap.mapBfRange(low, high, dstLow);
      } else if ((0, _primitives.isCmd)(obj, '[')) {
        obj = lexer.getObj();
        var array = [];

        while (!(0, _primitives.isCmd)(obj, ']') && !(0, _primitives.isEOF)(obj)) {
          array.push(obj);
          obj = lexer.getObj();
        }

        cMap.mapBfRangeToArray(low, high, array);
      } else {
        break;
      }
    }

    throw new _util.FormatError('Invalid bf range.');
  }

  function parseCidChar(cMap, lexer) {
    while (true) {
      var obj = lexer.getObj();

      if ((0, _primitives.isEOF)(obj)) {
        break;
      }

      if ((0, _primitives.isCmd)(obj, 'endcidchar')) {
        return;
      }

      expectString(obj);
      var src = strToInt(obj);
      obj = lexer.getObj();
      expectInt(obj);
      var dst = obj;
      cMap.mapOne(src, dst);
    }
  }

  function parseCidRange(cMap, lexer) {
    while (true) {
      var obj = lexer.getObj();

      if ((0, _primitives.isEOF)(obj)) {
        break;
      }

      if ((0, _primitives.isCmd)(obj, 'endcidrange')) {
        return;
      }

      expectString(obj);
      var low = strToInt(obj);
      obj = lexer.getObj();
      expectString(obj);
      var high = strToInt(obj);
      obj = lexer.getObj();
      expectInt(obj);
      var dstLow = obj;
      cMap.mapCidRange(low, high, dstLow);
    }
  }

  function parseCodespaceRange(cMap, lexer) {
    while (true) {
      var obj = lexer.getObj();

      if ((0, _primitives.isEOF)(obj)) {
        break;
      }

      if ((0, _primitives.isCmd)(obj, 'endcodespacerange')) {
        return;
      }

      if (!(0, _util.isString)(obj)) {
        break;
      }

      var low = strToInt(obj);
      obj = lexer.getObj();

      if (!(0, _util.isString)(obj)) {
        break;
      }

      var high = strToInt(obj);
      cMap.addCodespaceRange(obj.length, low, high);
    }

    throw new _util.FormatError('Invalid codespace range.');
  }

  function parseWMode(cMap, lexer) {
    var obj = lexer.getObj();

    if (Number.isInteger(obj)) {
      cMap.vertical = !!obj;
    }
  }

  function parseCMapName(cMap, lexer) {
    var obj = lexer.getObj();

    if ((0, _primitives.isName)(obj) && (0, _util.isString)(obj.name)) {
      cMap.name = obj.name;
    }
  }

  function parseCMap(cMap, lexer, fetchBuiltInCMap, useCMap) {
    var previous;
    var embeddedUseCMap;

    objLoop: while (true) {
      try {
        var obj = lexer.getObj();

        if ((0, _primitives.isEOF)(obj)) {
          break;
        } else if ((0, _primitives.isName)(obj)) {
          if (obj.name === 'WMode') {
            parseWMode(cMap, lexer);
          } else if (obj.name === 'CMapName') {
            parseCMapName(cMap, lexer);
          }

          previous = obj;
        } else if ((0, _primitives.isCmd)(obj)) {
          switch (obj.cmd) {
            case 'endcmap':
              break objLoop;

            case 'usecmap':
              if ((0, _primitives.isName)(previous)) {
                embeddedUseCMap = previous.name;
              }

              break;

            case 'begincodespacerange':
              parseCodespaceRange(cMap, lexer);
              break;

            case 'beginbfchar':
              parseBfChar(cMap, lexer);
              break;

            case 'begincidchar':
              parseCidChar(cMap, lexer);
              break;

            case 'beginbfrange':
              parseBfRange(cMap, lexer);
              break;

            case 'begincidrange':
              parseCidRange(cMap, lexer);
              break;
          }
        }
      } catch (ex) {
        if (ex instanceof _core_utils.MissingDataException) {
          throw ex;
        }

        (0, _util.warn)('Invalid cMap data: ' + ex);
        continue;
      }
    }

    if (!useCMap && embeddedUseCMap) {
      useCMap = embeddedUseCMap;
    }

    if (useCMap) {
      return extendCMap(cMap, fetchBuiltInCMap, useCMap);
    }

    return Promise.resolve(cMap);
  }

  function extendCMap(cMap, fetchBuiltInCMap, useCMap) {
    return createBuiltInCMap(useCMap, fetchBuiltInCMap).then(function (newCMap) {
      cMap.useCMap = newCMap;

      if (cMap.numCodespaceRanges === 0) {
        var useCodespaceRanges = cMap.useCMap.codespaceRanges;

        for (var i = 0; i < useCodespaceRanges.length; i++) {
          cMap.codespaceRanges[i] = useCodespaceRanges[i].slice();
        }

        cMap.numCodespaceRanges = cMap.useCMap.numCodespaceRanges;
      }

      cMap.useCMap.forEach(function (key, value) {
        if (!cMap.contains(key)) {
          cMap.mapOne(key, cMap.useCMap.lookup(key));
        }
      });
      return cMap;
    });
  }

  function createBuiltInCMap(name, fetchBuiltInCMap) {
    if (name === 'Identity-H') {
      return Promise.resolve(new IdentityCMap(false, 2));
    } else if (name === 'Identity-V') {
      return Promise.resolve(new IdentityCMap(true, 2));
    }

    if (!BUILT_IN_CMAPS.includes(name)) {
      return Promise.reject(new Error('Unknown CMap name: ' + name));
    }

    if (!fetchBuiltInCMap) {
      return Promise.reject(new Error('Built-in CMap parameters are not provided.'));
    }

    return fetchBuiltInCMap(name).then(function (data) {
      var cMapData = data.cMapData,
          compressionType = data.compressionType;
      var cMap = new CMap(true);

      if (compressionType === _util.CMapCompressionType.BINARY) {
        return new BinaryCMapReader().process(cMapData, cMap, function (useCMap) {
          return extendCMap(cMap, fetchBuiltInCMap, useCMap);
        });
      }

      if (compressionType === _util.CMapCompressionType.NONE) {
        var lexer = new _parser.Lexer(new _stream.Stream(cMapData));
        return parseCMap(cMap, lexer, fetchBuiltInCMap, null);
      }

      return Promise.reject(new Error('TODO: Only BINARY/NONE CMap compression is currently supported.'));
    });
  }

  return {
    create: function create(params) {
      var encoding = params.encoding;
      var fetchBuiltInCMap = params.fetchBuiltInCMap;
      var useCMap = params.useCMap;

      if ((0, _primitives.isName)(encoding)) {
        return createBuiltInCMap(encoding.name, fetchBuiltInCMap);
      } else if ((0, _primitives.isStream)(encoding)) {
        var cMap = new CMap();
        var lexer = new _parser.Lexer(encoding);
        return parseCMap(cMap, lexer, fetchBuiltInCMap, useCMap).then(function (parsedCMap) {
          if (parsedCMap.isIdentityCMap) {
            return createBuiltInCMap(parsedCMap.name, fetchBuiltInCMap);
          }

          return parsedCMap;
        });
      }

      return Promise.reject(new Error('Encoding required.'));
    }
  };
}();

exports.CMapFactory = CMapFactory;