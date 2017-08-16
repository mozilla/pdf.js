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

import { PDFNetworkStream } from '../../src/display/network';

describe('network', function() {
  var pdf1 = new URL('../pdfs/tracemonkey.pdf', window.location).href;
  var pdf1Length = 1016315;
  var pdf2 = new URL('../pdfs/pdf.pdf', window.location).href;
  var pdf2Length = 32472771;

  it('read without stream and range', function(done) {
    var stream = new PDFNetworkStream({
      source: {
        url: pdf1,
        rangeChunkSize: 65536,
        disableStream: true,
      },
      disableRange: true,
    });

    var fullReader = stream.getFullReader();

    var isStreamingSupported, isRangeSupported;
    var promise = fullReader.headersReady.then(function () {
      isStreamingSupported = fullReader.isStreamingSupported;
      isRangeSupported = fullReader.isRangeSupported;
    });

    var len = 0, count = 0;
    var read = function () {
      return fullReader.read().then(function (result) {
        if (result.done) {
          return;
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
    }).catch(function (reason) {
      done.fail(reason);
    });
  });

  it('read with streaming', function(done) {
    var userAgent = window.navigator.userAgent;
    // The test is valid for FF only: the XHR has support of the
    // 'moz-chunked-array' response type.
    // TODO enable for other browsers, e.g. when fetch/streams API is supported.
    var m = /Mozilla\/5.0.*?rv:(\d+).*? Gecko/.exec(userAgent);
    if (!m || m[1] < 9) {
      expect(true).toEqual(true);
      done();
      return;
    }

    var stream = new PDFNetworkStream({
      source: {
        url: pdf2,
        rangeChunkSize: 65536,
        disableStream: false,
      },
      disableRange: false,
    });

    var fullReader = stream.getFullReader();

    var isStreamingSupported, isRangeSupported;
    var promise = fullReader.headersReady.then(function () {
      isStreamingSupported = fullReader.isStreamingSupported;
      isRangeSupported = fullReader.isRangeSupported;
    });

    var len = 0, count = 0;
    var read = function () {
      return fullReader.read().then(function (result) {
        if (result.done) {
          return;
        }
        count++;
        len += result.value.byteLength;
        return read();
      });
    };

    var readPromise = Promise.all([read(), promise]);

    readPromise.then(function () {
      expect(len).toEqual(pdf2Length);
      expect(count).toBeGreaterThan(1);
      expect(isStreamingSupported).toEqual(true);
      expect(isRangeSupported).toEqual(true);
      done();
    }).catch(function (reason) {
      done.fail(reason);
    });
  });

  it('read custom ranges', function (done) {
    // We don't test on browsers that don't support range request, so
    // requiring this test to pass.
    var rangeSize = 32768;
    var stream = new PDFNetworkStream({
      source: {
        url: pdf1,
        length: pdf1Length,
        rangeChunkSize: rangeSize,
        disableStream: true,
      },
      disableRange: false,
    });

    var fullReader = stream.getFullReader();

    var isStreamingSupported, isRangeSupported, fullReaderCancelled;
    var promise = fullReader.headersReady.then(function () {
      isStreamingSupported = fullReader.isStreamingSupported;
      isRangeSupported = fullReader.isRangeSupported;
      // we shall be able to close the full reader without issues
      fullReader.cancel('Don\'t need full reader');
      fullReaderCancelled = true;
    });

    // Skipping fullReader results, requesting something from the PDF end.
    var tailSize = (pdf1Length % rangeSize) || rangeSize;

    var range1Reader = stream.getRangeReader(pdf1Length - tailSize - rangeSize,
                                             pdf1Length - tailSize);
    var range2Reader = stream.getRangeReader(pdf1Length - tailSize, pdf1Length);

    var result1 = { value: 0, }, result2 = { value: 0, };
    var read = function (reader, lenResult) {
      return reader.read().then(function (result) {
        if (result.done) {
          return;
        }
        lenResult.value += result.value.byteLength;
        return read(reader, lenResult);
      });
    };

    var readPromises = Promise.all([read(range1Reader, result1),
                                    read(range2Reader, result2),
                                    promise]);

    readPromises.then(function () {
      expect(result1.value).toEqual(rangeSize);
      expect(result2.value).toEqual(tailSize);
      expect(isStreamingSupported).toEqual(false);
      expect(isRangeSupported).toEqual(true);
      expect(fullReaderCancelled).toEqual(true);
      done();
    }).catch(function (reason) {
      done.fail(reason);
    });
  });
});
