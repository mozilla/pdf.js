/* The MIT License (MIT)
 *
 * Copyright (c) 2008 Jacob Seidelin
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/**
 * This implementation is based on
 *   https://github.com/exif-js/exif-js/blob/51a8f7d2f3aa71cb03463c84088067c9a4ebe8cb/exif.js
 *
 * with the following modifications:
 *  - Removal of, for the PDF.js use-case, unneeded and unused methods.
 *  - Skip `ExifIFDPointer` tags, `GPSInfoIFDPointer` tags, and
 *    thumbnail image extraction.
 *  - Removal of debug logging.
 *  - Make it pass PDF.js linting, and general modernization of the code.
 */

const TiffTags = {
  0x0100: "ImageWidth",
  0x0101: "ImageHeight",
  0x8769: "ExifIFDPointer",
  0x8825: "GPSInfoIFDPointer",
  0xa005: "InteroperabilityIFDPointer",
  0x0102: "BitsPerSample",
  0x0103: "Compression",
  0x0106: "PhotometricInterpretation",
  0x0112: "Orientation",
  0x0115: "SamplesPerPixel",
  0x011c: "PlanarConfiguration",
  0x0212: "YCbCrSubSampling",
  0x0213: "YCbCrPositioning",
  0x011a: "XResolution",
  0x011b: "YResolution",
  0x0128: "ResolutionUnit",
  0x0111: "StripOffsets",
  0x0116: "RowsPerStrip",
  0x0117: "StripByteCounts",
  0x0201: "JPEGInterchangeFormat",
  0x0202: "JPEGInterchangeFormatLength",
  0x012d: "TransferFunction",
  0x013e: "WhitePoint",
  0x013f: "PrimaryChromaticities",
  0x0211: "YCbCrCoefficients",
  0x0214: "ReferenceBlackWhite",
  0x0132: "DateTime",
  0x010e: "ImageDescription",
  0x010f: "Make",
  0x0110: "Model",
  0x0131: "Software",
  0x013b: "Artist",
  0x8298: "Copyright",
};

function readTags(file, tiffStart, dirStart, strings, bigEnd) {
  const entries = file.getUint16(dirStart, !bigEnd),
    tags = Object.create(null);

  for (let i = 0; i < entries; i++) {
    const entryOffset = dirStart + i * 12 + 2;
    const tag = strings[file.getUint16(entryOffset, !bigEnd)];
    tags[tag] = readTagValue(file, entryOffset, tiffStart, dirStart, bigEnd);
  }
  return tags;
}

function readTagValue(file, entryOffset, tiffStart, dirStart, bigEnd) {
  const type = file.getUint16(entryOffset + 2, !bigEnd),
    numValues = file.getUint32(entryOffset + 4, !bigEnd),
    valueOffset = file.getUint32(entryOffset + 8, !bigEnd) + tiffStart;
  let offset, vals, n;

  switch (type) {
    case 1: // byte, 8-bit unsigned int
    case 7: // undefined, 8-bit byte, value depending on field
      if (numValues === 1) {
        return file.getUint8(entryOffset + 8, !bigEnd);
      }
      offset = numValues > 4 ? valueOffset : entryOffset + 8;
      vals = [];
      for (n = 0; n < numValues; n++) {
        vals[n] = file.getUint8(offset + n);
      }
      return vals;

    case 2: // ascii, 8-bit byte
      offset = numValues > 4 ? valueOffset : entryOffset + 8;
      return getStringFromDB(file, offset, numValues - 1);

    case 3: // short, 16 bit int
      if (numValues === 1) {
        return file.getUint16(entryOffset + 8, !bigEnd);
      }
      offset = numValues > 2 ? valueOffset : entryOffset + 8;
      vals = [];
      for (n = 0; n < numValues; n++) {
        vals[n] = file.getUint16(offset + 2 * n, !bigEnd);
      }
      return vals;

    case 4: // long, 32 bit int
      if (numValues === 1) {
        return file.getUint32(entryOffset + 8, !bigEnd);
      }
      vals = [];
      for (n = 0; n < numValues; n++) {
        vals[n] = file.getUint32(valueOffset + 4 * n, !bigEnd);
      }
      return vals;

    case 5: // rational = two long values, first is numerator, second is denominator
      if (numValues === 1) {
        return (
          file.getUint32(valueOffset, !bigEnd) /
          file.getUint32(valueOffset + 4, !bigEnd)
        );
      }
      vals = [];
      for (n = 0; n < numValues; n++) {
        vals[n] =
          file.getUint32(valueOffset + 8 * n, !bigEnd) /
          file.getUint32(valueOffset + 4 + 8 * n, !bigEnd);
      }
      return vals;

    case 9: // slong, 32 bit signed int
      if (numValues === 1) {
        return file.getInt32(entryOffset + 8, !bigEnd);
      }
      vals = [];
      for (n = 0; n < numValues; n++) {
        vals[n] = file.getInt32(valueOffset + 4 * n, !bigEnd);
      }
      return vals;

    case 10: // signed rational, two slongs, first is numerator, second is denominator
      if (numValues === 1) {
        return (
          file.getInt32(valueOffset, !bigEnd) /
          file.getInt32(valueOffset + 4, !bigEnd)
        );
      }
      vals = [];
      for (n = 0; n < numValues; n++) {
        vals[n] =
          file.getInt32(valueOffset + 8 * n, !bigEnd) /
          file.getInt32(valueOffset + 4 + 8 * n, !bigEnd);
      }
      return vals;
  }
  throw new Error(`readTagValue - unsupported type: "${type}".`);
}

function getStringFromDB(buffer, start, length) {
  let outstr = "";
  for (let n = start; n < start + length; n++) {
    outstr += String.fromCharCode(buffer.getUint8(n));
  }
  return outstr;
}

/**
 * @param [DataView] file - Assumed to always start with the EXIF header.
 * @return {Object | null}
 */
function readEXIFData(file) {
  const tiffOffset = 6;
  let bigEnd;

  // test for TIFF validity and endianness
  if (file.getUint16(tiffOffset) === 0x4949) {
    bigEnd = false;
  } else if (file.getUint16(tiffOffset) === 0x4d4d) {
    bigEnd = true;
  } else {
    return null;
  }

  if (file.getUint16(tiffOffset + 2, !bigEnd) !== 0x002a) {
    return null;
  }
  const firstIFDOffset = file.getUint32(tiffOffset + 4, !bigEnd);

  if (firstIFDOffset < 0x00000008) {
    return null;
  }

  const tags = readTags(
    file,
    tiffOffset,
    tiffOffset + firstIFDOffset,
    TiffTags,
    bigEnd
  );

  // Skip `ExifIFDPointer` tags.
  //
  // Skip `GPSInfoIFDPointer` tags.
  //
  // Skip thumbnail image extraction.

  return tags;
}

export { readEXIFData };
