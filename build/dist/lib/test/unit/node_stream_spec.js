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
'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _util = require('../../shared/util');

var _node_stream = require('../../display/node_stream');

(0, _util.assert)((0, _util.isNodeJS)());
var path = require('path');
var url = require('url');
var http = require('http');
var fs = require('fs');
describe('node_stream', function () {
  var server = null;
  var port = null;
  var pdf = url.parse(encodeURI('file://' + path.join(process.cwd(), './test/pdfs/tracemonkey.pdf'))).href;
  var pdfLength = 1016315;
  beforeAll(function (done) {
    server = http.createServer(function (request, response) {
      var filePath = process.cwd() + '/test/pdfs' + request.url;
      fs.lstat(filePath, function (error, stat) {
        if (error) {
          response.writeHead(404);
          response.end('File ' + request.url + ' not found!');
          return;
        }
        if (!request.headers['range']) {
          var contentLength = stat.size;
          var stream = fs.createReadStream(filePath);
          response.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Length': contentLength,
            'Accept-Ranges': 'bytes'
          });
          stream.pipe(response);
        } else {
          var _request$headers$rang = request.headers['range'].split('=')[1].split('-').map(function (x) {
            return Number(x);
          }),
              _request$headers$rang2 = _slicedToArray(_request$headers$rang, 2),
              start = _request$headers$rang2[0],
              end = _request$headers$rang2[1];

          var _stream = fs.createReadStream(filePath, {
            start: start,
            end: end
          });
          response.writeHead(206, { 'Content-Type': 'application/pdf' });
          _stream.pipe(response);
        }
      });
    }).listen(0);
    port = server.address().port;
    done();
  });
  afterAll(function (done) {
    server.close();
    done();
  });
  it('read both http(s) and filesystem pdf files', function (done) {
    var stream1 = new _node_stream.PDFNodeStream({
      source: {
        url: 'http://127.0.0.1:' + port + '/tracemonkey.pdf',
        rangeChunkSize: 65536,
        disableStream: true
      },
      disableRange: true
    });
    var stream2 = new _node_stream.PDFNodeStream({
      source: {
        url: pdf,
        rangeChunkSize: 65536,
        disableStream: true
      },
      disableRange: true
    });
    var fullReader1 = stream1.getFullReader();
    var fullReader2 = stream2.getFullReader();
    var isStreamingSupported1 = void 0,
        isRangeSupported1 = void 0;
    var promise1 = fullReader1.headersReady.then(function () {
      isStreamingSupported1 = fullReader1.isStreamingSupported;
      isRangeSupported1 = fullReader1.isRangeSupported;
    });
    var isStreamingSupported2 = void 0,
        isRangeSupported2 = void 0;
    var promise2 = fullReader2.headersReady.then(function () {
      isStreamingSupported2 = fullReader2.isStreamingSupported;
      isRangeSupported2 = fullReader2.isRangeSupported;
    });
    var len1 = 0,
        len2 = 0;
    var read1 = function read1() {
      return fullReader1.read().then(function (result) {
        if (result.done) {
          return;
        }
        len1 += result.value.byteLength;
        return read1();
      });
    };
    var read2 = function read2() {
      return fullReader2.read().then(function (result) {
        if (result.done) {
          return;
        }
        len2 += result.value.byteLength;
        return read2();
      });
    };
    var readPromise = Promise.all([read1(), read2(), promise1, promise2]);
    readPromise.then(function (result) {
      expect(isStreamingSupported1).toEqual(false);
      expect(isRangeSupported1).toEqual(false);
      expect(isStreamingSupported2).toEqual(false);
      expect(isRangeSupported2).toEqual(false);
      expect(len1).toEqual(pdfLength);
      expect(len1).toEqual(len2);
      done();
    }).catch(function (reason) {
      done.fail(reason);
    });
  });
  it('read custom ranges for both http(s) and filesystem urls', function (done) {
    var rangeSize = 32768;
    var stream1 = new _node_stream.PDFNodeStream({
      source: {
        url: 'http://127.0.0.1:' + port + '/tracemonkey.pdf',
        length: pdfLength,
        rangeChunkSize: rangeSize,
        disableStream: true
      },
      disableRange: false
    });
    var stream2 = new _node_stream.PDFNodeStream({
      source: {
        url: pdf,
        length: pdfLength,
        rangeChunkSize: rangeSize,
        disableStream: true
      },
      disableRange: false
    });
    var fullReader1 = stream1.getFullReader();
    var fullReader2 = stream2.getFullReader();
    var isStreamingSupported1 = void 0,
        isRangeSupported1 = void 0,
        fullReaderCancelled1 = void 0;
    var isStreamingSupported2 = void 0,
        isRangeSupported2 = void 0,
        fullReaderCancelled2 = void 0;
    var promise1 = fullReader1.headersReady.then(function () {
      isStreamingSupported1 = fullReader1.isStreamingSupported;
      isRangeSupported1 = fullReader1.isRangeSupported;
      fullReader1.cancel('Don\'t need full reader');
      fullReaderCancelled1 = true;
    });
    var promise2 = fullReader2.headersReady.then(function () {
      isStreamingSupported2 = fullReader2.isStreamingSupported;
      isRangeSupported2 = fullReader2.isRangeSupported;
      fullReader2.cancel('Don\'t need full reader');
      fullReaderCancelled2 = true;
    });
    var tailSize = pdfLength % rangeSize || rangeSize;
    var range11Reader = stream1.getRangeReader(pdfLength - tailSize - rangeSize, pdfLength - tailSize);
    var range12Reader = stream1.getRangeReader(pdfLength - tailSize, pdfLength);
    var range21Reader = stream2.getRangeReader(pdfLength - tailSize - rangeSize, pdfLength - tailSize);
    var range22Reader = stream2.getRangeReader(pdfLength - tailSize, pdfLength);
    var result11 = { value: 0 },
        result12 = { value: 0 };
    var result21 = { value: 0 },
        result22 = { value: 0 };
    var read = function read(reader, lenResult) {
      return reader.read().then(function (result) {
        if (result.done) {
          return;
        }
        lenResult.value += result.value.byteLength;
        return read(reader, lenResult);
      });
    };
    var readPromises = Promise.all([read(range11Reader, result11), read(range12Reader, result12), read(range21Reader, result21), read(range22Reader, result22), promise1, promise2]);
    readPromises.then(function () {
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
      done();
    }).catch(function (reason) {
      done.fail(reason);
    });
  });
});