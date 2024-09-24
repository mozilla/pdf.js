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

import { AbortException, isNodeJS } from "../../src/shared/util.js";
import { createTemporaryNodeServer } from "./test_utils.js";
import { PDFNodeStream } from "../../src/display/node_stream.js";

// Ensure that these tests only run in Node.js environments.
if (!isNodeJS) {
  throw new Error(
    'The "node_stream" unit-tests can only be run in Node.js environments.'
  );
}

const url = await __non_webpack_import__("url");

describe("node_stream", function () {
  let tempServer = null;

  const cwdURL = url.pathToFileURL(process.cwd()) + "/";
  const pdf = new URL("./test/pdfs/tracemonkey.pdf", cwdURL).href;
  const pdfLength = 1016315;

  beforeAll(function () {
    tempServer = createTemporaryNodeServer();
  });

  afterAll(function () {
    // Close the server from accepting new connections after all test finishes.
    const { server } = tempServer;
    server.close();

    tempServer = null;
  });

  it("read both http(s) and filesystem pdf files", async function () {
    const stream1 = new PDFNodeStream({
      url: `http://127.0.0.1:${tempServer.port}/tracemonkey.pdf`,
      rangeChunkSize: 65536,
      disableStream: true,
      disableRange: true,
    });

    const stream2 = new PDFNodeStream({
      url: pdf,
      rangeChunkSize: 65536,
      disableStream: true,
      disableRange: true,
    });

    const fullReader1 = stream1.getFullReader();
    const fullReader2 = stream2.getFullReader();

    let isStreamingSupported1, isRangeSupported1;
    const promise1 = fullReader1.headersReady.then(() => {
      isStreamingSupported1 = fullReader1.isStreamingSupported;
      isRangeSupported1 = fullReader1.isRangeSupported;
    });

    let isStreamingSupported2, isRangeSupported2;
    const promise2 = fullReader2.headersReady.then(() => {
      isStreamingSupported2 = fullReader2.isStreamingSupported;
      isRangeSupported2 = fullReader2.isRangeSupported;
    });

    let len1 = 0,
      len2 = 0;
    const read1 = function () {
      return fullReader1.read().then(function (result) {
        if (result.done) {
          return undefined;
        }
        len1 += result.value.byteLength;
        return read1();
      });
    };
    const read2 = function () {
      return fullReader2.read().then(function (result) {
        if (result.done) {
          return undefined;
        }
        len2 += result.value.byteLength;
        return read2();
      });
    };

    await Promise.all([read1(), read2(), promise1, promise2]);

    expect(isStreamingSupported1).toEqual(false);
    expect(isRangeSupported1).toEqual(false);
    expect(isStreamingSupported2).toEqual(false);
    expect(isRangeSupported2).toEqual(false);
    expect(len1).toEqual(pdfLength);
    expect(len1).toEqual(len2);
  });

  it("read custom ranges for both http(s) and filesystem urls", async function () {
    const rangeSize = 32768;
    const stream1 = new PDFNodeStream({
      url: `http://127.0.0.1:${tempServer.port}/tracemonkey.pdf`,
      length: pdfLength,
      rangeChunkSize: rangeSize,
      disableStream: true,
      disableRange: false,
    });
    const stream2 = new PDFNodeStream({
      url: pdf,
      length: pdfLength,
      rangeChunkSize: rangeSize,
      disableStream: true,
      disableRange: false,
    });

    const fullReader1 = stream1.getFullReader();
    const fullReader2 = stream2.getFullReader();

    let isStreamingSupported1, isRangeSupported1, fullReaderCancelled1;
    let isStreamingSupported2, isRangeSupported2, fullReaderCancelled2;

    const promise1 = fullReader1.headersReady.then(function () {
      isStreamingSupported1 = fullReader1.isStreamingSupported;
      isRangeSupported1 = fullReader1.isRangeSupported;
      // we shall be able to close the full reader without issues
      fullReader1.cancel(new AbortException("Don't need fullReader1."));
      fullReaderCancelled1 = true;
    });

    const promise2 = fullReader2.headersReady.then(function () {
      isStreamingSupported2 = fullReader2.isStreamingSupported;
      isRangeSupported2 = fullReader2.isRangeSupported;
      fullReader2.cancel(new AbortException("Don't need fullReader2."));
      fullReaderCancelled2 = true;
    });

    // Skipping fullReader results, requesting something from the PDF end.
    const tailSize = pdfLength % rangeSize || rangeSize;

    const range11Reader = stream1.getRangeReader(
      pdfLength - tailSize - rangeSize,
      pdfLength - tailSize
    );
    const range12Reader = stream1.getRangeReader(
      pdfLength - tailSize,
      pdfLength
    );

    const range21Reader = stream2.getRangeReader(
      pdfLength - tailSize - rangeSize,
      pdfLength - tailSize
    );
    const range22Reader = stream2.getRangeReader(
      pdfLength - tailSize,
      pdfLength
    );

    const result11 = { value: 0 },
      result12 = { value: 0 };
    const result21 = { value: 0 },
      result22 = { value: 0 };

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
      read(range11Reader, result11),
      read(range12Reader, result12),
      read(range21Reader, result21),
      read(range22Reader, result22),
      promise1,
      promise2,
    ]);

    expect(result11.value).toEqual(rangeSize);
    expect(result12.value).toEqual(tailSize);
    expect(result21.value).toEqual(rangeSize);
    expect(result22.value).toEqual(tailSize);
    expect(isStreamingSupported1).toEqual(false);
    expect(isRangeSupported1).toEqual(true);
    expect(fullReaderCancelled1).toEqual(true);
    expect(isStreamingSupported2).toEqual(false);
    expect(isRangeSupported2).toEqual(true);
    expect(fullReaderCancelled2).toEqual(true);
  });
});
