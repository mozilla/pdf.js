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

import {
  AbortException,
  assert,
  createPromiseCapability,
  MissingPDFException,
} from "../shared/util.js";
import {
  extractFilenameFromHeader,
  validateRangeRequestCapabilities,
} from "./network_utils.js";

if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
  throw new Error(
    'Module "./node_stream.js" shall not be used with MOZCENTRAL builds.'
  );
}

const fs = __non_webpack_require__("fs");
const http = __non_webpack_require__("http");
const https = __non_webpack_require__("https");
const url = __non_webpack_require__("url");

const fileUriRegex = /^file:\/\/\/[a-zA-Z]:\//;

function parseUrl(sourceUrl) {
  const parsedUrl = url.parse(sourceUrl);
  if (parsedUrl.protocol === "file:" || parsedUrl.host) {
    return parsedUrl;
  }
  // Prepending 'file:///' to Windows absolute path.
  if (/^[a-z]:[/\\]/i.test(sourceUrl)) {
    return url.parse(`file:///${sourceUrl}`);
  }
  // Changes protocol to 'file:' if url refers to filesystem.
  if (!parsedUrl.host) {
    parsedUrl.protocol = "file:";
  }
  return parsedUrl;
}

class PDFNodeStream {
  constructor(source) {
    this.source = source;
    this.url = parseUrl(source.url);
    this.isHttp =
      this.url.protocol === "http:" || this.url.protocol === "https:";
    // Check if url refers to filesystem.
    this.isFsUrl = this.url.protocol === "file:";
    this.httpHeaders = (this.isHttp && source.httpHeaders) || {};

    this._fullRequestReader = null;
    this._rangeRequestReaders = [];
  }

  get _progressiveDataLength() {
    return this._fullRequestReader?._loaded ?? 0;
  }

  getFullReader() {
    assert(
      !this._fullRequestReader,
      "PDFNodeStream.getFullReader can only be called once."
    );
    this._fullRequestReader = this.isFsUrl
      ? new PDFNodeStreamFsFullReader(this)
      : new PDFNodeStreamFullReader(this);
    return this._fullRequestReader;
  }

  getRangeReader(start, end) {
    if (end <= this._progressiveDataLength) {
      return null;
    }
    const rangeReader = this.isFsUrl
      ? new PDFNodeStreamFsRangeReader(this, start, end)
      : new PDFNodeStreamRangeReader(this, start, end);
    this._rangeRequestReaders.push(rangeReader);
    return rangeReader;
  }

  cancelAllRequests(reason) {
    if (this._fullRequestReader) {
      this._fullRequestReader.cancel(reason);
    }
    for (const reader of this._rangeRequestReaders.slice(0)) {
      reader.cancel(reason);
    }
  }
}

class BaseFullReader {
  constructor(stream) {
    this._url = stream.url;
    this._done = false;
    this._storedError = null;
    this.onProgress = null;
    const source = stream.source;
    this._contentLength = source.length; // optional
    this._loaded = 0;
    this._filename = null;

    this._disableRange = source.disableRange || false;
    this._rangeChunkSize = source.rangeChunkSize;
    if (!this._rangeChunkSize && !this._disableRange) {
      this._disableRange = true;
    }

    this._isStreamingSupported = !source.disableStream;
    this._isRangeSupported = !source.disableRange;

    this._readableStream = null;
    this._readCapability = createPromiseCapability();
    this._headersCapability = createPromiseCapability();
  }

  get headersReady() {
    return this._headersCapability.promise;
  }

  get filename() {
    return this._filename;
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

  async read() {
    await this._readCapability.promise;
    if (this._done) {
      return { value: undefined, done: true };
    }
    if (this._storedError) {
      throw this._storedError;
    }

    const chunk = this._readableStream.read();
    if (chunk === null) {
      this._readCapability = createPromiseCapability();
      return this.read();
    }
    this._loaded += chunk.length;
    if (this.onProgress) {
      this.onProgress({
        loaded: this._loaded,
        total: this._contentLength,
      });
    }
    // Ensure that `read()` method returns ArrayBuffer.
    const buffer = new Uint8Array(chunk).buffer;
    return { value: buffer, done: false };
  }

  cancel(reason) {
    // Call `this._error()` method when cancel is called
    // before _readableStream is set.
    if (!this._readableStream) {
      this._error(reason);
      return;
    }
    this._readableStream.destroy(reason);
  }

  _error(reason) {
    this._storedError = reason;
    this._readCapability.resolve();
  }

  _setReadableStream(readableStream) {
    this._readableStream = readableStream;
    readableStream.on("readable", () => {
      this._readCapability.resolve();
    });

    readableStream.on("end", () => {
      // Destroy readable to minimize resource usage.
      readableStream.destroy();
      this._done = true;
      this._readCapability.resolve();
    });

    readableStream.on("error", reason => {
      this._error(reason);
    });

    // We need to stop reading when range is supported and streaming is
    // disabled.
    if (!this._isStreamingSupported && this._isRangeSupported) {
      this._error(new AbortException("streaming is disabled"));
    }

    // Destroy ReadableStream if already in errored state.
    if (this._storedError) {
      this._readableStream.destroy(this._storedError);
    }
  }
}

class BaseRangeReader {
  constructor(stream) {
    this._url = stream.url;
    this._done = false;
    this._storedError = null;
    this.onProgress = null;
    this._loaded = 0;
    this._readableStream = null;
    this._readCapability = createPromiseCapability();
    const source = stream.source;
    this._isStreamingSupported = !source.disableStream;
  }

  get isStreamingSupported() {
    return this._isStreamingSupported;
  }

  async read() {
    await this._readCapability.promise;
    if (this._done) {
      return { value: undefined, done: true };
    }
    if (this._storedError) {
      throw this._storedError;
    }

    const chunk = this._readableStream.read();
    if (chunk === null) {
      this._readCapability = createPromiseCapability();
      return this.read();
    }
    this._loaded += chunk.length;
    if (this.onProgress) {
      this.onProgress({ loaded: this._loaded });
    }
    // Ensure that `read()` method returns ArrayBuffer.
    const buffer = new Uint8Array(chunk).buffer;
    return { value: buffer, done: false };
  }

  cancel(reason) {
    // Call `this._error()` method when cancel is called
    // before _readableStream is set.
    if (!this._readableStream) {
      this._error(reason);
      return;
    }
    this._readableStream.destroy(reason);
  }

  _error(reason) {
    this._storedError = reason;
    this._readCapability.resolve();
  }

  _setReadableStream(readableStream) {
    this._readableStream = readableStream;
    readableStream.on("readable", () => {
      this._readCapability.resolve();
    });

    readableStream.on("end", () => {
      // Destroy readableStream to minimize resource usage.
      readableStream.destroy();
      this._done = true;
      this._readCapability.resolve();
    });

    readableStream.on("error", reason => {
      this._error(reason);
    });

    // Destroy readableStream if already in errored state.
    if (this._storedError) {
      this._readableStream.destroy(this._storedError);
    }
  }
}

function createRequestOptions(parsedUrl, headers) {
  return {
    protocol: parsedUrl.protocol,
    auth: parsedUrl.auth,
    host: parsedUrl.hostname,
    port: parsedUrl.port,
    path: parsedUrl.path,
    method: "GET",
    headers,
  };
}

class PDFNodeStreamFullReader extends BaseFullReader {
  constructor(stream) {
    super(stream);

    const handleResponse = response => {
      if (response.statusCode === 404) {
        const error = new MissingPDFException(`Missing PDF "${this._url}".`);
        this._storedError = error;
        this._headersCapability.reject(error);
        return;
      }
      this._headersCapability.resolve();
      this._setReadableStream(response);

      const getResponseHeader = name => {
        // Make sure that headers name are in lower case, as mentioned
        // here: https://nodejs.org/api/http.html#http_message_headers.
        return this._readableStream.headers[name.toLowerCase()];
      };
      const { allowRangeRequests, suggestedLength } =
        validateRangeRequestCapabilities({
          getResponseHeader,
          isHttp: stream.isHttp,
          rangeChunkSize: this._rangeChunkSize,
          disableRange: this._disableRange,
        });

      this._isRangeSupported = allowRangeRequests;
      // Setting right content length.
      this._contentLength = suggestedLength || this._contentLength;

      this._filename = extractFilenameFromHeader(getResponseHeader);
    };

    this._request = null;
    if (this._url.protocol === "http:") {
      this._request = http.request(
        createRequestOptions(this._url, stream.httpHeaders),
        handleResponse
      );
    } else {
      this._request = https.request(
        createRequestOptions(this._url, stream.httpHeaders),
        handleResponse
      );
    }

    this._request.on("error", reason => {
      this._storedError = reason;
      this._headersCapability.reject(reason);
    });
    // Note: `request.end(data)` is used to write `data` to request body
    // and notify end of request. But one should always call `request.end()`
    // even if there is no data to write -- (to notify the end of request).
    this._request.end();
  }
}

class PDFNodeStreamRangeReader extends BaseRangeReader {
  constructor(stream, start, end) {
    super(stream);

    this._httpHeaders = {};
    for (const property in stream.httpHeaders) {
      const value = stream.httpHeaders[property];
      if (typeof value === "undefined") {
        continue;
      }
      this._httpHeaders[property] = value;
    }
    this._httpHeaders.Range = `bytes=${start}-${end - 1}`;

    const handleResponse = response => {
      if (response.statusCode === 404) {
        const error = new MissingPDFException(`Missing PDF "${this._url}".`);
        this._storedError = error;
        return;
      }
      this._setReadableStream(response);
    };

    this._request = null;
    if (this._url.protocol === "http:") {
      this._request = http.request(
        createRequestOptions(this._url, this._httpHeaders),
        handleResponse
      );
    } else {
      this._request = https.request(
        createRequestOptions(this._url, this._httpHeaders),
        handleResponse
      );
    }

    this._request.on("error", reason => {
      this._storedError = reason;
    });
    this._request.end();
  }
}

class PDFNodeStreamFsFullReader extends BaseFullReader {
  constructor(stream) {
    super(stream);

    let path = decodeURIComponent(this._url.path);

    // Remove the extra slash to get right path from url like `file:///C:/`
    if (fileUriRegex.test(this._url.href)) {
      path = path.replace(/^\//, "");
    }

    fs.lstat(path, (error, stat) => {
      if (error) {
        if (error.code === "ENOENT") {
          error = new MissingPDFException(`Missing PDF "${path}".`);
        }
        this._storedError = error;
        this._headersCapability.reject(error);
        return;
      }
      // Setting right content length.
      this._contentLength = stat.size;

      this._setReadableStream(fs.createReadStream(path));
      this._headersCapability.resolve();
    });
  }
}

class PDFNodeStreamFsRangeReader extends BaseRangeReader {
  constructor(stream, start, end) {
    super(stream);

    let path = decodeURIComponent(this._url.path);

    // Remove the extra slash to get right path from url like `file:///C:/`
    if (fileUriRegex.test(this._url.href)) {
      path = path.replace(/^\//, "");
    }

    this._setReadableStream(fs.createReadStream(path, { start, end: end - 1 }));
  }
}

export { PDFNodeStream };
