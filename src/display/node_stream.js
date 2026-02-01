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
import {
  BasePDFStream,
  BasePDFStreamRangeReader,
  BasePDFStreamReader,
} from "../shared/base_pdf_stream.js";
import { createResponseError } from "./network_utils.js";

if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
  throw new Error(
    'Module "./node_stream.js" shall not be used with MOZCENTRAL builds.'
  );
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

class PDFNodeStream extends BasePDFStream {
  constructor(source) {
    super(source, PDFNodeStreamReader, PDFNodeStreamRangeReader);
    const { url } = source;

    assert(
      url.protocol === "file:",
      "PDFNodeStream only supports file:// URLs."
    );
  }
}

class PDFNodeStreamReader extends BasePDFStreamReader {
  _reader = null;

  constructor(stream) {
    super(stream);
    const { disableRange, disableStream, length, rangeChunkSize, url } =
      stream._source;

    this._contentLength = length;
    this._isStreamingSupported = !disableStream;
    this._isRangeSupported = !disableRange;

    const fs = process.getBuiltinModule("fs");
    fs.promises
      .lstat(url)
      .then(stat => {
        const readStream = fs.createReadStream(url);
        const readableStream = getReadableStream(readStream);

        this._reader = readableStream.getReader();

        const { size } = stat;
        if (size <= 2 * rangeChunkSize) {
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
          error = createResponseError(/* status = */ 0, url);
        }
        this._headersCapability.reject(error);
      });
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

class PDFNodeStreamRangeReader extends BasePDFStreamRangeReader {
  _readCapability = Promise.withResolvers();

  _reader = null;

  constructor(stream, begin, end) {
    super(stream, begin, end);
    const { url } = stream._source;

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

  async read() {
    await this._readCapability.promise;
    const { value, done } = await this._reader.read();
    if (done) {
      return { value, done };
    }
    return { value: getArrayBuffer(value), done: false };
  }

  cancel(reason) {
    this._reader?.cancel(reason);
  }
}

export { PDFNodeStream };
