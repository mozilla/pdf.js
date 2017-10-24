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
  AbortException, assert, createPromiseCapability
} from '../shared/util';
import {
  createResponseStatusError, validateRangeRequestCapabilities,
  validateResponseStatus
} from './network_utils';

function createFetchOptions(headers, withCredentials) {
  return {
    method: 'GET',
    headers,
    mode: 'cors',
    credentials: withCredentials ? 'include' : 'same-origin',
    redirect: 'follow',
  };
}

class PDFFetchStream {
  constructor(options) {
    this.options = options;
    this.source = options.source;
    this.isHttp = /^https?:/i.test(this.source.url);
    this.httpHeaders = (this.isHttp && this.source.httpHeaders) || {};

    this._fullRequestReader = null;
    this._rangeRequestReaders = [];
  }

  getFullReader() {
    assert(!this._fullRequestReader);
    this._fullRequestReader = new PDFFetchStreamReader(this);
    return this._fullRequestReader;
  }

  getRangeReader(begin, end) {
    let reader = new PDFFetchStreamRangeReader(this, begin, end);
    this._rangeRequestReaders.push(reader);
    return reader;
  }

  cancelAllRequests(reason) {
    if (this._fullRequestReader) {
      this._fullRequestReader.cancel(reason);
    }
    let readers = this._rangeRequestReaders.slice(0);
    readers.forEach(function(reader) {
      reader.cancel(reason);
    });
  }
}

class PDFFetchStreamReader {
  constructor(stream) {
    this._stream = stream;
    this._reader = null;
    this._loaded = 0;
    this._withCredentials = stream.source.withCredentials;
    this._contentLength = this._stream.source.length;
    this._headersCapability = createPromiseCapability();
    this._disableRange = this._stream.options.disableRange;
    this._rangeChunkSize = this._stream.source.rangeChunkSize;
    if (!this._rangeChunkSize && !this._disableRange) {
      this._disableRange = true;
    }

    this._isRangeSupported = !this._stream.options.disableRange;
    this._isStreamingSupported = !this._stream.source.disableStream;

    this._headers = new Headers();
    for (let property in this._stream.httpHeaders) {
      let value = this._stream.httpHeaders[property];
      if (typeof value === 'undefined') {
        continue;
      }
      this._headers.append(property, value);
    }

    let url = this._stream.source.url;
    fetch(url, createFetchOptions(this._headers, this._withCredentials)).
        then((response) => {
      if (!validateResponseStatus(response.status)) {
        throw createResponseStatusError(response.status, url);
      }
      this._reader = response.body.getReader();
      this._headersCapability.resolve();

      let { allowRangeRequests, suggestedLength, } =
        validateRangeRequestCapabilities({
          getResponseHeader: (name) => {
            return response.headers.get(name);
          },
          isHttp: this._stream.isHttp,
          rangeChunkSize: this._rangeChunkSize,
          disableRange: this._disableRange,
        });

      this._contentLength = suggestedLength;
      this._isRangeSupported = allowRangeRequests;

      // We need to stop reading when range is supported and streaming is
      // disabled.
      if (!this._isStreamingSupported && this._isRangeSupported) {
        this.cancel(new AbortException('streaming is disabled'));
      }
    }).catch(this._headersCapability.reject);

    this.onProgress = null;
  }

  get headersReady() {
    return this._headersCapability.promise;
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

  read() {
    return this._headersCapability.promise.then(() => {
      return this._reader.read().then(({ value, done, }) => {
        if (done) {
          return Promise.resolve({ value, done, });
        }
        this._loaded += value.byteLength;
        if (this.onProgress) {
          this.onProgress({
            loaded: this._loaded,
            total: this._contentLength,
          });
        }
        let buffer = new Uint8Array(value).buffer;
        return Promise.resolve({ value: buffer, done: false, });
      });
    });
  }

  cancel(reason) {
    if (this._reader) {
      this._reader.cancel(reason);
    }
  }
}

class PDFFetchStreamRangeReader {
  constructor(stream, begin, end) {
    this._stream = stream;
    this._reader = null;
    this._loaded = 0;
    this._withCredentials = stream.source.withCredentials;
    this._readCapability = createPromiseCapability();
    this._isStreamingSupported = !stream.source.disableStream;

    this._headers = new Headers();
    for (let property in this._stream.httpHeaders) {
      let value = this._stream.httpHeaders[property];
      if (typeof value === 'undefined') {
        continue;
      }
      this._headers.append(property, value);
    }

    let rangeStr = begin + '-' + (end - 1);
    this._headers.append('Range', 'bytes=' + rangeStr);
    let url = this._stream.source.url;
    fetch(url, createFetchOptions(this._headers, this._withCredentials)).
        then((response) => {
      if (!validateResponseStatus(response.status)) {
        throw createResponseStatusError(response.status, url);
      }
      this._readCapability.resolve();
      this._reader = response.body.getReader();
    });

    this.onProgress = null;
  }

  get isStreamingSupported() {
    return this._isStreamingSupported;
  }

  read() {
    return this._readCapability.promise.then(() => {
      return this._reader.read().then(({ value, done, }) => {
        if (done) {
          return Promise.resolve({ value, done, });
        }
        this._loaded += value.byteLength;
        if (this.onProgress) {
          this.onProgress({ loaded: this._loaded, });
        }
        let buffer = new Uint8Array(value).buffer;
        return Promise.resolve({ value: buffer, done: false, });
      });
    });
  }

  cancel(reason) {
    if (this._reader) {
      this._reader.cancel(reason);
    }
  }
}

export {
  PDFFetchStream,
};
