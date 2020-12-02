/* Copyright 2019 Mozilla Foundation
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
/* eslint no-var: error */

import { AbortException } from "../../src/shared/util.js";
import { PDFFetchStream } from "../../src/display/fetch_stream.js";

describe("fetch_stream", function () {
  const pdfUrl = new URL("../pdfs/tracemonkey.pdf", window.location).href;
  const pdfLength = 1016315;

  it("read with streaming", function (done) {
    const stream = new PDFFetchStream({
      url: pdfUrl,
      disableStream: false,
      disableRange: true,
    });

    const fullReader = stream.getFullReader();

    let isStreamingSupported, isRangeSupported;
    const promise = fullReader.headersReady.then(function () {
      isStreamingSupported = fullReader.isStreamingSupported;
      isRangeSupported = fullReader.isRangeSupported;
    });

    let len = 0;
    const read = function () {
      return fullReader.read().then(function (result) {
        if (result.done) {
          return undefined;
        }

        len += result.value.byteLength;
        return read();
      });
    };

    const readPromise = Promise.all([read(), promise]);
    readPromise
      .then(function () {
        expect(len).toEqual(pdfLength);
        expect(isStreamingSupported).toEqual(true);
        expect(isRangeSupported).toEqual(false);
        done();
      })
      .catch(done.fail);
  });

  it("read ranges with streaming", function (done) {
    const rangeSize = 32768;
    const stream = new PDFFetchStream({
      url: pdfUrl,
      rangeChunkSize: rangeSize,
      disableStream: false,
      disableRange: false,
    });

    const fullReader = stream.getFullReader();

    let isStreamingSupported, isRangeSupported, fullReaderCancelled;
    const promise = fullReader.headersReady.then(function () {
      isStreamingSupported = fullReader.isStreamingSupported;
      isRangeSupported = fullReader.isRangeSupported;
      // We shall be able to close full reader without any issue.
      fullReader.cancel(new AbortException("Don't need fullReader."));
      fullReaderCancelled = true;
    });

    const tailSize = pdfLength % rangeSize || rangeSize;
    const rangeReader1 = stream.getRangeReader(
      pdfLength - tailSize - rangeSize,
      pdfLength - tailSize
    );
    const rangeReader2 = stream.getRangeReader(pdfLength - tailSize, pdfLength);

    const result1 = { value: 0 },
      result2 = { value: 0 };
    const read = function (reader, lenResult) {
      return reader.read().then(function (result) {
        if (result.done) {
          return undefined;
        }

        lenResult.value += result.value.byteLength;
        return read(reader, lenResult);
      });
    };

    const readPromise = Promise.all([
      read(rangeReader1, result1),
      read(rangeReader2, result2),
      promise,
    ]);
    readPromise
      .then(function () {
        expect(isStreamingSupported).toEqual(true);
        expect(isRangeSupported).toEqual(true);
        expect(fullReaderCancelled).toEqual(true);
        expect(result1.value).toEqual(rangeSize);
        expect(result2.value).toEqual(tailSize);
        done();
      })
      .catch(done.fail);
  });
});
