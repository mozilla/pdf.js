/* Copyright 2012 Mozilla Foundation
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

/** @typedef {import("../interfaces").IPDFStream} IPDFStream */
/** @typedef {import("../interfaces").IPDFStreamReader} IPDFStreamReader */
// eslint-disable-next-line max-len
/** @typedef {import("../interfaces").IPDFStreamRangeReader} IPDFStreamRangeReader */

import { assert } from "../shared/util.js";
import { isPdfFile } from "./display_utils.js";

/** @implements {IPDFStream} */
class PDFDataTransportStream {
  constructor(
    pdfDataRangeTransport,
    { disableRange = false, disableStream = false }
  ) {
    assert(
      pdfDataRangeTransport,
      'PDFDataTransportStream - missing required "pdfDataRangeTransport" argument.'
    );
    const { length, initialData, progressiveDone, contentDispositionFilename } =
      pdfDataRangeTransport;

    this._queuedChunks = [];
    this._progressiveDone = progressiveDone;
    this._contentDispositionFilename = contentDispositionFilename;

    if (initialData?.length > 0) {
      // Prevent any possible issues by only transferring a Uint8Array that
      // completely "utilizes" its underlying ArrayBuffer.
      const buffer =
        initialData instanceof Uint8Array &&
        initialData.byteLength === initialData.buffer.byteLength
          ? initialData.buffer
          : new Uint8Array(initialData).buffer;
      this._queuedChunks.push(buffer);
    }

    this._pdfDataRangeTransport = pdfDataRangeTransport;
    this._isStreamingSupported = !disableStream;
    this._isRangeSupported = !disableRange;
    this._contentLength = length;

    this._fullRequestReader = null;
    this._rangeReaders = [];

    pdfDataRangeTransport.addRangeListener((begin, chunk) => {
      this._onReceiveData({ begin, chunk });
    });

    pdfDataRangeTransport.addProgressListener((loaded, total) => {
      this._onProgress({ loaded, total });
    });

    pdfDataRangeTransport.addProgressiveReadListener(chunk => {
      this._onReceiveData({ chunk });
    });

    pdfDataRangeTransport.addProgressiveDoneListener(() => {
      this._onProgressiveDone();
    });

    pdfDataRangeTransport.transportReady();
  }

  _onReceiveData({ begin, chunk }) {
    // Prevent any possible issues by only transferring a Uint8Array that
    // completely "utilizes" its underlying ArrayBuffer.
    const buffer =
      chunk instanceof Uint8Array &&
      chunk.byteLength === chunk.buffer.byteLength
        ? chunk.buffer
        : new Uint8Array(chunk).buffer;

    if (begin === undefined) {
      if (this._fullRequestReader) {
        this._fullRequestReader._enqueue(buffer);
      } else {
        this._queuedChunks.push(buffer);
      }
    } else {
      const found = this._rangeReaders.some(function (rangeReader) {
        if (rangeReader._begin !== begin) {
          return false;
        }
        rangeReader._enqueue(buffer);
        return true;
      });
      assert(
        found,
        "_onReceiveData - no `PDFDataTransportStreamRangeReader` instance found."
      );
    }
  }

  get _progressiveDataLength() {
    return this._fullRequestReader?._loaded ?? 0;
  }

  _onProgress(evt) {
    if (evt.total === undefined) {
      // Reporting to first range reader, if it exists.
      this._rangeReaders[0]?.onProgress?.({ loaded: evt.loaded });
    } else {
      this._fullRequestReader?.onProgress?.({
        loaded: evt.loaded,
        total: evt.total,
      });
    }
  }

  _onProgressiveDone() {
    this._fullRequestReader?.progressiveDone();
    this._progressiveDone = true;
  }

  _removeRangeReader(reader) {
    const i = this._rangeReaders.indexOf(reader);
    if (i >= 0) {
      this._rangeReaders.splice(i, 1);
    }
  }

  getFullReader() {
    assert(
      !this._fullRequestReader,
      "PDFDataTransportStream.getFullReader can only be called once."
    );
    const queuedChunks = this._queuedChunks;
    this._queuedChunks = null;
    return new PDFDataTransportStreamReader(
      this,
      queuedChunks,
      this._progressiveDone,
      this._contentDispositionFilename
    );
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
    this._fullRequestReader?.cancel(reason);

    for (const reader of this._rangeReaders.slice(0)) {
      reader.cancel(reason);
    }
    this._pdfDataRangeTransport.abort();
  }
}

/** @implements {IPDFStreamReader} */
class PDFDataTransportStreamReader {
  constructor(
    stream,
    queuedChunks,
    progressiveDone = false,
    contentDispositionFilename = null
  ) {
    this._stream = stream;
    this._done = progressiveDone || false;
    this._filename = isPdfFile(contentDispositionFilename)
      ? contentDispositionFilename
      : null;
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
      return; // Ignore new data.
    }
    if (this._requests.length > 0) {
      const requestCapability = this._requests.shift();
      requestCapability.resolve({ value: chunk, done: false });
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
      return { value: chunk, done: false };
    }
    if (this._done) {
      return { value: undefined, done: true };
    }
    const requestCapability = Promise.withResolvers();
    this._requests.push(requestCapability);
    return requestCapability.promise;
  }

  cancel(reason) {
    this._done = true;
    for (const requestCapability of this._requests) {
      requestCapability.resolve({ value: undefined, done: true });
    }
    this._requests.length = 0;
  }

  progressiveDone() {
    if (this._done) {
      return;
    }
    this._done = true;
  }
}

/** @implements {IPDFStreamRangeReader} */
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
      return; // ignore new data
    }
    if (this._requests.length === 0) {
      this._queuedChunk = chunk;
    } else {
      const requestsCapability = this._requests.shift();
      requestsCapability.resolve({ value: chunk, done: false });
      for (const requestCapability of this._requests) {
        requestCapability.resolve({ value: undefined, done: true });
      }
      this._requests.length = 0;
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
      return { value: chunk, done: false };
    }
    if (this._done) {
      return { value: undefined, done: true };
    }
    const requestCapability = Promise.withResolvers();
    this._requests.push(requestCapability);
    return requestCapability.promise;
  }

  cancel(reason) {
    this._done = true;
    for (const requestCapability of this._requests) {
      requestCapability.resolve({ value: undefined, done: true });
    }
    this._requests.length = 0;
    this._stream._removeRangeReader(this);
  }
}

export { PDFDataTransportStream };
