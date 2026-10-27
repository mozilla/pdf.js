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

import { AbortException, assert } from "../shared/util.js";
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

function isValidContentRange(contentRange, begin, end, contentLength) {
  const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(contentRange);
  if (!match) {
    return false;
  }

  const [start, last] = match.slice(1, 3).map(Number);
  const total = match[3] === "*" ? null : Number(match[3]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(last) ||
    (total !== null && !Number.isSafeInteger(total)) ||
    start !== begin ||
    last < start
  ) {
    return false;
  }

  if (total !== null) {
    if (
      total <= last ||
      total <= begin ||
      (contentLength > 0 && total !== contentLength)
    ) {
      return false;
    }
    return last === Math.min(end, total) - 1;
  }

  return last === end - 1;
}

function getArrayBuffer(val) {
  if (val instanceof Uint8Array) {
    return val.buffer;
  }
  if (val instanceof ArrayBuffer) {
    return val;
  }
  throw new Error(`getArrayBuffer - unexpected data: ${val}`);
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
      rangeChunkSize,
      url,
      withCredentials,
    } = stream._source;

    this._isStreamingSupported = !disableStream;
    // Always create a copy of the headers.
    const headers = new Headers(stream.headers);

    fetchUrl(url, headers, withCredentials, this._abortController)
      .then(response => {
        stream._responseOrigin = getResponseOrigin(response.url);

        ensureResponseStatus(response.status, url);
        this._reader = response.body.getReader();

        const responseHeaders = response.headers;

        const { contentLength, isRangeSupported } =
          validateRangeRequestCapabilities({
            responseHeaders,
            isHttp: true,
            rangeChunkSize,
            disableRange,
          });
        this._contentLength = contentLength;
        this._isRangeSupported = isRangeSupported;

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
        // Ensure that the server sent the requested range; note that the
        // header isn't available for cross-origin requests, unless exposed.
        const contentRange = response.headers.get("Content-Range");
        if (
          response.status === 206 &&
          contentRange !== null &&
          !isValidContentRange(
            contentRange,
            begin,
            end,
            stream._fullReader?.contentLength ?? 0
          )
        ) {
          throw createResponseError(response.status, url);
        }
        this._reader = response.body.getReader();

        this._readCapability.resolve();
      })
      .catch(this._readCapability.reject);

    // Prevent "uncaught exception: Object"-messages in the console,
    // if the document is destroyed before the `read` method is invoked.
    this._readCapability.promise.catch(() => {});
  }

  async read() {
    await this._readCapability.promise;
    const { value, done } = await this._reader.read();
    return done
      ? { value, done }
      : { value: getArrayBuffer(value), done: false };
  }

  cancel(reason) {
    this._reader?.cancel(reason);
    this._abortController.abort();
  }
}

export { getArrayBuffer, PDFFetchStream };
