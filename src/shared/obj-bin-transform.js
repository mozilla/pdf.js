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

import { assert } from "./util.js";

const PROPS = {
  bools: [
    "black",
    "bold",
    "disableFontFace",
    "fontExtraProperties",
    "isInvalidPDFjsFont",
    "isType3Font",
    "italic",
    "missingFile",
    "remeasure",
    "vertical",
  ],
  numbers: ["ascent", "defaultWidth", "descent"],
  strings: ["fallbackName", "loadedName", "mimetype", "name"],
  // undefined: ["charProcOperatorList", "defaultVMetrics"],
};

// const EXTRA_PROPS = {
//   // "cMap",
//   bools: ["composite", "isMonospace", "isSerifFont", "isSymbolicFont"],
//   strings: ["type"],

//   // "defaultEncoding",
//   // "differences",
//   // "seacMap",
//   // "subtype",
//   // "toFontChar",
//   // "toUnicode",
//   // "vmetrics",
//   // "widths",
// };

const OFFSET_NUMBERS = Math.ceil((PROPS.bools.length * 2) / 8);
const OFFSET_BBOX = OFFSET_NUMBERS + PROPS.numbers.length * 8;
const OFFSET_FONT_MATRIX = OFFSET_BBOX + 1 + 2 * 4;
const OFFSET_DEFAULT_VMETRICS = OFFSET_FONT_MATRIX + 1 + 8 * 6;
const OFFSET_STRINGS = OFFSET_DEFAULT_VMETRICS + 1 + 2 * 3;

class SubstitionInfo {
  #buffer;

  #view;

  #decoder;

  static strings = ["css", "loadedName", "baseFontName", "src"];

  static write(substitionInfo) {
    const encoder = new TextEncoder();
    const encodedStrings = {};
    let stringsLength = 0;
    for (const prop of SubstitionInfo.strings) {
      const encoded = encoder.encode(substitionInfo[prop]);
      encodedStrings[prop] = encoded;
      stringsLength += 4 + encoded.length;
    }
    stringsLength += 4;
    let encodedStyleStyle,
      encodedStyleWeight,
      lengthEstimate = 1 + stringsLength;
    if (substitionInfo.style) {
      encodedStyleStyle = encoder.encode(substitionInfo.style.style);
      encodedStyleWeight = encoder.encode(substitionInfo.style.weight);
      lengthEstimate +=
        4 + encodedStyleStyle.length + 4 + encodedStyleWeight.length;
    }

    const buffer = new ArrayBuffer(lengthEstimate);
    const data = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let offset = 0;

    view.setUint8(offset++, substitionInfo.guessFallback ? 1 : 0);
    view.setUint32(offset, 0);
    offset += 4;
    stringsLength = 0;
    for (const prop of SubstitionInfo.strings) {
      const encoded = encodedStrings[prop];
      const length = encoded.length;
      stringsLength += 4 + length;
      view.setUint32(offset, length);
      data.set(encoded, offset + 4);
      offset += 4 + length;
    }
    view.setUint32(offset - stringsLength - 4, stringsLength);

    if (substitionInfo.style) {
      view.setUint32(offset, encodedStyleStyle.length);
      data.set(encodedStyleStyle, offset + 4);
      offset += 4 + encodedStyleStyle.length;
      view.setUint32(offset, encodedStyleWeight.length);
      data.set(encodedStyleWeight, offset + 4);
      offset += 4 + encodedStyleWeight.length;
    }
    assert(
      offset <= buffer.byteLength,
      "SubstitionInfo.write: Buffer overflow"
    );
    return buffer.transferToFixedLength(offset);
  }

  constructor(buffer) {
    this.#buffer = buffer;
    this.#view = new DataView(this.#buffer);
    this.#decoder = new TextDecoder();
  }

  get guessFallback() {
    return this.#view.getUint8(0) !== 0;
  }

  #readString(index) {
    assert(index < SubstitionInfo.strings.length, "Invalid string index");
    let offset = 5;
    for (let i = 0; i < index; i++) {
      offset += this.#view.getUint32(offset) + 4;
    }
    const length = this.#view.getUint32(offset);
    return this.#decoder.decode(
      new Uint8Array(this.#buffer, offset + 4, length)
    );
  }

  get css() {
    return this.#readString(0);
  }

  get loadedName() {
    return this.#readString(1);
  }

  get baseFontName() {
    return this.#readString(2);
  }

  get src() {
    return this.#readString(3);
  }

  get style() {
    let offset = 1;
    offset += 4 + this.#view.getUint32(offset);
    const styleLength = this.#view.getUint32(offset);
    const style = this.#decoder.decode(
      new Uint8Array(this.#buffer, offset + 4, styleLength)
    );
    offset += 4 + styleLength;
    const weightLength = this.#view.getUint32(offset);
    const weight = this.#decoder.decode(
      new Uint8Array(this.#buffer, offset + 4, weightLength)
    );
    return { style, weight };
  }
}

class FontInfo {
  #buffer;

  #decoder;

  #view;

  constructor({ data, extra }) {
    this.#buffer = data;
    this.#decoder = new TextDecoder();
    this.#view = new DataView(this.#buffer);
    if (extra) {
      for (const prop in extra) {
        this[prop] = extra[prop];
      }
    }
  }

  #readBoolean(index) {
    assert(index < PROPS.bools.length, "Invalid boolean index");
    const byteOffset = Math.floor(index / 4);
    const bitOffset = (index * 2) % 8;
    const value = (this.#view.getUint8(byteOffset) >> bitOffset) & 0x03;
    return value === 0x00 ? undefined : value === 0x02;
  }

  get black() {
    return this.#readBoolean(0);
  }

  get bold() {
    return this.#readBoolean(1);
  }

  get disableFontFace() {
    return this.#readBoolean(2);
  }

  get fontExtraProperties() {
    return this.#readBoolean(3);
  }

  get isInvalidPDFjsFont() {
    return this.#readBoolean(4);
  }

  get isType3Font() {
    return this.#readBoolean(5);
  }

  get italic() {
    return this.#readBoolean(6);
  }

  get missingFile() {
    return this.#readBoolean(7);
  }

  get remeasure() {
    return this.#readBoolean(8);
  }

  get vertical() {
    return this.#readBoolean(9);
  }

  #readNumber(index) {
    assert(index < PROPS.numbers.length, "Invalid number index");
    return this.#view.getFloat64(OFFSET_NUMBERS + index * 8);
  }

  get ascent() {
    return this.#readNumber(0);
  }

  get defaultWidth() {
    return this.#readNumber(1);
  }

  get descent() {
    return this.#readNumber(2);
  }

  get bbox() {
    let offset = OFFSET_BBOX;
    const numCoords = this.#view.getUint8(offset);
    if (numCoords === 0) {
      return undefined;
    }
    offset += 1;
    const bbox = [];
    for (let i = 0; i < 4; i++) {
      bbox.push(this.#view.getInt16(offset, true));
      offset += 2;
    }
    return bbox;
  }

  get fontMatrix() {
    let offset = OFFSET_FONT_MATRIX;
    const numPoints = this.#view.getUint8(offset);
    if (numPoints === 0) {
      return undefined;
    }
    offset += 1;
    const fontMatrix = [];
    for (let i = 0; i < 6; i++) {
      fontMatrix.push(this.#view.getFloat64(offset, true));
      offset += 8;
    }
    return fontMatrix;
  }

  get defaultVMetrics() {
    let offset = OFFSET_DEFAULT_VMETRICS;
    const numMetrics = this.#view.getUint8(offset);
    if (numMetrics === 0) {
      return undefined;
    }
    offset += 1;
    const defaultVMetrics = [];
    for (let i = 0; i < 3; i++) {
      defaultVMetrics.push(this.#view.getInt16(offset, true));
      offset += 2;
    }
    return defaultVMetrics;
  }

  #readString(index) {
    assert(index < PROPS.strings.length, "Invalid string index");
    let offset = OFFSET_STRINGS + 4;
    for (let i = 0; i < index; i++) {
      offset += this.#view.getUint32(offset) + 4;
    }
    const length = this.#view.getUint32(offset);
    const stringData = new Uint8Array(length);
    stringData.set(new Uint8Array(this.#buffer, offset + 4, length));
    return this.#decoder.decode(stringData);
  }

  get fallbackName() {
    return this.#readString(0);
  }

  get loadedName() {
    return this.#readString(1);
  }

  get mimetype() {
    return this.#readString(2);
  }

  get name() {
    return this.#readString(3);
  }

  get data() {
    let offset = OFFSET_STRINGS;
    const stringsLength = this.#view.getUint32(offset);
    offset += 4 + stringsLength;
    const systemFontInfoLength = this.#view.getUint32(offset);
    offset += 4 + systemFontInfoLength;
    const cssFontInfoLength = this.#view.getUint32(offset);
    offset += 4 + cssFontInfoLength;
    const length = this.#view.getUint32(offset);
    if (length === 0) {
      return undefined;
    }
    return new Uint8Array(this.#buffer, offset + 4, length);
  }

  clearData() {
    let offset = OFFSET_STRINGS;
    const stringsLength = this.#view.getUint32(offset);
    offset += 4 + stringsLength;
    const systemFontInfoLength = this.#view.getUint32(offset);
    offset += 4 + systemFontInfoLength;
    const cssFontInfoLength = this.#view.getUint32(offset);
    offset += 4 + cssFontInfoLength;
    const length = this.#view.getUint32(offset);
    const data = new Uint8Array(this.#buffer, offset + 4, length);
    data.fill(0);
    this.#view.setUint32(offset, 0);
    // this.#buffer.resize(offset);
  }

  get cssFontInfo() {
    let offset = OFFSET_STRINGS;
    const stringsLength = this.#view.getUint32(offset);
    offset += 4 + stringsLength;
    const systemFontInfoLength = this.#view.getUint32(offset);
    offset += 4 + systemFontInfoLength;
    const cssFontInfoLength = this.#view.getUint32(offset);
    if (cssFontInfoLength === 0) {
      return null;
    }
    const cssFontInfoData = new Uint8Array(cssFontInfoLength);
    cssFontInfoData.set(
      new Uint8Array(this.#buffer, offset + 4, cssFontInfoLength)
    );
    return new SubstitionInfo(cssFontInfoData.buffer);
  }

  get systemFontInfo() {
    let offset = OFFSET_STRINGS;
    const stringsLength = this.#view.getUint32(offset);
    offset += 4 + stringsLength;
    const systemFontInfoLength = this.#view.getUint32(offset);
    if (systemFontInfoLength === 0) {
      return null;
    }
    const systemFontInfoData = new Uint8Array(systemFontInfoLength);
    systemFontInfoData.set(
      new Uint8Array(this.#buffer, offset + 4, systemFontInfoLength)
    );
    return new SubstitionInfo(systemFontInfoData.buffer);
  }

  static write(font) {
    const systemFontInfoBuffer = font.systemFontInfo
      ? SubstitionInfo.write(font.systemFontInfo)
      : null;
    const cssFontInfoBuffer = font.cssFontInfo
      ? SubstitionInfo.write(font.cssFontInfo)
      : null;

    const encoder = new TextEncoder();
    const encodedStrings = {};
    let stringsLength = 0;
    for (const prop of PROPS.strings) {
      encodedStrings[prop] = encoder.encode(font[prop]);
      stringsLength += 4 + encodedStrings[prop].length;
    }

    const lengthEstimate =
      OFFSET_STRINGS +
      4 +
      stringsLength +
      4 +
      (systemFontInfoBuffer ? systemFontInfoBuffer.byteLength : 0) +
      4 +
      (cssFontInfoBuffer ? cssFontInfoBuffer.byteLength : 0) +
      4 +
      (font.data ? font.data.length : 0);

    const buffer = new ArrayBuffer(lengthEstimate);
    const data = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let offset = 0;

    const numBools = PROPS.bools.length;
    let boolByte = 0,
      boolBit = 0;
    for (let i = 0; i < numBools; i++) {
      const value = font[PROPS.bools[i]];
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
      offset === OFFSET_NUMBERS,
      "FontInfo.write: Boolean properties offset mismatch"
    );

    for (const prop of PROPS.numbers) {
      view.setFloat64(offset, font[prop]);
      offset += 8;
    }
    assert(
      offset === OFFSET_BBOX,
      "FontInfo.write: Number properties offset mismatch"
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
      offset === OFFSET_FONT_MATRIX,
      "FontInfo.write: BBox properties offset mismatch"
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
      offset === OFFSET_DEFAULT_VMETRICS,
      "FontInfo.write: FontMatrix properties offset mismatch"
    );

    if (font.defaultVMetrics) {
      view.setUint8(offset++, 1);
      for (const metric of font.defaultVMetrics) {
        view.setInt16(offset, metric, true);
        offset += 2;
      }
    } else {
      view.setUint8(offset++, 0);
      offset += 3 * 2; // TODO: optimize this padding away
    }

    assert(
      offset === OFFSET_STRINGS,
      "FontInfo.write: DefaultVMetrics properties offset mismatch"
    );

    view.setUint32(OFFSET_STRINGS, 0);
    offset += 4;
    for (const prop of PROPS.strings) {
      const encoded = encodedStrings[prop];
      const length = encoded.length;
      view.setUint32(offset, length);
      data.set(encoded, offset + 4);
      offset += 4 + length;
    }
    view.setUint32(OFFSET_STRINGS, offset - OFFSET_STRINGS - 4);

    if (!systemFontInfoBuffer) {
      view.setUint32(offset, 0);
      offset += 4;
    } else {
      const length = systemFontInfoBuffer.byteLength;
      view.setUint32(offset, length);
      assert(
        offset + 4 + length <= buffer.byteLength,
        "FontInfo.write: Buffer overflow at systemFontInfo"
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
        "FontInfo.write: Buffer overflow at cssFontInfo"
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

    assert(offset <= buffer.byteLength, "FontInfo.write: Buffer overflow");
    return buffer.transferToFixedLength(offset);
  }
}

export { FontInfo };
