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

/** @typedef {import("../interfaces").IPDFStreamReader} IPDFStreamReader */
// eslint-disable-next-line max-len
/** @typedef {import("../interfaces").IPDFStreamRangeReader} IPDFStreamRangeReader */

import { assert } from "../shared/util.js";
import { BasePDFStream } from "../shared/base_pdf_stream.js";
import { isPdfFile } from "./display_utils.js";

function getArrayBuffer(val) {
  // Prevent any possible issues by only transferring a Uint8Array that
  // completely "utilizes" its underlying ArrayBuffer.
  return val instanceof Uint8Array && val.byteLength === val.buffer.byteLength
    ? val.buffer
    : new Uint8Array(val).buffer;
}

class PDFDataTransportStream extends BasePDFStream {
  _pdfDataRangeTransport = null;

  _queuedChunks = [];

  constructor(source) {
    super(
      source,
      PDFDataTransportStreamReader,
      PDFDataTransportStreamRangeReader
    );
    const { pdfDataRangeTransport, disableRange, disableStream } = source;
    const { length, initialData, progressiveDone, contentDispositionFilename } =
      pdfDataRangeTransport;

    this._progressiveDone = progressiveDone;
    this._contentDispositionFilename = contentDispositionFilename;

    if (initialData?.length > 0) {
      const buffer = getArrayBuffer(initialData);
      this._queuedChunks.push(buffer);
    }

    this._pdfDataRangeTransport = pdfDataRangeTransport;
    this._isStreamingSupported = !disableStream;
    this._isRangeSupported = !disableRange;
    this._contentLength = length;

    pdfDataRangeTransport.addRangeListener((begin, chunk) => {
      this.#onReceiveData(begin, chunk);
    });

    pdfDataRangeTransport.addProgressListener((loaded, total) => {
      if (total !== undefined) {
        this._fullReader?.onProgress?.({ loaded, total });
      }
    });

    pdfDataRangeTransport.addProgressiveReadListener(chunk => {
      this.#onReceiveData(/* begin = */ undefined, chunk);
    });

    pdfDataRangeTransport.addProgressiveDoneListener(() => {
      this._fullReader?.progressiveDone();
      this._progressiveDone = true;
    });

    pdfDataRangeTransport.transportReady();
  }

  #onReceiveData(begin, chunk) {
    const buffer = getArrayBuffer(chunk);

    if (begin === undefined) {
      if (this._fullReader) {
        this._fullReader._enqueue(buffer);
      } else {
        this._queuedChunks.push(buffer);
      }
    } else {
      const rangeReader = this._rangeReaders
        .keys()
        .find(r => r._begin === begin);

      assert(
        rangeReader,
        "#onReceiveData - no `PDFDataTransportStreamRangeReader` instance found."
      );
      rangeReader._enqueue(buffer);
    }
  }

  getFullReader() {
    const reader = super.getFullReader();
    this._queuedChunks = null;
    return reader;
  }

  getRangeReader(begin, end) {
    const reader = super.getRangeReader(begin, end);

    if (reader) {
      reader.onDone = () => this._rangeReaders.delete(reader);

      this._pdfDataRangeTransport.requestDataRange(begin, end);
    }
    return reader;
  }

  cancelAllRequests(reason) {
    super.cancelAllRequests(reason);

    this._pdfDataRangeTransport.abort();
  }
}

/** @implements {IPDFStreamReader} */
class PDFDataTransportStreamReader {
  constructor(stream) {
    this._stream = stream;
    this._done = stream._progressiveDone || false;
    this._filename = isPdfFile(stream._contentDispositionFilename)
      ? stream._contentDispositionFilename
      : null;
    this._queuedChunks = stream._queuedChunks || [];
    this._loaded = 0;
    for (const chunk of this._queuedChunks) {
      this._loaded += chunk.byteLength;
    }
    this._requests = [];
    this._headersReady = Promise.resolve();

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
  onDone = null;

  constructor(stream, begin, end) {
    this._stream = stream;
    this._begin = begin;
    this._end = end;
    this._queuedChunk = null;
    this._requests = [];
    this._done = false;
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
    this.onDone?.();
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
    this.onDone?.();
  }
}

export { PDFDataTransportStream };
