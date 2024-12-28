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
/* globals process */

import { AbortException, assert } from "../shared/util.js";
import { createResponseError } from "./network_utils.js";

if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
  throw new Error(
    'Module "./node_stream.js" shall not be used with MOZCENTRAL builds.'
  );
}

const urlRegex = /^[a-z][a-z0-9\-+.]+:/i;

function parseUrlOrPath(sourceUrl) {
  if (urlRegex.test(sourceUrl)) {
    return new URL(sourceUrl);
  }
  const url = process.getBuiltinModule("url");
  return new URL(url.pathToFileURL(sourceUrl));
}

class PDFNodeStream {
  constructor(source) {
    this.source = source;
    this.url = parseUrlOrPath(source.url);
    assert(
      this.url.protocol === "file:",
      "PDFNodeStream only supports file:// URLs."
    );

    this._fullRequestReader = null;
    this._rangeRequestReaders = [];
  }

  get _progressiveDataLength() {
    return this._fullRequestReader?._loaded ?? 0;
  }

  getFullReader() {
    assert(
      !this._fullRequestReader,
      "PDFNodeStream.getFullReader can only be called once."
    );
    this._fullRequestReader = new PDFNodeStreamFsFullReader(this);
    return this._fullRequestReader;
  }

  getRangeReader(start, end) {
    if (end <= this._progressiveDataLength) {
      return null;
    }
    const rangeReader = new PDFNodeStreamFsRangeReader(this, start, end);
    this._rangeRequestReaders.push(rangeReader);
    return rangeReader;
  }

  cancelAllRequests(reason) {
    this._fullRequestReader?.cancel(reason);

    for (const reader of this._rangeRequestReaders.slice(0)) {
      reader.cancel(reason);
    }
  }
}

class PDFNodeStreamFsFullReader {
  constructor(stream) {
    this._url = stream.url;
    this._done = false;
    this._storedError = null;
    this.onProgress = null;
    const source = stream.source;
    this._contentLength = source.length; // optional
    this._loaded = 0;
    this._filename = null;

    this._disableRange = source.disableRange || false;
    this._rangeChunkSize = source.rangeChunkSize;
    if (!this._rangeChunkSize && !this._disableRange) {
      this._disableRange = true;
    }

    this._isStreamingSupported = !source.disableStream;
    this._isRangeSupported = !source.disableRange;

    this._readableStream = null;
    this._readCapability = Promise.withResolvers();
    this._headersCapability = Promise.withResolvers();

    const fs = process.getBuiltinModule("fs");
    fs.promises.lstat(this._url).then(
      stat => {
        // Setting right content length.
        this._contentLength = stat.size;

        this._setReadableStream(fs.createReadStream(this._url));
        this._headersCapability.resolve();
      },
      error => {
        if (error.code === "ENOENT") {
          error = createResponseError(/* status = */ 0, this._url.href);
        }
        this._storedError = error;
        this._headersCapability.reject(error);
      }
    );
  }

  get headersReady() {
    return this._headersCapability.promise;
  }

  get filename() {
    return this._filename;
  }

  get contentLength() {
    return this._contentLength;
  }

  get isRangeSupported() {
    return this._isRangeSupported;
  }

  get isStreamingSupported() {
    return this._isStreamingSupported;
  }

  async read() {
    await this._readCapability.promise;
    if (this._done) {
      return { value: undefined, done: true };
    }
    if (this._storedError) {
      throw this._storedError;
    }

    const chunk = this._readableStream.read();
    if (chunk === null) {
      this._readCapability = Promise.withResolvers();
      return this.read();
    }
    this._loaded += chunk.length;
    this.onProgress?.({
      loaded: this._loaded,
      total: this._contentLength,
    });

    // Ensure that `read()` method returns ArrayBuffer.
    const buffer = new Uint8Array(chunk).buffer;
    return { value: buffer, done: false };
  }

  cancel(reason) {
    // Call `this._error()` method when cancel is called
    // before _readableStream is set.
    if (!this._readableStream) {
      this._error(reason);
      return;
    }
    this._readableStream.destroy(reason);
  }

  _error(reason) {
    this._storedError = reason;
    this._readCapability.resolve();
  }

  _setReadableStream(readableStream) {
    this._readableStream = readableStream;
    readableStream.on("readable", () => {
      this._readCapability.resolve();
    });

    readableStream.on("end", () => {
      // Destroy readable to minimize resource usage.
      readableStream.destroy();
      this._done = true;
      this._readCapability.resolve();
    });

    readableStream.on("error", reason => {
      this._error(reason);
    });

    // We need to stop reading when range is supported and streaming is
    // disabled.
    if (!this._isStreamingSupported && this._isRangeSupported) {
      this._error(new AbortException("streaming is disabled"));
    }

    // Destroy ReadableStream if already in errored state.
    if (this._storedError) {
      this._readableStream.destroy(this._storedError);
    }
  }
}

class PDFNodeStreamFsRangeReader {
  constructor(stream, start, end) {
    this._url = stream.url;
    this._done = false;
    this._storedError = null;
    this.onProgress = null;
    this._loaded = 0;
    this._readableStream = null;
    this._readCapability = Promise.withResolvers();
    const source = stream.source;
    this._isStreamingSupported = !source.disableStream;

    const fs = process.getBuiltinModule("fs");
    this._setReadableStream(
      fs.createReadStream(this._url, { start, end: end - 1 })
    );
  }

  get isStreamingSupported() {
    return this._isStreamingSupported;
  }

  async read() {
    await this._readCapability.promise;
    if (this._done) {
      return { value: undefined, done: true };
    }
    if (this._storedError) {
      throw this._storedError;
    }

    const chunk = this._readableStream.read();
    if (chunk === null) {
      this._readCapability = Promise.withResolvers();
      return this.read();
    }
    this._loaded += chunk.length;
    this.onProgress?.({ loaded: this._loaded });

    // Ensure that `read()` method returns ArrayBuffer.
    const buffer = new Uint8Array(chunk).buffer;
    return { value: buffer, done: false };
  }

  cancel(reason) {
    // Call `this._error()` method when cancel is called
    // before _readableStream is set.
    if (!this._readableStream) {
      this._error(reason);
      return;
    }
    this._readableStream.destroy(reason);
  }

  _error(reason) {
    this._storedError = reason;
    this._readCapability.resolve();
  }

  _setReadableStream(readableStream) {
    this._readableStream = readableStream;
    readableStream.on("readable", () => {
      this._readCapability.resolve();
    });

    readableStream.on("end", () => {
      // Destroy readableStream to minimize resource usage.
      readableStream.destroy();
      this._done = true;
      this._readCapability.resolve();
    });

    readableStream.on("error", reason => {
      this._error(reason);
    });

    // Destroy readableStream if already in errored state.
    if (this._storedError) {
      this._readableStream.destroy(this._storedError);
    }
  }
}

export { PDFNodeStream };
