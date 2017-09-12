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
exports.PDFNodeStream = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _util = require('../shared/util');

var _network_utils = require('./network_utils');

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var fs = require('fs');
var http = require('http');
var https = require('https');
var url = require('url');

var PDFNodeStream = function () {
  function PDFNodeStream(options) {
    _classCallCheck(this, PDFNodeStream);

    this.options = options;
    this.source = options.source;
    this.url = url.parse(this.source.url);
    this.isHttp = this.url.protocol === 'http:' || this.url.protocol === 'https:';
    this.isFsUrl = this.url.protocol === 'file:' || !this.url.host;
    this.httpHeaders = this.isHttp && this.source.httpHeaders || {};
    this._fullRequest = null;
    this._rangeRequestReaders = [];
  }

  _createClass(PDFNodeStream, [{
    key: 'getFullReader',
    value: function getFullReader() {
      (0, _util.assert)(!this._fullRequest);
      this._fullRequest = this.isFsUrl ? new PDFNodeStreamFsFullReader(this) : new PDFNodeStreamFullReader(this);
      return this._fullRequest;
    }
  }, {
    key: 'getRangeReader',
    value: function getRangeReader(start, end) {
      var rangeReader = this.isFsUrl ? new PDFNodeStreamFsRangeReader(this, start, end) : new PDFNodeStreamRangeReader(this, start, end);
      this._rangeRequestReaders.push(rangeReader);
      return rangeReader;
    }
  }, {
    key: 'cancelAllRequests',
    value: function cancelAllRequests(reason) {
      if (this._fullRequest) {
        this._fullRequest.cancel(reason);
      }
      var readers = this._rangeRequestReaders.slice(0);
      readers.forEach(function (reader) {
        reader.cancel(reason);
      });
    }
  }]);

  return PDFNodeStream;
}();

var BaseFullReader = function () {
  function BaseFullReader(stream) {
    _classCallCheck(this, BaseFullReader);

    this._url = stream.url;
    this._done = false;
    this._errored = false;
    this._reason = null;
    this.onProgress = null;
    this._contentLength = stream.source.length;
    this._loaded = 0;
    this._disableRange = stream.options.disableRange || false;
    this._rangeChunkSize = stream.source.rangeChunkSize;
    if (!this._rangeChunkSize && !this._disableRange) {
      this._disableRange = true;
    }
    this._isStreamingSupported = !stream.source.disableStream;
    this._isRangeSupported = !stream.options.disableRange;
    this._readableStream = null;
    this._readCapability = (0, _util.createPromiseCapability)();
    this._headersCapability = (0, _util.createPromiseCapability)();
  }

  _createClass(BaseFullReader, [{
    key: 'read',
    value: function read() {
      var _this = this;

      return this._readCapability.promise.then(function () {
        if (_this._done) {
          return Promise.resolve({
            value: undefined,
            done: true
          });
        }
        if (_this._errored) {
          return Promise.reject(_this._reason);
        }
        var chunk = _this._readableStream.read();
        if (chunk === null) {
          _this._readCapability = (0, _util.createPromiseCapability)();
          return _this.read();
        }
        _this._loaded += chunk.length;
        if (_this.onProgress) {
          _this.onProgress({
            loaded: _this._loaded,
            total: _this._contentLength
          });
        }
        var buffer = new Uint8Array(chunk).buffer;
        return Promise.resolve({
          value: buffer,
          done: false
        });
      });
    }
  }, {
    key: 'cancel',
    value: function cancel(reason) {
      if (!this._readableStream) {
        this._error(reason);
        return;
      }
      this._readableStream.destroy(reason);
    }
  }, {
    key: '_error',
    value: function _error(reason) {
      this._errored = true;
      this._reason = reason;
      this._readCapability.resolve();
    }
  }, {
    key: '_setReadableStream',
    value: function _setReadableStream(readableStream) {
      var _this2 = this;

      this._readableStream = readableStream;
      readableStream.on('readable', function () {
        _this2._readCapability.resolve();
      });
      readableStream.on('end', function () {
        readableStream.destroy();
        _this2._done = true;
        _this2._readCapability.resolve();
      });
      readableStream.on('error', function (reason) {
        _this2._error(reason);
      });
      if (!this._isStreamingSupported && this._isRangeSupported) {
        this._error(new _util.AbortException('streaming is disabled'));
      }
      if (this._errored) {
        this._readableStream.destroy(this._reason);
      }
    }
  }, {
    key: 'headersReady',
    get: function get() {
      return this._headersCapability.promise;
    }
  }, {
    key: 'contentLength',
    get: function get() {
      return this._contentLength;
    }
  }, {
    key: 'isRangeSupported',
    get: function get() {
      return this._isRangeSupported;
    }
  }, {
    key: 'isStreamingSupported',
    get: function get() {
      return this._isStreamingSupported;
    }
  }]);

  return BaseFullReader;
}();

var BaseRangeReader = function () {
  function BaseRangeReader(stream) {
    _classCallCheck(this, BaseRangeReader);

    this._url = stream.url;
    this._done = false;
    this._errored = false;
    this._reason = null;
    this.onProgress = null;
    this._loaded = 0;
    this._readableStream = null;
    this._readCapability = (0, _util.createPromiseCapability)();
    this._isStreamingSupported = !stream.source.disableStream;
  }

  _createClass(BaseRangeReader, [{
    key: 'read',
    value: function read() {
      var _this3 = this;

      return this._readCapability.promise.then(function () {
        if (_this3._done) {
          return Promise.resolve({
            value: undefined,
            done: true
          });
        }
        if (_this3._errored) {
          return Promise.reject(_this3._reason);
        }
        var chunk = _this3._readableStream.read();
        if (chunk === null) {
          _this3._readCapability = (0, _util.createPromiseCapability)();
          return _this3.read();
        }
        _this3._loaded += chunk.length;
        if (_this3.onProgress) {
          _this3.onProgress({ loaded: _this3._loaded });
        }
        var buffer = new Uint8Array(chunk).buffer;
        return Promise.resolve({
          value: buffer,
          done: false
        });
      });
    }
  }, {
    key: 'cancel',
    value: function cancel(reason) {
      if (!this._readableStream) {
        this._error(reason);
        return;
      }
      this._readableStream.destroy(reason);
    }
  }, {
    key: '_error',
    value: function _error(reason) {
      this._errored = true;
      this._reason = reason;
      this._readCapability.resolve();
    }
  }, {
    key: '_setReadableStream',
    value: function _setReadableStream(readableStream) {
      var _this4 = this;

      this._readableStream = readableStream;
      readableStream.on('readable', function () {
        _this4._readCapability.resolve();
      });
      readableStream.on('end', function () {
        readableStream.destroy();
        _this4._done = true;
        _this4._readCapability.resolve();
      });
      readableStream.on('error', function (reason) {
        _this4._error(reason);
      });
      if (this._errored) {
        this._readableStream.destroy(this._reason);
      }
    }
  }, {
    key: 'isStreamingSupported',
    get: function get() {
      return this._isStreamingSupported;
    }
  }]);

  return BaseRangeReader;
}();

function createRequestOptions(url, headers) {
  return {
    protocol: url.protocol,
    auth: url.auth,
    host: url.hostname,
    port: url.port,
    path: url.path,
    method: 'GET',
    headers: headers
  };
}

var PDFNodeStreamFullReader = function (_BaseFullReader) {
  _inherits(PDFNodeStreamFullReader, _BaseFullReader);

  function PDFNodeStreamFullReader(stream) {
    _classCallCheck(this, PDFNodeStreamFullReader);

    var _this5 = _possibleConstructorReturn(this, (PDFNodeStreamFullReader.__proto__ || Object.getPrototypeOf(PDFNodeStreamFullReader)).call(this, stream));

    var handleResponse = function handleResponse(response) {
      _this5._headersCapability.resolve();
      _this5._setReadableStream(response);

      var _validateRangeRequest = (0, _network_utils.validateRangeRequestCapabilities)({
        getResponseHeader: function getResponseHeader(name) {
          return _this5._readableStream.headers[name.toLowerCase()];
        },
        isHttp: stream.isHttp,
        rangeChunkSize: _this5._rangeChunkSize,
        disableRange: _this5._disableRange
      }),
          allowRangeRequests = _validateRangeRequest.allowRangeRequests,
          suggestedLength = _validateRangeRequest.suggestedLength;

      if (allowRangeRequests) {
        _this5._isRangeSupported = true;
      }
      _this5._contentLength = suggestedLength;
    };
    _this5._request = null;
    if (_this5._url.protocol === 'http:') {
      _this5._request = http.request(createRequestOptions(_this5._url, stream.httpHeaders), handleResponse);
    } else {
      _this5._request = https.request(createRequestOptions(_this5._url, stream.httpHeaders), handleResponse);
    }
    _this5._request.on('error', function (reason) {
      _this5._errored = true;
      _this5._reason = reason;
      _this5._headersCapability.reject(reason);
    });
    _this5._request.end();
    return _this5;
  }

  return PDFNodeStreamFullReader;
}(BaseFullReader);

var PDFNodeStreamRangeReader = function (_BaseRangeReader) {
  _inherits(PDFNodeStreamRangeReader, _BaseRangeReader);

  function PDFNodeStreamRangeReader(stream, start, end) {
    _classCallCheck(this, PDFNodeStreamRangeReader);

    var _this6 = _possibleConstructorReturn(this, (PDFNodeStreamRangeReader.__proto__ || Object.getPrototypeOf(PDFNodeStreamRangeReader)).call(this, stream));

    _this6._httpHeaders = {};
    for (var property in stream.httpHeaders) {
      var value = stream.httpHeaders[property];
      if (typeof value === 'undefined') {
        continue;
      }
      _this6._httpHeaders[property] = value;
    }
    _this6._httpHeaders['Range'] = 'bytes=' + start + '-' + (end - 1);
    _this6._request = null;
    if (_this6._url.protocol === 'http:') {
      _this6._request = http.request(createRequestOptions(_this6._url, _this6._httpHeaders), function (response) {
        _this6._setReadableStream(response);
      });
    } else {
      _this6._request = https.request(createRequestOptions(_this6._url, _this6._httpHeaders), function (response) {
        _this6._setReadableStream(response);
      });
    }
    _this6._request.on('error', function (reason) {
      _this6._errored = true;
      _this6._reason = reason;
    });
    _this6._request.end();
    return _this6;
  }

  return PDFNodeStreamRangeReader;
}(BaseRangeReader);

var PDFNodeStreamFsFullReader = function (_BaseFullReader2) {
  _inherits(PDFNodeStreamFsFullReader, _BaseFullReader2);

  function PDFNodeStreamFsFullReader(stream) {
    _classCallCheck(this, PDFNodeStreamFsFullReader);

    var _this7 = _possibleConstructorReturn(this, (PDFNodeStreamFsFullReader.__proto__ || Object.getPrototypeOf(PDFNodeStreamFsFullReader)).call(this, stream));

    fs.lstat(_this7._url.path, function (error, stat) {
      if (error) {
        _this7._errored = true;
        _this7._reason = error;
        _this7._headersCapability.reject(error);
        return;
      }
      _this7._contentLength = stat.size;
      _this7._setReadableStream(fs.createReadStream(_this7._url.path));
      _this7._headersCapability.resolve();
    });
    return _this7;
  }

  return PDFNodeStreamFsFullReader;
}(BaseFullReader);

var PDFNodeStreamFsRangeReader = function (_BaseRangeReader2) {
  _inherits(PDFNodeStreamFsRangeReader, _BaseRangeReader2);

  function PDFNodeStreamFsRangeReader(stream, start, end) {
    _classCallCheck(this, PDFNodeStreamFsRangeReader);

    var _this8 = _possibleConstructorReturn(this, (PDFNodeStreamFsRangeReader.__proto__ || Object.getPrototypeOf(PDFNodeStreamFsRangeReader)).call(this, stream));

    _this8._setReadableStream(fs.createReadStream(_this8._url.path, {
      start: start,
      end: end - 1
    }));
    return _this8;
  }

  return PDFNodeStreamFsRangeReader;
}(BaseRangeReader);

exports.PDFNodeStream = PDFNodeStream;