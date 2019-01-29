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
/* eslint-disable no-restricted-globals */

if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('MOZCENTRAL')) {
  if (typeof ReadableStream === 'undefined') {
    throw new Error('Please enable ReadableStream support by resetting the ' +
      '"javascript.options.streams" preference to "true" in about:config.');
  }
  exports.ReadableStream = ReadableStream;
} else {
  let isReadableStreamSupported = false;
  if (typeof ReadableStream !== 'undefined') {
    // MS Edge may say it has ReadableStream but they are not up to spec yet.
    try {
      // eslint-disable-next-line no-new
      new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
      isReadableStreamSupported = true;
    } catch (e) {
      // The ReadableStream constructor cannot be used.
    }
  }
  if (isReadableStreamSupported) {
    exports.ReadableStream = ReadableStream;
  } else if (typeof PDFJSDev !== 'undefined' &&
             PDFJSDev.test('IMAGE_DECODERS')) {
    class DummyReadableStream {
      constructor() {
        throw new Error('The current image decoders are synchronous, ' +
                        'hence `ReadableStream` shouldn\'t need to be ' +
                        'polyfilled for the IMAGE_DECODERS build target.');
      }
    }
    exports.ReadableStream = DummyReadableStream;
  } else {
    exports.ReadableStream =
      require('../../external/streams/streams-lib').ReadableStream;
  }
}
