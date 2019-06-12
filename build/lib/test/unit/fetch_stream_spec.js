/**
 * @licstart The following is the entire license notice for the
 * Javascript code in this page
 *
 * Copyright 2019 Mozilla Foundation
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
 *
 * @licend The above is the entire license notice for the
 * Javascript code in this page
 */
"use strict";

var _fetch_stream = require("../../display/fetch_stream");

describe('fetch_stream', function () {
  var pdfUrl = new URL('../pdfs/tracemonkey.pdf', window.location).href;
  var pdfLength = 1016315;
  it('read with streaming', function (done) {
    var stream = new _fetch_stream.PDFFetchStream({
      url: pdfUrl,
      disableStream: false,
      disableRange: true
    });
    var fullReader = stream.getFullReader();
    var isStreamingSupported, isRangeSupported;
    var promise = fullReader.headersReady.then(function () {
      isStreamingSupported = fullReader.isStreamingSupported;
      isRangeSupported = fullReader.isRangeSupported;
    });
    var len = 0;

    var read = function read() {
      return fullReader.read().then(function (result) {
        if (result.done) {
          return undefined;
        }

        len += result.value.byteLength;
        return read();
      });
    };

    var readPromise = Promise.all([read(), promise]);
    readPromise.then(function () {
      expect(len).toEqual(pdfLength);
      expect(isStreamingSupported).toEqual(true);
      expect(isRangeSupported).toEqual(false);
      done();
    })["catch"](done.fail);
  });
  it('read ranges with streaming', function (done) {
    var rangeSize = 32768;
    var stream = new _fetch_stream.PDFFetchStream({
      url: pdfUrl,
      rangeChunkSize: rangeSize,
      disableStream: false,
      disableRange: false
    });
    var fullReader = stream.getFullReader();
    var isStreamingSupported, isRangeSupported, fullReaderCancelled;
    var promise = fullReader.headersReady.then(function () {
      isStreamingSupported = fullReader.isStreamingSupported;
      isRangeSupported = fullReader.isRangeSupported;
      fullReader.cancel(new Error('Don\'t need full reader'));
      fullReaderCancelled = true;
    });
    var tailSize = pdfLength % rangeSize || rangeSize;
    var rangeReader1 = stream.getRangeReader(pdfLength - tailSize - rangeSize, pdfLength - tailSize);
    var rangeReader2 = stream.getRangeReader(pdfLength - tailSize, pdfLength);
    var result1 = {
      value: 0
    },
        result2 = {
      value: 0
    };

    var read = function read(reader, lenResult) {
      return reader.read().then(function (result) {
        if (result.done) {
          return undefined;
        }

        lenResult.value += result.value.byteLength;
        return read(reader, lenResult);
      });
    };

    var readPromise = Promise.all([read(rangeReader1, result1), read(rangeReader2, result2), promise]);
    readPromise.then(function () {
      expect(isStreamingSupported).toEqual(true);
      expect(isRangeSupported).toEqual(true);
      expect(fullReaderCancelled).toEqual(true);
      expect(result1.value).toEqual(rangeSize);
      expect(result2.value).toEqual(tailSize);
      done();
    })["catch"](done.fail);
  });
});