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

import { assert, FeatureTest, MeshFigureType, Util } from "../shared/util.js";
import {
  CSS_FONT_INFO,
  FONT_INFO,
  PATTERN_INFO,
  SYSTEM_FONT_INFO,
} from "../shared/obj_bin_transform_utils.js";

class CssFontInfo {
  #buffer;

  #decoder = new TextDecoder();

  #view;

  constructor(buffer) {
    this.#buffer = buffer;
    this.#view = new DataView(buffer);
  }

  #readString(index) {
    assert(index < CSS_FONT_INFO.strings.length, "Invalid string index");
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

  #decoder = new TextDecoder();

  #view;

  constructor(buffer) {
    this.#buffer = buffer;
    this.#view = new DataView(buffer);
  }

  get guessFallback() {
    return this.#view.getUint8(0) !== 0;
  }

  #readString(index) {
    assert(index < SYSTEM_FONT_INFO.strings.length, "Invalid string index");
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

  #decoder = new TextDecoder();

  #view;

  constructor({ buffer, extra }) {
    this.#buffer = buffer;
    this.#view = new DataView(buffer);
    if (extra) {
      Object.assign(this, extra);
    }
  }

  #readBoolean(index) {
    assert(index < FONT_INFO.bools.length, "Invalid boolean index");
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
    assert(index < FONT_INFO.numbers.length, "Invalid number index");
    return this.#view.getFloat64(FONT_INFO.OFFSET_NUMBERS + index * 8);
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

  #readArray(offset, arrLen, lookupName, increment) {
    const len = this.#view.getUint8(offset);
    if (len === 0) {
      return undefined;
    }
    assert(len === arrLen, "Invalid array length.");
    offset += 1;
    const arr = new Array(len);
    for (let i = 0; i < len; i++) {
      arr[i] = this.#view[lookupName](offset, true);
      offset += increment;
    }
    return arr;
  }

  get bbox() {
    return this.#readArray(
      /* offset = */ FONT_INFO.OFFSET_BBOX,
      /* arrLen = */ 4,
      /* lookup = */ "getInt16",
      /* increment = */ 2
    );
  }

  get fontMatrix() {
    return this.#readArray(
      /* offset = */ FONT_INFO.OFFSET_FONT_MATRIX,
      /* arrLen = */ 6,
      /* lookup = */ "getFloat64",
      /* increment = */ 8
    );
  }

  get defaultVMetrics() {
    return this.#readArray(
      /* offset = */ FONT_INFO.OFFSET_DEFAULT_VMETRICS,
      /* arrLen = */ 3,
      /* lookup = */ "getInt16",
      /* increment = */ 2
    );
  }

  #readString(index) {
    assert(index < FONT_INFO.strings.length, "Invalid string index");
    let offset = FONT_INFO.OFFSET_STRINGS + 4;
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

  #getDataOffsets() {
    let offset = FONT_INFO.OFFSET_STRINGS;
    const stringsLength = this.#view.getUint32(offset);
    offset += 4 + stringsLength;
    const systemFontInfoLength = this.#view.getUint32(offset);
    offset += 4 + systemFontInfoLength;
    const cssFontInfoLength = this.#view.getUint32(offset);
    offset += 4 + cssFontInfoLength;
    const length = this.#view.getUint32(offset);

    return { offset, length };
  }

  get data() {
    const { offset, length } = this.#getDataOffsets();
    return length === 0
      ? undefined
      : new Uint8Array(this.#buffer, offset + 4, length);
  }

  clearData() {
    const { offset, length } = this.#getDataOffsets();
    if (length === 0) {
      return; // The data is either not present, or it was previously cleared.
    }
    this.#view.setUint32(offset, 0); // Zero the data-length.

    // Replace the buffer/view with only its contents *before* the data-block.
    this.#buffer = new Uint8Array(this.#buffer, 0, offset + 4).slice().buffer;
    this.#view = new DataView(this.#buffer);
  }

  get cssFontInfo() {
    let offset = FONT_INFO.OFFSET_STRINGS;
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
    let offset = FONT_INFO.OFFSET_STRINGS;
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
}

class PatternInfo {
  constructor(buffer) {
    this.buffer = buffer;
    this.view = new DataView(buffer);
    this.data = new Uint8Array(buffer);
  }

  getIR() {
    const dataView = this.view;
    const kind = this.data[PATTERN_INFO.KIND];
    const hasBBox = !!this.data[PATTERN_INFO.HAS_BBOX];
    const hasBackground = !!this.data[PATTERN_INFO.HAS_BACKGROUND];
    const nCoord = dataView.getUint32(PATTERN_INFO.N_COORD, true);
    const nColor = dataView.getUint32(PATTERN_INFO.N_COLOR, true);
    const nStop = dataView.getUint32(PATTERN_INFO.N_STOP, true);
    const nFigures = dataView.getUint32(PATTERN_INFO.N_FIGURES, true);

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
      const shadingType = this.data[PATTERN_INFO.SHADING_TYPE];
      let bounds = null;
      if (coords.length > 0) {
        bounds = [Infinity, Infinity, -Infinity, -Infinity];

        for (let i = 0, ii = coords.length; i < ii; i += 2) {
          Util.pointBoundingBox(coords[i], coords[i + 1], bounds);
        }
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

class FontPathInfo {
  #buffer;

  constructor(buffer) {
    this.#buffer = buffer;
  }

  get path() {
    if (
      (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) ||
      FeatureTest.isFloat16ArraySupported
    ) {
      return new Float16Array(this.#buffer);
    }
    return new Float32Array(this.#buffer);
  }
}

export { CssFontInfo, FontInfo, FontPathInfo, PatternInfo, SystemFontInfo };
