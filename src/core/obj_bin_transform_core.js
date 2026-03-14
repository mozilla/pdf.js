/* Copyright 2025 Mozilla Foundation
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

import { assert, FeatureTest } from "../shared/util.js";
import {
  CSS_FONT_INFO,
  FONT_INFO,
  PATTERN_INFO,
  SYSTEM_FONT_INFO,
} from "../shared/obj_bin_transform_utils.js";

function compileCssFontInfo(info) {
  const encoder = new TextEncoder();
  const encodedStrings = {};
  let stringsLength = 0;
  for (const prop of CSS_FONT_INFO.strings) {
    const encoded = encoder.encode(info[prop]);
    encodedStrings[prop] = encoded;
    stringsLength += 4 + encoded.length;
  }

  const buffer = new ArrayBuffer(stringsLength);
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let offset = 0;

  for (const prop of CSS_FONT_INFO.strings) {
    const encoded = encodedStrings[prop];
    const length = encoded.length;
    view.setUint32(offset, length);
    data.set(encoded, offset + 4);
    offset += 4 + length;
  }
  assert(offset === buffer.byteLength, "compileCssFontInfo: Buffer overflow");
  return buffer;
}

function compileSystemFontInfo(info) {
  const encoder = new TextEncoder();
  const encodedStrings = {};
  let stringsLength = 0;
  for (const prop of SYSTEM_FONT_INFO.strings) {
    const encoded = encoder.encode(info[prop]);
    encodedStrings[prop] = encoded;
    stringsLength += 4 + encoded.length;
  }
  stringsLength += 4;
  let encodedStyleStyle,
    encodedStyleWeight,
    lengthEstimate = 1 + stringsLength;
  if (info.style) {
    encodedStyleStyle = encoder.encode(info.style.style);
    encodedStyleWeight = encoder.encode(info.style.weight);
    lengthEstimate +=
      4 + encodedStyleStyle.length + 4 + encodedStyleWeight.length;
  }

  const buffer = new ArrayBuffer(lengthEstimate);
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let offset = 0;

  view.setUint8(offset++, info.guessFallback ? 1 : 0);
  view.setUint32(offset, 0);
  offset += 4;
  stringsLength = 0;
  for (const prop of SYSTEM_FONT_INFO.strings) {
    const encoded = encodedStrings[prop];
    const length = encoded.length;
    stringsLength += 4 + length;
    view.setUint32(offset, length);
    data.set(encoded, offset + 4);
    offset += 4 + length;
  }
  view.setUint32(offset - stringsLength - 4, stringsLength);

  if (info.style) {
    view.setUint32(offset, encodedStyleStyle.length);
    data.set(encodedStyleStyle, offset + 4);
    offset += 4 + encodedStyleStyle.length;
    view.setUint32(offset, encodedStyleWeight.length);
    data.set(encodedStyleWeight, offset + 4);
    offset += 4 + encodedStyleWeight.length;
  }
  assert(offset <= buffer.byteLength, "compileSystemFontInfo: Buffer overflow");
  return buffer.transferToFixedLength(offset);
}

function compileFontInfo(font) {
  const systemFontInfoBuffer = font.systemFontInfo
    ? compileSystemFontInfo(font.systemFontInfo)
    : null;
  const cssFontInfoBuffer = font.cssFontInfo
    ? compileCssFontInfo(font.cssFontInfo)
    : null;

  const encoder = new TextEncoder();
  const encodedStrings = {};
  let stringsLength = 0;
  for (const prop of FONT_INFO.strings) {
    encodedStrings[prop] = encoder.encode(font[prop]);
    stringsLength += 4 + encodedStrings[prop].length;
  }

  const lengthEstimate =
    FONT_INFO.OFFSET_STRINGS +
    4 +
    stringsLength +
    4 +
    (systemFontInfoBuffer?.byteLength ?? 0) +
    4 +
    (cssFontInfoBuffer?.byteLength ?? 0) +
    4 +
    (font.data?.length ?? 0);

  const buffer = new ArrayBuffer(lengthEstimate);
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let offset = 0;

  const numBools = FONT_INFO.bools.length;
  let boolByte = 0,
    boolBit = 0;
  for (let i = 0; i < numBools; i++) {
    const value = font[FONT_INFO.bools[i]];
    // eslint-disable-next-line no-nested-ternary
    const bits = value === undefined ? 0x00 : value ? 0x02 : 0x01;
    boolByte |= bits << boolBit;
    boolBit += 2;
    if (boolBit === 8 || i === numBools - 1) {
      view.setUint8(offset++, boolByte);
      boolByte = 0;
      boolBit = 0;
    }
  }
  assert(
    offset === FONT_INFO.OFFSET_NUMBERS,
    "compileFontInfo: Boolean properties offset mismatch"
  );

  for (const prop of FONT_INFO.numbers) {
    view.setFloat64(offset, font[prop]);
    offset += 8;
  }
  assert(
    offset === FONT_INFO.OFFSET_BBOX,
    "compileFontInfo: Number properties offset mismatch"
  );

  if (font.bbox) {
    view.setUint8(offset++, 4);
    for (const coord of font.bbox) {
      view.setInt16(offset, coord, true);
      offset += 2;
    }
  } else {
    view.setUint8(offset++, 0);
    offset += 2 * 4; // TODO: optimize this padding away
  }
  assert(
    offset === FONT_INFO.OFFSET_FONT_MATRIX,
    "compileFontInfo: BBox properties offset mismatch"
  );

  if (font.fontMatrix) {
    view.setUint8(offset++, 6);
    for (const point of font.fontMatrix) {
      view.setFloat64(offset, point, true);
      offset += 8;
    }
  } else {
    view.setUint8(offset++, 0);
    offset += 8 * 6; // TODO: optimize this padding away
  }
  assert(
    offset === FONT_INFO.OFFSET_DEFAULT_VMETRICS,
    "compileFontInfo: FontMatrix properties offset mismatch"
  );

  if (font.defaultVMetrics) {
    view.setUint8(offset++, 3);
    for (const metric of font.defaultVMetrics) {
      view.setInt16(offset, metric, true);
      offset += 2;
    }
  } else {
    view.setUint8(offset++, 0);
    offset += 3 * 2; // TODO: optimize this padding away
  }
  assert(
    offset === FONT_INFO.OFFSET_STRINGS,
    "compileFontInfo: DefaultVMetrics properties offset mismatch"
  );

  view.setUint32(FONT_INFO.OFFSET_STRINGS, 0);
  offset += 4;
  for (const prop of FONT_INFO.strings) {
    const encoded = encodedStrings[prop];
    const length = encoded.length;
    view.setUint32(offset, length);
    data.set(encoded, offset + 4);
    offset += 4 + length;
  }
  view.setUint32(
    FONT_INFO.OFFSET_STRINGS,
    offset - FONT_INFO.OFFSET_STRINGS - 4
  );

  if (!systemFontInfoBuffer) {
    view.setUint32(offset, 0);
    offset += 4;
  } else {
    const length = systemFontInfoBuffer.byteLength;
    view.setUint32(offset, length);
    assert(
      offset + 4 + length <= buffer.byteLength,
      "compileFontInfo: Buffer overflow at systemFontInfo"
    );
    data.set(new Uint8Array(systemFontInfoBuffer), offset + 4);
    offset += 4 + length;
  }

  if (!cssFontInfoBuffer) {
    view.setUint32(offset, 0);
    offset += 4;
  } else {
    const length = cssFontInfoBuffer.byteLength;
    view.setUint32(offset, length);
    assert(
      offset + 4 + length <= buffer.byteLength,
      "compileFontInfo: Buffer overflow at cssFontInfo"
    );
    data.set(new Uint8Array(cssFontInfoBuffer), offset + 4);
    offset += 4 + length;
  }

  if (font.data === undefined) {
    view.setUint32(offset, 0);
    offset += 4;
  } else {
    view.setUint32(offset, font.data.length);
    data.set(font.data, offset + 4);
    offset += 4 + font.data.length;
  }

  assert(offset <= buffer.byteLength, "compileFontInfo: Buffer overflow");
  return buffer.transferToFixedLength(offset);
}

function compilePatternInfo(ir) {
  let kind,
    bbox = null,
    coords = [],
    colors = [],
    colorStops = [],
    figures = [],
    shadingType = null, // only needed for mesh patterns
    background = null; // background for mesh patterns

  switch (ir[0]) {
    case "RadialAxial":
      kind = ir[1] === "axial" ? 1 : 2;
      bbox = ir[2];
      colorStops = ir[3];
      if (kind === 1) {
        coords.push(...ir[4], ...ir[5]);
      } else {
        coords.push(ir[4][0], ir[4][1], ir[6], ir[5][0], ir[5][1], ir[7]);
      }
      break;
    case "Mesh":
      kind = 3;
      shadingType = ir[1];
      coords = ir[2];
      colors = ir[3];
      figures = ir[4] || [];
      bbox = ir[6];
      background = ir[7];
      break;
    default:
      throw new Error(`Unsupported pattern type: ${ir[0]}`);
  }

  const nCoord = Math.floor(coords.length / 2);
  const nColor = Math.floor(colors.length / 3);
  const nStop = colorStops.length;
  const nFigures = figures.length;

  let figuresSize = 0;
  for (const figure of figures) {
    figuresSize += 1;
    figuresSize = Math.ceil(figuresSize / 4) * 4; // Ensure 4-byte alignment
    figuresSize += 4 + figure.coords.length * 4;
    figuresSize += 4 + figure.colors.length * 4;
    if (figure.verticesPerRow !== undefined) {
      figuresSize += 4;
    }
  }

  const byteLen =
    20 +
    nCoord * 8 +
    nColor * 3 +
    nStop * 8 +
    (bbox ? 16 : 0) +
    (background ? 3 : 0) +
    figuresSize;
  const buffer = new ArrayBuffer(byteLen);
  const dataView = new DataView(buffer);
  const u8data = new Uint8Array(buffer);

  dataView.setUint8(PATTERN_INFO.KIND, kind);
  dataView.setUint8(PATTERN_INFO.HAS_BBOX, bbox ? 1 : 0);
  dataView.setUint8(PATTERN_INFO.HAS_BACKGROUND, background ? 1 : 0);
  dataView.setUint8(PATTERN_INFO.SHADING_TYPE, shadingType); // Only for mesh pattern, null otherwise
  dataView.setUint32(PATTERN_INFO.N_COORD, nCoord, true);
  dataView.setUint32(PATTERN_INFO.N_COLOR, nColor, true);
  dataView.setUint32(PATTERN_INFO.N_STOP, nStop, true);
  dataView.setUint32(PATTERN_INFO.N_FIGURES, nFigures, true);

  let offset = 20;
  const coordsView = new Float32Array(buffer, offset, nCoord * 2);
  coordsView.set(coords);
  offset += nCoord * 8;

  u8data.set(colors, offset);
  offset += nColor * 3;

  for (const [pos, hex] of colorStops) {
    dataView.setFloat32(offset, pos, true);
    offset += 4;
    dataView.setUint32(offset, parseInt(hex.slice(1), 16), true);
    offset += 4;
  }
  if (bbox) {
    for (const v of bbox) {
      dataView.setFloat32(offset, v, true);
      offset += 4;
    }
  }

  if (background) {
    u8data.set(background, offset);
    offset += 3;
  }

  for (let i = 0; i < figures.length; i++) {
    const figure = figures[i];
    dataView.setUint8(offset, figure.type);
    offset += 1;
    // Ensure 4-byte alignment
    offset = Math.ceil(offset / 4) * 4;
    dataView.setUint32(offset, figure.coords.length, true);
    offset += 4;
    const figureCoordsView = new Int32Array(
      buffer,
      offset,
      figure.coords.length
    );
    figureCoordsView.set(figure.coords);
    offset += figure.coords.length * 4;
    dataView.setUint32(offset, figure.colors.length, true);
    offset += 4;
    const colorsView = new Int32Array(buffer, offset, figure.colors.length);
    colorsView.set(figure.colors);
    offset += figure.colors.length * 4;

    if (figure.verticesPerRow !== undefined) {
      dataView.setUint32(offset, figure.verticesPerRow, true);
      offset += 4;
    }
  }
  return buffer;
}

function compileFontPathInfo(path) {
  let data;
  let buffer;
  if (
    (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) ||
    FeatureTest.isFloat16ArraySupported
  ) {
    buffer = new ArrayBuffer(path.length * 2);
    data = new Float16Array(buffer);
  } else {
    buffer = new ArrayBuffer(path.length * 4);
    data = new Float32Array(buffer);
  }
  data.set(path);
  return buffer;
}

export {
  compileCssFontInfo,
  compileFontInfo,
  compileFontPathInfo,
  compilePatternInfo,
  compileSystemFontInfo,
};
