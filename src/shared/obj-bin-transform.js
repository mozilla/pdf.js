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

import { assert, MeshFigureType } from "./util.js";

class CssFontInfo {
  #buffer;

  #view;

  #decoder;

  static strings = ["fontFamily", "fontWeight", "italicAngle"];

  static write(info) {
    const encoder = new TextEncoder();
    const encodedStrings = {};
    let stringsLength = 0;
    for (const prop of CssFontInfo.strings) {
      const encoded = encoder.encode(info[prop]);
      encodedStrings[prop] = encoded;
      stringsLength += 4 + encoded.length;
    }

    const buffer = new ArrayBuffer(stringsLength);
    const data = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let offset = 0;

    for (const prop of CssFontInfo.strings) {
      const encoded = encodedStrings[prop];
      const length = encoded.length;
      view.setUint32(offset, length);
      data.set(encoded, offset + 4);
      offset += 4 + length;
    }
    assert(offset === buffer.byteLength, "CssFontInfo.write: Buffer overflow");
    return buffer;
  }

  constructor(buffer) {
    this.#buffer = buffer;
    this.#view = new DataView(this.#buffer);
    this.#decoder = new TextDecoder();
  }

  #readString(index) {
    assert(index < CssFontInfo.strings.length, "Invalid string index");
    let offset = 0;
    for (let i = 0; i < index; i++) {
      offset += this.#view.getUint32(offset) + 4;
    }
    const length = this.#view.getUint32(offset);
    return this.#decoder.decode(
      new Uint8Array(this.#buffer, offset + 4, length)
    );
  }

  get fontFamily() {
    return this.#readString(0);
  }

  get fontWeight() {
    return this.#readString(1);
  }

  get italicAngle() {
    return this.#readString(2);
  }
}

class SystemFontInfo {
  #buffer;

  #view;

  #decoder;

  static strings = ["css", "loadedName", "baseFontName", "src"];

  static write(info) {
    const encoder = new TextEncoder();
    const encodedStrings = {};
    let stringsLength = 0;
    for (const prop of SystemFontInfo.strings) {
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
    for (const prop of SystemFontInfo.strings) {
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
    assert(index < SystemFontInfo.strings.length, "Invalid string index");
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
  static bools = [
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
  ];

  static numbers = ["ascent", "defaultWidth", "descent"];

  static strings = ["fallbackName", "loadedName", "mimetype", "name"];

  static #OFFSET_NUMBERS = Math.ceil((this.bools.length * 2) / 8);

  static #OFFSET_BBOX = this.#OFFSET_NUMBERS + this.numbers.length * 8;

  static #OFFSET_FONT_MATRIX = this.#OFFSET_BBOX + 1 + 2 * 4;

  static #OFFSET_DEFAULT_VMETRICS = this.#OFFSET_FONT_MATRIX + 1 + 8 * 6;

  static #OFFSET_STRINGS = this.#OFFSET_DEFAULT_VMETRICS + 1 + 2 * 3;

  #buffer;

  #decoder;

  #view;

  constructor({ data, extra }) {
    this.#buffer = data;
    this.#decoder = new TextDecoder();
    this.#view = new DataView(this.#buffer);
    if (extra) {
      Object.assign(this, extra);
    }
  }

  #readBoolean(index) {
    assert(index < FontInfo.bools.length, "Invalid boolean index");
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
    assert(index < FontInfo.numbers.length, "Invalid number index");
    return this.#view.getFloat64(FontInfo.#OFFSET_NUMBERS + index * 8);
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
    let offset = FontInfo.#OFFSET_BBOX;
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
    let offset = FontInfo.#OFFSET_FONT_MATRIX;
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
    let offset = FontInfo.#OFFSET_DEFAULT_VMETRICS;
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
    assert(index < FontInfo.strings.length, "Invalid string index");
    let offset = FontInfo.#OFFSET_STRINGS + 4;
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
    let offset = FontInfo.#OFFSET_STRINGS;
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
    let offset = FontInfo.#OFFSET_STRINGS;
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
    let offset = FontInfo.#OFFSET_STRINGS;
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
    return new CssFontInfo(cssFontInfoData.buffer);
  }

  get systemFontInfo() {
    let offset = FontInfo.#OFFSET_STRINGS;
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
    return new SystemFontInfo(systemFontInfoData.buffer);
  }

  static write(font) {
    const systemFontInfoBuffer = font.systemFontInfo
      ? SystemFontInfo.write(font.systemFontInfo)
      : null;
    const cssFontInfoBuffer = font.cssFontInfo
      ? CssFontInfo.write(font.cssFontInfo)
      : null;

    const encoder = new TextEncoder();
    const encodedStrings = {};
    let stringsLength = 0;
    for (const prop of FontInfo.strings) {
      encodedStrings[prop] = encoder.encode(font[prop]);
      stringsLength += 4 + encodedStrings[prop].length;
    }

    const lengthEstimate =
      FontInfo.#OFFSET_STRINGS +
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

    const numBools = FontInfo.bools.length;
    let boolByte = 0,
      boolBit = 0;
    for (let i = 0; i < numBools; i++) {
      const value = font[FontInfo.bools[i]];
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
      offset === FontInfo.#OFFSET_NUMBERS,
      "FontInfo.write: Boolean properties offset mismatch"
    );

    for (const prop of FontInfo.numbers) {
      view.setFloat64(offset, font[prop]);
      offset += 8;
    }
    assert(
      offset === FontInfo.#OFFSET_BBOX,
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
      offset === FontInfo.#OFFSET_FONT_MATRIX,
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
      offset === FontInfo.#OFFSET_DEFAULT_VMETRICS,
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
      offset === FontInfo.#OFFSET_STRINGS,
      "FontInfo.write: DefaultVMetrics properties offset mismatch"
    );

    view.setUint32(FontInfo.#OFFSET_STRINGS, 0);
    offset += 4;
    for (const prop of FontInfo.strings) {
      const encoded = encodedStrings[prop];
      const length = encoded.length;
      view.setUint32(offset, length);
      data.set(encoded, offset + 4);
      offset += 4 + length;
    }
    view.setUint32(
      FontInfo.#OFFSET_STRINGS,
      offset - FontInfo.#OFFSET_STRINGS - 4
    );

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

class PatternInfo {
  static #KIND = 0; // 1=axial, 2=radial, 3=mesh

  static #HAS_BBOX = 1; // 0/1

  static #HAS_BACKGROUND = 2; // 0/1 (background for mesh patterns)

  static #SHADING_TYPE = 3; // shadingType (only for mesh patterns)

  static #N_COORD = 4; // number of coordinate pairs

  static #N_COLOR = 8; // number of rgb triplets

  static #N_STOP = 12; // number of gradient stops

  static #N_FIGURES = 16; // number of figures

  constructor(buffer) {
    this.buffer = buffer;
    this.view = new DataView(buffer);
    this.data = new Uint8Array(buffer);
  }

  static write(ir) {
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

    dataView.setUint8(PatternInfo.#KIND, kind);
    dataView.setUint8(PatternInfo.#HAS_BBOX, bbox ? 1 : 0);
    dataView.setUint8(PatternInfo.#HAS_BACKGROUND, background ? 1 : 0);
    dataView.setUint8(PatternInfo.#SHADING_TYPE, shadingType); // Only for mesh pattern, null otherwise
    dataView.setUint32(PatternInfo.#N_COORD, nCoord, true);
    dataView.setUint32(PatternInfo.#N_COLOR, nColor, true);
    dataView.setUint32(PatternInfo.#N_STOP, nStop, true);
    dataView.setUint32(PatternInfo.#N_FIGURES, nFigures, true);

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

  getIR() {
    const dataView = this.view;
    const kind = this.data[PatternInfo.#KIND];
    const hasBBox = !!this.data[PatternInfo.#HAS_BBOX];
    const hasBackground = !!this.data[PatternInfo.#HAS_BACKGROUND];
    const nCoord = dataView.getUint32(PatternInfo.#N_COORD, true);
    const nColor = dataView.getUint32(PatternInfo.#N_COLOR, true);
    const nStop = dataView.getUint32(PatternInfo.#N_STOP, true);
    const nFigures = dataView.getUint32(PatternInfo.#N_FIGURES, true);

    let offset = 20;
    const coords = new Float32Array(this.buffer, offset, nCoord * 2);
    offset += nCoord * 8;
    const colors = new Uint8Array(this.buffer, offset, nColor * 3);
    offset += nColor * 3;
    const stops = [];
    for (let i = 0; i < nStop; ++i) {
      const p = dataView.getFloat32(offset, true);
      offset += 4;
      const rgb = dataView.getUint32(offset, true);
      offset += 4;
      stops.push([p, `#${rgb.toString(16).padStart(6, "0")}`]);
    }
    let bbox = null;
    if (hasBBox) {
      bbox = [];
      for (let i = 0; i < 4; ++i) {
        bbox.push(dataView.getFloat32(offset, true));
        offset += 4;
      }
    }

    let background = null;
    if (hasBackground) {
      background = new Uint8Array(this.buffer, offset, 3);
      offset += 3;
    }

    const figures = [];
    for (let i = 0; i < nFigures; ++i) {
      const type = dataView.getUint8(offset);
      offset += 1;
      // Ensure 4-byte alignment
      offset = Math.ceil(offset / 4) * 4;

      const coordsLength = dataView.getUint32(offset, true);
      offset += 4;
      const figureCoords = new Int32Array(this.buffer, offset, coordsLength);
      offset += coordsLength * 4;

      const colorsLength = dataView.getUint32(offset, true);
      offset += 4;
      const figureColors = new Int32Array(this.buffer, offset, colorsLength);
      offset += colorsLength * 4;

      const figure = {
        type,
        coords: figureCoords,
        colors: figureColors,
      };

      if (type === MeshFigureType.LATTICE) {
        figure.verticesPerRow = dataView.getUint32(offset, true);
        offset += 4;
      }

      figures.push(figure);
    }

    if (kind === 1) {
      // axial
      return [
        "RadialAxial",
        "axial",
        bbox,
        stops,
        Array.from(coords.slice(0, 2)),
        Array.from(coords.slice(2, 4)),
        null,
        null,
      ];
    }
    if (kind === 2) {
      return [
        "RadialAxial",
        "radial",
        bbox,
        stops,
        [coords[0], coords[1]],
        [coords[3], coords[4]],
        coords[2],
        coords[5],
      ];
    }
    if (kind === 3) {
      const shadingType = this.data[PatternInfo.#SHADING_TYPE];
      let bounds = null;
      if (coords.length > 0) {
        let minX = coords[0],
          maxX = coords[0];
        let minY = coords[1],
          maxY = coords[1];
        for (let i = 0; i < coords.length; i += 2) {
          const x = coords[i],
            y = coords[i + 1];
          minX = minX > x ? x : minX;
          minY = minY > y ? y : minY;
          maxX = maxX < x ? x : maxX;
          maxY = maxY < y ? y : maxY;
        }
        bounds = [minX, minY, maxX, maxY];
      }
      return [
        "Mesh",
        shadingType,
        coords,
        colors,
        figures,
        bounds,
        bbox,
        background,
      ];
    }
    throw new Error(`Unsupported pattern kind: ${kind}`);
  }
}
export { CssFontInfo, FontInfo, PatternInfo, SystemFontInfo };
