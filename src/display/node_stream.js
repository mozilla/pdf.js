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
let http = __non_webpack_require__('http');
let https = __non_webpack_require__('https');
let url = __non_webpack_require__('url');

import { assert, createPromiseCapability } from '../shared/util';
import { validateRangeRequestCapabilities } from './network_utils';

class PDFNodeStream {
  constructor(options) {
    this.options = options;
    this.source = options.source;
    this.url = url.parse(this.source.url);
    this.isHttp = this.url.protocol === 'http:' ||
                  this.url.protocol === 'https:';
    this.isFsUrl = !this.url.host;
    this.httpHeaders = (this.isHttp && this.source.httpHeaders) || {};

    this._fullRequest = null;
    this._rangeRequestReaders = [];
  }

  getFullReader() {
    assert(!this._fullRequest);
    this._fullRequest = this.isFsUrl ?
      new PDFNodeStreamFsFullReader(this) :
      new PDFNodeStreamFullReader(this);
    return this._fullRequest;
  }

  getRangeReader(start, end) {
    let rangeReader = this.isFsUrl ?
      new PDFNodeStreamFsRangeReader(this, start, end) :
      new PDFNodeStreamRangeReader(this, start, end);
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

class BaseFullReader {
  constructor(stream) {
    this._url = stream.url;
    this._done = false;
    this._errored = false;
    this._reason = null;
    this.onProgress = null;
    this._length = stream.source.length;
    this._loaded = 0;

    this._fullRequest = null;
    this._readCapability = createPromiseCapability();
    this._headersCapability = createPromiseCapability();
  }

  get headersReady() {
    return this._headersCapability.promise;
  }

  get contentLength() {
    return this._length;
  }

  get isRangeSupported() {
    return this._isRangeSupported;
  }

  get isStreamingSupported() {
    return this._isStreamingSupported;
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

class BaseRangeReader {
  constructor(stream) {
    this._url = stream.url;
    this._done = false;
    this._errored = false;
    this._reason = null;
    this.onProgress = null;
    this._length = stream.source.length;
    this._loaded = 0;
    this._readCapability = createPromiseCapability();
  }

  get isStreamingSupported() {
    return false;
  }

  read() {
    return this._readCapability.promise.then(() => {
      if (this._done) {
        return Promise.resolve({ value: undefined, done: true, });
      }
      if (this._errored) {
        return Promise.reject(this._reason);
      }

      let chunk = this._read();
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
}

class PDFNodeStreamFullReader extends BaseFullReader {
  constructor(stream) {
    super(stream);

    this._disableRange = stream.options.disableRange || false;
    this._rangeChunkSize = stream.source.rangeChunkSize;
    if (!this._rangeChunkSize && !this._disableRange) {
      this._disableRange = true;
    }

    this._isStreamingSupported = !stream.source.disableStream;
    this._isRangeSupported = false;

    let options = {
      host: this._url.host,
      path: this._url.path,
      method: 'GET',
      headers: stream.httpHeaders,
    };

    let handleResponse = (response) => {
      this._headersCapability.resolve();
      this._fullRequest = response;

      response.on('readable', () => {
        this._readCapability.resolve();
      });

      response.on('end', () => {
        // Destroy response to minimize resource usage.
        response.destroy();
        this._done = true;
        this._readCapability.resolve();
      });

      response.on('error', (reason) => {
        this._errored = true;
        this._reason = reason;
        this._readCapability.resolve();
      });
    };

    this._request = this._url.protocol === 'http:' ?
      http.request(options, handleResponse) :
      https.request(options, handleResponse);

    this._request.on('error', (reason) => {
      this._errored = true;
      this._reason = reason;
      this._headersCapability.reject(reason);
    });
    this._request.end();

    this._headersCapability.promise.then(() => {
      let { allowRangeRequests, suggestedLength, } =
      validateRangeRequestCapabilities({
        getResponseHeader: this.getResponseHeader.bind(this),
        isHttp: stream.isHttp,
        rangeChunkSize: this._rangeChunkSize,
        disableRange: this._disableRange,
      });

      if (allowRangeRequests) {
        this._isRangeSupported = true;
      }
      this._length = suggestedLength;
    });
  }

  getReasponseHeader(name) {
    return this._fullRequest.headers[name];
  }
}

class PDFNodeStreamRangeReader extends BaseRangeReader {
  constructor(stream, start, end) {
    super(stream);

    this._rangeRequest = null;
    this._read = null;
    let rangeStr = start + '-' + (end - 1);
    stream.httpHeaders['Range'] = 'bytes=' + rangeStr;

    let options = {
      host: this._url.host,
      path: this._url.path,
      method: 'GET',
      headers: stream.httpHeaders,
    };
    let handleResponse = (response) => {
      this._rangeRequest = response;
      this._read = this._rangeRequest.read;

      response.on('readable', () => {
        this._readCapability.resolve();
      });

      response.on('end', () => {
        response.destroy();
        this._done = true;
        this._readCapability.resolve();
      });

      response.on('error', (reason) => {
        this._errored = true;
        this._reason = reason;
        this._readCapability.resolve();
      });
    };
    this._request = this._url.protocol === 'http:' ?
      http.request(options, handleResponse) :
      https.request(options, handleResponse);

    this._request.on('error', (reason) => {
      this._errored = true;
      this._reason = reason;
    });
    this._request.end();
  }

  cancel(reason) {
    this._rangeRequest.close(reason);
    this._rangeRequest.destroy(reason);
  }
}

class PDFNodeStreamFsFullReader extends BaseFullReader {
  constructor(stream) {
    super(stream);

    this._isRangeSupported = true;
    this._isStreamingSupported = true;
    this._fullRequest = fs.createReadStream(this._url.path);

    fs.lstat(this._url.path, (error, stat) => {
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
      this._fullRequest.destroy();
      this._done = true;
      this._readCapability.resolve();
    });

    this._fullRequest.on('error', (reason) => {
      this._errored = true;
      this._reason = reason;
      this._readCapability.resolve();
    });
  }
}

class PDFNodeStreamFsRangeReader extends BaseRangeReader {
  constructor(stream, start, end) {
    super(stream);

    this._rangeRequest = fs.createReadStream(this._url.path, { start, end, });
    fs.lstat(this._url.path, (error, stat) => {
      if (error) {
        this._errored = true;
        this._reason = error;
        return;
      }
      this._length = stat.size;
    });
    this._read = this._rangeRequest.read;

    this._rangeRequest.on('readable', () => {
      this._readCapability.resolve();
    });

    this._rangeRequest.on('end', () => {
      this._rangeRequest.destroy();
      this._done = true;
      this._readCapability.resolve();
    });

    this._rangeRequest.on('error', (reason) => {
      this._errored = true;
      this._reason = reason;
      this._readCapability.resolve();
    });
  }

  cancel(reason) {
    this._rangeRequest.close(reason);
    this._rangeRequest.destroy(reason);
  }
}

export {
  PDFNodeStream,
};
