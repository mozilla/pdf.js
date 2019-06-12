"use strict";

{
  let isReadableStreamSupported = false;

  if (typeof ReadableStream !== 'undefined') {
    try {
      new ReadableStream({
        start(controller) {
          controller.close();
        }

      });
      isReadableStreamSupported = true;
    } catch (e) {}
  }

  if (isReadableStreamSupported) {
    exports.ReadableStream = ReadableStream;
  } else {
    exports.ReadableStream = require('../../external/streams/streams-lib').ReadableStream;
  }
}