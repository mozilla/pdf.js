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

if (!pdfjsImageDecoders.JpegImage) {
  // eslint-disable-next-line no-alert
  alert("Please build the pdfjs-dist library using `gulp dist-install`");
}

const JPEG_IMAGE = "fish.jpg";

const jpegCanvas = document.getElementById("jpegCanvas");
const jpegCtx = jpegCanvas.getContext("2d");

// Load the image data, and convert it to a Uint8Array.
//
const response = await fetch(JPEG_IMAGE);
if (!response.ok) {
  throw new Error(response.statusText);
}
const typedArrayImage = new Uint8Array(await response.arrayBuffer());

// Parse the image data using `JpegImage`.
//
const jpegImage = new pdfjsImageDecoders.JpegImage();
jpegImage.parse(typedArrayImage);

const width = jpegImage.width,
  height = jpegImage.height;
const jpegData = jpegImage.getData({
  width,
  height,
  forceRGB: true,
});

// Render the JPEG image on a <canvas>.
//
const imageData = jpegCtx.createImageData(width, height);
const imageBytes = imageData.data;
for (let j = 0, k = 0, jj = width * height * 4; j < jj; ) {
  imageBytes[j++] = jpegData[k++];
  imageBytes[j++] = jpegData[k++];
  imageBytes[j++] = jpegData[k++];
  imageBytes[j++] = 255;
}
jpegCanvas.width = width;
jpegCanvas.height = height;
jpegCtx.putImageData(imageData, 0, 0);
