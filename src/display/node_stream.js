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
/* globals __non_webpack_require__ */

let fs = __non_webpack_require__('fs');
let utils = require('../shared/util');

let assert = utils.assert;
let createPromiseCapability = utils.createPromiseCapability;

class PDFNodeStream {
  constructor(args) {
    this._path = args.path;
    this._fullRequest = null;
    this._rangeRequestReaders = [];
  }

  getFullReader() {
    assert(!this._fullRequest);
    this._fullRequest = new PDFNodeStreamFullReader(this._path);
    return this._fullRequest;
  }

  getRangeReader(begin, end) {
    let rangeReader = new PDFNodeStreamRangeReader(this._path, begin, end);
    this._rangeRequestReaders.push(rangeReader);
    return rangeReader;
  }

  cancelAllRequests(reason) {
    if (this._fullRequest) {
      this._fullRequest.cancel(reason);
    }

    let readers = this._rangeRequestReaders.slice(0);
    readers.forEach(function(reader) {
      reader.cancel(reason);
    });
  }
}

class PDFNodeStreamFullReader {
  constructor(path) {
    this._path = path;
    this._done = false;
    this._errored = false;
    this._reason = null;
    this.onProgress = null;
    this._length = null;
    this._loaded = 0;
    this._readCapability = createPromiseCapability();
    this._headersCapability = createPromiseCapability();
    this._fullRequest = fs.createReadStream(path);

    fs.lstat(this._path, (error, stat) => {
      if (error) {
        this._errored = true;
        this._reason = error;
        this._headersCapability.reject(error);
        return;
      }
      this._length = stat.size;
      this._headersCapability.resolve();
    });

    this._fullRequest.on('readable', () => {
      this._readCapability.resolve();
    });

    this._fullRequest.on('end', () => {
      this._done = true;
      this._readCapability.resolve();
    });

    this._fullRequest.on('error', (reason) => {
      this._errored = true;
      this._reason = reason;
      this._readCapability.resolve();
    });
  }

  get headersReady() {
    return this._headersCapability.promise;
  }

  get contentLength() {
    return this._length;
  }

  get isRangeSupported() {
    return true;
  }

  get isStreamingSupported() {
    return true;
  }

  read() {
    return this._readCapability.promise.then(() => {
      if (this._done) {
        return Promise.resolve({ value: undefined, done: true, });
      }
      if (this._errored) {
        return Promise.reject(this._reason);
      }

      let chunk = this._fullRequest.read();
      if (chunk === null) {
        this._readCapability = createPromiseCapability();
        return this.read();
      }
      this._loaded += chunk.length;
      if (this.onProgress) {
        this.onProgress({
          loaded: this._loaded,
          total: this._length,
        });
      }
      return Promise.resolve({ value: chunk, done: false, });
    });
  }

  cancel(reason) {
    this._fullRequest.close(reason);
    this._fullRequest.destroy(reason);
  }
}

class PDFNodeStreamRangeReader {
  constructor(path, start, end) {
    this._path = path;
    this._done = false;
    this._errored = false;
    this._reason = null;
    this.onProgress = null;
    this._length = null;
    this._loaded = 0;
    this._readCapability = createPromiseCapability();
    this._rangeRequest = fs.createReadStream(path, { start, end, });

    fs.lstat(this._path, (error, stat) => {
      if (error) {
        this._errored = true;
        this._reason = error;
        return;
      }
      this._length = stat.size;
    });

    this._rangeRequest.on('readable', () => {
      this._readCapability.resolve();
    });

    this._rangeRequest.on('end', () => {
      this._done = true;
      this._readCapability.resolve();
    });

    this._rangeRequest.on('error', (reason) => {
      this._errored = true;
      this._reason = reason;
      this._readCapability.resolve();
    });
  }

  get isStreamingSupported() {
    return true;
  }

  read() {
    return this._readCapability.promise.then(() => {
      if (this._done) {
        return Promise.resolve({ value: undefined, done: true, });
      }
      if (this._errored) {
        return Promise.reject(this._reason);
      }

      let chunk = this._rangeRequest.read();
      if (chunk === null) {
        this._readCapability = createPromiseCapability();
        return this.read();
      }
      this._loaded += chunk.length;
      if (this.onProgress) {
        this.onProgress({
          loaded: this._loaded,
          total: this._length,
        });
      }
      return Promise.resolve({ value: chunk, done: false, });
    });
  }

  cancel(reason) {
    this._fullRequest.cancel(reason);
    this._fullRequest.destroy(reason);
  }
}

exports.PDFNodeStream = PDFNodeStream;
