/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2020 Mozilla Foundation
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
exports.PDFDataTransportStream = void 0;

var _util = require("../shared/util.js");

class PDFDataTransportStream {
  constructor(params, pdfDataRangeTransport) {
    (0, _util.assert)(pdfDataRangeTransport);
    this._queuedChunks = [];
    this._progressiveDone = params.progressiveDone || false;
    const initialData = params.initialData;

    if (initialData && initialData.length > 0) {
      const buffer = new Uint8Array(initialData).buffer;

      this._queuedChunks.push(buffer);
    }

    this._pdfDataRangeTransport = pdfDataRangeTransport;
    this._isStreamingSupported = !params.disableStream;
    this._isRangeSupported = !params.disableRange;
    this._contentLength = params.length;
    this._fullRequestReader = null;
    this._rangeReaders = [];

    this._pdfDataRangeTransport.addRangeListener((begin, chunk) => {
      this._onReceiveData({
        begin,
        chunk
      });
    });

    this._pdfDataRangeTransport.addProgressListener((loaded, total) => {
      this._onProgress({
        loaded,
        total
      });
    });

    this._pdfDataRangeTransport.addProgressiveReadListener(chunk => {
      this._onReceiveData({
        chunk
      });
    });

    this._pdfDataRangeTransport.addProgressiveDoneListener(() => {
      this._onProgressiveDone();
    });

    this._pdfDataRangeTransport.transportReady();
  }

  _onReceiveData(args) {
    const buffer = new Uint8Array(args.chunk).buffer;

    if (args.begin === undefined) {
      if (this._fullRequestReader) {
        this._fullRequestReader._enqueue(buffer);
      } else {
        this._queuedChunks.push(buffer);
      }
    } else {
      const found = this._rangeReaders.some(function (rangeReader) {
        if (rangeReader._begin !== args.begin) {
          return false;
        }

        rangeReader._enqueue(buffer);

        return true;
      });

      (0, _util.assert)(found);
    }
  }

  get _progressiveDataLength() {
    return this._fullRequestReader ? this._fullRequestReader._loaded : 0;
  }

  _onProgress(evt) {
    if (evt.total === undefined) {
      const firstReader = this._rangeReaders[0];

      if (firstReader && firstReader.onProgress) {
        firstReader.onProgress({
          loaded: evt.loaded
        });
      }
    } else {
      const fullReader = this._fullRequestReader;

      if (fullReader && fullReader.onProgress) {
        fullReader.onProgress({
          loaded: evt.loaded,
          total: evt.total
        });
      }
    }
  }

  _onProgressiveDone() {
    if (this._fullRequestReader) {
      this._fullRequestReader.progressiveDone();
    }

    this._progressiveDone = true;
  }

  _removeRangeReader(reader) {
    const i = this._rangeReaders.indexOf(reader);

    if (i >= 0) {
      this._rangeReaders.splice(i, 1);
    }
  }

  getFullReader() {
    (0, _util.assert)(!this._fullRequestReader);
    const queuedChunks = this._queuedChunks;
    this._queuedChunks = null;
    return new PDFDataTransportStreamReader(this, queuedChunks, this._progressiveDone);
  }

  getRangeReader(begin, end) {
    if (end <= this._progressiveDataLength) {
      return null;
    }

    const reader = new PDFDataTransportStreamRangeReader(this, begin, end);

    this._pdfDataRangeTransport.requestDataRange(begin, end);

    this._rangeReaders.push(reader);

    return reader;
  }

  cancelAllRequests(reason) {
    if (this._fullRequestReader) {
      this._fullRequestReader.cancel(reason);
    }

    const readers = this._rangeReaders.slice(0);

    readers.forEach(function (rangeReader) {
      rangeReader.cancel(reason);
    });

    this._pdfDataRangeTransport.abort();
  }

}

exports.PDFDataTransportStream = PDFDataTransportStream;

class PDFDataTransportStreamReader {
  constructor(stream, queuedChunks, progressiveDone = false) {
    this._stream = stream;
    this._done = progressiveDone || false;
    this._filename = null;
    this._queuedChunks = queuedChunks || [];
    this._loaded = 0;

    for (const chunk of this._queuedChunks) {
      this._loaded += chunk.byteLength;
    }

    this._requests = [];
    this._headersReady = Promise.resolve();
    stream._fullRequestReader = this;
    this.onProgress = null;
  }

  _enqueue(chunk) {
    if (this._done) {
      return;
    }

    if (this._requests.length > 0) {
      const requestCapability = this._requests.shift();

      requestCapability.resolve({
        value: chunk,
        done: false
      });
    } else {
      this._queuedChunks.push(chunk);
    }

    this._loaded += chunk.byteLength;
  }

  get headersReady() {
    return this._headersReady;
  }

  get filename() {
    return this._filename;
  }

  get isRangeSupported() {
    return this._stream._isRangeSupported;
  }

  get isStreamingSupported() {
    return this._stream._isStreamingSupported;
  }

  get contentLength() {
    return this._stream._contentLength;
  }

  async read() {
    if (this._queuedChunks.length > 0) {
      const chunk = this._queuedChunks.shift();

      return {
        value: chunk,
        done: false
      };
    }

    if (this._done) {
      return {
        value: undefined,
        done: true
      };
    }

    const requestCapability = (0, _util.createPromiseCapability)();

    this._requests.push(requestCapability);

    return requestCapability.promise;
  }

  cancel(reason) {
    this._done = true;

    this._requests.forEach(function (requestCapability) {
      requestCapability.resolve({
        value: undefined,
        done: true
      });
    });

    this._requests = [];
  }

  progressiveDone() {
    if (this._done) {
      return;
    }

    this._done = true;
  }

}

class PDFDataTransportStreamRangeReader {
  constructor(stream, begin, end) {
    this._stream = stream;
    this._begin = begin;
    this._end = end;
    this._queuedChunk = null;
    this._requests = [];
    this._done = false;
    this.onProgress = null;
  }

  _enqueue(chunk) {
    if (this._done) {
      return;
    }

    if (this._requests.length === 0) {
      this._queuedChunk = chunk;
    } else {
      const requestsCapability = this._requests.shift();

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
  }

  get isStreamingSupported() {
    return false;
  }

  async read() {
    if (this._queuedChunk) {
      const chunk = this._queuedChunk;
      this._queuedChunk = null;
      return {
        value: chunk,
        done: false
      };
    }

    if (this._done) {
      return {
        value: undefined,
        done: true
      };
    }

    const requestCapability = (0, _util.createPromiseCapability)();

    this._requests.push(requestCapability);

    return requestCapability.promise;
  }

  cancel(reason) {
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

}