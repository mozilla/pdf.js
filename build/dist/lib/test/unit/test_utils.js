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
exports.TEST_PDFS_PATH = exports.buildGetDocumentParams = exports.XRefMock = exports.NodeCMapReaderFactory = exports.NodeFileReaderFactory = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _util = require('../../shared/util');

var _primitives = require('../../core/primitives');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var NodeFileReaderFactory = function () {
  function NodeFileReaderFactory() {
    _classCallCheck(this, NodeFileReaderFactory);
  }

  _createClass(NodeFileReaderFactory, null, [{
    key: 'fetch',
    value: function fetch(params) {
      var fs = require('fs');
      var file = fs.readFileSync(params.path);
      return new Uint8Array(file);
    }
  }]);

  return NodeFileReaderFactory;
}();

var TEST_PDFS_PATH = {
  dom: '../pdfs/',
  node: './test/pdfs/'
};
function buildGetDocumentParams(filename, options) {
  var params = Object.create(null);
  if ((0, _util.isNodeJS)()) {
    params.data = NodeFileReaderFactory.fetch({ path: TEST_PDFS_PATH.node + filename });
  } else {
    params.url = new URL(TEST_PDFS_PATH.dom + filename, window.location).href;
  }
  for (var option in options) {
    params[option] = options[option];
  }
  return params;
}

var NodeCMapReaderFactory = function () {
  function NodeCMapReaderFactory(_ref) {
    var _ref$baseUrl = _ref.baseUrl,
        baseUrl = _ref$baseUrl === undefined ? null : _ref$baseUrl,
        _ref$isCompressed = _ref.isCompressed,
        isCompressed = _ref$isCompressed === undefined ? false : _ref$isCompressed;

    _classCallCheck(this, NodeCMapReaderFactory);

    this.baseUrl = baseUrl;
    this.isCompressed = isCompressed;
  }

  _createClass(NodeCMapReaderFactory, [{
    key: 'fetch',
    value: function fetch(_ref2) {
      var _this = this;

      var name = _ref2.name;

      if (!name) {
        return Promise.reject(new Error('CMap name must be specified.'));
      }
      return new Promise(function (resolve, reject) {
        var url = _this.baseUrl + name + (_this.isCompressed ? '.bcmap' : '');
        var fs = require('fs');
        fs.readFile(url, function (error, data) {
          if (error || !data) {
            reject(new Error('Unable to load ' + (_this.isCompressed ? 'binary ' : '') + 'CMap at: ' + url));
            return;
          }
          resolve({
            cMapData: new Uint8Array(data),
            compressionType: _this.isCompressed ? _util.CMapCompressionType.BINARY : _util.CMapCompressionType.NONE
          });
        });
      });
    }
  }]);

  return NodeCMapReaderFactory;
}();

var XRefMock = function () {
  function XRefMock(array) {
    _classCallCheck(this, XRefMock);

    this._map = Object.create(null);
    for (var key in array) {
      var obj = array[key];
      this._map[obj.ref.toString()] = obj.data;
    }
  }

  _createClass(XRefMock, [{
    key: 'fetch',
    value: function fetch(ref) {
      return this._map[ref.toString()];
    }
  }, {
    key: 'fetchAsync',
    value: function fetchAsync(ref) {
      return Promise.resolve(this.fetch(ref));
    }
  }, {
    key: 'fetchIfRef',
    value: function fetchIfRef(obj) {
      if (!(0, _primitives.isRef)(obj)) {
        return obj;
      }
      return this.fetch(obj);
    }
  }, {
    key: 'fetchIfRefAsync',
    value: function fetchIfRefAsync(obj) {
      return Promise.resolve(this.fetchIfRef(obj));
    }
  }]);

  return XRefMock;
}();

exports.NodeFileReaderFactory = NodeFileReaderFactory;
exports.NodeCMapReaderFactory = NodeCMapReaderFactory;
exports.XRefMock = XRefMock;
exports.buildGetDocumentParams = buildGetDocumentParams;
exports.TEST_PDFS_PATH = TEST_PDFS_PATH;