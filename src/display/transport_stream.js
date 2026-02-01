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

import {
  BasePDFStream,
  BasePDFStreamRangeReader,
  BasePDFStreamReader,
} from "../shared/base_pdf_stream.js";
import { assert } from "../shared/util.js";
import { isPdfFile } from "./display_utils.js";

function getArrayBuffer(val) {
  // Prevent any possible issues by only transferring a Uint8Array that
  // completely "utilizes" its underlying ArrayBuffer.
  return val instanceof Uint8Array && val.byteLength === val.buffer.byteLength
    ? val.buffer
    : new Uint8Array(val).buffer;
}

class PDFDataTransportStream extends BasePDFStream {
  _progressiveDone = false;

  _queuedChunks = [];

  constructor(source) {
    super(
      source,
      PDFDataTransportStreamReader,
      PDFDataTransportStreamRangeReader
    );
    const { pdfDataRangeTransport } = source;
    const { initialData, progressiveDone } = pdfDataRangeTransport;

    if (initialData?.length > 0) {
      const buffer = getArrayBuffer(initialData);
      this._queuedChunks.push(buffer);
    }
    this._progressiveDone = progressiveDone;

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

      this._source.pdfDataRangeTransport.requestDataRange(begin, end);
    }
    return reader;
  }

  cancelAllRequests(reason) {
    super.cancelAllRequests(reason);

    this._source.pdfDataRangeTransport.abort();
  }
}

class PDFDataTransportStreamReader extends BasePDFStreamReader {
  _done = false;

  _queuedChunks = null;

  _requests = [];

  constructor(stream) {
    super(stream);
    const { pdfDataRangeTransport, disableRange, disableStream } =
      stream._source;
    const { length, contentDispositionFilename } = pdfDataRangeTransport;

    this._queuedChunks = stream._queuedChunks || [];
    for (const chunk of this._queuedChunks) {
      this._loaded += chunk.byteLength;
    }
    this._done = stream._progressiveDone;

    this._contentLength = length;
    this._isStreamingSupported = !disableStream;
    this._isRangeSupported = !disableRange;

    if (isPdfFile(contentDispositionFilename)) {
      this._filename = contentDispositionFilename;
    }
    this._headersCapability.resolve();
  }

  _enqueue(chunk) {
    if (this._done) {
      return; // Ignore new data.
    }
    if (this._requests.length > 0) {
      const capability = this._requests.shift();
      capability.resolve({ value: chunk, done: false });
    } else {
      this._queuedChunks.push(chunk);
    }
    this._loaded += chunk.byteLength;
  }

  async read() {
    if (this._queuedChunks.length > 0) {
      const chunk = this._queuedChunks.shift();
      return { value: chunk, done: false };
    }
    if (this._done) {
      return { value: undefined, done: true };
    }
    const capability = Promise.withResolvers();
    this._requests.push(capability);
    return capability.promise;
  }

  cancel(reason) {
    this._done = true;
    for (const capability of this._requests) {
      capability.resolve({ value: undefined, done: true });
    }
    this._requests.length = 0;
  }

  progressiveDone() {
    this._done ||= true;
  }
}

class PDFDataTransportStreamRangeReader extends BasePDFStreamRangeReader {
  onDone = null;

  _begin = -1;

  _done = false;

  _queuedChunk = null;

  _requests = [];

  constructor(stream, begin, end) {
    super(stream, begin, end);
    this._begin = begin;
  }

  _enqueue(chunk) {
    if (this._done) {
      return; // ignore new data
    }
    if (this._requests.length === 0) {
      this._queuedChunk = chunk;
    } else {
      const firstCapability = this._requests.shift();
      firstCapability.resolve({ value: chunk, done: false });

      for (const capability of this._requests) {
        capability.resolve({ value: undefined, done: true });
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
    const capability = Promise.withResolvers();
    this._requests.push(capability);
    return capability.promise;
  }

  cancel(reason) {
    this._done = true;
    for (const capability of this._requests) {
      capability.resolve({ value: undefined, done: true });
    }
    this._requests.length = 0;
    this.onDone?.();
  }
}

export { PDFDataTransportStream };
