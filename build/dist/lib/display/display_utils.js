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
exports.addLinkAttributes = addLinkAttributes;
exports.getFilenameFromUrl = getFilenameFromUrl;
exports.isFetchSupported = isFetchSupported;
exports.isValidFetchUrl = isValidFetchUrl;
exports.loadScript = loadScript;
exports.deprecated = deprecated;
exports.releaseImageResources = releaseImageResources;
exports.PDFDateString = exports.DummyStatTimer = exports.StatTimer = exports.DOMSVGFactory = exports.DOMCMapReaderFactory = exports.DOMCanvasFactory = exports.DEFAULT_LINK_REL = exports.LinkTarget = exports.RenderingCancelledException = exports.PageViewport = void 0;

var _regenerator = _interopRequireDefault(require("@babel/runtime/regenerator"));

var _util = require("../shared/util");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var DEFAULT_LINK_REL = 'noopener noreferrer nofollow';
exports.DEFAULT_LINK_REL = DEFAULT_LINK_REL;
var SVG_NS = 'http://www.w3.org/2000/svg';

var DOMCanvasFactory =
/*#__PURE__*/
function () {
  function DOMCanvasFactory() {
    _classCallCheck(this, DOMCanvasFactory);
  }

  _createClass(DOMCanvasFactory, [{
    key: "create",
    value: function create(width, height) {
      if (width <= 0 || height <= 0) {
        throw new Error('Invalid canvas size');
      }

      var canvas = document.createElement('canvas');
      var context = canvas.getContext('2d');
      canvas.width = width;
      canvas.height = height;
      return {
        canvas: canvas,
        context: context
      };
    }
  }, {
    key: "reset",
    value: function reset(canvasAndContext, width, height) {
      if (!canvasAndContext.canvas) {
        throw new Error('Canvas is not specified');
      }

      if (width <= 0 || height <= 0) {
        throw new Error('Invalid canvas size');
      }

      canvasAndContext.canvas.width = width;
      canvasAndContext.canvas.height = height;
    }
  }, {
    key: "destroy",
    value: function destroy(canvasAndContext) {
      if (!canvasAndContext.canvas) {
        throw new Error('Canvas is not specified');
      }

      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
      canvasAndContext.canvas = null;
      canvasAndContext.context = null;
    }
  }]);

  return DOMCanvasFactory;
}();

exports.DOMCanvasFactory = DOMCanvasFactory;

var DOMCMapReaderFactory =
/*#__PURE__*/
function () {
  function DOMCMapReaderFactory(_ref) {
    var _ref$baseUrl = _ref.baseUrl,
        baseUrl = _ref$baseUrl === void 0 ? null : _ref$baseUrl,
        _ref$isCompressed = _ref.isCompressed,
        isCompressed = _ref$isCompressed === void 0 ? false : _ref$isCompressed;

    _classCallCheck(this, DOMCMapReaderFactory);

    this.baseUrl = baseUrl;
    this.isCompressed = isCompressed;
  }

  _createClass(DOMCMapReaderFactory, [{
    key: "fetch",
    value: function (_fetch) {
      function fetch(_x) {
        return _fetch.apply(this, arguments);
      }

      fetch.toString = function () {
        return _fetch.toString();
      };

      return fetch;
    }(
    /*#__PURE__*/
    function () {
      var _ref3 = _asyncToGenerator(
      /*#__PURE__*/
      _regenerator["default"].mark(function _callee2(_ref2) {
        var _this = this;

        var name, url, compressionType;
        return _regenerator["default"].wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                name = _ref2.name;

                if (this.baseUrl) {
                  _context2.next = 3;
                  break;
                }

                throw new Error('The CMap "baseUrl" parameter must be specified, ensure that ' + 'the "cMapUrl" and "cMapPacked" API parameters are provided.');

              case 3:
                if (name) {
                  _context2.next = 5;
                  break;
                }

                throw new Error('CMap name must be specified.');

              case 5:
                url = this.baseUrl + name + (this.isCompressed ? '.bcmap' : '');
                compressionType = this.isCompressed ? _util.CMapCompressionType.BINARY : _util.CMapCompressionType.NONE;

                if (!(isFetchSupported() && isValidFetchUrl(url, document.baseURI))) {
                  _context2.next = 9;
                  break;
                }

                return _context2.abrupt("return", fetch(url).then(
                /*#__PURE__*/
                function () {
                  var _ref4 = _asyncToGenerator(
                  /*#__PURE__*/
                  _regenerator["default"].mark(function _callee(response) {
                    var cMapData;
                    return _regenerator["default"].wrap(function _callee$(_context) {
                      while (1) {
                        switch (_context.prev = _context.next) {
                          case 0:
                            if (response.ok) {
                              _context.next = 2;
                              break;
                            }

                            throw new Error(response.statusText);

                          case 2:
                            if (!_this.isCompressed) {
                              _context.next = 10;
                              break;
                            }

                            _context.t0 = Uint8Array;
                            _context.next = 6;
                            return response.arrayBuffer();

                          case 6:
                            _context.t1 = _context.sent;
                            cMapData = new _context.t0(_context.t1);
                            _context.next = 15;
                            break;

                          case 10:
                            _context.t2 = _util.stringToBytes;
                            _context.next = 13;
                            return response.text();

                          case 13:
                            _context.t3 = _context.sent;
                            cMapData = (0, _context.t2)(_context.t3);

                          case 15:
                            return _context.abrupt("return", {
                              cMapData: cMapData,
                              compressionType: compressionType
                            });

                          case 16:
                          case "end":
                            return _context.stop();
                        }
                      }
                    }, _callee);
                  }));

                  return function (_x3) {
                    return _ref4.apply(this, arguments);
                  };
                }())["catch"](function (reason) {
                  throw new Error("Unable to load ".concat(_this.isCompressed ? 'binary ' : '') + "CMap at: ".concat(url));
                }));

              case 9:
                return _context2.abrupt("return", new Promise(function (resolve, reject) {
                  var request = new XMLHttpRequest();
                  request.open('GET', url, true);

                  if (_this.isCompressed) {
                    request.responseType = 'arraybuffer';
                  }

                  request.onreadystatechange = function () {
                    if (request.readyState !== XMLHttpRequest.DONE) {
                      return;
                    }

                    if (request.status === 200 || request.status === 0) {
                      var cMapData;

                      if (_this.isCompressed && request.response) {
                        cMapData = new Uint8Array(request.response);
                      } else if (!_this.isCompressed && request.responseText) {
                        cMapData = (0, _util.stringToBytes)(request.responseText);
                      }

                      if (cMapData) {
                        resolve({
                          cMapData: cMapData,
                          compressionType: compressionType
                        });
                        return;
                      }
                    }

                    reject(new Error(request.statusText));
                  };

                  request.send(null);
                })["catch"](function (reason) {
                  throw new Error("Unable to load ".concat(_this.isCompressed ? 'binary ' : '') + "CMap at: ".concat(url));
                }));

              case 10:
              case "end":
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      return function (_x2) {
        return _ref3.apply(this, arguments);
      };
    }())
  }]);

  return DOMCMapReaderFactory;
}();

exports.DOMCMapReaderFactory = DOMCMapReaderFactory;

var DOMSVGFactory =
/*#__PURE__*/
function () {
  function DOMSVGFactory() {
    _classCallCheck(this, DOMSVGFactory);
  }

  _createClass(DOMSVGFactory, [{
    key: "create",
    value: function create(width, height) {
      (0, _util.assert)(width > 0 && height > 0, 'Invalid SVG dimensions');
      var svg = document.createElementNS(SVG_NS, 'svg:svg');
      svg.setAttribute('version', '1.1');
      svg.setAttribute('width', width + 'px');
      svg.setAttribute('height', height + 'px');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      return svg;
    }
  }, {
    key: "createElement",
    value: function createElement(type) {
      (0, _util.assert)(typeof type === 'string', 'Invalid SVG element type');
      return document.createElementNS(SVG_NS, type);
    }
  }]);

  return DOMSVGFactory;
}();

exports.DOMSVGFactory = DOMSVGFactory;

var PageViewport =
/*#__PURE__*/
function () {
  function PageViewport(_ref5) {
    var viewBox = _ref5.viewBox,
        scale = _ref5.scale,
        rotation = _ref5.rotation,
        _ref5$offsetX = _ref5.offsetX,
        offsetX = _ref5$offsetX === void 0 ? 0 : _ref5$offsetX,
        _ref5$offsetY = _ref5.offsetY,
        offsetY = _ref5$offsetY === void 0 ? 0 : _ref5$offsetY,
        _ref5$dontFlip = _ref5.dontFlip,
        dontFlip = _ref5$dontFlip === void 0 ? false : _ref5$dontFlip;

    _classCallCheck(this, PageViewport);

    this.viewBox = viewBox;
    this.scale = scale;
    this.rotation = rotation;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    var centerX = (viewBox[2] + viewBox[0]) / 2;
    var centerY = (viewBox[3] + viewBox[1]) / 2;
    var rotateA, rotateB, rotateC, rotateD;
    rotation = rotation % 360;
    rotation = rotation < 0 ? rotation + 360 : rotation;

    switch (rotation) {
      case 180:
        rotateA = -1;
        rotateB = 0;
        rotateC = 0;
        rotateD = 1;
        break;

      case 90:
        rotateA = 0;
        rotateB = 1;
        rotateC = 1;
        rotateD = 0;
        break;

      case 270:
        rotateA = 0;
        rotateB = -1;
        rotateC = -1;
        rotateD = 0;
        break;

      default:
        rotateA = 1;
        rotateB = 0;
        rotateC = 0;
        rotateD = -1;
        break;
    }

    if (dontFlip) {
      rotateC = -rotateC;
      rotateD = -rotateD;
    }

    var offsetCanvasX, offsetCanvasY;
    var width, height;

    if (rotateA === 0) {
      offsetCanvasX = Math.abs(centerY - viewBox[1]) * scale + offsetX;
      offsetCanvasY = Math.abs(centerX - viewBox[0]) * scale + offsetY;
      width = Math.abs(viewBox[3] - viewBox[1]) * scale;
      height = Math.abs(viewBox[2] - viewBox[0]) * scale;
    } else {
      offsetCanvasX = Math.abs(centerX - viewBox[0]) * scale + offsetX;
      offsetCanvasY = Math.abs(centerY - viewBox[1]) * scale + offsetY;
      width = Math.abs(viewBox[2] - viewBox[0]) * scale;
      height = Math.abs(viewBox[3] - viewBox[1]) * scale;
    }

    this.transform = [rotateA * scale, rotateB * scale, rotateC * scale, rotateD * scale, offsetCanvasX - rotateA * scale * centerX - rotateC * scale * centerY, offsetCanvasY - rotateB * scale * centerX - rotateD * scale * centerY];
    this.width = width;
    this.height = height;
  }

  _createClass(PageViewport, [{
    key: "clone",
    value: function clone() {
      var _ref6 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
          _ref6$scale = _ref6.scale,
          scale = _ref6$scale === void 0 ? this.scale : _ref6$scale,
          _ref6$rotation = _ref6.rotation,
          rotation = _ref6$rotation === void 0 ? this.rotation : _ref6$rotation,
          _ref6$dontFlip = _ref6.dontFlip,
          dontFlip = _ref6$dontFlip === void 0 ? false : _ref6$dontFlip;

      return new PageViewport({
        viewBox: this.viewBox.slice(),
        scale: scale,
        rotation: rotation,
        offsetX: this.offsetX,
        offsetY: this.offsetY,
        dontFlip: dontFlip
      });
    }
  }, {
    key: "convertToViewportPoint",
    value: function convertToViewportPoint(x, y) {
      return _util.Util.applyTransform([x, y], this.transform);
    }
  }, {
    key: "convertToViewportRectangle",
    value: function convertToViewportRectangle(rect) {
      var topLeft = _util.Util.applyTransform([rect[0], rect[1]], this.transform);

      var bottomRight = _util.Util.applyTransform([rect[2], rect[3]], this.transform);

      return [topLeft[0], topLeft[1], bottomRight[0], bottomRight[1]];
    }
  }, {
    key: "convertToPdfPoint",
    value: function convertToPdfPoint(x, y) {
      return _util.Util.applyInverseTransform([x, y], this.transform);
    }
  }]);

  return PageViewport;
}();

exports.PageViewport = PageViewport;

var RenderingCancelledException = function RenderingCancelledException() {
  function RenderingCancelledException(msg, type) {
    this.message = msg;
    this.type = type;
  }

  RenderingCancelledException.prototype = new Error();
  RenderingCancelledException.prototype.name = 'RenderingCancelledException';
  RenderingCancelledException.constructor = RenderingCancelledException;
  return RenderingCancelledException;
}();

exports.RenderingCancelledException = RenderingCancelledException;
var LinkTarget = {
  NONE: 0,
  SELF: 1,
  BLANK: 2,
  PARENT: 3,
  TOP: 4
};
exports.LinkTarget = LinkTarget;
var LinkTargetStringMap = ['', '_self', '_blank', '_parent', '_top'];

function addLinkAttributes(link) {
  var _ref7 = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
      url = _ref7.url,
      target = _ref7.target,
      rel = _ref7.rel;

  link.href = link.title = url ? (0, _util.removeNullCharacters)(url) : '';

  if (url) {
    var LinkTargetValues = Object.values(LinkTarget);
    var targetIndex = LinkTargetValues.includes(target) ? target : LinkTarget.NONE;
    link.target = LinkTargetStringMap[targetIndex];
    link.rel = typeof rel === 'string' ? rel : DEFAULT_LINK_REL;
  }
}

function getFilenameFromUrl(url) {
  var anchor = url.indexOf('#');
  var query = url.indexOf('?');
  var end = Math.min(anchor > 0 ? anchor : url.length, query > 0 ? query : url.length);
  return url.substring(url.lastIndexOf('/', end) + 1, end);
}

var StatTimer =
/*#__PURE__*/
function () {
  function StatTimer() {
    var enable = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : true;

    _classCallCheck(this, StatTimer);

    this.enabled = !!enable;
    this.started = Object.create(null);
    this.times = [];
  }

  _createClass(StatTimer, [{
    key: "time",
    value: function time(name) {
      if (!this.enabled) {
        return;
      }

      if (name in this.started) {
        (0, _util.warn)('Timer is already running for ' + name);
      }

      this.started[name] = Date.now();
    }
  }, {
    key: "timeEnd",
    value: function timeEnd(name) {
      if (!this.enabled) {
        return;
      }

      if (!(name in this.started)) {
        (0, _util.warn)('Timer has not been started for ' + name);
      }

      this.times.push({
        'name': name,
        'start': this.started[name],
        'end': Date.now()
      });
      delete this.started[name];
    }
  }, {
    key: "toString",
    value: function toString() {
      var out = '',
          longest = 0;
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = this.times[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var time = _step.value;
          var name = time.name;

          if (name.length > longest) {
            longest = name.length;
          }
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator["return"] != null) {
            _iterator["return"]();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = this.times[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var _time = _step2.value;
          var duration = _time.end - _time.start;
          out += "".concat(_time.name.padEnd(longest), " ").concat(duration, "ms\n");
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2["return"] != null) {
            _iterator2["return"]();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }

      return out;
    }
  }]);

  return StatTimer;
}();

exports.StatTimer = StatTimer;

var DummyStatTimer =
/*#__PURE__*/
function () {
  function DummyStatTimer() {
    _classCallCheck(this, DummyStatTimer);

    (0, _util.unreachable)('Cannot initialize DummyStatTimer.');
  }

  _createClass(DummyStatTimer, null, [{
    key: "time",
    value: function time(name) {}
  }, {
    key: "timeEnd",
    value: function timeEnd(name) {}
  }, {
    key: "toString",
    value: function toString() {
      return '';
    }
  }]);

  return DummyStatTimer;
}();

exports.DummyStatTimer = DummyStatTimer;

function isFetchSupported() {
  return typeof fetch !== 'undefined' && typeof Response !== 'undefined' && 'body' in Response.prototype && typeof ReadableStream !== 'undefined';
}

function isValidFetchUrl(url, baseUrl) {
  try {
    var _ref8 = baseUrl ? new _util.URL(url, baseUrl) : new _util.URL(url),
        protocol = _ref8.protocol;

    return protocol === 'http:' || protocol === 'https:';
  } catch (ex) {
    return false;
  }
}

function loadScript(src) {
  return new Promise(function (resolve, reject) {
    var script = document.createElement('script');
    script.src = src;
    script.onload = resolve;

    script.onerror = function () {
      reject(new Error("Cannot load script at: ".concat(script.src)));
    };

    (document.head || document.documentElement).appendChild(script);
  });
}

function deprecated(details) {
  console.log('Deprecated API usage: ' + details);
}

function releaseImageResources(img) {
  (0, _util.assert)(img instanceof Image, 'Invalid `img` parameter.');
  var url = img.src;

  if (typeof url === 'string' && url.startsWith('blob:') && _util.URL.revokeObjectURL) {
    _util.URL.revokeObjectURL(url);
  }

  img.removeAttribute('src');
}

var pdfDateStringRegex;

var PDFDateString =
/*#__PURE__*/
function () {
  function PDFDateString() {
    _classCallCheck(this, PDFDateString);
  }

  _createClass(PDFDateString, null, [{
    key: "toDateObject",
    value: function toDateObject(input) {
      if (!input || !(0, _util.isString)(input)) {
        return null;
      }

      if (!pdfDateStringRegex) {
        pdfDateStringRegex = new RegExp('^D:' + '(\\d{4})' + '(\\d{2})?' + '(\\d{2})?' + '(\\d{2})?' + '(\\d{2})?' + '(\\d{2})?' + '([Z|+|-])?' + '(\\d{2})?' + '\'?' + '(\\d{2})?' + '\'?');
      }

      var matches = pdfDateStringRegex.exec(input);

      if (!matches) {
        return null;
      }

      var year = parseInt(matches[1], 10);
      var month = parseInt(matches[2], 10);
      month = month >= 1 && month <= 12 ? month - 1 : 0;
      var day = parseInt(matches[3], 10);
      day = day >= 1 && day <= 31 ? day : 1;
      var hour = parseInt(matches[4], 10);
      hour = hour >= 0 && hour <= 23 ? hour : 0;
      var minute = parseInt(matches[5], 10);
      minute = minute >= 0 && minute <= 59 ? minute : 0;
      var second = parseInt(matches[6], 10);
      second = second >= 0 && second <= 59 ? second : 0;
      var universalTimeRelation = matches[7] || 'Z';
      var offsetHour = parseInt(matches[8], 10);
      offsetHour = offsetHour >= 0 && offsetHour <= 23 ? offsetHour : 0;
      var offsetMinute = parseInt(matches[9], 10) || 0;
      offsetMinute = offsetMinute >= 0 && offsetMinute <= 59 ? offsetMinute : 0;

      if (universalTimeRelation === '-') {
        hour += offsetHour;
        minute += offsetMinute;
      } else if (universalTimeRelation === '+') {
        hour -= offsetHour;
        minute -= offsetMinute;
      }

      return new Date(Date.UTC(year, month, day, hour, minute, second));
    }
  }]);

  return PDFDateString;
}();

exports.PDFDateString = PDFDateString;