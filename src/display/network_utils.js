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
  assert,
  MissingPDFException,
  UnexpectedResponseException,
} from "../shared/util.js";
import { getFilenameFromContentDispositionHeader } from "./content_disposition.js";
import { isPdfFile } from "./display_utils.js";

function validateRangeRequestCapabilities({
  getResponseHeader,
  isHttp,
  rangeChunkSize,
  disableRange,
}) {
  assert(rangeChunkSize > 0, "Range chunk size must be larger than zero");
  const returnValues = {
    allowRangeRequests: false,
    suggestedLength: undefined,
  };

  const length = parseInt(getResponseHeader("Content-Length"), 10);
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
  if (getResponseHeader("Accept-Ranges") !== "bytes") {
    return returnValues;
  }

  const contentEncoding = getResponseHeader("Content-Encoding") || "identity";
  if (contentEncoding !== "identity") {
    return returnValues;
  }

  returnValues.allowRangeRequests = true;
  return returnValues;
}

function extractFilenameFromHeader(getResponseHeader) {
  const contentDisposition = getResponseHeader("Content-Disposition");
  if (contentDisposition) {
    let filename = getFilenameFromContentDispositionHeader(contentDisposition);
    if (filename.includes("%")) {
      try {
        filename = decodeURIComponent(filename);
      } catch (ex) {}
    }
    if (isPdfFile(filename)) {
      return filename;
    }
  }
  return null;
}

function createResponseStatusError(status, url) {
  if (status === 404 || (status === 0 && url.startsWith("file:"))) {
    return new MissingPDFException('Missing PDF "' + url + '".');
  }
  return new UnexpectedResponseException(
    `Unexpected server response (${status}) while retrieving PDF "${url}".`,
    status
  );
}

function validateResponseStatus(status) {
  return status === 200 || status === 206;
}

export {
  createResponseStatusError,
  extractFilenameFromHeader,
  validateRangeRequestCapabilities,
  validateResponseStatus,
};
