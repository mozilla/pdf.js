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

import { assert, PromiseCapability, stringToBytes } from "../shared/util.js";
import {
  createResponseStatusError,
  extractFilenameFromHeader,
  validateRangeRequestCapabilities,
} from "./network_utils.js";

if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
  throw new Error(
    'Module "./network.js" shall not be used with MOZCENTRAL builds.'
  );
}

const OK_RESPONSE = 200;
const PARTIAL_CONTENT_RESPONSE = 206;

function getArrayBuffer(xhr) {
  const data = xhr.response;
  if (typeof data !== "string") {
    return data;
  }
  return stringToBytes(data).buffer;
}

class NetworkManager {
  constructor(url, args = {}) {
    this.url = url;
    this.isHttp = /^https?:/i.test(url);
    this.httpHeaders = (this.isHttp && args.httpHeaders) || Object.create(null);
    this.withCredentials = args.withCredentials || false;

    this.currXhrId = 0;
    this.pendingRequests = Object.create(null);
  }

  requestRange(begin, end, listeners) {
    const args = {
      begin,
      end,
    };
    for (const prop in listeners) {
      args[prop] = listeners[prop];
    }
    return this.request(args);
  }

  requestFull(listeners) {
    return this.request(listeners);
  }

  request(args) {
    const xhr = new XMLHttpRequest();
    const xhrId = this.currXhrId++;
    const pendingRequest = (this.pendingRequests[xhrId] = { xhr });

    xhr.open("GET", this.url);
    xhr.withCredentials = this.withCredentials;
    for (const property in this.httpHeaders) {
      const value = this.httpHeaders[property];
      if (value === undefined) {
        continue;
      }
      xhr.setRequestHeader(property, value);
    }
    if (this.isHttp && "begin" in args && "end" in args) {
      xhr.setRequestHeader("Range", `bytes=${args.begin}-${args.end - 1}`);
      pendingRequest.expectedStatus = PARTIAL_CONTENT_RESPONSE;
    } else {
      pendingRequest.expectedStatus = OK_RESPONSE;
    }
    xhr.responseType = "arraybuffer";

    if (args.onError) {
      xhr.onerror = function (evt) {
        args.onError(xhr.status);
      };
    }
    xhr.onreadystatechange = this.onStateChange.bind(this, xhrId);
    xhr.onprogress = this.onProgress.bind(this, xhrId);

    pendingRequest.onHeadersReceived = args.onHeadersReceived;
    pendingRequest.onDone = args.onDone;
    pendingRequest.onError = args.onError;
    pendingRequest.onProgress = args.onProgress;

    xhr.send(null);

    return xhrId;
  }

  onProgress(xhrId, evt) {
    const pendingRequest = this.pendingRequests[xhrId];
    if (!pendingRequest) {
      return; // Maybe abortRequest was called...
    }
    pendingRequest.onProgress?.(evt);
  }

  onStateChange(xhrId, evt) {
    const pendingRequest = this.pendingRequests[xhrId];
    if (!pendingRequest) {
      return; // Maybe abortRequest was called...
    }

    const xhr = pendingRequest.xhr;
    if (xhr.readyState >= 2 && pendingRequest.onHeadersReceived) {
      pendingRequest.onHeadersReceived();
      delete pendingRequest.onHeadersReceived;
    }

    if (xhr.readyState !== 4) {
      return;
    }

    if (!(xhrId in this.pendingRequests)) {
      // The XHR request might have been aborted in onHeadersReceived()
      // callback, in which case we should abort request.
      return;
    }

    delete this.pendingRequests[xhrId];

    // Success status == 0 can be on ftp, file and other protocols.
    if (xhr.status === 0 && this.isHttp) {
      pendingRequest.onError?.(xhr.status);
      return;
    }
    const xhrStatus = xhr.status || OK_RESPONSE;

    // From http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.35.2:
    // "A server MAY ignore the Range header". This means it's possible to
    // get a 200 rather than a 206 response from a range request.
    const ok_response_on_range_request =
      xhrStatus === OK_RESPONSE &&
      pendingRequest.expectedStatus === PARTIAL_CONTENT_RESPONSE;

    if (
      !ok_response_on_range_request &&
      xhrStatus !== pendingRequest.expectedStatus
    ) {
      pendingRequest.onError?.(xhr.status);
      return;
    }

    const chunk = getArrayBuffer(xhr);
    if (xhrStatus === PARTIAL_CONTENT_RESPONSE) {
      const rangeHeader = xhr.getResponseHeader("Content-Range");
      const matches = /bytes (\d+)-(\d+)\/(\d+)/.exec(rangeHeader);
      pendingRequest.onDone({
        begin: parseInt(matches[1], 10),
        chunk,
      });
    } else if (chunk) {
      pendingRequest.onDone({
        begin: 0,
        chunk,
      });
    } else {
      pendingRequest.onError?.(xhr.status);
    }
  }

  getRequestXhr(xhrId) {
    return this.pendingRequests[xhrId].xhr;
  }

  isPendingRequest(xhrId) {
    return xhrId in this.pendingRequests;
  }

  abortRequest(xhrId) {
    const xhr = this.pendingRequests[xhrId].xhr;
    delete this.pendingRequests[xhrId];
    xhr.abort();
  }
}

/** @implements {IPDFStream} */
class PDFNetworkStream {
  constructor(source) {
    this._source = source;
    this._manager = new NetworkManager(source.url, {
      httpHeaders: source.httpHeaders,
      withCredentials: source.withCredentials,
    });
    this._rangeChunkSize = source.rangeChunkSize;
    this._fullRequestReader = null;
    this._rangeRequestReaders = [];
  }

  _onRangeRequestReaderClosed(reader) {
    const i = this._rangeRequestReaders.indexOf(reader);
    if (i >= 0) {
      this._rangeRequestReaders.splice(i, 1);
    }
  }

  getFullReader() {
    assert(
      !this._fullRequestReader,
      "PDFNetworkStream.getFullReader can only be called once."
    );
    this._fullRequestReader = new PDFNetworkStreamFullRequestReader(
      this._manager,
      this._source
    );
    return this._fullRequestReader;
  }

  getRangeReader(begin, end) {
    const reader = new PDFNetworkStreamRangeRequestReader(
      this._manager,
      begin,
      end
    );
    reader.onClosed = this._onRangeRequestReaderClosed.bind(this);
    this._rangeRequestReaders.push(reader);
    return reader;
  }

  cancelAllRequests(reason) {
    this._fullRequestReader?.cancel(reason);

    for (const reader of this._rangeRequestReaders.slice(0)) {
      reader.cancel(reason);
    }
  }
}

/** @implements {IPDFStreamReader} */
class PDFNetworkStreamFullRequestReader {
  constructor(manager, source) {
    this._manager = manager;

    const args = {
      onHeadersReceived: this._onHeadersReceived.bind(this),
      onDone: this._onDone.bind(this),
      onError: this._onError.bind(this),
      onProgress: this._onProgress.bind(this),
    };
    this._url = source.url;
    this._fullRequestId = manager.requestFull(args);
    this._headersReceivedCapability = new PromiseCapability();
    this._disableRange = source.disableRange || false;
    this._contentLength = source.length; // Optional
    this._rangeChunkSize = source.rangeChunkSize;
    if (!this._rangeChunkSize && !this._disableRange) {
      this._disableRange = true;
    }

    this._isStreamingSupported = false;
    this._isRangeSupported = false;

    this._cachedChunks = [];
    this._requests = [];
    this._done = false;
    this._storedError = undefined;
    this._filename = null;

    this.onProgress = null;
  }

  _onHeadersReceived() {
    const fullRequestXhrId = this._fullRequestId;
    const fullRequestXhr = this._manager.getRequestXhr(fullRequestXhrId);

    const getResponseHeader = name => {
      return fullRequestXhr.getResponseHeader(name);
    };
    const { allowRangeRequests, suggestedLength } =
      validateRangeRequestCapabilities({
        getResponseHeader,
        isHttp: this._manager.isHttp,
        rangeChunkSize: this._rangeChunkSize,
        disableRange: this._disableRange,
      });

    if (allowRangeRequests) {
      this._isRangeSupported = true;
    }
    // Setting right content length.
    this._contentLength = suggestedLength || this._contentLength;

    this._filename = extractFilenameFromHeader(getResponseHeader);

    if (this._isRangeSupported) {
      // NOTE: by cancelling the full request, and then issuing range
      // requests, there will be an issue for sites where you can only
      // request the pdf once. However, if this is the case, then the
      // server should not be returning that it can support range requests.
      this._manager.abortRequest(fullRequestXhrId);
    }

    this._headersReceivedCapability.resolve();
  }

  _onDone(data) {
    if (data) {
      if (this._requests.length > 0) {
        const requestCapability = this._requests.shift();
        requestCapability.resolve({ value: data.chunk, done: false });
      } else {
        this._cachedChunks.push(data.chunk);
      }
    }
    this._done = true;
    if (this._cachedChunks.length > 0) {
      return;
    }
    for (const requestCapability of this._requests) {
      requestCapability.resolve({ value: undefined, done: true });
    }
    this._requests.length = 0;
  }

  _onError(status) {
    this._storedError = createResponseStatusError(status, this._url);
    this._headersReceivedCapability.reject(this._storedError);
    for (const requestCapability of this._requests) {
      requestCapability.reject(this._storedError);
    }
    this._requests.length = 0;
    this._cachedChunks.length = 0;
  }

  _onProgress(evt) {
    this.onProgress?.({
      loaded: evt.loaded,
      total: evt.lengthComputable ? evt.total : this._contentLength,
    });
  }

  get filename() {
    return this._filename;
  }

  get isRangeSupported() {
    return this._isRangeSupported;
  }

  get isStreamingSupported() {
    return this._isStreamingSupported;
  }

  get contentLength() {
    return this._contentLength;
  }

  get headersReady() {
    return this._headersReceivedCapability.promise;
  }

  async read() {
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
    const requestCapability = new PromiseCapability();
    this._requests.push(requestCapability);
    return requestCapability.promise;
  }

  cancel(reason) {
    this._done = true;
    this._headersReceivedCapability.reject(reason);
    for (const requestCapability of this._requests) {
      requestCapability.resolve({ value: undefined, done: true });
    }
    this._requests.length = 0;
    if (this._manager.isPendingRequest(this._fullRequestId)) {
      this._manager.abortRequest(this._fullRequestId);
    }
    this._fullRequestReader = null;
  }
}

/** @implements {IPDFStreamRangeReader} */
class PDFNetworkStreamRangeRequestReader {
  constructor(manager, begin, end) {
    this._manager = manager;

    const args = {
      onDone: this._onDone.bind(this),
      onError: this._onError.bind(this),
      onProgress: this._onProgress.bind(this),
    };
    this._url = manager.url;
    this._requestId = manager.requestRange(begin, end, args);
    this._requests = [];
    this._queuedChunk = null;
    this._done = false;
    this._storedError = undefined;

    this.onProgress = null;
    this.onClosed = null;
  }

  _close() {
    this.onClosed?.(this);
  }

  _onDone(data) {
    const chunk = data.chunk;
    if (this._requests.length > 0) {
      const requestCapability = this._requests.shift();
      requestCapability.resolve({ value: chunk, done: false });
    } else {
      this._queuedChunk = chunk;
    }
    this._done = true;
    for (const requestCapability of this._requests) {
      requestCapability.resolve({ value: undefined, done: true });
    }
    this._requests.length = 0;
    this._close();
  }

  _onError(status) {
    this._storedError = createResponseStatusError(status, this._url);
    for (const requestCapability of this._requests) {
      requestCapability.reject(this._storedError);
    }
    this._requests.length = 0;
    this._queuedChunk = null;
  }

  _onProgress(evt) {
    if (!this.isStreamingSupported) {
      this.onProgress?.({ loaded: evt.loaded });
    }
  }

  get isStreamingSupported() {
    return false;
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
    const requestCapability = new PromiseCapability();
    this._requests.push(requestCapability);
    return requestCapability.promise;
  }

  cancel(reason) {
    this._done = true;
    for (const requestCapability of this._requests) {
      requestCapability.resolve({ value: undefined, done: true });
    }
    this._requests.length = 0;
    if (this._manager.isPendingRequest(this._requestId)) {
      this._manager.abortRequest(this._requestId);
    }
    this._close();
  }
}

export { PDFNetworkStream };
