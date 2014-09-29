/* Copyright 2012 Mozilla Foundation
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
/* globals NetworkManager */

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs/core/chunked_stream', ['exports', 'pdfjs/shared/util'],
      factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('../shared/util.js'));
  } else {
    factory((root.pdfjsCoreChunkedStream = {}), root.pdfjsSharedUtil);
  }
}(this, function (exports, sharedUtil) {

var MissingDataException = sharedUtil.MissingDataException;
var arrayByteLength = sharedUtil.arrayByteLength;
var arraysToBytes = sharedUtil.arraysToBytes;
var assert = sharedUtil.assert;
var createPromiseCapability = sharedUtil.createPromiseCapability;
var isInt = sharedUtil.isInt;
var isEmptyObj = sharedUtil.isEmptyObj;

/* If the length of stream is less than ALLOCATE_NO_CHUNKS_SIZE then use
ChunkedStreamContinuous which works with single block of memory */
var ALLOCATE_NO_CHUNKS_SIZE = 4 * 1024 * 1024;

/* Base abstract class for Continuous and Fragmented versions
of chunked stream. Loads PDF data in chunks or by progressive downloads */
var ChunkedStreamBase = (function ChunkedStreamBaseClosure() {
  function ChunkedStreamBase(length, chunkSize, manager) {
    this.initialChunk = null;
    this.totalLength = length;
    this.start = 0;
    this.pos = 0;
    this.end = length;
    this.chunkSize = chunkSize;
    this.loadedChunks = [];
    this.numChunksLoaded = 0;
    this.numChunks = Math.ceil(length / chunkSize);
    this.manager = manager;
    this.progressiveDataLength = 0;
    this.progressiveData = null;
    this.progressiveDataChunkPosition = 0;
    this.bufferCache = [];
  }

  // required methods for a stream. if a particular stream does not
  // implement these, an error should be thrown
  ChunkedStreamBase.prototype = {
    prepareBufferNop : function() {},

    getMissingChunks: function ChunkedStreamBase_getMissingChunks() {
      var chunks = [];
      for (var chunk = 0, n = this.numChunks; chunk < n; ++chunk) {
        if (!this.loadedChunks[chunk]) {
          chunks.push(chunk);
        }
      }
      return chunks;
    },

    getBaseStreams: function ChunkedStreamBase_getBaseStreams() {
      return [this];
    },

    allChunksLoaded: function ChunkedStreamBase_allChunksLoaded() {
      return this.numChunksLoaded === this.numChunks;
    },

    onReceiveData: function ChunkedStreamBase_onReceiveData(begin, chunk) {
      throw new Error('Abstract method ChunkedStreamBase.onReceiveData');
    },

    onReceiveProgressiveData: function
        ChunkedStreamBase_onReceiveProgressiveData(data) {
      throw new Error('ChunkedStreamBase.onReceiveProgressiveData');
    },

    ensureByte: function ChunkedStreamBase_ensureByte(pos) {
      this.prepareBuffer(pos, pos + 1);
    },

    ensureRange: function ChunkedStreamBase_ensureRange(begin, end) {
      if (begin >= end) {
        return;
      }

      this.prepareBuffer(begin, end);
    },

    nextEmptyChunk: function ChunkedStreamBase_nextEmptyChunk(beginChunk) {
      var chunk, n;
      for (chunk = beginChunk, n = this.numChunks; chunk < n; ++chunk) {
        if (!this.loadedChunks[chunk]) {
          return chunk;
        }
      }
      // Wrap around to beginning
      for (chunk = 0; chunk < beginChunk; ++chunk) {
        if (!this.loadedChunks[chunk]) {
          return chunk;
        }
      }
      return null;
    },

    hasChunk: function ChunkedStreamBase_hasChunk(chunk) {
      return !!this.loadedChunks[chunk];
    },

    get length() {
      return this.end - this.start;
    },

    get isEmpty() {
      return this.length === 0;
    },

    getByte: function ChunkedStreamBase_getByte() {
      var pos = this.pos;
      if (pos >= this.end) {
        return -1;
      }
      var buffer = this.buffer;
      var bufferStart = buffer.start;

      if (pos >= bufferStart && pos < buffer.end) {
        this.pos++;
        return buffer.buffer[pos - buffer.startOffset];
      }

      this.prepareBuffer(pos, pos + 1);
      var byte = this.buffer.buffer[pos - this.buffer.startOffset];

      this.pos++;
      return byte;
    },

    getUint16: function ChunkedStreamBase_getUint16() {
      var pos = this.pos;
      this.prepareBuffer(pos, pos + 2);
      var b0 = this.buffer.buffer[pos - this.buffer.startOffset];
      var b1 = this.buffer.buffer[pos + 1 - this.buffer.startOffset];

      this.pos += 2;
      if (b0 === -1 || b1 === -1) {
        return -1;
      }
      return (b0 << 8) + b1;
    },

    getInt32: function ChunkedStreamBase_getInt32() {
      var pos = this.pos;
      this.prepareBuffer(pos, pos + 4);

      var b0 = this.buffer.buffer[pos - this.buffer.startOffset];
      var b1 = this.buffer.buffer[pos + 1 - this.buffer.startOffset];
      var b2 = this.buffer.buffer[pos + 2 - this.buffer.startOffset];
      var b3 = this.buffer.buffer[pos + 3 - this.buffer.startOffset];

      this.pos += 4;
      return (b0 << 24) + (b1 << 16) + (b2 << 8) + b3;
    },

    // returns subarray of original buffer
    // should only be read
    getBytes: function ChunkedStreamBase_getBytes(length) {
      var pos = this.pos;
      var strEnd = this.end;

      if (!length) {
        this.ensureRange(pos, strEnd);

        return this.buffer.buffer.subarray(pos - this.buffer.startOffset,
                                           strEnd - this.buffer.startOffset);
      }

      var end = pos + length;
      if (end > strEnd) {
        end = strEnd;
      }
      this.ensureRange(pos, end);
      this.pos = end;
      return this.buffer.buffer.subarray(pos - this.buffer.startOffset,
                                         end - this.buffer.startOffset);
    },

    peekByte: function ChunkedStreamBase_peekByte() {
      var peekedByte = this.getByte();
      this.pos--;
      return peekedByte;
    },

    peekBytes: function ChunkedStreamBase_peekBytes(length) {
      var bytes = this.getBytes(length);
      this.pos -= bytes.length;
      return bytes;
    },

    getByteRange: function ChunkedStreamBase_getBytes(begin, end) {
      this.ensureRange(begin, end);
      return this.buffer.buffer.subarray(begin - this.buffer.startOffset,
                                         end - this.buffer.startOffset);
    },

    skip: function ChunkedStreamBase_skip(n) {
      if (!n) {
        n = 1;
      }
      this.pos += n;
    },

    reset: function ChunkedStreamBase_reset() {
      this.pos = this.start;
    },

    moveStart: function ChunkedStreamBase_moveStart() {
      this.start = this.pos;
    },

    makeSubStream: function ChunkedStreamBase_makeSubStream(start,
                                                            length, dict) {

      function ChunkedStreamSubstream() {}
      ChunkedStreamSubstream.prototype = Object.create(this);
      ChunkedStreamSubstream.prototype.getMissingChunks = function() {
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
      subStream.ensureRange(start, start + length);
      subStream.pos = subStream.start = start;
      subStream.end = start + length || this.end;
      subStream.dict = dict;
      subStream.totalLength = subStream.end - subStream.start;
      subStream.subStream = true;

      if (subStream.start >= subStream.buffer.start &&
          subStream.end <= subStream.buffer.end) {
        // Stream is fully loaded, use fast getByteMethod
        subStream.getByte = this.createGetByteFast(subStream.buffer.buffer,
                                                   subStream.end);
      }
      return subStream;
    },

    isStream: true
  };

  return ChunkedStreamBase;
})();

/* Chunked stream implementation that allocates all memory required for PDF in
 single continuous array. Better performing than its Fragmented version but
 not suitable for larger PDFs  as it will run out of memory. E.g. PDF size
 of 200MB will allocate 200MB even if no page  has been loaded yet.
 */

var ChunkedStreamContinuous = (function ChunkedStreamContinuousClosure() {
  function ChunkedStreamContinuous(length, chunkSize, manager) {
    ChunkedStreamBase.call(this, length, chunkSize, manager);
    this.buffer = {
      startOffset: 0,
      start: 0,
      end: 0,
      buffer: new Uint8Array(length)
    };
  }

  ChunkedStreamContinuous.prototype = Object.create(
      ChunkedStreamBase.prototype);

  ChunkedStreamContinuous.prototype.createGetByteFast =
    function ChunkedStreamFragmented_createGetByteFast(buffer, end) {
      return this.getByteFastContinuous(buffer, end);
    };

  ChunkedStreamContinuous.prototype.getByteFastContinuous = function
      ChunkedStreamContinuous_getByteFast(buffer, end) {
    var closureBuffer = buffer;
    var closureEnd = end;
    return function() {
      var pos = this.pos;
      if (pos >= closureEnd) {
        return -1;
      }
      this.pos++;
      return closureBuffer[pos];
    };
  };

  ChunkedStreamContinuous.prototype.onReceiveProgressiveData = function
      ChunkedStreamContinuous_onReceiveProgressiveDataContinuous(data) {

    var chunkSize = this.chunkSize;
    var position = this.progressiveDataLength;
    var beginChunk = Math.floor(position / this.chunkSize);

    this.buffer.buffer.set(new Uint8Array(data), position);
    position += data.byteLength;
    this.progressiveDataLength = position;
    var endChunk = position >= this.end ? this.numChunks :
        Math.floor(position / this.chunkSize);
    var chunkEnd = chunkSize * beginChunk + data.byteLength;

    for (var curChunk = beginChunk; curChunk < endChunk; ++curChunk) {
      if (!(curChunk in this.loadedChunks)) {
        this.loadedChunks[curChunk] = {
          chunkOffset: chunkSize * curChunk,
          start: 0,
          startOffset: 0,
          end: chunkEnd,
          data: this.buffer.buffer
        };
        ++this.numChunksLoaded;
      }
    }
    // Merge chunks to the left.
    curChunk = beginChunk - 1;
    while (curChunk >= 0 && this.loadedChunks[curChunk]) {
      this.loadedChunks[curChunk--].end = chunkEnd;
    }

    if (this.numChunksLoaded === this.numChunks) {
      // stream is fully loaded, switch to fast getByte
      this.buffer.start = 0;
      this.buffer.startOffset = 0;
      this.buffer.end = this.buffer.buffer.byteLength;
      this.prepareBuffer = this.prepareBufferNop;
      this.getByte = this.getByteFastContinuous(this.buffer.buffer, this.end);
    }
  };

  ChunkedStreamContinuous.prototype.prepareBuffer = function
      ChunkedStreamContinuous_prepareBufferContinuous(begin, end) {
    if (!end) {
      return;
    }

    // Checks if current buffer matches new [begin, end) parameters.
    if (this.buffer.start <= begin && end <= this.buffer.end ||
        end <= this.progressiveDataLength) {
      return;
    }

    // Checks if there is initial block
    if (this.initialChunk && this.initialChunk.start <= begin &&
        end <= this.initialChunk.end) {
      this.buffer = this.initialChunk;
      return;
    }

    var chunkSize = this.chunkSize;
    var beginChunk = Math.floor(begin / chunkSize);
    var endChunk = Math.floor((end - 1) / chunkSize) + 1;
    // Check if there are missing chunks.
    for (var chunk = beginChunk; chunk < endChunk; ++chunk) {
      if (!this.loadedChunks[chunk]) {
        throw new MissingDataException(begin, end);
      }
    }

    this.buffer.startOffset = 0;
    this.buffer.start = begin;
    this.buffer.end = end;
  };

  ChunkedStreamContinuous.prototype.onReceiveData = function
      ChunkedStreamContinuous_onReceiveDataContinuous(begin, chunk) {
    var chunkSize = this.chunkSize;
    var data = new Uint8Array(chunk);

    if (begin === 0 && data.byteLength % chunkSize !== 0) {
      this.initialChunk = {
        start: 0,
        startOffset: 0,
        end: 0,
        buffer: this.buffer.buffer
      };
      this.buffer.buffer.set(data, this.initialChunk.end);
      this.initialChunk.end += data.byteLength;

      if (data.byteLength > chunkSize) {
        data = data.subarray(0, data.byteLength -
        data.byteLength % chunkSize);
      } else {
        return;
      }
    }

    var end = begin + data.byteLength;
    assert(begin % chunkSize === 0, 'Bad begin offset: ' + begin);

    // Using this.length is inaccurate here since this.start can be moved
    // See ChunkedStreamBase.moveStart()
    var length = this.totalLength;
    var beginChunk = Math.floor(begin / chunkSize);
    var endChunk = Math.floor((end - 1) / chunkSize) + 1;

    this.buffer.buffer.set(data, beginChunk * chunkSize);

    assert(end % chunkSize === 0 || end === length,
        'Bad end offset: ' + end);

    var chunkEnd = chunkSize * beginChunk + data.byteLength;
    if (this.loadedChunks[endChunk]) {
      chunkEnd = this.loadedChunks[endChunk].end;
    }

    for (var curChunk = beginChunk; curChunk < endChunk; ++curChunk) {
      if (!this.loadedChunks[curChunk]) {
        this.loadedChunks[curChunk] = {
          chunkOffset: chunkSize * curChunk,
          start: 0,
          startOffset: 0,
          end: chunkEnd,
          data: this.buffer.buffer
        };
        ++this.numChunksLoaded;
      }
    }
    // Merge chunks to the left.
    curChunk = beginChunk - 1;
    while (curChunk >= 0 && this.loadedChunks[curChunk]) {
      this.loadedChunks[curChunk--].end = chunkEnd;
    }

    if (this.numChunksLoaded === this.numChunks) {
      // Stream is fully loaded, switch to fast getByte, prepareBuffer is no
      // longer needed since memory is continuous.
      this.initialChunk = null;
      this.buffer.start = 0;
      this.buffer.startOffset = 0;
      this.buffer.end = this.buffer.buffer.byteLength;
      this.getByte = this.getByteFastContinuous(this.buffer.buffer, this.end);
      this.prepareBuffer = this.prepareBufferNop;
    }
  };

  return ChunkedStreamContinuous;
})();

/* Fragmented version of ChunkedStream. Will allocate memory as needed.
 Much more memory efficient for large PDF especially if not all pages need
 to be loaded.
 */
var ChunkedStreamFragmented = (function ChunkedStreamFragmentedClosure() {

  function ChunkedStreamFragmented(length, chunkSize, manager) {
    ChunkedStreamBase.call(this, length, chunkSize, manager);
    this.buffer = {
      startOffset: -1,
      start: -1,
      end: -1,
      buffer: null
    };
  }

  ChunkedStreamFragmented.prototype = Object.create(
                                      ChunkedStreamBase.prototype);


  ChunkedStreamFragmented.prototype.createGetByteFast =
      function ChunkedStreamFragmented_createGetByteFast() {
    return this.getByteFast;
  };

  ChunkedStreamFragmented.prototype.getByteFast =
      function ChunkedStreamFragmented_getByteFastChunked() {
    var pos = this.pos;
    if (pos >= this.end) {
      return -1;
    }
    var buffer = this.buffer;

    this.pos++;
    return buffer.buffer[pos - buffer.startOffset];
  };

  ChunkedStreamFragmented.prototype.onReceiveProgressiveData = function
      ChunkedStreamBase_onReceiveProgressiveDataChunked(data) {

    data = new Uint8Array(data);
    // progressiveDataLength is always aligned with chunk offsets.
    var position = this.progressiveDataLength;

    // First progressive data should be usable even if it is smaller than
    // chunk size.
    if (position === 0) {
      if (!this.initialChunk) {
        this.initialChunk = {
          start: 0,
          startOffset: 0,
          end: 0,
          buffer: new Uint8Array(Math.max(this.chunkSize, data.byteLength))
        };
      }
      this.initialChunk.buffer.set(
          data.subarray(0, Math.min(this.initialChunk.buffer.byteLength -
          this.initialChunk.end, data.byteLength)), this.initialChunk.end);
      this.initialChunk.end += data.byteLength;
    }

    var end = Math.min(position + data.byteLength +
    this.progressiveDataChunkPosition, this.end);

    var receiveData;
    var receiveDataSize = Math.floor((data.byteLength +
        this.progressiveDataChunkPosition) /
        this.chunkSize) * this.chunkSize;
    if (end === this.end) {
      receiveDataSize += end % this.chunkSize;
    }

    if (this.progressiveData === null) {
      // There is no stored progressive data yet.
      if (receiveDataSize === 0) {
        // Not enough data to fill a chunk.
        this.progressiveData = data;
        this.progressiveDataChunkPosition = data.byteLength;
        return;
      } else {
        // Enough data for one chunk or more.
        receiveData = data.subarray(0, receiveDataSize);
        if (data.byteLength > receiveDataSize) {
          // Leftover data
          this.progressiveData = data.subarray(receiveDataSize);
          this.progressiveDataChunkPosition = this.progressiveData.byteLength;
        } else {
          // Progress data size is aligned with chunk size (rare).
          this.progressiveData = null;
          this.progressiveDataChunkPosition = 0;
        }
      }
    } else {
      // Previous progress data that was not sent to onReceiveData exists.
      if (receiveDataSize > 0) {
        // Merged data will produce at least one chunk.
        receiveData = new Uint8Array(receiveDataSize);
        receiveData.set(
            this.progressiveData.subarray(0,
                this.progressiveDataChunkPosition));
        receiveData.set(data.subarray(0, receiveDataSize -
            this.progressiveDataChunkPosition),
            this.progressiveDataChunkPosition);

        var dataLeft = data.byteLength - (receiveDataSize -
            this.progressiveDataChunkPosition);
        if (dataLeft > 0) {
          // There is data left that won't be sent to onReceiveData yet.
          this.progressiveData = new Uint8Array(this.chunkSize);
          this.progressiveDataChunkPosition = dataLeft;
          this.progressiveData.set(data.subarray(data.byteLength -
          dataLeft));
        } else {
          this.progressiveData = null;
          this.progressiveDataChunkPosition = 0;
        }
      } else {
        // There is preexisting data but not enough to fill even one chunk.
        receiveData = new Uint8Array(this.chunkSize);
        receiveData.set(this.progressiveData, 0,
            this.progressiveDataChunkPosition);
        receiveData.set(data, this.progressiveDataChunkPosition);
        this.progressiveData = receiveData;
        this.progressiveDataChunkPosition += data.byteLength;
        return;
      }
    }

    this.onReceiveData(this.progressiveDataLength, receiveData);
    this.progressiveDataLength += receiveData.byteLength;
    if (this.initialChunk && this.progressiveDataLength >=
        this.initialChunk.end) {
      this.initialChunk = null;
    }
  };

  ChunkedStreamFragmented.prototype.onReceiveData =  function
      ChunkedStreamFragmented_onReceiveDataChunked(begin, chunk) {
    var chunkSize = this.chunkSize;
    var data = new Uint8Array(chunk);

    if (begin === 0 && data.byteLength % chunkSize !== 0 &&
        begin + data.byteLength !== this.end) {
      this.initialChunk = {
        start: 0,
        startOffset: 0,
        end: 0,
        buffer: new Uint8Array(Math.max(this.chunkSize, data.byteLength))
      };
      this.initialChunk.buffer.set(data, this.initialChunk.end);
      this.initialChunk.end += data.byteLength;

      if (data.byteLength > chunkSize) {
        data = data.subarray(0, data.byteLength -
        data.byteLength % chunkSize);
      } else {
        return;
      }
    }

    var end = begin + data.byteLength;
    assert(begin % chunkSize === 0, 'Bad begin offset: ' + begin);

    // Using this.length is inaccurate here since this.start can be moved
    // See ChunkedStreamBase.moveStart()
    var length = this.totalLength;
    var beginChunk = Math.floor(begin / chunkSize);
    var endChunk = Math.floor((end - 1) / chunkSize) + 1;

    assert(end % chunkSize === 0 || end === length,
        'Bad end offset: ' + end);

    for (var curChunk = beginChunk; curChunk < endChunk; ++curChunk) {
      if (!this.loadedChunks[curChunk]) {
        this.loadedChunks[curChunk] = {
          chunkOffset: chunkSize * (curChunk - beginChunk),
          start: begin,
          startOffset: begin,
          end: begin + data.byteLength,
          data: data
        };
        ++this.numChunksLoaded;
      }
    }
  };

  ChunkedStreamFragmented.prototype.prepareBuffer  = function
      ChunkedStreamFragmented_prepareBufferChunked(begin, end) {
    if (!end) {
      return;
    }

    // Checks if current buffer matches new [begin, end) parameters.
    if (this.buffer.start <= begin && end <= this.buffer.end) {
      return;
    }

    // Checks if there is initial block
    if (this.initialChunk && this.initialChunk.start <= begin &&
        end <= this.initialChunk.end) {
      this.buffer = this.initialChunk;
      return;
    }

    var chunkSize = this.chunkSize;
    var beginChunk = Math.floor(begin / chunkSize);
    var endChunk = Math.floor((end - 1) / chunkSize) + 1;
    // Check if there are missing chunks.
    for (var chunk = beginChunk; chunk < endChunk; ++chunk) {
      if (!this.loadedChunks[chunk]) {
        throw new MissingDataException(begin, end);
      }
    }

    // Check if we can reuse chunk data as buffer
    if (this.loadedChunks[beginChunk].data ===
        this.loadedChunks[endChunk - 1].data) {
      // Use chunk data as buffer.
      this.buffer = {
        start: this.loadedChunks[beginChunk].start,
        startOffset: this.loadedChunks[beginChunk].start,
        end: this.loadedChunks[beginChunk].end,
        buffer: this.loadedChunks[beginChunk].data
      };
      return;
    }
    var bufferSize = (endChunk - beginChunk + 1) * chunkSize;
    var bufferCacheLength = this.bufferCache.length;
    for (var i = 0;  i < bufferCacheLength; i++) {
      var cachedBuffer = this.bufferCache[i];
      if (cachedBuffer.start <= begin && end <= cachedBuffer.end) {
        this.buffer = cachedBuffer;
        return;
      }
    }

    this.buffer = {
      startOffset: beginChunk * chunkSize,
      start: beginChunk * chunkSize,
      end: beginChunk * chunkSize,
      buffer: new Uint8Array(bufferSize)
    };
    // copy data into buffer
    for (chunk = beginChunk; chunk <= endChunk; ++chunk) {
      var chunkInfo = this.loadedChunks[chunk];
      if (!chunkInfo) {
        continue;
      }
      var srcOffset = (chunk - beginChunk) * chunkSize;
      var srcEnd = Math.min(chunkInfo.chunkOffset + chunkSize,
          chunkInfo.data.byteLength);
      var part = chunkInfo.data.subarray(chunkInfo.chunkOffset, srcEnd);
      this.buffer.end += part.byteLength;
      this.buffer.buffer.set(part, srcOffset);
    }
    this.bufferCache.push(this.buffer);
  };

  return ChunkedStreamFragmented;
})();

var ChunkedStreamManager = (function ChunkedStreamManagerClosure() {

  function ChunkedStreamManager(pdfNetworkStream, args) {
    var chunkSize = args.rangeChunkSize;
    var length = args.length;

    if (length > ALLOCATE_NO_CHUNKS_SIZE) {
      this.stream = new ChunkedStreamFragmented(length, chunkSize, this);
    } else {
      this.stream = new ChunkedStreamContinuous(length, chunkSize, this);
    }

    this.length = length;
    this.chunkSize = chunkSize;
    this.pdfNetworkStream = pdfNetworkStream;
    this.url = args.url;
    this.disableAutoFetch = args.disableAutoFetch;
    this.msgHandler = args.msgHandler;

    this.currRequestId = 0;

    this.chunksNeededByRequest = Object.create(null);
    this.requestsByChunk = Object.create(null);
    this.promisesByRequest = Object.create(null);
    this.progressiveDataLength = 0;
    this.aborted = false;

    this._loadedStreamCapability = createPromiseCapability();
  }

  ChunkedStreamManager.prototype = {
    onLoadedStream: function ChunkedStreamManager_getLoadedStream() {
      return this._loadedStreamCapability.promise;
    },

    sendRequest: function ChunkedStreamManager_sendRequest(begin, end) {
      var rangeReader = this.pdfNetworkStream.getRangeReader(begin, end);
      if (!rangeReader.isStreamingSupported) {
        rangeReader.onProgress = this.onProgress.bind(this);
      }
      var chunks = [], loaded = 0;
      var manager = this;
      var promise = new Promise(function (resolve, reject) {
        var readChunk = function (chunk) {
          try {
            if (!chunk.done) {
              var data = chunk.value;
              chunks.push(data);
              loaded += arrayByteLength(data);
              if (rangeReader.isStreamingSupported) {
                manager.onProgress({loaded: loaded});
              }
              rangeReader.read().then(readChunk, reject);
              return;
            }
            var chunkData = arraysToBytes(chunks);
            chunks = null;
            resolve(chunkData);
          } catch (e) {
            reject(e);
          }
        };
        rangeReader.read().then(readChunk, reject);
      });
      promise.then(function (data) {
        if (this.aborted) {
          return; // ignoring any data after abort
        }
        this.onReceiveData({chunk: data, begin: begin});
      }.bind(this));
      // TODO check errors
    },

    // Get all the chunks that are not yet loaded and groups them into
    // contiguous ranges to load in as few requests as possible
    requestAllChunks: function ChunkedStreamManager_requestAllChunks() {
      var missingChunks = this.stream.getMissingChunks();
      this._requestChunks(missingChunks);
      return this._loadedStreamCapability.promise;
    },

    _requestChunks: function ChunkedStreamManager_requestChunks(chunks) {
      var requestId = this.currRequestId++;

      var i, ii;
      var chunksNeeded = Object.create(null);
      this.chunksNeededByRequest[requestId] = chunksNeeded;
      for (i = 0, ii = chunks.length; i < ii; i++) {
        if (!this.stream.hasChunk(chunks[i])) {
          chunksNeeded[chunks[i]] = true;
        }
      }

      if (isEmptyObj(chunksNeeded)) {
        return Promise.resolve();
      }

      var capability = createPromiseCapability();
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

      for (i = 0; i < groupedChunksToRequest.length; ++i) {
        var groupedChunk = groupedChunksToRequest[i];
        var begin = groupedChunk.beginChunk * this.chunkSize;
        var end = Math.min(groupedChunk.endChunk * this.chunkSize, this.length);
        this.sendRequest(begin, end);
      }

      return capability.promise;
    },

    getStream: function ChunkedStreamManager_getStream() {
      return this.stream;
    },

    // Loads any chunks in the requested range that are not yet loaded
    requestRange: function ChunkedStreamManager_requestRange(begin, end) {

      end = Math.min(end, this.length);

      var beginChunk = this.getBeginChunk(begin);
      var endChunk = this.getEndChunk(end);

      var chunks = [];
      for (var chunk = beginChunk; chunk < endChunk; ++chunk) {
        chunks.push(chunk);
      }

      return this._requestChunks(chunks);
    },

    requestRanges: function ChunkedStreamManager_requestRanges(ranges) {
      ranges = ranges || [];
      var chunksToRequest = [];

      for (var i = 0; i < ranges.length; i++) {
        var beginChunk = this.getBeginChunk(ranges[i].begin);
        var endChunk = this.getEndChunk(ranges[i].end);
        for (var chunk = beginChunk; chunk < endChunk; ++chunk) {
          if (chunksToRequest.indexOf(chunk) < 0) {
            chunksToRequest.push(chunk);
          }
        }
      }

      chunksToRequest.sort(function(a, b) { return a - b; });
      return this._requestChunks(chunksToRequest);
    },

    // Groups a sorted array of chunks into as few contiguous larger
    // chunks as possible
    groupChunks: function ChunkedStreamManager_groupChunks(chunks) {
      var groupedChunks = [];
      var beginChunk = -1;
      var prevChunk = -1;
      for (var i = 0; i < chunks.length; ++i) {
        var chunk = chunks[i];

        if (beginChunk < 0) {
          beginChunk = chunk;
        }

        if (prevChunk >= 0 && prevChunk + 1 !== chunk) {
          groupedChunks.push({ beginChunk: beginChunk,
                               endChunk: prevChunk + 1 });
          beginChunk = chunk;
        }
        if (i + 1 === chunks.length) {
          groupedChunks.push({ beginChunk: beginChunk,
                               endChunk: chunk + 1 });
        }

        prevChunk = chunk;
      }
      return groupedChunks;
    },

    onProgress: function ChunkedStreamManager_onProgress(args) {
      var bytesLoaded = (this.stream.numChunksLoaded * this.chunkSize +
                         args.loaded);
      this.msgHandler.send('DocProgress', {
        loaded: bytesLoaded,
        total: this.length
      });
    },

    onReceiveData: function ChunkedStreamManager_onReceiveData(args) {
      var chunk = args.chunk;
      var isProgressive = args.begin === undefined;
      var begin = isProgressive ? this.progressiveDataLength : args.begin;
      var end = begin + chunk.byteLength;

      var beginChunk = Math.floor(begin / this.chunkSize);
      var endChunk = end < this.length ? Math.floor(end / this.chunkSize) :
                                         Math.ceil(end / this.chunkSize);

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
      var i, requestId;
      for (chunk = beginChunk; chunk < endChunk; ++chunk) {
        // The server might return more chunks than requested
        var requestIds = this.requestsByChunk[chunk] || [];
        delete this.requestsByChunk[chunk];

        for (i = 0; i < requestIds.length; ++i) {
          requestId = requestIds[i];
          var chunksNeeded = this.chunksNeededByRequest[requestId];
          if (chunk in chunksNeeded) {
            delete chunksNeeded[chunk];
          }

          if (!isEmptyObj(chunksNeeded)) {
            continue;
          }

          loadedRequests.push(requestId);
        }
      }

      // If there are no pending requests, automatically fetch the next
      // unfetched chunk of the PDF
      if (!this.disableAutoFetch && isEmptyObj(this.requestsByChunk)) {
        var nextEmptyChunk;
        if (this.stream.numChunksLoaded === 1) {
          // This is a special optimization so that after fetching the first
          // chunk, rather than fetching the second chunk, we fetch the last
          // chunk.
          var lastChunk = this.stream.numChunks - 1;
          if (!this.stream.hasChunk(lastChunk)) {
            nextEmptyChunk = lastChunk;
          }
        } else {
          nextEmptyChunk = this.stream.nextEmptyChunk(endChunk);
        }
        if (isInt(nextEmptyChunk)) {
          this._requestChunks([nextEmptyChunk]);
        }
      }

      for (i = 0; i < loadedRequests.length; ++i) {
        requestId = loadedRequests[i];
        var capability = this.promisesByRequest[requestId];
        delete this.promisesByRequest[requestId];
        capability.resolve();
      }

      this.msgHandler.send('DocProgress', {
        loaded: this.stream.numChunksLoaded * this.chunkSize,
        total: this.length
      });
    },

    onError: function ChunkedStreamManager_onError(err) {
      this._loadedStreamCapability.reject(err);
    },

    getBeginChunk: function ChunkedStreamManager_getBeginChunk(begin) {
      var chunk = Math.floor(begin / this.chunkSize);
      return chunk;
    },

    getEndChunk: function ChunkedStreamManager_getEndChunk(end) {
      var chunk = Math.floor((end - 1) / this.chunkSize) + 1;
      return chunk;
    },

    abort: function ChunkedStreamManager_abort() {
      this.aborted = true;
      if (this.pdfNetworkStream) {
        this.pdfNetworkStream.cancelAllRequests('abort');
      }
      for(var requestId in this.promisesByRequest) {
        var capability = this.promisesByRequest[requestId];
        capability.reject(new Error('Request was aborted'));
      }
    }
  };

  return ChunkedStreamManager;
})();


exports.ChunkedStreamFragmented = ChunkedStreamFragmented;
exports.ChunkedStreamContinuous = ChunkedStreamContinuous;
exports.ChunkedStreamBase = ChunkedStreamBase;
exports.ChunkedStreamManager = ChunkedStreamManager;

}));
