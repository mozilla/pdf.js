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

import { AbortException } from "../../src/shared/util.js";
import { PDFFetchStream } from "../../src/display/fetch_stream.js";
import { testCrossOriginRedirects } from "./common_pdfstream_tests.js";
import { TestPdfsServer } from "./test_utils.js";

describe("fetch_stream", function () {
  function getPdfUrl() {
    return TestPdfsServer.resolveURL("tracemonkey.pdf").href;
  }
  const pdfLength = 1016315;

  beforeAll(async function () {
    await TestPdfsServer.ensureStarted();
  });

  afterAll(async function () {
    await TestPdfsServer.ensureStopped();
  });

  it("read with streaming", async function () {
    const stream = new PDFFetchStream({
      url: getPdfUrl(),
      disableStream: false,
      disableRange: true,
    });

    const fullReader = stream.getFullReader();

    let isStreamingSupported, isRangeSupported;
    await fullReader.headersReady.then(function () {
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

    await read();

    expect(len).toEqual(pdfLength);
    expect(isStreamingSupported).toEqual(true);
    expect(isRangeSupported).toEqual(false);
  });

  it("read ranges with streaming", async function () {
    const rangeSize = 32768;
    const stream = new PDFFetchStream({
      url: getPdfUrl(),
      rangeChunkSize: rangeSize,
      disableStream: false,
      disableRange: false,
    });

    const fullReader = stream.getFullReader();

    let isStreamingSupported, isRangeSupported, fullReaderCancelled;
    await fullReader.headersReady.then(function () {
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

    await Promise.all([
      read(rangeReader1, result1),
      read(rangeReader2, result2),
    ]);

    expect(isStreamingSupported).toEqual(true);
    expect(isRangeSupported).toEqual(true);
    expect(fullReaderCancelled).toEqual(true);
    expect(result1.value).toEqual(rangeSize);
    expect(result2.value).toEqual(tailSize);
  });

  describe("Redirects", function () {
    it("redirects allowed if all responses are same-origin", async function () {
      await testCrossOriginRedirects({
        PDFStreamClass: PDFFetchStream,
        redirectIfRange: false,
        async testRangeReader(rangeReader) {
          await expectAsync(rangeReader.read()).toBeResolved();
        },
      });
    });

    it("redirects blocked if any response is cross-origin", async function () {
      await testCrossOriginRedirects({
        PDFStreamClass: PDFFetchStream,
        redirectIfRange: true,
        async testRangeReader(rangeReader) {
          // When read (sync), error should be reported.
          await expectAsync(rangeReader.read()).toBeRejectedWithError(
            /^Expected range response-origin "http:.*" to match "http:.*"\.$/
          );
          // When read again (async), error should be consistent.
          await expectAsync(rangeReader.read()).toBeRejectedWithError(
            /^Expected range response-origin "http:.*" to match "http:.*"\.$/
          );
        },
      });
    });
  });
});
