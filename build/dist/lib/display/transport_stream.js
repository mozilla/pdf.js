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
exports.PDFDataTransportStream = undefined;

var _util = require('../shared/util');

var PDFDataTransportStream = function PDFDataTransportStreamClosure() {
  function PDFDataTransportStream(params, pdfDataRangeTransport) {
    var _this = this;

    (0, _util.assert)(pdfDataRangeTransport);
    this._queuedChunks = [];
    var initialData = params.initialData;
    if (initialData && initialData.length > 0) {
      var buffer = new Uint8Array(initialData).buffer;
      this._queuedChunks.push(buffer);
    }
    this._pdfDataRangeTransport = pdfDataRangeTransport;
    this._isRangeSupported = !params.disableRange;
    this._isStreamingSupported = !params.disableStream;
    this._contentLength = params.length;
    this._fullRequestReader = null;
    this._rangeReaders = [];
    this._pdfDataRangeTransport.addRangeListener(function (begin, chunk) {
      _this._onReceiveData({
        begin: begin,
        chunk: chunk
      });
    });
    this._pdfDataRangeTransport.addProgressListener(function (loaded) {
      _this._onProgress({ loaded: loaded });
    });
    this._pdfDataRangeTransport.addProgressiveReadListener(function (chunk) {
      _this._onReceiveData({ chunk: chunk });
    });
    this._pdfDataRangeTransport.transportReady();
  }
  PDFDataTransportStream.prototype = {
    _onReceiveData: function PDFDataTransportStream_onReceiveData(args) {
      var buffer = new Uint8Array(args.chunk).buffer;
      if (args.begin === undefined) {
        if (this._fullRequestReader) {
          this._fullRequestReader._enqueue(buffer);
        } else {
          this._queuedChunks.push(buffer);
        }
      } else {
        var found = this._rangeReaders.some(function (rangeReader) {
          if (rangeReader._begin !== args.begin) {
            return false;
          }
          rangeReader._enqueue(buffer);
          return true;
        });
        (0, _util.assert)(found);
      }
    },
    _onProgress: function PDFDataTransportStream_onDataProgress(evt) {
      if (this._rangeReaders.length > 0) {
        var firstReader = this._rangeReaders[0];
        if (firstReader.onProgress) {
          firstReader.onProgress({ loaded: evt.loaded });
        }
      }
    },
    _removeRangeReader: function PDFDataTransportStream_removeRangeReader(reader) {
      var i = this._rangeReaders.indexOf(reader);
      if (i >= 0) {
        this._rangeReaders.splice(i, 1);
      }
    },
    getFullReader: function PDFDataTransportStream_getFullReader() {
      (0, _util.assert)(!this._fullRequestReader);
      var queuedChunks = this._queuedChunks;
      this._queuedChunks = null;
      return new PDFDataTransportStreamReader(this, queuedChunks);
    },
    getRangeReader: function PDFDataTransportStream_getRangeReader(begin, end) {
      var reader = new PDFDataTransportStreamRangeReader(this, begin, end);
      this._pdfDataRangeTransport.requestDataRange(begin, end);
      this._rangeReaders.push(reader);
      return reader;
    },
    cancelAllRequests: function PDFDataTransportStream_cancelAllRequests(reason) {
      if (this._fullRequestReader) {
        this._fullRequestReader.cancel(reason);
      }
      var readers = this._rangeReaders.slice(0);
      readers.forEach(function (rangeReader) {
        rangeReader.cancel(reason);
      });
      this._pdfDataRangeTransport.abort();
    }
  };
  function PDFDataTransportStreamReader(stream, queuedChunks) {
    this._stream = stream;
    this._done = false;
    this._queuedChunks = queuedChunks || [];
    this._requests = [];
    this._headersReady = Promise.resolve();
    stream._fullRequestReader = this;
    this.onProgress = null;
  }
  PDFDataTransportStreamReader.prototype = {
    _enqueue: function PDFDataTransportStreamReader_enqueue(chunk) {
      if (this._done) {
        return;
      }
      if (this._requests.length > 0) {
        var requestCapability = this._requests.shift();
        requestCapability.resolve({
          value: chunk,
          done: false
        });
        return;
      }
      this._queuedChunks.push(chunk);
    },
    get headersReady() {
      return this._headersReady;
    },
    get isRangeSupported() {
      return this._stream._isRangeSupported;
    },
    get isStreamingSupported() {
      return this._stream._isStreamingSupported;
    },
    get contentLength() {
      return this._stream._contentLength;
    },
    read: function PDFDataTransportStreamReader_read() {
      if (this._queuedChunks.length > 0) {
        var chunk = this._queuedChunks.shift();
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
    cancel: function PDFDataTransportStreamReader_cancel(reason) {
      this._done = true;
      this._requests.forEach(function (requestCapability) {
        requestCapability.resolve({
          value: undefined,
          done: true
        });
      });
      this._requests = [];
    }
  };
  function PDFDataTransportStreamRangeReader(stream, begin, end) {
    this._stream = stream;
    this._begin = begin;
    this._end = end;
    this._queuedChunk = null;
    this._requests = [];
    this._done = false;
    this.onProgress = null;
  }
  PDFDataTransportStreamRangeReader.prototype = {
    _enqueue: function PDFDataTransportStreamRangeReader_enqueue(chunk) {
      if (this._done) {
        return;
      }
      if (this._requests.length === 0) {
        this._queuedChunk = chunk;
      } else {
        var requestsCapability = this._requests.shift();
        requestsCapability.resolve({
          value: chunk,
          done: false
        });
        this._requests.forEach(function (requestCapability) {
          requestCapability.resolve({
            value: undefined,
            done: true
          });
        });
        this._requests = [];
      }
      this._done = true;
      this._stream._removeRangeReader(this);
    },
    get isStreamingSupported() {
      return false;
    },
    read: function PDFDataTransportStreamRangeReader_read() {
      if (this._queuedChunk) {
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
    cancel: function PDFDataTransportStreamRangeReader_cancel(reason) {
      this._done = true;
      this._requests.forEach(function (requestCapability) {
        requestCapability.resolve({
          value: undefined,
          done: true
        });
      });
      this._requests = [];
      this._stream._removeRangeReader(this);
    }
  };
  return PDFDataTransportStream;
}();
exports.PDFDataTransportStream = PDFDataTransportStream;