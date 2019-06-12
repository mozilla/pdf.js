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

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ChunkedStreamManager = exports.ChunkedStream = void 0;

var _util = require("../shared/util");

var _core_utils = require("./core_utils");

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

var ChunkedStream =
/*#__PURE__*/
function () {
  function ChunkedStream(length, chunkSize, manager) {
    _classCallCheck(this, ChunkedStream);

    this.bytes = new Uint8Array(length);
    this.start = 0;
    this.pos = 0;
    this.end = length;
    this.chunkSize = chunkSize;
    this.loadedChunks = [];
    this.numChunksLoaded = 0;
    this.numChunks = Math.ceil(length / chunkSize);
    this.manager = manager;
    this.progressiveDataLength = 0;
    this.lastSuccessfulEnsureByteChunk = -1;
  }

  _createClass(ChunkedStream, [{
    key: "getMissingChunks",
    value: function getMissingChunks() {
      var chunks = [];

      for (var chunk = 0, n = this.numChunks; chunk < n; ++chunk) {
        if (!this.loadedChunks[chunk]) {
          chunks.push(chunk);
        }
      }

      return chunks;
    }
  }, {
    key: "getBaseStreams",
    value: function getBaseStreams() {
      return [this];
    }
  }, {
    key: "allChunksLoaded",
    value: function allChunksLoaded() {
      return this.numChunksLoaded === this.numChunks;
    }
  }, {
    key: "onReceiveData",
    value: function onReceiveData(begin, chunk) {
      var chunkSize = this.chunkSize;

      if (begin % chunkSize !== 0) {
        throw new Error("Bad begin offset: ".concat(begin));
      }

      var end = begin + chunk.byteLength;

      if (end % chunkSize !== 0 && end !== this.bytes.length) {
        throw new Error("Bad end offset: ".concat(end));
      }

      this.bytes.set(new Uint8Array(chunk), begin);
      var beginChunk = Math.floor(begin / chunkSize);
      var endChunk = Math.floor((end - 1) / chunkSize) + 1;

      for (var curChunk = beginChunk; curChunk < endChunk; ++curChunk) {
        if (!this.loadedChunks[curChunk]) {
          this.loadedChunks[curChunk] = true;
          ++this.numChunksLoaded;
        }
      }
    }
  }, {
    key: "onReceiveProgressiveData",
    value: function onReceiveProgressiveData(data) {
      var position = this.progressiveDataLength;
      var beginChunk = Math.floor(position / this.chunkSize);
      this.bytes.set(new Uint8Array(data), position);
      position += data.byteLength;
      this.progressiveDataLength = position;
      var endChunk = position >= this.end ? this.numChunks : Math.floor(position / this.chunkSize);

      for (var curChunk = beginChunk; curChunk < endChunk; ++curChunk) {
        if (!this.loadedChunks[curChunk]) {
          this.loadedChunks[curChunk] = true;
          ++this.numChunksLoaded;
        }
      }
    }
  }, {
    key: "ensureByte",
    value: function ensureByte(pos) {
      if (pos < this.progressiveDataLength) {
        return;
      }

      var chunk = Math.floor(pos / this.chunkSize);

      if (chunk === this.lastSuccessfulEnsureByteChunk) {
        return;
      }

      if (!this.loadedChunks[chunk]) {
        throw new _core_utils.MissingDataException(pos, pos + 1);
      }

      this.lastSuccessfulEnsureByteChunk = chunk;
    }
  }, {
    key: "ensureRange",
    value: function ensureRange(begin, end) {
      if (begin >= end) {
        return;
      }

      if (end <= this.progressiveDataLength) {
        return;
      }

      var chunkSize = this.chunkSize;
      var beginChunk = Math.floor(begin / chunkSize);
      var endChunk = Math.floor((end - 1) / chunkSize) + 1;

      for (var chunk = beginChunk; chunk < endChunk; ++chunk) {
        if (!this.loadedChunks[chunk]) {
          throw new _core_utils.MissingDataException(begin, end);
        }
      }
    }
  }, {
    key: "nextEmptyChunk",
    value: function nextEmptyChunk(beginChunk) {
      var numChunks = this.numChunks;

      for (var i = 0; i < numChunks; ++i) {
        var chunk = (beginChunk + i) % numChunks;

        if (!this.loadedChunks[chunk]) {
          return chunk;
        }
      }

      return null;
    }
  }, {
    key: "hasChunk",
    value: function hasChunk(chunk) {
      return !!this.loadedChunks[chunk];
    }
  }, {
    key: "getByte",
    value: function getByte() {
      var pos = this.pos;

      if (pos >= this.end) {
        return -1;
      }

      this.ensureByte(pos);
      return this.bytes[this.pos++];
    }
  }, {
    key: "getUint16",
    value: function getUint16() {
      var b0 = this.getByte();
      var b1 = this.getByte();

      if (b0 === -1 || b1 === -1) {
        return -1;
      }

      return (b0 << 8) + b1;
    }
  }, {
    key: "getInt32",
    value: function getInt32() {
      var b0 = this.getByte();
      var b1 = this.getByte();
      var b2 = this.getByte();
      var b3 = this.getByte();
      return (b0 << 24) + (b1 << 16) + (b2 << 8) + b3;
    }
  }, {
    key: "getBytes",
    value: function getBytes(length) {
      var forceClamped = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
      var bytes = this.bytes;
      var pos = this.pos;
      var strEnd = this.end;

      if (!length) {
        this.ensureRange(pos, strEnd);

        var _subarray = bytes.subarray(pos, strEnd);

        return forceClamped ? new Uint8ClampedArray(_subarray) : _subarray;
      }

      var end = pos + length;

      if (end > strEnd) {
        end = strEnd;
      }

      this.ensureRange(pos, end);
      this.pos = end;
      var subarray = bytes.subarray(pos, end);
      return forceClamped ? new Uint8ClampedArray(subarray) : subarray;
    }
  }, {
    key: "peekByte",
    value: function peekByte() {
      var peekedByte = this.getByte();
      this.pos--;
      return peekedByte;
    }
  }, {
    key: "peekBytes",
    value: function peekBytes(length) {
      var forceClamped = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
      var bytes = this.getBytes(length, forceClamped);
      this.pos -= bytes.length;
      return bytes;
    }
  }, {
    key: "getByteRange",
    value: function getByteRange(begin, end) {
      this.ensureRange(begin, end);
      return this.bytes.subarray(begin, end);
    }
  }, {
    key: "skip",
    value: function skip(n) {
      if (!n) {
        n = 1;
      }

      this.pos += n;
    }
  }, {
    key: "reset",
    value: function reset() {
      this.pos = this.start;
    }
  }, {
    key: "moveStart",
    value: function moveStart() {
      this.start = this.pos;
    }
  }, {
    key: "makeSubStream",
    value: function makeSubStream(start, length, dict) {
      if (length) {
        this.ensureRange(start, start + length);
      } else {
        this.ensureByte(start);
      }

      function ChunkedStreamSubstream() {}

      ChunkedStreamSubstream.prototype = Object.create(this);

      ChunkedStreamSubstream.prototype.getMissingChunks = function () {
        var chunkSize = this.chunkSize;
        var beginChunk = Math.floor(this.start / chunkSize);
        var endChunk = Math.floor((this.end - 1) / chunkSize) + 1;
        var missingChunks = [];

        for (var chunk = beginChunk; chunk < endChunk; ++chunk) {
          if (!this.loadedChunks[chunk]) {
            missingChunks.push(chunk);
          }
        }

        return missingChunks;
      };

      var subStream = new ChunkedStreamSubstream();
      subStream.pos = subStream.start = start;
      subStream.end = start + length || this.end;
      subStream.dict = dict;
      return subStream;
    }
  }, {
    key: "length",
    get: function get() {
      return this.end - this.start;
    }
  }, {
    key: "isEmpty",
    get: function get() {
      return this.length === 0;
    }
  }]);

  return ChunkedStream;
}();

exports.ChunkedStream = ChunkedStream;

var ChunkedStreamManager =
/*#__PURE__*/
function () {
  function ChunkedStreamManager(pdfNetworkStream, args) {
    _classCallCheck(this, ChunkedStreamManager);

    this.length = args.length;
    this.chunkSize = args.rangeChunkSize;
    this.stream = new ChunkedStream(this.length, this.chunkSize, this);
    this.pdfNetworkStream = pdfNetworkStream;
    this.disableAutoFetch = args.disableAutoFetch;
    this.msgHandler = args.msgHandler;
    this.currRequestId = 0;
    this.chunksNeededByRequest = Object.create(null);
    this.requestsByChunk = Object.create(null);
    this.promisesByRequest = Object.create(null);
    this.progressiveDataLength = 0;
    this.aborted = false;
    this._loadedStreamCapability = (0, _util.createPromiseCapability)();
  }

  _createClass(ChunkedStreamManager, [{
    key: "onLoadedStream",
    value: function onLoadedStream() {
      return this._loadedStreamCapability.promise;
    }
  }, {
    key: "sendRequest",
    value: function sendRequest(begin, end) {
      var _this = this;

      var rangeReader = this.pdfNetworkStream.getRangeReader(begin, end);

      if (!rangeReader.isStreamingSupported) {
        rangeReader.onProgress = this.onProgress.bind(this);
      }

      var chunks = [],
          loaded = 0;
      var promise = new Promise(function (resolve, reject) {
        var readChunk = function readChunk(chunk) {
          try {
            if (!chunk.done) {
              var data = chunk.value;
              chunks.push(data);
              loaded += (0, _util.arrayByteLength)(data);

              if (rangeReader.isStreamingSupported) {
                _this.onProgress({
                  loaded: loaded
                });
              }

              rangeReader.read().then(readChunk, reject);
              return;
            }

            var chunkData = (0, _util.arraysToBytes)(chunks);
            chunks = null;
            resolve(chunkData);
          } catch (e) {
            reject(e);
          }
        };

        rangeReader.read().then(readChunk, reject);
      });
      promise.then(function (data) {
        if (_this.aborted) {
          return;
        }

        _this.onReceiveData({
          chunk: data,
          begin: begin
        });
      });
    }
  }, {
    key: "requestAllChunks",
    value: function requestAllChunks() {
      var missingChunks = this.stream.getMissingChunks();

      this._requestChunks(missingChunks);

      return this._loadedStreamCapability.promise;
    }
  }, {
    key: "_requestChunks",
    value: function _requestChunks(chunks) {
      var requestId = this.currRequestId++;
      var chunksNeeded = Object.create(null);
      this.chunksNeededByRequest[requestId] = chunksNeeded;
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = chunks[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var _chunk = _step.value;

          if (!this.stream.hasChunk(_chunk)) {
            chunksNeeded[_chunk] = true;
          }
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator["return"] != null) {
            _iterator["return"]();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      if ((0, _util.isEmptyObj)(chunksNeeded)) {
        return Promise.resolve();
      }

      var capability = (0, _util.createPromiseCapability)();
      this.promisesByRequest[requestId] = capability;
      var chunksToRequest = [];

      for (var chunk in chunksNeeded) {
        chunk = chunk | 0;

        if (!(chunk in this.requestsByChunk)) {
          this.requestsByChunk[chunk] = [];
          chunksToRequest.push(chunk);
        }

        this.requestsByChunk[chunk].push(requestId);
      }

      if (!chunksToRequest.length) {
        return capability.promise;
      }

      var groupedChunksToRequest = this.groupChunks(chunksToRequest);
      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = groupedChunksToRequest[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var groupedChunk = _step2.value;
          var begin = groupedChunk.beginChunk * this.chunkSize;
          var end = Math.min(groupedChunk.endChunk * this.chunkSize, this.length);
          this.sendRequest(begin, end);
        }
      } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion2 && _iterator2["return"] != null) {
            _iterator2["return"]();
          }
        } finally {
          if (_didIteratorError2) {
            throw _iteratorError2;
          }
        }
      }

      return capability.promise;
    }
  }, {
    key: "getStream",
    value: function getStream() {
      return this.stream;
    }
  }, {
    key: "requestRange",
    value: function requestRange(begin, end) {
      end = Math.min(end, this.length);
      var beginChunk = this.getBeginChunk(begin);
      var endChunk = this.getEndChunk(end);
      var chunks = [];

      for (var chunk = beginChunk; chunk < endChunk; ++chunk) {
        chunks.push(chunk);
      }

      return this._requestChunks(chunks);
    }
  }, {
    key: "requestRanges",
    value: function requestRanges() {
      var ranges = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
      var chunksToRequest = [];
      var _iteratorNormalCompletion3 = true;
      var _didIteratorError3 = false;
      var _iteratorError3 = undefined;

      try {
        for (var _iterator3 = ranges[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
          var range = _step3.value;
          var beginChunk = this.getBeginChunk(range.begin);
          var endChunk = this.getEndChunk(range.end);

          for (var chunk = beginChunk; chunk < endChunk; ++chunk) {
            if (!chunksToRequest.includes(chunk)) {
              chunksToRequest.push(chunk);
            }
          }
        }
      } catch (err) {
        _didIteratorError3 = true;
        _iteratorError3 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion3 && _iterator3["return"] != null) {
            _iterator3["return"]();
          }
        } finally {
          if (_didIteratorError3) {
            throw _iteratorError3;
          }
        }
      }

      chunksToRequest.sort(function (a, b) {
        return a - b;
      });
      return this._requestChunks(chunksToRequest);
    }
  }, {
    key: "groupChunks",
    value: function groupChunks(chunks) {
      var groupedChunks = [];
      var beginChunk = -1;
      var prevChunk = -1;

      for (var i = 0, ii = chunks.length; i < ii; ++i) {
        var chunk = chunks[i];

        if (beginChunk < 0) {
          beginChunk = chunk;
        }

        if (prevChunk >= 0 && prevChunk + 1 !== chunk) {
          groupedChunks.push({
            beginChunk: beginChunk,
            endChunk: prevChunk + 1
          });
          beginChunk = chunk;
        }

        if (i + 1 === chunks.length) {
          groupedChunks.push({
            beginChunk: beginChunk,
            endChunk: chunk + 1
          });
        }

        prevChunk = chunk;
      }

      return groupedChunks;
    }
  }, {
    key: "onProgress",
    value: function onProgress(args) {
      this.msgHandler.send('DocProgress', {
        loaded: this.stream.numChunksLoaded * this.chunkSize + args.loaded,
        total: this.length
      });
    }
  }, {
    key: "onReceiveData",
    value: function onReceiveData(args) {
      var chunk = args.chunk;
      var isProgressive = args.begin === undefined;
      var begin = isProgressive ? this.progressiveDataLength : args.begin;
      var end = begin + chunk.byteLength;
      var beginChunk = Math.floor(begin / this.chunkSize);
      var endChunk = end < this.length ? Math.floor(end / this.chunkSize) : Math.ceil(end / this.chunkSize);

      if (isProgressive) {
        this.stream.onReceiveProgressiveData(chunk);
        this.progressiveDataLength = end;
      } else {
        this.stream.onReceiveData(begin, chunk);
      }

      if (this.stream.allChunksLoaded()) {
        this._loadedStreamCapability.resolve(this.stream);
      }

      var loadedRequests = [];

      for (var _chunk2 = beginChunk; _chunk2 < endChunk; ++_chunk2) {
        var requestIds = this.requestsByChunk[_chunk2] || [];
        delete this.requestsByChunk[_chunk2];
        var _iteratorNormalCompletion4 = true;
        var _didIteratorError4 = false;
        var _iteratorError4 = undefined;

        try {
          for (var _iterator4 = requestIds[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
            var requestId = _step4.value;
            var chunksNeeded = this.chunksNeededByRequest[requestId];

            if (_chunk2 in chunksNeeded) {
              delete chunksNeeded[_chunk2];
            }

            if (!(0, _util.isEmptyObj)(chunksNeeded)) {
              continue;
            }

            loadedRequests.push(requestId);
          }
        } catch (err) {
          _didIteratorError4 = true;
          _iteratorError4 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion4 && _iterator4["return"] != null) {
              _iterator4["return"]();
            }
          } finally {
            if (_didIteratorError4) {
              throw _iteratorError4;
            }
          }
        }
      }

      if (!this.disableAutoFetch && (0, _util.isEmptyObj)(this.requestsByChunk)) {
        var nextEmptyChunk;

        if (this.stream.numChunksLoaded === 1) {
          var lastChunk = this.stream.numChunks - 1;

          if (!this.stream.hasChunk(lastChunk)) {
            nextEmptyChunk = lastChunk;
          }
        } else {
          nextEmptyChunk = this.stream.nextEmptyChunk(endChunk);
        }

        if (Number.isInteger(nextEmptyChunk)) {
          this._requestChunks([nextEmptyChunk]);
        }
      }

      for (var _i = 0, _loadedRequests = loadedRequests; _i < _loadedRequests.length; _i++) {
        var _requestId = _loadedRequests[_i];
        var capability = this.promisesByRequest[_requestId];
        delete this.promisesByRequest[_requestId];
        capability.resolve();
      }

      this.msgHandler.send('DocProgress', {
        loaded: this.stream.numChunksLoaded * this.chunkSize,
        total: this.length
      });
    }
  }, {
    key: "onError",
    value: function onError(err) {
      this._loadedStreamCapability.reject(err);
    }
  }, {
    key: "getBeginChunk",
    value: function getBeginChunk(begin) {
      return Math.floor(begin / this.chunkSize);
    }
  }, {
    key: "getEndChunk",
    value: function getEndChunk(end) {
      return Math.floor((end - 1) / this.chunkSize) + 1;
    }
  }, {
    key: "abort",
    value: function abort() {
      this.aborted = true;

      if (this.pdfNetworkStream) {
        this.pdfNetworkStream.cancelAllRequests('abort');
      }

      for (var requestId in this.promisesByRequest) {
        this.promisesByRequest[requestId].reject(new Error('Request was aborted'));
      }
    }
  }]);

  return ChunkedStreamManager;
}();

exports.ChunkedStreamManager = ChunkedStreamManager;