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
    return TestPdfsServer.resolveURL("tracemonkey.pdf");
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
      rangeChunkSize: 32768,
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
    expect(isStreamingSupported).toBeTrue();
    expect(isRangeSupported).toBeFalse();
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
    const read = (reader, lenResult) =>
      reader.read().then(function (result) {
        if (result.done) {
          return undefined;
        }

        lenResult.value += result.value.byteLength;
        return read(reader, lenResult);
      });

    await Promise.all([
      read(rangeReader1, result1),
      read(rangeReader2, result2),
    ]);

    expect(isStreamingSupported).toBeTrue();
    expect(isRangeSupported).toBeTrue();
    expect(fullReaderCancelled).toBeTrue();
    expect(result1.value).toEqual(rangeSize);
    expect(result2.value).toEqual(tailSize);
  });

  it("rejects invalid Content-Range values", async function () {
    const fetchSpy = spyOn(globalThis, "fetch");
    for (const contentRange of [
      "bytes 0-32767/65536",
      "bytes 32768-65534/65536",
      "bytes 32768-65536/65536",
      "bytes 32768-65535/65535",
      "bytes 32768-65535/65536 trailing",
      "bytes 32768-65535/0",
      "bytes 32768-32767/65536",
      "bytes 32768-9007199254740992/9007199254740993",
    ]) {
      fetchSpy.and.resolveTo(
        new Response(new Uint8Array(0), {
          status: 206,
          headers: { "Content-Range": contentRange },
        })
      );
      const stream = new PDFFetchStream({
        url: getPdfUrl(),
        rangeChunkSize: 32768,
        disableStream: false,
        disableRange: false,
      });

      const rangeReader = stream.getRangeReader(32768, 65536);
      await expectAsync(rangeReader.read()).toBeRejectedWith(
        jasmine.objectContaining({ name: "ResponseException", status: 206 })
      );
    }
  });

  it("accepts a range clipped at the document's end", async function () {
    spyOn(globalThis, "fetch").and.resolveTo(
      new Response(new Uint8Array(5536), {
        status: 206,
        headers: { "Content-Range": "bytes 60000-65535/65536" },
      })
    );
    const stream = new PDFFetchStream({
      url: getPdfUrl(),
      rangeChunkSize: 32768,
      disableStream: false,
      disableRange: false,
    });

    const rangeReader = stream.getRangeReader(60000, 70000);
    const { value, done } = await rangeReader.read();
    expect(done).toBeFalse();
    expect(value.byteLength).toEqual(5536);
  });

  it("accepts a 206 response when Content-Range is unavailable", async function () {
    spyOn(globalThis, "fetch").and.resolveTo(
      new Response(new Uint8Array([1]), { status: 206 })
    );
    const stream = new PDFFetchStream({
      url: getPdfUrl(),
      rangeChunkSize: 32768,
      disableStream: false,
      disableRange: false,
    });

    const rangeReader = stream.getRangeReader(32768, 65536);
    const { value, done } = await rangeReader.read();
    expect(done).toBeFalse();
    expect(value.byteLength).toEqual(1);
  });

  it("accepts a complete range with an unknown document length", async function () {
    spyOn(globalThis, "fetch").and.resolveTo(
      new Response(new Uint8Array(32768), {
        status: 206,
        headers: { "Content-Range": "bytes 32768-65535/*" },
      })
    );
    const stream = new PDFFetchStream({
      url: getPdfUrl(),
      rangeChunkSize: 32768,
      disableStream: false,
      disableRange: false,
    });

    const rangeReader = stream.getRangeReader(32768, 65536);
    const { value, done } = await rangeReader.read();
    expect(done).toBeFalse();
    expect(value.byteLength).toEqual(32768);
  });

  it("rejects a Content-Range with an inconsistent document length", async function () {
    spyOn(globalThis, "fetch").and.callFake(async (_url, { headers }) => {
      if (headers.has("Range")) {
        return new Response(new Uint8Array(32768), {
          status: 206,
          headers: { "Content-Range": "bytes 32768-65535/262144" },
        });
      }
      return new Response(new Uint8Array(131072), {
        status: 200,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": "131072",
        },
      });
    });
    const stream = new PDFFetchStream({
      url: getPdfUrl(),
      rangeChunkSize: 32768,
      disableStream: false,
      disableRange: false,
    });
    const fullReader = stream.getFullReader();
    await fullReader.headersReady;
    fullReader.cancel(new AbortException("Don't need fullReader."));

    const rangeReader = stream.getRangeReader(32768, 65536);
    await expectAsync(rangeReader.read()).toBeRejectedWith(
      jasmine.objectContaining({ name: "ResponseException", status: 206 })
    );
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
