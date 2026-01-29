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

import { AbortException, assert, warn } from "../shared/util.js";
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

function getReadableStream(readStream) {
  const { Readable } = process.getBuiltinModule("stream");

  if (typeof Readable.toWeb === "function") {
    // See https://nodejs.org/api/stream.html#streamreadabletowebstreamreadable-options
    return Readable.toWeb(readStream);
  }
  // Fallback to support Node.js versions older than `24.0.0` and `22.17.0`.
  const require = process
    .getBuiltinModule("module")
    .createRequire(import.meta.url);

  const polyfill = require("node-readable-to-web-readable-stream");
  return polyfill.makeDefaultReadableStreamFromNodeReadable(readStream);
}

function getArrayBuffer(val) {
  if (val instanceof Uint8Array) {
    return val.buffer;
  }
  if (val instanceof ArrayBuffer) {
    return val;
  }
  warn(`getArrayBuffer - unexpected data format: ${val}`);
  return new Uint8Array(val).buffer;
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

  getRangeReader(begin, end) {
    if (end <= this._progressiveDataLength) {
      return null;
    }
    const rangeReader = new PDFNodeStreamFsRangeReader(this, begin, end);
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
  _headersCapability = Promise.withResolvers();

  _reader = null;

  constructor(stream) {
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

    const url = stream.url;
    const fs = process.getBuiltinModule("fs");
    fs.promises
      .lstat(url)
      .then(stat => {
        const readStream = fs.createReadStream(url);
        const readableStream = getReadableStream(readStream);

        this._reader = readableStream.getReader();

        const { size } = stat;
        if (size <= 2 * this._rangeChunkSize) {
          // The file size is smaller than the size of two chunks, so it doesn't
          // make any sense to abort the request and retry with a range request.
          this._isRangeSupported = false;
        }
        // Setting right content length.
        this._contentLength = size;

        // We need to stop reading when range is supported and streaming is
        // disabled.
        if (!this._isStreamingSupported && this._isRangeSupported) {
          this.cancel(new AbortException("Streaming is disabled."));
        }

        this._headersCapability.resolve();
      })
      .catch(error => {
        if (error.code === "ENOENT") {
          error = createResponseError(/* status = */ 0, url.href);
        }
        this._headersCapability.reject(error);
      });
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
    await this._headersCapability.promise;
    const { value, done } = await this._reader.read();
    if (done) {
      return { value, done };
    }
    this._loaded += value.length;
    this.onProgress?.({
      loaded: this._loaded,
      total: this._contentLength,
    });

    return { value: getArrayBuffer(value), done: false };
  }

  cancel(reason) {
    this._reader?.cancel(reason);
  }
}

class PDFNodeStreamFsRangeReader {
  _readCapability = Promise.withResolvers();

  _reader = null;

  constructor(stream, begin, end) {
    this.onProgress = null;
    this._loaded = 0;
    const source = stream.source;
    this._isStreamingSupported = !source.disableStream;

    const url = stream.url;
    const fs = process.getBuiltinModule("fs");
    try {
      const readStream = fs.createReadStream(url, {
        start: begin,
        end: end - 1,
      });
      const readableStream = getReadableStream(readStream);

      this._reader = readableStream.getReader();

      this._readCapability.resolve();
    } catch (error) {
      this._readCapability.reject(error);
    }
  }

  get isStreamingSupported() {
    return this._isStreamingSupported;
  }

  async read() {
    await this._readCapability.promise;
    const { value, done } = await this._reader.read();
    if (done) {
      return { value, done };
    }
    this._loaded += value.length;
    this.onProgress?.({ loaded: this._loaded });

    return { value: getArrayBuffer(value), done: false };
  }

  cancel(reason) {
    this._reader?.cancel(reason);
  }
}

export { PDFNodeStream };
