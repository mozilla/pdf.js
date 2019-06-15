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

/**
 * Interface that represents PDF data transport. If possible, it allows
 * progressively load entire or fragment of the PDF binary data.
 *
 * @interface
 */
class IPDFStream {
  /**
   * Gets a reader for the entire PDF data.
   * @returns {IPDFStreamReader}
   */
  getFullReader() {
    return null;
  }

  /**
   * Gets a reader for the range of the PDF data.
   * @param {number} begin - the start offset of the data.
   * @param {number} end - the end offset of the data.
   * @returns {IPDFStreamRangeReader}
   */
  getRangeReader(begin, end) {
    return null;
  }

  /**
   * Cancels all opened reader and closes all their opened requests.
   * @param {Object} reason - the reason for cancelling
   */
  cancelAllRequests(reason) {}
}

/**
 * Interface for a PDF binary data reader.
 *
 * @interface
 */
class IPDFStreamReader {
  constructor() {
    /**
     * Sets or gets the progress callback. The callback can be useful when the
     * isStreamingSupported property of the object is defined as false.
     * The callback is called with one parameter: an object with the loaded and
     * total properties.
     */
    this.onProgress = null;
  }

  /**
   * Gets a promise that is resolved when the headers and other metadata of
   * the PDF data stream are available.
   * @returns {Promise}
   */
  get headersReady() {
    return Promise.resolve();
  }

  /**
   * Gets the Content-Disposition filename. It is defined after the headersReady
   * promise is resolved.
   * @returns {string|null} The filename, or `null` if the Content-Disposition
   *                        header is missing/invalid.
   */
  get filename() {
    return null;
  }

  /**
   * Gets PDF binary data length. It is defined after the headersReady promise
   * is resolved.
   * @returns {number} The data length (or 0 if unknown).
   */
  get contentLength() {
    return 0;
  }

  /**
   * Gets ability of the stream to handle range requests. It is defined after
   * the headersReady promise is resolved. Rejected when the reader is cancelled
   * or an error occurs.
   * @returns {boolean}
   */
  get isRangeSupported() {
    return false;
  }

  /**
   * Gets ability of the stream to progressively load binary data. It is defined
   * after the headersReady promise is resolved.
   * @returns {boolean}
   */
  get isStreamingSupported() {
    return false;
  }

  /**
   * Requests a chunk of the binary data. The method returns the promise, which
   * is resolved into object with properties "value" and "done". If the done
   * is set to true, then the stream has reached its end, otherwise the value
   * contains binary data. Cancelled requests will be resolved with the done is
   * set to true.
   * @returns {Promise}
   */
  async read() {}

  /**
   * Cancels all pending read requests and closes the stream.
   * @param {Object} reason
   */
  cancel(reason) {}
}

/**
 * Interface for a PDF binary data fragment reader.
 *
 * @interface
 */
class IPDFStreamRangeReader {
  constructor() {
    /**
     * Sets or gets the progress callback. The callback can be useful when the
     * isStreamingSupported property of the object is defined as false.
     * The callback is called with one parameter: an object with the loaded
     * property.
     */
    this.onProgress = null;
  }

  /**
   * Gets ability of the stream to progressively load binary data.
   * @returns {boolean}
   */
  get isStreamingSupported() {
    return false;
  }

  /**
   * Requests a chunk of the binary data. The method returns the promise, which
   * is resolved into object with properties "value" and "done". If the done
   * is set to true, then the stream has reached its end, otherwise the value
   * contains binary data. Cancelled requests will be resolved with the done is
   * set to true.
   * @returns {Promise}
   */
  async read() {}

  /**
   * Cancels all pending read requests and closes the stream.
   * @param {Object} reason
   */
  cancel(reason) {}
}

export {
  IPDFStream,
  IPDFStreamReader,
  IPDFStreamRangeReader,
};
