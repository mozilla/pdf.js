/* Copyright 2017 Mozilla Foundation
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

import { AbortException, ResponseException } from "../../src/shared/util.js";
import { PDFNetworkStream } from "../../src/display/network.js";
import { testCrossOriginRedirects } from "./common_pdfstream_tests.js";
import { TestPdfsServer } from "./test_utils.js";

describe("network", function () {
  const pdf1 = new URL("../pdfs/tracemonkey.pdf", window.location).href;
  const pdf1Length = 1016315;

  it("read without stream and range", async function () {
    const stream = new PDFNetworkStream({
      url: pdf1,
      rangeChunkSize: 65536,
      disableStream: true,
      disableRange: true,
    });

    const fullReader = stream.getFullReader();

    let isStreamingSupported, isRangeSupported;
    await fullReader.headersReady.then(function () {
      isStreamingSupported = fullReader.isStreamingSupported;
      isRangeSupported = fullReader.isRangeSupported;
    });

    let len = 0,
      count = 0;
    const read = function () {
      return fullReader.read().then(function (result) {
        if (result.done) {
          return undefined;
        }
        count++;
        len += result.value.byteLength;
        return read();
      });
    };

    await read();

    expect(len).toEqual(pdf1Length);
    expect(count).toEqual(1);
    expect(isStreamingSupported).toEqual(false);
    expect(isRangeSupported).toEqual(false);
  });

  it("read custom ranges", async function () {
    // We don't test on browsers that don't support range request, so
    // requiring this test to pass.
    const rangeSize = 32768;
    const stream = new PDFNetworkStream({
      url: pdf1,
      length: pdf1Length,
      rangeChunkSize: rangeSize,
      disableStream: true,
      disableRange: false,
    });

    const fullReader = stream.getFullReader();

    let isStreamingSupported, isRangeSupported, fullReaderCancelled;
    await fullReader.headersReady.then(function () {
      isStreamingSupported = fullReader.isStreamingSupported;
      isRangeSupported = fullReader.isRangeSupported;
      // we shall be able to close the full reader without issues
      fullReader.cancel(new AbortException("Don't need fullReader."));
      fullReaderCancelled = true;
    });

    // Skipping fullReader results, requesting something from the PDF end.
    const tailSize = pdf1Length % rangeSize || rangeSize;

    const range1Reader = stream.getRangeReader(
      pdf1Length - tailSize - rangeSize,
      pdf1Length - tailSize
    );
    const range2Reader = stream.getRangeReader(
      pdf1Length - tailSize,
      pdf1Length
    );

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
      read(range1Reader, result1),
      read(range2Reader, result2),
    ]);

    expect(result1.value).toEqual(rangeSize);
    expect(result2.value).toEqual(tailSize);
    expect(isStreamingSupported).toEqual(false);
    expect(isRangeSupported).toEqual(true);
    expect(fullReaderCancelled).toEqual(true);
  });

  it(`handle reading ranges with missing/invalid "Content-Range" header`, async function () {
    if (globalThis.chrome) {
      pending("Fails intermittently in Google Chrome.");
    }

    async function readRanges(mode) {
      const rangeSize = 32768;
      const stream = new PDFNetworkStream({
        url: `${pdf1}?test-network-break-ranges=${mode}`,
        length: pdf1Length,
        rangeChunkSize: rangeSize,
        disableStream: true,
        disableRange: false,
      });

      const fullReader = stream.getFullReader();

      await fullReader.headersReady;
      // Ensure that range requests are supported.
      expect(fullReader.isRangeSupported).toEqual(true);
      // We shall be able to close the full reader without issues.
      fullReader.cancel(new AbortException("Don't need fullReader."));

      const rangeReader = stream.getRangeReader(
        pdf1Length - rangeSize,
        pdf1Length
      );

      try {
        await rangeReader.read();

        // Shouldn't get here.
        expect(false).toEqual(true);
      } catch (ex) {
        expect(ex instanceof ResponseException).toEqual(true);
        expect(ex.status).toEqual(0);
        expect(ex.missing).toEqual(false);
      }
    }

    await Promise.all([readRanges("missing"), readRanges("invalid")]);
  });

  describe("Redirects", function () {
    beforeAll(async function () {
      await TestPdfsServer.ensureStarted();
    });

    afterAll(async function () {
      await TestPdfsServer.ensureStopped();
    });

    it("redirects allowed if all responses are same-origin", async function () {
      await testCrossOriginRedirects({
        PDFStreamClass: PDFNetworkStream,
        redirectIfRange: false,
        async testRangeReader(rangeReader) {
          await expectAsync(rangeReader.read()).toBeResolved();
        },
      });
    });

    it("redirects blocked if any response is cross-origin", async function () {
      await testCrossOriginRedirects({
        PDFStreamClass: PDFNetworkStream,
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
