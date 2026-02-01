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

import { AbortException, assert, warn } from "../shared/util.js";
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
    'Module "./fetch_stream.js" shall not be used with MOZCENTRAL builds.'
  );
}

function fetchUrl(url, headers, withCredentials, abortController) {
  return fetch(url, {
    method: "GET",
    headers,
    signal: abortController.signal,
    mode: "cors",
    credentials: withCredentials ? "include" : "same-origin",
    redirect: "follow",
  });
}

function ensureResponseStatus(status, url) {
  if (status !== 200 && status !== 206) {
    throw createResponseError(status, url);
  }
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

class PDFFetchStream extends BasePDFStream {
  _responseOrigin = null;

  constructor(source) {
    super(source, PDFFetchStreamReader, PDFFetchStreamRangeReader);
    const { httpHeaders, url } = source;

    assert(
      /https?:/.test(url.protocol),
      "PDFFetchStream only supports http(s):// URLs."
    );
    this.headers = createHeaders(/* isHttp = */ true, httpHeaders);
  }
}

class PDFFetchStreamReader extends BasePDFStreamReader {
  _abortController = new AbortController();

  _reader = null;

  constructor(stream) {
    super(stream);
    const {
      disableRange,
      disableStream,
      length,
      rangeChunkSize,
      url,
      withCredentials,
    } = stream._source;

    this._contentLength = length;
    this._isStreamingSupported = !disableStream;
    this._isRangeSupported = !disableRange;
    // Always create a copy of the headers.
    const headers = new Headers(stream.headers);

    fetchUrl(url, headers, withCredentials, this._abortController)
      .then(response => {
        stream._responseOrigin = getResponseOrigin(response.url);

        ensureResponseStatus(response.status, url);
        this._reader = response.body.getReader();

        const responseHeaders = response.headers;

        const { allowRangeRequests, suggestedLength } =
          validateRangeRequestCapabilities({
            responseHeaders,
            isHttp: true,
            rangeChunkSize,
            disableRange,
          });

        this._isRangeSupported = allowRangeRequests;
        // Setting right content length.
        this._contentLength = suggestedLength || this._contentLength;

        this._filename = extractFilenameFromHeader(responseHeaders);

        // We need to stop reading when range is supported and streaming is
        // disabled.
        if (!this._isStreamingSupported && this._isRangeSupported) {
          this.cancel(new AbortException("Streaming is disabled."));
        }

        this._headersCapability.resolve();
      })
      .catch(this._headersCapability.reject);
  }

  async read() {
    await this._headersCapability.promise;
    const { value, done } = await this._reader.read();
    if (done) {
      return { value, done };
    }
    this._loaded += value.byteLength;
    this._callOnProgress();

    return { value: getArrayBuffer(value), done: false };
  }

  cancel(reason) {
    this._reader?.cancel(reason);
    this._abortController.abort();
  }
}

class PDFFetchStreamRangeReader extends BasePDFStreamRangeReader {
  _abortController = new AbortController();

  _readCapability = Promise.withResolvers();

  _reader = null;

  constructor(stream, begin, end) {
    super(stream, begin, end);
    const { url, withCredentials } = stream._source;

    // Always create a copy of the headers.
    const headers = new Headers(stream.headers);
    headers.append("Range", `bytes=${begin}-${end - 1}`);

    fetchUrl(url, headers, withCredentials, this._abortController)
      .then(response => {
        const responseOrigin = getResponseOrigin(response.url);

        ensureResponseOrigin(responseOrigin, stream._responseOrigin);
        ensureResponseStatus(response.status, url);
        this._reader = response.body.getReader();

        this._readCapability.resolve();
      })
      .catch(this._readCapability.reject);
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
    this._abortController.abort();
  }
}

export { PDFFetchStream };
