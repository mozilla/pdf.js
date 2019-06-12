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
exports.buildGetDocumentParams = buildGetDocumentParams;
exports.createIdFactory = createIdFactory;
exports.TEST_PDFS_PATH = exports.XRefMock = exports.NodeCMapReaderFactory = exports.NodeCanvasFactory = exports.NodeFileReaderFactory = exports.DOMFileReaderFactory = void 0;

var _regenerator = _interopRequireDefault(require("@babel/runtime/regenerator"));

var _util = require("../../shared/util");

var _is_node = _interopRequireDefault(require("../../shared/is_node"));

var _primitives = require("../../core/primitives");

var _document = require("../../core/document");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var DOMFileReaderFactory =
/*#__PURE__*/
function () {
  function DOMFileReaderFactory() {
    _classCallCheck(this, DOMFileReaderFactory);
  }

  _createClass(DOMFileReaderFactory, null, [{
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
      var _ref = _asyncToGenerator(
      /*#__PURE__*/
      _regenerator["default"].mark(function _callee(params) {
        var response;
        return _regenerator["default"].wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                _context.next = 2;
                return fetch(params.path);

              case 2:
                response = _context.sent;

                if (response.ok) {
                  _context.next = 5;
                  break;
                }

                throw new Error(response.statusText);

              case 5:
                _context.t0 = Uint8Array;
                _context.next = 8;
                return response.arrayBuffer();

              case 8:
                _context.t1 = _context.sent;
                return _context.abrupt("return", new _context.t0(_context.t1));

              case 10:
              case "end":
                return _context.stop();
            }
          }
        }, _callee);
      }));

      return function (_x2) {
        return _ref.apply(this, arguments);
      };
    }())
  }]);

  return DOMFileReaderFactory;
}();

exports.DOMFileReaderFactory = DOMFileReaderFactory;

var NodeFileReaderFactory =
/*#__PURE__*/
function () {
  function NodeFileReaderFactory() {
    _classCallCheck(this, NodeFileReaderFactory);
  }

  _createClass(NodeFileReaderFactory, null, [{
    key: "fetch",
    value: function () {
      var _fetch2 = _asyncToGenerator(
      /*#__PURE__*/
      _regenerator["default"].mark(function _callee2(params) {
        var fs;
        return _regenerator["default"].wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                fs = require('fs');
                return _context2.abrupt("return", new Promise(function (resolve, reject) {
                  fs.readFile(params.path, function (error, data) {
                    if (error || !data) {
                      reject(error || new Error("Empty file for: ".concat(params.path)));
                      return;
                    }

                    resolve(new Uint8Array(data));
                  });
                }));

              case 2:
              case "end":
                return _context2.stop();
            }
          }
        }, _callee2);
      }));

      function fetch(_x3) {
        return _fetch2.apply(this, arguments);
      }

      return fetch;
    }()
  }]);

  return NodeFileReaderFactory;
}();

exports.NodeFileReaderFactory = NodeFileReaderFactory;
var TEST_PDFS_PATH = {
  dom: '../pdfs/',
  node: './test/pdfs/'
};
exports.TEST_PDFS_PATH = TEST_PDFS_PATH;

function buildGetDocumentParams(filename, options) {
  var params = Object.create(null);

  if ((0, _is_node["default"])()) {
    params.url = TEST_PDFS_PATH.node + filename;
  } else {
    params.url = new URL(TEST_PDFS_PATH.dom + filename, window.location).href;
  }

  for (var option in options) {
    params[option] = options[option];
  }

  return params;
}

var NodeCanvasFactory =
/*#__PURE__*/
function () {
  function NodeCanvasFactory() {
    _classCallCheck(this, NodeCanvasFactory);
  }

  _createClass(NodeCanvasFactory, [{
    key: "create",
    value: function create(width, height) {
      (0, _util.assert)(width > 0 && height > 0, 'Invalid canvas size');

      var Canvas = require('canvas');

      var canvas = Canvas.createCanvas(width, height);
      return {
        canvas: canvas,
        context: canvas.getContext('2d')
      };
    }
  }, {
    key: "reset",
    value: function reset(canvasAndContext, width, height) {
      (0, _util.assert)(canvasAndContext.canvas, 'Canvas is not specified');
      (0, _util.assert)(width > 0 && height > 0, 'Invalid canvas size');
      canvasAndContext.canvas.width = width;
      canvasAndContext.canvas.height = height;
    }
  }, {
    key: "destroy",
    value: function destroy(canvasAndContext) {
      (0, _util.assert)(canvasAndContext.canvas, 'Canvas is not specified');
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
      canvasAndContext.canvas = null;
      canvasAndContext.context = null;
    }
  }]);

  return NodeCanvasFactory;
}();

exports.NodeCanvasFactory = NodeCanvasFactory;

var NodeCMapReaderFactory =
/*#__PURE__*/
function () {
  function NodeCMapReaderFactory(_ref2) {
    var _ref2$baseUrl = _ref2.baseUrl,
        baseUrl = _ref2$baseUrl === void 0 ? null : _ref2$baseUrl,
        _ref2$isCompressed = _ref2.isCompressed,
        isCompressed = _ref2$isCompressed === void 0 ? false : _ref2$isCompressed;

    _classCallCheck(this, NodeCMapReaderFactory);

    this.baseUrl = baseUrl;
    this.isCompressed = isCompressed;
  }

  _createClass(NodeCMapReaderFactory, [{
    key: "fetch",
    value: function () {
      var _fetch3 = _asyncToGenerator(
      /*#__PURE__*/
      _regenerator["default"].mark(function _callee3(_ref3) {
        var _this = this;

        var name, url, compressionType;
        return _regenerator["default"].wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                name = _ref3.name;

                if (this.baseUrl) {
                  _context3.next = 3;
                  break;
                }

                throw new Error('The CMap "baseUrl" parameter must be specified, ensure that ' + 'the "cMapUrl" and "cMapPacked" API parameters are provided.');

              case 3:
                if (name) {
                  _context3.next = 5;
                  break;
                }

                throw new Error('CMap name must be specified.');

              case 5:
                url = this.baseUrl + name + (this.isCompressed ? '.bcmap' : '');
                compressionType = this.isCompressed ? _util.CMapCompressionType.BINARY : _util.CMapCompressionType.NONE;
                return _context3.abrupt("return", new Promise(function (resolve, reject) {
                  var fs = require('fs');

                  fs.readFile(url, function (error, data) {
                    if (error || !data) {
                      reject(new Error(error));
                      return;
                    }

                    resolve({
                      cMapData: new Uint8Array(data),
                      compressionType: compressionType
                    });
                  });
                })["catch"](function (reason) {
                  throw new Error("Unable to load ".concat(_this.isCompressed ? 'binary ' : '') + "CMap at: ".concat(url));
                }));

              case 8:
              case "end":
                return _context3.stop();
            }
          }
        }, _callee3, this);
      }));

      function fetch(_x4) {
        return _fetch3.apply(this, arguments);
      }

      return fetch;
    }()
  }]);

  return NodeCMapReaderFactory;
}();

exports.NodeCMapReaderFactory = NodeCMapReaderFactory;

var XRefMock =
/*#__PURE__*/
function () {
  function XRefMock(array) {
    _classCallCheck(this, XRefMock);

    this._map = Object.create(null);

    for (var key in array) {
      var obj = array[key];
      this._map[obj.ref.toString()] = obj.data;
    }
  }

  _createClass(XRefMock, [{
    key: "fetch",
    value: function fetch(ref) {
      return this._map[ref.toString()];
    }
  }, {
    key: "fetchAsync",
    value: function fetchAsync(ref) {
      return Promise.resolve(this.fetch(ref));
    }
  }, {
    key: "fetchIfRef",
    value: function fetchIfRef(obj) {
      if (!(0, _primitives.isRef)(obj)) {
        return obj;
      }

      return this.fetch(obj);
    }
  }, {
    key: "fetchIfRefAsync",
    value: function fetchIfRefAsync(obj) {
      return Promise.resolve(this.fetchIfRef(obj));
    }
  }]);

  return XRefMock;
}();

exports.XRefMock = XRefMock;

function createIdFactory(pageIndex) {
  var page = new _document.Page({
    pdfManager: {
      get docId() {
        return 'd0';
      }

    },
    pageIndex: pageIndex
  });
  return page.idFactory;
}