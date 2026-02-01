/* Copyright 2018 Mozilla Foundation
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

import { assert, unreachable } from "./util.js";

/**
 * Interface that represents PDF data transport. If possible, it allows
 * progressively load entire or fragment of the PDF binary data.
 */
class BasePDFStream {
  #PDFStreamReader = null;

  #PDFStreamRangeReader = null;

  _fullReader = null;

  _rangeReaders = new Set();

  _source = null;

  constructor(source, PDFStreamReader, PDFStreamRangeReader) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === BasePDFStream
    ) {
      unreachable("Cannot initialize BasePDFStream.");
    }
    this._source = source;

    this.#PDFStreamReader = PDFStreamReader;
    this.#PDFStreamRangeReader = PDFStreamRangeReader;
  }

  get _progressiveDataLength() {
    return this._fullReader?._loaded ?? 0;
  }

  /**
   * Gets a reader for the entire PDF data.
   * @returns {BasePDFStreamReader}
   */
  getFullReader() {
    assert(
      !this._fullReader,
      "BasePDFStream.getFullReader can only be called once."
    );
    return (this._fullReader = new this.#PDFStreamReader(this));
  }

  /**
   * Gets a reader for the range of the PDF data.
   *
   * NOTE: Currently this method is only expected to be invoked *after*
   * the `BasePDFStreamReader.prototype.headersReady` promise has resolved.
   *
   * @param {number} begin - the start offset of the data.
   * @param {number} end - the end offset of the data.
   * @returns {BasePDFStreamRangeReader}
   */
  getRangeReader(begin, end) {
    if (end <= this._progressiveDataLength) {
      return null;
    }
    const reader = new this.#PDFStreamRangeReader(this, begin, end);
    this._rangeReaders.add(reader);
    return reader;
  }

  /**
   * Cancels all opened reader and closes all their opened requests.
   * @param {Object} reason - the reason for cancelling
   */
  cancelAllRequests(reason) {
    this._fullReader?.cancel(reason);

    // Always create a copy of the rangeReaders.
    for (const reader of new Set(this._rangeReaders)) {
      reader.cancel(reason);
    }
  }
}

/**
 * Interface for a PDF binary data reader.
 */
class BasePDFStreamReader {
  /**
   * Sets or gets the progress callback. The callback can be useful when the
   * isStreamingSupported property of the object is defined as false.
   * The callback is called with one parameter: an object with the loaded and
   * total properties.
   */
  onProgress = null;

  _contentLength = 0;

  _filename = null;

  _headersCapability = Promise.withResolvers();

  _isRangeSupported = false;

  _isStreamingSupported = false;

  _loaded = 0;

  _stream = null;

  constructor(stream) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === BasePDFStreamReader
    ) {
      unreachable("Cannot initialize BasePDFStreamReader.");
    }
    this._stream = stream;
  }

  _callOnProgress() {
    this.onProgress?.({ loaded: this._loaded, total: this._contentLength });
  }

  /**
   * Gets a promise that is resolved when the headers and other metadata of
   * the PDF data stream are available.
   * @type {Promise}
   */
  get headersReady() {
    return this._headersCapability.promise;
  }

  /**
   * Gets the Content-Disposition filename. It is defined after the headersReady
   * promise is resolved.
   * @type {string|null} The filename, or `null` if the Content-Disposition
   *                     header is missing/invalid.
   */
  get filename() {
    return this._filename;
  }

  /**
   * Gets PDF binary data length. It is defined after the headersReady promise
   * is resolved.
   * @type {number} The data length (or 0 if unknown).
   */
  get contentLength() {
    return this._contentLength;
  }

  /**
   * Gets ability of the stream to handle range requests. It is defined after
   * the headersReady promise is resolved. Rejected when the reader is cancelled
   * or an error occurs.
   * @type {boolean}
   */
  get isRangeSupported() {
    return this._isRangeSupported;
  }

  /**
   * Gets ability of the stream to progressively load binary data. It is defined
   * after the headersReady promise is resolved.
   * @type {boolean}
   */
  get isStreamingSupported() {
    return this._isStreamingSupported;
  }

  /**
   * Requests a chunk of the binary data. The method returns the promise, which
   * is resolved into object with properties "value" and "done". If the done
   * is set to true, then the stream has reached its end, otherwise the value
   * contains binary data. Cancelled requests will be resolved with the done is
   * set to true.
   * @returns {Promise}
   */
  async read() {
    unreachable("Abstract method `read` called");
  }

  /**
   * Cancels all pending read requests and closes the stream.
   * @param {Object} reason
   */
  cancel(reason) {
    unreachable("Abstract method `cancel` called");
  }
}

/**
 * Interface for a PDF binary data fragment reader.
 */
class BasePDFStreamRangeReader {
  _stream = null;

  constructor(stream, begin, end) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === BasePDFStreamRangeReader
    ) {
      unreachable("Cannot initialize BasePDFStreamRangeReader.");
    }
    this._stream = stream;
  }

  /**
   * Requests a chunk of the binary data. The method returns the promise, which
   * is resolved into object with properties "value" and "done". If the done
   * is set to true, then the stream has reached its end, otherwise the value
   * contains binary data. Cancelled requests will be resolved with the done is
   * set to true.
   * @returns {Promise}
   */
  async read() {
    unreachable("Abstract method `read` called");
  }

  /**
   * Cancels all pending read requests and closes the stream.
   * @param {Object} reason
   */
  cancel(reason) {
    unreachable("Abstract method `cancel` called");
  }
}

export { BasePDFStream, BasePDFStreamRangeReader, BasePDFStreamReader };
