/* Copyright 2019 Mozilla Foundation
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

import { BasePDFStream } from "../shared/base_pdf_stream.js";

class PDFWorkerStream extends BasePDFStream {
  constructor(source) {
    super(source, PDFWorkerStreamReader, PDFWorkerStreamRangeReader);
  }
}

/** @implements {IPDFStreamReader} */
class PDFWorkerStreamReader {
  constructor(stream) {
    const { msgHandler } = stream._source;
    this.onProgress = null;

    this._contentLength = null;
    this._isRangeSupported = false;
    this._isStreamingSupported = false;

    const readableStream = msgHandler.sendWithStream("GetReader");
    this._reader = readableStream.getReader();

    this._headersReady = msgHandler
      .sendWithPromise("ReaderHeadersReady")
      .then(data => {
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
    const { value, done } = await this._reader.read();
    if (done) {
      return { value: undefined, done: true };
    }
    // `value` is wrapped into Uint8Array, we need to
    // unwrap it to ArrayBuffer for further processing.
    return { value: value.buffer, done: false };
  }

  cancel(reason) {
    this._reader.cancel(reason);
  }
}

/** @implements {IPDFStreamRangeReader} */
class PDFWorkerStreamRangeReader {
  constructor(stream, begin, end) {
    const { msgHandler } = stream._source;

    const readableStream = msgHandler.sendWithStream("GetRangeReader", {
      begin,
      end,
    });
    this._reader = readableStream.getReader();
  }

  async read() {
    const { value, done } = await this._reader.read();
    if (done) {
      return { value: undefined, done: true };
    }
    return { value: value.buffer, done: false };
  }

  cancel(reason) {
    this._reader.cancel(reason);
  }
}

export { PDFWorkerStream };
