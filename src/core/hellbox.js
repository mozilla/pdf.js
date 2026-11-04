/* Copyright 2026 Mozilla Foundation
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

import {
  font_data_files as fontDataFiles,
  generate_font as generateFont,
  generate_standard_font as generateStandardFont,
  has_data as hasData,
  initJs,
  missing_glyphs as missingGlyphs,
  missing_standard_glyphs as missingStandardGlyphs,
  set_data as setData,
  standard_font_codepoints as standardFontCodePoints,
  standard_font_data_files as standardFontDataFiles,
} from "../../external/hellbox/hellbox.js";
import { makeMap, warn } from "../shared/util.js";
import { WasmLoader } from "./wasm_loader.js";

const FAMILIES = new Map([
  ["Courier", 2],
  ["Helvetica", 0],
  ["Times", 1],
]);

// Hellbox's request limit; it also keeps the PUA codes in plane 15.
const MAX_GLYPHS = 65534;

const PRIVATE_USE_START = 0xf0000;

/**
 * Generates substitutes for non-embedded standard and XFA fonts.
 */
class Hellbox {
  static #isLoaded = false;

  static #loadPromises = new WeakMap();

  static #pendingData = new WeakMap();

  /**
   * @param {object} context - Document handler and evaluator options.
   * @returns {Promise<boolean>} Whether the generator is available.
   */
  static async #load(context) {
    const { standardFontDataUrl, useWorkerFetch, wasmUrl } = context.options;
    if (useWorkerFetch && (!wasmUrl || !standardFontDataUrl)) {
      return false;
    }
    return (
      this.#isLoaded ||
      this.#loadPromises.getOrInsertComputed(context.handler, () =>
        WasmLoader.load(
          context,
          "hellbox_bg.wasm",
          "hellbox_nowasm_fallback.js",
          instantiate => {
            initJs(instantiate);
            this.#isLoaded = true;
          }
        )
      )
    );
  }

  /**
   * Load missing glyph data.
   * @param {object} context
   * @param {Array<string>} files
   */
  static #loadData(context, files) {
    const pending = this.#pendingData.getOrInsertComputed(
      context.handler,
      makeMap
    );
    return Promise.all(
      files.map(file => {
        if (hasData(file)) {
          return null;
        }
        return pending.getOrInsertComputed(file, () =>
          WasmLoader.fetch(context, "standardFontDataUrl", file)
            .then(data => {
              if (!hasData(file)) {
                setData(file, data);
              }
            })
            .finally(() => pending.delete(file))
        );
      })
    );
  }

  /**
   * Generate a replacement or fallback for a non-embedded standard font.
   * @param {object} context - Document handler and evaluator options.
   * @param {Font} font
   */
  static async generate(context, font) {
    const { standardFontName } = font;
    if (!standardFontName || font.vertical || font.cssFontInfo) {
      return;
    }
    const replacesFont =
      !font.systemFontInfo ||
      standardFontName === "Symbol" ||
      standardFontName === "ZapfDingbats";
    if (context.options.disableFontFace && !replacesFont) {
      return;
    }
    if (!(await this.#load(context))) {
      return;
    }
    const weight = font.black ? 900 : 0;
    const family = weight
      ? FAMILIES.get(standardFontName.split("-", 1)[0])
      : undefined;
    const italic = /Oblique|Italic/.test(standardFontName);
    const glyphs = font.getMissingFileGlyphs(replacesFont);
    const codePoints = Uint32Array.from(glyphs, glyph => glyph.codePoint);
    const lengths = new Uint32Array(codePoints.length).fill(1);
    try {
      const files =
        family === undefined
          ? standardFontDataFiles(standardFontName)
          : [
              ...fontDataFiles(family, false, false, 0, 0, 0),
              ...fontDataFiles(family, false, italic, weight, 0, 0),
            ];
      await this.#loadData(context, files);
      const missing = new Set(
        family === undefined
          ? missingStandardGlyphs(codePoints, lengths, standardFontName)
          : missingGlyphs(codePoints, lengths, family)
      );
      const available = glyphs
        .filter((_, i) => !missing.has(i))
        .slice(0, MAX_GLYPHS);
      if (available.length === 0) {
        return;
      }
      const toFontChar = new Map();
      const mappedCodePoints = new Set();
      let privateUseCode = PRIVATE_USE_START;
      const fontCharCodes = Uint32Array.from(
        available,
        ({ codePoint, charCodes }) => {
          if (!mappedCodePoints.has(codePoint)) {
            mappedCodePoints.add(codePoint);
            return codePoint;
          }
          for (const charCode of charCodes) {
            toFontChar.set(charCode, privateUseCode);
          }
          return privateUseCode++;
        }
      );
      const args = [
        Uint32Array.from(available, glyph => glyph.codePoint),
        lengths.subarray(0, available.length),
        Float64Array.from(available, glyph => glyph.width ?? NaN),
        fontCharCodes,
      ];
      const data =
        family === undefined
          ? generateStandardFont(...args, standardFontName)
          : generateFont(...args, family, false, italic, weight, 0, 0, 0);
      font.setGeneratedFont(
        { data, codePoints: fontCharCodes, toFontChar },
        replacesFont
      );
    } catch (ex) {
      warn(`Hellbox.generate - "${font.name}": "${ex}".`);
    }
  }

  /**
   * Generate an XFA substitute with Unicode-based widths.
   * @param {object} context - Document handler and evaluator options.
   * @param {string} standardFontName
   * @param {Array} widths - Unicode-based PDF `W` array.
   * @returns {Promise<Uint8Array | null>}
   */
  static async generateXfaFont(context, standardFontName, widths) {
    if (!(await this.#load(context))) {
      return null;
    }
    try {
      await this.#loadData(context, standardFontDataFiles(standardFontName));
      const widthByCodePoint = new Map();
      for (let i = 0, ii = widths.length - 1; i < ii; i += 2) {
        const start = widths[i];
        for (const [j, width] of widths[i + 1].entries()) {
          widthByCodePoint.set(start + j, width);
        }
      }
      const codePoints = standardFontCodePoints(standardFontName);
      return generateStandardFont(
        codePoints,
        new Uint32Array(codePoints.length).fill(1),
        Float64Array.from(codePoints, cp => widthByCodePoint.get(cp) ?? NaN),
        new Uint32Array(0),
        standardFontName
      );
    } catch (ex) {
      warn(`Hellbox.generateXfaFont - "${standardFontName}": "${ex}".`);
      return null;
    }
  }
}

export { Hellbox };
