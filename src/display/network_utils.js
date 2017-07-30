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

import { isInt } from '../shared/util';

function validateRangeRequestCapabilities({ getResponseHeader, isHttp,
                                            rangeChunkSize, disableRange, }) {
  let returnValues = {
    allowRangeRequests: false,
    suggestedLength: undefined,
  };
  if (disableRange || !isHttp) {
    return returnValues;
  }
  if (getResponseHeader('Accept-Ranges') !== 'bytes') {
    return returnValues;
  }

  let contentEncoding = getResponseHeader('Content-Encoding') || 'identity';
  if (contentEncoding !== 'identity') {
    return returnValues;
  }

  let length = getResponseHeader('Content-Length');
  length = parseInt(length, 10);
  if (!isInt(length)) {
    return returnValues;
  }

  returnValues.suggestedLength = length;
  if (length <= 2 * rangeChunkSize) {
    // The file size is smaller than the size of two chunks, so it does
    // not make any sense to abort the request and retry with a range
    // request.
    return returnValues;
  }

  returnValues.allowRangeRequests = true;
  return returnValues;
}

export {
  validateRangeRequestCapabilities,
};
