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

import { assert, stringToBytes, warn } from "../shared/util.js";
import {
  BasePDFStream,
  BasePDFStreamRangeReader,
  BasePDFStreamReader,
} from "../shared/base_pdf_stream.js";
import {
  createHeaders,
  createResponseError,
  ensureResponseOrigin,
  extractFilenameFromHeader,
  getResponseOrigin,
  validateRangeRequestCapabilities,
} from "./network_utils.js";

if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
  throw new Error(
    'Module "./network.js" shall not be used with MOZCENTRAL builds.'
  );
}

const OK_RESPONSE = 200;
const PARTIAL_CONTENT_RESPONSE = 206;

function getArrayBuffer(val) {
  return typeof val !== "string" ? val : stringToBytes(val).buffer;
}

class PDFNetworkStream extends BasePDFStream {
  #pendingRequests = new WeakMap();

  _responseOrigin = null;

  constructor(source) {
    super(source, PDFNetworkStreamReader, PDFNetworkStreamRangeReader);
    this.url = source.url;
    this.isHttp = /^https?:/i.test(this.url);
    this.headers = createHeaders(this.isHttp, source.httpHeaders);
  }

  /**
   * @ignore
   */
  _request(args) {
    const xhr = new XMLHttpRequest();
    const pendingRequest = {
      validateStatus: null,
      onHeadersReceived: args.onHeadersReceived,
      onDone: args.onDone,
      onError: args.onError,
      onProgress: args.onProgress,
    };
    this.#pendingRequests.set(xhr, pendingRequest);

    xhr.open("GET", this.url);
    xhr.withCredentials = this._source.withCredentials;
    for (const [key, val] of this.headers) {
      xhr.setRequestHeader(key, val);
    }
    if (this.isHttp && "begin" in args && "end" in args) {
      xhr.setRequestHeader("Range", `bytes=${args.begin}-${args.end - 1}`);

      // From http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.35.2:
      // "A server MAY ignore the Range header". This means it's possible to
      // get a 200 rather than a 206 response from a range request.
      pendingRequest.validateStatus = status =>
        status === PARTIAL_CONTENT_RESPONSE || status === OK_RESPONSE;
    } else {
      pendingRequest.validateStatus = status => status === OK_RESPONSE;
    }
    xhr.responseType = "arraybuffer";

    assert(args.onError, "Expected `onError` callback to be provided.");
    xhr.onerror = () => args.onError(xhr.status);
    xhr.onreadystatechange = this.#onStateChange.bind(this, xhr);
    xhr.onprogress = this.#onProgress.bind(this, xhr);

    xhr.send(null);

    return xhr;
  }

  #onProgress(xhr, evt) {
    const pendingRequest = this.#pendingRequests.get(xhr);
    pendingRequest?.onProgress?.(evt);
  }

  #onStateChange(xhr, evt) {
    const pendingRequest = this.#pendingRequests.get(xhr);
    if (!pendingRequest) {
      return; // Maybe abortRequest was called...
    }

    if (xhr.readyState >= 2 && pendingRequest.onHeadersReceived) {
      pendingRequest.onHeadersReceived();
      delete pendingRequest.onHeadersReceived;
    }

    if (xhr.readyState !== 4) {
      return;
    }

    if (!this.#pendingRequests.has(xhr)) {
      // The XHR request might have been aborted in onHeadersReceived()
      // callback, in which case we should abort request.
      return;
    }
    this.#pendingRequests.delete(xhr);

    // Success status == 0 can be on ftp, file and other protocols.
    if (xhr.status === 0 && this.isHttp) {
      pendingRequest.onError(xhr.status);
      return;
    }
    const xhrStatus = xhr.status || OK_RESPONSE;

    if (!pendingRequest.validateStatus(xhrStatus)) {
      pendingRequest.onError(xhr.status);
      return;
    }

    const chunk = getArrayBuffer(xhr.response);
    if (xhrStatus === PARTIAL_CONTENT_RESPONSE) {
      const rangeHeader = xhr.getResponseHeader("Content-Range");
      if (/bytes (\d+)-(\d+)\/(\d+)/.test(rangeHeader)) {
        pendingRequest.onDone(chunk);
      } else {
        warn(`Missing or invalid "Content-Range" header.`);
        pendingRequest.onError(0);
      }
    } else if (chunk) {
      pendingRequest.onDone(chunk);
    } else {
      pendingRequest.onError(xhr.status);
    }
  }

  /**
   * Abort the request, if it's pending.
   * @ignore
   */
  _abortRequest(xhr) {
    if (this.#pendingRequests.has(xhr)) {
      this.#pendingRequests.delete(xhr);
      xhr.abort();
    }
  }

  getRangeReader(begin, end) {
    const reader = super.getRangeReader(begin, end);

    if (reader) {
      reader.onClosed = () => this._rangeReaders.delete(reader);
    }
    return reader;
  }
}

class PDFNetworkStreamReader extends BasePDFStreamReader {
  _cachedChunks = [];

  _done = false;

  _requests = [];

  _storedError = null;

  constructor(stream) {
    super(stream);
    const { length } = stream._source;

    this._contentLength = length;
    // Note that `XMLHttpRequest` doesn't support streaming, and range requests
    // will be enabled (if supported) in `this.#onHeadersReceived` below.

    this._fullRequestXhr = stream._request({
      onHeadersReceived: this.#onHeadersReceived.bind(this),
      onDone: this.#onDone.bind(this),
      onError: this.#onError.bind(this),
      onProgress: this.#onProgress.bind(this),
    });
  }

  #onHeadersReceived() {
    const stream = this._stream;
    const { disableRange, rangeChunkSize } = stream._source;
    const fullRequestXhr = this._fullRequestXhr;

    stream._responseOrigin = getResponseOrigin(fullRequestXhr.responseURL);

    const rawResponseHeaders = fullRequestXhr.getAllResponseHeaders();
    const responseHeaders = new Headers(
      rawResponseHeaders
        ? rawResponseHeaders
            .trimStart()
            .replace(/[^\S ]+$/, "") // Not `trimEnd`, to keep regular spaces.
            .split(/[\r\n]+/)
            .map(x => {
              const [key, ...val] = x.split(": ");
              return [key, val.join(": ")];
            })
        : []
    );

    const { allowRangeRequests, suggestedLength } =
      validateRangeRequestCapabilities({
        responseHeaders,
        isHttp: stream.isHttp,
        rangeChunkSize,
        disableRange,
      });

    if (allowRangeRequests) {
      this._isRangeSupported = true;
    }
    // Setting right content length.
    this._contentLength = suggestedLength || this._contentLength;

    this._filename = extractFilenameFromHeader(responseHeaders);

    if (this._isRangeSupported) {
      // NOTE: by cancelling the full request, and then issuing range
      // requests, there will be an issue for sites where you can only
      // request the pdf once. However, if this is the case, then the
      // server should not be returning that it can support range requests.
      stream._abortRequest(fullRequestXhr);
    }

    this._headersCapability.resolve();
  }

  #onDone(chunk) {
    if (this._requests.length > 0) {
      const capability = this._requests.shift();
      capability.resolve({ value: chunk, done: false });
    } else {
      this._cachedChunks.push(chunk);
    }
    this._done = true;
    if (this._cachedChunks.length > 0) {
      return;
    }
    for (const capability of this._requests) {
      capability.resolve({ value: undefined, done: true });
    }
    this._requests.length = 0;
  }

  #onError(status) {
    this._storedError = createResponseError(status, this._stream.url);
    this._headersCapability.reject(this._storedError);
    for (const capability of this._requests) {
      capability.reject(this._storedError);
    }
    this._requests.length = 0;
    this._cachedChunks.length = 0;
  }

  #onProgress(evt) {
    this.onProgress?.({
      loaded: evt.loaded,
      total: evt.lengthComputable ? evt.total : this._contentLength,
    });
  }

  async read() {
    await this._headersCapability.promise;

    if (this._storedError) {
      throw this._storedError;
    }
    if (this._cachedChunks.length > 0) {
      const chunk = this._cachedChunks.shift();
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
    this._headersCapability.reject(reason);
    for (const capability of this._requests) {
      capability.resolve({ value: undefined, done: true });
    }
    this._requests.length = 0;

    this._stream._abortRequest(this._fullRequestXhr);
    this._fullRequestXhr = null;
  }
}

class PDFNetworkStreamRangeReader extends BasePDFStreamRangeReader {
  onClosed = null;

  _done = false;

  _queuedChunk = null;

  _requests = [];

  _storedError = null;

  constructor(stream, begin, end) {
    super(stream, begin, end);

    this._requestXhr = stream._request({
      begin,
      end,
      onHeadersReceived: this.#onHeadersReceived.bind(this),
      onDone: this.#onDone.bind(this),
      onError: this.#onError.bind(this),
      onProgress: null,
    });
  }

  #onHeadersReceived() {
    const responseOrigin = getResponseOrigin(this._requestXhr?.responseURL);
    try {
      ensureResponseOrigin(responseOrigin, this._stream._responseOrigin);
    } catch (ex) {
      this._storedError = ex;
      this.#onError(0);
    }
  }

  #onDone(chunk) {
    if (this._requests.length > 0) {
      const capability = this._requests.shift();
      capability.resolve({ value: chunk, done: false });
    } else {
      this._queuedChunk = chunk;
    }
    this._done = true;
    for (const capability of this._requests) {
      capability.resolve({ value: undefined, done: true });
    }
    this._requests.length = 0;
    this.onClosed?.();
  }

  #onError(status) {
    this._storedError ??= createResponseError(status, this._stream.url);
    for (const capability of this._requests) {
      capability.reject(this._storedError);
    }
    this._requests.length = 0;
    this._queuedChunk = null;
  }

  async read() {
    if (this._storedError) {
      throw this._storedError;
    }
    if (this._queuedChunk !== null) {
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

    this._stream._abortRequest(this._requestXhr);
    this.onClosed?.();
  }
}

export { PDFNetworkStream };
