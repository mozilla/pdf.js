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
exports.NetworkManager = exports.PDFNetworkStream = undefined;

var _util = require('../shared/util');

var _network_utils = require('./network_utils');

var _global_scope = require('../shared/global_scope');

var _global_scope2 = _interopRequireDefault(_global_scope);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

;
var OK_RESPONSE = 200;
var PARTIAL_CONTENT_RESPONSE = 206;
function NetworkManager(url, args) {
  this.url = url;
  args = args || {};
  this.isHttp = /^https?:/i.test(url);
  this.httpHeaders = this.isHttp && args.httpHeaders || {};
  this.withCredentials = args.withCredentials || false;
  this.getXhr = args.getXhr || function NetworkManager_getXhr() {
    return new XMLHttpRequest();
  };
  this.currXhrId = 0;
  this.pendingRequests = Object.create(null);
  this.loadedRequests = Object.create(null);
}
function getArrayBuffer(xhr) {
  var data = xhr.response;
  if (typeof data !== 'string') {
    return data;
  }
  var length = data.length;
  var array = new Uint8Array(length);
  for (var i = 0; i < length; i++) {
    array[i] = data.charCodeAt(i) & 0xFF;
  }
  return array.buffer;
}
var supportsMozChunked = function supportsMozChunkedClosure() {
  try {
    var x = new XMLHttpRequest();
    x.open('GET', _global_scope2.default.location.href);
    x.responseType = 'moz-chunked-arraybuffer';
    return x.responseType === 'moz-chunked-arraybuffer';
  } catch (e) {
    return false;
  }
}();
NetworkManager.prototype = {
  requestRange: function NetworkManager_requestRange(begin, end, listeners) {
    var args = {
      begin: begin,
      end: end
    };
    for (var prop in listeners) {
      args[prop] = listeners[prop];
    }
    return this.request(args);
  },
  requestFull: function NetworkManager_requestFull(listeners) {
    return this.request(listeners);
  },
  request: function NetworkManager_request(args) {
    var xhr = this.getXhr();
    var xhrId = this.currXhrId++;
    var pendingRequest = this.pendingRequests[xhrId] = { xhr: xhr };
    xhr.open('GET', this.url);
    xhr.withCredentials = this.withCredentials;
    for (var property in this.httpHeaders) {
      var value = this.httpHeaders[property];
      if (typeof value === 'undefined') {
        continue;
      }
      xhr.setRequestHeader(property, value);
    }
    if (this.isHttp && 'begin' in args && 'end' in args) {
      var rangeStr = args.begin + '-' + (args.end - 1);
      xhr.setRequestHeader('Range', 'bytes=' + rangeStr);
      pendingRequest.expectedStatus = 206;
    } else {
      pendingRequest.expectedStatus = 200;
    }
    var useMozChunkedLoading = supportsMozChunked && !!args.onProgressiveData;
    if (useMozChunkedLoading) {
      xhr.responseType = 'moz-chunked-arraybuffer';
      pendingRequest.onProgressiveData = args.onProgressiveData;
      pendingRequest.mozChunked = true;
    } else {
      xhr.responseType = 'arraybuffer';
    }
    if (args.onError) {
      xhr.onerror = function (evt) {
        args.onError(xhr.status);
      };
    }
    xhr.onreadystatechange = this.onStateChange.bind(this, xhrId);
    xhr.onprogress = this.onProgress.bind(this, xhrId);
    pendingRequest.onHeadersReceived = args.onHeadersReceived;
    pendingRequest.onDone = args.onDone;
    pendingRequest.onError = args.onError;
    pendingRequest.onProgress = args.onProgress;
    xhr.send(null);
    return xhrId;
  },
  onProgress: function NetworkManager_onProgress(xhrId, evt) {
    var pendingRequest = this.pendingRequests[xhrId];
    if (!pendingRequest) {
      return;
    }
    if (pendingRequest.mozChunked) {
      var chunk = getArrayBuffer(pendingRequest.xhr);
      pendingRequest.onProgressiveData(chunk);
    }
    var onProgress = pendingRequest.onProgress;
    if (onProgress) {
      onProgress(evt);
    }
  },
  onStateChange: function NetworkManager_onStateChange(xhrId, evt) {
    var pendingRequest = this.pendingRequests[xhrId];
    if (!pendingRequest) {
      return;
    }
    var xhr = pendingRequest.xhr;
    if (xhr.readyState >= 2 && pendingRequest.onHeadersReceived) {
      pendingRequest.onHeadersReceived();
      delete pendingRequest.onHeadersReceived;
    }
    if (xhr.readyState !== 4) {
      return;
    }
    if (!(xhrId in this.pendingRequests)) {
      return;
    }
    delete this.pendingRequests[xhrId];
    if (xhr.status === 0 && this.isHttp) {
      if (pendingRequest.onError) {
        pendingRequest.onError(xhr.status);
      }
      return;
    }
    var xhrStatus = xhr.status || OK_RESPONSE;
    var ok_response_on_range_request = xhrStatus === OK_RESPONSE && pendingRequest.expectedStatus === PARTIAL_CONTENT_RESPONSE;
    if (!ok_response_on_range_request && xhrStatus !== pendingRequest.expectedStatus) {
      if (pendingRequest.onError) {
        pendingRequest.onError(xhr.status);
      }
      return;
    }
    this.loadedRequests[xhrId] = true;
    var chunk = getArrayBuffer(xhr);
    if (xhrStatus === PARTIAL_CONTENT_RESPONSE) {
      var rangeHeader = xhr.getResponseHeader('Content-Range');
      var matches = /bytes (\d+)-(\d+)\/(\d+)/.exec(rangeHeader);
      var begin = parseInt(matches[1], 10);
      pendingRequest.onDone({
        begin: begin,
        chunk: chunk
      });
    } else if (pendingRequest.onProgressiveData) {
      pendingRequest.onDone(null);
    } else if (chunk) {
      pendingRequest.onDone({
        begin: 0,
        chunk: chunk
      });
    } else if (pendingRequest.onError) {
      pendingRequest.onError(xhr.status);
    }
  },
  hasPendingRequests: function NetworkManager_hasPendingRequests() {
    for (var xhrId in this.pendingRequests) {
      return true;
    }
    return false;
  },
  getRequestXhr: function NetworkManager_getXhr(xhrId) {
    return this.pendingRequests[xhrId].xhr;
  },
  isStreamingRequest: function NetworkManager_isStreamingRequest(xhrId) {
    return !!this.pendingRequests[xhrId].onProgressiveData;
  },
  isPendingRequest: function NetworkManager_isPendingRequest(xhrId) {
    return xhrId in this.pendingRequests;
  },
  isLoadedRequest: function NetworkManager_isLoadedRequest(xhrId) {
    return xhrId in this.loadedRequests;
  },
  abortAllRequests: function NetworkManager_abortAllRequests() {
    for (var xhrId in this.pendingRequests) {
      this.abortRequest(xhrId | 0);
    }
  },
  abortRequest: function NetworkManager_abortRequest(xhrId) {
    var xhr = this.pendingRequests[xhrId].xhr;
    delete this.pendingRequests[xhrId];
    xhr.abort();
  }
};
function PDFNetworkStream(options) {
  this._options = options;
  var source = options.source;
  this._manager = new NetworkManager(source.url, {
    httpHeaders: source.httpHeaders,
    withCredentials: source.withCredentials
  });
  this._rangeChunkSize = source.rangeChunkSize;
  this._fullRequestReader = null;
  this._rangeRequestReaders = [];
}
PDFNetworkStream.prototype = {
  _onRangeRequestReaderClosed: function PDFNetworkStream_onRangeRequestReaderClosed(reader) {
    var i = this._rangeRequestReaders.indexOf(reader);
    if (i >= 0) {
      this._rangeRequestReaders.splice(i, 1);
    }
  },
  getFullReader: function PDFNetworkStream_getFullReader() {
    (0, _util.assert)(!this._fullRequestReader);
    this._fullRequestReader = new PDFNetworkStreamFullRequestReader(this._manager, this._options);
    return this._fullRequestReader;
  },
  getRangeReader: function PDFNetworkStream_getRangeReader(begin, end) {
    var reader = new PDFNetworkStreamRangeRequestReader(this._manager, begin, end);
    reader.onClosed = this._onRangeRequestReaderClosed.bind(this);
    this._rangeRequestReaders.push(reader);
    return reader;
  },
  cancelAllRequests: function PDFNetworkStream_cancelAllRequests(reason) {
    if (this._fullRequestReader) {
      this._fullRequestReader.cancel(reason);
    }
    var readers = this._rangeRequestReaders.slice(0);
    readers.forEach(function (reader) {
      reader.cancel(reason);
    });
  }
};
function PDFNetworkStreamFullRequestReader(manager, options) {
  this._manager = manager;
  var source = options.source;
  var args = {
    onHeadersReceived: this._onHeadersReceived.bind(this),
    onProgressiveData: source.disableStream ? null : this._onProgressiveData.bind(this),
    onDone: this._onDone.bind(this),
    onError: this._onError.bind(this),
    onProgress: this._onProgress.bind(this)
  };
  this._url = source.url;
  this._fullRequestId = manager.requestFull(args);
  this._headersReceivedCapability = (0, _util.createPromiseCapability)();
  this._disableRange = options.disableRange || false;
  this._contentLength = source.length;
  this._rangeChunkSize = source.rangeChunkSize;
  if (!this._rangeChunkSize && !this._disableRange) {
    this._disableRange = true;
  }
  this._isStreamingSupported = false;
  this._isRangeSupported = false;
  this._cachedChunks = [];
  this._requests = [];
  this._done = false;
  this._storedError = undefined;
  this.onProgress = null;
}
PDFNetworkStreamFullRequestReader.prototype = {
  _onHeadersReceived: function PDFNetworkStreamFullRequestReader_onHeadersReceived() {
    var fullRequestXhrId = this._fullRequestId;
    var fullRequestXhr = this._manager.getRequestXhr(fullRequestXhrId);

    var _validateRangeRequest = (0, _network_utils.validateRangeRequestCapabilities)({
      getResponseHeader: function getResponseHeader(name) {
        return fullRequestXhr.getResponseHeader(name);
      },
      isHttp: this._manager.isHttp,
      rangeChunkSize: this._rangeChunkSize,
      disableRange: this._disableRange
    }),
        allowRangeRequests = _validateRangeRequest.allowRangeRequests,
        suggestedLength = _validateRangeRequest.suggestedLength;

    this._contentLength = suggestedLength || this._contentLength;
    if (allowRangeRequests) {
      this._isRangeSupported = true;
    }
    var networkManager = this._manager;
    if (networkManager.isStreamingRequest(fullRequestXhrId)) {
      this._isStreamingSupported = true;
    } else if (this._isRangeSupported) {
      networkManager.abortRequest(fullRequestXhrId);
    }
    this._headersReceivedCapability.resolve();
  },
  _onProgressiveData: function PDFNetworkStreamFullRequestReader_onProgressiveData(chunk) {
    if (this._requests.length > 0) {
      var requestCapability = this._requests.shift();
      requestCapability.resolve({
        value: chunk,
        done: false
      });
    } else {
      this._cachedChunks.push(chunk);
    }
  },
  _onDone: function PDFNetworkStreamFullRequestReader_onDone(args) {
    if (args) {
      this._onProgressiveData(args.chunk);
    }
    this._done = true;
    if (this._cachedChunks.length > 0) {
      return;
    }
    this._requests.forEach(function (requestCapability) {
      requestCapability.resolve({
        value: undefined,
        done: true
      });
    });
    this._requests = [];
  },
  _onError: function PDFNetworkStreamFullRequestReader_onError(status) {
    var url = this._url;
    var exception = (0, _network_utils.createResponseStatusError)(status, url);
    this._storedError = exception;
    this._headersReceivedCapability.reject(exception);
    this._requests.forEach(function (requestCapability) {
      requestCapability.reject(exception);
    });
    this._requests = [];
    this._cachedChunks = [];
  },
  _onProgress: function PDFNetworkStreamFullRequestReader_onProgress(data) {
    if (this.onProgress) {
      this.onProgress({
        loaded: data.loaded,
        total: data.lengthComputable ? data.total : this._contentLength
      });
    }
  },
  get isRangeSupported() {
    return this._isRangeSupported;
  },
  get isStreamingSupported() {
    return this._isStreamingSupported;
  },
  get contentLength() {
    return this._contentLength;
  },
  get headersReady() {
    return this._headersReceivedCapability.promise;
  },
  read: function PDFNetworkStreamFullRequestReader_read() {
    if (this._storedError) {
      return Promise.reject(this._storedError);
    }
    if (this._cachedChunks.length > 0) {
      var chunk = this._cachedChunks.shift();
      return Promise.resolve({
        value: chunk,
        done: false
      });
    }
    if (this._done) {
      return Promise.resolve({
        value: undefined,
        done: true
      });
    }
    var requestCapability = (0, _util.createPromiseCapability)();
    this._requests.push(requestCapability);
    return requestCapability.promise;
  },
  cancel: function PDFNetworkStreamFullRequestReader_cancel(reason) {
    this._done = true;
    this._headersReceivedCapability.reject(reason);
    this._requests.forEach(function (requestCapability) {
      requestCapability.resolve({
        value: undefined,
        done: true
      });
    });
    this._requests = [];
    if (this._manager.isPendingRequest(this._fullRequestId)) {
      this._manager.abortRequest(this._fullRequestId);
    }
    this._fullRequestReader = null;
  }
};
function PDFNetworkStreamRangeRequestReader(manager, begin, end) {
  this._manager = manager;
  var args = {
    onDone: this._onDone.bind(this),
    onProgress: this._onProgress.bind(this)
  };
  this._requestId = manager.requestRange(begin, end, args);
  this._requests = [];
  this._queuedChunk = null;
  this._done = false;
  this.onProgress = null;
  this.onClosed = null;
}
PDFNetworkStreamRangeRequestReader.prototype = {
  _close: function PDFNetworkStreamRangeRequestReader_close() {
    if (this.onClosed) {
      this.onClosed(this);
    }
  },
  _onDone: function PDFNetworkStreamRangeRequestReader_onDone(data) {
    var chunk = data.chunk;
    if (this._requests.length > 0) {
      var requestCapability = this._requests.shift();
      requestCapability.resolve({
        value: chunk,
        done: false
      });
    } else {
      this._queuedChunk = chunk;
    }
    this._done = true;
    this._requests.forEach(function (requestCapability) {
      requestCapability.resolve({
        value: undefined,
        done: true
      });
    });
    this._requests = [];
    this._close();
  },
  _onProgress: function PDFNetworkStreamRangeRequestReader_onProgress(evt) {
    if (!this.isStreamingSupported && this.onProgress) {
      this.onProgress({ loaded: evt.loaded });
    }
  },
  get isStreamingSupported() {
    return false;
  },
  read: function PDFNetworkStreamRangeRequestReader_read() {
    if (this._queuedChunk !== null) {
      var chunk = this._queuedChunk;
      this._queuedChunk = null;
      return Promise.resolve({
        value: chunk,
        done: false
      });
    }
    if (this._done) {
      return Promise.resolve({
        value: undefined,
        done: true
      });
    }
    var requestCapability = (0, _util.createPromiseCapability)();
    this._requests.push(requestCapability);
    return requestCapability.promise;
  },
  cancel: function PDFNetworkStreamRangeRequestReader_cancel(reason) {
    this._done = true;
    this._requests.forEach(function (requestCapability) {
      requestCapability.resolve({
        value: undefined,
        done: true
      });
    });
    this._requests = [];
    if (this._manager.isPendingRequest(this._requestId)) {
      this._manager.abortRequest(this._requestId);
    }
    this._close();
  }
};
exports.PDFNetworkStream = PDFNetworkStream;
exports.NetworkManager = NetworkManager;