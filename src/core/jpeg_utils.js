/* Copyright 2014 Mozilla Foundation
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

import { BaseException, warn } from "../shared/util.js";

class JpegError extends BaseException {
  constructor(msg) {
    super(msg, "JpegError");
  }
}

function findNextFileMarker(data, view, currentPos, startPos = currentPos) {
  const maxPos = data.length - 1;
  let newPos = startPos < currentPos ? startPos : currentPos;

  if (currentPos >= maxPos) {
    return null; // Don't attempt to read non-existent data and just return.
  }
  const currentMarker = view.getUint16(currentPos);
  if (currentMarker >= 0xffc0 && currentMarker <= 0xfffe) {
    return {
      invalid: null,
      marker: currentMarker,
      offset: currentPos,
    };
  }
  let newMarker = view.getUint16(newPos);
  while (!(newMarker >= 0xffc0 && newMarker <= 0xfffe)) {
    if (++newPos >= maxPos) {
      return null; // Don't attempt to read non-existent data and just return.
    }
    newMarker = view.getUint16(newPos);
  }
  return {
    invalid: currentMarker.toString(16),
    marker: newMarker,
    offset: newPos,
  };
}

function readDataBlock(data, view, offset) {
  const length = view.getUint16(offset);
  offset += 2;
  let endOffset = offset + length - 2;

  const fileMarker = findNextFileMarker(data, view, endOffset, offset);
  if (fileMarker?.invalid) {
    warn(
      `readDataBlock - incorrect length, current marker is: ${fileMarker.invalid}`
    );
    endOffset = fileMarker.offset;
  }

  const array = data.subarray(offset, endOffset);
  return {
    appData: array,
    oldOffset: offset,
    newOffset: offset + array.length,
  };
}

function skipData(data, view, offset) {
  const length = view.getUint16(offset);
  offset += 2;
  const endOffset = offset + length - 2;

  const fileMarker = findNextFileMarker(data, view, endOffset, offset);
  return fileMarker?.invalid ? fileMarker.offset : endOffset;
}

function getJpegImageInfo(data, colorTransform = -1) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const info = {
    width: 0,
    height: 0,
    exifStart: 0,
    exifEnd: 0,
  };
  let offset = 0;
  let numComponents = null;
  let fileMarker = view.getUint16(offset);
  offset += 2;
  if (fileMarker !== /* SOI (Start of Image) = */ 0xffd8) {
    throw new JpegError("SOI not found");
  }
  fileMarker = view.getUint16(offset);
  offset += 2;

  markerLoop: while (fileMarker !== /* EOI (End of Image) = */ 0xffd9) {
    switch (fileMarker) {
      case 0xffe1: // APP1 - Exif
        // TODO: Remove this once https://github.com/w3c/webcodecs/issues/870
        //       is fixed.
        const { appData, oldOffset, newOffset } = readDataBlock(
          data,
          view,
          offset
        );
        offset = newOffset;

        // 'Exif\x00\x00'
        if (
          appData[0] === 0x45 &&
          appData[1] === 0x78 &&
          appData[2] === 0x69 &&
          appData[3] === 0x66 &&
          appData[4] === 0 &&
          appData[5] === 0
        ) {
          if (info.exifStart) {
            throw new JpegError("Duplicate EXIF-blocks found.");
          }
          // Don't do the EXIF-block replacement here, see `JpegStream`,
          // since that can modify the original PDF document.
          info.exifStart = oldOffset + 6;
          info.exifEnd = newOffset;
        }
        fileMarker = view.getUint16(offset);
        offset += 2;
        continue;
      case 0xffc0: // SOF0 (Start of Frame, Baseline DCT)
      case 0xffc1: // SOF1 (Start of Frame, Extended DCT)
      case 0xffc2: // SOF2 (Start of Frame, Progressive DCT)
        // Skip marker length.
        // Skip precision.
        info.height = view.getUint16(offset + (2 + 1)); // scanLines
        info.width = view.getUint16(offset + (2 + 1 + 2)); // samplesPerLine
        numComponents = data[offset + (2 + 1 + 2 + 2)];
        break markerLoop;
      case 0xffff: // Fill bytes
        if (data[offset] !== 0xff) {
          // Avoid skipping a valid marker.
          offset--;
        }
        break;
    }
    offset = skipData(data, view, offset);
    fileMarker = view.getUint16(offset);
    offset += 2;
  }
  if (numComponents === 4) {
    return null;
  }
  if (numComponents === 3 && colorTransform === 0) {
    return null;
  }
  // A zero SOF height means that a later DNL marker defines it.
  return info;
}

export { findNextFileMarker, getJpegImageInfo, JpegError, readDataBlock };
