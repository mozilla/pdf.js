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

var _network = require("../../display/network");

describe('network', function () {
  var pdf1 = new URL('../pdfs/tracemonkey.pdf', window.location).href;
  var pdf1Length = 1016315;
  it('read without stream and range', function (done) {
    var stream = new _network.PDFNetworkStream({
      url: pdf1,
      rangeChunkSize: 65536,
      disableStream: true,
      disableRange: true
    });
    var fullReader = stream.getFullReader();
    var isStreamingSupported, isRangeSupported;
    var promise = fullReader.headersReady.then(function () {
      isStreamingSupported = fullReader.isStreamingSupported;
      isRangeSupported = fullReader.isRangeSupported;
    });
    var len = 0,
        count = 0;

    var read = function read() {
      return fullReader.read().then(function (result) {
        if (result.done) {
          return undefined;
        }

        count++;
        len += result.value.byteLength;
        return read();
      });
    };

    var readPromise = Promise.all([read(), promise]);
    readPromise.then(function (page) {
      expect(len).toEqual(pdf1Length);
      expect(count).toEqual(1);
      expect(isStreamingSupported).toEqual(false);
      expect(isRangeSupported).toEqual(false);
      done();
    })["catch"](function (reason) {
      done.fail(reason);
    });
  });
  it('read custom ranges', function (done) {
    var rangeSize = 32768;
    var stream = new _network.PDFNetworkStream({
      url: pdf1,
      length: pdf1Length,
      rangeChunkSize: rangeSize,
      disableStream: true,
      disableRange: false
    });
    var fullReader = stream.getFullReader();
    var isStreamingSupported, isRangeSupported, fullReaderCancelled;
    var promise = fullReader.headersReady.then(function () {
      isStreamingSupported = fullReader.isStreamingSupported;
      isRangeSupported = fullReader.isRangeSupported;
      fullReader.cancel('Don\'t need full reader');
      fullReaderCancelled = true;
    });
    var tailSize = pdf1Length % rangeSize || rangeSize;
    var range1Reader = stream.getRangeReader(pdf1Length - tailSize - rangeSize, pdf1Length - tailSize);
    var range2Reader = stream.getRangeReader(pdf1Length - tailSize, pdf1Length);
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

    var readPromises = Promise.all([read(range1Reader, result1), read(range2Reader, result2), promise]);
    readPromises.then(function () {
      expect(result1.value).toEqual(rangeSize);
      expect(result2.value).toEqual(tailSize);
      expect(isStreamingSupported).toEqual(false);
      expect(isRangeSupported).toEqual(true);
      expect(fullReaderCancelled).toEqual(true);
      done();
    })["catch"](function (reason) {
      done.fail(reason);
    });
  });
});