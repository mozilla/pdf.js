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
exports.PDFWorkerStream = void 0;

var _util = require("../shared/util.js");

class PDFWorkerStream {
  constructor(msgHandler) {
    this._msgHandler = msgHandler;
    this._contentLength = null;
    this._fullRequestReader = null;
    this._rangeRequestReaders = [];
  }

  getFullReader() {
    (0, _util.assert)(!this._fullRequestReader);
    this._fullRequestReader = new PDFWorkerStreamReader(this._msgHandler);
    return this._fullRequestReader;
  }

  getRangeReader(begin, end) {
    const reader = new PDFWorkerStreamRangeReader(begin, end, this._msgHandler);

    this._rangeRequestReaders.push(reader);

    return reader;
  }

  cancelAllRequests(reason) {
    if (this._fullRequestReader) {
      this._fullRequestReader.cancel(reason);
    }

    const readers = this._rangeRequestReaders.slice(0);

    readers.forEach(function (reader) {
      reader.cancel(reason);
    });
  }

}

exports.PDFWorkerStream = PDFWorkerStream;

class PDFWorkerStreamReader {
  constructor(msgHandler) {
    this._msgHandler = msgHandler;
    this.onProgress = null;
    this._contentLength = null;
    this._isRangeSupported = false;
    this._isStreamingSupported = false;

    const readableStream = this._msgHandler.sendWithStream("GetReader");

    this._reader = readableStream.getReader();
    this._headersReady = this._msgHandler.sendWithPromise("ReaderHeadersReady").then(data => {
      this._isStreamingSupported = data.isStreamingSupported;
      this._isRangeSupported = data.isRangeSupported;
      this._contentLength = data.contentLength;
    });
  }

  get headersReady() {
    return this._headersReady;
  }

  get contentLength() {
    return this._contentLength;
  }

  get isStreamingSupported() {
    return this._isStreamingSupported;
  }

  get isRangeSupported() {
    return this._isRangeSupported;
  }

  async read() {
    const {
      value,
      done
    } = await this._reader.read();

    if (done) {
      return {
        value: undefined,
        done: true
      };
    }

    return {
      value: value.buffer,
      done: false
    };
  }

  cancel(reason) {
    this._reader.cancel(reason);
  }

}

class PDFWorkerStreamRangeReader {
  constructor(begin, end, msgHandler) {
    this._msgHandler = msgHandler;
    this.onProgress = null;

    const readableStream = this._msgHandler.sendWithStream("GetRangeReader", {
      begin,
      end
    });

    this._reader = readableStream.getReader();
  }

  get isStreamingSupported() {
    return false;
  }

  async read() {
    const {
      value,
      done
    } = await this._reader.read();

    if (done) {
      return {
        value: undefined,
        done: true
      };
    }

    return {
      value: value.buffer,
      done: false
    };
  }

  cancel(reason) {
    this._reader.cancel(reason);
  }

}