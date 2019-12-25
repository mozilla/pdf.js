/* Copyright 2018 Mozilla Foundation
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

"use strict";

if (!pdfjsImageDecoders.JpegImage) {
  alert("Please build the pdfjs-dist library using `gulp dist-install`");
}

var JPEG_IMAGE = "fish.jpg";

var jpegCanvas = document.getElementById("jpegCanvas");
var jpegCtx = jpegCanvas.getContext("2d");

// Load the image data, and convert it to a Uint8Array.
//
var nonBinaryRequest = false;
var request = new XMLHttpRequest();
request.open("GET", JPEG_IMAGE, false);
try {
  request.responseType = "arraybuffer";
  nonBinaryRequest = request.responseType !== "arraybuffer";
} catch (e) {
  nonBinaryRequest = true;
}
if (nonBinaryRequest && request.overrideMimeType) {
  request.overrideMimeType("text/plain; charset=x-user-defined");
}
request.send(null);

var typedArrayImage;
if (nonBinaryRequest) {
  var str = request.responseText,
    length = str.length;
  var bytes = new Uint8Array(length);
  for (var i = 0; i < length; ++i) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  typedArrayImage = bytes;
} else {
  typedArrayImage = new Uint8Array(request.response);
}

// Parse the image data using `JpegImage`.
//
var jpegImage = new pdfjsImageDecoders.JpegImage();
jpegImage.parse(typedArrayImage);

var width = jpegImage.width,
  height = jpegImage.height;
var jpegData = jpegImage.getData({
  width: width,
  height: height,
  forceRGB: true,
});

// Render the JPEG image on a <canvas>.
//
var imageData = jpegCtx.createImageData(width, height);
var imageBytes = imageData.data;
for (var j = 0, k = 0, jj = width * height * 4; j < jj; ) {
  imageBytes[j++] = jpegData[k++];
  imageBytes[j++] = jpegData[k++];
  imageBytes[j++] = jpegData[k++];
  imageBytes[j++] = 255;
}
jpegCanvas.width = width;
jpegCanvas.height = height;
jpegCtx.putImageData(imageData, 0, 0);
