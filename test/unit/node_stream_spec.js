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
import { PDFNodeStream } from "../../src/display/node_stream.js";

// Ensure that these tests only run in Node.js environments.
if (!isNodeJS) {
  throw new Error(
    'The "node_stream" unit-tests can only be run in Node.js environments.'
  );
}

describe("node_stream", function () {
  const url = process.getBuiltinModule("url");
  const cwdURL = url.pathToFileURL(process.cwd()) + "/";
  const pdf = new URL("./test/pdfs/tracemonkey.pdf", cwdURL).href;
  const pdfLength = 1016315;

  it("read filesystem pdf files", async function () {
    const stream = new PDFNodeStream({
      url: pdf,
      rangeChunkSize: 65536,
      disableStream: true,
      disableRange: true,
    });

    const fullReader = stream.getFullReader();

    let isStreamingSupported, isRangeSupported;
    const promise = fullReader.headersReady.then(() => {
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

    await Promise.all([read(), promise]);

    expect(isStreamingSupported).toEqual(false);
    expect(isRangeSupported).toEqual(false);
    expect(len).toEqual(pdfLength);
  });

  it("read custom ranges for filesystem urls", async function () {
    const rangeSize = 32768;
    const stream = new PDFNodeStream({
      url: pdf,
      length: pdfLength,
      rangeChunkSize: rangeSize,
      disableStream: true,
      disableRange: false,
    });

    const fullReader = stream.getFullReader();

    let isStreamingSupported, isRangeSupported, fullReaderCancelled;
    const promise = fullReader.headersReady.then(function () {
      isStreamingSupported = fullReader.isStreamingSupported;
      isRangeSupported = fullReader.isRangeSupported;
      // we shall be able to close the full reader without issues
      fullReader.cancel(new AbortException("Don't need fullReader."));
      fullReaderCancelled = true;
    });

    // Skipping fullReader results, requesting something from the PDF end.
    const tailSize = pdfLength % rangeSize || rangeSize;

    const range1Reader = stream.getRangeReader(
      pdfLength - tailSize - rangeSize,
      pdfLength - tailSize
    );
    const range2Reader = stream.getRangeReader(pdfLength - tailSize, pdfLength);

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
      promise,
    ]);

    expect(result1.value).toEqual(rangeSize);
    expect(result2.value).toEqual(tailSize);
    expect(isStreamingSupported).toEqual(false);
    expect(isRangeSupported).toEqual(true);
    expect(fullReaderCancelled).toEqual(true);
  });
});
