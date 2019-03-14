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

import { isDict, isStream } from './primitives';
import { DecodeStream } from './stream';
import { Jbig2Image } from './jbig2';
import { shadow } from '../shared/util';

/**
 * For JBIG2's we use a library to decode these images and
 * the stream behaves like all the other DecodeStreams.
 */
let Jbig2Stream = (function Jbig2StreamClosure() {
  function Jbig2Stream(stream, maybeLength, dict, params) {
    this.stream = stream;
    this.maybeLength = maybeLength;
    this.dict = dict;
    this.params = params;

    DecodeStream.call(this, maybeLength);
  }

  Jbig2Stream.prototype = Object.create(DecodeStream.prototype);

  Object.defineProperty(Jbig2Stream.prototype, 'bytes', {
    get() {
      // If `this.maybeLength` is null, we'll get the entire stream.
      return shadow(this, 'bytes', this.stream.getBytes(this.maybeLength));
    },
    configurable: true,
  });

  Jbig2Stream.prototype.ensureBuffer = function(requested) {
    // No-op, since `this.readBlock` will always parse the entire image and
    // directly insert all of its data into `this.buffer`.
  };

  Jbig2Stream.prototype.readBlock = function() {
    if (this.eof) {
      return;
    }
    let jbig2Image = new Jbig2Image();

    let chunks = [];
    if (isDict(this.params)) {
      let globalsStream = this.params.get('JBIG2Globals');
      if (isStream(globalsStream)) {
        let globals = globalsStream.getBytes();
        chunks.push({ data: globals, start: 0, end: globals.length, });
      }
    }
    chunks.push({ data: this.bytes, start: 0, end: this.bytes.length, });
    let data = jbig2Image.parseChunks(chunks);
    let dataLength = data.length;

    // JBIG2 had black as 1 and white as 0, inverting the colors
    for (let i = 0; i < dataLength; i++) {
      data[i] ^= 0xFF;
    }
    this.buffer = data;
    this.bufferLength = dataLength;
    this.eof = true;
  };

  return Jbig2Stream;
})();

export {
  Jbig2Stream,
};
