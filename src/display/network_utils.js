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

import { assert, ResponseException } from "../shared/util.js";
import { getFilenameFromContentDispositionHeader } from "./content_disposition.js";
import { isPdfFile } from "./display_utils.js";

function createHeaders(isHttp, httpHeaders) {
  const headers = new Headers();

  if (!isHttp || !httpHeaders || typeof httpHeaders !== "object") {
    return headers;
  }
  for (const key in httpHeaders) {
    const val = httpHeaders[key];
    if (val !== undefined) {
      headers.append(key, val);
    }
  }
  return headers;
}

function getResponseOrigin(url) {
  // Notably, null is distinct from "null" string (e.g. from file:-URLs).
  return URL.parse(url)?.origin ?? null;
}

function validateRangeRequestCapabilities({
  responseHeaders,
  isHttp,
  rangeChunkSize,
  disableRange,
}) {
  if (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) {
    assert(
      Number.isInteger(rangeChunkSize) && rangeChunkSize > 0,
      "rangeChunkSize must be an integer larger than zero."
    );
  }
  const returnValues = {
    allowRangeRequests: false,
    suggestedLength: undefined,
  };

  const length = parseInt(responseHeaders.get("Content-Length"), 10);
  if (!Number.isInteger(length)) {
    return returnValues;
  }

  returnValues.suggestedLength = length;

  if (length <= 2 * rangeChunkSize) {
    // The file size is smaller than the size of two chunks, so it does not
    // make any sense to abort the request and retry with a range request.
    return returnValues;
  }

  if (disableRange || !isHttp) {
    return returnValues;
  }
  if (responseHeaders.get("Accept-Ranges") !== "bytes") {
    return returnValues;
  }

  const contentEncoding = responseHeaders.get("Content-Encoding") || "identity";
  if (contentEncoding !== "identity") {
    return returnValues;
  }

  returnValues.allowRangeRequests = true;
  return returnValues;
}

function extractFilenameFromHeader(responseHeaders) {
  const contentDisposition = responseHeaders.get("Content-Disposition");
  if (contentDisposition) {
    let filename = getFilenameFromContentDispositionHeader(contentDisposition);
    if (filename.includes("%")) {
      try {
        filename = decodeURIComponent(filename);
      } catch {}
    }
    if (isPdfFile(filename)) {
      return filename;
    }
  }
  return null;
}

function createResponseError(status, url) {
  return new ResponseException(
    `Unexpected server response (${status}) while retrieving PDF "${url}".`,
    status,
    /* missing = */ status === 404 || (status === 0 && url.startsWith("file:"))
  );
}

function validateResponseStatus(status) {
  return status === 200 || status === 206;
}

export {
  createHeaders,
  createResponseError,
  extractFilenameFromHeader,
  getResponseOrigin,
  validateRangeRequestCapabilities,
  validateResponseStatus,
};
