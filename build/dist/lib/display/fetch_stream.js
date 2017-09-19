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
exports.PDFFetchStream = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _util = require('../shared/util');

var _network_utils = require('./network_utils');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function createFetchOptions(headers, withCredentials) {
  return {
    method: 'GET',
    headers: headers,
    mode: 'cors',
    credentials: withCredentials ? 'include' : 'omit',
    redirect: 'follow'
  };
}

var PDFFetchStream = function () {
  function PDFFetchStream(options) {
    _classCallCheck(this, PDFFetchStream);

    this.options = options;
    this.source = options.source;
    this.isHttp = /^https?:/i.test(this.source.url);
    this.httpHeaders = this.isHttp && this.source.httpHeaders || {};
    this._fullRequestReader = null;
    this._rangeRequestReaders = [];
  }

  _createClass(PDFFetchStream, [{
    key: 'getFullReader',
    value: function getFullReader() {
      (0, _util.assert)(!this._fullRequestReader);
      this._fullRequestReader = new PDFFetchStreamReader(this);
      return this._fullRequestReader;
    }
  }, {
    key: 'getRangeReader',
    value: function getRangeReader(begin, end) {
      var reader = new PDFFetchStreamRangeReader(this, begin, end);
      this._rangeRequestReaders.push(reader);
      return reader;
    }
  }, {
    key: 'cancelAllRequests',
    value: function cancelAllRequests(reason) {
      if (this._fullRequestReader) {
        this._fullRequestReader.cancel(reason);
      }
      var readers = this._rangeRequestReaders.slice(0);
      readers.forEach(function (reader) {
        reader.cancel(reason);
      });
    }
  }]);

  return PDFFetchStream;
}();

var PDFFetchStreamReader = function () {
  function PDFFetchStreamReader(stream) {
    var _this = this;

    _classCallCheck(this, PDFFetchStreamReader);

    this._stream = stream;
    this._reader = null;
    this._loaded = 0;
    this._withCredentials = stream.source.withCredentials;
    this._contentLength = this._stream.source.length;
    this._headersCapability = (0, _util.createPromiseCapability)();
    this._disableRange = this._stream.options.disableRange;
    this._rangeChunkSize = this._stream.source.rangeChunkSize;
    if (!this._rangeChunkSize && !this._disableRange) {
      this._disableRange = true;
    }
    this._isRangeSupported = !this._stream.options.disableRange;
    this._isStreamingSupported = !this._stream.source.disableStream;
    this._headers = new Headers();
    for (var property in this._stream.httpHeaders) {
      var value = this._stream.httpHeaders[property];
      if (typeof value === 'undefined') {
        continue;
      }
      this._headers.append(property, value);
    }
    var url = this._stream.source.url;
    fetch(url, createFetchOptions(this._headers, this._withCredentials)).then(function (response) {
      if (!(0, _network_utils.validateResponseStatus)(response.status)) {
        throw (0, _network_utils.createResponseStatusError)(response.status, url);
      }
      _this._reader = response.body.getReader();
      _this._headersCapability.resolve();

      var _validateRangeRequest = (0, _network_utils.validateRangeRequestCapabilities)({
        getResponseHeader: function getResponseHeader(name) {
          return response.headers.get(name);
        },
        isHttp: _this._stream.isHttp,
        rangeChunkSize: _this._rangeChunkSize,
        disableRange: _this._disableRange
      }),
          allowRangeRequests = _validateRangeRequest.allowRangeRequests,
          suggestedLength = _validateRangeRequest.suggestedLength;

      _this._contentLength = suggestedLength;
      _this._isRangeSupported = allowRangeRequests;
      if (!_this._isStreamingSupported && _this._isRangeSupported) {
        _this.cancel(new _util.AbortException('streaming is disabled'));
      }
    }).catch(this._headersCapability.reject);
    this.onProgress = null;
  }

  _createClass(PDFFetchStreamReader, [{
    key: 'read',
    value: function read() {
      var _this2 = this;

      return this._headersCapability.promise.then(function () {
        return _this2._reader.read().then(function (_ref) {
          var value = _ref.value,
              done = _ref.done;

          if (done) {
            return Promise.resolve({
              value: value,
              done: done
            });
          }
          _this2._loaded += value.byteLength;
          if (_this2.onProgress) {
            _this2.onProgress({
              loaded: _this2._loaded,
              total: _this2._contentLength
            });
          }
          var buffer = new Uint8Array(value).buffer;
          return Promise.resolve({
            value: buffer,
            done: false
          });
        });
      });
    }
  }, {
    key: 'cancel',
    value: function cancel(reason) {
      if (this._reader) {
        this._reader.cancel(reason);
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

  return PDFFetchStreamReader;
}();

var PDFFetchStreamRangeReader = function () {
  function PDFFetchStreamRangeReader(stream, begin, end) {
    var _this3 = this;

    _classCallCheck(this, PDFFetchStreamRangeReader);

    this._stream = stream;
    this._reader = null;
    this._loaded = 0;
    this._withCredentials = stream.source.withCredentials;
    this._readCapability = (0, _util.createPromiseCapability)();
    this._isStreamingSupported = !stream.source.disableStream;
    this._headers = new Headers();
    for (var property in this._stream.httpHeaders) {
      var value = this._stream.httpHeaders[property];
      if (typeof value === 'undefined') {
        continue;
      }
      this._headers.append(property, value);
    }
    var rangeStr = begin + '-' + (end - 1);
    this._headers.append('Range', 'bytes=' + rangeStr);
    var url = this._stream.source.url;
    fetch(url, createFetchOptions(this._headers, this._withCredentials)).then(function (response) {
      if (!(0, _network_utils.validateResponseStatus)(response.status)) {
        throw (0, _network_utils.createResponseStatusError)(response.status, url);
      }
      _this3._readCapability.resolve();
      _this3._reader = response.body.getReader();
    });
    this.onProgress = null;
  }

  _createClass(PDFFetchStreamRangeReader, [{
    key: 'read',
    value: function read() {
      var _this4 = this;

      return this._readCapability.promise.then(function () {
        return _this4._reader.read().then(function (_ref2) {
          var value = _ref2.value,
              done = _ref2.done;

          if (done) {
            return Promise.resolve({
              value: value,
              done: done
            });
          }
          _this4._loaded += value.byteLength;
          if (_this4.onProgress) {
            _this4.onProgress({ loaded: _this4._loaded });
          }
          var buffer = new Uint8Array(value).buffer;
          return Promise.resolve({
            value: buffer,
            done: false
          });
        });
      });
    }
  }, {
    key: 'cancel',
    value: function cancel(reason) {
      if (this._reader) {
        this._reader.cancel(reason);
      }
    }
  }, {
    key: 'isStreamingSupported',
    get: function get() {
      return this._isStreamingSupported;
    }
  }]);

  return PDFFetchStreamRangeReader;
}();

exports.PDFFetchStream = PDFFetchStream;