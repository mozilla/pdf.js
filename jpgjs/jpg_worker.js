/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

importScripts('jpg.js');

addEventListener('message', function onmessage(e) {
  var bytes = e.data.bytes;
  var tag = e.data.tag;
  try {
    var jpegImage = new JpegImage();
    jpegImage.parse(bytes);
    var width = jpegImage.width;
    var height = jpegImage.height;
    var dataLength = width * height * 4;
    var data = new Uint8Array(dataLength);
    jpegImage.getData(data, width, height);

    postMessage({
      tag: tag,
      data: data,
      width: width,
      height: height
    });
  } catch (e) {
    postMessage({
      tag: tag,
      error: 'Error during JPEG decoding: ' + e
    });
  }
});